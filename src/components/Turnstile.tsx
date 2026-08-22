"use client";

import { useEffect, useRef } from "react";

interface TurnstileProps {
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
}

export default function Turnstile({ onSuccess, onError, onExpire }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Os callbacks moram em refs para que o efeito de baixo NÃO dependa da
  // identidade deles.
  //
  // Todo consumidor passa arrow inline — `onSuccess={(token) =>
  // setTurnstileToken(token)}` — e arrow inline é função nova a cada render.
  // Com esses callbacks no array de dependências, e com os formulários tendo
  // input controlado, cada tecla digitada re-renderizava o componente, o
  // cleanup chamava `turnstile.remove()` e o corpo do efeito começava um
  // desafio do zero. Medido em 2026-08-20 no LeadCaptureModal, tanto em
  // `next dev` quanto na build de produção: digitar "Joao Pedro Silva"
  // (16 teclas) produzia 16 `remove` + 16 `render` e NENHUM token — o token
  // só chegava ~1,6 s depois da última tecla, com o botão de enviar travado
  // em `disabled` até lá.
  //
  // Estabilizar aqui, e não em cada consumidor, é de propósito: o consumidor
  // continua livre para escrever arrow inline (o idioma normal de React) e
  // quem chegar depois não precisa lembrar de nada. A tentativa de arrumar
  // pelo lado do consumidor já falhou uma vez — em `ContatoClientWrapper` o
  // `onSuccess` virou referência estável mas o `onExpire` continuou arrow
  // inline, e o widget seguia sendo recriado do mesmo jeito.
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA"; // Cloudflare Turnstile Test Site Key
    
    // Ensure the Turnstile script is loaded globally
    const scriptId = "cloudflare-turnstile-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    
    const initializeTurnstile = () => {
      if (window.turnstile && containerRef.current && !widgetIdRef.current) {
        try {
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            callback: (token: string) => {
              console.log("[Turnstile] Invisible challenge success, token generated");
              onSuccessRef.current(token);
            },
            "error-callback": () => {
              console.warn("[Turnstile] Invisible challenge error");
              if (onErrorRef.current) onErrorRef.current();
            },
            "expired-callback": () => {
              console.warn("[Turnstile] Challenge token expired, resetting...");
              if (widgetIdRef.current && window.turnstile) {
                window.turnstile.reset(widgetIdRef.current);
              }
              if (onExpireRef.current) onExpireRef.current();
            }
          });
        } catch (err) {
          console.error("[Turnstile] Render error:", err);
        }
      }
    };

    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        // Wait a brief moment to ensure turnstile is fully bound on window
        setTimeout(initializeTurnstile, 150);
      };
      script.onerror = () => {
        console.error("[Turnstile] Script failed to load");
        if (onErrorRef.current) onErrorRef.current();
      };
      document.body.appendChild(script);
    } else {
      if (window.turnstile) {
        initializeTurnstile();
      } else {
        script.addEventListener("load", initializeTurnstile);
      }
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {
          // Ignore removal errors on unmount
        }
        widgetIdRef.current = null;
      }
    };
  }, []);

  return <div ref={containerRef} className="hidden" />;
}
