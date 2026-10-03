import { describe, it, expect } from "vitest";
import {
  decidirResponsavel,
  lerNotaDeAtribuicao,
  normalizarNome,
  notaMaisRecente,
  notaSuperada,
  type PerfilDaAtribuicao,
} from "../src/lib/atribuicaoDoChatwoot";
import { interpretarEventoDoChatwoot } from "../src/lib/chatwootEventos";

/**
 * A atribuição feita no Chatwoot volta para o painel (2026-10-03).
 *
 * Quando um ADMIN dá a conversa a um vendedor dentro do Chatwoot, o lead ganha
 * esse vendedor como responsável. O webhook não diz quem atribuiu; o único
 * vestígio é a frase de atividade na conversa, e é ela que estes testes leem.
 *
 * O que se trava: os formatos reais (pt_BR e inglês), e a régua de quem pode
 * dar e quem pode receber. Quem não é admin, automação, destino que não é do
 * Comercial ativo e nome ambíguo não mudam nada.
 */

describe("a frase de atividade vira fato", () => {
  it("lê a atribuição simples", () => {
    expect(lerNotaDeAtribuicao("Atribuído a Rodrigo Naumowicz por Dyones Oliveira")).toEqual({
      tipo: "atribuida",
      para: "Rodrigo Naumowicz",
      por: "Dyones Oliveira",
    });
  });

  it("lê a atribuição por time e descarta o time", () => {
    expect(
      lerNotaDeAtribuicao("Atribuído a Rodrigo Naumowicz via Comercial por Dyones Oliveira"),
    ).toEqual({ tipo: "atribuida", para: "Rodrigo Naumowicz", por: "Dyones Oliveira" });
  });

  it("lê a atribuição a si mesmo, como aparece na tela da loja", () => {
    expect(lerNotaDeAtribuicao("Dyones Oliveira atribuiu a si mesmo essa conversa")).toEqual({
      tipo: "propria",
      por: "Dyones Oliveira",
    });
  });

  it("lê a remoção", () => {
    expect(lerNotaDeAtribuicao("Conversa desatribuída por Dyones Oliveira")).toEqual({
      tipo: "removida",
      por: "Dyones Oliveira",
    });
  });

  it("lê os três formatos em inglês", () => {
    expect(lerNotaDeAtribuicao("Assigned to Ana Lima by Dyones Oliveira")).toEqual({
      tipo: "atribuida",
      para: "Ana Lima",
      por: "Dyones Oliveira",
    });
    expect(lerNotaDeAtribuicao("Assigned to Ana Lima via Sales by Dyones Oliveira")).toEqual({
      tipo: "atribuida",
      para: "Ana Lima",
      por: "Dyones Oliveira",
    });
    expect(lerNotaDeAtribuicao("Dyones Oliveira self-assigned this conversation")).toEqual({
      tipo: "propria",
      por: "Dyones Oliveira",
    });
  });

  it("corta no ÚLTIMO separador: o nome do destino pode conter ' por ' e ' a '", () => {
    expect(lerNotaDeAtribuicao("Atribuído a Maria a Bela por Deus por João Admin")).toEqual({
      tipo: "atribuida",
      para: "Maria a Bela por Deus",
      por: "João Admin",
    });
    expect(lerNotaDeAtribuicao("Assigned to Abby by the Sea by John Admin")).toEqual({
      tipo: "atribuida",
      para: "Abby by the Sea",
      por: "John Admin",
    });
  });

  it("tolera espaço sobrando, caixa e a falta do acento", () => {
    expect(lerNotaDeAtribuicao("  Atribuído a  Ana   Lima por Dono  \n")).toEqual({
      tipo: "atribuida",
      para: "Ana Lima",
      por: "Dono",
    });
    expect(lerNotaDeAtribuicao("atribuido a Ana por Dono")?.tipo).toBe("atribuida");
    expect(lerNotaDeAtribuicao("Dono atribuiu a si mesmo essa conversa   ")).toEqual({
      tipo: "propria",
      por: "Dono",
    });
  });

  it("não inventa nota de outra atividade, nem de frase incompleta", () => {
    expect(lerNotaDeAtribuicao("Dyones Oliveira adicionou a etiqueta quer-comprar")).toBeNull();
    expect(lerNotaDeAtribuicao("Conversa foi marcada como resolvida por Dyones Oliveira")).toBeNull();
    expect(lerNotaDeAtribuicao("Atribuído a Ana")).toBeNull();
    expect(lerNotaDeAtribuicao("Atribuído a  por Dono")).toBeNull();
    expect(lerNotaDeAtribuicao("")).toBeNull();
    expect(lerNotaDeAtribuicao(null)).toBeNull();
    expect(lerNotaDeAtribuicao(42)).toBeNull();
  });
});

const PERFIS: PerfilDaAtribuicao[] = [
  { full_name: "Dyones Oliveira", email: "dyones@painel.com", papeis: ["admin", "comercial"], is_active: true },
  { full_name: "Marta Gestão", email: "marta@painel.com", papeis: ["admin"], is_active: true },
  { full_name: "Rodrigo Naumowicz", email: "rodrigo@painel.com", papeis: ["comercial"], is_active: true },
  { full_name: "João Araújo", email: "joao@painel.com", papeis: ["sdr", "comercial"], is_active: true },
  { full_name: "Mari Marketing", email: "mari@painel.com", papeis: ["marketing"], is_active: true },
  { full_name: "Saiu Daqui", email: "saiu@painel.com", papeis: ["comercial"], is_active: false },
  { full_name: "Ex Admin", email: "ex@painel.com", papeis: ["admin"], is_active: false },
];

const atribuida = (para: string, por: string) => ({ tipo: "atribuida" as const, para, por });

describe("quem pode dar e quem pode receber", () => {
  it("admin ativo dá a Comercial ativo: grava o full_name do perfil", () => {
    expect(
      decidirResponsavel({ nota: atribuida("Rodrigo Naumowicz", "Marta Gestão"), perfis: PERFIS }),
    ).toEqual({ responsavel: "Rodrigo Naumowicz", autor: "Marta Gestão" });
  });

  it("casa nome com caixa, acento e espaço diferentes, e grava o do perfil", () => {
    expect(
      decidirResponsavel({ nota: atribuida("  JOAO   araujo ", "marta gestao"), perfis: PERFIS }),
    ).toEqual({ responsavel: "João Araújo", autor: "Marta Gestão" });
    expect(normalizarNome("  JOÃO   Araújo ")).toBe("joao araujo");
  });

  it("autor que não é admin não muda nada", () => {
    expect(
      decidirResponsavel({ nota: atribuida("João Araújo", "Rodrigo Naumowicz"), perfis: PERFIS }),
    ).toEqual({ responsavel: null, motivo: "autor-nao-e-admin" });
  });

  it("automação, que não é perfil de ninguém, não muda nada", () => {
    expect(
      decidirResponsavel({ nota: atribuida("Rodrigo Naumowicz", "Automation System"), perfis: PERFIS }),
    ).toEqual({ responsavel: null, motivo: "autor-nao-e-admin" });
  });

  it("destino que não é do Comercial não recebe", () => {
    expect(
      decidirResponsavel({ nota: atribuida("Mari Marketing", "Marta Gestão"), perfis: PERFIS }),
    ).toEqual({ responsavel: null, motivo: "destino-nao-e-comercial" });
    // Atribuição a um TIME tem a mesma frase, e time não é perfil.
    expect(
      decidirResponsavel({ nota: atribuida("Comercial", "Marta Gestão"), perfis: PERFIS }),
    ).toEqual({ responsavel: null, motivo: "destino-nao-e-comercial" });
  });

  it("perfil inativo não dá nem recebe", () => {
    expect(
      decidirResponsavel({ nota: atribuida("Saiu Daqui", "Marta Gestão"), perfis: PERFIS }),
    ).toEqual({ responsavel: null, motivo: "destino-nao-e-comercial" });
    expect(
      decidirResponsavel({ nota: atribuida("Rodrigo Naumowicz", "Ex Admin"), perfis: PERFIS }),
    ).toEqual({ responsavel: null, motivo: "autor-nao-e-admin" });
    // `is_active` nulo não é ativo: a régua pede `true`.
    expect(
      decidirResponsavel({
        nota: atribuida("Rodrigo Naumowicz", "Sem Carimbo"),
        perfis: [...PERFIS, { full_name: "Sem Carimbo", papeis: ["admin"], is_active: null }],
      }),
    ).toEqual({ responsavel: null, motivo: "autor-nao-e-admin" });
  });

  it("nome que casa com dois perfis ativos não casa com nenhum", () => {
    const comHomonimo = [
      ...PERFIS,
      { full_name: "rodrigo  naumowicz", email: "outro@painel.com", papeis: ["comercial"], is_active: true },
    ];
    expect(
      decidirResponsavel({ nota: atribuida("Rodrigo Naumowicz", "Marta Gestão"), perfis: comHomonimo }),
    ).toEqual({ responsavel: null, motivo: "nome-ambiguo" });

    const adminEmDobro = [...PERFIS, { full_name: "Marta Gestao", papeis: ["admin"], is_active: true }];
    expect(
      decidirResponsavel({ nota: atribuida("Rodrigo Naumowicz", "Marta Gestão"), perfis: adminEmDobro }),
    ).toEqual({ responsavel: null, motivo: "nome-ambiguo" });
  });

  it("homônimo INATIVO não torna o nome ambíguo", () => {
    const comInativo = [
      ...PERFIS,
      { full_name: "Rodrigo Naumowicz", papeis: ["comercial"], is_active: false },
    ];
    expect(
      decidirResponsavel({ nota: atribuida("Rodrigo Naumowicz", "Marta Gestão"), perfis: comInativo }),
    ).toEqual({ responsavel: "Rodrigo Naumowicz", autor: "Marta Gestão" });
  });

  it("o e-mail do evento desempata o destino quando casa com um perfil", () => {
    const comHomonimo = [
      ...PERFIS,
      { full_name: "Rodrigo Naumowicz", email: "outro@painel.com", papeis: ["marketing"], is_active: true },
    ];
    expect(
      decidirResponsavel({
        nota: atribuida("Rodrigo Naumowicz", "Marta Gestão"),
        perfis: comHomonimo,
        emailDoDestino: " RODRIGO@painel.com ",
      }),
    ).toEqual({ responsavel: "Rodrigo Naumowicz", autor: "Marta Gestão" });
  });

  it("e-mail do Chatwoot que não existe no painel cai no nome", () => {
    // O caso real: o e-mail do agente no Chatwoot não é o do painel.
    expect(
      decidirResponsavel({
        nota: atribuida("Rodrigo Naumowicz", "Marta Gestão"),
        perfis: PERFIS,
        emailDoDestino: "rodrigo@chatwoot.com",
      }),
    ).toEqual({ responsavel: "Rodrigo Naumowicz", autor: "Marta Gestão" });
  });

  it("admin que também é Comercial pode pegar a conversa para si", () => {
    expect(
      decidirResponsavel({ nota: { tipo: "propria", por: "Dyones Oliveira" }, perfis: PERFIS }),
    ).toEqual({ responsavel: "Dyones Oliveira", autor: "Dyones Oliveira" });
  });

  it("Comercial puro que pega a conversa para si não muda o lead", () => {
    expect(
      decidirResponsavel({ nota: { tipo: "propria", por: "Rodrigo Naumowicz" }, perfis: PERFIS }),
    ).toEqual({ responsavel: null, motivo: "autor-nao-e-admin" });
  });

  it("admin puro que pega a conversa para si não vira dono de lead", () => {
    expect(
      decidirResponsavel({ nota: { tipo: "propria", por: "Marta Gestão" }, perfis: PERFIS }),
    ).toEqual({ responsavel: null, motivo: "destino-nao-e-comercial" });
  });

  it("remoção não muda nada, nem feita por admin", () => {
    expect(
      decidirResponsavel({ nota: { tipo: "removida", por: "Dyones Oliveira" }, perfis: PERFIS }),
    ).toEqual({ responsavel: null, motivo: "remocao" });
  });

  it("sem nota, sem decisão", () => {
    expect(decidirResponsavel({ nota: null, perfis: PERFIS })).toEqual({
      responsavel: null,
      motivo: "sem-nota",
    });
  });
});

describe("a nota mais recente da conversa", () => {
  it("só olha atividade, e pega a de carimbo mais novo", () => {
    const achada = notaMaisRecente([
      { message_type: 2, content: "Atribuído a Ana por Dono", created_at: 100 },
      // O cliente escrevendo a frase não atribui nada.
      { message_type: 0, content: "Atribuído a Golpe por Dono", created_at: 400 },
      { message_type: 2, content: "Atribuído a Bia por Dono", created_at: 300 },
      { message_type: 2, content: "Dono adicionou a etiqueta x", created_at: 350 },
      { message_type: "activity", content: "Atribuído a Caio por Dono", created_at: 200 },
    ]);
    expect(achada).toEqual({ nota: { tipo: "atribuida", para: "Bia", por: "Dono" }, em: 300_000 });
  });

  it("a remoção mais nova é a que vale: quem lê não age", () => {
    const achada = notaMaisRecente([
      { message_type: 2, content: "Atribuído a Ana por Dono", created_at: 100 },
      { message_type: 2, content: "Conversa desatribuída por Dono", created_at: 200 },
    ]);
    expect(achada?.nota.tipo).toBe("removida");
  });

  it("conversa sem nota devolve nulo", () => {
    expect(notaMaisRecente([{ message_type: 1, content: "Olá", created_at: 1 }])).toBeNull();
    expect(notaMaisRecente([])).toBeNull();
  });
});

describe("a nota velha não desfaz a troca feita no painel", () => {
  it("nota anterior à última troca de dono está superada", () => {
    expect(notaSuperada(Date.parse("2026-10-01T10:00:00Z"), "2026-10-02T10:00:00Z")).toBe(true);
    expect(notaSuperada(Date.parse("2026-10-03T10:00:00Z"), "2026-10-02T10:00:00Z")).toBe(false);
  });

  it("sem carimbo de um dos lados, a nota vale", () => {
    expect(notaSuperada(null, "2026-10-02T10:00:00Z")).toBe(false);
    expect(notaSuperada(Date.parse("2026-10-01T10:00:00Z"), null)).toBe(false);
  });
});

describe("o sinal no envelope do Chatwoot", () => {
  const CONVERSA = {
    id: 412,
    status: "open",
    inbox_id: 11,
    meta: {
      sender: { id: 88, name: "Fulano", phone_number: "+5541999990000" },
      assignee: { id: 5, name: "Rodrigo Naumowicz", email: "rodrigo@chatwoot.com" },
    },
  };

  it("`changed_attributes` com `assignee_id` é sinal explícito", () => {
    const e = interpretarEventoDoChatwoot({
      event: "conversation_updated",
      ...CONVERSA,
      changed_attributes: [{ assignee_id: { previous_value: null, current_value: 5 } }],
    });
    expect(e.tipo).toBe("conversa");
    expect(e.atribuicao).toEqual({
      nota: null,
      notaEm: null,
      explicito: true,
      responsavelNoChatwoot: "Rodrigo Naumowicz",
      emailDoResponsavel: "rodrigo@chatwoot.com",
    });
  });

  it("`changed_attributes` que fala de outra coisa NÃO é sinal", () => {
    const e = interpretarEventoDoChatwoot({
      event: "conversation_updated",
      ...CONVERSA,
      changed_attributes: [{ label_list: { previous_value: [], current_value: ["x"] } }],
    });
    expect(e.tipo).toBe("conversa");
    expect(e.atribuicao).toBeUndefined();
  });

  it("sem `changed_attributes`, vale o evento carregar um responsável", () => {
    const e = interpretarEventoDoChatwoot({ event: "conversation_updated", ...CONVERSA });
    expect(e.atribuicao?.explicito).toBe(false);
    expect(e.atribuicao?.responsavelNoChatwoot).toBe("Rodrigo Naumowicz");

    const semDono = interpretarEventoDoChatwoot({
      event: "conversation_updated",
      ...CONVERSA,
      meta: { sender: CONVERSA.meta.sender },
    });
    expect(semDono.atribuicao).toBeUndefined();
  });

  it("os outros eventos de conversa não são sinal", () => {
    const e = interpretarEventoDoChatwoot({ event: "conversation_status_changed", ...CONVERSA });
    expect(e.atribuicao).toBeUndefined();
  });

  it("a mensagem de atividade com nota entra como evento de conversa, com a nota", () => {
    for (const tipo of [2, "activity"]) {
      const e = interpretarEventoDoChatwoot({
        event: "message_created",
        message_type: tipo,
        content: "Atribuído a Rodrigo Naumowicz por Dyones Oliveira",
        created_at: "2026-10-03T12:00:00Z",
        conversation: CONVERSA,
      });
      // `conversa`, e não mensagem: não cria lead nem mexe no relógio.
      expect(e.tipo).toBe("conversa");
      expect(e.telefone).toBe("5541999990000");
      expect(e.atribuicao?.nota).toEqual({
        tipo: "atribuida",
        para: "Rodrigo Naumowicz",
        por: "Dyones Oliveira",
      });
      expect(e.atribuicao?.notaEm).toBe(Date.parse("2026-10-03T12:00:00Z"));
    }
  });

  it("atividade que não é atribuição continua ignorada, com motivo", () => {
    const e = interpretarEventoDoChatwoot({
      event: "message_created",
      message_type: 2,
      content: "Dyones Oliveira adicionou a etiqueta quer-comprar",
      conversation: CONVERSA,
    });
    expect(e.tipo).toBe("ignorado");
    expect(e.motivo).toMatch(/atividade/);
  });
});
