-- ===========================================================================
-- Onde foi parar a conta que não aparece — SOMENTE LEITURA
-- ===========================================================================
-- Cole no SQL Editor e rode. Não altera nada.
--
-- Sintoma: uma conta a pagar foi lançada, a tela não deu erro, e ela não
-- aparece nem em "Contas a pagar" nem em "Aprovações".
--
-- O código foi lido de ponta a ponta e está coerente: a listagem filtra só
-- por `tipo`, sem filtro de status nem de data, e não esconde nada no render.
-- Então ou a linha não existe, ou existe com algo que a tira das duas telas,
-- ou a RLS está devolvendo vazio em silêncio — que é o modo de falha mais
-- traiçoeiro do Postgres e já mordeu este projeto duas vezes.
-- ===========================================================================

-- 1. As 10 contas mais recentes, como o BANCO as vê (sem RLS, como dono).
--    Se a sua conta estiver aqui, ela existe — o problema é de leitura.
select 'AS 10 MAIS RECENTES' as bloco;
select
  created_at at time zone 'America/Sao_Paulo' as criada_em,
  tipo, status, descricao, valor, data_vencimento,
  case when created_by is null then '(sem autor)' else 'ok' end as autor
from public.contas
order by created_at desc
limit 10;

-- 2. Contagem por tipo e status — mostra se algo caiu num estado inesperado.
select 'CONTAGEM POR TIPO E STATUS' as bloco;
select tipo, status, count(*) as quantas
from public.contas
group by tipo, status
order by tipo, status;

-- 3. AS POLICIES DE `contas`. Esta é a hipótese mais séria.
--    `20260821210000` derruba TODAS as policies da tabela e recria quatro.
--    Se a de SELECT não voltou, a RLS nega leitura em silêncio: a lista vem
--    vazia, sem erro, sem log. Esperado: 4 linhas — select, insert, update
--    (has_finance_access) e delete (is_admin).
select 'POLICIES DE contas' as bloco;
select cmd, policyname,
       coalesce(qual, with_check) as regra
from pg_policies
where schemaname = 'public' and tablename = 'contas'
order by cmd;

-- 4. A RLS está ligada? (Se estiver DESLIGADA o problema é outro — e pior.)
select 'RLS LIGADA?' as bloco;
select relrowsecurity as rls_ligada, relforcerowsecurity as forcada
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'contas';

-- 5. O vocabulário de status que o CHECK aceita. Se `aguardando_aprovacao`
--    não estiver aqui, o INSERT teria falhado com erro — mas vale confirmar,
--    porque descarta uma hipótese inteira.
select 'STATUS ACEITOS PELO CHECK' as bloco;
select pg_get_constraintdef(oid) as check_de_status
from pg_constraint
where conrelid = 'public.contas'::regclass
  and pg_get_constraintdef(oid) ilike '%status%';
