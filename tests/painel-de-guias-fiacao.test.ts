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
 * declarado NO ARQUIVO — dos 134 arquivos de teste, só este o pede, e os
 * outros 133 continuam em `node`, sem risco.
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

const RESPOSTAS: { get: unknown; getOk: boolean; put: unknown; putOk: boolean } = {
  get: {},
  getOk: true,
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
      if (metodo === "DELETE") {
        return { ok: true, json: async () => ({ cabecalho: { titulo_seo: null, resumo: null } }) };
      }
      return { ok: RESPOSTAS.putOk, json: async () => RESPOSTAS.put };
    }
    return { ok: RESPOSTAS.getOk, json: async () => RESPOSTAS.get };
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

/**
 * Digitar de verdade num campo controlado do React.
 *
 * `entrada.value = "x"` sozinho não funciona: o React guarda o valor anterior
 * no nó e ignora a mudança, então o `onChange` não dispara e o teste mede o
 * estado antigo. O caminho é chamar o setter NATIVO do protótipo — o que o
 * React substituiu — e só então emitir o evento que ele escuta.
 */
function digitar(entrada: HTMLInputElement | HTMLTextAreaElement, texto: string) {
  const proto =
    entrada instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(entrada, texto);
  entrada.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  chamadas = [];
  RESPOSTAS.getOk = true;
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

  it("o GET falhando INTEIRO também trava — e é a porta que faltava", async () => {
    // A quinta porta do mesmo defeito, e a revisão reproduziu o payload: com o
    // GET em 500/403/sessão caída, `carregar()` cai no ramo `ok: false`, os
    // campos ficam em branco, e trocar `setCabecalhoLido(false)` por `true`
    // ali liberava o botão. O clique mandava
    // `PUT {tituloSeo:"", resumo:""}` — apagando o texto do dono e indo ao ar
    // no mesmo request pelo `revalidarCluster`.
    //
    // Os dois casos acima cobrem o GET que RESPONDE dizendo que não leu o
    // cabeçalho; este cobre o GET que não responde nada.
    RESPOSTAS.getOk = false;
    RESPOSTAS.get = { error: "Falha no banco" };
    await montar();

    expect(botao("Salvar cabeçalho").disabled).toBe(true);
    expect(botao("Voltar ao padrão").disabled).toBe(true);
    expect(container.textContent).toContain("Não consegui ler o cabeçalho que está no ar");

    await act(async () => {
      botao("Salvar cabeçalho").click();
    });
    expect(chamadas.filter((c) => c.metodo === "PUT")).toHaveLength(0);
  });
});

describe("digitar chega ao estado, e do estado ao banco", () => {
  it("o que se escreve no campo é o que vai no PUT", async () => {
    // Sem isto, `aoMudar={() => {}}` passava verde: o campo congelava, a
    // entrega inteira que o dono pediu morria, e a suíte não piscava. O arquivo
    // que existe para provar fiação clicava em dois botões e nunca escrevia
    // numa caixa.
    await montar();

    await act(async () => {
      digitar(campo("Título da aba"), "Escrito à mão");
      digitar(campo("Parágrafo de abertura"), "Parágrafo à mão.");
    });

    expect(campo("Título da aba").value).toBe("Escrito à mão");

    await act(async () => {
      botao("Salvar cabeçalho").click();
    });

    const put = chamadas.find((c) => c.metodo === "PUT");
    expect(put!.corpo).toEqual({
      tituloSeo: "Escrito à mão",
      resumo: "Parágrafo à mão.",
    });
  });

  it("o contador acompanha o que está sendo escrito", async () => {
    await montar();

    await act(async () => {
      digitar(campo("Parágrafo de abertura"), "x".repeat(160));
    });

    expect(container.textContent).toContain("160/155 caracteres");
    expect(container.textContent).toContain("a busca pode cortar o fim");
    // Aviso, nunca trava.
    expect(botao("Salvar cabeçalho").disabled).toBe(false);
  });
});

describe("o botão está ligado na função que grava", () => {
  it("clicar manda PUT com SÓ o que foi editado", async () => {
    // Mata `onClick={() => {}}` — botão morto passava verde porque
    // `renderToStaticMarkup` não enxerga `onClick`.
    //
    // E prova o desenho de 07/09 de ponta a ponta: o corpo traz apenas o campo
    // tocado. O título, que ninguém mexeu, não viaja — e o que não viaja não
    // pode ser apagado.
    await montar();

    await act(async () => {
      digitar(campo("Parágrafo de abertura"), "Só o resumo mudou.");
    });
    await act(async () => {
      botao("Salvar cabeçalho").click();
    });

    const put = chamadas.find((c) => c.metodo === "PUT");
    expect(put, "o clique precisa mandar um PUT").toBeDefined();
    expect(put!.url).toContain("/api/guias/secao");
    expect(put!.corpo).toEqual({ resumo: "Só o resumo mudou." });
  });

  it("sem editar nada, o clique não sai — e o botão nem está disponível", async () => {
    await montar();

    expect(botao("Salvar cabeçalho").disabled).toBe(true);
    await act(async () => {
      botao("Salvar cabeçalho").click();
    });

    expect(chamadas.filter((c) => c.metodo === "PUT")).toHaveLength(0);
  });

  it("depois de gravar, a tela mostra o que o servidor confirmou", async () => {
    await montar();
    await act(async () => {
      digitar(campo("Título da aba"), "Novo título");
    });
    await act(async () => {
      botao("Salvar cabeçalho").click();
    });

    expect(campo("Título da aba").value).toBe("gravado");
    expect(container.textContent).toContain("Cabeçalho salvo");
  });

  it("200 sem corpo utilizável trava e não mente", async () => {
    // Gravou, não dá para confirmar o quê: a tela não pode dizer que voltou ao
    // padrão nem limpar os campos.
    RESPOSTAS.put = {};
    await montar();
    await act(async () => {
      digitar(campo("Título da aba"), "Novo título");
    });
    await act(async () => {
      botao("Salvar cabeçalho").click();
    });

    expect(container.textContent).toContain("Recarregue a página");
    expect(container.textContent).not.toContain("no texto padrão");
    // O que a pessoa digitou continua ali.
    expect(campo("Título da aba").value).toBe("Novo título");
  });
});

describe("voltar ao padrão é ação com nome próprio", () => {
  it("pede confirmação e manda DELETE — não um PUT de campos vazios", async () => {
    // O coração da mudança de 07/09. Enquanto apagar era "salvar dois campos
    // vazios", acontecia por acidente sempre que a tela não conseguia ler o que
    // estava no ar. Agora é um verbo separado, e é preciso confirmar.
    RESPOSTAS.get = {
      guias: [],
      regua: [],
      cabecalho: { tituloSeo: "Tem no banco", resumo: "" },
      padrao: { tituloSeo: "Do código", resumo: "Resumo do código" },
      cabecalhoLido: true,
    };
    window.confirm = () => true;
    await montar();

    await act(async () => {
      botao("Voltar ao padrão").click();
    });

    expect(chamadas.filter((c) => c.metodo === "DELETE")).toHaveLength(1);
    expect(chamadas.filter((c) => c.metodo === "PUT")).toHaveLength(0);
    expect(campo("Título da aba").value).toBe("");
    expect(container.textContent).toContain("voltou ao texto padrão");
  });

  it("recusar a confirmação não manda nada", async () => {
    RESPOSTAS.get = {
      guias: [],
      regua: [],
      cabecalho: { tituloSeo: "Tem no banco", resumo: "" },
      padrao: { tituloSeo: "Do código", resumo: "Resumo do código" },
      cabecalhoLido: true,
    };
    window.confirm = () => false;
    await montar();

    await act(async () => {
      botao("Voltar ao padrão").click();
    });

    expect(chamadas.filter((c) => c.metodo === "DELETE")).toHaveLength(0);
    expect(campo("Título da aba").value).toBe("Tem no banco");
  });
});
