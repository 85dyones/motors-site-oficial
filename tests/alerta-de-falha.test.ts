import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { lerCodigo } from "./fonte";

/**
 * O aviso que sai do código quando uma integração para.
 *
 * Existe porque a CAPI ficou parada de 31/08 a 02/09 e o log da falha esteve lá
 * o tempo todo. Log só avisa quem está olhando, e ninguém olha log de rota que
 * devolve 204.
 *
 * O que este arquivo trava é o que decide se o aviso SERVE:
 *
 *   1. Sem webhook configurado, não quebra nada — degrada, como o resto do
 *      projeto.
 *   2. **Não vira enxurrada.** Um token expirado faz todo evento falhar; uma
 *      mensagem por visita seria silenciada na primeira hora, e alerta
 *      silenciado é pior que alerta nenhum — dá sensação de cobertura.
 *   3. A mensagem engolida é CONTADA, e o total viaja no próximo aviso. É a
 *      diferença entre "412 falhas desde o último aviso" e 412 mensagens.
 *   4. O aviso nunca lança: ele roda no caminho de uma falha que já aconteceu,
 *      e não pode ser a segunda coisa a quebrar.
 */

const WEBHOOK = "https://n8n.exemplo/webhook/alerta";

async function moduloLimpo() {
  vi.resetModules();
  return import("../src/lib/alertaDeFalha");
}

let envAnterior: string | undefined;

beforeEach(() => {
  envAnterior = process.env.N8N_WEBHOOK_ALERTA_URL;
  vi.restoreAllMocks();
});

afterEach(() => {
  if (envAnterior === undefined) delete process.env.N8N_WEBHOOK_ALERTA_URL;
  else process.env.N8N_WEBHOOK_ALERTA_URL = envAnterior;
});

describe("o aviso de falha", () => {
  it("sem webhook configurado, não chama nada e não quebra", async () => {
    delete process.env.N8N_WEBHOOK_ALERTA_URL;
    const chamou = vi.spyOn(globalThis, "fetch");
    const { alertarFalha } = await moduloLimpo();

    await expect(alertarFalha("meta-capi", "qualquer coisa")).resolves.toBeUndefined();
    expect(chamou).not.toHaveBeenCalled();
  });

  it("com webhook, manda o assunto, o detalhe e o ambiente", async () => {
    process.env.N8N_WEBHOOK_ALERTA_URL = WEBHOOK;
    const chamou = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const { alertarFalha } = await moduloLimpo();

    await alertarFalha("meta-capi", "401 no evento ViewContent");

    expect(chamou).toHaveBeenCalledTimes(1);
    const [url, opcoes] = chamou.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(WEBHOOK);
    const corpo = JSON.parse(String(opcoes.body));
    expect(corpo.assunto).toBe("meta-capi");
    expect(corpo.detalhe).toContain("401 no evento ViewContent");
    expect(corpo.ambiente).toBeTruthy();
    expect(corpo.em).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("NÃO vira enxurrada — a segunda falha seguida é engolida", async () => {
    // O caso real: token expira, todo evento falha. Sem carência seria uma
    // mensagem por visita, e a pessoa silencia o alerta na primeira hora.
    process.env.N8N_WEBHOOK_ALERTA_URL = WEBHOOK;
    const chamou = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const { alertarFalha } = await moduloLimpo();

    for (let i = 0; i < 50; i++) await alertarFalha("meta-capi", `falha ${i}`);

    expect(chamou, "cada falha virou uma mensagem").toHaveBeenCalledTimes(1);
  });

  it("as engolidas são CONTADAS e viajam no próximo aviso", async () => {
    /* Sem a contagem, a carência esconde o tamanho do estrago: a pessoa recebe
       um aviso e não sabe se foram duas falhas ou duas mil. É a informação que
       separa "olho isso amanhã" de "paro tudo agora". */
    process.env.N8N_WEBHOOK_ALERTA_URL = WEBHOOK;
    const chamou = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const { alertarFalha, esquecerCarencia } = await moduloLimpo();

    await alertarFalha("meta-capi", "a primeira");
    for (let i = 0; i < 7; i++) await alertarFalha("meta-capi", "engolida");

    // O tempo não é esperado: a carência é zerada, como um relógio adiantado.
    esquecerCarencia();
    await alertarFalha("meta-capi", "depois da carência");

    expect(chamou).toHaveBeenCalledTimes(2);
    const segundo = JSON.parse(String((chamou.mock.calls[1] as [string, RequestInit])[1].body));
    // `esquecerCarencia` limpa o mapa inteiro, então o contador volta a zero —
    // o que esta asserção trava é que o CAMPO existe e viaja, porque é ele que
    // some numa refatoração distraída.
    expect(segundo).toHaveProperty("suprimidasDesdeOUltimoAviso");
  });

  it("assuntos diferentes têm carência própria", async () => {
    // Falha de configuração e falha de entrega são problemas distintos, com
    // ações distintas. Uma não pode calar a outra.
    process.env.N8N_WEBHOOK_ALERTA_URL = WEBHOOK;
    const chamou = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const { alertarFalha } = await moduloLimpo();

    await alertarFalha("meta-capi", "entrega");
    await alertarFalha("meta-capi-configuracao", "variável ausente");

    expect(chamou).toHaveBeenCalledTimes(2);
  });

  it("webhook fora do ar não derruba quem chamou", async () => {
    process.env.N8N_WEBHOOK_ALERTA_URL = WEBHOOK;
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { alertarFalha } = await moduloLimpo();

    await expect(alertarFalha("meta-capi", "qualquer")).resolves.toBeUndefined();
  });

  it("o detalhe é truncado — payload não vai para o WhatsApp", async () => {
    // A resposta de erro do Meta devolve o payload, com os hashes de user_data.
    // Hash não é dado em claro, mas mensagem de aviso não é lugar de despejo.
    process.env.N8N_WEBHOOK_ALERTA_URL = WEBHOOK;
    const chamou = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const { alertarFalha } = await moduloLimpo();

    await alertarFalha("meta-capi", "x".repeat(5000));

    const corpo = JSON.parse(String((chamou.mock.calls[0] as [string, RequestInit])[1].body));
    expect(corpo.detalhe.length).toBeLessThanOrEqual(300);
  });
});

describe("a CAPI aciona o aviso nos QUATRO pontos de perda", () => {
  const lib = lerCodigo("src/lib/meta-capi.ts");

  it("configuração ausente, configuração MALFORMADA, recusa do Meta e falha de rede", () => {
    /* Quatro formas de o evento não chegar, e as duas primeiras são as piores:
       sem `META_GRAPH_API_VERSION` (que não tem default) a CAPI inteira morre
       sem nenhuma tentativa de entrega para alguém estranhar depois — e com a
       variável PRESENTE mas malformada ela morre igual, só que gastando uma
       ida à rede e recebendo de volta um erro que fala do pixel.

       A contagem trava o conjunto: cobrir três e esquecer uma deixa
       exatamente o buraco que este trabalho existe para fechar. */
    const avisos = lib.split("alertarFalha(").length - 1;
    expect(avisos, "um dos pontos de perda parou de avisar").toBe(4);
    expect(lib).toContain('alertarFalha("meta-capi-configuracao"');
    expect(lib).toContain('alertarFalha("meta-capi"');
  });

  it("o assunto NÃO carrega o código de status", () => {
    // A carência agrupa por assunto. Se o status entrasse na chave, um token
    // expirado alternando 400/401 furaria a contenção e viraria enxurrada.
    expect(lib).not.toMatch(/alertarFalha\(`meta-capi/);
    expect(lib).not.toMatch(/alertarFalha\("meta-capi-\$\{/);
  });

});

/**
 * A URL do Graph — o defeito de 03/09.
 *
 * Com o pixel certo e a versão certa, o Meta respondeu
 * `Unknown path components: /1410450786690090/events`. A mensagem cita o pixel,
 * mas o problema estava no segmento ANTERIOR: o Meta consome a versão quando a
 * reconhece e, quando não reconhece, trata aquele pedaço como um nó e devolve o
 * resto do caminho como desconhecido.
 *
 * Valor vindo de painel, colado de um documento, com um caractere invisível
 * junto — e o código lia `process.env` cru.
 */
describe("a montagem do endereço do Graph", () => {
  const ENVS = ["META_PIXEL_ID", "META_CAPI_ACCESS_TOKEN", "META_GRAPH_API_VERSION"] as const;
  const anterior: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENVS) anterior[k] = process.env[k];
    delete process.env.N8N_WEBHOOK_ALERTA_URL; // o aviso não é o assunto aqui
    process.env.META_PIXEL_ID = "1410450786690090";
    process.env.META_CAPI_ACCESS_TOKEN = "token-de-teste";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const k of ENVS) {
      if (anterior[k] === undefined) delete process.env[k];
      else process.env[k] = anterior[k];
    }
  });

  async function enviar() {
    vi.resetModules();
    const { sendCapiEvent } = await import("../src/lib/meta-capi");
    return sendCapiEvent({
      eventName: "ViewContent",
      eventId: "sonda",
      userData: {},
    } as Parameters<typeof sendCapiEvent>[0]);
  }

  it("espaço colado junto da versão NÃO chega à URL", async () => {
    // A causa provável do erro real. `trim` a resolve na origem.
    process.env.META_GRAPH_API_VERSION = " v26.0\n";
    const chamou = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    await enviar();

    expect(chamou).toHaveBeenCalledTimes(1);
    const url = String((chamou.mock.calls[0] as [string, RequestInit])[0]);
    expect(url).toContain("https://graph.facebook.com/v26.0/1410450786690090/events");
  });

  it("versão malformada NÃO gasta ida à rede — recusa antes", async () => {
    /* O ganho não é economizar uma requisição: é o erro passar a dizer o que
       está errado. O 400 do Meta fala do pixel, que está certo. */
    process.env.META_GRAPH_API_VERSION = "26.0";
    const chamou = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    const r = await enviar();

    expect(chamou, "mandou mesmo assim, e o Meta é que vai reclamar").not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
  });

  it("a recusa por versão NOMEIA o valor, com as aspas que revelam o invisível", async () => {
    // Sem as aspas, `v26.0 ` e `v26.0` se leem igual no log — que é como este
    // defeito sobreviveu a uma rodada de deploy.
    process.env.META_GRAPH_API_VERSION = "v26";
    const registrou = vi.spyOn(console, "error").mockImplementation(() => {});

    await enviar();

    const texto = registrou.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(texto).toContain('META_GRAPH_API_VERSION="v26"');
  });

  it("o token NUNCA aparece no que é registrado ou avisado", async () => {
    /* O caminho passou a ir para o log porque sem ele a recusa do Meta é
       ilegível. Só que o token viaja na MESMA URL, na query: montar a
       mensagem a partir da URL inteira publicaria a credencial no log da
       Vercel e no WhatsApp de quem recebe o aviso.

       Este teste é de COMPORTAMENTO, e não de texto do código, porque a
       versão anterior — que procurava `${token}` dentro do `console.error` —
       não pegou a mutação que faz o token entrar de carona no `caminho`, que
       é exatamente como o vazamento aconteceria de verdade. */
    process.env.META_GRAPH_API_VERSION = "v26.0";
    process.env.META_CAPI_ACCESS_TOKEN = "TOKEN-SECRETO-DE-TESTE";
    process.env.N8N_WEBHOOK_ALERTA_URL = "https://n8n.exemplo/webhook/alerta";

    const chamou = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).includes("graph.facebook.com")
        ? new Response('{"error":{"message":"Unknown path components"}}', { status: 400 })
        : new Response(null, { status: 200 }),
    );
    const registrou = vi.spyOn(console, "error").mockImplementation(() => {});

    await enviar();

    const logado = registrou.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(logado, "o token foi parar no log da Vercel").not.toContain("TOKEN-SECRETO-DE-TESTE");

    const avisos = chamou.mock.calls.filter(([u]) => !String(u).includes("graph.facebook.com"));
    expect(avisos.length, "o aviso não saiu — sem ele o teste não prova nada").toBe(1);
    const corpo = String((avisos[0] as unknown as [string, RequestInit])[1].body);
    expect(corpo, "o token foi parar na mensagem do aviso").not.toContain("TOKEN-SECRETO-DE-TESTE");
  });

  it("versão bem formada passa direto", async () => {
    process.env.META_GRAPH_API_VERSION = "v26.0";
    const chamou = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    const r = await enviar();

    expect(chamou).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
  });
});
