/**
 * A leitura da vigência de `parametros_financiamento` — só servidor.
 *
 * A tabela não é legível pela chave anônima (a RLS dá leitura só à equipe), e
 * o visitante do site não tem sessão. Quem lê é o servidor, com a chave de
 * serviço, e entrega os parâmetros prontos à página: a ficha do carro, a
 * `/financiamento`, o `/carro-perfeito` e a `/api/match`. É o mesmo desenho
 * de `parametrosDaAvaliacao.ts`.
 *
 * "Vigente" é a linha sem `vigencia_ate` e com `vigencia_desde` já alcançado
 * — e o índice `parametros_financiamento_um_vigente` garante que é uma só.
 *
 * A diferença para a avaliação está na falha. Lá, sem a curva do banco, a
 * avaliação sai sem sugestão — nenhuma régua inventada. Aqui a falha devolve
 * os valores de FÁBRICA (`PARAMETROS_DE_FABRICA`), que são o seed da tabela e
 * a última régua que o dono aprovou: tirar a parcela da ficha porque o banco
 * piscou esconderia do cliente a pergunta que mais decide a compra, e o texto
 * da tela continua dizendo que é simulação. O aviso no log é alto de
 * propósito: é a pista de que o painel parou de mandar no site.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { PARAMETROS_DE_FABRICA, type ParametrosDoFinanciamento } from "./finance-calculator";
import { lerLinhaDoFinanciamento, podeEditarFinanciamento } from "./parametrosDoFinanciamento";
import { ehStaff } from "./permissoes";
import { createServerSupabaseClient } from "./supabase-server";

/** A etiqueta do cache — a rota que grava a vigência nova a invalida. */
export const ETIQUETA_DO_FINANCIAMENTO = "parametros_financiamento";

/** O pedaço do cliente do Supabase que esta leitura usa. */
export interface ClienteDeLeitura {
  from: (tabela: string) => {
    select: (colunas: string) => {
      is: (coluna: string, valor: null) => {
        lte: (coluna: string, valor: string) => {
          order: (coluna: string, opcoes: { ascending: boolean }) => {
            limit: (n: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
          };
        };
      };
    };
  };
}

export async function lerParametrosDoFinanciamento(
  cliente: ClienteDeLeitura,
  hoje: Date = new Date(),
): Promise<ParametrosDoFinanciamento> {
  try {
    const dia = hoje.toISOString().slice(0, 10);
    const { data, error } = await cliente
      .from("parametros_financiamento")
      .select("*")
      .is("vigencia_ate", null)
      .lte("vigencia_desde", dia)
      .order("vigencia_desde", { ascending: false })
      .limit(1);
    if (error) {
      console.warn("[Financiamento] parametros_financiamento ilegível — simulando com os valores de fábrica:", error.message);
      return PARAMETROS_DE_FABRICA;
    }
    const parametros = lerLinhaDoFinanciamento(data?.[0]);
    if (!parametros) {
      console.warn("[Financiamento] Nenhuma vigência legível em parametros_financiamento — simulando com os valores de fábrica.");
      return PARAMETROS_DE_FABRICA;
    }
    return parametros;
  } catch (erro) {
    console.warn(
      "[Financiamento] Falha ao ler parametros_financiamento — simulando com os valores de fábrica:",
      (erro as Error)?.message,
    );
    return PARAMETROS_DE_FABRICA;
  }
}

/**
 * Os parâmetros vigentes, em cache de uma hora — e invalidados na hora em que
 * o painel grava uma vigência nova (`revalidateTag`), como `site_settings`.
 */
export const parametrosDoFinanciamento = unstable_cache(
  async (): Promise<ParametrosDoFinanciamento> => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !chave) {
      console.warn("[Financiamento] Sem NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY — simulando com os valores de fábrica.");
      return PARAMETROS_DE_FABRICA;
    }
    const cliente = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
    return lerParametrosDoFinanciamento(cliente as unknown as ClienteDeLeitura);
  },
  ["parametros-financiamento"],
  { revalidate: 3600, tags: [ETIQUETA_DO_FINANCIAMENTO] },
);

// ---------------------------------------------------------------------------
// O painel — /admin/financiamento e a rota que grava a vigência nova
// ---------------------------------------------------------------------------

export type AutorizacaoDoFinanciamento =
  | { ok: true; supabase: SupabaseClient; uid: string }
  | { ok: false; status: 401 | 403; motivo: string };

/**
 * Sessão e papel, na régua da matriz A17 ("Editar texto legal e condições de
 * financiamento": Administrador e Financeiro). Usa o cliente de SESSÃO: é ele
 * que faz `auth.uid()` valer dentro de `financiamento_nova_vigencia`, que
 * confere o papel de novo — a tela esconde, o banco recusa.
 */
export async function autorizarEdicaoDoFinanciamento(): Promise<AutorizacaoDoFinanciamento> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, motivo: "Não autenticado." };

  const { data: profile } = await supabase.from("profiles").select("role, papeis").eq("id", user.id).single();
  if (!ehStaff(profile) || !podeEditarFinanciamento(profile)) {
    return {
      ok: false,
      status: 403,
      motivo: "As condições do simulador são do Administrador e do Financeiro.",
    };
  }
  return { ok: true, supabase, uid: user.id };
}

/** Uma vigência, para a lista do painel. */
export interface VigenciaDoHistorico {
  id: string;
  parametros: ParametrosDoFinanciamento;
  vigenciaAte: string | null;
  descricao: string | null;
  criadoEm: string | null;
  /** Nome de quem gravou — `null` no seed e quando o perfil não se lê. */
  autor: string | null;
}

export type HistoricoDoFinanciamento =
  | { tabela: true; vigencias: VigenciaDoHistorico[] }
  /** A migração ainda não foi aplicada: a tela mostra os de fábrica e diz isso. */
  | { tabela: false; motivo: string };

/** As últimas vigências, a mais nova primeiro — a vigente é a sem `vigenciaAte`. */
export async function lerHistoricoDoFinanciamento(
  supabase: SupabaseClient,
  limite = 12,
): Promise<HistoricoDoFinanciamento> {
  const { data, error } = await supabase
    .from("parametros_financiamento")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (error) return { tabela: false, motivo: error.message };

  const linhas = (data ?? []) as Record<string, unknown>[];
  const autores = [...new Set(linhas.map((l) => l.criado_por).filter((x): x is string => typeof x === "string"))];
  const nomes = new Map<string, string>();
  if (autores.length > 0) {
    const { data: perfis } = await supabase.from("profiles").select("id, full_name, email").in("id", autores);
    for (const p of (perfis ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
      nomes.set(p.id, p.full_name || p.email || "");
    }
  }

  const vigencias: VigenciaDoHistorico[] = [];
  for (const l of linhas) {
    const parametros = lerLinhaDoFinanciamento(l);
    if (!parametros || typeof l.id !== "string") continue;
    vigencias.push({
      id: l.id,
      parametros,
      vigenciaAte: typeof l.vigencia_ate === "string" ? l.vigencia_ate : null,
      descricao: typeof l.descricao === "string" ? l.descricao : null,
      criadoEm: typeof l.criado_em === "string" ? l.criado_em : null,
      autor: typeof l.criado_por === "string" ? nomes.get(l.criado_por) || null : null,
    });
  }
  return { tabela: true, vigencias };
}
