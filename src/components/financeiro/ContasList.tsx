"use client";

import { useEffect, useState } from "react";
import ContaForm from "./ContaForm";
import { useConfirm } from "../admin/ConfirmDialog";

interface Category {
  id: string;
  nome: string;
  tipo: string;
  icone: string;
}

interface Bill {
  id: string;
  tipo: "pagar" | "receber";
  descricao: string;
  valor: number;
  data_emissao: string;
  data_vencimento: string;
  data_pagamento?: string;
  status: "pendente" | "pago" | "vencido" | "cancelado" | "parcial" | "aguardando_aprovacao";
  fornecedor?: string;
  cliente?: string;
  forma_pagamento?: string;
  parcela_atual: number;
  total_parcelas: number;
  categoria?: {
    nome: string;
    cor: string;
    icone: string;
  };
}

interface ContasListProps {
  tipo: "pagar" | "receber";
  /**
   * Só o Admin apaga lançamento (A17, "Excluir lançamento financeiro",
   * 2026-08-21). Chega da página, que é server component e lê os papéis do
   * banco. Quem não apaga vê "Cancelar" no lugar do lixo: o doc manda o
   * negado SUMIR da interface, e um botão que sempre devolve 403 é pior que
   * ausência — some, e a alternativa legítima ocupa o lugar.
   */
  podeExcluir?: boolean;
}

export default function ContasList({ tipo, podeExcluir = false }: ContasListProps) {
  const { confirm } = useConfirm();
  const [contas, setContas] = useState<Bill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Filters State
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Modal / Form States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedContaId, setSelectedContaId] = useState<string | undefined>(undefined);

  // Pay Bill Panel State
  const [payingBill, setPayingBill] = useState<Bill | null>(null);
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().split("T")[0]);
  const [formaPagamento, setFormaPagamento] = useState("pix");

  const fetchContas = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("tipo", tipo);
      if (search) params.append("search", search);
      if (statusFilter) params.append("status", statusFilter);
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);

      const res = await fetch(`/api/financeiro/contas?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setContas(data.contas || []);
      } else {
        setError(data.error || "Falha ao carregar contas.");
      }
    } catch (err) {
      setError("Erro ao se conectar com o servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContas();
  }, [tipo, statusFilter, startDate, endDate]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchContas();
  };

  const handleDelete = async (id: string) => {
    const isConfirmed = await confirm({
      title: "Excluir Lançamento",
      message: "Tem certeza que deseja excluir este lançamento financeiro?",
      type: "danger",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar"
    });
    if (!isConfirmed) return;
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch(`/api/financeiro/contas/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg("Lançamento excluído com sucesso!");
        fetchContas();
      } else {
        setError(data.error || "Falha ao excluir lançamento.");
      }
    } catch (err) {
      setError("Erro de rede.");
    }
  };

  const handleCancelar = async (c: Bill) => {
    const isConfirmed = await confirm({
      title: "Cancelar Lançamento",
      message: `Cancelar "${c.descricao}"? A conta sai do fluxo de caixa e do dia, mas a linha permanece no histórico com o status "cancelado".`,
      type: "danger",
      confirmLabel: "Cancelar lançamento",
      cancelLabel: "Voltar",
    });
    if (!isConfirmed) return;
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch(`/api/financeiro/contas/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelado" }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg("Lançamento cancelado — o registro fica no histórico.");
        fetchContas();
      } else {
        setError(data.error || "Falha ao cancelar lançamento.");
      }
    } catch {
      setError("Erro de rede.");
    }
  };

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
      const data = await res.json();

      if (res.ok) {
        setSuccessMsg(tipo === "pagar" ? "Conta marcada como paga!" : "Recebimento efetuado!");
        setPayingBill(null);
        fetchContas();
      } else {
        setError(data.error || "Falha ao registrar pagamento.");
      }
    } catch (err) {
      setError("Erro ao se conectar com o servidor.");
    }
  };

  const formatPrice = (value: number) => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pago":
        return "bg-mt-surface border border-mt-regua-fina text-mt-accent-800";
      case "vencido":
        return "bg-mt-accent-100 border border-mt-accent-300 text-mt-accent";
      case "cancelado":
        return "bg-mt-surface border border-mt-regua-fina text-mt-neutral-600";
      case "aguardando_aprovacao":
        return "bg-mt-surface border border-mt-accent-300 text-mt-accent";
      case "pendente":
      default:
        return "bg-mt-accent-100 border border-mt-accent-300 text-mt-accent";
    }
  };

  // O valor do banco é vocabulário técnico; o badge fala com gente.
  const rotuloDoStatus = (status: string) =>
    status === "aguardando_aprovacao" ? "aguardando aprovação" : status;

  // Baixa só em conta que ainda espera dinheiro: paga e cancelada não têm o
  // que baixar, e a aguardando aprovação é decisão do Admin em Aprovações —
  // pagar antes tornaria a alçada decorativa (a rota também recusa).
  const podeDarBaixa = (status: string) =>
    ["pendente", "vencido", "parcial"].includes(status);

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl">
      {/* Page Actions row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 select-none">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full sm:max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por descrição, parceiro..."
            className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-10 w-full focus:outline-none focus:border-mt-accent"
          />
          <button
            type="submit"
            className="h-10 bg-mt-surface hover:bg-mt-surface text-mt-ink border border-mt-regua-fina text-[11px] font-bold uppercase tracking-wider px-4 cursor-pointer"
          >
            Buscar
          </button>
        </form>

        <button
          onClick={() => {
            setSelectedContaId(undefined);
            setIsFormOpen(true);
            setError("");
            setSuccessMsg("");
          }}
          className="h-10 bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-[11px] font-bold uppercase tracking-wider px-4 flex items-center justify-center gap-2  transition-all cursor-pointer w-full sm:w-auto"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          Lançar Conta
        </button>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="bg-mt-surface border border-mt-regua-fina text-mt-accent-800 text-xs px-4 py-3 flex items-center gap-2 select-none">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
            <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
          </svg>
          <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="bg-mt-accent-100 border border-mt-accent-300 text-mt-accent text-xs px-4 py-3 flex items-center gap-2 select-none">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
            <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Grid Layout: Table vs Action Form Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Side: Table & Filters */}
        <div className={`lg:col-span-2 flex flex-col gap-4 ${(isFormOpen || payingBill) ? "hidden lg:flex" : "flex"}`}>
          {/* Quick Date Filters row */}
          <div className="flex flex-wrap items-center gap-3 bg-mt-surface border border-mt-regua-fina p-4 select-none">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-mt-neutral-700 uppercase">Vencimento de:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-3 h-8 cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-mt-neutral-700 uppercase">Até:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-3 h-8 cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-mt-neutral-700 uppercase">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-3 h-8 cursor-pointer"
              >
                <option value="">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="aguardando_aprovacao">Aguardando aprovação</option>
                <option value="pago">Pago</option>
                <option value="vencido">Vencido</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          </div>

          {/* Table list */}
          <div className="bg-mt-surface border border-mt-regua-fina p-6">
            {isLoading ? (
              <div className="py-12 text-center text-xs text-mt-neutral-700">Carregando lançamentos...</div>
            ) : contas.length === 0 ? (
              <div className="py-12 text-center text-xs text-mt-neutral-700">Nenhum lançamento encontrado.</div>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-mt-regua-fina text-mt-neutral-600 font-bold uppercase tracking-wider">
                      <th className="pb-3 pl-2">Descrição</th>
                      <th className="pb-3">Vencimento</th>
                      <th className="pb-3">Parceiro</th>
                      <th className="pb-3">Valor</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3 pr-2 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mt-regua-fina">
                    {contas.map((c) => (
                      <tr key={c.id} className="hover:bg-mt-surface transition-colors">
                        <td className="py-4 pl-2 font-bold text-mt-ink">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span>{c.descricao}</span>
                              {c.total_parcelas > 1 && (
                                <span className="bg-mt-surface text-mt-neutral-700 text-[8px] font-bold px-1">
                                  {c.parcela_atual}/{c.total_parcelas}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-mt-neutral-600 font-normal">
                              {c.categoria?.icone} {c.categoria?.nome || "Outros"}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 text-mt-neutral-700">{formatDate(c.data_vencimento)}</td>
                        <td className="py-4 text-mt-neutral-700">
                          {tipo === "pagar" ? c.fornecedor || "-" : c.cliente || "-"}
                        </td>
                        <td className="py-4 font-extrabold text-mt-ink">{formatPrice(c.valor)}</td>
                        <td className="py-4">
                          <span className={`px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${getStatusBadge(c.status)}`}>
                            {rotuloDoStatus(c.status)}
                          </span>
                        </td>
                        <td className="py-4 pr-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {podeDarBaixa(c.status) && (
                              <button
                                onClick={() => {
                                  setPayingBill(c);
                                  setIsFormOpen(false);
                                }}
                                className="h-7 px-2.5 bg-mt-ink hover:bg-mt-neutral-800 text-mt-inverso font-bold text-[9px] uppercase tracking-wider transition-all cursor-pointer select-none"
                              >
                                {tipo === "pagar" ? "Pagar" : "Receber"}
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setSelectedContaId(c.id);
                                setIsFormOpen(true);
                                setPayingBill(null);
                              }}
                              className="p-1.5 text-mt-neutral-600 hover:text-mt-accent hover:bg-mt-surface transition-all cursor-pointer"
                              title="Editar"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.287.287-.63.502-1.01.633l-3.156 1.262a.75.75 0 0 1-.98-.98Z" />
                              </svg>
                            </button>
                            {podeExcluir ? (
                              <button
                                onClick={() => handleDelete(c.id)}
                                className="p-1.5 text-mt-neutral-600 hover:text-mt-accent hover:bg-mt-accent-100 transition-all cursor-pointer"
                                title="Excluir"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75V4H3.75a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5H14v-.25A2.75 2.75 0 0 0 11.25 1h-2.5ZM8 3.75A1.25 1.25 0 0 1 9.25 2.5h2.5A1.25 1.25 0 0 1 13 3.75V4H8v-.25ZM3.5 7.5a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 .75.75v7.75A2.75 2.75 0 0 1 13.75 18H6.25A2.75 2.75 0 0 1 3.5 15.25V7.5Zm3.5 2a.75.75 0 0 0-1.5 0v4.5a.75.75 0 0 0 1.5 0v-4.5ZM11 9.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
                                </svg>
                              </button>
                            ) : (
                              /* Cancelar só faz sentido enquanto há o que
                                 cancelar: conta paga já virou movimentação de
                                 caixa, e desfazer isso é assunto do Admin. */
                              c.status !== "pago" &&
                              c.status !== "cancelado" && (
                                <button
                                  onClick={() => handleCancelar(c)}
                                  className="h-7 px-2.5 border border-mt-regua-fina text-mt-neutral-700 hover:border-mt-accent hover:text-mt-accent font-bold text-[9px] uppercase tracking-wider transition-all cursor-pointer"
                                  title="Cancelar (mantém o registro no histórico)"
                                >
                                  Cancelar
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Form Action Panel */}
        <div className={`lg:col-span-1 ${(isFormOpen || payingBill) ? "block" : "hidden lg:block"}`}>
          {/* Launch / Edit Account Form */}
          {isFormOpen && (
            <div className="bg-mt-surface border border-mt-regua-fina p-6 flex flex-col gap-4 animate-slideUpPopup">
              <div className="flex items-center justify-between border-b border-mt-regua-fina pb-3 select-none">
                <h3 className="text-[15px] font-extrabold tracking-[-.01em] text-mt-ink">
                  {selectedContaId ? "Editar Lançamento" : "Lançamento Financeiro"}
                </h3>
              </div>
              <ContaForm
                contaId={selectedContaId}
                tipoDefault={tipo}
                onClose={() => setIsFormOpen(false)}
                onSuccess={() => {
                  setSuccessMsg(selectedContaId ? "Lançamento atualizado!" : "Lançamento efetuado!");
                  fetchContas();
                }}
              />
            </div>
          )}

          {/* Pay Account Quick Form */}
          {payingBill && (
            <div className="bg-mt-surface border border-mt-regua-fina p-6 flex flex-col gap-4 animate-slideUpPopup">
              <div className="flex flex-col gap-0.5 border-b border-mt-regua-fina pb-3 select-none">
                <h3 className="text-[15px] font-extrabold tracking-[-.01em] text-mt-ink">
                  {tipo === "pagar" ? "Efetuar Pagamento" : "Confirmar Recebimento"}
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
          )}

          {!isFormOpen && !payingBill && (
            <div className="bg-mt-surface border border-dashed border-mt-regua-fina p-8 text-center text-xs text-mt-neutral-600 select-none">
              Selecione uma conta para dar baixa ou clique em "Lançar Conta" para registrar um novo fluxo.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
