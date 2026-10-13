# Runner próprio do CI

Decisão SaaS-6 do `motors-handoff/HANDOFF.md` (2026-10-12): o repositório fica privado e o CI
(`.github/workflows/testes.yml`) roda num runner próprio. O plano era começar pelo VPS KVM 4 da
Hostinger e passar depois para o computador de casa do dono. Em 12/10 o dono antecipou a etapa 2,
com Windows e WSL2. **Em 13/10 decidiu dedicar esse notebook ao CI, seguindo com o Windows Home e o
WSL2**: o notebook entra sozinho na conta e sobe os runners (seção "Windows (WSL2)", passo 5). A VM
do Hyper-V (só no Windows Pro), o notebook só com Ubuntu e o VPS ficam como alternativas. Quando o
runner está desligado, o CI vai sozinho para os servidores do GitHub.

## Por quê

Em repositório público o runner padrão do GitHub é grátis e tem 4 vCPU e 16 GB. No privado ele
encolhe para 2 vCPU e 7–8 GB e os minutos passam a contar: o GitHub Pro inclui 3.000 por mês e o
excedente é cobrado por minuto.

Medido no histórico do Actions entre 17/09 e 10/10: 1.004 execuções, cerca de 44 por dia. Uma
execução completa custaria cerca de 9 minutos cobráveis (os 5 jobs arredondados para cima, cada um
no seu minuto). São perto de 12 mil minutos por mês, quatro vezes o que o Pro inclui.

Runner próprio não consome minutos. O GitHub anunciou em 16/12/2025 uma taxa de US$ 0,002 por
minuto também para runner próprio e suspendeu o anúncio dois dias depois; em 10/2026 ela seguia
sem data. Se voltar, o volume acima custaria perto de US$ 24 por mês.

## Quanto o CI pesa

Medido em 12/10 numa máquina de 4 vCPU e 16 GB:

| Job | Tempo | Pico de memória |
|---|---|---|
| `build` (`next build`) | 50 s | 2,5 GB |
| `vitest` com 2 processos (`--maxWorkers=2`) | 128 s | 1 GB |
| `tipos` e `lint` | menos de 1 min cada | menos que o `build` |
| `deploy-vercel` | só espera a Vercel | quase nada |

Cada instância de runner roda um job por vez: com uma instância, os 5 jobs de uma execução entram
em fila e ela leva perto de 7 a 8 minutos. No runner próprio o workflow já limita o `vitest` a 2
processos (`runner.environment == 'self-hosted'`).

## Como o workflow escolhe a máquina

O primeiro job, `maquina`, roda sempre no GitHub e decide onde rodam os outros cinco:

| Situação | Onde rodam os jobs |
|---|---|
| Repositório público | GitHub, sempre |
| Variável `RUNNER_CI` vazia | GitHub |
| Segredo `RUNNERS_TOKEN` ausente, vencido ou sem permissão | GitHub, com aviso na execução |
| Nenhuma instância com o rótulo de `RUNNER_CI` ligada | GitHub |
| Pelo menos uma instância ligada | Runner próprio |
| O GitHub não dá máquina nem para o `maquina` (minutos acabados ou cobrança travada) e `RUNNER_CI` está preenchida | Runner próprio, direto |

O job `maquina` custa 1 minuto por execução no repositório privado: perto de 1.300 por mês, dentro
dos 3.000 do Pro. As execuções que caem no GitHub porque o runner estava desligado gastam os ~9
minutos de uma execução completa cada.

Repositório público usa sempre o GitHub de propósito: runner próprio em repositório público executa
o código de qualquer PR vindo de fork.

O rótulo é **`motors-ci`** nas duas etapas. Migrar do VPS para casa é registrar a máquina nova com o
mesmo rótulo e remover a antiga; a variável e o workflow não mudam.

O workflow fixa `TZ: UTC`: os testes assumem o fuso da Vercel, e o relógio do runner pode estar em
`America/Sao_Paulo`.

## O que o runner executa

O código de cada push e de cada PR: o seu, o das sessões do Claude e o de cada dependência do npm
que entrar no `npm ci`. Por isso ele roda num usuário próprio, sem `sudo`, sem acesso ao Docker e
sem credencial nenhuma. O runner só **sai** para a internet (consulta o GitHub o tempo todo): não
abra porta no firewall nem no roteador. O CI não usa segredo de produção (ver o cabeçalho do
`testes.yml`).

## Etapa 1 — VPS KVM 4 da Hostinger (`srv904277`)

Esse VPS é o mesmo do **n8n, do Evolution (WhatsApp) e do Chatwoot**: `n8n.v2o5.com.br`,
`evolution.v2o5.com.br` e `app.chat.v2o5.com.br` apontam para ele. É por onde entram os leads. O CI
fica preso num canto dele, e **quem perde quando falta recurso é o CI, nunca o atendimento**:

- uma instância só;
- no máximo 4 GB de memória e 2 vCPU, com prioridade mínima de CPU e de disco;
- sem grupo `docker` (quem está nele controla os contêineres do n8n e do Chatwoot e vira root);
- sem acesso de rede aos serviços locais (n8n, Chatwoot, Evolution, bancos e Redis).

Em 12/10 o painel mostrava 4% de CPU, 39% de memória (~6 GB de 16) e 18% de disco: com o teto acima
ainda sobram uns 6 GB e 2 vCPU para o atendimento.

**Renove o VPS antes de 30/10/2026**, a data de expiração no painel. Ele leva junto o WhatsApp, o
Chatwoot e o n8n.

### Instalação

1. Pacotes e usuário (como root ou com `sudo`):
   ```bash
   apt-get update && apt-get install -y git curl jq tar
   adduser --disabled-password --gecos "" runner
   ```
2. No GitHub: repositório → Settings → Actions → Runners → **New self-hosted runner** → Linux,
   x64. A tela mostra a URL de download e um token que vale 1 hora (não versione o token). Como
   `runner`:
   ```bash
   sudo -iu runner
   mkdir actions-runner-1 && cd actions-runner-1
   curl -o runner.tar.gz -L <URL>
   tar xzf runner.tar.gz
   ./config.sh --url https://github.com/85dyones/motors-site-oficial --token <TOKEN> \
     --name motors-vps-1 --labels motors-ci --work _work --unattended
   exit
   ```
3. Serviço que sobe com a máquina:
   ```bash
   cd /home/runner/actions-runner-1
   ./svc.sh install runner
   ./svc.sh start
   ./svc.sh status        # anote o nome do serviço: começa por actions.runner.
   ```
4. Bloqueio de rede do runner. Ele continua resolvendo nomes e saindo para a internet, mas não
   chega aos serviços locais nem às redes internas do Docker:
   ```bash
   cat > /usr/local/sbin/ci-firewall.sh <<'SH'
   #!/usr/bin/env bash
   # Runner do CI sem acesso a serviços locais nem a redes internas.
   # Só insere o que falta; roda antes de cada início do serviço do runner.
   set -e
   regra() { iptables -C OUTPUT "$@" 2>/dev/null || iptables -I OUTPUT "$@"; }
   # Ordem inversa: cada -I entra no topo da lista.
   regra -m owner --uid-owner runner -d 192.168.0.0/16 -j REJECT
   regra -m owner --uid-owner runner -d 172.16.0.0/12 -j REJECT
   regra -m owner --uid-owner runner -d 10.0.0.0/8 -j REJECT
   regra -m owner --uid-owner runner -o lo -j REJECT
   regra -m owner --uid-owner runner -o lo -p tcp --dport 53 -j ACCEPT
   regra -m owner --uid-owner runner -o lo -p udp --dport 53 -j ACCEPT
   SH
   chmod 700 /usr/local/sbin/ci-firewall.sh
   ```
   As regras entram no **topo** da lista: com o ufw ligado, regra acrescentada no fim nunca seria
   lida, porque o ufw libera o tráfego local antes. O tráfego para o IP público do próprio VPS
   também passa pela interface `lo`, então o runner não chega ao n8n nem pelo domínio. As regras não
   são salvas com o `iptables-persistent` de propósito: salvar junto com as regras do Docker costuma
   dar conflito depois de reiniciar. Quem as recoloca é o serviço do runner (passo 5).
5. Teto de memória e CPU, prioridade mínima e o bloqueio do passo 4 a cada início:
   ```bash
   systemctl edit <nome-do-serviço>
   ```
   No editor, entre as linhas de comentário:
   ```ini
   [Service]
   ExecStartPre=+/usr/local/sbin/ci-firewall.sh
   MemoryHigh=3G
   MemoryMax=4G
   CPUQuota=200%
   CPUWeight=10
   IOWeight=10
   ```
   O `+` faz o script rodar como root, enquanto o runner segue como `runner`. Depois
   `systemctl restart <nome-do-serviço>` e confira com
   `iptables -S OUTPUT | head -8` que as seis regras estão no topo. Se um job passar de 4 GB, ele é
   encerrado e falha; n8n, Chatwoot e Evolution seguem.
6. Conferir que os arquivos dos serviços não são legíveis por outros usuários. O comando deve voltar
   vazio; se listar algo, rode `chmod o-rwx` no que aparecer:
   ```bash
   find / -xdev \( -name ".env" -o -name "*.env" -o -name "docker-compose*.yml" \) -perm -o=r 2>/dev/null
   ```
7. Ligar a escolha automática (seção "Ligar a escolha automática" abaixo).

### Acompanhar na primeira semana

- No painel da Hostinger, a memória deve ficar abaixo de ~75% com o CI rodando. Se passar disso
  com frequência, ou se o atendimento ficar lento, apague `RUNNER_CI` (o CI volta para o GitHub na
  hora) e antecipe a etapa 2.
- `journalctl -u <nome-do-serviço> --since today | grep -i -E "oom|killed"` mostra se algum job
  foi encerrado pelo teto de memória.

### Quando o Postgres entrar no CI (S0)

O job com Postgres que vai rodar os testes de RLS precisa de Docker, e o runner do VPS não tem
acesso ao Docker de propósito. Esse job fica fixo em `runs-on: ubuntu-latest` até a etapa 2, ou
usa Podman sem root no usuário `runner`.

## Etapa 2 — computador de casa

Quando quiser migrar: instale a máquina de casa com o mesmo rótulo `motors-ci` (um dos caminhos
abaixo), confira que ela aparece como *Idle* e remova a instância do VPS (seção "Manutenção"). Com
as duas ligadas ao mesmo tempo, os jobs vão para a que estiver livre.

Na máquina de casa o CI pode ter mais instâncias. Na VM e no notebook só com Ubuntu, o script sugere
quantas pela memória (uns 2,5 GB cada, com swap para os picos). No WSL de um notebook dedicado de
8 GB, 5 GB e 4 GB de swap levam 3 instâncias. Nessa etapa o Docker pode ser usado, porque a máquina
não carrega mais nada de produção.

### Windows (WSL2) — o caminho atual

Notebook dedicado ao CI, com Windows Home (sem Hyper-V). Tudo nele; o PowerShell é sempre **como
administrador**. O `preparar-windows-runner.ps1` do passo 5 faz também os passos 1 a 4 quando falta
algo: instala o Ubuntu e o runner e cria a tarefa. Os passos 1 a 4 ficam como o caminho manual.

1. **WSL com Ubuntu.** No PowerShell:
   ```powershell
   wsl --install -d Ubuntu-24.04
   ```
   Reinicie se pedir. Na primeira abertura o Ubuntu pede um usuário e uma senha: é o seu usuário
   de administração da distribuição, não o do runner. Se você já usa um Ubuntu-24.04 para outra
   coisa, crie uma distribuição só para o CI (`wsl --export` + `wsl --import`) e use o nome dela
   no lugar de `Ubuntu-24.04` nos passos abaixo.
2. **Quanto o CI pode usar.** No PowerShell, com até metade da memória do computador (o exemplo
   cede 16 GB e 8 núcleos). Se o arquivo `.wslconfig` já existir, acrescente `memory` e
   `processors` à seção `[wsl2]` dele em vez de sobrescrever:
   ```powershell
   Set-Content -Encoding ascii "$env:USERPROFILE\.wslconfig" "[wsl2]`nmemory=16GB`nprocessors=8"
   ```
3. **Instalar e registrar.** No GitHub: repositório → Settings → Actions → Runners → **New
   self-hosted runner** → Linux, x64. Deixe a página aberta: o token dela vale 1 hora e serve para
   todas as instâncias. Copie `scripts/instalar-runner-wsl.sh` para o Ubuntu e rode:
   ```bash
   bash instalar-runner-wsl.sh
   ```
   O script pergunta quantas instâncias e o token. No notebook dedicado de 8 GB são 2 da Motors e
   1 da plataforma; com 16 GB cedidos ao WSL, 4 no total. Depois ele faz o resto:
   - isola o Ubuntu do disco C: e dos programas do Windows;
   - instala os pacotes e o cliente do Postgres 17;
   - cria o usuário `runner`, sem sudo;
   - registra as instâncias `motors-casa-N` com o rótulo `motors-ci`;
   - deixa pronto `/home/runner/iniciar-runners.sh`.

   Rodar de novo é seguro.

   **Outro repositório da conta** (como `motors-plataforma`): runner de conta pessoal é registrado
   por repositório. Gere o token na tela de runners **daquele** repositório e rode
   `bash instalar-runner-wsl.sh motors-plataforma`. As instâncias novas (`motors-plataforma-casa-N`)
   ficam na mesma máquina, sobem com a mesma tarefa e usam o mesmo rótulo `motors-ci`. Lá também é
   preciso criar a variável `RUNNER_CI`. Reinicie a tarefa "Runner do CI" para elas subirem.
4. **Subir quando você entra no Windows.** No PowerShell:
   ```powershell
   wsl --shutdown
   $acao = New-ScheduledTaskAction -Execute "C:\Windows\System32\wsl.exe" -Argument "-d Ubuntu-24.04 -u runner -- /home/runner/iniciar-runners.sh"
   $gatilho = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
   $ajustes = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
   Register-ScheduledTask -TaskName "Runner do CI" -Action $acao -Trigger $gatilho -Settings $ajustes
   Start-ScheduledTask -TaskName "Runner do CI"
   powercfg /change standby-timeout-ac 0
   ```
   A tarefa abre uma janela de terminal: deixe minimizada, porque fechá-la desliga os runners. O
   gatilho é o logon, e não a inicialização, porque o WSL costuma falhar quando o Windows o sobe
   antes de alguém entrar na conta. Depois de uma reinicialização (atualização do Windows, por
   exemplo), os runners só voltam quando você entrar; bloquear a tela não atrapalha. A última linha
   impede o computador de suspender na tomada: suspenso, ele conta como desligado. O passo 5 resolve
   a volta depois de reiniciar.
5. **Notebook dedicado ao CI.** Baixe `scripts/preparar-windows-runner.ps1` e
   `scripts/instalar-runner-wsl.sh` ("Download raw file" no GitHub) para a mesma pasta e rode, nela:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\preparar-windows-runner.ps1
   ```
   O script faz o seguinte:
   - acha o runner no WSL, pela tarefa "Runner do CI" ou procurando em cada distribuição. Se não
     houver, oferece instalar o `Ubuntu-24.04` (se faltar) e registrar 2 instâncias da
     `motors-site-oficial`. Para isso, deixe aberta antes a tela de token desse repositório;
   - num Windows sem WSL, liga os recursos do Windows de que ele precisa e pede para reiniciar
     (rode de novo depois). Também confere se a virtualização está ligada na BIOS e atualiza o
     WSL, porque o que vem com o Windows pode não conhecer o `Ubuntu-24.04`;
   - dá ao WSL a memória do notebook menos 3 GB, os núcleos menos 1 e 4 GB de swap. Com 8 GB, o
     WSL fica com 5 GB, para 2 instâncias da Motors e 1 da plataforma;
   - deixa o Windows sem suspender na tomada, nem com a tampa fechada;
   - grava a tarefa "Runner do CI", apontando para a distribuição do runner, e a "Bloquear tela do
     CI", que bloqueia a tela 20 segundos depois de entrar;
   - liga o login automático pelo Autologon, programa da Microsoft (Sysinternals). O script o baixa
     e confere a assinatura;
   - oferece registrar as instâncias da `motors-plataforma`;
   - reinicia o WSL e os runners (um job em andamento é interrompido).

   No Autologon, digite a senha da conta e clique em Enable; a senha fica guardada cifrada pelo
   Windows. Com conta Microsoft (a que entra com e-mail), use o e-mail no campo Username e a senha
   da conta, não o PIN.

   Para registrar a `motors-plataforma`, deixe aberta antes a tela de token **daquele** repositório
   e responda 1 quando o script perguntar quantas instâncias.

   Depois disso, o notebook liga, entra sozinho na conta, sobe os runners e bloqueia a tela; uma
   atualização do Windows que reinicia só para o CI por alguns minutos. Quando você mesmo entrar, a
   tela também bloqueia depois de 20 segundos: é só desbloquear. Para desligar o login automático,
   abra `C:\ProgramData\Autologon\Autologon64.exe` e clique em Disable. Rodar de novo é seguro.

   Na BIOS, se houver a opção, ligue "Power on AC" / "Restore on AC power loss", para o notebook
   voltar sozinho depois de uma queda de energia que esgote a bateria.
6. **Conferir.** Em Settings → Actions → Runners de cada repositório, as instâncias
   (`motors-casa-N`, `motors-plataforma-casa-N`) aparecem como *Idle*. Depois siga "Ligar a
   escolha automática".

### Máquina virtual no Hyper-V (Windows Pro)

Alternativa ao WSL2 para quem tem Windows Pro. O CI roda numa máquina virtual (VM) com Ubuntu
Server, que liga junto com o Windows, sem login automático; dentro dela os runners são serviços,
cada um com teto de memória. Num notebook de 8 GB, a VM fica com 5 GB e 2 instâncias (1 da Motors, 1 da plataforma),
cada uma com teto de 3 GB e 4 GB de swap para os picos. O Windows fica com o resto.

Precisa do Windows **Pro** (no Home, o script para sem mexer em nada e indica o WSL2) e da
virtualização ligada na BIOS (já está, se o WSL2 funcionava).

1. **Baixar os scripts.** No notebook, abra no GitHub `scripts/criar-vm-runner.ps1` e
   `scripts/instalar-runner-ubuntu.sh` e use "Download raw file" em cada um. Salve os dois na mesma
   pasta.
2. **Criar a VM.** No PowerShell **como administrador**, nessa pasta:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\criar-vm-runner.ps1
   ```
   Se o Hyper-V estiver desligado, o script o liga e pede para reiniciar; depois rode de novo. O
   script faz o seguinte:
   - desliga a tarefa "Runner do CI" do WSL (as instâncias `motors-casa-N` passam para a VM, com os
     mesmos nomes);
   - deixa o Windows sem suspender na tomada, nem com a tampa fechada;
   - baixa o Ubuntu Server 24.04 mais recente (cerca de 3 GB) e confere o SHA-256 oficial;
   - cria a VM `motors-ci` em `C:\VMs`, com a memória do notebook menos 3 GB, os núcleos menos 1 e
     um disco de 80 GB que cresce conforme o uso;
   - liga a VM à rede "Default Switch": ela sai para a internet pelo Windows e não aparece na rede
     de casa;
   - faz a VM ligar com o Windows e desligar com ele;
   - liga a VM e abre a janela dela.

   Se a VM já existir, o script para sem mexer em nada.
3. **Instalar o Ubuntu**, na janela da VM:
   - teclado Portuguese (Brazil);
   - disco: **usar o disco inteiro e desmarcar "Set up this disk as an LVM group"** (com LVM o
     instalador usa só metade do disco);
   - nome do servidor `motors-ci`; usuário e senha seus (é o usuário de administração);
   - **marque "Install OpenSSH server"**, sem importar chave: a VM só é alcançável deste notebook, e
     a entrada é com a sua senha;
   - não marque nenhum pacote extra ("Featured server snaps");
   - no fim, "Reboot Now" (e Enter, se pedir para tirar a mídia).
4. **Configurar.** Entre na VM, na janela dela, e anote o IP da linha `IPv4 address for eth0`. No
   PowerShell do notebook (não precisa ser administrador), na pasta dos scripts:
   ```powershell
   scp .\instalar-runner-ubuntu.sh seu-usuario@IP:
   ssh seu-usuario@IP
   ```
   Gere um token em **cada** repositório (Settings → Actions → Runners → New self-hosted runner →
   Linux) e rode `bash instalar-runner-ubuntu.sh`. O script faz o seguinte:
   - sugere as instâncias pela memória da máquina (Enter aceita) e pede o token de cada
     repositório;
   - instala os pacotes e o cliente do Postgres 17;
   - deixa a máquina sem suspender;
   - garante 4 GB de swap e liga as atualizações de segurança automáticas, com reinício às 4h30;
   - cria o usuário `runner` sem sudo e bloqueia o acesso dele à rede de casa e à própria máquina;
   - libera só o SSH na entrada;
   - registra cada instância como serviço com teto de memória.

   Rodar de novo é seguro.
5. **Conferir.** As instâncias aparecem como *Idle* em Settings → Actions → Runners de cada
   repositório. A `motors-casa-N` que a VM não reaproveitou (o WSL tinha mais instâncias) fica
   *Offline*: remova-a ali mesmo. `RUNNER_CI=motors-ci` precisa existir nos dois repositórios.

**No dia a dia:**
- O IP da VM muda quando o Windows reinicia. Para entrar de novo, use o Gerenciador do Hyper-V
  (`motors-ci` → Conectar) e veja o IP novo na tela de entrada.
- Estado e controle, no PowerShell como administrador: `Get-VM motors-ci`, `Stop-VM motors-ci`,
  `Start-VM motors-ci`. Dentro da VM: `systemctl list-units 'actions.runner.*' --no-pager`.
- Mais memória para a VM (com ela desligada): `Set-VMMemory motors-ci -StartupBytes 6GB`. Depois
  rode o `instalar-runner-ubuntu.sh` de novo para aceitar mais instâncias.
- BIOS, se tiver a opção: "Power on AC" / "Restore on AC power loss" ligado, para o notebook voltar
  sozinho depois de uma queda de energia que esgote a bateria. Deixe-o sempre na tomada.

### Notebook só com Ubuntu Server (sem Windows)

O mesmo da VM, sem a camada do Windows: toda a memória fica para os jobs (com 8 GB, 3 instâncias).

1. Salve o que estiver no Windows: a instalação apaga o disco.
2. **Pendrive de instalação** (8 GB ou mais), feito em outro computador: baixe o Ubuntu Server
   24.04 LTS (amd64) em ubuntu.com/download/server e grave com o Rufus (Windows) ou o balenaEtcher.
3. **Instalar.** Ligue o notebook pelo pendrive (tecla de boot: F12, F9, F2 ou Esc, conforme a
   marca) e siga o passo 3 da VM, com duas diferenças: rede pelo cabo, se der (Wi-Fi também
   funciona); e, em "Import SSH identity", escolha GitHub e informe `85dyones` se o computador de
   onde você vai entrar tiver essa chave (com chave cadastrada, o script desliga a senha no SSH).
4. **Configurar**: como o passo 4 da VM, a partir do outro computador (`scp` e `ssh` com o IP da
   tela de boas-vindas). Depois da primeira execução, `motors-ci.local` também funciona na rede de
   casa.
5. **BIOS e conferência**: como na VM.

### Linux

Passos 1 a 3 da etapa 1, com `--name motors-casa-N` e quantas instâncias quiser. O bloqueio do
passo 4 e o teto do passo 5 são opcionais em casa.

### Mac

Os jobs de hoje funcionam (`./svc.sh install` usa o launchd). O job com Postgres da S0 precisa de
contêiner de serviço, que o GitHub só oferece em runner Linux: esse job continua no GitHub.

## Ligar a escolha automática

Depois de a instância aparecer como *Idle* em Settings → Actions → Runners.

Enquanto o GitHub não der máquina para a conta, basta a variável `RUNNER_CI` do passo 2: o
`maquina` falha e os jobs vão direto para o runner. O token do passo 1 serve para quando o GitHub
voltar a dar máquina. Sem ele, o `maquina` manda tudo para o GitHub e gasta minutos.

1. **Token que deixa o CI ver se o runner está ligado.** github.com → Settings (da sua conta)
   → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token:
   - Repository access: **Only select repositories** → `motors-site-oficial`.
   - Permissions → Repository permissions → **Administration: Read-only**. Nada mais.
   - Expiration: o maior prazo oferecido. Ponha um lembrete na agenda: token vencido não quebra o
     CI, só manda tudo para o GitHub com um aviso.
2. No repositório: Settings → Secrets and variables → Actions:
   - aba Secrets → `RUNNERS_TOKEN` = o token.
   - aba Variables → `RUNNER_CI` = `motors-ci`.
3. Faça um push e abra a execução na aba Actions: o job `maquina` escreve no log onde decidiu
   rodar, e os outros jobs mostram a instância (`motors-vps-1`, `motors-casa-N`) como máquina.

## Quando algo der errado

- **Runner desligado:** nada a fazer, as execuções novas vão para o GitHub.
- **Runner caiu no meio de uma execução:** os jobs que já estavam nele ficam esperando por até 24
  horas. Cancele e rode de novo (*Re-run all jobs*); o `maquina` escolhe outra vez.
- **Atendimento lento no VPS:** apague o valor de `RUNNER_CI`. O CI volta para o GitHub na próxima
  execução.
- **Todos os jobs falham em 2 a 3 segundos, sem passo nenhum:** o GitHub não deu máquina. É conta,
  não código: minutos do mês acabados, limite de gasto em zero ou pagamento recusado. A execução
  mostra o motivo no topo, e Settings (da conta) → Billing and plans resolve. Enquanto isso, com o
  runner instalado e `RUNNER_CI` preenchida, os jobs vão direto para ele. Só o `maquina` fica
  vermelho, e a execução fica verde mesmo assim. Aconteceu em 12/10/2026, logo depois de o
  repositório ficar privado.

## Manutenção

- O runner se atualiza sozinho quando o GitHub publica versão nova.
- Disco: `_work` e o cache do npm crescem. Confira com
  `du -sh /home/runner/actions-runner-*/_work /home/runner/.npm` e apague o que estiver grande com o
  runner parado.
- Para remover uma instância: Settings → Actions → Runners → a instância → Remove; na máquina,
  dentro da pasta dela, `sudo ./svc.sh stop && sudo ./svc.sh uninstall` (se instalada como
  serviço) e `./config.sh remove --token <TOKEN>`.
