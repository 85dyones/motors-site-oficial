import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "../../../../lib/supabase-server";

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
      .select("role")
      .eq("id", currentUser.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Acesso proibido" }, { status: 403 });
    }

    const body = await request.json();
    const { full_name, role, is_active } = body;

    const hasAdminKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (hasAdminKey) {
      const supabaseAdmin = createAdminSupabaseClient();

      // 1. Update auth.users metadata
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, {
        user_metadata: { full_name, role }
      });

      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 500 });
      }

      // 2. Update public.profiles table
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          full_name,
          role,
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
          role,
          is_active,
          updated_at: new Date().toISOString()
        })
        .eq("id", id);

      if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 500 });
      }
    }

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
      .select("role")
      .eq("id", currentUser.id)
      .single();

    if (profile?.role !== "admin") {
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

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
