-- ============================================================================
-- Repasse Motors — fundação de dados
-- ============================================================================
-- Spec: docs/superpowers/specs/2026-09-24-secao-de-repasse-design.md, §4 e §5.
--
-- Carros vendidos no estado, sem a garantia da loja, que hoje não estão em
-- sistema nenhum (dono, 24/09). Três tabelas próprias:
--
--   repasses           o carro, a conta, a ficha de estado, as fotos, a situação
--   repasse_inscritos  a lista do WhatsApp (consumidor e lojista)
--   repasse_avisos     quem da lista já foi avisado de qual carro
--
-- Fora de `estoque_motors` de propósito: todo leitor dela (vitrine, hubs,
-- sitemap, catálogo da Meta, llms.txt) teria de aprender a excluir o repasse,
-- e o CLAUDE.md a mantém intocada até a F2. E sem reusar `modalidade_tipo`,
-- cujo valor 'repasse' já significa outra coisa (carro que ENTROU vindo de
-- outro lojista, em `veiculo_entradas`).
--
-- Leitura pública: `anon` lê só publicado/reservado/vendido (policy) e só as
-- colunas do GRANT — a mesma lista de COLUNAS_PUBLICAS_DO_REPASSE
-- (src/lib/leituraDosRepasses.ts). Inscritos e avisos não têm porta anônima:
-- a lista é gravada pela rota de leads com a chave de serviço.
-- Quem valida e publica é conferido na rota do painel (podeFazer), não aqui.
-- ============================================================================

do $$ begin
  create type public.laudo_do_repasse as enum ('aprovado', 'aprovado_com_apontamento', 'nao_feito');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.situacao_do_repasse as enum ('rascunho', 'em_validacao', 'publicado', 'reservado', 'vendido', 'arquivado');
exception when duplicate_object then null; end $$;

create table if not exists public.repasses (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null default public.org_padrao(),
  slug                     text not null unique,
  marca                    text not null,
  modelo                   text not null,
  versao                   text,
  ano_modelo               smallint not null check (ano_modelo between 1950 and 2100),
  ano_fabricacao           smallint check (ano_fabricacao is null or ano_fabricacao between 1950 and 2100),
  quilometragem            integer not null check (quilometragem >= 0),
  cambio                   text,
  combustivel              text,
  cor                      text,
  carroceria               text check (carroceria is null or carroceria in ('hatch', 'seda', 'suv', 'picape', 'outro')),
  preco                    numeric(12,2) not null check (preco > 0),
  fipe_valor               numeric(12,2) check (fipe_valor is null or fipe_valor > 0),
  fipe_codigo              text,
  fipe_mes_referencia      text,
  -- Nulo até alguém escolher: publicar exige escolha explícita. Não existe
  -- 'reprovado' — carro reprovado não entra no repasse (dono, 24/09).
  laudo                    public.laudo_do_repasse,
  laudo_apontamento        text,
  leilao_consta            boolean,
  leilao_detalhe           text,
  sinistro_consta          boolean,
  sinistro_detalhe         text,
  historico_consultado_em  date,
  resumo                   text check (resumo is null or char_length(resumo) <= 140),
  motivo                   text,
  itens_de_estado          jsonb not null default '[]'::jsonb check (jsonb_typeof(itens_de_estado) = 'array'),
  sem_defeitos_conhecidos  boolean not null default false,
  oficina_do_orcamento     text,
  orcamento_em             date,
  web_full_images          jsonb not null default '[]'::jsonb check (jsonb_typeof(web_full_images) = 'array'),
  whatsapp_images          jsonb not null default '[]'::jsonb check (jsonb_typeof(whatsapp_images) = 'array'),
  situacao                 public.situacao_do_repasse not null default 'rascunho',
  -- "Só lojistas" = publicado e aberto_ao_publico_em nulo; o switch manual
  -- "abrir para todos" grava now() (dono, 24/09).
  lojistas_desde           timestamptz,
  aberto_ao_publico_em     timestamptz,
  reservado_em             timestamptz,
  vendido_em               timestamptz,
  arquivado_em             timestamptz,
  criado_por               uuid,
  enviado_em               timestamptz,
  validado_por             uuid,
  validado_em              timestamptz,
  devolvido_com            text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint repasse_apontamento_tem_texto check (
    laudo is distinct from 'aprovado_com_apontamento' or nullif(trim(laudo_apontamento), '') is not null
  ),
  constraint repasse_publicado_tem_data check (
    situacao not in ('publicado', 'reservado', 'vendido') or lojistas_desde is not null
  ),
  constraint repasse_vendido_tem_data check (situacao <> 'vendido' or vendido_em is not null)
);
comment on table public.repasses is
  'Repasse Motors: carro vendido no estado, sem a garantia da loja (spec 2026-09-24). Não confundir com modalidade_tipo = repasse (entrada vinda de outro lojista).';

create index if not exists repasses_situacao_idx on public.repasses (situacao);

drop trigger if exists repasses_updated_at on public.repasses;
create trigger repasses_updated_at before update on public.repasses
  for each row execute function public.tocar_updated_at();

create table if not exists public.repasse_inscritos (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null default public.org_padrao(),
  lead_id             uuid references public.leads(id) on delete set null,
  trilha              text not null check (trilha in ('consumidor', 'lojista')),
  nome                text not null,
  whatsapp            text not null,
  faixa               text check (faixa is null or faixa in ('ate-30', '30-50', '50-80', 'acima-80')),
  carrocerias         text[] not null default '{}',
  cnpj                text,
  loja_cidade         text,
  cnpj_conferido_em   timestamptz,
  cnpj_conferido_por  uuid,
  created_at          timestamptz not null default now(),
  unique (org_id, trilha, whatsapp),
  constraint inscrito_lojista_tem_cnpj check (trilha <> 'lojista' or nullif(trim(cnpj), '') is not null)
);
comment on table public.repasse_inscritos is
  'Lista do repasse (spec 2026-09-24 §4.2). Sair da lista APAGA a linha — é o que a /privacidade promete.';

create table if not exists public.repasse_avisos (
  repasse_id   uuid not null references public.repasses(id) on delete cascade,
  inscrito_id  uuid not null references public.repasse_inscritos(id) on delete cascade,
  org_id       uuid not null default public.org_padrao(),
  avisado_por  uuid,
  avisado_em   timestamptz not null default now(),
  primary key (repasse_id, inscrito_id)
);

alter table public.leads add column if not exists repasse_id uuid references public.repasses(id) on delete set null;

-- ----------------------------------------------------------------------------
-- RLS e privilégios
-- ----------------------------------------------------------------------------
alter table public.repasses enable row level security;
alter table public.repasse_inscritos enable row level security;
alter table public.repasse_avisos enable row level security;

drop policy if exists repasse_staff_le on public.repasses;
create policy repasse_staff_le on public.repasses for select to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao());
drop policy if exists repasse_staff_insere on public.repasses;
create policy repasse_staff_insere on public.repasses for insert to authenticated
  with check (public.is_staff(auth.uid()) and org_id = public.org_padrao());
drop policy if exists repasse_staff_atualiza on public.repasses;
create policy repasse_staff_atualiza on public.repasses for update to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao())
  with check (public.is_staff(auth.uid()) and org_id = public.org_padrao());
drop policy if exists repasse_anon_le_publicados on public.repasses;
create policy repasse_anon_le_publicados on public.repasses for select to anon
  using (situacao in ('publicado', 'reservado', 'vendido'));

drop policy if exists inscrito_staff_le on public.repasse_inscritos;
create policy inscrito_staff_le on public.repasse_inscritos for select to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao());
drop policy if exists inscrito_staff_atualiza on public.repasse_inscritos;
create policy inscrito_staff_atualiza on public.repasse_inscritos for update to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao())
  with check (public.is_staff(auth.uid()) and org_id = public.org_padrao());
drop policy if exists inscrito_staff_apaga on public.repasse_inscritos;
create policy inscrito_staff_apaga on public.repasse_inscritos for delete to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao());

drop policy if exists aviso_staff_le on public.repasse_avisos;
create policy aviso_staff_le on public.repasse_avisos for select to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao());
drop policy if exists aviso_staff_insere on public.repasse_avisos;
create policy aviso_staff_insere on public.repasse_avisos for insert to authenticated
  with check (public.is_staff(auth.uid()) and org_id = public.org_padrao());
drop policy if exists aviso_staff_apaga on public.repasse_avisos;
create policy aviso_staff_apaga on public.repasse_avisos for delete to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao());

-- O Supabase concede tudo a anon por padrão em tabela nova; a RLS barra
-- linha, não coluna. Sem estes REVOKE, o anônimo leria criado_por.
revoke all on public.repasses from anon;
revoke all on public.repasse_inscritos from anon;
revoke all on public.repasse_avisos from anon;
grant select (
  id, slug, marca, modelo, versao, ano_modelo, ano_fabricacao, quilometragem,
  cambio, combustivel, cor, carroceria, preco, fipe_valor, fipe_codigo,
  fipe_mes_referencia, laudo, laudo_apontamento, leilao_consta, leilao_detalhe,
  sinistro_consta, sinistro_detalhe, historico_consultado_em, resumo, motivo,
  itens_de_estado, sem_defeitos_conhecidos, oficina_do_orcamento, orcamento_em,
  web_full_images, whatsapp_images, situacao, lojistas_desde,
  aberto_ao_publico_em, reservado_em, vendido_em, created_at
) on public.repasses to anon;

-- ----------------------------------------------------------------------------
-- Autoconferência: violar cada regra e exigir a recusa; virar anon de verdade.
-- ----------------------------------------------------------------------------
do $$
declare
  publicado uuid;
  rascunho  uuid;
  vistos    int;
  vazou     boolean := false;
  falhas    int := 0;
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('repasses', 'repasse_inscritos', 'repasse_avisos')
      and not c.relrowsecurity
  ) then
    raise exception 'ACEITE FALHOU: RLS desligada numa tabela do repasse';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('repasses', 'repasse_inscritos', 'repasse_avisos')
      and ('anon' = any(roles) or 'public' = any(roles))
      and not (tablename = 'repasses' and cmd = 'SELECT' and policyname = 'repasse_anon_le_publicados')
  ) then
    raise exception 'ACEITE FALHOU: porta anônima além da leitura dos publicados';
  end if;

  -- 1. apontamento sem texto
  begin
    insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, laudo)
    values ('aceite-apontamento', 'T', 'T', 2020, 1, 1, 'aprovado_com_apontamento');
    falhas := falhas + 1;
  exception when check_violation then null; end;

  -- 2. publicado sem lojistas_desde
  begin
    insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, situacao)
    values ('aceite-publicado-sem-data', 'T', 'T', 2020, 1, 1, 'publicado');
    falhas := falhas + 1;
  exception when check_violation then null; end;

  -- 3. vendido sem vendido_em
  begin
    insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, situacao, lojistas_desde)
    values ('aceite-vendido-sem-data', 'T', 'T', 2020, 1, 1, 'vendido', now());
    falhas := falhas + 1;
  exception when check_violation then null; end;

  -- 4. lojista sem CNPJ
  begin
    insert into public.repasse_inscritos (trilha, nome, whatsapp)
    values ('lojista', 'Aceite', '41900000000');
    falhas := falhas + 1;
  exception when check_violation then null; end;

  -- 5. faixa fora da lista
  begin
    insert into public.repasse_inscritos (trilha, nome, whatsapp, faixa)
    values ('consumidor', 'Aceite', '41900000001', 'ate-100');
    falhas := falhas + 1;
  exception when check_violation then null; end;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % violação(ões) passaram pelas constraints', falhas;
  end if;

  insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, situacao, lojistas_desde)
  values ('aceite-publicado', 'T', 'T', 2020, 1, 1, 'publicado', now()) returning id into publicado;
  insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco)
  values ('aceite-rascunho', 'T', 'T', 2020, 1, 1) returning id into rascunho;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    set local role anon;

    select count(id) into vistos from public.repasses where slug in ('aceite-publicado', 'aceite-rascunho');

    begin
      perform criado_por from public.repasses limit 1;
      vazou := true;
    exception when insufficient_privilege then null; end;

    begin
      perform 1 from public.repasse_inscritos limit 1;
      vazou := true;
    exception when insufficient_privilege then null; end;

    reset role;

    if vistos <> 1 then
      raise exception 'ACEITE FALHOU: o anônimo viu % carro(s) de aceite; o esperado era só o publicado', vistos;
    end if;
    if vazou then
      raise exception 'ACEITE FALHOU: o anônimo leu coluna interna de repasses ou a lista de inscritos';
    end if;
  else
    raise notice 'Papel anon inexistente (banco fora do Supabase): conferência anônima pulada.';
  end if;

  delete from public.repasses where id in (publicado, rascunho);

  raise notice 'Repasse OK: 5 violações recusadas; o anônimo vê só o publicado e só as colunas públicas.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260924180000', 'repasse_fundacao')
  on conflict (version) do nothing;
