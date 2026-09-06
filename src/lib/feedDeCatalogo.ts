import { fotosDoVeiculo } from "./fotosDoVeiculo";
import type { SegmentoDePdp } from "./veiculoUrl";

/**
 * As peças puras do feed de catálogo — o XML que alimenta o Meta e o Google.
 *
 * ---------------------------------------------------------------------------
 * Por que "feedDeCatalogo" e não "feedXml"
 * ---------------------------------------------------------------------------
 * Neste repositório "feed", sozinho, significa o feed do RevendaMais: é o que
 * `getEstoque`, `foraDoFeed`, `last_seen_at` e `apenasDoUltimoSync` querem
 * dizer. Aquele é o feed de ENTRADA. Este é o de SAÍDA, e o nome mais longo
 * existe para os dois não se confundirem numa busca por "feed".
 *
 * ---------------------------------------------------------------------------
 * Por que um módulo, e não mais um bloco dentro da rota
 * ---------------------------------------------------------------------------
 * Até 2026-09-06 o escape de XML da rota era inline, escrito três vezes e
 * diferente em cada uma: o título escapava `& < >`, a descrição idem, e a
 * marca escapava só o `&`. As duas linhas que mais importam — `<g:link>` e
 * `<g:image_link>` — não escapavam nada. Regra copiada três vezes é regra que
 * já divergiu; e a divergência aqui não dá erro de item, dá arquivo inválido.
 *
 * O módulo é puro e sem I/O de propósito: é a parte que dá para testar sem
 * banco e sem rede, que é onde os defeitos deste feed moram.
 */

/**
 * Texto seguro para um nó de XML.
 *
 * O `&` vem PRIMEIRO e a ordem não é estilo: escapando `<` antes, o `&` recém
 * nascido em `&lt;` seria escapado por cima e o anúncio sairia com
 * `&amp;lt;` no título. É o erro clássico, e passa despercebido porque o
 * documento continua válido — só o texto fica errado.
 *
 * `&` já escapado na origem vira `&amp;amp;`, e isso é deliberado: o dado que
 * chega do cadastro é TEXTO, não marcação. Tentar reconhecer entidade que já
 * existe é adivinhar intenção, e basta adivinhar errado uma vez para o arquivo
 * inteiro cair.
 *
 * Os caracteres de controle saem porque o XML 1.0 não os admite nem escapados
 * — não existe entidade para `\x0B`. Eles chegam por texto colado no painel,
 * atravessam tsc, eslint e vitest sem sintoma, e só aparecem quando o Meta
 * recusa a carga. Tabulação, quebra de linha e retorno são os três permitidos
 * e ficam.
 */
export function escaparXml(valor: unknown): string {
  if (valor === null || valor === undefined) return "";

  let saida = "";
  for (const caractere of String(valor)) {
    const codigo = caractere.codePointAt(0) ?? 0;
    // C0 exceto \t \n \r: proibidos em XML 1.0, e sem entidade que os salve.
    if (codigo < 0x20 && codigo !== 0x09 && codigo !== 0x0a && codigo !== 0x0d) continue;

    if (caractere === "&") saida += "&amp;";
    else if (caractere === "<") saida += "&lt;";
    else if (caractere === ">") saida += "&gt;";
    else if (caractere === '"') saida += "&quot;";
    else if (caractere === "'") saida += "&apos;";
    else saida += caractere;
  }
  return saida;
}

/**
 * O teto de caracteres do título de um item de catálogo.
 *
 * O Meta reporta `property_value_string_exceeds_length` acima disto, e o
 * Merchant Center corta na exibição. Hoje nenhum título do feed chega perto —
 * o maior tem 54 caracteres, porque `nomeDoVeiculo` já deduplica marca, modelo
 * e versão. Isto é guarda, não correção: nada impede uma `versao` longa de
 * chegar amanhã pelo sync, e o corte tem de ser nosso e previsível, não do
 * portal.
 */
export const LIMITE_DO_TITULO = 65;

/**
 * Corta no limite de palavra, sem reticências.
 *
 * Reticências gastam três dos caracteres que estão justamente em falta, e num
 * título de anúncio não comunicam nada — o leitor não vai clicar em "ver
 * mais". Palavra partida é pior ainda: "Volkswagen Saveiro 1.6 MSI Rob".
 *
 * O `maximo + 1` da fatia é o detalhe que precisa estar certo: sem ele, um
 * texto cuja palavra termina EXATAMENTE na posição do limite perde essa
 * palavra inteira, porque o `lastIndexOf` encontra o espaço anterior. Custa o
 * modelo ou o ano no fim do título.
 *
 * Palavra única maior que o limite vira corte duro. Título cortado é item
 * entregue; título em branco é item reprovado.
 */
export function truncarEmPalavra(texto: string, maximo: number): string {
  if (texto.length <= maximo) return texto;

  const corte = texto.slice(0, maximo + 1);
  const ultimoEspaco = corte.lastIndexOf(" ");
  if (ultimoEspaco <= 0) return texto.slice(0, maximo);

  return corte.slice(0, ultimoEspaco).trimEnd();
}

/**
 * Quantas fotos cabem num item — capa mais adicionais.
 *
 * É o teto do `additional_image_link` do Meta (10 no total). O feed de
 * veículos do AIA aceita 20 por `image[N].url`, e por isso a constante mora
 * aqui e não numa expressão solta: quando aquele feed existir, ele vai querer
 * o seu próprio número, e os dois não podem virar o mesmo literal espalhado.
 */
export const MAXIMO_DE_IMAGENS = 10;

/** Só endereço absoluto serve num feed: o portal busca a imagem de fora. */
function ehUrlAbsoluta(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * A galeria do anúncio, na mesma ordem da ficha.
 *
 * Reusa `fotosDoVeiculo` — a função que a PDP já usa — em vez de reler as duas
 * colunas aqui. Isso não é só economia: ela pareia por ÍNDICE e descarta
 * string vazia, e é isso que fecha o buraco que a rota tinha. O gate de
 * publicação conta `filter(Boolean).length >= 4` sobre a linha crua, então um
 * array como `["", "", url, url, url, url]` passa no gate; a rota indexava
 * `[0]` sem checar e emitia `<g:image_link></g:image_link>` — item reprovado
 * sem sintoma nenhum no nosso lado.
 *
 * Fora URL relativa: `/logo.png` é o último degrau do mapper, e caminho
 * relativo num feed é foto que o portal não consegue buscar.
 *
 * Deduplica porque URL repetida queimaria uma das dez vagas com a mesma
 * imagem, e o Meta conta o item como tendo menos fotos do que a galeria tem.
 */
export function imagensDoAnuncio(whatsapp: unknown, webFull: unknown): string[] {
  const vistas = new Set<string>();
  const urls: string[] = [];

  for (const foto of fotosDoVeiculo(whatsapp, webFull)) {
    const url = foto.zap.trim();
    if (!ehUrlAbsoluta(url) || vistas.has(url)) continue;

    vistas.add(url);
    urls.push(url);
    if (urls.length === MAXIMO_DE_IMAGENS) break;
  }

  return urls;
}

/**
 * A categoria do item na taxonomia **do Google**.
 *
 * ⚠️ Não confundir com `fb_product_category`. A taxonomia do Facebook não tem
 * categoria para veículo inteiro — o mais próximo é `auto parts & accessories
 * > car parts & accessories`, que seria afirmar que o carro é uma peça.
 * Conferido na lista oficial em 2026-09-06. Mandar a string do Google naquele
 * campo produz exatamente o `invalid_facebook_product_category` que se está
 * corrigindo; mandá-la em `google_product_category`, que é a casa dela, deixa
 * o Meta fazer o mapeamento para a taxonomia dele por conta própria.
 *
 * Texto CRU: quem escapa é a emissão. Guardar `&amp;` aqui sairia como
 * `&amp;amp;` no XML.
 *
 * Os ids equivalentes são `920` (carros) e `919` (motos), e o Google aceita os
 * dois formatos. Ficam registrados aqui como saída de emergência: se a grafia
 * da taxonomia mudar, o número não muda.
 */
export const CATEGORIA_GOOGLE_POR_SEGMENTO: Record<SegmentoDePdp, string> = {
  carros: "Vehicles & Parts > Vehicles > Motor Vehicles > Cars, Trucks & Vans",
  motos: "Vehicles & Parts > Vehicles > Motor Vehicles > Motorcycles & Scooters",
};

/**
 * O `g:vehicle_type` de cada segmento.
 *
 * A rota mandava `car` fixo, inclusive para as motos do pátio — o catálogo
 * aceitava, e anunciava moto como carro. `segmentoDoVeiculo` já sabe a
 * diferença e já é chamado na rota, para o gênero do texto.
 */
export const TIPO_DE_VEICULO_POR_SEGMENTO: Record<SegmentoDePdp, string> = {
  carros: "car",
  motos: "motorcycle",
};
