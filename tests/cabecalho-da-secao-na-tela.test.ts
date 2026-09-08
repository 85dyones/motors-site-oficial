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
 * Com props, cada combinação é um render, e as decisões da tela passam a ter
 * testemunha.
 *
 * O que essas decisões SÃO mudou em 07/09, por escolha do dono. Elas eram
 * travas de segurança contra apagar o texto do ar; hoje a segurança está na
 * forma da requisição — salvar manda só a diferença, e apagar é um verbo
 * separado. O `disabled` do Salvar virou "há algo para gravar", e o do Voltar
 * ao padrão, "existe override no banco".
 */

const PADRAO = { tituloSeo: "Título do código", resumo: "Resumo do código" };

function bloco(estado: {
  /** O rascunho nos campos. Sem `carregado`, é igual a ele — nada a salvar. */
  cabecalho?: { tituloSeo: string; resumo: string };
  /** O que veio do servidor. A diferença entre os dois é o que se grava. */
  carregado?: { tituloSeo: string; resumo: string };
  salvando?: boolean;
  carregando?: boolean;
  cabecalhoLido: boolean;
}): string {
  return renderToStaticMarkup(
    createElement(CabecalhoDaSecao, {
      cabecalho: estado.cabecalho ?? SEM_CABECALHO,
      carregado: estado.carregado ?? SEM_CABECALHO,
      padrao: PADRAO,
      salvando: estado.salvando ?? false,
      carregando: estado.carregando ?? false,
      cabecalhoLido: estado.cabecalhoLido,
      aoMudar: () => {},
      aoVoltarAoPadrao: () => {},
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

describe("sem ter lido o cabeçalho", () => {
  it("nada a salvar e nada a apagar", () => {
    // Campos vazios porque a leitura falhou: não há diferença para gravar, e
    // não se sabe se existe override para apagar.
    const html = bloco({ cabecalhoLido: false });

    expect(desabilitado(html, "Salvar cabeçalho")).toBe(true);
    expect(desabilitado(html, "Voltar ao padrão")).toBe(true);
  });

  it("o Voltar ao padrão fica travado MESMO com texto digitado", () => {
    // O caso que discrimina: com tudo vazio, "não li" e "não há o que apagar"
    // chegam ao mesmo `disabled`, e trocar uma condição pela outra passaria
    // verde. Aqui há texto no rascunho, então só a falta de leitura pode travar.
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

  it("e o aviso explica o que os campos em branco significam", () => {
    // O texto mudou junto com o desenho: hoje ele não anuncia uma trava, e sim
    // que salvar dali não apaga nada — só o que for digitado é enviado.
    const html = bloco({ cabecalhoLido: false });

    expect(html).toContain("O que você escrever aqui será salvo normalmente");
    expect(html).toContain("os campos que não tocar ficam como estão no site");
  });
});

describe("o Salvar segue a DIFERENÇA, não o estado da leitura", () => {
  const carregado = { tituloSeo: "Do ar", resumo: "Resumo do ar" };

  it("sem nada editado, não há o que salvar", () => {
    // Mudança de desenho em 07/09: o botão deixou de ser trava de segurança e
    // virou sinal de "há algo para gravar". A segurança mora na FORMA da
    // requisição — só o que mudou viaja.
    const html = bloco({ cabecalhoLido: true, cabecalho: carregado, carregado });

    expect(desabilitado(html, "Salvar cabeçalho")).toBe(true);
  });

  it("com um campo editado, libera", () => {
    const html = bloco({
      cabecalhoLido: true,
      carregado,
      cabecalho: { ...carregado, resumo: "Resumo NOVO" },
    });

    expect(desabilitado(html, "Salvar cabeçalho")).toBe(false);
  });

  it("edição SEM leitura também libera — e não apaga nada", () => {
    // O caso que antes era proibido e hoje é seguro: a leitura falhou, os
    // campos vieram vazios, e a pessoa escreve um título. Só esse campo viaja;
    // o resumo, que ela não tocou, fica como está no site.
    const html = bloco({
      cabecalhoLido: false,
      carregado: SEM_CABECALHO,
      cabecalho: { tituloSeo: "Escrevi mesmo sem ler", resumo: "" },
    });

    expect(desabilitado(html, "Salvar cabeçalho")).toBe(false);
  });

  it("mas trava enquanto uma gravação está em curso", () => {
    const html = bloco({
      cabecalhoLido: true,
      carregado,
      cabecalho: { ...carregado, resumo: "NOVO" },
      salvando: true,
    });

    expect(desabilitado(html, "Salvar cabeçalho")).toBe(true);
  });
});

describe("o Voltar ao padrão olha o BANCO, não o rascunho", () => {
  it("sem override gravado, não há o que apagar", () => {
    const html = bloco({ cabecalhoLido: true, carregado: SEM_CABECALHO });

    expect(desabilitado(html, "Voltar ao padrão")).toBe(true);
  });

  it("com override gravado, libera", () => {
    const html = bloco({
      cabecalhoLido: true,
      carregado: { tituloSeo: "", resumo: "tem no banco" },
    });

    expect(desabilitado(html, "Voltar ao padrão")).toBe(false);
  });

  it("texto só no RASCUNHO não habilita — ainda não está no ar", () => {
    // O que discrimina: apagar age sobre o banco. Se a pessoa digitou e não
    // salvou, não existe override para apagar.
    const html = bloco({
      cabecalhoLido: true,
      carregado: SEM_CABECALHO,
      cabecalho: { tituloSeo: "só digitei", resumo: "" },
    });

    expect(desabilitado(html, "Voltar ao padrão")).toBe(true);
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
