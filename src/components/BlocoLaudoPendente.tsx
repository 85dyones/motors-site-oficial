import { TEXTO_LAUDO_PENDENTE } from "../lib/textoDoLaudo";

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
      <div className="bg-brand-card border border-brand-card-border p-5 max-sm:p-4 print-avoid-break">
        <p className="uppercase tracking-widest text-sm max-sm:text-xs font-black text-brand-text">
          Laudo cautelar
        </p>
        <p className="mt-2 text-sm text-brand-text/70">{TEXTO_LAUDO_PENDENTE}</p>
      </div>
    </div>
  );
}
