import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { ler, lerCodigo } from "./fonte";

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

/** A chamada que o pg_cron executa, e o padrão com que a migração confere a própria agenda. */
const AGENDA = /\$cron\$\s*select\s+public\.limpar_erros_antigos\((\d+)\)\s*;?\s*\$cron\$/gi;
const AUTOCONFERENCIA = /ilike\s+'%limpar_erros_antigos\((\d+)\)%'/gi;

/**
 * A agenda que o banco executa, lida da migração mais recente que agenda a
 * rotina — e não da de 12/09 pelo nome.
 *
 * O limite, medido na revisão de 13/09: a busca só LÊ uma forma, a chamada
 * direta dentro de `$cron$`. Um reagendamento futuro por outra forma (função
 * portão, que é como 2 dos 3 jobs do banco são agendados; aspas simples; `$$`;
 * ou um `cron.unschedule`) faria a busca voltar para a migração de 12/09 e
 * ficar verde guardando uma agenda morta. Por isso a segunda regra: a última
 * migração que CITA a rotina ou o job tem de ser a mesma que a busca leu. Se
 * não for, a trava reprova e manda ler a migração nova à mão.
 *
 * Os comentários `--` saem antes da busca, porque a nota que explica a agenda
 * costuma citar a agenda.
 */
function agendaViva(): { arquivo: string; sql: string } {
  const migracoes = readdirSync(join(__dirname, "..", "supabase", "migrations"))
    .filter((arquivo) => arquivo.endsWith(".sql"))
    .sort()
    .map((arquivo) => ({
      arquivo,
      sql: ler(`supabase/migrations/${arquivo}`).replace(/--.*$/gm, ""),
    }));
  const agendam = migracoes.filter(({ sql }) => [...sql.matchAll(AGENDA)].length > 0);
  const citam = migracoes.filter(({ sql }) => /limpar_erros_antigos|retencao-de-erros/i.test(sql));
  expect(
    agendam.length,
    'nenhuma migração agenda limpar_erros_antigos: a "rotina automática" da política não tem executor',
  ).toBeGreaterThan(0);
  const lida = agendam[agendam.length - 1];
  const ultimaQueCita = citam[citam.length - 1];
  expect(
    ultimaQueCita.arquivo,
    `${ultimaQueCita.arquivo} mexe na rotina de retenção numa forma que esta trava não lê: confira à mão se a agenda e o prazo da política continuam iguais, e ensine a forma nova a AGENDA`,
  ).toBe(lida.arquivo);
  return lida;
}

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
 *
 * E `lerCodigo` fechou só metade do furo. A revisão de 13/09 mediu a outra
 * metade nos arquivos reais: uma ocorrência de "90 dias" bastava, e a ressalva
 * a fornecia sozinha; e a migração nem era lida. O teste do PRAZO, abaixo,
 * fecha essa metade.
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

  it("o PRAZO é um número só: o que a política declara é o que a rotina agenda", () => {
    /* Bloqueio da revisão de 13/09. A versão anterior pedia `/90 dias/` uma
       vez, e a ressalva do parágrafo seguinte já a satisfazia sozinha: trocar
       só a frase da retenção para "30 dias" ficava verde. A migração nem era
       lida, então agendar `limpar_erros_antigos(30)` também passava. As duas
       mutações foram medidas nos arquivos reais antes desta versão.

       Agora o número sai da frase da retenção e é exigido igual na ressalva,
       na agenda e na autoconferência da migração. Mudar o prazo continua
       possível, mas só mudando os lugares juntos.

       "apagados por rotina automática", e não "apagados automaticamente": a
       revisão mediu que `cron.job` em produção tinha DOIS jobs, nenhum de
       retenção. Nomear a rotina é o que liga a promessa ao executor, e por
       isso a frase inteira é a âncora. */
    const retencao = texto.match(
      /guardados\s+por\s+(\d+)\s+dias\s+e\s+depois\s+são\s+apagados\s+por\s+rotina\s+automática/,
    );
    expect(retencao, "a frase da retenção sumiu, ou deixou de nomear a rotina").not.toBeNull();
    const prazo = retencao![1];

    const ressalva = texto.match(/pode\s+permanecer\s+até\s+o\s+fim\s+dos\s+(\d+)\s+dias/);
    expect(ressalva, "a ressalva sobre o registro técnico sumiu").not.toBeNull();
    expect(ressalva![1], "a ressalva cita um prazo e a retenção, outro").toBe(prazo);

    const { arquivo, sql } = agendaViva();
    const agendados = [...sql.matchAll(AGENDA)].map((m) => m[1]);
    expect(agendados, `${arquivo} agenda um prazo e a política declara outro`).toEqual(
      agendados.map(() => prazo),
    );
    const conferidos = [...sql.matchAll(AUTOCONFERENCIA)].map((m) => m[1]);
    expect(conferidos, `a autoconferência de ${arquivo} confere outro prazo`).toEqual(
      conferidos.map(() => prazo),
    );
  });

  it("a promessa de eliminação foi QUALIFICADA, e não oferece o que nada cumpre", () => {
    expect(texto, "a promessa absoluta voltou — e ela é falsa").not.toMatch(
      /o registro é apagado — não fica cópia em nossa base/,
    );
    expect(texto, "a ressalva sobre o registro técnico sumiu").toMatch(
      /pode\s+permanecer\s+até\s+o\s+fim\s+dos\s+\d+\s+dias/,
    );
    /* Bloqueio da revisão de 13/09: esta asserção EXIGIA o defeito. Ela pedia
       "se quiser que apaguemos esses registros antes do prazo, peça pelos
       mesmos canais", e nada cumpre isso: o painel não tem DELETE em `erros`,
       a exclusão do lead (`api/leads/gerenciar`) não encosta na tabela, e
       depois dela o elo `leads.ag_uid` some junto. A loja perde o único jeito
       de achar as linhas, e o `ag_uid` fica só no cookie do próprio titular.
       A oferta volta junto com o executor, num PR próprio (decisão do dono,
       13/09).

       O alcance desta trava: o trecho da seção "Por quanto tempo guardamos",
       de `id="retencao"` até `id="direitos"`, sem diferenciar maiúscula. Ela
       pega a frase antiga e as variações que falem em "antes do prazo" ali.
       Uma oferta com outra redação passa, e tem que chegar com o executor no
       mesmo PR. Outra seção pode falar de prazo à vontade. */
    const inicio = texto.indexOf('id="retencao"');
    const fim = texto.indexOf('id="direitos"');
    expect(inicio, 'a seção id="retencao" sumiu da política').toBeGreaterThan(-1);
    expect(fim, 'a seção id="direitos" sumiu, ou veio antes da retenção').toBeGreaterThan(inicio);
    expect(
      texto.slice(inicio, fim),
      "a retenção voltou a oferecer apagar antes do prazo, e nada cumpre isso",
    ).not.toMatch(/antes\s+do\s+prazo/i);
  });
});
