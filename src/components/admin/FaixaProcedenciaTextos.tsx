"use client";

import { useEffect, useState } from "react";
import { PROCEDENCIA_PADRAO } from "../../lib/procedencia";
import type { ItemProcedencia } from "../../types";

/**
 * Edição da faixa de procedência que aparece na página de cada veículo.
 *
 * A faixa é o argumento de confiança da PDP — quatro promessas em texto fixo,
 * iguais para todo o estoque. Duas delas prometiam mais do que a operação
 * sustenta em todo caso (histórico de revisões que nem todo carro tem,
 * transferência cujo custo depende da negociação), e corrigir isso no código a
 * cada mudança de política é lento demais para texto que fala com o cliente.
 *
 * O painel edita título e descrição e liga/desliga cada bloco. Não cria nem
 * remove blocos: a faixa é uma peça de layout de quatro colunas, e deixar o
 * número de blocos livre no painel é a forma mais rápida de quebrá-la.
 */

interface FaixaProcedenciaTextosProps {
  itens: ItemProcedencia[];
  aoSalvar: (itens: ItemProcedencia[]) => Promise<void>;
}

const LIMITE_TITULO = 40;
const LIMITE_DESCRICAO = 160;

export default function FaixaProcedenciaTextos({ itens, aoSalvar }: FaixaProcedenciaTextosProps) {
  const [rascunho, setRascunho] = useState<ItemProcedencia[]>(itens);
  const [estado, setEstado] = useState<"idle" | "salvando" | "salvo">("idle");

  // O contexto carrega as settings depois da primeira renderização; sem isto o
  // formulário ficaria preso no padrão e salvaria por cima do que está no ar.
  useEffect(() => {
    setRascunho(itens);
  }, [itens]);

  const alterado = JSON.stringify(rascunho) !== JSON.stringify(itens);
  const visiveis = rascunho.filter((i) => i.ativo);

  const alterar = (id: string, campo: "titulo" | "descricao" | "ativo", valor: string | boolean) => {
    setRascunho((prev) => prev.map((i) => (i.id === id ? { ...i, [campo]: valor } : i)));
    setEstado("idle");
  };

  const restaurarPadrao = () => {
    setRascunho(PROCEDENCIA_PADRAO.map((i) => ({ ...i })));
    setEstado("idle");
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEstado("salvando");
    try {
      await aoSalvar(rascunho);
      setEstado("salvo");
      setTimeout(() => setEstado("idle"), 2500);
    } catch (err) {
      console.error("[Procedência] Falha ao salvar:", err);
      alert("Não foi possível salvar a faixa de procedência. Tente novamente.");
      setEstado("idle");
    }
  };

  return (
    <form onSubmit={salvar} className="flex flex-col items-stretch xl:flex-row">
      {/* ─── Coluna de edição ─── */}
      <div className="min-w-0 flex-1 pb-10 xl:border-r-2 xl:border-mt-regua xl:pr-7">
        <h1 className="mt-titulo text-[36px]">Faixa de procedência</h1>
        <p className="mt-2 max-w-[560px] text-sm text-mt-neutral-800">
          A faixa escura no rodapé da página de cada veículo. O texto vale para todo o
          estoque, então ele precisa ser verdade para todo carro — promessa que o cliente
          descobre no balcão que não vale custa mais caro que promessa nenhuma. Desligue o
          bloco em vez de suavizar o texto quando a loja não puder garantir aquilo sempre.
        </p>

        <div className="mt-regua mt-8 flex flex-col gap-0.5 pt-5">
          {rascunho.map((item) => {
            const posicao = visiveis.findIndex((v) => v.id === item.id);
            return (
              <div
                key={item.id}
                className={`mt-cartao p-4 ${item.ativo ? "" : "opacity-60"}`}
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-[11px] font-extrabold tracking-[.1em] text-mt-accent">
                    {item.ativo ? String(posicao + 1).padStart(2, "0") : "—"}
                  </span>
                  <label className="mt-foco ml-auto flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-mt-neutral-800">
                    <input
                      type="checkbox"
                      checked={item.ativo}
                      onChange={(e) => alterar(item.id, "ativo", e.target.checked)}
                    />
                    Mostrar na página
                  </label>
                </div>

                <label
                  className="block text-[11px] font-semibold text-mt-neutral-700"
                  htmlFor={`titulo-${item.id}`}
                >
                  Título
                </label>
                <input
                  id={`titulo-${item.id}`}
                  className="mt-campo-caixa mt-1"
                  value={item.titulo}
                  maxLength={LIMITE_TITULO}
                  onChange={(e) => alterar(item.id, "titulo", e.target.value)}
                />

                <label
                  className="mt-3 block text-[11px] font-semibold text-mt-neutral-700"
                  htmlFor={`descricao-${item.id}`}
                >
                  Descrição
                </label>
                <textarea
                  id={`descricao-${item.id}`}
                  className="mt-campo-caixa mt-1 resize-y"
                  rows={2}
                  value={item.descricao}
                  maxLength={LIMITE_DESCRICAO}
                  onChange={(e) => alterar(item.id, "descricao", e.target.value)}
                />
                <div className="mt-1 text-right text-[10px] text-mt-neutral-700">
                  <span className="mt-num">{item.descricao.length}</span>/{LIMITE_DESCRICAO}
                </div>
              </div>
            );
          })}
        </div>

        {visiveis.length === 0 && (
          <p className="mt-4 text-[11px] font-semibold text-mt-accent">
            Com todos os blocos desligados, a faixa some da página do veículo.
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="mt-btn mt-btn-primario mt-foco"
            disabled={!alterado || estado === "salvando"}
          >
            {estado === "salvando" ? "SALVANDO..." : estado === "salvo" ? "SALVO ✓" : "SALVAR"}
          </button>
          <button
            type="button"
            onClick={restaurarPadrao}
            className="mt-btn mt-btn-contorno mt-foco"
          >
            RESTAURAR PADRÃO
          </button>
          {alterado && (
            <span className="text-[11px] font-semibold text-mt-neutral-700">
              Alteração ainda não salva.
            </span>
          )}
        </div>
      </div>

      {/* ─── Preview ─── */}
      <aside className="mt-8 w-full shrink-0 bg-mt-surface p-6 xl:mt-0 xl:w-[452px]">
        <div className="mt-rotulo mb-4">Como aparece na página</div>

        {visiveis.length === 0 ? (
          <div className="border border-mt-regua-fina p-6 text-center text-[11px] text-mt-neutral-700">
            Nenhum bloco visível — a faixa não é renderizada.
          </div>
        ) : (
          <div className="flex flex-col bg-mt-inverso-fundo text-mt-inverso">
            {visiveis.map((item, i) => (
              <div
                key={item.id}
                className="border-b border-mt-inverso-regua-fina px-4 py-4 last:border-b-0"
              >
                <div className="mb-2 text-[10px] font-extrabold tracking-[.1em] text-mt-accent">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="text-[14px] font-extrabold tracking-[-.01em]">
                  {item.titulo || "—"}
                </div>
                <div className="mt-1 text-[11px] leading-snug text-mt-inverso-suave">
                  {item.descricao}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-mt-neutral-700">
          No site os blocos ficam lado a lado a partir do desktop; aqui empilham para caber na
          coluna. A numeração é recalculada pela ordem dos blocos visíveis — desligar um não
          deixa buraco na sequência.
        </p>
      </aside>
    </form>
  );
}
