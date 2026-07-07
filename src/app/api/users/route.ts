import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "../../../lib/supabase-server";

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
      .select("role")
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
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
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

      return NextResponse.json({ user: data.user });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
