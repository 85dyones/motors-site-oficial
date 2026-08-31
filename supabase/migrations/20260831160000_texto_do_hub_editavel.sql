-- ---------------------------------------------------------------------------
-- O texto das páginas de hub passa a ser editável pelo painel
-- ---------------------------------------------------------------------------
-- Decisão do dono em 2026-08-31, olhando `/carros/volkswagen/saveiro`:
-- *"precisamos que o painel permita editar o texto, hoje ele é criado
-- automaticamente e não tem muito sentido... é repetitivo e redundante"*.
--
-- ---------------------------------------------------------------------------
-- A chave é o CAMINHO, e isso não é preguiça
-- ---------------------------------------------------------------------------
-- Um hub não tem linha em tabela nenhuma: ele é derivado de `estoque_motors`
-- em tempo de leitura (`lib/hubsDeEstoque.ts`). Marca, modelo, carroceria,
-- perfil e faixa de preço são cinco formas diferentes de agrupar o mesmo
-- estoque, e cada uma tem a sua estrutura própria.
--
-- O que todas têm em comum é a URL. `caminhosDosHubs()` já enumera as 103 que
-- existem hoje — 20 de marca, 65 de modelo, 18 recortes de `/estoque` —, e é
-- essa lista que a tela do painel usa. Chavear pelo caminho dá identidade
-- única sem inventar um vocabulário paralelo ao que a URL já diz, e faz a tela
-- de edição casar exatamente com o que o visitante vê.
--
-- ---------------------------------------------------------------------------
-- Por que ninguém vai preencher 103 páginas — e o que isso implica
-- ---------------------------------------------------------------------------
-- Esta tabela é OVERRIDE, e o texto gerado continua sendo o padrão. É o mesmo
-- padrão de `modelo_override` e `descricao_seo`: linha ausente ou campo nulo
-- significa "use o que o sistema escreve".
--
-- É por isso que a redundância do gerador é corrigida junto, no código: com
-- 103 hubs, a edição manual resolve os cinco que alguém abrir, e o texto
-- automático segue respondendo pelos outros noventa e tantos.
--
-- ---------------------------------------------------------------------------
-- Leitura pública, escrita de staff — com GRANT, não só policy
-- ---------------------------------------------------------------------------
-- O site público lê o Supabase com a chave **anon** (`lib/supabase.ts`), então
-- `anon` precisa de SELECT: é texto de marketing renderizado numa página
-- aberta, sem dado pessoal nenhum. Isso NÃO afrouxa a F0-l, que tirou `anon`
-- das tabelas do núcleo — aquilo é dado de negócio, isto é a cópia do site.
--
-- E o GRANT vem escrito ao lado de cada policy porque hoje, nesta mesma base,
-- uma policy correta ficou inútil por falta dele: o Postgres checa o privilégio
-- ANTES da RLS, e `atendimentos` respondeu `permission denied (42501)` com a
-- policy no lugar (ver `20260831150000`). O aceite abaixo lê como usuário de
-- verdade, em vez de conferir `pg_policies`.
-- ---------------------------------------------------------------------------

create table if not exists public.textos_de_hub (
  -- O caminho servido, sem barra final. Ex.: '/carros/volkswagen/saveiro'.
  caminho text primary key,
  -- Nulo = use o gerado. Vazio também: a tela grava "" quando o operador
  -- limpa o campo, e limpar tem de significar "volte ao automático".
  titulo text,
  -- Os parágrafos do corpo, na ordem. Array vazio conta como ausente.
  paragrafos text[],
  -- Quem mexeu, para a mesma pergunta que o histórico do veículo responde.
  atualizado_por uuid references auth.users (id) on delete set null,
  atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

comment on table public.textos_de_hub is
  'Override do texto das páginas de hub (marca, modelo, carroceria, perfil, faixa). Linha ausente ou campo nulo = usa o texto gerado por lib/textoDosHubs.ts. Chaveada pelo caminho servido.';
comment on column public.textos_de_hub.caminho is
  'O caminho da página, começando com barra e sem barra final — o mesmo que caminhosDosHubs() devolve.';

alter table public.textos_de_hub enable row level security;

-- Leitura: qualquer visitante. É o texto que a página mostra.
drop policy if exists textos_de_hub_leitura_publica on public.textos_de_hub;
create policy textos_de_hub_leitura_publica on public.textos_de_hub
  for select to anon, authenticated using (true);
grant select on public.textos_de_hub to anon, authenticated;

-- Escrita: staff. `is_staff`, e não papel primário — cliente da Garagem
-- autentica no mesmo pool e não escreve cópia do site.
drop policy if exists textos_de_hub_escrita_staff on public.textos_de_hub;
create policy textos_de_hub_escrita_staff on public.textos_de_hub
  for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
grant insert, update, delete on public.textos_de_hub to authenticated;

-- Carimbo de quem e quando, sem depender de a rota lembrar.
create or replace function public.carimbar_texto_de_hub()
returns trigger language plpgsql security invoker as $$
begin
  new.atualizado_em := now();
  -- `auth.uid()` é nulo quando quem escreve é a chave de serviço; a coluna
  -- aceita nulo de propósito, e "sem autor" é a verdade nesse caso.
  if new.atualizado_por is null then
    new.atualizado_por := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_carimbar_texto_de_hub on public.textos_de_hub;
create trigger trg_carimbar_texto_de_hub
  before insert or update on public.textos_de_hub
  for each row execute function public.carimbar_texto_de_hub();

-- ---------------------------------------------------------------------------
-- Aceite — lê e escreve como gente
-- ---------------------------------------------------------------------------
do $$
declare
  falhas int := 0;
  id_staff uuid;
  id_outro uuid;
  lidas int;
begin
  select id into id_staff from public.profiles where public.is_staff(id) limit 1;
  if id_staff is null then
    raise exception 'ACEITE IMPOSSÍVEL: não há staff na base para exercer a policy';
  end if;

  insert into public.textos_de_hub (caminho, titulo, paragrafos)
    values ('/carros/aceite/teste', 'Título de aceite', array['Um parágrafo.']);

  -- 1. O visitante anônimo LÊ — sem isto a página pública nunca mostraria o
  --    texto editado, e o sintoma seria "salvei e não mudou nada no site".
  set local role anon;
  select count(*) into lidas from public.textos_de_hub where caminho = '/carros/aceite/teste';
  reset role;
  if lidas <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon leu % linha(s), esperado 1 — o site não veria o texto', lidas;
  end if;

  -- 2. O anônimo NÃO escreve. Cópia do site editável pela internet seria
  --    desfiguração de página com indexação.
  set local role anon;
  begin
    insert into public.textos_de_hub (caminho, titulo) values ('/carros/anon/invasao', 'x');
    falhas := falhas + 1;
    raise warning 'FALHOU: anon escreveu na cópia do site';
  exception when insufficient_privilege or others then
    null; -- é o esperado
  end;
  reset role;

  -- 3. O staff ESCREVE.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', id_staff::text, 'role', 'authenticated')::text, true);
  begin
    update public.textos_de_hub set titulo = 'Editado pelo painel'
      where caminho = '/carros/aceite/teste';
  exception when others then
    falhas := falhas + 1;
    raise warning 'FALHOU: staff não conseguiu editar: %', sqlerrm;
  end;
  reset role;
  if not exists (
    select 1 from public.textos_de_hub
    where caminho = '/carros/aceite/teste' and titulo = 'Editado pelo painel'
  ) then
    falhas := falhas + 1;
    raise warning 'FALHOU: a edição do staff não persistiu';
  end if;

  -- 4. Quem não é staff não escreve, ainda que autenticado.
  select u.id into id_outro from auth.users u where not public.is_staff(u.id) limit 1;
  if id_outro is not null then
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', id_outro::text, 'role', 'authenticated')::text, true);
    begin
      update public.textos_de_hub set titulo = 'invadido' where caminho = '/carros/aceite/teste';
      if found then
        falhas := falhas + 1;
        raise warning 'FALHOU: não-staff editou o texto do hub';
      end if;
    exception when insufficient_privilege then
      null;
    end;
    reset role;
  end if;

  -- 5. O carimbo funciona sem a rota lembrar dele.
  if not exists (
    select 1 from public.textos_de_hub
    where caminho = '/carros/aceite/teste' and atualizado_em is not null
  ) then
    falhas := falhas + 1;
    raise warning 'FALHOU: o carimbo de atualização não foi gravado';
  end if;

  delete from public.textos_de_hub where caminho like '/carros/aceite/%' or caminho like '/carros/anon/%';

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) no texto editável do hub', falhas;
  end if;

  raise notice 'Texto do hub OK: visitante lê, staff edita, anon não escreve, carimbo grava.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260831160000', 'texto_do_hub_editavel')
  on conflict (version) do nothing;
