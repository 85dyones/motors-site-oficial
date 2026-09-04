import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Veiculo } from "../src/types";
import { getVeiculoPdpUrl } from "../src/lib/supabase";
import { nomeComAno } from "../src/lib/nomeDoVeiculo";
import { schemaDeListagem } from "../src/lib/schemaListagem";
import {
  FILTROS_PARA_LIMPAR_TUDO,
  indiceDaVitrine,
  mostrarLimparTudo,
  painelDeFiltro,
  SO_NO_CELULAR,
  vitrineTemFichas,
} from "../src/lib/vitrine";
import IndiceDaVitrine from "../src/components/modernist/IndiceDaVitrine";
import { lerCodigo } from "./fonte";

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
      /onClick=\{limparTudoSemPerderOFoco\}[\s\S]{0,300}\$\{filtro\.classeDoBotao\}/,
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
    expect(fonte).toMatch(/onClick=\{limparTudoSemPerderOFoco\}/);
    expect(fonte).toContain("limparTudo();");
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
    for (const handler of ["fecharFiltro", "limparTudoSemPerderOFoco"]) {
      expect(fonte).toMatch(
        new RegExp(`const ${handler} = \\(\\) => \\{[^}]*botaoDoFiltro\\.current\\?\\.focus\\(\\)`),
      );
    }
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
