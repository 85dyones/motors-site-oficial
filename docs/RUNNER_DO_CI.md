# Runner próprio do CI (computador de casa)

Decisão SaaS-6 do `motors-handoff/HANDOFF.md` (2026-10-12, ajustada no mesmo dia): o repositório
fica privado e o CI (`.github/workflows/testes.yml`) roda no computador de casa do dono. Quando ele
está desligado, o CI vai sozinho para os servidores do GitHub.

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

## Como o workflow escolhe a máquina

O primeiro job, `maquina`, roda sempre no GitHub e decide onde rodam os outros cinco:

| Situação | Onde rodam os jobs |
|---|---|
| Repositório público | GitHub, sempre |
| Variável `RUNNER_CI` vazia | GitHub |
| Segredo `RUNNERS_TOKEN` ausente, vencido ou sem permissão | GitHub, com aviso na execução |
| Nenhuma instância com o rótulo de `RUNNER_CI` ligada | GitHub |
| Pelo menos uma instância ligada | Computador de casa |

O job `maquina` custa 1 minuto por execução no repositório privado: perto de 1.300 por mês, dentro
dos 3.000 do Pro. As execuções que caem no GitHub porque o computador estava desligado gastam os
~9 minutos de uma execução completa cada. Deixe o computador ligado e sem suspender para o custo
ficar perto de zero.

Repositório público usa sempre o GitHub de propósito: runner próprio em repositório público executa
o código de qualquer PR vindo de fork na sua casa.

O workflow fixa `TZ: UTC`: os testes assumem o fuso da Vercel, e o relógio da sua máquina está em
`America/Sao_Paulo`.

## O que fica na sua casa

- O runner só **sai** para a internet (consulta o GitHub o tempo todo). Não abra porta no roteador.
- Ele executa o código de cada push e de cada PR: o seu e o das sessões do Claude. Por isso roda
  num usuário próprio, sem senha guardada, e no Windows sem acesso aos seus discos (passo 3).
- O CI não usa segredo de produção (ver o cabeçalho do `testes.yml`). Não grave credencial no
  ambiente do runner.

## Cada instância roda um job por vez

O workflow tem 5 jobs por execução. Com uma instância eles entram em fila e a execução leva perto
de 6 minutos; com várias, rodam juntos. Reserve 4 GB de memória por instância (em 13/09 a suíte
esgotou uma máquina de 7,9 GB com outras sessões abertas):

| Memória livre para o CI | Instâncias |
|---|---|
| 8 GB | 2 |
| 16 GB | 4 |
| 20 GB ou mais | 5 |

## Instalação no Windows (WSL2)

1. **WSL com Ubuntu.** No PowerShell como administrador:
   ```powershell
   wsl --install -d Ubuntu-24.04
   ```
   Reinicie se pedir. Na primeira abertura o Ubuntu pede um usuário e uma senha: é o seu usuário
   de administração da distribuição, não o do runner. Se você já usa esse Ubuntu para outra coisa,
   crie uma distribuição só para o CI (`wsl --export` + `wsl --import`) e use o nome dela no lugar
   de `Ubuntu-24.04` nos passos abaixo.

2. **Memória do WSL.** Crie `%UserProfile%\.wslconfig` com o que você quer ceder ao CI (a tabela
   acima):
   ```ini
   [wsl2]
   memory=16GB
   processors=8
   ```

3. **Isolar dos seus arquivos.** No Ubuntu, crie `/etc/wsl.conf`:
   ```bash
   sudo tee /etc/wsl.conf >/dev/null <<'CONF'
   [automount]
   enabled=false
   [interop]
   enabled=false
   appendWindowsPath=false
   CONF
   ```
   Assim o CI não enxerga o disco C: nem executa programas do Windows. Depois, no PowerShell:
   `wsl --shutdown`.

4. **Pacotes e usuário do runner.** No Ubuntu:
   ```bash
   sudo apt-get update && sudo apt-get install -y git curl jq tar
   sudo adduser --disabled-password --gecos "" runner
   ```

5. **Registrar as instâncias.** No GitHub: repositório → Settings → Actions → Runners → **New
   self-hosted runner** → Linux, x64. A tela mostra a URL de download e um token que vale 1 hora
   (gere um token por instância; não versione nenhum). Para cada instância `N`:
   ```bash
   sudo -iu runner
   mkdir actions-runner-N && cd actions-runner-N
   curl -o runner.tar.gz -L <URL>
   tar xzf runner.tar.gz
   ./config.sh --url https://github.com/85dyones/motors-site-oficial --token <TOKEN> \
     --name motors-casa-N --labels motors-casa --work _work --unattended
   exit
   ```

6. **Script que sobe todas as instâncias.**
   ```bash
   sudo -iu runner tee /home/runner/iniciar-runners.sh >/dev/null <<'SH'
   #!/usr/bin/env bash
   # Sobe todas as instâncias e fica de pé enquanto elas rodam.
   for d in /home/runner/actions-runner-*; do
     (cd "$d" && ./run.sh) &
   done
   wait
   SH
   sudo chmod +x /home/runner/iniciar-runners.sh
   ```

7. **Subir quando você entra no Windows.** Agendador de Tarefas → Criar Tarefa:
   - Geral: nome "Runner do CI"; **Executar somente quando o usuário estiver conectado**.
   - Disparadores: **Ao fazer logon**, do seu usuário.
   - Ações: Iniciar um programa → `C:\Windows\System32\wsl.exe`, argumentos
     `-d Ubuntu-24.04 -u runner -- /home/runner/iniciar-runners.sh`.
   - Configurações: desmarque **Parar a tarefa se ela for executada por mais de**; em "Se a tarefa
     falhar, reiniciar a cada" ponha 1 minuto, até 3 vezes.

   A tarefa abre uma janela de terminal: deixe minimizada, porque fechá-la desliga os runners. O
   `wsl.exe` aberto é o que mantém o WSL ligado. O gatilho é o logon, e não a inicialização,
   porque o WSL costuma falhar quando o Windows o sobe antes de alguém entrar na conta. Depois de
   uma reinicialização (atualização do Windows, por exemplo), o CI vai para o GitHub até você
   entrar; bloquear a tela não atrapalha.

8. **Não dormir.** Configurações → Sistema → Energia → Tela e suspensão: **Suspender: nunca**
   (na tomada). Computador suspenso conta como desligado e o CI vai para o GitHub.

## Instalação no Linux

Mesmos passos 4 e 5 da seção do Windows. No lugar dos passos 6 a 8, instale cada instância como
serviço do systemd, que sobe sozinho com a máquina:

```bash
cd /home/runner/actions-runner-N
sudo ./svc.sh install runner
sudo ./svc.sh start
```

Para limitar memória e CPU de uma instância: `sudo systemctl edit <serviço>` (o nome aparece em
`sudo ./svc.sh status` e começa por `actions.runner.`) com `MemoryMax=4G` e `CPUQuota=200%` na
seção `[Service]`.

## No Mac

Os jobs de hoje funcionam (`./svc.sh install` usa o launchd). O job com Postgres que entra na S0
para os testes de RLS precisa de contêiner de serviço, que o GitHub só oferece em runner Linux:
esse job terá de rodar no GitHub ou numa VM Linux.

## Ligar a escolha automática

Depois de as instâncias aparecerem como *Idle* em Settings → Actions → Runners:

1. **Token que deixa o CI ver se a sua máquina está ligada.** github.com → Settings (da sua conta)
   → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token:
   - Repository access: **Only select repositories** → `motors-site-oficial`.
   - Permissions → Repository permissions → **Administration: Read-only**. Nada mais.
   - Expiration: o maior prazo oferecido. Ponha um lembrete na agenda: token vencido não quebra o
     CI, só manda tudo para o GitHub com um aviso.
2. No repositório: Settings → Secrets and variables → Actions:
   - aba Secrets → `RUNNERS_TOKEN` = o token.
   - aba Variables → `RUNNER_CI` = `motors-casa`.
3. Faça um push e abra a execução na aba Actions: o job `maquina` escreve no log onde decidiu
   rodar, e os outros jobs mostram `motors-casa-N` como máquina.

## Quando algo der errado

- **Computador desligado:** nada a fazer, as execuções novas vão para o GitHub.
- **Computador desligou no meio de uma execução:** os jobs que já estavam nele ficam esperando por
  até 24 horas. Cancele e rode de novo (*Re-run all jobs*); o `maquina` escolhe outra vez.
- **Desligar o runner de vez:** apague o valor de `RUNNER_CI`.

## Manutenção

- O runner se atualiza sozinho quando o GitHub publica versão nova.
- Disco: `_work` e o cache do npm crescem. Confira com
  `du -sh /home/runner/actions-runner-*/_work /home/runner/.npm` e apague o que estiver grande com o
  runner parado.
- Para remover uma instância: Settings → Actions → Runners → a instância → Remove; no computador,
  `./config.sh remove --token <TOKEN>` dentro da pasta dela (no Linux, antes
  `sudo ./svc.sh stop && sudo ./svc.sh uninstall`).
