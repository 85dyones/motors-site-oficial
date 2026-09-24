"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  avaliarInstrumentos,
  consolidarTotais,
  derivarMetricas,
  diagnosticar,
  leituraImatura,
  portoesAprendizagem,
  IMPRESSOES_MINIMAS_LEITURA,
  type LeituraTotais,
} from "../../lib/midiaPaga";

/**
 * Tela A14 do design doc — leitura da campanha.
 *
 * Desde 2026-09-24 os números vêm da plataforma (Meta por anúncio, Google
 * pela campanha), somados da vida inteira da campanha: é a régua dos portões
 * de aprendizagem. Instrumentos, portões e diagnóstico continuam saindo de
 * `lib/midiaPaga.ts`, nunca daqui. O que continua sendo digitado é só o
 * registro de ajustes — a API não sabe POR QUE alguém mexeu na campanha.
 */

interface Anuncio {
  id: string;
  nome: string;
  totais: LeituraTotais | null;
}

interface Ajuste {
  id: string;
  descricao: string;
  autor_nome: string | null;
  registrado_em: string;
}

interface Campanha {
  id: string;
  nome: string;
  plataforma: "meta" | "google";
  origem: "manual" | "meta" | "google";
  objetivo: string | null;
  orcamento_diario: number | null;
  publico: string | null;
  atribuicao: string | null;
  situacao: "no_ar" | "pausada" | "planejada" | "encerrada";
  no_ar_desde: string | null;
  sincronizado_em: string | null;
}

interface DiaDoGrafico {
  dia: string;
  investido: number;
  conversas: number;
}

const ROTULO_SITUACAO: Record<Campanha["situacao"], string> = {
  no_ar: "No ar",
  pausada: "Pausada",
  planejada: "Planejada",
  encerrada: "Encerrada",
};

const brl = (v: number) =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pct = (v: number) => (v * 100).toFixed(2).replace(".", ",") + "%";

const dataCurta = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const diaMes = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

const ZERO: LeituraTotais = { investido: 0, impressoes: 0, alcance: 0, cliques: 0, conversas: 0 };

export default function LeituraCampanha({ campanhaId }: { campanhaId: string }) {
  const [campanha, setCampanha] = useState<Campanha | null>(null);
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [leituraCampanha, setLeituraCampanha] = useState<LeituraTotais | null>(null);
  const [diario, setDiario] = useState<DiaDoGrafico[]>([]);
  const [leadsBanco, setLeadsBanco] = useState<number | null>(null);
  const [ajustes, setAjustes] = useState<Ajuste[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [novoAjuste, setNovoAjuste] = useState("");
  const [registrandoAjuste, setRegistrandoAjuste] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    setErro("");
    try {
      const res = await fetch(`/api/marketing/campanhas/${campanhaId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar a campanha");
      setCampanha(data.campanha);
      setAnuncios(data.anuncios);
      setLeituraCampanha(data.leituraCampanha);
      setDiario(data.diario);
      setLeadsBanco(data.leadsBanco);
      setAjustes(data.ajustes);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campanhaId]);

  const totais = useMemo(
    () => consolidarTotais(anuncios.map((a) => a.totais), leituraCampanha),
    [anuncios, leituraCampanha],
  );

  const metricas = useMemo(() => derivarMetricas(totais), [totais]);

  const horasNoAr = useMemo(() => {
    if (!campanha?.no_ar_desde) return null;
    const h = (Date.now() - new Date(campanha.no_ar_desde).getTime()) / 36e5;
    return h >= 0 ? h : null;
  }, [campanha?.no_ar_desde]);

  const orcamento = campanha?.orcamento_diario != null ? Number(campanha.orcamento_diario) : null;

  const portoes = useMemo(
    () => portoesAprendizagem(totais, horasNoAr, orcamento),
    [totais, horasNoAr, orcamento],
  );

  const instrumentos = useMemo(() => avaliarInstrumentos(metricas), [metricas]);

  const diagnosticos = useMemo(
    () =>
      diagnosticar(
        anuncios.map((a) => ({ nome: a.nome, totais: a.totais ?? ZERO })),
        totais,
        metricas,
        portoes,
        horasNoAr,
        orcamento,
      ),
    [anuncios, totais, metricas, portoes, horasNoAr, orcamento],
  );

  const imatura = leituraImatura(portoes);
  const temLeitura = totais.impressoes > 0 || totais.investido > 0;
  const maiorDia = Math.max(0, ...diario.map((d) => d.investido));

  const registrarAjuste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoAjuste.trim()) return;
    setRegistrandoAjuste(true);
    setErro("");
    try {
      const res = await fetch(`/api/marketing/campanhas/${campanhaId}/ajustes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descricao: novoAjuste.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao registrar ajuste");
      setNovoAjuste("");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setRegistrandoAjuste(false);
    }
  };

  if (carregando && !campanha) {
    return <div className="py-16 text-center text-xs text-mt-neutral-700">Carregando campanha…</div>;
  }
  if (!campanha) {
    return (
      <div className="py-16 text-center text-xs text-mt-neutral-700">
        {erro || "Campanha não encontrada."}{" "}
        <Link href="/admin/marketing/midia-paga" className="font-semibold text-mt-accent underline">
          Voltar ao consolidado
        </Link>
      </div>
    );
  }

  const nomePlataforma = campanha.plataforma === "meta" ? "Meta Ads" : "Google Ads";
  const configuracao = [
    campanha.publico,
    campanha.atribuicao ? `Atribuição: ${campanha.atribuicao}` : null,
    orcamento ? `${brl(orcamento)}/dia` : null,
    campanha.plataforma === "meta" ? `${anuncios.length} anúncio(s)` : null,
    campanha.no_ar_desde ? `no ar desde ${dataCurta(campanha.no_ar_desde).slice(0, 5)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-regua pb-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="mt-rotulo mt-rotulo-accent">
            {nomePlataforma}
            {campanha.objetivo ? ` · ${campanha.objetivo}` : ""}
          </div>
          <h1 className="mt-titulo text-3xl md:text-4xl">{campanha.nome}</h1>
          {configuracao && <p className="mt-1 text-sm text-mt-neutral-800">{configuracao}</p>}
          <Link
            href="/admin/marketing/midia-paga"
            className="mt-1 text-[11px] font-extrabold tracking-[.1em] text-mt-neutral-700 hover:text-mt-accent"
          >
            ← MÍDIA PAGA
          </Link>
        </div>
        <div className="flex flex-none items-center gap-3">
          <div className="flex flex-col items-end gap-1">
            <span className="border border-mt-regua-fina px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-mt-neutral-800">
              {ROTULO_SITUACAO[campanha.situacao]}
            </span>
            <span className="text-[11px] text-mt-neutral-700">
              {campanha.sincronizado_em
                ? `sincronizado ${dataCurta(campanha.sincronizado_em)}`
                : "sem sincronização"}
            </span>
          </div>
          <div className="border border-mt-regua-fina px-4 py-3">
            <div className="mt-rotulo">Investido até agora</div>
            <div className="mt-1 text-2xl font-extrabold tracking-[-.04em] tabular-nums">{brl(totais.investido)}</div>
            <div className="mt-0.5 text-[11px] text-mt-neutral-700">
              {Math.round(totais.conversas)} lead(s) na plataforma · {leadsBanco === null ? "—" : leadsBanco} no banco
            </div>
          </div>
        </div>
      </div>

      {erro && (
        <div className="border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800">{erro}</div>
      )}

      {!temLeitura && (
        <div className="border border-dashed border-mt-regua-fina bg-mt-surface p-6 text-center text-xs text-mt-neutral-700">
          A campanha ainda não entregou nenhuma impressão. Os números aparecem aqui na próxima
          sincronização depois que ela começar a rodar.
        </div>
      )}

      {/* Fase de aprendizagem */}
      {temLeitura && imatura && (
        <div className="border border-mt-regua-fina border-l-[3px] border-l-mt-accent p-5">
          <div className="flex flex-wrap items-baseline gap-3">
            <h3 className="text-sm font-extrabold tracking-[.12em] text-mt-accent-800">FASE DE APRENDIZAGEM</h3>
            <span className="bg-mt-accent-100 border border-mt-accent-300 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-mt-accent-800">
              Leitura imatura
            </span>
            <span className="ml-auto max-w-[52ch] text-right text-xs text-mt-neutral-800">
              Qualquer pausa, troca de criativo ou mexida de orçamento agora reinicia a aprendizagem do conjunto.
            </span>
          </div>
          <div className="mt-4 flex flex-col gap-5 sm:flex-row">
            {portoes.map((p) => (
              <div key={p.rotulo} className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-extrabold">{p.rotulo}</span>
                  <span className="ml-auto text-xs text-mt-neutral-700 tabular-nums">
                    {p.rotulo === "Investimento"
                      ? `${brl(p.atual)} / ${brl(p.alvo)}`
                      : `${Math.round(p.atual)} / ${p.alvo}`}
                  </span>
                </div>
                <div className="mt-2 h-2 bg-mt-neutral-300/40">
                  <div className="h-2 bg-mt-accent" style={{ width: `${Math.max(2, p.fracao * 100)}%` }} />
                </div>
                <div className="mt-1.5 text-[11px] leading-snug text-mt-neutral-700">{p.descricao}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instrumentos */}
      {temLeitura && (
        <div>
          <div className="mb-3 flex items-baseline gap-3">
            <div className="mt-rotulo">Instrumentos</div>
            <span className="ml-auto text-[11px] text-mt-neutral-700">
              Faixas calibradas para revenda local · vermelho = fora da faixa saudável
            </span>
          </div>
          <div className="grid grid-cols-2 border border-mt-regua-fina sm:grid-cols-3 lg:grid-cols-6">
            {instrumentos.map((i) => {
              const valor =
                i.valor === null
                  ? "—"
                  : i.chave === "ctr" || i.chave === "cliqueParaConversa"
                    ? pct(i.valor)
                    : i.chave === "frequencia"
                      ? i.valor.toFixed(2).replace(".", ",")
                      : brl(i.valor);
              return (
                <div key={i.chave} className="border-b border-r border-mt-regua-fina p-4 last:border-r-0 lg:border-b-0">
                  <div className="mt-rotulo">{i.rotulo}</div>
                  <div
                    className={`mt-1.5 text-xl font-extrabold tracking-[-.04em] tabular-nums ${
                      i.estado === "fora" ? "text-mt-accent" : i.estado === "sem_leitura" ? "text-mt-neutral-500" : "text-mt-ink"
                    }`}
                  >
                    {valor}
                  </div>
                  <div className="mt-1 text-[11px] leading-tight text-mt-neutral-700">{i.referencia}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-8 xl:flex-row">
        <div className="min-w-0 flex-1 xl:border-r xl:border-mt-regua-fina xl:pr-7">
          {/* Criativos (só o Meta informa por anúncio) */}
          {temLeitura && anuncios.length > 0 && (
            <div className="mb-8">
              <div className="mb-3 flex items-baseline gap-3">
                <div className="mt-rotulo">Criativos · para onde o orçamento está indo</div>
                <span className="ml-auto text-[11px] text-mt-neutral-700">
                  Cinza = menos de {IMPRESSOES_MINIMAS_LEITURA} impressões, sem leitura
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="mt-tabela">
                  <thead>
                    <tr>
                      <th>Anúncio</th>
                      <th>Investido</th>
                      <th>Fatia</th>
                      <th>Impr.</th>
                      <th>CTR</th>
                      <th>CPC</th>
                      <th>Leads</th>
                      <th>R$/lead</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anuncios.map((a) => {
                      const l = a.totais;
                      if (!l) {
                        return (
                          <tr key={a.id}>
                            <td className="text-mt-neutral-500">{a.nome}</td>
                            <td colSpan={7} className="text-[11px] text-mt-neutral-500">
                              sem entrega ainda
                            </td>
                          </tr>
                        );
                      }
                      const frio = l.impressoes < IMPRESSOES_MINIMAS_LEITURA;
                      const cor = frio ? "text-mt-neutral-500" : "text-mt-ink";
                      const fatia = totais.investido > 0 ? l.investido / totais.investido : 0;
                      return (
                        <tr key={a.id}>
                          <td className={`font-semibold ${cor}`}>{a.nome}</td>
                          <td className={`mt-num ${cor}`}>{brl(l.investido)}</td>
                          <td>
                            <div className={`mt-num ${cor}`}>{(fatia * 100).toFixed(1).replace(".", ",")}%</div>
                            <div className="mt-1 h-1.5 w-[92px] bg-mt-neutral-300/40">
                              <div className={`h-1.5 ${frio ? "bg-mt-neutral-400" : "bg-mt-ink"}`} style={{ width: `${fatia * 100}%` }} />
                            </div>
                          </td>
                          <td className={`mt-num ${cor}`}>{l.impressoes.toLocaleString("pt-BR")}</td>
                          <td className={`mt-num ${cor}`}>{l.impressoes > 0 ? pct(l.cliques / l.impressoes) : "—"}</td>
                          <td className={`mt-num ${cor}`}>{l.cliques > 0 ? brl(l.investido / l.cliques) : "—"}</td>
                          <td className={`mt-num ${cor}`}>{Math.round(l.conversas)}</td>
                          <td className={`mt-num ${cor}`}>{l.conversas > 0 ? brl(l.investido / l.conversas) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t-2 border-mt-regua pt-3 text-[13px] font-extrabold">
                <span className="mr-auto">Campanha</span>
                <span className="tabular-nums">{brl(totais.investido)}</span>
                <span className="tabular-nums">{totais.impressoes.toLocaleString("pt-BR")} impr.</span>
                {metricas.ctr !== null && <span className="tabular-nums">CTR {pct(metricas.ctr)}</span>}
                <span className="tabular-nums">{Math.round(totais.conversas)} lead(s)</span>
                {metricas.custoPorConversa !== null && (
                  <span className="tabular-nums">{brl(metricas.custoPorConversa)} por lead</span>
                )}
              </div>
            </div>
          )}

          {/* Investimento por dia */}
          {diario.length > 0 && (
            <div className="border-t-2 border-mt-regua pt-5">
              <div className="mb-3 flex items-baseline gap-3">
                <div className="mt-rotulo">Investimento por dia</div>
                <span className="ml-auto text-[11px] text-mt-neutral-700">
                  barra = investido · número = leads da plataforma
                </span>
              </div>
              <div className="flex h-40 items-end gap-[3px] overflow-x-auto" role="img" aria-label="Investimento por dia">
                {diario.map((d) => (
                  <div
                    key={d.dia}
                    className="flex min-w-[14px] flex-1 flex-col items-center justify-end gap-1"
                    title={`${diaMes(d.dia)}: ${brl(d.investido)} · ${Math.round(d.conversas)} lead(s)`}
                  >
                    {d.conversas > 0 && (
                      <span className="text-[9px] font-bold tabular-nums text-mt-accent">{Math.round(d.conversas)}</span>
                    )}
                    <div
                      className="w-full bg-mt-ink"
                      style={{ height: maiorDia > 0 ? `${Math.max(2, (d.investido / maiorDia) * 120)}px` : "2px" }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-mt-neutral-700 tabular-nums">
                <span>{diaMes(diario[0].dia)}</span>
                <span>{diaMes(diario[diario.length - 1].dia)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Coluna direita: diagnóstico + ajustes */}
        <div className="w-full flex-none xl:w-[372px]">
          {temLeitura && diagnosticos.length > 0 && (
            <>
              <div className="mt-rotulo mt-rotulo-accent mb-3">Diagnóstico · o que ajustar e quando</div>
              {diagnosticos.map((d) => (
                <div key={d.titulo} className="flex gap-3 border-b border-mt-regua-fina py-3.5">
                  <div className={`w-[3px] flex-none ${d.nivel === "ESPERAR" ? "bg-mt-accent" : d.nivel === "BOM" ? "bg-mt-ink" : "bg-mt-neutral-500"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-extrabold tracking-[-.01em]">{d.titulo}</span>
                      <span
                        className={`ml-auto flex-none px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                          d.nivel === "ESPERAR"
                            ? "bg-mt-accent-100 border border-mt-accent-300 text-mt-accent-800"
                            : "border border-mt-regua-fina text-mt-neutral-700"
                        }`}
                      >
                        {d.nivel}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-mt-neutral-800">{d.problema}</p>
                    <div className="mt-2 border-l-2 border-mt-neutral-300 pl-2.5">
                      <div className="mt-rotulo">Ajuste sugerido</div>
                      <p className="mt-0.5 text-xs leading-relaxed text-mt-ink">{d.ajuste}</p>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          <div className={temLeitura && diagnosticos.length > 0 ? "mt-6 border-t-2 border-mt-regua pt-4" : ""}>
            <div className="mt-rotulo mb-3">Registro de ajustes</div>
            <form onSubmit={registrarAjuste} className="flex gap-2">
              <input
                value={novoAjuste}
                onChange={(e) => setNovoAjuste(e.target.value)}
                placeholder="Ex.: subiu o diário de R$ 20 para R$ 30"
                className="mt-campo-caixa"
              />
              <button
                type="submit"
                disabled={registrandoAjuste || !novoAjuste.trim()}
                className="mt-btn mt-btn-tinta mt-foco flex-none cursor-pointer px-4 py-2.5 text-[11px]"
              >
                Registrar
              </button>
            </form>
            {ajustes.length === 0 ? (
              <p className="mt-3 text-[11px] leading-relaxed text-mt-neutral-700">
                A plataforma mostra o número, não o motivo. Cada mexida registrada aqui vira uma
                marca — é o que permite dizer depois o que causou a variação.
              </p>
            ) : (
              <div className="mt-2">
                {ajustes.map((a) => (
                  <div key={a.id} className="flex gap-3 border-b border-mt-regua-fina py-2.5 text-[13px]">
                    <span className="min-w-0 flex-1 leading-snug">
                      {a.descricao}
                      {a.autor_nome && <span className="text-mt-neutral-700"> · {a.autor_nome}</span>}
                    </span>
                    <span className="flex-none text-[11px] text-mt-neutral-700 tabular-nums">{dataCurta(a.registrado_em)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
