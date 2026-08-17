"use client";

/**
 * O "exportar em PDF" do §6.3-D, sem biblioteca de PDF.
 *
 * Todo navegador — desktop e celular — imprime em PDF pelo próprio diálogo de
 * impressão. Gerar o arquivo no servidor custaria uma dependência pesada e um
 * segundo layout para manter em sincronia com o que o cliente vê na tela.
 */
export default function BotaoImprimir() {
  return (
    <div className="mb-8 flex flex-wrap items-center gap-3 border border-[#e2e0e0] bg-[#f7f6f6] p-4">
      <button
        type="button"
        onClick={() => window.print()}
        className="mt-foco bg-[#c8412f] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-white"
      >
        Salvar em PDF ou imprimir
      </button>
      <a
        href="/garagem"
        className="mt-foco text-[12px] font-semibold text-[#201e1d] underline underline-offset-2"
      >
        Voltar para a garagem
      </a>
      <span className="text-[11px] text-[#6d6968]">
        No diálogo que abrir, escolha “Salvar como PDF” no destino.
      </span>
    </div>
  );
}
