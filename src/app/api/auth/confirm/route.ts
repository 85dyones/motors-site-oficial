import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehInvestidor, ehStaff } from "../../../../lib/permissoes";

export const dynamic = "force-dynamic";

/**
 * A porta do link mágico — verificação por `token_hash`, no servidor.
 *
 * Por que esta rota existe, se `/api/auth/callback` já existia: o callback só
 * entende `?code=` (fluxo PKCE), e PKCE exige que o clique aconteça no MESMO
 * navegador que pediu o link — o verificador fica num cookie de lá. E-mail
 * não dá essa garantia: o cliente pede o link no notebook e abre no celular,
 * ou o app de e-mail abre num webview sem os cookies. Pior: link pedido fora
 * do fluxo PKCE volta com o token no FRAGMENTO da URL (`#access_token`), que
 * o servidor nunca vê — o callback respondia `auth-callback-failed` e o
 * cliente quicava de volta para a entrada. Foi o primeiro sintoma real, em
 * 2026-08-15.
 *
 * `token_hash` resolve os dois: o template do e-mail aponta direto para cá, a
 * verificação acontece no servidor (`verifyOtp`) e não depende de cookie
 * prévio — o link funciona em qualquer navegador, e continua de uso único.
 *
 * O destino é decidido pelo PAPEL, e SÓ por ele: cliente vai para a Garagem,
 * investidor para a área dele, staff para a Visão geral do painel.
 *
 * Até 2026-09-01 o staff podia ser desviado por `?next=`. Saiu por decisão do
 * dono — *"sempre que logar na área administrativa, sempre, a primeira
 * visualização deve ser a Visão Geral"* —, e a remoção não custou nada: o
 * parâmetro era honrado aqui e no callback, e escrito por lugar nenhum. O
 * template de e-mail (`docs/AREA_DO_CLIENTE_AUTH.md`) manda só `token_hash` e
 * `type`. Com ele foi embora também a superfície de open redirect que a
 * sanitização em volta existia para conter.
 *
 * Dois tipos furam essa regra, e é de propósito: `invite` e `recovery` chegam
 * de alguém que ainda NÃO tem senha utilizável — o convidado nunca teve uma, e
 * quem pediu recuperação não lembra a dele. Mandá-los ao painel logaria a
 * sessão e deixaria a conta sem senha própria para a próxima entrada, que é o
 * beco silencioso: funciona hoje, não funciona amanhã. Os dois vão para
 * `/definir-senha`, que é a única tela que fecha esse ciclo.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "email") as EmailOtpType;

  if (!tokenHash) {
    return NextResponse.redirect(`${origin}/login?error=link-incompleto`);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    // Vencido ou já usado. O template promete 1 hora e uso único — a tela de
    // entrada da Garagem é onde se pede outro.
    return NextResponse.redirect(`${origin}/garagem?erro=link-vencido`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/garagem?erro=link-vencido`);
  }

  // Convite e recuperação terminam na escolha da senha — ver o cabeçalho.
  if (type === "invite" || type === "recovery") {
    return NextResponse.redirect(`${origin}/definir-senha`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, papeis")
    .eq("id", user.id)
    .single();

  // SEMPRE a Visão geral — ver a nota sobre `?next=` no cabeçalho.
  if (ehStaff(profile)) {
    return NextResponse.redirect(`${origin}/admin`);
  }
  // Investidor tem área própria desde 2026-08-22; sem esta linha o convite
  // dele terminava na Garagem, que a página manda de volta para a home.
  if (ehInvestidor(profile)) {
    return NextResponse.redirect(`${origin}/investidor`);
  }
  return NextResponse.redirect(`${origin}/garagem`);
}
