import { describe, it, expect } from "vitest";
import robots from "../src/app/robots";

/**
 * Os grupos do robots.txt NÃO se somam.
 *
 * O protocolo manda o rastreador obedecer a UM grupo: o mais específico que
 * casa com o próprio user-agent. Um `Disallow` escrito no grupo `*` não vale
 * para o `GPTBot` se existir um grupo `GPTBot` — o bot lê o dele e ignora o
 * resto do arquivo.
 *
 * Foi assim que `/api/` e `/test` ficaram fechados para o Google e ABERTOS
 * para os bots de IA (medido em produção em 2026-09-08): o grupo de IA nasceu
 * em 2026-08 para LIBERAR `/llms.txt`, herdou uma cópia parcial da lista de
 * bloqueios e nunca acompanhou as entradas que o grupo `*` ganhou depois.
 *
 * A regra que este arquivo trava é a única que sobrevive a esse esquecimento:
 * **o grupo de IA bloqueia tudo que o `*` bloqueia**. O que ele pode ter a
 * mais é liberação — e ela é o motivo de o grupo existir.
 */

/** O `disallow` de um grupo, sempre como lista. */
function bloqueios(regra: { disallow?: string | string[] }): string[] {
  const d = regra.disallow ?? [];
  return Array.isArray(d) ? d : [d];
}

function liberacoes(regra: { allow?: string | string[] }): string[] {
  const a = regra.allow ?? [];
  return Array.isArray(a) ? a : [a];
}

/** Um user-agent que casa com este grupo? Serve para achar os dois grupos. */
function agentes(regra: { userAgent?: string | string[] }): string[] {
  const u = regra.userAgent ?? [];
  return Array.isArray(u) ? u : [u];
}

const regras = (() => {
  const r = robots().rules;
  return Array.isArray(r) ? r : [r];
})();

const grupoCoringa = regras.find((r) => agentes(r).includes("*"));
const grupoDeIa = regras.find((r) => agentes(r).some((a) => a !== "*"));

describe("o grupo de bots de IA não fica mais aberto que o grupo geral", () => {
  it("os dois grupos existem", () => {
    // Sem os dois, os casos abaixo passariam por vacuidade.
    expect(grupoCoringa, "não há grupo `*` no robots.txt").toBeDefined();
    expect(grupoDeIa, "não há grupo nomeado de bots de IA").toBeDefined();
    expect(agentes(grupoDeIa!).length).toBeGreaterThan(0);
  });

  it("todo caminho bloqueado no grupo `*` também está bloqueado no de IA", () => {
    const geral = bloqueios(grupoCoringa!);
    const ia = bloqueios(grupoDeIa!);

    expect(geral.length).toBeGreaterThan(0);
    for (const caminho of geral) {
      expect(ia, `\`${caminho}\` está fechado para o Google e aberto para os bots de IA`).toContain(
        caminho,
      );
    }
  });

  it("a API e o harness de teste estão fechados para os bots de IA", () => {
    // Os dois casos concretos que a medição de 08/09 achou. Ficam explícitos
    // além da regra geral acima: se alguém reescrever o grupo `*`, estes dois
    // continuam sendo cobrados aqui.
    expect(bloqueios(grupoDeIa!)).toContain("/api/");
    expect(bloqueios(grupoDeIa!)).toContain("/test");
  });

  it("as duas liberações que justificam o grupo continuam de pé", () => {
    // Regra mais específica vence regra mais geral dentro do MESMO grupo — é o
    // que deixa `/llms.txt` passar apesar do `/api/` fechado logo acima.
    // Perder estas duas linhas é perder o motivo de o grupo existir.
    const abertos = liberacoes(grupoDeIa!);

    expect(abertos).toContain("/llms.txt");
    expect(abertos).toContain("/api/llms-full.txt");
  });

  it("o llms.txt liberado não é anulado por um bloqueio de mesma especificidade", () => {
    // `/llms.txt` no `allow` e `/llms.txt` no `disallow` do mesmo grupo é
    // empate, e empate o Google resolve pelo menos restritivo — mas depender
    // disso é frágil. Simplesmente não pode aparecer nos dois.
    for (const aberto of liberacoes(grupoDeIa!)) {
      expect(bloqueios(grupoDeIa!)).not.toContain(aberto);
    }
  });
});
