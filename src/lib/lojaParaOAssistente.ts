import { telefoneVisivel } from "./whatsapp";
import { SITE_URL } from "./site";
import type { CompanySettings } from "../types";
import { PARAMETROS_DE_FABRICA, type ParametrosDoFinanciamento } from "./finance-calculator";
import { textoDosBancos } from "./textoDaParcela";
import { CAMINHO_DO_REPASSE } from "./repasseNaNavegacao";
import {
  GARANTIA_KM_TEXTO,
  GARANTIA_MESES,
  perguntasDeFinanciamento,
  PERGUNTAS_DE_GARANTIA,
  SECOES_DE_GARANTIA,
  TEXTO_DE_FINANCIAMENTO,
  TEXTO_DE_GARANTIA,
} from "./paginasInstitucionais";

/** O mesmo teto do documento de fichas — o Captain corta em 15000, calado. */
const TETO_DO_CAPTAIN = 15000;
const MARGEM = 1000;

function bloco(titulo: string, linhas: (string | false | null | undefined)[]): string {
  const conteudo = linhas.filter(Boolean).join("\n").trim();
  return conteudo ? `## ${titulo}\n\n${conteudo}\n\n---\n\n` : "";
}

function perguntas(itens: { pergunta: string; resposta: string }[]): string[] {
  return itens.flatMap((item) => [`**${item.pergunta}**`, item.resposta, ""]);
}

/**
 * O alcance da entrega fica FORA deste arquivo (decisão do dono, 14/10/2026).
 *
 * *"só transferir, deixe o consultor lidar com a objeção de área na hora
 * certa"*. O site publica o alcance (`ALCANCE_DA_ENTREGA`), mas no WhatsApp a
 * conversa de quem é de longe é do consultor: o assistente que responde "não
 * chegamos aí" perde um cliente que o consultor talvez atendesse. Por isso o
 * documento não traz a frase em lugar nenhum, nem dentro do FAQ da garantia,
 * e diz ao assistente o que fazer no lugar dela.
 */
const DE_OUTRA_CIDADE =
  "Cliente de outra cidade, ou que pergunta se a loja entrega: não fale de alcance, região, frete nem prazo. Anote a cidade e passe para o consultor, que trata disso na hora certa.";

/** A pergunta da garantia que, no site, responde com o alcance. */
const GARANTIA_DE_OUTRA_CIDADE = /outra cidade/i;
const RESPOSTA_DE_OUTRA_CIDADE =
  "Vale. A cobertura é a mesma em Curitiba, na Região Metropolitana e para quem compra de fora. Como o carro chega até a pessoa, o consultor combina caso a caso.";

function semOAlcance(itens: { pergunta: string; resposta: string }[]) {
  return itens.map((item) =>
    GARANTIA_DE_OUTRA_CIDADE.test(item.pergunta) ? { ...item, resposta: RESPOSTA_DE_OUTRA_CIDADE } : item,
  );
}

/**
 * O recorte das configurações que este arquivo lê.
 *
 * `Pick` do tipo real, e não um objeto solto: assim o teste pode montar um
 * dublê e o compilador continua exigindo os campos que `telefoneVisivel`
 * precisa.
 */
type DadosDaLoja = Pick<CompanySettings, "name" | "address" | "hours" | "whatsapp" | "whatsappRaw">;

/**
 * `condicoes` é a vigência de `parametros_financiamento` (o ano mais
 * antigo que os bancos parceiros financiam e a lista deles) — a mesma que o
 * site aplica. Sem ela, os valores de fábrica.
 */
export function montarLoja(
  empresa: DadosDaLoja,
  geradoEm: string,
  condicoes: ParametrosDoFinanciamento = PARAMETROS_DE_FABRICA,
): string {
  const cabecalho = [
    "# A Motors Store, para o atendente virtual",
    "",
    "Este arquivo é o que a loja É: garantia, financiamento, endereço, horário e",
    "as perguntas que mais chegam. A ficha técnica de cada carro está no outro",
    "documento, e o Repasse Motors tem um documento só dele.",
    "",
    "## Como usar",
    "",
    "- **Não há preço aqui, nem de carro nem de parcela.** Quem informa valor é o",
    "  consultor. Nunca estime e nunca diga que não tem acesso — siga a conversa.",
    "- O texto abaixo é o mesmo que o site publica. Se o cliente citar o site,",
    "  vocês dois estão lendo a mesma coisa.",
    "",
    `Gerado em: ${geradoEm}`,
    "",
    "---",
    "",
  ].join("\n");

  const endereco = bloco("Onde fica e quando abre", [
    `Showroom: ${empresa.address ?? ""}`,
    "Uma unidade só, no Bacacheri.",
    empresa.hours ? `Horário: ${String(empresa.hours).replace(/\n/g, " · ")}` : "",
    `WhatsApp e telefone: ${telefoneVisivel(empresa)}`,
    "",
    "Frete, prazo e forma de entrega são combinados caso a caso com o consultor.",
    "Nunca prometa prazo, valor de frete nem frete grátis.",
    DE_OUTRA_CIDADE,
  ]);

  const garantia = bloco("Garantia", [
    // O prazo em linha própria, e vindo da constante: a prosa abaixo diz "três
    // meses" por extenso, e um assistente que precisa responder "quantos
    // meses?" acha mais rápido o número do que a palavra. Escrever "3" à mão
    // aqui criaria a terceira versão do mesmo prazo no repositório.
    // O limite de quilometragem entrou em 18/09/2026, com o número do dono. Sem
    // ele, o assistente respondia "três meses" a quem roda 2.000 km por mês.
    `Prazo: ${GARANTIA_MESES} meses de motor e câmbio, ou ${GARANTIA_KM_TEXTO} km — o que vier primeiro —, contados da entrega, sem carência e sem franquia. Turbo original de fábrica entra como parte do motor.`,
    "",
    ...TEXTO_DE_GARANTIA,
    "",
    // As seções da página entram inteiras, cada uma com o próprio título: é o
    // que o Captain recupera quando alguém pergunta "como aciono a garantia?",
    // e o "avise antes de mexer" mora numa seção, não na abertura.
    ...SECOES_DE_GARANTIA.flatMap((secao) => [`### ${secao.titulo}`, ...secao.paragrafos, ""]),
    ...perguntas(semOAlcance(PERGUNTAS_DE_GARANTIA)),
  ]);

  const financiamento = bloco("Financiamento", [
    ...TEXTO_DE_FINANCIAMENTO,
    "",
    // O FAQ da página, com o ano da vigência: PERGUNTAS_DE_FINANCIAMENTO é o
    // mesmo texto com o ano de fábrica.
    ...perguntas(perguntasDeFinanciamento(condicoes.anoMaisAntigo)),
    "",
    textoDosBancos(condicoes.bancosParceiros),
    "",
    "Nunca diga taxa, parcela ou valor, e nunca diga que a aprovação é garantida,",
    "fácil ou rápida. Não peça CPF, RG, comprovante de renda nem dado bancário por",
    "iniciativa própria. Se o cliente pedir para simular ou mandar os dados, dá para",
    "receber o CPF e a data de nascimento e passar ao consultor; RG, comprovante de",
    "renda e dado bancário, nunca — o consultor coleta no canal próprio.",
  ]);

  const ferramentas = bloco("O que a loja tem no site", [
    `- Avaliação do usado: ${SITE_URL}/avaliacao — o cliente manda o carro dele e um`,
    "  consultor retorna com a proposta. O valor sai depois da vistoria presencial.",
    `- Garagem Profiler: ${SITE_URL}/carro-perfeito — cinco perguntas, e a tela mostra`,
    "  três carros do pátio com o porquê de cada um; o consultor confirma no WhatsApp.",
    `- Simulador de financiamento: ${SITE_URL}/financiamento — o número de lá é`,
    "  estimativa; quem fecha a condição é o banco.",
    `- Vitrine completa: ${SITE_URL}/estoque`,
    `- Repasse Motors: ${SITE_URL}${CAMINHO_DO_REPASSE} — carros vendidos no estado, sem a garantia`,
    "  da loja e só à vista. O que é e como funciona está no documento do repasse.",
    "- Encomenda: quando o modelo não está no pátio, a página da marca ou do modelo",
    "  tem \"Encomende seu carro\". O cliente deixa nome, WhatsApp e faixa de preço, e",
    "  um consultor chama quando entrar. Sem prazo.",
  ]);

  const dados = bloco("Dados do cliente (LGPD)", [
    "A loja coleta nome, telefone e o interesse declarado, para atender e dar",
    "retorno. O cliente pode pedir acesso, correção ou exclusão a qualquer momento.",
    `A política completa está em ${SITE_URL}/privacidade.`,
    "",
    "**Quero apagar meus dados**",
    "Pode pedir. Encaminhe para um humano e diga que a loja atende o pedido — não",
    "peça documento nem confirme por conta própria o que a loja tem sobre ele.",
    "",
    "Nunca confirme nem negue se uma pessoa específica é ou foi cliente.",
  ]);

  const texto = cabecalho + endereco + garantia + financiamento + ferramentas + dados;

  // O teto vale para este documento também. Cortar aqui seria perder uma seção
  // inteira em silêncio — então o arquivo AVISA em vez de encolher sozinho.
  if (texto.length > TETO_DO_CAPTAIN - MARGEM) {
    return `${texto.slice(0, TETO_DO_CAPTAIN - MARGEM - 200)}\n\n---\n\n## AVISO\n\nEste arquivo passou do limite que o Chatwoot guarda e foi cortado aqui. Quem mexeu no texto institucional precisa encurtá-lo ou dividi-lo em dois documentos.\n`;
  }
  return texto;
}
