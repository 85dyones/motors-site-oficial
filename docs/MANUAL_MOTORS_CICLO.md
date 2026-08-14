# Manual Motors Ciclo
### Alinhamento do site, da base de dados e da automação

**Versão 1.1 — Agosto 2026**
Documento de referência para desenvolvimento. Toda decisão de produto, site ou automação deve ser verificável contra este documento.

> **v1.1 (2026-08-13)** — incorpora a [Emenda 01](EMENDA_01_MANUAL_CICLO.md), aprovada pelo dono em 13/08/2026: o programa passa a operar **sem telemetria embarcada**, e a conformidade de revisão nasce da Garagem Motors, com diário de bordo, validada pela loja contra a etiqueta de troca de óleo. Alterou §1.4, §1.5 (novo), §2.1, §3.1, §4.2, §5.2, §5.6, §5.7 e §6.3. O registro do que mudou e por quê está na emenda; este documento traz o texto vigente.

---

## 0. O princípio orientador

> **A venda não termina na entrega das chaves. Ela abre um contrato de 36 meses.**

Consequência prática, e a única regra que não se negocia:

**Nenhuma venda é dada como concluída sem o registro completo do par cliente-veículo.** Um campo não preenchido hoje é um gatilho perdido em 2029. Isso vale mais do que qualquer funcionalidade que este documento descreve.

O sistema tem uma responsabilidade central: **saber, todo dia, quais clientes estão prontos para alguma coisa** — revisão, renovação, troca — e agir sem intervenção humana.

---

## 1. Definição do produto

### 1.1 As quatro peças e como se travam

| Peça | Função | Regra |
|---|---|---|
| **Recompra fixada** | Atrai o cliente | Motors compra de volta em 24 ou 36 meses por valor definido em contrato |
| **Revisões na rede** | Condição de validade | Recompra só é honrada com 100% das revisões feitas na rede parceira, dentro da janela de KM/tempo |
| **Garantia estendida** | Protege o passivo | Reduz probabilidade de retorno com avaria estrutural |
| **Histórico proprietário** | Ativo acumulado | KM real, manutenção, uso — permite precificar a recompra com risco baixo |

**O encaixe é o produto.** Cada peça financia e viabiliza a seguinte. Vendidas separadamente, não funcionam.

### 1.2 Regras de elegibilidade (a serem confirmadas pela diretoria antes do piloto)

Sugestão de partida — conservadora, ajustável com dados:

- **Modelos elegíveis:** apenas alta liquidez, giro histórico < 45 dias, com no mínimo 12 meses de série própria
- **Idade máxima na venda:** até 6 anos de fabricação
- **KM máximo no ato da recompra:** 15.000 km/ano acumulado (excedente reduz o valor por tabela publicada em contrato)
- **Valor de recompra:** percentual do valor pago, definido por faixa de modelo e prazo, com **teto de exposição agregada** aprovado pela diretoria
- **Perda de elegibilidade:** revisão fora da janela, sinistro com dano estrutural, adulteração de KM, débito de financiamento em aberto

### 1.3 O que precisa estar em contrato

- Valor de recompra em reais, não em percentual da FIPE (FIPE é média nacional retroativa e não serve como referência contratual)
- Janela de exercício (ex.: entre o mês 22 e 26, ou 34 e 38)
- Condições de perda de elegibilidade, listadas exaustivamente
- Tabela de desconto por KM excedente e por avaria, publicada e anexa
- Direito da Motors de vistoriar antes de honrar

> **Atenção jurídica.** A recompra fixada é uma opção de venda que a Motors escreve. É passivo contábil. Exige provisionamento e parecer jurídico antes do primeiro contrato assinado.

### 1.4 Gatilho de ativação da recompra

**A recompra não é ligada no lançamento. É um módulo com pré-requisito.**

Razão técnica: precificar a recompra sobre FIPE contradiz o próprio §5.3 deste manual, que desqualifica a FIPE como referência contratual. Sem curva de depreciação própria, a Motors estaria escrevendo uma opção de venda usando a fonte que ela mesma considera insuficiente.

**Condição de ativação, verificável e auditável:**

```
conformidade_revisao >= 70%   por 3 meses consecutivos
E veiculos_monitorados >= 150
E serie_procedencia >= 6 meses
```

Onde:

- `conformidade_revisao` = % de veículos com Ciclo ativo cuja última revisão programada foi feita na rede dentro da janela contratada.
- `serie_procedencia` = meses consecutivos com registro diário ininterrupto de `conformidade_diaria`, contados do primeiro veículo com Ciclo ativo. **Dia sem cálculo zera a contagem** — a série precisa ser contínua para servir de base à curva.
- `veiculos_monitorados` = veículos com Ciclo ativo **e diário de bordo vivo**: ao menos uma revisão confirmada nos últimos 12 meses, ou ainda dentro da janela da primeira revisão.

> **v1.1:** a terceira condição era `serie_telemetria >= 6 meses`. A telemetria embarcada foi adiada (nenhum provedor contratado) e a fonte do KM real passou a ser a diário de bordo, com o KM lido pela oficina e fotografado na etiqueta de óleo — dado menos frequente e **mais verificável** que odômetro reportado por rastreador. O que o gatilho protege não mudou: a Motors não escreve opção de venda sem curva de depreciação própria com KM real. Ver §1.5 e Emenda 01, artigo E1.

**O `fator_retencao` do §5.5 continua exigindo série histórica própria.** Esta mudança troca a fonte do KM; não dispensa a curva. A recompra permanece desligada até que as duas coisas existam.

**O sistema deve calcular e exibir esse indicador em painel desde o primeiro dia.** É o número que destrava a fase seguinte — a diretoria acompanha, ninguém precisa argumentar.

**Enquanto o gatilho não abre:**
- Contratos vendidos são Essencial e Garantido *sem cláusula de recompra*
- Campos `recompra_*` permanecem nulos
- O Índice Ciclo roda normalmente e acumula histórico (é o que forma a curva)
- Nenhuma peça de comunicação menciona recompra

### 1.5 Plano de revisões

*Artigo novo na v1.1. É o que o diário de bordo mede e o que alimenta o §1.4.*

**Intervalo: 10.000 km ou 12 meses, o que ocorrer primeiro.**

É o intervalo publicado por Volkswagen, Honda, Toyota e Chevrolet para uso normal — o padrão que o cliente brasileiro já reconhece. Adotar intervalo próprio criaria a conversa "por que a Motors pede revisão antes da montadora".

**Tolerância — vale para a régua que venceu:**

| Venceu por | Tolerância |
|---|---|
| Tempo (12 meses) | 30 dias |
| Quilometragem (10.000 km) | 1.000 km |

É a tolerância publicada pela Toyota (um mês ou 1.000 km) e espelha a lógica do próprio vencimento: se o que venceu foi o calendário, a folga é de calendário; se foi o odômetro, a folga é de odômetro. **Antecipar nunca penaliza** — revisão feita antes cumpre a janela e reinicia a contagem a partir da data e do KM registrados.

**Marco zero — a entrega, não a fabricação:**

```
revisão N prevista em:  km_na_venda + (N × 10.000 km)
                    ou  data_venda   + (N × 12 meses)
                    — o que o veículo atingir primeiro

data prevista   = projeção do §5.2 sobre a rodagem conhecida
janela_inicio   = data prevista − 30 dias
janela_fim      = data prevista + 30 dias  (ou KM previsto + 1.000)
```

`km_na_venda` é o **KM de saída na compra**, registrado pela loja na entrega (§3.1). A data prevista é recalculada a cada novo ponto de KM. Quem roda 15.000 km/ano — o teto do §1.2 — vence pela régua de KM em cerca de 8 meses; quem roda pouco vence pelo calendário. O sistema não escolhe: aplica o que ocorrer primeiro.

**A troca de óleo é o item obrigatório da revisão programada**, e é ela que a prova atesta (§2.1, `manutencoes`). O plano inteiro é gerado no fechamento da venda em `plano_revisoes` e reprojetado a cada revisão confirmada.

> Este artigo foi construído sobre a prática publicada das montadoras porque não havia número interno definido. Quando houver acordo próprio com a rede parceira, os intervalos passam a vir do contrato com a rede e este artigo é substituído.

---

## 2. Modelo de dados (Supabase)

A base atual gira em torno de `estoque_motors` — inventário. O Ciclo exige um segundo eixo: **o par cliente-veículo ao longo do tempo.**

### 2.1 Tabelas novas

```sql
-- Cliente (entidade estável, independente de quantos carros comprou)
create table clientes (
  id                uuid primary key default gen_random_uuid(),
  cpf_cnpj          text unique not null,
  nome              text not null,
  telefone_e164     text not null,
  email             text,
  data_nascimento   date,
  cep               text,
  consentimento_lgpd_em     timestamptz,
  consentimento_canais      jsonb default '{"whatsapp":false,"email":false,"sms":false}',
  origem_primeiro_contato   text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- O núcleo: um veículo vendido a um cliente
create table veiculos_vendidos (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references clientes(id),
  estoque_id        uuid references estoque_motors(id),
  chassi            text unique not null,
  placa             text not null,
  marca             text not null,
  modelo            text not null,
  versao            text,
  ano_fabricacao    int not null,
  ano_modelo        int not null,
  data_venda        date not null,
  km_na_venda       int not null,
  valor_venda       numeric(12,2) not null,
  custo_aquisicao   numeric(12,2),
  aderiu_ciclo      boolean default false,
  vendedor          text,
  created_at        timestamptz default now()
);

-- Financiamento: sem isto, não existe equity mining
create table contratos_financiamento (
  id                  uuid primary key default gen_random_uuid(),
  veiculo_vendido_id  uuid not null references veiculos_vendidos(id),
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

-- Seguro: renovação anual = receita recorrente + gatilho de contato
create table apolices_seguro (
  id                  uuid primary key default gen_random_uuid(),
  veiculo_vendido_id  uuid not null references veiculos_vendidos(id),
  seguradora          text not null,
  numero_apolice      text,
  corretora_parceira  text,
  premio              numeric(12,2),
  comissao_motors     numeric(12,2),
  vigencia_inicio     date not null,
  vigencia_fim        date not null,
  renovada_em         date
);

-- Garantia estendida e plano de manutenção
create table contratos_ciclo (
  id                  uuid primary key default gen_random_uuid(),
  veiculo_vendido_id  uuid not null references veiculos_vendidos(id) unique,
  plano               text not null,           -- essencial | completo
  garantia_meses      int not null,
  garantia_fim        date not null,
  mensalidade         numeric(12,2),
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
create table manutencoes (
  id                  uuid primary key default gen_random_uuid(),
  veiculo_vendido_id  uuid not null references veiculos_vendidos(id),
  parceiro_id         uuid references parceiros(id),
  tipo                text not null,          -- revisao_programada | corretiva | garantia | estetica
  numero_revisao      int,                    -- 1,2,3... para revisões programadas
  data_servico        date not null,
  km_registrado       int not null,
  valor_servico       numeric(12,2),
  comissao_motors     numeric(12,2),
  dentro_da_janela    boolean,
  itens               jsonb,
  observacoes         text,
  -- v1.1 — a verificação. Lançamento sem `confirmada_em` NÃO conta para a
  -- conformidade do §1.4: registrar não é o ativo, a verificação é.
  origem_registro     text not null default 'loja',  -- loja | parceiro | cliente
  confirmada_em       timestamptz,
  confirmada_por      uuid,
  url_etiqueta_anterior text,   -- a que estava no vidro; nula na 1ª revisão
  url_etiqueta_atual  text,     -- a nova, com o KM legível — prova obrigatória
  url_nota_servico    text      -- complementar
);

-- v1.1 — a janela contratada, gerada no fechamento da venda (§1.5).
-- Sem ela, `dentro_da_janela` não tem contra o que ser calculada.
create table plano_revisoes (
  id                  uuid primary key default gen_random_uuid(),
  veiculo_vendido_id  uuid not null references veiculos_vendidos(id),
  numero_revisao      int not null,
  km_previsto         int,
  janela_inicio       date not null,
  janela_fim          date not null,
  manutencao_id       uuid references manutencoes(id),  -- preenchida ao verificar
  unique (veiculo_vendido_id, numero_revisao)
);

-- v1.1 — KM declarado pelo cliente entre revisões. Opt-in. Declarado,
-- nunca verificado. Não registrar NUNCA penaliza (mesma lógica do §5.6).
-- A primeira linha de todo veículo é o KM de saída na compra.
create table leituras_odometro (
  id                  uuid primary key default gen_random_uuid(),
  veiculo_vendido_id  uuid not null references veiculos_vendidos(id),
  km                  int not null,
  origem              text not null,   -- venda | cliente | revisao | vistoria
  registrada_em       timestamptz not null default now()
);

-- v1.1 — a série do indicador do §1.4, preservada e nunca sobrescrita.
-- Uma linha por dia desde a primeira venda, inclusive as de denominador zero.
create table conformidade_diaria (
  dia                         date primary key,
  veiculos_ciclo_ativo        int not null,
  veiculos_com_revisao_devida int not null,
  veiculos_em_dia             int not null,
  pct                         numeric(5,2)   -- NULL quando o denominador é 0
);

create table parceiros (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null,   -- oficina | seguradora | despachante | estetica | pneus
  nome          text not null,
  cidade        text,
  comissao_pct  numeric(5,2),
  ativo         boolean default true
);

-- Telemetria AGREGADA por mês. Nunca armazenar traçado bruto de GPS aqui.
-- v1.1: a tabela é criada e permanece VAZIA — nenhum provedor de rastreamento
-- contratado. O schema fica de pé para que ligar a telemetria um dia seja
-- acender uma fonte, não redesenhar o modelo.
create table telemetria_resumo (
  id                  uuid primary key default gen_random_uuid(),
  veiculo_vendido_id  uuid not null references veiculos_vendidos(id),
  competencia         date not null,          -- primeiro dia do mês
  km_percorrido       int not null,
  km_odometro_fim     int,
  horas_uso           numeric(8,2),
  freadas_bruscas     int default 0,
  aceleracoes_bruscas int default 0,
  excessos_velocidade int default 0,
  pct_noturno         numeric(5,2),
  consentimento_conducao boolean default false,
  fonte               text,                   -- provedor do rastreador
  unique (veiculo_vendido_id, competencia)
);

-- Histórico do Índice Ciclo. Uma linha por mês, por veículo.
create table indice_ciclo (
  id                  uuid primary key default gen_random_uuid(),
  veiculo_vendido_id  uuid not null references veiculos_vendidos(id),
  competencia         date not null,
  score_revisao       numeric(5,2),
  score_km            numeric(5,2),
  score_conducao      numeric(5,2),
  score_sinistro      numeric(5,2),
  indice_total        numeric(5,2) not null,
  valor_recompra_atual numeric(12,2),
  unique (veiculo_vendido_id, competencia)
);

-- Log de tudo que o motor disparou. Auditoria e controle de frequência.
create table eventos_ciclo (
  id                  uuid primary key default gen_random_uuid(),
  veiculo_vendido_id  uuid not null references veiculos_vendidos(id),
  gatilho             text not null,
  canal               text,               -- whatsapp | email | ligacao
  payload             jsonb,
  enviado_em          timestamptz default now(),
  respondido_em       timestamptz,
  desfecho            text,               -- convertido | recusado | sem_resposta | agendado
  valor_gerado        numeric(12,2)
);
```

### 2.2 Índices obrigatórios

```sql
create index idx_vv_cliente        on veiculos_vendidos(cliente_id);
create index idx_vv_data_venda     on veiculos_vendidos(data_venda);
create index idx_cf_veiculo        on contratos_financiamento(veiculo_vendido_id);
create index idx_cf_status         on contratos_financiamento(status) where status = 'ativo';
create index idx_ap_vigencia_fim   on apolices_seguro(vigencia_fim);
create index idx_mn_veiculo_data   on manutencoes(veiculo_vendido_id, data_servico desc);
create index idx_ev_veiculo_gat    on eventos_ciclo(veiculo_vendido_id, gatilho, enviado_em desc);
```

### 2.3 View de estado — o coração do sistema

Uma view materializada, atualizada diariamente, que responde "qual é a situação de cada cliente hoje":

```sql
create materialized view vw_ciclo_estado as
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
from veiculos_vendidos vv
join clientes c on c.id = vv.cliente_id
left join contratos_ciclo cc on cc.veiculo_vendido_id = vv.id
left join lateral (
  select max(km_registrado) as km_ultimo, max(data_servico) as data_ultima_manutencao
  from manutencoes where veiculo_vendido_id = vv.id
) m on true
left join lateral (
  select vigencia_fim from apolices_seguro
  where veiculo_vendido_id = vv.id order by vigencia_fim desc limit 1
) ap on true
left join lateral (
  select * from contratos_financiamento
  where veiculo_vendido_id = vv.id and status = 'ativo' limit 1
) cf on true;
```

---

## 3. Captura no ato da venda

O ponto de falha mais provável do projeto inteiro. Não é técnico — é comportamental.

### 3.1 Campos obrigatórios (venda não fecha sem)

`cpf_cnpj` · `nome` · `telefone_e164` · `email` · `chassi` · `placa` · `km_na_venda` · `valor_venda` · `data_venda` · `consentimento_lgpd`

> **v1.1 — dois campos ganharam peso.**
>
> **`email`** passou a ser bloqueante: é por ele que o cliente entra na área do diário de bordo, por link mágico (§6.3). Cliente sem e-mail utilizável não perde o programa — o diário de bordo segue alimentada pela loja e a comunicação segue por WhatsApp —, mas perde o acesso à área logada.
>
> **`km_na_venda`** é o **KM de saída na compra** e é a primeira notação de odômetro do veículo (§5.2). Ele tem três funções: marco zero do plano de revisões (§1.5), primeira linha de `leituras_odometro`, e o ponto de referência da **primeira revisão, que não tem etiqueta anterior para comparar**. Sem ele, a primeira revisão do cliente não tem como ser validada.

**Se houve financiamento, também:** `instituicao` · `valor_financiado` · `taxa_mensal` · `prazo_meses` · `valor_parcela` · `data_primeira_parcela`

> A taxa mensal é o campo que mais será omitido e o mais valioso. Sem ela, não há cálculo de saldo devedor e o equity mining não existe. Torne-a bloqueante no formulário.

### 3.2 Implementação

- Formulário de fechamento no sistema interno com validação **bloqueante**, não aviso
- Consentimento LGPD coletado com assinatura eletrônica, canal por canal, no mesmo ato
- Rotina noturna que lista vendas com registro incompleto e notifica o vendedor responsável
- Indicador de completude por vendedor, visível e comparativo

### 3.3 Retroalimentação da base histórica

Antes de qualquer automação nova, rodar um mutirão sobre as vendas dos últimos 36 meses:

1. Extrair de contratos, notas e sistema o que existir
2. Cruzar com RevendaMais e com o CRM atual
3. O que faltar de financiamento: uma campanha simples de atualização cadastral com contrapartida (ex.: check-up gratuito na rede parceira) recupera boa parte
4. Meta realista: 60% da base histórica com dados suficientes para gatilho

---

## 4. Motor de gatilhos (n8n)

Um workflow orquestrador diário, com sub-workflows por tipo de gatilho.

### 4.1 Workflow `CICLO_Orquestrador_Diario`

```
Cron 06:00 America/Sao_Paulo
  → REFRESH MATERIALIZED VIEW vw_ciclo_estado
  → Query de elegibilidade por gatilho (7 queries paralelas)
  → Merge + deduplicação por cliente
  → Filtro de frequência (§4.3)
  → Priorização (§4.4)
  → Split por canal
  → Evolution API / e-mail
  → INSERT em eventos_ciclo
```

### 4.2 Os sete gatilhos

| # | Gatilho | Condição | Antecedência | Ação |
|---|---|---|---|---|
| 1 | **Revisão programada** | KM estimado ≥ próxima faixa, ou 12 meses da última (§1.5) | KM −800 ou D−15 | Agendamento na oficina parceira mais próxima |
| 2 | **Renovação de seguro** | `seguro_vence_em` | D−45, D−15, D−3 | Cotação pela corretora parceira |
| 3 | **Garantia vencendo** | `garantia_fim` | D−60 | Oferta de renovação ou upgrade de plano |
| 4 | **IPVA / licenciamento** | Calendário PR por final de placa | D−30 | Serviço de despachante |
| 5 | **Equity mining** | `valor_mercado − saldo_devedor ≥ entrada_necessaria` | Contínuo | Oferta de troca com parcela equivalente |
| 6 | **Janela de recompra** | Dentro de `recompra_janela` e elegível | D−45 | Convite para exercer a recompra |
| 7 | **Elegibilidade em risco** | Revisão atrasada > 30 dias | Imediato | Alerta: "sua recompra está em risco" |

O gatilho 7 é o mais importante operacionalmente. É o que mantém a taxa de conformidade alta — e a conformidade é o que torna o passivo de recompra administrável.

> **v1.1:** o gatilho 1 dizia "6 meses da última" — prazo incompatível com o intervalo de 12 meses fixado no §1.5. Corrigido. O gatilho 7 já coincidia com a tolerância de 30 dias adotada e não mudou.

### 4.3 Regras de frequência (protege a base de queimar)

- Máximo **1 contato por cliente a cada 21 dias**, qualquer gatilho
- Exceção: gatilhos 6 e 7 podem quebrar a janela
- Nenhum contato entre 20h e 8h, nem aos domingos
- Três gatilhos consecutivos sem resposta → cliente entra em quarentena de 90 dias
- Opt-out honrado imediatamente e por canal

### 4.4 Priorização quando há colisão

Ordem: **7 → 6 → 5 → 2 → 3 → 1 → 4**

Risco de perda de elegibilidade vem antes de oportunidade de receita, sempre.

---

## 5. Fórmulas

### 5.1 Saldo devedor (Tabela Price)

```
n_pagas = meses decorridos desde data_primeira_parcela
n_rest  = prazo_meses - n_pagas

saldo = valor_parcela × [ 1 - (1 + i)^(-n_rest) ] / i
```

Onde `i` = `taxa_mensal` em decimal. É estimativa — o saldo real inclui encargos e eventuais atrasos. **Serve para priorizar contato, nunca para comunicar valor ao cliente.** Na conversa, sempre solicitar o boleto de quitação atualizado.

### 5.2 KM estimado

```
km_estimado = km_conhecido + (rodagem_mensal × meses_desde_ultimo_registro)
```

`rodagem_mensal` = média entre os dois últimos registros de manutenção. Sem histórico, usar 1.100 km/mês como padrão até a primeira revisão corrigir.

Cada passagem pela rede recalibra a estimativa. **É por isso que a revisão obrigatória vale mais do que a comissão que gera.**

**Fontes de `km_conhecido`, em ordem de precedência (v1.1):**

| Ordem | Fonte | Verificação |
|---|---|---|
| 1 | Revisão confirmada pela loja (verificada) | Etiqueta de óleo fotografada, KM legível |
| 2 | **KM de saída na compra** | Registrado pela loja na entrega (§3.1) |
| 3 | Vistoria de entrada ou de avaliação | Registro interno |
| 4 | Leitura declarada pelo cliente | Declarada, **não** verificada |

**A primeira notação de KM é sempre o KM de saída na compra.** O padrão de 1.100 km/mês vale só entre a entrega e a primeira revisão — a partir daí existem dois pontos reais para a média.

Toda exibição de KM ao cliente indica **a origem e a data**. KM declarado aparece como declarado; nunca com o mesmo peso de uma verificação.

### 5.3 Valor de mercado

Nunca FIPE pura. Construir:

```
valor_mercado = mediana(anúncios ativos do mesmo SKU em raio de 100 km)
                × fator_km
                × fator_estado
```

Alimentado por coleta dos portais, com fallback para FIPE ajustada por um delta histórico próprio por modelo.

### 5.4 Elegibilidade de equity mining

```
entrada_disponivel = valor_mercado − saldo_devedor − custo_transacao

Elegível se:
  entrada_disponivel ≥ entrada_minima_do_alvo
  E parcela_nova ≤ parcela_atual × 1,10
```

Só é oferta se **mantém a parcela**. Oferta que aumenta a parcela não é upgrade, é venda forçada — e queima o cliente.

### 5.5 Precificação da recompra

```
recompra_piso = valor_venda × fator_retencao(modelo, prazo) × fator_seguranca
recompra_teto = recompra_piso × 1,08
recompra_vigente = recompra_piso + (recompra_teto − recompra_piso) × (indice_total / 100)
```

`fator_retencao` **deve vir de série histórica própria** de depreciação por modelo. Enquanto ela não existir, o gatilho do §1.4 mantém a recompra desligada — não use estimativa de mercado como substituto.

`fator_seguranca` inicial de 0,93, ajustável para cima somente após 12 meses de dados próprios.

O **piso é contratual e nunca cai.** O índice só move o valor para cima dentro da faixa.

### 5.6 Índice Ciclo

**Enquanto não houver provedor de telemetria contratado (v1.1):**

```
indice_total = 50,00 × conformidade_revisao_pct
             + 31,25 × aderencia_km_pct
             + 18,75 × ausencia_sinistro
```

**Quando a telemetria existir, volta a valer a fórmula de quatro componentes:**

```
indice_total = 40 × conformidade_revisao_pct
             + 25 × aderencia_km_pct
             + 20 × score_conducao
             + 15 × ausencia_sinistro
```

Cada componente normalizado de 0 a 1. Calculado mensalmente, gravado em `indice_ciclo`.

> **v1.1 — por que os pesos de três componentes são esses.** São os pesos originais 40 / 25 / 15 divididos por 0,80: exatamente a **redistribuição proporcional** que a regra de neutralidade abaixo já manda fazer. A diferença é que aqui o componente não falta por recusa individual, e sim por ausência da fonte para toda a base.
>
> Dois efeitos, ambos obrigatórios: `score_conducao` grava **`NULL`, nunca `0`** — a série precisa distinguir "componente inexistente" de "nota zero", que é o que permitirá comparar períodos quando a telemetria entrar; e todo cliente fica matematicamente equivalente a um que recusou e teve o componente redistribuído, o que **preserva a regra de neutralidade por construção**.
>
> `aderencia_km_pct` passa a ser apurada sobre os pontos de KM do diário de bordo e das leituras declaradas — menor granularidade, mesma definição. A volta aos quatro componentes não exige nova emenda.

**Regra de neutralidade:** se `consentimento_conducao = false`, o componente de condução **não conta como zero — é redistribuído proporcionalmente entre os outros três.** Recusar telemetria de condução nunca pode reduzir o índice. É requisito de LGPD e é o que sustenta a promessa de marketing.

**Regra de piso:** `indice_total` nunca reduz o valor abaixo de `recompra_piso`. Se algum componente cai, o cliente perde apenas a parte que ainda não conquistou.

### 5.7 Conformidade de revisão (indicador de gatilho)

```
conformidade_revisao = veiculos_com_ultima_revisao_na_janela
                     / veiculos_com_ciclo_ativo_e_revisao_devida
```

Rodar diariamente, exibir em painel desde o dia 1. **É o número que destrava a Fase 2.**

**O que conta no numerador (v1.1):** só revisão com `confirmada_em` preenchido **e** `dentro_da_janela = true`. Registro feito pelo cliente e ainda sem verificação da loja **não conta** — é a transcrição literal do §1.4, que exige revisão "feita na rede dentro da janela contratada", e é o que neutraliza fraude: registrar não é o ativo, a verificação é.

**Gravar todo dia em `conformidade_diaria`, inclusive quando o denominador é zero** (com `pct = NULL`). Os primeiros meses de série serão honestamente vazios — a primeira revisão de um carro vendido hoje só vence daqui a meses. É exatamente o que se quer: a série começa no dia zero, e `serie_procedencia` (§1.4) só corre com registro ininterrupto.

### 5.8 Curva de posição de troca

Projeção mês a mês, para 12 meses à frente:

```
para m em 1..12:
  saldo(m)   = saldo_devedor projetado pela Price em t+m
  valor(m)   = valor_mercado × (1 − taxa_depreciacao_mensal(modelo))^m
             × ajuste_km_projetado
  posicao(m) = valor(m) − saldo(m) − custo_transacao
```

`data_ideal_troca` = o menor `m` em que `posicao(m) ≥ entrada_necessaria` para pelo menos um veículo do estoque na mesma faixa.

**Regra de recomendação:**

```
se posicao(0) >= entrada_necessaria           → "troque agora"
senão se existe m <= 12 com posicao(m) >= ...  → "espere m meses"
senão                                          → "ainda não é o momento"
```

A recomendação é calculada e **não pode ser sobrescrita comercialmente**. Quando for "espere", gravar `data_ideal_troca` e agendar o gatilho 5 para essa data.

---

## 6. O site (Next.js / React / Supabase)

### 6.1 Vitrine por posição de troca

Inverter a lógica de descoberta. Hoje o site mostra preço; o cliente compra parcela — e, se já é cliente, compra **diferença**.

**Visitante anônimo:**
- Filtro primário: "quanto cabe por mês", não faixa de preço
- Cada card exibe parcela estimada com premissas visíveis (entrada, prazo, taxa)
- Pré-aprovação opcional antes do atendimento, integrada às financeiras parceiras

**Cliente logado — a vitrine se reorganiza pela posição real dele:**

```
posicao_troca = valor_mercado(carro_do_cliente) − saldo_devedor − custo_transacao
```

Para cada veículo do estoque, calcular e exibir a lacuna:

| Situação | Rótulo no card |
|---|---|
| `posicao_troca ≥ entrada_necessaria` e `parcela_nova ≤ parcela_atual × 1,10` | **Cabe na sua troca** — parcela de R$ X |
| Falta entrada | **Faltam R$ 3.100** de entrada |
| Falta pouco tempo | **Em 4 meses, sem entrada** |
| Fora de alcance no horizonte | sem rótulo, exibido normalmente |

> **REGRA CRÍTICA DE UX: ordenar e rotular, nunca esconder.**
>
> A vitrine reordena por adequação, mas **todo o estoque permanece acessível** e "ver todo o estoque" fica sempre visível. Filtrar de fato é lido pelo cliente como "a loja está escondendo carro de mim" e destrói a confiança que o resto do produto tenta construir.

Isso também elimina o maior desperdício da operação: negociar quarenta minutos e perder na análise de crédito.

### 6.2 Selo Motors Ciclo na página do veículo

Bloco fixo, acima da dobra, com quatro linhas:

- Recompra garantida em 36 meses por **R$ X** (valor calculado, não faixa)
- Garantia estendida de N meses inclusa
- Revisões na rede parceira com preço travado
- "Você sabe hoje quanto vale na hora de trocar"

Não é selinho decorativo. É o argumento de venda principal, e precisa de peso visual compatível.

### 6.3 Área do cliente

Autenticada por **link mágico enviado por e-mail** (v1.1 — era OTP por telefone; a troca elimina fornecedor de SMS e custo por mensagem, e usa o Supabase Auth que o projeto já tem). Cinco blocos, nesta ordem de importância.

> A conta do cliente **nasce no fechamento da venda**, não no formulário de entrada: cadastro público fica fechado, e e-mail desconhecido não recebe link. WhatsApp segue sendo o canal de relacionamento (§7.3) — o e-mail é porta de entrada.

**A. Meu carro hoje**
- Índice Ciclo atual e o que move cada componente
- KM conhecido, com **origem e data** do dado (§5.2)
- Próxima revisão: quando abre a janela, quando fecha, e o KM previsto
- Elegibilidade de recompra: **verde, amarelo ou vermelho**, sempre com a ação que devolve ao verde
- Valor de recompra vigente e janela de exercício

**B. Minha posição de troca** *(o bloco mais valioso)*

```
valor_mercado − saldo_devedor_estimado = posicao_troca
```

Exibir os três números separados e a fonte de cada um. O saldo devedor é estimado (§5.1) e deve vir **sempre rotulado como estimativa**, com orientação para pedir o boleto de quitação atualizado.

**C. A curva — quando trocar**

Projeção de 12 meses da posição de troca, mês a mês. E uma recomendação explícita, que pode ser contrária à venda imediata:

```
Trocar hoje:      R$ 3.100 de entrada
Em 5 meses:       R$ 0, mesma parcela
Recomendação:     espere
```

> Esta é a funcionalidade mais diferenciada do produto. **A recomendação deve ser calculada, nunca ajustada comercialmente.** Se alguma vez o sistema disser "troque agora" quando a matemática diz "espere", o ativo de confiança inteiro é perdido — e ele não se reconstrói.
>
> Quando a recomendação for "espere", registrar `data_ideal_troca` e agendar o gatilho para essa data. A venda não é perdida: é agendada.

**D. Meus dados**

O cliente vê exatamente o que a Motors tem sobre ele, com chave liga/desliga por categoria:

| Categoria | Padrão | Efeito ao desligar |
|---|---|---|
| Localização (rastreamento) | opt-in | Perde recuperação em caso de roubo |
| Telemetria de condução | opt-in | Componente redistribuído (§5.6) — **nunca penaliza** |
| **Registro de KM entre revisões** | opt-in | Deixa de receber o lembrete mensal. A estimativa do §5.2 fica menos precisa — **nunca penaliza** |
| Histórico de manutenção | sempre ativo | Necessário para elegibilidade |
| Comunicação por WhatsApp / e-mail | opt-in por canal | Deixa de receber avisos daquele canal |

> **v1.1:** enquanto não houver provedor contratado, as duas primeiras linhas não aparecem para o cliente — chave que não liga nada é ruído, e sugere um rastreamento que não existe.

Botão de exportar tudo em PDF. **Transforma obrigação de LGPD em prova de que não há nada escondido** — e é o antídoto direto à única objeção séria contra a telemetria.

**E. Documentação e histórico**
- Contrato do Ciclo, contrato de recompra, apólice, termo de garantia
- Documentos da negociação original: nota fiscal, ATPV-e, comprovantes
- Histórico completo de manutenção, exportável em PDF **e compartilhável** — o cliente pode usar para revender por conta própria, e isso é bom: aumenta o valor percebido do programa e não custa nada
- Vencimentos: seguro, garantia, IPVA, licenciamento

A área do cliente é o que transforma o contrato de papel em relacionamento vivo. Sem ela, o Ciclo vira uma cláusula esquecida na gaveta.

### 6.4 Veículos com procedência Motors

Carros que retornam pela recompra ganham selo próprio na vitrine, com histórico de manutenção publicado. **É o único estoque do mercado com procedência auditável.** Precifique acima e comunique o porquê.

---

## 7. Comunicação e automação

### 7.1 Arquitetura

```
n8n (orquestração)
 ├── Supabase (estado e log)
 ├── Evolution API (WhatsApp)
 ├── Typebot (agendamento e qualificação)
 └── Chatwoot (escalonamento humano)
```

### 7.2 Princípios de mensagem

- Sempre com dado específico: "seu Onix branco, placa ABC-1234, está em 47 mil km" — nunca genérico
- Uma pergunta por mensagem, uma ação por mensagem
- Toda mensagem oferece saída explícita
- Escalonamento para humano em duas condições: cliente pede, ou intenção de compra detectada

### 7.3 Cadências

| Gatilho | Sequência |
|---|---|
| Revisão | D−15 · D−3 · D+7 se não agendou · encerra |
| Seguro | D−45 · D−15 · D−3 · encerra |
| Equity mining | Abordagem · D+3 se abriu e não respondeu · D+10 último · quarentena 180 dias |
| Elegibilidade em risco | Imediato · D+7 · D+21 · marca `em_risco` |

---

## 8. Tracking e atribuição

Estender o `TRACKING_SPEC.md` existente com os eventos do ciclo. Cada um vai para Meta CAPI e Google Enhanced Conversions com valor atribuído:

| Evento | Valor |
|---|---|
| `ciclo_adesao` | Valor do plano contratado |
| `revisao_agendada` | Comissão prevista |
| `revisao_concluida` | Comissão realizada |
| `seguro_renovado` | Comissão da corretora |
| `recompra_exercida` | Margem do carro recomprado |
| `troca_equity_mining` | Margem da nova venda + F&I |

**Por que importa:** hoje a Motors otimiza campanha para lead. Alimentando as plataformas com o valor de ciclo de vida, elas passam a otimizar para o cliente que vale R$ 18 mil em três anos, não para o clique mais barato. É a única forma de o algoritmo aprender o que realmente vale.

---

## 9. Métricas

### 9.1 Painel semanal

| Indicador | Meta Fase 1 |
|---|---|
| Completude de registro nas vendas novas | ≥ 80% |
| Taxa de adesão ao Ciclo | ≥ 35% |
| Conformidade de revisão (em dia) | ≥ 70% |
| Resposta aos gatilhos | ≥ 15% |
| Receita de serviços / EBITDA | acompanhar |

### 9.2 Painel mensal

- Receita por cliente acumulada, por safra de venda
- Taxa de recompra da base, anualizada
- Retenção em 12 / 24 / 36 meses
- Exposição agregada de recompra vs. teto aprovado
- Margem realizada nos carros que retornaram vs. estoque comprado no mercado

> **Comece a medir hoje, mesmo com número ruim.** Série histórica de 24 meses é o que dá valor a esses indicadores numa mesa de negociação. Sem histórico, eles não valem nada.

---

## 10. LGPD e governança

- Consentimento granular por canal, coletado no ato da venda, revogável e registrado com timestamp
- Base legal: execução de contrato para o que decorre do Ciclo; consentimento para o que é oferta comercial
- Dado de manutenção compartilhado com o parceiro apenas na medida da execução do serviço
- **Contrato com cada parceiro contendo cláusula de propriedade do dado pela Motors.** Sem isso, a rede acumula o ativo e a Motors só paga por ele
- Retenção e política de descarte definidas
- Segregação de CNPJ (revenda / serviços / dados) refletida também na separação lógica dos dados

---

## 11. Ordem de implementação

**Não pule etapas. Cada uma depende da anterior.**

### Bloco A — Fundação *(liberado para desenvolvimento imediato)*

1. Schema no Supabase e view de estado
2. Formulário de venda com validação bloqueante — *nada funciona sem isto*
3. Mutirão de retroalimentação da base histórica
4. **Diário de bordo do cliente e fila de verificação** — é a fonte do dado de conformidade
5. **Painel de conformidade de revisão** — o indicador de gatilho, no ar desde o começo
6. Gatilhos 1, 2 e 4 (revisão, seguro, IPVA) — os mais simples e os que reabrem o canal
7. Cálculo mensal do Índice Ciclo, com consentimento granular
8. Área do cliente completa — índice, próxima revisão e histórico exportável
9. Gatilho 5 (equity mining) — o primeiro que gera venda
10. Contratos de garantia e plano de manutenção
11. Vitrine por parcela
12. Eventos de ciclo no CAPI e Enhanced Conversions
— **Adiado, sem data:** integração com provedor de rastreamento e ingestão de `telemetria_resumo`

> **v1.1 — o que mudou de ordem e por quê.** A integração de telemetria saiu da fila (nenhum provedor contratado) e a **diário de bordo subiu para o 4º lugar**: sem ela não existe fonte de conformidade, e conformidade é o que o passo 5 mede e o que o §1.4 exige. Antes do passo 1, um pré-requisito de segurança que já foi executado em 2026-08-13: separar o público do cliente do público da equipe no Auth, porque os dois dividem o mesmo pool de usuários.

### Bloco B — Recompra *(bloqueado até o gatilho do §1.4 abrir)*

> **Não iniciar desenvolvimento antes da condição ser atingida.** Construir a interface de recompra antes da hora cria pressão organizacional para ligá-la antes de o dado sustentar.

13. Cálculo do `fator_retencao` sobre série própria de depreciação
14. Módulo de precificação com piso, teto e faixa do índice
15. Contrato eletrônico de recompra e provisionamento contábil
16. Selo de recompra na vitrine e na ficha do veículo
17. Gatilhos 6 e 7 (janela de recompra e elegibilidade em risco)
18. Painel de exposição agregada vs. teto aprovado

---

## Anexo — Perguntas a fechar antes do desenvolvimento

1. Percentual de recompra por faixa de modelo e prazo — quem define e com base em qual série?
2. Teto de exposição agregada de recompra aprovado pela diretoria
3. Modelo de provisionamento contábil do passivo de recompra
4. Divisão de comissão com cada tipo de parceiro, formalizada
5. Estrutura societária: quando o CNPJ de serviços é constituído?
6. Quem é o dono operacional do programa? (Sem um nome, isso vira projeto de todo mundo e de ninguém.)

**Acrescentadas na v1.1:**

7. Intervalos de revisão acordados com a rede parceira — hoje o §1.5 usa a prática publicada das montadoras como referência, e ela deve ser substituída pelo contrato quando existir.
8. Quando contratar provedor de rastreamento? A telemetria não bloqueia mais o programa, mas os pesos do §5.6 e a tabela do §6.3-D voltam a mudar quando ela entrar.

**Fechadas na v1.1** (registro em `EMENDA_01_MANUAL_CICLO.md`): quem valida a revisão — **Comercial ou Administrador**, com o Comercial como dono da fila de verificação e o Administrador como revisor. É arranjo **transitório**: a resposta definitiva depende da pergunta 6, e a estrutura correta é um papel de pós-venda próprio, dono da fila, dos lembretes e do relacionamento durante os 36 meses.
