"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "../app/ThemeContext";
import { marcarContainerAtivo } from "../lib/dataLayer";
import { persistirParametrosDeCampanha } from "../lib/telemetry";

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    fbq?: (...args: any[]) => void;
    // `dataLayer` é declarado em `lib/dataLayer.ts`, que é quem escreve nele.
    // Repetir aqui com outro tipo faz o TypeScript recusar as duas declarações.
    _fbq?: any;
  }
}

// O painel admin aceita tanto o ID puro ("GTM-TB665RN9") quanto o snippet
// completo colado do Google Tag Manager. Extrai só o ID e descarta o resto —
// o valor é interpolado dentro de um <script>, então nada além do ID entra.
function sanitizeGtmId(raw: string): string {
  const match = raw.match(/GTM-[A-Z0-9]+/i);
  return match ? match[0].toUpperCase() : "";
}

export default function IntegrationsTracker() {
  const { companySettings } = useTheme();
  const pathname = usePathname();
  /**
   * O ID do GA4 vem das configurações — e de mais lugar nenhum.
   *
   * Havia aqui um segundo padrão escrito à mão, `"G-CZ4B4RYF61"`, diferente do
   * que `lib/companySettings.json` e a produção usam (`G-KBL1MFN9E3`). Como o
   * `ThemeContext` começa com o JSON e só depois busca `/api/settings`, e como
   * a inicialização abaixo só acontecia uma vez, o site abria a propriedade
   * errada e nunca corrigia: os eventos iam para uma propriedade que ninguém
   * abre. É a explicação mais provável para a auditoria de 24/08/2026 ter
   * concluído que "o GA4 instalado não recebe nenhum evento que importa".
   *
   * Um padrão só, num arquivo só. Se o ID mudar, muda no painel.
   */
  const ga4Id = companySettings?.ga4Id || "";
  const gtmId = sanitizeGtmId(companySettings?.gtmId || "");
  // Default `false`: na dúvida, o código continua medindo. Perder evento é
  // irreversível; contar em dobro por um dia, não.
  const assumeEventos = companySettings?.gtmAssumeEventos === true;
  const metaPixelId = companySettings?.metaPixelId || "";
  const googleAdsId = companySettings?.googleAdsId || "";

  // Guarda QUAL id foi inicializado, não apenas "se" foi. Um booleano fazia o
  // componente ignorar para sempre o ID verdadeiro que chegava depois das
  // configurações — ver a nota acima.
  const idGA4Inicializado = useRef<string | null>(null);
  const bibliotecaGtagCarregada = useRef(false);
  const initializedGTM = useRef(false);
  const initializedMeta = useRef(false);
  const initializedGAds = useRef(false);
  const isFirstPathnameRun = useRef(true);

  /**
   * Avisa o `telemetry.ts` de que o container assumiu os eventos.
   *
   * Exige `gtmId` **e** o consentimento explícito `gtmAssumeEventos`. A
   * primeira versão olhava só o `gtmId`, e isso estava errado: em 2026-08-26 o
   * container estava configurado e carregando em produção, mas **vazio** —
   * importado sem as tags. O código cedeu a vez para quem não media nada, e o
   * `generate_lead` parou de chegar ao GA4.
   *
   * Container carregando ≠ container medindo. O site não tem como distinguir
   * os dois de fora, então quem publicou precisa dizer.
   *
   * Fora do portão de consentimento de propósito: sem aceite, nem o GTM nem o
   * `gtag` enviam coisa alguma.
   */
  useEffect(() => {
    marcarContainerAtivo(Boolean(gtmId) && assumeEventos);
  }, [gtmId, assumeEventos]);

  useEffect(() => {
    /**
     * `_fbc` por 90 dias, quando a visita veio de um anúncio do Meta.
     *
     * -----------------------------------------------------------------------
     * Passou para DENTRO do portão em 27/08
     * -----------------------------------------------------------------------
     * A versão anterior gravava o cookie antes do aceite, argumentando que
     * capturar o parâmetro não é o mesmo que enviar evento. O argumento tem
     * lógica e mesmo assim não se sustenta: a política publicada afirma, com
     * essas palavras, que *"enquanto você não aceitar, nenhuma ferramenta de
     * análise ou publicidade é carregada"* — e a mesma política declara `_fbc`
     * como cookie de atribuição de anúncio. Escrevê-lo antes do aceite
     * desmente o texto que o visitante leu.
     *
     * Não custa mídia; custa numa reclamação à ANPD, e o conserto é este.
     *
     * O que se perde é menos do que parece: esta função roda também no evento
     * `ag-cookie-consent-updated`, então quem aceita o banner ainda na página
     * de entrada tem o `fbclid` capturado na hora, direto da URL. Some só o
     * caso de quem navega para outra página antes de aceitar.
     */
    const persistirFbc = () => {
      try {
        const fbclid = new URLSearchParams(window.location.search).get("fbclid");
        if (fbclid && !document.cookie.includes("_fbc=")) {
          const fbc = `fb.1.${Date.now()}.${fbclid}`;
          document.cookie = `_fbc=${fbc}; path=/; max-age=7776000; SameSite=Lax`;
        }
      } catch (e) {
        console.warn("[IntegrationsTracker] Failed to persist _fbc cookie:", e);
      }
    };

    const checkAndInitTrackors = () => {
      if (typeof window === "undefined") return;

      const consent = localStorage.getItem("ag_cookie_consent");
      if (consent !== "accepted") {
        console.log("[IntegrationsTracker] Tracking disabled. LGPD Cookie consent not accepted yet.");
        return;
      }

      persistirFbc();

      // Os parâmetros de campanha da URL (`gclid`, `gbraid`, `wbraid`,
      // `fbclid` e os cinco `utm_*`), pelo mesmo motivo e no mesmo lugar que o
      // `_fbc`: são identificadores de anúncio, e a política promete não
      // guardá-los antes do aceite.
      //
      // Estar AQUI é o que faz a captura acontecer na ENTRADA. Até 27/08 a
      // gravação só existia dentro de `getUtmParameters`, que só roda em
      // handler de envio de formulário — então o parâmetro se perdia em quem
      // chegava do anúncio, navegava, e só depois enviava. Rodando no mount e
      // de novo no `ag-cookie-consent-updated`, quem aceita o banner na página
      // de destino tem o `gclid` capturado direto da URL.
      persistirParametrosDeCampanha();

      // 1. Google Analytics 4 (GA4) Initialization
      if (ga4Id && idGA4Inicializado.current !== ga4Id) {
        try {
          if (idGA4Inicializado.current) {
            console.warn(
              `[IntegrationsTracker] ID do GA4 mudou de ${idGA4Inicializado.current} para ${ga4Id}. ` +
                "Configurando o novo; o anterior continua recebendo nesta sessão.",
            );
          }
          console.log(`[IntegrationsTracker] Initializing GA4 with ID: ${ga4Id}`);

          // A biblioteca entra uma vez só; o `config` é por propriedade.
          if (!bibliotecaGtagCarregada.current) {
            const script1 = document.createElement("script");
            script1.async = true;
            script1.src = `https://www.googletagmanager.com/gtag/js?id=${ga4Id}`;
            document.head.appendChild(script1);
            bibliotecaGtagCarregada.current = true;
          }

          const script2 = document.createElement("script");
          script2.innerHTML = `
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            window.gtag = window.gtag || gtag;
            window.gtag('js', new Date());
            window.gtag('config', '${ga4Id}', {
              page_path: window.location.pathname,
            });
          `;
          document.head.appendChild(script2);
          idGA4Inicializado.current = ga4Id;
        } catch (e) {
          console.error("[IntegrationsTracker] Failed to initialize GA4:", e);
        }
      }

      // 1.2. Google Tag Manager (container)
      // ATENÇÃO: GA4, Google Ads e Meta Pixel já são carregados diretamente aqui
      // neste mesmo componente. NÃO configurar essas mesmas tags dentro do
      // container do GTM — os eventos disparariam duas vezes. Use o GTM apenas
      // para tags de terceiros que não passam por este arquivo.
      if (gtmId && !initializedGTM.current) {
        try {
          console.log(`[IntegrationsTracker] Initializing GTM with ID: ${gtmId}`);

          const script = document.createElement("script");
          script.innerHTML = `
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${gtmId}');
          `;
          document.head.appendChild(script);
          initializedGTM.current = true;
        } catch (e) {
          console.error("[IntegrationsTracker] Failed to initialize GTM:", e);
        }
      }

      // 1.5. Google Ads Initialization
      //
      // ⚠️  **Hoje quem dá o `config` do `AW-18360613832` é o contêiner**, pela
      // tag "Tag do Google - AW (conversoes otimizadas)", criada em 2026-08-26.
      // O bloco abaixo NUNCA rodou em produção porque `googleAdsId` está vazio
      // em `site_settings` — e o resultado disso foi caro: sem `config` na
      // página, o gtag enfileirava os hits do Ads e não mandava. O Assistente de
      // Tags mostrava "Hits adiados", e remarketing dinâmico e dados de
      // conversões otimizadas iam para o lixo em silêncio.
      //
      // Isso é exceção à regra do §0 de `docs/GTM_CONFIGURACAO.md` ("não
      // configure o Ads dentro do contêiner"): a regra vale para GA4 e Meta
      // Pixel, que este arquivo realmente carrega. Para o Ads ela partia de uma
      // premissa que o painel nunca cumpriu.
      //
      // **Não preencha `googleAdsId` no painel sem antes ler o §5 daquele
      // documento.** Preencher aqui não é "ligar o Ads": é (a) um segundo
      // `config` para o mesmo destino e (b) — porque `gtmAssumeEventos` também
      // é `false` — o `telemetry.ts` voltando a disparar a conversão de lead
      // por conta própria, em cima da tag `Ads - conv_lead` do contêiner. Dupla
      // contagem, CPA pela metade, e nenhum aviso na tela.
      if (googleAdsId && !initializedGAds.current) {
        try {
          console.log(`[IntegrationsTracker] Initializing Google Ads with ID: ${googleAdsId}`);
          
          const script1 = document.createElement("script");
          script1.async = true;
          script1.src = `https://www.googletagmanager.com/gtag/js?id=${googleAdsId}`;
          document.head.appendChild(script1);

          const script2 = document.createElement("script");
          script2.innerHTML = `
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            window.gtag = window.gtag || gtag;
            window.gtag('js', new Date());
            window.gtag('config', '${googleAdsId}');
          `;
          document.head.appendChild(script2);
          initializedGAds.current = true;
        } catch (e) {
          console.error("[IntegrationsTracker] Failed to initialize Google Ads:", e);
        }
      }

      // 2. Meta Pixel Initialization
      if (!metaPixelId) {
        console.warn("[IntegrationsTracker] metaPixelId ausente em companySettings — Meta Pixel NÃO será inicializado. Configurar em site_settings (Supabase).");
      } else if (!initializedMeta.current) {
        try {
          console.log(`[IntegrationsTracker] Initializing Meta Pixel with ID: ${metaPixelId}`);

          const script = document.createElement("script");
          script.innerHTML = `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${metaPixelId}');
            fbq('track', 'PageView');
          `;
          document.head.appendChild(script);
          initializedMeta.current = true;
        } catch (e) {
          console.error("[IntegrationsTracker] Failed to initialize Meta Pixel:", e);
        }
      }
    };

    // Run check on mount
    checkAndInitTrackors();

    // Listen to custom event when cookie consent state changes
    window.addEventListener("ag-cookie-consent-updated", checkAndInitTrackors);
    return () => {
      window.removeEventListener("ag-cookie-consent-updated", checkAndInitTrackors);
    };
  }, [ga4Id, gtmId, metaPixelId, googleAdsId]);

  // Track dynamic PageView changes when pathname changes
  useEffect(() => {
    if (typeof window === "undefined") return;

    // The first run coincides with the initial mount/init above, which already
    // sends its own PageView (via fbq('track','PageView') and gtag('config', ...)).
    // Skip it here to avoid double-counting; only real pathname changes should fire.
    if (isFirstPathnameRun.current) {
      isFirstPathnameRun.current = false;
      return;
    }

    const consent = localStorage.getItem("ag_cookie_consent");
    if (consent !== "accepted") return;

    // Dispatch GA4 page view
    if (window.gtag && ga4Id) {
      window.gtag("event", "page_view", {
        page_path: pathname,
        send_to: ga4Id
      });
    }

    // Dispatch Meta Pixel page view
    if (window.fbq && metaPixelId) {
      window.fbq("track", "PageView");
    }
    
    console.log(`[IntegrationsTracker] Logged PageView: ${pathname}`);
  }, [pathname, ga4Id, metaPixelId]);

  return null; // Invisible component
}
