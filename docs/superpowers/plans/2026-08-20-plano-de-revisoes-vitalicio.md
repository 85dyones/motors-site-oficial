# Plano de revisões vitalício — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o plano fixo de três revisões por geração sob demanda, para que a Garagem Motors tenha cronograma enquanto o carro for do cliente.

**Architecture:** Uma função de banco, `abrir_proxima_janela`, passa a ser a única que conhece a régua do §1.5; ela abre **uma** janela por vez, ancorada no último fato real (a última revisão confirmada, ou a venda). Três chamadores a acionam: o fechamento da venda, o carimbo da revisão e um cron diário de rede de segurança. Uma coluna nova, `veiculos_vendidos.saiu_em`, dá fim ao vitalício e desliga gerador, gatilhos e escrita do cliente de uma vez.

**Tech Stack:** Postgres 15 / Supabase (plpgsql, pg_cron, RLS), Next.js 16 / React / TypeScript, Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-20-plano-de-revisoes-vitalicio-design.md`](../specs/2026-08-20-plano-de-revisoes-vitalicio-design.md)

## Global Constraints

- **Migrações são versionadas** em `supabase/migrations/`. Nunca alterar schema pelo painel do Supabase.
- **Ensaio antes de gravar.** `node supabase/manutencao/aplicar-migracao.js <arquivo>` roda a migração inteira contra a produção numa transação e reverte. O `--gravar` **só com aprovação explícita do dono** — nenhuma tarefa deste plano executa `--gravar`.
- **RLS obrigatório** em toda tabela com dado de cliente. Nenhuma policy é afrouxada aqui.
- **Não inventar número.** Os únicos números deste plano são os do manual §1.5, já em produção: `10000` km, `12` meses, `30` dias, `1000` km.
- **Português** em código, nomes de coluna, comentários e commits.
- **Recompra não é tocada.** Regra 5 do CLAUDE.md; o gatilho do §1.4 não abriu.
- **Toda migração termina com o rodapé de auto-registro** no livro-razão (`supabase_migrations.schema_migrations`), na mesma transação.
- **Não redigitar função de memória.** `fechar_venda_ciclo`, `carimbar_revisao` e `montar_fila_de_gatilhos` são copiadas do arquivo vivo e editadas cirurgicamente.
- Rodar testes com `npm test` (Vitest). Não há script de typecheck isolado: usar `npx tsc --noEmit`.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260820120000_plano_de_revisoes_vitalicio.sql` | **Criar.** Schema, gerador, três chamadores, duas policies, cron, autoconferências, rodapé |
| `src/lib/ciclo/vendaFechamento.ts` | **Modificar.** `REVISOES_NO_CONTRATO` sai; `planoDeRevisoes` vira `projetarRevisoes` |
| `tests/ciclo-venda-fechamento.test.ts` | **Modificar.** Passa a localizar a migração viva em vez de abri-la por nome |
| `src/lib/ciclo/selo.ts` | **Criar.** `seloDaJanela` — os três estados de `dentro_da_janela` |
| `src/lib/ciclo/saida.ts` | **Criar.** `validarSaida` — a régua da saída, espelho do CHECK do banco |
| `src/components/admin/FilaDeVerificacao.tsx` | **Modificar.** Três estados do selo, duas mensagens e o controle de saída |
| `tests/ciclo-selo-da-janela.test.ts` | **Criar.** Os três estados, e que `null` nunca vira "fora" |
| `tests/ciclo-saida-da-garagem.test.ts` | **Criar.** Validação da saída e o gate da rota |
| `src/components/admin/FechamentoDeVenda.tsx` | **Modificar.** Prévia mostra a janela que será criada |
| `src/app/garagem/page.tsx` | **Modificar.** `saiu_em` na query |
| `src/components/garagem/GaragemVeiculo.tsx` | **Modificar.** Bloco PRÓXIMA REVISÃO trata veículo encerrado |
| `src/app/api/ciclo/veiculos/[id]/saida/route.ts` | **Criar.** Rota de staff que marca a saída |
| `supabase/seeds/ciclo_dev.sql` | **Modificar.** Uma janela por veículo, pelo gerador |

**Fonte de cada função a copiar:**
- `fechar_venda_ciclo` → `supabase/migrations/20260817140000_documento_do_estoque_e_cep.sql:58-253`
- `carimbar_revisao` → `supabase/migrations/20260814180000_motor_de_gatilhos.sql:65-172`
- `montar_fila_de_gatilhos` → `supabase/migrations/20260814180000_motor_de_gatilhos.sql:259-...` (até o `$$;` que a fecha)

---

### Task 1: Migração — estado terminal e o gerador

**Files:**
- Create: `supabase/migrations/20260820120000_plano_de_revisoes_vitalicio.sql`

**Interfaces:**
- Consumes: nada.
- Produces: coluna `veiculos_vendidos.saiu_em date`, coluna `veiculos_vendidos.motivo_saida text`, constraint `veiculos_vendidos_saida_com_motivo`, função `public.abrir_proxima_janela(p_vv uuid) returns uuid` (devolve o id da janela criada, ou `null` quando não havia o que criar).

- [ ] **Step 1: Criar o arquivo com o cabeçalho e a autoconferência que ainda falha**

O teste vem primeiro: a autoconferência chama uma função que não existe.

```sql
-- ==========================================================
-- O plano de revisões deixa de secar na terceira (D2)
-- ==========================================================
--
-- `fechar_venda_ciclo` gravava `generate_series(1, 3)`: exatamente três
-- revisões, 30.000 km ou três anos. O dono confirmou em 2026-08-20 que a
-- Garagem Motors é vitalícia por força de expressão, **até a próxima venda do
-- carro**. Da quarta revisão em diante o plano ficava sem linha — e sem linha:
--
--   * `carimbar_revisao` marcava a revisão CERTA como `dentro_da_janela =
--     false`, punindo o cliente pela ausência de uma linha que o sistema
--     deveria ter criado;
--   * `montar_fila_de_gatilhos` perdia `revisao_programada` e
--     `elegibilidade_em_risco`, porque monta as janelas por INNER JOIN;
--   * a conformidade do §5.7 passava a contar o veículo como "em dia" para
--     sempre, inflando o indicador que guarda o gatilho do §1.4.
--
-- A correção não é uma série maior — seria inventar número, e continuaria
-- finita. É geração sob demanda: uma janela por vez, ancorada no último fato
-- real. É também a reprojeção que o §1.5 promete ("reprojetado a cada revisão
-- confirmada") e que nunca foi escrita.
--
-- Desenho: docs/superpowers/specs/2026-08-20-plano-de-revisoes-vitalicio-design.md
-- ==========================================================


-- ---------------------------------------------------------------------------
-- Autoconferência 1 — o gerador
-- ---------------------------------------------------------------------------
do $ac$
declare
  v_cli uuid;
  v_vv  uuid;
  v_j   uuid;
  j     record;
begin
  insert into public.clientes (cpf_cnpj, nome, telefone_e164, email)
  values ('AC-D2-GERADOR', 'Autoconferência D2', '+554199990002',
          'ac-d2-gerador@exemplo.invalido')
  returning id into v_cli;

  insert into public.veiculos_vendidos
    (cliente_id, chassi, placa, marca, modelo, ano_fabricacao, ano_modelo,
     data_venda, km_na_venda, valor_venda, aderiu_ciclo)
  values (v_cli, 'AUTOCONF-D2-GERADOR', 'ACD0A01', 'Volkswagen', 'Gol',
          2020, 2021, (current_date - interval '1 day')::date, 40000, 50000, true)
  returning id into v_vv;

  -- 1. a primeira janela nasce do marco da venda
  v_j := public.abrir_proxima_janela(v_vv);
  if v_j is null then
    raise exception 'ACEITE FALHOU: não abriu a primeira janela';
  end if;

  select * into j from public.plano_revisoes where id = v_j;
  if j.numero_revisao <> 1 then
    raise exception 'ACEITE FALHOU: a primeira janela saiu como nº %', j.numero_revisao;
  end if;
  if j.km_previsto <> 50000 then
    raise exception 'ACEITE FALHOU: km_previsto saiu % (esperado 40000 + 10000)', j.km_previsto;
  end if;
  if j.janela_fim - j.janela_inicio <> 60 then
    raise exception 'ACEITE FALHOU: a janela tem % dias (esperado 60)',
      j.janela_fim - j.janela_inicio;
  end if;

  -- 2. um veículo tem no máximo UMA janela aberta
  if public.abrir_proxima_janela(v_vv) is not null then
    raise exception 'ACEITE FALHOU: abriu segunda janela com a primeira em aberto';
  end if;

  -- 3. veículo que saiu da Garagem não ganha janela
  delete from public.plano_revisoes where veiculo_vendido_id = v_vv;
  update public.veiculos_vendidos
     set saiu_em = current_date, motivo_saida = 'revendido'
   where id = v_vv;
  if public.abrir_proxima_janela(v_vv) is not null then
    raise exception 'ACEITE FALHOU: veículo com saiu_em ganhou janela';
  end if;

  -- 4. saída sem motivo não passa. `begin/exception` porque plpgsql não tem
  --    SAVEPOINT; as variáveis do bloco sobrevivem ao rollback interno.
  begin
    update public.veiculos_vendidos
       set saiu_em = current_date, motivo_saida = null
     where id = v_vv;
    raise exception 'ACEITE FALHOU: aceitou saiu_em sem motivo';
  exception when check_violation then
    null;
  end;

  delete from public.plano_revisoes    where veiculo_vendido_id = v_vv;
  delete from public.veiculos_vendidos where id = v_vv;
  delete from public.clientes          where id = v_cli;

  raise notice 'Autoconferência D2/gerador: OK.';
end $ac$;
```

- [ ] **Step 2: Rodar o ensaio e confirmar que falha**

```bash
node supabase/manutencao/aplicar-migracao.js supabase/migrations/20260820120000_plano_de_revisoes_vitalicio.sql
```

Esperado: `FALHOU (revertida)` com mensagem contendo `function public.abrir_proxima_janela(uuid) does not exist`.

- [ ] **Step 3: Escrever o estado terminal e o gerador**

Inserir **antes** do bloco de autoconferência, logo depois do cabeçalho:

```sql
-- ---------------------------------------------------------------------------
-- 1. O fim do vitalício: "até a próxima venda do carro"
-- ---------------------------------------------------------------------------
-- Sem isto, um plano que se regenera para sempre continua lembrando de revisão
-- quem já vendeu o carro. `contratos_ciclo.status_elegibilidade = 'perdida'`
-- NÃO serve: é elegibilidade de recompra, não o carro deixar de ser do cliente.
--
-- Sem lista fechada de motivos, de propósito: fixá-la agora seria inventar o
-- vocabulário do negócio antes de a loja ter visto um caso.

alter table public.veiculos_vendidos
  add column if not exists saiu_em      date,
  add column if not exists motivo_saida text;

comment on column public.veiculos_vendidos.saiu_em is
  'Data em que o carro deixou de ser do cliente. Preenchida, desliga o gerador '
  'de janelas, os quatro gatilhos e a escrita do cliente no diário de bordo — '
  'a LEITURA do histórico continua, porque o dado é dele.';

comment on column public.veiculos_vendidos.motivo_saida is
  'Texto livre, obrigatório quando há saiu_em. Sem lista fechada enquanto a '
  'loja não tiver visto os casos reais.';

alter table public.veiculos_vendidos
  drop constraint if exists veiculos_vendidos_saida_com_motivo;
alter table public.veiculos_vendidos
  add constraint veiculos_vendidos_saida_com_motivo
  check (saiu_em is null or coalesce(trim(motivo_saida), '') <> '');


-- ---------------------------------------------------------------------------
-- 2. O gerador — a única função que conhece a régua do §1.5
-- ---------------------------------------------------------------------------
-- Quando o plano por modelo existir (o dono mandou levantar as recomendações
-- de fabricante sob demanda, 2026-08-20), muda o CORPO desta função e mais
-- nada: nem o fechamento da venda, nem o carimbo, nem o cron precisam saber.

create or replace function public.abrir_proxima_janela(p_vv uuid)
  returns uuid
  language plpgsql
  set search_path = public
as $$
declare
  v          record;
  marco      record;
  v_data     date;
  v_km       int;
  v_numero   int;
  v_prevista date;
  v_id       uuid;
begin
  select saiu_em, data_venda, km_na_venda into v
    from public.veiculos_vendidos where id = p_vv;
  if not found or v.saiu_em is not null then
    return null;
  end if;

  -- Um veículo tem no máximo UMA janela aberta. Janela vencida e não cumprida
  -- CONTINUA sendo a janela aberta: não se abre a próxima por cima da anterior,
  -- ou quem atrasou ganharia prazo novo de graça.
  if exists (
        select 1 from public.plano_revisoes
         where veiculo_vendido_id = p_vv and manutencao_id is null) then
    return null;
  end if;

  -- O marco é o último fato real. A venda é o piso; a última revisão
  -- confirmada substitui, se houver.
  --
  -- ⚠️ `select ... into` sem linha ZERA o alvo. Por isso a leitura do marco vai
  -- para um record separado e só sobrescreve dentro do `if found` — atribuir
  -- direto perderia a venda em todo veículo sem revisão confirmada.
  v_data := v.data_venda;
  v_km   := v.km_na_venda;

  -- "Confirmada" é `confirmada_em is not null`, e só. Recusada nunca vira
  -- marco. Confirmada FORA da janela vira: ela aconteceu, e o KM que a prova
  -- atestou é o ponto real mais recente. `dentro_da_janela` mede conformidade,
  -- não existência — usá-la aqui puniria o atraso duas vezes.
  select m.data_servico, m.km_registrado into marco
    from public.manutencoes m
   where m.veiculo_vendido_id = p_vv
     and m.tipo = 'revisao_programada'
     and m.confirmada_em is not null
   order by m.data_servico desc, m.km_registrado desc
   limit 1;
  if found then
    v_data := marco.data_servico;
    v_km   := marco.km_registrado;
  end if;

  select coalesce(max(numero_revisao), 0) + 1 into v_numero
    from public.plano_revisoes where veiculo_vendido_id = p_vv;

  -- §1.5: 10.000 km ou 12 meses, o que ocorrer primeiro, tolerância de 30 dias.
  v_prevista := (v_data + interval '12 months')::date;

  insert into public.plano_revisoes
    (veiculo_vendido_id, numero_revisao, km_previsto, janela_inicio, janela_fim)
  values (
    p_vv,
    v_numero,
    v_km + 10000,
    (v_prevista - interval '30 days')::date,
    (v_prevista + interval '30 days')::date
  )
  on conflict (veiculo_vendido_id, numero_revisao) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.abrir_proxima_janela(uuid) is
  'Abre a PRÓXIMA janela de revisão do veículo, se couber: não faz nada se ele '
  'saiu da Garagem ou já tem janela aberta. Ancora no último fato real — a '
  'última revisão programada confirmada, ou a venda. É a régua do §1.5 num '
  'lugar só, e é o ponto de extensão do plano por modelo.';

-- Direitos de INVOCADOR, de propósito: a RLS de `plano_revisoes` já barra quem
-- não é staff, e o cron roda como dono da tabela. `authenticated` precisa do
-- execute porque `fechar_venda_ciclo` e `carimbar_revisao` são invoker-rights
-- e a chamada aninhada exige o privilégio de quem chamou.
revoke all on function public.abrir_proxima_janela(uuid) from public, anon;
grant execute on function public.abrir_proxima_janela(uuid) to authenticated, service_role;
```

- [ ] **Step 4: Rodar o ensaio e confirmar que passa**

```bash
node supabase/manutencao/aplicar-migracao.js supabase/migrations/20260820120000_plano_de_revisoes_vitalicio.sql
```

Esperado: `NOTICE: Autoconferência D2/gerador: OK.` seguido de `Ensaio OK (revertido)`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260820120000_plano_de_revisoes_vitalicio.sql
git commit -m "feat(ciclo): saiu_em e o gerador de janelas de revisao"
```

---

### Task 2: Migração — os três chamadores e as duas policies

**Files:**
- Modify: `supabase/migrations/20260820120000_plano_de_revisoes_vitalicio.sql`

**Interfaces:**
- Consumes: `public.abrir_proxima_janela(uuid)` da Task 1.
- Produces: `fechar_venda_ciclo(jsonb)` devolvendo `primeira_revisao` no lugar de `revisoes_previstas`; `carimbar_revisao(uuid, boolean, text)` gerando a próxima janela e devolvendo `dentro_da_janela = null` quando não há janela; `montar_fila_de_gatilhos` ignorando veículo com `saiu_em`.

- [ ] **Step 1: Escrever a autoconferência dos chamadores**

Inserir **depois** da autoconferência 1, ainda antes de qualquer outra coisa. Ela falha porque as três funções ainda são as antigas.

```sql
-- ---------------------------------------------------------------------------
-- Autoconferência 2 — os chamadores
-- ---------------------------------------------------------------------------
do $ac$
declare
  uid_staff uuid;
  r         jsonb;
  v_vv      uuid;
  v_cli     uuid;
  v_m       uuid;
  v_dentro  boolean;
  j         record;
  qtd       int;
  n         int;
  v_seg     timestamptz := '2026-08-17 09:00:00-03';  -- segunda, 9h: dentro do §4.3
begin
  select id into uid_staff from public.profiles
   where role in ('admin','comercial','financeiro','marketing') and is_active
   order by created_at limit 1;

if uid_staff is null then
  raise notice 'Autoconferência D2/chamadores PULADA: não há usuário de staff neste banco.';
else
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Venda de 13 anos atrás, para caber 12 revisões todas no passado.
  r := public.fechar_venda_ciclo(jsonb_build_object(
    'cpf_cnpj','AC-D2-CHAMADORES','nome','Cliente D2','telefone_e164','+554199990003',
    'email','ac-d2-chamadores@exemplo.invalido',
    'chassi','AUTOCONF-D2-CHAMADORES','placa','ACD0B02',
    'marca','Chevrolet','modelo','Onix','ano_fabricacao',2012,'ano_modelo',2013,
    'data_venda',(current_date - interval '13 years')::date,
    'km_na_venda',30000,'valor_venda',50000,
    'consentimento_lgpd',true,'aderiu_ciclo',true,
    'consentimento_canais', jsonb_build_object('whatsapp',true,'email',true,'sms',false)));
  v_vv  := (r->>'veiculo_vendido_id')::uuid;
  v_cli := (r->>'cliente_id')::uuid;

  -- 1. a venda cria UMA janela, número 1
  select count(*) into qtd from public.plano_revisoes where veiculo_vendido_id = v_vv;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: a venda criou % janelas (deveria ser 1)', qtd;
  end if;
  if (r->>'primeira_revisao')::int <> 1 then
    raise exception 'ACEITE FALHOU: retorno primeira_revisao = %', r->>'primeira_revisao';
  end if;

  -- 2. o plano NÃO SECA: doze revisões carimbadas, doze janelas novas
  for n in 1..12 loop
    insert into public.manutencoes
      (veiculo_vendido_id, tipo, data_servico, km_registrado, origem_registro,
       url_etiqueta_atual)
    values (v_vv, 'revisao_programada',
            (current_date - interval '13 years' + (n * interval '12 months'))::date,
            30000 + (n * 10000), 'loja', 'https://exemplo.invalido/etiqueta.jpg')
    returning id into v_m;
    perform public.carimbar_revisao(v_m, true, null);
  end loop;

  select count(*) into qtd from public.plano_revisoes where veiculo_vendido_id = v_vv;
  if qtd <> 13 then
    raise exception 'ACEITE FALHOU: depois de 12 revisões o plano tem % janelas (esperado 13)', qtd;
  end if;

  select * into j from public.plano_revisoes
   where veiculo_vendido_id = v_vv and manutencao_id is null;
  if j.numero_revisao <> 13 then
    raise exception 'ACEITE FALHOU: a janela aberta é a nº % (esperado 13)', j.numero_revisao;
  end if;

  -- 3. e ela é ancorada na 12ª revisão, não na venda
  if j.km_previsto <> 160000 then
    raise exception 'ACEITE FALHOU: a 13ª janela prevê % km (esperado 150000 + 10000)',
      j.km_previsto;
  end if;

  -- 4. recusa não gera janela nova, e a anterior segue aberta
  insert into public.manutencoes
    (veiculo_vendido_id, tipo, data_servico, km_registrado, origem_registro,
     url_etiqueta_atual)
  values (v_vv, 'revisao_programada', current_date, 165000, 'loja',
          'https://exemplo.invalido/etiqueta.jpg')
  returning id into v_m;
  perform public.carimbar_revisao(v_m, false, 'Etiqueta ilegível');

  select count(*) into qtd from public.plano_revisoes where veiculo_vendido_id = v_vv;
  if qtd <> 13 then
    raise exception 'ACEITE FALHOU: recusa gerou janela (plano ficou com %)', qtd;
  end if;

  -- 5. o gatilho fala do veículo ativo…
  set local role none;
  select count(*) into qtd
    from public.montar_fila_de_gatilhos(v_seg, false)
   where cliente_id = v_cli;
  if qtd = 0 then
    raise exception 'ACEITE FALHOU: veículo ativo com janela aberta não produziu gatilho';
  end if;

  -- …e cala quando o carro sai da Garagem
  update public.veiculos_vendidos
     set saiu_em = current_date, motivo_saida = 'revendido'
   where id = v_vv;
  select count(*) into qtd
    from public.montar_fila_de_gatilhos(v_seg, false)
   where cliente_id = v_cli;
  if qtd <> 0 then
    raise exception 'ACEITE FALHOU: veículo com saiu_em ainda produz % gatilho(s)', qtd;
  end if;

  -- 6. sem janela aberta, o carimbo não acusa atraso: null, nunca false
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;

  delete from public.plano_revisoes
   where veiculo_vendido_id = v_vv and manutencao_id is null;

  insert into public.manutencoes
    (veiculo_vendido_id, tipo, data_servico, km_registrado, origem_registro,
     url_etiqueta_atual)
  values (v_vv, 'revisao_programada', current_date, 170000, 'loja',
          'https://exemplo.invalido/etiqueta.jpg')
  returning id into v_m;
  perform public.carimbar_revisao(v_m, true, null);

  select dentro_da_janela into v_dentro from public.manutencoes where id = v_m;
  if v_dentro is not null then
    raise exception 'ACEITE FALHOU: revisão sem janela saiu dentro_da_janela = %', v_dentro;
  end if;

  set local role none;

  delete from public.eventos_ciclo     where veiculo_vendido_id = v_vv;
  delete from public.leituras_odometro where veiculo_vendido_id = v_vv;
  delete from public.plano_revisoes    where veiculo_vendido_id = v_vv;
  delete from public.manutencoes       where veiculo_vendido_id = v_vv;
  delete from public.contratos_ciclo   where veiculo_vendido_id = v_vv;
  delete from public.veiculos_vendidos where id = v_vv;
  delete from public.clientes          where id = v_cli;

  raise notice 'Autoconferência D2/chamadores: OK.';
end if;
end $ac$;


-- ---------------------------------------------------------------------------
-- Autoconferência 2b — as policies de escrita do cliente
-- ---------------------------------------------------------------------------
-- Fora do portão de staff, porque não depende de usuário nenhum.
--
-- ⚠️ Prova pela DEFINIÇÃO da policy, não pelo efeito. Exercer a regra exigiria
-- um usuário do Auth que NÃO fosse staff: as policies são OR, e a `_staff`
-- deixaria qualquer membro da equipe passar, tornando o teste vazio. Criar
-- usuário em `auth.users` dentro da migração é caro e frágil. O que esta
-- conferência garante é que a migração de fato reescreveu as duas policies com
-- o guarda — que é o que ela pode falhar em fazer.
do $ac$
declare
  qtd int;
begin
  select count(*) into qtd from pg_policies
   where schemaname = 'public'
     and policyname in ('manutencoes_cliente_registra', 'leituras_odometro_cliente_registra')
     and with_check like '%saiu_em%';
  if qtd <> 2 then
    raise exception 'ACEITE FALHOU: % de 2 policies de escrita do cliente olham saiu_em', qtd;
  end if;

  -- E as de LEITURA continuam sem o guarda: o ex-dono não perde o histórico.
  select count(*) into qtd from pg_policies
   where schemaname = 'public'
     and policyname in ('manutencoes_cliente_le', 'leituras_odometro_cliente_le')
     and coalesce(qual, '') like '%saiu_em%';
  if qtd <> 0 then
    raise exception 'ACEITE FALHOU: a saída tirou do cliente a leitura do próprio diário';
  end if;

  raise notice 'Autoconferência D2/policies: OK.';
end $ac$;
```

- [ ] **Step 2: Rodar o ensaio e confirmar que falha**

```bash
node supabase/manutencao/aplicar-migracao.js supabase/migrations/20260820120000_plano_de_revisoes_vitalicio.sql
```

Esperado: `FALHOU (revertida)` com `ACEITE FALHOU: a venda criou 3 janelas (deveria ser 1)`.

Se aparecer `Autoconferência D2/chamadores PULADA`, este banco não tem usuário de staff — pare e avise, porque a Task 2 fica sem prova.

- [ ] **Step 3: Copiar as três funções vivas para dentro da migração**

Não redigitar. Copiar os blocos inteiros, na ordem, para **antes** das autoconferências e **depois** do gerador da Task 1:

1. De `supabase/migrations/20260817140000_documento_do_estoque_e_cep.sql`, o trecho que começa em `create or replace function public.fechar_venda_ciclo(dados jsonb)` e termina na linha `grant execute on function public.fechar_venda_ciclo(jsonb) to authenticated, service_role;`.
2. De `supabase/migrations/20260814180000_motor_de_gatilhos.sql`, o trecho de `create or replace function public.carimbar_revisao(` até `grant execute on function public.carimbar_revisao(uuid, boolean, text) to authenticated, service_role;`.
3. Do mesmo arquivo, o trecho de `create or replace function public.montar_fila_de_gatilhos(` até o `$$;` que fecha a função, mais os `revoke`/`grant` que a seguem.

Copiar as funções **inteiras** também é o que mantém verdes os testes de `tests/ciclo-venda-fechamento.test.ts` que procuram `array_append(faltando, '<campo>')`: depois desta migração, é este arquivo que passa a ser a definição viva.

- [ ] **Step 4: Editar `fechar_venda_ciclo` — duas substituições**

Trocar este bloco:

```sql
  -- ---- o plano de revisões (§1.5): 10.000 km ou 12 meses, janela de 30 dias ----
  insert into public.plano_revisoes
    (veiculo_vendido_id, numero_revisao, km_previsto, janela_inicio, janela_fim)
  select
    v_veiculo,
    n,
    v_km + (n * 10000),
    (v_data + (n * interval '12 months') - interval '30 days')::date,
    (v_data + (n * interval '12 months') + interval '30 days')::date
  from generate_series(1, 3) as n;
```

por este:

```sql
  -- ---- a primeira janela de revisão (§1.5) ----
  -- UMA, não três. As seguintes nascem em `abrir_proxima_janela`, a cada
  -- revisão confirmada: a Garagem é vitalícia até a próxima venda do carro
  -- (dono, 2026-08-20), e série fixa secava no ano 3.
  perform public.abrir_proxima_janela(v_veiculo);
```

E trocar esta linha do `return`:

```sql
    'revisoes_previstas', 3
```

por:

```sql
    'primeira_revisao', (select numero_revisao from public.plano_revisoes
                          where veiculo_vendido_id = v_veiculo
                          order by numero_revisao limit 1)
```

- [ ] **Step 5: Editar `carimbar_revisao` — duas substituições**

Trocar:

```sql
    else
      v_dentro := false;
    end if;
```

por:

```sql
    else
      -- Sem janela não é "atrasou": é "não se aplica". `false` aqui acusava de
      -- fora da janela quem revisou certo num veículo cujo plano tinha secado
      -- — o defeito do D2. A conformidade do §5.7 já só conta `true`, então
      -- `null` não entra no numerador nem inventa atraso.
      v_dentro := null;
    end if;
```

E trocar:

```sql
  return jsonb_build_object(
    'resultado', 'carimbada',
```

por:

```sql
  -- A próxima janela nasce aqui, e é a ÚLTIMA coisa que a função faz. Se
  -- nascesse antes do bloco de elegibilidade acima, uma revisão lançada com
  -- `data_servico` antigo produziria janela já vencida, que bloquearia a volta
  -- de `em_risco` para `elegivel` — a promessa que a mensagem do §7.3 faz ao
  -- cliente. Se a janela nova nascer vencida, quem cuida dela é o gatilho 7
  -- amanhã, que é onde ela pertence.
  perform public.abrir_proxima_janela(m.veiculo_vendido_id);

  return jsonb_build_object(
    'resultado', 'carimbada',
```

- [ ] **Step 6: Editar `montar_fila_de_gatilhos` — uma substituição**

No CTE `veic`, trocar:

```sql
      from public.veiculos_vendidos vv
      join public.clientes c on c.id = vv.cliente_id
     where vv.aderiu_ciclo
```

por:

```sql
      from public.veiculos_vendidos vv
      join public.clientes c on c.id = vv.cliente_id
     where vv.aderiu_ciclo
       -- Carro que saiu da Garagem não recebe mais nada. Aqui corta os quatro
       -- gatilhos de uma vez, em vez de repetir a condição em cada um.
       and vv.saiu_em is null
```

- [ ] **Step 7: Escrever as duas policies de escrita do cliente**

Acrescentar depois das funções:

```sql
-- ---------------------------------------------------------------------------
-- 4. O ex-dono lê o diário, mas não escreve mais nele
-- ---------------------------------------------------------------------------
-- As policies de SELECT NÃO mudam: o histórico é dado do cliente, e o §6.3 não
-- prevê apagá-lo porque o carro trocou de mãos.

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
    -- E não escreve em carro que já saiu da Garagem.
    and not exists (
          select 1 from public.veiculos_vendidos vv
           where vv.id = veiculo_vendido_id and vv.saiu_em is not null)
  );

drop policy if exists leituras_odometro_cliente_registra on public.leituras_odometro;
create policy leituras_odometro_cliente_registra on public.leituras_odometro
  for insert to authenticated
  with check (
    public.e_veiculo_do_cliente(veiculo_vendido_id)
    and origem = 'cliente'
    and not exists (
          select 1 from public.veiculos_vendidos vv
           where vv.id = veiculo_vendido_id and vv.saiu_em is not null)
  );
```

- [ ] **Step 8: Rodar o ensaio e confirmar que passa**

```bash
node supabase/manutencao/aplicar-migracao.js supabase/migrations/20260820120000_plano_de_revisoes_vitalicio.sql
```

Esperado: `NOTICE: Autoconferência D2/gerador: OK.`, `NOTICE: Autoconferência D2/chamadores: OK.`, `NOTICE: Autoconferência D2/policies: OK.`, `Ensaio OK (revertido)`.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260820120000_plano_de_revisoes_vitalicio.sql
git commit -m "feat(ciclo): venda, carimbo e gatilhos passam pelo gerador de janelas"
```

---

### Task 3: Migração — o cron e o rodapé

**Files:**
- Modify: `supabase/migrations/20260820120000_plano_de_revisoes_vitalicio.sql`

**Interfaces:**
- Consumes: `public.abrir_proxima_janela(uuid)` da Task 1.
- Produces: `public.rodar_abertura_de_janelas() returns jsonb` (chave `abertas`, int) e o job `abertura-de-janelas` no `cron.job`.

- [ ] **Step 1: Escrever a autoconferência do cron**

Acrescentar depois da autoconferência 2:

```sql
-- ---------------------------------------------------------------------------
-- Autoconferência 3 — a rede de segurança
-- ---------------------------------------------------------------------------
do $ac$
declare
  v_cli uuid;
  v_vv  uuid;
  qtd   int;
  v_job record;
begin
  insert into public.clientes (cpf_cnpj, nome, telefone_e164, email)
  values ('AC-D2-CRON', 'Autoconferência D2 cron', '+554199990004',
          'ac-d2-cron@exemplo.invalido')
  returning id into v_cli;

  insert into public.veiculos_vendidos
    (cliente_id, chassi, placa, marca, modelo, ano_fabricacao, ano_modelo,
     data_venda, km_na_venda, valor_venda, aderiu_ciclo)
  values (v_cli, 'AUTOCONF-D2-CRON', 'ACD0C03', 'Ford', 'Ka',
          2019, 2020, (current_date - interval '2 days')::date, 25000, 40000, true)
  returning id into v_vv;

  -- Veículo sem janela nenhuma — o caso que a rede de segurança existe para
  -- cobrir: importação, venda antiga, qualquer caminho fora dos dois primeiros.
  perform public.rodar_abertura_de_janelas();

  select count(*) into qtd
    from public.plano_revisoes where veiculo_vendido_id = v_vv;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: o cron abriu % janelas para veículo sem plano', qtd;
  end if;

  -- Rodar de novo não duplica.
  perform public.rodar_abertura_de_janelas();
  select count(*) into qtd
    from public.plano_revisoes where veiculo_vendido_id = v_vv;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: o cron duplicou janela (ficaram %)', qtd;
  end if;

  -- Veículo que saiu não entra na varredura.
  delete from public.plano_revisoes where veiculo_vendido_id = v_vv;
  update public.veiculos_vendidos
     set saiu_em = current_date, motivo_saida = 'perda total'
   where id = v_vv;
  perform public.rodar_abertura_de_janelas();
  select count(*) into qtd
    from public.plano_revisoes where veiculo_vendido_id = v_vv;
  if qtd <> 0 then
    raise exception 'ACEITE FALHOU: o cron abriu janela para veículo com saiu_em';
  end if;

  -- O job existe, está ativo e com o agendamento esperado.
  select * into v_job from cron.job where jobname = 'abertura-de-janelas';
  if not found then
    raise exception 'ACEITE FALHOU: o job abertura-de-janelas não foi agendado';
  end if;
  if v_job.schedule <> '0 3 * * *' then
    raise exception 'ACEITE FALHOU: o agendamento saiu "%"', v_job.schedule;
  end if;
  if not v_job.active then
    raise exception 'ACEITE FALHOU: o job nasceu inativo';
  end if;

  delete from public.plano_revisoes    where veiculo_vendido_id = v_vv;
  delete from public.leituras_odometro where veiculo_vendido_id = v_vv;
  delete from public.veiculos_vendidos where id = v_vv;
  delete from public.clientes          where id = v_cli;

  raise notice 'Autoconferência D2/cron: OK.';
end $ac$;
```

- [ ] **Step 2: Rodar o ensaio e confirmar que falha**

```bash
node supabase/manutencao/aplicar-migracao.js supabase/migrations/20260820120000_plano_de_revisoes_vitalicio.sql
```

Esperado: `FALHOU (revertida)` com `function public.rodar_abertura_de_janelas() does not exist`.

- [ ] **Step 3: Escrever o portão de serviço e o agendamento**

Acrescentar depois das policies da Task 2, antes das autoconferências:

```sql
-- ---------------------------------------------------------------------------
-- 5. A rede de segurança
-- ---------------------------------------------------------------------------
-- Os dois primeiros chamadores cobrem o caminho feliz. Este cobre o resto:
-- veículo importado, venda registrada por fora, janela apagada à mão. Como
-- `abrir_proxima_janela` já recusa quem tem janela aberta, rodar todo dia é
-- barato e idempotente.

create or replace function public.rodar_abertura_de_janelas()
  returns jsonb
  language plpgsql
  set search_path = public
  set timezone = 'America/Sao_Paulo'
as $$
declare
  v_vv    uuid;
  abertas int := 0;
begin
  perform set_config('request.jwt.claims', '', true);

  for v_vv in
    select vv.id
      from public.veiculos_vendidos vv
     where vv.saiu_em is null
       and not exists (
             select 1 from public.plano_revisoes pr
              where pr.veiculo_vendido_id = vv.id and pr.manutencao_id is null)
  loop
    if public.abrir_proxima_janela(v_vv) is not null then
      abertas := abertas + 1;
    end if;
  end loop;

  return jsonb_build_object('abertas', abertas);
end;
$$;

comment on function public.rodar_abertura_de_janelas() is
  'Ponto de entrada do pg_cron para o plano vitalício. Fixa o fuso de Curitiba '
  'e se apresenta como chamador sem JWT. É um portão que pula a checagem de '
  'staff: NUNCA conceder execute a authenticated ou anon.';

revoke all on function public.rodar_abertura_de_janelas() from public, anon, authenticated;
grant execute on function public.rodar_abertura_de_janelas() to service_role;

-- `0 3 * * *` em UTC = **meia-noite em Curitiba**, logo depois de a
-- conformidade fechar o dia às 23h30 (`conformidade-diaria`, '30 2 * * *').
-- A ordem importa: janela aberta hoje entra na série de amanhã e nunca altera
-- um dia já gravado. `cron.schedule` com nome existente ATUALIZA o
-- agendamento, então reaplicar esta migração não duplica job.
select cron.schedule(
  'abertura-de-janelas',
  '0 3 * * *',
  $cron$select public.rodar_abertura_de_janelas();$cron$
);
```

- [ ] **Step 4: Escrever o rodapé do livro-razão**

No fim absoluto do arquivo, depois de todas as autoconferências:

```sql
-- ---------------------------------------------------------------------------
-- Registro no livro-razão. Nenhuma migração se registra sozinha: quem aplica
-- por psql/pg precisa deste rodapé, senão a versão fica invisível para o
-- `supabase db push` e para a conferência. Ver supabase/README.md.
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260820120000', 'plano_de_revisoes_vitalicio')
  on conflict (version) do nothing;
```

- [ ] **Step 5: Rodar o ensaio completo**

```bash
node supabase/manutencao/aplicar-migracao.js supabase/migrations/20260820120000_plano_de_revisoes_vitalicio.sql
```

Esperado, nesta ordem, CINCO notices: `Autoconferência D2/gerador: OK.`, `Autoconferência D2/chamadores: OK.`, `Autoconferência D2/policies: OK.`, `Autoconferência D2/cron: OK.`, `Autoconferência D2/nada-se-perdeu: OK.`, `Ensaio OK (revertido)`.

**Não rodar `--gravar`.** Gravar exige aprovação explícita do dono.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260820120000_plano_de_revisoes_vitalicio.sql
git commit -m "feat(ciclo): cron diario abre janela para veiculo sem plano"
```

---

### Task 4: A camada TypeScript e o teste que acha a migração viva

**Files:**
- Modify: `src/lib/ciclo/vendaFechamento.ts:248-305`
- Modify: `src/components/admin/FechamentoDeVenda.tsx:6`, `:242` (só o rename — o texto da tela é da Task 6)
- Test: `tests/ciclo-venda-fechamento.test.ts`

**Interfaces:**
- Consumes: a migração da Task 2 (o teste procura `perform public.abrir_proxima_janela(v_veiculo)` nela).
- Produces: `projetarRevisoes(marcoData: string, marcoKm: number, quantidade?: number): RevisaoPrevista[]` — projeção pura, `quantidade` default `1`. `REVISOES_NO_CONTRATO` deixa de ser exportado. `INTERVALO_KM`, `INTERVALO_MESES`, `TOLERANCIA_DIAS`, `TOLERANCIA_KM` e o tipo `RevisaoPrevista` permanecem.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/ciclo-venda-fechamento.test.ts`, trocar o import do topo:

```ts
import { readFileSync, readdirSync } from "node:fs";
```

Trocar a leitura fixa da migração:

```ts
const migracao = readFileSync(
  join(raiz, "supabase", "migrations", "20260814120000_fechar_venda_ciclo.sql"),
  "utf-8",
);
```

por uma busca pela definição viva:

```ts
/**
 * A migração VIVA de uma função, não o arquivo que tem o nome dela.
 *
 * `fechar_venda_ciclo` já foi redefinida por `create or replace` em migrações
 * cujo nome não a menciona. Este teste abria a de 2026-08-14 por nome e passou
 * três dias verde validando código morto — exatamente o que ele existe para
 * impedir. Quem procura pela definição não erra de novo.
 */
function migracaoViva(funcao: string): string {
  const dir = join(raiz, "supabase", "migrations");
  const encontradas = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf-8"))
    .filter((texto) => texto.includes(`create or replace function public.${funcao}(`));
  if (encontradas.length === 0) {
    throw new Error(`nenhuma migração define ${funcao}`);
  }
  return encontradas[encontradas.length - 1];
}

const migracao = migracaoViva("fechar_venda_ciclo");
const gerador = migracaoViva("abrir_proxima_janela");

/**
 * A migração da FUNDAÇÃO do fechamento de venda — lida por nome, de propósito.
 *
 * O `describe("a autoconferência do aceite, na migração")`, mais abaixo neste
 * arquivo, não fala da função viva: fala de uma migração específica que provou
 * a si mesma no dia em que foi aplicada. Esse texto é histórico e não muda
 * mais. Apontá-lo para `migracaoViva` o faria perseguir o `create or replace`
 * mais recente e cobrar dele uma autoconferência que ele não tem.
 *
 * A regra que separa as duas fontes: se a asserção é sobre o que o banco FAZ
 * hoje, use `migracaoViva`. Se é sobre o que uma migração PROVOU quando rodou,
 * leia o arquivo dela pelo nome.
 */
const migracaoDaFundacao = readFileSync(
  join(raiz, "supabase", "migrations", "20260814120000_fechar_venda_ciclo.sql"),
  "utf-8",
);
```

No `describe("a autoconferência do aceite, na migração")` (e **só** nele), trocar as três ocorrências de `migracao` por `migracaoDaFundacao`. E acrescentar, dentro do `it("confere o grafo inteiro da venda que fecha")`, um aviso de duas linhas de que o `"esperava 3"` ali é o comportamento **antigo**, provado à época, e que a régua vitalícia de hoje vive nas autoconferências D2 da `20260820120000` — sem isso, quem ler daqui a seis meses conclui que o sistema ainda gera três.

Trocar o bloco `describe("o plano de revisões (§1.5)")` inteiro por:

```ts
describe("o plano de revisões (§1.5)", () => {
  const plano = projetarRevisoes("2026-08-14", 32000);

  it("projeta uma janela por padrão — o banco materializa uma de cada vez", () => {
    expect(plano).toHaveLength(1);
  });

  it("o KM previsto sobe de 10.000 em 10.000 a partir do marco", () => {
    // O marco é a entrega na primeira, e a última revisão confirmada depois.
    const tres = projetarRevisoes("2026-08-14", 32000, 3);
    expect(tres[0].km_previsto).toBe(32000 + INTERVALO_KM);
    expect(tres[1].km_previsto).toBe(32000 + 2 * INTERVALO_KM);
    expect(tres[2].km_previsto).toBe(32000 + 3 * INTERVALO_KM);
  });

  it("a janela abre 30 dias antes e fecha 30 dias depois do previsto", () => {
    // 2026-08-14 + 12 meses = 2027-08-14; ±30 dias.
    expect(plano[0].janela_inicio).toBe("2027-07-15");
    expect(plano[0].janela_fim).toBe("2027-09-13");
    expect(INTERVALO_MESES).toBe(12);
    expect(TOLERANCIA_DIAS).toBe(30);
  });

  it("as janelas projetadas não se sobrepõem", () => {
    const tres = projetarRevisoes("2026-08-14", 32000, 3);
    for (let i = 1; i < tres.length; i++) {
      expect(tres[i].janela_inicio > tres[i - 1].janela_fim).toBe(true);
    }
  });
});
```

E trocar o teste `it("o banco gera o mesmo plano que a lib")` por:

```ts
  it("o banco gera o plano pelo gerador, não por série fixa", () => {
    expect(migracao).toContain("perform public.abrir_proxima_janela(v_veiculo)");
    // Ancorada na cláusula `from … as n`, não no nome da função: o cabeçalho da
    // migração cita `generate_series(1, 3)` ao narrar o bug que ela conserta, e
    // uma asserção sobre o nome nunca poderia passar. O que se prova aqui é que
    // o CÓDIGO da série fixa sumiu, não que a expressão nunca é mencionada.
    expect(migracao).not.toContain("from generate_series(1, 3) as n");
  });

  it("o gerador do banco usa a mesma régua do §1.5 que a lib", () => {
    expect(gerador).toContain(`v_km + ${INTERVALO_KM}`);
    expect(gerador).toContain(`interval '${INTERVALO_MESES} months'`);
    expect(gerador).toContain(`interval '${TOLERANCIA_DIAS} days'`);
  });

  it("o plano não seca: nada no banco limita o número de revisões", () => {
    expect(gerador).toContain("coalesce(max(numero_revisao), 0) + 1");
  });
```

Por fim, no import do topo do arquivo de teste, trocar `planoDeRevisoes,` por `projetarRevisoes,` e remover a linha `REVISOES_NO_CONTRATO,`.

- [ ] **Step 2: Rodar os testes e confirmar que falham**

```bash
npm test -- ciclo-venda-fechamento
```

Esperado: FAIL com `projetarRevisoes is not a function` (ou erro de import).

- [ ] **Step 3: Reescrever a lib**

Em `src/lib/ciclo/vendaFechamento.ts`, trocar:

```ts
/** O contrato do Ciclo é de 36 meses (§0) — três revisões por calendário. */
export const REVISOES_NO_CONTRATO = 3;
```

por:

```ts
// Não há constante de "quantas revisões": o plano é vitalício até a próxima
// venda do carro (dono, 2026-08-20). O banco materializa UMA janela por vez,
// em `abrir_proxima_janela`; o que sobra aqui é projeção para a tela.
```

E trocar a assinatura e o docblock de `planoDeRevisoes`:

```ts
/**
 * O plano inteiro, gerado no fechamento da venda.
 *
 * O marco zero é a entrega, não a fabricação: `km_na_venda` é o KM de saída na
 * compra (v1.1 §5.2), e é ele o ponto de referência da primeira revisão — a
 * única que não tem etiqueta de óleo anterior contra a qual conferir.
 *
 * A data prevista aqui é a régua do calendário. Quem roda muito atinge o KM
 * antes, e o gatilho 1 (§4.2) dispara pelo que vier primeiro; a data é
 * reprojetada a cada revisão confirmada.
 */
export function planoDeRevisoes(
  dataVenda: string,
  kmNaVenda: number,
  quantidade: number = REVISOES_NO_CONTRATO,
): RevisaoPrevista[] {
  const plano: RevisaoPrevista[] = [];
  for (let n = 1; n <= quantidade; n++) {
    const prevista = somarMeses(dataVenda, n * INTERVALO_MESES);
```

por:

```ts
/**
 * PROJEÇÃO de janelas a partir de um marco — para a tela, não para o banco.
 *
 * Quem materializa é `abrir_proxima_janela` no Postgres, uma janela por vez,
 * ancorada no último fato real: a última revisão confirmada, ou a venda. Esta
 * função existe para o vendedor ver o que vai ser criado, e por isso projeta
 * **uma** por padrão. Pedir mais devolve a continuação da régua do §1.5 como
 * ilustração — o banco não terá essas linhas até cada revisão ser confirmada.
 *
 * O marco da primeira é a entrega, não a fabricação: `km_na_venda` é o KM de
 * saída na compra (v1.1 §5.2), e é ele a referência da primeira revisão — a
 * única que não tem etiqueta de óleo anterior contra a qual conferir.
 */
export function projetarRevisoes(
  marcoData: string,
  marcoKm: number,
  quantidade: number = 1,
): RevisaoPrevista[] {
  const plano: RevisaoPrevista[] = [];
  for (let n = 1; n <= quantidade; n++) {
    const prevista = somarMeses(marcoData, n * INTERVALO_MESES);
```

E no corpo do laço, trocar `km_previsto: kmNaVenda + n * INTERVALO_KM,` por `km_previsto: marcoKm + n * INTERVALO_KM,`.

- [ ] **Step 4: Renomear a única outra chamada, no mesmo passo**

`planoDeRevisoes` tem exatamente dois consumidores: o teste (Step 1) e `src/components/admin/FechamentoDeVenda.tsx`. Renomear a exportação sem tocar no segundo deixa a árvore quebrada — a mudança de texto da prévia é da Task 6, mas o **rename é atômico e sai aqui**.

No import do topo de `src/components/admin/FechamentoDeVenda.tsx`, trocar `planoDeRevisoes,` por `projetarRevisoes,`.

E na linha 242, trocar:

```tsx
    return planoDeRevisoes(dados.data_venda, km);
```

por:

```tsx
    return projetarRevisoes(dados.data_venda, km);
```

- [ ] **Step 5: Rodar a suíte inteira e o typecheck**

```bash
npm test && npx tsc --noEmit
```

A suíte **inteira**, não só o arquivo do fechamento: o rename cruza módulos, e `tsc` é quem prova que não sobrou consumidor órfão. Esperado: verde, incluindo os testes de `CAMPOS_OBRIGATORIOS_DA_VENDA` — que agora leem a migração de 2026-08-20 e continuam encontrando `array_append(faltando, '<campo>')` porque a Task 2 copiou a função inteira.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ciclo/vendaFechamento.ts tests/ciclo-venda-fechamento.test.ts src/components/admin/FechamentoDeVenda.tsx
git commit -m "refactor(ciclo): projetarRevisoes substitui planoDeRevisoes e o teste acha a migracao viva"
```

---

### Task 5: A fila de verificação distingue "sem janela" de "fora da janela"

**Files:**
- Modify: `src/components/admin/FilaDeVerificacao.tsx:118-124`, `:170-176`, `:483-493`
- Test: `tests/ciclo-selo-da-janela.test.ts` (criar)

**Interfaces:**
- Consumes: `carimbar_revisao` devolvendo `dentro_da_janela: boolean | null` (Task 2).
- Produces: `seloDaJanela(dentro: boolean | null): { texto: string; tom: "na" | "fora" | "sem" }`, exportado de `src/lib/ciclo/selo.ts`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/ciclo-selo-da-janela.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { seloDaJanela } from "../src/lib/ciclo/selo";

/**
 * `null` em `dentro_da_janela` significa "não havia janela", não "atrasou".
 * Antes do plano vitalício, a quarta revisão de qualquer carro caía aqui e a
 * loja lia FORA DA JANELA em vermelho para quem tinha revisado no prazo.
 */
describe("o selo da janela tem três estados", () => {
  it("true é a janela cumprida", () => {
    expect(seloDaJanela(true)).toEqual({ texto: "NA JANELA", tom: "na" });
  });

  it("false é atraso de verdade — havia janela e o serviço não a cumpriu", () => {
    expect(seloDaJanela(false)).toEqual({ texto: "FORA DA JANELA", tom: "fora" });
  });

  it("null não acusa ninguém: não havia janela", () => {
    expect(seloDaJanela(null)).toEqual({ texto: "SEM JANELA", tom: "sem" });
  });

  it("null nunca é lido como fora da janela", () => {
    expect(seloDaJanela(null).tom).not.toBe("fora");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
npm test -- ciclo-selo-da-janela
```

Esperado: FAIL com `Failed to resolve import "../src/lib/ciclo/selo"`.

- [ ] **Step 3: Escrever a lib**

Criar `src/lib/ciclo/selo.ts`:

```ts
/**
 * Como a loja lê `manutencoes.dentro_da_janela`.
 *
 * Os três estados são do banco, não da tela: `true` cumpriu, `false` havia
 * janela e o serviço não a cumpriu, `null` não havia janela. Tratar `null`
 * como `false` era o defeito que o plano vitalício corrigiu — e continua
 * possível em revisão avulsa e em carro que saiu da Garagem.
 */
export type TomDoSelo = "na" | "fora" | "sem";

export function seloDaJanela(dentro: boolean | null): { texto: string; tom: TomDoSelo } {
  if (dentro === true) return { texto: "NA JANELA", tom: "na" };
  if (dentro === false) return { texto: "FORA DA JANELA", tom: "fora" };
  return { texto: "SEM JANELA", tom: "sem" };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
npm test -- ciclo-selo-da-janela
```

Esperado: PASS.

- [ ] **Step 5: Usar a lib na tela**

Em `src/components/admin/FilaDeVerificacao.tsx`, acrescentar ao topo:

```ts
import { seloDaJanela } from "../../lib/ciclo/selo";
```

Trocar o bloco do selo:

```tsx
                  <span
                    className={`ml-auto border px-2 py-0.5 text-[9px] font-semibold tracking-[.14em] ${
                      r.dentro_da_janela
                        ? "border-mt-ink text-mt-ink"
                        : "border-mt-accent text-mt-accent"
                    }`}
                  >
                    {r.dentro_da_janela ? "NA JANELA" : "FORA DA JANELA"}
                  </span>
```

por:

```tsx
                  <span
                    className={`ml-auto border px-2 py-0.5 text-[9px] font-semibold tracking-[.14em] ${
                      {
                        na: "border-mt-ink text-mt-ink",
                        fora: "border-mt-accent text-mt-accent",
                        sem: "border-mt-regua-fina text-mt-neutral-600",
                      }[seloDaJanela(r.dentro_da_janela).tom]
                    }`}
                  >
                    {seloDaJanela(r.dentro_da_janela).texto}
                  </span>
```

Trocar a mensagem do carimbo:

```tsx
      setAviso(
        aceitar
          ? corpo.dentro_da_janela === false
            ? "Verificada — fora da janela. Entra no diário de bordo, não na procedência."
            : "Verificada dentro da janela. A procedência deste veículo subiu."
          : "Recusada. O motivo ficou no registro.",
      );
```

por:

```tsx
      setAviso(
        aceitar
          ? corpo.dentro_da_janela === false
            ? "Verificada — fora da janela. Entra no diário de bordo, não na procedência."
            : corpo.dentro_da_janela === null
              ? "Verificada. Não havia janela aberta para este serviço — entra no diário de bordo."
              : "Verificada dentro da janela. A procedência deste veículo subiu."
          : "Recusada. O motivo ficou no registro.",
      );
```

E a mensagem do lançamento pela loja:

```tsx
            ? corpo.verificacao.dentro_da_janela === false
              ? "Lançada e verificada — fora da janela."
              : "Lançada e verificada dentro da janela."
```

por:

```tsx
            ? corpo.verificacao.dentro_da_janela === false
              ? "Lançada e verificada — fora da janela."
              : corpo.verificacao.dentro_da_janela === null
                ? "Lançada e verificada. Não havia janela aberta para este serviço."
                : "Lançada e verificada dentro da janela."
```

- [ ] **Step 6: Rodar a suíte e o typecheck**

```bash
npm test && npx tsc --noEmit
```

Esperado: tudo verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ciclo/selo.ts tests/ciclo-selo-da-janela.test.ts src/components/admin/FilaDeVerificacao.tsx
git commit -m "fix(ciclo): sem janela deixa de ser lido como fora da janela"
```

#### Emenda à Task 5 — decidida em 2026-08-20, durante a execução

A revisão apontou que os Steps 5 acima espalham a tricotomia: as duas mensagens de aviso comparam `=== false` / `=== null` cru em vez de passar pela lib. O achado é contra código que este plano prescreveu, então foi levado ao dono, **que decidiu que o achado governa**.

O que virou a balança não foi o argumento de estilo. Foi uma **regressão que este pacote introduz** e que nenhuma tarefa cobria: `src/lib/ciclo/motor.ts`, na função `revisaoVerificada` (~linha 243), monta a mensagem de WhatsApp do cliente com `c.dentro_da_janela === false ? "…fora da janela…" : "Dentro da janela do programa."`. Antes das Tasks 1-3, `null` nunca chegava ali. Agora chega — e o cliente cuja revisão não tinha janela nenhuma recebe a afirmação de que ela ficou dentro da janela. É o espelho do defeito que esta tarefa conserta.

Acrescentado à Task 5:

- **`src/lib/ciclo/janela.ts`** (criar) — `classificarJanela(dentro: boolean | null | undefined): "na" | "fora" | "sem"`, com teste próprio. `undefined` cai em `sem` de propósito: o valor chega de `res.json()` em algumas chamadas, e campo ausente não justifica afirmar nada.
- `selo.ts` passa a usar o classificador; a assinatura pública de `seloDaJanela` não muda, e `tests/ciclo-selo-da-janela.test.ts` continua valendo intacto.
- As duas mensagens de aviso classificam e ramificam no estado. Os textos não mudam.
- `revisaoVerificada` ganha o terceiro ramo, com o texto: *"Não havia janela programada para casar com ela, e está registrada do mesmo jeito: o histórico do carro fica completo."* — espelha de propósito a construção do ramo `fora`: mesma garantia ao cliente, motivo diferente.
- Teste em `tests/ciclo-motor.test.ts` provando que `null` **não** produz "Dentro da janela".

**Deliberadamente fora:** `GaragemVeiculo.tsx:215` e `garagem/meus-dados/page.tsx:177` também colapsam os três estados, mas com `null` produzem "VERIFICADA" e "verificada" — **dizem menos, não dizem falso**. A régua desta correção é consertar quem faz afirmação falsa, não quem se cala; mexer neles mudaria texto que o cliente lê, sem necessidade.

---

### Task 6: A prévia do fechamento mostra a janela que será criada

**Files:**
- Modify: `src/components/admin/FechamentoDeVenda.tsx:239-243`, `:678-708`

**Interfaces:**
- Consumes: `projetarRevisoes` da Task 4, **já chamada** neste arquivo — a Task 4 fez o rename mecânico. Esta tarefa muda o que a tela diz, não a quem ela chama.
- Produces: nada para outras tarefas.

- [ ] **Step 1: Explicar por que a prévia agora tem uma linha**

Acrescentar o comentário acima do `useMemo` da prévia, que a Task 4 deixou chamando `projetarRevisoes`:

```tsx
  // Uma janela, porque é uma que o banco vai criar. As seguintes nascem a cada
  // revisão confirmada, ancoradas no serviço — prometer três aqui seria a tela
  // dizendo o que o banco não faz.
  const previa = useMemo(() => {
```

- [ ] **Step 2: Trocar o título e o texto da prévia**

Trocar:

```tsx
              <div className={rotuloClasse}>Plano de revisões que será criado</div>
              <p className="mb-3 mt-1 text-[11px] text-mt-neutral-500">
                A cada {INTERVALO_KM.toLocaleString("pt-BR")} km ou {INTERVALO_MESES} meses, o que
                vier primeiro. Tolerância de {TOLERANCIA_DIAS} dias.
              </p>
```

por:

```tsx
              <div className={rotuloClasse}>Primeira revisão, que será criada agora</div>
              <p className="mb-3 mt-1 text-[11px] text-mt-neutral-500">
                A cada {INTERVALO_KM.toLocaleString("pt-BR")} km ou {INTERVALO_MESES} meses, o que
                vier primeiro, com tolerância de {TOLERANCIA_DIAS} dias —{" "}
                <strong>enquanto o carro for do cliente</strong>. Cada revisão verificada abre a
                janela seguinte, a partir da data e do KM do serviço.
              </p>
```

- [ ] **Step 3: Corrigir os três textos que ainda dizem "três"**

Achados na revisão da Task 4. Não estão na prévia — estão espalhados pelo arquivo, e o da linha 281 é **texto que o vendedor lê logo depois de fechar a venda**, afirmando que existem três janelas quando passará a existir uma.

Linha 48, comentário do topo — trocar `o programa mostrando as três datas do que descrevendo a regra.` por `o programa mostrando a próxima data do que descrevendo a regra.`

Linha 281, confirmação pós-venda — trocar:

```tsx
            O KM de saída virou a primeira notação de odômetro e as três janelas de revisão já
            existem. A partir daqui o cliente entra na Garagem Motors e a procedência do carro
            dele passa a contar.
```

por:

```tsx
            O KM de saída virou a primeira notação de odômetro e a primeira janela de revisão já
            existe — as seguintes nascem a cada revisão verificada. A partir daqui o cliente entra
            na Garagem Motors e a procedência do carro dele passa a contar.
```

Linha 312, cabeçalho do formulário — trocar:

```tsx
          programa precisa para funcionar daqui a três anos — e a venda não fecha sem ele.
```

por:

```tsx
          programa precisa para funcionar enquanto o carro for do cliente — e a venda não fecha
          sem ele.
```

O "daqui a três anos" datava do contrato de 36 meses. A Garagem não acaba em três anos — acaba na próxima venda do carro.

- [ ] **Step 4: Caçar qualquer outro "três" sobrevivente**

```bash
grep -rn "três revis\|três janelas\|três datas\|três anos\|3 revis" src/
```

Esperado: nenhuma linha que descreva o plano de revisões como finito. Se aparecer alguma, corrija no mesmo commit — a tela não pode prometer o que o banco não faz, e é esse o defeito que o pacote inteiro existe para consertar.

- [ ] **Step 5: Rodar o typecheck e a suíte**

```bash
npx tsc --noEmit && npm test
```

Esperado: tudo verde. `INTERVALO_KM`, `INTERVALO_MESES` e `TOLERANCIA_DIAS` continuam importados e em uso no texto novo da prévia — não remover nenhum dos três.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/FechamentoDeVenda.tsx
git commit -m "feat(ciclo): a previa da venda mostra a janela que o banco cria"
```

---

### Task 7: A Garagem trata o veículo encerrado

**Files:**
- Modify: `src/app/garagem/page.tsx:118-131`
- Modify: `src/components/garagem/GaragemVeiculo.tsx:40`, `:136-151`

**Interfaces:**
- Consumes: coluna `veiculos_vendidos.saiu_em` da Task 1.
- Produces: o tipo `VeiculoDaGaragem` passa a ter `saiu_em: string | null`.

- [ ] **Step 1: Trazer `saiu_em` na query**

Em `src/app/garagem/page.tsx`, trocar a primeira linha do `select`:

```
      `id, placa, marca, modelo, versao, ano_modelo, data_venda, km_na_venda,
```

por:

```
      `id, placa, marca, modelo, versao, ano_modelo, data_venda, km_na_venda, saiu_em,
```

- [ ] **Step 2: Declarar o campo no tipo**

Em `src/components/garagem/GaragemVeiculo.tsx`, no tipo do veículo, acrescentar depois de `km_na_venda`:

```ts
  /** Preenchida, o carro deixou de ser do cliente: sem próxima janela, sem gatilho. */
  saiu_em: string | null;
```

- [ ] **Step 3: Tratar o encerrado no bloco PRÓXIMA REVISÃO**

Trocar:

```tsx
          {proxima ? (
            <>
              <p className="m-0 mt-1 text-[15px] font-bold text-mt-ink">
                {dataBr(proxima.janela_inicio)} a {dataBr(proxima.janela_fim)}
              </p>
              <p className="m-0 mt-0.5 text-[11px] leading-snug text-mt-neutral-600">
                {proxima.numero_revisao}ª revisão
                {proxima.km_previsto ? ` · por volta de ${kmBr(proxima.km_previsto)}` : ""}
              </p>
            </>
          ) : (
            <p className="m-0 mt-1 text-[13px] text-mt-neutral-700">
              Nenhuma janela em aberto.
            </p>
          )}
```

por:

```tsx
          {veiculo.saiu_em ? (
            <p className="m-0 mt-1 text-[13px] leading-snug text-mt-neutral-700">
              Acompanhamento encerrado em {dataBr(veiculo.saiu_em)}. O diário de bordo abaixo
              continua seu.
            </p>
          ) : proxima ? (
            <>
              <p className="m-0 mt-1 text-[15px] font-bold text-mt-ink">
                {dataBr(proxima.janela_inicio)} a {dataBr(proxima.janela_fim)}
              </p>
              <p className="m-0 mt-0.5 text-[11px] leading-snug text-mt-neutral-600">
                {proxima.numero_revisao}ª revisão
                {proxima.km_previsto ? ` · por volta de ${kmBr(proxima.km_previsto)}` : ""}
              </p>
            </>
          ) : (
            <p className="m-0 mt-1 text-[13px] text-mt-neutral-700">
              Estamos calculando a próxima janela. Ela aparece aqui em instantes.
            </p>
          )}
```

O texto do último ramo mudou de propósito: com o plano vitalício, veículo ativo sem janela é estado **transitório** — o cron abre uma na próxima madrugada. "Nenhuma janela em aberto" dizia ao cliente que não havia nada a fazer, para sempre.

- [ ] **Step 4: Rodar o typecheck e a suíte**

```bash
npx tsc --noEmit && npm test
```

Esperado: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add src/app/garagem/page.tsx src/components/garagem/GaragemVeiculo.tsx
git commit -m "feat(garagem): veiculo encerrado mostra o fim do acompanhamento"
```

---

### Task 8: Marcar a saída da Garagem

**Files:**
- Create: `src/app/api/ciclo/veiculos/[id]/saida/route.ts`
- Test: `tests/ciclo-saida-da-garagem.test.ts` (criar)

**Interfaces:**
- Consumes: colunas `saiu_em` e `motivo_saida` da Task 1.
- Produces: `POST /api/ciclo/veiculos/:id/saida` com corpo `{ saiu_em: string; motivo_saida: string }`, resposta `{ ok: true }` ou `{ error: string }`. E `validarSaida(dados): { campo: string; mensagem: string }[]`, exportado de `src/lib/ciclo/saida.ts`.

**Gate:** a rota reusa `"Verificar revisão do diário de bordo"` (Admin + Comercial), que é o gate da tela onde o controle vive. Não se acrescenta linha nova à matriz A17 — ela é decisão do dono, e as duas linhas do Ciclo já têm exatamente esse público.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/ciclo-saida-da-garagem.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validarSaida } from "../src/lib/ciclo/saida";

const raiz = join(__dirname, "..");
const rota = readFileSync(
  join(raiz, "src", "app", "api", "ciclo", "veiculos", "[id]", "saida", "route.ts"),
  "utf-8",
);

describe("marcar a saída da Garagem", () => {
  it("exige data", () => {
    expect(validarSaida({ saiu_em: "", motivo_saida: "revendido" })
      .some((p) => p.campo === "saiu_em")).toBe(true);
  });

  it("exige motivo — é o que o CHECK do banco cobra", () => {
    expect(validarSaida({ saiu_em: "2026-08-20", motivo_saida: "  " })
      .some((p) => p.campo === "motivo_saida")).toBe(true);
  });

  it("recusa data no futuro: saída é registro do que aconteceu", () => {
    expect(validarSaida({ saiu_em: "2099-01-01", motivo_saida: "revendido" })
      .some((p) => p.campo === "saiu_em")).toBe(true);
  });

  it("aceita o caso completo", () => {
    expect(validarSaida({ saiu_em: "2026-08-20", motivo_saida: "revendido" })).toEqual([]);
  });
});

describe("a rota é de staff e não apaga nada", () => {
  it("exige staff e o gate da fila de verificação", () => {
    expect(rota).toContain("ehStaff(profile)");
    expect(rota).toContain('podeFazer(perfisDe(profile), "Verificar revisão do diário de bordo")');
  });

  it("só escreve saiu_em e motivo_saida — o histórico não é apagado", () => {
    expect(rota).not.toContain(".delete(");
    expect(rota).toContain('.from("veiculos_vendidos")');
    expect(rota).toContain(".update(");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
npm test -- ciclo-saida-da-garagem
```

Esperado: FAIL com `Failed to resolve import "../src/lib/ciclo/saida"`.

- [ ] **Step 3: Escrever a lib de validação**

Criar `src/lib/ciclo/saida.ts`:

```ts
/**
 * A saída do carro da Garagem Motors.
 *
 * O dono definiu em 2026-08-20 que a Garagem é vitalícia **até a próxima venda
 * do carro**. Sem este registro, o motor de gatilhos continuaria lembrando de
 * revisão quem já vendeu — e o gerador continuaria abrindo janela para um carro
 * que não é mais do cliente.
 *
 * O motivo é texto livre: fixar uma lista fechada agora seria inventar o
 * vocabulário do negócio antes de a loja ter visto um caso.
 */
export interface DadosDaSaida {
  saiu_em: string;
  motivo_saida: string;
}

export interface ProblemaDaSaida {
  campo: string;
  mensagem: string;
}

export function validarSaida(dados: DadosDaSaida): ProblemaDaSaida[] {
  const problemas: ProblemaDaSaida[] = [];
  const data = String(dados.saiu_em ?? "").trim();
  const motivo = String(dados.motivo_saida ?? "").trim();

  if (data === "") {
    problemas.push({ campo: "saiu_em", mensagem: "Informe a data em que o carro saiu." });
  } else if (data > new Date().toISOString().slice(0, 10)) {
    problemas.push({ campo: "saiu_em", mensagem: "A data da saída não pode estar no futuro." });
  }

  // O CHECK `veiculos_vendidos_saida_com_motivo` cobra a mesma coisa no banco.
  // Validar aqui é para a tela dizer o que falta, não para substituí-lo.
  if (motivo === "") {
    problemas.push({ campo: "motivo_saida", mensagem: "Diga o motivo da saída." });
  }

  return problemas;
}
```

- [ ] **Step 4: Escrever a rota**

Criar `src/app/api/ciclo/veiculos/[id]/saida/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../../../lib/supabase-server";
import { ehStaff, perfisDe, podeFazer } from "../../../../../../lib/permissoes";
import { validarSaida } from "../../../../../../lib/ciclo/saida";

export const dynamic = "force-dynamic";

/**
 * Marca que o carro deixou de ser do cliente — o fim do vitalício da Garagem.
 *
 * Não apaga nada: o diário de bordo continua legível para o cliente, porque o
 * dado é dele e o §6.3 não prevê apagá-lo porque o carro trocou de mãos. O que
 * a saída desliga é o futuro — gerador de janelas, gatilhos e escrita nova.
 *
 * Mesmo gate da fila de verificação (Admin e Comercial): é a tela onde o
 * controle vive, e a matriz A17 é decisão do dono, não coisa a se acrescentar
 * de passagem.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, papeis, full_name")
    .eq("id", user.id)
    .single();

  if (!ehStaff(profile)) {
    return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
  }
  if (podeFazer(perfisDe(profile), "Verificar revisão do diário de bordo") !== "faz") {
    return NextResponse.json(
      { error: "Seu perfil não opera o diário de bordo" },
      { status: 403 },
    );
  }

  const corpo = await request.json().catch(() => ({}) as Record<string, unknown>);
  const dados = {
    saiu_em: String((corpo as Record<string, unknown>).saiu_em ?? "").trim(),
    motivo_saida: String((corpo as Record<string, unknown>).motivo_saida ?? "").trim(),
  };

  const problemas = validarSaida(dados);
  if (problemas.length > 0) {
    return NextResponse.json({ error: problemas[0].mensagem, problemas }, { status: 422 });
  }

  const { error } = await supabase
    .from("veiculos_vendidos")
    .update({ saiu_em: dados.saiu_em, motivo_saida: dados.motivo_saida })
    .eq("id", id);

  if (error) {
    console.error("[Ciclo/Saída] Falha ao marcar a saída:", error.message);
    return NextResponse.json({ error: "Não foi possível marcar a saída." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
npm test -- ciclo-saida-da-garagem
```

Esperado: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ciclo/saida.ts src/app/api/ciclo/veiculos tests/ciclo-saida-da-garagem.test.ts
git commit -m "feat(ciclo): rota de staff marca a saida do carro da Garagem"
```

---

### Task 9: O controle de saída na tela de verificação

**Files:**
- Modify: `src/components/admin/FilaDeVerificacao.tsx`

**Interfaces:**
- Consumes: `validarSaida` e a rota `POST /api/ciclo/veiculos/:id/saida` da Task 8; a lista `veiculos` (`VeiculoResumo[]`) que o componente já carrega para o formulário de lançamento.
- Produces: nada para outras tarefas.

A tela já carrega todos os `veiculos_vendidos` (`api/ciclo/revisoes/route.ts:90`) para o seletor do lançamento. O controle nasce ali, reusando a mesma lista — não há tela nova, e hoje **nenhuma outra tela de admin lista veículos vendidos**.

- [ ] **Step 1: Importar a validação e declarar o estado**

No topo de `src/components/admin/FilaDeVerificacao.tsx`, junto dos outros imports:

```ts
import { validarSaida } from "../../lib/ciclo/saida";
```

Junto das outras declarações de estado do componente:

```tsx
  // Fim do acompanhamento: a Garagem é do cliente enquanto o carro for dele.
  const [saida, setSaida] = useState({
    veiculo_vendido_id: "",
    saiu_em: hoje,
    motivo_saida: "",
  });
  const [marcandoSaida, setMarcandoSaida] = useState(false);
```

- [ ] **Step 2: Escrever o handler**

Junto das outras funções do componente:

```tsx
  const marcarSaida = async () => {
    setErro("");
    if (!saida.veiculo_vendido_id) {
      setErro("Escolha o veículo que saiu.");
      return;
    }
    const problemas = validarSaida(saida);
    if (problemas.length > 0) {
      setErro(problemas[0].mensagem);
      return;
    }
    setMarcandoSaida(true);
    try {
      const res = await fetch(`/api/ciclo/veiculos/${saida.veiculo_vendido_id}/saida`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saiu_em: saida.saiu_em, motivo_saida: saida.motivo_saida }),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(corpo.error ?? "Não foi possível marcar a saída.");
        return;
      }
      setAviso(
        "Saída registrada. O cronograma parou aqui; o diário de bordo continua visível para o cliente.",
      );
      setSaida({ veiculo_vendido_id: "", saiu_em: hoje, motivo_saida: "" });
      await carregar();
    } finally {
      setMarcandoSaida(false);
    }
  };
```

- [ ] **Step 3: Escrever a seção, depois do formulário de lançamento**

Logo após o `</section>` que fecha "Lançar revisão no diário de bordo":

```tsx
      {/* ---- fim do acompanhamento ---- */}
      <section className="mt-5 border border-mt-regua-fina bg-mt-surface p-6">
        <h2 className="text-[15px] font-extrabold tracking-[-.015em] text-mt-ink">
          Marcar saída da Garagem
        </h2>
        <p className="mb-4 mt-1 text-xs text-mt-neutral-700">
          Use quando o carro deixar de ser do cliente. O cronograma de revisões para e os
          lembretes cessam — <strong>o diário de bordo continua visível para ele</strong>,
          porque o histórico é dele.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="saida-veiculo" className={rotuloClasse}>
              Veículo *
            </label>
            <select
              id="saida-veiculo"
              className={inputClasse}
              value={saida.veiculo_vendido_id}
              onChange={(e) => setSaida((d) => ({ ...d, veiculo_vendido_id: e.target.value }))}
            >
              <option value="">Escolha…</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.placa} — {v.marca} {v.modelo} · {v.cliente?.nome ?? ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="saida-data" className={rotuloClasse}>
              Data da saída *
            </label>
            <input
              id="saida-data"
              type="date"
              className={inputClasse}
              value={saida.saiu_em}
              max={hoje}
              onChange={(e) => setSaida((d) => ({ ...d, saiu_em: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="saida-motivo" className={rotuloClasse}>
              Motivo *
            </label>
            <input
              id="saida-motivo"
              type="text"
              className={inputClasse}
              placeholder="revendido, perda total…"
              value={saida.motivo_saida}
              onChange={(e) => setSaida((d) => ({ ...d, motivo_saida: e.target.value }))}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={marcarSaida}
          disabled={marcandoSaida}
          className="mt-4 border border-mt-ink px-4 py-2.5 text-[13px] font-bold text-mt-ink transition-colors hover:bg-mt-ink hover:text-mt-bg disabled:opacity-50"
        >
          {marcandoSaida ? "Registrando…" : "Marcar saída"}
        </button>
      </section>
```

- [ ] **Step 4: Rodar o typecheck, a suíte e o build**

```bash
npx tsc --noEmit && npm test && npm run build
```

Esperado: os três verdes.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/FilaDeVerificacao.tsx
git commit -m "feat(ciclo): a loja marca a saida do carro na tela de verificacao"
```

---

### Task 10: Semente de desenvolvimento e verificação final

**Files:**
- Modify: `supabase/seeds/ciclo_dev.sql:94-104`

**Interfaces:**
- Consumes: `public.abrir_proxima_janela(uuid)` da Task 1.
- Produces: nada.

- [ ] **Step 1: Trocar a série fixa da semente pelo gerador**

Trocar:

```sql
-- ---- plano de revisões: 10.000 km ou 12 meses, tolerância de 30 dias (§1.5) ----
insert into public.plano_revisoes
  (veiculo_vendido_id, numero_revisao, km_previsto, janela_inicio, janela_fim)
select vv.id,
       n,
       vv.km_na_venda + (n * 10000),
       (vv.data_venda + (n * interval '12 months') - interval '30 days')::date,
       (vv.data_venda + (n * interval '12 months') + interval '30 days')::date
  from public.veiculos_vendidos vv
 cross join generate_series(1, 3) as n
 where vv.chassi like 'SEED-%';
```

por:

```sql
-- ---- plano de revisões: uma janela por veículo, pelo mesmo gerador ----
-- A semente não repete a régua do §1.5: chama quem a conhece. Assim ela nunca
-- diverge do que o banco realmente cria — que foi o defeito do plano fixo.
select public.abrir_proxima_janela(vv.id)
  from public.veiculos_vendidos vv
 where vv.chassi like 'SEED-%';
```

- [ ] **Step 2: Rodar a suíte inteira, o typecheck e o build**

```bash
npm test && npx tsc --noEmit && npm run build
```

Esperado: os três verdes. O build é o que pega import quebrado que o `tsc` deixa passar em rota do App Router.

- [ ] **Step 3: Rodar o ensaio da migração uma última vez**

```bash
node supabase/manutencao/aplicar-migracao.js supabase/migrations/20260820120000_plano_de_revisoes_vitalicio.sql
```

Esperado: as três autoconferências OK e `Ensaio OK (revertido)`.

**Parar aqui.** O `--gravar` e o deploy exigem aprovação explícita do dono, e os dois têm de sair juntos: a prévia do vendedor e o banco não podem divergir nem por um deploy.

- [ ] **Step 4: Commit**

```bash
git add supabase/seeds/ciclo_dev.sql
git commit -m "chore(ciclo): a semente usa o gerador em vez de repetir a regua"
```

---

## Fora deste plano

- **Pacote 2 — escopo de itens da revisão.** Correia, pastilhas, discos, suspensão e óleo de câmbio. O dono respondeu as três dúvidas em 2026-08-20 (§8 da spec), mas ainda falta a **Emenda 02 escrita e aprovada** e o levantamento por modelo. Nenhuma coluna é adiantada aqui.
- **A janela aberta não se move com o KM declarado.** O §1.5 diz que a data prevista é recalculada a cada novo ponto de KM; segue não sendo. O gatilho 1 já antecipa por KM e o carimbo já confere as duas réguas.
- **Lista fechada de `motivo_saida`.**
- **Recompra.** Regra 5 do CLAUDE.md.
