"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function CookieConsentBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const consent = localStorage.getItem("ag_cookie_consent");
      if (!consent) {
        // Show banner after a slight delay for better transition effect
        const timer = setTimeout(() => setIsVisible(true), 1500);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem("ag_cookie_consent", "accepted");
    setIsVisible(false);
    // Dispatch global custom event for re-evaluation in trackers
    window.dispatchEvent(new Event("ag-cookie-consent-updated"));
  };

  const handleReject = () => {
    localStorage.setItem("ag_cookie_consent", "rejected");
    setIsVisible(false);
    window.dispatchEvent(new Event("ag-cookie-consent-updated"));
  };

  if (!isVisible) return null;

  return (
    <div 
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-[9999] bg-brand-card/95 backdrop-blur-md border border-brand-card-border p-5 shadow-2xl flex flex-col gap-4 rounded-2xl animate-fadeIn"
      role="dialog"
      aria-live="polite"
      aria-label="Aviso de Privacidade e Cookies"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M12 2.25a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75ZM6.162 5.736a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 1 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.06Zm10.616 0a.75.75 0 0 1 0 1.06l-1.06 1.06a.75.75 0 1 1-1.06-1.06l1.06-1.06a.75.75 0 0 1 1.06 0ZM12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM2.25 12a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5H3a.75.75 0 0 1-.75-.75Zm15 0a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5H18a.75.75 0 0 1-.75-.75ZM6.162 18.264a.75.75 0 0 1 0-1.06l1.06-1.06a.75.75 0 1 1 1.06 1.06l-1.06 1.06a.75.75 0 0 1-1.06 0Zm10.616 0a.75.75 0 0 1-1.06-1.06l1.06-1.06a.75.75 0 1 1 1.06 1.06l-1.06 1.06a.75.75 0 0 1 0 1.06ZM12 19.5a.75.75 0 0 1 .75.75V21.75a.75.75 0 0 1-1.5 0V20.25a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
          </svg>
        </div>
        <span className="text-[10px] font-bold text-brand-gold uppercase tracking-widest leading-none">
          Privacidade & Cookies
        </span>
      </div>

      {/* Description */}
      <p className="text-[11px] text-brand-text/75 leading-relaxed">
        A Motors Store utiliza cookies e outras tecnologias semelhantes para melhorar a sua experiência, otimizar a navegação, personalizar publicidade (Google e Meta Pixel) e analisar o tráfego do portal. Ao aceitar, você concorda com o uso dessas tags conforme a nossa{" "}
        <Link
          href="/privacidade"
          className="text-brand-primary hover:text-brand-primary-hover underline underline-offset-2 font-medium"
        >
          Política de Privacidade
        </Link>
        , em conformidade com a LGPD. Recusar não impede o uso do site.
      </p>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2.5 pt-1.5">
        <button
          onClick={handleReject}
          className="text-[9px] font-bold text-brand-text/50 hover:text-brand-text uppercase tracking-widest px-4 py-2 border border-brand-card-border hover:border-brand-text/30 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
        >
          Rejeitar
        </button>
        <button
          onClick={handleAccept}
          className="text-[9px] font-bold text-white bg-brand-primary hover:bg-brand-primary-hover uppercase tracking-widest px-5 py-2.5 rounded-xl shadow-md transition-all duration-200 active:scale-95 cursor-pointer"
        >
          Aceitar Todos
        </button>
      </div>
    </div>
  );
}
