"use client";

import { espera } from "../../../lib/funil";
import { rotuloDoPasso, situacaoDoPasso } from "../../../lib/gestaoDoLead";
import type { LeadDoDetalhe } from "../../../lib/filaDoFunil";

import TituloDeBloco from "./TituloDeBloco";

/**
 * Bloco p do detalhe: o próximo passo em vigor.
 *
 * CONCLUIR e Remarcar não gravam nada sozinhos: abrem o registro já começado
 * ("Feito: ..." ou "Remarcado: ..."), porque concluir um passo é registrar o
 * que aconteceu. O passo seguinte é opcional (2026-10-09): concluído sem passo
 * novo, o passo feito sai do lead.
 */
export default function ProximoPassoDoLead({
  lead,
  aberto,
  agora,
  className = "",
  aoConcluir,
  aoRemarcar,
}: {
  lead: LeadDoDetalhe;
  aberto: boolean;
  agora: number;
  className?: string;
  aoConcluir: (passo: string) => void;
  aoRemarcar: (passo: string) => void;
}) {
  const passo = (lead.proximo_passo ?? "").trim();
  const atrasado = passo !== "" && situacaoDoPasso(lead.proximo_passo_vence_em, agora) === "atrasado";
  const quando = rotuloDoPasso(lead.proximo_passo_vence_em, agora, "card");
  const definido = lead.proximo_passo_definido_em ? espera(lead.proximo_passo_definido_em, agora) : null;
  const com = lead.responsavel ? `Com ${lead.responsavel}` : "Sem responsável";

  return (
    <section data-bloco="p" aria-labelledby="titulo-do-proximo-passo" className={`flex flex-col gap-3 px-6 py-5 ${className}`}>
      <TituloDeBloco id="titulo-do-proximo-passo">Próximo passo</TituloDeBloco>

      {passo ? (
        <div
          className={`flex flex-col gap-1.5 p-3.5 ${
            atrasado ? "border-2 border-mt-accent bg-mt-accent-100" : "border border-mt-regua bg-mt-surface"
          }`}
        >
          <div
            className={`text-[11px] font-extrabold uppercase tracking-[.08em] tabular-nums ${
              atrasado ? "text-mt-accent-800" : "text-mt-ink"
            }`}
          >
            {quando ?? "Sem data"}
          </div>
          <div className="text-[15px] font-semibold leading-snug text-mt-ink [overflow-wrap:anywhere]">{passo}</div>
          <div className="text-[11px] tabular-nums text-mt-neutral-700">
            {com}
            {definido && ` · definido ${definido === "agora" ? "agora" : `há ${definido}`}`}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => aoConcluir(passo)}
              className="mt-btn mt-btn-tinta mt-foco px-3.5 py-[9px] text-[11px] pointer-coarse:min-h-11"
            >
              CONCLUIR
            </button>
            <button
              type="button"
              onClick={() => aoRemarcar(passo)}
              className="mt-foco cursor-pointer border border-mt-regua-fina bg-transparent px-3.5 py-[9px] text-[11px] text-mt-neutral-800 hover:border-mt-accent hover:text-mt-ink pointer-coarse:min-h-11"
            >
              Remarcar
            </button>
          </div>
        </div>
      ) : (
        <p className="m-0 border border-dashed border-mt-regua-fina bg-mt-surface p-3.5 text-xs leading-relaxed text-mt-neutral-700">
          {aberto
            ? "Este lead ainda não tem próximo passo. Ele é definido ao registrar uma interação."
            : "Negócio fechado: não há próximo passo."}
        </p>
      )}

      <p className="m-0 text-[11px] leading-relaxed text-mt-neutral-600">É o que aparece no card e na Lista do dia.</p>
    </section>
  );
}
