import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";
import { campoNegadoAoPerfil, ehStaff, perfisDe } from "../../../../../lib/permissoes";
import { aplicarNosVeiculos, CAMPOS_DE_FOTO, normalizarId } from "../../../../../lib/estoqueEscrita";
import { colunasDasFotos } from "../../../../../lib/fotosDoVeiculo";
import { buscarFotosNoFeed } from "../../../../../lib/feedRevendaMais";

export const dynamic = "force-dynamic";

/**
 * Traz para o banco as fotos que o anúncio tem HOJE no RevendaMais.
 *
 * A porta que faltava. Entre 30/08 e 15/09 a foto de um veículo `origem =
 * 'sync'` não tinha dono: a trava do banco descarta a gravação do sync (foto
 * não está na allowlist de seis colunas) e o painel recusava o envio por ser
 * carro do feed. Os dois "não" juntos deixaram carro com dezessete fotos no
 * RevendaMais parado em `rascunho` por uma semana, invisível no site — ver o
 * cabeçalho de `lib/feedRevendaMais.ts`.
 *
 * É POST, e não PATCH em `/api/estoque/[id]`: o corpo não vem de quem chama. A
 * rota vai à fonte, lê o que está lá e grava. Aceitar a lista pelo corpo
 * deixaria o painel mandar qualquer URL para dentro da galeria de um carro do
 * feed, que é exatamente a superfície que `camposGravaveis` fecha.
 *
 * ---------------------------------------------------------------------------
 * Por que a escrita passa pela trava
 * ---------------------------------------------------------------------------
 * `createServerSupabaseClient` escreve como `authenticated`, com a sessão de
 * quem clicou, e esta rota não toca em `last_seen_at` — os dois sinais que a
 * trava usa para reconhecer o robô. Importar foto é ato de gente e fica
 * registrado como tal: a gravação passa por `aplicarNosVeiculos`, então as três
 * colunas entram no histórico do veículo com nome e hora, como qualquer edição
 * do painel.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, papeis, full_name")
      .eq("id", user.id)
      .single();
    if (!ehStaff(profile)) {
      return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
    }

    // Mesma linha da matriz A17 que governa a galeria do veículo nativo
    // ("Adicionar e reordenar fotos"). Importar do feed é a mesma alçada:
    // o resultado é a mesma coluna, vista no mesmo lugar.
    const negado = campoNegadoAoPerfil(perfisDe(profile), [...CAMPOS_DE_FOTO]);
    if (negado) {
      return NextResponse.json(
        { error: `Seu perfil não altera "${negado.campo}" (${negado.acao})` },
        { status: 403 },
      );
    }

    const alvo = normalizarId(id);
    const { data: linha, error: erroDaLinha } = await supabase
      .from("estoque_motors")
      .select("id, origem")
      .eq("id", alvo)
      .maybeSingle();

    if (erroDaLinha) {
      return NextResponse.json({ error: erroDaLinha.message }, { status: 500 });
    }
    if (!linha) {
      return NextResponse.json({ error: "Veículo não encontrado" }, { status: 404 });
    }

    // O veículo nativo não está no feed e nunca estará: ele nasceu aqui, com id
    // de faixa própria. Quem sobe foto dele é a galeria do painel, para o bucket
    // do próprio projeto (migração F0-p). Deixar o botão respondê-lo mandaria o
    // operador a uma fonte que não tem o carro — e ele leria "fora do feed"
    // sobre um cadastro que está certo.
    if (linha.origem === "painel") {
      return NextResponse.json(
        {
          error:
            "Este veículo foi cadastrado no painel e não existe no RevendaMais. " +
            "Suba as fotos pela galeria.",
        },
        { status: 422 },
      );
    }

    const achado = await buscarFotosNoFeed(id);

    if (achado.tipo === "fora-do-feed") {
      return NextResponse.json(
        {
          error:
            "Este anúncio não está no feed do RevendaMais de agora. Se o carro ainda " +
            "é da loja, confira se o anúncio está ativo lá; se saiu do estoque, arquive-o.",
        },
        { status: 404 },
      );
    }

    if (achado.tipo === "sem-fotos") {
      return NextResponse.json(
        {
          error:
            "O anúncio está no feed, e sem nenhuma foto lá também. Suba as fotos no " +
            "RevendaMais e importe de novo — nada foi alterado aqui.",
        },
        { status: 422 },
      );
    }

    // As mesmas três colunas, no mesmo formato que a galeria grava. Reusar
    // `colunasDasFotos` é o que mantém a capa (`url_imagem`) coerente entre a
    // foto subida pelo painel e a importada do feed — duas regras de capa
    // fariam o `og:image` discordar do card conforme a origem da foto.
    const colunas = colunasDasFotos(achado.fotos);

    const resultado = await aplicarNosVeiculos(
      supabase,
      [id],
      colunas,
      { id: user.id, nome: profile?.full_name ?? user.email ?? null },
    );

    if (resultado.erro) {
      return NextResponse.json({ error: resultado.erro }, { status: resultado.status ?? 500 });
    }

    return NextResponse.json({
      ...colunas,
      fotosImportadas: achado.fotos.length,
      mudancasRegistradas: resultado.mudancasRegistradas,
    });
  } catch (err: unknown) {
    // O `AbortSignal.timeout` chega aqui como `TimeoutError`. A mensagem crua
    // ("The operation was aborted due to timeout") não diz a quem a culpa
    // pertence, e o operador concluiria que o painel está quebrado.
    const falha = err instanceof Error ? err : null;
    const mensagem =
      falha?.name === "TimeoutError"
        ? "O RevendaMais não respondeu a tempo. Nada foi alterado neste veículo — tente de novo."
        : falha?.message || "Falha ao importar as fotos do feed.";
    return NextResponse.json({ error: mensagem }, { status: 502 });
  }
}
