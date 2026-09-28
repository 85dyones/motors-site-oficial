"use client";

import { useState } from "react";
import { useConfirm } from "../ConfirmDialog";
import type { Perfil } from "../../../lib/permissoes";
import type { Repasse, RepasseDoPainel } from "../../../lib/repasse";
import { LIMITE_DA_NOTA, REGRAS_DOS_ATOS, atosPossiveis, type AtoDoRepasse } from "../../../lib/transicoesDoRepasse";

/**
 * Os botões que mudam a situação do carro (spec §5). Quais aparecem é
 * `atosPossiveis` — "o que for negado some da interface, não fica cinza"
 * (A17). A rota decide de novo; este componente só oferece.
 */

/** Atos sem volta pedem confirmação. "Devolver" pede a nota. */
const CONFIRMACAO: Partial<Record<AtoDoRepasse, string>> = {
  publicar_todos: "O carro vai aparecer para todo mundo no site, sem a fase só para lojistas. Não tem volta.",
  abrir_para_todos: "O carro deixa de ser só para lojistas e passa a aparecer para todo mundo. Não tem volta.",
  vender: "O carro fica no site como vendido pela carência e depois some sozinho.",
  arquivar: "O carro sai do site e do fluxo. Para voltar, cadastre de novo.",
};

const PRIMARIOS: readonly AtoDoRepasse[] = ["enviar", "publicar_lojistas", "abrir_para_todos"];

export default function AcoesDoRepasse({
  repasse,
  perfis,
  alterado,
  aoMudar,
}: {
  repasse: Pick<Repasse, "id" | "situacao" | "aberto_ao_publico_em">;
  perfis: Perfil[];
  /** Há edição não salva? Mudar a situação por cima dela perderia a edição. */
  alterado: boolean;
  aoMudar: (novo: RepasseDoPainel) => void;
}) {
  const { confirm } = useConfirm();
  const [ocupado, setOcupado] = useState(false);
  const [devolvendo, setDevolvendo] = useState(false);
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState<{ texto: string; problemas: string[] } | null>(null);
  const atos = atosPossiveis(repasse, perfis);
  if (atos.length === 0) return null;

  async function executar(ato: AtoDoRepasse, notaDoAto?: string) {
    const aviso = CONFIRMACAO[ato];
    if (aviso) {
      const rotulo = REGRAS_DOS_ATOS[ato].rotulo;
      const ok = await confirm({ title: rotulo, message: aviso, confirmLabel: rotulo, type: "warning" });
      if (!ok) return;
    }
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch(`/api/repasses/${repasse.id}/transicao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notaDoAto === undefined ? { ato } : { ato, nota: notaDoAto }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; problemas?: unknown; repasse?: RepasseDoPainel };
      if (!res.ok || !data.repasse) {
        setErro({
          texto: data.error || "Não deu para mudar a situação.",
          problemas: Array.isArray(data.problemas) ? data.problemas.filter((p): p is string => typeof p === "string") : [],
        });
        return;
      }
      setDevolvendo(false);
      setNota("");
      aoMudar(data.repasse);
    } catch {
      setErro({ texto: "Não deu para mudar a situação. Confira a conexão.", problemas: [] });
    } finally {
      setOcupado(false);
    }
  }

  const travado = ocupado || alterado;

  return (
    <section className="flex flex-col gap-3 border-t-2 border-mt-regua pt-4">
      <div className="mt-rotulo">Situação</div>
      <div className="flex flex-wrap gap-2">
        {atos.map((ato) => (
          <button
            key={ato}
            type="button"
            disabled={travado}
            onClick={() => (ato === "devolver" ? setDevolvendo(true) : void executar(ato))}
            className={`mt-btn mt-foco px-4 py-2.5 text-[11px] ${PRIMARIOS.includes(ato) ? "mt-btn-primario" : "mt-btn-contorno"}`}
          >
            {REGRAS_DOS_ATOS[ato].rotulo}
          </button>
        ))}
      </div>
      {alterado && <p className="text-[11px] text-mt-neutral-700">Salve as alterações antes de mudar a situação.</p>}
      {devolvendo && (
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700" htmlFor="nota-da-devolucao">
            O que falta para voltar à validação
          </label>
          <textarea
            id="nota-da-devolucao"
            className="mt-campo-caixa mt-foco min-h-20"
            maxLength={LIMITE_DA_NOTA}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
          <div className="flex gap-2">
            <button type="button" disabled={travado} onClick={() => void executar("devolver", nota)} className="mt-btn mt-btn-tinta mt-foco px-4 py-2 text-[11px]">
              Devolver
            </button>
            <button type="button" onClick={() => setDevolvendo(false)} className="mt-btn mt-btn-contorno mt-foco px-4 py-2 text-[11px]">
              Cancelar
            </button>
          </div>
        </div>
      )}
      {erro && (
        <div role="alert" className="border-l-[3px] border-mt-accent bg-mt-accent-100 px-3 py-2.5 text-xs text-mt-accent-800">
          <p>{erro.texto}</p>
          {erro.problemas.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {erro.problemas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
