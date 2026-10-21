import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  ETIQUETAS_DA_PASSAGEM,
  aplicarMudanca,
  ehEtiquetaDaPassagem,
  lerMudanca,
  limparEtiquetas,
  mesmasEtiquetas,
  normalizarEtiqueta,
  normalizarEtiquetas,
} from "../src/lib/etiquetas";

/**
 * As regras das etiquetas do lead (2026-09-25): o formato do que o site PÕE,
 * a lista que o lead TEM, a mudança que o card pede e as duas da passagem do
 * SDR. As etiquetas moram no lead desde a migração 20261023120000; a gravação
 * no Chatwoot saiu com ele dos processos da Motors (21/10/2026).
 */

describe("as duas réguas: o que o site PÕE e o que a conversa TEM", () => {
  it("pôr: minúscula, sem espaço sobrando", () => {
    expect(normalizarEtiqueta("  Resgate ")).toBe("resgate");
  });

  it("pôr: aceita hífen, sublinhado, número e acento", () => {
    for (const boa of ["quer-comprar", "origem_site", "fase2", "reaquecido", "negociação"]) {
      expect(normalizarEtiqueta(boa), boa).toBe(boa);
    }
  });

  it("pôr: recusa espaço no meio, pontuação, vazio, mais de 50 e o que não é texto", () => {
    for (const ruim of ["quer comprar", "resgate!", "a/b", "", "   ", null, undefined, 7, {}, "a".repeat(51)]) {
      expect(normalizarEtiqueta(ruim), String(ruim)).toBeNull();
    }
    expect(normalizarEtiquetas(["Resgate", "resgate", "x y", "reaquecido"])).toEqual(["resgate", "reaquecido"]);
  });

  it("ter: o que a conversa tem volta como está — nada é 'consertado' e perdido", () => {
    // A revisão de 25/09 mostrou "Lead Quente" e "campanha.setembro" sumindo
    // na primeira gravação, porque a leitura normalizava.
    expect(limparEtiquetas(["origem-site", "Lead Quente", "campanha.setembro", "Resgate"])).toEqual([
      "origem-site",
      "Lead Quente",
      "campanha.setembro",
      "Resgate",
    ]);
  });

  it("ter: só sai o lixo — não-texto, vazio e repetido (sem distinguir caixa)", () => {
    expect(limparEtiquetas(["a", "", "  ", 3, null, "A", "b ", "b"])).toEqual(["a", "b"]);
    expect(limparEtiquetas("resgate")).toEqual([]);
  });
});

describe("aplicar uma mudança", () => {
  it("as que ninguém citou ficam, na mesma ordem e na mesma grafia", () => {
    expect(aplicarMudanca(["Lead Quente", "origem-site"], { incluir: ["resgate"] })).toEqual([
      "Lead Quente",
      "origem-site",
      "resgate",
    ]);
  });

  it("tirar não distingue caixa, e incluir o que já está não duplica", () => {
    expect(aplicarMudanca(["Origem-Site", "resgate"], { retirar: ["origem-site"], incluir: ["RESGATE"] })).toEqual([
      "resgate",
    ]);
  });

  it("mesmas etiquetas em outra ordem são a mesma lista", () => {
    expect(mesmasEtiquetas(["a", "b"], ["B", "a"])).toBe(true);
    expect(mesmasEtiquetas(["a"], ["a", "b"])).toBe(false);
  });
});

describe("o pedido do card", () => {
  it("aceita incluir no formato e retirar na grafia que a conversa tem", () => {
    expect(lerMudanca({ incluir: ["Negociando"], retirar: ["Lead Quente"] })).toEqual({
      ok: true,
      mudanca: { incluir: ["negociando"], retirar: ["Lead Quente"] },
    });
  });

  it("recusa incluir fora do formato, lista que não é lista, e pedido vazio", () => {
    expect(lerMudanca({ incluir: ["quer comprar"] })).toMatchObject({ ok: false, erro: expect.stringContaining('"quer comprar"') });
    expect(lerMudanca({ incluir: "resgate" })).toMatchObject({ ok: false });
    expect(lerMudanca({ retirar: [3] })).toMatchObject({ ok: false });
    expect(lerMudanca({ retirar: ["  "] })).toMatchObject({ ok: false });
    expect(lerMudanca({})).toMatchObject({ ok: false, erro: "Diga o que incluir ou retirar." });
    expect(lerMudanca(null)).toMatchObject({ ok: false });
  });

  it("recusa mais de 20 de uma vez", () => {
    const muitas = Array.from({ length: 21 }, (_, i) => `e${i}`);
    expect(lerMudanca({ incluir: muitas })).toMatchObject({ ok: false });
    expect(lerMudanca({ retirar: muitas })).toMatchObject({ ok: false });
  });

  it("sabe quais são as duas da passagem, em qualquer caixa", () => {
    expect(ehEtiquetaDaPassagem("Resgate")).toBe(true);
    expect(ehEtiquetaDaPassagem("reaquecido")).toBe(true);
    expect(ehEtiquetaDaPassagem("resgatar")).toBe(false);
  });
});

describe("as duas da passagem são as mesmas no site e no banco", () => {
  it("o gatilho da migração grava exatamente ETIQUETAS_DA_PASSAGEM", () => {
    // O SQL não importa o TS. Se alguém trocar o nome de um lado, o crédito do
    // banco e a etiqueta do lead passam a medir coisas diferentes.
    const sql = readFileSync("supabase/migrations/20260925180000_etiquetas_do_lead.sql", "utf-8");
    const noGatilho = /'etiquetas',\s*jsonb_build_array\(([^)]*)\)/.exec(sql);
    expect(noGatilho, "o gatilho não monta a lista de etiquetas").not.toBeNull();
    const doBanco = [...noGatilho![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(doBanco).toEqual([...ETIQUETAS_DA_PASSAGEM]);
    expect(sql).toContain(`'${ETIQUETAS_DA_PASSAGEM.join(", ")}'`);
  });
});
