import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";
import {
  PERFIS_DE_USO,
  SLUGS_DE_PERFIL,
  perfilPorSlug,
  perfisDoValorAntigo,
  perfisValidos,
} from "../src/lib/perfisDeUso";
import { CARROCERIAS } from "../src/lib/classificacaoVeiculo";
import { FAIXAS_DE_PRECO } from "../src/lib/faixasDePreco";
import { CAMPOS_NOSSOS } from "../src/lib/estoqueEscrita";
import { ACAO_DO_CAMPO_DE_VEICULO } from "../src/lib/permissoes";
import { checkTagMatchesVehicle } from "../src/lib/regrasEstoque";
import type { QuickTag, Veiculo } from "../src/types";

/**
 * Perfis de uso — vários por carro, e a vitrine que sai disso.
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo trava
 * ---------------------------------------------------------------------------
 * `perfil_uso` era UM texto por veículo, num vocabulário de dez valores.
 * Medido nos 38 carros servidos em 2026-08-26: três valores diziam quase a
 * mesma coisa (19 deles) e quatro estavam em ZERO — inclusive
 * `CURADORIA EXCLUSIVA`, que mantinha `/destaques/curadoria` indexado com a
 * vitrine vazia.
 *
 * O defeito de fundo não era o vocabulário: era a cardinalidade. Um HB20 é
 * urbano, econômico e primeiro carro ao mesmo tempo, e um valor só obriga a
 * escolher qual verdade contar.
 *
 * As asserções aqui protegem as três coisas que quebram em silêncio:
 * a URL (colisão de slug entre os três tipos de recorte), a escrita (campo
 * fora da allowlist é desfeito pelo sync; fora da matriz é negado a todo
 * perfil) e o motor de regras, que casava por igualdade num campo que virou
 * lista.
 */

describe("1 · o vocabulário", () => {
  it("tem oito perfis, com slug único", () => {
    expect(PERFIS_DE_USO).toHaveLength(8);
    expect(new Set(SLUGS_DE_PERFIL).size).toBe(8);
  });

  it("cada perfil traz título e frase ESCRITOS", () => {
    // Montar `Carros para ${nome}` produz "Carros para primeiro carro" e
    // "Carros para performance". É o mesmo erro dos plurais de carroceria
    // ("Conversívels", "suvs"), e ele só aparece lendo a saída.
    for (const p of PERFIS_DE_USO) {
      expect(p.titulo.length, p.slug).toBeGreaterThan(3);
      expect(p.frase.length, p.slug).toBeGreaterThan(3);
      expect(p.titulo, p.slug).not.toContain("undefined");
    }
    expect(perfilPorSlug("primeiro-carro")?.titulo).toBe("Primeiro carro");
    expect(perfilPorSlug("performance")?.titulo).toBe("Carros de performance");
  });

  it("o slug não colide com carroceria nem com faixa de preço", () => {
    // Os três moram em `/estoque/{slug}`. Uma colisão não daria erro: serviria
    // uma vitrine no lugar da outra, e o ramo que perdesse ficaria inalcançável.
    const slugCarroceria = (n: string) =>
      n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");
    const ocupados = new Set([
      ...CARROCERIAS.map(slugCarroceria),
      ...FAIXAS_DE_PRECO.map((f) => f.slug),
    ]);
    for (const slug of SLUGS_DE_PERFIL) {
      expect(ocupados.has(slug), `${slug} já é carroceria ou faixa`).toBe(false);
    }
  });

  it("o vocabulário morto não voltou", () => {
    const nomes = PERFIS_DE_USO.map((p) => p.nome.toUpperCase());
    for (const morto of ["CURADORIA EXCLUSIVA", "LINHAGEM ESPORTIVA", "FORÇA & OFF-ROAD"]) {
      expect(nomes).not.toContain(morto);
    }
  });
});

describe("2 · o de-para do vocabulário antigo", () => {
  it("cobre os seis valores que existiam no dado", () => {
    // Os seis foram lidos do payload de `/estoque` em 2026-08-26 — não
    // deduzidos de slug nem de rótulo de tela. Deduzir a partir do slug foi o
    // que estragou um veículo na rodada do `modelo_override`.
    expect(perfisDoValorAntigo("Família / Conforto")).toEqual(["familia"]);
    expect(perfisDoValorAntigo("Uso Diário")).toEqual(["urbano"]);
    expect(perfisDoValorAntigo("Performance / Premium")).toEqual(["performance"]);
    expect(perfisDoValorAntigo("Trabalho / Robustez")).toEqual(["trabalho"]);
  });

  it("os dois redundantes viram DOIS perfis — é o motivo da coluna ser lista", () => {
    expect(perfisDoValorAntigo("Econômico / Diário")).toEqual(["economico", "urbano"]);
    expect(perfisDoValorAntigo("Agilidade / Economia")).toEqual(["economico", "urbano"]);
  });

  it("valor desconhecido devolve vazio, nunca um palpite", () => {
    // Perfil inventado cria vitrine `/estoque/{slug}` que ninguém pediu.
    for (const v of ["CURADORIA EXCLUSIVA", "qualquer coisa", "", null, undefined]) {
      expect(perfisDoValorAntigo(v as string), String(v)).toEqual([]);
    }
  });

  it("`perfisValidos` descarta slug fora do vocabulário e não duplica", () => {
    expect(perfisValidos(["urbano", "inexistente", "URBANO"])).toEqual(["urbano"]);
    expect(perfisValidos(["economico", "familia"])).toEqual(["familia", "economico"]);
    expect(perfisValidos(null)).toEqual([]);
  });
});

describe("3 · a escrita sobrevive ao sync e tem dono", () => {
  it("`perfis_uso` está em CAMPOS_NOSSOS", () => {
    // Fora dela, o painel escreveria numa coluna que o sync do RevendaMais
    // reescreve — e o sintoma seria "classifiquei e voltou sozinho".
    expect(CAMPOS_NOSSOS).toContain("perfis_uso");
  });

  it("`perfis_uso` tem linha na matriz de permissão", () => {
    // Campo sem linha é NEGADO a todo perfil: o editor não o desenha e o PATCH
    // devolve 403. Foi a pegadinha que quase pegou o `modelo_override`.
    expect(ACAO_DO_CAMPO_DE_VEICULO["perfis_uso"]).toBeTruthy();
  });

  it("a migração avisa para não pôr a coluna no payload do n8n", () => {
    const sql = ler("supabase/migrations/20260826230000_perfis_uso.sql");
    expect(sql).toMatch(/N[AÃ]O acrescentar/i);
    // Backfill declarando de onde os valores foram lidos — a regra que
    // `modelo-e-carroceria.test.ts` passou a cobrar das migrações de correção.
    expect(sql).toMatch(/lidos do payload|lido no|servid/i);
  });
});

describe("4 · o motor de regras casa contra a lista", () => {
  const veiculo = {
    id: "1",
    marca: "Hyundai",
    modelo: "HB20",
    versao: "1.0",
    preco_original: 62900,
    preco_promocional: 0,
    quilometragem: 88600,
    perfis_uso: ["urbano", "economico"],
    perfil_uso: "Econômico / Diário",
  } as unknown as Veiculo;

  const regra = (value: string, operator: QuickTag["operator"] = "equals") =>
    ({ id: "t", name: "T", field: "perfil_uso", operator, value }) as QuickTag;

  it("casa por QUALQUER perfil do carro, não só pelo primeiro", () => {
    // Com `equals` contra o campo antigo, todo carro de dois perfis deixaria de
    // casar no dia da migração — e nada acusaria: a vitrine só ficaria vazia.
    expect(checkTagMatchesVehicle(regra("urbano"), veiculo, {})).toBe(true);
    expect(checkTagMatchesVehicle(regra("economico"), veiculo, {})).toBe(true);
  });

  it("não casa perfil que o carro não tem", () => {
    expect(checkTagMatchesVehicle(regra("performance"), veiculo, {})).toBe(false);
    expect(checkTagMatchesVehicle(regra("off-road"), veiculo, {})).toBe(false);
  });

  it("`contains` continua valendo", () => {
    expect(checkTagMatchesVehicle(regra("econ", "contains"), veiculo, {})).toBe(true);
  });
});

describe("5 · a curadoria saiu", () => {
  it("não está mais nas tags estáticas", () => {
    // A regra casava `perfil_uso === "CURADORIA EXCLUSIVA"`, valor que estava
    // em zero dos 38 veículos: a página respondia 200 com a vitrine vazia.
    const codigo = lerCodigo("src/app/destaques/[tag]/page.tsx");
    expect(codigo).not.toContain('id: "curadoria"');
    expect(codigo).not.toContain("CURADORIA EXCLUSIVA");
  });
});

describe("6 · as vitrines", () => {
  it("a rota de recorte resolve perfil, além de carroceria e faixa", () => {
    const rota = lerCodigo("src/app/estoque/[recorte]/page.tsx");
    expect(rota).toContain("acharHubDePerfil");
    expect(rota).toContain("textoDePerfil");
  });

  it("o sitemap inclui os perfis com veículo", () => {
    const hubs = lerCodigo("src/lib/hubsDeEstoque.ts");
    expect(hubs).toMatch(/for \(const perfil of hubsDePerfil\(disponiveis\)\)/);
  });

  it("o hub de perfil sai de `disponiveis`, não do histórico", () => {
    // Ao contrário de marca e modelo, perfil é decisão do painel e não do
    // feed: um perfil que ninguém marcou hoje não descreve o pátio de ontem, e
    // uma vitrine perene vazia aqui não teria o que contar.
    const hubs = lerCodigo("src/lib/hubsDeEstoque.ts");
    expect(hubs).toMatch(/export function hubsDePerfil\(disponiveis: Veiculo\[\]\)/);
  });
});
