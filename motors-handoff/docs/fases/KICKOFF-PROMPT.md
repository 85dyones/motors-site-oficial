# Prompt de kickoff (colar na primeira sessão do Claude Code, na raiz do repo)

Leia HANDOFF.md, CLAUDE.md e docs/specs/00-schema-core.md. Depois:
1. Faça o levantamento do estado atual: schema Supabase existente (tabelas, uso de estoque_motors
   e QUEM a lê — grep no código do site), estrutura do /admin (componentes, auth, padrões),
   integrações n8n ativas. Produza docs/levantamento-atual.md com o contrato de leitura de
   estoque_motors (colunas usadas pelo site) — ele é intocável até a F2.
2. Proponha o plano da F0 como task list (sem codar ainda): migrações do schema núcleo em ordem,
   staging da carga, fluxo de conferência. Aponte qualquer conflito entre o schema existente e a
   spec 00 ANTES de migrar.
3. Após minha aprovação, execute a F0 com os agentes: db-architect nas migrações,
   migration-runner na carga, integrations na conferência diária, qa-guardian em cada PR.
Pendências que dependem de mim (não assuma): integradora RENAVE, exportação do Revenda, telas
pendentes do Revenda, validação jurídica dos templates de contrato, parâmetros internos do Ciclo.
