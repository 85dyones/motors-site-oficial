import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { criarContadorDaRodada, passoDoFunil, PASSOS_DO_FUNIL, type PassoDoFunil } from "../src/lib/funilDoProfiler";
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
  it("são a lista fechada do CHECK da migração", () => {
    const sql = readFileSync(
      join(__dirname, "..", "supabase", "migrations", "20261006120000_funil_do_profiler.sql"),
      "utf8",
    );
    for (const passo of PASSOS_DO_FUNIL) expect(sql, passo).toContain(`'${passo}'`);
    expect(passoDoFunil("q6")).toBeNull();
    expect(passoDoFunil("__proto__")).toBeNull();
    expect(passoDoFunil(1)).toBeNull();
  });

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

  it("preview da Vercel não soma na tabela de produção", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    try {
      expect(await enviar(JSON.stringify({ passo: "q1" }))).toBe(204);
      expect(rpc).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
    vi.stubEnv("VERCEL_ENV", "production");
    try {
      expect(await enviar(JSON.stringify({ passo: "q1" }))).toBe(204);
      expect(rpc).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("o tamanho declarado é recusado antes de ler o corpo", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/profiler/passo", {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": "5000000" },
        body: JSON.stringify({ passo: "q1" }),
      }),
    );
    expect(res.status).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a origem do site vale mesmo quando o host do pedido é outro (atrás de proxy)", async () => {
    const { SITE_URL } = await import("../src/lib/site");
    expect(await enviar(JSON.stringify({ passo: "q1" }), new URL(SITE_URL).origin)).toBe(204);
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

  it("o proxy limita a rota por IP — sem analytics, que guardaria o IP de cada visitante para sempre", () => {
    // Bloqueio da revisão de 06/10: com `analytics: true`, o @upstash/ratelimit
    // grava {identifier, success} por chamada num contador por hora, sem TTL.
    const proxy = semComentarios(readFileSync(join(__dirname, "..", "src", "proxy.ts"), "utf8"));
    expect(proxy).toContain('"/api/profiler/passo",');
    expect(proxy).toMatch(/path === "\/api\/profiler\/passo"[\s\S]*funilRatelimit\.limit/);
    const limitador = proxy.slice(proxy.indexOf("funilRatelimit = new Ratelimit("), proxy.indexOf("});", proxy.indexOf("funilRatelimit = new Ratelimit(")));
    expect(limitador).toContain("slidingWindow(60");
    expect(limitador).not.toMatch(/analytics/);
  });
});

describe("a recusa de rastreamento", () => {
  // Pergunta 8 da spec ("o contador anônimo roda mesmo com recusa de
  // rastreamento?"): o dono decidiu em 06/10, "inclua tudo". Quem recusou em
  // /privacidade também conta — e manda o mesmo corpo de quem não recusou,
  // só o nome do passo. A /privacidade diz isso (teste abaixo).
  it("quem recusou também conta, com o mesmo corpo: só o nome do passo", async () => {
    const enviados: { url: string; corpo: string }[] = [];
    const armazenamento = new Map<string, string>();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => armazenamento.get(k) ?? null,
      setItem: (k: string, v: string) => void armazenamento.set(k, v),
    });
    vi.stubGlobal("navigator", {
      sendBeacon: (url: string, corpo: Blob) => {
        void corpo.text().then((t) => enviados.push({ url, corpo: t }));
        return true;
      },
    });
    try {
      const { enviarPassoDoFunil } = await import("../src/lib/funilDoProfiler");
      armazenamento.set("ag_cookie_consent", "rejected");
      enviarPassoDoFunil("q1");
      armazenamento.delete("ag_cookie_consent");
      enviarPassoDoFunil("q2");
      await new Promise((r) => setTimeout(r, 0));
      expect(enviados).toEqual([
        { url: "/api/profiler/passo", corpo: '{"passo":"q1"}' },
        { url: "/api/profiler/passo", corpo: '{"passo":"q2"}' },
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a /privacidade avisa que a contagem anônima continua com a medição desligada", () => {
    const pagina = readFileSync(join(__dirname, "..", "src", "app", "privacidade", "page.tsx"), "utf8")
      .replace(/\s+/g, " ");
    expect(pagina).toContain("continua mesmo com a medição desligada");
    expect(pagina).toContain("só o dia, o nome da etapa e o total");
    // E o botão não promete parar "a medição" inteira: para a das ferramentas.
    expect(pagina).toContain("A opção interrompe a medição dessas ferramentas neste navegador");
  });

    it("beacon que lança cai no fetch, em vez de perder o passo calado", async () => {
    const pelos: string[] = [];
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    vi.stubGlobal("navigator", {
      sendBeacon: () => {
        throw new TypeError("Illegal invocation");
      },
    });
    vi.stubGlobal("fetch", (url: string, init: { body: string }) => {
      pelos.push(`${url} ${init.body}`);
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    try {
      const { enviarPassoDoFunil } = await import("../src/lib/funilDoProfiler");
      enviarPassoDoFunil("results");
      expect(pelos).toEqual(['/api/profiler/passo {"passo":"results"}']);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
