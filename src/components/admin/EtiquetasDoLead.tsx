"use client";

import { useState } from "react";
import { ehEtiquetaDaPassagem, mesmaEtiqueta, normalizarEtiqueta } from "../../lib/etiquetas";

/**
 * As etiquetas do lead, dentro do detalhe (2026-09-25; no lead desde
 * 2026-10-20, quando o Chatwoot saiu de cena).
 *
 * Pedido do dono: *"ele [o SDR] tem que ter acesso às etiquetas"*; decisão
 * dele: ver e editar no card. Pôr é um select com as etiquetas que já existem
 * nos leads, mais "nova etiqueta…" para criar uma (era a conta do Chatwoot
 * que guardava a lista; agora ela é o que os leads têm); tirar é o × do chip.
 * Cada clique manda UMA mudança (esta entra, esta sai), e o servidor a aplica
 * sobre o que o lead tem agora — nunca a lista que a tela desenhou, que pode
 * estar atrás de outra aba.
 *
 * "resgate" e "reaquecido" aparecem com a régua de destaque, SEM × e fora do
 * "+ etiqueta": são as que medem o trabalho do SDR, e entram sozinhas na
 * passagem (o dono pediu *"automático"* e *"manter"*).
 *
 * Dois jeitos de não oferecer edição, e cada um com o seu motivo:
 *   - banco sem a migração 20261023120000: as etiquetas (da conversa)
 *     aparecem, sem × e sem select — oferecer e falhar no clique ensina que o
 *     botão não presta;
 *   - enquanto o lead tem gravação no ar — de etiqueta OU de responsável —,
 *     os controles travam: a passagem do SDR também escreve etiqueta.
 */

/** O valor do select que abre o campo de etiqueta nova. */
const NOVA = "__nova__";

/** O que se digitou, no formato das etiquetas: minúsculas, espaço vira hífen. */
export function etiquetaDigitada(texto: string): string | null {
  return normalizarEtiqueta(texto.trim().replace(/\s+/g, "-"));
}

export default function EtiquetasDoLead({
  nome,
  etiquetas,
  disponiveis,
  editavel,
  ocupado = false,
  onIncluir,
  onRetirar,
}: {
  nome: string;
  etiquetas: readonly string[];
  disponiveis: readonly string[];
  editavel: boolean;
  ocupado?: boolean;
  onIncluir: (etiqueta: string) => void;
  onRetirar: (etiqueta: string) => void;
}) {
  const [criando, setCriando] = useState(false);
  const [digitada, setDigitada] = useState("");
  const podeEditar = editavel;
  if (etiquetas.length === 0 && !podeEditar) return null;

  // As duas da passagem nunca entram à mão — ver `editarEtiquetasDoLead`.
  const paraPor = disponiveis.filter(
    (d) => !ehEtiquetaDaPassagem(d) && !etiquetas.some((e) => mesmaEtiqueta(e, d)),
  );

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1" aria-label={`Etiquetas de ${nome}`} role="group">
      {etiquetas.map((e) => {
        const daPassagem = ehEtiquetaDaPassagem(e);
        return (
          <span
            key={e}
            className={`inline-flex items-center gap-0.5 border px-1.5 py-0.5 text-[10px] leading-none ${
              daPassagem ? "border-mt-accent text-mt-accent-800" : "border-mt-regua-fina text-mt-neutral-800"
            }`}
          >
            {e}
            {podeEditar && !daPassagem && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => onRetirar(e)}
                aria-label={`Tirar a etiqueta ${e} de ${nome}`}
                className="mt-foco -mr-0.5 cursor-pointer px-0.5 text-mt-neutral-600 hover:text-mt-accent disabled:cursor-wait disabled:opacity-50"
              >
                ×
              </button>
            )}
          </span>
        );
      })}

      {podeEditar && !criando && (
        <select
          // Sempre no "+ etiqueta": o select é um botão de pôr, não um estado.
          value=""
          disabled={ocupado}
          onChange={(ev) => {
            const nova = ev.target.value;
            if (nova === NOVA) setCriando(true);
            else if (nova) onIncluir(nova);
          }}
          aria-label={`Pôr etiqueta em ${nome}`}
          className="mt-foco cursor-pointer border border-dashed border-mt-regua bg-mt-bg px-1 py-0.5 text-[10px] text-mt-neutral-700 disabled:cursor-wait disabled:opacity-50"
        >
          <option value="">+ etiqueta</option>
          {paraPor.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
          <option value={NOVA}>nova etiqueta…</option>
        </select>
      )}

      {podeEditar && criando && (
        <NovaEtiqueta
          nome={nome}
          valor={digitada}
          ocupado={ocupado}
          jaTem={(e) => etiquetas.some((t) => mesmaEtiqueta(t, e))}
          onMudar={setDigitada}
          onPor={(e) => {
            onIncluir(e);
            setDigitada("");
            setCriando(false);
          }}
          onDesistir={() => {
            setDigitada("");
            setCriando(false);
          }}
        />
      )}
    </div>
  );
}

/** O campo da etiqueta nova: Enter põe, Esc desiste. */
function NovaEtiqueta({
  nome,
  valor,
  ocupado,
  jaTem,
  onMudar,
  onPor,
  onDesistir,
}: {
  nome: string;
  valor: string;
  ocupado: boolean;
  jaTem: (etiqueta: string) => boolean;
  onMudar: (texto: string) => void;
  onPor: (etiqueta: string) => void;
  onDesistir: () => void;
}) {
  const etiqueta = etiquetaDigitada(valor);
  // A da passagem não entra à mão nem digitada — ver `editarEtiquetasDoLead`.
  const problema = !valor.trim()
    ? null
    : !etiqueta
      ? "Use letras, números, hífen ou sublinhado (até 50)."
      : ehEtiquetaDaPassagem(etiqueta)
        ? "Resgate e reaquecido entram sozinhas, na passagem do SDR."
        : jaTem(etiqueta)
          ? "O lead já tem essa etiqueta."
          : null;
  const pode = Boolean(etiqueta) && !problema && !ocupado;
  return (
    <form
      className="flex flex-wrap items-center gap-1"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (pode && etiqueta) onPor(etiqueta);
      }}
    >
      <input
        autoFocus
        value={valor}
        maxLength={60}
        disabled={ocupado}
        onChange={(ev) => onMudar(ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key === "Escape") onDesistir();
        }}
        placeholder="nova etiqueta"
        aria-label={`Nova etiqueta para ${nome}`}
        className="mt-foco w-32 border border-mt-regua bg-mt-bg px-1 py-0.5 text-[10px] text-mt-ink"
      />
      <button
        type="submit"
        disabled={!pode}
        className="mt-foco cursor-pointer border border-mt-regua px-1.5 py-0.5 text-[10px] text-mt-neutral-800 hover:border-mt-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        Pôr
      </button>
      <button
        type="button"
        onClick={onDesistir}
        className="mt-foco cursor-pointer px-1 py-0.5 text-[10px] text-mt-neutral-600 hover:text-mt-accent"
      >
        Cancelar
      </button>
      {problema && <span className="w-full text-[10px] text-mt-accent-800">{problema}</span>}
    </form>
  );
}
