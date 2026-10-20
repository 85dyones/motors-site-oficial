import { describe, expect, it } from "vitest";
import {
  acoesDisponiveis,
  fotoDaMensagem,
  horaDaMensagem,
  lerConversaDaApi,
  linhaDaCadencia,
  linhasDaFicha,
  marcasDaMensagem,
  quemEscreveu,
  seloDaTemperatura,
  situacaoDoAssistente,
  textoDaMensagem,
} from "../src/lib/atendimentoNaTela";

/**
 * O que a aba de atendimento do lead diz (2026-10-20), em funções puras.
 */

const AGORA = new Date("2026-10-20T13:00:00Z");

describe("a leitura da rota", () => {
  it("resposta torta vira vazio, e a aba não derruba o detalhe", () => {
    expect(lerConversaDaApi({ lead: { id: "x" } })).toEqual({ atendimento: null, mensagens: [], retratos: [], assistente: null, migracaoPendente: false, aviso: undefined });
    expect(lerConversaDaApi(null).mensagens).toEqual([]);
    expect(lerConversaDaApi({ mensagens: [{ id: "a" }, null, { texto: "sem id" }] }).mensagens).toHaveLength(1);
  });
});

describe("a conversa", () => {
  it("quem escreveu", () => {
    expect(quemEscreveu({ autor: "cliente", autor_nome: "Rafael" }, "Ney")).toBe("Cliente");
    expect(quemEscreveu({ autor: "assistente", autor_nome: null }, "Ney")).toBe("Ney · assistente");
    expect(quemEscreveu({ autor: "vendedor", autor_nome: "Carla" }, "Ney")).toBe("Carla");
  });

  it("mídia sem legenda aparece dita", () => {
    expect(textoDaMensagem({ conteudo: "audio", texto: null })).toBe("[Áudio]");
    expect(textoDaMensagem({ conteudo: "imagem", texto: "esse" })).toBe("[Foto] esse");
    expect(textoDaMensagem({ conteudo: "texto", texto: "oi" })).toBe("oi");
  });

  it("a foto do carro: a tela mostra a foto, a legenda e a camada; endereço que não é http não vira imagem", () => {
    const m = { conteudo: "imagem" as const, texto: "Painel digital", midia_url: "https://f.teste/1.jpg", camada: "interior", gatilho: "resposta", situacao: "enviada" as const };
    expect(fotoDaMensagem(m)).toBe("https://f.teste/1.jpg");
    expect(textoDaMensagem(m)).toBe("Painel digital");
    expect(marcasDaMensagem(m)).toEqual(["foto · interior"]);
    expect(textoDaMensagem({ ...m, texto: null })).toBe("");
    expect(fotoDaMensagem({ midia_url: "javascript:alert(1)" })).toBeNull();
    expect(marcasDaMensagem({ ...m, camada: null })).toEqual(["foto"]);
  });

  it("marcas: cadência, passagem, celular, enviando, não saiu", () => {
    expect(marcasDaMensagem({ gatilho: "cadencia", situacao: "falhou" })).toEqual(["cadência", "não saiu"]);
    expect(marcasDaMensagem({ gatilho: "resposta", situacao: "enviada" })).toEqual([]);
  });

  it("hora da loja: só a hora hoje, com a data em outro dia", () => {
    expect(horaDaMensagem("2026-10-20T12:30:00Z", AGORA)).toBe("09:30");
    expect(horaDaMensagem("2026-10-18T12:30:00Z", AGORA)).toBe("18/10 09:30");
  });
});

describe("o estado do assistente", () => {
  const base = { assistente_fase: null, aviso_de_entrega_para: null, entregue_em: null, optout_em: null, cadencia: null } as const;
  const ligado = { ativo: true, nome: "Ney" };

  it("cada fase numa frase", () => {
    expect(situacaoDoAssistente({ ...base, assistente_fase: "qualificando" }, ligado)).toBe("Ney está atendendo");
    expect(situacaoDoAssistente({ ...base, assistente_fase: "qualificando" }, { ...ligado, ativo: false })).toContain("desligado");
    expect(situacaoDoAssistente({ ...base, assistente_fase: "pausado" }, ligado)).toBe("Ney pausado: a equipe atende");
    expect(situacaoDoAssistente({ ...base, assistente_fase: "entregue", aviso_de_entrega_para: "Carla", entregue_em: "2026-10-20T12:00:00Z" }, ligado, AGORA.getTime())).toBe(
      "Entregue a Carla há 1 h",
    );
    expect(situacaoDoAssistente({ ...base, assistente_fase: "entregue", entregue_em: "2026-10-20T12:00:00Z" }, ligado, AGORA.getTime())).toContain("o resumo sai na abertura");
    expect(situacaoDoAssistente({ ...base, optout_em: "2026-10-20T12:00:00Z" }, ligado)).toBe("O cliente pediu para não receber mensagens");
  });

  it("os botões de cada fase", () => {
    expect(acoesDisponiveis({ assistente_fase: "qualificando", optout_em: null })).toEqual(["entregar", "pausar"]);
    expect(acoesDisponiveis({ assistente_fase: "entregue", optout_em: null })).toEqual(["devolver"]);
    expect(acoesDisponiveis({ assistente_fase: "pausado", optout_em: null })).toEqual(["retomar", "devolver"]);
    expect(acoesDisponiveis({ assistente_fase: "pausado", optout_em: "x" })).toEqual([]);
    // Lead que o assistente nunca pegou: nada a retomar.
    expect(acoesDisponiveis({ assistente_fase: null, optout_em: null })).toEqual([]);
  });
});

describe("resumo e aquecimento", () => {
  it("a ficha na ordem do método (os 5P), com o não dito vazio", () => {
    const linhas = linhasDaFicha({
      ficha: { interesse: "Onix", pagamento: "financiado", prazo: "imediato", troca: "sem troca", visita_data: "2026-10-24", visita_hora: "10:00" },
    });
    expect(linhas.map((l) => l.rotulo)).toEqual([
      "Nome",
      "Procura",
      "Uso",
      "Quer investir",
      "Pagamento",
      "Entrada",
      "Parcela",
      "Carro na troca",
      "Quem decide",
      "Prazo",
      "Visita",
      "Cidade",
    ]);
    const valor = (rotulo: string) => linhas.find((l) => l.rotulo === rotulo)!.valor;
    expect(valor("Procura")).toBe("Onix");
    expect(valor("Quer investir")).toBeNull();
    expect(valor("Pagamento")).toBe("Financiado");
    expect(valor("Carro na troca")).toBe("não tem");
    expect(valor("Prazo")).toBe("Imediato (até 15 dias)");
    expect(valor("Visita")).toBe("sábado, 24/10, às 10h");
  });

  it("o selo e a cadência", () => {
    expect(seloDaTemperatura("quente", 82)).toBe("Quente · 82");
    expect(seloDaTemperatura(null, 82)).toBeNull();
    expect(linhaDaCadencia({ cadencia: "follow_up", cadencia_passo: 1, cadencia_proximo_em: "2026-10-22T12:00:00Z" }, 3, AGORA)).toBe(
      "Follow-up · toque 2 de 3 · próximo 22/10 09:00",
    );
    expect(linhaDaCadencia({ cadencia: "reativacao", cadencia_passo: 3, cadencia_proximo_em: null }, 3, AGORA)).toBe("Reativação · concluída (3 de 3)");
    expect(linhaDaCadencia({ cadencia: null, cadencia_passo: 0, cadencia_proximo_em: null }, 3, AGORA)).toBeNull();
  });
});
