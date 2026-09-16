import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { campoNegadoAoPerfil, ehStaff, perfisDe } from "../../../../lib/permissoes";
import {
  aplicarNosVeiculos,
  CAMPO_DA_PROMOCAO,
  CAMPOS_DE_FOTO,
  extrairCamposNossos,
} from "../../../../lib/estoqueEscrita";

export const dynamic = "force-dynamic";

/**
 * O que NÃO se faz em lote — a decisão, separada da rota para poder ser testada.
 *
 * Recebe o objeto que já passou por `extrairCamposNossos` (nunca o corpo cru:
 * a pergunta é sobre o que a escrita gravaria, não sobre o que alguém mandou) e
 * devolve o motivo da recusa, ou `null` quando o lote é legítimo.
 *
 * ---------------------------------------------------------------------------
 * Por que isto virou função, em 2026-09-02
 * ---------------------------------------------------------------------------
 * As duas primeiras barreiras viviam soltas no handler, e o teste que as cobria
 * mirava `CAMPOS_NOSSOS` — a lista errada. Esta rota não usa `CAMPOS_NOSSOS`;
 * usa `camposGravaveis(undefined)`, e as duas divergiram quando a F0.5 abriu as
 * fotos: elas entraram na lista da rota sem entrar na do teste, que continuou
 * verde guardando uma propriedade que não era a que protegia nada.
 *
 * Com a decisão aqui, o teste exercita a MESMA função que o handler chama.
 */
export function recusaDoLote(atualizacao: Record<string, unknown>): string | null {
  // Custo de aquisição: o valor é de um carro só. Barrado em vez de
  // silenciosamente ignorado — mesma linha da matriz A17 que o editor aplica.
  if ("preco_compra" in atualizacao) {
    return "Custo de aquisição se altera no editor do veículo, um a um";
  }

  // Promoção, pelo motivo mais concreto: o desconto é medido contra o preço de
  // CADA carro. Um valor único em dez veículos de preços diferentes vira dez
  // descontos que ninguém escolheu — e num deles, um preço acima do de tabela.
  if (CAMPO_DA_PROMOCAO in atualizacao) {
    return "Preço promocional se define no editor do veículo, um a um";
  }

  // Foto — e esta barreira nasceu de um furo REAL, aberto pela F0.5.
  //
  // Enquanto as fotos exigiam `origem = 'painel'`, esta rota as descartava
  // sozinha: ela chama `extrairCamposNossos` SEM origem. Ao abrir a galeria
  // para qualquer origem, elas passaram a estar na lista que a rota usa, e a
  // escrita em massa abriu junto, sem ninguém pedir. Medido: um POST com 200
  // ids e `{whatsapp_images: []}` zerava a foto dos 200.
  //
  // O estrago seria silencioso. A régua de publicação só é conferida quando
  // `estado_cadastro` vem no corpo, então os carros continuariam `publicado` no
  // banco e sumiriam da vitrine na leitura seguinte, sem erro em lugar nenhum —
  // o mesmo modo de falha que a condição por origem existia para evitar,
  // trocando o sync pelo lote como autor.
  //
  // E há a razão de sempre: a galeria é tela de UM carro, com ordem e capa. O
  // mesmo array em N veículos não é operação que alguém queira.
  if (CAMPOS_DE_FOTO.some((c) => c in atualizacao)) {
    return "Foto se envia e se ordena no editor do veículo, um a um";
  }

  return null;
}

/**
 * Ação em lote sobre o estoque — a barra de seleção da tela A6.
 *
 * O doc desenha "2 SELECIONADOS · Publicar · Marcar como vendido · Destacar na
 * home". **Publicar passou a existir em 2026-08-30**, com a coluna
 * `estado_cadastro` (migração F0-q): quem importa do RevendaMais recebe uma
 * fila de rascunhos e libera de uma vez os que estão prontos. Arquivar entrou
 * junto — é o "despublicar" da mesma linha da A17.
 *
 * A régua de fotos é conferida em `aplicarNosVeiculos`, contra o banco, e não
 * aqui: as duas rotas de escrita passam por lá, e gate em rota é gate que a
 * outra rota não tem.
 *
 * A alternativa era o cliente disparar N chamadas ao editor. Além do custo, N
 * chamadas falham pela metade: metade dos carros marcados, metade não, e nada
 * dizendo quais. Aqui é um update só.
 */

/** Teto por chamada. Marcar o estoque inteiro de uma vez é erro de operação
 *  mais provável que intenção — e um lote enorme trava a rota. */
const MAXIMO_POR_LOTE = 200;

export async function POST(request: NextRequest) {
  try {
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
    const perfil = perfisDe(profile);

    const body = await request.json();
    const ids: unknown = body?.ids;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Selecione ao menos um veículo" }, { status: 400 });
    }
    if (ids.length > MAXIMO_POR_LOTE) {
      return NextResponse.json(
        { error: `Lote acima do limite de ${MAXIMO_POR_LOTE} veículos` },
        { status: 400 },
      );
    }
    // Id que não é texto nem número vira "[object Object]" no `.in()` e volta
    // como erro cru do Postgres. Recusa na porta, com o motivo legível.
    if (!ids.every((id) => typeof id === "string" || typeof id === "number")) {
      return NextResponse.json({ error: "Lista de veículos malformada" }, { status: 400 });
    }

    const atualizacao = extrairCamposNossos(body?.campos ?? {});

    const recusa = recusaDoLote(atualizacao);
    if (recusa) {
      return NextResponse.json({ error: recusa }, { status: 400 });
    }

    // Matriz A17, campo a campo — o gate é por campo, não por rota. Marketing
    // classifica carroceria e perfil, mas não tira carro da vitrine; só Admin
    // mexe em placa; Financeiro não edita conteúdo de anúncio.
    const negado = campoNegadoAoPerfil(perfil, Object.keys(atualizacao));
    if (negado) {
      return NextResponse.json(
        { error: `Seu perfil não altera "${negado.campo}" (${negado.acao})` },
        { status: 403 },
      );
    }

    const resultado = await aplicarNosVeiculos(
      supabase,
      ids as Array<string | number>,
      atualizacao,
      { id: user.id, nome: profile?.full_name ?? user.email ?? null },
      { podeVerCusto: campoNegadoAoPerfil(perfil, ["preco_compra"]) === null },
    );

    if (resultado.erro) {
      // `recusas` viaja quando a publicação foi barrada pela régua de fotos:
      // a barra de ação marca as linhas exatas em vez de só mostrar o texto.
      return NextResponse.json(
        resultado.recusas
          ? { error: resultado.erro, recusas: resultado.recusas }
          : { error: resultado.erro },
        { status: resultado.status ?? 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      veiculos: ids.length,
      camposSalvos: resultado.camposSalvos,
      mudancasRegistradas: resultado.mudancasRegistradas,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
