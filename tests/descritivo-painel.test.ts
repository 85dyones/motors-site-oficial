// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SugestaoDeTexto } from "../src/components/admin/SugestaoDeTexto";
import { SugestaoDeLaudoPadrao } from "../src/components/admin/SugestaoDeLaudoPadrao";
import { LAUDO_APROVADO_PADRAO } from "../src/lib/descritivo/laudoPadrao";
import EditorDeVeiculo from "../src/components/admin/EditorDeVeiculo";

/**
 * A FIAÇÃO do painel de sugestão.
 *
 * O que este arquivo guarda não é o texto na tela: é que a sugestão **não
 * chega ao campo sozinha**. Com 62 veículos ainda no blurb institucional, o
 * botão sempre encontra texto escrito, e trocar sem a pessoa mandar apagaria
 * trabalho de alguém.
 *
 * Só o `fetch` é dublê — o componente é o de verdade. Extrair para função pura
 * prova a função, não prova que alguém a usa; é preciso montar o componente e
 * clicar.
 *
 * Sem `IS_REACT_ACT_ENVIRONMENT` o React avisa e o `act` NÃO espera os
 * efeitos: os testes passam mesmo assim, que é o pior dos mundos.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let chamadas: { url: string; metodo: string; corpo?: unknown }[] = [];
let RESPOSTA: { ok: boolean; status: number; corpo: unknown } = {
  ok: true,
  status: 200,
  corpo: { texto: "Texto sugerido.", caracteres: 15 },
};

function dublarFetch() {
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    chamadas.push({
      url: String(url),
      metodo: opcoes?.method ?? "GET",
      corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined,
    });
    return { ok: RESPOSTA.ok, status: RESPOSTA.status, json: async () => RESPOSTA.corpo };
  }) as unknown as typeof fetch;
}

let container: HTMLDivElement;
let root: Root;
const fetchOriginal = globalThis.fetch;

beforeEach(() => {
  chamadas = [];
  RESPOSTA = { ok: true, status: 200, corpo: { texto: "Texto sugerido.", caracteres: 15 } };
  dublarFetch();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.fetch = fetchOriginal;
});

function montar(onUsar: (t: string) => void = () => {}) {
  act(() => {
    root.render(createElement(SugestaoDeTexto, { veiculoId: 7803195, campo: "descricao_seo", onUsar }));
  });
}

/** Acha o botão pelo texto visível — é assim que a pessoa o encontra. */
function botao(trecho: string): HTMLButtonElement {
  const achado = Array.from(container.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").toLowerCase().includes(trecho.toLowerCase()),
  );
  if (!achado) throw new Error(`Botão "${trecho}" não está na tela. Botões: ${Array.from(container.querySelectorAll("button")).map((b) => b.textContent).join(" | ")}`);
  return achado as HTMLButtonElement;
}

async function clicar(b: HTMLButtonElement) {
  await act(async () => {
    b.click();
  });
}

const naTela = () => container.textContent ?? "";

describe("SugestaoDeTexto", () => {
  it("não chama o gerador antes do clique", () => {
    montar();
    expect(chamadas).toEqual([]);
  });

  it("chama a rota do veículo com o campo pedido", async () => {
    montar();
    await clicar(botao("gerar"));
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].url).toBe("/api/estoque/7803195/descritivo");
    expect(chamadas[0].metodo).toBe("POST");
    expect(chamadas[0].corpo).toEqual({ campo: "descricao_seo" });
  });

  it("mostra o texto e a contagem depois de gerar", async () => {
    RESPOSTA = { ok: true, status: 200, corpo: { texto: "Honda NXR 160 Bros 2022.", caracteres: 24 } };
    montar();
    await clicar(botao("gerar"));
    expect(naTela()).toContain("Honda NXR 160 Bros 2022.");
    expect(naTela()).toContain("24 caracteres");
  });

  /** O invariante do desenho: o campo não muda até a pessoa mandar. */
  it("só entrega o texto ao campo quando a pessoa manda", async () => {
    const usado: string[] = [];
    montar((t) => usado.push(t));
    await clicar(botao("gerar"));
    expect(usado).toEqual([]);
    await clicar(botao("usar este texto"));
    expect(usado).toEqual(["Texto sugerido."]);
  });

  it("mostra o motivo quando falta a chave, em vez de ficar inerte", async () => {
    RESPOSTA = { ok: false, status: 503, corpo: { error: "Gerador indisponível: falta OPENAI_API_KEY nas variáveis de ambiente." } };
    montar();
    await clicar(botao("gerar"));
    expect(naTela()).toContain("OPENAI_API_KEY");
  });

  it("mostra cada motivo quando o texto reprova na conferência", async () => {
    RESPOSTA = {
      ok: false, status: 422,
      corpo: { error: "O texto gerado não passou na conferência.", motivos: [{ regra: "vocabulário", motivo: "Usa palavra barrada." }] },
    };
    montar();
    await clicar(botao("gerar"));
    expect(naTela()).toContain("Usa palavra barrada.");
  });

  it("não oferece 'usar este texto' quando a geração falhou", async () => {
    RESPOSTA = { ok: false, status: 502, corpo: { error: "A OpenAI recusou a chamada" } };
    montar();
    await clicar(botao("gerar"));
    expect(() => botao("usar este texto")).toThrow();
  });

  it("avisa na tela que a conferência não pega troca de campo", async () => {
    montar();
    await clicar(botao("gerar"));
    expect(naTela().toLowerCase()).toContain("troca de campo");
  });

  /**
   * Até 09/09/2026 a rota devolvia `periciaAprovada` e o painel imprimia
   * "Pode afirmar" / "Não afirma perícia aprovada" ao lado do texto — uma
   * FALSA GARANTIA, porque dizia ter conferido justamente o eixo que vazou
   * quatro vezes seguidas (ver o docblock de MENCIONA_PERICIA em
   * validacao.ts). Com o texto proibido de tocar no assunto, a linha perdeu
   * o objeto: `periciaAprovada` saiu da resposta da rota, e este teste tranca
   * a ausência para a linha não voltar em silêncio.
   */
  it("não imprime mais a linha de pode/não afirma perícia aprovada", async () => {
    montar();
    await clicar(botao("gerar"));
    expect(naTela().toLowerCase()).not.toContain("afirma perícia aprovada");
  });
});

/**
 * O painel do campo "Laudo cautelar" — sem IA, sem `fetch`, sem estado de
 * carregamento. A frase está pronta no primeiro render; só falta provar que
 * ela aparece (ou não) e que "usar" nunca dispara sozinho.
 *
 * C1 do portão de qualidade (09/09/2026): a versão anterior do ramo sem
 * perícia aprovada afirmava "este campo fica vazio quando a perícia não está
 * aprovada" e oferecia um botão "Limpar" quando já havia texto — as duas
 * coisas desfaziam a migração `20260901120000_laudo_cautelar_texto_padrao`,
 * que preencheu `laudo_pericia` de propósito em toda linha vazia, aprovada
 * ou não, e cuja escrita não tem volta pelo caminho normal (a allowlist do
 * sync não inclui `laudo_pericia`). Os testes abaixo agora travam a AUSÊNCIA
 * de qualquer botão de escrita ou limpeza nesse ramo — não mais a presença
 * condicional de "limpar".
 */
describe("SugestaoDeLaudoPadrao", () => {
  function montarLaudo(pericia: string | null, onUsar: (t: string) => void = () => {}) {
    act(() => {
      root.render(createElement(SugestaoDeLaudoPadrao, { pericia, onUsar }));
    });
  }

  it("perícia aprovada: oferece a frase padrão e um botão para usá-la", () => {
    montarLaudo("Aprovado");
    expect(naTela()).toContain(LAUDO_APROVADO_PADRAO);
    expect(() => botao("usar este texto")).not.toThrow();
  });

  it("a frase entregue ao clicar é exatamente a constante — nada de paráfrase", async () => {
    const usados: string[] = [];
    montarLaudo("Aprovado", (t) => usados.push(t));
    await clicar(botao("usar este texto"));
    expect(usados).toEqual([LAUDO_APROVADO_PADRAO]);
  });

  it("perícia em análise: NÃO oferece botão nenhum — nem preencher, nem limpar", () => {
    montarLaudo("Em análise");
    expect(() => botao("usar este texto")).toThrow();
    expect(() => botao("limpar")).toThrow();
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("perícia em análise: a nota explica que o padrão já está preenchido e que preencher não é exibir", () => {
    montarLaudo("Em análise");
    const tela = naTela().toLowerCase();
    expect(tela).toContain("desde 01/09 quase todo veículo já tem um texto padrão");
    expect(tela).toContain("preencher não é exibir");
  });

  it("perícia em análise: não afirma mais que o campo 'fica vazio' — isso deixou de ser verdade em 01/09", () => {
    montarLaudo("Em análise");
    expect(naTela().toLowerCase()).not.toContain("fica vazio quando a perícia não está aprovada");
  });

  it("perícia aprovada NÃO oferece limpar — o caminho ali é 'usar', nunca apagar", () => {
    montarLaudo("Aprovado");
    expect(() => botao("limpar")).toThrow();
  });
});

/**
 * A guarda dos dois botões, medida PELO EDITOR.
 *
 * O bloco acima monta `SugestaoDeTexto` direto, e por isso não alcança o que
 * governa quem o vê: os dois painéis estão atrás de `podeGravar("descricao")` e
 * `podeGravar("descricao_seo")` em `EditorDeVeiculo`. Montar o componente
 * filho prova o componente, não prova a fiação — apagar as duas guardas deixava
 * a suíte inteira verde e entregava o gerador a quem a matriz A17 nega o campo.
 *
 * `descricao` e `descricao_seo` estão na linha "Editar opcionais e destaques
 * rápidos": Admin, Marketing e Comercial FAZEM; Gestor e Financeiro não veem.
 * Marketing é o dono natural do texto, e é ele que abre esta aba.
 *
 * A aba "Texto e SEO" aparece para os dois perfis — o que muda é o que ela
 * desenha —, então o teste clica nela antes de contar.
 */
describe("os dois painéis, atrás da permissão do editor", () => {
  const VEICULO = {
    id: 7803195,
    marca: "bmw",
    modelo: "x1",
    versao: "sdrive 20i",
    ano_fabricacao: 2021,
    ano_modelo: 2022,
    preco: 179900,
    estado_cadastro: "publicado",
    origem: "revendamais",
    whatsapp_images: [],
  };

  async function abrirAbaDeTexto(perfil: string[]) {
    await act(async () => {
      root.render(
        createElement(EditorDeVeiculo as never, {
          inicial: VEICULO as never,
          visitas30Dias: null,
          perfil: perfil as never,
        }),
      );
    });
    await clicar(botao("texto e seo"));
  }

  /** Um por campo — o texto do botão é o mesmo nos dois, então conta-se. */
  const paineisDeSugestao = () =>
    Array.from(container.querySelectorAll("button")).filter((b) =>
      (b.textContent ?? "").toLowerCase().includes("gerar sugestão"),
    );

  it("marketing vê os dois — um para cada campo de texto", async () => {
    await abrirAbaDeTexto(["marketing"]);
    expect(paineisDeSugestao()).toHaveLength(2);
  });

  it("gestor não vê nenhum", async () => {
    await abrirAbaDeTexto(["gestor"]);
    expect(paineisDeSugestao()).toHaveLength(0);
    // Controle: a aba ABRIU. Sem isto, um zero por aba fechada passaria por
    // guarda funcionando, e a guarda poderia estar apagada.
    expect(naTela()).toContain("Descrição editorial");
  });

  /**
   * O terceiro painel — `SugestaoDeLaudoPadrao` — está atrás da MESMA régua,
   * `podeGravar("laudo_pericia")`, que fica na mesma linha da matriz A17 que
   * `descricao`/`descricao_seo` ("Editar opcionais e destaques rápidos").
   *
   * O `VEICULO` da fixture não tem `pericia`, então `formatPericia("")` cai
   * em "EM ANÁLISE" — o painel, quando visível, mostra o ramo da nota (não o
   * da frase pronta). É esse texto que serve de sinal de presença aqui: não
   * há botão "gerar" neste painel para contar como nos outros dois.
   */
  it("marketing vê também o painel do laudo padrão", async () => {
    await abrirAbaDeTexto(["marketing"]);
    expect(naTela().toLowerCase()).toContain("preencher não é exibir");
  });

  it("gestor não vê o painel do laudo padrão", async () => {
    await abrirAbaDeTexto(["gestor"]);
    expect(naTela().toLowerCase()).not.toContain("preencher não é exibir");
  });
});
