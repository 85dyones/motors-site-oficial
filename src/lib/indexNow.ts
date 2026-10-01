import type { MetadataRoute } from "next";

/**
 * IndexNow: o aviso ao Bing (e a quem mais participa do protocolo) de que uma
 * página mudou (01/10/2026).
 *
 * O Google só usa o sitemap e o próprio rastreamento. O Bing aceita o aviso
 * direto, e a busca do Bing alimenta o ChatGPT e o Copilot. Para uma vitrine
 * que muda todo dia, esperar o rastreador passar é perder o carro que entrou
 * hoje.
 *
 * A chave é pública por definição: o protocolo prova a posse do domínio
 * pedindo que ela esteja num arquivo na raiz (`public/<chave>.txt`). Por isso
 * mora aqui, no código, e não numa variável de ambiente.
 *
 * O que vai no aviso sai do próprio sitemap: as entradas cujo `lastModified`
 * caiu dentro da janela. O sitemap já é a régua do que pode ser indexado
 * (sem vendido além da carência, sem hub adormecido, sem rascunho), então o
 * aviso não tem como chamar o buscador para uma página que o site não quer
 * na busca.
 */
export const CHAVE_INDEXNOW = "ccfa91c4a0afe2db82d7915e5120d524";

export const ENDPOINT_INDEXNOW = "https://api.indexnow.org/IndexNow";

/** O limite do protocolo por pedido. */
export const LIMITE_DE_URLS = 10_000;

/**
 * A janela, em horas. O aviso roda uma vez por dia; 26 horas cobrem o dia
 * inteiro com folga para o horário do agendador escorregar, e a sobra só
 * repete o aviso de uma página, o que o protocolo tolera.
 */
export const JANELA_EM_HORAS = 26;

const instante = (valor: string | Date | undefined): number =>
  valor ? new Date(valor).getTime() : Number.NaN;

/**
 * As URLs que mudaram dentro da janela.
 *
 * Fica de fora o que carrega o carimbo GLOBAL do inventário (o `lastModified`
 * da home, que o sitemap repete em hubs, páginas de bairro, destaques e
 * /financiamento). Esse carimbo anda quando QUALQUER carro muda, então o hub
 * da Fiat seria avisado porque uma Harley baixou de preço. No sitemap o
 * exagero é passivo; aqui viraria um envio diário de páginas iguais, e o
 * protocolo pede só o que mudou (revisão do qa-guardian, 01/10/2026). A home
 * e o /estoque continuam: eles de fato mostram o carro que entrou. Os hubs
 * são achados pelo Bing a partir das fichas, que vão com carimbo próprio.
 */
export function urlsParaAvisar(
  entradas: MetadataRoute.Sitemap,
  agora: Date,
  siteUrl: string,
  janelaEmHoras = JANELA_EM_HORAS,
): string[] {
  const desde = agora.getTime() - janelaEmHoras * 3_600_000;
  const sempre = new Set([siteUrl, `${siteUrl}/estoque`]);
  const carimboGlobal = instante(entradas.find((e) => e.url === siteUrl)?.lastModified);
  const urls = new Set<string>();
  for (const entrada of entradas) {
    const quando = instante(entrada.lastModified);
    if (Number.isNaN(quando) || quando < desde || quando > agora.getTime() + 3_600_000) continue;
    // A ficha do carro que mudou por último tem o MESMO instante do carimbo
    // global (ele é o máximo das fichas), e é justamente a que mais importa
    // avisar. Ficha é a URL de quatro segmentos (/carros/marca/modelo/versao-id);
    // hub, bairro e destaque têm no máximo três.
    const ehFicha = new URL(entrada.url).pathname.split("/").filter(Boolean).length >= 4;
    if (quando === carimboGlobal && !sempre.has(entrada.url) && !ehFicha) continue;
    urls.add(entrada.url);
  }
  return [...urls].slice(0, LIMITE_DE_URLS);
}

export function montarAviso(siteUrl: string, urls: string[]) {
  const { host } = new URL(siteUrl);
  return {
    host,
    key: CHAVE_INDEXNOW,
    keyLocation: `${siteUrl}/${CHAVE_INDEXNOW}.txt`,
    urlList: urls,
  };
}
