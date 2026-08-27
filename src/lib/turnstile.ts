/**
 * Verificação do token do Turnstile — num lugar só.
 *
 * ---------------------------------------------------------------------------
 * Por que isto virou módulo em 27/08
 * ---------------------------------------------------------------------------
 * A função existia duas vezes, copiada: uma em `/api/leads`, outra em
 * `/api/avaliacao`. Em 27/08 a de `leads` foi consertada — saiu a secret de
 * teste "always passes" que ela usava como fallback quando
 * `TURNSTILE_SECRET_KEY` faltava. A de `avaliacao` ficou para trás, com o
 * alçapão aberto, e o teste de regressão não pegou porque ele lia só o arquivo
 * de `leads`.
 *
 * Duplicata é assim: o conserto vai em uma cópia e a outra segue vulnerável,
 * sem ninguém notar. Com uma função só, o próximo conserto vale para as duas
 * rotas por construção.
 *
 * ---------------------------------------------------------------------------
 * O que se valida, e por quê
 * ---------------------------------------------------------------------------
 * `success` sozinho não basta. A resposta do siteverify traz mais duas coisas
 * que precisam ser conferidas:
 *
 * **`hostname`** — o domínio onde o desafio foi resolvido. Até 27/08 o widget
 * tinha `localhost` e `127.0.0.1` na lista de domínios (conferido no painel da
 * Cloudflare). Com eles lá, qualquer pessoa subia uma página local com a nossa
 * sitekey — que é pública, está no HTML —, colhia um token que a Cloudflare
 * assinava como válido, e mandava para a produção. `success: true`,
 * `hostname: "localhost"`, e o servidor aceitava. Os dois hosts saíram da lista
 * no mesmo dia; esta conferência é o que impede a brecha de voltar sozinha se
 * alguém reabrir a lista no painel.
 *
 * **`action`** — a superfície que gerou o token. Impede que um token colhido
 * num formulário seja gasto em outro.
 *
 * ---------------------------------------------------------------------------
 * A régua de `TURNSTILE_HOSTNAMES`
 * ---------------------------------------------------------------------------
 * Em produção a variável é OBRIGATÓRIA: sem ela a verificação recusa e grita no
 * log. Fora de produção ela pode estar vazia, e aí a conferência de hostname
 * não roda — é o que permite Preview e desenvolvimento local usarem as chaves
 * de teste da Cloudflare, cujo hostname não tem lista que o preveja (deploy de
 * preview da Vercel ganha endereço novo a cada PR).
 *
 * Quem decide se é produção é `VERCEL_ENV`, que a Vercel injeta no servidor —
 * não o cliente. É a diferença entre esta régua e a que foi removida em 27/08,
 * que saía do campo `canal` do corpo do POST e portanto era escrita por quem
 * mandava a requisição.
 */

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** A Cloudflare responde em milissegundos; 10 s é folga, não expectativa. */
const TIMEOUT_MS = 10_000;

/**
 * Token do Turnstile fica na casa dos 500–2000 caracteres. O teto existe para
 * não repassar à Cloudflare o que um cliente hostil resolveu mandar: o corpo do
 * POST é JSON livre, e sem isto um campo de 10 MB viraria upload nosso para a
 * borda deles.
 */
const TAMANHO_MAXIMO_DO_TOKEN = 2048;

/**
 * O IP do visitante, na melhor forma disponível.
 *
 * Atrás da Vercel o IP real vem em `x-forwarded-for`, e o primeiro item da
 * lista é o cliente — os seguintes são os proxies do caminho. `x-real-ip` é a
 * reserva. Vai para o siteverify como `remoteip`, que é opcional na API mas
 * melhora o sinal antifraude da Cloudflare.
 */
export function ipDoVisitante(request: { headers: Headers }): string | null {
  const encaminhado = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return encaminhado || request.headers.get("x-real-ip") || null;
}

export type ResultadoTurnstile =
  | { ok: true; hostname: string; action: string }
  | { ok: false; motivo: string };

/** Lê a lista de hosts aceitos. Vazia é resposta válida fora de produção. */
function hostnamesEsperados(): Set<string> {
  return new Set(
    (process.env.TURNSTILE_HOSTNAMES ?? "")
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean)
  );
}

function estaEmProducao(): boolean {
  return process.env.VERCEL_ENV === "production";
}

export interface EntradaTurnstile {
  /** O `cf-turnstile-response` que veio do corpo do POST. Não confiar no tipo. */
  token: unknown;
  /** Ações aceitas nesta rota. Vazio desliga a conferência (não usar em rota nova). */
  acoesAceitas: readonly string[];
  /** IP do visitante, quando der para saber. Melhora o sinal antifraude. */
  ip?: string | null;
  /** Prefixo dos logs, para saber de qual rota veio a recusa. */
  rotulo: string;
}

export async function verificarTurnstile({
  token,
  acoesAceitas,
  ip,
  rotulo,
}: EntradaTurnstile): Promise<ResultadoTurnstile> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // Falhar fechado, e em voz alta.
  //
  // Antes de 27/08 a rota de avaliação caía na secret de teste da Cloudflare
  // quando esta variável faltava — e a chave de teste aceita QUALQUER token.
  // Um ambiente novo mal provisionado passaria a aceitar bot em silêncio, sem
  // uma linha de log. Agora o formulário para de aceitar lead, o que aparece no
  // mesmo dia, em vez de envenenar o sinal de conversão do Ads para sempre:
  // lead falso vira `generate_lead`, vira conversão valendo R$ 420 ou mais, e
  // ensina o algoritmo a comprar o tráfego que o gerou.
  if (!secret) {
    console.error(
      `${rotulo} TURNSTILE_SECRET_KEY ausente — recusando. Sem a chave não há ` +
        `como distinguir humano de bot, e aceitar seria envenenar o sinal de ` +
        `conversão do Ads.`
    );
    return { ok: false, motivo: "secret-ausente" };
  }

  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, motivo: "token-ausente" };
  }

  if (token.length > TAMANHO_MAXIMO_DO_TOKEN) {
    console.warn(`${rotulo} token acima de ${TAMANHO_MAXIMO_DO_TOKEN} caracteres — recusando.`);
    return { ok: false, motivo: "token-grande-demais" };
  }

  const hostsAceitos = hostnamesEsperados();
  if (hostsAceitos.size === 0 && estaEmProducao()) {
    console.error(
      `${rotulo} TURNSTILE_HOSTNAMES ausente em produção — recusando. Sem a ` +
        `lista, um token colhido em qualquer domínio que o widget aceite valeria aqui.`
    );
    return { ok: false, motivo: "hostnames-ausentes" };
  }

  let dados: { success?: boolean; hostname?: string; action?: string; "error-codes"?: string[] };
  try {
    const corpo = new URLSearchParams({ secret, response: token });
    // `remoteip` é opcional na API e melhora o sinal antifraude da Cloudflare.
    // Só entra quando existe: mandar string vazia é pior que omitir.
    if (ip) corpo.set("remoteip", ip);

    const resposta = await fetch(SITEVERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      // Sem isto, uma chamada pendurada segura a invocação serverless até o
      // limite da plataforma — e o visitante fica olhando o botão girar.
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: corpo,
    });

    // Checar antes do `.json()`: um 5xx da Cloudflare volta como HTML, e o
    // parse estouraria com "Unexpected token <", que não diz o que houve.
    if (!resposta.ok) {
      console.warn(`${rotulo} siteverify respondeu HTTP ${resposta.status} — recusando.`);
      return { ok: false, motivo: `siteverify-http-${resposta.status}` };
    }

    dados = await resposta.json();
  } catch (erro) {
    console.error(`${rotulo} falha ao falar com o siteverify:`, erro);
    return { ok: false, motivo: "siteverify-indisponivel" };
  }

  if (!dados.success) {
    const codigos = dados["error-codes"]?.join(",") || "sem-codigo";
    return { ok: false, motivo: `siteverify-recusou:${codigos}` };
  }

  const hostname = dados.hostname ?? "";
  if (hostsAceitos.size > 0 && !hostsAceitos.has(hostname)) {
    console.warn(`${rotulo} token válido, mas resolvido em host não previsto: ${hostname || "(vazio)"}`);
    return { ok: false, motivo: "hostname-nao-previsto" };
  }

  const action = dados.action ?? "";
  if (acoesAceitas.length > 0 && !acoesAceitas.includes(action)) {
    console.warn(`${rotulo} token válido, mas com action inesperada: ${action || "(vazia)"}`);
    return { ok: false, motivo: "action-nao-prevista" };
  }

  return { ok: true, hostname, action };
}

/**
 * As `action` de cada superfície do site.
 *
 * A `action` é fixada no navegador, na hora de montar o widget, e volta assinada
 * pela Cloudflare na resposta do siteverify — o cliente não consegue trocá-la
 * depois. É o que impede que um token colhido na auto-avaliação seja gasto na
 * rota de leads.
 *
 * Só letras, números, `_` e `-`, no máximo 32 caracteres: é a regra da
 * Cloudflare, e action fora dela é recusada na origem.
 */
export const ACOES = {
  contato: "contato",
  pdp: "pdp",
  carmatch: "carmatch",
  popup: "popup",
  avaliacao: "avaliacao",
  avaliacaoWhatsapp: "avaliacao_whatsapp",
} as const;

/** `/api/leads` atende cinco superfícies; todas com o mesmo valor de lead. */
export const ACOES_DE_LEADS = [
  ACOES.contato,
  ACOES.pdp,
  ACOES.carmatch,
  ACOES.popup,
  ACOES.avaliacaoWhatsapp,
] as const;

/** `/api/avaliacao` atende uma só. */
export const ACOES_DE_AVALIACAO = [ACOES.avaliacao] as const;
