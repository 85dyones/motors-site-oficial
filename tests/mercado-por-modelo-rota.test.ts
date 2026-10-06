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
const bancoDoHistorico = vi.fn(() => "banco");
vi.mock("../src/lib/mercadoPorModelo-servidor", () => ({
  consultarMercado: (...a: unknown[]) => consultarMercado(...a),
  bancoDoHistorico: (...a: unknown[]) => bancoDoHistorico(...(a as [])),
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
  consultarMercado.mockResolvedValue({ ok: true, mercado: { fipeAtual: 128430 }, chamadas: 27, avisos: ["aviso"] });
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
  });

  it("pedido torto é 400 e não chega à FIPE", async () => {
    for (const corpo of ["{não é json", {}, { ...PEDIDO, marca: "59/../x" }, { ...PEDIDO, ano: "32000" }]) {
      const r = await enviar(corpo);
      expect(r.status, JSON.stringify(corpo)).toBe(400);
      expect(r.json.codigo).toBe("pedido_invalido");
    }
    expect(consultarMercado).not.toHaveBeenCalled();
  });

  it("devolve o mercado e os avisos, sem cache, usando o banco da sessão", async () => {
    const r = await enviar(PEDIDO);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ mercado: { fipeAtual: 128430 }, avisos: ["aviso"] });
    expect(r.cache).toBe("no-store");
    expect(bancoDoHistorico).toHaveBeenCalledWith("sessao");
    const [pedido, deps] = consultarMercado.mock.calls[0];
    expect(pedido).toEqual({ tipo: "carros", marca: "59", modelo: "5940", ano: "2022-1", outrosAnos: ["2023-1", "2021-1"] });
    expect(deps.banco).toBe("banco");
  });

  it("repassa o status da FIPE: limite do dia é 429, FIPE fora é 502", async () => {
    consultarMercado.mockResolvedValueOnce({ ok: false, status: 429, motivo: "limite" });
    expect(await enviar(PEDIDO)).toMatchObject({ status: 429, json: { error: "limite" } });
    consultarMercado.mockResolvedValueOnce({ ok: false, status: 502, motivo: "fora" });
    expect((await enviar(PEDIDO)).status).toBe(502);
  });
});
