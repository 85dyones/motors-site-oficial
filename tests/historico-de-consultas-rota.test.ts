import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * `GET /api/consulta-placa/historico` — a pesquisa no histórico (08/10/2026).
 * A porta é a da consulta de placa; o termo e o filtro chegam limpos ao miolo.
 */

let porta: unknown;
vi.mock("../src/lib/consultaDePlaca-servidor", () => ({ autorizarConsultaDePlaca: async () => porta }));
const lerHistoricoDeConsultas = vi.fn();
vi.mock("../src/lib/historicoDeConsultas-servidor", () => ({ lerHistoricoDeConsultas: (...a: unknown[]) => lerHistoricoDeConsultas(...a) }));

const { GET } = await import("../src/app/api/consulta-placa/historico/route");
const pedir = async (busca: string) => {
  const res = await GET(new NextRequest(`http://localhost/api/consulta-placa/historico${busca}`));
  return { status: res.status, json: await res.json(), cache: res.headers.get("cache-control") };
};

beforeEach(() => {
  vi.clearAllMocks();
  porta = { ok: true, supabase: "sessao", usuarioId: "u1" };
  lerHistoricoDeConsultas.mockResolvedValue({ ok: true, itens: [], semRegistroDeModelo: false });
});

describe("GET /api/consulta-placa/historico", () => {
  it("sem sessão é 401 e sem papel é 403, sem ler nada", async () => {
    porta = { ok: false, status: 401, motivo: "Sessão expirada." };
    expect((await pedir("")).status).toBe(401);
    porta = { ok: false, status: 403, motivo: "Sem permissão." };
    expect((await pedir("?q=x")).status).toBe(403);
    expect(lerHistoricoDeConsultas).not.toHaveBeenCalled();
  });

  it("termo limpo e filtro conhecido chegam ao miolo, com a sessão; sem cache", async () => {
    const r = await pedir("?q=%20T-Cross%2C1.4%25%20&tipo=placa");
    expect(r.status).toBe(200);
    expect(r.cache).toBe("no-store");
    expect(lerHistoricoDeConsultas).toHaveBeenCalledWith("sessao", { termo: "T-Cross 1.4", filtro: "placa" });
    await pedir("?tipo=qualquer");
    expect(lerHistoricoDeConsultas).toHaveBeenLastCalledWith("sessao", { termo: null, filtro: "todas" });
  });

  it("leitura que falhou é 502 com o motivo", async () => {
    lerHistoricoDeConsultas.mockResolvedValueOnce({ ok: false, motivo: "fora" });
    expect(await pedir("")).toMatchObject({ status: 502, json: { error: "fora" } });
  });
});
