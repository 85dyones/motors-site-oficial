# `supabase/` — migrações versionadas

Inaugurado no **Pacote 0.5** (2026-08-03). Até então o projeto não tinha
migração nenhuma, apesar de `CLAUDE.md:62` exigir: *"Migrações do Supabase são
versionadas em `supabase/migrations/`. Nunca altere schema direto pelo painel."*

## Estrutura

```
supabase/
├── migrations/     aplicadas em ordem por `supabase db push`
├── manutencao/     correção de DADO, pontual — nunca vira migração
├── seeds/          dados iniciais
├── templates/      modelos de e-mail do Auth — a fonte dos que vão no painel
├── testes/         andaime que faz as migrações rodarem num Postgres local
└── README.md
```

Há ainda uma quarta pasta que **não existe hoje** e é criada sob demanda:
`pendente/`. Ela e `manutencao/` não são a mesma coisa, e a diferença importa:

- **`pendente/`** é antessala de **migração de schema**: o arquivo espera um
  passo manual (um cutover coordenado, por exemplo) e, depois de aplicado,
  **move para `migrations/`**. Um arquivo esquecido lá é um passo que ninguém
  deu — `tests/migracoes.test.ts` falha se sobrar algum.
- **`manutencao/`** é o que se roda **à mão contra a produção**, e nada dali
  descreve o estado desejado do schema — então nada dali vira migração nem
  entra em `db push`. São duas coisas convivendo:
  - **correção de dado**, que roda uma vez e fica arquivada como registro do
    que foi feito. Cada arquivo traz a conferência antes e a verificação
    depois; o passo destrutivo fica comentado, para não rodar por
    copiar-colar distraído.
  - **ferramenta**, que fica para sempre e roda quantas vezes for preciso:
    `aplicar-migracao.js` (aplica uma migração pelo pooler),
    `conferir-estado-do-financeiro.sql` (pergunta ao banco, sem escrever
    nada, se as migrações do financeiro continuam de pé) e
    `acertar_livro_razao_da_colisao.sql` (diagnóstico + acerto da colisão de
    timestamp de 2026-08-22 — ver abaixo).

`pendente/` não é uma convenção do Supabase CLI — é uma salvaguarda deste
projeto. Ver o passo 4 do runbook abaixo para o motivo. Está **vazia desde
que o cutover do rename foi concluído**, e `tests/migracoes.test.ts` tolera a
ausência do diretório: se ele voltar a existir, é de propósito, e o teste
volta a exigir que nada seja esquecido lá dentro.

## ⛔ `supabase_schema.sql` na raiz — arquivo histórico, não execute

Esta é a nota que `docs/VIRADA_DE_DOMINIO.md` manda consultar (e que até
2026-08-18 não existia).

O `supabase_schema.sql` da raiz do repositório é o bootstrap de 2026-08-03,
anterior às migrações versionadas. Ele **não** descreve o schema de hoje, e
executá-lo derruba proteções que três migrações puseram de pé:

| O que ele recria | O que isso desfaz |
|---|---|
| `estoque_motors`: `Allow public update/insert access` com `USING (true)` | **Escrita anônima no estoque** — qualquer um com a chave pública alteraria preço de veículo (`20260808120000` fechou) |
| `site_settings`: `Allow public read access` com `USING (true)` | Leitura anônima de `webhooks`, `stock_overrides` e `bank_balances` (`20260812120000` fechou) |
| Policies de admin por **lista de e-mail** | A régua é `is_staff()` desde `20260813120000` |

Em 2026-08-18 o arquivo ganhou uma **guarda no topo** — um `RAISE EXCEPTION`
que aborta a execução inteira antes de qualquer DDL, provado em transação
revertida contra a produção. Colar o arquivo hoje não faz estrago: falha com
a explicação.

Se precisar de algum trecho dele (os seeds de `site_settings`, por exemplo),
**copie o trecho** — não remova a guarda. E não atualize o arquivo para
refletir mudanças novas: a fonte de verdade é `migrations/`.

## Migrações

| Arquivo | O que faz |
|---|---|
| `20260803120000_baseline_inventario.sql` | Versiona a tabela de inventário, que nunca esteve sob controle de versão. Schema corrigido contra a produção em 2026-08-03 (ver o cabeçalho do próprio arquivo). ⚠️ Reexecutá-lo num banco onde o rename já rodou **recria `public.veiculos` com policies públicas** — foi o que aconteceu em produção (`AUDITORIA.md` §3.4-c). |
| `20260803120100_renomear_veiculos_para_estoque_motors.sql` | `veiculos` → `estoque_motors` + view de compatibilidade. |
| `20260804193000_remover_view_compat_veiculos.sql` | Remove a view de compatibilidade após o cutover. |
| `20260804200000_adicionar_last_seen_at.sql` | Reconciliação com o feed: quem não veio no último sync não é exibido. |
| `20260807120000_midia_paga_e_auditoria.sql` | Módulo de mídia paga (telas A13/A14) + trilha de auditoria (A17), com RLS. Auditoria é append-only por ausência de policy de UPDATE/DELETE. |
| `20260807160000_ficha_propria_do_painel.sql` | Ficha própria do painel em `estoque_motors`: `placa`, `motor`, `cor_interna`, `donos_anteriores`, `garantia_fabrica`, `preco_compra`. **Nunca entram no mapeamento do sync n8n** — ver contrato abaixo. |
| `20260807190000_historico_veiculo.sql` | Linha do tempo de alterações por veículo (tela A15). Append-only: SELECT e INSERT `TO authenticated`, sem UPDATE/DELETE. |
| `20260807210000_leads.sql` | RLS da tabela `leads` (PII): leitura, atualização e exclusão `TO authenticated`; sem policy de INSERT — quem grava é a chave de serviço. |
| `20260808120000_rls_escrita_autenticada_estoque.sql` | Fecha a escrita anônima de `estoque_motors` (`AUDITORIA.md` §3.4), com autoconferência que aborta se sobrar escrita pública. |
| `20260811130000_leads_insert_destravado.sql` | `event_id` deixa de ser NOT NULL — era o que fazia todo INSERT de lead do site falhar em silêncio desde 2026-08-07. |
| `20260812120000_rls_leitura_de_site_settings.sql` | Fecha a leitura anônima de `site_settings`. `anon` passa a ver só o recorte que alimenta páginas públicas; `webhooks` (com `apiSecretToken`), `stock_overrides` (com `preco_compra`) e `bank_balances` exigem sessão ou chave de serviço. Autoconferência vira `anon` e tenta ler. **Aplicada em produção em 2026-08-12.** |
| `20260812150000_rls_escrita_de_site_settings.sql` | Fecha a **escrita** anônima de `site_settings` — o gêmeo do §3.4 que ficou de fora de `20260808120000`. Até 2026-08-12 um `PATCH` com a anon key respondia 200. INSERT/UPDATE passam a exigir `authenticated`; DELETE segue sem policy. Autoconferência vira `anon` e tenta o UPDATE. **Aplicada em produção em 2026-08-12.** |
| `20260812160000_notificacoes_admin.sql` | Rastro dos eventos administrativos processados pelo workflow `adm-motors` do n8n. Escrita só pela chave de serviço; leitura `TO authenticated`; sem UPDATE/DELETE. **Aplicada em produção em 2026-08-12.** |
| `20260813120000_role_cliente_e_is_staff.sql` | O auth passa a ter dois públicos: papel `cliente` (padrão de todo cadastro novo), `is_staff()` como régua única, papel de staff só via `app_metadata`. Re-escopa toda policy interna que dizia `TO authenticated USING (true)`. **Aplicada em produção em 2026-08-13.** |
| `20260813150000_ciclo_fundacao_de_dados.sql` | Pacote 1 do Motors Ciclo: as 13 tabelas do manual v1.1 §2.1, índices do §2.2, a view de estado do §2.3 e RLS por cliente. Traz autoconferência que **prova o aceite do pacote** contra o banco real — cria dois clientes sintéticos, assume a sessão de um e falha a migração se ele enxergar o outro. **Aplicada em produção em 2026-08-14.** |
| `20260814120000_fechar_venda_ciclo.sql` | Pacote 2: a função `fechar_venda_ciclo(jsonb)`, que grava a venda inteira em uma transação — cliente, veículo, KM de saída, plano de revisões e, quando houver, financiamento e contrato. Levanta `VENDA_INCOMPLETA` com a lista de campos quando falta obrigatório do §3.1. Autoconferência tenta cinco vendas inválidas e exige que todas falhem. **Aplicada em produção em 2026-08-14.** |
| `20260814150000_carimbo_e_conformidade.sql` | O diário de bordo: `carimbar_revisao` (exige a foto da etiqueta nova, casa com a janela do plano pela régua do §1.5, grava o KM como leitura verificada; recusa exige motivo e fica no rastro) e `calcular_conformidade_diaria` (a série do §1.4 — nunca sobrescreve, `pct NULL` com denominador zero, dias preenchidos depois do fato saem com `retroativa = true`). **Aplicada em produção em 2026-08-15.** |
| `20260814180000_motor_de_gatilhos.sql` | Pacote 3: `montar_fila_de_gatilhos` (a régua de QUEM recebe — §4.3, §4.4 — no servidor, não no workflow) e `registrar_desfecho_ciclo`. A recusa ganha marca própria (`manutencoes.recusada_em`, `motivo_recusa`): sem ela, recusado e pendente eram o mesmo estado e a fila da A21 nunca esvaziava. **Aplicada em produção em 2026-08-15.** |
| `20260815120000_fechar_superficie_exposta.sql` | Cria o livro-razão `supabase_migrations.schema_migrations` e o semeia com as 19 versões já aplicadas (equivalente ao `migration repair`), e derruba a tabela fantasma `public.veiculos`. **Aplicada em produção em 2026-08-15.** |
| `20260815180000_garagem_vinculo_do_cliente.sql` | O vínculo cliente↔conta da Garagem: `reivindicar_garagem()` e `vincular_auth_por_email()`. **Aplicada em produção em 2026-08-15.** |
| `20260815210000_storage_do_diario_de_bordo.sql` | Bucket privado das fotos de etiqueta, com RLS por pasta do veículo. O cliente escreve e lê a própria pasta; a equipe lê tudo; **ninguém apaga** (trigger `protect_delete`). **Aplicada em produção em 2026-08-15.** |
| `20260815230000_consentimento_do_cliente.sql` | `atualizar_consentimento_canais()` — o cliente liga e desliga canal na área dele. Recusa nunca penaliza (regra 2). **Aplicada em produção em 2026-08-15.** |
| `20260817120000_conteudo_atualizado_em.sql` | `estoque_motors.conteudo_atualizado_em` + trigger: o `lastmod` do sitemap passa a ser data real de alteração de conteúdo, não `new Date()`. **Aplicada em produção em 2026-08-17.** |
| `20260817130000_descricao_seo.sql` | `estoque_motors.descricao_seo` — o texto do anúncio, fonte do feed dos portais e da meta description. **Aplicada em produção em 2026-08-17.** |
| `20260817140000_documento_do_estoque_e_cep.sql` | Documentação interna do veículo (chassi, placa) e `cep` do cliente. **Nunca no mapper público** — ver a nota de `placa` em `supabase.ts`. **Aplicada em produção em 2026-08-17.** |
| `20260818120000_falha_envio_nao_penaliza.sql` | `boas_vindas` e `revisao_verificada` passam a excluir `falha_envio` da deduplicação — sem isso, quem desligasse o WhatsApp mantendo o e-mail nunca mais receberia a boas-vindas (viola a regra 2). No mesmo arquivo, a montagem **com reserva** passa a ser serializada por `pg_advisory_xact_lock`. **Aplicada em produção em 2026-08-18.** |
| `20260818130000_vinculo_exige_email_confirmado.sql` | `reivindicar_garagem()` passa a exigir `email_confirmed_at` — antes, a segurança do vínculo dependia do checkbox "cadastro público fechado" no painel. Autoconferência prova a recusa. **Aplicada em produção em 2026-08-18.** |
| `20260818140000_desfecho_nao_regride.sql` | Desfecho não regride: `desfecho_pode_gravar()` (função pura, autoconferida em 19 transições) impede que um retry rebaixe `convertido` para `sem_resposta`. Sobrescrita recusada volta `sobrescrita_ignorada: true`, nunca erro. **Aplicada em produção em 2026-08-18.** |
| `20260819120000_cron_da_conformidade.sql` | Pacote 4: a série do §1.4 passa a andar sozinha por `pg_cron`, às 23h30 de Curitiba (`30 2 * * *` UTC — fim do dia, porque dia gravado nunca é reescrito). Entra o portão `rodar_conformidade_diaria()`, que fixa o fuso e se apresenta como chamador sem JWT — **e por isso é revogado de `anon` e `authenticated`**, senão viraria escada de privilégio. Autoconferência prova o agendamento, o portão fechado e o caminho do cron. **Aplicada em produção em 2026-08-19.** |
| `20260819130000_cron_da_matview_do_ciclo.sql` | Pacote 1: `vw_ciclo_estado` passa a se atualizar sozinha às 6h de Curitiba (`0 9 * * *` UTC), com `refresh materialized view **concurrently**` — sem o `concurrently` o refresh toma ACCESS EXCLUSIVE e trava o painel da equipe. Depende do índice único `idx_vce_veiculo`, criado junto com a view; a autoconferência exige os dois. **Aplicada em produção em 2026-08-21.** |
| `20260819140000_completude_da_venda.sql` | Pacote 2: completude do registro da venda (§3.2 e §9, meta >= 80%). `veiculos_vendidos.vendedor_id` passa a apontar para `profiles` (o texto livre `vendedor` fica para a base histórica), `profiles` ganha `telefone_e164`, e entram `vw_vendas_incompletas` (a rotina noturna lê daqui) e `completude_por_vendedor()`. **Aplicada em produção em 2026-08-21.** |
| `20260819150000_papeis_multiplos.sql` | Um usuário pode ter mais de um papel: `profiles.papeis` (array validado por `papeis_validos`), `role` vira espelho de `papeis[1]` mantido por trigger nos dois sentidos, `is_staff()` passa a olhar o array e entra `tem_papel()`. Autoconferência prova multi-papel, espelho e as duas recusas. **Aplicada em produção em 2026-08-21.** |
| `20260821120000_financeiro_operacional.sql` | Briefing 2026-08-21 (ver `docs/FINANCEIRO_OPERACIONAL.md`): **versiona e corrige `has_finance_access`** — ainda lia `role` singular, então quem tem `financeiro` como segundo papel era negado por TODA a RLS do módulo financeiro — e cria `investidores` + `movimentacoes_investidor` (aportes e retiradas, valor sempre positivo, retirada em carro de repasse com `veiculo_id`; FK sem ON DELETE: investidor com movimentação não se apaga, desativa). Autoconferência prova o segundo papel abrindo o financeiro e as recusas da régua do dinheiro. **Aplicada em produção em 2026-08-21.** |
| `20260821150000_alcada_de_aprovacao.sql` | A linha de R$ 1.500 da A17 ganha estado: `contas.status` aceita `aguardando_aprovacao`, entra a trilha da decisão (`aprovacao_decidida_por/em/motivo`, instante carimbado por trigger) e a autoconferência prova que `atualizar_contas_vencidas()` **não** envelhece conta aguardando. A régua de QUANDO sobe mora em `src/lib/alcada.ts`, e **não é um valor**: o limiar de R$ 1.500 foi desfeito pelo dono no mesmo dia — decide o ato (agendar × registrar). Importação e recorrente passam direto; ver `docs/FINANCEIRO_OPERACIONAL.md` §3. **Aplicada em produção em 2026-08-21.** |
| `20260821180000_papeis_gestor_e_investidor.sql` | Dois papéis novos, de naturezas diferentes: `gestor` é de painel (entra em `is_staff` e em `has_finance_access` — aprova agendamento, mexe em preço e custo, lê relatório) e `investidor` fica FORA do painel, como `cliente`. Entra `investidores.perfil_id` (único) com policies de **leitura própria** e `reivindicar_investidor()`, gêmea de `reivindicar_garagem()` — mesma exigência de e-mail confirmado. Autoconferência assume a sessão do investidor e prova que ele lê só o próprio extrato e não grava nada. **Aplicada em produção em 2026-08-21.** |
| `20260821210000_exclusao_financeira_so_admin.sql` | Separação de funções: **DELETE** em `contas`, `movimentacoes`, `compras_produtos` e `movimentacoes_investidor` passa a exigir `is_admin` — quem aprova agendamento não apaga a prova do que aprovou; os demais cancelam (`status = 'cancelado'`). A policy `FOR ALL` de cada tabela vira SELECT/INSERT/UPDATE no `has_finance_access` + DELETE no `is_admin`, e a leitura própria do investidor é recriada (a varredura derruba toda policy da tabela). **`is_admin` também é versionada e corrigida aqui**: lia `role = 'admin'`, então admin como papel secundário era negado — o terceiro gêmeo do bug multi-papel. Autoconferência assume as sessões de financeiro, gestor e admin secundário. **Aplicada em produção em 2026-08-21.** |
| `20260822120000_perfil_investidor.sql` | Perfil **Investidor**: `investidor_veiculos` (participação na compra) e `investidor_movimentos` (aportes e retiradas, valor sempre positivo — o sinal mora em `tipo`), com RLS por `investidor_id = auth.uid()` e a view `investidor_posicao` em `security_invoker`. Investidor **não é staff** de propósito — a autoconferência prova que ele fica fora de `is_staff` e de `has_finance_access`, que passa a somar `papeis` em vez de ler só o primário. **Aplicada em produção em 2026-08-22.** |
| `20260822130000_conciliacao_bancaria.sql` | Conciliação bancária (P4): a tabela `extrato_bancario`, que guarda a linha do banco como **prova, não lançamento** — não entra em cálculo de saldo e nunca vira movimentação sozinha. Idempotência por `(conta, fitid)`, porque reimportar extrato sobreposto é o fluxo normal; `movimentacao_id` único garante o um-para-um; `ON DELETE SET NULL` faz apagar a movimentação desfazer o vínculo sem apagar a prova. RLS na régua do módulo, com exclusão só do admin. Autoconferência prova os cinco. ✅ Aplicada 2026-08-22 — **com o número antigo `20260822120000`**, que depois foi cedido a `perfil_investidor` numa colisão de timestamp; o acerto do livro-razão está em `manutencao/acertar_livro_razao_da_colisao.sql`. |
| `20260822150000_aprovacao_de_recorrente.sql` | O cadastro de despesa recorrente passa pelo Gestor — o flanco que `20260821150000` deixou aberto. `aprovacao_status` é coluna SEPARADA de `ativa`: desligada pela operação e esperando aprovação são estados diferentes, e sobrepô-los faria "reativar" virar "aprovar". A geração exige as duas (`ativa and aprovada`). Default `aprovada` de propósito: toda recorrente existente está rodando hoje, e nascer `aguardando` faria a loja parar de pagar aluguel e energia. Carimbo da decisão por trigger, gêmeo do de `contas`. ⏳ **Ainda não aplicada.** |
| `20260822180000_lancar_do_extrato_atomico.sql` | `lancar_do_extrato()`: conta paga + movimentação + vínculo numa transação só. Existe porque a rota fazia as três escritas em sequência e desfazia com `.delete()` se uma falhasse — e **RLS que recusa DELETE não levanta erro**, apaga zero linhas e devolve sucesso. Para o financeiro (que não apaga, desde `20260821210000`) o rollback era no-op silencioso, e sobrava conta paga órfã que a próxima importação do OFX lançaria de novo. A correção não foi abrir DELETE: foi tirar a necessidade de desfazer. ⏳ **Ainda não aplicada.** |
| `20260822210000_fundir_investidores.sql` | Funde os dois módulos de investidor que 21 e 22/08 produziram em paralelo, e **repõe o `gestor` nas três réguas** que `perfil_investidor` reescreveu sem ele: o CHECK de `role`, `papeis_validos()` e `has_finance_access()`. O estrago do CHECK era o pior — quem já era gestor tinha uma linha que o CHECK novo recusa, então qualquer UPDATE nesse perfil falhava. Na fusão, `investidores` (a ficha) vence como identidade porque o sócio pode aportar sem nunca ter login; `investidor_veiculos` ganha `investidor_cadastro_id`; `investidor_movimentos` é COPIADO para o razão único e nada é apagado; `investidor_posicao` passa a somar do razão único, senão a tela do sócio e o painel do financeiro mostrariam saldos diferentes. Defensiva: cada passo checa se a tabela existe, porque a colisão de timestamp pode ter feito o `db push` pular `perfil_investidor` inteira. ⏳ **Ainda não aplicada.** |
| `20260826120000_ag_uid_no_lead.sql` | O par que faltava para o `(Ref: 0DCB1CDC)` das mensagens de WhatsApp: `leads.ag_uid` (o rastreio inteiro) mais `leads.ref_curta`, **gerada** como `upper(left(ag_uid,8))` e indexada. Gerada e não escrita de propósito — coluna comum poderia divergir do `ag_uid`, e duas verdades sobre o mesmo lead é exatamente o defeito que ela existe para impedir. O PostgREST tampouco sabe expressar predicado funcional, então sem a coluna a busca cairia em `ilike`, que não usa índice. O placeholder `ag_ref_nao_localizado` **não** é gravado: `/api/leads` aplica o mesmo `refCurta()` que decide se o cliente vê a referência. Sem backfill possível — o `ag_uid` dos leads antigos não foi guardado em lugar nenhum, e o painel diz isso em vez de deixar o atendente achar que digitou errado. Reescreve a tabela (`ADD COLUMN … GENERATED … STORED`), o que é irrelevante aqui: `leads` recusou todo insert até 2026-08-11. Autoconferência prova as duas colunas, o `attgenerated = 's'`, a expressão e o índice. ⏳ **Ainda não aplicada.** |

## `testes/` — as migrações rodam antes de irem para produção

Inaugurado em **2026-08-21**, e é a resposta à pendência §5.7 da auditoria
("testes de RLS exigem instância Supabase de teste... Docker não está
instalado nesta máquina"), aberta desde 2026-08-03.

O problema que ela descrevia era real e caro: toda migração séria daqui traz
**autoconferência** — um `do $$` que levanta exceção se a promessa do arquivo
não valer contra o banco. Só que ninguém as executava antes de empurrar. O
aceite só era conhecido quando o `db push` rodava em **produção**: um erro de
sintaxe dentro do `do $$`, ou uma promessa que o SQL não cumpre, aparecia lá.

Acontece que um **Postgres local basta**. O que faltava era escrever o pedaço
de Supabase que as migrações pressupõem — `auth.users`, `auth.uid()`,
`auth.jwt()`, os papéis do PostgREST e os *default privileges* do schema
`public`. É o `supabase/testes/andaime.sql`.

```bash
npm test                      # roda tudo; sem Postgres, pula os de migração
PSQL_TESTE="psql -h localhost -U postgres" npm test   # apontando para outro banco
```

`tests/migracoes-executam.test.ts` cria um banco descartável, aplica o andaime
e a cadeia declarada, e **exige que cada migração levante o próprio "Aceite
verificado"** — não basta não explodir: o aceite tem que ter rodado. Depois
confere o estado final (quem é staff, quem abre o financeiro, quem apaga).

Duas propriedades deliberadas:

- **Sem Postgres alcançável, os testes são PULADOS, não falham.** Quem só mexe
  em front-end não precisa de banco, e vermelho por falta de infraestrutura
  ensina a ignorar vermelho. Um teste que passa dizendo "não rodei" evita que
  isso vire silêncio.
- **A cadeia é uma lista explícita** no topo do arquivo de teste, não uma
  varredura da pasta: o andaime é um recorte, e varrer tudo faria o vermelho
  ser sobre o andaime, não sobre a migração. Pôr uma migração na lista é o
  gesto que a coloca sob teste — se ela precisa de uma tabela nova, a tabela
  entra no andaime junto.

⚠️ O andaime **não** é fonte de verdade de schema. Ele é o menor recorte que
faz a cadeia rodar; a fonte de verdade continua sendo `migrations/`.

### Vocabulário: o banco fala mais velho que a interface

O programa se chamava **"caderneta"** até 2026-08-14, quando o dono renomeou
para **Garagem Motors** (o lugar), **diário de bordo** (o registro) e
**procedência** (o que ele acumula) — decisão D8, registrada em
`AUDITORIA.md`. A interface, os documentos e as rotas foram renomeados; **as
migrações já aplicadas, não.**

Isso é deliberado: migração aplicada é registro histórico, e o arquivo tem
que continuar sendo exatamente o que rodou no banco. O mapa, para quem for ler
SQL daqui a um ano:

| No banco | Na interface, hoje |
|---|---|
| `carimbar_revisao()` | verificar revisão |
| `20260814150000_carimbo_e_conformidade.sql` | o pacote do diário de bordo |
| "carimbo" nos comentários das migrações do Ciclo | verificação |

Nenhum nome de **tabela ou coluna** foi afetado pela renomeação — o schema
sempre falou `manutencoes`, `confirmada_em`, `plano_revisoes`. Só o nome da
função e a prosa dos comentários carregam o termo antigo.

Atenção a um falso positivo: "carimbo" em `20260804200000_adicionar_last_seen_at.sql`,
em `src/lib/supabase.ts` e em `tests/ultimo-sync.test.ts` significa **carimbo de
tempo** do sync de estoque. Nada a ver com o Ciclo, e não se renomeia.

## Runbook — aplicar migração quando `api.supabase.com` falha

Sintoma: `Failed to fetch (api.supabase.com)` em `supabase login`, `link` ou
`db push`. Diagnosticado em 2026-08-07.

**Não é o banco.** Medido no dia: o PostgREST do projeto responde 200 e
`api.supabase.com` responde `Unauthorized` — a rede alcança os dois. O que
falha é a **API de gerenciamento**, usada por `login` e `link`. Duas causas
somam:

1. O projeto **nunca foi linkado** (não há `supabase/config.toml` nem
   `.temp/`), e `db push` sem link precisa da API de gerenciamento.
2. `db.<ref>.supabase.co` é **IPv6-only** (sem registro A). Em rede sem IPv6
   funcional, a conexão direta ao banco também falha — e o erro se parece com
   o mesmo "failed to fetch".

### Caminho que não passa pela API de gerenciamento

Use `--db-url` com o **session pooler**, que tem IPv4
(`aws-0-sa-east-1.pooler.supabase.com` → 54.94.90.106). A string sai do
dashboard em **Connect → Session pooler** (porta 5432; a 6543, de transaction
mode, não serve para DDL).

⚠️ A URI contém a senha do banco: não a cole em chat, ticket ou commit.

**Passo 1 — conferir o histórico remoto ANTES de empurrar:**

```
supabase migration list --db-url "<uri-do-session-pooler>"
```

**Passo 2 — só então:**

```
supabase db push --db-url "<uri-do-session-pooler>"
```

### 🔴 Por que o passo 1 não é opcional

Se `supabase_migrations.schema_migrations` estiver **vazia** no remoto, o push
tenta reaplicar o histórico inteiro — e o baseline não é seguro nesse cenário:

- `20260803120000` faz `CREATE TABLE IF NOT EXISTS public.veiculos`. Como
  `veiculos` virou `estoque_motors` no cutover, o `IF NOT EXISTS` não protege
  nada: **cria uma tabela `veiculos` vazia** e, em seguida, policies públicas
  de INSERT/UPDATE sobre ela.
- `20260804193000` faz `DROP VIEW IF EXISTS public.veiculos`. Sobre uma
  *tabela*, isso é erro (`is not a view`) e **aborta o push no meio**,
  deixando a tabela fantasma para trás.

Se a lista vier vazia, registre as quatro antigas como aplicadas — elas estão,
de fato — e só depois empurre as novas:

```
supabase migration repair --status applied 20260803120000 20260803120100 20260804193000 20260804200000 --db-url "<uri-do-session-pooler>"
```

(É o mesmo remédio que o cabeçalho do baseline já previa.)

### Alternativa: SQL Editor do dashboard

Cole o conteúdo **integral e sem edição** de cada arquivo de
`supabase/migrations/`, na ordem do nome. Isso não viola o `CLAUDE.md:62`
("nunca altere schema direto pelo painel"): a regra existe contra schema *não
versionado*, e aqui o arquivo versionado continua sendo a fonte de verdade —
o que muda é só o transporte. Depois, quando o CLI voltar a funcionar, alinhe
o histórico com `supabase migration repair --status applied <timestamp>` para
cada uma aplicada por essa via.

### Alternativa sem CLI: `supabase/manutencao/aplicar-migracao.js`

O transporte que comprovadamente funciona nesta máquina (o CLI não está
instalado e a API de gerenciamento já falhou antes): node + `pg`, que já está
em `node_modules`, contra o `SUPABASE_DB_URL` do `.env.local` — a mesma URI de
session pooler do runbook acima.

```
node supabase/manutencao/aplicar-migracao.js supabase/migrations/<arquivo>.sql           # ensaio
node supabase/manutencao/aplicar-migracao.js supabase/migrations/<arquivo>.sql --gravar  # aplica
```

O ensaio roda a migração **inteira** contra a produção numa transação e
reverte — sempre ensaiar antes de gravar. Os `RAISE NOTICE` das
autoconferências aparecem no terminal.

### 🔴 Nenhuma migração se registra sozinha no livro-razão

O livro-razão `supabase_migrations.schema_migrations` foi criado e semeado
pela `20260815120000` — mas **só o `supabase db push` registra o que aplica**.
Quem aplica por `aplicar-migracao.js`, psql ou SQL Editor grava o schema e
deixa o livro-razão para trás. Já aconteceu duas vezes (as migrações de SEO de
17/08 ficaram fora; correção em
`manutencao/registrar_migracoes_de_seo_no_livro_razao.sql`).

Por isso, **toda migração termina com o rodapé de auto-registro**, na mesma
transação do schema:

```sql
insert into supabase_migrations.schema_migrations (version, name)
  values ('<timestamp>', '<nome_sem_timestamp>')
  on conflict (version) do nothing;
```

O `on conflict do nothing` deixa o rodapé inofensivo sob `db push`, que
registra por conta própria. Migração sem esse rodapé não passa em revisão:
versão fora do livro-razão é o que faz um `db push` futuro tentar **reaplicar
o histórico** — o cenário do 🔴 acima.

### 🔴 A colisão de timestamp de 2026-08-22, e o que ela ensina

Duas migrações nasceram com o número `20260822120000` no mesmo dia, em
trabalhos paralelos: `conciliacao_bancaria` e `perfil_investidor`. A
conciliação cedeu e virou `20260822130000`.

**Por que isso é grave e não cosmético.** `version` é chave primária do
livro-razão, e todo rodapé de auto-registro daqui usa `on conflict (version)
do nothing`. A segunda a rodar registra nada e não reclama. Pior: um
`supabase db push` consulta o livro-razão, vê a versão presente e **pula o
arquivo inteiro** — o código vai para produção referenciando tabelas que
nunca foram criadas. Falha em silêncio, dos dois lados.

Foi o que aconteceu em produção: a conciliação entrou sob o número antigo e
`perfil_investidor` foi aplicada depois, à mão. **Resolvido em 2026-08-22** —
o livro-razão de lá agora diz `20260822120000 = perfil_investidor` e
`20260822130000 = conciliacao_bancaria`. Diagnóstico e acerto ficam
arquivados em `manutencao/acertar_livro_razao_da_colisao.sql`; a parte 1 é
somente leitura e continua servindo se a dúvida voltar.

**A lição para a próxima migração.** Antes de escolher o número, rode
`ls supabase/migrations/ | tail` **e** confira `origin/main` — trabalho
paralelo não aparece na sua árvore. O timestamp não é decorativo: é a chave
primária de um livro que decide o que roda e o que é pulado.

### Depois de aplicar: `conferir-estado-do-financeiro.sql`

Cole no SQL Editor e rode. É **somente leitura** e devolve 25 linhas; toda
linha tem que sair ✅. Uma linha ❌ aponta o que falta e de qual migração ela
vem — reaplicar essa migração resolve, porque todas são idempotentes.

```
supabase/manutencao/conferir-estado-do-financeiro.sql
```

**Por que existe, se as migrações já se autoconferem.** A autoconferência
prova o estado da migração *no momento em que ela rodou*, e some junto com a
transação. Esta consulta pergunta ao banco de produção **hoje**, em qualquer
dia — inclusive depois de alguém ter mexido pelo painel do Supabase, que é o
caminho que este projeto proíbe e que nenhuma migração consegue impedir. É
também o que responde "aplicou mesmo?" sem abrir seis telas.

Cada checagem foi **falsificada** antes de entrar — conferência que só se viu
verde não vale nada, porque não se sabe se ela olha. Duas rodadas:

- RLS de `extrato_bancario` desligada, índice único de `(conta, fitid)`
  derrubado e trigger do carimbo removido → acusou exatamente essas três
  linhas e mais nenhuma; reaplicadas as migrações, voltou ao verde.
- `lancar_do_extrato()` trocada por uma versão `security definer` sem a
  checagem de porta, e uma policy de DELETE a mais criada em `contas` (como
  alguém faria pelo painel num aperto) → acusou 17 e 18, e só.
- a cadeia inteira **sem** `20260822210000` (o estado de produção antes da
  fusão) → acusou 12, 19, 20, 21 e 22. Esta rodada existe porque a checagem
  12 antiga saía **verde** nesse mesmo banco: ela perguntava se
  `has_finance_access` lia `papeis`, e a migração paralela manteve `papeis`
  enquanto derrubava o `gestor`. Falso verde no que mais importava.

## ⚠️ Contrato com o sync — campos do painel

Decisão do dono em 2026-08-07: o RevendaMais será descontinuado em breve, e os
campos que o feed não fornece são preenchidos **pelo painel**. A regra, literal:
*"se o campo não existe no sync, não sobrescreva, mantenha o atual, mesmo que
seja em branco."*

O upsert do workflow n8n (`Antigravity - Sincronizador de Estoque`) só escreve
as colunas que ele nomeia. As colunas da migração `20260807160000` ficam FORA
desse mapeamento — é isso que preserva o que foi digitado no painel a cada
ciclo. **Não adicione essas colunas ao workflow**: o feed não as tem, e o
upsert as sobrescreveria com vazio. Quando o RevendaMais desligar, o sync para
e todas as colunas passam a ser do painel, sem migração extra.

---

## ⚠️ Runbook do cutover `veiculos` → `estoque_motors`

**Este rename não é uma migração isolada. É um cutover coordenado em 4 passos,
e dois deles são manuais.**

A tabela de inventário é escrita por um agente externo — o workflow n8n
`Antigravity - Sincronizador de Estoque`. Renomear a tabela sem tocar no
workflow faz o sync apontar para um nome que não existe mais. Ele não quebra
alto: o estoque simplesmente para de atualizar, e o site segue servindo dados
cada vez mais velhos até alguém notar.

> **Correção de 2026-08-04:** este documento afirmava que o sync roda a cada 6
> horas. O workflow ao vivo tinha **só um `manualTrigger`** e estava
> `active: false` — não havia agendamento nenhum. O "a cada 6h" vinha de uma
> cópia versionada que não correspondia ao que rodava. Ver passo 3.
>
> **⚠️ Vencida em 2026-08-17:** o sincronizador **voltou a rodar**, agora com
> cron de 6 horas de verdade, e o estoque do site convergiu de 64 para 41
> veículos no primeiro ciclo. Os parágrafos abaixo descrevem o estado de
> 04/08 e ficam como histórico — não como o presente.

A view de compatibilidade criada no passo 2 existe exatamente para cobrir a
janela entre os passos 2 e 3.

### Passo 1 — deploy do código ✅ feito no Pacote 0.5

Os 10 pontos de acesso já usam `estoque_motors`. Enquanto o passo 2 não roda,
esse código aponta para uma tabela que ainda não tem esse nome.

> **Portanto: os passos 1 e 2 precisam ir juntos.** Se o deploy do código subir
> sozinho, o site cai no fallback e passa a servir `MOCK_ESTOQUE` — 5 veículos
> fictícios (`src/lib/supabase.ts:17`), em produção, sem erro visível.
> Se preferir margem de segurança, rode o passo 2 **antes** do deploy: a view de
> compatibilidade faz o código antigo continuar funcionando normalmente.

Guarda automatizada: `npm test` → `tests/nomenclatura-estoque.test.ts`.

### Passo 2 — aplicar as migrações

```bash
supabase db push
```

Cria `estoque_motors` e a view `veiculos` que aponta para ela. A partir daqui
**os dois nomes funcionam** — código novo e workflow antigo convivem.

Confirme que o rename ocorreu:

```sql
SELECT relname, relkind FROM pg_class
WHERE relname IN ('veiculos', 'estoque_motors');
-- esperado: estoque_motors = 'r' (tabela), veiculos = 'v' (view)
```

### Passo 3 — atualizar o workflow n8n 🔧 MANUAL, **PENDENTE**

> 🔴 **Os passos 3 e 4 foram executados fora de ordem.** O passo 4 foi aplicado
> em 2026-08-04 sem o passo 3. A view não existe mais e o workflow ao vivo
> ainda apontava para o nome antigo: **o sync está quebrado agora**, e só volta
> quando o workflow corrigido for importado.

A cópia exportada em 2026-08-04 revelou que **o workflow ao vivo não é o que
estava versionado aqui**. Diferenças que importam:

| | cópia antiga do repo | workflow ao vivo |
|---|---|---|
| nó de escrita | `Create a row` (nó Supabase, credencial) | `Upsert Veículo (HTTP)` (`httpRequest`) |
| alvo | `estoque_motors` | `/rest/v1/veiculos` ← **quebrado** |
| agendamento | `scheduleTrigger` a cada 6h | **só `manualTrigger`** |
| duplicatas | insert (AUDITORIA §1.4) | `Prefer: resolution=merge-duplicates` — upsert de verdade |
| credencial | credencial do n8n | **`service_role` JWT inline nos headers** |

Resolve AUDITORIA §5.9 e §1.4: o insert-sem-upsert já estava resolvido ao vivo;
o `"active": false` era real e o agendamento de 6h **não existia** no workflow
que rodava — o sync só acontecia quando alguém clicava.

> **Estado atual (2026-08-17):** o sync está **ativo, com cron de 6 horas**. A
> tabela acima é o retrato de 04/08 e explica por que a cópia versionada
> divergiu do que roda — divergência que já apareceu duas vezes. Antes de
> confiar no JSON deste repositório, **exporte o workflow ao vivo e compare**.

`Antigravity - Sincronizador de Estoque (estoque_motors).json` neste repositório
é a versão corrigida (alvo `estoque_motors`, campo `combustivel` restaurado),
com o JWT trocado por `{{ $env.SUPABASE_SERVICE_ROLE_KEY }}` — **este repositório
é público e não pode conter a chave**. Importar exige configurar essa variável
no n8n.

### Passo 4 — remover a view de compatibilidade ✅ APLICADO 2026-08-04

Aplicado à mão pelo dono. Verificado: `public.veiculos` responde 404 /
`PGRST205`, `estoque_motors` segue servindo.

O SQL vivia em `pendente/`, **fora de `migrations/` de propósito**: se estivesse
dentro, o `supabase db push` do passo 2 aplicaria a remoção na mesma execução
que cria a view, fechando a janela de compatibilidade no instante em que ela é
aberta. Com a janela já fechada, foi movido para
`migrations/20260804193000_remover_view_compat_veiculos.sql`.

Guarda automatizada: `tests/migracoes.test.ts` exige que a remoção esteja
versionada, venha depois da migração que cria a view, seja idempotente, e que
`pendente/` não acumule passo manual esquecido.

### Rollback

Antes do passo 4, o rollback é barato — os dois nomes funcionam:

```sql
DROP VIEW IF EXISTS public.veiculos;
ALTER TABLE public.estoque_motors RENAME TO veiculos;
```

E reverter o deploy do código. Depois do passo 4, o workflow n8n já estará em
`estoque_motors` e o rollback exige desfazer o passo 3 também.

---

## Estado do cutover — verificado em 2026-08-03

Migrações aplicadas com sucesso. Verificado por consulta direta ao banco
(somente leitura), não pela mensagem de sucesso do `db push`:

| Verificação | Resultado |
|---|---|
| `estoque_motors` existe, com dados reais | ✅ 78 linhas, 27 colunas |
| A tabela é a original renomeada, não uma criada pelo baseline | ✅ tem `created_at`, coluna que o baseline não criava |
| View de compatibilidade `veiculos` responde | ✅ mesmas 78 linhas, mesmas colunas |
| `getEstoque()` da vitrine funciona | ✅ retorna estoque real |

> **Nota de 2026-08-13:** a tabela acima é a fotografia de 2026-08-03 e o
> parágrafo que vivia aqui ("passos 3 e 4 continuam pendentes") envelheceu — o
> passo 4 foi aplicado em 2026-08-04 (ver a seção do passo 4 acima) e o
> sincronizador corrigido está no repositório. O que restou do passo 3 é a
> importação no n8n com `SUPABASE_SERVICE_ROLE_KEY` configurada por lá.
> Atenção: a `public.veiculos` **voltou** a existir em produção como tabela
> (reexecução do baseline; `AUDITORIA.md` §3.4-c) — removê-la é pré-requisito
> para qualquer `db push` futuro.

## Resolvido no cutover

- **§5.6 — qual projeto é produção: `zwbqmzgnagfeqinqkolp`.** É o que estava em
  `.mcp.json`, no `.env.local` e no sincronizador do n8n. O `CLAUDE.md` dizia
  `lanatcqpskcmifuxfatn`; **corrigido em 2026-08-08**, com o dono confirmando o
  ref. Como `CLAUDE.md` está no `.gitignore`, essa correção vive só na máquina
  de quem trabalha no projeto — vale decidir se ele deveria sair de lá, senão a
  próxima cópia do repositório volta com o ref errado.
- **§5.3 — schema real conhecido.** O baseline foi corrigido contra o banco.
  A reconstrução original errava em 4 pontos: declarava `placa`, `fipe` e
  `preco_compra`, que não existem, e omitia `created_at`.

## 🔴 Dois bugs de produção que a verificação revelou

Nenhum é regressão do rename — as colunas nunca existiram. O rename só forçou
a primeira leitura real do schema, que os expôs.

- **`/api/financeiro/margens`** seleciona `preco_compra` explicitamente. A query
  falha inteira (`column estoque_motors.preco_compra does not exist`) e o painel
  de margens não lista nada.
- **`/api/financeiro/margens/consulta`** busca por `placa`, que também não
  existe. Aqui a falha é **silenciosa**: o código ignora o `error` e cai no
  fallback por ID. A busca por placa nunca funcionou.

Decisão pendente: criar as colunas e popular, ou remover as leituras do código.

## Pendências que ainda bloqueiam o Pacote 1

- **§5.4 — onde está a base histórica de vendas e leads.** Nenhum lead é
  persistido no Supabase; `/api/leads` e `/api/avaliacao` só repassam ao n8n.
  Bloqueia o planejamento do mutirão do manual §3.3, não a criação do schema.
- **§5.7 — testes de RLS** exigem instância Supabase de teste. O runner já
  existe; falta o alvo. Docker não está instalado nesta máquina, então
  `supabase start` exige instalar Docker Desktop — ou usar um segundo projeto
  Supabase como alvo de teste.
- **Tipo das colunas de imagem** (`whatsapp_images`, `web_full_images`):
  PostgREST não distingue `jsonb` de `text[]`. `supabase db pull` resolve.
