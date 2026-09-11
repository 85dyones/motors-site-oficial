import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "./supabase-server";
import { ehStaff } from "./permissoes";
import { ehTabelaOuColunaAusente, mensagemDeMigracaoPendente } from "./erroDeSchema";
import {
  POR_PAGINA_NO_DETALHE,
  SELECT_DA_LISTA,
  SELECT_DO_DETALHE,
  agruparErros,
  cargaDeResolucao,
  ehHashDeAgrupamento,
  podeTriarErros,
  type FiltrosDaFila,
  type OcorrenciaDaLista,
  type OcorrenciaDoDetalhe,
  type ResultadoDaFila,
  type ResultadoDoGrupo,
} from "./filaDeErros";

/**
 * As consultas da `/admin/erros` — o lado que fala com o banco.
 *
 * ---------------------------------------------------------------------------
 * Cliente de SESSÃO, nunca a chave de serviço
 * ---------------------------------------------------------------------------
 * `createServerSupabaseClient` carrega o cookie de quem está logado, então a RLS
 * de `erros` (`is_staff(auth.uid()) and org_id = org_padrao()`) se aplica a cada
 * leitura. `createAdminSupabaseClient` passaria por cima dela — e numa tela que
 * existe para mostrar o que o sistema errou, ignorar a régua do sistema seria a
 * escolha errada por dois motivos: no dia da segunda org a fila mostraria erro
 * dos outros, e a policy deixaria de ter quem a exercite.
 *
 * O arquivo é separado de `filaDeErros.ts` porque aquele é importado pelo
 * `SidebarNav`, que roda no navegador — ver o cabeçalho de lá.
 *
 * ---------------------------------------------------------------------------
 * Egress: o que sobe na consulta é o que se paga
 * ---------------------------------------------------------------------------
 * O plano é Free e este projeto já apertou a cota. `SELECT_DA_LISTA` não tem
 * `stack` (teto de 8000 caracteres); `SELECT_DO_DETALHE` tem, e por isso vem
 * paginado de 20 em 20. As contagens usam `head: true`/`count`, que viajam no
 * cabeçalho `Content-Range` e não custam linha nenhuma.
 */

/* ────────────────────────────────────────────────────────────────────────
   A porta — mesma régua para a página e para a rota
   ──────────────────────────────────────────────────────────────────────── */

export type Autorizacao =
  | { ok: true; supabase: SupabaseClient; uid: string }
  | { ok: false; status: 401 | 403; motivo: string };

/**
 * Autentica e decide, uma vez só, para a página e para a rota de resolver.
 *
 * Devolve o próprio cliente de sessão para quem chamou seguir usando: abrir um
 * segundo faria um segundo `auth.getUser()` — ida e volta à rede — para
 * responder o que já se sabe.
 */
export async function autorizarTriagemDeErros(): Promise<Autorizacao> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, motivo: "Não autenticado" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, papeis")
    .eq("id", user.id)
    .single();

  // `ehStaff` é redundante diante de `podeTriarErros` — admin é staff, e
  // `perfisDe` devolve `[]` para quem não é da equipe. Fica porque diz a
  // intenção em voz alta: a régua de cliente/investidor é do CLAUDE.md, e não
  // desta lista de papéis, que pode crescer.
  if (!ehStaff(profile) || !podeTriarErros(profile)) {
    return { ok: false, status: 403, motivo: "Esta fila é da administração." };
  }

  return { ok: true, supabase, uid: user.id };
}

/* ────────────────────────────────────────────────────────────────────────
   Leitura da lista
   ──────────────────────────────────────────────────────────────────────── */

/**
 * A janela mais recente do recorte, já agrupada.
 *
 * `count: "exact"` acompanha a consulta porque o rodapé precisa dizer quantas
 * ficaram de fora — e contagem sem consulta por trás é número inventado, que é
 * o que o cabeçalho do `SidebarNav` proíbe.
 */
export async function lerFilaDeErros(
  supabase: SupabaseClient,
  filtros: FiltrosDaFila,
): Promise<ResultadoDaFila> {
  let consulta = supabase
    .from("erros")
    .select(SELECT_DA_LISTA, { count: "exact" })
    .order("criado_em", { ascending: false })
    .range(0, filtros.janela - 1);

  if (filtros.origem) consulta = consulta.eq("origem", filtros.origem);
  if (filtros.ambiente) consulta = consulta.eq("ambiente", filtros.ambiente);
  if (filtros.digest) consulta = consulta.eq("digest", filtros.digest);
  if (filtros.estado === "abertos") consulta = consulta.is("resolvido_em", null);

  const { data, error, count } = await consulta;

  if (error) {
    if (ehTabelaOuColunaAusente(error)) {
      return { ok: false, motivo: mensagemDeMigracaoPendente("20260910120000_erros_do_site.sql") };
    }
    return { ok: false, motivo: error.message || "Não foi possível ler a fila de erros." };
  }

  const linhas = (data ?? []) as unknown as OcorrenciaDaLista[];
  const grupos = agruparErros(linhas);

  // Só quando não há o que mostrar: é a única hora em que a diferença entre
  // "vazio por causa do filtro" e "vazio de verdade" muda o texto da tela.
  // `head: true` não traz linha nenhuma — a resposta é só o cabeçalho de
  // contagem.
  let totalSemRecorte: number | null = null;
  if (grupos.length === 0) {
    const { count: total } = await supabase
      .from("erros")
      .select("id", { count: "exact", head: true });
    totalSemRecorte = total ?? 0;
  }

  return {
    ok: true,
    grupos,
    lidas: linhas.length,
    totalNoRecorte: count ?? null,
    totalSemRecorte,
    ambientesVistos: [...new Set(linhas.map((l) => l.ambiente).filter(Boolean))].sort(),
  };
}

/* ────────────────────────────────────────────────────────────────────────
   Leitura do detalhe
   ──────────────────────────────────────────────────────────────────────── */

/**
 * As ocorrências de um grupo, da mais recente para a mais antiga, **com stack**.
 *
 * Paginado de verdade (`range`), porque aqui cada linha pode pesar 8 KB e
 * porque um grupo de página quente tem centenas delas. Quem quiser mais, pede.
 */
export async function lerGrupoDeErros(
  supabase: SupabaseClient,
  hash: string,
  opcoes: { pagina?: number; digest?: string } = {},
): Promise<ResultadoDoGrupo> {
  const pagina = Math.max(1, Math.floor(opcoes.pagina ?? 1));
  const de = (pagina - 1) * POR_PAGINA_NO_DETALHE;

  let consulta = supabase
    .from("erros")
    .select(SELECT_DO_DETALHE, { count: "exact" })
    .eq("hash_agrupamento", hash)
    .order("criado_em", { ascending: false })
    .range(de, de + POR_PAGINA_NO_DETALHE - 1);

  if (opcoes.digest) consulta = consulta.eq("digest", opcoes.digest);

  const { data, error, count } = await consulta;

  if (error) {
    if (ehTabelaOuColunaAusente(error)) {
      return { ok: false, motivo: mensagemDeMigracaoPendente("20260910120000_erros_do_site.sql") };
    }
    return { ok: false, motivo: error.message || "Não foi possível ler o grupo." };
  }

  const ocorrencias = (data ?? []) as unknown as OcorrenciaDoDetalhe[];

  // Contagem, não linhas: `head: true` traz só o cabeçalho `Content-Range`. É o
  // estado do GRUPO INTEIRO, e não o desta página — é ele que decide se o botão
  // oferece "resolver" ou "reabrir".
  const { count: abertas } = await supabase
    .from("erros")
    .select("id", { count: "exact", head: true })
    .eq("hash_agrupamento", hash)
    .is("resolvido_em", null);

  return {
    ok: true,
    ocorrencias,
    total: count ?? null,
    pagina,
    abertas: abertas ?? null,
    digestsNaPagina: [...new Set(ocorrencias.map((o) => o.digest).filter(Boolean))] as string[],
  };
}

/* ────────────────────────────────────────────────────────────────────────
   A única escrita
   ──────────────────────────────────────────────────────────────────────── */

export type ResultadoDaResolucao =
  | { ok: true; linhas: number }
  | { ok: false; motivo: string };

/**
 * Marca (ou desmarca) o GRUPO inteiro.
 *
 * O grupo é a unidade de triagem: resolver uma ocorrência e deixar as outras
 * duzentas abertas não seria uma decisão, seria um clique sem efeito. E o
 * carimbo só cai em quem ainda está aberto — reaplicar "resolver" não reescreve
 * a hora nem o autor de quem fechou antes.
 *
 * A carga vem de `cargaDeResolucao`, que devolve exatamente `resolvido_em` e
 * `resolvido_por`. Qualquer coluna a mais faria o Postgres recusar o lote
 * inteiro: o grant da tabela é por coluna, e é assim de propósito.
 *
 * ⚠️ `count: "exact"` é o que torna a RLS audível. Sem ele, uma policy que
 * recuse devolve 200, `error` nulo e zero linha alterada — a tela diria
 * "resolvido" sem nada ter mudado no banco. Com ele, `linhas === 0` é um
 * desfecho que o chamador tem de explicar.
 */
export async function resolverGrupoDeErros(
  supabase: SupabaseClient,
  entrada: { hash: string; resolver: boolean; uid: string },
): Promise<ResultadoDaResolucao> {
  if (!ehHashDeAgrupamento(entrada.hash)) {
    return { ok: false, motivo: "Identificador de grupo inválido." };
  }

  const carga = cargaDeResolucao(entrada.resolver, entrada.uid);

  let consulta = supabase
    .from("erros")
    .update(carga, { count: "exact" })
    .eq("hash_agrupamento", entrada.hash);

  consulta = entrada.resolver
    ? consulta.is("resolvido_em", null)
    : consulta.not("resolvido_em", "is", null);

  const { error, count } = await consulta;

  if (error) {
    if (ehTabelaOuColunaAusente(error)) {
      return { ok: false, motivo: mensagemDeMigracaoPendente("20260910120000_erros_do_site.sql") };
    }
    return { ok: false, motivo: error.message || "Não foi possível gravar a triagem." };
  }

  return { ok: true, linhas: count ?? 0 };
}
