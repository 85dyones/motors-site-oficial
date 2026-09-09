import { ROTULOS, temRotulo, type Dossie } from "./dossie";

/**
 * Reprova texto fora do padrão antes de ele chegar à tela.
 *
 * STATUS_INTERNO usa `\bpendente\b` por causa de um defeito medido em
 * 08/09/2026: sem a fronteira de palavra, /pendente/ reprovava "perícia
 * independente" e a validação passava a reprovar tudo — a tabela de
 * resultados chegou a ser lida como "cinco modelos ruins" antes de a causa
 * aparecer. Isso NÃO generaliza: nem toda regra de substring usa `\b` —
 * GARANTIA, DONOS, os equipamentos e a primeira alternativa do próprio
 * STATUS_INTERNO ("em an[áa]lise") não usam —, então uma regra nova precisa
 * avaliar caso a caso se corre o mesmo risco, em vez de supor que o arquivo
 * inteiro já se protege sozinho. `MENCIONA_PERICIA` usa: "laudo" é substring
 * de "aplaudo", e sem fronteira a régua reprovaria um elogio à loja. `ALCANCE`
 * é a terceira vítima da mesma família (08/09/2026): `\bnacional\b` tinha a
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
 * Usada só por `aberturaDe` desde 09/09/2026. A régua de perícia deixou de
 * segmentar por frase (ver MENCIONA_PERICIA logo abaixo), e `frasesDe`, a
 * função que existia só para ela, saiu junto.
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

const VOCABULARIO =
  /\b(premium|luxo|exclusiv[oa]s?|consulte-nos)\b|melhor pre[çc]o|proced[êe]ncia garantida|garantia de proced[êe]ncia|melhor estoque/i;

/**
 * O texto do anúncio não fala de perícia. Ponto.
 *
 * Substitui, em 09/09/2026, uma régua de DETECÇÃO DE AFIRMAÇÃO — "o texto diz
 * que o laudo aprovou?" — que foi reescrita quatro vezes e vazou nas quatro.
 * A última passagem, medida pelo portão, deixava passar limpos seis
 * descritivos inteiros que afirmavam aprovação: radical incompleto
 * (`aprovad\w*` não pegava "aprovou"), gatilho e afirmação em frases
 * diferentes, sinônimos que a lista de gatilho não conhecia ("vistoria",
 * "inspeção"), resultado limpo dito sem a palavra "aprovado" ("nada consta",
 * "sem restrições"). Detectar AFIRMAÇÃO DE APROVAÇÃO em texto livre é
 * indecidível na prática — decisão do dono, 09/09/2026.
 *
 * A régua nova não tenta decidir SE o texto afirma aprovação; decide SE o
 * texto toca no assunto. Reprova sempre, com a perícia aprovada ou não — a
 * frase sobre vistoria virou padrão e vive no campo `laudo_pericia` (ver
 * `laudoPadrao.ts`), nunca mais no texto do anúncio. Por isso esta regra,
 * ao contrário da antiga, não olha `dossie.periciaAprovada`.
 *
 * NÃO pode entrar aqui o verbo "passou" sozinho: é a frase-mãe do
 * posicionamento da loja ("o carro que passou", "de cada dez avaliados, três
 * passam") e fala do FILTRO DE SELEÇÃO da loja, não da perícia. Proibir os
 * SUBSTANTIVOS — perícia, laudo, cautelar, vistoria, inspeção — resolve os
 * dois lados de uma vez: "Passou na perícia cautelar" reprova por conter
 * "perícia" e "cautelar"; "o carro que passou" não contém nenhum dos cinco e
 * segue de pé.
 *
 * `\b` na frente de cada termo — sem ela, "laudo" reprovaria "aplaudo".
 */
const MENCIONA_PERICIA =
  /\bper[íi]ci\w*|\blaudo\w*|\bcautelar\w*|\bvistoria\w*|\binspe[çc][ãa]o\w*/i;

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
 *
 * SEGUNDA REGRESSÃO (09/09/2026): a janela entre a palavra de entrega e
 * `nacional` tinha ficado em 15 caracteres — curta demais para "Fazemos
 * entrega em todo o território nacional.", "Entregamos para todo o
 * território nacional." e "Fazemos frete para qualquer ponto do território
 * nacional.", que passavam sem reprovação (medido pelo portão). Subiu para
 * 40, a mesma janela da exceção de Balneário Camboriú logo abaixo — as duas
 * frases de fabricação ("Picape nacional, feita em Betim.") continuam
 * passando porque não têm palavra de entrega NENHUMA na frase, e é a
 * AUSÊNCIA da palavra-gatilho que as livra, não o tamanho da janela.
 */
const PALAVRA_DE_ENTREGA = "entrega|entregamos|envio|frete|alcance|cobertura|atendimento|transporte";
const ALCANCE = new RegExp(
  `todo o brasil|(?:em|para) todo o pa[íi]s|(?:${PALAVRA_DE_ENTREGA})[^.!?]{0,40}\\bnacional\\b|\\bnacional\\b[^.!?]{0,40}(?:${PALAVRA_DE_ENTREGA})|santa catarina(?!.{0,40}balne[áa]rio)`,
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

  if (MENCIONA_PERICIA.test(texto)) {
    add(
      "perícia",
      "Fala de perícia. Esse assunto tem frase padrão e vive no campo Laudo cautelar — o texto do anúncio não trata dele.",
    );
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
