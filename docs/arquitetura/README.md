# Diagrama de arquitetura

`arquitetura-motors.html` é o diagrama de arquitetura do site e da operação:
HTML autocontido, abre offline sem servidor, com tema claro/escuro, zoom, busca,
três vistas guiadas e export PNG/SVG.

**A fonte é o `.json`, não o `.html`.** O HTML é gerado. Para mudar o diagrama,
edite `arquitetura-motors.json` e gere de novo — nunca edite o HTML na mão.

## Como gerar

Precisa da skill `archify` instalada (ela vive em `.agents/skills/`, que é
ignorado pelo git — o que se versiona é o `skills-lock.json` da raiz):

```bash
npx skills experimental_install
```

Depois, a partir da raiz do repositório:

```bash
node .agents/skills/archify/bin/archify.mjs deliver architecture docs/arquitetura/arquitetura-motors.json docs/arquitetura/arquitetura-motors.html --quality showcase --json
```

O `deliver` só aceita o que passa em `validate --quality showcase`: 9 artifact
checks, zero erro e zero aviso de composição. Para diagnosticar antes:

```bash
node .agents/skills/archify/bin/archify.mjs validate architecture docs/arquitetura/arquitetura-motors.json --quality showcase --json
```

E, para evidência de navegador de verdade (precisa do Chrome instalado):

```bash
node .agents/skills/archify/bin/archify.mjs visual-check docs/arquitetura/arquitetura-motors.html --json
```

## Três coisas que custaram rodada de reparo

**A largura do `viewBox` tem teto por causa da legibilidade, não da tela.** Num
viewport de 1440 px a área útil do diagrama é só ~930 px, porque os cards ficam
ao lado. O `viewBox` atual é 1300 de largura; acima de ~1395 o texto de contexto
dos nós projeta abaixo do piso de 6 px e o `desktop-readability` reprova. Achatar
para caber na altura, sem olhar a largura, troca um erro por outro.

**Ligação vertical precisa de `fromSide`/`toSide` explícitos.** Quando dois nós
se sobrepõem só em parte na horizontal, o renderer infere um lado horizontal e a
rota sai vertical — `clean-flow/endpoint-side-direction`. Declarar `top`/`bottom`
resolve; não é enfeite.

**Rótulo colide com rota, não só com nó.** Vários rótulos aqui têm `labelDx`
porque o texto atravessava uma vertical de outra conexão. O diagnóstico dá o
retângulo do rótulo e o segmento ofensor — use os números dele em vez de chutar.

## Sobre o idioma

O conteúdo é português. A interface do viewer (Light/Classic/Present/Export,
"Explore this system", "Legend") e o `<html lang>` ficam em inglês: o archify só
tem `locale` para `en` e `zh-CN`, e o contrato manda omitir o campo e avisar
quando o idioma é outro.

## Sobre o peso

O HTML tem ~800 KB porque embute fonte e runtime para abrir offline. Cada
regeração acrescenta essa massa ao histórico do git, para sempre. Na frequência
com que uma arquitetura muda isso é barato — mas se um dia o diagrama virar algo
que se regera toda semana, vale reavaliar e versionar só o `.json`.
