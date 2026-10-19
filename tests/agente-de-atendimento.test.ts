import { describe, expect, it } from "vitest";
import { FICHA_VAZIA, SINAIS_NEUTROS } from "../src/lib/aquecimento";
import {
  BALAO_SEM_PRECO,
  MAXIMO_DE_BALOES,
  catalogoParaOAgente,
  historicoParaOModelo,
  lerRespostaDoAgente,
  lerToque,
  montarInstrucoesFixas,
  montarMensagensDoAgente,
  valoresEmDinheiro,
  vigiarPreco,
} from "../src/lib/agenteDeAtendimento";
import type { Veiculo } from "../src/types";

/**
 * O agente (2026-10-20): o que ele lê e como a resposta dele é conferida
 * antes de sair para o cliente.
 */

const carro = (parcial: Partial<Veiculo>): Veiculo =>
  ({
    id: "8449096",
    marca: "Chevrolet",
    modelo: "Onix",
    versao: "LT 1.0 Turbo",
    ano: 2020,
    quilometragem: 48000,
    cambio: "Automático",
    combustivel: "Flex",
    cor: "Branco",
    preco_original: 79900,
    preco: 79900,
    opcionais: "Ar-condicionado, Câmera de ré, Multimídia",
    ...parcial,
  }) as Veiculo;

const configBase = { nome_do_assistente: "Ney", informar_preco: false, regras_da_loja: "" };

describe("o catálogo", () => {
  it("uma linha por carro, com id, ficha e opcionais — sem preço quando a loja não informa", () => {
    const texto = catalogoParaOAgente([carro({})], { comPreco: false });
    expect(texto).toContain("#8449096");
    expect(texto).toContain("Onix");
    expect(texto).toContain("48.000 km");
    expect(texto).toContain("opcionais: Ar-condicionado, Câmera de ré, Multimídia");
    expect(texto).not.toContain("R$");
  });

  it("com preço quando a configuração manda informar", () => {
    expect(catalogoParaOAgente([carro({})], { comPreco: true })).toContain("R$ 79.900");
  });

  it("catálogo vazio não vira 'não temos'", () => {
    expect(catalogoParaOAgente([], { comPreco: false })).toContain("Não diga que a loja não tem carros");
  });
});

describe("o prompt", () => {
  const instrucoes = montarInstrucoesFixas({
    config: configBase,
    nomeDaLoja: "Loja Teste",
    loja: "Endereço: Rua X",
    catalogo: "- #1 Carro",
    totalDoCatalogo: 1,
    geradoEm: "20/10/2026 10:00",
  });

  it("a parte fixa traz as regras de negócio do dono", () => {
    expect(instrucoes).toContain("Você é Ney");
    expect(instrucoes).toContain("Pergunte UM assunto por vez");
    expect(instrucoes).toContain("registre só o que o cliente DISSE");
    expect(instrucoes).toContain("Nunca diga que um financiamento foi ou será aprovado");
    expect(instrucoes).toContain("NÃO informe preço");
    expect(instrucoes).toContain("não diga que a loja não tem");
    expect(instrucoes).toContain("JSON");
  });

  it("informar preço muda a regra 5", () => {
    const comPreco = montarInstrucoesFixas({ config: { ...configBase, informar_preco: true }, nomeDaLoja: "L", loja: "", catalogo: "", totalDoCatalogo: 0, geradoEm: "" });
    expect(comPreco).toContain("PODE informar o preço anunciado");
    expect(comPreco).not.toContain("NÃO informe preço");
  });

  it("as regras da loja entram como seção própria, só quando existem", () => {
    expect(instrucoes).not.toContain("O que a loja quer que você saiba");
    const com = montarInstrucoesFixas({ config: { ...configBase, regras_da_loja: "Troca só até 2015." }, nomeDaLoja: "L", loja: "", catalogo: "", totalDoCatalogo: 0, geradoEm: "" });
    expect(com).toContain("## O que a loja quer que você saiba\nTroca só até 2015.");
  });

  it("a ordem é a conta do cache: fixo primeiro, conversa no meio, estado por último", () => {
    const msgs = montarMensagensDoAgente({
      instrucoes,
      historico: [
        { autor: "cliente", texto: "oi" },
        { autor: "assistente", texto: "Olá!" },
        { autor: "vendedor", autor_nome: "Ana", texto: "Sou a Ana" },
      ],
      estado: { ficha: FICHA_VAZIA, sinais: SINAIS_NEUTROS, nomeDoCliente: "Fulano", agora: "terça", lojaAberta: true, origem: null },
    });
    expect(msgs[0]).toEqual({ role: "system", content: instrucoes });
    expect(msgs.slice(1, 4).map((m) => m.role)).toEqual(["user", "assistant", "assistant"]);
    expect(msgs[3].content).toBe("[Consultor Ana] Sou a Ana");
    expect(msgs[4].role).toBe("system");
    expect(msgs[4].content).toContain("Estado atual");
  });

  it("mídia sem texto chega ao modelo dita", () => {
    const h = historicoParaOModelo([{ autor: "cliente", conteudo: "audio", texto: null }, { autor: "cliente", conteudo: "imagem", texto: "esse" }]);
    expect(h.map((m) => m.content)).toEqual(["(áudio, sem transcrição)", "(foto) esse"]);
  });
});

describe("a resposta do modelo, conferida", () => {
  it("lê o JSON combinado, inclusive dentro de cerca de código", () => {
    const r = lerRespostaDoAgente(
      '```json\n{"mensagens":["Tenho sim!","Quer fotos?"],"ficha":{"interesse":"Onix 2020","interesse_especifico":true,"pagamento":"financiado"},"sinais":{"quer_visitar":true},"resumo":"Quer Onix, financiado."}\n```',
    );
    expect(r).toMatchObject({
      mensagens: ["Tenho sim!", "Quer fotos?"],
      ficha: { interesse: "Onix 2020", interesse_especifico: true, pagamento: "financiado" },
      sinais: { quer_visitar: true, optout: false },
      resumo: "Quer Onix, financiado.",
    });
  });

  it("no máximo três balões", () => {
    const r = lerRespostaDoAgente(JSON.stringify({ mensagens: ["1", "2", "3", "4", "5"] }));
    expect(r!.mensagens).toHaveLength(MAXIMO_DE_BALOES);
  });

  it("sem mensagem ou fora do formato: nulo — e nada sai para o cliente", () => {
    expect(lerRespostaDoAgente("Olá! Como posso ajudar?")).toBeNull();
    expect(lerRespostaDoAgente(JSON.stringify({ mensagens: [] }))).toBeNull();
    expect(lerRespostaDoAgente(JSON.stringify({ ficha: {} }))).toBeNull();
  });

  it("o toque da cadência lê uma mensagem só", () => {
    expect(lerToque('{"mensagem":"Oi, Maria!"}')).toBe("Oi, Maria!");
    expect(lerToque("{}")).toBeNull();
  });
});

describe("a trava de preço", () => {
  it("lê dinheiro, e não quilometragem nem ano", () => {
    expect(valoresEmDinheiro("Onix 2020, 48 mil km, por R$ 79.900")).toEqual([79900]);
    expect(valoresEmDinheiro("entrada de 15 mil")).toEqual([15000]);
    expect(valoresEmDinheiro("R$ 1.500,00 por mês")).toEqual([1500]);
    expect(valoresEmDinheiro("dou 15000 de entrada", { numerosSoltos: true })).toEqual([15000]);
  });

  it("valor que o cliente não disse é barrado, uma frase padrão no lugar", () => {
    const r = vigiarPreco(["Tenho sim!", "Ele sai por R$ 79.900.", "E o HB20 por 65 mil."], ["tem onix?"], false);
    expect(r.mensagens).toEqual(["Tenho sim!", BALAO_SEM_PRECO]);
    expect(r.barrados).toBe(2);
  });

  it("repetir o que o cliente disse passa", () => {
    const r = vigiarPreco(["Com R$ 15.000 de entrada, dá sim para simular."], ["dou 15000 de entrada"], false);
    expect(r.barrados).toBe(0);
  });

  it("com informar_preco ligado, nada é barrado", () => {
    expect(vigiarPreco(["Sai por R$ 79.900."], [], true)).toEqual({ mensagens: ["Sai por R$ 79.900."], barrados: 0 });
  });
});
