import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  classificarCarroDoEstoque,
  classificarFotosDoEstoque,
  lojaDoAtendimento,
} from "../../../../../lib/atendimento-servidor";
import { quemConfiguraOAtendimento } from "../../../../../lib/autorizacaoDoAtendimento";
import { baseDaLoja, ETIQUETA_DAS_FOTOS } from "../../../../../lib/baseDoAtendimento-servidor";
import { ehTabelaOuColunaAusente, mensagemDeMigracaoPendente } from "../../../../../lib/erroDeSchema";
import { correcaoValida, fotosNaTela, situacaoDasFotos } from "../../../../../lib/fotosDoAtendimento";
import { corrigirFoto, lerFotosClassificadas } from "../../../../../lib/fotosDoAtendimento-servidor";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIGRACAO_DAS_FOTOS = "20261021120000_fotos_do_atendimento.sql";

/**
 * A aba Fotos do Atendimento IA (2026-10-20): ver e corrigir como o modelo de
 * visão separou as fotos de cada carro à venda. Admin e Gestor — a mesma
 * linha da matriz da configuração do assistente.
 *
 *   - `GET` — os carros à venda com o andamento da classificação; com
 *     `?veiculo=<id>`, a galeria do carro com a camada de cada foto.
 *   - `PATCH` — a correção à mão de uma foto (camada, "não mandar", legenda).
 *     Fica gravado quem corrigiu, e o modelo não reclassifica a foto.
 *   - `POST` — classificar agora: a fila do estoque, ou `{ veiculo }` só um
 *     carro; com `refazer: true`, o carro é classificado do zero (menos as
 *     fotos corrigidas à mão).
 *
 * A galeria vem da mesma base que o assistente lê (`baseDaLoja`): o que a tela
 * mostra é o que ele mandaria. Com a chave de serviço, sempre pela loja.
 */

type Aberta =
  | { recusa: NextResponse }
  | { admin: ReturnType<typeof createAdminSupabaseClient>; nome: string | null; loja: string | null };

async function abrir(): Promise<Aberta> {
  const auth = await quemConfiguraOAtendimento();
  if (auth.recusa) return { recusa: auth.recusa };
  const admin = createAdminSupabaseClient();
  const sonda = await admin.from("atendimento_fotos").select("id").limit(1);
  if (sonda.error) {
    const pendente = ehTabelaOuColunaAusente(sonda.error);
    return {
      recusa: pendente
        ? NextResponse.json({ migracaoPendente: true, aviso: mensagemDeMigracaoPendente(MIGRACAO_DAS_FOTOS), carros: [] })
        : NextResponse.json({ error: sonda.error.message }, { status: 500 }),
    };
  }
  return { admin, nome: auth.nome, loja: await lojaDoAtendimento(admin) };
}

export async function GET(request: NextRequest) {
  try {
    const aberta = await abrir();
    if ("recusa" in aberta) return aberta.recusa;
    const { admin, loja } = aberta;
    const base = await baseDaLoja(false);
    const galerias = base.fotos ?? {};
    const veiculo = (request.nextUrl.searchParams.get("veiculo") ?? "").replace(/\D/g, "");

    if (veiculo) {
      const carro = galerias[veiculo];
      if (!carro) return NextResponse.json({ error: "Esse carro não está à venda." }, { status: 404 });
      const classificadas = (await lerFotosClassificadas(admin, loja, [veiculo])).get(veiculo) ?? [];
      return NextResponse.json({
        carro: { id: veiculo, nome: carro.nome },
        fotos: fotosNaTela(carro.urls, classificadas),
        situacao: situacaoDasFotos(carro.urls, classificadas),
      });
    }

    const ids = Object.keys(galerias);
    const classificadas = await lerFotosClassificadas(admin, loja, ids);
    const carros = ids
      .map((id) => ({ id, nome: galerias[id].nome, situacao: situacaoDasFotos(galerias[id].urls, classificadas.get(id) ?? []) }))
      .sort((a, b) => b.situacao.pendentes - a.situacao.pendentes || a.nome.localeCompare(b.nome, "pt-BR"));
    return NextResponse.json({
      carros,
      resumo: {
        carros: carros.length,
        separados: carros.filter((c) => c.situacao.total > 0 && c.situacao.pendentes === 0).length,
        semFoto: carros.filter((c) => c.situacao.total === 0).length,
        fotosNaFila: carros.reduce((soma, c) => soma + c.situacao.pendentes, 0),
      },
      visao: Boolean((process.env.DEEPSEEK_API_KEY || "").trim()),
    });
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Erro inesperado" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const aberta = await abrir();
    if ("recusa" in aberta) return aberta.recusa;
    const correcao = correcaoValida(await request.json().catch(() => null));
    if (!correcao.ok) return NextResponse.json({ error: correcao.erro }, { status: 400 });
    const carro = (await baseDaLoja(false)).fotos?.[correcao.veiculo];
    const posicao = carro ? carro.urls.indexOf(correcao.url) : -1;
    if (posicao < 0) return NextResponse.json({ error: "Essa foto não está mais na galeria do carro." }, { status: 404 });
    const r = await corrigirFoto(aberta.admin, aberta.loja, { ...correcao, posicao }, aberta.nome ?? "Equipe");
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 500 });
    revalidateTag(ETIQUETA_DAS_FOTOS, { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Erro inesperado" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const aberta = await abrir();
    if ("recusa" in aberta) return aberta.recusa;
    const corpo = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const veiculo = String(corpo.veiculo ?? "").replace(/\D/g, "");
    const r = veiculo
      ? await classificarCarroDoEstoque(aberta.admin, veiculo, { refazer: corpo.refazer === true })
      : await classificarFotosDoEstoque(aberta.admin);
    if (r.fotos_classificadas > 0 || corpo.refazer === true) revalidateTag(ETIQUETA_DAS_FOTOS, { expire: 0 });
    return NextResponse.json(r, { status: r.ok ? 200 : 409 });
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Erro inesperado" }, { status: 500 });
  }
}
