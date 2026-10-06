import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { criarContadorDaRodada, passoDoFunil, type PassoDoFunil } from "../src/lib/funilDoProfiler";
import { semComentarios } from "./fonte";

/**
 * O contador diário do funil do Garagem Profiler (06/10/2026).
 *
 * A leitura de 10 dias achou zero lead do canal e nenhuma forma de dizer se
 * pouca gente abre o quiz ou se as pessoas desistem numa pergunta. O contador
 * guarda (dia, passo) → contagem, sem identificador nenhum — e é isso que este
 * arquivo trava: o que sai do navegador, uma vez por rodada; o que a rota
 * aceita; e que nada além do nome do passo viaja.
 */

const rpc = vi.fn();
vi.mock("../src/lib/supabase-server", () => ({
  createAdminSupabaseClient: () => ({ rpc }),
}));

const { POST } = await import("../src/app/api/profiler/passo/route");

async function enviar(corpo: string, origem?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origem) headers.origin = origem;
  const res = await POST(new NextRequest("http://localhost/api/profiler/passo", { method: "POST", headers, body: corpo }));
  return res.status;
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
});

describe("os passos", () => {
  it("cobrem todos os estados do quiz que o GA4 já recebe, menos o loading", () => {
    // `EstadoQuiz` (lib/perguntasDoProfiler.ts): intro, q1…q5, loading, results.
    for (const estado of ["intro", "q1", "q2", "q3", "q4", "q5", "results"]) {
      expect(passoDoFunil(estado), estado).toBe(estado);
    }
    expect(passoDoFunil("loading")).toBeNull();
  });
});

describe("uma vez por rodada", () => {
  it("voltar e avançar não conta a mesma pessoa duas vezes", () => {
    const saiu: PassoDoFunil[] = [];
    const funil = criarContadorDaRodada((p) => saiu.push(p));
    for (const p of ["intro", "q1", "q2", "q3", "q2", "q3", "q4", "q5", "loading", "results", "results"]) funil.contar(p);
    expect(saiu).toEqual(["intro", "q1", "q2", "q3", "q4", "q5", "results"]);
  });

  it("REFAZER começa outra rodada — mas não reabre a página", () => {
    const saiu: PassoDoFunil[] = [];
    const funil = criarContadorDaRodada((p) => saiu.push(p));
    for (const p of ["intro", "q1", "q2", "results", "lead_carros"]) funil.contar(p);
    funil.recomecar();
    for (const p of ["intro", "q1", "q2", "results", "lead_aviso"]) funil.contar(p);
    expect(saiu).toEqual(["intro", "q1", "q2", "results", "lead_carros", "q1", "q2", "results", "lead_aviso"]);
  });
});

describe("a rota", () => {
  it("soma o passo pela função do banco, e responde 204", async () => {
    expect(await enviar(JSON.stringify({ passo: "q3" }))).toBe(204);
    expect(rpc).toHaveBeenCalledWith("profiler_contar_passo", { p_passo: "q3" });
  });

  it("passo fora da lista, corpo torto ou grande demais não chegam ao banco", async () => {
    expect(await enviar(JSON.stringify({ passo: "q6" }))).toBe(400);
    expect(await enviar("não é json")).toBe(400);
    expect(await enviar("null")).toBe(400);
    expect(await enviar(JSON.stringify({ passo: "q1", lixo: "x".repeat(300) }))).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("pedido de outra origem não conta", async () => {
    expect(await enviar(JSON.stringify({ passo: "q1" }), "https://outro-site.example")).toBe(403);
    expect(await enviar(JSON.stringify({ passo: "q1" }), "http://localhost")).toBe(204);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("banco fora do ar é aviso no log, não erro para quem escolhe carro", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    expect(await enviar(JSON.stringify({ passo: "intro" }))).toBe(204);
  });
});

describe("o que o quiz manda", () => {
  const quiz = readFileSync(join(__dirname, "..", "src", "components", "CarMatch.tsx"), "utf8");
  const lib = readFileSync(join(__dirname, "..", "src", "lib", "funilDoProfiler.ts"), "utf8");
  const rota = readFileSync(join(__dirname, "..", "src", "app", "api", "profiler", "passo", "route.ts"), "utf8");

  it("cada estado, o POR MÊS e o lead aceito — e o REFAZER recomeça a rodada", () => {
    expect(quiz).toContain("funil.contar(gameState);");
    expect(quiz).toContain('funil.contar("por_mes");');
    expect(quiz).toMatch(/if \(resposta\.ok\) funil\.contar\(`lead_\$\{modoDoLead\}`\);/);
    expect(quiz).toMatch(/const handleReset = \(\) => \{\s*funil\.recomecar\(\);/);
  });

  it("só o nome do passo viaja — nenhum identificador no corpo nem na rota", () => {
    expect(lib).toContain("JSON.stringify({ passo })");
    // O código, sem os comentários — que citam o que NÃO vai ("nada de ag_uid").
    for (const fonte of [lib, rota].map(semComentarios)) {
      expect(fonte).not.toMatch(/ag_uid|getActiveAgUid|x-forwarded-for|user-agent|cookies\(/i);
    }
  });

  it("o proxy limita a rota por IP, como a /api/capi", () => {
    const proxy = readFileSync(join(__dirname, "..", "src", "proxy.ts"), "utf8");
    expect(proxy).toContain('"/api/profiler/passo",');
    expect(proxy).toMatch(/path === "\/api\/profiler\/passo"[\s\S]*funilRatelimit\.limit/);
  });
});
