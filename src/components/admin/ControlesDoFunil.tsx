"use client";

import { ChipDeFiltro, Segmentado } from "./SegmentadoDoPainel";
import type { ChipDoFunil, EscopoDaFila, VistaDoFunil } from "../../lib/filaDoFunil";

/**
 * A linha de controles do funil (desenho de 23/09/2026): a busca única, o
 * escopo, a vista e os filtros.
 *
 * Substitui a busca por referência e a linha de filtros de antes. O campo mora
 * FORA do ramo que some quando não há lead: a busca que não acha nada não pode
 * apagar o próprio campo, senão não há como desfazê-la.
 */
export default function ControlesDoFunil({
  busca,
  aoBuscar,
  aoEnviarBusca,
  aoLimparBusca,
  linhaDaBusca,
  dicaDaBusca,
  buscando,
  temEscopo,
  escopo,
  contasDoEscopo,
  aoMudarEscopo,
  vista,
  aoMudarVista,
  chip,
  contasDosChips,
  aoMudarChip,
  parados,
  soParados,
  aoAlternarParados,
  semResponsavel,
  soSemResponsavel,
  aoAlternarSemResponsavel,
  fechados,
  vendoFechados,
  aoAlternarFechados,
}: {
  busca: string;
  aoBuscar: (valor: string) => void;
  /** Enter no campo: busca agora, sem esperar a pausa da digitação. */
  aoEnviarBusca: () => void;
  aoLimparBusca: () => void;
  /** "3 encontrados na equipe inteira", quando o que está na tela é uma busca. */
  linhaDaBusca: string | null;
  /** O que falta para o termo virar busca; `null` quando não falta nada. */
  dicaDaBusca: string | null;
  /** O que está na tela é uma busca: o escopo é ignorado. */
  buscando: boolean;
  temEscopo: boolean;
  escopo: EscopoDaFila;
  contasDoEscopo: Record<EscopoDaFila, number>;
  aoMudarEscopo: (escopo: EscopoDaFila) => void;
  vista: VistaDoFunil;
  aoMudarVista: (vista: VistaDoFunil) => void;
  chip: ChipDoFunil | null;
  contasDosChips: Record<ChipDoFunil, number>;
  aoMudarChip: (chip: ChipDoFunil | null) => void;
  /** Os que a régua de estagnação já cobra. */
  parados: number;
  soParados: boolean;
  aoAlternarParados: () => void;
  /** Só para o Administrador, que é quem os enxerga e distribui; `null` para os outros. */
  semResponsavel: number | null;
  soSemResponsavel: boolean;
  aoAlternarSemResponsavel: () => void;
  fechados: number;
  vendoFechados: boolean;
  aoAlternarFechados: () => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          aoEnviarBusca();
        }}
        className="flex flex-col gap-1.5"
      >
        <div className="flex items-center gap-3">
          <label htmlFor="busca-de-leads" className="sr-only">
            Buscar lead por nome, telefone ou referência
          </label>
          <input
            id="busca-de-leads"
            type="search"
            value={busca}
            onChange={(e) => aoBuscar(e.target.value)}
            placeholder="Buscar por nome, telefone ou referência"
            spellCheck={false}
            autoComplete="off"
            className="mt-foco w-full max-w-[540px] border border-mt-regua bg-mt-surface px-3 py-[9px] text-[13px] text-mt-ink placeholder:text-mt-neutral-600"
          />
          {busca && (
            <button
              type="button"
              onClick={aoLimparBusca}
              className="mt-foco mt-alvo cursor-pointer text-[11px] text-mt-accent-hover hover:underline"
            >
              limpar
            </button>
          )}
        </div>
        {/* `aria-live`: o resultado muda sem a pessoa sair do campo. */}
        <div aria-live="polite" className="min-h-[14px] text-[11px] leading-snug text-mt-neutral-700">
          {dicaDaBusca ?? linhaDaBusca ?? ""}
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {temEscopo && (
          <Segmentado
            rotulo="Escopo"
            valor={buscando ? null : escopo}
            aoEscolher={aoMudarEscopo}
            desabilitado={buscando}
            opcoes={[
              { valor: "minha", rotulo: "Minha fila", conta: contasDoEscopo.minha },
              { valor: "equipe", rotulo: "Equipe", conta: contasDoEscopo.equipe },
            ]}
          />
        )}
        <Segmentado
          rotulo="Vista"
          valor={vista}
          aoEscolher={aoMudarVista}
          opcoes={[
            { valor: "lista", rotulo: "Lista do dia" },
            { valor: "quadro", rotulo: "Quadro" },
          ]}
        />
        <ChipDeFiltro ativo={chip === "atrasados"} aoAlternar={() => aoMudarChip(chip === "atrasados" ? null : "atrasados")}>
          Atrasados ({contasDosChips.atrasados})
        </ChipDeFiltro>
        <ChipDeFiltro ativo={chip === "hoje"} aoAlternar={() => aoMudarChip(chip === "hoje" ? null : "hoje")}>
          Hoje ({contasDosChips.hoje})
        </ChipDeFiltro>
        {/* O filtro que a régua de estagnação torna possível: a fila do dia
            de quem cobra é a dos parados. */}
        <ChipDeFiltro ativo={soParados} aoAlternar={aoAlternarParados}>
          Parados ({parados})
        </ChipDeFiltro>
        {semResponsavel !== null && (
          <ChipDeFiltro ativo={soSemResponsavel} aoAlternar={aoAlternarSemResponsavel}>
            Sem responsável ({semResponsavel})
          </ChipDeFiltro>
        )}
        {/* Fechar tirou o card do quadro: este é o endereço dele. Não é uma
            coluna, é uma lista, com o motivo, a observação e a volta. */}
        <ChipDeFiltro ativo={vendoFechados} aoAlternar={aoAlternarFechados}>
          Fechados ({fechados})
        </ChipDeFiltro>
      </div>
    </div>
  );
}
