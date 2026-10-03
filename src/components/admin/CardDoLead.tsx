"use client";

import {
  destinoDaConversa,
  espera,
  formatarPrazo,
  linkDeConversa,
  mensagemParaCliente,
  minutosParado,
  type NivelDeEstagnacao,
} from "../../lib/funil";
import { ehEtiquetaDaPassagem } from "../../lib/etiquetas";
import { rotuloDoPasso, situacaoDoPasso } from "../../lib/gestaoDoLead";
import {
  AVISO_DE_ESTAGNACAO,
  formatarTelefone,
  rotuloDaUltimaInteracao,
  seloCurtoDeTransferencias,
  type LeadDaFila,
} from "../../lib/filaDoFunil";
import { iniciais } from "../../lib/leadsKanban";

/**
 * O card enxuto do quadro (desenho de 23/09/2026, `docs/design/gestao_do_lead`).
 *
 * O card mostra o que o vendedor decide olhando o quadro: quem é, o que quer,
 * o que foi dito por último e o que fazer agora. Trocar responsável, anotar e
 * fechar o negócio foram para o detalhe, que abre ao clicar no card.
 *
 * Três coisas continuam, cada uma por um motivo:
 *  · arrastar E setas: o arrasto nativo não funciona no toque nem no teclado, e
 *    esta tela roda no tablet de balcão;
 *  · o link da conversa com `draggable={false}`: sem isso o navegador arrasta a
 *    âncora em vez do card, e o card só não se move;
 *  · o link e as setas param a propagação: são gestos próprios, e não abrem o
 *    detalhe.
 */

/** A moldura do card, por nível de estagnação. Régua, nunca sombra. */
export const MOLDURA: Record<NivelDeEstagnacao, string> = {
  ok: "border-mt-regua-fina bg-mt-surface",
  atencao: "border-mt-regua-fina border-l-[3px] border-l-mt-neutral-600 bg-mt-surface",
  estagnado: "border-mt-regua-fina border-l-[3px] border-l-mt-accent bg-mt-accent-100",
  transferir: "border-mt-accent border-l-[3px] border-l-mt-accent bg-mt-accent-100",
};

export default function CardDoLead({
  lead: l,
  nivel,
  agora,
  soOsMeus,
  aberto,
  arrastando,
  podeVoltar,
  podeAvancar,
  aoAbrir,
  aoVoltar,
  aoAvancar,
  aoConversar,
  aoComecarArrasto,
  aoTerminarArrasto,
}: {
  lead: LeadDaFila;
  nivel: NivelDeEstagnacao;
  agora: number;
  /** Quem só vê os próprios leads não lê o próprio nome em cada card. */
  soOsMeus: boolean;
  /** Este é o lead aberto no detalhe. */
  aberto: boolean;
  arrastando: boolean;
  podeVoltar: boolean;
  podeAvancar: boolean;
  aoAbrir: (id: string) => void;
  aoVoltar: () => void;
  aoAvancar: () => void;
  /** O link da conversa foi aberto: registra o contato. */
  aoConversar: (lead: LeadDaFila) => void;
  aoComecarArrasto: (e: React.DragEvent<HTMLDivElement>) => void;
  aoTerminarArrasto: () => void;
}) {
  const aviso = AVISO_DE_ESTAGNACAO[nivel];
  // O id da conversa vem na resposta de `/api/leads/gerenciar`. Existindo, o
  // link abre o Chatwoot; senão cai no WhatsApp, com a mensagem já escrita.
  const conversa = linkDeConversa(
    l.telefone,
    mensagemParaCliente(l, { vendedor: l.responsavel }),
    l.chatwoot_conversation_id,
  );
  const destino = destinoDaConversa(l.telefone, l.chatwoot_conversation_id);
  const telefone = formatarTelefone(l.telefone);
  const etiquetas = l.etiquetas ?? [];
  const ultima = l.ultima_interacao ?? null;
  const passo = (l.proximo_passo ?? "").trim();
  const atrasado = passo !== "" && situacaoDoPasso(l.proximo_passo_vence_em, agora) === "atrasado";
  const transferencias = seloCurtoDeTransferencias(l.transferencias);

  return (
    <div
      draggable
      data-lead={l.id}
      onDragStart={aoComecarArrasto}
      onDragEnd={aoTerminarArrasto}
      onClick={() => aoAbrir(l.id)}
      className={`flex cursor-pointer flex-col gap-2 border p-3 ${MOLDURA[nivel]} ${
        arrastando ? "opacity-40" : ""
      } ${aberto ? "outline-2 -outline-offset-2 outline-mt-ink" : ""}`}
    >
      <div className="flex flex-col gap-1">
        {/* O nome é o botão que abre o detalhe pelo teclado. Do tamanho do
            nome, e não da largura do card: o que sobra é por onde se pega o
            card para arrastar. */}
        <button
          type="button"
          data-abre-lead={l.id}
          aria-expanded={aberto}
          onClick={(e) => {
            e.stopPropagation();
            aoAbrir(l.id);
          }}
          className="mt-foco max-w-full cursor-pointer self-start border-0 bg-transparent p-0 text-left text-[13px] font-extrabold tracking-[-.01em] text-mt-ink [overflow-wrap:anywhere]"
        >
          {l.nome}
        </button>
        {l.interesse && (
          // O interesse pode ser a mensagem livre do cliente: duas linhas aqui,
          // inteiro no detalhe.
          <div title={l.interesse} className="line-clamp-2 text-[11px] leading-snug text-mt-neutral-800 [overflow-wrap:anywhere]">
            {l.interesse}
          </div>
        )}
        {aviso && (
          <div
            className={`text-[10px] font-semibold uppercase tracking-[.08em] ${
              nivel === "atencao" ? "text-mt-neutral-700" : "text-mt-accent-800"
            }`}
          >
            {aviso} há {formatarPrazo(minutosParado(l, agora))}
          </div>
        )}
        {etiquetas.length > 0 && (
          // Só leitura, numa linha: o que não couber fica para o detalhe, que
          // é onde as etiquetas se editam.
          <ul
            role="list"
            aria-label={`Etiquetas de ${l.nome}, resumo`}
            className="m-0 flex list-none flex-nowrap gap-1 overflow-hidden p-0"
          >
            {etiquetas.map((e) => (
              <li
                key={e}
                className={`shrink-0 whitespace-nowrap border px-1.5 py-0.5 text-[10px] leading-none text-mt-neutral-800 ${
                  ehEtiquetaDaPassagem(e) ? "border-mt-accent" : "border-mt-regua-fina"
                }`}
              >
                {e}
              </li>
            ))}
          </ul>
        )}
      </div>

      {ultima && (
        <div className="border-t border-mt-regua-fina pt-2">
          <div className="text-[9px] font-semibold uppercase tracking-[.12em] text-mt-neutral-600">
            {rotuloDaUltimaInteracao(ultima, agora)}
          </div>
          {ultima.texto && (
            <p className="m-0 mt-1 line-clamp-2 text-[11px] leading-[1.4] text-mt-neutral-800 [overflow-wrap:anywhere]">
              {ultima.texto}
            </p>
          )}
        </div>
      )}

      {passo ? (
        <div className={`border-l-2 bg-mt-bg px-2 py-[7px] ${atrasado ? "border-mt-accent" : "border-mt-regua"}`}>
          <div
            className={`text-[9px] font-extrabold uppercase tracking-[.12em] tabular-nums ${
              atrasado ? "text-mt-accent-800" : "text-mt-neutral-700"
            }`}
          >
            → {rotuloDoPasso(l.proximo_passo_vence_em, agora, "card") ?? "SEM DATA"}
          </div>
          <div className="mt-1 text-[11px] font-semibold leading-snug text-mt-ink [overflow-wrap:anywhere]">{passo}</div>
        </div>
      ) : (
        <div className="border-l-2 border-mt-regua-fina bg-mt-bg px-2 py-[7px] text-[9px] font-semibold uppercase tracking-[.12em] text-mt-neutral-600">
          Sem próximo passo
        </div>
      )}

      <div className="flex items-stretch gap-1">
        {conversa ? (
          <a
            href={conversa}
            target="_blank"
            rel="noopener noreferrer"
            draggable={false}
            onClick={(e) => {
              e.stopPropagation();
              aoConversar(l);
            }}
            className="mt-foco flex min-w-0 flex-1 items-center justify-center gap-1.5 border border-mt-accent px-2 py-1 text-[11px] font-semibold text-mt-accent hover:bg-mt-accent-100 pointer-coarse:min-h-11"
          >
            {/* O rótulo diz para ONDE vai: no WhatsApp a mensagem já vai
                escrita; no Chatwoot o consultor digita. */}
            {destino === "chatwoot" ? "Chatwoot" : "WhatsApp"}
            <span className="truncate font-normal tabular-nums text-mt-neutral-700">{telefone}</span>
          </a>
        ) : (
          <span className="flex min-w-0 flex-1 items-center px-1 text-[11px] tabular-nums text-mt-neutral-700">
            {telefone || "Sem telefone"}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            aoVoltar();
          }}
          disabled={!podeVoltar}
          aria-label={`Voltar ${l.nome} uma etapa`}
          className="mt-foco cursor-pointer border border-mt-regua-fina px-[9px] py-1 text-[11px] text-mt-neutral-700 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-30 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        >
          ←
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            aoAvancar();
          }}
          disabled={!podeAvancar}
          aria-label={`Avançar ${l.nome} uma etapa`}
          className="mt-foco cursor-pointer border border-mt-regua-fina px-[9px] py-1 text-[11px] text-mt-neutral-700 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-30 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        >
          →
        </button>
      </div>

      <div className="flex items-center gap-1.5 text-[10px] text-mt-neutral-800">
        {!soOsMeus && (
          <>
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 shrink-0 items-center justify-center text-[9px] font-extrabold ${
                l.responsavel ? "bg-mt-ink text-mt-bg" : "border border-dashed border-mt-regua text-mt-neutral-500"
              }`}
            >
              {l.responsavel ? iniciais(l.responsavel) : ""}
            </span>
            <span className="min-w-0 truncate">{l.responsavel || "Sem responsável"}</span>
          </>
        )}
        <span className="ml-auto shrink-0 uppercase tracking-[.06em] tabular-nums text-mt-neutral-600">
          {transferencias && `${transferencias} · `}
          {espera(l.created_at, agora)}
        </span>
      </div>
    </div>
  );
}
