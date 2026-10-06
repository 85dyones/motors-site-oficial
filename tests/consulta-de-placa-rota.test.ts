import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

/**
 * `POST /api/consulta-placa` — a porta da consulta de placa (06/10/2026).
 *
 * O que estes testes seguram é a ORDEM, porque ela é o que protege o dinheiro
 * da loja: nada chega à APIBrasil antes de a sessão, a placa, o banco e o
 * token estarem conferidos; a mesma placa não é paga duas vezes sem alguém
 * mandar; e uma consulta paga nunca se perde por falha de gravação.
 */

const RESPOSTA = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "apibrasil", "veiculos-total-mg-com-alienacao.json"), "utf8"),
);

let porta: unknown;
const lerUltimaConsulta = vi.fn();
const gravarConsulta = vi.fn();
vi.mock("../src/lib/consultaDePlaca-servidor", () => ({
  MIGRACAO_DA_CONSULTA_DE_PLACA: "20261006180000_consultas_de_placa",
  autorizarConsultaDePlaca: async () => porta,
  lerUltimaConsulta: (...a: unknown[]) => lerUltimaConsulta(...a),
  gravarConsulta: (...a: unknown[]) => gravarConsulta(...a),
}));

const consultarVeiculosTotal = vi.fn();
let configuracao = { token: "segredo" as string | null, homologacao: false };
vi.mock("../src/lib/apiBrasil", () => ({
  configuracaoDaApiBrasil: () => configuracao,
  consultarVeiculosTotal: (...a: unknown[]) => consultarVeiculosTotal(...a),
}));

const consultarGratuito = vi.fn();
vi.mock("../src/lib/consultaGratuita", () => ({
  consultarGratuito: (...a: unknown[]) => consultarGratuito(...a),
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

const GUARDADA = { id: "c1", placa: "ABC1D23", retrato: { placa: "ABC1D23" }, custo: 30, homologacao: false, criadoEm: "2026-10-01T12:00:00Z", consultadoPor: "Ana" };

beforeEach(() => {
  vi.clearAllMocks();
  porta = { ok: true, supabase: { marca: "sessão" } };
  configuracao = { token: "segredo", homologacao: false };
  lerUltimaConsulta.mockResolvedValue({ ok: true, consulta: null });
  consultarVeiculosTotal.mockResolvedValue({ ok: true, corpo: RESPOSTA });
  consultarGratuito.mockResolvedValue({ empresaDoFaturamento: null, fipeOficial: null, falhas: [] });
  gravarConsulta.mockImplementation(async (_s: unknown, d: { placa: string; retrato: unknown; custo: number | null; homologacao: boolean }) => ({
    ok: true,
    consulta: { id: "novo", placa: d.placa, retrato: d.retrato, custo: d.custo, homologacao: d.homologacao, criadoEm: "2026-10-06T18:00:00Z", consultadoPor: "Ana" },
  }));
});

describe("antes de gastar", () => {
  it("sem sessão, 401; sem papel, 403 — e nada é lido nem consultado", async () => {
    porta = { ok: false, status: 401, motivo: "Não autenticado." };
    expect((await enviar({ placa: "ABC1D23" })).status).toBe(401);
    porta = { ok: false, status: 403, motivo: "A consulta de placa é do Administrador, do Gestor e do Comercial." };
    expect((await enviar({ placa: "ABC1D23" })).status).toBe(403);
    expect(lerUltimaConsulta).not.toHaveBeenCalled();
    expect(consultarVeiculosTotal).not.toHaveBeenCalled();
  });

  it.each([[{ placa: "AB12345" }], [{}], ["isto não é json"], [{ placa: 1234567 }]])("placa inválida é 400, antes do banco: %j", async (corpo) => {
    const { status, json } = await enviar(corpo);
    expect(status).toBe(400);
    expect(json.codigo).toBe("placa_invalida");
    expect(lerUltimaConsulta).not.toHaveBeenCalled();
    expect(consultarVeiculosTotal).not.toHaveBeenCalled();
  });

  it("tabela ausente é descoberta ANTES de pagar, mesmo com `refazer`", async () => {
    lerUltimaConsulta.mockResolvedValue({ ok: false, faltaMigracao: true, motivo: "relation does not exist" });
    const { status, json } = await enviar({ placa: "ABC1D23", refazer: true });
    expect(status).toBe(503);
    expect(json.codigo).toBe("falta_migracao");
    expect(json.error).toContain("20261006180000_consultas_de_placa");
    expect(consultarVeiculosTotal).not.toHaveBeenCalled();
  });

  it("sem token é 503 com o nome da variável, e nada é consultado", async () => {
    configuracao = { token: null, homologacao: false };
    const { status, json } = await enviar({ placa: "ABC1D23" });
    expect(status).toBe(503);
    expect(json.error).toContain("APIBRASIL_TOKEN");
    expect(consultarVeiculosTotal).not.toHaveBeenCalled();
  });
});

describe("a mesma placa não é paga duas vezes", () => {
  it("havendo consulta guardada, é ela que volta, e o fornecedor não é chamado", async () => {
    lerUltimaConsulta.mockResolvedValue({ ok: true, consulta: GUARDADA });
    const { status, json, cache } = await enviar({ placa: "abc-1d23" });
    expect(status).toBe(200);
    expect(json).toEqual({ consulta: GUARDADA, guardada: true });
    expect(cache).toBe("no-store");
    // A placa chega ao banco na forma canônica.
    expect(lerUltimaConsulta.mock.calls[0][1]).toBe("ABC1D23");
    expect(consultarVeiculosTotal).not.toHaveBeenCalled();
    expect(gravarConsulta).not.toHaveBeenCalled();
  });

  it("`soGuardada` nunca chega ao fornecedor, nem quando não há nada guardado", async () => {
    const { status, json } = await enviar({ placa: "ABC1D23", soGuardada: true });
    expect(status).toBe(200);
    expect(json).toEqual({ consulta: null, guardada: true });
    expect(consultarVeiculosTotal).not.toHaveBeenCalled();
  });

  it("`refazer` paga de novo mesmo com consulta guardada", async () => {
    lerUltimaConsulta.mockResolvedValue({ ok: true, consulta: GUARDADA });
    const { status, json } = await enviar({ placa: "ABC1D23", refazer: true });
    expect(status).toBe(200);
    expect(json.guardada).toBe(false);
    expect(consultarVeiculosTotal).toHaveBeenCalledTimes(1);
  });
});

describe("a consulta nova", () => {
  it("paga UMA vez, mescla o que veio sem custo e grava só o retrato", async () => {
    consultarGratuito.mockResolvedValue({
      empresaDoFaturamento: { razaoSocial: "FROTA SA", nomeFantasia: null, cnae: "7711000", atividade: "Locação", locadora: true },
      fipeOficial: null,
      falhas: ["FIPE na tabela pública: a consulta paga não trouxe o código FIPE do carro."],
    });
    const { status, json } = await enviar({ placa: "ABC1D23" });
    expect(status).toBe(200);
    expect(consultarVeiculosTotal).toHaveBeenCalledTimes(1);
    expect(consultarVeiculosTotal).toHaveBeenCalledWith("ABC1D23", { token: "segredo", homologacao: false });
    // A parte gratuita recebe o que a paga descobriu.
    expect(consultarGratuito).toHaveBeenCalledWith({ cnpj: "00000000000191", codigoFipe: null, anoModelo: 2021 });

    expect(gravarConsulta).toHaveBeenCalledTimes(1);
    const [cliente, gravado] = gravarConsulta.mock.calls[0];
    expect(cliente).toEqual({ marca: "sessão" });
    expect(gravado).toMatchObject({ placa: "ABC1D23", produto: "veiculos-total", custo: 30, homologacao: false });
    expect(gravado.retrato.apontamentos.map((a: { chave: string }) => a.chave)).toEqual(["gravame", "donos", "locadora"]);
    expect(gravado.retrato.gratuito.falhas).toHaveLength(1);

    expect(json.consulta.id).toBe("novo");
    expect(json.saldo).toBe(970);
  });

  it("nem o que é gravado nem o que é devolvido leva dado pessoal ou a resposta crua", async () => {
    const { json } = await enviar({ placa: "ABC1D23" });
    const gravado = JSON.stringify(gravarConsulta.mock.calls[0][1]);
    const devolvido = JSON.stringify(json);
    for (const texto of [gravado, devolvido]) {
      for (const pessoal of ["FULANO", "000.000.001-01", "00000000202", "conta@exemplo.invalid", "pronome", "documentoFinanciado", "cpfCnpj"]) {
        expect(texto, pessoal).not.toContain(pessoal);
      }
    }
  });

  it("gravação falhou DEPOIS de pagar: o retrato volta assim mesmo, com o aviso", async () => {
    gravarConsulta.mockResolvedValue({ ok: false, motivo: "new row violates row-level security policy" });
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { status, json } = await enviar({ placa: "ABC1D23" });
    erro.mockRestore();
    expect(status).toBe(200);
    expect(json.consulta.id).toBeNull();
    expect(json.consulta.retrato.placa).toBe("ABC1D23");
    expect(json.aviso).toContain("NÃO foi guardada");
    // Dinheiro gasto sem registro entra na fila de triagem.
    expect(registrarFalha).toHaveBeenCalledWith("quebra", "consulta-de-placa-nao-gravada", expect.any(String), expect.any(Object));
  });

  it("falha da rede do fornecedor volta com o status dela e o aviso de cobrança", async () => {
    consultarVeiculosTotal.mockResolvedValue({ ok: false, status: 504, motivo: "não respondeu a tempo", podeTerCobrado: true });
    const { status, json } = await enviar({ placa: "ABC1D23" });
    expect(status).toBe(504);
    expect(json).toEqual({ error: "não respondeu a tempo", podeTerCobrado: true });
    expect(gravarConsulta).not.toHaveBeenCalled();
    expect(registrarFalha).not.toHaveBeenCalled();
  });

  it("sem saldo é 402, e a loja é avisada", async () => {
    consultarVeiculosTotal.mockResolvedValue({ ok: false, status: 402, motivo: "sem saldo", podeTerCobrado: false });
    expect((await enviar({ placa: "ABC1D23" })).status).toBe(402);
    expect(registrarFalha).toHaveBeenCalledWith("parada", "apibrasil-sem-saldo", expect.stringContaining("sem saldo"), expect.any(Object));
  });

  it("erro do fornecedor com HTTP 200 é 502 com a mensagem dele, e nada é gravado", async () => {
    consultarVeiculosTotal.mockResolvedValue({ ok: true, corpo: { error: true, message: "Placa não encontrada" } });
    const { status, json } = await enviar({ placa: "ABC1D23" });
    expect(status).toBe(502);
    expect(json.error).toBe("Placa não encontrada");
    expect(consultarGratuito).not.toHaveBeenCalled();
    expect(gravarConsulta).not.toHaveBeenCalled();
  });

  it("resposta de outra placa não é gravada", async () => {
    const { status } = await enviar({ placa: "XYZ9Z99" });
    expect(status).toBe(502);
    expect(gravarConsulta).not.toHaveBeenCalled();
  });
});
