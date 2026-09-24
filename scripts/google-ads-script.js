/* global AdsApp, UrlFetchApp, Utilities, Logger */
/**
 * Motors Store — envia as campanhas do Google Ads para o painel do site.
 *
 * COMO INSTALAR (uma vez):
 *   1. Google Ads → Ferramentas → Ações em massa → Scripts → botão "+".
 *   2. Apague o conteúdo de exemplo e cole ESTE arquivo inteiro.
 *   3. Troque COLE_AQUI_O_SEGREDO pelo valor de `midia_google_segredo`
 *      (Supabase → Project Settings → Vault).
 *   4. "Autorizar", depois "Visualizar": o registro tem que terminar com
 *      "painel respondeu 200".
 *   5. Salve e, em "Frequência", escolha "A cada hora".
 *
 * O que ele faz: lê gasto, impressões, cliques e conversões por campanha e por
 * dia dos últimos 7 dias (hoje incluído) e manda para
 * /api/marketing/sincronizar/google. O site apaga e regrava esses 7 dias, então
 * rodar de novo nunca duplica. Contrato do JSON: `validarPayloadGoogle` em
 * src/lib/midiaSync.ts — mudou lá, muda aqui.
 */

var URL_DO_PAINEL = "https://motorsstore.com.br/api/marketing/sincronizar/google";
var SEGREDO = "COLE_AQUI_O_SEGREDO";
var DIAS = 7;

// `main` é o ponto de entrada que o próprio Google Ads chama.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function main() {
  if (SEGREDO === "COLE_AQUI_O_SEGREDO") {
    throw new Error("Troque COLE_AQUI_O_SEGREDO pelo segredo do Vault antes de rodar.");
  }

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
      investido: Math.round(Number(l.metrics.costMicros || 0) / 1e4) / 100,
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
