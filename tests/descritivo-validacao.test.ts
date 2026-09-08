import { describe, it, expect } from "vitest";
import { validarDescritivo, aberturaDe, LIMITE_META } from "../src/lib/descritivo/validacao";
import { montarDossie } from "../src/lib/descritivo/dossie";

/**
 * Cada regra é testada NOS DOIS SENTIDOS: um texto que ela deve reprovar e um
 * texto legítimo que ela deve deixar passar.
 *
 * Sem o segundo, duas regras teriam entrado em produção quebradas (08/09/2026):
 *   - /pendente/ reprovava TODO texto, porque "perícia independente" contém
 *     "pendente";
 *   - uma regra contra troca de campo reprovava "motor flex", que é português
 *     correto para motor bicombustível.
 * Regra que reprova o legítimo é tão inútil quanto regra que não pega nada.
 */

const SEM_NADA = montarDossie({
  marca: "honda", modelo: "nxr 160 bros", ano: 2022, preco: "18900.00",
  quilometragem: 29300, cambio: "manual", cor: "branca", tipo: "Motocicleta",
  pericia: "Em análise",
});

const APROVADO = montarDossie({
  marca: "fiat", modelo: "titano volcano", ano: 2025, preco: "170900.00",
  quilometragem: 42000, cambio: "automatico", cor: "vermelha", tipo: "Picape",
  pericia: "Aprovado", opcionais: "couro, ar-condicionado digital",
  garantia_fabrica: "12 meses ou 20.000 km", donos_anteriores: 1,
});

const motivos = (t: string, d = SEM_NADA, campo: "descricao" | "descricao_seo" = "descricao_seo") =>
  validarDescritivo(t, d, campo).map((r) => r.regra);

describe("aberturaDe", () => {
  it("devolve as duas primeiras frases", () => {
    expect(aberturaDe("Uma. Duas. Três.")).toBe("Uma. Duas.");
  });
  it("devolve o texto inteiro quando não há pontuação", () => {
    expect(aberturaDe("sem ponto final")).toBe("sem ponto final");
  });
});

describe("regra: abertura em 155 caracteres", () => {
  it("reprova abertura maior que o corte do Google", () => {
    const longa = "A".repeat(LIMITE_META + 5) + ". Segunda.";
    expect(motivos(longa)).toContain("abertura");
  });
  it("aceita abertura dentro do limite", () => {
    expect(motivos("Honda NXR 160 Bros 2022. Passa por perícia independente.")).not.toContain("abertura");
  });
  /**
   * O dossiê formata preço e km com `toLocaleString("pt-BR")` — ponto como
   * separador de milhar. Bug medido em 08/09/2026: o split de frases tratava
   * esse ponto como fim de frase, "R$ 89.900,00" virava dois fragmentos, e a
   * segunda frase real ("Aceita troca...") caía fora da contagem — a
   * abertura real tem 158 caracteres e devia reprovar, mas `aberturaDe`
   * devolvia só os primeiros 34.
   */
  it("reprova abertura com preço em formato brasileiro que soma 158 caracteres", () => {
    const texto =
      "Honda Civic 2022 por R$ 89.900,00. Aceita troca, financiamento facilitado e entrega para toda a região metropolitana de Curitiba, com garantia de procedência.";
    expect(motivos(texto)).toContain("abertura");
  });
  it("aceita abertura curta com preço e km em formato brasileiro", () => {
    const texto =
      "BMW X1 sDrive 20i 2022, por R$ 179.900, com 70.700 km rodados. Aceita troca e financiamento facilitado.";
    expect(motivos(texto)).not.toContain("abertura");
  });
});

describe("regra: vocabulário", () => {
  it("reprova o que o POSICIONAMENTO barra", () => {
    expect(motivos("SUV premium com acabamento de luxo.")).toContain("vocabulário");
  });
  it("aceita o vocabulário da casa", () => {
    expect(motivos("Procedência rastreada e preço no anúncio.")).not.toContain("vocabulário");
  });
});

describe("regra: perícia", () => {
  it("reprova afirmação de aprovação sem o dado", () => {
    expect(motivos("Laudo cautelar aprovado sem apontamentos.")).toContain("perícia");
  });
  it("aceita a mesma afirmação quando o dossiê autoriza", () => {
    expect(motivos("Laudo cautelar aprovado sem apontamentos.", APROVADO)).not.toContain("perícia");
  });
  it("aceita falar do processo sem o dado", () => {
    expect(motivos("Passa por perícia independente antes de entrar na vitrine.")).not.toContain("perícia");
  });

  /**
   * A janela de 40 caracteres da versão antiga não alcançava "aprovado"
   * nestas duas frases — medido pelo revisor em 08/09/2026. As duas afirmam
   * laudo aprovado num carro cuja perícia está "Em análise" (49 dos 85
   * veículos à venda naquele dia) e chegariam ao painel sem reprovação.
   */
  it("reprova afirmação de aprovação longe do gatilho, na mesma frase", () => {
    expect(
      motivos("Perícia cautelar independente feita por empresa credenciada, com resultado aprovado."),
    ).toContain("perícia");
  });
  it("reprova afirmação de aprovação separada por dois-pontos, na mesma frase", () => {
    expect(
      motivos("Laudo cautelar realizado por empresa credenciada junto ao Detran: aprovado."),
    ).toContain("perícia");
  });
  it("aceita as duas frases longas quando o dossiê autoriza", () => {
    expect(
      motivos("Perícia cautelar independente feita por empresa credenciada, com resultado aprovado.", APROVADO),
    ).not.toContain("perícia");
    expect(
      motivos("Laudo cautelar realizado por empresa credenciada junto ao Detran: aprovado.", APROVADO),
    ).not.toContain("perícia");
  });

  /**
   * O outro lado do mesmo defeito: esta frase NEGA aprovação, e reprovava
   * antes da correção — a régua via "laudo ... aprovado" e ignorava o "não"
   * entre os dois. `NEGA_APROVACAO` (a régua de `formatPericia`) desconta.
   */
  it("NÃO reprova frase que nega a aprovação", () => {
    expect(motivos("O laudo ainda não está aprovado.")).not.toContain("perícia");
  });
});

describe("regra: status interno", () => {
  it("reprova expor que o exame não fechou", () => {
    expect(motivos("Neste caso, o exame está em análise.")).toContain("status interno");
  });
  /** "perícia independente" contém "pendente" — a armadilha que reprovava tudo. */
  it("NÃO reprova 'perícia independente'", () => {
    expect(motivos("Passa por perícia independente antes de entrar na vitrine.")).not.toContain("status interno");
  });
});

describe("regra: alcance", () => {
  it("reprova 'todo o Brasil'", () => {
    expect(motivos("Entrega para todo o Brasil.")).toContain("alcance");
  });
  it("aceita o recorte do POSICIONAMENTO", () => {
    expect(motivos("Entrega para Paraná e Santa Catarina até Balneário Camboriú.")).not.toContain("alcance");
  });
});

describe("regra: markdown", () => {
  it("reprova negrito, que iria cru para o XML do feed", () => {
    expect(motivos("**BMW X1 sDrive 20i** com 70.700 km.")).toContain("markdown");
  });
  it("aceita texto corrido", () => {
    expect(motivos("BMW X1 sDrive 20i com 70.700 km.")).not.toContain("markdown");
  });
});

describe("regra: fato fora do dossiê", () => {
  it("reprova garantia que o veículo não tem", () => {
    expect(motivos("Com garantia de motor e câmbio.")).toContain("fato fora do dossiê");
  });
  it("reprova 'único dono' sem o dado", () => {
    expect(motivos("Único dono, sempre na concessionária.")).toContain("fato fora do dossiê");
  });
  it("reprova opcional citado num veículo sem opcionais", () => {
    expect(motivos("Com teto solar e bancos em couro.")).toContain("fato fora do dossiê");
  });
  it("aceita opcional que está no dossiê", () => {
    expect(motivos("Bancos em couro e ar-condicionado digital.", APROVADO)).not.toContain("fato fora do dossiê");
  });
  it("aceita garantia quando o dossiê tem Garantia de fábrica", () => {
    expect(motivos("Com garantia de motor e câmbio.", APROVADO)).not.toContain("fato fora do dossiê");
  });
  it("aceita único dono quando o dossiê tem Donos anteriores", () => {
    expect(motivos("Único dono, sempre na concessionária.", APROVADO)).not.toContain("fato fora do dossiê");
  });
});

describe("texto limpo", () => {
  it("não devolve reprovação nenhuma", () => {
    const bom = "Honda NXR 160 Bros ESDD 2022 com 29.300 km e câmbio manual, em pintura branca. Passa por perícia independente antes de entrar na vitrine. Showroom no Bacacheri, Curitiba.";
    expect(validarDescritivo(bom, SEM_NADA, "descricao_seo")).toEqual([]);
  });
});
