# Carrocerias a corrigir no painel — levantamento de 26/08, revisto em 27/08

**Para:** o dono.
**Depende de:** nada. `tipo` já é editável e já sobrevive ao sync — é só aplicar.
**Onde:** Painel → Estoque → selecionar os veículos → **Definir carroceria**.
Ou na ficha de cada um, campo **Carroceria**, que virou lista fechada.

---

## Por que esta lista existe

O plano de mídia de 26/08 apontou **um** veículo com categoria errada. Ao
conferir, o número é maior — e o padrão explica o resto.

Cruzei o feed servido (`/api/feed/xml`, 38 veículos) com as páginas
`/estoque/{carroceria}`, que é de onde a categoria de cada carro aparece
publicamente. Das 36 unidades com carroceria atribuída:

| Carroceria | Unidades |
|---|---|
| **Hatch** | **20** |
| SUV | 10 |
| Sedan | 4 |
| Picape | 2 |
| Wagon | 0 |

**Hatch em 20 de 36** não descreve o pátio — descreve o comportamento do feed
do RevendaMais, que usa "Hatch" quando não sabe. O site não inventa carroceria
(`resolveTipo` só normaliza o que chega, nunca adivinha), então o que está no
feed é o que aparece na vitrine.

A auditoria de 27/08 chegou aos mesmos veículos por outro caminho, e a lista
bate item a item. É a mesma lista, com id.

## O que isso custa

- **Navegação.** Quem filtra "Sedan" não encontra o Onix Plus nem o 320i.
- **Busca.** `/estoque/sedan` tem 4 carros quando deveria ter 7; `/estoque/hatch`
  promete 20 e entrega dois Kombi e um Bongo no meio.
- **Anúncio.** O grupo de Ads que apontar para uma dessas páginas leva o
  visitante a uma vitrine que não corresponde ao que ele pesquisou.
- **SDR.** O atendente automático lê o mesmo campo. "Temos uma picape" some da
  resposta enquanto a picape estiver cadastrada como hatch.

---

## A lista

| # | id | Hoje | Deveria ser | Veículo |
|---|---|---|---|---|
| 1 | `8256747` | Hatch | **Sedan** | BMW 320i 2.0 Sport GP Active Flex Aut |
| 2 | `8307965` | Hatch | **Sedan** | Chevrolet Onix Plus Turbo LT Automático |
| 3 | `8393824` | Hatch | **Sedan** | VW Voyage 1.6 Trend |
| 4 | `8303260` | Hatch | **Picape** | Fiat Strada Ranch T200AT |
| 5 | `8171616` | SUV | **Picape** | Fiat Titano Volcano 2.2 16v 4x4 TB Die Aut |
| 6 | `8152210` | Hatch | **Perua** | VW Parati CL 1.6 MI 4p |
| 7 | `8333811` | Hatch | **Van** | VW Kombi Standard 1.4 MI |
| 8 | `8392516` | Hatch | **Van** | VW Kombi Standard 1.4 MI 4p |
| 9 | `8137195` | Hatch | **Utilitário** | Kia Bongo K-2500 2.5 4x2 |

**Perua, Van e Utilitário são novos** — não existiam no dropdown antes desta
rodada, e é por isso que Kombi, Parati e Bongo estavam em Hatch: não havia
opção honesta. Aplicá-los cria `/estoque/perua`, `/estoque/van` e
`/estoque/utilitario` sozinho, sem deploy.

### O décimo item, decidido: a Saveiro Robust `8335204`

A auditoria de 27/08 listou dez, e o décimo era a **Saveiro 1.6 MSI Robust CS**
— que estava em `Utilitário` e a lista queria padronizar em `Picape`, junto com
a outra Saveiro do pátio.

**Fica como está.** Você decidiu em 27/08, e o motivo é do lado de fora do
banco: a Robust é cabine simples, comprada para trabalho, e `Utilitário`
descreve melhor o que ela é para quem procura. A padronização que a auditoria
pedia otimizava a consistência da tabela, não a busca de quem chega.

A outra Saveiro é **utilitário e uso do dia a dia ao mesmo tempo**, e essa é
uma informação que não cabia em lugar nenhum até agora — carroceria é um valor
só. Cabe agora, em outro campo: **Para que serve** aceita quantas marcações
couberem. Na ficha dela, marque **Trabalho** e **Urbano**, e o carro passa a
aparecer nas duas vitrines sem que a carroceria precise mentir em nenhuma.

### Um caso que parece erro e não é

**Ford Ka SE Plus 1.0 HA** continua **Hatch**, e está certo: "HA" é a sigla de
hatch na nomenclatura da Ford. "Plus" só significa sedã na Chevrolet — foi por
isso que o Onix entrou na lista e este não.

Está travado em teste (`tests/coerencia-do-cadastro.test.ts`), junto com o
HR-V: os dois são os falsos positivos que o detector novo não pode voltar a
acusar.

### Um caso que precisa da sua decisão

O **Onix Plus Turbo LT Automático** (R$ 70.900) tem **três informações se
contradizendo**: o nome da versão promete automático, o campo Câmbio diz
Manual, e a categoria diz Hatch. Duas das três estão erradas, e só quem viu o
carro sabe quais.

- Se ele **é automático**: corrigir Câmbio, além da carroceria.
- Se ele **é manual**: corrigir o nome da versão — o campo **Versão** da ficha
  agora aceita edição, e o que você escrever vence o feed.

Enquanto as três discordarem, quem filtra "Automático" não acha o carro e quem
chega pelo nome descobre que é manual no showroom.

---

## A lista não precisa mais ser levantada à mão

Duas coisas mudaram em 27/08 para que esta página não tenha de existir de novo:

- **A ficha avisa.** Ao abrir um veículo cujo nome contradiz a carroceria, o
  editor mostra o alerta ao lado do campo, com o motivo escrito. Ele **só
  sinaliza** — nunca corrige sozinho, porque quem viu o carro é você.
- **`npm run auditoria:estoque`** roda as quatro checagens de uma vez
  (carrocerias, nome × carroceria, URLs duplicadas e bloqueados para
  publicação) e imprime a lista pronta, com id.

## Depois de aplicar

Nada mais é preciso: as páginas de carroceria e o sitemap se refazem na próxima
geração. Vale conferir `/estoque/sedan` (deve passar de 4 para 7) e
`/estoque/hatch` (de 20 para 12).
