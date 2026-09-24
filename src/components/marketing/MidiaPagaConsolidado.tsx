"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  consolidarTotais,
  derivarMetricas,
  FAIXAS_SAUDAVEIS,
  type LeituraTotais,
} from "../../lib/midiaPaga";
import type { EstadoSincronizacao } from "../../lib/midiaSync";

/**
 * Tela A13 do design doc — mídia paga, Meta e Google no mesmo painel.
 *
 * Desde 2026-09-24 os números vêm das plataformas (spec
 * `2026-09-24-midia-paga-sincronizada-design.md`): o Meta é puxado de hora
 * em hora, o Google chega pelo script colado na conta. Não há cadastro
 * manual. O lead aparece em DUAS réguas lado a lado — o que a plataforma
 * reporta e o que chegou no nosso banco com a UTM da campanha — porque a
 * diferença entre elas já é diagnóstico.
 */

interface Anuncio {
  id: string;
  nome: string;
  leitura: LeituraTotais | null;
}

type Plataforma = "meta" | "google";

interface Campanha {
  id: string;
  nome: string;
  plataforma: Plataforma;
  origem: "manual" | "meta" | "google";
  objetivo: string | null;
  situacao: "no_ar" | "pausada" | "planejada" | "encerrada";
  anuncios: Anuncio[];
  leituraCampanha: LeituraTotais | null;
  /** `null` = tabela de leads indisponível. */
  leadsBanco: number | null;
}

interface Resposta {
  campanhas: Campanha[];
  janela: { de: string; ate: string };
  leadsSemCampanha: number | null;
  sincronizacao: Record<Plataforma, EstadoSincronizacao>;
}

const ROTULO_SITUACAO: Record<Campanha["situacao"], { texto: string; classe: string }> = {
  no_ar: { texto: "NO AR", classe: "border border-mt-regua-fina text-mt-neutral-800" },
  pausada: { texto: "PAUSADA", classe: "bg-mt-accent-100 border border-mt-accent-300 text-mt-accent-800" },
  planejada: { texto: "PLANEJADA", classe: "border border-mt-regua text-mt-neutral-700" },
  encerrada: { texto: "ENCERRADA", classe: "border border-mt-regua-fina text-mt-neutral-500" },
};

const NOME_PLATAFORMA: Record<Plataforma, string> = { meta: "Meta", google: "Google" };

const brl = (v: number) =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brlInteiro = (v: number) =>
  "R$ " + Math.round(v).toLocaleString("pt-BR");
const inteiro = (v: number) => Math.round(v).toLocaleString("pt-BR");
const custoPor = (investido: number, leads: number | null) =>
  leads && leads > 0 ? investido / leads : null;

function haQuanto(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

const hora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** "2026-09-24" → "24/09", sem passar por `Date` (que mudaria o dia pelo fuso). */
const diaMes = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

const ZERO: LeituraTotais = { investido: 0, impressoes: 0, alcance: 0, cliques: 0, conversas: 0 };

function somar(a: LeituraTotais, b: LeituraTotais): LeituraTotais {
  return {
    investido: a.investido + b.investido,
    impressoes: a.impressoes + b.impressoes,
    alcance: 0, // alcance não soma entre campanhas
    cliques: a.cliques + b.cliques,
    conversas: a.conversas + b.conversas,
  };
}

type Filtro = "consolidado" | Plataforma;
const PERIODOS = [7, 14, 30] as const;

export default function MidiaPagaConsolidado() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("consolidado");
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(7);
  const [sincronizando, setSincronizando] = useState(false);

  const carregar = async (periodo: number) => {
    setCarregando(true);
    setErro("");
    try {
      const res = await fetch(`/api/marketing/campanhas?dias=${periodo}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar campanhas");
      setDados(data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar(dias);
  }, [dias]);

  const sincronizarMeta = async () => {
    setSincronizando(true);
    setErro("");
    setAviso("");
    try {
      const res = await fetch("/api/marketing/sincronizar/meta", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "A sincronização do Meta falhou");
      setAviso(`Meta sincronizado: ${data.campanhas} campanha(s), ${data.dias} linha(s) de dia.`);
      await carregar(dias);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      await carregar(dias);
    } finally {
      setSincronizando(false);
    }
  };

  const campanhas = useMemo(() => dados?.campanhas ?? [], [dados]);

  const visiveis = useMemo(
    () => campanhas.filter((c) => filtro === "consolidado" || c.plataforma === filtro),
    [campanhas, filtro],
  );

  const totaisPorCampanha = useMemo(() => {
    const m = new Map<string, LeituraTotais>();
    for (const c of campanhas) {
      m.set(c.id, consolidarTotais(c.anuncios.map((a) => a.leitura), c.leituraCampanha));
    }
    return m;
  }, [campanhas]);

  const totalDe = (lista: Campanha[]) =>
    lista.reduce((acc, c) => somar(acc, totaisPorCampanha.get(c.id) ?? ZERO), ZERO);
  const leadsBancoDe = (lista: Campanha[]) =>
    lista.some((c) => c.leadsBanco === null) ? null : lista.reduce((n, c) => n + (c.leadsBanco ?? 0), 0);

  const totalGeral = totalDe(visiveis);
  const leadsBancoGeral = leadsBancoDe(visiveis);
  const metricasGerais = derivarMetricas(totalGeral);

  const corDoCusto = (v: number | null) =>
    v !== null && v > FAIXAS_SAUDAVEIS.custoPorLeadMax ? "text-mt-accent" : "text-mt-accent-800";

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      {/* Cabeçalho na anatomia do doc */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-regua pb-5">
        <div className="flex flex-col gap-1.5">
          <div className="mt-rotulo mt-rotulo-accent">Marketing</div>
          <h1 className="mt-titulo text-3xl md:text-4xl">Mídia paga</h1>
          <p className="mt-1 max-w-[640px] text-sm text-mt-neutral-800">
            Meta e Google na mesma régua, direto das plataformas: investimento, lead e custo
            por lead. O lead aparece duas vezes — o que a plataforma conta e o que chegou no
            nosso banco com a UTM da campanha.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="mt-seg">
            {PERIODOS.map((p) => (
              <label key={p} className="mt-seg-opt">
                <input type="radio" name="periodo-midia" checked={dias === p} onChange={() => setDias(p)} />
                <span>{p} dias</span>
              </label>
            ))}
          </div>
          <div className="mt-seg">
            {(["consolidado", "meta", "google"] as const).map((f) => (
              <label key={f} className="mt-seg-opt">
                <input type="radio" name="filtro-midia" checked={filtro === f} onChange={() => setFiltro(f)} />
                <span>{f === "consolidado" ? "Consolidado" : NOME_PLATAFORMA[f]}</span>
              </label>
            ))}
          </div>
          <button
            onClick={sincronizarMeta}
            disabled={sincronizando}
            className="mt-btn mt-btn-primario mt-foco cursor-pointer px-4 py-2.5 text-[11px]"
          >
            {sincronizando ? "Sincronizando…" : "Sincronizar Meta agora"}
          </button>
        </div>
      </div>

      {/* Estado da sincronização, por plataforma */}
      {dados && (
        <div className="flex flex-col gap-1.5 text-[12px] sm:flex-row sm:gap-6">
          {(["meta", "google"] as const).map((p) => {
            const s = dados.sincronizacao[p];
            return (
              <div key={p} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-extrabold">{NOME_PLATAFORMA[p]}</span>
                {s.ultimaOk ? (
                  <span className={s.parada ? "text-mt-accent-800" : "text-mt-neutral-700"}>
                    sincronizado {haQuanto(s.ultimaOk)}
                  </span>
                ) : (
                  <span className="text-mt-accent-800">
                    {p === "google" ? "aguardando o script da conta do Google Ads" : "ainda não sincronizou"}
                  </span>
                )}
                {s.falha && (
                  <span className="text-mt-accent">
                    · falhou {hora(s.falha.em)}: {s.falha.erro}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {erro && (
        <div className="flex items-center gap-2 border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800">
          {erro}
        </div>
      )}
      {aviso && (
        <div className="border-l-[3px] border-mt-ink bg-mt-surface px-4 py-3 text-xs text-mt-neutral-800">{aviso}</div>
      )}

      {carregando && !dados ? (
        <div className="py-16 text-center text-xs text-mt-neutral-700">Carregando campanhas…</div>
      ) : campanhas.length === 0 ? (
        <div className="border border-dashed border-mt-regua-fina bg-mt-surface p-10 text-center">
          <div className="text-[15px] font-extrabold tracking-[-.01em] text-mt-ink">
            Nenhuma campanha sincronizada ainda
          </div>
          <p className="mx-auto mt-2 max-w-[460px] text-xs leading-relaxed text-mt-neutral-700">
            O Meta entra sozinho de hora em hora — ou agora, pelo botão &quot;Sincronizar Meta
            agora&quot;. O Google entra quando o script estiver colado na conta do Google Ads.
          </p>
        </div>
      ) : (
        <>
          {/* Régua de KPIs (anatomia A10/A13) */}
          <div className="grid select-none grid-cols-2 border-t-2 border-mt-regua lg:grid-cols-5">
            {[
              {
                rotulo: `Investido · ${dias} dias`,
                valor: brl(totalGeral.investido),
                cor: "text-mt-ink",
                nota: filtro === "consolidado" ? "todas as plataformas" : NOME_PLATAFORMA[filtro],
              },
              {
                rotulo: "Leads · plataforma",
                valor: inteiro(totalGeral.conversas),
                cor: "text-mt-ink",
                nota: "o que Meta e Google atribuem",
              },
              {
                rotulo: "Leads · no banco",
                valor: leadsBancoGeral === null ? "—" : inteiro(leadsBancoGeral),
                cor: "text-mt-ink",
                nota:
                  dados?.leadsSemCampanha
                    ? `+ ${dados.leadsSemCampanha} com UTM de outra origem`
                    : "chegaram com a UTM da campanha",
              },
              (() => {
                const v = custoPor(totalGeral.investido, totalGeral.conversas);
                return {
                  rotulo: "R$/lead · plataforma",
                  valor: v === null ? "—" : brlInteiro(v),
                  cor: corDoCusto(v),
                  nota: `faixa saudável: até ${brlInteiro(FAIXAS_SAUDAVEIS.custoPorLeadMax)}`,
                };
              })(),
              (() => {
                const v = custoPor(totalGeral.investido, leadsBancoGeral);
                return {
                  rotulo: "R$/lead · no banco",
                  valor: v === null ? "—" : brlInteiro(v),
                  cor: corDoCusto(v),
                  nota: "o custo que de fato chegou",
                };
              })(),
            ].map((kpi) => (
              <div key={kpi.rotulo} className="flex flex-col gap-2 border-b border-mt-regua-fina py-4 pr-5 lg:border-b-0 lg:border-r lg:pl-5 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0">
                <span className="mt-rotulo">{kpi.rotulo}</span>
                <span className={`text-2xl font-extrabold tracking-[-.03em] tabular-nums ${kpi.cor}`}>{kpi.valor}</span>
                <span className="text-[11px] leading-tight text-mt-neutral-700">{kpi.nota}</span>
              </div>
            ))}
          </div>

          {/* Desempenho por plataforma */}
          {filtro === "consolidado" && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {(["meta", "google"] as const).map((p) => {
                const daPlataforma = campanhas.filter((c) => c.plataforma === p);
                const t = totalDe(daPlataforma);
                const banco = leadsBancoDe(daPlataforma);
                const noAr = daPlataforma.filter((c) => c.situacao === "no_ar").length;
                const cpl = custoPor(t.investido, t.conversas);
                return (
                  <div key={p} className={`border border-mt-regua-fina border-l-[3px] p-5 ${p === "meta" ? "border-l-mt-ink" : "border-l-mt-accent"}`}>
                    <div className="flex items-baseline gap-3">
                      <span className="text-base font-extrabold tracking-[-.01em]">
                        {p === "meta" ? "Meta Ads" : "Google Ads"}
                      </span>
                      <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${noAr > 0 ? "border border-mt-regua-fina text-mt-neutral-800" : "bg-mt-accent-100 border border-mt-accent-300 text-mt-accent-800"}`}>
                        {noAr > 0 ? `${noAr} no ar` : "Nenhuma no ar"}
                      </span>
                    </div>
                    <div className="mt-4 flex">
                      {[
                        { l: "Investido", v: brl(t.investido) },
                        { l: "Leads", v: `${inteiro(t.conversas)} / ${banco === null ? "—" : banco}` },
                        { l: "R$/lead", v: cpl === null ? "—" : brlInteiro(cpl) },
                        { l: "Cliques", v: inteiro(t.cliques) },
                      ].map((m) => (
                        <div key={m.l} className="flex-1 border-r border-mt-regua-fina pl-4 pr-4 first:pl-0 last:border-r-0 last:pr-0">
                          <div className="mt-rotulo">{m.l}</div>
                          <div className="mt-1.5 text-lg font-extrabold tracking-[-.03em] tabular-nums">{m.v}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-[11px] text-mt-neutral-700">Leads: plataforma / no banco</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Campanhas */}
          <div>
            <div className="mb-3 flex items-baseline gap-3">
              <div className="mt-rotulo">Campanhas</div>
              <span className="ml-auto text-[11px] text-mt-neutral-700">
                {dados ? `${diaMes(dados.janela.de)} a ${diaMes(dados.janela.ate)}` : ""}
                {carregando ? " · atualizando…" : ""}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="mt-tabela">
                <thead>
                  <tr>
                    <th>Campanha</th>
                    <th>Investido</th>
                    <th>Leads plat.</th>
                    <th>Leads banco</th>
                    <th>R$/lead plat.</th>
                    <th>R$/lead banco</th>
                    <th>Cliques</th>
                    <th>Situação</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((c) => {
                    const t = totaisPorCampanha.get(c.id) ?? ZERO;
                    const cplPlat = custoPor(t.investido, t.conversas);
                    const cplBanco = custoPor(t.investido, c.leadsBanco);
                    // A plataforma contou lead e o banco não recebeu nenhum:
                    // quase sempre é a UTM do anúncio sem o ID da campanha.
                    const semUtm = t.conversas > 0 && c.leadsBanco === 0;
                    const sit = ROTULO_SITUACAO[c.situacao];
                    return (
                      <tr key={c.id}>
                        <td>
                          <div className="font-extrabold tracking-[-.01em]">{c.nome}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-mt-neutral-700">
                            <span className="border border-mt-regua-fina px-1.5 text-[9px] font-bold uppercase tracking-wider">
                              {c.origem === "manual" ? "Manual (histórico)" : NOME_PLATAFORMA[c.plataforma]}
                            </span>
                            {c.objetivo ? <span>{c.objetivo}</span> : null}
                          </div>
                        </td>
                        <td className="mt-num">{brl(t.investido)}</td>
                        <td className="mt-num">{inteiro(t.conversas)}</td>
                        <td className="mt-num">
                          {c.leadsBanco === null ? "—" : c.leadsBanco}
                          {semUtm && (
                            <div className="text-[10px] font-semibold text-mt-accent" title="Confira utm_campaign={{campaign.id}} (Meta) ou {campaignid} (Google) no anúncio">
                              sem UTM?
                            </div>
                          )}
                        </td>
                        <td className={`mt-num font-extrabold ${corDoCusto(cplPlat)}`}>
                          {cplPlat === null ? "—" : brlInteiro(cplPlat)}
                        </td>
                        <td className={`mt-num font-extrabold ${corDoCusto(cplBanco)}`}>
                          {cplBanco === null ? "—" : brlInteiro(cplBanco)}
                        </td>
                        <td className="mt-num">{inteiro(t.cliques)}</td>
                        <td>
                          <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${sit.classe}`}>{sit.texto}</span>
                        </td>
                        <td className="text-right">
                          <Link
                            href={`/admin/marketing/midia-paga/${c.id}`}
                            className="mt-foco text-[11px] font-extrabold tracking-[.1em] text-mt-ink underline-offset-4 hover:text-mt-accent"
                          >
                            ABRIR
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Funil do anúncio ao lead — visita e venda entram com o kanban de leads */}
          <div className="max-w-[560px]">
            <div className="mb-3 flex items-baseline gap-3">
              <div className="mt-rotulo mt-rotulo-accent">Do anúncio ao lead</div>
              <span className="ml-auto text-[11px] text-mt-neutral-700">
                visita e venda entram com o kanban de leads
              </span>
            </div>
            {[
              { l: "Impressões", v: totalGeral.impressoes, taxa: "" },
              {
                l: "Cliques",
                v: totalGeral.cliques,
                taxa: metricasGerais.ctr !== null ? `CTR ${(metricasGerais.ctr * 100).toFixed(2).replace(".", ",")}%` : "",
              },
              {
                l: "Leads (plataforma)",
                v: totalGeral.conversas,
                taxa:
                  metricasGerais.cliqueParaConversa !== null
                    ? `${(metricasGerais.cliqueParaConversa * 100).toFixed(1).replace(".", ",")}% dos cliques`
                    : "",
              },
            ].map((f, i) => (
              <div key={f.l} className="border-b border-mt-regua-fina py-3">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-[13px] font-extrabold">{f.l}</span>
                  <span className="text-[11px] text-mt-neutral-700">{f.taxa}</span>
                  <span className="ml-auto text-lg font-extrabold tracking-[-.03em] tabular-nums">
                    {inteiro(f.v)}
                  </span>
                </div>
                <div className="mt-2 h-2.5 bg-mt-neutral-300/40">
                  <div
                    className={`h-2.5 ${i === 2 ? "bg-mt-accent" : "bg-mt-ink"}`}
                    style={{
                      width:
                        totalGeral.impressoes > 0 ? `${Math.max(2, (f.v / totalGeral.impressoes) * 100)}%` : "0%",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
