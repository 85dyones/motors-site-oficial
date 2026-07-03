"use client";

import { useEffect, useState } from "react";
import CompraForm from "./CompraForm";

interface CompraItem {
  id: string;
  descricao: string;
  fornecedor: string;
  valor_total: number;
  quantidade: number;
  valor_unitario: number;
  data_compra: string;
  categoria: string;
  veiculo_id?: string;
  nota_fiscal?: string;
  status: "recebido" | "encomendado" | "pendente" | "cancelado";
  conta_id?: string;
}

export default function ComprasList() {
  const [compras, setCompras] = useState<CompraItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const fetchCompras = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/financeiro/compras");
      const data = await res.json();
      if (res.ok) {
        setCompras(data.compras || []);
      } else {
        setError(data.error || "Falha ao carregar compras.");
      }
    } catch (err) {
      setError("Erro ao se conectar com o servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCompras();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta compra não apagará automaticamente a conta a pagar correspondente. Confirmar?")) return;
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch(`/api/financeiro/compras/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSuccessMsg("Registro de compra excluído!");
        fetchCompras();
      } else {
        const data = await res.json();
        setError(data.error || "Falha ao excluir.");
      }
    } catch (err) {
      setError("Erro de rede.");
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

  const getStatusBadge = (s: string) => {
    switch (s) {
      case "recebido": return "bg-emerald-500/10 border border-emerald-500/20 text-emerald-500";
      case "encomendado": return "bg-brand-gold/10 border border-brand-gold/20 text-brand-gold";
      case "pendente": return "bg-amber-500/10 border border-amber-500/20 text-amber-500";
      case "cancelado": default: return "bg-zinc-500/10 border border-zinc-500/20 text-zinc-500";
    }
  };

  const getCatLabel = (c: string) => {
    switch (c) {
      case "peca_reposicao": return "Peças";
      case "acessorio": return "Acessórios";
      case "ferramenta": return "Ferramentas";
      case "combustivel": return "Combustível";
      case "material_escritorio": return "Escritório";
      case "material_limpeza": return "Limpeza";
      case "outro": default: return "Outros";
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl">
      {/* List Action header */}
      <div className="flex items-center justify-end border-b border-brand-border/40 pb-4 select-none">
        <button
          onClick={() => {
            setSelectedId(undefined);
            setIsFormOpen(true);
            setError("");
            setSuccessMsg("");
          }}
          className="h-10 bg-brand-primary hover:bg-brand-primary/95 text-white text-[11px] font-bold uppercase tracking-wider px-4 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer shadow-md select-none"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          Registrar Compra
        </button>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs px-4 py-3 rounded-xl flex items-center gap-2 select-none">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
            <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
          </svg>
          <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs px-4 py-3 rounded-xl flex items-center gap-2 select-none">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
            <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Grid List layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Table of items */}
        <div className="lg:col-span-2 bg-brand-card/30 border border-brand-border/40 rounded-3xl p-6 backdrop-blur-md">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-brand-text/50">Carregando compras...</div>
          ) : compras.length === 0 ? (
            <div className="py-12 text-center text-xs text-brand-text/50">Nenhuma compra registrada.</div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-brand-border/40 text-brand-text/40 font-bold uppercase tracking-wider">
                    <th className="pb-3 pl-2">Item</th>
                    <th className="pb-3">Data</th>
                    <th className="pb-3">Fornecedor</th>
                    <th className="pb-3">Qtd / Unit</th>
                    <th className="pb-3">Total</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 pr-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/20">
                  {compras.map((c) => (
                    <tr key={c.id} className="hover:bg-brand-card/10 transition-colors">
                      <td className="py-4 pl-2 font-bold text-brand-text">
                        <div className="flex flex-col gap-0.5">
                          <span>{c.descricao}</span>
                          <span className="text-[10px] text-brand-text/40 font-normal">
                            📦 {getCatLabel(c.categoria)} {c.nota_fiscal ? `• NF: ${c.nota_fiscal}` : ""}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 text-brand-text/70">{formatDate(c.data_compra)}</td>
                      <td className="py-4 text-brand-text/70">{c.fornecedor}</td>
                      <td className="py-4 text-brand-text/70">
                        {c.quantidade}x • {formatPrice(c.valor_unitario)}
                      </td>
                      <td className="py-4 font-black text-brand-text">{formatPrice(c.valor_total)}</td>
                      <td className="py-4">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${getStatusBadge(c.status)}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-4 pr-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedId(c.id);
                              setIsFormOpen(true);
                            }}
                            className="p-1.5 text-brand-text/40 hover:text-brand-gold hover:bg-brand-card/50 rounded-lg transition-all cursor-pointer"
                            title="Editar"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                              <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.287.287-.63.502-1.01.633l-3.156 1.262a.75.75 0 0 1-.98-.98Z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="p-1.5 text-brand-text/40 hover:text-red-500 hover:bg-red-500/5 rounded-lg transition-all cursor-pointer"
                            title="Excluir"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75V4H3.75a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5H14v-.25A2.75 2.75 0 0 0 11.25 1h-2.5ZM8 3.75A1.25 1.25 0 0 1 9.25 2.5h2.5A1.25 1.25 0 0 1 13 3.75V4H8v-.25ZM3.5 7.5a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 .75.75v7.75A2.75 2.75 0 0 1 13.75 18H6.25A2.75 2.75 0 0 1 3.5 15.25V7.5Zm3.5 2a.75.75 0 0 0-1.5 0v4.5a.75.75 0 0 0 1.5 0v-4.5ZM11 9.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right side form */}
        <div className="lg:col-span-1">
          {isFormOpen ? (
            <div className="bg-brand-card/30 border border-brand-border/40 rounded-3xl p-6 backdrop-blur-md flex flex-col gap-4 animate-slideUpPopup">
              <h3 className="text-sm font-extrabold uppercase text-brand-text select-none">
                {selectedId ? "Editar Compra" : "Nova Compra"}
              </h3>
              <CompraForm
                compraId={selectedId}
                onClose={() => setIsFormOpen(false)}
                onSuccess={() => {
                  setSuccessMsg(selectedId ? "Registro de compra atualizado!" : "Compra registrada!");
                  fetchCompras();
                }}
              />
            </div>
          ) : (
            <div className="bg-brand-card/10 border border-dashed border-brand-border/40 rounded-3xl p-8 text-center text-xs text-brand-text/40 select-none">
              Selecione um registro para detalhar ou clique em "Registrar Compra" para registrar novas mercadorias.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
