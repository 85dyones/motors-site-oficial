# Runner próprio do CI

Decisão SaaS-6 do `motors-handoff/HANDOFF.md` (2026-10-12): o repositório fica privado e o CI
(`.github/workflows/testes.yml`) roda num runner próprio. O plano era começar pelo VPS KVM 4 da
Hostinger e passar depois para o computador de casa do dono. **Em 12/10 o dono antecipou a etapa 2:
o CI começa no computador de casa, com Windows e WSL2.** O VPS fica como alternativa. Quando o
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

Quando quiser migrar: instale a máquina de casa com o mesmo rótulo `motors-ci` (Windows ou Linux,
abaixo), confira que ela aparece como *Idle* e remova a instância do VPS (seção "Manutenção"). Com
as duas ligadas ao mesmo tempo, os jobs vão para a que estiver livre.

Na máquina de casa o CI pode ter mais instâncias, uma a cada 4 GB que você quiser ceder: com 16 GB,
4 instâncias; com 20 GB ou mais, 5. Nessa etapa o Docker pode ser usado, porque a máquina não
carrega mais nada de produção.

### Windows (WSL2)

Tudo no computador de casa. O PowerShell é sempre **como administrador**.

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
   O script pergunta quantas instâncias (uma a cada 4 GB cedidos; com 16 GB, 4) e o token. Depois
   ele faz o resto:
   - isola o Ubuntu do disco C: e dos programas do Windows;
   - instala os pacotes e o cliente do Postgres 17;
   - cria o usuário `runner`, sem sudo;
   - registra as instâncias `motors-casa-N` com o rótulo `motors-ci`;
   - deixa pronto `/home/runner/iniciar-runners.sh`.

   Rodar de novo é seguro.
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
   impede o computador de suspender na tomada: suspenso, ele conta como desligado.
5. **Conferir.** Em Settings → Actions → Runners, as instâncias `motors-casa-N` aparecem como
   *Idle*. Depois siga "Ligar a escolha automática".

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
