"use client";

import { useState } from "react";
import { useConfirm } from "../ConfirmDialog";
import type { InscritoDoRepasse } from "../../../lib/avisosDoRepasse";
import { FAIXAS_DO_REPASSE } from "../../../lib/repasse";

const rotuloDaFaixa = (id: string | null) => FAIXAS_DO_REPASSE.find((f) => f.id === id)?.rotulo ?? "Qualquer faixa";

/**
 * A lista do repasse (spec §6, tela "Inscritos"): conferir o CNPJ do lojista
 * e tirar alguém da lista. Tirar APAGA a linha — é o que a /privacidade
 * promete —, por isso pede confirmação dizendo que não tem volta.
 */
export default function TabelaDeInscritos({ inscritos: iniciais }: { inscritos: InscritoDoRepasse[] }) {
  const { confirm } = useConfirm();
  const [inscritos, setInscritos] = useState(iniciais);
  const [erro, setErro] = useState<string | null>(null);

  async function conferir(i: InscritoDoRepasse) {
    setErro(null);
    const res = await fetch(`/api/repasse-inscritos/${i.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj_conferido: !i.cnpj_conferido_em }),
    }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as { error?: string; inscrito?: InscritoDoRepasse }) : {};
    if (!res || !res.ok || !data.inscrito) {
      setErro(data.error || "Não deu para gravar.");
      return;
    }
    const novo = data.inscrito;
    setInscritos((lista) => lista.map((x) => (x.id === i.id ? novo : x)));
  }

  async function tirar(i: InscritoDoRepasse) {
    const ok = await confirm({
      title: "Tirar da lista",
      message: `Apaga o perfil de ${i.nome} na lista do repasse, como a política de privacidade promete. Não tem volta.`,
      confirmLabel: "Tirar da lista",
      type: "danger",
    });
    if (!ok) return;
    setErro(null);
    const res = await fetch(`/api/repasse-inscritos/${i.id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      const data = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
      setErro(data.error || "Não deu para tirar da lista.");
      return;
    }
    setInscritos((lista) => lista.filter((x) => x.id !== i.id));
  }

  if (inscritos.length === 0) return <p className="text-sm text-mt-neutral-700">Ninguém na lista ainda.</p>;

  return (
    <>
      <ul className="flex flex-col divide-y divide-mt-regua-fina">
        {inscritos.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 py-3 text-xs">
            <strong className="text-sm">{i.nome}</strong>
            <span className="tabular-nums">{i.whatsapp}</span>
            {i.trilha === "lojista" ? (
              <>
                <span>Lojista · CNPJ {i.cnpj}</span>
                {i.loja_cidade && <span className="text-mt-neutral-700">{i.loja_cidade}</span>}
                <button type="button" onClick={() => void conferir(i)} className="mt-btn mt-btn-contorno mt-foco px-3 py-1.5 text-[10px]">
                  {i.cnpj_conferido_em ? "CNPJ conferido · desmarcar" : "Marcar CNPJ conferido"}
                </button>
              </>
            ) : (
              <>
                <span>Compra para usar · {rotuloDaFaixa(i.faixa)}</span>
                {i.carrocerias.length > 0 && <span className="text-mt-neutral-700">{i.carrocerias.join(", ")}</span>}
              </>
            )}
            <button type="button" onClick={() => void tirar(i)} className="mt-btn mt-btn-contorno mt-foco ml-auto px-3 py-1.5 text-[10px]">
              Tirar da lista
            </button>
          </li>
        ))}
      </ul>
      {erro && <p role="alert" className="text-[11px] text-mt-accent-800">{erro}</p>}
    </>
  );
}
