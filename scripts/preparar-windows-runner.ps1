# Prepara o Windows de um notebook dedicado ao CI, com o runner no WSL2.
# Ver "Windows (WSL2)", passo 5, em docs/RUNNER_DO_CI.md. Serve ao Windows Home,
# que nao tem Hyper-V.
#
# Rode no PowerShell COMO ADMINISTRADOR, na pasta onde salvou este arquivo:
#   powershell -ExecutionPolicy Bypass -File .\preparar-windows-runner.ps1
#
# O que faz:
#   - confere o runner no Ubuntu do WSL (passos 1 a 3 do documento);
#   - da ao WSL a memoria do notebook menos 3 GB, os nucleos menos 1 e 4 GB de
#     swap;
#   - deixa o Windows sem suspender na tomada, nem com a tampa fechada;
#   - cria a tarefa "Runner do CI", se faltar, e outra que bloqueia a tela logo
#     depois de entrar;
#   - liga o login automatico com o Autologon da Microsoft (Sysinternals): a
#     senha e digitada na janela dele e fica guardada cifrada pelo Windows;
#   - com instalar-runner-wsl.sh na mesma pasta, oferece registrar as instancias
#     da motors-plataforma;
#   - reinicia o WSL e os runners.
# Rodar de novo e seguro.
#
# Mensagens sem acento de proposito: o PowerShell 5.1 le .ps1 sem BOM como
# ANSI.

param(
  [string]$Distro = "Ubuntu-24.04"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Passo($texto) { Write-Host "`n== $texto" -ForegroundColor Cyan }
function Falha($texto) { Write-Host "`nERRO: $texto" -ForegroundColor Red; exit 1 }
function Aviso($texto) { Write-Host "AVISO: $texto" -ForegroundColor Yellow }
# Roda o wsl.exe sem mostrar a saida e devolve o codigo de saida. Saida de erro
# de programa externo vira excecao com "Stop" no PowerShell 5.1.
function NoWsl([string[]]$argumentos) {
  $antes = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  & wsl.exe @argumentos 2>&1 | Out-Null
  $codigo = $LASTEXITCODE
  $ErrorActionPreference = $antes
  return $codigo
}

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Falha "Abra o PowerShell como administrador (botao direito > Executar como administrador)." }
$usuario = "$env:USERDOMAIN\$env:USERNAME"
$tarefa = "Runner do CI"

Passo "1/6 Runner no WSL ($Distro)"
if ((NoWsl @("-d", $Distro, "-u", "runner", "-e", "test", "-x", "/home/runner/iniciar-runners.sh")) -ne 0) {
  Falha "Nao achei o runner no Ubuntu do WSL ($Distro). Siga antes os passos 1 a 3 de 'Windows (WSL2)' em docs/RUNNER_DO_CI.md."
}
Write-Host "Runner encontrado."

Passo "2/6 Memoria e nucleos do WSL"
# Um notebook de 8 GB mostra ~7,8 GB (a placa de video reserva um pouco).
$memTotalGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
$memWslGB = [math]::Max(4, $memTotalGB - 3)
$nucleos = (Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum
$cpuWsl = [math]::Max(2, $nucleos - 1)
$valores = [ordered]@{ memory = "${memWslGB}GB"; processors = "$cpuWsl"; swap = "4GB" }
# Troca so memory, processors e swap da secao [wsl2]; o resto do arquivo fica.
$arquivo = Join-Path $env:USERPROFILE ".wslconfig"
$linhas = @()
if (Test-Path $arquivo) { $linhas = @(Get-Content $arquivo) }
$saida = New-Object System.Collections.Generic.List[string]
$feitos = @{}
$secao = ""
$temWsl2 = $false
function CompletaWsl2 {
  foreach ($k in $valores.Keys) {
    if (-not $feitos[$k]) { $saida.Add("$k=$($valores[$k])"); $feitos[$k] = $true }
  }
}
foreach ($l in $linhas) {
  if ($l -match '^\s*\[(.+)\]\s*$') {
    if ($secao -eq "wsl2") { CompletaWsl2 }
    $secao = $Matches[1].Trim().ToLower()
    if ($secao -eq "wsl2") { $temWsl2 = $true }
    $saida.Add($l)
    continue
  }
  if ($secao -eq "wsl2" -and $l -match '^\s*([A-Za-z]+)\s*=') {
    $k = $Matches[1].ToLower()
    if ($valores.Contains($k)) {
      if (-not $feitos[$k]) { $saida.Add("$k=$($valores[$k])"); $feitos[$k] = $true }
      continue
    }
  }
  $saida.Add($l)
}
if ($secao -eq "wsl2") { CompletaWsl2 }
if (-not $temWsl2) { $saida.Add("[wsl2]"); CompletaWsl2 }
Set-Content -Encoding ascii -Path $arquivo -Value $saida
Write-Host "WSL com $memWslGB GB de memoria, $cpuWsl nucleos e 4 GB de swap ($arquivo)."

Passo "3/6 Windows sem suspender na tomada"
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null
# Fechar a tampa na tomada: nao fazer nada (0).
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0 | Out-Null
powercfg /setactive SCHEME_CURRENT | Out-Null
Write-Host "Na tomada, o Windows nao suspende nem com a tampa fechada. Deixe o notebook sempre na tomada."

Passo "4/6 Tarefas que sobem os runners e bloqueiam a tela"
if (Get-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue) {
  Enable-ScheduledTask -TaskName $tarefa | Out-Null
  Write-Host "Tarefa '$tarefa' ja existe e esta ligada."
} else {
  $acao = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\wsl.exe" -Argument "-d $Distro -u runner -- /home/runner/iniciar-runners.sh"
  $gatilho = New-ScheduledTaskTrigger -AtLogOn -User $usuario
  $ajustes = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $tarefa -Action $acao -Trigger $gatilho -Settings $ajustes -User $usuario | Out-Null
  Write-Host "Tarefa '$tarefa' criada."
}
# Com o login automatico, quem abrir a tampa encontra a tela bloqueada.
$acao = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\rundll32.exe" -Argument "user32.dll,LockWorkStation"
$gatilho = New-ScheduledTaskTrigger -AtLogOn -User $usuario
$gatilho.Delay = "PT20S"
Register-ScheduledTask -TaskName "Bloquear tela do CI" -Action $acao -Trigger $gatilho -User $usuario -Force | Out-Null
Write-Host "Tarefa 'Bloquear tela do CI': a tela bloqueia 20 segundos depois de entrar."

Passo "5/6 Login automatico"
$winlogon = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
function LoginAutomatico { (Get-ItemProperty $winlogon -ErrorAction SilentlyContinue).AutoAdminLogon -eq "1" }
if (LoginAutomatico) {
  Write-Host "Ja esta ligado, para $((Get-ItemProperty $winlogon).DefaultUserName)."
} else {
  # Windows 11: com "so Windows Hello para contas Microsoft", o login automatico nao funciona.
  $hello = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\PasswordLess\Device"
  if ((Get-ItemProperty $hello -ErrorAction SilentlyContinue).DevicePasswordLessBuildVersion -eq 2) {
    Set-ItemProperty -Path $hello -Name DevicePasswordLessBuildVersion -Value 0 -Type DWord
    Write-Host "Desliguei 'permitir apenas o Windows Hello para contas Microsoft', que impede o login automatico."
  }
  $pasta = Join-Path $env:ProgramData "Autologon"
  New-Item -ItemType Directory -Force -Path $pasta | Out-Null
  $zip = Join-Path $pasta "AutoLogon.zip"
  curl.exe -fsSL -o $zip "https://download.sysinternals.com/files/AutoLogon.zip"
  if ($LASTEXITCODE -ne 0) { Falha "Nao consegui baixar o Autologon. Confira a internet e rode de novo." }
  Expand-Archive -Force -Path $zip -DestinationPath $pasta
  $exe = @("Autologon64.exe", "Autologon.exe") | ForEach-Object { Join-Path $pasta $_ } |
    Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $exe) { Falha "O pacote do Autologon veio sem o programa. Rode de novo." }
  $assinatura = Get-AuthenticodeSignature $exe
  if ($assinatura.Status -ne "Valid" -or $assinatura.SignerCertificate.Subject -notmatch "O=Microsoft Corporation") {
    Remove-Item -Recurse -Force $pasta
    Falha "O Autologon baixado nao tem a assinatura da Microsoft. Apaguei os arquivos; nada foi ligado."
  }
  Write-Host @"
Vai abrir o Autologon (Microsoft Sysinternals). Nele:
  - aceite os termos (Agree);
  - Username: o seu usuario. Conta Microsoft (entra com e-mail): o e-mail;
  - Password: a senha da conta (nao o PIN);
  - clique em Enable e feche a janela.
"@
  Start-Process -FilePath $exe -Wait
  if (LoginAutomatico) {
    Write-Host "Login automatico ligado."
  } else {
    Aviso "o login automatico nao ficou ligado. Rode o script de novo, ou siga sem ele: depois de reiniciar, os runners so voltam quando alguem entrar."
  }
}

Passo "6/6 Plataforma e reinicio dos runners"
$plataforma = Join-Path $PSScriptRoot "instalar-runner-wsl.sh"
$temPlataforma = (NoWsl @("-d", $Distro, "-u", "runner", "-e", "test", "-d", "/home/runner/actions-runner-motors-plataforma-1")) -eq 0
if ($temPlataforma) {
  Write-Host "Instancias da motors-plataforma ja registradas."
} elseif (Test-Path $plataforma) {
  Write-Host "Para registrar a motors-plataforma, deixe aberta a tela do token: motors-plataforma > Settings > Actions > Runners > New self-hosted runner."
  $resposta = Read-Host "Registrar agora as instancias da motors-plataforma? (s/n)"
  if ($resposta -match '^[sS]') {
    try {
      Copy-Item -Force $plataforma "\\wsl$\$Distro\tmp\instalar-runner-wsl.sh"
    } catch {
      Falha "Nao consegui copiar o instalar-runner-wsl.sh para o WSL: $($_.Exception.Message)"
    }
    Write-Host "Quando perguntar quantas instancias, responda 1. A senha pedida e a do seu usuario do Ubuntu."
    $antes = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    & wsl.exe -d $Distro -e bash /tmp/instalar-runner-wsl.sh motors-plataforma
    $codigo = $LASTEXITCODE
    $ErrorActionPreference = $antes
    if ($codigo -ne 0) { Aviso "o registro da motors-plataforma falhou. Rode o script de novo para tentar outra vez." }
  }
} else {
  Write-Host "Sem instalar-runner-wsl.sh nesta pasta: a motors-plataforma fica para depois."
}
Write-Host "Reiniciando o WSL e os runners (job em andamento e interrompido)..."
Stop-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue
NoWsl @("--shutdown") | Out-Null
Start-ScheduledTask -TaskName $tarefa

Write-Host @"

Pronto. Confira em cada repositorio: Settings > Actions > Runners (as instancias aparecem como Idle).
A partir de agora o notebook liga, entra sozinho na conta, sobe os runners e bloqueia a tela.
Deixe minimizada a janela do terminal que a tarefa '$tarefa' abre: fecha-la desliga os runners.
"@
