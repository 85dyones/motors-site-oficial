# Carrocerias a corrigir no painel — levantamento de 26/08/2026

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

## O que isso custa

- **Navegação.** Quem filtra "Sedan" não encontra o Onix Plus nem o 320i.
- **Busca.** `/estoque/sedan` tem 4 carros quando deveria ter 7; `/estoque/hatch`
  promete 20 e entrega dois Kombi e um Bongo no meio.
- **Anúncio.** O grupo de Ads que apontar para uma dessas páginas leva o
  visitante a uma vitrine que não corresponde ao que ele pesquisou.

---

## A lista

| # | Hoje | Deveria ser | Veículo |
|---|---|---|---|
| 1 | Hatch | **Sedan** | BMW 320i 2.0 Sport GP Active Flex Aut |
| 2 | Hatch | **Sedan** | Chevrolet Onix Plus Turbo LT Automatico |
| 3 | Hatch | **Sedan** | VW Voyage 1.6 Trend |
| 4 | Hatch | **Picape** | Fiat Strada Ranch T200at |
| 5 | SUV | **Picape** | Fiat Titano Volcano 2.2 16v 4x4 Tb Die. Aut. |
| 6 | Hatch | **Perua** | VW Parati CL 1.6 Mi 4p |
| 7 | Hatch | **Van** | VW Kombi Standard 1.4 Mi |
| 8 | Hatch | **Van** | VW Kombi Standard 1.4mi 4p |
| 9 | Hatch | **Utilitário** | Kia Bongo K-2500 2.5 4x2 |

**Perua, Van e Utilitário são novos** — não existiam no dropdown antes desta
rodada, e é por isso que Kombi, Parati e Bongo estavam em Hatch: não havia
opção honesta. Aplicá-los cria `/estoque/perua`, `/estoque/van` e
`/estoque/utilitario` sozinho, sem deploy.

### Um caso que parece erro e não é

**Ford Ka SE Plus 1.0 HA** continua **Hatch**, e está certo: "HA" é a sigla de
hatch na nomenclatura da Ford. "Plus" só significa sedã na Chevrolet — foi por
isso que o Onix entrou na lista e este não.

### Um caso que precisa da sua decisão

O **Onix Plus Turbo LT Automatico** (R$ 70.900) tem **três informações se
contradizendo**: o nome da versão promete automático, o campo Câmbio diz
Manual, e a categoria diz Hatch. Duas das três estão erradas, e só quem viu o
carro sabe quais.

- Se ele **é automático**: corrigir Câmbio, além da carroceria.
- Se ele **é manual**: corrigir o nome da versão — o campo **Versão** da ficha
  agora aceita edição, e o que você escrever vence o feed.

Enquanto as três discordarem, quem filtra "Automático" não acha o carro e quem
chega pelo nome descobre que é manual no showroom.

---

## Depois de aplicar

Nada mais é preciso: as páginas de carroceria e o sitemap se refazem na próxima
geração. Vale conferir `/estoque/sedan` (deve passar de 4 para 7) e
`/estoque/hatch` (de 20 para 12).
