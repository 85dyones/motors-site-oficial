import { Fragment, type CSSProperties, type ReactNode } from "react";
import AoAparecer from "./AoAparecer";

/**
 * Título cinético (Onda cinética do plano de movimento, 10/10/2026): as
 * frases dos funis (Garagem Profiler e Avaliação Express) e das seções da
 * home que levam a eles entram com movimento — e entram de novo quando saem
 * da tela e voltam (`AoAparecer`, embutido).
 *
 * `modo` diz QUANDO o título aparece, e isso decide o que é seguro:
 *
 * - `"carga"` — o título que já está na tela quando a página abre, quase
 *   sempre o maior texto dela e, por isso, o candidato a LCP. As palavras
 *   nascem pintadas (20% da cor, nunca invisíveis) e acendem uma a uma: o
 *   navegador conta o título inteiro no primeiro quadro, e o LCP não espera
 *   a animação (regra 1). Aqui a palavra continua texto corrido e acende
 *   pela cor, sem caixa, máscara nem opacidade: com qualquer um dos três, o
 *   Chrome passava a contar só parte do título, e o parágrafo de baixo
 *   virava o LCP (medido no preview, 10/10; ver `modernist.css`). Na carga
 *   o `efeito` não vale: é sempre "acende".
 * - `"gesto"` — o título que só existe depois de um toque: a pergunta
 *   seguinte, o resultado, o "obrigado". Depois do primeiro toque o LCP já
 *   parou de medir.
 * - `"aparece"` — abaixo da dobra: sai do servidor pronto e só toca quando
 *   entra na tela.
 *
 * `efeito` diz COMO (pedido do dono, 10/10: "tipos diferentes de kinect"):
 *
 * - `"sobe"` — cada palavra sobe de trás da linha, como tipo assentado na
 *   régua.
 * - `"digita"` — letra por letra, com o cursor vermelho correndo na frente:
 *   para as perguntas do Profiler, que a pessoa lê como quem conversa com o
 *   consultor, e para o que o sistema está fazendo ("Cruzando suas
 *   respostas…").
 *
 * `destaque` marca palavras do próprio texto ("carro certo", "Express"): um
 * traço cobre, a caneta de marcar texto, se risca por baixo delas depois que
 * o título termina de entrar. Vale com qualquer efeito, inclusive na carga:
 * o traço é o fundo de um `span` em volta da palavra, e o texto não muda.
 *
 * O texto da página continua sendo a frase inteira, com os mesmos espaços
 * (palavras e letras são `span` irmãos, todos em linha): o leitor de tela, a
 * busca e os testes leem igual. `\n` no texto vira quebra de linha. Com
 * menos movimento, o título está parado, com o destaque já riscado.
 */
export default function TextoCinetico({
  texto,
  modo,
  efeito = "sobe",
  destaque,
}: {
  texto: string;
  modo: "carga" | "gesto" | "aparece";
  /** Como as palavras entram. Na carga é sempre "acende". */
  efeito?: "sobe" | "digita";
  /** Palavras do texto que ganham o traço de marcar ("carro certo"). */
  destaque?: string;
}) {
  const desenho = modo === "carga" ? "acende" : efeito;
  const chave = (palavra: string) => palavra.toLocaleLowerCase("pt-BR").replace(/[^\p{L}\p{N}]/gu, "");
  const marcadas = new Set((destaque ?? "").split(/\s+/).map(chave).filter(Boolean));

  const linhas = texto.split("\n").map((linha) => linha.trim().split(/\s+/).filter(Boolean));
  // Contadores que atravessam as linhas: a ordem da palavra, a da letra (na
  // digitação) e a da palavra marcada. Calculados antes, sem mutar nada no
  // desenho.
  const palavras = linhas.flatMap((linha, l) => linha.map((palavra, p) => ({ palavra, l, p })));
  const inicioDaLetra = palavras.map((_, i) => palavras.slice(0, i).reduce((n, w) => n + [...w.palavra].length, 0));
  const ordemDoDestaque = palavras.map(
    (_, i) => palavras.slice(0, i).filter((x) => marcadas.has(chave(x.palavra))).length,
  );
  const totalDeLetras = palavras.reduce((n, w) => n + [...w.palavra].length, 0);
  const total = desenho === "digita" ? totalDeLetras : palavras.length;

  const desenhar = (i: number) => {
    const { palavra } = palavras[i];
    const estilo = { "--mt-palavra": i } as CSSProperties;

    let palavraDesenhada: ReactNode;
    if (desenho === "digita") {
      const letras = [...palavra];
      palavraDesenhada = (
        <span className="mt-cinetico-palavra" style={estilo}>
          {letras.map((letra, k) => (
            <span
              key={k}
              className={i === palavras.length - 1 && k === letras.length - 1 ? "mt-tecla mt-tecla-ultima" : "mt-tecla"}
              style={{ "--mt-tecla": inicioDaLetra[i] + k } as CSSProperties}
            >
              {letra}
            </span>
          ))}
        </span>
      );
    } else if (desenho === "sobe") {
      palavraDesenhada = (
        <span className="mt-cinetico-mascara">
          <span className="mt-cinetico-palavra" style={estilo}>
            {palavra}
          </span>
        </span>
      );
    } else {
      palavraDesenhada = (
        <span className="mt-cinetico-palavra" style={estilo}>
          {palavra}
        </span>
      );
    }
    // A palavra marcada ganha um invólucro com o traço como FUNDO, e não
    // como camada: medido no Chromium, um pseudo-elemento atrás da palavra
    // (`z-index`) tirava a palavra da conta do LCP do título (70.335 de
    // 80.460 px²); o fundo, não.
    if (!marcadas.has(chave(palavra))) return palavraDesenhada;
    return (
      <span className="mt-destaque" style={{ "--mt-destaque": ordemDoDestaque[i] } as CSSProperties}>
        {palavraDesenhada}
      </span>
    );
  };

  const inicioDaLinha = linhas.map((_, l) => linhas.slice(0, l).reduce((n, linha) => n + linha.length, 0));
  return (
    <AoAparecer como="span">
      <span
        className="mt-cinetico"
        data-cinetico={modo}
        data-efeito={desenho}
        style={{ "--mt-cinetico-total": total } as CSSProperties}
      >
        {linhas.map((linha, l) => (
          <Fragment key={l}>
            {l > 0 && <br />}
            {linha.map((_, p) => (
              <Fragment key={p}>
                {p > 0 && " "}
                {desenhar(inicioDaLinha[l] + p)}
              </Fragment>
            ))}
          </Fragment>
        ))}
      </span>
    </AoAparecer>
  );
}
