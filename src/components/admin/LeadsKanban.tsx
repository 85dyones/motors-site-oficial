"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SEM_DONO,
  filtrarPorResponsavel,
  iniciais,
  opcoesDeResponsavel,
} from "../../lib/leadsKanban";

/**
 * Tela A8 do design doc — kanban de leads.
 *
 * Fonte: a tabela `leads` (migração 20260807210000), alimentada por
 * `/api/leads` a cada formulário enviado no site. Antes disso o lead existia
 * só no webhook do n8n — quem não abrisse o n8n não sabia que alguém pediu
 * contato. (Descobriu-se depois que aquele webhook nunca chegou a existir:
 * o site publicava em `lead-entrada` e o n8n registrava `leads-entrada`.)
 *
 * Duas diferenças em relação ao desenho:
 *
 * 1. **Arrastar E botões.** O desenho pede arrastar; a versão anterior tinha
 *    só botões porque `dnd` nativo não funciona no toque nem no teclado — e
 *    esta tela roda no tablet de balcão da loja. As duas formas convivem: o
 *    mouse arrasta, o resto usa as setas. Tirar as setas quebraria o tablet
 *    sem ninguém perceber, porque não é erro, é ausência.
 * 2. **Sem SLA colorido por tempo.** O doc mostra "SLA 3 MIN" e "FORA DO
 *    SLA"; nenhum acordo de tempo de resposta foi definido, e pintar de
 *    vermelho um prazo que ninguém combinou é inventar meta. Mostramos o
 *    tempo de espera cru — o julgamento fica com quem atende.
 */

interface Lead {
  id: string;
  nome: string;
  telefone: string | null;
  interesse: string | null;
  canal: string | null;
  situacao: string;
  responsavel: string | null;
  observacoes: string | null;
  /** `created_at`, não `criado_em`: a tabela é preexistente e já usava esse
   *  nome — ver a nota na migração 20260807210000. */
  created_at: string;
}

const ETAPAS: Array<{ id: string; rotulo: string }> = [
  { id: "novo", rotulo: "Novo" },
  { id: "em_contato", rotulo: "Em contato" },
  { id: "proposta", rotulo: "Proposta" },
  { id: "visita", rotulo: "Visita" },
  { id: "negociacao", rotulo: "Negociação" },
  { id: "fechado", rotulo: "Fechado" },
  { id: "perdido", rotulo: "Perdido" },
];

/** Espera desde a entrada, em texto curto. */
function espera(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

/** Telefone só com dígitos → (41) 99999-9999. */
function formatarTelefone(t: string | null): string {
  if (!t) return "";
  const d = t.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

export default function LeadsKanban() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [atendentes, setAtendentes] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [migracaoPendente, setMigracaoPendente] = useState(false);
  const [agregado, setAgregado] = useState<{ total: number; porSituacao: Record<string, number> } | null>(null);

  const [filtroResponsavel, setFiltroResponsavel] = useState("");
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);
  const [anotando, setAnotando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const res = await fetch("/api/leads/gerenciar");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Falha ao carregar leads");
      if (d.migracaoPendente) {
        setMigracaoPendente(true);
      } else if (d.somenteAgregado) {
        setAgregado({ total: d.total, porSituacao: d.porSituacao });
      } else {
        setLeads(d.leads ?? []);
        setAtendentes((d.atendentes ?? []).map((a: { nome: string }) => a.nome));
      }
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /**
   * Grava um campo do lead. Otimista: a tela reage na hora e recarrega do
   * servidor se der errado — o inverso (esperar a rede) faz o card "pular"
   * de volta e parecer que o clique não pegou.
   */
  const salvar = useCallback(
    async (id: string, campos: Partial<Pick<Lead, "situacao" | "responsavel" | "observacoes">>) => {
      setLeads((atual) => atual.map((l) => (l.id === id ? { ...l, ...campos } : l)));
      try {
        const res = await fetch("/api/leads/gerenciar", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...campos }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Falha ao salvar");
        }
      } catch (e: any) {
        setErro(e.message);
        // Recarrega em vez de restaurar um retrato tirado antes da chamada:
        // com vários consultores mexendo na mesma fila, o retrato local já
        // pode estar velho, e restaurá-lo desfaria o trabalho de outro.
        carregar();
      }
    },
    [carregar],
  );

  const mover = (id: string, situacao: string) => salvar(id, { situacao });

  const visiveis = useMemo(
    () => filtrarPorResponsavel(leads, filtroResponsavel),
    [leads, filtroResponsavel],
  );

  const opcoesResponsavel = useMemo(
    () => opcoesDeResponsavel(atendentes, leads),
    [atendentes, leads],
  );

  const semDono = useMemo(() => leads.filter((l) => !l.responsavel).length, [leads]);

  if (carregando) {
    return <div className="py-16 text-center text-xs text-mt-neutral-700">Carregando leads…</div>;
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-regua pb-5">
        <div className="flex flex-col gap-1.5">
          <div className="mt-rotulo mt-rotulo-accent">Geral</div>
          <h1 className="mt-titulo text-3xl md:text-4xl">Leads</h1>
          <p className="mt-1 max-w-[620px] text-sm text-mt-neutral-800">
            Cada contato enviado pelo site entra aqui. Mover entre etapas é o registro do
            atendimento — o WhatsApp continua sendo onde a conversa acontece.
          </p>
        </div>
        <button
          onClick={carregar}
          className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[11px]"
        >
          Atualizar
        </button>
      </div>

      {erro && (
        <div className="border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800">
          {erro}
        </div>
      )}

      {migracaoPendente ? (
        <div className="border border-dashed border-mt-regua-fina bg-mt-surface p-10 text-center">
          <div className="text-[15px] font-extrabold tracking-[-.01em]">
            A tabela de leads ainda não existe
          </div>
          <p className="mx-auto mt-2 max-w-[460px] text-xs leading-relaxed text-mt-neutral-700">
            Aplique a migração <code className="text-mt-ink">20260807210000_leads.sql</code> com{" "}
            <code className="text-mt-ink">supabase db push</code>. A partir daí, todo formulário
            enviado no site passa a aparecer nesta tela.
          </p>
        </div>
      ) : agregado ? (
        // Marketing vê volume, não pessoas — regra da matriz A17.
        <div>
          <div className="mt-rotulo mb-3">Volume por etapa</div>
          <div className="grid grid-cols-2 border-t-2 border-mt-regua lg:grid-cols-7">
            {ETAPAS.map((e) => (
              <div key={e.id} className="border-b border-mt-regua-fina py-4 pr-4 lg:border-b-0 lg:border-r lg:pl-4 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0">
                <div className="mt-rotulo">{e.rotulo}</div>
                <div className="mt-2 text-2xl font-extrabold tabular-nums">
                  {agregado.porSituacao[e.id] ?? 0}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-mt-neutral-700">
            Seu perfil vê o volume agregado. Nome e telefone ficam com Comercial e
            Administrador, conforme a matriz de permissões.
          </p>
        </div>
      ) : leads.length === 0 ? (
        <div className="border border-dashed border-mt-regua-fina bg-mt-surface p-10 text-center">
          <div className="text-[15px] font-extrabold tracking-[-.01em]">Nenhum lead ainda</div>
          <p className="mx-auto mt-2 max-w-[460px] text-xs leading-relaxed text-mt-neutral-700">
            Os contatos enviados pelos formulários do site aparecem aqui assim que chegam.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="filtro-responsavel"
              className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700"
            >
              Responsável
            </label>
            <select
              id="filtro-responsavel"
              value={filtroResponsavel}
              onChange={(e) => setFiltroResponsavel(e.target.value)}
              className="mt-foco cursor-pointer border border-mt-regua-fina bg-mt-bg px-3 py-2 text-xs text-mt-ink"
            >
              <option value="">Todos ({leads.length})</option>
              <option value={SEM_DONO}>Sem responsável ({semDono})</option>
              {opcoesResponsavel.map((n) => (
                <option key={n} value={n}>
                  {n} ({leads.filter((l) => l.responsavel === n).length})
                </option>
              ))}
            </select>
            {filtroResponsavel && (
              <button
                onClick={() => setFiltroResponsavel("")}
                className="mt-foco cursor-pointer text-[11px] text-mt-accent hover:underline"
              >
                limpar
              </button>
            )}
            <span className="ml-auto text-[11px] text-mt-neutral-600">
              Arraste o card ou use as setas
            </span>
          </div>

          <div className="flex gap-0.5 overflow-x-auto pb-4">
            {ETAPAS.map((etapa) => {
              const daEtapa = visiveis.filter((l) => l.situacao === etapa.id);
              const alvo = colunaAlvo === etapa.id && arrastando !== null;
              return (
                <div
                  key={etapa.id}
                  className="flex w-[240px] flex-none flex-col"
                  // Soltar aqui move o lead. O `preventDefault` no dragOver é
                  // o que autoriza o drop — sem ele o navegador recusa.
                  onDragOver={(e) => {
                    if (!arrastando) return;
                    e.preventDefault();
                    setColunaAlvo(etapa.id);
                  }}
                  onDragLeave={() => setColunaAlvo((c) => (c === etapa.id ? null : c))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = arrastando || e.dataTransfer.getData("text/plain");
                    const lead = leads.find((l) => l.id === id);
                    if (lead && lead.situacao !== etapa.id) mover(id, etapa.id);
                    setArrastando(null);
                    setColunaAlvo(null);
                  }}
                >
                  <div
                    className={`flex items-baseline gap-2 border-b-2 px-3 py-2.5 ${
                      etapa.id === "novo"
                        ? "border-mt-accent bg-mt-ink text-mt-bg"
                        : "border-mt-regua"
                    }`}
                  >
                    <span className="text-[11px] font-extrabold uppercase tracking-[.1em]">
                      {etapa.rotulo}
                    </span>
                    <span
                      className={`ml-auto text-[11px] tabular-nums ${
                        etapa.id === "novo" ? "text-mt-neutral-400" : "text-mt-neutral-700"
                      }`}
                    >
                      {daEtapa.length}
                    </span>
                  </div>

                  <div
                    className={`flex min-h-[80px] flex-col gap-0.5 p-1 transition-colors ${
                      alvo ? "bg-mt-accent-100 outline-dashed outline-1 outline-mt-accent" : ""
                    }`}
                  >
                    {daEtapa.map((l) => {
                      const i = ETAPAS.findIndex((e) => e.id === l.situacao);
                      return (
                        <div
                          key={l.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", l.id);
                            e.dataTransfer.effectAllowed = "move";
                            setArrastando(l.id);
                          }}
                          onDragEnd={() => {
                            setArrastando(null);
                            setColunaAlvo(null);
                          }}
                          className={`border border-mt-regua-fina bg-mt-surface p-3 ${
                            arrastando === l.id ? "opacity-40" : "cursor-grab"
                          }`}
                        >
                          <div className="text-[13px] font-extrabold tracking-[-.01em]">
                            {l.nome}
                          </div>
                          {l.interesse && (
                            <div className="mt-1 text-[11px] leading-snug text-mt-neutral-800">
                              {l.interesse}
                            </div>
                          )}
                          {l.telefone && (
                            <a
                              href={`https://wa.me/${l.telefone}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              // Sem desligar o arrasto no link, o navegador
                              // arrasta a âncora em vez do card e o drop nunca
                              // dispara. Falha muda: o card só não se move.
                              draggable={false}
                              className="mt-foco mt-1.5 block text-[11px] font-semibold text-mt-accent tabular-nums hover:underline"
                            >
                              {formatarTelefone(l.telefone)}
                            </a>
                          )}

                          <div className="mt-2 flex items-center gap-2 border-t border-mt-regua-fina pt-2">
                            <span className="text-[10px] uppercase tracking-[.08em] text-mt-neutral-600">
                              {l.canal || "site"}
                            </span>
                            <span className="ml-auto text-[10px] tabular-nums text-mt-neutral-700">
                              {espera(l.created_at)}
                            </span>
                          </div>

                          <div className="mt-2 flex items-center gap-1.5">
                            <span
                              aria-hidden="true"
                              className={`flex h-5 w-5 shrink-0 items-center justify-center text-[9px] font-extrabold ${
                                l.responsavel
                                  ? "bg-mt-ink text-mt-bg"
                                  : "border border-dashed border-mt-regua text-mt-neutral-500"
                              }`}
                            >
                              {l.responsavel ? iniciais(l.responsavel) : "—"}
                            </span>
                            <select
                              value={l.responsavel ?? ""}
                              onChange={(e) => salvar(l.id, { responsavel: e.target.value || null })}
                              aria-label={`Responsável por ${l.nome}`}
                              className="mt-foco w-full cursor-pointer border border-mt-regua-fina bg-mt-bg px-1.5 py-1 text-[10px] text-mt-ink"
                            >
                              <option value="">Sem responsável</option>
                              {opcoesResponsavel.map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </div>

                          {anotando === l.id ? (
                            <textarea
                              autoFocus
                              defaultValue={l.observacoes ?? ""}
                              rows={3}
                              placeholder="O que foi combinado…"
                              // Grava ao sair do campo: salvar a cada tecla
                              // seria uma requisição por letra.
                              onBlur={(e) => {
                                const texto = e.target.value.trim();
                                if (texto !== (l.observacoes ?? "")) {
                                  salvar(l.id, { observacoes: texto || null });
                                }
                                setAnotando(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") setAnotando(null);
                              }}
                              className="mt-foco mt-1.5 w-full resize-none border border-mt-regua-fina bg-mt-bg p-1.5 text-[11px] leading-snug text-mt-ink outline-none focus:border-mt-accent"
                            />
                          ) : l.observacoes ? (
                            <button
                              onClick={() => setAnotando(l.id)}
                              aria-label={`Editar anotação de ${l.nome}`}
                              className="mt-foco mt-1.5 w-full cursor-pointer border-l-2 border-mt-regua bg-mt-bg px-2 py-1 text-left text-[11px] leading-snug text-mt-neutral-800 hover:border-mt-accent"
                            >
                              {l.observacoes}
                            </button>
                          ) : (
                            <button
                              onClick={() => setAnotando(l.id)}
                              className="mt-foco mt-1.5 cursor-pointer text-[10px] text-mt-neutral-600 hover:text-mt-accent"
                            >
                              + anotação
                            </button>
                          )}

                          <div className="mt-2 flex gap-1">
                            <button
                              onClick={() => mover(l.id, ETAPAS[i - 1].id)}
                              disabled={i <= 0}
                              aria-label={`Voltar ${l.nome} uma etapa`}
                              className="mt-foco cursor-pointer border border-mt-regua-fina px-2 py-1 text-[10px] text-mt-neutral-700 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              ←
                            </button>
                            <button
                              onClick={() => mover(l.id, ETAPAS[i + 1].id)}
                              disabled={i >= ETAPAS.length - 1}
                              aria-label={`Avançar ${l.nome} uma etapa`}
                              className="mt-foco flex-1 cursor-pointer border border-mt-regua-fina px-2 py-1 text-[10px] font-semibold text-mt-neutral-700 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              Avançar →
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
