import { describe, it, expect } from "vitest";
import {
  MATRIZ_DE_PERMISSOES,
  PERFIS,
  podeFazer,
  normalizarPerfil,
  ALCADA_DO_PERFIL,
} from "../src/lib/permissoes";

/**
 * Testes da matriz de permissões (tela A17).
 *
 * A matriz é especificação transcrita do design doc; estes testes travam as
 * linhas onde errar custa caro — as "três travas que não caem": preço, texto
 * legal e paleta. Se alguém relaxar uma dessas linhas num refactor, o teste
 * aponta antes do painel.
 */

describe("MATRIZ_DE_PERMISSOES", () => {
  it("toda linha cobre os quatro perfis", () => {
    for (const l of MATRIZ_DE_PERMISSOES) {
      for (const p of PERFIS) {
        expect(["faz", "revisao", "nao_ve"]).toContain(l.permissoes[p]);
      }
    }
  });

  it("as três travas do doc não caem", () => {
    // Paleta: somente Admin.
    expect(podeFazer("admin", "Editar paleta, logo e tipografia do site")).toBe("faz");
    expect(podeFazer("marketing", "Editar paleta, logo e tipografia do site")).toBe("nao_ve");
    expect(podeFazer("comercial", "Editar paleta, logo e tipografia do site")).toBe("nao_ve");
    expect(podeFazer("financeiro", "Editar paleta, logo e tipografia do site")).toBe("nao_ve");

    // Texto legal: Financeiro e Admin.
    expect(podeFazer("financeiro", "Editar texto legal e condições de financiamento")).toBe("faz");
    expect(podeFazer("comercial", "Editar texto legal e condições de financiamento")).toBe("nao_ve");
    expect(podeFazer("marketing", "Editar texto legal e condições de financiamento")).toBe("nao_ve");

    // Preço acima da alçada: Comercial passa por revisão, nunca direto.
    expect(podeFazer("comercial", "Alterar preço acima de 5%")).toBe("revisao");
    expect(podeFazer("marketing", "Alterar preço até 5%")).toBe("nao_ve");
  });

  it("permissões e convites são exclusivos do Admin", () => {
    expect(podeFazer("admin", "Convidar usuário e trocar perfil")).toBe("faz");
    for (const p of ["marketing", "comercial", "financeiro"] as const) {
      expect(podeFazer(p, "Convidar usuário e trocar perfil")).toBe("nao_ve");
    }
  });

  it("ação desconhecida nega por padrão", () => {
    expect(podeFazer("admin", "Apagar o banco")).toBe("nao_ve");
  });
});

describe("normalizarPerfil", () => {
  it("aceita os quatro perfis e rebaixa o resto para comercial", () => {
    expect(normalizarPerfil("admin")).toBe("admin");
    expect(normalizarPerfil("marketing")).toBe("marketing");
    expect(normalizarPerfil("financeiro")).toBe("financeiro");
    // Papel legado/desconhecido: errar para baixo, nunca para cima.
    expect(normalizarPerfil("gerente")).toBe("comercial");
    expect(normalizarPerfil(null)).toBe("comercial");
    expect(normalizarPerfil(undefined)).toBe("comercial");
  });
});

describe("ALCADA_DO_PERFIL", () => {
  it("mantém as alçadas que o doc imprime", () => {
    expect(ALCADA_DO_PERFIL.admin).toBe("Sem limite");
    expect(ALCADA_DO_PERFIL.comercial).toBe("5% no preço");
    expect(ALCADA_DO_PERFIL.financeiro).toBe("R$ 1.500");
  });
});
