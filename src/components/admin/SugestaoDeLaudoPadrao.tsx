"use client";

import { laudoPadraoDe } from "../../lib/descritivo/laudoPadrao";

/**
 * O painel do campo "Laudo cautelar" — irmão de `SugestaoDeTexto`, mas sem
 * IA nenhuma.
 *
 * `descricao` e `descricao_seo` pedem um botão "Gerar" porque o texto vem da
 * OpenAI: existe um estado de carregando, uma resposta que pode reprovar na
 * conferência, motivos para mostrar. Aqui não há nada disso — a frase é
 * determinística, escolhida só pelo estado real da perícia
 * (`laudoPadraoDe`, em `lib/descritivo/laudoPadrao.ts`), e já está pronta no
 * primeiro render. Um componente próprio, sem `useState` de carregamento nem
 * `fetch`, ficou mais simples que encaixar um modo "sem IA" dentro de
 * `SugestaoDeTexto` — ver o relatório da tarefa para o porquê por extenso.
 *
 * O invariante continua o mesmo dos outros dois painéis: nada é escrito no
 * campo sem clique. Com a perícia aprovada, a frase aparece com um botão
 * "Usar este texto". Sem a aprovação, não há botão de preencher — só a nota
 * explicando por que o campo fica vazio — e, se já houver texto ali (de uma
 * perícia que era aprovada e deixou de ser, por exemplo), um botão "Limpar"
 * que também espera o clique.
 */
export function SugestaoDeLaudoPadrao({
  pericia,
  valorAtual,
  onUsar,
}: {
  pericia: string | null | undefined;
  valorAtual: string | null | undefined;
  onUsar: (texto: string) => void;
}) {
  const frase = laudoPadraoDe(pericia);

  if (frase) {
    return (
      <div className="mt-3 border-l-[3px] border-mt-ink bg-mt-surface px-3 py-2.5">
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{frase}</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onUsar(frase)}
            className="mt-btn mt-btn-primario mt-foco cursor-pointer px-4 py-2.5 text-[11px]"
          >
            Usar este texto
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 border-l-[3px] border-mt-ink bg-mt-surface px-3 py-2.5">
      <p className="text-[11px] leading-relaxed text-mt-neutral-700">
        Este campo fica vazio quando a perícia não está aprovada. A ficha do
        carro já diz ao cliente que a perícia acontece e que o laudo pode ser
        pedido ao vendedor.
      </p>
      {valorAtual && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onUsar("")}
            className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[11px]"
          >
            Limpar
          </button>
        </div>
      )}
    </div>
  );
}
