import { notFound, redirect } from "next/navigation";
import EditorDeRepasse from "../../../../components/admin/repasse/EditorDeRepasse";
import PedidosDeExame from "../../../../components/admin/repasse/PedidosDeExame";
import { COLUNAS_DO_INSCRITO, inscritoDaLinha, type InscritoDoRepasse } from "../../../../lib/avisosDoRepasse";
import { validaRepasse } from "../../../../lib/edicaoDoRepasse";
import { papelPadraoPorEmail } from "../../../../lib/papelPadrao";
import { CANAL_DO_PEDIDO_DE_EXAME, COLUNAS_DO_PEDIDO_DE_EXAME, pedidoDeExameDaLinha } from "../../../../lib/pedidosDeExame";
import { ehStaff, perfisDe } from "../../../../lib/permissoes";
import { ehIdDeRepasse } from "../../../../lib/repasse";
import { repasseDoPainelDaLinha } from "../../../../lib/repasseDoPainel";
import { urlDoSite } from "../../../../lib/site";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Carro de repasse — Motors Store",
};

/**
 * O editor de um carro de repasse. Lê com a SESSÃO: a RLS dá o carro a
 * qualquer perfil da equipe e a lista só a quem valida — e a página nem pede
 * a lista a quem não valida, para o WhatsApp de ninguém viajar em prop de
 * client component à toa.
 */
export default async function RepassePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  // Os pedidos de exame deste carro (spec §4.4). Com a SESSÃO: `leads` é
  // lida por toda a equipe (`leads_leitura_staff`), a mesma régua do Kanban.
  // Pelo carro E pelo canal: o WhatsApp do repasse também grava `repasse_id`
  // (28/09), e contato não é pedido de horário.
  const { data: linhasDosPedidos } = await supabase
    .from("leads")
    .select(COLUNAS_DO_PEDIDO_DE_EXAME)
    .eq("repasse_id", id)
    .eq("canal", CANAL_DO_PEDIDO_DE_EXAME)
    .order("created_at", { ascending: false })
    .limit(50);
  const pedidos = ((linhasDosPedidos ?? []) as unknown as Record<string, unknown>[]).flatMap((linha) => {
    const pedido = pedidoDeExameDaLinha(linha);
    return pedido ? [pedido] : [];
  });

  let inscritos: InscritoDoRepasse[] | null = null;
  let avisados: string[] = [];
  if (validaRepasse(perfis) && repasse.situacao === "publicado") {
    const [lista, avisos] = await Promise.all([
      supabase.from("repasse_inscritos").select(COLUNAS_DO_INSCRITO).order("created_at"),
      supabase.from("repasse_avisos").select("inscrito_id").eq("repasse_id", id),
    ]);
    inscritos = ((lista.data ?? []) as Record<string, unknown>[]).flatMap((linha) => {
      const inscrito = inscritoDaLinha(linha);
      return inscrito ? [inscrito] : [];
    });
    avisados = ((avisos.data ?? []) as Array<{ inscrito_id: unknown }>).map((a) => String(a.inscrito_id));
  }

  return (
    <>
      <EditorDeRepasse
        repasse={repasse}
        perfis={perfis}
        inscritos={inscritos}
        avisados={avisados}
        urlDaFicha={urlDoSite(`/repasse/${repasse.slug}`)}
      />
      <PedidosDeExame pedidos={pedidos} />
    </>
  );
}
