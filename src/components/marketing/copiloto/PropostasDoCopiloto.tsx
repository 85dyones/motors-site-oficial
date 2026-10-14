"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROTULO_DA_SITUACAO, ROTULO_DO_TIPO, descreverAcao } from "../../../lib/copilotoDeMidia";
import type { AcaoNaTela, AchadoNaTela } from "../../../lib/copilotoDeMidia-servidor";
import SinalDeEstado from "../../admin/consulta/SinalDeEstado";
import { useConfirm } from "../../admin/ConfirmDialog";
import Evidencias from "./Evidencias";
import { SINAL_DA_SITUACAO, haQuanto, reais } from "./formato";

/**
 * O que espera decisão, e o que já foi aprovado e espera o script.
 *
 * Aprovar é mexer na conta do Google Ads na próxima rodada do script (até uma
 * hora). Por isso cada linha diz O QUE muda, em uma frase, e POR QUÊ, com o
 * número; e aprovar um grupo inteiro pede confirmação com o total.
 */

type Grupo = { chave: string; titulo: string; acoes: AcaoNaTela[] };

function agrupar(acoes: AcaoNaTela[], achados: AchadoNaTela[]): Grupo[] {
  const titulos = new Map(achados.map((a) => [a.id, a.titulo]));
  const grupos = new Map<string, Grupo>();
  for (const a of acoes) {
    const titulo = (a.achadoId && titulos.get(a.achadoId)) || ROTULO_DO_TIPO[a.tipo];
    const chave = a.achadoId && titulos.has(a.achadoId) ? a.achadoId : `tipo:${a.tipo}`;
    const g = grupos.get(chave) ?? { chave, titulo, acoes: [] };
    g.acoes.push(a);
    grupos.set(chave, g);
  }
  return [...grupos.values()];
}

const soma = (acoes: AcaoNaTela[]) => acoes.reduce((s, a) => s + (a.economia7d ?? 0), 0);

export default function PropostasDoCopiloto({
  abertas,
  achados,
  agora,
}: {
  abertas: AcaoNaTela[];
  achados: AchadoNaTela[];
  /** O instante da leitura (ver `LeituraDoCopiloto.lidoEm`). */
  agora: number;
}) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const propostas = abertas.filter((a) => a.situacao === "proposta");
  const aCaminho = abertas.filter((a) => a.situacao !== "proposta");

  const decidir = async (ids: string[], decisao: "aprovar" | "recusar", chave: string) => {
    setOcupado(chave);
    setAviso(null);
    setErro(null);
    try {
      const res = await fetch("/api/marketing/copiloto/decisao", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, decisao }),
      });
      const r = (await res.json().catch(() => ({}))) as { mudaram?: number; pedidas?: number; error?: string };
      if (!res.ok) {
        setErro(r.error || "A decisão não foi gravada.");
        return;
      }
      const mudaram = r.mudaram ?? 0;
      const verbo = decisao === "aprovar" ? "aprovada" : "recusada";
      if (mudaram < ids.length) {
        setAviso(
          `${mudaram} de ${ids.length} ${verbo}${mudaram === 1 ? "" : "s"}. As outras já tinham mudado (outra pessoa decidiu, ou o diagnóstico do dia as substituiu).`,
        );
      } else {
        setAviso(
          decisao === "aprovar"
            ? `${mudaram === 1 ? "Aprovada" : `${mudaram} aprovadas`}. O script aplica na próxima rodada e lê de volta.`
            : `${mudaram === 1 ? "Recusada" : `${mudaram} recusadas`}. Não volta a ser proposta nos próximos 7 dias.`,
        );
      }
      router.refresh();
    } catch {
      setErro("Sem conexão com o servidor. Nada foi decidido.");
    } finally {
      setOcupado(null);
    }
  };

  const aprovarGrupo = async (g: Grupo) => {
    const ok = await confirm({
      title: "Aprovar o grupo inteiro",
      message: `${g.acoes.length} mudanças na conta do Google Ads (${g.titulo}), somando ${reais(soma(g.acoes))} de economia estimada em 7 dias. O script aplica na próxima rodada; cada uma pode ser desfeita depois.`,
      confirmLabel: `Aprovar ${g.acoes.length}`,
    });
    if (ok) await decidir(g.acoes.map((a) => a.id), "aprovar", g.chave);
  };

  return (
    <div className="flex flex-col gap-4">
      {(aviso || erro) && (
        <p
          role={erro ? "alert" : "status"}
          className="m-0 border-l-[3px] bg-mt-surface px-4 py-3 text-xs leading-relaxed text-mt-ink"
          style={{ borderColor: erro ? "var(--cp-impeditivo)" : "var(--cp-ok)" }}
        >
          {erro ?? aviso}
        </p>
      )}

      {propostas.length === 0 ? (
        <div className="mt-cartao flex flex-col gap-1" data-sem-propostas>
          <span className="text-sm font-extrabold text-mt-ink">Nada esperando decisão.</span>
          <span className="text-xs leading-relaxed text-mt-neutral-800">
            O próximo diagnóstico chega amanhã cedo. Os achados abaixo continuam valendo, com ou sem proposta.
          </span>
        </div>
      ) : (
        agrupar(propostas, achados).map((g) => (
          <section key={g.chave} aria-label={g.titulo} className="mt-cartao flex flex-col gap-3" data-grupo-de-propostas={g.chave}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="m-0 text-sm font-extrabold text-mt-ink">{g.titulo}</h3>
              <div className="flex items-center gap-3">
                <span className="text-xs tabular-nums text-mt-neutral-700">
                  {g.acoes.length} {g.acoes.length === 1 ? "proposta" : "propostas"} · {reais(soma(g.acoes))} em 7 dias
                </span>
                {g.acoes.length > 1 && (
                  <button
                    type="button"
                    disabled={ocupado !== null}
                    onClick={() => void aprovarGrupo(g)}
                    className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-3 py-2 text-[10px]"
                    data-aprovar-grupo
                  >
                    Aprovar as {g.acoes.length}
                  </button>
                )}
              </div>
            </div>
            <ul className="m-0 flex list-none flex-col gap-0 p-0">
              {g.acoes.map((a) => (
                <li key={a.id} className="flex flex-col gap-2 border-t border-mt-regua-fina py-3" data-proposta={a.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-sm font-semibold text-mt-ink">{descreverAcao(a)}</span>
                      <span className="text-xs leading-relaxed text-mt-neutral-800">{a.motivo}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        disabled={ocupado !== null}
                        onClick={() => void decidir([a.id], "aprovar", a.id)}
                        className="mt-btn mt-btn-primario mt-foco cursor-pointer px-4 py-2 text-[10px]"
                        data-aprovar
                      >
                        {ocupado === a.id ? "…" : "Aprovar"}
                      </button>
                      <button
                        type="button"
                        disabled={ocupado !== null}
                        onClick={() => void decidir([a.id], "recusar", a.id)}
                        className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2 text-[10px]"
                        data-recusar
                      >
                        Recusar
                      </button>
                    </div>
                  </div>
                  {Object.keys(a.evidencias).length > 0 && (
                    <details className="text-xs text-mt-neutral-800">
                      <summary className="mt-foco cursor-pointer select-none text-[11px] font-semibold text-mt-neutral-700">
                        {a.tipo === "negativar" ? "Termos que esta negativa corta" : "Os números"}
                      </summary>
                      <div className="pt-2">
                        <Evidencias evidencias={a.evidencias} />
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {aCaminho.length > 0 && (
        <section aria-label="Aprovadas, esperando o script" className="flex flex-col gap-2" data-a-caminho>
          <h3 className="m-0 text-sm font-extrabold text-mt-ink">Aprovadas, esperando o script</h3>
          <ul className="m-0 flex list-none flex-col p-0">
            {aCaminho.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-mt-regua-fina py-2 text-xs" data-a-caminho={a.id}>
                <span className="inline-flex min-w-0 items-center gap-2">
                  <SinalDeEstado estado={SINAL_DA_SITUACAO[a.situacao]} tamanho={16} rotulo={ROTULO_DA_SITUACAO[a.situacao]} />
                  <span className="text-mt-ink">{descreverAcao(a)}</span>
                </span>
                <span className="inline-flex items-center gap-3 text-mt-neutral-700">
                  {ROTULO_DA_SITUACAO[a.situacao]}
                  {a.decididaPorNome ? ` · ${a.decididaPorNome}` : ""}
                  {a.decididaEm ? ` · ${haQuanto(a.decididaEm, agora)}` : ""}
                  {a.situacao === "aprovada" && (
                    <button
                      type="button"
                      disabled={ocupado !== null}
                      onClick={() => void decidir([a.id], "recusar", a.id)}
                      className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-3 py-1.5 text-[10px]"
                      data-desistir
                    >
                      Desistir
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
