# CLAUDE.md — Motors Admin (motors-site-oficial)

Projeto: site público + admin da Motors Store evoluindo para o sistema de operação da loja
(substituição total do RevendaMais). Contexto completo: `HANDOFF.md` e specs em `docs/specs/`.

## Stack e convenções
- Next.js (App Router) + Supabase (Postgres, Auth, Storage, RLS) + Vercel. Automação: n8n
  autohospedado (n8n.v2o5.com.br) via webhooks/DB triggers. IA: Gemini (descrições).
- Admin em `/admin`. NUNCA quebrar o site público nem o funil `/avaliacao` — são produção.
- Padrão visual: seguir os componentes já existentes do admin. Antes de criar componente novo,
  procurar equivalente no repo e estender.
- Idioma de domínio: português (tabelas, enums, eventos em pt-BR como nas specs).

## Banco — regras de migração (obrigatórias)
- Migrações versionadas em `supabase/migrations/`, SEMPRE aditivas nesta janela:
  criar tabela/coluna/índice/policy = ok; DROP/RENAME/ALTER TYPE de objeto em uso = proibido.
- Toda tabela nova: `org_id uuid not null default org_padrao()` + RLS habilitada + policy por papel.
- `veiculo_eventos` e `partidas`: append-only (trigger bloqueia UPDATE/DELETE; RLS não concede).
- Constraints são a regra de negócio: balanço zero por lançamento (constraint trigger deferida),
  uma aquisição ativa por veículo (unique parcial), troca exige venda de origem,
  consignação sem custo, parceria exige preço de entrada.
- Views/materialized views derivam; nunca escrever direto em projeção.
- `estoque_motors`: intocada até a F2 (vira projeção lá, preservando o shape lido pelo site).

## Backend
- Domínio em módulos: `src/modules/{compras,estoque,comercial,posvenda,ciclo,razao,fiscal,vitrine}`.
  Módulo expõe funções públicas; nunca importar tabela/query de outro módulo — usar a função ou
  consumir evento.
- Toda mutação de negócio = Server Action que (1) valida, (2) grava evento, (3) contabiliza via
  regras em tabela, na MESMA transação (função Postgres quando atômico for crítico: fechamento de
  pré-venda, estornos).
- Nada de valor de regra em código: ler de `regras_comissao`, `regras_contabilizacao`,
  `parametros_avaliacao`, `ciclo_parametros` (todas com vigência datada).

## Frontend
- Telas por setor (ver specs). Toda tela responde: quem abre, quando, e qual decisão sai dela.
- Números monetários: `font-variant-numeric: tabular-nums`; margem/deságio sempre com o
  detalhamento dos componentes (o número precisa se explicar).
- Formulários de entrada mudam por `modalidade` — nunca um formulário genérico com campos opcionais.

## Testes e qualidade
- Invariantes de banco têm teste (tentar violar e esperar erro): balanço, imutabilidade de eventos,
  aquisição única ativa, fechamento de pré-venda incompleta, venda abaixo do piso sem aprovação.
- Fluxos críticos com teste de integração: entrada por cada modalidade, pré-venda→fechamento,
  estorno de venda, devolução a terceiro, recompra do Ciclo.
- `qa-guardian` revisa todo PR (checklist em `.claude/agents/qa-guardian.md`).

## Fora de escopo (não implementar)
Contabilidade fiscal (SPED/ECD/tributos), folha/RH, multi-tenant UI, cobrança SaaS,
relatórios além dos definidos, emissor de NF-e próprio, cliente RENAVE próprio (usar integradora).
