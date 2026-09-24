import { describe, it, expect } from "vitest";
import {
  contarLeadsMeta,
  situacaoMeta,
  situacaoGoogle,
  normalizarMeta,
  validarPayloadGoogle,
  campanhaDoLead,
  janelaDeDias,
  loteParaBanco,
  somarDiario,
  estadoDaSincronizacao,
} from "../src/lib/midiaSync";

/**
 * Sincronização de mídia paga — a parte pura (spec 2026-09-24).
 *
 * Os nomes e IDs de exemplo são os da conta real "motorsstore"
 * (act_802008949148808) lidos em 24/09, para que o teste fale a língua do
 * que o Graph devolve de verdade.
 */

describe("contarLeadsMeta", () => {
  it("usa o agregado `lead` quando o Meta o manda, sem somar as partes de novo", () => {
    expect(
      contarLeadsMeta([
        { action_type: "lead", value: "3" },
        { action_type: "offsite_conversion.fb_pixel_lead", value: "3" },
        { action_type: "link_click", value: "40" },
      ]),
    ).toBe(3);
  });

  it("sem o agregado, soma pixel e formulário do Meta", () => {
    expect(
      contarLeadsMeta([
        { action_type: "offsite_conversion.fb_pixel_lead", value: "2" },
        { action_type: "onsite_conversion.lead_grouped", value: "1" },
      ]),
    ).toBe(3);
  });

  it("conversa iniciada no WhatsApp também é lead", () => {
    expect(
      contarLeadsMeta([
        { action_type: "lead", value: "1" },
        { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "4" },
      ]),
    ).toBe(5);
  });

  it("sem actions é zero", () => {
    expect(contarLeadsMeta(undefined)).toBe(0);
  });
});

describe("situação vinda da plataforma", () => {
  it("Meta", () => {
    expect(situacaoMeta("ACTIVE")).toBe("no_ar");
    expect(situacaoMeta("IN_PROCESS")).toBe("no_ar");
    expect(situacaoMeta("PAUSED")).toBe("pausada");
    expect(situacaoMeta("CAMPAIGN_PAUSED")).toBe("pausada");
    expect(situacaoMeta("ARCHIVED")).toBe("encerrada");
    expect(situacaoMeta("DELETED")).toBe("encerrada");
  });
  it("Google", () => {
    expect(situacaoGoogle("ENABLED")).toBe("no_ar");
    expect(situacaoGoogle("PAUSED")).toBe("pausada");
    expect(situacaoGoogle("REMOVED")).toBe("encerrada");
  });
});

describe("normalizarMeta", () => {
  const janela = { de: "2026-09-18", ate: "2026-09-24" };
  const lote = normalizarMeta({
    janela,
    campanhas: [
      {
        id: "120252182201900306",
        name: "01 · LEADS · PDP · Catálogo + Heróis → Lead site",
        objective: "OUTCOME_LEADS",
        effective_status: "ACTIVE",
        daily_budget: "3000",
        start_time: "2026-09-19T10:00:00-0300",
      },
    ],
    insights: [
      {
        campaign_id: "120252182201900306",
        campaign_name: "01 · LEADS · PDP · Catálogo + Heróis → Lead site",
        ad_id: "900",
        ad_name: "Heróis",
        date_start: "2026-09-20",
        spend: "10.50",
        impressions: "500",
        inline_link_clicks: "30",
        actions: [{ action_type: "lead", value: "2" }],
      },
      {
        campaign_id: "120252182201900306",
        campaign_name: "01 · LEADS · PDP · Catálogo + Heróis → Lead site",
        ad_id: "901",
        ad_name: "Catálogo",
        date_start: "2026-09-20",
        spend: "5",
        impressions: "200",
        inline_link_clicks: "4",
      },
      // Campanha arquivada que ainda gastou na janela: não vem na lista de
      // campanhas, mas o dinheiro saiu — tem que aparecer.
      {
        campaign_id: "777",
        campaign_name: "Antiga",
        ad_id: "7771",
        ad_name: "Único",
        date_start: "2026-09-18",
        spend: "1.25",
        impressions: "10",
        inline_link_clicks: "0",
      },
    ],
    alcances: [{ campaign_id: "120252182201900306", reach: "1768" }],
  });

  it("carrega a janela e a plataforma", () => {
    expect(lote.plataforma).toBe("meta");
    expect(lote.janela).toEqual(janela);
  });

  it("converte orçamento de centavos, situação e início", () => {
    const c = lote.campanhas.find((c) => c.idExterno === "120252182201900306")!;
    expect(c.orcamentoDiario).toBe(30);
    expect(c.situacao).toBe("no_ar");
    expect(c.alcanceTotal).toBe(1768);
    expect(c.noArDesde).toBe(new Date("2026-09-19T10:00:00-03:00").toISOString());
  });

  it("uma linha por anúncio por dia, com leads contados", () => {
    const c = lote.campanhas.find((c) => c.idExterno === "120252182201900306")!;
    expect(c.anuncios.map((a) => a.idExterno).sort()).toEqual(["900", "901"]);
    expect(c.dias).toContainEqual({
      anuncioIdExterno: "900",
      dia: "2026-09-20",
      investido: 10.5,
      impressoes: 500,
      cliques: 30,
      conversoes: 2,
    });
    expect(c.dias).toHaveLength(2);
  });

  it("campanha que só aparece nos insights entra como encerrada", () => {
    const antiga = lote.campanhas.find((c) => c.idExterno === "777")!;
    expect(antiga.nome).toBe("Antiga");
    expect(antiga.situacao).toBe("encerrada");
    expect(antiga.dias[0].investido).toBe(1.25);
  });
});

describe("validarPayloadGoogle", () => {
  const valido = {
    conta: "123-456-7890",
    de: "2026-09-18",
    ate: "2026-09-24",
    campanhas: [
      {
        id: "2233",
        nome: "Pesquisa · Seminovos Curitiba",
        status: "ENABLED",
        tipo: "SEARCH",
        orcamentoDiario: 40,
        dias: [
          { dia: "2026-09-20", investido: 12.34, impressoes: 300, cliques: 21, conversoes: 1.5 },
        ],
      },
    ],
  };

  it("aceita o formato do script e grava por campanha (anúncio nulo)", () => {
    const r = validarPayloadGoogle(valido);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.lote.campanhas[0];
    expect(r.lote.plataforma).toBe("google");
    expect(c.idExterno).toBe("2233");
    expect(c.situacao).toBe("no_ar");
    expect(c.objetivo).toBe("SEARCH");
    expect(c.anuncios).toEqual([]);
    expect(c.dias[0]).toEqual({
      anuncioIdExterno: null,
      dia: "2026-09-20",
      investido: 12.34,
      impressoes: 300,
      cliques: 21,
      conversoes: 1.5,
    });
  });

  it.each([
    ["sem campanhas", { ...valido, campanhas: undefined }],
    ["dia fora do formato", { ...valido, campanhas: [{ ...valido.campanhas[0], dias: [{ ...valido.campanhas[0].dias[0], dia: "20/09/2026" }] }] }],
    ["investido negativo", { ...valido, campanhas: [{ ...valido.campanhas[0], dias: [{ ...valido.campanhas[0].dias[0], investido: -1 }] }] }],
    ["nome vazio", { ...valido, campanhas: [{ ...valido.campanhas[0], nome: "  " }] }],
    ["id não numérico", { ...valido, campanhas: [{ ...valido.campanhas[0], id: "abc" }] }],
    ["janela invertida", { ...valido, de: "2026-09-25" }],
  ])("recusa: %s", (_nome, corpo) => {
    const r = validarPayloadGoogle(corpo);
    expect(r.ok).toBe(false);
  });

  it("recusa dia fora da janela declarada — senão o regravar apagaria o dia errado", () => {
    const r = validarPayloadGoogle({
      ...valido,
      campanhas: [{ ...valido.campanhas[0], dias: [{ ...valido.campanhas[0].dias[0], dia: "2026-09-01" }] }],
    });
    expect(r.ok).toBe(false);
  });
});

describe("campanhaDoLead", () => {
  const campanhas = [
    { id: "a", plataforma: "meta" as const, idExterno: "120252182201900306", nome: "01 · LEADS · PDP" },
    { id: "b", plataforma: "google" as const, idExterno: "2233", nome: "Pesquisa Seminovos" },
  ];

  it("casa pelo ID da campanha (o padrão pedido nas UTMs)", () => {
    expect(campanhaDoLead("120252182201900306", campanhas)).toBe("a");
  });
  it("casa pelo nome, sem diferenciar caixa e espaço", () => {
    expect(campanhaDoLead("  pesquisa seminovos ", campanhas)).toBe("b");
  });
  it("não casa com nada é null", () => {
    expect(campanhaDoLead("instagram-bio", campanhas)).toBeNull();
    expect(campanhaDoLead(null, campanhas)).toBeNull();
  });
});

describe("janelaDeDias", () => {
  it("conta em horário de Curitiba: 01h UTC ainda é o dia anterior lá", () => {
    const agora = new Date("2026-09-24T01:00:00Z"); // 22h de 23/09 em Curitiba
    expect(janelaDeDias(7, agora)).toEqual({ de: "2026-09-17", ate: "2026-09-23" });
  });
});

describe("somarDiario", () => {
  it("soma por anúncio e separa a linha da campanha; numeric chega como string", () => {
    const m = somarDiario([
      { campanha_id: "c", anuncio_id: "a", dia: "2026-09-20", investido: "0.10", impressoes: 10, cliques: 1, conversoes: "1" },
      { campanha_id: "c", anuncio_id: "a", dia: "2026-09-21", investido: "0.20", impressoes: 5, cliques: 0, conversoes: "0.5" },
      { campanha_id: "g", anuncio_id: null, dia: "2026-09-21", investido: 3, impressoes: 7, cliques: 2, conversoes: 0 },
    ]);
    // 0.1 + 0.2 em ponto flutuante dá 0.30000000000000004 — o painel mostraria centavo torto.
    expect(m.get("c:a")).toEqual({ investido: 0.3, impressoes: 15, alcance: 0, cliques: 1, conversas: 1.5 });
    expect(m.get("g:campanha")).toEqual({ investido: 3, impressoes: 7, alcance: 0, cliques: 2, conversas: 0 });
  });
});

describe("estadoDaSincronizacao", () => {
  const agora = new Date("2026-09-24T15:00:00Z");
  const r = (plataforma: "meta" | "google", h: number, ok: boolean, erro: string | null = null) => ({
    plataforma,
    iniciada_em: new Date(agora.getTime() - h * 36e5).toISOString(),
    ok,
    erro,
  });

  it("nunca sincronizou é parada", () => {
    expect(estadoDaSincronizacao([], "google", agora)).toEqual({ ultimaOk: null, falha: null, parada: true });
  });

  it("sucesso há 1 h, falha antiga: em dia e sem erro na tela", () => {
    const e = estadoDaSincronizacao([r("meta", 1, true), r("meta", 3, false, "x")], "meta", agora);
    expect(e.parada).toBe(false);
    expect(e.falha).toBeNull();
  });

  it("falha depois do sucesso aparece, e 7 h sem sucesso é parada", () => {
    const e = estadoDaSincronizacao([r("meta", 7, true), r("meta", 1, false, "token vencido")], "meta", agora);
    expect(e.parada).toBe(true);
    expect(e.falha?.erro).toBe("token vencido");
  });

  it("não mistura as plataformas", () => {
    const e = estadoDaSincronizacao([r("meta", 1, true)], "google", agora);
    expect(e.ultimaOk).toBeNull();
  });
});

describe("loteParaBanco", () => {
  it("vira o JSON em snake_case que a função do banco lê, sem campo indefinido", () => {
    const r = validarPayloadGoogle({
      conta: "1",
      de: "2026-09-20",
      ate: "2026-09-20",
      campanhas: [{ id: "1", nome: "X", status: "PAUSED", dias: [] }],
    });
    if (!r.ok) throw new Error(r.erro);
    const j = loteParaBanco(r.lote);
    expect(j).toEqual({
      plataforma: "google",
      de: "2026-09-20",
      ate: "2026-09-20",
      campanhas: [
        {
          id_externo: "1",
          nome: "X",
          objetivo: null,
          situacao: "pausada",
          orcamento_diario: null,
          no_ar_desde: null,
          alcance_total: null,
          anuncios: [],
          dias: [],
        },
      ],
    });
  });
});
