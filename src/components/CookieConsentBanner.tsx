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
  //
  // No celular é uma barra no pé da tela (tarefa 4.1 da revisão de UI de
  // 30/09): o cartão de antes flutuava no meio de toda página, em cima do
  // carro, e era a primeira coisa que o cliente via. A barra ocupa uma faixa
  // de até 88 px, colada à borda, com o texto curto e o botão ao lado. Do `md`
  // para cima continua o cartão no canto, que ali não cobre nada.
  // `.mt-aviso-cookies` também afasta o foco da barra (`scroll-padding-bottom`
  // em `modernist.css`): o Tab não para num link escondido atrás dela.
  return (
    <div
      className="mt-aviso-cookies fixed inset-x-0 bottom-0 z-[9999] flex items-center gap-4 border-t-4 border-mt-accent bg-mt-bg px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[var(--mt-shadow-lg)] animate-fadeIn md:inset-x-auto md:bottom-4 md:right-4 md:max-w-md md:flex-col md:items-stretch md:gap-3.5 md:p-5"
      role="dialog"
      aria-live="polite"
      aria-label="Aviso de Privacidade e Cookies"
    >
      {/* Header */}
      <span className="mt-rotulo mt-rotulo-accent hidden md:block">Privacidade &amp; Cookies</span>

      {/* Celular: a mesma informação em uma frase — quem mede (Google e Meta)
          e o quê. A base legal e o resto ficam a um toque, na política. O
          link de ajuste tem o mesmo peso do "Ajustar detalhes" do desktop:
          normal, cinza, sublinhado simples (decisão do dono em 31/08). */}
      <p className="m-0 flex-1 text-[12px] leading-snug text-mt-neutral-800 md:hidden">
        Usamos cookies do Google e da Meta para medir visitas e anúncios.{" "}
        <Link
          href="/privacidade"
          onClick={() => setIsVisible(false)}
          className="mt-foco font-normal text-mt-neutral-700 underline underline-offset-2 hover:text-mt-ink"
        >
          Ajustar detalhes
        </Link>
      </p>
      <button
        onClick={handleAccept}
        className="mt-btn mt-btn-primario mt-foco min-h-11 shrink-0 cursor-pointer px-5 text-[11px] uppercase md:hidden"
      >
        Entendi
      </button>

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
      <p className="m-0 hidden text-[12px] leading-relaxed text-mt-neutral-800 md:block">
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
      <div className="hidden items-center justify-end gap-4 border-t border-mt-regua-fina pt-3 md:flex">
        <Link
          href="/privacidade"
          onClick={() => setIsVisible(false)}
          className="mt-foco py-1 text-[12px] font-normal text-mt-neutral-700 underline underline-offset-2 hover:text-mt-ink"
        >
          Ajustar detalhes
        </Link>
        <button
          onClick={handleAccept}
          className="mt-btn mt-btn-primario mt-foco cursor-pointer px-5 py-2.5 text-[11px] uppercase"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}
