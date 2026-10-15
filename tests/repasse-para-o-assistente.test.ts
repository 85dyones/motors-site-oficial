import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";
import { montarRepasse } from "../src/lib/repasseParaOAssistente";
import { termosProibidosEm } from "../src/lib/checklistDoRepasse";
import { PERGUNTAS_DO_REPASSE, REPASSE_OU_ESTOQUE } from "../src/lib/paginaDoRepasse";
import { PRAZO_DA_GARANTIA } from "../src/lib/paginasInstitucionais";

/**
 * O Repasse Motors que o assistente do WhatsApp lê (14/10/2026).
 *
 * Pedido do dono: o Ney responde "sobre tudo, inclusive sobre a área de
 * repasse nova". No teste de 14/10, sem documento, ele inventou que o repasse
 * tinha "uma checagem mais simples". Este arquivo trava o que ele passa a ler.
 */

const ROTA = "src/app/api/ney/repasse/route.ts";
const MONTAGEM = "src/lib/repasseParaOAssistente.ts";
const fonte = lerCodigo(ROTA) + "\n" + lerCodigo(MONTAGEM);

const texto = montarRepasse("14/10/2026, 12:00:00");

describe("o arquivo não pode ser rastreável", () => {
  it("é servido como texto puro, com o motivo escrito", () => {
    expect(fonte).toMatch(/"Content-Type": "text\/plain; charset=utf-8"/);
    expect(ler(ROTA)).toMatch(/rastreia os/);
  });

  it("o conteúdo não tem marcação de link", () => {
    expect(texto).not.toMatch(/\]\(https?:/);
    expect(texto).not.toMatch(/<a\s/i);
  });
});

describe("nenhum carro, nenhum preço", () => {
  it("o lote muda toda semana: nada de valor nem de carro congelado", () => {
    expect(texto).not.toMatch(/R\$/);
    expect(texto).not.toMatch(/Ref\.: repasse [0-9a-f]{6}/);
    expect(texto).toMatch(/Não há carro, preço nem FIPE aqui, de propósito/);
  });

  it("e diz o que fazer com a referência que chega do site", () => {
    expect(texto).toMatch(/"Ref\.: repasse" e um código/);
    expect(texto).toMatch(/anote e passe ao consultor/);
  });
});

describe("o repasse não é o estoque", () => {
  it("o assistente é avisado de que a garantia é do estoque", () => {
    expect(texto).toMatch(/Nunca\s+diga que um carro do repasse tem garantia/);
  });

  it("a comparação lado a lado entra inteira, com a garantia do estoque pela constante", () => {
    for (const linha of REPASSE_OU_ESTOQUE.linhas) {
      expect(texto, linha.tema).toContain(`Repasse: ${linha.repasse}`);
    }
    expect(texto).toMatch(new RegExp(PRAZO_DA_GARANTIA, "i"));
  });
});

describe("a fonte é a mesma que o site publica", () => {
  it("as onze perguntas da página entram, com a resposta do site", () => {
    expect(PERGUNTAS_DO_REPASSE.length).toBe(11);
    for (const item of PERGUNTAS_DO_REPASSE) {
      expect(texto, item.pergunta).toContain(item.pergunta);
      expect(texto, item.pergunta).toContain(item.resposta);
    }
  });

  it("os textos saem dos módulos da página, não copiados", () => {
    for (const nome of ["HEROI_DO_REPASSE", "PROVAS_DO_REPASSE", "CONTA_ABERTA", "COMO_COMPRAR", "LISTA_DO_REPASSE", "PERGUNTAS_DO_REPASSE"]) {
      expect(fonte, nome).toMatch(new RegExp(nome));
    }
  });

  it("e obedece às regras do dono para o repasse", () => {
    // Nada de "não girou", CDC, "consumidor", porcentagem, "três em dez"... A
    // régua é a mesma que trava o texto da página.
    expect(termosProibidosEm(texto)).toEqual([]);
  });
});

describe("cabe no teto do Captain", () => {
  it("com folga, em bytes", () => {
    // O Captain corta em 15000 BYTES; acento ocupa dois.
    expect(Buffer.byteLength(texto, "utf8")).toBeLessThanOrEqual(14000);
  });

  it("e avisa em vez de encolher calado", () => {
    expect(fonte).toMatch(/Este arquivo passou do limite que o Chatwoot guarda/);
  });
});
