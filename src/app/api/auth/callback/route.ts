import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  /* SEMPRE a Visão geral. Decisão do dono em 2026-09-01: *"sempre que logar na
     área administrativa, sempre, a primeira visualização deve ser a Visão
     Geral"*.

     Esta rota aceitava `?next=` e mandava para lá. O parâmetro era honrado por
     ela e por `/api/auth/confirm`, e GERADO por ninguém — conferido no
     repositório inteiro em 01/09: nenhum template de e-mail, nenhum link do
     painel e nenhuma rota o escrevem. Era desvio possível sem uso, e a
     sanitização que o cercava (`//host`, `/\host`) existia só para conter o
     open redirect que ele mesmo abria.

     Fica anotado para quem vier: se um dia a loja quiser "abriu /admin/estoque,
     logou, voltou para lá", isso NÃO é reintroduzir `?next=` — é decisão de
     produto que precisa passar pelo dono, porque contraria a regra acima. */
  const destino = "/admin";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${destino}`);
    }
  }

  // Redirect to login page with error param on failure
  return NextResponse.redirect(`${origin}/login?error=auth-callback-failed`);
}
