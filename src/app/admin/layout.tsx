import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../lib/supabase-server";
import SidebarNav from "../../components/admin/SidebarNav";
import LogoutButton from "../../components/admin/LogoutButton";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  // Fallback role: default to admin if email matches standard motors email, else comercial
  const role = profile?.role ?? (user.email === "motors@motorsstoreoficial.com.br" ? "admin" : "comercial");
  const fullName = profile?.full_name ?? user.email?.split("@")[0] ?? "Usuário";

  const getRoleLabel = (r: string) => {
    switch (r) {
      case "admin": return "Administrador";
      case "financeiro": return "Financeiro";
      case "comercial": return "Comercial";
      default: return "Colaborador";
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text flex relative overflow-hidden font-sans">
      {/* Sidebar background styling */}
      <aside className="w-64 border-r border-brand-border/40 bg-brand-bg flex flex-col justify-between p-6 shrink-0 relative z-20">
        <div className="flex flex-col gap-8">
          {/* Logo / Header */}
          <div className="flex flex-col gap-1 select-none">
            <span className="text-xl font-black tracking-widest text-brand-text uppercase">
              MOTORS
            </span>
            <span className="text-[9px] font-bold text-brand-gold uppercase tracking-[0.15em] block">
              Painel de Controle
            </span>
            <div className="h-[2px] w-8 bg-brand-primary rounded-full mt-1" />
          </div>

          {/* Navigation Links */}
          <SidebarNav role={role} />
        </div>

        {/* User Card info inside sidebar */}
        <div className="flex flex-col gap-4 border-t border-brand-border/40 pt-4 mt-auto">
          <div className="flex flex-col pl-1">
            <span className="text-xs font-bold text-brand-text truncate">
              {fullName}
            </span>
            <span className="text-[9px] font-semibold text-brand-gold uppercase tracking-wider mt-0.5">
              {getRoleLabel(role)}
            </span>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-grow flex flex-col min-h-screen overflow-y-auto relative z-10">
        {/* Main Content Header */}
        <header className="h-16 border-b border-brand-border/40 bg-brand-bg px-8 flex items-center justify-end shrink-0 select-none">
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-bold text-brand-text/40 tracking-wider uppercase">
              Motors Showcase v2.0
            </span>
          </div>
        </header>

        {/* Content body wrapper */}
        <main className="flex-grow p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
