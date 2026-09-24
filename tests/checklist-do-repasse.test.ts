import { describe, it, expect } from "vitest";
import { checklistDoRepasse, termosProibidosEm } from "../src/lib/checklistDoRepasse";
import { repasseDeTeste } from "./repasseDeTeste";

const campos = (faltas: { campo: string }[]) => faltas.map((f) => f.campo);

describe("termosProibidosEm — a regra do dono, com a borda certa", () => {
  it("pega o 'não girou' em todas as formas que alguém digitaria", () => {
    expect(termosProibidosEm("Ficou parado, não girou no pátio")).toContain("não girou");
    expect(termosProibidosEm("carro que nao gira")).toContain("não girou");
    expect(termosProibidosEm("estava encalhado")).toContain("encalhado");
    expect(termosProibidosEm("tempo demais no pátio")).toContain("tempo demais no pátio");
  });

  it("pega CDC e direitos, que o dono mandou não citar", () => {
    expect(termosProibidosEm("Seus direitos continuam")).toContain("seus direitos");
    expect(termosProibidosEm("o CDC garante")).toContain("CDC");
    expect(termosProibidosEm("o cdc garante")).toContain("CDC");
    expect(termosProibidosEm("direitos do consumidor")).toContain("direitos do consumidor");
    expect(termosProibidosEm("Código de Defesa")).toContain("código de defesa");
  });

  it("pega os rótulos antigos e o vocabulário que a casa evita", () => {
    expect(termosProibidosEm("fora do perfil da loja")).toContain("fora do perfil");
    expect(termosProibidosEm("veio em lote")).toContain("veio em lote");
    expect(termosProibidosEm("preço premium")).toContain("premium");
    expect(termosProibidosEm("25% abaixo")).toContain("porcentagem");
    expect(termosProibidosEm("de cada dez avaliados")).toContain("três em dez");
  });

  it("não acusa texto legítimo que parece com o proibido", () => {
    expect(termosProibidosEm("Retrovisor direito quebrado")).toEqual([]);
    expect(termosProibidosEm("Porta traseira direita")).toEqual([]);
    expect(termosProibidosEm("O repasse gira rápido")).toEqual([]);
    expect(termosProibidosEm("condição de lote para lojista")).toEqual([]);
    expect(termosProibidosEm(null)).toEqual([]);
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

  it("barra o texto digitado com termo proibido — o 'não girou' no resumo", () => {
    const r = repasseDeTeste({ resumo: "Bom carro, só não girou no pátio." });
    expect(checklistDoRepasse(r)).toContainEqual({
      campo: "resumo",
      mensagem: "O texto usa um termo que o repasse não usa: não girou.",
    });
  });

  it("barra termo proibido também na descrição de um defeito", () => {
    const r = repasseDeTeste();
    r.itens_de_estado[0] = { ...r.itens_de_estado[0], descricao: "Parado no pátio há meses" };
    expect(campos(checklistDoRepasse(r))).toContain("itens_de_estado[0].descricao");
  });
});
