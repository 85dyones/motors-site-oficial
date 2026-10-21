import { describe, expect, it } from "vitest";
import {
  digitadaNoCelular,
  interpretarEventoDaEvolution,
  mensagemDaLojaAssume,
  telefoneDoJid,
  type MensagemDaEvolution,
} from "../src/lib/evolutionEventos";

/**
 * A leitura do webhook da Evolution (2026-10-20): o envelope de
 * `messages.upsert` vira a mensagem que importa — e nunca devolve a `apikey`
 * que a Evolution põe em todo evento.
 */

const AGORA = new Date("2026-10-20T15:00:00Z");

function envelope(data: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    event: "messages.upsert",
    instance: "loja",
    apikey: "SEGREDO-DA-INSTANCIA",
    data: {
      key: { remoteJid: "5541999990000@s.whatsapp.net", fromMe: false, id: "3EB0AAA" },
      pushName: "Fulano de Tal",
      messageTimestamp: 1792509600,
      source: "android",
      ...data,
    },
    ...extra,
  };
}

const mensagem = (e: ReturnType<typeof interpretarEventoDaEvolution>) => {
  expect(e.tipo).toBe("mensagem");
  return e as MensagemDaEvolution;
};

describe("o que entra", () => {
  it("texto simples, com telefone em dígitos, nome e horário do WhatsApp", () => {
    const m = mensagem(interpretarEventoDaEvolution(envelope({ message: { conversation: "Oi, tem Onix?" } }), AGORA));
    expect(m).toMatchObject({
      waId: "3EB0AAA",
      telefone: "5541999990000",
      nome: "Fulano de Tal",
      deMim: false,
      conteudo: "texto",
      texto: "Oi, tem Onix?",
      aparelho: "android",
      em: new Date(1792509600 * 1000).toISOString(),
    });
  });

  it("nada da apikey sai na leitura", () => {
    const m = interpretarEventoDaEvolution(envelope({ message: { conversation: "oi" } }), AGORA);
    expect(JSON.stringify(m)).not.toContain("SEGREDO-DA-INSTANCIA");
  });

  it("anúncio de clique para o WhatsApp vira origem", () => {
    const m = mensagem(
      interpretarEventoDaEvolution(
        envelope({
          message: {
            extendedTextMessage: {
              text: "Olá! Quero saber mais.",
              contextInfo: {
                entryPointConversionSource: "ctwa_ad",
                externalAdReply: { sourceType: "ad", sourceId: "120210", title: "SUVs a partir de 79 mil", sourceUrl: "https://fb.me/x", ctwaClid: "clid-1" },
              },
            },
          },
        }),
        AGORA,
      ),
    );
    expect(m.texto).toBe("Olá! Quero saber mais.");
    expect(m.origem).toEqual({
      tipo: "ad",
      anuncio_id: "120210",
      titulo: "SUVs a partir de 79 mil",
      url: "https://fb.me/x",
      ctwa_clid: "clid-1",
      entrada: "ctwa_ad",
    });
  });

  it("foto com legenda, áudio com transcrição, documento pelo nome", () => {
    expect(mensagem(interpretarEventoDaEvolution(envelope({ message: { imageMessage: { caption: "esse aqui" } } }), AGORA))).toMatchObject({
      conteudo: "imagem",
      texto: "esse aqui",
    });
    expect(
      mensagem(interpretarEventoDaEvolution(envelope({ message: { audioMessage: {}, speechToText: "quero financiar" } }), AGORA)),
    ).toMatchObject({ conteudo: "audio", texto: "quero financiar" });
    expect(mensagem(interpretarEventoDaEvolution(envelope({ message: { audioMessage: {} } }), AGORA))).toMatchObject({ conteudo: "audio", texto: null });
    expect(
      mensagem(interpretarEventoDaEvolution(envelope({ message: { documentMessage: { fileName: "cnh.pdf" } } }), AGORA)),
    ).toMatchObject({ conteudo: "documento", texto: "cnh.pdf" });
  });

  it("tira os envelopes efêmero e de visualização única", () => {
    const m = mensagem(
      interpretarEventoDaEvolution(envelope({ message: { ephemeralMessage: { message: { extendedTextMessage: { text: "sumindo" } } } } }), AGORA),
    );
    expect(m.texto).toBe("sumindo");
  });

  it("LID: o número vem do campo alternativo", () => {
    const m = mensagem(
      interpretarEventoDaEvolution(
        envelope({ key: { remoteJid: "12345678@lid", remoteJidAlt: "5541988887777@s.whatsapp.net", fromMe: false, id: "X1" }, message: { conversation: "oi" } }),
        AGORA,
      ),
    );
    expect(m.telefone).toBe("5541988887777");
  });

  it("aceita o `data` sozinho e o evento em maiúsculas", () => {
    expect(interpretarEventoDaEvolution(envelope({ message: { conversation: "oi" } }).data, AGORA).tipo).toBe("mensagem");
    expect(interpretarEventoDaEvolution({ ...envelope({ message: { conversation: "oi" } }), event: "MESSAGES_UPSERT" }, AGORA).tipo).toBe("mensagem");
  });

  it("mensagem da loja: sem nome (o pushName seria o da loja) e sem origem", () => {
    const m = mensagem(
      interpretarEventoDaEvolution(
        envelope({ key: { remoteJid: "5541999990000@s.whatsapp.net", fromMe: true, id: "Y1" }, message: { conversation: "Bom dia!" } }),
        AGORA,
      ),
    );
    expect(m).toMatchObject({ deMim: true, nome: null, origem: null });
  });

  it("horário ilegível fica o de agora", () => {
    const m = mensagem(interpretarEventoDaEvolution(envelope({ messageTimestamp: 1792509600000, message: { conversation: "oi" } }), AGORA));
    expect(m.em).toBe(AGORA.toISOString());
  });
});

describe("o que não entra", () => {
  it.each([
    ["grupo", { key: { remoteJid: "1203630@g.us", fromMe: false, id: "G" }, message: { conversation: "oi" } }, "grupo"],
    ["status", { key: { remoteJid: "status@broadcast", fromMe: false, id: "S" }, message: { conversation: "oi" } }, "status"],
    ["canal", { key: { remoteJid: "1203@newsletter", fromMe: false, id: "N" }, message: { conversation: "oi" } }, "canal"],
    ["reação", { message: { reactionMessage: { text: "👍" } } }, "reação"],
    ["apagar", { message: { protocolMessage: { type: 0 } } }, "reação"],
    ["sem id", { key: { remoteJid: "5541999990000@s.whatsapp.net" }, message: { conversation: "oi" } }, "id"],
    ["número estrangeiro curto", { key: { remoteJid: "1555123@s.whatsapp.net", id: "Z" }, message: { conversation: "oi" } }, "telefone"],
  ])("%s", (_rotulo, data, motivo) => {
    const e = interpretarEventoDaEvolution(envelope(data as Record<string, unknown>), AGORA);
    expect(e.tipo).toBe("ignorado");
    expect((e as { motivo: string }).motivo).toContain(motivo);
  });

  it("outros eventos da Evolution", () => {
    expect(interpretarEventoDaEvolution({ event: "connection.update", data: {} }, AGORA)).toEqual({ tipo: "ignorado", motivo: "evento connection.update" });
    expect(interpretarEventoDaEvolution(null, AGORA).tipo).toBe("ignorado");
  });
});

describe("as réguas da mensagem da loja", () => {
  it("texto e vídeo assumem; áudio, foto e documento não (a régua do manobrAI)", () => {
    expect(mensagemDaLojaAssume("texto")).toBe(true);
    expect(mensagemDaLojaAssume("video")).toBe(true);
    for (const c of ["audio", "imagem", "documento", "figurinha"] as const) expect(mensagemDaLojaAssume(c)).toBe(false);
  });

  it("só celular na mão conta como gente: `web` pode ser a API de outra automação", () => {
    expect(digitadaNoCelular("android")).toBe(true);
    expect(digitadaNoCelular("ios")).toBe(true);
    expect(digitadaNoCelular("web")).toBe(false);
    expect(digitadaNoCelular(null)).toBe(false);
  });

  it("telefone do JID: só pessoa, só com DDI brasileiro na faixa", () => {
    expect(telefoneDoJid("5541999990000:12@s.whatsapp.net")).toBe("5541999990000");
    expect(telefoneDoJid("5541999990000@c.us")).toBe("5541999990000");
    expect(telefoneDoJid("123@lid")).toBeNull();
  });
});
