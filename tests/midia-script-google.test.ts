import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { validarPayloadGoogle } from "../src/lib/midiaSync";
import { validarDiagnostico, validarResultados, type AcaoParaOScript } from "../src/lib/copilotoDeMidia";

/**
 * O script que o dono cola na conta do Google Ads roda FORA deste repositório,
 * e o contrato entre ele e as rotas só quebra em produção, uma vez por hora, em
 * silêncio. Aqui o script roda de verdade — num `vm` com `AdsApp` falso — e o
 * JSON que ele mandaria passa pelos MESMOS validadores das rotas: o da
 * sincronização, o do diagnóstico do copiloto e o dos resultados.
 */

const FONTE = readFileSync(join(__dirname, "..", "scripts", "google-ads-script.js"), "utf8");

interface OpcoesFetch {
  headers: Record<string, string>;
  payload: string;
}

interface Corpo {
  campanhas: Array<{ id: string; orcamentoDiario: number | null; dias: Array<{ investido: number }> }>;
}

interface Negativa {
  texto: string;
  tipo: "EXACT" | "PHRASE";
  removida: boolean;
}

interface Cenario {
  segredo?: string;
  previa?: boolean;
  /** A resposta de /copiloto/acoes. */
  acoes?: AcaoParaOScript[];
  diagnosticoDevido?: boolean;
  statusDoCopiloto?: number;
  /** Consultas (por trecho) que o Google recusa. */
  recusar?: string[];
  negativas?: Negativa[];
  verba?: { valor: number; compartilhada: boolean };
  grupo?: { campanha: string; situacao: "ENABLED" | "PAUSED" };
}

/**
 * O que a conta de verdade recusou na prévia do Google Ads Scripts (16/10/2026).
 * O falso recusa igual, para o script não voltar a pedir o que o Google não aceita.
 */
function recusaDoGoogle(q: string): string | null {
  if (q.includes("FROM ad_group_ad_asset_view") && q.includes("ad_group_ad_asset_view.policy_summary.")) {
    return "QueryError.UNRECOGNIZED_FIELD: nesta visão, policy_summary só sai inteiro";
  }
  const select = q.slice(0, q.indexOf(" FROM "));
  if (q.includes("FROM campaign_asset") && q.includes("campaign.status") && !select.includes("campaign.status")) {
    return "QueryError.EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE: 'campaign.status'";
  }
  return null;
}

const iterador = (linhas: unknown[]) => {
  let i = 0;
  return { hasNext: () => i < linhas.length, next: () => linhas[i++] };
};

function rodarScript(c: Cenario = {}) {
  const enviados: Array<{ url: string; opcoes: OpcoesFetch; corpo: Record<string, unknown> }> = [];
  const mudancas: string[] = [];
  const negativas: Negativa[] = c.negativas ?? [];
  const verba = c.verba ?? { valor: 50, compartilhada: false };
  const grupo = c.grupo ?? { campanha: "2233", situacao: "ENABLED" as const };
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  const campanha = {
    getId: () => 2233,
    createNegativeKeyword: (t: string) => {
      mudancas.push(`criar ${t}`);
      negativas.push({ texto: t, tipo: t.startsWith("[") ? "EXACT" : "PHRASE", removida: false });
    },
    negativeKeywords: () => ({
      get: () =>
        iterador(
          negativas
            .filter((n) => !n.removida)
            .map((n) => ({
              getText: () => n.texto,
              getMatchType: () => n.tipo,
              remove: () => {
                mudancas.push(`remover ${n.texto}`);
                n.removida = true;
              },
            })),
        ),
    }),
    getBudget: () => ({
      getAmount: () => verba.valor,
      setAmount: (v: number) => {
        mudancas.push(`verba ${v}`);
        verba.valor = v;
      },
      isExplicitlyShared: () => verba.compartilhada,
    }),
  };
  const adGroup = {
    getCampaign: () => ({ getId: () => Number(grupo.campanha) }),
    isEnabled: () => grupo.situacao === "ENABLED",
    isPaused: () => grupo.situacao === "PAUSED",
    pause: () => {
      mudancas.push("pausar grupo");
      grupo.situacao = "PAUSED";
    },
    enable: () => {
      mudancas.push("reativar grupo");
      grupo.situacao = "ENABLED";
    },
  };
  const seletor = (achado: unknown | null) => ({ withIds: (ids: number[]) => ({ get: () => iterador(achado && ids[0] ? [achado] : []) }) });

  const resposta = (url: string): { status: number; texto: string } => {
    if (url.endsWith("/sincronizar/google")) return { status: 200, texto: "{}" };
    if (c.statusDoCopiloto && c.statusDoCopiloto !== 200) return { status: c.statusDoCopiloto, texto: '{"error":"aplique a migração"}' };
    if (url.endsWith("/copiloto/acoes")) {
      return { status: 200, texto: JSON.stringify({ diagnosticoDevido: c.diagnosticoDevido ?? false, acoes: c.acoes ?? [] }) };
    }
    return { status: 200, texto: '{"ok":true}' };
  };

  const consultas: Array<[string, () => unknown[]]> = [
    ["campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'", () => [
      { campaign: { id: "2233", name: "Pesquisa · Seminovos", status: "ENABLED", advertisingChannelType: "SEARCH" }, campaignBudget: { amountMicros: "40000000" } },
      { campaign: { id: "4455", name: "Sem gasto", status: "PAUSED", advertisingChannelType: "SEARCH" }, campaignBudget: { amountMicros: "10000000" } },
    ]],
    ["metrics.conversions FROM campaign WHERE segments.date BETWEEN", () => [
      { campaign: { id: "2233", name: "Pesquisa · Seminovos", status: "ENABLED" }, segments: { date: hoje }, metrics: { costMicros: "12345678", impressions: "300", clicks: "21", conversions: 1.5 } },
      { campaign: { id: "9999", name: "Removida", status: "REMOVED" }, segments: { date: hoje }, metrics: { costMicros: "1000000", impressions: "5", clicks: "0", conversions: 0 } },
    ]],
    ["FROM customer", () => [{ customer: { currencyCode: "BRL", autoTaggingEnabled: true } }]],
    ["FROM search_term_view", () => [
      { searchTermView: { searchTerm: "loja rival seminovos", status: "NONE" }, campaign: { id: "2233", name: "Pesquisa" }, adGroup: { id: "77", name: "Seminovos" }, metrics: { costMicros: "40000000", clicks: "12", impressions: "90", conversions: 0 } },
    ]],
    ["FROM keyword_view", () => [
      { adGroupCriterion: { criterionId: "501", keyword: { text: "carros usados", matchType: "BROAD" }, qualityInfo: { qualityScore: 3, creativeQualityScore: "BELOW_AVERAGE", postClickQualityScore: "AVERAGE", searchPredictedCtr: "AVERAGE" } }, campaign: { id: "2233", name: "Pesquisa" }, adGroup: { id: "77", name: "Seminovos" }, metrics: { costMicros: "90000000", clicks: "30", conversions: 0 } },
    ]],
    ["FROM ad_group_ad_asset_view", () => [
      { asset: { id: "61", type: "TEXT", textAsset: { text: "Seminovos revisados" } }, adGroupAdAssetView: { fieldType: "HEADLINE", policySummary: { approvalStatus: "APPROVED", reviewStatus: "REVIEWED", policyTopicEntries: [] } }, campaign: { id: "2233", name: "Pesquisa" }, adGroup: { id: "77", name: "Seminovos" } },
      { asset: { id: "62", type: "TEXT", textAsset: { text: "Financie em 60x" } }, adGroupAdAssetView: { fieldType: "DESCRIPTION", policySummary: { approvalStatus: "APPROVED_LIMITED", reviewStatus: "REVIEWED", policyTopicEntries: [{ topic: "FINANCIAL_SERVICES", type: "LIMITED" }] } }, campaign: { id: "2233", name: "Pesquisa" }, adGroup: { id: "77", name: "Seminovos" } },
    ]],
    ["FROM ad_group_ad ", () => [
      { adGroupAd: { ad: { id: "9" }, policySummary: { approvalStatus: "DISAPPROVED", reviewStatus: "REVIEWED", policyTopicEntries: [{ topic: "DESTINATION_NOT_WORKING", type: "PROHIBITED" }] } }, campaign: { id: "2233", name: "Pesquisa" }, adGroup: { id: "77", name: "Seminovos" } },
    ]],
    ["FROM campaign_asset", () => [
      { asset: { id: "71", type: "SITELINK", name: "Estoque" }, campaignAsset: { fieldType: "SITELINK", primaryStatus: "NOT_ELIGIBLE", primaryStatusReasons: ["ASSET_DISAPPROVED"] }, campaign: { id: "2233", name: "Pesquisa", status: "ENABLED" } },
    ]],
    ["FROM conversion_action", () => [
      { conversionAction: { id: "31", name: "Lead do site", status: "ENABLED", type: "WEBPAGE", category: "SUBMIT_LEAD_FORM", primaryForGoal: true } },
    ]],
    ["segments.conversion_action", () => [
      { segments: { conversionAction: "customers/1234567890/conversionActions/31", date: "2026-09-30" }, metrics: { allConversions: 2 } },
    ]],
    ["campaign_budget.explicitly_shared", () => [
      { campaign: { id: "2233", name: "Pesquisa", status: "ENABLED", advertisingChannelType: "SEARCH", primaryStatusReasons: [] }, campaignBudget: { amountMicros: "50000000", explicitlyShared: false } },
    ]],
    ["search_budget_lost_impression_share", () => [{ campaign: { id: "2233" }, metrics: { searchBudgetLostImpressionShare: 0.25, searchRankLostImpressionShare: 0.1 } }]],
    ["DURING THIS_MONTH", () => [{ campaign: { id: "2233" }, metrics: { costMicros: "600000000" } }]],
    ["metrics.conversions FROM campaign WHERE campaign.status = 'ENABLED' AND segments.date", () => [
      { campaign: { id: "2233" }, metrics: { costMicros: "340000000", clicks: "110", impressions: "2000", conversions: 0 } },
    ]],
    ["FROM ad_group WHERE ad_group.status = 'ENABLED' AND campaign.status = 'ENABLED' AND campaign.advertising_channel_type", () => [
      { adGroup: { id: "77", name: "Seminovos" }, campaign: { id: "2233", name: "Pesquisa" } },
    ]],
    ["metrics.conversions FROM ad_group", () => [{ adGroup: { id: "77" }, metrics: { costMicros: "280000000", clicks: "90", conversions: 0 } }]],
  ];

  const contexto: vm.Context = {
    AdsApp: {
      currentAccount: () => ({ getTimeZone: () => "America/Sao_Paulo", getCustomerId: () => "123-456-7890" }),
      getExecutionInfo: () => ({ isPreview: () => c.previa === true }),
      search: (q: string) => {
        if ((c.recusar ?? []).some((t) => q.includes(t))) throw new Error(`consulta recusada: ${q.slice(0, 40)}`);
        const recusa = recusaDoGoogle(q);
        if (recusa) throw new Error(recusa);
        const achada = consultas.find(([trecho]) => q.includes(trecho));
        if (!achada) throw new Error(`consulta sem resposta no falso: ${q}`);
        return iterador(achada[1]());
      },
      campaigns: () => seletor(campanha),
      performanceMaxCampaigns: () => seletor(null),
      shoppingCampaigns: () => seletor(null),
      adGroups: () => seletor(adGroup),
    },
    Utilities: {
      // Honra o PADRÃO pedido, como o de verdade: um falso que devolvesse
      // sempre YYYY-MM-DD deixaria passar o script pedindo "dd/MM/yyyy".
      formatDate: (d: Date, fuso: string, padrao: string) => {
        const [y, m, dd] = d.toLocaleDateString("en-CA", { timeZone: fuso }).split("-");
        return padrao.replace("yyyy", y).replace("MM", m).replace("dd", dd);
      },
    },
    UrlFetchApp: {
      fetch: (url: string, opcoes: OpcoesFetch) => {
        enviados.push({ url, opcoes, corpo: JSON.parse(opcoes.payload) });
        const r = resposta(url);
        return { getResponseCode: () => r.status, getContentText: () => r.texto };
      },
    },
    Logger: { log: () => {} },
  };
  vm.createContext(contexto);
  vm.runInContext(FONTE.replace('"COLE_AQUI_O_SEGREDO";', `"${c.segredo ?? "s".repeat(64)}";`), contexto);
  let erro: Error | null = null;
  try {
    vm.runInContext("main()", contexto);
  } catch (e) {
    erro = e as Error;
  }
  const para = (fim: string) => enviados.filter((e) => e.url.endsWith(fim));
  return { enviados, mudancas, para, erro, negativas, verba, grupo };
}

const ACAO = "0c7f3b8e-1d2a-4f5b-9c6d-7e8f9a0b1c2d";
const acao = (a: Partial<AcaoParaOScript>): AcaoParaOScript => ({
  id: ACAO,
  tipo: "negativar",
  campanhaId: "2233",
  grupoId: null,
  texto: "como vender carro",
  correspondencia: "exata",
  verbaAtual: null,
  verbaNova: null,
  ...a,
});
const resultadoDe = (r: ReturnType<typeof rodarScript>) => {
  const [envio] = r.para("/copiloto/acoes/resultado");
  const v = validarResultados(envio.corpo);
  expect(v.ok, v.ok ? "" : v.erro).toBe(true);
  return v.ok ? v.valor[0] : null;
};

describe("scripts/google-ads-script.js — sincronização", () => {
  it("o JSON que ele manda passa no validador da rota", () => {
    const { enviados, erro } = rodarScript();
    expect(erro).toBeNull();
    const r = validarPayloadGoogle(enviados[0].corpo);
    expect(r.ok, r.ok ? "" : r.erro).toBe(true);
  });

  it("converte micros em reais e manda o segredo no cabeçalho certo", () => {
    const [envio] = rodarScript({ segredo: "x".repeat(64) }).enviados;
    expect(envio.url).toBe("https://motorsstore.com.br/api/marketing/sincronizar/google");
    expect(envio.opcoes.headers["X-Motors-Segredo"]).toBe("x".repeat(64));
    const pesquisa = (envio.corpo as unknown as Corpo).campanhas.find((c) => c.id === "2233")!;
    expect(pesquisa.orcamentoDiario).toBe(40);
    expect(pesquisa.dias[0].investido).toBe(12.35);
  });

  it("inclui a campanha pausada sem gasto e a removida que gastou", () => {
    const [envio] = rodarScript().enviados;
    const ids = (envio.corpo as unknown as Corpo).campanhas.map((c) => c.id).sort();
    expect(ids).toEqual(["2233", "4455", "9999"]);
  });

  it("recusa rodar com o segredo de exemplo", () => {
    expect(rodarScript({ segredo: "COLE_AQUI_O_SEGREDO" }).erro?.message).toMatch(/Troque/);
  });
});

describe("scripts/google-ads-script.js — Copiloto de Mídia", () => {
  it("depois de sincronizar, pergunta o que fazer com o fuso da conta e o mesmo segredo", () => {
    const { enviados } = rodarScript();
    expect(enviados.map((e) => e.url.replace("https://motorsstore.com.br/api/marketing", ""))).toEqual(["/sincronizar/google", "/copiloto/acoes"]);
    expect(enviados[1].corpo).toEqual({ previa: false, fuso: "America/Sao_Paulo" });
    expect(enviados[1].opcoes.headers["X-Motors-Segredo"]).toBe("s".repeat(64));
  });

  it("diagnóstico devido: manda o retrato dos 7 dias fechados, e ele passa no validador da rota", () => {
    const r = rodarScript({ diagnosticoDevido: true });
    const [envio] = r.para("/copiloto/diagnostico");
    const v = validarDiagnostico(envio.corpo);
    expect(v.ok, v.ok ? "" : v.erro).toBe(true);
    if (!v.ok) return;
    const ontem = new Date(Date.now() - 864e5).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    expect(v.valor.janela.ate).toBe(ontem);
    expect((Date.parse(v.valor.janela.ate) - Date.parse(v.valor.janela.de)) / 864e5).toBe(6);
    expect(v.valor.conta).toEqual({ id: "123-456-7890", moeda: "BRL", fuso: "America/Sao_Paulo", autoTagging: true });
    expect(v.valor.termos[0]).toMatchObject({ termo: "loja rival seminovos", custo: 40, campanhaId: "2233" });
    expect(v.valor.palavras[0]).toMatchObject({ iq: 3, iqAnuncio: "BELOW_AVERAGE" });
    expect(v.valor.anuncios[0]).toMatchObject({ aprovacao: "DISAPPROVED", motivos: ["DESTINATION_NOT_WORKING"] });
    // O recurso aprovado fica no script: só vai o que tem problema.
    expect(v.valor.recursos.map((r) => [r.id, r.situacao, r.motivos])).toEqual([
      ["62", "APPROVED_LIMITED", ["FINANCIAL_SERVICES"]],
      ["71", "NOT_ELIGIBLE", ["ASSET_DISAPPROVED"]],
    ]);
    expect(v.valor.conversoes[0]).toMatchObject({ primaria: true, ultimos30: 2, ultimoDia: "2026-09-30" });
    expect(v.valor.campanhas[0]).toMatchObject({ verba: 50, custo7: 340, cliques7: 110, custoMes: 600, perdaPorVerba: 0.25 });
    expect(v.valor.grupos[0]).toMatchObject({ id: "77", custo7: 280 });
    expect(v.valor.erros).toEqual({});
  });

  it("sem diagnóstico devido, não lê a conta", () => {
    expect(rodarScript({ diagnosticoDevido: false }).para("/copiloto/diagnostico")).toEqual([]);
  });

  it("seção que o Google recusa vai vazia e com a mensagem; o resto segue", () => {
    const r = rodarScript({ diagnosticoDevido: true, recusar: ["FROM search_term_view"] });
    const v = validarDiagnostico(r.para("/copiloto/diagnostico")[0].corpo);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.valor.termos).toEqual([]);
    expect(v.valor.erros.termos).toMatch(/recusada/);
    expect(v.valor.campanhas).toHaveLength(1);
  });

  it("negativar: cria a negativa exata, lê de volta e devolve 'aplicada'", () => {
    const r = rodarScript({ acoes: [acao({})] });
    expect(r.mudancas).toEqual(["criar [como vender carro]"]);
    expect(resultadoDe(r)).toMatchObject({ id: ACAO, situacao: "aplicada", lido: { negativa: true, correspondencia: "EXACT" } });
  });

  it("negativa que já existe: não cria de novo ('sem_efeito')", () => {
    const r = rodarScript({ acoes: [acao({ correspondencia: "frase", texto: "loja rival" })], negativas: [{ texto: '"Loja Rival"', tipo: "PHRASE", removida: false }] });
    expect(r.mudancas).toEqual([]);
    expect(resultadoDe(r)?.situacao).toBe("sem_efeito");
  });

  it("remover negativa: remove só a negativa daquele texto e correspondência", () => {
    const r = rodarScript({
      acoes: [acao({ tipo: "remover_negativa" })],
      negativas: [
        { texto: '"como vender carro"', tipo: "PHRASE", removida: false },
        { texto: "[como vender carro]", tipo: "EXACT", removida: false },
      ],
    });
    expect(r.mudancas).toEqual(["remover [como vender carro]"]);
    expect(r.negativas.map((n) => n.removida)).toEqual([false, true]);
    expect(resultadoDe(r)?.situacao).toBe("aplicada");
  });

  it("mudar verba: aplica e lê de volta", () => {
    const r = rodarScript({ acoes: [acao({ tipo: "mudar_verba", texto: null, correspondencia: null, verbaAtual: 50, verbaNova: 35 })] });
    expect(r.mudancas).toEqual(["verba 35"]);
    expect(resultadoDe(r)).toMatchObject({ situacao: "aplicada", lido: { verba: 35 } });
  });

  it("mudar verba: o aumento pedido no painel aplica e lê de volta, sem script novo", () => {
    const r = rodarScript({ acoes: [acao({ tipo: "mudar_verba", texto: null, correspondencia: null, verbaAtual: 50, verbaNova: 100 })] });
    expect(r.mudancas).toEqual(["verba 100"]);
    expect(resultadoDe(r)).toMatchObject({ situacao: "aplicada", lido: { verba: 100 } });
  });

  it("mudar verba: acima de 10× a verba de agora, falha sem mexer (o mesmo teto do pedido)", () => {
    const r = rodarScript({ acoes: [acao({ tipo: "mudar_verba", texto: null, correspondencia: null, verbaAtual: 50, verbaNova: 500.01 })] });
    expect(r.mudancas).toEqual([]);
    expect(resultadoDe(r)?.erro).toMatch(/fora da faixa/);
  });

  it("mudar verba: se alguém mudou a verba depois da proposta, não mexe", () => {
    const r = rodarScript({
      acoes: [acao({ tipo: "mudar_verba", texto: null, correspondencia: null, verbaAtual: 50, verbaNova: 35 })],
      verba: { valor: 80, compartilhada: false },
    });
    expect(r.mudancas).toEqual([]);
    expect(resultadoDe(r)).toMatchObject({ situacao: "falhou" });
    expect(resultadoDe(r)?.erro).toMatch(/mudou desde a proposta/);
  });

  it("mudar verba: verba compartilhada não é mexida", () => {
    const r = rodarScript({
      acoes: [acao({ tipo: "mudar_verba", texto: null, correspondencia: null, verbaAtual: 50, verbaNova: 35 })],
      verba: { valor: 50, compartilhada: true },
    });
    expect(r.mudancas).toEqual([]);
    expect(resultadoDe(r)?.erro).toMatch(/compartilhada/);
  });

  it("pausar grupo: pausa e confere; grupo de outra campanha falha sem mexer", () => {
    const pausar = acao({ tipo: "pausar_grupo", grupoId: "77", texto: null, correspondencia: null });
    const r = rodarScript({ acoes: [pausar] });
    expect(r.mudancas).toEqual(["pausar grupo"]);
    expect(resultadoDe(r)).toMatchObject({ situacao: "aplicada", lido: { situacao: "PAUSED" } });
    const outro = rodarScript({ acoes: [pausar], grupo: { campanha: "9999", situacao: "ENABLED" } });
    expect(outro.mudancas).toEqual([]);
    expect(resultadoDe(outro)?.situacao).toBe("falhou");
  });

  it("tipo que o script não conhece: falha, sem tocar a conta", () => {
    const r = rodarScript({ acoes: [acao({ tipo: "excluir_campanha" as never })] });
    expect(r.mudancas).toEqual([]);
    expect(resultadoDe(r)?.erro).toMatch(/não conhece/);
  });

  it("prévia: não muda a conta nem devolve resultado, mas manda o diagnóstico", () => {
    const r = rodarScript({ previa: true, acoes: [acao({})], diagnosticoDevido: false });
    expect(r.para("/copiloto/acoes")[0].corpo).toEqual({ previa: true, fuso: "America/Sao_Paulo" });
    expect(r.mudancas).toEqual([]);
    expect(r.para("/copiloto/acoes/resultado")).toEqual([]);
    const v = validarDiagnostico(r.para("/copiloto/diagnostico")[0].corpo);
    expect(v.ok && v.valor.previa).toBe(true);
  });

  it("copiloto recusado (migração não aplicada): a sincronização já foi, e a rodada termina com erro", () => {
    const r = rodarScript({ statusDoCopiloto: 503 });
    expect(r.para("/sincronizar/google")).toHaveLength(1);
    expect(r.erro?.message).toMatch(/A sincronização foi, mas o Copiloto de Mídia falhou: .*503/);
  });

  it("a única remoção do script é a de negativa", () => {
    const remocoes = FONTE.match(/\.remove\(\)/g) ?? [];
    expect(remocoes).toHaveLength(1);
    expect(FONTE).toMatch(/negativa\.remove\(\)/);
    expect(FONTE).not.toMatch(/\.(removeKeyword|removeAd|removeCampaign)\b/);
  });
});
