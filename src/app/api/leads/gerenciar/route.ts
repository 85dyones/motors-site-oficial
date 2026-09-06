import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehStaff, perfisDe, podeFazer } from "../../../../lib/permissoes";
import { ehTabelaOuColunaAusente } from "../../../../lib/erroDeSchema";
import {
  ehTipoDeDesfecho,
  ordenarEtapas,
  type EtapaDoFunil,
  type MotivoDoFunil,
} from "../../../../lib/funil";

export const dynamic = "force-dynamic";

/**
 * Leitura e gestão da fila de leads (telas A1 e A8).
 *
 * Rota separada de `/api/leads` de propósito: aquela é **pública** — recebe o
 * formulário de qualquer visitante — e esta lê PII. Misturar as duas num
 * arquivo é como um GET público nasce por engano no meio de um refactor.
 *
 * A matriz A17 diz que Marketing "vê só o volume agregado" no kanban. Aqui
 * isso é aplicado: quem não pode ver leads recebe apenas a CONTAGEM por
 * etapa, sem nome nem telefone.
 */
export async function GET(request: NextRequest) {
  try {
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
    // Cliente da Garagem é authenticated sem ser staff; normalizar sem
    // barrar o promoveria a "comercial".
    if (!ehStaff(profile)) {
      return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
    }
    const perfil = perfisDe(profile);
    const podeVer = podeFazer(perfil, "Ver e mover leads no kanban") === "faz";

    // `created_at`, não `criado_em`: a tabela `leads` é preexistente e já
    // trazia esse nome. Renomear quebraria consumidor externo — ver a nota na
    // migração 20260807210000.
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      if (ehTabelaOuColunaAusente(error)) {
        return NextResponse.json({ leads: [], migracaoPendente: true });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const leads = data ?? [];

    // Marketing enxerga volume, não pessoas — regra da matriz A17.
    if (!podeVer) {
      const porSituacao: Record<string, number> = {};
      for (const l of leads) porSituacao[l.situacao] = (porSituacao[l.situacao] ?? 0) + 1;
      return NextResponse.json({
        somenteAgregado: true,
        total: leads.length,
        porSituacao,
      });
    }

    // ------------------------------------------------------------------------
    // A conversa no Chatwoot, quando já existe
    // ------------------------------------------------------------------------
    // Decisão do dono em 2026-08-31: o card leva para dentro do Chatwoot em vez
    // do `wa.me`, para o consultor parar de responder pelo WhatsApp pessoal.
    //
    // Numa consulta separada, e não num `select` aninhado: `atendimentos` é
    // escrita pelo n8n com a chave de serviço e SÓ agora ganhou policy de
    // leitura (migração 20260831140000). Se a leitura falhar — policy ausente,
    // tabela ausente num ambiente atrasado —, o kanban continua inteiro e cai
    // no `wa.me`, que é o degrau que `linkDeConversa` já implementa. Perder o
    // link do Chatwoot é um botão pior; derrubar a lista de leads é a tela.
    //
    // A conversa mais RECENTE ganha: um cliente que volta meses depois abre
    // conversa nova, e é nela que o consultor tem de responder.
    const conversaPorLead = new Map<string, number>();
    if (leads.length > 0) {
      const { data: atendimentos, error: erroAtendimento } = await supabase
        .from("atendimentos")
        .select("lead_id, chatwoot_conversation_id, iniciado_em, created_at")
        .in("lead_id", leads.map((l: { id: string }) => l.id))
        .not("chatwoot_conversation_id", "is", null);

      if (erroAtendimento) {
        console.warn("[Leads] Sem atendimento do Chatwoot:", erroAtendimento.message);
      } else {
        const maisRecentePrimeiro = [...(atendimentos ?? [])].sort((a, b) =>
          String(b.iniciado_em ?? b.created_at ?? "").localeCompare(
            String(a.iniciado_em ?? a.created_at ?? ""),
          ),
        );
        for (const a of maisRecentePrimeiro) {
          if (a.lead_id && !conversaPorLead.has(a.lead_id)) {
            conversaPorLead.set(a.lead_id, Number(a.chatwoot_conversation_id));
          }
        }
      }
    }
    for (const l of leads as Array<Record<string, unknown>>) {
      l.chatwoot_conversation_id = conversaPorLead.get(String(l.id)) ?? null;
    }

    // Quem pode receber um lead. Vem junto na mesma resposta em vez de uma
    // rota nova porque `/api/users` exige Admin — e quem atende lead é
    // Comercial, que precisa escolher o responsável e não pode listar
    // usuários. Aqui a permissão já foi checada acima.
    //
    // `responsavel` na tabela é TEXTO, não FK (ver migração 20260807210000):
    // o consultor pode sair da empresa e o histórico do lead continua legível.
    // Esta lista serve para escolher sem erro de digitação, não para virar
    // chave estrangeira.
    let atendentes: { nome: string }[] = [];
    const { data: perfis } = await supabase
      .from("profiles")
      .select("full_name, role, papeis")
      .in("role", ["admin", "comercial"])
      .order("full_name");
    if (perfis) {
      atendentes = perfis
        .map((p) => ({ nome: (p.full_name || "").trim() }))
        .filter((p) => p.nome);
    }

    // As colunas do kanban e os motivos de desfecho vêm na MESMA resposta
    // (2026-08-28). Desde que o funil virou editável, uma tela que buscasse as
    // etapas depois dos leads desenharia por um instante o funil errado — e um
    // lead numa etapa que a tela ainda não conhece não tem coluna para cair.
    // Uma resposta só elimina a janela.
    const [etapasBanco, motivosBanco] = await Promise.all([
      supabase.from("funil_etapas").select("*").order("ordem"),
      supabase.from("funil_motivos").select("*").eq("ativo", true).order("ordem"),
    ]);

    return NextResponse.json({
      leads,
      atendentes,
      etapas: ordenarEtapas((etapasBanco.data ?? []) as EtapaDoFunil[]),
      motivos: (motivosBanco.data ?? []) as MotivoDoFunil[],
      // Antes da migração do funil as tabelas não existem; a tela cai no funil
      // fixo de sempre em vez de ficar sem colunas.
      funilPendente: Boolean(etapasBanco.error && ehTabelaOuColunaAusente(etapasBanco.error)),
      // Quem vê o atalho de "Configurar funil" no cabeçalho. A tela de
      // configuração tem gate próprio; isto só evita oferecer uma porta que
      // vai bater na cara de quem clicar.
      podeConfigurar: podeFazer(perfil, "Configurar o funil de vendas") === "faz",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Move o lead no kanban, atribui responsável, registra contato ou fecha o
 * negócio com motivo.
 *
 * ---------------------------------------------------------------------------
 * A regra que este PATCH passa a impor: etapa terminal exige MOTIVO
 * ---------------------------------------------------------------------------
 * 2026-08-28: *"uma opção de dar o negócio como ganho ou perdido, selecionando
 * opções para mensurar em relatórios depois"*.
 *
 * O "depois" só existe se o motivo for coletado na hora. Quem opera funil há
 * anos diz a mesma coisa por outras palavras — o motivo da perda é o dado mais
 * valioso do CRM, e é o primeiro que se perde quando é opcional. Por isso a
 * recusa acontece AQUI, e não só na tela: uma validação que mora apenas no
 * componente vira opcional no dia em que alguém chamar a rota de outro lugar.
 *
 * A recusa devolve `motivo_obrigatorio: true` para a tela saber abrir a caixa
 * de escolha em vez de mostrar um erro cru.
 *
 * ⚠️ Só vale para a MUDANÇA de etapa. Lead que já estava em "Fechado" desde
 * antes desta migração não é cobrado retroativamente: cobrar do passado
 * travaria o card sem que ninguém tivesse feito nada errado.
 */
export async function PATCH(request: NextRequest) {
  try {
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
    if (podeFazer(perfisDe(profile), "Ver e mover leads no kanban") !== "faz") {
      return NextResponse.json({ error: "Seu perfil não move leads" }, { status: 403 });
    }

    const body = await request.json();
    const {
      id,
      situacao,
      responsavel,
      observacoes,
      desfecho_motivo,
      desfecho_valor,
      desfecho_nota,
      contato,
    } = body;
    if (!id) {
      return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
    }

    // "Falei com o cliente" — o clique no WhatsApp do card. Vai por RPC porque
    // o registro no rastro é escrita de sistema, não de usuário (a função é
    // SECURITY DEFINER e checa staff por dentro).
    if (contato) {
      const { error: erroContato } = await supabase.rpc("registrar_contato_do_lead", {
        p_lead: id,
        p_canal: typeof contato === "string" ? contato : "whatsapp",
      });
      if (erroContato) {
        // Antes da migração do funil a função não existe. Registrar contato é
        // um ganho, não um requisito: a tela não pode parar de funcionar por
        // causa dele.
        if (!ehTabelaOuColunaAusente(erroContato) && erroContato.code !== "PGRST202") {
          return NextResponse.json({ error: erroContato.message }, { status: 500 });
        }
      }
      if (situacao === undefined && responsavel === undefined && observacoes === undefined) {
        return NextResponse.json({ ok: true });
      }
    }

    const atualizacao: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
    if (situacao !== undefined) atualizacao.situacao = situacao;
    if (responsavel !== undefined) atualizacao.responsavel = responsavel;
    if (observacoes !== undefined) atualizacao.observacoes = observacoes;

    if (situacao !== undefined) {
      const { data: etapa, error: erroEtapa } = await supabase
        .from("funil_etapas")
        .select("chave, rotulo, tipo")
        .eq("chave", situacao)
        .maybeSingle();

      // Migração pendente: segue com o comportamento antigo em vez de travar a
      // tela por causa de uma tabela que ainda não existe.
      if (erroEtapa && !ehTabelaOuColunaAusente(erroEtapa)) {
        return NextResponse.json({ error: erroEtapa.message }, { status: 500 });
      }
      if (!erroEtapa && !etapa) {
        return NextResponse.json(
          { error: `Etapa desconhecida: "${situacao}".` },
          { status: 422 },
        );
      }

      // `ehTipoDeDesfecho` e não a dupla `"ganho" || "perdido"` que estava
      // aqui: ela não conhecia `descartado` (2026-08-28) e deixava o descarte
      // passar sem motivo — a mesma metade que faltava na tela. Uma trava que
      // se esquece de um dos tipos é uma trava que não existe para ele.
      if (etapa && ehTipoDeDesfecho(etapa.tipo)) {
        const motivo = typeof desfecho_motivo === "string" ? desfecho_motivo.trim() : "";
        if (!motivo) {
          return NextResponse.json(
            {
              error:
                `Para mover para "${etapa.rotulo}" é preciso escolher o motivo — ` +
                `é ele que o relatório do funil agrupa.`,
              motivo_obrigatorio: true,
              tipo: etapa.tipo,
            },
            { status: 422 },
          );
        }

        const { data: motivoBanco } = await supabase
          .from("funil_motivos")
          .select("chave, tipo")
          .eq("chave", motivo)
          .maybeSingle();

        if (!motivoBanco) {
          return NextResponse.json(
            { error: `Motivo desconhecido: "${motivo}".` },
            { status: 422 },
          );
        }
        // Motivo de ganho num negócio perdido faria o relatório somar peras com
        // maçãs — e o erro só apareceria no gráfico, meses depois.
        if (motivoBanco.tipo !== etapa.tipo) {
          return NextResponse.json(
            {
              error:
                `O motivo "${motivo}" é de ${motivoBanco.tipo}, e a etapa ` +
                `"${etapa.rotulo}" é de ${etapa.tipo}.`,
            },
            { status: 422 },
          );
        }

        atualizacao.desfecho_motivo = motivo;
        atualizacao.desfecho_valor = valorOuNulo(desfecho_valor);
        atualizacao.desfecho_nota =
          typeof desfecho_nota === "string" && desfecho_nota.trim()
            ? desfecho_nota.trim()
            : null;
      }
    }

    const { error } = await supabase.from("leads").update(atualizacao).eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** Valor do negócio ganho. Vazio é nulo — zero seria uma venda de R$ 0. */
function valorOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(/\./g, "").replace(",", ".")) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Eliminação a pedido do titular — LGPD art. 18, VI.
 *
 * Existe porque a retenção é indeterminada (decisão do dono em 2026-08-07):
 * sem expurgo automático, apagar precisa ser possível à mão. Restrito a
 * Admin, e não a quem apenas atende o lead: apagar dado de titular é ato de
 * controlador, não de operação diária.
 */
export async function DELETE(request: NextRequest) {
  try {
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
    // Soma os papéis (multi-papel, 2026-08-19): admin em segundo lugar é admin.
    if (!perfisDe(profile).includes("admin")) {
      return NextResponse.json(
        { error: "Só o Administrador exclui lead (pedido de titular)" },
        { status: 403 },
      );
    }

    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
    }

    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
