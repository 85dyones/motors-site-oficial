import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehInvestidor, perfisDe } from "../../../../lib/permissoes";

export const dynamic = "force-dynamic";

/**
 * Gestão dos investidores — o lado de quem LANÇA.
 *
 * A tela `/investidor` é só leitura, e de propósito: quem coloca dinheiro não
 * lança o próprio aporte. Os lançamentos entram por aqui, sob a RLS de
 * `has_finance_access` (admin ou financeiro) — a mesma que governa contas,
 * compras e movimentações.
 *
 * O gate de papel abaixo é redundante com a RLS, e continua valendo a pena: a
 * RLS devolveria lista VAZIA para quem não pode, e vazio se lê como "não há
 * investidor cadastrado". Um 403 explícito diz a verdade.
 */
async function exigirFinanceiro() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, papeis, full_name")
    .eq("id", user.id)
    .single();

  const perfis = perfisDe(profile);
  if (!perfis.includes("admin") && !perfis.includes("financeiro")) {
    return { erro: NextResponse.json({ error: "Acesso restrito ao financeiro" }, { status: 403 }) };
  }

  return { supabase, user, profile };
}

export async function GET() {
  try {
    const { erro, supabase } = await exigirFinanceiro();
    if (erro) return erro;

    // Quem é investidor sai de `profiles` — a lista precisa mostrar também
    // quem ainda não tem lançamento nenhum, senão o recém-cadastrado some da
    // tela justamente quando é preciso lançar o primeiro aporte dele.
    const { data: perfisInvestidores, error: erroPerfis } = await supabase!
      .from("profiles")
      .select("id, full_name, email, role, papeis, is_active")
      .order("full_name", { ascending: true });

    if (erroPerfis) {
      return NextResponse.json({ error: erroPerfis.message }, { status: 500 });
    }

    const investidores = (perfisInvestidores ?? []).filter((p) => ehInvestidor(p));

    const [posicoesRes, participacoesRes, movimentosRes] = await Promise.all([
      supabase!.from("investidor_posicao").select("*"),
      supabase!
        .from("investidor_veiculos")
        .select("id, investidor_id, veiculo_id, valor_investido, data_entrada, observacao")
        .order("data_entrada", { ascending: false }),
      supabase!
        .from("investidor_movimentos")
        .select("id, investidor_id, tipo, valor, data, descricao, veiculo_id")
        .order("data", { ascending: false }),
    ]);

    const erroDeLeitura =
      posicoesRes.error ?? participacoesRes.error ?? movimentosRes.error;
    if (erroDeLeitura) {
      return NextResponse.json({ error: erroDeLeitura.message }, { status: 500 });
    }

    return NextResponse.json({
      investidores,
      posicoes: posicoesRes.data ?? [],
      participacoes: participacoesRes.data ?? [],
      movimentos: movimentosRes.data ?? [],
    });
  } catch (err: unknown) {
    const mensagem = err instanceof Error ? err.message : "Erro inesperado";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}

/**
 * Lança uma participação em veículo ou um movimento (aporte/retirada).
 *
 * `recurso` decide a tabela. Duas rotas separadas dariam no mesmo; uma só
 * mantém o gate de papel e a validação de investidor num lugar — e é aí que
 * mora o risco real desta rota.
 */
export async function POST(request: NextRequest) {
  try {
    const { erro, supabase, user } = await exigirFinanceiro();
    if (erro) return erro;

    const body = await request.json();
    const { recurso, investidor_id } = body;

    if (recurso !== "participacao" && recurso !== "movimento") {
      return NextResponse.json({ error: "Recurso desconhecido." }, { status: 400 });
    }
    if (!investidor_id) {
      return NextResponse.json({ error: "Escolha o investidor." }, { status: 400 });
    }

    // O alvo precisa SER investidor. Sem esta checagem, um lançamento podia
    // cair no id de um cliente ou de um vendedor: as tabelas só exigem que o
    // id exista em `profiles`, e a pessoa nunca veria o próprio dinheiro
    // porque a área dela não é esta.
    const { data: alvo } = await supabase!
      .from("profiles")
      .select("id, full_name, role, papeis")
      .eq("id", investidor_id)
      .single();

    if (!alvo || !ehInvestidor(alvo)) {
      return NextResponse.json(
        { error: "A pessoa escolhida não tem o papel de investidor." },
        { status: 400 },
      );
    }

    const valorBruto = Number(
      recurso === "participacao" ? body.valor_investido : body.valor,
    );
    if (!Number.isFinite(valorBruto) || valorBruto <= 0) {
      return NextResponse.json(
        { error: "O valor precisa ser um número maior que zero." },
        { status: 400 },
      );
    }

    if (recurso === "participacao") {
      const veiculoId = Number(body.veiculo_id);
      if (!Number.isInteger(veiculoId) || veiculoId <= 0) {
        return NextResponse.json(
          { error: "Informe o id do veículo no estoque." },
          { status: 400 },
        );
      }

      const { data, error } = await supabase!
        .from("investidor_veiculos")
        .insert({
          investidor_id,
          veiculo_id: veiculoId,
          valor_investido: valorBruto,
          data_entrada: body.data_entrada || undefined,
          observacao: body.observacao || null,
          created_by: user!.id,
        })
        .select()
        .single();

      if (error) {
        // A unicidade (investidor, veículo) é regra de produto, não acidente:
        // aumentar a participação é editar a linha, não empilhar outra.
        if (error.code === "23505") {
          return NextResponse.json(
            { error: "Este investidor já participa deste veículo — edite a participação existente." },
            { status: 409 },
          );
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ participacao: data });
    }

    if (body.tipo !== "aporte" && body.tipo !== "retirada") {
      return NextResponse.json(
        { error: "O movimento é aporte ou retirada." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase!
      .from("investidor_movimentos")
      .insert({
        investidor_id,
        tipo: body.tipo,
        // Sempre positivo: o sinal mora em `tipo`. `Math.abs` aqui evita que
        // um "-500" digitado no formulário vire um CHECK violation cru na
        // cara de quem lança — a intenção é óbvia e o banco continua trancado.
        valor: Math.abs(valorBruto),
        data: body.data || undefined,
        descricao: body.descricao || null,
        veiculo_id: body.veiculo_id ? Number(body.veiculo_id) : null,
        created_by: user!.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ movimento: data });
  } catch (err: unknown) {
    const mensagem = err instanceof Error ? err.message : "Erro inesperado";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}

/** Remove um lançamento. `recurso` e `id` vêm na query. */
export async function DELETE(request: NextRequest) {
  try {
    const { erro, supabase } = await exigirFinanceiro();
    if (erro) return erro;

    const params = request.nextUrl.searchParams;
    const recurso = params.get("recurso");
    const id = params.get("id");

    if (!id) {
      return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
    }
    const tabela =
      recurso === "participacao"
        ? "investidor_veiculos"
        : recurso === "movimento"
          ? "investidor_movimentos"
          : null;
    if (!tabela) {
      return NextResponse.json({ error: "Recurso desconhecido." }, { status: 400 });
    }

    const { error } = await supabase!.from(tabela).delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const mensagem = err instanceof Error ? err.message : "Erro inesperado";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}
