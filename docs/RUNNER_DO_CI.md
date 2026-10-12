# Runner próprio do CI (VPS da Hostinger)

Decisão SaaS-6 do `motors-handoff/HANDOFF.md` (2026-10-12): o repositório fica privado e o CI
(`.github/workflows/testes.yml`) roda num runner próprio no VPS, com os servidores do GitHub como
reserva.

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

Todos os jobs usam:

```yaml
runs-on: ${{ (github.event.repository.private && vars.RUNNER_CI) || 'ubuntu-latest' }}
```

| Situação | Onde roda |
|---|---|
| Variável `RUNNER_CI` vazia ou inexistente | Servidores do GitHub (`ubuntu-latest`) |
| `RUNNER_CI` = `motors-vps` e repositório privado | Runner próprio com o rótulo `motors-vps` |
| Repositório público, com ou sem a variável | Servidores do GitHub |

A última linha é proposital: runner próprio em repositório público executa o código de qualquer
PR vindo de fork na máquina da loja. **Só preencha `RUNNER_CI` depois de o repositório ficar
privado.**

A variável fica em Settings → Secrets and variables → Actions → aba Variables.

O workflow fixa `TZ: UTC`: os testes assumem o fuso da Vercel, e o relógio do VPS pode estar em
`America/Sao_Paulo`.

## O VPS

- **Evite o VPS do n8n de produção.** Build e testes usam vários GB (em 13/09 a suíte esgotou uma
  máquina de 7,9 GB com outras sessões abertas). Um job disputando memória com o n8n pode atrasar
  a entrada de leads e os alertas. Se não houver outro VPS, limite o serviço do runner (passo 5).
- Tamanho: 2 vCPU e 8 GB por job simultâneo, mais 40 GB de disco.
- Cada instância de runner roda um job por vez. O workflow tem 5 jobs: com uma instância eles
  entram em fila e a execução leva perto de 6 minutos; com 16 GB, registre 2 instâncias; com
  32 GB, 4.
- Sistema: Ubuntu 24.04 com `git`, `curl`, `jq` e `tar` (o job `deploy-vercel` usa `curl` e `jq`).
  O Node vem do `actions/setup-node` em cada job; não instale à mão.
- Docker é necessário a partir da S0, quando entrar o job com Postgres que roda os testes de RLS.
  Pertencer ao grupo `docker` equivale a ser root na máquina, por isso o VPS do runner não deve
  guardar nada sensível. É outro motivo para não usar o mesmo VPS do n8n.

## Instalação

1. No GitHub: repositório → Settings → Actions → Runners → **New self-hosted runner** → Linux,
   x64. A tela mostra a URL de download da versão atual e um token de registro que vale 1 hora.
   Não versione o token.
2. No VPS, crie o usuário do runner (sem sudo):
   ```bash
   sudo apt-get update && sudo apt-get install -y git curl jq tar
   sudo adduser --disabled-password --gecos "" runner
   ```
3. Como `runner`, baixe e registre a primeira instância (troque `<URL>` e `<TOKEN>` pelo que a tela
   do GitHub mostrou):
   ```bash
   sudo -iu runner
   mkdir actions-runner-1 && cd actions-runner-1
   curl -o runner.tar.gz -L <URL>
   tar xzf runner.tar.gz
   ./config.sh --url https://github.com/85dyones/motors-site-oficial --token <TOKEN> \
     --name motors-vps-1 --labels motors-vps --work _work --unattended
   exit
   ```
4. Instale como serviço, para subir sozinho depois de reiniciar:
   ```bash
   cd /home/runner/actions-runner-1
   sudo ./svc.sh install runner
   sudo ./svc.sh start
   sudo ./svc.sh status
   ```
5. Só se o VPS for compartilhado: limite memória e CPU do serviço. O nome do serviço aparece no
   `svc.sh status` (começa por `actions.runner.`):
   ```bash
   sudo systemctl edit <nome-do-serviço>
   # no editor:
   # [Service]
   # MemoryMax=8G
   # CPUQuota=200%
   sudo systemctl restart <nome-do-serviço>
   ```
6. Para uma segunda instância, gere outro token na mesma tela e repita os passos 3 e 4 com
   `actions-runner-2` e `--name motors-vps-2`. O rótulo é o mesmo (`motors-vps`).
7. Confira em Settings → Actions → Runners que as instâncias aparecem como *Idle*. Só então
   preencha `RUNNER_CI` com `motors-vps`, faça um push e confira na aba Actions que os jobs rodaram
   em `motors-vps-*`.

## Reserva: quando o VPS cair

1. Apague o valor de `RUNNER_CI`. As próximas execuções vão para os servidores do GitHub e gastam
   os minutos do Pro.
2. Jobs que já estavam na fila do runner próprio não mudam de máquina: cancele a execução e rode
   de novo (*Re-run all jobs*).
3. Com o VPS de volta, preencha `RUNNER_CI` outra vez.

## Manutenção

- O runner se atualiza sozinho quando o GitHub publica versão nova.
- Disco: `_work` e o cache do npm crescem. Confira com `du -sh /home/runner/actions-runner-*/_work
  /home/runner/.npm` e apague o que estiver grande com o runner parado.
- O CI não usa segredo de produção (ver o cabeçalho do `testes.yml`). Não grave credencial no VPS
  do runner.
- Para remover uma instância: Settings → Actions → Runners → a instância → Remove, e no VPS
  `sudo ./svc.sh stop && sudo ./svc.sh uninstall` seguido de `./config.sh remove --token <TOKEN>`.
