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
 * ali no meio do número: bug medido em 08/09/2026. A mesma armadilha pegou o
 * `conteudo-seo/aplicar-rascunhos.js` de 17/08, que procura o último ponto
 * antes do caractere 155: ele aceitou três rascunhos cuja primeira frase passa
 * de 155, porque o ponto que achou era o de "53.200 km".
 *
 * Reticências ("…") fecham frase desde 14/09/2026, como o ponto. Antes não
 * fechavam, e a frase seguinte entrava na conta.
 *
 * LIMITE CONHECIDO: ponto ou exclamação dentro de nome encerra a frase cedo —
 * "VW up!" mede 6 caracteres. O erro é para o lado de aceitar.
 */
const CORPO_DA_FRASE = "(?:[^.!?…]|(?<=\\d)\\.(?=\\d))+";

/**
 * A primeira frase — o que precisa fechar antes do corte do Google.
 *
 * Decisão do dono em 14/09/2026, a mesma regra dos rascunhos de 17/08: "a
 * primeira frase fecha sozinha". Até ali a régua eram as DUAS primeiras frases
 * em 155, que reprovava 41 dos 47 rascunhos aprovados pelo próprio dono; a da
 * primeira frase reprova 3, e os três passam de 155 de verdade.
 */
export function primeiraFraseDe(texto: string): string {
  const corrido = texto.replace(/\s+/g, " ").trim();
  const frase = corrido.match(new RegExp(CORPO_DA_FRASE + "[.!?…]+"));
  return frase ? frase[0].trim() : corrido;
}

/**
 * O vocabulário que o POSICIONAMENTO barra.
 *
 * Revisto em 14/09/2026 (qa-guardian), nos dois sentidos. Passavam "luxuoso",
 * "os melhores preços", "consulte condições" e "exclusividade". Reprovava
 * "preço no anúncio, sem consulte-nos", que é frase da casa e está num
 * rascunho aprovado pelo dono em 17/08 (veículo 8324691).
 *
 * A família de "exclusivo" é fechada — exclusivo, exclusiva, os plurais e
 * exclusividade —, porque "Exclusive" é nome de versão (Nissan Versa, Kicks,
 * Sentra). Com `exclusiv\w*`, o rascunho aprovado 8440875 (Versa Exclusive)
 * reprovava (medido em 15/09/2026, decisão do dono).
 */
const VOCABULARIO =
  /\b(?:premium|luxo|luxuos[oa]s?|exclusiv(?:[oa]s?|idade))\b|(?<!\bsem\s)\bconsulte(?:-nos)?\b|\bmelhor(?:es)? pre[çc]os?\b|proced[êe]ncia garantida|garantia de proced[êe]ncia|melhor estoque/i;

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
 * SUBSTANTIVOS — perícia, laudo, cautelar, vistoria, inspeção, perito —
 * resolve os dois lados de uma vez: "Passou na perícia cautelar" reprova por
 * conter "perícia" e "cautelar"; "o carro que passou" não contém nenhum
 * deles e segue de pé.
 *
 * `\b` na frente de cada termo — sem ela, "laudo" reprovaria "aplaudo".
 *
 * Ampliado em 09/09/2026 (item menor do portão): a lista original não pegava
 * "inspeções" (plural com "õ" — "inspe[çc][ãa]o" exige literalmente "ão", e o
 * plural de palavra em "-ção" é "-ções", nunca "-ãoes"), nem os verbos
 * "inspecionado"/"inspecionar" (raiz "inspecion", com "c" antes de "i" — outra
 * grafia da mesma "inspeção"), nem "perito"/"peritagem" (raiz "perit",
 * diferente de "períci" — mesmo assunto, palavra distinta), nem "revistoriado"
 * (o prefixo "re-" quebra o `\b` que precede "vistoria"). Cada termo novo
 * ganhou seu próprio `\b`, pela mesma razão do de cima: "revistoria" tem
 * fronteira própria em vez de a de "vistoria" ser removida, porque remover
 * fronteira reabriria o risco que "aplaudo" já mostrou — um `\w*` sem `\b`
 * também casaria por dentro de palavra nenhuma relacionada.
 *
 * SEGUNDA AMPLIAÇÃO (14/09/2026, qa-guardian). `vistoria\w*` exigia a palavra
 * inteira e deixava passar "vistoriou": a raiz agora é `vistori`. E a frase
 * padrão do campo Laudo cautelar (`LAUDO_APROVADO_PADRAO`, em `laudoPadrao.ts`)
 * passava limpa quando dita sem os substantivos: "estrutura, chassi e
 * histórico de sinistro auditados por empresa independente, credenciada junto
 * ao Detran". Entra o que o laudo atesta: sinistro, auditado, Detran, leilão e
 * "nada consta". Duas formas só contam presas ao contexto, porque soltas são
 * frase de venda: "sem restrição" só depois de "documentação" ("aceita troca
 * sem restrição de ano" passa) e "avaliação técnica" só perto de "aprovado"
 * ("avaliação técnica do seu usado" passa).
 */
const MENCIONA_PERICIA = new RegExp(
  [
    "\\bper[íi]ci\\w*",
    "\\bperit\\w*",
    "\\blaudo\\w*",
    "\\bcautelar\\w*",
    "\\bvistori\\w*",
    "\\brevistori\\w*",
    "\\binspe[çc](?:[ãa]o|[õo]es)\\w*",
    "\\binspecion\\w*",
    "\\bsinistr\\w*",
    "\\bauditad\\w*",
    "\\bdetran\\b",
    "\\bleil(?:[ãa]o|[õo]es)",
    "\\bnada consta\\b",
    "\\bdocumenta[çc][ãa]o\\b[^.!?]{0,15}\\bsem restri[çc]",
    "\\baprovad\\w*[^.!?]{0,30}\\bavalia[çc][ãa]o t[ée]cnica",
    "\\bavalia[çc][ãa]o t[ée]cnica[^.!?]{0,30}\\baprovad",
  ].join("|"),
  "i",
);

/**
 * Andamento do exame exposto no texto.
 *
 * Revisto em 14/09/2026 (qa-guardian), nos dois sentidos. "aguardando" solto
 * reprovava "Está aguardando você no showroom": agora só conta com o objeto
 * do exame logo depois, ou com a aprovação ou a liberação DELE ("Aguardando
 * liberação da documentação" reprova; "Aguardando aprovação do financiamento",
 * frase de venda, passa). "em análise" reprovava "Crédito em análise na hora",
 * que é frase de venda: o crédito e o financiamento ficam de fora. E "O
 * resultado do exame ainda não saiu" passava sem nenhuma das três palavras.
 *
 * "em análise" continua valendo em qualquer outra frase, de propósito: é o
 * rótulo cru da coluna `pericia`, e prendê-lo ao objeto do exame deixaria
 * passar "Veículo em análise".
 */
const OBJETO_DO_EXAME = "resultado|exame|laudo|per[íi]cia|vistoria|documenta[çc][ãa]o";
const STATUS_INTERNO = new RegExp(
  [
    "(?<!(?:cr[ée]dito|financiamento|cadastro|proposta)[^.!?]{0,20})em an[áa]lise",
    "\\bpendente\\b",
    `\\baguardando\\s+(?:(?:o|a|os|as)\\s+)?(?:(?:aprova[çc][ãa]o|libera[çc][ãa]o)\\s+d[oa]s?\\s+)?(?:${OBJETO_DO_EXAME})`,
    `\\b(?:${OBJETO_DO_EXAME})\\b[^.!?]{0,30}\\bn[ãa]o (?:saiu|ficou pronto|chegou|foi conclu[íi]d[oa])`,
  ].join("|"),
  "i",
);

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
 *
 * TERCEIRA REVISÃO (14/09/2026, qa-guardian), nos dois sentidos.
 * - Passavam: "Atendemos clientes de todo o país" (a regra exigia "em" ou
 *   "para" antes de "todo o país"), "Entregamos em São Paulo" e "Entrega em
 *   Florianópolis" (nenhum lugar de fora era nomeado).
 * - Reprovavam: "Veio de Santa Catarina com manual e chave reserva" (qualquer
 *   Santa Catarina sem Balneário depois), "Híbrido nacional com alcance de
 *   600 km" e "Motor nacional, com peças e atendimento fáceis de achar"
 *   ("alcance" e "atendimento" contavam como palavra de entrega).
 * Santa Catarina e os lugares de fora só contam depois de uma palavra de
 * entrega. A lista tem os estados e as cidades catarinenses ao sul de
 * Balneário Camboriú. Ficam de fora "Pará" e "Acre", que colidem com "para" e
 * "acre", e "São José", porque São José dos Pinhais é da região metropolitana
 * de Curitiba.
 *
 * Revisão da tarefa (15/09/2026, decisão do dono): "atendemos" saiu das
 * palavras de entrega, porque "Atendemos com garantia nacional de peças" fala
 * de garantia, não de entrega; "Atendemos clientes de todo o país" continua
 * reprovando por "todo o país". "qualquer estado" saiu dos lugares, porque
 * "Levamos seu carro em qualquer estado" fala da condição do carro. Tubarão
 * ficou na lista, também por decisão do dono, mesmo colidindo com o apelido do
 * Opala.
 */
const PALAVRA_DE_ENTREGA = "entreg\\w*|envi[ao]\\w*|frete\\w*|levamos|cobertura|transporte";
const FORA_DO_RECORTE = [
  "s[ãa]o paulo",
  "rio de janeiro",
  "minas gerais",
  "esp[íi]rito santo",
  "rio grande do sul",
  "rio grande do norte",
  "mato grosso",
  "goi[áa]s",
  "distrito federal",
  "bras[íi]lia",
  "bahia",
  "sergipe",
  "alagoas",
  "pernambuco",
  "para[íi]ba",
  "cear[áa]",
  "piau[íi]",
  "maranh[ãa]o",
  "tocantins",
  "amazonas",
  "rond[ôo]nia",
  "roraima",
  "amap[áa]",
  "florian[óo]polis",
  "palho[çc]a",
  "crici[úu]ma",
  "chapec[óo]",
  "lages",
  "tubar[ãa]o",
  "outros estados",
  "todos os estados",
  "todo o sul",
  "toda a regi[ãa]o sul",
].join("|");
const ALCANCE = new RegExp(
  [
    "todo o brasil",
    "todo o pa[íi]s",
    "todo o territ[óo]rio nacional",
    "qualquer (?:lugar|ponto|parte|canto) do (?:brasil|pa[íi]s|territ[óo]rio)",
    `\\b(?:${PALAVRA_DE_ENTREGA})\\b[^.!?]{0,40}\\bnacional\\b`,
    `\\bnacional\\b[^.!?]{0,40}\\b(?:${PALAVRA_DE_ENTREGA})`,
    `\\b(?:${PALAVRA_DE_ENTREGA})[^.!?]{0,40}\\b(?:${FORA_DO_RECORTE})`,
    `\\b(?:${PALAVRA_DE_ENTREGA})[^.!?]{0,40}\\bsanta catarina(?![^.!?]{0,40}balne[áa]rio)`,
  ].join("|"),
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
    const pf = primeiraFraseDe(texto).length;
    if (pf > LIMITE_META) {
      add("abertura", `A primeira frase tem ${pf} caracteres e o Google corta em ${LIMITE_META}.`);
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
      "Fala de perícia ou do que o laudo atesta (sinistro, leilão, restrição, Detran, auditado, avaliação técnica). Esse assunto tem frase padrão e vive no campo Laudo cautelar — o texto do anúncio não trata dele.",
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
