import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validarDescritivo, primeiraFraseDe, LIMITE_META } from "../src/lib/descritivo/validacao";
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

describe("primeiraFraseDe", () => {
  it("devolve só a primeira frase", () => {
    expect(primeiraFraseDe("Uma. Duas. Três.")).toBe("Uma.");
  });
  it("devolve o texto inteiro quando não há pontuação", () => {
    expect(primeiraFraseDe("sem ponto final")).toBe("sem ponto final");
  });
  /**
   * O dossiê formata preço e km com `toLocaleString("pt-BR")`, ponto como
   * separador de milhar. Bug medido em 08/09/2026: o ponto de "89.900" fechava
   * a frase no meio do número.
   */
  it("não fecha a frase no ponto de milhar", () => {
    expect(primeiraFraseDe("BMW X1 2022 por R$ 179.900, com 70.700 km. Aceita troca.")).toBe(
      "BMW X1 2022 por R$ 179.900, com 70.700 km.",
    );
  });
  /** Até 14/09/2026 "…" não fechava frase, e a frase seguinte entrava na conta. */
  it("fecha a frase nas reticências", () => {
    expect(primeiraFraseDe("Jeep Compass Limited 2021… o SUV que passou pela seleção.")).toBe(
      "Jeep Compass Limited 2021…",
    );
  });
  /** A meta description junta as linhas; a medida junta também. */
  it("junta a quebra de linha sem ponto na mesma frase", () => {
    expect(primeiraFraseDe("Toyota Corolla XEi 2020\nO sedan que passou pela seleção. Aceita troca.")).toBe(
      "Toyota Corolla XEi 2020 O sedan que passou pela seleção.",
    );
  });
});

/**
 * A régua é a PRIMEIRA frase em 155 desde 14/09/2026 — decisão do dono, a
 * regra dos rascunhos de 17/08. Com as duas primeiras frases, o botão reprovava
 * quase tudo: 4 das 6 gerações registradas na Vercel em 13 e 14/09 deram 422.
 */
describe("regra: primeira frase em 155 caracteres", () => {
  it("reprova primeira frase maior que o corte do Google", () => {
    const longa = "A".repeat(LIMITE_META + 5) + ". Segunda.";
    expect(motivos(longa)).toContain("abertura");
  });
  it("diz no motivo quantos caracteres a primeira frase tem", () => {
    const longa = "A".repeat(LIMITE_META + 5) + ". Segunda.";
    const r = motivosCompletos(longa).find((x) => x.regra === "abertura");
    expect(r?.motivo).toBe(`A primeira frase tem ${LIMITE_META + 6} caracteres e o Google corta em ${LIMITE_META}.`);
  });
  it("aceita primeira frase dentro do limite", () => {
    expect(motivos("Honda NXR 160 Bros 2022. Passa por perícia independente.")).not.toContain("abertura");
  });
  /**
   * O que a decisão mudou: duas frases que somam mais de 155 passam quando a
   * primeira cabe. Pela régua de duas frases, este texto reprovava.
   */
  it("aceita duas frases que somam mais de 155 quando a primeira cabe", () => {
    const texto =
      "Chevrolet Onix 2021 prata, manual, com 51.000 km. Aceita troca e financiamento facilitado, com entrega combinada no showroom do Bacacheri, em Curitiba, sem pressa nenhuma.";
    expect(texto).toHaveLength(171);
    expect(motivos(texto)).not.toContain("abertura");
  });
  /**
   * O ponto de milhar DENTRO da primeira frase. Se ele fechasse a frase (o bug
   * de 08/09/2026), a medida seria "Honda Civic Touring 2018 por R$ 132." e o
   * texto passaria.
   */
  it("reprova primeira frase de 164 caracteres com preço e km em formato brasileiro", () => {
    const texto =
      "Honda Civic Touring 2018 por R$ 132.900, com 70.700 km, câmbio CVT, bancos confortáveis, central de mídia e rodas de liga leve, pronto para rodar muitos anos ainda. Aceita troca.";
    expect(primeiraFraseDe(texto)).toHaveLength(164);
    expect(motivos(texto)).toContain("abertura");
  });
  it("aceita primeira frase curta com preço e km em formato brasileiro", () => {
    const texto =
      "BMW X1 sDrive 20i 2022, por R$ 179.900, com 70.700 km rodados. Aceita troca e financiamento facilitado.";
    expect(motivos(texto)).not.toContain("abertura");
  });
  it("não mede a primeira frase no campo descricao", () => {
    const longa = "A".repeat(LIMITE_META + 5) + ". Segunda.";
    expect(motivos(longa)).toContain("abertura");
    expect(motivos(longa, SEM_NADA, "descricao")).not.toContain("abertura");
  });
});

/**
 * A régua contra TEXTO REAL: os 47 `descricao_seo` que o dono aprovou em
 * 17/08/2026 (`conteudo-seo/rascunhos*.json`). A régua de duas frases reprovava
 * 41. A da primeira frase reprova só estes três, e os três passam de 155 de
 * verdade (171, 181 e 162 caracteres).
 */
describe("régua da primeira frase contra os rascunhos aprovados em 17/08", () => {
  const pasta = join(__dirname, "..", "conteudo-seo");
  const rascunhos = readdirSync(pasta)
    .filter((f) => f.startsWith("rascunhos") && f.endsWith(".json"))
    .flatMap((f) =>
      Object.entries(JSON.parse(readFileSync(join(pasta, f), "utf-8")).textos as Record<string, string>),
    );

  it("lê os 47", () => {
    expect(rascunhos).toHaveLength(47);
  });

  it("reprova só os três cuja primeira frase passa de 155", () => {
    const reprovados = rascunhos
      .filter(([, texto]) => motivos(texto).includes("abertura"))
      .map(([id]) => id)
      .sort();
    expect(reprovados).toEqual(["7447739", "8059102", "8252763"]);
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

  /**
   * Revisão de 14/09/2026 (qa-guardian): as variações que a lista antiga não
   * pegava. "Consulte-nos para mais detalhes." já reprovava e fica como guarda
   * da exceção de "sem consulte-nos" logo abaixo.
   */
  it.each([
    "Acabamento luxuoso.",
    "Os melhores preços da cidade.",
    "Consulte condições.",
    "Exclusividade para você.",
    "Consulte-nos para mais detalhes.",
  ])("reprova a variação do vocabulário barrado: %s", (frase) => {
    expect(motivos(frase)).toContain("vocabulário");
  });

  /** A frase da casa, num rascunho aprovado pelo dono em 17/08 (8324691). */
  it("aceita 'sem consulte-nos'", () => {
    expect(motivos("Preço no anúncio, sem consulte-nos.")).not.toContain("vocabulário");
  });

  /**
   * "Exclusive" é nome de versão (Nissan Versa, Kicks, Sentra), não o chavão
   * "exclusivo". Com `exclusiv\w*`, o rascunho aprovado 8440875 reprovava
   * (revisão da tarefa, 15/09/2026).
   */
  it.each([
    "Nissan Versa 1.6 Exclusive 2022, azul, câmbio automático CVT.",
    "Nissan Kicks Exclusive com câmbio CVT.",
  ])("aceita o nome de versão Exclusive: %s", (frase) => {
    // Controle: o chavão "exclusivo" continua reprovando.
    expect(motivos("Carro exclusivo para você.")).toContain("vocabulário");
    expect(motivos(frase)).not.toContain("vocabulário");
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

  /**
   * Segunda ampliação (14/09/2026, qa-guardian): o verbo "vistoriou" e a frase
   * padrão do campo Laudo cautelar dita sem os substantivos passavam limpos.
   */
  it.each([
    ["vistoriou", "Nossa equipe vistoriou cada detalhe."],
    [
      "a frase padrão do laudo sem os substantivos",
      "Estrutura, chassi e histórico de sinistro auditados por empresa independente, credenciada junto ao Detran.",
    ],
    ["nada consta e documentação sem restrições", "Documentação sem restrições e nada consta."],
    ["nada consta sozinho", "Nada consta em nome do proprietário."],
    ["documentação sem restrições", "Documentação sem restrições."],
    ["aprovado na avaliação técnica", "Aprovado na avaliação técnica de 120 itens."],
    ["avaliação técnica aprovada", "Avaliação técnica de 120 itens, toda aprovada."],
    ["leilão", "Sem passagem por leilão."],
  ])("reprova por falar do que o laudo atesta: %s", (_caso, frase) => {
    expect(motivos(frase)).toContain("perícia");
  });

  /**
   * Guarda de regressão: "sem restrição" e "avaliação técnica" só contam presos
   * ao contexto do laudo. Soltos, são frase de venda.
   */
  it.each([
    "Avaliação do seu usado na hora.",
    "Fazemos avaliação técnica do seu usado na hora.",
    "Aceita troca sem restrição de ano.",
  ])("NÃO reprova — frase de venda com palavra vizinha do laudo: %s", (frase) => {
    expect(motivos(frase)).not.toContain("perícia");
  });

  /** O motivo nomeia o que o laudo atesta, como o prompt (revisão da tarefa, 15/09/2026). */
  it("o motivo da perícia nomeia auditado e avaliação técnica", () => {
    const r = motivosCompletos("Veículo auditado por profissionais antes da venda.");
    const motivo = r.find((x) => x.regra === "perícia")?.motivo ?? "";
    expect(motivo).toContain("auditado");
    expect(motivo).toContain("avaliação técnica");
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

  /**
   * Revisão de 14/09/2026 (qa-guardian). "O resultado do exame ainda não saiu"
   * passava. As outras já reprovavam e ficam como guarda: a revisão não pode
   * abrir "Veículo em análise" ao prender a regra ao contexto, nem "Aguardando
   * liberação da documentação" ao prender a aprovação e a liberação ao exame.
   */
  it.each([
    "O resultado do exame ainda não saiu.",
    "Veículo em análise.",
    "Aguardando o resultado do exame.",
    "Documentação pendente de transferência.",
    "Aguardando liberação da documentação.",
  ])("reprova: %s", (frase) => {
    expect(motivos(frase)).toContain("status interno");
  });

  /** Frases de venda que a regra antiga reprovava. */
  it.each([
    "Está aguardando você no showroom.",
    "Crédito em análise na hora.",
    "Financiamento em análise na hora, sem burocracia.",
    "Aguardando aprovação do financiamento, sem burocracia.",
    "Aguardando a aprovação do banco para liberar o carro.",
    "Aguardando liberação do crédito.",
  ])("NÃO reprova — frase de venda: %s", (frase) => {
    expect(motivos(frase)).not.toContain("status interno");
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

  /**
   * TERCEIRA REVISÃO (14/09/2026, qa-guardian): "todo o país" sem preposição e
   * lugar fora do recorte passavam. "Entrega em Santa Catarina inteira." já
   * reprovava e fica como guarda: Santa Catarina com palavra de entrega e sem
   * Balneário continua fora do recorte. "Entregamos em todos os estados."
   * também fica como guarda: a revisão de 15/09/2026 tirou "qualquer estado",
   * não os estados.
   */
  it.each([
    "Atendemos clientes de todo o país.",
    "Entregamos em São Paulo e no Rio Grande do Sul.",
    "Entrega em Florianópolis.",
    "Enviamos para outros estados.",
    "Entrega em Santa Catarina inteira.",
    "Entregamos em todos os estados.",
  ])("reprova alcance fora do recorte: %s", (frase) => {
    expect(motivos(frase)).toContain("alcance");
  });

  /**
   * As três primeiras reprovavam: Santa Catarina de procedência, "alcance" de
   * autonomia e "atendimento" de oficina. As outras são guarda: a região
   * metropolitana (São José dos Pinhais é dela), o litoral até Balneário e a
   * frase de alcance dos rascunhos aprovados pelo dono em 17/08. "Levamos seu
   * carro em qualquer estado." e "Atendemos com garantia nacional de peças."
   * reprovavam na primeira entrega desta tarefa (revisão de 15/09/2026).
   */
  it.each([
    "Veio de Santa Catarina com manual e chave reserva.",
    "Híbrido nacional com alcance de 600 km.",
    "Motor nacional, com peças e atendimento fáceis de achar.",
    "Entrega em Curitiba e região metropolitana.",
    "Entrega em São José dos Pinhais.",
    "Entrega em Joinville e Balneário Camboriú.",
    "Showroom no Bacacheri, em Curitiba; entregamos em todo o Paraná e no litoral catarinense até Balneário Camboriú.",
    "Levamos seu carro em qualquer estado.",
    "Atendemos com garantia nacional de peças.",
  ])("NÃO reprova: %s", (frase) => {
    expect(motivos(frase)).not.toContain("alcance");
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
