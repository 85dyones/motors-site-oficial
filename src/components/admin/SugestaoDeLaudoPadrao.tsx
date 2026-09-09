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
 * O invariante: nada é escrito no campo sem clique. Com a perícia aprovada,
 * a frase aparece com um botão "Usar este texto". Sem a aprovação, o ramo
 * abaixo não oferece NENHUM botão — nem para preencher, nem para limpar.
 *
 * Correção de 09/09/2026 (C1 do portão de qualidade): a versão anterior
 * deste ramo afirmava "este campo fica vazio quando a perícia não está
 * aprovada" e oferecia um botão "Limpar" quando já havia texto. As duas
 * coisas desfaziam a migração `20260901120000_laudo_cautelar_texto_padrao`
 * (01/09/2026), que preencheu `laudo_pericia` em toda linha vazia DE
 * PROPÓSITO — perícia aprovada ou não, 69 veículos "Em análise" inclusos,
 * 62 deles com texto no campo hoje (medido em 09/09/2026).
 * "Limpar" apagaria esse texto padrão ou, pior, uma customização como a da
 * Saveiro 8358193 — a própria migração a nomeia como "o caso que uma
 * migração descuidada apagaria" — sem caminho de volta, porque a allowlist
 * do sync não inclui `laudo_pericia`. A premissa que faltava: PREENCHER NÃO
 * É EXIBIR. `PDPClientWrapper` só abre o bloco do laudo na ficha quando há
 * texto E a perícia do feed lê como aprovada — então nada é afirmado ao
 * cliente enquanto o exame não fecha, com o campo preenchido ou não.
 */
export function SugestaoDeLaudoPadrao({
  pericia,
  onUsar,
}: {
  pericia: string | null | undefined;
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
        Preencher não é exibir: a ficha só acende o bloco do laudo quando há
        texto aqui e a perícia está aprovada — nada é afirmado ao cliente
        enquanto o exame não fecha. Desde 01/09 quase todo veículo já tem um
        texto padrão neste campo, de propósito. Este é o campo de
        apontamentos deste veículo: o que você escrever substitui o padrão.
      </p>
    </div>
  );
}
