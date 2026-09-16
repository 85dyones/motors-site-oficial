import { describe, it, expect } from "vitest";
import {
  interpretarEventoDoChatwoot,
  telefoneDoChatwoot,
  variantesDoTelefone,
} from "../src/lib/chatwootEventos";
import { lerCodigo } from "./fonte";

/**
 * A porta de entrada do Chatwoot.
 *
 * Relato do dono em 2026-09-15, três sintomas no mesmo dia: lead que entrou de
 * tarde não subiu para o painel, e responder no Chatwoot não avisava o painel
 * — o motor continuava transferindo o lead de quem já estava atendendo.
 *
 * Medido em produção antes da correção: 41 das 46 conversas do Chatwoot com
 * `lead_id` nulo, e 4 registros de contato contra 15 transferências
 * automáticas. O que estes testes seguram é a régua que fecha os dois buracos.
 */

const CONVERSA = {
  id: 412,
  status: "open",
  inbox_id: 11,
  meta: { sender: { id: 88, name: "Fulano", phone_number: "+5541999990000" } },
};

const entrada = (extra: Record<string, unknown> = {}) => ({
  event: "message_created",
  message_type: "incoming",
  conversation: CONVERSA,
  sender: { id: 88, name: "Fulano", phone_number: "+5541999990000", type: "contact" },
  ...extra,
});

const saida = (remetente: unknown, extra: Record<string, unknown> = {}) => ({
  event: "message_created",
  message_type: "outgoing",
  conversation: CONVERSA,
  sender: remetente,
  ...extra,
});

describe("o cliente escrevendo", () => {
  it("é reconhecido como mensagem do cliente, com telefone e nome", () => {
    const e = interpretarEventoDoChatwoot(entrada());
    expect(e.tipo).toBe("mensagem_do_cliente");
    expect(e.conversaId).toBe(412);
    expect(e.telefone).toBe("5541999990000");
    expect(e.nome).toBe("Fulano");
    expect(e.inboxId).toBe(11);
  });

  it("aceita `message_type` inteiro, que é como versões do Chatwoot mandam", () => {
    expect(interpretarEventoDoChatwoot(entrada({ message_type: 0 })).tipo).toBe(
      "mensagem_do_cliente",
    );
    expect(interpretarEventoDoChatwoot(saida({ type: "user", name: "Ana" }, { message_type: 1 })).tipo)
      .toBe("mensagem_do_consultor");
  });
});

describe("o consultor respondendo — o relógio da estagnação", () => {
  it("mensagem de agente humano conta como atendimento", () => {
    const e = interpretarEventoDoChatwoot(saida({ id: 3, type: "user", name: "Ana" }));
    expect(e.tipo).toBe("mensagem_do_consultor");
    expect(e.autor).toBe("Ana");
    // O telefone vem do CONTATO da conversa, nunca do agente — senão o lead
    // seria procurado pelo número de quem respondeu.
    expect(e.telefone).toBe("5541999990000");
  });

  it("reconhece o agente pelo e-mail quando o `type` não vem", () => {
    const e = interpretarEventoDoChatwoot(saida({ id: 3, name: "Ana", email: "ana@loja.com.br" }));
    expect(e.tipo).toBe("mensagem_do_consultor");
  });

  /**
   * A trava mais importante deste arquivo.
   *
   * Um "Olá! Recebemos seu contato" sai como `outgoing` igual a uma resposta
   * de gente. Se contasse como atendimento, o primeiro autoatendimento
   * congelaria o lead para sempre: nunca mais estagnado, nunca mais
   * transferido, nunca mais cobrado. O funil ficaria verde com a carteira
   * parada — e ninguém descobriria, porque não há erro nenhum nesse estado.
   */
  it("mensagem automática NÃO conta — robô não atende", () => {
    expect(interpretarEventoDoChatwoot(saida({ type: "agent_bot", name: "Bot" })).tipo).toBe(
      "ignorado",
    );
    expect(interpretarEventoDoChatwoot(saida(undefined)).tipo).toBe("ignorado");
    expect(interpretarEventoDoChatwoot(saida({})).tipo).toBe("ignorado");
  });

  it("diz por que ignorou — fila que descarta calada ninguém audita", () => {
    expect(interpretarEventoDoChatwoot(saida({ type: "agent_bot" })).motivo).toMatch(/autom/i);
  });
});

describe("o casamento de telefone", () => {
  it("tira o `+` e guarda como `leads.telefone` guarda", () => {
    expect(telefoneDoChatwoot("+55 (41) 99999-0000")).toBe("5541999990000");
  });

  it("recusa número fora da faixa em vez de casar com a pessoa errada", () => {
    expect(telefoneDoChatwoot("+5541999")).toBeNull();
    expect(telefoneDoChatwoot(null)).toBeNull();
  });

  /**
   * O nono dígito. O site grava o que a pessoa digitou; o WhatsApp devolve o
   * que a operadora registrou. Sem as duas formas, cada resposta do consultor
   * criaria um lead duplicado em vez de achar o que já existe.
   */
  it("gera as duas formas do celular brasileiro", () => {
    expect(variantesDoTelefone("5541999990000")).toEqual(
      expect.arrayContaining(["5541999990000", "554199990000"]),
    );
    expect(variantesDoTelefone("554199990000")).toEqual(
      expect.arrayContaining(["554199990000", "5541999990000"]),
    );
  });

  it("não inventa variante para número que não é brasileiro", () => {
    expect(variantesDoTelefone("12025550100")).toEqual(["12025550100"]);
  });
});

describe("os eventos de conversa", () => {
  it("lê status e encerramento", () => {
    const e = interpretarEventoDoChatwoot({
      event: "conversation_status_changed",
      ...CONVERSA,
      status: "resolved",
    });
    expect(e.tipo).toBe("conversa");
    expect(e.statusConversa).toBe("resolved");
    expect(e.encerrada).toBe(true);
  });

  it("ignora o que não tem efeito no funil, com motivo", () => {
    const e = interpretarEventoDoChatwoot({ event: "webwidget_triggered" });
    expect(e.tipo).toBe("ignorado");
    expect(e.motivo).toContain("webwidget_triggered");
  });

  it("não quebra com corpo inválido", () => {
    expect(interpretarEventoDoChatwoot(null).tipo).toBe("ignorado");
    expect(interpretarEventoDoChatwoot("texto").tipo).toBe("ignorado");
    expect(interpretarEventoDoChatwoot({}).tipo).toBe("ignorado");
  });
});

describe("as decisões que a rota não pode perder", () => {
  const rota = lerCodigo("src/app/api/chatwoot/eventos/route.ts");

  it("o lead nasce com `ultimo_movimento_em`", () => {
    // Sem isto ele nasce INVISÍVEL para o motor: `montar_fila_do_funil` mede o
    // tempo parado com `greatest(ultimo_movimento_em, ultimo_contato_em)`, e
    // com os dois nulos o greatest é nulo, os minutos são nulos, toda
    // comparação vira nula e o lead nunca entra na fila de atribuição — a que
    // arruma dono para ele.
    expect(rota).toContain("ultimo_movimento_em");
  });

  it("passa o autor do Chatwoot ao registrar contato", () => {
    // `autor_atual()` lê `auth.uid()` e é nulo na chave de serviço. Sem
    // `p_autor`, o rastro do canal principal ficaria sem nome.
    expect(rota).toContain("p_autor");
  });

  it("exige token e não responde 200 sem ele", () => {
    expect(rota).toContain("CHATWOOT_WEBHOOK_TOKEN");
    expect(rota).toContain("tokenConfere");
  });

  /**
   * O defeito que o primeiro tráfego real pegou (2026-09-16).
   *
   * `acharLead` pegava o lead mais recente, ponto — e grudou a conversa nova
   * num lead encerrado como `descartado` três dias antes. O atendimento fica
   * vinculado, a rota responde 200, nada dá erro, e a pessoa continua
   * INVISÍVEL no painel: o kanban só mostra `!desfecho` e o motor do funil só
   * enxerga `desfecho is null`. A rota parecia funcionar e o sintoma que ela
   * veio corrigir continuava de pé.
   */
  it("só casa com lead em aberto — quem volta de um negócio encerrado é lead novo", () => {
    expect(rota).toContain('.is("desfecho", null)');
  });

  it("solta o vínculo quando o lead da conversa foi encerrado depois", () => {
    // O caminho gêmeo: a conversa é vinculada com o lead aberto, o consultor
    // encerra dias depois, e o cliente volta a escrever NA MESMA conversa.
    // Sem a releitura, o atendimento segue preso ao lead fechado.
    expect(rota).toContain("leadEncerrado");
  });
});
