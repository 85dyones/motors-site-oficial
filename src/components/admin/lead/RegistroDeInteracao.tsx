"use client";

import {
  RESULTADOS_DA_LIGACAO,
  ROTULO_DA_INTERACAO,
  ROTULO_DO_RESULTADO,
  TIPOS_DE_INTERACAO,
  diaNaLoja,
  type SugestaoDePasso,
} from "../../../lib/gestaoDoLead";
import {
  PLACEHOLDER_DO_REGISTRO,
  comDia,
  comSugestao,
  comTipo,
  estadoDoRegistro,
  type FormDoRegistro,
} from "../../../lib/filaDoFunil";
import { ChipDeFiltro, Segmentado } from "../SegmentadoDoPainel";

import TituloDeBloco from "./TituloDeBloco";

/** Os chips de data. O dia de cada um é `diaNaLoja(agora, dias)`. */
const DIAS_RAPIDOS = [
  { rotulo: "Hoje", dias: 0 },
  { rotulo: "Amanhã", dias: 1 },
  { rotulo: "Em 3 dias", dias: 3 },
  { rotulo: "Próx. semana", dias: 7 },
] as const;

/**
 * Bloco c do detalhe: registrar uma interação e, com ela, o próximo passo.
 *
 * Enquanto o lead está aberto, todo registro define o próximo passo. O botão
 * REGISTRAR e a dica ao lado saem de `estadoDoRegistro`, que valida com
 * `decidirInteracao`: a mesma função da rota. O botão só habilita para o que
 * o servidor aceita.
 *
 * O formulário mora em quem monta o detalhe, porque outros blocos o começam:
 * CONCLUIR, Remarcar, LIGAR e o link da conversa.
 */
export default function RegistroDeInteracao({
  form,
  aoMudar,
  aberto,
  sugestoes,
  agora,
  registrando,
  refDoTexto,
  className = "",
  aoRegistrar,
}: {
  form: FormDoRegistro;
  aoMudar: (form: FormDoRegistro) => void;
  /** Lead fechado dispensa o próximo passo. */
  aberto: boolean;
  /** As duas sugestões da etapa, como a API as devolveu. */
  sugestoes: readonly SugestaoDePasso[];
  agora: number;
  registrando: boolean;
  refDoTexto: React.RefObject<HTMLTextAreaElement | null>;
  className?: string;
  aoRegistrar: () => void;
}) {
  const estado = estadoDoRegistro(form, { aberto }, agora);
  const passoVazio = form.passo.trim() === "";

  return (
    <section
      data-bloco="c"
      aria-labelledby="titulo-do-registro"
      className={`flex flex-col gap-3 border-t border-mt-regua-fina px-6 py-5 ${className}`}
    >
      <TituloDeBloco id="titulo-do-registro">Registrar interação</TituloDeBloco>

      <Segmentado
        rotulo="Tipo de registro"
        valor={form.tipo}
        aoEscolher={(tipo) => aoMudar(comTipo(form, tipo))}
        opcoes={TIPOS_DE_INTERACAO.map((t) => ({ valor: t, rotulo: ROTULO_DA_INTERACAO[t] }))}
      />

      {form.tipo === "ligacao" && (
        <div role="group" aria-label="Resultado da ligação" className="flex flex-wrap gap-2">
          {RESULTADOS_DA_LIGACAO.map((r) => {
            const ativo = form.resultado === r;
            return (
              <button
                key={r}
                type="button"
                aria-pressed={ativo}
                onClick={() => aoMudar({ ...form, resultado: ativo ? null : r })}
                className={`mt-foco cursor-pointer border px-3.5 py-2.5 text-[12px] font-semibold pointer-coarse:min-h-11 ${
                  ativo
                    ? "border-mt-accent bg-mt-accent-100 text-mt-accent-800"
                    : "border-mt-regua-fina text-mt-neutral-800 hover:border-mt-accent"
                }`}
              >
                {ROTULO_DO_RESULTADO[r]}
              </button>
            );
          })}
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="sr-only">O que aconteceu</span>
        <textarea
          ref={refDoTexto}
          value={form.texto}
          onChange={(e) => aoMudar({ ...form, texto: e.target.value })}
          rows={3}
          placeholder={PLACEHOLDER_DO_REGISTRO[form.tipo]}
          className="mt-foco w-full resize-y border border-mt-regua bg-mt-surface p-2.5 text-[13px] leading-snug text-mt-ink placeholder:text-mt-neutral-600"
        />
      </label>

      <fieldset className="m-0 flex min-w-0 flex-col gap-2.5 border border-mt-regua-fina bg-mt-bg p-3">
        <legend className="mt-rotulo px-1">Próximo passo · {aberto ? "obrigatório" : "opcional"}</legend>

        {passoVazio && sugestoes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sugestoes.map((s) => (
              <button
                key={s.texto}
                type="button"
                onClick={() => aoMudar(comSugestao(form, s))}
                className="mt-foco cursor-pointer border border-dashed border-mt-regua bg-transparent px-2.5 py-2 text-left text-[11px] text-mt-neutral-800 hover:border-mt-accent hover:text-mt-ink pointer-coarse:min-h-11"
              >
                + {s.texto} · <span className="tabular-nums">{s.quando}</span>
              </button>
            ))}
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="sr-only">O que fazer em seguida</span>
          <input
            type="text"
            value={form.passo}
            onChange={(e) => aoMudar({ ...form, passo: e.target.value })}
            placeholder="O que fazer em seguida"
            className="mt-foco w-full border border-mt-regua bg-mt-surface px-2.5 py-2 text-[13px] text-mt-ink placeholder:text-mt-neutral-600"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Dia do próximo passo" className="flex flex-wrap gap-2">
            {DIAS_RAPIDOS.map((d) => {
              const dia = diaNaLoja(agora, d.dias);
              const ativo = form.dia === dia;
              return (
                <ChipDeFiltro key={d.rotulo} ativo={ativo} aoAlternar={() => aoMudar(ativo ? { ...form, dia: "" } : comDia(form, dia))}>
                  {d.rotulo}
                </ChipDeFiltro>
              );
            })}
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-mt-neutral-700">
            <span>Dia</span>
            <input
              type="date"
              value={form.dia}
              onChange={(e) => aoMudar(e.target.value ? comDia(form, e.target.value) : { ...form, dia: "" })}
              className="mt-foco border border-mt-regua-fina bg-mt-surface px-2 py-1.5 text-[12px] tabular-nums text-mt-ink pointer-coarse:min-h-11"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-mt-neutral-700">
            <span>Hora</span>
            <input
              type="time"
              value={form.hora}
              onChange={(e) => aoMudar({ ...form, hora: e.target.value })}
              className="mt-foco border border-mt-regua-fina bg-mt-surface px-2 py-1.5 text-[12px] tabular-nums text-mt-ink pointer-coarse:min-h-11"
            />
          </label>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={aoRegistrar}
          disabled={!estado.pode || registrando}
          className="mt-btn mt-btn-primario mt-foco px-5 py-3 text-[12px]"
        >
          {registrando ? "REGISTRANDO…" : "REGISTRAR →"}
        </button>
        <p aria-live="polite" className="m-0 min-w-0 flex-1 text-[11px] leading-snug text-mt-neutral-700 [overflow-wrap:anywhere]">
          {estado.dica}
        </p>
      </div>
    </section>
  );
}
