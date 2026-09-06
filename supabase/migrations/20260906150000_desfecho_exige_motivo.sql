-- ===========================================================================
-- Etapa terminal exige motivo — e a lista dos desfechos passa a ter UM lugar
-- ===========================================================================
-- 2026-09-06. Emenda de banco ao conserto que este branch fez na aplicação.
--
-- ---------------------------------------------------------------------------
-- O defeito, e o que ele custou de verdade
-- ---------------------------------------------------------------------------
-- Dois pontos do código decidiam se a etapa era terminal com
-- `tipo === "ganho" || tipo === "perdido"`. A lista nasceu certa em
-- 2026-08-28 de manhã, com dois desfechos, e ficou errada à tarde, quando
-- `descartado` entrou (20260828160000). Nada quebrou alto: a etapa de
-- descarte simplesmente deixou de perguntar o motivo, e o dado nunca foi
-- coletado — o modo de falha que este projeto persegue, ausência sem aviso.
--
-- Medido contra a produção em 2026-09-06: das 13 linhas de `leads` com
-- desfecho, **11 são `descartado` com `desfecho_motivo` NULL**. Ganho e
-- perdido sem motivo: zero. O defeito não era teórico, e a assimetria entre
-- os três tipos é a assinatura dele.
--
-- ---------------------------------------------------------------------------
-- Por que a correção não podia parar na aplicação
-- ---------------------------------------------------------------------------
-- A trava era da ROTA, não do sistema. Conferido no mesmo dia:
--
--   * `leads` não tem constraint nenhuma ligando `desfecho` a
--     `desfecho_motivo` — só o CHECK do enum e as duas FKs;
--   * a FK de `desfecho_motivo` garante que a chave EXISTE, nunca que o tipo
--     dela case com o tipo da etapa: `desfecho = 'descartado'` com motivo
--     `preco` entra sem reclamar, e o relatório soma peras com maçãs;
--   * não há gatilho de BEFORE INSERT em `leads` — só um BEFORE UPDATE e dois
--     AFTER. Uma escrita direta (chave de serviço, n8n, SQL Editor) podia
--     NASCER terminal sem motivo nenhum;
--   * e a mesma lista nominal que causou o defeito no TypeScript está viva em
--     SQL, dentro de `leads_antes_de_atualizar`:
--     `if v_tipo in ('ganho', 'perdido', 'descartado')`.
--
-- Ou seja: o quarto desfecho, no dia em que existir, repete o acidente em
-- pelo menos três lugares. Esta migração reduz para um.
--
-- ---------------------------------------------------------------------------
-- O que ela NÃO faz, de propósito
-- ---------------------------------------------------------------------------
-- **Não corrige os 11 descartes sem motivo.** Os nomes parecem teste interno
-- ("TESTE GTM" x3, "teste turnstile", "Motors Store test"...), mas *parecer*
-- não é saber, e há nome de gente na lista. Escolher um motivo por eles seria
-- inventar dado — e `CLAUDE.md` manda parar e perguntar em vez de estimar.
-- Quem decide é o dono; até lá os 11 ficam como estão: legíveis, editáveis e
-- honestamente vazios.
--
-- Nada de DROP, RENAME ou ALTER TYPE: a janela de convivência continua.
--
-- ---------------------------------------------------------------------------
-- O que a revisão de 2026-09-06 achou, e que virou a seção 0
-- ---------------------------------------------------------------------------
-- A primeira versão desta migração criava um caminho de perda TOTAL e
-- SILENCIOSA de lead, e ele não dependia de bug nenhum — dependia de um clique.
--
-- `leads.situacao` tem `default 'novo'::text` (conferido no catálogo, não no
-- .sql). Nenhuma das duas rotas públicas manda `situacao`: `/api/leads` grava
-- nome, telefone, interesse, canal e mais nada, e `/api/avaliacao` idem. Quem
-- decide onde o lead nasce é o DEFAULT DA COLUNA. E as duas rotas tratam falha
-- de gravação como não bloqueante — `console.warn` e segue, para não segurar o
-- visitante a caminho do WhatsApp.
--
-- A tela de configuração do funil deixa (deixava) o dono marcar QUALQUER etapa
-- como Ganho/Perdido/Não é oportunidade, inclusive a etapa `novo`. Com a trava
-- desta migração no ar e a etapa de entrada terminal, todo INSERT do site cai
-- em MTV01, a rota engole, e a captura inteira do site para sem que nada nem
-- ninguém avise. Antes desta migração o mesmo clique só deixava o lead num
-- estado esquisito; com ela, apaga a linha.
--
-- A resposta tem duas camadas, e nenhuma delas reabre o flanco do INSERT
-- terminal (que é o motivo de a trava existir):
--
--   * uma PRÉ-CONDIÇÃO no aceite: a migração se recusa a ser aplicada se a
--     etapa de entrada não for do tipo `aberta` (seção 0 + gate no aceite);
--   * uma TRAVA na origem do erro: `funil_etapas` passa a recusar o estado em
--     que a etapa de entrada some ou vira desfecho (seção 4), no lugar e no
--     momento em que a pessoa que pode consertar está olhando.
--
-- Nada de DROP, RENAME ou ALTER TYPE: a janela de convivência continua.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. `etapa_de_entrada()` — onde o lead do site nasce, perguntado ao banco
-- ---------------------------------------------------------------------------
-- Devolve a chave da etapa em que um lead nasce quando ninguém escolhe uma:
-- ela é o DEFAULT de `public.leads.situacao`, e é lida do catálogo em vez de
-- escrita aqui.
--
-- **Por que não `'novo'` escrito à mão.** Seria a mesma doença que esta
-- migração trata, num terceiro lugar: uma constante que já foi verdade e que
-- ninguém releria no dia em que o default mudasse. O default é a fonte; a
-- gêmea do outro lado da fronteira é `ETAPA_DE_ENTRADA` em `src/lib/funil.ts`,
-- que documenta o mesmo acoplamento e cuja divergência esta migração detecta
-- no aceite.
--
-- **STABLE, não IMMUTABLE:** lê `pg_attrdef`. O default pode mudar por DDL, e
-- prometer imutabilidade autorizaria o planejador a congelar a resposta.
--
-- **Devolve NULL quando não sabe** — sem default, ou default que não é um
-- literal simples (`'novo'::text`). NULL aqui quer dizer "não sei", e os dois
-- chamadores tratam NULL de formas deliberadamente diferentes: o aceite
-- REPROVA (não dá para prometer que a captura sobrevive sem saber onde ela
-- cai), e a trava da seção 4 se cala (não pode congelar a tela de configuração
-- por causa de um estado que só DDL cria e só DDL conserta).
--
-- Se algum dia uma chave contiver aspas, o parse falha e devolve NULL — e o
-- efeito é reprovar a migração, não deixá-la passar achando que sabe. Fecha
-- para o lado seguro.

create or replace function public.etapa_de_entrada()
  returns text
  language sql
  stable
  set search_path = public
as $entrada$
  select coalesce(
           substring(pg_get_expr(d.adbin, d.adrelid) from '^''(.*)''::'),
           substring(pg_get_expr(d.adbin, d.adrelid) from '^''(.*)''$')
         )
    from pg_attrdef d
    join pg_attribute a
      on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.leads'::regclass
     and a.attname = 'situacao';
$entrada$;

comment on function public.etapa_de_entrada() is
  'A etapa em que o lead do site nasce: a chave dentro do DEFAULT de '
  'leads.situacao, lida do catálogo (2026-09-06). Existe porque as duas rotas '
  'públicas (/api/leads e /api/avaliacao) não mandam `situacao` e engolem '
  'falha de gravação: se essa etapa virar desfecho, a captura do site para em '
  'silêncio. Gêmea de ETAPA_DE_ENTRADA em src/lib/funil.ts. NULL = não sei — '
  'quem chama decide se isso reprova ou se cala.';


-- ---------------------------------------------------------------------------
-- 1. `eh_desfecho(text)` — a lista, em um lugar só
-- ---------------------------------------------------------------------------
-- Gêmea SQL de `ehTipoDeDesfecho` em `src/lib/funil.ts`. O ponto não é ter
-- ZERO listas — é ter UMA de cada lado da fronteira, e que um quarto desfecho
-- seja uma linha aqui em vez de uma caçada a `in (...)` espalhados.
--
-- Três decisões que valem comentário:
--
-- a) **NÃO é `tipo <> 'aberta'`.** Seria o mesmo literal pelo avesso, e
--    quebraria igual no dia de um quinto tipo de etapa que não seja desfecho
--    (uma etapa "arquivada", por exemplo, viraria desfecho sozinha). A
--    pergunta "isto é um desfecho?" tem que ser respondida por afirmação.
--
-- b) **IMMUTABLE, mas NÃO STRICT.** `strict` faria `eh_desfecho(null)`
--    devolver NULL, e aí `if not eh_desfecho(x)` e `if eh_desfecho(x)`
--    passariam a discordar sobre o mesmo valor — lógica de três valores num
--    predicado de guarda é alçapão. NULL não é desfecho, e a função diz isso
--    com `false`, do jeito que quem lê o `if` espera.
--
-- c) **Sem `set search_path`**, como as irmãs puras deste banco
--    (`desfecho_pode_gravar`, `calcula_situacao`): o corpo não resolve nome de
--    objeto nenhum, então não há o que sequestrar.
--
-- Fica chamável por `authenticated` e `anon` (o padrão do Supabase). Foi
-- considerado revogar, na linha da F0-l: não vale o ruído. A função não lê
-- tabela, não é SECURITY DEFINER e responde uma lista que já viaja no bundle
-- do navegador dentro de `TIPOS_DE_DESFECHO`.

create or replace function public.eh_desfecho(p_tipo text)
  returns boolean
  language sql
  immutable
  parallel safe
as $$
  select coalesce(p_tipo, '') in ('ganho', 'perdido', 'descartado');
$$;

comment on function public.eh_desfecho(text) is
  'Este tipo de etapa/desfecho encerra o negócio? (2026-09-06) É a lista dos '
  'tipos terminais em UM lugar, gêmea de `ehTipoDeDesfecho` em '
  'src/lib/funil.ts. Existe porque a lista nominal (ganho, perdido) ficou '
  'errada quando `descartado` entrou, em 2026-08-28, e o descarte passou a '
  'ser fechado sem coletar motivo. Um quarto desfecho é UMA linha aqui. '
  'NULL responde false: predicado de guarda não pode ter três valores.';


-- ---------------------------------------------------------------------------
-- 2. `leads_antes_de_atualizar` recriada INTEIRA
-- ---------------------------------------------------------------------------
-- Inteira, e não remendada, pela razão que a própria 20260828160000 escreveu:
-- *"função meio trocada é como as duas versões divergem"*. O corpo abaixo é o
-- que está vivo em produção hoje (conferido com `pg_get_functiondef` em
-- 2026-09-06), com UMA troca:
--
--   -  if v_tipo in ('ganho', 'perdido', 'descartado') then
--   +  if public.eh_desfecho(v_tipo) then
--
-- Nenhuma mudança de comportamento. O que muda é onde a lista mora.

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

    if public.eh_desfecho(v_tipo) then
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
  ) then
    new.ultimo_contato_em := now();
    new.alertado_em := null;
  end if;

  new.atualizado_em := now();
  return new;
end $$;


-- ---------------------------------------------------------------------------
-- 3. A trava: nascer ou mudar para etapa terminal exige motivo, e do tipo certo
-- ---------------------------------------------------------------------------
-- Quatro decisões de desenho, e cada uma tem um jeito errado tentador:
--
-- **(i) Gatilho, e não CHECK constraint.** Um `check (not eh_desfecho(...) or
-- desfecho_motivo is not null)` seria mais curto e estaria errado: CHECK é
-- avaliado em QUALQUER update da linha, inclusive quando criado `NOT VALID` —
-- que só isenta as linhas velhas da varredura inicial, nunca os UPDATEs
-- futuros sobre elas. Os 11 descartes legados deixariam de ser editáveis:
-- mexer no responsável de um deles estouraria. (E CHECK não pode consultar
-- `funil_motivos` para conferir o TIPO, que é metade da regra.)
--
-- **(ii) Só na TRANSIÇÃO** — `tg_op = 'INSERT'` ou `situacao` mudou. É a mesma
-- régua que a rota já aplica (`src/app/api/leads/gerenciar/route.ts` só cobra
-- motivo quando o PATCH traz `situacao`), e é ela que preserva a decisão de
-- não cobrar retroativamente. Consequência aceita e conhecida: um UPDATE que
-- mexe SÓ em `desfecho_motivo`, sem tocar em `situacao`, não passa por aqui.
-- Fechar isso cobraria motivo dos 11 legados na primeira edição de qualquer
-- campo, que é exatamente o que não pode acontecer.
--
-- É também o que mantém o motor de alertas intacto: `montar_fila_do_funil`
-- escreve `alertado_em`, `alertas` e `responsavel`, e
-- `registrar_contato_do_lead` escreve `ultimo_contato_em` — nenhuma das duas
-- toca em `situacao`, então nenhuma delas passa pela trava.
--
-- **(iii) Confere contra o tipo da ETAPA de destino**, não contra
-- `new.desfecho`. A etapa é a fonte: `desfecho` é derivado dela pelo gatilho
-- de cima. Sem a conferência de tipo, uma escrita direta grava
-- `desfecho = 'descartado'` com motivo `preco` e o erro só aparece no gráfico,
-- meses depois.
--
-- **(iv) Ordem de disparo, e por que ela NÃO carrega a regra.** O Postgres
-- dispara os BEFORE de mesma tabela e mesmo evento em ordem alfabética de
-- NOME; `trg_leads_antes_de_atualizar` e `trg_leads_conferir_desfecho`
-- compartilham o prefixo `trg_leads_`, o desempate é `a` < `c`, e o carimbo
-- roda primeiro.
--
-- A primeira versão deste comentário dizia que o aceite "PROVA a ordem". Não
-- prova, e a revisão de 2026-09-06 estava certa: `string_agg(tgname order by
-- tgname)` PRODUZ a ordem alfabética e depois a compara consigo mesma. O que
-- aquela asserção prova é outra coisa, e continua valendo a pena: que os
-- BEFORE UPDATE de `leads` são EXATAMENTE estes dois, com estes nomes. A ordem
-- de disparo sai daí por dedução — pela regra documentada do Postgres —, não
-- por medição.
--
-- E ela não precisa ser medida, porque a recusa não depende dela. Os quatro
-- caminhos, conferidos um a um:
--
--   * mover para terminal, terminal → terminal, nascer terminal: a validação
--     lê `v_tipo` de `funil_etapas` pela `new.situacao` e o motivo de
--     `new.desfecho_motivo`. Nenhum dos dois é escrito por
--     `leads_antes_de_atualizar` — ele só mexe em `desfecho`/`desfecho_em`.
--   * reabrir: as duas funções olham a etapa de DESTINO, que é aberta; esta
--     aqui volta no `not eh_desfecho(v_tipo)` antes de olhar qualquer campo.
--
-- Sobrava UM ponto que dependia da ordem, e ele foi tirado: a cauda que
-- carimba (lá embaixo) escrevia `coalesce(new.desfecho_em, now())`. Sob a
-- ordem atual isso é código morto no UPDATE — o carimbo já rodou e
-- `new.desfecho` já é igual a `v_tipo`. Sob a ordem invertida, um
-- ganho → perdido guardaria a data do desfecho ANTIGO, porque `coalesce`
-- preservaria o valor que veio da linha velha. Agora a cauda distingue INSERT
-- de UPDATE, e o resultado é o mesmo com qualquer ordem.
--
-- Isso não ficou no papel. Em 2026-09-06, com esta migração rodando contra a
-- produção dentro de uma transação revertida e o gatilho do carimbo renomeado
-- para `trg_leads_zz_antes` (o que INVERTE a ordem de disparo), o aceite
-- inteiro passou. Com a mesma inversão e a cauda de volta ao `coalesce`, ele
-- reprovou exatamente na data: desfecho de 2025 numa transição de 2026.
-- A ordem, hoje, não carrega nada.
--
-- **(v) SECURITY DEFINER.** A função LÊ `funil_etapas` e `funil_motivos`, e as
-- duas têm RLS (`to authenticated using (is_staff(auth.uid()))`). Sem definer,
-- um invocador que não enxerga a configuração recebe `v_tipo = NULL`, cai no
-- `not eh_desfecho(null)` e a trava simplesmente NÃO EXISTE para ele — em
-- silêncio, que é a forma de falha que esta migração inteira persegue. Medido
-- em 2026-09-06: `set role authenticated` sem JWT devolve ZERO linhas de
-- `funil_etapas` e `tipo` nulo.
--
-- Hoje nenhum papel consegue estar dos dois lados (quem escreve em `leads` é a
-- chave de serviço, que ignora RLS, ou um staff, que enxerga a configuração):
-- é um flanco sendo fechado antes de abrir. A irmã no mesmo banco tomou a
-- mesma decisão pelo mesmo motivo — `leads_registrar_no_rastro` é definer
-- porque *"se a RLS engolir a linha, o UPDATE do lead passa e a história
-- some"* (20260828120000). A assimetria era gratuita.
--
-- Definer aqui é barato de auditar: a função não recebe parâmetro do usuário
-- além da própria linha, não executa SQL dinâmico, tem `search_path` fixo e
-- SÓ LÊ duas tabelas de configuração — não escreve em lugar nenhum.
--
-- **O errcode é `MTV01`** (de MoTiVo) — classe `MT`, dentro da faixa que o
-- padrão reserva para implementação (primeira letra em I..Z) e que o Postgres
-- não usa em nenhuma classe própria. Quem chama distingue esta recusa de um
-- erro genérico por `err.code === 'MTV01'`, em vez de casar com o texto da
-- mensagem. Nota para quem for tratar no front: o PostgREST não conhece
-- códigos próprios e devolve **500** para eles, não 4xx — a rota já barra
-- antes, então isto aqui é rede de segurança, não caminho normal.

create or replace function public.leads_conferir_desfecho()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_tipo        text;
  v_rotulo      text;
  v_motivo_tipo text;
begin
  -- Só na transição. `old` é referenciado apenas dentro do ramo de UPDATE:
  -- em INSERT ele é NULL, e um `and` de SQL não promete curto-circuito.
  if tg_op = 'UPDATE' then
    if new.situacao is not distinct from old.situacao then
      return new;
    end if;
  end if;

  select tipo, rotulo into v_tipo, v_rotulo
    from public.funil_etapas
   where chave = new.situacao;

  if not public.eh_desfecho(v_tipo) then
    return new;                      -- etapa aberta (ou desconhecida): passa
  end if;

  if new.desfecho_motivo is null or btrim(new.desfecho_motivo) = '' then
    raise exception
      'Para mover o lead para "%" é preciso escolher o motivo — é ele que a '
      'tela "Ganhos e perdas" agrupa.', coalesce(v_rotulo, new.situacao)
      using errcode = 'MTV01',
            hint = 'Grave `desfecho_motivo` junto com `situacao`. As opções '
                   'estão em funil_motivos com ativo e tipo = '
                   || quote_literal(v_tipo) || '.';
  end if;

  select tipo into v_motivo_tipo
    from public.funil_motivos
   where chave = new.desfecho_motivo;

  if v_motivo_tipo is null then
    -- A FK pegaria isto no fim do comando, com uma mensagem que não ajuda
    -- ninguém. Aqui o erro sai no vocabulário de quem está usando a tela.
    raise exception
      'Motivo desconhecido: "%".', new.desfecho_motivo
      using errcode = 'MTV01',
            hint = 'A chave precisa existir em funil_motivos.';
  end if;

  if v_motivo_tipo is distinct from v_tipo then
    raise exception
      'O motivo "%" é de %, e a etapa "%" é de % — escolha um motivo de %.',
      new.desfecho_motivo, v_motivo_tipo, coalesce(v_rotulo, new.situacao),
      v_tipo, v_tipo
      using errcode = 'MTV01',
            hint = 'Motivo de um tipo em etapa de outro faz o relatório somar '
                   'peras com maçãs, e o erro só aparece no gráfico.';
  end if;

  -- Nascimento terminal: carimba o desfecho.
  --
  -- Não é enfeite. `leads_antes_de_atualizar` é BEFORE **UPDATE** — não existe
  -- gatilho de INSERT que carimbe. Um lead inserido direto numa etapa terminal
  -- ficaria com `desfecho` NULO, e `montar_fila_do_funil` seleciona
  -- `where l.desfecho is null`: ele cobraria o vendedor para sempre por um
  -- negócio já encerrado. É o mesmo estrago que a 20260828160000 descreveu ao
  -- ensinar o carimbo a conhecer o terceiro tipo.
  --
  -- Sob a ordem atual esta cauda é no-op no UPDATE, porque o carimbo já rodou.
  -- O `case` existe para que ela dê o MESMO resultado se a ordem mudar: no
  -- UPDATE a transição está acontecendo AGORA, e a data é agora. `coalesce`
  -- solto (como estava) guardaria a data do desfecho anterior num
  -- ganho → perdido, e só se um dia esta função rodasse primeiro — o tipo de
  -- dependência que ninguém lembra de reler. No INSERT o `coalesce` continua,
  -- e é o que permite importar um lead histórico já fechado com a data real.
  if new.desfecho is distinct from v_tipo then
    new.desfecho    := v_tipo;
    new.desfecho_em := case
                         when tg_op = 'INSERT' then coalesce(new.desfecho_em, now())
                         else now()
                       end;
  end if;

  return new;
end $$;

comment on function public.leads_conferir_desfecho() is
  'Nascer ou mudar para etapa terminal exige motivo, e do tipo da etapa '
  '(2026-09-06). Recusa com SQLSTATE MTV01. Só na TRANSIÇÃO: um UPDATE que '
  'não mexe em `situacao` passa direto, e é isso que mantém editáveis os '
  'leads fechados antes desta trava existir. SECURITY DEFINER porque LÊ '
  'funil_etapas e funil_motivos, que têm RLS: sem isso um invocador sem '
  'visibilidade leria tipo NULL e a trava sumiria em silêncio para ele. Só lê '
  'essas duas tabelas de configuração — não escreve em lugar nenhum.';

drop trigger if exists trg_leads_conferir_desfecho on public.leads;
create trigger trg_leads_conferir_desfecho
  before insert or update on public.leads
  for each row execute function public.leads_conferir_desfecho();

comment on trigger trg_leads_conferir_desfecho on public.leads is
  'Roda depois de trg_leads_antes_de_atualizar — BEFORE dispara em ordem '
  'alfabética de nome, e "antes" < "conferir". A recusa NÃO depende disso: ela '
  'lê o tipo da etapa em funil_etapas, nunca `new.desfecho`. A ordem só '
  'poupa a cauda que carimba de ter de refazer trabalho.';


-- ---------------------------------------------------------------------------
-- 4. A etapa de entrada não pode virar desfecho — a trava no lugar do erro
-- ---------------------------------------------------------------------------
-- Esta é a parte que impede a trava da seção 3 de derrubar a captura do site,
-- sem reabrir o flanco do INSERT terminal: em vez de afrouxar a guarda do
-- lead, o estado impossível deixa de ser alcançável.
--
-- O erro que ela intercepta é UM CLIQUE: marcar a etapa `novo` como Ganho,
-- Perdido ou Não é oportunidade na tela de configuração do funil. A partir daí
-- todo INSERT do site cai em MTV01, e as duas rotas públicas engolem a recusa
-- para não segurar o visitante — captura zerada, zero erro visível.
--
-- O segundo ramo (a etapa SUMIR) não é hipótese de laboratório: a FK
-- `leads_situacao_do_funil` é ON UPDATE CASCADE, então renomear a chave da
-- etapa de entrada num SQL Editor "funciona" — os leads existentes acompanham
-- sem uma reclamação. O que não acompanha é o DEFAULT da coluna, que continua
-- apontando para a chave velha; do lead seguinte em diante a captura morre na
-- própria FK, e do mesmo jeito calado. É o preço de o default e a etapa serem
-- dois objetos que ninguém obriga a concordar — este gatilho é quem obriga.
--
-- **Por que no banco, se a rota já valida.** É o mesmo argumento que trouxe a
-- trava do lead para cá: `validarFunil` mora em `/api/funil/config`, e a tela
-- não é o único escritor de `funil_etapas`. SQL Editor, n8n e a chave de
-- serviço passam por fora dela. Uma regra que só a rota conhece é uma regra da
-- rota, não do sistema.
--
-- **Constraint trigger DEFERRABLE INITIALLY DEFERRED**, igual à irmã
-- `funil_exige_desfecho`: a tela salva o funil inteiro de uma vez, e a
-- conferência por linha reprovaria estados intermediários legítimos. Adiada
-- para o fim da transação, ela julga só o resultado.
--
-- **Cala-se quando `etapa_de_entrada()` devolve NULL.** Sem default na coluna
-- não há etapa de entrada para proteger — e, mais importante, esse estado só
-- nasce de DDL e só morre de DDL. Reprovar aqui congelaria a tela de
-- configuração cobrando do dono um conserto que a tela não sabe fazer. A
-- assimetria fica registrada e é real: este gatilho protege o lado que a
-- pessoa move (o tipo da etapa); o outro lado (o default da coluna) só se move
-- por migração, onde existe revisão humana — e o aceite abaixo confere os dois
-- na hora de aplicar.
--
-- **`errcode = 'check_violation'`**, como a irmã, porque o PUT do funil
-- devolve `error.message` cru para a tela: a frase abaixo é o que o dono lê.
--
-- SECURITY DEFINER pela razão da seção 3, (v): a guarda lê `funil_etapas`, que
-- tem RLS. Guarda que enxerga menos que o escritor não é guarda.

create or replace function public.funil_protege_entrada()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_entrada text := public.etapa_de_entrada();
  v_tipo    text;
  v_rotulo  text;
begin
  if v_entrada is null then
    return null;
  end if;

  select tipo, rotulo into v_tipo, v_rotulo
    from public.funil_etapas where chave = v_entrada;

  if v_tipo is null then
    raise exception
      'A etapa "%" precisa existir no funil — é nela que todo lead do site '
      'nasce (é o valor padrão de leads.situacao).', v_entrada
      using errcode = 'check_violation',
            hint = 'Sem ela o formulário do site continua enviando, o banco '
                   'continua aceitando, e ninguém nunca mais vê um lead novo '
                   'no quadro.';
  end if;

  if public.eh_desfecho(v_tipo) then
    raise exception
      'A etapa "%" não pode ser um desfecho: é nela que todo lead do site '
      'nasce. Como % ela passaria a exigir motivo já na entrada, e o '
      'formulário do site pararia de gravar — em silêncio.',
      coalesce(v_rotulo, v_entrada), v_tipo
      using errcode = 'check_violation',
            hint = 'Deixe a etapa de entrada como "Em andamento". Para '
                   'encerrar negócio, use uma etapa de desfecho depois dela.';
  end if;

  return null;
end $$;

comment on function public.funil_protege_entrada() is
  'A etapa em que o lead do site nasce (etapa_de_entrada()) tem de existir e '
  'ser do tipo `aberta` (2026-09-06). Existe porque a trava de '
  'leads_conferir_desfecho transformaria uma etapa de entrada terminal em '
  'perda TOTAL e silenciosa da captura: as rotas públicas não mandam '
  '`situacao` e engolem falha de gravação. Cala-se se a coluna não tiver '
  'default — esse estado só nasce e só morre por DDL.';

drop trigger if exists trg_funil_protege_entrada on public.funil_etapas;
create constraint trigger trg_funil_protege_entrada
  after insert or update or delete on public.funil_etapas
  deferrable initially deferred
  for each row execute function public.funil_protege_entrada();


-- ---------------------------------------------------------------------------
-- Autoconferência — no ensaio em seco das duas migrações do funil
-- ---------------------------------------------------------------------------
-- Tudo o que ele escreve é desfeito: o bloco inteiro vive dentro de um
-- `begin ... exception` que termina com a sentinela ACE01, e o desvio para o
-- handler descarta o savepoint implícito com todas as linhas criadas aqui.
--
-- Ele cobre REGRA, nunca nome de pessoa nem contagem de linha de produção — a
-- lição de 2026-08-28, registrada em tests/funil.test.ts. Por isso nenhuma
-- etapa é procurada pela CHAVE: a etapa de ganho desta loja se chama
-- `fechado`, e um aceite que assumisse `'ganho'` estaria testando o seed, não
-- a regra.
--
-- E o laço dos três tipos não é dirigido por `eh_desfecho` — seria circular:
-- uma função que esquecesse um tipo simplesmente não o testaria. Ele é
-- dirigido pelos tipos que existem em `funil_motivos` (lista independente,
-- sustentada pelo CHECK `funil_motivos_tipo_valido`) e cobra de `eh_desfecho`
-- que reconheça cada um deles.
do $aceite$
declare
  r              record;
  v_entrada      text;
  v_tipo_entrada text;
  v_et_aberta    text;
  v_et_ganho     text;
  v_mt_ganho     text;
  v_et_perdido   text;
  v_mt_perdido   text;
  v_etapa        text;
  v_rotulo       text;
  v_motivo       text;
  v_motivo_outro text;
  v_lead         uuid;
  v_lead2        uuid;
  v_txt          text;
  v_ts           timestamptz;
  v_ts2          timestamptz;
  v_val          numeric;
  v_passou       boolean;
  v_tipos        int := 0;
  v_n            int;
begin
  begin
    -- -------------------------------------------------------------------
    -- h) `eh_desfecho` responde o que promete
    -- -------------------------------------------------------------------
    if not (public.eh_desfecho('ganho')
        and public.eh_desfecho('perdido')
        and public.eh_desfecho('descartado')) then
      raise exception
        'ACEITE FALHOU: eh_desfecho não reconhece um dos três desfechos — é '
        'exatamente o esquecimento de 2026-08-28 renascendo em SQL.';
    end if;

    if public.eh_desfecho('aberta')
       or public.eh_desfecho('etapa_que_nao_existe')
       or public.eh_desfecho(null) is distinct from false then
      raise exception
        'ACEITE FALHOU: eh_desfecho disse sim para algo que não é desfecho, '
        'ou devolveu NULL — guarda com três valores muda de sentido conforme '
        'quem escreve o `if`.';
    end if;

    -- A função e a lista de `funil_motivos` têm que concordar HOJE.
    if exists (select 1 from public.funil_motivos m
                where not public.eh_desfecho(m.tipo)) then
      raise exception
        'ACEITE FALHOU: existe motivo de um tipo que eh_desfecho não conhece '
        '— as duas listas divergiram, que é a doença que esta migração trata.';
    end if;

    -- A lista COMPLETA ficou mesmo em UM lugar? Perguntado ao corpo das
    -- funções VIVAS, e não ao arquivo: `create or replace` numa migração
    -- posterior troca a função sem tocar no .sql que a criou, e um teste que
    -- abre o arquivo por nome fica verde guardando código morto. Hoje, antes
    -- desta migração, a assinatura `('ganho', 'perdido', 'descartado')`
    -- aparece em exatamente uma função: `leads_antes_de_atualizar`. Depois
    -- dela, em nenhuma além de `eh_desfecho`.
    --
    -- **O que esta varredura NÃO vê, e por que fica assim.** Ela exige os TRÊS
    -- literais, então não enxerga o PAR `('ganho', 'perdido')` — que é
    -- literalmente a forma do defeito de 2026-08-28. A revisão levantou isso e
    -- está certa; a escolha aqui foi corrigir a MENSAGEM em vez de alargar a
    -- varredura, e a razão é o que a medição mostrou.
    --
    -- Medido no catálogo de produção em 2026-09-06: o par aparece em duas
    -- funções, e só duas. `leads_antes_de_atualizar` — que esta migração
    -- conserta, e que a varredura acima já cobre pelos três literais. E
    -- `funil_exige_desfecho` (20260828120000), que está CERTA com o par: ela
    -- não enumera "os desfechos", enumera os desfechos OBRIGATÓRIOS, e o dono
    -- não é obrigado a manter etapa de descarte. Listas diferentes, perguntas
    -- diferentes.
    --
    -- Varrer o par exigiria, portanto, isentar `funil_exige_desfecho` pelo
    -- NOME — trocar a lista escrita à mão que esta migração remove por outra
    -- lista escrita à mão, dentro de um arquivo que fica imutável no instante
    -- em que entra no livro-razão. E como este bloco roda UMA vez, na hora de
    -- aplicar, o alargamento não traria informação nova: o único achado
    -- possível hoje já é conhecido e já foi julgado. Promessa do tamanho da
    -- medição: a varredura diz "lista completa", e a mensagem também.
    select string_agg(p.proname, ', ' order by p.proname) into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname <> 'eh_desfecho'
       and p.prosrc like '%''ganho''%'
       and p.prosrc like '%''perdido''%'
       and p.prosrc like '%''descartado''%';
    if v_txt is not null then
      raise exception
        'ACEITE FALHOU: a lista COMPLETA dos três desfechos continua escrita à '
        'mão em: %. O ponto desta migração é que exista UMA fonte — senão o '
        'quarto desfecho repete o acidente de 2026-08-28. (Esta varredura só '
        'vê a lista completa; o par ("ganho","perdido") foi medido à mão em '
        '2026-09-06 e mora só em funil_exige_desfecho, onde está correto.)',
        v_txt;
    end if;

    -- Toda etapa terminal ativa precisa ter para onde apontar. Sem motivo
    -- ativo do mesmo tipo, a trava transforma a etapa em beco sem saída.
    if exists (
      select 1 from public.funil_etapas e
       where e.ativa and public.eh_desfecho(e.tipo)
         and not exists (select 1 from public.funil_motivos m
                          where m.tipo = e.tipo and m.ativo)
    ) then
      raise exception
        'ACEITE FALHOU: há etapa terminal ativa sem nenhum motivo ativo do '
        'mesmo tipo — com a trava no ar, nenhum lead conseguiria entrar nela.';
    end if;

    -- -------------------------------------------------------------------
    -- O GATE: a etapa onde o lead do site NASCE não pode ser terminal
    -- -------------------------------------------------------------------
    -- Pré-condição de dado, conferida na hora de aplicar — mesmo espírito do
    -- gate logo acima, e a mesma consequência: com ela quebrada, esta migração
    -- não deve entrar.
    --
    -- Vem ANTES de qualquer INSERT deste aceite de propósito. Se a
    -- pré-condição estiver quebrada, o teste da captura logo abaixo também
    -- quebra — mas com a mensagem do SINTOMA ("a captura parou"), e quem está
    -- aplicando precisa ler a CAUSA.
    --
    -- É mais estrito que a trava da seção 4, que só barra desfecho: aqui
    -- qualquer coisa diferente de `aberta` reprova. A diferença é deliberada.
    -- O gatilho bloqueia a TELA do dono, então só pode barrar o que
    -- comprovadamente faz mal; este bloco bloqueia um operador aplicando uma
    -- migração, que lê a mensagem e decide.
    v_entrada := public.etapa_de_entrada();
    if v_entrada is null then
      raise exception
        'ACEITE FALHOU: não deu para ler a etapa de entrada — leads.situacao '
        'não tem DEFAULT, ou o default não é um literal simples. É o default '
        'que decide onde o lead do site nasce (nem /api/leads nem '
        '/api/avaliacao mandam `situacao`), e sem saber qual é não dá para '
        'prometer que a captura sobrevive a esta trava.';
    end if;

    select tipo, rotulo into v_tipo_entrada, v_rotulo
      from public.funil_etapas where chave = v_entrada;

    if v_tipo_entrada is null then
      raise exception
        'ACEITE FALHOU: a etapa de entrada "%" (o DEFAULT de leads.situacao) '
        'não existe em funil_etapas. A captura pública do site já está '
        'quebrada AGORA, antes desta migração: a FK leads_situacao_do_funil '
        'recusa todo INSERT que caia nesse default, e as duas rotas engolem a '
        'recusa para não segurar o visitante. Conserte a etapa (ou o default) '
        'antes de aplicar.', v_entrada;
    end if;

    if v_tipo_entrada is distinct from 'aberta' then
      raise exception
        'ACEITE FALHOU: a etapa de entrada "%" ("%") é do tipo "%", e não '
        '`aberta`. Aplicar assim PARA A CAPTURA PÚBLICA DO SITE, INTEIRA E EM '
        'SILÊNCIO: /api/leads e /api/avaliacao não mandam `situacao` (o lead '
        'nasce no default), a trava desta migração recusaria cada INSERT com '
        'MTV01 por falta de motivo, e as duas rotas tratam falha de gravação '
        'como não bloqueante — sem erro na tela, sem erro para o visitante, '
        'sem lead no quadro. Ninguém descobriria pelo sistema. Deixe a etapa '
        'de entrada como "Em andamento" e aplique de novo.',
        v_entrada, coalesce(v_rotulo, v_entrada), v_tipo_entrada;
    end if;

    -- -------------------------------------------------------------------
    -- As duas guardas enxergam tanto quanto quem escreve? (seção 3, item v)
    -- -------------------------------------------------------------------
    -- Contagem POSITIVA, e não uma busca por `not prosecdef`: um erro de
    -- digitação no nome faria a busca negativa não achar nada e passar. Aqui,
    -- nome errado significa contar menos que dois e reprovar.
    select count(*) into v_n
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and p.proname in ('leads_conferir_desfecho', 'funil_protege_entrada');
    if v_n <> 2 then
      raise exception
        'ACEITE FALHOU: só % das 2 guardas é SECURITY DEFINER. Elas LEEM '
        'funil_etapas e funil_motivos, que têm RLS: um invocador sem '
        'visibilidade lê tipo NULL, cai no `not eh_desfecho(null)` e a trava '
        'deixa de existir para ele — sem erro e sem aviso. Medido em '
        '2026-09-06: `set role authenticated` sem JWT enxerga ZERO linha de '
        'funil_etapas.', v_n;
    end if;

    -- -------------------------------------------------------------------
    -- iv) os BEFORE UPDATE de `leads` são EXATAMENTE estes dois
    -- -------------------------------------------------------------------
    -- É só isso que esta asserção prova, e a versão anterior prometia mais:
    -- `order by tgname` PRODUZ a ordem alfabética e depois compara com ela, o
    -- que nunca poderia falhar por ordem. A ordem de disparo se DEDUZ daqui,
    -- pela regra do Postgres, e de todo modo a recusa não depende dela — ver a
    -- decisão (iv) na seção 3, e a asserção (i) lá embaixo, que mede o único
    -- efeito que dependia.
    --
    -- O que ela pega, e vale pegar: um terceiro BEFORE UPDATE aparecendo (que
    -- passaria a rodar no meio, sem ninguém decidir isso) ou um dos dois
    -- sumindo.
    select string_agg(tgname, ', ' order by tgname) into v_txt
      from pg_trigger
     where tgrelid = 'public.leads'::regclass
       and not tgisinternal
       and (tgtype & 2) = 2      -- BEFORE
       and (tgtype & 16) = 16;   -- ... UPDATE
    if v_txt is distinct from
       'trg_leads_antes_de_atualizar, trg_leads_conferir_desfecho' then
      raise exception
        'ACEITE FALHOU: os BEFORE UPDATE de leads são "%" — esperados '
        'exatamente trg_leads_antes_de_atualizar e trg_leads_conferir_desfecho.',
        coalesce(v_txt, '<nenhum>');
    end if;

    select chave into v_et_aberta
      from public.funil_etapas where tipo = 'aberta' and ativa
     order by ordem, chave limit 1;
    if v_et_aberta is null then
      raise exception
        'ACEITE FALHOU: nenhuma etapa aberta ativa — sem ela não há de onde '
        'partir para testar a transição.';
    end if;

    -- -------------------------------------------------------------------
    -- f) o caminho público do lead continua vivo — e vem PRIMEIRO
    -- -------------------------------------------------------------------
    -- Primeiro de propósito. A captura de lead é o caminho mais valioso do
    -- sistema, e agora ela passa por um BEFORE INSERT que antes não existia.
    -- Se ela quebrar, é ESTA mensagem que quem aplicar a migração precisa
    -- ler — e não a de um teste de relatório que só falhou de arrasto.
    --
    -- A inserção tem a FORMA da do site: nome, telefone e mais nada, com
    -- `situacao` vindo do DEFAULT — que é o caminho que as duas rotas
    -- realmente usam. O que ela NÃO reproduz é o papel: aqui quem insere é
    -- quem está aplicando a migração (dono das tabelas, RLS não se aplica), e
    -- o site insere com a chave de serviço, que ignora a RLS por outro motivo.
    -- Para a trava desta migração a diferença é irrelevante — ela é BEFORE
    -- ROW e roda igual para os dois —, mas a asserção não autoriza dizer "a
    -- captura pública passa", e sim "um INSERT com a forma dela passa". O
    -- notice do fim fala assim.
    v_passou := true;
    v_lead2  := null;
    begin
      insert into public.leads (nome, telefone)
        values ('Aceite Captura Publica', '5541999990007')
        returning id into v_lead2;
    exception when others then
      v_passou := false;
      v_txt    := sqlstate || ' ' || sqlerrm;
    end;
    if not v_passou then
      raise exception
        'ACEITE FALHOU: a captura de lead do site parou de funcionar (%) — '
        'nenhuma trava de relatório vale derrubar o formulário.', v_txt;
    end if;

    select situacao, desfecho into v_txt, v_motivo
      from public.leads where id = v_lead2;
    if v_motivo is not null
       or public.eh_desfecho((select tipo from public.funil_etapas
                               where chave = v_txt)) then
      raise exception
        'ACEITE FALHOU: o lead do site nasceu em etapa terminal ("%") ou já '
        'com desfecho — ele tem que nascer em aberto.',
        coalesce(v_txt, '<nulo>');
    end if;

    -- -------------------------------------------------------------------
    -- a/b/c/g) um laço pelos TRÊS tipos terminais. Os três, nominalmente,
    -- porque foi exatamente o tipo esquecido que causou este branch.
    -- -------------------------------------------------------------------
    for r in select distinct m.tipo as tipo
               from public.funil_motivos m
              where m.ativo
              order by 1
    loop
      v_tipos := v_tipos + 1;

      select e.chave, e.rotulo into v_etapa, v_rotulo
        from public.funil_etapas e
       where e.tipo = r.tipo and e.ativa
       order by e.ordem, e.chave limit 1;
      if v_etapa is null then
        raise exception
          'ACEITE FALHOU: existem motivos de "%" e nenhuma etapa ativa desse '
          'tipo — o motivo não teria onde ser escolhido.', r.tipo;
      end if;

      select chave into v_motivo from public.funil_motivos
       where tipo = r.tipo and ativo order by ordem, chave limit 1;

      select chave into v_motivo_outro from public.funil_motivos
       where tipo is distinct from r.tipo and ativo order by ordem, chave limit 1;
      if v_motivo_outro is null then
        raise exception
          'ACEITE FALHOU: não há motivo de outro tipo para provar a recusa '
          'cruzada em "%".', r.tipo;
      end if;

      -- (a) mover para a etapa terminal SEM motivo é recusado
      insert into public.leads (nome, telefone, situacao)
        values ('Aceite trava', '5541999990001', v_et_aberta)
        returning id into v_lead;

      v_passou := false;
      v_txt    := null;
      begin
        update public.leads set situacao = v_etapa where id = v_lead;
        v_passou := true;
      exception when sqlstate 'MTV01' then
        v_passou := false;
        v_txt    := sqlerrm;
      end;
      if v_passou then
        raise exception
          'ACEITE FALHOU: mover para a etapa "%" (tipo %) sem motivo passou. '
          'É o defeito original: o desfecho é carimbado e a razão morre com '
          'ele.', v_rotulo, r.tipo;
      end if;

      -- E a recusa precisa DIZER o que fazer. Sem esta linha o aceite não
      -- distingue "exige motivo" de "motivo desconhecido: <NULL>" — as duas
      -- recusam com MTV01, e só uma serve para quem está na tela.
      if v_txt is null or position(v_rotulo in v_txt) = 0 then
        raise exception
          'ACEITE FALHOU: a recusa por falta de motivo não nomeia a etapa de '
          'destino ("%"). A mensagem foi: "%". Trava que não diz o que fazer '
          'vira chamado.', v_rotulo, coalesce(v_txt, '<vazia>');
      end if;

      -- (b) com motivo do tipo certo passa, e o desfecho é carimbado
      update public.leads
         set situacao = v_etapa, desfecho_motivo = v_motivo
       where id = v_lead;

      select desfecho, desfecho_em into v_txt, v_ts
        from public.leads where id = v_lead;
      if v_txt is distinct from r.tipo or v_ts is null then
        raise exception
          'ACEITE FALHOU: com motivo do tipo certo, a etapa "%" devia carimbar '
          'desfecho "%" — veio "%" (carimbo de tempo: %).',
          v_rotulo, r.tipo, coalesce(v_txt, '<nulo>'),
          coalesce(v_ts::text, '<nulo>');
      end if;

      -- (c) motivo de OUTRO tipo é recusado
      insert into public.leads (nome, telefone, situacao)
        values ('Aceite tipo cruzado', '5541999990002', v_et_aberta)
        returning id into v_lead2;

      v_passou := false;
      begin
        update public.leads
           set situacao = v_etapa, desfecho_motivo = v_motivo_outro
         where id = v_lead2;
        v_passou := true;
      exception when sqlstate 'MTV01' then
        v_passou := false;
      end;
      if v_passou then
        raise exception
          'ACEITE FALHOU: o motivo "%" entrou na etapa "%" (tipo %) sendo de '
          'outro tipo — o relatório somaria peras com maçãs.',
          v_motivo_outro, v_rotulo, r.tipo;
      end if;

      -- (g) INSERT nascendo já terminal, sem motivo, é recusado
      v_passou := false;
      begin
        insert into public.leads (nome, telefone, situacao)
          values ('Aceite nascimento terminal', '5541999990003', v_etapa);
        v_passou := true;
      exception when sqlstate 'MTV01' then
        v_passou := false;
      end;
      if v_passou then
        raise exception
          'ACEITE FALHOU: um lead NASCEU na etapa "%" sem motivo. Não havia '
          'BEFORE INSERT em leads — este era o flanco aberto para qualquer '
          'escrita direta.', v_rotulo;
      end if;

      -- (g-bis) nascendo terminal COM motivo: passa e já sai carimbado
      insert into public.leads (nome, telefone, situacao, desfecho_motivo)
        values ('Aceite nascimento com motivo', '5541999990004', v_etapa, v_motivo)
        returning id into v_lead2;
      select desfecho into v_txt from public.leads where id = v_lead2;
      if v_txt is distinct from r.tipo then
        raise exception
          'ACEITE FALHOU: lead nascido na etapa "%" ficou com desfecho "%". '
          'Com desfecho nulo ele entra em montar_fila_do_funil (que filtra '
          '`desfecho is null`) e cobra o vendedor para sempre.',
          v_rotulo, coalesce(v_txt, '<nulo>');
      end if;
    end loop;

    if v_tipos < 3 then
      raise exception
        'ACEITE FALHOU: o laço cobriu só % tipo(s) terminal(is), e são três '
        'desde 2026-08-28 — ganho, perdido e descartado.', v_tipos;
    end if;

    select e.chave into v_et_ganho from public.funil_etapas e
     where e.tipo = 'ganho' and e.ativa order by e.ordem, e.chave limit 1;
    select chave into v_mt_ganho from public.funil_motivos
     where tipo = 'ganho' and ativo order by ordem, chave limit 1;
    select e.chave into v_et_perdido from public.funil_etapas e
     where e.tipo = 'perdido' and e.ativa order by e.ordem, e.chave limit 1;
    select chave into v_mt_perdido from public.funil_motivos
     where tipo = 'perdido' and ativo order by ordem, chave limit 1;

    -- -------------------------------------------------------------------
    -- i) terminal → terminal: o motivo velho não atravessa, e a data é nova
    -- -------------------------------------------------------------------
    -- Este é o caminho que a revisão de 2026-09-06 rastreou ao derrubar a
    -- asserção circular de ordem de gatilho, e ele estava sem medição nenhuma.
    -- Duas regras moram aqui:
    --
    --   * ganho → perdido carregando o motivo de ganho é RECUSADO.
    --     `leads_antes_de_atualizar` só limpa o motivo ao REABRIR, então o
    --     motivo antigo sobrevive à transição e chegaria à etapa nova. Sem
    --     esta recusa, o relatório de perdas contaria "À vista".
    --   * a data do desfecho é RE-CARIMBADA. É o único efeito que dependia da
    --     ordem de disparo dos dois BEFORE, e é por isso que a cauda da seção
    --     3 distingue INSERT de UPDATE: agora as duas funções escrevem `now()`
    --     no UPDATE, e o resultado é o mesmo com qualquer ordem.
    insert into public.leads (nome, telefone, situacao)
      values ('Aceite terminal cruzado', '5541999990008', v_et_aberta)
      returning id into v_lead;
    update public.leads set situacao = v_et_ganho, desfecho_motivo = v_mt_ganho
     where id = v_lead;

    v_passou := false;
    begin
      update public.leads set situacao = v_et_perdido where id = v_lead;
      v_passou := true;
    exception when sqlstate 'MTV01' then
      v_passou := false;
    end;
    if v_passou then
      raise exception
        'ACEITE FALHOU: ganho → perdido passou carregando o motivo de ganho '
        '("%"). O relatório de perdas passaria a contar motivo de venda.',
        v_mt_ganho;
    end if;

    -- `now()` é o instante do BEGIN e não muda dentro da transação, então uma
    -- data velha plantada à mão é a única forma de distinguir "re-carimbou" de
    -- "não mexeu". Este UPDATE não toca em `situacao`: passa pelas duas
    -- funções sem que nenhuma delas mexa no que acabou de ser escrito.
    select desfecho_em into v_ts from public.leads where id = v_lead;
    update public.leads set desfecho_em = v_ts - interval '365 days'
     where id = v_lead;

    update public.leads
       set situacao = v_et_perdido, desfecho_motivo = v_mt_perdido
     where id = v_lead;

    select desfecho, desfecho_em into v_txt, v_ts2
      from public.leads where id = v_lead;
    if v_txt is distinct from 'perdido' then
      raise exception
        'ACEITE FALHOU: ganho → perdido deixou o desfecho em "%".',
        coalesce(v_txt, '<nulo>');
    end if;
    if v_ts2 is null or v_ts2 < v_ts then
      raise exception
        'ACEITE FALHOU: ganho → perdido guardou a data do desfecho ANTIGO '
        '(ficou %, e a transição é de %). O lead apareceria no relatório do '
        'mês errado, com o motivo certo — erro que só se vê no gráfico.',
        coalesce(v_ts2::text, '<nulo>'), v_ts::text;
    end if;

    -- -------------------------------------------------------------------
    -- j) a etapa de entrada não pode virar desfecho (seção 4)
    -- -------------------------------------------------------------------
    -- `set constraints ... immediate` porque o gatilho é DEFERRABLE INITIALLY
    -- DEFERRED: adiado, ele só falaria no COMMIT, e este ensaio termina em
    -- ROLLBACK — nunca falaria, e a asserção seria decorativa.
    --
    -- Só ESTE gatilho é adiantado, pelo nome. `set constraints all immediate`
    -- adiantaria também `trg_funil_exige_desfecho`, e aí uma falha dele
    -- apareceria aqui como se fosse desta trava.
    execute 'set constraints trg_funil_protege_entrada immediate';

    -- A mensagem é conferida, e não só o código: `check_violation` é o mesmo
    -- SQLSTATE de qualquer CHECK da tabela (o de `tipo`, por exemplo). Sem
    -- olhar o texto, a asserção poderia ficar verde por ter batido em OUTRA
    -- trava — passar pelo motivo errado é não ter testado.
    v_passou := false;
    v_txt    := null;
    begin
      update public.funil_etapas set tipo = 'descartado'
       where chave = v_entrada;
      v_passou := true;
    exception when sqlstate '23514' then    -- check_violation
      v_passou := false;
      v_txt    := sqlerrm;
    end;
    if v_passou or v_txt is null or position('não pode ser um desfecho' in v_txt) = 0 then
      raise exception
        'ACEITE FALHOU: marcar a etapa de entrada "%" como desfecho não foi '
        'recusada por esta trava (recusa: "%"). É um clique na tela do funil, '
        'e ele zeraria a captura do site em silêncio — o motivo de a trava '
        'existir.', v_entrada, coalesce(v_txt, '<passou>');
    end if;

    -- E o outro jeito de perder a etapa de entrada: renomear a chave. A FK
    -- leads_situacao_do_funil é ON UPDATE CASCADE, então os leads acompanham
    -- sem reclamar — mas o DEFAULT da coluna continua apontando para a chave
    -- velha, e o próximo lead do site morre na própria FK.
    v_passou := false;
    v_txt    := null;
    begin
      update public.funil_etapas set chave = v_entrada || '_renomeada'
       where chave = v_entrada;
      v_passou := true;
    exception when sqlstate '23514' then
      v_passou := false;
      v_txt    := sqlerrm;
    end;
    if v_passou or v_txt is null or position('precisa existir no funil' in v_txt) = 0 then
      raise exception
        'ACEITE FALHOU: renomear a chave da etapa de entrada "%" não foi '
        'recusada por esta trava (recusa: "%"). Os leads existentes seguiriam '
        'pela FK em cascata, o default da coluna ficaria apontando para o '
        'vazio, e a captura pararia na FK — calada.',
        v_entrada, coalesce(v_txt, '<passou>');
    end if;

    execute 'set constraints trg_funil_protege_entrada deferred';

    -- -------------------------------------------------------------------
    -- d) reabrir continua limpando desfecho, motivo, valor e nota
    -- -------------------------------------------------------------------
    insert into public.leads (nome, telefone, situacao)
      values ('Aceite reabertura', '5541999990005', v_et_aberta)
      returning id into v_lead;

    update public.leads
       set situacao = v_et_ganho, desfecho_motivo = v_mt_ganho,
           desfecho_valor = 12345.67, desfecho_nota = 'nota do aceite'
     where id = v_lead;

    update public.leads set situacao = v_et_aberta where id = v_lead;

    select desfecho, desfecho_em, desfecho_motivo, desfecho_valor, desfecho_nota
      into v_txt, v_ts, v_motivo, v_val, v_rotulo
      from public.leads where id = v_lead;
    if v_txt is not null or v_ts is not null or v_motivo is not null
       or v_val is not null or v_rotulo is not null then
      raise exception
        'ACEITE FALHOU: reabrir deixou rastro do desfecho (desfecho=%, em=%, '
        'motivo=%, valor=%, nota=%) — negócio que voltou a negociar não pode '
        'continuar contando como fechado.',
        coalesce(v_txt, '<nulo>'), coalesce(v_ts::text, '<nulo>'),
        coalesce(v_motivo, '<nulo>'), coalesce(v_val::text, '<nulo>'),
        coalesce(v_rotulo, '<nulo>');
    end if;

    -- -------------------------------------------------------------------
    -- e) os legados continuam editáveis — a asserção que protege os 11
    -- -------------------------------------------------------------------
    -- A forma dos 11 (desfecho preenchido, motivo NULO) só se alcança sem
    -- tocar em `situacao`, que é justamente o caminho que a trava deixa passar
    -- de propósito. Montar o legado assim é, de quebra, a prova de que a
    -- trava é de TRANSIÇÃO.
    insert into public.leads (nome, telefone, situacao)
      values ('Aceite legado', '5541999990006', v_et_aberta)
      returning id into v_lead;
    update public.leads
       set situacao = v_et_ganho, desfecho_motivo = v_mt_ganho
     where id = v_lead;
    v_passou := true;
    begin
      update public.leads set desfecho_motivo = null where id = v_lead;
    exception when sqlstate 'MTV01' then
      v_passou := false;
    end;
    if not v_passou then
      raise exception
        'ACEITE FALHOU: a trava cobrou motivo num UPDATE que não mexe em '
        '`situacao` — ela deixou de ser de TRANSIÇÃO. Assim os 11 leads '
        'fechados antes dela existir travariam na primeira edição.';
    end if;

    select desfecho, desfecho_motivo into v_txt, v_motivo
      from public.leads where id = v_lead;
    if v_txt is null or v_motivo is not null then
      raise exception
        'ACEITE FALHOU: não deu para reproduzir a forma dos leads fechados '
        'antes da trava (desfecho=%, motivo=%).',
        coalesce(v_txt, '<nulo>'), coalesce(v_motivo, '<nulo>');
    end if;

    v_passou := true;
    begin
      update public.leads set responsavel = 'aceite/consultor' where id = v_lead;
    exception when sqlstate 'MTV01' then
      v_passou := false;
    end;
    if not v_passou then
      raise exception
        'ACEITE FALHOU: a trava cobrou motivo num UPDATE que só mexia no '
        'responsável. Os leads fechados antes de ela existir ficariam '
        'congelados, e ninguém pediu isso.';
    end if;

    select responsavel into v_txt from public.leads where id = v_lead;
    if v_txt is distinct from 'aceite/consultor' then
      raise exception
        'ACEITE FALHOU: o UPDATE do responsável não gravou (ficou "%").',
        coalesce(v_txt, '<nulo>');
    end if;

    raise exception 'ensaio concluido' using errcode = 'ACE01';
  exception
    when sqlstate 'ACE01' then null;
  end;

  -- Cada oração abaixo corresponde a uma asserção que rodou acima, e nenhuma
  -- diz mais do que ela mediu. A frase anterior afirmava "a captura pública do
  -- site passa", e o que rodou foi um INSERT feito por quem aplica a migração
  -- — mesma FORMA, outro papel. Está dito como é.
  raise notice
    'Aceite verificado (tudo revertido; papel do ensaio: %). eh_desfecho é a '
    'lista única dos três desfechos e concorda com funil_motivos; a etapa de '
    'entrada é "%" (tipo %), e funil_etapas recusa torná-la desfecho ou '
    'renomeá-la; as duas guardas são SECURITY DEFINER; os BEFORE UPDATE de '
    'leads são exatamente dois; etapa terminal (ganho, perdido E descartado) '
    'recusa transição sem motivo e com motivo de outro tipo, no UPDATE e no '
    'INSERT, e a recusa nomeia a etapa; terminal -> terminal recusa o motivo '
    'velho e re-carimba a data; reabrir limpa desfecho, motivo, valor e nota; '
    'lead fechado antes da trava continua editável. E um INSERT com a FORMA '
    'do formulário do site (só nome e telefone, situacao do default) nasce em '
    'etapa aberta e sem desfecho -- feito por este papel, nao pela chave de '
    'servico que o site usa.',
    current_user, v_entrada, v_tipo_entrada;
end $aceite$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260906150000', 'desfecho_exige_motivo')
on conflict (version) do nothing;
