import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../lib/supabase-server";
import LoginForm from "../../components/LoginForm";
import { Rotulo } from "../../components/modernist/primitivos";

export const metadata = {
  title: "Acesso Restrito — Motors Store",
  description: "Área administrativa e painel de controle.",
  // Página de acesso interno não tem por que aparecer em busca.
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();

  // Já autenticado entra direto na Visão geral, que é a porta do painel.
  if (session) {
    redirect("/admin");
  }

  return (
    // `<div>`, não `<main>`: o layout raiz já abre um `<main>`.
    // Sem os halos desfocados que existiam aqui — o sistema Modernist não
    // usa sombra nem brilho para organizar; usa régua.
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
            ACESSO RESTRITO
          </Rotulo>
          <h1 className="mt-titulo m-0 mt-3 text-[30px]">Painel</h1>
        </div>

        <LoginForm />

        {/* Cliente que caiu aqui por hábito: a área dele é outra, sem senha. */}
        <p className="m-0 border-t border-mt-regua-fina pt-4 text-[12px] leading-relaxed text-mt-neutral-600">
          Cliente Motors? O seu acesso é pela{" "}
          <a href="/garagem" className="font-semibold text-mt-ink underline underline-offset-2">
            Garagem
          </a>
          , com link por e-mail — sem senha.
        </p>
      </div>
    </div>
  );
}
