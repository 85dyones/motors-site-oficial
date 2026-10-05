import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logLeadCaptured, META_CONTENT_TYPE } from "../../../lib/telemetry";
import { createAdminSupabaseClient } from "../../../lib/supabase-server";
import { getCachedSettings } from "../../../lib/settings";
import { sendCapiEvent } from "../../../lib/meta-capi";
import { verificarTurnstile, ACOES_DE_LEADS, ipDoVisitante } from "../../../lib/turnstile";
import { interesseDoLead } from "../../../lib/interesseDoLead";
import { grafiaDoCarro } from "../../../lib/grafiaCanonica";
import { contextoDeMidiaDoLead } from "../../../lib/contextoDeMidia";
import {
  MENSAGEM_DA_INSCRICAO,
  decidirLeadDoRepasse,
  ehCanalDoRepasse,
  mensagemDoExame,
  type InscricaoNaLista,
} from "../../../lib/leadDoRepasse";
import { registrarFalha } from "../../../lib/observabilidade";
import { ERROS_DO_REPASSE } from "../../../lib/paginaDoRepasse";
import { carroDoContato, carroDoExame, gravarInscricao } from "../../../lib/repasseNaRotaDeLeads";
import { colunaDoPerfilAusente, montarPerfilDoLead, type PerfilDoLead } from "../../../lib/perfilDoLead";
import { registrarInteresseDaCaptura } from "../../../lib/veiculosDeInteresse-servidor";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    
    if (!body) {
      return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
    }

    const { cliente, veiculo, utm, intencao_busca, agUid, webhookUrl, turnstileToken } = body;

    // 1. Captcha — exigido por PADRÃO, com lista de isenções
    //
    // ---------------------------------------------------------------------
    // Por que a régua inverteu em 27/08
    // ---------------------------------------------------------------------
    // A versão anterior era uma ALLOWLIST de canais que exigiam token, e o
    // canal vem do CORPO do POST — escrito pelo cliente. Bastava mandar
    // `canal: "Formulário Contato"`, ou qualquer string fora da lista, para
    // pular a verificação inteira. A porta estava aberta e não dependia de
    // adivinhar nada: o nome isento estava no comentário do próprio arquivo.
    //
    // O caso pior não era nem o abuso deliberado. `PDPClientWrapper` manda
    // `canal: activeChannel` — valor dinâmico. Um canal novo na ficha nasceria
    // fora da lista e sem captcha, em silêncio, para sempre.
    //
    // Agora todo lead precisa de token, e a exceção precisa ser escrita. A
    // lista está VAZIA de propósito: `/contato` passou a renderizar o desafio
    // na mesma rodada, e era o único que faltava. Se um canal legítimo
    // precisar entrar aqui um dia, que seja com nome e motivo — não por
    // omissão.
    const ISENTOS_DE_CAPTCHA: string[] = [];
    const needsCaptcha = !ISENTOS_DE_CAPTCHA.includes(body.canal);

    if (needsCaptcha) {
      if (!turnstileToken) {
        return NextResponse.json({ error: "Token de segurança captcha ausente." }, { status: 400 });
      }

      const veredito = await verificarTurnstile({
        token: turnstileToken,
        acoesAceitas: ACOES_DE_LEADS,
        ip: ipDoVisitante(request),
        rotulo: "[Leads API]",
      });

      if (!veredito.ok) {
        // O motivo fica no log do servidor, não na resposta. Ele nomeia estado
        // de configuração — `secret-ausente`, `hostnames-ausentes` — e contar
        // isso a quem apanhou do captcha não ajuda o visitante legítimo em
        // nada. O formulário também não precisa dele: desde 27/08 ele descarta
        // o token e pede outro em QUALQUER falha, sem inspecionar a causa.
        console.warn(`[Leads API] Captcha recusado: ${veredito.motivo}`);
        return NextResponse.json(
          { error: "Falha na verificação de segurança (Anti-Spam)." },
          { status: 403 }
        );
      }
    }

    // 2. Validate mandatory payload properties (only nome is required; whatsapp is optional)
    if (!cliente || !cliente.nome) {
      return NextResponse.json({ error: "Dados de contato do cliente ausentes (nome obrigatório)." }, { status: 400 });
    }

    // 2.5 Repasse (spec 2026-09-24 §8) — a lista, o exame no pátio e, desde
    // 28/09, o pré-cadastro antes do WhatsApp.
    //
    // Aditivo: só entra quando o canal começa com "repasse", e nenhum campo
    // dos outros canais muda de sentido. A régua é pura
    // (`decidirLeadDoRepasse`, testada sem rota) e roda ANTES de qualquer
    // gravação e do n8n: corpo torto volta 400 sem deixar lead pela metade.
    //
    // A mensagem do lead sai daqui, e não do corpo: `leads` é lida por toda
    // a equipe, e CNPJ, faixa e tipos de carro ficam fora de `leads`: vão
    // para `repasse_inscritos`, que só quem valida lê (e ao n8n, dentro de
    // `intencao_busca`). Um navegador que mandasse o CNPJ na `mensagem` não
    // o levaria ao Kanban. O WhatsApp é a exceção: a mensagem dele é a
    // conversa que a pessoa manda, e o modal não pede nada além do contato.
    let mensagemDoLead: unknown = body.mensagem;
    let repasseIdDoLead: string | null = null;
    // O preço do carro, lido do banco, é o valor do Lead na CAPI (o pixel manda o mesmo).
    let valorDoRepasse: number | undefined;
    let interesseDoRepasse: string | null = null;
    // Só o exame bloqueia quando o lead não grava (5.2.1); o WhatsApp nunca.
    let exameDoRepasse = false;
    let inscricaoDoRepasse: InscricaoNaLista | null = null;
    if (ehCanalDoRepasse(body.canal)) {
      const decisao = decidirLeadDoRepasse(body, new Date());
      if (!decisao.ok) {
        return NextResponse.json({ error: decisao.erro }, { status: 400 });
      }
      if (decisao.pedido.tipo === "lista") {
        inscricaoDoRepasse = decisao.pedido.inscricao;
        mensagemDoLead = MENSAGEM_DA_INSCRICAO[inscricaoDoRepasse.trilha];
      } else if (decisao.pedido.tipo === "whatsapp") {
        // O contato pelo WhatsApp (pedido do dono em 28/09) nunca recusa: o
        // visitante está a caminho do WhatsApp, como na ficha do estoque.
        // Carro que o site ainda mostra liga o lead a ele, e o interesse é o
        // nome do carro pela régua do campo (`interesseDoLead`, sem o ano).
        // Carro que sumiu, saiu do ar ou não deu para ler: o lead entra sem o
        // elo, e o interesse cai na mensagem, que já nomeia o carro.
        const { repasseId } = decisao.pedido.contato;
        const carro = repasseId ? await carroDoContato(createAdminSupabaseClient, repasseId, new Date()) : null;
        if (carro) {
          repasseIdDoLead = carro.id;
          valorDoRepasse = carro.preco ?? undefined;
          // Na grafia canônica: o cadastro em maiúsculas chegava ao Kanban
          // como "FIAT PALIO 1.0 ECONOMY…" (revisão de 28/09).
          // A mesma composição do nome da ficha (`grafiaDoCarro`, 29/09).
          interesseDoRepasse = interesseDoLead({
            veiculo: grafiaDoCarro({ marca: carro.marca, modelo: carro.modelo, versao: carro.versao }),
          });
        }
      } else {
        // O exame só vale para carro publicado: reservado, vendido ou
        // arquivado não recebe pedido de horário, e o 409 diz isso.
        const conferido = await carroDoExame(createAdminSupabaseClient(), decisao.pedido.exame.repasseId);
        if (!conferido.ok) {
          return NextResponse.json({ error: conferido.erro }, { status: conferido.status });
        }
        exameDoRepasse = true;
        repasseIdDoLead = conferido.carro.id;
        valorDoRepasse = conferido.carro.preco ?? undefined;
        mensagemDoLead = mensagemDoExame(conferido.carro, decisao.pedido.exame);
      }
    }

    // 3. Load webhook settings from database to get the configured custom URL
    //
    // Via `getCachedSettings`, não com o cliente da requisição: este POST vem de
    // visitante sem sessão, ou seja, papel `anon` — e desde
    // `20260812120000_rls_leitura_de_site_settings.sql` a linha `webhooks` não
    // é mais legível por anônimo (ela carrega o `apiSecretToken`). O `select`
    // daqui voltaria null e o lead sairia para o n8n SEM `Authorization`, em
    // silêncio, porque o disparo é não-bloqueante de propósito.
    const { webhooks: webhooksSalvos } = await getCachedSettings();
    const webhooks = webhooksSalvos || {};
    const dbSecretToken = webhooks.apiSecretToken;
    const secretToken = dbSecretToken || process.env.N8N_SECRET_TOKEN;

    let targetWebhookUrl = "";
    if (body.canal === "WhatsApp Proposta") {
      targetWebhookUrl = webhooks.webhookPropostaUrl?.trim() || webhooks.webhookUrl?.trim();
    } else if (body.canal === "WhatsApp Dúvidas") {
      targetWebhookUrl = webhooks.webhookDuvidasUrl?.trim() || webhooks.webhookUrl?.trim();
    } else {
      targetWebhookUrl = webhooks.webhookUrl?.trim();
    }

    if (!targetWebhookUrl) {
      targetWebhookUrl = process.env.N8N_WEBHOOK_LEAD_URL || "https://n8n.v2o5.com.br/webhook/lead-entrada";
    }

    // 4. Construct payload for n8n
    const cookieStore = await cookies();
    const resolvedAgUid = agUid || body.ag_uid || cookieStore.get("ag_uid")?.value || "ag_ref_nao_localizado";

    // Format phone clean and JID safely
    const rawWhatsapp = typeof cliente?.whatsapp === "string" ? cliente.whatsapp : "";
    const phoneClean = rawWhatsapp.replace(/\D/g, "");
    const formattedPhone = phoneClean.length === 10 || phoneClean.length === 11
      ? (phoneClean.startsWith("55") ? phoneClean : `55${phoneClean}`)
      : phoneClean;
    const remoteJid = formattedPhone ? `${formattedPhone}@s.whatsapp.net` : "";

    const n8nPayload = {
      remoteJid,
      telefone: formattedPhone,
      canal: body.canal || "N/A",
      mensagem: mensagemDoLead || "",
      tipo: body.tipo || "lead_whatsapp",
      cliente: {
        nome: cliente.nome,
        email: cliente.email || "",
        whatsapp: rawWhatsapp
      },
      veiculo: veiculo || null,
      utm: utm || {},
      intencao_busca: intencao_busca || {},
      ag_uid: resolvedAgUid,
      created_at: new Date().toISOString()
    };

    // 5. Send POST request to n8n Webhook with secret token authentication
    // Wrapped in try/catch: webhook failures must NEVER block the client's WhatsApp redirect
    let webhookStatus = 0;
    try {
      const response = await fetch(targetWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secretToken && secretToken.trim() !== "" ? { "Authorization": `Bearer ${secretToken.trim()}` } : {})
        },
        body: JSON.stringify(n8nPayload)
      });
      webhookStatus = response.status;

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.warn(`[Webhook n8n Proxy] Error response [${response.status}]: ${errorText}`);
      }
    } catch (webhookError: any) {
      console.warn(`[Webhook n8n Proxy] Network/fetch error (non-blocking): ${webhookError.message}`);
    }

    // 5.2 Persistência do lead — telas A1/A8/A9 do painel.
    //
    // Até 2026-08-07 o lead existia só no webhook do n8n: quem não abrisse o
    // n8n não tinha como saber que alguém pediu contato. Agora fica também no
    // nosso banco, com o que o dono decidiu guardar (nome, telefone,
    // interesse) e sem prazo de expiração.
    //
    // Mesma regra do webhook e da CAPI: **nunca bloqueia**. O visitante está
    // a caminho do WhatsApp, e falha de gravação nossa não pode segurá-lo —
    // perder o registro é ruim, travar o contato é pior.
    let idDoLead: string | null = null;
    // Só o exame no pátio lê isto (5.2.1): para os outros canais a regra acima vale inteira.
    let erroDoLead: string | null = null;
    //
    // Desde 2026-09-25 o lead do Garagem Match Profiler leva também o perfil
    // (`leads.perfil`): o que o cliente respondeu, os filtros que aceitou
    // tirar e os carros que o site mostrou. Tudo isso já chegava neste corpo,
    // em `intencao_busca`, e ia só para o n8n — ver `lib/perfilDoLead.ts`.
    // Os outros canais não têm perfil, e o insert deles não ganha a chave.
    //
    // Mesma rede de `/api/avaliacao`: se a migração 20260925200000 ainda não
    // estiver aplicada, a coluna não existe e o insert INTEIRO seria recusado;
    // aí o lead é gravado de novo sem ela. Perder o perfil é ruim; perder o
    // lead é voltar ao insert recusado em silêncio de antes da migração
    // 20260811130000.
    //
    // O perfil é montado FORA do `try` do insert e com a própria rede: se um
    // dia a montagem lançar, o lead sai sem ele, e não deixa de sair.
    let perfil: PerfilDoLead | null = null;
    try {
      perfil = montarPerfilDoLead(body);
    } catch (erroDoPerfil) {
      console.warn("[Leads API] Perfil do Profiler não montado:", (erroDoPerfil as Error)?.message);
    }
    try {
      // `insert` na tabela `leads` exige contornar a RLS (não há policy de
      // INSERT para anônimo, de propósito), então usa a chave de serviço.
      const supabaseAdmin = createAdminSupabaseClient();

      // "Interesse" é o que a pessoa quer, na melhor forma disponível: o
      // veículo da ficha, senão o que ela digitou, senão a busca que fazia.
      // O nome do veículo sai pela régua da ficha, sem repetir a versão: ver
      // `lib/interesseDoLead.ts`.
      // O WhatsApp do repasse com o carro conferido já traz o nome dele (2.5).
      const interesse =
        interesseDoRepasse ??
        interesseDoLead({
          veiculo,
          mensagem: mensagemDoLead,
          intencaoBusca: intencao_busca,
        });

      const inserir = (comPerfil: boolean) =>
        supabaseAdmin.from("leads").insert({
          nome: cliente.nome,
          telefone: formattedPhone || null,
          interesse,
          canal: body.canal || body.tipo || "site",
          // `veiculo.id` é o número do anúncio no RevendaMais — `estoque_motors.id`
          // é integer (baseline 20260803120000), não UUID. `Number` é a conversão
          // certa; só as fixtures de dev usam slug como id, e nelas o NaN vira
          // null porque não há estoque real para apontar.
          veiculo_id: veiculo?.id ? Number(veiculo.id) || null : null,
          // `email` já existia na tabela e alguns formulários do site o
          // coletam — aproveitar a coluna evita perder o dado que já chega.
          email: cliente.email || null,
          // Coluna herdada da tabela de marketing que já existia em produção
          // (ver migração 20260811130000). Era `not null` sem default e sem
          // ninguém preenchendo, o que fazia TODO insert de lead ser recusado
          // — em silêncio, porque esta gravação não bloqueia o visitante.
          //
          // Agora é nulável, e preenchemos quando o cliente mandou o id do
          // evento: é o mesmo que vai para a CAPI do Meta, então o lead passa
          // a dar para cruzar com `capi_meta_*` na mesma linha.
          event_id: body.eventId || null,
          /**
           * O elo entre quem NAVEGA e quem VIROU lead.
           *
           * A coluna existia desde a tabela de marketing e nunca foi preenchida:
           * medido em 2026-09-02, 0 dos 11 leads tinham `ag_uid`. E o valor
           * estava aqui do lado o tempo todo — `resolvedAgUid` é resolvido na
           * entrada da rota e já viaja como `external_id` para o Meta, logo
           * abaixo. Gravava-se para o Meta e não para a própria casa.
           *
           * Sem ele, o servidor não tem como saber que o visitante que está
           * abrindo uma ficha agora é a pessoa que deixou telefone semana
           * passada — que é exatamente o que a CAPI usa para elevar a
           * correspondência. A ausência não dá erro: dá 0% de e-mail e telefone
           * no relatório de qualidade do pixel, sem nada explicando por quê.
           *
           * `ag_ref_nao_localizado` é o sentinela de quem chegou sem rastreio;
           * vira `null` para a coluna não guardar texto que não identifica
           * ninguém, e para `count(ag_uid)` continuar significando o que parece.
           */
          ag_uid: resolvedAgUid !== "ag_ref_nao_localizado" ? resolvedAgUid : null,
          // De onde o lead veio: `utm_*`, `gclid`, `fbclid`, `fbp`, `fbc`. Os
          // valores já chegavam neste corpo e seguiam para o n8n e a CAPI, mas
          // não para a linha — 0 de 14 leads com qualquer um deles em
          // 2026-09-20. Sem o `gclid` aqui não há conversão offline quando o
          // negócio fecha. Regras e limites em `lib/contextoDeMidia.ts`.
          ...contextoDeMidiaDoLead(body),
          ...(comPerfil && perfil ? { perfil } : {}),
          // O exame no pátio liga o lead ao carro de repasse (spec §4.4): é
          // por esta coluna, com o canal do exame, que o pedido aparece no
          // editor do carro. Desde 28/09 o WhatsApp com o carro no site também
          // a preenche; nos outros canais a chave nem entra.
          ...(repasseIdDoLead ? { repasse_id: repasseIdDoLead } : {}),
        });

      // `.select("id")` fora do insert: a lista do repasse guarda o elo com o
      // lead (`repasse_inscritos.lead_id`), e o texto `.from("leads").insert({ … });`
      // fica inteiro para as travas de `pre-voo-das-conversoes` e
      // `leads-insert-destravado`. A nova tentativa sem o perfil devolve o id também.
      let { data: leadGravado, error: erroLead } = await inserir(true).select("id").maybeSingle();
      if (erroLead && colunaDoPerfilAusente(erroLead)) {
        console.warn(
          "[Leads API] Coluna `perfil` ausente — lead gravado sem o perfil do Profiler. " +
            "Aplique a migração 20260925200000_perfil_no_lead.sql.",
        );
        ({ data: leadGravado, error: erroLead } = await inserir(false).select("id").maybeSingle());
      }

      if (erroLead) {
        erroDoLead = erroLead.message;
        console.warn("[Leads API] Falha ao gravar lead (não bloqueante):", erroLead.message);
      } else {
        const idGravado = (leadGravado as { id?: unknown } | null)?.id;
        idDoLead = typeof idGravado === "string" ? idGravado : null;
        // O carro da ficha vira a primeira opção do lead em `leads_veiculos`
        // (05/10/2026): é dela que sai o relatório por veículo. Nunca lança e
        // não bloqueia; antes da migração 20261005120000 a tabela não existe e
        // a chamada é silêncio.
        await registrarInteresseDaCaptura(supabaseAdmin, idDoLead, veiculo?.id, interesse);
      }
    } catch (erroPersistencia: any) {
      erroDoLead = String(erroPersistencia?.message ?? "exceção");
      console.warn("[Leads API] Erro ao gravar lead (não bloqueante):", erroPersistencia?.message);
    }

    // 5.2.1 Exame no pátio — o lead que não grava bloqueia (final-review I2, 25/09).
    //
    // No exame o lead É o pedido: é pela linha em `leads`, com `repasse_id`,
    // que ele aparece no editor do carro (spec §4.4). E o visitante não vai
    // para o WhatsApp: ele lê "Pedido enviado" e espera a loja. Se a linha
    // não existe e o n8n também falhou, o pedido sumia sem ninguém saber.
    // Mesma régua do 5.3: triagem, 500, e o return antes da CAPI (o
    // navegador só mede depois do 2xx). Os outros canais não entram aqui — nem
    // o WhatsApp do repasse, que também grava `repasse_id` e nunca bloqueia.
    if (exameDoRepasse && erroDoLead !== null) {
      await registrarFalha("quebra", "repasse-exame", erroDoLead, { rota: "/api/leads", origem: "servidor" });
      return NextResponse.json({ error: ERROS_DO_REPASSE.generico }, { status: 500 });
    }

    // 5.3 Lista do repasse — gravação que bloqueia (a outra é o exame, 5.2.1).
    //
    // O resto é não bloqueante porque o visitante está a caminho do
    // WhatsApp. Quem entra na lista do repasse não está: a confirmação que
    // ele lê diz "você está na lista", e isso só é verdade se a linha
    // existir — é o produto do formulário. Falhou, ele vê o erro e tenta de
    // novo; a falha vai para a triagem; e a conversão NÃO é contada, nem
    // aqui (o return vem antes da CAPI) nem no navegador (que só mede
    // depois do 2xx).
    //
    // Depois do lead, e não antes: `lead_id` é o elo que o painel usa.
    if (inscricaoDoRepasse) {
      const gravado = await gravarInscricao(createAdminSupabaseClient(), inscricaoDoRepasse, idDoLead);
      if (!gravado.ok) {
        await registrarFalha("quebra", "repasse-inscricao", gravado.detalhe, {
          rota: "/api/leads",
          origem: "servidor",
          ...(idDoLead ? { lead_id: idDoLead } : {}),
        });
        return NextResponse.json({ error: ERROS_DO_REPASSE.lista }, { status: 500 });
      }
    }

    // 5.5 Meta CAPI — espelha o evento Lead disparado no browser (mesmo event_id = dedup)
    // Non-blocking: falha de CAPI nunca pode travar o retorno ao cliente.
    try {
      const { companySettings } = await getCachedSettings();
      const pixelId = companySettings?.metaPixelId || null;

      if (pixelId && body.eventId) {
        await sendCapiEvent({
          eventName: "Lead",
          eventId: body.eventId,
          eventSourceUrl: body.eventSourceUrl || null,
          userData: {
            email: cliente.email || null,
            phone: rawWhatsapp || null,
            fbp: body.fbp || null,
            fbc: body.fbc || null,
            externalId: resolvedAgUid,
            clientIpAddress: ipDoVisitante(request),
            clientUserAgent: request.headers.get("user-agent"),
          },
          customData: {
            content_ids: veiculo?.id ? [String(veiculo.id)] : undefined,
            content_type: META_CONTENT_TYPE,
            /**
             * `contentName` é a saída de quem NÃO tem veículo — a encomenda do
             * hub sem estoque, onde o carro é justamente o que não existe no
             * pátio. Sem ela, o evento de SERVIDOR chegava ao Meta sem nome de
             * conteúdo enquanto o do NAVEGADOR chegava com um: os dois lados do
             * mesmo `event_id` descrevendo coisas diferentes.
             *
             * Aditivo, e nesta ordem de propósito: quando há veículo, ele
             * continua mandando. Nenhum evento é renomeado (regra 7).
             */
            content_name: veiculo
              ? `${veiculo.marca} ${veiculo.modelo}`
              : body.contentName || undefined,
            // Exame no pátio e WhatsApp do repasse: o preço do carro, lido do
            // banco (o pixel manda o mesmo). Fora deles `valorDoRepasse` é
            // undefined e vale o de antes.
            value: valorDoRepasse ?? veiculo?.preco,
            currency: "BRL",
          },
          pixelId,
        });
      }
    } catch (capiError) {
      console.warn("[Meta CAPI] Falha não-bloqueante no lead:", capiError);
    }

    // 6. Invoke Telemetry Hook
    logLeadCaptured({
      marca: veiculo?.marca || "N/A",
      modelo: veiculo?.modelo || "N/A",
      ano: veiculo?.ano || 0,
      estado: "Fricção Concluída (Site)",
      nome: cliente.nome,
      telefone: cliente.whatsapp || "",
      agUid: resolvedAgUid,
      status: webhookStatus
    });

    return NextResponse.json({
      success: true,
      message: "Lead de atendimento processado com sucesso.",
      ref: resolvedAgUid
    });
  } catch (error: any) {
    console.error("[Leads API Proxy] Unhandled error:", error);
    return NextResponse.json({ error: "Erro interno no servidor ao processar o lead." }, { status: 500 });
  }
}
