import { NextResponse, type NextRequest } from "next/server";
import { CONFIG_DE_FABRICA, MIGRACAO_DO_ATENDIMENTO, configValida, decidirConfig } from "../../../../lib/configDoAtendimento";
import { ehTabelaOuColunaAusente, mensagemDeMigracaoPendente } from "../../../../lib/erroDeSchema";
import { configDaEvolution } from "../../../../lib/evolution";
import { ACAO_CONFIGURAR_ATENDIMENTO, ehStaff, perfisDe, podeFazer } from "../../../../lib/permissoes";
import { createAdminSupabaseClient, createServerSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * A configuração do assistente (2026-10-20). Ler e gravar: Admin e Gestor
 * (linha "Configurar o atendimento por IA" da matriz).
 *
 * A gravação vai pela chave de serviço porque a tabela não tem policy de
 * escrita — a mesma régua de `atendimentos`: a porta é a ROTA, que confere
 * o papel antes. O que se grava passa por `decidirConfig`, que recusa (400)
 * em vez de corrigir calado.
 *
 * O GET também diz o que falta nas integrações — chave da DeepSeek, Evolution
 * e o token do n8n —, para a tela mostrar por que ligar não vai funcionar
 * antes de alguém ligar. Só se diz SE existe, nunca o valor.
 */
async function quemPede(): Promise<{ nome: string | null; recusa: NextResponse | null }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { nome: null, recusa: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  const { data: perfil } = await supabase
    .from("profiles")
    .select("role, papeis, full_name, is_active")
    .eq("id", user.id)
    .single();
  if (!ehStaff(perfil) || perfil?.is_active !== true) {
    return { nome: null, recusa: NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 }) };
  }
  if (podeFazer(perfisDe(perfil), ACAO_CONFIGURAR_ATENDIMENTO) !== "faz") {
    return { nome: null, recusa: NextResponse.json({ error: "Seu perfil não configura o atendimento" }, { status: 403 }) };
  }
  return { nome: perfil?.full_name?.trim() || null, recusa: null };
}

function integracoes() {
  return {
    deepseek: Boolean((process.env.DEEPSEEK_API_KEY || "").trim()),
    evolution: configDaEvolution() !== null,
    n8n: Boolean((process.env.ATENDIMENTO_MOTOR_TOKEN || "").trim()),
  };
}

export async function GET() {
  try {
    const { recusa } = await quemPede();
    if (recusa) return recusa;
    const { data, error } = await createAdminSupabaseClient().from("atendimento_config").select("*").limit(1).maybeSingle();
    if (error) {
      if (ehTabelaOuColunaAusente(error)) {
        return NextResponse.json({
          config: CONFIG_DE_FABRICA,
          fabrica: CONFIG_DE_FABRICA,
          integracoes: integracoes(),
          migracaoPendente: true,
          aviso: mensagemDeMigracaoPendente(MIGRACAO_DO_ATENDIMENTO),
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ config: configValida(data), fabrica: CONFIG_DE_FABRICA, integracoes: integracoes() });
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Erro inesperado" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { nome, recusa } = await quemPede();
    if (recusa) return recusa;
    const decisao = decidirConfig(await request.json().catch(() => null));
    if (!decisao.ok) return NextResponse.json({ error: decisao.erro }, { status: 400 });

    const supabase = createAdminSupabaseClient();
    const linha = { ...decisao.linha, atualizado_em: new Date().toISOString(), atualizado_por: nome };
    const { data: atual, error: erroLer } = await supabase.from("atendimento_config").select("id").limit(1).maybeSingle();
    if (erroLer) {
      const mensagem = ehTabelaOuColunaAusente(erroLer) ? mensagemDeMigracaoPendente(MIGRACAO_DO_ATENDIMENTO) : erroLer.message;
      return NextResponse.json({ error: mensagem }, { status: ehTabelaOuColunaAusente(erroLer) ? 503 : 500 });
    }
    const gravacao = atual?.id
      ? await supabase.from("atendimento_config").update(linha).eq("id", atual.id).select("*").single()
      : await supabase.from("atendimento_config").insert(linha).select("*").single();
    if (gravacao.error) {
      // 23514: um CHECK do banco recusou — é a mesma regra da tela, dita pelo banco.
      const status = gravacao.error.code === "23514" ? 400 : 500;
      return NextResponse.json({ error: gravacao.error.message }, { status });
    }
    return NextResponse.json({ ok: true, config: configValida(gravacao.data), integracoes: integracoes() });
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Erro inesperado" }, { status: 500 });
  }
}
