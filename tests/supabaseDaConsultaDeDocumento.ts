/**
 * Dublê do supabase-js para a consulta de CPF e CNPJ (18/10/2026) — só o que
 * `lib/consultaDeDocumento-servidor.ts` e as rotas dela encadeiam: `select`,
 * `insert`, `update`, os filtros (`eq`, `is`, `gte`, `like`, `ilike`),
 * `order`, `limit`, `single`/`maybeSingle`, a espera direta (`await` na
 * cadeia) e `rpc`.
 *
 * Cada cadeia vira uma `Chamada` em `chamadas`, com a tabela, a operação, os
 * valores escritos e os filtros na ordem em que vieram; quem responde é
 * `responder`, que o teste escreve. Assim o teste confere o que foi pedido ao
 * banco (e o que NÃO foi), e não só o que a função devolveu.
 */
export interface Chamada {
  tabela: string;
  operacao: "select" | "insert" | "update" | "rpc";
  colunas?: string;
  valores?: unknown;
  filtros: Array<[string, ...unknown[]]>;
  fim: "single" | "maybeSingle" | null;
}

export interface Resposta {
  data: unknown;
  error: { message: string; code?: string } | null;
}

export function supabaseDeTeste(opcoes: {
  usuario?: { id: string } | null;
  perfil?: Record<string, unknown> | null;
  responder?: (c: Chamada) => Resposta;
}) {
  const chamadas: Chamada[] = [];
  const responder = opcoes.responder ?? (() => ({ data: null, error: null }));

  const resolver = (c: Chamada): Resposta => {
    chamadas.push(c);
    if (c.tabela === "profiles" && c.operacao === "select") return { data: opcoes.perfil ?? null, error: null };
    return responder(c);
  };

  const cadeia = (tabela: string) => {
    const c: Chamada = { tabela, operacao: "select", filtros: [], fim: null };
    const filtro =
      (nome: string) =>
      (...args: unknown[]) => {
        c.filtros.push([nome, ...args]);
        return api;
      };
    const api = {
      select(colunas?: string) {
        if (c.operacao === "select") c.colunas = colunas;
        return api;
      },
      insert(valores: unknown) {
        c.operacao = "insert";
        c.valores = valores;
        return api;
      },
      update(valores: unknown) {
        c.operacao = "update";
        c.valores = valores;
        return api;
      },
      eq: filtro("eq"),
      is: filtro("is"),
      gte: filtro("gte"),
      like: filtro("like"),
      ilike: filtro("ilike"),
      order: filtro("order"),
      limit: filtro("limit"),
      single() {
        c.fim = "single";
        return Promise.resolve(resolver(c));
      },
      maybeSingle() {
        c.fim = "maybeSingle";
        return Promise.resolve(resolver(c));
      },
      then<T>(aoCumprir: (r: Resposta) => T, aoFalhar?: (e: unknown) => T) {
        return Promise.resolve(resolver(c)).then(aoCumprir, aoFalhar);
      },
    };
    return api;
  };

  const cliente = {
    auth: { getUser: async () => ({ data: { user: opcoes.usuario ?? null } }) },
    from: (tabela: string) => cadeia(tabela),
    rpc: async (nome: string, args: unknown) => resolver({ tabela: nome, operacao: "rpc", valores: args, filtros: [], fim: null }),
  };

  return { cliente, chamadas };
}
