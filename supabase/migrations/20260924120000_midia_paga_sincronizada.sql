-- ============================================================================
-- Mídia paga sincronizada: Meta e Google entram sozinhos
-- ============================================================================
-- Spec: docs/superpowers/specs/2026-09-24-midia-paga-sincronizada-design.md
--
-- A `20260807120000` criou `midia_*` para digitação manual e prometeu no
-- cabeçalho: "a integração com a API vem depois sem trocar o modelo (o sync
-- futuro grava nas mesmas tabelas)". É isto. Campanhas e anúncios continuam
-- nas mesmas tabelas, agora com o ID da plataforma; o desempenho passa a ser
-- DIÁRIO (`midia_diario`), porque o painel filtra por período e porque as
-- plataformas corrigem os últimos dias — a gravação apaga e regrava a janela
-- inteira por campanha, numa transação só (`midia_gravar_lote`).
--
-- Medido em 24/09 antes de escrever: `midia_campanhas` e `midia_leituras` têm
-- ZERO linhas. Nada manual a converter; `origem = 'manual'` fica para o que
-- alguém ainda venha a registrar pelo caminho antigo.
--
-- Segredos: dois, no Vault, gerados AQUI e nunca copiados para variável de
-- ambiente. O site não os lê — pergunta ao banco se o valor recebido confere
-- (`midia_confere_segredo`, só para service_role). O incidente de 16/09
-- (chaves em /api/settings) é o motivo de o segredo não sair do banco.
--   * midia_cron_segredo   — o pg_cron chama a rota do Meta com ele.
--   * midia_google_segredo — o dono cola no script do Google Ads
--                            (Supabase → Project Settings → Vault).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Campanhas e anúncios ganham identidade na plataforma
-- ----------------------------------------------------------------------------
alter table public.midia_campanhas
  add column if not exists origem text not null default 'manual',
  add column if not exists id_externo text,
  add column if not exists alcance_total integer,
  add column if not exists sincronizado_em timestamptz;

alter table public.midia_campanhas
  drop constraint if exists midia_campanhas_origem_check;
alter table public.midia_campanhas
  add constraint midia_campanhas_origem_check
  check (origem in ('manual', 'meta', 'google'));

-- Sincronizada ⇒ tem ID, e a origem é a própria plataforma. Manual não tem ID.
alter table public.midia_campanhas
  drop constraint if exists midia_campanhas_origem_coerente;
alter table public.midia_campanhas
  add constraint midia_campanhas_origem_coerente
  check (
    (origem = 'manual' and id_externo is null)
    or (origem = plataforma and id_externo is not null)
  );

-- Índice ÚNICO inteiro, não parcial: o `on conflict (plataforma, id_externo)`
-- precisa inferir o índice sem predicado. Manual tem id_externo nulo, e nulos
-- são distintos por padrão — quantas manuais quiser.
alter table public.midia_campanhas
  drop constraint if exists midia_campanhas_plataforma_id_externo_key;
alter table public.midia_campanhas
  add constraint midia_campanhas_plataforma_id_externo_key unique (plataforma, id_externo);

comment on column public.midia_campanhas.alcance_total is
  'Alcance da vida inteira da campanha, como a plataforma informa (só Meta). '
  'Não soma entre dias nem entre anúncios — por isso não mora em midia_diario.';

alter table public.midia_anuncios
  add column if not exists id_externo text;

alter table public.midia_anuncios
  drop constraint if exists midia_anuncios_campanha_id_externo_key;
alter table public.midia_anuncios
  add constraint midia_anuncios_campanha_id_externo_key unique (campanha_id, id_externo);

-- ----------------------------------------------------------------------------
-- Desempenho diário
-- ----------------------------------------------------------------------------
create table if not exists public.midia_diario (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.midia_campanhas (id) on delete cascade,
  -- NULL = linha da campanha inteira (Google). Uma campanha tem OU linhas por
  -- anúncio (Meta) OU a linha da campanha, nunca as duas — somar daria dobro.
  anuncio_id uuid references public.midia_anuncios (id) on delete cascade,
  dia date not null,
  investido numeric(12, 2) not null default 0 check (investido >= 0),
  impressoes integer not null default 0 check (impressoes >= 0),
  cliques integer not null default 0 check (cliques >= 0),
  -- Leads que a PLATAFORMA reporta. numeric: o Google atribui fração.
  conversoes numeric(12, 2) not null default 0 check (conversoes >= 0),
  atualizado_em timestamptz not null default now(),
  constraint midia_diario_unico unique nulls not distinct (campanha_id, anuncio_id, dia)
);

create index if not exists midia_diario_dia_idx on public.midia_diario (dia desc);

comment on table public.midia_diario is
  'Desempenho por dia (e por anúncio, no Meta) vindo das plataformas. '
  'Escrito só por midia_gravar_lote, que apaga e regrava a janela do lote.';

create table if not exists public.midia_sincronizacoes (
  id uuid primary key default gen_random_uuid(),
  plataforma text not null check (plataforma in ('meta', 'google')),
  -- 'agendado' (pg_cron), 'painel' (botão), 'script' (Google Ads).
  gatilho text not null,
  iniciada_em timestamptz not null default now(),
  terminada_em timestamptz,
  ok boolean not null,
  campanhas integer,
  dias integer,
  -- Mensagem para o dono ler. Nunca o token.
  erro text
);

create index if not exists midia_sincronizacoes_plataforma_idx
  on public.midia_sincronizacoes (plataforma, iniciada_em desc);

comment on table public.midia_sincronizacoes is
  'Uma linha por rodada de sincronização — é daqui que o painel diz '
  '"Meta há 12 min" ou "falhou às 14h: token expirado".';

-- ----------------------------------------------------------------------------
-- RLS: o painel LÊ; só a service role (as rotas de sincronização) escreve.
-- ----------------------------------------------------------------------------
alter table public.midia_diario enable row level security;
alter table public.midia_sincronizacoes enable row level security;

drop policy if exists midia_diario_leitura on public.midia_diario;
create policy midia_diario_leitura on public.midia_diario
  for select to authenticated using (true);

drop policy if exists midia_sincronizacoes_leitura on public.midia_sincronizacoes;
create policy midia_sincronizacoes_leitura on public.midia_sincronizacoes
  for select to authenticated using (true);

grant select on public.midia_diario, public.midia_sincronizacoes to authenticated;
grant all on public.midia_diario, public.midia_sincronizacoes to service_role;

-- ----------------------------------------------------------------------------
-- Segredos
-- ----------------------------------------------------------------------------
do $segredos$
begin
  if not exists (select 1 from vault.secrets where name = 'midia_cron_segredo') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'midia_cron_segredo',
      'pg_cron → POST /api/marketing/sincronizar/meta (Authorization: Bearer)'
    );
  end if;
  if not exists (select 1 from vault.secrets where name = 'midia_google_segredo') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'midia_google_segredo',
      'Script do Google Ads → POST /api/marketing/sincronizar/google (X-Motors-Segredo)'
    );
  end if;
end $segredos$;

create or replace function public.midia_confere_segredo(p_nome text, p_valor text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_nome in ('midia_cron_segredo', 'midia_google_segredo')
     and coalesce(length(p_valor), 0) >= 32
     and exists (
       select 1 from vault.decrypted_secrets
        where name = p_nome and decrypted_secret = p_valor
     );
$$;

revoke all on function public.midia_confere_segredo(text, text) from public, anon, authenticated;
grant execute on function public.midia_confere_segredo(text, text) to service_role;

-- ----------------------------------------------------------------------------
-- Gravação de um lote (formato de `loteParaBanco` em src/lib/midiaSync.ts)
-- ----------------------------------------------------------------------------
create or replace function public.midia_gravar_lote(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plat   text := p->>'plataforma';
  v_de     date := (p->>'de')::date;
  v_ate    date := (p->>'ate')::date;
  c        jsonb;
  a        jsonb;
  v_camp   uuid;
  v_n_camp int := 0;
  v_n_dias int := 0;
  v_fora   int;
  v_ins    int;
begin
  if v_plat is null or v_plat not in ('meta', 'google') then
    raise exception 'plataforma inválida: %', v_plat using errcode = 'invalid_parameter_value';
  end if;
  if v_de is null or v_ate is null or v_de > v_ate then
    raise exception 'janela inválida: % a %', v_de, v_ate using errcode = 'invalid_parameter_value';
  end if;

  for c in select * from jsonb_array_elements(coalesce(p->'campanhas', '[]'::jsonb)) loop
    -- Dia fora da janela seria gravado sem que a janela o apagasse antes:
    -- a segunda rodada duplicaria. Recusa o lote inteiro (a transação volta).
    select count(*) into v_fora
      from jsonb_array_elements(coalesce(c->'dias', '[]'::jsonb)) d
     where (d->>'dia')::date not between v_de and v_ate;
    if v_fora > 0 then
      raise exception 'campanha %: % dia(s) fora da janela % a %', c->>'id_externo', v_fora, v_de, v_ate
        using errcode = 'invalid_parameter_value';
    end if;

    insert into public.midia_campanhas as m
      (nome, plataforma, origem, id_externo, objetivo, orcamento_diario, situacao,
       no_ar_desde, alcance_total, sincronizado_em)
    values
      (c->>'nome', v_plat, v_plat, c->>'id_externo', c->>'objetivo',
       (c->>'orcamento_diario')::numeric, c->>'situacao',
       (c->>'no_ar_desde')::timestamptz, (c->>'alcance_total')::integer, now())
    on conflict (plataforma, id_externo) do update set
      nome             = excluded.nome,
      objetivo         = coalesce(excluded.objetivo, m.objetivo),
      orcamento_diario = excluded.orcamento_diario,
      situacao         = excluded.situacao,
      no_ar_desde      = coalesce(excluded.no_ar_desde, m.no_ar_desde),
      alcance_total    = coalesce(excluded.alcance_total, m.alcance_total),
      sincronizado_em  = now()
    returning m.id into v_camp;

    for a in select * from jsonb_array_elements(coalesce(c->'anuncios', '[]'::jsonb)) loop
      insert into public.midia_anuncios as an (campanha_id, id_externo, nome)
      values (v_camp, a->>'id_externo', a->>'nome')
      on conflict (campanha_id, id_externo) do update set nome = excluded.nome;
    end loop;

    delete from public.midia_diario
     where campanha_id = v_camp and dia between v_de and v_ate;

    insert into public.midia_diario
      (campanha_id, anuncio_id, dia, investido, impressoes, cliques, conversoes)
    select v_camp,
           an.id,
           (d->>'dia')::date,
           coalesce((d->>'investido')::numeric, 0),
           coalesce((d->>'impressoes')::integer, 0),
           coalesce((d->>'cliques')::integer, 0),
           coalesce((d->>'conversoes')::numeric, 0)
      from jsonb_array_elements(coalesce(c->'dias', '[]'::jsonb)) d
      left join public.midia_anuncios an
        on an.campanha_id = v_camp and an.id_externo = d->>'anuncio_id_externo';
    get diagnostics v_ins = row_count;

    -- O Google não informa o início: vale o primeiro dia com impressão.
    update public.midia_campanhas
       set no_ar_desde = (
             select min(dia)::timestamptz from public.midia_diario
              where campanha_id = v_camp and impressoes > 0)
     where id = v_camp and no_ar_desde is null;

    v_n_camp := v_n_camp + 1;
    v_n_dias := v_n_dias + v_ins;
  end loop;

  return jsonb_build_object('campanhas', v_n_camp, 'dias', v_n_dias);
end;
$$;

revoke all on function public.midia_gravar_lote(jsonb) from public, anon, authenticated;
grant execute on function public.midia_gravar_lote(jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- Agendamento do Meta: de hora em hora, no minuto 17 (nenhum outro job usa).
-- O pg_net é assíncrono: a resposta fica em net._http_response, e o resultado
-- de verdade — ok ou erro — a própria rota grava em midia_sincronizacoes.
-- ----------------------------------------------------------------------------
select cron.schedule(
  'sincronizar-midia-meta',
  '17 * * * *',
  $cron$
  select net.http_post(
    url := 'https://motorsstore.com.br/api/marketing/sincronizar/meta',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'midia_cron_segredo'
      )
    ),
    body := '{"gatilho":"agendado"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);

-- ============================================================================
-- Autoconferência — pelo efeito, dentro de um bloco que se desfaz
-- ============================================================================
do $aceite$
declare
  falhas      int := 0;
  v_lote      jsonb;
  v_r1        jsonb;
  v_r2        jsonb;
  v_linhas    int := -1;
  v_campanhas int := -1;
  v_soma      numeric := -1;
  v_noar      timestamptz;
  v_recusou   boolean := false;
  v_seg       text;
begin
  -- 1 · O job existe, ativo, uma vez só.
  if (select count(*) from cron.job where jobname = 'sincronizar-midia-meta' and active) <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: job sincronizar-midia-meta ausente, inativo ou duplicado';
  end if;

  -- 2 · Segredo: o certo confere, o errado e o vazio não.
  select decrypted_secret into v_seg from vault.decrypted_secrets where name = 'midia_google_segredo';
  if not public.midia_confere_segredo('midia_google_segredo', v_seg) then
    falhas := falhas + 1; raise warning 'FALHOU: o segredo certo não confere';
  end if;
  if public.midia_confere_segredo('midia_google_segredo', v_seg || 'x')
     or public.midia_confere_segredo('midia_google_segredo', null)
     or public.midia_confere_segredo('outro_segredo', v_seg) then
    falhas := falhas + 1; raise warning 'FALHOU: segredo errado/vazio/de outro nome conferiu';
  end if;
  if has_function_privilege('authenticated', 'public.midia_confere_segredo(text, text)', 'execute')
     or has_function_privilege('anon', 'public.midia_gravar_lote(jsonb)', 'execute') then
    falhas := falhas + 1; raise warning 'FALHOU: função de segredo/gravação aberta ao público';
  end if;

  -- 3 · Gravar duas vezes o mesmo lote não duplica; corrigir um dia substitui.
  v_lote := jsonb_build_object(
    'plataforma', 'google', 'de', '2026-01-01', 'ate', '2026-01-02',
    'campanhas', jsonb_build_array(jsonb_build_object(
      'id_externo', '999000999', 'nome', 'aceite', 'objetivo', 'SEARCH',
      'situacao', 'no_ar', 'orcamento_diario', 10, 'no_ar_desde', null,
      'alcance_total', null, 'anuncios', '[]'::jsonb,
      'dias', jsonb_build_array(
        jsonb_build_object('anuncio_id_externo', null, 'dia', '2026-01-01',
          'investido', 5, 'impressoes', 100, 'cliques', 3, 'conversoes', 1),
        jsonb_build_object('anuncio_id_externo', null, 'dia', '2026-01-02',
          'investido', 7, 'impressoes', 0, 'cliques', 0, 'conversoes', 0)))));

  begin
    v_r1 := public.midia_gravar_lote(v_lote);
    v_r2 := public.midia_gravar_lote(
      jsonb_set(v_lote, '{campanhas,0,dias,0,investido}', '6'::jsonb));

    select count(*) into v_campanhas from public.midia_campanhas where id_externo = '999000999';
    select count(*), sum(investido) into v_linhas, v_soma
      from public.midia_diario d join public.midia_campanhas m on m.id = d.campanha_id
     where m.id_externo = '999000999';
    select no_ar_desde into v_noar from public.midia_campanhas where id_externo = '999000999';

    begin
      perform public.midia_gravar_lote(
        jsonb_set(v_lote, '{campanhas,0,dias,0,dia}', '"2025-12-31"'::jsonb));
    exception when invalid_parameter_value then
      v_recusou := true;
    end;

    raise exception 'DESFAZER_ACEITE_MIDIA' using errcode = 'restrict_violation';
  exception when restrict_violation then null;
  end;

  if v_campanhas <> 1 then
    falhas := falhas + 1; raise warning 'FALHOU: % campanha(s) após gravar duas vezes, esperado 1', v_campanhas;
  end if;
  if v_linhas <> 2 or v_soma <> 13 then
    falhas := falhas + 1;
    raise warning 'FALHOU: % linha(s) somando %, esperado 2 linhas somando 13 (6 corrigido + 7)', v_linhas, v_soma;
  end if;
  if v_noar is distinct from '2026-01-01'::date::timestamptz then
    falhas := falhas + 1; raise warning 'FALHOU: no_ar_desde saiu %, esperado o 1º dia com impressão', v_noar;
  end if;
  if not v_recusou then
    falhas := falhas + 1; raise warning 'FALHOU: dia fora da janela foi aceito';
  end if;
  if exists (select 1 from public.midia_campanhas where id_externo = '999000999') then
    falhas := falhas + 1; raise warning 'FALHOU: a sonda deixou rastro';
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) na mídia sincronizada', falhas;
  end if;
  raise notice 'mídia sincronizada OK: job ativo, segredos conferem só com o valor certo, gravar 2x não duplica (r1=%, r2=%), janela recusa dia de fora.', v_r1, v_r2;
end $aceite$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260924120000', 'midia_paga_sincronizada')
  on conflict (version) do nothing;
