-- ============================================================================
-- As fotos do estoque, classificadas para o atendimento em camadas
-- ============================================================================
-- Pedido do dono (2026-10-20), adendo ao atendimento por IA: o assistente
-- precisa CLASSIFICAR as fotos de cada carro do estoque, mostrar primeiro as
-- de fora, perguntar se o cliente quer ver o interior e oferecer os outros
-- detalhes visuais — motor, rodas, detalhes da versão, porta-malas — em
-- camadas, para não despejar vinte fotos de uma vez no WhatsApp do cliente.
-- O desenho está em `docs/ATENDIMENTO_IA.md` (§6.1).
--
-- ---------------------------------------------------------------------------
-- O que nasce
-- ---------------------------------------------------------------------------
-- 1. `public.atendimento_fotos` — uma linha por foto de carro do estoque: a
--    camada (externa, interior, detalhes, rodas, motor, porta_malas, outra),
--    o ângulo da foto de fora, uma descrição curta (vira a legenda no
--    WhatsApp e o "tenho foto do teto solar" da oferta), se a foto é
--    aproveitável, os tokens gastos e — quando alguém corrigiu à mão na aba
--    Fotos do Atendimento IA — quem e quando. Quem classifica é o modelo de visão da
--    DeepSeek, uma vez por foto, pelo servidor (`fotosDoAtendimento-servidor.ts`):
--    a rodada do n8n vai adiantando a fila, e o atendimento classifica na hora
--    o carro que o cliente pediu e ainda não foi visto.
--
--    A chave é a URL da foto dentro do carro. Foto trocada na galeria é URL
--    nova, e a nova entra na fila sozinha; a linha da antiga fica sem uso e
--    não é enviada (o envio parte da galeria ATUAL do carro). `veiculo_id` é
--    o `bigint` de `estoque_motors`, sem FK — a mesma escolha de
--    `leads.veiculo_id`: o carro vendido sai do estoque e a classificação não
--    precisa sumir com ele.
-- 2. Em `public.atendimento_mensagens`: `midia_url`, `veiculo_id` e `camada`
--    — a foto que saiu na conversa, de que carro e de que camada. É o que o
--    painel desenha e o que impede o assistente de mandar a mesma camada duas
--    vezes.
--
-- Leitura: a equipe (as fotos já são públicas na vitrine; a classificação é
-- dado interno). Escrita: só o servidor, como as outras tabelas do
-- atendimento.
--
-- Aditiva e idempotente: `create table if not exists`, `add column if not
-- exists`, constraints só se ausentes, `drop policy if exists` +
-- `create policy`. `estoque_motors` não é tocada.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Conferência prévia
-- ----------------------------------------------------------------------------
do $previa$
begin
  if to_regclass('public.atendimento_mensagens') is null then
    raise exception 'PRÉVIA: public.atendimento_mensagens não existe (20261020120000)';
  end if;
  if to_regprocedure('public.org_padrao()') is null then
    raise exception 'PRÉVIA: public.org_padrao() não existe (F0)';
  end if;
  if to_regprocedure('public.is_staff(uuid)') is null then
    raise exception 'PRÉVIA: public.is_staff(uuid) não existe';
  end if;
end
$previa$;


-- ----------------------------------------------------------------------------
-- 1. A classificação
-- ----------------------------------------------------------------------------
create table if not exists public.atendimento_fotos (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null default public.org_padrao(),
  veiculo_id      bigint not null,
  url             text not null,
  -- A posição na galeria quando foi classificada: desempata a escolha (a capa
  -- costuma ser a melhor foto de fora).
  posicao         integer not null default 0,
  camada          text not null,
  angulo          text,
  descricao       text,
  aproveitavel    boolean not null default true,
  modelo          text,
  tokens_entrada  integer not null default 0,
  tokens_saida    integer not null default 0,
  classificado_em timestamptz not null default now(),
  -- A correção à mão, na aba Fotos do Atendimento IA: quem e quando. Foto
  -- corrigida nunca é reclassificada pelo modelo — "refazer a classificação"
  -- do carro apaga só as linhas do modelo.
  corrigido_por   text,
  corrigido_em    timestamptz,
  constraint atendimento_fotos_correcao_coerente check ((corrigido_por is null) = (corrigido_em is null)),
  constraint atendimento_fotos_camada_valida check (
    camada in ('externa', 'interior', 'detalhes', 'rodas', 'motor', 'porta_malas', 'outra')
  ),
  constraint atendimento_fotos_angulo_so_de_fora check (
    angulo is null
    or (camada = 'externa' and angulo in ('frente', 'traseira', 'lateral', 'tres_quartos_frente', 'tres_quartos_traseira'))
  ),
  constraint atendimento_fotos_url_http check (url ~ '^https?://'),
  constraint atendimento_fotos_descricao_curta check (descricao is null or char_length(descricao) <= 80),
  constraint atendimento_fotos_posicao_valida check (posicao >= 0),
  constraint atendimento_fotos_tokens_validos check (tokens_entrada >= 0 and tokens_saida >= 0)
);

create unique index if not exists atendimento_fotos_uma_por_url
  on public.atendimento_fotos (org_id, veiculo_id, url);
create index if not exists atendimento_fotos_por_classificacao
  on public.atendimento_fotos (org_id, classificado_em desc);

comment on table public.atendimento_fotos is
  'As fotos de cada carro do estoque, classificadas por camada para o atendimento por IA '
  '(2026-10-20): de fora primeiro, o interior se o cliente quiser, os detalhes um de cada vez. '
  'Classificadas pelo modelo de visão, uma vez por URL; só o servidor grava.';

alter table public.atendimento_fotos enable row level security;

drop policy if exists atendimento_fotos_leitura_staff on public.atendimento_fotos;
create policy atendimento_fotos_leitura_staff on public.atendimento_fotos
  for select to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao());

revoke all on public.atendimento_fotos from anon;
revoke insert, update, delete, truncate on public.atendimento_fotos from authenticated;
grant select on public.atendimento_fotos to authenticated;
grant all on public.atendimento_fotos to service_role;


-- ----------------------------------------------------------------------------
-- 2. A foto na conversa
-- ----------------------------------------------------------------------------
alter table public.atendimento_mensagens add column if not exists midia_url  text;
alter table public.atendimento_mensagens add column if not exists veiculo_id bigint;
alter table public.atendimento_mensagens add column if not exists camada     text;

do $restricoes$
begin
  if not exists (select 1 from pg_constraint where conname = 'atendimento_mensagens_camada_valida') then
    alter table public.atendimento_mensagens add constraint atendimento_mensagens_camada_valida check (
      camada is null or camada in ('externa', 'interior', 'detalhes', 'rodas', 'motor', 'porta_malas')
    );
  end if;
  -- Foto do carro só sai do lado da loja, e com o endereço dela.
  if not exists (select 1 from pg_constraint where conname = 'atendimento_mensagens_midia_coerente') then
    alter table public.atendimento_mensagens add constraint atendimento_mensagens_midia_coerente check (
      (veiculo_id is null and camada is null)
      or (direcao = 'saida' and conteudo = 'imagem' and midia_url is not null and midia_url ~ '^https?://')
    );
  end if;
end
$restricoes$;

create index if not exists atendimento_mensagens_fotos_do_lead
  on public.atendimento_mensagens (lead_id, veiculo_id) where veiculo_id is not null;


-- ============================================================================
-- Aceite — prova o efeito, não o nome
-- ============================================================================
do $aceite$
declare
  falhas   int := 0;
  v_falhou text[] := '{}';
  u        jsonb := '{}'::jsonb;
  v_id     uuid;
  q        text;
  v_n      int;
  v_res    text;
  v_caso   record;
  v_lead   uuid;
  v_outra  uuid;
begin
  -- 1. RLS ligada e só leitura para a sessão --------------------------------
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'atendimento_fotos' and c.relrowsecurity
  ) then
    falhas := falhas + 1;
    raise warning 'FALHOU: atendimento_fotos está sem RLS';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'atendimento_fotos' and cmd <> 'SELECT') then
    falhas := falhas + 1;
    raise warning 'FALHOU: apareceu policy de escrita em atendimento_fotos';
  end if;

  -- 2. Efeito — tudo daqui até o sentinela é desfeito -------------------------
  begin
    -- As regras recusam o inválido.
    for v_caso in
      select * from (values
        ('camada inventada', 'insert into public.atendimento_fotos (veiculo_id, url, camada) values (1, ''https://x.invalido/1.jpg'', ''teto'')'),
        ('ângulo em foto de dentro', 'insert into public.atendimento_fotos (veiculo_id, url, camada, angulo) values (1, ''https://x.invalido/2.jpg'', ''interior'', ''frente'')'),
        ('url que não é http', 'insert into public.atendimento_fotos (veiculo_id, url, camada) values (1, ''/logo.png'', ''externa'')'),
        ('descrição longa', 'insert into public.atendimento_fotos (veiculo_id, url, camada, descricao) values (1, ''https://x.invalido/3.jpg'', ''externa'', repeat(''a'', 81))'),
        ('correção sem data', 'insert into public.atendimento_fotos (veiculo_id, url, camada, corrigido_por) values (1, ''https://x.invalido/4.jpg'', ''externa'', ''Fulano'')')
      ) as c(rotulo, comando)
    loop
      begin
        execute v_caso.comando;
        v_falhou := v_falhou || format('aceitou %s', v_caso.rotulo);
      exception when check_violation then
        null;
      end;
    end loop;

    insert into public.atendimento_fotos (veiculo_id, url, camada, angulo, descricao)
    values (7950008, 'https://fotos.invalido/aceite-1.jpg', 'externa', 'tres_quartos_frente', 'Frente');

    -- Uma segunda loja com a MESMA foto do MESMO carro, classificada de outro
    -- jeito: a unicidade é por loja, e a equipe da loja padrão não a vê.
    insert into public.orgs (nome, criada_em)
    select 'Aceite Fotos outra loja', max(criada_em) + interval '1 day' from public.orgs
    returning id into v_outra;
    insert into public.atendimento_fotos (org_id, veiculo_id, url, camada)
    values (v_outra, 7950008, 'https://fotos.invalido/aceite-1.jpg', 'motor');
    begin
      insert into public.atendimento_fotos (veiculo_id, url, camada) values (7950008, 'https://fotos.invalido/aceite-1.jpg', 'interior');
      v_falhou := v_falhou || 'classificou a mesma foto duas vezes'::text;
    exception when unique_violation then
      null;
    end;

    -- A foto na conversa: só saída, só imagem, com endereço.
    insert into public.leads (nome, telefone) values ('Aceite Fotos', '5541900003001') returning id into v_lead;
    insert into public.atendimento_mensagens (lead_id, telefone, direcao, autor, conteudo, texto, situacao, midia_url, veiculo_id, camada)
    values (v_lead, '5541900003001', 'saida', 'assistente', 'imagem', 'Frente', 'enviada', 'https://fotos.invalido/aceite-1.jpg', 7950008, 'externa');
    for v_caso in
      select * from (values
        ('foto do carro na entrada', format('insert into public.atendimento_mensagens (lead_id, telefone, direcao, autor, conteudo, situacao, midia_url, veiculo_id, camada) values (%L, ''5541900003001'', ''entrada'', ''cliente'', ''imagem'', ''recebida'', ''https://fotos.invalido/x.jpg'', 7950008, ''externa'')', v_lead)),
        ('foto do carro sem endereço', format('insert into public.atendimento_mensagens (lead_id, telefone, direcao, autor, conteudo, situacao, veiculo_id, camada) values (%L, ''5541900003001'', ''saida'', ''assistente'', ''imagem'', ''enviada'', 7950008, ''externa'')', v_lead)),
        ('camada outra na conversa', format('insert into public.atendimento_mensagens (lead_id, telefone, direcao, autor, conteudo, situacao, midia_url, veiculo_id, camada) values (%L, ''5541900003001'', ''saida'', ''assistente'', ''imagem'', ''enviada'', ''https://fotos.invalido/x.jpg'', 7950008, ''outra'')', v_lead))
      ) as c(rotulo, comando)
    loop
      begin
        execute v_caso.comando;
        v_falhou := v_falhou || format('aceitou %s', v_caso.rotulo);
      exception when check_violation then
        null;
      end;
    end loop;

    -- Quem lê e quem grava.
    foreach q in array array['admin', 'coma'] loop
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
              'authenticated', 'aceite-fotos-' || q || '@exemplo.invalido', now(), now())
      returning id into v_id;
      u := u || jsonb_build_object(q, v_id);
    end loop;
    update public.profiles set full_name = 'Aceite Fotos Admin', papeis = array['admin'], role = 'admin', is_active = true
     where id = (u->>'admin')::uuid;
    update public.profiles set full_name = 'Aceite Fotos Vendedor', papeis = array['comercial'], role = 'comercial', is_active = true
     where id = (u->>'coma')::uuid;

    for v_caso in
      select * from (values
        ('equipe lê a classificação, só a da loja', 'coma', 'select count(*) from public.atendimento_fotos where veiculo_id = 7950008', 'vê:1'),
        ('a classificação da outra loja não aparece', 'admin', 'select count(*) from public.atendimento_fotos where camada = ''motor'' and url = ''https://fotos.invalido/aceite-1.jpg''', 'vê:0'),
        ('anônimo não lê a classificação', '@anon', 'select count(*) from public.atendimento_fotos', 'vê:0|barrado'),
        ('ninguém logado classifica', 'admin', 'insert into public.atendimento_fotos (veiculo_id, url, camada) values (7950008, ''https://fotos.invalido/aceite-2.jpg'', ''motor'')', 'barrado'),
        ('ninguém logado reclassifica', 'admin', 'update public.atendimento_fotos set camada = ''outra'' where veiculo_id = 7950008', 'barrado|linhas:0')
      ) as c(rotulo, quem, comando, esperado)
    loop
      if left(v_caso.quem, 1) = '@' then
        perform set_config('request.jwt.claims', json_build_object('role', substr(v_caso.quem, 2))::text, true);
        execute format('set local role %I', substr(v_caso.quem, 2));
      else
        perform set_config('request.jwt.claims',
                           json_build_object('sub', u->>v_caso.quem, 'role', 'authenticated')::text, true);
        set local role authenticated;
      end if;
      begin
        if v_caso.comando like 'select %' then
          execute v_caso.comando into v_n;
          v_res := 'vê:' || v_n;
        else
          execute v_caso.comando;
          get diagnostics v_n = row_count;
          v_res := 'linhas:' || v_n;
        end if;
      exception when insufficient_privilege then
        v_res := 'barrado';
      end;
      reset role;
      perform set_config('request.jwt.claims', '', true);
      if not (v_res = any (string_to_array(v_caso.esperado, '|'))) then
        v_falhou := v_falhou || format('%s: esperava %s, veio %s', v_caso.rotulo, v_caso.esperado, v_res);
      end if;
    end loop;

    raise exception 'SENTINELA_DO_ACEITE';
  exception
    when others then
      if sqlerrm <> 'SENTINELA_DO_ACEITE' then
        reset role;
        perform set_config('request.jwt.claims', '', true);
        v_falhou := v_falhou || format('o bloco de efeito estourou: %s', sqlerrm);
      end if;
  end;

  if array_length(v_falhou, 1) > 0 then
    falhas := falhas + array_length(v_falhou, 1);
    for i in 1..array_length(v_falhou, 1) loop
      raise warning 'FALHOU: %', v_falhou[i];
    end loop;
  end if;

  if exists (select 1 from public.atendimento_fotos where url like 'https://fotos.invalido/%')
     or exists (select 1 from public.leads where nome = 'Aceite Fotos')
     or exists (select 1 from public.orgs where nome = 'Aceite Fotos outra loja') then
    falhas := falhas + 1;
    raise warning 'FALHOU: o aceite deixou linha para trás';
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % verificação(ões) das fotos do atendimento', falhas;
  end if;
  raise notice 'Aceite verificado: fotos do atendimento — camadas e ângulos válidos, uma linha por foto e por loja, '
               'foto só na saída e com endereço, leitura da equipe só da loja dela e escrita só do servidor.';
end
$aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20261021120000', 'fotos_do_atendimento')
  on conflict (version) do nothing;
