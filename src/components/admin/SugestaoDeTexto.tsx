"use client";

import { useState } from "react";

/**
 * O painel de sugestão.
 *
 * NÃO sobrescreve o campo: mostra o texto ao lado e espera "Usar este texto".
 * Com 62 veículos ainda no blurb institucional, o botão sempre encontra algo
 * escrito, e quem revisa precisa comparar antes de trocar.
 *
 * A revisão humana também é a ÚNICA defesa contra troca de campo — "motor
 * manual" quando o manual é o câmbio. Nenhuma regra determinística pega isso
 * (ver o docblock de `lib/descritivo/validacao.ts`).
 */

type Motivo = { regra: string; motivo: string };

export function SugestaoDeTexto({
  veiculoId,
  campo,
  onUsar,
}: {
  veiculoId: number | string;
  campo: "descricao" | "descricao_seo";
  onUsar: (texto: string) => void;
}) {
  const [carregando, setCarregando] = useState(false);
  const [texto, setTexto] = useState<string | null>(null);
  const [caracteres, setCaracteres] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [motivos, setMotivos] = useState<Motivo[]>([]);

  async function gerar() {
    setCarregando(true);
    setErro(null);
    setMotivos([]);
    setTexto(null);
    try {
      const r = await fetch(`/api/estoque/${veiculoId}/descritivo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(j?.error ?? `Falhou com HTTP ${r.status}`);
        setMotivos(Array.isArray(j?.motivos) ? j.motivos : []);
        return;
      }
      setTexto(j.texto);
      setCaracteres(j.caracteres ?? String(j.texto ?? "").length);
    } catch (e: any) {
      setErro(e?.message ?? "Falha ao chamar o gerador");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={gerar}
        disabled={carregando}
        className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[11px] disabled:opacity-45"
      >
        {carregando ? "Gerando…" : texto ? "Gerar outro" : "Gerar sugestão"}
      </button>

      {erro && (
        <div className="mt-3 border-l-[3px] border-mt-accent bg-mt-accent-100 px-3 py-2.5 text-[12px] leading-relaxed text-mt-accent-800">
          <div className="font-medium">{erro}</div>
          {motivos.length > 0 && (
            <ul className="mt-2 list-disc pl-4">
              {motivos.map((m) => (
                <li key={m.regra}>
                  <span className="font-medium">{m.regra}:</span> {m.motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {texto && (
        <div className="mt-3 border-l-[3px] border-mt-ink bg-mt-surface px-3 py-2.5">
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{texto}</p>
          <p className="mt-2 text-[11px] text-mt-neutral-700">
            {caracteres} caracteres. Leia antes de usar: a conferência automática não detecta
            troca de campo — &quot;motor manual&quot; quando o manual é o câmbio, por exemplo.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onUsar(texto)}
              className="mt-btn mt-btn-primario mt-foco cursor-pointer px-4 py-2.5 text-[11px] disabled:opacity-45"
            >
              Usar este texto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
