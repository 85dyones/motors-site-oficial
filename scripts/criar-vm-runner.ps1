# Cria no Hyper-V a maquina virtual do runner do CI (Ubuntu Server 24.04).
# Ver "Maquina virtual no Windows (Hyper-V)" em docs/RUNNER_DO_CI.md.
#
# Rode no PowerShell COMO ADMINISTRADOR, na pasta onde salvou este arquivo:
#   powershell -ExecutionPolicy Bypass -File .\criar-vm-runner.ps1
#
# O que faz:
#   - confere o Hyper-V (Windows Pro/Enterprise/Education) e liga se faltar;
#   - desliga a tarefa "Runner do CI" do WSL, se existir (a VM a substitui);
#   - deixa o Windows sem suspender na tomada, nem com a tampa fechada;
#   - baixa o Ubuntu Server 24.04 mais recente e confere o SHA-256;
#   - cria a VM com memoria fixa (a do computador menos 3 GB), os nucleos
#     menos 1, disco de 80 GB e a rede "Default Switch";
#   - faz a VM ligar sozinha quando o Windows liga, sem ninguem entrar na conta;
#   - liga a VM e abre a janela dela para a instalacao do Ubuntu.
# Nao apaga nada: se a VM ja existe, para e avisa.
#
# Mensagens sem acento de proposito: o PowerShell 5.1 le .ps1 sem BOM como
# ANSI.

param(
  [string]$Nome = "motors-ci",
  [string]$Pasta = "C:\VMs",
  [int]$DiscoGB = 80
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Passo($texto) { Write-Host "`n== $texto" -ForegroundColor Cyan }
function Falha($texto) { Write-Host "`nERRO: $texto" -ForegroundColor Red; exit 1 }

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Falha "Abra o PowerShell como administrador (botao direito > Executar como administrador)." }

Passo "1/6 Hyper-V"
$hv = $null
try { $hv = Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All } catch { }
if (-not $hv) {
  $edicao = (Get-CimInstance Win32_OperatingSystem).Caption
  Falha "Este Windows ($edicao) nao tem Hyper-V (o Home nao tem). Nada foi alterado. Siga com o WSL2 e o preparar-windows-runner.ps1 (docs/RUNNER_DO_CI.md, 'Windows (WSL2)', passo 5)."
}
if ($hv.State -ne "Enabled") {
  Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -All -NoRestart | Out-Null
  Write-Host "Hyper-V ligado. REINICIE o Windows e rode este script de novo." -ForegroundColor Yellow
  exit 0
}
Import-Module Hyper-V
if (Get-VM -Name $Nome -ErrorAction SilentlyContinue) {
  Falha "Ja existe uma VM chamada '$Nome'. Nada foi alterado. Para recomecar, apague-a no Gerenciador do Hyper-V."
}
if (-not (Get-VMSwitch -Name "Default Switch" -ErrorAction SilentlyContinue)) {
  Falha "Nao achei a rede 'Default Switch' do Hyper-V. Reinicie o Windows e tente de novo."
}

Passo "2/6 Runner antigo do WSL"
$tarefa = Get-ScheduledTask -TaskName "Runner do CI" -ErrorAction SilentlyContinue
if ($tarefa) {
  Stop-ScheduledTask -TaskName "Runner do CI" -ErrorAction SilentlyContinue
  Disable-ScheduledTask -TaskName "Runner do CI" | Out-Null
  # Saida de erro de programa externo vira excecao com "Stop" no PowerShell 5.1.
  $antes = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  wsl.exe --shutdown 2>&1 | Out-Null
  $ErrorActionPreference = $antes
  Write-Host "Tarefa 'Runner do CI' desligada. A VM registra as instancias por cima, com os mesmos nomes."
} else {
  Write-Host "Nenhuma tarefa do WSL para desligar."
}

Passo "3/6 Windows sem suspender na tomada"
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null
# Fechar a tampa na tomada: nao fazer nada (0).
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0 | Out-Null
powercfg /setactive SCHEME_CURRENT | Out-Null
Write-Host "Na tomada, o Windows nao suspende nem com a tampa fechada. Deixe o notebook sempre na tomada."

Passo "4/6 Ubuntu Server 24.04"
$dir = Join-Path $Pasta $Nome
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$base = "https://releases.ubuntu.com/noble"
$somas = curl.exe -fsSL "$base/SHA256SUMS"
if ($LASTEXITCODE -ne 0) { Falha "Nao consegui ler $base/SHA256SUMS. Confira a internet e rode de novo." }
# A lista traz varias versoes 24.04.x: fica a mais recente.
$imagem = $somas | ForEach-Object {
  if ($_.Trim() -match "^([0-9a-f]{64}) \*?(ubuntu-(24\.04(\.\d+)*)-live-server-amd64\.iso)$") {
    [pscustomobject]@{ Hash = $Matches[1]; Arquivo = $Matches[2]; Versao = [version]$Matches[3] }
  }
} | Sort-Object Versao | Select-Object -Last 1
if (-not $imagem) { Falha "Nao achei a imagem do Ubuntu Server em $base/SHA256SUMS." }
$hashEsperado = $imagem.Hash
$arquivo = $imagem.Arquivo
$iso = Join-Path $dir $arquivo
if ((Test-Path $iso) -and ((Get-FileHash $iso -Algorithm SHA256).Hash -eq $hashEsperado.ToUpper())) {
  Write-Host "Imagem ja baixada e conferida: $arquivo"
} else {
  Write-Host "Baixando $arquivo (cerca de 3 GB)..."
  curl.exe -L --fail --retry 3 -o $iso "$base/$arquivo"
  if ($LASTEXITCODE -ne 0) { Falha "O download falhou. Rode o script de novo; ele recomeca daqui." }
  if ((Get-FileHash $iso -Algorithm SHA256).Hash -ne $hashEsperado.ToUpper()) {
    Remove-Item $iso
    Falha "A imagem baixada nao confere com o SHA-256 oficial. Apaguei o arquivo; rode de novo."
  }
  Write-Host "Imagem conferida pelo SHA-256 oficial."
}

Passo "5/6 Criando a VM '$Nome'"
# Um notebook de 8 GB mostra ~7,8 GB (a placa de video reserva um pouco).
$memTotalGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
$memVmGB = [math]::Max(4, $memTotalGB - 3)
$nucleos = (Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum
$cpuVm = [math]::Max(2, $nucleos - 1)
$vhd = Join-Path $dir "$Nome.vhdx"
New-VM -Name $Nome -Generation 2 -MemoryStartupBytes ([int64]$memVmGB * 1GB) `
  -NewVHDPath $vhd -NewVHDSizeBytes ([int64]$DiscoGB * 1GB) -SwitchName "Default Switch" -Path $Pasta | Out-Null
Set-VMMemory -VMName $Nome -DynamicMemoryEnabled $false
Set-VMProcessor -VMName $Nome -Count $cpuVm
# O Ubuntu precisa deste modelo de Secure Boot em VM de geracao 2.
Set-VMFirmware -VMName $Nome -EnableSecureBoot On -SecureBootTemplate MicrosoftUEFICertificateAuthority
Add-VMDvdDrive -VMName $Nome -Path $iso
# Disco antes do DVD: vazio, ele cai no instalador; instalado, inicia pelo disco.
Set-VMFirmware -VMName $Nome -BootOrder (Get-VMHardDiskDrive -VMName $Nome), (Get-VMDvdDrive -VMName $Nome)
# Liga junto com o Windows, sem ninguem entrar na conta; desliga com ele.
Set-VM -Name $Nome -AutomaticStartAction Start -AutomaticStartDelay 30 -AutomaticStopAction ShutDown `
  -CheckpointType Disabled
Write-Host "VM criada: $memVmGB GB de memoria, $cpuVm nucleos, disco de $DiscoGB GB, rede Default Switch."

Passo "6/6 Ligando a VM"
try { Start-VM -Name $Nome } catch {
  Write-Host $_.Exception.Message
  Falha "A VM nao ligou. Causas comuns: virtualizacao desligada na BIOS (Intel VT-x ou AMD-V) ou pouca memoria livre (feche programas). Depois rode: Start-VM $Nome"
}
Start-Process vmconnect.exe -ArgumentList "localhost", $Nome
Write-Host @"

Na janela da VM, instale o Ubuntu (docs/RUNNER_DO_CI.md, passo 3):
  - teclado Portuguese (Brazil);
  - disco: usar o disco inteiro e DESMARCAR "Set up this disk as an LVM group";
  - nome do servidor $Nome; usuario e senha seus;
  - marque Install OpenSSH server, sem importar chave;
  - sem pacotes extras. No fim, Reboot Now (e Enter se pedir para tirar a midia).
Depois entre na VM, anote o IP (IPv4 address for eth0) e siga o passo 4 do documento.
"@
