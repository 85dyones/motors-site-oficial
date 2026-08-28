"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { LinhaDoRelatorio } from "../../lib/funil";

/**
 * Ganhos e perdas — o relatório que o motivo obrigatório torna possível.
 *
 * 2026-08-28: *"uma opção de dar o negócio como ganho ou perdido, selecionando
 * opções para mensurar em relatórios depois"*.
 *
 * ---------------------------------------------------------------------------
 * Por que a barra de perdas vem PRIMEIRO
 * ---------------------------------------------------------------------------
 * Relatório de vendas costuma abrir com o que foi ganho, porque é a notícia
 * boa. Só que a decisão que este relatório existe para informar é sobre o que
 * NÃO aconteceu: se 40% das perdas são "financiamento reprovado", o problema é
 * de qualificação e o conserto é no atendimento, não na vitrine. O motivo da
 * perda é o dado mais acionável do funil, e é o primeiro da tela.
 *
 * ---------------------------------------------------------------------------
 * "Sem motivo informado" não é uma fatia escondida
 * ---------------------------------------------------------------------------
 * Ela aparece como qualquer outra, e de propósito: é o termômetro de confiança
 * do relatório inteiro. Se for a maior barra, nenhuma das outras vale nada — e
 * é melhor descobrir isso no gráfico do que na reunião.
 */

interface Dados {
  periodo: { de: string; ate: string };
  ganhos: number;
  perdidos: number;
  valor_ganho: number;
  ticket_medio: number;
  taxa_conversao: number;
  ciclo_medio_dias: number | null;
  ciclo_mediano_dias: number | null;
  por_motivo_perdido: LinhaDoRelatorio[];
  por_motivo_ganho: LinhaDoRelatorio[];
  funil_atual: { chave: string; rotulo: string; quantidade: number }[];
  por_vendedor?: {
    nome: string;
    ganhos: number;
    perdidos: number;
    valor: number;
    abertos: number;
    taxa_conversao: number;
  }[];
  observacoes?: {
    desfecho: "ganho" | "perdido";
    motivo: string | null;
    nota: string;
    responsavel: string | null;
    quando: string | null;
  }[];
  migracaoPendente?: boolean;
}

const dinheiro = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const PERIODOS = [
  { rotulo: "30 dias", dias: 30 },
  { rotulo: "90 dias", dias: 90 },
  { rotulo: "12 meses", dias: 365 },
];

export default function RelatorioDoFunil() {
  const [dias, setDias] = useState(90);
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const de = new Date();
      de.setDate(de.getDate() - dias);
      const res = await fetch(`/api/funil/relatorio?de=${de.toISOString().slice(0, 10)}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Falha ao carregar o relatório");
      setDados(d);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [dias]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-regua pb-5">
        <div className="flex flex-col gap-1.5">
          <div className="mt-rotulo mt-rotulo-accent">Leads</div>
          <h1 className="mt-titulo text-3xl md:text-4xl">Ganhos e perdas</h1>
          <p className="mt-1 max-w-[620px] text-sm text-mt-neutral-800">
            Por que a loja fecha e por que deixa de fechar. O recorte é sobre a data do desfecho,
            não a da entrada do lead — venda demorada conta no mês em que aconteceu.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              onClick={() => setDias(p.dias)}
              className={`mt-foco cursor-pointer border px-3 py-2 text-[11px] ${
                dias === p.dias
                  ? "border-mt-accent bg-mt-accent-100 text-mt-accent-800"
                  : "border-mt-regua-fina text-mt-neutral-700 hover:border-mt-accent"
              }`}
            >
              {p.rotulo}
            </button>
          ))}
          <Link
            href="/admin/leads"
            className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[11px]"
          >
            Voltar ao kanban
          </Link>
        </div>
      </div>

      {erro && (
        <div className="border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800">
          {erro}
        </div>
      )}

      {carregando ? (
        <div className="py-16 text-center text-xs text-mt-neutral-700">Carregando…</div>
      ) : dados?.migracaoPendente ? (
        <div className="border border-dashed border-mt-regua-fina bg-mt-surface p-10 text-center">
          <div className="text-[15px] font-extrabold tracking-[-.01em]">
            O desfecho ainda não é registrado neste banco
          </div>
          <p className="mx-auto mt-2 max-w-[520px] text-xs leading-relaxed text-mt-neutral-700">
            Aplique a migração{" "}
            <code className="text-mt-ink">20260828120000_funil_de_vendas.sql</code> e o relatório
            passa a se encher sozinho, a cada negócio fechado no kanban.
          </p>
        </div>
      ) : !dados || dados.ganhos + dados.perdidos === 0 ? (
        <div className="border border-dashed border-mt-regua-fina bg-mt-surface p-10 text-center">
          <div className="text-[15px] font-extrabold tracking-[-.01em]">
            Nenhum negócio encerrado no período
          </div>
          <p className="mx-auto mt-2 max-w-[460px] text-xs leading-relaxed text-mt-neutral-700">
            O relatório se enche à medida que os leads são marcados como ganhos ou perdidos no
            kanban, com o motivo.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 border-t-2 border-mt-regua lg:grid-cols-5">
            <Numero rotulo="Ganhos" valor={String(dados.ganhos)} />
            <Numero rotulo="Perdidos" valor={String(dados.perdidos)} />
            <Numero
              rotulo="Conversão"
              valor={`${dados.taxa_conversao.toFixed(0)}%`}
              nota="sobre negócios encerrados"
            />
            <Numero rotulo="Vendido" valor={dinheiro(dados.valor_ganho)} nota="quando informado" />
            <Numero
              rotulo="Ciclo típico"
              valor={
                dados.ciclo_mediano_dias !== null
                  ? `${Math.round(dados.ciclo_mediano_dias)} d`
                  : "—"
              }
              nota={
                dados.ciclo_medio_dias !== null
                  ? `média ${Math.round(dados.ciclo_medio_dias)} d`
                  : "da entrada ao fechamento"
              }
            />
          </div>

          <Barras
            titulo="Por que a gente perde"
            linhas={dados.por_motivo_perdido}
            total={dados.perdidos}
          />
          <Barras
            titulo="Como a gente ganha"
            linhas={dados.por_motivo_ganho}
            total={dados.ganhos}
            mostrarValor
          />

          {dados.por_vendedor && dados.por_vendedor.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="mt-rotulo border-b border-mt-regua-fina pb-2">Por vendedor</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-[12px]">
                  <thead>
                    <tr className="border-b border-mt-regua-fina text-[10px] uppercase tracking-[.08em] text-mt-neutral-600">
                      <th className="py-2 text-left font-semibold">Vendedor</th>
                      <th className="py-2 text-right font-semibold">Abertos</th>
                      <th className="py-2 text-right font-semibold">Ganhos</th>
                      <th className="py-2 text-right font-semibold">Perdidos</th>
                      <th className="py-2 text-right font-semibold">Conversão</th>
                      <th className="py-2 text-right font-semibold">Vendido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.por_vendedor.map((v) => (
                      <tr key={v.nome} className="border-b border-mt-regua-fina">
                        <td className="py-2 font-semibold text-mt-ink">{v.nome}</td>
                        <td className="py-2 text-right tabular-nums text-mt-neutral-700">{v.abertos}</td>
                        <td className="py-2 text-right tabular-nums">{v.ganhos}</td>
                        <td className="py-2 text-right tabular-nums text-mt-neutral-700">{v.perdidos}</td>
                        <td className="py-2 text-right tabular-nums">{v.taxa_conversao.toFixed(0)}%</td>
                        <td className="py-2 text-right tabular-nums">{dinheiro(v.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {dados.observacoes && dados.observacoes.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="mt-rotulo border-b border-mt-regua-fina pb-2">
                O que os vendedores escreveram
              </h2>
              <p className="max-w-[620px] text-[11px] leading-relaxed text-mt-neutral-700">
                As barras acima dizem <em>quanto</em>. Estas linhas dizem <em>o quê</em> — é o
                que a lista de motivos não tem como prever, e é onde o próximo motivo novo
                costuma aparecer três vezes antes de alguém cadastrá-lo.
              </p>
              <ul className="flex flex-col gap-0.5">
                {dados.observacoes.map((o, i) => (
                  <li
                    key={i}
                    className={`border-l-[3px] bg-mt-surface px-3 py-2 ${
                      o.desfecho === "ganho" ? "border-mt-accent-800" : "border-mt-accent"
                    }`}
                  >
                    <div className="text-[12px] leading-snug text-mt-ink">{o.nota}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] uppercase tracking-[.08em] text-mt-neutral-600">
                      <span>{o.desfecho === "ganho" ? "Ganho" : "Perdido"}</span>
                      {o.motivo && <span>{o.motivo}</span>}
                      {o.responsavel && <span>{o.responsavel}</span>}
                      {o.quando && (
                        <span className="tabular-nums">
                          {new Date(o.quando).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="mt-rotulo border-b border-mt-regua-fina pb-2">
              O funil agora — o que ainda está em jogo
            </h2>
            <div className="flex flex-wrap gap-0.5">
              {dados.funil_atual.map((e) => (
                <div
                  key={e.chave}
                  className="min-w-[110px] flex-1 border border-mt-regua-fina bg-mt-surface px-3 py-2.5"
                >
                  <div className="text-[10px] uppercase tracking-[.08em] text-mt-neutral-600">
                    {e.rotulo}
                  </div>
                  <div className="mt-1 text-xl font-extrabold tabular-nums">{e.quantidade}</div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="border-b border-mt-regua-fina py-4 pr-4 lg:border-b-0 lg:border-r lg:pl-4 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0">
      <div className="mt-rotulo">{rotulo}</div>
      <div className="mt-2 text-2xl font-extrabold tabular-nums">{valor}</div>
      {nota && <div className="mt-1 text-[10px] text-mt-neutral-600">{nota}</div>}
    </div>
  );
}

/**
 * Barras horizontais em CSS puro.
 *
 * Sem biblioteca de gráfico de propósito: são dez linhas com um percentual
 * cada, e uma dependência nova para desenhar retângulo é exatamente o tipo de
 * inchaço que o dono pediu para evitar. A largura é o próprio dado.
 */
function Barras({
  titulo,
  linhas,
  total,
  mostrarValor,
}: {
  titulo: string;
  linhas: LinhaDoRelatorio[];
  total: number;
  mostrarValor?: boolean;
}) {
  if (linhas.length === 0) return null;
  const maior = Math.max(...linhas.map((l) => l.quantidade), 1);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="mt-rotulo border-b border-mt-regua-fina pb-2">
        {titulo} <span className="text-mt-neutral-600">({total})</span>
      </h2>
      <div className="flex flex-col gap-1.5">
        {linhas.map((l) => (
          <div key={l.chave} className="flex items-center gap-3">
            <div className="w-[220px] shrink-0 text-[12px] leading-snug text-mt-ink">
              {l.rotulo}
              {l.chave === "sem_motivo" && (
                <span className="ml-1 text-[10px] uppercase tracking-[.08em] text-mt-accent">
                  cega o relatório
                </span>
              )}
            </div>
            <div className="h-4 flex-1 bg-mt-surface">
              <div
                className={`h-full ${l.chave === "sem_motivo" ? "bg-mt-neutral-400" : "bg-mt-accent"}`}
                style={{ width: `${(l.quantidade / maior) * 100}%` }}
              />
            </div>
            <div className="w-24 shrink-0 text-right text-[11px] tabular-nums text-mt-neutral-700">
              {l.quantidade} · {l.percentual.toFixed(0)}%
            </div>
            {mostrarValor && (
              <div className="w-24 shrink-0 text-right text-[11px] tabular-nums text-mt-neutral-700">
                {l.valor > 0 ? dinheiro(l.valor) : "—"}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
