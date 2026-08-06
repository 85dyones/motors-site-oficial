# Guia de fotografia — Motors Store

Como fotografar os veículos para que a mesma foto funcione em todos os lugares
onde o site a usa, sem cortar o carro.

**Data:** 06/08/2026 · Escrito a partir dos recortes reais do código, não de
regra genérica de fotografia.

---

## O problema

Você tira uma foto. O site a recorta de três jeitos diferentes, sozinho, sem
perguntar:

| Onde aparece | Recorte | O que se perde |
|---|---|---|
| Card do veículo — home, catálogo, destaques, similares | **4:3** | as laterais |
| Galeria da página do veículo | **16:9** | topo e base |
| Capa da home (hero) | **~2,3:1** | 35% da altura |

Uma foto enquadrada só para o card fica com o carro cortado na capa. Uma foto
enquadrada só para a capa fica com para-choque cortado no card. O jeito de
resolver não é escolher entre eles — é fotografar de um jeito que sobreviva
aos três.

---

## 1. Formato de captura: 3:2

**Fotografe no 3:2 nativo da câmera.** Não troque o corpo para 16:9.

O 3:2 é o melhor meio-termo entre os três recortes:

| Se você captura em | Para virar card 4:3 | Para virar capa 2,3:1 |
|---|---|---|
| **3:2** (recomendado) | perde 11% da largura | perde 35% da altura |
| 4:3 | não perde nada | perde 42% da altura |
| 16:9 | **perde 25% da largura** — corta para-choque | perde 23% da altura |

O 16:9 parece tentador porque é o formato da capa, mas é ele que estraga o
card, que é onde o cliente vê o carro primeiro.

---

## 2. A área segura

Dentro do quadro 3:2, **o carro inteiro precisa caber nesta janela**:

```
        6%                                             94%
         ┌───────────────────────────────────────────────┐
    0%   │                                               │
         │           (topo — some na capa)               │
   23%   ├───────────────────────────────────────────────┤  ← linha superior
         │                                               │     de terços
         │                                               │
         │            Á R E A   S E G U R A              │
         │        o carro inteiro vive aqui dentro       │
         │                                               │
   86%   ├───────────────────────────────────────────────┤  ← linha inferior
         │        (base — some na capa)                  │     de terços
  100%   └───────────────────────────────────────────────┘
```

- **Horizontal: 6% a 94%** — sobra de aproximadamente meia roda de asfalto
  além de cada para-choque.
- **Vertical: 23% a 86%** — é exatamente a faixa que a capa mostra.

### Na régua da câmera

Ligue o **grid 3×3** (regra dos terços) no visor. A área segura vertical
coincide, na prática, com as duas linhas horizontais do grid:

1. **A linha do solo / base das rodas fica sobre a linha inferior de terços.**
2. **O teto do carro fica abaixo da linha superior de terços.**

Se o carro está inteiramente entre as duas linhas horizontais, ele sobrevive a
todos os recortes. É a única regra que você precisa lembrar em campo.

Para o horizontal, a margem é pequena (6%), então basta não deixar para-choque
encostando na borda do quadro.

---

## 3. A regra que só vale para a foto de capa

A capa da home tem um **degradê escuro cobrindo os 46% da esquerda**, onde
entram o título "FORA DA CURVA", o texto e os números. Se o carro estiver
centralizado, metade dele fica embaixo do texto.

**Na foto de capa, o carro fica na metade direita do quadro**, em 3/4
dianteira virada para a esquerda — olhando "para dentro" do texto.

```
   ┌──────────────────────┬──────────────────────┐
   │  FORA                │                      │
   │  DA CURVA            │      🚗  o carro     │
   │  88 · 12 · 100%      │         vive aqui    │
   └──────────────────────┴──────────────────────┘
     degradê escuro (46%)        área limpa
```

Nas fotos de catálogo, centralizado normal — ali não há texto por cima.

---

## 4. Resolução e arquivo

As fotos que estão no ar hoje têm **1620×1080**, e isso é pouco: numa tela de
1920 a capa precisa ampliar a imagem em 1,18×, e ampliação aparece.

| | |
|---|---|
| **Mínimo** | 2400×1600 |
| **Ideal** | 3000×2000 |
| Acima disso | não compensa o peso do arquivo |

Formato JPEG com qualidade alta (80–90). Acima de 90 o arquivo cresce sem
ganho visível.

---

## 5. Checklist de campo

Antes de apertar o botão:

- [ ] Câmera em **3:2**, grid 3×3 ligado
- [ ] Rodas apoiadas na **linha inferior de terços**
- [ ] Teto **abaixo da linha superior de terços**
- [ ] Nenhum para-choque encostando na borda lateral
- [ ] Se for foto de capa: carro na **metade direita**, 3/4 dianteira
- [ ] Pelo menos 2400px de largura

---

## Onde estes números vivem no código

Se algum recorte mudar, este guia sai de sincronia. Os pontos a conferir:

| Recorte | Arquivo |
|---|---|
| Card 4:3 | `src/components/modernist/primitivos.tsx` — `aspect-[4/3]` no `CardVeiculo` |
| Galeria 16:9 | `src/components/PDPClientWrapper.tsx` — `aspect-video` |
| Capa ~2,3:1 | `src/components/modernist/HeroHome.tsx` — `min(43vw, 860px)` |
| Ponto focal da capa | `HeroHome.tsx` — `object-[50%_62%]`, que é o que define a faixa 23%–86% |
