import { getCachedSettings } from "../lib/settings";
import {
  cargaDaCamadaGlobal,
  fonteDoTipoDePagina,
  sanitizeGa4Id,
  sanitizeGtmId,
} from "../lib/dataLayer";

/**
 * GA4 e GTM no HTML SERVIDO — executam durante o parse, não na hidratação.
 *
 * ---------------------------------------------------------------------------
 * O número que motivou isto
 * ---------------------------------------------------------------------------
 * Medido na home em produção em 2026-09-02, sem interação nenhuma:
 *
 *   load da página ....... 2.979 ms
 *   GA4 entra ............ 3.069 ms
 *   GTM entra ............ 3.071 ms
 *   Google Ads ........... 3.556 ms
 *   Meta Pixel ........... 3.732 ms
 *
 * Todas as tags viviam no `useEffect` do `IntegrationsTracker`, que só roda
 * depois da hidratação. **Quem saía antes dos três segundos não era medido por
 * ninguém** — nem sessão no GA4, nem clique no Ads, nem PageView no Pixel. Num
 * site cujo tráfego é majoritariamente mobile, é a faixa onde mais gente sai.
 *
 * O diagnóstico intuitivo estava errado, e vale registrar: **não era o aceite
 * de cookies que segurava.** Esse portão caiu em 31/08 — a única barreira hoje
 * é a oposição explícita em `/privacidade` (`ag_cookie_consent = "rejected"`),
 * e nenhum banner bloqueia nada. Era o React.
 *
 * ---------------------------------------------------------------------------
 * A ordem que este arquivo preserva
 * ---------------------------------------------------------------------------
 * O `page_context` tem de estar no `dataLayer` ANTES do container, porque é o
 * que o GTM lê para decidir gatilho e variável (ver `CamadaDeDados`). Subir o
 * GTM para o parse sem subir o contexto junto inverteria essa ordem em toda
 * primeira visita — um defeito silencioso, que só apareceria como relatório
 * errado semanas depois.
 *
 * Por isso o script faz os três na ordem: **oposição → page_context → tags.**
 * O tipo da página é calculado no navegador por `fonteDoTipoDePagina()`, que
 * monta a régua a partir das MESMAS constantes de `tipoDaPagina` — não é uma
 * segunda regra, é a mesma tabela. `tests/camada-de-dados.test.ts` roda as duas
 * leituras sobre a mesma lista de caminhos e falha na divergência.
 *
 * ---------------------------------------------------------------------------
 * O que continua no `IntegrationsTracker`
 * ---------------------------------------------------------------------------
 * Tudo o mais: Meta Pixel, `_fbc`, parâmetros de campanha, e a reconfiguração
 * do GA4 quando o visitante navega sem recarregar. Aquele componente pula GA4 e
 * GTM quando encontra `window.__mtTagsNoAto`, que este script marca — sem isso
 * o container entraria duas vezes e todo evento contaria em dobro.
 *
 * `CamadaDeDados` idem: lê `window.__mtTipoJaPublicado` para não repetir o
 * `page_context` da primeira página. Push com `event` aciona gatilho, então
 * repetir não é redundância inofensiva — é evento duplicado.
 */
export default async function BootstrapDeTags() {
  let ga4Id = "";
  let gtmId = "";
  let assumeEventos = false;

  try {
    const { companySettings } = await getCachedSettings();
    ga4Id = sanitizeGa4Id(companySettings?.ga4Id || "");
    gtmId = sanitizeGtmId(companySettings?.gtmId || "");
    assumeEventos = companySettings?.gtmAssumeEventos === true;
  } catch {
    // Configuração indisponível não pode derrubar o layout: sem id, este
    // componente não renderiza nada e o `IntegrationsTracker` segue como
    // antes — tarde, mas funcionando.
    return null;
  }

  // O GTM exige os dois, como no `IntegrationsTracker`: o id e o consentimento
  // explícito de que o container assume os eventos. Ligar o container sem isso
  // foi o que, em 26/08, fez `generate_lead` parar de chegar ao GA4.
  const gtmLigado = Boolean(gtmId) && assumeEventos;
  if (!ga4Id && !gtmLigado) return null;

  const carga = JSON.stringify(cargaDaCamadaGlobal({ page_type: "other" }));

  // `w.location`, e não o `location` global: o script referencia só o que
  // recebe por `window` e `document`. Além de ser mais explícito, é o que
  // permite executá-lo num DOM de mentira — e é assim que
  // `tests/tags-no-ato.test.ts` prova o comportamento, já que o `preview_start`
  // deste projeto só alcança o diretório primário.
  const script = `(function(){
  try{
    if(localStorage.getItem('ag_cookie_consent')==='rejected')return;
  }catch(e){}
  var w=window,d=document;
  w.dataLayer=w.dataLayer||[];
  try{
    var tipoDa=${fonteDoTipoDePagina()};
    var caminho=w.location.pathname;
    var carga=${carga};
    carga.page_type=tipoDa(caminho);
    w.dataLayer.push(carga);
    w.__mtTipoJaPublicado=caminho;
  }catch(e){}
  ${
    ga4Id
      ? `try{
    var g=d.createElement('script');g.async=true;
    g.src='https://www.googletagmanager.com/gtag/js?id=${ga4Id}';
    d.head.appendChild(g);
    function gtag(){w.dataLayer.push(arguments);}
    w.gtag=w.gtag||gtag;
    w.gtag('js',new Date());
    w.gtag('config','${ga4Id}',{page_path:w.location.pathname});
  }catch(e){}`
      : ""
  }
  ${
    gtmLigado
      ? `try{
    w.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});
    var j=d.createElement('script');j.async=true;
    j.src='https://www.googletagmanager.com/gtm.js?id=${gtmId}';
    d.head.appendChild(j);
  }catch(e){}`
      : ""
  }
  w.__mtTagsNoAto={ga4:${JSON.stringify(ga4Id || null)},gtm:${JSON.stringify(gtmLigado ? gtmId : null)}};
})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
