-- ==========================================================
-- Pacote 1 — Fundação de dados do Motors Ciclo
-- ==========================================================
--
-- Escopo: manual v1.1 §2.1 (tabelas), §2.2 (índices) e §2.3 (view de estado).
-- Aceite do pacote: "um cliente autenticado consegue ler exclusivamente os
-- próprios registros; qualquer tentativa cruzada retorna vazio, não erro."
-- A autoconferência no fim deste arquivo prova isso contra o banco real, com
-- dados sintéticos que ela mesma apaga.
--
-- As tabelas nascem VAZIAS. Quem as preenche é o formulário de fechamento da
-- venda (Pacote 2), que ainda não existe. Isso é esperado: o §0 do manual diz
-- que nenhuma venda é concluída sem o par cliente-veículo, e não há onde
-- registrá-lo até aqui.
--
-- ----------------------------------------------------------
-- Onde este arquivo se afasta do texto do manual, e por quê
-- ----------------------------------------------------------
--
-- 1. `parceiros` → **`parceiros_ciclo`**. O manual chama de `parceiros`, mas
--    esse nome já é de uma tabela do financeiro em produção (fornecedores e
--    clientes da loja). Decisão do dono em 2026-08-03, registrada em
--    `AUDITORIA.md` §5.2: tabela nova, nome novo, sem estender a existente.
--
-- 2. `veiculos_vendidos.estoque_id` é **integer e NÃO tem FK**. O manual
--    declara `uuid references estoque_motors(id)` e as duas coisas estão
--    erradas contra a produção: a coluna real é `integer`, e a linha do
--    estoque some quando o veículo sai do feed do RevendaMais — uma FK
--    apagaria ou travaria o registro da venda, que é justamente o dado que
--    precisa sobreviver para sempre. Decisão registrada em `AUDITORIA.md`
--    §3.3: guardar o vínculo como referência fraca e o resto como snapshot
--    (marca, modelo, ano e placa já são colunas próprias aqui).
--
-- 3. `clientes.auth_user_id` é coluna nova, fora do §2.1. É o vínculo com o
--    login da Caderneta (manual v1.1 §6.3, link mágico por e-mail) e é sobre
--    ela que toda a RLS deste arquivo se apoia.
--
-- 4. A view `vw_ciclo_estado` é materializada, como o manual pede — e por
--    isso **não é exposta ao cliente**: view materializada não respeita RLS.
--    Ver a seção 7 abaixo.
-- ==========================================================


-- ==========================================================
-- 1. Tabelas — manual §2.1, na ordem das dependências
-- ==========================================================

-- Cliente: entidade estável, independente de quantos carros comprou.
create table if not exists public.clientes (
  id                uuid primary key default gen_random_uuid(),
  cpf_cnpj          text unique not null,
  nome              text not null,
  telefone_e164     text not null,
  -- v1.1 §3.1: e-mail é bloqueante no fechamento da venda porque é por ele
  -- que o cliente entra na Caderneta. Fica NULL aqui para não impedir a
  -- retroalimentação da base histórica (§3.3), que tem cliente antigo sem
  -- e-mail — quem exige é o formulário de venda nova.
  email             text,
  data_nascimento   date,
  cep               text,
  consentimento_lgpd_em     timestamptz,
  consentimento_canais      jsonb default '{"whatsapp":false,"email":false,"sms":false}',
  origem_primeiro_contato   text,
  -- Fora do §2.1: o vínculo com o login da Caderneta. Sem FK para auth.users
  -- de propósito — apagar um usuário do Auth não pode apagar o cliente, que é
  -- registro de negócio com contrato de 36 meses atrás.
  auth_user_id      uuid unique,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

comment on column public.clientes.auth_user_id is
  'Usuário do Supabase Auth que entra na Caderneta. NULL = cliente sem acesso '
  'à área logada; ele não perde o programa, só a tela (manual v1.1 §6.3).';

-- A rede parceira. `parceiros_ciclo`, não `parceiros` — ver cabeçalho.
create table if not exists public.parceiros_ciclo (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null,   -- oficina | seguradora | despachante | estetica | pneus
  nome          text not null,
  cidade        text,
  comissao_pct  numeric(5,2),
  ativo         boolean default true,
  created_at    timestamptz default now()
);

-- O núcleo: um veículo vendido a um cliente.
create table if not exists public.veiculos_vendidos (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references public.clientes(id),
  -- integer e sem FK — ver item 2 do cabeçalho.
  estoque_id        integer,
  chassi            text unique not null,
  placa             text not null,
  marca             text not null,
  modelo            text not null,
  versao            text,
  ano_fabricacao    int not null,
  ano_modelo        int not null,
  data_venda        date not null,
  -- v1.1 §5.2: a PRIMEIRA notação de KM do veículo. Marco zero do plano de
  -- revisões e referência da 1ª revisão, que não tem etiqueta anterior.
  km_na_venda       int not null,
  valor_venda       numeric(12,2) not null,
  custo_aquisicao   numeric(12,2),
  aderiu_ciclo      boolean default false,
  vendedor          text,
  created_at        timestamptz default now()
);

-- Financiamento: sem isto, não existe equity mining.
create table if not exists public.contratos_financiamento (
  id                  uuid primary key default gen_random_uuid(),
  veiculo_vendido_id  uuid not null references public.veiculos_vendidos(id),
  instituicao         text not null,
  valor_financiado    numeric(12,2) not null,
  valor_entrada       numeric(12,2),
  taxa_mensal         numeric(8,6) not null,   -- decimal: 0.0175 = 1,75% a.m.
  prazo_meses         int not null,
  valor_parcela       numeric(12,2) not null,
  data_primeira_parcela date not null,
  sistema_amortizacao text default 'PRICE',
  status              text default 'ativo',    -- ativo | quitado | transferido | inadimplente
  created_at          timestamptz default now()
);

-- Seguro: renovação anual = receita recorrente + gatilho de contato.
create table if not exists public.apolices_seguro (
  id                  uuid primary key default gen_random_uuid(),
  veiculo_vendido_id  uuid not null references public.veiculos_vendidos(id),
  seguradora          text not null,
  numero_apolice      text,
  corretora_parceira  text,
  premio              numeric(12,2),
  comissao_motors     numeric(12,2),
  vigencia_inicio     date not null,
  vigencia_fim        date not null,
  renovada_em         date
);

-- Garantia estendida e plano de manutenção.
create table if not exists public.contratos_ciclo (
  id                  uuid primary key default gen_random_uuid(),
  veiculo_vendido_id  uuid not null references public.veiculos_vendidos(id) unique,
  plano               text not null,           -- essencial | completo
  garantia_meses      int not null,
  garantia_fim        date not null,
  mensalidade         numeric(12,2),
  -- Campos de recompra: nascem nulos e assim permanecem enquanto o gatilho do
  -- §1.4 não abrir. Regra 5 do CLAUDE.md. Existem no schema porque o manual os
  -- especifica, não porque haja código que os escreva.
  recompra_habilitada boolean default false,
  recompra_valor      numeric(12,2),
  recompra_janela_ini date,
  recompra_janela_fim date,
  km_limite_anual     int default 15000,
  status_elegibilidade text default 'elegivel', -- elegivel | em_risco | perdida
  motivo_perda        text,
  assinado_em         timestamptz,
  url_contrato        text
);

-- Cada passagem pela rede parceira. É aqui que o dado nasce.
create table if not exists public.manutencoes (
  id                  uuid primary key default gen_random_uuid(),
  veiculo_vendido_id  uuid not null references public.veiculos_vendidos(id),
  parceiro_id         uuid references public.parceiros_ciclo(id),
  tipo                text not null,          -- revisao_programada | corretiva | garantia | estetica
  numero_revisao      int,
  data_servico        date not null,
  km_registrado       int not null,
  valor_servico       numeric(12,2),
  comissao_motors     numeric(12,2),
  dentro_da_janela    boolean,
  itens               jsonb,
  observacoes         text,
  -- ---- o carimbo (v1.1 §2.1) ----
  -- Registro sem `confirmada_em` NÃO conta para a conformidade do §1.4.
  -- Registrar não é o ativo; o carimbo é.
  origem_registro     text not null default 'loja'
                      check (origem_registro in ('loja', 'parceiro', 'cliente')),
  confirmada_em       timestamptz,
  confirmada_por      uuid,
  url_etiqueta_anterior text,   -- a que estava no vidro; nula na 1ª revisão
  url_etiqueta_atual  text,     -- a nova, com o KM legível — prova obrigatória
  url_nota_servico    text,     -- complementar
  criada_em           timestamptz not null default now()
);

comment on table public.manutencoes is
  'A caderneta. Registro do cliente nasce sem carimbo e não conta para a '
  'conformidade — quem valida é a loja, contra a foto da etiqueta de troca de '
  'óleo (anterior e nova, com o KM legível). Manual v1.1 §5.7.';

-- A janela contratada, gerada no fechamento da venda (§1.5).
create table if not exists public.plano_revisoes (
  id                  uuid primary key default gen_random_uuid(),
  veiculo_vendido_id  uuid not null references public.veiculos_vendidos(id),
  numero_revisao      int not null,
  km_previsto         int,
  janela_inicio       date not null,
  janela_fim          date not null,
  manutencao_id       uuid references public.manutencoes(id),
  criada_em           timestamptz not null default now(),
  unique (veiculo_vendido_id, numero_revisao)
);

-- KM declarado pelo cliente entre revisões. A primeira linha de todo veículo
-- é o KM de saída na compra (origem = 'venda').
create table if not exists public.leituras_odometro (
  id                  uuid primary key default gen_random_uuid(),
  veiculo_vendido_id  uuid not null references public.veiculos_vendidos(id),
  km                  int not null,
  origem              text not null
                      check (origem in ('venda', 'cliente', 'revisao', 'vistoria')),
  registrada_em       timestamptz not null default now()
);

comment on table public.leituras_odometro is
  'KM entre revisões. Declarado, nunca verificado — quem verifica é a etiqueta '
  'no carimbo. Não registrar NUNCA penaliza o cliente (mesma regra do §5.6).';

-- A série do indicador do §1.4, preservada e nunca sobrescrita.
create table if not exists public.conformidade_diaria (
  dia                         date primary key,
  veiculos_ciclo_ativo        int not null,
  veiculos_com_revisao_devida int not null,
  veiculos_em_dia             int not null,
  pct                         numeric(5,2),   -- NULL quando o denominador é 0
  calculada_em                timestamptz not null default now()
);

comment on column public.conformidade_diaria.pct is
  'NULL quando não há veículo com revisão devida. NULL não é zero: zero seria '
  'dizer que ninguém cumpriu, e a diferença importa na série do §1.4.';

-- Telemetria AGREGADA por mês. Nunca traçado bruto de GPS (regra 1).
-- Criada vazia: nenhum provedor contratado (v1.1). O schema fica de pé para
-- que ligar a telemetria um dia seja acender uma fonte, não redesenhar.
create table if not exists public.telemetria_resumo (
  id                  uuid primary key default gen_random_uuid(),
  veiculo_vendido_id  uuid not null references public.veiculos_vendidos(id),
  competencia         date not null,
  km_percorrido       int not null,
  km_odometro_fim     int,
  horas_uso           numeric(8,2),
  freadas_bruscas     int default 0,
  aceleracoes_bruscas int default 0,
  excessos_velocidade int default 0,
  pct_noturno         numeric(5,2),
  consentimento_conducao boolean default false,
  fonte               text,
  unique (veiculo_vendido_id, competencia)
);

-- Histórico do Índice Ciclo. Uma linha por mês, por veículo.
create table if not exists public.indice_ciclo (
  id                  uuid primary key default gen_random_uuid(),
  veiculo_vendido_id  uuid not null references public.veiculos_vendidos(id),
  competencia         date not null,
  score_revisao       numeric(5,2),
  score_km            numeric(5,2),
  -- v1.1 §5.6: sem provedor de telemetria, grava NULL — NUNCA 0. A série
  -- precisa distinguir "componente inexistente" de "nota zero", e zerar
  -- penalizaria o cliente pela ausência de uma fonte que não é dele.
  score_conducao      numeric(5,2),
  score_sinistro      numeric(5,2),
  indice_total        numeric(5,2) not null,
  valor_recompra_atual numeric(12,2),
  unique (veiculo_vendido_id, competencia)
);

-- Log de tudo que o motor disparou. Auditoria e controle de frequência (§4.3).
create table if not exists public.eventos_ciclo (
  id                  uuid primary key default gen_random_uuid(),
  veiculo_vendido_id  uuid not null references public.veiculos_vendidos(id),
  gatilho             text not null,
  canal               text,               -- whatsapp | email | ligacao
  payload             jsonb,
  enviado_em          timestamptz default now(),
  respondido_em       timestamptz,
  desfecho            text,               -- convertido | recusado | sem_resposta | agendado
  valor_gerado        numeric(12,2)
);


-- ==========================================================
-- 2. Funções de identidade — a régua da RLS do cliente
-- ==========================================================
--
-- Vêm depois das tabelas de propósito: função `language sql` tem o corpo
-- validado na criação, e referenciar `clientes` antes dela existir aborta a
-- migração. (Foi o primeiro erro que o ensaio desta migração pegou.)
--
-- `is_staff(uid)` já existe (migração 20260813120000). Aqui entra o outro
-- lado: quem é o cliente logado.
--
-- SECURITY DEFINER pelo mesmo motivo de `is_staff`: a função é chamada de
-- dentro de policies e não pode disparar a RLS da tabela consultada. STABLE
-- porque o resultado não muda dentro da mesma query.

create or replace function public.cliente_atual() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from public.clientes where auth_user_id = auth.uid() limit 1;
$$;

comment on function public.cliente_atual() is
  'O `clientes.id` do cliente logado, ou NULL. NULL faz toda policy de cliente '
  'falhar fechado — sessão sem cadastro não vê nada.';

create or replace function public.e_veiculo_do_cliente(vv_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.veiculos_vendidos vv
     where vv.id = vv_id
       and vv.cliente_id = public.cliente_atual()
  );
$$;

comment on function public.e_veiculo_do_cliente(uuid) is
  'Este veículo vendido pertence ao cliente logado? É a régua de toda tabela '
  'filha do par cliente-veículo.';


-- ==========================================================
-- 3. Índices — manual §2.2, mais os que a v1.1 exige
-- ==========================================================

create index if not exists idx_vv_cliente      on public.veiculos_vendidos(cliente_id);
create index if not exists idx_vv_data_venda   on public.veiculos_vendidos(data_venda);
create index if not exists idx_cf_veiculo      on public.contratos_financiamento(veiculo_vendido_id);
create index if not exists idx_cf_status       on public.contratos_financiamento(status) where status = 'ativo';
create index if not exists idx_ap_vigencia_fim on public.apolices_seguro(vigencia_fim);
create index if not exists idx_mn_veiculo_data on public.manutencoes(veiculo_vendido_id, data_servico desc);
create index if not exists idx_ev_veiculo_gat  on public.eventos_ciclo(veiculo_vendido_id, gatilho, enviado_em desc);

-- A RLS do cliente resolve `auth_user_id` a cada linha lida: sem este índice,
-- toda consulta da Caderneta faz varredura em `clientes`.
create index if not exists idx_cl_auth_user    on public.clientes(auth_user_id);

-- A fila de carimbos (tela A21): o que o cliente registrou e ninguém validou.
create index if not exists idx_mn_pendentes    on public.manutencoes(criada_em desc)
  where confirmada_em is null;

-- O gatilho 1 varre janelas abertas todo dia.
create index if not exists idx_pr_janela       on public.plano_revisoes(janela_fim)
  where manutencao_id is null;

create index if not exists idx_lo_veiculo      on public.leituras_odometro(veiculo_vendido_id, registrada_em desc);
create index if not exists idx_ic_veiculo      on public.indice_ciclo(veiculo_vendido_id, competencia desc);


-- ==========================================================
-- 4. `updated_at` que de fato atualiza
-- ==========================================================

create or replace function public.tocar_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists clientes_updated_at on public.clientes;
create trigger clientes_updated_at
  before update on public.clientes
  for each row execute function public.tocar_updated_at();


-- ==========================================================
-- 5. Privilégios — `anon` não entra
-- ==========================================================
--
-- O padrão do Supabase concede TUDO a `anon` e `authenticated` em tabela nova
-- do schema public (verificado contra produção em 2026-08-13). A RLS barraria
-- o anônimo por ausência de policy, mas depender só disso é frágil: basta uma
-- policy futura escrita sem `TO` para a porta abrir. Aqui a permissão é
-- revogada na base e devolvida na medida.

do $$
declare t text;
begin
  foreach t in array array[
    'clientes','parceiros_ciclo','veiculos_vendidos','contratos_financiamento',
    'apolices_seguro','contratos_ciclo','manutencoes','plano_revisoes',
    'leituras_odometro','conformidade_diaria','telemetria_resumo',
    'indice_ciclo','eventos_ciclo'
  ] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    -- `authenticated` é o papel do staff no painel E do cliente na Caderneta.
    -- Quem separa os dois são as policies da seção 6, não o GRANT.
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;


-- ==========================================================
-- 6. RLS — o aceite do pacote
-- ==========================================================
--
-- O desenho é o mesmo em toda tabela filha:
--   staff   → tudo, via is_staff(auth.uid())
--   cliente → SELECT das próprias linhas, via e_veiculo_do_cliente()
--   anon    → nada, nunca (sem policy e sem GRANT)
--
-- Onde o cliente escreve — `manutencoes` e `leituras_odometro` — a policy de
-- INSERT trava o que ele pode declarar: nunca um carimbo, nunca em nome de
-- outro veículo. E não há UPDATE nem DELETE para ele: a caderneta é
-- append-only do lado do cliente, como `historico_veiculo` e `auditoria_admin`.

alter table public.clientes                enable row level security;
alter table public.parceiros_ciclo         enable row level security;
alter table public.veiculos_vendidos       enable row level security;
alter table public.contratos_financiamento enable row level security;
alter table public.apolices_seguro         enable row level security;
alter table public.contratos_ciclo         enable row level security;
alter table public.manutencoes             enable row level security;
alter table public.plano_revisoes          enable row level security;
alter table public.leituras_odometro       enable row level security;
alter table public.conformidade_diaria     enable row level security;
alter table public.telemetria_resumo       enable row level security;
alter table public.indice_ciclo            enable row level security;
alter table public.eventos_ciclo           enable row level security;

-- ---- staff: tudo, em todas ----
do $$
declare t text;
begin
  foreach t in array array[
    'clientes','parceiros_ciclo','veiculos_vendidos','contratos_financiamento',
    'apolices_seguro','contratos_ciclo','manutencoes','plano_revisoes',
    'leituras_odometro','conformidade_diaria','telemetria_resumo',
    'indice_ciclo','eventos_ciclo'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_staff', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      'using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()))',
      t || '_staff', t);
  end loop;
end $$;

-- ---- cliente: leitura das próprias linhas ----

drop policy if exists clientes_cliente_le on public.clientes;
create policy clientes_cliente_le on public.clientes
  for select to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists veiculos_vendidos_cliente_le on public.veiculos_vendidos;
create policy veiculos_vendidos_cliente_le on public.veiculos_vendidos
  for select to authenticated
  using (cliente_id = public.cliente_atual());

do $$
declare t text;
begin
  -- Todas as filhas que o cliente enxerga por completo. Ficam de fora:
  --   conformidade_diaria — agregado da base inteira, não é dado dele;
  --   eventos_ciclo       — log interno, com desfecho e valor gerado.
  -- A exportação de LGPD do §6.3-D é rota curada, não leitura crua da tabela.
  foreach t in array array[
    'contratos_financiamento','apolices_seguro','contratos_ciclo',
    'plano_revisoes','leituras_odometro','telemetria_resumo','indice_ciclo'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_cliente_le', t);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      'using (public.e_veiculo_do_cliente(veiculo_vendido_id))',
      t || '_cliente_le', t);
  end loop;
end $$;

-- A rede parceira: o cliente vê as oficinas ativas para escolher onde ir.
drop policy if exists parceiros_ciclo_cliente_le on public.parceiros_ciclo;
create policy parceiros_ciclo_cliente_le on public.parceiros_ciclo
  for select to authenticated
  using (ativo = true and public.cliente_atual() is not null);

-- ---- cliente: a caderneta ----

drop policy if exists manutencoes_cliente_le on public.manutencoes;
create policy manutencoes_cliente_le on public.manutencoes
  for select to authenticated
  using (public.e_veiculo_do_cliente(veiculo_vendido_id));

drop policy if exists manutencoes_cliente_registra on public.manutencoes;
create policy manutencoes_cliente_registra on public.manutencoes
  for insert to authenticated
  with check (
    public.e_veiculo_do_cliente(veiculo_vendido_id)
    -- Não pode se declarar loja nem parceiro.
    and origem_registro = 'cliente'
    -- Não pode nascer carimbado. O carimbo é da loja, e é o que separa
    -- "registrei" de "vale para a conformidade".
    and confirmada_em is null
    and confirmada_por is null
    -- Nem pode se declarar dentro da janela: quem calcula é a loja.
    and dentro_da_janela is null
  );

-- Sem UPDATE e sem DELETE para o cliente, de propósito: registro enviado não
-- se reescreve. Correção é registro novo, e o antigo fica no rastro.

drop policy if exists leituras_odometro_cliente_le on public.leituras_odometro;
create policy leituras_odometro_cliente_le on public.leituras_odometro
  for select to authenticated
  using (public.e_veiculo_do_cliente(veiculo_vendido_id));

drop policy if exists leituras_odometro_cliente_registra on public.leituras_odometro;
create policy leituras_odometro_cliente_registra on public.leituras_odometro
  for insert to authenticated
  with check (
    public.e_veiculo_do_cliente(veiculo_vendido_id)
    and origem = 'cliente'
  );


-- ==========================================================
-- 7. View de estado — manual §2.3
-- ==========================================================
--
-- ⚠️ View materializada NÃO respeita RLS: ela é lida com os privilégios de
-- quem a criou, e não há como ligar RLS nela. Se `authenticated` puder
-- selecioná-la, qualquer cliente logado lê a base inteira — exatamente o que o
-- aceite deste pacote proíbe.
--
-- Por isso: a matview existe como o manual pede, serve ao orquestrador diário
-- (§4.1, chave de serviço) e é REVOGADA de anon e authenticated. Quem precisar
-- dela no painel lê pela view comum abaixo, que filtra por is_staff.
-- O cliente não lê a view: lê as tabelas, sob RLS.

drop materialized view if exists public.vw_ciclo_estado;
create materialized view public.vw_ciclo_estado as
select
  vv.id                              as veiculo_vendido_id,
  c.id                               as cliente_id,
  c.nome, c.telefone_e164,
  vv.placa, vv.marca, vv.modelo, vv.ano_modelo,
  vv.data_venda,
  (current_date - vv.data_venda)/30  as meses_desde_venda,
  vv.km_na_venda,
  coalesce(m.km_ultimo, vv.km_na_venda)      as km_conhecido,
  m.data_ultima_manutencao,
  cc.recompra_valor, cc.recompra_janela_ini, cc.recompra_janela_fim,
  cc.status_elegibilidade, cc.garantia_fim,
  ap.vigencia_fim                    as seguro_vence_em,
  cf.instituicao, cf.valor_parcela, cf.prazo_meses,
  cf.data_primeira_parcela, cf.taxa_mensal, cf.valor_financiado
from public.veiculos_vendidos vv
join public.clientes c on c.id = vv.cliente_id
left join public.contratos_ciclo cc on cc.veiculo_vendido_id = vv.id
left join lateral (
  -- v1.1: só revisão CONFIRMADA move o KM conhecido. Registro sem carimbo não
  -- é fonte de KM verificado (§5.2).
  select max(km_registrado) as km_ultimo, max(data_servico) as data_ultima_manutencao
    from public.manutencoes
   where veiculo_vendido_id = vv.id and confirmada_em is not null
) m on true
left join lateral (
  select vigencia_fim from public.apolices_seguro
   where veiculo_vendido_id = vv.id order by vigencia_fim desc limit 1
) ap on true
left join lateral (
  select * from public.contratos_financiamento
   where veiculo_vendido_id = vv.id and status = 'ativo' limit 1
) cf on true;

-- Unique index: exigência do REFRESH ... CONCURRENTLY, que é como o
-- orquestrador diário deve atualizar sem travar leitura.
create unique index if not exists idx_vce_veiculo
  on public.vw_ciclo_estado(veiculo_vendido_id);

revoke all on public.vw_ciclo_estado from anon, authenticated;
grant select on public.vw_ciclo_estado to service_role;

-- A porta do painel para a matview. View comum, sem `security_invoker`: roda
-- com os privilégios do dono (que enxerga a matview) e o WHERE faz o corte.
-- Para quem não é staff, devolve vazio — não erro.
drop view if exists public.vw_ciclo_estado_painel;
create view public.vw_ciclo_estado_painel as
  select * from public.vw_ciclo_estado where public.is_staff(auth.uid());

revoke all on public.vw_ciclo_estado_painel from anon;
grant select on public.vw_ciclo_estado_painel to authenticated;

comment on view public.vw_ciclo_estado_painel is
  'Recorte de vw_ciclo_estado para o painel. A matview não respeita RLS; esta '
  'view é o único caminho de leitura com sessão, e ela exige is_staff.';


-- ==========================================================
-- 8. Autoconferência — o aceite, provado contra o banco real
-- ==========================================================
--
-- "Um cliente autenticado consegue ler exclusivamente os próprios registros;
--  qualquer tentativa cruzada retorna vazio, não erro."
--
-- Cria dois clientes sintéticos com um veículo cada, assume a sessão de um
-- deles e confere o que enxerga. Apaga tudo no fim. Se qualquer asserção
-- falhar, o bloco levanta exceção — e como todo o trabalho dele acontece na
-- mesma transação, os dados sintéticos somem junto.

do $$
declare
  uid_a  uuid := gen_random_uuid();
  uid_b  uuid := gen_random_uuid();
  cli_a  uuid;
  cli_b  uuid;
  vv_a   uuid;
  vv_b   uuid;
  qtd    integer;
begin
  insert into public.clientes (cpf_cnpj, nome, telefone_e164, auth_user_id)
    values ('AUTOCONFERENCIA-A', 'Cliente Sintético A', '+550000000001', uid_a)
    returning id into cli_a;
  insert into public.clientes (cpf_cnpj, nome, telefone_e164, auth_user_id)
    values ('AUTOCONFERENCIA-B', 'Cliente Sintético B', '+550000000002', uid_b)
    returning id into cli_b;

  insert into public.veiculos_vendidos
    (cliente_id, chassi, placa, marca, modelo, ano_fabricacao, ano_modelo,
     data_venda, km_na_venda, valor_venda)
    values (cli_a, 'AUTOCONFERENCIA-CHASSI-A', 'AAA0A00', 'Marca', 'Modelo',
            2020, 2021, current_date, 50000, 1)
    returning id into vv_a;
  insert into public.veiculos_vendidos
    (cliente_id, chassi, placa, marca, modelo, ano_fabricacao, ano_modelo,
     data_venda, km_na_venda, valor_venda)
    values (cli_b, 'AUTOCONFERENCIA-CHASSI-B', 'BBB0B00', 'Marca', 'Modelo',
            2020, 2021, current_date, 60000, 1)
    returning id into vv_b;

  insert into public.leituras_odometro (veiculo_vendido_id, km, origem)
    values (vv_a, 50000, 'venda'), (vv_b, 60000, 'venda');

  -- ---- vira o cliente A ----
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into qtd from public.clientes;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: cliente A enxerga % linhas de clientes, deveria ser 1', qtd;
  end if;

  select count(*) into qtd from public.veiculos_vendidos;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: cliente A enxerga % veículos, deveria ser 1', qtd;
  end if;

  -- A tentativa cruzada explícita: pedir o veículo do outro pelo id.
  select count(*) into qtd from public.veiculos_vendidos where id = vv_b;
  if qtd <> 0 then
    raise exception 'ACEITE FALHOU: cliente A leu o veículo do cliente B';
  end if;

  select count(*) into qtd from public.leituras_odometro;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: cliente A enxerga % leituras, deveria ser 1', qtd;
  end if;

  -- Não é staff: não vê a série agregada nem a view do painel.
  select count(*) into qtd from public.conformidade_diaria;
  if qtd <> 0 then
    raise exception 'ACEITE FALHOU: cliente leu conformidade_diaria';
  end if;

  select count(*) into qtd from public.vw_ciclo_estado_painel;
  if qtd <> 0 then
    raise exception 'ACEITE FALHOU: cliente leu a view do painel';
  end if;

  -- Não pode carimbar a própria revisão.
  begin
    insert into public.manutencoes
      (veiculo_vendido_id, tipo, data_servico, km_registrado,
       origem_registro, confirmada_em)
      values (vv_a, 'revisao_programada', current_date, 60000,
              'cliente', now());
    raise exception 'ACEITE FALHOU: cliente conseguiu gravar revisão já carimbada';
  exception
    when insufficient_privilege then null;  -- era o esperado
  end;

  -- Nem registrar no veículo de outro.
  begin
    insert into public.manutencoes
      (veiculo_vendido_id, tipo, data_servico, km_registrado, origem_registro)
      values (vv_b, 'revisao_programada', current_date, 70000, 'cliente');
    raise exception 'ACEITE FALHOU: cliente A registrou revisão no veículo de B';
  exception
    when insufficient_privilege then null;  -- era o esperado
  end;

  -- O que ele PODE: registrar no próprio veículo, sem carimbo.
  insert into public.manutencoes
    (veiculo_vendido_id, tipo, data_servico, km_registrado, origem_registro)
    values (vv_a, 'revisao_programada', current_date, 60000, 'cliente');

  reset role;

  -- ---- sessão anônima não vê nada ----
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    select count(*) into qtd from public.clientes;
    if qtd <> 0 then
      raise exception 'ACEITE FALHOU: anon leu % linhas de clientes', qtd;
    end if;
  exception
    when insufficient_privilege then null;  -- sem GRANT: melhor ainda
  end;
  reset role;

  -- ---- limpeza ----
  delete from public.manutencoes       where veiculo_vendido_id in (vv_a, vv_b);
  delete from public.leituras_odometro where veiculo_vendido_id in (vv_a, vv_b);
  delete from public.veiculos_vendidos where id in (vv_a, vv_b);
  delete from public.clientes          where id in (cli_a, cli_b);

  raise notice 'Aceite do Pacote 1 verificado: isolamento por cliente, carimbo protegido, anon fora.';
end $$;
