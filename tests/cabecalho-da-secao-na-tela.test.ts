import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CabecalhoDaSecao from "../src/components/admin/CabecalhoDaSecao";
import { SEM_CABECALHO } from "../src/lib/salvarCabecalho";

/**
 * O bloco de edição do cabeçalho, com o estado vindo por PROPS.
 *
 * Nasce da quarta rodada de revisão, e o motivo é preciso: enquanto o bloco
 * vivia dentro do `EditorDeGuias`, as travas eram INALCANÇÁVEIS. O componente
 * escolhe o estado por `useState`, e no render de servidor `carregando` nasce
 * `true` — então os dois botões saem desabilitados de qualquer jeito, e apagar
 * a guarda de `cabecalhoLido` do `disabled` deixava a suíte inteira verde.
 *
 * A premissa que eu tinha escrito para não tentar também era falsa, e a revisão
 * mediu: `disabled` APARECE em `renderToStaticMarkup`. O que não aparece é
 * `onClick`.
 *
 * Com props, cada combinação é um render, e a trava que impede apagar o texto
 * do dono passa a ter testemunha.
 */

const PADRAO = { tituloSeo: "Título do código", resumo: "Resumo do código" };

function bloco(estado: {
  cabecalho?: { tituloSeo: string; resumo: string };
  salvando?: boolean;
  carregando?: boolean;
  cabecalhoLido: boolean;
}): string {
  return renderToStaticMarkup(
    createElement(CabecalhoDaSecao, {
      cabecalho: estado.cabecalho ?? SEM_CABECALHO,
      padrao: PADRAO,
      salvando: estado.salvando ?? false,
      carregando: estado.carregando ?? false,
      cabecalhoLido: estado.cabecalhoLido,
      aoMudar: () => {},
      aoLimpar: () => {},
      aoSalvar: () => {},
    }),
  );
}

/**
 * O botão está desabilitado?
 *
 * Pergunta pelo ATRIBUTO, e não por `toContain("disabled")` — que foi como eu
 * escrevi primeiro e ficou vermelho no caminho feliz: a classe do botão contém
 * `disabled:opacity-40`, a variante do Tailwind, então a substring casa mesmo
 * com o botão liberado. O React serializa o atributo como `disabled=""`.
 */
function desabilitado(html: string, rotulo: string): boolean {
  const achado = [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].find((m) =>
    m[1].includes(rotulo),
  );
  expect(achado, `o bloco precisa ter o botão "${rotulo}"`).toBeDefined();
  const tag = achado![0].slice(0, achado![0].indexOf(">") + 1);
  return /\sdisabled=""/.test(tag);
}

describe("sem ter lido o cabeçalho, a tela não grava", () => {
  it("os dois botões saem desabilitados", () => {
    // É a trava contra apagar o que está no ar: o PUT substitui a linha
    // inteira, e campo em branco aqui significa "não sei", não "não tem".
    const html = bloco({ cabecalhoLido: false });

    expect(desabilitado(html, "Salvar cabeçalho")).toBe(true);
    expect(desabilitado(html, "Voltar ao padrão")).toBe(true);
  });

  it("o Voltar ao padrão fica travado MESMO com texto no campo", () => {
    // O caso que discrimina, e sem ele a trava do Limpar não tinha mutante:
    // com os campos vazios, "não li" e "não há o que limpar" chegam ao mesmo
    // `disabled`, e trocar uma condição pela outra passava verde. Aqui há texto
    // digitado, então só a falta de leitura pode travar.
    const html = bloco({ cabecalhoLido: false, cabecalho: { tituloSeo: "digitei", resumo: "" } });

    expect(desabilitado(html, "Voltar ao padrão")).toBe(true);
  });

  it("e a tela diz POR QUE, em vez de só ficar cinza", () => {
    // Botão desabilitado sem explicação é pior que botão que apaga: quem não
    // sabe recarrega, tenta de novo, e conclui que o painel quebrou.
    const html = bloco({ cabecalhoLido: false });

    expect(html).toContain("Não consegui ler o cabeçalho que está no ar");
    expect(html).toContain("não porque a seção esteja sem texto");
  });

  it("enquanto carrega, o aviso NÃO aparece — ainda não é falha", () => {
    // Durante a carga o estado normal é "ainda não sei". Mostrar o aviso ali
    // gritaria erro em toda abertura de tela.
    const html = bloco({ cabecalhoLido: false, carregando: true });

    expect(html).not.toContain("Não consegui ler o cabeçalho");
    expect(desabilitado(html, "Salvar cabeçalho")).toBe(true);
  });
});

describe("tendo lido, a tela grava", () => {
  it("o Salvar libera", () => {
    expect(desabilitado(bloco({ cabecalhoLido: true }), "Salvar cabeçalho")).toBe(false);
  });

  it("mas trava enquanto uma gravação está em curso", () => {
    expect(desabilitado(bloco({ cabecalhoLido: true, salvando: true }), "Salvar cabeçalho")).toBe(
      true,
    );
  });

  it("o Voltar ao padrão só libera se houver o que limpar", () => {
    const vazio = bloco({ cabecalhoLido: true, cabecalho: SEM_CABECALHO });
    expect(desabilitado(vazio, "Voltar ao padrão")).toBe(true);

    const cheio = bloco({ cabecalhoLido: true, cabecalho: { tituloSeo: "", resumo: "tem" } });
    expect(desabilitado(cheio, "Voltar ao padrão")).toBe(false);
  });
});

describe("o campo em branco não parece página sem texto", () => {
  it("o texto do código vira sugestão nos dois campos", () => {
    const html = bloco({ cabecalhoLido: true });

    expect(html).toContain(`placeholder="${PADRAO.tituloSeo}"`);
    expect(html).toContain(`placeholder="${PADRAO.resumo}"`);
  });
});

describe("o contador da régua da busca", () => {
  it("conta o que está escrito", () => {
    const html = bloco({ cabecalhoLido: true, cabecalho: { tituloSeo: "", resumo: "abc" } });

    expect(html).toContain("3/155 caracteres");
  });

  it("avisa quando passa, sem impedir", () => {
    // Aviso, nunca trava: quem decide o texto é quem escreve. Recusar por três
    // caracteres seria pior que uma description cortada no SERP.
    const longo = "x".repeat(160);
    const html = bloco({ cabecalhoLido: true, cabecalho: { tituloSeo: "", resumo: longo } });

    expect(html).toContain("160/155 caracteres");
    expect(html).toContain("a busca pode cortar o fim");
    expect(desabilitado(html, "Salvar cabeçalho")).toBe(false);
  });
});
