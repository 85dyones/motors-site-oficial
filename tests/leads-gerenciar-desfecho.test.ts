import { describe, it, expect, vi, beforeEach } from "vitest";
import { ETAPAS_PADRAO, ehTipoDeDesfecho, type MotivoDoFunil } from "../src/lib/funil";

/**
 * O PATCH de `/api/leads/gerenciar`, EXECUTADO — a porta de trás do desfecho.
 *
 * Decisão do dono em 16/09: fechar negócio exige motivo "na tela e na API".
 * `tests/funil.test.ts` chama `decidirDesfecho` com dublês e prova a regra.
 * Este arquivo prova a outra metade, que nenhuma chamada da função alcança:
 * que a rota pergunta a ela, obedece à recusa, lê o lead para saber se é
 * TRANSIÇÃO e grava o que ela devolveu. Um desvio na rota — um `if` a mais
 * antes da chamada, a recusa ignorada, os campos esquecidos — roda aqui.
 *
 * O banco é um dublê em memória: um lead, as etapas da semente e uma lista de
 * motivos. Nada aqui abre conexão.
 */

const CLIENTE = { auth: { getUser: vi.fn() }, from: vi.fn(), rpc: vi.fn() };
vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => CLIENTE }));

const { PATCH } = await import("../src/app/api/leads/gerenciar/route");

const ID = "lead-1";

const motivo = (
  chave: string,
  tipo: MotivoDoFunil["tipo"],
  extra: Partial<MotivoDoFunil> = {},
): MotivoDoFunil => ({ chave, rotulo: chave, tipo, ordem: 1, ativo: true, escopo: "ambos", ...extra });

const MOTIVOS: MotivoDoFunil[] = [
  motivo("a_vista", "ganho"),
  motivo("credito_reprovado", "perdido", { escopo: "compra" }),
  motivo("recusou_consignacao", "perdido", { escopo: "avaliacao" }),
  motivo("sem_resposta", "perdido"),
  motivo("motivo_aposentado", "perdido", { ativo: false }),
  motivo("spam", "descartado"),
];

/** O estado do banco que cada teste ajusta. */
let lead: { situacao: string; canal: string | null } | null;
/** O que a rota mandou gravar em `leads`, na ordem. */
let gravacoes: Record<string, unknown>[];
/** As tabelas lidas depois da checagem de permissão. */
let lidas: string[];
/** O `id` com que a rota procurou o lead. */
let idProcurado: unknown;

/** Um construtor de consulta do supabase-js: encadeia, e resolve no fim. */
function consulta(resolver: (filtros: Record<string, unknown>) => unknown) {
  const filtros: Record<string, unknown> = {};
  const q: any = {
    select: () => q,
    eq: (coluna: string, valor: unknown) => {
      filtros[coluna] = valor;
      return q;
    },
    single: async () => ({ data: resolver(filtros), error: null }),
    maybeSingle: async () => ({ data: resolver(filtros), error: null }),
    then: (ok: any, falha: any) =>
      Promise.resolve({ data: resolver(filtros), error: null }).then(ok, falha),
  };
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
  lead = { situacao: "proposta", canal: "Formulário Contato" };
  gravacoes = [];
  lidas = [];
  idProcurado = undefined;

  CLIENTE.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  CLIENTE.from.mockImplementation((tabela: string) => {
    if (tabela === "profiles") {
      return consulta(() => ({ role: "comercial", papeis: ["comercial"] }));
    }
    lidas.push(tabela);
    if (tabela === "funil_etapas") {
      return consulta((f) => ETAPAS_PADRAO.find((e) => e.chave === f.chave) ?? null);
    }
    if (tabela === "funil_motivos") {
      return consulta(() => MOTIVOS);
    }
    if (tabela === "leads") {
      return {
        select: () =>
          consulta((f) => {
            idProcurado = f.id;
            return lead;
          }),
        update: (campos: Record<string, unknown>) => {
          gravacoes.push(campos);
          return { eq: async () => ({ error: null }) };
        },
      };
    }
    throw new Error(`tabela inesperada: ${tabela}`);
  });
});

const chamar = (corpo: Record<string, unknown>) =>
  PATCH(
    new Request("http://x/api/leads/gerenciar", {
      method: "PATCH",
      body: JSON.stringify({ id: ID, ...corpo }),
      headers: { "content-type": "application/json" },
    }) as any,
  );

describe("PATCH /api/leads/gerenciar — fechar o negócio exige motivo", () => {
  it("recusa com 400 fechar sem motivo, nos TRÊS desfechos, e não grava nada", async () => {
    const terminais = ETAPAS_PADRAO.filter((e) => ehTipoDeDesfecho(e.tipo));
    expect(terminais.map((e) => e.tipo)).toContain("descartado");

    for (const etapa of terminais) {
      gravacoes = [];
      const r = await chamar({ situacao: etapa.chave });
      expect(r.status, `${etapa.chave} sem motivo`).toBe(400);
      const corpo = await r.json();
      expect(corpo.motivo_obrigatorio).toBe(true);
      expect(corpo.error).toContain(etapa.rotulo);
      expect(gravacoes, `${etapa.chave} gravou sem motivo`).toEqual([]);
    }
  });

  it("recusa com 400 o motivo de outro tipo, o inexistente, o desativado e o de outro escopo", async () => {
    const casos: Array<Record<string, unknown> & { diz: string }> = [
      { situacao: "descartado", desfecho_motivo: "sem_resposta", diz: "perda" },
      { situacao: "perdido", desfecho_motivo: "inventado", diz: "inventado" },
      { situacao: "perdido", desfecho_motivo: "motivo_aposentado", diz: "desativado" },
      // O lead padrão chegou pelo formulário: é de compra.
      { situacao: "perdido", desfecho_motivo: "recusou_consignacao", diz: "vender" },
    ];
    for (const { diz, ...corpo } of casos) {
      gravacoes = [];
      const r = await chamar(corpo);
      expect(r.status, JSON.stringify(corpo)).toBe(400);
      const resposta = await r.json();
      expect(resposta.motivo_obrigatorio).toBe(false);
      expect(resposta.error).toContain(diz);
      expect(gravacoes, `${JSON.stringify(corpo)} gravou`).toEqual([]);
    }
  });

  it("o escopo é o do lead NO BANCO: avaliação aceita o motivo de quem vende e recusa o de quem compra", async () => {
    lead = { situacao: "novo", canal: "Avaliação" };

    const deCompra = await chamar({ situacao: "perdido", desfecho_motivo: "credito_reprovado" });
    expect(deCompra.status).toBe(400);
    expect(gravacoes).toEqual([]);

    const deAvaliacao = await chamar({ situacao: "perdido", desfecho_motivo: "recusou_consignacao" });
    expect(deAvaliacao.status).toBe(200);
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].desfecho_motivo).toBe("recusou_consignacao");
    expect(idProcurado).toBe(ID);
  });

  it("com o motivo certo grava a etapa e o desfecho juntos", async () => {
    const r = await chamar({ situacao: "descartado", desfecho_motivo: "spam", desfecho_nota: " robô " });
    expect(r.status).toBe(200);
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0]).toMatchObject({
      situacao: "descartado",
      desfecho_motivo: "spam",
      desfecho_valor: null,
      desfecho_nota: "robô",
    });
  });

  it("só na TRANSIÇÃO: o lead já fechado sem motivo continua editável", async () => {
    // Produção tem descartes fechados antes de a caixa perguntar o motivo.
    lead = { situacao: "descartado", canal: null };

    const outroCampo = await chamar({ responsavel: "Ana" });
    expect(outroCampo.status).toBe(200);

    // Mesmo reenviando a etapa em que ele já está: não é mudança de etapa.
    const mesmaEtapa = await chamar({ situacao: "descartado", observacoes: "legado" });
    expect(mesmaEtapa.status).toBe(200);

    expect(gravacoes).toHaveLength(2);
    expect(gravacoes[0]).toMatchObject({ responsavel: "Ana" });
    expect(gravacoes[1]).toMatchObject({ situacao: "descartado", observacoes: "legado" });
    for (const g of gravacoes) expect(g).not.toHaveProperty("desfecho_motivo");
  });

  it("mover entre etapas em andamento grava direto, sem ler lead nem motivo", async () => {
    const r = await chamar({ situacao: "em_contato" });
    expect(r.status).toBe(200);
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0]).toMatchObject({ situacao: "em_contato" });
    expect(lidas.filter((t) => t !== "funil_etapas" && t !== "leads")).toEqual([]);
    expect(idProcurado, "leu o lead para uma etapa que não cobra nada").toBeUndefined();
  });
});
