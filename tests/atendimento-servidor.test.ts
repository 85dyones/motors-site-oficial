import { beforeEach, describe, expect, it } from "vitest";
import {
  avisarEntregaPendente,
  enviarDoPainel,
  executarRodada,
  mudarAssistente,
  registrarEntrada,
  responderAoLead,
  type Dependencias,
} from "../src/lib/atendimento-servidor";
import { BALAO_SEM_PRECO } from "../src/lib/agenteDeAtendimento";
import { interpretarEventoDaEvolution, type MensagemDaEvolution } from "../src/lib/evolutionEventos";
import { bancoDeTeste, transporteDeTeste, type BancoDeTeste } from "./bancoDoAtendimentoDeTeste";

/**
 * A orquestração do atendimento por IA (2026-10-20), ponta a ponta contra um
 * banco em memória: a mensagem entra, o assistente responde, o lead esquenta,
 * o vendedor é avisado, a cadência toca — e as três regras do cabeçalho de
 * `atendimento-servidor.ts` valem: robô não atende, na dúvida devolve ao
 * humano, nada sai sem ficar gravado.
 */

// Terça, 20/10/2026, 10h em Curitiba.
const TERCA_10H = new Date("2026-10-20T13:00:00Z");
// Terça, 23h em Curitiba: fora da janela de aviso à equipe.
const TERCA_23H = new Date("2026-10-21T02:00:00Z");
// Quarta, 9h em Curitiba.
const QUARTA_9H = new Date("2026-10-21T12:00:00Z");

const CLIENTE = "5541999990000";
const CARLA = { full_name: "Carla Souza", telefone_e164: "+5541988887777", papeis: ["comercial"], role: "comercial", is_active: true };
const BRUNO = { full_name: "Bruno Lima", telefone_e164: "+5541955554444", papeis: ["comercial"], role: "comercial", is_active: true };
const DONO = { full_name: "Dono da Loja", telefone_e164: "+5541977776666", papeis: ["admin", "comercial"], role: "admin", is_active: true };
const GESTOR = { full_name: "Gestor Silva", telefone_e164: "+5541966665555", papeis: ["gestor"], role: "gestor", is_active: true };

const CONFIG = {
  id: "cfg",
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

const EVOLUTION = { url: "https://evolution.teste", chave: "chave", instancia: "loja" };
const MODELO = { chave: "ds", url: "https://deepseek.teste", modelo: "deepseek-flash" };
const BASE = async () => ({ nomeDaLoja: "Loja Teste", loja: "Endereço: Rua X", catalogo: "- #1 Onix", totalDoCatalogo: 1, geradoEm: "agora" });

let alertas: string[];
let relogio: Date;

function montar(inicial: Record<string, Record<string, unknown>[]> = {}, opcoes: { config?: Record<string, unknown> } = {}) {
  return bancoDeTeste(
    {
      atendimento_config: [{ ...CONFIG, ...opcoes.config }],
      profiles: [CARLA, BRUNO, DONO, GESTOR],
      leads: [],
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

function deps(t: ReturnType<typeof transporteDeTeste>, extra: Partial<Dependencias> = {}): Dependencias {
  return {
    agora: relogio,
    transporte: t.transporte,
    evolution: EVOLUTION,
    modelo: MODELO,
    baseDaLoja: BASE,
    linkDoLead: (id) => `https://loja.teste/admin/leads/${id}`,
    alertar: async (assunto) => {
      alertas.push(assunto);
    },
    ...extra,
  };
}

let wa = 0;
function evento(parcial: { texto?: string; deMim?: boolean; telefone?: string; conteudo?: string; aparelho?: string; nome?: string } = {}): MensagemDaEvolution {
  wa += 1;
  const conteudo = parcial.conteudo ?? "texto";
  const message = conteudo === "imagem" ? { imageMessage: { caption: parcial.texto } } : { conversation: parcial.texto ?? "Oi, tem Onix?" };
  const e = interpretarEventoDaEvolution(
    {
      event: "messages.upsert",
      data: {
        key: { remoteJid: `${parcial.telefone ?? CLIENTE}@s.whatsapp.net`, fromMe: parcial.deMim === true, id: `WA-${wa}` },
        pushName: parcial.nome ?? "Rafael",
        message,
        messageTimestamp: Math.floor(relogio.getTime() / 1000),
        source: parcial.aparelho ?? "android",
      },
    },
    relogio,
  );
  if (e.tipo !== "mensagem") throw new Error(`evento de teste ignorado: ${e.motivo}`);
  return e;
}

const respostaDoModelo = (parcial: Record<string, unknown> = {}) =>
  JSON.stringify({
    mensagens: ["Tenho sim! Onix LT 2020, 48 mil km. Te mando as fotos?"],
    ficha: { interesse: "Onix LT 2020", interesse_especifico: true },
    sinais: {},
    resumo: "Rafael quer o Onix LT 2020.",
    ...parcial,
  });

const leadAberto = (parcial: Record<string, unknown> = {}) => ({
  id: "lead-1",
  nome: "Rafael",
  telefone: CLIENTE,
  canal: "WhatsApp",
  situacao: "novo",
  responsavel: null,
  desfecho: null,
  assistente_fase: "qualificando",
  qualificacao: null,
  cadencia: null,
  cadencia_passo: 0,
  cadencia_proximo_em: null,
  optout_em: null,
  ultimo_contato_em: null,
  created_at: "2026-10-20T12:50:00.000Z",
  alertas: 0,
  ...parcial,
});

/** Grava a mensagem do cliente pelo mesmo caminho da rota de entrada. */
async function clienteEscreve(banco: BancoDeTeste, t: ReturnType<typeof transporteDeTeste>, texto: string) {
  return registrarEntrada(banco.cliente, evento({ texto }), deps(t));
}

beforeEach(() => {
  alertas = [];
  relogio = TERCA_10H;
});

// ─────────────────────────────────────────────────────────────────────────────

describe("a entrada", () => {
  it("quem não tem lead: cria o lead, o atendimento com o assistente, grava a mensagem e pede a resposta", async () => {
    const banco = montar();
    const t = transporteDeTeste();
    const r = await clienteEscreve(banco, t, "Oi, tem Onix?");

    expect(r).toMatchObject({ acao: "mensagem_registrada", responder: true, aguardar_ms: 12000 });
    expect(banco.tabelas.leads).toHaveLength(1);
    expect(banco.tabelas.leads[0]).toMatchObject({ nome: "Rafael", telefone: CLIENTE, canal: "WhatsApp", situacao: "novo", assistente_fase: "qualificando" });
    expect(banco.tabelas.atendimentos[0]).toMatchObject({ lead_id: banco.tabelas.leads[0].id, com_assistente: true });
    expect(banco.tabelas.atendimento_mensagens[0]).toMatchObject({ direcao: "entrada", autor: "cliente", texto: "Oi, tem Onix?", situacao: "recebida" });
    expect(t.enviados).toHaveLength(0);
  });

  it("a mesma mensagem duas vezes: a segunda é só repetida", async () => {
    const banco = montar();
    const t = transporteDeTeste();
    const e = evento({ texto: "oi" });
    await registrarEntrada(banco.cliente, e, deps(t));
    const r = await registrarEntrada(banco.cliente, e, deps(t));
    expect(r.acao).toBe("repetida");
    expect(banco.tabelas.atendimento_mensagens).toHaveLength(1);
  });

  it("assistente desligado: grava e cria o lead, mas não pede resposta nem pausa o SLA", async () => {
    const banco = montar({}, { config: { ativo: false } });
    const t = transporteDeTeste();
    const r = await clienteEscreve(banco, t, "oi");
    expect(r.responder).toBe(false);
    expect(banco.tabelas.leads[0].assistente_fase).toBeNull();
    expect(banco.tabelas.atendimentos[0].com_assistente).toBe(false);
  });

  it("lead que a equipe já atende não ganha assistente; a mensagem vai ao dono", async () => {
    const banco = montar({ leads: [leadAberto({ assistente_fase: null, situacao: "em_contato", ultimo_contato_em: "2026-10-19T15:00:00Z", responsavel: "Carla Souza" })] });
    const t = transporteDeTeste();
    const r = await clienteEscreve(banco, t, "ainda tá disponível?");
    expect(r.responder).toBe(false);
    expect(banco.tabelas.leads[0].assistente_fase).toBeNull();
    expect(t.enviados).toEqual([
      { numero: "5541988887777", texto: expect.stringContaining('"ainda tá disponível?"') },
    ]);
  });

  it("alguém da equipe responde ao resumo: confirma a entrega e não vira lead", async () => {
    const banco = montar({
      leads: [leadAberto({ assistente_fase: "entregue", responsavel: "Carla Souza", aviso_de_entrega_para: "Carla Souza", aviso_de_entrega_em: "2026-10-20T12:30:00Z", entrega_confirmada_em: null })],
    });
    const t = transporteDeTeste();
    const r = await registrarEntrada(banco.cliente, evento({ texto: "ok, já chamo", telefone: "5541988887777" }), deps(t));
    expect(r.acao).toBe("equipe_confirmou");
    expect(banco.tabelas.leads).toHaveLength(1);
    expect(banco.tabelas.leads[0].entrega_confirmada_em).toBe(TERCA_10H.toISOString());
  });

  it("o eco do que o próprio site mandou é reconhecido pelo texto, e ganha o id do WhatsApp", async () => {
    const banco = montar({
      leads: [leadAberto()],
      atendimento_mensagens: [
        { id: "m-saida", lead_id: "lead-1", telefone: CLIENTE, direcao: "saida", autor: "assistente", texto: "Tenho sim!", situacao: "pendente", wa_id: null, criado_em: "2026-10-20T12:59:50Z" },
      ],
    });
    const t = transporteDeTeste();
    const r = await registrarEntrada(banco.cliente, evento({ texto: "Tenho sim!", deMim: true, aparelho: "web" }), deps(t));
    expect(r.acao).toBe("eco");
    expect(banco.tabelas.atendimento_mensagens[0]).toMatchObject({ situacao: "enviada", wa_id: expect.stringMatching(/^WA-/) });
    expect(banco.tabelas.leads[0].assistente_fase).toBe("qualificando");
  });

  it("gente no celular da loja (texto, no aparelho) tira o assistente e conta como atendimento", async () => {
    const banco = montar({ leads: [leadAberto()], atendimentos: [{ id: "at-1", lead_id: "lead-1", com_assistente: true, chatwoot_conversation_id: null, created_at: "2026-10-20T12:50:00Z" }] });
    const t = transporteDeTeste();
    const r = await registrarEntrada(banco.cliente, evento({ texto: "Oi Rafael, aqui é a Carla", deMim: true, aparelho: "android" }), deps(t));
    expect(r.acao).toBe("loja_assumiu");
    expect(banco.tabelas.leads[0].assistente_fase).toBe("pausado");
    expect(banco.tabelas.atendimentos[0]).toMatchObject({ com_assistente: false, humano_assumiu_em: TERCA_10H.toISOString() });
    expect(banco.rpcs).toEqual([{ nome: "registrar_contato_do_lead", args: { p_lead: "lead-1", p_canal: "evolution", p_autor: "Celular da loja" } }]);
  });

  it("texto que sai pela API (web) pausa o assistente, mas não conta como atendimento: robô não atende", async () => {
    const banco = montar({ leads: [leadAberto()] });
    const t = transporteDeTeste();
    const r = await registrarEntrada(banco.cliente, evento({ texto: "Lembrete da revisão", deMim: true, aparelho: "web" }), deps(t));
    expect(r.acao).toBe("loja_assumiu");
    expect(banco.rpcs).toEqual([]);
  });

  it("foto pelo celular da loja não tira o assistente", async () => {
    const banco = montar({ leads: [leadAberto()] });
    const t = transporteDeTeste();
    const r = await registrarEntrada(banco.cliente, evento({ texto: "foto do carro", deMim: true, conteudo: "imagem" }), deps(t));
    expect(r.acao).toBe("mensagem_da_loja");
    expect(banco.tabelas.leads[0].assistente_fase).toBe("qualificando");
  });

  it("o cliente respondeu: a cadência para", async () => {
    const banco = montar({ leads: [leadAberto({ cadencia: "follow_up", cadencia_passo: 1, cadencia_proximo_em: "2026-10-22T10:00:00Z" })] });
    const t = transporteDeTeste();
    await clienteEscreve(banco, t, "voltei, ainda quero");
    expect(banco.tabelas.leads[0]).toMatchObject({ cadencia: null, cadencia_passo: 0, cadencia_proximo_em: null });
  });
});

describe("a resposta", () => {
  it("responde, preenche a ficha, calcula o aquecimento, agenda o follow-up e grava o retrato", async () => {
    const banco = montar();
    const t = transporteDeTeste([respostaDoModelo()]);
    const entrada = await clienteEscreve(banco, t, "Oi, tem Onix?");
    const r = await responderAoLead(banco.cliente, { leadId: entrada.lead!, mensagemId: entrada.mensagem }, deps(t));

    expect(r).toMatchObject({ acao: "respondido", enviadas: 1, falhas: 0, aquecimento: 20, temperatura: "frio", entregue: false });
    expect(t.enviados).toEqual([{ numero: CLIENTE, texto: "Tenho sim! Onix LT 2020, 48 mil km. Te mando as fotos?" }]);
    const lead = banco.tabelas.leads[0];
    expect(lead).toMatchObject({ aquecimento: 20, temperatura: "frio", resumo_ia: "Rafael quer o Onix LT 2020.", interesse: "Onix LT 2020", cadencia: "follow_up", cadencia_passo: 0 });
    expect(lead.cadencia_proximo_em).toBe(new Date(TERCA_10H.getTime() + 20 * 3600 * 1000).toISOString());
    expect(lead.qualificacao.ficha.interesse).toBe("Onix LT 2020");
    const saida = banco.tabelas.atendimento_mensagens.find((m) => m.direcao === "saida");
    expect(saida).toMatchObject({ autor: "assistente", autor_nome: "Ney", gatilho: "resposta", situacao: "enviada", wa_id: "WA-SAIDA-1" });
    expect(banco.tabelas.atendimento_qualificacoes[0]).toMatchObject({ aquecimento: 20, origem: "conversa", tokens_entrada: 1000, tokens_cache: 800, tokens_saida: 100 });
    // A chamada: sem raciocínio, em JSON, com o estado por último.
    const pedido = t.pedidosAoModelo[0];
    expect(pedido.thinking).toEqual({ type: "disabled" });
    expect(pedido.response_format).toEqual({ type: "json_object" });
    expect(pedido.messages.at(-1).content).toContain("Estado atual");
    // Robô não atende: nenhum contato registrado.
    expect(banco.rpcs).toEqual([]);
  });

  it("a rajada: só a execução da última mensagem responde, uma vez", async () => {
    const banco = montar();
    const t = transporteDeTeste([respostaDoModelo()]);
    const primeira = await clienteEscreve(banco, t, "oi");
    relogio = new Date(TERCA_10H.getTime() + 3000);
    const segunda = await clienteEscreve(banco, t, "tem onix?");

    expect(await responderAoLead(banco.cliente, { leadId: primeira.lead!, mensagemId: primeira.mensagem }, deps(t))).toMatchObject({ acao: "aguardando_mais_novas" });
    expect(await responderAoLead(banco.cliente, { leadId: segunda.lead!, mensagemId: segunda.mensagem }, deps(t))).toMatchObject({ acao: "respondido" });
    expect(await responderAoLead(banco.cliente, { leadId: segunda.lead!, mensagemId: segunda.mensagem }, deps(t))).toMatchObject({ acao: "ja_respondida" });
    expect(t.pedidosAoModelo).toHaveLength(1);
  });

  it("esquentou com dono: passa ao vendedor com o resumo e sai do SLA do assistente", async () => {
    const banco = montar({ leads: [leadAberto({ responsavel: "Carla Souza" })] });
    const t = transporteDeTeste([
      respostaDoModelo({
        mensagens: ["Show! Sábado de manhã fica ótimo."],
        ficha: { interesse: "Onix LT 2020", interesse_especifico: true, troca: "Uno 2014", prazo: "imediato" },
        sinais: { quer_visitar: true },
      }),
    ]);
    const entrada = await clienteEscreve(banco, t, "quero ver sábado, tenho um Uno pra troca");
    const r = await responderAoLead(banco.cliente, { leadId: "lead-1", mensagemId: entrada.mensagem }, deps(t));

    expect(r).toMatchObject({ acao: "respondido", aquecimento: 80, temperatura: "quente", entregue: true });
    expect(t.enviados.map((e) => e.numero)).toEqual([CLIENTE, CLIENTE, "5541988887777"]);
    expect(t.enviados[1].texto).toBe("Perfeito, Rafael! Vou te passar para Carla, da nossa equipe de consultores, que já vai te chamar pelo WhatsApp (41) 98888-7777.");
    expect(t.enviados[2].texto).toMatch(/^🔥 LEAD QUENTE — Rafael/);
    expect(t.enviados[2].texto).toContain("Abrir no painel: https://loja.teste/admin/leads/lead-1");
    const lead = banco.tabelas.leads[0];
    expect(lead).toMatchObject({ assistente_fase: "entregue", entregue_motivo: "quente", aviso_de_entrega_para: "Carla Souza", cadencia: null, carro_na_troca: "Uno 2014" });
    expect(banco.tabelas.atendimentos.at(-1)).toMatchObject({ com_assistente: false, humano_assumiu_em: TERCA_10H.toISOString() });
    expect(banco.tabelas.leads_eventos.some((e) => e.tipo === "nota" && e.detalhe.acao === "entrega" && e.detalhe.para === "Carla Souza")).toBe(true);
  });

  it("sem dono e o administrador distribui: o resumo vai a ele e ao gestor, e o 'lead novo' do funil não sai em dobro", async () => {
    const banco = montar({ leads: [leadAberto()] });
    const t = transporteDeTeste([respostaDoModelo({ sinais: { pediu_humano: true } })]);
    const entrada = await clienteEscreve(banco, t, "quero falar com alguém");
    await responderAoLead(banco.cliente, { leadId: "lead-1", mensagemId: entrada.mensagem }, deps(t));

    const paraEquipe = t.enviados.filter((e) => e.numero !== CLIENTE);
    expect(paraEquipe.map((e) => e.numero)).toEqual(["5541977776666", "5541966665555"]);
    expect(paraEquipe[0].texto).toMatch(/^🙋 PEDIU UM CONSULTOR/);
    expect(paraEquipe[0].texto).toContain("Definir o responsável:");
    expect(banco.tabelas.leads[0]).toMatchObject({ aviso_de_entrega_para: "administrador", alertado_em: TERCA_10H.toISOString(), alertas: 1, responsavel: null });
  });

  it("sem dono no rodízio: o vendedor com menos leads abertos recebe", async () => {
    const banco = montar(
      {
        leads: [
          leadAberto(),
          leadAberto({ id: "outro-1", telefone: "5541911111111", responsavel: "Carla Souza", assistente_fase: null }),
          leadAberto({ id: "outro-2", telefone: "5541922222222", responsavel: "Carla Souza", assistente_fase: null }),
        ],
      },
      { config: { distribuicao: "rodizio" } },
    );
    const t = transporteDeTeste([respostaDoModelo({ sinais: { pediu_humano: true } })]);
    const entrada = await clienteEscreve(banco, t, "quero falar com alguém");
    await responderAoLead(banco.cliente, { leadId: "lead-1", mensagemId: entrada.mensagem }, deps(t));

    expect(banco.tabelas.leads[0]).toMatchObject({ responsavel: "Bruno Lima", aviso_de_entrega_para: "Bruno Lima" });
    expect(t.enviados.at(-1)!.numero).toBe("5541955554444");
  });

  it("fora do horário: entrega, mas o resumo espera e o SLA segue pausado — a rodada da manhã avisa", async () => {
    relogio = TERCA_23H;
    const banco = montar({ leads: [leadAberto({ responsavel: "Carla Souza" })] });
    const t = transporteDeTeste([respostaDoModelo({ sinais: { pediu_humano: true } })]);
    const entrada = await clienteEscreve(banco, t, "quero falar com um vendedor");
    await responderAoLead(banco.cliente, { leadId: "lead-1", mensagemId: entrada.mensagem }, deps(t));

    expect(t.enviados.every((e) => e.numero === CLIENTE)).toBe(true);
    expect(t.enviados.at(-1)!.texto).toContain("assim que a loja abrir");
    expect(banco.tabelas.leads[0]).toMatchObject({ assistente_fase: "entregue" });
    expect(banco.tabelas.leads[0].aviso_de_entrega_para ?? null).toBeNull();
    expect(banco.tabelas.atendimentos.at(-1)!.com_assistente).toBe(true);

    relogio = QUARTA_9H;
    const rodada = await executarRodada(banco.cliente, { reservar: true }, deps(t));
    expect(rodada.entregas).toEqual([{ lead_id: "lead-1", avisado: true }]);
    expect(t.enviados.at(-1)!.numero).toBe("5541988887777");
    expect(banco.tabelas.leads[0].aviso_de_entrega_para).toBe("Carla Souza");
    expect(banco.tabelas.atendimentos.at(-1)).toMatchObject({ com_assistente: false, humano_assumiu_em: QUARTA_9H.toISOString() });
  });

  it("o modelo caiu: o lead volta para a equipe, com alerta, e nada sai para o cliente", async () => {
    const banco = montar();
    const t = transporteDeTeste([{ erro: "Service Unavailable" }]);
    const entrada = await clienteEscreve(banco, t, "oi");
    const r = await responderAoLead(banco.cliente, { leadId: entrada.lead!, mensagemId: entrada.mensagem }, deps(t));

    expect(r.acao).toBe("modelo_falhou");
    expect(t.enviados).toHaveLength(0);
    expect(banco.tabelas.leads[0].assistente_fase).toBe("pausado");
    expect(banco.tabelas.atendimentos.at(-1)!.com_assistente).toBe(false);
    expect(alertas).toEqual(["atendimento-modelo"]);
  });

  it("resposta fora do formato também devolve ao humano: um JSON cru nunca chega ao WhatsApp", async () => {
    const banco = montar();
    const t = transporteDeTeste(["Olá! Tudo bem?"]);
    const entrada = await clienteEscreve(banco, t, "oi");
    expect((await responderAoLead(banco.cliente, { leadId: entrada.lead!, mensagemId: entrada.mensagem }, deps(t))).acao).toBe("modelo_falhou");
    expect(t.enviados).toHaveLength(0);
  });

  it("sem a chave da DeepSeek: devolve ao humano e avisa", async () => {
    const banco = montar();
    const t = transporteDeTeste();
    const entrada = await clienteEscreve(banco, t, "oi");
    const r = await responderAoLead(banco.cliente, { leadId: entrada.lead!, mensagemId: entrada.mensagem }, deps(t, { modelo: null }));
    expect(r).toMatchObject({ acao: "sem_credencial", detalhe: expect.stringContaining("DEEPSEEK_API_KEY") });
    expect(alertas).toEqual(["atendimento-sem-credencial"]);
  });

  it("pediu para parar: confirma, marca o opt-out, não entrega e não agenda cadência", async () => {
    const banco = montar();
    const t = transporteDeTeste([respostaDoModelo({ mensagens: ["Tudo certo, não te mando mais mensagens."], sinais: { optout: true, pediu_humano: true } })]);
    const entrada = await clienteEscreve(banco, t, "para de me mandar mensagem");
    await responderAoLead(banco.cliente, { leadId: entrada.lead!, mensagemId: entrada.mensagem }, deps(t));
    expect(t.enviados).toEqual([{ numero: CLIENTE, texto: "Tudo certo, não te mando mais mensagens." }]);
    expect(banco.tabelas.leads[0]).toMatchObject({ optout_em: TERCA_10H.toISOString(), assistente_fase: "pausado", cadencia: null });
  });

  it("preço que o cliente não disse não sai, com informar_preco desligado", async () => {
    const banco = montar();
    const t = transporteDeTeste([respostaDoModelo({ mensagens: ["Tenho!", "Sai por R$ 79.900."] })]);
    const entrada = await clienteEscreve(banco, t, "quanto custa o onix?");
    await responderAoLead(banco.cliente, { leadId: entrada.lead!, mensagemId: entrada.mensagem }, deps(t));
    expect(t.enviados.map((e) => e.texto)).toEqual(["Tenho!", BALAO_SEM_PRECO]);
  });
});

describe("a rodada das cadências", () => {
  const vencido = () =>
    leadAberto({
      qualificacao: { ficha: { interesse: "Onix LT 2020", interesse_especifico: true } },
      cadencia: "follow_up",
      cadencia_passo: 0,
      cadencia_proximo_em: "2026-10-20T12:00:00Z",
    });

  it("o toque vencido sai, anda um passo e agenda o próximo; sem o modelo, o texto pronto", async () => {
    const banco = montar({ leads: [vencido()] });
    const t = transporteDeTeste();
    const r = await executarRodada(banco.cliente, { reservar: true }, deps(t, { modelo: null }));

    expect(r.toques).toEqual([{ lead_id: "lead-1", cadencia: "follow_up", passo: 0, mensagem: expect.any(String), enviado: true }]);
    expect(t.enviados).toEqual([{ numero: CLIENTE, texto: "Oi, Rafael! Ainda tem interesse no Onix LT 2020? Se quiser, te mando mais fotos ou tiro alguma dúvida. 🙂" }]);
    expect(banco.tabelas.leads[0]).toMatchObject({ cadencia_passo: 1, cadencia_proximo_em: new Date(TERCA_10H.getTime() + 48 * 3600 * 1000).toISOString() });
    expect(banco.tabelas.atendimento_mensagens[0]).toMatchObject({ gatilho: "cadencia", autor: "assistente" });
  });

  it("com o modelo, ele escreve o toque — e a trava de preço vale aqui também", async () => {
    const banco = montar({ leads: [vencido()] });
    const t = transporteDeTeste(['{"mensagem":"Oi Rafael! O Onix ainda está aqui, por R$ 79.900."}']);
    await executarRodada(banco.cliente, { reservar: true }, deps(t));
    expect(t.enviados[0].texto).not.toContain("R$");
    expect(t.enviados[0].texto).toContain("Ainda tem interesse no Onix LT 2020?");
  });

  it("a prévia não envia nem grava", async () => {
    const banco = montar({ leads: [vencido()] });
    const t = transporteDeTeste();
    const r = await executarRodada(banco.cliente, { reservar: false }, deps(t));
    expect(r.toques).toHaveLength(1);
    expect(t.enviados).toHaveLength(0);
    expect(banco.tabelas.leads[0].cadencia_passo).toBe(0);
  });

  it("domingo espera; lead entregue sai da fila", async () => {
    relogio = new Date("2026-10-25T14:00:00Z");
    const banco = montar({ leads: [vencido(), { ...vencido(), id: "lead-2", telefone: "5541933333333", assistente_fase: "entregue" }] });
    const t = transporteDeTeste();
    const r = await executarRodada(banco.cliente, { reservar: true }, deps(t));
    expect(r.suprimidos.map((s) => s.motivo).sort()).toEqual(["com_o_vendedor", "fora_do_expediente"]);
    expect(banco.tabelas.leads.find((l) => l.id === "lead-1")!.cadencia_proximo_em).not.toBeNull();
    expect(banco.tabelas.leads.find((l) => l.id === "lead-2")!.cadencia_proximo_em).toBeNull();
  });

  it("assistente desligado: a rodada não faz nada", async () => {
    const banco = montar({ leads: [vencido()] }, { config: { ativo: false } });
    const t = transporteDeTeste();
    expect(await executarRodada(banco.cliente, { reservar: true }, deps(t))).toMatchObject({ ativo: false, toques: [] });
    expect(t.enviados).toHaveLength(0);
  });
});

describe("o painel", () => {
  it("responder pelo painel: sai pela loja, conta como atendimento e tira o assistente", async () => {
    const banco = montar({ leads: [leadAberto()] });
    const t = transporteDeTeste();
    const r = await enviarDoPainel(banco.cliente, { leadId: "lead-1", texto: "Oi Rafael, aqui é a Carla!", autor: "Carla Souza" }, deps(t));
    expect(r).toEqual({ ok: true });
    expect(t.enviados).toEqual([{ numero: CLIENTE, texto: "Oi Rafael, aqui é a Carla!" }]);
    expect(banco.tabelas.atendimento_mensagens[0]).toMatchObject({ autor: "vendedor", autor_nome: "Carla Souza", gatilho: "painel", situacao: "enviada" });
    expect(banco.rpcs).toEqual([{ nome: "registrar_contato_do_lead", args: { p_lead: "lead-1", p_canal: "evolution", p_autor: "Carla Souza" } }]);
    expect(banco.tabelas.leads[0].assistente_fase).toBe("pausado");
  });

  it("sem a Evolution configurada, 503 com o nome do que falta", async () => {
    const banco = montar({ leads: [leadAberto()] });
    const r = await enviarDoPainel(banco.cliente, { leadId: "lead-1", texto: "oi", autor: "Carla" }, deps(transporteDeTeste(), { evolution: null }));
    expect(r).toMatchObject({ ok: false, status: 503 });
  });

  it("devolver para reaquecer: o assistente fica com o lead e o engajamento começa", async () => {
    const banco = montar({ leads: [leadAberto({ assistente_fase: "entregue", responsavel: "Carla Souza" })] });
    const r = await mudarAssistente(banco.cliente, { leadId: "lead-1", acao: "devolver", autor: "Carla Souza" }, deps(transporteDeTeste()));
    expect(r).toEqual({ ok: true });
    expect(banco.tabelas.leads[0]).toMatchObject({ assistente_fase: "reaquecendo", cadencia: "engajamento", cadencia_passo: 0 });
    expect(banco.tabelas.leads[0].cadencia_proximo_em).toBe(new Date(TERCA_10H.getTime() + 7 * 24 * 3600 * 1000).toISOString());
    expect(banco.tabelas.atendimentos.at(-1)!.com_assistente).toBe(true);
  });

  it("opt-out: o assistente não volta a escrever", async () => {
    const banco = montar({ leads: [leadAberto({ assistente_fase: "pausado", optout_em: "2026-10-19T10:00:00Z" })] });
    const r = await mudarAssistente(banco.cliente, { leadId: "lead-1", acao: "retomar", autor: "Carla" }, deps(transporteDeTeste()));
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it("o administrador escolhe o dono: o resumo pendente segue para ele", async () => {
    const banco = montar({
      leads: [
        leadAberto({
          assistente_fase: "entregue",
          entregue_motivo: "quente",
          entregue_em: "2026-10-20T12:00:00Z",
          aviso_de_entrega_para: "administrador",
          responsavel: "Carla Souza",
          aquecimento: 80,
          temperatura: "quente",
          qualificacao: { ficha: { interesse: "Onix" }, motivos: [] },
        }),
      ],
    });
    const t = transporteDeTeste();
    expect(await avisarEntregaPendente(banco.cliente, "lead-1", deps(t))).toEqual({ avisado: true });
    expect(t.enviados).toEqual([{ numero: "5541988887777", texto: expect.stringMatching(/^🔥 LEAD QUENTE — Rafael/) }]);
    expect(banco.tabelas.leads[0].aviso_de_entrega_para).toBe("Carla Souza");
    // Já avisado: a segunda chamada não manda de novo.
    expect(await avisarEntregaPendente(banco.cliente, "lead-1", deps(t))).toEqual({ avisado: false, motivo: "ja_avisado" });
  });
});
