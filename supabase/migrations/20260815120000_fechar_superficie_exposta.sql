-- ==========================================================
-- Fechar a superfície exposta: adeus veiculos, RLS no SDR, livro-razão
-- ==========================================================
--
-- Três dívidas da AUDITORIA (§3.4-c), fechadas de uma vez porque são a mesma
-- dívida: coisas que a chave anônima pública podia fazer e não devia.
--
-- 1. `public.veiculos` — a tabela fantasma. Nasceu do replay do baseline em
--    2026-08-07 (a real virou `estoque_motors` no Pacote 0.5) e ficou com
--    policies públicas de INSERT/UPDATE. Zero linhas, zero referências no
--    código, zero uso. Some.
--
-- 2. As seis tabelas do fluxo SDR do n8n — `atendimentos`, `ia_classificacoes`,
--    `lead_tags`, `leads_sdr`, `sdr_qualificacao`, `tracking_events` — estavam
--    com RLS DESLIGADA e grants completos para `anon`, até TRUNCATE. `leads_sdr`
--    tem nome, telefone e e-mail: PII aberta para qualquer um com a chave
--    pública do site.
--
--    A decisão D7 ("qual chave o n8n usa?") travava este fechamento. Resolvida
--    por evidência em 2026-08-15: a credencial Supabase provada do n8n
--    ("Supabase Motors (zwbqmzgnagfeqinqkolp)") INSERE em `notificacoes_admin`,
--    que só tem policy de SELECT — logo ela é service key e atravessa RLS.
--    Fechar não a afeta. E nada vivo escreve nas seis: cinco têm zero linhas
--    desde sempre, `tracking_events` parou em 2026-06-06, os dois workflows
--    que a escreviam estão desligados, e o site não cita nenhuma delas.
--    (O tracking de produção do TRACKING_SPEC.md é Pixel/CAPI — não passa por
--    `tracking_events`. Regra 7 intacta.)
--
--    RLS ligada e NENHUMA policy: anon e authenticated não leem nem escrevem;
--    `service_role` atravessa, como sempre. Quando o SDR renascer, é apontar o
--    workflow para a credencial de service key — que é a que já se provou.
--    As 5 linhas históricas de `tracking_events` ficam preservadas.
--
-- 3. O livro-razão. `supabase_migrations.schema_migrations` NUNCA existiu
--    neste banco — tudo foi aplicado à mão. Consequência documentada em
--    `supabase/README.md`: um `db push` ingênuo reaplicaria o histórico
--    inteiro, recriando a própria `veiculos` fantasma e abortando no meio.
--    Este bloco faz o que `supabase migration repair --status applied` faria:
--    cria o livro e marca como aplicado tudo que de fato está aplicado,
--    inclusive esta migração. `db push` deixa de ser uma armadilha.
-- ==========================================================


-- ==========================================================
-- 1. A fantasma — com a trava de segurança no próprio DROP
-- ==========================================================

do $$
declare
  qtd bigint;
begin
  if to_regclass('public.veiculos') is null then
    raise notice 'public.veiculos já não existe — nada a derrubar.';
    return;
  end if;

  -- A trava: se algum dia alguém escreveu aqui de verdade, parar TUDO.
  -- Derrubar tabela com dado é decisão de gente, não de migração.
  execute 'select count(*) from public.veiculos' into qtd;
  if qtd > 0 then
    raise exception 'ABORTADO: public.veiculos tem % linha(s) — era para estar vazia. '
                    'Investigue antes de derrubar.', qtd;
  end if;

  drop table public.veiculos;
  raise notice 'public.veiculos derrubada (estava vazia, como previsto).';
end $$;


-- ==========================================================
-- 2. RLS nas seis do SDR
-- ==========================================================
--
-- `enable row level security` sem policy nenhuma = ninguém com anon ou
-- authenticated passa; PostgREST devolve vazio na leitura e 42501 na escrita.
-- O revoke embaixo é cinto e suspensório: mesmo se alguém desligar a RLS por
-- engano no painel, o grant de TRUNCATE/DELETE para anônimo não volta.

alter table public.atendimentos      enable row level security;
alter table public.ia_classificacoes enable row level security;
alter table public.lead_tags         enable row level security;
alter table public.leads_sdr         enable row level security;
alter table public.sdr_qualificacao  enable row level security;
alter table public.tracking_events   enable row level security;

revoke all on public.atendimentos      from anon, authenticated;
revoke all on public.ia_classificacoes from anon, authenticated;
revoke all on public.lead_tags         from anon, authenticated;
revoke all on public.leads_sdr         from anon, authenticated;
revoke all on public.sdr_qualificacao  from anon, authenticated;
revoke all on public.tracking_events   from anon, authenticated;

comment on table public.leads_sdr is
  'Tabela de fluxo do SDR no n8n (desligado). RLS fechada em 2026-08-15 — '
  'D7 resolvida por evidência: o n8n usa service key. Sem policy de '
  'propósito: quem opera é o service_role, que atravessa. PII dentro.';

comment on table public.tracking_events is
  'Eventos de tracking de um fluxo antigo do n8n, parado desde 2026-06. O '
  'tracking de produção (TRACKING_SPEC.md) é Pixel/CAPI e não passa aqui. '
  'RLS fechada em 2026-08-15; as linhas históricas ficam.';


-- ==========================================================
-- 3. O livro-razão que nunca existiu
-- ==========================================================
--
-- Mesmo formato que o CLI cria no `migration repair`. Idempotente: rodar de
-- novo não duplica nada. `statements` fica nulo — o repair também não guarda
-- o conteúdo, só o fato de estar aplicada.

create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version    text not null primary key,
  statements text[],
  name       text
);

insert into supabase_migrations.schema_migrations (version, name) values
  ('20260803120000', 'baseline_inventario'),
  ('20260803120100', 'renomear_veiculos_para_estoque_motors'),
  ('20260804193000', 'remover_view_compat_veiculos'),
  ('20260804200000', 'adicionar_last_seen_at'),
  ('20260807120000', 'midia_paga_e_auditoria'),
  ('20260807160000', 'ficha_propria_do_painel'),
  ('20260807190000', 'historico_veiculo'),
  ('20260807210000', 'leads'),
  ('20260808120000', 'rls_escrita_autenticada_estoque'),
  ('20260811130000', 'leads_insert_destravado'),
  ('20260812120000', 'rls_leitura_de_site_settings'),
  ('20260812150000', 'rls_escrita_de_site_settings'),
  ('20260812160000', 'notificacoes_admin'),
  ('20260813120000', 'role_cliente_e_is_staff'),
  ('20260813150000', 'ciclo_fundacao_de_dados'),
  ('20260814120000', 'fechar_venda_ciclo'),
  ('20260814150000', 'carimbo_e_conformidade'),
  ('20260814180000', 'motor_de_gatilhos'),
  ('20260815120000', 'fechar_superficie_exposta')
on conflict (version) do nothing;


-- ==========================================================
-- 4. Autoconferência — o fechamento, provado contra o banco real
-- ==========================================================

do $$
declare
  qtd int;
  ok  boolean;
begin
  -- A fantasma se foi.
  if to_regclass('public.veiculos') is not null then
    raise exception 'ACEITE FALHOU: public.veiculos ainda existe';
  end if;

  -- RLS ligada nas seis.
  select count(*) into qtd
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relrowsecurity
     and c.relname in ('atendimentos','ia_classificacoes','lead_tags',
                       'leads_sdr','sdr_qualificacao','tracking_events');
  if qtd <> 6 then
    raise exception 'ACEITE FALHOU: RLS ligada em % de 6 tabelas', qtd;
  end if;

  -- E anônimo não escreve: INSERT como anon tem que falhar.
  set local role anon;
  ok := false;
  begin
    insert into public.leads_sdr (nome) values ('NAO-DEVERIA-ENTRAR');
  exception when insufficient_privilege then ok := true;
  end;
  set local role none;
  if not ok then
    raise exception 'ACEITE FALHOU: anon ainda insere em leads_sdr';
  end if;

  -- O histórico de tracking sobreviveu ao fechamento.
  select count(*) into qtd from public.tracking_events;
  if qtd < 5 then
    raise exception 'ACEITE FALHOU: as linhas históricas de tracking_events sumiram';
  end if;

  -- O livro-razão cobre todos os arquivos aplicados.
  select count(*) into qtd from supabase_migrations.schema_migrations;
  if qtd < 19 then
    raise exception 'ACEITE FALHOU: livro-razão com % versões (esperava 19)', qtd;
  end if;

  raise notice 'Autoconferência do fechamento: OK.';
end $$;
