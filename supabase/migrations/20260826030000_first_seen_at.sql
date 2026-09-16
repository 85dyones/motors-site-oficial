-- ==========================================================
-- `first_seen_at` — há quantos dias o veículo está no pátio
-- ==========================================================
--
-- Pedido pelo §11.1 do plano de aquisição e cobrado de novo no §12.6 item 6:
-- `days_in_stock` é o campo que falta para a alocação de verba por encalhe do
-- §1.2 — carro parado há 80 dias não merece o mesmo lance que o que entrou
-- ontem. Sem esta coluna não havia o que publicar: `estoque_motors` sabia
-- quando o veículo foi visto pela ÚLTIMA vez (`last_seen_at`) e quando o
-- conteúdo mudou (`conteudo_atualizado_em`), nunca quando ele CHEGOU.
--
-- ----------------------------------------------------------
-- Por que isto NÃO exige mexer no n8n
-- ----------------------------------------------------------
-- O sincronizador ("Antigravity - Sincronizador de Estoque") faz upsert via
-- PostgREST com `Prefer: resolution=merge-duplicates`, mandando uma lista
-- EXPLÍCITA de colunas — as 22 do feed mais `last_seen_at`. O PostgREST monta
-- o `ON CONFLICT DO UPDATE SET` a partir das chaves que estão no corpo, e
-- coluna fora do corpo não é tocada.
--
-- Então, sem alterar uma linha do workflow:
--
--   veículo novo      → INSERT  → `first_seen_at` recebe o DEFAULT `now()`
--   veículo que fica  → UPDATE  → `first_seen_at` preservado
--
-- ⚠️  **Não acrescentar `first_seen_at` ao corpo do upsert.** No dia em que
-- alguém o incluir, todo sync reescreve a data de chegada com a data de hoje —
-- e o número que existe justamente para medir encalhe passa a marcar zero para
-- todo o pátio, todos os dias. O defeito não daria erro nenhum: só um
-- relatório dizendo que nada encalha.
--
-- ----------------------------------------------------------
-- Por que SEM backfill, ao contrário do `last_seen_at`
-- ----------------------------------------------------------
-- A migração de `last_seen_at` (20260804200000) usou `DEFAULT now()` no ADD
-- COLUMN, o que carimba todas as linhas existentes de uma vez. Lá isso era
-- obrigatório: sem carimbo o site ficaria vazio até o primeiro sync.
--
-- Aqui é o contrário. Carimbar os veículos que já estão no pátio com a hora da
-- migração diria que TODOS chegaram hoje — e um carro parado há três meses
-- apareceria com "0 dias em estoque" exatamente na tela onde o dono decide
-- quanto investir nele. Número inventado é pior que número ausente, e esta
-- coluna nasce para sustentar decisão de verba.
--
-- Por isso o ADD COLUMN vem SEM default (linhas existentes ficam `NULL`) e o
-- default é aplicado depois, valendo só para inserções futuras. O site omite
-- `days_in_stock` quando a data falta — ver `pushVeiculo` em `lib/dataLayer.ts`.
--
-- A consequência aceita: a métrica nasce cobrindo só o que entrar de agora em
-- diante. Com o giro de ~45 dias do §1.2, o pátio inteiro passa a ter data
-- verdadeira em cerca de dois meses.
-- ==========================================================

ALTER TABLE public.estoque_motors
    ADD COLUMN IF NOT EXISTS first_seen_at timestamptz;

-- Em dois passos de propósito: `ADD COLUMN ... DEFAULT now()` preencheria as
-- linhas existentes (PG 11+), que é justamente o que não queremos.
ALTER TABLE public.estoque_motors
    ALTER COLUMN first_seen_at SET DEFAULT now();

COMMENT ON COLUMN public.estoque_motors.first_seen_at IS
    'Instante em que o veiculo apareceu no feed pela primeira vez. Preenchido '
    'pelo DEFAULT no INSERT do upsert; preservado nos updates porque o n8n nao '
    'manda esta coluna no corpo. NAO acrescentar ao payload do sincronizador: '
    'isso zeraria a idade de todo o patio a cada sync. NULL nas linhas '
    'anteriores a 2026-08-26 — idade desconhecida, e o site omite o campo em '
    'vez de inventar. Ver days_in_stock em src/lib/dataLayer.ts.';

-- "O que está encalhado?" é a pergunta natural sobre esta coluna, e ela vira
-- ordenação no painel. Mesmo raciocínio do índice de `last_seen_at`.
CREATE INDEX IF NOT EXISTS estoque_motors_first_seen_at_idx
    ON public.estoque_motors (first_seen_at);
