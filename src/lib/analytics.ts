import { createSign } from "node:crypto";
import { getCachedSettings } from "./settings";
import { ehCaminhoDePdp, SEGMENTOS_DE_PDP } from "./veiculoUrl";

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
 * Credenciais: painel primeiro, variável de ambiente de reserva
 * ----------------------------------------------------------------------
 * As três credenciais moram na linha `ga4` de `site_settings`, editável em
 * Configurações → Integração, com `process.env.GA4_*` como fallback campo a
 * campo. É a mesma forma do `webhooks.apiSecretToken ||
 * process.env.N8N_SECRET_TOKEN` em `webhook-dispatcher.ts`.
 *
 * Até 27/08 só existia o caminho da env, e isso fazia do GA4 a exceção da
 * casa: todo o resto que é segredo configurável já se resolvia pelo painel.
 * A diferença prática é quem consegue ligar o recurso — pelo painel, o dono;
 * pela env, quem tem acesso à Vercel e sabe redeployar.
 *
 *   propertyId    id NUMÉRICO da propriedade (não é o "G-..."):
 *                 Admin → Detalhes da propriedade → ID da propriedade
 *   clientEmail   e-mail da conta de serviço
 *   privateKey    chave privada do JSON da conta de serviço
 *
 * A conta de serviço precisa ser adicionada como **Leitor** na propriedade
 * do GA4 (Admin → Gerenciamento de acesso). Sem isso a API responde 403
 * mesmo com a credencial correta. Passo a passo em `docs/GA4_CREDENCIAIS.md`.
 *
 * Sem as três, tudo aqui devolve `null` — e as telas mostram "—" com a
 * explicação, em vez de zero. Zero é um número e mente; "—" não.
 */

const ESCOPO = "https://www.googleapis.com/auth/analytics.readonly";
const URL_TOKEN = "https://oauth2.googleapis.com/token";
const URL_DATA = "https://analyticsdata.googleapis.com/v1beta";

export interface CredenciaisDoGa4 {
  propertyId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * As três credenciais, resolvidas — ou `null` se faltar qualquer uma.
 *
 * Campo a campo, e não tudo-ou-nada por fonte: quem já tinha as envs
 * preenchidas e passar a escrever só o `propertyId` no painel continua
 * funcionando. Tudo-ou-nada faria a gravação parcial derrubar o recurso, com
 * o sintoma aparecendo como "sumiram as visitas" e a causa em outro lugar.
 *
 * `null` no lugar de exceção porque é o que os chamadores já esperam: a tela
 * do painel desenha "—" e segue. Analytics indisponível não pode derrubar a
 * visão geral.
 */
export async function credenciaisDoGa4(): Promise<CredenciaisDoGa4 | null> {
  let doPainel: Record<string, unknown> = {};
  try {
    const settings = await getCachedSettings();
    if (settings.ga4 && typeof settings.ga4 === "object") {
      doPainel = settings.ga4 as Record<string, unknown>;
    }
  } catch (err) {
    // Settings indisponível não pode apagar a credencial de env: o painel
    // ficaria sem número por causa de uma falha em outro subsistema.
    console.warn("[Analytics] Falha ao ler site_settings; usando só as envs:", err);
  }

  const texto = (valor: unknown, reserva: string | undefined) => {
    const escolhido = typeof valor === "string" && valor.trim() ? valor : reserva;
    return (escolhido ?? "").trim();
  };

  const propertyId = texto(doPainel.propertyId, process.env.GA4_PROPERTY_ID);
  const clientEmail = texto(doPainel.clientEmail, process.env.GA4_CLIENT_EMAIL);
  const privateKey = texto(doPainel.privateKey, process.env.GA4_PRIVATE_KEY);

  if (!propertyId || !clientEmail || !privateKey) return null;
  return { propertyId, clientEmail, privateKey };
}

/** `true` quando as três credenciais existem, venham de onde vierem. */
export async function analyticsConfigurado(): Promise<boolean> {
  return (await credenciaisDoGa4()) !== null;
}

const base64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * Token em memória: vale ~1h, e pedir um por requisição gastaria cota à toa.
 *
 * Chaveado pelo e-mail da conta de serviço desde 27/08, quando a credencial
 * passou a ser editável em tela. Sem a chave, trocar a conta de serviço no
 * painel deixava o token da conta ANTIGA valendo por até uma hora — e a falha
 * se apresenta como 403 intermitente, não como erro de configuração.
 */
let tokenCache: { conta: string; valor: string; expiraEm: number } | null = null;

async function obterToken(cred: CredenciaisDoGa4): Promise<string | null> {
  if (
    tokenCache &&
    tokenCache.conta === cred.clientEmail &&
    tokenCache.expiraEm > Date.now() + 60_000
  ) {
    return tokenCache.valor;
  }

  const email = cred.clientEmail;
  // A chave vem do JSON com "\n" literal quando colada em .env ou num campo de
  // formulário — desfazer o escape é obrigatório, senão a assinatura sai
  // inválida sem erro claro.
  const chave = cred.privateKey.replace(/\\n/g, "\n");

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
    conta: email,
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
  /** Alternativa a `caminhoContem` quando o filtro precisa de alternância. */
  caminhoRegex?: string;
  limite?: number;
}

/** Uma linha do relatório: dimensões e métricas já achatadas. */
export interface LinhaDeRelatorio {
  dimensoes: string[];
  metricas: number[];
}

async function rodarRelatorio(opts: OpcoesRelatorio): Promise<LinhaDeRelatorio[] | null> {
  const cred = await credenciaisDoGa4();
  if (!cred) return null;

  const token = await obterToken(cred);
  if (!token) return null;

  const corpo: Record<string, unknown> = {
    dateRanges: [{ startDate: `${opts.dias ?? 30}daysAgo`, endDate: "today" }],
    dimensions: (opts.dimensoes ?? []).map((name) => ({ name })),
    metrics: (opts.metricas ?? ["screenPageViews"]).map((name) => ({ name })),
    limit: opts.limite ?? 100,
  };

  if (opts.caminhoContem || opts.caminhoRegex) {
    corpo.dimensionFilter = {
      filter: {
        fieldName: "pagePath",
        stringFilter: opts.caminhoRegex
          ? { matchType: "PARTIAL_REGEXP", value: opts.caminhoRegex }
          : { matchType: "CONTAINS", value: opts.caminhoContem },
      },
    };
  }

  const res = await fetch(
    `${URL_DATA}/properties/${cred.propertyId}:runReport`,
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
    // O catálogo mora em /estoque e as fichas em /carros/… ou /motos/….
    if (caminho.startsWith("/estoque") || ehCaminhoDePdp(caminho)) {
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
    // Alternância em vez de "/carros/": com o segmento de motos, um
    // CONTAINS fixo deixaria as motos fora do relatório em silêncio.
    caminhoRegex: `^/(${SEGMENTOS_DE_PDP.join("|")})/`,
    limite,
  });
  if (linhas === null) return null;
  return linhas
    .map((l) => ({ caminho: l.dimensoes[0] ?? "", visitas: l.metricas[0] ?? 0 }))
    .sort((a, b) => b.visitas - a.visitas);
}
