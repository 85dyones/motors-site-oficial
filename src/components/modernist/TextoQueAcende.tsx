import { Fragment, type CSSProperties } from "react";

/**
 * Uma frase que acende palavra por palavra enquanto sobe na tela (Onda 2 do
 * plano de movimento, 10/10/2026). Mora nas faixas vermelhas de fechamento da
 * home e do /sobre: a última coisa que a pessoa lê antes do botão.
 *
 * Cada palavra é um `span` com o seu índice; quem acende é o CSS, ligado à
 * rolagem (`.mt-acende-palavra`, modernist.css). O texto da página é a frase
 * inteira, com os mesmos espaços: o leitor de tela e a busca leem igual. Sem
 * suporte a animação ligada à rolagem, ou com menos movimento, a frase
 * aparece acesa.
 */
export default function TextoQueAcende({ texto }: { texto: string }) {
  const palavras = texto.trim().split(/\s+/);
  return (
    <>
      {palavras.map((palavra, i) => (
        <Fragment key={i}>
          {i > 0 && " "}
          <span className="mt-acende-palavra" style={{ "--mt-palavra": i } as CSSProperties}>
            {palavra}
          </span>
        </Fragment>
      ))}
    </>
  );
}
