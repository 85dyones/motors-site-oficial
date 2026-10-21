import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createAdminSupabaseClient, createServerSupabaseClient } from "../../../../lib/supabase-server";
import { avisarEntregaPendente } from "../../../../lib/atendimento-servidor";
import { ehStaff, perfisDe, podeFazer } from "../../../../lib/permissoes";
import {
  AVISO_DE_RESPONSAVEL_OBRIGATORIO,
  comEscopoDeLeads,
  leadNoEscopo,
  pedeLeadSemResponsavel,
  podeRemoverResponsavel,
  visaoDeLeads,
} from "../../../../lib/escopoDeLeads";
import { ehTabelaOuColunaAusente } from "../../../../lib/erroDeSchema";
import { lerLeadsDaLoja, passeDaEquipe } from "../../../../lib/leadsDaLoja";
import {
  atendentesDoFluxo,
  recusaDeResponsavel,
  type PerfilDoFluxo,
} from "../../../../lib/responsavelDoLead";
import { AVISO_DE_REF_INVALIDA, normalizarRef, padraoDaRef } from "../../../../lib/leadsKanban";
import {
  AVISO_DE_BUSCA_INVALIDA,
  filtroDaBusca,
  ultimaInteracaoPorLead,
  type InteracaoDoLead,
} from "../../../../lib/gestaoDoLead";
import { lerValorDaAvaliacao } from "../../../../lib/avaliacaoDoLead";
import { veiculosDepoisDoDesfecho } from "../../../../lib/veiculosDeInteresse-servidor";
import { limparEtiquetas } from "../../../../lib/etiquetas";
import { BUCKET_DOS_ANEXOS } from "../../../../lib/anexosDoAtendimento";
import {
  contarPassagensCreditadas,
  etiquetarPassagemDoSdr,
  etiquetasConhecidas,
  leadsGuardamEtiquetas,
  maisRecentePrimeiro,
} from "../../../../lib/etiquetasDoLead";
import { pixelIdDasSettings, qualificarNoMeta } from "../../../../lib/qualificacaoParaMeta-servidor";
import {
  decidirDesfecho,
  ehTipoDeDesfecho,
  ordenarEtapas,
  type EtapaDoDesfecho,
  type EtapaDoFunil,
  type LeadDoDesfecho,
  type MotivoDoFunil,
  type TipoDeDesfecho,
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
      .select("role, papeis, full_name, is_active")
      .eq("id", user.id)
      .single();
    // Cliente da Garagem é authenticated sem ser staff; normalizar sem
    // barrar o promoveria a "comercial".
    if (!ehStaff(profile)) {
      return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
    }
    // Perfil desativado não lê a fila (03/10/2026): a sessão de quem saiu da
    // loja pode seguir viva, e `ehStaff` não olha `is_active`. Com a RLS de
    // `leads` por escopo o banco já devolveria zero linhas; sem ela, não.
    // `!== true`, como em `sessaoDeLeads`: perfil sem a coluna lida também
    // fica de fora, e não só o que diz `false`.
    if (profile?.is_active !== true) {
      return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
    }
    const perfil = perfisDe(profile);
    const podeVer = podeFazer(perfil, "Ver e mover leads no kanban") === "faz";
    // Quais leads esta pessoa enxerga (regra de 03/10/2026, `escopoDeLeads`).
    const visao = visaoDeLeads(perfil, profile?.full_name);

    // ------------------------------------------------------------------------
    // `?ref=` — a busca pela referência que o cliente leu na mensagem
    // ------------------------------------------------------------------------
    // A mensagem de WhatsApp de quem tem rastreio termina em "(Ref: 0DCB1CDC)",
    // os 8 primeiros do `ag_uid`. O código existe para achar o lead quando a
    // conversa chega de outro número, e até 2026-09-17 não havia onde procurá-lo.
    //
    // A busca não é rota à parte: é esta mesma leitura com um filtro a mais. O
    // card do lead achado precisa de tudo o que o card da fila tem — a conversa
    // pelo WhatsApp da loja, o estado do assistente, as etapas do funil —, e uma resposta
    // de outro formato faria a tela desenhar o funil padrão no lugar do
    // configurado.
    //
    // As recusas vêm ANTES de qualquer leitura. A busca devolve nome e telefone,
    // então quem não vê lead recebe 403 — e não o agregado que Marketing recebe
    // na fila: a contagem de uma busca por código já diz se o lead existe.
    const refPedida = new URL(request.url).searchParams.get("ref");
    if (refPedida !== null && !podeVer) {
      return NextResponse.json(
        { error: "Seu perfil não consulta lead por referência" },
        { status: 403 },
      );
    }
    // ------------------------------------------------------------------------
    // `?busca=` — a busca única: nome, telefone ou referência (03/10/2026)
    // ------------------------------------------------------------------------
    // Um campo só no lugar dos três. Quem decide o que foi digitado é
    // `filtroDaBusca` (`lib/gestaoDoLead`); a referência reconhecida ali segue
    // pelo MESMO filtro do `?ref=`, que continua valendo como sempre. Com os
    // dois na URL, vale o `?ref=`.
    //
    // As recusas são as da referência, e pela mesma razão: a busca devolve
    // nome e telefone, então quem não vê lead recebe 403 antes de qualquer
    // leitura. E ela obedece ao escopo, logo abaixo: "na equipe inteira" vale
    // só para quem vê a equipe.
    const buscaPedida = refPedida === null ? new URL(request.url).searchParams.get("busca") : null;
    if (buscaPedida !== null && !podeVer) {
      return NextResponse.json({ error: "Seu perfil não busca leads" }, { status: 403 });
    }
    const filtro = buscaPedida === null ? null : filtroDaBusca(buscaPedida);
    if (buscaPedida !== null && !filtro) {
      return NextResponse.json({ error: AVISO_DE_BUSCA_INVALIDA, codigo: "busca_invalida" }, { status: 400 });
    }

    const ref = refPedida === null ? (filtro?.tipo === "ref" ? filtro.ref : "") : normalizarRef(refPedida);
    if (refPedida !== null && !ref) {
      return NextResponse.json({ error: AVISO_DE_REF_INVALIDA }, { status: 400 });
    }

    // Marketing enxerga volume, não pessoas — regra da matriz A17. O volume é
    // o da LOJA, e por isso não sai da sessão: com a RLS de `leads` fechada
    // por escopo (20261003130000), a sessão do Marketing não lê lead nenhum e
    // a contagem viraria zero. Sai da chave de serviço, só a coluna da etapa,
    // nas mesmas 500 linhas mais novas que a fila mostra.
    if (!podeVer) {
      const passe = passeDaEquipe(profile);
      if (!passe) {
        return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
      }
      const etapas = await lerLeadsDaLoja<{ situacao: string }>(passe, ["situacao"], (c) =>
        c.order("created_at", { ascending: false }).limit(500),
      );
      if (etapas.error) {
        if (ehTabelaOuColunaAusente(etapas.error)) {
          return NextResponse.json({ leads: [], migracaoPendente: true });
        }
        return NextResponse.json({ error: etapas.error.message }, { status: 500 });
      }
      const porSituacao: Record<string, number> = {};
      for (const l of etapas.data ?? []) porSituacao[l.situacao] = (porSituacao[l.situacao] ?? 0) + 1;
      return NextResponse.json({
        somenteAgregado: true,
        total: (etapas.data ?? []).length,
        porSituacao,
      });
    }

    // `created_at`, não `criado_em`: a tabela `leads` é preexistente e já
    // trazia esse nome. Renomear quebraria consumidor externo — ver a nota na
    // migração 20260807210000.
    let consulta = supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    // O filtro vai para o BANCO, e não para a lista já lida: a fila para em
    // 500 linhas, e o lead que se procura por código é justamente o que não
    // está à vista. É `ilike` sem índice por trás — `leads_ag_uid_idx`
    // (20260902130000) serve à igualdade do `/api/capi`, não a prefixo —, ou
    // seja, varredura: aceitável numa consulta que só a equipe faz, à mão, e
    // que não roda por visitante. O padrão, e por que ele é o inverso exato de
    // `refCurta`, está em `padraoDaRef`.
    if (ref) consulta = consulta.ilike("ag_uid", padraoDaRef(ref));
    // Nome: contém, sem distinguir caixa (o padrão já vem com `%` e `_` do
    // termo escapados). Telefone: os dígitos contidos no número gravado, que
    // é só dígitos. Oito dígitos exatos também formam uma referência: a busca
    // procura pelos dois. O `or` só leva dígitos e hexadecimais, validados em
    // `filtroDaBusca` e `padraoDaRef`: nada do que foi digitado entra cru.
    if (filtro?.tipo === "nome") consulta = consulta.ilike("nome", filtro.padrao);
    if (filtro?.tipo === "telefone") {
      consulta = filtro.refAlternativa
        ? consulta.or(`telefone.ilike.%${filtro.digitos}%,ag_uid.ilike.${padraoDaRef(filtro.refAlternativa)}`)
        : consulta.ilike("telefone", `%${filtro.digitos}%`);
    }
    // O escopo vale para a fila E para a busca por referência. Quem chega aqui
    // vê leads; o Marketing já saiu acima, com a contagem da loja.
    consulta = comEscopoDeLeads(consulta, visao);
    const { data, error } = await consulta;

    if (error) {
      // Com `?ref=`, estrutura ausente é a coluna `ag_uid`: a tela só busca
      // depois de ter lido a fila. Responder `migracaoPendente` aqui travaria o
      // painel inteiro em "a tabela de leads ainda não existe" — falso, e sem
      // volta até recarregar a página.
      if (ehTabelaOuColunaAusente(error) && !ref && !filtro) {
        return NextResponse.json({ leads: [], migracaoPendente: true });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // O banco já filtrou pelo escopo; esta segunda passada só tira o caso que
    // ele não enxerga (responsável só com espaços), para a fila não oferecer
    // um lead que a escrita recusaria.
    const leads = (data ?? []).filter((l) => leadNoEscopo(visao, l.responsavel));

    // ------------------------------------------------------------------------
    // O atendimento pelo WhatsApp da loja, quando já existe
    // ------------------------------------------------------------------------
    // Numa consulta separada, e não num `select` aninhado: se a leitura falhar
    // — policy ausente, tabela ausente num ambiente atrasado —, o kanban
    // continua inteiro, e o botão do card cai no `wa.me`. Derrubar a lista de
    // leads por causa dele é a tela.
    //
    // O atendimento mais RECENTE ganha: um cliente que volta meses depois abre
    // atendimento novo. O Chatwoot saiu dos processos da Motors (21/10/2026,
    // *"tudo vira painel"*); as linhas antigas dele continuam valendo como
    // "houve conversa pelo WhatsApp da loja", e a conversa mora no painel.
    /**
     * Do atendimento mais recente vem o estado do assistente: `com_assistente`
     * e `humano_assumiu_em` (decisão do dono em 2026-09-05 — o SLA só conta
     * depois que o Ney sai do circuito). Sem eles aqui, `montar_fila_do_funil`
     * tira o lead da fila e o card continua pintando "3 dias parado": banco e
     * tela discordando sobre o mesmo lead, que é exatamente o que o cabeçalho
     * de `lib/funil.ts` existe para impedir.
     */
    interface DoAtendimento {
      comAssistente: boolean;
      humanoAssumiuEm: string | null;
      etiquetas: string[];
    }
    const atendimentoPorLead = new Map<string, DoAtendimento>();
    // Toda etiqueta que aparece nos leads lidos — o que o card oferece para
    // pôr enquanto a lista de `/api/leads/etiquetas` não chega.
    const etiquetasVistas: unknown[] = [];
    if (leads.length > 0) {
      const { data: atendimentos, error: erroAtendimento } = await supabase
        .from("atendimentos")
        .select("lead_id, com_assistente, humano_assumiu_em, iniciado_em, created_at, tags")
        .in("lead_id", leads.map((l: { id: string }) => l.id));

      if (erroAtendimento) {
        console.warn("[Leads] Atendimentos ilegíveis:", erroAtendimento.message);
      } else {
        // A MESMA régua do `montar_fila_do_funil`: `coalesce(iniciado_em,
        // created_at)` decrescente. Duas réguas de "mais recente" no mesmo
        // sistema é o motor escolhendo uma conversa e a tela outra.
        for (const a of maisRecentePrimeiro(atendimentos ?? [])) {
          if (a.lead_id && !atendimentoPorLead.has(a.lead_id)) {
            atendimentoPorLead.set(a.lead_id, {
              // `=== true` e não coerção: coluna ausente num ambiente atrasado
              // devolve `undefined`, e `undefined` tem de significar relógio
              // rodando — a mesma direção segura do `default false` no banco.
              comAssistente: a.com_assistente === true,
              humanoAssumiuEm: a.humano_assumiu_em ?? null,
              // As etiquetas antigas da conversa (o espelho de 2026-09-25). Só
              // valem num banco sem `leads.etiquetas` (antes da migração
              // 20261023120000): dali em diante a lista é do lead.
              etiquetas: limparEtiquetas(a.tags),
            });
          }
        }
      }
    }
    // ------------------------------------------------------------------------
    // A última interação de cada lead (03/10/2026)
    // ------------------------------------------------------------------------
    // O card novo e a Lista do dia mostram o último registro do vendedor.
    // UMA leitura para todos os leads da resposta, e não uma por lead; quem
    // escolhe a mais recente de cada um é `ultimaInteracaoPorLead`.
    //
    // O teto: o PostgREST corta a resposta em 1000 linhas, e a leitura vem da
    // mais nova para a mais antiga. Com mais de 1000 registros nos leads da
    // fila, o lead cuja última interação é mais velha que essas 1000 sairia
    // sem ela, calado. Por isso o teto é pedido às claras e, batido, a
    // resposta leva um aviso. A saída de verdade é uma view com
    // `distinct on (lead_id)`, que é mudança de banco.
    //
    // Como o atendimento acima: se a leitura falhar, a fila continua
    // inteira, sem a última interação, e a resposta diz que ela faltou.
    const TETO_DE_INTERACOES = 1000;
    const avisos: string[] = [];
    let ultimaPorLead: ReturnType<typeof ultimaInteracaoPorLead> = new Map();
    if (leads.length > 0) {
      const { data: interacoes, error: erroInteracoes } = await supabase
        .from("leads_interacoes")
        .select("id, lead_id, tipo, resultado, texto, autor, criado_em")
        .in("lead_id", leads.map((l: { id: string }) => l.id))
        .order("criado_em", { ascending: false })
        .limit(TETO_DE_INTERACOES);

      if (erroInteracoes) {
        console.warn("[Leads] Sem a última interação:", erroInteracoes.message);
        avisos.push("Não deu para ler a última interação dos leads. O resto da fila está completo.");
      } else {
        ultimaPorLead = ultimaInteracaoPorLead((interacoes ?? []) as InteracaoDoLead[]);
        if ((interacoes ?? []).length >= TETO_DE_INTERACOES) {
          avisos.push("Há registros demais para ler de uma vez: a última interação de alguns leads pode não aparecer.");
        }
      }
    }

    // Antes do laço, que preenche `etiquetas` em todo lead: lido depois, o
    // banco sem a coluna pareceria tê-la.
    const etiquetasNoLead = leadsGuardamEtiquetas(leads);
    for (const l of leads as Array<Record<string, unknown>>) {
      const a = atendimentoPorLead.get(String(l.id));
      // Conversa pelo WhatsApp da loja: o botão do card abre a do painel.
      l.tem_conversa = Boolean(a);
      l.com_assistente = a?.comAssistente ?? false;
      l.humano_assumiu_em = a?.humanoAssumiuEm ?? null;
      // A lista do lead (migração 20261023120000), como está — ver o
      // cabeçalho de `lib/etiquetas`. Sem a coluna, a da conversa.
      l.etiquetas = etiquetasNoLead ? limparEtiquetas(l.etiquetas) : (a?.etiquetas ?? []);
      etiquetasVistas.push(...(l.etiquetas as string[]));
      l.ultima_interacao = ultimaPorLead.get(String(l.id)) ?? null;
      // Já vêm no `select("*")`; aqui só se garante o nulo num banco sem a
      // migração da gestão do lead, para a tela não receber `undefined`.
      l.proximo_passo = l.proximo_passo ?? null;
      l.proximo_passo_vence_em = l.proximo_passo_vence_em ?? null;
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
    //
    // Desde 2026-09-23 a régua é `recebeLead`: comercial em QUALQUER posição
    // de `papeis`, e conta ativa. O filtro antigo (`role in admin, comercial`)
    // olhava só o papel principal e incluía admin — punha o Marketing na
    // lista e deixava de fora quem tem comercial como segundo papel.
    let atendentes: { nome: string }[] = [];
    const { data: perfis } = await supabase
      .from("profiles")
      .select("full_name, role, papeis, is_active");
    if (perfis) atendentes = atendentesDoFluxo(perfis as PerfilDoFluxo[]);

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
      // A tela usa para decidir o que mostrar: quem só vê os próprios leads
      // não precisa do nome do responsável em cada card.
      escopo: visao.escopo,
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
      // O que os `leads` acima SÃO: a fila (`null`) ou o resultado de uma
      // busca. A tela lê daqui, e não do que pediu, para nunca chamar de
      // "fila" uma lista filtrada nem de "busca vazia" uma fila vazia.
      //
      // `ref` continua onde sempre esteve, para a tela de hoje. `termo` e
      // `tipo` são da busca única: o que foi digitado e como foi entendido.
      busca: filtro
        ? { termo: buscaPedida, tipo: filtro.tipo, ...(ref ? { ref } : {}) }
        : ref
          ? { ref }
          : null,
      // Leituras secundárias que falharam ou vieram cortadas. Vazio é o normal.
      avisos,
      // As etiquetas do card (2026-09-25). `etiquetasEditaveis` diz se o
      // banco já guarda a lista no lead — sem a migração 20261023120000, o
      // card mostra as etiquetas e não oferece editar, em vez de oferecer e
      // falhar no clique.
      etiquetasDisponiveis: etiquetasConhecidas(etiquetasVistas),
      etiquetasEditaveis: etiquetasNoLead,
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
 * A recusa é 400 e devolve `motivo_obrigatorio: true` quando falta escolher,
 * para a tela saber abrir a caixa em vez de mostrar um erro cru. Motivo de
 * outro tipo, inexistente, desativado ou de outro escopo também é recusado —
 * a regra inteira, com as frases, mora em `decidirDesfecho` (`lib/funil`).
 *
 * ⚠️ Só vale para a MUDANÇA de etapa, medida contra o lead no banco. Lead que
 * já está na etapa terminal não é cobrado retroativamente: cobrar do passado
 * travaria o card sem que ninguém tivesse feito nada errado.
 *
 * E não alcança a captura do site: `/api/leads` e `/api/avaliacao` gravam
 * direto em `leads`, sem etapa, e o lead nasce na etapa do `default` da
 * coluna. Esta rota exige sessão de equipe; nenhum formulário passa por aqui.
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
      .select("role, papeis, full_name, is_active")
      .eq("id", user.id)
      .single();
    if (!ehStaff(profile)) {
      return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
    }
    // Perfil desativado não escreve (03/10/2026): a sessão de quem saiu da
    // loja pode seguir viva, e `ehStaff` não olha `is_active`. A mesma régua
    // do GET e de `sessaoDeLeads`.
    if (profile?.is_active !== true) {
      return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
    }
    const perfisDoAutor = perfisDe(profile);
    if (podeFazer(perfisDoAutor, "Ver e mover leads no kanban") !== "faz") {
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
      avaliacao_valor_ofertado,
      avaliacao_valor_pago,
    } = body;
    if (!id) {
      return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
    }

    // Só se mexe no lead que se enxerga. 404, e não 403: para quem não vê o
    // lead, ele não existe, e a resposta não confirma o contrário.
    const visaoDoAutor = visaoDeLeads(perfisDoAutor, profile?.full_name);
    if (visaoDoAutor.escopo !== "todos") {
      const { data: alvo, error: erroDoAlvo } = await supabase
        .from("leads")
        .select("responsavel")
        .eq("id", id)
        .maybeSingle();
      // Leitura que falhou não é "lead não encontrado": a tela diria ao
      // vendedor que o lead sumiu quando foi o banco que não respondeu.
      if (erroDoAlvo) return NextResponse.json({ error: erroDoAlvo.message }, { status: 500 });
      if (!alvo || !leadNoEscopo(visaoDoAutor, alvo.responsavel)) {
        return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
      }
    }

    // Só o Administrador deixa um lead sem responsável (decisão do dono,
    // 03/10/2026). Depois do guarda do escopo, para o lead que a pessoa não
    // enxerga continuar sendo 404, e ANTES do registro de contato, que é a
    // primeira escrita da rota: recusado, o pedido não grava nada.
    if (pedeLeadSemResponsavel(responsavel) && !podeRemoverResponsavel(visaoDoAutor)) {
      return NextResponse.json({ error: AVISO_DE_RESPONSAVEL_OBRIGATORIO }, { status: 403 });
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
      if (
        situacao === undefined &&
        responsavel === undefined &&
        observacoes === undefined &&
        avaliacao_valor_ofertado === undefined &&
        avaliacao_valor_pago === undefined
      ) {
        return NextResponse.json({ ok: true });
      }
    }

    // Só o Comercial recebe lead (2026-09-23). A recusa mora AQUI, e não só
    // no select do card, pelo mesmo motivo do desfecho: validação que mora
    // apenas na tela vira opcional no dia em que alguém chamar a rota de
    // outro lugar.
    if (responsavel !== undefined) {
      const { data: perfis, error: erroPerfis } = await supabase
        .from("profiles")
        .select("full_name, role, papeis, is_active");
      if (erroPerfis) {
        return NextResponse.json({ error: erroPerfis.message }, { status: 500 });
      }
      const recusa = recusaDeResponsavel(responsavel, (perfis ?? []) as PerfilDoFluxo[]);
      if (recusa) return NextResponse.json({ error: recusa }, { status: 422 });
    }

    const atualizacao: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
    // O desfecho que ESTE pedido grava (ganho, perdido, descartado), ou nulo.
    let desfechoGravado: TipoDeDesfecho | null = null;
    /** O tipo da etapa de destino, que vai no movimento para o Meta (o Purchase decide pelo desfecho gravado). */
    let tipoDaEtapaGravada: string | null = null;
    if (situacao !== undefined) atualizacao.situacao = situacao;
    // Aparado: a validação acima já apara para comparar, e o nome gravado com
    // espaço sobrando não casaria com o `full_name` de ninguém — o vendedor
    // receberia o lead e não o veria.
    if (responsavel !== undefined) {
      // Só espaços é "sem dono", e sem dono se grava nulo: um jeito só de dizer.
      atualizacao.responsavel = typeof responsavel === "string" ? responsavel.trim() || null : responsavel;
    }
    if (observacoes !== undefined) atualizacao.observacoes = observacoes;

    // O que o consultor ofereceu e o que a loja pagou pelo carro avaliado
    // (migração 20260924190000). O retrato `avaliacao` NÃO entra aqui: é o que
    // o cliente preencheu no site, e o painel não o reescreve. Valor ilegível
    // recusa em vez de apagar o que estava gravado — ver `lerValorDaAvaliacao`.
    //
    // Pela mesma razão, o `perfil` do Profiler (migração 20260925200000) não
    // tem campo neste PATCH: é o que o cliente respondeu no site. Os campos
    // desestruturados do corpo, lá em cima, são tudo o que esta rota grava —
    // um `perfil` no corpo é ignorado.
    const valoresDaAvaliacao = { avaliacao_valor_ofertado, avaliacao_valor_pago };
    for (const [campo, bruto] of Object.entries(valoresDaAvaliacao)) {
      if (bruto === undefined) continue;
      const lido = lerValorDaAvaliacao(bruto);
      if (!lido.ok) {
        return NextResponse.json(
          { error: "Valor inválido. Use só o número em reais, como 55.000 ou 55.000,50." },
          { status: 400 },
        );
      }
      atualizacao[campo] = lido.valor;
    }

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

      // A regra inteira mora em `decidirDesfecho` (`lib/funil`). O que sobra
      // aqui são as duas leituras do banco que ela pede — e ela só as pede
      // quando o destino é desfecho, então mover entre colunas não lê nada.
      //
      // Ela saiu daqui em 16/09. A versão que morava neste PATCH perguntava
      // `tipo === "ganho" || tipo === "perdido"`, e por isso a trava que o
      // cabeçalho promete "para o dia em que alguém chamar a rota de outro
      // lugar" nunca valeu para descarte. Junta e pura, a regra é EXECUTADA
      // por teste; aqui, um desvio só se esconderia de um teste que lesse o
      // texto do `if`.
      const decisao = await decidirDesfecho(
        (etapa as EtapaDoDesfecho | null) ?? null,
        { desfecho_motivo, desfecho_valor, desfecho_nota },
        {
          // Para saber se é TRANSIÇÃO, e qual é o escopo do lead. Falha de
          // leitura vira `null`, que a decisão trata do lado seguro.
          lerLead: async () => {
            const { data, error: erroLead } = await supabase
              .from("leads")
              .select("situacao, canal")
              .eq("id", id)
              .maybeSingle();
            if (erroLead) {
              console.warn("[Leads] Lead ilegível antes do desfecho:", erroLead.message);
              return null;
            }
            return (data as LeadDoDesfecho | null) ?? null;
          },
          // Todos, e não só os ativos: motivo desativado precisa ser
          // reconhecido para a recusa dizer "desativado", e não "desconhecido".
          lerMotivos: async () => {
            const { data, error: erroMotivos } = await supabase
              .from("funil_motivos")
              .select("*");
            if (erroMotivos) {
              console.warn("[Leads] Motivos ilegíveis antes do desfecho:", erroMotivos.message);
              return null;
            }
            return (data ?? []) as MotivoDoFunil[];
          },
        },
      );
      if (!decisao.ok) {
        return NextResponse.json(
          {
            error: decisao.erro,
            motivo_obrigatorio: decisao.motivoObrigatorio,
            tipo: decisao.tipo,
          },
          { status: decisao.status },
        );
      }
      Object.assign(atualizacao, decisao.campos);
      const tipoDaEtapa = (etapa as EtapaDoDesfecho | null)?.tipo;
      tipoDaEtapaGravada = tipoDaEtapa ?? null;
      if (tipoDaEtapa && ehTipoDeDesfecho(tipoDaEtapa) && "desfecho_motivo" in decisao.campos) {
        desfechoGravado = tipoDaEtapa;
      }
    }

    // A passagem do SDR (ver o bloco depois do `update`): quantos resgates o
    // lead já tinha, para saber depois se ESTA passagem contou. Só para quem
    // o gatilho pode creditar — SDR sem papel de Comercial, dando dono.
    const passaComoSdr =
      perfisDoAutor.includes("sdr") &&
      !perfisDoAutor.includes("comercial") &&
      typeof responsavel === "string" &&
      responsavel.trim() !== "";
    const resgatesAntes = passaComoSdr ? await contarPassagensCreditadas(supabase, id) : null;

    // O escopo vai também na escrita: se o lead mudou de dono entre a leitura
    // do guarda e este ponto, a gravação não alcança linha nenhuma.
    // `select("id")` para saber se a gravação ALCANÇOU o lead: sem linha
    // alcançada nada foi escrito, e o que vem depois do desfecho (os veículos)
    // não pode agir sobre um desfecho que não houve.
    // A resposta deste caso continua a de sempre.
    const { data: gravados, error } = await comEscopoDeLeads(
      supabase.from("leads").update(atualizacao).eq("id", id),
      visaoDoAutor,
    ).select("id");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const alcancouOLead = Array.isArray(gravados) && gravados.length > 0;
    if (!alcancouOLead) desfechoGravado = null;

    const novoDono =
      alcancouOLead && typeof atualizacao.responsavel === "string" ? atualizacao.responsavel : null;

    // ------------------------------------------------------------------------
    // O resumo do assistente para o dono escolhido (2026-10-20)
    // ------------------------------------------------------------------------
    // O lead que o assistente entregou sem dono (distribuição pelo
    // administrador) ganhou dono agora: o resumo vai a ele já, e não na
    // próxima rodada do n8n — velocidade de resposta é o que decide o lead
    // quente. Lead que não veio do assistente sai na primeira leitura. Com a
    // chave de serviço porque o envio é do servidor; falhar não desfaz a troca.
    if (novoDono) {
      try {
        // Troca feita no quadro: com o rodízio, o dono novo recebe o resumo
        // mesmo que o rodízio já tenha avisado outro vendedor.
        await avisarEntregaPendente(createAdminSupabaseClient(), String(id), {}, { trocaManual: true });
      } catch (erro) {
        console.warn("[Leads] Resumo do assistente não enviado ao dono novo:", erro instanceof Error ? erro.message : erro);
      }
    }

    // ------------------------------------------------------------------------
    // Os veículos de interesse depois do desfecho (2026-10-05)
    // ------------------------------------------------------------------------
    // Fechar NÃO é bloqueado por opção pendente nesta versão (decisão da
    // entrega): o desfecho acima já valeu. O que acontece aqui é o que a tela
    // não precisa perguntar: fechado como GANHO um lead com um carro só, ainda
    // em avaliação, ele é o escolhido. O resto (o que segue em avaliação) vai
    // na resposta, para a tela abrir a resolução em lote
    // (`POST /api/leads/[id]/veiculos/resolver`). Sem a tabela, sem opção ou
    // com falha, os dois campos simplesmente não vêm.
    const doDesfecho: Record<string, unknown> = {};
    if (desfechoGravado) {
      const depois = await veiculosDepoisDoDesfecho(supabase, visaoDoAutor, String(id), desfechoGravado);
      if (depois.veiculo_escolhido) doDesfecho.veiculo_escolhido = depois.veiculo_escolhido;
      if (depois.pendencias_de_veiculo.length > 0) doDesfecho.pendencias_de_veiculo = depois.pendencias_de_veiculo;
      // A escolha que cabia e não foi feita não fica só no log do servidor.
      if (depois.aviso) doDesfecho.aviso = depois.aviso;
    }
    // ------------------------------------------------------------------------
    // A qualificação de volta para o Meta (2026-10-16)
    // ------------------------------------------------------------------------
    // Decisão do dono: *"as etapas de VISITA AGENDADA e NEGOCIANDO são a
    // métrica de lead qualificado; sim, envie o Purchase com o valor real"*.
    // As regras (quais etapas, uma vez por lead, sem valor não há Purchase)
    // moram em `lib/qualificacaoParaMeta`; aqui só se diz em que etapa o lead
    // FICOU e qual desfecho este pedido gravou. Daqui sai só o Purchase do
    // ganho: o LeadQualificado vai pela rodada de hora em hora (18/10/2026),
    // que só conta quem ficou na etapa — o cartão arrastado não vai. DEPOIS
    // do `update`, e só se ele alcançou o lead: evento que não houve é o pior
    // dado possível para uma campanha. Falhar não desfaz o movimento — o
    // resultado fica na linha (`capi_meta_*`), e o que não foi vai no próximo
    // movimento. O ganho sem valor avisa a tela: é o vendedor quem tem o número.
    if (alcancouOLead && situacao !== undefined) {
      const meta = await qualificarNoMeta(
        supabase,
        String(id),
        { etapa: { chave: String(situacao), tipo: tipoDaEtapaGravada }, desfecho: desfechoGravado },
        { lerPixelId: pixelIdDasSettings },
      );
      if (meta.aviso) doDesfecho.aviso = [doDesfecho.aviso, meta.aviso].filter(Boolean).join(" ");
    }
    /** Os avisos do desfecho, se houver, junto com o aviso próprio de cada resposta. */
    const comAviso = (aviso: string) => [doDesfecho.aviso, aviso].filter(Boolean).join(" ");

    // ------------------------------------------------------------------------
    // A passagem do SDR para o Comercial (2026-09-25)
    // ------------------------------------------------------------------------
    // *"Quando o sdr atribuir um contato para um vendedor do comercial,
    // precisamos manter a tag de resgate e reaquecido, para mensurar o
    // trabalho dele, isso tem que ser feito automático."*
    //
    // Duas metades, e só esta mora aqui. O CRÉDITO fica no rastro, pelo
    // gatilho da migração 20260925180000, no mesmo `update` acima — não
    // depende desta rota. E é o gatilho que decide se a
    // passagem conta: só lead parado ou reaberto, passado por quem é só SDR
    // (decisões do dono, 25/09). A rota não repete a régua; ela CONTA os
    // resgates do lead antes e depois do `update`, e põe as ETIQUETAS no
    // lead só se o gatilho creditou. Etiqueta e crédito medem a mesma coisa,
    // ou o filtro do card e o relatório do banco discordam.
    //
    // As etiquetas vão DEPOIS de a passagem estar gravada: uma falha ao
    // etiquetar não pode travar o lead com o SDR. Falhou, a resposta leva o
    // aviso e a passagem continua valendo.
    if (passaComoSdr) {
      const resgatesDepois = await contarPassagensCreditadas(supabase, id);
      if (resgatesAntes === null || resgatesDepois === null) {
        return NextResponse.json({
          ok: true,
          ...doDesfecho,
          aviso: comAviso(
            "A passagem foi gravada, mas não deu para conferir se contou como resgate — por isso resgate e reaquecido não entraram no lead.",
          ),
        });
      }
      if (resgatesDepois <= resgatesAntes) {
        return NextResponse.json({
          ok: true,
          ...doDesfecho,
          aviso: comAviso(
            "Passagem gravada. Não conta como resgate: só conta o lead que esteve parado ou foi reaberto desde a última passagem do SDR — e aí resgate e reaquecido entram sozinhas no lead.",
          ),
        });
      }
      const passagem = await etiquetarPassagemDoSdr(supabase, id);
      return NextResponse.json({
        ok: true,
        ...doDesfecho,
        ...(passagem.etiquetas ? { etiquetas: passagem.etiquetas } : {}),
        ...(passagem.aviso ? { aviso: comAviso(passagem.aviso) } : {}),
      });
    }

    return NextResponse.json({ ok: true, ...doDesfecho });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** Apaga a pasta do lead no bucket dos anexos. Nunca lança. */
async function apagarArquivosDoLead(leadId: string): Promise<{ ok: true } | { ok: false; aviso: string }> {
  const aviso = "O lead foi excluído, mas os arquivos da conversa ficaram no bucket atendimento-midia: repita a exclusão ou apague a pasta do lead.";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId)) return { ok: true };
  try {
    const bucket = createAdminSupabaseClient().storage.from(BUCKET_DOS_ANEXOS);
    for (let volta = 0; volta < 20; volta += 1) {
      const { data, error } = await bucket.list(leadId, { limit: 100 });
      if (error) return { ok: false, aviso };
      const caminhos = (data ?? []).filter((o) => o.name).map((o) => `${leadId}/${o.name}`);
      if (caminhos.length === 0) return { ok: true };
      const { error: erroAoApagar } = await bucket.remove(caminhos);
      if (erroAoApagar) return { ok: false, aviso };
    }
    return { ok: false, aviso };
  } catch {
    return { ok: false, aviso };
  }
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

    // Os arquivos da conversa (fotos, documentos do cliente — 2026-10-20)
    // moram na pasta do lead no bucket privado: a conversa sai pelo cascade,
    // e os arquivos saem aqui. O lead já foi apagado; o que falhar vira aviso,
    // para o Administrador repetir.
    const arquivos = await apagarArquivosDoLead(id);
    return NextResponse.json(arquivos.ok ? { ok: true } : { ok: true, aviso: arquivos.aviso });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
