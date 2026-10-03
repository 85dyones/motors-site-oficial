"use client";

import {
  ROTULO_DO_DESFECHO,
  destinoDaConversa,
  destinosDoNegocio,
  ehDescarte,
  espera,
  etapasDoQuadro,
  formatarPrazo,
  linkDeConversa,
  mensagemParaCliente,
  minutosParado,
  numeroDiscavel,
  type EtapaDoFunil,
  type NivelDeEstagnacao,
} from "../../../lib/funil";
import {
  AVISO_DE_ESTAGNACAO,
  formatarTelefone,
  seloCurtoDeTransferencias,
  type LeadDoDetalhe,
} from "../../../lib/filaDoFunil";
import { iniciais, opcaoSemResponsavel, opcoesDoCard } from "../../../lib/leadsKanban";
import { Segmentado } from "../SegmentadoDoPainel";

/**
 * Bloco h do detalhe: quem é o lead, onde ele está e os gestos que mudam isso.
 *
 * Tudo o que saiu do card mora aqui: o responsável, a etapa e o destino do
 * negócio. Fechar um negócio e descartar um registro são gestos diferentes:
 * Ganho e Perdido ficam lado a lado, e "Não é oportunidade" vem com menos
 * peso, para ninguém marcar spam como perda por ser o botão ao lado.
 */
export default function CabecalhoDoLead({
  lead,
  aberto,
  nivel,
  agora,
  etapas,
  atendentes,
  podeTirarDono,
  ocupado,
  chegando,
  tituloDaPagina = false,
  className = "",
  aoMover,
  aoMudarResponsavel,
  aoConversar,
  aoLigar,
  aoChegar,
}: {
  lead: LeadDoDetalhe;
  aberto: boolean;
  nivel: NivelDeEstagnacao;
  agora: number;
  etapas: EtapaDoFunil[];
  atendentes: string[];
  /** Só o Administrador deixa o lead sem responsável. */
  podeTirarDono: boolean;
  /** Há escrita no Chatwoot em voo: o responsável trava. */
  ocupado: boolean;
  chegando: boolean;
  /** Na página o nome é o `h1`; na gaveta, que abre sobre a tela de Leads, um `h2`. */
  tituloDaPagina?: boolean;
  className?: string;
  /** Move para a etapa. Etapa terminal pede o motivo antes de gravar. */
  aoMover: (chave: string) => void;
  aoMudarResponsavel: (nome: string | null) => void;
  /** Abriu a conversa: registra o contato e pré-seleciona WhatsApp. */
  aoConversar: () => void;
  /** Pré-seleciona Ligação no registro. */
  aoLigar: () => void;
  aoChegar: () => void;
}) {
  const etapaAtual = etapas.find((e) => e.chave === lead.situacao);
  const abertas = etapasDoQuadro(etapas, aberto ? [lead] : []);
  const destinos = destinosDoNegocio(etapas);
  const fecham = destinos.filter((e) => !ehDescarte(e.tipo));
  const descartam = destinos.filter((e) => ehDescarte(e.tipo));

  const conversa = linkDeConversa(
    lead.telefone,
    mensagemParaCliente(lead, { vendedor: lead.responsavel }),
    lead.chatwoot_conversation_id,
  );
  const destino = destinoDaConversa(lead.telefone, lead.chatwoot_conversation_id);
  const telefone = formatarTelefone(lead.telefone);
  const discavel = numeroDiscavel(lead.telefone);
  const aviso = AVISO_DE_ESTAGNACAO[nivel];
  const transferencias = seloCurtoDeTransferencias(lead.transferencias);

  const Titulo = tituloDaPagina ? "h1" : "h2";

  const rotulo = [
    aberto ? (etapaAtual?.rotulo ?? lead.situacao) : lead.desfecho ? ROTULO_DO_DESFECHO[lead.desfecho] : "Fechado",
    lead.canal || "site",
    `${espera(lead.created_at, agora)} no funil`,
  ].join(" · ");

  return (
    <header data-bloco="h" className={`flex flex-col gap-3.5 border-b-2 border-mt-regua px-6 py-5 ${className}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <div className="mt-rotulo mt-rotulo-accent tabular-nums">{rotulo}</div>
        {aviso && (
          <div
            className={`text-[10px] font-semibold uppercase tracking-[.08em] ${
              nivel === "atencao" ? "text-mt-neutral-700" : "text-mt-accent-800"
            }`}
          >
            {aviso} há {formatarPrazo(minutosParado(lead, agora))}
          </div>
        )}
      </div>

      <div>
        <Titulo className="m-0 text-[28px] font-extrabold leading-tight tracking-[-.03em] text-mt-ink [overflow-wrap:anywhere]">
          {lead.nome}
        </Titulo>
        {lead.interesse && (
          <p className="m-0 mt-1 text-[13px] leading-snug text-mt-neutral-800 [overflow-wrap:anywhere]">{lead.interesse}</p>
        )}
      </div>

      <div className="flex flex-wrap items-stretch gap-2">
        {conversa && (
          <a
            href={conversa}
            target="_blank"
            rel="noopener noreferrer"
            onClick={aoConversar}
            className="mt-foco flex items-center gap-1.5 border border-mt-accent bg-mt-bg px-3 py-[9px] text-[11px] font-semibold text-mt-accent hover:bg-mt-accent-100 pointer-coarse:min-h-11"
          >
            {destino === "chatwoot" ? "Abrir no Chatwoot" : "WhatsApp"}
            <span className="font-normal tabular-nums text-mt-neutral-700">{telefone}</span>
          </a>
        )}
        {discavel ? (
          <a
            href={`tel:+${discavel}`}
            onClick={aoLigar}
            className="mt-btn mt-btn-contorno mt-foco px-3.5 py-[9px] text-[11px] pointer-coarse:min-h-11"
          >
            LIGAR
          </a>
        ) : (
          <button
            type="button"
            onClick={aoLigar}
            className="mt-btn mt-btn-contorno mt-foco px-3.5 py-[9px] text-[11px] pointer-coarse:min-h-11"
          >
            LIGAR
          </button>
        )}
        <button
          type="button"
          onClick={aoChegar}
          disabled={chegando}
          className="mt-btn mt-btn-tinta mt-foco px-3.5 py-[9px] text-[11px] pointer-coarse:min-h-11"
        >
          CHEGOU NA LOJA
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <Segmentado
          rotulo={`Etapa de ${lead.nome}`}
          valor={aberto ? lead.situacao : null}
          aoEscolher={(chave) => {
            if (chave !== lead.situacao || !aberto) aoMover(chave);
          }}
          opcoes={abertas.map((e) => ({ valor: e.chave, rotulo: e.rotulo }))}
        />
        {!aberto && (
          <p className="m-0 text-[11px] text-mt-neutral-700">
            Negócio fechado. Escolher uma etapa reabre o lead nela.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`flex h-5 w-5 shrink-0 items-center justify-center text-[9px] font-extrabold ${
              lead.responsavel ? "bg-mt-ink text-mt-bg" : "border border-dashed border-mt-regua text-mt-neutral-500"
            }`}
          >
            {lead.responsavel ? iniciais(lead.responsavel) : ""}
          </span>
          <select
            value={lead.responsavel ?? ""}
            onChange={(e) => aoMudarResponsavel(e.target.value || null)}
            disabled={ocupado}
            aria-label={`Responsável por ${lead.nome}`}
            className="mt-foco min-w-0 cursor-pointer border border-mt-regua-fina bg-mt-bg px-2 py-1.5 text-[11px] text-mt-ink disabled:cursor-wait disabled:opacity-60 pointer-coarse:min-h-11"
          >
            {/* Só o Administrador deixa o lead sem dono (03/10): para os outros
                a opção não existe, e a rota recusa com 403. */}
            {opcaoSemResponsavel(podeTirarDono, lead.responsavel) !== "nao" && (
              <option value="" disabled={!podeTirarDono}>
                Sem responsável
              </option>
            )}
            {/* Só o Comercial (23/09). O dono de fora aparece para o select
                mostrar o valor do lead, mas não pode ser escolhido de novo. */}
            {opcoesDoCard(atendentes, lead.responsavel).map((o) => (
              <option key={o.nome} value={o.nome} disabled={o.fora}>
                {o.fora ? `${o.nome} (fora do comercial)` : o.nome}
              </option>
            ))}
          </select>
          {transferencias && (
            <span className="shrink-0 text-[10px] uppercase tracking-[.06em] tabular-nums text-mt-neutral-600">
              {transferencias}
            </span>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {fecham.map((e) => (
            <button
              key={e.chave}
              type="button"
              onClick={() => aoMover(e.chave)}
              aria-label={`Marcar ${lead.nome} como ${e.rotulo}`}
              className="mt-foco cursor-pointer border border-mt-regua-fina px-3 py-1.5 text-[11px] text-mt-neutral-700 hover:border-mt-accent hover:text-mt-ink pointer-coarse:min-h-11"
            >
              {e.rotulo}
            </button>
          ))}
          {/* O descarte, com menos peso: é o mais raro dos três. */}
          {descartam.map((e) => (
            <button
              key={e.chave}
              type="button"
              onClick={() => aoMover(e.chave)}
              aria-label={`Marcar ${lead.nome} como ${e.rotulo}`}
              title="Spam, teste ou contato equivocado: fica fora da taxa de conversão"
              className="mt-foco cursor-pointer px-2 py-1.5 text-[11px] text-mt-neutral-600 hover:text-mt-accent-hover pointer-coarse:min-h-11"
            >
              {e.rotulo}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
