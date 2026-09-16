import { getCachedSettings } from "../lib/settings";
import {
  cargaDaCamadaGlobal,
  fonteDoTipoDePagina,
  sanitizeGa4Id,
  sanitizeGtmId,
  sanitizeMetaPixelId,
} from "../lib/dataLayer";

/**
 * GA4, GTM e o Meta Pixel no HTML SERVIDO — executam durante o parse, não na
 * hidratação.
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
 * O Meta Pixel, desde 2026-09-16
 * ---------------------------------------------------------------------------
 * O #46 subiu GA4 e GTM e deixou o pixel no tracker. Lá ele só inicializava
 * depois de o `/api/settings` responder, porque o `companySettings.json` do
 * repositório tem `metaPixelId: ""`: entrou aos 3,7 s em 02/09 e aos 5,4 s em
 * 16/09. Quem saía antes não gerava `PageView`; com a API fora do ar o Meta
 * ficava em zero; e o `fbq` ainda não existia quando a ficha aberta na chegada
 * disparava o `ViewContent`, então só a metade do CAPI saía. O `_fbp`, que o
 * `fbevents.js` grava, nascia tarde para esse `ViewContent` e para o lead
 * enviado cedo.
 *
 * Agora o pixel sobe aqui, com o id do painel lido no servidor, o mesmo de onde
 * vêm GA4 e GTM. Três escolhas que não são as do snippet oficial:
 *
 *   - **Sem `eventID` no `PageView`.** Ele não tem espelho no CAPI (`/api/capi`
 *     não o aceita), e o do tracker nunca levou um. Se um dia ganhar espelho,
 *     este `PageView` precisa do MESMO `eventID`, senão o Meta conta dois.
 *   - **`init` sem parâmetro**, como o do tracker: nenhum dos dois manda
 *     correspondência avançada. O `ag_uid` vai ao Meta só pelo CAPI.
 *   - **O stub nasce DEPOIS do `appendChild`.** No snippet oficial ele nasce
 *     antes; se a injeção lançasse, ficaria um `fbq` sem biblioteca, e o
 *     snippet do tracker, que desiste quando `fbq` já existe, nunca carregaria
 *     o `fbevents.js`. Pela mesma razão do `gtm.start` abaixo, a ordem não muda
 *     o que a biblioteca encontra: ela é `async` e só executa depois deste
 *     bloco inteiro.
 *
 * Um `PageView` por chegada, por construção: o tracker pula a inicialização
 * quando a marca traz o pixel, e o efeito de navegação só conta troca de
 * caminho. Não depende de o pixel descartar a repetição da mesma URL.
 *
 * Sem `<noscript>` com a imagem do pixel: sem JavaScript não há como ler a
 * oposição, e a imagem contaria quem se opôs.
 *
 * ---------------------------------------------------------------------------
 * O que continua no `IntegrationsTracker`
 * ---------------------------------------------------------------------------
 * Tudo o mais: `_fbc`, parâmetros de campanha, as visualizações de cada
 * navegação no cliente, e a subida de qualquer tag que este script não subiu
 * (servidor sem id, injeção que lançou, oposição retirada na mesma aba).
 * Aquele componente pula GA4, GTM e o pixel quando encontra em
 * `window.__mtTagsNoAto` o que este script de fato injetou — sem isso o
 * container entraria duas vezes e todo evento contaria em dobro, e o pixel
 * contaria a chegada duas vezes. O marcador só recebe um id DEPOIS de a tag
 * entrar (no pixel, depois do `init` e do `PageView`): marcador que promete o
 * que não entrou faz o tracker pular, e a tag não sobe por ninguém.
 *
 * `CamadaDeDados` idem: lê `window.__mtTipoJaPublicado` para não repetir o
 * `page_context` da primeira página. Push com `event` aciona gatilho, então
 * repetir não é redundância inofensiva — é evento duplicado.
 */
export default async function BootstrapDeTags() {
  let ga4Id = "";
  let gtmId = "";
  let pixelId = "";
  let assumeEventos = false;

  try {
    const { companySettings } = await getCachedSettings();
    ga4Id = sanitizeGa4Id(companySettings?.ga4Id || "");
    gtmId = sanitizeGtmId(companySettings?.gtmId || "");
    pixelId = sanitizeMetaPixelId(companySettings?.metaPixelId || "");
    assumeEventos = companySettings?.gtmAssumeEventos === true;
  } catch {
    // Configuração indisponível não pode derrubar o layout: sem id, este
    // componente não renderiza nada e o `IntegrationsTracker` segue como
    // antes — tarde, mas funcionando.
    return null;
  }

  // Aqui o GTM exige os dois: o id e o consentimento explícito de que o
  // container assume os eventos. Ligar o container sem isso foi o que, em
  // 26/08, fez `generate_lead` parar de chegar ao GA4.
  //
  // O `IntegrationsTracker` não exige o segundo: ele sobe o container só com o
  // id. Então, sem `gtmAssumeEventos`, o GTM não entra no parse, mas entra na
  // hidratação, pelo tracker, uma vez — como antes desta mudança.
  const gtmLigado = Boolean(gtmId) && assumeEventos;
  if (!ga4Id && !gtmLigado && !pixelId) return null;

  const carga = JSON.stringify(cargaDaCamadaGlobal({ page_type: "other" }));

  // `w.location`, e não o `location` global: o script referencia só o que
  // recebe por `window` e `document`. Além de ser mais explícito, é o que
  // permite executá-lo num DOM de mentira — e é assim que
  // `tests/tags-no-ato.test.ts` prova o comportamento, já que o `preview_start`
  // deste projeto só alcança o diretório primário.
  //
  // O marcador `__mtTagsNoAto` diz o que ENTROU, não o que o servidor mandou
  // subir. Até a revisão do PR #46 ele era gravado no fim do script, com os ids
  // da configuração, tivesse o `try` de cada tag dado certo ou não: se a
  // injeção lançasse, o tracker lia "já subiu", pulava, e a tag não subia por
  // ninguém. Agora ele nasce vazio logo depois da oposição (quem se opôs não
  // ganha marcador), e cada id é gravado na ÚLTIMA linha do `try` da própria
  // tag, depois do `appendChild`.
  //
  // No GTM, o `gtm.start` vai depois do `appendChild`, e não antes como no
  // snippet oficial. Se a injeção lançar, não fica na fila um `gtm.js` órfão
  // para somar ao que o tracker empurra quando sobe o container, e é nesse
  // evento que disparam os gatilhos de carregamento de página. O script é
  // `async` e só executa depois deste bloco inteiro, então a ordem não muda o
  // que o container encontra na fila.
  //
  // No pixel, o stub vai depois do `appendChild` pelo mesmo motivo, e a marca
  // depois do `init` e do `PageView`: um `fbq` que já existia e lança não pode
  // deixar a marca prometendo um pixel que não inicializou. Se o `fbq` já
  // existe, o script não insere uma segunda biblioteca, como o snippet oficial.
  const script = `(function(){
  try{
    if(localStorage.getItem('ag_cookie_consent')==='rejected')return;
  }catch(e){}
  var w=window,d=document;
  w.dataLayer=w.dataLayer||[];
  var m=w.__mtTagsNoAto={ga4:null,gtm:null,meta:null};
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
    m.ga4='${ga4Id}';
  }catch(e){}`
      : ""
  }
  ${
    gtmLigado
      ? `try{
    var j=d.createElement('script');j.async=true;
    j.src='https://www.googletagmanager.com/gtm.js?id=${gtmId}';
    d.head.appendChild(j);
    w.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});
    m.gtm='${gtmId}';
  }catch(e){}`
      : ""
  }
  ${
    pixelId
      ? `try{
    var n=w.fbq;
    if(!n){
      var t=d.createElement('script');t.async=true;
      t.src='https://connect.facebook.net/en_US/fbevents.js';
      d.head.appendChild(t);
      n=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments);};
      n.push=n;n.loaded=true;n.version='2.0';n.queue=[];
      w.fbq=n;
      if(!w._fbq)w._fbq=n;
    }
    w.fbq('init','${pixelId}');
    w.fbq('track','PageView');
    m.meta='${pixelId}';
  }catch(e){}`
      : ""
  }
})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
