import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";
import { campoNegadoAoPerfil, ehStaff, perfisDe } from "../../../../../lib/permissoes";
import { normalizarId } from "../../../../../lib/estoqueEscrita";
import { montarDossie } from "../../../../../lib/descritivo/dossie";
import { primeiraFraseDe, validarDescritivo, type CampoDeTexto } from "../../../../../lib/descritivo/validacao";
import { gerarTexto } from "../../../../../lib/descritivo/gerar";

export const dynamic = "force-dynamic";

/**
 * Gera uma SUGESTÃO de texto para o veículo. NÃO grava.
 *
 * A gravação continua no PATCH da rota irmã, que já valida campo por perfil e
 * já alimenta o histórico do veículo — uma porta de escrita só.
 *
 * O veículo é lido do BANCO, nunca do corpo: senão bastaria mandar
 * `pericia: "Aprovado"` no JSON para liberar a afirmação de laudo aprovado
 * num carro cujo exame não fechou.
 */

const CAMPOS: CampoDeTexto[] = ["descricao", "descricao_seo"];

/**
 * Uma linha por geração no log da Vercel, com o prefixo `[descritivo]` para a
 * busca achar.
 *
 * Existe desde 14/09/2026, por decisão do dono. Até ali a rota não registrava
 * nada: o log da Vercel mostrava quatro respostas 422 em 13 e 14/09, e nenhuma
 * dizia o campo, a regra, os tokens ou o tempo da chamada.
 *
 * Só medidas e nomes de regra. O texto gerado fica fora: quem pediu já o vê no
 * painel, aprovado ou reprovado.
 */
type Registro = {
  veiculo: string;
  campo: CampoDeTexto;
  status: number;
  ms: number;
  regras?: string[];
  caracteres?: number;
  primeiraFrase?: number;
  tokensEntrada?: number;
  tokensSaida?: number;
  motivo?: string;
};

function registrar(registro: Registro) {
  console.info("[descritivo]", JSON.stringify(registro));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, papeis, full_name")
      .eq("id", user.id)
      .single();

    // Cliente da Garagem é authenticated sem ser staff; normalizar sem barrar
    // o promoveria a "comercial".
    if (!ehStaff(profile)) {
      return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
    }
    const perfil = perfisDe(profile);

    const body = await request.json().catch(() => ({}));
    const campo = body?.campo as CampoDeTexto;
    if (!CAMPOS.includes(campo)) {
      return NextResponse.json(
        { error: `Campo inválido. Esperado ${CAMPOS.join(" ou ")}.` },
        { status: 400 },
      );
    }

    // Quem não grava o campo não gera sugestão para ele. Mesma régua do PATCH.
    const negado = campoNegadoAoPerfil(perfil, [campo]);
    if (negado) {
      return NextResponse.json(
        { error: `Seu perfil não altera "${negado.campo}" (${negado.acao})` },
        { status: 403 },
      );
    }

    const { data: veiculo, error: erroVeiculo } = await supabase
      .from("estoque_motors")
      .select("*")
      .eq("id", normalizarId(id))
      .maybeSingle();

    // Mesma ordem da rota irmã (GET de api/estoque/[id]/route.ts): falha de
    // banco, de rede ou bloqueio de RLS é 500 com a mensagem, não 404. Sem
    // isto, `data: null` por erro de leitura respondia "Veículo não
    // encontrado" para um carro que a pessoa está editando naquele instante.
    if (erroVeiculo) {
      return NextResponse.json({ error: erroVeiculo.message }, { status: 500 });
    }
    if (!veiculo) {
      return NextResponse.json({ error: "Veículo não encontrado" }, { status: 404 });
    }

    const dossie = montarDossie(veiculo);
    const inicio = Date.now();
    const saida = await gerarTexto({
      dossie,
      campo,
      chave: process.env.OPENAI_API_KEY ?? "",
    });
    const ms = Date.now() - inicio;

    if (!saida.ok) {
      registrar({ veiculo: id, campo, status: saida.status, ms, motivo: saida.motivo });
      return NextResponse.json({ error: saida.motivo }, { status: saida.status });
    }

    const motivos = validarDescritivo(saida.texto, dossie, campo);
    const medidas = {
      veiculo: id,
      campo,
      ms,
      regras: motivos.map((m) => m.regra),
      caracteres: saida.texto.length,
      primeiraFrase: primeiraFraseDe(saida.texto).length,
      tokensEntrada: saida.entrada,
      tokensSaida: saida.saida,
    };
    if (motivos.length > 0) {
      registrar({ ...medidas, status: 422 });
      return NextResponse.json({ error: "O texto gerado não passou na conferência.", motivos, texto: saida.texto }, { status: 422 });
    }

    registrar({ ...medidas, status: 200 });
    return NextResponse.json({
      texto: saida.texto,
      caracteres: saida.texto.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Falha inesperada" }, { status: 500 });
  }
}
