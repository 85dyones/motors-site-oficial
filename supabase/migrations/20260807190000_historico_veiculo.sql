-- ==========================================================
-- Histórico de alteração por veículo (telas A15 e A16)
-- ==========================================================
--
-- O design doc pede, no editor de veículo, o bloco "HISTÓRICO DESTE VEÍCULO"
-- — "Alterou preço de R$ 294.900 para R$ 289.900 · Rafael (Comercial) ·
-- ontem 17:40". E a tela A16 (fluxo de publicação) depende do mesmo dado
-- para mostrar o que mudou antes de aprovar.
--
-- `auditoria_admin` (migração 20260807120000) não serve: ela registra ações
-- de SISTEMA — permissão, paleta, texto legal —, um vocabulário fechado e
-- sem vínculo com registro de estoque. Consultar "o que mudou no carro 4821"
-- ali seria varrer texto livre.
--
-- ----------------------------------------------------------
-- Por que guardar valor anterior E novo
-- ----------------------------------------------------------
-- O doc mostra a comparação lado a lado ("NO AR HOJE" × "PROPOSTO"). Sem o
-- valor anterior gravado no momento da mudança, reconstruir o "antes" exige
-- reprocessar o histórico inteiro de trás para frente — e qualquer buraco na
-- cadeia (uma edição feita fora do painel, um sync) quebra a reconstrução.
-- Dois campos por linha custam bytes e evitam isso.
--
-- Ambos são `text`: o histórico é para LER, não para calcular. Guardar o
-- número tipado convidaria a somar, e somar histórico de preço não tem
-- significado.

create table if not exists public.historico_veiculo (
    id uuid primary key default gen_random_uuid(),
    -- Sem FK para `estoque_motors`: o veículo pode sair do feed e ser
    -- removido um dia, e o histórico do que foi feito não deve sumir junto —
    -- é justamente quando alguém pergunta "quem mexeu nisso?".
    veiculo_id bigint not null,
    campo text not null,
    valor_anterior text,
    valor_novo text,
    autor_id uuid,
    autor_nome text,
    registrado_em timestamptz not null default now()
);

comment on table public.historico_veiculo is
    'Alterações campo a campo feitas no editor de veículo (A15). '
    'Append-only via RLS — sem policy de UPDATE/DELETE.';

-- A consulta da tela é sempre "as últimas N deste veículo".
create index if not exists historico_veiculo_por_veiculo_idx
    on public.historico_veiculo (veiculo_id, registrado_em desc);

alter table public.historico_veiculo enable row level security;

-- Mesmo desenho de `auditoria_admin`: lê e insere, nunca altera nem apaga.
-- A imutabilidade é a ausência deliberada de policy de UPDATE/DELETE.
drop policy if exists historico_veiculo_leitura on public.historico_veiculo;
create policy historico_veiculo_leitura on public.historico_veiculo
    for select to authenticated using (true);

drop policy if exists historico_veiculo_insercao on public.historico_veiculo;
create policy historico_veiculo_insercao on public.historico_veiculo
    for insert to authenticated with check (true);
