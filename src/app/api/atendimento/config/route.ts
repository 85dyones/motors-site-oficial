import { NextResponse, type NextRequest } from "next/server";
import { liberarLeadsDoAssistente, lojaDoAtendimento } from "../../../../lib/atendimento-servidor";
import { quemConfiguraOAtendimento } from "../../../../lib/autorizacaoDoAtendimento";
import { CONFIG_DE_FABRICA, MIGRACAO_DO_ATENDIMENTO, configValida, decidirConfig } from "../../../../lib/configDoAtendimento";
import { ehTabelaOuColunaAusente, mensagemDeMigracaoPendente } from "../../../../lib/erroDeSchema";
import { configDaEvolution } from "../../../../lib/evolution";
import { createAdminSupabaseClient } from "../../../../lib/supabase-server";

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
 * Com a chave de serviço, a RLS não filtra: as leituras e a gravação vão
 * pela loja de `org_padrao()`. Desligar o assistente devolve à equipe, na
 * hora, todo lead que estava com ele (`liberarLeadsDoAssistente`) — sem isso
 * eles ficariam com o SLA pausado e ninguém respondendo.
 *
 * O GET também diz o que falta nas integrações — chave da DeepSeek, Evolution
 * e o token do n8n —, para a tela mostrar por que ligar não vai funcionar
 * antes de alguém ligar. Só se diz SE existe, nunca o valor.
 */
function integracoes() {
  return {
    deepseek: Boolean((process.env.DEEPSEEK_API_KEY || "").trim()),
    evolution: configDaEvolution() !== null,
    n8n: Boolean((process.env.ATENDIMENTO_MOTOR_TOKEN || "").trim()),
  };
}

export async function GET() {
  try {
    const { recusa } = await quemConfiguraOAtendimento();
    if (recusa) return recusa;
    const supabase = createAdminSupabaseClient();
    const loja = await lojaDoAtendimento(supabase);
    if (!loja) return NextResponse.json({ error: "Loja ilegível (org_padrao)." }, { status: 500 });
    const { data, error } = await supabase.from("atendimento_config").select("*").eq("org_id", loja).maybeSingle();
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
    const { nome, recusa } = await quemConfiguraOAtendimento();
    if (recusa) return recusa;
    const decisao = decidirConfig(await request.json().catch(() => null));
    if (!decisao.ok) return NextResponse.json({ error: decisao.erro }, { status: 400 });

    const supabase = createAdminSupabaseClient();
    const loja = await lojaDoAtendimento(supabase);
    if (!loja) return NextResponse.json({ error: "Loja ilegível (org_padrao)." }, { status: 500 });
    const linha = { ...decisao.linha, org_id: loja, atualizado_em: new Date().toISOString(), atualizado_por: nome };
    const { data: atual, error: erroLer } = await supabase
      .from("atendimento_config")
      .select("id, ativo")
      .eq("org_id", loja)
      .maybeSingle();
    if (erroLer) {
      const mensagem = ehTabelaOuColunaAusente(erroLer) ? mensagemDeMigracaoPendente(MIGRACAO_DO_ATENDIMENTO) : erroLer.message;
      return NextResponse.json({ error: mensagem }, { status: ehTabelaOuColunaAusente(erroLer) ? 503 : 500 });
    }
    const gravar = (campos: Record<string, unknown>) =>
      atual?.id
        ? supabase.from("atendimento_config").update(campos).eq("id", atual.id).select("*").single()
        : supabase.from("atendimento_config").insert(campos).select("*").single();
    let gravacao = await gravar(linha);
    // Banco sem a 20261026120000 não tem a coluna da base parada: o resto da
    // configuração grava igual, e a base fica para quando a migração entrar.
    if (gravacao.error && "base" in linha && ehTabelaOuColunaAusente(gravacao.error)) {
      const semBase: Record<string, unknown> = { ...linha };
      delete semBase.base;
      gravacao = await gravar(semBase);
    }
    if (gravacao.error) {
      // 23514: um CHECK do banco recusou — é a mesma regra da tela, dita pelo banco.
      const status = gravacao.error.code === "23514" ? 400 : 500;
      return NextResponse.json({ error: gravacao.error.message }, { status });
    }
    const config = configValida(gravacao.data);
    let liberados = 0;
    if (atual?.ativo === true && !config.ativo) {
      // Se a liberação falhar no meio, a rodada do n8n termina o serviço:
      // com o assistente desligado, ela libera o que sobrou.
      liberados = await liberarLeadsDoAssistente(supabase).catch((erro) => {
        console.error("[Atendimento] Leads não liberados ao desligar:", erro);
        return 0;
      });
    }
    return NextResponse.json({ ok: true, config, liberados, integracoes: integracoes() });
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Erro inesperado" }, { status: 500 });
  }
}
