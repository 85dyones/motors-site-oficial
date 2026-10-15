import { SITE_URL } from "./site";
import { CAMINHO_DO_REPASSE } from "./repasseNaNavegacao";
import {
  ANCORA_DA_LISTA_LOJISTA,
  COMO_COMPRAR,
  CONTA_ABERTA,
  HEROI_DO_REPASSE,
  LISTA_DO_REPASSE,
  PERGUNTAS_DO_REPASSE,
  PROVAS_DO_REPASSE,
  REPASSE_OU_ESTOQUE,
  SERVE_PARA_VOCE,
} from "./paginaDoRepasse";

/**
 * O Repasse Motors, escrito para o assistente do WhatsApp ler (14/10/2026).
 *
 * Pedido do dono: o Ney precisa responder "sobre tudo, inclusive sobre a área
 * de repasse nova". Até aqui ele não sabia nada dela, e no teste de 14/10
 * inventou que o repasse tinha "uma checagem mais simples".
 *
 * Documento próprio, e não uma seção do institucional, por dois motivos:
 *
 *   - o teto. O Captain corta em 15000 bytes sem avisar, e o institucional já
 *     usa perto de doze mil;
 *   - a recuperação. O repasse é OUTRO produto, com regras opostas às do
 *     estoque (sem garantia, só à vista, transferência por conta de quem
 *     compra). Misturado ao texto da garantia, um pedaço recuperado sobre
 *     "garantia" poderia vir de qualquer um dos dois.
 *
 * Sem carro nenhum: o lote muda toda semana e o documento ingerido é uma
 * fotografia. Carro, preço, FIPE e se ainda está aberto, quem confirma é o
 * consultor. O texto é o mesmo que `/repasse` publica, saído de
 * `paginaDoRepasse.ts`, para o assistente nunca dizer uma versão que o site
 * já corrigiu.
 */

const TETO_DO_CAPTAIN = 15000;
const MARGEM = 1000;

/** Como o do institucional, mas a linha vazia fica: ela separa os parágrafos. */
function bloco(titulo: string, linhas: (string | false | null | undefined)[]): string {
  const conteudo = linhas
    .filter((linha): linha is string => typeof linha === "string")
    .join("\n")
    .trim();
  return conteudo ? `## ${titulo}\n\n${conteudo}\n\n---\n\n` : "";
}

export function montarRepasse(geradoEm: string): string {
  const pagina = `${SITE_URL}${CAMINHO_DO_REPASSE}`;

  const cabecalho = [
    "# Repasse Motors, para o atendente virtual",
    "",
    "Este arquivo explica o Repasse Motors (\"Repasse às claras\"): carros vendidos",
    "no estado, só à vista. É um produto DIFERENTE do estoque com garantia. A ficha",
    "dos carros do estoque está em outro documento, e os carros do repasse não",
    "estão em documento nenhum.",
    "",
    "## Como usar",
    "",
    "- **Não há carro, preço nem FIPE aqui, de propósito.** O lote do repasse muda",
    "  toda semana. Qual carro está aberto, o preço, a FIPE e se ele já foi",
    "  reservado, quem confirma é o consultor.",
    "- A mensagem que chega do site traz \"Ref.: repasse\" e um código. É a",
    "  referência do carro: anote e passe ao consultor. Não peça outro código.",
    "- A garantia da loja e a perícia de todo carro valem para o ESTOQUE. Nunca",
    "  diga que um carro do repasse tem garantia.",
    "- Fale do repasse só com o que está aqui. Não explique o preço de um carro",
    "  pelo tempo que ele ficou na loja, e não fale de lei nem de órgão de defesa.",
    "",
    `Gerado em: ${geradoEm}`,
    "",
    "---",
    "",
  ].join("\n");

  const oQueE = bloco("O que é", [
    HEROI_DO_REPASSE.texto,
    "",
    REPASSE_OU_ESTOQUE.texto,
    "",
    `Página: ${pagina}`,
  ]);

  const trilhas = bloco("Para que a pessoa compra", [
    `**Compra para usar.** ${HEROI_DO_REPASSE.usar.texto}`,
    "",
    `**Compra para revender (lojista).** ${HEROI_DO_REPASSE.revender.texto}`,
    `Cadastro do lojista: ${pagina}#${ANCORA_DA_LISTA_LOJISTA}`,
  ]);

  const provas = bloco(
    PROVAS_DO_REPASSE.rotulo,
    PROVAS_DO_REPASSE.itens.map((item) => `- **${item.titulo}.** ${item.texto}`),
  );

  const conta = bloco(CONTA_ABERTA.titulo, [
    ...CONTA_ABERTA.termos.map((t) => `- **${t.termo}:** ${t.definicao}`),
    "",
    CONTA_ABERTA.nota,
  ]);

  const ladoALado = bloco("Repasse ou estoque com garantia", [
    ...REPASSE_OU_ESTOQUE.linhas.map(
      (l) => `- **${l.tema}.** Repasse: ${l.repasse}. Estoque: ${l.estoque}.`,
    ),
  ]);

  const serve = bloco(SERVE_PARA_VOCE.titulo, [
    SERVE_PARA_VOCE.texto,
    "",
    "Serve se a pessoa:",
    ...SERVE_PARA_VOCE.serve.map((s) => `- ${s}`),
    "",
    "Não serve se a pessoa:",
    ...SERVE_PARA_VOCE.naoServe.map((s) => `- ${s}`),
  ]);

  const comprar = bloco(
    "Como comprar",
    COMO_COMPRAR.passos.map((p) => `${p.numero}. **${p.titulo}.** ${p.texto}`),
  );

  const lista = bloco("Lista do repasse no WhatsApp", [
    LISTA_DO_REPASSE.titulo,
    "",
    `**Quem compra para usar.** ${LISTA_DO_REPASSE.textoUsar}`,
    "",
    "**Lojista.**",
    ...LISTA_DO_REPASSE.vantagensLojista.map((v) => `- ${v}`),
    "",
    LISTA_DO_REPASSE.consentimento,
    "O aviso é mandado por uma pessoa da equipe, não por disparo automático.",
    `Para entrar na lista: ${pagina}`,
  ]);

  const perguntas = bloco(
    "Perguntas sobre o repasse",
    PERGUNTAS_DO_REPASSE.flatMap((item) => [`**${item.pergunta}**`, item.resposta, ""]),
  );

  const texto = cabecalho + oQueE + trilhas + provas + conta + ladoALado + serve + comprar + lista + perguntas;

  // O mesmo aviso do institucional: cortar calado perderia as perguntas, que
  // são a última seção e a mais consultada.
  if (texto.length > TETO_DO_CAPTAIN - MARGEM) {
    return `${texto.slice(0, TETO_DO_CAPTAIN - MARGEM - 200)}\n\n---\n\n## AVISO\n\nEste arquivo passou do limite que o Chatwoot guarda e foi cortado aqui. Quem mexeu no texto do repasse precisa encurtá-lo ou dividi-lo em dois documentos.\n`;
  }
  return texto;
}
