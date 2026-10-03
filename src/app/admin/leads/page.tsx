import { Suspense } from "react";
import LeadsKanban from "../../../components/admin/LeadsKanban";
import { visaoDeLeads } from "../../../lib/escopoDeLeads";
import { createServerSupabaseClient } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Leads | Motors Store",
  description: "Contatos enviados pelo site, por etapa de atendimento.",
};

/**
 * A tela de leads. A porta é a do layout do painel (e a do proxy); quais leads
 * cada um vê é regra de `GET /api/leads/gerenciar`.
 *
 * O que esta página acrescenta é o NOME de quem está logado: "Minha fila" são
 * os leads cujo responsável é esse nome (`responsavel` é texto, e não chave
 * para `profiles`), e a resposta da fila não o traz. Aparado como em
 * `visaoDeLeads`, que é como o rodízio o grava. Sem nome, a tela não oferece
 * "Minha fila".
 *
 * O `Suspense` é exigência de `useSearchParams`, que o quadro usa para a
 * vista, o escopo e o lead aberto.
 */
export default async function LeadsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let meuNome: string | null = null;
  if (user) {
    const { data: perfil } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
    meuNome = visaoDeLeads([], perfil?.full_name).meuNome;
  }

  return (
    <Suspense fallback={<div className="py-16 text-center text-xs text-mt-neutral-700">Carregando leads…</div>}>
      <LeadsKanban meuNome={meuNome} />
    </Suspense>
  );
}
