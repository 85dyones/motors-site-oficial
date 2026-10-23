import { describe, it, expect, vi, beforeEach } from "vitest";
import { aplicarMudanca } from "../src/lib/etiquetas";

/**
 * As etiquetas do lead nas rotas, EXECUTADAS (2026-09-25).
 *
 * Pedido do dono: *"ele [o SDR] tem que ter acesso às etiquetas"* e *"quando o
 * sdr atribuir um contato para um vendedor do comercial, precisamos manter a
 * tag de resgate e reaquecido, para mensurar o trabalho dele, isso tem que ser
 * feito automático"*.
 *
 * Desde 20/10/2026 as etiquetas moram no próprio lead (`leads.etiquetas`; o
 * Chatwoot saiu de cena) e só se gravam pela função `editar_etiquetas_do_lead`
 * (migração 20261023120000). A função — trava, caixa, guarda, rastro — se
 * prova no aceite dela (`migracoes-executam.test.ts`); aqui ela é um dublê
 * que aplica a mudança no banco em memória, e o que se trava é a ROTA:
 *   - desde 23/10/2026 o SDR só consulta: não passa o lead (403), e
 *     "resgate" e "reaquecido" medem o trabalho do Ney, não o dele;
 *   - o Comercial passando entre si, e o SDR tirando o dono, não etiquetam;
 *   - o card manda MUDANÇA (esta entra, esta sai), nunca a lista inteira;
 *   - resgate e reaquecido não entram nem saem pelo card;
 *   - quem não move lead, ou não enxerga o lead, não mexe em etiqueta.
 *
 * O crédito do SDR no rastro (gatilho da migração 20260925180000) ficou sem
 * caminho: a rota e a RLS (20261030120000) não deixam mais o SDR trocar o
 * dono. O gatilho segue simulado aqui — `gatilhoCredita` — para provar que a
 * rota não etiqueta por conta própria.
 *
 * Desde 03/10/2026 cada perfil só mexe no lead que enxerga (`escopoDeLeads`):
 * o SDR, nos que já têm responsável; o vendedor, só nos dele. Por isso os dois
 * leads da fixture já são da Bia, e
 * o teste em que a Ana age começa por pôr o lead no nome dela. O terceiro
 * lead, sem responsável, é o que só o Admin vê.
 */

// ----------------------------------------------------------------------------
// O banco em memória
// ----------------------------------------------------------------------------

type Linha = Record<string, unknown>;
interface Erro {
  message: string;
  code?: string;
}

let banco: Record<string, Linha[]>;
let falhas: Record<string, Erro | undefined>;
/** Falha só da GRAVAÇÃO (`update`) na tabela; a leitura segue respondendo. */
let falhasAoGravar: Record<string, Erro | undefined>;
/** Tudo o que acontece, na ordem: gravação no banco, rpc. */
let linhaDoTempo: string[];
let usuario: string | null;
let rpcs: Array<{ nome: string; args: Record<string, unknown> }>;
let erroDoRpc: Erro | null;
/** O gatilho do crédito, simulado: o UPDATE do dono deixa o crédito no rastro? */
let gatilhoCredita: boolean;

function consulta(tabela: string) {
  const filtros: Array<(l: Linha) => boolean> = [];
  let atualizacao: Linha | null = null;
  let soContagem = false;
  const linhas = () => (banco[tabela] ?? []).filter((l) => filtros.every((f) => f(l)));
  const executar = async () => {
    const falha = falhas[tabela];
    if (falha) return { data: null, error: falha };
    if (atualizacao) {
      const falhaAoGravar = falhasAoGravar[tabela];
      if (falhaAoGravar) return { data: null, error: falhaAoGravar };
      for (const l of linhas()) {
        Object.assign(l, atualizacao);
        if (tabela === "leads" && "responsavel" in atualizacao && gatilhoCredita) {
          (banco.leads_eventos ??= []).push({
            lead_id: l.id,
            tipo: "etiqueta",
            detalhe: { origem: "passagem_do_sdr" },
          });
        }
      }
      linhaDoTempo.push(`update ${tabela}`);
      return { data: null, error: null };
    }
    if (soContagem) return { data: null, count: linhas().length, error: null };
    return { data: linhas(), error: null };
  };
  const q = {
    select: (_colunas?: string, opcoes?: { count?: string; head?: boolean }) => {
      soContagem = Boolean(opcoes?.head);
      return q;
    },
    order: () => q,
    limit: () => q,
    // Só o prefixo (`0DCB1CDC-%`) que a busca por referência monta.
    ilike: (coluna: string, padrao: string) => {
      const prefixo = padrao.replace(/%$/, "").toLowerCase();
      filtros.push((l) => typeof l[coluna] === "string" && (l[coluna] as string).toLowerCase().startsWith(prefixo));
      return q;
    },
    eq: (coluna: string, valor: unknown) => {
      // `detalhe->>origem`, como o PostgREST lê um campo de jsonb.
      const [raiz, campo] = coluna.split("->>");
      filtros.push((l) =>
        campo === undefined ? l[coluna] === valor : (l[raiz] as Linha | undefined)?.[campo] === valor,
      );
      return q;
    },
    neq: (coluna: string, valor: unknown) => {
      filtros.push((l) => l[coluna] !== valor);
      return q;
    },
    // Só o `not(coluna, "is", null)` que `comEscopoDeLeads` usa.
    not: (coluna: string, operador: string, valor: unknown) => {
      if (operador !== "is" || valor !== null) throw new Error(`not ${operador} ${String(valor)}: o dublê não conhece`);
      filtros.push((l) => l[coluna] !== null && l[coluna] !== undefined);
      return q;
    },
    in: (coluna: string, valores: unknown[]) => {
      filtros.push((l) => valores.includes(l[coluna]));
      return q;
    },
    update: (campos: Linha) => {
      atualizacao = campos;
      return q;
    },
    single: async () => {
      const r = await executar();
      return { data: (r.data as Linha[] | null)?.[0] ?? null, error: r.error };
    },
    maybeSingle: async () => {
      const r = await executar();
      return { data: (r.data as Linha[] | null)?.[0] ?? null, error: r.error };
    },
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => executar().then(ok, erro),
  };
  return q;
}

const CLIENTE = {
  auth: { getUser: async () => ({ data: { user: usuario ? { id: usuario } : null } }) },
  from: (tabela: string) => consulta(tabela),
  rpc: async (nome: string, args: Record<string, unknown>) => {
    rpcs.push({ nome, args });
    linhaDoTempo.push(`rpc ${nome}`);
    if (erroDoRpc) return { data: null, error: erroDoRpc };
    if (nome !== "editar_etiquetas_do_lead") return { data: null, error: null };
    // O dublê de `editar_etiquetas_do_lead`: aplica a mudança e, se mudou e
    // `p_rastro`, deixa o evento — o que a função faz sob trava no banco.
    const lead = (banco.leads ?? []).find((l) => l.id === args.p_lead);
    if (!lead) return { data: null, error: { message: "Lead não encontrado.", code: "P0002" } };
    const antes = (lead.etiquetas as string[] | undefined) ?? [];
    const depois = aplicarMudanca(antes, { incluir: args.p_incluir as string[], retirar: args.p_retirar as string[] });
    if (JSON.stringify(depois) !== JSON.stringify(antes)) {
      lead.etiquetas = depois;
      if (args.p_rastro) {
        (banco.leads_eventos ??= []).push({ lead_id: lead.id, tipo: "etiqueta", detalhe: { origem: "card", antes, depois } });
      }
    }
    return { data: depois, error: null };
  },
};
// A contagem do Marketing sai da chave de serviço (`leadsDaLoja.ts`): aqui o
// cliente de serviço lê o mesmo banco em memória.
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => CLIENTE,
  createAdminSupabaseClient: () => ({ from: (tabela: string) => consulta(tabela) }),
}));

const gerenciar = await import("../src/app/api/leads/gerenciar/route");
const etiquetas = await import("../src/app/api/leads/etiquetas/route");

beforeEach(() => {
  usuario = "u-sdr";
  falhas = {};
  falhasAoGravar = {};
  linhaDoTempo = [];
  rpcs = [];
  erroDoRpc = null;
  gatilhoCredita = true;
  banco = {
    profiles: [
      { id: "u-sdr", full_name: "Felipe", role: "sdr", papeis: ["sdr"], is_active: true },
      { id: "u-ana", full_name: "Ana", role: "comercial", papeis: ["comercial"], is_active: true },
      { id: "u-bia", full_name: "Bia", role: "comercial", papeis: ["comercial"], is_active: true },
      { id: "u-duplo", full_name: "Caio", role: "comercial", papeis: ["comercial", "sdr"], is_active: true },
      { id: "u-mkt", full_name: "Mari", role: "marketing", papeis: ["marketing"], is_active: true },
      { id: "u-cliente", full_name: "Cliente", role: "cliente", papeis: [], is_active: true },
      { id: "u-gestor", full_name: "Gil", role: "gestor", papeis: ["gestor"], is_active: true },
      { id: "u-admin", full_name: "Dono", role: "admin", papeis: ["admin"], is_active: true },
      // Saiu da loja: perfil desativado, sessão ainda viva. Era Admin e SDR.
      { id: "u-saiu", full_name: "Saulo", role: "admin", papeis: ["admin", "sdr"], is_active: false },
      // Perfil antigo, sem a coluna preenchida: `!== true` também recusa.
      { id: "u-sem-coluna", full_name: "Vera", role: "comercial", papeis: ["comercial"] },
    ],
    leads: [
      { id: "lead-1", nome: "Joana", situacao: "novo", responsavel: "Bia", created_at: "2026-09-20T10:00:00Z", etiquetas: ["origem-site", "quer-comprar"] },
      { id: "lead-sem-conversa", nome: "Pedro", situacao: "novo", responsavel: "Bia", created_at: "2026-09-21T10:00:00Z", etiquetas: [] },
      // O lead novo, que ninguém pegou: só o Admin o enxerga.
      { id: "lead-novo", nome: "Rita", situacao: "novo", responsavel: null, created_at: "2026-09-22T10:00:00Z", etiquetas: ["sem-dono"] },
    ],
    atendimentos: [
      // Duas conversas do mesmo lead: a mais recente (4821) é a do card. As
    // `tags` são o espelho antigo do Chatwoot: só valem num banco sem a coluna.
      { lead_id: "lead-1", chatwoot_conversation_id: 100, iniciado_em: "2026-06-01T10:00:00", created_at: "2026-06-01T10:00:00", tags: ["antiga"] },
      { lead_id: "lead-1", chatwoot_conversation_id: 4821, iniciado_em: "2026-09-20T10:00:00", created_at: "2026-09-20T10:00:00", tags: ["origem-site", "Quer-Comprar"] },
      { lead_id: "lead-novo", chatwoot_conversation_id: 300, iniciado_em: "2026-09-22T10:00:00", created_at: "2026-09-22T10:00:00", tags: ["sem-dono"] },
    ],
    funil_etapas: [],
    funil_motivos: [],
    leads_eventos: [],
  };
});

const patch = (corpo: Linha) =>
  gerenciar.PATCH(
    new Request("http://x/api/leads/gerenciar", {
      method: "PATCH",
      body: JSON.stringify({ id: "lead-1", ...corpo }),
      headers: { "content-type": "application/json" },
    }) as never,
  );

const postEtiquetas = (corpo: unknown) =>
  etiquetas.POST(
    new Request("http://x/api/leads/etiquetas", {
      method: "POST",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }) as never,
  );

// ----------------------------------------------------------------------------

/** Os pedidos à função das etiquetas, sem os outros rpcs. */
const edicoes = () => rpcs.filter((r) => r.nome === "editar_etiquetas_do_lead");

describe("o SDR só consulta (23/10/2026): a passagem com crédito saiu", () => {
  // *"todo o fluxo de SDR deve ser direcionado ao Ney, não envie mais ao SDR,
  // essa função é exclusiva do Ney e suas cadências"* — e o dono escolheu
  // "só consulta": o SDR vê e anota, não passa lead.
  it("o SDR não passa o lead: 403, fica com quem estava, nada se etiqueta", async () => {
    const r = await patch({ responsavel: "Ana" });
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({
      error: "O SDR só consulta: quem leva o lead ao vendedor é o Ney, pelo rodízio, ou o administrador.",
    });
    expect(banco.leads[0].responsavel).toBe("Bia");
    expect(banco.leads[0].etiquetas).toEqual(["origem-site", "quer-comprar"]);
    expect(edicoes()).toHaveLength(0);
    expect(linhaDoTempo).not.toContain("update leads");
  });

  it("nem quem é SDR e também Comercial", async () => {
    usuario = "u-duplo";
    const r = await patch({ responsavel: "Ana" });
    expect(r.status).toBe(403);
    expect(banco.leads[0].responsavel).toBe("Bia");
  });

  it("repetir o mesmo dono não é passar: o pedido segue", async () => {
    const r = await patch({ responsavel: "Bia", observacoes: "cliente pediu fotos" });
    expect(r.status).toBe(200);
    expect(banco.leads[0].responsavel).toBe("Bia");
    expect(banco.leads[0].observacoes).toBe("cliente pediu fotos");
    expect(edicoes()).toHaveLength(0);
  });

  it("o SDR anota no lead, e isso não etiqueta", async () => {
    await patch({ observacoes: "ligar amanhã" });
    expect(banco.leads[0].observacoes).toBe("ligar amanhã");
    expect(edicoes()).toHaveLength(0);
  });

  it("o SDR não tira o dono (03/10): 403, e o lead fica com quem estava", async () => {
    banco.leads[0].responsavel = "Ana";
    const r = await patch({ responsavel: null });
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "Só um administrador pode deixar o lead sem responsável." });
    expect(banco.leads[0].responsavel).toBe("Ana");
  });

  it("o Comercial passando entre si segue, sem etiquetar", async () => {
    usuario = "u-ana";
    banco.leads[0].responsavel = "Ana";
    const r = await patch({ responsavel: "Bia" });
    expect(await r.json()).toEqual({ ok: true });
    expect(edicoes()).toHaveLength(0);
    expect(banco.leads[0].responsavel).toBe("Bia");
  });

  it("o Comercial não passa o lead a quem é SDR, nem sendo também do Comercial", async () => {
    usuario = "u-ana";
    banco.leads[0].responsavel = "Ana";
    const r = await patch({ responsavel: "Caio" });
    expect(r.status).toBe(422);
    expect(banco.leads[0].responsavel).toBe("Ana");
  });

  it("a lista de quem recebe lead não traz o SDR, nem o que também é do Comercial", async () => {
    usuario = "u-admin";
    const d = await (await gerenciar.GET(new Request("http://x/api/leads/gerenciar") as never)).json();
    const nomes = (d.atendentes as { nome: string }[]).map((a) => a.nome);
    expect(nomes).toContain("Ana");
    expect(nomes).not.toContain("Caio");
    expect(nomes).not.toContain("Felipe");
  });
});

describe("o GET da fila traz as etiquetas", () => {
  it("as do lead, como estão, e a lista do que dá para pôr", async () => {
    banco.leads[0].etiquetas = ["origem-site", "Quer-Comprar"];
    const d = await (await gerenciar.GET(new Request("http://x/api/leads/gerenciar") as never)).json();
    const joana = d.leads.find((l: Linha) => l.id === "lead-1");
    const pedro = d.leads.find((l: Linha) => l.id === "lead-sem-conversa");

    // Como o lead as tem — a grafia não é "consertada".
    expect(joana.etiquetas).toEqual(["origem-site", "Quer-Comprar"]);
    expect(pedro.etiquetas).toEqual([]);
    // As vistas nos leads, em ordem alfabética — sem as duas da passagem, que
    // não entram à mão. A conversa antiga (`antiga`) não conta mais.
    expect(d.etiquetasDisponiveis).toEqual(["origem-site", "quer-comprar"]);
    expect(d.etiquetasEditaveis).toBe(true);
  });

  it("banco sem a coluna: as da conversa mais recente, e a tela sabe que não dá para editar", async () => {
    for (const l of banco.leads) delete l.etiquetas;
    const d = await (await gerenciar.GET(new Request("http://x/api/leads/gerenciar") as never)).json();
    expect(d.leads.find((l: Linha) => l.id === "lead-1").etiquetas).toEqual(["origem-site", "Quer-Comprar"]);
    expect(d.etiquetasEditaveis).toBe(false);
  });

  it("não chama a função das etiquetas — a fila só lê", async () => {
    await gerenciar.GET(new Request("http://x/api/leads/gerenciar") as never);
    expect(rpcs).toHaveLength(0);
  });
});

describe("o GET da fila obedece ao escopo de quem pede (03/10)", () => {
  const fila = async (quem: string, busca = "") => {
    usuario = quem;
    const r = await gerenciar.GET(new Request(`http://x/api/leads/gerenciar${busca}`) as never);
    expect(r.status).toBe(200);
    const d = await r.json();
    return { d, ids: ((d.leads ?? []) as Linha[]).map((l) => l.id).sort() };
  };

  it("o vendedor recebe só os dele", async () => {
    banco.leads[0].responsavel = "Ana";
    const ana = await fila("u-ana");
    expect(ana.ids).toEqual(["lead-1"]);
    expect(ana.d.escopo).toBe("meus");

    const bia = await fila("u-bia");
    expect(bia.ids).toEqual(["lead-sem-conversa"]);
  });

  it("vendedor sem lead nenhum recebe a fila vazia, e não a da loja", async () => {
    const ana = await fila("u-ana");
    expect(ana.ids).toEqual([]);
    expect(ana.d.escopo).toBe("meus");
  });

  it("SDR e Gestor recebem os que têm responsável, e não o novo", async () => {
    // Responsável vazio é sem responsável, como o nulo.
    banco.leads.push({ id: "lead-vazio", nome: "Lia", situacao: "novo", responsavel: "", created_at: "2026-09-23T10:00:00Z" });
    for (const quem of ["u-sdr", "u-gestor", "u-duplo"]) {
      const { d, ids } = await fila(quem);
      expect(ids, quem).toEqual(["lead-1", "lead-sem-conversa"]);
      expect(d.escopo, quem).toBe("designados");
      // Nem a etiqueta da conversa do lead que não se vê chega à tela.
      expect(d.etiquetasDisponiveis, quem).not.toContain("sem-dono");
    }
  });

  it("o Admin recebe todos, inclusive o sem responsável", async () => {
    const { d, ids } = await fila("u-admin");
    expect(ids).toEqual(["lead-1", "lead-novo", "lead-sem-conversa"]);
    expect(d.escopo).toBe("todos");
    expect(d.leads.find((l: Linha) => l.id === "lead-novo").etiquetas).toEqual(["sem-dono"]);
  });

  it("Marketing segue recebendo só a contagem, e ela é da loja inteira", async () => {
    const { d } = await fila("u-mkt");
    expect(d).toEqual({ somenteAgregado: true, total: 3, porSituacao: { novo: 3 } });
  });

  it("a busca por referência obedece à mesma regra", async () => {
    // A referência é a do lead novo, sem responsável.
    banco.leads[2].ag_uid = "0dcb1cdc-1111-4222-8333-444455556666";
    const busca = "?ref=0DCB1CDC";

    for (const quem of ["u-sdr", "u-gestor", "u-ana"]) {
      const { d, ids } = await fila(quem, busca);
      expect(ids, quem).toEqual([]);
      expect(d.busca, quem).toEqual({ ref: "0DCB1CDC" });
    }
    expect((await fila("u-admin", busca)).ids).toEqual(["lead-novo"]);

    // Dado à Bia, o SDR e ela passam a achar; a Ana, não.
    banco.leads[2].responsavel = "Bia";
    expect((await fila("u-sdr", busca)).ids).toEqual(["lead-novo"]);
    expect((await fila("u-bia", busca)).ids).toEqual(["lead-novo"]);
    expect((await fila("u-ana", busca)).ids).toEqual([]);
  });
});

describe("PATCH /api/leads/gerenciar — fora do escopo, 404 e nada gravado (03/10)", () => {
  const patchNo = (id: string, corpo: Linha) =>
    gerenciar.PATCH(
      new Request("http://x/api/leads/gerenciar", { method: "PATCH", body: JSON.stringify({ id, ...corpo }) }) as never,
    );
  const antes = () => JSON.stringify(banco.leads);

  it("vendedor no lead de outro vendedor", async () => {
    usuario = "u-ana";
    const retrato = antes();
    const r = await patch({ responsavel: "Ana", observacoes: "peguei", contato: "whatsapp" });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "Lead não encontrado" });
    expect(antes()).toBe(retrato);
    // Nem o banco, nem o registro de contato, nem as etiquetas.
    expect(linhaDoTempo).toEqual([]);
  });

  it("vendedor e SDR no lead sem responsável", async () => {
    const retrato = antes();
    for (const quem of ["u-ana", "u-sdr", "u-duplo"]) {
      usuario = quem;
      const r = await patchNo("lead-novo", { responsavel: "Ana" });
      expect(r.status, quem).toBe(404);
    }
    expect(antes()).toBe(retrato);
    expect(linhaDoTempo).toEqual([]);
  });

  it("gestor no lead com responsável passa — e, sem ser SDR, não etiqueta", async () => {
    usuario = "u-gestor";
    const r = await patch({ responsavel: "Ana" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(banco.leads[0].responsavel).toBe("Ana");
    expect(edicoes()).toHaveLength(0);
  });

  it("Admin distribui o lead novo", async () => {
    usuario = "u-admin";
    const r = await patchNo("lead-novo", { responsavel: "Bia" });
    expect(r.status).toBe(200);
    expect(banco.leads[2].responsavel).toBe("Bia");
  });
});

describe("perfil desativado não lê nem grava (03/10): a mesma régua de `sessaoDeLeads`", () => {
  const RECUSA = { error: "Acesso restrito à equipe" };
  const retrato = () => JSON.stringify([banco.leads, banco.atendimentos]);

  for (const quem of ["u-saiu", "u-sem-coluna"]) {
    it(`${quem}: o PATCH da fila responde 403 e não grava nada`, async () => {
      usuario = quem;
      const antes = retrato();
      const r = await patch({ responsavel: "Bia", observacoes: "peguei", contato: "whatsapp" });
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual(RECUSA);
      expect(retrato()).toBe(antes);
      expect(linhaDoTempo).toEqual([]);
      expect(rpcs).toEqual([]);
    });

    it(`${quem}: o POST e o GET das etiquetas respondem 403, sem gravar`, async () => {
      usuario = quem;
      const antes = retrato();
      const r = await postEtiquetas({ id: "lead-1", incluir: ["negociando"] });
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual(RECUSA);
      const g = await etiquetas.GET();
      expect(g.status).toBe(403);
      expect(await g.json()).toEqual(RECUSA);
      expect(retrato()).toBe(antes);
      expect(rpcs).toEqual([]);
    });

    it(`${quem}: o GET da fila responde 403, sem fila`, async () => {
      usuario = quem;
      const r = await gerenciar.GET(new Request("http://x/api/leads/gerenciar") as never);
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual(RECUSA);
    });
  }

  it("contraprova: o mesmo pedido, de quem está ativo, passa", async () => {
    usuario = "u-admin";
    expect((await patch({ responsavel: "Ana" })).status).toBe(200);
    expect((await postEtiquetas({ id: "lead-1", incluir: ["negociando"] })).status).toBe(200);
  });
});

describe("POST /api/leads/etiquetas — a edição no card", () => {
  it("põe a pedida sobre o que o lead tem, com rastro", async () => {
    const r = await postEtiquetas({ id: "lead-1", incluir: ["negociando"] });
    const d = await r.json();

    expect(r.status).toBe(200);
    expect(d).toEqual({ ok: true, etiquetas: ["origem-site", "quer-comprar", "negociando"] });
    expect(banco.leads[0].etiquetas).toEqual(["origem-site", "quer-comprar", "negociando"]);
    // A MUDANÇA vai ao banco, nunca a lista que o card desenhou.
    expect(rpcs).toEqual([
      {
        nome: "editar_etiquetas_do_lead",
        args: { p_lead: "lead-1", p_incluir: ["negociando"], p_retirar: [], p_rastro: true },
      },
    ]);
    expect(banco.leads_eventos).toHaveLength(1);
  });

  it("a etiqueta nova (criada no card) entra como qualquer outra", async () => {
    const d = await (await postEtiquetas({ id: "lead-sem-conversa", incluir: ["test-drive"] })).json();
    expect(d.etiquetas).toEqual(["test-drive"]);
  });

  it("resgate e reaquecido não entram à mão", async () => {
    for (const incluir of [["resgate"], ["Reaquecido"], ["negociando", "resgate"]]) {
      const r = await postEtiquetas({ id: "lead-1", incluir });
      expect(r.status, JSON.stringify(incluir)).toBe(422);
      expect((await r.json()).error).toContain("entram sozinhas");
    }
    expect(rpcs).toHaveLength(0);
  });

  it("tira só a pedida", async () => {
    const d = await (await postEtiquetas({ id: "lead-1", retirar: ["origem-site"] })).json();
    expect(d.etiquetas).toEqual(["quer-comprar"]);
    expect(banco.leads[0].etiquetas).toEqual(["quer-comprar"]);
  });

  it("o card atrás do lead NÃO apaga o que ele não via", async () => {
    // O SDR passou o lead em outra aba: o lead já tem resgate e reaquecido,
    // e o card da Ana, aberto antes, não.
    banco.leads[0].etiquetas = ["origem-site", "quer-comprar", "resgate", "reaquecido"];
    usuario = "u-ana";
    banco.leads[0].responsavel = "Ana";
    const d = await (await postEtiquetas({ id: "lead-1", incluir: ["negociando"] })).json();

    expect(banco.leads[0].etiquetas).toEqual(["origem-site", "quer-comprar", "resgate", "reaquecido", "negociando"]);
    expect(d.etiquetas).toEqual(banco.leads[0].etiquetas);
  });

  it("etiqueta fora do formato do site sobrevive à edição", async () => {
    banco.leads[0].etiquetas = ["Lead Quente", "origem-site"];
    await postEtiquetas({ id: "lead-1", retirar: ["origem-site"] });
    expect(banco.leads[0].etiquetas).toEqual(["Lead Quente"]);
  });

  it("resgate e reaquecido não saem pelo card", async () => {
    banco.leads[0].etiquetas = ["origem-site", "resgate", "reaquecido"];
    for (const retirar of [["resgate"], ["Reaquecido"], ["origem-site", "resgate"]]) {
      const r = await postEtiquetas({ id: "lead-1", retirar });
      expect(r.status, JSON.stringify(retirar)).toBe(422);
      expect((await r.json()).error).toContain("não saem pelo painel");
    }
    expect(rpcs).toHaveLength(0);
    expect(banco.leads[0].etiquetas).toEqual(["origem-site", "resgate", "reaquecido"]);
  });

  it("mudança que não muda nada não vira evento no rastro", async () => {
    await postEtiquetas({ id: "lead-1", incluir: ["quer-comprar"] });
    expect(banco.leads_eventos).toHaveLength(0);
  });

  it("etiqueta fora do formato não entra, antes de qualquer chamada", async () => {
    const r = await postEtiquetas({ id: "lead-1", incluir: ["quer comprar"] });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain('"quer comprar"');
    expect(rpcs).toHaveLength(0);
  });

  it("pedido sem id, sem mudança, ou com a lista inteira no formato antigo é recusado", async () => {
    expect((await postEtiquetas({ incluir: ["a"] })).status).toBe(400);
    expect((await postEtiquetas({ id: "lead-1" })).status).toBe(400);
    // A lista inteira (`etiquetas`) era o contrato que apagava etiqueta: não
    // pode ser aceita por engano como "sem mudança nenhuma" que grava algo.
    expect((await postEtiquetas({ id: "lead-1", etiquetas: ["resgate"] })).status).toBe(400);
    expect(rpcs).toHaveLength(0);
  });

  it("mais de 20 de uma vez é recusado", async () => {
    const muitas = Array.from({ length: 21 }, (_, i) => `e${i}`);
    expect((await postEtiquetas({ id: "lead-1", incluir: muitas })).status).toBe(400);
  });

  it.each([
    ["função ausente (antes da migração)", { message: "Could not find the function", code: "PGRST202" }, 503, "20261023120000"],
    ["perfil que a função recusa", { message: "Editar etiquetas é de quem move lead no kanban.", code: "42501" }, 403, "não edita"],
    ["fora do formato no banco", { message: "check", code: "23514" }, 400, "até 20 por pedido"],
    ["lead que sumiu no meio", { message: "Lead não encontrado.", code: "P0002" }, 404, "Lead não encontrado"],
    ["outro erro", { message: "boom", code: "XX000" }, 500, "boom"],
  ])("o erro do banco vira resposta: %s", async (_caso, erro, status, texto) => {
    erroDoRpc = erro;
    const r = await postEtiquetas({ id: "lead-1", incluir: ["negociando"] });
    expect(r.status).toBe(status);
    expect((await r.json()).error).toContain(texto);
  });

  it("o SDR edita", async () => {
    usuario = "u-sdr";
    expect((await postEtiquetas({ id: "lead-1", incluir: ["negociando"] })).status).toBe(200);
  });

  it("o Gestor edita (a linha do kanban é dele também desde 03/10)", async () => {
    usuario = "u-gestor";
    expect((await postEtiquetas({ id: "lead-1", incluir: ["negociando"] })).status).toBe(200);
  });

  it("o Comercial edita o lead dele", async () => {
    usuario = "u-ana";
    banco.leads[0].responsavel = "Ana";
    expect((await postEtiquetas({ id: "lead-1", incluir: ["negociando"] })).status).toBe(200);
    expect(banco.leads[0].etiquetas).toContain("negociando");
  });

  it("o Comercial no lead de outro vendedor: 404, e nada gravado", async () => {
    usuario = "u-ana";
    const r = await postEtiquetas({ id: "lead-1", incluir: ["negociando"] });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "Lead não encontrado" });
    expect(rpcs).toHaveLength(0);
    expect(banco.leads[0].etiquetas).toEqual(["origem-site", "quer-comprar"]);
  });

  it("lead sem responsável: SDR, Comercial e Gestor levam 404; o Admin etiqueta", async () => {
    for (const quem of ["u-sdr", "u-ana", "u-duplo", "u-gestor"]) {
      usuario = quem;
      const r = await postEtiquetas({ id: "lead-novo", incluir: ["negociando"] });
      expect(r.status, quem).toBe(404);
    }
    expect(rpcs).toHaveLength(0);
    expect(banco.leads[2].etiquetas).toEqual(["sem-dono"]);

    usuario = "u-admin";
    expect((await postEtiquetas({ id: "lead-novo", incluir: ["negociando"] })).status).toBe(200);
    expect(banco.leads[2].etiquetas).toEqual(["sem-dono", "negociando"]);
  });

  it("lead que não existe: o mesmo 404", async () => {
    const r = await postEtiquetas({ id: "lead-fantasma", incluir: ["negociando"] });
    expect(r.status).toBe(404);
    expect(rpcs).toHaveLength(0);
  });

  it.each([
    ["sem sessão", null, 401],
    ["cliente da Garagem", "u-cliente", 403],
    ["Marketing (vê só o volume)", "u-mkt", 403],
  ])("%s não edita", async (_caso, quem, status) => {
    usuario = quem;
    const r = await postEtiquetas({ id: "lead-1", incluir: ["negociando"] });
    expect(r.status).toBe(status);
    expect(rpcs).toHaveLength(0);
  });
});

describe("GET /api/leads/etiquetas — o que o card oferece", () => {
  it("as que estão nos leads que se enxerga, em ordem", async () => {
    usuario = "u-admin";
    banco.leads[1].etiquetas = ["negociando", "resgate", "Reaquecido"];
    const d = await (await etiquetas.GET()).json();
    expect(d).toEqual({
      // Sem as duas da passagem, que não entram à mão.
      etiquetas: ["negociando", "origem-site", "quer-comprar", "sem-dono"],
      daConta: true,
      faltamNaConta: [],
    });
  });

  it("obedece ao escopo: o SDR não vê a etiqueta do lead sem responsável, nem o vendedor a do lead de outro", async () => {
    expect((await (await etiquetas.GET()).json()).etiquetas).toEqual(["origem-site", "quer-comprar"]);
    usuario = "u-ana";
    expect((await (await etiquetas.GET()).json()).etiquetas).toEqual([]);
  });

  it("leitura falhou: lista vazia e o motivo", async () => {
    falhas.leads = { message: "sem permissão" };
    const d = await (await etiquetas.GET()).json();
    expect(d).toEqual({ etiquetas: [], daConta: false, aviso: "sem permissão" });
  });

  it("Marketing não lê", async () => {
    usuario = "u-mkt";
    expect((await etiquetas.GET()).status).toBe(403);
  });
});
