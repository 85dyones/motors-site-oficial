import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";
import { ehStaff, perfisDe, podeFazer } from "../../../../../lib/permissoes";

export const dynamic = "force-dynamic";

/**
 * Os carros disponíveis para o fechamento de venda — tela A19.
 *
 * Existe para tirar a digitação do formulário: chassi e placa chegam do feed
 * da RevendaMais desde 2026-08-17, e eram justamente os dois campos que o
 * vendedor copiava do documento à mão, com o cliente esperando.
 *
 * ⚠️ Esta rota devolve **chassi e placa**, que são documentação interna. Por
 * isso o gate é o mesmo da venda — staff, com a permissão da matriz A17 — e
 * não o `getEstoque()` público, cujo mapper existe justamente para não deixar
 * esses campos saírem.
 *
 * ⚠️ E devolve `preco_compra` **só para quem pode ver custo**. Os dois gates
 * são diferentes de propósito: "Fechar venda do Ciclo" é de Admin e
 * Comercial, mas "Ver custo de aquisição e margem" exclui o Comercial — a
 * observação da matriz é literal, *"Comercial vê preço e desconto, não
 * custo"*. Antes de 2026-08-18 o campo saía sob o primeiro gate, e o
 * Comercial recebia o custo no JSON e no estado do formulário. É a mesma
 * classe de vazamento que a prop de client component já causou no /estoque:
 * o recorte tem que acontecer na fronteira, não na tela.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, papeis")
    .eq("id", user.id)
    .single();

  if (!ehStaff(profile)) {
    return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
  }
  const perfil = perfisDe(profile);
  if (podeFazer(perfil, "Fechar venda do Ciclo") !== "faz") {
    return NextResponse.json(
      { error: "Seu perfil não fecha venda do Ciclo" },
      { status: 403 },
    );
  }

  // O custo nem é buscado quando o perfil não pode vê-lo: o que não sai do
  // banco não vaza no JSON nem no payload do componente de cliente.
  const podeVerCusto = podeFazer(perfil, "Ver custo de aquisição e margem") === "faz";

  // Só o que ainda não foi vendido. Um carro já marcado como vendido no
  // RevendaMais não deveria estar sendo fechado agora — e se estiver, a busca
  // por placa continua achando pelo cadastro manual.
  const { data, error } = await supabase
    .from("estoque_motors")
    .select(
      `id, marca, modelo, versao, ano, ano_fabricacao, quilometragem,
       preco, cor, placa, chassi, valor_fipe${podeVerCusto ? ", preco_compra" : ""}`,
    )
    .or("vendido.is.null,vendido.eq.false")
    .order("marca", { ascending: true })
    .limit(400);

  if (error) {
    console.error("[Ciclo/Vendas/Estoque] Falha ao listar:", error.message);
    return NextResponse.json({ error: "Não foi possível listar o estoque." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, veiculos: data ?? [] });
}
