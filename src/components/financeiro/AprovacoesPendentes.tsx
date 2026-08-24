"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "../admin/ConfirmDialog";

/**
 * A fila de agendamentos financeiros à espera do Gestor (A17, "Aprovar
 * agendamento financeiro").
 *
 * Briefing 2026-08-21, pedido do dono: aviso de "contas que subiram pra
 * aprovação". O webhook avisa no WhatsApp; esta tela é onde a decisão
 * acontece. Cada card é um LANÇAMENTO (parcelas do mesmo grupo andam
 * juntas); aprovar manda para `pendente` — a conta entra no dia e nas
 * contas a pagar —, recusar exige motivo e cancela.
 *
 * O que chega aqui é AGENDAMENTO — pagamento que ainda vai sair. Registro de
 * conta já paga nunca entra na fila: o dinheiro saiu, e travar o registro só
 * esconderia o rastro. Não há limiar em reais desde 2026-08-21; ver o
 * cabeçalho de `lib/alcada.ts`.
 *
 * `podeDecidir` chega da página (server component, papéis do banco): o
 * Financeiro vê a própria fila, os botões são do Gestor.
 */

interface ContaAguardando {
  id: string;
  descricao: string;
  valor: number | string;
  data_vencimento: string;
  status: string;
  fornecedor?: string | null;
  parcela_atual: number;
  total_parcelas: number;
  grupo_parcela?: string | null;
  created_at?: string;
  observacoes?: string | null;
  categoria?: { nome: string; cor: string; icone: string } | null;
}

interface RecorrenteAguardando {
  id: string;
  descricao: string;
  valor: number | string;
  frequencia: string;
  dia_vencimento: number | null;
  fornecedor?: string | null;
  observacoes?: string | null;
  categoria?: { nome: string; cor: string; icone: string } | null;
}

interface Lancamento {
  chave: string;
  contaId: string;
  descricao: string;
  contas: ContaAguardando[];
  total: number;
}

const formatPrice = (value: number | string) => {
  const n = typeof value === "number" ? value : parseFloat(value);
  return (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

const formatDate = (dateStr: string) => {
  const parts = dateStr.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
};

/** Agrupa parcelas do mesmo lançamento — a decisão é uma só. */
function agruparLancamentos(contas: ContaAguardando[]): Lancamento[] {
  const grupos = new Map<string, ContaAguardando[]>();
  for (const c of contas) {
    const chave = c.grupo_parcela || c.id;
    const lista = grupos.get(chave) ?? [];
    lista.push(c);
    grupos.set(chave, lista);
  }
  return [...grupos.entries()].map(([chave, lista]) => {
    const ordenadas = [...lista].sort((a, b) => (a.parcela_atual ?? 1) - (b.parcela_atual ?? 1));
    return {
      chave,
      contaId: ordenadas[0].id,
      // O sufixo " (1/4)" é da parcela; o lançamento tem o nome limpo.
      descricao: ordenadas[0].descricao.replace(/ \(\d+\/\d+\)$/, ""),
      contas: ordenadas,
      total: ordenadas.reduce((acc, c) => {
        const v = typeof c.valor === "number" ? c.valor : parseFloat(c.valor);
        return acc + (Number.isFinite(v) ? v : 0);
      }, 0),
    };
  });
}

export default function AprovacoesPendentes({ podeDecidir }: { podeDecidir: boolean }) {
  const { confirm } = useConfirm();
  const [contas, setContas] = useState<ContaAguardando[]>([]);
  const [recorrentes, setRecorrentes] = useState<RecorrenteAguardando[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Recusa em andamento: qual lançamento e o motivo digitado.
  const [recusando, setRecusando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [decidindo, setDecidindo] = useState(false);

  const fetchFila = useCallback(async () => {
    setIsLoading(true);
    try {
      // Duas filas, uma tela: o Gestor tem UM lugar para olhar. Separá-las em
      // páginas diferentes faria a segunda ser esquecida.
      const [resContas, resRecorrentes] = await Promise.all([
        fetch("/api/financeiro/contas?status=aguardando_aprovacao"),
        fetch("/api/financeiro/recorrentes"),
      ]);
      const corpoContas = await resContas.json();
      if (resContas.ok) {
        setContas(corpoContas.contas || []);
      } else {
        setError(corpoContas.error || "Falha ao carregar a fila de agendamentos.");
      }

      if (resRecorrentes.ok) {
        const corpo = await resRecorrentes.json();
        const lista: RecorrenteAguardando[] = corpo.recurring || corpo.recorrentes || [];
        setRecorrentes(lista.filter((r: any) => r.aprovacao_status === "aguardando"));
      }
    } catch {
      setError("Erro ao se conectar com o servidor.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFila();
  }, [fetchFila]);

  const decidir = async (l: Lancamento, decisao: "aprovar" | "recusar", motivoRecusa?: string) => {
    setDecidindo(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/financeiro/contas/${l.contaId}/aprovar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisao, motivo: motivoRecusa || undefined }),
      });
      const body = await res.json();
      if (res.ok) {
        setSuccessMsg(
          decisao === "aprovar"
            ? `Agendamento liberado — ${l.contas.length > 1 ? `${l.contas.length} parcelas entram` : "a conta entra"} no contas a pagar.`
            : "Agendamento recusado e cancelado, com o motivo registrado."
        );
        setRecusando(null);
        setMotivo("");
        fetchFila();
      } else {
        setError(body.error || "Falha ao registrar a decisão.");
      }
    } catch {
      setError("Erro ao se conectar com o servidor.");
    } finally {
      setDecidindo(false);
    }
  };

  const decidirRecorrente = async (
    r: RecorrenteAguardando,
    decisao: "aprovar" | "recusar",
    motivoRecusa?: string,
  ) => {
    setDecidindo(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/financeiro/recorrentes/${r.id}/aprovar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisao, motivo: motivoRecusa || undefined }),
      });
      const body = await res.json();
      if (res.ok) {
        setSuccessMsg(
          decisao === "aprovar"
            ? "Despesa recorrente liberada — passa a gerar conta todo mês."
            : "Despesa recorrente recusada e desligada, com o motivo registrado.",
        );
        setRecusando(null);
        setMotivo("");
        fetchFila();
      } else {
        setError(body.error || "Falha ao registrar a decisão.");
      }
    } catch {
      setError("Erro ao se conectar com o servidor.");
    } finally {
      setDecidindo(false);
    }
  };

  const handleAprovarRecorrente = async (r: RecorrenteAguardando) => {
    const ok = await confirm({
      title: "Aprovar Despesa Recorrente",
      message: `Liberar "${r.descricao}" — ${formatPrice(r.valor)} ${r.frequencia}? A partir daqui ela gera conta a pagar automaticamente.`,
      type: "info",
      confirmLabel: "Aprovar",
      cancelLabel: "Cancelar",
    });
    if (ok) decidirRecorrente(r, "aprovar");
  };

  const handleAprovar = async (l: Lancamento) => {
    const ok = await confirm({
      title: "Aprovar Agendamento",
      message: `Liberar "${l.descricao}" no total de ${formatPrice(l.total)}${l.contas.length > 1 ? ` (${l.contas.length} parcelas)` : ""}? As contas entram como pendentes e podem ser pagas.`,
      type: "info",
      confirmLabel: "Aprovar",
      cancelLabel: "Cancelar",
    });
    if (ok) decidir(l, "aprovar");
  };

  const lancamentos = agruparLancamentos(contas);
  const totalAguardando = lancamentos.reduce((acc, l) => acc + l.total, 0);
  const nadaNaFila = lancamentos.length === 0 && recorrentes.length === 0;
  const proximoVencimento = lancamentos
    .map((l) => l.contas[0].data_vencimento)
    .sort()[0];

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 select-none">
        <span className="text-[11px] text-mt-neutral-700 max-w-[520px]">
          Pagamentos agendados esperam a liberação do gestor. Registro de conta
          já paga não entra aqui — parcelas do mesmo lançamento são decididas juntas.
        </span>
        {!podeDecidir && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-mt-neutral-600 border border-mt-regua-fina px-3 py-2">
            Quem decide é o gestor
          </span>
        )}
      </div>

      {successMsg && (
        <div className="bg-mt-surface border border-mt-regua-fina text-mt-accent-800 text-xs px-4 py-3 select-none">
          {successMsg}
        </div>
      )}
      {error && (
        <div className="bg-mt-accent-100 border border-mt-accent-300 text-mt-accent text-xs px-4 py-3 select-none">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="py-16 text-center text-xs text-mt-neutral-700">Carregando a fila...</div>
      ) : nadaNaFila ? (
        <div className="bg-mt-surface border border-dashed border-mt-regua-fina p-12 text-center text-xs text-mt-neutral-600 select-none">
          Nenhum agendamento aguardando liberação. ✓
        </div>
      ) : (
        <>
          {/* Régua de KPIs, na anatomia A10. */}
          <div className="grid select-none grid-cols-1 border-t-2 border-mt-regua sm:grid-cols-2">
            {[
              {
                rotulo: "Aguardando liberação",
                valor: formatPrice(totalAguardando),
                nota:
                  recorrentes.length > 0
                    ? `${lancamentos.length} agendamento(s) + ${recorrentes.length} recorrente(s) nova(s)`
                    : `${lancamentos.length} agendamento${lancamentos.length === 1 ? "" : "s"}`,
              },
              {
                rotulo: "Compromisso mais próximo",
                valor: proximoVencimento ? formatDate(proximoVencimento) : "—",
                // Agendamento parado não pode ser pago: se o vencimento
                // passar na fila, quem perde o prazo é a loja.
                nota: "vencimento do primeiro da fila",
              },
            ].map((kpi) => (
              <div
                key={kpi.rotulo}
                className="flex flex-col gap-2 border-b border-mt-regua-fina px-0 py-4 pr-5 sm:border-b-0 sm:border-r sm:last:border-r-0"
              >
                <span className="mt-rotulo">{kpi.rotulo}</span>
                <span className="text-2xl font-extrabold tracking-[-.03em] tabular-nums text-mt-accent">
                  {kpi.valor}
                </span>
                <span className="text-[11px] leading-tight text-mt-neutral-700">{kpi.nota}</span>
              </div>
            ))}
          </div>

          {/* Recorrentes primeiro: cada uma vale muito mais que um agendamento
              solto — assinar R$ 1.200/mês compromete R$ 14.400 no ano. */}
          {recorrentes.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline gap-3 select-none">
                <h2 className="mt-titulo m-0 text-[18px]">Despesas recorrentes novas</h2>
                <span className="text-[11px] text-mt-neutral-700">
                  compromete caixa todo mês, não uma vez só
                </span>
              </div>
              {recorrentes.map((r) => (
                <div key={r.id} className="bg-mt-surface border border-mt-regua-fina p-6 flex flex-col gap-4">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-[15px] font-extrabold tracking-[-.01em] text-mt-ink">
                        {r.descricao}
                      </span>
                      <span className="text-[11px] text-mt-neutral-700">
                        {r.categoria?.icone} {r.categoria?.nome || "Outros"}
                        {r.fornecedor && ` · ${r.fornecedor}`}
                        {r.dia_vencimento && ` · todo dia ${r.dia_vencimento}`}
                      </span>
                      {r.observacoes && (
                        <span className="text-[11px] text-mt-neutral-600 italic">
                          “{r.observacoes}”
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-start md:items-end gap-0.5 shrink-0">
                      <span className="text-2xl font-extrabold tracking-[-.03em] tabular-nums text-mt-accent">
                        {formatPrice(r.valor)}
                      </span>
                      <span className="text-[10px] text-mt-neutral-600">{r.frequencia}</span>
                    </div>
                  </div>

                  {podeDecidir && (
                    <div className="border-t border-mt-regua-fina pt-4">
                      {recusando === `rec-${r.id}` ? (
                        <div className="flex flex-col gap-3">
                          <label className="text-[10px] font-bold uppercase text-mt-neutral-700">
                            Motivo da recusa (obrigatório — fica no registro)
                          </label>
                          <textarea
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                            rows={2}
                            autoFocus
                            placeholder="Ex: renegociar o contrato antes de assumir a mensalidade"
                            className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 py-3 w-full focus:outline-none focus:border-mt-accent resize-none"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setRecusando(null);
                                setMotivo("");
                              }}
                              className="h-10 px-4 bg-transparent hover:bg-mt-surface text-mt-neutral-700 hover:text-mt-ink border border-mt-regua-fina text-[11px] font-bold uppercase tracking-wider cursor-pointer"
                            >
                              Voltar
                            </button>
                            <button
                              disabled={!motivo.trim() || decidindo}
                              onClick={() => decidirRecorrente(r, "recusar", motivo.trim())}
                              className="h-10 px-4 bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-[11px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                            >
                              {decidindo ? "Registrando..." : "Confirmar Recusa"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            disabled={decidindo}
                            onClick={() => handleAprovarRecorrente(r)}
                            className="h-10 px-5 bg-mt-ink hover:bg-mt-neutral-800 text-mt-inverso text-[11px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                          >
                            Aprovar
                          </button>
                          <button
                            disabled={decidindo}
                            onClick={() => {
                              setRecusando(`rec-${r.id}`);
                              setMotivo("");
                            }}
                            className="h-10 px-5 bg-transparent hover:bg-mt-accent-100 text-mt-accent border border-mt-accent-300 text-[11px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                          >
                            Recusar
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-4">
            {lancamentos.length > 0 && recorrentes.length > 0 && (
              <h2 className="mt-titulo m-0 text-[18px] select-none">Pagamentos agendados</h2>
            )}
            {lancamentos.map((l) => (
              <div key={l.chave} className="bg-mt-surface border border-mt-regua-fina p-6 flex flex-col gap-4">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-extrabold tracking-[-.01em] text-mt-ink">
                        {l.descricao}
                      </span>
                      {l.contas.length > 1 && (
                        <span className="bg-mt-surface border border-mt-regua-fina text-mt-neutral-700 text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-wider">
                          {l.contas.length} parcelas
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-mt-neutral-700">
                      {l.contas[0].categoria?.icone} {l.contas[0].categoria?.nome || "Outros"}
                      {l.contas[0].fornecedor && ` · ${l.contas[0].fornecedor}`}
                      {` · 1º vencimento ${formatDate(l.contas[0].data_vencimento)}`}
                    </span>
                    {l.contas[0].observacoes && (
                      <span className="text-[11px] text-mt-neutral-600 italic">
                        “{l.contas[0].observacoes}”
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-start md:items-end gap-0.5 shrink-0">
                    <span className="text-2xl font-extrabold tracking-[-.03em] tabular-nums text-mt-accent">
                      {formatPrice(l.total)}
                    </span>
                    {l.contas.length > 1 && (
                      <span className="text-[10px] text-mt-neutral-600">
                        {l.contas.length}x de {formatPrice(l.contas[0].valor)}
                      </span>
                    )}
                  </div>
                </div>

                {podeDecidir && (
                  <div className="border-t border-mt-regua-fina pt-4">
                    {recusando === l.chave ? (
                      <div className="flex flex-col gap-3">
                        <label className="text-[10px] font-bold uppercase text-mt-neutral-700">
                          Motivo da recusa (obrigatório — fica no registro)
                        </label>
                        <textarea
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                          rows={2}
                          autoFocus
                          placeholder="Ex: renegociar com o fornecedor antes de assumir"
                          className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 py-3 w-full focus:outline-none focus:border-mt-accent resize-none"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setRecusando(null);
                              setMotivo("");
                            }}
                            className="h-10 px-4 bg-transparent hover:bg-mt-surface text-mt-neutral-700 hover:text-mt-ink border border-mt-regua-fina text-[11px] font-bold uppercase tracking-wider cursor-pointer"
                          >
                            Voltar
                          </button>
                          <button
                            disabled={!motivo.trim() || decidindo}
                            onClick={() => decidir(l, "recusar", motivo.trim())}
                            className="h-10 px-4 bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-[11px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                          >
                            {decidindo ? "Registrando..." : "Confirmar Recusa"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          disabled={decidindo}
                          onClick={() => handleAprovar(l)}
                          className="h-10 px-5 bg-mt-ink hover:bg-mt-neutral-800 text-mt-inverso text-[11px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                        >
                          Aprovar
                        </button>
                        <button
                          disabled={decidindo}
                          onClick={() => {
                            setRecusando(l.chave);
                            setMotivo("");
                          }}
                          className="h-10 px-5 bg-transparent hover:bg-mt-accent-100 text-mt-accent border border-mt-accent-300 text-[11px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                        >
                          Recusar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
