import SecaoDaFicha from "./SecaoDaFicha";

/**
 * Troca e test-drive, embaixo da coluna do preço.
 *
 * Os dois botões abrem o mesmo formulário de contato com mensagens
 * diferentes; quem monta a mensagem e o canal é a PDP (`handleTradeInClick`,
 * `handleTestDriveClick`), e é lá que o `form_start` e o lead são medidos.
 *
 * Até 29/09 era um quadro com ícone e um botão `green-700`, a única cor fora
 * da marca na página. A troca agora é o botão em tinta, e o test-drive o
 * contorno, na mesma hierarquia dos botões da coluna do preço.
 *
 * O subtítulo não promete "supervalorização FIPE": a loja compra abaixo da
 * tabela em qualquer estado (`lib/avaliacaoRecomendacao.ts`), e a frase criava
 * uma expectativa que o consultor tinha que desmontar (trocada em 2026-08-06).
 */
export default function TrocaOuTestDrive({
  aoAvaliar,
  aoAgendar,
}: {
  aoAvaliar: () => void;
  aoAgendar: () => void;
}) {
  return (
    <SecaoDaFicha titulo="Seu usado na troca ou test-drive" className="print:hidden">
      <p className="m-0 text-sm leading-relaxed text-mt-neutral-700">
        Avaliação com base na FIPE e visita ao showroom.
      </p>
      <div className="mt-4 flex flex-col gap-0.5">
        <button
          type="button"
          onClick={aoAvaliar}
          className="mt-btn mt-btn-tinta mt-btn-bloco mt-foco min-h-12 px-5 text-xs tracking-[.08em]"
        >
          AVALIAR MEU CARRO NA TROCA
        </button>
        <button
          type="button"
          onClick={aoAgendar}
          className="mt-btn mt-btn-contorno mt-btn-bloco mt-foco min-h-11 px-5 text-xs tracking-[.08em]"
        >
          AGENDAR TEST-DRIVE OU VISITA
        </button>
      </div>
    </SecaoDaFicha>
  );
}
