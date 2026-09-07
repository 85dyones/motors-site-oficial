import { NextResponse, type NextRequest } from "next/server";
import { ehTabelaOuColunaAusente } from "../../../lib/erroDeSchema";
import { REGUA_DO_GUIA } from "../../../lib/guias";
import { autorizarConteudo, revalidarCluster } from "../../../lib/portaDeGuias";
import { CABECALHO_PADRAO, lerCabecalhoGravado } from "../../../lib/secaoDeGuias";
import {
  normalizarCorpo,
  normalizarFaq,
  normalizarSaida,
  normalizarSlug,
  normalizarSobre,
  problemasParaPublicar,
  texto,
} from "../../../lib/guiaValidacao";


export const dynamic = "force-dynamic";

/**
 * Os guias — listar, criar, editar, publicar e excluir.
 *
 * Pedido do dono em 2026-09-06: *"preciso ser capaz de gerar novos guias e
 * editar os criados no painel, como já acontece com o texto das páginas"*.
 *
 * ---------------------------------------------------------------------------
 * A diferença para `/api/hubs/textos`, e por que ela muda o desenho
 * ---------------------------------------------------------------------------
 * Lá o banco é OVERRIDE: a página de hub existe de qualquer jeito, e a tabela
 * só troca o texto. Por isso aquela API não tem POST nem DELETE — não há o que
 * criar nem o que apagar, só o que sobrescrever.
 *
 * Aqui o banco é FONTE. Sem linha, a página não existe. Então esta rota cria e
 * apaga de verdade, e ganha uma coisa que a de hubs não precisa ter: **estado**.
 * Guia longo se escreve em várias sessões, e sem rascunho o Google veria meio
 * texto enquanto alguém escreve — decisão do dono na mesma conversa.
 *
 * A régua de permissão é a mesma linha da A17 que governa `descricao_seo` e o
 * texto dos hubs: escrever cópia de site é trabalho de quem escreve anúncio.
 */

// `autorizar` e `revalidarCluster` moravam aqui e saíram em 07/09 para
// `lib/portaDeGuias.ts`, quando o cabeçalho da seção ganhou rota própria e
// passou a precisar dos dois. O docblock de lá explica por que copiar seria o
// começo de um erro conhecido.
const autorizar = autorizarConteudo;

/** Lista TODOS os guias — rascunho incluso. A tela precisa dos dois. */
export async function GET() {
  const auth = await autorizar();
  if (auth.erro) return auth.erro;

  // O cabeçalho da seção vem JUNTO, e não numa segunda chamada: é a mesma tela
  // e o mesmo carregamento. A leitura dele nunca estoura, então não derruba a
  // listagem — mas ela pode FALHAR, e a resposta precisa dizer isso.
  const [{ data, error }, leitura] = await Promise.all([
    auth.supabase!.from("guias").select("*").order("atualizado_em", { ascending: false }),
    lerCabecalhoGravado(),
  ]);

  // `cabecalhoLido` é o campo que impede a tela de gravar por cima do que está
  // no ar. Sem ele, um timeout SÓ na metade do cabeçalho devolvia 200 com os
  // campos nulos — indistinguível de "sem override" —, a tela liberava o Salvar
  // e o clique apagava o texto do dono. As duas metades usam clientes
  // diferentes, então uma pode cair sozinha.
  const cabecalho = leitura.lido ? leitura.cabecalho : null;
  const cabecalhoLido = leitura.lido;

  if (error) {
    if (ehTabelaOuColunaAusente(error)) {
      return NextResponse.json(
        {
          error: "A tabela de guias ainda não existe neste ambiente.",
          guias: [],
          regua: REGUA_DO_GUIA,
          cabecalho,
          cabecalhoLido,
          padrao: CABECALHO_PADRAO,
        },
        { status: 200 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // `padrao` viaja junto para a tela poder mostrar o texto do código como
  // sugestão no campo vazio. Sem ele o operador veria uma caixa em branco e
  // concluiria que a página está sem texto — quando ela está no automático.
  return NextResponse.json({
    guias: data ?? [],
    regua: REGUA_DO_GUIA,
    cabecalho,
    cabecalhoLido,
    padrao: CABECALHO_PADRAO,
  });
}

/** Cria um guia novo. Nasce SEMPRE rascunho. */
export async function POST(request: NextRequest) {
  const auth = await autorizar();
  if (auth.erro) return auth.erro;

  const corpo = await request.json().catch(() => ({}));
  const slug = normalizarSlug(corpo.slug || corpo.titulo);
  if (!slug) {
    return NextResponse.json({ error: "Informe um título ou um slug." }, { status: 400 });
  }

  const { data, error } = await auth.supabase!
    .from("guias")
    .insert({
      slug,
      titulo: texto(corpo.titulo, 200) || "Guia sem título",
      titulo_seo: texto(corpo.tituloSeo, 200) || null,
      descricao: texto(corpo.descricao, 400),
      corpo: normalizarCorpo(corpo.corpo),
      faq: normalizarFaq(corpo.faq),
      saida: normalizarSaida(corpo.saida),
      sobre: normalizarSobre(corpo.sobre),
      // Nasce rascunho sem exceção: publicar é ato deliberado, com o guia
      // pronto na tela. Ver a decisão do dono no docblock do topo.
      estado: "rascunho",
      atualizado_por: auth.user!.id,
    })
    .select()
    .single();

  if (error) {
    const duplicado = error.code === "23505";
    return NextResponse.json(
      { error: duplicado ? `Já existe um guia com o endereço /guias/${slug}.` : error.message },
      { status: duplicado ? 409 : 500 },
    );
  }

  return NextResponse.json({ guia: data });
}

/** Salva um guia e, opcionalmente, muda o estado dele. */
export async function PUT(request: NextRequest) {
  const auth = await autorizar();
  if (auth.erro) return auth.erro;

  const body = await request.json().catch(() => ({}));
  const slug = normalizarSlug(body.slug);
  if (!slug) return NextResponse.json({ error: "Guia não informado." }, { status: 400 });

  const corpo = normalizarCorpo(body.corpo);
  const saida = normalizarSaida(body.saida);
  const titulo = texto(body.titulo, 200);
  const descricao = texto(body.descricao, 400);
  const querPublicar = body.estado === "publicado";

  if (querPublicar) {
    const problemas = problemasParaPublicar({ titulo, descricao, corpo, saida });
    if (problemas.length > 0) {
      // 422 e não 400: o pedido está bem formado, o guia é que não está pronto.
      // A tela mostra a lista em vez de um "erro ao salvar" opaco.
      return NextResponse.json({ error: "O guia ainda não pode ir ao ar.", problemas }, { status: 422 });
    }
  }

  const { data: atual } = await auth.supabase!
    .from("guias")
    .select("estado, publicado_em")
    .eq("slug", slug)
    .maybeSingle();

  // Guia inexistente é 404, e não 500. Sem esta linha o `update` não casava
  // nenhuma linha, o `.single()` abaixo devolvia `PGRST116`, e a tela mostrava
  // um erro de banco no lugar de "esse guia não existe mais" — que acontece de
  // verdade quando duas abas editam e uma apaga.
  if (!atual) {
    return NextResponse.json({ error: `Não existe guia em /guias/${slug}.` }, { status: 404 });
  }

  const { data, error } = await auth.supabase!
    .from("guias")
    .update({
      titulo: titulo || "Guia sem título",
      titulo_seo: texto(body.tituloSeo, 200) || null,
      descricao,
      corpo,
      faq: normalizarFaq(body.faq),
      saida,
      sobre: normalizarSobre(body.sobre),
      estado: querPublicar ? "publicado" : "rascunho",
      // `publicado_em` marca a PRIMEIRA publicação e não se mexe depois: é o
      // `datePublished` do Article, e reescrevê-lo a cada edição diria ao
      // Google que o texto é sempre novo. O que muda ao editar é
      // `atualizado_em`, que vira `dateModified`.
      publicado_em: querPublicar ? (atual?.publicado_em ?? new Date().toISOString()) : atual?.publicado_em ?? null,
      atualizado_em: new Date().toISOString(),
      atualizado_por: auth.user!.id,
    })
    .eq("slug", slug)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidarCluster(slug);
  return NextResponse.json({ guia: data });
}

/** Apaga um guia. */
export async function DELETE(request: NextRequest) {
  const auth = await autorizar();
  if (auth.erro) return auth.erro;

  const slug = normalizarSlug(new URL(request.url).searchParams.get("slug"));
  if (!slug) return NextResponse.json({ error: "Guia não informado." }, { status: 400 });

  const { error } = await auth.supabase!.from("guias").delete().eq("slug", slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidarCluster(slug);
  return NextResponse.json({ ok: true });
}
