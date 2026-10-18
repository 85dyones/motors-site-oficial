import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LINHA_DOS_PARAMETROS, supabaseDeTeste, type Chamada, type Resposta } from "./supabaseDaConsultaDeDocumento";

/**
 * As rotas da consulta de CPF e CNPJ (18/10/2026): `/api/consulta-documento`
 * (estimar, consultar, histórico), `[id]`, `[id]/relatorio`, `[id]/links` e
 * `links/[linkId]`.
 *
 * Só a porta (`autorizarConsultaDeDocumento`), o cliente de gravação
 * (`clienteDeGravacao`), a configuração da APIBrasil e o `fetch` são
 * dublados; o resto de `consultaDeDocumento-servidor` roda de verdade. O que
 * estes testes seguram é a ORDEM, que é o que protege o dinheiro: nada chega
 * ao gateway antes da sessão, do pedido e dos parâmetros conferidos; o
 * `estimar` nunca chama o gateway; a repetição volta 409 antes de pagar; e a
 * falha devolve o id da tentativa gravada.
 */

const ENVELOPES = JSON.parse(readFileSync(join(__dirname, "fixtures", "apibrasil", "consultas-de-documento.json"), "utf8")) as Record<string, unknown>;
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const LINK = "9b2d6d0e-3a7c-4f4e-8a55-1c2b3d4e5f60";
const USUARIO = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const TOKEN = "tok-SEGREDO-da-rota";

let porta: unknown;
let gravacao: SupabaseClient | null;
let configuracao: { token: string | null; homologacao: boolean };

vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => null, createAdminSupabaseClient: () => null }));
vi.mock("../src/lib/consultaDeDocumento-servidor", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/consultaDeDocumento-servidor")>();
  return { ...real, autorizarConsultaDeDocumento: async () => porta, clienteDeGravacao: () => gravacao };
});
vi.mock("../src/lib/apiBrasil", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/apiBrasil")>();
  return { ...real, configuracaoDaApiBrasil: () => configuracao };
});

const rotaPrincipal = await import("../src/app/api/consulta-documento/route");
const rotaDaConsulta = await import("../src/app/api/consulta-documento/[id]/route");
const rotaDoRelatorio = await import("../src/app/api/consulta-documento/[id]/relatorio/route");
const rotaDosLinks = await import("../src/app/api/consulta-documento/[id]/links/route");
const rotaDoLink = await import("../src/app/api/consulta-documento/links/[linkId]/route");
const { CABECALHOS_DO_RELATORIO } = await import("../src/lib/relatorioDeDocumento");

// ── o gateway ────────────────────────────────────────────────────────────────

let gatewayResponde: (produto: string) => { status: number; corpo: unknown };
const doExemplo = (produto: string) => ({ status: 200, corpo: ENVELOPES[produto] });
const fetchFalso = vi.fn(async (_url: string, init?: RequestInit) => {
  const r = gatewayResponde(String((JSON.parse(String(init?.body)) as { tipo: string }).tipo));
  return { status: r.status, json: async () => r.corpo };
});
const fetchOriginal = globalThis.fetch;
afterAll(() => {
  globalThis.fetch = fetchOriginal;
});

// ── o banco ──────────────────────────────────────────────────────────────────

type Responder = (c: Chamada) => Resposta;
const PADRAO: Record<string, Responder> = {
  parametros_consulta_documento: () => ({ data: LINHA_DOS_PARAMETROS, error: null }),
  consultas_de_documento: () => ({ data: [], error: null }),
};

let sessao: ReturnType<typeof supabaseDeTeste>;
let gravada: ReturnType<typeof supabaseDeTeste>;

/** A sessão de quem consulta, respondendo por tabela (o que não estiver aqui usa o padrão). */
function sessaoCom(porTabela: Record<string, Responder> = {}) {
  sessao = supabaseDeTeste({ responder: (c) => (porTabela[c.tabela] ?? PADRAO[c.tabela] ?? (() => ({ data: null, error: null })))(c) });
  porta = { ok: true, supabase: sessao.cliente, usuarioId: USUARIO, nome: "Ana" };
  return sessao;
}
function gravacaoQueDevolve(id: string | null = ID) {
  gravada = supabaseDeTeste({ responder: (c) => (c.operacao === "rpc" ? { data: id, error: null } : { data: null, error: null }) });
  gravacao = gravada.cliente as unknown as SupabaseClient;
}

const LINHA_ANTERIOR = { id: ID, tipo_documento: "cpf", documento: "12345678909", nome: "JOAO", nivel: "completo_integral", situacao: "completa", finalidade: "financiamento", custo: 33.52, homologacao: false, criado_por_nome: "Ana", criado_em: new Date().toISOString() };

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  fetchFalso.mockClear();
  globalThis.fetch = fetchFalso as never;
  gatewayResponde = doExemplo;
  configuracao = { token: TOKEN, homologacao: false };
  sessaoCom();
  gravacaoQueDevolve();
});

// ── as chamadas ──────────────────────────────────────────────────────────────

async function postar(corpo: unknown, cabecalhos: Record<string, string> = {}) {
  const res = await rotaPrincipal.POST(
    new NextRequest("http://localhost/api/consulta-documento", {
      method: "POST",
      headers: { "content-type": "application/json", ...cabecalhos },
      body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown>, cache: res.headers.get("cache-control") };
}
const params = <T>(p: T) => ({ params: Promise.resolve(p) });
const CONSULTAR = { acao: "consultar", tipo: "cpf", documento: "123.456.789-09", nivel: "completo_integral", finalidade: "financiamento", titularCiente: true };
const nadaFoiPago = () => {
  expect(fetchFalso).not.toHaveBeenCalled();
  expect(gravada.chamadas).toEqual([]);
};

// ─────────────────────────────────────────────────────────────────────────────

describe("a porta: sem sessão 401, sem papel 403, em todas as rotas — e nada é lido, consultado nem gravado", () => {
  const recusas = [
    { ok: false, status: 401, motivo: "Não autenticado." },
    { ok: false, status: 403, motivo: "A consulta de CPF e CNPJ é do Administrador, do Gestor, do Comercial e do Financeiro." },
  ];

  it("POST (estimar e consultar) e GET do histórico", async () => {
    for (const recusa of recusas) {
      porta = recusa;
      for (const corpo of [CONSULTAR, { acao: "estimar", tipo: "cpf", documento: "12345678909" }]) {
        const r = await postar(corpo);
        expect(r.status).toBe(recusa.status);
        expect(r.json.error).toBe(recusa.motivo);
        expect(r.cache).toBe("no-store");
      }
      const h = await rotaPrincipal.GET(new NextRequest("http://localhost/api/consulta-documento?q=joao"));
      expect(h.status).toBe(recusa.status);
    }
    expect(sessao.chamadas).toEqual([]);
    nadaFoiPago();
  });

  it("abrir, relatório, criar link e revogar", async () => {
    for (const recusa of recusas) {
      porta = recusa;
      expect((await rotaDaConsulta.GET(new Request("http://localhost"), params({ id: ID }))).status).toBe(recusa.status);
      const pagina = await rotaDoRelatorio.GET(new Request("http://localhost"), params({ id: ID }));
      expect(pagina.status).toBe(recusa.status);
      expect(pagina.headers.get("content-security-policy")).toBe(CABECALHOS_DO_RELATORIO["Content-Security-Policy"]);
      expect((await rotaDosLinks.POST(new Request("http://localhost", { method: "POST" }), params({ id: ID }))).status).toBe(recusa.status);
      expect((await rotaDoLink.DELETE(new Request("http://localhost", { method: "DELETE" }), params({ linkId: LINK }))).status).toBe(recusa.status);
    }
    expect(sessao.chamadas).toEqual([]);
    nadaFoiPago();
  });
});

describe("o POST pago só aceita a própria origem", () => {
  it("Origin de outro site (ou ilegível) é 403 antes até da porta; a mesma origem, ou sem Origin, passa", async () => {
    for (const origem of ["https://mal.example", "http://localhost.mal.example", "null"]) {
      const r = await postar(CONSULTAR, { origin: origem });
      expect(r.status, origem).toBe(403);
      expect(r.json.error, origem).toBe("Pedido de outra origem.");
    }
    // Nem os parâmetros foram lidos: a recusa vem antes da sessão.
    expect(sessao.chamadas).toEqual([]);
    nadaFoiPago();
    expect((await postar(CONSULTAR, { origin: "http://localhost" })).status).toBe(200);
    expect((await postar({ acao: "estimar", tipo: "cpf", documento: "12345678909" })).status).toBe(200);
  });
});

describe("pedido torto é 400, antes de qualquer chamada paga", () => {
  it("sem ação, corpo que não é JSON, CPF inválido, sem finalidade, sem a declaração do titular, nível de outro documento", async () => {
    const casos: Array<[unknown, RegExp]> = [
      [{ tipo: "cpf" }, /sem ação/],
      ["{não é json", /sem ação/],
      [{ ...CONSULTAR, documento: "123.456.789-10" }, /CPF inválido/],
      [{ ...CONSULTAR, finalidade: "curiosidade" }, /finalidade/],
      [{ ...CONSULTAR, finalidade: "toString" }, /finalidade/],
      [{ ...CONSULTAR, titularCiente: "true" }, /titular/],
      [{ ...CONSULTAR, nivel: "completo_score" }, /nível/],
      [{ acao: "estimar", tipo: "cpf", documento: "111.111.111-11" }, /CPF inválido/],
      [{ acao: "estimar", tipo: "cnpj", documento: "11.222.333/0001-82" }, /CNPJ inválido/],
      [{ acao: "estimar", tipo: "rg", documento: "12345678909" }, /inválido/],
    ];
    for (const [corpo, motivo] of casos) {
      const r = await postar(corpo);
      expect(r.status, JSON.stringify(corpo)).toBe(400);
      expect(String(r.json.error), JSON.stringify(corpo)).toMatch(motivo);
    }
    nadaFoiPago();
  });
});

describe("sem os parâmetros da consulta, nada sai (503)", () => {
  it("sem vigência, ou sem a tabela (a migração cita o nome)", async () => {
    sessaoCom({ parametros_consulta_documento: () => ({ data: null, error: null }) });
    const sem = await postar(CONSULTAR);
    expect(sem.status).toBe(503);
    expect(String(sem.json.error)).toMatch(/parametros_consulta_documento/);
    sessaoCom({ parametros_consulta_documento: () => ({ data: null, error: { code: "42P01", message: "relation does not exist" } }) });
    const tabela = await postar({ acao: "estimar", tipo: "cpf", documento: "12345678909" });
    expect(tabela.status).toBe(503);
    expect(String(tabela.json.error)).toContain("20261018120000_consultas_de_documento");
    nadaFoiPago();
  });
});

describe("estimar: os níveis, os preços e o que já foi consultado — sem chamar o gateway", () => {
  it("CPF: os cinco níveis com o preço da tabela do banco, a data da tabela, a janela e as recentes", async () => {
    sessaoCom({ consultas_de_documento: () => ({ data: [LINHA_ANTERIOR], error: null }) });
    const r = await postar({ acao: "estimar", tipo: "cpf", documento: "123.456.789-09" });
    expect(r.status).toBe(200);
    expect(r.cache).toBe("no-store");
    const niveis = r.json.niveis as Array<{ id: string; preco: number | null; nomesDosProdutos: string[] }>;
    expect(niveis.map((n) => [n.id, n.preco])).toEqual([
      ["basico", 0.46],
      ["dados", 4.5],
      ["credito", 29.02],
      ["completo_economico", 8.99],
      ["completo_integral", 33.52],
    ]);
    expect(niveis[4].nomesDosProdutos).toEqual(["CPF Dados", "Análise de Crédito Plus PF"]);
    expect(r.json).toMatchObject({ tabelaDePrecosEm: "2026-10-18", diasDeConsultaRecente: 90, temToken: true, homologacao: false });
    expect(r.json.recentes).toEqual([expect.objectContaining({ id: ID, documento: "***.456.789-**", nivelRotulo: "Completo integral" })]);
    // As recentes foram procuradas pelo documento normalizado, na janela dos parâmetros.
    const recentes = sessao.chamadas.find((c) => c.tabela === "consultas_de_documento");
    expect(recentes?.filtros).toContainEqual(["eq", "documento", "12345678909"]);
    expect(recentes?.filtros).toContainEqual(["neq", "situacao", "falhou"]);
    nadaFoiPago();
  });

  it("produto sem preço na tabela deixa o nível sem estimativa (null), e sem token a tela sabe (temToken:false)", async () => {
    const semPreco = { ...LINHA_DOS_PARAMETROS, precos_de_referencia: { ...LINHA_DOS_PARAMETROS.precos_de_referencia, "cadastral-score-pj": undefined } };
    sessaoCom({ parametros_consulta_documento: () => ({ data: semPreco, error: null }) });
    configuracao = { token: null, homologacao: false };
    const r = await postar({ acao: "estimar", tipo: "cnpj", documento: "11.222.333/0001-81" });
    expect(r.status).toBe(200);
    const preco = (id: string) => (r.json.niveis as Array<{ id: string; preco: number | null }>).find((n) => n.id === id)?.preco;
    expect(preco("completo_score")).toBeNull();
    expect(preco("completo_economico")).toBe(4.99);
    expect(r.json.temToken).toBe(false);
    nadaFoiPago();
  });
});

describe("consultar", () => {
  it("deu certo: 200 com id, situação, relatório, custo e avisos; a gravação vai pela service_role, não pela sessão", async () => {
    const r = await postar(CONSULTAR);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ id: ID, situacao: "completa", custo: 33.52, avisos: [] });
    expect((r.json.relatorio as { titular: string }).titular).toBe("JOAO FICTICIO DE OLIVEIRA");
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    const [url, init] = fetchFalso.mock.calls[0];
    expect(url).toBe("https://gateway.apibrasil.io/api/v2/consulta/cpf/credits");
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(gravada.chamadas.map((c) => [c.operacao, c.tabela])).toEqual([["rpc", "registrar_consulta_de_documento"]]);
    expect(gravada.chamadas[0].valores).toMatchObject({ p_criado_por: USUARIO, p_documento: "12345678909", p_finalidade: "financiamento", p_titular_ciente: true });
    expect(sessao.chamadas.every((c) => c.operacao === "select")).toBe(true);
    expect(JSON.stringify(r.json)).not.toContain(TOKEN);
  });

  it("a mesma consulta há pouco: 409 com a anterior, sem chamar o gateway nem gravar", async () => {
    sessaoCom({ consultas_de_documento: () => ({ data: [LINHA_ANTERIOR], error: null }) });
    const r = await postar(CONSULTAR);
    expect(r.status).toBe(409);
    expect(r.json.repeticao).toMatchObject({ id: ID, nivel: "completo_integral", quem: "Ana" });
    expect(String(r.json.error)).toMatch(/30 minutos/);
    nadaFoiPago();
  });

  it("com repetir:true a mesma consulta sai e é paga", async () => {
    sessaoCom({ consultas_de_documento: () => ({ data: [LINHA_ANTERIOR], error: null }) });
    const r = await postar({ ...CONSULTAR, repetir: true });
    expect(r.status).toBe(200);
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    // `repetir` só vale como o booleano: "true" em texto não pula a trava.
    const texto = await postar({ ...CONSULTAR, repetir: "true" });
    expect(texto.status).toBe(409);
  });

  it("nenhum produto respondeu: 502 com o id da tentativa gravada e o aviso de que pode ter cobrado", async () => {
    gatewayResponde = () => ({ status: 503, corpo: null });
    const r = await postar(CONSULTAR);
    expect(r.status).toBe(502);
    expect(r.json).toMatchObject({ id: ID, podeTerCobrado: true });
    expect(String(r.json.error)).toMatch(/A consulta não voltou.*ficou registrada/);
    expect(gravada.chamadas[0].valores).toMatchObject({ p_situacao: "falhou" });
  });

  it("sem saldo: 402 com o id, e sem 'pode ter cobrado'", async () => {
    gatewayResponde = () => ({ status: 402, corpo: { error: true, message: "Saldo insuficiente" } });
    const r = await postar(CONSULTAR);
    expect(r.status).toBe(402);
    expect(r.json).toMatchObject({ id: ID, podeTerCobrado: false });
  });

  it("sem a chave de serviço (nada gravaria) ou sem o token: 503, sem chamar o gateway", async () => {
    gravacao = null;
    const semChave = await postar(CONSULTAR);
    expect(semChave.status).toBe(503);
    expect(String(semChave.json.error)).toContain("SUPABASE_SERVICE_ROLE_KEY");
    gravacaoQueDevolve();
    configuracao = { token: null, homologacao: false };
    const semToken = await postar(CONSULTAR);
    expect(semToken.status).toBe(503);
    expect(String(semToken.json.error)).toContain("APIBRASIL_TOKEN");
    nadaFoiPago();
  });
});

describe("o histórico (GET)", () => {
  it("pesquisa pelo termo (até 60 caracteres) e pelo tipo; erro do banco é 502 com faltaMigracao", async () => {
    const ok = await rotaPrincipal.GET(new NextRequest(`http://localhost/api/consulta-documento?q=${"m".repeat(80)}&tipo=cnpj`));
    expect(ok.status).toBe(200);
    expect(sessao.chamadas[0].filtros).toContainEqual(["eq", "tipo_documento", "cnpj"]);
    expect(sessao.chamadas[0].filtros).toContainEqual(["ilike", "nome", `%${"m".repeat(60)}%`]);
    sessaoCom({ consultas_de_documento: () => ({ data: null, error: { code: "42P01", message: "x" } }) });
    const erro = await rotaPrincipal.GET(new NextRequest("http://localhost/api/consulta-documento"));
    expect(erro.status).toBe(502);
    expect(await erro.json()).toMatchObject({ faltaMigracao: true });
  });
});

describe("abrir uma consulta guardada e o relatório do painel", () => {
  const GUARDADA = { ...LINHA_ANTERIOR, relatorio: { tipo: "cpf", documento: "123.456.789-09", titular: "JOAO", nivel: "Completo integral", geradoEm: "2026-10-18T12:00:00Z", homologacao: false, resumo: [], secoes: [], faltou: [] } };

  it("id que não existe (ou não é uuid) é 404", async () => {
    expect((await rotaDaConsulta.GET(new Request("http://localhost"), params({ id: "1 or 1=1" }))).status).toBe(404);
    sessaoCom({ consultas_de_documento: () => ({ data: null, error: null }) });
    expect((await rotaDaConsulta.GET(new Request("http://localhost"), params({ id: ID }))).status).toBe(404);
    const pagina = await rotaDoRelatorio.GET(new Request("http://localhost"), params({ id: ID }));
    expect(pagina.status).toBe(404);
    expect(pagina.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("a consulta abre com os links, e o relatório sai como página com os cabeçalhos do painel e quem consultou para quê", async () => {
    sessaoCom({ consultas_de_documento: () => ({ data: GUARDADA, error: null }), relatorios_compartilhados: () => ({ data: [], error: null }) });
    const aberta = await rotaDaConsulta.GET(new Request("http://localhost"), params({ id: ID }));
    expect(aberta.status).toBe(200);
    expect(await aberta.json()).toMatchObject({ id: ID, links: [], item: { quem: "Ana" } });
    const pagina = await rotaDoRelatorio.GET(new Request("http://localhost"), params({ id: ID }));
    expect(pagina.status).toBe(200);
    for (const [k, v] of Object.entries(CABECALHOS_DO_RELATORIO)) expect(pagina.headers.get(k), k).toBe(v);
    const html = await pagina.text();
    expect(html).toContain("123.456.789-09");
    expect(html).toContain("consultado por Ana para financiamento");
  });
});

describe("os links", () => {
  /** A consulta com a situação dada e `ativos` links vivos; o insert responde `erro`. */
  const comLinks = (o: { situacao?: string; ativos?: number } = {}) =>
    sessaoCom({
      consultas_de_documento: () => ({ data: { id: ID, situacao: o.situacao ?? "completa" }, error: null }),
      relatorios_compartilhados: (c) => (c.operacao === "select" ? { data: null, error: null, count: o.ativos ?? 0 } : { data: { id: LINK }, error: null }),
    });
  const criar = () => rotaDosLinks.POST(new Request("http://localhost", { method: "POST" }), params({ id: ID }));
  const revogar = (linkId = LINK) => rotaDoLink.DELETE(new Request("http://localhost", { method: "DELETE" }), params({ linkId }));

  it("POST cria o link com o id e a validade dos parâmetros; o token só existe na resposta", async () => {
    comLinks({ ativos: 2 });
    const res = await criar();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: string; url: string; expiraEm: string };
    expect(json.id).toBe(LINK);
    expect(json.url).toMatch(/\/relatorio\/[A-Za-z0-9_-]{43}$/);
    const dias = (new Date(json.expiraEm).getTime() - Date.now()) / 86400000;
    expect(dias).toBeGreaterThan(6.99);
    expect(dias).toBeLessThanOrEqual(7);
    const insert = sessao.chamadas.find((c) => c.operacao === "insert");
    expect(JSON.stringify(insert)).not.toContain(json.url.split("/relatorio/")[1]);
  });

  it("POST no limite de links ativos (10 dos parâmetros) é 409, sem inserir; consulta que falhou também é 409", async () => {
    comLinks({ ativos: 10 });
    const limite = await criar();
    expect(limite.status).toBe(409);
    expect(String(((await limite.json()) as { error: string }).error)).toMatch(/limite é 10/);
    expect(sessao.chamadas.some((c) => c.operacao === "insert")).toBe(false);
    comLinks({ situacao: "falhou" });
    expect((await criar()).status).toBe(409);
  });

  it("POST sem os parâmetros é 503", async () => {
    sessaoCom({ parametros_consulta_documento: () => ({ data: null, error: null }) });
    expect((await criar()).status).toBe(503);
    expect(sessao.chamadas.some((c) => c.tabela === "relatorios_compartilhados")).toBe(false);
  });

  it("DELETE revoga (200); já revogado é 409; erro do banco é 502; id torto é 404 — o status vem do servidor", async () => {
    sessaoCom({ relatorios_compartilhados: () => ({ data: [{ id: LINK }], error: null }) });
    expect((await revogar()).status).toBe(200);
    expect(sessao.chamadas[0].valores).toMatchObject({ revogado_por: USUARIO });
    sessaoCom({ relatorios_compartilhados: () => ({ data: [], error: null }) });
    const ja = await revogar();
    expect(ja.status).toBe(409);
    expect(await ja.json()).toEqual({ error: "O link já estava revogado, ou não existe." });
    sessaoCom({ relatorios_compartilhados: () => ({ data: null, error: { code: "42501", message: "rls" } }) });
    expect((await revogar()).status).toBe(502);
    sessaoCom();
    expect((await revogar("x")).status).toBe(404);
    expect(sessao.chamadas).toEqual([]);
  });
});
