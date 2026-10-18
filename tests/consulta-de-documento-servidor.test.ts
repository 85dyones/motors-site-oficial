import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseDeTeste, type Chamada, type Resposta } from "./supabaseDaConsultaDeDocumento";

/**
 * Consulta de CPF e CNPJ — a rede, o banco e os links (18/10/2026).
 *
 * O que estes testes seguram é o dinheiro e o dado pessoal:
 *  - cada resposta do gateway é lida do jeito certo (402 é saldo, 401/403 é
 *    o token, 5xx PODE ter cobrado, erro com HTTP 200 é recusa) e o custo sai
 *    de `valor_consulta` ou de `tax` em formato BR;
 *  - a chamada leva o token só no cabeçalho, `homolog` só em homologação, e
 *    o token não aparece em erro nem em log;
 *  - a consulta inteira chama os produtos ao mesmo tempo, não grava nada se
 *    nenhum respondeu, e grava com o que faltou escrito se alguns responderam;
 *  - o link guarda só o hash do token, e a página pública só o hash consulta.
 */

vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => null }));

const {
  ESPERA_DO_DOCUMENTO_MS,
  abrirConsultaDeDocumento,
  abrirLinkPublico,
  consultarProduto,
  criarLinkDoRelatorio,
  executarConsulta,
  lerChamadaDoProduto,
  lerHistoricoDeDocumentos,
  revogarLinkDoRelatorio,
} = await import("../src/lib/consultaDeDocumento-servidor");
type BuscarNoGateway = import("../src/lib/consultaDeDocumento-servidor").BuscarNoGateway;
type PedidoDeDocumento = import("../src/lib/consultaDeDocumento").PedidoDeDocumento;

const ENVELOPES = JSON.parse(readFileSync(join(__dirname, "fixtures", "apibrasil", "consultas-de-documento.json"), "utf8")) as Record<string, Record<string, unknown>>;

const TOKEN = "tok-SEGREDO-da-loja-123";
const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

interface Pedida {
  url: string;
  headers: Record<string, string>;
  corpo: Record<string, unknown>;
}

/** O gateway de mentira: responde por produto (`tipo` do corpo) e guarda o que foi pedido. */
function gateway(responder: (produto: string) => { status: number; corpo: unknown } | Error) {
  const pedidas: Pedida[] = [];
  const buscar: BuscarNoGateway = async (url, init) => {
    const corpo = JSON.parse(init.body) as Record<string, unknown>;
    pedidas.push({ url, headers: init.headers, corpo });
    const r = responder(String(corpo.tipo));
    if (r instanceof Error) throw r;
    return { status: r.status, json: async () => r.corpo };
  };
  return { buscar, pedidas };
}
const doExemplo = (produto: string) => ({ status: 200, corpo: ENVELOPES[produto] });

const banco = (responder?: (c: Chamada) => Resposta) => {
  const b = supabaseDeTeste({ responder });
  return { ...b, cliente: b.cliente as unknown as SupabaseClient };
};

let avisos: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  avisos = [vi.spyOn(console, "warn").mockImplementation(() => {}), vi.spyOn(console, "info").mockImplementation(() => {}), vi.spyOn(console, "error").mockImplementation(() => {})];
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const tudoQueFoiLogado = () => JSON.stringify(avisos.map((s) => s.mock.calls));

// ─────────────────────────────────────────────────────────────────────────────

describe("lerChamadaDoProduto: o que o gateway respondeu", () => {
  it("402 é a conta sem saldo: problema da conta, e não cobrou", () => {
    expect(lerChamadaDoProduto(402, { error: true, message: "Saldo insuficiente" })).toEqual({ ok: false, motivo: "a conta da APIBrasil está sem saldo", daConta: true, podeTerCobrado: false });
  });

  it("401 e 403 são o token recusado: problema da conta, e o motivo cita a variável, nunca o valor", () => {
    for (const status of [401, 403]) {
      const r = lerChamadaDoProduto(status, { error: true, message: "Unauthorized" });
      expect(r, String(status)).toMatchObject({ ok: false, daConta: true, podeTerCobrado: false });
      if (!r.ok) expect(r.motivo).toContain("APIBRASIL_TOKEN");
    }
  });

  it("5xx é o fornecedor fora do ar: não é da conta, e PODE ter cobrado", () => {
    for (const status of [500, 502, 503, 504]) {
      const r = lerChamadaDoProduto(status, null);
      expect(r, String(status)).toEqual({ ok: false, motivo: `a APIBrasil está fora do ar (HTTP ${status})`, daConta: false, podeTerCobrado: true });
    }
  });

  it("HTTP 200 com error:true é recusa, com a mensagem do fornecedor aparada em 200 caracteres", () => {
    const r = lerChamadaDoProduto(200, { error: true, message: `  CPF não encontrado na base ${"x".repeat(300)}` });
    expect(r).toMatchObject({ ok: false, daConta: false, podeTerCobrado: false });
    if (!r.ok) {
      expect(r.motivo.startsWith("a APIBrasil recusou: CPF não encontrado na base")).toBe(true);
      expect(r.motivo.length).toBeLessThanOrEqual("a APIBrasil recusou: ".length + 200);
    }
    // Sem mensagem, o motivo diz o HTTP.
    expect(lerChamadaDoProduto(200, { error: true })).toMatchObject({ ok: false, motivo: "a APIBrasil recusou a consulta (HTTP 200)" });
    // 4xx que não é conta também é recusa.
    expect(lerChamadaDoProduto(400, { error: true, message: "Parâmetro inválido" })).toMatchObject({ ok: false, motivo: "a APIBrasil recusou: Parâmetro inválido", daConta: false });
  });

  it("o erro no envelope interno (response.error, o do Acerta) também é recusa; 'saldo' na mensagem vira falta de saldo", () => {
    expect(lerChamadaDoProduto(200, { error: false, response: { error: true, message: "Documento inválido" } })).toMatchObject({ ok: false, motivo: "a APIBrasil recusou: Documento inválido" });
    expect(lerChamadaDoProduto(200, { error: true, message: "Crédito insuficiente para esta consulta" })).toMatchObject({ ok: false, daConta: true, motivo: "a conta da APIBrasil está sem saldo" });
  });

  it("corpo ilegível ou sem dados: pode ter cobrado, porque a consulta foi feita e a resposta não chegou inteira", () => {
    for (const corpo of [null, "texto", [], 42]) {
      expect(lerChamadaDoProduto(200, corpo), JSON.stringify(corpo)).toMatchObject({ ok: false, motivo: "a APIBrasil respondeu algo ilegível", podeTerCobrado: true });
    }
    expect(lerChamadaDoProduto(200, { error: false, message: "ok" })).toMatchObject({ ok: false, motivo: "a APIBrasil respondeu sem os dados", podeTerCobrado: true });
  });

  it("o custo vem de valor_consulta (número) e, sem ele, de tax em formato BR; sem os dois, é desconhecido", () => {
    expect(lerChamadaDoProduto(200, { error: false, valor_consulta: 4.4, tax: "9,999", data: {} })).toMatchObject({ ok: true, custo: 4.4 });
    expect(lerChamadaDoProduto(200, { error: false, tax: "1,30", data: {} })).toMatchObject({ ok: true, custo: 1.3 });
    expect(lerChamadaDoProduto(200, { error: false, tax: "4,400", data: {} })).toMatchObject({ ok: true, custo: 4.4 });
    expect(lerChamadaDoProduto(200, { error: false, tax: "0.340", data: {} })).toMatchObject({ ok: true, custo: 0.34 });
    expect(lerChamadaDoProduto(200, { error: false, data: { a: 1 } })).toEqual({ ok: true, dados: { a: 1 }, custo: null });
  });

  it("o miolo vem de data, ou de response.data no envelope do Acerta Essencial Plus", () => {
    const r = lerChamadaDoProduto(200, ENVELOPES["acerta-essencial-positivo"]);
    expect(r.ok && (r.dados as { msg: string }).msg).toBe("consulta realizada com sucesso!");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("consultarProduto: uma chamada ao gateway", () => {
  it("POST na rota /consulta/{documento}/credits com Bearer, JSON e o documento no campo do tipo — e sem homolog em produção", async () => {
    const g = gateway(doExemplo);
    const r = await consultarProduto("cpf-dados", "cpf", "12345678909", { token: TOKEN, homologacao: false, buscar: g.buscar });
    expect(r.ok).toBe(true);
    expect(g.pedidas).toEqual([
      {
        url: "https://gateway.apibrasil.io/api/v2/consulta/cpf/credits",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
        corpo: { tipo: "cpf-dados", cpf: "12345678909" },
      },
    ]);
    expect(g.pedidas[0].corpo).not.toHaveProperty("homolog");
    expect(g.pedidas[0].corpo).not.toHaveProperty("documento");
  });

  it("em homologação vai homolog:true, e o produto de CNPJ leva o campo cnpj", async () => {
    const g = gateway(doExemplo);
    await consultarProduto("dossie-credito-pj", "cnpj", "11222333000181", { token: TOKEN, homologacao: true, buscar: g.buscar });
    expect(g.pedidas[0].url).toBe("https://gateway.apibrasil.io/api/v2/consulta/cnpj/credits");
    expect(g.pedidas[0].corpo).toEqual({ tipo: "dossie-credito-pj", cnpj: "11222333000181", homolog: true });
  });

  it("a API CNPJ é a única na rota /dados/cnpj/credits", async () => {
    const g = gateway(doExemplo);
    await consultarProduto("cnpj", "cnpj", "44959669000180", { token: TOKEN, homologacao: false, buscar: g.buscar });
    expect(g.pedidas[0].url).toBe("https://gateway.apibrasil.io/api/v2/dados/cnpj/credits");
    expect(g.pedidas[0].corpo).toEqual({ tipo: "cnpj", cnpj: "44959669000180" });
  });

  it("falha de rede vira 'pode ter cobrado', e a mensagem do erro (que pode carregar o token) não vai para o motivo", async () => {
    const g = gateway(() => new Error(`connect ECONNREFUSED Authorization: Bearer ${TOKEN}`));
    const r = await consultarProduto("cpf-lite", "cpf", "12345678909", { token: TOKEN, homologacao: false, buscar: g.buscar });
    expect(r).toEqual({ ok: false, motivo: "não deu para falar com a APIBrasil; a consulta PODE ter sido cobrada", daConta: false, podeTerCobrado: true });
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });

  it("corpo que não é JSON é lido como ilegível, sem estourar", async () => {
    const buscar: BuscarNoGateway = async () => ({ status: 200, json: async () => Promise.reject(new SyntaxError("Unexpected token <")) });
    const r = await consultarProduto("cpf-lite", "cpf", "12345678909", { token: TOKEN, homologacao: false, buscar });
    expect(r).toMatchObject({ ok: false, motivo: "a APIBrasil respondeu algo ilegível", podeTerCobrado: true });
  });

  it("passada a espera, a chamada é abortada e o motivo avisa que pode ter cobrado; não há nova tentativa", async () => {
    vi.useFakeTimers();
    let chamadas = 0;
    const buscar: BuscarNoGateway = (_url, init) => {
      chamadas++;
      return new Promise((_, rejeitar) => init.signal.addEventListener("abort", () => rejeitar(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    };
    const promessa = consultarProduto("analise-credito-plus-pf", "cpf", "12345678909", { token: TOKEN, homologacao: false, buscar });
    await vi.advanceTimersByTimeAsync(ESPERA_DO_DOCUMENTO_MS);
    expect(await promessa).toEqual({ ok: false, motivo: "a APIBrasil não respondeu a tempo; a consulta PODE ter sido cobrada", daConta: false, podeTerCobrado: true });
    expect(chamadas).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const PEDIDO_CNPJ: PedidoDeDocumento = { tipo: "cnpj", documento: "11222333000181", nivel: "completo_economico", finalidade: "cadastro_de_fornecedor" };
const PEDIDO_CPF: PedidoDeDocumento = { tipo: "cpf", documento: "12345678909", nivel: "completo_integral", finalidade: "financiamento" };
const AGORA = () => new Date("2026-10-18T15:00:00.000Z");

describe("executarConsulta: a consulta paga inteira", () => {
  it("sem APIBRASIL_TOKEN é 503 e nada sai para o gateway nem para o banco", async () => {
    const g = gateway(doExemplo);
    const b = banco();
    expect(await executarConsulta(b.cliente, PEDIDO_CPF, { token: null, homologacao: false, buscar: g.buscar })).toMatchObject({ ok: false, status: 503 });
    expect(g.pedidas).toEqual([]);
    expect(b.chamadas).toEqual([]);
  });

  it("nível que não é do documento é 400, sem chamada", async () => {
    const g = gateway(doExemplo);
    const r = await executarConsulta(banco().cliente, { ...PEDIDO_CPF, nivel: "completo_score" }, { token: TOKEN, homologacao: false, buscar: g.buscar });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(g.pedidas).toEqual([]);
  });

  it("chama os produtos do nível ao mesmo tempo: nenhum espera o outro responder", async () => {
    const iniciados: string[] = [];
    let soltar: () => void = () => {};
    const todosIniciados = new Promise<void>((r) => (soltar = r));
    const buscar: BuscarNoGateway = async (_url, init) => {
      const tipo = String((JSON.parse(init.body) as { tipo: string }).tipo);
      iniciados.push(tipo);
      if (iniciados.length === 3) soltar();
      // Em série, o primeiro ficaria preso aqui até o fim da espera de 1 s, e a consulta falharia.
      await Promise.race([todosIniciados, new Promise((_, rej) => setTimeout(() => rej(new Error("em série")), 1000))]);
      return { status: 200, json: async () => ENVELOPES[tipo] };
    };
    const b = banco((c) => (c.operacao === "insert" ? { data: { id: ID }, error: null } : { data: null, error: null }));
    const r = await executarConsulta(b.cliente, PEDIDO_CNPJ, { token: TOKEN, homologacao: false, buscar, agora: AGORA });
    expect(iniciados).toEqual(["cnpj", "cnpj-cadastral", "dossie-credito-pj"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.relatorio.faltou).toEqual([]);
  });

  it("deu certo: grava uma linha com o pedido, o relatório, as respostas brutas, a finalidade e a declaração; o custo é a soma", async () => {
    const g = gateway(doExemplo);
    const b = banco((c) => (c.operacao === "insert" ? { data: { id: ID }, error: null } : { data: null, error: null }));
    const r = await executarConsulta(b.cliente, PEDIDO_CNPJ, { token: TOKEN, homologacao: false, buscar: g.buscar, agora: AGORA });
    expect(r).toMatchObject({ ok: true, id: ID, custo: 4.99, avisos: [] });
    const insercoes = b.chamadas.filter((c) => c.operacao === "insert");
    expect(insercoes).toHaveLength(1);
    expect(insercoes[0]).toMatchObject({ tabela: "consultas_de_documento", fim: "single" });
    const linha = insercoes[0].valores as Record<string, unknown>;
    expect(linha).toMatchObject({
      tipo_documento: "cnpj",
      documento: "11222333000181",
      nivel: "completo_economico",
      produtos: ["cnpj", "cnpj-cadastral", "dossie-credito-pj"],
      nome: "APIBRASIL SITES E SOFTWARES LTDA",
      custo: 4.99,
      homologacao: false,
      finalidade: "cadastro_de_fornecedor",
      titular_ciente: true,
    });
    expect(Object.keys(linha.respostas as object)).toEqual(["cnpj", "cnpj-cadastral", "dossie-credito-pj"]);
    expect((linha.relatorio as { geradoEm: string }).geradoEm).toBe("2026-10-18T15:00:00.000Z");
    expect(JSON.stringify(linha)).not.toContain(TOKEN);
  });

  it("em homologação o custo gravado é zero, mesmo que o exemplo diga outro valor", async () => {
    const g = gateway(doExemplo);
    const b = banco((c) => (c.operacao === "insert" ? { data: { id: ID }, error: null } : { data: null, error: null }));
    const r = await executarConsulta(b.cliente, PEDIDO_CPF, { token: TOKEN, homologacao: true, buscar: g.buscar });
    expect(r).toMatchObject({ ok: true, custo: 0 });
    expect(b.chamadas.find((c) => c.operacao === "insert")?.valores).toMatchObject({ custo: 0, homologacao: true });
    expect(g.pedidas.every((p) => p.corpo.homolog === true)).toBe(true);
  });

  it("fora da homologação, se algum produto não disse quanto cobrou, o custo é desconhecido (nulo), e não uma soma parcial", async () => {
    const semCusto = { ...ENVELOPES["cpf-dados"] };
    delete semCusto.valor_consulta;
    delete semCusto.tax;
    const g = gateway((p) => (p === "cpf-dados" ? { status: 200, corpo: semCusto } : doExemplo(p)));
    const r = await executarConsulta(banco((c) => ({ data: c.operacao === "insert" ? { id: ID } : null, error: null })).cliente, PEDIDO_CPF, { token: TOKEN, homologacao: false, buscar: g.buscar });
    expect(r).toMatchObject({ ok: true, custo: null });
  });

  it("nenhum produto respondeu por falta de saldo: 402, e nada é gravado", async () => {
    const g = gateway(() => ({ status: 402, corpo: { error: true, message: "Saldo insuficiente" } }));
    const b = banco();
    const r = await executarConsulta(b.cliente, PEDIDO_CNPJ, { token: TOKEN, homologacao: false, buscar: g.buscar });
    expect(r).toEqual({ ok: false, status: 402, motivo: "A conta da APIBrasil está sem saldo. Ponha crédito no painel deles e consulte de novo." });
    expect(g.pedidas).toHaveLength(3);
    expect(b.chamadas).toEqual([]);
  });

  it("nenhum produto respondeu por outro motivo: 502 com o motivo de cada um, e nada é gravado", async () => {
    const g = gateway((p) => (p === "cnpj" ? { status: 503, corpo: null } : { status: 401, corpo: { error: true } }));
    const b = banco();
    const r = await executarConsulta(b.cliente, PEDIDO_CNPJ, { token: TOKEN, homologacao: false, buscar: g.buscar });
    expect(r).toMatchObject({ ok: false, status: 502 });
    if (!r.ok) {
      expect(r.motivo).toContain("API CNPJ (Receita): a APIBrasil está fora do ar (HTTP 503)");
      expect(r.motivo).toContain("Dossiê de Crédito PJ: a APIBrasil recusou o token da loja (APIBRASIL_TOKEN)");
      expect(r.motivo).not.toContain(TOKEN);
    }
    expect(b.chamadas).toEqual([]);
    expect(tudoQueFoiLogado()).not.toContain(TOKEN);
  });

  it("falha parcial: grava o que veio, o relatório lista o que faltou, e o produto que pode ter cobrado vira aviso", async () => {
    const g = gateway((p) => (p === "cnpj-cadastral" ? { status: 502, corpo: null } : doExemplo(p)));
    const b = banco((c) => ({ data: c.operacao === "insert" ? { id: ID } : null, error: null }));
    const r = await executarConsulta(b.cliente, PEDIDO_CNPJ, { token: TOKEN, homologacao: false, buscar: g.buscar });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.relatorio.faltou).toEqual([{ produto: "CNPJ Cadastral", motivo: "a APIBrasil está fora do ar (HTTP 502)" }]);
    expect(r.avisos).toEqual(["CNPJ Cadastral: a APIBrasil está fora do ar (HTTP 502). Confira o saldo no painel da APIBrasil antes de consultar de novo."]);
    // O custo do que respondeu é conhecido, e o do que falhou não entra na soma.
    expect(r.custo).toBe(4.44);
    const linha = b.chamadas.find((c) => c.operacao === "insert")?.valores as Record<string, unknown>;
    expect(Object.keys(linha.respostas as object)).toEqual(["cnpj", "dossie-credito-pj"]);
  });

  it("recusa do fornecedor (HTTP 200, error:true) não vira aviso de cobrança: só fica em 'não veio'", async () => {
    const g = gateway((p) => (p === "cpf-dados" ? { status: 200, corpo: { error: true, message: "CPF não encontrado" } } : doExemplo(p)));
    const r = await executarConsulta(banco((c) => ({ data: c.operacao === "insert" ? { id: ID } : null, error: null })).cliente, PEDIDO_CPF, { token: TOKEN, homologacao: false, buscar: g.buscar });
    expect(r.ok && r.avisos).toEqual([]);
    expect(r.ok && r.relatorio.faltou).toEqual([{ produto: "CPF Dados", motivo: "a APIBrasil recusou: CPF não encontrado" }]);
  });

  it("consulta feita e não gravada (tabela ausente): devolve o relatório sem id, com o aviso de imprimir e o nome da migração", async () => {
    const g = gateway(doExemplo);
    const b = banco((c) => (c.operacao === "insert" ? { data: null, error: { code: "42P01", message: 'relation "consultas_de_documento" does not exist' } } : { data: null, error: null }));
    const r = await executarConsulta(b.cliente, PEDIDO_CPF, { token: TOKEN, homologacao: false, buscar: g.buscar });
    expect(r).toMatchObject({ ok: true, id: null });
    expect(r.ok && r.avisos[0]).toMatch(/20261018120000_consultas_de_documento.*Imprima agora/);
    expect(r.ok && r.relatorio.titular).toBe("JOAO FICTICIO DE OLIVEIRA");
  });

  it("o token não aparece em nenhum log nem no resultado, em nenhum caminho", async () => {
    const caminhos: Array<(p: string) => { status: number; corpo: unknown } | Error> = [
      doExemplo,
      () => ({ status: 402, corpo: {} }),
      () => ({ status: 500, corpo: {} }),
      () => new Error(`Bearer ${TOKEN}`),
      (p) => (p === "cpf-dados" ? new Error(TOKEN) : doExemplo(p)),
    ];
    for (const responder of caminhos) {
      const g = gateway(responder);
      const r = await executarConsulta(banco((c) => ({ data: null, error: c.operacao === "insert" ? { code: "XX000", message: "falhou" } : null })).cliente, PEDIDO_CPF, { token: TOKEN, homologacao: false, buscar: g.buscar });
      expect(JSON.stringify(r)).not.toContain(TOKEN);
    }
    expect(avisos.some((s) => s.mock.calls.length > 0)).toBe(true);
    expect(tudoQueFoiLogado()).not.toContain(TOKEN);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("o histórico", () => {
  const LINHAS = [
    { id: "a", tipo_documento: "cpf", documento: "12345678909", nome: "JOAO", nivel: "completo_integral", finalidade: "financiamento", custo: "33.52", homologacao: false, criado_por_nome: "Ana", criado_em: "2026-10-18T12:00:00Z" },
    { id: "b", tipo_documento: "cnpj", documento: "11222333000181", nome: null, nivel: "completo_score", finalidade: "cadastro_de_fornecedor", custo: null, homologacao: true, criado_por_nome: null, criado_em: "2026-10-17T12:00:00Z" },
    // Linha torta (sem id, tipo desconhecido) não vira item.
    { id: null, tipo_documento: "cpf", documento: "1", criado_em: "x" },
    { id: "c", tipo_documento: "rg", documento: "1", criado_em: "2026-10-17T12:00:00Z" },
  ];

  it("CPF sai mascarado, CNPJ formatado, e nível e finalidade com o rótulo da tela; os mais novos primeiro, até 50", async () => {
    const b = banco(() => ({ data: LINHAS, error: null }));
    const r = await lerHistoricoDeDocumentos(b.cliente, { termo: null, tipo: null });
    expect(r).toEqual({
      ok: true,
      itens: [
        { id: "a", tipo: "cpf", documento: "***.456.789-**", nome: "JOAO", nivel: "completo_integral", nivelRotulo: "Completo integral", finalidade: "Financiamento", custo: 33.52, homologacao: false, quem: "Ana", quando: "2026-10-18T12:00:00Z" },
        { id: "b", tipo: "cnpj", documento: "11.222.333/0001-81", nome: null, nivel: "completo_score", nivelRotulo: "Completo com score", finalidade: "Cadastro de fornecedor", custo: null, homologacao: true, quem: null, quando: "2026-10-17T12:00:00Z" },
      ],
    });
    expect(JSON.stringify(r)).not.toContain("12345678909");
    expect(b.chamadas[0].filtros).toEqual([
      ["order", "criado_em", { ascending: false }],
      ["limit", 50],
    ]);
    expect(b.chamadas[0].colunas).not.toMatch(/relatorio|respostas/);
  });

  it("termo com dígitos procura pelo começo do documento; termo com letras procura o nome, sem os curingas do usuário", async () => {
    const b = banco(() => ({ data: [], error: null }));
    await lerHistoricoDeDocumentos(b.cliente, { termo: "123.456", tipo: "cpf" });
    expect(b.chamadas[0].filtros).toContainEqual(["eq", "tipo_documento", "cpf"]);
    expect(b.chamadas[0].filtros).toContainEqual(["like", "documento", "123456%"]);
    await lerHistoricoDeDocumentos(b.cliente, { termo: "  maria%_(silva) ", tipo: null, limite: 40 });
    expect(b.chamadas[1].filtros).toContainEqual(["ilike", "nome", "%maria   silva%"]);
    expect(b.chamadas[1].filtros).toContainEqual(["limit", 40]);
  });

  it("tabela ausente avisa a falta da migração; outro erro devolve a mensagem", async () => {
    expect(await lerHistoricoDeDocumentos(banco(() => ({ data: null, error: { code: "42P01", message: "x" } })).cliente, { termo: null, tipo: null })).toEqual({ ok: false, faltaMigracao: true, motivo: "x" });
    expect(await lerHistoricoDeDocumentos(banco(() => ({ data: null, error: { code: "42501", message: "permissão" } })).cliente, { termo: null, tipo: null })).toEqual({ ok: false, faltaMigracao: false, motivo: "permissão" });
  });

  it("abrir uma consulta com id que não é uuid nem pergunta ao banco", async () => {
    const b = banco();
    expect(await abrirConsultaDeDocumento(b.cliente, "1 or 1=1")).toBeNull();
    expect(b.chamadas).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("o link para enviar", () => {
  it("cria com só o hash do token no banco e validade de 7 dias; o token só existe na URL devolvida", async () => {
    const b = banco(() => ({ data: null, error: null }));
    const r = await criarLinkDoRelatorio(b.cliente, ID, new Date("2026-10-18T12:00:00.000Z"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.expiraEm).toBe("2026-10-25T12:00:00.000Z");
    const token = r.url.split("/relatorio/")[1];
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(b.chamadas).toHaveLength(1);
    expect(b.chamadas[0]).toMatchObject({ tabela: "relatorios_compartilhados", operacao: "insert" });
    expect(b.chamadas[0].valores).toEqual({ consulta_id: ID, token_hash: sha256(token), expira_em: "2026-10-25T12:00:00.000Z" });
    expect(JSON.stringify(b.chamadas)).not.toContain(token);
  });

  it("cada link é um token novo", async () => {
    const b = banco(() => ({ data: null, error: null }));
    const um = await criarLinkDoRelatorio(b.cliente, ID);
    const outro = await criarLinkDoRelatorio(b.cliente, ID);
    expect(um.ok && outro.ok && um.url !== outro.url).toBe(true);
  });

  it("consulta inexistente (id torto, ou chave estrangeira recusada) é 404; outro erro do banco é 502", async () => {
    const b = banco();
    expect(await criarLinkDoRelatorio(b.cliente, "nao-e-uuid")).toEqual({ ok: false, status: 404, motivo: "Consulta não encontrada." });
    expect(b.chamadas).toEqual([]);
    expect(await criarLinkDoRelatorio(banco(() => ({ data: null, error: { code: "23503", message: "fk" } })).cliente, ID)).toMatchObject({ ok: false, status: 404 });
    expect(await criarLinkDoRelatorio(banco(() => ({ data: null, error: { code: "42501", message: "rls" } })).cliente, ID)).toMatchObject({ ok: false, status: 502 });
  });

  it("revogar marca quem e quando, só se ainda não estava revogado; o segundo pedido não acha linha e diz isso", async () => {
    const b = banco(() => ({ data: [{ id: ID }], error: null }));
    expect(await revogarLinkDoRelatorio(b.cliente, ID, "u1")).toEqual({ ok: true });
    const c = b.chamadas[0];
    expect(c).toMatchObject({ tabela: "relatorios_compartilhados", operacao: "update" });
    expect(c.valores).toMatchObject({ revogado_por: "u1", revogado_em: expect.any(String) });
    expect(c.filtros).toEqual([
      ["eq", "id", ID],
      ["is", "revogado_em", null],
    ]);
    const jaRevogado = await revogarLinkDoRelatorio(banco(() => ({ data: [], error: null })).cliente, ID, "u1");
    expect(jaRevogado).toEqual({ ok: false, motivo: "O link já estava revogado, ou não existe." });
    const semId = banco();
    expect((await revogarLinkDoRelatorio(semId.cliente, "x", "u1")).ok).toBe(false);
    expect(semId.chamadas).toEqual([]);
  });

  it("a página pública pergunta à função do banco pelo sha256 do token, nunca pelo token", async () => {
    const token = "A".repeat(43);
    const relatorio = { tipo: "cpf", documento: "123.456.789-09" };
    const b = banco(() => ({ data: [{ relatorio, expira_em: "2026-10-25T12:00:00Z" }], error: null }));
    expect(await abrirLinkPublico(b.cliente, token)).toEqual({ relatorio, expiraEm: "2026-10-25T12:00:00Z" });
    expect(b.chamadas).toEqual([{ tabela: "abrir_relatorio_compartilhado", operacao: "rpc", valores: { p_token_hash: sha256(token) }, filtros: [], fim: null }]);
    expect(JSON.stringify(b.chamadas)).not.toContain(token);
  });

  it("vencido, revogado ou desconhecido (a função não devolve linha), ou erro da função: nada abre", async () => {
    const token = "B".repeat(43);
    for (const resposta of [{ data: [], error: null }, { data: null, error: null }, { data: [{ relatorio: null, expira_em: "x" }], error: null }, { data: null, error: { message: "falhou" } }]) {
      expect(await abrirLinkPublico(banco(() => resposta).cliente, token), JSON.stringify(resposta)).toBeNull();
    }
  });
});
