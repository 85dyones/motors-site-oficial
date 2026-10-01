import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  CHAVE_INDEXNOW,
  JANELA_EM_HORAS,
  LIMITE_DE_URLS,
  montarAviso,
  urlsParaAvisar,
} from "../src/lib/indexNow";

/**
 * IndexNow (01/10/2026): o aviso diário ao Bing das páginas que mudaram.
 *
 * O que este arquivo trava:
 *   1. A chave do código é a do arquivo público. Divergiu, o Bing recusa
 *      todo aviso com 403 e ninguém percebe.
 *   2. Só entra o que o sitemap anuncia e que mudou dentro da janela, sem
 *      repetir URL e sem passar do limite do protocolo.
 *   3. O cron existe e aponta para a rota.
 *   4. A rota não avisa nada sem a credencial do agendador.
 */

const RAIZ = join(__dirname, "..");
const agora = new Date("2026-10-01T12:00:00Z");
const horasAtras = (h: number) => new Date(agora.getTime() - h * 3_600_000);

describe("a chave", () => {
  it("o arquivo público tem exatamente a chave do código", () => {
    const arquivo = join(RAIZ, "public", `${CHAVE_INDEXNOW}.txt`);
    expect(existsSync(arquivo)).toBe(true);
    expect(readFileSync(arquivo, "utf8").trim()).toBe(CHAVE_INDEXNOW);
    expect(CHAVE_INDEXNOW).toMatch(/^[a-f0-9]{32}$/);
  });
});

describe("o que entra no aviso", () => {
  it("só o que mudou dentro da janela, sem repetir", () => {
    const urls = urlsParaAvisar(
      [
        { url: "https://motorsstore.com.br/a", lastModified: horasAtras(2) },
        { url: "https://motorsstore.com.br/a", lastModified: horasAtras(3) },
        { url: "https://motorsstore.com.br/b", lastModified: horasAtras(JANELA_EM_HORAS + 1) },
        { url: "https://motorsstore.com.br/c" },
        { url: "https://motorsstore.com.br/d", lastModified: "data quebrada" },
        { url: "https://motorsstore.com.br/e", lastModified: horasAtras(25).toISOString() },
      ],
      agora,
    );
    expect(urls).toEqual(["https://motorsstore.com.br/a", "https://motorsstore.com.br/e"]);
  });

  it("carimbo no futuro distante não entra (relógio errado no banco)", () => {
    const urls = urlsParaAvisar(
      [{ url: "https://motorsstore.com.br/f", lastModified: new Date(agora.getTime() + 48 * 3_600_000) }],
      agora,
    );
    expect(urls).toEqual([]);
  });

  it("respeita o limite do protocolo", () => {
    const muitas = Array.from({ length: LIMITE_DE_URLS + 5 }, (_, i) => ({
      url: `https://motorsstore.com.br/x${i}`,
      lastModified: horasAtras(1),
    }));
    expect(urlsParaAvisar(muitas, agora)).toHaveLength(LIMITE_DE_URLS);
  });

  it("o pedido leva host, chave e o endereço do arquivo da chave", () => {
    expect(montarAviso("https://motorsstore.com.br", ["https://motorsstore.com.br/a"])).toEqual({
      host: "motorsstore.com.br",
      key: CHAVE_INDEXNOW,
      keyLocation: `https://motorsstore.com.br/${CHAVE_INDEXNOW}.txt`,
      urlList: ["https://motorsstore.com.br/a"],
    });
  });
});

describe("o agendamento e a rota", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("o cron diário aponta para a rota", () => {
    const config = JSON.parse(readFileSync(join(RAIZ, "vercel.json"), "utf8"));
    expect(config.crons).toContainEqual(expect.objectContaining({ path: "/api/indexnow" }));
  });

  it("sem a credencial do agendador, recusa e não avisa ninguém", async () => {
    vi.stubEnv("CRON_SECRET", "segredo");
    const fetchEspiao = vi.spyOn(globalThis, "fetch");
    const { GET } = await import("../src/app/api/indexnow/route");
    const sem = await GET(new Request("https://motorsstore.com.br/api/indexnow"));
    expect(sem.status).toBe(401);
    const errado = await GET(
      new Request("https://motorsstore.com.br/api/indexnow", { headers: { authorization: "Bearer outro" } }),
    );
    expect(errado.status).toBe(401);
    expect(fetchEspiao).not.toHaveBeenCalled();
  });
});
