-- ===========================================================================
-- Sem retorno do cliente vai para o fim das duas listas
-- ===========================================================================
-- 2026-09-06, decisão do dono, um dia depois de `20260905120000_motivo_por_escopo`
-- dar escopo aos motivos de perda.
--
-- ---------------------------------------------------------------------------
-- O defeito, medido contra produção
-- ---------------------------------------------------------------------------
-- `sem_resposta` ("Sem retorno do cliente") nasceu em 2026-08-28 com
-- `ordem = 8`, numa época em que só existiam nove motivos de perda. A
-- migração seguinte deu `escopo` à tabela e inseriu os seis motivos de quem
-- só quer vender com `ordem` 11 a 16 — sem tocar em `sem_resposta`, que ficou
-- em `escopo = 'ambos'` com a ordem antiga.
--
-- `motivosVisiveis` (src/lib/funil.ts) ordena TODOS os motivos do tipo por
-- `ordem` antes de filtrar por escopo — então quem entra com a ordem menor
-- aparece primeiro em qualquer lista que o inclua. Na caixa de um lead de
-- AVALIAÇÃO, isso pôs o motivo genérico na frente dos seis específicos:
--
--   1. Sem retorno do cliente                  (ordem  8)
--   2. Não temos interesse neste carro         (ordem 11)
--   3. Não aceitou o valor da nossa avaliação  (ordem 12)
--   ...
--
-- Isso importa por duas razões concretas, não por estética:
--
--   1. O próprio parágrafo da tela de configuração (FunilEditor.tsx, na seção
--      de motivos) avisa: "motivo demais faz o vendedor clicar no primeiro".
--      Pôr o genérico no topo o transforma no clique padrão — o vendedor
--      apressado marca "sem retorno" em vez de procurar o motivo certo.
--   2. `nao_temos_interesse` é o único motivo do sistema inteiro em que quem
--      diz não é A LOJA — mede a régua de compra dela, não o desempenho do
--      vendedor (comentário da própria migração que o criou). Ele nasceu
--      embaixo do genérico, e é exatamente o motivo que a loja mais precisa
--      que ninguém pule.
--
-- ---------------------------------------------------------------------------
-- A correção: mover uma linha, não reordenar a tabela
-- ---------------------------------------------------------------------------
-- Um `update` nominal, por `chave` — nunca por posição. `ordem = 20`, e não
-- `10`: precisa ficar depois do último motivo de avaliação (16) E do último
-- de compra (`comprar_depois`, 9), com folga (11 a 19) para um motivo novo
-- caber no meio um dia sem precisar renumerar nada de novo.
--
-- Nenhuma outra `chave` muda de `ordem` aqui — mover as outras seria
-- reescrever uma ordenação que ninguém pediu para mudar. A autoconferência
-- abaixo prova isso linha a linha, não só que o `update` "funcionou".
--
-- Efeito nas duas listas (o que o ensaio contra produção precisa confirmar):
--   compra (9 motivos): sem_resposta sai de 8º para 9º lugar — troca de
--     posição só com `comprar_depois`. Mudança mínima, e deliberada.
--   avaliação (7 motivos): sem_resposta sai de 1º para 7º lugar. É o motivo
--     desta migração existir.
-- ===========================================================================

update public.funil_motivos
   set ordem = 20
 where chave = 'sem_resposta';


-- ---------------------------------------------------------------------------
-- Autoconferência: prova pelo EFEITO — a posição relativa, não o número 20
-- ---------------------------------------------------------------------------
-- Sem savepoint/ACE01 aqui, ao contrário das duas migrações irmãs: aquele
-- truque existe para desfazer INSERT de teste antes do commit, e nenhum dos
-- quatro testes abaixo grava linha nenhuma — são leituras.
do $aceite$
declare
  v_chave       text;
  v_rotulo      text;
  v_escopo      text;
  v_ordem_sr    int;
  v_max_aval    int;
  v_max_compra  int;
  qtd           int;
begin
  -- a) a chave sobreviveu intacta, com o rótulo e o escopo de sempre — a
  --    migração não pode ter tocado em nada além da ordem.
  select chave, rotulo, escopo
    into v_chave, v_rotulo, v_escopo
    from public.funil_motivos
   where chave = 'sem_resposta';

  if v_chave is distinct from 'sem_resposta'
     or v_rotulo is distinct from 'Sem retorno do cliente'
     or v_escopo is distinct from 'ambos' then
    raise exception
      'ACEITE FALHOU: sem_resposta ficou chave="%", rótulo="%", escopo="%" — '
      'esta migração deveria mexer só na ordem. Se a chave sumiu, todo lead '
      'já fechado com ela aponta para o vazio; se o rótulo ou o escopo '
      'mudaram, algo além do pedido do dono tocou nesta linha.',
      coalesce(v_chave, '<sumiu>'), coalesce(v_rotulo, '<nulo>'),
      coalesce(v_escopo, '<nulo>');
  end if;

  select count(*) into qtd from public.funil_motivos where chave = 'sem_resposta';
  if qtd <> 1 then
    raise exception
      'ACEITE FALHOU: sem_resposta aparece % vez(es), esperado exatamente 1 '
      '— sumiu ou duplicou. A chave é identidade: lead já fechado apontando '
      'para ela ficaria órfão ou ambíguo.', qtd;
  end if;

  select ordem into v_ordem_sr
    from public.funil_motivos where chave = 'sem_resposta';

  -- b) ele ficou depois de TODOS os motivos de avaliação — o ponto desta
  --    migração. Se isto falhar, o genérico continua no topo da caixa de
  --    quem só quer vender o carro dele.
  select max(ordem) into v_max_aval
    from public.funil_motivos
   where tipo = 'perdido' and escopo = 'avaliacao';

  if v_max_aval is null then
    raise exception
      'ACEITE FALHOU: não há motivo nenhum com tipo=perdido e '
      'escopo=avaliacao — a migração 20260905120000 não rodou antes desta, '
      'ou os seis motivos de avaliação sumiram.';
  end if;

  if v_ordem_sr is null or v_ordem_sr <= v_max_aval then
    raise exception
      'ACEITE FALHOU: sem_resposta ficou com ordem % e o motivo de avaliação '
      'mais alto tem ordem % — "Sem retorno do cliente" continua na frente '
      'de "Não temos interesse neste carro" na caixa de quem só quer vender.',
      coalesce(v_ordem_sr::text, '<nulo>'), v_max_aval;
  end if;

  -- c) o mesmo teste do lado de compra — aqui a troca deveria ser mínima,
  --    só com `comprar_depois`.
  select max(ordem) into v_max_compra
    from public.funil_motivos
   where tipo = 'perdido' and escopo = 'compra';

  if v_max_compra is null then
    raise exception
      'ACEITE FALHOU: não há motivo nenhum com tipo=perdido e escopo=compra '
      '— a migração 20260905120000 não rodou antes desta, ou as oito de '
      'compra sumiram.';
  end if;

  if v_ordem_sr <= v_max_compra then
    raise exception
      'ACEITE FALHOU: sem_resposta ficou com ordem % e o motivo de compra '
      'mais alto (esperado comprar_depois) tem ordem % — o genérico não '
      'ficou por último na caixa de quem quer comprar.',
      v_ordem_sr, v_max_compra;
  end if;

  -- d) nenhuma outra chave mudou de lugar. Os valores abaixo são os que as
  --    migrações 20260828120000 e 20260905120000 escreveram — confira nelas
  --    antes de mudar esta lista, não confie só neste comentário.
  select count(*) into qtd
    from (values
      ('preco',                  1),
      ('comprou_concorrente',    2),
      ('credito_reprovado',      3),
      ('sem_estoque',            4),
      ('avaliacao_do_usado',     5),
      ('condicoes_pagamento',    6),
      ('desistiu',               7),
      ('comprar_depois',         9),
      ('nao_temos_interesse',   11),
      ('avaliacao_recusada',    12),
      ('recusou_consignacao',   13),
      ('vendeu_para_outro',     14),
      ('desistiu_de_vender',    15),
      ('restricao_no_documento',16)
    ) as esperado(chave, ordem_esperada)
    left join public.funil_motivos m on m.chave = esperado.chave
   where m.chave is null or m.ordem <> esperado.ordem_esperada;

  if qtd <> 0 then
    raise exception
      'ACEITE FALHOU: % motivo(s) diferente(s) de sem_resposta com a ordem '
      'fora do esperado (chave sumida ou ordem alterada) — esta migração só '
      'deveria tocar UMA linha, e mexer nas outras reescreveria uma '
      'ordenação que ninguém pediu para mudar.', qtd;
  end if;

  raise notice
    'Aceite verificado: sem_resposta manteve chave, rótulo e escopo, e foi '
    'para ordem % — depois do último motivo de avaliação (ordem %) e do '
    'último de compra (ordem %). Nenhuma outra chave mudou de lugar.',
    v_ordem_sr, v_max_aval, v_max_compra;
end $aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20260906120000', 'sem_retorno_por_ultimo')
on conflict (version) do nothing;
