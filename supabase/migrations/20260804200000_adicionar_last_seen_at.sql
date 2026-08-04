-- ==========================================================
-- `last_seen_at` — reconciliação do estoque com o feed
-- ==========================================================
--
-- O problema que esta coluna resolve, medido em 2026-08-04:
--
--   feed do RevendaMais ..... 45 veículos
--   `estoque_motors` ........ 88 linhas
--   diferença ............... 43 anúncios que a loja não lista mais
--
-- O sync é upsert puro: insere e atualiza, nunca reconcilia. Cada carro que sai
-- do feed (vendido, despublicado) fica no banco para sempre. Como `vendido` é
-- `false` em 100% das linhas e `getEstoque()` não filtrava nada, o site vinha
-- anunciando 88 carros — quase metade inexistente. Ninguém percebeu porque um
-- site cheio parece saudável.
--
-- A coluna é carimbada pelo workflow n8n a cada upsert. Quem não veio no ciclo
-- mais recente não é exibido.
--
-- Decisão do dono em 2026-08-04, entre marcar `vendido` em massa pelo n8n e
-- esta. Esta não destrói dado: o veículo continua no banco, visível no painel
-- admin, e volta a aparecer sozinho se reentrar no feed.
--
-- ----------------------------------------------------------
-- Por que `DEFAULT now()` e não `NULL`
-- ----------------------------------------------------------
-- `ADD COLUMN ... DEFAULT now()` carimba TODAS as 88 linhas existentes com o
-- mesmo instante (`now()` é STABLE — vale a hora da transação, igual para
-- todas). Isso importa: com `NULL`, entre esta migração e o primeiro sync
-- nenhuma linha teria carimbo e o site ficaria vazio — ou pior, cairia no
-- `MOCK_ESTOQUE`, servindo 5 carros fictícios em produção.
--
-- Com o default, o site segue mostrando os 88 até o próximo sync. Aí os 45 do
-- feed ganham carimbo novo, os 43 órfãos ficam para trás e somem sozinhos.
--
-- ----------------------------------------------------------
-- ⚠️  O filtro NÃO usa relógio de parede — e isso é deliberado
-- ----------------------------------------------------------
-- O workflow n8n não tem agendamento: só `manualTrigger`, e `active: false`
-- (ver `supabase/README.md`, passo 3). O sync roda quando alguém clica.
--
-- Um filtro do tipo `last_seen_at > now() - interval '24 hours'` esvaziaria o
-- site sozinho em qualquer semana sem ninguém clicar. Por isso `getEstoque()`
-- compara cada linha com o carimbo MAIS RECENTE da própria tabela, não com a
-- hora atual: "mostre o que veio no último sync, tenha ele sido quando for".
-- Sem sync há um mês, o site mostra o último estoque bom em vez de nada.
-- ==========================================================

ALTER TABLE public.estoque_motors
    ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now();

COMMENT ON COLUMN public.estoque_motors.last_seen_at IS
    'Instante do último upsert vindo do feed RevendaMais. Carimbado pelo '
    'workflow n8n. Linhas com carimbo anterior ao ciclo mais recente sairam do '
    'feed e nao sao exibidas no site — ver getEstoque() em src/lib/supabase.ts.';

-- Índice: `getEstoque()` hoje lê a tabela inteira e filtra em memória (78-88
-- linhas — varrer é mais barato que indexar). O índice existe para o dia em que
-- o filtro virar predicado de query, e para relatórios do tipo "o que saiu do
-- feed", que é a pergunta natural sobre esta coluna.
CREATE INDEX IF NOT EXISTS estoque_motors_last_seen_at_idx
    ON public.estoque_motors (last_seen_at DESC);
