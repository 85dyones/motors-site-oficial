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

/** Perícia em análise E com opcionais declarados — o caso dos 27 veículos que
 *  têm lista de opcionais e por isso escapavam da guarda de equipamento. */
const COM_OPCIONAIS = montarDossie({
  marca: "chevrolet", modelo: "onix", ano: 2021, preco: "72900.00",
  quilometragem: 51000, cambio: "manual", cor: "prata", tipo: "Hatch",
  pericia: "Em análise", opcionais: "Vidros elétricos, Ar-condicionado digital, Central multimidia",
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
    // A fixture dizia "com garantia de procedência" — o mesmo chavão que o
    // POSICIONAMENTO barra, escrito ao contrário. Ela media a ABERTURA e por
    // isso continuava verde, mas era um texto proibido servindo de exemplo.
    // Trocado por frase legítima do mesmo tamanho (27 caracteres), para o total
    // seguir sendo os 158 que o caso descreve.
    const texto =
      "Honda Civic 2022 por R$ 89.900,00. Aceita troca, financiamento facilitado e entrega para toda a região metropolitana de Curitiba, com histórico de manutenção.";
    expect(texto).toHaveLength(158);
    expect(motivos(texto)).toContain("abertura");
    expect(motivos(texto)).not.toContain("vocabulário");
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

  /**
   * Os dois chavões que o POSICIONAMENTO nomeia e o validador não pegava —
   * executados pelo portão em 08/09/2026. "procedência" sozinha é palavra da
   * casa; o que a lista barra é a promessa vazia colada nela.
   */
  it("reprova 'procedência garantida', nas duas ordens", () => {
    expect(motivos("Procedência garantida e preço no anúncio.")).toContain("vocabulário");
    expect(motivos("Carro com garantia de procedência.")).toContain("vocabulário");
  });
  it("reprova 'o melhor estoque da região'", () => {
    expect(motivos("O melhor estoque da região está aqui.")).toContain("vocabulário");
  });
  it("aceita 'procedência' e 'estoque' sozinhas, que são palavras da casa", () => {
    expect(motivos("Procedência rastreada, e o estoque inteiro está no site.")).not.toContain("vocabulário");
  });
});

/**
 * A regra que impede o texto público de dizer que o laudo aprovou um veículo
 * cuja vistoria não aprovou — 49 dos 85 à venda em 08/09/2026.
 *
 * É a regra mais cara do arquivo, e não por causa do texto: o painel imprime
 * "Não afirma perícia aprovada — a vistoria deste veículo ainda não aprovou"
 * AO LADO do texto gerado. Uma passagem aqui não entrega só um anúncio errado;
 * entrega uma tela afirmando ter conferido justamente o que vazou, para uma
 * pessoa que confia nela antes de clicar "Usar este texto".
 *
 * As oito frases abaixo foram EXECUTADAS contra as versões anteriores da régua
 * e todas passaram em alguma delas. Cada uma é um caso próprio de propósito: no
 * `it.each` uma frase que volte a passar aponta a si mesma no relatório.
 */
describe("regra: perícia", () => {
  const AFIRMAM_APROVACAO = [
    "Laudo cautelar aprovado sem apontamentos.",
    "Perícia cautelar independente feita por empresa credenciada, com resultado aprovado.",
    "Laudo cautelar realizado por empresa credenciada junto ao Detran: aprovado.",
    // As duas seguintes são a PASSAGEM DA ORDEM: a régua antiga exigia o
    // gatilho (laudo/perícia/cautelar) ANTES da afirmação, e aqui ele vem
    // depois. As duas passavam inteiras.
    "Aprovado na perícia cautelar independente.",
    "Aprovado em perícia cautelar, o carro está pronto para transferência.",
    // E estas três são a PASSAGEM DA NEGAÇÃO: o desconto reusava
    // `NEGA_APROVACAO` de `lib/supabase.ts`, que tem `\bsem\b` porque foi
    // escrita para a COLUNA DE STATUS. Contra frase livre, qualquer "sem «coisa
    // boa»" desligava a regra inteira.
    "Perícia cautelar independente, sem sinistro registrado, com resultado aprovado.",
    "Laudo cautelar sem restrições e aprovado por empresa credenciada.",
    "Laudo cautelar completo, sem histórico de leilão, aprovado.",
  ];

  it.each(AFIRMAM_APROVACAO)("reprova sem o dado: %s", (frase) => {
    expect(motivos(frase)).toContain("perícia");
  });

  it.each(AFIRMAM_APROVACAO)("aceita quando o dossiê autoriza: %s", (frase) => {
    expect(motivos(frase, APROVADO)).not.toContain("perícia");
  });

  /**
   * O outro lado, que é o que impede a régua de virar um "reprova tudo": as
   * três dizem a verdade de um carro em análise, e a primeira NEGA a aprovação
   * com o "não" entre o gatilho e a palavra.
   */
  const NAO_AFIRMAM = [
    "O laudo ainda não está aprovado.",
    "Passa por perícia independente antes de entrar na vitrine.",
    "Todo veículo passa por perícia cautelar independente antes de entrar na vitrine.",
  ];

  it.each(NAO_AFIRMAM)("NÃO reprova sem o dado: %s", (frase) => {
    expect(motivos(frase)).not.toContain("perícia");
  });

  /**
   * A armadilha que a correção da negação podia reabrir: "sem apontamentos" é
   * AFIRMAÇÃO de perícia limpa. Se ele voltar a contar como negação, o primeiro
   * caso da lista de cima para de reprovar — e é o caso mais comum de todos.
   */
  it("'sem apontamentos' afirma, não nega — mesmo sozinho na frase", () => {
    expect(motivos("Laudo cautelar sem apontamentos.")).toContain("perícia");
  });

  /** "sem aprovação" é a negação de verdade: colada na palavra, não a três
   *  substantivos de distância. */
  it("NÃO reprova 'sem aprovação', que é negação adjacente", () => {
    expect(motivos("Laudo cautelar entregue sem aprovação.")).not.toContain("perícia");
  });

  /** "reprovado" não contém "aprovad" — verificado, não suposto. */
  it("NÃO reprova frase que diz que o laudo reprovou", () => {
    expect(motivos("Laudo cautelar reprovado pela vistoria.")).not.toContain("perícia");
  });

  /** Gatilho numa frase e afirmação em OUTRA não é afirmação sobre a perícia. */
  it("NÃO reprova gatilho e afirmação em frases diferentes", () => {
    expect(
      motivos("Passa por perícia cautelar independente. O preço está aprovado pela gerência."),
    ).not.toContain("perícia");
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

  /**
   * `\bnacional\b` sozinho reprovava texto VERDADEIRO — executado pelo portão
   * em 08/09/2026 — e o motivo impresso ("Promete alcance maior que Paraná e
   * Santa Catarina") não descrevia o texto. Carro nacional é procedência de
   * fábrica, não promessa de entrega.
   */
  it("aceita 'nacional' no sentido de fabricação", () => {
    expect(motivos("Picape nacional, feita em Betim.")).not.toContain("alcance");
    expect(motivos("Carro nacional, com peças fáceis de achar.")).not.toContain("alcance");
  });
  it("reprova 'nacional' no sentido de entrega, nas duas ordens", () => {
    expect(motivos("Entrega nacional a partir de Curitiba.")).toContain("alcance");
    expect(motivos("Cobertura nacional para entrega.")).toContain("alcance");
    expect(motivos("Fazemos entrega em todo o país.")).toContain("alcance");
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

  /**
   * A guarda antiga era `dossie.opcionais.length === 0 && EQUIPAMENTOS.test`:
   * ligava só no veículo que não tem opcional NENHUM. Para os 27 que TÊM, ela
   * não rodava, e o portão executou o caso — dossiê com vidros elétricos e
   * ar-condicionado, texto citando teto solar, couro e multimídia — sem uma
   * reprovação. Ter um opcional declarado não autoriza os outros.
   */
  it("reprova equipamento fora da lista mesmo com o dossiê tendo outros", () => {
    const r = validarDescritivo("Traz teto solar, bancos em couro e central multimídia", COM_OPCIONAIS, "descricao");
    expect(r.map((x) => x.regra)).toContain("fato fora do dossiê");
    // O motivo nomeia o que sobrou: quem revisa precisa saber QUAL equipamento
    // não tem lastro, e não só que "há um".
    expect(r.find((x) => x.regra === "fato fora do dossiê")?.motivo).toContain("teto solar");
  });

  /**
   * O outro sentido, e ele tem de chegar ao mesmo ramo: a régua CASA os três
   * equipamentos citados e conclui que os três estão declarados. Um texto que
   * não acionasse `EQUIPAMENTOS` passaria por motivo nenhum e não provaria nada.
   */
  it("aceita equipamento declarado, tolerando caixa e acento", () => {
    // Dossiê: "Ar-condicionado digital" e "Central multimidia" (sem acento).
    const texto = "Tem ar-condicionado digital e central multimídia.";
    expect(motivos(texto, COM_OPCIONAIS, "descricao")).not.toContain("fato fora do dossiê");
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
