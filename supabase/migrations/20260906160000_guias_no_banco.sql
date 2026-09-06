-- ---------------------------------------------------------------------------
-- Os guias saem do código e passam a morar no banco
-- ---------------------------------------------------------------------------
-- Decisão do dono em 2026-09-06, um dia depois de o cluster editorial subir:
-- *"preciso ser capaz de gerar novos guias e editar os criados no painel, como
-- já acontece com o texto das páginas"*.
--
-- Hoje o conteúdo é um array em `src/lib/guias.ts`. Funciona para publicar, e
-- não funciona para o que foi pedido: texto em array de código significa que
-- escrever um guia é abrir um PR. O que fica no arquivo é o CONTRATO (os tipos
-- que a rota, o schema.org e o painel compartilham); o conteúdo vem para cá.
--
-- ---------------------------------------------------------------------------
-- A diferença para `textos_de_hub`, que decide tudo o que vem abaixo
-- ---------------------------------------------------------------------------
-- O modelo desta migração é `20260831160000_texto_do_hub_editavel.sql`, e a
-- semelhança para no formato. Lá a tabela é OVERRIDE: um hub é derivado do
-- estoque, existe sem linha nenhuma, e linha ausente significa "use o texto
-- gerado". Aqui o banco é FONTE: **sem linha, a página não existe.**
--
-- Três consequências, e cada uma vira uma linha de schema:
--
--  1. **Estado.** Como a tabela é a fonte, ela guarda também o que ainda não
--     está pronto. `estado` nasce `rascunho` de propósito — guia novo não vai
--     ao ar por descuido de quem clicou em salvar. E rascunho não pode vazar:
--     a policy de leitura pública filtra por `estado = 'publicado'`, e é a
--     asserção que o aceite persegue com mais cuidado no fim do arquivo.
--  2. **Forma.** Um override malformado degrada para o texto gerado. Uma fonte
--     malformada derruba a página — `/guias/[slug]` é estática, então um
--     `corpo` fora de forma quebra o BUILD do site inteiro, não uma página. Por
--     isso `corpo`, `faq` e `saida` carregam CHECK de formato: o jsonb aqui não
--     é saco de qualquer coisa, é uma estrutura com contrato.
--  3. **Data.** `Article` exige `datePublished` e `dateModified`. As duas
--     colunas existem porque o JSON-LD as consome — e é por isso que o seed
--     abaixo preserva as datas do texto original em vez de carimbar "hoje":
--     mudar de lugar não é editar, e `dateModified` que salta sem o texto mudar
--     é sinal falso para o Google.
--
-- ---------------------------------------------------------------------------
-- `org_id` não entra, e isso é decisão, não esquecimento
-- ---------------------------------------------------------------------------
-- A régua do handoff — *"toda tabela nova do núcleo: `org_id` + RLS + policy
-- por papel"* — vale para dado de negócio, que um dia pode ser de mais de uma
-- loja. Isto é a cópia do SITE, e o site é um: `/guias/{slug}` é do domínio, não
-- de uma organização. Mesmo tratamento que `textos_de_hub` e `site_settings`
-- recebem hoje. Se um dia a plataforma servir o site de outra loja, `org_id`
-- entra aditivamente, com o default de sempre.
--
-- ---------------------------------------------------------------------------
-- Leitura pública do PUBLICADO — e o GRANT não sabe filtrar linha
-- ---------------------------------------------------------------------------
-- O site lê o Supabase com a chave **anon** (`lib/supabase.ts`), então `anon`
-- precisa de SELECT nesta tabela. Só que privilégio no Postgres é da TABELA
-- inteira: não existe `grant select (linhas publicadas)`. O recorte por linha é
-- RLS, e só. O par correto é este, e os dois lados são obrigatórios:
--
--   · `grant select ... to anon` — sem ele a policy é correta e inútil, porque
--     o privilégio é checado ANTES da RLS. Foi assim que `atendimentos`
--     respondeu `permission denied (42501)` com a policy no lugar, em 31/08
--     (`20260831150000`), e é por isso que aqui GRANT e policy vêm colados.
--   · `using (estado = 'publicado')` — é a ÚNICA coisa entre um rascunho e a
--     internet. Inverter essa cláusula publica rascunho sem que nenhum GRANT
--     mude e sem que nada erre. O aceite lê como `anon` de verdade.
--
-- E o `revoke` logo abaixo do grant não é decorativo: o `pg_default_acl` do
-- Supabase concede a `anon` privilégio AMPLO em tabela nova de `public`,
-- nominalmente (F0-l, `20260829140000`). Sem ele, a única coisa entre a chave
-- pública e um UPDATE no texto do site seria a RLS. Ela basta — e mesmo assim:
-- privilégio que ninguém precisa não fica de pé.
-- ---------------------------------------------------------------------------

create table if not exists public.guias (
  -- Fecha a URL: `/guias/{slug}`. Minúsculas, dígitos e hífen — o mesmo
  -- alfabeto que a rota resolve. Slug com espaço ou maiúscula gera link que
  -- não abre, e o erro só apareceria no build.
  slug text primary key
    constraint guias_slug_formato
      check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),

  -- O `<h1>` e o `headline` do `Article`.
  titulo text not null,
  -- O `<title>` da aba. Nulo cai para o `titulo` — o SERP às vezes pede uma
  -- frase diferente da que abre a página, e às vezes não pede nada.
  titulo_seo text,
  descricao text not null,

  -- As seções: `[{titulo, paragrafos: [texto]}]`. Default `[]` para o painel
  -- poder criar o rascunho antes de ter o texto; publicar com `[]` é recusado
  -- mais abaixo.
  corpo jsonb not null default '[]'::jsonb,
  -- `[{pergunta, resposta}]`. O mesmo array alimenta o `FAQPage` do JSON-LD e
  -- o `<dl>` da página: o Google exige que o texto marcado seja o visível, e
  -- ter uma fonte só é o que garante isso.
  faq jsonb not null default '[]'::jsonb,
  -- A saída comercial: `{rotulo, href, apoio}`. Guia sem destino é conteúdo
  -- que não devolve nada — a régua do plano é que cada peça tenha exatamente
  -- uma. Nulo é permitido no rascunho e recusado na publicação.
  saida jsonb,
  -- Os assuntos do `about` do `Article`.
  sobre text[],

  -- Rascunho não sai no site nem no sitemap. É o default: guia novo não
  -- publica sozinho.
  estado text not null default 'rascunho'
    constraint guias_estado_valido check (estado in ('rascunho', 'publicado')),

  -- Quando foi publicado pela PRIMEIRA vez — `datePublished`. O gatilho
  -- carimba na primeira publicação e nunca limpa: despublicar para corrigir
  -- não faz do texto um artigo novo.
  publicado_em timestamptz,
  -- `dateModified`. Carimbado pelo servidor em todo UPDATE.
  atualizado_em timestamptz not null default now(),
  -- Quem mexeu, para a mesma pergunta que o histórico do veículo responde.
  atualizado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),

  -- -------------------------------------------------------------------------
  -- Forma do jsonb — porque aqui ele é fonte, e fonte torta derruba o build
  -- -------------------------------------------------------------------------
  -- `case` em vez de `and` encadeado de propósito: o Postgres não promete
  -- ordem de avaliação num `and`, e `jsonb_array_length` de um objeto levanta
  -- ERRO em vez de violar o CHECK. As duas rejeitam a linha; só uma explica
  -- ao painel o que a pessoa digitou de errado.
  --
  -- A contagem positiva (`todo elemento casa o filtro`) é deliberada: um
  -- filtro negativo em `jsonpath` lax não pega a chave AUSENTE, que é
  -- justamente o defeito mais provável de um formulário.
  constraint guias_corpo_forma check (
    case
      when jsonb_typeof(corpo) <> 'array' then false
      else jsonb_array_length(jsonb_path_query_array(corpo,
             '$[*] ? (@.titulo.type() == "string" && @.paragrafos.type() == "array"
                      && !exists(@.paragrafos[*] ? (@.type() != "string")))'))
           = jsonb_array_length(corpo)
    end
  ),
  constraint guias_faq_forma check (
    case
      when jsonb_typeof(faq) <> 'array' then false
      else jsonb_array_length(jsonb_path_query_array(faq,
             '$[*] ? (@.pergunta.type() == "string" && @.resposta.type() == "string")'))
           = jsonb_array_length(faq)
    end
  ),
  constraint guias_saida_forma check (
    saida is null or (
      jsonb_typeof(saida) = 'object'
      and jsonb_typeof(saida -> 'rotulo') = 'string'
      and jsonb_typeof(saida -> 'href') = 'string'
      and jsonb_typeof(saida -> 'apoio') = 'string'
    )
  ),

  -- -------------------------------------------------------------------------
  -- O que publicar exige — quatro constraints, quatro mensagens diferentes
  -- -------------------------------------------------------------------------
  -- Separadas de propósito: o nome da constraint é o que a API tem para
  -- traduzir o erro em "faltou a saída comercial" na tela de quem escreveu.
  -- Nenhuma delas atrapalha o rascunho: todas passam quando `estado` não é
  -- `publicado`, que é o estado em que o texto está sendo construído.
  constraint guias_publicado_tem_data
    check (estado <> 'publicado' or publicado_em is not null),
  constraint guias_publicado_tem_corpo check (
    case
      when estado <> 'publicado' then true
      when jsonb_typeof(corpo) <> 'array' then false
      else jsonb_array_length(corpo) > 0
    end
  ),
  -- A régua do guia, item 3: "uma saída comercial definida: nenhum guia
  -- termina sem destino". A rota lê `guia.saida.href` sem condicional.
  constraint guias_publicado_tem_saida
    check (estado <> 'publicado' or saida is not null),
  constraint guias_publicado_tem_texto
    check (estado <> 'publicado'
           or (length(btrim(titulo)) > 0 and length(btrim(descricao)) > 0))
);

comment on table public.guias is
  'O conteúdo editorial de /guias. Aqui o banco é FONTE (sem linha a página não existe), e não override como textos_de_hub. Leitura pública só do estado publicado.';
comment on column public.guias.slug is
  'Fecha a URL /guias/{slug}. Minúsculas, dígitos e hífen.';
comment on column public.guias.titulo_seo is
  'O <title> da aba. Nulo cai para o titulo.';
comment on column public.guias.corpo is
  'Seções do texto: [{titulo, paragrafos: [texto]}]. Formato garantido por CHECK — jsonb aqui é estrutura, não saco.';
comment on column public.guias.faq is
  'Perguntas do fim da página: [{pergunta, resposta}]. As MESMAS strings vão para o FAQPage do JSON-LD.';
comment on column public.guias.saida is
  'A saída comercial: {rotulo, href, apoio}. Obrigatória para publicar — guia sem destino é conteúdo que não devolve nada.';
comment on column public.guias.sobre is
  'Assuntos do about do Article. Nulo e {} significam a mesma coisa: nenhum.';
comment on column public.guias.estado is
  'rascunho | publicado. Rascunho não sai no site nem no sitemap, e a RLS impede que ele seja lido sem sessão de staff.';
comment on column public.guias.publicado_em is
  'datePublished — a PRIMEIRA publicação. Carimbado pelo gatilho; nunca limpo ao despublicar.';
comment on column public.guias.atualizado_em is
  'dateModified. Carimbado pelo servidor em todo UPDATE; num INSERT o valor dado vence, e é assim que a migração preserva a data do texto que já estava no ar.';

alter table public.guias enable row level security;

-- Leitura: qualquer visitante, SÓ do publicado. É o texto que a página mostra.
drop policy if exists guias_leitura_publica on public.guias;
create policy guias_leitura_publica on public.guias
  for select to anon, authenticated using (estado = 'publicado');
grant select on public.guias to anon, authenticated;

-- Escrita: staff. `is_staff`, e não papel primário — cliente da Garagem
-- autentica no mesmo pool e não escreve cópia do site.
--
-- Esta policy é `for all`, e por isso ela também é a policy de LEITURA do
-- staff: policies permissivas se somam por OR, então o painel enxerga o
-- rascunho pela mesma linha que o autoriza a escrever. Sem isso, quem criasse
-- um guia não conseguiria reabrir o que acabou de salvar.
drop policy if exists guias_escrita_staff on public.guias;
create policy guias_escrita_staff on public.guias
  for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
grant insert, update, delete on public.guias to authenticated;

-- O default privilege do Supabase concede a `anon` privilégio amplo em tabela
-- nova de `public` (F0-l). `anon` lê o site; não escreve nele.
revoke insert, update, delete, truncate, references, trigger on public.guias from anon;

-- ---------------------------------------------------------------------------
-- O carimbo — quem, quando, e a data da primeira publicação
-- ---------------------------------------------------------------------------
create or replace function public.carimbar_guia()
returns trigger language plpgsql security invoker as $fn$
begin
  -- `dateModified` é do servidor, e não depende de a rota lembrar. Só em
  -- UPDATE: num INSERT o valor dado vence, que é o que permite semear um texto
  -- publicado em 05/09 sem reescrever a data para "agora".
  if tg_op = 'UPDATE' then
    new.atualizado_em := now();
  end if;

  -- A primeira publicação carimba a si mesma — e é o gatilho, não a rota, que
  -- responde pela constraint `guias_publicado_tem_data` logo acima. Gatilho
  -- BEFORE roda antes do CHECK, então publicar sem informar a data funciona.
  if new.estado = 'publicado' and new.publicado_em is null then
    new.publicado_em := now();
  end if;

  -- Autor: quem manda é a sessão. Num UPDATE, `new.atualizado_por` chega
  -- herdado da linha antiga — sem esta linha o PRIMEIRO autor ficaria
  -- congelado para sempre, que é o defeito que `textos_de_hub` carrega hoje.
  -- `auth.uid()` é nulo quando quem escreve é a chave de serviço; a coluna
  -- aceita nulo de propósito, e "sem autor" é a verdade nesse caso.
  if auth.uid() is not null then
    new.atualizado_por := auth.uid();
  end if;

  return new;
end $fn$;

drop trigger if exists trg_carimbar_guia on public.guias;
create trigger trg_carimbar_guia
  before insert or update on public.guias
  for each row execute function public.carimbar_guia();

-- ---------------------------------------------------------------------------
-- O guia que já está no ar — verbatim, e por que verbatim
-- ---------------------------------------------------------------------------
-- O texto abaixo é o de `src/lib/guias.ts` no commit c69dd8c, copiado sem
-- alterar uma palavra. Ele passou por revisão adversarial e duas correções de
-- conteúdo que qualquer reescrita desfaria sem avisar:
--
--   · a última FAQ NÃO lista motivos de reprovação — a distribuição real das
--     recusas da loja não está publicada, e citá-la seria inventar número;
--   · a metade mecânica tem TRÊS instrumentos (perícia, crivo de showroom,
--     garantia), não dois — `/sobre` e `/garantia` publicam o crivo, e duas
--     superfícies do mesmo site respondendo diferente é o defeito que
--     `coerencia-da-pericia` existe para fechar.
--
-- `on conflict do nothing` como no modelo: se alguém já tiver salvo este slug
-- pelo painel entre esta migração e a aplicação dela, o que está no banco
-- vence. Migração não sobrescreve trabalho de gente.
--
-- As datas entram como estão no código (2026-09-05T09:00:00-03:00). O gatilho
-- só carimba `atualizado_em` em UPDATE, exatamente para que este INSERT não
-- transforme uma mudança de armazenamento em `dateModified` novo.
insert into public.guias (
  slug, titulo, titulo_seo, descricao, corpo, faq, saida, sobre,
  estado, publicado_em, atualizado_em
) values (
  $guia$o-que-a-pericia-cautelar-nao-verifica$guia$,
  $guia$O que a perícia cautelar não verifica$guia$,
  $guia$O que a perícia cautelar NÃO verifica | Motors Store$guia$,
  $guia$A perícia cautelar conta o passado do carro: sinistro, leilão, numeração, documentação. O que ela não conta é o estado mecânico de hoje. Escrito por quem paga o exame em todo o estoque.$guia$,
  $json$[
      {
        "titulo": "O exame responde uma pergunta, e ela é sobre o passado",
        "paragrafos": [
          "A perícia cautelar existe para responder se o carro é o que o documento diz que ele é. Ela confere a numeração do chassi e do motor contra o que está registrado, procura sinal de remarcação e de reparo estrutural, e consulta o histórico do veículo — sinistro, passagem por leilão, restrição, débito, registro de roubo e furto.",
          "É um exame de procedência. A pergunta que ele responde é sobre o que já aconteceu com aquele carro, e é a pergunta certa: é onde mora o prejuízo que o comprador não enxerga sozinho, nem com um mecânico de confiança do lado."
        ]
      },
      {
        "titulo": "O que fica de fora",
        "paragrafos": [
          "A perícia cautelar não é avaliação mecânica. Ela não abre o motor, não mede compressão, não avalia a saúde do câmbio, não diz quanto resta da embreagem nem se a corrente de comando está no fim. Um carro pode passar na cautelar com folga e precisar de reparo caro no mês seguinte — as duas coisas não se contradizem, porque medem coisas diferentes.",
          "Ela também não conta a manutenção. Revisão atrasada, óleo vencido, filtro que ninguém trocou: nada disso aparece num laudo de procedência. E não avalia desgaste de uso — pneu, pastilha, suspensão, ar-condicionado.",
          "Quem trata o laudo aprovado como certificado de que o carro está bom está juntando duas perguntas diferentes. Se o carro tem passado limpo e se ele está mecanicamente bem são exames distintos, feitos por gente distinta."
        ]
      },
      {
        "titulo": "Por que aqui o exame vem antes do anúncio",
        "paragrafos": [
          "É comum que o laudo seja etapa de negociação: o cliente pede, alguém providencia, e o resultado aparece perto de fechar. Aqui o exame vem antes do anúncio, em todo o estoque, por um motivo simples — se o resultado importa, ele precisa poder mudar a decisão de comprar o carro. Depois que a unidade está no pátio, ninguém quer ouvir que ela não deveria ter entrado.",
          "É por isso que, de cada dez veículos avaliados, três entram. Os outros sete não são necessariamente carros ruins — vários são revendidos sem problema nenhum por outra loja. Eles só não passam no filtro que a gente escolheu aplicar antes de pôr o nome na frente.",
          "E o laudo fica na ficha do carro assim que a perícia é aprovada, junto do preço — não depende de pedir."
        ]
      },
      {
        "titulo": "O que responde pela outra metade",
        "paragrafos": [
          "Como o exame de procedência não fala do estado mecânico, essa metade se responde de outro jeito, e em dois tempos. Antes da entrega, o carro passa pelo crivo técnico de showroom: mais de 120 pontos mecânicos e eletrônicos conferidos, que é onde aparece o que a cautelar não olha. Depois da entrega, quem responde por motor e câmbio é a garantia.",
          "São três instrumentos com funções distintas, e é assim que faz sentido lê-los: a perícia cautelar conta de onde o carro vem, o crivo de showroom diz em que estado ele sai daqui, e a garantia diz quem paga a conta se algo aparecer depois. Nenhum substitui o outro, e quem trata um deles como se cobrisse os três vai descobrir o buraco no pior momento."
        ]
      }
    ]$json$::jsonb,
  $json$[
      {
        "pergunta": "Laudo cautelar aprovado significa que o carro está em bom estado?",
        "resposta": "Não. O laudo cautelar responde sobre a procedência do veículo — sinistro, leilão, numeração e documentação. Ele não avalia motor, câmbio, embreagem nem desgaste de uso. Um carro pode ter laudo aprovado e precisar de manutenção; são exames diferentes."
      },
      {
        "pergunta": "A perícia cautelar detecta problema de motor?",
        "resposta": "Não detecta. A perícia cautelar é exame de identificação, estrutura e histórico, não avaliação mecânica. Para o estado do motor e do câmbio, quem responde é a garantia do veículo e uma avaliação mecânica específica."
      },
      {
        "pergunta": "Todos os carros da Motors Store passam por perícia cautelar?",
        "resposta": "Passam, sem exceção, e antes de entrar na vitrine — não durante a negociação. O laudo fica na ficha do carro assim que a perícia é aprovada."
      },
      {
        "pergunta": "Por que sete de cada dez carros avaliados não entram no estoque?",
        "resposta": "Porque o filtro é aplicado antes da compra, e não depois. Alguns não passam na perícia cautelar, outros não passam no crivo técnico, e outros simplesmente não são bons o bastante para levar o nome da loja. O que os sete têm em comum não é serem carros ruins — vários são revendidos sem problema por outra loja. É não terem passado neste filtro."
      }
    ]$json$::jsonb,
  $json${
      "rotulo": "Ver a garantia",
      "href": "/garantia",
      "apoio": "O que responde por motor e câmbio — a metade que a perícia não examina."
    }$json$::jsonb,
  array[$guia$Perícia cautelar veicular$guia$, $guia$Laudo cautelar$guia$, $guia$Compra de carro seminovo$guia$],
  'publicado',
  $guia$2026-09-05T09:00:00-03:00$guia$::timestamptz,
  $guia$2026-09-05T09:00:00-03:00$guia$::timestamptz
)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Aceite — lê como gente, e persegue o rascunho vazado
-- ---------------------------------------------------------------------------
do $$
declare
  falhas int := 0;
  id_staff uuid;
  seed_ok boolean;
  publicados int;
  lidas int;
  rascunhos int;
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

  -- 1. O seed entrou inteiro — e as datas do texto original sobreviveram ao
  --    gatilho. Se `atualizado_em` virasse `now()`, o `dateModified` do
  --    Article passaria a mentir no dia da migração.
  select titulo = 'O que a perícia cautelar não verifica'
     and estado = 'publicado'
     and publicado_em = '2026-09-05T09:00:00-03:00'::timestamptz
     and atualizado_em = '2026-09-05T09:00:00-03:00'::timestamptz
     and titulo_seo is not null
     and length(descricao) > 80
     and jsonb_array_length(corpo) = 4
     and jsonb_array_length(faq) = 4
     and array_length(sobre, 1) = 3
     and saida ->> 'href' = '/garantia'
    into seed_ok
    from public.guias
   where slug = 'o-que-a-pericia-cautelar-nao-verifica';
  if seed_ok is distinct from true then
    falhas := falhas + 1;
    raise warning 'FALHOU: o seed do guia não entrou completo (seed_ok = %)', seed_ok;
  end if;

  -- 2. O CHECK de estado recusa o que a rota não sabe servir.
  begin
    insert into public.guias (slug, titulo, descricao, estado)
      values ('aceite-estado-invalido', 'x', 'y', 'arquivado');
    falhas := falhas + 1;
    raise warning 'FALHOU: estado inválido foi aceito';
  exception when check_violation then
    null; -- é o esperado
  end;

  -- 3. Publicar exige corpo e saída. As duas recusas são a régua do guia
  --    escrita no banco, não na cabeça de quem revisa.
  begin
    insert into public.guias (slug, titulo, descricao, corpo, saida, estado)
      values ('aceite-publicado-sem-corpo', 'x', 'y', '[]'::jsonb,
              '{"rotulo": "a", "href": "/estoque", "apoio": "b"}'::jsonb, 'publicado');
    falhas := falhas + 1;
    raise warning 'FALHOU: publicou guia sem corpo';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.guias (slug, titulo, descricao, corpo, estado)
      values ('aceite-publicado-sem-saida', 'x', 'y',
              '[{"titulo": "t", "paragrafos": ["p"]}]'::jsonb, 'publicado');
    falhas := falhas + 1;
    raise warning 'FALHOU: publicou guia sem saída comercial';
  exception when check_violation then
    null;
  end;

  -- 4. Seção sem `paragrafos` é recusada mesmo em rascunho — é a forma que a
  --    rota estática consome, e o erro dela apareceria no build.
  begin
    insert into public.guias (slug, titulo, descricao, corpo)
      values ('aceite-corpo-torto', 'x', 'y', '[{"titulo": "sem paragrafos"}]'::jsonb);
    falhas := falhas + 1;
    raise warning 'FALHOU: aceitou seção sem paragrafos';
  exception when check_violation then
    null;
  end;

  -- 5. O rascunho de teste — e a asserção que mais importa nesta migração.
  insert into public.guias (slug, titulo, descricao, corpo)
    values ('aceite-rascunho-nao-vaza', 'Rascunho que não pode vazar',
            'Texto em construção, sem revisão, não publicado.', '[]'::jsonb);

  select count(*) into publicados from public.guias where estado = 'publicado';

  set local role anon;
  select count(*) into lidas from public.guias;
  select count(*) into rascunhos from public.guias where estado <> 'publicado';
  reset role;

  if rascunhos <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon enxergou % rascunho(s) — o site publicaria texto não revisado', rascunhos;
  end if;
  if lidas <> publicados then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon leu % linha(s), esperado % (os publicados)', lidas, publicados;
  end if;

  -- 6. O staff lê o próprio rascunho. Sem isto, o painel salva e não reabre.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', id_staff::text, 'role', 'authenticated')::text, true);
  select count(*) into lidas from public.guias where slug = 'aceite-rascunho-nao-vaza';
  reset role;
  if lidas <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o staff não enxerga o rascunho que ele mesmo criaria';
  end if;

  -- 7. O staff publica, e o gatilho carimba a data e o autor sozinho — a
  --    prova de que BEFORE roda antes do CHECK de `publicado_em`.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', id_staff::text, 'role', 'authenticated')::text, true);
  begin
    update public.guias
       set estado = 'publicado',
           corpo = '[{"titulo": "t", "paragrafos": ["p"]}]'::jsonb,
           saida = '{"rotulo": "Ver o estoque", "href": "/estoque", "apoio": "a"}'::jsonb
     where slug = 'aceite-rascunho-nao-vaza';
  exception when others then
    falhas := falhas + 1;
    raise warning 'FALHOU: staff não conseguiu publicar: %', sqlerrm;
  end;
  reset role;

  if not exists (
    select 1 from public.guias
     where slug = 'aceite-rascunho-nao-vaza'
       and estado = 'publicado'
       and publicado_em is not null
       and atualizado_por = id_staff
       and atualizado_em > '2026-09-05T09:00:00-03:00'::timestamptz
  ) then
    falhas := falhas + 1;
    raise warning 'FALHOU: publicar não carimbou data, autor ou dateModified';
  end if;

  -- 8. O anônimo não escreve. Cópia do site editável pela internet seria
  --    desfiguração de página com indexação.
  set local role anon;
  begin
    insert into public.guias (slug, titulo, descricao) values ('aceite-anon-invasao', 'x', 'y');
    falhas := falhas + 1;
    raise warning 'FALHOU: anon escreveu na cópia do site';
  exception when insufficient_privilege or others then
    null;
  end;
  reset role;

  set local role anon;
  begin
    update public.guias set titulo = 'invadido'
     where slug = 'o-que-a-pericia-cautelar-nao-verifica';
    if found then
      falhas := falhas + 1;
      raise warning 'FALHOU: anon editou um guia publicado';
    end if;
  exception when insufficient_privilege then
    null;
  end;
  reset role;

  delete from public.guias where slug in (
    'aceite-estado-invalido', 'aceite-publicado-sem-corpo', 'aceite-publicado-sem-saida',
    'aceite-corpo-torto', 'aceite-rascunho-nao-vaza', 'aceite-anon-invasao'
  );

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) na tabela de guias', falhas;
  end if;

  raise notice 'Guias OK: seed com as datas de origem, rascunho invisível para anon, staff lê e publica, anon não escreve.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260906160000', 'guias_no_banco')
  on conflict (version) do nothing;
