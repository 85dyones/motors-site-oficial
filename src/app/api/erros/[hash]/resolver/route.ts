import { NextResponse } from "next/server";
import { ehHashDeAgrupamento } from "../../../../../lib/filaDeErros";
import {
  autorizarTriagemDeErros,
  resolverGrupoDeErros,
} from "../../../../../lib/filaDeErros-servidor";

export const dynamic = "force-dynamic";

/**
 * A única escrita da `/admin/erros`: marcar um grupo como resolvido, ou reabrir.
 *
 * ---------------------------------------------------------------------------
 * O que esta rota NÃO é
 * ---------------------------------------------------------------------------
 * A vizinha `/api/erros` (do PR da coleta) é a porta de ENTRADA: aceita POST
 * anônimo do navegador do visitante, responde 204 sempre e grava com a chave de
 * serviço. Esta aqui é o oposto em todos os eixos — exige sessão de staff, usa
 * o cliente de SESSÃO (a RLS é a régua) e só encosta em duas colunas.
 *
 * As duas colunas não são uma escolha de estilo: o `grant` da tabela é
 * `update (resolvido_em, resolvido_por)`, por coluna. Mandar `mensagem` junto
 * faria o Postgres recusar o lote inteiro com 42501 — e é exatamente para isso
 * que o grant é assim. A tela que exibe a prova do defeito não reescreve a
 * prova.
 *
 * `resolvido_por` vem de `auth.uid()`, nunca do corpo: nada no banco amarra o
 * campo ao autor (está escrito no `comment on column`), então quem amarra é
 * este arquivo.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ hash: string }> },
) {
  try {
    const { hash } = await params;

    // A FORMA do hash antes de qualquer ida ao banco — é a mesma do CHECK
    // `erros_hash_em_hex`. Um `.eq()` com lixo não erraria, só devolveria
    // vazio, e aí a tela diria "nada mudou" sem saber por quê.
    if (!ehHashDeAgrupamento(hash)) {
      return NextResponse.json({ error: "Grupo inválido." }, { status: 400 });
    }

    const porta = await autorizarTriagemDeErros();
    if (!porta.ok) {
      return NextResponse.json({ error: porta.motivo }, { status: porta.status });
    }

    // Corpo ilegível NÃO escolhe ação nenhuma.
    //
    // A primeira versão caía em `{}` e seguia com `resolver = false`, sob o
    // argumento de que era "a ação menos destrutiva". Não era: `false` é
    // REABRIR, um UPDATE em lote que apaga `resolvido_em` e `resolvido_por` de
    // todas as linhas do grupo — o carimbo de quem triou, que é o único dado
    // desta tela que não se recupera do erro original. O ramo "menos
    // destrutivo" de verdade é não gravar.
    //
    // Continua valendo o que a versão antiga acertava: nada de coerção. `"1"`,
    // `"sim"` e `1` não viram `true` — mas agora também não viram `false`.
    let corpo: unknown;
    try {
      corpo = await request.json();
    } catch {
      return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
    }

    const pedido = (corpo as { resolver?: unknown } | null)?.resolver;
    if (typeof pedido !== "boolean") {
      return NextResponse.json(
        { error: "Informe `resolver` como true (resolver) ou false (reabrir)." },
        { status: 400 },
      );
    }
    const resolver = pedido;

    const r = await resolverGrupoDeErros(porta.supabase, {
      hash,
      resolver,
      uid: porta.uid,
    });

    if (!r.ok) {
      console.error("[Erros/Resolver] Falha:", r.motivo);
      return NextResponse.json({ error: r.motivo }, { status: 500 });
    }

    // Zero linha alterada não é erro do PostgREST — é o desfecho mudo da RLS,
    // ou um grupo que já estava no estado pedido. Dizer "pronto" aqui seria
    // afirmar uma gravação que pode não ter acontecido.
    if (r.linhas === 0) {
      return NextResponse.json(
        {
          ok: true,
          linhas: 0,
          aviso: resolver
            ? "Nenhuma ocorrência aberta neste grupo — ou ele já estava resolvido, ou seu acesso não alcança estas linhas."
            : "Nenhuma ocorrência resolvida para reabrir neste grupo.",
        },
        { status: 200 },
      );
    }

    return NextResponse.json({ ok: true, linhas: r.linhas });
  } catch (err: unknown) {
    const mensagem = err instanceof Error ? err.message : String(err);
    console.error("[Erros/Resolver] Erro inesperado:", mensagem);
    return NextResponse.json({ error: "Erro ao gravar a triagem." }, { status: 500 });
  }
}
