import { describe, it, expect } from "vitest";
import { buscarMeta, mensagemDoErroMeta } from "../src/lib/midiaMeta";
import { normalizarMeta } from "../src/lib/midiaSync";

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
    expect(chamadas.length).toBe(4);
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

describe("buscarMeta — o conjunto e a situação de cada anúncio (Copiloto do Meta)", () => {
  it("pede /ads com o conjunto e pendura conjunto e situação no anúncio", async () => {
    const { f, chamadas } = fetchFalso((url) => {
      if (url.includes("/campaigns")) {
        return { corpo: { data: [{ id: "1", name: "C1", effective_status: "ACTIVE", daily_budget: "10000" }] } };
      }
      if (url.includes("/ads?")) {
        return {
          corpo: {
            data: [
              // Gastou na janela: o mesmo anúncio dos insights ganha conjunto e situação.
              { id: "a", name: "A", campaign_id: "1", adset_id: "s1", effective_status: "ACTIVE", adset: { name: "Broad", effective_status: "ACTIVE" } },
              // Sem gasto na janela, pausado pelo conjunto: entra mesmo assim.
              { id: "b", name: "B", campaign_id: "1", adset_id: "s2", effective_status: "ADSET_PAUSED", adset: { name: "Heróis", effective_status: "PAUSED" } },
              // De campanha que não está na lista e não gastou: não há onde pendurar.
              { id: "z", name: "Z", campaign_id: "999", adset_id: "s9", effective_status: "ACTIVE" },
            ],
          },
        };
      }
      if (url.includes("level=ad")) {
        return { corpo: { data: [{ campaign_id: "1", campaign_name: "C1", ad_id: "a", ad_name: "A", date_start: "2026-09-20", spend: "1" }] } };
      }
      return { corpo: { data: [] } };
    });

    const lote = await buscarMeta(janela, cfg, f);
    const ads = chamadas.find((c) => c.url.includes("/ads?"));
    expect(ads).toBeDefined();
    const params = new URL(ads!.url).searchParams;
    expect(params.get("fields")).toBe("id,name,campaign_id,adset_id,effective_status,adset{name,effective_status}");
    expect(JSON.parse(params.get("effective_status") ?? "[]")).toEqual(
      expect.arrayContaining(["ACTIVE", "PAUSED", "ADSET_PAUSED", "CAMPAIGN_PAUSED"]),
    );

    expect(lote.campanhas).toHaveLength(1);
    const anuncios = lote.campanhas[0].anuncios;
    expect(anuncios).toEqual([
      { idExterno: "a", nome: "A", conjuntoIdExterno: "s1", conjuntoNome: "Broad", situacao: "no_ar", conjuntoSituacao: "no_ar" },
      { idExterno: "b", nome: "B", conjuntoIdExterno: "s2", conjuntoNome: "Heróis", situacao: "pausada", conjuntoSituacao: "pausada" },
    ]);
  });

  it("o anúncio que gastou e não veio na lista /ads foi arquivado: vai como encerrado", () => {
    const lote = normalizarMeta({
      janela,
      campanhas: [{ id: "1", name: "C1", effective_status: "ACTIVE" }],
      insights: [
        { campaign_id: "1", campaign_name: "C1", ad_id: "a", ad_name: "A", date_start: "2026-09-20", spend: "1" },
        { campaign_id: "1", campaign_name: "C1", ad_id: "velho", ad_name: "Velho", date_start: "2026-09-20", spend: "1" },
      ],
      alcances: [],
      anuncios: [{ id: "a", name: "A", campaign_id: "1", adset_id: "s1", effective_status: "ACTIVE" }],
    });
    expect(lote.campanhas[0].anuncios.find((a) => a.idExterno === "velho")).toEqual({ idExterno: "velho", nome: "Velho", situacao: "encerrada" });
    expect(lote.campanhas[0].anuncios.find((a) => a.idExterno === "a")?.situacao).toBe("no_ar");
  });

  it("sem a lista /ads (a chamada antiga), a situação não é inventada", () => {
    const lote = normalizarMeta({
      janela,
      campanhas: [{ id: "1", name: "C1", effective_status: "ACTIVE" }],
      insights: [{ campaign_id: "1", campaign_name: "C1", ad_id: "a", ad_name: "A", date_start: "2026-09-20", spend: "1" }],
      alcances: [],
    });
    expect(lote.campanhas[0].anuncios).toEqual([{ idExterno: "a", nome: "A" }]);
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
