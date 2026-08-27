# Perfis de uso — proposta carro a carro

**Data:** 26/08/2026.
**Depende de:** rodar a migração `20260826230000_perfis_uso.sql`.
**Onde aplicar:** Painel → Estoque → selecionar → **Para que serve…**, ou na
ficha de cada veículo, no bloco "Para que este carro serve".

---

## O que a migração já fez sozinha

Converteu o vocabulário antigo, um para um:

| valor antigo | virou | carros |
|---|---|---|
| Família / Conforto | Família | 12 |
| Econômico / Diário | Urbano **+** Econômico | 12 |
| Uso Diário | Urbano | 5 |
| Performance / Premium | Performance | 4 |
| Trabalho / Robustez | Trabalho | 3 |
| Agilidade / Economia | Urbano **+** Econômico | 2 |

Os dois valores redundantes viraram **dois** perfis cada — quem era "Econômico
/ Diário" é econômico e urbano ao mesmo tempo, e é exatamente por isso que a
coluna virou lista.

**Primeiro carro**, **Estrada e viagem** e **Off-road 4x4** nasceram vazios:
nenhum valor antigo correspondia a eles, e adivinhar a partir de preço ou
carroceria seria o mesmo palpite que o site já expulsou do código uma vez.

## O que proponho acrescentar

A coluna **Sugestão** é leitura minha do nome e do preço de cada carro — não é
dado, é palpite informado. Você conhece o pátio; corrija o que não bater.
Nenhuma sugestão *remove* perfil: só acrescenta.

| Veículo | Preço | Já tem | Sugestão |
|---|---|---|---|
| BMW 320i 2.0 Sport Gp Active Flex Aut | R$ 105.900 | Performance | **Estrada** |
| BMW X4 M40i 3.0 M Sport Edit V6 Turbo Aut | R$ 318.900 | Performance | **Off-road** |
| Chevrolet Onix Hatch 1.0 12v Flex 5p Mec | R$ 75.900 | Urbano, Econômico | **Primeiro carro** |
| Chevrolet Onix Plus Turbo Lt Automatico | R$ 70.900 | Performance | — |
| Chevrolet Onix Sedan Plus Lt 1.0 12v Tb Flex Aut | R$ 75.900 | Família | **Estrada** |
| Chevrolet Tracker Ltz 1.0 Turbo 12v Flex Aut | R$ 94.900 | Performance | **Off-road** |
| Fiat Argo Drive 1.0 | R$ 78.900 | Urbano, Econômico | **Primeiro carro** |
| Fiat Argo Drive 1.0 Flex | R$ 72.900 | Urbano, Econômico | **Primeiro carro** |
| Fiat Strada Ranch T200at | R$ 125.900 | Urbano, Econômico | **Trabalho** |
| Fiat Titano Volcano 2.2 16v 4x4 Tb Die. Aut. | R$ 170.900 | Família | **Off-road**, **Trabalho** |
| Fiat Uno Mille Fire Economy | R$ 26.900 | Urbano, Econômico | **Primeiro carro** |
| Ford Ecosport 2.0 Titanium 16v Flex 4p Automatico | R$ 54.900 | Família | — |
| Ford Ka Se Plus 1.0 Ha C | R$ 53.900 | Urbano, Econômico | **Primeiro carro** |
| Ford Ka Sedan 1.0 SE Flex 4p | R$ 55.900 | Família | **Estrada** |
| Ford Ka Sedan Se 1.5 12v | R$ 53.900 | Família | **Estrada** |
| Harley-davidson Dyna Glide Super Glide Fxd | R$ 47.900 | Urbano, Econômico | **Primeiro carro** |
| Honda Adv 150 | R$ 23.900 | Urbano, Econômico | — |
| Honda HR-V EX 1.8 Flexone 16v 5p Aut | R$ 89.900 | Família | — |
| Hyundai Hb20 1.0mt Vision Bluemedia | R$ 62.900 | Urbano, Econômico | **Primeiro carro** |
| Hyundai Hb20 Comfort 1.0 Flex 12v Mec. | R$ 45.900 | Urbano, Econômico | **Primeiro carro** |
| Jeep Renegade S T270 1.3 Tb 4x4 Flex Aut | R$ 105.900 | Família | **Off-road** |
| Kia Bongo K-2500 2.5 4x2 | R$ 146.900 | Trabalho | **Off-road** |
| Kia Sorento Ex2 2.4 16v | R$ 56.900 | Família | **Estrada** |
| Mitsubishi Outlander 2.0 16v 160cv | R$ 89.900 | Família | **Estrada** |
| Nissan March 1.6 Rio 2016 | R$ 51.900 | Urbano, Econômico | **Primeiro carro** |
| Peugeot 2008 Griffe 1.6 Flex 16v 5p Aut | R$ 61.900 | Família | — |
| Peugeot 208 Like 1.0 Flex 6v 5p Mec. | R$ 56.900 | Urbano, Econômico | **Primeiro carro** |
| Renault Duster 1.6 Dynamique 4x2 16v Flex 4p Manual | R$ 51.900 | Família | **Off-road** |
| Volkswagen Fusca 1300l | R$ 30.900 | Urbano | — |
| Volkswagen Kombi Standard 1.4 Mi | R$ 69.900 | Urbano | **Família**, **Trabalho** |
| Volkswagen Kombi Standard 1.4mi 4p | R$ 61.900 | Urbano | **Família**, **Trabalho** |
| Volkswagen Parati Cl 1.6 Mi 4p | R$ 30.900 | Urbano | — |
| Volkswagen Polo Track 1.0 Flex 12v 5p | R$ 80.900 | Urbano, Econômico | **Primeiro carro** |
| Volkswagen Saveiro 1.6 Msi Robust Cs 8v Flex 2p Manual | R$ 65.900 | Trabalho | — |
| Volkswagen Saveiro Trendline 1.6 Total Flex 16v | R$ 55.900 | Trabalho | — |
| Volkswagen Up Move 1.0 Total Flex 12v 5p | R$ 37.900 | Urbano, Econômico | **Primeiro carro** |
| Volkswagen Virtus Highline 200 Tsi 1.0 Flex 12v Aut. | R$ 123.900 | Família | **Estrada** |
| Volkswagen Voyage 1.6 Trend | R$ 30.900 | Urbano | — |

---

## Depois de aplicar

Cada perfil marcado vira uma vitrine. Com a conversão automática já valendo,
existem hoje `/estoque/familia`, `/estoque/urbano`, `/estoque/economico`,
`/estoque/performance` e `/estoque/trabalho`. As outras três aparecem quando o
primeiro carro for marcado.

Vale conferir pelo payload de `/estoque`, que revalida a cada 60 segundos — as
páginas de recorte revalidam a cada hora e enganam quem olha logo depois de
salvar.
