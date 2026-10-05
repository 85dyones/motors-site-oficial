import { NextResponse, type NextRequest } from "next/server";
import { lerLeadNoEscopo, sessaoDeLeads } from "../../../../../../lib/gestaoDoLead-servidor";
import {
  decidirResolucao,
  ehIdDeOpcao,
  planejarResolucoes,
  sucessorDoPrincipal,
} from "../../../../../../lib/veiculosDeInteresse";
import {
  definirPrincipal,
  executarPlano,
  lerOpcoesDoLead,
  relerVeiculosDoLead,
  respostaDeVeiculosIndisponivel,
  respostaDoErroDeVeiculos,
} from "../../../../../../lib/veiculosDeInteresse-servidor";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string; opcao: string }> };

const opcaoNaoEncontrada = () =>
  NextResponse.json({ error: "Opção não encontrada neste lead.", codigo: "opcao_nao_encontrada" }, { status: 404 });

/**
 * Resolve, reabre, anota ou torna principal UMA opção do lead (05/10/2026).
 * Contrato em `docs/GESTAO_DO_LEAD.md`, "Veículos de interesse".
 *
 * Corpo: `{ situacao?, motivo_descarte?, nota?, principal? }`. A regra é de
 * `decidirResolucao`, contra a linha do banco; a ordem das gravações e o
 * veículo principal que resulta, de `planejarResolucoes`:
 *
 *   · escolher torna o carro o principal e reabre o escolhido anterior;
 *   · descartar o principal passa o principal à opção em avaliação mais antiga.
 *
 * A opção é procurada ENTRE AS DO LEAD da URL, já conferido no escopo: o id de
 * uma opção de outro lead é 404, e não alcança a linha.
 */
export async function PATCH(request: NextRequest, { params }: Contexto) {
  try {
    const { id, opcao } = await params;
    const { supabase, visao, recusa } = await sessaoDeLeads();
    if (recusa) return recusa;

    const guarda = await lerLeadNoEscopo(supabase, visao, id, "id, responsavel, veiculo_id");
    if (guarda.recusa) return guarda.recusa;
    if (!ehIdDeOpcao(opcao)) return opcaoNaoEncontrada();

    const corpo = await request.json().catch(() => null);

    const leitura = await lerOpcoesDoLead(supabase, id);
    if (!leitura.disponivel) return respostaDeVeiculosIndisponivel();
    if (leitura.erro) return respostaDoErroDeVeiculos(leitura.erro);
    const atual = leitura.linhas.find((l) => l.id === opcao);
    if (!atual) return opcaoNaoEncontrada();

    const decisao = decidirResolucao(corpo, atual);
    if (!decisao.ok) {
      return NextResponse.json({ error: decisao.erro, codigo: decisao.codigo }, { status: decisao.status });
    }

    const plano = planejarResolucoes(leitura.linhas, guarda.lead.veiculo_id as number | string | null, [
      { opcao, campos: decisao.campos, principal: decisao.principal },
    ]);
    if (!plano.ok) return NextResponse.json({ error: plano.erro, codigo: plano.codigo }, { status: plano.status });

    const feito = await executarPlano(supabase, visao, id, plano);
    if (!feito.ok) return feito.resposta;

    return NextResponse.json({ ok: true, opcao, ...(await relerVeiculosDoLead(supabase, id)) });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}

/**
 * Apaga uma opção: só o Administrador, para o carro adicionado por engano. O
 * gesto de todo dia é DESCARTAR, que deixa o motivo no relatório do veículo; a
 * policy de exclusão da tabela diz o mesmo.
 *
 * Se a opção apagada era o principal, o principal passa ao escolhido, senão à
 * opção em avaliação mais antiga, senão fica vazio.
 */
export async function DELETE(_request: NextRequest, { params }: Contexto) {
  try {
    const { id, opcao } = await params;
    const { supabase, visao, perfis, recusa } = await sessaoDeLeads();
    if (recusa) return recusa;

    const guarda = await lerLeadNoEscopo(supabase, visao, id, "id, responsavel, veiculo_id");
    if (guarda.recusa) return guarda.recusa;

    if (!perfis.includes("admin")) {
      return NextResponse.json(
        {
          error: "Só o Administrador apaga uma opção. Para tirar um carro do lead, descarte-o com o motivo.",
          codigo: "so_admin",
        },
        { status: 403 },
      );
    }
    if (!ehIdDeOpcao(opcao)) return opcaoNaoEncontrada();

    const leitura = await lerOpcoesDoLead(supabase, id);
    if (!leitura.disponivel) return respostaDeVeiculosIndisponivel();
    if (leitura.erro) return respostaDoErroDeVeiculos(leitura.erro);
    const atual = leitura.linhas.find((l) => l.id === opcao);
    if (!atual) return opcaoNaoEncontrada();

    const { data: apagadas, error } = await supabase
      .from("leads_veiculos")
      .delete()
      .eq("id", opcao)
      .eq("lead_id", id)
      .select("id");
    if (error) return respostaDoErroDeVeiculos(error);
    if ((apagadas ?? []).length === 0) return opcaoNaoEncontrada();

    const principal = guarda.lead.veiculo_id as number | string | null;
    if (principal !== null && principal !== undefined && String(principal) === String(atual.veiculo_id)) {
      const sucessor = sucessorDoPrincipal(leitura.linhas.filter((l) => l.id !== opcao));
      const feito = await definirPrincipal(supabase, visao, id, sucessor);
      if (!feito.ok) {
        console.warn("[Veículos do lead] Principal não atualizado depois de apagar:", feito.erro);
        return NextResponse.json(
          {
            error: "A opção foi apagada, mas não deu para atualizar o carro principal do lead. Tente de novo.",
            codigo: "principal_nao_atualizado",
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ ok: true, apagada: opcao, ...(await relerVeiculosDoLead(supabase, id)) });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
