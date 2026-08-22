import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "../../../lib/supabase-server";
import { dispatchAdminWebhook } from "../../../lib/webhook-dispatcher";
import { registrarAcaoSensivel } from "../../../lib/auditoria";
import { PAPEIS_ATRIBUIVEIS, perfisDe } from "../../../lib/permissoes";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, papeis")
      .eq("id", user.id)
      .single();

    // Todos os papéis, não só o primário: desde o multi-papel (2026-08-19)
    // quem é admin em segundo lugar é admin — checar `role` sozinho trancava
    // essa pessoa para fora da tela que a própria matriz lhe dá.
    if (!perfisDe(profile).includes("admin")) {
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
  } catch (err: unknown) {
    const mensagem = err instanceof Error ? err.message : "Erro inesperado";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}

/**
 * Convida alguém para o painel — e NÃO define senha por ele.
 *
 * Até 2026-08-21 esta rota criava o usuário com uma "senha provisória"
 * digitada pelo admin na tela A17. Isso significava: nenhum e-mail saía do
 * Supabase (`email_confirm: true` mata o envio), a senha viajava por WhatsApp
 * ou era dita em voz alta, e não havia troca obrigatória na primeira entrada.
 * Quem cuida do painel conhecia a senha de todo mundo.
 *
 * `inviteUserByEmail` inverte isso: cria a conta SEM senha, manda o convite
 * (template "Invite user") e a pessoa escolhe a própria senha em
 * `/definir-senha`. O convite não suporta PKCE — a doc do próprio SDK avisa,
 * pelo mesmo motivo do link mágico: quem convida quase nunca está no navegador
 * que aceita. Por isso o template aponta para `/api/auth/confirm` com
 * `token_hash`, e não para `{{ .ConfirmationURL }}`.
 *
 * O papel entra em DOIS passos, e não em um: `inviteUserByEmail` só grava
 * `user_metadata`, e `handle_new_user` lê o papel de `app_metadata` — que
 * ainda está vazio quando o trigger roda. Sem o segundo passo, todo convidado
 * nasceria `cliente` e não entraria em lugar nenhum.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, papeis, full_name")
      .eq("id", currentUser.id)
      .single();

    // Como no GET: o gate soma os papéis, não olha só o primário.
    if (!perfisDe(profile).includes("admin")) {
      return NextResponse.json({ error: "Acesso proibido" }, { status: 403 });
    }

    const body = await request.json();
    const { email, full_name, role } = body;

    if (!email || !full_name || !role) {
      return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
    }

    // O vocabulário são os papéis atribuíveis — os quatro da matriz A17 mais
    // os de área própria (`cliente`, `investidor`). `role` era texto livre, e
    // um typo aqui criava um usuário que nenhum gate reconhece; aceitar só a
    // matriz, como até 2026-08-22, obrigava a convidar investidor sob um
    // perfil de painel emprestado — foi assim que um deles virou "comercial".
    if (!(PAPEIS_ATRIBUIVEIS as readonly string[]).includes(role)) {
      return NextResponse.json({ error: `Perfil inválido: ${role}` }, { status: 400 });
    }

    // Convidar é operação de chave de serviço. O fallback por `signUp` que
    // existia aqui até 2026-08-21 criava usuário QUEBRADO — sem app_metadata,
    // o trigger o fazia nascer `cliente` — e nem chegava a rodar com o
    // cadastro público desabilitado, que é como o painel deve ficar
    // (docs/AREA_DO_CLIENTE_AUTH.md §2-a). Falhar alto é melhor.
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY não configurada — o convite não pode ser enviado." },
        { status: 503 },
      );
    }

    const supabaseAdmin = createAdminSupabaseClient();

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { full_name, role },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const convidado = data.user;
    if (!convidado) {
      return NextResponse.json({ error: "O convite não retornou usuário." }, { status: 500 });
    }

    // Segundo passo do papel — ver o cabeçalho. `app_metadata` é a fonte que
    // `handle_new_user` lê, e o `profiles` já foi criado pelo trigger com
    // `cliente`, então os dois precisam ser corrigidos aqui.
    const { error: erroPapelAuth } = await supabaseAdmin.auth.admin.updateUserById(convidado.id, {
      app_metadata: { role },
    });

    const { error: erroPapelPerfil } = await supabaseAdmin
      .from("profiles")
      .update({ full_name, papeis: [role] })
      .eq("id", convidado.id);

    const erroDoPapel = erroPapelAuth ?? erroPapelPerfil;
    if (erroDoPapel) {
      // O e-mail já saiu — não há como desfazer. Devolver o estado real é
      // melhor do que apagar o convidado por conta própria: o perfil está na
      // lista e a própria tela sabe corrigir o papel.
      return NextResponse.json(
        {
          error:
            `Convite enviado para ${email}, mas o perfil ficou como cliente: ` +
            `${erroDoPapel.message}. Ajuste o perfil na lista antes de a pessoa entrar.`,
        },
        { status: 500 },
      );
    }

    // Trigger admin webhook for new user (non-blocking)
    dispatchAdminWebhook("usuario_criado", {
      id: convidado.id,
      email: convidado.email,
      full_name: full_name,
      role: role
    }).catch((err) =>
      console.error("[WebhookDispatch] Failed to dispatch user created event:", err.message)
    );
    await registrarAcaoSensivel(supabase, "usuario_criado", `convite para ${email} como ${role}`, {
      id: currentUser.id,
      nome: profile?.full_name ?? currentUser.email,
    });

    return NextResponse.json({ user: convidado });
  } catch (err: unknown) {
    const mensagem = err instanceof Error ? err.message : "Erro inesperado";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}
