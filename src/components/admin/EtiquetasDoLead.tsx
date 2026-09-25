"use client";

import { ehEtiquetaDaPassagem, mesmaEtiqueta } from "../../lib/etiquetas";

/**
 * As etiquetas da conversa do Chatwoot, dentro do card do lead (2026-09-25).
 *
 * Pedido do dono: *"ele [o SDR] tem que ter acesso às etiquetas"*; decisão
 * dele: ver e editar no card. Pôr é um select com as etiquetas que existem;
 * tirar é o × do chip. Cada clique manda UMA mudança (esta entra, esta sai),
 * e o servidor a aplica sobre o que a conversa tem agora — nunca a lista que
 * o card desenhou, que vem do espelho e pode estar atrás.
 *
 * "resgate" e "reaquecido" aparecem com a régua de destaque e SEM ×: são as
 * que medem o trabalho do SDR, e o dono pediu para *"manter"*. Quem as põe por
 * engano tira no próprio Chatwoot.
 *
 * Três jeitos de não oferecer edição, e cada um com o seu motivo:
 *   - sem conversa no Chatwoot, não há onde gravar — e sem etiqueta nenhuma
 *     não há o que mostrar, então o bloco some (é o lead recém-chegado, o mais
 *     comum; uma linha "sem etiqueta" em cada um seria ruído);
 *   - sem `CHATWOOT_API_TOKEN` no servidor, as etiquetas aparecem, sem × e
 *     sem select — oferecer e falhar no clique ensina que o botão não presta;
 *   - enquanto o lead tem gravação no ar — de etiqueta OU de responsável —,
 *     os controles travam. A passagem do SDR também escreve etiqueta no
 *     Chatwoot, e duas escritas da mesma conversa em voo, a segunda grava por
 *     cima da primeira.
 */

export default function EtiquetasDoLead({
  nome,
  etiquetas,
  disponiveis,
  temConversa,
  editavel,
  ocupado = false,
  onIncluir,
  onRetirar,
}: {
  nome: string;
  etiquetas: readonly string[];
  disponiveis: readonly string[];
  temConversa: boolean;
  editavel: boolean;
  ocupado?: boolean;
  onIncluir: (etiqueta: string) => void;
  onRetirar: (etiqueta: string) => void;
}) {
  const podeEditar = editavel && temConversa;
  if (etiquetas.length === 0 && !podeEditar) return null;

  const paraPor = disponiveis.filter((d) => !etiquetas.some((e) => mesmaEtiqueta(e, d)));

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

      {podeEditar && paraPor.length > 0 && (
        <select
          // Sempre no "+ etiqueta": o select é um botão de pôr, não um estado.
          value=""
          disabled={ocupado}
          onChange={(ev) => {
            const nova = ev.target.value;
            if (nova) onIncluir(nova);
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
        </select>
      )}
    </div>
  );
}
