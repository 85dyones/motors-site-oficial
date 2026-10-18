// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NIVEIS_DO_CPF, PRODUTOS, precoDeReferencia } from "../src/lib/consultaDeDocumento";
import type { ConsultaDeDocumentoNaLista } from "../src/lib/consultaDeDocumento-servidor";
import type { RelatorioDeDocumento } from "../src/lib/relatorioDeDocumento";
import { LINHA_DOS_PARAMETROS } from "./supabaseDaConsultaDeDocumento";

/**
 * A tela da consulta de CPF e CNPJ montada de verdade (18/10/2026): só o
 * `fetch`, o `next/navigation` e o diálogo de confirmação são dublados.
 *
 * O que só a fiação prova é o caminho do dinheiro: os níveis só aparecem com
 * documento válido; o botão de pagar só acende com nível, finalidade e a
 * declaração do titular; depois de uma consulta (ou de uma falha que pode ter
 * cobrado) a declaração volta em branco, para mais um clique não cobrar de
 * novo; o 409 da trava pergunta outra vez antes de pagar; e o link de um
 * cliente nunca fica na tela de outro.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

let respostasDoConfirm: boolean[];
const confirm = vi.fn<(o: { title: string; confirmLabel?: string; cancelLabel?: string; message?: string }) => Promise<boolean>>(async () => respostasDoConfirm.shift() ?? true);
vi.mock("../src/components/admin/ConfirmDialog", () => ({ useConfirm: () => ({ confirm }) }));

const ID_A = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ID_B = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";

const relatorio = (titular: string, documento = "123.456.789-09"): RelatorioDeDocumento => ({
  tipo: "cpf",
  documento,
  titular,
  nivel: "Completo integral",
  geradoEm: new Date().toISOString(),
  homologacao: false,
  resumo: [],
  secoes: [],
  faltou: [],
});
const item = (id: string, extra: Partial<ConsultaDeDocumentoNaLista> = {}): ConsultaDeDocumentoNaLista => ({
  id,
  tipo: "cpf",
  documento: "***.456.789-**",
  nome: "JOAO",
  nivel: "completo_integral",
  nivelRotulo: "Completo integral",
  situacao: "completa",
  finalidade: "Financiamento",
  custo: 33.52,
  homologacao: false,
  quem: "Ana",
  quando: "2026-10-18T14:50:00.000Z",
  ...extra,
});
const NIVEIS = NIVEIS_DO_CPF.map((n) => ({ ...n, preco: precoDeReferencia(n, LINHA_DOS_PARAMETROS.precos_de_referencia), nomesDosProdutos: n.produtos.map((p) => PRODUTOS[p].nome) }));

interface Pedida {
  url: string;
  metodo: string;
  corpo: Record<string, unknown> | null;
}
type RespostaFalsa = { status: number; corpo?: unknown };

let pedidas: Pedida[];
/** As respostas do `consultar`, na ordem. */
let respostasDaConsulta: RespostaFalsa[];
/**
 * Depois do primeiro `estimar`, os seguintes ficam no ar (nunca voltam). Ver o BUG abaixo: o
 * `estimar` que a falha dispara apaga o aviso; segurá-lo deixa ler o aviso que a tela compôs.
 */
let segurarEstimar: boolean;
/** Os links que `GET /api/consulta-documento/[id]` devolve. */
let linksDaConsulta: Array<Record<string, unknown>>;
let container: HTMLDivElement;
let root: Root;

const resposta = ({ status, corpo }: RespostaFalsa) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => (corpo === undefined ? Promise.reject(new SyntaxError("Unexpected token <")) : corpo),
});

async function montar(props: Record<string, unknown> = {}) {
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    const metodo = opcoes?.method ?? "GET";
    const corpo = opcoes?.body ? (JSON.parse(String(opcoes.body)) as Record<string, unknown>) : null;
    pedidas.push({ url, metodo, corpo });
    if (url === "/api/consulta-documento" && corpo?.acao === "estimar") {
      if (segurarEstimar && pedidas.filter((p) => p.corpo?.acao === "estimar").length > 1) return new Promise(() => {});
      return resposta({ status: 200, corpo: { niveis: NIVEIS, recentes: [], tabelaDePrecosEm: "2026-10-18", diasDeConsultaRecente: 90, temToken: true, homologacao: false } });
    }
    if (url === "/api/consulta-documento" && corpo?.acao === "consultar") return resposta(respostasDaConsulta.shift() ?? { status: 500 });
    const links = url.match(/^\/api\/consulta-documento\/([^/]+)\/links$/);
    if (links) return resposta({ status: 200, corpo: { id: "link-novo", url: `https://www.motorsstore.com.br/relatorio/${"T".repeat(43)}`, expiraEm: "2026-10-25T11:59:00.000Z" } });
    if (url.startsWith("/api/consulta-documento/links/")) return resposta({ status: 200, corpo: { ok: true } });
    const aberta = url.match(/^\/api\/consulta-documento\/([^/?]+)$/);
    if (aberta) {
      const id = aberta[1];
      return resposta({ status: 200, corpo: { id, relatorio: relatorio(id === ID_B ? "MARIA DE B" : "JOAO DE A"), item: item(id), links: linksDaConsulta } });
    }
    return resposta({ status: 404, corpo: { error: "rota desconhecida" } });
  }) as never;
  const { default: ConsultaDeDocumentos } = await import("../src/components/admin/documentos/ConsultaDeDocumentos");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(ConsultaDeDocumentos, { historico: { ok: true, itens: [item(ID_B, { nome: "MARIA DE B" })] }, temToken: true, homologacao: false, ...props } as never));
  });
}

const cpf = () => container.querySelector("[data-aba=cpf]") as HTMLElement;
const no = <T extends Element = HTMLElement>(seletor: string, dentro: ParentNode = cpf()) => dentro.querySelector(seletor) as T | null;
const botaoDePagar = () => no<HTMLButtonElement>("[data-consultar]");
const assentar = () =>
  act(async () => {
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
  });

async function digitar(campo: HTMLInputElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(campo, valor);
    campo.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await assentar();
}
async function clicar(el: Element | null) {
  expect(el, "elemento para clicar").toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await assentar();
}
async function escolherFinalidade(valor: string) {
  const select = no<HTMLSelectElement>("[data-finalidade]")!;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(select, valor);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
/** CPF válido, nível integral, finalidade e declaração: o formulário pronto para pagar. */
async function preencher() {
  await digitar(no<HTMLInputElement>("[data-documento=cpf]")!, "123.456.789-09");
  await clicar(no("[data-nivel=completo_integral] input[type=radio]"));
  await escolherFinalidade("financiamento");
  await clicar(no("[data-ciente]"));
}
const consultas = () => pedidas.filter((p) => p.corpo?.acao === "consultar");
const estimativas = () => pedidas.filter((p) => p.corpo?.acao === "estimar");
/** O texto como a tela mostra, com o espaço fino do BRL trocado por espaço comum. */
const texto = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s/g, " ");
const alerta = () => texto(no("[role=alert]"));
const SUCESSO = (id: string, titular: string): RespostaFalsa => ({ status: 200, corpo: { id, situacao: "completa", relatorio: relatorio(titular), custo: 33.52, avisos: [] } });

beforeEach(() => {
  pedidas = [];
  respostasDaConsulta = [];
  linksDaConsulta = [];
  respostasDoConfirm = [];
  segurarEstimar = false;
  confirm.mockClear();
  refresh.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

// ─────────────────────────────────────────────────────────────────────────────

describe("antes de pagar", () => {
  it("os níveis só aparecem com CPF válido, e vêm do servidor com o preço da tabela — o 'estimar' não é a consulta paga", async () => {
    await montar();
    await digitar(no<HTMLInputElement>("[data-documento=cpf]")!, "123.456.789-1");
    expect(pedidas).toEqual([]);
    expect(cpf().querySelectorAll("[data-nivel]")).toHaveLength(0);
    await digitar(no<HTMLInputElement>("[data-documento=cpf]")!, "123.456.789-09");
    expect(pedidas).toEqual([{ url: "/api/consulta-documento", metodo: "POST", corpo: { acao: "estimar", tipo: "cpf", documento: "12345678909" } }]);
    expect([...cpf().querySelectorAll("[data-nivel]")].map((n) => n.getAttribute("data-nivel"))).toEqual(["basico", "dados", "credito", "completo_economico", "completo_integral"]);
    expect(texto(no("[data-nivel=completo_integral]"))).toContain("R$ 33,52");
    expect(cpf().textContent).toContain("tabela da APIBrasil de 18/10/2026");
  });

  it("o botão de pagar só acende com nível, finalidade e a declaração do titular", async () => {
    await montar();
    await digitar(no<HTMLInputElement>("[data-documento=cpf]")!, "123.456.789-09");
    expect(botaoDePagar()?.disabled).toBe(true);
    await clicar(no("[data-nivel=completo_integral] input[type=radio]"));
    expect(botaoDePagar()?.disabled).toBe(true);
    await escolherFinalidade("financiamento");
    expect(botaoDePagar()?.disabled).toBe(true);
    await clicar(no("[data-ciente]"));
    expect(botaoDePagar()?.disabled).toBe(false);
    expect(texto(botaoDePagar())).toBe("Consultar · R$ 33,52");
    // Desmarcar a declaração apaga de novo.
    await clicar(no("[data-ciente]"));
    expect(botaoDePagar()?.disabled).toBe(true);
    expect(consultas()).toEqual([]);
  });

  it("quem cancela a confirmação não paga", async () => {
    respostasDoConfirm = [false];
    await montar();
    await preencher();
    await clicar(botaoDePagar());
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toMatchObject({ title: "Consulta paga", confirmLabel: "Consultar e pagar" });
    expect(consultas()).toEqual([]);
  });
});

describe("o caminho do dinheiro", () => {
  it("sucesso: uma confirmação, o pedido com finalidade e declaração, o relatório aberto — e a declaração e o nível voltam em branco", async () => {
    respostasDaConsulta = [SUCESSO(ID_A, "JOAO DE A")];
    await montar();
    await preencher();
    await clicar(botaoDePagar());
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(consultas().map((c) => c.corpo)).toEqual([
      { acao: "consultar", tipo: "cpf", documento: "12345678909", nivel: "completo_integral", finalidade: "financiamento", titularCiente: true, repetir: false },
    ]);
    expect(container.querySelector("[data-relatorio-aberto]")?.textContent).toContain("JOAO DE A");
    expect(texto(container.querySelector("[data-relatorio-aberto]"))).toContain("Esta consulta custou R$ 33,52.");
    expect(no<HTMLInputElement>("[data-ciente]")?.checked).toBe(false);
    expect(cpf().querySelector("[data-nivel] input[type=radio]:checked")).toBeNull();
    expect(botaoDePagar()?.disabled).toBe(true);
    // O `estimar` roda de novo (para a recém-feita entrar em "já consultado") e a página recarrega.
    expect(estimativas()).toHaveLength(2);
    expect(refresh).toHaveBeenCalled();
  });

  it("409 da trava abre a segunda confirmação; confirmar paga de novo com repetir:true", async () => {
    respostasDaConsulta = [{ status: 409, corpo: { error: "Consultado há pouco.", repeticao: item(ID_A) } }, SUCESSO(ID_B, "JOAO DE NOVO")];
    respostasDoConfirm = [true, true];
    await montar();
    await preencher();
    await clicar(botaoDePagar());
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(confirm.mock.calls[1][0]).toMatchObject({ title: "Consultado há pouco", confirmLabel: "Consultar de novo e pagar", cancelLabel: "Abrir a anterior" });
    expect(consultas().map((c) => c.corpo?.repetir)).toEqual([false, true]);
    expect(container.querySelector("[data-relatorio-aberto]")?.textContent).toContain("JOAO DE NOVO");
  });

  it("409 da trava: recusar a segunda confirmação abre a anterior, sem pagar de novo", async () => {
    respostasDaConsulta = [{ status: 409, corpo: { error: "Consultado há pouco.", repeticao: item(ID_A) } }];
    respostasDoConfirm = [true, false];
    await montar();
    await preencher();
    await clicar(botaoDePagar());
    expect(consultas()).toHaveLength(1);
    expect(pedidas.some((p) => p.url === `/api/consulta-documento/${ID_A}` && p.metodo === "GET")).toBe(true);
    expect(container.querySelector("[data-relatorio-aberto]")?.textContent).toContain("JOAO DE A");
  });

  it("409 de uma anterior que FALHOU (pode ter cobrado): a pergunta é sobre o saldo, o botão é 'Cancelar', e cancelar não abre nada", async () => {
    const motivo = "Uma tentativa deste documento neste nível, há menos de 30 minutos, não voltou mas PODE ter sido cobrada.";
    respostasDaConsulta = [{ status: 409, corpo: { error: motivo, repeticao: item(ID_A, { situacao: "falhou", custo: null }) } }];
    respostasDoConfirm = [true, false];
    await montar();
    await preencher();
    await clicar(botaoDePagar());
    expect(confirm.mock.calls[1][0]).toMatchObject({ title: "Tentativa anterior pode ter sido cobrada", cancelLabel: "Cancelar", confirmLabel: "Consultar de novo e pagar" });
    expect(confirm.mock.calls[1][0].message).toContain(motivo);
    expect(consultas()).toHaveLength(1);
    expect(pedidas.some((p) => p.url === `/api/consulta-documento/${ID_A}`)).toBe(false);
    expect(container.querySelector("[data-relatorio-aberto]")).toBeNull();
  });

  it("504 sem corpo (a Vercel cortou): avisa que PODE ter sido cobrada, a declaração volta em branco e o histórico recarrega", async () => {
    segurarEstimar = true;
    respostasDaConsulta = [{ status: 504 }];
    await montar();
    await preencher();
    await clicar(botaoDePagar());
    expect(alerta()).toBe("A consulta não voltou a tempo. Ela PODE ter sido cobrada: antes de repetir, confira o histórico e o saldo no painel da APIBrasil.");
    expect(no<HTMLInputElement>("[data-ciente]")?.checked).toBe(false);
    expect(botaoDePagar()?.disabled).toBe(true);
    expect(refresh).toHaveBeenCalled();
    // A tentativa falha entra no histórico: o `estimar` roda de novo.
    expect(estimativas()).toHaveLength(2);
    expect(container.querySelector("[data-relatorio-aberto]")).toBeNull();
  });

  it("502 com podeTerCobrado do servidor: o motivo dele e o mesmo aviso; em homologação, sem o aviso de cobrança", async () => {
    segurarEstimar = true;
    respostasDaConsulta = [{ status: 502, corpo: { error: "A consulta não voltou.", id: ID_A, podeTerCobrado: true } }];
    await montar();
    await preencher();
    await clicar(botaoDePagar());
    expect(alerta()).toContain("A consulta não voltou. Ela PODE ter sido cobrada");
    expect(no<HTMLInputElement>("[data-ciente]")?.checked).toBe(false);
    act(() => root.unmount());
    container.remove();

    pedidas = [];
    respostasDaConsulta = [{ status: 504 }];
    await montar({ homologacao: true });
    await preencher();
    await clicar(botaoDePagar());
    expect(alerta()).toBe("A consulta não voltou a tempo.");
  });

  it("402 sem saldo (não cobrou): o motivo do servidor, sem 'pode ter sido cobrada', e a declaração continua marcada", async () => {
    segurarEstimar = true;
    respostasDaConsulta = [{ status: 402, corpo: { error: "A conta da APIBrasil está sem saldo.", id: ID_A, podeTerCobrado: false } }];
    await montar();
    await preencher();
    await clicar(botaoDePagar());
    expect(alerta()).toBe("A conta da APIBrasil está sem saldo.");
    expect(no<HTMLInputElement>("[data-ciente]")?.checked).toBe(true);
  });

  // Regressão: o `estimar` que a falha dispara (para o histórico) tinha `setErro(null)` e apagava o
  // aviso de cobrança. O erro dos níveis agora é outro estado.
  it("o aviso de que a consulta PODE ter sido cobrada continua na tela depois que o histórico recarrega", async () => {
    respostasDaConsulta = [{ status: 504 }];
    await montar();
    await preencher();
    await clicar(botaoDePagar());
    expect(estimativas()).toHaveLength(2);
    expect(alerta()).toContain("Ela PODE ter sido cobrada");
  });
});

describe("o link para enviar", () => {
  it("o link gerado na consulta A some ao abrir a consulta B: o link de um cliente nunca fica na tela de outro", async () => {
    respostasDaConsulta = [SUCESSO(ID_A, "JOAO DE A")];
    await montar();
    await preencher();
    await clicar(botaoDePagar());
    await clicar(container.querySelector("[data-gerar-link]"));
    expect(pedidas.some((p) => p.url === `/api/consulta-documento/${ID_A}/links` && p.metodo === "POST")).toBe(true);
    expect(container.querySelector<HTMLInputElement>("[data-link-gerado] input")?.value).toBe(`https://www.motorsstore.com.br/relatorio/${"T".repeat(43)}`);
    // Abre B pelo histórico.
    await clicar(container.querySelector("[data-aba=historico] [data-historico-documentos] button"));
    expect(container.querySelector("[data-relatorio-aberto]")?.textContent).toContain("MARIA DE B");
    expect(container.querySelector("[data-link-gerado]")).toBeNull();
  });

  it("revogar outro link da lista mantém o recém-gerado na tela; revogar o próprio o tira", async () => {
    linksDaConsulta = [
      { id: "link-novo", expiraEm: "2099-01-01T00:00:00.000Z", revogadoEm: null, acessos: 0, ultimoAcessoEm: null, quem: "Ana", criadoEm: "2026-10-18T15:00:00.000Z" },
      { id: "link-velho", expiraEm: "2099-01-01T00:00:00.000Z", revogadoEm: null, acessos: 2, ultimoAcessoEm: null, quem: "Bia", criadoEm: "2026-10-17T15:00:00.000Z" },
    ];
    respostasDaConsulta = [SUCESSO(ID_A, "JOAO DE A")];
    respostasDoConfirm = [true, true, true];
    await montar();
    await preencher();
    await clicar(botaoDePagar());
    await clicar(container.querySelector("[data-gerar-link]"));
    const revogarDa = (linha: number) => container.querySelectorAll("[data-links] tbody tr")[linha]?.querySelector("button") ?? null;
    await clicar(revogarDa(1));
    expect(pedidas.some((p) => p.url === "/api/consulta-documento/links/link-velho" && p.metodo === "DELETE")).toBe(true);
    expect(container.querySelector("[data-link-gerado]")).not.toBeNull();
    await clicar(revogarDa(0));
    expect(pedidas.some((p) => p.url === "/api/consulta-documento/links/link-novo" && p.metodo === "DELETE")).toBe(true);
    expect(container.querySelector("[data-link-gerado]")).toBeNull();
  });
});
