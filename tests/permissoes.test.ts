import { describe, it, expect } from "vitest";
import {
  MATRIZ_DE_PERMISSOES,
  PERFIS,
  podeFazer,
  normalizarPerfil,
  ALCADA_DO_PERFIL,
  ACAO_DO_CAMPO_DE_VEICULO,
  campoNegadoAoPerfil,
} from "../src/lib/permissoes";
import { CAMPOS_NOSSOS } from "../src/lib/estoqueEscrita";

/**
 * Testes da matriz de permissões (tela A17).
 *
 * A matriz é especificação transcrita do design doc; estes testes travam as
 * linhas onde errar custa caro — as "três travas que não caem": preço, texto
 * legal e paleta. Se alguém relaxar uma dessas linhas num refactor, o teste
 * aponta antes do painel.
 */

describe("MATRIZ_DE_PERMISSOES", () => {
  it("toda linha cobre todos os perfis", () => {
    for (const l of MATRIZ_DE_PERMISSOES) {
      for (const p of PERFIS) {
        expect(["faz", "revisao", "nao_ve"]).toContain(l.permissoes[p]);
      }
    }
  });

  it("as três travas do doc não caem", () => {
    // Paleta: somente Admin.
    expect(podeFazer("admin", "Editar paleta, logo e tipografia do site")).toBe("faz");
    // Todo perfil que não é Admin, sem exceção — derivado de PERFIS para que
    // um papel novo (o `gestor` de 2026-08-21 foi o primeiro) entre na trava
    // sozinho, em vez de ficar de fora por esquecimento na lista.
    for (const p of PERFIS.filter((x) => x !== "admin")) {
      expect(podeFazer(p, "Editar paleta, logo e tipografia do site")).toBe("nao_ve");
    }

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
    for (const p of ["gestor", "marketing", "comercial", "financeiro"] as const) {
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
  });

  it("nenhuma alçada volta a ser um valor em reais", () => {
    // A asserção original dizia `"R$ 1.500"`, transcrito do design doc; o dono
    // desfez a régua em 2026-08-21 ("essa regra de 1.500 reais não faz sentido
    // no financeiro") e o texto virou "Agendamento vai ao Gestor". Em
    // 2026-08-28 o módulo de caixa — e com ele a fila de agendamento — foi
    // aposentado (o financeiro renasce sobre o razão do handoff), e a alçada
    // dos dois perfis passou a ser a de preço. O que este teste trava é a
    // lição que sobrevive às duas mudanças: valor em reais não mede risco
    // numa revenda, e nenhum número pode voltar por descuido.
    expect(ALCADA_DO_PERFIL.financeiro).toBe("Sem limite no preço");
    expect(ALCADA_DO_PERFIL.gestor).toBe("Sem limite no preço");
    for (const texto of Object.values(ALCADA_DO_PERFIL)) {
      expect(texto).not.toMatch(/R\$\s*\d/);
    }
  });
});

describe("campoNegadoAoPerfil", () => {
  it("todo campo gravável do veículo tem linha declarada na matriz", () => {
    // Contraprova da regra "campo sem linha é negado": se alguém acrescentar
    // um campo a CAMPOS_NOSSOS sem decidir de quem ele é, o painel passaria a
    // devolver 403 sem explicação. Este teste obriga a decisão junto.
    const semLinha = CAMPOS_NOSSOS.filter((c) => !ACAO_DO_CAMPO_DE_VEICULO[c]);
    expect(
      semLinha,
      "Campo gravável sem linha na matriz A17: " + semLinha.join(", "),
    ).toEqual([]);
  });

  it("documentação do veículo: operação preenche, Financeiro não", () => {
    // Decisão do dono em 2026-08-08 — placa é dado interno que a operação
    // preenche, e renavam vem para esta mesma linha. Antes disso o furo era o
    // oposto: NENHUMA das duas rotas checava `placa`, e qualquer perfil
    // autenticado a gravava, em lote inclusive.
    for (const perfil of ["admin", "marketing", "comercial"] as const) {
      expect(campoNegadoAoPerfil(perfil, ["placa", "motor", "garantia_fabrica"])).toBeNull();
    }
    expect(campoNegadoAoPerfil("financeiro", ["placa"])?.campo).toBe("placa");
  });

  it("custo de aquisição fica com Admin e Financeiro", () => {
    expect(campoNegadoAoPerfil("financeiro", ["preco_compra"])).toBeNull();
    expect(campoNegadoAoPerfil("comercial", ["preco_compra"])?.campo).toBe("preco_compra");
    expect(campoNegadoAoPerfil("marketing", ["preco_compra"])?.campo).toBe("preco_compra");
  });

  it("marcar vendido é de quem publica — Marketing passa por revisão, logo não faz direto", () => {
    expect(campoNegadoAoPerfil("comercial", ["vendido"])).toBeNull();
    expect(campoNegadoAoPerfil("marketing", ["vendido"])?.campo).toBe("vendido");
    expect(campoNegadoAoPerfil("financeiro", ["vendido"])?.campo).toBe("vendido");
  });

  it("conteúdo do anúncio: Financeiro não escreve", () => {
    expect(campoNegadoAoPerfil("marketing", ["tipo", "descricao", "opcionais"])).toBeNull();
    expect(campoNegadoAoPerfil("financeiro", ["descricao"])?.campo).toBe("descricao");
  });

  it("campo fora do vocabulário é negado, não ignorado", () => {
    // O exemplo era `preco` até 2026-08-29, quando ele ENTROU no vocabulário
    // (o veículo nativo passou a ser reprecificável — só ele, porque só nele o
    // sync não passa por cima). Trocado por um campo que de fato não existe:
    // a regra em teste é "campo sem linha na matriz é negado", e ela não pode
    // depender de qual campo está fora hoje.
    expect(campoNegadoAoPerfil("admin", ["campo_que_ninguem_declarou"])?.campo).toBe(
      "campo_que_ninguem_declarou",
    );
    expect(campoNegadoAoPerfil("admin", ["campo_que_ninguem_declarou"])?.acao).toBe(
      "(campo sem linha na matriz)",
    );
  });

  it("reprecificar é da linha de preço, e o Comercial não passa direto", () => {
    // A contrapartida do teste acima: `preco` entrou no vocabulário, e entrou
    // na linha mais restritiva das duas ("acima de 5%"). Ver
    // `tests/preco-do-nativo.test.ts` para a régua completa.
    expect(campoNegadoAoPerfil("admin", ["preco"])).toBeNull();
    expect(campoNegadoAoPerfil("gestor", ["preco_original"])).toBeNull();
    expect(campoNegadoAoPerfil("comercial", ["preco"])?.campo).toBe("preco");
    expect(campoNegadoAoPerfil("marketing", ["preco"])?.campo).toBe("preco");
  });

  it("lista vazia não nega nada", () => {
    expect(campoNegadoAoPerfil("financeiro", [])).toBeNull();
  });
});
