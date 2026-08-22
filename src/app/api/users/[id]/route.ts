import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "../../../../lib/supabase-server";
import { registrarAcaoSensivel } from "../../../../lib/auditoria";
import { PAPEIS_CONCEDIVEIS, perfisDe } from "../../../../lib/permissoes";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, papeis")
      .eq("id", currentUser.id)
      .single();

    // Ver a nota em /api/users: multi-papel soma, e `role` é só o primário.
    if (!perfisDe(profile).includes("admin")) {
      return NextResponse.json({ error: "Acesso proibido" }, { status: 403 });
    }

    const body = await request.json();
    const { full_name, role, papeis, is_active, telefone_e164 } = body;

    if (role !== undefined && !(PAPEIS_CONCEDIVEIS as readonly string[]).includes(role)) {
      return NextResponse.json({ error: `Perfil inválido: ${role}` }, { status: 400 });
    }

    // Multi-papel (2026-08-19). Validado aqui além do CHECK do banco para a
    // mensagem ser legível — o banco recusaria com "violates check
    // constraint", que não diz qual papel está errado.
    if (papeis !== undefined) {
      if (!Array.isArray(papeis) || papeis.length === 0) {
        return NextResponse.json(
          { error: "Escolha pelo menos um perfil." },
          { status: 400 },
        );
      }
      // `cliente` continua aceito na EDIÇÃO (o funcionário que também comprou
      // carro carrega os dois), mas não é oferecido para conceder — ver
      // `PAPEIS_CONCEDIVEIS`.
      const invalidos = papeis.filter(
        (p: string) => !(PAPEIS_CONCEDIVEIS as readonly string[]).includes(p) && p !== "cliente",
      );
      if (invalidos.length > 0) {
        return NextResponse.json(
          { error: `Perfil inválido: ${invalidos.join(", ")}` },
          { status: 400 },
        );
      }
      if (new Set(papeis).size !== papeis.length) {
        return NextResponse.json({ error: "Perfil repetido na lista." }, { status: 400 });
      }
    }

    // `papeis[1]` é o primário e espelha `role` — o trigger do banco cuida da
    // sincronia, mas o auth precisa do valor explícito.
    const papelPrimario = papeis !== undefined ? papeis[0] : role;

    const hasAdminKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (hasAdminKey) {
      const supabaseAdmin = createAdminSupabaseClient();

      // 1. Update auth.users metadata
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, {
        user_metadata: { full_name, role: papelPrimario },
        // Espelho em app_metadata: é de onde o trigger e os checks de papel
        // leem — user_metadata é gravável pelo próprio usuário.
        app_metadata: { role: papelPrimario }
      });

      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 500 });
      }

      // 2. Update public.profiles table
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          full_name,
          ...(papeis !== undefined ? { papeis } : role !== undefined ? { role } : {}),
          ...(telefone_e164 !== undefined ? { telefone_e164 } : {}),
          is_active,
          updated_at: new Date().toISOString()
        })
        .eq("id", id);

      if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 500 });
      }
    } else {
      // Fallback: If SUPABASE_SERVICE_ROLE_KEY is not defined, update only public.profiles
      // using the logged-in admin user's client (which has access due to RLS).
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name,
          ...(papeis !== undefined ? { papeis } : role !== undefined ? { role } : {}),
          ...(telefone_e164 !== undefined ? { telefone_e164 } : {}),
          is_active,
          updated_at: new Date().toISOString()
        })
        .eq("id", id);

      if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 500 });
      }
    }

    await registrarAcaoSensivel(
      supabase,
      "perfil_alterado",
      `${full_name ?? id} → ${papeis?.join(", ") ?? role ?? "sem mudança de perfil"}${is_active === false ? " · desativado" : ""}`,
      { id: currentUser.id, nome: currentUser.email },
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, papeis")
      .eq("id", currentUser.id)
      .single();

    // Ver a nota em /api/users: multi-papel soma, e `role` é só o primário.
    if (!perfisDe(profile).includes("admin")) {
      return NextResponse.json({ error: "Acesso proibido" }, { status: 403 });
    }

    // Admins cannot delete themselves
    if (currentUser.id === id) {
      return NextResponse.json({ error: "Você não pode excluir seu próprio usuário" }, { status: 400 });
    }

    const hasAdminKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (hasAdminKey) {
      const supabaseAdmin = createAdminSupabaseClient();
      const { error } = await supabaseAdmin.auth.admin.deleteUser(id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      // Fallback: If SUPABASE_SERVICE_ROLE_KEY is not defined, delete only from public.profiles
      // using the logged-in admin user's client (which has access due to RLS).
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("id", id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    await registrarAcaoSensivel(supabase, "usuario_excluido", `id ${id}`, {
      id: currentUser.id,
      nome: currentUser.email,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
