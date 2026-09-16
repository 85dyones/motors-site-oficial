/**
 * As fotos de um anúncio, lidas do feed XML do RevendaMais sob demanda.
 *
 * ---------------------------------------------------------------------------
 * Por que este módulo existe
 * ---------------------------------------------------------------------------
 * Entre 30/08 e hoje, a foto de um veículo `origem = 'sync'` não tinha dono.
 * A trava `estoque_motors_trava_do_sync` virou allowlist de seis colunas
 * (`preco`, `preco_original`, `preco_promocional`, `last_seen_at`, `portas`,
 * `opcionais`) e foto não está entre elas — o sync tenta gravar a cada seis
 * horas e o banco descarta em silêncio. Do outro lado, `GaleriaDeFotos` recusava
 * envio pelo painel em veículo do feed, com uma nota que dizia que "as fotos
 * são reescritas a cada sincronização". Desde 30/08 isso deixou de ser verdade,
 * e as duas recusas juntas fecharam a porta: ninguém conseguia pôr foto. (A
 * recusa da galeria caiu em 16/09, na fusão com o PR #45: o envio vale para
 * qualquer origem, e este botão ficou como o outro caminho.)
 *
 * O defeito não é teórico. Medido em 15/09 contra o feed em produção:
 *
 *   Nissan Versa 1.6 Advance CVT (8454320)  17 fotos no feed, 0 no banco
 *   Hyundai HB20 1.0 Sense       (8440742)  15 fotos no feed, 0 no banco
 *
 * Os dois entraram no feed ANTES de a loja subir as fotos — o sync os inseriu
 * com `[""]`, um array de uma string vazia —, e ficaram presos em `rascunho`
 * abaixo do mínimo de quatro fotos, invisíveis no site por uma semana.
 *
 * ---------------------------------------------------------------------------
 * Por que sob demanda, e não de volta na trava
 * ---------------------------------------------------------------------------
 * Decisão do dono em 15/09: importar foto é ATO de gente, com botão no painel.
 * Reabrir a coluna para o sync resolveria estes dois carros e criaria o defeito
 * oposto — o ciclo de seis horas passaria por cima de galeria curada ou subida
 * pelo painel, calado, a cada seis horas. É a mesma régua de `arquivado` em
 * `lib/estoqueTabela.ts`: o que desfaz trabalho de gente não acontece sozinho.
 *
 * A escrita sai daqui pela sessão de quem clicou (`authenticated`), que é o
 * ramo da trava que PASSA — ela só descarta escrita de `service_role` ou que
 * mexa em `last_seen_at`. Este módulo não toca no carimbo, de propósito: ele
 * é a assinatura do robô, e movê-lo faria a importação se disfarçar de sync.
 */

/** Uma foto do anúncio, nas duas variantes que o feed publica. */
export interface FotoDoFeed {
  /** `_O_` no S3 do carro57 — o original JPEG. Vai para `whatsapp_images`. */
  zap: string;
  /** `_W_` no S3 do carro57 — a versão web. Vai para `web_full_images`. */
  web: string;
}

/**
 * O que a busca encontrou. Os três casos são diferentes e a tela diz coisas
 * diferentes em cada um — juntá-los num `FotoDoFeed[] | null` faria "anúncio
 * que saiu do feed" e "anúncio sem foto" darem a mesma mensagem, e a segunda
 * manda esperar por algo que a primeira nunca vai trazer.
 */
export type ResultadoDaBusca =
  | { tipo: "achou"; fotos: FotoDoFeed[] }
  /** O id não está no feed de hoje — carro que saiu do RevendaMais. */
  | { tipo: "fora-do-feed" }
  /** Está no feed, e o anúncio não tem foto nenhuma lá também. */
  | { tipo: "sem-fotos" };

/**
 * Quanto esperar pelo feed antes de desistir.
 *
 * O XML inteiro são ~180 KB e volta em menos de um segundo em condição normal.
 * O limite existe para o caso ruim: o RevendaMais pendurado seguraria a rota
 * até o teto da função na Vercel, e o operador veria a tela travada sem saber
 * de quem é a culpa. Quinze segundos é folgado para a resposta boa e curto o
 * bastante para virar mensagem em vez de espera.
 */
const TETO_DA_ESPERA_MS = 15_000;

/**
 * Entidades XML que aparecem em URL de imagem. O feed escapa `&` em query
 * string, e uma URL com `&amp;` no meio devolve 404 no navegador — vira foto
 * quebrada na ficha, que é pior que foto ausente porque ninguém a conta.
 */
function decodificarEntidades(texto: string): string {
  return texto
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, codigo) => String.fromCodePoint(Number(codigo)))
    // `&amp;` por último: antes dos outros ele reintroduziria o `&` de
    // `&amp;lt;` e a segunda passada o transformaria em `<`.
    .replace(/&amp;/g, "&");
}

/**
 * Todos os valores de uma tag dentro de um trecho, na ordem em que aparecem.
 *
 * A ordem importa: a primeira foto é a capa do card, do WhatsApp e do anúncio
 * no portal, e `whatsapp_images[i]` tem de ser a MESMA fotografia que
 * `web_full_images[i]` (ver `lib/fotosDoVeiculo.ts`).
 */
function valoresDaTag(trecho: string, tag: string): string[] {
  const achados: string[] = [];
  const padrao = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = padrao.exec(trecho)) !== null) {
    const valor = decodificarEntidades(m[1].trim());
    if (valor) achados.push(valor);
  }
  return achados;
}

/**
 * O bloco `<AD>` de um id, ou `null` se ele não está no feed.
 *
 * Exportada para o teste poder trabalhar sobre XML de mentira, sem rede.
 *
 * Lê com expressão regular e não com parser de XML de propósito: o projeto não
 * tem dependência de XML, o feed é plano e gerado por máquina, e o que se quer
 * daqui são duas tags. Trazer um parser para isso seria mais superfície a
 * manter do que as quinze linhas que ele substituiria. O recorte é por bloco
 * `<AD>`, nunca no documento inteiro — casar `<IMAGE_URL>` de forma solta
 * traria as fotos do anúncio vizinho para dentro da ficha errada.
 */
export function anuncioNoXml(xml: string, id: string | number): string | null {
  const alvo = String(id).trim();
  if (!/^\d+$/.test(alvo)) return null;

  for (const bloco of xml.split("<AD>")) {
    const achado = /<ID>\s*(\d+)\s*<\/ID>/.exec(bloco);
    if (achado && achado[1] === alvo) return bloco;
  }
  return null;
}

/**
 * As fotos de um anúncio dentro de um XML já carregado.
 *
 * Separada de `buscarFotosNoFeed` para o teste exercer o pareamento sem rede.
 * `IMAGES` traz os `_O_` (JPEG original) e `IMAGES_LARGE` os `_W_` (web), e as
 * duas listas andam pareadas por índice — é isso que faz "a primeira é a capa"
 * valer nas duas colunas ao mesmo tempo.
 *
 * Quando uma das listas vem mais curta, o índice sem par reaproveita a variante
 * que existe em vez de descartar a foto: metade da resolução certa é melhor que
 * um buraco na galeria, e a ficha nunca fica com `undefined` no `src`.
 */
export function fotosDoAnuncio(anuncio: string): FotoDoFeed[] {
  const zaps = valoresDaTag(anuncio, "IMAGE_URL");
  const webs = valoresDaTag(anuncio, "IMAGE_URL_LARGE");

  const fotos: FotoDoFeed[] = [];
  for (let i = 0; i < Math.max(zaps.length, webs.length); i += 1) {
    const zap = zaps[i] ?? webs[i];
    const web = webs[i] ?? zaps[i];
    if (zap && web) fotos.push({ zap, web });
  }
  return fotos;
}

/** A mensagem que a rota devolve quando falta a variável de ambiente. */
export const AVISO_SEM_URL =
  "REVENDAMAIS_FEED_URL não está configurada no deploy — sem ela não há de onde " +
  "ler as fotos do feed. O endereço é o mesmo que o workflow do n8n usa no nó " +
  '"Buscar XML RevendaMais".';

/**
 * Busca as fotos de UM anúncio no feed do RevendaMais.
 *
 * Baixa o XML inteiro porque o RevendaMais não publica recorte por anúncio: o
 * feed é um arquivo só, e não há endereço para "o anúncio 8454320". São ~180 KB
 * por clique, num botão que uma pessoa aperta quando acabou de subir foto —
 * não é caminho quente.
 *
 * `cache: "no-store"` não é excesso: quem clica acabou de subir as fotos no
 * RevendaMais e está conferindo se chegaram. Uma resposta de cache devolveria a
 * lista velha e o botão pareceria quebrado justamente na hora em que ele é a
 * única saída.
 */
export async function buscarFotosNoFeed(id: string | number): Promise<ResultadoDaBusca> {
  const endereco = process.env.REVENDAMAIS_FEED_URL?.trim();
  if (!endereco) throw new Error(AVISO_SEM_URL);

  const relogio = AbortSignal.timeout(TETO_DA_ESPERA_MS);
  const resposta = await fetch(endereco, { cache: "no-store", signal: relogio });
  if (!resposta.ok) {
    throw new Error(
      `O RevendaMais respondeu ${resposta.status} ao feed. Nada foi alterado neste veículo.`,
    );
  }

  const anuncio = anuncioNoXml(await resposta.text(), id);
  if (!anuncio) return { tipo: "fora-do-feed" };

  const fotos = fotosDoAnuncio(anuncio);
  return fotos.length > 0 ? { tipo: "achou", fotos } : { tipo: "sem-fotos" };
}
