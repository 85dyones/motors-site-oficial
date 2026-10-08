// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  DESCANSO_PADRAO,
  DIAS_DO_INTERESSE_RECENTE,
  MENSAGEM_PADRAO,
  MENSAGEM_PADRAO_DE_TROCA,
  MENSAGEM_PADRAO_SEM_CARRO,
  PARTES_MAXIMAS,
  RODAPE_DE_SAIDA,
  ROTULO_DO_SINAL,
  SINAIS_DE_AFINIDADE,
  CRITERIOS_DE_CARRO,
  CRITERIOS_DE_PERFIL,
  lerPedidoDeCampanha,
  montarMensagem,
  precoNoSms,
  tamanhoDoSms,
  type CampanhaDeSmsDetalhada,
  type CarroDaCampanha,
  type EnvioNaTela,
  type PreviaDaCampanha,
  type RespostaDoLote,
  type ResumoDaCampanha,
} from "../src/lib/smsCampanhas";
import { SITE_HOST } from "../src/lib/site";

/**
 * As telas de Campanhas de SMS montadas de verdade (07/10/2026): só o `fetch`,
 * o `next/navigation`, o `next/link` e o diálogo são dublados.
 *
 * O que só a fiação prova: a prévia que a pessoa lê é a mensagem que sai
 * (mesma `montarMensagem`); criar não envia; o envio pede confirmação e anda
 * em lotes até a fila zerar ou o fornecedor avisar; e nenhum telefone inteiro
 * chega ao HTML.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const push = vi.fn();
const refresh = vi.fn();
let confirma = true;
const confirm = vi.fn(async (opcoes: unknown) => (opcoes ? confirma : false));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) => createElement("a", { href, ...resto } as never, children as never),
}));
vi.mock("../src/components/admin/ConfirmDialog", () => ({ useConfirm: () => ({ confirm }) }));

const CARROS: CarroDaCampanha[] = [
  { id: 11, rotulo: "Jeep Compass Longitude 2021", preco: 129900 },
  { id: 12, rotulo: "Citroën C4 Cactus 2022", preco: 89900 },
];

const PREVIA: PreviaDaCampanha = {
  veiculoRotulo: "Citroën C4 Cactus 2022",
  camadas: [],
  faixasDeMatch: [],
  amostra: [],
  destinatarios: 42,
  fora: { semCelular: 3, saiuDaLista: 1, jaComprou: 2, desistiu: 0, descartado: 0, semInteresse: 4, descanso: 5, repetido: 0 },
  exemplo: "Maria, o Citroen C4 Cactus 2022…",
  tamanho: { caracteres: 140, partes: 1, unicode: false },
  precoPorParte: 0.09,
  custoEstimado: 3.78,
};

/** A prévia de uma campanha por carro: as camadas, as faixas de match e a amostra. */
const PREVIA_COM_LEADS: PreviaDaCampanha = {
  ...PREVIA,
  camadas: [
    { criterio: "mesmo_veiculo", pessoas: 42 },
    { criterio: "mesmo_modelo", pessoas: 120 },
    { criterio: "mesma_marca", pessoas: 300 },
    { criterio: "faixa_de_preco", pessoas: 150 },
  ],
  faixasDeMatch: [
    { match: 100, pessoas: 30 },
    { match: 80, pessoas: 12 },
  ],
  amostra: [
    { primeiroNome: "Ana", telefoneMascarado: "(41) 9••••-0001", match: 100, olhou: "Citroën C4 Cactus", quando: "2026-10-01T15:00:00Z" },
    { primeiroNome: "Bruno", telefoneMascarado: "(41) 9••••-0002", match: 80, olhou: null, quando: "2026-07-01T15:00:00Z" },
    // O que o servidor NÃO manda; se mandar, a tela não escreve.
    { primeiroNome: "Carla Souza", telefoneMascarado: "5541999990003", match: 80, olhou: "Citroën C3", quando: "2026-06-01T15:00:00Z" },
  ],
};

let chamadas: Array<{ url: string; metodo: string; corpo: unknown }>;
/** As respostas por rota, na ordem. A última se repete. */
let respostas: Record<string, Array<{ status: number; corpo: unknown }>>;
let container: HTMLDivElement;
let root: Root;

function dublarFetch() {
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    chamadas.push({ url, metodo: opcoes?.method ?? "GET", corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : null });
    const fila = respostas[url] ?? [{ status: 404, corpo: { error: "Rota não dublada." } }];
    const r = fila.length > 1 ? fila.shift()! : fila[0];
    return { ok: r.status < 400, status: r.status, json: async () => r.corpo };
  }) as never;
}

const esperar = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

async function montar(componente: unknown, props: Record<string, unknown>) {
  dublarFetch();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(componente as never, props as never));
  });
  await esperar();
}

const q = <T extends Element = HTMLElement>(seletor: string) => container.querySelector(seletor) as T;

/** O React só ouve a mudança de `value` feita pelo setter nativo. */
async function digitar(el: HTMLInputElement | HTMLTextAreaElement, valor: string) {
  const prototipo = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototipo, "value")!.set!.call(el, valor);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function escolherCarro(id: number) {
  const campo = q<HTMLSelectElement>("[data-carro-da-campanha]");
  await act(async () => {
    campo.value = String(id);
    campo.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function clicar(el: Element | null | undefined) {
  expect(el, "o elemento a clicar existe").toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await esperar();
}

beforeEach(() => {
  chamadas = [];
  respostas = {};
  confirma = true;
  push.mockClear();
  refresh.mockClear();
  confirm.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

// ─────────────────────────────────────────────────────────────────────────────
// O formulário
// ─────────────────────────────────────────────────────────────────────────────

describe("o formulário de nova campanha", () => {
  async function formulario(props: Record<string, unknown> = {}) {
    const { default: NovaCampanhaDeSms } = await import("../src/components/marketing/sms/NovaCampanhaDeSms");
    await montar(NovaCampanhaDeSms, { carros: CARROS, ...props });
  }
  const criar = () => q<HTMLButtonElement>("[data-criar-campanha]");
  const calcular = () => q<HTMLButtonElement>("[data-calcular-publico]");
  const molde = () => q<HTMLTextAreaElement>("[data-molde-da-mensagem]");

  it("a prévia ao vivo é a `montarMensagem` do envio: sem acento e com o rodapé de saída", async () => {
    await formulario();
    expect(q("[data-como-chega]")).toBeNull();
    expect(q("[data-como-chega-vazio]")).toBeTruthy();
    await escolherCarro(12);
    const texto = q("[data-como-chega]").textContent!;
    const esperado = montarMensagem(MENSAGEM_PADRAO, {
      nome: "Maria",
      carro: "Citroën C4 Cactus 2022",
      preco: precoNoSms(89900),
      link: `${SITE_HOST}/s/abc2345`,
    });
    expect(texto).toBe(esperado);
    expect(texto).toContain(RODAPE_DE_SAIDA);
    expect(texto).toContain("Citroen C4 Cactus");
    expect(texto).not.toMatch(/[áàâãéêíóôõúç]/i);
    expect(texto).toContain("R$ 89.900");
    // Nada fora do alfabeto do SMS: o preço não leva espaço inseparável.
    expect(tamanhoDoSms(texto).unicode).toBe(false);
    const medida = tamanhoDoSms(texto);
    expect(q("[data-tamanho-da-mensagem]").textContent).toContain(`${medida.caracteres} caracteres`);
  });

  it("o filtro de carros reduz a lista, e os botões de variável escrevem no molde", async () => {
    await formulario();
    await digitar(q<HTMLInputElement>("[data-busca-de-carro]"), "citroen");
    const opcoes = [...q<HTMLSelectElement>("[data-carro-da-campanha]").options].map((o) => o.value);
    expect(opcoes).toEqual(["", "12"]);
    await digitar(molde(), "Oi ");
    await clicar(q("[data-variavel='{link}']"));
    expect(molde().value).toContain("{link}");
  });

  it("acima de uma parte avisa o custo por destinatário; acima do máximo, bloqueia", async () => {
    await formulario();
    await escolherCarro(11);
    expect(q("[data-aviso-da-mensagem]")).toBeNull();

    await digitar(molde(), `${"a".repeat(170)} {link}`);
    const aviso = q("[data-aviso-da-mensagem='partes']");
    expect(aviso.textContent).toContain("Cada destinatário custa 2 SMS");
    // Forma e rótulo, e não só cor.
    expect(aviso.querySelector("svg[data-estado='atencao']")).toBeTruthy();
    expect(aviso.textContent).toContain("Atenção");
    expect(calcular().disabled).toBe(false);

    await digitar(molde(), `${"a".repeat(153 * PARTES_MAXIMAS)} {link}`);
    const bloqueio = q("[data-aviso-da-mensagem='longa-demais']");
    expect(bloqueio.textContent).toContain("Bloqueado");
    expect(bloqueio.querySelector("svg[data-estado='impeditivo']")).toBeTruthy();
    expect(q("[data-aviso-da-mensagem='partes']")).toBeNull();
    expect(calcular().disabled).toBe(true);
    expect(criar().disabled).toBe(true);
  });

  it("mensagem sem {link} não calcula nem cria", async () => {
    await formulario();
    await escolherCarro(11);
    await digitar(molde(), "Oi {nome}, passa na loja");
    expect(q("[data-aviso-da-mensagem='sem-link']")).toBeTruthy();
    expect(calcular().disabled).toBe(true);
  });

  it("'Criar campanha' fica desabilitado sem prévia, e com zero destinatários", async () => {
    respostas["/api/marketing/sms/previa"] = [{ status: 200, corpo: { previa: { ...PREVIA, destinatarios: 0, custoEstimado: 0 } } }];
    await formulario();
    expect(criar().disabled).toBe(true);
    await escolherCarro(12);
    expect(criar().disabled).toBe(true);
    await clicar(calcular());
    expect(q("[data-destinatarios]").textContent).toBe("0");
    expect(q("[data-publico-vazio]")).toBeTruthy();
    expect(criar().disabled).toBe(true);
    expect(chamadas.map((c) => c.url)).toEqual(["/api/marketing/sms/previa"]);
  });

  it("a prévia mostra quem recebe, quem ficou de fora (só os motivos com gente) e o custo", async () => {
    respostas["/api/marketing/sms/previa"] = [{ status: 200, corpo: { previa: PREVIA } }];
    await formulario();
    await escolherCarro(12);
    await clicar(calcular());
    expect(chamadas[0].corpo).toEqual({
      nome: "prévia",
      veiculoId: 12,
      criterio: "mesmo_veiculo",
      janelaDias: 180,
      canais: [],
      descansoDias: DESCANSO_PADRAO,
      compraHaMeses: null,
      destino: "estoque",
      mensagem: MENSAGEM_PADRAO,
    });
    expect(q("[data-destinatarios]").textContent).toBe("42");
    const fora = q("[data-fora-do-publico]").textContent!;
    expect(fora).toContain("sem celular");
    expect(fora).toContain("pediram para sair");
    expect(fora).toContain("já compraram");
    expect(fora).not.toContain("desistiram");
    expect(fora).not.toContain("repetido");
    expect(fora).toContain("marcados sem interesse na origem4");
    expect(fora).toContain("receberam campanha há pouco5");
    expect(q("[data-custo-estimado]").textContent).toMatch(/3,78/);
    expect(criar().disabled).toBe(false);
  });

  it("sem preço por SMS configurado, a tela diz isso em vez de inventar custo", async () => {
    respostas["/api/marketing/sms/previa"] = [{ status: 200, corpo: { previa: { ...PREVIA, precoPorParte: null, custoEstimado: null } } }];
    await formulario();
    await escolherCarro(12);
    await clicar(calcular());
    expect(q("[data-previa-do-publico]").textContent).toContain("Preço por SMS não configurado");
    expect(q("[data-custo-estimado]").textContent).toBe("—");
  });

  it("mudar o critério depois da prévia invalida a prévia", async () => {
    respostas["/api/marketing/sms/previa"] = [{ status: 200, corpo: { previa: PREVIA } }];
    await formulario();
    await escolherCarro(12);
    await clicar(calcular());
    expect(criar().disabled).toBe(false);
    await clicar(q("input[name='criterio-do-publico'][value='mesma_marca']"));
    expect(criar().disabled).toBe(true);
    expect(q("[data-previa-do-publico]")).toBeNull();
    expect(q("[data-previa-vencida]").textContent).toContain("Calcule o público de novo");
    // E o período e a mensagem também.
    await clicar(q("input[name='criterio-do-publico'][value='mesmo_veiculo']"));
    expect(criar().disabled).toBe(false);
    await clicar(q("input[name='janela-de-interesse'][value='30']"));
    expect(criar().disabled).toBe(true);
  });

  it("criar faz POST com o pedido certo e leva ao monitor, sem enviar nada", async () => {
    respostas["/api/marketing/sms/previa"] = [{ status: 200, corpo: { previa: PREVIA } }];
    respostas["/api/marketing/sms"] = [{ status: 200, corpo: { id: "c-77" } }];
    await formulario();
    await escolherCarro(12);
    await clicar(q("input[name='criterio-do-publico'][value='mesmo_modelo']"));
    await clicar(q("input[name='janela-de-interesse'][value='null']"));
    // O nome sugerido segue o carro e o critério.
    expect(q<HTMLInputElement>("[data-nome-da-campanha]").value).toBe("Citroën C4 Cactus 2022 · Este modelo");
    await clicar(calcular());
    await clicar(criar());
    expect(chamadas.map((c) => c.url)).toEqual(["/api/marketing/sms/previa", "/api/marketing/sms"]);
    expect(chamadas[1].metodo).toBe("POST");
    expect(chamadas[1].corpo).toEqual({
      nome: "Citroën C4 Cactus 2022 · Este modelo",
      veiculoId: 12,
      criterio: "mesmo_modelo",
      janelaDias: null,
      canais: [],
      descansoDias: DESCANSO_PADRAO,
      compraHaMeses: null,
      destino: "estoque",
      mensagem: MENSAGEM_PADRAO,
    });
    expect(push).toHaveBeenCalledWith("/admin/marketing/sms/c-77");
    expect(chamadas.some((c) => c.url.includes("/enviar"))).toBe(false);
  });

  it("erro da rota vira aviso na tela, e não navega", async () => {
    respostas["/api/marketing/sms/previa"] = [{ status: 200, corpo: { previa: PREVIA } }];
    respostas["/api/marketing/sms"] = [{ status: 500, corpo: { error: "O banco recusou a campanha." } }];
    await formulario();
    await escolherCarro(12);
    await clicar(calcular());
    await clicar(criar());
    expect(q("[role=alert]").textContent).toContain("O banco recusou a campanha.");
    expect(push).not.toHaveBeenCalled();
    expect(criar().disabled).toBe(false);
  });

  it("o teste manda o número digitado e mostra o texto que saiu", async () => {
    respostas["/api/marketing/sms/teste"] = [{ status: 200, corpo: { ok: true, texto: "Maria, o Citroen C4 Cactus 2022… Sair: responda SAIR" } }];
    await formulario();
    await escolherCarro(12);
    expect(q<HTMLButtonElement>("[data-enviar-teste]").disabled).toBe(true);
    await digitar(q<HTMLInputElement>("[data-telefone-do-teste]"), "(41) 98888-7777");
    await clicar(q("[data-enviar-teste]"));
    expect(chamadas).toEqual([{ url: "/api/marketing/sms/teste", metodo: "POST", corpo: { telefone: "(41) 98888-7777", veiculoId: 12, mensagem: MENSAGEM_PADRAO, operadora: null } }]);
    expect(q("[data-resultado-do-teste='ok']").textContent).toContain("Sair: responda SAIR");
  });

  it("com impedimento (falta a tabela), dá para calcular e não dá para criar", async () => {
    respostas["/api/marketing/sms/previa"] = [{ status: 200, corpo: { previa: PREVIA } }];
    await formulario({ impedimento: "As tabelas das campanhas ainda não existem no banco." });
    await escolherCarro(12);
    await clicar(calcular());
    expect(criar().disabled).toBe(true);
    expect(q("[data-impedimento]").textContent).toContain("ainda não existem");
  });

  // ── Por carro ou por perfil (07/10/2026) ───────────────────────────────────

  const CANAIS = ["Instagram", "OLX", "Webmotors"];
  const criterios = () => [...container.querySelectorAll<HTMLInputElement>("input[name='criterio-do-publico']")].map((i) => i.value);
  const marcar = (canal: string) => clicar(q(`[data-canal='${canal}']`));

  it("'Por perfil' troca os critérios, explica cada um e torna o carro opcional", async () => {
    await formulario();
    expect(criterios()).toEqual([...CRITERIOS_DE_CARRO]);
    expect(q("[data-rotulo-do-periodo]").textContent).toBe("…nos últimos");
    expect(q<HTMLSelectElement>("[data-carro-da-campanha]").options[0].textContent).toBe("Escolha");
    expect(calcular().disabled).toBe(true);
    expect(q("[data-sempre-de-fora]").textContent).toContain("quem já comprou");

    await clicar(q("input[name='modo-do-publico'][value='perfil']"));
    expect(criterios()).toEqual([...CRITERIOS_DE_PERFIL]);
    expect(q<HTMLInputElement>("input[name='criterio-do-publico'][value='interessados']").checked).toBe(true);
    const explicacao = q("[data-explicacao-dos-perfis]").textContent!;
    expect(explicacao).toContain("Interessados: quem procurou a loja e ainda não comprou, com ou sem carro identificado");
    expect(explicacao).toContain("Clientes: quem já comprou na loja");
    expect(explicacao).toContain("Todos: os dois");
    expect(q("[data-rotulo-do-periodo]").textContent).toBe("…com contato nos últimos");
    expect(q<HTMLSelectElement>("[data-carro-da-campanha]").options[0].textContent).toBe("Sem carro: o link leva ao estoque");

    // Sem carro, a mensagem padrão é a que não fala de carro, e a prévia usa só nome e link.
    expect(molde().value).toBe(MENSAGEM_PADRAO_SEM_CARRO);
    expect(q("[data-como-chega]").textContent).toBe(montarMensagem(MENSAGEM_PADRAO_SEM_CARRO, { nome: "Maria", carro: "", preco: "", link: `${SITE_HOST}/s/abc2345` }));
    expect(q<HTMLButtonElement>("[data-variavel='{carro}']").disabled).toBe(true);
    expect(q<HTMLButtonElement>("[data-variavel='{preco}']").disabled).toBe(true);
    expect(q<HTMLButtonElement>("[data-variavel='{nome}']").disabled).toBe(false);
    expect(q<HTMLButtonElement>("[data-variavel='{link}']").disabled).toBe(false);
    expect(calcular().disabled).toBe(false);
    expect(q<HTMLInputElement>("[data-nome-da-campanha]").value).toMatch(/^Interessados · \d{2}\/\d{2}$/);

    // Em "Clientes" e "Todos", quem já comprou não fica de fora.
    expect(q("[data-sempre-de-fora]").textContent).toContain("Fica sempre de fora quem já comprou");
    await clicar(q("input[name='criterio-do-publico'][value='clientes']"));
    expect(q("[data-sempre-de-fora]").textContent).toContain("Quem já comprou NÃO fica de fora");

    // Com carro, por perfil, a mensagem padrão volta a ser a do carro e as variáveis voltam.
    await escolherCarro(12);
    expect(molde().value).toBe(MENSAGEM_PADRAO);
    expect(q<HTMLButtonElement>("[data-variavel='{carro}']").disabled).toBe(false);
    expect(q<HTMLInputElement>("[data-nome-da-campanha]").value).toBe("Citroën C4 Cactus 2022 · Clientes");

    // Voltar para "Por carro" devolve o critério que estava lá.
    await clicar(q("input[name='modo-do-publico'][value='carro']"));
    expect(q<HTMLInputElement>("input[name='criterio-do-publico'][value='mesmo_veiculo']").checked).toBe(true);
  });

  it("a mensagem que a pessoa já editou não é trocada ao ficar sem carro", async () => {
    await formulario();
    await digitar(molde(), "Oi {nome}, veja: {link}");
    await clicar(q("input[name='modo-do-publico'][value='perfil']"));
    expect(molde().value).toBe("Oi {nome}, veja: {link}");
  });

  it("sem carro, {carro} ou {preco} na mensagem bloqueia a prévia e a criação", async () => {
    respostas["/api/marketing/sms/previa"] = [{ status: 200, corpo: { previa: { ...PREVIA, veiculoRotulo: null } } }];
    await formulario();
    await clicar(q("input[name='modo-do-publico'][value='perfil']"));
    await clicar(calcular());
    expect(criar().disabled).toBe(false);

    await digitar(molde(), "{nome}, o {carro} chegou: {link}");
    const bloqueio = q("[data-aviso-da-mensagem='variavel-sem-carro']");
    expect(bloqueio.textContent).toContain("Bloqueado");
    expect(bloqueio.textContent).toContain("{carro}");
    expect(bloqueio.querySelector("svg[data-estado='impeditivo']")).toBeTruthy();
    expect(calcular().disabled).toBe(true);
    expect(criar().disabled).toBe(true);

    await digitar(molde(), "{nome}, por {preco}: {link}");
    expect(q("[data-aviso-da-mensagem='variavel-sem-carro']")).toBeTruthy();
    expect(calcular().disabled).toBe(true);

    // Com carro, a mesma mensagem serve.
    await escolherCarro(12);
    expect(q("[data-aviso-da-mensagem='variavel-sem-carro']")).toBeNull();
    expect(calcular().disabled).toBe(false);
    expect(chamadas).toHaveLength(1);
  });

  it("sem carro, o POST leva `veiculoId: null`, os canais escolhidos e o descanso", async () => {
    respostas["/api/marketing/sms/previa"] = [{ status: 200, corpo: { previa: { ...PREVIA, veiculoRotulo: null } } }];
    respostas["/api/marketing/sms"] = [{ status: 200, corpo: { id: "c-88" } }];
    await formulario({ canais: CANAIS });
    await clicar(q("input[name='modo-do-publico'][value='perfil']"));
    await clicar(q("input[name='criterio-do-publico'][value='todos']"));
    // Marcados fora de ordem: o pedido leva na ordem da lista.
    await marcar("Webmotors");
    await marcar("Instagram");
    expect(q("[data-canais-escolhidos]").textContent).toBe("2 escolhidos");
    await clicar(q("input[name='descanso-da-campanha'][value='30']"));
    await clicar(calcular());
    const nome = q<HTMLInputElement>("[data-nome-da-campanha]").value;
    expect(nome).toMatch(/^Todos · \d{2}\/\d{2}$/);
    await clicar(criar());
    const pedido = { veiculoId: null, criterio: "todos", janelaDias: 180, canais: ["Instagram", "Webmotors"], descansoDias: 30, compraHaMeses: null, destino: "estoque", mensagem: MENSAGEM_PADRAO_SEM_CARRO };
    expect(chamadas).toEqual([
      { url: "/api/marketing/sms/previa", metodo: "POST", corpo: { nome: "prévia", ...pedido } },
      { url: "/api/marketing/sms", metodo: "POST", corpo: { nome, ...pedido } },
    ]);
    // O que a tela manda é o que o servidor aceita.
    expect(lerPedidoDeCampanha(chamadas[1].corpo)).toEqual({ ok: true, pedido: { nome, ...pedido } });
    expect(push).toHaveBeenCalledWith("/admin/marketing/sms/c-88");
  });

  it("o filtro de canal fica fechado, some sem canais, e 'limpar' desmarca tudo", async () => {
    await formulario();
    expect(q("[data-filtro-de-canal]")).toBeNull();
    act(() => root.unmount());
    container.remove();

    await formulario({ canais: CANAIS });
    const filtro = q<HTMLDetailsElement>("[data-filtro-de-canal]");
    expect(filtro.open).toBe(false);
    expect(filtro.querySelector("summary")!.textContent).toContain("Filtrar por canal");
    expect(q("[data-canais-escolhidos]").textContent).toBe("todos os canais");
    expect(container.querySelectorAll("[data-canal]")).toHaveLength(3);
    await marcar("OLX");
    expect(q("[data-canais-escolhidos]").textContent).toBe("1 escolhido");
    await clicar(q("[data-limpar-canais]"));
    expect(q("[data-canais-escolhidos]").textContent).toBe("todos os canais");
    expect(q<HTMLInputElement>("[data-canal='OLX']").checked).toBe(false);
  });

  it("o descanso começa no padrão; mudar canal, descanso, modo ou carro invalida a prévia", async () => {
    respostas["/api/marketing/sms/previa"] = [{ status: 200, corpo: { previa: PREVIA } }];
    await formulario({ canais: CANAIS });
    expect(q<HTMLInputElement>(`input[name='descanso-da-campanha'][value='${DESCANSO_PADRAO}']`).checked).toBe(true);
    expect(q("input[name='descanso-da-campanha'][value='0']").parentElement!.textContent).toBe("Sem descanso");
    await escolherCarro(12);
    await clicar(calcular());
    expect(criar().disabled).toBe(false);

    await marcar("OLX");
    expect(criar().disabled).toBe(true);
    expect(q("[data-previa-vencida]")).toBeTruthy();
    await marcar("OLX");
    expect(criar().disabled).toBe(false);

    await clicar(q("input[name='descanso-da-campanha'][value='0']"));
    expect(criar().disabled).toBe(true);
    await clicar(q(`input[name='descanso-da-campanha'][value='${DESCANSO_PADRAO}']`));
    expect(criar().disabled).toBe(false);

    await clicar(q("input[name='modo-do-publico'][value='perfil']"));
    expect(criar().disabled).toBe(true);
    await clicar(q("input[name='modo-do-publico'][value='carro']"));
    expect(criar().disabled).toBe(false);

    await escolherCarro(11);
    expect(criar().disabled).toBe(true);
  });

  it("o teste sem carro manda `veiculoId: null`", async () => {
    respostas["/api/marketing/sms/teste"] = [{ status: 200, corpo: { ok: true, texto: "Maria, chegaram novidades… Sair: responda SAIR" } }];
    await formulario();
    await digitar(q<HTMLInputElement>("[data-telefone-do-teste]"), "(41) 98888-7777");
    // Por carro e sem carro, não há o que testar.
    expect(q<HTMLButtonElement>("[data-enviar-teste]").disabled).toBe(true);
    await clicar(q("input[name='modo-do-publico'][value='perfil']"));
    await clicar(q("[data-enviar-teste]"));
    expect(chamadas).toEqual([{ url: "/api/marketing/sms/teste", metodo: "POST", corpo: { telefone: "(41) 98888-7777", veiculoId: null, mensagem: MENSAGEM_PADRAO_SEM_CARRO, operadora: null } }]);
  });

  // ── Hora de trocar, destino do link e a prévia de leads (07/10/2026) ────────

  const marcado = (nome: string) => container.querySelector<HTMLInputElement>(`input[name='${nome}']:checked`)?.value ?? null;
  const camada = (criterio: string) => q<HTMLButtonElement>(`[data-camada='${criterio}']`);

  it("o filtro de compra só existe em Clientes e Todos, com os rótulos de tempo", async () => {
    await formulario();
    expect(q("[data-filtro-de-compra]")).toBeNull();
    await clicar(q("input[name='modo-do-publico'][value='perfil']"));
    expect(q("[data-filtro-de-compra]")).toBeNull();
    await clicar(q("input[name='criterio-do-publico'][value='todos']"));
    const filtro = q("[data-filtro-de-compra]");
    expect(filtro.textContent).toContain("Comprou há pelo menos…");
    expect([...filtro.querySelectorAll("label")].map((l) => l.textContent)).toEqual(["Qualquer data", "1 ano", "1 ano e meio", "2 anos", "3 anos"]);
    expect(filtro.textContent).toContain("só entra quem tem data de compra conhecida");
    expect(marcado("tempo-desde-a-compra")).toBe("null");
  });

  it("o atalho de troca arma os cinco campos, e o POST leva o pedido de troca", async () => {
    respostas["/api/marketing/sms/previa"] = [{ status: 200, corpo: { previa: { ...PREVIA, veiculoRotulo: null } } }];
    respostas["/api/marketing/sms"] = [{ status: 200, corpo: { id: "c-99" } }];
    await formulario();
    // Com um carro já escolhido: o atalho tira o carro.
    await escolherCarro(12);
    expect(q("[data-atalho-de-troca]").textContent).toBe("Campanha de troca: hora de trocar seu carro");
    await clicar(q("[data-atalho-de-troca]"));
    expect(marcado("modo-do-publico")).toBe("perfil");
    expect(marcado("criterio-do-publico")).toBe("clientes");
    expect(marcado("tempo-desde-a-compra")).toBe("24");
    expect(q<HTMLSelectElement>("[data-carro-da-campanha]").value).toBe("");
    expect(marcado("destino-do-link")).toBe("avaliacao");
    expect(molde().value).toBe(MENSAGEM_PADRAO_DE_TROCA);
    expect(q("[data-pergunta-da-troca]")).toBeNull();
    expect(q<HTMLSelectElement>("[data-carro-da-campanha]").options[0].textContent).toBe("Sem carro: o link leva à avaliação do usado");
    expect(q("[data-sem-carro]").textContent).toContain("abre a avaliação do usado");

    await clicar(calcular());
    expect(q("[data-previa-do-publico]").textContent).toContain("comprou há pelo menos 2 anos");
    const nome = q<HTMLInputElement>("[data-nome-da-campanha]").value;
    await clicar(criar());
    expect(chamadas.map((c) => c.url)).toEqual(["/api/marketing/sms/previa", "/api/marketing/sms"]);
    expect(chamadas[1].corpo).toMatchObject({ criterio: "clientes", compraHaMeses: 24, veiculoId: null, destino: "avaliacao", mensagem: MENSAGEM_PADRAO_DE_TROCA });
    // O que a tela manda é o que o servidor aceita.
    const lido = lerPedidoDeCampanha(chamadas[1].corpo);
    expect(lido).toEqual({ ok: true, pedido: { nome, veiculoId: null, criterio: "clientes", janelaDias: 180, canais: [], descansoDias: DESCANSO_PADRAO, compraHaMeses: 24, destino: "avaliacao", mensagem: MENSAGEM_PADRAO_DE_TROCA } });
    expect(push).toHaveBeenCalledWith("/admin/marketing/sms/c-99");
  });

  it("o atalho não troca a mensagem escrita à mão sem perguntar", async () => {
    await formulario();
    await digitar(molde(), "Oi {nome}, veja: {link}");
    await clicar(q("[data-atalho-de-troca]"));
    expect(molde().value).toBe("Oi {nome}, veja: {link}");
    expect(marcado("tempo-desde-a-compra")).toBe("24");
    const pergunta = q("[data-pergunta-da-troca]");
    expect(pergunta.textContent).toContain("Atenção");
    expect(pergunta.textContent).toContain(MENSAGEM_PADRAO_DE_TROCA);
    expect(pergunta.querySelector("svg[data-estado='atencao']")).toBeTruthy();
    await clicar(q("[data-usar-mensagem-de-troca]"));
    expect(molde().value).toBe(MENSAGEM_PADRAO_DE_TROCA);
    expect(q("[data-pergunta-da-troca]")).toBeNull();

    // "Manter a minha" fecha o aviso e não mexe no texto.
    await digitar(molde(), "Outra, {link}");
    await clicar(q("[data-atalho-de-troca]"));
    await clicar(q("[data-manter-a-mensagem]"));
    expect(q("[data-pergunta-da-troca]")).toBeNull();
    expect(molde().value).toBe("Outra, {link}");
  });

  it("voltar para Interessados, ou para 'Por carro', zera o filtro de compra", async () => {
    respostas["/api/marketing/sms/previa"] = [{ status: 200, corpo: { previa: { ...PREVIA, veiculoRotulo: null } } }];
    await formulario();
    await clicar(q("[data-atalho-de-troca]"));
    await clicar(q("input[name='criterio-do-publico'][value='interessados']"));
    expect(q("[data-filtro-de-compra]")).toBeNull();
    await clicar(calcular());
    expect(chamadas[0].corpo).toMatchObject({ criterio: "interessados", compraHaMeses: null, destino: "avaliacao" });
    expect(lerPedidoDeCampanha(chamadas[0].corpo).ok).toBe(true);
    // Zerou de verdade: voltar a Clientes não traz os 24 meses de volta.
    await clicar(q("input[name='criterio-do-publico'][value='clientes']"));
    expect(marcado("tempo-desde-a-compra")).toBe("null");

    await clicar(q("input[name='tempo-desde-a-compra'][value='36']"));
    await clicar(calcular());
    expect(chamadas[1].corpo).toMatchObject({ criterio: "clientes", compraHaMeses: 36 });
    // Mudar o filtro invalida a prévia.
    await clicar(q("input[name='tempo-desde-a-compra'][value='12']"));
    expect(q("[data-previa-vencida]")).toBeTruthy();

    await clicar(q("input[name='modo-do-publico'][value='carro']"));
    await clicar(q("input[name='modo-do-publico'][value='perfil']"));
    expect(marcado("criterio-do-publico")).toBe("clientes");
    expect(marcado("tempo-desde-a-compra")).toBe("null");
  });

  it("o destino do link só aparece sem carro; com carro, o pedido leva 'estoque'", async () => {
    respostas["/api/marketing/sms/previa"] = [{ status: 200, corpo: { previa: PREVIA } }];
    await formulario();
    // Por carro não há destino a escolher.
    expect(q("[data-destino-do-link]")).toBeNull();
    await clicar(q("input[name='modo-do-publico'][value='perfil']"));
    const destino = q("[data-destino-do-link]");
    expect(destino.textContent).toContain("O link leva para");
    expect([...destino.querySelectorAll("label")].map((l) => l.textContent)).toEqual(["O estoque", "A avaliação do usado"]);
    expect(marcado("destino-do-link")).toBe("estoque");
    await clicar(q("input[name='destino-do-link'][value='avaliacao']"));

    await escolherCarro(12);
    expect(q("[data-destino-do-link]")).toBeNull();
    expect(q("[data-sem-carro]")).toBeNull();
    await clicar(calcular());
    expect(chamadas[0].corpo).toMatchObject({ veiculoId: 12, criterio: "interessados", destino: "estoque", compraHaMeses: null });
  });

  it("as camadas mostram o alcance de cada critério, com a escolhida marcada por forma e texto", async () => {
    respostas["/api/marketing/sms/previa"] = [{ status: 200, corpo: { previa: PREVIA_COM_LEADS } }];
    await formulario();
    await escolherCarro(12);
    expect(q("[data-camadas]")).toBeNull();
    await clicar(calcular());
    const bloco = q("[data-camadas]");
    expect(bloco.textContent).toContain("Quem procurou este carro, e quem procurou parecido");
    expect(bloco.textContent).toContain("Clique para usar este público");
    const linhas = [...bloco.querySelectorAll<HTMLElement>("[data-camada]")];
    // Na ordem em que vieram.
    expect(linhas.map((l) => l.getAttribute("data-camada"))).toEqual(["mesmo_veiculo", "mesmo_modelo", "mesma_marca", "faixa_de_preco"]);
    expect(linhas.map((l) => l.textContent)).toEqual(["Este carroescolhido42", "Este modelo120", "Esta marca300", "Preço parecido150"]);
    expect(linhas.map((l) => l.getAttribute("data-escolhida"))).toEqual(["sim", "nao", "nao", "nao"]);
    expect(camada("mesmo_veiculo").getAttribute("aria-pressed")).toBe("true");
    expect(camada("mesmo_veiculo").querySelector("[data-marca-de-escolhido] svg[data-estado='ok']")).toBeTruthy();
    expect(bloco.querySelectorAll("[data-marca-de-escolhido]")).toHaveLength(1);
    // As barras são proporcionais à maior camada.
    const barra = (c: string) => (camada(c).children[1].firstElementChild as HTMLElement).style.width;
    expect(barra("mesma_marca")).toBe("100%");
    expect(barra("mesmo_modelo")).toBe("40%");
    expect(barra("mesmo_veiculo")).toBe("14%");
  });

  it("clicar em outra camada troca o critério e invalida a prévia; na escolhida, nada muda", async () => {
    respostas["/api/marketing/sms/previa"] = [{ status: 200, corpo: { previa: PREVIA_COM_LEADS } }];
    await formulario();
    await escolherCarro(12);
    await clicar(calcular());
    await clicar(camada("mesmo_veiculo"));
    expect(criar().disabled).toBe(false);
    expect(q("[data-camadas]")).toBeTruthy();

    await clicar(camada("mesma_marca"));
    expect(marcado("criterio-do-publico")).toBe("mesma_marca");
    expect(q("[data-camadas]")).toBeNull();
    expect(q("[data-amostra]")).toBeNull();
    expect(q("[data-previa-do-publico]")).toBeNull();
    expect(q("[data-previa-vencida]").textContent).toContain("Calcule o público de novo");
    expect(criar().disabled).toBe(true);
    // Nada foi pedido ao servidor por conta do clique.
    expect(chamadas).toHaveLength(1);

    await clicar(calcular());
    expect(chamadas[1].corpo).toMatchObject({ criterio: "mesma_marca", veiculoId: 12 });
    expect(camada("mesma_marca").getAttribute("data-escolhida")).toBe("sim");
    expect(camada("mesmo_veiculo").getAttribute("data-escolhida")).toBe("nao");
  });

  it("as faixas de match saem com a contagem e a explicação montada das constantes", async () => {
    respostas["/api/marketing/sms/previa"] = [{ status: 200, corpo: { previa: PREVIA_COM_LEADS } }];
    await formulario();
    await escolherCarro(12);
    await clicar(calcular());
    const faixas = [...q("[data-faixas-de-match]").querySelectorAll<HTMLElement>("[data-faixa]")];
    expect(faixas.map((f) => f.textContent)).toEqual(["100%30", "80%12"]);
    expect((faixas[0].children[1].firstElementChild as HTMLElement).style.width).toBe("100%");
    expect((faixas[1].children[1].firstElementChild as HTMLElement).style.width).toBe("40%");
    const explicacao = q("[data-explicacao-do-match]").textContent!;
    expect(explicacao).toBe("São cinco sinais, 20% cada: mesma marca, mesmo modelo, este carro, preço parecido e interesse recente (últimos 90 dias).");
    for (const s of SINAIS_DE_AFINIDADE) expect(explicacao).toContain(ROTULO_DO_SINAL[s]);
    expect(explicacao).toContain(`${DIAS_DO_INTERESSE_RECENTE} dias`);
    expect(explicacao).toContain(`${100 / SINAIS_DE_AFINIDADE.length}% cada`);
  });

  it("a amostra lista as primeiras pessoas, na ordem que veio, e nunca mostra telefone inteiro", async () => {
    respostas["/api/marketing/sms/previa"] = [{ status: 200, corpo: { previa: PREVIA_COM_LEADS } }];
    await formulario();
    await escolherCarro(12);
    await clicar(calcular());
    const bloco = q("[data-amostra]");
    expect(bloco.textContent).toContain("As primeiras 3 pessoas do público");
    expect([...bloco.querySelectorAll("th")].map((t) => t.textContent)).toEqual(["Nome", "Telefone", "Carro que olhou", "Quando", "Match"]);
    const linhas = [...bloco.querySelectorAll("tr[data-pessoa-da-amostra]")].map((l) => [...l.querySelectorAll("td")].map((c) => c.textContent));
    expect(linhas).toEqual([
      ["Ana", "(41) 9••••-0001", "Citroën C4 Cactus", "01/10/26", "100%"],
      ["Bruno", "(41) 9••••-0002", "—", "01/07/26", "80%"],
      // Sobrenome e número inteiro não passam, mesmo que o servidor os mande.
      ["Carla", "••••", "Citroën C3", "01/06/26", "80%"],
    ]);
    expect(q("[data-ordem-da-amostra]").textContent).toBe("Na ordem de envio: maior match primeiro, depois o contato mais recente. É uma amostra: 3 de 42.");
    expect(container.innerHTML).not.toMatch(/\d{8,}/);
    expect(container.textContent).not.toContain("Souza");
  });

  it("em campanha por perfil não há camadas nem faixas, e a coluna de match some", async () => {
    const porPerfil: PreviaDaCampanha = {
      ...PREVIA,
      veiculoRotulo: null,
      amostra: [
        { primeiroNome: "Davi", telefoneMascarado: "(41) 9••••-0004", match: null, olhou: null, quando: "2026-09-20T15:00:00Z" },
        { primeiroNome: "", telefoneMascarado: "(41) 9••••-0005", match: null, olhou: null, quando: "2026-09-10T15:00:00Z" },
      ],
    };
    respostas["/api/marketing/sms/previa"] = [{ status: 200, corpo: { previa: porPerfil } }];
    await formulario();
    await clicar(q("input[name='modo-do-publico'][value='perfil']"));
    await clicar(calcular());
    expect(q("[data-camadas]")).toBeNull();
    expect(q("[data-faixas-de-match]")).toBeNull();
    const bloco = q("[data-amostra]");
    expect([...bloco.querySelectorAll("th")].map((t) => t.textContent)).toEqual(["Nome", "Telefone", "Carro que olhou", "Quando"]);
    expect(bloco.querySelector("[data-match]")).toBeNull();
    expect(bloco.querySelectorAll("tr[data-pessoa-da-amostra]")[1].textContent).toContain("Sem nome");
    expect(q("[data-ordem-da-amostra]").textContent).toBe("Na ordem de envio: o contato mais recente primeiro. É uma amostra: 2 de 42.");
    expect(bloco.innerHTML).not.toContain("null");
  });

  it("prévia de servidor mais velho (sem camadas, faixas e amostra) não quebra a tela", async () => {
    const antiga: Record<string, unknown> = { ...PREVIA };
    for (const campo of ["camadas", "faixasDeMatch", "amostra"]) delete antiga[campo];
    respostas["/api/marketing/sms/previa"] = [{ status: 200, corpo: { previa: antiga } }];
    await formulario();
    await escolherCarro(12);
    await clicar(calcular());
    expect(q("[data-destinatarios]").textContent).toBe("42");
    expect(q("[data-amostra]")).toBeNull();
    expect(criar().disabled).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A lista
// ─────────────────────────────────────────────────────────────────────────────

const resumo = (parcial: Partial<ResumoDaCampanha> = {}): ResumoDaCampanha => ({
  publico: 5,
  naFila: 5,
  enviados: 0,
  falhas: 0,
  naOperadora: 0,
  clicaram: 0,
  cliques: 0,
  responderam: 0,
  sairam: 0,
  custo: 0,
  partes: 0,
  ...parcial,
});

describe("a lista de campanhas", () => {
  const CONFIG = { temToken: true, homologacao: false, precoPorParte: 0.09, temRetorno: true };
  async function lista(props: Record<string, unknown>) {
    const { default: CampanhasDeSms } = await import("../src/components/marketing/sms/CampanhasDeSms");
    await montar(CampanhasDeSms, { carros: CARROS, configuracao: CONFIG, migracao: "20261007120000_sms_campanhas", ...props });
  }

  it("lista vazia tem texto útil, e um título só", async () => {
    await lista({ leitura: { ok: true, campanhas: [] } });
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(q("h1").textContent).toBe("Campanhas de SMS");
    expect(q("[data-lista-vazia]").textContent).toContain("Nenhuma campanha ainda");
    expect(q("[data-avisos-de-configuracao]")).toBeNull();
  });

  it("cada campanha é uma linha com o funil, a situação escrita e o link do monitor", async () => {
    await lista({
      leitura: {
        ok: true,
        campanhas: [
          {
            id: "c-1",
            nome: "Cactus · Este carro",
            situacao: "enviada",
            veiculoId: 12,
            veiculoRotulo: "Citroën C4 Cactus 2022",
            criterio: "mesmo_veiculo",
            criadoEm: "2026-10-07T12:00:00Z",
            criadoPorNome: "Dyones",
            enviadaEm: "2026-10-07T13:00:00Z",
            resumo: resumo({ publico: 40, naFila: 0, enviados: 40, naOperadora: 38, clicaram: 10, cliques: 14, responderam: 3, sairam: 1, custo: 3.6, partes: 40 }),
          },
        ],
      },
    });
    const linha = q("tr[data-campanha='c-1']");
    expect(linha.querySelector("a")!.getAttribute("href")).toBe("/admin/marketing/sms/c-1");
    expect(linha.querySelector("[data-situacao='enviada'] svg[data-estado='ok']")).toBeTruthy();
    expect(linha.textContent).toContain("Enviada");
    expect(linha.textContent).toContain("Este carro");
    expect(linha.textContent).toContain("25%");
    expect(linha.textContent).toMatch(/3,60/);
  });

  it("campanha por perfil, sem carro, entra na lista sem carro inventado; e a base tem link com o total", async () => {
    await lista({
      canais: ["OLX"],
      pessoasNaBase: 7310,
      leitura: {
        ok: true,
        campanhas: [
          {
            id: "c-2",
            nome: "Clientes · 07/10",
            situacao: "rascunho",
            veiculoId: null,
            veiculoRotulo: null,
            criterio: "clientes",
            criadoEm: "2026-10-07T12:00:00Z",
            criadoPorNome: null,
            enviadaEm: null,
            resumo: resumo(),
          },
        ],
      },
    });
    const linha = q("tr[data-campanha='c-2']");
    // A lista não sabe o destino do link (estoque ou avaliação), e não inventa um.
    expect(linha.querySelector("[data-carro-da-linha='sem-carro']")!.textContent).toBe("Sem carro");
    expect(linha.textContent).toContain("Clientes");
    expect(linha.textContent).toContain("por perfil");
    expect(linha.innerHTML).not.toContain("null");
    expect(container.innerHTML).not.toContain("/admin/estoque/");
    const base = q("a[data-link-da-base]");
    expect(base.getAttribute("href")).toBe("/admin/marketing/base");
    expect(base.textContent).toContain("Base de contatos");
    expect(base.textContent).toContain("7.310 pessoas");
    // Os canais chegam ao formulário.
    expect(q("[data-canal='OLX']")).toBeTruthy();
  });

  it("sem o total da base, o link aparece sem número", async () => {
    await lista({ leitura: { ok: true, campanhas: [] } });
    expect(q("a[data-link-da-base]").textContent).toBe("Base de contatos");
  });

  it("os avisos de configuração dizem o nome de cada variável e da migração", async () => {
    await lista({
      leitura: { ok: false, faltaMigracao: true, motivo: "relation does not exist" },
      configuracao: { temToken: false, homologacao: true, precoPorParte: null, temRetorno: false },
    });
    const avisos = q("[data-avisos-de-configuracao]");
    expect(avisos.querySelector("[data-aviso='token']")!.textContent).toContain("APIBRASIL_TOKEN");
    expect(avisos.querySelector("[data-aviso='homologacao']")!.textContent).toContain("de teste");
    expect(avisos.querySelector("[data-aviso='retorno']")!.textContent).toContain("SMS_WEBHOOK_TOKEN");
    expect(avisos.querySelector("[data-aviso='migracao']")!.textContent).toContain("20261007120000_sms_campanhas");
    expect(q("[data-impedimento]")).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O monitor
// ─────────────────────────────────────────────────────────────────────────────

const envio = (id: string, parcial: Partial<EnvioNaTela> = {}): EnvioNaTela => ({
  id,
  primeiroNome: "Ana",
  telefoneMascarado: "(41) 9••••-0001",
  situacao: "enviado",
  enviadoEm: "2026-10-07T13:00:00Z",
  naOperadoraEm: null,
  cliques: 0,
  clicouEm: null,
  respondeuEm: null,
  resposta: null,
  saiuEm: null,
  erro: null,
  leadId: `lead-${id}`,
  ...parcial,
});

function campanha(parcial: Partial<CampanhaDeSmsDetalhada> = {}): CampanhaDeSmsDetalhada {
  return {
    id: "c-9",
    nome: "Cactus · Este carro",
    situacao: "rascunho",
    veiculoId: 12,
    veiculoRotulo: "Citroën C4 Cactus 2022",
    criterio: "mesmo_veiculo",
    criadoEm: "2026-10-07T12:00:00Z",
    criadoPorNome: "Dyones",
    enviadaEm: null,
    resumo: resumo(),
    janelaDias: 180,
    canais: [],
    descansoDias: DESCANSO_PADRAO,
    compraHaMeses: null,
    destino: "/carros/citroen-c4-cactus-2022-12",
    mensagem: MENSAGEM_PADRAO,
    exemplo: "Maria, o Citroen C4 Cactus 2022 que voce viu na Motors Store esta por R$ 89.900. Veja: exemplo/s/abc2345 Sair: responda SAIR",
    tamanho: { caracteres: 120, partes: 1, unicode: false },
    utm: "sms-k7m2p9q",
    leadsNovos: 2,
    envios: [],
    homologacao: false,
    ...parcial,
  };
}

const lote = (enviados: number, restam: number, parcial: Partial<RespostaDoLote> = {}): { status: number; corpo: RespostaDoLote } => ({
  status: 200,
  corpo: { situacao: restam > 0 ? "enviando" : "enviada", resumo: resumo({ naFila: restam, enviados, partes: enviados, custo: enviados * 0.09 }), restam, aviso: null, ...parcial },
});

describe("o monitor da campanha", () => {
  const ENVIAR = "/api/marketing/sms/c-9/enviar";
  async function monitor(c: CampanhaDeSmsDetalhada, props: Record<string, unknown> = {}) {
    const { default: MonitorDaCampanhaDeSms } = await import("../src/components/marketing/sms/MonitorDaCampanhaDeSms");
    await montar(MonitorDaCampanhaDeSms, { campanha: c, ...props });
  }

  it("em rascunho, enviar pede confirmação dizendo quantas pessoas; quem cancela não chama a rota", async () => {
    confirma = false;
    await monitor(campanha());
    expect(q("[data-situacao='rascunho']").textContent).toContain("Rascunho");
    expect(q("[data-enviar]").textContent).toBe("Enviar para 5 pessoas");
    expect(q("[data-continuar]")).toBeNull();
    expect(q("[data-interromper]")).toBeNull();
    await clicar(q("[data-enviar]"));
    expect(confirm).toHaveBeenCalledTimes(1);
    const pedido = confirm.mock.calls[0][0] as { message: string };
    expect(pedido.message).toContain("5 pessoas");
    expect(pedido.message).toContain("não dá para desfazer");
    expect(chamadas).toEqual([]);
    expect(q("[data-situacao='rascunho']")).toBeTruthy();
  });

  it("confirmando, chama /enviar lote a lote até a fila zerar, e mostra o progresso", async () => {
    respostas[ENVIAR] = [lote(2, 3), lote(4, 1), lote(5, 0)];
    await monitor(campanha());
    await clicar(q("[data-enviar]"));
    await esperar();
    expect(chamadas.map((c) => c.url)).toEqual([ENVIAR, ENVIAR, ENVIAR]);
    expect(chamadas.every((c) => c.metodo === "POST" && c.corpo === null)).toBe(true);
    expect(q("[data-situacao='enviada']").textContent).toContain("Enviada");
    expect(q("[data-progresso-texto]").textContent).toContain("5 de 5");
    expect(q("[role=progressbar]").getAttribute("aria-valuenow")).toBe("5");
    expect(q("[data-etapa='enviados']").textContent).toContain("100% do público");
    expect(q("[data-enviar]")).toBeNull();
    expect(q("[data-continuar]")).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it("para ao receber aviso do fornecedor, mostra o aviso e oferece continuar", async () => {
    respostas[ENVIAR] = [lote(2, 3), lote(2, 3, { aviso: "Saldo insuficiente no fornecedor." }), lote(5, 0)];
    await monitor(campanha());
    await clicar(q("[data-enviar]"));
    await esperar();
    expect(chamadas).toHaveLength(2);
    expect(q("[data-aviso-do-lote]").textContent).toContain("Saldo insuficiente no fornecedor.");
    expect(q("[data-situacao='enviando']")).toBeTruthy();
    expect(q("[data-continuar]")).toBeTruthy();
    expect(q("[data-interromper]")).toBeTruthy();
  });

  it("erro da rota para o laço e aparece na tela", async () => {
    respostas[ENVIAR] = [{ status: 502, corpo: { error: "O fornecedor recusou o token." } }];
    await monitor(campanha());
    await clicar(q("[data-enviar]"));
    expect(chamadas).toHaveLength(1);
    expect(q("[data-erro-do-envio]").textContent).toContain("O fornecedor recusou o token.");
  });

  it("fila que não anda não vira laço sem fim", async () => {
    respostas[ENVIAR] = [lote(2, 3)];
    await monitor(campanha());
    await clicar(q("[data-enviar]"));
    await esperar();
    expect(chamadas.length).toBeLessThanOrEqual(5);
    expect(q("[data-aviso-do-lote]").textContent).toContain("A fila não andou");
  });

  it("reaberta no meio do envio: continuar e interromper, os dois com confirmação", async () => {
    respostas["/api/marketing/sms/c-9/interromper"] = [{ status: 200, corpo: { situacao: "interrompida" } }];
    await monitor(campanha({ situacao: "enviando", resumo: resumo({ naFila: 3, enviados: 2 }) }));
    expect(q("[data-enviar]")).toBeNull();
    expect(q("[data-continuar]")).toBeTruthy();
    expect(q("[data-progresso-texto]").textContent).toContain("2 de 5");

    confirma = false;
    await clicar(q("[data-interromper]"));
    expect(chamadas).toEqual([]);

    confirma = true;
    await clicar(q("[data-interromper]"));
    expect(chamadas).toEqual([{ url: "/api/marketing/sms/c-9/interromper", metodo: "POST", corpo: null }]);
    expect(q("[data-situacao='interrompida']").textContent).toContain("Interrompida");
    expect(q("[data-continuar]")).toBeNull();
    expect(q("[data-interromper]")).toBeNull();
  });

  it("enviada e interrompida não têm ação de envio", async () => {
    await monitor(campanha({ situacao: "enviada", resumo: resumo({ naFila: 0, enviados: 5 }) }));
    expect(q("[data-enviar]")).toBeNull();
    expect(q("[data-continuar]")).toBeNull();
    expect(q("[data-interromper]")).toBeNull();
    await clicar(q("[data-atualizar]"));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(chamadas).toEqual([]);
  });

  const ENVIOS = [
    envio("e1", { primeiroNome: "Ana", telefoneMascarado: "(41) 9••••-0001" }),
    envio("e2", { primeiroNome: "Bruno", telefoneMascarado: "(41) 9••••-0002", naOperadoraEm: "2026-10-07T13:01:00Z" }),
    envio("e3", { primeiroNome: "Carla", telefoneMascarado: "(41) 9••••-0003", naOperadoraEm: "2026-10-07T13:01:00Z", cliques: 2, clicouEm: "2026-10-07T14:00:00Z" }),
    envio("e4", {
      primeiroNome: "Davi",
      telefoneMascarado: "(41) 9••••-0004",
      cliques: 1,
      clicouEm: "2026-10-07T14:00:00Z",
      respondeuEm: "2026-10-07T15:00:00Z",
      resposta: "Ainda tem o carro?",
    }),
    envio("e5", { primeiroNome: "Eva", telefoneMascarado: "(41) 9••••-0005", respondeuEm: "2026-10-07T15:00:00Z", resposta: "SAIR", saiuEm: "2026-10-07T15:00:00Z" }),
    envio("e6", { primeiroNome: "", telefoneMascarado: "(41) 9••••-0006", situacao: "falhou", enviadoEm: null, erro: "número inválido", leadId: null }),
    envio("e7", { primeiroNome: "Gil", telefoneMascarado: "(41) 9••••-0007", situacao: "na_fila", enviadoEm: null }),
  ];
  const ENVIADA = () =>
    campanha({
      situacao: "enviada",
      envios: ENVIOS,
      resumo: resumo({ publico: 7, naFila: 1, enviados: 5, falhas: 1, naOperadora: 2, clicaram: 2, cliques: 3, responderam: 2, sairam: 1, custo: 0.45, partes: 5 }),
    });
  const linhas = () => [...container.querySelectorAll("tr[data-envio]")];

  it("a tabela mostra o estágio mais avançado de cada pessoa, com forma e rótulo", async () => {
    await monitor(ENVIADA());
    expect(linhas().map((l) => l.getAttribute("data-estagio"))).toEqual(["enviado", "na_operadora", "clicou", "respondeu", "saiu", "falhou", "na_fila"]);
    expect(linhas()[4].textContent).toContain("Saiu");
    expect(linhas()[4].querySelector("svg[data-estado='atencao']")).toBeTruthy();
    expect(linhas()[5].textContent).toContain("Falhou");
    expect(linhas()[5].textContent).toContain("número inválido");
    expect(linhas()[5].querySelector("svg[data-estado='impeditivo']")).toBeTruthy();
    expect(linhas()[3].textContent).toContain("Ainda tem o carro?");
    expect(linhas()[6].textContent).toContain("Na fila");
  });

  it("nenhum telefone inteiro chega ao HTML", async () => {
    await monitor(ENVIADA(), { podeAbrirLead: true });
    const texto = container.textContent!;
    expect(texto).toContain("(41) 9••••-0003");
    expect(texto).not.toMatch(/55\d{11}/);
    expect(texto).not.toMatch(/\d{11}/);
    expect(container.innerHTML).not.toMatch(/\d{11}/);
    expect(q("[data-destinatarios]").textContent).not.toMatch(/\d{5}-?\d{4}/);
  });

  it("o filtro 'Clicaram' fica só com quem abriu o link", async () => {
    await monitor(ENVIADA());
    expect(linhas()).toHaveLength(7);
    await clicar(q("input[name='filtro-de-destinatario'][value='clicaram']"));
    expect(linhas().map((l) => l.getAttribute("data-envio"))).toEqual(["e3", "e4"]);
    await clicar(q("input[name='filtro-de-destinatario'][value='sairam']"));
    expect(linhas().map((l) => l.getAttribute("data-envio"))).toEqual(["e5"]);
    await clicar(q("input[name='filtro-de-destinatario'][value='falharam']"));
    expect(linhas().map((l) => l.getAttribute("data-envio"))).toEqual(["e6"]);
    await clicar(q("input[name='filtro-de-destinatario'][value='todos']"));
    expect(linhas()).toHaveLength(7);
  });

  it("o nome só é link para o lead com `podeAbrirLead`", async () => {
    await monitor(ENVIADA());
    expect(q("[data-destinatarios]").querySelector("a")).toBeNull();
    expect(container.innerHTML).not.toContain("/admin/leads/");
    act(() => root.unmount());
    container.remove();

    await monitor(ENVIADA(), { podeAbrirLead: true });
    const links = [...q("[data-destinatarios]").querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toContain("/admin/leads/lead-e1");
    // Sem lead, não há para onde ir.
    expect(linhas()[5].querySelector("a")).toBeNull();
    expect(links).toHaveLength(6);
  });

  it("o funil sai em cartões e em barras com os mesmos números, e explica 'Na operadora'", async () => {
    await monitor(ENVIADA());
    expect(q("[data-etapa='publico']").textContent).toContain("7");
    expect(q("[data-etapa='clicaram']").textContent).toContain("40% dos enviados");
    const grafico = q("[data-grafico-do-funil]");
    expect(grafico.getAttribute("role")).toBe("img");
    expect(grafico.getAttribute("aria-label")).toContain("Clicaram 2");
    expect(grafico.querySelector("[data-barra='clicaram']")!.textContent).toBe("Clicaram2");
    expect(container.textContent).toContain("não confirma a entrega no aparelho");
    expect(q("[data-cartao='leads-novos']").textContent).toContain("utm_campaign=sms-k7m2p9q");
    expect(q("[data-cartao='custo']").textContent).toMatch(/0,45/);
    expect(q("a[href='/admin/estoque/12']").textContent).toBe("Citroën C4 Cactus 2022");
  });

  it("mostra os canais filtrados e o descanso; sem filtro, diz 'todos os canais'", async () => {
    await monitor(campanha());
    expect(q("[data-canais-da-campanha]").textContent).toContain("Todos os canais");
    expect(q("[data-descanso-da-campanha]").textContent).toContain(`${DESCANSO_PADRAO} dias`);
    expect(q("[data-quem-recebe]").textContent).toContain("Interesse em: este carro, nos últimos 180 dias");
    act(() => root.unmount());
    container.remove();

    await monitor(campanha({ canais: ["Instagram", "OLX"], descansoDias: 0 }));
    expect(q("[data-canais-da-campanha]").textContent).toContain("Instagram, OLX");
    expect(q("[data-descanso-da-campanha]").textContent).toContain("Sem descanso");
  });

  it("campanha sem carro: o monitor diz isso e não cria link para o estoque", async () => {
    await monitor(campanha({ veiculoId: null, veiculoRotulo: null, criterio: "interessados", destino: "/estoque", mensagem: MENSAGEM_PADRAO_SEM_CARRO }));
    const carro = q("[data-carro-da-campanha='sem-carro']");
    expect(carro.textContent).toContain("Sem carro · link para o estoque");
    expect(carro.querySelector("a")).toBeNull();
    expect(container.innerHTML).not.toContain("/admin/estoque/");
    expect(container.innerHTML).not.toContain("null");
    expect(q("[data-quem-recebe]").textContent).toContain("Perfil: interessados, com contato nos últimos 180 dias");
    expect(q("[data-enviar]").textContent).toBe("Enviar para 5 pessoas");
  });

  it("mostra o filtro de compra, quando há, e para onde o link leva", async () => {
    await monitor(campanha());
    expect(q("[data-quem-recebe] [data-filtro-de-compra]")).toBeNull();
    expect(q("[data-quem-recebe] [data-destino-do-link]").textContent).toBe("O link leva para a ficha do carro.");
    act(() => root.unmount());
    container.remove();

    await monitor(campanha({ veiculoId: null, veiculoRotulo: null, criterio: "clientes", compraHaMeses: 24, destino: "/avaliacao", mensagem: MENSAGEM_PADRAO_DE_TROCA }));
    const quem = q("[data-quem-recebe]");
    expect(quem.textContent).toContain("Perfil: clientes, com contato nos últimos 180 dias, comprou há pelo menos 2 anos");
    expect(quem.querySelector("[data-destino-do-link]")!.textContent).toBe("O link leva para a avaliação do usado.");
    expect(q("[data-carro-da-campanha='sem-carro']").textContent).toContain("Sem carro · link para a avaliação do usado");
    expect(container.innerHTML).not.toContain("null");
    act(() => root.unmount());
    container.remove();

    await monitor(campanha({ veiculoId: null, veiculoRotulo: null, criterio: "todos", compraHaMeses: 18, destino: "/estoque" }));
    expect(q("[data-quem-recebe]").textContent).toContain("comprou há pelo menos 1 ano e meio");
    expect(q("[data-destino-do-link]").textContent).toBe("O link leva para o estoque.");
    act(() => root.unmount());
    container.remove();

    // Moto é ficha; caminho que a tela não conhece sai como veio.
    await monitor(campanha({ destino: "/motos/honda-cb-500-2022-31" }));
    expect(q("[data-destino-do-link]").textContent).toBe("O link leva para a ficha do carro.");
    act(() => root.unmount());
    container.remove();

    await monitor(campanha({ veiculoId: null, veiculoRotulo: null, criterio: "interessados", destino: "/feirao" }));
    expect(q("[data-destino-do-link]").textContent).toBe("O link leva para /feirao.");
  });

  it("em homologação, a tela avisa que os envios são de teste", async () => {
    await monitor(campanha({ homologacao: true }));
    expect(q("[data-aviso='homologacao']").textContent).toContain("de teste");
  });
});
