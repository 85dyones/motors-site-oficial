/**
 * A captura do navegador — a camada em que a conversão vive e onde, até
 * 2026-09-10, não havia absolutamente nada.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ Este arquivo NÃO envolve nenhum global
 * ---------------------------------------------------------------------------
 * É a regra que manda no desenho todo, e ela tem dono: a Cloudflare. O
 * Turnstile observa o ambiente da página, e quando alguém troca `fetch`,
 * `XMLHttpRequest`, `console` ou instala accessor por cima do que ele lê, o
 * desafio simplesmente **desiste** — sem erro, sem log, com o botão do
 * formulário eternamente desabilitado. Um SDK de erro comercial faz
 * exatamente isso para montar *breadcrumbs*; foi uma das razões de o destino
 * ter ficado em casa.
 *
 * Então aqui só existem dois `addEventListener` passivos, em `error` e
 * `unhandledrejection`. Nada é sobrescrito. `denyUrls` de fornecedor filtraria
 * o RELATO do erro — não impediria a instrumentação de acontecer, que é o que
 * a Cloudflare enxerga. São coisas diferentes.
 *
 * ---------------------------------------------------------------------------
 * O que NÃO é relatado
 * ---------------------------------------------------------------------------
 * Extensão de navegador e script de terceiro (pixel, GTM, Turnstile) produzem
 * erro o tempo todo e nenhum deles é nosso. Relatá-los enche a cota, esconde o
 * defeito real e ensina a pessoa a ignorar a fila. O filtro é por origem do
 * arquivo, e não por mensagem, porque a mensagem varia com a versão deles.
 *
 * ---------------------------------------------------------------------------
 * Tudo é injetado
 * ---------------------------------------------------------------------------
 * `navigator`, `fetch` e a janela entram por parâmetro. Não é preciosismo: no
 * Node 24 `globalThis.navigator` existe e **ignora atribuição**, então um
 * teste que tentasse dublá-lo por cima ficaria verde medindo o navegador do
 * Node. Injetar é o que permite provar o caminho do beacon de verdade.
 */

/** O que sai daqui e entra em `/api/erros`. */
export type EventoDeErro = {
  tipo: "erro" | "rejeicao" | "boundary";
  mensagem: string;
  stack: string | null;
  url: string;
  navegador: string;
  release: string | null;
  ag_uid: string | null;
  digest: string | null;
};

export type ContextoDoNavegador = {
  url: string;
  navegador: string;
  release: string | null;
  cookie: string;
};

/** Tetos por campo — casam com os da rota e com os CHECK da tabela. */
const TETO_MENSAGEM = 500;
const TETO_STACK = 4000;
const TETO_URL = 500;
const TETO_NAVEGADOR = 300;

/** Quantos erros uma sessão pode relatar. Além disso é enxurrada. */
const TETO_POR_SESSAO = 10;

/**
 * Origens cujo erro não é nosso.
 *
 * Turnstile entra aqui por um motivo a mais: ele é ruidoso por natureza
 * (desafio expirado, rede do visitante) e o que importa dele já é medido por
 * `tests/turnstile-estabilidade.test.ts` e pela saída do `SaidaDoCaptcha`.
 */
const ORIGENS_DE_FORA = [
  "challenges.cloudflare.com",
  "connect.facebook.net",
  "googletagmanager.com",
  "google-analytics.com",
  "googleadservices.com",
  "chrome-extension://",
  "moz-extension://",
  "safari-extension://",
];
/* `<anonymous>` esteve nesta lista e saiu: ele aparece em quadro LEGÍTIMO de
   stack (`at Object.<anonymous>`), tanto no navegador quanto no Node. Filtrar
   por ele descartava erro nosso em silêncio — que é o pior modo de falhar aqui,
   porque some sem deixar nem a contagem. Filtro de mais é pior que filtro de
   menos: o de menos gasta cota, o de mais esconde o defeito. */

/**
 * Mensagens que não descrevem defeito nosso.
 *
 * `ResizeObserver loop` é ruído conhecido de navegador; `Script error` é o que
 * sobra de erro em script de outra origem sem CORS — sem stack, sem arquivo,
 * sem nada que se possa investigar.
 */
const MENSAGENS_DE_FORA = ["ResizeObserver loop", "Script error"];

function corta(texto: string, teto: number): string {
  return texto.length <= teto ? texto : texto.slice(0, teto);
}

/** Sem query: é onde moram utm, telefone e token. */
function urlSemQuery(url: string): string {
  const corteQuery = url.search(/[?#]/);
  return corteQuery === -1 ? url : url.slice(0, corteQuery);
}

/** O valor de um cookie no `document.cookie`. */
function doCookie(bruto: string, nome: string): string | null {
  for (const parte of bruto.split(";")) {
    const igual = parte.indexOf("=");
    if (igual === -1) continue;
    if (parte.slice(0, igual).trim() === nome) return parte.slice(igual + 1).trim() || null;
  }
  return null;
}

/**
 * Monta o evento, ou devolve `null` se o erro não é nosso para relatar.
 *
 * O `ag_uid` é lido do cookie NA HORA do erro, e não guardado na montagem do
 * capturador: o visitante pode virar lead no meio da sessão, e o elo só existe
 * depois disso.
 */
export function montarEvento(
  bruto: {
    mensagem: string;
    stack?: string | null;
    arquivo?: string | null;
    digest?: string | null;
    tipo: EventoDeErro["tipo"];
  },
  ctx: ContextoDoNavegador,
): EventoDeErro | null {
  const mensagem = (bruto.mensagem ?? "").trim();
  if (!mensagem) return null;

  if (MENSAGENS_DE_FORA.some((m) => mensagem.includes(m))) return null;

  // A procedência vem do arquivo quando ele existe, e do stack quando não —
  // erro de script de terceiro às vezes chega sem `filename`.
  const procedencia = `${bruto.arquivo ?? ""} ${bruto.stack ?? ""}`;
  if (ORIGENS_DE_FORA.some((o) => procedencia.includes(o))) return null;

  return {
    tipo: bruto.tipo,
    mensagem: corta(mensagem, TETO_MENSAGEM),
    stack: bruto.stack ? corta(bruto.stack, TETO_STACK) : null,
    url: corta(urlSemQuery(ctx.url), TETO_URL),
    navegador: corta(ctx.navegador, TETO_NAVEGADOR),
    release: ctx.release,
    ag_uid: doCookie(ctx.cookie, "ag_uid"),
    digest: bruto.digest ?? null,
  };
}

/**
 * O capturador. Não conhece rede: recebe `enviar` por parâmetro.
 *
 * `enviar` lançando NUNCA propaga — um erro no relato de erro não pode virar
 * um segundo erro, e muito menos escapar para o caminho de quem estava
 * navegando.
 */
export function criarCapturador(opcoes: {
  enviar: (corpo: string) => void;
  ctx: () => ContextoDoNavegador;
  tetoPorSessao?: number;
}) {
  const teto = opcoes.tetoPorSessao ?? TETO_POR_SESSAO;
  const jaVistos = new Set<string>();
  let enviados = 0;

  function capturar(bruto: Parameters<typeof montarEvento>[0]): void {
    try {
      if (enviados >= teto) return;

      const evento = montarEvento(bruto, opcoes.ctx());
      if (!evento) return;

      // Dedupe por mensagem + primeira linha do stack: o mesmo defeito num
      // laço de render dispararia dezenas de vezes por segundo.
      const chave = `${evento.mensagem}|${(evento.stack ?? "").split("\n")[1] ?? ""}`;
      if (jaVistos.has(chave)) return;
      jaVistos.add(chave);

      enviados += 1;
      opcoes.enviar(JSON.stringify(evento));
    } catch {
      // Silêncio de propósito: `console.error` aqui pode ele mesmo disparar
      // outro `error`, e não há a quem avisar de dentro do navegador.
    }
  }

  return {
    capturar,
    aoErro(ev: { message?: string; filename?: string; error?: unknown }): void {
      const erro = ev.error;
      capturar({
        tipo: "erro",
        mensagem: erro instanceof Error ? `${erro.name}: ${erro.message}` : (ev.message ?? ""),
        stack: erro instanceof Error ? (erro.stack ?? null) : null,
        arquivo: ev.filename ?? null,
      });
    },
    aoRejeicao(ev: { reason?: unknown }): void {
      const razao = ev.reason;
      capturar({
        tipo: "rejeicao",
        mensagem: razao instanceof Error ? `${razao.name}: ${razao.message}` : String(razao ?? ""),
        stack: razao instanceof Error ? (razao.stack ?? null) : null,
        arquivo: null,
      });
    },
  };
}

/**
 * Manda o corpo como STRING.
 *
 * `sendBeacon` com string vai como `text/plain;charset=UTF-8`, que é
 * CORS-safelisted. Com `Blob` de `application/json` não é — e o Chrome já
 * bloqueou esse caminho. Por isso a rota lê `request.text()` e faz o
 * `JSON.parse` ela mesma, em vez de exigir content-type.
 *
 * O fallback usa `keepalive`, que é o que faz a requisição sobreviver à
 * navegação — o erro costuma acontecer justamente quando a pessoa está saindo.
 */
export function enviarPorBeacon(
  corpo: string,
  deps?: { navigator?: Pick<Navigator, "sendBeacon">; fetch?: typeof fetch },
): void {
  const nav = deps?.navigator ?? (typeof navigator !== "undefined" ? navigator : undefined);
  const buscar = deps?.fetch ?? (typeof fetch !== "undefined" ? fetch : undefined);

  try {
    if (nav?.sendBeacon && nav.sendBeacon("/api/erros", corpo)) return;
  } catch {
    // Beacon recusado (cota do navegador, corpo grande) — cai para o fetch.
  }

  try {
    void buscar?.("/api/erros", {
      method: "POST",
      body: corpo,
      headers: { "Content-Type": "text/plain" },
      keepalive: true,
    })?.catch(() => {});
  } catch {
    // Não há a quem avisar de dentro do navegador.
  }
}

type Janela = {
  addEventListener: (tipo: string, ouvinte: (ev: never) => void) => void;
  removeEventListener: (tipo: string, ouvinte: (ev: never) => void) => void;
};

/** Liga os dois ouvintes. Devolve como desligá-los. */
export function armar(janela: Janela, cap: ReturnType<typeof criarCapturador>): () => void {
  const aoErro = (ev: never) => cap.aoErro(ev);
  const aoRejeicao = (ev: never) => cap.aoRejeicao(ev);

  janela.addEventListener("error", aoErro);
  janela.addEventListener("unhandledrejection", aoRejeicao);

  return () => {
    janela.removeEventListener("error", aoErro);
    janela.removeEventListener("unhandledrejection", aoRejeicao);
  };
}

/* ---------------------------------------------------------------------------
 * A ponte para os boundaries de React
 * ---------------------------------------------------------------------------
 * `error.tsx` e `global-error.tsx` são componentes, não ouvintes — e em
 * produção o boundary EXPLÍCITO só faz `console.error`, sem disparar o evento
 * `error` da `window`
 * (`next/dist/client/react-client-callbacks/error-boundary-callbacks.js:77`).
 * Então eles têm de relatar por conta própria, e é este par de funções que
 * permite isso sem que eles conheçam rede nem cookie.
 * ------------------------------------------------------------------------- */

let capturadorAtivo: ReturnType<typeof criarCapturador> | null = null;

/** Chamada uma vez pelo componente que monta a captura. */
export function configurar(opcoes: { ativo: boolean; release: string | null }): () => void {
  if (!opcoes.ativo || typeof window === "undefined") return () => {};

  const cap = criarCapturador({
    enviar: (corpo) => enviarPorBeacon(corpo),
    ctx: () => ({
      url: window.location.href,
      navegador: window.navigator.userAgent,
      release: opcoes.release,
      cookie: typeof document !== "undefined" ? document.cookie : "",
    }),
  });

  capturadorAtivo = cap;
  const desarmar = armar(window as unknown as Janela, cap);

  return () => {
    desarmar();
    capturadorAtivo = null;
  };
}

/**
 * O que os boundaries chamam. No-op antes de `configurar` — inclusive quando
 * o interruptor está desligado.
 *
 * Em produção o erro de servidor chega ao boundary REDIGIDO ("An error
 * occurred in the Server Components render…") e com `digest`. É o `digest` que
 * liga esta linha à que o `onRequestError` já gravou com a mensagem de
 * verdade; mandar o boilerplate junto só encheria a tabela.
 */
export function capturarErroDeBoundary(
  erro: Error & { digest?: string },
  onde: "error" | "global-error",
): void {
  capturadorAtivo?.capturar({
    tipo: "boundary",
    mensagem: `[${onde}] ${erro?.message ?? "erro sem mensagem"}`,
    stack: erro?.stack ?? null,
    arquivo: null,
    digest: erro?.digest ?? null,
  });
}
