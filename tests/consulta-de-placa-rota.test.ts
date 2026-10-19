import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

/**
 * `POST /api/consulta-placa` — a porta da consulta de placa (06/10/2026), em
 * NÍVEIS desde 19/10/2026.
 *
 * O que estes testes seguram é a ORDEM, porque ela é o que protege o dinheiro
 * da loja: nada é consultado antes de a sessão, a placa, o banco, os
 * parâmetros (preços e prazos) e o token estarem conferidos; `soGuardada`
 * nunca paga e devolve os níveis com preço e o aprofundar; sem nível escolhido
 * não há consulta (`refazer` sem nível é o completo, compatibilidade); a
 * repetição volta 409; e o que pode ter sido cobrado sem voltar fica
 * registrado.
 *
 * A consulta em si (`consultarPlacaPorNivel`) é dublada aqui — ela tem os
 * testes dela em niveis-da-placa-servidor.test.ts. Os níveis com preço e as
 * opções de aprofundar são as funções de verdade, com a semente da migração.
 */

const MIGRACAO = readFileSync(join(__dirname, "..", "supabase", "migrations", "20261019120000_niveis_da_consulta_de_placa.sql"), "utf8");
const PRECOS = JSON.parse(MIGRACAO.match(/-- A semente[\s\S]*?'(\{"estadual"[\s\S]*?\})'::jsonb/)![1]) as Record<string, number>;
const PARAMETROS = { precos: PRECOS, tabelaDePrecosEm: "2026-10-19", diasParaAprofundar: 7, minutosContraRepeticao: 30 };

vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => null, createAdminSupabaseClient: () => null }));

let porta: unknown;
const lerUltimaConsulta = vi.fn();
vi.mock("../src/lib/consultaDePlaca-servidor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/consultaDePlaca-servidor")>()),
  autorizarConsultaDePlaca: async () => porta,
  lerUltimaConsulta: (...a: unknown[]) => lerUltimaConsulta(...a),
}));

let configuracao = { token: "segredo" as string | null, homologacao: false };
vi.mock("../src/lib/apiBrasil", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/apiBrasil")>()),
  configuracaoDaApiBrasil: () => configuracao,
}));

const lerParametrosDaPlaca = vi.fn();
const consultarPlacaPorNivel = vi.fn();
vi.mock("../src/lib/niveisDaPlaca-servidor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/niveisDaPlaca-servidor")>()),
  lerParametrosDaPlaca: (...a: unknown[]) => lerParametrosDaPlaca(...a),
  consultarPlacaPorNivel: (...a: unknown[]) => consultarPlacaPorNivel(...a),
}));

const registrarFalha = vi.fn<(...a: unknown[]) => Promise<void>>(async () => undefined);
vi.mock("../src/lib/observabilidade", () => ({ registrarFalha: (...a: unknown[]) => registrarFalha(...a) }));

const { POST } = await import("../src/app/api/consulta-placa/route");

async function enviar(corpo: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/consulta-placa", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
    }),
  );
  return { status: res.status, json: await res.json(), cache: res.headers.get("cache-control") };
}

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
/** Uma básica guardada de ontem: o aprofundar reaproveita os três produtos. */
const basica = () => ({
  id: ID,
  placa: "ABC1D23",
  retrato: { placa: "ABC1D23" },
  custo: 3.18,
  homologacao: false,
  criadoEm: new Date(Date.now() - 86_400_000).toISOString(),
  consultadoPor: "Ana",
  nivel: "basico",
  produtos: ["estadual", "recall", "fipe"],
  fragmentos: { estadual: {}, recall: {}, fipe: {} },
});

beforeEach(() => {
  vi.clearAllMocks();
  porta = { ok: true, supabase: { marca: "sessão" } };
  configuracao = { token: "segredo", homologacao: false };
  lerUltimaConsulta.mockResolvedValue({ ok: true, consulta: null });
  lerParametrosDaPlaca.mockResolvedValue({ ok: true, parametros: PARAMETROS });
  consultarPlacaPorNivel.mockResolvedValue({ ok: true, gravada: true, consulta: basica(), avisos: [], saldo: null });
});

describe("antes de gastar", () => {
  it("sem sessão, 401; sem papel, 403 — e nada é lido nem consultado", async () => {
    porta = { ok: false, status: 401, motivo: "Não autenticado." };
    expect((await enviar({ placa: "ABC1D23", nivel: "basico" })).status).toBe(401);
    porta = { ok: false, status: 403, motivo: "A consulta de placa é do Administrador, do Gestor e do Comercial." };
    expect((await enviar({ placa: "ABC1D23", nivel: "basico" })).status).toBe(403);
    expect(lerUltimaConsulta).not.toHaveBeenCalled();
    expect(consultarPlacaPorNivel).not.toHaveBeenCalled();
  });

  it.each([[{ placa: "AB12345" }], [{}], ["isto não é json"], [{ placa: 1234567 }]])("placa inválida é 400, antes do banco: %j", async (corpo) => {
    const { status, json } = await enviar(corpo);
    expect(status).toBe(400);
    expect(json.codigo).toBe("placa_invalida");
    expect(lerUltimaConsulta).not.toHaveBeenCalled();
    expect(consultarPlacaPorNivel).not.toHaveBeenCalled();
  });

  it("tabela ausente é descoberta ANTES de pagar, mesmo com `refazer`", async () => {
    lerUltimaConsulta.mockResolvedValue({ ok: false, faltaMigracao: true, motivo: "relation does not exist" });
    const { status, json } = await enviar({ placa: "ABC1D23", refazer: true });
    expect(status).toBe(503);
    expect(json.codigo).toBe("falta_migracao");
    expect(json.error).toContain("20261006180000_consultas_de_placa");
    expect(consultarPlacaPorNivel).not.toHaveBeenCalled();
  });

  it("sem nível escolhido não há consulta: 400, e a guardada não é devolvida no lugar", async () => {
    lerUltimaConsulta.mockResolvedValue({ ok: true, consulta: basica() });
    for (const corpo of [{ placa: "ABC1D23" }, { placa: "ABC1D23", nivel: "premium" }, { placa: "ABC1D23", nivel: null }]) {
      const { status, json } = await enviar(corpo);
      expect(status, JSON.stringify(corpo)).toBe(400);
      expect(json.codigo).toBe("sem_nivel");
    }
    expect(consultarPlacaPorNivel).not.toHaveBeenCalled();
  });

  it("sem token é 503 com o nome da variável, e nada é consultado", async () => {
    configuracao = { token: null, homologacao: false };
    const { status, json } = await enviar({ placa: "ABC1D23", nivel: "basico" });
    expect(status).toBe(503);
    expect(json.codigo).toBe("sem_token");
    expect(json.error).toContain("APIBRASIL_TOKEN");
    expect(consultarPlacaPorNivel).not.toHaveBeenCalled();
  });

  it("sem os parâmetros (migração dos níveis ou vigente) é 503, e nada é consultado", async () => {
    lerParametrosDaPlaca.mockResolvedValue({ ok: false, faltaMigracao: true, motivo: "x" });
    let r = await enviar({ placa: "ABC1D23", nivel: "basico" });
    expect(r.status).toBe(503);
    expect(r.json.codigo).toBe("falta_migracao");
    expect(r.json.error).toContain("20261019120000_niveis_da_consulta_de_placa");

    lerParametrosDaPlaca.mockResolvedValue({ ok: false, faltaMigracao: false, motivo: "Não há parâmetros vigentes da consulta de veículos (parametros_consulta_veiculo)." });
    r = await enviar({ placa: "ABC1D23", nivel: "basico" });
    expect(r.status).toBe(503);
    expect(r.json.codigo).toBe("sem_parametros");
    expect(r.json.error).toContain("Nada foi consultado nem cobrado");
    expect(consultarPlacaPorNivel).not.toHaveBeenCalled();
  });
});

describe("`soGuardada`: o que a tela mostra antes de cobrar", () => {
  it("com guardada: ela, os quatro níveis com o preço da semente e o aprofundar com o que falta — sem consultar", async () => {
    lerUltimaConsulta.mockResolvedValue({ ok: true, consulta: basica() });
    const { status, json, cache } = await enviar({ placa: "abc-1d23", soGuardada: true });
    expect(status).toBe(200);
    expect(cache).toBe("no-store");
    expect(lerUltimaConsulta.mock.calls[0][1]).toBe("ABC1D23");
    expect(json.consulta).toEqual({ ...basica(), criadoEm: json.consulta.criadoEm });
    expect(json.guardada).toBe(true);
    expect(json.niveis.map((n: { id: string; preco: number }) => [n.id, n.preco])).toEqual([
      ["basico", 3.18],
      ["intermediario", 5.58],
      ["economico", 10.58],
      ["completo", 30],
    ]);
    expect(json.aprofundar.map((a: { nivel: string; preco: number; aprofundarDe: string | null }) => [a.nivel, a.preco, a.aprofundarDe])).toEqual([
      ["intermediario", 2.4, ID],
      ["economico", 7.4, ID],
      ["completo", 30, null],
    ]);
    expect(json.tabelaDePrecosEm).toBe("2026-10-19");
    expect(json.avisoDosNiveis).toBeNull();
    expect(consultarPlacaPorNivel).not.toHaveBeenCalled();
  });

  it("sem guardada: nada a aprofundar, mas os níveis vêm — e nunca chega ao fornecedor", async () => {
    const { status, json } = await enviar({ placa: "ABC1D23", soGuardada: true, nivel: "completo" });
    expect(status).toBe(200);
    expect(json.consulta).toBeNull();
    expect(json.aprofundar).toEqual([]);
    expect(json.niveis).toHaveLength(4);
    expect(consultarPlacaPorNivel).not.toHaveBeenCalled();
  });

  it("sem token, `soGuardada` abre a guardada assim mesmo (reabrir não custa)", async () => {
    configuracao = { token: null, homologacao: false };
    lerUltimaConsulta.mockResolvedValue({ ok: true, consulta: basica() });
    const { status, json } = await enviar({ placa: "ABC1D23", soGuardada: true });
    expect(status).toBe(200);
    expect(json.consulta.id).toBe(ID);
  });

  it("sem a migração dos níveis: a guardada abre, sem níveis, com o aviso", async () => {
    lerUltimaConsulta.mockResolvedValue({ ok: true, consulta: basica() });
    lerParametrosDaPlaca.mockResolvedValue({ ok: false, faltaMigracao: true, motivo: "x" });
    const { status, json } = await enviar({ placa: "ABC1D23", soGuardada: true });
    expect(status).toBe(200);
    expect(json.consulta.id).toBe(ID);
    expect(json.niveis).toBeNull();
    expect(json.aprofundar).toEqual([]);
    expect(json.tabelaDePrecosEm).toBeNull();
    expect(json.avisoDosNiveis).toContain("20261019120000_niveis_da_consulta_de_placa");
  });
});

describe("a consulta paga", () => {
  it("passa placa, nível, aprofundar e repetir ao servidor, com o token e os parâmetros", async () => {
    const { status, json } = await enviar({ placa: "abc1d23", nivel: "economico", aprofundarDe: ID, repetir: true });
    expect(status).toBe(200);
    expect(consultarPlacaPorNivel).toHaveBeenCalledTimes(1);
    const [cliente, pedido, deps] = consultarPlacaPorNivel.mock.calls[0];
    expect(cliente).toEqual({ marca: "sessão" });
    expect(pedido).toEqual({ placa: "ABC1D23", nivel: "economico", aprofundarDe: ID, repetir: true });
    expect(deps).toEqual({ token: "segredo", homologacao: false, parametros: PARAMETROS });
    expect(json.guardada).toBe(false);
    // A resposta já traz para onde a consulta nova pode subir.
    expect(json.aprofundar.map((a: { nivel: string }) => a.nivel)).toEqual(["intermediario", "economico", "completo"]);
  });

  it("`repetir` só com true, e `aprofundarDe` só texto", async () => {
    await enviar({ placa: "ABC1D23", nivel: "basico", aprofundarDe: 123, repetir: "sim" });
    expect(consultarPlacaPorNivel.mock.calls[0][1]).toEqual({ placa: "ABC1D23", nivel: "basico", aprofundarDe: null, repetir: false });
  });

  it("`refazer` sem nível é o completo (compatibilidade); com nível, vale o nível", async () => {
    await enviar({ placa: "ABC1D23", refazer: true });
    expect(consultarPlacaPorNivel.mock.calls[0][1].nivel).toBe("completo");
    await enviar({ placa: "ABC1D23", refazer: true, nivel: "intermediario" });
    expect(consultarPlacaPorNivel.mock.calls[1][1].nivel).toBe("intermediario");
  });

  it("os avisos voltam em lista e juntos (a tela antiga lia um só)", async () => {
    consultarPlacaPorNivel.mockResolvedValue({ ok: true, gravada: true, consulta: basica(), avisos: ["Recall: fora do ar.", "FIPE: fora do ar."], saldo: null });
    const { json } = await enviar({ placa: "ABC1D23", nivel: "basico" });
    expect(json.avisos).toEqual(["Recall: fora do ar.", "FIPE: fora do ar."]);
    expect(json.aviso).toBe("Recall: fora do ar. FIPE: fora do ar.");
    expect(registrarFalha).not.toHaveBeenCalled();
  });

  it("repetição: 409 com a consulta anterior, e nada vai à fila de triagem", async () => {
    consultarPlacaPorNivel.mockResolvedValue({ ok: false, status: 409, motivo: "ABC1D23 foi consultada no nível Básico há menos de 30 minutos.", repeticao: basica() });
    const { status, json } = await enviar({ placa: "ABC1D23", nivel: "basico" });
    expect(status).toBe(409);
    expect(json.error).toContain("há menos de 30 minutos");
    expect(json.repeticao.id).toBe(ID);
    expect(registrarFalha).not.toHaveBeenCalled();
  });

  it("sem saldo é 402, e vai ao WhatsApp como parada (e só como parada, quando nada pode ter cobrado)", async () => {
    consultarPlacaPorNivel.mockResolvedValue({ ok: false, status: 402, motivo: "A conta da APIBrasil está sem saldo.", podeTerCobrado: false });
    const { status, json } = await enviar({ placa: "ABC1D23", nivel: "basico" });
    expect(status).toBe(402);
    expect(json).toEqual({ error: "A conta da APIBrasil está sem saldo.", podeTerCobrado: false });
    expect(registrarFalha).toHaveBeenCalledTimes(1);
    expect(registrarFalha).toHaveBeenCalledWith("parada", "apibrasil-sem-saldo", expect.stringContaining("sem saldo"), expect.any(Object));
  });

  it("sem saldo com outro produto que pode ter cobrado: a parada E a quebra 'sem retorno' vão para a fila", async () => {
    consultarPlacaPorNivel.mockResolvedValue({ ok: false, status: 402, motivo: "A conta da APIBrasil está sem saldo.", podeTerCobrado: true });
    const { status } = await enviar({ placa: "ABC1D23", nivel: "basico" });
    expect(status).toBe(402);
    expect(registrarFalha).toHaveBeenCalledTimes(2);
    expect(registrarFalha).toHaveBeenCalledWith("parada", "apibrasil-sem-saldo", expect.any(String), expect.any(Object));
    expect(registrarFalha).toHaveBeenCalledWith("quebra", "consulta-de-placa-sem-retorno", expect.any(String), expect.any(Object));
  });

  it("502 que pode ter cobrado entra na fila como quebra 'sem retorno'; o que não cobrou, não", async () => {
    consultarPlacaPorNivel.mockResolvedValue({ ok: false, status: 502, motivo: "A consulta não voltou.", podeTerCobrado: true });
    const { status, json } = await enviar({ placa: "ABC1D23", nivel: "intermediario" });
    expect(status).toBe(502);
    expect(json.podeTerCobrado).toBe(true);
    expect(registrarFalha).toHaveBeenCalledWith("quebra", "consulta-de-placa-sem-retorno", expect.stringMatching(/ABC1D23 \(Intermediário\)/), expect.any(Object));

    registrarFalha.mockClear();
    consultarPlacaPorNivel.mockResolvedValue({ ok: false, status: 400, motivo: "A consulta guardada tem mais de 7 dias.", podeTerCobrado: false });
    expect((await enviar({ placa: "ABC1D23", nivel: "economico", aprofundarDe: ID })).status).toBe(400);
    expect(registrarFalha).not.toHaveBeenCalled();
  });

  it("gravação falhou DEPOIS de pagar: o retrato volta, com o aviso, sem aprofundar, e a falha vai à fila", async () => {
    consultarPlacaPorNivel.mockResolvedValue({
      ok: true,
      gravada: false,
      consulta: { ...basica(), id: null, fragmentos: {} },
      avisos: ["A consulta foi feita e cobrada, mas NÃO foi guardada."],
      saldo: null,
    });
    const { status, json } = await enviar({ placa: "ABC1D23", nivel: "basico" });
    expect(status).toBe(200);
    expect(json.consulta.id).toBeNull();
    expect(json.aviso).toContain("NÃO foi guardada");
    expect(json.aprofundar).toEqual([]);
    expect(registrarFalha).toHaveBeenCalledWith("quebra", "consulta-de-placa-nao-gravada", expect.any(String), expect.any(Object));
  });
});
