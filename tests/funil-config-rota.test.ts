import { describe, it, expect, vi, beforeEach } from "vitest";
import { ETAPAS_PADRAO, type EtapaDoFunil, type MotivoDoFunil } from "../src/lib/funil";

/**
 * O PUT de `/api/funil/config`, EXECUTADO — onde o beco do desfecho é barrado.
 *
 * Desde 16/09 fechar negócio exige motivo, e uma etapa terminal ativa sem
 * nenhum motivo ativo do mesmo tipo vira um botão que o card entra e não sai.
 * `validarFunil` recusa esse funil, e `tests/funil.test.ts` prova a função.
 * Este arquivo prova a fiação que só a rota tem: que ela julga o estado
 * DEPOIS de gravar (`motivosDepoisDeGravar`), que pula a regra quando a
 * leitura dos motivos não veio, e que recusa ANTES de gravar qualquer coisa.
 *
 * O banco é um dublê em memória. Nada aqui abre conexão.
 */

const CLIENTE = { auth: { getUser: vi.fn() }, from: vi.fn() };
vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => CLIENTE }));

const { PUT } = await import("../src/app/api/funil/config/route");

const motivo = (chave: string, tipo: MotivoDoFunil["tipo"]): MotivoDoFunil => ({
  chave,
  rotulo: chave,
  tipo,
  ordem: 1,
  ativo: true,
  escopo: "ambos",
});

/** O que está no banco: um motivo ativo de cada desfecho. */
const ATUAIS: MotivoDoFunil[] = [
  motivo("a_vista", "ganho"),
  motivo("preco", "perdido"),
  motivo("spam", "descartado"),
];

let leituraDosMotivos: { data: MotivoDoFunil[] | null; error: { message: string } | null };
/** Toda escrita que a rota tentou: tabela e operação. */
let escritas: string[];

/** Construtor de consulta do supabase-js: tudo encadeia, e o `await` resolve. */
function consulta(resposta: () => { data: unknown; error: unknown }) {
  const q: any = {
    select: () => q,
    eq: () => q,
    order: () => q,
    not: () => q,
    single: async () => resposta(),
    maybeSingle: async () => resposta(),
    then: (ok: any, falha: any) => Promise.resolve(resposta()).then(ok, falha),
  };
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
  leituraDosMotivos = { data: ATUAIS, error: null };
  escritas = [];

  CLIENTE.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  CLIENTE.from.mockImplementation((tabela: string) => {
    if (tabela === "profiles") {
      return consulta(() => ({ data: { role: "admin", papeis: ["admin"] }, error: null }));
    }
    const leitura =
      tabela === "funil_motivos"
        ? consulta(() => leituraDosMotivos)
        : consulta(() => ({ data: ETAPAS_PADRAO, error: null }));
    return {
      ...leitura,
      select: () => leitura,
      upsert: () => {
        escritas.push(`${tabela}.upsert`);
        return consulta(() => ({ data: null, error: null }));
      },
      update: () => {
        escritas.push(`${tabela}.update`);
        return consulta(() => ({ data: null, error: null }));
      },
    };
  });
});

const salvar = (etapas: EtapaDoFunil[], motivos: MotivoDoFunil[]) =>
  PUT(
    new Request("http://x/api/funil/config", {
      method: "PUT",
      body: JSON.stringify({ etapas, motivos }),
      headers: { "content-type": "application/json" },
    }) as any,
  );

describe("PUT /api/funil/config — o funil não salva com beco", () => {
  it("recusa (422) desativar o último motivo de descarte, e não grava NADA", async () => {
    // O dono tira o único motivo de descarte da tela. A rota desativaria o que
    // sumiu do corpo — então o funil ficaria sem saída pelo botão de descarte.
    const r = await salvar(
      ETAPAS_PADRAO,
      ATUAIS.filter((m) => m.tipo !== "descartado"),
    );
    expect(r.status).toBe(422);
    expect((await r.json()).error).toContain("Não é oportunidade");
    expect(escritas, "gravou antes de recusar").toEqual([]);
  });

  it("aceita o PUT que só mexe nas etapas — corpo sem motivo é 'não toque nos motivos'", async () => {
    const r = await salvar(ETAPAS_PADRAO, []);
    expect(r.status).toBe(200);
    expect(escritas).toContain("funil_etapas.upsert");
    expect(escritas).not.toContain("funil_motivos.upsert");
  });

  it("leitura dos motivos que falha ou volta vazia pula a regra, em vez de acusar beco", async () => {
    leituraDosMotivos = { data: null, error: { message: "permission denied" } };
    expect((await salvar(ETAPAS_PADRAO, [])).status).toBe(200);

    // A RLS deste projeto bloqueia assim: 200, lista vazia, erro nulo.
    leituraDosMotivos = { data: [], error: null };
    expect((await salvar(ETAPAS_PADRAO, [])).status).toBe(200);
  });

  it("recusa o funil em que a etapa de entrada virou desfecho", async () => {
    const r = await salvar(
      ETAPAS_PADRAO.map((e) => (e.chave === "novo" ? { ...e, tipo: "descartado" as const } : e)),
      ATUAIS,
    );
    expect(r.status).toBe(422);
    expect((await r.json()).error).toContain('"novo"');
    expect(escritas).toEqual([]);
  });

  it("recusa com 400 o motivo cujo nome não gera chave", async () => {
    const r = await salvar(ETAPAS_PADRAO, [
      ...ATUAIS,
      { ...motivo("", "descartado"), rotulo: "???" },
    ]);
    expect(r.status).toBe(400);
    expect(escritas).toEqual([]);
  });
});
