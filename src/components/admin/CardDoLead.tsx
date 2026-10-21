"use client";

import { useState } from "react";
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
import { podeEnviarAoNey, seloDaTemperatura, seloDoNey } from "../../lib/atendimentoNaTela";
import { minutosEsperando, nivelDaEspera, textoDaEspera, type NivelDaEspera } from "../../lib/conversaNoCard";
import { EMOJI_DA_TEMPERATURA, SELO_DA_TEMPERATURA } from "./lead/temperaturaNaTela";
import { irParaAConversa } from "./lead/irParaAConversa";

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

/**
 * O selo do cliente esperando resposta (21/10/2026): âmbar até 10 minutos,
 * vermelho cheio dali em diante — escolha do dono. As cores são as da
 * temperatura (`--mt-morno`) e o acento.
 */
export const SELO_DA_ESPERA: Record<NivelDaEspera, string> = {
  esperando: "border-mt-morno bg-mt-morno-100 text-mt-morno",
  atrasada: "border-mt-accent bg-mt-accent text-mt-inverso",
};

/** O selo do Ney: tinta cheia conversando, contorno reaquecendo. */
export const SELO_DO_NEY: Record<"conversando" | "reaquecendo", string> = {
  conversando: "border-mt-ink bg-mt-ink text-mt-bg",
  reaquecendo: "border-mt-ink bg-transparent text-mt-ink",
};

/** O resultado do "Enviar ao Ney", que o quadro devolve ao card. */
export type ResultadoDoEnvioAoNey = { ok: boolean; texto: string };

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
  aoEnviarAoNey,
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
  /** "Enviar ao Ney" confirmado: o "Ney retoma agora" do detalhe. Sem ele, o card não oferece o botão. */
  aoEnviarAoNey?: (lead: LeadDaFila) => Promise<ResultadoDoEnvioAoNey>;
  aoComecarArrasto: (e: React.DragEvent<HTMLDivElement>) => void;
  aoTerminarArrasto: () => void;
}) {
  const aviso = AVISO_DE_ESTAGNACAO[nivel];
  // Com conversa pelo WhatsApp da loja (`tem_conversa`, de
  // `/api/leads/gerenciar`), o botão abre a conversa no painel — o papel que
  // era do Chatwoot até 2026-10-21. Sem conversa, o WhatsApp, com a mensagem
  // já escrita.
  const conversa = linkDeConversa(l.telefone, mensagemParaCliente(l, { vendedor: l.responsavel }));
  const destino = destinoDaConversa(l.telefone, l.tem_conversa);
  const telefone = formatarTelefone(l.telefone);
  const etiquetas = l.etiquetas ?? [];
  const ultima = l.ultima_interacao ?? null;
  const passo = (l.proximo_passo ?? "").trim();
  const atrasado = passo !== "" && situacaoDoPasso(l.proximo_passo_vence_em, agora) === "atrasado";
  const transferencias = seloCurtoDeTransferencias(l.transferencias);
  // O atendimento por IA (2026-10-20): a temperatura que o assistente leu e
  // se ele está com a conversa agora. Um lead "Novo" parado há uma hora que
  // está com o assistente não é um lead abandonado — o selo diz isso.
  const temperatura = seloDaTemperatura(l.temperatura, l.aquecimento);
  // O Ney no card e a conversa (21/10/2026): "uma visualização clara sobre
  // leads que estão com o Ney, assim como as mensagens, para não precisar
  // abrir cada um". O selo do Ney, o do cliente esperando (âmbar, vermelho aos
  // 10 minutos) e a última mensagem.
  const ney = seloDoNey(l, new Date(agora));
  const nivelDaResposta = nivelDaEspera(minutosEsperando(l, agora));
  const ultimaMensagem = l.ultima_mensagem ?? null;
  const ofereceONey = Boolean(aoEnviarAoNey) && podeEnviarAoNey(l);
  // Dois toques: o envio escreve ao cliente, e o tablet do balcão erra dedo.
  const [confirmandoNey, setConfirmandoNey] = useState(false);
  const [enviandoAoNey, setEnviandoAoNey] = useState(false);
  const [retornoDoNey, setRetornoDoNey] = useState<ResultadoDoEnvioAoNey | null>(null);
  const enviarAoNey = async () => {
    if (!aoEnviarAoNey || enviandoAoNey) return;
    setEnviandoAoNey(true);
    try {
      setRetornoDoNey(await aoEnviarAoNey(l));
    } finally {
      setEnviandoAoNey(false);
      setConfirmandoNey(false);
    }
  };

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
        {(temperatura || ney) && (
          <div className="flex flex-wrap items-center gap-1">
            {temperatura && (
              <span
                data-temperatura={l.temperatura}
                className={`border px-1.5 py-0.5 text-[9px] font-extrabold uppercase leading-none tracking-[.1em] tabular-nums ${
                  l.temperatura ? SELO_DA_TEMPERATURA[l.temperatura] : "border-mt-regua-fina text-mt-neutral-700"
                }`}
              >
                {l.temperatura && <span aria-hidden="true">{EMOJI_DA_TEMPERATURA[l.temperatura]} </span>}
                {temperatura}
              </span>
            )}
            {ney && (
              <span
                data-ney={ney.tom}
                className={`border px-1.5 py-0.5 text-[9px] font-extrabold uppercase leading-none tracking-[.1em] tabular-nums ${SELO_DO_NEY[ney.tom]}`}
              >
                <span aria-hidden="true">🤖 </span>
                {ney.texto}
              </span>
            )}
          </div>
        )}
        {nivelDaResposta && (
          <div
            data-espera={nivelDaResposta}
            className={`self-start border px-1.5 py-0.5 text-[10px] font-extrabold uppercase leading-none tracking-[.08em] tabular-nums ${SELO_DA_ESPERA[nivelDaResposta]}`}
          >
            <span aria-hidden="true">💬 </span>
            {textoDaEspera(l, agora)}
          </div>
        )}
        {ultimaMensagem && (
          // A última mensagem da conversa, de quem for: o card responde "o que
          // está acontecendo aqui?" sem abrir o lead.
          <p
            data-ultima-mensagem={ultimaMensagem.autor}
            title={ultimaMensagem.texto}
            className="m-0 line-clamp-2 text-[11px] leading-[1.4] text-mt-neutral-800 [overflow-wrap:anywhere]"
          >
            <span className="font-semibold text-mt-ink">{ultimaMensagem.quem}:</span> {ultimaMensagem.texto}{" "}
            <span className="tabular-nums text-mt-neutral-600">· {espera(ultimaMensagem.criado_em, agora)}</span>
          </p>
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
        {destino === "painel" ? (
          <button
            type="button"
            draggable={false}
            onClick={(e) => {
              e.stopPropagation();
              aoAbrir(l.id);
              irParaAConversa(l.id);
            }}
            className="mt-foco flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 border border-mt-accent bg-transparent px-2 py-1 text-[11px] font-semibold text-mt-accent hover:bg-mt-accent-100 pointer-coarse:min-h-11"
          >
            {/* A conversa pelo WhatsApp da loja, no painel: responder ali fica registrado. */}
            Conversa
            <span className="truncate font-normal tabular-nums text-mt-neutral-700">{telefone}</span>
          </button>
        ) : conversa ? (
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
            {/* O rótulo diz para ONDE vai: no WhatsApp a mensagem já vai escrita. */}
            WhatsApp
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

      {ofereceONey && !confirmandoNey && (
        <button
          type="button"
          draggable={false}
          onClick={(e) => {
            e.stopPropagation();
            setRetornoDoNey(null);
            setConfirmandoNey(true);
          }}
          className="mt-foco cursor-pointer border border-mt-ink bg-transparent px-2 py-1 text-[11px] font-semibold text-mt-ink hover:bg-mt-bg pointer-coarse:min-h-11"
        >
          <span aria-hidden="true">🤖 </span>Enviar ao Ney
        </button>
      )}
      {ofereceONey && confirmandoNey && (
        <div
          role="group"
          aria-label={`Enviar ${l.nome} ao Ney`}
          onClick={(e) => e.stopPropagation()}
          className="flex flex-col gap-1.5 border border-mt-ink bg-mt-bg p-2"
        >
          <p className="m-0 text-[11px] leading-snug text-mt-neutral-800">
            O Ney lê a conversa e escreve na próxima rodada, de onde ela parou. O card fica nesta etapa.
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              draggable={false}
              disabled={enviandoAoNey}
              onClick={() => void enviarAoNey()}
              className="mt-foco flex-1 cursor-pointer border border-mt-ink bg-mt-ink px-2 py-1 text-[11px] font-semibold text-mt-bg disabled:cursor-wait disabled:opacity-60 pointer-coarse:min-h-11"
            >
              {enviandoAoNey ? "Enviando…" : "Confirmar"}
            </button>
            <button
              type="button"
              draggable={false}
              disabled={enviandoAoNey}
              onClick={() => setConfirmandoNey(false)}
              className="mt-foco cursor-pointer border border-mt-regua-fina bg-transparent px-2 py-1 text-[11px] text-mt-neutral-700 hover:border-mt-ink disabled:opacity-60 pointer-coarse:min-h-11"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {retornoDoNey && (
        <p
          role="status"
          className={`m-0 text-[11px] leading-snug ${retornoDoNey.ok ? "text-mt-neutral-800" : "text-mt-accent-800"}`}
        >
          {retornoDoNey.texto}
        </p>
      )}

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
