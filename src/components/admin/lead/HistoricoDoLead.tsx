"use client";

import { useState } from "react";
import type { ItemDoHistorico } from "../../../lib/gestaoDoLead";
import { dataDoHistorico } from "../../../lib/filaDoFunil";
import { ChipDeFiltro } from "../SegmentadoDoPainel";
import TituloDeBloco from "./TituloDeBloco";

/**
 * Bloco t do detalhe: o histórico unificado, do mais novo para o mais antigo.
 *
 * Os itens já vêm prontos de `montarHistorico` (a frase, o autor, a origem).
 * O filtro separa o que alguém ESCREVEU (interações) do que o painel anotou
 * sozinho (sistema): tudo o que vem do rastro é sistema, mesmo quando uma
 * pessoa moveu o card.
 */

type Filtro = "tudo" | "humana" | "sistema";

export default function HistoricoDoLead({
  historico,
  className = "",
}: {
  historico: readonly ItemDoHistorico[];
  className?: string;
}) {
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const humanas = historico.filter((i) => i.origem === "humana").length;
  const visiveis = filtro === "tudo" ? historico : historico.filter((i) => i.origem === filtro);

  const opcoes: Array<{ valor: Filtro; rotulo: string; conta: number }> = [
    { valor: "tudo", rotulo: "Tudo", conta: historico.length },
    { valor: "humana", rotulo: "Interações", conta: humanas },
    { valor: "sistema", rotulo: "Sistema", conta: historico.length - humanas },
  ];

  return (
    <section
      data-bloco="t"
      aria-labelledby="titulo-do-historico"
      className={`flex flex-col gap-3 border-t-2 border-mt-regua px-6 py-5 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <TituloDeBloco id="titulo-do-historico">Histórico</TituloDeBloco>
        <div role="group" aria-label="Filtrar o histórico" className="ml-auto flex flex-wrap gap-2">
          {opcoes.map((o) => (
            <ChipDeFiltro key={o.valor} ativo={filtro === o.valor} aoAlternar={() => setFiltro(o.valor)}>
              {o.rotulo} ({o.conta})
            </ChipDeFiltro>
          ))}
        </div>
      </div>

      {visiveis.length === 0 ? (
        <p className="m-0 text-xs text-mt-neutral-700">
          {historico.length === 0 ? "Nenhum registro ainda." : "Nenhum registro neste filtro."}
        </p>
      ) : (
        <ol role="list" className="m-0 flex list-none flex-col gap-4 p-0">
          {visiveis.map((item) => {
            const sistema = item.origem === "sistema";
            return (
              <li key={item.id} data-origem={item.origem} className="grid grid-cols-[8px_minmax(0,1fr)] gap-x-3">
                <span
                  aria-hidden="true"
                  className={`mt-[3px] h-2 w-2 ${sistema ? "border border-mt-neutral-500" : "bg-mt-ink"}`}
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span
                      className={`text-[10px] font-extrabold uppercase tracking-[.08em] ${
                        sistema ? "text-mt-neutral-600" : "text-mt-ink"
                      }`}
                    >
                      {item.rotulo}
                    </span>
                    {item.autor && <span className="text-[11px] text-mt-neutral-700">{item.autor}</span>}
                    {item.importada && <span className="text-[10px] text-mt-neutral-600">anotação antiga</span>}
                    <time dateTime={item.quando} className="ml-auto text-[10px] tabular-nums text-mt-neutral-600">
                      {dataDoHistorico(item.quando)}
                    </time>
                  </div>
                  <p
                    className={`m-0 whitespace-pre-line leading-snug [overflow-wrap:anywhere] ${
                      sistema ? "text-[12px] text-mt-neutral-700" : "text-[13px] text-mt-ink"
                    }`}
                  >
                    {item.texto}
                  </p>
                  {item.proximoPasso && (
                    <p className="m-0 text-[11px] text-mt-neutral-700 [overflow-wrap:anywhere]">
                      → Próximo passo: <strong className="font-extrabold text-mt-ink">{item.proximoPasso.texto}</strong>
                      {item.proximoPasso.vence_em && (
                        <span className="tabular-nums">
                          {" "}
                          · {dataDoHistorico(item.proximoPasso.vence_em)}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
