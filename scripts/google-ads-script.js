/* global AdsApp, UrlFetchApp, Utilities, Logger */
/**
 * Motors Store — envia as campanhas do Google Ads para o painel do site, e é o
 * braço do Copiloto de Mídia dentro da conta.
 *
 * COMO INSTALAR (uma vez; para atualizar, cole por cima do script que já está lá):
 *   1. Google Ads → Ferramentas → Ações em massa → Scripts → botão "+".
 *   2. Apague o conteúdo de exemplo e cole ESTE arquivo inteiro.
 *   3. Troque COLE_AQUI_O_SEGREDO pelo valor de `midia_google_segredo`
 *      (Supabase → Project Settings → Vault).
 *   4. "Autorizar", depois "Visualizar": o registro tem que terminar com
 *      "painel respondeu 200" e "copiloto: diagnóstico recebido". Em
 *      "Visualizar" o Google não deixa o script mudar nada na conta: a prévia
 *      lê e manda o diagnóstico, e as mudanças aprovadas esperam a rodada de
 *      verdade.
 *   5. Salve e, em "Frequência", escolha "A cada hora".
 *
 * O que ele faz, a cada hora:
 *   1. SINCRONIZA: lê gasto, impressões, cliques e conversões por campanha e
 *      por dia dos últimos 7 dias (hoje incluído) e manda para
 *      /api/marketing/sincronizar/google. O site apaga e regrava esses 7 dias,
 *      então rodar de novo nunca duplica. Contrato: `validarPayloadGoogle` em
 *      src/lib/midiaSync.ts.
 *   2. APLICA o que foi aprovado no painel (/admin/marketing/copiloto): pede as
 *      ações a /api/marketing/copiloto/acoes, aplica cada uma, LÊ DE VOLTA da
 *      conta e devolve o resultado. Ele só conhece cinco verbos — negativar,
 *      remover negativa, pausar grupo, reativar grupo, mudar verba — e a única
 *      coisa que ele remove é negativa. Nunca exclui palavra-chave, anúncio,
 *      grupo ou campanha.
 *   3. DIAGNOSTICA, uma vez por dia (o site diz quando): termos de pesquisa,
 *      palavras-chave com índice de qualidade, anúncios e recursos reprovados,
 *      ações de conversão, verbas e ritmo dos últimos 7 dias fechados, para
 *      /api/marketing/copiloto/diagnostico. Contrato: `validarDiagnostico` em
 *      src/lib/copilotoDeMidia.ts.
 *
 * Se o passo 2 ou 3 falhar, o 1 já foi: a rodada termina com erro (o Google
 * Ads avisa) e a mensagem fica no registro.
 */

var URL_DO_PAINEL = "https://motorsstore.com.br/api/marketing/sincronizar/google";
// O copiloto mora ao lado da sincronização: o endereço do site fica num lugar só.
var URL_DO_COPILOTO = URL_DO_PAINEL.replace(/\/sincronizar\/google$/, "/copiloto");
var SEGREDO = "COLE_AQUI_O_SEGREDO";
var DIAS = 7;

// `main` é o ponto de entrada que o próprio Google Ads chama.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function main() {
  if (SEGREDO === "COLE_AQUI_O_SEGREDO") {
    throw new Error("Troque COLE_AQUI_O_SEGREDO pelo segredo do Vault antes de rodar.");
  }

  sincronizar();

  var falha = null;
  try {
    copiloto();
  } catch (e) {
    falha = e;
    Logger.log("copiloto falhou: " + mensagem(e));
  }
  if (falha) {
    throw new Error("A sincronização foi, mas o Copiloto de Mídia falhou: " + mensagem(falha));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Sincronização de hora em hora
// ─────────────────────────────────────────────────────────────────────────────

function sincronizar() {
  var fuso = AdsApp.currentAccount().getTimeZone();
  var hoje = new Date();
  var inicio = new Date(hoje.getTime() - (DIAS - 1) * 24 * 3600 * 1000);
  var de = Utilities.formatDate(inicio, fuso, "yyyy-MM-dd");
  var ate = Utilities.formatDate(hoje, fuso, "yyyy-MM-dd");

  var campanhas = {};

  // 1 · Todas as campanhas não removidas, mesmo sem gasto na janela.
  var lista = AdsApp.search(
    "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, " +
      "campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'"
  );
  while (lista.hasNext()) {
    var c = lista.next();
    campanhas[c.campaign.id] = {
      id: String(c.campaign.id),
      nome: c.campaign.name,
      status: c.campaign.status,
      tipo: c.campaign.advertisingChannelType,
      orcamentoDiario: c.campaignBudget && c.campaignBudget.amountMicros
        ? Number(c.campaignBudget.amountMicros) / 1e6
        : null,
      dias: []
    };
  }

  // 2 · Desempenho por dia. Campanha removida que gastou na janela entra também.
  var linhas = AdsApp.search(
    "SELECT campaign.id, campaign.name, campaign.status, segments.date, metrics.cost_micros, " +
      "metrics.impressions, metrics.clicks, metrics.conversions FROM campaign " +
      "WHERE segments.date BETWEEN '" + de + "' AND '" + ate + "'"
  );
  while (linhas.hasNext()) {
    var l = linhas.next();
    var id = l.campaign.id;
    if (!campanhas[id]) {
      campanhas[id] = {
        id: String(id),
        nome: l.campaign.name,
        status: l.campaign.status,
        tipo: null,
        orcamentoDiario: null,
        dias: []
      };
    }
    campanhas[id].dias.push({
      dia: l.segments.date,
      investido: reais(l.metrics.costMicros),
      impressoes: Number(l.metrics.impressions || 0),
      cliques: Number(l.metrics.clicks || 0),
      conversoes: Math.round(Number(l.metrics.conversions || 0) * 100) / 100
    });
  }

  var corpo = {
    conta: AdsApp.currentAccount().getCustomerId(),
    de: de,
    ate: ate,
    campanhas: Object.keys(campanhas).map(function (k) { return campanhas[k]; })
  };

  var resposta = UrlFetchApp.fetch(URL_DO_PAINEL, {
    method: "post",
    contentType: "application/json",
    headers: { "X-Motors-Segredo": SEGREDO },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true
  });

  var status = resposta.getResponseCode();
  Logger.log("painel respondeu " + status + ": " + resposta.getContentText());
  if (status !== 200) {
    throw new Error("O painel recusou o envio (" + status + "). Veja o registro acima.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 e 3 · Copiloto de Mídia
// ─────────────────────────────────────────────────────────────────────────────

function copiloto() {
  var fuso = AdsApp.currentAccount().getTimeZone();
  var previa = AdsApp.getExecutionInfo().isPreview();

  // O site reserva as ações aprovadas para esta rodada (na prévia, só mostra)
  // e diz se o diagnóstico do dia está devido.
  var pedido = chamarCopiloto("/acoes", { previa: previa, fuso: fuso });
  var acoes = pedido.acoes || [];

  if (acoes.length > 0 && previa) {
    Logger.log("copiloto: " + acoes.length + " ação(ões) aprovada(s) esperam a rodada de verdade; a prévia não muda a conta.");
  } else if (acoes.length > 0) {
    var resultados = acoes.map(aplicarComSeguranca);
    var r = chamarCopiloto("/acoes/resultado", { resultados: resultados });
    Logger.log("copiloto: " + resultados.length + " ação(ões) aplicada(s) e registrada(s): " + JSON.stringify(r));
  }

  if (pedido.diagnosticoDevido || previa) {
    var retrato = lerConta(fuso, previa);
    var d = chamarCopiloto("/diagnostico", retrato);
    Logger.log("copiloto: diagnóstico recebido — " + JSON.stringify(d));
  }
}

function chamarCopiloto(caminho, corpo) {
  var resposta = UrlFetchApp.fetch(URL_DO_COPILOTO + caminho, {
    method: "post",
    contentType: "application/json",
    headers: { "X-Motors-Segredo": SEGREDO },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true
  });
  var status = resposta.getResponseCode();
  var texto = resposta.getContentText();
  if (status !== 200) {
    throw new Error("o painel recusou " + caminho + " (" + status + "): " + String(texto).slice(0, 300));
  }
  try {
    return JSON.parse(texto || "{}");
  } catch (e) {
    throw new Error("o painel respondeu " + caminho + " com algo que não é JSON (" + mensagem(e) + ")");
  }
}

// ── Aplicar ────────────────────────────────────────────────────────────────

/** Nunca deixa uma ação derrubar as outras: o erro vira resultado `falhou`. */
function aplicarComSeguranca(acao) {
  try {
    return aplicar(acao);
  } catch (e) {
    return falhou(acao, "erro do Google Ads: " + mensagem(e));
  }
}

/** A lista fechada. O que não estiver aqui, o script não faz. */
function aplicar(acao) {
  switch (acao.tipo) {
    case "negativar":
      return negativar(acao);
    case "remover_negativa":
      return removerNegativa(acao);
    case "pausar_grupo":
      return mudarGrupo(acao, false);
    case "reativar_grupo":
      return mudarGrupo(acao, true);
    case "mudar_verba":
      return mudarVerba(acao);
    default:
      return falhou(acao, "o script não conhece o tipo " + acao.tipo);
  }
}

function negativar(acao) {
  var campanha = acharCampanha(acao.campanhaId);
  if (!campanha) return falhou(acao, "campanha " + acao.campanhaId + " não encontrada");
  if (typeof campanha.createNegativeKeyword !== "function") {
    return falhou(acao, "este tipo de campanha não aceita negativa pelo script");
  }
  if (acharNegativa(campanha, acao.texto, acao.correspondencia)) {
    return resultado(acao, "sem_efeito", { negativa: true, campanha: acao.campanhaId });
  }
  campanha.createNegativeKeyword(textoDaNegativa(acao.texto, acao.correspondencia));
  var lida = acharNegativa(acharCampanha(acao.campanhaId), acao.texto, acao.correspondencia);
  if (!lida) return falhou(acao, "a negativa foi enviada e não apareceu ao ler a campanha de volta");
  return resultado(acao, "aplicada", { negativa: true, texto: lida.getText(), correspondencia: lida.getMatchType() });
}

/** A única remoção que o script faz — e só de negativa. */
function removerNegativa(acao) {
  var campanha = acharCampanha(acao.campanhaId);
  if (!campanha) return falhou(acao, "campanha " + acao.campanhaId + " não encontrada");
  var negativa = acharNegativa(campanha, acao.texto, acao.correspondencia);
  if (!negativa) return resultado(acao, "sem_efeito", { negativa: false });
  negativa.remove();
  if (acharNegativa(acharCampanha(acao.campanhaId), acao.texto, acao.correspondencia)) {
    return falhou(acao, "a negativa continua na campanha depois de removida");
  }
  return resultado(acao, "aplicada", { negativa: false });
}

function mudarGrupo(acao, ativar) {
  var grupo = acharGrupo(acao.grupoId);
  if (!grupo) return falhou(acao, "grupo " + acao.grupoId + " não encontrado");
  if (String(grupo.getCampaign().getId()) !== String(acao.campanhaId)) {
    return falhou(acao, "o grupo " + acao.grupoId + " não é da campanha " + acao.campanhaId);
  }
  if (ativar ? grupo.isEnabled() : grupo.isPaused()) {
    return resultado(acao, "sem_efeito", { situacao: ativar ? "ENABLED" : "PAUSED" });
  }
  if (ativar) grupo.enable(); else grupo.pause();
  var lido = acharGrupo(acao.grupoId);
  var agora = lido.isEnabled() ? "ENABLED" : lido.isPaused() ? "PAUSED" : "OUTRO";
  if (agora !== (ativar ? "ENABLED" : "PAUSED")) return falhou(acao, "o grupo ficou " + agora + " depois da mudança");
  return resultado(acao, "aplicada", { situacao: agora });
}

function mudarVerba(acao) {
  var nova = Number(acao.verbaNova);
  var esperada = Number(acao.verbaAtual);
  if (!(nova > 0) || !(esperada > 0) || nova > esperada * 10) {
    return falhou(acao, "verba fora da faixa: " + acao.verbaAtual + " → " + acao.verbaNova);
  }
  var campanha = acharCampanha(acao.campanhaId);
  if (!campanha) return falhou(acao, "campanha " + acao.campanhaId + " não encontrada");
  var verba = campanha.getBudget();
  if (typeof verba.isExplicitlyShared === "function" && verba.isExplicitlyShared()) {
    return falhou(acao, "a verba é compartilhada com outras campanhas; o script não mexe nela");
  }
  var atual = verba.getAmount();
  if (perto(atual, nova)) return resultado(acao, "sem_efeito", { verba: atual });
  // Alguém mudou a verba no Google Ads depois da proposta: a aprovação foi
  // sobre outro número, e o script não decide por ninguém.
  if (!perto(atual, esperada)) {
    return falhou(acao, "a verba mudou desde a proposta: era " + esperada + ", está " + atual + ". Nada foi feito.");
  }
  verba.setAmount(nova);
  var lida = acharCampanha(acao.campanhaId).getBudget().getAmount();
  if (!perto(lida, nova)) return falhou(acao, "a verba ficou " + lida + " depois da mudança");
  return resultado(acao, "aplicada", { verba: lida });
}

function acharCampanha(id) {
  var seletores = [AdsApp.campaigns()];
  if (typeof AdsApp.performanceMaxCampaigns === "function") seletores.push(AdsApp.performanceMaxCampaigns());
  if (typeof AdsApp.shoppingCampaigns === "function") seletores.push(AdsApp.shoppingCampaigns());
  for (var i = 0; i < seletores.length; i++) {
    var it = seletores[i].withIds([Number(id)]).get();
    if (it.hasNext()) return it.next();
  }
  return null;
}

function acharGrupo(id) {
  var it = AdsApp.adGroups().withIds([Number(id)]).get();
  return it.hasNext() ? it.next() : null;
}

function acharNegativa(campanha, texto, correspondencia) {
  var tipo = correspondencia === "exata" ? "EXACT" : "PHRASE";
  var alvo = semPontuacaoDaNegativa(texto);
  var it = campanha.negativeKeywords().get();
  while (it.hasNext()) {
    var n = it.next();
    if (n.getMatchType() === tipo && semPontuacaoDaNegativa(n.getText()) === alvo) return n;
  }
  return null;
}

function textoDaNegativa(texto, correspondencia) {
  return correspondencia === "exata" ? "[" + texto + "]" : "\"" + texto + "\"";
}

function semPontuacaoDaNegativa(s) {
  return String(s).replace(/^[[\]"+]+|[[\]"]+$/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function perto(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.005;
}

function resultado(acao, situacao, lido) {
  return { id: acao.id, situacao: situacao, lido: lido || {}, erro: null };
}

function falhou(acao, motivo) {
  return { id: acao.id, situacao: "falhou", lido: {}, erro: String(motivo).slice(0, 500) };
}

function mensagem(e) {
  return String((e && e.message) || e).slice(0, 500);
}

// ── Diagnosticar ───────────────────────────────────────────────────────────

/**
 * O retrato dos últimos 7 dias FECHADOS (ontem e os seis antes). Cada seção é
 * lida à parte: a que o Google recusar vai vazia, com a mensagem em `erros`, e
 * o site a trata como "não deu para ler", nunca como "sem problema".
 */
function lerConta(fuso, previa) {
  var dia = 24 * 3600 * 1000;
  var ontem = new Date(new Date().getTime() - dia);
  var de = Utilities.formatDate(new Date(ontem.getTime() - 6 * dia), fuso, "yyyy-MM-dd");
  var ate = Utilities.formatDate(ontem, fuso, "yyyy-MM-dd");
  var de30 = Utilities.formatDate(new Date(ontem.getTime() - 29 * dia), fuso, "yyyy-MM-dd");
  var periodo = "segments.date BETWEEN '" + de + "' AND '" + ate + "'";

  var retrato = {
    conta: { id: AdsApp.currentAccount().getCustomerId(), moeda: null, fuso: fuso, autoTagging: null },
    de: de,
    ate: ate,
    previa: previa,
    termos: [],
    palavras: [],
    anuncios: [],
    recursos: [],
    conversoes: [],
    campanhas: [],
    grupos: [],
    erros: {}
  };

  secao(retrato, "conta", function () {
    var c = primeira("SELECT customer.currency_code, customer.auto_tagging_enabled FROM customer");
    retrato.conta.moeda = c && c.customer ? c.customer.currencyCode || null : null;
    retrato.conta.autoTagging = c && c.customer && typeof c.customer.autoTaggingEnabled === "boolean"
      ? c.customer.autoTaggingEnabled
      : null;
  });

  secao(retrato, "termos", function () {
    retrato.termos = todas(
      "SELECT search_term_view.search_term, search_term_view.status, campaign.id, campaign.name, " +
        "ad_group.id, ad_group.name, metrics.cost_micros, metrics.clicks, metrics.impressions, " +
        "metrics.conversions FROM search_term_view WHERE " + periodo +
        " AND campaign.advertising_channel_type = 'SEARCH' AND metrics.cost_micros > 0 " +
        "ORDER BY metrics.cost_micros DESC LIMIT 2000",
      function (l) {
        return {
          termo: l.searchTermView.searchTerm,
          status: l.searchTermView.status || null,
          campanhaId: String(l.campaign.id),
          campanha: l.campaign.name,
          grupoId: l.adGroup ? String(l.adGroup.id) : null,
          grupo: l.adGroup ? l.adGroup.name : null,
          custo: reais(l.metrics.costMicros),
          cliques: Number(l.metrics.clicks || 0),
          impressoes: Number(l.metrics.impressions || 0),
          conversoes: duasCasas(l.metrics.conversions)
        };
      }
    );
  });

  secao(retrato, "palavras", function () {
    retrato.palavras = todas(
      "SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, " +
        "ad_group_criterion.keyword.match_type, ad_group_criterion.quality_info.quality_score, " +
        "ad_group_criterion.quality_info.creative_quality_score, " +
        "ad_group_criterion.quality_info.post_click_quality_score, " +
        "ad_group_criterion.quality_info.search_predicted_ctr, campaign.id, campaign.name, " +
        "ad_group.id, ad_group.name, metrics.cost_micros, metrics.clicks, metrics.conversions " +
        "FROM keyword_view WHERE " + periodo + " AND campaign.status = 'ENABLED' " +
        "AND ad_group.status = 'ENABLED' AND ad_group_criterion.status = 'ENABLED' " +
        "ORDER BY metrics.cost_micros DESC LIMIT 2000",
      function (l) {
        var k = l.adGroupCriterion;
        var q = k.qualityInfo || {};
        return {
          id: String(k.criterionId),
          texto: k.keyword.text,
          correspondencia: k.keyword.matchType || null,
          campanhaId: String(l.campaign.id),
          campanha: l.campaign.name,
          grupoId: String(l.adGroup.id),
          grupo: l.adGroup.name,
          iq: q.qualityScore ? Number(q.qualityScore) : null,
          iqAnuncio: q.creativeQualityScore || null,
          iqPagina: q.postClickQualityScore || null,
          iqCtr: q.searchPredictedCtr || null,
          custo: reais(l.metrics.costMicros),
          cliques: Number(l.metrics.clicks || 0),
          conversoes: duasCasas(l.metrics.conversions)
        };
      }
    );
  });

  secao(retrato, "anuncios", function () {
    retrato.anuncios = todas(
      "SELECT ad_group_ad.ad.id, ad_group_ad.policy_summary.approval_status, " +
        "ad_group_ad.policy_summary.review_status, ad_group_ad.policy_summary.policy_topic_entries, " +
        "campaign.id, campaign.name, ad_group.id, ad_group.name FROM ad_group_ad " +
        "WHERE ad_group_ad.status = 'ENABLED' AND ad_group.status = 'ENABLED' " +
        "AND campaign.status = 'ENABLED' LIMIT 2000",
      function (l) {
        var p = l.adGroupAd.policySummary || {};
        return {
          id: String(l.adGroupAd.ad.id),
          campanhaId: String(l.campaign.id),
          campanha: l.campaign.name,
          grupoId: String(l.adGroup.id),
          grupo: l.adGroup.name,
          aprovacao: p.approvalStatus || null,
          revisao: p.reviewStatus || null,
          motivos: topicos(p.policyTopicEntries)
        };
      }
    );
  });

  secao(retrato, "recursos", function () {
    var doAnuncio = todas(
      "SELECT asset.id, asset.type, asset.text_asset.text, ad_group_ad_asset_view.field_type, " +
        "ad_group_ad_asset_view.policy_summary.approval_status, " +
        "ad_group_ad_asset_view.policy_summary.policy_topic_entries, campaign.id, campaign.name, " +
        "ad_group.id, ad_group.name FROM ad_group_ad_asset_view " +
        "WHERE ad_group_ad_asset_view.enabled = TRUE AND campaign.status = 'ENABLED' " +
        "AND ad_group.status = 'ENABLED' AND ad_group_ad_asset_view.policy_summary.approval_status " +
        "IN ('DISAPPROVED', 'APPROVED_LIMITED', 'AREA_OF_INTEREST_ONLY') LIMIT 400",
      function (l) {
        var p = l.adGroupAdAssetView.policySummary || {};
        return {
          id: String(l.asset.id),
          tipo: l.adGroupAdAssetView.fieldType || l.asset.type || null,
          texto: l.asset.textAsset ? l.asset.textAsset.text || null : null,
          campanhaId: String(l.campaign.id),
          campanha: l.campaign.name,
          grupoId: String(l.adGroup.id),
          grupo: l.adGroup.name,
          situacao: p.approvalStatus || null,
          motivos: topicos(p.policyTopicEntries)
        };
      }
    );
    var daCampanha = todas(
      "SELECT asset.id, asset.type, asset.name, campaign_asset.field_type, " +
        "campaign_asset.primary_status, campaign_asset.primary_status_reasons, campaign.id, " +
        "campaign.name FROM campaign_asset WHERE campaign_asset.status = 'ENABLED' " +
        "AND campaign.status = 'ENABLED' AND campaign_asset.primary_status IN ('NOT_ELIGIBLE', 'LIMITED') " +
        "LIMIT 100",
      function (l) {
        return {
          id: String(l.asset.id),
          tipo: l.campaignAsset.fieldType || l.asset.type || null,
          texto: l.asset.name || null,
          campanhaId: String(l.campaign.id),
          campanha: l.campaign.name,
          grupoId: null,
          grupo: null,
          situacao: l.campaignAsset.primaryStatus || null,
          motivos: (l.campaignAsset.primaryStatusReasons || []).map(String)
        };
      }
    );
    retrato.recursos = doAnuncio.concat(daCampanha);
  });

  secao(retrato, "conversoes", function () {
    var porId = {};
    var lista = todas(
      "SELECT conversion_action.id, conversion_action.name, conversion_action.status, " +
        "conversion_action.type, conversion_action.category, conversion_action.primary_for_goal " +
        "FROM conversion_action WHERE conversion_action.status != 'REMOVED' LIMIT 200",
      function (l) {
        var a = l.conversionAction;
        var item = {
          id: String(a.id),
          nome: a.name,
          situacao: a.status || null,
          tipo: a.type || null,
          categoria: a.category || null,
          primaria: a.primaryForGoal === true,
          ultimos7: 0,
          ultimos30: 0,
          ultimoDia: null
        };
        porId[item.id] = item;
        return item;
      }
    );
    var registros = AdsApp.search(
      "SELECT segments.conversion_action, segments.date, metrics.all_conversions FROM campaign " +
        "WHERE segments.date BETWEEN '" + de30 + "' AND '" + ate + "' AND metrics.all_conversions > 0"
    );
    while (registros.hasNext()) {
      var r = registros.next();
      var id = String(r.segments.conversionAction || "").split("/").pop();
      var item = porId[id];
      if (!item) continue;
      var n = Number(r.metrics.allConversions || 0);
      item.ultimos30 = duasCasas(item.ultimos30 + n);
      if (r.segments.date >= de) item.ultimos7 = duasCasas(item.ultimos7 + n);
      if (!item.ultimoDia || r.segments.date > item.ultimoDia) item.ultimoDia = r.segments.date;
    }
    retrato.conversoes = lista;
  });

  secao(retrato, "campanhas", function () {
    var porId = {};
    var lista = todas(
      "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, " +
        "campaign.primary_status, campaign.primary_status_reasons, campaign_budget.amount_micros, " +
        "campaign_budget.explicitly_shared FROM campaign WHERE campaign.status = 'ENABLED' LIMIT 500",
      function (l) {
        var item = {
          id: String(l.campaign.id),
          nome: l.campaign.name,
          tipo: l.campaign.advertisingChannelType || null,
          situacao: l.campaign.status || null,
          verba: l.campaignBudget && l.campaignBudget.amountMicros ? reais(l.campaignBudget.amountMicros) : null,
          verbaCompartilhada: !!(l.campaignBudget && l.campaignBudget.explicitlyShared),
          motivos: (l.campaign.primaryStatusReasons || []).map(String),
          custo7: 0,
          cliques7: 0,
          impressoes7: 0,
          conversoes7: 0,
          custoMes: 0,
          perdaPorVerba: null,
          perdaPorRanking: null
        };
        porId[item.id] = item;
        return item;
      }
    );
    somar(
      "SELECT campaign.id, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions " +
        "FROM campaign WHERE campaign.status = 'ENABLED' AND " + periodo,
      function (l) {
        var c = porId[String(l.campaign.id)];
        if (!c) return;
        c.custo7 = duasCasas(c.custo7 + reais(l.metrics.costMicros));
        c.cliques7 += Number(l.metrics.clicks || 0);
        c.impressoes7 += Number(l.metrics.impressions || 0);
        c.conversoes7 = duasCasas(c.conversoes7 + Number(l.metrics.conversions || 0));
      }
    );
    somar(
      "SELECT campaign.id, metrics.cost_micros FROM campaign WHERE campaign.status = 'ENABLED' " +
        "AND segments.date DURING THIS_MONTH",
      function (l) {
        var c = porId[String(l.campaign.id)];
        if (c) c.custoMes = duasCasas(c.custoMes + reais(l.metrics.costMicros));
      }
    );
    // Parcela de impressão perdida: só existe em Pesquisa, e não derruba a seção.
    try {
      somar(
        "SELECT campaign.id, metrics.search_budget_lost_impression_share, " +
          "metrics.search_rank_lost_impression_share FROM campaign WHERE campaign.status = 'ENABLED' " +
          "AND campaign.advertising_channel_type = 'SEARCH' AND " + periodo,
        function (l) {
          var c = porId[String(l.campaign.id)];
          if (!c) return;
          c.perdaPorVerba = fracao(l.metrics.searchBudgetLostImpressionShare);
          c.perdaPorRanking = fracao(l.metrics.searchRankLostImpressionShare);
        }
      );
    } catch (e) {
      Logger.log("copiloto: parcela de impressão perdida indisponível — " + mensagem(e));
    }
    retrato.campanhas = lista;
  });

  secao(retrato, "grupos", function () {
    var porId = {};
    var lista = todas(
      "SELECT ad_group.id, ad_group.name, campaign.id, campaign.name FROM ad_group " +
        "WHERE ad_group.status = 'ENABLED' AND campaign.status = 'ENABLED' " +
        "AND campaign.advertising_channel_type IN ('SEARCH', 'DISPLAY') LIMIT 2000",
      function (l) {
        var item = {
          id: String(l.adGroup.id),
          nome: l.adGroup.name,
          campanhaId: String(l.campaign.id),
          campanha: l.campaign.name,
          custo7: 0,
          cliques7: 0,
          conversoes7: 0
        };
        porId[item.id] = item;
        return item;
      }
    );
    somar(
      "SELECT ad_group.id, metrics.cost_micros, metrics.clicks, metrics.conversions FROM ad_group " +
        "WHERE ad_group.status = 'ENABLED' AND campaign.status = 'ENABLED' AND " + periodo,
      function (l) {
        var g = porId[String(l.adGroup.id)];
        if (!g) return;
        g.custo7 = duasCasas(g.custo7 + reais(l.metrics.costMicros));
        g.cliques7 += Number(l.metrics.clicks || 0);
        g.conversoes7 = duasCasas(g.conversoes7 + Number(l.metrics.conversions || 0));
      }
    );
    retrato.grupos = lista;
  });

  return retrato;
}

function secao(retrato, nome, ler) {
  try {
    ler();
  } catch (e) {
    retrato.erros[nome] = mensagem(e);
    Logger.log("copiloto: não li " + nome + " — " + mensagem(e));
  }
}

function todas(consulta, montar) {
  var it = AdsApp.search(consulta);
  var lista = [];
  while (it.hasNext()) lista.push(montar(it.next()));
  return lista;
}

function somar(consulta, acumular) {
  var it = AdsApp.search(consulta);
  while (it.hasNext()) acumular(it.next());
}

function primeira(consulta) {
  var it = AdsApp.search(consulta);
  return it.hasNext() ? it.next() : null;
}

function topicos(entradas) {
  return (entradas || []).map(function (t) { return String(t.topic || t.type || t); }).slice(0, 20);
}

function reais(micros) {
  return Math.round(Number(micros || 0) / 1e4) / 100;
}

function duasCasas(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function fracao(v) {
  var n = Number(v);
  return v == null || !isFinite(n) ? null : Math.max(0, Math.min(1, Math.round(n * 10000) / 10000));
}
