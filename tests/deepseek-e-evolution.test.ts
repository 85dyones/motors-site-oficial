import { afterEach, describe, expect, it, vi } from "vitest";
import { completarEmJson, configDoModelo, custoEstimado, MODELO_PADRAO } from "../src/lib/deepseek";
import { atrasoDeDigitacao, configDaEvolution, enviarImagem, enviarTexto, motivoSemEvolution, numeroParaEnvio } from "../src/lib/evolution";

/**
 * As duas fronteiras do atendimento (2026-10-20): o modelo e o WhatsApp. Nunca
 * lançam; o que dá errado volta com motivo, sem a chave.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

const resposta = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status });

describe("a DeepSeek", () => {
  const cfg = { chave: "SEGREDO", url: "https://api.deepseek.com", modelo: MODELO_PADRAO };

  it("chama /chat/completions sem raciocínio, em JSON, com o modelo barato", async () => {
    let pedido: { url: string; init: RequestInit & { headers: Record<string, string> }; corpo: Record<string, unknown> } | null = null;
    const r = await completarEmJson({
      cfg,
      mensagens: [{ role: "system", content: "json" }],
      transporte: async (url, init) => {
        pedido = { url, init: init as RequestInit & { headers: Record<string, string> }, corpo: JSON.parse(String(init!.body)) };
        return resposta(200, { choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 10, prompt_cache_hit_tokens: 4, completion_tokens: 2 } });
      },
    });
    expect(r).toEqual({ ok: true, conteudo: '{"ok":true}', uso: { entrada: 10, entradaEmCache: 4, saida: 2 } });
    expect(pedido!.url).toBe("https://api.deepseek.com/chat/completions");
    expect(pedido!.init.headers.Authorization).toBe("Bearer SEGREDO");
    expect(pedido!.corpo).toMatchObject({ model: "deepseek-flash", thinking: { type: "disabled" }, response_format: { type: "json_object" }, stream: false });
  });

  it("o pedido com imagem vai sem o modo JSON, que a página de visão não garante", async () => {
    let corpo: Record<string, unknown> | null = null;
    await completarEmJson({
      cfg,
      mensagens: [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://f.teste/1.jpg", detail: "low" } }] }],
      modoJson: false,
      transporte: async (_url, init) => {
        corpo = JSON.parse(String(init!.body));
        return resposta(200, { choices: [{ message: { content: "{}" } }] });
      },
    });
    expect(corpo).not.toHaveProperty("response_format");
    expect(corpo).toMatchObject({ thinking: { type: "disabled" }, messages: [{ role: "user", content: [{ type: "image_url" }] }] });
  });

  it("recusa e conteúdo vazio voltam como motivo, sem a chave", async () => {
    const recusa = await completarEmJson({ cfg, mensagens: [], transporte: async () => resposta(401, { error: { message: "Authentication Fails" } }) });
    expect(recusa).toEqual({ ok: false, motivo: "A DeepSeek recusou a chamada: Authentication Fails" });
    const vazio = await completarEmJson({ cfg, mensagens: [], transporte: async () => resposta(200, { choices: [{ message: { content: "" } }] }) });
    expect(vazio).toEqual({ ok: false, motivo: "A DeepSeek respondeu sem conteúdo." });
    const caiu = await completarEmJson({ cfg, mensagens: [], transporte: async () => { throw new Error("ECONNRESET"); } });
    expect(caiu.ok).toBe(false);
    expect(JSON.stringify([recusa, vazio, caiu])).not.toContain("SEGREDO");
  });

  it("sem DEEPSEEK_API_KEY não há modelo; com ela, o padrão é o deepseek-flash", () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    expect(configDoModelo()).toBeNull();
    vi.stubEnv("DEEPSEEK_API_KEY", "k");
    expect(configDoModelo()).toEqual({ chave: "k", url: "https://api.deepseek.com", modelo: "deepseek-flash" });
    expect(configDoModelo("deepseek-v4-pro")!.modelo).toBe("deepseek-v4-pro");
  });

  it("o custo estimado pela tabela fora do pico, com o cache 50 vezes mais barato", () => {
    expect(custoEstimado({ entrada: 1_000_000, entradaEmCache: 0, saida: 0 })).toBeCloseTo(0.15);
    expect(custoEstimado({ entrada: 1_000_000, entradaEmCache: 1_000_000, saida: 0 })).toBeCloseTo(0.003);
    expect(custoEstimado({ entrada: 0, entradaEmCache: 0, saida: 1_000_000 })).toBeCloseTo(0.6);
  });
});

describe("a Evolution", () => {
  const cfg = { url: "https://evolution.teste", chave: "APIKEY", instancia: "loja 1" };

  it("POST /message/sendText/{instancia} com apikey, número em dígitos e o atraso de digitação", async () => {
    let pedido: { url: string; init: RequestInit & { headers: Record<string, string> }; corpo: Record<string, unknown> } | null = null;
    const r = await enviarTexto("+55 (41) 99999-0000", "  Oi!  ", cfg, {
      atrasoMs: 1500,
      transporte: async (url, init) => {
        pedido = { url, init: init as RequestInit & { headers: Record<string, string> }, corpo: JSON.parse(String(init!.body)) };
        return resposta(201, { key: { id: "WA-1" } });
      },
    });
    expect(r).toEqual({ ok: true, waId: "WA-1" });
    expect(pedido!.url).toBe("https://evolution.teste/message/sendText/loja%201");
    expect(pedido!.init.headers.apikey).toBe("APIKEY");
    expect(pedido!.corpo).toEqual({ number: "5541999990000", text: "Oi!", delay: 1500 });
  });

  it("a foto: POST /message/sendMedia/{instancia}, mediatype image, a URL em media e a legenda em caption", async () => {
    let pedido: { url: string; corpo: Record<string, unknown> } | null = null;
    const r = await enviarImagem("5541999990000", { url: "https://f.teste/onix-1.jpg", legenda: " Frente " }, cfg, {
      transporte: async (url, init) => {
        pedido = { url, corpo: JSON.parse(String(init!.body)) };
        return resposta(201, { key: { id: "WA-FOTO" } });
      },
    });
    expect(r).toEqual({ ok: true, waId: "WA-FOTO" });
    expect(pedido!.url).toBe("https://evolution.teste/message/sendMedia/loja%201");
    expect(pedido!.corpo).toEqual({ number: "5541999990000", mediatype: "image", media: "https://f.teste/onix-1.jpg", caption: "Frente" });
    // Sem legenda, sem `caption`; sem endereço http(s), nem sai.
    await enviarImagem("5541999990000", { url: "https://f.teste/2.jpg" }, cfg, {
      transporte: async (_url, init) => {
        pedido = { url: "", corpo: JSON.parse(String(init!.body)) };
        return resposta(201, { key: { id: "WA-2" } });
      },
    });
    expect(pedido!.corpo).not.toHaveProperty("caption");
    expect(await enviarImagem("5541999990000", { url: "/logo.png" }, cfg, { transporte: async () => { throw new Error("não devia chamar"); } })).toEqual({ ok: false, motivo: "foto sem endereço http(s)" });
    const recusa = await enviarImagem("5541999990000", { url: "https://f.teste/3.jpg" }, cfg, { transporte: async () => resposta(400, { response: { message: ["media not found"] } }) });
    expect(recusa).toEqual({ ok: false, motivo: "a Evolution recusou a foto: media not found" });
  });

  it("telefone inválido e mensagem vazia nem saem", async () => {
    const nunca = async () => { throw new Error("não devia chamar"); };
    expect(await enviarTexto("123", "oi", cfg, { transporte: nunca })).toEqual({ ok: false, motivo: "telefone inválido para envio" });
    expect(await enviarTexto("5541999990000", "  ", cfg, { transporte: nunca })).toEqual({ ok: false, motivo: "mensagem vazia" });
  });

  it("recusa volta com motivo legível, sem a apikey", async () => {
    const r = await enviarTexto("5541999990000", "oi", cfg, { transporte: async () => resposta(400, { response: { message: ["number not on WhatsApp"] } }) });
    expect(r).toEqual({ ok: false, motivo: "a Evolution recusou o envio: number not on WhatsApp" });
  });

  it("a configuração vem das três variáveis, e o motivo diz qual falta", () => {
    vi.stubEnv("EVOLUTION_API_URL", "https://evo.teste/");
    vi.stubEnv("EVOLUTION_API_KEY", "");
    vi.stubEnv("EVOLUTION_INSTANCIA", "loja");
    expect(configDaEvolution()).toBeNull();
    expect(motivoSemEvolution()).toBe("falta EVOLUTION_API_KEY na Vercel");
    vi.stubEnv("EVOLUTION_API_KEY", "k");
    expect(configDaEvolution()).toEqual({ url: "https://evo.teste", chave: "k", instancia: "loja" });
  });

  it("número e atraso", () => {
    expect(numeroParaEnvio("5541999990000")).toBe("5541999990000");
    expect(numeroParaEnvio("41999990000")).toBeNull();
    expect(atrasoDeDigitacao("oi")).toBe(1200);
    expect(atrasoDeDigitacao("x".repeat(1000))).toBe(6000);
  });
});
