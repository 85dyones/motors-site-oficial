import { ROTULOS, temRotulo, type Dossie } from "./dossie";

/**
 * Reprova texto fora do padrão antes de ele chegar à tela.
 *
 * STATUS_INTERNO usa `\bpendente\b` por causa de um defeito medido em
 * 08/09/2026: sem a fronteira de palavra, /pendente/ reprovava "perícia
 * independente" e a validação passava a reprovar tudo — a tabela de
 * resultados chegou a ser lida como "cinco modelos ruins" antes de a causa
 * aparecer. Isso NÃO generaliza: nem toda regra de substring usa `\b` —
 * GATILHO_DE_PERICIA, AFIRMA_APROVACAO, GARANTIA, DONOS, os equipamentos e a
 * primeira alternativa do próprio STATUS_INTERNO ("em an[áa]lise") não usam —,
 * então uma regra nova precisa avaliar caso a caso se corre o mesmo risco, em
 * vez de supor que o arquivo inteiro já se protege sozinho. `ALCANCE` é a
 * terceira vítima da mesma família (08/09/2026): `\bnacional\b` tinha a
 * fronteira e ainda assim reprovava "Picape nacional, feita em Betim", porque
 * o problema ali não era o recorte da palavra e sim o SENTIDO dela.
 *
 * LIMITE CONHECIDO: nada aqui detecta TROCA DE CAMPO — "motor manual" quando
 * o manual é o câmbio. As duas frases são bem-formadas e nenhuma regex as
 * separa sem reprovar "motor flex", que é correto. Por isso o texto vai para
 * revisão humana num painel, e não direto para o campo.
 */

/** Onde `truncateString(cleanDescription, 155)` corta a meta description da PDP. */
export const LIMITE_META = 155;

export type CampoDeTexto = "descricao" | "descricao_seo";
export type Reprovacao = { regra: string; motivo: string };

/**
 * O corpo de uma frase.
 *
 * Um ponto entre dígitos é separador de milhar — `toLocaleString("pt-BR")`
 * formata preço e km assim no dossiê — e não pode contar como fim de frase.
 * Sem a exceção `(?<=\d)\.(?=\d)`, "R$ 89.900,00." quebrava em dois fragmentos
 * ali no meio do número, e a segunda frase real da abertura caía fora da
 * contagem: bug medido em 08/09/2026 (abertura real de 158 caracteres, que
 * devia reprovar, lida como 34).
 *
 * A constante existe para que `aberturaDe` e `frasesDe` NÃO tenham duas
 * versões da mesma exceção — corrigir o separador de milhar num lugar e
 * esquecer o outro seria a mesma classe de defeito de novo.
 */
const CORPO_DA_FRASE = "(?:[^.!?]|(?<=\\d)\\.(?=\\d))+";

/** As duas primeiras frases — o que o Google mostra. */
export function aberturaDe(texto: string): string {
  const frases = texto
    .replace(/\s+/g, " ")
    .trim()
    .match(new RegExp(CORPO_DA_FRASE + "[.!?]+", "g"));
  if (!frases || frases.length === 0) return texto.replace(/\s+/g, " ").trim();
  return frases.slice(0, 2).join("").trim();
}

/**
 * Todas as frases do texto, INCLUSIVE a última sem pontuação final.
 *
 * A diferença para `aberturaDe` é `[.!?]*` no lugar de `[.!?]+`: ali só
 * interessa o que o Google mostra, e frase inacabada não conta; aqui interessa
 * TUDO que o texto afirma, e "Laudo cautelar aprovado" sem ponto final afirma
 * exatamente o mesmo que com ponto final.
 */
function frasesDe(texto: string): string[] {
  const limpo = texto.replace(/\s+/g, " ").trim();
  const frases = limpo.match(new RegExp(CORPO_DA_FRASE + "[.!?]*", "g"));
  return (frases ?? [limpo]).map((f) => f.trim()).filter(Boolean);
}

const VOCABULARIO =
  /\b(premium|luxo|exclusiv[oa]s?|consulte-nos)\b|melhor pre[çc]o|proced[êe]ncia garantida|garantia de proced[êe]ncia|melhor estoque/i;

/**
 * A régua da perícia, em três peças — gatilho, afirmação e negação.
 *
 * O que ela impede: o texto público dizer que o laudo APROVOU um veículo cuja
 * vistoria não aprovou (49 dos 85 à venda em 08/09/2026). O texto vai para o
 * `<g:description>` dos portais e para a meta description do Google, e o painel
 * imprime "Não afirma perícia aprovada" ao lado dele — quem revisa confia nessa
 * frase, então uma passagem aqui não é só um texto errado: é a tela declarando
 * ter conferido o eixo que vazou.
 *
 * DUAS PASSAGENS FECHADAS EM 08/09/2026, as duas executadas pelo portão:
 *
 * 1. A ORDEM. A régua antiga era `gatilho[^.!?]*afirmação` e exigia o gatilho
 *    ANTES: "Aprovado na perícia cautelar independente." e "Aprovado em perícia
 *    cautelar, o carro está pronto para transferência." passavam inteiras. Agora
 *    a pergunta é de PRESENÇA na mesma frase, nos dois sentidos.
 *
 * 2. A NEGAÇÃO. O desconto antigo reusava `NEGA_APROVACAO` de `lib/supabase.ts`,
 *    que contém `\bsem\b`. Aquela régua foi escrita para a COLUNA DE STATUS do
 *    banco, onde "sem" só aparece em "sem aprovação"; jogada contra frase livre,
 *    qualquer "sem «coisa boa»" desligava a regra — "Perícia cautelar
 *    independente, sem sinistro registrado, com resultado aprovado.", "Laudo
 *    cautelar sem restrições e aprovado por empresa credenciada." e "Laudo
 *    cautelar completo, sem histórico de leilão, aprovado." passavam as três.
 *    Reusar a régua do status foi o erro: ela responde a outra pergunta. Aqui a
 *    negação é ESTRUTURAL e ADJACENTE ao verbo — "não aprovado", "ainda não está
 *    aprovado", "não foi aprovado", "sem aprovação" —, nunca uma varredura de
 *    "sem" pela frase inteira.
 *
 * Duas armadilhas que qualquer mexida aqui tem de respeitar:
 *
 * - "sem apontamentos" é AFIRMAÇÃO de perícia limpa, não negação: "Laudo
 *   cautelar aprovado sem apontamentos." tem de continuar reprovando.
 * - "reprovado" NÃO contém "aprovad" (r-e-p-r-o-v-a-d-o), então não há colisão —
 *   verificado, não suposto. Uma frase que só diz "reprovado" não casa com
 *   nenhuma afirmação e por isso passa, que é o desfecho certo.
 */
const GATILHO_DE_PERICIA = /laudo|per[íi]cia|cautelar/i;

/** O que, dito de uma perícia, afirma que ela aprovou. */
const AFIRMA_APROVACAO = /aprovad\w*|aprova[çc][ãa]o|100%|sem apontament\w*/gi;

/**
 * A negação, colada no verbo — é o que separa "não está aprovado" de
 * "sem sinistro registrado, com resultado aprovado".
 *
 * Casa só no FIM do trecho que antecede a afirmação: ou uma palavra de negação
 * seguida apenas de auxiliares ("não foi", "ainda não está", "não tem"), ou o
 * "sem" imediatamente grudado ("sem aprovação"). Substantivo no meio — "sem
 * sinistro registrado, com resultado" — desqualifica a negação, que é
 * exatamente o buraco de 08/09/2026.
 */
const AUXILIARES =
  "(?:\\s+(?:ainda|j[áa]|foi|for|foram|[ée]|s[ãa]o|ser[áa]|sendo|est[áa]|est[ãa]o|estava|estavam|era|eram|tem|t[êe]m|teve|tinha|h[áa]|houve|possui|se|o|a|que))*";
const NEGACAO_ADJACENTE = new RegExp(
  `(?:\\b(?:n[ãa]o|nem|nunca|jamais)\\b${AUXILIARES}|\\bsem)\\s*$`,
  "i",
);

/** O texto afirma, em alguma frase, que a perícia aprovou? */
function afirmaPericiaAprovada(texto: string): boolean {
  return frasesDe(texto).some((frase) => {
    if (!GATILHO_DE_PERICIA.test(frase)) return false;
    for (const achado of frase.matchAll(AFIRMA_APROVACAO)) {
      if (!NEGACAO_ADJACENTE.test(frase.slice(0, achado.index))) return true;
    }
    return false;
  });
}

const STATUS_INTERNO = /em an[áa]lise|\bpendente\b|aguardando/i;

/**
 * Alcance de ENTREGA maior que o recorte da loja.
 *
 * `\bnacional\b` sozinho reprovava texto verdadeiro — "Picape nacional, feita
 * em Betim." e "Carro nacional, com peças fáceis de achar." saíam com o motivo
 * "Promete alcance maior que Paraná e Santa Catarina", que não descreve o
 * texto (medido em 08/09/2026). É a mesma família do `/pendente/` que reprovava
 * "perícia independente": a palavra tem outro sentido corrente, e aqui o
 * sentido que importa é o de ONDE A LOJA ENTREGA. Por isso "nacional" só conta
 * perto de uma palavra de entrega, nos dois sentidos — "entrega nacional" e
 * "cobertura nacional para entrega".
 */
const PALAVRA_DE_ENTREGA = "entrega|entregamos|envio|frete|alcance|cobertura|atendimento|transporte";
const ALCANCE = new RegExp(
  `todo o brasil|(?:em|para) todo o pa[íi]s|(?:${PALAVRA_DE_ENTREGA})[^.!?]{0,15}\\bnacional\\b|\\bnacional\\b[^.!?]{0,15}(?:${PALAVRA_DE_ENTREGA})|santa catarina(?!.{0,40}balne[áa]rio)`,
  "i",
);
const MARKDOWN = /\*\*|^#{1,6}\s|\[.+\]\(.+\)|^\s*[-*]\s/m;
const GARANTIA = /garantia de (motor|f[áa]brica)/i;
const DONOS = /[úu]nico dono|[úu]nica dona/i;

/**
 * Equipamento citado no texto — cada acerto é conferido CONTRA a lista de
 * opcionais do veículo, um a um.
 *
 * Até 08/09/2026 a guarda era `dossie.opcionais.length === 0 && EQUIPAMENTOS`:
 * ligava só no veículo que não tem opcional NENHUM. Para os 27 que têm, a
 * regra não rodava e o modelo podia citar qualquer coisa — executado pelo
 * portão com o dossiê `["Vidros elétricos","Ar-condicionado"]` e o texto "Traz
 * teto solar, bancos em couro e central multimídia": nenhuma reprovação. Ter um
 * opcional declarado não autoriza os outros.
 */
const EQUIPAMENTOS_FONTE =
  "teto solar|teto panor[âa]mico|banco[s]? em couro|couro|multim[íi]dia|c[âa]mera de r[ée]|sensor de estacionamento|ar-condicionado digital";
const TODOS_OS_EQUIPAMENTOS = new RegExp(EQUIPAMENTOS_FONTE, "gi");

/** Caixa e acento fora: "Ar-condicionado" do dossiê é "ar-condicionado" no texto. */
const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * O equipamento citado está entre os opcionais declarados?
 *
 * A comparação vale nos dois sentidos porque os dois lados recortam diferente:
 * o texto diz "bancos em couro" onde o dossiê diz "Couro", e o dossiê diz
 * "Central multimídia" onde o texto diz "multimídia".
 */
function equipamentoDeclarado(citado: string, opcionais: string[]): boolean {
  const c = semAcento(citado);
  return opcionais.some((o) => {
    const d = semAcento(o);
    // Opcional vazio casaria com tudo e desligaria a regra em silêncio.
    return d.length > 0 && (d.includes(c) || c.includes(d));
  });
}

/** Os equipamentos que o texto cita e o dossiê não sustenta. */
function equipamentosForaDoDossie(texto: string, opcionais: string[]): string[] {
  const citados = Array.from(texto.matchAll(TODOS_OS_EQUIPAMENTOS), (m) => m[0]);
  return [...new Set(citados.filter((c) => !equipamentoDeclarado(c, opcionais)))];
}

export function validarDescritivo(
  texto: string,
  dossie: Dossie,
  campo: CampoDeTexto,
): Reprovacao[] {
  const r: Reprovacao[] = [];
  const add = (regra: string, motivo: string) => r.push({ regra, motivo });

  if (campo === "descricao_seo") {
    const ab = aberturaDe(texto).length;
    if (ab > LIMITE_META) {
      add("abertura", `A abertura tem ${ab} caracteres e o Google corta em ${LIMITE_META}.`);
    }
  }

  if (VOCABULARIO.test(texto)) {
    add(
      "vocabulário",
      'Usa expressão que o posicionamento da loja barra ("premium", "luxo", "consulte-nos", "procedência garantida", "o melhor estoque da região").',
    );
  }

  if (!dossie.periciaAprovada && afirmaPericiaAprovada(texto)) {
    add("perícia", "Afirma laudo aprovado, e a perícia deste veículo não está aprovada.");
  }

  if (STATUS_INTERNO.test(texto)) {
    add("status interno", 'Expõe o andamento do exame ("em análise", "pendente"). Isso é status interno da loja.');
  }

  if (ALCANCE.test(texto)) {
    add("alcance", "Promete alcance maior que Paraná e Santa Catarina até Balneário Camboriú.");
  }

  if (MARKDOWN.test(texto)) {
    add("markdown", "Tem marcação. O texto vai cru para o XML do feed e apareceria com os símbolos.");
  }

  const inventados: string[] = [];
  if (!temRotulo(dossie, ROTULOS.garantia) && GARANTIA.test(texto)) inventados.push("garantia");
  if (!temRotulo(dossie, ROTULOS.donos) && DONOS.test(texto)) inventados.push("número de donos");
  const foraDoDossie = equipamentosForaDoDossie(texto, dossie.opcionais);
  if (foraDoDossie.length > 0) inventados.push(`equipamento (${foraDoDossie.join(", ")})`);
  if (inventados.length > 0) {
    add("fato fora do dossiê", `Afirma ${inventados.join(", ")} sem dado que sustente.`);
  }

  return r;
}
