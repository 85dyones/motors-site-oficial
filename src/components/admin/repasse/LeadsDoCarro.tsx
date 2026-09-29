import type { TipoDeEtapa } from "../../../lib/funil";
import { ddmmEmCuritiba } from "../../../lib/horarioDaLoja";
import { SEM_RESPONSAVEL, type LeadDoCarroNaTela, type SituacaoDoLead } from "../../../lib/pedidosDeExame";

/**
 * Os leads do carro, no fim da visão (só nela: o editor não os mostra desde
 * 29/09, decisão do dono): os pedidos de exame no
 * pátio e, numa lista à parte, os contatos pelo WhatsApp. Leitura só: o
 * atendimento continua no Kanban e no Chatwoot; aqui a equipe vê, junto do
 * carro, quem pediu para vê-lo e em que pé cada um está (pedido do dono em
 * 28/09: ganho, perdido ou não é oportunidade).
 */

/** O peso de cada desfecho, o mesmo da lista de fechados do Kanban. */
const ESTILO_DO_CHIP: Record<TipoDeEtapa, string> = {
  aberta: "border-mt-ink text-mt-ink",
  ganho: "border-mt-accent-800 text-mt-accent-800",
  perdido: "border-mt-regua-fina text-mt-neutral-700",
  descartado: "border-dashed border-mt-regua-fina text-mt-neutral-500",
};

function ChipDoDesfecho({ situacao }: { situacao: SituacaoDoLead }) {
  return (
    <span className={`border px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${ESTILO_DO_CHIP[situacao.tipo]}`}>
      {situacao.texto}
    </span>
  );
}

function ListaDeLeads({
  id,
  titulo,
  vazio,
  leads,
  comPedido,
}: {
  id: string;
  titulo: string;
  vazio: string;
  leads: LeadDoCarroNaTela[];
  /** O pedido de exame traz telefone e o dia escolhido; o contato pelo WhatsApp, não. */
  comPedido: boolean;
}) {
  return (
    <section aria-labelledby={id} className="flex w-full max-w-4xl flex-col gap-3 border-t-2 border-mt-regua pt-5">
      <h2 id={id} className="mt-titulo m-0 text-xl">
        {titulo}
      </h2>
      {leads.length === 0 ? (
        <p className="m-0 text-sm text-mt-neutral-700">{vazio}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-mt-regua-fina p-0">
          {leads.map((l) => (
            <li key={l.id} className="flex flex-col gap-1 py-3 text-xs">
              <span className="flex flex-wrap items-center gap-3">
                <strong className="text-sm">{l.nome}</strong>
                {comPedido && l.telefone && <span className="tabular-nums">{l.telefone}</span>}
                <span className="text-mt-neutral-700">{ddmmEmCuritiba(l.created_at)}</span>
                <ChipDoDesfecho situacao={l.situacaoNaTela} />
              </span>
              {comPedido && l.interesse && <span className="text-mt-neutral-800">{l.interesse}</span>}
              <span className="text-mt-neutral-700">
                {l.situacaoNaTela.responsavel ? `Quem atende: ${l.situacaoNaTela.responsavel}` : SEM_RESPONSAVEL}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function LeadsDoCarro({ pedidos, contatos }: { pedidos: LeadDoCarroNaTela[]; contatos: LeadDoCarroNaTela[] }) {
  return (
    <>
      <ListaDeLeads
        id="pedidos-de-exame"
        titulo="Pedidos de exame no pátio"
        vazio="Nenhum pedido de exame para este carro ainda."
        leads={pedidos}
        comPedido
      />
      <ListaDeLeads
        id="contatos-pelo-whatsapp"
        titulo="Contatos pelo WhatsApp"
        vazio="Nenhum contato pelo WhatsApp para este carro ainda."
        leads={contatos}
        comPedido={false}
      />
    </>
  );
}
