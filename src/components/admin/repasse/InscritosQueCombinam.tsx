"use client";

import Link from "next/link";
import { useState } from "react";
import {
  inscritosQueCombinam,
  mensagemDeAvisoDoRepasse,
  type InscritoDoRepasse,
} from "../../../lib/avisosDoRepasse";
import { soParaLojistas, type Repasse } from "../../../lib/repasse";

/**
 * "Inscritos que combinam" (spec §6): quem da lista avisar deste carro, a
 * mensagem pronta para colar no Chatwoot e o botão "avisado". O aviso é
 * manual; nada aqui manda mensagem.
 */
export default function InscritosQueCombinam({
  repasse,
  inscritos,
  avisados: avisadosIniciais,
  urlDaFicha,
}: {
  repasse: Repasse;
  inscritos: InscritoDoRepasse[];
  avisados: string[];
  urlDaFicha: string;
}) {
  const [avisados, setAvisados] = useState<Set<string>>(() => new Set(avisadosIniciais));
  const [copiado, setCopiado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { combinam, lojistasSemConferencia } = inscritosQueCombinam(repasse, inscritos, avisados);

  async function copiar(inscrito: InscritoDoRepasse) {
    try {
      await navigator.clipboard.writeText(mensagemDeAvisoDoRepasse(repasse, inscrito, urlDaFicha));
      setCopiado(inscrito.id);
    } catch {
      setErro("Não deu para copiar. Selecione o texto da mensagem à mão.");
    }
  }

  async function marcar(inscrito: InscritoDoRepasse) {
    setErro(null);
    const res = await fetch(`/api/repasses/${repasse.id}/avisos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inscritoId: inscrito.id }),
    }).catch(() => null);
    if (!res || !res.ok) {
      const data = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
      setErro(data.error || "Não deu para marcar o aviso.");
      return;
    }
    setAvisados((atual) => new Set([...atual, inscrito.id]));
  }

  return (
    <section className="flex flex-col gap-3 border-t-2 border-mt-regua pt-4">
      <div className="mt-rotulo">Quem avisar</div>
      <p className="max-w-[62ch] text-xs leading-relaxed text-mt-neutral-800">
        {soParaLojistas(repasse)
          ? "Enquanto o carro é só para lojistas, entram os lojistas com CNPJ conferido. Quem compra para usar entra quando você abrir para todos."
          : "Lojistas com CNPJ conferido e quem compra para usar na faixa de preço e na carroceria deste carro."}{" "}
        Copie a mensagem, mande pelo Chatwoot e marque como avisado.
      </p>
      {lojistasSemConferencia > 0 && (
        <p className="text-[11px] text-mt-neutral-700">
          {lojistasSemConferencia} lojista(s) aguardam a conferência do CNPJ.{" "}
          <Link href="/admin/repasse/inscritos" className="underline">
            Conferir na lista
          </Link>
        </p>
      )}
      {combinam.length === 0 ? (
        <p className="text-xs text-mt-neutral-700">Ninguém da lista combina com este carro ainda.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-mt-regua-fina">
          {combinam.map(({ inscrito, avisado }) => (
            <li key={inscrito.id} className="flex flex-wrap items-center gap-3 py-2 text-xs">
              <strong>{inscrito.nome}</strong>
              <span className="text-mt-neutral-700">{inscrito.trilha === "lojista" ? "Lojista" : "Compra para usar"}</span>
              <span className="tabular-nums">{inscrito.whatsapp}</span>
              <button type="button" onClick={() => void copiar(inscrito)} className="mt-btn mt-btn-contorno mt-foco ml-auto px-3 py-1.5 text-[10px]">
                {copiado === inscrito.id ? "Copiada" : "Copiar mensagem"}
              </button>
              {avisado ? (
                <span className="text-[10px] font-bold uppercase tracking-[.08em] text-mt-neutral-700">Avisado</span>
              ) : (
                <button type="button" onClick={() => void marcar(inscrito)} className="mt-btn mt-btn-tinta mt-foco px-3 py-1.5 text-[10px]">
                  Marcar avisado
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {erro && <p role="alert" className="text-[11px] text-mt-accent-800">{erro}</p>}
    </section>
  );
}
