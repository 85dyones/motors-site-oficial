import { unstable_cache } from "next/cache";
import { getCachedSettings } from "../../../../lib/settings";
import { telefoneVisivel } from "../../../../lib/whatsapp";
import { SITE_URL } from "../../../../lib/site";
import type { CompanySettings } from "../../../../types";
import {
  GARANTIA_MESES,
  PERGUNTAS_DE_FINANCIAMENTO,
  PERGUNTAS_DE_GARANTIA,
  TEXTO_DE_FINANCIAMENTO,
  TEXTO_DE_GARANTIA,
} from "../../../../lib/paginasInstitucionais";

/**
 * O que a loja é, escrito para o assistente do WhatsApp ler.
 *
 * ---------------------------------------------------------------------------
 * Por que uma rota, e não ingerir as páginas
 * ---------------------------------------------------------------------------
 * O Captain **rastreia os links da página que recebe**. Medido em 05/09/2026:
 * ingerir três URLs (`/api/ney`, `/garantia`, `/privacidade`) produziu
 * **48 documentos** — o rodapé do `/garantia` arrastou os treze hubs de marca,
 * as sete faixas de preço, dez âncoras da própria política de privacidade, o
 * `wa.me` e até o site da ANPD.
 *
 * Vinte e seis desses documentos carregavam preço de carro congelado, que é
 * exatamente o que o assistente está proibido de dizer. Apagá-los à mão e
 * reingerir a mesma página os traz de volta.
 *
 * `/api/ney` escapou porque é `text/plain`: sem `<a>`, não há o que seguir.
 * Esta rota é o mesmo truque aplicado ao institucional — o conteúdo das
 * páginas, sem a navegação que as acompanha.
 *
 * ---------------------------------------------------------------------------
 * A fonte é a mesma que o site publica
 * ---------------------------------------------------------------------------
 * Nada aqui é reescrito à mão. Garantia, financiamento, endereço e horário
 * saem de `paginasInstitucionais.ts` e das configurações — os mesmos módulos
 * que alimentam `/garantia`, `/financiamento` e o rodapé. Texto copiado
 * envelheceria em silêncio, e o assistente afirmaria no privado uma versão que
 * o site já corrigiu.
 */

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
 * O recorte das configurações que este arquivo lê.
 *
 * `Pick` do tipo real, e não um objeto solto: assim o teste pode montar um
 * dublê e o compilador continua exigindo os campos que `telefoneVisivel`
 * precisa.
 */
type DadosDaLoja = Pick<CompanySettings, "name" | "address" | "hours" | "whatsapp" | "whatsappRaw">;

export function montarLoja(empresa: DadosDaLoja, geradoEm: string): string {
  const cabecalho = [
    "# A Motors Store, para o atendente virtual",
    "",
    "Este arquivo é o que a loja É: garantia, financiamento, endereço, horário e",
    "as perguntas que mais chegam. A ficha técnica de cada carro está no outro",
    "documento.",
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
    "Uma unidade só — e a loja entrega para todo o Brasil.",
    empresa.hours ? `Horário: ${String(empresa.hours).replace(/\n/g, " · ")}` : "",
    `WhatsApp e telefone: ${telefoneVisivel(empresa)}`,
    "",
    "Frete, prazo e forma de entrega são combinados caso a caso com o consultor.",
    "Nunca prometa prazo, valor de frete nem frete grátis.",
  ]);

  const garantia = bloco("Garantia", [
    // O prazo em linha própria, e vindo da constante: a prosa abaixo diz "três
    // meses" por extenso, e um assistente que precisa responder "quantos
    // meses?" acha mais rápido o número do que a palavra. Escrever "3" à mão
    // aqui criaria a terceira versão do mesmo prazo no repositório.
    `Prazo: ${GARANTIA_MESES} meses de motor e câmbio, contados da entrega, sem carência e sem franquia.`,
    "",
    ...TEXTO_DE_GARANTIA,
    "",
    ...perguntas(PERGUNTAS_DE_GARANTIA),
  ]);

  const financiamento = bloco("Financiamento", [
    ...TEXTO_DE_FINANCIAMENTO,
    "",
    ...perguntas(PERGUNTAS_DE_FINANCIAMENTO),
    "",
    "Nunca diga taxa, parcela ou valor, e nunca diga que a aprovação é garantida,",
    "fácil ou rápida. Não peça CPF, RG, comprovante de renda nem dado bancário —",
    "o consultor coleta no canal próprio.",
  ]);

  const ferramentas = bloco("O que a loja tem no site", [
    `- Avaliação do usado: ${SITE_URL}/avaliacao — o cliente manda o carro dele e um`,
    "  consultor retorna com a proposta. O valor sai depois da vistoria presencial.",
    `- Garagem Profiler: ${SITE_URL}/carro-perfeito — cinco perguntas, e o consultor`,
    "  manda três sugestões do estoque.",
    `- Simulador de financiamento: ${SITE_URL}/financiamento — o número de lá é`,
    "  estimativa; quem fecha a condição é o banco.",
    `- Vitrine completa: ${SITE_URL}/estoque`,
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

const loja = unstable_cache(
  async (): Promise<string> => {
    const { companySettings } = await getCachedSettings();
    return montarLoja(
      companySettings,
      new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    );
  },
  ["institucional-para-o-assistente"],
  { revalidate: 3600 },
);

export async function GET() {
  return new Response(await loja(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
