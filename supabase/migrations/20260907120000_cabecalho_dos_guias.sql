-- ---------------------------------------------------------------------------
-- O cabeçalho de /guias sai do código e passa a ser editável
-- ---------------------------------------------------------------------------
-- Decisão do dono em 2026-09-07, no mesmo dia em que a seção deixou de se
-- chamar por um assunto só: o painel passa a editar DOIS textos do topo de
-- `/guias` — o título de busca da aba e o resumo da seção.
--
-- Hoje os dois são constantes em `src/lib/guias.ts` (`TITULO_SEO_DA_SECAO` e
-- `RESUMO_DA_SECAO`), e mexer numa vírgula deles é abrir um PR. É o mesmo
-- motivo que tirou o conteúdo dos guias do código ontem
-- (`20260906160000_guias_no_banco`), com uma diferença que decide tudo o que
-- vem abaixo — ver "override, não fonte".
--
-- ---------------------------------------------------------------------------
-- O que NÃO entra: o nome da seção. E isso é decisão, não esquecimento
-- ---------------------------------------------------------------------------
-- `NOME_DA_SECAO` ("Guias Motors") fica no código. Ele alimenta SEIS
-- superfícies que ninguém abre juntas — o `<h1>`, o degrau visível da trilha
-- nas duas rotas, o degrau do `BreadcrumbList`, o `CollectionPage.name`, o
-- rótulo do rodapé e o menu do cabeçalho.
--
-- A renomeação de 07/09 mostrou o custo de errar isso: a revisão do
-- `qa-guardian` desfez a troca em seis pontos, um a um, e a suíte cheia (2207
-- testes) ficou VERDE nas seis — o site serviria quatro nomes diferentes para
-- a mesma seção sem ninguém notar. Hoje `tests/guias-publicam-o-grafo.test.ts`
-- afirma que as seis saídas RENDERIZADAS são a mesma string, e é essa trava
-- que um campo de painel tiraria do caminho.
--
-- Título de busca e resumo não têm esse problema: cada um tem uma fonte só, e
-- nenhum dos dois é identidade de navegação. Por isso eles vêm, e o nome não.
--
-- ---------------------------------------------------------------------------
-- Aqui o banco é OVERRIDE — e por isso esta migração não semeia nada
-- ---------------------------------------------------------------------------
-- Duas tabelas vizinhas, dois contratos opostos. Este arquivo fica com o de
-- `textos_de_hub`, não com o de `guias`:
--
--   · `guias` é FONTE: sem linha, a página não existe. Por isso a migração de
--     ontem trouxe o texto verbatim para o banco.
--   · Aqui a página existe de qualquer jeito. `/guias` está no ar servindo o
--     cabeçalho que o código traz, e é ele que continua sendo o padrão.
--
-- Consequência direta, e ela é o ponto: **esta migração aplica com a tabela
-- VAZIA**. O site não muda de aparência no dia em que ela roda; ela só abre a
-- porta. Semear as duas constantes aqui criaria uma segunda cópia do mesmo
-- texto — duas verdades que divergem no primeiro PR que tocar o arquivo, sem
-- que nada acuse. O aceite no fim exige a tabela vazia ao fim da transação.
--
-- É também o motivo de NULO e VAZIO significarem a mesma coisa: "use o texto
-- do código". A tela grava '' quando o operador limpa o campo, e limpar tem de
-- devolver o automático — nunca deixar o `<title>` em branco. Esse é o idioma
-- que `normalizarTextoDoHub` já fala; aqui o gatilho o transforma em
-- estrutura, colapsando '' e '   ' em NULO. Um estado ausente só, em vez de
-- três formas de dizer a mesma coisa — e uma delas, o espaço solitário, passa
-- por qualquer teste de valor-falso e vira título em branco na aba.
--
-- ---------------------------------------------------------------------------
-- O teto é de sanidade. 155 NÃO vira constraint
-- ---------------------------------------------------------------------------
-- O `resumo` vira a meta description de `/guias`. A régua da casa são 155
-- caracteres (`conteudo-seo/rascunhos.json`, `tests/promessa-publica.test.ts`)
-- e ela continua morando na INTERFACE, como aviso.
--
-- Um CHECK de 155 recusaria o texto do dono na cara dele, no meio da edição,
-- com erro cru do Postgres. Os dois custos não se comparam: uma description de
-- 160 é truncada no SERP e segue funcionando; uma tela que se recusa a salvar
-- faz a pessoa desistir de editar, e o texto volta a envelhecer no código —
-- que é exatamente o problema que esta tabela existe para resolver.
--
-- 300 é teto de abuso, não régua editorial. O aceite prova os dois lados: 301
-- é recusado, e 158 — o comprimento que a revisão de 07/09 pegou no resumo
-- original — é ACEITO.
--
-- ---------------------------------------------------------------------------
-- `org_id` não entra, pelo mesmo raciocínio de ontem
-- ---------------------------------------------------------------------------
-- A régua do handoff ("toda tabela nova do núcleo: `org_id` + RLS + policy por
-- papel") vale para dado de negócio, que um dia pode ser de mais de uma loja.
-- Isto é a cópia do SITE, e o site é um: o cabeçalho de `/guias` é do domínio,
-- não de uma organização. Aqui a prova está no próprio schema, porque a tabela
-- é de LINHA ÚNICA — `org_id` só faria sentido junto com a segunda linha, e a
-- segunda linha é justamente o que o CHECK abaixo proíbe. Mesmo tratamento de
-- `textos_de_hub`, `guias` e `site_settings`. Se um dia a plataforma servir o
-- site de outra loja, `org_id` e a chave por organização entram juntos, de
-- forma aditiva.
--
-- ---------------------------------------------------------------------------
-- GRANT colado na policy — os dois lados, sempre
-- ---------------------------------------------------------------------------
-- O site lê o Supabase com a chave **anon** (`lib/supabase.ts`), então `anon`
-- precisa de SELECT. Privilégio é checado ANTES da RLS: foi assim que
-- `atendimentos` respondeu `permission denied (42501)` com a policy no lugar
-- (`20260831150000`). E o `revoke` de escrita não é decorativo — o
-- `pg_default_acl` do Supabase concede a `anon` privilégio amplo em tabela
-- nova de `public` (F0-l, `20260829140000`). Cópia do site editável pela
-- internet é desfiguração de página indexada.
-- ---------------------------------------------------------------------------

create table if not exists public.cabecalho_dos_guias (
  -- Linha única imposta pelo SCHEMA, não por convenção: a chave primária dá a
  -- unicidade e o CHECK fecha o valor. Existe uma seção `/guias`, e o segundo
  -- INSERT bate numa das duas travas — na PK se repetir a chave, no CHECK se
  -- inventar outra. Sem isso, "qual das linhas é a boa?" viraria pergunta de
  -- leitura, respondida por um `limit 1` sem ordem em produção.
  --
  -- O default deixa o painel escrever sem saber o nome da chave: um upsert de
  -- dois campos já cai na linha certa.
  secao text primary key default 'guias'
    constraint cabecalho_dos_guias_linha_unica check (secao = 'guias'),

  -- O `<title>` da aba do índice, SEM o sufixo da loja: `app/guias/page.tsx`
  -- monta `${titulo} | Motors Store`. Guardar o sufixo aqui o duplicaria na
  -- página, e o operador só descobriria olhando a aba.
  --
  -- Nulo = use `TITULO_SEO_DA_SECAO`. Vazio também — ver o cabeçalho.
  titulo_seo text
    constraint cabecalho_dos_guias_titulo_seo_teto
      check (titulo_seo is null or length(titulo_seo) <= 300),

  -- O resumo da seção. Chama-se `resumo`, e não `descricao`, porque ele não é
  -- só meta: o MESMO texto aparece sob o `<h1>`, na meta description, no card
  -- de compartilhamento e no preview desse card no painel. Nome de coluna que
  -- diz "descrição" convidaria alguém a escrever um texto só para o robô num
  -- lugar que o visitante lê.
  --
  -- Nulo = use `RESUMO_DA_SECAO`. Vazio também.
  resumo text
    constraint cabecalho_dos_guias_resumo_teto
      check (resumo is null or length(resumo) <= 300),

  -- Quem mexeu, para a mesma pergunta que o histórico do veículo responde.
  atualizado_por uuid references auth.users (id) on delete set null,
  atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

comment on table public.cabecalho_dos_guias is
  'Override do cabeçalho da seção /guias (título de busca e resumo). Linha única, e tabela vazia é o estado normal: sem linha, ou com campo nulo/vazio, vale o texto de src/lib/guias.ts. O NOME da seção não está aqui de propósito — ele alimenta seis superfícies e fica no código, com trava de teste.';
comment on column public.cabecalho_dos_guias.secao is
  'Chave fixa: guias. O CHECK e a PK juntos garantem uma linha só — não existe segunda seção com cabeçalho editável.';
comment on column public.cabecalho_dos_guias.titulo_seo is
  'O <title> da aba, SEM o sufixo " | Motors Store", que a página acrescenta. Nulo ou vazio = TITULO_SEO_DA_SECAO.';
comment on column public.cabecalho_dos_guias.resumo is
  'O resumo que serve quatro superfícies (sob o h1, meta description, card de compartilhamento e preview do painel). Nulo ou vazio = RESUMO_DA_SECAO. O teto de 300 é sanidade; a régua de 155 é aviso de interface, não recusa do banco.';
comment on column public.cabecalho_dos_guias.atualizado_em is
  'Carimbado pelo servidor em todo UPDATE. Num INSERT o valor informado vence.';

alter table public.cabecalho_dos_guias enable row level security;

-- Leitura: qualquer visitante. É o texto que a página mostra, e aqui não há
-- estado de rascunho — o que está gravado está no ar. (Em `guias` a leitura
-- pública filtra por `estado = 'publicado'`, porque lá o banco é fonte e
-- guarda texto ainda não revisado. Aqui um campo em construção se resolve
-- limpando-o: volta ao texto do código, que é publicável por definição.)
drop policy if exists cabecalho_dos_guias_leitura_publica on public.cabecalho_dos_guias;
create policy cabecalho_dos_guias_leitura_publica on public.cabecalho_dos_guias
  for select to anon, authenticated using (true);
grant select on public.cabecalho_dos_guias to anon, authenticated;

-- Escrita: staff. `is_staff`, e não papel primário — cliente da Garagem
-- autentica no mesmo pool e não escreve cópia do site.
--
-- DELETE entra na policy de propósito: apagar a linha é o mesmo que limpar os
-- dois campos, e o resultado é o cabeçalho do código. Não existe estado em que
-- a página fique sem topo, então não há o que proteger de uma exclusão.
drop policy if exists cabecalho_dos_guias_escrita_staff on public.cabecalho_dos_guias;
create policy cabecalho_dos_guias_escrita_staff on public.cabecalho_dos_guias
  for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
grant insert, update, delete on public.cabecalho_dos_guias to authenticated;

-- `anon` lê o site; não escreve nele.
revoke insert, update, delete, truncate, references, trigger
  on public.cabecalho_dos_guias from anon;

-- ---------------------------------------------------------------------------
-- O carimbo, e a normalização que faz "limpar" significar uma coisa só
-- ---------------------------------------------------------------------------
create or replace function public.carimbar_cabecalho_dos_guias()
returns trigger language plpgsql security invoker as $fn$
begin
  -- Vazio e espaço em branco entram e viram NULO. Não é rejeição: limpar o
  -- campo é operação legítima, e o banco só grava a forma canônica do
  -- "ausente". Espaço na ponta de um `<title>` não é conteúdo, e é justamente
  -- ele que separa "vazio" de "quase vazio" numa tela onde ninguém vê a
  -- diferença.
  new.titulo_seo := nullif(btrim(coalesce(new.titulo_seo, '')), '');
  new.resumo := nullif(btrim(coalesce(new.resumo, '')), '');

  -- A data de modificação é do servidor, e não depende de a rota lembrar. Só
  -- em UPDATE: num INSERT o valor informado vence, que é o que permitiria
  -- migrar um texto sem reescrever a data dele para "agora".
  if tg_op = 'UPDATE' then
    new.atualizado_em := now();
  end if;

  -- Autor: quem manda é a sessão. Num UPDATE, `new.atualizado_por` chega
  -- herdado da linha antiga — sem esta linha o PRIMEIRO autor ficaria
  -- congelado para sempre, que é o defeito que `textos_de_hub` carrega hoje e
  -- que `guias` já corrigiu. `auth.uid()` é nulo quando quem escreve é a chave
  -- de serviço ou uma migração; a coluna aceita nulo, e "sem autor" é a
  -- verdade nesse caso.
  if auth.uid() is not null then
    new.atualizado_por := auth.uid();
  end if;

  return new;
end $fn$;

drop trigger if exists trg_carimbar_cabecalho_dos_guias on public.cabecalho_dos_guias;
create trigger trg_carimbar_cabecalho_dos_guias
  before insert or update on public.cabecalho_dos_guias
  for each row execute function public.carimbar_cabecalho_dos_guias();

-- ---------------------------------------------------------------------------
-- Aceite — prova por COMPORTAMENTO, lendo e escrevendo como gente
-- ---------------------------------------------------------------------------
-- Nada aqui consulta `pg_policies` ou `information_schema`: policy correta e
-- inútil por falta de GRANT já aconteceu nesta base, e as duas se parecem no
-- catálogo. Cada asserção assume um papel e tenta o ato.
do $$
declare
  falhas int := 0;
  id_staff uuid;
  id_outro uuid;
  id_anterior uuid;
  lidas int;
  lido text;
  autor uuid;
  carimbo timestamptz;
  sobraram int;
  ausentes int;
begin
  -- O staff precisa existir EM `auth.users`: `atualizado_por` tem FK para lá,
  -- e um perfil órfão faria o teste de escrita falhar por outro motivo.
  select p.id into id_staff
    from public.profiles p
    join auth.users u on u.id = p.id
   where public.is_staff(p.id)
   limit 1;
  if id_staff is null then
    raise exception 'ACEITE IMPOSSÍVEL: não há staff na base para exercer a policy';
  end if;

  select u.id into id_outro from auth.users u where not public.is_staff(u.id) limit 1;
  select u.id into id_anterior from auth.users u where u.id <> id_staff limit 1;

  -- 1. LINHA ÚNICA (a). Uma segunda seção é recusada pelo CHECK com a tabela
  --    ainda vazia — a trava não depende de já existir linha.
  begin
    insert into public.cabecalho_dos_guias (secao, titulo_seo) values ('estoque', 'x');
    falhas := falhas + 1;
    raise warning 'FALHOU: entrou cabeçalho de outra seção — a tabela deixou de ser de linha única';
  exception when check_violation then
    null; -- é o esperado
  end;

  -- Semeia a linha como DONO, com autor antigo e data velha, para que o teste
  -- do carimbo (7) tenha de onde sair. Claims vazias: `auth.uid()` é nulo, o
  -- gatilho não sobrescreve o autor informado, e o INSERT preserva a data.
  perform set_config('request.jwt.claims', '', true);
  insert into public.cabecalho_dos_guias (titulo_seo, resumo, atualizado_por, atualizado_em)
    values ('Aceite: título da aba', 'Aceite: resumo da seção.',
            id_anterior, '2020-01-01T00:00:00-03:00'::timestamptz);

  -- 2. LINHA ÚNICA (b). A segunda linha bate na chave primária.
  begin
    insert into public.cabecalho_dos_guias (titulo_seo) values ('duplicata');
    falhas := falhas + 1;
    raise warning 'FALHOU: entrou uma segunda linha de cabeçalho';
  exception when unique_violation then
    null;
  end;

  -- 3. TETO DE SANIDADE. 301 é recusado nos dois campos…
  begin
    update public.cabecalho_dos_guias set resumo = repeat('a', 301);
    falhas := falhas + 1;
    raise warning 'FALHOU: aceitou resumo de 301 caracteres';
  exception when check_violation then
    null;
  end;
  begin
    update public.cabecalho_dos_guias set titulo_seo = repeat('a', 301);
    falhas := falhas + 1;
    raise warning 'FALHOU: aceitou título de 301 caracteres';
  exception when check_violation then
    null;
  end;

  -- … e 158 é ACEITO. Este é o teste que impede alguém de "endurecer" o teto
  -- para os 155 da régua de meta description: quem decide o texto é o dono, e
  -- o aviso de comprimento é da interface. 158 é o comprimento exato que a
  -- revisão de 07/09 pegou no resumo original.
  begin
    update public.cabecalho_dos_guias set resumo = repeat('a', 158);
  exception when others then
    falhas := falhas + 1;
    raise warning 'FALHOU: o banco recusou um resumo de 158 — a régua de 155 virou trava (%)', sqlerrm;
  end;
  select length(resumo) into lidas from public.cabecalho_dos_guias;
  if lidas is distinct from 158 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o resumo de 158 não persistiu (comprimento gravado: %)', lidas;
  end if;

  -- 4. VAZIO E NULO SÃO ACEITOS, e significam a mesma coisa: volte ao código.
  --    O vazio vem da tela quando o operador limpa o campo; o espaço solitário
  --    vem de quem limpou mal. Os três caem no mesmo estado ausente, e a linha
  --    CONTINUA existindo — limpar não é apagar.
  update public.cabecalho_dos_guias set titulo_seo = '', resumo = '   ';
  select count(*) into ausentes
    from public.cabecalho_dos_guias
   where titulo_seo is null and resumo is null;
  if ausentes <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: limpar os campos não devolveu o estado ausente (linhas ausentes: %)', ausentes;
  end if;

  update public.cabecalho_dos_guias set titulo_seo = null, resumo = null;
  if not exists (select 1 from public.cabecalho_dos_guias) then
    falhas := falhas + 1;
    raise warning 'FALHOU: gravar nulo apagou a linha';
  end if;

  -- Repõe um texto de verdade para os testes de leitura e de policy.
  update public.cabecalho_dos_guias
     set titulo_seo = 'Aceite: título da aba', resumo = 'Aceite: resumo da seção.';

  -- 5. O VISITANTE ANÔNIMO LÊ. Sem isto a página pública nunca mostraria o
  --    texto editado, e o sintoma seria "salvei e não mudou nada no site".
  set local role anon;
  select count(*), max(titulo_seo) into lidas, lido from public.cabecalho_dos_guias;
  reset role;
  if lidas <> 1 or lido is distinct from 'Aceite: título da aba' then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon leu % linha(s) e o título %', lidas, coalesce(lido, '<nulo>');
  end if;

  -- 6. O ANÔNIMO NÃO ESCREVE — nem cria, nem edita.
  set local role anon;
  begin
    insert into public.cabecalho_dos_guias (secao, titulo_seo) values ('guias', 'invadido');
    falhas := falhas + 1;
    raise warning 'FALHOU: anon escreveu no cabeçalho do site';
  exception
    when insufficient_privilege then
      null; -- o esperado: sem GRANT, o Postgres barra antes de qualquer constraint
    when others then
      falhas := falhas + 1;
      raise warning 'FALHOU: anon foi barrado por % e não por privilégio — o GRANT está aberto', sqlstate;
  end;
  reset role;

  set local role anon;
  begin
    update public.cabecalho_dos_guias set titulo_seo = 'invadido';
    if found then
      falhas := falhas + 1;
      raise warning 'FALHOU: anon editou o cabeçalho do site';
    end if;
  exception when insufficient_privilege then
    null;
  end;
  reset role;

  -- Autenticado que não é staff também não escreve. Aqui o GRANT existe, então
  -- quem recusa é a RLS — e RLS não devolve erro, devolve zero linha: sem o
  -- `found`, este teste passaria sozinho.
  if id_outro is not null then
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', id_outro::text, 'role', 'authenticated')::text, true);
    begin
      update public.cabecalho_dos_guias set titulo_seo = 'invadido';
      if found then
        falhas := falhas + 1;
        raise warning 'FALHOU: autenticado sem papel de staff editou o cabeçalho';
      end if;
    exception when insufficient_privilege then
      null;
    end;
    reset role;
  else
    raise notice 'Sem usuário não-staff na base: a asserção de RLS por papel não pôde ser exercida.';
  end if;

  select titulo_seo into lido from public.cabecalho_dos_guias;
  if lido is distinct from 'Aceite: título da aba' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o cabeçalho mudou depois das tentativas de invasão (valor: %)', coalesce(lido, '<nulo>');
  end if;

  -- 7. O STAFF EDITA — e o gatilho carimba autor e data sem a rota lembrar. O
  --    autor tinha de SAIR de `id_anterior`: congelado no primeiro autor é o
  --    defeito conhecido de `textos_de_hub`, e é o que esta asserção persegue.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', id_staff::text, 'role', 'authenticated')::text, true);
  begin
    update public.cabecalho_dos_guias
       set titulo_seo = 'Editado pelo painel', resumo = 'Resumo editado pelo painel.';
  exception when others then
    falhas := falhas + 1;
    raise warning 'FALHOU: staff não conseguiu editar o cabeçalho: %', sqlerrm;
  end;
  reset role;

  select titulo_seo, atualizado_por, atualizado_em into lido, autor, carimbo
    from public.cabecalho_dos_guias;
  if lido is distinct from 'Editado pelo painel' then
    falhas := falhas + 1;
    raise warning 'FALHOU: a edição do staff não persistiu';
  end if;
  if autor is distinct from id_staff then
    falhas := falhas + 1;
    raise warning 'FALHOU: o autor não foi atualizado (gravado: %, esperado: %)', autor, id_staff;
  end if;
  if carimbo <= '2020-01-01T00:00:00-03:00'::timestamptz then
    falhas := falhas + 1;
    raise warning 'FALHOU: o UPDATE não carimbou a data (ficou em %)', carimbo;
  end if;

  -- 8. O STAFF CRIA a linha do zero. É o caminho do PRIMEIRO save do painel —
  --    um upsert num banco onde a tabela ainda está vazia, que é como esta
  --    migração entrega a produção.
  delete from public.cabecalho_dos_guias;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', id_staff::text, 'role', 'authenticated')::text, true);
  begin
    insert into public.cabecalho_dos_guias (titulo_seo, resumo)
      values ('Criado pelo painel', 'Resumo criado pelo painel.');
  exception when others then
    falhas := falhas + 1;
    raise warning 'FALHOU: staff não conseguiu criar o cabeçalho: %', sqlerrm;
  end;
  reset role;

  select atualizado_por into autor from public.cabecalho_dos_guias;
  if autor is distinct from id_staff then
    falhas := falhas + 1;
    raise warning 'FALHOU: o INSERT do staff não carimbou o autor (gravado: %)', autor;
  end if;

  -- 9. A TABELA TERMINA VAZIA. Não é limpeza de teste: é o estado de entrega.
  --    Vazio significa "use o texto do código", e o código é o que está no ar
  --    hoje. Uma linha de aceite esquecida aqui poria "Criado pelo painel" no
  --    `<title>` de `/guias` em produção.
  delete from public.cabecalho_dos_guias;
  select count(*) into sobraram from public.cabecalho_dos_guias;
  if sobraram <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: sobraram % linha(s) de aceite — o site serviria texto de teste', sobraram;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) no cabeçalho editável dos guias', falhas;
  end if;

  raise notice 'Cabeçalho dos guias OK: linha única imposta (CHECK e PK), anon lê e não escreve, não-staff não escreve, staff cria e edita com carimbo de autor e data, vazio/nulo/espaço voltam ao texto do código, teto recusa 301 e aceita 158, e a tabela é entregue vazia.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260907120000', 'cabecalho_dos_guias')
  on conflict (version) do nothing;
