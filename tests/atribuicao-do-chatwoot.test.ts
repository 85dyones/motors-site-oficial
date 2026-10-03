import { describe, it, expect } from "vitest";
import {
  decidirResponsavel,
  lerNotaDeAtribuicao,
  motivoDeNotaVelha,
  normalizarNome,
  notaConfere,
  notaMaisRecente,
  notaSuperada,
  type AgenteDoChatwoot,
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

/**
 * O defeito que a revisão pegou (03/10): o e-mail do responsável do evento
 * passava por cima do nome escrito na nota. A nota de TIME ("Atribuído a
 * Comercial por ...") chega com o e-mail de quem o Chatwoot sorteou no time, e
 * o lead ia para alguém que o admin não nomeou.
 */
describe("o e-mail não passa por cima do nome da nota", () => {
  it("nota de time com o e-mail de um vendedor é recusada", () => {
    expect(
      decidirResponsavel({
        nota: atribuida("Comercial", "Dyones Oliveira"),
        perfis: PERFIS,
        emailDoDestino: "rodrigo@painel.com",
      }),
    ).toEqual({ responsavel: null, motivo: "destino-nao-e-comercial" });
  });

  it("nome de um, e-mail de outro: vale o nome", () => {
    expect(
      decidirResponsavel({
        nota: atribuida("João Araújo", "Marta Gestão"),
        perfis: PERFIS,
        emailDoDestino: "rodrigo@painel.com",
      }),
    ).toEqual({ responsavel: "João Araújo", autor: "Marta Gestão" });
  });

  it("nome de quem não é do Comercial não vira Comercial pelo e-mail", () => {
    expect(
      decidirResponsavel({
        nota: atribuida("Mari Marketing", "Marta Gestão"),
        perfis: PERFIS,
        emailDoDestino: "rodrigo@painel.com",
      }),
    ).toEqual({ responsavel: null, motivo: "destino-nao-e-comercial" });
  });

  it("entre homônimos, e-mail que não é de nenhum deles continua ambíguo", () => {
    const comHomonimo = [
      ...PERFIS,
      { full_name: "Rodrigo Naumowicz", email: "outro@painel.com", papeis: ["comercial"], is_active: true },
    ];
    expect(
      decidirResponsavel({
        nota: atribuida("Rodrigo Naumowicz", "Marta Gestão"),
        perfis: comHomonimo,
        emailDoDestino: "joao@painel.com",
      }),
    ).toEqual({ responsavel: null, motivo: "nome-ambiguo" });
  });
});

describe("o nome que se grava é o do perfil, só aparado", () => {
  it("espaço interno do `full_name` fica como está no perfil", () => {
    // `escopoDeLeads` compara `leads.responsavel` com o nome do perfil só com
    // `trim`. Colapsar o espaço interno gravaria um nome que não casa.
    const perfis = [
      ...PERFIS,
      { full_name: "  Bia  dos   Santos ", email: "bia@painel.com", papeis: ["comercial"], is_active: true },
    ];
    expect(
      decidirResponsavel({ nota: atribuida("Bia dos Santos", "Marta Gestão"), perfis }),
    ).toEqual({ responsavel: "Bia  dos   Santos", autor: "Marta Gestão" });
  });
});

/**
 * O nome da nota é nome de exibição, que o agente edita. Um vendedor que se
 * renomeie para o nome do dono não pode atribuir "por" ele.
 */
describe("o autor conferido na lista de agentes do Chatwoot", () => {
  const AGENTES: AgenteDoChatwoot[] = [
    { name: "Dyones Oliveira", email: "dyones@chatwoot.com", role: "administrator" },
    { name: "Marta Gestão", email: "marta@painel.com", role: "administrator" },
    { name: "Rodrigo Naumowicz", email: "rodrigo@chatwoot.com", role: "agent" },
    { name: "João Araújo", email: "joao@painel.com", role: "agent" },
  ];
  const nota = atribuida("Rodrigo Naumowicz", "Dyones Oliveira");

  it("administrador único no Chatwoot e admin no painel: aceita", () => {
    expect(decidirResponsavel({ nota, perfis: PERFIS, agentes: AGENTES })).toEqual({
      responsavel: "Rodrigo Naumowicz",
      autor: "Dyones Oliveira",
    });
  });

  it("agente comum que se renomeou para o nome do admin: dois com o nome, recusa", () => {
    const comImpostor = [...AGENTES, { name: "dyones  oliveira", email: "x@chatwoot.com", role: "agent" }];
    expect(decidirResponsavel({ nota, perfis: PERFIS, agentes: comImpostor })).toEqual({
      responsavel: null,
      motivo: "nome-ambiguo",
    });
  });

  it("o nome de exibição (`available_name`) também conta para a ambiguidade", () => {
    const comApelido = [
      ...AGENTES,
      { name: "Vendedor Novo", available_name: "Dyones Oliveira", email: "y@chatwoot.com", role: "agent" },
    ];
    expect(decidirResponsavel({ nota, perfis: PERFIS, agentes: comApelido }).responsavel).toBeNull();
  });

  it("nome de admin do painel que no Chatwoot é agente comum: recusa", () => {
    const rebaixado = AGENTES.map((a) => (a.name === "Dyones Oliveira" ? { ...a, role: "agent" } : a));
    expect(decidirResponsavel({ nota, perfis: PERFIS, agentes: rebaixado })).toEqual({
      responsavel: null,
      motivo: "autor-nao-e-admin",
    });
  });

  it("autor que não é agente nenhum (automação): recusa", () => {
    expect(
      decidirResponsavel({
        nota: atribuida("Rodrigo Naumowicz", "Automation System"),
        perfis: PERFIS,
        agentes: AGENTES,
      }),
    ).toEqual({ responsavel: null, motivo: "autor-nao-e-admin" });
    expect(decidirResponsavel({ nota, perfis: PERFIS, agentes: [] }).responsavel).toBeNull();
  });

  it("administrador do Chatwoot que não é admin no painel: recusa", () => {
    const promovido = AGENTES.map((a) => (a.name === "Rodrigo Naumowicz" ? { ...a, role: "administrator" } : a));
    expect(
      decidirResponsavel({
        nota: atribuida("João Araújo", "Rodrigo Naumowicz"),
        perfis: PERFIS,
        agentes: promovido,
      }),
    ).toEqual({ responsavel: null, motivo: "autor-nao-e-admin" });
  });

  it("o e-mail do agente desempata o AUTOR entre homônimos do painel", () => {
    const adminEmDobro = [
      ...PERFIS,
      { full_name: "Marta Gestao", email: "outra@painel.com", papeis: ["marketing"], is_active: true },
    ];
    const daMarta = atribuida("Rodrigo Naumowicz", "Marta Gestão");
    expect(decidirResponsavel({ nota: daMarta, perfis: adminEmDobro, agentes: AGENTES })).toEqual({
      responsavel: "Rodrigo Naumowicz",
      autor: "Marta Gestão",
    });
    // Sem a lista não há e-mail do autor, e o nome em dobro segue ambíguo.
    expect(decidirResponsavel({ nota: daMarta, perfis: adminEmDobro })).toEqual({
      responsavel: null,
      motivo: "nome-ambiguo",
    });
  });

  it("atribuição a si mesmo passa pela mesma conferência", () => {
    const propria = { tipo: "propria" as const, por: "Dyones Oliveira" };
    expect(decidirResponsavel({ nota: propria, perfis: PERFIS, agentes: AGENTES }).responsavel).toBe(
      "Dyones Oliveira",
    );
    const rebaixado = AGENTES.map((a) => (a.name === "Dyones Oliveira" ? { ...a, role: "agent" } : a));
    expect(decidirResponsavel({ nota: propria, perfis: PERFIS, agentes: rebaixado }).responsavel).toBeNull();
  });
});

describe("a nota confere com o responsável que o evento traz", () => {
  it("o destino da nota precisa ser o responsável atual", () => {
    const nota = atribuida("Rodrigo Naumowicz", "Dono");
    expect(notaConfere(nota, "rodrigo  NAUMOWICZ")).toBe(true);
    expect(notaConfere(nota, "Ana Lima")).toBe(false);
    // Nota de time: o destino é o time, o responsável é uma pessoa.
    expect(notaConfere(atribuida("Comercial", "Dono"), "Rodrigo Naumowicz")).toBe(false);
  });

  it("na atribuição a si mesmo, o destino é o autor", () => {
    expect(notaConfere({ tipo: "propria", por: "Dono" }, "Dono")).toBe(true);
    expect(notaConfere({ tipo: "propria", por: "Dono" }, "Ana Lima")).toBe(false);
  });

  it("remoção nunca confere com um responsável; sem nome no evento não há o que conferir", () => {
    expect(notaConfere({ tipo: "removida", por: "Dono" }, "Ana Lima")).toBe(false);
    expect(notaConfere(atribuida("Ana Lima", "Dono"), null)).toBe(true);
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

/**
 * Conversa reaberta: o negócio foi encerrado, o cliente voltou a escrever na
 * mesma conversa e nasceu um lead NOVO. A nota antiga da conversa não é dele.
 */
describe("a nota velha não cai num lead novo", () => {
  const NOTA = Date.parse("2026-09-20T10:00:00Z");
  const lead = { leadCriadoEm: "2026-10-01T10:00:00Z", responsavelDesde: null };

  it("evento que só carrega um responsável: nota anterior ao lead é recusada", () => {
    expect(motivoDeNotaVelha({ notaEm: NOTA, explicito: false, ...lead })).toBe("nota-anterior-ao-lead");
  });

  it("evento que só carrega um responsável: nota sem data é recusada", () => {
    expect(motivoDeNotaVelha({ notaEm: null, explicito: false, ...lead })).toBe("nota-sem-data");
  });

  it("evento que só carrega um responsável: sem a data do lead, recusa", () => {
    expect(
      motivoDeNotaVelha({ notaEm: NOTA, explicito: false, leadCriadoEm: null, responsavelDesde: null }),
    ).toBe("nota-anterior-ao-lead");
  });

  it("nota mais nova que o lead e que a última troca vale", () => {
    expect(
      motivoDeNotaVelha({
        notaEm: Date.parse("2026-10-03T10:00:00Z"),
        explicito: false,
        leadCriadoEm: "2026-10-01T10:00:00Z",
        responsavelDesde: "2026-10-02T10:00:00Z",
      }),
    ).toBeNull();
  });

  it("a troca feita depois no painel ganha, explícito ou não", () => {
    for (const explicito of [true, false]) {
      expect(
        motivoDeNotaVelha({
          notaEm: Date.parse("2026-10-03T10:00:00Z"),
          explicito,
          leadCriadoEm: "2026-10-01T10:00:00Z",
          responsavelDesde: "2026-10-03T15:00:00Z",
        }),
      ).toBe("nota-anterior-a-ultima-troca");
    }
  });

  it("evento que DISSE que o responsável mudou não exige data na nota", () => {
    expect(motivoDeNotaVelha({ notaEm: null, explicito: true, ...lead })).toBeNull();
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
