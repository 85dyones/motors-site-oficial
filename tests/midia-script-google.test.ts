import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { validarPayloadGoogle } from "../src/lib/midiaSync";

/**
 * O script que o dono cola na conta do Google Ads roda FORA deste repositório,
 * e o contrato entre ele e a rota só quebra em produção, uma vez por hora, em
 * silêncio. Aqui o script roda de verdade — num `vm` com `AdsApp` falso — e o
 * JSON que ele mandaria passa pelo MESMO validador da rota.
 */

const FONTE = readFileSync(join(__dirname, "..", "scripts", "google-ads-script.js"), "utf8");

interface OpcoesFetch {
  headers: Record<string, string>;
  payload: string;
}

interface Corpo {
  campanhas: Array<{ id: string; orcamentoDiario: number | null; dias: Array<{ investido: number }> }>;
}

function rodarScript(segredo = "s".repeat(64)) {
  const enviados: Array<{ url: string; opcoes: OpcoesFetch }> = [];
  const iterador = (linhas: unknown[]) => {
    let i = 0;
    return { hasNext: () => i < linhas.length, next: () => linhas[i++] };
  };
  const contexto: vm.Context & { __hoje?: string } = {
    AdsApp: {
      currentAccount: () => ({ getTimeZone: () => "America/Sao_Paulo", getCustomerId: () => "123-456-7890" }),
      search: (q: string) =>
        q.includes("segments.date")
          ? iterador([
              {
                campaign: { id: "2233", name: "Pesquisa · Seminovos", status: "ENABLED" },
                segments: { date: contexto.__hoje },
                metrics: { costMicros: "12345678", impressions: "300", clicks: "21", conversions: 1.5 },
              },
              {
                campaign: { id: "9999", name: "Removida", status: "REMOVED" },
                segments: { date: contexto.__hoje },
                metrics: { costMicros: "1000000", impressions: "5", clicks: "0", conversions: 0 },
              },
            ])
          : iterador([
              {
                campaign: { id: "2233", name: "Pesquisa · Seminovos", status: "ENABLED", advertisingChannelType: "SEARCH" },
                campaignBudget: { amountMicros: "40000000" },
              },
              {
                campaign: { id: "4455", name: "Sem gasto", status: "PAUSED", advertisingChannelType: "SEARCH" },
                campaignBudget: { amountMicros: "10000000" },
              },
            ]),
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
        enviados.push({ url, opcoes });
        return { getResponseCode: () => 200, getContentText: () => "{}" };
      },
    },
    Logger: { log: () => {} },
  };
  contexto.__hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  vm.createContext(contexto);
  vm.runInContext(FONTE.replace('"COLE_AQUI_O_SEGREDO";', `"${segredo}";`), contexto);
  vm.runInContext("main()", contexto);
  return enviados;
}

describe("scripts/google-ads-script.js", () => {
  it("o JSON que ele manda passa no validador da rota", () => {
    const [envio] = rodarScript();
    const corpo = JSON.parse(envio.opcoes.payload);
    const r = validarPayloadGoogle(corpo);
    expect(r.ok, r.ok ? "" : r.erro).toBe(true);
  });

  it("converte micros em reais e manda o segredo no cabeçalho certo", () => {
    const [envio] = rodarScript("x".repeat(64));
    expect(envio.url).toBe("https://motorsstore.com.br/api/marketing/sincronizar/google");
    expect(envio.opcoes.headers["X-Motors-Segredo"]).toBe("x".repeat(64));
    const corpo = JSON.parse(envio.opcoes.payload);
    const pesquisa = (corpo as Corpo).campanhas.find((c) => c.id === "2233")!;
    expect(pesquisa.orcamentoDiario).toBe(40);
    expect(pesquisa.dias[0].investido).toBe(12.35);
  });

  it("inclui a campanha pausada sem gasto e a removida que gastou", () => {
    const [envio] = rodarScript();
    const ids = (JSON.parse(envio.opcoes.payload) as Corpo).campanhas.map((c) => c.id).sort();
    expect(ids).toEqual(["2233", "4455", "9999"]);
  });

  it("recusa rodar com o segredo de exemplo", () => {
    expect(() => rodarScript("COLE_AQUI_O_SEGREDO")).toThrow(/Troque/);
  });
});
