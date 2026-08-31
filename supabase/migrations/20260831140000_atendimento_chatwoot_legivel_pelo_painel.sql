-- ---------------------------------------------------------------------------
-- O atendimento do Chatwoot passa a ser legível pelo painel
-- ---------------------------------------------------------------------------
-- Decisão do dono em 2026-08-31: *"vamos passar a guardar o id da conversa, é
-- importante e mais assertivo"*. O contexto era o link do card do kanban, que
-- hoje abre `wa.me` com o número do cliente — o consultor responde pelo
-- WhatsApp pessoal e a conversa não fica registrada em lugar nenhum.
--
-- ---------------------------------------------------------------------------
-- Por que esta migração é pequena: a tabela já existia
-- ---------------------------------------------------------------------------
-- `public.atendimentos` já está no banco, com exatamente a forma necessária —
-- `lead_id`, `chatwoot_contact_id`, `chatwoot_conversation_id`, `inbox_id`,
-- `status_conversa`, `team_id`, `tags`, `iniciado_em`, `encerrado_em`. Veio do
-- bootstrap (não está no livro-razão de migrações) e **nunca foi ligada**:
-- zero linhas em 2026-08-31.
--
-- Não se cria tabela nova aqui, e nem se mexe na forma da que existe. O que
-- falta são três coisas, todas aditivas:
--
--   1. POLICY DE LEITURA. `atendimentos` está com RLS ligada e **zero
--      policies** — o que a tranca para `anon` e para `authenticated`. Só a
--      chave de serviço do n8n entra (ela fura RLS). Isso é seguro e foi bom
--      enquanto ninguém lia; mas o painel É `authenticated`, então hoje o
--      kanban não consegue ler o id da conversa nem para montar um link.
--
--   2. ÍNDICE EM `lead_id`. O caminho de acesso do kanban é "dado este lead,
--      qual a conversa?" — e não existe índice por lead. Com a tabela vazia
--      isso não dói; com um ano de atendimento, dói em toda abertura da tela.
--
--   3. CHAVE ESTRANGEIRA. `lead_id` é uuid solto: nada impede apontar para um
--      lead que não existe. Com `on delete set null`, a eliminação de lead a
--      pedido do titular (LGPD art. 18, VI — a policy de DELETE em `leads`
--      existe para isso) apaga o VÍNCULO e preserva o registro operacional,
--      que não carrega dado pessoal por si.
--
-- O que NÃO entra, de propósito:
--
--   - INSERT e UPDATE seguem sem policy. Quem escreve atendimento é o n8n, com
--     a chave de serviço, recebendo o webhook do Chatwoot — mesma régua de
--     `leads`, onde "o INSERT segue sem policy: quem grava lead é /api/leads,
--     no servidor". Consultor não digita id de conversa.
--   - `idx_atendimento_conversa` fica onde está, embora seja redundante com o
--     UNIQUE de mesma coluna. Remover índice é DROP de objeto em uso, e a
--     janela de convivência proíbe.
--   - `org_id` não entra: `atendimentos` é tabela de módulo, não do núcleo do
--     handoff, e a regra do `org_id` é para as tabelas novas do núcleo.
-- ---------------------------------------------------------------------------

-- 1. Leitura para quem opera o funil ------------------------------------------
-- `is_staff`, e não `normalizarPerfil`: cliente da Garagem autentica no mesmo
-- pool `auth.users` e não pode enxergar atendimento de ninguém.
drop policy if exists atendimentos_leitura_staff on public.atendimentos;
create policy atendimentos_leitura_staff on public.atendimentos
  for select to authenticated using (public.is_staff(auth.uid()));

-- 2. O caminho de acesso do kanban --------------------------------------------
create index if not exists idx_atendimento_lead on public.atendimentos (lead_id);

-- 3. Integridade do vínculo ----------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'atendimentos_lead_id_fkey'
  ) then
    alter table public.atendimentos
      add constraint atendimentos_lead_id_fkey
      foreign key (lead_id) references public.leads (id) on delete set null;
  end if;
end $$;

comment on column public.atendimentos.chatwoot_conversation_id is
  'Id da conversa no Chatwoot. Escrito pelo n8n a partir do webhook; é o que o card do kanban usa para abrir a conversa no lugar do wa.me. Único: uma linha por conversa.';
comment on column public.atendimentos.lead_id is
  'O lead que originou o atendimento, quando há. NULO é caso legítimo: quem escreve no WhatsApp sem passar por formulário nunca teve lead. Também fica nulo quando o lead é eliminado a pedido do titular.';

-- ---------------------------------------------------------------------------
-- Aceite — prova o efeito, não o nome
-- ---------------------------------------------------------------------------
do $$
declare
  falhas int := 0;
  id_lead uuid;
  id_atend uuid;
begin
  -- 1. A policy de leitura existe e é de SELECT para authenticated.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'atendimentos'
      and policyname = 'atendimentos_leitura_staff' and cmd = 'SELECT'
  ) then
    falhas := falhas + 1;
    raise warning 'FALHOU: policy de leitura ausente';
  end if;

  -- 2. Escrita continua SEM policy — o consultor não grava id de conversa.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'atendimentos' and cmd <> 'SELECT'
  ) then
    falhas := falhas + 1;
    raise warning 'FALHOU: apareceu policy de escrita em atendimentos';
  end if;

  -- 3. O índice por lead existe.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'atendimentos' and indexname = 'idx_atendimento_lead'
  ) then
    falhas := falhas + 1;
    raise warning 'FALHOU: índice por lead ausente';
  end if;

  -- 4. A FK recusa lead inexistente...
  begin
    insert into public.atendimentos (lead_id, chatwoot_conversation_id)
      values (gen_random_uuid(), -999001);
    falhas := falhas + 1;
    raise warning 'FALHOU: aceitou atendimento apontando para lead que não existe';
    delete from public.atendimentos where chatwoot_conversation_id = -999001;
  exception when foreign_key_violation then
    null; -- é o esperado
  end;

  -- 5. ...e aceita lead_id nulo, que é o caso de quem escreve sem formulário.
  insert into public.atendimentos (lead_id, chatwoot_conversation_id)
    values (null, -999002) returning id into id_atend;
  delete from public.atendimentos where id = id_atend;

  -- 6. Eliminação do lead solta o vínculo em vez de derrubar o atendimento.
  insert into public.leads (telefone, situacao)
    values ('55419AceiteFK', 'novo') returning id into id_lead;
  insert into public.atendimentos (lead_id, chatwoot_conversation_id)
    values (id_lead, -999003) returning id into id_atend;
  delete from public.leads where id = id_lead;
  if not exists (select 1 from public.atendimentos where id = id_atend and lead_id is null) then
    falhas := falhas + 1;
    raise warning 'FALHOU: apagar o lead não soltou o vínculo do atendimento';
  end if;
  delete from public.atendimentos where id = id_atend;

  -- 7. O UNIQUE que torna o upsert do n8n idempotente continua de pé.
  if not exists (
    select 1 from pg_constraint
    where conname = 'atendimentos_chatwoot_conversation_id_key'
  ) then
    falhas := falhas + 1;
    raise warning 'FALHOU: o UNIQUE da conversa sumiu — o upsert do n8n duplicaria';
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) no atendimento do Chatwoot', falhas;
  end if;

  raise notice 'Atendimento OK: painel lê, n8n escreve, vínculo íntegro e conversa única.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260831140000', 'atendimento_chatwoot_legivel_pelo_painel')
  on conflict (version) do nothing;
