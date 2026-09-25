/**
 * O que toda rota do repasse faz antes e depois do portão puro — só servidor.
 *
 * Quem pede é lido com a SESSÃO; quem grava é a chave de serviço, porque
 * `authenticated` não escreve nas tabelas do repasse desde
 * 20260924200000_repasse_escrita_pela_rota.sql. Por isso a identificação
 * aqui é a porta inteira: sem sessão, 401; sem papel de painel, 403.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ehTabelaOuColunaAusente, mensagemDeMigracaoPendente } from "./erroDeSchema";
import type { RecusaDoPainel } from "./edicaoDoRepasse";
import { papelPadraoPorEmail } from "./papelPadrao";
import { ehStaff, perfisDe, type Perfil } from "./permissoes";
import { ehIdDeRepasse, type RepasseDoPainel } from "./repasse";
import { repasseDoPainelDaLinha } from "./repasseDoPainel";
import { createServerSupabaseClient } from "./supabase-server";

export const MIGRACAO_DO_REPASSE = "20260924180000_repasse_fundacao.sql";

export type SessaoDoRepasse =
  | { ok: true; autor: { id: string; nome: string | null }; perfis: Perfil[] }
  | { ok: false; resposta: NextResponse };

export async function sessaoDoRepasse(): Promise<SessaoDoRepasse> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, resposta: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, papeis, full_name, is_active")
    .eq("id", user.id)
    .single();
  // Quem foi desativado em /admin/usuarios não escreve mais. Desde
  // 20260924200000 a escrita sai com a chave de serviço, que passa por cima da
  // RLS; antes era a RLS (`is_staff`, que exige `is_active`) que barrava, e a
  // desativação não derruba a sessão no Auth. Linha ausente segue o fallback.
  if ((profile as { is_active?: boolean | null } | null)?.is_active === false) {
    return { ok: false, resposta: NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 }) };
  }
  // Sem linha em `profiles`, vale o papel padrão por e-mail — mesma regra do layout.
  const origem = profile ?? papelPadraoPorEmail(user.email);
  if (!ehStaff(origem)) {
    return { ok: false, resposta: NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 }) };
  }
  const nome = (profile as { full_name?: string | null } | null)?.full_name ?? user.email ?? null;
  return { ok: true, autor: { id: user.id, nome }, perfis: perfisDe(origem) };
}

export function recusar(r: RecusaDoPainel): NextResponse {
  return NextResponse.json({ error: r.erro, problemas: r.problemas ?? [] }, { status: r.status });
}

export function falhaDoBanco(erro: { message: string; code?: string }): NextResponse {
  if (ehTabelaOuColunaAusente(erro)) {
    return NextResponse.json({ error: mensagemDeMigracaoPendente(MIGRACAO_DO_REPASSE) }, { status: 503 });
  }
  return NextResponse.json({ error: erro.message }, { status: 500 });
}

const naoEncontrado = () => NextResponse.json({ error: "Carro de repasse não encontrado." }, { status: 404 });

export async function lerRepasseParaEscrita(
  admin: SupabaseClient,
  id: string,
): Promise<{ ok: true; repasse: RepasseDoPainel } | { ok: false; resposta: NextResponse }> {
  if (!ehIdDeRepasse(id)) return { ok: false, resposta: naoEncontrado() };
  const { data, error } = await admin.from("repasses").select("*").eq("id", id).maybeSingle();
  if (error) return { ok: false, resposta: falhaDoBanco(error) };
  const repasse = data ? repasseDoPainelDaLinha(data as Record<string, unknown>) : null;
  if (!repasse) return { ok: false, resposta: naoEncontrado() };
  return { ok: true, repasse };
}
