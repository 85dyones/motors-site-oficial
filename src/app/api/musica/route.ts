import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../lib/supabase-server";
import { executar, lerEstado } from "../../../lib/spotify";
import type { AcaoMusica } from "../../../lib/musicaShowroom";

export const dynamic = "force-dynamic";

/**
 * Música do showroom — tela 08 do design doc.
 *
 * GET devolve o estado do player; POST manda um comando.
 *
 * ── Quem pode mandar comando ────────────────────────────────────────────────
 *
 * O GET é aberto. O que ele devolve é o nome de uma faixa que já está impressa
 * na TV do showroom e tocando alto na loja — não há o que proteger, e a TV não
 * tem sessão.
 *
 * O POST exige sessão. `/vitrine/musica` roda numa URL pública do deploy: sem
 * essa trava, qualquer pessoa que descobrisse o endereço trocaria a música da
 * loja de fora. É um aparelho de balcão — logar uma vez no navegador do tablet
 * resolve, e a sessão do Supabase persiste.
 *
 * A exceção é `abaixar`, que sai do tablet de balcão anônimo (08 B) quando o
 * cliente toca em CHAMAR CONSULTOR. Abaixar o volume é a única ação que não
 * atrapalha ninguém se for disparada por engano — e é justamente a que o
 * design põe na tela sem login. `restaurar` continua exigindo sessão: é ela
 * que sobe o volume de volta, e essa é a que não pode ficar aberta.
 */

const SEM_SESSAO_PERMITIDO: AcaoMusica["acao"][] = ["abaixar"];

export async function GET() {
  const estado = await lerEstado();
  return NextResponse.json(estado, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  let corpo: AcaoMusica;
  try {
    corpo = (await request.json()) as AcaoMusica;
  } catch {
    return NextResponse.json({ erro: "Corpo inválido" }, { status: 400 });
  }

  if (!corpo?.acao) {
    return NextResponse.json({ erro: "Ação ausente" }, { status: 400 });
  }

  if (!SEM_SESSAO_PERMITIDO.includes(corpo.acao)) {
    let autenticado = false;
    try {
      const client = await createServerSupabaseClient();
      const { data } = await client.auth.getUser();
      autenticado = !!data?.user;
    } catch (err) {
      console.warn("[Música] Checagem de sessão falhou:", (err as Error)?.message);
    }
    if (!autenticado) {
      return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
    }
  }

  if (corpo.acao === "volume" && typeof corpo.valor !== "number") {
    return NextResponse.json({ erro: "Volume inválido" }, { status: 400 });
  }
  if (corpo.acao === "playlist" && typeof corpo.uri !== "string") {
    return NextResponse.json({ erro: "Playlist inválida" }, { status: 400 });
  }

  const r = await executar(corpo);

  if (!r.ok) {
    // 409 e não 500: o pedido estava certo, o player é que não está em
    // condição de atender. O painel distingue os casos pela chave.
    const status = r.erro === "nao-configurado" ? 503 : 409;
    return NextResponse.json({ erro: r.erro }, { status });
  }

  return NextResponse.json(r.estado, { headers: { "Cache-Control": "no-store" } });
}
