import { TEXTO_LAUDO_PENDENTE } from "../lib/textoDoLaudo";
import PonteDoGuiaDoLaudo from "./PonteDoGuiaDoLaudo";
import SecaoDaFicha from "./ficha/SecaoDaFicha";

/**
 * O bloco que a ficha mostra quando o laudo NÃO está publicado nela.
 *
 * É um componente, e não JSX solto dentro da PDP, para a trava
 * (`tests/coerencia-da-pericia.test.ts`) poder RENDERIZAR e ler o texto que
 * chega na tela. Quatro desenhos de trava caíram antes deste, todos por
 * recortar a fonte por texto — janela até o primeiro `</div>`, leitura da
 * constante por regex, recorte a partir do título, recorte até o primeiro
 * `)}`. Cada rodada de revisão fechava um delimitador e abria o próximo, e
 * todas ficaram VERDES com um `<p>` afirmando "foi aprovado, sem apontamento"
 * na tela do cliente. Recorte de fonte tem sempre uma borda a mais; saída
 * renderizada não tem.
 *
 * O que ainda depende da fonte é a fiação, e de propósito: a PDP tem que
 * montar este componente numa linha exata, sozinho dentro da guarda. Qualquer
 * coisa acrescentada ao lado muda aquela linha e reprova.
 *
 * Sem estado e sem props: quem decide se ele aparece é a guarda na PDP
 * (`!indisponivel && !(laudo_pericia && perícia aprovada)`), não este arquivo.
 */
export default function BlocoLaudoPendente() {
  return (
    <div className="px-4 md:px-0 print:px-0">
      {/* A mesma seção do laudo aprovado, com o mesmo título: o visitante
          acha o assunto no mesmo lugar, publicado ou não (revisão de UI de
          29/09 — até ali era uma caixa `bg-brand-card` à parte). */}
      <SecaoDaFicha titulo="Laudo cautelar">
        <p className="m-0 text-[15px] leading-relaxed text-mt-neutral-800">{TEXTO_LAUDO_PENDENTE}</p>
        {/* A ponte para o guia. Ela entra DEPOIS do pedido ao vendedor de
            propósito: a saída comercial do bloco continua sendo o pedido, e o
            guia é o que responde "o que esse exame cobre?" para quem ainda
            está decidindo. */}
        <PonteDoGuiaDoLaudo className="m-0 mt-2 text-sm leading-relaxed text-mt-neutral-700" />
      </SecaoDaFicha>
    </div>
  );
}
