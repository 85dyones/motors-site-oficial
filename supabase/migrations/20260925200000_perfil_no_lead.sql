-- ============================================================================
-- O perfil do Garagem Profiler mora no lead (2026-09-25)
-- ============================================================================
--
-- O Garagem Profiler (`/carro-perfeito`, src/components/CarMatch.tsx) grava um
-- lead em `public.leads` por `/api/leads`, com canal "Garagem Match Profiler"
-- — mas o lead só guardava `interesse`, que para o Profiler é a frase montada
-- para o WhatsApp (sem `veiculo` no corpo, `interesseDoLead` fica com a
-- `mensagem`). O que o cliente respondeu no quiz — orçamento, o que o carro vai
-- levar, jeitos e carrocerias, câmbio, o que não pode faltar, prazo, os filtros
-- que o site afrouxou, os carros que ele escolheu e por quê, o texto livre da
-- aba DESCREVER — viajava em `intencao_busca` só para o webhook do n8n. O
-- consultor abria o card no kanban e lia uma frase de WhatsApp no lugar do
-- perfil. Esta migração dá lugar a esse retrato no próprio lead — a fase 2 da
-- spec docs/superpowers/specs/2026-09-25-garagem-profiler-tres-do-patio-design.md
-- ("`leads.perfil`, jsonb, no molde de `avaliacaoDoLead`").
--
-- ---------------------------------------------------------------------------
-- A coluna
-- ---------------------------------------------------------------------------
--   perfil .. jsonb — o RETRATO do quiz no instante do envio, montado e
--             validado no servidor por `montarPerfilDoLead`
--             (src/lib/perfilDoLead.ts) a partir de `intencao_busca`, e gravado
--             pela chave de serviço. Retrato, não ficha: nenhuma tela o edita.
--
-- O que ele é, e o que ele NÃO é: é o que o cliente DISSE ao site. Os preços,
-- nomes e manchetes dos carros vêm do navegador; o banco não confere nada disso
-- contra o estoque. Não é dado auditado — para o preço de hoje, o `id` de cada
-- carro é o número do anúncio (`estoque_motors.id`), guardado como valor, sem
-- FK: o retrato não pode sumir nem travar quando o carro sai do pátio, e
-- `estoque_motors` segue intocada até a F2.
--
-- A regra de negócio vai em CHECK nomeado, não em código:
--   * `perfil` é objeto ou nada (`leads_perfil_e_objeto`). Array, escalar ou
--     `null` JSON seriam um retrato que nenhuma tela sabe ler — e que só se
--     descobriria no card.
--   * as CHAVES não são cobradas aqui. A forma interna é de
--     `montarPerfilDoLead` e muda com o quiz; um CHECK de chaves faria de cada
--     pergunta nova uma migração — e, antes dela, um lead PERDIDO: a recusa por
--     CHECK não cai no reenvio sem a coluna (abaixo), que é só para coluna
--     ausente.
--
-- Sem retrocarga: dos leads anteriores o banco só tem a frase de `interesse`;
-- o perfil deles ficou no n8n. `perfil` é nulo nos leads que não vieram do
-- Profiler e nos anteriores a 2026-09-25.
--
-- Retenção: a do lead — sem prazo de expiração, como a linha inteira. A
-- exclusão a pedido do titular (LGPD art. 18, VI) apaga a linha, e o perfil
-- vai junto. Prazo próprio para o perfil é pergunta aberta ao dono (item 8 das
-- "Decisões do dono" da spec acima) e, se vier, é migração própria. O texto
-- livre da aba DESCREVER traz o que o cliente quiser escrever — dado pessoal
-- inclusive —, e é mais um motivo para a leitura ser só da equipe.
--
-- Tudo aqui é aditivo e idempotente: `add column if not exists`, constraint
-- criada só se não existir, nenhum DROP/RENAME/ALTER TYPE. Não é tabela nova
-- (a regra de `org_id` vale para tabela nova; `leads` é legado e continua sem
-- `org_id`, como registram a 20260923150000 e a 20260925130000) nem tabela de
-- parâmetro (não há vigência a encerrar: o retrato é um fato datado pelo
-- próprio `created_at` do lead).
--
-- ---------------------------------------------------------------------------
-- O código tolera esta migração ainda não aplicada
-- ---------------------------------------------------------------------------
-- A rota `/api/leads` grava o lead com `perfil` e, se o PostgREST responder
-- PGRST204 (coluna fora do cache de schema) ou 42703 (coluna inexistente)
-- citando a coluna, REGRAVA sem ela — o mesmo gesto de `/api/avaliacao`
-- (src/lib/avaliacaoDoLead.ts). A gravação do lead já era não-bloqueante —
-- quem montou o perfil está a caminho do WhatsApp —, e um deploy de código
-- antes do banco não pode perder o lead inteiro por causa de uma coluna.
-- Aplicar esta migração é o que faz o perfil aparecer no card; não aplicá-la
-- não quebra nada.
--
-- ---------------------------------------------------------------------------
-- Permissões: os grants de `leads` continuam de TABELA INTEIRA — conferido
-- ---------------------------------------------------------------------------
-- Conferido contra o repositório, até a 20260925180000:
--   * nenhuma migração dá GRANT ou REVOKE em `public.leads`, nem por coluna. O
--     que a avaliação conferiu (20260924190000) segue valendo, e as que vieram
--     depois dela não mudam isso: a 20260923150000_gestao_do_lead (hoje
--     reconstruída no repositório) mexe nos grants de `leads_interacoes` e da
--     função dela, e registra "os grants de `leads`" como não mexidos; a
--     20260925130000 só toca `leads_interacoes` (org_id e a policy de leitura);
--     a 20260925180000 só concede EXECUTE de função. O acesso a `leads` vem do
--     default ACL do Supabase, que concede a tabela inteira a
--     anon/authenticated/service_role; o andaime de testes espelha isso
--     (supabase/testes/andaime.sql:75-78 e :312);
--   * quem segura é a RLS: `leads_leitura_staff`, `leads_atualizacao_staff` e
--     `leads_exclusao_staff`, todas `to authenticated` com `is_staff`
--     (20260828120000_funil_de_vendas.sql:617-627; `is_staff` na versão viva
--     da 20260923130000_papel_sdr.sql:45, que pôs o SDR). Nenhuma policy para
--     anon, nenhuma de INSERT — quem grava é a chave de serviço.
--
-- Por isso NÃO há grant por coluna aqui. Coluna nova herda o grant de tabela:
-- o staff lê o perfil no kanban (o GET de /api/leads/gerenciar faz
-- `select("*")`, e quem não "vê e move leads" — Marketing — continua recebendo
-- só a contagem), e a chave de serviço grava. `anon` não ganha nada que a RLS
-- não barre: sem policy para ele, zero linhas — o aceite prova por efeito. O
-- cliente logado da Garagem é `authenticated` sem staff: também zero linhas.
--
-- O que a granularidade NÃO permite: tirar de `authenticated` o UPDATE de
-- `perfil`. Com UPDATE de tabela inteira, um REVOKE por coluna não tem efeito;
-- fechar exigiria trocar o grant de tabela por grants por coluna de TODAS as
-- colunas que o painel e o motor escrevem. Isso não é aditivo e quebraria
-- escrita em silêncio. Então a garantia de que o retrato não é reescrito é da
-- ROTA: o PATCH de /api/leads/gerenciar lê uma lista fechada de campos, e
-- `perfil` não está nela. Se um dia precisar ser do banco, o caminho é um
-- gatilho de guarda, em migração própria — o mesmo que ficou dito para
-- `avaliacao`.
--
-- ---------------------------------------------------------------------------
-- Gatilhos de `leads` — conferidos, nenhum muda
-- ---------------------------------------------------------------------------
--   * `trg_leads_antes_de_atualizar` (BEFORE UPDATE). A versão viva de
--     `leads_antes_de_atualizar()` agora é a da
--     20260923150000_gestao_do_lead.sql:446-498 — a da 20260828160000 mais
--     `proximo_passo_definido_em` na lista de toques humanos (a avaliação ainda
--     citava a da 20260828160000). Só lê/escreve situacao, desfecho*,
--     responsavel*, observacoes, proximo_passo_definido_em,
--     ultimo_movimento_em, ultimo_contato_em, alertado_em e atualizado_em. Não
--     cita `perfil` — e o perfil é gravado no INSERT, onde ele nem dispara.
--   * `trg_leads_rastro_insert` / `trg_leads_rastro_update`
--     (20260828120000_funil_de_vendas.sql:533-582): o evento de entrada leva
--     canal e interesse, não o perfil. O rastro diz que o lead entrou e por
--     onde; o retrato mora na linha do lead. O aceite cobra que a entrada
--     continua nascendo, com o canal do Profiler.
--   * `trg_leads_credito_do_resgate` — NOVO desde a avaliação
--     (20260925180000_etiquetas_do_lead.sql:309-314): AFTER UPDATE OF
--     responsavel, só quando o dono muda; escreve em `leads_eventos`, não em
--     `leads`. Não dispara no INSERT nem numa escrita de `perfil`.
--   * Nenhuma view sobre `leads` usa `select *` (`agenda_de_pessoas`, viva na
--     20260828160000, e `saude_da_atribuicao_dos_leads`, 20260921090901,
--     listam colunas), e nenhuma migração põe `leads` em publicação de
--     realtime. Nada a recriar.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. A coluna
-- ----------------------------------------------------------------------------
alter table public.leads
  add column if not exists perfil jsonb;


-- ----------------------------------------------------------------------------
-- 2. A regra, nomeada
-- ----------------------------------------------------------------------------
-- Em bloco porque `add constraint` não tem `if not exists`: reaplicar a
-- migração não pode abortar por ela já estar aplicada (mesmo gesto da
-- 20260924190000 com `leads_avaliacao_e_objeto`). Se já existir uma regra com
-- este nome e OUTRO texto, o bloco a deixaria calado — é o aceite, abaixo, que
-- compara a definição e para a migração.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.leads'::regclass
                    and conname = 'leads_perfil_e_objeto') then
    alter table public.leads
      add constraint leads_perfil_e_objeto
      check (perfil is null or jsonb_typeof(perfil) = 'object');
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 3. O que a coluna é, para quem abrir o banco sem abrir o código
-- ----------------------------------------------------------------------------
comment on column public.leads.perfil is
  'Retrato do quiz do Garagem Profiler (/carro-perfeito) no instante do envio: '
  'orçamento, o que o carro vai levar, jeitos/carrocerias, câmbio, o que não '
  'pode faltar, prazo, filtros afrouxados, os carros escolhidos (id, nome, '
  'preço, lugar, manchete, pesa contra), o texto livre da aba DESCREVER e '
  'quantos carros passavam na faixa. Montado e validado no servidor por '
  'montarPerfilDoLead (src/lib/perfilDoLead.ts) em /api/leads a partir de '
  'intencao_busca, e gravado pela chave de serviço. É o que o cliente DISSE ao '
  'site, não dado auditado: preços e carros vêm do navegador, e o id do carro '
  'é o número do anúncio, sem FK. Só a equipe lê (RLS is_staff). É retrato, '
  'não ficha: nenhuma tela o edita (o PATCH de /api/leads/gerenciar não aceita '
  'o campo). Nulo nos leads que não vieram do Profiler e nos anteriores a '
  '2026-09-25. Sempre objeto JSON (CHECK leads_perfil_e_objeto).';


-- ============================================================================
-- Autoconferência — a promessa, cobrada do banco
-- ============================================================================
-- Estrutura, privilégio e efeito. A parte de efeito grava um lead de sonda (e
-- um vendedor staff para lê-lo) e o viola de propósito; roda num sub-bloco que
-- termina com um sentinela, e o rollback do sub-bloco leva a sonda, o rastro
-- dela em `leads_eventos`, o usuário de teste e qualquer `set local
-- role`/claims junto. As variáveis sobrevivem ao rollback (plpgsql não desfaz
-- variável), e é por elas que o veredito sai depois. Nada fica gravado — nem
-- em produção, nem numa reaplicação.
do $aceite$
declare
  falhas          int := 0;
  v_tipo          text;
  v_def           text;
  v_regra         text;
  v_perfil        jsonb;
  v_json          jsonb;
  v_lead          uuid;
  v_staff         uuid;
  v_cliente       uuid := gen_random_uuid();

  -- o que a sonda leu antes de ser desfeita
  v_lido          jsonb;
  v_entrada       boolean := false;
  v_canal_rastro  text;
  v_staff_le      jsonb;
  v_staff_viu     int := -1;
  v_anon          int := -1;
  v_cli_viu       int := -1;
  v_restou        int;
begin
  -- 1 · A coluna existe, com o tipo exato e com comentário.
  select format_type(a.atttypid, a.atttypmod) into v_tipo
    from pg_attribute a
   where a.attrelid = 'public.leads'::regclass
     and a.attname  = 'perfil'
     and a.attnum   > 0
     and not a.attisdropped;
  if v_tipo is distinct from 'jsonb' then
    raise exception 'ACEITE FALHOU: leads.perfil é "%", esperado "jsonb"',
      coalesce(v_tipo, '<ausente>');
  end if;

  if col_description('public.leads'::regclass,
       (select attnum from pg_attribute
         where attrelid = 'public.leads'::regclass and attname = 'perfil')) is null then
    falhas := falhas + 1;
    raise warning 'FALHOU: leads.perfil sem comentário';
  end if;

  -- 2 · A regra existe com nome, é CHECK, está validada — e diz o que promete.
  --     A definição é comparada porque o bloco do §2 pula uma regra de mesmo
  --     nome que já exista, seja qual for o texto dela.
  select replace(pg_get_constraintdef(oid), 'public.', '') into v_def
    from pg_constraint
   where conrelid = 'public.leads'::regclass
     and conname  = 'leads_perfil_e_objeto'
     and contype  = 'c'
     and convalidated;
  if v_def is distinct from
     'CHECK (((perfil IS NULL) OR (jsonb_typeof(perfil) = ''object''::text)))' then
    falhas := falhas + 1;
    raise warning 'FALHOU: leads_perfil_e_objeto é "%" — esperado CHECK validado de "perfil is null or objeto"',
      coalesce(v_def, '<ausente, não é CHECK ou não validada>');
  end if;

  -- 3 · O painel lê a coluna e a chave de serviço a grava. Com grant de tabela
  --     inteira isto é automático; se produção tiver virado grant por coluna,
  --     é aqui que se descobre — antes de o card sair sem perfil, ou de a rota
  --     cair no reenvio sem a coluna em todo lead do Profiler.
  if not has_column_privilege('authenticated', 'public.leads', 'perfil', 'SELECT') then
    falhas := falhas + 1;
    raise warning 'FALHOU: authenticated não lê leads.perfil — o grant de leads deixou de ser de '
                  'tabela inteira; conceda SELECT na coluna';
  end if;
  if not has_column_privilege('service_role', 'public.leads', 'perfil', 'INSERT') then
    falhas := falhas + 1;
    raise warning 'FALHOU: service_role não grava leads.perfil — /api/leads não teria como gravar o retrato';
  end if;

  -- 4 · Efeito. Tudo daqui até o sentinela é desfeito.
  --
  -- O retrato da sonda tem a forma que `montarPerfilDoLead`
  -- (src/lib/perfilDoLead.ts) grava hoje — mas o banco só cobra "objeto", e
  -- a forma interna é do código. O `null` lá dentro (`pesa_contra`) prova que
  -- a regra olha só o topo.
  v_perfil := jsonb_build_object(
    'versao',     1,
    'aiQuery',    'Carro para levar as crianças na escola',
    'budgetTab',  'ai',
    'modo',       'carros',
    'orcamento',  'acima de R$ 40 mil',
    'filtros',    jsonb_build_array('acima de R$ 40 mil', '4 portas ou mais'),
    'afrouxados', jsonb_build_array(),
    'prazo',      'No próximo mês',
    'perfil',     jsonb_build_object(
                    'leva',            'Família, criança na cadeirinha',
                    'jeitos',          jsonb_build_array('Hatch', 'Sedã'),
                    'cambio',          'Prefiro automático',
                    'nao_pode_faltar', jsonb_build_array('Câmera de ré')),
    'na_faixa',   11,
    'carros',     jsonb_build_array(jsonb_build_object(
                    'id', '999999', 'nome', 'Teste Aceite 2020', 'preco', 58900,
                    'lugar', 'principal', 'manchete', 'O de menor km dos três.',
                    'pesa_contra', null)));

  begin
    -- 4a · O retrato que a rota grava — objeto — entra, sem sessão, como a
    --      chave de serviço.
    begin
      insert into public.leads (nome, telefone, canal, interesse, perfil)
      values ('Aceite Perfil no Lead', '5541999990928', 'Garagem Match Profiler',
              'Olá! Montei meu perfil no Garagem Profiler do site e quero ver o Teste Aceite 2020.',
              v_perfil)
      returning id into v_lead;
    exception when check_violation then
      get stacked diagnostics v_regra = constraint_name;
      raise exception 'ACEITE FALHOU: o perfil em objeto foi recusado por "%" — /api/leads perderia '
                      'o lead do Profiler inteiro', v_regra;
    end;

    select perfil into v_lido from public.leads where id = v_lead;

    -- O gatilho de rastro seguiu funcionando com a coluna nova, e levou o canal.
    select count(*) = 1, max(detalhe->>'canal')
      into v_entrada, v_canal_rastro
      from public.leads_eventos
     where lead_id = v_lead and tipo = 'entrada';

    -- 4b · Array, escalar e `null` JSON são recusados — e pela regra CERTA:
    --      uma recusa por outra constraint não prova esta.
    foreach v_json in array array['[]'::jsonb,
                                  '[{"id": 999999, "nome": "Teste Aceite 2020"}]'::jsonb,
                                  '"Teste Aceite 2020, até R$ 60 mil"'::jsonb,
                                  'null'::jsonb] loop
      begin
        insert into public.leads (nome, telefone, canal, perfil)
        values ('Aceite Perfil no Lead', '5541999990929', 'Garagem Match Profiler', v_json);
        falhas := falhas + 1;
        raise warning 'FALHOU: leads.perfil aceitou % (jsonb_typeof = %)',
          v_json, jsonb_typeof(v_json);
      exception when check_violation then
        get stacked diagnostics v_regra = constraint_name;
        if v_regra is distinct from 'leads_perfil_e_objeto' then
          falhas := falhas + 1;
          raise warning 'FALHOU: % foi recusado por "%", e não por leads_perfil_e_objeto',
            v_json, v_regra;
        end if;
      end;
    end loop;

    -- 4c · A equipe lê o perfil — é para isso que ele existe. Um vendedor
    --      staff (o gesto do aceite da 20260925130000), vestindo a sessão dele.
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'aceite-perfil-no-lead@exemplo.invalido', now(), now())
    returning id into v_staff;
    update public.profiles
       set full_name = 'Aceite Perfil no Lead', papeis = array['comercial'], role = 'comercial',
           is_active = true
     where id = v_staff;

    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*), max(perfil::text)::jsonb into v_staff_viu, v_staff_le
        from public.leads where id = v_lead;
      reset role;
      perform set_config('request.jwt.claims', '', true);
    exception when insufficient_privilege then v_staff_viu := -2;  -- sem SELECT
    end;

    -- 4d · Quem não é equipe não vê o lead — nem o perfil dentro dele.
    --      Sem privilégio nenhum também é "não vê": conta como zero.
    begin
      set local role anon;
      select count(*) into v_anon from public.leads where id = v_lead;
      reset role;
    exception when insufficient_privilege then v_anon := 0;
    end;

    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_cliente, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into v_cli_viu from public.leads where id = v_lead;
      reset role;
      perform set_config('request.jwt.claims', '', true);
    exception when insufficient_privilege then v_cli_viu := 0;
    end;

    raise exception 'DESFAZER_ACEITE_PERFIL_NO_LEAD' using errcode = 'PRF01';
  exception
    -- O sentinela, e só ele. Qualquer outro erro sobe e para a migração.
    when sqlstate 'PRF01' then null;
  end;

  -- O veredito, lido das variáveis que sobreviveram ao rollback.
  if v_lead is null or v_staff is null then
    raise exception 'ACEITE FALHOU: a sonda não chegou a gravar — nada foi provado';
  end if;
  if v_lido is distinct from v_perfil then
    falhas := falhas + 1;
    raise warning 'FALHOU: o perfil gravado não voltou igual (gravado %, lido %)', v_perfil, v_lido;
  end if;
  if not v_entrada or v_canal_rastro is distinct from 'Garagem Match Profiler' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o lead com perfil não entrou no rastro (leads_eventos) com o canal do Profiler '
                  '(entrada: %, canal: "%")', v_entrada, v_canal_rastro;
  end if;
  if v_staff_viu <> 1 or v_staff_le is distinct from v_perfil then
    falhas := falhas + 1;
    raise warning 'FALHOU: o vendedor staff viu % lead(s) e leu o perfil % — esperado 1 e o retrato '
                  'gravado (-2 = sem SELECT)', v_staff_viu, coalesce(v_staff_le::text, '<nulo>');
  end if;
  if v_anon <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon enxergou % lead(s) com perfil', v_anon;
  end if;
  if v_cli_viu <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: authenticated sem staff (cliente) enxergou % lead(s) com perfil', v_cli_viu;
  end if;

  select count(*) into v_restou from public.leads where id = v_lead;
  select v_restou + count(*) into v_restou from public.leads_eventos where lead_id = v_lead;
  select v_restou + count(*) into v_restou from auth.users where id = v_staff;
  select v_restou + count(*) into v_restou from public.profiles where id = v_staff;
  if v_restou <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: a sonda deixou % linha(s) para trás', v_restou;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) no perfil no lead', falhas;
  end if;

  raise notice
    'Aceite verificado: leads ganhou perfil (jsonb, só objeto, CHECK '
    'leads_perfil_e_objeto validado); o retrato do Profiler entra e volta '
    'igual, e o rastro de entrada segue nascendo com o canal; array, escalar e '
    'null JSON são recusados pela regra certa; a equipe lê o perfil, anon e '
    'cliente não veem o lead; a sonda não deixou rastro.';
end $aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20260925200000', 'perfil_no_lead')
  on conflict (version) do nothing;
