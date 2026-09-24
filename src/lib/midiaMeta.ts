import {
  normalizarMeta,
  type Janela,
  type LoteNormalizado,
  type MetaAlcance,
  type MetaCampanha,
  type MetaInsightAnuncio,
} from "./midiaSync";

/**
 * Leitura do Meta Ads pela Graph API (spec 2026-09-24).
 *
 * Três chamadas, todas na conta de anúncio:
 *   1. /campaigns — nome, objetivo, situação, orçamento, início;
 *   2. /insights por ANÚNCIO e por DIA na janela — gasto, impressões,
 *      cliques no link e ações (de onde saem os leads);
 *   3. /insights por campanha, vida inteira — só o alcance, que não soma.
 *
 * O token vai no cabeçalho `Authorization`, nunca na URL: URL aparece em log
 * de proxy, e cabeçalho não.
 */

/** Conta "motorsstore" (BM Motors Store), lida em 24/09. Não é segredo. */
const CONTA_PADRAO = "802008949148808";
const TEMPO_LIMITE_MS = 20000;
/** Teto de páginas por chamada: a conta tem dezenas de anúncios, não milhares. */
const MAX_PAGINAS = 20;

const SITUACOES_LISTADAS = ["ACTIVE", "PAUSED", "IN_PROCESS", "WITH_ISSUES", "PENDING_REVIEW"];

export interface ConfigMeta {
  token: string;
  conta: string;
  versao: string;
}

/** Lê o ambiente. Devolve `{ erro }` com o motivo quando falta algo. */
export function configMeta(): ConfigMeta | { erro: string } {
  // O token de leitura de anúncios pode ser o mesmo usuário do sistema da
  // CAPI, desde que ele tenha `ads_read` na conta — por isso o fallback.
  const token = (process.env.META_ADS_ACCESS_TOKEN || process.env.META_CAPI_ACCESS_TOKEN)?.trim();
  const versao = process.env.META_GRAPH_API_VERSION?.trim();
  const conta = (process.env.META_AD_ACCOUNT_ID?.trim() || CONTA_PADRAO).replace(/^act_/, "");
  if (!token) return { erro: "falta o token do Meta (META_ADS_ACCESS_TOKEN)" };
  if (!versao || !/^v\d+\.\d+$/.test(versao)) {
    return { erro: "META_GRAPH_API_VERSION ausente ou fora da forma vNN.N" };
  }
  return { token, conta, versao };
}

/** Traduz o erro do Graph para a frase que o dono lê no painel. */
export function mensagemDoErroMeta(erro: { code?: number; message?: string } | undefined, conta: string): string {
  const code = erro?.code;
  if (code === 190) return "token do Meta inválido ou expirado — gere outro no usuário do sistema";
  // 10 e a faixa 200–299 são as famílias de "permissão negada" do Graph.
  if (code === 10 || (code !== undefined && code >= 200 && code < 300)) {
    return `o token não tem permissão ads_read na conta act_${conta}`;
  }
  if (code === 4 || code === 17 || code === 613 || code === 80004) {
    return "limite de chamadas do Meta atingido — a próxima rodada tenta de novo";
  }
  return `Meta respondeu: ${erro?.message ?? "erro sem mensagem"}`;
}

type Buscar = typeof fetch;

async function paginar<T>(url: string, cfg: ConfigMeta, buscar: Buscar): Promise<T[]> {
  const linhas: T[] = [];
  let proxima: string | undefined = url;
  for (let pagina = 0; proxima && pagina < MAX_PAGINAS; pagina++) {
    const res = await buscar(proxima, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      cache: "no-store",
    });
    const corpo = (await res.json().catch(() => ({}))) as {
      data?: T[];
      paging?: { next?: string };
      error?: { code?: number; message?: string };
    };
    if (!res.ok || corpo.error) {
      throw new Error(mensagemDoErroMeta(corpo.error ?? { message: `HTTP ${res.status}` }, cfg.conta));
    }
    linhas.push(...(corpo.data ?? []));
    // O `next` do Graph repete o access_token se ele tiver vindo na URL. Como
    // o nosso vai no cabeçalho, o `next` sai limpo.
    proxima = corpo.paging?.next;
  }
  return linhas;
}

export async function buscarMeta(
  janela: Janela,
  cfg: ConfigMeta,
  buscar: Buscar = fetch,
): Promise<LoteNormalizado> {
  const base = `https://graph.facebook.com/${cfg.versao}/act_${cfg.conta}`;
  const q = (p: Record<string, string>) => new URLSearchParams(p).toString();

  const [campanhas, insights, alcances] = await Promise.all([
    paginar<MetaCampanha>(
      `${base}/campaigns?${q({
        fields: "id,name,objective,effective_status,daily_budget,start_time",
        effective_status: JSON.stringify(SITUACOES_LISTADAS),
        limit: "200",
      })}`,
      cfg,
      buscar,
    ),
    paginar<MetaInsightAnuncio>(
      `${base}/insights?${q({
        level: "ad",
        time_increment: "1",
        time_range: JSON.stringify({ since: janela.de, until: janela.ate }),
        fields: "campaign_id,campaign_name,ad_id,ad_name,spend,impressions,inline_link_clicks,actions",
        limit: "500",
      })}`,
      cfg,
      buscar,
    ),
    paginar<MetaAlcance>(
      `${base}/insights?${q({
        level: "campaign",
        date_preset: "maximum",
        fields: "campaign_id,reach",
        limit: "500",
      })}`,
      cfg,
      buscar,
    ),
  ]);

  return normalizarMeta({ janela, campanhas, insights, alcances });
}
