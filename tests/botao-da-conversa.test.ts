import { describe, it, expect } from "vitest";
import { destinoDaConversa, linkDeConversa } from "../src/lib/funil";

/**
 * O botão de conversa do card do kanban.
 *
 * Desde 21/10/2026 o Chatwoot saiu dos processos da Motors (*"tudo vira
 * painel"*): o card leva à conversa no painel (lead com conversa pelo WhatsApp
 * da loja) ou ao WhatsApp (sem conversa). O que estes testes seguram é o
 * DEGRAU: o lead recém-chegado — o que mais precisa de abordagem — não tem
 * conversa, e não pode ficar sem botão.
 */
describe("o botão de conversa: o painel quando há conversa, o WhatsApp quando não", () => {
  it("lead com conversa pelo WhatsApp da loja: a conversa no painel", () => {
    expect(destinoDaConversa("41999990000", true)).toBe("painel");
  });

  it("lead sem conversa cai no WhatsApp — é o caso do lead recém-chegado", () => {
    expect(linkDeConversa("41999990000")).toBe("https://wa.me/5541999990000");
    expect(destinoDaConversa("41999990000", false)).toBe("whatsapp");
    expect(destinoDaConversa("41999990000", null)).toBe("whatsapp");
  });

  it("a mensagem pré-escrita continua viajando no WhatsApp", () => {
    const url = linkDeConversa("41999990000", "Olá, tudo bem?");
    expect(url).toBe("https://wa.me/5541999990000?text=Ol%C3%A1%2C%20tudo%20bem%3F");
  });

  it("sem número, não há botão — nem com conversa", () => {
    expect(linkDeConversa("")).toBe("");
    expect(linkDeConversa(null)).toBe("");
    expect(destinoDaConversa(null, null)).toBe("nenhum");
    expect(destinoDaConversa("", true)).toBe("nenhum");
  });
});

