import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehStaff } from "../../../../lib/permissoes";

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
 * O destino é decidido pelo PAPEL, não por parâmetro: cliente vai para a
 * Garagem, staff vai para o painel. `?next=` só vale para staff — cliente não
 * tem outra área para ir, e aceitar destino arbitrário para ele seria só
 * superfície de phishing.
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

  // Mesma sanitização do callback: só caminho interno.
  const rawNext = searchParams.get("next");
  const nextSeguro =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")
      ? rawNext
      : null;

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

  if (ehStaff(profile)) {
    return NextResponse.redirect(`${origin}${nextSeguro ?? "/admin"}`);
  }
  return NextResponse.redirect(`${origin}/garagem`);
}
