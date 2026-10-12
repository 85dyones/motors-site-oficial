# CLAUDE.md — Motors Admin (motors-site-oficial)

Projeto: site público + admin da Motors Store evoluindo para o sistema de operação da loja
(substituição total do RevendaMais) e, desde 2026-10-12, para uma plataforma SaaS multi-loja vendida
por módulos — a Motors é a loja nº 1. Contexto completo: `HANDOFF.md` (decisões SaaS-1 a SaaS-6 no
topo) e specs em `docs/specs/`.

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
- Toda tabela nova: `org_id uuid not null` + RLS habilitada + policy por loja e por papel.
  Até a S1 entregar `org_atual()`, o default é `org_padrao()` (travado por `tests/f0-nucleo.test.ts`);
  a partir da S1, a policy filtra por `org_atual()` e nunca por constante.
- Unicidade de negócio é por loja: `unique (org_id, …)`. Chave natural global (slug, CPF, chassi,
  id de configuração) só quando for de fato da plataforma, e com o motivo escrito na migração.
- `veiculo_eventos` e `partidas`: append-only (trigger bloqueia UPDATE/DELETE; RLS não concede).
- Constraints são a regra de negócio: balanço zero por lançamento (constraint trigger deferida),
  uma aquisição ativa por veículo (unique parcial), troca exige venda de origem,
  consignação sem custo, parceria exige preço de entrada.
- Views/materialized views derivam; nunca escrever direto em projeção.
- `estoque_motors`: intocada até a F2 (vira projeção lá, preservando o shape lido pelo site).
  Única exceção, autorizada em 2026-10-12: a S1 acrescenta `org_id` (aditivo, preenchido com a
  Motors) e a policy por loja.

## Multi-loja (SaaS)
- A loja vem do usuário (`org_atual()`) no painel e do domínio no site público. Nunca de parâmetro
  enviado pelo navegador.
- Chave de serviço (`SUPABASE_SERVICE_ROLE_KEY`) ignora a RLS: toda consulta feita com ela filtra a
  loja explicitamente. Cache (`unstable_cache`, tags) carrega a loja na chave.
- Configuração, textos, IDs de conta e credenciais de integração são da loja: configuração em
  tabela, segredo no Vault (`org_integracoes`). Variável de ambiente só para o que é da plataforma.
- Storage: caminho começa por `{org_id}/`.
- Nada de "Motors", "Curitiba", bairro, telefone, domínio ou e-mail de pessoa em código novo.
- Módulo pago é liberado por loja (`org_modulos`): menu, rota e API conferem.
- Isolamento tem teste: toda tabela nova entra no teste que cria duas lojas e prova que uma não lê
  nem escreve na outra.

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
Contabilidade fiscal (SPED/ECD/tributos), folha/RH, relatórios além dos definidos, emissor de
NF-e próprio, cliente RENAVE próprio (usar integradora).
Saíram desta lista em 2026-10-12 (SaaS-1): gestão de lojas (tenant), liberação de módulos e
cobrança recorrente — entram na S1 e na trilha comercial do `docs/fases/PLANO.md`.
