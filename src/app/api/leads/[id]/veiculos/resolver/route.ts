import { NextResponse, type NextRequest } from "next/server";
import { lerLeadNoEscopo, sessaoDeLeads } from "../../../../../../lib/gestaoDoLead-servidor";
import {
  decidirLote,
  decidirResolucao,
  planejarResolucoes,
  type PedidoDeResolucao,
} from "../../../../../../lib/veiculosDeInteresse";
import {
  executarPlano,
  lerOpcoesDoLead,
  relerVeiculosDoLead,
  respostaDeVeiculosIndisponivel,
  respostaDoErroDeVeiculos,
} from "../../../../../../lib/veiculosDeInteresse-servidor";

export const dynamic = "force-dynamic";

/**
 * Resolve VÁRIAS opções de um lead num pedido só (05/10/2026): a caixa que a
 * tela abre logo antes ou logo depois de fechar o lead. Contrato em
 * `docs/GESTAO_DO_LEAD.md`, "Veículos de interesse".
 *
 * Corpo: a lista `[{ opcao, situacao, motivo_descarte?, nota? }]`.
 *
 * O pedido inteiro é VALIDADO antes da primeira gravação: um item recusado e
 * nada é gravado, e a resposta diz qual (`opcao`). A gravação, essa, é uma por
 * opção, sem transação: se uma falhar no meio, a resposta traz `gravadas` (ver
 * `lib/veiculosDeInteresse-servidor`).
 *
 * Fechar o lead NÃO depende desta rota nesta versão: o desfecho continua no
 * `PATCH /api/leads/gerenciar`, que não bloqueia por opção pendente.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, visao, recusa } = await sessaoDeLeads();
    if (recusa) return recusa;

    const guarda = await lerLeadNoEscopo(supabase, visao, id, "id, responsavel, veiculo_id");
    if (guarda.recusa) return guarda.recusa;

    const lote = decidirLote(await request.json().catch(() => null));
    if (!lote.ok) return NextResponse.json({ error: lote.erro, codigo: lote.codigo }, { status: lote.status });

    const leitura = await lerOpcoesDoLead(supabase, id);
    if (!leitura.disponivel) return respostaDeVeiculosIndisponivel();
    if (leitura.erro) return respostaDoErroDeVeiculos(leitura.erro);

    const pedidos: PedidoDeResolucao[] = [];
    for (const item of lote.itens) {
      const atual = leitura.linhas.find((l) => l.id === item.opcao);
      if (!atual) {
        return NextResponse.json(
          { error: "Opção não encontrada neste lead.", codigo: "opcao_nao_encontrada", opcao: item.opcao },
          { status: 404 },
        );
      }
      const decisao = decidirResolucao(item.corpo, atual);
      if (!decisao.ok) {
        return NextResponse.json(
          { error: decisao.erro, codigo: decisao.codigo, opcao: item.opcao },
          { status: decisao.status },
        );
      }
      pedidos.push({ opcao: item.opcao, campos: decisao.campos, principal: decisao.principal });
    }

    const plano = planejarResolucoes(leitura.linhas, guarda.lead.veiculo_id as number | string | null, pedidos);
    if (!plano.ok) {
      return NextResponse.json(
        { error: plano.erro, codigo: plano.codigo, ...(plano.opcao ? { opcao: plano.opcao } : {}) },
        { status: plano.status },
      );
    }

    const feito = await executarPlano(supabase, visao, id, plano);
    if (!feito.ok) return feito.resposta;

    return NextResponse.json({ ok: true, resolvidas: pedidos.length, ...(await relerVeiculosDoLead(supabase, id)) });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
