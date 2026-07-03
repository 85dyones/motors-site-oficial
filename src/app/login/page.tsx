import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../lib/supabase-server";
import LoginForm from "../../components/LoginForm";

export const metadata = {
  title: "Acesso Restrito — Motors Showcase",
  description: "Área administrativa e painel de controle.",
};

export default async function LoginPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();

  // Redirect if already authenticated
  if (session) {
    redirect("/admin/configuracoes");
  }

  return (
    <main className="min-h-screen w-full bg-brand-bg text-brand-text flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration elements */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-brand-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-brand-primary/5 blur-[120px] pointer-events-none" />

      <div className="z-10 w-full flex flex-col items-center gap-6">
        {/* Dealership Logo Placeholder/Text */}
        <div className="flex flex-col items-center gap-1 select-none">
          <span className="text-2xl font-black tracking-widest text-brand-text uppercase">
            MOTORS
          </span>
          <div className="h-[2px] w-8 bg-brand-primary rounded-full" />
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
