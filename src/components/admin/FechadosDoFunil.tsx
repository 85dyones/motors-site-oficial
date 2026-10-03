"use client";

import { ROTULO_DO_DESFECHO, ehDescarte, type EtapaDoFunil } from "../../lib/funil";
import { plural, type LeadDaFila } from "../../lib/filaDoFunil";

/**
 * Os negócios fechados.
 *
 * Ganho e perdido saíram do quadro (28/08/2026); esta é a lista onde eles
 * moram. Mostra o MOTIVO e a OBSERVAÇÃO lado a lado, porque foi para isso que
 * os dois campos foram pedidos: o motivo agrupa no relatório, a frase explica
 * o caso. E oferece a volta: fechar por engano é o erro mais fácil de cometer.
 */
export default function FechadosDoFunil({
  fechados,
  etapasAbertas,
  rotuloDoMotivo,
  aoReabrir,
  aoAbrir,
}: {
  fechados: readonly LeadDaFila[];
  /** As etapas em que um lead pode ser reaberto. */
  etapasAbertas: readonly EtapaDoFunil[];
  rotuloDoMotivo: (chave?: string | null) => string | null;
  aoReabrir: (id: string, chave: string) => void;
  aoAbrir: (id: string) => void;
}) {
  return (
    <section className="flex flex-col gap-2 border-t-2 border-mt-regua pt-5">
      <div className="flex items-baseline justify-between">
        <h2 className="mt-rotulo m-0">Negócios fechados</h2>
        <span className="text-[11px] tabular-nums text-mt-neutral-600">
          {plural(fechados.length, "negócio", "negócios")}
        </span>
      </div>

      {fechados.length === 0 ? (
        <p className="m-0 border border-dashed border-mt-regua-fina bg-mt-surface p-6 text-center text-xs text-mt-neutral-700">
          Nenhum negócio fechado ainda. Ganho, Perdido e Não é oportunidade ficam no detalhe do lead.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[12px]">
            <thead>
              <tr className="border-b border-mt-regua-fina text-[10px] uppercase tracking-[.08em] text-mt-neutral-600">
                <th className="py-2 text-left font-semibold">Cliente</th>
                <th className="py-2 text-left font-semibold">Desfecho</th>
                <th className="py-2 text-left font-semibold">Observação</th>
                <th className="py-2 text-left font-semibold">Responsável</th>
                <th className="py-2 text-right font-semibold">Quando</th>
                <th className="py-2 text-right font-semibold">Reabrir em</th>
              </tr>
            </thead>
            <tbody>
              {fechados.map((l) => (
                <tr key={l.id} className="border-b border-mt-regua-fina align-top">
                  <td className="py-2.5 pr-3">
                    <button
                      type="button"
                      data-abre-lead={l.id}
                      onClick={() => aoAbrir(l.id)}
                      className="mt-foco cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-mt-ink underline-offset-2 hover:underline"
                    >
                      {l.nome}
                    </button>
                    {l.interesse && (
                      <div className="text-[10px] leading-snug text-mt-neutral-700">{l.interesse}</div>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span
                      className={`border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${
                        l.desfecho === "ganho"
                          ? "border-mt-accent-800 text-mt-accent-800"
                          : ehDescarte(l.desfecho)
                            ? "border-dashed border-mt-regua-fina text-mt-neutral-500"
                            : "border-mt-regua-fina text-mt-neutral-700"
                      }`}
                    >
                      {l.desfecho ? ROTULO_DO_DESFECHO[l.desfecho] : "Fechado"}
                    </span>
                    <div className="mt-1 text-[11px] leading-snug text-mt-neutral-800">
                      {rotuloDoMotivo(l.desfecho_motivo) ?? "Sem motivo"}
                    </div>
                    {l.desfecho_valor ? (
                      <div className="text-[10px] tabular-nums text-mt-neutral-700">
                        {Number(l.desfecho_valor).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          maximumFractionDigits: 0,
                        })}
                      </div>
                    ) : null}
                  </td>
                  <td className="max-w-[280px] py-2.5 pr-3 text-[11px] leading-snug text-mt-neutral-800">
                    {l.desfecho_nota || <span className="text-mt-neutral-600">Sem observação</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-[11px] text-mt-neutral-700">{l.responsavel || "Sem responsável"}</td>
                  <td className="py-2.5 pr-3 text-right text-[11px] tabular-nums text-mt-neutral-700">
                    {l.desfecho_em ? new Date(l.desfecho_em).toLocaleDateString("pt-BR") : ""}
                  </td>
                  <td className="py-2.5 text-right">
                    <select
                      value=""
                      onChange={(e) => e.target.value && aoReabrir(l.id, e.target.value)}
                      aria-label={`Reabrir ${l.nome} em uma etapa`}
                      className="mt-foco cursor-pointer border border-mt-regua-fina bg-mt-bg px-1.5 py-1 text-[10px] text-mt-ink"
                    >
                      <option value="">reabrir…</option>
                      {etapasAbertas.map((e) => (
                        <option key={e.chave} value={e.chave}>
                          {e.rotulo}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
