"use client";

import { useEffect } from "react";
import { capturarErroDeBoundary } from "../lib/observabilidade-cliente";
import { LinkRegua, Rotulo } from "../components/modernist/primitivos";

/**
 * O que o visitante vê quando uma página quebra — e o único lugar de onde esse
 * erro pode ser contado.
 *
 * ---------------------------------------------------------------------------
 * Por que o relato é feito aqui dentro
 * ---------------------------------------------------------------------------
 * Em produção, o boundary EXPLÍCITO do Next só faz `console.error`; ele **não**
 * dispara o evento `error` da `window`
 * (`next/dist/client/react-client-callbacks/error-boundary-callbacks.js:77`).
 * Quem tem `error.tsx` deixa de ser coberto pelo ouvinte global, e sem esta
 * chamada o erro de render sumiria — trocaríamos "página branca sem aviso" por
 * "página bonita sem aviso".
 *
 * O `digest` é o que liga esta linha à que o `onRequestError` já gravou no
 * servidor. Em produção a mensagem chega REDIGIDA ("An error occurred in the
 * Server Components render…"), então o valor está no `digest`, não no texto.
 *
 * Não há `MolduraDoSite` aqui: este componente renderiza DENTRO do layout raiz,
 * com cabeçalho e rodapé já em volta. Envolver de novo duplicaria a moldura.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    capturarErroDeBoundary(error, "error");
  }, [error]);

  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-24">
      <Rotulo accent>ALGO SAIU DO LUGAR</Rotulo>

      <h1 className="mt-titulo mt-6">Esta página não carregou.</h1>

      <p className="mt-6 max-w-prose text-mt-neutral-800">
        O problema é nosso, não seu — e já fomos avisados. Tente de novo em alguns
        segundos; se continuar, o estoque inteiro segue disponível pelo caminho de
        sempre.
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-8">
        <button type="button" onClick={reset} className="mt-link-regua mt-foco font-semibold">
          Tentar de novo
        </button>
        <LinkRegua href="/estoque">Ver todo o estoque</LinkRegua>
      </div>

      {/* O código é o que permite achar ESTE caso na triagem. Não é mensagem de
          erro exposta: é um identificador opaco, e sem ele o atendimento pede
          "print da tela" e recebe uma foto do celular. */}
      {error.digest && (
        <p className="mt-12 text-sm text-mt-neutral-800">
          Código para o atendimento: <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </section>
  );
}
