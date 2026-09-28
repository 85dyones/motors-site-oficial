/**
 * O que as duas páginas de um carro de repasse no painel leem — a visão
 * (`/admin/repasse/[id]`) e o editor (`/admin/repasse/[id]/editar`). Só
 * servidor.
 *
 * Tudo com a SESSÃO, como a página do editor sempre leu: a RLS dá o carro a
 * qualquer perfil da equipe, os leads a todo `is_staff`
 * (`leads_leitura_staff`) e a lista do repasse só a quem valida. A chave de
 * serviço não entra aqui.
 *
 * As portas são as de antes da divisão, na mesma ordem: id que não é uuid é
 * não encontrado antes do banco; sem sessão, login; quem não é da equipe volta
 * para a home; carro que não existe, não encontrado.
 */
import { notFound, redirect } from "next/navigation";
import { COLUNAS_DO_INSCRITO, inscritoDaLinha, type InscritoDoRepasse } from "./avisosDoRepasse";
import { validaRepasse } from "./edicaoDoRepasse";
import { papelPadraoPorEmail } from "./papelPadrao";
import {
  CANAIS_DOS_LEADS_DO_CARRO,
  COLUNAS_DOS_LEADS_DO_CARRO,
  leadsDoCarroNaTela,
  type LeadDoCarroNaTela,
} from "./pedidosDeExame";
import { ehStaff, perfisDe, type Perfil } from "./permissoes";
import { ehIdDeRepasse, type RepasseDoPainel } from "./repasse";
import { repasseDoPainelDaLinha } from "./repasseDoPainel";
import { CAMINHO_DO_REPASSE } from "./repasseNaNavegacao";
import { urlDoSite } from "./site";
import { createServerSupabaseClient } from "./supabase-server";

type Sessao = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export interface CarroNoPainel {
  supabase: Sessao;
  perfis: Perfil[];
  repasse: RepasseDoPainel;
  /** A ficha pública, com o domínio: vai na mensagem de aviso e no "Ver no site". */
  urlDaFicha: string;
}

export async function abrirCarroNoPainel(id: string): Promise<CarroNoPainel> {
  if (!ehIdDeRepasse(id)) notFound();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, papeis").eq("id", user.id).single();
  const origem = profile ?? papelPadraoPorEmail(user.email);
  if (!ehStaff(origem)) redirect("/");
  const perfis = perfisDe(origem);

  const { data } = await supabase.from("repasses").select("*").eq("id", id).maybeSingle();
  const repasse = data ? repasseDoPainelDaLinha(data as Record<string, unknown>) : null;
  if (!repasse) notFound();

  return { supabase, perfis, repasse, urlDaFicha: urlDoSite(`${CAMINHO_DO_REPASSE}/${repasse.slug}`) };
}

/**
 * A lista que veio, ou null quando não deu para ler — tabela ausente antes da
 * migração do funil, por exemplo. Null nas etapas é o que liga a queda para
 * o funil de sempre (`leadsDoCarroNaTela`).
 */
function lista<T>(r: { data: unknown; error: unknown }): T[] | null {
  return r.error || !Array.isArray(r.data) ? null : (r.data as T[]);
}

/**
 * Os pedidos de exame e os contatos pelo WhatsApp deste carro, cada um com o
 * desfecho. Uma leitura por tabela, em paralelo: `leads` pelo carro E pelos
 * dois canais (os outros canais nunca gravam `repasse_id`, mas a leitura não
 * conta com isso), e as etapas e os motivos do funil para dar nome à chave
 * que o lead guarda. Todos os motivos, ativos ou não: o desfecho de ontem
 * pode ter um motivo que o dono desativou hoje.
 */
export async function lerLeadsDoCarro(
  supabase: Sessao,
  id: string,
): Promise<{ pedidos: LeadDoCarroNaTela[]; contatos: LeadDoCarroNaTela[] }> {
  const [leads, etapas, motivos] = await Promise.all([
    supabase
      .from("leads")
      .select(COLUNAS_DOS_LEADS_DO_CARRO)
      .eq("repasse_id", id)
      .in("canal", [...CANAIS_DOS_LEADS_DO_CARRO])
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("funil_etapas").select("chave, rotulo").order("ordem"),
    supabase.from("funil_motivos").select("chave, rotulo"),
  ]);
  return leadsDoCarroNaTela({
    linhas: lista<Record<string, unknown>>(leads) ?? [],
    etapas: lista<{ chave: string; rotulo: string }>(etapas),
    motivos: lista<{ chave: string; rotulo: string }>(motivos),
  });
}

/**
 * "Quem avisar" (spec §6): só para quem valida, num carro publicado. Quem não
 * valida nem pede a lista, para o WhatsApp de ninguém viajar em prop de
 * client component à toa.
 */
export async function lerQuemAvisar(
  supabase: Sessao,
  repasse: RepasseDoPainel,
  perfis: Perfil[],
): Promise<{ inscritos: InscritoDoRepasse[] | null; avisados: string[] }> {
  if (!validaRepasse(perfis) || repasse.situacao !== "publicado") return { inscritos: null, avisados: [] };
  const [lista, avisos] = await Promise.all([
    supabase.from("repasse_inscritos").select(COLUNAS_DO_INSCRITO).order("created_at"),
    supabase.from("repasse_avisos").select("inscrito_id").eq("repasse_id", repasse.id),
  ]);
  const inscritos = ((lista.data ?? []) as Record<string, unknown>[]).flatMap((linha) => {
    const inscrito = inscritoDaLinha(linha);
    return inscrito ? [inscrito] : [];
  });
  const avisados = ((avisos.data ?? []) as Array<{ inscrito_id: unknown }>).map((a) => String(a.inscrito_id));
  return { inscritos, avisados };
}
