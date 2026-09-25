"use client";

import { ETIQUETAS_DA_PASSAGEM } from "../../lib/etiquetasDoChatwoot";

/**
 * As etiquetas da conversa do Chatwoot, dentro do card do lead (2026-09-25).
 *
 * Pedido do dono: *"ele [o SDR] tem que ter acesso às etiquetas"*; decisão
 * dele: ver e editar no card. Pôr é um select com as etiquetas que existem;
 * tirar é o × do chip. Cada mudança grava a lista inteira na conversa, pela
 * rota `/api/leads/etiquetas` — o Chatwoot continua sendo a fonte.
 *
 * "resgate" e "reaquecido" aparecem com a régua de destaque: são as que medem
 * o trabalho do SDR, e quem olha o card precisa saber que o lead veio dele.
 *
 * Três jeitos de não oferecer edição, e cada um com o seu motivo:
 *   - sem conversa no Chatwoot, não há onde gravar — e sem etiqueta nenhuma
 *     não há o que mostrar, então o bloco some (é o lead recém-chegado, o mais
 *     comum; uma linha "sem etiqueta" em cada um seria ruído);
 *   - sem `CHATWOOT_API_TOKEN` no servidor, as etiquetas aparecem, sem × e
 *     sem select — oferecer e falhar no clique ensina que o botão não presta;
 *   - enquanto uma gravação está no ar, os controles travam: duas listas
 *     inteiras em voo ao mesmo tempo, a segunda apagaria a primeira.
 */

const DA_PASSAGEM: readonly string[] = ETIQUETAS_DA_PASSAGEM;

export default function EtiquetasDoLead({
  nome,
  etiquetas,
  disponiveis,
  temConversa,
  editavel,
  gravando = false,
  onMudar,
}: {
  nome: string;
  etiquetas: readonly string[];
  disponiveis: readonly string[];
  temConversa: boolean;
  editavel: boolean;
  gravando?: boolean;
  onMudar: (etiquetas: string[]) => void;
}) {
  const podeEditar = editavel && temConversa;
  if (etiquetas.length === 0 && !podeEditar) return null;

  const paraPor = disponiveis.filter((e) => !etiquetas.includes(e));

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1" aria-label={`Etiquetas de ${nome}`} role="group">
      {etiquetas.map((e) => (
        <span
          key={e}
          className={`inline-flex items-center gap-0.5 border px-1.5 py-0.5 text-[10px] leading-none ${
            DA_PASSAGEM.includes(e)
              ? "border-mt-accent text-mt-accent-800"
              : "border-mt-regua-fina text-mt-neutral-800"
          }`}
        >
          {e}
          {podeEditar && (
            <button
              type="button"
              disabled={gravando}
              onClick={() => onMudar(etiquetas.filter((x) => x !== e))}
              aria-label={`Tirar a etiqueta ${e} de ${nome}`}
              className="mt-foco -mr-0.5 cursor-pointer px-0.5 text-mt-neutral-600 hover:text-mt-accent disabled:cursor-wait disabled:opacity-50"
            >
              ×
            </button>
          )}
        </span>
      ))}

      {podeEditar && paraPor.length > 0 && (
        <select
          // Sempre no "+ etiqueta": o select é um botão de pôr, não um estado.
          value=""
          disabled={gravando}
          onChange={(ev) => {
            const nova = ev.target.value;
            if (nova) onMudar([...etiquetas, nova]);
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
