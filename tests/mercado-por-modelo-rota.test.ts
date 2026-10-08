import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * `POST /api/consulta-placa/modelo` — a porta da aba sem custo (06/10/2026).
 *
 * A aba não gasta dinheiro, mas gasta o teto diário do token da FIPE, que é o
 * mesmo da `/avaliacao` do site. O que estes testes seguram: quem não avalia
 * carro não passa, e pedido torto não chega à FIPE.
 */

let porta: unknown;
vi.mock("../src/lib/consultaDePlaca-servidor", () => ({
  autorizarConsultaDePlaca: async () => porta,
}));

const consultarMercado = vi.fn();
const estimarConsultaCompleta = vi.fn();
const bancoDoHistorico = vi.fn(() => "banco");
vi.mock("../src/lib/mercadoPorModelo-servidor", () => ({
  consultarMercado: (...a: unknown[]) => consultarMercado(...a),
  estimarConsultaCompleta: (...a: unknown[]) => estimarConsultaCompleta(...a),
  bancoDoHistorico: (...a: unknown[]) => bancoDoHistorico(...(a as [])),
}));

let apiBrasil = { token: "tok-api" as string | null, homologacao: false };
vi.mock("../src/lib/apiBrasil", () => ({ configuracaoDaApiBrasil: () => apiBrasil }));
const lerMesNaTabelaPaga = vi.fn(async () => ({ tipo: "sem_valor" }));
vi.mock("../src/lib/apiBrasilFipe", () => ({
  lerMesNaTabelaPaga: (...a: unknown[]) => lerMesNaTabelaPaga(...(a as [])),
  precoDaTabelaPaga: () => 0.06,
}));

const { POST } = await import("../src/app/api/consulta-placa/modelo/route");

async function enviar(corpo: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/consulta-placa/modelo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
    }),
  );
  return { status: res.status, json: await res.json(), cache: res.headers.get("cache-control") };
}

const PEDIDO = { tipo: "carros", marca: "59", modelo: "5940", ano: "2022-1", anos: ["2023-1", "2022-1", "2021-1"] };

beforeEach(() => {
  vi.clearAllMocks();
  porta = { ok: true, supabase: "sessao", usuarioId: "u1" };
  apiBrasil = { token: "tok-api", homologacao: false };
  consultarMercado.mockResolvedValue({ ok: true, mercado: { fipeAtual: 128430 }, chamadas: 27, chamadasPagas: 0, avisos: ["aviso"] });
  estimarConsultaCompleta.mockResolvedValue({ ok: true, mesesPagosNoMaximo: 22 });
});

describe("POST /api/consulta-placa/modelo", () => {
  it("sem sessão é 401 e sem papel é 403, antes de qualquer chamada", async () => {
    porta = { ok: false, status: 401, motivo: "Sessão expirada." };
    expect((await enviar(PEDIDO)).status).toBe(401);
    porta = { ok: false, status: 403, motivo: "Sem permissão." };
    const r = await enviar(PEDIDO);
    expect(r.status).toBe(403);
    expect(r.json.error).toBe("Sem permissão.");
    expect(consultarMercado).not.toHaveBeenCalled();
    expect(estimarConsultaCompleta).not.toHaveBeenCalled();
  });

  it("pedido torto é 400 e não chega à FIPE", async () => {
    for (const corpo of ["{não é json", {}, { ...PEDIDO, marca: "59/../x" }, { ...PEDIDO, ano: "32000" }]) {
      const r = await enviar(corpo);
      expect(r.status, JSON.stringify(corpo)).toBe(400);
      expect(r.json.codigo).toBe("pedido_invalido");
    }
    expect(consultarMercado).not.toHaveBeenCalled();
  });

  it("sem modo é a pontual, grátis: devolve o mercado sem cache, com o banco da sessão e SEM leitor pago", async () => {
    const r = await enviar(PEDIDO);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ mercado: { fipeAtual: 128430 }, avisos: ["aviso"], modo: "pontual", chamadasPagas: 0, custo: 0 });
    expect(r.cache).toBe("no-store");
    expect(bancoDoHistorico).toHaveBeenCalledWith("sessao");
    const [pedido, deps] = consultarMercado.mock.calls[0];
    expect(pedido).toEqual({ tipo: "carros", marca: "59", modelo: "5940", ano: "2022-1", outrosAnos: ["2023-1", "2021-1"] });
    expect(deps.banco).toBe("banco");
    expect(deps.modo).toBe("pontual");
    expect(deps.pago).toBeNull();
    // Modo que não é "completa" é pontual: ninguém paga por engano.
    await enviar({ ...PEDIDO, modo: "qualquer" });
    expect(consultarMercado.mock.calls[1][1]).toMatchObject({ modo: "pontual", pago: null });
  });

  it("estimar não consulta nem cobra: só diz quantos meses podem ser pagos, e a que preço", async () => {
    const r = await enviar({ ...PEDIDO, modo: "completa", estimar: true });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ mesesPagosNoMaximo: 22, precoPorMes: 0.06, temToken: true, homologacao: false });
    expect(consultarMercado).not.toHaveBeenCalled();
    expect(lerMesNaTabelaPaga).not.toHaveBeenCalled();
  });

  it("completa com token: o leitor pago leva os códigos da FIPE e o mês, e o custo vem calculado", async () => {
    consultarMercado.mockResolvedValueOnce({ ok: true, mercado: { fipeAtual: 1 }, chamadas: 5, chamadasPagas: 22, avisos: [] });
    const r = await enviar({ ...PEDIDO, modo: "completa" });
    expect(r.json).toMatchObject({ modo: "completa", chamadasPagas: 22, custo: 1.32 });
    const deps = consultarMercado.mock.calls[0][1];
    expect(deps.modo).toBe("completa");
    expect(deps.pago.homologacao).toBe(false);
    await deps.pago.ler({ ano: "2022-1", referencia: { codigo: 320, ano: 2025, mes: 4 } });
    expect(lerMesNaTabelaPaga).toHaveBeenCalledWith(
      { tipo: "carros", marca: "59", modelo: "5940", ano: "2022-1", referencia: 320 },
      { token: "tok-api", homologacao: false },
    );
  });

  it("completa sem APIBRASIL_TOKEN: roda sem leitor pago; em homologação, custo zero", async () => {
    apiBrasil = { token: null, homologacao: false };
    await enviar({ ...PEDIDO, modo: "completa" });
    expect(consultarMercado.mock.calls[0][1].pago).toBeNull();
    apiBrasil = { token: "tok-api", homologacao: true };
    consultarMercado.mockResolvedValueOnce({ ok: true, mercado: { fipeAtual: 1 }, chamadas: 5, chamadasPagas: 22, avisos: [] });
    const r = await enviar({ ...PEDIDO, modo: "completa" });
    expect(r.json.custo).toBe(0);
    expect(consultarMercado.mock.calls[1][1].pago.homologacao).toBe(true);
  });

  it("repassa o status da FIPE: limite do dia é 429, FIPE fora é 502", async () => {
    consultarMercado.mockResolvedValueOnce({ ok: false, status: 429, motivo: "limite" });
    expect(await enviar(PEDIDO)).toMatchObject({ status: 429, json: { error: "limite" } });
    consultarMercado.mockResolvedValueOnce({ ok: false, status: 502, motivo: "fora" });
    expect((await enviar(PEDIDO)).status).toBe(502);
  });
});
