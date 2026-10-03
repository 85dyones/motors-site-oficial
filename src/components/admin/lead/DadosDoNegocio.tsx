"use client";

import { useState } from "react";
import { destinoDaConversa } from "../../../lib/funil";
import { FAIXAS_DE_ENTRADA, PAGAMENTOS_PRETENDIDOS, type CampoDosDados } from "../../../lib/gestaoDoLead";
import {
  formatarTelefone,
  linhaDoVeiculo,
  origemDoLead,
  type LeadDoDetalhe,
  type VeiculoDoLead,
} from "../../../lib/filaDoFunil";

import BlocoDaAvaliacao, { type CampoDoValorDaAvaliacao } from "../BlocoDaAvaliacao";
import BlocoDoPerfil from "../BlocoDoPerfil";
import EtiquetasDoLead from "../EtiquetasDoLead";
import { Segmentado } from "../SegmentadoDoPainel";
import TituloDeBloco from "./TituloDeBloco";

/**
 * Bloco d do detalhe: os dados do negócio.
 *
 * Mostra só o que está preenchido; o resto fica atrás de "+ adicionar dado",
 * para o bloco não virar um formulário vazio em todo lead novo. Cada campo
 * grava sozinho (ao sair do campo de texto, ao escolher numa lista) pelo
 * `PATCH /api/leads/[id]/dados`, que só aceita os cinco campos daqui.
 *
 * As etiquetas da conversa, a avaliação do site e o perfil do Profiler moravam
 * no card aberto e continuam aqui, com os mesmos componentes.
 */

type Dados = Partial<Record<CampoDosDados, string | number | null>>;

const ROTULO = "text-[10px] font-semibold uppercase tracking-[.08em] text-mt-neutral-600";
const CAMPO =
  "mt-foco w-full border border-mt-regua-fina bg-mt-surface px-2.5 py-2 text-[13px] text-mt-ink placeholder:text-mt-neutral-600 pointer-coarse:min-h-11";

export default function DadosDoNegocio({
  lead,
  veiculo,
  etiquetasDisponiveis,
  etiquetasEditaveis,
  ocupado,
  className = "",
  aoGravar,
  aoIncluirEtiqueta,
  aoRetirarEtiqueta,
  aoSalvarAvaliacao,
}: {
  lead: LeadDoDetalhe;
  veiculo: VeiculoDoLead | null;
  etiquetasDisponiveis: readonly string[];
  etiquetasEditaveis: boolean;
  ocupado: boolean;
  className?: string;
  aoGravar: (dados: Dados) => void;
  aoIncluirEtiqueta: (etiqueta: string) => void;
  aoRetirarEtiqueta: (etiqueta: string) => void;
  aoSalvarAvaliacao: (campo: CampoDoValorDaAvaliacao, valor: number | null) => void;
}) {
  const [mostrandoVazios, setMostrandoVazios] = useState(false);
  const [trocandoCarro, setTrocandoCarro] = useState(false);

  const temVeiculo = veiculo !== null || (lead.veiculo_id ?? null) !== null;
  const vazios = [
    !lead.email,
    !temVeiculo,
    !lead.carro_na_troca,
    !lead.faixa_entrada,
    !lead.pagamento_pretendido,
  ].filter(Boolean).length;
  const mostra = (preenchido: boolean) => preenchido || mostrandoVazios;

  const etiquetas = lead.etiquetas ?? [];
  const temConversa = destinoDaConversa(lead.telefone, lead.chatwoot_conversation_id) === "chatwoot";
  const origem = origemDoLead(lead);
  const telefone = formatarTelefone(lead.telefone);

  /** Grava o texto ao sair do campo, e só se mudou. */
  const aoSair = (campo: "email" | "carro_na_troca", atual: string | null | undefined) =>
    (e: React.FocusEvent<HTMLInputElement>) => {
      const novo = e.target.value.trim();
      if (novo !== (atual ?? "")) aoGravar({ [campo]: novo || null });
    };

  const gravarCarro = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const codigo = new FormData(e.currentTarget).get("codigo");
    const id = Number(String(codigo ?? "").trim());
    if (!Number.isSafeInteger(id) || id <= 0) return;
    setTrocandoCarro(false);
    aoGravar({ veiculo_id: id });
  };

  return (
    <section
      data-bloco="d"
      aria-labelledby="titulo-dos-dados"
      className={`flex flex-col gap-4 border-t border-mt-regua-fina px-6 py-5 ${className}`}
    >
      <TituloDeBloco id="titulo-dos-dados">Dados do negócio</TituloDeBloco>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className={ROTULO}>Telefone</span>
          <span className="text-[13px] tabular-nums text-mt-ink">{telefone || "Sem telefone"}</span>
        </div>

        {mostra(Boolean(lead.email)) && (
          <label className="flex flex-col gap-1">
            <span className={ROTULO}>E-mail</span>
            <input
              // A chave refaz o campo quando o valor gravado muda.
              key={lead.email ?? ""}
              type="email"
              defaultValue={lead.email ?? ""}
              onBlur={aoSair("email", lead.email)}
              autoComplete="off"
              className={CAMPO}
            />
          </label>
        )}

        {mostra(temVeiculo) && (
          <div className="flex flex-col gap-1">
            <span className={ROTULO}>Carro de interesse</span>
            {veiculo ? (
              <div className="flex items-start gap-3 border border-mt-regua-fina bg-mt-surface p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-mt-ink [overflow-wrap:anywhere]">{veiculo.nome}</div>
                  <div className="text-[11px] tabular-nums text-mt-neutral-700">{linhaDoVeiculo(veiculo)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setTrocandoCarro((v) => !v)}
                  aria-expanded={trocandoCarro}
                  className="mt-foco mt-alvo cursor-pointer border-0 bg-transparent p-0 text-[11px] text-mt-accent-hover hover:underline"
                >
                  Trocar
                </button>
              </div>
            ) : (lead.veiculo_id ?? null) !== null ? (
              <p className="m-0 text-[12px] leading-snug text-mt-neutral-700">
                O carro de código <span className="tabular-nums">{lead.veiculo_id}</span> não está mais no estoque.
              </p>
            ) : null}
            {(trocandoCarro || !veiculo) && (
              <form onSubmit={gravarCarro} className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[11px] text-mt-neutral-700">Código do carro no estoque</span>
                  <input name="codigo" type="text" inputMode="numeric" pattern="[0-9]*" required className={`${CAMPO} tabular-nums`} />
                </label>
                <button type="submit" className="mt-btn mt-btn-contorno mt-foco px-3.5 py-[9px] text-[11px] pointer-coarse:min-h-11">
                  VINCULAR
                </button>
                {temVeiculo && (
                  <button
                    type="button"
                    onClick={() => {
                      setTrocandoCarro(false);
                      aoGravar({ veiculo_id: null });
                    }}
                    className="mt-foco mt-alvo cursor-pointer border-0 bg-transparent p-0 text-[11px] text-mt-neutral-700 underline hover:text-mt-accent-hover"
                  >
                    desvincular
                  </button>
                )}
              </form>
            )}
          </div>
        )}

        {mostra(Boolean(lead.carro_na_troca)) && (
          <label className="flex flex-col gap-1">
            <span className={ROTULO}>Carro na troca</span>
            <input
              key={lead.carro_na_troca ?? ""}
              type="text"
              defaultValue={lead.carro_na_troca ?? ""}
              onBlur={aoSair("carro_na_troca", lead.carro_na_troca)}
              placeholder="Marca, modelo e ano"
              className={CAMPO}
            />
          </label>
        )}

        {mostra(Boolean(lead.faixa_entrada)) && (
          <label className="flex flex-col gap-1">
            <span className={ROTULO}>Faixa de entrada</span>
            <select
              value={lead.faixa_entrada ?? ""}
              onChange={(e) => aoGravar({ faixa_entrada: e.target.value || null })}
              className={`${CAMPO} cursor-pointer`}
            >
              <option value="">Não informada</option>
              {FAIXAS_DE_ENTRADA.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          </label>
        )}

        {mostra(Boolean(lead.pagamento_pretendido)) && (
          <div className="flex flex-col gap-1">
            <span className={ROTULO}>Forma de pagamento pretendida</span>
            <div>
              <Segmentado
                rotulo="Forma de pagamento pretendida"
                valor={(lead.pagamento_pretendido as (typeof PAGAMENTOS_PRETENDIDOS)[number]["valor"] | null) ?? null}
                // Tocar na opção marcada desmarca: o campo volta a "não informado".
                aoEscolher={(valor) => aoGravar({ pagamento_pretendido: valor === lead.pagamento_pretendido ? null : valor })}
                opcoes={PAGAMENTOS_PRETENDIDOS.map((p) => ({ valor: p.valor, rotulo: p.rotulo }))}
              />
            </div>
          </div>
        )}

        {vazios > 0 && (
          <button
            type="button"
            onClick={() => setMostrandoVazios((v) => !v)}
            aria-expanded={mostrandoVazios}
            className="mt-foco mt-alvo cursor-pointer self-start border-0 bg-transparent p-0 text-[11px] text-mt-neutral-700 hover:text-mt-accent-hover"
          >
            {mostrandoVazios ? "ocultar os dados em branco" : "+ adicionar dado"}
          </button>
        )}

        {origem && (
          <div className="flex flex-col gap-1">
            <span className={ROTULO}>Origem e campanha</span>
            <span className="text-[13px] text-mt-ink [overflow-wrap:anywhere]">{origem}</span>
          </div>
        )}
        {lead.ref && (
          <div className="flex flex-col gap-1">
            <span className={ROTULO}>Ref.</span>
            <span className="text-[13px] tabular-nums text-mt-ink">{lead.ref}</span>
          </div>
        )}
      </div>

      {(etiquetas.length > 0 || (etiquetasEditaveis && temConversa)) && (
        <div className="flex flex-col gap-1 border-t border-mt-regua-fina pt-3">
          <span className={ROTULO}>Etiquetas da conversa</span>
          <EtiquetasDoLead
            nome={lead.nome}
            etiquetas={etiquetas}
            disponiveis={etiquetasDisponiveis}
            temConversa={temConversa}
            editavel={etiquetasEditaveis}
            ocupado={ocupado}
            onIncluir={aoIncluirEtiqueta}
            onRetirar={aoRetirarEtiqueta}
          />
        </div>
      )}

      {/* O que o site coletou: a avaliação do carro do cliente e o perfil do
          Profiler. Nenhum lead tem os dois; cada bloco some quando não há o
          que mostrar. */}
      <BlocoDaAvaliacao
        nome={lead.nome}
        avaliacao={lead.avaliacao}
        valorOfertado={lead.avaliacao_valor_ofertado}
        valorPago={lead.avaliacao_valor_pago}
        onSalvar={aoSalvarAvaliacao}
      />
      <BlocoDoPerfil perfil={lead.perfil} />
    </section>
  );
}
