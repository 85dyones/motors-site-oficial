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
-- que nada acuse. O aceite no fim exige que a tabela termine como começou —
-- vazia na primeira aplicação, e ver a seção seguinte para as outras.
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
-- Rodar de novo não pode apagar o texto do dono
-- ---------------------------------------------------------------------------
-- O arquivo é re-executável de ponta a ponta (`if not exists`, `or replace`,
-- `drop … if exists`, rodapé com `on conflict do nothing`) e
-- `supabase/manutencao/aplicar-migracao.js` roda o SQL que recebe sem consultar
-- o livro-razão — o `on conflict do nothing` do rodapé protege a LINHA do razão,
-- não a execução do corpo. Rodar duas vezes é caminho real, e o aceite abaixo
-- ESCREVE: na linha única de chave fixa `guias`, que é a MESMA que o dono usa.
--
-- As duas migrações irmãs escapam disso escopando a limpeza por chave própria
-- (`guias` apaga por `slug in (…)`, `textos_de_hub` por
-- `caminho like '/carros/aceite/%'`). Aqui não há escapatória por chave: existe
-- uma chave possível, e ela é a do dono.
--
-- Escolha: **fotografar e repor**. Antes do aceite, a linha pré-existente é
-- copiada para uma tabela temporária (`select *`, que pega toda coluna sem
-- listar nenhuma — não apodrece quando uma migração aditiva acrescentar a
-- próxima). O aceite então esvazia a tabela e roda inteiro contra ela vazia,
-- idêntico à primeira aplicação, sem caminho de teste que só exista na segunda
-- vez. No fim ele repõe a cópia, e um bloco SEPARADO confere que a linha voltou
-- igual, campo por campo.
--
-- Três peças (copiar, repor, conferir) e nenhuma delas guarda a outra: apagar
-- QUALQUER uma faz a migração parar. Sem o retrato, os dois blocos recusam-se a
-- rodar (`to_regclass` nulo → exceção) em vez de esvaziar a tabela às cegas;
-- sem a reposição, a conferência acusa; sem a conferência, a reposição ainda
-- está lá. Perder o texto do dono exige três remoções deliberadas, não um
-- descuido.
--
-- E o retrato só significa alguma coisa com a janela FECHADA: `select *` não
-- tranca nada, e o COMMIT de outra sessão entre a foto e a reposição faria o
-- passo 10 repor a versão velha com a conferência aprovando — ela compara com o
-- retrato, não com a verdade. Por isso a cópia é precedida de `lock table … in
-- share row exclusive mode`: a escrita vizinha espera esta transação terminar, a
-- leitura do site não. O porquê do modo, e a honestidade sobre o que essa linha
-- muda hoje, ficam na seção do retrato.
--
-- A outra saída considerada era pular o aceite quando já houvesse linha. Ela
-- também protegeria o texto, e custaria caro: o ensaio contra a produção é o
-- único staging deste projeto, e no dia em que o dono gravasse o cabeçalho o
-- aceite ficaria PULADO para sempre — o arquivo deixaria de provar qualquer
-- coisa exatamente no ambiente onde ele é provado. Fotografando, o aceite
-- continua rodando inteiro e passa a provar uma coisa a mais: que reaplicar
-- devolve a linha do dono como estava.
--
-- A rede de baixo é a transação. O aplicador roda tudo em BEGIN/COMMIT, então
-- qualquer falha entre o retrato e a conferência — e a conferência é `raise
-- exception`, não contagem de falha — reverte a exclusão junto. Não existe
-- estado intermediário commitado.
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
-- RETRATO — a linha que já estiver gravada sai daqui como entrou
-- ---------------------------------------------------------------------------
-- Tirado ANTES de qualquer escrita, e fora do bloco de aceite de propósito:
-- assim a cópia, o uso e a conferência são três peças separadas, e apagar
-- qualquer UMA delas faz a migração parar em vez de apagar o texto do dono.
--
-- `select *` copia a linha coluna a coluna sem nomear nenhuma: a coluna que uma
-- migração aditiva acrescentar amanhã entra no retrato sozinha, que é
-- justamente o que uma lista escrita à mão perderia em silêncio. `on commit
-- drop` garante que a cópia não sobrevive à transação — nem no pooler, que
-- reaproveita sessão.
--
-- O `drop` antes do `create` não é zelo: com `if not exists`, uma segunda
-- execução na MESMA sessão guardaria o retrato velho (vazio) e a conferência do
-- fim acusaria diferença onde não há. O retrato é sempre o de agora.
drop table if exists pg_temp.retrato_cabecalho_dos_guias;

-- A trava vem ANTES do retrato, e é de TABELA — não de linha
-- ---------------------------------------------------------------------------
-- `select *` não tranca nada. Entre o retrato e o `delete` do aceite cabe o
-- COMMIT de outra sessão: se alguém salvar o cabeçalho pelo painel nessa
-- fresta, o passo 10 repõe a versão VELHA e a conferência do fim diz "voltou
-- idêntico" — porque ela compara com o RETRATO, não com a verdade. Janela de
-- ~1 segundo, só na reaplicação, e o que se perde é o texto do dono.
--
-- `for update` no retrato foi descartado, e não por gosto: ele prende as linhas
-- QUE EXISTEM. Esta tabela entrega VAZIA — é o estado normal —, então o caso
-- mais provável da corrida é o PRIMEIRO save do painel ENTRANDO na janela, e aí
-- não há linha para prender. Medido em 07/09 contra a produção, com duas
-- conexões e uma tabela dormente: com o retrato tirado `for update` de um
-- conjunto vazio, a escrita vizinha passa NA HORA, sem esperar nada.
--
-- `share row exclusive` cobre a tabela inteira — inclusive a linha que ainda
-- não existe — e é o modo mais fraco que serve:
--   · conflita com `row exclusive` → INSERT/UPDATE/DELETE de outra sessão
--     esperam esta transação terminar (medido: a vizinha morre no
--     `lock_timeout`, 55P03, e passa assim que esta transação solta);
--   · NÃO conflita com `access share` → `/guias` continua sendo lido pelo
--     `anon` enquanto a migração roda (medido: a leitura vizinha passa na hora);
--   · conflita CONSIGO MESMO → duas execuções deste arquivo entram em fila. Com
--     `share`, que também barra escrita e deixa ler, as duas pegariam a trava
--     juntas e travariam uma na outra no `delete`: deadlock em vez de fila.
--
-- E a honestidade sobre o que esta linha muda HOJE: nada em tempo de execução,
-- e o comentário não vai fingir o contrário. Quando o fluxo chega aqui, esta
-- transação já segura `AccessExclusiveLock` sobre a tabela desde o `alter table
-- … enable row level security` lá de cima — mais forte, e que já barra a
-- escrita vizinha (medido: só com aquele ALTER, a escrita de outra conexão bate
-- no `lock_timeout`). A janela está fechada por ACIDENTE do DDL. Esta linha
-- existe para que ela siga fechada quando o acidente acabar: no dia em que
-- alguém condicionar aquele `alter table`, mover o retrato para cima dele ou
-- separar o aceite em outro arquivo, a garantia viaja junto de quem depende
-- dela.
--
-- Por isso, e sem fingir cobertura: **esta linha não tem mutante
-- determinístico**. Apagá-la não deixa o aceite vermelho — o lock mais forte de
-- cima continua segurando —, e corrida de ~1 segundo não se reproduz de dentro
-- de uma sessão só. A prova é de fora, com duas conexões, e fica no PR. O que
-- dá para afirmar aqui dentro é POSSE de trava, e está na guarda do aceite, ao
-- lado do `to_regclass`.
--
-- (Fora de transação isto falha com 25P01 — `LOCK TABLE` só existe dentro de
-- uma. É o desfecho certo: o retrato inteiro depende do BEGIN/COMMIT único do
-- aplicador.)
lock table public.cabecalho_dos_guias in share row exclusive mode;

create temp table retrato_cabecalho_dos_guias on commit drop as
  select * from public.cabecalho_dos_guias;

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
  havia_cabecalho boolean;
  trava text;
  nao_staff_exercido boolean := false;
begin
  -- FALHA FECHADA. O aceite esvazia a tabela três linhas abaixo; se o retrato
  -- não foi tirado, o certo é parar aqui — nunca seguir e descobrir depois.
  if to_regclass('pg_temp.retrato_cabecalho_dos_guias') is null then
    raise exception 'TRAVA AUSENTE: o aceite esvazia o cabeçalho e não há retrato para repor. Alguém tirou o `create temp table retrato_cabecalho_dos_guias` daqui de cima — reponha antes de rodar, senão uma segunda execução apaga o texto que está no ar.';
  end if;

  -- E a janela do retrato tem de estar SELADA. Um retrato só vale se ninguém
  -- puder gravar entre a cópia e a reposição do passo 10; sem trava, o `delete`
  -- logo abaixo enxerga o COMMIT de outra sessão e a conferência do fim aprova
  -- a perda, porque ela compara com o retrato.
  --
  -- Isto é o único observável de DENTRO de uma sessão, e a afirmação é medida
  -- pelo que ela é: POSSE de trava que conflita com `row exclusive` — o modo que
  -- todo INSERT/UPDATE/DELETE precisa pegar. NÃO afirma que a sessão vizinha
  -- bloqueia; isso se prova com duas conexões, fora daqui, e está no PR.
  --
  -- (`pg_locks` não é a exceção que o cabeçalho desta seção proíbe. A regra de
  -- não consultar catálogo vale para policy e GRANT, que se parecem no catálogo
  -- e se distinguem no ato. Trava não tem ato observável de dentro da própria
  -- transação: quem a exerce é outra sessão.)
  --
  -- Até onde esta guarda alcança, medido e não suposto: na PRIMEIRA aplicação
  -- ela não tem como falhar — o `create table` acima já pega
  -- `AccessExclusiveLock` sobre a tabela que ele mesmo criou. Ela guarda a
  -- REAPLICAÇÃO, que é o caminho onde a corrida existe: lá a tabela vem
  -- commitada de antes, e quem segura é o `lock table` do retrato ou o `alter
  -- table … enable row level security`. Some com os dois e este bloco para a
  -- migração em vez de esvaziar a tabela com a porta aberta. Que o predicado
  -- separa os dois estados está medido: contra uma tabela dormente, ele acusa
  -- depois de um `select` puro e passa depois do `lock table`.
  select string_agg(distinct l.mode, ', ' order by l.mode) into trava
    from pg_locks l
   where l.pid = pg_backend_pid()
     and l.locktype = 'relation'
     and l.relation = 'public.cabecalho_dos_guias'::regclass
     and l.granted
     and l.mode in ('ShareLock', 'ShareRowExclusiveLock',
                    'ExclusiveLock', 'AccessExclusiveLock');
  if trava is null then
    raise exception 'JANELA ABERTA: nada nesta transação barra a escrita vizinha em cabecalho_dos_guias, e o retrato acima vira ficção — o painel pode gravar o cabeçalho entre a cópia e a reposição, e a conferência do fim compararia com o retrato, não com a verdade. Reponha o `lock table public.cabecalho_dos_guias in share row exclusive mode` antes do retrato.';
  end if;
  raise notice 'Janela do retrato selada: a transação segura % sobre cabecalho_dos_guias; todo modo listado conflita com o `row exclusive` que qualquer escrita vizinha precisa pegar.', trava;

  select exists (select 1 from pg_temp.retrato_cabecalho_dos_guias) into havia_cabecalho;

  -- Esvaziar faz a segunda execução ser IDÊNTICA à primeira: o aceite inteiro
  -- roda contra a tabela vazia, sem ramo que só existe na reaplicação. A
  -- reposição está no passo 10 e a conferência, no bloco depois deste.
  delete from public.cabecalho_dos_guias;

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

  -- … e o INSERT tem de PRESERVAR a data e o autor informados. É o que permite
  -- migrar um texto sem reescrever a data dele para "agora", e é o outro lado
  -- do `if tg_op = 'UPDATE'` do gatilho. Sem esta asserção, tirar aquele `if`
  -- sobrevive ao aceite inteiro: a semente nasceria com `now()` e o passo 7
  -- (carimbo maior que 2020) continuaria verdadeiro pelo motivo errado.
  select atualizado_em, atualizado_por into carimbo, autor
    from public.cabecalho_dos_guias;
  if carimbo is distinct from '2020-01-01T00:00:00-03:00'::timestamptz then
    falhas := falhas + 1;
    raise warning 'FALHOU: o INSERT reescreveu a data informada (gravou %) — o carimbo deixou de ser só de UPDATE', carimbo;
  end if;
  if autor is distinct from id_anterior then
    falhas := falhas + 1;
    raise warning 'FALHOU: o INSERT não preservou o autor informado (gravou %, esperado %)', autor, id_anterior;
  end if;

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

  -- UPDATE e DELETE do anônimo têm de morrer no PRIVILÉGIO, e a diferença
  -- importa: sem o `revoke`, o `pg_default_acl` do Supabase entrega a escrita a
  -- `anon`, a RLS filtra, e o comando volta ZERO LINHA SEM ERRO — um teste que
  -- só olha `found` passaria com a porta destrancada, exatamente como a RLS
  -- silenciosa já enganou este projeto antes. Por isso, aqui, não levantar
  -- exceção conta como falha.
  set local role anon;
  begin
    update public.cabecalho_dos_guias set titulo_seo = 'invadido';
    falhas := falhas + 1;
    raise warning 'FALHOU: anon não foi barrado por privilégio no UPDATE — o `revoke` caiu e só a RLS separa o texto publicado de um visitante';
  exception
    when insufficient_privilege then
      null;
    when others then
      falhas := falhas + 1;
      raise warning 'FALHOU: anon foi barrado por % e não por privilégio no UPDATE', sqlstate;
  end;
  reset role;

  -- DELETE entra porque está no `revoke` E na policy de escrita, e apagar a
  -- linha é apagar o texto publicado — o mesmo estrago de um UPDATE. Sem esta
  -- asserção, tirar `delete` do `revoke` atravessava o aceite inteiro sem
  -- ninguém notar: o ato nunca era tentado.
  set local role anon;
  begin
    delete from public.cabecalho_dos_guias;
    falhas := falhas + 1;
    raise warning 'FALHOU: anon não foi barrado por privilégio no DELETE — o `revoke` caiu e apagar o cabeçalho do site virou uma questão de policy';
  exception
    when insufficient_privilege then
      null;
    when others then
      falhas := falhas + 1;
      raise warning 'FALHOU: anon foi barrado por % e não por privilégio no DELETE', sqlstate;
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
    -- O ato foi exercido. Só a partir daqui o notice do fim pode dizer que
    -- não-staff não escreve — ver a nota junto dele.
    nao_staff_exercido := true;
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

  -- 8-b. E CRIA COM CAMPO LIMPO. O passo 4 provou a normalização no UPDATE;
  --      esta é a outra metade da afirmação lá de cima ("um estado ausente, e
  --      não três") — e é a metade MAIS provável, porque a tabela nasce vazia:
  --      o primeiro save do painel com um campo limpo é um INSERT com ''.
  --      Sem esta asserção, prender a normalização a `tg_op = 'UPDATE'`
  --      atravessa o aceite inteiro, e o `<title>` de `/guias` vira um espaço
  --      em branco na aba de quem buscou a loja.
  delete from public.cabecalho_dos_guias;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', id_staff::text, 'role', 'authenticated')::text, true);
  begin
    insert into public.cabecalho_dos_guias (titulo_seo, resumo) values ('', '   ');
  exception when others then
    falhas := falhas + 1;
    raise warning 'FALHOU: o primeiro save com campos limpos foi recusado: %', sqlerrm;
  end;
  reset role;

  select count(*) into ausentes
    from public.cabecalho_dos_guias
   where titulo_seo is null and resumo is null;
  if ausentes <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o INSERT não colapsou vazio e espaço em NULO (linhas ausentes: %)', ausentes;
  end if;

  -- 9. NENHUMA LINHA DE ACEITE SOBREVIVE. Não é limpeza de teste: é o estado de
  --    entrega. Vazio significa "use o texto do código", e o código é o que
  --    está no ar hoje. Uma linha de aceite esquecida aqui poria "Criado pelo
  --    painel" no `<title>` de `/guias` em produção. (Este `delete` é sem
  --    `where` de propósito: neste ponto toda linha da tabela foi escrita pelo
  --    próprio aceite — o retrato do topo tirou a do dono da frente, e é ele
  --    que a repõe no passo 10.)
  delete from public.cabecalho_dos_guias;
  select count(*) into sobraram from public.cabecalho_dos_guias;
  if sobraram <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: sobraram % linha(s) de aceite — o site serviria texto de teste', sobraram;
  end if;

  -- 10. A LINHA DO DONO VOLTA. Rodar esta migração de novo não pode mexer no
  --     texto que está no ar, e a reposição é `select *` pelo mesmo motivo que
  --     o retrato: coluna nova entra sozinha.
  --
  --     Claims vazias antes do INSERT porque o gatilho carimba o autor quando
  --     `auth.uid()` existe, e o passo 8 deixou a sessão como staff — repor com
  --     o autor errado seria estragar a linha por outro caminho, mais discreto.
  --     A data volta sozinha: o carimbo é só de UPDATE.
  --
  --     Quem CONFERE é o bloco seguinte, e não este: a reposição e a prova dela
  --     não podem cair juntas na mesma edição distraída.
  perform set_config('request.jwt.claims', '', true);
  insert into public.cabecalho_dos_guias
    select * from pg_temp.retrato_cabecalho_dos_guias;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) no cabeçalho editável dos guias', falhas;
  end if;

  -- O notice diz o que CORREU, e não o que o arquivo pretende. A asserção de
  -- RLS por papel depende de existir usuário fora do staff nesta base: quando
  -- não existe, ela é PULADA lá em cima — e afirmar "não-staff não escreve"
  -- aqui seria a mesma doença que este arquivo persegue no código, um relatório
  -- verde sobre um teste que não rodou. Em produção ela roda; num banco recém
  -- semeado, não.
  raise notice 'Cabeçalho dos guias OK: linha única imposta (CHECK e PK), anon lê e não escreve (nem UPDATE, nem DELETE — barrado no privilégio), %, staff cria e edita com carimbo de autor e data, INSERT preserva a data informada, vazio/nulo/espaço voltam ao texto do código no INSERT e no UPDATE, teto recusa 301 e aceita 158, e a tabela termina %.',
    case when nao_staff_exercido
      then 'não-staff não escreve'
      else 'a RLS por papel NÃO PÔDE SER EXERCIDA nesta execução (sem usuário fora do staff na base) — nada foi provado sobre não-staff' end,
    case when havia_cabecalho
      then 'com o cabeçalho que o dono já tinha gravado, reposto do retrato'
      else 'VAZIA, que é o estado de entrega' end;
end $$;

-- ---------------------------------------------------------------------------
-- Conferência da reaplicação — a linha do dono voltou IGUAL?
-- ---------------------------------------------------------------------------
-- Bloco separado de propósito. O aceite acima escreve e apaga a linha única de
-- chave fixa `guias` — a MESMA que o dono usa —, então "a tabela terminou como
-- foi encontrada" é afirmação sobre dado de produção, e afirmação sobre dado de
-- produção se confere de fora, com o retrato na mão.
--
-- A comparação é de LINHA INTEIRA nos dois sentidos (`except all` de ida e de
-- volta), não dos campos que alguém lembrou de listar: autor e data contam
-- tanto quanto o texto. E o desfecho é `raise exception`, não contagem de
-- falha — dado do dono não entra na aritmética do aceite. Qualquer diferença
-- derruba a transação inteira, e é a transação voltando atrás que garante que
-- nada se perdeu.
do $$
declare
  diferentes int;
  linhas int;
begin
  if to_regclass('pg_temp.retrato_cabecalho_dos_guias') is null then
    raise exception 'TRAVA AUSENTE: sem o retrato não há como afirmar que o cabeçalho gravado sobreviveu ao aceite. Nada deve ser gravado assim.';
  end if;

  select count(*) into diferentes from (
    (select * from pg_temp.retrato_cabecalho_dos_guias
      except all select * from public.cabecalho_dos_guias)
    union all
    (select * from public.cabecalho_dos_guias
      except all select * from pg_temp.retrato_cabecalho_dos_guias)
  ) d;

  if diferentes > 0 then
    raise exception 'REAPLICAÇÃO DESTRUTIVA: o cabeçalho que já estava gravado não voltou igual (% linha(s) de diferença). O aceite mexeu no texto que está no ar em /guias. A transação inteira volta atrás — nada foi perdido, e nada deve ser gravado até isto ser corrigido.', diferentes;
  end if;

  select count(*) into linhas from pg_temp.retrato_cabecalho_dos_guias;
  if linhas = 0 then
    raise notice 'Reaplicação conferida: a tabela foi encontrada vazia e termina vazia — /guias segue com o cabeçalho do código.';
  else
    raise notice 'Reaplicação conferida: o cabeçalho que já estava gravado voltou idêntico, campo por campo (% linha(s)) — nada do texto do dono foi tocado.', linhas;
  end if;
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260907120000', 'cabecalho_dos_guias')
  on conflict (version) do nothing;
