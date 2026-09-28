# Garagem Profiler (/carro-perfeito): "Três do Pátio"

Data: 2026-09-25 · **Fase 1 implementada em 25/09** (`lib/motorDoMatch.ts`,
`lib/fichaDoMotor.ts`, `components/ResultadoDoProfiler.tsx`), com as decisões
1, 2 e 5 da seção 10 aprovadas pelo dono no mesmo dia. As demais seguem
abertas. O que a fase 1 entregou diferente do plano está anotado na seção 6.

Pedido do dono: *"o /carro-perfeito continua oferecendo resultados genéricos...
gerar novas propostas de valor para a seção, mantendo a ideia original que é
guiar os clientes mediante seu perfil de desejo e nosso estoque, mas também dar
a opção de descoberta para aqueles que ainda não têm algo certo, direcionando o
desejo para carros que possam fazer sentido para o perfil dele"*.

## 1. Por que o resultado sai genérico (medido em 25/09)

Base: o estoque que o site publica hoje. São 37 veículos, porque Kombi e Parati
têm menos de `MINIMO_DE_FOTOS` (4) e `publicavel()` as tira. Sem a moto, sobram
36 carros. Mediana R$ 72.900. O motor atual (`lib/car-match.ts` +
`/api/match`) foi replicado fora do site e rodado nas 320 combinações do quiz
(4 faixas × 4 objetivos × 4 "o que pesa" × 5 carrocerias).

| Medida | Hoje |
|---|---|
| Conjuntos top-6 distintos em 320 combinações | 166 |
| Trios de topo distintos na faixa "até R$ 50 mil" (80 combinações) | **5** |
| Ford Ka Sedan 2020 (5 perfis marcados) presente no resultado | 136 de 320 (42%) |
| Moto Honda ADV 150 presente no resultado de um quiz de carro | 74 de 320 |
| Cards abaixo do piso da faixa escolhida (a API só usa o teto) | 25% |
| Pediu "câmbio automático e fácil de manobrar" e recebeu manual | 41% dos cards |
| Pediu SUV e recebeu outra carroceria | 56% |
| Pediu picape e recebeu outra carroceria | 74% |
| "% COMPATÍVEL" exibido | quase sempre entre 44% e 65% |
| Leads do canal "Garagem Match Profiler" na tabela `leads` | **0, desde sempre** |

Causas no código:

- O filtro de preço usa só o teto (`budgetMin` nem é enviado), e a última faixa
  ("acima de R$ 115 mil") não tem teto nenhum.
- `comEtiquetasOuTodos` aceita o carro que casa com **qualquer** etiqueta, e a
  ordenação conta etiquetas de `perfis_uso`, marcadas à mão. Quem tem mais
  perfis marcados ganha tudo. No empate, ganha o **mais caro**.
- As etiquetas não dizem a verdade sobre os carros. "Esportivo/Coupé" não
  corresponde a carro nenhum. "Um carro melhor que o meu" vira `performance`,
  que só 3 carros têm. A F-250 2008 está cadastrada como Hatch e sem perfil. A
  Toro 1.3 flex 4x2 está marcada off-road, e a Tiguan 4Motion e a Titano 4x4
  diesel não estão.
- As perguntas 02 e 03 pedem desejo e se sobrepõem. Nenhuma pergunta quem vai
  no carro, o câmbio, a parcela ou a entrada.
- O resultado não explica por que cada carro está ali. Mostra até 6 cards e
  ainda promete "3 sugestões no WhatsApp".
- **O perfil montado no quiz nunca chega ao consultor.** `/api/leads` monta o
  `n8nPayload` com uma lista fechada de campos e descarta `perfil_curadoria` e
  `intencao`. Na linha gravada em `leads` também não entra.

Os cinco clientes que o painel de crítica encarnou, no motor de hoje:

| Pessoa | O que pediu | O que vê hoje |
|---|---|---|
| Carla, 38 | família, Gol na troca, até R$ 1.500/mês | Tiguan 2014 a gasolina com "100%" em 1º; a Spin de R$ 46.900 fica abaixo da faixa que ela marcou; nada fala de parcela nem de segurança |
| Rafael, 24 | primeiro carro, até R$ 50 mil, **automático** | a **moto** Honda ADV com "100%" em 1º, depois 5 carros manuais; a Spin automática, a única resposta certa, fica de fora |
| Seu Jorge, 52 | picape para trabalho e estrada de chão, até R$ 130 mil | Toro 1.3 4x2 flex em 1º (pela etiqueta off-road errada), Titano de R$ 170.900 (acima do orçamento), X1 e Tiguan num pedido de picape |
| Marina, 31 | não sabe o que quer, R$ 80 mil à vista | X1 de R$ 114.900, BMW 320i, a moto de R$ 23.900; cinco dos seis passam dos R$ 80 mil dela |
| Diego, 45 | prazer ao dirigir, até R$ 130 mil | BMW X4 M40i de **R$ 318.900** em 1º, com "53%" |

## 2. Como a proposta foi feita

Oito agentes em três rodadas:

1. **Brainstorm**, cinco lentes independentes: quem já sabe o que quer
   (fluxo guiado), quem não sabe (descoberta), motor e dados, conversão e
   ecossistema da loja, benchmark de mercado. Saíram 25 propostas, cada uma com
   exemplos do estoque real.
2. **Crítica**, duas frentes em paralelo. Um painel de clientes (as cinco
   pessoas acima) avaliou todas as propostas contra o estoque. Um crítico
   técnico conferiu viabilidade e verdade no código e nos dados.
3. **Síntese**: o conceito abaixo, com protótipo do motor rodado nas mesmas
   320 combinações.

Nenhuma proposta passou de 5,6 de 10 no painel de clientes. Cada uma acerta um
ou dois perfis, e o painel se dividiu em quatro grupos: quem paga com troca e
parcela (Carla), quem tem uma necessidade prática (Jorge), quem esbarra no que o
pátio não tem (Rafael) e quem escolhe pelo olho ou pela emoção (Marina, Diego).
Por isso o conceito junta partes de várias propostas em vez de escolher uma. O
placar completo está na seção 9.

## 3. Tese

O /carro-perfeito para de contar etiquetas e passa a prometer uma coisa que dá
para conferir: **três carros do pátio de hoje, escolhidos por regras que a
pessoa vê, cada um com o que atende do pedido, o que não atende e o que ela abre
mão**.

- Quem já sabe o que quer responde perguntas que viram fatos e cortam o
  estoque: piso e teto, quem vai no carro, câmbio, o que não pode faltar. O
  resultado nunca contradiz o que a pessoa disse.
- Quem não sabe começa por carros de verdade no mesmo preço ("o que o seu
  dinheiro compra aqui: o mais novo, o mais carro ou o que deixa folga") e por
  duelos de foto. As escolhas viram critérios que ela lê e corrige.
- Quando o pátio não tem o pedido, a tela diz isso e oferece uma saída:
  afrouxar um critério, pedir aviso ou encomendar. Não completa com qualquer
  carro.

O resultado deixa de ser genérico porque cada resposta muda o filtro, a ordem,
o motivo exibido e o que a tela diz que a pessoa abre mão ("até R$ 90 mil, todo automático aqui é de
2014 a 2016"). Não muda uma nota.

## 4. O conceito

Promessa na tela: *"Três carros do nosso pátio para você, com o porquê de cada
um."*

```
Abertura ─┬─ SEI O QUE PRECISO ─── 01 Como você vai pagar ── 02–05 perguntas-fato com contagem ──┐
          └─ ME MOSTRA OPÇÕES ──── 01 Como você vai pagar ── "O que R$ X compram aqui" + 3 duelos ┤
                                                               + "O que entendi" (editável)      │
   ┌──────────────────────────────────────────────────────────────────────────────────────────────┘
   └→ MESMO RESULTADO: 3 cards com porquê · outros N que passam · "Já pensou neste?" · "e se…"
      → QUERO VER ESTE (até 3) / ME AVISE QUANDO CHEGAR → lead que chega pronto no Kanban
```

As duas portas da abertura têm o mesmo tamanho. A pergunta 01 e o resultado são
os mesmos nas duas. A porta escolhida vira dado para comparar num teste A/B.

### 4.1 Fluxo guiado ("SEI O QUE PRECISO")

Uma pergunta por tela, e tocar na opção já avança, como hoje. Cada opção mostra
**antes do toque** quantos carros sobram. A conta é feita sobre o estoque que o
`CarMatch` já baixa. Uma opção que zera aparece como "(0 nessa faixa)" e, se
tocada, leva ao "e se". No celular, o painel lateral vira uma faixa fixa
"SOBRAM N DE 36".

| # | Pergunta e opções | Efeito | Por que separa carros no pátio de hoje |
|---|---|---|---|
| 01 | **Como você vai pagar?** À VISTA: faixa ou valor exato. POR MÊS: parcela, entrada, "tenho carro para a troca", prazo, ocupação opcional. DESCREVER continua. | O teto sempre corta; piso na seção 4.3. POR MÊS usa a conta do simulador. | Hoje 25% dos cards ficam abaixo do piso. Pela parcela, o 208 2023 (R$ 58.900) e o Ka Sedan 2020 (R$ 53.900) saem iguais, porque carro com mais de 5 anos pega taxa maior no simulador. |
| 02 | **O que o carro vai levar?** Eu e mais um · Família, criança na cadeirinha · Carga, ferramenta, mercadoria | Família: 4 portas ou mais. Carga: Picape, Utilitário ou Van. | 31 dos 36 têm 4 portas. Carga hoje só existe como etiqueta, e as Saveiros estão cadastradas como "Utilitário". |
| 03 | **Que jeito de carro?** (vários) Hatch · Sedã · SUV · Perua/minivan · Tanto faz | Corta. Pulada quando a 02 foi carga. | Hatch são 16 dos 36 e não existe como opção hoje. "Esportivo/Coupé" sai porque tem 0 carros; quem quer emoção marca "motor turbo" na 05. |
| 04 | **Trocar marcha no trânsito?** Só automático · Prefiro automático · Tanto faz · Prefiro manual | "Só automático" corta; as outras ordenam | É a pergunta que mais divide. Até R$ 70 mil há **1** automático (Spin 2014). Entre R$ 70 e 115 mil são 7 automáticos, todos de 2014 a 2020 menos o Versa 2025, contra 5 manuais de 2024–25. Se tudo o que sobrou tem o mesmo câmbio, a pergunta some e a tela diz o porquê. |
| 05 | **O que não pode faltar?** (até 3) 2020 ou mais novo · Até 80 mil km · Diesel (só com carga) · Câmera de ré · Central multimídia · Sensor de estacionamento · Segurança além do obrigatório · Motor turbo · Tração 4x4 · Nada disso | Ano, km e diesel **cortam** (são campos do sync). Itens de ficha **só ordenam**. | A contagem na tela é a de dentro do orçamento. |

O PRAZO sai do quiz e vai para o modal do lead. O próprio `car-match.ts` já
registra que prazo não é critério de carro.

### 4.2 Fluxo de descoberta ("ME MOSTRA OPÇÕES")

1. A mesma pergunta 01. Quem não sabe o valor toca "ainda não sei", e o fluxo
   parte da mediana do pátio, com o teto editável.
2. **"O que R$ X compram aqui hoje."** Entram carros entre 70% do teto e o
   teto, com 4 portas ou mais e sem carga, a não ser que a pessoa peça. Até três
   carros reais, cada um com a regra escrita embaixo do rótulo:
   - MAIS NOVO: maior ano; no empate, menos km.
   - MAIS CARRO: automático antes de manual; depois SUV, sedã, perua ou picape
     antes de hatch; depois mais itens da lista fechada na ficha.
   - MAIS FOLGA: menor preço; mostra quanto sobra.

   Se dois caminhos dão no mesmo carro, ele aparece uma vez com os dois
   rótulos. Tocar num caminho já conta como a primeira escolha da pessoa.
3. **Até 3 duelos**: "Mesmo dinheiro. Qual você levaria?" Os dois carros ficam
   abaixo do teto, com preços a até ±10% um do outro, e testam o eixo que ainda
   não ficou claro: ano contra câmbio, carro alto contra baixo, km, marca. A
   legenda lista **todas** as diferenças entre os dois. Botões: ESTE · ESTE · TANTO FAZ · NENHUM
   DOS DOIS, e "ver resultado agora" fica sempre visível. Depois de cada toque,
   uma linha resume o que a pessoa acabou de trocar: "Você escolheu o automático
   em vez do mais novo."
4. **"O que entendi"**: 2 ou 3 frases com contagem e prova, como "Automático e
   carroceria alta: 2 de 2 vezes (Soul em vez do Kwid; Tiguan em vez do HB20)".
   Um toque inverte ou remove a frase. Não há rótulo de personalidade.
5. O mesmo resultado do fluxo guiado. As frases viram preferências, com peso
   igual à contagem. Carro recusado duas vezes não volta.

O pátio é correlacionado, e a tela diz isso. A R$ 80 mil são 8 carros de 4
portas, e a escolha real é "automático de 2014 a 2016 ou manual de 2023 a 2025". A
descoberta é curta porque o pátio é curto.

### 4.3 Motor

**Entrada.** `disponiveisDe(getEstoque())`, passando pelo portão de publicação e
sem a moto. A mesma função pura roda no cliente (contagens, duelos) e em
`/api/match`, que passa a receber `criterios` e `budgetMin`. O GET com `?tags=`
continua funcionando.

**Atributos** (arquivo novo, `lib/fichaDoMotor.ts`). Os flags do mapper ficam
como estão, porque acendem selos em outras telas.

| Classe | Fonte | Estados | Corta? |
|---|---|---|---|
| Campo do sync | preço vigente, ano, km, câmbio, combustível, portas, tipo | atende / não atende | sim |
| Nome da versão (regex testado) | 4x4, 4Motion; 4x2; TSI, T270, turbo, TB; cilindrada; CS | atende / não atende / não consta | só "4x2" nega o 4x4 |
| Ficha (lista fechada, ~14 termos) | câmera de ré ou 360, multimídia ou espelhamento, sensor, airbag lateral, de cortina, controle de estabilidade, de tração, couro, teto solar, chave presencial, tração 4x4, motor turbo, único dono, revisões em dia | consta / não consta / ficha vazia | nunca, só ordena |

"Não consta" nunca vira "não tem". As 9 fichas vazias aparecem como "itens não
informados, pergunte". O texto exibido é o literal da ficha.

**Pontuação** (interna, nunca exibida):
- Filtros cortam e não entram no contador: teto, piso, 4 portas, carga,
  carroceria, só automático, 2020+, até 80 mil km, diesel.
- Preferências ordenam: atendida **+2**; não consta ou ficha vazia **0**; não
  atende **−1** (só para fato de campo ou do nome). Na descoberta, cada frase
  pesa de 1 a 3, conforme o número de escolhas.
- Desempate: ano mais novo, menos km, menor preço, id.
- Saem do motor: `perfis_uso` (continua nos hubs; é o que põe o Ka em 42% dos
  resultados), tempo de pátio e o desempate pelo mais caro.

**Faixa de preço.** O teto é sempre duro. FAIXA usa mínimo e máximo; a última
faixa ganha teto de 1,5× o piso, e o que passar disso vira "acima de R$ X" só
se houver carro. VALOR EXATO vai de 70% do valor até o valor. POR MÊS filtra
pela parcela. Só quando a faixa tem menos de 3 carros o motor completa com o
mais perto abaixo do piso, rotulado "abaixo da sua faixa: sobram R$ X"
(decisão 2).

**Os três (diversidade).** 1º: maior pontuação. 2º: o próximo de **outro
modelo** (marca + modelo base, então os três Ka contam como um). 3º: outro
modelo que difira do 1º em câmbio, carroceria ou época (até 2016, 2017–2021,
2022+), se o 2º ainda não difere. Dois do mesmo modelo só quando a faixa não
tem três modelos, e o card diz o que muda.

**O porquê** (`motivosDoCarro`). Cada card leva:
- "ATENDE X DE Y DO QUE VOCÊ PEDIU", que conta só preferências e abre a lista
  ✓ consta · ? não consta na ficha · ✗ não atende;
- uma **manchete** com um fato em que o carro é o **único** vencedor entre os
  três (mais novo, menos km, mais barato, único automático, único diesel).
  Sem vencedor único, a manchete é o que ele atende;
- **PESA CONTRA**: o pior fato único ou o primeiro ✗/?.

**"E se" e fronteira.** Com 0 a 2 carros, o motor tira um critério por vez e
mostra o que entra. Chips que trocam atributo vêm antes dos que sobem o preço.
A fronteira é o menor preço que atende dois critérios juntos: "Automático de
2023 para cá começa em R$ 108.900 (Versa 2025)".

**"Já pensou neste?"** Uma carta, dentro do teto, que cumpre o que o 1º cumpre e
o vence em pelo menos 2 fatos de uma lista fechada. Nunca repete carro visto
nos duelos. O bloco O QUE MUDA é obrigatório.

**Cadastro.** Regra nova em `coerenciaDoCadastro.ts` para nomes de picape
(F-250, F-1000, Ranger, S10, Hilux, Toro, Saveiro, Strada, Montana) contra o
tipo cadastrado; carro divergente sai do Profiler inteiro (não só dos três
principais: pela carroceria errada ele passaria no filtro de outra) e ganha alerta no
/admin. Opcionais só se corrigem no RevendaMais (o painel é só leitura para
eles desde 17/09).

**Teste de regressão.** Um snapshot do estoque público no repositório; nas 320
combinações, falha se houver card contra filtro, moto, card principal abaixo do
piso sem rótulo, um carro em 1º em mais de 20% das combinações, ou manchete com
empate.

**Protótipo nas mesmas 320 combinações:** 0 card contra filtro e 0 moto (por
construção); o 1º lugar mais frequente passa a ser a Toro D4, em 11% (hoje o X1
lidera com 19%); até R$ 50 mil saem 7 trios distintos (hoje 5); 30 dos 36
carros aparecem em algum resultado. **63 das 320 combinações ficam sem carro**:
o estado "não temos exatamente isso" é tela principal, não exceção.

### 4.4 Resultado e conversão

Sem se identificar, a pessoa leva os três cards com o porquê, o que o pátio a
obriga a abrir mão, a parcela estimada (mesma função e mesmo aviso do simulador), os
chips "e se", as fichas e "outros N que passam". "Guardar neste aparelho" salva
só as respostas, sem dado pessoal e sem valor financeiro em URL. Quem marcou
troca vê "Quanto o seu carro cobre? AVALIAR", que abre a /avaliacao
pré-preenchida. **A FIPE da troca nunca é somada à entrada.**

Se identificando (nome, WhatsApp e Turnstile; e-mail opcional):
- **QUERO VER ESTE** (até 3 carros): o consultor confirma a disponibilidade,
  manda vídeo, roda o financiamento, avalia a troca e separa os carros para a
  visita.
- **ME AVISE QUANDO CHEGAR** (quando sobram 0 a 2): um lead comum com os
  critérios. Na fase 4, o n8n avisa **o consultor** quando entra um carro que
  casa; quem escreve ao cliente é uma pessoa.
- **ENCOMENDAR**, pelo `EncomendaDeCarro`.

O prazo, agora perguntado no modal, decide qual botão ganha destaque. A
mensagem do wa.me continua na voz do cliente e passa a citar carros e
critérios.

No Kanban: na fase 1, critérios e carros (id, preço, motivos) vão em
`intencao_busca`, que a rota já repassa ao n8n, e a coluna `interesse` passa a
nomear os carros. Na fase 2 entram `leads.perfil` (jsonb, no molde de
`avaliacaoDoLead`) e um `BlocoDoPerfil` no card.

## 5. As cinco pessoas, hoje e na proposta

Carros e preços conferidos no estoque de 25/09. Parcelas por
`calculateFinancing`, 48×, CLT.

**Carla** (POR MÊS · R$ 1.500 · entrada de R$ 20 mil com o Gol · família ·
segurança além do obrigatório). Painel: "11 carros de 4 portas cabem".
1. Renault Kwid Zen 2 2025, R$ 58.900, 28.000 km, ≈ 48× R$ 1.298. O mais novo
   e o de menor km dos três. ? segurança além do obrigatório: não consta.
2. Peugeot 208 Like 2023, R$ 58.900, ≈ 48× R$ 1.298. Mesmo preço e mesma
   parcela do Kwid. Contra: 46 mil km a mais.
3. Ford Ka Sedan SE 1.5 2020, R$ 53.900, ≈ 48× R$ 1.299. O único sedã e o mais
   barato dos três. A parcela empata porque carro com mais de 5 anos pega 2,65%
   contra 1,95% a.m.
- Fronteira: "Airbag lateral ou controle de estabilidade na ficha: nenhum dos
  11. O primeiro é o VW Tiguan 2014 (R$ 70.900), com entrada a partir de
  R$ 28.500."
- Já pensou neste? Nissan March 2016, R$ 47.900, ≈ 48× R$ 931, com câmera de
  ré, sensor e multimídia na ficha. O que muda: 2016 e 99.562 km.

**Rafael** (até R$ 50 mil · só automático). A opção já mostra "Só automático
(1)".
1. Chevrolet Spin Advantage aut. 2014, R$ 46.900. ✓ automático; sensor e
   multimídia na ficha. Contra: 186.600 km. Cabeçalho: "Automático até R$ 50
   mil: 1 hoje."
- E se aceitar manual: entram 7 carros; o mais novo é o Kwid Zen 2 2023
  (R$ 49.900); o único com câmera de ré é o March 2016.
- ME AVISE para "automático até R$ 50 mil": o pedido vira sinal de compra.

**Seu Jorge** (valor exato R$ 130 mil · carga · diesel · 4x4). As opções
mostram "Diesel (1)" e "Tração 4x4 (0 confirmados)".
1. Fiat Toro Volcano AT9 D4 2020, R$ 106.900. ✓ diesel · ? 4x4 não consta,
   pergunte. O único diesel dos três; sobram R$ 23.100. Na ficha: único dono,
   revisões em dia, câmera de ré.
2. Fiat Toro Volcano 1.3 T270 2024, R$ 129.900. ✗ diesel · ✗ 4x4 (a versão diz
   4x2). O mais novo dos três.
3. VW Saveiro Robust 2023, R$ 62.900, rotulada "abaixo da sua faixa".
- Fronteira: "4x4 confirmado, hoje, só na Fiat Titano 4x4 diesel 2025:
  R$ 170.900." A F-250 diesel some de toda busca de picape até o cadastro ser
  corrigido.

**Marina** (descoberta · R$ 80 mil à vista). A faixa de R$ 56 a 80 mil tem 8
carros de 4 portas.
- Caminhos: MAIS NOVO e MAIS FOLGA dão no Kwid 2025; MAIS CARRO é o Kia Soul
  EX2 2016 automático. Ela toca MAIS CARRO.
- Duelos: Tiguan 2014 × HB20 2025 → Tiguan; Onix 2025 × Argo 2025 → Argo;
  208 2023 × Kwid 2025 → 208.
- O que entendi: "Automático e carroceria alta: 2 de 2 vezes".
1. Kia Soul EX2 2016, R$ 76.900. ✓ automático ✓ alto; câmera de ré,
   multimídia e controle de estabilidade na ficha.
2. VW Tiguan 2.0 TSI 4Motion 2014, R$ 70.900. O mais barato dos três. Contra:
   o mais antigo e o mais rodado; gasolina.
3. (outro caminho) Fiat Argo Drive 2025, R$ 78.900. O mais novo e o de menor
   km. Contra: manual.

**Diego** (valor exato R$ 130 mil · hatch, sedã ou SUV · prefiro automático ·
motor turbo).
1. VW Virtus Highline 200 TSI 2025, R$ 116.900. O mais novo e o de menor km.
   Contra: motor 1.0.
2. BMW X1 x25i 2018, R$ 114.900. O único SUV; câmera 360 e controle de
   velocidade adaptativo na ficha. Contra: 147.500 km.
3. Mercedes-Benz A250 Turbo Sport 2015, R$ 119.900. Airbag lateral e de
   cortina na ficha, só ele dos três. Contra: o mais antigo.
- Já pensou neste? VW Tiguan 2.0 TSI 4Motion 2014, R$ 70.900: R$ 46 mil a
  menos, 2.0 TSI contra 1.0 TSI e tração 4Motion (pelo nome da versão).

## 6. Fases

| Fase | Entrega | Esforço | Sucesso |
|---|---|---|---|
| **1. Resultado de verdade** (sem migração) | `fichaDoMotor.ts` + motor novo com as perguntas de hoje traduzidas em fatos (tabela abaixo); `budgetMin` enviado; última faixa com teto; opção Hatch; 3 cards com ✓/?/✗, manchete, PESA CONTRA e "outros N"; estado vazio com "e se" e ME AVISE; fim do loading de 3,2 s e do "% COMPATÍVEL"; QUERO VER ESTE; carros e motivos em `intencao_busca` e na mensagem. LGPD: `ag_leads_history` sem dado pessoal; `getActiveAgUid` e `/api/match` respeitando a recusa. Cadastro: F-250 corrigida e regra de coerência. Eventos GA4 por passo, com consentimento. Teste de regressão no CI. | P–M (3 a 5 dias) | Offline: 0 card contra filtro, 0 moto, 0 card principal abaixo do piso sem rótulo, nenhum carro em 1º em mais de 20%. Online: o primeiro lead do canal; % de leads com carro nomeado. |
| **2. Perguntas que cortam, POR MÊS e lead pronto** | Perguntas 02–05 com contagem e pulo; prazo no modal; aba POR MÊS com taxa, CET e ano de referência congelado; troca com link para /avaliacao; fronteira; "Já pensou neste?". Migrações aditivas: `leads.perfil` + `BlocoDoPerfil`; contador diário do funil, sem identificador. | M (1,5 a 2 semanas) | Funil por passo (primeira linha de base); 100% dos leads com perfil; uso do POR MÊS; tempo até a primeira resposta do consultor. |
| **3. Porta de descoberta** | Duas portas; tela dos caminhos; até 3 duelos; "O que entendi" editável; capas padronizadas nos carros que entram em duelo. | M (2 semanas) | % que escolhe cada porta; conclusão ≥ 60%; lead por resultado em cada porta; % de "tanto faz" por par (acima de 40%, o par sai). |
| **4. Continuar depois** | ME AVISE avisando o consultor quando chega carro que casa; relatório "pedidos sem estoque" para compras; `montarEncomenda` por critérios; teste da porta "comece pelo seu carro". | G (3 semanas+) | Aviso que vira conversa em 7 dias; pedidos sem estoque × carros comprados. |

**Como a fase 1 saiu (25/09), onde difere da linha acima:**

- LGPD: o `ag_leads_history` do Profiler perdeu o perfil e não grava nada
  para quem recusou o rastreamento, e `/api/match` não lê mais o cookie
  `ag_uid`. **Ficaram de fora, por decisão do dono em 25/09**, as duas medidas
  que eram política do site inteiro e não do Profiler: nome, e-mail e WhatsApp
  **continuam** no histórico (o `LeadCaptureModal` os usa para preencher o
  formulário de novo, nos cinco formulários), e `getActiveAgUid` **continua**
  devolvendo o id de quem recusou o rastreamento. Não reabrir sem nova
  decisão dele.
- Cadastro: a F-250 foi corrigida pelo dono no painel em 25/09 (Picape, com
  trabalho e off-road). `tipo` é coluna nossa, o sync não a reescreve
  (`docs/PROPRIEDADE_DOS_CAMPOS.md`). O fixture de 25/09 guarda o estado de
  antes, de propósito: é ele que prova a regra de divergência.
- Evento por passo: `profiler_step` vai só pelo `gtag`, e não pelo
  `dataLayer`, porque o container publicado não o conhece
  (`tests/contrato-do-container.test.ts`). No GA4, o dono registra
  `profiler_step` como dimensão personalizada (escopo evento) para ele
  aparecer em relatório — decidido em 25/09.
- "Esportivo/Coupé" também passou a filtrar hatch, sedã e SUV: sem isso a
  Toro diesel era a primeira sugestão para quem marcava esportivo.
- O "e se" e o ME AVISE aparecem quando a FAIXA tem menos de três carros,
  mesmo que o complemento abaixo do piso feche três cartões.

Tradução das respostas de hoje na fase 1:

| Resposta de hoje | Vira |
|---|---|
| Espaço para a família | filtro: 4 portas ou mais |
| Um carro melhor que o meu | preferências: 2020+, automático, 4+ itens da lista |
| Rodar barato na cidade | preferências: flex, motor até 1.6, hatch ou sedã |
| Trabalho e estrada | preferências: picape ou utilitário, diesel, 4x4 |
| Motor e desempenho | preferência: turbo (nome ou ficha) |
| Conforto e silêncio | preferências: automático, couro, multimídia |
| Facilidade no dia a dia | **filtro**: automático |
| Custo de manter | preferências: flex, motor até 1.6, 2020+ |
| SUV / Sedã / Picape / Hatch (nova) | filtro de carroceria; Picape inclui Utilitário e Van |
| Esportivo/Coupé | a tela diz que não há no pátio e mostra os turbo da faixa |
| Aberto a sugestões, Prazo | nada |

**Como a fase 2 começou a sair (25/09)** — as três partes que não dependiam de
decisão do dono. O POR MÊS espera três respostas dele (taxas conferidas com o
banco; troca como estimativa do cliente ou só entrada mínima; quantos carros o
consultor consegue separar por lead) e não entrou.

- **Perguntas-fato com contagem.** As 02 a 05 são as da tabela da seção 4.1.
  Cada opção mostra o número antes do toque, com a mesma conta do resultado
  (`carrosNaFaixa`, provada igual a `naFaixa` em toda faixa). Opção de ficha
  (câmera, multimídia…) não tira carro, então o número dela é "na ficha de N"
  dos que sobram, e não um total que não muda. A 03 some para carga; a 04 some
  quando tudo o que sobrou tem o mesmo câmbio, e a 05 diz por quê — no pátio de
  25/09 isso acontece em toda a faixa de R$ 115 a 175 mil (só automáticos) e
  nos hatches e sedãs de R$ 50 a 75 mil (só manuais). Resposta de pergunta que
  sumiu não vale (`lib/perguntasDoProfiler.ts`). "SOBRAM N DE M" no painel e,
  no celular, numa faixa fixa sob a pergunta.
- **Prazo no resultado, e não no modal.** A seção 4.4 pedia o prazo no modal do
  lead, mas o `LeadCaptureModal` é o mesmo dos cinco formulários do site, e o
  prazo que decide o botão precisa existir antes do toque no botão. Ficou como
  escolha opcional no resultado ("Não muda os carros"); sem resposta, o lead
  diz "não informado", e não "baixo".
- **"Já pensou neste?"** A carta vem depois dos três, com CONTRA O [1º cartão]
  e O QUE MUDA sempre visíveis (sem custo no cadastro, a tela diz isso). FAZ
  SENTIDO a põe no lead com `lugar: "ja-pensou"`; NÃO É PRA MIM a tira até
  refazer. Ainda não há duelos para ela evitar repetir (fase 3). A revisão
  antes do merge achou a primeira versão virando "o mais barato que passa"
  (98% das cartas abaixo da faixa; um Kwid contra um X4) e escondendo o que o
  carro perdia. Regras de agora: preço de pelo menos 60% do 1º cartão; "custa
  menos" é listado, mas não conta para as duas vantagens; cilindrada só se
  compara entre motores do mesmo tipo (turbo com turbo); O QUE MUDA lista
  também portas, 4x4, diesel, turbo e itens de ficha que o carro perde; a
  frase só diz "cabe na sua faixa" quando cabe. No pátio de 25/09 a carta
  aparece em cerca de 5% dos perfis — rara de propósito.
- **Lead pronto.** `leads.perfil` (migração 20260925200000, com aceite) guarda
  o retrato montado no servidor a partir de `intencao_busca`, e o card do
  kanban o mostra (`BlocoDoPerfil`). A rota grava o lead mesmo sem a coluna.
- Ficaram para depois: fronteira e contador diário do funil.

**POR MÊS (27/09), com as respostas do dono de 25/09:** "as taxas são
estimadas, verifique a média de mercado em pelo menos 5 bancos"; a troca
"depende, mas geralmente a entrada do cliente estimada"; quantos carros o
consultor separa "depende também" (fica o limite de hoje, três).

- **Taxas.** Banco Central, "Taxas de juros de operações de crédito",
  Aquisição de veículos – Prefixado – Pessoa Física, média das 41 janelas de
  10/07 a 11/09/2026. Critério escrito: entra toda instituição da modalidade
  menos os bancos de montadora e os públicos regionais, com taxa em pelo menos
  metade das janelas — dezoito: Caixa 1,05 · Safra 1,69 · Inter 1,71 ·
  Bradesco 1,76 · BB 1,78 · Sinosserra 1,84 · Santander 1,86 · Porto 1,94 ·
  Bradesco Financ. 1,95 · C6 1,96 · Brasileiro de Crédito 2,01 · Itaú 2,06 ·
  BV 2,27 · Agoracred 2,84 · Pan 2,88 · Finamax 3,21 · Daycoval 3,24 · Omni
  CFI 3,34 (% a.m.). Média 2,19, mediana 1,95, quartis 1,79 e 2,70. O
  simulador (da ficha e do Profiler) usa 1,79 / 1,95 / 2,70 para perfil bom,
  regular e de risco — antes eram 1,45 / 1,95 / 2,65, sem fonte. A primeira
  versão escolhia os bancos à mão e deixava de fora as financeiras de usado
  mais caras, o que puxava a estimativa para baixo; a revisão de 27/09 pegou.
  O número do BC mistura novo e usado, e por isso a tela diz sempre
  "Simulação, não é oferta de crédito: o banco, a taxa e a aprovação saem da
  análise de crédito".
- **Texto de crédito num lugar só** (`lib/textoDaParcela`, CDC art. 54-B,
  §3º): toda parcela vem com CET, total das parcelas, total a prazo (com a
  entrada) e o preço à vista — no cartão, na carta, na lista "outros" e na
  ficha. A primeira versão mostrava parcela sozinha na lista "outros" e
  chamava de "total" só a soma das parcelas, ao lado da entrada. Carro com
  mais de 5 anos ganha "aprovação e taxa variam mais de banco para banco".
  O ano mais antigo e o agente financiador, pendentes aqui, o dono respondeu
  em 28/09 (abaixo).
- **Ano de referência congelado** (decisão 3): a idade do carro conta de
  2026, e muda junto com a tabela de taxas, nunca pelo relógio.

**Condições do simulador como dado (28/09), com as respostas do dono:**

1. *"temos bancos parceiros que parcelam carros até 2009, abaixo disso muito
   difícil, pois o comparativo começa a ficar discrepante demais da realidade
   da fipe x valor de mercado"* → carro anterior a 2009 não recebe
   estimativa. Na ficha, o simulador diz "Sem estimativa de parcela: os
   bancos parceiros financiam carros de 2009 em diante" e oferece o
   consultor. Em `/financiamento` o seletor só lista os que financiam. No
   POR MÊS o carro não entra — a não ser que a entrada o pague inteiro, e aí
   não há financiamento a recusar. Fora do POR MÊS ele segue no resultado:
   a regra é da parcela, não do pátio.
2. *"validado, é isso mesmo, mas precisamos complementar com 'Simulação,
   não é oferta de crédito. Sujeito a aprovação mediante validação de
   cadastro.'"* e a lista dos bancos → o aviso é o texto do dono, palavra por
   palavra, e vai sempre com "Bancos parceiros: Sicredi, Safra, Banco Pan,
   Santander, Bradesco, Itaú, BV Financeira, Banco C6, Mercado Pago, Banco
   BBC, entre outros." (`avisoDeCredito`) — o agente financiador que o CDC
   pede junto da oferta. Na ficha, em `/financiamento`, no resultado e na
   aba POR MÊS.
3. *"sim, gostaria muito de ter isso disponível"* → as taxas, o ano de
   referência, o ano mais antigo, os bancos e a fonte das taxas moram em
   `parametros_financiamento` (migração 20260928120000), com vigência datada
   e o guarda D-T1.7: valor vigente nunca sofre UPDATE; abrir vigência nova
   encerra a atual hoje. A única escrita é `financiamento_nova_vigencia`,
   para Administrador e Financeiro (a linha da A17 "Editar texto legal e
   condições de financiamento"). A tela é `/admin/financiamento`, com
   exemplo ao vivo e histórico. O site lê a vigente no servidor (cache de
   1 h, invalidado na hora ao salvar) e passa às telas; a contagem do POR MÊS
   e a `/api/match` usam a mesma. Se a leitura falhar, o site simula com os
   valores de fábrica — os mesmos do seed, e um teste trava os dois juntos.
- **CET.** O simulador calculava `(total/financiado)^(1/n) − 1`, que dava
  menos que a própria taxa (≈ 12% a.a. para 1,95% a.m.); e a calculadora da
  ficha chamava a taxa mensal de "CET". Agora o CET é a taxa interna de
  retorno do fluxo (≈ 28,5% a.a. no mesmo caso), e a tela mostra taxa, CET,
  quantidade e total juntos — o que a regra de publicidade de crédito pede.
- **A aba.** Parcela que cabe no mês, entrada (estimativa do cliente, que
  começa em "Sem entrada" para nada ser dito por ela),
  "tenho carro para dar na troca", prazo (24 a 60×) e ocupação, que muda a
  taxa estimada. A faixa é a parcela de cada carro: passa quem cabe na
  parcela; de 70% a 100% dela é a faixa, e abaixo disso completa com rótulo
  "SOBRAM R$ X POR MÊS". Cada cartão mostra ≈ parcela, entrada, taxa, CET e
  total. Quem marcou troca vê "Quanto o seu carro cobre? AVALIAR MEU CARRO"
  (/avaliacao). A FIPE da troca nunca entra na conta.
- **Lead.** `intencao_busca.por_mes` (parcela, entrada estimada, prazo,
  ocupação, troca) e a parcela de cada carro; o card do kanban mostra "Por
  mês" e "Troca". Caso da Carla (R$ 1.500, R$ 20 mil, família): Kwid 2025 e
  208 2023 a ≈ 48× R$ 1.298, Ka Sedan 2020 a ≈ R$ 1.311 (mais barato, mas com
  mais de 5 anos: taxa de risco, 2,70% a.m.). `/api/match`
  responde 400 a parcela inválida, em vez de buscar sem teto.

## 7. Finalistas que merecem teste depois

1. **Porta "Comece pelo carro que você tem"** (guiado-melhor-que-o-meu +
   conv-escada-da-troca): "vs. o seu Ka 2020" e a entrada mínima por carro, sem
   FIPE no quiz. O público quase sempre tem carro.
2. **Perfil nomeado e compartilhável** (desc-jeito-de-ter-carro): só a
   revelação no fim da descoberta, com os nomes testados antes.
3. **Quiz adaptativo por ganho de informação** (motor-pergunta-que-divide),
   quando houver funil medido.

## 8. O que nenhuma proposta resolve

- **Segurança como critério.** Não há ISOFIX nem nota Latin NCAP no cadastro, e
  o Versa 2025 não lista nem ABS.
- **Custo de ter o carro.** Consumo, seguro e manutenção não estão no
  cadastro. Um Tiguan 2014 a gasolina pode aparecer para quem pensa em
  R$ 1.500 por mês.
- **Prazer ao dirigir.** Sem potência no cadastro, "esportivo" continua sendo
  turbo no nome ou marca.
- **Estética.** Só os duelos de foto tocam nisso, e as capas são desiguais.
- **O limite do pátio.** Até R$ 70 mil há um automático; cada faixa tem cerca
  de 10 carros. A meta é coerência e explicação, não variedade.
- **Validação.** Não há lead do canal nem telemetria. Todas as notas são
  hipóteses até a fase 1 medir o funil.

## 9. As 25 propostas e o destino de cada uma

Notas: média do painel de clientes (0–10); viabilidade e verdade do crítico
técnico (0–10).

| Proposta | Clientes | Viab. | Verdade | Destino |
|---|---|---|---|---|
| guiado-encruzilhada | 5,6 | 8 | 8 | Entrou: tela dos caminhos e linha de fronteira |
| motor-tres-caminhos | 5,6 | 6 | 6 | Fundida; o "ousado" a +12% do teto foi descartado |
| bench-isso-ou-aquilo | 5,6 | 5 | 7 | Entrou (duelos), com teto duro |
| guiado-por-que-este | 5,4 | 8 | 8 | Entrou: o contador conta só preferências |
| desc-jeito-de-ter-carro | 5,4 | 4 | 6 | Finalista, só a revelação do perfil |
| desc-isto-ou-aquilo | 5,2 | 6 | 7 | Entrou (duelos) |
| motor-gostei-mas | 5,2 | 6 | 8 | Fundida no "e se" |
| bench-tres-com-porque | 5,2 | 8 | 7 | Fundida no resultado |
| motor-motivos | 5,0 | 8 | 7 | Entrou: motor de fatos em 3 estados |
| motor-pergunta-que-divide | 5,0 | 4 | 8 | Adiada: instável com 7 a 12 carros por faixa |
| conv-lado-a-lado | 5,0 | 6 | 8 | Entrou como QUERO VER ESTE |
| conv-fila-do-perfil | 5,0 | 4 | 7 | Fundida no ME AVISE (fase 4) |
| guiado-perguntas-que-cortam | 4,8 | 8 | 8 | Entrou: base do fluxo guiado |
| desc-cenas-da-semana | 4,8 | 5 | 6 | Fundida: vira o texto das perguntas |
| desc-tres-caminhos | 4,6 | 7 | 7 | Fundida na encruzilhada |
| bench-quase-la | 4,6 | 8 | 9 | Entrou: contagens, "e se" e fim do loading |
| guiado-melhor-que-o-meu | 4,4 | 5 | 7 | Finalista |
| bench-radar | 4,4 | 3 | 7 | Fundida no ME AVISE |
| conv-parcela-entrada | 4,0 | 7 | 7 | Fundida no POR MÊS |
| desc-carro-que-voce-nao-considerou | 3,8 | 7 | 7 | Entrou na fase 2 ("Já pensou neste?") |
| conv-escada-da-troca | 3,8 | 4 | 6 | Finalista |
| bench-parcela-e-troca | 3,2 | 6 | 5 | **Descartada**: somava a FIPE da troca à entrada |
| conv-lead-pronto | 3,0 | 8 | 9 | Entrou (fases 1 e 2) |
| guiado-bolso | 2,6 | 7 | 7 | Fundida no POR MÊS |
| motor-ficha-limpa | 2,4 | 8 | 9 | Entrou: pré-requisito (coerência, parser, teste) |

As notas baixas de `motor-ficha-limpa` e `conv-lead-pronto` no painel são
esperadas: o cliente não vê essas duas propostas, mas as outras dependem delas.

## 10. Decisões do dono

1. **Carro acima do teto.** ✅ Decidido em 25/09: nunca, nem no "e se".
2. **Faixa com menos de 3 carros.** ✅ Decidido em 25/09: completar com o mais
   perto abaixo do piso (o de preço mais alto entre os que sobram), rotulado
   "abaixo da sua faixa · sobram R$ X".
3. **Parcela.** Validar a matriz de taxas do `finance-calculator` com o banco
   antes de pôr parcela em card. A idade do carro sai de `getFullYear()`, e em
   01/01 várias parcelas sobem sozinhas; a proposta é congelar o ano de
   referência.
4. **Troca.** A pessoa pode informar "quanto espera que o carro cubra", dito na
   tela como estimativa dela? A alternativa é mostrar só a entrada mínima por
   carro.
5. **PESA CONTRA em destaque** ("186.600 km, o mais rodado"). ✅ Decidido em
   25/09: sim.
6. **Contagem que expõe pátio curto** ("Só automático (1)"). Aceitar, com o
   "e se" e o aviso como saída?
7. **Cadastro.** Quem completa no RevendaMais as 9 fichas sem opcionais (Polo
   2025, Argo 2025, 320i, Ka Sedan SE, Saveiro Robust, X4, Uno, Fusca, F-250)?
8. **Contador anônimo.** O contador agregado do funil, sem cookie e sem IP,
   roda mesmo com recusa de rastreamento? Qual a retenção de `leads.perfil`?
9. **Operação.** O consultor dá conta de confirmar pedidos de visita e separar
   até 3 carros por lead?
