-- ============================================================================
-- `erros` — o destino da natureza `quebra`, em casa
-- ============================================================================
-- PR 1 do desenho de observabilidade (`docs/superpowers/specs/
-- 2026-09-10-observabilidade-design.md`, §12 "Revisão 2", que prevalece sobre
-- as seções 1–11). A régua do §3 não mudou:
--
--     exceção            → fila de triagem   (esta tabela, tela /admin/erros)
--     parada de negócio  → WhatsApp          (`alertaDeFalha` → n8n)
--     ausência           → /api/saude        (lido pelo n8n de hora em hora)
--
-- O que mudou na Revisão 2 foi só o **endereço** da primeira linha: em vez de
-- subir para o Sentry, ela vira linha aqui. Quatro razões, do §12:
--
--   1. o repositório é público — o melhor argumento do Sentry era símbolo
--      automático sem expor source map, e aqui não há o que expor;
--   2. `withSentryConfig` era o único ponto do desenho que encostava no
--      `next.config.ts`, onde vive o `redirects()` do alias com o negativo
--      `(?!api/)` do qual quatro workflows do n8n dependem;
--   3. PII de lead não ganha um segundo processador;
--   4. num SaaS, cada vendor que recebe PII é um contrato por cliente — e a
--      costura multi-tenant (`org_padrao()`) já existe no banco.
--
-- Esta é a ÚNICA migração do pacote, e ela precisa estar **gravada antes** do
-- deploy do código que grava nela (§12, linha do §10).
--
-- ----------------------------------------------------------------------------
-- Quem escreve, quem lê
-- ----------------------------------------------------------------------------
-- ESCREVE: sempre a chave de serviço (`service_role`), que ignora RLS, vinda de
-- três origens — o hook `onRequestError` do Next (erro de servidor), a rota
-- `/api/erros` (o que o navegador do visitante reportou) e chamadas explícitas
-- em `catch` de rota (PR 3). Nenhuma delas usa sessão de usuário.
--
-- LÊ: o staff, na tela `/admin/erros` (PR 2). A ÚNICA escrita do staff é marcar
-- como resolvido — e é por isso que o grant dele é POR COLUNA (ver abaixo).
--
-- ----------------------------------------------------------------------------
-- Por que `text` + `check`, e nunca enum
-- ----------------------------------------------------------------------------
-- `ALTER TYPE` de objeto em uso é proibido nesta janela de convivência
-- (CLAUDE.md, "Handoff"). Origem nova — hoje `navegador` e `servidor`, amanhã
-- talvez `n8n` ou `cron` — exigiria `alter type ... add value`, que é
-- exatamente o gesto vedado. `text` + CHECK nomeado carrega a mesma regra e sai
-- por `alter table ... drop constraint` + `add constraint`, que é aditivo.
--
-- ----------------------------------------------------------------------------
-- Constraint de menos, de propósito
-- ----------------------------------------------------------------------------
-- Numa tabela de ERRO, constraint recusada = erro perdido — e erro perdido é o
-- defeito que este pacote inteiro existe para consertar. Por isso aqui só entra
-- restrição que a aplicação já garante antes de chamar: os tetos de tamanho
-- (`higienizar()` trunca), o vocabulário fechado de `origem`/`natureza` (a
-- assinatura de `registrarFalha` é um union de TypeScript) e a FORMA do hash.
-- Não há `length(assunto) > 0`, nem `mensagem <> ''`: um assunto vazio é bug de
-- chamador, e recusar a linha por causa dele apagaria a única prova do bug.
--
-- ----------------------------------------------------------------------------
-- `hash_agrupamento` é calculado na APLICAÇÃO, não em trigger
-- ----------------------------------------------------------------------------
-- O agrupamento é FNV-1a sobre o assunto + a mensagem normalizada (números → `#`
-- e uuid → `<uuid>`). Essa normalização é a parte difícil e ela já precisa
-- existir em TypeScript, porque a captura do navegador roda antes de qualquer
-- banco. Repetir a mesma normalização num trigger seria manter duas verdades
-- que divergem no primeiro ajuste — e a aplicação é a única escritora, então o
-- banco não ganha nada em recalcular. O CHECK aqui garante só a FORMA (hex de
-- 8 a 64 dígitos): impede `null` disfarçado de `"undefined"`, string vazia e
-- objeto serializado.
--
-- ----------------------------------------------------------------------------
-- `lead_id` nasce e fica NULO na v1
-- ----------------------------------------------------------------------------
-- As rotas de lead fazem `insert` **sem** `.select()`, então no momento em que
-- o erro acontece o id do lead ainda não existe do lado do servidor — obtê-lo
-- custaria um round-trip no POST que o visitante está esperando. A coluna nasce
-- porque o PR 3 pode preenchê-la, e o elo que já funciona hoje é o `ag_uid`.
-- `leads.id` é `uuid` (20260807210000_leads.sql:43) e `leads` tem policy de
-- DELETE do titular (LGPD art. 18, VI) — daí `on delete set null`: eliminação a
-- pedido do titular solta o vínculo e preserva o registro técnico, o mesmo
-- desenho de `atendimentos` (20260831140000).
--
-- ----------------------------------------------------------------------------
-- PII: a garantia é da aplicação, não do banco
-- ----------------------------------------------------------------------------
-- `mensagem` e `stack` podem carregar dado pessoal por acidente: erro do
-- PostgREST cita valores no texto (`Key (telefone)=(5541…) already exists`).
-- `higienizar()` mascara sequências de 8+ dígitos e e-mails antes de gravar, e
-- `url` vai sem query string. Isso é código de aplicação, e código de aplicação
-- regride — por isso a retenção de **90 dias** é a segunda camada, e está
-- escrita no `comment on table` para que quem for ler a tabela leia junto o
-- aviso. A limpeza é `limpar_erros_antigos()`, chamada pelo n8n.
-- ============================================================================

create table if not exists public.erros (
  id          uuid primary key default gen_random_uuid(),

  -- Régua de toda tabela nova do núcleo (CLAUDE.md): a triagem por tenant vem
  -- de graça quando existir o segundo cliente. Nenhum destino de erro consulta
  -- o banco para descobrir quem é — o DEFAULT resolve no próprio INSERT.
  org_id      uuid not null default public.org_padrao(),

  criado_em   timestamptz not null default now(),

  -- De onde a linha nasceu. `navegador` vem de /api/erros; `servidor`, do
  -- onRequestError e dos catch de rota.
  origem      text not null
              constraint erros_origem_valida
              check (origem in ('navegador', 'servidor')),

  -- `parada` NÃO existe aqui de propósito: parada de negócio vai para o
  -- WhatsApp e nunca vira linha (§3). `ambos` é a quebra que a loja precisa
  -- saber sem esperar triagem — ela foi para os dois destinos.
  natureza    text not null
              constraint erros_natureza_valida
              check (natureza in ('quebra', 'ambos')),

  -- Chave curta e ESTÁVEL, a mesma de `alertarFalha`: é por ela que a carência
  -- agrupa, e trocá-la de nome reinicia a carência sem avisar ninguém.
  assunto     text not null
              constraint erros_assunto_com_teto check (length(assunto) <= 80),

  mensagem    text not null
              constraint erros_mensagem_com_teto check (length(mensagem) <= 2000),

  stack       text
              constraint erros_stack_com_teto check (length(stack) <= 8000),

  rota        text,   -- padrão da rota (/estoque/[...slug]), não o caminho servido
  metodo      text,   -- verbo HTTP, quando houve requisição
  url         text,   -- SEM query string (§12, risco de PII)
  navegador   text,   -- user agent, cru
  release     text,   -- SHA do deploy da Vercel: responde "foi o deploy de ontem?"

  -- VERCEL_ENV. Sem CHECK: o vocabulário é do fornecedor, e recusar um valor
  -- novo dele perderia o erro.
  ambiente    text not null default 'desconhecido',

  digest      text,
  ag_uid      text,

  lead_id     uuid references public.leads(id) on delete set null,

  hash_agrupamento text not null
              constraint erros_hash_em_hex check (hash_agrupamento ~ '^[0-9a-f]{8,64}$'),

  suprimidas  integer not null default 0
              constraint erros_suprimidas_nao_negativa check (suprimidas >= 0),

  extra       jsonb not null default '{}'::jsonb,

  resolvido_em  timestamptz,
  resolvido_por uuid
);

comment on table public.erros is
  'Fila de triagem da natureza `quebra` (spec de observabilidade §12). Escrita SEMPRE pela chave de serviço — onRequestError, /api/erros e catch de rota; o staff só marca como resolvido. ⚠️ `mensagem` e `stack` podem conter PII por acidente (erro do PostgREST cita valores): a higienização é da APLICAÇÃO, o banco não garante. Retenção de 90 dias por `limpar_erros_antigos()`, chamada pelo n8n.';

comment on column public.erros.natureza is
  'Só `quebra` e `ambos`. `parada` não é linha desta tabela — parada de negócio vai para o WhatsApp (§3), e é justamente o alerta que não pode depender do que quebrou.';

comment on column public.erros.hash_agrupamento is
  'FNV-1a do assunto + mensagem normalizada (números → `#`, uuid → `<uuid>`), calculado em TypeScript. O CHECK aqui garante só a FORMA (hex, 8–64): a normalização vive num lugar só, porque a captura do navegador roda antes de qualquer banco e a app é a única escritora.';

comment on column public.erros.suprimidas is
  'Quantas ocorrências do MESMO hash a carência de 10 s engoliu antes desta linha. Enxurrada em página quente daria uma gravação por requisição; o contador vive na instância e viaja na linha seguinte — mesmo desenho da carência de `alertaDeFalha`.';

comment on column public.erros.digest is
  'O digest que o Next atribui ao erro de servidor. É o que liga a linha gravada pelo navegador (error.tsx só recebe o digest) à linha que o servidor já gravou pelo mesmo erro — em produção o boundary explícito NÃO dispara o evento `error` da window.';

comment on column public.erros.ag_uid is
  'Identificador de navegação que /api/leads já grava. É o elo com o lead sem copiar nome, e-mail ou telefone para cá — a ficha do lead já os tem, e uma segunda cópia seria uma segunda retenção.';

comment on column public.erros.lead_id is
  'NULO na v1: o insert das rotas de lead não tem `.select()`, então o id não existe no instante do erro. Nasce para o PR 3. `on delete set null` porque `leads` tem exclusão do titular (LGPD art. 18, VI).';

comment on column public.erros.resolvido_por is
  'Quem, no staff, marcou como resolvido. ⚠️ Nada no banco amarra este valor a `auth.uid()` hoje — o grant por coluna impede reescrever a MENSAGEM, não atribuir a resolução a um colega. Se a tela do PR 2 expuser o campo, o guarda (`with check ... resolvido_por = auth.uid()`) entra lá, com a régua de reabertura decidida junto.';

-- ----------------------------------------------------------------------------
-- Índices — as quatro leituras que a tela e o agrupamento fazem
-- ----------------------------------------------------------------------------
-- 1. a lista da /admin/erros, mais recentes primeiro, dentro da org;
-- 2. "as outras ocorrências deste mesmo erro", que é a tela de detalhe;
-- 3. a fila de trabalho — só o que ninguém resolveu (parcial: é a leitura de
--    todo dia, e o índice fica pequeno mesmo com a tabela grande);
-- 4. o cruzamento navegador ↔ servidor pelo digest do Next.
create index if not exists erros_org_criado_idx
  on public.erros (org_id, criado_em desc);

create index if not exists erros_hash_criado_idx
  on public.erros (hash_agrupamento, criado_em desc);

create index if not exists erros_abertos_idx
  on public.erros (org_id, criado_em desc) where resolvido_em is null;

create index if not exists erros_digest_idx
  on public.erros (digest) where digest is not null;

-- ============================================================================
-- Privilégio — o ponto mais delicado, e ele vem ANTES da RLS
-- ============================================================================
-- O Postgres checa o GRANT antes da policy. Este repositório aprendeu isso do
-- lado caro (20260831150000: policy correta e inútil ao mesmo tempo) e do lado
-- perigoso (20260829140000: o `pg_default_acl` do Supabase concede a `anon` e
-- `authenticated` NOMINALMENTE em toda tabela nova de `public`, e `revoke ...
-- from public` não alcança concessão nominal). Conferido nesta base hoje: o
-- default ACL de tabela do dono `postgres` dá `arwdxtm` a `anon` e a
-- `authenticated`. Ou seja: sem os REVOKE abaixo, esta tabela nasceria com
-- INSERT/UPDATE/DELETE anônimos, com só a RLS segurando.
--
-- `anon` sai por completo: nenhum caminho anônimo precisa desta tabela. A rota
-- /api/erros é a porta do visitante, e ela grava com a chave de serviço.
revoke all on public.erros from anon, public;

-- `authenticated` volta a zero e recebe SÓ o que a tela precisa. O UPDATE é
-- **por coluna**, e essa é a decisão que sustenta o desenho inteiro: policy de
-- RLS não restringe coluna (é a mesma razão de
-- `atualizar_consentimento_canais` existir — ver 20260815230000:79-82). Com
-- `grant update` de tabela, a policy `erros_staff_resolve` deixaria qualquer
-- staff reescrever a `mensagem` e o `stack` de um erro — apagar a prova do
-- defeito pela tela que existe para exibi-lo.
revoke all on public.erros from authenticated;
grant select, update (resolvido_em, resolvido_por) on public.erros to authenticated;

-- Explícito em vez de herdado do default ACL: quem grava é esta chave, e o
-- arquivo tem que dizer isso sem depender de configuração de fora.
grant select, insert, update, delete on public.erros to service_role;

-- ============================================================================
-- RLS — staff lê, staff resolve, e mais nada
-- ============================================================================
-- SEM policy de INSERT e SEM policy de DELETE, de propósito. Quem grava é a
-- `service_role`, que ignora RLS; criar policy de INSERT abriria justamente a
-- porta que este desenho fecha — um usuário logado forjando linha de erro (ou
-- inundando a tabela) pelo PostgREST. Mesma régua de `leads` e `atendimentos`.
-- Apagar é da retenção, e ela é função com dono.
alter table public.erros enable row level security;

drop policy if exists erros_staff_le on public.erros;
create policy erros_staff_le on public.erros
  for select to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao());

drop policy if exists erros_staff_resolve on public.erros;
create policy erros_staff_resolve on public.erros
  for update to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao())
  with check (public.is_staff(auth.uid()) and org_id = public.org_padrao());

-- ============================================================================
-- Retenção — 90 dias, e um piso que impede o comando que apaga tudo
-- ============================================================================
-- Chamada pelo n8n com a chave de serviço. O piso de 7 dias existe porque
-- `limpar_erros_antigos(0)` apagaria a tabela inteira: um zero digitado errado
-- (ou um campo vazio virando 0 no workflow) não pode ser um TRUNCATE disfarçado
-- de rotina. É o mesmo espírito da guarda de `dias` que o CLAUDE.md pede das
-- constraints — a regra mora no objeto, não na disciplina de quem chama.
--
-- SECURITY DEFINER: a função roda como dona da tabela e por isso ignora a RLS —
-- necessário, porque não existe (nem deve existir) policy de DELETE. `set
-- search_path = public` fecha o sequestro de resolução de nome.
create or replace function public.limpar_erros_antigos(dias integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  v_apagadas integer;
begin
  if dias is null or dias < 7 then
    raise exception
      'RETENCAO_CURTA_DEMAIS: limpar_erros_antigos exige dias >= 7 (recebeu %). Com 0 isto seria um TRUNCATE.',
      coalesce(dias::text, 'null')
      using errcode = 'invalid_parameter_value';
  end if;

  delete from public.erros
   where criado_em < now() - (dias || ' days')::interval;

  get diagnostics v_apagadas = row_count;
  return v_apagadas;
end;
$funcao$;

comment on function public.limpar_erros_antigos(integer) is
  'Retenção de 90 dias da fila de erros (spec §12): apaga o que passou de `dias` e devolve quantas linhas saíram. Recusa `dias < 7` — a segunda camada da promessa de PII depende de esta rotina rodar, e um zero digitado errado apagaria a prova em vez de expirá-la. Chamada pelo n8n; só a chave de serviço executa.';

-- Default ACL do Supabase concede EXECUTE a anon/authenticated em função nova,
-- e o Postgres concede a PUBLIC por cima. Os três saem.
revoke all on function public.limpar_erros_antigos(integer) from public, anon, authenticated;
grant execute on function public.limpar_erros_antigos(integer) to service_role;

-- ============================================================================
-- Autoconferência — prova pelo EFEITO, do lado de quem ataca
-- ============================================================================
-- Nada aqui pergunta se o objeto existe. Lista fixa num `IN` já deu falso
-- negativo neste repositório, e policy que existe pode não conceder nada. As
-- provas são: privilégio consultado por coluna, tabela LIDA e ESCRITA sob os
-- papéis de verdade (`set local role` + claim de JWT), e cada constraint
-- exercida contra uma violação real.
--
-- A sonda de retenção roda dentro de um `begin ... exception` desfeito de
-- propósito: plpgsql não tem SAVEPOINT, e o desvio é este — a variável
-- atribuída dentro do bloco SOBREVIVE ao rollback dele. Sem isso, reaplicar
-- esta migração num banco já povoado apagaria erro real de verdade.
do $aceite$
declare
  falhas       int := 0;
  pol          record;
  v_id         uuid;
  v_org        uuid;
  v_staff      uuid;
  v_nao_staff  uuid;
  v_apagadas   int := -1;
  v_ja_antigas int := -1;
  lidas        int;
begin
  -- ── 1. RLS ligada, e nenhuma policy alcançando anon/public ──────────────
  if not (select relrowsecurity from pg_class where oid = 'public.erros'::regclass) then
    falhas := falhas + 1;
    raise warning 'FALHOU: RLS desligada em public.erros';
  end if;

  for pol in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'erros'
       and ('anon' = any(roles) or 'public' = any(roles))
  loop
    falhas := falhas + 1;
    raise warning 'FALHOU: policy % alcança anon/public', pol.policyname;
  end loop;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'erros'
       and cmd in ('INSERT', 'DELETE')
  ) then
    falhas := falhas + 1;
    raise warning 'FALHOU: nasceu policy de INSERT/DELETE — a porta que o desenho fecha';
  end if;

  -- ── 2. Privilégio de tabela: anon fora, authenticated só lê ─────────────
  if has_table_privilege('anon', 'public.erros', 'SELECT')
     or has_table_privilege('anon', 'public.erros', 'INSERT')
     or has_table_privilege('anon', 'public.erros', 'UPDATE')
     or has_table_privilege('anon', 'public.erros', 'DELETE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon ainda tem privilégio em public.erros (o default ACL venceu)';
  end if;

  if not has_table_privilege('authenticated', 'public.erros', 'SELECT') then
    falhas := falhas + 1;
    raise warning 'FALHOU: authenticated perdeu o SELECT — a /admin/erros nasceria vazia';
  end if;

  if has_table_privilege('authenticated', 'public.erros', 'INSERT')
     or has_table_privilege('authenticated', 'public.erros', 'DELETE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: authenticated insere ou apaga erro';
  end if;

  -- ── 3. O grant é POR COLUNA — o coração do desenho ──────────────────────
  if has_column_privilege('authenticated', 'public.erros', 'mensagem', 'UPDATE')
     or has_column_privilege('authenticated', 'public.erros', 'stack', 'UPDATE')
     or has_column_privilege('authenticated', 'public.erros', 'assunto', 'UPDATE')
     or has_column_privilege('authenticated', 'public.erros', 'hash_agrupamento', 'UPDATE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: staff pode reescrever a prova do erro (UPDATE além das duas colunas)';
  end if;

  if not has_column_privilege('authenticated', 'public.erros', 'resolvido_em', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.erros', 'resolvido_por', 'UPDATE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: staff não consegue marcar como resolvido';
  end if;

  -- ── 4. A função de retenção é só da chave de serviço ────────────────────
  if has_function_privilege('anon', 'public.limpar_erros_antigos(integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.limpar_erros_antigos(integer)', 'EXECUTE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: limpar_erros_antigos executável por anon/authenticated';
  end if;

  -- Honestidade sobre o alcance desta linha: neste projeto o `pg_default_acl`
  -- já concede EXECUTE a `service_role` em toda função nova, então apagar o
  -- GRANT explícito lá em cima NÃO deixa este teste vermelho — foi conferido
  -- por mutação. Ele guarda o outro lado: um `revoke ... from service_role`
  -- futuro, ou um projeto onde o default ACL seja outro (o andaime local).
  if not has_function_privilege('service_role', 'public.limpar_erros_antigos(integer)', 'EXECUTE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: service_role não executa a retenção — o n8n bateria em 42501';
  end if;

  -- ── 5. As constraints, exercidas contra violação real ───────────────────
  begin
    insert into public.erros (origem, natureza, assunto, mensagem, hash_agrupamento)
    values ('x', 'quebra', 'aceite-erros', 'sonda de aceite', 'deadbeef');
    falhas := falhas + 1;
    raise warning 'FALHOU: origem fora do vocabulário foi aceita';
  exception when check_violation then null; end;

  begin
    insert into public.erros (origem, natureza, assunto, mensagem, hash_agrupamento)
    values ('servidor', 'parada', 'aceite-erros', 'sonda de aceite', 'deadbeef');
    falhas := falhas + 1;
    raise warning 'FALHOU: natureza `parada` virou linha — ela é do WhatsApp, não da tabela';
  exception when check_violation then null; end;

  begin
    insert into public.erros (origem, natureza, assunto, mensagem, hash_agrupamento)
    values ('servidor', 'quebra', 'aceite-erros', 'sonda de aceite', 'NAO-HEX');
    falhas := falhas + 1;
    raise warning 'FALHOU: hash_agrupamento fora do hex foi aceito';
  exception when check_violation then null; end;

  begin
    insert into public.erros (origem, natureza, assunto, mensagem, hash_agrupamento, suprimidas)
    values ('servidor', 'quebra', 'aceite-erros', 'sonda de aceite', 'deadbeef', -1);
    falhas := falhas + 1;
    raise warning 'FALHOU: contador de suprimidas aceitou valor negativo';
  exception when check_violation then null; end;

  -- ── 6. A linha boa, e o DEFAULT de org_id resolvendo no INSERT ──────────
  insert into public.erros (origem, natureza, assunto, mensagem, stack, rota, hash_agrupamento)
  values ('servidor', 'quebra', 'aceite-erros',
          'sonda de aceite — sem PII', 'Error: sonda\n    at aceite',
          '/api/aceite', '0badc0de')
  returning id, org_id into v_id, v_org;

  if v_org is distinct from public.org_padrao() then
    falhas := falhas + 1;
    raise warning 'FALHOU: org_id não veio de org_padrao()';
  end if;

  -- ── 7. Leitura sob os papéis de verdade ────────────────────────────────
  --     RLS bloqueada devolve VAZIO, não erro: perguntar ao `pg_policies` não
  --     detectaria nada disto.
  select id into v_staff from public.profiles where public.is_staff(id) limit 1;
  if v_staff is null then
    raise exception 'ACEITE IMPOSSÍVEL: não há staff na base para exercer a policy';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff::text, 'role', 'authenticated')::text, true);
  select count(*) into lidas from public.erros where id = v_id;
  reset role;
  if lidas <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: staff leu % linha(s), esperado 1', lidas;
  end if;

  select u.id into v_nao_staff from auth.users u where not public.is_staff(u.id) limit 1;
  if v_nao_staff is not null then
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_nao_staff::text, 'role', 'authenticated')::text, true);
    select count(*) into lidas from public.erros where id = v_id;
    reset role;
    if lidas <> 0 then
      falhas := falhas + 1;
      raise warning 'FALHOU: quem não é staff leu % linha(s) de erro', lidas;
    end if;
  else
    raise notice 'Sem usuário não-staff na base — o contraste de leitura não pôde ser exercido.';
  end if;

  set local role anon;
  begin
    select count(*) into lidas from public.erros;
    falhas := falhas + 1;
    raise warning 'FALHOU: anon alcançou public.erros';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── 8. Escrita do staff: resolve sim, reescreve a prova não ─────────────
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff::text, 'role', 'authenticated')::text, true);

  begin
    update public.erros set mensagem = 'reescrito pelo staff' where id = v_id;
    falhas := falhas + 1;
    raise warning 'FALHOU: staff reescreveu a mensagem do erro';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.erros (origem, natureza, assunto, mensagem, hash_agrupamento)
    values ('servidor', 'quebra', 'aceite-forjado', 'linha forjada pelo painel', 'deadbeef');
    falhas := falhas + 1;
    raise warning 'FALHOU: usuário logado forjou linha de erro';
  exception when insufficient_privilege then null; end;

  -- As duas maneiras de isto quebrar dão sintomas diferentes e nenhuma delas
  -- pode abortar o aceite antes da conta final: grant faltando levanta 42501,
  -- RLS recusando não levanta nada e devolve zero linha.
  begin
    update public.erros
       set resolvido_em = now(), resolvido_por = v_staff
     where id = v_id;
    get diagnostics lidas = row_count;
  exception when insufficient_privilege then
    lidas := -1;
  end;
  reset role;

  if lidas <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: staff marcou % linha(s) como resolvida, esperado 1 (-1 = grant negou; 0 = RLS recusou calada)', lidas;
  end if;

  -- ── 9. Retenção — dentro de um bloco desfeito de propósito ──────────────
  begin
    select count(*) into v_ja_antigas
      from public.erros where criado_em < now() - interval '90 days';

    insert into public.erros (origem, natureza, assunto, mensagem, hash_agrupamento, criado_em)
    values ('servidor', 'quebra', 'aceite-retencao', 'sonda de retenção', '0badc0de',
            now() - interval '100 days');

    v_apagadas := public.limpar_erros_antigos(90);

    -- Desfaz INSERT e DELETE desta sonda. `v_apagadas` e `v_ja_antigas`
    -- sobrevivem: variável de plpgsql não é transacional.
    raise exception 'DESFAZER_SONDA_DE_RETENCAO' using errcode = 'restrict_violation';
  exception when restrict_violation then null; end;

  if v_apagadas <> v_ja_antigas + 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: limpar_erros_antigos(90) devolveu %, esperado %',
      v_apagadas, v_ja_antigas + 1;
  end if;

  -- O piso, nos dois lados: 0 é o acidente que apagaria tudo, 6 é a borda.
  begin
    perform public.limpar_erros_antigos(0);
    falhas := falhas + 1;
    raise warning 'FALHOU: limpar_erros_antigos(0) executou — seria um TRUNCATE';
  exception when invalid_parameter_value then null; end;

  begin
    perform public.limpar_erros_antigos(6);
    falhas := falhas + 1;
    raise warning 'FALHOU: limpar_erros_antigos(6) passou pelo piso de 7 dias';
  exception when invalid_parameter_value then null; end;

  -- ── 10. Limpeza das sondas e veredito ──────────────────────────────────
  delete from public.erros where assunto in ('aceite-erros', 'aceite-retencao', 'aceite-forjado');

  if exists (select 1 from public.erros where assunto like 'aceite-%') then
    falhas := falhas + 1;
    raise warning 'FALHOU: sobrou sonda de aceite na tabela';
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) em public.erros', falhas;
  end if;

  raise notice 'erros OK: RLS ligada, anon nem alcança, staff lê e resolve mas não reescreve nem forja.';
  raise notice 'erros OK: 4 constraints recusaram violação (origem, natureza `parada`, hash não-hex, suprimidas < 0).';
  raise notice 'erros OK: org_id veio de org_padrao(); retenção apagou % linha(s) na sonda e recusou dias=0 e dias=6.', v_apagadas;
  raise notice 'erros OK: limpar_erros_antigos só executa pela chave de serviço; sondas removidas.';
end $aceite$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260910120000', 'erros_do_site')
  on conflict (version) do nothing;
