import { beforeEach, describe, expect, it } from "vitest";
import { enviarDoPainel, prepararAnexoDoPainel, registrarEntrada, type Dependencias } from "../src/lib/atendimento-servidor";
import { interpretarEventoDaEvolution, type MensagemDaEvolution } from "../src/lib/evolutionEventos";
import { bancoDeTeste, transporteDeTeste, LOJA_DE_TESTE } from "./bancoDoAtendimentoDeTeste";

/**
 * Os anexos da conversa no servidor (2026-10-20), ponta a ponta contra o
 * banco e o Storage em memória. Pedido do dono: *"envio de anexos, fotos,
 * vídeos e documentos"*.
 *
 * O que se trava:
 *   - o arquivo que o CLIENTE manda é pedido à Evolution e guardado na pasta
 *     do lead; o que não vem vira `midia_erro`, e a mensagem fica gravada e
 *     segue o fluxo (o assistente ainda responde);
 *   - o arquivo grande demais nem é pedido;
 *   - com `deps.depois`, o arquivo é guardado DEPOIS da resposta ao n8n;
 *   - o anexo do PAINEL só sai se o caminho é da pasta do lead e o arquivo
 *     está no bucket, com o tipo e o tamanho que o bucket diz; vai por URL
 *     assinada; o áudio vai como nota de voz, e o texto sai à parte;
 *   - o eco do documento sem legenda é reconhecido pelo nome do arquivo.
 */

const TERCA_10H = new Date("2026-10-20T13:00:00Z");
const CLIENTE = "5541999990000";
const LEAD = "6b0c2a3e-1f4d-4c8b-9a7e-2d5f8c1b3a90";
const OUTRO_LEAD = "0f1e2d3c-4b5a-4968-8776-655443322110";
const EVOLUTION = { url: "https://evolution.teste", chave: "chave", instancia: "loja" };
const CARLA = { full_name: "Carla Souza", telefone_e164: "+5541988887777", papeis: ["comercial"], role: "comercial", is_active: true };

const CONFIG = {
  id: "cfg",
  org_id: LOJA_DE_TESTE,
  ativo: true,
  nome_do_assistente: "Ney",
  modelo: "deepseek-flash",
  informar_preco: false,
  avisar_a_partir: "quente",
  distribuicao: "administrador",
  limiar_morno: 35,
  limiar_quente: 65,
  pesos: {},
  regras_da_loja: "",
  cadencias: {},
};

let relogio: Date;

const lead = (parcial: Record<string, unknown> = {}) => ({
  id: LEAD,
  nome: "Rafael",
  telefone: CLIENTE,
  canal: "WhatsApp",
  situacao: "novo",
  responsavel: "Carla Souza",
  desfecho: null,
  assistente_fase: "qualificando",
  qualificacao: null,
  cadencia: null,
  cadencia_passo: 0,
  cadencia_proximo_em: null,
  optout_em: null,
  ultimo_contato_em: null,
  created_at: "2026-10-20T12:50:00.000Z",
  ...parcial,
});

function montar(inicial: Record<string, Record<string, unknown>[]> = {}) {
  return bancoDeTeste(
    {
      atendimento_config: [CONFIG],
      profiles: [CARLA],
      leads: [lead()],
      atendimentos: [],
      atendimento_mensagens: [],
      atendimento_qualificacoes: [],
      leads_eventos: [],
      ...inicial,
    },
    { registrar_contato_do_lead: () => new Date().toISOString() },
    () => relogio,
  );
}

const deps = (t: ReturnType<typeof transporteDeTeste>, extra: Partial<Dependencias> = {}): Dependencias => ({
  agora: relogio,
  transporte: t.transporte,
  evolution: EVOLUTION,
  modelo: null,
  ...extra,
});

let wa = 0;
function evento(message: Record<string, unknown>, parcial: { deMim?: boolean } = {}): MensagemDaEvolution {
  wa += 1;
  const e = interpretarEventoDaEvolution(
    {
      event: "messages.upsert",
      data: {
        key: { remoteJid: `${CLIENTE}@s.whatsapp.net`, fromMe: parcial.deMim === true, id: `WA-${wa}` },
        pushName: "Rafael",
        message,
        messageTimestamp: Math.floor(relogio.getTime() / 1000),
        source: "android",
      },
    },
    relogio,
  );
  if (e.tipo !== "mensagem") throw new Error(`evento ignorado: ${e.motivo}`);
  return e;
}

const mensagem = (banco: ReturnType<typeof montar>, id: string) => banco.tabelas.atendimento_mensagens.find((m) => m.id === id)!;

beforeEach(() => {
  relogio = new Date(TERCA_10H);
});

describe("o arquivo que o cliente manda", () => {
  it("a foto: pedida à Evolution pelo id da mensagem e guardada na pasta do lead", async () => {
    const banco = montar();
    const t = transporteDeTeste([], { arquivoDaMensagem: () => ({ conteudo: "JPEG-DA-CNH", mimetype: "image/jpeg" }) });
    const e = evento({ imageMessage: { caption: "minha CNH", mimetype: "image/jpeg", fileLength: { low: 11, high: 0 } } });

    const r = await registrarEntrada(banco.cliente, e, deps(t));

    expect(r.acao).toBe("mensagem_registrada");
    expect(t.arquivosPedidos).toEqual([{ waId: e.waId, converterParaMp4: false }]);
    const m = mensagem(banco, r.mensagem!);
    expect(m).toMatchObject({
      conteudo: "imagem",
      texto: "minha CNH",
      midia_caminho: `${LEAD}/${m.id}.jpg`,
      midia_tipo: "image/jpeg",
      midia_bytes: 11,
      midia_erro: null,
    });
    expect(banco.objetos.get(`atendimento-midia/${LEAD}/${m.id}.jpg`)).toEqual({ bytes: 11, tipo: "image/jpeg" });
  });

  it("o documento leva o nome; o áudio é pedido convertido para MP4", async () => {
    const banco = montar();
    const t = transporteDeTeste([], {
      arquivoDaMensagem: (_id, mp4) => (mp4 ? { conteudo: "M4A", mimetype: "audio/mp4" } : { conteudo: "%PDF-1.7", mimetype: "application/pdf" }),
    });
    const doc = await registrarEntrada(banco.cliente, evento({ documentMessage: { fileName: "holerite.pdf", mimetype: "application/pdf" } }), deps(t));
    const audio = await registrarEntrada(banco.cliente, evento({ audioMessage: { mimetype: "audio/ogg; codecs=opus", seconds: 4 } }), deps(t));

    expect(mensagem(banco, doc.mensagem!)).toMatchObject({ midia_nome: "holerite.pdf", midia_tipo: "application/pdf", midia_caminho: `${LEAD}/${doc.mensagem}.pdf` });
    expect(mensagem(banco, audio.mensagem!)).toMatchObject({ midia_tipo: "audio/mp4", midia_caminho: `${LEAD}/${audio.mensagem}.m4a` });
    expect(t.arquivosPedidos.map((p) => p.converterParaMp4)).toEqual([false, true]);
  });

  it("o áudio que a Evolution não converte é pedido de novo, sem converter", async () => {
    const banco = montar();
    const t = transporteDeTeste([], {
      arquivoDaMensagem: (_id, mp4) => (mp4 ? { erro: "ffmpeg not found", status: 500 } : { conteudo: "OGG", mimetype: "audio/ogg; codecs=opus" }),
    });
    const r = await registrarEntrada(banco.cliente, evento({ audioMessage: { mimetype: "audio/ogg; codecs=opus" } }), deps(t));
    expect(mensagem(banco, r.mensagem!)).toMatchObject({ midia_tipo: "audio/ogg", midia_caminho: `${LEAD}/${r.mensagem}.ogg` });
  });

  it("a Evolution não entregou: a mensagem fica, com o motivo, e o assistente ainda responde", async () => {
    const banco = montar();
    const t = transporteDeTeste([], { arquivoDaMensagem: () => ({ erro: "Message not found", status: 400 }) });
    const r = await registrarEntrada(banco.cliente, evento({ videoMessage: { caption: "olha o barulho", mimetype: "video/mp4" } }), deps(t));

    expect(r).toMatchObject({ acao: "mensagem_registrada", responder: true });
    const m = mensagem(banco, r.mensagem!);
    expect(m.midia_caminho ?? null).toBeNull();
    expect(m.midia_erro).toContain("a Evolution não entregou o arquivo");
    expect(m.texto).toBe("olha o barulho");
  });

  it("acima de 50 MB nem é pedido: fica no celular da loja", async () => {
    const banco = montar();
    const t = transporteDeTeste([], { arquivoDaMensagem: () => ({ conteudo: "x" }) });
    const r = await registrarEntrada(
      banco.cliente,
      evento({ documentMessage: { fileName: "manual.pdf", mimetype: "application/pdf", fileLength: "80000000" } }),
      deps(t),
    );
    expect(t.arquivosPedidos).toHaveLength(0);
    expect(mensagem(banco, r.mensagem!).midia_erro).toContain("veja no celular da loja");
  });

  it("o bucket recusou: o motivo fica na mensagem", async () => {
    const banco = montar();
    banco.quebrarStorage("upload");
    const t = transporteDeTeste([], { arquivoDaMensagem: () => ({ conteudo: "JPEG", mimetype: "image/jpeg" }) });
    const r = await registrarEntrada(banco.cliente, evento({ imageMessage: { mimetype: "image/jpeg" } }), deps(t));
    expect(mensagem(banco, r.mensagem!).midia_erro).toContain("não subiu para o bucket");
  });

  it("com `depois`, o arquivo espera a resposta: a entrada volta antes de pedir à Evolution", async () => {
    const banco = montar();
    const t = transporteDeTeste([], { arquivoDaMensagem: () => ({ conteudo: "JPEG", mimetype: "image/jpeg" }) });
    const tarefas: Array<() => Promise<void>> = [];
    const r = await registrarEntrada(banco.cliente, evento({ imageMessage: { mimetype: "image/jpeg" } }), deps(t, { depois: (f) => void tarefas.push(f) }));

    expect(r.acao).toBe("mensagem_registrada");
    expect(t.arquivosPedidos).toHaveLength(0);
    expect(tarefas).toHaveLength(1);
    await tarefas[0]();
    expect(mensagem(banco, r.mensagem!).midia_caminho).toBe(`${LEAD}/${r.mensagem}.jpg`);
  });

  it("figurinha e localização não têm arquivo para guardar", async () => {
    const banco = montar();
    const t = transporteDeTeste([], { arquivoDaMensagem: () => ({ conteudo: "WEBP" }) });
    await registrarEntrada(banco.cliente, evento({ stickerMessage: { mimetype: "image/webp" } }), deps(t));
    await registrarEntrada(banco.cliente, evento({ locationMessage: { degreesLatitude: -25.4 } }), deps(t));
    expect(t.arquivosPedidos).toHaveLength(0);
  });

  it("a foto mandada do celular da loja também aparece no painel como arquivo", async () => {
    const banco = montar({ leads: [lead({ assistente_fase: "pausado" })] });
    const t = transporteDeTeste([], { arquivoDaMensagem: () => ({ conteudo: "JPEG-DO-CARRO", mimetype: "image/jpeg" }) });
    const r = await registrarEntrada(banco.cliente, evento({ imageMessage: { mimetype: "image/jpeg" } }, { deMim: true }), deps(t));

    expect(r.acao).toBe("mensagem_da_loja");
    const m = banco.tabelas.atendimento_mensagens.find((x) => x.gatilho === "celular")!;
    expect(m.midia_caminho).toBe(`${LEAD}/${m.id}.jpg`);
  });
});

describe("o anexo do painel", () => {
  const subir = (banco: ReturnType<typeof montar>, caminho: string, tipo: string, bytes: number) =>
    banco.objetos.set(`atendimento-midia/${caminho}`, { bytes, tipo });

  it("prepara a URL de upload na pasta do lead, para um arquivo que o WhatsApp aceita", async () => {
    const banco = montar();
    const r = await prepararAnexoDoPainel(banco.cliente, { leadId: LEAD, nome: "proposta.pdf", tipo: "application/pdf", bytes: 200_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.caminho).toMatch(new RegExp(`^${LEAD}/painel-[0-9a-f-]{36}\\.pdf$`));
    expect(r.token).toBe(`tok-${r.caminho}`);
  });

  it("recusa antes de subir: tipo fora da lista, ou vídeo acima de 16 MB", async () => {
    const banco = montar();
    const exe = await prepararAnexoDoPainel(banco.cliente, { leadId: LEAD, nome: "x.exe", tipo: "application/x-msdownload", bytes: 10 });
    const video = await prepararAnexoDoPainel(banco.cliente, { leadId: LEAD, nome: "test-drive.mp4", tipo: "video/mp4", bytes: 30 * 1024 * 1024 });
    expect(exe).toMatchObject({ ok: false, status: 422 });
    expect(video).toMatchObject({ ok: false, status: 422 });
    if (!video.ok) expect(video.erro).toContain("16 MB");
  });

  it("o documento sai por URL assinada, com o nome e a legenda, e fica gravado com o arquivo", async () => {
    const banco = montar();
    const caminho = `${LEAD}/painel-1a2b3c4d-0000-4000-8000-000000000001.pdf`;
    subir(banco, caminho, "application/pdf", 200_000);
    const t = transporteDeTeste();

    const r = await enviarDoPainel(banco.cliente, { leadId: LEAD, texto: "Segue a proposta", autor: "Carla Souza", anexo: { caminho, nome: "Proposta Onix.pdf" } }, deps(t));

    expect(r).toEqual({ ok: true });
    expect(t.saidas).toEqual([
      {
        tipo: "anexo",
        numero: CLIENTE,
        mediatype: "document",
        mimetype: "application/pdf",
        url: expect.stringMatching(/^https:\/\/storage\.teste\/atendimento-midia\/.+\?token=assinado&ttl=600$/),
        legenda: "Segue a proposta",
        nome: "Proposta Onix.pdf",
      },
    ]);
    const m = banco.tabelas.atendimento_mensagens.find((x) => x.gatilho === "painel")!;
    expect(m).toMatchObject({
      conteudo: "documento",
      texto: "Segue a proposta",
      situacao: "enviada",
      midia_caminho: caminho,
      midia_tipo: "application/pdf",
      midia_nome: "Proposta Onix.pdf",
      midia_bytes: 200_000,
      autor_nome: "Carla Souza",
    });
    // Conta como atendimento e tira o assistente, como o texto.
    expect(banco.tabelas.leads[0].assistente_fase).toBe("pausado");
  });

  it("a foto e o vídeo saem como foto e vídeo; o .mov do iPhone, como documento", async () => {
    const banco = montar();
    const foto = `${LEAD}/painel-1a2b3c4d-0000-4000-8000-000000000002.jpg`;
    const video = `${LEAD}/painel-1a2b3c4d-0000-4000-8000-000000000003.mp4`;
    const mov = `${LEAD}/painel-1a2b3c4d-0000-4000-8000-000000000004.mov`;
    subir(banco, foto, "image/jpeg", 900_000);
    subir(banco, video, "video/mp4", 9_000_000);
    subir(banco, mov, "video/quicktime", 9_000_000);
    const t = transporteDeTeste();
    for (const caminho of [foto, video, mov]) {
      expect(await enviarDoPainel(banco.cliente, { leadId: LEAD, texto: "", autor: "Carla Souza", anexo: { caminho } }, deps(t))).toEqual({ ok: true });
    }
    expect(t.saidas.map((s) => (s.tipo === "anexo" ? s.mediatype : s.tipo))).toEqual(["image", "video", "document"]);
    expect(banco.tabelas.atendimento_mensagens.filter((m) => m.gatilho === "painel").map((m) => m.conteudo)).toEqual(["imagem", "video", "documento"]);
  });

  it("o áudio vai como nota de voz, e o texto sai logo depois, como mensagem", async () => {
    const banco = montar();
    const caminho = `${LEAD}/painel-1a2b3c4d-0000-4000-8000-000000000005.mp3`;
    subir(banco, caminho, "audio/mpeg", 300_000);
    const t = transporteDeTeste();
    const r = await enviarDoPainel(banco.cliente, { leadId: LEAD, texto: "Ouve esse recado", autor: "Carla Souza", anexo: { caminho } }, deps(t));
    expect(r).toEqual({ ok: true });
    expect(t.saidas.map((s) => s.tipo)).toEqual(["audio", "texto"]);
    const doPainel = banco.tabelas.atendimento_mensagens.filter((m) => m.gatilho === "painel");
    expect(doPainel.map((m) => [m.conteudo, m.texto])).toEqual([
      ["audio", null],
      ["texto", "Ouve esse recado"],
    ]);
  });

  it("caminho de outro lead, ou fora do formato do painel: 400, e nada sai", async () => {
    const banco = montar();
    const alheio = `${OUTRO_LEAD}/painel-1a2b3c4d-0000-4000-8000-000000000006.pdf`;
    subir(banco, alheio, "application/pdf", 10);
    const t = transporteDeTeste();
    for (const caminho of [alheio, `${LEAD}/../${OUTRO_LEAD}/painel-x.pdf`, `${LEAD}/msg-do-cliente.pdf`, "https://exemplo.com/x.pdf"]) {
      const r = await enviarDoPainel(banco.cliente, { leadId: LEAD, texto: "", autor: "Carla", anexo: { caminho } }, deps(t));
      expect(r, caminho).toMatchObject({ ok: false, status: 400 });
    }
    expect(t.saidas).toHaveLength(0);
  });

  it("o arquivo não chegou ao bucket: 409, e nada sai", async () => {
    const banco = montar();
    const t = transporteDeTeste();
    const r = await enviarDoPainel(
      banco.cliente,
      { leadId: LEAD, texto: "", autor: "Carla", anexo: { caminho: `${LEAD}/painel-1a2b3c4d-0000-4000-8000-000000000007.pdf` } },
      deps(t),
    );
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(t.saidas).toHaveLength(0);
  });

  it("vale o que o BUCKET diz do arquivo, e não o nome: executável renomeado é recusado", async () => {
    const banco = montar();
    const caminho = `${LEAD}/painel-1a2b3c4d-0000-4000-8000-000000000008.pdf`;
    subir(banco, caminho, "application/x-msdownload", 10);
    const t = transporteDeTeste();
    const r = await enviarDoPainel(banco.cliente, { leadId: LEAD, texto: "", autor: "Carla", anexo: { caminho } }, deps(t));
    expect(r).toMatchObject({ ok: false, status: 422 });
    expect(t.saidas).toHaveLength(0);
  });

  it("a Evolution recusou: a mensagem fica como não saiu, com o motivo", async () => {
    const banco = montar();
    const caminho = `${LEAD}/painel-1a2b3c4d-0000-4000-8000-000000000009.pdf`;
    subir(banco, caminho, "application/pdf", 10);
    const t = transporteDeTeste([], { anexoRecusado: () => true });
    const r = await enviarDoPainel(banco.cliente, { leadId: LEAD, texto: "", autor: "Carla", anexo: { caminho } }, deps(t));
    expect(r).toMatchObject({ ok: false, status: 502 });
    if (!r.ok) expect(r.erro).toContain("O anexo não saiu");
    expect(banco.tabelas.atendimento_mensagens.find((m) => m.gatilho === "painel")).toMatchObject({ situacao: "falhou", midia_caminho: caminho });
  });

  it("o eco do documento sem legenda é reconhecido pelo nome do arquivo, e não vira mensagem do celular", async () => {
    const banco = montar();
    banco.tabelas.atendimento_mensagens.push({
      id: "m-painel",
      lead_id: LEAD,
      telefone: CLIENTE,
      direcao: "saida",
      autor: "vendedor",
      conteudo: "documento",
      texto: null,
      midia_nome: "Proposta Onix.pdf",
      gatilho: "painel",
      situacao: "pendente",
      wa_id: null,
      criado_em: new Date(relogio.getTime() - 5_000).toISOString(),
    });
    const t = transporteDeTeste();
    const r = await registrarEntrada(
      banco.cliente,
      evento({ documentMessage: { fileName: "Proposta Onix.pdf", mimetype: "application/pdf" } }, { deMim: true }),
      deps(t),
    );
    expect(r).toMatchObject({ acao: "eco", mensagem: "m-painel" });
    expect(banco.tabelas.atendimento_mensagens.filter((m) => m.gatilho === "celular")).toHaveLength(0);
    expect(t.arquivosPedidos).toHaveLength(0);
  });
});
