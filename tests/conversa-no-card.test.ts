import { describe, expect, it } from "vitest";
import {
  FOLGA_DO_ASSISTENTE_MIN,
  PRAZO_DA_RESPOSTA_MIN,
  aplicarNovidades,
  conversasPorLead,
  esperandoDesde,
  esperandoPrimeiro,
  filtrarEsperando,
  minutosEsperando,
  nivelDaEspera,
  soEncerra,
  textoDaEspera,
  ultimaMensagem,
  type MensagemDoCard,
} from "../src/lib/conversaNoCard";
import { filtrarComONey, podeEnviarAoNey, seloDoNey } from "../src/lib/atendimentoNaTela";

/**
 * A conversa no card do quadro (21/10/2026). Pedidos do dono: "uma forma
 * visual de ver no painel os leads que estão com mensagens atuais sem
 * resposta" — selo no card, filtro, vermelho aos 10 minutos — e "uma
 * visualização clara sobre leads que estão com o Ney, assim como as
 * mensagens, para não precisar abrir cada um".
 */

const AGORA = Date.parse("2026-10-21T15:00:00.000Z");
const antes = (min: number) => new Date(AGORA - min * 60_000).toISOString();
const msg = (direcao: "entrada" | "saida", min: number, extra: Partial<MensagemDoCard> = {}): MensagemDoCard => ({
  lead_id: "l1",
  direcao,
  autor: direcao === "entrada" ? "cliente" : "vendedor",
  autor_nome: direcao === "entrada" ? "Rafael" : "Carla Souza",
  situacao: direcao === "entrada" ? "recebida" : "enviada",
  conteudo: "texto",
  texto: direcao === "entrada" ? "tem o onix ainda?" : "Tem sim!",
  criado_em: antes(min),
  ...extra,
});

describe("desde quando o cliente espera", () => {
  it("a primeira mensagem sem resposta, e não a última; qualquer resposta da loja zera", () => {
    expect(esperandoDesde([msg("saida", 30), msg("entrada", 12), msg("entrada", 5)])).toBe(antes(12));
    expect(esperandoDesde([msg("entrada", 12), msg("saida", 6)])).toBeNull();
    // Em qualquer ordem: a leitura do banco vem da mais nova para a mais antiga.
    expect(esperandoDesde([msg("entrada", 5), msg("saida", 30), msg("entrada", 12)])).toBe(antes(12));
  });

  it("a saída que falhou não é resposta: o cliente não a recebeu", () => {
    expect(esperandoDesde([msg("entrada", 12), msg("saida", 6, { situacao: "falhou" })])).toBe(antes(12));
    // A pendente, sim: está saindo.
    expect(esperandoDesde([msg("entrada", 12), msg("saida", 6, { situacao: "pendente" })])).toBeNull();
  });

  it("o \"valeu 👍\" e a figurinha não abrem espera; pergunta sempre abre", () => {
    for (const texto of ["ok", "Ok, obrigado!", "valeuuu", "vlw 👍", "👍", "🙏🙏", "Obrigada!!", "beleza, até amanhã", "tá bom", "perfeito, combinado"]) {
      expect(soEncerra({ conteudo: "texto", texto }), texto).toBe(true);
    }
    expect(soEncerra({ conteudo: "figurinha", texto: null })).toBe(true);
    for (const texto of ["ok?", "ok, quanto fica?", "sim", "pode", "bom dia", "tudo bem", "ok, vou pensar", "obrigado, mas achei caro demais para o meu orçamento agora"]) {
      expect(soEncerra({ conteudo: "texto", texto }), texto).toBe(false);
    }
    // Áudio e foto sem legenda: não dá para saber o que dizem.
    expect(soEncerra({ conteudo: "audio", texto: null })).toBe(false);
    expect(soEncerra({ conteudo: "imagem", texto: null })).toBe(false);

    expect(esperandoDesde([msg("entrada", 40), msg("saida", 35), msg("entrada", 34, { texto: "valeu 👍" })])).toBeNull();
    // Perguntou e depois agradeceu, sem resposta no meio: espera desde a pergunta.
    expect(esperandoDesde([msg("entrada", 20, { texto: "aceita troca?" }), msg("entrada", 19, { texto: "obrigado" })])).toBe(antes(20));
  });
});

describe("a última mensagem no card", () => {
  it("de quem for, com o primeiro nome de quem escreveu; a saída que falhou não conta", () => {
    expect(ultimaMensagem([msg("entrada", 12), msg("saida", 6)])).toEqual({ autor: "vendedor", quem: "Carla", texto: "Tem sim!", criado_em: antes(6) });
    expect(ultimaMensagem([msg("entrada", 12), msg("saida", 6, { situacao: "falhou" })])).toMatchObject({ quem: "Cliente", texto: "tem o onix ainda?" });
    expect(ultimaMensagem([msg("saida", 3, { autor: "assistente", autor_nome: "Ney" })])).toMatchObject({ quem: "Ney" });
    expect(ultimaMensagem([])).toBeNull();
  });

  it("sem texto, o tipo; texto longo, cortado; CPF, nunca", () => {
    expect(ultimaMensagem([msg("entrada", 1, { conteudo: "audio", texto: null })])!.texto).toBe("[Áudio]");
    expect(ultimaMensagem([msg("entrada", 1, { conteudo: "imagem", texto: "" })])!.texto).toBe("[Foto]");
    const longa = ultimaMensagem([msg("entrada", 1, { texto: "a".repeat(300) })])!.texto;
    expect(longa.length).toBeLessThanOrEqual(140);
    expect(longa.endsWith("…")).toBe(true);
    expect(ultimaMensagem([msg("entrada", 1, { texto: "meu cpf é 123.456.789-09" })])!.texto).toBe("meu cpf é [CPF]");
  });

  it("uma leitura para vários leads: cada um com a sua conversa", () => {
    const mapa = conversasPorLead([msg("entrada", 12), msg("saida", 20, { lead_id: "l2" }), msg("entrada", 3, { lead_id: null })]);
    expect([...mapa.keys()].sort()).toEqual(["l1", "l2"]);
    expect(mapa.get("l1")).toMatchObject({ esperando_resposta_desde: antes(12) });
    expect(mapa.get("l2")).toMatchObject({ esperando_resposta_desde: null, ultima_mensagem: { quem: "Carla" } });
  });
});

describe("o selo, o filtro e a ordem da coluna", () => {
  const lead = (id: string, min: number | null, extra: Record<string, unknown> = {}) => ({ id, esperando_resposta_desde: min === null ? null : antes(min), ...extra });

  it("âmbar até 10 minutos, vermelho dali em diante", () => {
    expect(PRAZO_DA_RESPOSTA_MIN).toBe(10);
    expect(nivelDaEspera(minutosEsperando(lead("a", 9), AGORA))).toBe("esperando");
    expect(nivelDaEspera(minutosEsperando(lead("a", 10), AGORA))).toBe("atrasada");
    expect(nivelDaEspera(minutosEsperando(lead("a", null), AGORA))).toBeNull();
    expect(textoDaEspera(lead("a", 12), AGORA)).toBe("Cliente esperando · 12 min");
  });

  it("com o Ney na conversa, o selo espera o prazo dele; negócio fechado não espera ninguém", () => {
    expect(minutosEsperando(lead("a", FOLGA_DO_ASSISTENTE_MIN - 1, { assistente_fase: "qualificando" }), AGORA)).toBeNull();
    expect(minutosEsperando(lead("a", FOLGA_DO_ASSISTENTE_MIN, { assistente_fase: "qualificando" }), AGORA)).toBe(FOLGA_DO_ASSISTENTE_MIN);
    expect(minutosEsperando(lead("a", 1, { assistente_fase: "pausado" }), AGORA)).toBe(1);
    expect(minutosEsperando(lead("a", 30, { desfecho: "ganho" }), AGORA)).toBeNull();
  });

  it("o filtro pega quem espera; a coluna põe quem espera no topo, o mais antigo primeiro, e o resto na ordem", () => {
    const leads = [lead("novo", null), lead("dois", 2), lead("vinte", 20), lead("outro", null)];
    expect(filtrarEsperando(leads, AGORA).map((l) => l.id)).toEqual(["dois", "vinte"]);
    expect(esperandoPrimeiro(leads, AGORA).map((l) => l.id)).toEqual(["vinte", "dois", "novo", "outro"]);
  });
});

describe("as novidades do minuto", () => {
  const leads = [
    { id: "l1", situacao: "em_contato", assistente_fase: null, esperando_resposta_desde: antes(5), ultima_mensagem: null },
    { id: "l2", situacao: "proposta", assistente_fase: "reaquecendo", esperando_resposta_desde: null, ultima_mensagem: null },
  ];

  it("a conversa vale para todos: quem não veio não espera ninguém; o estado só de quem mudou", () => {
    const juntos = aplicarNovidades(leads, {
      agora: "x",
      conversas: { l2: { esperando_resposta_desde: antes(1), ultima_mensagem: { autor: "cliente", quem: "Cliente", texto: "oi", criado_em: antes(1) } } },
      leads: [{ id: "l2", situacao: "reaquecendo", assistente_fase: "qualificando", nome: "não entra" }, { id: "fora-da-tela", situacao: "visita" }],
    });
    expect(juntos).toEqual([
      { ...leads[0], esperando_resposta_desde: null, ultima_mensagem: null },
      { ...leads[1], situacao: "reaquecendo", assistente_fase: "qualificando", esperando_resposta_desde: antes(1), ultima_mensagem: expect.objectContaining({ texto: "oi" }) },
    ]);
  });

  it("o lead mexido agora há pouco não recebe o estado (o arrasto não desfaz); resposta fora do formato não muda nada", () => {
    const juntos = aplicarNovidades(leads, { conversas: {}, leads: [{ id: "l1", situacao: "novo" }] }, new Set(["l1"]));
    expect(juntos[0].situacao).toBe("em_contato");
    expect(aplicarNovidades(leads, { leads: "lixo", conversas: [] })).toEqual(leads);
    expect(aplicarNovidades(leads, null)).toEqual(leads);
  });
});

describe("o Ney no card", () => {
  const agora = new Date(AGORA);

  it("conversando, ou reaquecendo com o primeiro toque e os já enviados", () => {
    expect(seloDoNey({ assistente_fase: "qualificando" }, agora)).toEqual({ tom: "conversando", texto: "Ney conversando" });
    expect(seloDoNey({ assistente_fase: "reaquecendo", cadencia_passo: 0, cadencia_proximo_em: antes(1) }, agora)).toEqual({ tom: "reaquecendo", texto: "Ney reaquecendo · 1º toque na próxima rodada" });
    expect(seloDoNey({ assistente_fase: "reaquecendo", cadencia_passo: 0, cadencia_proximo_em: "2026-10-28T12:00:00.000Z" }, agora)!.texto).toBe("Ney reaquecendo · 1º toque 28/10 09:00");
    expect(seloDoNey({ assistente_fase: "reaquecendo", cadencia_passo: 1 }, agora)!.texto).toBe("Ney reaquecendo · 1 toque enviado");
    expect(seloDoNey({ assistente_fase: "reaquecendo", cadencia_passo: 2 }, agora)!.texto).toBe("Ney reaquecendo · 2 toques enviados");
    for (const fase of ["pausado", "entregue", null]) expect(seloDoNey({ assistente_fase: fase }, agora), String(fase)).toBeNull();
    expect(seloDoNey({ assistente_fase: "qualificando", desfecho: "ganho" }, agora)).toBeNull();
  });

  it("o filtro \"Com o Ney\": qualificando ou reaquecendo", () => {
    const leads = [{ id: "a", assistente_fase: "qualificando" }, { id: "b", assistente_fase: "reaquecendo" }, { id: "c", assistente_fase: "pausado" }, { id: "d", assistente_fase: null }];
    expect(filtrarComONey(leads).map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("\"Enviar ao Ney\" onde o detalhe oferece \"Ney retoma agora\", e só com conversa pela loja", () => {
    for (const fase of [null, "pausado", "entregue"]) expect(podeEnviarAoNey({ assistente_fase: fase, tem_conversa: true }), String(fase)).toBe(true);
    for (const fase of ["qualificando", "reaquecendo"]) expect(podeEnviarAoNey({ assistente_fase: fase, tem_conversa: true }), fase).toBe(false);
    expect(podeEnviarAoNey({ assistente_fase: null, tem_conversa: false })).toBe(false);
    expect(podeEnviarAoNey({ assistente_fase: "pausado", tem_conversa: true, optout_em: "2026-10-20T10:00:00Z" })).toBe(false);
    expect(podeEnviarAoNey({ assistente_fase: null, tem_conversa: true, desfecho: "perdido" })).toBe(false);
  });
});
