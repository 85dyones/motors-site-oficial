# motors-site-oficial

Site e plataforma da **Motors Store**, revenda de veículos seminovos em
Curitiba/PR. Em produção, com usuários e tráfego reais — toda alteração parte
do que já existe.

O produto tem três camadas:

- **Loja** — vitrine, ficha do veículo (PDP), avaliação de compra, CarMatch e
  landings de destaque, no design Modernist.
- **Painel** (`/admin`) — estoque, funil de leads, financeiro, mídia paga,
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

## Onde está cada coisa

| Documento | Assunto |
|---|---|
| `docs/MANUAL_MOTORS_CICLO.md` | A especificação de produto do Ciclo — **fonte de verdade** |
| `docs/MOTORS_CICLO_IMPLEMENTACAO.md` | O plano de implementação em pacotes |
| `docs/FUNIL_DE_VENDAS.md` | O funil de leads — a régua de estagnação e transferência, a pesquisa que a embasa e o que ficou de fora |
| `docs/FINANCEIRO_OPERACIONAL.md` | A linha geral do financeiro — briefing de 2026-08-21, o que está entregue e a fila |
| `AUDITORIA.md` | Auditoria do Pacote 0 (fotografia de 2026-08-03) + decisões datadas |
| `docs/ACHADOS_FINANCEIRO.md` | 13 achados de revisão no financeiro/investidores, ainda não corrigidos |
| `supabase/README.md` | Migrações, runbook de aplicação e o contrato do sync de estoque |
| `WEBHOOKS_N8N.md` | Contrato dos webhooks site → n8n (formatos A, B e C) e as rotas que o n8n chama de volta |
| `TRACKING_SPEC.md` | Meta Pixel/CAPI e Google — spec em produção |
| `docs/GTM_CONFIGURACAO.md` | Variáveis, tags, gatilhos e conversões do GTM, prontos para copiar |
| `SETUP_MANUAL.md` | Passo a passo de configuração de contas externas |

Migrações do banco são **versionadas** em `supabase/migrations/` — nunca altere
schema direto pelo painel. RLS é obrigatória em toda tabela com dado de
cliente. Código, tabelas e commits em **português**, seguindo o padrão do
repositório.
