import { ddmmEmCuritiba } from "../../../lib/horarioDaLoja";
import type { PedidoDeExameNoPainel } from "../../../lib/pedidosDeExame";

/**
 * Os pedidos de exame do carro, abaixo do editor. Leitura só: o atendimento
 * continua no Kanban e no Chatwoot; aqui a equipe vê, junto do carro, quem
 * pediu para vê-lo no pátio.
 */
export default function PedidosDeExame({ pedidos }: { pedidos: PedidoDeExameNoPainel[] }) {
  return (
    <section aria-labelledby="pedidos-de-exame" className="flex w-full max-w-4xl flex-col gap-3 border-t-2 border-mt-regua pt-5">
      <h2 id="pedidos-de-exame" className="mt-titulo m-0 text-xl">
        Pedidos de exame no pátio
      </h2>
      {pedidos.length === 0 ? (
        <p className="m-0 text-sm text-mt-neutral-700">Nenhum pedido de exame para este carro ainda.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-mt-regua-fina p-0">
          {pedidos.map((p) => (
            <li key={p.id} className="flex flex-col gap-1 py-3 text-xs">
              <span className="flex flex-wrap items-center gap-3">
                <strong className="text-sm">{p.nome}</strong>
                {p.telefone && <span className="tabular-nums">{p.telefone}</span>}
                <span className="text-mt-neutral-700">{ddmmEmCuritiba(p.created_at)}</span>
              </span>
              {p.interesse && <span className="text-mt-neutral-800">{p.interesse}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
