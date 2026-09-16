# QR codes — Pole Position (12 a 20 de setembro de 2026)

Material para a gráfica. **Mande os `.svg`** — são vetor e não perdem qualidade
em nenhum tamanho. Os `.png` servem para conferência e uso digital.

| peça | arquivo | leva para |
|---|---|---|
| Folder impresso | `qr-pole-position-2026-folder.svg` | a LP com `utm_content=folder` |
| Banners de divulgação | `qr-pole-position-2026-banner.svg` | a LP com `utm_content=banner` |

As URLs completas estão em `qr-codes.json`, que é lido por
`tests/qr-de-campanha.test.ts`.

## Por que cada peça tem um QR diferente

Os dois levam à mesma página. O que muda é o **`utm_content`**, e é ele que faz
o lead chegar dizendo de onde veio: sem isso você sabe que o contato veio de um
QR, mas não se foi do folder ou do banner — e é essa a informação que decide
onde gastar impressão na próxima campanha.

A LP captura os parâmetros da URL e os manda junto com o lead. Conferido em
09/09: as quatro UTM sobrevivem à navegação, sem nenhum redirect comendo a
query.

## Regras de impressão

- **Mínimo 40 mm de lado.** São 61×61 módulos; menor que isso os quadradinhos
  ficam pequenos demais para câmera de celular.
- **Nível de correção H (30%)**, o mais alto. Folder dobra no bolso e banner de
  rua pega sol, chuva e dedo — com H, até 30% do código pode estar danificado e
  a leitura ainda acontece.
- **Preserve a margem branca** que já vem no arquivo. QR colado em cor sólida
  sem respiro não lê.
- **Não recorte, não estique, não ponha logo no meio.**

## Depois de 20 de setembro

O QR continua funcionando: a página responde 308 e leva para `/estoque`. Material
impresso não vira lixo quando a campanha acaba — foi o motivo de a campanha ter
sido desenhada com `destinoAposFim` em vez de simplesmente sumir.

## Para gerar de novo, ou para outra campanha

```bash
mkdir -p /tmp/qr && cd /tmp/qr && npm init -y && npm install qrcode jsqr && cd -
NODE_PATH=/tmp/qr/node_modules node scripts/gerar-qr-de-campanha.js <slug>
```

Sem `--gravar` ele só mostra as URLs. As dependências ficam fora do
`package.json` de propósito — são ~30 pacotes para uma tarefa que acontece uma
vez por campanha, e o cabeçalho do script explica.

O script **decodifica cada QR que gera** e compara com a URL de origem; se
divergir, ele falha e não escreve o manifesto. QR errado só se descobre depois
de impresso.
