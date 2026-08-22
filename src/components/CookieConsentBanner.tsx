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

  // Na linguagem Modernist (2026-08-22), junto com o pop-up de lead e o modal
  // de captura: as três peças da moldura eram as últimas na casca antiga.
  // Fica acima do pop-up de propósito (z-9999 vs z-999): consentimento vem
  // antes de campanha.
  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-[9999] flex flex-col gap-3.5 border-t-4 border-mt-accent bg-mt-bg p-5 shadow-[var(--mt-shadow-lg)] animate-fadeIn md:left-auto md:right-4 md:max-w-md"
      role="dialog"
      aria-live="polite"
      aria-label="Aviso de Privacidade e Cookies"
    >
      {/* Header */}
      <span className="mt-rotulo mt-rotulo-accent">Privacidade &amp; Cookies</span>

      {/* Description */}
      <p className="m-0 text-[11px] leading-relaxed text-mt-neutral-800">
        A Motors Store utiliza cookies e outras tecnologias semelhantes para melhorar a sua experiência, otimizar a navegação, personalizar publicidade (Google e Meta Pixel) e analisar o tráfego do portal. Ao aceitar, você concorda com o uso dessas tags conforme a nossa{" "}
        <Link
          href="/privacidade"
          className="font-semibold text-mt-ink underline decoration-mt-accent decoration-2 underline-offset-2 hover:text-mt-accent"
        >
          Política de Privacidade
        </Link>
        , em conformidade com a LGPD. Recusar não impede o uso do site.
      </p>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2 border-t border-mt-regua-fina pt-3">
        <button
          onClick={handleReject}
          className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[10px] uppercase"
        >
          Rejeitar
        </button>
        <button
          onClick={handleAccept}
          className="mt-btn mt-btn-primario mt-foco cursor-pointer px-5 py-2.5 text-[10px] uppercase"
        >
          Aceitar Todos
        </button>
      </div>
    </div>
  );
}
