# motors-site-oficial

Site e plataforma da **Motors Store**, revenda de veículos seminovos em
Curitiba/PR. Em produção, com usuários e tráfego reais — toda alteração parte
do que já existe.

O produto tem três camadas:

- **Loja** — vitrine, ficha do veículo (PDP), avaliação de compra, CarMatch e
  landings de destaque, no design Modernist.
- **Painel** (`/admin`) — estoque, kanban de leads, financeiro, mídia paga,
  usuários/permissões e auditoria (telas A1–A17).
- **Motors Ciclo** — o programa de ciclo de vida do cliente (garantia, revisões
  em rede, recompra futura). Especificado em `docs/MANUAL_MOTORS_CICLO.md`;
  implementação ainda no começo.

## Stack

Next.js / React · Supabase (banco + auth, projeto `zwbqmzgnagfeqinqkolp`) ·
n8n (automação e WhatsApp via Evolution API) · Meta Pixel + CAPI · Vercel.
O estoque é sincronizado do RevendaMais para a tabela `estoque_motors` por um
workflow do n8n.

## Rodar

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # vitest — a suíte também trava decisões de projeto
npm run build
```

As variáveis de ambiente estão descritas em `.env.example`.

### Scripts de instalação

Do npm 11 em diante, script de instalação de dependência só roda se o pacote
estiver na lista `allowScripts` do `package.json` — hoje `esbuild`, `sharp` e
`unrs-resolver`, presos na versão do lockfile. Sem isso o npm bloqueia os três
e avisa no build. O `fsevents` (só macOS) fica de fora de propósito: já vem com
binário pronto e o script apenas recompila.

Quando o lockfile subir a versão de um deles, o install volta a avisar que o
script foi bloqueado. Para liberar a versão nova:

```bash
npm install-scripts approve <pacote>   # npm 12
npm approve-scripts <pacote>           # npm 11
```

Aprovar é deixar o pacote executar código na sua máquina e no build da Vercel —
olhe o que mudou na versão antes de aprovar.

## Onde está cada coisa

| Documento | Assunto |
|---|---|
| `docs/MANUAL_MOTORS_CICLO.md` | A especificação de produto do Ciclo — **fonte de verdade** |
| `docs/MOTORS_CICLO_IMPLEMENTACAO.md` | O plano de implementação em pacotes |
| `docs/FINANCEIRO_OPERACIONAL.md` | A linha geral do financeiro — briefing de 2026-08-21, o que está entregue e a fila |
| `AUDITORIA.md` | Auditoria do Pacote 0 (fotografia de 2026-08-03) + decisões datadas |
| `docs/ACHADOS_FINANCEIRO.md` | 13 achados de revisão no financeiro/investidores, ainda não corrigidos |
| `supabase/README.md` | Migrações, runbook de aplicação e o contrato do sync de estoque |
| `WEBHOOKS_N8N.md` | Contrato dos webhooks site → n8n (formatos A, B e C) |
| `TRACKING_SPEC.md` | Meta Pixel/CAPI e Google — spec em produção |
| `docs/GTM_CONFIGURACAO.md` | Variáveis, tags, gatilhos e conversões do GTM, prontos para copiar |
| `SETUP_MANUAL.md` | Passo a passo de configuração de contas externas |

Migrações do banco são **versionadas** em `supabase/migrations/` — nunca altere
schema direto pelo painel. RLS é obrigatória em toda tabela com dado de
cliente. Código, tabelas e commits em **português**, seguindo o padrão do
repositório.
