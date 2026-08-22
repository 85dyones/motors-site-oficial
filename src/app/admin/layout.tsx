import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createServerSupabaseClient } from "../../lib/supabase-server";
import SidebarNav from "../../components/admin/SidebarNav";
import AdminLayoutClientWrapper from "../../components/admin/AdminLayoutClientWrapper";
import { papelPadraoPorEmail } from "../../lib/papelPadrao";
import { ehInvestidor, perfisDe } from "../../lib/permissoes";

export const dynamic = "force-dynamic";

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
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, papeis, full_name")
    .eq("id", user.id)
    .single();

  if (profileError) {
    console.error("[AdminLayout] Profile fetch error:", profileError.message);
  }

  // Todos os papéis de painel (multi-papel, 2026-08-19): o trilho mostra a
  // união dos grupos. Sem linha em `profiles`, vale o padrão por e-mail.
  const perfis = perfisDe(profile ?? papelPadraoPorEmail(user.email));

  // Cliente da Garagem não tem nada no /admin — o proxy já barra, e o
  // layout barra de novo: defesa em profundidade custa uma linha.
  if (perfis.length === 0) {
    // Investidor tem para onde ir; cliente e desconhecido, não. Mesmo destino
    // que o proxy escolhe — as duas camadas precisam concordar, senão o
    // usuário quica entre elas.
    redirect(ehInvestidor(profile) ? "/investidor" : "/");
  }

  // O primeiro papel de PAINEL é o que o rodapé exibe — para quem tem
  // `{cliente, comercial}`, mostrar "cliente" mentiria sobre o acesso.
  const role = perfis[0];

  const fullName = profile?.full_name ?? user.email?.split("@")[0] ?? "Usuário";

  const getRoleLabel = (r: string) => {
    switch (r) {
      case "admin": return "Administrador";
      case "financeiro": return "Financeiro";
      case "comercial": return "Comercial";
      case "marketing": return "Marketing";
      default: return "Colaborador";
    }
  };

  return (
    <AdminLayoutClientWrapper
      role={role}
      fullName={fullName}
      roleLabel={getRoleLabel(role)}
      sidebarNav={
        <Suspense fallback={<div className="m-5 h-40 animate-pulse bg-mt-inverso-regua-fina" />}>
          <SidebarNav perfis={perfis} />
        </Suspense>
      }
    >
      {children}
    </AdminLayoutClientWrapper>
  );
}
