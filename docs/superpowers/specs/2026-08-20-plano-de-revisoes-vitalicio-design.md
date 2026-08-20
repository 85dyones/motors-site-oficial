# Plano de revisões vitalício — design

**Data:** 2026-08-20 · **Pacote:** D2 do Motors Ciclo · **Status:** desenho aprovado, não implementado

Fecha a divergência **D2** levantada em
[`2026-08-20-contato-triagem-faq-design.md`](2026-08-20-contato-triagem-faq-design.md) §5:
o plano de revisões seca na terceira, e a Garagem Motors é vitalícia.

> Direção do dono, 2026-08-20: *"Não podemos travar em 3 revisões, o carro
> precisa ter revisões regulares, durante todo o período em que o carro for do
> cliente."* E, na mesma conversa: a Garagem Motors é vitalícia por força de
> expressão, **até a próxima venda do carro**.

A mesma direção pede escopo de itens maior que a troca de óleo (correia,
pastilhas, discos, suspensão, óleo de câmbio). **Isso não entra aqui** — é o
pacote 2. O dono respondeu as três dúvidas dele em 2026-08-20 (§8), então ele
deixou de estar travado por falta de decisão; segue dependendo da Emenda 02
escrita e aprovada, e do levantamento por modelo. Ver §7.

---

## 1. O que a produção diz

Medido em `zwbqmzgnagfeqinqkolp` em 2026-08-20, por `aplicar-migracao.js` sem
`--gravar` (transação revertida):

```
veiculos_vendidos: 0    plano_revisoes: 0    manutencoes:  0
contratos_ciclo:   0    clientes:       0    conformidade_diaria: 0
```

**Nenhuma venda foi fechada.** Não há backfill a escrever e não há prazo
apertado: a primeira terceira revisão vence, no mínimo, três anos depois de uma
primeira venda que ainda não aconteceu.

O mesmo ensaio confirmou que o deployado é o que está no repo — e que a função
viva é a de `20260817140000_documento_do_estoque_e_cep.sql`, **não** a de
`20260814120000`:

```
fechar_venda_ciclo → contém "generate_series(1, 3)":           t
                   → contém "revisoes_previstas', 3":          t
carimbar_revisao   → fallback "else v_dentro := false":        t
                   → reprojeta o plano (toca janela_inicio):   f
montar_fila        → janelas por INNER JOIN em plano_revisoes: t
```

## 2. O que quebra na quarta revisão

Nada estoura. Tudo degrada em silêncio, e um dos modos pune o cliente certo.

1. **A revisão correta é carimbada como "FORA DA JANELA".**
   `carimbar_revisao` procura a janela aberta e, não achando, faz
   `v_dentro := false`. Sem linha em `plano_revisoes`, a quarta revisão — feita
   no prazo, com foto da etiqueta — recebe o selo vermelho em
   `FilaDeVerificacao.tsx:491`, e a loja lê *"Entra no diário de bordo, não na
   procedência"*. O cliente é penalizado pela ausência de uma linha que o
   sistema deveria ter criado. Colide com o espírito da regra 2 do CLAUDE.md e
   com o §5.7, onde o carimbo **é** o ativo.

2. **O motor de gatilhos emudece.** `montar_fila_de_gatilhos` monta o CTE
   `janelas` com `join public.plano_revisoes`. Sem linhas, somem
   `revisao_programada` e `elegibilidade_em_risco` — dois dos quatro gatilhos.
   `boas_vindas` já disparou na venda. Sobra `revisao_verificada`, que só
   dispara se o cliente lançar uma revisão espontaneamente, sem nunca ter sido
   lembrado.

3. **A conformidade do §5.7 infla, e é ela que guarda o gatilho do §1.4.**
   Em `calcular_conformidade_diaria` o veículo entra no denominador por ter
   janela vencida, e no numerador por não sobrar janela vencida em aberto.
   Feitas as três, ele conta como "em dia" **para sempre** — inclusive dez anos
   depois sem passar na rede.

4. **`/garagem` não quebra, mas mente por omissão.** `GaragemVeiculo.tsx:147`
   cai no `else` e escreve "Nenhuma janela em aberto.", que se lê como "nada
   pendente", permanentemente.

5. **`/admin/ciclo/*` não lê `plano_revisoes`** e não quebra. O estrago chega
   até a loja indireto, pelo selo falso do item 1 e pelo número inflado do 3.

### Dois achados adjacentes

**A reprojeção do §1.5 nunca foi implementada.** O manual diz que o plano é
*"gerado no fechamento da venda e reprojetado a cada revisão confirmada"*. A
função deployada não toca em `janela_inicio` nem `janela_fim`.

**O teste das três camadas guarda o arquivo errado.**
`tests/ciclo-venda-fechamento.test.ts:32` lê `20260814120000` por nome, mas a
função viva vem de `20260817140000`. O teste passa verde guardando código morto
desde 17/08.

## 3. As opções

**Estender o `generate_series`** — descartada. Trocar 3 por 10 exige inventar o
10, contra a regra "não invente número" do CLAUDE.md; continua finita; e
materializa dez janelas calculadas da data da venda que a própria promessa de
reprojeção diz que não valem.

**`plano_revisoes` como view projetada na hora** — descartada. A tabela tem
`manutencao_id`, que é o casamento auditável entre revisão e janela; tem
unique, índice e duas policies vivas (`plano_revisoes_staff`,
`plano_revisoes_cliente_le`). E tornaria a série histórica de conformidade
recomputável, quando o §1.4 precisa dela imutável.

**Geração sob demanda — escolhida.** É o plano aberto, materializado uma janela
por vez, para sempre. A venda cria a primeira; cada revisão confirmada abre a
seguinte a partir da data e do KM do serviço — que é literalmente a reprojeção
que o §1.5 promete e que nunca foi escrita. Nenhum número novo. E concentra a
régua numa função só, que é o que deixa o plano por modelo entrar depois sem
refatoração.

## 4. Arquitetura

### 4.1 O gerador

`public.abrir_proxima_janela(p_vv uuid) returns uuid` — a única função que sabe
a régua. Devolve o id da janela criada, ou `null` quando não havia o que criar.

Não faz nada se o veículo não existe, se tem `saiu_em`, ou se já tem janela
aberta (`manutencao_id is null`). **Um veículo tem no máximo uma janela
aberta.**

O **marco** é a última revisão programada confirmada (`data_servico`,
`km_registrado`); não havendo nenhuma, é a venda (`data_venda`, `km_na_venda`).

"Confirmada" é `confirmada_em is not null` — e só isso. Revisão recusada não é
marco (ela nunca ganha `confirmada_em`). Revisão confirmada **fora** da janela
**é** marco: ela aconteceu, o carro passou pela rede, e o KM que a etiqueta
provou é o ponto real mais recente. `dentro_da_janela` mede conformidade, não
existência — misturar as duas coisas aqui faria o atraso empurrar a próxima
janela para trás e punir duas vezes.

```
numero_revisao = maior já existente + 1   (1 se não houver)
km_previsto    = km do marco + 10.000
prevista       = data do marco + 12 meses
janela_inicio  = prevista − 30 dias
janela_fim     = prevista + 30 dias
```

É a fórmula do §1.5 aplicada ao último ponto real. O §1.5 diz que revisão
antecipada *"reinicia a contagem a partir da data e do KM registrados"*; aqui
isso vale também para a atrasada, porque contar a próxima da régua original
puniria duas vezes quem revisou com 40 dias de atraso. Não é número novo — é a
mesma fórmula, ancorada no último fato conhecido.

Detalhes que a implementação precisa acertar:

- **`select ... into` sem linha zera a variável.** Ler o marco num `record`
  separado e só sobrescrever `v_data`/`v_km` dentro de `if found`, ou a venda
  vira `null` sempre que não houver revisão confirmada.
- **`on conflict (veiculo_vendido_id, numero_revisao) do nothing`** no insert.
  O único concorrente real é cron × carimbo no mesmo instante; o unique já
  existe e essa cláusula transforma corrida em no-op.
- **Direitos de invocador, sem `security definer`.** A RLS de `plano_revisoes`
  já barra quem não é staff. `revoke` de `public` e `anon`; `grant execute` a
  `authenticated` e `service_role` — `authenticated` é obrigatório porque
  `fechar_venda_ciclo` e `carimbar_revisao` são invoker-rights e a chamada
  aninhada exige o privilégio do chamador.

**É esta função que segura a porta do plano por modelo aberta.** Quando os
intervalos por modelo existirem, muda o corpo dela — e mais nada.

### 4.2 Os três chamadores

| Onde | Mudança |
|---|---|
| `fechar_venda_ciclo` | as 9 linhas do `generate_series` viram uma chamada; o retorno `'revisoes_previstas', 3` vira `primeira_revisao` (nenhum consumidor em `src/` ou `tests/` — verificado) |
| `carimbar_revisao` | `v_dentro := null` no lugar de `false` quando não há janela; e a chamada ao gerador como **última coisa antes do `return`** |
| cron diário | rede de segurança: todo veículo sem `saiu_em` e sem janela aberta ganha uma |

**Por que o gerador é a última coisa em `carimbar_revisao`:** a cláusula que
devolve `status_elegibilidade` de `em_risco` para `elegivel` testa
`not exists (... manutencao_id is null and janela_fim < current_date)`. Uma
revisão lançada com `data_servico` muito antigo produz janela nova já vencida,
que bloquearia a recuperação. Gerando depois, a decisão de elegibilidade é
tomada sobre o estado que o carimbo produziu, e a janela nova — se nascer
vencida — é tratada pelo gatilho 7 no dia seguinte, que é onde ela pertence.

**Janela vencida e não cumprida não gera outra.** Se a 3ª venceu e ninguém
confirmou, ela continua sendo a janela aberta, o gatilho 7 faz seus três passos
e para. Recusa (`recusada_em`) também não gera: a janela segue aberta, que é o
certo.

### 4.3 O cron

Segue o padrão de `20260819120000_cron_da_conformidade.sql`, que é o precedente
do projeto:

- `public.rodar_abertura_de_janelas() returns jsonb` — fixa
  `timezone = 'America/Sao_Paulo'`, faz
  `perform set_config('request.jwt.claims', '', true)` e varre os veículos
  ativos sem janela aberta, chamando o gerador e contando.
- `revoke all from public, anon, authenticated` · `grant execute to service_role`.
  É um portão de serviço, como o comentário da `rodar_conformidade_diaria`
  avisa: **nunca** conceder a `authenticated` ou `anon`.
- `cron.schedule('abertura-de-janelas', '0 3 * * *', ...)` — 03:00 UTC =
  **meia-noite em Curitiba**, logo depois de a conformidade fechar o dia às
  23h30. Assim uma janela aberta hoje entra na série de amanhã e nunca altera
  um dia já gravado. `cron.schedule` com nome existente atualiza em vez de
  duplicar.

### 4.4 O estado terminal

`veiculos_vendidos` ganha:

```sql
saiu_em      date
motivo_saida text
-- check: saiu_em is null or coalesce(trim(motivo_saida), '') <> ''
```

**Sem lista fechada de motivos.** Fixá-la agora seria inventar o vocabulário do
negócio antes de a loja ter visto um caso. Quando houver casos reais, um
`check` vira o vocabulário — é migração de uma linha.

O que `saiu_em` desliga:

- **o gerador** (§4.1);
- **os gatilhos** — `and vv.saiu_em is null` no CTE `veic` de
  `montar_fila_de_gatilhos` corta os quatro de uma vez;
- **a escrita do cliente** — `manutencoes_cliente_registra` e
  `leituras_odometro_cliente_registra` ganham a condição.

**As policies de SELECT não mudam.** O ex-dono não perde o diário de bordo, só
para de escrever nele. A leitura é dado dele, e o §6.3 não prevê apagá-la
porque o carro mudou de mãos.

Onde se marca: `/admin/ciclo/verificacao` já carrega a lista inteira de
`veiculos_vendidos` (`api/ciclo/revisoes/route.ts:90`) para o formulário da
loja. O controle nasce ao lado do seletor que já existe — não há tela nova, e
hoje **não existe nenhuma outra tela de admin que liste veículos vendidos**.
O seletor passa a marcar os encerrados; a loja continua podendo lançar uma
revisão antiga neles.

### 4.5 O selo que mentia

`dentro_da_janela` passa a ter três estados com três leituras:

| Valor | Selo | Significado |
|---|---|---|
| `true` | NA JANELA | cumpriu a janela |
| `false` | FORA DA JANELA | havia janela e o serviço não a cumpriu |
| `null` | SEM JANELA (neutro) | não havia janela — não se aplica |

Hoje `null` cai no ramo vermelho de `FilaDeVerificacao.tsx:491` e é lido como
atraso. Mesma distinção nas duas mensagens de retorno da API
(`FilaDeVerificacao.tsx:120` e `:172`).

Na conformidade nada muda: o numerador do §5.7 já só conta
`dentro_da_janela = true`.

### 4.6 As três camadas TypeScript

- `REVISOES_NO_CONTRATO` sai de `src/lib/ciclo/vendaFechamento.ts`.
- `planoDeRevisoes` vira `projetarRevisoes(marcoData, marcoKm, quantidade)` —
  projeção declarada, sem fingir que virou linha no banco. `INTERVALO_KM`,
  `INTERVALO_MESES`, `TOLERANCIA_DIAS` e `TOLERANCIA_KM` permanecem.
- A prévia de `FechamentoDeVenda.tsx:678` passa a mostrar **a janela que será
  criada de fato**, mais a frase da cadência — *"a cada 10.000 km ou 12 meses,
  o que vier primeiro, enquanto o carro for seu"* — no lugar da tabela de três
  linhas que o banco não vai mais materializar.
- `/garagem`: o veículo com `saiu_em` continua listado com o diário íntegro; o
  bloco PRÓXIMA REVISÃO diz "encerrado em ‹data›" em vez de "Nenhuma janela em
  aberto." A query de `garagem/page.tsx:123` passa a trazer `saiu_em`.
- `supabase/seeds/ciclo_dev.sql` troca o `generate_series(1, 3)` por uma chamada
  ao gerador.

## 5. A migração

Arquivo único: `supabase/migrations/20260820120000_plano_de_revisoes_vitalicio.sql`,
com schema, gerador, os três chamadores, as duas policies de escrita, o cron, a
autoconferência e o rodapé de auto-registro no livro-razão.

> ⚠️ `fechar_venda_ciclo`, `carimbar_revisao` e `montar_fila_de_gatilhos` são
> reescritas por `create or replace` **inteiras**. Partir do arquivo vivo —
> `20260817140000` para a primeira, `20260814180000` para as outras duas — e
> aplicar só as edições descritas aqui. Não redigitar de memória: o cabeçalho
> da própria `20260817140000` registra o preço dessa tentativa (a detecção de
> financiamento afrouxou e a validação mudou de ordem).

Ensaio obrigatório antes de gravar:

```
node supabase/manutencao/aplicar-migracao.js supabase/migrations/20260820120000_plano_de_revisoes_vitalicio.sql
```

O `--gravar` só com aprovação explícita do dono.

## 6. Testes

**Autoconferência dentro da migração**, revertida ao fim, no padrão do projeto:

1. Venda fechada cria **uma** janela, número 1.
2. Carimbar a 1ª gera a 2ª, com marco na data e no KM do serviço — não na venda.
3. Carimbar a 4ª, a 7ª e a 12ª continua gerando: o plano não seca. É a prova
   direta do que o dono pediu.
4. Recusa não gera janela nova e a anterior segue aberta.
5. Veículo com `saiu_em` não ganha janela — nem pelo carimbo, nem pelo cron.
6. Revisão sem janela sai com `dentro_da_janela = null`, nunca `false`.
7. `montar_fila_de_gatilhos` devolve vazio para veículo com `saiu_em`.
8. Cliente não consegue inserir em `manutencoes` nem `leituras_odometro` de
   veículo com `saiu_em`, e continua lendo os dois.

**Vitest:**

9. `projetarRevisoes` mantém a régua do §1.5 (10.000 km, 12 meses, ±30 dias).
10. O teste das três camadas **localiza sozinho a última migração que define
    `fechar_venda_ciclo`**, em vez de abrir um nome fixo. Corrigir o alvo
    importa mais do que corrigir o caso: foi o nome fixo que deixou o teste
    verde guardando código morto por três dias.

## 7. Fora de escopo

### Pacote 2 — escopo de itens da revisão

A direção do dono de 2026-08-20 pede que a revisão cubra correia, pastilhas,
discos, suspensão e óleo de câmbio, além do óleo de motor — enquadrados por ele
como *"plus, algo a mais, que vai poupar a loja e futuros proprietários de
revisões maiores"*. É posicionamento preventivo, e é a justificativa que a
Emenda 02 precisa carregar.

**O que ainda falta.** O §1.5 diz hoje: *"A troca de óleo é o item obrigatório
da revisão programada, e é ela que a prova atesta"*. Varredura em
`MANUAL_MOTORS_CICLO.md` e `EMENDA_01_MANUAL_CICLO.md` por correia, pastilha,
disco, suspensão, câmbio, fluido, vela e arrefecimento retorna **zero
ocorrências** — vocabulário inteiramente novo, que pede **Emenda 02 aprovada
pelo dono**, como foi a Emenda 01. Esta spec registra a substância decidida em
§8; **não** redige a emenda.

**A prova, resolvida (§8.1).** Era a colisão mais funda deste documento:
`manutencoes.url_etiqueta_atual` é *"prova obrigatória"* e `carimbar_revisao`
levanta `CARIMBO_SEM_ETIQUETA` sem ela — e correia, pastilhas e suspensão não
têm etiqueta de óleo. O dono resolveu mantendo o princípio e ampliando o
artefato: a prova continua **material** — foto da peça velha e da nova, nota
fiscal, orçamento. O §5.7 fica de pé (registrar não é o ativo, a prova
verificável é); o que muda é que `CARIMBO_SEM_ETIQUETA` passa a exigir **haver
prova**, não haver *aquela* prova.

**O tamanho real do levantamento por modelo.** O dono mandou procurar as
recomendações de todos os fabricantes do estoque, sob demanda. Medido no
estoque em 2026-08-20: **97 veículos, 19 fabricantes, 91 combinações
marca+modelo distintas, anos de 1976 a 2025, 41 automáticos** — incluindo três
motos (Suzuki GSX-R 750, Harley-Davidson Dyna Glide, JTZ Chopper) e um Fusca
1976. Não são 19 consultas: são ~91 planos de anos-modelo diferentes, num
estoque que gira. Catálogo montado para o estoque de hoje estaria vencido antes
de ficar pronto.

Daí a leitura de "sob demanda": **o levantamento acompanha a venda, não o
estoque.** Proposta para a spec do pacote 2 — catálogo que se preenche pelo
uso: na primeira venda de um modelo, o plano do fabricante é consultado e
gravado; nas vendas seguintes do mesmo modelo, reaproveitado. Uma consulta por
modelo vendido, nunca 91 de antemão.

E a régua passa a ter dois níveis, que é o que *"a fabricante tem supremacia"*
(§8.2) implica: **plano do fabricante quando existe, §1.5 como piso quando não
existe.** O piso não é opcional — um Fusca 1976 e uma Harley não têm plano
publicado acessível, e a Garagem não pode ficar sem cronograma por causa disso.

**Cadência por peça continua não sendo o modelo certo.** Fabricante publica uma
tabela de revisões (10.000, 20.000, 30.000 km) em que cada parada tem lista de
itens diferente; correia aos 60.000 não é cronograma próprio, é item que cai na
revisão dos 60.000. `plano_revisoes` mantém a forma; o que falta é **o que cada
revisão cobre**. O dono confirmou (§8.3) que pastilhas, discos e suspensão
entram como **inspeção** na revisão que já existe, não como régua nova.

`manutencoes.itens jsonb` já existe desde a fundação, sem comentário, sem
`check` e sem ninguém que escreva nela. É o gancho natural do pacote 2.
**Nenhuma coluna é adiantada nesta migração** — o pacote 1 não depende de
nenhuma delas, e o desenho do catálogo é assunto da spec do pacote 2.

### Dívidas registradas

- **A janela aberta não se move com o KM declarado.** O §1.5 diz que a data
  prevista é recalculada a cada novo ponto de KM; hoje não é, e não passa a ser
  aqui. O aviso já antecipa por KM no gatilho 1 (`km_hoje >= km_previsto − 800`)
  e o carimbo já confere as duas réguas — o que sobra é a data mostrada na
  Garagem ficar otimista para quem roda muito.
- **Lista fechada de `motivo_saida`** (§4.4).
- **Recompra:** nada. O gatilho do §1.4 não abriu (regra 5 do CLAUDE.md).

## 8. Respostas do dono — 2026-08-20

As três perguntas do pacote 2 foram respondidas. Ficam registradas aqui porque
é delas que a Emenda 02 nasce.

**8.1 — O que prova uma revisão sem etiqueta de óleo?**
> *"Continuamos na mesma linha, prova material: se houve compra e troca de
> peças, tem como haver foto de peça velha e nova, nota fiscal etc."*

A prova deixa de ser um artefato único e vira um conjunto de artefatos
materiais. O princípio do §5.7 não muda.

**8.2 — De onde vêm os intervalos?**
> *"Fonte publicada, a fabricante tem supremacia."*

Nenhum número estimado, nunca. E "supremacia" implica hierarquia: o plano do
fabricante manda, e o §1.5 é o piso para quando não há plano publicado.

**8.3 — Pastilhas, discos e suspensão são inspeção, não cadência própria?**
> *"Confere."*

### Uma leitura ainda em aberto

O dono chamou os itens extras de **"plus, algo a mais"**. Falta decidir se isso
significa que eles entram na régua de conformidade do §5.7 — e portanto no
gatilho do §1.4 — ou se são valor adicional enquanto só a troca de óleo decide
procedência. A segunda leitura preserva a cadeia da Emenda 01 intacta e é a que
esta spec assume até haver decisão. **Não trava o pacote 1**, que não toca em
item nenhum.

## 9. Ordem de execução

1. Migração `20260820120000`, com autoconferência.
2. Ensaio contra a produção (`aplicar-migracao.js` sem `--gravar`).
3. Camadas TypeScript, telas e testes.
4. `--gravar` só com aprovação explícita do dono, e deploy junto — a prévia do
   vendedor e o banco não podem divergir nem por um deploy.
5. PR único. Uma tarefa por PR, conforme CLAUDE.md.
