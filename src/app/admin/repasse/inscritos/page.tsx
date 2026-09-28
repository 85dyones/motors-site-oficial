import Link from "next/link";
import { redirect } from "next/navigation";
import TabelaDeInscritos from "../../../../components/admin/repasse/TabelaDeInscritos";
import { COLUNAS_DO_INSCRITO, inscritoDaLinha } from "../../../../lib/avisosDoRepasse";
import { validaRepasse } from "../../../../lib/edicaoDoRepasse";
import { papelPadraoPorEmail } from "../../../../lib/papelPadrao";
import { ehStaff, perfisDe } from "../../../../lib/permissoes";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lista do repasse — Motors Store",
};

/**
 * A lista do repasse: WhatsApp e CNPJ. Só quem valida abre (a RLS diz o
 * mesmo desde 20260924200000) — e quem não valida volta ANTES de a página
 * pedir a lista ao banco.
 */
export default async function InscritosPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, papeis").eq("id", user.id).single();
  const origem = profile ?? papelPadraoPorEmail(user.email);
  if (!ehStaff(origem)) redirect("/");
  if (!validaRepasse(perfisDe(origem))) redirect("/admin/repasse");

  const { data } = await supabase.from("repasse_inscritos").select(COLUNAS_DO_INSCRITO).order("created_at", { ascending: false });
  const inscritos = ((data ?? []) as Record<string, unknown>[]).flatMap((linha) => {
    const i = inscritoDaLinha(linha);
    return i ? [i] : [];
  });

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <div className="border-b-2 border-mt-regua pb-5">
        <Link href="/admin/repasse" className="text-[11px] font-extrabold tracking-[.1em] text-mt-neutral-700 no-underline hover:text-mt-accent">
          ← REPASSE
        </Link>
        <h1 className="mt-titulo mt-1 text-2xl md:text-3xl">Lista do repasse</h1>
        <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-mt-neutral-800">
          Quem pediu aviso de carro de repasse. Confira o CNPJ do lojista antes do primeiro aviso. Quem pedir para sair é
          apagado daqui.
        </p>
      </div>
      <TabelaDeInscritos inscritos={inscritos} />
    </div>
  );
}
