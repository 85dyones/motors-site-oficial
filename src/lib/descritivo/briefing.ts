import { ROTULOS, temRotulo, dossieEmTexto, type Dossie } from "./dossie";
import type { CampoDeTexto } from "./validacao";

/**
 * O prompt do gerador.
 *
 * O modelo é constante nomeada de propósito: trocá-lo é uma linha, e a
 * escolha veio de medir nove modelos em 08/09/2026 (spec §5.1). gpt-4.1-mini
 * passou em 10 de 10 gerações depois de o dossiê virar linhas rotuladas, a
 * US$ 0,001 por texto e 2,5 s por clique — latência pesa num botão de painel.
 */
export const MODELO = "gpt-4.1-mini";

/**
 * As palavras da casa — a linha "Use" do VOCABULÁRIO.
 *
 * `aprovado` é a única que NÃO vale para todo veículo: dizer "aprovado" de um
 * carro cuja perícia está em análise é exatamente a afirmação que a régua de
 * `validacao.ts` reprova. Por isso a lista é montada por veículo — ver
 * `montarInstrucoes`.
 */
const PALAVRAS_DA_CASA = [
  "passou",
  "aprovado",
  "selecionado",
  "procedência",
  "perícia cautelar independente",
  "preço no anúncio",
] as const;

/**
 * O posicionamento da loja, aprovado pelo dono em 2026-08-17.
 *
 * É cópia deliberada de `conteudo-seo/POSICIONAMENTO.md`, e não leitura do
 * arquivo: o prompt de produção não pode depender de um .md que vive fora de
 * `src/` e que ninguém garante estar no bundle da Vercel.
 *
 * O "Exemplo trabalhado" do BRIEFING.md fica de FORA. Ele descreve uma VW
 * Saveiro e afirma "garantia de motor e câmbio"; medido em 08/09/2026,
 * gpt-4o-mini copiou a frase para um BMW que não tem esse dado. Exemplo fixo
 * em diretriz vira bordão.
 *
 * PODA POR VEÍCULO (08/09/2026): até esta correção a linha "Use" mandava usar
 * `aprovado` para TODOS — inclusive os 49 de 85 em análise —, e ela viaja no
 * `instructions` (system), que pesa mais que o prompt de usuário onde a
 * proibição mora. O prompt dizia as duas coisas ao mesmo tempo, e o lado que
 * empurrava para a violação estava no campo mais forte.
 */
function posicionamento(periciaAprovada: boolean): string {
  const use = periciaAprovada
    ? PALAVRAS_DA_CASA
    : PALAVRAS_DA_CASA.filter((p) => p !== "aprovado");

  return `
A Motors Store é uma revenda de seminovos em Curitiba/PR, com showroom na Rua
Ernesto Piazzetta, 98 — Bacacheri.

O ativo da loja não é o carro que ela vende, é o carro que ela RECUSA: de cada
dez veículos avaliados, três entram. A frase-mãe é "o carro que passou".

VOCABULÁRIO
Use: ${use.join(", ")}.
Nunca use: premium, luxo, exclusivo, "consulte-nos", "melhor preço",
"procedência garantida", "o melhor estoque da região".

Por quê: a mediana do estoque é R$ 62.900. "Premium" aplicado a um carro de
R$ 27.000 é uma mentira pequena que o comprador percebe na primeira linha.
"Passou" funciona em R$ 13.900 e em R$ 318.900.

GEOGRAFIA
Âncora sempre presente: showroom no Bacacheri, em Curitiba.
Alcance maior só quando o preço passa de R$ 100.000 — e o limite é Paraná e
Santa Catarina ATÉ Balneário Camboriú. Nunca "todo o Brasil".

O QUE O TEXTO PRECISA FAZER
O veículo é o assunto; a loja é o contexto. Nada de despejo de ficha técnica,
e nada de texto institucional que serviria para qualquer carro.
`.trim();
}

const FORMATO: Record<CampoDeTexto, string> = {
  descricao_seo: `
Escreva o campo \`descricao_seo\`: a frase de anúncio que vai para o feed dos
portais e para a descrição que aparece na busca do Google.

REGRA DURA: as duas primeiras frases precisam caber em 155 caracteres, porque
é onde o Google corta. APROVEITE o espaço — mire entre 130 e 155, não 70.
O texto inteiro pode passar disso; a ABERTURA não pode.
`.trim(),
  descricao: `
Escreva o campo \`descricao\`: o texto editorial que ABRE a página do veículo.
Dois ou três parágrafos curtos, entre 400 e 700 caracteres no total.
Comece pelo veículo e pelo fato mais forte dele, não pela loja.
`.trim(),
};

/**
 * O `instructions` (system) da chamada.
 *
 * Recebe o dossiê porque o posicionamento NÃO é o mesmo para todo veículo: a
 * palavra `aprovado` sai da lista "Use" quando a perícia não aprovou. Sem isso
 * o mesmo prompt mandava usar a palavra e proibia a afirmação — e a instrução
 * que empurra para a violação ficava no campo de mais peso.
 */
export function montarInstrucoes(dossie: Dossie): string {
  return [
    "Você escreve anúncios de veículos para a Motors Store, revenda de seminovos em Curitiba/PR.",
    "Siga o posicionamento abaixo à risca.",
    "",
    posicionamento(dossie.periciaAprovada),
  ].join("\n");
}

/**
 * As proibições são montadas POR VEÍCULO, a partir da ausência de cada rótulo.
 * Medido em 08/09/2026: com proibições genéricas, metade dos modelos
 * escorregava; com elas explícitas, os finalistas passaram em tudo.
 */
export function montarEntrada(dossie: Dossie, campo: CampoDeTexto): string {
  const regras: string[] = [];

  if (dossie.periciaAprovada) {
    regras.push("Você PODE afirmar que a perícia cautelar independente foi APROVADA — o dado sustenta.");
  } else {
    regras.push(
      'NÃO afirme aprovação de laudo ou perícia. Fale só do PROCESSO: "passa por perícia independente antes de entrar na vitrine". E NÃO diga que o exame está em análise, pendente ou aguardando: isso é status interno da loja.',
    );
  }

  if (dossie.opcionais.length === 0) {
    regras.push("NÃO cite nenhum opcional, equipamento ou acessório: não há dado.");
  } else {
    regras.push("Cite no máximo 3 opcionais, escolhidos da linha 'Opcionais declarados'. Nenhum outro.");
  }

  if (!temRotulo(dossie, ROTULOS.garantia)) {
    regras.push("NÃO cite garantia de fábrica nem garantia de motor e câmbio: não há dado.");
  }
  if (!temRotulo(dossie, ROTULOS.donos)) {
    regras.push('NÃO cite número de donos nem "único dono": não há dado.');
  }
  if (!temRotulo(dossie, ROTULOS.motorizacao)) {
    regras.push("NÃO descreva a motorização nem cite cilindrada: não há dado.");
  }

  regras.push(
    "Alcance: showroom no Bacacheri, Curitiba. Só mencione alcance maior se o preço passar de R$ 100.000, e nesse caso o limite é Paraná e Santa Catarina ATÉ Balneário Camboriú — nunca 'todo o Brasil'.",
  );
  regras.push("Escreva TEXTO CORRIDO. Sem markdown, sem asteriscos, sem título, sem lista.");

  return [
    FORMATO[campo],
    "",
    "FICHA DO VEÍCULO — cada linha é `Rótulo: valor`. O valor pertence ao rótulo da própria linha.",
    "Não transfira um valor para outro rótulo: a cor é da pintura, o câmbio não é o motor,",
    "e a carroceria não tem cor. O que não está aqui não existe e não pode ser mencionado.",
    "",
    dossieEmTexto(dossie),
    "",
    "REGRAS:",
    ...regras.map((x) => "- " + x),
    "",
    "Responda APENAS com o texto do anúncio, sem aspas e sem comentário.",
  ].join("\n");
}
