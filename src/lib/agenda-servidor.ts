import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "./supabase-server";
import { ehStaff, perfisDe, type Perfil } from "./permissoes";
import { visaoDeLeads, type VisaoDeLeads } from "./escopoDeLeads";
import { podeGerenciarAgenda, podeVerAgenda } from "./agenda";

/**
 * A porta da agenda de pessoas: a página `/admin/clientes` e as rotas de
 * `/api/pessoas` perguntam aqui quem está pedindo.
 *
 * Módulo de servidor: lê a sessão. Nunca num client component.
 *
 * Decisão do dono em 05/10/2026: *"A agenda precisa ser vista por todos, o
 * lead não. São coisas diferentes."*
 *
 *   LER ........ toda a equipe ativa (admin, gestor, marketing, comercial,
 *                financeiro, sdr).
 *   ESCREVER ... quem já escrevia: admin, gestor, comercial e financeiro.
 *                Marketing e SDR leem e não escrevem.
 *
 * Até aqui a única tranca de aplicação era o proxy, que fechava a agenda
 * inteira ao Marketing e ao SDR; as rotas só conferiam se havia sessão. Com a
 * leitura aberta, a rota de escrita precisa da própria recusa: sem ela, a RLS
 * de cada cadastro passaria a ser a única coisa entre o Marketing e um
 * cadastro novo.
 *
 * `is_active` precisa ser `true`: a sessão de quem saiu da loja pode seguir
 * viva, e `ehStaff` não olha o campo. Coluna ausente conta como desativado
 * (a mesma régua de `sessaoDeLeads` e de `passeDaEquipe`).
 */

type ClienteDaSessao = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export interface QuemAbreAAgenda {
  perfis: Perfil[];
  /** Cadastra, edita, desativa e exclui. Falso para Marketing e SDR. */
  podeGerenciar: boolean;
  /** O que esta pessoa enxerga de LEADS: decide etapa, anotações e link. */
  visao: VisaoDeLeads;
}

export const AVISO_DE_AGENDA_SO_LEITURA =
  "Seu perfil consulta a agenda, mas não cadastra nem altera. Peça a quem é do Comercial, do Financeiro ou da gestão.";

/**
 * Quem é, a partir da linha de `profiles` (com `is_active`). `null` para quem
 * não é da equipe, está desativado ou não tem a linha de leitura na matriz.
 */
export function quemAbreAAgenda(
  profile:
    | { role?: string | null; papeis?: string[] | null; full_name?: string | null; is_active?: boolean | null }
    | null
    | undefined,
): QuemAbreAAgenda | null {
  if (!ehStaff(profile) || profile?.is_active !== true) return null;
  const perfis = perfisDe(profile);
  if (!podeVerAgenda(perfis)) return null;
  return {
    perfis,
    podeGerenciar: podeGerenciarAgenda(perfis),
    visao: visaoDeLeads(perfis, profile?.full_name),
  };
}

interface SessaoAceita extends QuemAbreAAgenda {
  supabase: ClienteDaSessao;
  userId: string;
  recusa: null;
}
interface SessaoRecusada {
  supabase: ClienteDaSessao;
  recusa: NextResponse;
}

/**
 * A sessão de uma rota da agenda.
 *
 *   401 .. sem sessão
 *   403 .. não é da equipe, ou perfil desativado
 *   403 .. `escrita` pedida por quem só lê (Marketing, SDR)
 */
export async function sessaoDaAgenda(
  modo: "leitura" | "escrita",
): Promise<SessaoAceita | SessaoRecusada> {
  const supabase = await createServerSupabaseClient();
  const recusar = (error: string, status: number): SessaoRecusada => ({
    supabase,
    recusa: NextResponse.json({ error }, { status }),
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return recusar("Não autorizado", 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, papeis, full_name, is_active")
    .eq("id", user.id)
    .single();

  const quem = quemAbreAAgenda(profile);
  if (!quem) return recusar("Acesso restrito à equipe", 403);
  if (modo === "escrita" && !quem.podeGerenciar) return recusar(AVISO_DE_AGENDA_SO_LEITURA, 403);

  return { supabase, userId: user.id, ...quem, recusa: null };
}
