# As imagens de uma landing page de campanha

Três arquivos por campanha, e os três saem de **uma foto só**. O nome é sempre
`<slug-da-campanha>-<posição>.jpg`, e o slug é o mesmo de `src/lib/campanhas.ts`.

| arquivo | medida | onde aparece |
|---|---|---|
| `<slug>-carro.jpg` | **2400 × 800** (faixa 3:1) | **o banner de largura total**, entre o texto e a zebra |
| `<slug>-og.jpg` | **1200 × 630** (paisagem ~1,91:1) | o card do WhatsApp, do Facebook e do Instagram |
| `<slug>-pista.jpg` | **1600 × 400** (faixa 4:1) | fundo do bloco final, a 25% de opacidade |

---

## Como trocar a foto

**Caminho 1 — você manda a foto no chat.** É o mais curto: mande a imagem e diga
de qual campanha é. Os três arquivos são gerados, conferidos na página e
commitados.

**Caminho 2 — você mesmo gera.** Com a foto na máquina:

```bash
node scripts/preparar-arte-de-campanha.js ~/Downloads/sua-foto.jpg pole-position-2026
```

Isso **não grava nada** — só relata as medidas e diz quais arquivos seriam
substituídos. Conferindo, repita com `--gravar` no fim.

---

## O que mandar

- **Tamanho mínimo: 2400 px de largura.** Foto de celular passa folgado. O
  script recusa abaixo disso, porque ampliar borra.
- **O assunto nos DOIS TERÇOS centrais.** O recorte é sempre central, e o
  celular corta as laterais: o banner é 3:1 no desktop e 2:1 no telefone, então
  um carro que encoste nas pontas perde a asa dianteira no celular.
- **JPG, PNG ou WebP.** Arquivo de material impresso costuma vir em **CMYK** — o
  script detecta e converte. Sem isso as cores chegam invertidas ao navegador,
  e um carro branco aparece azul-petróleo.
- **Peso.** As imagens vão com `unoptimized`, ou seja, o navegador baixa
  exatamente estes arquivos — o otimizador da Vercel já respondeu 402 por cota
  nesta conta, e o banner de uma campanha paga não pode depender disso. Acima
  de ~300 KB o banner atrasa o celular, que é de onde vem quase todo o tráfego.

## A disposição, em uma frase cada

**Banner (3:1).** Faixa de **largura total**, entre o texto de abertura e a
zebra. Fica fora do container de propósito: dentro dele pararia na margem e não
seria largura total. O bloco tem altura fixa e a foto se acomoda dentro
(`object-cover`, centralizada) — é assim justamente para que trocar a foto **não
mexa no layout da página**. No celular a faixa fica **2:1**, porque 3:1 numa
tela de 390px daria 130px de altura, baixo demais para se ver um carro.

**Card (1200 × 630).** Não aparece na página: é o que o WhatsApp mostra quando
alguém manda o link. Vale tratá-lo como uma peça própria — muita gente vê só
ele. Ele **não pode** ficar sob `/api/`, porque o `robots.ts` bloqueia esse
caminho e o card chega sem imagem.

**Faixa do fecho (4:1).** Fundo do bloco escuro do fim, a 25% de opacidade e sob
texto branco. Serve textura, não detalhe: foto de asfalto, pista, garagem. Rosto
ou placa não se lê ali.

---

## Depois de trocar

O card só passa a existir no domínio de produção **depois do merge** — antes
disso o `og:image` da LP aponta para um endereço que ainda dá 404. Compartilhar
o link do preview no WhatsApp mostra o card sem imagem, e isso **não é defeito**.
