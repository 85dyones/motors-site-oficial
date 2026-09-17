import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";
import { ehStaff, perfisDe, podeFazer } from "../../../../../lib/permissoes";
import {
  filtroDoSeletorDeVenda,
  vendidosAguardandoRegistro,
} from "../../../../../lib/ciclo/vendidosSemRegistro";

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

  // O que está à venda, E o vendido que ainda não tem venda registrada no Ciclo.
  //
  // Até 16/09 era só `vendido = false`, com a nota "um carro já marcado como
  // vendido não deveria estar sendo fechado agora". Valia enquanto marcar
  // vendido era ato de gente, feito dias depois. Desde que a disponibilidade
  // espelha o RevendaMais, o sync marca o carro 24 h depois de ele sair do feed
  // — antes de o vendedor fechar a venda aqui. Ver `vendidosAguardandoRegistro`.
  //
  // As duas leituras extras NÃO derrubam o seletor: sem elas ele volta a ser o
  // de antes, só com o que está à venda. Degrada, não quebra.
  const [mudancasDeVendido, vendasDoCiclo] = await Promise.all([
    supabase
      .from("historico_veiculo")
      .select("veiculo_id, valor_novo, registrado_em")
      .eq("campo", "vendido"),
    supabase.from("veiculos_vendidos").select("estoque_id").not("estoque_id", "is", null),
  ]);

  const semVendidos = mudancasDeVendido.error ?? vendasDoCiclo.error;
  if (semVendidos) {
    console.warn(
      "[Ciclo/Vendas/Estoque] Sem os vendidos aguardando registro — o seletor mostra só o que está à venda:",
      semVendidos.message,
    );
  }
  const aguardandoRegistro = semVendidos
    ? []
    : vendidosAguardandoRegistro(mudancasDeVendido.data ?? [], vendasDoCiclo.data ?? []);

  const { data, error } = await supabase
    .from("estoque_motors")
    .select(
      `id, marca, modelo, versao, ano, ano_fabricacao, quilometragem,
       preco, cor, placa, chassi, valor_fipe, vendido${podeVerCusto ? ", preco_compra" : ""}`,
    )
    .or(filtroDoSeletorDeVenda(aguardandoRegistro))
    .order("marca", { ascending: true })
    .limit(400);

  if (error) {
    console.error("[Ciclo/Vendas/Estoque] Falha ao listar:", error.message);
    return NextResponse.json({ error: "Não foi possível listar o estoque." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, veiculos: data ?? [] });
}
