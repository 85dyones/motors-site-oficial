import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
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
const SITE = "https://motorsstore.com.br";

// A rota lê o sitemap e o endereço do site; aqui os dois são controlados.
const sitemapFalso = vi.fn();
vi.mock("../src/app/sitemap", () => ({ default: () => sitemapFalso() }));
vi.mock("../src/lib/site", () => ({ SITE_URL: "https://motorsstore.com.br" }));
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
      SITE,
    );
    expect(urls).toEqual(["https://motorsstore.com.br/a", "https://motorsstore.com.br/e"]);
  });

  it("carimbo no futuro distante não entra (relógio errado no banco)", () => {
    const urls = urlsParaAvisar(
      [{ url: "https://motorsstore.com.br/f", lastModified: new Date(agora.getTime() + 48 * 3_600_000) }],
      agora,
      SITE,
    );
    expect(urls).toEqual([]);
  });

  it("respeita o limite do protocolo", () => {
    const muitas = Array.from({ length: LIMITE_DE_URLS + 5 }, (_, i) => ({
      url: `https://motorsstore.com.br/x${i}`,
      lastModified: horasAtras(1),
    }));
    expect(urlsParaAvisar(muitas, agora, SITE)).toHaveLength(LIMITE_DE_URLS);
  });

  it("o carimbo global do inventário só leva home, /estoque e a ficha que mudou", () => {
    // O sitemap repete o carimbo da home em hubs, bairros e destaques. Ele anda
    // quando QUALQUER carro muda, então esses não vão; a ficha mais recente,
    // que tem o mesmo instante, vai.
    const global = horasAtras(1);
    const urls = urlsParaAvisar(
      [
        { url: SITE, lastModified: global },
        { url: `${SITE}/estoque`, lastModified: global },
        { url: `${SITE}/carros/fiat`, lastModified: global },
        { url: `${SITE}/carros/fiat/argo`, lastModified: global },
        { url: `${SITE}/seminovos-curitiba`, lastModified: global },
        { url: `${SITE}/carros/fiat/argo/drive-1-0-flex-8009174`, lastModified: global },
        { url: `${SITE}/carros/honda/fit/ex-1-5-8123456`, lastModified: horasAtras(5) },
        { url: `${SITE}/guias/quanto-vale-meu-carro-usado`, lastModified: horasAtras(3) },
      ],
      agora,
      SITE,
    );
    expect(urls).toEqual([
      SITE,
      `${SITE}/estoque`,
      `${SITE}/carros/fiat/argo/drive-1-0-flex-8009174`,
      `${SITE}/carros/honda/fit/ex-1-5-8123456`,
      `${SITE}/guias/quanto-vale-meu-carro-usado`,
    ]);
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
  const pedido = (headers: Record<string, string> = {}) =>
    new Request(`${SITE}/api/indexnow`, { headers });

  beforeEach(() => {
    sitemapFalso.mockResolvedValue([
      { url: SITE, lastModified: new Date(Date.now() - 3_600_000) },
      { url: `${SITE}/guias/velho`, lastModified: new Date(Date.now() - 72 * 3_600_000) },
    ]);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("o cron diário aponta para a rota", () => {
    const config = JSON.parse(readFileSync(join(RAIZ, "vercel.json"), "utf8"));
    expect(config.crons).toContainEqual(expect.objectContaining({ path: "/api/indexnow" }));
  });

  it("sem CRON_SECRET, recusa até o user-agent do agendador (ele se falsifica)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("VERCEL_ENV", "production");
    const fetchEspiao = vi.spyOn(globalThis, "fetch");
    const { GET } = await import("../src/app/api/indexnow/route");
    expect((await GET(pedido({ "user-agent": "vercel-cron/1.0" }))).status).toBe(401);
    expect(fetchEspiao).not.toHaveBeenCalled();
  });

  it("com CRON_SECRET, recusa credencial ausente ou errada", async () => {
    vi.stubEnv("CRON_SECRET", "segredo");
    vi.stubEnv("VERCEL_ENV", "production");
    const fetchEspiao = vi.spyOn(globalThis, "fetch");
    const { GET } = await import("../src/app/api/indexnow/route");
    expect((await GET(pedido())).status).toBe(401);
    expect((await GET(pedido({ authorization: "Bearer outro" }))).status).toBe(401);
    expect(fetchEspiao).not.toHaveBeenCalled();
  });

  it("fora de produção não avisa ninguém", async () => {
    vi.stubEnv("CRON_SECRET", "segredo");
    vi.stubEnv("VERCEL_ENV", "preview");
    const fetchEspiao = vi.spyOn(globalThis, "fetch");
    const { GET } = await import("../src/app/api/indexnow/route");
    const resposta = await GET(pedido({ authorization: "Bearer segredo" }));
    expect((await resposta.json()).avisadas).toBe(0);
    expect(fetchEspiao).not.toHaveBeenCalled();
  });

  it("em produção e autorizado, avisa só o que mudou na janela", async () => {
    vi.stubEnv("CRON_SECRET", "segredo");
    vi.stubEnv("VERCEL_ENV", "production");
    const fetchEspiao = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));
    const { GET } = await import("../src/app/api/indexnow/route");
    const resposta = await GET(pedido({ authorization: "Bearer segredo" }));
    expect(await resposta.json()).toEqual({ avisadas: 1, status: 202 });
    const [endereco, opcoes] = fetchEspiao.mock.calls[0];
    expect(String(endereco)).toBe("https://api.indexnow.org/IndexNow");
    expect(JSON.parse(String((opcoes as RequestInit).body))).toEqual({
      host: "motorsstore.com.br",
      key: CHAVE_INDEXNOW,
      keyLocation: `${SITE}/${CHAVE_INDEXNOW}.txt`,
      urlList: [SITE],
    });
  });
});
