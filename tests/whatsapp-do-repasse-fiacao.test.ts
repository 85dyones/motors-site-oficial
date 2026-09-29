// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, createElement, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CompanySettings, Veiculo } from "../src/types";
import { mensagemDePerguntaDoRepasse, mensagemDoRepasse } from "../src/lib/mensagensDoVeiculo";
import { CARD_DO_REPASSE, FICHA_DO_REPASSE, PERGUNTAS_DO_REPASSE_CABECALHO } from "../src/lib/paginaDoRepasse";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * O pré-cadastro antes do WhatsApp do repasse, montado de verdade (pedido do
 * dono em 28/09): "ao clicar no botão 'quero este repasse', o mecanismo
 * precisa funcionar exatamente como o 'falar com o consultor'".
 *
 * As páginas são as de produção (a ficha e `/repasse`), montadas no jsdom com
 * os dublês de sempre: leitura dos repasses, estoque, tema, Turnstile e
 * imagem. A medição é a de verdade, com um espião em volta — é ela que prova
 * que nenhum id de repasse chega ao Pixel, ao GA4 ou ao `dataLayer`.
 *
 * Os quatro botões do pedido: "QUERO ESTE REPASSE" da ficha, "QUERO ESTE" da
 * barra do celular, o do card do lote e o "PERGUNTAR NO WHATSAPP" das
 * perguntas. E o "PERGUNTAR NO WHATSAPP" da ficha reservada ou vendida, que
 * também é botão de WhatsApp e passa pelo mesmo modal com a mensagem dele.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const estado = vi.hoisted(() => ({ porSlug: {} as Record<string, unknown>, repasses: [] as unknown[] }));
const medicao = vi.hoisted(() => ({ leads: [] as unknown[][], contatos: [] as unknown[][] }));

const EMPRESA = {
  name: "Motors Store",
  phone: "",
  whatsapp: "(41) 99737-2165",
  whatsappRaw: "5541997372165",
  address: "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350",
  hours: "",
  instagram: "",
  facebook: "",
  cnpj: "",
} as CompanySettings;

vi.mock("../src/lib/leituraDosRepasses", () => ({
  lerRepassePorSlug: async (slug: string) => estado.porSlug[slug] ?? null,
  lerRepassePorSufixo: async () => [],
  lerRepassesPublicos: async () => estado.repasses,
}));
vi.mock("../src/lib/supabase", () => ({
  getEstoque: async (): Promise<Veiculo[]> => [],
  getVeiculoPdpUrl: (v: { id: string }) => `/carros/marca/modelo/versao-${v.id}`,
}));
vi.mock("../src/lib/settings", () => ({ getCachedSettings: async () => ({ companySettings: EMPRESA }) }));
vi.mock("../src/app/ThemeContext", () => ({ useTheme: () => ({ companySettings: EMPRESA }) }));
vi.mock("../src/components/Turnstile", () => ({
  default: function TurnstileFalso({ onSuccess }: { onSuccess: (t: string) => void }) {
    useEffect(() => {
      onSuccess("token-de-teste");
    }, [onSuccess]);
    return null;
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  permanentRedirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _fill, sizes: _sizes, priority: _priority, unoptimized: _uo, fetchPriority: _fp, loading: _l, ...resto } = props;
    return createElement("img", resto as never);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));
// No navegador o modal chega por `next/dynamic` (ssr: false), carregado à
// parte. Aqui o carregador devolve o componente de verdade, já importado: o
// que se testa é o modal, não o empacotador.
vi.mock("next/dynamic", async () => {
  const { default: LeadCaptureModal } = await import("../src/components/LeadCaptureModal");
  return { default: () => LeadCaptureModal };
});
vi.mock("../src/lib/telemetry", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/telemetry")>();
  return {
    ...real,
    trackLeadSubmission: (...args: Parameters<typeof real.trackLeadSubmission>) => {
      medicao.leads.push(args);
      return real.trackLeadSubmission(...args);
    },
    trackContactClick: (...args: Parameters<typeof real.trackContactClick>) => {
      medicao.contatos.push(args);
      return real.trackContactClick(...args);
    },
  };
});

const ficha = await import("../src/app/repasse/[carro]/page");
const pagina = await import("../src/app/repasse/page");
const { default: WhatsAppDoRepasse } = await import("../src/components/repasse/WhatsAppDoRepasse");

const SLUG = "renault-kwid-zen-1-0-2021-3f9a1c";
const ABERTO = repasseDeTeste({ situacao: "publicado", lojistas_desde: "2026-09-22T12:00:00Z", aberto_ao_publico_em: "2026-09-24T12:00:00Z" });
const RESERVADO = repasseDeTeste({
  situacao: "reservado",
  lojistas_desde: "2026-09-20T12:00:00Z",
  aberto_ao_publico_em: "2026-09-20T12:00:00Z",
  reservado_em: "2026-09-23T12:00:00Z",
});
const VENDIDO = repasseDeTeste({
  situacao: "vendido",
  lojistas_desde: "2026-09-10T12:00:00Z",
  aberto_ao_publico_em: "2026-09-10T12:00:00Z",
  vendido_em: "2026-09-20T12:00:00Z",
});
const ID = ABERTO.id;
const AG_UID = "0dcb1cdc-1111-4222-8333-444455556666";
const REF = " (Ref: 0DCB1CDC)";

let container: HTMLDivElement;
let root: Root | null = null;
let posts: Array<{ url: string; corpo: Record<string, unknown> }>;
let resposta: { status: number } | "rede";
let ordem: string[];
let abrirJanela: ReturnType<typeof vi.fn>;
let fbq: ReturnType<typeof vi.fn>;
let gtag: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-24T15:00:00Z")); // qui 24/09, 12h em Curitiba
  estado.porSlug = {};
  estado.repasses = [];
  medicao.leads = [];
  medicao.contatos = [];
  posts = [];
  ordem = [];
  resposta = { status: 200 };
  localStorage.clear();
  localStorage.setItem("ag_uid", AG_UID);
  window.dataLayer = [];
  fbq = vi.fn();
  gtag = vi.fn();
  window.fbq = fbq;
  window.gtag = gtag;
  abrirJanela = vi.fn(() => {
    ordem.push("whatsapp");
    return null;
  });
  vi.stubGlobal("open", abrirJanela);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opcoes?: RequestInit) => {
      posts.push({ url: String(url), corpo: JSON.parse(String(opcoes?.body ?? "{}")) });
      if (String(url) === "/api/leads") ordem.push("post");
      if (resposta === "rede") throw new TypeError("Failed to fetch");
      const { status } = resposta;
      return { ok: status >= 200 && status < 300, status, json: async () => ({}) } as never;
    }),
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete window.fbq;
  delete window.gtag;
});

async function assentar(voltas = 4) {
  for (let i = 0; i < voltas; i++) {
    await act(async () => {
      await new Promise((pronto) => setTimeout(pronto, 0));
    });
  }
}

async function montar(elemento: ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(elemento));
  await assentar();
}

const montarFicha = async (r = ABERTO) => {
  estado.porSlug[SLUG] = r;
  window.history.replaceState(null, "", `/repasse/${SLUG}`);
  await montar(await ficha.default({ params: Promise.resolve({ carro: SLUG }) }));
};
const montarPagina = async (repasses = [ABERTO]) => {
  estado.repasses = repasses;
  window.history.replaceState(null, "", "/repasse");
  await montar(await pagina.default());
};

const botoes = (texto: string) =>
  [...document.querySelectorAll("button")].filter((b) => b.textContent?.trim() === texto);
const dialogo = () => document.querySelector('[role="dialog"]');
const linksDoWhatsApp = () => document.querySelectorAll('a[href*="wa.me"]');

function digitar(el: HTMLInputElement, valor: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, valor);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function clicar(botao: HTMLButtonElement | undefined) {
  expect(botao, "botão não encontrado").toBeDefined();
  await act(async () => botao?.click());
  await assentar();
}

async function preencherEEnviar() {
  const modal = dialogo();
  expect(modal, "o modal não abriu").not.toBeNull();
  await act(async () => digitar(modal?.querySelector("#lead-name-input") as HTMLInputElement, "Ana Souza"));
  await act(async () => digitar(modal?.querySelector("#lead-phone-input") as HTMLInputElement, "41997372165"));
  await act(async () => (modal?.querySelector("form") as HTMLFormElement).requestSubmit());
  await assentar(6);
}

const postDoLead = () => posts.find((p) => p.url === "/api/leads");
const linkEsperado = (mensagem: string) => `https://wa.me/5541997372165?text=${encodeURIComponent(mensagem)}`;

describe("os botões abrem o pré-cadastro, e não o wa.me", () => {
  it("ficha aberta: QUERO ESTE REPASSE e a barra QUERO ESTE são botões, e cada um abre o modal do carro", async () => {
    await montarFicha();
    expect(linksDoWhatsApp()).toHaveLength(0);

    await clicar(botoes(FICHA_DO_REPASSE.quero)[0]);
    expect(dialogo()?.textContent).toContain("Interesse no veículo");
    expect(dialogo()?.textContent).toContain("Renault Kwid (2021)");
    expect(abrirJanela).not.toHaveBeenCalled();
    await clicar(dialogo()?.querySelector('button[aria-label="Fechar modal"]') as HTMLButtonElement);
    expect(dialogo()).toBeNull();

    await clicar(botoes(FICHA_DO_REPASSE.queroEste)[0]);
    expect(dialogo()?.textContent).toContain("Renault Kwid (2021)");
    expect(abrirJanela).not.toHaveBeenCalled();
    expect(posts.filter((p) => p.url === "/api/leads")).toEqual([]);
  });

  it("card do lote: QUERO ESTE REPASSE é botão e abre o modal", async () => {
    await montarPagina();
    expect(linksDoWhatsApp()).toHaveLength(0);
    await clicar(botoes(CARD_DO_REPASSE.quero)[0]);
    expect(dialogo()?.textContent).toContain("Renault Kwid (2021)");
    expect(abrirJanela).not.toHaveBeenCalled();
  });

  it("perguntas de /repasse: PERGUNTAR NO WHATSAPP é botão e abre o modal, sem carro", async () => {
    await montarPagina();
    await clicar(botoes(PERGUNTAS_DO_REPASSE_CABECALHO.botao)[0]);
    expect(dialogo()).not.toBeNull();
    expect(dialogo()?.textContent).not.toContain("Interesse no veículo");
    expect(abrirJanela).not.toHaveBeenCalled();
  });

  it.each([
    ["reservada", RESERVADO],
    ["vendida", VENDIDO],
  ])("ficha %s: o PERGUNTAR NO WHATSAPP também passa pelo modal", async (_caso, r) => {
    await montarFicha(r);
    expect(linksDoWhatsApp()).toHaveLength(0);
    await clicar(botoes(PERGUNTAS_DO_REPASSE_CABECALHO.botao)[0]);
    expect(dialogo()?.textContent).toContain("Renault Kwid (2021)");
  });

  it("sem número da loja, não há botão (o mesmo que o link vazio fazia)", async () => {
    const semNumero = { assunto: { carro: null }, whatsappDaLoja: { whatsappRaw: "", whatsapp: "" }, origem: "repasse-perguntas" };
    await montar(createElement(WhatsAppDoRepasse, semNumero as never, PERGUNTAS_DO_REPASSE_CABECALHO.botao));
    expect(document.querySelectorAll("button")).toHaveLength(0);
  });
});

describe("o envio: grava o lead, mede e abre o WhatsApp com a mensagem do repasse", () => {
  it("QUERO ESTE REPASSE: POST no canal do WhatsApp com o id, depois o wa.me com a referência", async () => {
    await montarFicha();
    await clicar(botoes(FICHA_DO_REPASSE.quero)[0]);
    await preencherEEnviar();

    const mensagem = mensagemDoRepasse(ABERTO, "aberto", REF);
    expect(mensagem).toContain("Ref.: repasse 3f9a1c");
    const corpo = postDoLead()?.corpo;
    expect(corpo).toMatchObject({
      canal: "repasse-whatsapp",
      mensagem,
      turnstileToken: "token-de-teste",
      cliente: { nome: "Ana Souza", whatsapp: "(41) 99737-2165" },
      intencao_busca: { repasse: { tipo: "whatsapp", repasse_id: ID, slug: SLUG } },
      contentName: "Renault Kwid",
      agUid: AG_UID,
    });
    expect(corpo).not.toHaveProperty("veiculo");
    expect(typeof corpo?.eventId).toBe("string");

    expect(abrirJanela).toHaveBeenCalledTimes(1);
    expect(abrirJanela).toHaveBeenCalledWith(linkEsperado(mensagem), "_blank", "noopener,noreferrer");
    // Grava, DEPOIS abre o WhatsApp.
    expect(ordem).toEqual(["post", "whatsapp"]);
    // O modal fecha depois do envio.
    expect(dialogo()).toBeNull();
  });

  it("a medição: Lead com o mesmo eventId do POST, tipo e formulário do repasse, e o clique pós-lead", async () => {
    await montarFicha();
    await clicar(botoes(FICHA_DO_REPASSE.queroEste)[0]);
    await preencherEEnviar();

    const eventId = postDoLead()?.corpo.eventId;
    expect(medicao.leads).toHaveLength(1);
    expect(medicao.leads[0][0]).toEqual({ marca: "Renault", modelo: "Kwid", preco: 36900 });
    expect(medicao.leads[0][2]).toMatchObject({
      presetEventId: eventId,
      tipoDeLead: "proposta",
      formId: "form-whatsapp-repasse",
      phoneE164: "+5541997372165",
    });
    expect(medicao.contatos).toEqual([
      ["whatsapp", "repasse-barra", { vehicle_name: "Renault Kwid Zen 1.0", vehicle_price: 36900, pos_lead: true }],
    ]);
    const lead = fbq.mock.calls.find((c) => c[0] === "track" && c[1] === "Lead");
    expect(lead?.[3]).toEqual({ eventID: eventId });
    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({ event: "generate_lead", lead_type: "proposta", form_id: "form-whatsapp-repasse", lead_id: eventId }),
    );
    expect(window.dataLayer).toContainEqual(expect.objectContaining({ event: "form_start", form_id: "form-whatsapp-repasse" }));
  });

  it("nenhum id de repasse chega ao Pixel, ao GA4, ao dataLayer ou à CAPI do navegador", async () => {
    await montarFicha();
    await clicar(botoes(FICHA_DO_REPASSE.quero)[0]);
    await preencherEEnviar();

    // Controle: o id existe e viaja — só no corpo do lead, para a rota conferir o carro.
    expect(JSON.stringify(postDoLead()?.corpo)).toContain(ID);
    expect(fbq).toHaveBeenCalled();
    expect(window.dataLayer?.length).toBeGreaterThan(0);

    const lead = fbq.mock.calls.find((c) => c[0] === "track" && c[1] === "Lead");
    expect(lead, "o Pixel não recebeu o Lead").toBeDefined();
    expect((lead?.[2] as Record<string, unknown>).content_ids).toBeUndefined();
    expect(JSON.stringify(fbq.mock.calls)).not.toContain(ID);
    expect(JSON.stringify(gtag.mock.calls)).not.toContain(ID);
    expect(JSON.stringify(window.dataLayer)).not.toContain(ID);
    expect(JSON.stringify(posts.filter((p) => p.url !== "/api/leads"))).not.toContain(ID);
    const generateLead = window.dataLayer?.find((e) => e.event === "generate_lead");
    expect(generateLead).toBeDefined();
    expect(generateLead?.vehicle_id).toBeUndefined();
  });

  it.each([
    ["a rota recusa (500)", { status: 500 }],
    ["o captcha é recusado (403)", { status: 403 }],
    ["a rede cai", "rede" as const],
  ])("%s: o WhatsApp abre do mesmo jeito — o POST nunca bloqueia", async (_caso, falha) => {
    resposta = falha;
    await montarFicha();
    await clicar(botoes(FICHA_DO_REPASSE.quero)[0]);
    await preencherEEnviar();
    expect(abrirJanela).toHaveBeenCalledWith(linkEsperado(mensagemDoRepasse(ABERTO, "aberto", REF)), "_blank", "noopener,noreferrer");
  });

  it("card do lote: mesmo canal, o id do carro, e o rótulo do card no clique", async () => {
    await montarPagina();
    await clicar(botoes(CARD_DO_REPASSE.quero)[0]);
    await preencherEEnviar();
    expect(postDoLead()?.corpo).toMatchObject({ canal: "repasse-whatsapp", intencao_busca: { repasse: { repasse_id: ID } } });
    expect(medicao.contatos[0]?.[1]).toBe("repasse-card");
    expect(abrirJanela).toHaveBeenCalledWith(linkEsperado(mensagemDoRepasse(ABERTO, "aberto", REF)), "_blank", "noopener,noreferrer");
  });

  it("perguntas: mesmo canal SEM id, a mensagem da pergunta e o lead de contato", async () => {
    await montarPagina();
    await clicar(botoes(PERGUNTAS_DO_REPASSE_CABECALHO.botao)[0]);
    await preencherEEnviar();
    const corpo = postDoLead()?.corpo;
    expect(corpo).toMatchObject({ canal: "repasse-whatsapp", mensagem: mensagemDePerguntaDoRepasse(REF), contentName: "Repasse Motors Pergunta" });
    expect(corpo?.intencao_busca).toEqual({ repasse: { tipo: "whatsapp", caminho: "/repasse" } });
    expect(medicao.leads[0][0]).toEqual({ marca: "Repasse Motors", modelo: "Pergunta", preco: 0 });
    expect(medicao.leads[0][2]).toMatchObject({ tipoDeLead: "contato", formId: "form-whatsapp-repasse" });
    expect(medicao.contatos).toEqual([["whatsapp", "repasse-perguntas", { pos_lead: true }]]);
    expect(abrirJanela).toHaveBeenCalledWith(linkEsperado(mensagemDePerguntaDoRepasse(REF)), "_blank", "noopener,noreferrer");
  });

  it("ficha reservada: o lead leva o id e a mensagem do reservado, não a do quero este", async () => {
    await montarFicha(RESERVADO);
    await clicar(botoes(PERGUNTAS_DO_REPASSE_CABECALHO.botao)[0]);
    await preencherEEnviar();
    const mensagem = mensagemDoRepasse(RESERVADO, "reservado", REF);
    expect(postDoLead()?.corpo).toMatchObject({ canal: "repasse-whatsapp", mensagem, intencao_busca: { repasse: { repasse_id: ID } } });
    expect(abrirJanela).toHaveBeenCalledWith(linkEsperado(mensagem), "_blank", "noopener,noreferrer");
  });
});

// Revisão de 29/09: o "Interesse no veículo" do modal saía com o cadastro cru,
// "FIAT PALIO (2010)", na ficha e no card do lote. Só o nome do MODAL passa
// pela grafia da casa; a mensagem do WhatsApp segue com o carro do banco.
describe("o modal nomeia o carro na grafia da casa", () => {
  const PALIO = repasseDeTeste({
    situacao: "publicado",
    lojistas_desde: "2026-09-22T12:00:00Z",
    aberto_ao_publico_em: "2026-09-24T12:00:00Z",
    marca: "FIAT",
    modelo: "PALIO",
    versao: "1.0 ECONOMY FIRE FLEX 8V 4P",
    ano_modelo: 2010,
    ano_fabricacao: 2010,
  });

  it("ficha: Fiat Palio (2010), e não FIAT PALIO", async () => {
    await montarFicha(PALIO);
    await clicar(botoes(FICHA_DO_REPASSE.quero)[0]);
    expect(dialogo()?.textContent).toContain("Fiat Palio (2010)");
    expect(dialogo()?.textContent).not.toContain("PALIO");
  });

  it("card do lote: o mesmo nome", async () => {
    await montarPagina([PALIO]);
    await clicar(botoes(CARD_DO_REPASSE.quero)[0]);
    expect(dialogo()?.textContent).toContain("Fiat Palio (2010)");
    expect(dialogo()?.textContent).not.toContain("PALIO");
  });

  it("a mensagem do WhatsApp segue com o carro como está no banco", async () => {
    await montarFicha(PALIO);
    await clicar(botoes(FICHA_DO_REPASSE.quero)[0]);
    await preencherEEnviar();
    expect(abrirJanela).toHaveBeenCalledWith(linkEsperado(mensagemDoRepasse(PALIO, "aberto", REF)), "_blank", "noopener,noreferrer");
  });
});
