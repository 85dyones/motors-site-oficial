import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../lib/supabase-server";
import { getEstoque } from "../../../lib/supabase";
import { decidirCadastro } from "../../../lib/cadastroDeVeiculo";
import { registrarAcaoSensivel } from "../../../lib/auditoria";
import { ehTabelaOuColunaAusente, mensagemDeMigracaoPendente } from "../../../lib/erroDeSchema";

export const dynamic = "force-dynamic";

/**
 * Lista de veículos para os seletores do painel.
 *
 * A rota não existia — e três telas do financeiro a chamavam desde sempre:
 * `CompraForm`, `ContaForm` e `FinanceMargens` (`fetch("/api/estoque")`).
 * Todas tratavam o 404 com um `console.error` e seguiam com a lista vazia,
 * então a falha nunca apareceu na interface: o seletor "veículo" dos
 * formulários simplesmente vinha sem opções.
 *
 * A consequência ia além do formulário. O design doc (A11) diz que a margem
 * real se forma sozinha porque "quando é despesa de veículo, o lançamento
 * carrega o código do carro" — sem seletor, nenhuma despesa era vinculada, e
 * a tela de margem por veículo exibia "nenhuma movimentação vinculada" para
 * sempre. O módulo inteiro dependia de uma rota ausente.
 *
 * `incluirForaDoFeed: true` como no painel de configurações: um veículo que
 * saiu do feed continua tendo custo a lançar e margem a fechar — escondê-lo
 * aqui deixaria a despesa órfã.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Dado de operação interna (inclui veículos fora do feed): exige sessão.
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // `incluirPlaca`: a rota é autenticada e a busca por placa da tela de
    // margens depende dela. O mapper não a devolve por padrão — ver a nota em
    // `mapVeiculoDbToVeiculo`.
    //
    // `incluirNaoPublicaveis`: esta rota alimenta as telas internas de estoque
    // e margem, que precisam do pátio INTEIRO. Um carro sem laudo continua
    // custando pátio e capital enquanto não é publicável.
    const veiculos = await getEstoque({ incluirForaDoFeed: true, incluirPlaca: true, incluirNaoPublicaveis: true });

    // Só o que os seletores precisam. `getEstoque` já não expõe
    // `preco_compra` (ver o "SECURITY FIX" no mapper), e devolver a linha
    // inteira mandaria as duas listas de imagens de 88 veículos para o
    // browser a cada abertura de formulário.
    return NextResponse.json({
      veiculos: veiculos.map((v) => ({
        id: v.id,
        marca: v.marca,
        modelo: v.modelo,
        versao: v.versao,
        ano: v.ano,
        quilometragem: v.quilometragem,
        preco_original: v.preco_original,
        vendido: v.vendido,
        placa: v.placa ?? "",
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Cadastro nativo de veículo — o carro que não veio do RevendaMais.
 *
 * ---------------------------------------------------------------------------
 * Quem abre, quando, e que decisão sai daqui
 * ---------------------------------------------------------------------------
 * Quem: Admin ou Comercial (a linha "Publicar ou despublicar veículo" da A17 —
 * ver o gate abaixo). Quando: no momento em que um carro entra no pátio sem
 * passar pelo anúncio do RevendaMais — troca na compra, repasse, consignado. A
 * decisão: o carro passa a existir para o painel inteiro (tabela A6, editor
 * A15, fechamento de venda do Ciclo) e entra na fila de preparação do anúncio.
 *
 * ---------------------------------------------------------------------------
 * POST no recurso de coleção, e não uma rota `/novo`
 * ---------------------------------------------------------------------------
 * `/api/estoque` já é a coleção (o GET acima lista) e `/api/estoque/[id]` já é
 * o item, com PATCH. Criar é POST na coleção — o mesmo desenho que o painel já
 * usa em `/api/users`. `/api/estoque/lote` continua sendo o que é: uma AÇÃO
 * sobre vários itens, não um recurso.
 *
 * ---------------------------------------------------------------------------
 * O que esta rota deliberadamente não manda ao banco
 * ---------------------------------------------------------------------------
 * `id`, `origem` e o carimbo do sync são inferidos pelos triggers da migração
 * 20260829130000. O motivo de cada um está em `lib/cadastroDeVeiculo.ts`, e o
 * mais importante em uma frase: escrever o carimbo do sync faria esta rota
 * PARECER o sync, e a trava que protege o veículo nativo deixaria de valer.
 *
 * Foto não entra por aqui — o veículo nasce sem nenhuma, e é a régua de
 * publicação (`bloqueiosDePublicacao`, 8 fotos) que decide sozinha que ele
 * ainda não vai à vitrine. Nenhum filtro novo foi escrito para isso.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, papeis, full_name")
      .eq("id", user.id)
      .single();

    const body = await request.json().catch(() => null);

    // A régua inteira — quem cadastra, o que cada perfil preenche, o que o
    // banco infere e o que falta — mora em `decidirCadastro`, função pura.
    // Aqui fica só o transporte. A separação não é estética: com o gate dentro
    // do handler, a suíte só conseguia afirmar que o TEXTO dele existe no
    // arquivo, e a mutação da revisão mostrou o preço disso — desarmar
    // `ehStaff` ou `podeFazer` passava por todos os testes.
    //
    // Cliente da Garagem e investidor são `authenticated` sem ser equipe; a
    // primeira recusa lá dentro é justamente essa (regra 2-b).
    const decisao = decidirCadastro(body, profile);
    if (!decisao.ok) {
      return NextResponse.json(
        decisao.problemas
          ? { error: decisao.erro, problemas: decisao.problemas }
          : { error: decisao.erro },
        { status: decisao.status },
      );
    }
    const linha = decisao.linha;

    // `.select` sem `*`: a tela de sucesso só precisa do código gerado e do que
    // decide a publicação. Devolver a linha inteira mandaria de volta o custo
    // de aquisição para uma tela que pode estar aberta por quem não o vê.
    const { data, error } = await supabase
      .from("estoque_motors")
      .insert(linha)
      .select("id, marca, modelo, laudo_pericia, whatsapp_images")
      .single();

    if (error) {
      console.error("[Estoque] Falha ao cadastrar veículo:", error.message);
      // Banco sem a migração do cadastro nativo: sem a sequence, o `id` não
      // tem default e o INSERT sem id volta como violação de not-null — erro
      // cru que não diz a ninguém o que fazer. O PostgREST responde PGRST205
      // ou 42703 quando falta tabela/coluna; a mensagem amigável é a mesma.
      if (ehTabelaOuColunaAusente(error)) {
        return NextResponse.json(
          {
            error: mensagemDeMigracaoPendente(
              "20260829130000_f0k_cadastro_nativo_e_trava_do_sync.sql",
            ),
          },
          { status: 500 },
        );
      }
      return NextResponse.json(
        { error: "Não foi possível cadastrar o veículo. " + error.message },
        { status: 500 },
      );
    }

    await registrarAcaoSensivel(
      supabase,
      "Cadastrar veículo no painel",
      `Código ${data.id} · ${[linha.marca, linha.modelo, linha.versao].filter(Boolean).join(" ")}`,
      { id: user.id, nome: profile?.full_name ?? user.email },
    );

    return NextResponse.json({ ok: true, veiculo: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
