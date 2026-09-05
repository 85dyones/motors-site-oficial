import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Veiculo } from "../src/types";
import { getVeiculoPdpUrl } from "../src/lib/supabase";
import { nomeComAno } from "../src/lib/nomeDoVeiculo";
import { schemaDeListagem } from "../src/lib/schemaListagem";
import { resolveTipoCombustivel } from "../src/lib/regrasEstoque";
import {
  CAMPOS_DA_BUSCA,
  CAMPOS_FORA_DA_BUSCA,
  casaComABusca,
  CAIXA_DA_BUSCA,
  chipDaBusca,
  ehTermoDeFichaTecnica,
  EXEMPLO_DA_BUSCA,
  LIMITE_DO_CHIP,
  FILTROS_PARA_LIMPAR_TUDO,
  indiceDaVitrine,
  mensagemDeVitrineVazia,
  mostrarLimparTudo,
  painelDeFiltro,
  rotuloDosResultados,
  SO_NO_CELULAR,
  termosDaBusca,
  textoBuscavel,
  vitrineTemFichas,
} from "../src/lib/vitrine";
import IndiceDaVitrine from "../src/components/modernist/IndiceDaVitrine";
import { ler, lerCodigo } from "./fonte";

/**
 * A vitrine de `/estoque`: o que o servidor entrega e o que o celular vê.
 *
 * Medido contra a produção em 2026-09-04: o HTML servido de `/estoque` trazia
 * 9 links de ficha e 36 URLs no `ItemList` (34 carros e 2 motos — contar só
 * `/carros/` esconde as motos e foi o erro da primeira medição). A grade vive
 * dentro de um `<Suspense>` cujo fallback mostra a primeira leva; as outras 27
 * fichas só existiam no JSON-LD.
 *
 * ---------------------------------------------------------------------------
 * Por que este arquivo RENDERIZA em vez de ler a fonte
 * ---------------------------------------------------------------------------
 * A primeira versão testava só `indiceDaVitrine` e `painelDeFiltro`, e a
 * revisão de 04/09 mostrou que isso não guardava nada: as duas funções nasceram
 * naquele commit e o risco nunca esteve nelas. Estava no PONTO DE CHAMADA. Três
 * mutações passaram a suíte inteira — entre elas `fichas.map(` virando
 * `fichas.slice(0, 9).map(` dentro do JSX, que é literalmente o defeito medido
 * em produção com o `slice` só trocando de endereço.
 *
 * `IndiceDaVitrine` existe para fechar isso: é síncrono, não busca dado e não
 * usa hook de roteador, então cabe em `renderToStaticMarkup` e o teste conta os
 * `<a>` que de fato saíram. Recortar a lista ou apagar o bloco fica vermelho.
 *
 * O painel de filtro não tem essa saída: vive dentro de `Catalogo`, que é
 * client component e chama `useSearchParams()` — renderizá-lo exigiria jsdom e
 * contexto de roteador, que `vitest.config.ts` documenta como infraestrutura
 * ainda não montada aqui. Para ele o guarda é asserção de fonte, e ela nomeia a
 * expressão exata em vez de uma palavra solta, que é o que deixou passar
 * `painelDeFiltro(true)`.
 */

function veiculo(parcial: Partial<Veiculo> & Pick<Veiculo, "id" | "marca" | "modelo">): Veiculo {
  return {
    versao: "",
    ano: 2022,
    quilometragem: 40000,
    cambio: "Automático",
    combustivel: "Flex",
    cor: "Prata",
    fipe: "",
    preco_original: 100000,
    preco_promocional: 0,
    pericia: "",
    whatsapp_images: [],
    web_full_images: [],
    opcionais: "",
    laudo_pericia: "",
    ...parcial,
  } as Veiculo;
}

/** Um pátio maior que a primeira leva de 9 — é onde o defeito aparecia. */
const PATIO: Veiculo[] = Array.from({ length: 36 }, (_, i) =>
  veiculo({
    id: String(8000000 + i),
    marca: ["Jeep", "Fiat", "BMW", "Honda"][i % 4],
    modelo: `Modelo ${i}`,
    versao: `1.${i % 9} Turbo Automático`,
    ano: 2018 + (i % 6),
    // Duas motos: `getVeiculoPdpUrl` manda para `/motos/`, e um índice que só
    // enxerga `/carros/` deixaria as duas de fora sem ninguém notar.
    tipo: i < 2 ? "Moto" : "SUV",
  }),
);

/** Os `href` que o componente de fato renderizou. */
function linksRenderizados(disponiveis: Veiculo[]): string[] {
  const html = renderToStaticMarkup(createElement(IndiceDaVitrine, { disponiveis }));
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
}

describe("o índice servido cobre o estoque inteiro", () => {
  it("renderiza um link por veículo disponível, não só a primeira leva", () => {
    // O defeito medido em produção: 9 de 36. Um `.slice()` em qualquer ponto
    // do caminho — na função pura ou no `.map()` do JSX — cai aqui.
    expect(linksRenderizados(PATIO)).toHaveLength(PATIO.length);
  });

  it("os links renderizados são exatamente as fichas do pátio", () => {
    expect(new Set(linksRenderizados(PATIO))).toEqual(
      new Set(PATIO.map((v) => getVeiculoPdpUrl(v))),
    );
  });

  it("as motos entram — o índice não é só de carros", () => {
    const motos = linksRenderizados(PATIO).filter((h) => h.startsWith("/motos/"));
    expect(motos).toHaveLength(2);
  });

  it("cobre exatamente as mesmas fichas que o `ItemList` anuncia", () => {
    // O invariante que interessa: o que o JSON-LD promete ao rastreador, o
    // HTML entrega como link. Um dos dois recortando é a divergência.
    const doItemList = schemaDeListagem("x", PATIO).itemListElement.map(
      (item) => new URL(item.url).pathname,
    );
    expect(new Set(linksRenderizados(PATIO))).toEqual(new Set(doItemList));
  });

  it("o nome do veículo aparece no link, sem repetir a versão", () => {
    const bmw = veiculo({
      id: "7947766",
      marca: "BMW",
      modelo: "X4 M40i 3.0 M Sport Edit V6 Turbo Aut",
      versao: "m40i 3.0 m sport edit v6 turbo aut",
      ano: 2023,
    });
    const html = renderToStaticMarkup(
      createElement(IndiceDaVitrine, { disponiveis: [bmw] }),
    );

    expect(html).toContain(nomeComAno(bmw));
    expect(html).toContain("BMW X4 M40i 3.0 M Sport Edit V6 Turbo Aut 2023");
  });

  it("pátio vazio não renderiza nada — nem o cabeçalho", () => {
    // Cabeçalho seguido de nada é ruído para quem lê e landmark vazio para
    // quem usa leitor de tela. E a âncora do fallback aponta para este `id`:
    // sem o bloco, ela precisa sumir junto (ver o teste do fallback abaixo).
    expect(renderToStaticMarkup(createElement(IndiceDaVitrine, { disponiveis: [] }))).toBe("");
  });

  it("publica a âncora que o fallback do `<Suspense>` procura", () => {
    expect(linksRenderizados(PATIO).length).toBeGreaterThan(0);
    expect(
      renderToStaticMarkup(createElement(IndiceDaVitrine, { disponiveis: PATIO })),
    ).toContain('id="todos-os-veiculos"');
  });

  it("os links passam autoridade — nada de `nofollow`", () => {
    // É a razão de existir do bloco: `ItemList` já informava a URL. Um
    // `rel="nofollow"` aqui deixa a marcação intacta e mata a entrega inteira,
    // sem que a contagem de links perceba.
    const html = renderToStaticMarkup(
      createElement(IndiceDaVitrine, { disponiveis: PATIO }),
    );
    expect(html).not.toMatch(/nofollow/i);
    expect(html).not.toMatch(/\brel=/);
  });

  it("o bloco é visível — link no HTML e invisível para gente não conta", () => {
    // A asserção posicional na página cobre embrulhar o componente por fora.
    // Isto cobre o lado de dentro: um `hidden` na classe da própria `<section>`
    // deixa os 36 links no HTML e some com eles para quem enxerga. É a regra 6
    // quebrada ao contrário, e o teste tem a marcação na mão — só não olhava.
    //
    // Honestidade sobre o alcance: isto é LISTA NEGRA de um item. `invisible`,
    // `sr-only`, `opacity-0` e um `absolute -left-[9999px]` fazem o mesmo e
    // passam. A guarda encarece o acidente, não o impede — perseguir grafia de
    // classe CSS não converge. O que TEM garantia aqui é a contagem de links e
    // a igualdade com o `ItemList`, logo acima; isto é o cinto por cima.
    expect(
      renderToStaticMarkup(createElement(IndiceDaVitrine, { disponiveis: PATIO })),
    ).not.toMatch(/\bhidden\b/);
  });
});

describe("a função pura por trás do índice", () => {
  it("devolve uma entrada por veículo, na ordem em que recebeu", () => {
    expect(indiceDaVitrine(PATIO)).toHaveLength(PATIO.length);
    expect(indiceDaVitrine(PATIO)[0].href).toBe(getVeiculoPdpUrl(PATIO[0]));
  });

  it("cada ficha entra uma vez só", () => {
    const hrefs = indiceDaVitrine(PATIO).map((f) => f.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("a ficha tem quatro segmentos — o quinto repetia os outros três", () => {
    expect(indiceDaVitrine(PATIO)[0].href.split("/").filter(Boolean)).toHaveLength(4);
  });
});

describe("recolher o filtro no mobile não recolhe no desktop", () => {
  it("fechado some no celular, aberto aparece, e o desktop nunca recolhe", () => {
    // Igualdade por ramo, não `toContain` mais lista negra. A versão anterior
    // era `toMatch(/(^|\s)hidden(\s|$)/)` de um lado, `not.toMatch` do outro e
    // `toContain("lg:block")` nos dois — e `"hidden lg:block max-lg:block"`
    // passava nas três, devolvendo o painel EXPANDIDO no celular, que é o
    // defeito original deste PR. Mesmo buraco que `classeDoBotao` tinha, no
    // campo ao lado; sobrou porque eu consertei um e não o irmão.
    //
    // `classe`, `classeDoBotao` e `rotulo` são todos derivados de um booleano.
    // Os três se testam por igualdade — assimetria aqui é onde a próxima
    // variante de grafia entra.
    expect(painelDeFiltro(false).classe).toBe("hidden lg:block");
    expect(painelDeFiltro(true).classe).toBe("lg:block");
  });

  it("o `lg:block` sobrevive nos dois estados — é o par que não separa", () => {
    // No desktop o filtro é a coluna da esquerda da tela 02 do design doc e
    // não recolhe nunca: um `hidden` sem o `lg:block` ao lado apaga o filtro
    // do desktop sem erro nenhum. A igualdade acima já garante isto; esta
    // asserção existe para dizer POR QUE as duas strings são o que são.
    for (const aberto of [true, false]) {
      expect(painelDeFiltro(aberto).classe).toContain("lg:block");
    }
  });

  it("onde o painel recolhe, o botão que o abre existe", () => {
    // O terceiro lado do trio, e o pior de perder: com o botão em `hidden` o
    // painel fica recolhido no celular e SEM nenhuma forma de abrir. Beco sem
    // saída funcional, e nada mais na tela quebra. Achado na revisão de 04/09.
    //
    // `toBe` e não `toContain` + lista negra. A versão anterior era
    // `toContain("lg:hidden")` mais um `not.toMatch(/(^|\s)hidden(\s|$)/)`, e
    // `"lg:hidden max-lg:hidden"` passava nas duas — contém o primeiro, e o
    // caractere antes do segundo `hidden` é `:`, não espaço. No Tailwind v4
    // isso gera `@media (width < 64rem){display:none}` e some com os TRÊS
    // controles em toda largura: a `gA` de volta, com 1889 verdes.
    //
    // Como é constante, a igualdade é a asserção certa — e é mais curta que a
    // que estava aqui. `rotulo` já era testado assim; a inconsistência estava
    // só neste campo.
    for (const aberto of [true, false]) {
      expect(painelDeFiltro(aberto).classeDoBotao).toBe(SO_NO_CELULAR);
    }
    expect(SO_NO_CELULAR).toBe("lg:hidden");
  });

  it("o botão diz o que vai acontecer, não onde ele está", () => {
    expect(painelDeFiltro(false).rotulo).toBe("FILTROS");
    expect(painelDeFiltro(true).rotulo).toBe("FECHAR FILTROS");
  });
});

describe("o atalho de limpar tudo da régua de chips", () => {
  it("aparece com o painel fechado e dois filtros ou mais", () => {
    expect(mostrarLimparTudo(FILTROS_PARA_LIMPAR_TUDO, false)).toBe(true);
    expect(mostrarLimparTudo(FILTROS_PARA_LIMPAR_TUDO + 3, false)).toBe(true);
  });

  it("não aparece com um filtro só — remover o chip custa o mesmo toque", () => {
    expect(mostrarLimparTudo(1, false)).toBe(false);
    expect(mostrarLimparTudo(0, false)).toBe(false);
  });

  it("some com o painel aberto — lá o `LIMPAR (N)` do topo já está na tela", () => {
    // Sem isto os dois botões de limpar tudo ficam visíveis ao mesmo tempo no
    // celular. A primeira versão afirmava em comentário que isso não
    // acontecia, e acontecia.
    for (const filtros of [2, 5, 12]) {
      expect(mostrarLimparTudo(filtros, true)).toBe(false);
    }
  });

  it("o limiar é dois, e é um número só no projeto", () => {
    expect(FILTROS_PARA_LIMPAR_TUDO).toBe(2);
    expect(mostrarLimparTudo(FILTROS_PARA_LIMPAR_TUDO - 1, false)).toBe(false);
  });
});

describe("a página e o índice usam o MESMO predicado de pátio cheio", () => {
  it("responde pelos dois: o bloco e a âncora que aponta para ele", () => {
    // Antes cada lado derivava o seu, e concordavam só porque
    // `indiceDaVitrine` é 1:1 com o pátio. Bastaria ela passar a filtrar para
    // a âncora morta voltar sem teste nenhum ver.
    expect(vitrineTemFichas(PATIO)).toBe(true);
    expect(vitrineTemFichas([])).toBe(false);
    expect(vitrineTemFichas(PATIO)).toBe(indiceDaVitrine(PATIO).length > 0);
  });
});

/**
 * Guardas de fonte do ponto de chamada.
 *
 * Segunda escolha, e assumida como tal: só existem porque `Catalogo` não cabe
 * em `renderToStaticMarkup` (client component com `useSearchParams()`). Cada
 * uma nomeia a EXPRESSÃO exata — `painelDeFiltro(filtroAberto)`, não
 * `painelDeFiltro(` — porque a versão frouxa casava com `painelDeFiltro(true)`,
 * que é justamente a mutação que passou na revisão de 04/09.
 */
describe("o ponto de chamada do painel de filtro", () => {
  const fonte = lerCodigo("src/components/modernist/Catalogo.tsx");

  it("passa o ESTADO para `painelDeFiltro`, não uma constante", () => {
    expect(fonte).toContain("painelDeFiltro(filtroAberto)");
  });

  it("aplica a classe devolvida no `<aside>`", () => {
    // Sem a interpolação o painel nunca recolhe, e nada mais quebra.
    expect(fonte).toMatch(/<aside[\s\S]{0,200}\$\{filtro\.classe\}/);
  });

  it("a visibilidade dos TRÊS controles de celular vem da função", () => {
    // Com `lg:hidden` solto na marcação, trocá-lo por `hidden` some com o
    // controle e nada mais quebra — no alternador isso deixa o filtro
    // inacessível no celular. Ancorado em cada botão: um `toContain` solto
    // passaria com qualquer um deles reescrito à mão.
    //
    // Eram dois na segunda rodada da revisão de 04/09, e a saída "VER N
    // VEÍCULOS" de dentro do painel era o terceiro `lg:hidden` escrito à mão
    // que ninguém tinha contado. O trio virou quarteto.
    for (const ancora of [
      /aria-controls="painel-de-filtros"[\s\S]{0,300}\$\{filtro\.classeDoBotao\}/,
      /\$\{filtro\.classeDoBotao\}`\}[\s\S]{0,120}LIMPAR TUDO/,
      /onClick=\{fecharFiltro\}[\s\S]{0,200}\$\{filtro\.classeDoBotao\}/,
    ]) {
      expect(fonte).toMatch(ancora);
    }

    // E nenhum `lg:hidden` sobrou solto: sobrar é o convite para o próximo.
    // Vale para os DOIS arquivos, porque o quinto controle mora na página — a
    // âncora "VER TODO O ESTOQUE" do fallback. A frase valia para um arquivo
    // só enquanto eu não tinha contado direito.
    expect(fonte).not.toContain("lg:hidden");
    expect(lerCodigo("src/app/estoque/page.tsx")).not.toContain("lg:hidden");
  });

  it("o disclosure anuncia o próprio estado, e aponta para o painel certo", () => {
    // `aria-expanded={true}` mente sempre; um `aria-controls` que não casa com
    // o `id` do `<aside>` é referência pendurada. Nenhum dos dois quebra nada
    // na tela — só para quem usa leitor de tela.
    expect(fonte).toContain("aria-expanded={filtroAberto}");
    expect(fonte).toContain('aria-controls="painel-de-filtros"');
    expect(fonte).toContain('id="painel-de-filtros"');
  });

  it("o atalho de limpar tudo pergunta à regra, e não perde o foco", () => {
    expect(fonte).toContain("mostrarLimparTudo(chipsAtivos.length, filtroAberto)");
    // Ancorado no RÓTULO, e não no nome do handler: desde que os três botões
    // que limpam passaram a chamar o mesmo, o nome sozinho não diz qual é este.
    expect(fonte).toMatch(
      /onClick=\{limparTudoComFocoNosResultados\}[\s\S]{0,300}LIMPAR TUDO/,
    );
  });

  it("o painel recolhido continua na árvore", () => {
    // Decidir isso em JavaScript exige medir a janela no cliente: divergência
    // de hidratação e piscar de campos na primeira pintura — a armadilha que
    // `BuscaRegua.tsx` já documenta no `soDesktop`. Some por CSS.
    expect(fonte).not.toMatch(/\{\s*[\w.]+\s*(&&|\?)[\s\S]{0,40}<aside/);
  });

  it("fechar pelo botão de dentro devolve o foco ao alternador", () => {
    // O botão de fechar vive dentro do `<aside>` que ele esconde: sem isso o
    // foco cai no `<body>` e o Tab seguinte recomeça do topo (WCAG 2.4.3).
    expect(fonte).toMatch(/onClick=\{fecharFiltro\}/);
    expect(fonte).toMatch(/ref=\{botaoDoFiltro\}/);
  });

  it("cada handler de foco tem o `focus()` DENTRO dele", () => {
    // A versão anterior era um `toContain("botaoDoFiltro.current?.focus()")`
    // sem âncora — e a string está nas duas funções. Dava para apagar o
    // `focus()` de QUALQUER uma das duas correções de acessibilidade deste PR
    // que a outra segurava o teste, com os 1887 verdes. Achado na terceira
    // rodada da revisão de 2026-09-04.
    //
    // É o mesmo raciocínio que já valia para `classeDoBotao` logo acima:
    // travar quem chama não é travar o que a função faz.
    // O par deixou de ter um destino só quando `limparTudoSemPerderOFoco` foi
    // absorvido por `limparTudoComFocoNosResultados`: agora são dois handlers e
    // dois ALVOS diferentes. Travar só o nome do handler deixaria trocar um
    // alvo pelo outro sem ninguém ver — e trocar é justamente o defeito, porque
    // `botaoDoFiltro` é `display:none` no desktop. Cada par vai junto.
    const handlers: [string, string][] = [
      ["fecharFiltro", "botaoDoFiltro"],
      ["limparTudoComFocoNosResultados", "regiaoDeResultados"],
    ];
    for (const [handler, alvo] of handlers) {
      expect(fonte).toMatch(
        new RegExp(`const ${handler} = \\(\\) => \\{[^}]*${alvo}\\.current\\?\\.focus\\(\\)`),
      );
    }
  });
});

describe("o nome acessível da região de resultados", () => {
  // Função pura, então testada por COMPORTAMENTO — asserção de fonte é a
  // segunda escolha deste arquivo, e aqui ela não é necessária.
  it("diz quantos veículos sobraram, que é o que mudou", () => {
    expect(rotuloDosResultados(36)).toBe("Resultados: 36 veículos");
    expect(rotuloDosResultados(0)).toBe("Resultados: 0 veículos");
  });

  it("um veículo no singular — `1 veículos` é a saída errada mais provável", () => {
    expect(rotuloDosResultados(1)).toBe("Resultados: 1 veículo");
  });

  it("o número entra sempre — nome fixo não anuncia mudança nenhuma", () => {
    // A razão de a função existir: um nome fixo é a mesma frase antes e depois
    // de limpar, e o leitor de tela leria exatamente isso.
    const nomes = [0, 1, 9, 36].map(rotuloDosResultados);
    expect(new Set(nomes).size).toBe(nomes.length);
  });
});

/**
 * Guardas do foco dos três botões que apagam a si mesmos.
 *
 * `fecharFiltro` resolve este mesmo defeito mandando o foco para
 * `botaoDoFiltro`, e aquilo só serve para ele: o botão de fechar vive atrás de
 * `SO_NO_CELULAR`, então o alternador que recebe o foco está na tela sempre que
 * ele está.
 *
 * O `LIMPAR (N)` do topo do painel e o `VER TODO O ESTOQUE` do estado vazio
 * não. Os dois aparecem NAS DUAS LARGURAS, e no desktop o alternador é
 * `display:none`: `.focus()` nele é no-op silencioso e o foco continua caindo
 * no `<body>`. Foi por isso que o conserto ficou adiado em 04/09 — copiar o
 * padrão do vizinho consertaria o celular e deixaria o desktop exatamente como
 * estava, sem nenhum teste ver. É esse ponto cego que o `describe` abaixo
 * fecha, e por isso ele mede o ALVO, não só a chamada.
 */
describe("limpar tudo não larga o foco no `<body>` — em nenhuma largura", () => {
  const fonte = lerCodigo("src/components/modernist/Catalogo.tsx");

  /** A abertura da tag que carrega o `ref` do alvo de foco. */
  const alvoDeFoco = fonte.match(/<div[^>]*\sref=\{regiaoDeResultados\}[^>]*>/)?.[0] ?? "";

  it("os três botões que se apagam chamam quem reposiciona o foco", () => {
    // `onClick={limparTudo}` cru É o defeito: os três tornam falsa a própria
    // condição de renderização e saem do DOM levando o foco junto. Ancorado no
    // rótulo de cada um — um `toContain` solto passaria com só um convertido.
    expect(fonte).not.toMatch(/onClick=\{limparTudo\}/);
    expect(fonte).toMatch(
      /onClick=\{limparTudoComFocoNosResultados\}[\s\S]{0,300}LIMPAR \(\{chipsAtivos\.length\}\)/,
    );
    expect(fonte).toMatch(
      /onClick=\{limparTudoComFocoNosResultados\}[\s\S]{0,300}VER TODO O ESTOQUE/,
    );
    const chamadas = fonte.match(/onClick=\{limparTudoComFocoNosResultados\}/g) ?? [];
    expect(chamadas).toHaveLength(3);
  });

  it("o handler limpa E move o foco — sem a segunda linha ninguém recebe", () => {
    // A mutação que este teste existe para pegar: apagar o `.focus()` deixa a
    // limpeza funcionando, a tela correta e o foco no `<body>`.
    //
    // A classe negada não escapa do corpo da função — as duas chamadas têm que
    // estar DENTRO dele, não soltas em qualquer ponto do arquivo.
    expect(fonte).toMatch(
      /const limparTudoComFocoNosResultados = \(\) => \{[^}]*limparTudo\(\)[^}]*regiaoDeResultados\.current\?\.focus\(\);[^}]*\}/,
    );
  });

  it("o alvo é focável por código — `tabIndex={-1}` no mesmo elemento do `ref`", () => {
    // Sem ele, `.focus()` num `<div>` não faz nada e não avisa. E precisa ser
    // `-1`: com `0` a grade inteira entra na ordem de Tab de todo mundo.
    expect(alvoDeFoco).toContain("ref={regiaoDeResultados}");
    expect(alvoDeFoco).toContain("tabIndex={-1}");
  });

  it("o alvo existe nas DUAS larguras — é o que barra copiar `botaoDoFiltro`", () => {
    // `botaoDoFiltro` é o "FILTROS", e ele tem `SO_NO_CELULAR`. A regex pega
    // `hidden`, `lg:hidden` e qualquer outro degrau de uma vez; a classe também
    // não pode sair de `filtro.classe`, que injeta `hidden` em runtime.
    //
    // As duas primeiras linhas são a trava contra medir o vazio. Sem o alvo no
    // arquivo, `alvoDeFoco` é vazio e os `not` abaixo passariam sem ler nada —
    // a armadilha que `tests/fonte.ts` documenta. E o recorte também precisa
    // ter CHEGADO à lista de classes: ele para no primeiro fecha-tag, e um dia
    // uma arrow function na tag põe um deles antes dela. Truncado ali, o teste
    // voltaria a mentir verde — exigir `className=` faz ele gritar.
    expect(alvoDeFoco).toContain("ref={regiaoDeResultados}");
    expect(alvoDeFoco).toContain("className=");
    expect(alvoDeFoco).not.toMatch(/\bhidden\b/);
    expect(alvoDeFoco).not.toContain("filtro.");
  });

  it("o alvo nasce montado, logo depois do painel — não atrás de condição", () => {
    // Asserção POSICIONAL, como a do índice em `/estoque` mais abaixo: exigir
    // que ele venha colado no fecha-`aside` mata de uma vez embrulhá-lo numa
    // condição (alvo some junto com os botões) e movê-lo para outro bloco. As
    // chaves opcionais são o comentário JSX que `lerCodigo` esvazia mas não
    // remove; VAZIAS, então nenhuma condição casa aqui.
    expect(fonte).toMatch(/<\/aside>\s*(?:\{\}\s*)?<div[^>]*\sref=\{regiaoDeResultados\}/);
  });

  it("o alvo se anuncia — `<div>` focado sem nome não diz nada", () => {
    // A vantagem que justifica mandar o foco para um contêiner em vez de um
    // controle: com papel e nome, o leitor de tela anuncia a região e lê o
    // resultado novo. Sem eles o foco chega num elemento mudo — o `<body>`
    // com etapas a mais.
    expect(alvoDeFoco).toMatch(/role="region"/);
    // E o nome é EXPRESSÃO, não literal: um nome fixo passaria num toMatch
    // solto de `aria-label=` sem anunciar contagem nenhuma — que é exatamente
    // o buraco que este bloco fecha.
    expect(alvoDeFoco).toContain("aria-label={rotuloDosResultados(totalFiltrado)}");
  });

  it("a contagem chega à tela ANTES do foco — senão o lido é o número velho", () => {
    // O React agenda o estado e devolve o controle sem repintar, então o
    // `.focus()` da linha seguinte acontece com o `aria-label` ainda no valor
    // antigo — e é NO INSTANTE DO FOCO que o leitor de tela lê o nome. Sem o
    // despacho síncrono, quem limpa a partir do estado vazio ouve "0 veículos"
    // no exato momento em que 36 voltaram para a tela. Medido no navegador.
    expect(fonte).toContain("flushSync");
    expect(fonte).toMatch(
      /const limparTudoComFocoNosResultados = \(\) => \{[^}]*flushSync\([^}]*limparTudo\(\)[^}]*regiaoDeResultados\.current\?\.focus\(\)/,
    );
  });
});

describe("o ponto de chamada do índice, em `/estoque`", () => {
  const fonte = lerCodigo("src/app/estoque/page.tsx");

  it("o índice é o primeiro filho do `<nav>`, sem condição e sem embrulho", () => {
    // Asserção POSICIONAL, e de propósito. `toMatch(/<IndiceDaVitrine/)` pega
    // apagar o elemento e não pega neutralizá-lo (`{false && …}`), embrulhá-lo
    // num `<div className="hidden">` — links no HTML, invisíveis para gente,
    // que é a regra 6 quebrada ao contrário — nem movê-lo para dentro do
    // `fallback` do `<Suspense>`, onde ele sumiria da árvore do cliente.
    //
    // Exigir que ele venha logo depois do `>` que fecha a abertura do `<nav>`
    // mata os três de uma vez. Precedente no repo: `rodape-e-imagens.test.ts`
    // ancora `<GradeDeVeiculos` entre `fallback={` e `<Catalogo`.
    //
    // O `{}` opcional é o comentário JSX que `lerCodigo` esvazia mas não
    // remove — `{/* … */}` vira `{}`. Chaves VAZIAS, então `{false && …}` e
    // qualquer outra condição continuam sem casar.
    //
    // `[^<]` e não `[\s\S]`: com o coringa largo, o `>` do próprio
    // `<div className="hidden">` servia de âncora e o embrulho passava. Foi a
    // única das 21 mutações que escapou na primeira rodada deste conserto.
    expect(fonte).toMatch(
      /aria-label="Índice do estoque"[^<]{0,200}>\s*(?:\{\}\s*)?<IndiceDaVitrine disponiveis=\{disponiveis\} \/>/,
    );

    // E o `<nav>` que o abriga não pode esconder o conjunto: `[^<]` atravessa
    // os atributos dele sem tropeçar, então mover o `hidden` para lá passava
    // pela âncora acima levando junto os hubs de marca e carroceria.
    expect(fonte).not.toMatch(/aria-label="Índice do estoque"[^<]{0,200}\bhidden\b/);
  });

  it("a âncora do fallback só sai com pátio cheio", () => {
    // O alvo é condicional (pátio vazio não renderiza o bloco). Sem a mesma
    // guarda aqui, estoque zerado servia um botão de largura total dizendo
    // "VER TODO O ESTOQUE 0" que não levava a lugar nenhum.
    expect(fonte).toMatch(
      /\{vitrineTemFichas\(disponiveis\) && \([\s\S]{0,200}href="#todos-os-veiculos"/,
    );
  });

  it("a âncora é o quinto controle de celular, e usa a constante", () => {
    // Afirmação POSITIVA, e não só o `not.toContain("lg:hidden")` do outro
    // teste: aquele é negativo, e a mutação que importa aqui REMOVE a
    // interpolação e escreve `hidden` — sem deixar `lg:hidden` para trás.
    // Passou verde na primeira tentativa deste conserto.
    //
    // Trocar por `hidden` some com o único caminho pré-hidratação para o
    // índice no celular, e devolve o salto de layout que o fallback existe
    // para evitar.
    expect(fonte).toMatch(
      /href="#todos-os-veiculos"[\s\S]{0,300}\$\{SO_NO_CELULAR\}/,
    );
  });
});

describe("a busca por digitação lê uma lista branca, nunca o objeto", () => {
  /**
   * Pedido do dono em 2026-09-04, no mesmo lote do filtro recolhido: digitar
   * em vez de caçar a caixa certa numa coluna de cinco grupos.
   *
   * A implementação óbvia — varrer o objeto do veículo — vaza documento sem
   * exibir nada. `Veiculo` tem `placa`; buscar em cima do objeto faria a
   * vitrine RESPONDER sobre ela: digita a placa, e a ficha que aparece
   * confirma de quem é. É o mesmo raciocínio que tirou `placa` do mapper
   * público, aplicado à outra ponta.
   *
   * Estes testes existem porque a diferença entre as duas implementações é
   * invisível em qualquer teste de comportamento normal: as duas acham o Onix.
   */
  const ONIX = {
    id: "1",
    marca: "Chevrolet",
    modelo: "Onix",
    versao: "LTZ 1.0 Turbo",
    ano: 2022,
    cor: "Prata",
    cambio: "Automático",
    combustivel: "Flex",
    tipo: "Hatch",
    motor: "1.0 Turbo",
    opcionais: "Ar-condicionado, Central multimídia",
    quilometragem: 30000,
    preco_original: 89900,
    preco_promocional: 0,
    pericia: "",
    whatsapp_images: [],
    web_full_images: [],
    fipe: "",
    laudo_pericia: "",
  } as unknown as Veiculo;

  it("acha por modelo, por marca e por característica", () => {
    for (const termo of ["onix", "chevrolet", "automatico", "prata", "turbo", "multimidia"]) {
      expect(casaComABusca(ONIX, termosDaBusca(termo)), termo).toBe(true);
    }
  });

  it("ignora acento e caixa nos dois lados", () => {
    // O carro tem "Automático"; ninguém digita o acento no celular.
    expect(casaComABusca(ONIX, termosDaBusca("AUTOMÁTICO"))).toBe(true);
    expect(casaComABusca(ONIX, termosDaBusca("automatico"))).toBe(true);
    expect(casaComABusca(ONIX, termosDaBusca("Ar-Condicionado"))).toBe(true);
  });

  it("todos os termos precisam casar, em qualquer ordem", () => {
    expect(casaComABusca(ONIX, termosDaBusca("onix automatico"))).toBe(true);
    expect(casaComABusca(ONIX, termosDaBusca("automatico onix"))).toBe(true);
    // O segundo termo não existe neste carro: o conjunto reprova.
    expect(casaComABusca(ONIX, termosDaBusca("onix diesel"))).toBe(false);
  });

  it("busca vazia não filtra ninguém — e não reprova todo mundo", () => {
    // A inversão clássica: tratar "" como termo deixa a vitrine em branco na
    // primeira pintura, antes de qualquer tecla.
    expect(termosDaBusca("")).toEqual([]);
    expect(termosDaBusca("   ")).toEqual([]);
    expect(casaComABusca(ONIX, termosDaBusca(""))).toBe(true);
    expect(casaComABusca(ONIX, termosDaBusca("   "))).toBe(true);
  });

  it("NÃO acha por placa, ainda que o objeto a tenha", () => {
    // O cenário real: alguém passa a lista com `incluirPlaca` e a busca vira
    // um oráculo de documento sem uma linha de código mudar.
    const comPlaca = { ...ONIX, placa: "ABC1D23" } as unknown as Veiculo;

    expect(textoBuscavel(comPlaca)).not.toContain("abc1d23");
    expect(casaComABusca(comPlaca, termosDaBusca("ABC1D23"))).toBe(false);
    expect(casaComABusca(comPlaca, termosDaBusca("abc1d23"))).toBe(false);
    // E continua achando o carro pelo que é público.
    expect(casaComABusca(comPlaca, termosDaBusca("onix"))).toBe(true);
  });

  it("nenhum dos campos proibidos chega ao texto, venha por onde vier", () => {
    /**
     * A primeira versão deste teste comparava só NOMES: conferia que
     * `CAMPOS_FORA_DA_BUSCA` não aparecia em `CAMPOS_DA_BUSCA`. Isso prende o
     * nome do campo e não prende o CONTEÚDO de um leitor que já existe —
     * quatro mutações passavam com `tsc` verde e a suíte verde, todas da
     * mesma forma:
     *
     *     versao: (v) => `${v.versao} ${(v as any).chassi}`
     *
     * Não é hipótese: `estoque_motors` tem `placa` preenchida em 38 das 107
     * linhas e `chassi` em 36. E é o mesmo defeito do commit `dccbadf` deste
     * branch — "o teste que eu escrevi não guardava nada do que a entrega
     * faz" — um commit depois, no mesmo arquivo.
     *
     * Agora o teste MARCA cada campo proibido com um valor reconhecível e
     * procura a marca na saída: qualquer caminho que o leve ao texto acende.
     */
    const sujo = { ...ONIX } as Record<string, unknown>;
    for (const proibido of CAMPOS_FORA_DA_BUSCA) sujo[proibido] = `PROIBIDO-${proibido}`;
    const comoVeiculo = sujo as unknown as Veiculo;
    const texto = textoBuscavel(comoVeiculo);

    for (const proibido of CAMPOS_FORA_DA_BUSCA) {
      expect(texto, proibido).not.toContain(`proibido-${proibido}`);
      expect(casaComABusca(comoVeiculo, termosDaBusca(`PROIBIDO-${proibido}`)), proibido).toBe(false);
    }

    // E a lista não pode encolher para caber: tirar `chassi` dela faria as
    // asserções acima passarem sem guardar mais nada.
    expect(CAMPOS_FORA_DA_BUSCA.length).toBeGreaterThanOrEqual(4);
    for (const proibido of CAMPOS_FORA_DA_BUSCA) {
      expect(CAMPOS_DA_BUSCA as readonly string[]).not.toContain(proibido);
    }
    expect(CAMPOS_FORA_DA_BUSCA).toContain("placa");
    expect(CAMPOS_FORA_DA_BUSCA).toContain("chassi");
  });

  it("o texto buscável sai SÓ dos campos da lista branca", () => {
    // Mede o conjunto, não uma amostra: um campo a mais na lista sem leitor
    // correspondente não compila, e um campo a mais no OBJETO não entra aqui.
    const texto = textoBuscavel(ONIX);
    const esperado = ["chevrolet", "onix", "ltz 1.0 turbo", "2022", "prata", "automatico", "flex", "hatch", "1.0 turbo"];

    for (const pedaco of esperado) expect(texto).toContain(pedaco);
    expect(texto).not.toContain("89900");
    expect(texto).not.toContain("30000");
  });

  it("veículo sem os campos opcionais não quebra nem vira lixo", () => {
    const magro = { id: "2", marca: "Fiat", modelo: "Uno" } as unknown as Veiculo;

    expect(textoBuscavel(magro)).toBe("fiat uno");
    expect(casaComABusca(magro, termosDaBusca("uno"))).toBe(true);
  });
});

describe("a busca se mostra e se desfaz", () => {
  it("vira chip na régua, com o que foi digitado", () => {
    // Sem chip, o recorte da vitrine fica invisível quando o painel recolhe no
    // celular — o mesmo defeito que a contagem no botão de filtro evita.
    expect(chipDaBusca("onix automatico")).toBe("“ONIX AUTOMATICO”");
    expect(chipDaBusca("  onix  ")).toBe("“ONIX”");
  });

  it("busca vazia não vira chip", () => {
    expect(chipDaBusca("")).toBeNull();
    expect(chipDaBusca("   ")).toBeNull();
  });

  it("o vazio explica pelo motivo certo", () => {
    // "Nenhum veículo com essa combinação de filtros" para quem só digitou uma
    // palavra manda procurar no lugar errado.
    expect(mensagemDeVitrineVazia("gol", 0)).toBe("Nenhum veículo para “gol”.");
    expect(mensagemDeVitrineVazia("gol", 2)).toBe("Nenhum veículo para “gol” com esses filtros.");
    expect(mensagemDeVitrineVazia("", 2)).toBe("Nenhum veículo com essa combinação de filtros.");
    expect(mensagemDeVitrineVazia("   ", 3)).toBe("Nenhum veículo com essa combinação de filtros.");
  });
});

describe("o ponto de chamada da busca, no `Catalogo`", () => {
  /**
   * As funções puras acima podem estar perfeitas e a busca não filtrar nada.
   * Foi exatamente o que a revisão de 04/09 achou na primeira versão do painel
   * recolhido: mutar a função nova deixava 1868 testes verdes, porque nenhum
   * deles passava pelo ponto de chamada.
   *
   * `Catalogo` usa `useSearchParams()` e não renderiza fora do navegador, então
   * aqui a leitura é da fonte — mas ancorada em EXPRESSÃO, nunca em substring
   * solta: `toContain("setBusca")` passaria com o `setBusca` de qualquer um
   * dos quatro lugares que o chamam.
   */
  const fonte = lerCodigo("src/components/modernist/Catalogo.tsx");

  it("o filtro de fato consulta a busca", () => {
    // Sem esta linha o campo digita e a vitrine não muda.
    expect(fonte).toMatch(/if \(!casaComABusca\(v, termos\)\) return false;/);
    expect(fonte).toMatch(/const termos = useMemo\(\(\) => termosDaBusca\(busca\), \[busca\]\)/);
  });

  it("a lista recalcula quando a busca muda", () => {
    // `termos` fora das dependências: o `useMemo` devolve o resultado velho e
    // a vitrine congela na primeira busca. Verde em qualquer teste de função.
    const memos = fonte.match(/\}, \[estoque, selecionados, precoMax[^\]]*\]\)/g) ?? [];

    expect(memos.length).toBe(2);
    for (const memo of memos) expect(memo).toContain("termos");
  });

  it("digitar volta para a primeira leva", () => {
    // Sem isto, quem já clicou "ver mais" três vezes busca e recebe 36 cards
    // de um resultado de 2 — e o botão de carregar mais some sem explicação.
    expect(fonte).toMatch(/onChange=\{\(e\) => \{\s*setBusca\(e\.target\.value\);\s*setVisiveis\(PAGINA\);/);
  });

  it("o campo fica FORA do painel que recolhe", () => {
    // Busca escondida atrás do botão de filtro é a mesma caçada que ela existe
    // para encurtar. A posição no JSX é o que decide: o `<aside>` é quem
    // carrega o `filtro.classe`.
    const campo = fonte.indexOf('id="busca-da-vitrine"');
    const aside = fonte.indexOf("<aside");

    expect(campo).toBeGreaterThan(-1);
    expect(aside).toBeGreaterThan(-1);
    expect(campo).toBeLessThan(aside);

    // A classe que recolhe existe UMA vez no arquivo, e é do `<aside>`.
    //
    // A primeira versão desta guarda procurava `filtro.classe` DEPOIS do `id`
    // do campo — e a mutação que a derrubou põe a classe no `<div>` que vem
    // ANTES dele. Negativa direcional não guarda estrutura; contar as
    // ocorrências e dizer de quem é a única, sim.
    const recolhem = [...fonte.matchAll(/\{filtro\.classe\}/g)];

    expect(recolhem).toHaveLength(1);
    expect(recolhem[0].index!).toBeGreaterThan(aside);
    expect(recolhem[0].index! - aside).toBeLessThan(200);
  });

  it("o campo tem rótulo, ainda que invisível", () => {
    expect(fonte).toMatch(/<label htmlFor="busca-da-vitrine" className="sr-only">/);
  });

  it("limpar tudo limpa a busca junto", () => {
    // Com a busca de fora, "VER TODO O ESTOQUE" deixa a vitrine recortada e o
    // botão vira mentira. Ancorado dentro do corpo de `limparTudo`.
    expect(fonte).toMatch(/const limparTudo = \(\) => \{[\s\S]{0,220}setBusca\(""\);[\s\S]{0,120}\};/);
  });

  it("o chip da busca se remove sozinho", () => {
    expect(fonte).toMatch(/else if \(chip\.chave === "busca"\) setBusca\(""\);/);
    expect(fonte).toMatch(/chipDaBusca\(busca\) \? \[\{ chave: "busca"/);
  });

  it("o vazio recebe a contagem SEM a busca", () => {
    // Passar `chipsAtivos.length` cru faria a mensagem dizer "com esses
    // filtros" quando o único filtro é a própria busca.
    expect(fonte).toMatch(
      /mensagemDeVitrineVazia\(\s*busca,\s*chipsAtivos\.filter\(\(c\) => c\.chave !== "busca"\)\.length,\s*\)/,
    );
  });
});

describe("um termo que nomeia dimensão do painel não casa em opcional", () => {
  /**
   * Medido contra a produção em 2026-09-04: digitar "elétrico" trazia **23
   * carros, nenhum elétrico**. O casamento vinha de `opcionais` — "vidros
   * elétricos", "travas elétricas" — enquanto o painel de COMBUSTÍVEL na mesma
   * tela nem oferecia "Elétrico", porque não há nenhum no pátio.
   *
   * Dois controles lado a lado com respostas contraditórias, e a busca era a
   * que mentia.
   *
   * `opcionais` continua no índice: está vazio em 67% do estoque, então
   * "couro" (9 carros) e "teto solar" (3) são piso e não verdade — mas piso é
   * melhor que nada, e nenhum deles nomeia dimensão do painel.
   */
  const eletrificado = veiculo({
    id: "9001",
    marca: "Chevrolet",
    modelo: "Onix",
    combustivel: "Flex",
    opcionais: "Vidros elétricos, Travas elétricas, Bancos de couro, Teto solar",
  });

  it("«elétrico» pergunta pelo combustível, não por vidro", () => {
    expect(casaComABusca(eletrificado, termosDaBusca("eletrico"))).toBe(false);
    expect(casaComABusca(eletrificado, termosDaBusca("elétrico"))).toBe(false);
    // E acha de verdade quando o combustível é esse.
    const eletrico = veiculo({ id: "9002", marca: "BYD", modelo: "Dolphin", combustivel: "Elétrico" });
    expect(casaComABusca(eletrico, termosDaBusca("eletrico"))).toBe(true);
  });

  it("a busca concorda com o painel: mesmo termo, mesma resposta", () => {
    // O invariante que interessa. `resolveTipoCombustivel` é o que alimenta o
    // grupo COMBUSTÍVEL do filtro; se a busca discordar dele, a tela tem duas
    // verdades.
    const patio = [eletrificado, veiculo({ id: "9003", marca: "BYD", modelo: "Dolphin", combustivel: "Elétrico" })];
    const pelaBusca = patio.filter((v) => casaComABusca(v, termosDaBusca("eletrico")));
    const peloPainel = patio.filter((v) => resolveTipoCombustivel(v) === "Elétrico");

    expect(pelaBusca.map((v) => v.id)).toEqual(peloPainel.map((v) => v.id));
  });

  it("o mesmo vale para câmbio", () => {
    const comManual = veiculo({
      id: "9004",
      marca: "Fiat",
      modelo: "Uno",
      cambio: "Automático",
      opcionais: "Manual do proprietário, Chave reserva",
    });
    expect(casaComABusca(comManual, termosDaBusca("manual"))).toBe(false);
    expect(casaComABusca(comManual, termosDaBusca("automatico"))).toBe(true);
  });

  it("termo que NÃO nomeia dimensão continua lendo os opcionais", () => {
    expect(casaComABusca(eletrificado, termosDaBusca("couro"))).toBe(true);
    expect(casaComABusca(eletrificado, termosDaBusca("teto solar"))).toBe(true);
  });

  it("o vocabulário canônico cobre as dimensões que o painel oferece", () => {
    // Se um combustível novo entrar em `resolveTipoCombustivel` e não aqui, a
    // colisão volta calada para aquele valor.
    for (const combustivel of ["Flex", "Álcool", "Elétrico", "Híbrido", "Diesel", "Gasolina"]) {
      const termo = termosDaBusca(combustivel)[0];
      expect(ehTermoDeFichaTecnica(termo), combustivel).toBe(true);
    }
    for (const cambio of ["Automático", "Manual", "CVT", "Automatizado"]) {
      expect(ehTermoDeFichaTecnica(termosDaBusca(cambio)[0]), cambio).toBe(true);
    }
    // E não abocanha o que não é dimensão.
    for (const palavra of ["couro", "teto", "solar", "onix", "prata", "turbo", "jeep"]) {
      expect(ehTermoDeFichaTecnica(palavra), palavra).toBe(false);
    }
  });

  it("prefixo curto não vira dimensão — a busca é incremental", () => {
    // Cada tecla consulta: "e", "el", "ele" passariam a rotear tudo para a
    // ficha técnica no meio da digitação, e o resultado piscaria.
    expect(ehTermoDeFichaTecnica("e")).toBe(false);
    expect(ehTermoDeFichaTecnica("el")).toBe(false);
    expect(ehTermoDeFichaTecnica("ele")).toBe(true);
  });
});

describe("a caixa da busca existe no HTML servido, com a mesma altura", () => {
  /**
   * Medido no HTML servido de `/estoque` em 04/09/2026, depois que a busca
   * entrou: o fallback do `<Suspense>` terminava no byte 56497 e o `Catalogo`
   * só punha o campo em 57908. O campo nascia na hidratação e empurrava a
   * grade ~60px para baixo, nas DUAS larguras — e o comentário logo abaixo
   * dele continuava afirmando que a troca acontecia "sem empurrar a grade".
   *
   * É o mesmo deslocamento que a coluna reservada de 290px do filtro existe
   * para evitar, na mesma tela, no mesmo commit anterior.
   */
  const doFallback = lerCodigo("src/app/estoque/page.tsx");
  const doCatalogo = lerCodigo("src/components/modernist/Catalogo.tsx");

  it("o fallback serve um campo de busca de verdade", () => {
    expect(doFallback).toMatch(/<form action="\/estoque" method="get"/);
    expect(doFallback).toMatch(/name="q"/);
    expect(doFallback).toMatch(/id="busca-da-vitrine-servida"/);
  });

  it("e ele vem ANTES do `<Catalogo>` — é o que o HTML entrega", () => {
    const campo = doFallback.indexOf('id="busca-da-vitrine-servida"');
    const catalogo = doFallback.indexOf("<Catalogo");
    const fallback = doFallback.indexOf("fallback={");

    expect(campo).toBeGreaterThan(fallback);
    expect(campo).toBeLessThan(catalogo);
  });

  it("os dois campos usam a MESMA caixa, por construção", () => {
    // Constante compartilhada em vez de duas strings iguais: iguais elas ficam
    // até a primeira vez que alguém ajusta o padding de um lado só, e o
    // deslocamento volta sem ninguém medir bytes de novo.
    for (const fonte of [doFallback, doCatalogo]) {
      expect(fonte).toMatch(/className=\{CAIXA_DA_BUSCA\}/);
      expect(fonte).toMatch(/className=\{CONTAINER_DA_BUSCA\}/);
      expect(fonte).toMatch(/placeholder=\{EXEMPLO_DA_BUSCA\}/);
    }
    // E a caixa tem o que decide a altura.
    expect(CAIXA_DA_BUSCA).toContain("py-2.5");
    expect(CAIXA_DA_BUSCA).toContain("border-2");
  });

  it("o X nativo do `type=search` fica escondido — senão são dois", () => {
    // Chrome, Edge e Safari desenham o próprio botão de limpar no
    // `type="search"`, e ele apareceria colado no nosso. O preflight do
    // Tailwind reseta só o `search-decoration`, não este.
    //
    // A regra é CSS de verdade, não variante arbitrária do Tailwind: escrita
    // como `[&::-webkit-search-cancel-button]:appearance-none` dentro desta
    // constante, a classe chegava ao elemento e a REGRA NUNCA ERA GERADA —
    // medido no navegador em 04/09/2026. Por isso o teste confere os dois
    // lados: a classe no campo e o seletor na folha.
    expect(CAIXA_DA_BUSCA).toContain("mt-busca");
    expect(ler("src/app/globals.css")).toMatch(
      /.mt-busca::-webkit-search-cancel-button {[^}]*appearance: none/,
    );
  });

  it("o placeholder ensina VALOR, não nome de campo", () => {
    // A primeira versão dizia "modelo, marca, câmbio, cor" e piorava o
    // resultado de quem obedecia: "câmbio automático" achava 5 e "automático"
    // achava 14, porque o nome do campo não está no índice — só o valor.
    expect(EXEMPLO_DA_BUSCA).not.toMatch(/câmbio|cambio|modelo|marca|cor\b/i);
    expect(EXEMPLO_DA_BUSCA).toMatch(/automático/i);
  });
});

describe("limpar a busca não larga o foco no `<body>`", () => {
  const fonte = lerCodigo("src/components/modernist/Catalogo.tsx");

  it("o botão devolve o foco ao campo", () => {
    // Terceira vez que este defeito aparece neste branch, depois de
    // `fecharFiltro` e do `LIMPAR TUDO`: o botão só existe enquanto
    // `busca !== ""`, e o clique torna a própria precondição falsa.
    //
    // As outras duas ocorrências ficaram adiadas porque o vizinho natural
    // (`botaoDoFiltro`) é `display:none` no desktop. Aqui esse motivo não
    // existe — o campo está montado nas duas larguras.
    expect(fonte).toMatch(
      /onClick=\{\(\) => \{\s*setBusca\(""\);\s*setVisiveis\(PAGINA\);\s*campoDeBusca\.current\?\.focus\(\);\s*\}\}/,
    );
    expect(fonte).toMatch(/const campoDeBusca = useRef<HTMLInputElement>\(null\)/);
    expect(fonte).toMatch(/ref=\{campoDeBusca\}/);
  });
});

describe("o chip da busca não estica a régua", () => {
  it("trunca termo longo", () => {
    // `?q=` é alcançável pela URL: um termo de uma palavra só, longa, esticava
    // o chip e trazia rolagem lateral no celular — o oposto do que esta
    // entrega foi fazer lá.
    const longo = "a".repeat(80);
    const chip = chipDaBusca(longo)!;

    expect(chip.length).toBeLessThanOrEqual(LIMITE_DO_CHIP + 3);
    expect(chip).toMatch(/…”$/);
  });

  it("termo curto passa inteiro, sem reticências", () => {
    expect(chipDaBusca("onix automatico")).toBe("“ONIX AUTOMATICO”");
  });
});

describe("o fim da primeira leva não pode parecer o fim do estoque", () => {
  /**
   * Achado pelo dono no celular, em 05/09/2026: depois de rolar nove fichas,
   * o "CARREGAR MAIS 9" era preto sobre fundo claro, ao lado de um
   * "Mostrando 9 de 36" em cinza de 12px. Ele lê como rodapé da lista — e o
   * cliente sai achando que a loja tem nove carros.
   *
   * A cor de destaque é escassa no site de propósito. Este é o lugar que ela
   * existe para marcar: a única ação que revela que a vitrine continua.
   */
  const fonte = lerCodigo("src/components/modernist/Catalogo.tsx");

  it("o botão de carregar mais usa a cor de destaque", () => {
    expect(fonte).toMatch(/className="mt-btn mt-btn-primario mt-foco"\s*>\s*CARREGAR MAIS/);
    expect(fonte).not.toMatch(/mt-btn-tinta[^"]*"\s*>\s*CARREGAR MAIS/);
  });

  it("a variante de destaque é a que carrega o `--mt-accent`", () => {
    // Guarda do par: trocar a classe não adianta se a classe não for a
    // acentuada. `mt-btn-primario` é a única que pinta com a cor da marca.
    const css = ler("src/app/modernist.css");
    const bloco = css.match(/\.mt-btn-primario\s*\{[^}]*\}/)?.[0] ?? "";

    expect(bloco).toMatch(/background:\s*var\(--mt-accent\)/);
  });

  it("a contagem ao lado dele não é legenda", () => {
    // "Mostrando 9 de 36" É o argumento: em cinza de 12px ao lado de um botão
    // preto, ninguém lê. Cresceu e escureceu junto com o botão.
    expect(fonte).toMatch(
      /className="text-\[13px\] font-semibold text-mt-neutral-800"\s*>\s*\n?\s*Mostrando \{mostrando\} de \{totalFiltrado\}/,
    );
  });
});

describe("a home dá saída para a vitrine nos dois extremos dos destaques", () => {
  /**
   * Achado pelo dono no celular em 05/09/2026. O bloco "01 — Estoque
   * selecionado" tinha "VER OS 36 VEÍCULOS" só no cabeçalho. Empilhada, a
   * grade tem seis fotos grandes: quem rola até o último card chega direto no
   * bloco preto da Consultoria, com o link de cima fora da tela há muito.
   *
   * É o mesmo defeito do "CARREGAR MAIS" que parecia rodapé, na seção acima —
   * a diferença entre "a loja tem estes seis" e "a loja tem trinta e seis".
   */
  const home = lerCodigo("src/app/page.tsx");

  it("o link aparece duas vezes na seção de destaques", () => {
    const secao = home.slice(
      home.indexOf("01 — ESTOQUE SELECIONADO"),
      home.indexOf("02 — CONSULTORIA"),
    );
    const links = [...secao.matchAll(/<LinkRegua href="\/estoque">VER OS \{total\} VEÍCULOS<\/LinkRegua>/g)];

    expect(links).toHaveLength(2);
  });

  it("um antes da grade e outro depois — não dois no cabeçalho", () => {
    // Dois links colados no topo não resolvem nada e é o jeito mais fácil de
    // este teste passar sem a entrega existir.
    const secao = home.slice(
      home.indexOf("01 — ESTOQUE SELECIONADO"),
      home.indexOf("02 — CONSULTORIA"),
    );
    const grade = secao.indexOf("destaquesSemana.map");
    const posicoes = [...secao.matchAll(/VER OS \{total\} VEÍCULOS/g)].map((m) => m.index!);

    expect(posicoes).toHaveLength(2);
    expect(posicoes[0]).toBeLessThan(grade);
    expect(posicoes[1]).toBeGreaterThan(grade);
  });

  it("os dois dizem o total do estoque, não o das fotos que ele mostra", () => {
    // `destaquesSemana` é um recorte; `total` é a vitrine inteira. Trocar um
    // pelo outro faria o link prometer seis carros.
    expect(home).not.toMatch(/VER OS \{destaquesSemana\.length\}/);
    expect(home).toMatch(/const total = disponiveis\.length|total=\{disponiveis\.length\}|total = disponiveis/);
  });
});
