import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { spotifyConfigurado, tokenParaPlayer } from "../../../../lib/spotify";

export const dynamic = "force-dynamic";

/**
 * Access token do Spotify para o Web Playback SDK que roda na TV.
 *
 * **Exige sessão, e essa é a trava mais importante do módulo.** O token dá
 * controle de playback da conta da loja por ~1h, direto contra a API do
 * Spotify — quem o tiver não precisa passar por `/api/musica` para nada.
 * Aberto, ele vazaria para qualquer visitante que abrisse `/vitrine`.
 *
 * Exigir login aqui não é atrito inventado: o passo 01 da tela A18 já descreve
 * "login único no navegador da TV, com a conta da loja". A sessão do Supabase
 * persiste, então é uma vez por aparelho.
 *
 * Sem sessão, a TV simplesmente não vira dispositivo Spotify — ela continua
 * mostrando a vitrine e a faixa do que estiver tocando em outro aparelho.
 */
export async function GET() {
  if (!spotifyConfigurado()) {
    return NextResponse.json({ erro: "nao-configurado" }, { status: 503 });
  }

  let autenticado = false;
  try {
    const client = await createServerSupabaseClient();
    const { data } = await client.auth.getUser();
    autenticado = !!data?.user;
  } catch (err) {
    console.warn("[Música] Checagem de sessão no token falhou:", (err as Error)?.message);
  }

  if (!autenticado) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const token = await tokenParaPlayer();
  if (!token) {
    return NextResponse.json({ erro: "falhou" }, { status: 502 });
  }

  return NextResponse.json(
    { token },
    {
      headers: {
        // `private, no-store` não é decoração: sem isso um proxy compartilhado
        // poderia servir o token de playback da loja para o próximo pedido.
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
      },
    },
  );
}
