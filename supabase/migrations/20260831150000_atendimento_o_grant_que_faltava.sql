-- ---------------------------------------------------------------------------
-- O GRANT que faltava em `atendimentos` — policy sozinha não abre nada
-- ---------------------------------------------------------------------------
-- Emenda à `20260831140000`, no mesmo dia, e a razão de existir é uma lição:
--
-- Aquela migração criou `atendimentos_leitura_staff` e o aceite conferiu que a
-- policy EXISTIA, era de SELECT e era para `authenticated`. Tudo verdade, e
-- ainda assim o painel não lia nada:
--
--     error: permission denied for table atendimentos  (42501)
--
-- Porque o Postgres checa o **GRANT** antes da RLS. `atendimentos` só tinha
-- privilégio para `service_role` (o n8n) — o `authenticated` não tinha SELECT,
-- e policy sobre tabela sem grant não concede coisa alguma. A policy estava
-- correta e inútil ao mesmo tempo.
--
-- É a régua da casa aplicada a mim mesmo: provar a migração pelo EFEITO, e não
-- pela presença do objeto esperado. O aceite abaixo não pergunta se a policy
-- existe; ele **lê a tabela como um usuário de verdade** e compara o resultado
-- entre staff e não-staff.
--
-- Por que só SELECT: escrever atendimento é do n8n com a chave de serviço,
-- recebendo o webhook do Chatwoot. Consultor não digita id de conversa — mesma
-- régua de `leads`, onde o INSERT também não tem policy nem grant de painel.
-- ---------------------------------------------------------------------------

grant select on public.atendimentos to authenticated;

-- ---------------------------------------------------------------------------
-- Aceite — lê como gente, não confere metadado
-- ---------------------------------------------------------------------------
do $$
declare
  falhas int := 0;
  id_staff uuid;
  id_outro uuid;
  id_lead uuid;
  lidas int;
begin
  select id into id_staff from public.profiles where public.is_staff(id) limit 1;
  if id_staff is null then
    raise exception 'ACEITE IMPOSSÍVEL: não há staff na base para exercer a policy';
  end if;

  insert into public.leads (telefone, situacao)
    values ('5541900000777', 'novo') returning id into id_lead;
  insert into public.atendimentos (lead_id, chatwoot_conversation_id)
    values (id_lead, -777777);

  -- 1. O staff LÊ. Sem isto o card do kanban nunca mostraria o link, e o
  --    sintoma seria "o Chatwoot não abre" — sem erro nenhum na tela, porque
  --    RLS bloqueada devolve vazio, não exceção.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', id_staff::text, 'role', 'authenticated')::text, true);
  select count(*) into lidas from public.atendimentos where chatwoot_conversation_id = -777777;
  reset role;
  if lidas <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: staff leu % linha(s), esperado 1', lidas;
  end if;

  -- 2. Quem não é staff NÃO lê. O cliente da Garagem autentica no mesmo pool
  --    `auth.users`; sem esta metade, o grant teria aberto a tabela para ele.
  select u.id into id_outro from auth.users u where not public.is_staff(u.id) limit 1;
  if id_outro is not null then
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', id_outro::text, 'role', 'authenticated')::text, true);
    select count(*) into lidas from public.atendimentos where chatwoot_conversation_id = -777777;
    reset role;
    if lidas <> 0 then
      falhas := falhas + 1;
      raise warning 'FALHOU: quem não é staff leu % linha(s) de atendimento', lidas;
    end if;
  else
    raise notice 'Sem usuário não-staff na base — o contraste não pôde ser exercido.';
  end if;

  -- 3. O anônimo continua fora, e isto não é redundante: `grant ... to
  --    authenticated` é fácil de escrever como `to public` sem querer, e aí a
  --    conversa do cliente vazaria para a internet.
  set local role anon;
  begin
    select count(*) into lidas from public.atendimentos;
    falhas := falhas + 1;
    raise warning 'FALHOU: anon alcançou atendimentos';
  exception when insufficient_privilege then
    null; -- é o esperado
  end;
  reset role;

  delete from public.atendimentos where chatwoot_conversation_id = -777777;
  delete from public.leads where id = id_lead;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) na leitura de atendimentos', falhas;
  end if;

  raise notice 'Atendimento OK: staff lê de verdade, não-staff não lê, anon nem alcança.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260831150000', 'atendimento_o_grant_que_faltava')
  on conflict (version) do nothing;
