"use client";

import { useCallback, useEffect, useState } from "react";
import { dataDeHoje, type ResumoDoDia } from "../../lib/financeiroDia";

/**
 * O dia da operação — a tela que responde "o que precisa ser pago hoje?".
 *
 * Briefing 2026-08-21 com a adm/financeira: os pagamentos são feitos de
 * manhã, e o sistema anterior não tinha o recorte do dia — nem o "vence
 * hoje", nem o relatório diário (lá, só o DRE mensal). Aqui as duas coisas
 * dividem uma tela porque são o MESMO gesto: de manhã ela olha o que vai
 * pagar; à noite, a mesma data mostra o que foi pago e o que entrou.
 *
 * Quem recorta é `resumoDoDia`, na rota; este componente só pinta e dá
 * baixa — a baixa reusa `/api/financeiro/contas/[id]/pagar`, que já grava a
 * movimentação e dispara o webhook `conta_paga`.
 */

interface ContaDoDia {
  id: string;
  tipo: "pagar" | "receber";
  descricao: string;
  valor: number | string;
  data_vencimento: string;
  data_pagamento?: string | null;
  status: string;
  fornecedor?: string | null;
  cliente?: string | null;
  parcela_atual?: number;
  total_parcelas?: number;
  categoria?: { nome: string; cor: string; icone: string } | null;
}

type Resumo = Omit<ResumoDoDia, "pagarHoje" | "pagarVencidas" | "receberHoje" | "liquidadasNoDia"> & {
  pagarHoje: ContaDoDia[];
  pagarVencidas: ContaDoDia[];
  receberHoje: ContaDoDia[];
  liquidadasNoDia: ContaDoDia[];
};

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

/** Uma seção de lista do dia — as quatro repetem a mesma anatomia. Vive fora
 *  do componente da tela para não ser recriada a cada render. */
function Lista({
  titulo,
  contas,
  vazio,
  mostraVencimento = false,
  acao,
  onBaixa,
}: {
  titulo: string;
  contas: ContaDoDia[];
  vazio: string;
  mostraVencimento?: boolean;
  acao?: "Pagar" | "Receber";
  onBaixa?: (conta: ContaDoDia) => void;
}) {
  return (
    <div className="bg-mt-surface border border-mt-regua-fina p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-mt-regua-fina pb-3 select-none">
        <h3 className="text-[15px] font-extrabold tracking-[-.01em] text-mt-ink">{titulo}</h3>
        <span className="text-[10px] font-bold text-mt-neutral-600 uppercase tracking-wider">
          {contas.length} {contas.length === 1 ? "título" : "títulos"}
        </span>
      </div>
      {contas.length === 0 ? (
        <div className="py-6 text-center text-xs text-mt-neutral-600">{vazio}</div>
      ) : (
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs border-collapse">
            <tbody className="divide-y divide-mt-regua-fina">
              {contas.map((c) => (
                <tr key={c.id}>
                  <td className="py-3 pl-1 font-bold text-mt-ink">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span>{c.descricao}</span>
                        {(c.total_parcelas ?? 1) > 1 && (
                          <span className="bg-mt-surface text-mt-neutral-700 text-[8px] font-bold px-1">
                            {c.parcela_atual}/{c.total_parcelas}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-mt-neutral-600 font-normal">
                        {c.categoria?.icone} {c.categoria?.nome || "Outros"}
                        {(c.fornecedor || c.cliente) && ` · ${c.fornecedor || c.cliente}`}
                      </span>
                    </div>
                  </td>
                  {mostraVencimento && (
                    <td className="py-3 text-mt-accent font-bold whitespace-nowrap">
                      {formatDate(c.data_vencimento)}
                    </td>
                  )}
                  <td className="py-3 font-extrabold text-mt-ink text-right whitespace-nowrap tabular-nums">
                    {formatPrice(c.valor)}
                  </td>
                  {acao && onBaixa && (
                    <td className="py-3 pr-1 text-right w-20">
                      <button
                        onClick={() => onBaixa(c)}
                        className="h-7 px-2.5 bg-mt-ink hover:bg-mt-neutral-800 text-mt-inverso font-bold text-[9px] uppercase tracking-wider transition-all cursor-pointer select-none"
                      >
                        {acao}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function DiaOperacional() {
  const [data, setData] = useState(() => dataDeHoje());
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Painel de baixa — o mesmo desenho do ContasList.
  const [payingBill, setPayingBill] = useState<ContaDoDia | null>(null);
  const [dataPagamento, setDataPagamento] = useState(() => dataDeHoje());
  const [formaPagamento, setFormaPagamento] = useState("pix");

  const fetchResumo = useCallback(async (dia: string) => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/financeiro/dia?data=${dia}`);
      const body = await res.json();
      if (res.ok) {
        setResumo(body);
      } else {
        setError(body.error || "Falha ao carregar o dia.");
      }
    } catch {
      setError("Erro ao se conectar com o servidor.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResumo(data);
  }, [data, fetchResumo]);

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingBill) return;
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/financeiro/contas/${payingBill.id}/pagar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_pagamento: dataPagamento, forma_pagamento: formaPagamento }),
      });
      const body = await res.json();
      if (res.ok) {
        setSuccessMsg(payingBill.tipo === "pagar" ? "Conta paga e registrada no dia." : "Recebimento registrado no dia.");
        setPayingBill(null);
        fetchResumo(data);
      } else {
        setError(body.error || "Falha ao registrar pagamento.");
      }
    } catch {
      setError("Erro ao se conectar com o servidor.");
    }
  };

  const hoje = dataDeHoje();
  const t = resumo?.totais;

  const kpis = t
    ? [
        {
          rotulo: data === hoje ? "A pagar hoje" : "A pagar no dia",
          valor: formatPrice(t.pagarHoje),
          cor: t.pagarHoje > 0 ? "text-mt-accent" : "text-mt-ink",
          nota: `${resumo!.pagarHoje.length} título${resumo!.pagarHoje.length === 1 ? "" : "s"}`,
        },
        {
          rotulo: "Vencidas em aberto",
          valor: formatPrice(t.pagarVencidas),
          cor: t.pagarVencidas > 0 ? "text-mt-accent" : "text-mt-ink",
          nota:
            resumo!.pagarVencidas.length > 0
              ? `${resumo!.pagarVencidas.length} título${resumo!.pagarVencidas.length === 1 ? "" : "s"} · exigem baixa`
              : "em dia",
        },
        {
          rotulo: data === hoje ? "A receber hoje" : "A receber no dia",
          valor: formatPrice(t.receberHoje),
          cor: "text-mt-accent-800",
          nota: `${resumo!.receberHoje.length} título${resumo!.receberHoje.length === 1 ? "" : "s"}`,
        },
        {
          rotulo: "Liquidado no dia",
          valor: formatPrice(t.pagoNoDia + t.recebidoNoDia),
          cor: "text-mt-ink",
          nota: `${formatPrice(t.recebidoNoDia)} recebido · ${formatPrice(t.pagoNoDia)} pago`,
        },
        {
          rotulo: "Movimento do caixa",
          valor: formatPrice(t.saldoDoDia),
          cor: t.saldoDoDia >= 0 ? "text-mt-accent-800" : "text-mt-accent",
          nota: `${formatPrice(t.entradasNoDia)} entrou · ${formatPrice(t.saidasNoDia)} saiu`,
        },
      ]
    : [];

  const iniciarBaixa = (c: ContaDoDia) => {
    setPayingBill(c);
    // A data da baixa acompanha o dia aberto — dar baixa olhando ontem
    // registra em ontem, nunca numa data futura.
    setDataPagamento(data <= hoje ? data : hoje);
    setSuccessMsg("");
    setError("");
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl">
      {/* Seletor do dia: hoje é o padrão; qualquer data vira relatório diário. */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 select-none">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold text-mt-neutral-700 uppercase tracking-wider">Dia</span>
          <input
            type="date"
            value={data}
            onChange={(e) => e.target.value && setData(e.target.value)}
            className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-3 h-10 cursor-pointer focus:outline-none focus:border-mt-accent"
          />
          {data !== hoje && (
            <button
              onClick={() => setData(hoje)}
              className="h-10 px-4 bg-mt-surface hover:bg-mt-accent-100 text-mt-ink border border-mt-regua-fina text-[11px] font-bold uppercase tracking-wider cursor-pointer"
            >
              Voltar a hoje
            </button>
          )}
        </div>
        <span className="text-[11px] text-mt-neutral-700">
          {data === hoje
            ? "O que precisa ser pago hoje — e o que já entrou e saiu."
            : `Relatório diário de ${formatDate(data)}.`}
        </span>
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

      {isLoading || !resumo ? (
        <div className="py-16 text-center text-xs text-mt-neutral-700">Carregando o dia...</div>
      ) : (
        <>
          {/* Régua de KPIs, na mesma anatomia da visão geral (tela A10). */}
          <div className="grid select-none grid-cols-1 border-t-2 border-mt-regua sm:grid-cols-2 lg:grid-cols-5">
            {kpis.map((kpi) => (
              <div
                key={kpi.rotulo}
                className="flex flex-col gap-2 border-b border-mt-regua-fina px-0 py-4 pr-5 lg:border-b-0 lg:border-r lg:last:border-r-0"
              >
                <span className="mt-rotulo">{kpi.rotulo}</span>
                <span className={`text-2xl font-extrabold tracking-[-.03em] tabular-nums ${kpi.cor}`}>
                  {kpi.valor}
                </span>
                <span className="text-[11px] leading-tight text-mt-neutral-700">{kpi.nota}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className={`lg:col-span-2 flex flex-col gap-6 ${payingBill ? "hidden lg:flex" : "flex"}`}>
              {/* A ordem é a prioridade da manhã: o atraso primeiro, depois o dia. */}
              {resumo.pagarVencidas.length > 0 && (
                <Lista
                  titulo="Vencidas em aberto"
                  contas={resumo.pagarVencidas}
                  vazio=""
                  mostraVencimento
                  acao="Pagar"
                  onBaixa={iniciarBaixa}
                />
              )}
              <Lista
                titulo={data === hoje ? "Vence hoje" : "Vence no dia"}
                contas={resumo.pagarHoje}
                vazio="Nada vence neste dia. ✓"
                acao="Pagar"
                onBaixa={iniciarBaixa}
              />
              <Lista
                titulo="A receber no dia"
                contas={resumo.receberHoje}
                vazio="Nenhum recebimento previsto para o dia."
                acao="Receber"
                onBaixa={iniciarBaixa}
              />
              <Lista
                titulo="Liquidadas no dia"
                contas={resumo.liquidadasNoDia}
                vazio="Nenhuma baixa registrada neste dia ainda."
              />
            </div>

            {/* Painel de baixa — o mesmo gesto do ContasList, sem sair do dia. */}
            <div className={`lg:col-span-1 ${payingBill ? "block" : "hidden lg:block"}`}>
              {payingBill ? (
                <div className="bg-mt-surface border border-mt-regua-fina p-6 flex flex-col gap-4 animate-slideUpPopup">
                  <div className="flex flex-col gap-0.5 border-b border-mt-regua-fina pb-3 select-none">
                    <h3 className="text-[15px] font-extrabold tracking-[-.01em] text-mt-ink">
                      {payingBill.tipo === "pagar" ? "Efetuar Pagamento" : "Confirmar Recebimento"}
                    </h3>
                    <span className="text-[10px] text-mt-neutral-700 leading-tight">
                      {payingBill.descricao} • {formatPrice(payingBill.valor)}
                    </span>
                  </div>

                  <form onSubmit={handlePaySubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Data do Pagamento</label>
                      <input
                        type="date"
                        required
                        value={dataPagamento}
                        onChange={(e) => setDataPagamento(e.target.value)}
                        className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent cursor-pointer"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Forma de Pagamento</label>
                      <select
                        value={formaPagamento}
                        onChange={(e) => setFormaPagamento(e.target.value)}
                        className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent cursor-pointer"
                      >
                        <option value="pix">PIX</option>
                        <option value="dinheiro">Dinheiro</option>
                        <option value="boleto">Boleto Bancário</option>
                        <option value="transferencia">Ted / Doc</option>
                        <option value="cartao_credito">Cartão de Crédito</option>
                        <option value="cartao_debito">Cartão de Débito</option>
                        <option value="financiamento">Financiamento</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => setPayingBill(null)}
                        className="flex-1 h-11 bg-transparent hover:bg-mt-surface text-mt-neutral-700 hover:text-mt-ink border border-mt-regua-fina text-[11px] font-bold uppercase tracking-wider cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="flex-1 h-11 bg-mt-ink hover:bg-mt-neutral-800 text-mt-inverso text-[11px] font-bold uppercase tracking-wider cursor-pointer"
                      >
                        Confirmar
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="bg-mt-surface border border-dashed border-mt-regua-fina p-8 text-center text-xs text-mt-neutral-600 select-none">
                  Clique em “Pagar” ou “Receber” em qualquer título para dar baixa sem sair do dia.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
