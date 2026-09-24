import { describe, it, expect } from "vitest";
import { buscarMeta, mensagemDoErroMeta } from "../src/lib/midiaMeta";

/**
 * A busca no Graph com um `fetch` falso: paginação seguida até o fim, token
 * só no cabeçalho e erro do Meta virando frase legível para o painel.
 */

const cfg = { token: "TOKEN-SECRETO-123", conta: "802008949148808", versao: "v26.0" };
const janela = { de: "2026-09-18", ate: "2026-09-24" };

function fetchFalso(rotas: (url: string) => { status?: number; corpo: unknown }) {
  const chamadas: Array<{ url: string; auth: string | null }> = [];
  const f = (async (url: string, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    chamadas.push({ url, auth: h.get("Authorization") });
    const r = rotas(url);
    return new Response(JSON.stringify(r.corpo), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { f, chamadas };
}

describe("buscarMeta", () => {
  it("segue a paginação dos insights e junta as páginas", async () => {
    const { f, chamadas } = fetchFalso((url) => {
      if (url.includes("/campaigns")) {
        return { corpo: { data: [{ id: "1", name: "C1", effective_status: "ACTIVE" }] } };
      }
      if (url.includes("level=ad") && !url.includes("pagina2")) {
        return {
          corpo: {
            data: [{ campaign_id: "1", campaign_name: "C1", ad_id: "a", ad_name: "A", date_start: "2026-09-20", spend: "1" }],
            paging: { next: "https://graph.facebook.com/v26.0/act_x/insights?pagina2" },
          },
        };
      }
      if (url.includes("pagina2")) {
        return {
          corpo: {
            data: [{ campaign_id: "1", campaign_name: "C1", ad_id: "a", ad_name: "A", date_start: "2026-09-21", spend: "2" }],
          },
        };
      }
      return { corpo: { data: [] } };
    });

    const lote = await buscarMeta(janela, cfg, f);
    const c = lote.campanhas[0];
    expect(c.dias.map((d) => d.dia).sort()).toEqual(["2026-09-20", "2026-09-21"]);
    expect(chamadas.some((c) => c.url.includes("pagina2"))).toBe(true);
  });

  it("o token vai no cabeçalho e nunca na URL", async () => {
    const { f, chamadas } = fetchFalso(() => ({ corpo: { data: [] } }));
    await buscarMeta(janela, cfg, f);
    expect(chamadas.length).toBe(3);
    for (const c of chamadas) {
      expect(c.url).not.toContain(cfg.token);
      expect(c.auth).toBe(`Bearer ${cfg.token}`);
    }
  });

  it("pede a janela exata e por dia", async () => {
    const { f, chamadas } = fetchFalso(() => ({ corpo: { data: [] } }));
    await buscarMeta(janela, cfg, f);
    const ins = decodeURIComponent(chamadas.find((c) => c.url.includes("level=ad"))!.url);
    expect(ins).toContain('"since":"2026-09-18"');
    expect(ins).toContain('"until":"2026-09-24"');
    expect(ins).toContain("time_increment=1");
  });

  it("token vencido vira frase para o dono, sem o token", async () => {
    const { f } = fetchFalso(() => ({
      status: 400,
      corpo: { error: { code: 190, message: "Error validating access token" } },
    }));
    const erro = await buscarMeta(janela, cfg, f).catch((e: Error) => e);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toMatch(/token do Meta inválido ou expirado/);
    expect((erro as Error).message).not.toContain(cfg.token);
  });
});

describe("mensagemDoErroMeta", () => {
  it("permissão negada aponta a conta", () => {
    expect(mensagemDoErroMeta({ code: 200 }, "802008949148808")).toMatch(/ads_read.*act_802008949148808/);
    expect(mensagemDoErroMeta({ code: 10 }, "1")).toMatch(/ads_read/);
  });
  it("limite de chamadas", () => {
    expect(mensagemDoErroMeta({ code: 17 }, "1")).toMatch(/limite/);
  });
});
