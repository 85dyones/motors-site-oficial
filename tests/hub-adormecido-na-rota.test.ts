import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Veiculo } from "../src/types";
import { apenasDoUltimoSync, mapVeiculoDbToVeiculo } from "../src/lib/supabase";

/**
 * O `noindex` do hub adormecido chega ao `<head>` da página de verdade — não
 * só à função. Mesmo estoque real de 21/09 de `hub-adormecido.test.ts`, agora
 * passando por `generateMetadata` da rota do hub de modelo.
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

vi.mock("../src/lib/hubsDeEstoque", async (original) => {
  const real = await original<typeof import("../src/lib/hubsDeEstoque")>();
  // A ida e volta por JSON é a do cache de dados de verdade.
  return {
    ...real,
    recortesDoEstoque: async () => JSON.parse(JSON.stringify({ historico: HISTORICO, disponiveis: DISPONIVEIS })),
  };
});
vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ companySettings: { name: "Motors Store" } }),
}));

async function metadados(caminho: string) {
  const [, categoria, marca, modelo] = caminho.split("/");
  const { generateMetadata } = await import("../src/app/[categoria]/[marca]/[modelo]/page");
  return generateMetadata({ params: Promise.resolve({ categoria, marca, modelo }) });
}

describe("o <head> do hub de modelo", () => {
  it("adormecido: noindex, mas follow — e o canonical continua o próprio", async () => {
    const m = await metadados("/carros/volkswagen/taos");
    expect(m.robots).toEqual({ index: false, follow: true });
    expect(m.alternates?.canonical).toBe("/carros/volkswagen/taos");
  });

  it("vazio há poucos dias: sem robots — segue indexável", async () => {
    const m = await metadados("/carros/chevrolet/tracker");
    expect(m.robots).toBeUndefined();
  });

  it("com carro: sem robots", async () => {
    const m = await metadados("/carros/volkswagen/saveiro");
    expect(m.robots).toBeUndefined();
  });
});
