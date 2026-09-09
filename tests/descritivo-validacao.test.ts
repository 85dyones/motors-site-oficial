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

/** Como `motivos`, mas devolve `{ regra, motivo }` inteiro — para conferir o
 *  TEXTO do motivo, não só que a regra disparou. */
const motivosCompletos = (
  t: string,
  d = SEM_NADA,
  campo: "descricao" | "descricao_seo" = "descricao_seo",
) => validarDescritivo(t, d, campo);

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
 * A regra que impede o texto público de FALAR de perícia — não só de afirmar
 * aprovação.
 *
 * Substitui, em 09/09/2026, uma régua de DETECÇÃO DE AFIRMAÇÃO que foi
 * reescrita quatro vezes e vazou nas quatro — a última passagem (medida pelo
 * portão) deixava seis descritivos inteiros afirmarem aprovação e passarem
 * limpos. Decisão do dono: em vez de tentar decidir SE o texto afirma
 * aprovação, a régua decide SE o texto toca no assunto. A frase sobre
 * vistoria virou padrão e vive no campo `laudo_pericia` (`laudoPadrao.ts`).
 *
 * Por isso as seis frases abaixo reprovam com QUALQUER dossiê — a perícia
 * aprovada não abre exceção, porque o assunto simplesmente não é do texto do
 * anúncio.
 */
describe("regra: perícia", () => {
  const FALAM_DE_PERICIA = [
    "A perícia cautelar independente aprovou este carro antes da vitrine.",
    "Passou na perícia cautelar independente e está pronto para transferência.",
    "Vistoria independente aprovada, carro pronto para transferência.",
    "Laudo cautelar independente sem restrições, feito por empresa credenciada.",
    "Perícia cautelar independente: nada consta.",
    // Reprova mesmo sem afirmar aprovação nenhuma: o texto do anúncio não
    // fala de perícia, nem para dizer que ela existe.
    "Passa por perícia independente antes de entrar na vitrine.",
  ];

  it.each(FALAM_DE_PERICIA)("reprova com dossiê SEM perícia aprovada: %s", (frase) => {
    expect(motivos(frase, SEM_NADA)).toContain("perícia");
  });

  it.each(FALAM_DE_PERICIA)("reprova IGUAL com dossiê COM perícia aprovada: %s", (frase) => {
    expect(motivos(frase, APROVADO)).toContain("perícia");
  });

  const NAO_FALAM_DE_PERICIA = [
    "O carro que passou pela seleção da Motors Store.",
    "De cada dez avaliados, três passam.",
    "SUV cinza com 70.700 km e câmbio automático, procedência rastreada.",
    // Item menor do portão (09/09/2026): "laudo" é substring de "aplaudo", e
    // sem o `\b` na frente do termo a régua reprovaria um elogio à loja.
    "Eu aplaudo o cuidado da loja com cada carro que entra na vitrine.",
    "Dá vontade de aplaudir o cuidado da loja com cada carro na entrega.",
  ];

  it.each(NAO_FALAM_DE_PERICIA)("NÃO reprova — não fala de perícia: %s", (frase) => {
    expect(motivos(frase)).not.toContain("perícia");
  });

  /**
   * O motivo mudou de natureza: não é mais sobre o que o texto AFIRMA, é
   * sobre o que o texto TOCA. "Perícia cautelar independente: aprovação
   * negada." reprova hoje pelo mesmo motivo de qualquer outra menção — não
   * porque nega ou afirma nada.
   */
  it("reprova mesmo quando o texto NEGA a aprovação — o assunto é que está proibido", () => {
    const r = motivosCompletos("Perícia cautelar independente: aprovação negada.", SEM_NADA);
    expect(r.map((x) => x.regra)).toContain("perícia");
    expect(r.find((x) => x.regra === "perícia")?.motivo).toContain("Fala de perícia");
  });

  /**
   * O motivo antigo era "Afirma laudo aprovado" e citava especificamente
   * "100%" como gatilho de afirmação. Isso não existe mais: o motivo agora é
   * sempre o mesmo, texto genérico sobre MENCIONAR o assunto.
   */
  it("'100%' junto de termo de perícia reprova com o motivo novo, não mais 'Afirma laudo aprovado'", () => {
    const r = motivosCompletos("Aprovação de 100% no laudo cautelar.", SEM_NADA);
    const motivo = r.find((x) => x.regra === "perícia")?.motivo ?? "";
    expect(motivo).not.toContain("Afirma laudo aprovado");
    expect(motivo).toContain("Fala de perícia");
  });

  /**
   * Cobertura de cada termo da lista da tarefa, com acento/caixa variando —
   * prova que MENCIONA_PERICIA pega os oito, não só os que aparecem nas
   * frases obrigatórias acima.
   */
  it.each([
    ["perícia", "A perícia foi feita ontem."],
    ["pericial", "Laudo pericial concluído semana passada."],
    ["laudo", "O laudo chegou hoje."],
    ["cautelar", "Exame cautelar realizado na entrada."],
    ["vistoria", "A vistoria começou de manhã."],
    ["vistoriado", "Carro vistoriado na semana passada."],
    ["inspeção", "Passou por inspeção completa no pátio."],
    ["periciado", "Veículo periciado com cuidado."],
    ["PERICIA (maiúsculo, sem acento)", "Item PERICIA aprovado pela loja."],
    ["inspecao (sem cedilha nem til)", "Fizemos inspecao completa ontem."],
  ])("reprova por conter '%s'", (_termo, frase) => {
    expect(motivos(frase)).toContain("perícia");
  });

  /**
   * Item menor do portão (09/09/2026): seis formas que a lista original não
   * pegava — plural em "-ções" (não é "-ãoes"), verbo "inspecionar" (raiz com
   * "c", não "ç"), a raiz "perit" (palavra diferente de "períci") e o prefixo
   * "re-" quebrando o `\b` de "vistoria".
   */
  it.each([
    ["inspeções (plural com õ)", "O pátio passou por inspeções rigorosas este mês."],
    ["inspecionado", "Todo carro chega inspecionado antes da vitrine."],
    ["inspecionar", "A equipe volta a inspecionar o veículo na entrada."],
    ["perito", "Um perito credenciado assinou o exame."],
    ["peritagem", "A peritagem foi concluída na semana passada."],
    ["revistoriado", "O carro foi revistoriado depois do reparo."],
  ])("reprova por conter '%s' (item menor, ampliação de 09/09/2026)", (_termo, frase) => {
    expect(motivos(frase)).toContain("perícia");
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

  /**
   * SEGUNDA REGRESSÃO (09/09/2026): a janela entre a palavra de entrega e
   * `nacional` tinha caído para 15 caracteres — curta demais para "todo o
   * território nacional", que passava sem reprovação (medido pelo portão).
   */
  it("reprova 'todo o território nacional' — a janela larga o suficiente", () => {
    expect(motivos("Fazemos entrega em todo o território nacional.")).toContain("alcance");
    expect(motivos("Entregamos para todo o território nacional.")).toContain("alcance");
    expect(motivos("Fazemos frete para qualquer ponto do território nacional.")).toContain("alcance");
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
    // Até 08/09/2026 esta fixture dizia "Passa por perícia independente antes
    // de entrar na vitrine" — texto que, com a régua nova (09/09/2026), passou
    // a reprovar por MENCIONAR perícia. Trocado por uma frase que fala da
    // seleção da loja, que é o assunto que "passou" continua descrevendo.
    const bom = "Honda NXR 160 Bros ESDD 2022 com 29.300 km e câmbio manual, em pintura branca. O carro que passou pela seleção da Motors Store. Showroom no Bacacheri, Curitiba.";
    expect(validarDescritivo(bom, SEM_NADA, "descricao_seo")).toEqual([]);
  });
});
