"use client";

import { useEffect, useRef, useState } from "react";
import type { Temperatura } from "../../../lib/aquecimento";
import {
  ABAS_DO_ATENDIMENTO,
  ROTULO_DA_ACAO,
  acoesDisponiveis,
  horaDaMensagem,
  linhasDaFicha,
  fotoDaMensagem,
  marcasDaMensagem,
  quemEscreveu,
  rotuloDaEntrega,
  seloDaTemperatura,
  situacaoDoAssistente,
  textoDaMensagem,
  type AbaDoAtendimento,
  type AcaoNaTela,
} from "../../../lib/atendimentoNaTela";
import { espera } from "../../../lib/funil";
import { Segmentado } from "../SegmentadoDoPainel";
import TituloDeBloco from "./TituloDeBloco";
import type { ConversaDoLead } from "./useConversaDoLead";

/**
 * Bloco a do detalhe: o atendimento pelo WhatsApp da loja (2026-10-20).
 *
 * Pedido do dono, a partir do manobrAI: *"a tela dos leads tem atendimentos
 * direto no painel, com uma aba resumo e aquecimento do lead"*. Duas abas:
 *
 *   · **Conversa** — a conversa inteira (cliente, assistente, equipe e os
 *     toques de cadência), e a caixa para responder pelo número da loja.
 *     Responder aqui tira o assistente da conversa, como no manobrAI.
 *   · **Resumo** — o resumo do assistente e a ficha (o que o cliente DISSE),
 *     a origem e a entrega.
 *
 * O aquecimento era a terceira aba; desde 2026-10-20 é o bloco q, sempre à
 * vista (`AquecimentoDoLead`). Os dois leem a mesma conversa, que o detalhe
 * busca uma vez (`useConversaDoLead`) e relê a cada 15 s. Falhou a leitura, o
 * bloco diz e o resto do detalhe segue de pé.
 */

const FAIXA_DE_ERRO = "border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800";
const FAIXA_DE_AVISO = "border-l-[3px] border-mt-regua bg-mt-surface px-4 py-3 text-xs text-mt-neutral-800";
const BOTAO_FINO =
  "mt-foco cursor-pointer border border-mt-regua-fina bg-transparent px-3 py-2 text-[11px] text-mt-neutral-800 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:min-h-11";

const COR_DA_TEMPERATURA: Record<Temperatura, string> = {
  frio: "border-mt-regua-fina text-mt-neutral-700",
  morno: "border-mt-regua text-mt-ink",
  quente: "border-mt-accent bg-mt-accent-100 text-mt-accent-800",
};

export default function AtendimentoDoLead({
  leadId,
  conversa,
  className = "",
  aoMudarOLead,
}: {
  leadId: string;
  conversa: ConversaDoLead;
  className?: string;
  /** Depois de entregar ou devolver, o detalhe relê o lead (o dono pode ter mudado). */
  aoMudarOLead?: () => void;
}) {
  const { dados, erroDeLeitura, agora, ler } = conversa;
  /** O que a pessoa fez e não deu certo (enviar, pausar): alerta. */
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aba, setAba] = useState<AbaDoAtendimento>("conversa");
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const fim = useRef<HTMLLIElement>(null);

  const totalDeMensagens = dados?.mensagens.length ?? 0;
  useEffect(() => {
    if (aba === "conversa") fim.current?.scrollIntoView?.({ block: "nearest" });
  }, [totalDeMensagens, aba]);

  async function enviar() {
    const mensagem = texto.trim();
    if (!mensagem || ocupado) return;
    setOcupado(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/leads/${encodeURIComponent(leadId)}/conversa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: mensagem }),
      });
      const corpo = (await r.json().catch(() => null)) as { error?: string; aviso?: string } | null;
      if (!r.ok) {
        setErro(corpo?.error ?? "A mensagem não saiu.");
      } else {
        setTexto("");
        setErro(null);
        if (corpo?.aviso) setAviso(corpo.aviso);
      }
    } catch {
      setErro("A mensagem não saiu.");
    } finally {
      setOcupado(false);
      await ler();
    }
  }

  async function agir(acao: AcaoNaTela) {
    if (ocupado) return;
    setOcupado(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/leads/${encodeURIComponent(leadId)}/assistente`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      });
      const corpo = (await r.json().catch(() => null)) as { error?: string; aviso?: string } | null;
      if (!r.ok) setErro(corpo?.error ?? "Não deu para mudar o assistente.");
      else {
        setErro(null);
        if (corpo?.aviso) setAviso(corpo.aviso);
        if (acao === "entregar" || acao === "devolver") aoMudarOLead?.();
      }
    } catch {
      setErro("Não deu para mudar o assistente.");
    } finally {
      setOcupado(false);
      await ler();
    }
  }

  const estado = dados?.atendimento ?? null;
  const assistente = dados?.assistente ?? null;
  const nomeDoAssistente = assistente?.nome || "Assistente";
  const selo = estado ? seloDaTemperatura(estado.temperatura, estado.aquecimento) : null;
  const acoes = estado ? acoesDisponiveis(estado) : [];

  return (
    <section data-bloco="a" aria-labelledby="titulo-do-atendimento" className={`flex flex-col gap-3 px-6 py-5 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <TituloDeBloco id="titulo-do-atendimento">Atendimento</TituloDeBloco>
        {selo && estado?.temperatura && (
          <span
            data-temperatura={estado.temperatura}
            className={`border px-1.5 py-0.5 text-[10px] font-extrabold uppercase leading-none tracking-[.08em] tabular-nums ${COR_DA_TEMPERATURA[estado.temperatura]}`}
          >
            {selo}
          </span>
        )}
      </div>

      {estado && (
        <p className="m-0 text-[11px] leading-relaxed text-mt-neutral-700">
          {situacaoDoAssistente(estado, assistente, agora)}
        </p>
      )}

      {erro && (
        <div role="alert" className={FAIXA_DE_ERRO}>
          {erro}
        </div>
      )}
      {aviso && <div className={FAIXA_DE_AVISO}>{aviso}</div>}
      {erroDeLeitura && <div className={FAIXA_DE_AVISO}>{erroDeLeitura}</div>}
      {dados?.migracaoPendente && <div className={FAIXA_DE_AVISO}>{dados.aviso ?? "O atendimento por IA ainda não foi ligado no banco."}</div>}

      <Segmentado rotulo="Aba do atendimento" opcoes={ABAS_DO_ATENDIMENTO} valor={aba} aoEscolher={setAba} />

      {aba === "conversa" && (
        <div className="flex flex-col gap-3">
          <ol
            aria-label="Conversa pelo WhatsApp da loja"
            className="m-0 flex max-h-[420px] list-none flex-col gap-2 overflow-y-auto border border-mt-regua-fina bg-mt-bg p-3"
          >
            {dados && dados.mensagens.length === 0 && (
              <li className="text-xs leading-relaxed text-mt-neutral-700">
                Nenhuma mensagem pelo WhatsApp da loja ainda. Quando o cliente escrever, a conversa aparece aqui.
              </li>
            )}
            {!dados && !erroDeLeitura && <li className="text-xs text-mt-neutral-600">Lendo a conversa…</li>}
            {dados?.mensagens.map((m) => {
              const doCliente = m.direcao === "entrada";
              const marcas = marcasDaMensagem(m);
              const foto = fotoDaMensagem(m);
              const texto = textoDaMensagem(m);
              return (
                <li key={m.id} data-autor={m.autor} className={`flex flex-col gap-1 ${doCliente ? "items-start" : "items-end"}`}>
                  <span className="text-[9px] font-semibold uppercase tracking-[.12em] text-mt-neutral-600 tabular-nums">
                    {quemEscreveu(m, nomeDoAssistente)} · {horaDaMensagem(m.criado_em, new Date(agora))}
                    {marcas.length > 0 && ` · ${marcas.join(" · ")}`}
                  </span>
                  <p
                    title={m.situacao === "falhou" && m.erro ? m.erro : undefined}
                    className={`m-0 max-w-[85%] whitespace-pre-wrap px-3 py-2 text-[13px] leading-snug [overflow-wrap:anywhere] ${
                      doCliente
                        ? "border border-mt-regua-fina bg-mt-surface text-mt-ink"
                        : m.autor === "assistente"
                          ? "border-l-2 border-mt-regua bg-mt-surface text-mt-neutral-800"
                          : "bg-mt-ink text-mt-bg"
                    } ${m.situacao === "falhou" ? "outline outline-1 outline-mt-accent" : ""}`}
                  >
                    {foto && (
                      <a href={foto} target="_blank" rel="noopener noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element -- miniatura da conversa; a foto pode ser do carro57 */}
                        <img src={foto} alt={texto || "Foto do carro"} loading="lazy" className="block max-h-40 w-auto max-w-full" />
                      </a>
                    )}
                    {texto && <span className={foto ? "mt-1 block text-[12px]" : undefined}>{texto}</span>}
                  </p>
                </li>
              );
            })}
            <li ref={fim} aria-hidden="true" className="h-0" />
          </ol>

          <div className="flex flex-col gap-2">
            <label htmlFor={`resposta-${leadId}`} className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
              Responder pelo WhatsApp da loja
            </label>
            <textarea
              id={`resposta-${leadId}`}
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void enviar();
              }}
              disabled={ocupado || assistente?.whatsapp_ligado === false}
              placeholder={
                assistente?.whatsapp_ligado === false
                  ? "O WhatsApp da loja ainda não está ligado ao painel."
                  : "Escreva para o cliente…"
              }
              className="mt-foco w-full resize-y border border-mt-regua bg-mt-surface px-3 py-2 text-[13px] text-mt-ink disabled:opacity-60"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void enviar()}
                disabled={ocupado || !texto.trim() || assistente?.whatsapp_ligado === false}
                className="mt-btn mt-btn-primario mt-foco px-4 py-[10px] text-[11px] disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:min-h-11"
              >
                ENVIAR →
              </button>
              <span className="text-[11px] leading-snug text-mt-neutral-600">
                Responder aqui conta como atendimento e tira o assistente da conversa.
              </span>
            </div>
          </div>

          {acoes.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-mt-regua-fina pt-3">
              {acoes.map((acao) => (
                <button key={acao} type="button" onClick={() => void agir(acao)} disabled={ocupado} className={BOTAO_FINO}>
                  {ROTULO_DA_ACAO[acao]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {aba === "resumo" && (
        <div className="flex flex-col gap-4">
          <div className="border border-mt-regua bg-mt-surface p-3.5">
            <div className="text-[10px] font-extrabold uppercase tracking-[.12em] text-mt-neutral-700">
              Resumo do assistente
              {estado?.resumo_ia_em && ` · há ${espera(estado.resumo_ia_em, agora)}`}
            </div>
            <p className="m-0 mt-2 text-[13px] leading-relaxed text-mt-ink [overflow-wrap:anywhere]">
              {estado?.resumo_ia?.trim() || "O assistente ainda não resumiu esta conversa."}
            </p>
          </div>

          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[12px]">
            {linhasDaFicha(estado?.qualificacao ?? null).map((linha) => (
              <div key={linha.rotulo} className="contents">
                <dt className="text-[10px] font-semibold uppercase tracking-[.1em] text-mt-neutral-600">{linha.rotulo}</dt>
                <dd className={`m-0 [overflow-wrap:anywhere] ${linha.valor ? "text-mt-ink" : "text-mt-neutral-500"}`}>
                  {linha.valor ?? "não disse"}
                </dd>
              </div>
            ))}
          </dl>

          {(estado?.origem_conversa || estado?.entregue_em || estado?.optout_em) && (
            <ul className="m-0 flex list-none flex-col gap-1 border-t border-mt-regua-fina p-0 pt-3 text-[11px] leading-relaxed text-mt-neutral-800">
              {estado?.origem_conversa?.titulo && (
                <li>
                  Veio do anúncio: <strong>{estado.origem_conversa.titulo}</strong>
                </li>
              )}
              {estado?.entregue_em && (
                <li>
                  {rotuloDaEntrega(estado.entregue_motivo) ?? "Entregue"} há {espera(estado.entregue_em, agora)}
                  {estado.aviso_de_entrega_para && estado.aviso_de_entrega_para !== "administrador"
                    ? ` · resumo enviado a ${estado.aviso_de_entrega_para}`
                    : estado.aviso_de_entrega_para
                      ? " · resumo enviado a quem distribui"
                      : " · resumo aguardando o horário de aviso"}
                  {estado.entrega_confirmada_em && ` · confirmado há ${espera(estado.entrega_confirmada_em, agora)}`}
                </li>
              )}
              {estado?.optout_em && <li>O cliente pediu para não receber mensagens há {espera(estado.optout_em, agora)}.</li>}
            </ul>
          )}
        </div>
      )}

    </section>
  );
}
