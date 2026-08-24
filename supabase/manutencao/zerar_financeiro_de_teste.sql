-- ===========================================================================
-- Zerar a base do financeiro — DADO DE TESTE, a pedido do dono (2026-08-24)
-- ===========================================================================
-- ⚠️ DESTRUTIVO. A parte 2 está comentada de propósito: rode a parte 1
-- primeiro e confira que o que vai sumir é mesmo só teste.
--
-- Contexto: o módulo financeiro entrou em produção em 22/08 e tudo que foi
-- lançado até aqui foi ensaio. A base vai a zero para a operação real começar
-- limpa — e para a unificação das telas (insumos e recorrentes virando conta)
-- não ter que migrar dado que ninguém quer.
--
-- ---------------------------------------------------------------------------
-- O que NÃO é apagado, e por quê
-- ---------------------------------------------------------------------------
--   * `categorias_financeiras` — é vocabulário do DRE, não lançamento. Apagar
--     obrigaria a recadastrar tudo e quebraria o significado dos relatórios.
--   * `parceiros` — fornecedores e clientes são cadastro, não movimento.
--   * `investidores` — a FICHA do sócio fica; o que zera é o razão dele.
--     Recadastrar sócio é trabalho manual sem ganho nenhum.
--   * `profiles`, papéis, e qualquer coisa de auth.
--
-- Se você quiser zerar também as fichas de investidor, a linha está lá
-- embaixo, separada e comentada — é uma decisão diferente desta.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- PARTE 1 — O que existe hoje (somente leitura). Rode e confira.
-- ---------------------------------------------------------------------------
select 'contas'                    as tabela, count(*) as linhas from public.contas
union all select 'movimentacoes',          count(*) from public.movimentacoes
union all select 'compras_produtos',       count(*) from public.compras_produtos
union all select 'despesas_recorrentes',   count(*) from public.despesas_recorrentes
union all select 'extrato_bancario',       count(*) from public.extrato_bancario
union all select 'movimentacoes_investidor', count(*) from public.movimentacoes_investidor
union all select 'investidores (FICA)',    count(*) from public.investidores
union all select 'categorias (FICA)',      count(*) from public.categorias_financeiras
order by tabela;

-- ---------------------------------------------------------------------------
-- PARTE 2 — A limpeza (DESCOMENTE só depois de conferir a parte 1)
-- ---------------------------------------------------------------------------
-- A ordem existe por causa das FKs: quem aponta sai antes de quem é apontado.
-- `movimentacoes.conta_id` é ON DELETE CASCADE, mas apagar explicitamente é
-- mais honesto que depender do cascade — o próximo a ler sabe o que some.
--
-- ⚠️ Rode como DONO do schema (SQL Editor do Supabase já roda assim). A RLS
-- deste projeto só deixa o admin apagar, e via editor a RLS nem entra.
--
-- begin;
--
--   -- Satélites primeiro.
--   delete from public.extrato_bancario;          -- prova bancária importada
--   delete from public.compras_produtos;          -- compras de insumo
--   delete from public.movimentacoes_investidor;  -- razão dos sócios
--   delete from public.movimentacoes;             -- o caixa
--
--   -- Depois o razão principal e as regras que o alimentam.
--   delete from public.contas;
--   delete from public.despesas_recorrentes;
--
--   -- OPCIONAL, e é outra decisão: apagar também as FICHAS dos investidores.
--   -- Deixe comentado se o Fabiano e o pai do Igor já estão cadastrados
--   -- certos — o razão deles já foi zerado acima.
--   -- delete from public.investidores;
--
--   -- Confira ANTES de confirmar: todas as contagens abaixo devem ser 0.
--   select 'contas' as tabela, count(*) from public.contas
--   union all select 'movimentacoes', count(*) from public.movimentacoes
--   union all select 'compras_produtos', count(*) from public.compras_produtos
--   union all select 'despesas_recorrentes', count(*) from public.despesas_recorrentes
--   union all select 'extrato_bancario', count(*) from public.extrato_bancario
--   union all select 'movimentacoes_investidor', count(*) from public.movimentacoes_investidor;
--
-- commit;   -- ou `rollback;` se algo não bateu
--
-- ---------------------------------------------------------------------------
-- Depois de zerar
-- ---------------------------------------------------------------------------
-- Rode `conferir-estado-do-financeiro.sql` — as 22 linhas continuam verdes.
-- Ele confere ESTRUTURA (tabelas, policies, funções), não conteúdo, então
-- base vazia não muda nada ali. Se alguma linha ficar vermelha depois desta
-- limpeza, é sinal de que algo além de dado foi embora.
