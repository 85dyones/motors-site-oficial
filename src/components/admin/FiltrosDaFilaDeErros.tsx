"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AMBIENTES_CONHECIDOS,
  JANELAS,
  ORIGENS_DE_ERRO,
  ROTULO_DA_ORIGEM,
  type FiltrosDaFila,
} from "../../lib/filaDeErros";

/**
 * O recorte da fila — e ele vive na URL, não em estado local.
 *
 * Duas consequências de desenho, as duas de propósito:
 *
 * 1. **A leitura é do servidor.** Trocar o filtro é navegar; a página inteira é
 *    redesenhada a partir de uma consulta nova, com a RLS aplicada. Não há
 *    estado de cliente para divergir do que o banco respondeu.
 * 2. **O endereço fica compartilhável.** "Olha esse erro aqui" vira um link com
 *    o recorte dentro — inclusive o recorte por `digest`, que é como se separa
 *    um defeito de outro dentro de um grupo gordo.
 */
export default function FiltrosDaFilaDeErros({
  filtros,
  ambientesVistos,
}: {
  filtros: FiltrosDaFila;
  /** Os ambientes que apareceram na janela lida — dado real, não vocabulário. */
  ambientesVistos: string[];
}) {
  const router = useRouter();
  const [navegando, iniciar] = useTransition();

  /**
   * Monta a URL do recorte inteiro a cada troca.
   *
   * Reescrever tudo em vez de mexer num parâmetro só evita o defeito clássico
   * da navegação por query: o valor antigo de um campo sobrevive porque
   * ninguém lembrou de apagá-lo.
   */
  const ir = (mudanca: Partial<FiltrosDaFila>) => {
    const alvo = { ...filtros, ...mudanca };
    const p = new URLSearchParams();

    if (alvo.origem) p.set("origem", alvo.origem);
    // String vazia significaria "parâmetro ausente", que é o padrão (produção).
    // "todos" é como a URL diz "sem recorte de ambiente".
    p.set("ambiente", alvo.ambiente || "todos");
    if (alvo.estado === "todos") p.set("estado", "todos");
    p.set("janela", String(alvo.janela));
    if (alvo.digest) p.set("digest", alvo.digest);

    iniciar(() => router.push(`/admin/erros?${p.toString()}`));
  };

  const campo =
    "h-10 cursor-pointer border border-mt-regua-fina bg-mt-bg px-3 text-xs text-mt-ink outline-none focus:border-mt-accent";
  const rotulo = "text-[9px] font-bold uppercase tracking-wider text-mt-neutral-700";

  // O seletor lista o vocabulário conhecido MAIS o que de fato apareceu: a
  // coluna `ambiente` não tem CHECK (o vocabulário é da Vercel), e um ambiente
  // novo dela não pode ficar inalcançável pela tela.
  const ambientes = [...new Set([...AMBIENTES_CONHECIDOS, ...ambientesVistos, filtros.ambiente])]
    .filter(Boolean)
    .sort();

  return (
    <div className="flex flex-col gap-4 border border-mt-regua-fina bg-mt-surface p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className={rotulo} htmlFor="erros-estado">
            Situação
          </label>
          <select
            id="erros-estado"
            value={filtros.estado}
            onChange={(e) => ir({ estado: e.target.value as FiltrosDaFila["estado"] })}
            className={campo}
          >
            <option value="abertos">Abertos</option>
            <option value="todos">Todos</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={rotulo} htmlFor="erros-origem">
            Origem
          </label>
          <select
            id="erros-origem"
            value={filtros.origem}
            onChange={(e) => ir({ origem: e.target.value })}
            className={campo}
          >
            <option value="">Todas</option>
            {ORIGENS_DE_ERRO.map((o) => (
              <option key={o} value={o}>
                {ROTULO_DA_ORIGEM[o]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={rotulo} htmlFor="erros-ambiente">
            Ambiente
          </label>
          <select
            id="erros-ambiente"
            value={filtros.ambiente}
            onChange={(e) => ir({ ambiente: e.target.value })}
            className={campo}
          >
            <option value="">Todos</option>
            {ambientes.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={rotulo} htmlFor="erros-janela">
            Ocorrências lidas
          </label>
          <select
            id="erros-janela"
            value={filtros.janela}
            onChange={(e) => ir({ janela: Number(e.target.value) })}
            className={campo}
            title="Quantas ocorrências entram no agrupamento. Mais é mais caro de ler."
          >
            {JANELAS.map((j) => (
              <option key={j} value={j}>
                {j} últimas
              </option>
            ))}
          </select>
        </div>

        {navegando && (
          <span className="pb-3 text-[10px] text-mt-neutral-600">Carregando…</span>
        )}
      </div>

      {filtros.digest && (
        <div className="flex flex-wrap items-center gap-3 border-t border-mt-regua-fina pt-3">
          <span className="text-[10px] text-mt-neutral-700">
            Recorte por digest{" "}
            <code className="border border-mt-regua-fina bg-mt-bg px-1.5 py-0.5 font-mono text-[10px] text-mt-ink">
              {filtros.digest}
            </code>{" "}
            — um defeito só, dentro do grupo.
          </span>
          <button
            type="button"
            onClick={() => ir({ digest: undefined })}
            className="mt-foco cursor-pointer border border-mt-regua-fina px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-mt-neutral-700 hover:border-mt-accent hover:text-mt-accent"
          >
            Tirar o recorte
          </button>
        </div>
      )}
    </div>
  );
}
