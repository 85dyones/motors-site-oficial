import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "../../../lib/supabase-server";
import { dispatchAdminWebhook } from "../../../lib/webhook-dispatcher";
import { registrarAcaoSensivel } from "../../../lib/auditoria";
import { PERFIS } from "../../../lib/permissoes";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Acesso proibido" }, { status: 403 });
    }

    const { data: users, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ users });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", currentUser.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Acesso proibido" }, { status: 403 });
    }

    const body = await request.json();
    const { email, password, full_name, role } = body;

    if (!email || !password || !full_name || !role) {
      return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
    }

    // O vocabulário de perfis é o da matriz A17 — `role` era texto livre e
    // um typo aqui criava um usuário que nenhum gate reconhece.
    if (!(PERFIS as readonly string[]).includes(role)) {
      return NextResponse.json({ error: `Perfil inválido: ${role}` }, { status: 400 });
    }

    const hasAdminKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (hasAdminKey) {
      const supabaseAdmin = createAdminSupabaseClient();
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
          role,
        },
        // O papel viaja em app_metadata: é o que handle_new_user lê desde a
        // migração da role cliente — user_metadata é gravável pelo usuário.
        app_metadata: { role },
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Trigger admin webhook for new user (non-blocking)
      if (data.user) {
        dispatchAdminWebhook("usuario_criado", {
          id: data.user.id,
          email: data.user.email,
          full_name: full_name,
          role: role
        }).catch((err) =>
          console.error("[WebhookDispatch] Failed to dispatch user created event:", err.message)
        );
        await registrarAcaoSensivel(supabase, "usuario_criado", `${email} como ${role}`, {
          id: currentUser.id,
          nome: profile?.full_name ?? currentUser.email,
        });
      }

      return NextResponse.json({ user: data.user });
    } else {
      // Fallback: If SUPABASE_SERVICE_ROLE_KEY is not defined, register the user using signUp
      // through the user client. Since this is run inside the API handler by an Admin,
      // it won't affect the administrator's front-end session.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${request.nextUrl.origin}/auth/callback`,
          data: {
            full_name,
            role,
          }
        }
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Trigger admin webhook for new user (non-blocking)
      if (data.user) {
        dispatchAdminWebhook("usuario_criado", {
          id: data.user.id,
          email: data.user.email,
          full_name: full_name,
          role: role
        }).catch((err) =>
          console.error("[WebhookDispatch] Failed to dispatch user created event (fallback):", err.message)
        );
        await registrarAcaoSensivel(supabase, "usuario_criado", `${email} como ${role}`, {
          id: currentUser.id,
          nome: profile?.full_name ?? currentUser.email,
        });
      }

      return NextResponse.json({ user: data.user });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
