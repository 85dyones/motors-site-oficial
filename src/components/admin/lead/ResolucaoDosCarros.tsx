"use client";

import { useEffect, useId, useRef, useState } from "react";
import { type ItemDaResolucao } from "../../../lib/carrosDeInteresseNaTela";
import {
  LIMITE_DA_NOTA,
  MOTIVOS_DE_DESCARTE,
  MOTIVO_QUE_PEDE_NOTA,
  ROTULO_DO_MOTIVO_DE_DESCARTE,
  decidirResolucao,
  type MotivoDeDescarte,
  type PendenciaDeVeiculo,
} from "../../../lib/veiculosDeInteresse";

/**
 * "Feche os carros deste atendimento": o que aparece depois de o lead ser
 * fechado com carros ainda em avaliação (pedido do dono em 05/10/2026: "ao
 * final do atendimento as opções são filtradas, e cada descartada leva um
 * motivo").
 *
 * Não trava nada: o desfecho já foi gravado, e "Depois" fecha a caixa. O que
 * for marcado vai num pedido só (`POST /api/leads/[id]/veiculos/resolver`);
 * carro sem marcação continua pendente.
 */

const CHIP = "mt-foco cursor-pointer border px-2.5 py-2 text-left text-[11px] pointer-coarse:min-h-11";
const CHIP_ATIVO = "border-mt-accent bg-mt-accent-100 font-semibold text-mt-accent-800";
const CHIP_SOLTO = "border-mt-regua-fina text-mt-neutral-800 hover:border-mt-accent";

/** Os chips de motivo, usados aqui e no descarte de um carro só. */
export function ChipsDeMotivo({
  rotulo,
  valor,
  aoEscolher,
  antes,
}: {
  /** O nome do grupo, para leitor de tela. */
  rotulo: string;
  valor: MotivoDeDescarte | null;
  aoEscolher: (motivo: MotivoDeDescarte) => void;
  /** Um chip a mais, antes dos motivos ("Foi o escolhido"). */
  antes?: React.ReactNode;
}) {
  return (
    <div role="group" aria-label={rotulo} className="flex flex-wrap gap-1.5">
      {antes}
      {MOTIVOS_DE_DESCARTE.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={valor === m}
          onClick={() => aoEscolher(m)}
          className={`${CHIP} ${valor === m ? CHIP_ATIVO : CHIP_SOLTO}`}
        >
          {ROTULO_DO_MOTIVO_DE_DESCARTE[m]}
        </button>
      ))}
    </div>
  );
}

/** A nota do descarte: opcional, e obrigatória com o motivo "Outro". */
export function NotaDoDescarte({
  motivo,
  valor,
  aoMudar,
}: {
  motivo: MotivoDeDescarte | null;
  valor: string;
  aoMudar: (nota: string) => void;
}) {
  const obrigatoria = motivo === MOTIVO_QUE_PEDE_NOTA;
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-mt-neutral-700">{obrigatoria ? "Nota (obrigatória): qual foi o motivo?" : "Nota (opcional)"}</span>
      <textarea
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        rows={2}
        maxLength={LIMITE_DA_NOTA}
        required={obrigatoria}
        aria-required={obrigatoria}
        placeholder="Ex.: queria 5 mil a menos. Sem nome nem telefone do cliente."
        className="mt-foco w-full resize-y border border-mt-regua-fina bg-mt-bg p-2 text-[12px] leading-snug text-mt-ink placeholder:text-mt-neutral-600"
      />
    </label>
  );
}

type Marca = { tipo: "escolhido" } | { tipo: "descartado"; motivo: MotivoDeDescarte };

export default function ResolucaoDosCarros({
  pendencias,
  podeEscolher,
  ocupado,
  aoSalvar,
  aoAdiar,
  aoMudarRascunho,
}: {
  pendencias: readonly PendenciaDeVeiculo[];
  /** Lead ganho e ainda sem carro escolhido: cada carro ganha o chip "Foi o escolhido". */
  podeEscolher: boolean;
  ocupado: boolean;
  aoSalvar: (itens: ItemDaResolucao[]) => void;
  aoAdiar: () => void;
  /** Há (ou deixou de haver) marcação ou nota por salvar. */
  aoMudarRascunho?: (emAndamento: boolean) => void;
}) {
  const [marcas, setMarcas] = useState<Record<string, Marca>>({});
  const [notas, setNotas] = useState<Record<string, string>>({});
  const titulo = useRef<HTMLParagraphElement>(null);
  const idDoTitulo = useId();

  // A caixa aparece sozinha, depois do desfecho: o foco vai a ela.
  useEffect(() => {
    titulo.current?.focus();
  }, []);

  // Só conta o que é de carro ainda pendente: o que já foi salvo saiu da lista.
  const emAndamento = pendencias.some((p) => marcas[p.opcao] !== undefined || (notas[p.opcao] ?? "").trim() !== "");
  useEffect(() => {
    aoMudarRascunho?.(emAndamento);
  }, [emAndamento, aoMudarRascunho]);
  useEffect(() => () => aoMudarRascunho?.(false), [aoMudarRascunho]);

  const marcar = (opcao: string, marca: Marca) =>
    setMarcas((atual) => {
      const antes = atual[opcao];
      const igual =
        antes !== undefined &&
        (antes.tipo === "escolhido" ? marca.tipo === "escolhido" : marca.tipo === "descartado" && antes.motivo === marca.motivo);
      const novo = { ...atual };
      // Só um carro é o escolhido: marcar num tira do outro.
      if (marca.tipo === "escolhido") {
        for (const [chave, m] of Object.entries(novo)) if (m.tipo === "escolhido") delete novo[chave];
      }
      // Tocar de novo no chip marcado desmarca.
      if (igual) delete novo[opcao];
      else novo[opcao] = marca;
      return novo;
    });

  const itens: ItemDaResolucao[] = [];
  let faltaNota = false;
  for (const p of pendencias) {
    const marca = marcas[p.opcao];
    if (!marca) continue;
    if (marca.tipo === "escolhido") {
      itens.push({ opcao: p.opcao, situacao: "escolhido" });
      continue;
    }
    const nota = (notas[p.opcao] ?? "").trim();
    const corpo = { situacao: "descartado" as const, motivo_descarte: marca.motivo, ...(nota ? { nota } : {}) };
    if (decidirResolucao(corpo).ok) itens.push({ opcao: p.opcao, ...corpo });
    else faltaNota = true;
  }
  const pode = itens.length > 0 && !faltaNota && !ocupado;
  const dica = faltaNota
    ? 'O motivo "Outro" pede a nota dizendo qual foi.'
    : itens.length === 0
      ? "Marque o que aconteceu com pelo menos um carro."
      : itens.length < pendencias.length
        ? "Carro sem marcação continua pendente."
        : "";

  return (
    <div
      role="group"
      aria-labelledby={idDoTitulo}
      data-resolucao
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        // O Esc é desta caixa, e só a fecha vazia: com algo marcado, nada se perde numa tecla.
        e.stopPropagation();
        if (!emAndamento) aoAdiar();
      }}
      className="flex flex-col gap-3 border-l-[3px] border-mt-ink bg-mt-surface p-3"
    >
      <div className="flex flex-col gap-1">
        <p ref={titulo} id={idDoTitulo} tabIndex={-1} className="m-0 text-[13px] font-extrabold text-mt-ink outline-none">
          Feche os carros deste atendimento
        </p>
        <p className="m-0 text-[11px] leading-snug text-mt-neutral-700">
          Diga o que aconteceu com cada carro. O motivo entra no relatório do carro.
        </p>
      </div>

      {pendencias.map((p) => {
        const marca = marcas[p.opcao];
        const motivo = marca?.tipo === "descartado" ? marca.motivo : null;
        return (
          <fieldset key={p.opcao} data-pendencia={p.opcao} className="m-0 flex min-w-0 flex-col gap-2 border-0 border-t border-mt-regua-fina p-0 pt-3">
            <legend className="float-left mb-2 w-full p-0 text-[13px] font-semibold text-mt-ink [overflow-wrap:anywhere]">{p.rotulo}</legend>
            <ChipsDeMotivo
              rotulo={`O que aconteceu com ${p.rotulo}`}
              valor={motivo}
              aoEscolher={(m) => marcar(p.opcao, { tipo: "descartado", motivo: m })}
              antes={
                podeEscolher && (
                  <button
                    type="button"
                    aria-pressed={marca?.tipo === "escolhido"}
                    onClick={() => marcar(p.opcao, { tipo: "escolhido" })}
                    className={`${CHIP} font-semibold ${marca?.tipo === "escolhido" ? "border-mt-ink bg-mt-ink text-mt-bg" : "border-mt-ink text-mt-ink hover:bg-mt-bg"}`}
                  >
                    Foi o escolhido
                  </button>
                )
              }
            />
            {motivo && (
              <NotaDoDescarte motivo={motivo} valor={notas[p.opcao] ?? ""} aoMudar={(nota) => setNotas((n) => ({ ...n, [p.opcao]: nota }))} />
            )}
          </fieldset>
        );
      })}

      <div className="flex flex-wrap items-center gap-3 border-t border-mt-regua-fina pt-3">
        <button
          type="button"
          disabled={!pode}
          onClick={() => aoSalvar(itens)}
          className="mt-btn mt-btn-tinta mt-foco px-3.5 py-[9px] text-[11px] pointer-coarse:min-h-11"
        >
          Salvar
        </button>
        <button type="button" onClick={aoAdiar} className="mt-btn mt-btn-contorno mt-foco px-3.5 py-[9px] text-[11px] pointer-coarse:min-h-11">
          Depois
        </button>
        <span role="status" className="min-w-0 flex-1 text-[11px] text-mt-neutral-700">
          {dica}
        </span>
      </div>
    </div>
  );
}
