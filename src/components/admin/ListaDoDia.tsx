"use client";

import { ordenarListaDoDia, rotuloDoPasso } from "../../lib/gestaoDoLead";
import { linhaDosSemPasso, textoDoVazioDaLista, type ChipDoFunil, type LeadDaFila } from "../../lib/filaDoFunil";

/**
 * A Lista do dia: a fila do vendedor, por vencimento do próximo passo.
 *
 * Quem agrupa e ordena é `ordenarListaDoDia` (`lib/gestaoDoLead`), e o rótulo
 * da hora é `rotuloDoPasso`: a mesma régua do card e da rota. Lead sem próximo
 * passo não tem hora e não entra nos grupos; a linha do fim diz quantos são e
 * leva ao Quadro, onde eles estão. Lead que some da lista sem aviso é o lead
 * que ninguém atende.
 */

type Grupo = "atrasados" | "hoje" | "proximos";

const TITULO: Record<Grupo, string> = { atrasados: "Atrasados", hoje: "Hoje", proximos: "Próximos" };

export default function ListaDoDia({
  leads,
  agora,
  chip,
  rotuloDaEtapa,
  leadAberto,
  temEscopo,
  buscando,
  aoAbrir,
  aoVerNoQuadro,
}: {
  /** Já filtrados por escopo e busca. O chip é aplicado aqui, por grupo. */
  leads: readonly LeadDaFila[];
  agora: number;
  chip: ChipDoFunil | null;
  rotuloDaEtapa: (chave: string) => string;
  leadAberto: string | null;
  temEscopo: boolean;
  /** O que está na tela é uma busca: o texto do vazio muda. */
  buscando: boolean;
  aoAbrir: (id: string) => void;
  aoVerNoQuadro: () => void;
}) {
  const lista = ordenarListaDoDia(leads, agora);
  const grupos = (["atrasados", "hoje", "proximos"] as const).filter(
    (g) => lista[g].length > 0 && (chip === null || chip === g),
  );

  return (
    <div className="flex w-full max-w-[540px] flex-col gap-6">
      {grupos.length === 0 && (
        <p className="m-0 border border-dashed border-mt-regua-fina bg-mt-surface p-6 text-center text-xs text-mt-neutral-700">
          {textoDoVazioDaLista(buscando, temEscopo)}
        </p>
      )}

      {grupos.map((g) => (
        <section key={g} aria-label={TITULO[g]}>
          <h2
            className={`m-0 flex items-baseline gap-2 border-b-2 border-mt-regua pb-2 text-[11px] font-extrabold uppercase tracking-[.1em] ${
              g === "atrasados" ? "text-mt-accent-800" : "text-mt-ink"
            }`}
          >
            {TITULO[g]}
            <span className="font-normal tabular-nums tracking-normal text-mt-neutral-700">{lista[g].length}</span>
          </h2>
          <ul role="list" className="m-0 list-none p-0">
            {lista[g].map((l) => {
              const atrasado = g === "atrasados";
              const aberto = leadAberto === l.id;
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    data-abre-lead={l.id}
                    aria-expanded={aberto}
                    onClick={() => aoAbrir(l.id)}
                    className={`mt-foco grid w-full cursor-pointer grid-cols-[84px_minmax(0,1fr)_auto] gap-3 border-0 border-b border-l-[3px] border-b-mt-regua-fina px-2.5 py-3 text-left hover:bg-mt-surface ${
                      aberto
                        ? "border-l-mt-ink bg-mt-surface"
                        : atrasado
                          ? "border-l-mt-accent bg-transparent"
                          : "border-l-transparent bg-transparent"
                    }`}
                  >
                    <span
                      className={`text-[13px] font-extrabold tabular-nums ${
                        atrasado ? "text-mt-accent-800" : "text-mt-ink"
                      }`}
                    >
                      {rotuloDoPasso(l.proximo_passo_vence_em, agora, "lista")}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[13px] font-semibold text-mt-ink [overflow-wrap:anywhere]">
                        → {l.proximo_passo}
                      </span>
                      <span className="line-clamp-2 text-[12px] text-mt-neutral-800 [overflow-wrap:anywhere]">
                        <strong className="font-extrabold">{l.nome}</strong>
                        {l.interesse ? ` · ${l.interesse}` : ""}
                      </span>
                      {l.ultima_interacao?.texto && (
                        <span className="truncate text-[11px] text-mt-neutral-600">{l.ultima_interacao.texto}</span>
                      )}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[.06em] text-mt-neutral-600">
                      {rotuloDaEtapa(l.situacao)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {lista.semPasso > 0 && chip === null && (
        <button
          type="button"
          onClick={aoVerNoQuadro}
          className="mt-foco mt-alvo cursor-pointer self-start border-0 bg-transparent p-0 text-left text-[11px] text-mt-neutral-700 underline hover:text-mt-accent-hover"
        >
          {linhaDosSemPasso(lista.semPasso)}: ver no Quadro
        </button>
      )}
    </div>
  );
}
