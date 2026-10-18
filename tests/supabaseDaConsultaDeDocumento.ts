/**
 * Dublê do supabase-js para a consulta de CPF e CNPJ (18/10/2026) — só o que
 * `lib/consultaDeDocumento-servidor.ts` e as rotas dela encadeiam: `select`
 * (com as opções `count`/`head`), `insert`, `update`, os filtros (`eq`, `neq`,
 * `or`, `is`, `gt`, `gte`, `like`, `ilike`), `order`, `limit`,
 * `single`/`maybeSingle`, a espera direta (`await` na cadeia) e `rpc`.
 *
 * Cada cadeia vira uma `Chamada` em `chamadas`, com a tabela, a operação, os
 * valores escritos e os filtros na ordem em que vieram; quem responde é
 * `responder`, que o teste escreve. Assim o teste confere o que foi pedido ao
 * banco (e o que NÃO foi), e não só o que a função devolveu.
 *
 * Na `rpc`, `tabela` é o nome da função e `valores` são os argumentos.
 */
export interface Chamada {
  tabela: string;
  operacao: "select" | "insert" | "update" | "rpc";
  colunas?: string;
  /** As opções do `select` (`{ count: "exact", head: true }`). */
  opcoes?: Record<string, unknown>;
  valores?: unknown;
  filtros: Array<[string, ...unknown[]]>;
  fim: "single" | "maybeSingle" | null;
}

export interface Resposta {
  data: unknown;
  error: { message: string; code?: string } | null;
  /** Só nas contagens (`select(..., { count: "exact", head: true })`). */
  count?: number | null;
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
      select(colunas?: string, opcoesDoSelect?: Record<string, unknown>) {
        if (c.operacao === "select") {
          c.colunas = colunas;
          if (opcoesDoSelect) c.opcoes = opcoesDoSelect;
        }
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
      neq: filtro("neq"),
      or: filtro("or"),
      is: filtro("is"),
      gt: filtro("gt"),
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

/** A linha vigente de `parametros_consulta_documento` como a semente da migração a grava. */
export const LINHA_DOS_PARAMETROS = {
  dias_do_link: 7,
  dias_de_consulta_recente: 90,
  minutos_contra_repeticao: 30,
  links_ativos_por_consulta: 10,
  precos_de_referencia: {
    "cpf-lite": 0.12,
    "receita-federal": 0.34,
    "cpf-dados": 4.5,
    "analise-credito-plus-pf": 29.02,
    "acerta-essencial-positivo": 4.49,
    cnpj: 0.04,
    "cnpj-cadastral": 0.55,
    "cadastral-premium-pj": 3.75,
    "receita-federal-pj-v3": 6.35,
    "analise-credito-basic-pj": 10.06,
    "dossie-credito-pj": 4.4,
    "cadastral-score-pj": 1.3,
  },
  tabela_de_precos_em: "2026-10-18",
  fonte: "Tabela pública da APIBrasil",
};
