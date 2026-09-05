-- ===========================================================================
-- Quem só quer vender perde por outros motivos
-- ===========================================================================
-- 2026-09-05, pedido do dono: *"precisamos ter opções diferentes para clientes
-- de avaliação, onde contemple casos que o cliente queira apenas vender e nós
-- não tenhamos interesse, casos onde nossa avaliação não interesse ao cliente,
-- onde ele negue consignar"*.
--
-- ---------------------------------------------------------------------------
-- O diagnóstico
-- ---------------------------------------------------------------------------
-- A caixa de desfecho filtra os motivos por `tipo` — ganho, perdido,
-- descartado — e por mais nada. Não existe em lugar nenhum a noção de QUE
-- NEGÓCIO era, e são dois negócios opostos: `/api/avaliacao` grava o lead com
-- `canal: 'Avaliação'` justamente porque, nas palavras do comentário da
-- própria rota, *"a pessoa quer VENDER este carro, não comprá-lo"*.
--
-- O resultado é que quem só queria vender o carro dele vê, como razões de o
-- negócio ter morrido: "Preço acima do que o cliente queria pagar" (não há
-- preço nosso em jogo), "Financiamento ou crédito reprovado" (não há
-- financiamento), "Não tínhamos o carro que ele queria" (ele não quer carro),
-- "Vai comprar mais para frente" (ele não vai comprar).
--
-- E os três desfechos que o dono nomeou não têm onde cair. O vendedor escolhe
-- o mais próximo, e o relatório de "por que a gente perde" passa a somar perda
-- de VENDA com perda de AQUISIÇÃO na mesma barra.
--
-- ---------------------------------------------------------------------------
-- A decisão: escopo, e não uma segunda tabela
-- ---------------------------------------------------------------------------
-- Uma coluna, e não `funil_motivos_avaliacao`: a tela de configuração, a
-- chave estrangeira de `leads.desfecho_motivo` e o relatório já sabem ler UMA
-- lista. Duplicar a tabela duplicaria os três.
--
-- `default 'ambos'` é a posição segura: coluna nova não pode fazer motivo
-- existente sumir de tela nenhuma.
-- ---------------------------------------------------------------------------

alter table public.funil_motivos
  add column if not exists escopo text not null default 'ambos';

alter table public.funil_motivos
  drop constraint if exists funil_motivos_escopo_valido;

alter table public.funil_motivos
  add constraint funil_motivos_escopo_valido
    check (escopo in ('compra', 'avaliacao', 'ambos'));

comment on column public.funil_motivos.escopo is
  'Para que negócio este motivo existe (2026-09-05): compra, avaliacao ou '
  'ambos. A caixa de desfecho escolhe a lista pelo canal do lead — quem só '
  'quer vender o carro dele não perde por "financiamento reprovado".';


-- ---------------------------------------------------------------------------
-- 1. O que passa a ser SÓ de compra
-- ---------------------------------------------------------------------------
-- Nominalmente, e só o que a semente de 2026-08-28 escreveu. Motivo que o dono
-- tenha digitado pela tela "Configurar funil" fica no default `ambos` e
-- continua aparecendo nos dois lados — reclassificar por heurística o que uma
-- pessoa escreveu à mão seria decidir por ela e fazer sumir da tela um motivo
-- que ela usa.
--
-- São OITO, e não os dez da semente original: `contato_invalido` mudou de lado
-- em `20260828160000` (virou descarte, mantendo a chave), e `sem_resposta`
-- fica em `ambos` — é o único que descreve o mesmo acontecimento nos dois
-- negócios.
update public.funil_motivos
   set escopo = 'compra'
 where chave in (
   'preco',
   'comprou_concorrente',
   'credito_reprovado',
   'sem_estoque',
   'avaliacao_do_usado',
   'condicoes_pagamento',
   'desistiu',
   'comprar_depois'
 );


-- ---------------------------------------------------------------------------
-- 2. O rótulo que o dono reescreveu
-- ---------------------------------------------------------------------------
-- "Sumiu — não respondeu mais" era gíria, e estava escrito para o funil de
-- compra. Decisão do dono em 2026-09-05: "Sem retorno do cliente".
--
-- Muda o RÓTULO, nunca a chave — mesma regra que a `20260828160000` aplicou no
-- `contato_invalido`: *"o rótulo é o que se lê na tela; a chave é identidade"*.
-- Nenhum lead já fechado perde o motivo, e o relatório continua somando a
-- mesma barra.
--
-- Ele fica em `ambos` (não é tocado pelo update de cima) e é por isso que o
-- desenho pôde cortar um oitavo motivo de avaliação que seria idêntico a ele:
-- duas opções de mesmo sentido na mesma caixa dividiriam o acontecimento em
-- duas barras — a doença que esta coluna existe para curar.
update public.funil_motivos
   set rotulo = 'Sem retorno do cliente'
 where chave = 'sem_resposta';


-- ---------------------------------------------------------------------------
-- 3. Os motivos de quem só quer vender
-- ---------------------------------------------------------------------------
-- Seis. Os três primeiros são as palavras do dono; os três seguintes saíram do
-- desenho e ele aprovou.
--
-- `nao_temos_interesse` é o que muda mais a operação: é o ÚNICO motivo do
-- sistema inteiro em que quem diz não somos nós. Ele não mede desempenho do
-- vendedor — mede a régua de compra da loja. Enquanto ele não existir, toda
-- recusa nossa some dentro de alguma perda comercial, e a pergunta "quantos
-- carros a gente está deixando passar?" não tem número.
--
-- `avaliacao_recusada` é chave NOVA, e não o `avaliacao_do_usado` que já
-- existe. As duas parecem a mesma coisa e não são: uma é a troca que matou a
-- venda de um carro nosso, a outra é o dono do carro que não vendeu para nós.
-- Fundir faria o relatório dizer "perdemos por avaliação" sem dizer qual dos
-- dois negócios se perdeu — e as duas decisões que saem daí são opostas.
--
-- `on conflict do nothing`: reexecutar não desfaz ajuste feito pela tela.
insert into public.funil_motivos (chave, rotulo, tipo, ordem, escopo) values
  ('nao_temos_interesse',   'Não temos interesse neste carro',        'perdido', 11, 'avaliacao'),
  ('avaliacao_recusada',    'Não aceitou o valor da nossa avaliação', 'perdido', 12, 'avaliacao'),
  ('recusou_consignacao',   'Não aceitou deixar em consignação',      'perdido', 13, 'avaliacao'),
  ('vendeu_para_outro',     'Vendeu para outro comprador',            'perdido', 14, 'avaliacao'),
  ('desistiu_de_vender',    'Desistiu de vender',                     'perdido', 15, 'avaliacao'),
  ('restricao_no_documento','Restrição no documento',                 'perdido', 16, 'avaliacao')
on conflict (chave) do nothing;


-- ---------------------------------------------------------------------------
-- Autoconferência: prova pelo EFEITO, não pela existência da coluna
-- ---------------------------------------------------------------------------
-- Uma lista fixa num `IN` já deu falso negativo neste repositório. O que se
-- consulta aqui é o CHECK, o default e as linhas — o que a migração FEZ.
do $aceite$
declare
  qtd     int;
  v_txt   text;
begin
  begin
    -- a) o CHECK existe e recusa o que não está na lista
    begin
      insert into public.funil_motivos (chave, rotulo, tipo, ordem, escopo)
        values ('aceite_escopo_invalido', 'x', 'perdido', 99, 'venda');
      raise exception
        'ACEITE FALHOU: o banco aceitou escopo "venda". Sem o CHECK, um valor '
        'digitado errado some da caixa sem erro nenhum.';
    exception
      when check_violation then null;
    end;

    -- b) o default é `ambos` — coluna nova não pode esconder motivo existente
    insert into public.funil_motivos (chave, rotulo, tipo, ordem)
      values ('aceite_escopo_default', 'x', 'perdido', 98);
    select escopo into v_txt from public.funil_motivos where chave = 'aceite_escopo_default';
    if v_txt is distinct from 'ambos' then
      raise exception
        'ACEITE FALHOU: motivo novo nasceu com escopo "%" em vez de "ambos" — '
        'motivo sem classificação some de um dos dois funis.', coalesce(v_txt, '<nulo>');
    end if;

    -- c) as oito de compra foram reclassificadas
    select count(*) into qtd from public.funil_motivos
     where escopo = 'compra' and tipo = 'perdido';
    if qtd <> 8 then
      raise exception
        'ACEITE FALHOU: % motivo(s) de perda em escopo compra, esperados 8. '
        'Alguém mexeu na semente de 2026-08-28 — pare e confira antes de gravar.', qtd;
    end if;

    -- d) as seis de avaliação entraram
    select count(*) into qtd from public.funil_motivos
     where escopo = 'avaliacao' and tipo = 'perdido';
    if qtd <> 6 then
      raise exception
        'ACEITE FALHOU: % motivo(s) de perda em escopo avaliacao, esperados 6.', qtd;
    end if;

    -- e) `sem_resposta` continua valendo para os dois, com o rótulo novo
    select escopo || '/' || rotulo into v_txt
      from public.funil_motivos where chave = 'sem_resposta';
    if v_txt is distinct from 'ambos/Sem retorno do cliente' then
      raise exception
        'ACEITE FALHOU: sem_resposta ficou "%" — esperado '
        '"ambos/Sem retorno do cliente".', coalesce(v_txt, '<nulo>');
    end if;

    -- f) a chave sobreviveu ao rótulo novo: nenhum lead perde o motivo
    select count(*) into qtd from public.funil_motivos where chave = 'sem_resposta';
    if qtd <> 1 then
      raise exception
        'ACEITE FALHOU: sem_resposta sumiu ou duplicou. A chave é identidade — '
        'lead já fechado com ela apontaria para o vazio.';
    end if;

    -- g) todo motivo de perda de avaliação é alcançável pela caixa: ativo
    select count(*) into qtd from public.funil_motivos
     where escopo = 'avaliacao' and not ativo;
    if qtd <> 0 then
      raise exception
        'ACEITE FALHOU: % motivo(s) de avaliação nasceram desativados.', qtd;
    end if;

    raise exception 'ensaio concluido' using errcode = 'ACE01';
  exception
    when sqlstate 'ACE01' then null;
  end;

  raise notice
    'Aceite verificado: o motivo de desfecho tem escopo, as 8 de compra saíram '
    'da caixa de quem só quer vender, as 6 de avaliação entraram, e '
    'sem_resposta ficou em ambos com o rótulo novo — sem trocar de chave.';
end $aceite$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260905120000', 'motivo_por_escopo')
on conflict (version) do nothing;
