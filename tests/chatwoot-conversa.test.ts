import { describe, it, expect } from "vitest";
import {
  baseDoChatwoot,
  chatwootConfigurado,
  contaDoChatwoot,
  linkDaConversa,
} from "../src/lib/chatwoot";
import { destinoDaConversa, linkDeConversa } from "../src/lib/funil";

/**
 * O botão de conversa do card do kanban.
 *
 * Decisão do dono em 2026-08-31: guardar o id da conversa e levar o consultor
 * para dentro do Chatwoot, em vez de `wa.me` — que fazia ele responder pelo
 * WhatsApp pessoal, sem a conversa ficar registrada.
 *
 * O que estes testes seguram é o DEGRAU. Conversa de WhatsApp no Chatwoot só
 * nasce quando o cliente escreve, então o lead recém-chegado — o que mais
 * precisa de abordagem — não tem conversa. Se alguém "simplificar" isto para
 * só Chatwoot, o caso mais comum fica sem botão nenhum.
 */

const CONFIG = { url: "https://app.chat.exemplo.com.br", conta: "3" };

describe("o endereço da conversa", () => {
  it("monta o caminho que o Chatwoot usa", () => {
    expect(linkDaConversa(4821, CONFIG)).toBe(
      "https://app.chat.exemplo.com.br/app/accounts/3/conversations/4821",
    );
  });

  it("aceita o id como string, que é como ele chega do banco", () => {
    expect(linkDaConversa("4821", CONFIG)).toContain("/conversations/4821");
  });

  it("sem protocolo, assume https em vez de gerar link relativo", () => {
    // Sem isto o href vira relativo ao painel e abre a 404 do Next — pior que
    // não ter link, porque parece que a conversa sumiu.
    expect(linkDaConversa(7, { url: "app.chat.exemplo.com.br", conta: "3" })).toBe(
      "https://app.chat.exemplo.com.br/app/accounts/3/conversations/7",
    );
  });

  it("barra sobrando no fim não vira barra dupla", () => {
    expect(linkDaConversa(7, { url: "https://x.com.br///", conta: "3" })).toBe(
      "https://x.com.br/app/accounts/3/conversations/7",
    );
  });

  it("id que não é inteiro positivo devolve vazio", () => {
    // `/conversations/undefined` responde 200 com tela vazia — o pior dos dois
    // mundos, porque não parece erro.
    for (const ruim of [null, undefined, "", "abc", "0", "-4", "1.5", "4821x"]) {
      expect(linkDaConversa(ruim as never, CONFIG), `aceitou ${String(ruim)}`).toBe("");
    }
  });

  it("sem configuração, devolve vazio em vez de link quebrado", () => {
    expect(linkDaConversa(4821, { url: "", conta: "3" })).toBe("");
    expect(linkDaConversa(4821, { url: CONFIG.url, conta: "" })).toBe("");
    expect(linkDaConversa(4821, { url: CONFIG.url, conta: "abc" })).toBe("");
  });

  it("os auxiliares dizem o que está configurado", () => {
    expect(baseDoChatwoot({ url: "https://x.com.br/" })).toBe("https://x.com.br");
    expect(contaDoChatwoot({ conta: " 3 " })).toBe("3");
    expect(contaDoChatwoot({ conta: "tres" })).toBe("");
    expect(chatwootConfigurado(CONFIG)).toBe(true);
    expect(chatwootConfigurado({ url: "", conta: "3" })).toBe(false);
  });
});

describe("o degrau: Chatwoot quando existe, WhatsApp quando não", () => {
  // Sem env no ambiente de teste, `linkDaConversa` interno devolve "" e o
  // degrau cai no wa.me. É exatamente o comportamento de uma instalação sem
  // Chatwoot configurado — a falta de configuração degrada, não quebra.
  it("sem Chatwoot configurado, continua abrindo o WhatsApp", () => {
    expect(linkDeConversa("41999990000", undefined, 4821)).toBe("https://wa.me/5541999990000");
    expect(destinoDaConversa("41999990000", 4821)).toBe("whatsapp");
  });

  it("lead sem conversa cai no WhatsApp — é o caso do lead recém-chegado", () => {
    expect(linkDeConversa("41999990000", undefined, null)).toBe("https://wa.me/5541999990000");
    expect(destinoDaConversa("41999990000", null)).toBe("whatsapp");
  });

  it("a mensagem pré-escrita continua viajando no WhatsApp", () => {
    // Ela foi pedida pelo dono como "atalho para FALAR". O Chatwoot não aceita
    // texto na URL, e é por isso que `destinoDaConversa` existe: a tela não
    // pode prometer uma mensagem que só um dos dois caminhos entrega.
    const url = linkDeConversa("41999990000", "Olá, tudo bem?");
    expect(url).toBe("https://wa.me/5541999990000?text=Ol%C3%A1%2C%20tudo%20bem%3F");
  });

  it("sem número e sem conversa, não há botão", () => {
    expect(linkDeConversa("", undefined, null)).toBe("");
    expect(linkDeConversa(null)).toBe("");
    expect(destinoDaConversa(null, null)).toBe("nenhum");
  });

  it("id inválido não engole o WhatsApp", () => {
    // Se um id corrompido fizesse o Chatwoot "ganhar" o degrau devolvendo algo
    // não-vazio, o vendedor perderia o único caminho que funciona.
    for (const ruim of ["", "abc", "0", "-1"]) {
      expect(linkDeConversa("41999990000", undefined, ruim)).toBe("https://wa.me/5541999990000");
    }
  });
});
