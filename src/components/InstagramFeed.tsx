"use client";

import { useState, useEffect, useRef } from "react";
import { useTheme } from "../app/ThemeContext";
import Script from "next/script";

export default function InstagramFeed() {
  const { companySettings } = useTheme();
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLElement>(null);

  const rawId = companySettings?.instagramElfsightId?.trim() || "";
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
    <section ref={containerRef} aria-label="Feed do Instagram" className="w-full bg-brand-card/30 border border-brand-card-border rounded-3xl p-6 md:p-8 flex flex-col gap-6 animate-fadeIn min-h-[200px]">
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
          </svg>
          <h3 className="text-xl font-black text-brand-text mb-2">Feed do Instagram</h3>
          <p className="text-sm text-brand-text/50 max-w-md mx-auto mb-6">
            O widget do Instagram não está configurado. Para exibir suas fotos reais, crie um widget gratuito no Elfsight e cole o ID nas configurações do painel.
          </p>
          <a
            href="https://elfsight.com/instagram-feed-instashow/"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-bold uppercase tracking-widest px-6 py-3 rounded-xl transition-all duration-300"
          >
            Criar Widget Grátis no Elfsight
          </a>
        </div>
      )}
    </section>
  );
}
