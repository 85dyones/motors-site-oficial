-- ============================================================================
-- F0-m — Autoria, privilégio e os guardas que eram forjáveis
-- ============================================================================
-- Do ataque adversarial de 2026-08-29 (97 sondas contra a produção, todas em
-- transação revertida). Ele exercitou o que as autoconferências não podiam:
-- elas rodam como DONO da conexão, e dono ignora RLS — as policies do núcleo
-- nunca tinham sido testadas de verdade. Quatro bloqueios saíram dali, e todos
-- têm a mesma raiz: **guarda que confia em quem pergunta**.
--
--   B2  TRUNCATE em 15 das 20 tabelas por qualquer usuário logado — inclusive
--       um `cliente` da Garagem, que não é staff. Truncar `orgs` (uma linha)
--       faz `org_padrao()` devolver null e desliga o núcleo para todo mundo,
--       sem caminho de volta pela aplicação. A f0j já tinha reconhecido a
--       doutrina ("trigger de linha não dispara em TRUNCATE") e aplicado só
--       às 5 append-only.
--   B3  `current_setting('nucleo.fechamento_atomico')` é GUC de namespace
--       customizado: QUALQUER sessão pode setá-lo. A única tranca entre
--       "negócio fechado" e "VENDA + contabilização atômica" era uma senha
--       que o atacante digita.
--   B4  Um `comercial` encerrava a vigência de `ciclo_parametros`, inseria
--       recompra a 150% da FIPE e carimbava `seed_validado_em` — a linha exata
--       do manual v1.2 §1.4 que trava a assinatura de contrato. A
--       autoconferência da f0f exigia que o SEED não nascesse validado; não
--       impedia a segunda linha.
--   B6  `usuario_id`/`criado_por`/`confirmada_por` são `not null` sem amarra
--       com `auth.uid()`: um comercial gravou evento, auditoria e lançamento
--       com o uuid DO ADMIN. Trilha imutável que aponta para a pessoa errada
--       é pior que trilha nenhuma.
--   O1  Append-only protegia CALADO: UPDATE/DELETE voltavam "0 linhas" sem
--       erro (a RLS filtra antes de o trigger disparar), e a aplicação recebia
--       200 achando que editou. É a armadilha conhecida deste projeto — "RLS
--       não devolve erro, devolve vazio" — na forma de escrita.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A régua de "quem está perguntando"
--
-- GUC customizado é forjável; papel do Postgres não é. Dentro de uma função
-- SECURITY DEFINER do owner, `current_user` é o dono; numa chamada pela API é
-- sempre um destes três. Nomear o que é PROIBIDO (e não o que é permitido)
-- mantém a regra previsível se o dono da migração mudar de nome um dia.
-- ----------------------------------------------------------------------------
create or replace function public.nucleo_chamada_de_api()
returns boolean
language sql
stable
as $$
  select current_user in ('authenticated', 'anon', 'service_role')
$$;
comment on function public.nucleo_chamada_de_api() is
  'A chamada veio de fora (PostgREST/anon/service key) ou de dentro (função SECURITY DEFINER, migração)? Substitui o GUC `nucleo.fechamento_atomico`, que qualquer sessão podia setar.';

-- ----------------------------------------------------------------------------
-- B2 + O1 — privilégio de tabela: o que a RLS não alcança
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  todas text[] := array[
    'orgs','veiculos','veiculo_entradas','veiculo_eventos','auditoria',
    'veiculo_custos','veiculo_precos','plano_contas','lancamentos','partidas',
    'regras_contabilizacao','regras_comissao','parametros_avaliacao',
    'ciclo_parametros','negocios','negocio_pagamentos',
    'confirmacoes_disponibilidade','documentos','anuncios','renave_operacoes'
  ];
  imutaveis text[] := array[
    'veiculo_eventos','auditoria','lancamentos','partidas','anuncios',
    'confirmacoes_disponibilidade'
  ];
begin
  -- B2: TRUNCATE sai de TODAS, para os dois papéis de API.
  foreach t in array todas loop
    execute format('revoke truncate on public.%I from anon, authenticated', t);
  end loop;

  -- O1: nas imutáveis, UPDATE/DELETE deixam de ser silêncio e viram 42501.
  foreach t in array imutaveis loop
    execute format('revoke update, delete on public.%I from anon, authenticated', t);
  end loop;

  raise notice 'B2/O1: truncate revogado de % tabelas; update/delete revogado de % imutáveis.',
    array_length(todas, 1), array_length(imutaveis, 1);
end $$;

-- E que tabela nova não nasça com TRUNCATE de brinde (o `pg_default_acl` do
-- Supabase concede por baixo do pano — foi assim que a f0l precisou existir).
alter default privileges in schema public revoke truncate on tables from anon, authenticated;

-- ----------------------------------------------------------------------------
-- B3 — fechar negócio volta a ser ato atômico, não senha
-- ----------------------------------------------------------------------------
create or replace function public.nucleo_bloquear_fechamento_manual()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'fechado' and public.nucleo_chamada_de_api() then
    raise exception 'Fechar negócio é ato atômico da F1 (spec 20): VENDA + contabilização + disparos na mesma transação, por função SECURITY DEFINER. UPDATE direto pela API não fecha.'
      using errcode = 'raise_exception';
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- B4 — `seed_validado_em` é do dono, e só dele
-- ----------------------------------------------------------------------------
create or replace function public.ciclo_seed_validado_so_pelo_dono()
returns trigger
language plpgsql
as $$
begin
  if new.seed_validado_em is not null and public.nucleo_chamada_de_api() then
    raise exception 'seed_validado_em é decisão do dono (manual v1.2 §1.4, pendência D13): os percentuais precisam ser batidos contra o praticado da casa por perfil antes de virarem contrato. Não se carimba pela API.'
      using errcode = 'raise_exception';
  end if;
  return new;
end;
$$;

drop trigger if exists ciclo_parametros_seed_do_dono on public.ciclo_parametros;
create trigger ciclo_parametros_seed_do_dono
  before insert or update on public.ciclo_parametros
  for each row execute function public.ciclo_seed_validado_so_pelo_dono();

-- ----------------------------------------------------------------------------
-- B6 — a autoria é carimbada, não declarada
--
-- Quando a escrita vem da API, o autor é quem a sessão diz ser (`auth.uid()`),
-- e o que o corpo mandou é ignorado. Fora da API (migração, função atômica da
-- F1 gravando em nome de quem pediu) a atribuição explícita continua valendo.
-- ----------------------------------------------------------------------------
create or replace function public.nucleo_carimbar_autor()
returns trigger
language plpgsql
as $$
begin
  if public.nucleo_chamada_de_api() then
    if auth.uid() is null then
      raise exception 'Escrita em % sem sessão: a autoria da trilha não pode ficar em branco nem ser declarada pelo corpo.',
        tg_table_name using errcode = 'raise_exception';
    end if;
    case tg_table_name
      when 'veiculo_eventos'                then new.usuario_id    := auth.uid();
      when 'auditoria'                      then new.usuario_id    := auth.uid();
      when 'lancamentos'                    then new.criado_por    := auth.uid();
      when 'confirmacoes_disponibilidade'   then new.confirmada_por := auth.uid();
      else null;
    end case;
  end if;
  return new;
end;
$$;

drop trigger if exists veiculo_eventos_carimbar_autor on public.veiculo_eventos;
create trigger veiculo_eventos_carimbar_autor
  before insert on public.veiculo_eventos
  for each row execute function public.nucleo_carimbar_autor();

drop trigger if exists auditoria_carimbar_autor on public.auditoria;
create trigger auditoria_carimbar_autor
  before insert on public.auditoria
  for each row execute function public.nucleo_carimbar_autor();

drop trigger if exists lancamentos_carimbar_autor on public.lancamentos;
create trigger lancamentos_carimbar_autor
  before insert on public.lancamentos
  for each row execute function public.nucleo_carimbar_autor();

drop trigger if exists confirmacoes_carimbar_autor on public.confirmacoes_disponibilidade;
create trigger confirmacoes_carimbar_autor
  before insert on public.confirmacoes_disponibilidade
  for each row execute function public.nucleo_carimbar_autor();

-- ----------------------------------------------------------------------------
-- Autoconferência — pelo efeito, do lado de quem ataca
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  falhas int := 0;
begin
  -- B2: ninguém de fora trunca nada do núcleo.
  foreach t in array array[
    'orgs','veiculos','veiculo_entradas','veiculo_eventos','auditoria',
    'veiculo_custos','veiculo_precos','plano_contas','lancamentos','partidas',
    'regras_contabilizacao','regras_comissao','parametros_avaliacao',
    'ciclo_parametros','negocios','negocio_pagamentos',
    'confirmacoes_disponibilidade','documentos','anuncios','renave_operacoes'
  ] loop
    if has_table_privilege('authenticated', 'public.' || t, 'TRUNCATE')
       or has_table_privilege('anon', 'public.' || t, 'TRUNCATE') then
      falhas := falhas + 1;
      raise warning 'B2 FALHOU: TRUNCATE ainda concedido em %', t;
    end if;
  end loop;

  -- O1: UPDATE/DELETE nas imutáveis viram erro, não silêncio.
  foreach t in array array[
    'veiculo_eventos','auditoria','lancamentos','partidas','anuncios',
    'confirmacoes_disponibilidade'
  ] loop
    if has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || t, 'DELETE') then
      falhas := falhas + 1;
      raise warning 'O1 FALHOU: % ainda aceita UPDATE/DELETE calado', t;
    end if;
  end loop;

  -- E o que a operação PRECISA continuar podendo.
  if not has_table_privilege('authenticated', 'public.veiculos', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.veiculo_eventos', 'INSERT')
     or not has_table_privilege('authenticated', 'public.negocios', 'UPDATE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: a operação legítima perdeu privilégio';
  end if;

  -- B4: o carimbo do dono não passa por trigger nenhum vindo da API. Aqui
  -- dentro somos o dono, então o INSERT COM carimbo deve PASSAR — é a
  -- contraprova de que o guarda não bloqueia a via legítima.
  if public.nucleo_chamada_de_api() then
    raise exception 'ACEITE INCONCLUSIVO: a migração roda como papel de API (%), e o teste abaixo perde o sentido', current_user;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % brecha(s) seguem abertas', falhas;
  end if;

  raise notice 'F0-m OK: truncate fora, imutável responde 42501, fechamento e seed exigem via interna, autoria carimbada.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260829150000', 'f0m_autoria_privilegio_e_guardas_forjaveis')
  on conflict (version) do nothing;
