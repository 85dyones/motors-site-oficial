import { describe, it, expect } from "vitest";
import { ACOES, ACOES_DE_LEADS } from "../src/lib/turnstile";
import { termosProibidosEm } from "../src/lib/checklistDoRepasse";
import { mensagemDePerguntaDoRepasse, mensagemDoRepasse } from "../src/lib/mensagensDoVeiculo";
import { estadoDoRepasse, slugDoRepasse, sufixoDoRepasse } from "../src/lib/repasse";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * A metade "lib" do par de testes do captcha (molde `campanha-cta`): a ação
 * existe e a rota a aceita. A outra metade — cada formulário declara
 * `action={ACOES.repasse}` — nasce com os formulários (Task 9).
 */
describe("a ação do captcha existe dos dois lados", () => {
  it("`repasse` está em ACOES e é aceita por /api/leads", () => {
    // Esquecer a segunda metade não dá erro de compilação: o widget resolve, o
    // token viaja e o siteverify recusa pela action — 403 num formulário que
    // parece funcionar.
    expect(ACOES.repasse).toBe("repasse");
    expect([...ACOES_DE_LEADS]).toContain(ACOES.repasse);
  });
});

describe("a referência do carro", () => {
  it("o sufixo é o fim do slug — é por ele que o atendente acha o carro e a URL velha se acha", () => {
    const r = repasseDeTeste();
    expect(sufixoDoRepasse(r.id)).toBe("3f9a1c");
    expect(slugDoRepasse(r).endsWith(`-${sufixoDoRepasse(r.id)}`)).toBe(true);
  });
});

describe("o estado do carro na vitrine", () => {
  it("publicado se divide em aberto e só-lojistas; o resto não aparece", () => {
    expect(estadoDoRepasse({ situacao: "publicado", aberto_ao_publico_em: "2026-09-24T12:00:00Z" })).toBe("aberto");
    expect(estadoDoRepasse({ situacao: "publicado", aberto_ao_publico_em: null })).toBe("lojistas");
    expect(estadoDoRepasse({ situacao: "reservado", aberto_ao_publico_em: null })).toBe("reservado");
    expect(estadoDoRepasse({ situacao: "vendido", aberto_ao_publico_em: null })).toBe("vendido");
    for (const situacao of ["rascunho", "em_validacao", "arquivado"] as const) {
      expect(estadoDoRepasse({ situacao, aberto_ao_publico_em: null })).toBeNull();
    }
  });
});

describe("as mensagens de WhatsApp do repasse", () => {
  const r = repasseDeTeste();

  it("nomeiam o carro e levam a referência do atendente", () => {
    const m = mensagemDoRepasse(r, "aberto");
    expect(m).toContain("Renault Kwid Zen 1.0 2021");
    expect(m).toContain("Ref.: repasse 3f9a1c");
    expect(m).toMatch(/\?/);
  });

  it("reservado e vendido não prometem o carro", () => {
    expect(mensagemDoRepasse(r, "reservado")).toContain("reservado");
    expect(mensagemDoRepasse(r, "vendido")).toContain("vendido");
    expect(mensagemDoRepasse(r, "vendido")).not.toMatch(/disponível\?/);
  });

  it("o ref do rastreio vai no fim, como nas mensagens da ficha", () => {
    expect(mensagemDoRepasse(r, "aberto", " (ref: ag-1)").endsWith(" (ref: ag-1)")).toBe(true);
    expect(mensagemDePerguntaDoRepasse(" (ref: ag-1)").endsWith(" (ref: ag-1)")).toBe(true);
  });

  it("nenhuma usa termo que o repasse não usa", () => {
    for (const m of [
      mensagemDoRepasse(r, "aberto"),
      mensagemDoRepasse(r, "reservado"),
      mensagemDoRepasse(r, "vendido"),
      mensagemDePerguntaDoRepasse(),
    ]) {
      expect(termosProibidosEm(m), m).toEqual([]);
    }
  });
});
