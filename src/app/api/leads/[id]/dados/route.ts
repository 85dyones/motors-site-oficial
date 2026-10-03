import { NextResponse, type NextRequest } from "next/server";
import { comEscopoDeLeads } from "../../../../../lib/escopoDeLeads";
import { ehTabelaOuColunaAusente, mensagemDeMigracaoPendente } from "../../../../../lib/erroDeSchema";
import { CAMPOS_DOS_DADOS, decidirDados } from "../../../../../lib/gestaoDoLead";
import { lerLeadNoEscopo, MIGRACAO_DA_GESTAO, sessaoDeLeads } from "../../../../../lib/gestaoDoLead-servidor";

export const dynamic = "force-dynamic";

/**
 * Os dados do negócio de um lead (03/10/2026): carro na troca, faixa de
 * entrada, forma de pagamento pretendida, e-mail e carro de interesse.
 * Contrato em `docs/GESTAO_DO_LEAD.md`.
 *
 * Lista FECHADA de campos (`CAMPOS_DOS_DADOS`): etapa, responsável, desfecho e
 * anotação continuam no PATCH de `/api/leads/gerenciar`, que tem as travas de
 * cada um (motivo obrigatório, só o Administrador tira o dono). Um campo de
 * fora aqui é recusado, e não ignorado.
 *
 * Mexer nestes dados não reinicia o relógio da estagnação: o gatilho do lead
 * só conta etapa, responsável, anotação, desfecho e próximo passo como toque.
 * Completar o cadastro não é atender.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, visao, recusa } = await sessaoDeLeads();
    if (recusa) return recusa;

    const guarda = await lerLeadNoEscopo(supabase, visao, id, "id, responsavel");
    if (guarda.recusa) return guarda.recusa;

    const decisao = decidirDados(await request.json().catch(() => null));
    if (!decisao.ok) {
      return NextResponse.json({ error: decisao.erro, codigo: decisao.codigo }, { status: decisao.status });
    }

    // O carro tem de existir no estoque. `veiculo_id` não é chave estrangeira
    // (o carro sai do feed e o lead sobrevive), então o banco aceitaria
    // qualquer número, e o detalhe mostraria um vínculo vazio.
    if (typeof decisao.campos.veiculo_id === "number") {
      const { data: carro, error: erroDoCarro } = await supabase
        .from("estoque_motors")
        .select("id")
        .eq("id", decisao.campos.veiculo_id)
        .maybeSingle();
      if (erroDoCarro) return NextResponse.json({ error: erroDoCarro.message }, { status: 500 });
      if (!carro) {
        return NextResponse.json(
          { error: "Este carro não está no estoque.", codigo: "veiculo_desconhecido" },
          { status: 422 },
        );
      }
    }

    // O escopo vai também na escrita, como no `gerenciar`: se o lead mudou de
    // dono entre a guarda e este ponto, a gravação não alcança linha nenhuma,
    // e a resposta é o mesmo 404.
    const { data: gravados, error } = await comEscopoDeLeads(
      supabase.from("leads").update(decisao.campos).eq("id", id),
      visao,
    ).select(`id, ${CAMPOS_DOS_DADOS.join(", ")}`);
    if (error) {
      if (ehTabelaOuColunaAusente(error)) {
        return NextResponse.json({ error: mensagemDeMigracaoPendente(MIGRACAO_DA_GESTAO) }, { status: 503 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const gravado = (gravados ?? [])[0];
    if (!gravado) return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });

    return NextResponse.json({ ok: true, dados: gravado });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
