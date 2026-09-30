import type { PublicacaoInstagram } from "./instagramCuradoria";

/**
 * A faixa do Instagram da home, automática (pedido do dono em 30/09/2026).
 *
 * Lê as publicações mais recentes de @motorsstore.oficial pela Instagram Graph
 * API, no servidor, a cada hora. A curadoria do painel
 * (`lib/instagramCuradoria.ts`) vira reserva: é ela que aparece se a API
 * falhar ou se as variáveis não estiverem configuradas.
 *
 * ---------------------------------------------------------------------------
 * O que mudou desde a decisão pela curadoria
 * ---------------------------------------------------------------------------
 * A curadoria nasceu porque o token do Instagram "expirava em 60 dias". Isso
 * vale para o token de usuário. O token de USUÁRIO DO SISTEMA do Business
 * Manager não expira, e é ele que este módulo espera em `INSTAGRAM_TOKEN`. A
 * outra objeção, a `media_url` assinada que expira sozinha, é resolvida pelo
 * cache de uma hora: a URL é sempre recente.
 *
 * ---------------------------------------------------------------------------
 * Sem legenda, de propósito
 * ---------------------------------------------------------------------------
 * As legendas do perfil trazem preço de parcela, promoção com data ("Feirão até
 * 20/09"), promessas que o site não faz ("recompra de até 90% da FIPE") e o
 * endereço antigo da loja (Rua Canadá). Medido em 30/09. A foto vai para o
 * site e o texto fica no Instagram, a um clique.
 */

/** Quantas publicações a faixa mostra: uma linha de seis no desktop. */
export const PUBLICACOES_AO_VIVO = 6;

/** Uma leitura por hora. A `media_url` do Instagram é assinada e vence em dias. */
const VALIDADE_DO_CACHE_S = 3_600;

/** A mesma versão do resto da integração com a Meta (`META_GRAPH_API_VERSION`);
 *  sem ela, a última que este módulo conhece. */
const VERSAO_PADRAO = "v23.0";

/** A Graph API travada não pode travar a geração da home. */
const TEMPO_LIMITE_MS = 5_000;

const CAMPOS = ["id", "media_type", "media_product_type", "media_url", "thumbnail_url", "permalink"].join(",");

/** O formato da Graph API, só o que este módulo consome. */
type MidiaCrua = {
  id?: string;
  media_type?: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | string;
  media_product_type?: "FEED" | "REELS" | "STORY" | "AD" | string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
};

function https(url: string | undefined): string | null {
  return typeof url === "string" && /^https:\/\//i.test(url) ? url : null;
}

/**
 * Converte a resposta crua da API na lista que a faixa desenha. Separada do
 * `fetch` para ser testável sem rede.
 *
 * - Vídeo (Reels) entra pela capa (`thumbnail_url`); a `media_url` dele é o mp4.
 * - Carrossel entra pela primeira foto, que é a `media_url` dele.
 * - Story fica de fora: some em 24 h e não é vitrine.
 * - Sem imagem ou sem link, fica de fora: quadro sem foto é buraco na grade, e
 *   sem link não há como ver o post inteiro.
 */
export function montarPublicacoes(bruto: unknown, limite: number = PUBLICACOES_AO_VIVO): PublicacaoInstagram[] {
  const dados = (bruto as { data?: unknown })?.data;
  if (!Array.isArray(dados)) return [];

  const publicacoes: PublicacaoInstagram[] = [];
  for (const item of dados as MidiaCrua[]) {
    if (!item || typeof item !== "object" || !item.id) continue;
    if (item.media_product_type === "STORY") continue;

    const imagemUrl = item.media_type === "VIDEO" ? https(item.thumbnail_url) : https(item.media_url);
    // Carrossel que abre com vídeo traz o mp4 em `media_url`: quadro quebrado.
    if (imagemUrl && /\.(mp4|mov)(\?|$)/i.test(imagemUrl)) continue;
    const permalink = https(item.permalink);
    if (!imagemUrl || !permalink) continue;

    publicacoes.push({ id: item.id, imagemUrl, permalink, legenda: null });
    if (publicacoes.length >= limite) break;
  }
  return publicacoes;
}

/**
 * As publicações recentes, ou `null` quando não dá para ler: variáveis
 * ausentes, token sem permissão ou API fora. `null` manda a home usar a
 * curadoria do painel.
 */
export async function getInstagramAoVivo(): Promise<PublicacaoInstagram[] | null> {
  const token = process.env.INSTAGRAM_TOKEN;
  const conta = process.env.INSTAGRAM_USER_ID;

  if (!token || !conta) {
    console.info("[Instagram] INSTAGRAM_TOKEN/INSTAGRAM_USER_ID ausentes — faixa usa a curadoria do painel.");
    return null;
  }

  try {
    const versao = process.env.META_GRAPH_API_VERSION?.trim();
    const url =
      `https://graph.facebook.com/${versao && /^v\d+\.\d+$/.test(versao) ? versao : VERSAO_PADRAO}/${encodeURIComponent(conta)}/media` +
      `?fields=${CAMPOS}&limit=${PUBLICACOES_AO_VIVO * 3}`;
    const res = await fetch(url, {
      // O token vai no cabeçalho, e não na query string: a URL vai para log de
      // servidor e de proxy, e o token junto.
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      next: { revalidate: VALIDADE_DO_CACHE_S, tags: ["instagram_ao_vivo"] },
    });

    if (!res.ok) {
      // O corpo diz o que faltou: token vencido, permissão, conta errada.
      console.warn(`[Instagram] Graph API respondeu ${res.status}:`, await res.text());
      return null;
    }

    const publicacoes = montarPublicacoes(await res.json());
    return publicacoes.length > 0 ? publicacoes : null;
  } catch (err) {
    console.warn("[Instagram] Falha ao consultar a Graph API:", err);
    return null;
  }
}
