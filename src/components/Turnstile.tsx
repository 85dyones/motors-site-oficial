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
            size: "invisible",
            callback: (token: string) => {
              console.log("[Turnstile] Invisible challenge success, token generated");
              onSuccess(token);
            },
            "error-callback": () => {
              console.warn("[Turnstile] Invisible challenge error");
              if (onError) onError();
            },
            "expired-callback": () => {
              console.warn("[Turnstile] Challenge token expired, resetting...");
              if (widgetIdRef.current && window.turnstile) {
                window.turnstile.reset(widgetIdRef.current);
              }
              if (onExpire) onExpire();
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
        if (onError) onError();
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
  }, [onSuccess, onError, onExpire]);

  return <div ref={containerRef} className="hidden" />;
}
