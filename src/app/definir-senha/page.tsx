import Link from "next/link";
import { createServerSupabaseClient } from "../../lib/supabase-server";
import { ehStaff } from "../../lib/permissoes";
import DefinirSenhaForm from "../../components/DefinirSenhaForm";
import { Rotulo } from "../../components/modernist/primitivos";

export const metadata = {
  title: "Definir senha — Motors Store",
  description: "Escolha da senha de acesso.",
  // Página de acesso, atrás de link de uso único: não entra em busca.
  robots: { index: false, follow: false },
};

/**
 * Onde o convite termina: a pessoa escolhe a própria senha.
 *
 * A sessão já existe — `/api/auth/confirm` verificou o `token_hash` do
 * convite (`type=invite`) antes de mandar para cá. Esta página não aceita
 * token nenhum por parâmetro: sem sessão, não há o que definir, e a saída é
 * pedir um convite novo. É por isso que ela não vira superfície de ataque
 * mesmo sendo pública.
 *
 * O destino depois de salvar sai do PAPEL, como em toda porta de auth do
 * projeto: equipe vai ao painel, cliente vai à Garagem.
 */
export default async function DefinirSenhaPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex min-h-[70vh] w-full flex-col items-center justify-center bg-mt-bg px-[18px] py-16 font-modernist text-mt-ink">
        <div className="flex w-full max-w-[380px] flex-col gap-6">
          <div className="border-t-2 border-mt-regua pt-6">
            <Rotulo accent className="text-[11px] tracking-[.18em]">
              LINK VENCIDO
            </Rotulo>
            <h1 className="mt-titulo m-0 mt-3 text-[30px]">Este link não vale mais</h1>
          </div>
          <p className="m-0 text-[14px] leading-relaxed text-mt-neutral-700">
            Convites e links de acesso valem uma vez só. Peça um novo a quem cuida
            do painel — ou, se você é cliente Motors, peça o seu link na{" "}
            <Link href="/garagem" className="font-semibold text-mt-ink underline underline-offset-2">
              Garagem
            </Link>
            .
          </p>
          <p className="m-0 border-t border-mt-regua-fina pt-4 text-[12px] leading-relaxed text-mt-neutral-600">
            Já tem senha?{" "}
            <Link href="/login" className="font-semibold text-mt-ink underline underline-offset-2">
              Entrar no painel
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, papeis")
    .eq("id", user.id)
    .single();

  const destino = ehStaff(profile) ? "/admin" : "/garagem";

  return (
    <div className="flex min-h-[70vh] w-full flex-col items-center justify-center bg-mt-bg px-[18px] py-16 font-modernist text-mt-ink">
      <div className="flex w-full max-w-[380px] flex-col gap-8">
        <div className="flex items-center gap-2.5 select-none">
          <span className="h-6 w-2 shrink-0 bg-mt-accent" aria-hidden="true" />
          <span className="text-[17px] font-extrabold tracking-[.02em]">
            MOTORS<span className="font-normal text-mt-neutral-600"> STORE</span>
          </span>
        </div>

        <div className="border-t-2 border-mt-regua pt-6">
          <Rotulo accent className="text-[11px] tracking-[.18em]">
            PRIMEIRO ACESSO
          </Rotulo>
          <h1 className="mt-titulo m-0 mt-3 text-[30px]">Escolha sua senha</h1>
        </div>

        <DefinirSenhaForm destino={destino} email={user.email ?? ""} />
      </div>
    </div>
  );
}
