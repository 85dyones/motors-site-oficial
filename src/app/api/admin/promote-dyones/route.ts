import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseServiceKey) {
    return NextResponse.json({ 
      error: "SUPABASE_SERVICE_ROLE_KEY não está configurada no ambiente da Vercel." 
    }, { status: 500 });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // List all users to find dyones@gmail.com
    const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      return NextResponse.json({ 
        error: "Falha ao listar usuários do Supabase Auth", 
        details: listError.message 
      }, { status: 500 });
    }

    const targetUser = usersData.users.find(u => u.email?.toLowerCase() === "dyones@gmail.com");

    if (!targetUser) {
      return NextResponse.json({ 
        error: "Usuário dyones@gmail.com não foi encontrado no Supabase Auth.", 
        usuariosDisponiveis: usersData.users.map(u => ({ id: u.id, email: u.email })) 
      }, { status: 404 });
    }

    // Upsert the profile table to set role = 'admin'
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: targetUser.id,
        email: targetUser.email,
        role: "admin",
        is_active: true,
        full_name: "Dyones"
      }, { onConflict: "id" })
      .select();

    if (profileError) {
      return NextResponse.json({ 
        error: "Falha ao inserir/atualizar a tabela de perfis (profiles)", 
        details: profileError.message 
      }, { status: 500 });
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: "Usuário dyones@gmail.com promovido a Administrador com sucesso!",
      dadosUsuario: {
        id: targetUser.id,
        email: targetUser.email,
      },
      perfilAtualizado: profile
    });
  } catch (error: any) {
    return NextResponse.json({ 
      error: "Erro interno no script de promoção", 
      details: error.message 
    }, { status: 500 });
  }
}
