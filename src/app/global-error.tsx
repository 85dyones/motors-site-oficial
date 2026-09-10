"use client";

import { useEffect } from "react";
import { capturarErroDeBoundary } from "../lib/observabilidade-cliente";

/**
 * O último recurso: quando o próprio layout raiz quebra.
 *
 * ---------------------------------------------------------------------------
 * Por que aqui é HTML puro, com estilo inline
 * ---------------------------------------------------------------------------
 * Este componente SUBSTITUI o layout raiz — ele precisa das próprias tags
 * `<html>` e `<body>`, e nada do que o layout monta existe quando ele
 * renderiza: nem o `globals.css`, nem o `ThemeProvider`, nem as fontes. Usar
 * `MolduraDoSite` ou uma classe `mt-*` aqui daria uma página sem estilo
 * nenhum, que é pior do que uma página feia com estilo próprio.
 *
 * As cores são as do tema claro, escritas à mão. É deliberado: esta tela só
 * aparece quando o carregamento do tema é justamente o que falhou.
 *
 * Em desenvolvimento o Next mostra o próprio painel de erro no lugar disto —
 * o que se vê aqui é o comportamento de produção.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    capturarErroDeBoundary(error, "global-error");
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#faf9f7",
          color: "#1a1a1a",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: "2rem",
        }}
      >
        <main style={{ maxWidth: "36rem" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#b45309",
              fontWeight: 600,
            }}
          >
            Algo saiu do lugar
          </p>

          <h1 style={{ margin: "1.5rem 0 0", fontSize: "2rem", lineHeight: 1.15, fontWeight: 600 }}>
            O site não carregou.
          </h1>

          <p style={{ margin: "1.5rem 0 0", lineHeight: 1.6, color: "#44403c" }}>
            O problema é nosso, não seu. Tente recarregar; se continuar, fale com a
            gente pelo WhatsApp de sempre.
          </p>

          <div style={{ marginTop: "2.5rem", display: "flex", gap: "2rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                font: "inherit",
                fontWeight: 600,
                color: "#1a1a1a",
                borderBottom: "1px solid #1a1a1a",
                cursor: "pointer",
              }}
            >
              Tentar de novo
            </button>
            {/* `<a>` e não `<Link>`, de propósito: `Link` faz navegação
                client-side, que reaproveita a mesma árvore React que acabou de
                quebrar — a pessoa clicaria e voltaria para esta tela. Recarga
                de página inteira é a única saída que de fato recupera. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{ color: "#1a1a1a", fontWeight: 600, borderBottom: "1px solid #1a1a1a", textDecoration: "none" }}
            >
              Ir para a página inicial
            </a>
          </div>

          {error.digest && (
            <p style={{ marginTop: "3rem", fontSize: "0.875rem", color: "#57534e" }}>
              Código para o atendimento:{" "}
              <span style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>{error.digest}</span>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
