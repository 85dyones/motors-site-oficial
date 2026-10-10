import type { CSSProperties } from "react";

/**
 * Um número que gira como o hodômetro de um painel quando muda (Onda 1 do
 * plano de movimento, 09/10/2026).
 *
 * Serve ao número que muda DEPOIS de um gesto: a contagem do estoque quando o
 * filtro muda, a parcela do simulador quando o prazo ou a entrada mudam. Não é
 * entrada animada: na primeira pintura o número já está no lugar, e só a troca
 * de valor desliza. Contar do zero ao carregar continua sendo só da capa
 * (`NumeroQueConta`).
 *
 * Como funciona (o CSS está em `modernist.css`, seção "movimento com
 * função"):
 *
 * - O texto real (`.mt-hodometro-valor`) fica na página, transparente. É ele
 *   que dá a largura e a linha de base, e é ele que o leitor de tela, a busca
 *   do navegador e o copiar e colar leem. Quem não tem CSS vê só ele.
 * - Por cima, com `aria-hidden`, cada algarismo é uma fita de 0 a 9 que
 *   desliza até o dígito com `transform`. Os dígitos da fita e os sinais
 *   ("R$", ".", ",") são conteúdo de CSS, então o texto da página continua
 *   sendo só o número, uma vez.
 * - As casas são contadas da direita, como num hodômetro: a das unidades é a
 *   mesma de um valor para o outro mesmo quando o número ganha ou perde um
 *   dígito. As unidades andam primeiro; cada casa à esquerda sai 45 ms depois.
 *
 * Não tem estado nem efeito: é só marcação. Por isso roda no servidor também,
 * e a transição sai de graça do CSS quando o React troca o `--mt-hodometro-
 * digito` de uma fita que já existe.
 */
export default function Hodometro({
  texto,
  className,
}: {
  /** O número já formatado ("44", "R$ 5.835,58"). */
  texto: string;
  className?: string;
}) {
  const caracteres = [...texto];
  const ehDigito = (c: string) => /\d/.test(c);
  // Contadas da direita: a chave da casa e o atraso dela (`ordem`, 0 nas
  // unidades). Sinal não é casa: `ordem` -1.
  const casas = caracteres.map((caractere, i) => ({
    caractere,
    daDireita: caracteres.length - i,
    ordem: ehDigito(caractere) ? caracteres.slice(i + 1).filter(ehDigito).length : -1,
  }));

  return (
    <span className={className ? `mt-hodometro ${className}` : "mt-hodometro"}>
      <span className="mt-hodometro-valor">{texto}</span>
      <span className="mt-hodometro-rolo" aria-hidden="true">
        {casas.map(({ caractere, daDireita, ordem }) =>
          ordem >= 0 ? (
            <span key={`d${daDireita}`} className="mt-hodometro-casa">
              <span
                className="mt-hodometro-fita"
                style={
                  {
                    "--mt-hodometro-digito": caractere,
                    "--mt-hodometro-ordem": ordem,
                  } as CSSProperties
                }
              />
            </span>
          ) : (
            <span key={`s${daDireita}`} className="mt-hodometro-sinal" data-sinal={caractere} />
          ),
        )}
      </span>
    </span>
  );
}
