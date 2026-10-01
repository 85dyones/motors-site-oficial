import { NextResponse } from "next/server";
import { cadastraRepasse } from "../../../../lib/edicaoDoRepasse";
import { buscarNoEstoque, MINIMO_DA_BUSCA } from "../../../../lib/estoqueParaORepasse";
import { sessaoDoRepasse } from "../../../../lib/rotaDoRepasse";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { lerComoEquipe } from "../../../../lib/colunasDoEstoque";

export const dynamic = "force-dynamic";

/**
 * A busca do "Buscar no estoque" do novo carro de repasse (pedido do dono de
 * 28/09): `?q=` com o termo, até 8 carros do estoque INTEIRO — publicado,
 * vendido, arquivado e rascunho —, cada um com a situação.
 *
 * Porta própria, e não as que já existem: `/api/ciclo/vendas/estoque` é da
 * venda do Ciclo (Admin e Comercial) e devolve chassi e custo; `GET
 * /api/estoque` não confere se quem pede é da equipe. Aqui o portão é o da
 * página `/admin/repasse/novo` — equipe ativa (`sessaoDoRepasse`) e quem
 * cadastra repasse.
 *
 * O `select` pede a lista exata e nunca chassi, renavam, `preco_compra` nem
 * `valor_fipe`. A PLACA é lida só para a busca casar a placa inteira, e não
 * sai: "Cadastrar carro de repasse" é de todo perfil, mas a linha de
 * documentação da matriz (`permissoes.ts`) não deixa Gestor, Financeiro e SDR
 * verem placa — e Financeiro e SDR nem abrem o `/admin/estoque`.
 *
 * Lê com a SESSÃO, pela view da equipe: desde 20261001150000 o
 * `authenticated` não lê placa nem código FIPE na tabela (cliente da Garagem
 * e investidor também são sessão), e a view só entrega linhas a quem é da
 * equipe. A chave de serviço continua desnecessária.
 *
 * `fotosCopiaveis` conta os pares que vêm para o repasse — os do nosso bucket
 * e os da pasta da loja no carro57, que a cópia baixa (dono, 01/10) —, e
 * `fotosDeFora` só os que não têm como vir. A conta é pelo endereço, em
 * `paresDoEstoque`: a busca não pede nada à rede.
 */
export async function GET(request: Request) {
  try {
    const sessao = await sessaoDoRepasse();
    if (!sessao.ok) return sessao.resposta;
    if (!cadastraRepasse(sessao.perfis)) {
      return NextResponse.json({ error: "Seu perfil não cadastra carro de repasse." }, { status: 403 });
    }
    const termo = new URL(request.url).searchParams.get("q") ?? "";
    if (termo.trim().length < MINIMO_DA_BUSCA) return NextResponse.json({ veiculos: [] });

    const supabase = await createServerSupabaseClient();
    const { data, error } = await lerComoEquipe((origem) =>
      supabase
        .from(origem)
        .select(
          "id, marca, modelo, versao, modelo_override, versao_override, ano, ano_fabricacao, quilometragem, cambio, combustivel, cor, tipo, vendido, estado_cadastro, web_full_images, whatsapp_images, codigo_fipe, placa",
        )
        .order("created_at", { ascending: false }),
    );
    if (error) {
      console.error("[Repasse/Estoque] Falha ao ler o estoque:", error.message);
      return NextResponse.json({ error: "Não deu para ler o estoque." }, { status: 502 });
    }
    return NextResponse.json({ veiculos: buscarNoEstoque((data ?? []) as Array<Record<string, unknown>>, termo) });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao buscar no estoque." }, { status: 500 });
  }
}
