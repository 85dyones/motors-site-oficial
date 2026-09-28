import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapVeiculoDbToVeiculo } from "../src/lib/supabase";
import { CAMPOS_NOSSOS } from "../src/lib/estoqueEscrita";
import { podeGravarCampo } from "../src/lib/permissoes";

/**
 * Os dados do carro "em preparação" — spec 2026-09-28-em-preparacao-design.
 *
 * Duas colunas NOSSAS: o sync do RevendaMais não as conhece, e a trava
 * `estoque_motors_trava_do_sync` (allowlist por construção) descarta qualquer
 * escrita dele fora de preço e `last_seen_at`.
 */

const MIGRACAO = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "20260928150000_em_preparacao.sql"),
  "utf8",
);

describe("a migração", () => {
  it("cria as duas colunas com a forma que a trava de colunas lê", () => {
    expect(MIGRACAO).toMatch(/add column if not exists em_preparacao boolean not null default false/i);
    expect(MIGRACAO).toMatch(/add column if not exists previsao_chegada_em timestamptz/i);
  });

  it("caixa marcada sem data não existe nem no banco", () => {
    expect(MIGRACAO).toMatch(/check \(not em_preparacao or previsao_chegada_em is not null\)/i);
  });

  it("termina com o rodapé do livro-razão", () => {
    expect(MIGRACAO).toMatch(
      /insert into supabase_migrations\.schema_migrations \(version, name\)\s+values \('20260928150000', 'em_preparacao'\)/i,
    );
  });
});

/** Uma linha crua plausível — o mapper formata marca, modelo e fotos. */
const LINHA = {
  id: 8497421,
  marca: "fiat",
  modelo: "argo",
  versao: "drive 1.0",
  ano: 2025,
  quilometragem: 9000,
  preco_original: 79900,
  whatsapp_images: ["https://cdn.exemplo/f.jpg"],
};

describe("o mapper público", () => {
  it("leva os dois campos — a contagem é do cliente", () => {
    const v = mapVeiculoDbToVeiculo({
      ...LINHA,
      em_preparacao: true,
      previsao_chegada_em: "2026-10-03T17:00:00+00:00",
    });
    expect(v.em_preparacao).toBe(true);
    expect(v.previsao_chegada_em).toBe("2026-10-03T17:00:00+00:00");
  });

  it("coluna ausente (migração por aplicar) vira false e null, nunca undefined solto", () => {
    const v = mapVeiculoDbToVeiculo(LINHA);
    expect(v.em_preparacao).toBe(false);
    expect(v.previsao_chegada_em).toBeNull();
  });

  it("só `true` de verdade liga a caixa", () => {
    expect(mapVeiculoDbToVeiculo({ ...LINHA, em_preparacao: "true" }).em_preparacao).toBe(false);
  });
});

describe("quem grava", () => {
  it("os dois campos são do painel", () => {
    expect(CAMPOS_NOSSOS).toContain("em_preparacao");
    expect(CAMPOS_NOSSOS).toContain("previsao_chegada_em");
  });

  it("a mesma alçada da etiqueta de destaque: comercial grava, financeiro não", () => {
    for (const campo of ["em_preparacao", "previsao_chegada_em"]) {
      expect(podeGravarCampo(["comercial"], campo)).toBe(true);
      expect(podeGravarCampo(["marketing"], campo)).toBe(true);
      expect(podeGravarCampo(["financeiro"], campo)).toBe(false);
    }
  });
});
