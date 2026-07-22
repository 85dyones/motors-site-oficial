"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "../app/ThemeContext";

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    fbq?: (...args: any[]) => void;
    dataLayer?: any[];
    _fbq?: any;
  }
}

export default function IntegrationsTracker() {
  const { companySettings } = useTheme();
  const pathname = usePathname();
  const ga4Id = companySettings?.ga4Id || "G-CZ4B4RYF61";
  const metaPixelId = companySettings?.metaPixelId || "";
  const googleAdsId = companySettings?.googleAdsId || "";
  
  const initializedGA4 = useRef(false);
  const initializedMeta = useRef(false);
  const initializedGAds = useRef(false);

  useEffect(() => {
    const checkAndInitTrackors = () => {
      if (typeof window === "undefined") return;

      const consent = localStorage.getItem("ag_cookie_consent");
      if (consent !== "accepted") {
        console.log("[IntegrationsTracker] Tracking disabled. LGPD Cookie consent not accepted yet.");
        return;
      }

      // 1. Google Analytics 4 (GA4) Initialization
      if (ga4Id && !initializedGA4.current) {
        try {
          console.log(`[IntegrationsTracker] Initializing GA4 with ID: ${ga4Id}`);
          
          const script1 = document.createElement("script");
          script1.async = true;
          script1.src = `https://www.googletagmanager.com/gtag/js?id=${ga4Id}`;
          document.head.appendChild(script1);

          const script2 = document.createElement("script");
          script2.innerHTML = `
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('js', new Date());
            gtag('config', '${ga4Id}', {
              page_path: window.location.pathname,
            });
          `;
          document.head.appendChild(script2);
          initializedGA4.current = true;
        } catch (e) {
          console.error("[IntegrationsTracker] Failed to initialize GA4:", e);
        }
      }

      // 1.5. Google Ads Initialization
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
      if (metaPixelId && !initializedMeta.current) {
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
  }, [ga4Id, metaPixelId]);

  // Track dynamic PageView changes when pathname changes
  useEffect(() => {
    if (typeof window === "undefined") return;
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
