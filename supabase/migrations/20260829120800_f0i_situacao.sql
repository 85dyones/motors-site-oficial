-- ============================================================================
-- F0-i — `calcula_situacao(evento_tipo[])` e a view `veiculo_situacao`
-- ============================================================================
-- Decisão 1 do handoff: situação NUNCA é coluna editável — é projeção da linha
-- do tempo. A função é pura (dado o array ordenado de eventos, devolve o
-- estado) e a autoconferência é a tabela-verdade da spec 00.
-- ============================================================================

create or replace function public.calcula_situacao(tipos public.evento_tipo[])
returns text
language plpgsql
immutable
as $$
declare
  t public.evento_tipo;
  s text := 'estoque';  -- sem evento: unidade recém-criada, tratada como estoque
begin
  foreach t in array tipos loop
    case t
      -- aquisição (re)abre a vida em estoque
      when 'ENTRADA', 'COMPRA_TERCEIRO' then s := 'estoque';
      when 'PREPARACAO_INICIO'          then s := 'preparacao';
      when 'PREPARACAO_FIM'             then s := 'estoque';
      when 'BLOQUEIO'                   then s := 'fora';
      when 'DESBLOQUEIO'                then s := 'estoque';
      when 'PRE_VENDA_LANCADA'          then s := 'reservado';
      when 'PRE_VENDA_CANCELADA'        then s := 'estoque';
      when 'VENDA', 'REPASSE_SAIDA'     then s := 'vendido';
      when 'ESTORNO_VENDA'              then s := 'estoque';
      when 'DEVOLUCAO_TERCEIRO'         then s := 'devolvido';
      when 'ESTORNO_ENTRADA'            then s := 'fora';
      else null;  -- custo, publicação, sinal, NF, Ciclo, pós-venda: não movem situação
    end case;
  end loop;
  return s;
end;
$$;
comment on function public.calcula_situacao(public.evento_tipo[]) is
  'Projeção pura da situação (spec 00): estoque | preparacao | reservado | vendido | devolvido | fora. A tabela-verdade vive na autoconferência da migração 20260829120800 — mudou a função, mude a tabela junto.';

create or replace view public.veiculo_situacao
with (security_invoker = true) as
select
  v.id           as veiculo_id,
  v.org_id,
  public.calcula_situacao(
    coalesce(
      array_agg(e.tipo order by e.criado_em, e.id) filter (where e.id is not null),
      '{}'::public.evento_tipo[]
    )
  )              as situacao,
  count(e.id)    as eventos,
  max(e.criado_em) as ultimo_evento_em
from public.veiculos v
left join public.veiculo_eventos e on e.veiculo_id = v.id
group by v.id, v.org_id;
comment on view public.veiculo_situacao is
  'A situação de cada unidade, derivada dos eventos. security_invoker: a RLS de quem pergunta vale — anon não vê nada do núcleo (D-T1.5).';

-- ----------------------------------------------------------------------------
-- Autoconferência: a tabela-verdade.
-- ----------------------------------------------------------------------------
do $$
declare
  caso record;
  obtido text;
  falhas int := 0;
begin
  for caso in
    select * from (values
      ('{}'::public.evento_tipo[],                                                          'estoque',    'sem eventos'),
      (array['ENTRADA']::public.evento_tipo[],                                              'estoque',    'entrada simples'),
      (array['ENTRADA','PREPARACAO_INICIO']::public.evento_tipo[],                          'preparacao', 'em preparação'),
      (array['ENTRADA','PREPARACAO_INICIO','PREPARACAO_FIM']::public.evento_tipo[],         'estoque',    'preparação concluída'),
      (array['ENTRADA','CUSTO_LANCADO','PUBLICACAO']::public.evento_tipo[],                 'estoque',    'custo e publicação não movem'),
      (array['ENTRADA','PRE_VENDA_LANCADA']::public.evento_tipo[],                          'reservado',  'pré-venda reserva'),
      (array['ENTRADA','PRE_VENDA_LANCADA','SINAL']::public.evento_tipo[],                  'reservado',  'sinal não fecha'),
      (array['ENTRADA','PRE_VENDA_LANCADA','PRE_VENDA_CANCELADA']::public.evento_tipo[],    'estoque',    'cancelou, voltou à vitrine'),
      (array['ENTRADA','PRE_VENDA_LANCADA','VENDA']::public.evento_tipo[],                  'vendido',    'venda fecha'),
      (array['ENTRADA','VENDA','ESTORNO_VENDA']::public.evento_tipo[],                      'estoque',    'estorno devolve ao estoque'),
      (array['ENTRADA','REPASSE_SAIDA']::public.evento_tipo[],                              'vendido',    'repasse é saída'),
      (array['ENTRADA','DEVOLUCAO_TERCEIRO']::public.evento_tipo[],                         'devolvido',  'devolvido ao dono'),
      (array['ENTRADA','BLOQUEIO']::public.evento_tipo[],                                   'fora',       'bloqueado'),
      (array['ENTRADA','BLOQUEIO','DESBLOQUEIO']::public.evento_tipo[],                     'estoque',    'desbloqueado'),
      (array['ENTRADA','ESTORNO_ENTRADA']::public.evento_tipo[],                            'fora',       'entrada estornada'),
      (array['ENTRADA','VENDA','CICLO_ABERTO','REVISAO_REGISTRADA']::public.evento_tipo[],  'vendido',    'vida do Ciclo não move situação'),
      (array['ENTRADA','DEVOLUCAO_TERCEIRO','COMPRA_TERCEIRO']::public.evento_tipo[],       'estoque',    'compra do consignado reabre como próprio')
    ) as t(tipos, esperado, rotulo)
  loop
    obtido := public.calcula_situacao(caso.tipos);
    if obtido <> caso.esperado then
      raise warning 'tabela-verdade [%]: esperava %, veio %', caso.rotulo, caso.esperado, obtido;
      falhas := falhas + 1;
    end if;
  end loop;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % caso(s) da tabela-verdade divergiram', falhas;
  end if;

  raise notice 'F0-i OK: 17 casos da tabela-verdade conferem.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260829120800', 'f0i_situacao')
  on conflict (version) do nothing;
