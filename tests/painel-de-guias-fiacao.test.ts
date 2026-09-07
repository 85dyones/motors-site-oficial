// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * A FIAÇÃO do painel — o que quatro rodadas de revisão não alcançaram.
 *
 * A história vale mais que o arquivo. O defeito era destrutivo (um clique
 * apagava o texto do dono), e ele foi fechado por partes: a leitura, a
 * resposta do servidor, a decisão de habilitar, o caminho de escrita. Cada
 * peça virou função pura com teste. E a cada rodada a revisão mostrava a
 * mesma coisa por outra porta:
 *
 *   extrair para função pura PROVA a função. Não prova que alguém a usa.
 *
 * `renderToStaticMarkup` não resolve isso: `onClick` não vira texto, e no
 * render de servidor o estado inicial (`carregando = true`) desabilita tudo,
 * então nenhuma combinação exercitava as guardas. As mutações
 * `setCabecalhoLido(true)` e `onClick={() => {}}` passavam verdes na suíte
 * inteira.
 *
 * `jsdom` entrou em 07/09 por decisão do dono, exatamente para fechar isto.
 * O `vitest.config.ts` já o antecipava por escrito ("testes de componente vão
 * precisar de `environment: jsdom` — adicionar quando chegarem"). O ambiente é
 * declarado NO ARQUIVO, então os outros 132 continuam em `node`, sem risco.
 *
 * Aqui nada é mockado do lado do app: o componente de verdade, a lib de
 * verdade, e só o `fetch` é dublê. É o que torna a fiação observável.
 */

/**
 * Sem esta linha o React avisa "not configured to support act(...)" e o `act`
 * NÃO espera os efeitos — os testes passavam mesmo assim, que é o pior dos
 * mundos: verde sem garantia de que a carga terminou antes da asserção.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RESPOSTAS: { get: unknown; put: unknown; putOk: boolean } = {
  get: {},
  put: {},
  putOk: true,
};
let chamadas: { url: string; metodo: string; corpo?: unknown }[] = [];

function dublarFetch() {
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    const metodo = opcoes?.method ?? "GET";
    chamadas.push({
      url,
      metodo,
      corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined,
    });
    if (String(url).includes("/api/guias/secao")) {
      return { ok: RESPOSTAS.putOk, json: async () => RESPOSTAS.put };
    }
    return { ok: true, json: async () => RESPOSTAS.get };
  }) as never;
}

let container: HTMLDivElement;
let root: Root;

async function montar() {
  const { default: EditorDeGuias } = await import("../src/components/admin/EditorDeGuias");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  // `act` espera o efeito, o `fetch` e o re-render — sem ele a asserção corre
  // antes de a carga terminar e mede a tela em branco.
  await act(async () => {
    root.render(createElement(EditorDeGuias, {}));
  });
}

/** O botão pelo rótulo, para clicar de verdade. */
function botao(rotulo: string): HTMLButtonElement {
  const achado = [...container.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").includes(rotulo),
  );
  expect(achado, `a tela precisa ter o botão "${rotulo}"`).toBeDefined();
  return achado as HTMLButtonElement;
}

function campo(rotulo: string): HTMLInputElement | HTMLTextAreaElement {
  const label = [...container.querySelectorAll("label")].find((l) =>
    (l.textContent ?? "").includes(rotulo),
  );
  expect(label, `a tela precisa ter o campo "${rotulo}"`).toBeDefined();
  const entrada = label!.querySelector("input, textarea");
  expect(entrada, `o campo "${rotulo}" precisa ter entrada`).not.toBeNull();
  return entrada as HTMLInputElement | HTMLTextAreaElement;
}

beforeEach(() => {
  chamadas = [];
  RESPOSTAS.putOk = true;
  RESPOSTAS.put = { cabecalho: { titulo_seo: "gravado", resumo: "gravado" } };
  RESPOSTAS.get = {
    guias: [],
    regua: [],
    cabecalho: { tituloSeo: "Do banco", resumo: "Resumo do banco" },
    padrao: { tituloSeo: "Do código", resumo: "Resumo do código" },
    cabecalhoLido: true,
  };
  dublarFetch();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("a carga preenche os campos com o que veio do servidor", () => {
  it("o gravado vai para o valor e o padrão vira sugestão", async () => {
    await montar();

    // Mata a mutação que apagava `setCabecalho(r.cabecalho)` e
    // `setPadrao(r.padrao)` — ela passava verde em toda a suíte.
    expect(campo("Título da aba").value).toBe("Do banco");
    expect(campo("Parágrafo de abertura").value).toBe("Resumo do banco");
    expect(campo("Título da aba").placeholder).toBe("Do código");
    expect(campo("Parágrafo de abertura").placeholder).toBe("Resumo do código");
  });
});

describe("o servidor dizendo que NÃO leu trava a tela", () => {
  it("os botões ficam mortos e o aviso aparece", async () => {
    // A mutação `setCabecalhoLido(true)` restaurava o defeito com uma palavra,
    // debaixo do comentário que diz "E NÃO `true`". Aqui ela morre.
    RESPOSTAS.get = { guias: [], regua: [], cabecalho: null, cabecalhoLido: false };
    await montar();

    expect(botao("Salvar cabeçalho").disabled).toBe(true);
    expect(botao("Voltar ao padrão").disabled).toBe(true);
    expect(container.textContent).toContain("Não consegui ler o cabeçalho que está no ar");
  });

  it("e nenhum clique escapa: o PUT não sai", async () => {
    RESPOSTAS.get = { guias: [], regua: [], cabecalho: null, cabecalhoLido: false };
    await montar();

    await act(async () => {
      botao("Salvar cabeçalho").click();
    });

    expect(chamadas.filter((c) => c.metodo === "PUT")).toHaveLength(0);
  });
});

describe("o botão está ligado na função que grava", () => {
  it("clicar manda PUT com o que está nos campos", async () => {
    // Mata `onClick={() => {}}` — o botão morto que passava verde por
    // `renderToStaticMarkup` não enxergar `onClick`.
    await montar();

    await act(async () => {
      botao("Salvar cabeçalho").click();
    });

    const put = chamadas.find((c) => c.metodo === "PUT");
    expect(put, "o clique precisa mandar um PUT").toBeDefined();
    expect(put!.url).toContain("/api/guias/secao");
    expect(put!.corpo).toEqual({ tituloSeo: "Do banco", resumo: "Resumo do banco" });
  });

  it("depois de gravar, a tela mostra o que o servidor confirmou", async () => {
    await montar();
    await act(async () => {
      botao("Salvar cabeçalho").click();
    });

    expect(campo("Título da aba").value).toBe("gravado");
    expect(container.textContent).toContain("Cabeçalho salvo");
  });

  it("200 sem corpo utilizável trava a tela em vez de mentir", async () => {
    // O B13, agora provado ponta a ponta: gravou, não dá para confirmar o quê,
    // e a tela NÃO pode dizer "de volta ao texto padrão" nem limpar os campos.
    RESPOSTAS.put = {};
    await montar();
    await act(async () => {
      botao("Salvar cabeçalho").click();
    });

    expect(container.textContent).toContain("Recarregue a página");
    expect(container.textContent).not.toContain("de volta ao texto padrão");
    // O que a pessoa digitou continua ali.
    expect(campo("Título da aba").value).toBe("Do banco");
    // E a tela travou: sem saber o que está no ar, salvar de novo apagaria.
    expect(botao("Salvar cabeçalho").disabled).toBe(true);
  });
});

describe("o Voltar ao padrão limpa a tela, e não grava sozinho", () => {
  it("esvazia os campos sem mandar PUT", async () => {
    await montar();

    await act(async () => {
      botao("Voltar ao padrão").click();
    });

    expect(campo("Título da aba").value).toBe("");
    expect(campo("Parágrafo de abertura").value).toBe("");
    // A primeira versão do docblock dizia que ele "grava pela mesma rota".
    // Não grava: quem grava é o Salvar em seguida.
    expect(chamadas.filter((c) => c.metodo === "PUT")).toHaveLength(0);
  });
});
