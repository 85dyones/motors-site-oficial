import { NextResponse, type NextRequest } from "next/server";
import { grafiaDoCarro } from "../../../../../lib/grafiaCanonica";
import { nomeComAno } from "../../../../../lib/nomeDoVeiculo";
import { ehVeiculosIndisponivel, idDeVeiculo, montarRelatorioDoVeiculo } from "../../../../../lib/veiculosDeInteresse";
import { respostaDoErroDeVeiculos, sessaoDaEquipe } from "../../../../../lib/veiculosDeInteresse-servidor";

export const dynamic = "force-dynamic";

/**
 * O relatório de interesse de UM carro (05/10/2026): quantos leads o
 * consideraram, quantos escolheram, quantos descartaram e por quê. É o que se
 * mostra ao dono do carro consignado e o que orienta o preço dos próprios.
 * Contrato em `docs/GESTAO_DO_LEAD.md`, "Veículos de interesse".
 *
 * Sai de `resumo_de_interesse_do_veiculo`, chamada com a SESSÃO de quem abriu
 * a tela: a função é da loja inteira (decisão do dono), exige equipe ativa e
 * recusa a chave de serviço. A resposta é montada campo a campo
 * (`montarRelatorioDoVeiculo`): contagens, motivos e notas, sem lead, nome,
 * telefone nem autor.
 *
 * Antes da migração a função não existe: `200` com `veiculos_disponivel:
 * false` e `relatorio: null`, para a tela esconder o bloco em vez de errar.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, recusa } = await sessaoDaEquipe();
    if (recusa) return recusa;

    const veiculoId = idDeVeiculo(id);
    if (veiculoId === null) {
      return NextResponse.json(
        { error: "O veículo é o código de um carro do estoque.", codigo: "veiculo_invalido" },
        { status: 400 },
      );
    }

    const [resumo, carro] = await Promise.all([
      supabase.rpc("resumo_de_interesse_do_veiculo", { p_veiculo: veiculoId }),
      supabase
        .from("estoque_motors")
        .select("id, marca, modelo, versao, ano, quilometragem, preco, vendido")
        .eq("id", veiculoId)
        .maybeSingle(),
    ]);

    // O carro é enfeite do cabeçalho: se não vier (saiu do estoque, leitura
    // falhou), o relatório vem sem ele.
    const v = carro.error ? null : (carro.data as Record<string, unknown> | null);
    const veiculo = v
      ? {
          id: Number(v.id),
          rotulo: nomeComAno({
            ...grafiaDoCarro({
              marca: String(v.marca ?? ""),
              modelo: String(v.modelo ?? ""),
              versao: typeof v.versao === "string" ? v.versao : null,
            }),
            ano: v.ano as number | string | null,
          }),
          km: v.quilometragem ?? null,
          preco: v.preco ?? null,
          vendido: v.vendido === true,
        }
      : null;

    if (resumo.error) {
      if (ehVeiculosIndisponivel(resumo.error)) {
        return NextResponse.json({ veiculos_disponivel: false, veiculo, relatorio: null });
      }
      return respostaDoErroDeVeiculos(resumo.error);
    }

    return NextResponse.json({
      veiculos_disponivel: true,
      veiculo,
      relatorio: { ...montarRelatorioDoVeiculo(resumo.data), veiculo_id: veiculoId },
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
