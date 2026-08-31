import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehStaff, perfisDe, podeFazer } from "../../../../lib/permissoes";
import { ehTabelaOuColunaAusente } from "../../../../lib/erroDeSchema";
import {
  hubsDeCarroceria,
  hubsDeFaixa,
  hubsDeMarca,
  hubsDePerfil,
  recortesDoEstoque,
} from "../../../../lib/hubsDeEstoque";
import { SEGMENTOS_DE_PDP } from "../../../../lib/veiculoUrl";
import {
  perguntasDeCategoria,
  textoDeCarroceria,
  textoDeFaixaDePreco,
  textoDeMarca,
  textoDeModelo,
  textoDePerfil,
} from "../../../../lib/textoDosHubs";
import { generoDoSegmento, seminovo } from "../../../../lib/generoDoVeiculo";
import { normalizarTextoDoHub } from "../../../../lib/textoEditadoDoHub";

export const dynamic = "force-dynamic";

/**
 * Os textos das páginas de hub — listar e editar.
 *
 * Decisão do dono em 2026-08-31: *"precisamos que o painel permita editar o
 * texto, hoje ele é criado automaticamente e não tem muito sentido"*.
 *
 * ---------------------------------------------------------------------------
 * O gerado viaja junto, e é isso que faz a tela ser usável
 * ---------------------------------------------------------------------------
 * São 103 hubs. Uma tela que abrisse um campo em branco obrigaria o operador a
 * escrever do zero e, na prática, ninguém escreveria — a página ficaria com o
 * texto automático de sempre, e a tela viraria enfeite.
 *
 * Então o detalhe devolve o texto GERADO ao lado do editado: quem abre começa
 * do que está no ar, corrige o que incomoda e salva. É a diferença entre
 * "escreva uma página" e "conserte esta frase".
 *
 * A régua é a mesma linha da matriz A17 que governa `descricao_seo` — "Editar
 * opcionais e destaques rápidos", que é de Admin, Marketing e Comercial. Cópia
 * de site é trabalho de quem escreve anúncio, não de quem fecha o mês.
 */

const ACAO = "Editar opcionais e destaques rápidos";

/** Todo hub servido, com o rótulo que a tela mostra e o texto que o site gera. */
async function catalogoDeHubs() {
  const { historico, disponiveis } = await recortesDoEstoque();
  const hubs: Array<{
    caminho: string;
    rotulo: string;
    tipo: string;
    veiculos: number;
    tituloGerado: string;
    paragrafosGerados: string[];
  }> = [];

  for (const segmento of SEGMENTOS_DE_PDP) {
    const genero = generoDoSegmento(segmento);
    for (const marca of hubsDeMarca(historico, disponiveis, segmento)) {
      hubs.push({
        caminho: `/${segmento}/${marca.slug}`,
        rotulo: marca.nome,
        tipo: "marca",
        veiculos: marca.veiculos.length,
        tituloGerado: `${marca.nome} ${seminovo(genero)} em Curitiba`,
        paragrafosGerados: textoDeMarca(
          marca.nome,
          marca.veiculos,
          marca.modelos.map((m) => m.nome),
          genero,
        ),
      });
      for (const modelo of marca.modelos) {
        // Hub que canonicaliza para outro não é página própria — não entra no
        // sitemap e não deve entrar na lista de edição. Ver `caminhosDosHubs`.
        if (modelo.canonicalDe) continue;
        hubs.push({
          caminho: `/${segmento}/${marca.slug}/${modelo.slug}`,
          rotulo: `${marca.nome} ${modelo.nome}`,
          tipo: "modelo",
          veiculos: modelo.veiculos.length,
          tituloGerado: `${marca.nome} ${modelo.nome} ${seminovo(modelo.genero)} em Curitiba`,
          paragrafosGerados: textoDeModelo(
            marca.nome,
            modelo.nome,
            modelo.veiculos,
            modelo.genero,
          ),
        });
      }
    }
  }

  for (const c of hubsDeCarroceria(historico, disponiveis)) {
    hubs.push({
      caminho: `/estoque/${c.slug}`,
      rotulo: c.nome,
      tipo: "carroceria",
      veiculos: c.veiculos.length,
      tituloGerado: `${c.plural} em Curitiba`,
      paragrafosGerados: textoDeCarroceria(c.nome, c.veiculos, c.plural, c.genero),
    });
  }

  for (const p of hubsDePerfil(disponiveis)) {
    hubs.push({
      caminho: `/estoque/${p.slug}`,
      rotulo: p.nome,
      tipo: "perfil",
      veiculos: p.veiculos.length,
      // `titulo` do perfil já é o `<h1>` por extenso, sem "em Curitiba" — a
      // rota é quem acrescenta, e aqui a gente repete o que ela faz.
      tituloGerado: `${p.titulo} em Curitiba`,
      paragrafosGerados: textoDePerfil(p, p.veiculos),
    });
  }

  // `hubsDeFaixa`, e não um filtro escrito aqui: a régua da faixa tem três
  // detalhes que é fácil errar de memória — `max` é EXCLUSIVO, o topo é
  // `Infinity`, e carro sem preço fica de fora. Escrever de novo faria esta
  // tela contar um número e a página servir outro.
  for (const f of hubsDeFaixa(disponiveis)) {
    hubs.push({
      caminho: `/estoque/${f.slug}`,
      rotulo: f.nome,
      tipo: "faixa",
      veiculos: f.veiculos.length,
      tituloGerado: `Seminovos ${f.nome} em Curitiba`,
      paragrafosGerados: textoDeFaixaDePreco(f.nome, f.veiculos),
    });
  }

  return hubs;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles").select("role, papeis").eq("id", user.id).single();
    const perfil = perfisDe(profile);
    if (!ehStaff(perfil) || podeFazer(perfil, ACAO) !== "faz") {
      return NextResponse.json({ error: "Seu perfil não edita texto de página" }, { status: 403 });
    }

    const [hubs, salvos] = await Promise.all([
      catalogoDeHubs(),
      supabase.from("textos_de_hub").select("caminho, titulo, paragrafos, atualizado_em"),
    ]);

    if (salvos.error && !ehTabelaOuColunaAusente(salvos.error)) {
      return NextResponse.json({ error: salvos.error.message }, { status: 500 });
    }
    const porCaminho = new Map(
      (salvos.data ?? []).map((s: { caminho: string }) => [s.caminho, s]),
    );

    const caminho = request.nextUrl.searchParams.get("caminho");
    if (caminho) {
      const hub = hubs.find((h) => h.caminho === caminho);
      if (!hub) return NextResponse.json({ error: "Hub não encontrado" }, { status: 404 });
      const salvo = porCaminho.get(caminho) as
        | { titulo: string | null; paragrafos: string[] | null }
        | undefined;
      return NextResponse.json({ hub, editado: normalizarTextoDoHub(salvo) });
    }

    return NextResponse.json({
      hubs: hubs.map((h) => ({
        caminho: h.caminho,
        rotulo: h.rotulo,
        tipo: h.tipo,
        veiculos: h.veiculos,
        proprio: Boolean(normalizarTextoDoHub(porCaminho.get(h.caminho) as never)),
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles").select("role, papeis").eq("id", user.id).single();
    const perfil = perfisDe(profile);
    if (!ehStaff(perfil) || podeFazer(perfil, ACAO) !== "faz") {
      return NextResponse.json({ error: "Seu perfil não edita texto de página" }, { status: 403 });
    }

    const corpo = await request.json().catch(() => ({}));
    const caminho = String(corpo?.caminho ?? "").trim();
    if (!caminho.startsWith("/")) {
      return NextResponse.json({ error: "Caminho inválido" }, { status: 400 });
    }

    // O caminho tem de ser um hub QUE EXISTE. Sem isto a tabela viraria depósito
    // de texto para páginas que ninguém serve — e o operador nunca saberia por
    // que "não apareceu no site".
    const hubs = await catalogoDeHubs();
    if (!hubs.some((h) => h.caminho === caminho)) {
      return NextResponse.json(
        { error: `"${caminho}" não é uma página de hub servida hoje` },
        { status: 422 },
      );
    }

    const titulo = String(corpo?.titulo ?? "").trim();
    const paragrafos = Array.isArray(corpo?.paragrafos)
      ? corpo.paragrafos.map((p: unknown) => String(p ?? "").trim()).filter(Boolean)
      : [];

    // Tudo vazio = voltar ao automático. Apagar a linha, e não gravar campos
    // em branco: linha vazia faria a próxima leitura decidir de novo o que
    // "vazio" significa, e é exatamente o tipo de ambiguidade que vira bug.
    if (!titulo && paragrafos.length === 0) {
      const { error } = await supabase.from("textos_de_hub").delete().eq("caminho", caminho);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, voltouAoAutomatico: true });
    }

    const { error } = await supabase
      .from("textos_de_hub")
      .upsert(
        { caminho, titulo: titulo || null, paragrafos, atualizado_por: user.id },
        { onConflict: "caminho" },
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
