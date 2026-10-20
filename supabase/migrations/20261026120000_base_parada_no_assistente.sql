-- ============================================================================
-- A base parada entra na cadência do assistente
-- ============================================================================
-- Decisão do dono (2026-10-20): *"os leads já existentes no painel precisam
-- entrar na cadência do Ney também"* — e, nas perguntas seguintes: só o lead
-- parado que JÁ CONVERSOU com o WhatsApp da loja, 7 dias sem contato, no
-- máximo 30 por dia.
--
-- `atendimento_config.base` guarda a régua, editável na tela de Configuração.
-- A linha desta loja nasce ligada com a decisão; o padrão de fábrica do
-- código (`BASE_DE_FABRICA`) é desligado. O assistente só puxa a base com ele
-- mesmo ligado, no horário da loja, poucos por rodada.
--
-- Aditiva e idempotente: `add column if not exists`, regra só se ausente.
-- ============================================================================

alter table public.atendimento_config
  add column if not exists base jsonb not null default '{"ativa": true, "por_dia": 30, "dias_parado": 7}'::jsonb;

do $regra$
begin
  if not exists (select 1 from pg_constraint where conname = 'atendimento_config_base_valida') then
    alter table public.atendimento_config add constraint atendimento_config_base_valida check (
      jsonb_typeof(base) = 'object'
      and jsonb_typeof(base->'ativa') = 'boolean'
      and jsonb_typeof(base->'por_dia') = 'number'
      and jsonb_typeof(base->'dias_parado') = 'number'
      and (base->>'por_dia')::numeric between 1 and 100
      and (base->>'dias_parado')::numeric between 2 and 90
    );
  end if;
end
$regra$;

comment on column public.atendimento_config.base is
  'A base parada que o assistente puxa para a cadência (2026-10-20): ativa, por_dia (1–100) e '
  'dias_parado (2–90). Só lead aberto que já conversou com o WhatsApp da loja.';

-- ===========================================================================
-- Aceite
-- ===========================================================================
do $aceite$
declare
  falhas   int := 0;
  v_falhou text[] := '{}';
  v_base   jsonb;
begin
  -- A linha desta loja, que já existia, nasce com a decisão do dono.
  select base into v_base from public.atendimento_config where org_id = public.org_padrao();
  if v_base is not null and v_base <> '{"ativa": true, "por_dia": 30, "dias_parado": 7}'::jsonb then
    falhas := falhas + 1;
    raise warning 'FALHOU: a linha da loja nasceu com %', v_base;
  end if;

  begin
    begin
      update public.atendimento_config set base = '{"ativa": true, "por_dia": 500, "dias_parado": 7}'::jsonb
       where org_id = public.org_padrao();
      if found then
        v_falhou := v_falhou || 'aceitou 500 por dia'::text;
      end if;
    exception when check_violation then
      null;
    end;
    begin
      update public.atendimento_config set base = '{"ativa": "sim", "por_dia": 30, "dias_parado": 7}'::jsonb
       where org_id = public.org_padrao();
      if found then
        v_falhou := v_falhou || 'aceitou ativa como texto'::text;
      end if;
    exception when check_violation then
      null;
    end;
    raise exception 'SENTINELA_DO_ACEITE';
  exception
    when others then
      if sqlerrm <> 'SENTINELA_DO_ACEITE' then
        v_falhou := v_falhou || format('o bloco de efeito estourou: %s', sqlerrm);
      end if;
  end;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'atendimento_config' and column_name = 'base' and is_nullable = 'NO'
  ) then
    falhas := falhas + 1;
    raise warning 'FALHOU: atendimento_config.base não existe ou aceita nulo';
  end if;

  if array_length(v_falhou, 1) > 0 then
    falhas := falhas + array_length(v_falhou, 1);
    for i in 1..array_length(v_falhou, 1) loop
      raise warning 'FALHOU: %', v_falhou[i];
    end loop;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % verificação(ões) da base parada', falhas;
  end if;
  raise notice 'Aceite verificado: a régua da base parada mora na configuração, nasce ligada (30 por dia, 7 dias) '
               'e recusa teto fora da faixa.';
end
$aceite$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20261026120000', 'base_parada_no_assistente')
  on conflict (version) do nothing;
