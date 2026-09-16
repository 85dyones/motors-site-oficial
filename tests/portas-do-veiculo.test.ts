import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapVeiculoDbToVeiculo } from "../src/lib/supabase";
import { schemaDoVeiculo } from "../src/lib/schemaVeiculo";
import type { Veiculo } from "../src/types";

/**
 * `numberOfDoors` — o campo que `schemaVeiculo.ts` documentava como ausente.
 *
 * O comentário dizia: *"deduzi-los da carroceria daria certo na maioria e
 * erraria no Kombi, na picape cabine simples e no cupê — e schema errado é pior
 * que campo ausente, porque é afirmação"*. O feed provou que o medo era certo, e
 * ao mesmo tempo que o dado já existia: `<DOORS>` vem preenchido em **39 de
 * 39**, e o sync o descartava.
 *
 * Medido no feed de 2026-09-04, os casos que a dedução erraria:
 *   Kombi 8392516 → 4    ·    Kombi 8333811 → 3   (mesma carroceria, contagens
 *   Saveiro 8335204 → 2  ·    Saveiro 8358193 → 2  diferentes)
 *   Fusca 8310901 → 2
 *
 * E os dois `0`: Honda ADV 150 e Harley Dyna Glide — motos. Zero não é "zero
 * portas", é "não se aplica", e a diferença decide se o JSON-LD afirma algo
 * falso.
 */

const RAIZ = join(__dirname, "..");

const base: Record<string, unknown> = {
  id: 8392516,
  marca: "volkswagen",
  modelo: "kombi standard 1.4mi 4p",
  versao: "standard 1.4mi 4p",
  ano: 2013,
  preco: 61900,
  preco_original: 61900,
  quilometragem: 78000,
  cambio: "manual",
  combustivel: "flex",
  cor: "branco",
  tipo: "Van",
  whatsapp_images: ["https://exemplo/1.jpg"],
};

describe("o mapper distingue `sem portas` de `zero portas`", () => {
  it("inteiro positivo atravessa", () => {
    expect(mapVeiculoDbToVeiculo({ ...base, portas: 4 }).portas).toBe(4);
    expect(mapVeiculoDbToVeiculo({ ...base, portas: 2 }).portas).toBe(2);
  });

  it("ZERO vira ausente — é a moto, e `numberOfDoors: 0` seria mentira", () => {
    // O banco guarda NULL para moto (o feed manda 0 e a importação converte),
    // mas a defesa fica dos dois lados: um 0 que escapasse não pode virar
    // afirmação no JSON-LD.
    expect(mapVeiculoDbToVeiculo({ ...base, portas: 0 }).portas).toBeUndefined();
  });

  it("nulo, ausente e lixo também viram ausente", () => {
    for (const valor of [null, undefined, "", "quatro", NaN, 2.5, -1]) {
      expect(
        mapVeiculoDbToVeiculo({ ...base, portas: valor }).portas,
        `portas = ${JSON.stringify(valor)}`,
      ).toBeUndefined();
    }
  });

  it("não inventa a partir da carroceria — o defeito que o campo existe para evitar", () => {
    // Duas Kombis reais do feed, MESMA carroceria e contagens diferentes. Se
    // alguém trocar a coluna por uma dedução, este par cai.
    const quatro = mapVeiculoDbToVeiculo({ ...base, id: 8392516, portas: 4 });
    const tres = mapVeiculoDbToVeiculo({ ...base, id: 8333811, portas: 3 });
    expect(quatro.tipo).toBe(tres.tipo);
    expect(quatro.portas).not.toBe(tres.portas);
  });
});

describe("o JSON-LD só afirma o que sabe", () => {
  const OPCOES = { caminho: "/carros/volkswagen/kombi/standard/kombi-8392516", indisponivel: false };
  const veiculo = (extra: Partial<Veiculo>): Veiculo =>
    ({ ...(mapVeiculoDbToVeiculo(base) as Veiculo), ...extra });

  it("com portas, o schema traz `numberOfDoors`", () => {
    const s = schemaDoVeiculo(veiculo({ portas: 4 }), OPCOES) as Record<string, unknown>;
    expect(s.numberOfDoors).toBe(4);
  });

  it("sem portas, o campo NÃO aparece — ausente, nunca zero", () => {
    const s = schemaDoVeiculo(veiculo({ portas: undefined }), OPCOES) as Record<string, unknown>;
    expect(s.numberOfDoors).toBeUndefined();
    // E não sobrevive à serialização como `null`, que o Google leria como
    // declaração vazia em vez de campo omitido.
    expect(JSON.stringify(s)).not.toContain("numberOfDoors");
  });

  it("`numberOfPreviousOwners` continua deixando o zero passar — a régua é outra", () => {
    // Zero dono anterior é informação legítima ("nunca transferido"); zero
    // porta não é. As duas convivem no mesmo objeto e não podem se contaminar.
    const s = schemaDoVeiculo(veiculo({ donos_anteriores: 0, portas: undefined }), OPCOES) as Record<
      string,
      unknown
    >;
    expect(s.numberOfPreviousOwners).toBe(0);
    expect(s.numberOfDoors).toBeUndefined();
  });
});

describe("a fonte do dado: o sync passou a trazer o que descartava", () => {
  const workflow = readFileSync(
    join(RAIZ, "Antigravity - Sincronizador de Estoque (estoque_motors).json"),
    "utf-8",
  );

  it("o nó de código lê `DOORS` e emite `portas`", () => {
    expect(workflow).toContain("DOORS");
    expect(workflow).toMatch(/portas:/);
  });

  it("o corpo do upsert manda a coluna — sem isso o dado morre no mapeamento", () => {
    // Foi exatamente o que aconteceu com chassi e FIPE: a migração
    // 20260817140000 criou as colunas, o nó de código passou a lê-las, e o
    // corpo do upsert nunca foi atualizado. O dado chega e morre ali.
    const corpo = JSON.parse(workflow).nodes.find((n: { name: string }) =>
      n.name.includes("Upsert"),
    ).parameters.body as string;
    expect(corpo).toMatch(/portas:\s*\$json\.portas/);
  });

  it("a migração converte o zero do feed em nulo", () => {
    const migracao = readFileSync(
      join(RAIZ, "supabase", "migrations", "20260904120000_portas_do_veiculo.sql"),
      "utf-8",
    );
    // O CHECK exige positivo, então um 0 que passasse pelo mapeamento faria o
    // INSERT do feed inteiro falhar — o motivo de a conversão viver no n8n.
    expect(migracao).toMatch(/portas >= 1 and portas <= 8/);
    expect(migracao).toContain("estoque_motors_portas_plausivel");
  });
});
