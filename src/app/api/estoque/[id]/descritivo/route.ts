import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";
import { campoNegadoAoPerfil, ehStaff, perfisDe } from "../../../../../lib/permissoes";
import { normalizarId } from "../../../../../lib/estoqueEscrita";
import { montarDossie } from "../../../../../lib/descritivo/dossie";
import { validarDescritivo, type CampoDeTexto } from "../../../../../lib/descritivo/validacao";
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

    const { data: veiculo } = await supabase
      .from("estoque_motors")
      .select("*")
      .eq("id", normalizarId(id))
      .maybeSingle();

    if (!veiculo) {
      return NextResponse.json({ error: "Veículo não encontrado" }, { status: 404 });
    }

    const dossie = montarDossie(veiculo);
    const saida = await gerarTexto({
      dossie,
      campo,
      chave: process.env.OPENAI_API_KEY ?? "",
    });

    if (!saida.ok) {
      return NextResponse.json({ error: saida.motivo }, { status: saida.status });
    }

    const motivos = validarDescritivo(saida.texto, dossie, campo);
    if (motivos.length > 0) {
      return NextResponse.json({ error: "O texto gerado não passou na conferência.", motivos, texto: saida.texto }, { status: 422 });
    }

    return NextResponse.json({
      texto: saida.texto,
      caracteres: saida.texto.length,
      periciaAprovada: dossie.periciaAprovada,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Falha inesperada" }, { status: 500 });
  }
}
