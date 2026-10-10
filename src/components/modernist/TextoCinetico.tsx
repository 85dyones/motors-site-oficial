import { Fragment, type CSSProperties } from "react";

/**
 * Título cinético (Onda cinética do plano de movimento, 10/10/2026): as
 * palavras do título entram uma a uma, nos funis (Garagem Profiler e
 * Avaliação Express) e nas seções da home que levam a eles.
 *
 * Três modos, porque o momento em que o título aparece muda o que é seguro:
 *
 * - `"carga"` — o título que já está na tela quando a página abre, quase
 *   sempre o maior texto dela e, por isso, o candidato a LCP. As palavras
 *   nascem pintadas (opacidade 0,2, nunca zero) e acendem subindo um fio:
 *   o navegador conta o título no primeiro quadro, e o LCP não espera a
 *   animação (regra 1). Nada de máscara aqui.
 * - `"gesto"` — o título que só existe depois de um toque: a pergunta
 *   seguinte, o resultado, o "obrigado". Cada palavra sobe de baixo de uma
 *   linha, como tipo sendo assentado na régua. Depois do primeiro toque o
 *   LCP já parou de medir.
 * - `"aparece"` — o mesmo movimento do `"gesto"`, para o título abaixo da
 *   dobra, dentro de um `AoAparecer`: sai do servidor pronto e só toca se
 *   entrar na tela depois.
 *
 * O texto da página continua sendo a frase inteira, com os mesmos espaços
 * (as palavras são `span` irmãos): o leitor de tela, a busca e os testes leem
 * igual. `\n` no texto vira quebra de linha. Com menos movimento, o título
 * está parado (`.mt-cinetico`, modernist.css).
 */
export default function TextoCinetico({
  texto,
  modo,
}: {
  texto: string;
  modo: "carga" | "gesto" | "aparece";
}) {
  // A ordem conta palavras do título inteiro, atravessando as linhas.
  const linhas = texto.split("\n").map((linha) => linha.trim().split(/\s+/).filter(Boolean));
  const inicio = linhas.map((_, i) => linhas.slice(0, i).reduce((n, l) => n + l.length, 0));
  return (
    <span className="mt-cinetico" data-cinetico={modo}>
      {linhas.map((palavras, l) => (
        <Fragment key={l}>
          {l > 0 && <br />}
          {palavras.map((palavra, p) => (
            <Fragment key={p}>
              {p > 0 && " "}
              <span className="mt-cinetico-mascara">
                <span
                  className="mt-cinetico-palavra"
                  style={{ "--mt-palavra": inicio[l] + p } as CSSProperties}
                >
                  {palavra}
                </span>
              </span>
            </Fragment>
          ))}
        </Fragment>
      ))}
    </span>
  );
}
