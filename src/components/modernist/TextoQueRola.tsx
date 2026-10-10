import type { CSSProperties } from "react";

/**
 * Letras que rolam no mouse (Onda cinética do plano de movimento,
 * 10/10/2026): o hodômetro do site aplicado ao texto. Quando o mouse passa
 * — ou o teclado chega — numa opção ou num botão dos funis, cada letra gira
 * uma casa, da esquerda para a direita, e volta a mesma letra.
 *
 * O texto real fica num `sr-only`: é ele que dá o nome ao botão, o que o
 * leitor de tela lê e o `textContent` da página. As letras que se veem são
 * conteúdo de CSS (`attr(data-l)`), dentro de um `aria-hidden`: nenhum
 * leitor soletra "M, O, N…", e nada aparece duplicado no texto.
 *
 * Quem dispara é o elemento com `mt-rola-alvo` (o botão ou o link em volta).
 * Sem mouse (toque), ou com menos movimento, as letras ficam paradas e o
 * rótulo é o de sempre (`.mt-rola`, modernist.css).
 */
export default function TextoQueRola({ texto, className }: { texto: string; className?: string }) {
  const palavras = texto.trim().split(/\s+/).filter(Boolean);
  // O atraso conta letras do rótulo inteiro, atravessando as palavras.
  const inicio = palavras.map((_, i) => palavras.slice(0, i).reduce((n, p) => n + [...p].length, 0));
  return (
    <span className={className ? `mt-rola ${className}` : "mt-rola"}>
      <span className="sr-only">{texto}</span>
      <span className="mt-rola-letras" aria-hidden="true">
        {palavras.map((palavra, p) => (
          <span key={p} className="mt-rola-palavra">
            {[...palavra].map((letra, l) => (
              <span
                key={l}
                className="mt-rola-letra"
                data-l={letra}
                style={{ "--mt-letra": inicio[p] + l } as CSSProperties}
              />
            ))}
          </span>
        ))}
      </span>
    </span>
  );
}
