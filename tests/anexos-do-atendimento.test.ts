import { describe, expect, it } from "vitest";
import {
  ACEITOS_NO_PAINEL,
  anexoDoPainel,
  caminhoDoAnexo,
  caminhoDoPainelNoLead,
  extensaoDoArquivo,
  nomeDoArquivo,
  tamanhoLegivel,
  temArquivo,
  tipoBase,
} from "../src/lib/anexosDoAtendimento";
import { baixarMidia, enviarAnexo } from "../src/lib/evolution";
import { interpretarEventoDaEvolution } from "../src/lib/evolutionEventos";
import { anexoDaMensagem, marcasDaMensagem, textoDaMensagem } from "../src/lib/atendimentoNaTela";

/**
 * Os anexos da conversa (2026-10-20), nas peças puras: as regras do arquivo,
 * os dois chamados novos à Evolution, o que o webhook diz do arquivo e o que
 * a tela mostra.
 */

const LEAD = "6b0c2a3e-1f4d-4c8b-9a7e-2d5f8c1b3a90";
const CFG = { url: "https://evolution.teste", chave: "chave", instancia: "loja" };
const MB = 1024 * 1024;

describe("as regras do arquivo", () => {
  it("o painel aceita foto JPG/PNG, vídeo MP4, áudio e documento, cada um no teto do WhatsApp", () => {
    expect(anexoDoPainel({ tipo: "image/jpeg", bytes: 2 * MB })).toMatchObject({ ok: true, conteudo: "imagem" });
    expect(anexoDoPainel({ tipo: "video/mp4", bytes: 15 * MB })).toMatchObject({ ok: true, conteudo: "video" });
    expect(anexoDoPainel({ tipo: "audio/ogg; codecs=opus", bytes: MB })).toMatchObject({ ok: true, conteudo: "audio", tipo: "audio/ogg" });
    expect(anexoDoPainel({ tipo: "application/pdf", bytes: 40 * MB })).toMatchObject({ ok: true, conteudo: "documento" });
    // O que o WhatsApp não mostra como foto ou vídeo vai como documento.
    expect(anexoDoPainel({ tipo: "video/quicktime", bytes: MB })).toMatchObject({ ok: true, conteudo: "documento" });
    expect(anexoDoPainel({ tipo: "image/webp", bytes: MB })).toMatchObject({ ok: true, conteudo: "documento" });
  });

  it("recusa com a frase que a tela mostra", () => {
    const grande = anexoDoPainel({ tipo: "video/mp4", bytes: 20 * MB });
    expect(grande).toMatchObject({ ok: false });
    if (!grande.ok) expect(grande.erro).toBe("O vídeo passa de 16 MB (20 MB): o WhatsApp não aceita. Mande um menor.");
    expect(anexoDoPainel({ tipo: "application/x-msdownload", bytes: 10 })).toMatchObject({ ok: false });
    expect(anexoDoPainel({ tipo: "application/pdf", bytes: 0 })).toEqual({ ok: false, erro: "O arquivo está vazio." });
    expect(anexoDoPainel({ tipo: "application/pdf", bytes: 51 * MB })).toMatchObject({ ok: false });
  });

  it("o `accept` do campo é a mesma lista do servidor", () => {
    expect(ACEITOS_NO_PAINEL.split(",")).toContain("application/pdf");
    expect(ACEITOS_NO_PAINEL.split(",")).not.toContain("application/x-msdownload");
  });

  it("extensão, nome e tipo", () => {
    expect(tipoBase("Audio/OGG; codecs=opus")).toBe("audio/ogg");
    expect(extensaoDoArquivo("image/jpeg")).toBe("jpg");
    expect(extensaoDoArquivo("application/octet-stream", "planilha.XLSX")).toBe("xlsx");
    expect(extensaoDoArquivo(null, "sem-extensao")).toBe("bin");
    expect(nomeDoArquivo("C:\\fakepath\\proposta.pdf")).toBe("proposta.pdf");
    expect(nomeDoArquivo("  ")).toBeNull();
    expect(nomeDoArquivo(`${"a".repeat(200)}.pdf`)!.length).toBeLessThanOrEqual(120);
    expect(temArquivo("documento")).toBe(true);
    expect(temArquivo("figurinha")).toBe(false);
  });

  it("o caminho: a pasta é o lead, e só o do painel passa pela conferência do envio", () => {
    expect(caminhoDoAnexo(LEAD, "abc-123", "pdf")).toBe(`${LEAD}/abc-123.pdf`);
    expect(caminhoDoAnexo(LEAD, "abc", "../x")).toBe(`${LEAD}/abc.bin`);
    const doPainel = caminhoDoAnexo(LEAD, "1a2b3c4d-0000-4000-8000-000000000001", "mp4", "painel-");
    expect(caminhoDoPainelNoLead(doPainel, LEAD)).toBe(true);
    expect(caminhoDoPainelNoLead(`${LEAD}/msg-1.pdf`, LEAD)).toBe(false);
    expect(caminhoDoPainelNoLead(`${LEAD}/sub/painel-12345678.pdf`, LEAD)).toBe(false);
    expect(caminhoDoPainelNoLead(doPainel.replace(LEAD, "0f1e2d3c-4b5a-4968-8776-655443322110"), LEAD)).toBe(false);
    expect(caminhoDoPainelNoLead(42, LEAD)).toBe(false);
  });

  it("o tamanho legível", () => {
    expect(tamanhoLegivel(512)).toBe("512 B");
    expect(tamanhoLegivel(830 * 1024)).toBe("830 KB");
    expect(tamanhoLegivel(1.25 * MB)).toBe("1,3 MB");
    expect(tamanhoLegivel(16 * MB)).toBe("16 MB");
    expect(tamanhoLegivel(null)).toBe("");
  });
});

describe("o que o webhook diz do arquivo", () => {
  const ler = (message: Record<string, unknown>) => {
    const e = interpretarEventoDaEvolution({
      event: "messages.upsert",
      data: { key: { remoteJid: "5541999990000@s.whatsapp.net", fromMe: false, id: "WA-1" }, message },
    });
    if (e.tipo !== "mensagem") throw new Error(e.motivo);
    return e;
  };

  it("tipo, nome e tamanho — o tamanho como número, texto ou o Long do protobuf", () => {
    expect(ler({ imageMessage: { mimetype: "image/jpeg", fileLength: { low: 2048, high: 0 } } }).midia).toEqual({ tipo: "image/jpeg", nome: null, bytes: 2048 });
    expect(ler({ documentMessage: { fileName: "cnh.pdf", mimetype: "application/pdf", fileLength: "120345" } }).midia).toEqual({
      tipo: "application/pdf",
      nome: "cnh.pdf",
      bytes: 120345,
    });
    expect(ler({ audioMessage: { mimetype: "audio/ogg; codecs=opus", fileLength: 9000 } }).midia).toMatchObject({ tipo: "audio/ogg; codecs=opus", bytes: 9000 });
    // O vídeo redondo ("bolinha") é vídeo.
    expect(ler({ ptvMessage: { mimetype: "video/mp4" } })).toMatchObject({ conteudo: "video", midia: { tipo: "video/mp4" } });
    // O documento com legenda vem embrulhado.
    expect(ler({ documentWithCaptionMessage: { message: { documentMessage: { fileName: "rg.pdf", caption: "meu RG" } } } })).toMatchObject({
      conteudo: "documento",
      texto: "meu RG",
      midia: { nome: "rg.pdf" },
    });
    expect(ler({ conversation: "oi" }).midia).toBeNull();
  });
});

describe("os chamados à Evolution", () => {
  const registrar = (resposta: Response) => {
    const pedidos: { url: string; corpo: Record<string, unknown> }[] = [];
    const transporte = async (url: string, init?: RequestInit) => {
      pedidos.push({ url, corpo: JSON.parse(String(init?.body)) });
      return resposta.clone();
    };
    return { pedidos, transporte };
  };

  it("baixarMidia: pede pelo id, devolve o base64 limpo e o tipo", async () => {
    const { pedidos, transporte } = registrar(Response.json({ base64: "data:image/jpeg;base64,QUJD", mimetype: "image/jpeg", fileName: null }));
    const r = await baixarMidia("WA-9", CFG, { converterParaMp4: true, transporte });
    expect(r).toEqual({ ok: true, base64: "QUJD", tipo: "image/jpeg", nome: null });
    expect(pedidos).toEqual([
      { url: "https://evolution.teste/chat/getBase64FromMediaMessage/loja", corpo: { message: { key: { id: "WA-9" } }, convertToMp4: true } },
    ]);
  });

  it("baixarMidia: recusa e resposta sem arquivo viram motivo, nunca exceção", async () => {
    const recusa = registrar(Response.json({ response: { message: ["Message not found"] } }, { status: 400 }));
    expect(await baixarMidia("WA-9", CFG, { transporte: recusa.transporte })).toEqual({ ok: false, motivo: "a Evolution não entregou o arquivo: Message not found" });
    const vazia = registrar(Response.json({ mimetype: "image/jpeg" }));
    expect(await baixarMidia("WA-9", CFG, { transporte: vazia.transporte })).toEqual({ ok: false, motivo: "a Evolution respondeu sem o arquivo" });
  });

  it("enviarAnexo: documento pelo sendMedia, com mimetype, nome e legenda", async () => {
    const { pedidos, transporte } = registrar(Response.json({ key: { id: "WA-OUT" } }, { status: 201 }));
    const r = await enviarAnexo(
      "+55 41 99999-0000",
      { url: "https://storage.teste/a.pdf?token=x", conteudo: "documento", tipo: "application/pdf", nome: "Proposta.pdf", legenda: "Segue" },
      CFG,
      { transporte },
    );
    expect(r).toEqual({ ok: true, waId: "WA-OUT" });
    expect(pedidos[0]).toEqual({
      url: "https://evolution.teste/message/sendMedia/loja",
      corpo: { number: "5541999990000", mediatype: "document", mimetype: "application/pdf", media: "https://storage.teste/a.pdf?token=x", caption: "Segue", fileName: "Proposta.pdf" },
    });
  });

  it("enviarAnexo: o áudio vai pelo sendWhatsAppAudio, sem legenda", async () => {
    const { pedidos, transporte } = registrar(Response.json({ key: { id: "WA-AUD" } }, { status: 201 }));
    await enviarAnexo("5541999990000", { url: "https://storage.teste/a.mp3", conteudo: "audio", tipo: "audio/mpeg", legenda: "ignorada" }, CFG, { transporte });
    expect(pedidos[0]).toEqual({ url: "https://evolution.teste/message/sendWhatsAppAudio/loja", corpo: { number: "5541999990000", audio: "https://storage.teste/a.mp3" } });
  });

  it("enviarAnexo: sem https, nem chama; recusa da Evolution vira motivo", async () => {
    const { pedidos, transporte } = registrar(Response.json({ message: "media download failed" }, { status: 500 }));
    expect(await enviarAnexo("5541999990000", { url: "http://x/a.pdf", conteudo: "documento", tipo: "application/pdf" }, CFG, { transporte })).toEqual({
      ok: false,
      motivo: "anexo sem endereço https",
    });
    expect(pedidos).toHaveLength(0);
    expect(await enviarAnexo("5541999990000", { url: "https://x/a.mp4", conteudo: "video", tipo: "video/mp4" }, CFG, { transporte })).toEqual({
      ok: false,
      motivo: "a Evolution recusou o anexo: media download failed",
    });
    expect(pedidos[0].corpo.mediatype).toBe("video");
  });
});

describe("o que a tela mostra", () => {
  const base = { id: "11111111-2222-4333-8444-555555555555", texto: null as string | null, midia_url: null, gatilho: null, situacao: "recebida" as const, camada: null };

  it("o arquivo guardado abre pela porta do painel, e não pelo bucket", () => {
    const m = { ...base, conteudo: "documento" as const, texto: "cnh.pdf", midia_caminho: `${LEAD}/x.pdf`, midia_nome: "cnh.pdf", midia_bytes: 120345 };
    expect(anexoDaMensagem(m, LEAD)).toEqual({
      conteudo: "documento",
      src: `/api/leads/${LEAD}/conversa/midia/${base.id}`,
      baixar: `/api/leads/${LEAD}/conversa/midia/${base.id}?baixar=1`,
      nome: "cnh.pdf",
      tamanho: "118 KB",
    });
    // O nome já está no cartão: o texto (que era o nome) não se repete.
    expect(textoDaMensagem(m)).toBe("");
    expect(textoDaMensagem({ ...m, texto: "meu documento" })).toBe("meu documento");
  });

  it("sem arquivo guardado, o rótulo de sempre — e a marca diz onde está o arquivo", () => {
    const m = { ...base, conteudo: "video" as const, texto: "olha", midia_erro: "a Evolution não entregou o arquivo" };
    expect(anexoDaMensagem(m, LEAD)).toBeNull();
    expect(textoDaMensagem(m)).toBe("[Vídeo] olha");
    expect(marcasDaMensagem(m)).toEqual(["arquivo só no celular da loja"]);
    // Figurinha nunca tem arquivo.
    expect(anexoDaMensagem({ ...base, conteudo: "figurinha" as const, midia_caminho: `${LEAD}/x.webp` }, LEAD)).toBeNull();
  });
});
