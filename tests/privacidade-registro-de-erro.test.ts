import { describe, it, expect } from "vitest";
import { ler } from "./fonte";

/**
 * A declaração que torna a coleta de erro legítima.
 *
 * ---------------------------------------------------------------------------
 * Por que isto é uma trava, e não um parágrafo qualquer
 * ---------------------------------------------------------------------------
 * A tabela `erros` guarda, por 90 dias, a página visitada, o navegador e o
 * `ag_uid` — que a própria migração descreve como *"o elo com o lead"*. Antes
 * desta declaração, a `/privacidade` afirmava, sem qualquer ressalva:
 *
 *   *"Atendido o pedido, o registro é apagado — não fica cópia em nossa base."*
 *
 * Isso deixaria de ser verdade no instante em que a coleta fosse ligada: o
 * titular pede eliminação, o cadastro de contato some, e a linha técnica de
 * erro segue com o identificador de navegação dele até a janela fechar.
 *
 * A §2.3 do spec de observabilidade exigia a declaração **no mesmo PR que liga
 * o envio**. Ela quase não foi cumprida: o parágrafo tinha sido empurrado para
 * depois enquanto o interruptor ficava no PR anterior — separando a coleta da
 * declaração, que é exatamente o que a regra proibia.
 *
 * Esta trava existe para que a remoção do parágrafo seja barulhenta. Política
 * de privacidade que descreve menos do que o sistema faz não é imprecisão: é a
 * base legal do tratamento caindo.
 */

const POLITICA = "src/app/privacidade/page.tsx";

describe("a política declara o registro técnico de erro", () => {
  const texto = ler(POLITICA);

  it("a FINALIDADE está declarada", () => {
    /* Sem finalidade declarada não há base legal — e o `legítimo interesse`
       que sustenta diagnóstico técnico exige que a pessoa consiga saber que
       ele existe. */
    expect(texto, "a finalidade de diagnóstico sumiu da política").toMatch(
      /Consertar o que quebra/,
    );
  });

  it("diz o que o registro CONTÉM, e o que não contém", () => {
    expect(texto).toMatch(/mensagem técnica do erro/);
    expect(texto).toMatch(/identificador anônimo de navegação/);
    // O que NÃO contém importa tanto quanto: é a diferença entre diagnóstico e
    // vigilância de formulário.
    expect(texto, "a política precisa dizer que o conteúdo do formulário fica de fora").toMatch(
      /não guarda o que\s+você digitou em formulários|não o conteúdo dos formulários/,
    );
  });

  it("o PRAZO de 90 dias está escrito", () => {
    /* O número é o que transforma "guardamos" em promessa verificável — e é o
       mesmo do default de `limpar_erros_antigos`. Se um mudar sem o outro, a
       política mente. */
    expect(texto).toMatch(/90 dias/);
  });

  it("a promessa de eliminação foi QUALIFICADA, não mantida como estava", () => {
    /* A frase absoluta não pode voltar: ela é falsa enquanto a tabela de erro
       existir. */
    expect(texto, "a promessa absoluta voltou — e ela é falsa").not.toMatch(
      /o registro é apagado — não fica cópia em nossa base/,
    );
    expect(texto, "a ressalva sobre o registro técnico sumiu").toMatch(
      /pode conter o identificador anônimo de navegação e permanecer/,
    );
  });
});
