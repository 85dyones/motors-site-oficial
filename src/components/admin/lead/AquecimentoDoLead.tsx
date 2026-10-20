"use client";

import { useState } from "react";
import { ROTULO_DA_TEMPERATURA } from "../../../lib/aquecimento";
import {
  horaDaMensagem,
  linhaDaCadencia,
  linhasDaFicha,
  posicaoNaRegua,
  rotuloDaEntrega,
  situacaoDoMetodo,
  textoDoResumo,
} from "../../../lib/atendimentoNaTela";
import { espera } from "../../../lib/funil";
import TituloDeBloco from "./TituloDeBloco";
import type { ConversaDoLead } from "./useConversaDoLead";

/**
 * Bloco q do detalhe: o aquecimento do lead, sempre à vista (2026-10-20).
 *
 * Era uma aba do bloco de atendimento. No teste do atendimento 2.0, o dono
 * pediu: *"deixe a tela do aquecimento sempre visível, do lado direito, no
 * lugar do próximo passo, assim sempre vamos saber como está o aquecimento do
 * lead"*. Na página larga ele abre a coluna da direita, com o próximo passo
 * logo embaixo; na gaveta e na página estreita, vem logo depois do
 * atendimento. A leitura é a mesma do atendimento (`useConversaDoLead`): uma
 * busca a cada 15 s serve aos dois blocos.
 *
 * O que mostra: a nota com a régua (marcas do morno e do quente); o RESUMO
 * PARA O COMERCIAL, sempre pronto — onde o lead está no método da loja (os 5P:
 * a visita marcada, a simulação pronta, ou o que falta), a ficha (quem, o que
 * quer, como vai pagar, entrada, parcela, troca, quem decide, prazo, visita),
 * o resumo do assistente e um botão de copiar —, pedido do dono no mesmo
 * teste (*"deixar sempre um resumo da conversa pronto, junto com os dados de
 * aquecimento"*); os motivos que somaram e tiraram; a linha do tempo da nota;
 * e a cadência.
 */
export default function AquecimentoDoLead({
  conversa,
  nomeDoLead = null,
  className = "",
}: {
  conversa: ConversaDoLead;
  /** O nome do lead no painel: com ele, o resumo não pede "como ele se chama". */
  nomeDoLead?: string | null;
  className?: string;
}) {
  const { dados, erroDeLeitura, agora } = conversa;
  const estado = dados?.atendimento ?? null;
  const assistente = dados?.assistente ?? null;
  const [copiado, setCopiado] = useState<"sim" | "falhou" | null>(null);
  const metodo = situacaoDoMetodo(estado, new Date(agora), nomeDoLead);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoDoResumo(estado, new Date(agora), nomeDoLead));
      setCopiado("sim");
    } catch {
      setCopiado("falhou");
    }
  }

  return (
    <section
      data-bloco="q"
      aria-labelledby="titulo-do-aquecimento"
      className={`flex flex-col gap-4 border-t border-mt-regua-fina px-6 py-5 ${className}`}
    >
      <TituloDeBloco id="titulo-do-aquecimento">Aquecimento</TituloDeBloco>

      {!dados ? (
        <p className="m-0 text-xs text-mt-neutral-600">{erroDeLeitura ? "Não deu para ler o aquecimento." : "Lendo o aquecimento…"}</p>
      ) : estado?.aquecimento === null || estado?.aquecimento === undefined ? (
        <p className="m-0 border border-dashed border-mt-regua-fina bg-mt-surface p-3.5 text-xs leading-relaxed text-mt-neutral-700">
          O assistente ainda não leu esta conversa. A nota aparece depois da primeira resposta dele.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-3">
            <span className="text-[34px] font-extrabold leading-none tracking-[-.03em] text-mt-ink tabular-nums">{estado.aquecimento}</span>
            <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-mt-neutral-700">
              de 100 · {estado.temperatura ? ROTULO_DA_TEMPERATURA[estado.temperatura] : "sem leitura"}
            </span>
          </div>
          <div className="relative h-2 w-full bg-mt-surface" role="img" aria-label={`Aquecimento ${estado.aquecimento} de 100`}>
            <div className="absolute inset-y-0 left-0 bg-mt-ink" style={{ width: `${posicaoNaRegua(estado.aquecimento)}%` }} />
            {assistente?.limiares && (
              <>
                <span className="absolute -top-1 h-4 w-px bg-mt-neutral-600" style={{ left: `${assistente.limiares.morno}%` }} />
                <span className="absolute -top-1 h-4 w-px bg-mt-accent" style={{ left: `${assistente.limiares.quente}%` }} />
              </>
            )}
          </div>
          {assistente?.limiares && (
            <p className="m-0 text-[10px] uppercase tracking-[.08em] text-mt-neutral-600 tabular-nums">
              Morno a partir de {assistente.limiares.morno} · quente a partir de {assistente.limiares.quente}
            </p>
          )}
        </>
      )}

      {dados && (
        <div data-resumo className="flex flex-col gap-3 border border-mt-regua bg-mt-surface p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-[.12em] text-mt-neutral-700">Resumo para o comercial</span>
            <button
              type="button"
              onClick={() => void copiar()}
              disabled={!estado}
              className="mt-foco cursor-pointer border border-mt-regua-fina bg-transparent px-2.5 py-1 text-[10px] text-mt-neutral-800 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:min-h-11"
            >
              {copiado === "sim" ? "Copiado ✓" : "Copiar"}
            </button>
          </div>
          {copiado === "falhou" && <p className="m-0 text-[11px] text-mt-accent-800">O navegador não deixou copiar. Selecione o texto e copie à mão.</p>}

          <p
            data-metodo={metodo.pronto ? "pronto" : "faltando"}
            className={`m-0 text-[12px] font-semibold leading-snug ${metodo.pronto ? "text-mt-accent-800" : "text-mt-neutral-800"}`}
          >
            {metodo.pronto ? "✓ " : ""}
            {metodo.texto}
          </p>

          <p className="m-0 text-[13px] leading-relaxed text-mt-ink [overflow-wrap:anywhere]">
            {estado?.resumo_ia?.trim() || "O assistente ainda não resumiu esta conversa."}
            {estado?.resumo_ia_em && <span className="text-[11px] text-mt-neutral-600"> · há {espera(estado.resumo_ia_em, agora)}</span>}
          </p>

          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[12px]">
            {linhasDaFicha(estado?.qualificacao ?? null).map((linha) => (
              <div key={linha.rotulo} className="contents">
                <dt className="text-[10px] font-semibold uppercase tracking-[.1em] text-mt-neutral-600">{linha.rotulo}</dt>
                <dd className={`m-0 [overflow-wrap:anywhere] ${linha.valor ? "text-mt-ink" : "text-mt-neutral-500"}`}>{linha.valor ?? "não disse"}</dd>
              </div>
            ))}
          </dl>

          {(estado?.origem_conversa?.titulo || estado?.entregue_em || estado?.optout_em) && (
            <ul className="m-0 flex list-none flex-col gap-1 border-t border-mt-regua-fina p-0 pt-3 text-[11px] leading-relaxed text-mt-neutral-800">
              {estado?.origem_conversa?.titulo && (
                <li>
                  Veio do anúncio: <strong>{estado.origem_conversa.titulo}</strong>
                </li>
              )}
              {estado?.entregue_em && (
                <li>
                  {rotuloDaEntrega(estado.entregue_motivo) ?? "Entregue"} há {espera(estado.entregue_em, agora)}
                  {estado.aviso_de_entrega_para && estado.aviso_de_entrega_para !== "administrador"
                    ? ` · resumo enviado a ${estado.aviso_de_entrega_para}`
                    : estado.aviso_de_entrega_para
                      ? " · resumo enviado a quem distribui"
                      : " · resumo aguardando o horário de aviso"}
                  {estado.entrega_confirmada_em && ` · confirmado há ${espera(estado.entrega_confirmada_em, agora)}`}
                </li>
              )}
              {estado?.optout_em && <li>O cliente pediu para não receber mensagens há {espera(estado.optout_em, agora)}.</li>}
            </ul>
          )}
        </div>
      )}

      {estado?.aquecimento !== null && estado?.aquecimento !== undefined && (
        <ul aria-label="Por que esta nota" className="m-0 flex list-none flex-col gap-1.5 p-0">
          {(estado.qualificacao?.motivos ?? []).map((m) => (
            <li key={m.chave} className="flex items-baseline gap-2 text-[12px] leading-snug">
              <span className={`w-9 shrink-0 text-right font-extrabold tabular-nums ${m.pontos < 0 ? "text-mt-accent-800" : "text-mt-ink"}`}>
                {m.pontos > 0 ? `+${m.pontos}` : m.pontos}
              </span>
              <span className="text-mt-neutral-800 [overflow-wrap:anywhere]">{m.texto}</span>
            </li>
          ))}
          {(estado.qualificacao?.motivos ?? []).length === 0 && (
            <li className="text-xs text-mt-neutral-600">Nada que some pontos ainda: o cliente não disse o que procura.</li>
          )}
        </ul>
      )}

      {dados && dados.retratos.length > 1 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-600">A nota ao longo da conversa</span>
          <ol aria-label="Linha do tempo do aquecimento" className="m-0 flex h-10 list-none items-end gap-[3px] p-0">
            {dados.retratos.map((r, i) => (
              <li
                key={`${r.criado_em}-${i}`}
                title={`${r.aquecimento} · ${horaDaMensagem(r.criado_em, new Date(agora))}${r.origem === "cadencia" ? " · cadência" : ""}`}
                className={`w-2 ${r.temperatura === "quente" ? "bg-mt-accent" : r.temperatura === "morno" ? "bg-mt-ink" : "bg-mt-neutral-500"}`}
                style={{ height: `${Math.max(8, posicaoNaRegua(r.aquecimento))}%` }}
              />
            ))}
          </ol>
        </div>
      )}

      {estado && (
        <p className="m-0 border-t border-mt-regua-fina pt-3 text-[11px] leading-relaxed text-mt-neutral-800">
          {linhaDaCadencia(estado, (estado.cadencia && assistente?.passos?.[estado.cadencia]) || 3, new Date(agora)) ??
            "Nenhuma cadência em andamento."}
        </p>
      )}
    </section>
  );
}
