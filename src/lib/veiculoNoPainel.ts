import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "./supabase-server";
import { ehTabelaOuColunaAusente } from "./erroDeSchema";
import { historicoVisivel, type LinhaDeHistorico } from "./historicoDoVeiculo";
import { perfisDe, podeGravarCampo, type Perfil } from "./permissoes";
import { CAMPOS_NOSSOS } from "./estoqueEscrita";

/**
 * O veículo no painel, para as duas telas dele (01/10/2026): a visão só de
 * leitura em `/admin/estoque/[id]` e o editor em `/admin/estoque/[id]/editar`.
 * As duas abrem com as mesmas portas: a sessão (o layout do admin já a exigiu)
 * e todos os papéis de quem abriu.
 */
export async function abrirVeiculoNoPainel(id: string) {
  const supabase = await createServerSupabaseClient();

  // O id é bigint no banco e chega como string na URL.
  const alvo = /^\d+$/.test(id) ? Number(id) : id;
  const { data } = await supabase.from("estoque_motors").select("*").eq("id", alvo).maybeSingle();
  if (!data) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role, papeis").eq("id", user!.id).single();

  // Todos os papéis, não `normalizarPerfil(role)`: o primário sozinho
  // escondia campo que o segundo papel grava (regra 2-b).
  const perfis: Perfil[] = perfisDe(profile);
  return { supabase, veiculo: data, perfis };
}

/** Quem pode abrir o editor: quem grava ao menos um campo do painel. */
export function podeEditarOVeiculo(perfis: Perfil[]): boolean {
  return CAMPOS_NOSSOS.some((campo) => podeGravarCampo(perfis, campo));
}

/**
 * As últimas alterações, já sem o que esta pessoa não pode ler.
 * `null` quando a tabela não existe ou a leitura falhou: a tela diz isso em vez
 * de mostrar "nenhuma alteração".
 */
export async function lerHistoricoDoVeiculo(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  veiculoId: number | string,
  perfis: Perfil[],
  limite = 15,
): Promise<LinhaDeHistorico[] | null> {
  const { data, error } = await supabase
    .from("historico_veiculo")
    .select("*")
    .eq("veiculo_id", Number(veiculoId))
    .order("registrado_em", { ascending: false })
    .limit(limite);
  if (error) {
    if (!ehTabelaOuColunaAusente(error)) console.warn("[Painel] histórico do veículo não lido:", error.message);
    return null;
  }
  return historicoVisivel((data ?? []) as LinhaDeHistorico[], { podeVerCusto: podeGravarCampo(perfis, "preco_compra") });
}
