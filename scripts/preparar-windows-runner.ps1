# Prepara o Windows de um notebook dedicado ao CI, com o runner no WSL2.
# Ver "Windows (WSL2)" em docs/RUNNER_DO_CI.md. Serve ao Windows Home, que nao
# tem Hyper-V.
#
# Rode no PowerShell COMO ADMINISTRADOR, na pasta onde salvou este arquivo e o
# instalar-runner-wsl.sh:
#   powershell -ExecutionPolicy Bypass -File .\preparar-windows-runner.ps1
#
# O que faz:
#   - acha o Ubuntu do WSL com o runner (pela tarefa "Runner do CI" ou
#     procurando em cada distribuicao). Sem runner, oferece instalar o Ubuntu e
#     registrar as instancias da motors-site-oficial;
#   - da ao WSL a memoria do notebook menos 3 GB, os nucleos menos 1 e 4 GB de
#     swap;
#   - deixa o Windows sem suspender na tomada, nem com a tampa fechada;
#   - grava a tarefa "Runner do CI" e outra que bloqueia a tela logo depois de
#     entrar;
#   - liga o login automatico com o Autologon da Microsoft (Sysinternals): a
#     senha e digitada na janela dele e fica guardada cifrada pelo Windows;
#   - oferece registrar as instancias da motors-plataforma;
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
# Saida de erro de programa externo vira excecao com "Stop" no PowerShell 5.1:
# as chamadas ao wsl.exe trocam para "Continue" enquanto rodam.
# Roda o wsl.exe sem mostrar a saida e devolve o codigo de saida.
function NoWsl([string[]]$argumentos) {
  $antes = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  & wsl.exe @argumentos 2>&1 | Out-Null
  $codigo = $LASTEXITCODE
  $ErrorActionPreference = $antes
  return $codigo
}
# Roda o wsl.exe direto no console (perguntas e senhas aparecem e sao
# respondidas ali) e devolve o codigo de saida. Os argumentos nao podem ter
# espaco: o Start-Process do PowerShell 5.1 nao os poe entre aspas.
function NoWslNaTela([string[]]$argumentos) {
  $p = Start-Process -FilePath "wsl.exe" -ArgumentList $argumentos -NoNewWindow -PassThru
  $null = $p.Handle  # sem isto o ExitCode pode voltar vazio
  $p.WaitForExit()
  return $p.ExitCode
}
# Distribuicoes do WSL deste usuario. Conforme a versao, o wsl.exe escreve em
# UTF-16 ou em UTF-8: ficar so com os caracteres imprimiveis serve aos dois.
function Distribuicoes {
  $env:WSL_UTF8 = "1"
  $antes = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  $saida = & wsl.exe -l -q 2>&1
  $codigo = $LASTEXITCODE
  $ErrorActionPreference = $antes
  if ($codigo -ne 0) { return @() }
  return @($saida | ForEach-Object { ("$_" -replace '[^\x21-\x7E]', "") } | Where-Object { $_ })
}
# Distribuicoes que o WSL sabe instalar (wsl -l -o), uma por linha, com o nome
# na frente.
function ListaOnline {
  $env:WSL_UTF8 = "1"
  $antes = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  $saida = & wsl.exe -l -o 2>&1
  $ErrorActionPreference = $antes
  return @($saida | ForEach-Object { "$_" -replace '[^\x20-\x7E]', "" })
}
# Roda um comando no WSL e devolve a saida, so com caracteres imprimiveis.
function SaidaWsl([string[]]$argumentos) {
  $antes = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  $saida = & wsl.exe @argumentos 2>$null
  $ErrorActionPreference = $antes
  return ((@($saida) -join " ") -replace '[^\x20-\x7E]', "").Trim()
}
function TemRunner($d) {
  (NoWsl @("-d", $d, "-u", "runner", "-e", "test", "-x", "/home/runner/iniciar-runners.sh")) -eq 0
}
# Copia o instalar-runner-wsl.sh para a pasta do usuario no WSL (em base64,
# sem depender do \\wsl$) e o roda para um repositorio. O token e digitado
# la, sem aparecer.
function RegistraNoWsl($repo, $instancias) {
  $origem = Join-Path $PSScriptRoot "instalar-runner-wsl.sh"
  if (-not (Test-Path $origem)) {
    Falha "Falta o instalar-runner-wsl.sh nesta pasta. Baixe-o do GitHub (Download raw file) para a mesma pasta deste script e rode de novo."
  }
  $quem = @("-d", $Distro)
  if ($usuarioLinux) { $quem += @("-u", $usuarioLinux) }
  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($origem))
  if ((NoWsl ($quem + @("--cd", "~", "-e", "bash", "-c", "echo $b64 | base64 -d > instalar-runner-wsl.sh"))) -ne 0) {
    Falha "Nao consegui copiar o instalar-runner-wsl.sh para o WSL ($Distro)."
  }
  Write-Host "Deixe aberta a tela do token: $repo > Settings > Actions > Runners > New self-hosted runner (Linux)."
  Write-Host "Quando perguntar quantas instancias, responda $instancias. A senha pedida (sudo) e a do seu usuario do Ubuntu."
  return (NoWslNaTela ($quem + @("--cd", "~", "-e", "bash", "instalar-runner-wsl.sh", $repo))) -eq 0
}

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Falha "Abra o PowerShell como administrador (botao direito > Executar como administrador)." }
$usuario = "$env:USERDOMAIN\$env:USERNAME"
$tarefa = "Runner do CI"
# Usuario de administracao do Ubuntu criado por este script (so quando faltava).
$usuarioLinux = $null

Passo "1/6 Runner no WSL"
Write-Host "Usuario do Windows: $usuario"
$distros = Distribuicoes
Write-Host ("Distribuicoes do WSL: " + $(if ($distros.Count) { $distros -join ", " } else { "nenhuma" }))
if (-not $PSBoundParameters.ContainsKey("Distro")) {
  # A tarefa ja criada diz em que distribuicao o runner foi instalado.
  $existente = Get-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue
  if ($existente -and ("$($existente.Actions[0].Arguments)" -match '-d\s+(\S+)') -and ($distros -contains $Matches[1])) {
    $Distro = $Matches[1]
  }
}
$achou = ($distros -contains $Distro) -and (TemRunner $Distro)
if (-not $achou -and -not $PSBoundParameters.ContainsKey("Distro")) {
  $outra = $distros | Where-Object { $_ -ne $Distro -and $_ -notlike "docker-desktop*" } |
    Where-Object { TemRunner $_ } | Select-Object -First 1
  if ($outra) { $Distro = $outra; $achou = $true }
}
if ($achou) {
  Write-Host "Runner encontrado em $Distro."
} else {
  Write-Host "Nao achei o runner em nenhuma distribuicao do WSL deste usuario."
  # Um Ubuntu ja instalado (o "wsl --install" cria o "Ubuntu") serve: nao instala outro.
  if (-not $PSBoundParameters.ContainsKey("Distro") -and -not ($distros -contains $Distro)) {
    $ubuntu = $distros | Where-Object { $_ -like "Ubuntu*" } | Select-Object -First 1
    if ($ubuntu) { $Distro = $ubuntu }
  }
  $instalada = $distros -contains $Distro
  if ($instalada) {
    Write-Host "Vou usar o $Distro, ja instalado. O runner desliga nele o acesso ao disco C: e aos programas do Windows."
    $resposta = Read-Host "Instalar o runner no ${Distro}? (s/n)"
  } else {
    $resposta = Read-Host "Instalar o $Distro e o runner nele? (s/n)"
  }
  if ($resposta -notmatch '^[sS]') {
    Falha "Nada foi alterado. Para usar outra distribuicao, rode com -Distro <nome>."
  }
  if (-not $instalada) {
    # Recursos do Windows que o WSL2 usa. Faltando algum, liga e pede para reiniciar.
    $faltam = @("Microsoft-Windows-Subsystem-Linux", "VirtualMachinePlatform") | Where-Object {
      (Get-WindowsOptionalFeature -Online -FeatureName $_).State -ne "Enabled"
    }
    if ($faltam) {
      foreach ($recurso in $faltam) {
        Enable-WindowsOptionalFeature -Online -FeatureName $recurso -All -NoRestart | Out-Null
      }
      Write-Host "Liguei $($faltam -join ' e '). REINICIE o Windows e rode este script de novo." -ForegroundColor Yellow
      exit 0
    }
    # Com os recursos ligados e sem hipervisor rodando, a virtualizacao esta desligada na BIOS.
    $hipervisor = (Get-CimInstance Win32_ComputerSystem).HypervisorPresent
    $vtNaBios = (Get-CimInstance Win32_Processor | Select-Object -First 1).VirtualizationFirmwareEnabled
    if (-not $hipervisor -and $vtNaBios -eq $false) {
      Falha "A virtualizacao esta desligada na BIOS, e o WSL2 precisa dela. Ligue 'Intel Virtualization Technology' (ou AMD-V/SVM) na BIOS e rode de novo. Nos Lenovo, a BIOS abre com F1 ou F2 ao ligar, ou pelo botao Novo."
    }
    # O WSL que vem com o Windows pode ser antigo e nao conhecer as versoes novas do Ubuntu.
    Write-Host "Atualizando o WSL..."
    NoWslNaTela @("--update") | Out-Null
    $online = ListaOnline
    if (-not ($online -match "^\s*$([regex]::Escape($Distro))\s") -and ($online -match '^\s*Ubuntu\s')) {
      Write-Host "O WSL nao oferece $Distro com esse nome; instalo o Ubuntu (a LTS mais recente)."
      $Distro = "Ubuntu"
    }
    Write-Host "Instalando o $Distro. Ele pede um usuario e uma senha novos (os de administracao do Ubuntu, nao os do Windows)."
    Write-Host "Quando aparecer o prompt do Ubuntu (termina em `$), digite exit e Enter para voltar aqui."
    NoWslNaTela @("--install", "-d", $Distro) | Out-Null
    if (-not ((Distribuicoes) -contains $Distro)) {
      Write-Host "Tentando de novo, baixando direto do GitHub..."
      NoWslNaTela @("--install", "-d", $Distro, "--web-download") | Out-Null
    }
    if (-not ((Distribuicoes) -contains $Distro)) {
      Falha "O Ubuntu nao foi instalado. Se o Windows pediu para reiniciar, reinicie e rode de novo; senao, anote a mensagem de erro acima."
    }
  }
  # O runner precisa do WSL 2 (memoria do .wslconfig, systemd).
  if ((SaidaWsl @("-d", $Distro, "-e", "uname", "-r")) -notmatch "WSL2|microsoft-standard") {
    Write-Host "O $Distro esta no WSL 1. Convertendo para o WSL 2 (leva alguns minutos)..."
    NoWslNaTela @("--set-version", $Distro, "2") | Out-Null
    if ((SaidaWsl @("-d", $Distro, "-e", "uname", "-r")) -notmatch "WSL2|microsoft-standard") {
      Falha "Nao consegui passar o $Distro para o WSL 2. Rode 'wsl --set-version $Distro 2' e veja a mensagem."
    }
  }
  # Ubuntu instalado sem criar o usuario entra como root, e o instalador do runner
  # nao roda como root: cria o usuario de administracao.
  if ((SaidaWsl @("-d", $Distro, "-e", "id", "-u")) -eq "0") {
    Write-Host "O $Distro esta sem usuario de administracao (entra como root)."
    do {
      $usuarioLinux = Read-Host "Nome do usuario a criar no Ubuntu (minusculas, sem espaco)"
    } until ($usuarioLinux -cmatch '^[a-z][a-z0-9_-]{0,31}$' -and $usuarioLinux -notin @("root", "runner"))
    if ((NoWsl @("-d", $Distro, "-u", "root", "-e", "id", "-u", $usuarioLinux)) -ne 0) {
      Write-Host "Defina a senha dele (e a senha do sudo). Nas perguntas de nome e telefone, so Enter."
      if ((NoWslNaTela @("-d", $Distro, "-u", "root", "-e", "adduser", $usuarioLinux)) -ne 0) {
        Falha "Nao consegui criar o usuario $usuarioLinux no $Distro."
      }
    }
    NoWsl @("-d", $Distro, "-u", "root", "-e", "usermod", "-aG", "sudo", $usuarioLinux) | Out-Null
  }
  if (-not (RegistraNoWsl "motors-site-oficial" 2) -or -not (TemRunner $Distro)) {
    Falha "O registro da motors-site-oficial nao terminou. Rode o script de novo (o token vale 1 hora; gere outro se precisar)."
  }
  Write-Host "Runner da motors-site-oficial instalado em $Distro."
}

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
# Gravadas de novo a cada execucao, para apontarem para a distribuicao certa.
$acao = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\wsl.exe" -Argument "-d $Distro -u runner -- /home/runner/iniciar-runners.sh"
$gatilho = New-ScheduledTaskTrigger -AtLogOn -User $usuario
$ajustes = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Stop-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $tarefa -Action $acao -Trigger $gatilho -Settings $ajustes -User $usuario -Force | Out-Null
Write-Host "Tarefa '$tarefa': sobe os runners do $Distro quando $usuario entra."
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
if ((NoWsl @("-d", $Distro, "-u", "runner", "-e", "test", "-d", "/home/runner/actions-runner-motors-plataforma-1")) -eq 0) {
  Write-Host "Instancias da motors-plataforma ja registradas."
} else {
  $resposta = Read-Host "Registrar agora as instancias da motors-plataforma? (s/n)"
  if ($resposta -match '^[sS]') {
    if (-not (RegistraNoWsl "motors-plataforma" 1)) {
      Aviso "o registro da motors-plataforma nao terminou. Rode o script de novo para tentar outra vez."
    }
  }
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
