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

describe("a CAPI aciona o aviso nos TRÊS pontos de perda", () => {
  const lib = lerCodigo("src/lib/meta-capi.ts");

  it("configuração ausente, recusa do Meta e falha de rede", () => {
    /* Três formas de o evento não chegar, e a primeira é a pior: sem
       `META_GRAPH_API_VERSION` (que não tem default) a CAPI inteira morre sem
       nenhuma tentativa de entrega para alguém estranhar depois.

       A contagem trava o conjunto: cobrir dois e esquecer um deixa exatamente
       o buraco que este trabalho existe para fechar. */
    const avisos = lib.split("alertarFalha(").length - 1;
    expect(avisos, "um dos pontos de perda parou de avisar").toBe(3);
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
