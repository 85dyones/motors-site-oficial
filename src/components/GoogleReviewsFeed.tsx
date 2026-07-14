"use client";

import { useState, useEffect, useRef } from "react";
import { useTheme } from "../app/ThemeContext";
import Script from "next/script";

export default function GoogleReviewsFeed() {
  const { companySettings } = useTheme();
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLElement>(null);
  
  const rawId = companySettings?.googleReviewsElfsightId?.trim() || "";
  let elfsightId = rawId;
  const match = rawId.match(/elfsight-app-([a-zA-Z0-9-]+)/);
  if (match && match[1]) {
    elfsightId = match[1];
  }

  useEffect(() => {
    if (!elfsightId) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" } // Load slightly before it comes into view
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [elfsightId]);

  return (
    <section ref={containerRef} aria-label="Avaliações do Google" className="w-full bg-brand-card/30 border border-brand-card-border rounded-3xl p-6 md:p-8 flex flex-col gap-6 animate-fadeIn min-h-[200px]">
      {elfsightId ? (
        <>
          {isVisible && (
            <Script src="https://static.elfsight.com/platform/platform.js" strategy="lazyOnload" />
          )}
          <div className={`elfsight-app-${elfsightId}`} data-elfsight-app-lazy></div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-12 h-12 text-brand-primary/40 mb-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
          </svg>
          <h3 className="text-xl font-black text-brand-text mb-2">Avaliações do Google</h3>
          <p className="text-sm text-brand-text/50 max-w-md mx-auto mb-6">
            O widget de avaliações não está configurado. Para exibir suas notas reais, crie um widget gratuito no Elfsight e cole o ID nas configurações do painel.
          </p>
          <a
            href="https://elfsight.com/google-reviews-widget/"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-bold uppercase tracking-widest px-6 py-3 rounded-xl transition-all duration-300"
          >
            Criar Widget de Avaliações
          </a>
        </div>
      )}
    </section>
  );
}
