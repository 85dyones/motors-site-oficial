"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LIMIAR_DE_CONFORMIDADE,
  type CondicaoDoGatilho,
  type DiaDaSerie,
  type EstadoDaSerie,
  type EstadoDoGatilho,
} from "../../lib/ciclo/gatilho";

/**
 * Tela A22 — o painel de conformidade (manual v1.1 §1.4 e §5.7).
 *
 * "O sistema deve calcular e exibir esse indicador em painel desde o primeiro
 * dia. É o número que destrava a fase seguinte — a diretoria acompanha,
 * ninguém precisa argumentar."
 *
 * Decisões de leitura, na linguagem do sistema (régua, não sombra):
 *   • dia sem revisão devida é LACUNA no gráfico, nunca zero — zero diria que
 *     ninguém cumpriu, e a diferença é exatamente o que o §5.7 protege;
 *   • dia reconstruído depois do fato (retroativa) entra atenuado, e a fração
 *     aparece por extenso — medição e reconstrução não valem o mesmo;
 *   • o gatilho aberto NÃO liga nada: a recompra continua desligada até a
 *     diretoria abrir o Bloco B (regra 5). O painel informa, não aciona.
 */

interface Resposta {
  serie: DiaDaSerie[];
  gatilho: EstadoDoGatilho;
  estado_da_serie: EstadoDaSerie;
  monitorados: number;
  ciclo_ativos: number;
}

const dataBr = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR") : "—";

function Tile({ condicao }: { condicao: CondicaoDoGatilho }) {
  const progresso = Math.min(1, condicao.alvo === 0 ? 0 : condicao.atual / condicao.alvo);
  return (
    <div className="border border-mt-regua-fina bg-mt-surface p-5">
      <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
        {condicao.rotulo}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[28px] font-extrabold tracking-[-.02em] text-mt-ink tabular-nums">
          {condicao.atual.toLocaleString("pt-BR")}
        </span>
        <span className="text-[13px] text-mt-neutral-700 tabular-nums">
          / {condicao.alvo.toLocaleString("pt-BR")} {condicao.unidade}
        </span>
        <span
          className={`ml-auto border px-2 py-0.5 text-[9px] font-semibold tracking-[.14em] ${
            condicao.atingida ? "border-mt-ink text-mt-ink" : "border-mt-regua text-mt-neutral-700"
          }`}
        >
          {condicao.atingida ? "ATINGIDA" : "EM ANDAMENTO"}
        </span>
      </div>
      {/* barra de progresso: régua fina, sem cor semântica — o chip já diz o estado */}
      <div className="mt-3 h-[3px] w-full bg-mt-regua-fina" aria-hidden="true">
        <div className="h-full bg-mt-ink" style={{ width: `${progresso * 100}%` }} />
      </div>
    </div>
  );
}

/** A série diária como SVG: lacunas honestas, retroativo atenuado, alvo em 70%. */
function GraficoDaSerie({ serie }: { serie: DiaDaSerie[] }) {
  const [foco, setFoco] = useState<DiaDaSerie | null>(null);

  const medidos = useMemo(() => serie.filter((d) => d.pct !== null), [serie]);
  const ultimoMedido = medidos.length > 0 ? medidos[medidos.length - 1] : null;

  const L = 720;
  const A = 150;
  const topo = 8;
  const base = A - 18;
  const y = (pct: number) => base - ((base - topo) * pct) / 100;
  const passo = L / Math.max(serie.length, 30); // série curta não vira barra gigante
  const larguraBarra = Math.max(1.5, Math.min(8, passo - 2));

  if (serie.length === 0) return null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${L} ${A}`}
        className="w-full"
        role="img"
        aria-label={`Conformidade diária de ${dataBr(serie[0].dia)} a ${dataBr(serie[serie.length - 1].dia)}`}
      >
        {/* grade recessiva: 0, 50 e 100 */}
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={0} x2={L} y1={y(g)} y2={y(g)} stroke="var(--mt-regua-fina)" strokeWidth={1} />
            <text x={0} y={y(g) - 3} fontSize={9} fill="var(--mt-neutral-500, #9b9797)">
              {g}
            </text>
          </g>
        ))}
        {/* o alvo do gatilho */}
        <line
          x1={0}
          x2={L}
          y1={y(LIMIAR_DE_CONFORMIDADE)}
          y2={y(LIMIAR_DE_CONFORMIDADE)}
          stroke="var(--mt-accent)"
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
        <text
          x={L}
          y={y(LIMIAR_DE_CONFORMIDADE) - 4}
          fontSize={9}
          textAnchor="end"
          fill="var(--mt-accent)"
        >
          {LIMIAR_DE_CONFORMIDADE}% — gatilho
        </text>

        {/* as barras: uma por dia MEDIDO; dia sem devidos é lacuna */}
        {serie.map((d, i) => {
          if (d.pct === null) return null;
          const x = i * passo + (passo - larguraBarra) / 2;
          return (
            <rect
              key={d.dia}
              x={x}
              y={y(d.pct)}
              width={larguraBarra}
              height={Math.max(1, base - y(d.pct))}
              rx={1}
              fill="var(--mt-ink)"
              opacity={d.retroativa ? 0.35 : 1}
            />
          );
        })}

        {/* o último dia medido, em destaque com rótulo direto */}
        {ultimoMedido ? (
          <g>
            <circle
              cx={serie.indexOf(ultimoMedido) * passo + passo / 2}
              cy={y(ultimoMedido.pct as number)}
              r={4}
              fill="var(--mt-ink)"
              stroke="var(--mt-bg)"
              strokeWidth={2}
            />
            <text
              x={Math.min(L - 4, serie.indexOf(ultimoMedido) * passo + passo / 2 + 8)}
              y={Math.max(12, y(ultimoMedido.pct as number) - 8)}
              fontSize={11}
              fontWeight={700}
              textAnchor="end"
              fill="var(--mt-ink)"
            >
              {(ultimoMedido.pct as number).toFixed(0)}%
            </text>
          </g>
        ) : null}

        {/* camada de foco: um alvo largo por dia, para o detalhe abaixo */}
        {serie.map((d, i) => (
          <rect
            key={`hit-${d.dia}`}
            x={i * passo}
            y={0}
            width={passo}
            height={A}
            fill="transparent"
            onMouseEnter={() => setFoco(d)}
            onMouseLeave={() => setFoco(null)}
          />
        ))}
      </svg>

      <div className="mt-1 flex justify-between text-[10px] text-mt-neutral-500 tabular-nums">
        <span>{dataBr(serie[0].dia)}</span>
        <span>{dataBr(serie[serie.length - 1].dia)}</span>
      </div>

      {/* a leitura do dia — camada de hover em texto, não balão flutuante */}
      <div className="mt-2 border-t border-mt-regua-fina pt-2 text-[12px] text-mt-neutral-700 tabular-nums">
        {(() => {
          const d = foco ?? ultimoMedido;
          if (!d) return "Nenhum dia medido ainda — sem veículo com revisão devida.";
          const cabec = `${dataBr(d.dia)}${d.retroativa ? " (reconstruído)" : ""}: `;
          if (d.pct === null) {
            return `${cabec}sem veículo com revisão devida — dia fora da conta.`;
          }
          return `${cabec}${d.veiculos_em_dia} de ${d.veiculos_com_revisao_devida} em dia (${d.pct.toFixed(0)}%) · ${d.veiculos_ciclo_ativo} no Ciclo.`;
        })()}
      </div>
    </div>
  );
}

export default function PainelDeConformidade() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [calculando, setCalculando] = useState(false);
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const res = await fetch("/api/ciclo/conformidade", { cache: "no-store" });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(corpo.error ?? "Não foi possível carregar o painel.");
        return;
      }
      setDados(corpo);
    } catch {
      setErro("Falha de rede ao carregar o painel.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const calcular = async () => {
    setCalculando(true);
    setAviso("");
    setErro("");
    try {
      const res = await fetch("/api/ciclo/conformidade", { method: "POST" });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(corpo.error ?? "Não foi possível calcular.");
        return;
      }
      setAviso(
        corpo.gravadas > 0
          ? `Série atualizada: ${corpo.gravadas} dia(s) gravado(s).`
          : corpo.motivo === "nenhum veiculo com Ciclo ativo"
            ? "A série começa na primeira venda com Ciclo ativo — ainda não há."
            : "Série já estava em dia.",
      );
      await carregar();
    } finally {
      setCalculando(false);
    }
  };

  const serie = dados?.serie ?? [];
  const estadoSerie = dados?.estado_da_serie;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6">
        <span className="mt-rotulo mt-rotulo-accent">MOTORS CICLO · CONFORMIDADE</span>
        <h1 className="mt-2 text-[24px] font-extrabold tracking-[-.02em] text-mt-ink">
          O número que destrava a recompra
        </h1>
        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-mt-neutral-700">
          As três condições do gatilho (§1.4), lado a lado. Enquanto qualquer uma estiver em
          andamento, a recompra segue desligada — e mesmo com as três atingidas, quem abre o
          Bloco B é a diretoria, não o sistema.
        </p>
      </header>

      {erro ? (
        <div role="alert" className="mb-4 border-l-[3px] border-mt-accent bg-mt-surface p-4 text-[13px] text-mt-ink">
          {erro}
        </div>
      ) : null}
      {aviso ? (
        <div role="status" className="mb-4 border-l-[3px] border-mt-ink bg-mt-surface p-4 text-[13px] text-mt-ink">
          {aviso}
        </div>
      ) : null}

      {carregando ? (
        <p className="text-[13px] text-mt-neutral-700">Carregando…</p>
      ) : dados ? (
        <div className="flex flex-col gap-5">
          {/* o veredito, inequívoco */}
          <div className="border border-mt-regua-fina bg-mt-surface p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`border px-3 py-1 text-[10px] font-bold tracking-[.16em] ${
                  dados.gatilho.aberto
                    ? "border-mt-ink bg-mt-ink text-mt-inverso"
                    : "border-mt-regua text-mt-neutral-700"
                }`}
              >
                {dados.gatilho.aberto ? "GATILHO ATINGIDO" : "GATILHO FECHADO"}
              </span>
              <span className="text-[13px] text-mt-neutral-700">
                {dados.gatilho.aberto
                  ? "As três condições valem. A abertura do Bloco B é decisão de diretoria."
                  : `${dados.gatilho.condicoes.filter((c) => c.atingida).length} de 3 condições atingidas.`}
              </span>
              {estadoSerie?.desatualizada ? (
                <span className="ml-auto border border-mt-accent px-2 py-0.5 text-[9px] font-semibold tracking-[.14em] text-mt-accent">
                  SÉRIE DESATUALIZADA
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {dados.gatilho.condicoes.map((c) => (
              <Tile key={c.rotulo} condicao={c} />
            ))}
          </div>

          <section className="border border-mt-regua-fina bg-mt-surface p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-[15px] font-extrabold tracking-[-.015em] text-mt-ink">
                Conformidade diária
              </h2>
              <button
                type="button"
                onClick={calcular}
                disabled={calculando}
                className="mt-foco ml-auto bg-mt-accent px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-mt-inverso disabled:opacity-50"
              >
                {calculando ? "Calculando…" : "Calcular série de hoje"}
              </button>
            </div>
            <p className="mb-4 mt-1 text-xs text-mt-neutral-700">
              {estadoSerie?.inicio
                ? `Desde ${dataBr(estadoSerie.inicio)}, atualizada até ${dataBr(estadoSerie.atualizada_ate)}.`
                : "A série começa no primeiro cálculo após a primeira venda com Ciclo ativo."}
              {estadoSerie && estadoSerie.fracao_retroativa > 0
                ? ` ${Math.round(estadoSerie.fracao_retroativa * 100)}% dos dias foram reconstruídos depois do fato — aparecem atenuados.`
                : ""}
            </p>

            {serie.length > 0 ? (
              <GraficoDaSerie serie={serie} />
            ) : (
              <p className="border border-dashed border-mt-regua-fina p-6 text-center text-[13px] text-mt-neutral-700">
                Sem série ainda. Registre a primeira venda com Ciclo e calcule — o manual manda a
                série existir desde o dia zero, mesmo vazia.
              </p>
            )}
          </section>

          <p className="text-[11px] text-mt-neutral-500">
            {dados.ciclo_ativos.toLocaleString("pt-BR")} veículo(s) com Ciclo ativo ·{" "}
            {dados.monitorados.toLocaleString("pt-BR")} com diário de bordo vivo. Telemetria
            embarcada: adiada por decisão de 2026-08-13 — o gatilho conta pela série de
            procedência (Emenda 01).
          </p>
        </div>
      ) : null}
    </div>
  );
}
