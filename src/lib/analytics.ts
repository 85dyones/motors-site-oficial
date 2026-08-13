import { createSign } from "node:crypto";

/**
 * Leitura do Google Analytics 4 — a fonte das "visitas" do painel.
 *
 * O site JÁ coleta: `IntegrationsTracker` inicializa o GA4 (`G-KBL1MFN9E3`,
 * ver TRACKING_SPEC.md) e dispara PageView em toda navegação. O que faltava
 * era o caminho de volta — o painel LER esses números para preencher
 * "visitas na página" (A15) e "visitas ao catálogo" (A1).
 *
 * ----------------------------------------------------------------------
 * Por que sem biblioteca
 * ----------------------------------------------------------------------
 * O caminho oficial é `@google-analytics/data`, que arrasta gRPC e dezenas
 * de transitivas para um projeto cujo `package.json` hoje tem nove
 * dependências. A Data API tem REST, e a autenticação é um JWT assinado com
 * a chave da conta de serviço — `node:crypto` faz isso em vinte linhas. Menos
 * superfície para auditar e nada novo para manter atualizado.
 *
 * ----------------------------------------------------------------------
 * Credenciais (o dono preenche)
 * ----------------------------------------------------------------------
 *   GA4_PROPERTY_ID      id numérico da propriedade (não é o "G-..."):
 *                        Admin → Detalhes da propriedade → ID da propriedade
 *   GA4_CLIENT_EMAIL     e-mail da conta de serviço
 *   GA4_PRIVATE_KEY      chave privada do JSON da conta de serviço
 *
 * A conta de serviço precisa ser adicionada como **Leitor** na propriedade
 * do GA4 (Admin → Gerenciamento de acesso). Sem isso a API responde 403
 * mesmo com a credencial correta.
 *
 * Sem as três variáveis, tudo aqui devolve `null` — e as telas mostram "—"
 * com a explicação, em vez de zero. Zero é um número e mente; "—" não.
 */

const ESCOPO = "https://www.googleapis.com/auth/analytics.readonly";
const URL_TOKEN = "https://oauth2.googleapis.com/token";
const URL_DATA = "https://analyticsdata.googleapis.com/v1beta";

export function analyticsConfigurado(): boolean {
  return Boolean(
    process.env.GA4_PROPERTY_ID &&
      process.env.GA4_CLIENT_EMAIL &&
      process.env.GA4_PRIVATE_KEY,
  );
}

const base64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Token em memória: vale ~1h, e pedir um por requisição gastaria cota à toa. */
let tokenCache: { valor: string; expiraEm: number } | null = null;

async function obterToken(): Promise<string | null> {
  if (!analyticsConfigurado()) return null;
  if (tokenCache && tokenCache.expiraEm > Date.now() + 60_000) return tokenCache.valor;

  const email = process.env.GA4_CLIENT_EMAIL!;
  // A chave vem do JSON com "\n" literal quando colada em .env — desfazer o
  // escape é obrigatório, senão a assinatura sai inválida sem erro claro.
  const chave = process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, "\n");

  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = base64url(
    JSON.stringify({
      iss: email,
      scope: ESCOPO,
      aud: URL_TOKEN,
      iat: agora,
      exp: agora + 3600,
    }),
  );

  const assinatura = createSign("RSA-SHA256")
    .update(`${cabecalho}.${corpo}`)
    .sign(chave);
  const jwt = `${cabecalho}.${corpo}.${base64url(assinatura)}`;

  const res = await fetch(URL_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    console.warn("[Analytics] Falha ao obter token do Google:", await res.text());
    return null;
  }

  const dados = await res.json();
  tokenCache = {
    valor: dados.access_token,
    expiraEm: Date.now() + (dados.expires_in ?? 3600) * 1000,
  };
  return tokenCache.valor;
}

interface OpcoesRelatorio {
  /** Dias para trás a partir de hoje. */
  dias?: number;
  dimensoes?: string[];
  metricas?: string[];
  /** Filtro por prefixo de caminho de página. */
  caminhoContem?: string;
  limite?: number;
}

/** Uma linha do relatório: dimensões e métricas já achatadas. */
export interface LinhaDeRelatorio {
  dimensoes: string[];
  metricas: number[];
}

async function rodarRelatorio(opts: OpcoesRelatorio): Promise<LinhaDeRelatorio[] | null> {
  const token = await obterToken();
  if (!token) return null;

  const corpo: Record<string, unknown> = {
    dateRanges: [{ startDate: `${opts.dias ?? 30}daysAgo`, endDate: "today" }],
    dimensions: (opts.dimensoes ?? []).map((name) => ({ name })),
    metrics: (opts.metricas ?? ["screenPageViews"]).map((name) => ({ name })),
    limit: opts.limite ?? 100,
  };

  if (opts.caminhoContem) {
    corpo.dimensionFilter = {
      filter: {
        fieldName: "pagePath",
        stringFilter: { matchType: "CONTAINS", value: opts.caminhoContem },
      },
    };
  }

  const res = await fetch(
    `${URL_DATA}/properties/${process.env.GA4_PROPERTY_ID}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(corpo),
      // Relatório do GA leva segundos; sem teto, uma lentidão do Google
      // seguraria a renderização do painel inteiro.
      signal: AbortSignal.timeout(8000),
    },
  );

  if (!res.ok) {
    console.warn("[Analytics] runReport falhou:", res.status, await res.text());
    return null;
  }

  const dados = await res.json();
  return (dados.rows ?? []).map((r: any) => ({
    dimensoes: (r.dimensionValues ?? []).map((d: any) => d.value),
    metricas: (r.metricValues ?? []).map((m: any) => Number(m.value) || 0),
  }));
}

/**
 * Visitas de uma página específica nos últimos N dias.
 * `null` = analytics não configurado ou indisponível — nunca 0 por engano.
 */
export async function visitasDaPagina(
  caminho: string,
  dias = 30,
): Promise<number | null> {
  const linhas = await rodarRelatorio({
    dias,
    caminhoContem: caminho,
    metricas: ["screenPageViews"],
    limite: 1000,
  });
  if (linhas === null) return null;
  return linhas.reduce((soma, l) => soma + (l.metricas[0] ?? 0), 0);
}

/** Visitas totais do site no período, e quantas foram ao catálogo. */
export async function resumoDeVisitas(dias = 30): Promise<{
  total: number;
  catalogo: number;
} | null> {
  const linhas = await rodarRelatorio({
    dias,
    dimensoes: ["pagePath"],
    metricas: ["screenPageViews"],
    limite: 1000,
  });
  if (linhas === null) return null;

  let total = 0;
  let catalogo = 0;
  for (const l of linhas) {
    const visitas = l.metricas[0] ?? 0;
    const caminho = l.dimensoes[0] ?? "";
    // Navegação interna não é visita: o painel (/admin) e as telas de showroom
    // (/vitrine) registram PageView de quem trabalha na loja, não de cliente.
    if (caminho.startsWith("/admin") || caminho.startsWith("/vitrine")) continue;
    total += visitas;
    // O catálogo mora em /estoque e as fichas em /carros/...
    if (caminho.startsWith("/estoque") || caminho.startsWith("/carros")) {
      catalogo += visitas;
    }
  }
  return { total, catalogo };
}

/** As páginas de veículo mais vistas — alimenta "anúncios que puxam tráfego". */
export async function paginasMaisVistas(
  dias = 30,
  limite = 10,
): Promise<Array<{ caminho: string; visitas: number }> | null> {
  const linhas = await rodarRelatorio({
    dias,
    dimensoes: ["pagePath"],
    metricas: ["screenPageViews"],
    caminhoContem: "/carros/",
    limite,
  });
  if (linhas === null) return null;
  return linhas
    .map((l) => ({ caminho: l.dimensoes[0] ?? "", visitas: l.metricas[0] ?? 0 }))
    .sort((a, b) => b.visitas - a.visitas);
}
