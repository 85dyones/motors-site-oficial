import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";

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

/**
 * ⚠️ `lerCodigo`, e NÃO `ler` — a primeira versão usou `ler` e a revisão
 * derrubou a trava inteira com uma mutação de duas linhas.
 *
 * `ler` devolve o arquivo COM comentários (`tests/fonte.ts:20`). E o comentário
 * que este PR escreveu logo acima do parágrafo cita "90 dias" duas vezes, para
 * explicar por que o número está ali. Resultado medido: trocar as duas
 * ocorrências VISÍVEIS para "30 dias" deixava a suíte cheia verde — 2684
 * testes passando com a política dizendo um prazo e o banco outro.
 *
 * É a armadilha que `tests/fonte.ts` existe para desarmar, e que o cabeçalho
 * dele descreve com todas as letras: a nota que explica uma regra quase sempre
 * CITA o que a regra guarda. Escrevi a nota e caí nela no mesmo dia.
 */
describe("a política declara o registro técnico de erro", () => {
  const texto = lerCodigo(POLITICA);

  it("a FINALIDADE está declarada", () => {
    /* Sem finalidade declarada não há base legal — e o `legítimo interesse`
       que sustenta diagnóstico técnico exige que a pessoa consiga saber que
       ele existe. */
    expect(texto, "a finalidade de diagnóstico sumiu da política").toMatch(
      /Consertar o que quebra/,
    );
  });

  it("a ENUMERAÇÃO cobre o que a tabela guarda de verdade", () => {
    /* A primeira versão listava "mensagem, página, navegador, identificador" e
       parava aí. A tabela também guarda `stack` — que é onde a mensagem inteira
       reaparece —, `metodo` e `release`. Política que enumera MENOS do que o
       sistema guarda descreve outro tratamento, não o nosso. */
    expect(texto).toMatch(/rastreamento do erro/);
    expect(texto).toMatch(/identificador anônimo de navegação/);
    expect(texto).toMatch(/navegador/);
    expect(texto).toMatch(/método/);
    expect(texto).toMatch(/versão do site/);
  });

  it("NÃO afirma de forma absoluta o que o sistema não garante", () => {
    /* Bloqueio da revisão de 11/09, e é o mais sério deste PR.

       `higienizar` mascara e-mail e corrida de 8+ dígitos (telefone, CPF,
       CNPJ). NOME não é mascarado — e um erro do PostgREST como
       `Key (nome)=(Maria da Silva) already exists` atravessa inteiro e fica 90
       dias na linha. O próprio `comment on table` da migração diz isso: "a
       higienização é da APLICAÇÃO, o banco não garante".

       Então "não tem seu nome nem seu telefone" era falso, e "não guarda o que
       você digitou" também: o valor citado pelo banco VEM do que a pessoa
       digitou. A forma honesta é compromisso de esforço mais a ressalva — que
       é como a migração já se descreve. */
    for (const absoluta of [
      /não tem seu nome nem seu telefone/,
      /não guarda o que\s+você digitou em formulários/,
      /não o conteúdo dos formulários/,
    ]) {
      expect(texto, `afirmação absoluta voltou: ${absoluta}`).not.toMatch(absoluta);
    }

    // O compromisso de esforço, e a ressalva que o acompanha.
    expect(texto).toMatch(/mascaramos telefone, CPF, CNPJ e e-mail antes de gravar/);
    expect(texto, "a ressalva sobre o valor citado pelo banco sumiu").toMatch(
      /pode citar um valor por acidente/,
    );
  });

  it("o PRAZO de 90 dias está escrito, e tem executor", () => {
    /* O número é o mesmo do default de `limpar_erros_antigos`. Se um mudar sem
       o outro, a política mente — e esta asserção só serve porque o arquivo é
       lido SEM comentários (ver o cabeçalho deste describe). */
    expect(texto).toMatch(/90 dias/);
    /* "apagados por rotina automática", e não "apagados automaticamente":
       a revisão mediu que `cron.job` em produção tinha DOIS jobs, nenhum de
       retenção. A frase só volta a ser verdadeira com o agendamento que este
       PR acrescenta — e nomear a rotina é o que liga a promessa ao executor. */
    expect(texto).toMatch(/apagados por rotina automática/);
  });

  it("a promessa de eliminação foi QUALIFICADA, não mantida como estava", () => {
    expect(texto, "a promessa absoluta voltou — e ela é falsa").not.toMatch(
      /o registro é apagado — não fica cópia em nossa base/,
    );
    expect(texto, "a ressalva sobre o registro técnico sumiu").toMatch(
      /pode permanecer até o fim dos 90 dias/,
    );
    // E a saída para quem não quer esperar o prazo.
    expect(texto, "não oferece apagar antes do prazo").toMatch(/antes do prazo, peça/);
  });
});
