# Repasse Motors — PR 4 (portas de entrada) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abrir as portas do `/repasse` no resto do site: `REPASSE` no menu (na barra só a partir de 1281px, sempre no menu do celular com o apoio "abaixo da FIPE, à vista"), "Repasse" no rodapé, a faixa escura depois da grade do `/estoque` (com 1 ou mais carros abertos a todos) e a faixa clara da home com três carros (com 3 ou mais abertos) — e, no texto que já existe, tirar a frase geo que liga o repasse ao carro recusado e fechar o item T3 do Guia 07.

**Architecture:** O texto público novo mora em `src/lib/paginaDoRepasse.ts`; o do menu e do rodapé nasce num módulo sem import (`src/lib/repasseNaNavegacao.ts`) e é reexportado por ele, para que `Header` e `Footer` — client components de toda página — não arrastem o texto das ilhas do `/repasse` para o pacote do site inteiro. A regra de quando cada faixa aparece, e a leitura que troca a pane por lista vazia, ficam numa lib com teste (`src/lib/portasDoRepasse.ts`). O desenho fica em server components sob `src/components/repasse/`, onde as varreduras de `view_item` e de âncora já olham. As duas páginas só leem pela lib e montam o componente.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 (degrau próprio `desktop:` = `80.0625rem` = 1281px, `src/app/globals.css:108`) · Supabase (leitura anônima) · Vitest (node; `// @vitest-environment jsdom` para o menu do celular).

**Spec:** `docs/superpowers/specs/2026-09-24-secao-de-repasse-design.md` — §10 (portas de entrada e texto existente) e §12 (linha "4 · Portas | §10, com a remedição do menu | PR 3 no ar"). Texto da prancha, APROVADO com o desenho v5: `.superpowers/desenho-v5/PORTAS.md` (transcrição verbatim de `Portas.dc.html`). Pesquisa, linhas e riscos: `.superpowers/pr4-handoff.md`.

**Branch:** `feat/repasse-portas`, a partir de `8ba38e8` (ponta do PR 3, #156), no worktree `C:\Users\Lenovo\Documents\motors-claude\wt-repasse-portas` (junção de `node_modules` para o clone principal). Push com `git push -u origin feat/repasse-portas` — **nunca** no branch do PR 3.

## Global Constraints

- Nomes de arquivo, tipo, função e constante **em português**, no padrão do repositório.
- **Todo texto público novo mora em `src/lib/paginaDoRepasse.ts`** e entra nos componentes por import; componente não escreve frase para o cliente. Única exceção de lugar (decisão 11): o texto do menu e do rodapé nasce em `src/lib/repasseNaNavegacao.ts` e é **reexportado** por `paginaDoRepasse.ts`, para as travas de texto o lerem. O texto da prancha "Portas de entrada" vai **letra por letra** como está em `.superpowers/desenho-v5/PORTAS.md`.
- As regras de texto do repasse valem para cada linha nova: nada de "não girou" e parentes, CDC, direitos do consumidor, "%", "a partir de R$", "premium", "exclusivo", "melhor preço", "consulte"; laudo nunca "publicado/disponível/online/anexo/baixar/ver o laudo"; garantia do estoque só por `PRAZO_DA_GARANTIA`; **sem travessão (— ou –) em nenhuma string** de `paginaDoRepasse.ts` ou `repasseNaNavegacao.ts`.
- **`Header.tsx`, `Footer.tsx`, `menuDoCabecalho.ts` e `colunasDoRodape.ts` nunca importam `paginaDoRepasse.ts`** (decisão 11): importam de `repasseNaNavegacao.ts`.
- **Todo componente novo que desenha repasse mora em `src/components/repasse/`** — é o diretório que `tests/repasse-sem-view-item.test.ts` e `tests/ancoras-do-repasse.test.ts` varrem inteiro. Nas páginas (`src/app/page.tsx`, `src/app/estoque/page.tsx`) só entra a chamada do componente.
- **Nas portas, o repasse só é lido por `lerRepassesDasPortas`** (Task 3). `lerRepassesPublicos` direto em `/` ou em `/estoque` derrubaria a página numa pane.
- Nenhum `view_item`, `ViewContent`, `content_ids`, `trackVehicleView` ou `PDPClientWrapper` em código do repasse ou nos dois pontos de chamada (spec §8). Os cards das faixas não têm WhatsApp e não recebem `companySettings`.
- **Arquivo com `\b`, `\d`, `\s` ou `\w` numa regex: gravar com a ferramenta Write/Edit, nunca por heredoc no shell** (memória `heredoc-come-a-barra-invertida`). Depois de gravar, `grep -c $'\x08' <arquivo>` tem de dar `0`.
- **`emReais` usa espaço inseparável (U+00A0):** nos testes, comparar com `emReais(…)`, nunca com "R$ 36.900" digitado, e **não** normalizar o HTML com `.replace(/\s+/g, " ")` quando ele tem preço — o `\s` do JavaScript casa o U+00A0 (memória `crlf-e-espaco-nbsp-nos-testes`).
- **Teste local só dos arquivos mexidos** (`npx vitest run tests/<arquivo>.test.ts …`). A suíte inteira roda no fechamento, **em 8 fatias** (inteira, ela estoura a memória desta máquina). `tsc` e lint também no fechamento.
- **Lint é catraca** (`eslint-suppressions.json`): nenhum erro novo, nenhum `any` novo. Dublê de teste usa `unknown`/`as never`, como os existentes.
- Trava nova só conta depois de **reprovar com o bug real** (memória `trava-so-vale-se-reprovar`). Toda tarefa tem passo de sabotagem; desfazer cada sabotagem antes da próxima e anotar no relatório o vermelho visto.
- **Nenhuma migração e nenhuma escrita em banco neste PR.**
- **PR:** só com o CI concluído e verde nos cinco jobs (`vitest`, `tipos`, `lint`, `build`, `deploy-vercel`), aberto pelo Chrome do dono, com o ok dele. **Ordem de merge:** depois do #156 (PR 3), pela sessão de handoff, em lote verificado.
- Todo commit termina com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (depois de uma linha em branco).
- Modelo por tarefa (regra do dono de 20/09): o do título. No máximo dois agentes Opus ao mesmo tempo; subagente não abre subagente.
- Todo texto que a pessoa lê e **não** está na prancha vai para a lista "Textos novos para o dono aprovar" (abaixo) e é levado ao dono antes do merge (regra `fato-ambiguo-nao-vai-ao-ar`).

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/repasseNaNavegacao.ts` (novo) | `CAMINHO_DO_REPASSE` e `REPASSE_NA_NAVEGACAO` (rótulo do menu, apoio do celular, rótulo do rodapé), sem import |
| `src/lib/paginaDoRepasse.ts` (muda) | Reexporta o módulo acima; `PORTAS_DO_REPASSE`; `abertosHoje(n)` |
| `src/lib/paginasGeo.ts` (muda) | Sai a oração "Os outros sete vão para repasse antes de chegar à vitrine." |
| `conteudo-seo/pacote/guias/07-carro-reprovado-cautelar-como-vender.md` (muda) | Fecha o item T3 |
| `src/lib/menuDoCabecalho.ts` (muda) | `ItemDoMenu.apoio?`; `REPASSE` em segundo; aviso de tabela vencida (reescrita na Task 6) |
| `src/components/Header.tsx` (muda) | `hidden desktop:block` no REPASSE; apoio só no menu do celular |
| `src/lib/colunasDoRodape.ts` (muda) | "Repasse" na coluna INSTITUCIONAL |
| `src/lib/portasDoRepasse.ts` (novo) | `faixaNoEstoque`, `faixaNaHome`, `lerRepassesDasPortas` e os pisos |
| `src/components/repasse/CardDaFaixa.tsx` (novo) | O card simplificado da prancha (foto, etiqueta, carro e ano, preço, "R$ X abaixo da FIPE") |
| `src/components/repasse/FaixaDoRepasseNoEstoque.tsx` (novo) | A faixa escura do `/estoque` |
| `src/components/repasse/FaixaDoRepasseNaHome.tsx` (novo) | A faixa clara da home, com três `CardDaFaixa` |
| `src/app/estoque/page.tsx` (muda) | Lê pelas portas; a faixa entre o `<Suspense>` e o índice |
| `src/lib/areasDoSite.ts` (muda) | Área `repasse` no catálogo, logo depois de `faixas_de_preco` |
| `src/app/page.tsx` (muda) | Lê pelas portas; bloco `repasse` |
| Testes novos | `menu-do-celular-fiacao`, `portas-do-repasse`, `faixas-do-repasse`, `faixa-do-repasse-no-estoque`, `faixa-do-repasse-na-home` |
| Testes que mudam | `textoDoRepasse.ts` (ajudante), `pagina-do-repasse`, `paginas-geo`, `cabecalho-renderizado`, `rodape-renderizado`, `repasse-sem-view-item`, `areas-do-site` |

## Desvios da spec e decisões, e por quê

**Decisões do controlador (vinculantes):**

1. **Menu do celular com o apoio da prancha.** O item REPASSE leva "abaixo da FIPE, à vista" (campo opcional `apoio` em `ItemDoMenu`), **só no menu do celular**. Na barra do desktop o REPASSE aparece só a partir de 1281px (`hidden desktop:block`); no menu do celular, sempre. Consequência a registrar: de 1024 a 1280px o menu do celular não existe (`lg:hidden`) e a barra não mostra o REPASSE — nessa faixa a porta visível é o rodapé (o link está no HTML da barra, oculto). É a decisão do dono de 24/09 (spec §2).
2. **A faixa do `/estoque` vai só na raiz `/estoque`**, como a spec escreve. Os hubs que passam por `PaginaDeEstoque.tsx` (`/estoque/[recorte]`, `/[categoria]/[marca]`, `/[categoria]/[marca]/[modelo]`) ficam sem faixa. Ela aparece com **1 ou mais** carros abertos a todos e some inteira abaixo disso.
3. **A faixa da home mostra os 3 carros abertos a todos mais recentes** (a ordem do lote, `publicadoEm` decrescente), e só com **3 ou mais** abertos; senão some inteira. É uma área nova em `AREAS_DA_HOME` e um bloco em `page.tsx`. **Aparece sem passo no painel**, conferido no código: `normalizarAreas` (`src/lib/areasDoSite.ts:184-220`) insere todo id do catálogo que falta na ordem salva logo depois da vizinha que o precede no catálogo, e `ocultas` não pode conter um id que ainda não existia. Com a ordem de produção lida em 05/09 (sem `faixas_de_preco`), a sequência fica `… estoque_selecionado, faixas_de_preco, repasse, consultoria …`. O dono pode desligá-la ou movê-la na tela A3 como qualquer outra.
4. **O card das faixas é o simplificado da prancha:** foto, etiqueta, título, preço e "R$ X abaixo da FIPE", sem WhatsApp. Componente novo em `src/components/repasse/CardDaFaixa.tsx`, reusando `contaDoRepasse`, `etiquetaDoRepasse`, `emReais`, `nomeComAno`, `ehFotoPropria`, `Etiqueta` e `abaixoDaFipeNaBarra`. Os componentes novos moram em `src/components/repasse/`. As duas páginas **não** desenham dado de repasse por conta própria (só montam o componente), então a condição da decisão não se cumpre — mesmo assim `repasse-sem-view-item` passa a varrer os dois pontos de chamada, porque é ali que alguém copiaria o `trackVehicleView` "para medir a faixa" (handoff §8), e custa duas linhas (Task 4).
5. **Rodapé:** "Repasse" na coluna **INSTITUCIONAL** de `colunasDoRodape.ts`, logo depois de "Garantia". A coluna "Comprar" da spec não existe desde o redesign do rodapé. As contagens presas nos testes mudam de propósito: `rodape-renderizado` 12 → 13 (e o comentário que dá o motivo), `cabecalho-renderizado` ganha `/repasse` na lista de `href`.
6. **Leitura nas duas páginas:** `lerRepassesPublicos(agora, rota).catch(…)` devolvendo `[]`, no molde de `src/app/sitemap.ts:94-101` — escrita **uma vez**, em `lerRepassesDasPortas` (Task 3), e chamada pelas duas páginas. Pane esconde a faixa e nunca derruba a página. **O `catch` chama `registrarFalha("quebra", "repasse-leitura-das-portas", …)`**, porque sem registro a faixa sumiria das duas páginas mais visitadas sem ninguém saber, e a enxurrada não vem: com `revalidate = 60` há no máximo uma regeneração por minuto por página, a carência de 10 s agrupa pelo assunto e o disjuntor de 60 s cala a gravação quando o próprio banco está fora (`src/lib/observabilidade.ts:46-66`). A gravação é esperada (`await`): ela tem teto de 2 s e nunca lança, e esperar garante que a linha saia antes de a função congelar.
7. **`src/lib/paginasGeo.ts:55-57`:** sai só a oração "Os outros sete vão para repasse antes de chegar à vitrine."; o resto fica. Nenhum teste prendia a frase (conferido: nenhuma ocorrência em `tests/`), então nasce uma trava em `paginas-geo.test.ts`. O item T3 do Guia 07 fecha no `.md` do guia (spec §10).
8. **Todo texto público novo em `paginaDoRepasse.ts`:** `PORTAS_DO_REPASSE` e `abertosHoje(n)`, com amostras em `tests/textoDoRepasse.ts`, para as travas de texto existentes o cobrirem. O texto da prancha é verbatim. O que não está na prancha está na lista abaixo.
9. **Largura do menu:** a spec manda reconferir a folga de 1281 a 1535 com o REPASSE somado. **A aritmética do próprio docblock prevê déficit** em 1281px: o REPASSE custa `r + 28` (rótulo + `desktop:gap-7`), a folga de hoje em 1281 é 82px, e o CONTATO — sete letras maiúsculas no mesmo estilo — mede 61,5px (676,0 − 586,5 − 28). Com `r` entre 56 e 62px, a folga em 1281 cai para algo entre −8 e −2px: é o mesmo defeito que tirou o CONTATO do degrau `desktop:` em 07/09 (telefone em duas linhas). A remedição é do controlador, no build de produção local, com o método do docblock (Task 6, passos 4 a 6); **se a folga medida ficar negativa em qualquer largura de 1281 a 1300, o merge para e o dono escolhe** entre as opções da Task 6, passo 5.
10. **Fechamento pelo controlador (Task 6):** suíte em 8 fatias, `tsc`, lint, remedição do menu, push, CI verde nos cinco jobs, revisão final com o checklist do `qa-guardian` (spec §12), textos ao dono, PR pelo Chrome do dono com o ok dele. Ordem de merge: **depois do #156**, pela sessão de handoff.

**Decisões deste plano:**

11. **O texto do menu e do rodapé nasce em `repasseNaNavegacao.ts`, não em `paginaDoRepasse.ts`.** `Header` e `Footer` são client components montados pelo layout em toda página, e `paginaDoRepasse.ts` já é importado por cinco ilhas cliente do `/repasse` (`ExameNoPatio`, `GaleriaDoRepasse`, `ListaDoRepasse`, `LoteDoRepasse`, `TrilhaDoHeroi`). O webpack mantém um módulo por compilação com a união das exportações usadas: o menu que importasse `paginaDoRepasse.ts` levaria o texto dessas ilhas para o pacote da home, do `/estoque` e de toda ficha. `paginaDoRepasse.ts` reexporta as duas constantes, e `tests/textoDoRepasse.ts` (que recolhe tudo o que ele exporta) passa a lê-las — a decisão 8 continua cumprida no que ela protege.
12. **`CAMINHO_DO_REPASSE` passa a nascer em `repasseNaNavegacao.ts`** e é reexportado com o mesmo nome; quem o importa de `paginaDoRepasse.ts` (sitemap, grafo, not-found) não muda.
13. **"VER OS N CARROS" da home conta o lote inteiro** (publicado aberto, só-lojistas e reservado), o mesmo número do CTA do herói do `/repasse` (`TrilhaDoHeroi`, `totalNoLote = resumo.lote.length`): o link leva a uma página que mostra esses N cards. O "Hoje são N carros abertos" do `/estoque` conta só os abertos a todos, como a frase diz.
14. **Os dois CTAs das faixas levam a `/repasse`** (a prancha aponta `Main.dc.html`), não a `/repasse#lote`. `next/link` sem hash, então fora da trava de âncoras.
15. **Título do card sem a versão:** `nomeComAno({ marca, modelo, versao: null, ano: ano_modelo })` → "Fiat Argo 2019", como a prancha. A foto vai com `alt=""`: o nome do carro já é o texto do link, e repeti-lo faria o leitor de tela dizê-lo duas vezes.
16. **"R$ X abaixo da FIPE" só com FIPE e com diferença positiva**, a mesma guarda da conta e da barra da ficha (`ContaDoRepasse.tsx:26`, `repasse/[carro]/page.tsx:201`); a linha usa `abaixoDaFipeNaBarra`, que já monta essa frase.
17. **A área da home é `repasse`, tipo `DINÂMICO`, editável em `/admin/repasse`**, entre `faixas_de_preco` e `consultoria` no catálogo.
18. **O menu do celular ganha teste em jsdom** (`tests/menu-do-celular-fiacao.test.ts`), que fecha também as quatro mutações de 07/09 que o docblock de `cabecalho-renderizado.test.ts` registra como sem testemunha.
19. **Singular da faixa do `/estoque`: "Hoje há 1 carro aberto."** (a prancha só desenha o plural). Zero não chega à função: sem carro aberto a faixa não é montada.
20. **Nada de medição nos CTAs das faixas.** Não existe `trackCtaClick`, e a convenção do site é não medir navegação interna pura (`LinkRegua` da home não mede) — handoff §8.

## Textos novos para o dono aprovar antes do merge

Todo o resto do texto das portas é da prancha "Portas de entrada" (aprovada com o desenho v5). Estes não estão nela; saem de `paginaDoRepasse.ts` e vão ao dono na Task 6:

- **"Hoje há 1 carro aberto."** — o singular da faixa do `/estoque` (a prancha só tem "Hoje são 6 carros abertos.").
- **"Repasse"** no rodapé, coluna INSTITUCIONAL — vem da spec §10, não da prancha (que não desenha rodapé).
- Para conhecimento, sem ser texto novo: o primeiro parágrafo de `/seminovos-curitiba` passa a terminar em "…de cada dez veículos avaliados, três entram." (a oração do repasse sai, spec §10).
- Interno (painel, tela A3), não público: a área "Repasse Motors", com a descrição "Três carros de repasse abertos a todos; some com menos de três."

## Fora deste PR

- A faixa nos hubs que passam por `PaginaDeEstoque.tsx` (decisão 2).
- O `<nav aria-label="Menu no celular">` que a prancha desenha em volta do menu do celular, e o rótulo do botão de fechar: acessibilidade do menu inteiro, não das portas.
- Medição de clique nos CTAs das faixas (decisão 20).
- Catálogo da Meta/Merchant com os repasses, `view_item`/`ViewContent` com id de repasse → fora do escopo (spec §13).

---

### Task 1: Os textos das portas, a frase geo e o Guia 07 — Sonnet

**Files:**
- Create: `src/lib/repasseNaNavegacao.ts`
- Modify: `src/lib/paginaDoRepasse.ts` (reexportação depois dos imports; sai a linha 56; bloco novo antes da seção "O que os formulários e a rota dizem quando algo não passa")
- Modify: `tests/textoDoRepasse.ts` (amostra de `abertosHoje`)
- Test: `tests/pagina-do-repasse.test.ts` (um `describe` a mais, no fim)
- Modify: `src/lib/paginasGeo.ts:55-57`
- Test: `tests/paginas-geo.test.ts` (um `describe` a mais, no fim)
- Modify: `conteudo-seo/pacote/guias/07-carro-reprovado-cautelar-como-vender.md:152,160`

**Interfaces:**
- Consumes: `verOsCarros(total)`, `abaixoDaFipeNaBarra(valor)` (já em `paginaDoRepasse.ts`).
- Produces (usados pelas Tasks 2, 4 e 5):
  - `src/lib/repasseNaNavegacao.ts`: `CAMINHO_DO_REPASSE = "/repasse"`; `REPASSE_NA_NAVEGACAO = { menu: "REPASSE", apoioNoCelular: "abaixo da FIPE, à vista", rodape: "Repasse" } as const`.
  - `src/lib/paginaDoRepasse.ts`: reexporta `CAMINHO_DO_REPASSE` e `REPASSE_NA_NAVEGACAO`; `PORTAS_DO_REPASSE = { rotulo, estoque: { titulo, texto, botao }, home: { titulo, texto } } as const`; `abertosHoje(total: number): string`.

- [ ] **Step 1: Escrever os testes que falham**

No fim de `tests/pagina-do-repasse.test.ts`, acrescentar:

```ts
describe("as portas de entrada, como a prancha Portas escreve (PR 4)", () => {
  it("a faixa do /estoque, com a contagem da prancha", () => {
    expect(pagina.PORTAS_DO_REPASSE.rotulo).toBe("REPASSE MOTORS");
    expect(pagina.PORTAS_DO_REPASSE.estoque.titulo).toBe("Paga à vista? Tem carro abaixo da FIPE no repasse.");
    expect(`${pagina.PORTAS_DO_REPASSE.estoque.texto} ${pagina.abertosHoje(6)}`).toBe(
      "Sem a garantia da loja. Cada carro diz se tem laudo e mostra a conta, com o reparo orçado quando há. Hoje são 6 carros abertos.",
    );
    expect(pagina.PORTAS_DO_REPASSE.estoque.botao).toBe("VER O REPASSE");
  });

  it("um carro aberto fala no singular", () => {
    expect(pagina.abertosHoje(1)).toBe("Hoje há 1 carro aberto.");
  });

  it("a faixa da home, com o CTA e a linha do card que já existiam", () => {
    expect(pagina.PORTAS_DO_REPASSE.home.titulo).toBe("Repasse às claras");
    expect(pagina.PORTAS_DO_REPASSE.home.texto).toBe(
      "Carros no estado e abaixo da FIPE. Cada um diz se tem laudo e traz a conta e a ficha de estado. Só à vista.",
    );
    expect(pagina.verOsCarros(6)).toBe("VER OS 6 CARROS");
    expect(pagina.abaixoDaFipeNaBarra("R$ 3.180")).toBe("R$ 3.180 abaixo da FIPE");
  });

  it("o menu e o rodapé, pelo módulo pequeno que o cabeçalho importa", () => {
    expect(pagina.CAMINHO_DO_REPASSE).toBe("/repasse");
    expect(pagina.REPASSE_NA_NAVEGACAO).toEqual({
      menu: "REPASSE",
      apoioNoCelular: "abaixo da FIPE, à vista",
      rodape: "Repasse",
    });
  });

  it("o texto do menu e o singular chegam às travas desta seção", () => {
    // A reexportação é o que põe o texto de `repasseNaNavegacao.ts` em
    // `textosFixosDoRepasse()`; a amostra de `abertosHoje` é o que põe o
    // singular em `textosMontadosDoRepasse()`. Sem as duas, esse texto ficaria
    // fora da régua dos termos proibidos e das marcas de IA.
    expect(TUDO).toContain("abaixo da FIPE, à vista");
    expect(TUDO).toContain("Hoje há 1 carro aberto.");
  });
});
```

No fim de `tests/paginas-geo.test.ts` (gravar com a ferramenta Write/Edit — o arquivo passa a ter `\b` e `\w`), acrescentar:

```ts
describe("o texto geo não põe o repasse no lugar do carro recusado (spec 2026-09-24 §10)", () => {
  // "Os outros sete vão para repasse antes de chegar à vitrine" fazia o leitor
  // supor que o carro de repasse é o que a perícia recusou. O repasse é outra
  // seção, com a conta e o laudo à mostra; a oração saiu no PR 4 do repasse.
  const frases = (p: (typeof PAGINAS_GEO)[number]) =>
    [p.descricao, ...p.paragrafos, ...p.faq.flatMap((f) => [f.pergunta, f.resposta])]
      .join(" ")
      .split(/(?<=[.!?])\s+/);

  it("nenhuma frase junta o repasse ao filtro da loja", () => {
    for (const p of PAGINAS_GEO) {
      for (const frase of frases(p).filter((f) => /repasse/i.test(f))) {
        expect(frase, p.slug).not.toMatch(/\b(sete|recusad\w*|reprovad\w*|n[ãa]o entra\w*)|chegar [àa] vitrine/i);
      }
    }
  });

  it("o filtro continua dito, e a frase termina nele", () => {
    const curitiba = PAGINAS_GEO.find((p) => p.slug === "seminovos-curitiba");
    expect(curitiba, "a página de Curitiba").toBeDefined();
    expect(curitiba!.paragrafos[0]).toMatch(/de cada dez veículos avaliados, três entram\.$/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/pagina-do-repasse.test.ts tests/paginas-geo.test.ts`
Expected: FAIL — `PORTAS_DO_REPASSE`, `abertosHoje` e `REPASSE_NA_NAVEGACAO` não existem; a página de Curitiba ainda tem "Os outros sete vão para repasse…" (as duas asserções geo reprovam).

- [ ] **Step 3: O módulo pequeno**

`src/lib/repasseNaNavegacao.ts`:

```ts
/**
 * O repasse no cabeçalho e no rodapé (spec 2026-09-24 §10; prancha "Portas
 * de entrada", seção 1).
 *
 * Todo texto da seção de repasse mora em `paginaDoRepasse.ts` (spec §7.3), e
 * este também — por reexportação. Ele NASCE aqui, num módulo sem import, por
 * causa do pacote do navegador: `Header.tsx` e `Footer.tsx` são client
 * components montados pelo layout em TODA página, e `paginaDoRepasse.ts` já é
 * importado por cinco ilhas cliente do `/repasse` (`ExameNoPatio`,
 * `GaleriaDoRepasse`, `ListaDoRepasse`, `LoteDoRepasse`, `TrilhaDoHeroi`). O
 * webpack mantém um módulo por compilação, com a UNIÃO das exportações que
 * alguém usa: o menu que importasse `paginaDoRepasse.ts` levaria o texto
 * dessas ilhas para o pacote da home, do `/estoque` e de toda ficha.
 *
 * `paginaDoRepasse.ts` reexporta as duas constantes, e é por lá que as travas
 * de texto as leem (`tests/textoDoRepasse.ts` recolhe tudo o que ele exporta).
 * Sem travessão em nenhuma string, como lá.
 */
export const CAMINHO_DO_REPASSE = "/repasse";

export const REPASSE_NA_NAVEGACAO = {
  /** O item da barra do desktop e do menu do celular. */
  menu: "REPASSE",
  /** À direita do item, SÓ no menu do celular (decisão 1 do plano do PR 4). */
  apoioNoCelular: "abaixo da FIPE, à vista",
  /** Coluna INSTITUCIONAL do rodapé (decisão 5 do plano do PR 4). */
  rodape: "Repasse",
} as const;
```

- [ ] **Step 4: `paginaDoRepasse.ts` — a reexportação e o bloco das portas**

1. Logo depois do bloco de imports (depois da linha `} from "./repasse";`), acrescentar:
   ```ts

   // O caminho e o texto do repasse no menu e no rodapé nascem num módulo sem
   // import, porque `Header` e `Footer` são client components de toda página
   // (ver o docblock de `repasseNaNavegacao.ts`). Reexportados aqui, entram na
   // régua de `tests/textoDoRepasse.ts` como o resto da seção.
   export { CAMINHO_DO_REPASSE, REPASSE_NA_NAVEGACAO } from "./repasseNaNavegacao";
   ```
2. Apagar a linha `export const CAMINHO_DO_REPASSE = "/repasse";` (hoje a linha 56, primeira da seção "Caminho e âncoras"). As âncoras abaixo dela ficam.
3. Imediatamente antes do bloco
   ```ts
   // ---------------------------------------------------------------------------
   // O que os formulários e a rota dizem quando algo não passa
   // ---------------------------------------------------------------------------
   ```
   acrescentar:
   ```ts
   // ---------------------------------------------------------------------------
   // Portas de entrada (PR 4, spec §10): as faixas do /estoque e da home
   // ---------------------------------------------------------------------------

   /**
    * Prancha "Portas de entrada", seções 2 e 3, letra por letra. Quem decide se
    * cada faixa aparece é `lib/portasDoRepasse.ts`; o CTA da home é
    * `verOsCarros` e a linha do card é `abaixoDaFipeNaBarra`, as mesmas do
    * `/repasse`.
    */
   export const PORTAS_DO_REPASSE = {
     rotulo: "REPASSE MOTORS",
     estoque: {
       titulo: "Paga à vista? Tem carro abaixo da FIPE no repasse.",
       texto: "Sem a garantia da loja. Cada carro diz se tem laudo e mostra a conta, com o reparo orçado quando há.",
       botao: "VER O REPASSE",
     },
     home: {
       titulo: "Repasse às claras",
       texto: "Carros no estado e abaixo da FIPE. Cada um diz se tem laudo e traz a conta e a ficha de estado. Só à vista.",
     },
   } as const;

   /**
    * "Hoje são 6 carros abertos." O fim do texto da faixa do /estoque, com a
    * contagem dos abertos a todos. A prancha só desenha o plural; o singular é
    * texto novo (lista do dono no plano do PR 4). Zero não chega aqui: sem
    * carro aberto a faixa nem é montada.
    */
   export function abertosHoje(total: number): string {
     return total === 1 ? "Hoje há 1 carro aberto." : `Hoje são ${total} carros abertos.`;
   }

   ```

- [ ] **Step 5: A amostra no ajudante**

Em `tests/textoDoRepasse.ts`:
1. Em `FUNCOES_COM_AMOSTRA`, depois de `"textoDoVazio",`, acrescentar `"abertosHoje",`.
2. Em `textosMontadosDoRepasse()`, depois de `pagina.textoDoVazio(null),`, acrescentar:
   ```ts
       pagina.abertosHoje(1),
       pagina.abertosHoje(6),
   ```

- [ ] **Step 6: A frase geo**

Em `src/lib/paginasGeo.ts`, trocar

```ts
      "A Motors Store atende Curitiba inteira a partir do showroom no Bacacheri e se diferencia " +
        "das outras revendas da cidade pelo filtro: de cada dez veículos avaliados, três entram. " +
        "Os outros sete vão para repasse antes de chegar à vitrine.",
```

por

```ts
      // Até 25/09 terminava em "Os outros sete vão para repasse antes de chegar
      // à vitrine.", que fazia o leitor supor que o carro de repasse é o
      // recusado na perícia (spec 2026-09-24 §10). A oração saiu; a trava está
      // em `tests/paginas-geo.test.ts`.
      "A Motors Store atende Curitiba inteira a partir do showroom no Bacacheri e se diferencia " +
        "das outras revendas da cidade pelo filtro: de cada dez veículos avaliados, três entram.",
```

- [ ] **Step 7: O item T3 do Guia 07**

Em `conteudo-seo/pacote/guias/07-carro-reprovado-cautelar-como-vender.md`:
1. Trocar a linha 152 (começa com `- [ ] **Verificação de T3 sobre repasse.**`) inteira por:
   ```markdown
   - [x] **Verificação de T3 sobre repasse.** Fechado em 25/09/2026 pela spec `docs/superpowers/specs/2026-09-24-secao-de-repasse-design.md` §10: a frase da `/garantia` ("na venda ao consumidor, não pedimos termo de isenção") segue verdadeira, porque a ficha de estado que o comprador do repasse assina não é termo de isenção. A redação deste guia ("outro caminho comercial") fica como está.
   ```
2. Trocar a linha 160 (`- [ ] **T3 — pendente**, ver acima`) por:
   ```markdown
   - [x] T3 — fechado em 25/09/2026, ver acima
   ```

- [ ] **Step 8: Rodar e ver passar, com as travas que já leem esse texto**

Run: `npx vitest run tests/pagina-do-repasse.test.ts tests/paginas-geo.test.ts tests/textos-sem-marcas-de-ia.test.ts tests/promessa-publica.test.ts tests/grafo-do-repasse.test.ts tests/sitemap-anuncia-o-repasse.test.ts tests/fronteira-servidor-cliente.test.ts`
Expected: PASS. (`grafo-do-repasse` e `sitemap-anuncia-o-repasse` provam que `CAMINHO_DO_REPASSE` continua chegando pela reexportação; `fronteira-servidor-cliente` resolve o `export … from` novo.)

Conferir as barras: `grep -c $'\x08' tests/paginas-geo.test.ts` → `0`.

- [ ] **Step 9: Provar as travas com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. Em `paginasGeo.ts`, devolver `" Os outros sete vão para repasse antes de chegar à vitrine."` ao fim do parágrafo → as duas asserções geo reprovam.
2. Apagar a linha `export { CAMINHO_DO_REPASSE, REPASSE_NA_NAVEGACAO } from "./repasseNaNavegacao";` → "o menu e o rodapé…" e "o texto do menu e o singular chegam às travas" reprovam (e `grafo-do-repasse` quebra ao importar).
3. Em `abertosHoje`, trocar o singular por `` `Hoje são ${total} carros abertos.` `` sem o ramo → "um carro aberto fala no singular" reprova.
4. Tirar `"abertosHoje",` de `FUNCOES_COM_AMOSTRA` → "toda função exportada tem amostra no ajudante" reprova.
5. Escrever "sem giro" no fim de `PORTAS_DO_REPASSE.estoque.texto` → "nenhum da lista do painel (venda e jurídico)" reprova (a régua existente já alcança o bloco novo).

- [ ] **Step 10: Commit**

```bash
git add src/lib/repasseNaNavegacao.ts src/lib/paginaDoRepasse.ts src/lib/paginasGeo.ts tests/textoDoRepasse.ts tests/pagina-do-repasse.test.ts tests/paginas-geo.test.ts conteudo-seo/pacote/guias/07-carro-reprovado-cautelar-como-vender.md
git commit -m "feat(repasse): textos das portas, a oração geo que ligava repasse a recusado e o T3 do Guia 07

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: O repasse no menu e no rodapé — Sonnet

**Files:**
- Modify: `src/lib/menuDoCabecalho.ts` (imports, `ItemDoMenu`, docblock, o item novo)
- Modify: `src/components/Header.tsx` (import, docblocks, degrau do REPASSE na barra, apoio no menu do celular)
- Modify: `src/lib/colunasDoRodape.ts` (imports, o item novo)
- Test: `tests/menu-do-celular-fiacao.test.ts` (novo, jsdom)
- Test: `tests/cabecalho-renderizado.test.ts` (lista de `href`, teste do degrau, docblock)
- Test: `tests/rodape-renderizado.test.ts` (contagem 12 → 13, `/repasse`, título do Instagram)

**Interfaces:**
- Consumes: `CAMINHO_DO_REPASSE`, `REPASSE_NA_NAVEGACAO` de `src/lib/repasseNaNavegacao.ts` (Task 1). **Nunca** de `paginaDoRepasse.ts` (decisão 11).
- Produces: `ItemDoMenu = { href: string; rotulo: string; apoio?: string }`; `MENU_DO_CABECALHO` com sete itens, `/repasse` em segundo; na barra, o `<a href="/repasse">` com `hidden desktop:block`; no menu do celular, o apoio em `<span>` depois do rótulo; "Repasse" como nona âncora institucional do rodapé. A tabela de largura do docblock fica marcada como vencida até a Task 6.

- [ ] **Step 1: Escrever os testes que falham**

`tests/menu-do-celular-fiacao.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CompanySettings } from "../src/types";
import { REPASSE_NA_NAVEGACAO } from "../src/lib/repasseNaNavegacao";

/**
 * O menu do celular, aberto de verdade (jsdom + clique).
 *
 * `cabecalho-renderizado.test.ts` só enxerga a barra do desktop: o menu do
 * celular nasce com `mobileMenuOpen` falso e não existe no HTML de servidor. A
 * revisão de 07/09 mediu quatro mutações nele que passavam verdes na suíte
 * cheia (ver o docblock de lá). Este arquivo as fecha, e prova o que o PR 4
 * acrescentou: o REPASSE em segundo, com o apoio "abaixo da FIPE, à vista" que
 * a prancha "Portas de entrada" desenha só no celular.
 */

const EMPRESA: CompanySettings = {
  name: "Motors Store",
  phone: "41 99737-2165",
  whatsapp: "41 99737-2165",
  whatsappRaw: "5541997372165",
  address: "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350",
  hours: "Seg a sex 8h30-18h30",
  instagram: "https://instagram.com/motorsstore.oficial",
  facebook: "https://facebook.com/motorsstore.oficial",
  cnpj: "",
};

vi.mock("../src/app/ThemeContext", () => ({
  useTheme: () => ({ theme: "motors-modernist", companySettings: EMPRESA }),
}));

let caminho = "/";
vi.mock("next/navigation", () => ({ usePathname: () => caminho }));
vi.mock("../src/lib/telemetry", () => ({ trackContactClick: () => {} }));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _fill, priority: _priority, unoptimized: _uo, ...resto } = props;
    return createElement("img", resto as never);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  caminho = "/";
});

/** Monta o cabeçalho, clica no botão do menu e devolve o painel aberto. */
async function menuAberto(): Promise<HTMLElement> {
  const { default: Header } = await import("../src/components/Header");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(Header)));

  const botao = container.querySelector('button[aria-label="Menu principal"]') as HTMLButtonElement | null;
  expect(botao, "o botão do menu do celular").not.toBeNull();
  await act(async () => botao!.click());

  // O painel aberto é o único lugar com o link PAINEL; os itens moram nele.
  const painel = [...container.querySelectorAll("a")].find((a) => a.textContent === "PAINEL");
  expect(painel, "o menu do celular abriu").toBeDefined();
  return painel!.closest(".absolute") as HTMLElement;
}

/** Os itens do menu do celular, sem o PAINEL. */
const itens = (menu: HTMLElement) =>
  [...menu.querySelectorAll("a")].filter((a) => a.getAttribute("href") !== "/configuracoes");

describe("o menu do celular, aberto", () => {
  it("os sete destinos, na ordem, com o REPASSE em segundo", async () => {
    // Pega também duas das mutações de 07/09: filtrar `/guias` fora do map do
    // celular e trocar a lista por `[]`.
    const menu = await menuAberto();
    expect(itens(menu).map((a) => a.getAttribute("href"))).toEqual([
      "/estoque",
      "/repasse",
      "/carro-perfeito",
      "/avaliacao",
      "/guias",
      "/sobre",
      "/contato",
    ]);
  });

  it("o REPASSE leva o apoio da prancha, e só ele", async () => {
    const menu = await menuAberto();
    const repasse = itens(menu).find((a) => a.getAttribute("href") === "/repasse");
    expect(repasse, "o item do repasse").toBeDefined();
    expect([...repasse!.querySelectorAll("span")].map((s) => s.textContent)).toEqual([
      REPASSE_NA_NAVEGACAO.menu,
      REPASSE_NA_NAVEGACAO.apoioNoCelular,
    ]);
    for (const outro of itens(menu).filter((a) => a !== repasse)) {
      expect(outro.querySelectorAll("span"), outro.getAttribute("href") ?? "").toHaveLength(1);
    }
  });

  it("a barra do desktop não leva o apoio", async () => {
    await menuAberto();
    const naBarra = container.querySelector('nav a[href="/repasse"]');
    expect(naBarra, "o REPASSE na barra").not.toBeNull();
    expect(naBarra!.textContent).toBe(REPASSE_NA_NAVEGACAO.menu);
  });

  it("o item da página atual é marcado no celular, para o leitor de tela e para o olho", async () => {
    // As outras duas mutações de 07/09: apagar o `aria-current` do map do
    // celular e trocar as classes de ativo e inativo entre si.
    caminho = "/repasse/renault-kwid-zen-1-0-2021-3f9a1c";
    const menu = await menuAberto();
    const ativo = itens(menu).find((a) => a.getAttribute("href") === "/repasse")!;
    const inativo = itens(menu).find((a) => a.getAttribute("href") === "/estoque")!;

    expect(ativo.getAttribute("aria-current")).toBe("page");
    expect(inativo.getAttribute("aria-current")).toBeNull();
    expect(itens(menu).filter((a) => a.getAttribute("aria-current") === "page")).toHaveLength(1);
    expect(ativo.className).toContain("text-mt-accent");
    expect(inativo.className).toContain("text-mt-inverso-suave");
  });
});
```

Em `tests/cabecalho-renderizado.test.ts` (gravar com a ferramenta Edit — o teste novo tem `\b`):

1. Trocar
   ```ts
     it("os seis destinos, na ordem", async () => {
       expect(await menuServido()).toEqual([
         "/estoque",
         "/carro-perfeito",
   ```
   por
   ```ts
     it("os sete destinos, na ordem", async () => {
       // `/repasse` em segundo desde 25/09 (spec 2026-09-24 §10): logo depois
       // do estoque, a outra porta de compra.
       expect(await menuServido()).toEqual([
         "/estoque",
         "/repasse",
         "/carro-perfeito",
   ```
2. Logo depois do `it("o CONTATO só aparece a partir de 2xl, e não do degrau desktop", …)` (que termina em `expect(link![0]).not.toContain("desktop:block");\n  });`), acrescentar:
   ```ts

     it("o REPASSE só aparece a partir do degrau desktop (1281px), e não do 2xl", async () => {
       // Decisão do dono de 24/09 (spec 2026-09-24 §2 e §10): na barra só de
       // 1281px para cima; de 1024 a 1280 ele fica no HTML, oculto, e não pesa
       // na régua da folga. Como no teste do CONTATO acima, o que decide o
       // comportamento é a classe SERVIDA.
       const html = await cabecalho();
       const link = html.match(/<a[^>]*href="\/repasse"[^>]*>/);

       expect(link, "o cabeçalho precisa linkar /repasse").not.toBeNull();
       expect(link![0]).toMatch(/\bhidden\b/);
       expect(link![0]).toContain("desktop:block");
       expect(link![0]).not.toContain("2xl:block");
     });
   ```
3. No docblock do topo, trocar o parágrafo
   ```
    * Fechar isso exige `jsdom` + testing-library, que o `vitest.config.ts` adia
    * explicitamente ("adicionar quando chegarem"), ou forçar `mobileMenuOpen`
    * mockando o `useState` do React. Nenhum dos dois cabe num PR de menu, e por
    * isso fica ESCRITO — o que não pode é a próxima pessoa ler "a trava cobre a
    * barra" e supor que cobre o resto.
   ```
   por
   ```
    * As quatro têm testemunha desde 25/09 (PR 4 do repasse), em
    * `tests/menu-do-celular-fiacao.test.ts`: jsdom (que o `vitest.config.ts`
    * passou a ter em 07/09), clique no botão do menu, e a lista, a ordem, o
    * item ativo e o apoio do REPASSE afirmados no DOM. O que continua só aqui
    * é a barra do desktop, com as classes de degrau que o HTML servido leva.
   ```

Em `tests/rodape-renderizado.test.ts`:

1. Na lista do primeiro `it`, depois de `"/garantia",`, acrescentar `"/repasse",`.
2. Trocar
   ```ts
     it("são doze âncoras, e nenhuma se perdeu no caminho", async () => {
       // OITO institucionais + telefone + WhatsApp + endereço + Instagram. O
       // número exato é a trava: um item que deixa de virar link some daqui.
       //
       // Eram seis institucionais até 2026-09-05: `/contato` entrou naquele dia, e
       // `/guias` logo depois, com o primeiro guia dos Guias Motors.
       expect(await ancoras()).toHaveLength(12);
     });
   ```
   por
   ```ts
     it("são treze âncoras, e nenhuma se perdeu no caminho", async () => {
       // NOVE institucionais + telefone + WhatsApp + endereço + Instagram. O
       // número exato é a trava: um item que deixa de virar link some daqui.
       //
       // Eram seis institucionais até 2026-09-05: `/contato` entrou naquele dia,
       // `/guias` logo depois, com o primeiro guia dos Guias Motors, e
       // `/repasse` em 2026-09-25 (spec 2026-09-24 §10, PR 4 do repasse).
       expect(await ancoras()).toHaveLength(13);
     });
   ```
3. Depois do `it("os guias têm entrada em todas as páginas", …)`, acrescentar:
   ```ts

     it("o repasse tem entrada em todas as páginas", async () => {
       // Spec 2026-09-24 §10. De 1024 a 1280px a barra do cabeçalho não mostra
       // o REPASSE (decisão do dono de 24/09) e o menu do celular não existe:
       // nessa faixa, este é o link visível.
       expect(await ancoras()).toContain("/repasse");
     });
   ```
4. Trocar `it("o Instagram é o décimo link, e é o Instagram", async () => {` por `it("o Instagram está entre as âncoras, e é o Instagram", async () => {`, e o comentário logo abaixo por:
   ```ts
       // A contagem sozinha não o distingue: trocá-lo pelo Facebook passava. (O
       // título dizia "décimo"; com as institucionais que entraram depois ele é
       // o último, e a posição nunca foi o que este teste afirma.)
   ```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/menu-do-celular-fiacao.test.ts tests/cabecalho-renderizado.test.ts tests/rodape-renderizado.test.ts`
Expected: FAIL — o menu não tem `/repasse`, a barra não serve `desktop:block` nele, o celular não tem o apoio, o rodapé tem 12 âncoras.

- [ ] **Step 3: `menuDoCabecalho.ts`**

1. Trocar o topo
   ```ts
   import { NOME_DA_SECAO } from "./guias";

   export interface ItemDoMenu {
     href: string;
     rotulo: string;
   }
   ```
   por
   ```ts
   import { NOME_DA_SECAO } from "./guias";
   import { CAMINHO_DO_REPASSE, REPASSE_NA_NAVEGACAO } from "./repasseNaNavegacao";

   export interface ItemDoMenu {
     href: string;
     rotulo: string;
     /**
      * Texto de apoio, SÓ no menu do celular, à direita do rótulo (prancha
      * "Portas de entrada", 24/09). Hoje só o REPASSE tem. A barra do desktop
      * não o desenha: lá cada caractere custa folga na régua medida abaixo.
      */
     apoio?: string;
   }
   ```
2. No docblock, trocar
   ```
    * As três primeiras são as de ação — ver o pátio, dizer o que se procura,
    * vender o seu. `GUIAS MOTORS` entra logo depois delas e antes das
    * institucionais, que é onde o dono pediu em 07/09: quem já leu as três de cima
    * e não converteu é exatamente quem o conteúdo atende.
   ```
   por
   ```
    * As quatro primeiras são as de ação — ver o pátio, ver o repasse, dizer o
    * que se procura, vender o seu. O `REPASSE` entrou em 25/09 (spec 2026-09-24
    * §10) logo depois do `ESTOQUE`: é a outra porta de compra. `GUIAS MOTORS`
    * entra depois delas e antes das institucionais, que é onde o dono pediu em
    * 07/09: quem já leu as de cima e não converteu é exatamente quem o conteúdo
    * atende.
   ```
3. Trocar
   ```
    * Cabe na barra? Estes números são do código que está no ar
    * ---------------------------------------------------------------------------
    * A barra tem 68px e uma linha só, então o sexto item pedia prova. Medido em
   ```
   por
   ```
    * Cabe na barra? Estes números são do código que está no ar
    * ---------------------------------------------------------------------------
    * ⚠️ 25/09: a tabela abaixo é de ANTES do `REPASSE`. Ele fica oculto até
    * 1280px e custa rótulo + 28px de 1281 para cima; a remedição e a reescrita
    * desta seção são os passos 4 a 6 da Task 6 do plano do PR 4
    * (`docs/superpowers/plans/2026-09-25-repasse-pr4-portas.md`), antes do
    * merge. Não cite a tabela enquanto este aviso estiver aqui.
    *
    * A barra tem 68px e uma linha só, então o sexto item pedia prova. Medido em
   ```
4. No array, trocar
   ```ts
     { href: "/estoque", rotulo: "ESTOQUE" },
     { href: "/carro-perfeito", rotulo: "CARRO PERFEITO" },
   ```
   por
   ```ts
     { href: "/estoque", rotulo: "ESTOQUE" },
     // O repasse (spec 2026-09-24 §10), logo depois do estoque. Na barra só a
     // partir de `desktop:` (1281px), decisão do dono de 24/09 — o degrau mora
     // no `Header.tsx`; no celular, sempre, com o apoio da prancha. O texto vem
     // de `repasseNaNavegacao.ts`: ver lá por que não de `paginaDoRepasse.ts`.
     {
       href: CAMINHO_DO_REPASSE,
       rotulo: REPASSE_NA_NAVEGACAO.menu,
       apoio: REPASSE_NA_NAVEGACAO.apoioNoCelular,
     },
     { href: "/carro-perfeito", rotulo: "CARRO PERFEITO" },
   ```
5. No comentário do item de `/guias`, trocar `// A caixa alta é literal aqui porque é a convenção dos outros cinco rótulos,` por `// A caixa alta é literal aqui porque é a convenção dos outros rótulos,`.

- [ ] **Step 4: `Header.tsx`**

1. Depois de `import { MENU_DO_CABECALHO } from "../lib/menuDoCabecalho";`, acrescentar:
   ```ts
   import { CAMINHO_DO_REPASSE } from "../lib/repasseNaNavegacao";
   ```
2. No docblock do topo, trocar
   ```
    * A barra completa só liga em `lg:` (1024px): logo, CINCO links em
    * `whitespace-nowrap` (`CONTATO` é o sexto e só entra em `2xl:`), painel e CTA
   ```
   por
   ```
    * A barra completa só liga em `lg:` (1024px): logo, CINCO links em
    * `whitespace-nowrap` até 1280px (`REPASSE` entra em `desktop:`, 1281px, e
    * `CONTATO` em `2xl:`, 1536px), painel e CTA
   ```
3. No comentário acima do `<nav>` da barra, trocar a última linha
   ```tsx
               docblock de `lib/menuDoCabecalho.ts`. Decisão do dono em 07/09. */}
   ```
   por
   ```tsx
               docblock de `lib/menuDoCabecalho.ts`. Decisão do dono em 07/09.

               `REPASSE` entra em 25/09 (spec 2026-09-24 §10) com
               `hidden desktop:block`, decisão do dono de 24/09: de 1024 a
               1280px ele não existe para o layout e não pesa na régua; de 1281
               para cima custa o rótulo + 28px. A remedição está na tabela de
               `lib/menuDoCabecalho.ts`. */}
   ```
4. No `className` dos links da barra, trocar
   ```tsx
                   item.href === "/contato" ? "hidden 2xl:block" : ""
   ```
   por
   ```tsx
                   item.href === "/contato"
                     ? "hidden 2xl:block"
                     : item.href === CAMINHO_DO_REPASSE
                       ? "hidden desktop:block"
                       : ""
   ```
5. No menu do celular, trocar
   ```tsx
                 className={`border-b border-mt-inverso-regua-fina py-3.5 text-[11px] font-extrabold tracking-[.2em] no-underline ${
                   ativo(item.href) ? "text-mt-accent" : "text-mt-inverso-suave"
                 }`}
               >
                 {item.rotulo}
               </Link>
   ```
   por
   ```tsx
                 className={`flex items-baseline justify-between gap-3 border-b border-mt-inverso-regua-fina py-3.5 text-[11px] font-extrabold tracking-[.2em] no-underline ${
                   ativo(item.href) ? "text-mt-accent" : "text-mt-inverso-suave"
                 }`}
               >
                 <span>{item.rotulo}</span>
                 {/* O apoio da prancha "Portas de entrada" (hoje só o REPASSE),
                     à direita do rótulo, em peso normal. Só aqui: na barra do
                     desktop cada caractere custa folga (tabela de
                     `lib/menuDoCabecalho.ts`). */}
                 {item.apoio && (
                   <span className="text-[11px] font-normal tracking-normal text-mt-accent-400">{item.apoio}</span>
                 )}
               </Link>
   ```

- [ ] **Step 5: `colunasDoRodape.ts`**

1. Depois de `import { NOME_DA_SECAO } from "./guias";`, acrescentar:
   ```ts
   import { CAMINHO_DO_REPASSE, REPASSE_NA_NAVEGACAO } from "./repasseNaNavegacao";
   ```
2. Trocar
   ```ts
           { rotulo: "Garantia", href: "/garantia" },
   ```
   por
   ```ts
           { rotulo: "Garantia", href: "/garantia" },
           // O repasse (spec 2026-09-24 §10). A spec dizia "na coluna Comprar",
           // que não existe desde o redesign do rodapé: a INSTITUCIONAL é onde já
           // moram as outras portas de compra (Garagem Profiler, Avaliação
           // Express, Financiamento). De 1024 a 1280px é o único link visível
           // para ele — ver `tests/rodape-renderizado.test.ts`. O texto vem de
           // `repasseNaNavegacao.ts`, e não de `paginaDoRepasse.ts`: ver lá.
           { rotulo: REPASSE_NA_NAVEGACAO.rodape, href: CAMINHO_DO_REPASSE },
   ```

- [ ] **Step 6: Rodar e ver passar, com as vizinhas que leem o menu e o rodapé**

Run: `npx vitest run tests/menu-do-celular-fiacao.test.ts tests/cabecalho-renderizado.test.ts tests/rodape-renderizado.test.ts tests/guias-publicam-o-grafo.test.ts tests/nap-unico.test.ts tests/schema-do-veiculo.test.ts tests/rodape-e-imagens.test.ts tests/genero-e-concordancia.test.ts tests/pre-voo-das-conversoes.test.ts tests/fronteira-servidor-cliente.test.ts`
Expected: PASS.

Conferir as barras: `grep -c $'\x08' tests/cabecalho-renderizado.test.ts` → `0`.

- [ ] **Step 7: Provar as travas com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. No `Header.tsx`, trocar `"hidden desktop:block"` por `"hidden 2xl:block"` → "o REPASSE só aparece a partir do degrau desktop" reprova.
2. Apagar o ramo do REPASSE do ternário (fica `item.href === "/contato" ? "hidden 2xl:block" : ""`) → o mesmo teste reprova (falta `hidden`).
3. Na barra do desktop, trocar `{item.rotulo}` por `{item.rotulo}{item.apoio}` → "o que a barra serve como rótulo é o `rotulo` do dado" (SSR) e "a barra do desktop não leva o apoio" (jsdom) reprovam.
4. Apagar o `{item.apoio && (…)}` do menu do celular → "o REPASSE leva o apoio da prancha" reprova.
5. No menu do celular, trocar `NAV.map(` por `NAV.filter((i) => i.href !== "/guias").map(` → "os sete destinos, na ordem" (jsdom) reprova — a mutação de 07/09 que passava verde.
6. No menu do celular, apagar `aria-current={ativo(item.href) ? "page" : undefined}` → "o item da página atual é marcado no celular" reprova.
7. Em `colunasDoRodape.ts`, apagar o item do repasse → "são treze âncoras" e "o repasse tem entrada em todas as páginas" reprovam.
8. Em `menuDoCabecalho.ts`, mover o item do repasse para depois de `CARRO PERFEITO` → "os sete destinos, na ordem" (SSR e jsdom) reprovam.

- [ ] **Step 8: Commit**

```bash
git add src/lib/menuDoCabecalho.ts src/components/Header.tsx src/lib/colunasDoRodape.ts tests/menu-do-celular-fiacao.test.ts tests/cabecalho-renderizado.test.ts tests/rodape-renderizado.test.ts
git commit -m "feat(repasse): REPASSE no menu (barra a partir de 1281px, celular com o apoio) e no rodapé

A tabela de largura do docblock do menu fica marcada como vencida até a
remedição do fechamento (Task 6 do plano do PR 4).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: A regra das faixas e a leitura que não derruba a página — Opus

**Files:**
- Create: `src/lib/portasDoRepasse.ts`
- Test: `tests/portas-do-repasse.test.ts` (novo)

**Interfaces:**
- Consumes: `lerRepassesPublicos(agora: Date, rota: string): Promise<Repasse[]>` (`src/lib/leituraDosRepasses.ts:166`, lança em erro do Supabase, `[]` sem cliente); `resumoDoLote(visiveis: readonly Repasse[], agora: Date): ResumoDoLote` (`src/lib/loteDoRepasse.ts:74`; `lote` = publicado e reservado, mais recentes primeiro; `abertos` = subconjunto aberto a todos, na mesma ordem); `registrarFalha(natureza: "quebra" | "parada" | "ambos", assunto: string, detalhe: unknown, contexto?: Contexto): Promise<void>` (`src/lib/observabilidade.ts:616`, nunca lança).
- Produces (usados pelas Tasks 4 e 5):
  - `PISO_DA_FAIXA_NO_ESTOQUE = 1`, `CARROS_NA_FAIXA_DA_HOME = 3`
  - `type RotaDasPortas = "/" | "/estoque"`
  - `interface FaixaNoEstoque { abertos: number }`
  - `interface FaixaNaHome { carros: Repasse[]; totalNoLote: number }`
  - `faixaNoEstoque(visiveis: readonly Repasse[], agora: Date): FaixaNoEstoque | null`
  - `faixaNaHome(visiveis: readonly Repasse[], agora: Date): FaixaNaHome | null`
  - `lerRepassesDasPortas(agora: Date, rota: RotaDasPortas): Promise<Repasse[]>` — nunca rejeita.

- [ ] **Step 1: Escrever o teste que falha**

`tests/portas-do-repasse.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * A regra das portas do repasse (spec 2026-09-24 §10; decisões 2, 3 e 6 do
 * plano do PR 4): a faixa do /estoque com 1 ou mais carros abertos a todos; a
 * da home com os 3 abertos mais recentes, e só com 3 ou mais; e a leitura que
 * troca a pane por lista vazia, registrando a falha para a faixa não sumir
 * sem ninguém saber.
 */
const estado = vi.hoisted(() => ({ repasses: [] as unknown[], falha: null as Error | null, rotas: [] as string[] }));
const registrarFalha = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => {}));

vi.mock("../src/lib/leituraDosRepasses", () => ({
  lerRepassesPublicos: async (_agora: Date, rota: string) => {
    estado.rotas.push(rota);
    if (estado.falha) throw estado.falha;
    return estado.repasses;
  },
}));
vi.mock("../src/lib/observabilidade", () => ({ registrarFalha }));

const { CARROS_NA_FAIXA_DA_HOME, faixaNaHome, faixaNoEstoque, lerRepassesDasPortas } = await import(
  "../src/lib/portasDoRepasse"
);

const AGORA = new Date("2026-09-24T15:00:00Z");
const aberto = (n: number, aberto_ao_publico_em: string) =>
  repasseDeTeste({
    id: `a${n}000000-0000-4000-8000-00000000000${n}`,
    slug: `aberto-${n}-a${n}0000`,
    situacao: "publicado",
    lojistas_desde: "2026-09-20T12:00:00Z",
    aberto_ao_publico_em,
  });
const ABERTO_1 = aberto(1, "2026-09-24T12:00:00Z"); // o aberto mais recente
const ABERTO_2 = aberto(2, "2026-09-23T12:00:00Z");
const ABERTO_3 = aberto(3, "2026-09-22T12:00:00Z");
const ABERTO_4 = aberto(4, "2026-09-21T12:00:00Z");
// Mais recentes que qualquer aberto, de propósito: a home não pode pegá-los.
const LOJISTAS = repasseDeTeste({
  id: "b1000000-0000-4000-8000-000000000001",
  slug: "lojistas-b10000",
  situacao: "publicado",
  lojistas_desde: "2026-09-24T14:00:00Z",
  aberto_ao_publico_em: null,
});
const RESERVADO = repasseDeTeste({
  id: "c1000000-0000-4000-8000-000000000001",
  slug: "reservado-c10000",
  situacao: "reservado",
  lojistas_desde: "2026-09-20T12:00:00Z",
  aberto_ao_publico_em: "2026-09-24T13:00:00Z",
  reservado_em: "2026-09-24T14:30:00Z",
});
const VENDIDO = repasseDeTeste({
  id: "d1000000-0000-4000-8000-000000000001",
  slug: "vendido-d10000",
  situacao: "vendido",
  lojistas_desde: "2026-09-10T12:00:00Z",
  aberto_ao_publico_em: "2026-09-10T12:00:00Z",
  vendido_em: "2026-09-22T12:00:00Z",
});

beforeEach(() => {
  estado.repasses = [];
  estado.falha = null;
  estado.rotas = [];
  registrarFalha.mockClear();
});

describe("a faixa do /estoque", () => {
  it("sem carro nenhum, não há faixa", () => {
    expect(faixaNoEstoque([], AGORA)).toBeNull();
  });

  it("com lote mas nenhum aberto a todos, também não: só-lojistas, reservado e vendido não contam", () => {
    expect(faixaNoEstoque([LOJISTAS, RESERVADO, VENDIDO], AGORA)).toBeNull();
  });

  it("um aberto basta, e a contagem é só dos abertos", () => {
    expect(faixaNoEstoque([ABERTO_1], AGORA)).toEqual({ abertos: 1 });
    expect(faixaNoEstoque([LOJISTAS, ABERTO_1, RESERVADO, ABERTO_2, VENDIDO], AGORA)).toEqual({ abertos: 2 });
  });
});

describe("a faixa da home", () => {
  it("com dois abertos some, mesmo com o lote maior que três", () => {
    expect(faixaNaHome([LOJISTAS, RESERVADO, ABERTO_1, ABERTO_2], AGORA)).toBeNull();
  });

  it("com exatamente três abertos, sai", () => {
    expect(faixaNaHome([ABERTO_3, ABERTO_1, ABERTO_2], AGORA)?.carros).toHaveLength(CARROS_NA_FAIXA_DA_HOME);
  });

  it("os três abertos mais recentes, na ordem do lote, qualquer que seja a ordem de entrada", () => {
    const faixa = faixaNaHome([ABERTO_4, LOJISTAS, ABERTO_2, RESERVADO, ABERTO_1, ABERTO_3, VENDIDO], AGORA);
    expect(faixa?.carros.map((r) => r.slug)).toEqual([ABERTO_1.slug, ABERTO_2.slug, ABERTO_3.slug]);
  });

  it("o total do CTA é o lote inteiro, o mesmo número do herói do /repasse", () => {
    // Publicado (aberto ou só-lojistas) e reservado: 4 abertos + 1 + 1. O
    // vendido fica fora, como em `resumoDoLote`.
    const faixa = faixaNaHome([ABERTO_4, LOJISTAS, ABERTO_2, RESERVADO, ABERTO_1, ABERTO_3, VENDIDO], AGORA);
    expect(faixa?.totalNoLote).toBe(6);
  });
});

describe("a leitura das portas", () => {
  it("passa a rota adiante e devolve o que a leitura devolveu", async () => {
    estado.repasses = [ABERTO_1];
    expect(await lerRepassesDasPortas(AGORA, "/estoque")).toEqual([ABERTO_1]);
    expect(estado.rotas).toEqual(["/estoque"]);
    expect(registrarFalha).not.toHaveBeenCalled();
  });

  it("pane vira lista vazia, e a falha é registrada como quebra, com a rota", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const erro = new Error("Leitura dos repasses falhou: relation \"repasses\" does not exist");
    estado.falha = erro;

    await expect(lerRepassesDasPortas(AGORA, "/")).resolves.toEqual([]);
    expect(registrarFalha).toHaveBeenCalledTimes(1);
    expect(registrarFalha).toHaveBeenCalledWith("quebra", "repasse-leitura-das-portas", erro, {
      rota: "/",
      origem: "servidor",
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/portas-do-repasse.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/portasDoRepasse'`.

- [ ] **Step 3: Implementar**

`src/lib/portasDoRepasse.ts`:

```ts
/**
 * As portas do repasse fora do `/repasse` (spec 2026-09-24 §10): a faixa
 * escura depois da grade do `/estoque` e a faixa clara da home. Aqui mora a
 * REGRA — quando cada uma aparece e com que carros; o desenho mora em
 * `src/components/repasse/` e o texto em `paginaDoRepasse.ts`.
 *
 * As duas páginas são as mais visitadas do site e rodam com
 * `revalidate = 60`: a leitura do repasse nunca pode derrubá-las. Por isso
 * `lerRepassesDasPortas` troca a pane por lista vazia — a faixa some, a página
 * fica. É o oposto do `/repasse`, que deixa a pane subir porque lá "nenhum
 * repasse aberto" seria afirmar o que não se sabe; aqui, faixa ausente não
 * afirma nada (nem a spec desenha estado vazio para as portas).
 */
import { lerRepassesPublicos } from "./leituraDosRepasses";
import { resumoDoLote } from "./loteDoRepasse";
import { registrarFalha } from "./observabilidade";
import type { Repasse } from "./repasse";

/** A faixa do `/estoque` aparece com pelo menos este número de carros abertos a todos (spec §10). */
export const PISO_DA_FAIXA_NO_ESTOQUE = 1;

/** A faixa da home mostra exatamente este número de carros, e só aparece com ele (spec §10). */
export const CARROS_NA_FAIXA_DA_HOME = 3;

/** As duas páginas que leem o repasse para as portas — é o `rota` do registro de falha. */
export type RotaDasPortas = "/" | "/estoque";

export interface FaixaNoEstoque {
  /** Carros abertos a todos agora: o N de "Hoje são N carros abertos". */
  abertos: number;
}

export interface FaixaNaHome {
  /** Os três abertos a todos mais recentes, na ordem do lote. */
  carros: Repasse[];
  /**
   * O lote inteiro (publicado aberto, só-lojistas e reservado): o N de "VER OS
   * N CARROS", o mesmo do CTA do herói do `/repasse`, que o link abre.
   */
  totalNoLote: number;
}

/** `null` = sem faixa. Só-lojistas, reservado e vendido não contam: a faixa convida quem pode comprar hoje. */
export function faixaNoEstoque(visiveis: readonly Repasse[], agora: Date): FaixaNoEstoque | null {
  const { abertos } = resumoDoLote(visiveis, agora);
  return abertos.length >= PISO_DA_FAIXA_NO_ESTOQUE ? { abertos: abertos.length } : null;
}

/**
 * `null` = a área inteira some. O piso é sobre os ABERTOS, não sobre o lote:
 * com dois abertos e um só-lojistas a faixa mostraria um card que o público
 * não pode comprar.
 */
export function faixaNaHome(visiveis: readonly Repasse[], agora: Date): FaixaNaHome | null {
  const { lote, abertos } = resumoDoLote(visiveis, agora);
  if (abertos.length < CARROS_NA_FAIXA_DA_HOME) return null;
  return { carros: abertos.slice(0, CARROS_NA_FAIXA_DA_HOME), totalNoLote: lote.length };
}

/**
 * A leitura pública do repasse, com a pane trocada por lista vazia — o molde
 * do sitemap (`src/app/sitemap.ts`, "Falha ao ler os repasses").
 *
 * Registra como `quebra`, e não só no `console`: sem isso a faixa sumiria das
 * duas páginas mais vistas sem ninguém saber. A enxurrada não vem — com
 * `revalidate = 60` há no máximo uma regeneração por minuto por página, a
 * carência de 10 s agrupa pelo assunto e o disjuntor de 60 s cala a gravação
 * quando o próprio banco está fora (`observabilidade.ts`). A gravação é
 * esperada: tem teto de 2 s, nunca lança, e esperar garante que a linha saia
 * antes de a função congelar.
 */
export async function lerRepassesDasPortas(agora: Date, rota: RotaDasPortas): Promise<Repasse[]> {
  return lerRepassesPublicos(agora, rota).catch(async (erro: unknown): Promise<Repasse[]> => {
    console.error(`[Portas do repasse] Falha ao ler os repasses em ${rota}:`, (erro as Error).message);
    await registrarFalha("quebra", "repasse-leitura-das-portas", erro, { rota, origem: "servidor" });
    return [];
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/portas-do-repasse.test.ts tests/lote-do-repasse.test.ts tests/fronteira-servidor-cliente.test.ts`
Expected: PASS.

- [ ] **Step 5: Provar a trava com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. Em `faixaNoEstoque`, trocar `>=` por `>` → "um aberto basta" reprova.
2. Em `faixaNaHome`, trocar `abertos.length < CARROS_NA_FAIXA_DA_HOME` por `lote.length < CARROS_NA_FAIXA_DA_HOME` → "com dois abertos some, mesmo com o lote maior que três" reprova.
3. Em `faixaNaHome`, trocar `abertos.slice(` por `lote.slice(` → "os três abertos mais recentes" reprova (entram LOJISTAS e RESERVADO).
4. Em `lerRepassesDasPortas`, trocar o corpo por `return lerRepassesPublicos(agora, rota);` → "pane vira lista vazia" reprova (a promessa rejeita).
5. Trocar `"quebra"` por `"parada"` → o `toHaveBeenCalledWith` reprova.

- [ ] **Step 6: Commit**

```bash
git add src/lib/portasDoRepasse.ts tests/portas-do-repasse.test.ts
git commit -m "feat(repasse): a regra das faixas das portas e a leitura que troca a pane por lista vazia

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: O card e as duas faixas — Sonnet

**Files:**
- Create: `src/components/repasse/CardDaFaixa.tsx`
- Create: `src/components/repasse/FaixaDoRepasseNoEstoque.tsx`
- Create: `src/components/repasse/FaixaDoRepasseNaHome.tsx`
- Test: `tests/faixas-do-repasse.test.ts` (novo)
- Modify: `tests/repasse-sem-view-item.test.ts` (os dois pontos de chamada entram na varredura)

**Interfaces:**
- Consumes: `PORTAS_DO_REPASSE`, `abertosHoje`, `verOsCarros`, `abaixoDaFipeNaBarra`, `CAMINHO_DO_REPASSE` (`paginaDoRepasse.ts`, Task 1); `FaixaNoEstoque`, `FaixaNaHome` (`portasDoRepasse.ts`, Task 3, só `import type`); `contaDoRepasse`, `etiquetaDoRepasse`, `emReais`, `Repasse` (`src/lib/repasse.ts`); `nomeComAno` (`src/lib/nomeDoVeiculo.ts`); `ehFotoPropria` (`src/lib/fotosDoVeiculo.ts`); `Etiqueta`, `Seta`, `LinkRegua` (`src/components/modernist/primitivos.tsx`).
- Produces (usados pela Task 5), todos server components, sem `"use client"`:
  - `CardDaFaixa({ repasse }: { repasse: Repasse })` (default export)
  - `FaixaDoRepasseNoEstoque({ faixa }: { faixa: FaixaNoEstoque })` (default export)
  - `FaixaDoRepasseNaHome({ faixa }: { faixa: FaixaNaHome })` (default export)

- [ ] **Step 1: Escrever os testes que falham**

`tests/faixas-do-repasse.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CARD_DO_REPASSE,
  PORTAS_DO_REPASSE,
  abaixoDaFipeNaBarra,
  abertosHoje,
  verOsCarros,
} from "../src/lib/paginaDoRepasse";
import { emReais } from "../src/lib/repasse";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * As duas faixas das portas e o card simplificado (prancha "Portas de
 * entrada", seções 2 e 3; decisão 4 do plano do PR 4), renderizados. O HTML
 * NÃO é normalizado com `\s+`: o `emReais` usa espaço inseparável, que o `\s`
 * do JavaScript também casa.
 */
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _fill, sizes: _sizes, priority: _priority, unoptimized: _uo, ...resto } = props;
    return createElement("img", resto as never);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

const { default: FaixaDoRepasseNoEstoque } = await import("../src/components/repasse/FaixaDoRepasseNoEstoque");
const { default: FaixaDoRepasseNaHome } = await import("../src/components/repasse/FaixaDoRepasseNaHome");

const aberto = {
  situacao: "publicado" as const,
  lojistas_desde: "2026-09-20T12:00:00Z",
  aberto_ao_publico_em: "2026-09-24T12:00:00Z",
};
// O Kwid do ajudante: R$ 36.900 à vista, FIPE R$ 42.100, reparo de R$ 2.020 →
// R$ 3.180 abaixo da FIPE, o exemplo da prancha.
const COM_REPARO = repasseDeTeste({ ...aberto });
const COM_LAUDO = repasseDeTeste({
  ...aberto,
  id: "e1000000-0000-4000-8000-000000000001",
  slug: "fiat-argo-drive-1-0-2019-e10000",
  marca: "Fiat",
  modelo: "Argo",
  versao: "Drive 1.0",
  ano_modelo: 2019,
  preco: 52900,
  fipe_valor: 58400,
  itens_de_estado: [],
  sem_defeitos_conhecidos: true,
});
const SEM_LAUDO_SEM_FIPE = repasseDeTeste({
  ...aberto,
  id: "e2000000-0000-4000-8000-000000000002",
  slug: "toyota-corolla-xei-2012-e20000",
  marca: "Toyota",
  modelo: "Corolla",
  versao: "XEi 2.0",
  ano_modelo: 2012,
  preco: 44900,
  fipe_valor: null,
  laudo: "nao_feito",
  itens_de_estado: [],
  sem_defeitos_conhecidos: true,
});
const ACIMA_DA_FIPE = repasseDeTeste({
  ...aberto,
  id: "e3000000-0000-4000-8000-000000000003",
  slug: "vw-gol-1-0-2015-e30000",
  marca: "VW",
  modelo: "Gol",
  versao: "1.0",
  ano_modelo: 2015,
  preco: 50000,
  fipe_valor: 42100,
  itens_de_estado: [],
  sem_defeitos_conhecidos: true,
});

const html = (elemento: ReactElement) => renderToStaticMarkup(elemento);
/** O HTML de cada card, na ordem: cada um mora num `<li>`. */
const cards = (h: string) => h.split("<li").slice(1);

describe("a faixa do /estoque", () => {
  it("o texto da prancha, com a contagem dos abertos", () => {
    const h = html(createElement(FaixaDoRepasseNoEstoque, { faixa: { abertos: 4 } }));
    expect(h).toContain(PORTAS_DO_REPASSE.rotulo);
    expect(h).toContain(PORTAS_DO_REPASSE.estoque.titulo);
    expect(h).toContain(`${PORTAS_DO_REPASSE.estoque.texto} ${abertosHoje(4)}`);
  });

  it("o botão leva ao /repasse, e o singular aparece com um carro", () => {
    const h = html(createElement(FaixaDoRepasseNoEstoque, { faixa: { abertos: 1 } }));
    expect(h).toMatch(new RegExp(`<a[^>]*href="/repasse"[^>]*>${PORTAS_DO_REPASSE.estoque.botao}<svg`));
    expect(h).toContain(abertosHoje(1));
  });
});

describe("a faixa da home", () => {
  const faixa = { carros: [COM_REPARO, COM_LAUDO, SEM_LAUDO_SEM_FIPE], totalNoLote: 6 };

  it("o texto da prancha e o CTA com o lote inteiro", () => {
    const h = html(createElement(FaixaDoRepasseNaHome, { faixa }));
    expect(h).toContain(PORTAS_DO_REPASSE.rotulo);
    expect(h).toContain(PORTAS_DO_REPASSE.home.titulo);
    expect(h).toContain(PORTAS_DO_REPASSE.home.texto);
    expect(h).toMatch(new RegExp(`<a[^>]*href="/repasse"[^>]*>${verOsCarros(6)}<`));
  });

  it("três cards, na ordem recebida, cada um um link para a ficha", () => {
    const lista = cards(html(createElement(FaixaDoRepasseNaHome, { faixa })));
    expect(lista).toHaveLength(3);
    faixa.carros.forEach((r, i) => expect(lista[i]).toContain(`href="/repasse/${r.slug}"`));
  });

  it("o card da prancha: etiqueta, carro e ano, preço e quanto fica abaixo da FIPE", () => {
    const [reparo, laudo, semLaudo] = cards(html(createElement(FaixaDoRepasseNaHome, { faixa })));
    expect(reparo).toContain("REPARO ORÇADO");
    expect(reparo).toContain(">Renault Kwid 2021<");
    expect(reparo).toContain(emReais(36900));
    expect(reparo).toContain(abaixoDaFipeNaBarra(emReais(3180)));
    expect(laudo).toContain("COM LAUDO");
    expect(laudo).toContain(">Fiat Argo 2019<");
    expect(laudo).toContain(abaixoDaFipeNaBarra(emReais(5500)));
    expect(semLaudo).toContain("SEM LAUDO");
  });

  it("o título não leva a versão, como a prancha", () => {
    const [reparo, laudo] = cards(html(createElement(FaixaDoRepasseNaHome, { faixa })));
    expect(reparo).not.toContain("Zen 1.0");
    expect(laudo).not.toContain("Drive 1.0");
  });

  it("sem FIPE, ou acima dela, a linha da diferença some", () => {
    const [semFipe, acima] = cards(
      html(
        createElement(FaixaDoRepasseNaHome, {
          faixa: { carros: [SEM_LAUDO_SEM_FIPE, ACIMA_DA_FIPE, COM_REPARO], totalNoLote: 3 },
        }),
      ),
    );
    expect(semFipe).not.toContain("abaixo da FIPE");
    expect(acima).not.toContain("abaixo da FIPE");
  });

  it("sem WhatsApp e sem a conta inteira: isso fica no card do lote e na ficha", () => {
    const h = html(createElement(FaixaDoRepasseNaHome, { faixa }));
    expect(h).not.toContain("wa.me");
    expect(h).not.toContain(CARD_DO_REPASSE.quero);
    expect(h).not.toContain(CARD_DO_REPASSE.verFicha);
  });
});
```

Em `tests/repasse-sem-view-item.test.ts`:

1. Trocar
   ```ts
   const arquivos = RAIZ_DO_REPASSE.flatMap((raiz) => arquivosDoRepasse(raiz));
   ```
   por
   ```ts
   /**
    * As portas do PR 4. A home e o `/estoque` não desenham repasse por conta
    * própria: entregam o dado às faixas de `src/components/repasse/`, que a
    * varredura acima já cobre. Mas é no ponto de chamada que alguém copiaria o
    * `trackVehicleView` "para medir a faixa" (handoff do PR 4, §8), então os
    * dois arquivos entram um a um. Se a home um dia medir `view_item_list` do
    * ESTOQUE, o termo `view_item` daqui vai acusar: reveja esta lista junto, não
    * a apague.
    */
   const PONTOS_DE_CHAMADA = [
     join(__dirname, "..", "src", "app", "page.tsx"),
     join(__dirname, "..", "src", "app", "estoque", "page.tsx"),
   ];

   const arquivos = [...RAIZ_DO_REPASSE.flatMap((raiz) => arquivosDoRepasse(raiz)), ...PONTOS_DE_CHAMADA];
   ```
2. No `it("a varredura achou os arquivos de verdade — não um diretório vazio", …)`, depois de `expect(arquivos.length).toBeGreaterThanOrEqual(5);`, acrescentar:
   ```ts
       // O card e as faixas das portas moram no diretório varrido (decisão 4).
       for (const nome of ["CardDaFaixa.tsx", "FaixaDoRepasseNoEstoque.tsx", "FaixaDoRepasseNaHome.tsx"]) {
         expect(arquivos.some((a) => a.endsWith(nome)), nome).toBe(true);
       }
   ```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/faixas-do-repasse.test.ts tests/repasse-sem-view-item.test.ts`
Expected: FAIL — os três componentes não existem.

- [ ] **Step 3: O card**

`src/components/repasse/CardDaFaixa.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { ehFotoPropria } from "../../lib/fotosDoVeiculo";
import { nomeComAno } from "../../lib/nomeDoVeiculo";
import { CAMINHO_DO_REPASSE, abaixoDaFipeNaBarra } from "../../lib/paginaDoRepasse";
import { contaDoRepasse, emReais, etiquetaDoRepasse, type Repasse } from "../../lib/repasse";
import { Etiqueta } from "../modernist/primitivos";

/**
 * O card simplificado das portas (prancha "Portas de entrada", seção 3):
 * foto, etiqueta, carro e ano, preço à vista e "R$ X abaixo da FIPE". Sem a
 * conta inteira e sem WhatsApp, que ficam no card do lote e na ficha (decisão
 * 4 do plano do PR 4). O card inteiro é um link para a ficha.
 *
 * Só recebe carro aberto a todos: quem escolhe é `faixaNaHome`.
 */
export default function CardDaFaixa({ repasse: r }: { repasse: Repasse }) {
  const foto = r.web_full_images[0] ?? r.whatsapp_images[0];
  const etiqueta = etiquetaDoRepasse(r);
  const { abaixoDaFipe } = contaDoRepasse(r);
  // A mesma guarda da conta e da barra da ficha: sem FIPE, ou acima dela, a
  // linha some. Diferença negativa "abaixo da FIPE" seria rótulo que mente.
  const abaixo = abaixoDaFipe !== null && abaixoDaFipe > 0 ? abaixoDaFipe : null;
  // Marca, modelo e ano, sem a versão: "Fiat Argo 2019", como a prancha.
  const nome = nomeComAno({ marca: r.marca, modelo: r.modelo, versao: null, ano: r.ano_modelo });

  return (
    <Link href={`${CAMINHO_DO_REPASSE}/${r.slug}`} className="mt-foco flex h-full flex-col bg-mt-bg text-mt-ink no-underline">
      <span className="relative block aspect-[4/3] bg-mt-neutral-300">
        {foto ? (
          // `alt=""`: o nome do carro já é o texto do link, logo abaixo, e
          // repeti-lo faria o leitor de tela dizê-lo duas vezes.
          <Image
            src={foto}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 20vw"
            unoptimized={ehFotoPropria(foto)}
            className="object-cover"
          />
        ) : null}
        <Etiqueta accent={etiqueta === "COM LAUDO"} className="pointer-events-none absolute left-0 top-0 text-[9px]">
          {etiqueta}
        </Etiqueta>
      </span>
      <span className="block p-3">
        <span className="block text-[15px] font-extrabold leading-tight tracking-[-.01em]">{nome}</span>
        <span className="mt-1 block text-[14px] font-extrabold">{emReais(r.preco)}</span>
        {abaixo !== null && (
          <span className="mt-0.5 block text-[11px] font-semibold text-mt-accent-800">
            {abaixoDaFipeNaBarra(emReais(abaixo))}
          </span>
        )}
      </span>
    </Link>
  );
}
```

- [ ] **Step 4: A faixa do `/estoque`**

`src/components/repasse/FaixaDoRepasseNoEstoque.tsx`:

```tsx
import Link from "next/link";
import { CAMINHO_DO_REPASSE, PORTAS_DO_REPASSE, abertosHoje } from "../../lib/paginaDoRepasse";
import type { FaixaNoEstoque } from "../../lib/portasDoRepasse";
import { Seta } from "../modernist/primitivos";

/**
 * A faixa escura do `/estoque`, depois da grade (spec 2026-09-24 §10;
 * prancha "Portas de entrada", seção 2). Quem decide se ela aparece é
 * `faixaNoEstoque`: sem carro aberto a todos, a página nem a monta.
 */
export default function FaixaDoRepasseNoEstoque({ faixa }: { faixa: FaixaNoEstoque }) {
  return (
    <section
      aria-labelledby="faixa-do-repasse-no-estoque"
      className="bg-mt-inverso-fundo px-[18px] py-10 text-mt-inverso lg:px-10 lg:py-12"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
        <div className="max-w-[640px]">
          <p className="m-0 text-[11px] font-extrabold tracking-[.14em] text-mt-accent-400">{PORTAS_DO_REPASSE.rotulo}</p>
          <h2 id="faixa-do-repasse-no-estoque" className="mt-titulo m-0 mt-3 text-[28px] lg:text-[36px]">
            {PORTAS_DO_REPASSE.estoque.titulo}
          </h2>
          <p className="m-0 mt-3 text-[14px] leading-relaxed text-mt-inverso-suave lg:text-[15px]">
            {`${PORTAS_DO_REPASSE.estoque.texto} ${abertosHoje(faixa.abertos)}`}
          </p>
        </div>
        <Link href={CAMINHO_DO_REPASSE} className="mt-btn mt-btn-primario mt-foco shrink-0 self-start lg:self-center">
          {PORTAS_DO_REPASSE.estoque.botao}
          <Seta />
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: A faixa da home**

`src/components/repasse/FaixaDoRepasseNaHome.tsx`:

```tsx
import { CAMINHO_DO_REPASSE, PORTAS_DO_REPASSE, verOsCarros } from "../../lib/paginaDoRepasse";
import type { FaixaNaHome } from "../../lib/portasDoRepasse";
import { LinkRegua } from "../modernist/primitivos";
import CardDaFaixa from "./CardDaFaixa";

/**
 * A faixa clara da home (spec 2026-09-24 §10; prancha "Portas de entrada",
 * seção 3): texto à esquerda, os três carros à direita. Quem escolhe os
 * carros, e decide se a faixa existe, é `faixaNaHome`. O CTA conta o lote
 * inteiro, o mesmo número do herói do `/repasse` (decisão 13 do plano do PR 4).
 */
export default function FaixaDoRepasseNaHome({ faixa }: { faixa: FaixaNaHome }) {
  return (
    <section aria-labelledby="faixa-do-repasse-na-home" className="mt-12 bg-mt-surface px-[18px] py-12 lg:mt-16 lg:px-10 lg:py-16">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-12">
        <div>
          <p className="m-0 text-[11px] font-extrabold tracking-[.14em] text-mt-neutral-600">{PORTAS_DO_REPASSE.rotulo}</p>
          <h2 id="faixa-do-repasse-na-home" className="mt-titulo m-0 mt-3 text-[28px] lg:text-[34px]">
            {PORTAS_DO_REPASSE.home.titulo}
          </h2>
          <p className="m-0 mt-3 max-w-[420px] text-[14px] leading-relaxed text-mt-neutral-800">{PORTAS_DO_REPASSE.home.texto}</p>
          <div className="mt-6">
            <LinkRegua href={CAMINHO_DO_REPASSE}>{verOsCarros(faixa.totalNoLote)}</LinkRegua>
          </div>
        </div>
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-3">
          {faixa.carros.map((r) => (
            <li key={r.id}>
              <CardDaFaixa repasse={r} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Rodar e ver passar, com as varreduras do diretório**

Run: `npx vitest run tests/faixas-do-repasse.test.ts tests/repasse-sem-view-item.test.ts tests/ancoras-do-repasse.test.ts tests/pre-voo-das-conversoes.test.ts`
Expected: PASS. (`ancoras-do-repasse` varre os três arquivos novos: os `Link` apontam para `/repasse` e `/repasse/<slug>`, sem hash.)

- [ ] **Step 7: Provar as travas com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. Em `CardDaFaixa`, trocar a guarda por `const abaixo = abaixoDaFipe;` → "sem FIPE, ou acima dela, a linha da diferença some" reprova (o Gol, R$ 7.900 acima da FIPE, ganha a linha "… abaixo da FIPE" com valor negativo).
2. Em `CardDaFaixa`, trocar `versao: null` por `versao: r.versao` → "o título não leva a versão" reprova.
3. Em `FaixaDoRepasseNaHome`, trocar `faixa.carros.map(` por `faixa.carros.slice(0, 2).map(` → "três cards" reprova.
4. Em `FaixaDoRepasseNaHome`, trocar `verOsCarros(faixa.totalNoLote)` por `verOsCarros(faixa.carros.length)` → "o CTA com o lote inteiro" reprova (sai "VER OS 3 CARROS").
5. Em `src/app/page.tsx`, acrescentar `import { trackVehicleView } from "../lib/telemetry";` → `repasse-sem-view-item` reprova no arquivo da home (ponto de chamada).
6. Em `CardDaFaixa.tsx`, acrescentar a linha `// content_ids` → `repasse-sem-view-item` reprova no card (prova que o diretório novo é varrido).

- [ ] **Step 8: Commit**

```bash
git add src/components/repasse/CardDaFaixa.tsx src/components/repasse/FaixaDoRepasseNoEstoque.tsx src/components/repasse/FaixaDoRepasseNaHome.tsx tests/faixas-do-repasse.test.ts tests/repasse-sem-view-item.test.ts
git commit -m "feat(repasse): o card simplificado e as faixas do /estoque e da home, da prancha Portas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: As faixas no ar — `/estoque` e home — Opus

**Files:**
- Modify: `src/app/estoque/page.tsx` (imports, leitura em paralelo, a faixa entre `</Suspense>` e o índice)
- Modify: `src/lib/areasDoSite.ts` (área `repasse` depois de `faixas_de_preco`)
- Modify: `src/app/page.tsx` (imports, leitura em paralelo, bloco `repasse`)
- Test: `tests/faixa-do-repasse-no-estoque.test.ts` (novo)
- Test: `tests/faixa-do-repasse-na-home.test.ts` (novo)
- Test: `tests/areas-do-site.test.ts` (um `it` a mais)

**Interfaces:**
- Consumes: `lerRepassesDasPortas(agora, rota)`, `faixaNoEstoque(visiveis, agora)`, `faixaNaHome(visiveis, agora)` (Task 3); `FaixaDoRepasseNoEstoque`, `FaixaDoRepasseNaHome` (Task 4).
- Produces: `/estoque` com a faixa como filha direta da página, entre o `<Suspense>` da grade e o `<nav aria-label="Índice do estoque">`; área `repasse` (`tipo: "DINÂMICO"`, `editarEm: "/admin/repasse"`) no catálogo da home, e o bloco `repasse` em `page.tsx`. Nenhuma das duas páginas chama `lerRepassesPublicos` direto.

- [ ] **Step 1: Escrever os testes que falham**

`tests/faixa-do-repasse-no-estoque.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Children, Suspense, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings, Veiculo } from "../src/types";
import { PORTAS_DO_REPASSE, abertosHoje } from "../src/lib/paginaDoRepasse";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * A faixa do repasse na `/estoque`, renderizada (spec 2026-09-24 §10;
 * decisões 2 e 6 do plano do PR 4): depois da grade e fora do `<Suspense>`,
 * só com carro aberto a todos, e uma pane na leitura do repasse não derruba a
 * segunda página mais visitada do site. Mocks no molde de
 * `paginas-de-entidade.test.ts`.
 */
const EMPRESA: CompanySettings = {
  name: "Motors Store",
  phone: "41 99737-2165",
  whatsapp: "41 99737-2165",
  whatsappRaw: "5541997372165",
  address: "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350",
  hours: "Seg a sex 8h30-18h30",
  instagram: "https://instagram.com/motorsstore.oficial",
  facebook: "https://facebook.com/motorsstore.oficial",
  cnpj: "",
};

const VEICULO = {
  id: "1",
  marca: "Fiat",
  modelo: "Argo",
  versao: "Drive 1.0",
  ano: 2022,
  preco_original: 70000,
  preco_promocional: 0,
  quilometragem: 30000,
  tipo: "Hatch",
  cor: "Prata",
  cambio: "Manual",
  combustivel: "Flex",
  motor: "1.0",
  vendido: false,
  estado_cadastro: "publicado",
  web_full_images: ["https://x/1.webp"],
  whatsapp_images: ["https://x/1-zap.jpg"],
} as unknown as Veiculo;

const estado = vi.hoisted(() => ({ repasses: [] as unknown[], falha: null as Error | null }));
const registrarFalha = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => {}));

vi.mock("../src/lib/settings", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  getCachedSettings: async () => ({ companySettings: EMPRESA }),
}));
vi.mock("../src/lib/supabase", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  getEstoque: async () => [VEICULO],
}));
vi.mock("../src/lib/telemetry", () => ({ trackContactClick: () => {} }));
vi.mock("../src/app/ThemeContext", () => ({ useTheme: () => ({ companySettings: EMPRESA }) }));
vi.mock("../src/lib/leituraDosRepasses", () => ({
  lerRepassesPublicos: async () => {
    if (estado.falha) throw estado.falha;
    return estado.repasses;
  },
}));
vi.mock("../src/lib/observabilidade", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  registrarFalha,
}));

const { default: EstoquePage } = await import("../src/app/estoque/page");
const { default: FaixaDoRepasseNoEstoque } = await import("../src/components/repasse/FaixaDoRepasseNoEstoque");

const publicado = { situacao: "publicado" as const, lojistas_desde: "2026-09-20T12:00:00Z" };
const ABERTO_1 = repasseDeTeste({ ...publicado, id: "a1000000-0000-4000-8000-000000000001", slug: "aberto-1-a10000", aberto_ao_publico_em: "2026-09-24T12:00:00Z" });
const ABERTO_2 = repasseDeTeste({ ...publicado, id: "a2000000-0000-4000-8000-000000000002", slug: "aberto-2-a20000", aberto_ao_publico_em: "2026-09-23T12:00:00Z" });
const LOJISTAS = repasseDeTeste({ ...publicado, id: "b1000000-0000-4000-8000-000000000001", slug: "lojistas-b10000", aberto_ao_publico_em: null });
const RESERVADO = repasseDeTeste({ situacao: "reservado", id: "c1000000-0000-4000-8000-000000000001", slug: "reservado-c10000", lojistas_desde: "2026-09-20T12:00:00Z", aberto_ao_publico_em: "2026-09-21T12:00:00Z", reservado_em: "2026-09-23T12:00:00Z" });

beforeEach(() => {
  estado.repasses = [];
  estado.falha = null;
  registrarFalha.mockClear();
});

const servida = async () => renderToStaticMarkup(await EstoquePage());

describe("a faixa do repasse na /estoque", () => {
  it("com carro aberto, sai com o texto da prancha e a contagem só dos abertos", async () => {
    estado.repasses = [ABERTO_1, ABERTO_2, LOJISTAS, RESERVADO];
    const h = await servida();
    expect(h).toContain(PORTAS_DO_REPASSE.estoque.titulo);
    expect(h).toContain(abertosHoje(2));
  });

  it("depois da grade, fora do <Suspense> e antes do índice do estoque", async () => {
    estado.repasses = [ABERTO_1];
    const pagina = (await EstoquePage()) as ReactElement<{ children: ReactNode }>;
    const tipos = Children.toArray(pagina.props.children).map((filho) => (filho as ReactElement).type);

    const grade = tipos.indexOf(Suspense);
    const faixa = tipos.indexOf(FaixaDoRepasseNoEstoque);
    const indice = tipos.indexOf("nav");
    expect(grade, "a grade (o <Suspense>) é filha direta da página").toBeGreaterThan(-1);
    expect(faixa, "a faixa é filha direta da página, depois do <Suspense>").toBeGreaterThan(grade);
    expect(indice, "o índice do estoque vem depois da faixa").toBeGreaterThan(faixa);
  });

  it("sem carro aberto a todos, nenhum pedaço da faixa", async () => {
    estado.repasses = [LOJISTAS, RESERVADO];
    const h = await servida();
    expect(h).not.toContain(PORTAS_DO_REPASSE.estoque.titulo);
    expect(h).not.toContain(PORTAS_DO_REPASSE.rotulo);
    expect(h).not.toContain('href="/repasse"');
  });

  it("pane na leitura do repasse: a página inteira fica, a faixa some e a falha é registrada", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    estado.falha = new Error("Leitura dos repasses falhou: banco fora");
    const h = await servida();

    expect(h).toContain("Carros seminovos em Curitiba</h1>");
    expect(h).toContain('aria-label="Índice do estoque"');
    expect(h).not.toContain(PORTAS_DO_REPASSE.estoque.titulo);
    expect(registrarFalha).toHaveBeenCalledWith("quebra", "repasse-leitura-das-portas", estado.falha, {
      rota: "/estoque",
      origem: "servidor",
    });
  });
});
```

`tests/faixa-do-repasse-na-home.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Fragment, type ReactElement } from "react";
import type { Veiculo } from "../src/types";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * A faixa do repasse na home (spec 2026-09-24 §10; decisões 3 e 6 do plano do
 * PR 4), pelo ponto de chamada e não pela função: a home monta a faixa com os
 * três abertos mais recentes, some com menos de três, sobrevive a uma pane na
 * leitura, e a área nova aparece com a ordem salva em produção sem ninguém
 * mexer no painel. Árvore percorrida como em `destaques-da-semana-na-home`
 * (a home inteira não é renderizada: ela puxa reputação e Instagram).
 */
const estado = vi.hoisted(() => ({
  repasses: [] as unknown[],
  falha: null as Error | null,
  areasHome: null as unknown,
}));
const registrarFalha = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => {}));

const carro = (id: string): Veiculo =>
  ({ id, marca: "Marca", modelo: "Modelo", versao: "V", vendido: false }) as unknown as Veiculo;
const ESTOQUE = Array.from({ length: 12 }, (_, i) => carro(`c${i + 1}`));

vi.mock("../src/lib/supabase", async (original) => ({
  ...(await original<typeof import("../src/lib/supabase")>()),
  getEstoque: async () => ESTOQUE,
}));
vi.mock("../src/lib/avaliacoesGoogle", () => ({ getReputacaoGoogle: async () => null }));
vi.mock("../src/lib/settings", async (original) => ({
  ...(await original<typeof import("../src/lib/settings")>()),
  getCachedSettings: async () => ({
    companySettings: null,
    aboutSettings: null,
    webhooks: null,
    popups: null,
    quickTags: null,
    stockOverrides: null,
    carouselVehicleIds: null,
    bankBalances: null,
    procedencia: null,
    instagramCuradoria: null,
    areasHome: estado.areasHome,
    ga4: null,
    destaquesDaSemana: null,
  }),
}));
vi.mock("../src/lib/leituraDosRepasses", () => ({
  lerRepassesPublicos: async () => {
    if (estado.falha) throw estado.falha;
    return estado.repasses;
  },
}));
vi.mock("../src/lib/observabilidade", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  registrarFalha,
}));

const { default: Home } = await import("../src/app/page");
const { default: FaixaDoRepasseNaHome } = await import("../src/components/repasse/FaixaDoRepasseNaHome");

/** Todo elemento da árvore, em ordem, descendo por `props` inteiro (elemento passado como prop não é filho). */
function elementos(no: unknown, achados: ReactElement<Record<string, unknown>>[] = []) {
  if (Array.isArray(no)) {
    no.forEach((n) => elementos(n, achados));
    return achados;
  }
  if (!no || typeof no !== "object") return achados;
  const elemento = no as ReactElement<Record<string, unknown>>;
  if (!elemento.props) return achados;
  achados.push(elemento);
  Object.values(elemento.props).forEach((valor) => elementos(valor, achados));
  return achados;
}

const faixas = async () => elementos(await Home()).filter((e) => e.type === FaixaDoRepasseNaHome);
/** Os ids das áreas na ordem em que a home as monta: cada uma é um `<Fragment key={id}>`. */
const ordemDasAreas = async () =>
  elementos(await Home())
    .filter((e) => e.type === Fragment && e.key !== null)
    .map((e) => e.key);

const publicado = { situacao: "publicado" as const, lojistas_desde: "2026-09-20T12:00:00Z" };
const aberto = (n: number, dia: string) =>
  repasseDeTeste({ ...publicado, id: `a${n}000000-0000-4000-8000-00000000000${n}`, slug: `aberto-${n}-a${n}0000`, aberto_ao_publico_em: dia });
const ABERTO_1 = aberto(1, "2026-09-24T12:00:00Z");
const ABERTO_2 = aberto(2, "2026-09-23T12:00:00Z");
const ABERTO_3 = aberto(3, "2026-09-22T12:00:00Z");
const ABERTO_4 = aberto(4, "2026-09-21T12:00:00Z");
const LOJISTAS = repasseDeTeste({ ...publicado, id: "b1000000-0000-4000-8000-000000000001", slug: "lojistas-b10000", lojistas_desde: "2026-09-24T14:00:00Z", aberto_ao_publico_em: null });

/** A ordem salva em produção, lida de `site_settings.areas_home` em 05/09 (a mesma de `areas-do-site.test.ts`). */
const ORDEM_DE_PRODUCAO = [
  "hero",
  "busca",
  "destaques_rapidos",
  "estoque_selecionado",
  "consultoria",
  "venda_troca",
  "reputacao",
  "instagram",
  "contato",
];

beforeEach(() => {
  estado.repasses = [];
  estado.falha = null;
  estado.areasHome = null;
  registrarFalha.mockClear();
});

describe("a faixa do repasse na home", () => {
  it("com três ou mais abertos, sai com os três mais recentes e o lote inteiro no CTA", async () => {
    estado.repasses = [ABERTO_4, LOJISTAS, ABERTO_2, ABERTO_1, ABERTO_3];
    const achadas = await faixas();
    expect(achadas).toHaveLength(1);

    const { faixa } = achadas[0].props as { faixa: { carros: { slug: string }[]; totalNoLote: number } };
    expect(faixa.carros.map((r) => r.slug)).toEqual([ABERTO_1.slug, ABERTO_2.slug, ABERTO_3.slug]);
    expect(faixa.totalNoLote).toBe(5);
  });

  it("com dois abertos, a área some inteira", async () => {
    estado.repasses = [ABERTO_1, ABERTO_2, LOJISTAS];
    expect(await faixas()).toHaveLength(0);
  });

  it("pane na leitura do repasse: a home continua e a falha é registrada", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    estado.falha = new Error("Leitura dos repasses falhou: banco fora");

    expect(await faixas()).toHaveLength(0);
    expect(registrarFalha).toHaveBeenCalledWith("quebra", "repasse-leitura-das-portas", estado.falha, {
      rota: "/",
      origem: "servidor",
    });
  });

  it("com a ordem salva em produção, a área entra sozinha, logo depois das faixas de preço", async () => {
    // Nenhum passo no painel: `normalizarAreas` põe o id novo ao lado da
    // vizinha que o precede no catálogo (decisão 3 do plano do PR 4).
    estado.areasHome = { ordem: ORDEM_DE_PRODUCAO, ocultas: [] };
    estado.repasses = [ABERTO_1, ABERTO_2, ABERTO_3];

    const ordem = await ordemDasAreas();
    expect(ordem).toContain("faixas_de_preco");
    expect(ordem.indexOf("repasse")).toBe(ordem.indexOf("faixas_de_preco") + 1);
    expect(ordem.indexOf("repasse")).toBeLessThan(ordem.indexOf("contato"));
    expect(await faixas()).toHaveLength(1);
  });
});
```

Em `tests/areas-do-site.test.ts`, dentro do `describe("seção nova entra na vizinhança do catálogo, não no fim", …)`, depois do `it("entra logo depois da vizinha que a precede no catálogo", …)`, acrescentar:

```ts

  it("a faixa do repasse entra logo depois das faixas de preço, sem passo no painel", () => {
    // PR 4 do repasse (spec 2026-09-24 §10). A ordem salva não conhece
    // `repasse` nem `faixas_de_preco`; as duas entram na vizinhança do catálogo.
    const { ordem } = normalizarAreas({ ordem: ORDEM_DE_PRODUCAO, ocultas: [] });

    expect(ordem.indexOf("repasse"), "a faixa do repasse não entrou na ordem").toBeGreaterThanOrEqual(0);
    expect(ordem[ordem.indexOf("faixas_de_preco") + 1]).toBe("repasse");
    expect(ordem.indexOf("repasse")).toBeLessThan(ordem.indexOf("contato"));
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/faixa-do-repasse-no-estoque.test.ts tests/faixa-do-repasse-na-home.test.ts tests/areas-do-site.test.ts`
Expected: FAIL — as páginas não leem o repasse; a área `repasse` não existe.

- [ ] **Step 3: `/estoque`**

Em `src/app/estoque/page.tsx`:

1. Depois de `import FaixasDePreco from "../../components/modernist/FaixasDePreco";`, acrescentar:
   ```ts
   import FaixaDoRepasseNoEstoque from "../../components/repasse/FaixaDoRepasseNoEstoque";
   import { faixaNoEstoque, lerRepassesDasPortas } from "../../lib/portasDoRepasse";
   ```
2. Trocar
   ```ts
   export default async function EstoquePage() {
     const [{ historico, disponiveis }, settings] = await Promise.all([
       recortesDoEstoque(),
       getCachedSettings(),
     ]);
   ```
   por
   ```ts
   export default async function EstoquePage() {
     const agora = new Date();
     const [{ historico, disponiveis }, settings, repasses] = await Promise.all([
       recortesDoEstoque(),
       getCachedSettings(),
       // A faixa do repasse (spec 2026-09-24 §10). Pane aqui não derruba a
       // página: `lerRepassesDasPortas` devolve lista vazia, registra a falha e
       // a faixa some. Nunca `lerRepassesPublicos` direto.
       lerRepassesDasPortas(agora, "/estoque"),
     ]);
     const faixaDoRepasse = faixaNoEstoque(repasses, agora);
   ```
3. Trocar (as duas linhas têm seis espaços de recuo no arquivo)
   ```tsx
         </Suspense>

         {/* Índice do estoque — link interno de verdade, no HTML servido.
   ```
   por
   ```tsx
         </Suspense>

         {/* A faixa do repasse, "depois da grade" (spec 2026-09-24 §10). Fora do
             <Suspense>, e filha direta da página: sai no HTML servido e não
             depende do `Catalogo`. Sem carro aberto a todos, nada — a spec
             proíbe promessa vazia. A trava é
             `tests/faixa-do-repasse-no-estoque.test.ts`. */}
         {faixaDoRepasse && <FaixaDoRepasseNoEstoque faixa={faixaDoRepasse} />}

         {/* Índice do estoque — link interno de verdade, no HTML servido.
   ```

- [ ] **Step 4: O catálogo de áreas da home**

Em `src/lib/areasDoSite.ts`, trocar

```ts
  {
    id: "faixas_de_preco",
    nome: "Por faixa de preço",
    descricao: "Três links para os hubs de faixa, com a contagem de cada um.",
    tipo: "ESTOQUE",
    editarEm: null,
  },
```

por

```ts
  {
    id: "faixas_de_preco",
    nome: "Por faixa de preço",
    descricao: "Três links para os hubs de faixa, com a contagem de cada um.",
    tipo: "ESTOQUE",
    editarEm: null,
  },
  // A faixa do repasse entrou em 2026-09-25 (spec 2026-09-24 §10, PR 4). Com
  // a ordem salva em produção, `normalizarAreas` a põe logo depois de
  // `faixas_de_preco`, a vizinha que a precede aqui, sem passo no painel. O
  // lugar definitivo é do dono, na tela A3. Some sozinha com menos de três
  // carros abertos a todos (`lib/portasDoRepasse.ts`).
  {
    id: "repasse",
    nome: "Repasse Motors",
    descricao: "Três carros de repasse abertos a todos; some com menos de três.",
    tipo: "DINÂMICO",
    editarEm: "/admin/repasse",
  },
```

- [ ] **Step 5: A home**

Em `src/app/page.tsx`:

1. Depois de `import FaixasDePreco from "../components/modernist/FaixasDePreco";`, acrescentar:
   ```ts
   import FaixaDoRepasseNaHome from "../components/repasse/FaixaDoRepasseNaHome";
   import { faixaNaHome, lerRepassesDasPortas } from "../lib/portasDoRepasse";
   ```
2. Trocar
   ```ts
   export default async function Home() {
     const [estoque, settings, reputacao] = await Promise.all([
       getEstoque(),
       getCachedSettings(),
       // Em paralelo com o estoque: são queries independentes, e encadeá-las
       // somaria a latência das duas ao TTFB da home.
       getReputacaoGoogle(),
     ]);
   ```
   por
   ```ts
   export default async function Home() {
     const agora = new Date();
     const [estoque, settings, reputacao, repasses] = await Promise.all([
       getEstoque(),
       getCachedSettings(),
       // Em paralelo com o estoque: são queries independentes, e encadeá-las
       // somaria a latência das duas ao TTFB da home.
       getReputacaoGoogle(),
       // A faixa do repasse (spec 2026-09-24 §10), com o mesmo cuidado: pane
       // aqui vira lista vazia e a área some. Nunca `lerRepassesPublicos` direto.
       lerRepassesDasPortas(agora, "/"),
     ]);
     const faixaDoRepasse = faixaNaHome(repasses, agora);
   ```
3. Em `blocos`, trocar o fim do bloco das faixas de preço
   ```tsx
           cabecalho={<CabecalhoSecao titulo="Escolha pelo orçamento" />}
         />
       ),

       /* ─── 02 Consultoria ─── */
   ```
   por
   ```tsx
           cabecalho={<CabecalhoSecao titulo="Escolha pelo orçamento" />}
         />
       ),

       /* ─── Repasse Motors ───
          A faixa clara do repasse (spec 2026-09-24 §10): os três carros abertos
          a todos mais recentes, e só com três ou mais. Com menos, a área
          inteira some, sem cabeçalho nem promessa vazia — a mesma regra da
          reputação e do Instagram, logo abaixo. Quem decide é
          `lib/portasDoRepasse.ts`. */
       repasse: faixaDoRepasse && <FaixaDoRepasseNaHome faixa={faixaDoRepasse} />,

       /* ─── 02 Consultoria ─── */
   ```

- [ ] **Step 6: Rodar e ver passar, com as vizinhas que leem as duas páginas**

Run: `npx vitest run tests/faixa-do-repasse-no-estoque.test.ts tests/faixa-do-repasse-na-home.test.ts tests/areas-do-site.test.ts tests/faixas-de-preco-na-navegacao.test.ts tests/destaques-da-semana-na-home.test.ts tests/paginas-de-entidade.test.ts tests/estoque-no-servidor.test.ts tests/vitrine.test.ts tests/rodape-e-imagens.test.ts tests/nenhum-hub-orfao.test.ts tests/contagem-e-cache-das-listagens.test.ts tests/contagem-fora-do-h1.test.ts tests/repasse-sem-view-item.test.ts tests/genero-e-concordancia.test.ts`
Expected: PASS. (`destaques-da-semana-na-home` e `paginas-de-entidade` não mockam a leitura do repasse: sem variável do Supabase no teste, `lerRepassesPublicos` devolve `[]` e a faixa não aparece.)

- [ ] **Step 7: Provar as travas com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. Em `/estoque`, mover `{faixaDoRepasse && <FaixaDoRepasseNoEstoque … />}` para dentro do `fallback` do `<Suspense>` (logo depois de `<GradeDeVeiculos … />`) → "depois da grade, fora do <Suspense>" reprova.
2. Em `/estoque`, trocar `lerRepassesDasPortas(agora, "/estoque")` por `lerRepassesPublicos(agora, "/estoque")` (import de `../../lib/leituraDosRepasses`) → "pane na leitura do repasse: a página inteira fica" reprova (a página lança).
3. Em `/estoque`, trocar `faixaNoEstoque(repasses, agora)` por `faixaNoEstoque(repasses, agora) ?? { abertos: 0 }` → "sem carro aberto a todos, nenhum pedaço da faixa" reprova.
4. Na home, trocar `lerRepassesDasPortas(agora, "/")` por `lerRepassesPublicos(agora, "/")` → "pane na leitura do repasse: a home continua" reprova.
5. Em `areasDoSite.ts`, apagar a entrada `repasse` (o bloco em `page.tsx` fica) → "com três ou mais abertos" e "a faixa do repasse entra logo depois das faixas de preço" reprovam — o bloco escrito e nunca montado.
6. Em `areasDoSite.ts`, mover a entrada `repasse` para o fim do catálogo (depois de `contato`) → as duas asserções de ordem reprovam (a faixa cairia depois da faixa vermelha de fechamento).

- [ ] **Step 8: Commit**

```bash
git add src/app/estoque/page.tsx src/lib/areasDoSite.ts src/app/page.tsx tests/faixa-do-repasse-no-estoque.test.ts tests/faixa-do-repasse-na-home.test.ts tests/areas-do-site.test.ts
git commit -m "feat(repasse): as faixas no ar, depois da grade do /estoque e na home (área nova, sem passo no painel)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Fechamento — suíte, remedição do menu, CI, revisão, textos e PR (controlador)

**Files:** `src/lib/menuDoCabecalho.ts` e `src/components/Header.tsx` (docblock e comentário, no passo 6); ledger em `.superpowers/sdd/2026-09-25-repasse-pr4-portas/progress.md` (pasta ignorada pelo git).

- [ ] **Step 1: Varredura de escapes**

Nos arquivos mexidos com regex (`paginas-geo`, `cabecalho-renderizado` e os testes novos), conferir que nenhum `\b`/`\s`/`\w` virou byte de controle:
```bash
git diff --name-only 8ba38e8..HEAD | xargs grep -lP '\x08' ; echo "fim da busca por 0x08"
```
Expected: só "fim da busca por 0x08". Se algum arquivo aparecer, regravar com a ferramenta Write.

- [ ] **Step 2: Suíte inteira, em 8 fatias**

A suíte inteira de uma vez estoura a memória desta máquina. Uma fatia por vez, na ordem:
```bash
for i in 1 2 3 4 5 6 7 8; do npx vitest run --shard=$i/8 || echo "FATIA $i VERMELHA"; done
```
Expected: nenhuma "FATIA … VERMELHA". As varreduras globais que os arquivos focados não pegam (`promessa-publica`, `paginas-institucionais`, `brechas-de-mensuracao`, `sem-beco-sem-saida`, `whatsapp-numero-unico`, `nomenclatura-estoque`, `dominio-do-site`, `textos-sem-marcas-de-ia`) estão aqui. Vermelho que passa isolado e muda de arquivo entre rodadas é contenção (ver o `testTimeout` de `vitest.config.ts`): rodar a fatia de novo antes de investigar.

- [ ] **Step 3: Tipos e lint**

```bash
npx tsc --noEmit
npx eslint . --pass-on-unpruned-suppressions
```
Expected: `tsc` sem saída; `eslint` sem erro novo (a catraca de `eslint-suppressions.json` é a mesma do job `lint`).

- [ ] **Step 4: O build de produção local, para medir**

A tabela do docblock é medida no código que vai ao ar, não no `next dev`.
1. As duas variáveis PÚBLICAS do Supabase (as mesmas que o job `build` usa; nunca a chave de serviço), sem imprimir os valores:
   ```bash
   grep -E '^NEXT_PUBLIC_SUPABASE_(URL|ANON_KEY)=' ../motors-site-oficial/.env.local > .env.local
   grep -c '=' .env.local   # 2
   ```
2. Build com webpack (o Turbopack recusa a junção de `node_modules`, memória `worktree-sem-node-modules`):
   ```bash
   npx next build --webpack
   ```
   Se o type check de rota reprovar num arquivo que **não** está em `git diff --stat 8ba38e8..HEAD`, é da base: anotar e medir no preview da Vercel do commit (link do status "Vercel" na página do commit, depois do passo 7), com o mesmo script.
3. Subir o servidor pela configuração que já existe em `.claude/launch.json`: `preview_start({ name: "prod-local" })` (é `npx next start`, porta 3000).

- [ ] **Step 5: Remedir o menu e decidir**

Mesmo método do docblock de `menuDoCabecalho.ts`: a margem automática do logo é a folga; quando ela zera, o transbordo da barra com o telefone travado em uma linha é o déficit. No navegador embutido, abrir `http://localhost:3000/estoque` (página longa: tem barra de rolagem). Para cada largura, `resize_window({ width: W, height: 900 })` e rodar pelo `javascript_tool`:

```js
(() => {
  const barra = document.querySelector("header > div"); // a barra do desktop é o 1º filho do <header>
  const logo = barra.querySelector('a[href="/"]');
  const nav = barra.querySelector("nav");
  const tel = barra.querySelector('a[href^="tel:"]');
  const repasse = nav.querySelector('a[href="/repasse"]');
  const contato = nav.querySelector('a[href="/contato"]');
  const visivel = (el) => getComputedStyle(el).display !== "none";
  const umaCasa = (n) => Math.round(n * 10) / 10;

  const trecho = document.createRange();
  trecho.selectNodeContents(tel);
  const linhasDoTelefone = visivel(tel) ? trecho.getClientRects().length : 0;

  const vao = parseFloat(getComputedStyle(barra).columnGap);
  const antes = tel.style.whiteSpace;
  tel.style.whiteSpace = "nowrap";
  const margemDoLogo = nav.getBoundingClientRect().left - vao - logo.getBoundingClientRect().right;
  const transbordo = barra.scrollWidth - barra.clientWidth;
  tel.style.whiteSpace = antes;

  return {
    viewport: window.innerWidth,
    barraDeRolagem: window.innerWidth - document.documentElement.clientWidth,
    repasse: visivel(repasse) ? "visível" : "oculto",
    contato: visivel(contato) ? "visível" : "oculto",
    larguraDoRepasse: visivel(repasse) ? umaCasa(repasse.getBoundingClientRect().width) : null,
    nav: umaCasa(nav.getBoundingClientRect().width),
    folga: umaCasa(transbordo > 0 ? -transbordo : margemDoLogo),
    linhasDoTelefone,
    alturaDaBarra: barra.getBoundingClientRect().height,
  };
})()
```

Larguras: 1024, 1280, **1281 a 1300 de 1 em 1**, 1366, **1528 a 1553 de 1 em 1**, 1920 (um `browser_batch` com os pares `resize_window` + `javascript_tool`). No fim, `resize_window({ preset: "desktop" })`, `preview_stop` e `rm .env.local`.

**A barra de rolagem.** A tabela de 07/09 foi medida em janela real do Chrome, com a barra clássica de 15px. Se o script devolver `barraDeRolagem` menor que 15 (emulação com barra sobreposta), a folga real é `folga − (15 − barraDeRolagem)`: dentro de um mesmo degrau a folga cresce 1:1 com a largura (a tabela de hoje mostra isso: 1281 → 1366, +85px de viewport, +85px de folga).

**Conferência de sanidade** antes de decidir: 1024 e 1280 devem repetir a tabela de hoje (nav 538,5px; folga 59px e 209px), porque o REPASSE está oculto ali. Se não repetirem, algo além do REPASSE mudou a barra: parar e achar o quê.

**Decisão** (previsão da decisão 9: com `r` = `larguraDoRepasse` entre 56 e 62px, a folga em 1281 fica entre −8 e −2px):
- **Folga real ≥ 0 em toda largura de 1281 a 1300, telefone em 1 linha e barra em 68px em todas as larguras** → segue para o passo 6.
- **Qualquer folga negativa, telefone em 2 linhas ou barra fora de 68px** → **parar; não mesclar.** Levar ao dono a folga mínima medida e a largura em que ela acontece, com as opções (cada uma é uma troca de classe no `Header.tsx`):
  - **A (recomendada):** o `nav` passa de `desktop:gap-7` para `desktop:gap-6` — +20px de folga de 1281 para cima (5 vãos × 4px); os itens do menu ficam 4px mais juntos no desktop, ainda mais afastados que os 16px de 1024–1280.
  - **B:** a barra passa de `desktop:gap-9` para `desktop:gap-8` — +20px (5 vãos × 4px); os blocos da barra (logo, menu, telefone, painel, WhatsApp) ficam 4px mais juntos.
  - **C:** o REPASSE sobe para `2xl:`, junto do CONTATO — a folga de hoje volta, mas ele só aparece na barra a partir de 1536px, contra a decisão de 24/09.
  
  Com a escolha do dono: aplicar a classe, commit (`fix(menu): <opção> para o REPASSE caber de 1281 em diante`), refazer os passos 4 e 5 e só então seguir.

- [ ] **Step 6: Reescrever a tabela do docblock e o comentário do `Header.tsx`**

Em `src/lib/menuDoCabecalho.ts`:
1. Apagar o aviso "⚠️ 25/09: a tabela abaixo é de ANTES do `REPASSE`…" que a Task 2 pôs.
2. Trocar o parágrafo de abertura da seção (de "A barra tem 68px e uma linha só, então o sexto item pedia prova." até "varrendo 1266–1300 e 1528–1553 de 1 em 1 px:") por:
   ```
    * A barra tem 68px e uma linha só, então cada item pede prova. Remedido em
    * <dia da medição>/2026, com o `REPASSE` (spec 2026-09-24 §10), no build de
    * produção (`next build --webpack` + `next start`), pelo script do passo 5
    * da Task 6 do plano do PR 4: a folga é a margem automática do logo e,
    * quando ela zera, o transbordo da barra com o telefone travado em uma
    * linha. Varredura de 1281–1300 e 1528–1553, de 1 em 1 px. A barra de
    * rolagem clássica come 15px (é ela que cria a diferença entre a largura
    * que a media query vê e a que o layout tem); onde o navegador de medição
    * não a tinha, os 15px saíram da folga, que cresce 1:1 com a largura dentro
    * de um degrau:
   ```
   (`<dia da medição>` é a data do passo 5, no formato `25/09`.)
3. Trocar a tabela por uma com as colunas `viewport   REPASSE   CONTATO    nav       folga na barra` e as linhas 1024, 1280, 1281, a largura de menor folga entre 1282 e 1300 (só se for diferente de 1281), 1366, 1535, 1536 e 1920. Cada célula sai do script: `repasse` e `contato` ("visível"/"oculto"), `nav` em px com uma casa e vírgula decimal, `folga` já corrigida pela barra de rolagem, em px. Manter as setas: `← o ponto mais apertado` na linha de menor folga, `← degrau \`desktop:\`, gap 36px, o REPASSE aparece` em 1281 e `← \`2xl:\`, o CONTATO volta` em 1536. A linha "O telefone fica em UMA linha em toda largura, e a barra em 68px em todas." fica, se o passo 5 confirmou as duas coisas.
4. Trocar os dois parágrafos que vão de "O ponto mais apertado HOJE é 1024px — e essa é uma condição nova, criada por esta entrega." até "…e a revisão derrubou com a aritmética da própria tabela." por:
   ```
    * O ponto mais apertado passou de 1024px para 1281px com o `REPASSE`. Ele
    * fica oculto até 1280, então 1024px continua com os 59px de 07/09; de 1281
    * para cima custa `r + 28` — `r` é a largura do rótulo, medida em <r>px, e
    * 28px é o vão de `desktop:gap-7` —, o que leva a folga de 1281px de 82 para
    * <folga em 1281>px.
    *
    * A mesma conta explica o `CONTATO` em `2xl:`: ele custa 61,5 + 28px no
    * degrau em que aparece, e em 07/09, somado ao `GUIAS MOTORS`, deixava a
    * folga negativa de 1281 a 1289px. Um item novo na barra de 1281 para cima
    * precisa caber nos <folga em 1281>px que sobram — ou subir de degrau.
    *
    * A primeira versão deste trecho, em 07/09, dizia que o aperto de 1024px
    * "era anterior" ao `GUIAS MOTORS`; a revisão derrubou com a aritmética da
    * própria tabela. Conta de folga se faz com a tabela, não de memória.
   ```
   (`<r>` = `larguraDoRepasse` em 1281; `<folga em 1281>` = a folga corrigida em 1281. Se o dono escolheu A ou B no passo 5, acrescentar uma frase com a troca de classe e a data da decisão.)
5. No fim da seção "O histórico desta tabela", depois de "…remede e reescreve isto aqui.", acrescentar:
   ```
    *
    * 25/09: o `REPASSE` entrou em `desktop:` e esta seção foi remedida antes do
    * merge, como a frase acima manda.
   ```

Em `src/components/Header.tsx`, no parágrafo do REPASSE que a Task 2 pôs acima do `<nav>`, trocar "A remedição está na tabela de `lib/menuDoCabecalho.ts`." por "Folga mínima medida de 1281 a 1300px: <folga mínima>px, em <largura>px — a tabela está em `lib/menuDoCabecalho.ts`."

Rodar: `npx vitest run tests/cabecalho-renderizado.test.ts tests/menu-do-celular-fiacao.test.ts` → PASS.

```bash
git add src/lib/menuDoCabecalho.ts src/components/Header.tsx
git commit -m "docs(menu): a folga da barra remedida com o REPASSE (spec §10)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Push**

```bash
git push -u origin feat/repasse-portas
```

- [ ] **Step 8: CI concluído e verde nos cinco jobs**

Conferir o run `testes` do head pelo navegador embutido, na página do commit (`github.com/85dyones/motors-site-oficial/commit/<sha>`, `find` por "Status checks"; memória `medir-ci-sem-gh` — o `gh` não está autenticado e a API pública tem 60 chamadas por hora). Uma conferência depois de dois minutos; nunca vigiar de 30 em 30 s. Só segue com `completed success` em `vitest`, `tipos`, `lint`, `build` e `deploy-vercel`.

- [ ] **Step 9: Revisão final com o checklist do `qa-guardian`**

Um revisor Opus com o modelo de revisão final e o checklist de `.claude/agents/qa-guardian.md` dentro (spec §12: "passa pelo `qa-guardian` antes do merge"). Pontos que ele confere além do de sempre:
- `Header.tsx`, `Footer.tsx`, `menuDoCabecalho.ts` e `colunasDoRodape.ts` não importam `paginaDoRepasse.ts` (decisão 11): `grep -n "paginaDoRepasse" src/components/Header.tsx src/components/Footer.tsx src/lib/menuDoCabecalho.ts src/lib/colunasDoRodape.ts` sem saída.
- Nenhuma frase pública nova fora de `paginaDoRepasse.ts`/`repasseNaNavegacao.ts`; o texto da prancha idêntico ao de `.superpowers/desenho-v5/PORTAS.md`.
- `/` e `/estoque` leem o repasse só por `lerRepassesDasPortas`: `grep -n "lerRepassesPublicos" src/app/page.tsx src/app/estoque/page.tsx` sem saída.
- Nenhum `view_item`/`ViewContent`/`content_ids`/`trackVehicleView` no diretório do repasse nem nos dois pontos de chamada; nenhum WhatsApp nem `companySettings` nas faixas.
- A tabela do docblock bate com os números do passo 5 anotados no ledger.
Bloqueios corrigidos numa rodada única; suíte das fatias tocadas e nova volta de CI.

- [ ] **Step 10: Os textos novos, ao dono**

Levar ao dono a lista "Textos novos para o dono aprovar antes do merge" (no topo deste plano), com a frase exata de cada um como está no código. Mudança pedida entra na mesma rodada de correção e passa de novo pela Task 1 (travas de texto). Nada disso vai ao `main` sem o ok.

- [ ] **Step 11: Abrir o PR — pelo Chrome do dono, com o ok dele**

Base `main` (o diff mostra o PR 3 empilhado embaixo). Corpo com: o que entra (menu e rodapé, faixa do `/estoque`, faixa da home e a área nova da tela A3, a oração geo, o T3 do Guia 07); a remedição do menu (a tabela e, se houve, a opção escolhida pelo dono); a verificação (8 fatias, `tsc`, lint, CI, revisão); as decisões 1 a 20 deste plano; e **a ordem de merge: depois do #156 (PR 3), com o PR 3 já no ar (spec §12)**. O merge em si é da sessão de handoff, em lote verificado (memória `merge-no-main-em-lote-verificado`), com ordem do dono. Com várias abas no grupo do Chrome, preencher título e corpo por `form_input` ou script, nunca por `computer.type` (memória `limites-de-execucao`).
