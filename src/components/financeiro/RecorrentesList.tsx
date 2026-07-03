"use client";

import { useEffect, useState } from "react";
import RecorrenteForm from "./RecorrenteForm";

interface RecorrenteItem {
  id: string;
  descricao: string;
  valor: number;
  frequencia: string;
  dia_vencimento: number;
  ativa: boolean;
  proxima_geracao?: string;
  fornecedor?: string;
  categoria?: {
    nome: string;
    cor: string;
    icone: string;
  };
}

export default function RecorrentesList() {
  const [recorrentes, setRecorrentes] = useState<RecorrenteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [isGenerating, setIsGenerating] = useState(false);

  const fetchRecorrentes = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/financeiro/recorrentes");
      const data = await res.json();
      if (res.ok) {
        setRecorrentes(data.recurring || []);
      } else {
        setError(data.error || "Falha ao carregar recorrências.");
      }
    } catch (err) {
      setError("Erro ao se conectar com o servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecorrentes();
  }, []);

  const handleToggleAtiva = async (id: string, currentStatus: boolean) => {
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/financeiro/recorrentes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativa: !currentStatus }),
      });
      if (res.ok) {
        setSuccessMsg("Status de recorrência atualizado!");
        fetchRecorrentes();
      } else {
        const data = await res.json();
        setError(data.error || "Falha ao alterar status.");
      }
    } catch (err) {
      setError("Erro ao se conectar.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta despesa recorrente impedirá novas cobranças automáticas. Confirmar?")) return;
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch(`/api/financeiro/recorrentes/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSuccessMsg("Recorrência excluída com sucesso!");
        fetchRecorrentes();
      } else {
        const data = await res.json();
        setError(data.error || "Falha ao excluir.");
      }
    } catch (err) {
      setError("Erro de rede.");
    }
  };

  const handleForceGenerate = async () => {
    setIsGenerating(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch("/api/financeiro/recorrentes/gerar", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`Processado com sucesso! ${data.generatedCount} lançamentos gerados.`);
        fetchRecorrentes();
      } else {
        setError(data.error || "Falha no processamento.");
      }
    } catch (err) {
      setError("Erro de conexão.");
    } finally {
      setIsGenerating(false);
    }
  };

  const formatPrice = (value: number) => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const getFreqLabel = (f: string) => {
    switch (f) {
      case "semanal": return "Semanal";
      case "quinzenal": return "Quinzenal";
      case "mensal": return "Mensal";
      case "bimestral": return "Bimestral";
      case "trimestral": return "Trimestral";
      case "semestral": return "Semestral";
      case "anual": return "Anual";
      default: return f;
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl">
      {/* Action panel header */}
      <div className="flex items-center justify-between border-b border-brand-border/40 pb-4 select-none">
        <button
          onClick={handleForceGenerate}
          disabled={isGenerating}
          className="h-10 border border-brand-border hover:border-brand-primary/50 text-[11px] font-bold uppercase tracking-wider px-4 rounded-xl transition-all cursor-pointer bg-brand-bg/50 hover:bg-brand-primary/5 disabled:opacity-50"
        >
          {isGenerating ? "Processando..." : "Rodar Rotina de Geração"}
        </button>

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
          Nova Recorrência
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
        {/* Table representation */}
        <div className="lg:col-span-2 bg-brand-card/30 border border-brand-border/40 rounded-3xl p-6 backdrop-blur-md">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-brand-text/50">Carregando despesas recorrentes...</div>
          ) : recorrentes.length === 0 ? (
            <div className="py-12 text-center text-xs text-brand-text/50">Nenhuma despesa recorrente registrada.</div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-brand-border/40 text-brand-text/40 font-bold uppercase tracking-wider">
                    <th className="pb-3 pl-2">Descrição</th>
                    <th className="pb-3">Período</th>
                    <th className="pb-3">Vencimento</th>
                    <th className="pb-3">Valor Estimado</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 pr-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/20">
                  {recorrentes.map((r) => (
                    <tr key={r.id} className="hover:bg-brand-card/10 transition-colors">
                      <td className="py-4 pl-2 font-bold text-brand-text">
                        <div className="flex flex-col gap-0.5">
                          <span>{r.descricao}</span>
                          <span className="text-[10px] text-brand-text/40 font-normal">
                            {r.categoria?.icone} {r.categoria?.nome || "Outros"}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 text-brand-text/70">{getFreqLabel(r.frequencia)}</td>
                      <td className="py-4 text-brand-text/70">
                        <div className="flex flex-col gap-0.5">
                          <span>Dia {r.dia_vencimento}</span>
                          <span className="text-[10px] text-brand-text/40">Próx: {formatDate(r.proxima_geracao)}</span>
                        </div>
                      </td>
                      <td className="py-4 font-black text-brand-text">{formatPrice(r.valor)}</td>
                      <td className="py-4">
                        <button
                          onClick={() => handleToggleAtiva(r.id, r.ativa)}
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                            r.ativa
                              ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-500"
                              : "bg-zinc-500/10 border border-zinc-500/20 text-zinc-500"
                          }`}
                        >
                          {r.ativa ? "Ativa" : "Pausada"}
                        </button>
                      </td>
                      <td className="py-4 pr-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedId(r.id);
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
                            onClick={() => handleDelete(r.id)}
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
                {selectedId ? "Editar Recorrência" : "Nova Despesa Recorrente"}
              </h3>
              <RecorrenteForm
                recorrenteId={selectedId}
                onClose={() => setIsFormOpen(false)}
                onSuccess={() => {
                  setSuccessMsg(selectedId ? "Lançamento recorrente editado!" : "Lançamento recorrente registrado!");
                  fetchRecorrentes();
                }}
              />
            </div>
          ) : (
            <div className="bg-brand-card/10 border border-dashed border-brand-border/40 rounded-3xl p-8 text-center text-xs text-brand-text/40 select-none">
              Selecione uma recorrência para configurar ou clique em "Nova Recorrência" para criar um agendamento.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
