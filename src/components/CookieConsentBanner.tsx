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

  // O `handleReject` que morava aqui foi para `/privacidade`
  // (`ControleDeRastreamento`) em 2026-08-31. Não sumiu a capacidade de
  // desligar; saiu o CONVITE a desligar, que estava ao lado do "Entendi" e
  // nomeava o medo — *"esta frase induz a recusa"*, olhando a tela.

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

      {/*
        Reescrito duas vezes em 2026-08-31, e a segunda foi por um print.

        A primeira versão trocou "ao aceitar, você concorda" por um texto que
        informa o que já está acontecendo — correto, porque nada mais espera o
        clique. Mas ela veio com um botão "Não quero ser rastreado" ao lado do
        "Entendi", e o dono apontou o óbvio olhando a tela: *"esta frase induz a
        recusa"*. Duas opções lado a lado, uma delas nomeando o medo, é um
        formulário perguntando se a pessoa quer ser vigiada.

        O aviso não decide mais nada. Ele conta o que está em curso e some. Quem
        quiser desligar encontra o controle em `/privacidade` — existe, funciona,
        e não fica gritando na frente de quem só quer ver carro.
      */}
      <p className="m-0 text-[11px] leading-relaxed text-mt-neutral-800">
        A Motors Store usa cookies para entender como o site é usado e medir o desempenho dos
        nossos anúncios (Google e Meta), com base no legítimo interesse previsto na LGPD. Você
        pode ajustar isso quando quiser na{" "}
        <Link
          href="/privacidade"
          className="font-semibold text-mt-ink underline decoration-mt-accent decoration-2 underline-offset-2 hover:text-mt-accent"
        >
          Política de Privacidade
        </Link>
        .
      </p>

      {/* "Ajustar detalhes" é LINK, não botão de ação: ele leva ao lugar onde a
          escolha existe de verdade, em vez de decidir por quem clicou sem
          mostrar o que está decidindo. Peso normal e sem caixa alta de propósito
          — o dono pediu fonte mais suave, e o contraste de antes era parte do
          convite à recusa. */}
      <div className="flex items-center justify-end gap-4 border-t border-mt-regua-fina pt-3">
        <Link
          href="/privacidade"
          onClick={() => setIsVisible(false)}
          className="mt-foco text-[11px] font-normal text-mt-neutral-700 underline underline-offset-2 hover:text-mt-ink"
        >
          Ajustar detalhes
        </Link>
        <button
          onClick={handleAccept}
          className="mt-btn mt-btn-primario mt-foco cursor-pointer px-5 py-2.5 text-[10px] uppercase"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}
