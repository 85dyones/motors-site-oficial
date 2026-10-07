"use client";

import { useMemo, useState } from "react";
import {
  ROTULO_CONSERVACAO,
  ROTULO_MECANICA,
  recomendarAvaliacao,
  type EstadoConservacao,
  type EstadoMecanico,
  type ParametrosDaCurva,
  type RecomendacaoAvaliacao,
} from "../../../lib/avaliacaoRecomendacao";
import type { LeituraDeKm } from "../../../lib/consultaDePlaca";
import SinalDeEstado, { COR_DO_ESTADO } from "./SinalDeEstado";

/**
 * A faixa de compra, recalculada ao vivo — usada pelas duas abas da consulta
 * (por placa e por modelo).
 *
 * É a curva de deságio vigente (`parametros_avaliacao`) e a mesma conta de
 * `/api/avaliacao` (`recomendarAvaliacao`), com o km e o estado que o
 * avaliador informa. Nenhum percentual mora aqui. Sem curva legível a tela
 * mostra a FIPE e diz que não sugere faixa: nunca uma régua inventada.
 */

const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const km = (n: number) => `${n.toLocaleString("pt-BR")} km`;
const pp = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function dataCurta(iso: string | null | undefined): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

const MECANICA: EstadoMecanico[] = ["excelente", "bom", "atencao", "ruim"];
const CONSERVACAO: EstadoConservacao[] = ["impecavel", "riscos", "reparos", "avariado"];

export interface Avaliacao {
  kmInformado: string;
  kmNumero: number | null;
  mecanica: EstadoMecanico;
  conservacao: EstadoConservacao;
  recomendacao: RecomendacaoAvaliacao | null;
  /** O deságio da faixa, quando há faixa de compra; é o que o gráfico desenha. */
  desagio: { min: number; max: number } | null;
  definirKm: (texto: string) => void;
  definirMecanica: (v: EstadoMecanico) => void;
  definirConservacao: (v: EstadoConservacao) => void;
  /** Volta ao ponto de partida: carro novo na tela, avaliação nova. */
  zerar: () => void;
}

/** O estado da avaliação e a recomendação que sai dele. */
export function useAvaliacao(fipeAtual: number | null, anoModelo: number | null, curva: ParametrosDaCurva | null): Avaliacao {
  const [kmInformado, setKmInformado] = useState("");
  const [mecanica, setMecanica] = useState<EstadoMecanico>("bom");
  const [conservacao, setConservacao] = useState<EstadoConservacao>("riscos");

  const digitos = kmInformado.replace(/\D/g, "");
  const kmNumero = /^\d{1,7}$/.test(digitos) ? Number(digitos) : null;
  const recomendacao = useMemo(
    () =>
      fipeAtual !== null
        ? recomendarAvaliacao({
            estadoMecanico: mecanica,
            estadoConservacao: conservacao,
            quilometragem: kmNumero,
            anoModelo,
            // `recomendarAvaliacao` lê a FIPE como texto com centavos.
            fipeValor: fipeAtual.toFixed(2),
            parametros: curva,
          })
        : null,
    [fipeAtual, anoModelo, mecanica, conservacao, kmNumero, curva],
  );
  const desagio = useMemo(
    () => (recomendacao && !recomendacao.acima_do_teto ? { min: recomendacao.desconto_min, max: recomendacao.desconto_max } : null),
    [recomendacao],
  );

  return {
    kmInformado,
    kmNumero,
    mecanica,
    conservacao,
    recomendacao,
    desagio,
    definirKm: (texto) => {
      const d = texto.replace(/\D/g, "").slice(0, 7);
      setKmInformado(d ? Number(d).toLocaleString("pt-BR") : "");
    },
    definirMecanica: setMecanica,
    definirConservacao: setConservacao,
    zerar: () => {
      setKmInformado("");
      setMecanica("bom");
      setConservacao("riscos");
    },
  };
}

export default function FaixaDeCompra({
  avaliacao,
  fipeAtual,
  leiturasDeKm,
  leituraAcima = null,
  semDocumento = false,
}: {
  avaliacao: Avaliacao;
  fipeAtual: number | null;
  /** As leituras de km que a consulta trouxe; `undefined` na aba por modelo, que não tem carro. */
  leiturasDeKm?: LeituraDeKm[];
  leituraAcima?: LeituraDeKm | null;
  /** A aba por modelo não conferiu documento nenhum: o aviso de pendência da curva fica. */
  semDocumento?: boolean;
}) {
  const { recomendacao } = avaliacao;
  const rotulo = "mt-rotulo";
  const dica = "m-0 text-[11px] leading-relaxed text-mt-neutral-700";
  // Na aba da placa a consulta conferiu o documento, e o aviso do site não se aplica.
  const sinais = (recomendacao?.sinais ?? []).filter((s) => semDocumento || !s.startsWith("documento e procedência"));
  const ultima = leiturasDeKm && leiturasDeKm.length > 0 ? leiturasDeKm[leiturasDeKm.length - 1] : null;

  return (
    <section aria-label="Faixa de compra" className="flex flex-col gap-4 border-t-2 border-mt-regua pt-5">
      <h2 className={`${rotulo} m-0`}>FAIXA DE COMPRA</h2>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className={rotulo}>KM NO PAINEL</span>
            <input
              className="mt-campo-caixa mt-foco w-44 tabular-nums"
              inputMode="numeric"
              value={avaliacao.kmInformado}
              onChange={(e) => avaliacao.definirKm(e.target.value)}
              placeholder="0"
            />
            <span className={dica}>
              {leiturasDeKm === undefined
                ? "Sem o km, a faixa usa só a base da curva."
                : ultima
                  ? `Última leitura registrada: ${km(ultima.km)} em ${dataCurta(ultima.data)}.`
                  : "A consulta não trouxe leitura anterior de km."}
            </span>
          </label>
          {leituraAcima && (
            <div className="flex items-start gap-3 border-l-[3px] bg-mt-surface px-3 py-2 text-xs" style={{ borderColor: COR_DO_ESTADO.impeditivo }}>
              <SinalDeEstado estado="impeditivo" />
              <span>
                O km informado é MENOR que uma leitura anterior: {km(leituraAcima.km)} em {dataCurta(leituraAcima.data)}.
                Hodômetro não anda para trás.
              </span>
            </div>
          )}
          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className={`${rotulo} mb-1.5 block`}>MECÂNICA</legend>
            <div className="mt-seg flex-wrap">
              {MECANICA.map((v) => (
                <label key={v} className="mt-seg-opt">
                  <input type="radio" name="mecanica" checked={avaliacao.mecanica === v} onChange={() => avaliacao.definirMecanica(v)} />
                  <span>{maiuscula(ROTULO_MECANICA[v].replace(/^mecânica /, ""))}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className={`${rotulo} mb-1.5 block`}>FUNILARIA</legend>
            <div className="mt-seg flex-wrap">
              {CONSERVACAO.map((v) => (
                <label key={v} className="mt-seg-opt">
                  <input type="radio" name="conservacao" checked={avaliacao.conservacao === v} onChange={() => avaliacao.definirConservacao(v)} />
                  <span>{maiuscula(ROTULO_CONSERVACAO[v].replace(/^funilaria /, ""))}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-col gap-3">
          {fipeAtual === null ? (
            <p className="m-0 text-sm text-mt-neutral-800">A consulta não trouxe o valor FIPE: não há faixa para calcular.</p>
          ) : !recomendacao ? (
            <p className="m-0 text-sm text-mt-neutral-800">
              Não deu para ler a curva de deságio vigente (<code className="font-mono">parametros_avaliacao</code>), então a
              tela não sugere faixa. A FIPE do mês é {reais(fipeAtual)}.
            </p>
          ) : (
            <>
              <div className="flex items-start gap-3">
                {/* Só o sinal de recusa: a faixa é uma conta, e um "ok" verde ao
                    lado do preço se leria como "pode comprar" num carro com impeditivo. */}
                {recomendacao.acima_do_teto && <SinalDeEstado estado="impeditivo" tamanho={28} />}
                <div className="flex flex-col">
                  {recomendacao.valor_sugerido_min !== null && recomendacao.valor_sugerido_max !== null ? (
                    <span className="mt-titulo text-2xl tabular-nums md:text-3xl" data-faixa-de-compra>
                      {recomendacao.valor_sugerido_min === recomendacao.valor_sugerido_max
                        ? reais(recomendacao.valor_sugerido_max)
                        : `${reais(recomendacao.valor_sugerido_min)} a ${reais(recomendacao.valor_sugerido_max)}`}
                    </span>
                  ) : (
                    <span className="mt-titulo text-2xl">Fora da faixa de compra</span>
                  )}
                  <span className="text-xs text-mt-neutral-800">
                    {recomendacao.faixa_label} · FIPE {reais(fipeAtual)}
                  </span>
                </div>
              </div>
              <table className="mt-tabela text-xs">
                <thead>
                  <tr>
                    <th scope="col">Componente</th>
                    <th scope="col">Por quê</th>
                    <th scope="col" className="mt-num">p.p.</th>
                  </tr>
                </thead>
                <tbody>
                  {recomendacao.componentes.map((c) => (
                    <tr key={c.nome}>
                      <td className="font-semibold">{maiuscula(c.nome)}</td>
                      <td>{c.motivo}</td>
                      <td className="mt-num">{c.pp_min === c.pp_max ? pp(c.pp_min) : `${pp(c.pp_min)} a ${pp(c.pp_max)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sinais.length > 0 && (
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs text-mt-neutral-800">
                  {sinais.map((s) => (
                    <li key={s}>{maiuscula(s)}.</li>
                  ))}
                </ul>
              )}
              <p className={dica}>
                Curva vigente desde {dataCurta(recomendacao.parametros_desde)}. Preparação e margem entram depois da
                vistoria; este é o valor da curva, antes delas.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
