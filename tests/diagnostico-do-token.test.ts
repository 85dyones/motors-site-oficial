import { describe, it, expect } from "vitest";
import { diagnosticarToken } from "../src/lib/diagnosticoDoToken";

/**
 * A pista do 401 (2026-10-09): o dono trocou o token três vezes e a porta do
 * Chatwoot seguiu recusando. Cada caso abaixo é um jeito de o MESMO valor
 * chegar estragado — e o último, o de dois valores diferentes de verdade.
 */

const SEGREDO = "k3Rv9mQ2xT7pL4wZ8nB6cF1hJ5sD0aYe";

describe("diagnosticarToken", () => {
  it("valor ausente ou vazio é sem_token", () => {
    expect(diagnosticarToken(null, SEGREDO).diagnostico).toBe("sem_token");
    expect(diagnosticarToken("", SEGREDO).diagnostico).toBe("sem_token");
  });

  it("a variável da Vercel com 'Bearer ' na frente é esperado_com_bearer", () => {
    expect(diagnosticarToken(SEGREDO, `Bearer ${SEGREDO}`).diagnostico).toBe("esperado_com_bearer");
  });

  it("a URL do Chatwoot com 'Bearer ' na frente é recebido_com_bearer", () => {
    expect(diagnosticarToken(`Bearer ${SEGREDO}`, SEGREDO).diagnostico).toBe("recebido_com_bearer");
  });

  it("espaço sobrando na URL é espacos_nas_pontas", () => {
    expect(diagnosticarToken(`${SEGREDO} `, SEGREDO).diagnostico).toBe("espacos_nas_pontas");
  });

  it("o + que a query transforma em espaço é mais_virou_espaco", () => {
    const comMais = "abc+def+ghi/jkl=";
    expect(diagnosticarToken("abc def ghi/jkl=", comMais).diagnostico).toBe("mais_virou_espaco");
  });

  it("o token colado já codificado é codificado_duas_vezes", () => {
    const comMais = "abc+def/ghi=";
    expect(diagnosticarToken(encodeURIComponent(comMais), comMais).diagnostico).toBe("codificado_duas_vezes");
  });

  it("um & ou # no meio corta o token: cortado_no_caminho", () => {
    const comE = "abcdefgh&ijklmnop";
    expect(diagnosticarToken("abcdefgh", comE).diagnostico).toBe("cortado_no_caminho");
  });

  it("um ?token=a de robô não vira 'cortado' por acaso", () => {
    expect(diagnosticarToken(SEGREDO.slice(0, 1), SEGREDO).diagnostico).toBe("diferente");
  });

  it("dois valores diferentes de verdade são diferente", () => {
    expect(diagnosticarToken("token-antigo-da-url", SEGREDO).diagnostico).toBe("diferente");
  });

  it("devolve tamanhos e a pista de caractere de URL, nunca o valor", () => {
    const pista = diagnosticarToken("outro-valor", "a+b/c=d&e");
    expect(pista).toEqual({
      diagnostico: "diferente",
      recebido_tamanho: 11,
      esperado_tamanho: 9,
      esperado_tem_caractere_de_url: true,
    });
    expect(JSON.stringify(pista)).not.toContain("a+b");
    expect(diagnosticarToken("x", SEGREDO).esperado_tem_caractere_de_url).toBe(false);
  });
});
