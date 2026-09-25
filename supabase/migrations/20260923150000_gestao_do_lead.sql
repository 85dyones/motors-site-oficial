-- ============================================================================
-- Gestão do lead (2026-09-23) — arquivo RECONSTRUÍDO em 2026-09-24
-- ============================================================================
--
-- ⚠️ Esta migração foi aplicada em PRODUÇÃO em 2026-09-23 FORA do repositório.
-- O livro-razão (`supabase_migrations.schema_migrations`) tem a versão
-- `20260923150000` com o nome `gestao_do_lead`, mas `statements` está vazio, e
-- nenhum ramo do repositório tinha o arquivo. O banco mudou e o repositório
-- não sabia — um banco reconstruído a partir de `migrations/` ficava sem a
-- tabela, sem a função e com o gatilho da versão anterior.
--
-- Este arquivo foi RECONSTRUÍDO em 2026-09-24 a partir do catálogo de produção
-- (consultas somente-leitura: pg_attribute, pg_constraint, pg_indexes,
-- pg_policy, pg_get_functiondef, ACLs e comentários, lidas em 2026-09-24 ~22h10
-- UTC), para o repositório voltar a descrever o banco. Não é o texto original,
-- que se perdeu: é o ESTADO que ele deixou, escrito de forma que
--   * num banco reconstruído do zero pelas migrações do repositório, chega
--     exatamente ao estado de produção (a autoconferência compara definição de
--     constraint, de índice e de função com o texto lido de produção);
--   * aplicado em produção agora, é no-op — e, se produção não for o que o
--     retrato diz, ABORTA antes de mudar qualquer coisa (conferência prévia,
--     abaixo), em vez de "consertar" o banco em silêncio.
--
-- O código que usa o que está aqui — `lib/gestaoDoLead` (`decidirInteracao`) e
-- `docs/GESTAO_DO_LEAD.md`, citados nos comentários gravados no banco — TAMBÉM
-- não está no repositório. Os comentários abaixo são os de produção, letra por
-- letra, e continuam citando esses caminhos: é o que o banco diz, e
-- reescrevê-los tiraria esta migração do no-op.
--
-- ---------------------------------------------------------------------------
-- O que ela deixou em produção
-- ---------------------------------------------------------------------------
-- 1. Em `public.leads`, sete colunas nulas e sem default, nesta ordem física:
--      proximo_passo .............. text        — o que o vendedor combinou
--      proximo_passo_vence_em ..... timestamptz — quando vence (Lista do dia)
--      proximo_passo_definido_em .. timestamptz — carimbado pela função
--      proximo_passo_definido_por . text        — nome de quem combinou
--                                                 (`autor_atual()`)
--      carro_na_troca ............. text        — livre, sem regra no banco
--      faixa_entrada .............. text        — faixa de entrada (CHECK)
--      pagamento_pretendido ....... text        — chaves dos motivos de ganho
--                                                 (CHECK, não FK)
--    `proximo_passo_definido_em`, `_por` e `carro_na_troca` NÃO têm
--    comentário em produção, e não ganham aqui. Duas regras nomeadas
--    (`leads_faixa_entrada_valida`, `leads_pagamento_pretendido_valido`) e o
--    índice parcial `leads_proximo_passo_idx` (vencimento, só lead em aberto).
-- 2. A tabela `public.leads_interacoes`: nota, ligação, WhatsApp e visita, com
--    autor e o próximo passo que cada registro definiu. Quatro CHECKs nomeados,
--    FK para `leads` com `on delete cascade` (LGPD art. 18, VI), índice por
--    lead e data, RLS com UMA policy — SELECT para staff. Sem policy e sem
--    grant de escrita para `authenticated`: escrever é da função.
-- 3. A função `public.registrar_interacao_do_lead(...)`, SECURITY DEFINER com
--    guarda de staff: grava o registro e, se vier, o próximo passo no lead,
--    numa transação só. Sem passo, ela mesma reinicia o relógio da estagnação
--    (`ultimo_contato_em`, `alertado_em`). Com passo, quem reinicia é o gatilho
--    — item 4. Sem sessão (chave de serviço) a guarda recusa: `is_staff(null)`
--    é falso, então `service_role` tem EXECUTE mas não passa da primeira linha.
-- 4. A versão viva de `public.leads_antes_de_atualizar()`: a da
--    `20260828160000_desfecho_sem_oportunidade.sql` com UMA condição a mais na
--    lista de toques humanos — `proximo_passo_definido_em` mudou. Conferido
--    com diff em 2026-09-24: o corpo de produção difere do do repositório só
--    por essa linha e pelo comentário que a acompanha. Combinar o próximo
--    passo é atender; o motor (sem sessão) continua não reiniciando nada.
--
-- O que ela NÃO mexeu, conferido no retrato: `leads_eventos_tipo_check` é a
-- mesma lista da 20260828120000 (a função não escreve no rastro — os registros
-- do vendedor moram na tabela nova, e a tela junta as duas na leitura); os
-- grants de `leads`; os demais gatilhos.
--
-- ---------------------------------------------------------------------------
-- 🔴 Divergência registrada, NÃO corrigida: `leads_interacoes` não tem org_id
-- ---------------------------------------------------------------------------
-- A regra do projeto para tabela nova é `org_id uuid not null default
-- org_padrao()` + RLS + policy por papel. Esta tabela nasceu em produção sem
-- `org_id`. Fica registrado aqui e não é corrigido, porque corrigir não é
-- aditivo em relação ao que foi aplicado: este arquivo existe para descrever o
-- banco como ele é, e acrescentar a coluna aqui faria a reaplicação em
-- produção deixar de ser no-op. Se a correção vier, é migração própria, datada
-- depois desta. (`leads`, a tabela-mãe, também não tem `org_id` — é legado.)
--
-- ---------------------------------------------------------------------------
-- Dependências, conferidas nas migrações anteriores do repositório
-- ---------------------------------------------------------------------------
--   * `public.autor_atual()` ....... 20260828120000_funil_de_vendas.sql:450
--   * `public.is_staff(uuid)` ...... versão viva em
--                                    20260821180000_papeis_gestor_e_investidor.sql:73
--   * `leads.desfecho`, `ultimo_contato_em`, `alertado_em` e o gatilho
--     `trg_leads_antes_de_atualizar` .. 20260828120000_funil_de_vendas.sql
--   * a versão anterior de `leads_antes_de_atualizar()` ..
--                                    20260828160000_desfecho_sem_oportunidade.sql:188
--
-- ---------------------------------------------------------------------------
-- Permissões — o retrato, e como este arquivo chega nele
-- ---------------------------------------------------------------------------
--   leads_interacoes .. anon: nada. authenticated: SELECT, REFERENCES, TRIGGER
--                       (INSERT/UPDATE/DELETE/TRUNCATE revogados; REFERENCES e
--                       TRIGGER são o que sobra do default ACL do Supabase, e
--                       ficam como estão em produção). service_role: tudo.
--   a função ......... EXECUTE para o dono, `authenticated` e `service_role`;
--                       sem PUBLIC, sem anon.
-- `service_role` recebe grant EXPLÍCITO aqui (na tabela e na função). Em
-- produção é no-op — o default ACL já tinha dado —, mas num banco sem esse
-- default ACL para funções (o andaime de testes) a ACL não chegaria à de
-- produção sem ele.
--
-- Tudo idempotente e aditivo: `add column if not exists`, `create table if not
-- exists`, constraint só se não existir, `create index if not exists`,
-- `create or replace function`, policy por `drop policy if exists` + `create
-- policy`. Nenhum DROP/RENAME/ALTER TYPE de objeto em uso.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Conferência prévia — o arquivo só reescreve o que ele conhece
-- ----------------------------------------------------------------------------
-- Três coisas aqui são REESCRITAS incondicionalmente: os comentários, as duas
-- funções (`create or replace`) e a policy (`drop` + `create`). Em produção
-- elas já existem, e reescrever com o mesmo texto é no-op — desde que o texto
-- seja mesmo o mesmo. Se o retrato tiver errado uma letra, o `create or
-- replace` trocaria a função de produção pela daqui e ninguém veria. Então,
-- ANTES de mudar qualquer coisa: o que já existe tem de ser idêntico ao
-- retrato (md5 do texto lido de produção), ou a migração para aqui.
--
-- `leads_antes_de_atualizar` aceita duas formas: a de produção (este arquivo
-- já aplicado) e a da 20260828160000 (banco reconstruído pelo repositório, que
-- é justamente o que este arquivo existe para atualizar).
do $previa$
declare
  v_funcao  regprocedure :=
    to_regprocedure('public.registrar_interacao_do_lead(uuid, text, text, text, text, timestamptz)');
  v_md5     text;
  v_caso    record;
  v_atual   text;
begin
  if v_funcao is not null then
    v_md5 := md5(pg_get_functiondef(v_funcao));
    if v_md5 <> 'bcc2a1e4b4348eb0a26d63453e075c2a' then
      raise exception
        'DIVERGÊNCIA: registrar_interacao_do_lead já existe e não é a do retrato de '
        'produção (md5 %). Nada foi aplicado — confira o catálogo antes de seguir.', v_md5;
    end if;

    v_atual := obj_description(v_funcao, 'pg_proc');
    if v_atual is not null and md5(v_atual) <> '87ba171b191b7a608cefa744630d8a61' then
      raise exception
        'DIVERGÊNCIA: o comentário de registrar_interacao_do_lead não é o do retrato. '
        'Nada foi aplicado.';
    end if;
  end if;

  v_md5 := md5(pg_get_functiondef('public.leads_antes_de_atualizar()'::regprocedure));
  if v_md5 not in ('f84d5391f247112c316686eb3d95a273',   -- a de produção
                   '50d73e59bbe1e58d89d9037ea5f22ad5')   -- a da 20260828160000
  then
    raise exception
      'DIVERGÊNCIA: leads_antes_de_atualizar não é nem a de produção nem a da '
      '20260828160000 (md5 %). Recriá-la aqui apagaria uma mudança que este '
      'arquivo não conhece. Nada foi aplicado.', v_md5;
  end if;

  for v_caso in
    select * from (values
      ('public.leads',            'proximo_passo',          '8469cc8b3b84fac5e13a5d68111556e9'),
      ('public.leads',            'proximo_passo_vence_em', 'bda5514382b0ea187964421649542ec1'),
      ('public.leads',            'faixa_entrada',          'a75b13c5edccf8e8aad6dc110a7008ef'),
      ('public.leads',            'pagamento_pretendido',   '0fc9e12936163cba008893888e59e1ff'),
      ('public.leads_interacoes', null,                     '955291fc4bb597ccf2f55bcd23547aec')
    ) as c(tabela, coluna, md5)
  loop
    continue when to_regclass(v_caso.tabela) is null;
    if v_caso.coluna is null then
      v_atual := obj_description(to_regclass(v_caso.tabela), 'pg_class');
    else
      v_atual := col_description(to_regclass(v_caso.tabela),
                   (select attnum from pg_attribute
                     where attrelid = to_regclass(v_caso.tabela)
                       and attname = v_caso.coluna and not attisdropped));
    end if;
    if v_atual is not null and md5(v_atual) <> v_caso.md5 then
      raise exception
        'DIVERGÊNCIA: o comentário de %.% não é o do retrato de produção. Nada foi '
        'aplicado.', v_caso.tabela, coalesce(v_caso.coluna, '(tabela)');
    end if;
  end loop;

  if exists (select 1 from pg_policy
              where polrelid = to_regclass('public.leads_interacoes')
                and polname  = 'leads_interacoes_leitura_staff')
     and not exists (select 1 from pg_policy
                      where polrelid = to_regclass('public.leads_interacoes')
                        and polname  = 'leads_interacoes_leitura_staff'
                        and polcmd   = 'r'
                        and polpermissive
                        and polroles = array['authenticated'::regrole]::oid[]
                        and replace(pg_get_expr(polqual, polrelid), 'public.', '')
                              = 'is_staff(auth.uid())'
                        and polwithcheck is null)
  then
    raise exception
      'DIVERGÊNCIA: a policy leads_interacoes_leitura_staff existe e não é a do '
      'retrato (SELECT, authenticated, is_staff). Nada foi aplicado.';
  end if;
end $previa$;


-- ----------------------------------------------------------------------------
-- 1. As colunas do lead
-- ----------------------------------------------------------------------------
-- Uma instrução só, nesta ordem: é a ordem física (attnum) de produção.
alter table public.leads
  add column if not exists proximo_passo              text,
  add column if not exists proximo_passo_vence_em     timestamptz,
  add column if not exists proximo_passo_definido_em  timestamptz,
  add column if not exists proximo_passo_definido_por text,
  add column if not exists carro_na_troca             text,
  add column if not exists faixa_entrada              text,
  add column if not exists pagamento_pretendido       text;


-- ----------------------------------------------------------------------------
-- 2. As regras do lead, nomeadas
-- ----------------------------------------------------------------------------
-- Em bloco porque `add constraint` não tem `if not exists` (mesmo gesto da
-- 20260924190000).
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.leads'::regclass
                    and conname = 'leads_faixa_entrada_valida') then
    alter table public.leads
      add constraint leads_faixa_entrada_valida
      check (faixa_entrada is null
             or faixa_entrada in ('sem_entrada', 'ate_5k', 'de_5k_a_10k',
                                  'de_10k_a_20k', 'acima_20k'));
  end if;

  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.leads'::regclass
                    and conname = 'leads_pagamento_pretendido_valido') then
    alter table public.leads
      add constraint leads_pagamento_pretendido_valido
      check (pagamento_pretendido is null
             or pagamento_pretendido in ('a_vista', 'financiado', 'com_troca', 'consorcio'));
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 3. O que as colunas são — os comentários de produção, letra por letra
-- ----------------------------------------------------------------------------
comment on column public.leads.proximo_passo is
  'O que o vendedor combinou fazer a seguir (2026-09-23). Obrigatório em todo '
  'registro enquanto o lead está aberto — a regra mora em `decidirInteracao` '
  '(lib/gestaoDoLead) e na rota, não aqui. É o que o card mostra.';

comment on column public.leads.proximo_passo_vence_em is
  'Quando o próximo passo vence. Ordena a Lista do dia (Atrasados / Hoje / '
  'Próximos).';

comment on column public.leads.faixa_entrada is
  'Quanto o cliente pretende dar de entrada, em faixas: sem_entrada, ate_5k, '
  'de_5k_a_10k, de_10k_a_20k, acima_20k.';

comment on column public.leads.pagamento_pretendido is
  'Como o cliente pretende pagar. As MESMAS chaves dos motivos de ganho '
  '(a_vista, financiado, com_troca, consorcio), para a caixa de ganho abrir '
  'com o motivo que casa pré-selecionado. Check e não FK: motivo é editável e '
  'desativável, e desativar não pode apagar a intenção registrada no lead.';


-- ----------------------------------------------------------------------------
-- 4. A Lista do dia lê por vencimento, só lead em aberto
-- ----------------------------------------------------------------------------
create index if not exists leads_proximo_passo_idx
  on public.leads (proximo_passo_vence_em)
  where desfecho is null;


-- ----------------------------------------------------------------------------
-- 5. Os registros do vendedor
-- ----------------------------------------------------------------------------
-- `on delete cascade` pelo mesmo motivo jurídico de `leads_eventos`: a exclusão
-- de lead existe porque o titular pediu (LGPD art. 18, VI).
create table if not exists public.leads_interacoes (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references public.leads(id) on delete cascade,
  tipo           text not null,
  resultado      text,
  texto          text,
  autor          text,
  passo_texto    text,
  passo_vence_em timestamptz,
  importada      boolean not null default false,
  criado_em      timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.leads_interacoes'::regclass
                    and conname = 'leads_interacoes_tipo_valido') then
    alter table public.leads_interacoes
      add constraint leads_interacoes_tipo_valido
      check (tipo in ('nota', 'ligacao', 'whatsapp', 'visita'));
  end if;

  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.leads_interacoes'::regclass
                    and conname = 'leads_interacoes_resultado_valido') then
    alter table public.leads_interacoes
      add constraint leads_interacoes_resultado_valido
      check (resultado is null
             or resultado in ('atendeu', 'nao_atendeu', 'caixa_postal'));
  end if;

  -- Resultado é coisa de ligação: "atendeu" numa nota não significa nada.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.leads_interacoes'::regclass
                    and conname = 'leads_interacoes_resultado_so_em_ligacao') then
    alter table public.leads_interacoes
      add constraint leads_interacoes_resultado_so_em_ligacao
      check (resultado is null or tipo = 'ligacao');
  end if;

  -- Registro vazio não entra. A única forma sem texto é a ligação com
  -- resultado — "liguei, caixa postal" já diz alguma coisa.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.leads_interacoes'::regclass
                    and conname = 'leads_interacoes_diz_alguma_coisa') then
    alter table public.leads_interacoes
      add constraint leads_interacoes_diz_alguma_coisa
      check (nullif(trim(texto), '') is not null
             or (tipo = 'ligacao' and resultado is not null));
  end if;
end $$;

create index if not exists leads_interacoes_lead_idx
  on public.leads_interacoes (lead_id, criado_em desc);

comment on table public.leads_interacoes is
  'Os registros do vendedor sobre o lead (2026-09-23): nota, ligação, WhatsApp '
  'e visita, com autor, data e o próximo passo que cada um definiu. Separada '
  'de `leads_eventos` (o rastro do sistema); a tela junta as duas na leitura. '
  'Escrita só por `registrar_interacao_do_lead`. Cascateia na exclusão do lead '
  '(LGPD art. 18, VI). Ver docs/GESTAO_DO_LEAD.md.';


-- ----------------------------------------------------------------------------
-- 6. RLS, policy e grants
-- ----------------------------------------------------------------------------
alter table public.leads_interacoes enable row level security;

drop policy if exists leads_interacoes_leitura_staff on public.leads_interacoes;
create policy leads_interacoes_leitura_staff on public.leads_interacoes
  for select to authenticated using (public.is_staff(auth.uid()));

-- O default ACL do Supabase dá a tabela inteira a anon e authenticated no
-- nascimento. anon sai por completo; authenticated perde a escrita e fica com
-- o SELECT (que a policy recorta para staff) — REFERENCES e TRIGGER sobram do
-- default ACL, como em produção.
revoke all on public.leads_interacoes from anon;
revoke insert, update, delete, truncate on public.leads_interacoes from authenticated;
grant select on public.leads_interacoes to authenticated;
grant select, insert, update, delete, truncate, references, trigger
  on public.leads_interacoes to service_role;


-- ----------------------------------------------------------------------------
-- 7. registrar_interacao_do_lead — o corpo de produção, byte a byte
-- ----------------------------------------------------------------------------
create or replace function public.registrar_interacao_do_lead(
  p_lead      uuid,
  p_tipo      text,
  p_resultado text        default null,
  p_texto     text        default null,
  p_passo     text        default null,
  p_vence_em  timestamptz default null
)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_id    uuid;
  v_autor text := public.autor_atual();
  v_passo text := nullif(trim(p_passo), '');
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Registrar interação é restrito à equipe.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.leads where id = p_lead) then
    raise exception 'LEAD_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;

  -- Passo sem data, ou data sem passo, é meio compromisso: o card não saberia
  -- o que mostrar nem quando avisar.
  if (v_passo is null) <> (p_vence_em is null) then
    raise exception 'O próximo passo precisa de texto e de data, juntos.'
      using errcode = 'check_violation';
  end if;

  insert into public.leads_interacoes
    (lead_id, tipo, resultado, texto, autor, passo_texto, passo_vence_em)
  values
    (p_lead, p_tipo, p_resultado, nullif(trim(p_texto), ''), v_autor, v_passo, p_vence_em)
  returning id into v_id;

  if v_passo is not null then
    update public.leads
       set proximo_passo              = v_passo,
           proximo_passo_vence_em     = p_vence_em,
           proximo_passo_definido_em  = now(),
           proximo_passo_definido_por = v_autor
     where id = p_lead;
  else
    update public.leads
       set ultimo_contato_em = now(),
           alertado_em       = null
     where id = p_lead;
  end if;

  return v_id;
end $$;

comment on function public.registrar_interacao_do_lead(uuid, text, text, text, text, timestamptz) is
  'Grava um registro do vendedor e, se vier, o próximo passo no lead — numa '
  'transação só (2026-09-23). Reinicia o relógio da estagnação. SECURITY '
  'DEFINER com guarda de staff: `leads_interacoes` não tem policy de INSERT.';

revoke all on function public.registrar_interacao_do_lead(uuid, text, text, text, text, timestamptz)
  from public, anon;
grant execute on function public.registrar_interacao_do_lead(uuid, text, text, text, text, timestamptz)
  to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 8. O gatilho do lead — a versão viva de produção
-- ----------------------------------------------------------------------------
-- Idêntica à da 20260828160000 mais a condição de `proximo_passo_definido_em`.
-- O corpo é o de produção byte a byte (o comentário de dentro inclusive):
-- `pg_get_functiondef` o devolve assim, e a autoconferência cobra o md5.
-- O gatilho `trg_leads_antes_de_atualizar` não muda — só a função que ele chama.
create or replace function public.leads_antes_de_atualizar()
  returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  v_tipo   text;
  v_humano boolean := auth.uid() is not null;
begin
  if new.situacao is distinct from old.situacao then
    new.ultimo_movimento_em := now();

    select tipo into v_tipo from public.funil_etapas where chave = new.situacao;

    if v_tipo in ('ganho', 'perdido', 'descartado') then
      -- A etapa terminal carimba o desfecho na hora. O MOTIVO continua vazio
      -- de propósito: quem escolhe é a pessoa, na tela.
      if new.desfecho is distinct from v_tipo then
        new.desfecho    := v_tipo;
        new.desfecho_em := now();
      end if;
    elsif old.desfecho is not null and new.desfecho is not distinct from old.desfecho then
      -- Voltou para o funil: o negócio reabriu. Vale igual para o descarte —
      -- spam marcado por engano volta a ser lead, e não pode arrastar o
      -- carimbo antigo.
      new.desfecho        := null;
      new.desfecho_em     := null;
      new.desfecho_motivo := null;
      new.desfecho_valor  := null;
      new.desfecho_nota   := null;
    end if;
  end if;

  if new.responsavel is distinct from old.responsavel then
    new.responsavel_anterior := old.responsavel;
    new.responsavel_desde    := now();
  end if;

  if v_humano and (
       new.situacao    is distinct from old.situacao
    or new.responsavel is distinct from old.responsavel
    or new.observacoes is distinct from old.observacoes
    or new.desfecho    is distinct from old.desfecho
    -- 2026-09-23: combinar o próximo passo é atender.
    or new.proximo_passo_definido_em is distinct from old.proximo_passo_definido_em
  ) then
    new.ultimo_contato_em := now();
    new.alertado_em := null;
  end if;

  new.atualizado_em := now();
  return new;
end $$;


-- ============================================================================
-- Autoconferência — o retrato de produção, cobrado do banco
-- ============================================================================
-- Duas metades.
--
-- ESTRUTURA: cada objeto comparado com o texto lido de produção — definição de
-- constraint e de índice por `pg_get_constraintdef`/`pg_get_indexdef`, as duas
-- funções pelo md5 de `pg_get_functiondef` (o retrato É a saída dessa função
-- em produção), comentários pelo md5, colunas com tipo/nulidade/default na
-- ordem física, grants e ACL papel a papel.
--
-- EFEITO: uma sonda (um lead, um vendedor staff) desfeita por sentinela — o
-- rollback do sub-bloco leva a sonda, o rastro dela, o usuário de teste e
-- qualquer `set local role`/claims junto. As variáveis sobrevivem (plpgsql não
-- desfaz variável), e é por elas que o veredito sai depois. Nenhuma data fixa:
-- tudo é relativo a `now()`, que é constante dentro da transação — o aceite
-- não fica vermelho com a passagem do tempo (a lição da 20260828120000).
do $aceite$
declare
  falhas          int := 0;
  v_caso          record;
  v_txt           text;
  v_msg           text;
  v_regra         text;
  v_privs         text;
  v_valor         text;
  v_esperado      text;
  v_funcao        regprocedure :=
    to_regprocedure('public.registrar_interacao_do_lead(uuid, text, text, text, text, timestamptz)');

  -- a sonda
  v_staff         uuid;
  v_cliente       uuid := gen_random_uuid();
  v_lead          uuid;
  v_vence         timestamptz := now() + interval '1 day';
  v_int_nota      uuid;
  v_int_lig       uuid;

  -- o que a sonda leu antes de ser desfeita
  v_passo         text;
  v_passo_vence   timestamptz;
  v_def_em        timestamptz;
  v_def_por       text;
  v_contato_1     timestamptz;
  v_alertado_1    timestamptz;
  v_contato_2     timestamptz;
  v_alertado_2    timestamptz;
  v_passo_2       text;
  v_contato_motor timestamptz;
  v_alertado_motor timestamptz;
  v_autor         text;
  v_texto         text;
  v_importada     boolean;
  v_criado        timestamptz;
  v_lig_resultado text;
  v_lig_texto     text;
  v_total_dono    int := -1;
  v_anon_le       text := '<não rodou>';
  v_anon_rpc      text := '<não rodou>';
  v_cli_le        int := -1;
  v_cli_rpc       text := '<não rodou>';
  v_cli_escreve   text := '<não rodou>';
  v_staff_le      int := -1;
  v_staff_insere  text := '<não rodou>';
  v_staff_altera  text := '<não rodou>';
  v_staff_apaga   text := '<não rodou>';
  v_meio_passo    int := 0;
  v_sem_lead      text := '<não rodou>';
  v_tipo_ruim     text := '<não rodou>';
  v_texto_vazio   text := '<não rodou>';
  v_cascata       int := -1;
  v_restou        int;
begin
  -- ==========================================================================
  -- ESTRUTURA
  -- ==========================================================================

  -- 1 · As sete colunas do lead: tipo, nulas, sem default, na ordem de produção.
  select string_agg(format('%s %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                           case when a.attnotnull then ' not null' else '' end,
                           coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')),
                    ', ' order by a.attnum)
    into v_txt
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.leads'::regclass
     and a.attname in ('proximo_passo', 'proximo_passo_vence_em', 'proximo_passo_definido_em',
                       'proximo_passo_definido_por', 'carro_na_troca', 'faixa_entrada',
                       'pagamento_pretendido')
     and not a.attisdropped;
  v_esperado :=
    'proximo_passo text, proximo_passo_vence_em timestamp with time zone, '
    'proximo_passo_definido_em timestamp with time zone, proximo_passo_definido_por text, '
    'carro_na_troca text, faixa_entrada text, pagamento_pretendido text';
  if v_txt is distinct from v_esperado then
    raise exception E'ACEITE FALHOU: as colunas novas de leads não são as de produção.\n  veio:     %\n  esperado: %',
      coalesce(v_txt, '<nenhuma>'), v_esperado;
  end if;

  -- 2 · As colunas de `leads_interacoes`, na ordem, com nulidade e default.
  select string_agg(format('%s %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                           case when a.attnotnull then ' not null' else '' end,
                           coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')),
                    ', ' order by a.attnum)
    into v_txt
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.leads_interacoes'::regclass
     and a.attnum > 0 and not a.attisdropped;
  v_esperado :=
    'id uuid not null default gen_random_uuid(), lead_id uuid not null, tipo text not null, '
    'resultado text, texto text, autor text, passo_texto text, '
    'passo_vence_em timestamp with time zone, importada boolean not null default false, '
    'criado_em timestamp with time zone not null default now()';
  if v_txt is distinct from v_esperado then
    raise exception E'ACEITE FALHOU: leads_interacoes não tem as colunas de produção.\n  veio:     %\n  esperado: %',
      coalesce(v_txt, '<nenhuma>'), v_esperado;
  end if;

  -- 3 · As constraints — a definição que o Postgres devolve, igual à de produção.
  --     (`replace` de `public.` porque o deparse qualifica o nome quando o
  --     search_path não inclui `public`; o retrato foi lido com ele.)
  for v_caso in
    select * from (values
      ('public.leads', 'leads_faixa_entrada_valida',
       'CHECK (((faixa_entrada IS NULL) OR (faixa_entrada = ANY (ARRAY[''sem_entrada''::text, ''ate_5k''::text, ''de_5k_a_10k''::text, ''de_10k_a_20k''::text, ''acima_20k''::text]))))'),
      ('public.leads', 'leads_pagamento_pretendido_valido',
       'CHECK (((pagamento_pretendido IS NULL) OR (pagamento_pretendido = ANY (ARRAY[''a_vista''::text, ''financiado''::text, ''com_troca''::text, ''consorcio''::text]))))'),
      ('public.leads_interacoes', 'leads_interacoes_pkey',
       'PRIMARY KEY (id)'),
      ('public.leads_interacoes', 'leads_interacoes_lead_id_fkey',
       'FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE'),
      ('public.leads_interacoes', 'leads_interacoes_tipo_valido',
       'CHECK ((tipo = ANY (ARRAY[''nota''::text, ''ligacao''::text, ''whatsapp''::text, ''visita''::text])))'),
      ('public.leads_interacoes', 'leads_interacoes_resultado_valido',
       'CHECK (((resultado IS NULL) OR (resultado = ANY (ARRAY[''atendeu''::text, ''nao_atendeu''::text, ''caixa_postal''::text]))))'),
      ('public.leads_interacoes', 'leads_interacoes_resultado_so_em_ligacao',
       'CHECK (((resultado IS NULL) OR (tipo = ''ligacao''::text)))'),
      ('public.leads_interacoes', 'leads_interacoes_diz_alguma_coisa',
       'CHECK (((NULLIF(TRIM(BOTH FROM texto), ''''::text) IS NOT NULL) OR ((tipo = ''ligacao''::text) AND (resultado IS NOT NULL))))')
    ) as c(tabela, nome, definicao)
  loop
    select replace(pg_get_constraintdef(oid), 'public.', '') into v_txt
      from pg_constraint
     where conrelid = v_caso.tabela::regclass and conname = v_caso.nome and convalidated;
    if v_txt is distinct from v_caso.definicao then
      falhas := falhas + 1;
      raise warning 'FALHOU: %.% é "%", em produção é "%"',
        v_caso.tabela, v_caso.nome, coalesce(v_txt, '<ausente ou não validada>'), v_caso.definicao;
    end if;
  end loop;

  if (select count(*) from pg_constraint
       where conrelid = 'public.leads_interacoes'::regclass) <> 6 then
    falhas := falhas + 1;
    raise warning 'FALHOU: leads_interacoes tem constraint que produção não tem (esperado 6)';
  end if;

  -- 4 · Os índices.
  for v_caso in
    select * from (values
      ('leads_proximo_passo_idx',
       'CREATE INDEX leads_proximo_passo_idx ON public.leads USING btree (proximo_passo_vence_em) WHERE (desfecho IS NULL)'),
      ('leads_interacoes_lead_idx',
       'CREATE INDEX leads_interacoes_lead_idx ON public.leads_interacoes USING btree (lead_id, criado_em DESC)')
    ) as c(nome, definicao)
  loop
    select pg_get_indexdef(to_regclass('public.' || v_caso.nome)) into v_txt;
    if v_txt is distinct from v_caso.definicao then
      falhas := falhas + 1;
      raise warning 'FALHOU: índice % é "%", em produção é "%"',
        v_caso.nome, coalesce(v_txt, '<ausente>'), v_caso.definicao;
    end if;
  end loop;

  -- 5 · RLS ligada e não forçada; uma policy só, a de leitura do staff; nenhum
  --     gatilho de usuário na tabela.
  if not exists (select 1 from pg_class
                  where oid = 'public.leads_interacoes'::regclass
                    and relrowsecurity and not relforcerowsecurity) then
    falhas := falhas + 1;
    raise warning 'FALHOU: leads_interacoes sem RLS ligada (ou com RLS forçada — produção não força)';
  end if;

  select string_agg(format('%s/%s/%s/%s/%s', polname, polcmd, polpermissive::text,
                           array_to_string(polroles::regrole[], ','),
                           replace(pg_get_expr(polqual, polrelid), 'public.', '')), '; ')
    into v_txt
    from pg_policy where polrelid = 'public.leads_interacoes'::regclass;
  if v_txt is distinct from 'leads_interacoes_leitura_staff/r/true/authenticated/is_staff(auth.uid())' then
    falhas := falhas + 1;
    raise warning 'FALHOU: as policies de leads_interacoes são "%" — produção tem só a leitura do staff',
      coalesce(v_txt, '<nenhuma>');
  end if;

  if exists (select 1 from pg_trigger
              where tgrelid = 'public.leads_interacoes'::regclass and not tgisinternal) then
    falhas := falhas + 1;
    raise warning 'FALHOU: leads_interacoes tem gatilho — produção não tem nenhum';
  end if;

  -- 6 · Grants da tabela, papel a papel. `has_table_privilege` enxerga também
  --     o que viria por PUBLIC.
  for v_caso in
    select * from (values
      ('anon',          ''),
      ('authenticated', 'SELECT,REFERENCES,TRIGGER'),
      ('service_role',  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    ) as c(papel, esperado)
  loop
    select coalesce(string_agg(p, ',' order by o), '') into v_privs
      from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])
           with ordinality as u(p, o)
     where has_table_privilege(v_caso.papel, 'public.leads_interacoes', p);
    if v_privs <> v_caso.esperado then
      falhas := falhas + 1;
      raise warning 'FALHOU: % tem em leads_interacoes "%", em produção "%"',
        v_caso.papel, v_privs, v_caso.esperado;
    end if;
  end loop;

  -- 7 · A função: o texto de produção byte a byte (argumentos, defaults,
  --     SECURITY DEFINER, search_path e corpo), o comentário e a ACL.
  if v_funcao is null then
    raise exception 'ACEITE FALHOU: registrar_interacao_do_lead não existe';
  end if;
  if md5(pg_get_functiondef(v_funcao)) <> 'bcc2a1e4b4348eb0a26d63453e075c2a' then
    falhas := falhas + 1;
    raise warning 'FALHOU: registrar_interacao_do_lead difere da de produção (md5 %)',
      md5(pg_get_functiondef(v_funcao));
  end if;
  if md5(coalesce(obj_description(v_funcao, 'pg_proc'), '')) <> '87ba171b191b7a608cefa744630d8a61' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o comentário de registrar_interacao_do_lead não é o de produção';
  end if;

  -- Quem executa, fora o dono: authenticated e service_role — nem PUBLIC, nem anon.
  select string_agg(g.nome, ',' order by g.nome)
    into v_txt
    from (select case when x.grantee = 0 then 'PUBLIC' else x.grantee::regrole::text end as nome
            from pg_proc p, aclexplode(p.proacl) x
           where p.oid = v_funcao and x.privilege_type = 'EXECUTE'
             and x.grantee <> p.proowner) g;
  if v_txt is distinct from 'authenticated,service_role' then
    falhas := falhas + 1;
    raise warning 'FALHOU: EXECUTE de registrar_interacao_do_lead está com "%", em produção '
                  '"authenticated,service_role"', coalesce(v_txt, '<ACL padrão: PUBLIC>');
  end if;
  if has_function_privilege('anon', v_funcao, 'EXECUTE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon executa registrar_interacao_do_lead';
  end if;

  -- 8 · O gatilho do lead: a versão de produção, ainda pendurada em `leads`.
  if md5(pg_get_functiondef('public.leads_antes_de_atualizar()'::regprocedure))
       <> 'f84d5391f247112c316686eb3d95a273' then
    falhas := falhas + 1;
    raise warning 'FALHOU: leads_antes_de_atualizar difere da de produção (md5 %)',
      md5(pg_get_functiondef('public.leads_antes_de_atualizar()'::regprocedure));
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.leads'::regclass
                    and tgname  = 'trg_leads_antes_de_atualizar'
                    and tgfoid  = 'public.leads_antes_de_atualizar()'::regprocedure
                    and tgenabled <> 'D') then
    falhas := falhas + 1;
    raise warning 'FALHOU: trg_leads_antes_de_atualizar não está ligado à função em leads';
  end if;

  -- 9 · Os comentários: os quatro de coluna e o da tabela iguais aos de
  --     produção; os três que produção não tem, ausentes.
  for v_caso in
    select * from (values
      ('proximo_passo',              '8469cc8b3b84fac5e13a5d68111556e9'),
      ('proximo_passo_vence_em',     'bda5514382b0ea187964421649542ec1'),
      ('faixa_entrada',              'a75b13c5edccf8e8aad6dc110a7008ef'),
      ('pagamento_pretendido',       '0fc9e12936163cba008893888e59e1ff'),
      ('proximo_passo_definido_em',  null),
      ('proximo_passo_definido_por', null),
      ('carro_na_troca',             null)
    ) as c(coluna, md5)
  loop
    v_txt := col_description('public.leads'::regclass,
               (select attnum from pg_attribute
                 where attrelid = 'public.leads'::regclass and attname = v_caso.coluna));
    if md5(v_txt) is distinct from v_caso.md5 then
      falhas := falhas + 1;
      raise warning 'FALHOU: o comentário de leads.% não é o de produção (%)',
        v_caso.coluna, coalesce(left(v_txt, 40) || '…', '<ausente>');
    end if;
  end loop;
  if md5(coalesce(obj_description('public.leads_interacoes'::regclass, 'pg_class'), ''))
       <> '955291fc4bb597ccf2f55bcd23547aec' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o comentário de leads_interacoes não é o de produção';
  end if;

  -- ==========================================================================
  -- EFEITO — tudo daqui até o sentinela é desfeito
  -- ==========================================================================
  begin
    -- A sonda: um vendedor staff (o mesmo gesto do aceite da 20260828120000)
    -- e um lead. O cliente da Garagem é só um `sub` sem perfil — authenticated
    -- sem staff, que é o que ele é.
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'aceite-gestao-lead@exemplo.invalido', now(), now())
    returning id into v_staff;
    update public.profiles
       set full_name = 'Aceite Gestão do Lead', papeis = array['comercial'], role = 'comercial'
     where id = v_staff;

    insert into public.leads (nome, telefone, interesse)
    values ('Aceite Gestão do Lead', '5541999990923', 'Teste Aceite 2021')
    returning id into v_lead;

    -- E1 · As regras do lead recusam o inventado e aceitam as chaves.
    for v_caso in
      select * from (values
        ('faixa_entrada',        'ate_5mil',   false),
        ('faixa_entrada',        'ACIMA_20K',  false),
        ('faixa_entrada',        '',           false),
        ('faixa_entrada',        'sem_entrada', true),
        ('faixa_entrada',        'ate_5k',      true),
        ('faixa_entrada',        'de_5k_a_10k', true),
        ('faixa_entrada',        'de_10k_a_20k', true),
        ('faixa_entrada',        'acima_20k',   true),
        ('pagamento_pretendido', 'pix',        false),
        ('pagamento_pretendido', 'a vista',    false),
        ('pagamento_pretendido', 'cartao',     false),
        ('pagamento_pretendido', 'a_vista',     true),
        ('pagamento_pretendido', 'financiado',  true),
        ('pagamento_pretendido', 'com_troca',   true),
        ('pagamento_pretendido', 'consorcio',   true)
      ) as c(coluna, valor, aceita)
    loop
      begin
        execute format('update public.leads set %I = $1 where id = $2', v_caso.coluna)
          using v_caso.valor, v_lead;
        if not v_caso.aceita then
          falhas := falhas + 1;
          raise warning 'FALHOU: leads.% aceitou "%"', v_caso.coluna, v_caso.valor;
        end if;
      exception when check_violation then
        if v_caso.aceita then
          falhas := falhas + 1;
          raise warning 'FALHOU: leads.% recusou "%", que é chave válida', v_caso.coluna, v_caso.valor;
        end if;
      end;
    end loop;

    -- E2 · As regras de `leads_interacoes`, cada recusa pela regra CERTA —
    --      gravando direto, como a chave de serviço gravaria.
    for v_caso in
      select * from (values
        ('email',    null,          'Mandou e-mail', 'leads_interacoes_tipo_valido'),
        ('nota',     'atendeu',     'Anotou',        'leads_interacoes_resultado_so_em_ligacao'),
        ('ligacao',  'ocupado',     null,            'leads_interacoes_resultado_valido'),
        ('nota',     null,          '   ',           'leads_interacoes_diz_alguma_coisa'),
        ('whatsapp', null,          null,            'leads_interacoes_diz_alguma_coisa'),
        ('ligacao',  null,          null,            'leads_interacoes_diz_alguma_coisa')
      ) as c(tipo, resultado, texto, regra)
    loop
      begin
        insert into public.leads_interacoes (lead_id, tipo, resultado, texto)
        values (v_lead, v_caso.tipo, v_caso.resultado, v_caso.texto);
        falhas := falhas + 1;
        raise warning 'FALHOU: leads_interacoes aceitou (%, %, %)',
          v_caso.tipo, coalesce(v_caso.resultado, 'null'), coalesce(v_caso.texto, 'null');
      exception when check_violation then
        get stacked diagnostics v_regra = constraint_name;
        if v_regra is distinct from v_caso.regra then
          falhas := falhas + 1;
          raise warning 'FALHOU: (%, %, %) foi recusado por "%", esperado "%"',
            v_caso.tipo, coalesce(v_caso.resultado, 'null'), coalesce(v_caso.texto, 'null'),
            v_regra, v_caso.regra;
        end if;
      end;
    end loop;

    -- E3 · As formas válidas entram — inclusive a ligação sem texto com resultado.
    begin
      insert into public.leads_interacoes (lead_id, tipo, resultado, texto) values
        (v_lead, 'ligacao',  'caixa_postal', null),
        (v_lead, 'ligacao',  'atendeu',      'Falou com a esposa, retorna amanhã'),
        (v_lead, 'visita',   null,           'Veio ver o carro'),
        (v_lead, 'whatsapp', null,           'Mandou áudio pedindo fotos');
    exception when check_violation then
      get stacked diagnostics v_regra = constraint_name;
      raise exception 'ACEITE FALHOU: registro válido recusado por "%"', v_regra;
    end;

    -- E4 · A FK: registro de lead que não existe não entra.
    begin
      insert into public.leads_interacoes (lead_id, tipo, texto)
      values (gen_random_uuid(), 'nota', 'Lead fantasma');
      falhas := falhas + 1;
      raise warning 'FALHOU: leads_interacoes aceitou lead inexistente';
    exception when foreign_key_violation then null;
    end;

    -- E5 · anon: nem lê a tabela, nem executa a função — pelo PRIVILÉGIO, não
    --      pela RLS nem pela guarda (a mensagem da guarda denunciaria o grant).
    begin
      set local role anon;
      perform 1 from public.leads_interacoes limit 1;
      reset role;
      v_anon_le := 'leu';
    exception when insufficient_privilege then v_anon_le := 'negado';
    end;

    begin
      set local role anon;
      perform public.registrar_interacao_do_lead(v_lead, 'nota', null, 'anon tentou');
      reset role;
      v_anon_rpc := 'executou';
    exception when insufficient_privilege then
      get stacked diagnostics v_msg = message_text;
      v_anon_rpc := case when v_msg = 'Registrar interação é restrito à equipe.'
                         then 'barrado só pela guarda' else 'negado' end;
    end;

    -- E6 · O cliente da Garagem (authenticated, sem staff): lê zero linhas,
    --      não grava direto e a guarda da função o recusa.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_cliente, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into v_cli_le from public.leads_interacoes where lead_id = v_lead;
      reset role;
      perform set_config('request.jwt.claims', '', true);
    exception when insufficient_privilege then v_cli_le := -2;  -- sem SELECT: o painel também não leria
    end;

    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_cliente, 'role', 'authenticated')::text, true);
      set local role authenticated;
      insert into public.leads_interacoes (lead_id, tipo, texto) values (v_lead, 'nota', 'cliente');
      reset role;
      perform set_config('request.jwt.claims', '', true);
      v_cli_escreve := 'gravou';
    exception when insufficient_privilege then v_cli_escreve := 'negado';
    end;

    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_cliente, 'role', 'authenticated')::text, true);
      set local role authenticated;
      perform public.registrar_interacao_do_lead(v_lead, 'nota', null, 'cliente tentou');
      reset role;
      perform set_config('request.jwt.claims', '', true);
      v_cli_rpc := 'executou';
    exception when insufficient_privilege then
      get stacked diagnostics v_msg = message_text;
      v_cli_rpc := v_msg;
    end;

    -- E7 · O staff registra uma NOTA COM PRÓXIMO PASSO. Antes, o lead fica
    --      "cobrado": contato velho e alerta recente — gravados sem sessão, que
    --      é o motor, e o motor não reinicia relógio.
    update public.leads
       set ultimo_contato_em = now() - interval '5 days',
           alertado_em       = now() - interval '2 hours'
     where id = v_lead;

    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
      set local role authenticated;
      v_int_nota := public.registrar_interacao_do_lead(
        v_lead, 'nota', null, '  Cliente pediu fotos do interior  ',
        'Mandar fotos do interior', v_vence);
      reset role;
      perform set_config('request.jwt.claims', '', true);
    exception when others then
      raise exception 'ACEITE FALHOU: o staff não conseguiu registrar a nota com passo (%): %',
        sqlstate, sqlerrm;
    end;

    select proximo_passo, proximo_passo_vence_em, proximo_passo_definido_em,
           proximo_passo_definido_por, ultimo_contato_em, alertado_em
      into v_passo, v_passo_vence, v_def_em, v_def_por, v_contato_1, v_alertado_1
      from public.leads where id = v_lead;
    select autor, texto, importada, criado_em
      into v_autor, v_texto, v_importada, v_criado
      from public.leads_interacoes where id = v_int_nota;

    -- E8 · O staff registra uma LIGAÇÃO SEM TEXTO E SEM PASSO. O relógio
    --      reinicia pela própria função; o passo anterior fica onde estava.
    update public.leads
       set ultimo_contato_em = now() - interval '5 days',
           alertado_em       = now() - interval '2 hours'
     where id = v_lead;

    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
      set local role authenticated;
      v_int_lig := public.registrar_interacao_do_lead(v_lead, 'ligacao', 'nao_atendeu');
      reset role;
      perform set_config('request.jwt.claims', '', true);
    exception when others then
      raise exception 'ACEITE FALHOU: o staff não conseguiu registrar a ligação sem passo (%): %',
        sqlstate, sqlerrm;
    end;

    select ultimo_contato_em, alertado_em, proximo_passo
      into v_contato_2, v_alertado_2, v_passo_2
      from public.leads where id = v_lead;
    select resultado, texto into v_lig_resultado, v_lig_texto
      from public.leads_interacoes where id = v_int_lig;

    -- E9 · Meio compromisso é recusado: passo sem data, data sem passo, passo
    --      em branco com data. E nada é gravado quando recusa.
    for v_caso in
      select * from (values
        ('Ligar de novo', null::timestamptz),
        (null,            now() + interval '2 days'),
        ('   ',           now() + interval '2 days')
      ) as c(passo, vence)
    loop
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
        set local role authenticated;
        perform public.registrar_interacao_do_lead(
          v_lead, 'nota', null, 'Tentativa', v_caso.passo, v_caso.vence);
        reset role;
        perform set_config('request.jwt.claims', '', true);
        falhas := falhas + 1;
        raise warning 'FALHOU: meio compromisso aceito (passo "%", vence %)',
          coalesce(v_caso.passo, 'null'), coalesce(v_caso.vence::text, 'null');
      exception when check_violation then
        get stacked diagnostics v_msg = message_text;
        if v_msg = 'O próximo passo precisa de texto e de data, juntos.' then
          v_meio_passo := v_meio_passo + 1;
        end if;
      end;
    end loop;

    -- E10 · Lead que não existe, tipo inventado e nota vazia, pela função.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
      set local role authenticated;
      perform public.registrar_interacao_do_lead(gen_random_uuid(), 'nota', null, 'Fantasma');
      reset role;
      perform set_config('request.jwt.claims', '', true);
      v_sem_lead := 'aceitou';
    exception when no_data_found then
      get stacked diagnostics v_msg = message_text;
      v_sem_lead := v_msg;
    end;

    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
      set local role authenticated;
      perform public.registrar_interacao_do_lead(v_lead, 'email', null, 'Mandou e-mail');
      reset role;
      perform set_config('request.jwt.claims', '', true);
      v_tipo_ruim := 'aceitou';
    exception when check_violation then
      get stacked diagnostics v_tipo_ruim = constraint_name;
    end;

    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
      set local role authenticated;
      perform public.registrar_interacao_do_lead(v_lead, 'nota', null, '    ');
      reset role;
      perform set_config('request.jwt.claims', '', true);
      v_texto_vazio := 'aceitou';
    exception when check_violation then
      get stacked diagnostics v_texto_vazio = constraint_name;
    end;

    -- E11 · O staff LÊ tudo do lead, e não escreve na tabela por fora da função.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into v_staff_le from public.leads_interacoes where lead_id = v_lead;
      reset role;
      perform set_config('request.jwt.claims', '', true);
    exception when insufficient_privilege then v_staff_le := -2;
    end;

    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
      set local role authenticated;
      insert into public.leads_interacoes (lead_id, tipo, texto) values (v_lead, 'nota', 'por fora');
      reset role;
      perform set_config('request.jwt.claims', '', true);
      v_staff_insere := 'gravou';
    exception when insufficient_privilege then v_staff_insere := 'negado';
    end;

    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
      set local role authenticated;
      update public.leads_interacoes set texto = 'reescrito' where id = v_int_nota;
      reset role;
      perform set_config('request.jwt.claims', '', true);
      v_staff_altera := 'alterou';
    exception when insufficient_privilege then v_staff_altera := 'negado';
    end;

    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
      set local role authenticated;
      delete from public.leads_interacoes where id = v_int_nota;
      reset role;
      perform set_config('request.jwt.claims', '', true);
      v_staff_apaga := 'apagou';
    exception when insufficient_privilege then v_staff_apaga := 'negado';
    end;

    select count(*) into v_total_dono from public.leads_interacoes where lead_id = v_lead;

    -- E12 · O motor (sem sessão) mexendo no carimbo do passo NÃO reinicia o
    --       relógio: a linha nova do gatilho vale só para toque humano.
    update public.leads
       set ultimo_contato_em = now() - interval '5 days',
           alertado_em       = now() - interval '2 hours'
     where id = v_lead;
    update public.leads
       set proximo_passo_definido_em = now() - interval '1 minute'
     where id = v_lead;
    select ultimo_contato_em, alertado_em into v_contato_motor, v_alertado_motor
      from public.leads where id = v_lead;

    -- E13 · Apagar o lead leva os registros junto (LGPD art. 18, VI).
    delete from public.leads where id = v_lead;
    select count(*) into v_cascata from public.leads_interacoes where lead_id = v_lead;

    raise exception 'DESFAZER_ACEITE_GESTAO_DO_LEAD' using errcode = 'GDL01';
  exception
    -- O sentinela, e só ele. Qualquer outro erro sobe e para a migração.
    when sqlstate 'GDL01' then null;
  end;

  -- ==========================================================================
  -- O veredito, lido das variáveis que sobreviveram ao rollback
  -- ==========================================================================
  if v_lead is null or v_staff is null then
    raise exception 'ACEITE FALHOU: a sonda não chegou a gravar — nada foi provado';
  end if;

  -- Nota com passo: o passo foi para o lead, com carimbo e autor; o gatilho
  -- (linha nova) reiniciou o relógio e zerou o alerta.
  if v_passo is distinct from 'Mandar fotos do interior'
     or v_passo_vence is distinct from v_vence
     or v_def_em is distinct from now()
     or v_def_por is distinct from 'Aceite Gestão do Lead' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o passo não chegou ao lead como devia (passo "%", vence %, definido % por "%")',
      v_passo, v_passo_vence, v_def_em, v_def_por;
  end if;
  if v_contato_1 is distinct from now() or v_alertado_1 is not null then
    falhas := falhas + 1;
    raise warning 'FALHOU: combinar o próximo passo não reiniciou o relógio (contato %, alerta %) — '
                  'é a linha que a gestao_do_lead acrescentou ao gatilho', v_contato_1, v_alertado_1;
  end if;
  if v_autor is distinct from 'Aceite Gestão do Lead'
     or v_texto is distinct from 'Cliente pediu fotos do interior'
     or v_importada is distinct from false
     or v_criado is distinct from now() then
    falhas := falhas + 1;
    raise warning 'FALHOU: o registro gravado não é o esperado (autor "%", texto "%", importada %, criado %)',
      v_autor, v_texto, v_importada, v_criado;
  end if;

  -- Ligação sem passo: a função reinicia o relógio; o passo anterior fica.
  if v_contato_2 is distinct from now() or v_alertado_2 is not null then
    falhas := falhas + 1;
    raise warning 'FALHOU: registrar sem passo não reiniciou o relógio (contato %, alerta %)',
      v_contato_2, v_alertado_2;
  end if;
  if v_passo_2 is distinct from 'Mandar fotos do interior' then
    falhas := falhas + 1;
    raise warning 'FALHOU: registrar sem passo mexeu no passo combinado (veio "%")', v_passo_2;
  end if;
  if v_lig_resultado is distinct from 'nao_atendeu' or v_lig_texto is not null then
    falhas := falhas + 1;
    raise warning 'FALHOU: a ligação sem texto veio "%"/"%"', v_lig_resultado, v_lig_texto;
  end if;

  if v_meio_passo <> 3 then
    falhas := falhas + 1;
    raise warning 'FALHOU: só % de 3 meios compromissos foram recusados com a mensagem da função', v_meio_passo;
  end if;
  if v_sem_lead is distinct from 'LEAD_NAO_ENCONTRADO' then
    falhas := falhas + 1;
    raise warning 'FALHOU: lead inexistente pela função deu "%"', v_sem_lead;
  end if;
  if v_tipo_ruim is distinct from 'leads_interacoes_tipo_valido' then
    falhas := falhas + 1;
    raise warning 'FALHOU: tipo inventado pela função deu "%"', v_tipo_ruim;
  end if;
  if v_texto_vazio is distinct from 'leads_interacoes_diz_alguma_coisa' then
    falhas := falhas + 1;
    raise warning 'FALHOU: nota em branco pela função deu "%"', v_texto_vazio;
  end if;

  -- Quem lê e quem escreve.
  if v_anon_le <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon % leads_interacoes — produção não dá grant nenhum a anon', v_anon_le;
  end if;
  if v_anon_rpc <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon chamando registrar_interacao_do_lead: % — tinha de parar no EXECUTE', v_anon_rpc;
  end if;
  if v_cli_le <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o cliente (authenticated sem staff) leu % registro(s) (-2 = sem SELECT)', v_cli_le;
  end if;
  if v_cli_escreve <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o cliente % direto em leads_interacoes', v_cli_escreve;
  end if;
  if v_cli_rpc is distinct from 'Registrar interação é restrito à equipe.' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o cliente chamando a função deu "%" — esperado a guarda de staff', v_cli_rpc;
  end if;
  -- 4 gravados direto (E3) + a nota e a ligação da função (E7, E8).
  if v_staff_le <> 6 or v_total_dono <> 6 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o staff leu % registro(s) e o banco tem % — esperado 6 e 6', v_staff_le, v_total_dono;
  end if;
  if v_staff_insere <> 'negado' or v_staff_altera <> 'negado' or v_staff_apaga <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o staff por fora da função: insert %, update %, delete % — escrita é só da função',
      v_staff_insere, v_staff_altera, v_staff_apaga;
  end if;

  if v_contato_motor is distinct from now() - interval '5 days' or v_alertado_motor is null then
    falhas := falhas + 1;
    raise warning 'FALHOU: o motor mexeu no carimbo do passo e o relógio reiniciou (contato %, alerta %)',
      v_contato_motor, v_alertado_motor;
  end if;
  if v_cascata <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: apagar o lead deixou % registro(s) para trás', v_cascata;
  end if;

  -- Nada da sonda sobreviveu.
  select count(*) into v_restou from public.leads where id = v_lead;
  select v_restou + count(*) into v_restou from public.leads_interacoes where lead_id = v_lead;
  select v_restou + count(*) into v_restou from public.leads_eventos where lead_id = v_lead;
  select v_restou + count(*) into v_restou from auth.users where id = v_staff;
  if v_restou <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: a sonda deixou % linha(s) para trás', v_restou;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) na gestão do lead', falhas;
  end if;

  raise notice
    'Aceite verificado: gestao_do_lead reproduz o retrato de produção — sete '
    'colunas em leads na ordem e tipos de lá, as duas regras e os índices com a '
    'definição de lá, leads_interacoes com as colunas, as quatro regras (cada '
    'recusa pela regra certa), a FK em cascata e uma policy só; '
    'registrar_interacao_do_lead e leads_antes_de_atualizar byte a byte as de '
    'produção; anon sem grant nem EXECUTE, cliente lê zero e é barrado pela '
    'guarda, staff lê tudo e só escreve pela função; combinar o passo reinicia o '
    'relógio e o motor não; a sonda não deixou rastro.';
end $aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20260923150000', 'gestao_do_lead')
  on conflict (version) do nothing;
