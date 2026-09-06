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
-- ===========================================================================


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
-- **(iv) Ordem de disparo.** O Postgres dispara os BEFORE de mesma tabela e
-- mesmo evento em ordem alfabética de NOME. `trg_leads_antes_de_atualizar` e
-- `trg_leads_conferir_desfecho` compartilham o prefixo `trg_leads_`; o
-- desempate é `a` < `c`, então o carimbo roda PRIMEIRO e esta conferência roda
-- POR ÚLTIMO. É o que se quer: a guarda vê a linha exatamente como ela vai ser
-- gravada, depois de todo mundo ter escrito — se rodasse antes, validaria um
-- rascunho (o carimbo ainda não teria ajustado `desfecho`). O aceite lá
-- embaixo PROVA a ordem em vez de confiar nela.
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
  -- No UPDATE esta linha é no-op, porque o carimbo já rodou (ver a ordem).
  if new.desfecho is distinct from v_tipo then
    new.desfecho    := v_tipo;
    new.desfecho_em := coalesce(new.desfecho_em, now());
  end if;

  return new;
end $$;

comment on function public.leads_conferir_desfecho() is
  'Nascer ou mudar para etapa terminal exige motivo, e do tipo da etapa '
  '(2026-09-06). Recusa com SQLSTATE MTV01. Só na TRANSIÇÃO: um UPDATE que '
  'não mexe em `situacao` passa direto, e é isso que mantém editáveis os '
  'leads fechados antes desta trava existir.';

drop trigger if exists trg_leads_conferir_desfecho on public.leads;
create trigger trg_leads_conferir_desfecho
  before insert or update on public.leads
  for each row execute function public.leads_conferir_desfecho();

comment on trigger trg_leads_conferir_desfecho on public.leads is
  'Roda DEPOIS de trg_leads_antes_de_atualizar (BEFORE dispara em ordem '
  'alfabética de nome: "antes" < "conferir"), para conferir a linha final e '
  'não um rascunho.';


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
  v_et_aberta    text;
  v_et_ganho     text;
  v_mt_ganho     text;
  v_etapa        text;
  v_rotulo       text;
  v_motivo       text;
  v_motivo_outro text;
  v_lead         uuid;
  v_lead2        uuid;
  v_txt          text;
  v_ts           timestamptz;
  v_val          numeric;
  v_passou       boolean;
  v_tipos        int := 0;
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

    -- A lista ficou mesmo em UM lugar? Perguntado ao corpo das funções VIVAS,
    -- e não ao arquivo: `create or replace` numa migração posterior troca a
    -- função sem tocar no .sql que a criou, e um teste que abre o arquivo por
    -- nome fica verde guardando código morto. Hoje, antes desta migração, a
    -- assinatura `('ganho', ..., 'perdido', ..., 'descartado')` aparece em
    -- exatamente uma função: `leads_antes_de_atualizar`. Depois dela, em
    -- nenhuma além de `eh_desfecho`.
    select string_agg(p.proname, ', ' order by p.proname) into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname <> 'eh_desfecho'
       and p.prosrc like '%''ganho''%'
       and p.prosrc like '%''perdido''%'
       and p.prosrc like '%''descartado''%';
    if v_txt is not null then
      raise exception
        'ACEITE FALHOU: a lista dos desfechos continua escrita à mão em: %. '
        'O ponto desta migração é que exista UMA fonte — senão o quarto '
        'desfecho repete o acidente de 2026-08-28.', v_txt;
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
    -- iv) a ordem de disparo, provada e não presumida
    -- -------------------------------------------------------------------
    select string_agg(tgname, ' -> ' order by tgname) into v_txt
      from pg_trigger
     where tgrelid = 'public.leads'::regclass
       and not tgisinternal
       and (tgtype & 2) = 2      -- BEFORE
       and (tgtype & 16) = 16;   -- ... UPDATE
    if v_txt is distinct from
       'trg_leads_antes_de_atualizar -> trg_leads_conferir_desfecho' then
      raise exception
        'ACEITE FALHOU: a ordem dos BEFORE UPDATE de leads é "%" — a '
        'conferência precisa ser a ÚLTIMA, senão valida um rascunho.',
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
    -- A inserção é a do site: nome, telefone e mais nada. `situacao` vem do
    -- DEFAULT, que é o caminho que a rota pública realmente usa.
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

    -- -------------------------------------------------------------------
    -- d) reabrir continua limpando desfecho, motivo, valor e nota
    -- -------------------------------------------------------------------
    select e.chave into v_et_ganho from public.funil_etapas e
     where e.tipo = 'ganho' and e.ativa order by e.ordem, e.chave limit 1;
    select chave into v_mt_ganho from public.funil_motivos
     where tipo = 'ganho' and ativo order by ordem, chave limit 1;

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

  raise notice
    'Aceite verificado: eh_desfecho é a lista única; etapa terminal (ganho, '
    'perdido E descartado) recusa transição sem motivo e com motivo de outro '
    'tipo, no UPDATE e no INSERT; reabrir limpa o desfecho; lead fechado antes '
    'da trava continua editável; e a captura pública do site passa.';
end $aceite$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260906150000', 'desfecho_exige_motivo')
on conflict (version) do nothing;
