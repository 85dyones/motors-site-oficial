import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * `/api/match` recebendo o `perfil` da fase 2 — o corpo vem do navegador, e a
 * rota não confia nele.
 *
 * O estoque é o fixture de 25/09 (`estoque-de-25-09.ts`), servido no lugar do
 * banco; a telemetria vira no-op.
 */

vi.mock("../src/lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/supabase")>()),
  getEstoque: async () => (await import("./estoque-de-25-09")).ESTOQUE_DE_25_09,
}));

vi.mock("../src/lib/telemetry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/telemetry")>()),
  logCarMatchQueried: () => {},
  logApiTelemetry: () => {},
}));

const { POST } = await import("../src/app/api/match/route");

async function pedir(corpo: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    }),
  );
  expect(res.status).toBe(200);
  const json = await res.json();
  return json.recomendacao as {
    filtros: string[];
    naFaixa: number;
    cartoes: { pedidos: { rotulo: string }[] }[];
  };
}

describe("o perfil da fase 2", () => {
  it("vira filtro do motor", async () => {
    const r = await pedir({
      perfil: { leva: "familia", jeitos: ["SUV"], cambio: "so_automatico", naoPodeFaltar: ["2020-ou-mais-novo"] },
      orcamento: { min: 75000, max: 175000 },
    });
    expect(r.filtros).toEqual(["de R$ 75 mil a R$ 175 mil", "4 portas ou mais", "só automático", "SUV", "2020 ou mais novo"]);
  });

  it("valor fora da lista é ignorado, e não vira filtro nem erro", async () => {
    const r = await pedir({
      perfil: {
        leva: "constructor",
        jeitos: ["SUV", "SUV", "Esportivo", 42, null],
        cambio: "__proto__",
        naoPodeFaltar: "turbo",
      },
      orcamento: { min: 0, max: 115000 },
    });
    expect(r.filtros).toEqual(["até R$ 115 mil", "SUV"]);
  });

  it("não passa de três itens no que não pode faltar", async () => {
    // Cinco itens de ficha: a rota fica com os três primeiros, como a tela.
    // Item de ficha não é filtro — ele aparece como pedido no cartão.
    const r = await pedir({
      perfil: { leva: "eu", naoPodeFaltar: ["camera", "multimidia", "sensor", "turbo", "4x4"] },
      orcamento: { min: 0, max: null },
    });
    expect(r.cartoes[0].pedidos.map((p) => p.rotulo)).toEqual([
      "câmera de ré",
      "central multimídia",
      "sensor de estacionamento",
    ]);
  });

  it("o 'e se' tira ano, km e diesel — e nunca o teto", async () => {
    const r = await pedir({
      perfil: { leva: "carga", naoPodeFaltar: ["2020-ou-mais-novo", "ate-80-mil-km", "diesel"] },
      orcamento: { min: 0, max: 75000 },
      afrouxar: ["ano", "km", "diesel", "teto", "preco"],
    });
    expect(r.filtros).toEqual(["até R$ 75 mil", "picape, utilitário ou van"]);
  });

  it("o formato da fase 1 continua valendo", async () => {
    // Uma aba aberta antes do deploy ainda manda `respostas`.
    const r = await pedir({
      respostas: { objetivo: "family", experiencia: "tech", estilo: "suv" },
      orcamento: { min: 0, max: 115000 },
    });
    expect(r.filtros).toEqual(["até R$ 115 mil", "4 portas ou mais", "só automático", "SUV"]);
  });
});
