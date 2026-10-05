import { NextResponse, type NextRequest } from "next/server";
import { lerLeadNoEscopo, sessaoDeLeads } from "../../../../../lib/gestaoDoLead-servidor";
import { decidirInclusao } from "../../../../../lib/veiculosDeInteresse";
import {
  adicionarVeiculoAoLead,
  lerOpcoesDoLead,
  relerVeiculosDoLead,
  respostaDeVeiculosIndisponivel,
  respostaDoErroDeVeiculos,
} from "../../../../../lib/veiculosDeInteresse-servidor";

export const dynamic = "force-dynamic";

/**
 * Adiciona um carro às opções do lead (05/10/2026). Contrato em
 * `docs/GESTAO_DO_LEAD.md`, "Veículos de interesse".
 *
 * Corpo: `{ veiculo_id, principal? }`. O carro vem do seletor
 * (`GET /api/estoque/busca`), e quem confere que ele existe é o gatilho da
 * tabela. O primeiro carro de um lead sem principal vira o principal
 * (`leads.veiculo_id`).
 *
 * A ordem é a das rotas irmãs: sessão, o LEAD no escopo, e só então o corpo e
 * a tabela. Com a RLS de `leads` aberta à equipe, `leads_veiculos` aceitaria a
 * opção em qualquer lead: a guarda é desta rota.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, visao, recusa } = await sessaoDeLeads();
    if (recusa) return recusa;

    const guarda = await lerLeadNoEscopo(supabase, visao, id, "id, responsavel, veiculo_id");
    if (guarda.recusa) return guarda.recusa;

    const decisao = decidirInclusao(await request.json().catch(() => null));
    if (!decisao.ok) {
      return NextResponse.json({ error: decisao.erro, codigo: decisao.codigo }, { status: decisao.status });
    }

    const leitura = await lerOpcoesDoLead(supabase, id);
    if (!leitura.disponivel) return respostaDeVeiculosIndisponivel();
    if (leitura.erro) return respostaDoErroDeVeiculos(leitura.erro);

    const feito = await adicionarVeiculoAoLead(
      supabase,
      visao,
      { id, veiculo_id: guarda.lead.veiculo_id as number | string | null },
      decisao,
      leitura.linhas,
    );
    if (!feito.ok) return feito.resposta;

    return NextResponse.json({
      ok: true,
      criada: feito.criada,
      opcao: feito.opcao,
      ...(await relerVeiculosDoLead(supabase, id)),
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
