"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EtapaDoFunil, MotivoDoFunil } from "../../lib/funil";

/**
 * A caixa que pergunta POR QUÊ antes de fechar o negócio.
 *
 * 2026-08-28, pedido do dono: *"uma opção de dar o negócio como ganho ou
 * perdido, selecionando opções para mensurar em relatórios depois"*.
 *
 * Ela existe porque o "depois" depende do "agora". Enquanto o motivo foi um
 * campo opcional num formulário, ele ficou vazio — é o resultado universal de
 * campo opcional em CRM. Aqui a escolha é o próprio gesto de fechar: o card só
 * chega na coluna de Ganho ou Perdido depois que alguém apontou um motivo.
 *
 * Três decisões de interface, todas para a escolha custar menos que pular:
 *
 *  1. **Um clique.** Escolher o motivo JÁ confirma — não há motivo + botão
 *     "salvar". Dois cliques para uma escolha obrigatória é o que faz gente
 *     arrastar o card de volta e deixar para depois.
 *  2. **Valor e observação são opcionais e vêm depois.** O que o relatório
 *     precisa é do motivo; o resto é bônus, e pedir tudo de uma vez
 *     transformaria o fechamento numa ficha de cadastro.
 *  3. **Escape cancela e devolve o card.** Quem arrastou por engano precisa de
 *     saída — e sem ela a saída vira "escolher qualquer motivo", que é pior
 *     que não ter dado nenhum.
 */
export interface DesfechoEscolhido {
  motivo: string;
  valor: string;
  nota: string;
}

export default function ModalDeDesfecho({
  etapa,
  motivos,
  lead,
  aoConfirmar,
  aoCancelar,
}: {
  etapa: EtapaDoFunil;
  motivos: MotivoDoFunil[];
  lead: { nome: string; interesse?: string | null };
  aoConfirmar: (escolha: DesfechoEscolhido) => void;
  aoCancelar: () => void;
}) {
  const ganho = etapa.tipo === "ganho";
  const [motivo, setMotivo] = useState("");
  const [valor, setValor] = useState("");
  const [nota, setNota] = useState("");
  const caixa = useRef<HTMLDivElement>(null);

  const disponiveis = useMemo(
    () => motivos.filter((m) => m.ativo && m.tipo === etapa.tipo).sort((a, b) => a.ordem - b.ordem),
    [motivos, etapa.tipo],
  );

  useEffect(() => {
    const naTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoCancelar();
    };
    document.addEventListener("keydown", naTecla);
    caixa.current?.querySelector("button")?.focus();
    return () => document.removeEventListener("keydown", naTecla);
  }, [aoCancelar]);

  const confirmar = (chave: string) => aoConfirmar({ motivo: chave, valor, nota });

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-mt-inverso-fundo/80 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) aoCancelar();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Motivo de ${etapa.rotulo}`}
    >
      <div
        ref={caixa}
        className={`flex w-full max-w-md flex-col gap-4 border-t-4 bg-mt-bg p-6 shadow-[var(--mt-shadow-lg)] ${
          ganho ? "border-mt-accent-800" : "border-mt-accent"
        }`}
      >
        <div className="flex flex-col gap-1 border-b border-mt-regua-fina pb-3">
          <div className="mt-rotulo mt-rotulo-accent">{ganho ? "Negócio ganho" : "Negócio perdido"}</div>
          <h3 className="text-base font-extrabold tracking-[-.015em] text-mt-ink">{lead.nome}</h3>
          {lead.interesse && (
            <p className="text-[11px] leading-snug text-mt-neutral-700">{lead.interesse}</p>
          )}
        </div>

        {disponiveis.length === 0 ? (
          // Sem motivo cadastrado a caixa não tem o que perguntar. Dizer isso é
          // melhor que mostrar uma lista vazia e deixar o card preso.
          <div className="border border-dashed border-mt-regua-fina bg-mt-surface p-4 text-center">
            <p className="text-[12px] leading-relaxed text-mt-neutral-800">
              Nenhum motivo de {ganho ? "ganho" : "perda"} está cadastrado. Cadastre em{" "}
              <strong>Configurar funil</strong> para conseguir fechar o negócio aqui.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-rotulo">Por quê?</div>
            <div className="flex flex-col gap-0.5">
              {disponiveis.map((m) => (
                <button
                  key={m.chave}
                  type="button"
                  onMouseEnter={() => setMotivo(m.chave)}
                  onFocus={() => setMotivo(m.chave)}
                  onClick={() => confirmar(m.chave)}
                  className={`mt-foco cursor-pointer border-l-[3px] px-3 py-2.5 text-left text-[13px] leading-snug transition-colors ${
                    motivo === m.chave
                      ? "border-mt-accent bg-mt-accent-100 text-mt-accent-800"
                      : "border-mt-regua-fina bg-mt-surface text-mt-ink hover:border-mt-accent"
                  }`}
                >
                  {m.rotulo}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 border-t border-mt-regua-fina pt-3">
              {ganho && (
                <label className="flex items-center gap-2 text-[11px] text-mt-neutral-700">
                  <span className="w-28 shrink-0 uppercase tracking-[.08em]">Valor da venda</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    placeholder="opcional"
                    className="mt-foco w-full border border-mt-regua-fina bg-mt-bg px-2 py-1.5 text-[12px] text-mt-ink tabular-nums"
                  />
                </label>
              )}
              <label className="flex items-start gap-2 text-[11px] text-mt-neutral-700">
                <span className="w-28 shrink-0 pt-1.5 uppercase tracking-[.08em]">Observação</span>
                <input
                  type="text"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="opcional"
                  className="mt-foco w-full border border-mt-regua-fina bg-mt-bg px-2 py-1.5 text-[12px] text-mt-ink"
                />
              </label>
              <p className="text-[10px] leading-relaxed text-mt-neutral-600">
                Preencha antes de escolher o motivo — clicar no motivo já grava e fecha.
              </p>
            </div>
          </>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={aoCancelar}
            className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2 text-[11px]"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
