import { describe, it, expect } from "vitest";
import { refCurta, sufixoRef } from "../src/lib/telemetry";

/**
 * A referência visível nas mensagens de WhatsApp é apresentação, não rastreio.
 *
 * Até 2026-08-19 as mensagens pré-preenchidas terminavam com o ag_uid inteiro
 * — "(Ref: 0dcb1cdc-fb39-4a39-99c9-923f025619f4)" — um UUID de 36 caracteres
 * que o cliente lia na própria mensagem antes de enviar. Decisão do dono:
 * código curto. O ag_uid COMPLETO continua no JSON do webhook (`ag_uid`) e na
 * CAPI (`externalId`); os 8 primeiros caracteres bastam para casar de olho
 * com a nota do Chatwoot quando o lead chega sem par no /api/leads.
 */

describe("refCurta", () => {
  it("encurta o UUID para os 8 primeiros caracteres, em maiúsculas", () => {
    expect(refCurta("0dcb1cdc-fb39-4a39-99c9-923f025619f4")).toBe("0DCB1CDC");
  });

  it("recusa o placeholder de erro — código interno não vai para mensagem", () => {
    expect(refCurta("ag_ref_nao_localizado")).toBe("");
  });

  it("recusa o que não tem cara de UUID", () => {
    expect(refCurta("")).toBe("");
    expect(refCurta("qualquer-coisa")).toBe("");
  });

  it("fora do browser resolve para vazio, não estoura", () => {
    // Sem argumento cai em getActiveAgUid(), que sem window devolve o
    // placeholder — e o placeholder vira "".
    expect(refCurta()).toBe("");
  });
});

describe("sufixoRef", () => {
  it("monta o sufixo pronto para concatenar na mensagem", () => {
    expect(sufixoRef("0dcb1cdc-fb39-4a39-99c9-923f025619f4")).toBe(" (Ref: 0DCB1CDC)");
  });

  it("sem referência devolve vazio — a mensagem termina limpa, sem '(Ref: )'", () => {
    expect(sufixoRef("ag_ref_nao_localizado")).toBe("");
  });
});
