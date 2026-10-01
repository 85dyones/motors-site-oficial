import { describe, it, expect, vi, afterEach } from "vitest";
import { baixarDoCarro57, TEMPO_POR_FOTO_MS } from "../src/lib/baixarDoCarro57";
import { urlDaLojaNoCarro57 } from "../src/lib/estoqueParaORepasse";

/**
 * O download de uma foto do carro57 da loja, sozinho (dono, 01/10: o repasse
 * a partir do estoque também traz as fotos que moram no RevendaMais).
 *
 * O ponto crítico é o pedido que o SERVIDOR faz: a URL vem do banco, e o
 * banco recebe o feed. A trava é a mesma do `remotePatterns` de
 * `next.config.ts` — https, `s3.carro57.com.br` exato, pasta `/FC/9037/` — e
 * vale também para quem chamar o download direto, sem passar pelo plano.
 * Os cenários de rota (3xx, tamanho, tipo, par) estão em
 * `tests/repasse-a-partir-do-estoque.test.ts`.
 */
const DA_LOJA = "https://s3.carro57.com.br/FC/9037/8152210_0_O_6943a8e1c8.jpeg";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** O fetch que só termina quando o sinal do pedido aborta. */
function fetchPendurado() {
  return vi.fn(
    (_entrada: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, rejeitar) => {
        init?.signal?.addEventListener("abort", () => rejeitar(new DOMException("This operation was aborted", "AbortError")));
      }),
  );
}

describe("o endereço que o servidor pode pedir", () => {
  it("https, s3.carro57.com.br exato e a pasta da loja — e o que se pede é a forma normalizada", () => {
    expect(urlDaLojaNoCarro57(DA_LOJA)).toBe(DA_LOJA);
    expect(urlDaLojaNoCarro57(`  ${DA_LOJA}  `)).toBe(DA_LOJA);
    // Porta padrão e caixa do host não mudam o destino; o `new URL` as normaliza.
    expect(urlDaLojaNoCarro57("https://S3.Carro57.com.br:443/FC/9037/x.jpeg")).toBe("https://s3.carro57.com.br/FC/9037/x.jpeg");
  });

  it.each([
    "https://exemplo.test/FC/9037/x.jpeg",
    "http://s3.carro57.com.br/FC/9037/x.jpeg",
    "https://s3.carro57.com.br./FC/9037/x.jpeg",
    "https://s3.carro57.com.br.exemplo.test/FC/9037/x.jpeg",
    "https://xs3.carro57.com.br/FC/9037/x.jpeg",
    "https://s3.carro57.com.br@exemplo.test/FC/9037/x.jpeg",
    "https://usuario@s3.carro57.com.br/FC/9037/x.jpeg",
    "https://usuario:senha@s3.carro57.com.br/FC/9037/x.jpeg",
    "https://s3.carro57.com.br:8443/FC/9037/x.jpeg",
    "https://169.254.169.254/FC/9037/x.jpeg",
    "https://[::1]/FC/9037/x.jpeg",
    "https://s3.carro57.com.br/FC/1234/x.jpeg",
    "https://s3.carro57.com.br/FC/90370/x.jpeg",
    "https://s3.carro57.com.br/FC/9037",
    "https://s3.carro57.com.br/FC/9037/../1234/x.jpeg",
    "https://s3.carro57.com.br/FC/9037/%2E%2E/1234/x.jpeg",
    "https://s3.carro57.com.br/FC/9037/..%2f1234/x.jpeg",
    "https://s3.carro57.com.br/FC/9037/..%5c1234/x.jpeg",
    "https://s3.carro57.com.br/fc/9037/x.jpeg",
    "data:image/jpeg;base64,AAAA",
    "file:///FC/9037/x.jpeg",
    "/FC/9037/x.jpeg",
    "",
  ])("recusa %s", (url) => {
    expect(urlDaLojaNoCarro57(url)).toBeNull();
  });
});

describe("baixarDoCarro57", () => {
  it("endereço fora da pasta da loja: recusa sem pedir, mesmo chamado direto", async () => {
    const fetchFalso = vi.fn(async () => new Response(new Uint8Array([1]), { headers: { "content-type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetchFalso);
    for (const url of ["https://exemplo.test/FC/9037/x.jpeg", "https://s3.carro57.com.br/FC/1234/x.jpeg"]) {
      expect(await baixarDoCarro57(url)).toMatchObject({ ok: false });
    }
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("devolve os bytes como vieram e o tipo da resposta; pede sem seguir redirecionamento e sem cache", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 7]);
    const fetchFalso = vi.fn<(entrada: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(bytes, { headers: { "content-type": "image/jpeg" } }),
    );
    vi.stubGlobal("fetch", fetchFalso);
    const r = await baixarDoCarro57(DA_LOJA);
    expect(r).toEqual({ ok: true, bytes, tipo: "image/jpeg" });
    const [url, init] = fetchFalso.mock.calls[0];
    expect(url).toBe(DA_LOJA);
    expect(init).toMatchObject({ redirect: "manual", cache: "no-store" });
  });

  it("corpo vazio é falha", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(0), { headers: { "content-type": "image/jpeg" } })));
    expect(await baixarDoCarro57(DA_LOJA)).toMatchObject({ ok: false, erro: expect.stringContaining("vazio") });
  });

  it(`desiste em ${TEMPO_POR_FOTO_MS / 1000} s`, async () => {
    expect(TEMPO_POR_FOTO_MS).toBe(15_000);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("fetch", fetchPendurado());
    let fim: Awaited<ReturnType<typeof baixarDoCarro57>> | undefined;
    const pendente = baixarDoCarro57(DA_LOJA).then((r) => (fim = r));
    await vi.advanceTimersByTimeAsync(14_900);
    expect(fim).toBeUndefined();
    await vi.advanceTimersByTimeAsync(200);
    await pendente;
    expect(fim).toMatchObject({ ok: false, erro: expect.stringContaining("tempo") });
  });

  it("prazo total já esgotado: nem pede", async () => {
    const fetchFalso = fetchPendurado();
    vi.stubGlobal("fetch", fetchFalso);
    expect(await baixarDoCarro57(DA_LOJA, { prazo: AbortSignal.abort() })).toMatchObject({
      ok: false,
      erro: expect.stringContaining("prazo"),
    });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("o prazo total que esgota no meio derruba o pedido em voo", async () => {
    vi.stubGlobal("fetch", fetchPendurado());
    const prazo = new AbortController();
    const pendente = baixarDoCarro57(DA_LOJA, { prazo: prazo.signal });
    await new Promise((resolver) => setTimeout(resolver, 5));
    prazo.abort();
    expect(await pendente).toMatchObject({ ok: false, erro: expect.stringContaining("prazo") });
  });
});
