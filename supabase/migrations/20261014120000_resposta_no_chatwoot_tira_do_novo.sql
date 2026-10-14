-- ---------------------------------------------------------------------------
-- A resposta pelo Chatwoot tira o lead de "Novo" (2026-10-14)
-- ---------------------------------------------------------------------------
-- Relato do dono: *"o sistema transferência também está enviando leads
-- supostamente parados no painel, mas que tem mensagens recente no
-- chatwoot"*.
--
-- Medido em 14/10, conversa por conversa:
--   - 511: o Dyones respondeu o cliente em 13/10 às 15:03 (contato
--     registrado). O lead ficou em "Novo", cujo prazo de transferência é 60
--     min, e o rodízio o passou de um para o outro às 17:00, 19:00, 08:00 e
--     10:00;
--   - 514: o Dyones respondeu às 08:07 e assumiu a conversa às 08:08 (o
--     painel acompanhou); às 10:00 o rodízio a passou ao Rodrigo.
--
-- O contato reinicia o relógio — isso a 20260915120000 já fazia. O que não
-- acontecia é o lead SAIR de "Novo": ninguém move o card depois de responder
-- no Chatwoot, e "Novo" tem o prazo mais curto do funil. Uma hora sem nova
-- resposta e o lead que já estava sendo atendido trocava de dono — e a
-- atribuição que o administrador acabou de fazer era desfeita junto.
--
-- Agora a resposta pelo Chatwoot (o webhook chama com `p_canal = 'chatwoot'`)
-- move o lead de `novo` para `em_contato`. O gatilho de `leads` carimba
-- `ultimo_movimento_em` e o rastro registra a etapa, como em qualquer troca.
-- Daí valem os prazos de "Em contato" (lembrete em 1 dia, transferência em 3),
-- que são os de quem já está atendendo. Não movem: o clique no WhatsApp do
-- card (abre a conversa, não prova que ela aconteceu) e a NOTA PRIVADA no
-- Chatwoot, que o webhook passa como `chatwoot_nota` — ela para o relógio,
-- porque anotar é trabalhar o lead, mas o cliente não recebeu nada. Foi o
-- caso da 515 em 14/10: o vendedor escreveu a mensagem ao cliente como nota
-- privada, e ela nunca saiu.
--
-- O corpo abaixo é o de `20260915120000`, conferido contra o `prosrc` da
-- produção antes de reescrever (md5 2f373a63281b4e8eb6568d6fe7274ef4, IGUAL,
-- 14/10). Mudam só o `update` (a etapa) e uma frase do comentário. A
-- assinatura é a mesma, então `create or replace` basta.

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

  update public.leads l
     set ultimo_contato_em = v_agora,
         -- Atendeu: a cobrança de hoje deixa de valer.
         alertado_em       = null,
         -- 2026-10-14: respondeu pelo Chatwoot, o lead não é mais "Novo".
         -- Só a resposta de verdade (o webhook, canal `chatwoot`) move: o
         -- clique no WhatsApp do card abre a conversa, não prova que ela
         -- aconteceu. E só se a etapa "Em contato" existir e estiver ativa —
         -- as etapas são editáveis no painel.
         situacao = case
           when p_canal = 'chatwoot'
                and l.situacao = 'novo'
                and exists (select 1 from public.funil_etapas e
                             where e.chave = 'em_contato' and e.tipo = 'aberta' and e.ativa)
             then 'em_contato'
           else l.situacao
         end
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
  'Chatwoot é atender, e antes disso o motor não enxergava. Desde 2026-10-14 '
  'a resposta pelo Chatwoot (canal chatwoot) também tira o lead de "Novo" e o '
  'põe em "Em contato".';

revoke all on function public.registrar_contato_do_lead(uuid, text, text) from public, anon;
grant execute on function public.registrar_contato_do_lead(uuid, text, text)
  to authenticated, service_role;


-- ===========================================================================
-- Aceite — prova a régua contra o banco de verdade
-- ===========================================================================
-- Vestindo a chave de serviço, como o webhook do Chatwoot:
--   - lead em "Novo" + resposta pelo Chatwoot → "Em contato", com o rastro da
--     etapa;
--   - lead em "Novo" + clique no WhatsApp do card → continua "Novo";
--   - lead em "Novo" + nota privada no Chatwoot → continua "Novo";
--   - lead em "Proposta" + resposta pelo Chatwoot → continua "Proposta".
-- Tudo que o aceite cria ele apaga.
do $$
declare
  falhas     int := 0;
  v_novo     uuid;
  v_clique   uuid;
  v_nota     uuid;
  v_proposta uuid;
  v_etapa    text;
begin
  if not exists (select 1 from public.funil_etapas where chave = 'em_contato' and tipo = 'aberta' and ativa)
     or not exists (select 1 from public.funil_etapas where chave = 'novo') then
    raise exception 'ACEITE FALHOU: as etapas novo/em_contato não existem — a régua não pôde ser exercida';
  end if;

  insert into public.leads (nome, telefone, situacao) values ('Aceite Novo Chatwoot', '5541900001014', 'novo')
    returning id into v_novo;
  insert into public.leads (nome, telefone, situacao) values ('Aceite Novo Clique', '5541900001015', 'novo')
    returning id into v_clique;
  insert into public.leads (nome, telefone, situacao) values ('Aceite Proposta', '5541900001016', 'proposta')
    returning id into v_proposta;
  insert into public.leads (nome, telefone, situacao) values ('Aceite Nota Privada', '5541900001017', 'novo')
    returning id into v_nota;

  begin
    set local role service_role;
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    perform public.registrar_contato_do_lead(v_novo, 'chatwoot', 'Consultor do Chatwoot');
    perform public.registrar_contato_do_lead(v_clique, 'whatsapp', 'Consultor do Chatwoot');
    perform public.registrar_contato_do_lead(v_proposta, 'chatwoot', 'Consultor do Chatwoot');
    perform public.registrar_contato_do_lead(v_nota, 'chatwoot_nota', 'Consultor do Chatwoot');
    perform set_config('request.jwt.claims', '', true);
    reset role;
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    reset role;
    falhas := falhas + 1;
    raise warning 'FALHOU: o serviço não conseguiu registrar o contato (%)', sqlerrm;
  end;

  select situacao into v_etapa from public.leads where id = v_novo;
  if v_etapa is distinct from 'em_contato' then
    falhas := falhas + 1;
    raise warning 'FALHOU: lead em Novo respondido pelo Chatwoot ficou em %', v_etapa;
  end if;
  if not exists (select 1 from public.leads_eventos
                  where lead_id = v_novo and tipo = 'etapa' and de = 'novo' and para = 'em_contato') then
    falhas := falhas + 1;
    raise warning 'FALHOU: a troca de etapa não ficou no rastro';
  end if;
  select situacao into v_etapa from public.leads where id = v_clique;
  if v_etapa is distinct from 'novo' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o clique no WhatsApp do card moveu o lead para %', v_etapa;
  end if;
  select situacao into v_etapa from public.leads where id = v_nota;
  if v_etapa is distinct from 'novo' then
    falhas := falhas + 1;
    raise warning 'FALHOU: a nota privada no Chatwoot moveu o lead para %', v_etapa;
  end if;
  if (select ultimo_contato_em from public.leads where id = v_nota) is null then
    falhas := falhas + 1;
    raise warning 'FALHOU: a nota privada deixou de parar o relógio';
  end if;
  select situacao into v_etapa from public.leads where id = v_proposta;
  if v_etapa is distinct from 'proposta' then
    falhas := falhas + 1;
    raise warning 'FALHOU: lead em Proposta respondido pelo Chatwoot foi para %', v_etapa;
  end if;

  delete from public.leads_eventos where lead_id in (v_novo, v_clique, v_proposta, v_nota);
  delete from public.leads where id in (v_novo, v_clique, v_proposta, v_nota);

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) na saída do Novo', falhas;
  end if;
  raise notice 'Aceite verificado: a resposta pelo Chatwoot tira o lead de Novo e põe em Em contato, com rastro; o clique no card, a nota privada e as outras etapas não se movem, e a nota ainda para o relógio.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20261014120000', 'resposta_no_chatwoot_tira_do_novo')
  on conflict (version) do nothing;
