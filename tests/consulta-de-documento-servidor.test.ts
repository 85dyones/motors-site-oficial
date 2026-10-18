import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LINHA_DOS_PARAMETROS, supabaseDeTeste, type Chamada, type Resposta } from "./supabaseDaConsultaDeDocumento";

/**
 * Consulta de CPF e CNPJ — a rede, o banco e os links (18/10/2026; revisto
 * depois da revisão do mesmo dia).
 *
 * O que estes testes seguram é o dinheiro e o dado pessoal:
 *  - cada resposta do gateway é lida do jeito certo (402 é saldo, 401/403 é
 *    o token, 5xx e recusa PODEM ter cobrado conforme a política do produto,
 *    `cobraEmErro`) e o custo sai só de `valor_consulta`, ou do "tarifado em
 *    R$ X" da mensagem — `tax` não serve;
 *  - o motivo técnico fica no painel (avisos); o relatório que sai da loja
 *    leva só o motivo público;
 *  - a chamada leva o token só no cabeçalho, `homolog` só em homologação, e
 *    o token não aparece em erro nem em log;
 *  - a consulta repetida há pouco volta 409 sem chamar o gateway, a menos
 *    que venha `repetir`;
 *  - toda tentativa é gravada pela função `registrar_consulta_de_documento`
 *    (cliente da service_role), inclusive a que falhou inteira — nunca por
 *    insert direto da sessão;
 *  - o link guarda só o hash do token, respeita o limite de links ativos, e
 *    a página pública manda à função o TOKEN cru (o hash é calculado lá).
 */

vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => null, createAdminSupabaseClient: () => null }));

const {
  ESPERA_DO_DOCUMENTO_MS,
  abrirConsultaDeDocumento,
  abrirLinkPublico,
  consultarProduto,
  consultasRecentesDoDocumento,
  criarLinkDoRelatorio,
  custoDaConsulta,
  custoDaResposta,
  executarConsulta,
  lerChamadaDoProduto,
  lerHistoricoDeDocumentos,
  lerParametrosDaConsulta,
  revogarLinkDoRelatorio,
  semCaractereNulo,
} = await import("../src/lib/consultaDeDocumento-servidor");
type BuscarNoGateway = import("../src/lib/consultaDeDocumento-servidor").BuscarNoGateway;
type ParametrosDaConsultaDeDocumento = import("../src/lib/consultaDeDocumento-servidor").ParametrosDaConsultaDeDocumento;
type TentativaDoProduto = import("../src/lib/consultaDeDocumento-servidor").TentativaDoProduto;
type PedidoDeDocumento = import("../src/lib/consultaDeDocumento").PedidoDeDocumento;

const ENVELOPES = JSON.parse(readFileSync(join(__dirname, "fixtures", "apibrasil", "consultas-de-documento.json"), "utf8")) as Record<string, Record<string, unknown>>;

const TOKEN = "tok-SEGREDO-da-loja-123";
const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const USUARIO = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const NAO_RESPONDEU = "não respondeu nesta consulta.";

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

/** O cliente de gravação: a função devolve o id da linha nova. */
const gravacaoQueDevolve = (id: string | null = ID, error: Resposta["error"] = null) => banco((c) => (c.operacao === "rpc" ? { data: id, error } : { data: null, error: null }));

const PARAMETROS: ParametrosDaConsultaDeDocumento = {
  diasDoLink: 7,
  diasDeConsultaRecente: 90,
  minutosContraRepeticao: 30,
  linksAtivosPorConsulta: 10,
  precos: LINHA_DOS_PARAMETROS.precos_de_referencia,
  tabelaDePrecosEm: "2026-10-18",
  fonte: "Tabela pública da APIBrasil",
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
  it("402 é a conta sem saldo: problema da conta, não cobrou, e o relatório só diz que não respondeu", () => {
    expect(lerChamadaDoProduto(402, { error: true, message: "Saldo insuficiente" }, "cpf-dados")).toEqual({
      ok: false,
      status: 402,
      motivo: "a conta da APIBrasil está sem saldo",
      motivoPublico: NAO_RESPONDEU,
      daConta: true,
      podeTerCobrado: false,
      custo: null,
    });
  });

  it("401 e 403 são o token recusado: problema da conta, e o motivo cita a variável, nunca o valor", () => {
    for (const status of [401, 403]) {
      const r = lerChamadaDoProduto(status, { error: true, message: "Unauthorized" }, "cpf-dados");
      expect(r, String(status)).toMatchObject({ ok: false, status, daConta: true, podeTerCobrado: false, motivoPublico: NAO_RESPONDEU });
      if (!r.ok) expect(r.motivo).toContain("APIBRASIL_TOKEN");
    }
  });

  it("5xx é o fornecedor fora do ar: PODE ter cobrado nos produtos que cobram no erro; o Dossiê e o Score PJ não cobram", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(lerChamadaDoProduto(status, null, "cpf-dados"), String(status)).toEqual({
        ok: false,
        status,
        motivo: `a APIBrasil está fora do ar (HTTP ${status})`,
        motivoPublico: NAO_RESPONDEU,
        daConta: false,
        podeTerCobrado: true,
        custo: null,
      });
      for (const p of ["dossie-credito-pj", "cadastral-score-pj"] as const) {
        expect(lerChamadaDoProduto(status, null, p), `${p} ${status}`).toMatchObject({ ok: false, podeTerCobrado: false });
      }
    }
  });

  it("HTTP 200 com error:true é recusa, com a mensagem aparada em 200 caracteres no motivo do painel", () => {
    const r = lerChamadaDoProduto(200, { error: true, message: `  CPF inválido na base ${"x".repeat(300)}` }, "cpf-dados");
    expect(r).toMatchObject({ ok: false, status: 200, daConta: false, motivoPublico: NAO_RESPONDEU });
    if (!r.ok) {
      expect(r.motivo.startsWith("a APIBrasil recusou: CPF inválido na base")).toBe(true);
      expect(r.motivo.length).toBeLessThanOrEqual("a APIBrasil recusou: ".length + 200);
    }
    // Sem mensagem, o motivo diz o HTTP.
    expect(lerChamadaDoProduto(200, { error: true }, "cpf-dados")).toMatchObject({ ok: false, motivo: "a APIBrasil recusou a consulta (HTTP 200)" });
  });

  it("recusa (4xx ou error:true) PODE ter cobrado por padrão — 'parâmetro errado repetido continua cobrando' — salvo no Dossiê e no Score PJ", () => {
    for (const [status, corpo] of [
      [400, { error: true, message: "Parâmetro inválido" }],
      [422, { error: true }],
      [200, { error: true, message: "Documento inválido" }],
    ] as const) {
      for (const p of ["cpf-lite", "cpf-dados", "analise-credito-plus-pf", "cnpj", "cnpj-cadastral", "analise-credito-basic-pj"] as const) {
        expect(lerChamadaDoProduto(status, corpo, p), `${p} ${status}`).toMatchObject({ ok: false, daConta: false, podeTerCobrado: true });
      }
      for (const p of ["dossie-credito-pj", "cadastral-score-pj"] as const) {
        expect(lerChamadaDoProduto(status, corpo, p), `${p} ${status}`).toMatchObject({ ok: false, daConta: false, podeTerCobrado: false });
      }
    }
    expect(lerChamadaDoProduto(400, { error: true, message: "Parâmetro inválido" }, "cpf-dados")).toMatchObject({ motivo: "a APIBrasil recusou: Parâmetro inválido", status: 400 });
  });

  it("o produto que não cobra no erro, quando a mensagem diz que tarifou, passa a 'pode ter cobrado' e com o custo dito", () => {
    expect(lerChamadaDoProduto(200, { error: true, message: "Falhou. Você foi tarifado em R$ 1,30." }, "cadastral-score-pj")).toMatchObject({ ok: false, podeTerCobrado: true, custo: 1.3 });
    expect(lerChamadaDoProduto(200, { error: true, valor_consulta: 4.4 }, "dossie-credito-pj")).toMatchObject({ ok: false, podeTerCobrado: true, custo: 4.4 });
  });

  it("'não encontrado' vira o motivo público 'não encontrou registro'; qualquer outra recusa, só 'não respondeu'", () => {
    const r = lerChamadaDoProduto(200, { error: true, message: "CPF não encontrado na base" }, "cpf-dados");
    expect(r).toMatchObject({ ok: false, motivo: "a APIBrasil recusou: CPF não encontrado na base", motivoPublico: "não encontrou registro deste documento." });
    expect(lerChamadaDoProduto(200, { error: true, message: "Sem informações para o documento" }, "cnpj")).toMatchObject({ motivoPublico: "não encontrou registro deste documento." });
    expect(lerChamadaDoProduto(200, { error: true, message: "Timeout no bureau XPTO-17" }, "cnpj")).toMatchObject({ motivoPublico: NAO_RESPONDEU });
  });

  it("o erro no envelope interno (response.error, o do Acerta) também é recusa; 'saldo' na mensagem vira falta de saldo, sem cobrança", () => {
    expect(lerChamadaDoProduto(200, { error: false, response: { error: true, message: "Documento inválido" } }, "acerta-essencial-positivo")).toMatchObject({
      ok: false,
      motivo: "a APIBrasil recusou: Documento inválido",
    });
    expect(lerChamadaDoProduto(200, { error: true, message: "Crédito insuficiente para esta consulta" }, "cpf-dados")).toMatchObject({
      ok: false,
      daConta: true,
      podeTerCobrado: false,
      motivo: "a conta da APIBrasil está sem saldo",
    });
  });

  it("corpo ilegível ou sem dados: pode ter cobrado, mesmo no produto que não cobra no erro — a consulta foi feita e a resposta não chegou inteira", () => {
    for (const corpo of [null, "texto", [], 42]) {
      for (const p of ["cpf-dados", "dossie-credito-pj"] as const) {
        expect(lerChamadaDoProduto(200, corpo, p), `${p} ${JSON.stringify(corpo)}`).toMatchObject({ ok: false, motivo: "a APIBrasil respondeu algo ilegível", podeTerCobrado: true });
      }
    }
    expect(lerChamadaDoProduto(200, { error: false, message: "ok", valor_consulta: 4.5 }, "cpf-dados")).toMatchObject({ ok: false, motivo: "a APIBrasil respondeu sem os dados", podeTerCobrado: true, custo: 4.5 });
  });

  it("o custo vem só de valor_consulta (número), ou do 'tarifado em R$ X' da mensagem; tax não serve, e sem os dois é desconhecido", () => {
    expect(lerChamadaDoProduto(200, { error: false, valor_consulta: 4.4, tax: "9,999", message: "tarifado em R$ 7,00", data: {} }, "cpf-dados")).toMatchObject({ ok: true, custo: 4.4 });
    expect(lerChamadaDoProduto(200, { error: false, message: "Dados validos! Voce foi tarifado em R$ 0,12.", data: {} }, "cpf-dados")).toMatchObject({ ok: true, custo: 0.12 });
    expect(lerChamadaDoProduto(200, { error: false, tax: "1,30", data: {} }, "cpf-dados")).toMatchObject({ ok: true, custo: null });
    expect(lerChamadaDoProduto(200, { error: false, tax: "0.340", data: {} }, "cpf-dados")).toMatchObject({ ok: true, custo: null });
    expect(lerChamadaDoProduto(200, { error: false, data: { a: 1 } }, "cpf-dados")).toEqual({ ok: true, status: 200, dados: { a: 1 }, custo: null });
  });

  it("o miolo vem de data, ou de response.data no envelope do Acerta Essencial Plus — que não diz quanto cobrou", () => {
    const r = lerChamadaDoProduto(200, ENVELOPES["acerta-essencial-positivo"], "acerta-essencial-positivo");
    expect(r.ok && (r.dados as { msg: string }).msg).toBe("consulta realizada com sucesso!");
    // `tax: "0.340"` no exemplo contra R$ 4,49 da tabela: não é o custo.
    expect(r.ok && r.custo).toBeNull();
  });
});

describe("custoDaResposta", () => {
  it("valor_consulta finito ganha; depois a mensagem de fora, depois a de dentro; formatos BR e com ponto", () => {
    expect(custoDaResposta(null)).toBeNull();
    expect(custoDaResposta({ valor_consulta: 0 })).toBe(0);
    expect(custoDaResposta({ valor_consulta: Number.NaN, message: "tarifado em R$ 2,00" })).toBe(2);
    expect(custoDaResposta({ valor_consulta: "4.5" })).toBeNull();
    expect(custoDaResposta({ response: { message: "Você foi tarifada em R$ 4.49" } })).toBe(4.49);
    expect(custoDaResposta({ message: "Requisição processada com sucesso", tax: "0.340" })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("consultarProduto: uma chamada ao gateway", () => {
  it("POST na rota /consulta/{documento}/credits com Bearer, JSON e o documento no campo do tipo — e sem homolog em produção", async () => {
    const g = gateway(doExemplo);
    const r = await consultarProduto("cpf-dados", "cpf", "12345678909", { token: TOKEN, homologacao: false, buscar: g.buscar });
    expect(r).toMatchObject({ ok: true, status: 200, custo: 4.5 });
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

  it("falha de rede vira 'pode ter cobrado' (até no produto que não cobra no erro), e a mensagem do erro (que pode carregar o token) não vai para o motivo", async () => {
    for (const p of ["cpf-lite", "dossie-credito-pj"] as const) {
      const g = gateway(() => new Error(`connect ECONNREFUSED Authorization: Bearer ${TOKEN}`));
      const r = await consultarProduto(p, p === "cpf-lite" ? "cpf" : "cnpj", "12345678909", { token: TOKEN, homologacao: false, buscar: g.buscar });
      expect(r, p).toEqual({
        ok: false,
        status: null,
        motivo: "não deu para falar com a APIBrasil; a consulta PODE ter sido cobrada",
        motivoPublico: NAO_RESPONDEU,
        daConta: false,
        podeTerCobrado: true,
        custo: null,
      });
      expect(JSON.stringify(r)).not.toContain(TOKEN);
    }
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
    expect(await promessa).toEqual({
      ok: false,
      status: null,
      motivo: "a APIBrasil não respondeu a tempo; a consulta PODE ter sido cobrada",
      motivoPublico: NAO_RESPONDEU,
      daConta: false,
      podeTerCobrado: true,
      custo: null,
    });
    expect(chamadas).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("custoDaConsulta: a soma do que foi cobrado", () => {
  const t = (ok: boolean, pode: boolean, custo: number | null): TentativaDoProduto => ({ produto: "cpf-dados", ok, status: ok ? 200 : 502, motivo: ok ? null : "x", pode_ter_cobrado: pode, custo });

  it("soma os custos conhecidos, arredondada no centavo", () => {
    expect(custoDaConsulta([t(true, true, 0.1), t(true, true, 0.2)], false)).toBe(0.3);
  });
  it("um produto que respondeu, ou que pode ter cobrado, sem custo conhecido deixa a soma desconhecida", () => {
    expect(custoDaConsulta([t(true, true, 4.5), t(true, true, null)], false)).toBeNull();
    expect(custoDaConsulta([t(true, true, 4.5), t(false, true, null)], false)).toBeNull();
  });
  it("quem falhou sem poder ter cobrado não entra na soma; quem falhou e disse quanto cobrou, entra", () => {
    expect(custoDaConsulta([t(true, true, 4.5), t(false, false, null)], false)).toBe(4.5);
    expect(custoDaConsulta([t(true, true, 4.5), t(false, true, 1.3)], false)).toBe(5.8);
  });
  it("em homologação é zero, sempre", () => {
    expect(custoDaConsulta([t(true, true, null), t(false, true, null)], true)).toBe(0);
  });
});

describe("semCaractereNulo", () => {
  it("tira o \\u0000 de qualquer texto do objeto (o jsonb do Postgres o recusa), sem mexer no resto", () => {
    const limpo = semCaractereNulo({ nome: "JOAO\u0000 DA\u0000 SILVA", lista: ["a\u0000b", 1, null, true], fundo: { x: "\u0000" } });
    expect(limpo).toEqual({ nome: "JOAO DA SILVA", lista: ["ab", 1, null, true], fundo: { x: "" } });
    expect(JSON.stringify(limpo)).not.toContain("\\u0000");
    expect(semCaractereNulo(undefined)).toBeNull();
  });

  // BUG (não corrigido aqui, a pedido): o `replace(/\\u0000/g, "")` age sobre o TEXTO do JSON, e um
  // texto do fornecedor com a barra invertida literal seguida de "u0000" (seis caracteres, não o
  // caractere nulo) vira `\\u0000` no JSON; o replace come o `\u0000` depois da primeira barra e
  // deixa uma barra solta — o `JSON.parse` estoura, depois de a consulta já ter sido paga, e ela
  // não fica registrada. Tirar o `.skip` quando a limpeza for feita nos valores, e não no texto.
  it.skip("texto com a barra invertida literal antes de 'u0000' não quebra a limpeza", () => {
    expect(() => semCaractereNulo({ nome: "C:\\u0000\\pasta" })).not.toThrow();
    expect(semCaractereNulo({ nome: "C:\\u0000" })).toEqual({ nome: "C:\\u0000" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const PEDIDO_CNPJ: PedidoDeDocumento = { tipo: "cnpj", documento: "11222333000181", nivel: "completo_economico", finalidade: "cadastro_de_fornecedor" };
const PEDIDO_CPF: PedidoDeDocumento = { tipo: "cpf", documento: "12345678909", nivel: "completo_integral", finalidade: "financiamento" };
const AGORA = () => new Date("2026-10-18T15:00:00.000Z");

/** As dependências de uma consulta, com a sessão e a gravação de mentira. */
function deps(extra: Partial<Parameters<typeof executarConsulta>[2]> = {}) {
  return { token: TOKEN, homologacao: false, usuarioId: USUARIO, parametros: PARAMETROS, gravacao: gravacaoQueDevolve().cliente, agora: AGORA, ...extra };
}
const rpcs = (b: { chamadas: Chamada[] }) => b.chamadas.filter((c) => c.operacao === "rpc");
const argumentosDaGravacao = (b: { chamadas: Chamada[] }) => {
  const r = rpcs(b);
  expect(r).toHaveLength(1);
  expect(r[0].tabela).toBe("registrar_consulta_de_documento");
  return r[0].valores as Record<string, unknown>;
};

describe("executarConsulta: as portas antes de gastar", () => {
  it("sem APIBRASIL_TOKEN é 503 e nada sai para o gateway nem para o banco", async () => {
    const g = gateway(doExemplo);
    const sessao = banco();
    const gravacao = gravacaoQueDevolve();
    const r = await executarConsulta(sessao.cliente, PEDIDO_CPF, deps({ token: null, gravacao: gravacao.cliente, buscar: g.buscar }));
    expect(r).toMatchObject({ ok: false, status: 503, id: null, podeTerCobrado: false });
    expect(g.pedidas).toEqual([]);
    expect(sessao.chamadas).toEqual([]);
    expect(gravacao.chamadas).toEqual([]);
  });

  it("sem o cliente de gravação (falta a chave de serviço) é 503: a consulta não sairia sem registro", async () => {
    const g = gateway(doExemplo);
    const sessao = banco();
    const r = await executarConsulta(sessao.cliente, PEDIDO_CPF, deps({ gravacao: null, buscar: g.buscar }));
    expect(r).toMatchObject({ ok: false, status: 503, podeTerCobrado: false });
    if (!r.ok) expect(r.motivo).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(g.pedidas).toEqual([]);
    expect(sessao.chamadas).toEqual([]);
  });

  it("nível que não é do documento é 400, sem chamada", async () => {
    const g = gateway(doExemplo);
    const r = await executarConsulta(banco().cliente, { ...PEDIDO_CPF, nivel: "completo_score" }, deps({ buscar: g.buscar }));
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(g.pedidas).toEqual([]);
  });
});

describe("executarConsulta: a trava contra repetição", () => {
  const ANTERIOR = { id: ID, tipo_documento: "cpf", documento: "12345678909", nome: "JOAO", nivel: "completo_integral", situacao: "completa", finalidade: "financiamento", custo: 33.52, homologacao: false, criado_por_nome: "Ana", criado_em: "2026-10-18T14:50:00.000Z" };

  it("a mesma consulta (documento, nível, modo) feita há menos dos minutos do parâmetro volta 409 com a anterior, sem chamar o gateway nem gravar", async () => {
    const g = gateway(doExemplo);
    const sessao = banco((c) => (c.tabela === "consultas_de_documento" ? { data: [ANTERIOR], error: null } : { data: null, error: null }));
    const gravacao = gravacaoQueDevolve();
    const r = await executarConsulta(sessao.cliente, PEDIDO_CPF, deps({ gravacao: gravacao.cliente, buscar: g.buscar }));
    expect(r).toMatchObject({ ok: false, status: 409, repeticao: { id: ID, documento: "***.456.789-**", nivel: "completo_integral", quem: "Ana", quando: "2026-10-18T14:50:00.000Z" } });
    if (!r.ok) expect(r.motivo).toContain("30 minutos");
    expect(g.pedidas).toEqual([]);
    expect(gravacao.chamadas).toEqual([]);
    // A pergunta vai pela SESSÃO (a RLS recorta), e só considera a que trouxe dados, do mesmo modo e da janela.
    expect(sessao.chamadas).toHaveLength(1);
    expect(sessao.chamadas[0].filtros).toEqual([
      ["eq", "tipo_documento", "cpf"],
      ["eq", "documento", "12345678909"],
      ["eq", "nivel", "completo_integral"],
      ["eq", "homologacao", false],
      ["neq", "situacao", "falhou"],
      ["gte", "criado_em", "2026-10-18T14:30:00.000Z"],
      ["order", "criado_em", { ascending: false }],
      ["limit", 1],
    ]);
  });

  it("com repetir:true a trava nem pergunta ao banco, e a consulta sai", async () => {
    const g = gateway(doExemplo);
    const sessao = banco(() => ({ data: [ANTERIOR], error: null }));
    const r = await executarConsulta(sessao.cliente, { ...PEDIDO_CPF, repetir: true }, deps({ buscar: g.buscar }));
    expect(r.ok).toBe(true);
    expect(g.pedidas).toHaveLength(2);
    expect(sessao.chamadas).toEqual([]);
  });

  it("com o parâmetro em zero minutos não há trava", async () => {
    const g = gateway(doExemplo);
    const sessao = banco(() => ({ data: [ANTERIOR], error: null }));
    const r = await executarConsulta(sessao.cliente, PEDIDO_CPF, deps({ parametros: { ...PARAMETROS, minutosContraRepeticao: 0 }, buscar: g.buscar }));
    expect(r.ok).toBe(true);
    expect(sessao.chamadas).toEqual([]);
  });

  it("em homologação a trava procura só as consultas de teste", async () => {
    const sessao = banco(() => ({ data: [], error: null }));
    await executarConsulta(sessao.cliente, PEDIDO_CPF, deps({ homologacao: true, buscar: gateway(doExemplo).buscar }));
    expect(sessao.chamadas[0].filtros).toContainEqual(["eq", "homologacao", true]);
  });
});

describe("executarConsulta: a consulta paga e a gravação", () => {
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
    const r = await executarConsulta(banco().cliente, PEDIDO_CNPJ, deps({ buscar }));
    expect(iniciados).toEqual(["cnpj", "cnpj-cadastral", "dossie-credito-pj"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.relatorio.faltou).toEqual([]);
  });

  it("deu certo: grava pela função da service_role (nunca insert da sessão), com o pedido, o relatório, as respostas brutas, as tentativas, a finalidade e a declaração; o custo é a soma", async () => {
    const g = gateway(doExemplo);
    const sessao = banco(() => ({ data: [], error: null }));
    const gravacao = gravacaoQueDevolve();
    const r = await executarConsulta(sessao.cliente, PEDIDO_CNPJ, deps({ gravacao: gravacao.cliente, buscar: g.buscar }));
    expect(r).toMatchObject({ ok: true, id: ID, situacao: "completa", custo: 4.99, avisos: [] });
    // A sessão só leu (a trava); ninguém inseriu nada direto.
    expect(sessao.chamadas.every((c) => c.operacao === "select")).toBe(true);
    expect([...sessao.chamadas, ...gravacao.chamadas].some((c) => c.operacao === "insert" || c.operacao === "update")).toBe(false);
    const p = argumentosDaGravacao(gravacao);
    expect(p).toMatchObject({
      p_criado_por: USUARIO,
      p_tipo_documento: "cnpj",
      p_documento: "11222333000181",
      p_nivel: "completo_economico",
      p_produtos: ["cnpj", "cnpj-cadastral", "dossie-credito-pj"],
      p_nome: "APIBRASIL SITES E SOFTWARES LTDA",
      p_situacao: "completa",
      p_custo: 4.99,
      p_homologacao: false,
      p_finalidade: "cadastro_de_fornecedor",
      p_titular_ciente: true,
    });
    expect(Object.keys(p).sort()).toEqual(
      [
        "p_criado_por",
        "p_tipo_documento",
        "p_documento",
        "p_nivel",
        "p_produtos",
        "p_nome",
        "p_relatorio",
        "p_respostas",
        "p_tentativas",
        "p_situacao",
        "p_custo",
        "p_homologacao",
        "p_finalidade",
        "p_titular_ciente",
      ].sort(),
    );
    expect(Object.keys(p.p_respostas as object)).toEqual(["cnpj", "cnpj-cadastral", "dossie-credito-pj"]);
    expect(p.p_tentativas).toEqual([
      { produto: "cnpj", ok: true, status: 200, motivo: null, pode_ter_cobrado: true, custo: 0.04 },
      { produto: "cnpj-cadastral", ok: true, status: 200, motivo: null, pode_ter_cobrado: true, custo: 0.55 },
      { produto: "dossie-credito-pj", ok: true, status: 200, motivo: null, pode_ter_cobrado: true, custo: 4.4 },
    ]);
    expect((p.p_relatorio as { geradoEm: string }).geradoEm).toBe("2026-10-18T15:00:00.000Z");
    expect(JSON.stringify(gravacao.chamadas)).not.toContain(TOKEN);
  });

  it("em homologação o custo gravado é zero, mesmo que o exemplo diga outro valor, e a consulta vai com homolog", async () => {
    const g = gateway(doExemplo);
    const gravacao = gravacaoQueDevolve();
    const r = await executarConsulta(banco().cliente, PEDIDO_CPF, deps({ homologacao: true, gravacao: gravacao.cliente, buscar: g.buscar }));
    expect(r).toMatchObject({ ok: true, custo: 0 });
    expect(argumentosDaGravacao(gravacao)).toMatchObject({ p_custo: 0, p_homologacao: true });
    expect(g.pedidas.every((x) => x.corpo.homolog === true)).toBe(true);
  });

  it("fora da homologação, se algum produto não disse quanto cobrou (o Acerta só manda tax), o custo é desconhecido (nulo), e não uma soma parcial", async () => {
    const g = gateway(doExemplo);
    const gravacao = gravacaoQueDevolve();
    const r = await executarConsulta(banco().cliente, { ...PEDIDO_CPF, nivel: "completo_economico" }, deps({ gravacao: gravacao.cliente, buscar: g.buscar }));
    expect(r).toMatchObject({ ok: true, situacao: "completa", custo: null });
    expect(argumentosDaGravacao(gravacao).p_custo).toBeNull();
  });

  it("falha parcial de quem pode ter cobrado sem dizer quanto: grava 'parcial' com custo nulo; o relatório leva só o motivo público, e o técnico fica nos avisos", async () => {
    const g = gateway((p) => (p === "cnpj-cadastral" ? { status: 502, corpo: null } : doExemplo(p)));
    const gravacao = gravacaoQueDevolve();
    const r = await executarConsulta(banco().cliente, PEDIDO_CNPJ, deps({ gravacao: gravacao.cliente, buscar: g.buscar }));
    expect(r).toMatchObject({ ok: true, id: ID, situacao: "parcial", custo: null });
    if (!r.ok) return;
    expect(r.relatorio.faltou).toEqual([{ produto: "CNPJ Cadastral", motivo: NAO_RESPONDEU }]);
    expect(r.avisos).toEqual(["CNPJ Cadastral: a APIBrasil está fora do ar (HTTP 502). Pode ter sido cobrado: confira o saldo no painel da APIBrasil antes de consultar de novo."]);
    const p = argumentosDaGravacao(gravacao);
    expect(p).toMatchObject({ p_situacao: "parcial", p_custo: null });
    expect(Object.keys(p.p_respostas as object)).toEqual(["cnpj", "dossie-credito-pj"]);
    expect((p.p_tentativas as TentativaDoProduto[])[1]).toEqual({ produto: "cnpj-cadastral", ok: false, status: 502, motivo: "a APIBrasil está fora do ar (HTTP 502)", pode_ter_cobrado: true, custo: null });
    // O relatório gravado (o que o link entrega) não tem nada técnico.
    expect(JSON.stringify(p.p_relatorio)).not.toMatch(/HTTP 502|fora do ar|APIBrasil/);
  });

  it("falha parcial do Dossiê (que não cobra no erro): o custo é a soma dos que responderam, sem aviso de cobrança", async () => {
    const g = gateway((p) => (p === "dossie-credito-pj" ? { status: 503, corpo: null } : doExemplo(p)));
    const r = await executarConsulta(banco().cliente, PEDIDO_CNPJ, deps({ buscar: g.buscar }));
    expect(r).toMatchObject({ ok: true, situacao: "parcial", custo: 0.59 });
    expect(r.ok && r.avisos).toEqual(["Dossiê de Crédito PJ: a APIBrasil está fora do ar (HTTP 503)."]);
  });

  it("recusa 'não encontrado': o relatório diz que não encontrou registro; o aviso do painel leva a mensagem e o 'pode ter cobrado' do produto que cobra no erro", async () => {
    const g = gateway((p) => (p === "cpf-dados" ? { status: 200, corpo: { error: true, message: "CPF não encontrado" } } : doExemplo(p)));
    const r = await executarConsulta(banco().cliente, PEDIDO_CPF, deps({ buscar: g.buscar }));
    expect(r).toMatchObject({ ok: true, situacao: "parcial", custo: null });
    expect(r.ok && r.relatorio.faltou).toEqual([{ produto: "CPF Dados", motivo: "não encontrou registro deste documento." }]);
    expect(r.ok && r.avisos).toEqual(["CPF Dados: a APIBrasil recusou: CPF não encontrado. Pode ter sido cobrado: confira o saldo no painel da APIBrasil antes de consultar de novo."]);
  });

  it("em homologação nenhum aviso fala em cobrança", async () => {
    const g = gateway((p) => (p === "cpf-dados" ? { status: 502, corpo: null } : doExemplo(p)));
    const r = await executarConsulta(banco().cliente, PEDIDO_CPF, deps({ homologacao: true, buscar: g.buscar }));
    expect(r.ok && r.avisos).toEqual(["CPF Dados: a APIBrasil está fora do ar (HTTP 502)."]);
  });

  it("o \\u0000 que o fornecedor mandar sai do relatório, das respostas e das tentativas antes de gravar", async () => {
    const sujo = structuredClone(ENVELOPES.cnpj) as { data: { cnpj: { empresa: { razao_social: string } } } };
    sujo.data.cnpj.empresa.razao_social = "APIBRASIL\u0000 LTDA";
    const g = gateway((p) => (p === "cnpj" ? { status: 200, corpo: sujo } : p === "dossie-credito-pj" ? { status: 200, corpo: { error: true, message: "falhou\u0000 aqui" } } : doExemplo(p)));
    const gravacao = gravacaoQueDevolve();
    await executarConsulta(banco().cliente, PEDIDO_CNPJ, deps({ gravacao: gravacao.cliente, buscar: g.buscar }));
    const p = argumentosDaGravacao(gravacao);
    for (const chave of ["p_relatorio", "p_respostas", "p_tentativas"]) expect(JSON.stringify(p[chave]), chave).not.toContain("\\u0000");
    expect((p.p_relatorio as { titular: string }).titular).toBe("APIBRASIL LTDA");
  });

  it("consulta feita e não gravada (função ausente): devolve o relatório sem id, com o aviso de imprimir e o nome da migração", async () => {
    const g = gateway(doExemplo);
    const gravacao = gravacaoQueDevolve(null, { code: "42883", message: "function public.registrar_consulta_de_documento does not exist" });
    const r = await executarConsulta(banco().cliente, PEDIDO_CPF, deps({ gravacao: gravacao.cliente, buscar: g.buscar }));
    expect(r).toMatchObject({ ok: true, id: null });
    expect(r.ok && r.relatorio.titular).toBe("JOAO FICTICIO DE OLIVEIRA");
    // Qualquer erro avisa de imprimir; o da tabela ausente cita a migração.
    expect(r.ok && r.avisos.at(-1)).toMatch(/não ficou guardada.*Imprima agora/);
    const tabela = gravacaoQueDevolve(null, { code: "42P01", message: 'relation "consultas_de_documento" does not exist' });
    const r2 = await executarConsulta(banco().cliente, PEDIDO_CPF, deps({ gravacao: tabela.cliente, buscar: g.buscar }));
    expect(r2.ok && r2.avisos.at(-1)).toMatch(/20261018120000_consultas_de_documento.*Imprima agora/);
  });
});

describe("executarConsulta: nenhum produto respondeu", () => {
  it("por falta de saldo: 402, mas a tentativa é gravada como 'falhou', sem respostas, e não cobrou", async () => {
    const g = gateway(() => ({ status: 402, corpo: { error: true, message: "Saldo insuficiente" } }));
    const gravacao = gravacaoQueDevolve();
    const r = await executarConsulta(banco().cliente, PEDIDO_CNPJ, deps({ gravacao: gravacao.cliente, buscar: g.buscar }));
    expect(r).toEqual({
      ok: false,
      status: 402,
      motivo: "A conta da APIBrasil está sem saldo. Ponha crédito no painel deles e consulte de novo. A tentativa ficou registrada no histórico.",
      id: ID,
      podeTerCobrado: false,
    });
    expect(g.pedidas).toHaveLength(3);
    const p = argumentosDaGravacao(gravacao);
    expect(p).toMatchObject({ p_situacao: "falhou", p_respostas: {}, p_custo: 0, p_nome: null });
    expect((p.p_tentativas as TentativaDoProduto[]).every((t) => !t.ok && !t.pode_ter_cobrado)).toBe(true);
  });

  it("por outro motivo: 502 com o motivo de cada um e o id da tentativa gravada; pode ter cobrado se algum produto cobra no erro", async () => {
    const g = gateway((p) => (p === "cnpj" ? { status: 503, corpo: null } : { status: 401, corpo: { error: true } }));
    const gravacao = gravacaoQueDevolve();
    const r = await executarConsulta(banco().cliente, PEDIDO_CNPJ, deps({ gravacao: gravacao.cliente, buscar: g.buscar }));
    expect(r).toMatchObject({ ok: false, status: 502, id: ID, podeTerCobrado: true });
    if (!r.ok) {
      expect(r.motivo).toContain("API CNPJ (Receita): a APIBrasil está fora do ar (HTTP 503). Pode ter sido cobrado");
      expect(r.motivo).toContain("Dossiê de Crédito PJ: a APIBrasil recusou o token da loja (APIBRASIL_TOKEN)");
      expect(r.motivo).toContain("A tentativa ficou registrada no histórico.");
      expect(r.motivo).not.toContain(TOKEN);
    }
    expect(argumentosDaGravacao(gravacao)).toMatchObject({ p_situacao: "falhou", p_custo: null });
    expect(tudoQueFoiLogado()).not.toContain(TOKEN);
  });

  it("só o Dossiê fora do ar (não cobra no erro) e o token recusado nos outros: 502 sem 'pode ter cobrado'", async () => {
    const g = gateway((p) => (p === "dossie-credito-pj" ? { status: 500, corpo: null } : { status: 403, corpo: {} }));
    const r = await executarConsulta(banco().cliente, PEDIDO_CNPJ, deps({ buscar: g.buscar }));
    expect(r).toMatchObject({ ok: false, status: 502, podeTerCobrado: false });
  });

  it("em homologação, a falha total nunca diz que pode ter cobrado", async () => {
    const g = gateway(() => ({ status: 503, corpo: null }));
    const r = await executarConsulta(banco().cliente, PEDIDO_CPF, deps({ homologacao: true, buscar: g.buscar }));
    expect(r).toMatchObject({ ok: false, status: 502, podeTerCobrado: false });
  });

  it("falha total que nem se gravou: 502 sem id e sem dizer que ficou registrada", async () => {
    const g = gateway(() => ({ status: 503, corpo: null }));
    const r = await executarConsulta(banco().cliente, PEDIDO_CPF, deps({ gravacao: gravacaoQueDevolve(null, { code: "XX000", message: "falhou" }).cliente, buscar: g.buscar }));
    expect(r).toMatchObject({ ok: false, status: 502, id: null, podeTerCobrado: true });
    if (!r.ok) expect(r.motivo).not.toContain("ficou registrada");
  });
});

describe("executarConsulta: o token", () => {
  it("não aparece em nenhum log nem no resultado, em nenhum caminho", async () => {
    const caminhos: Array<(p: string) => { status: number; corpo: unknown } | Error> = [
      doExemplo,
      () => ({ status: 402, corpo: {} }),
      () => ({ status: 500, corpo: {} }),
      () => new Error(`Bearer ${TOKEN}`),
      (p) => (p === "cpf-dados" ? new Error(TOKEN) : doExemplo(p)),
    ];
    for (const responder of caminhos) {
      const g = gateway(responder);
      const gravacao = gravacaoQueDevolve(null, { code: "XX000", message: "falhou" });
      const r = await executarConsulta(banco().cliente, PEDIDO_CPF, deps({ gravacao: gravacao.cliente, buscar: g.buscar }));
      expect(JSON.stringify(r)).not.toContain(TOKEN);
      expect(JSON.stringify(gravacao.chamadas)).not.toContain(TOKEN);
    }
    expect(avisos.some((s) => s.mock.calls.length > 0)).toBe(true);
    expect(tudoQueFoiLogado()).not.toContain(TOKEN);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("os parâmetros", () => {
  it("lê a vigência atual e só guarda preço de produto do catálogo, como número", async () => {
    const b = banco(() => ({ data: { ...LINHA_DOS_PARAMETROS, precos_de_referencia: { ...LINHA_DOS_PARAMETROS.precos_de_referencia, inventado: 9, "cpf-lite": "0,12" } }, error: null }));
    const r = await lerParametrosDaConsulta(b.cliente);
    expect(r).toEqual({ ok: true, parametros: PARAMETROS });
    expect(b.chamadas[0]).toMatchObject({ tabela: "parametros_consulta_documento", fim: "maybeSingle", filtros: [["is", "vigencia_ate", null]] });
  });

  it("sem vigente, ou sem a tabela, não há consulta: o motivo diz qual", async () => {
    expect(await lerParametrosDaConsulta(banco(() => ({ data: null, error: null })).cliente)).toMatchObject({ ok: false, faltaMigracao: false });
    expect(await lerParametrosDaConsulta(banco(() => ({ data: null, error: { code: "42P01", message: "x" } })).cliente)).toMatchObject({ ok: false, faltaMigracao: true });
  });
});

describe("o histórico", () => {
  const LINHAS = [
    { id: "a", tipo_documento: "cpf", documento: "12345678909", nome: "JOAO", nivel: "completo_integral", situacao: "completa", finalidade: "financiamento", custo: "33.52", homologacao: false, criado_por_nome: "Ana", criado_em: "2026-10-18T12:00:00Z" },
    { id: "b", tipo_documento: "cnpj", documento: "11222333000181", nome: null, nivel: "completo_score", situacao: "falhou", finalidade: "cadastro_de_fornecedor", custo: null, homologacao: true, criado_por_nome: null, criado_em: "2026-10-17T12:00:00Z" },
    // Linha torta (sem id, tipo desconhecido) não vira item.
    { id: null, tipo_documento: "cpf", documento: "1", criado_em: "x" },
    { id: "c", tipo_documento: "rg", documento: "1", criado_em: "2026-10-17T12:00:00Z" },
  ];

  it("CPF sai mascarado, CNPJ formatado, e nível, situação e finalidade com o rótulo da tela; os mais novos primeiro, até 50", async () => {
    const b = banco(() => ({ data: LINHAS, error: null }));
    const r = await lerHistoricoDeDocumentos(b.cliente, { termo: null, tipo: null });
    expect(r).toEqual({
      ok: true,
      itens: [
        { id: "a", tipo: "cpf", documento: "***.456.789-**", nome: "JOAO", nivel: "completo_integral", nivelRotulo: "Completo integral", situacao: "completa", finalidade: "Financiamento", custo: 33.52, homologacao: false, quem: "Ana", quando: "2026-10-18T12:00:00Z" },
        { id: "b", tipo: "cnpj", documento: "11.222.333/0001-81", nome: null, nivel: "completo_score", nivelRotulo: "Completo com score", situacao: "falhou", finalidade: "Cadastro de fornecedor", custo: null, homologacao: true, quem: null, quando: "2026-10-17T12:00:00Z" },
      ],
    });
    expect(JSON.stringify(r)).not.toContain("12345678909");
    expect(b.chamadas[0].filtros).toEqual([
      ["order", "criado_em", { ascending: false }],
      ["limit", 50],
    ]);
    expect(b.chamadas[0].colunas).not.toMatch(/relatorio|respostas|tentativas/);
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

  it("abrir uma consulta traz os links sem token_hash", async () => {
    const b = banco((c) =>
      c.tabela === "consultas_de_documento"
        ? { data: { ...LINHAS[0], id: ID, relatorio: { tipo: "cpf" } }, error: null }
        : { data: [{ id: "l1", expira_em: "2026-10-25T12:00:00Z", revogado_em: null, acessos: "3", ultimo_acesso_em: null, criado_por_nome: "Ana", criado_em: "2026-10-18T12:00:00Z" }], error: null },
    );
    const r = await abrirConsultaDeDocumento(b.cliente, ID);
    expect(r?.links).toEqual([{ id: "l1", expiraEm: "2026-10-25T12:00:00Z", revogadoEm: null, acessos: 3, ultimoAcessoEm: null, quem: "Ana", criadoEm: "2026-10-18T12:00:00Z" }]);
    expect(b.chamadas.find((c) => c.tabela === "relatorios_compartilhados")?.colunas).not.toContain("token");
  });
});

describe("as consultas recentes do documento (as que reabrem sem pagar)", () => {
  it("só da janela dos parâmetros, do mesmo modo do fornecedor e com dados (a que falhou não reabre)", async () => {
    const b = banco(() => ({ data: [], error: null }));
    await consultasRecentesDoDocumento(b.cliente, "cpf", "12345678909", { dias: 90, homologacao: false, agora: new Date("2026-10-18T12:00:00.000Z") });
    expect(b.chamadas[0].filtros).toEqual([
      ["eq", "tipo_documento", "cpf"],
      ["eq", "documento", "12345678909"],
      ["eq", "homologacao", false],
      ["neq", "situacao", "falhou"],
      ["gte", "criado_em", "2026-07-20T12:00:00.000Z"],
      ["order", "criado_em", { ascending: false }],
      ["limit", 10],
    ]);
    await consultasRecentesDoDocumento(b.cliente, "cnpj", "11222333000181", { dias: 7, homologacao: true, agora: new Date("2026-10-18T12:00:00.000Z") });
    expect(b.chamadas[1].filtros).toContainEqual(["eq", "homologacao", true]);
    expect(b.chamadas[1].filtros).toContainEqual(["gte", "criado_em", "2026-10-11T12:00:00.000Z"]);
  });

  it("erro do banco vira lista vazia (a tela só deixa de oferecer o atalho)", async () => {
    expect(await consultasRecentesDoDocumento(banco(() => ({ data: null, error: { message: "x" } })).cliente, "cpf", "12345678909", { dias: 90, homologacao: false })).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("o link para enviar", () => {
  const LIMITES = { diasDoLink: 7, linksAtivosPorConsulta: 10 };
  const AGORA_DO_LINK = new Date("2026-10-18T12:00:00.000Z");
  /** A consulta existe (com a situação dada), tem `ativos` links vivos, e o insert devolve `erro`. */
  const bancoDoLink = (o: { situacao?: string | null; ativos?: number; erro?: Resposta["error"] } = {}) =>
    banco((c) => {
      if (c.tabela === "consultas_de_documento") return { data: o.situacao === null ? null : { id: ID, situacao: o.situacao ?? "completa" }, error: null };
      if (c.operacao === "select") return { data: null, error: null, count: o.ativos ?? 0 };
      return { data: null, error: o.erro ?? null };
    });

  it("cria com só o hash do token no banco e a validade dos parâmetros; o token só existe na URL devolvida", async () => {
    const b = bancoDoLink({ ativos: 9 });
    const r = await criarLinkDoRelatorio(b.cliente, ID, LIMITES, AGORA_DO_LINK);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.expiraEm).toBe("2026-10-25T12:00:00.000Z");
    const token = r.url.split("/relatorio/")[1];
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const insercoes = b.chamadas.filter((c) => c.operacao === "insert");
    expect(insercoes).toHaveLength(1);
    expect(insercoes[0]).toMatchObject({ tabela: "relatorios_compartilhados" });
    expect(insercoes[0].valores).toEqual({ consulta_id: ID, token_hash: sha256(token), expira_em: "2026-10-25T12:00:00.000Z" });
    expect(JSON.stringify(b.chamadas)).not.toContain(token);
    // A contagem dos ativos: desta consulta, não revogados e ainda no prazo.
    const contagem = b.chamadas.find((c) => c.tabela === "relatorios_compartilhados" && c.operacao === "select");
    expect(contagem?.opcoes).toEqual({ count: "exact", head: true });
    expect(contagem?.filtros).toEqual([
      ["eq", "consulta_id", ID],
      ["is", "revogado_em", null],
      ["gt", "expira_em", "2026-10-18T12:00:00.000Z"],
    ]);
  });

  it("a validade vem do parâmetro, não de um número no código", async () => {
    const r = await criarLinkDoRelatorio(bancoDoLink().cliente, ID, { diasDoLink: 3, linksAtivosPorConsulta: 10 }, AGORA_DO_LINK);
    expect(r.ok && r.expiraEm).toBe("2026-10-21T12:00:00.000Z");
  });

  it("cada link é um token novo", async () => {
    const b = bancoDoLink();
    const um = await criarLinkDoRelatorio(b.cliente, ID, LIMITES);
    const outro = await criarLinkDoRelatorio(b.cliente, ID, LIMITES);
    expect(um.ok && outro.ok && um.url !== outro.url).toBe(true);
  });

  it("no limite de links ativos é 409, e nada é inserido", async () => {
    const b = bancoDoLink({ ativos: 10 });
    const r = await criarLinkDoRelatorio(b.cliente, ID, LIMITES, AGORA_DO_LINK);
    expect(r).toMatchObject({ ok: false, status: 409 });
    if (!r.ok) expect(r.motivo).toMatch(/10 links ativos.*Revogue/);
    expect(b.chamadas.some((c) => c.operacao === "insert")).toBe(false);
  });

  it("consulta que falhou (não tem relatório) é 409, sem contar nem inserir", async () => {
    const b = bancoDoLink({ situacao: "falhou" });
    expect(await criarLinkDoRelatorio(b.cliente, ID, LIMITES)).toMatchObject({ ok: false, status: 409 });
    expect(b.chamadas).toHaveLength(1);
  });

  it("consulta inexistente (id torto, nenhuma linha, ou chave estrangeira recusada) é 404; outro erro do banco é 502", async () => {
    const b = banco();
    expect(await criarLinkDoRelatorio(b.cliente, "nao-e-uuid", LIMITES)).toEqual({ ok: false, status: 404, motivo: "Consulta não encontrada." });
    expect(b.chamadas).toEqual([]);
    expect(await criarLinkDoRelatorio(bancoDoLink({ situacao: null }).cliente, ID, LIMITES)).toEqual({ ok: false, status: 404, motivo: "Consulta não encontrada." });
    expect(await criarLinkDoRelatorio(bancoDoLink({ erro: { code: "23503", message: "fk" } }).cliente, ID, LIMITES)).toMatchObject({ ok: false, status: 404 });
    expect(await criarLinkDoRelatorio(bancoDoLink({ erro: { code: "42501", message: "rls" } }).cliente, ID, LIMITES)).toMatchObject({ ok: false, status: 502 });
  });

  it("revogar marca quem e quando, só se ainda não estava revogado; o segundo pedido é 409; erro do banco é 502", async () => {
    const b = banco(() => ({ data: [{ id: ID }], error: null }));
    expect(await revogarLinkDoRelatorio(b.cliente, ID, "u1")).toEqual({ ok: true });
    const c = b.chamadas[0];
    expect(c).toMatchObject({ tabela: "relatorios_compartilhados", operacao: "update" });
    expect(c.valores).toMatchObject({ revogado_por: "u1", revogado_em: expect.any(String) });
    expect(c.filtros).toEqual([
      ["eq", "id", ID],
      ["is", "revogado_em", null],
    ]);
    expect(await revogarLinkDoRelatorio(banco(() => ({ data: [], error: null })).cliente, ID, "u1")).toEqual({ ok: false, status: 409, motivo: "O link já estava revogado, ou não existe." });
    expect(await revogarLinkDoRelatorio(banco(() => ({ data: null, error: { code: "42501", message: "rls" } })).cliente, ID, "u1")).toEqual({ ok: false, status: 502, motivo: "Não deu para revogar o link." });
    const semId = banco();
    expect(await revogarLinkDoRelatorio(semId.cliente, "x", "u1")).toEqual({ ok: false, status: 404, motivo: "Link não encontrado." });
    expect(semId.chamadas).toEqual([]);
  });

  it("a página pública manda à função do banco o TOKEN cru (o hash é calculado lá dentro), nunca o hash", async () => {
    const token = "A".repeat(43);
    const relatorio = { tipo: "cpf", documento: "123.456.789-09" };
    const b = banco(() => ({ data: [{ relatorio, expira_em: "2026-10-25T12:00:00Z" }], error: null }));
    expect(await abrirLinkPublico(b.cliente, token)).toEqual({ relatorio, expiraEm: "2026-10-25T12:00:00Z" });
    expect(b.chamadas).toEqual([{ tabela: "abrir_relatorio_compartilhado", operacao: "rpc", valores: { p_token: token }, filtros: [], fim: null }]);
    expect(JSON.stringify(b.chamadas)).not.toContain(sha256(token));
  });

  it("vencido, revogado ou desconhecido (a função não devolve linha), ou erro da função: nada abre", async () => {
    const token = "B".repeat(43);
    for (const resposta of [{ data: [], error: null }, { data: null, error: null }, { data: [{ relatorio: null, expira_em: "x" }], error: null }, { data: null, error: { message: "falhou" } }]) {
      expect(await abrirLinkPublico(banco(() => resposta).cliente, token), JSON.stringify(resposta)).toBeNull();
    }
  });
});
