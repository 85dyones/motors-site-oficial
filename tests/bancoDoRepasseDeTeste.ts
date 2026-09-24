import { vi } from "vitest";

/**
 * Dublê do supabase-js para as rotas e páginas do repasse — no molde do de
 * `tests/funil-config-rota.test.ts`, com o que as rotas do repasse usam.
 *
 * `leituras[tabela]` responde a qualquer select daquela tabela. Toda escrita
 * (insert, update, delete, upsert) entra em `escritas`, com os filtros `eq`
 * e `is` encadeados depois dela, e é respondida por `responderEscrita`. O
 * padrão para `update` devolve a linha lida com os valores novos por cima —
 * é o que o `.select("*").maybeSingle()` da rota recebe quando a corrida
 * não aconteceu.
 */
export interface Resposta {
  data: unknown;
  error: { message: string; code?: string } | null;
}

export interface Escrita {
  tabela: string;
  operacao: "insert" | "update" | "delete" | "upsert";
  valores?: unknown;
  opcoes?: unknown;
  filtros: Array<[string, unknown]>;
}

export function bancoDeTeste() {
  const leituras: Record<string, Resposta> = {};
  const escritas: Escrita[] = [];
  const lidas: string[] = [];

  const padrao = (e: Escrita): Resposta =>
    e.operacao === "update"
      ? { data: { ...((leituras[e.tabela]?.data as object | null) ?? {}), ...(e.valores as object) }, error: null }
      : { data: null, error: null };
  let responder: (e: Escrita) => Resposta = padrao;

  function consulta(tabela: string, escrita: Escrita | null) {
    const resolver = (): Resposta => (escrita ? responder(escrita) : (leituras[tabela] ?? { data: null, error: null }));
    const q: Record<string, unknown> = {};
    const encadeia =
      (nome: string) =>
      (...args: unknown[]) => {
        if (escrita && (nome === "eq" || nome === "is")) escrita.filtros.push([String(args[0]), args[1]]);
        return q;
      };
    for (const nome of ["select", "eq", "is", "in", "order", "limit"]) q[nome] = encadeia(nome);
    q.single = async () => resolver();
    q.maybeSingle = async () => resolver();
    q.then = (ok: (r: Resposta) => unknown, falha?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, falha);
    return q;
  }

  const from = vi.fn((tabela: string) => {
    lidas.push(tabela);
    const escrever =
      (operacao: Escrita["operacao"]) =>
      (valores?: unknown, opcoes?: unknown) => {
        const e: Escrita = { tabela, operacao, valores, opcoes, filtros: [] };
        escritas.push(e);
        return consulta(tabela, e);
      };
    return {
      ...consulta(tabela, null),
      insert: escrever("insert"),
      update: escrever("update"),
      delete: escrever("delete"),
      upsert: escrever("upsert"),
    };
  });

  return {
    cliente: { from },
    leituras,
    escritas,
    /** Tabelas que alguém abriu com `from`, na ordem. */
    lidas,
    responderEscrita(fn: (e: Escrita) => Resposta) {
      responder = fn;
    },
    /** Escritas numa tabela, fora a auditoria. */
    escritasEm(tabela: string) {
      return escritas.filter((e) => e.tabela === tabela);
    },
    auditoria() {
      return escritas
        .filter((e) => e.tabela === "auditoria_admin")
        .map((e) => e.valores as { acao: string; detalhe: string });
    },
  };
}

export type Banco = ReturnType<typeof bancoDeTeste>;

/**
 * O cliente de SESSÃO: `auth.getUser` e as leituras. Usa o mesmo banco do
 * admin — nos testes, o que importa é quem pede e o que a rota escreve.
 */
export function sessaoDeTeste(
  banco: Banco,
  papeis: string[] | null,
  usuario: { id: string; email: string } | null = { id: "u-1", email: "equipe@motors.test" },
) {
  banco.leituras.profiles = {
    data: papeis ? { role: papeis[0] ?? null, papeis, full_name: "Pessoa da Equipe" } : null,
    error: null,
  };
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: usuario } })) },
    from: banco.cliente.from,
  };
}
