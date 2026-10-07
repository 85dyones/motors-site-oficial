// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  MENSAGEM_PADRAO,
  PARTES_MAXIMAS,
  RODAPE_DE_SAIDA,
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
  destinatarios: 42,
  fora: { semCelular: 3, saiuDaLista: 1, jaComprou: 2, desistiu: 0, descartado: 0, repetido: 0 },
  exemplo: "Maria, o Citroen C4 Cactus 2022…",
  tamanho: { caracteres: 140, partes: 1, unicode: false },
  precoPorParte: 0.09,
  custoEstimado: 3.78,
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
    expect(chamadas[0].corpo).toEqual({ nome: "prévia", veiculoId: 12, criterio: "mesmo_veiculo", janelaDias: 180, mensagem: MENSAGEM_PADRAO });
    expect(q("[data-destinatarios]").textContent).toBe("42");
    const fora = q("[data-fora-do-publico]").textContent!;
    expect(fora).toContain("sem celular");
    expect(fora).toContain("pediram para sair");
    expect(fora).toContain("já compraram");
    expect(fora).not.toContain("desistiram");
    expect(fora).not.toContain("repetido");
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
    expect(chamadas).toEqual([{ url: "/api/marketing/sms/teste", metodo: "POST", corpo: { telefone: "(41) 98888-7777", veiculoId: 12, mensagem: MENSAGEM_PADRAO } }]);
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

  it("em homologação, a tela avisa que os envios são de teste", async () => {
    await monitor(campanha({ homologacao: true }));
    expect(q("[data-aviso='homologacao']").textContent).toContain("de teste");
  });
});
