import { describe, it, expect } from "vitest";
import { checklistDoRepasse, termosProibidosEm, TERMOS_JURIDICOS_DO_REPASSE } from "../src/lib/checklistDoRepasse";
import { repasseDeTeste } from "./repasseDeTeste";

const campos = (faltas: { campo: string }[]) => faltas.map((f) => f.campo);

describe("termosProibidosEm — a regra do dono, com a borda certa", () => {
  it("pega 'girar' em qualquer passado/infinitivo, e 'gira' só quando negado", () => {
    expect(termosProibidosEm("Ficou parado, não girou no pátio")).toContain("girou");
    expect(termosProibidosEm("carro que nao gira")).toContain("girou");
    expect(termosProibidosEm("Demorou a girar")).toContain("girou");
    expect(termosProibidosEm("Girou pouco no pátio")).toContain("girou");
    expect(termosProibidosEm("Os dois não giraram")).toContain("girou");
    // "gira" no presente, sem "não", é texto legítimo — "o repasse gira rápido".
    expect(termosProibidosEm("O repasse gira rápido")).toEqual([]);
  });

  it("amplia o vocabulário de giro parado: sem giro, encalhado em qualquer forma", () => {
    expect(termosProibidosEm("sem giro")).toContain("sem giro");
    expect(termosProibidosEm("estava encalhado")).toContain("encalhado");
    expect(termosProibidosEm("encalhou no pátio")).toContain("encalhado");
    expect(termosProibidosEm("encalhada há semanas")).toContain("encalhado");
    expect(termosProibidosEm("tempo demais no pátio")).toContain("tempo demais no pátio");
  });

  it("pega porcentagem nas duas formas: símbolo e por extenso", () => {
    expect(termosProibidosEm("25% abaixo")).toContain("porcentagem");
    expect(termosProibidosEm("15 por cento abaixo da FIPE")).toContain("porcentagem");
  });

  it("pega 'X em dez' nas variantes, com a exceção de texto de manutenção", () => {
    expect(termosProibidosEm("de cada dez avaliados")).toContain("três em dez");
    expect(termosProibidosEm("3 em cada 10 carros")).toContain("três em dez");
    expect(termosProibidosEm("sete em dez")).toContain("três em dez");
    expect(termosProibidosEm("a cada dez avaliados")).toContain("três em dez");
    // Texto de manutenção precisa passar: não é a estatística de venda.
    expect(termosProibidosEm("troca de óleo a cada 10 mil km")).toEqual([]);
    expect(termosProibidosEm("revisão a cada 10.000 km")).toEqual([]);
  });

  it("pega CDC e direitos, que o dono mandou não citar", () => {
    expect(termosProibidosEm("Seus direitos continuam")).toContain("seus direitos");
    expect(termosProibidosEm("o CDC garante")).toContain("CDC");
    expect(termosProibidosEm("o cdc garante")).toContain("CDC");
    expect(termosProibidosEm("direitos do consumidor")).toContain("direitos do consumidor");
    expect(termosProibidosEm("Código de Defesa")).toContain("código de defesa");
    expect(termosProibidosEm("direito de arrependimento")).toContain("direito de arrependimento");
    expect(termosProibidosEm("garantia legal de 90 dias")).toContain("garantia legal");
    expect(termosProibidosEm("conforme a Lei 8.078")).toContain("Lei 8.078");
  });

  it("pega os rótulos antigos e o vocabulário que a casa evita", () => {
    expect(termosProibidosEm("fora do perfil da loja")).toContain("fora do perfil");
    expect(termosProibidosEm("veio em lote")).toContain("veio em lote");
    expect(termosProibidosEm("preço premium")).toContain("premium");
    expect(termosProibidosEm("melhor preço da região")).toContain("superlativo de preço");
  });

  it("não acusa texto legítimo que parece com o proibido", () => {
    expect(termosProibidosEm("Retrovisor direito quebrado")).toEqual([]);
    expect(termosProibidosEm("Porta traseira direita")).toEqual([]);
    expect(termosProibidosEm("O repasse gira rápido")).toEqual([]);
    expect(termosProibidosEm("condição de lote para lojista")).toEqual([]);
    expect(termosProibidosEm(null)).toEqual([]);
  });

  it("com a lista jurídica, só os termos jurídicos barram — o texto de venda passa direto", () => {
    expect(termosProibidosEm("Ventoinha do radiador não gira", TERMOS_JURIDICOS_DO_REPASSE)).toEqual([]);
    expect(termosProibidosEm("Pneus dianteiros com 30% de vida útil", TERMOS_JURIDICOS_DO_REPASSE)).toEqual([]);
    expect(termosProibidosEm("Alto-falante do som premium com chiado", TERMOS_JURIDICOS_DO_REPASSE)).toEqual([]);
    expect(termosProibidosEm("Seus direitos continuam", TERMOS_JURIDICOS_DO_REPASSE)).toContain("seus direitos");
  });
});

describe("checklistDoRepasse", () => {
  it("o repasse completo passa", () => {
    expect(checklistDoRepasse(repasseDeTeste())).toEqual([]);
  });

  it("exige o mínimo de fotos do estoque", () => {
    expect(campos(checklistDoRepasse(repasseDeTeste({ web_full_images: ["a", "b", "c"] })))).toContain("web_full_images");
  });

  it("exige carroceria e preço", () => {
    expect(campos(checklistDoRepasse(repasseDeTeste({ carroceria: null })))).toContain("carroceria");
  });

  it("exige o ano do modelo em intervalo válido", () => {
    expect(campos(checklistDoRepasse(repasseDeTeste({ ano_modelo: 0 })))).toContain("ano_modelo");
    expect(campos(checklistDoRepasse(repasseDeTeste({ ano_modelo: 2021.5 })))).toContain("ano_modelo");
    expect(checklistDoRepasse(repasseDeTeste({ ano_modelo: 2021 }))).toEqual([]);
  });

  it("exige FIPE com o mês", () => {
    expect(campos(checklistDoRepasse(repasseDeTeste({ fipe_valor: null })))).toContain("fipe_valor");
    expect(campos(checklistDoRepasse(repasseDeTeste({ fipe_mes_referencia: null })))).toContain("fipe_mes_referencia");
  });

  it("exige o laudo escolhido, e o texto do apontamento quando houver", () => {
    expect(campos(checklistDoRepasse(repasseDeTeste({ laudo: null })))).toContain("laudo");
    const semTexto = repasseDeTeste({ laudo: "aprovado_com_apontamento", laudo_apontamento: "  " });
    expect(campos(checklistDoRepasse(semTexto))).toContain("laudo_apontamento");
    const comTexto = repasseDeTeste({ laudo: "aprovado_com_apontamento", laudo_apontamento: "Repintura no para-choque traseiro" });
    expect(checklistDoRepasse(comTexto)).toEqual([]);
  });

  it("exige leilão e sinistro informados, com detalhe quando constam, e a data da consulta", () => {
    expect(campos(checklistDoRepasse(repasseDeTeste({ leilao_consta: null })))).toContain("leilao_consta");
    expect(campos(checklistDoRepasse(repasseDeTeste({ sinistro_consta: true, sinistro_detalhe: null })))).toContain("sinistro_detalhe");
    expect(campos(checklistDoRepasse(repasseDeTeste({ historico_consultado_em: null })))).toContain("historico_consultado_em");
  });

  it("exige resumo de até 140 caracteres e motivo", () => {
    expect(campos(checklistDoRepasse(repasseDeTeste({ resumo: "x".repeat(141) })))).toContain("resumo");
    expect(campos(checklistDoRepasse(repasseDeTeste({ motivo: null })))).toContain("motivo");
  });

  it("resumo com exatamente 140 caracteres passa; com 141, falha", () => {
    expect(checklistDoRepasse(repasseDeTeste({ resumo: "x".repeat(140) }))).toEqual([]);
    expect(campos(checklistDoRepasse(repasseDeTeste({ resumo: "x".repeat(141) })))).toContain("resumo");
  });

  it("ficha de estado: itens OU 'nenhum defeito conhecido', nunca os dois nem nenhum", () => {
    expect(campos(checklistDoRepasse(repasseDeTeste({ itens_de_estado: [], sem_defeitos_conhecidos: false })))).toContain("itens_de_estado");
    expect(campos(checklistDoRepasse(repasseDeTeste({ sem_defeitos_conhecidos: true })))).toContain("sem_defeitos_conhecidos");
    const semDefeitos = repasseDeTeste({ itens_de_estado: [], sem_defeitos_conhecidos: true, oficina_do_orcamento: null, orcamento_em: null });
    expect(checklistDoRepasse(semDefeitos)).toEqual([]);
  });

  it("todo defeito tem foto — é a promessa da página", () => {
    const r = repasseDeTeste();
    r.itens_de_estado[2] = { ...r.itens_de_estado[2], foto: null };
    expect(campos(checklistDoRepasse(r))).toContain("itens_de_estado[2].foto");
  });

  it("orçamento exige oficina e data", () => {
    expect(campos(checklistDoRepasse(repasseDeTeste({ oficina_do_orcamento: null })))).toContain("oficina_do_orcamento");
    expect(campos(checklistDoRepasse(repasseDeTeste({ orcamento_em: null })))).toContain("orcamento_em");
  });

  it("barra o texto digitado com termo proibido — o giro no resumo", () => {
    const r = repasseDeTeste({ resumo: "Bom carro, só não girou no pátio." });
    expect(checklistDoRepasse(r)).toContainEqual({
      campo: "resumo",
      mensagem: "O texto usa um termo que o repasse não usa: girou.",
    });
  });

  it("barra os termos de venda ampliados no resumo, e neles vale a exceção do giro no presente", () => {
    const frasesQueBarram = [
      "Não conseguiu girar na loja",
      "Demorou a girar",
      "Girou pouco no pátio",
      "Os dois não giraram",
      "Carro encalhou no pátio",
      "15 por cento abaixo da FIPE",
      "3 em cada 10 carros",
      "sete em dez",
      "a cada dez avaliados",
      "Falamos sobre direito de arrependimento",
      "Tem garantia legal de 90 dias",
    ];
    for (const frase of frasesQueBarram) {
      expect(campos(checklistDoRepasse(repasseDeTeste({ resumo: frase }))), frase).toContain("resumo");
    }

    const frasesQuePassam = ["O repasse gira rápido", "Retrovisor direito quebrado", "condição de lote para lojista"];
    for (const frase of frasesQuePassam) {
      expect(campos(checklistDoRepasse(repasseDeTeste({ resumo: frase }))), frase).not.toContain("resumo");
    }
  });

  it("a ficha de estado aceita texto de venda legítimo, mas continua barrando termo jurídico", () => {
    // A ficha é o documento que o comprador assina: "não gira", "30%" e
    // "premium" descrevem o defeito de verdade e precisam passar aqui, mesmo
    // sendo barrados em resumo/motivo.
    const semTermoJuridico = repasseDeTeste();
    semTermoJuridico.itens_de_estado[0] = { ...semTermoJuridico.itens_de_estado[0], descricao: "Ventoinha do radiador não gira" };
    semTermoJuridico.itens_de_estado[1] = { ...semTermoJuridico.itens_de_estado[1], descricao: "Pneus dianteiros com 30% de vida útil" };
    semTermoJuridico.itens_de_estado[2] = { ...semTermoJuridico.itens_de_estado[2], descricao: "Alto-falante do som premium com chiado" };
    expect(checklistDoRepasse(semTermoJuridico)).toEqual([]);

    const comTermoJuridico = repasseDeTeste();
    comTermoJuridico.itens_de_estado[0] = { ...comTermoJuridico.itens_de_estado[0], descricao: "Seus direitos continuam" };
    expect(campos(checklistDoRepasse(comTermoJuridico))).toContain("itens_de_estado[0].descricao");
  });

  it("ajusta o escopo antigo: 'Parado no pátio há meses' agora passa na ficha; a falta vem de termo jurídico", () => {
    const passaAgora = repasseDeTeste();
    passaAgora.itens_de_estado[0] = { ...passaAgora.itens_de_estado[0], descricao: "Parado no pátio há meses" };
    expect(campos(checklistDoRepasse(passaAgora))).not.toContain("itens_de_estado[0].descricao");

    const barraPorJuridico = repasseDeTeste();
    barraPorJuridico.itens_de_estado[0] = { ...barraPorJuridico.itens_de_estado[0], descricao: "CDC garante a troca" };
    expect(campos(checklistDoRepasse(barraPorJuridico))).toContain("itens_de_estado[0].descricao");
  });
});
