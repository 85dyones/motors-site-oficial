import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { sessaoDaAgenda } from "../../../lib/agenda-servidor";
import { leadsAVistaDe } from "../../../lib/gestaoDoLead-servidor";
import {
  AVISO_DE_LEADS_INDISPONIVEIS,
  colunasParaQuemLe,
  filtroDeBusca,
  papeisQueContam,
  paraQuemPergunta,
  semDocumento,
  termoDeBusca,
  type PessoaDaAgenda,
} from "../../../lib/agenda";

export const dynamic = "force-dynamic";

/**
 * A agenda de pessoas — leitura unificada e cadastro.
 *
 * 2026-08-24, pedido do dono: *"precisamos ter uma aba clientes... o revenda
 * tem uma área de clientes sejam internos ou externos, fornecedores... pra
 * organizar tudo e termos como gerenciar"*.
 *
 * Lê `public.agenda_de_pessoas`, a view que une os quatro cadastros
 * (migração 20260824190000). A porta é a RLS de cada tabela-base, aplicada na
 * pele de quem consulta — a view é `security_invoker`, e a autoconferência da
 * migração prova isso empiricamente, vestindo a pele de um não-staff.
 *
 * **Paginação de verdade, desde o primeiro dia.** Em 2026-08-24 um lançamento
 * ficou invisível porque a lista de contas trazia tudo em ordem crescente e a
 * conta nova era a 709ª — não havia erro, havia sepultamento. A agenda nasce
 * com `range` e `count: exact`, e o total viaja na resposta: a tela mostra
 * "1–50 de N" e ninguém precisa adivinhar se está vendo o conjunto ou uma
 * fatia dele.
 *
 * **Quem lê e quem escreve (05/10/2026).** Decisão do dono: *"A agenda precisa
 * ser vista por todos, o lead não."* O GET é de toda a equipe ativa; o POST,
 * de quem já cadastrava (`sessaoDaAgenda`). Na pessoa de origem "lead", a
 * etapa e as anotações só viajam para quem enxerga aquele lead: a view já as
 * manda NULL (migração 20261005150000) quando a RLS por escopo está de pé, e
 * `paraQuemPergunta` repete o corte aqui para a regra não depender de a
 * 20261003130000 estar aplicada.
 *
 * **O CPF/CNPJ é de quem gerencia.** Quem só lê (Marketing, SDR) não recebe
 * `documento`, que nem é pedido ao banco, e a busca dele não varre a coluna.
 */

const POR_PAGINA_PADRAO = 50;
const TETO_POR_PAGINA = 200;

const COLUNAS = "origem, id, nome, papel, especialidade, documento, telefone, email, cidade, observacoes, ativo, created_at";

export async function GET(request: NextRequest) {
  try {
    const sessao = await sessaoDaAgenda("leitura");
    if (sessao.recusa) return sessao.recusa;
    const { supabase, visao, podeGerenciar } = sessao;

    const p = request.nextUrl.searchParams;

    let query = supabase
      .from("agenda_de_pessoas")
      .select(colunasParaQuemLe(COLUNAS, podeGerenciar), { count: "exact" });

    const busca = termoDeBusca(p.get("busca"));
    if (busca) query = query.or(filtroDeBusca(busca, podeGerenciar));

    const papel = p.get("papel");
    if (papel) {
      const aceitos = papeisQueContam(papel);
      // Papel desconhecido não vira "traga tudo": vira lista vazia com o
      // motivo dito. Filtro que silenciosamente não filtra é pior que erro.
      if (aceitos.length === 0) {
        return NextResponse.json(
          { error: `Papel desconhecido: "${papel}"` },
          { status: 400 },
        );
      }
      query = query.in("papel", aceitos);
    }

    const origem = p.get("origem");
    if (origem) query = query.eq("origem", origem);

    // Padrão: só quem está ativo. Inativo continua no banco e continua
    // alcançável por `ativo=todos` — a agenda é o histórico, o filtro é da
    // tela.
    const ativo = p.get("ativo") ?? "sim";
    if (ativo === "sim") query = query.eq("ativo", true);
    if (ativo === "nao") query = query.eq("ativo", false);

    const limiteBruto = parseInt(p.get("limite") ?? "", 10);
    const limite = Number.isFinite(limiteBruto) && limiteBruto > 0
      ? Math.min(limiteBruto, TETO_POR_PAGINA)
      : POR_PAGINA_PADRAO;
    const paginaBruta = parseInt(p.get("pagina") ?? "", 10);
    const pagina = Number.isFinite(paginaBruta) && paginaBruta > 0 ? paginaBruta : 1;

    const inicio = (pagina - 1) * limite;
    query = query
      .order("nome", { ascending: true })
      // Desempate estável: sem ele, dois homônimos podem trocar de lugar entre
      // uma página e outra e um deles some da paginação.
      .order("id", { ascending: true })
      .range(inicio, inicio + limite - 1);

    const { data: pessoas, error, count } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const linhas = (pessoas ?? []) as unknown as PessoaDaAgenda[];
    const { aVista, falhou } = await leadsAVistaDe(
      supabase,
      visao,
      linhas.filter((l) => l.origem === "lead").map((l) => l.id),
    );

    return NextResponse.json({
      pessoas: semDocumento(paraQuemPergunta(linhas, visao.escopo, aVista), podeGerenciar),
      // Etapa e link que somem sem aviso se leem como "este lead não é seu".
      ...(falhou ? { aviso: AVISO_DE_LEADS_INDISPONIVEIS } : {}),
      total: count ?? 0,
      pagina,
      limite,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Cadastrar sempre cria em `parceiros`.
 *
 * As outras três origens têm porta própria e por bons motivos: cliente do
 * Ciclo nasce no fechamento de venda (com CPF único e consentimento de LGPD),
 * investidor nasce na tela de aportes, prestador da rede nasce com comissão.
 * Abrir aqui um segundo caminho para qualquer um deles criaria o duplicado
 * que esta tela existe para encontrar.
 */
export async function POST(request: NextRequest) {
  try {
    const sessao = await sessaoDaAgenda("escrita");
    if (sessao.recusa) return sessao.recusa;
    const { supabase, userId } = sessao;

    const body = await request.json();
    const nome = typeof body.nome === "string" ? body.nome.trim() : "";
    const tipo = body.papel ?? body.tipo;

    if (!nome) {
      return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
    }
    if (!["fornecedor", "cliente", "ambos"].includes(tipo)) {
      return NextResponse.json(
        { error: "Papel deve ser fornecedor, cliente ou ambos" },
        { status: 400 },
      );
    }

    const { data: pessoa, error } = await supabase
      .from("parceiros")
      .insert({
        nome,
        tipo,
        documento: body.documento?.trim() || null,
        telefone: body.telefone?.trim() || null,
        email: body.email?.trim() || null,
        cidade: body.cidade?.trim() || null,
        observacoes: body.observacoes?.trim() || null,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pessoa });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
