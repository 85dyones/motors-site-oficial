"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  consolidarTotais,
  derivarMetricas,
  FAIXAS_SAUDAVEIS,
  type LeituraTotais,
} from "../../lib/midiaPaga";

/**
 * Tela A13 do design doc — mídia paga, Meta e Google no mesmo painel.
 *
 * Toda a leitura vem das tabelas `midia_*`, digitadas na tela da campanha
 * (A14). Dois números do doc ficam de fora de propósito: "visitas à loja" e
 * "vendas atribuídas" dependem do kanban de leads, que ainda não existe —
 * mostrar um traço com a explicação vale mais que uma coluna inventada.
 */

interface Anuncio {
  id: string;
  nome: string;
  leitura: (LeituraTotais & { registrado_em: string }) | null;
}

interface Campanha {
  id: string;
  nome: string;
  plataforma: "meta" | "google";
  objetivo: string | null;
  orcamento_diario: number | null;
  situacao: "no_ar" | "pausada" | "planejada" | "encerrada";
  no_ar_desde: string | null;
  anuncios: Anuncio[];
  leituraCampanha: (LeituraTotais & { registrado_em: string }) | null;
}

const ROTULO_SITUACAO: Record<Campanha["situacao"], { texto: string; classe: string }> = {
  no_ar: { texto: "NO AR", classe: "border border-mt-regua-fina text-mt-neutral-800" },
  pausada: { texto: "PAUSADA", classe: "bg-mt-accent-100 border border-mt-accent-300 text-mt-accent-800" },
  planejada: { texto: "PLANEJADA", classe: "border border-mt-regua text-mt-neutral-700" },
  encerrada: { texto: "ENCERRADA", classe: "border border-mt-regua-fina text-mt-neutral-500" },
};

const brl = (v: number) =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brlInteiro = (v: number) =>
  "R$ " + Math.round(v).toLocaleString("pt-BR");

type Filtro = "consolidado" | "meta" | "google";

export default function MidiaPagaConsolidado() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("consolidado");
  const [criando, setCriando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [form, setForm] = useState({
    nome: "",
    plataforma: "meta" as "meta" | "google",
    objetivo: "",
    orcamento_diario: "",
    publico: "",
    atribuicao: "",
    no_ar_desde: "",
    anuncios: "",
  });

  const carregar = async () => {
    setCarregando(true);
    setErro("");
    try {
      const res = await fetch("/api/marketing/campanhas");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar campanhas");
      setCampanhas(data.campanhas ?? []);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visiveis = useMemo(
    () => campanhas.filter((c) => filtro === "consolidado" || c.plataforma === filtro),
    [campanhas, filtro],
  );

  const totaisPorCampanha = useMemo(() => {
    const m = new Map<string, LeituraTotais>();
    for (const c of campanhas) {
      m.set(
        c.id,
        consolidarTotais(
          c.anuncios.map((a) => a.leitura),
          c.leituraCampanha,
        ),
      );
    }
    return m;
  }, [campanhas]);

  const totalGeral = useMemo(() => {
    const zero: LeituraTotais = { investido: 0, impressoes: 0, alcance: 0, cliques: 0, conversas: 0 };
    return visiveis.reduce((acc, c) => {
      const t = totaisPorCampanha.get(c.id) ?? zero;
      return {
        investido: acc.investido + t.investido,
        impressoes: acc.impressoes + t.impressoes,
        alcance: 0, // alcance não soma entre campanhas
        cliques: acc.cliques + t.cliques,
        conversas: acc.conversas + t.conversas,
      };
    }, zero);
  }, [visiveis, totaisPorCampanha]);

  const totalPlataforma = (p: "meta" | "google"): LeituraTotais => {
    const zero: LeituraTotais = { investido: 0, impressoes: 0, alcance: 0, cliques: 0, conversas: 0 };
    return campanhas
      .filter((c) => c.plataforma === p)
      .reduce((acc, c) => {
        const t = totaisPorCampanha.get(c.id) ?? zero;
        return {
          investido: acc.investido + t.investido,
          impressoes: acc.impressoes + t.impressoes,
          alcance: 0,
          cliques: acc.cliques + t.cliques,
          conversas: acc.conversas + t.conversas,
        };
      }, zero);
  };

  const custoPorLead =
    totalGeral.conversas > 0 ? totalGeral.investido / totalGeral.conversas : null;
  const metricasGerais = derivarMetricas(totalGeral);

  const criarCampanha = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch("/api/marketing/campanhas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome,
          plataforma: form.plataforma,
          objetivo: form.objetivo || null,
          orcamento_diario: form.orcamento_diario
            ? parseFloat(form.orcamento_diario.replace(",", "."))
            : null,
          publico: form.publico || null,
          atribuicao: form.atribuicao || null,
          no_ar_desde: form.no_ar_desde ? new Date(form.no_ar_desde).toISOString() : null,
          anuncios: form.anuncios.split("\n"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao criar campanha");
      setCriando(false);
      setForm({ nome: "", plataforma: "meta", objetivo: "", orcamento_diario: "", publico: "", atribuicao: "", no_ar_desde: "", anuncios: "" });
      await carregar();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const rotuloCampo = "text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700";

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      {/* Cabeçalho na anatomia do doc */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-regua pb-5">
        <div className="flex flex-col gap-1.5">
          <div className="mt-rotulo mt-rotulo-accent">Marketing</div>
          <h1 className="mt-titulo text-3xl md:text-4xl">Mídia paga</h1>
          <p className="mt-1 max-w-[640px] text-sm text-mt-neutral-800">
            Meta e Google na mesma régua: investimento, lead e custo por lead. Enquanto as
            APIs de anúncio não estão conectadas, os números entram pela leitura manual de
            cada campanha — e o painel inteiro recalcula.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="mt-seg">
            {(["consolidado", "meta", "google"] as const).map((f) => (
              <label key={f} className="mt-seg-opt">
                <input
                  type="radio"
                  name="filtro-midia"
                  checked={filtro === f}
                  onChange={() => setFiltro(f)}
                />
                <span>{f === "consolidado" ? "Consolidado" : f === "meta" ? "Meta" : "Google"}</span>
              </label>
            ))}
          </div>
          <button
            onClick={() => setCriando((v) => !v)}
            className="mt-btn mt-btn-primario mt-foco cursor-pointer px-4 py-2.5 text-[11px]"
          >
            {criando ? "Fechar" : "Nova campanha"}
          </button>
        </div>
      </div>

      {erro && (
        <div className="flex items-center gap-2 border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800">
          {erro}
        </div>
      )}

      {/* Cadastro de campanha — espelha os campos que a A14 exibe */}
      {criando && (
        <form onSubmit={criarCampanha} className="border border-mt-regua-fina bg-mt-surface p-5">
          <div className="mt-rotulo mb-4">Nova campanha</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label className={rotuloCampo} htmlFor="mc-nome">Nome</label>
              <input id="mc-nome" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="mt-campo-caixa" placeholder="Carros até 85K" />
            </div>
            <div className="flex flex-col gap-1">
              <span className={rotuloCampo}>Plataforma</span>
              <div className="mt-seg">
                {(["meta", "google"] as const).map((p) => (
                  <label key={p} className="mt-seg-opt">
                    <input type="radio" name="mc-plataforma" checked={form.plataforma === p} onChange={() => setForm({ ...form, plataforma: p })} />
                    <span>{p === "meta" ? "Meta" : "Google"}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className={rotuloCampo} htmlFor="mc-objetivo">Objetivo</label>
              <input id="mc-objetivo" value={form.objetivo} onChange={(e) => setForm({ ...form, objetivo: e.target.value })} className="mt-campo-caixa" placeholder="Conversas · WhatsApp" />
            </div>
            <div className="flex flex-col gap-1">
              <label className={rotuloCampo} htmlFor="mc-orcamento">Orçamento diário (R$)</label>
              <input id="mc-orcamento" inputMode="decimal" value={form.orcamento_diario} onChange={(e) => setForm({ ...form, orcamento_diario: e.target.value })} className="mt-campo-caixa" placeholder="30,00" />
            </div>
            <div className="flex flex-col gap-1">
              <label className={rotuloCampo} htmlFor="mc-noar">No ar desde</label>
              <input id="mc-noar" type="datetime-local" value={form.no_ar_desde} onChange={(e) => setForm({ ...form, no_ar_desde: e.target.value })} className="mt-campo-caixa" />
            </div>
            <div className="flex flex-col gap-1">
              <label className={rotuloCampo} htmlFor="mc-publico">Público e recorte</label>
              <input id="mc-publico" value={form.publico} onChange={(e) => setForm({ ...form, publico: e.target.value })} className="mt-campo-caixa" placeholder="Curitiba + 30 km · 25–65 · Advantage+" />
            </div>
            <div className="flex flex-col gap-1">
              <label className={rotuloCampo} htmlFor="mc-atrib">Atribuição</label>
              <input id="mc-atrib" value={form.atribuicao} onChange={(e) => setForm({ ...form, atribuicao: e.target.value })} className="mt-campo-caixa" placeholder="1 dia visualização · 7 dias clique" />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className={rotuloCampo} htmlFor="mc-anuncios">Anúncios · um por linha</label>
              <textarea id="mc-anuncios" rows={3} value={form.anuncios} onChange={(e) => setForm({ ...form, anuncios: e.target.value })} className="mt-campo-caixa resize-y" placeholder={"Uno Mille\nSPIN\nSaveiro"} />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setCriando(false)} className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[11px]">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="mt-btn mt-btn-primario mt-foco cursor-pointer px-5 py-2.5 text-[11px]">
              {salvando ? "Salvando…" : "Criar campanha"}
            </button>
          </div>
        </form>
      )}

      {carregando ? (
        <div className="py-16 text-center text-xs text-mt-neutral-700">Carregando campanhas…</div>
      ) : campanhas.length === 0 ? (
        <div className="border border-dashed border-mt-regua-fina bg-mt-surface p-10 text-center">
          <div className="text-[15px] font-extrabold tracking-[-.01em] text-mt-ink">
            Nenhuma campanha registrada
          </div>
          <p className="mx-auto mt-2 max-w-[460px] text-xs leading-relaxed text-mt-neutral-700">
            Registre a campanha como ela está no gerenciador (nome, orçamento, anúncios) e
            digite a primeira leitura na tela da campanha. O consolidado nasce daí.
          </p>
        </div>
      ) : (
        <>
          {/* Régua de KPIs (anatomia A10/A13) */}
          <div className="grid select-none grid-cols-2 border-t-2 border-mt-regua lg:grid-cols-5">
            {[
              { rotulo: "Investido · leitura atual", valor: brl(totalGeral.investido), cor: "text-mt-ink", nota: filtro === "consolidado" ? "todas as plataformas" : filtro },
              { rotulo: "Leads (conversas)", valor: String(totalGeral.conversas), cor: "text-mt-ink", nota: "conversa iniciada = lead" },
              {
                rotulo: "Custo por lead",
                valor: custoPorLead === null ? "—" : brlInteiro(custoPorLead),
                cor:
                  custoPorLead !== null && custoPorLead > FAIXAS_SAUDAVEIS.custoPorLeadMax
                    ? "text-mt-accent"
                    : "text-mt-accent-800",
                nota: `faixa saudável: até ${brlInteiro(FAIXAS_SAUDAVEIS.custoPorLeadMax)}`,
              },
              { rotulo: "Visitas à loja", valor: "—", cor: "text-mt-neutral-500", nota: "depende do kanban de leads" },
              { rotulo: "Vendas atribuídas", valor: "—", cor: "text-mt-neutral-500", nota: "depende do kanban de leads" },
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
                const t = totalPlataforma(p);
                const qtd = campanhas.filter((c) => c.plataforma === p).length;
                const cpl = t.conversas > 0 ? t.investido / t.conversas : null;
                return (
                  <div key={p} className={`border border-mt-regua-fina border-l-[3px] p-5 ${p === "meta" ? "border-l-mt-ink" : "border-l-mt-accent"}`}>
                    <div className="flex items-baseline gap-3">
                      <span className="text-base font-extrabold tracking-[-.01em]">
                        {p === "meta" ? "Meta Ads" : "Google Ads"}
                      </span>
                      <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${qtd > 0 ? "border border-mt-regua-fina text-mt-neutral-800" : "bg-mt-accent-100 border border-mt-accent-300 text-mt-accent-800"}`}>
                        {qtd > 0 ? `${qtd} campanha(s)` : "Sem campanha"}
                      </span>
                    </div>
                    <div className="mt-4 flex">
                      {[
                        { l: "Investido", v: brl(t.investido) },
                        { l: "Leads", v: String(t.conversas) },
                        { l: "R$/lead", v: t.conversas > 0 && cpl !== null ? brlInteiro(cpl) : "—" },
                        { l: "Cliques", v: t.cliques.toLocaleString("pt-BR") },
                      ].map((m) => (
                        <div key={m.l} className="flex-1 border-r border-mt-regua-fina pl-4 pr-4 first:pl-0 last:border-r-0 last:pr-0">
                          <div className="mt-rotulo">{m.l}</div>
                          <div className="mt-1.5 text-lg font-extrabold tracking-[-.03em] tabular-nums">{m.v}</div>
                        </div>
                      ))}
                    </div>
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
                Lead = conversa iniciada · abra a campanha para atualizar a leitura
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="mt-tabela">
                <thead>
                  <tr>
                    <th>Campanha</th>
                    <th>Investido</th>
                    <th>Leads</th>
                    <th>R$/lead</th>
                    <th>Cliques</th>
                    <th>Situação</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((c) => {
                    const t = totaisPorCampanha.get(c.id)!;
                    const cpl = t.conversas > 0 ? t.investido / t.conversas : null;
                    const sit = ROTULO_SITUACAO[c.situacao];
                    return (
                      <tr key={c.id}>
                        <td>
                          <div className="font-extrabold tracking-[-.01em]">{c.nome}</div>
                          <div className="mt-0.5 text-[11px] text-mt-neutral-700">
                            {c.plataforma === "meta" ? "Meta" : "Google"}
                            {c.objetivo ? ` · ${c.objetivo}` : ""}
                          </div>
                        </td>
                        <td className="mt-num">{brl(t.investido)}</td>
                        <td className="mt-num">{t.conversas}</td>
                        <td className={`mt-num font-extrabold ${cpl !== null && cpl > FAIXAS_SAUDAVEIS.custoPorLeadMax ? "text-mt-accent" : ""}`}>
                          {cpl === null ? "—" : brlInteiro(cpl)}
                        </td>
                        <td className="mt-num">{t.cliques.toLocaleString("pt-BR")}</td>
                        <td>
                          <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${sit.classe}`}>{sit.texto}</span>
                        </td>
                        <td className="text-right">
                          <Link
                            href={`/admin/marketing/midia-paga/${c.id}`}
                            className="mt-foco text-[11px] font-extrabold tracking-[.1em] text-mt-ink underline-offset-4 hover:text-mt-accent"
                          >
                            ABRIR LEITURA
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Funil do anúncio à conversa — as etapas de visita e venda entram
              quando houver kanban de leads */}
          <div className="max-w-[560px]">
            <div className="mb-3 flex items-baseline gap-3">
              <div className="mt-rotulo mt-rotulo-accent">Do anúncio à conversa</div>
              <span className="ml-auto text-[11px] text-mt-neutral-700">
                visita e venda entram com o kanban de leads
              </span>
            </div>
            {[
              { l: "Impressões", v: totalGeral.impressoes, base: totalGeral.impressoes, taxa: "" },
              {
                l: "Cliques",
                v: totalGeral.cliques,
                base: totalGeral.impressoes,
                taxa: metricasGerais.ctr !== null ? `CTR ${(metricasGerais.ctr * 100).toFixed(2).replace(".", ",")}%` : "",
              },
              {
                l: "Conversas",
                v: totalGeral.conversas,
                base: totalGeral.impressoes,
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
                    {f.v.toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="mt-2 h-2.5 bg-mt-neutral-300/40">
                  <div
                    className={`h-2.5 ${i === 2 ? "bg-mt-accent" : "bg-mt-ink"}`}
                    style={{ width: f.base > 0 ? `${Math.max(2, (f.v / f.base) * 100)}%` : "0%" }}
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
