-- ---------------------------------------------------------------------------
-- Responder no Chatwoot passa a parar o relógio da estagnação
-- ---------------------------------------------------------------------------
-- Relato do dono em 2026-09-15: *"quando eu envio uma mensagem para o lead no
-- chatwoot, ele não sinaliza para o painel que eu já estou em contato com o
-- lead e continua transferindo"*.
--
-- O relato está certo, e a causa não é o Chatwoot. É esta função.
--
-- ---------------------------------------------------------------------------
-- O defeito: um GRANT que não concede nada
-- ---------------------------------------------------------------------------
-- `registrar_contato_do_lead` é o que reinicia `ultimo_contato_em` e zera
-- `alertado_em` — é ela que faz o motor parar de cobrar quem já atendeu. A
-- migração 20260828120000 a concedeu para `authenticated` **e para
-- `service_role`**, esta última justamente para o caminho da integração.
--
-- Só que a guarda de dentro é:
--
--     if not public.is_staff(auth.uid()) then raise ... end if;
--
-- e, para a chave de serviço, `auth.uid()` é NULO. `is_staff(null)` é FALSO
-- (conferido em produção hoje). Ou seja: o n8n e o webhook do Chatwoot tinham
-- permissão de EXECUTAR a função e eram recusados por ela na primeira linha.
-- O grant existia e era inútil ao mesmo tempo — exatamente o espelho do que a
-- 20260831150000 registrou, onde a policy existia e faltava o grant.
--
-- A medição de hoje, antes desta migração:
--
--     leads_eventos tipo='contato'       →  4   (todos de clique no painel)
--     leads_eventos tipo='transferencia' → 15   (todos automáticos)
--
-- Quatro registros de atendimento contra quinze transferências. O consultor
-- atendia no Chatwoot — que é para onde o card do kanban MANDA ele ir desde a
-- 20260831140000 — e o motor seguia contando o lead como abandonado.
--
-- ---------------------------------------------------------------------------
-- O que muda
-- ---------------------------------------------------------------------------
--   1. A guarda passa a aceitar a chave de serviço, além do staff. Continua
--      recusando `anon` e o cliente da Garagem, que é `authenticated` sem ser
--      staff — a régua de quem pode não afrouxa, só passa a reconhecer o
--      integrador que já tinha o grant.
--
--   2. A função ganha `p_autor`. `autor_atual()` lê `auth.uid()` e devolve
--      NULO para a chave de serviço; sem este parâmetro, todo atendimento
--      feito pelo Chatwoot entraria no rastro sem nome, e o relatório de quem
--      atendeu o quê ficaria cego justamente no canal principal.
--
-- `automatico` continua FALSO: quem responde no Chatwoot é gente. A régua do
-- "toque humano reinicia, motor não" não muda — o que muda é o motor passar a
-- enxergar um toque humano que ele já deveria estar enxergando.
--
-- ---------------------------------------------------------------------------
-- Por que DROP e não `create or replace`
-- ---------------------------------------------------------------------------
-- O terceiro parâmetro tem default. Se a versão de dois argumentos ficasse de
-- pé, uma chamada com `(p_lead, p_canal)` casaria com as DUAS e o Postgres
-- recusaria por ambiguidade — derrubando o botão de contato do painel, que
-- chama exatamente assim (`/api/leads/gerenciar`, PATCH). Trocar por dentro da
-- mesma transação não abre janela: ninguém enxerga o intervalo.
-- ---------------------------------------------------------------------------

drop function if exists public.registrar_contato_do_lead(uuid, text);

create or replace function public.registrar_contato_do_lead(
  p_lead  uuid,
  p_canal text default 'whatsapp',
  p_autor text default null
)
  returns timestamptz
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_agora    timestamptz := now();
  v_servico  boolean := coalesce(auth.role(), '') = 'service_role';
begin
  -- A chave de serviço é o webhook do Chatwoot e o n8n. Ela não vem de
  -- navegador: quem a tem já escreve em `leads` direto, então reconhecê-la
  -- aqui não amplia acesso nenhum — só para de recusar quem já podia.
  if not (v_servico or public.is_staff(auth.uid())) then
    raise exception 'Registrar contato é restrito à equipe.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.leads
     set ultimo_contato_em = v_agora,
         -- Atendeu: a cobrança de hoje deixa de valer.
         alertado_em       = null
   where id = p_lead;

  if not found then
    raise exception 'LEAD_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;

  insert into public.leads_eventos (lead_id, tipo, para, autor, automatico, detalhe)
  values (
    p_lead, 'contato', p_canal,
    -- O nome vindo do Chatwoot quando há; senão o do usuário do painel. A
    -- ordem importa: na chamada de serviço `autor_atual()` é nulo, e na
    -- chamada do painel `p_autor` não é passado.
    coalesce(nullif(trim(p_autor), ''), public.autor_atual()),
    false,
    jsonb_build_object('canal', p_canal, 'via_servico', v_servico)
  );

  return v_agora;
end $$;

comment on function public.registrar_contato_do_lead(uuid, text, text) is
  'Marca que alguém falou com o lead (2026-08-28; aberta ao integrador em '
  '2026-09-15). Reinicia o relógio da estagnação e deixa a linha no rastro. '
  'Chamada pelo botão do card e pelo webhook do Chatwoot — atender pelo '
  'Chatwoot é atender, e antes disso o motor não enxergava.';

revoke all on function public.registrar_contato_do_lead(uuid, text, text) from public, anon;
grant execute on function public.registrar_contato_do_lead(uuid, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Aceite — exerce os três papéis, não confere metadado
-- ---------------------------------------------------------------------------
-- A lição da 20260831150000: provar pelo EFEITO. O aceite abaixo CHAMA a
-- função como serviço, como staff e como não-staff, e compara o que acontece
-- com o lead. Perguntar se a função existe não teria pego o defeito original.
-- ---------------------------------------------------------------------------
do $$
declare
  falhas    int := 0;
  id_lead   uuid;
  id_staff  uuid;
  id_outro  uuid;
  v_quando  timestamptz;
  v_autor   text;
  v_alerta  timestamptz;
begin
  insert into public.leads (telefone, situacao, alertado_em)
    values ('5541900000915', 'novo', now() - interval '1 hour')
    returning id into id_lead;

  -- 1. O SERVIÇO registra contato. É o defeito desta migração: antes daqui
  --    esta chamada levava 'insufficient_privilege' e o lead seguia sendo
  --    transferido apesar de atendido.
  begin
    set local role service_role;
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    select public.registrar_contato_do_lead(id_lead, 'chatwoot', 'Consultor do Chatwoot')
      into v_quando;
    reset role;
  exception when others then
    reset role;
    falhas := falhas + 1;
    raise warning 'FALHOU: serviço não conseguiu registrar contato (%)', sqlerrm;
  end;

  -- 2. O efeito chegou no lead: relógio reiniciado E cobrança zerada. Sem a
  --    segunda metade o lead seria cobrado de novo no próximo ciclo.
  select ultimo_contato_em, alertado_em into v_quando, v_alerta
    from public.leads where id = id_lead;
  if v_quando is null then
    falhas := falhas + 1;
    raise warning 'FALHOU: ultimo_contato_em continuou nulo';
  end if;
  if v_alerta is not null then
    falhas := falhas + 1;
    raise warning 'FALHOU: alertado_em não foi zerado — o lead seria cobrado de novo';
  end if;

  -- 3. O autor do Chatwoot chegou ao rastro. Sem `p_autor` a linha ficaria sem
  --    nome, porque autor_atual() lê auth.uid() e o serviço não tem.
  select autor into v_autor from public.leads_eventos
   where lead_id = id_lead and tipo = 'contato' order by criado_em desc limit 1;
  if v_autor is distinct from 'Consultor do Chatwoot' then
    falhas := falhas + 1;
    raise warning 'FALHOU: autor do rastro veio % , esperado o nome do Chatwoot', coalesce(v_autor, '<nulo>');
  end if;

  -- 4. O STAFF continua registrando, e com a chamada de DOIS argumentos — que
  --    é como `/api/leads/gerenciar` chama. Se o drop/create tivesse deixado
  --    ambiguidade, o botão do painel morreria aqui.
  select id into id_staff from public.profiles where public.is_staff(id) limit 1;
  if id_staff is null then
    raise notice 'Sem staff na base — o contraste do painel não pôde ser exercido.';
  else
    begin
      set local role authenticated;
      perform set_config('request.jwt.claims',
        json_build_object('sub', id_staff::text, 'role', 'authenticated')::text, true);
      perform public.registrar_contato_do_lead(id_lead, 'whatsapp');
      reset role;
    exception when others then
      reset role;
      falhas := falhas + 1;
      raise warning 'FALHOU: staff não conseguiu registrar contato (%)', sqlerrm;
    end;
  end if;

  -- 5. Quem NÃO é staff continua fora. O cliente da Garagem é `authenticated`
  --    no mesmo pool; sem esta metade, abrir para o serviço teria aberto para
  --    ele também.
  select u.id into id_outro from auth.users u where not public.is_staff(u.id) limit 1;
  if id_outro is not null then
    begin
      set local role authenticated;
      perform set_config('request.jwt.claims',
        json_build_object('sub', id_outro::text, 'role', 'authenticated')::text, true);
      perform public.registrar_contato_do_lead(id_lead, 'whatsapp');
      reset role;
      falhas := falhas + 1;
      raise warning 'FALHOU: quem não é staff registrou contato';
    exception
      when insufficient_privilege then reset role;  -- é o esperado
      when others then reset role;
    end;
  end if;

  delete from public.leads where id = id_lead;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) no registro de contato', falhas;
  end if;

  raise notice 'Contato OK: serviço registra, painel continua registrando, estranho não entra.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260915120000', 'contato_pelo_chatwoot')
  on conflict (version) do nothing;
