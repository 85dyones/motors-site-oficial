import { describe, expect, it } from "vitest";
import { ARQUIVO_DO_HISTORICO, jidsDoTelefone, lidsDosRegistros, mensagensDoHistorico } from "../src/lib/historicoDoWhatsApp";
import { trazerHistoricoDoWhatsApp } from "../src/lib/historicoDoWhatsApp-servidor";
import { bancoDeTeste } from "./bancoDoAtendimentoDeTeste";

/**
 * O histórico do WhatsApp no painel (2026-10-21): *"é possível trazer o
 * histórico mais recente de mensagens dos leads ainda ativos no painel?"*.
 *
 * O que se trava: as três buscas (o telefone, o telefone ao lado do LID e o
 * próprio LID), a mesma leitura do webhook, nada duplicado, o cliente já
 * respondido (o assistente não responde ao passado) e o arquivo antigo como
 * marca.
 */

const LEAD = { id: "lead-1", telefone: "5541999990000" };
const LID = "123456789012345@lid";
const EVOLUTION = { url: "https://evolution.teste", chave: "chave", instancia: "loja" };
const T = 1_792_000_000; // 2026-10-15, mais ou menos

const DO_CLIENTE = {
  key: { id: "IN1", fromMe: false, remoteJid: LID, remoteJidAlt: "5541999990000@s.whatsapp.net", addressingMode: "lid" },
  message: { conversation: "Oi, ainda tem o Onix?" },
  messageType: "conversation",
  messageTimestamp: T,
  pushName: "Rafael",
};
const DA_LOJA = { key: { id: "OUT1", fromMe: true, remoteJid: "554199990000@s.whatsapp.net" }, message: { conversation: "Tem sim!" }, messageTimestamp: T + 100, source: "web" };
// A resposta ao LID que veio sem o telefone ao lado: o telefone do lead vai junto.
const FOTO_DA_LOJA = { key: { id: "OUT2", fromMe: true, remoteJid: LID }, message: { imageMessage: { mimetype: "image/jpeg", caption: "Olha ele" } }, messageTimestamp: T + 200 };
const REACAO = { key: { id: "R1", fromMe: false, remoteJid: LID, remoteJidAlt: "5541999990000@s.whatsapp.net" }, message: { reactionMessage: { text: "👍" } }, messageTimestamp: T + 300 };

describe("as linhas do histórico", () => {
  it("os JIDs do telefone, com e sem o nono dígito; os LIDs que aparecerem", () => {
    expect(jidsDoTelefone("5541999990000")).toEqual(["5541999990000@s.whatsapp.net", "554199990000@s.whatsapp.net"]);
    expect(jidsDoTelefone("")).toEqual([]);
    expect(lidsDosRegistros([DO_CLIENTE, DA_LOJA, FOTO_DA_LOJA])).toEqual([LID]);
  });

  it("da mais velha à mais nova, sem repetir, com o cliente já respondido e a foto como marca", () => {
    const linhas = mensagensDoHistorico([FOTO_DA_LOJA, DO_CLIENTE, DA_LOJA, DO_CLIENTE, REACAO], LEAD);
    expect(linhas.map((l) => [l.wa_id, l.direcao, l.autor, l.autor_nome, l.conteudo, l.texto])).toEqual([
      ["IN1", "entrada", "cliente", "Rafael", "texto", "Oi, ainda tem o Onix?"],
      ["OUT1", "saida", "vendedor", "Loja", "texto", "Tem sim!"],
      ["OUT2", "saida", "vendedor", "Loja", "imagem", "Olha ele"],
    ]);
    const [cliente, , foto] = linhas;
    expect(cliente).toMatchObject({ situacao: "recebida", gatilho: null, telefone: "5541999990000" });
    expect(cliente.respondida_em).toBe(cliente.criado_em);
    expect(foto).toMatchObject({ situacao: "enviada", respondida_em: null, midia_tipo: "image/jpeg", midia_erro: ARQUIVO_DO_HISTORICO });
    expect(linhas[1].midia_erro).toBeNull();
  });

  it("só as mais recentes", () => {
    const muitas = Array.from({ length: 70 }, (_, i) => ({ ...DA_LOJA, key: { ...DA_LOJA.key, id: `M${i}` }, messageTimestamp: T + i }));
    const linhas = mensagensDoHistorico(muitas, LEAD, 50);
    expect(linhas).toHaveLength(50);
    expect(linhas[0].wa_id).toBe("M20");
    expect(linhas.at(-1)!.wa_id).toBe("M69");
  });
});

/** A Evolution de mentira: responde pelo filtro da busca. */
function evolutionDeTeste(porFiltro: (chave: Record<string, string>) => unknown[] | { erro: number }) {
  const buscas: Record<string, string>[] = [];
  const transporte = async (url: string, init?: RequestInit) => {
    if (!url.endsWith("/chat/findMessages/loja")) throw new Error(`inesperado: ${url}`);
    const corpo = JSON.parse(String(init?.body));
    buscas.push(corpo.where.key);
    const r = porFiltro(corpo.where.key);
    if (!Array.isArray(r)) return new Response("{}", { status: r.erro });
    return new Response(JSON.stringify({ messages: { total: r.length, records: r } }), { status: 200 });
  };
  return { transporte: transporte as unknown as typeof fetch, buscas };
}

const DO_TELEFONE = (chave: Record<string, string>) =>
  chave.remoteJid === "554199990000@s.whatsapp.net" ? [DA_LOJA] : chave.remoteJidAlt === "5541999990000@s.whatsapp.net" ? [DO_CLIENTE, REACAO] : chave.remoteJid === LID ? [DO_CLIENTE, FOTO_DA_LOJA] : [];

describe("trazer o histórico de um lead", () => {
  it("busca o telefone, o telefone ao lado do LID e o LID; grava só o que falta; o rastro diz", async () => {
    const banco = bancoDeTeste({
      leads: [{ id: "lead-1", telefone: LEAD.telefone }],
      // A resposta da loja que já entrou pelo webhook fica como está.
      atendimento_mensagens: [{ id: "m0", lead_id: "lead-1", wa_id: "OUT1", direcao: "saida", autor: "vendedor", texto: "Tem sim!", criado_em: new Date(T * 1000 + 100_000).toISOString() }],
      leads_eventos: [],
    });
    const evo = evolutionDeTeste(DO_TELEFONE);

    const r = await trazerHistoricoDoWhatsApp(banco.cliente, LEAD, { evolution: EVOLUTION, transporte: evo.transporte }, { autor: "Carla Souza" });

    expect(r).toEqual({ ok: true, lead: "lead-1", trazidas: 2, ja_estavam: 1 });
    expect(evo.buscas).toEqual([
      { remoteJid: "5541999990000@s.whatsapp.net" },
      { remoteJidAlt: "5541999990000@s.whatsapp.net" },
      { remoteJid: "554199990000@s.whatsapp.net" },
      { remoteJidAlt: "554199990000@s.whatsapp.net" },
      { remoteJid: LID },
    ]);
    expect(banco.tabelas.atendimento_mensagens.map((m) => m.wa_id).sort()).toEqual(["IN1", "OUT1", "OUT2"]);
    expect(banco.tabelas.atendimento_mensagens.find((m) => m.wa_id === "IN1")!.respondida_em).not.toBeNull();
    const nota = banco.tabelas.leads_eventos.at(-1)!;
    expect(nota).toMatchObject({ lead_id: "lead-1", tipo: "nota", autor: "Carla Souza", automatico: false });
    expect(nota.detalhe).toMatchObject({ acao: "historico_do_whatsapp", trazidas: 2 });
    expect(nota.detalhe.texto).toContain("Histórico do WhatsApp trazido para a conversa do painel: 2 mensagem(ns)");

    // De novo: nada duplica, e o rastro não ganha outra nota.
    const outra = await trazerHistoricoDoWhatsApp(banco.cliente, LEAD, { evolution: EVOLUTION, transporte: evo.transporte });
    expect(outra).toEqual({ ok: true, lead: "lead-1", trazidas: 0, ja_estavam: 3 });
    expect(banco.tabelas.atendimento_mensagens).toHaveLength(3);
    expect(banco.tabelas.leads_eventos).toHaveLength(1);
  });

  it("sem a Evolution, sem telefone ou com a Evolution fora: o motivo, e nada gravado", async () => {
    const banco = bancoDeTeste({ atendimento_mensagens: [], leads_eventos: [] });
    expect(await trazerHistoricoDoWhatsApp(banco.cliente, LEAD, { evolution: null })).toMatchObject({ ok: false });
    expect(await trazerHistoricoDoWhatsApp(banco.cliente, { id: "lead-1", telefone: null }, { evolution: EVOLUTION })).toEqual({
      ok: false,
      lead: "lead-1",
      motivo: "o lead não tem telefone de WhatsApp",
    });
    const fora = evolutionDeTeste(() => ({ erro: 500 }));
    expect(await trazerHistoricoDoWhatsApp(banco.cliente, LEAD, { evolution: EVOLUTION, transporte: fora.transporte })).toEqual({
      ok: false,
      lead: "lead-1",
      motivo: "a Evolution não entregou o histórico (HTTP 500)",
    });
    expect(banco.tabelas.atendimento_mensagens).toHaveLength(0);
  });

  it("conversa que a Evolution não guardou: nada a trazer, sem rastro", async () => {
    const banco = bancoDeTeste({ atendimento_mensagens: [], leads_eventos: [] });
    const vazia = evolutionDeTeste(() => []);
    expect(await trazerHistoricoDoWhatsApp(banco.cliente, LEAD, { evolution: EVOLUTION, transporte: vazia.transporte })).toEqual({
      ok: true,
      lead: "lead-1",
      trazidas: 0,
      ja_estavam: 0,
    });
    expect(banco.tabelas.leads_eventos).toHaveLength(0);
  });
});
