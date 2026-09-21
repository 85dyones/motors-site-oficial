import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Veiculo } from "../src/types";
import { apenasDoUltimoSync, mapVeiculoDbToVeiculo } from "../src/lib/supabase";
import {
  DIAS_SEM_CARRO_PARA_NOINDEX,
  ancoraDoHistorico,
  caminhosDosHubs,
  hubAdormecido,
  hubsDeMarca,
} from "../src/lib/hubsDeEstoque";

/**
 * O hub de modelo sem carro há mais de 30 dias sai do índice (2026-09-21).
 *
 * Decisão do dono sobre os números de 21/09: 71 hubs de modelo no sitemap, 40
 * sem carro, 23 vazios há mais de 30 dias. O hub continua perene — no ar,
 * recebendo a ficha vendida, passando link —, mas deixa de pedir índice e sai
 * do sitemap até o próximo carro do modelo entrar.
 *
 * A prova principal roda o ESTOQUE REAL de 21/09: nomes das 119 linhas
 * (`estoque-2026-09-21.json`) e, de cada uma, vendido e última presença no
 * feed (`presencas-2026-09-21.json`), lidos do banco de produção nesse dia.
 */

type Linha = [number, string, string, string, string | null, string | null, string];
const NOMES: Linha[] = JSON.parse(readFileSync(join(__dirname, "fixtures", "estoque-2026-09-21.json"), "utf8"));
const PRESENCAS: Record<string, [boolean, string]> = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "presencas-2026-09-21.json"), "utf8"),
);

const LINHAS = NOMES.map(([id, marca, modelo, versao, mo, vo, tipo]) => ({
  id, marca, modelo, versao, modelo_override: mo, versao_override: vo, tipo,
  preco: 50000, ano: 2020, quilometragem: 1,
  vendido: PRESENCAS[String(id)][0],
  last_seen_at: PRESENCAS[String(id)][1],
}));
const HISTORICO: Veiculo[] = LINHAS.map((l) => mapVeiculoDbToVeiculo(l));
const NO_ULTIMO_SYNC = new Set(apenasDoUltimoSync(LINHAS).map((l) => String(l.id)));
const DISPONIVEIS = HISTORICO.filter((v) => NO_ULTIMO_SYNC.has(v.id) && !v.vendido);

function modelos() {
  const ancora = ancoraDoHistorico(HISTORICO);
  return (["carros", "motos"] as const).flatMap((segmento) =>
    hubsDeMarca(HISTORICO, DISPONIVEIS, segmento).flatMap((marca) =>
      marca.modelos.map((m) => ({ caminho: `/${segmento}/${marca.slug}/${m.slug}`, hub: m, adormecido: hubAdormecido(m, ancora) })),
    ),
  );
}

describe("o estoque real de 21/09", () => {
  it("o mapper leva a última presença para o veículo", () => {
    expect(HISTORICO.find((v) => v.id === "8479269")?.ultima_presenca).toBe("2026-09-21T09:00:03Z");
  });

  it("71 hubs de modelo, 40 sem carro, 23 adormecidos", () => {
    const todos = modelos();
    expect(todos).toHaveLength(71);
    expect(todos.filter((m) => m.hub.veiculos.length === 0)).toHaveLength(40);
    expect(todos.filter((m) => m.adormecido)).toHaveLength(23);
  });

  it("o que a loja repõe continua indexado mesmo vazio", () => {
    const porCaminho = new Map(modelos().map((m) => [m.caminho, m]));
    for (const caminho of [
      "/carros/chevrolet/tracker",
      "/carros/jeep/renegade",
      "/carros/ford/ecosport",
      "/carros/honda/hr-v",
      "/carros/honda/fit",
      "/carros/volkswagen/up",
    ]) {
      const m = porCaminho.get(caminho)!;
      expect(m.hub.veiculos, caminho).toHaveLength(0);
      expect(m.adormecido, caminho).toBe(false);
    }
  });

  it("o que passou uma vez e sumiu há mais de 30 dias dorme", () => {
    const porCaminho = new Map(modelos().map((m) => [m.caminho, m]));
    for (const caminho of ["/carros/volkswagen/taos", "/carros/volkswagen/tiguan", "/carros/chevrolet/cruze", "/carros/fiat/palio"]) {
      expect(porCaminho.get(caminho)?.adormecido, caminho).toBe(true);
    }
  });

  it("hub com carro nunca dorme", () => {
    for (const m of modelos().filter((x) => x.hub.veiculos.length > 0)) {
      expect(m.adormecido, m.caminho).toBe(false);
    }
  });

  it("o sitemap perde exatamente os 23 adormecidos — e nenhum hub de marca", () => {
    const caminhos = caminhosDosHubs(HISTORICO, DISPONIVEIS);
    const adormecidos = modelos().filter((m) => m.adormecido).map((m) => m.caminho);
    for (const c of adormecidos) expect(caminhos).not.toContain(c);
    for (const m of modelos().filter((x) => !x.adormecido)) expect(caminhos).toContain(m.caminho);
    // Marcas vazias continuam: Kia, Citroën, Mercedes-Benz…
    expect(caminhos).toContain("/carros/kia");
    expect(caminhos).toContain("/carros/citroen");
  });
});

describe("a régua", () => {
  const DIA = 24 * 60 * 60 * 1000;
  const ancora = Date.parse("2026-09-21T09:00:00Z");
  const vazio = (diasAtras: number) => ({ veiculos: [], ultimaPresenca: new Date(ancora - diasAtras * DIA).toISOString() });

  it(`${DIAS_SEM_CARRO_PARA_NOINDEX} dias é o corte, e o corte é estrito`, () => {
    expect(DIAS_SEM_CARRO_PARA_NOINDEX).toBe(30);
    expect(hubAdormecido(vazio(30), ancora)).toBe(false);
    expect(hubAdormecido(vazio(30.5), ancora)).toBe(true);
  });

  it("na dúvida, fica indexado", () => {
    expect(hubAdormecido({ veiculos: [], ultimaPresenca: null }, ancora)).toBe(false);
    expect(hubAdormecido({ veiculos: [], ultimaPresenca: "não é data" }, ancora)).toBe(false);
    expect(hubAdormecido(vazio(90), null)).toBe(false);
    expect(hubAdormecido({ ...vazio(90), veiculos: [{} as Veiculo] }, ancora)).toBe(false);
  });
});

describe("o relógio é o do feed, não o da parede", () => {
  afterEach(() => vi.useRealTimers());

  it("com o n8n parado há dois meses, nada novo adormece", () => {
    const antes = modelos().filter((m) => m.adormecido).map((m) => m.caminho);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-21T12:00:00Z"));
    const depois = modelos().filter((m) => m.adormecido).map((m) => m.caminho);
    expect(depois).toEqual(antes);
    expect(ancoraDoHistorico(HISTORICO)).toBe(Date.parse("2026-09-21T09:00:04Z"));
  });
});
