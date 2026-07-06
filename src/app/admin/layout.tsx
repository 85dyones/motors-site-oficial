import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createServerSupabaseClient } from "../../lib/supabase-server";
import SidebarNav from "../../components/admin/SidebarNav";
import AdminLayoutClientWrapper from "../../components/admin/AdminLayoutClientWrapper";

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
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (profileError) {
    console.error("[AdminLayout] Profile fetch error:", profileError.message);
  }

  // Fallback role: default to admin if email matches standard motors email or dyones@gmail.com, else comercial
  const role = profile?.role ?? (
    (user.email === "motors@motorsstoreoficial.com.br" || user.email?.toLowerCase() === "dyones@gmail.com") 
      ? "admin" 
      : "comercial"
  );
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
    <AdminLayoutClientWrapper
      role={role}
      fullName={fullName}
      roleLabel={getRoleLabel(role)}
      sidebarNav={
        <Suspense fallback={<div className="h-40 animate-pulse bg-brand-card/30 rounded-xl" />}>
          <SidebarNav role={role} />
        </Suspense>
      }
    >
      {children}
    </AdminLayoutClientWrapper>
  );
}
