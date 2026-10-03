import { vi } from "vitest";

/**
 * Dublê do supabase-js para as rotas e páginas do repasse — no molde do de
 * `tests/funil-config-rota.test.ts`, com o que as rotas do repasse usam.
 *
 * `leituras[tabela]` responde a qualquer select daquela tabela. Toda escrita
 * (insert, update, delete, upsert) entra em `escritas`, com os filtros `eq`,
 * `is` e `in` encadeados depois dela, e é respondida por `responderEscrita`. O
 * padrão para `update` devolve a linha lida com os valores novos por cima —
 * é o que o `.select("*").maybeSingle()` da rota recebe quando a corrida
 * não aconteceu.
 *
 * `neq` e `not` (o que `comEscopoDeLeads` encadeia desde 03/10/2026) entram
 * nos mesmos `filtros`, com o operador no nome da coluna para não se
 * confundirem com um `eq`: `["responsavel:neq", ""]` e
 * `["responsavel:not.is", null]`. `casaComOsFiltros` lê os três.
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

/** Uma leitura: a tabela, os filtros encadeados, as colunas e o `limit`. */
export interface Leitura {
  tabela: string;
  filtros: Array<[string, unknown]>;
  colunas?: unknown;
  limite?: number;
}

export function bancoDeTeste() {
  const leituras: Record<string, Resposta> = {};
  const escritas: Escrita[] = [];
  const lidas: string[] = [];
  /**
   * Uma entrada por `from`, com os `eq`/`is`/`in` encadeados na LEITURA e as
   * colunas do `select` dela (sem isso, esquecer uma coluna no `select`
   * passaria: `leituras` devolve a linha inteira de qualquer jeito).
   */
  const consultas: Leitura[] = [];
  /**
   * Quem quiser que a leitura dependa da consulta (filtros e limite, como o
   * banco faria) registra aqui um leitor para a tabela; sem leitor, vale
   * `leituras[tabela]`, que devolve o mesmo para qualquer consulta.
   */
  const leitores: Record<string, (c: Leitura) => Resposta> = {};

  const padrao = (e: Escrita): Resposta =>
    e.operacao === "update"
      ? { data: { ...((leituras[e.tabela]?.data as object | null) ?? {}), ...(e.valores as object) }, error: null }
      : { data: null, error: null };
  let responder: (e: Escrita) => Resposta = padrao;

  function consulta(tabela: string, escrita: Escrita | null, leitura?: Leitura) {
    const resolver = (): Resposta =>
      escrita
        ? responder(escrita)
        : leitura && leitores[tabela]
          ? leitores[tabela](leitura)
          : (leituras[tabela] ?? { data: null, error: null });
    const q: Record<string, unknown> = {};
    const encadeia =
      (nome: string) =>
      (...args: unknown[]) => {
        if (nome === "select" && leitura) leitura.colunas = args[0];
        if (nome === "limit" && leitura) leitura.limite = Number(args[0]);
        // `in` também: "um canal OU outro" é filtro da consulta, e a prova de
        // que a página não lê o carro inteiro está nele.
        const filtro: [string, unknown] | null =
          nome === "eq" || nome === "is" || nome === "in"
            ? [String(args[0]), args[1]]
            : nome === "neq"
              ? [`${String(args[0])}:neq`, args[1]]
              : nome === "not"
                ? [`${String(args[0])}:not.${String(args[1])}`, args[2]]
                : null;
        if (filtro) {
          if (escrita) escrita.filtros.push(filtro);
          else leitura?.filtros.push(filtro);
        }
        return q;
      };
    for (const nome of ["select", "eq", "neq", "not", "is", "in", "order", "limit", "like"]) q[nome] = encadeia(nome);
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
      ...(() => {
        const leitura: Leitura = { tabela, filtros: [] };
        consultas.push(leitura);
        return consulta(tabela, null, leitura);
      })(),
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
    consultas,
    responderEscrita(fn: (e: Escrita) => Resposta) {
      responder = fn;
    },
    responderLeitura(tabela: string, fn: (c: Leitura) => Resposta) {
      leitores[tabela] = fn;
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
 * A linha passa pelos filtros anotados, como passaria no banco? Para o leitor
 * que quer responder pela consulta (`responderLeitura`): igualdade, lista do
 * `in`, `neq` e `not is null`.
 */
export function casaComOsFiltros(linha: Record<string, unknown>, filtros: Array<[string, unknown]>): boolean {
  return filtros.every(([chave, valor]) => {
    const [coluna, operador] = chave.split(":");
    const tem = linha[coluna] ?? null;
    if (operador === "neq") return tem !== null && tem !== valor;
    if (operador === "not.is") return tem !== valor;
    if (operador !== undefined) throw new Error(`filtro que o dublê não conhece: ${chave}`);
    return Array.isArray(valor) ? valor.includes(tem) : tem === valor;
  });
}

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
