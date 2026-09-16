"use client";

import { useEffect, useImperativeHandle, useRef } from "react";

export interface TurnstileHandle {
  /**
   * Descarta o token atual e começa um desafio novo.
   *
   * Chamar depois de um envio que falhou. Token do Turnstile é de USO ÚNICO: a
   * Cloudflare o resgata na primeira ida ao siteverify e recusa a segunda com
   * `timeout-or-duplicate`. Sem este reset, o segundo clique no botão de enviar
   * manda o mesmo token queimado, leva 403, e o visitante fica preso até
   * recarregar a página — vendo "Falha na verificação de segurança" como se
   * fosse culpa dele.
   */
  reset: () => void;
}

interface TurnstileProps {
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  /**
   * A superfície que está pedindo o desafio — `contato`, `pdp`, `popup`…
   *
   * Volta assinada pela Cloudflare na resposta do siteverify, e o servidor
   * confere contra a lista da rota. É o que impede que um token colhido num
   * formulário seja gasto em outro. Os valores moram em `lib/turnstile.ts`.
   */
  action?: string;
  ref?: React.Ref<TurnstileHandle>;
}

export default function Turnstile({ onSuccess, onError, onExpire, action, ref }: TurnstileProps) {
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
  const actionRef = useRef(action);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
    onExpireRef.current = onExpire;
    actionRef.current = action;
  });

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.reset(widgetIdRef.current);
        } catch (err) {
          console.warn("[Turnstile] Reset falhou:", err);
        }
      }
    },
  }), []);

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

    // Sem sitekey não há desafio, e sem desafio o botão de enviar nunca
    // destrava. Até 27/08 havia um fallback para a sitekey de teste da
    // Cloudflare aqui; ele saiu junto com o irmão dele, a secret de teste que
    // estava em `/api/avaliacao`. As chaves de teste continuam existindo — mas
    // como variável de ambiente de Preview e desenvolvimento, escritas de
    // propósito, e não como fallback que ninguém vê acontecer.
    if (!siteKey) {
      console.error(
        "[Turnstile] NEXT_PUBLIC_TURNSTILE_SITE_KEY ausente — o desafio não " +
          "vai renderizar e nenhum formulário conseguirá enviar. Lembre que " +
          "NEXT_PUBLIC_* é embutido em tempo de BUILD: mudar na Vercel exige deploy novo."
      );
      if (onErrorRef.current) onErrorRef.current();
      return;
    }

    const scriptId = "cloudflare-turnstile-script";
    let cancelado = false;

    const renderizar = () => {
      if (cancelado || !containerRef.current || widgetIdRef.current) return;
      // `aguardar` só chama aqui depois de confirmar, mas repetir a guarda
      // deixa `renderizar` seguro por si — e mantém a chamada na forma literal
      // `window.turnstile.render(`, que é o que o teste de estabilidade vigia.
      if (!window.turnstile) return;
      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action: actionRef.current,
          // `interaction-only` é o que conserta o achado A.1 de 27/08.
          //
          // O widget está em modo **Managed** no painel da Cloudflare, com
          // Pre-Clearance em Interactive — ou seja, a Cloudflare PODE decidir
          // pedir um clique. Até aqui o contêiner era uma `<div class="hidden">`,
          // então esse pedido de clique era renderizado dentro de um elemento
          // invisível: o visitante não tinha como resolver, o token nunca
          // chegava, e o botão de enviar ficava `disabled` para sempre. Sem
          // log, sem erro, sem ninguém saber — só o lead que não entrou.
          //
          // Com `interaction-only` o widget não ocupa espaço enquanto passa
          // sozinho (que é a maioria, e preserva o visual de hoje) e aparece
          // sozinho quando o clique for necessário. Por isso o `hidden` saiu do
          // `className`: ele anularia justamente o momento em que o widget
          // precisa ser visto.
          appearance: "interaction-only",
          callback: (token: string) => {
            onSuccessRef.current(token);
          },
          "error-callback": () => {
            console.warn("[Turnstile] Erro no desafio");
            if (onErrorRef.current) onErrorRef.current();
          },
          "expired-callback": () => {
            if (widgetIdRef.current && window.turnstile) {
              window.turnstile.reset(widgetIdRef.current);
            }
            if (onExpireRef.current) onExpireRef.current();
          },
        });
      } catch (err) {
        console.error("[Turnstile] Render error:", err);
      }
    };

    // Espera `window.turnstile` existir, sondando.
    //
    // A versão anterior tinha duas ramificações: quem criava o script esperava
    // 150 ms depois do `onload` antes de renderizar, e quem encontrava o script
    // já criado pendurava um listener de `load` que roda SEM essa espera. Com
    // dois formulários montando juntos, o segundo caía no listener, encontrava
    // `window.turnstile` ainda indefinido, e o `if` que protegia a chamada
    // simplesmente desistia — sem retry. Aquele widget nunca renderizava, em
    // silêncio, e o formulário dele ficava travado.
    //
    // Sondar resolve os dois casos com um caminho só, e não deixa listener
    // pendurado para o cleanup esquecer de remover.
    const INTERVALO_MS = 50;
    const TENTATIVAS_MAXIMAS = 200; // 10 s
    let tentativas = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const aguardar = () => {
      if (cancelado) return;
      if (window.turnstile) {
        renderizar();
        return;
      }
      if (++tentativas > TENTATIVAS_MAXIMAS) {
        console.error("[Turnstile] Script não ficou disponível em 10 s");
        if (onErrorRef.current) onErrorRef.current();
        return;
      }
      timer = setTimeout(aguardar, INTERVALO_MS);
    };

    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        console.error("[Turnstile] Script failed to load");
        if (onErrorRef.current) onErrorRef.current();
      };
      document.body.appendChild(script);
    }

    aguardar();

    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Ignore removal errors on unmount
        }
        widgetIdRef.current = null;
      }
    };
  }, []);

  return <div ref={containerRef} />;
}
