"use client";

import { useState } from "react";
import { PLANO_DE_CONTAS_REVENDA } from "@/lib/planoContasData";

interface LancamentoRapidoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function LancamentoRapidoModal({ isOpen, onClose, onSuccess }: LancamentoRapidoModalProps) {
  const [tipo, setTipo] = useState<"pagar" | "receber">("pagar");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [dataVencimento, setDataVencimento] = useState(new Date().toISOString().split("T")[0]);
  const [planoCodigo, setPlanoCodigo] = useState("003.005.006.016"); // Default: PEÇAS E MANUTENÇÃO
  const [fornecedorCliente, setFornecedorCliente] = useState("");
  const [veiculoPlaca, setVeiculoPlaca] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descricao.trim() || !valor || !dataVencimento) {
      setError("Preencha descrição, valor e vencimento.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const selectedAccount = PLANO_DE_CONTAS_REVENDA.find(c => c.codigo === planoCodigo);
      const descFinal = veiculoPlaca ? `${descricao.trim()} (Veículo/Placa: ${veiculoPlaca.toUpperCase()})` : descricao.trim();

      const payload = {
        tipo,
        descricao: descFinal,
        valor: parseFloat(valor.replace(",", ".")),
        data_vencimento: dataVencimento,
        status: "pendente",
        fornecedor: tipo === "pagar" ? (fornecedorCliente || "Fornecedor Local") : null,
        cliente: tipo === "receber" ? (fornecedorCliente || "Cliente Local") : null,
        observacoes: `Lançamento Rápido (10s) — Plano: ${planoCodigo} - ${selectedAccount?.nome || 'Geral'}`,
      };

      const res = await fetch("/api/financeiro/contas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        onSuccess();
        onClose();
        // Reset form
        setDescricao("");
        setValor("");
        setFornecedorCliente("");
        setVeiculoPlaca("");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erro ao registrar lançamento rápido.");
      }
    } catch (err: any) {
      setError("Erro de rede ao salvar lançamento.");
    } finally {
      setIsLoading(false);
    }
  };

  const quickPills = [
    { label: "🔧 Peças", codigo: "003.005.006.016" },
    { label: "🧼 Lavacar", codigo: "002.001.001.003" },
    { label: "⛽ Combustível", codigo: "003.005.001.029" },
    { label: "📄 Cartório", codigo: "003.005.001.002" },
    { label: "🚘 Vistoria", codigo: "003.005.006.026" },
    { label: "🚕 Uber/Táxi", codigo: "003.005.001.028" },
    { label: "☕ Cantina/Almoço", codigo: "003.005.001.016" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-fadeIn">
      <div className="bg-brand-card border border-brand-border/60 rounded-3xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-5">
        <div className="flex items-center justify-between border-b border-brand-border/40 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <div>
              <h3 className="text-sm font-extrabold text-brand-text uppercase tracking-wider">
                Lançamento Rápido de 10 Segundos
              </h3>
              <p className="text-[10px] text-brand-text/70 uppercase">Despesas Corriqueiras do Dia a Dia</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-brand-text/50 hover:text-brand-text text-lg font-bold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs px-4 py-2.5 rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Tipo selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipo("pagar")}
              className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all cursor-pointer ${
                tipo === "pagar"
                  ? "bg-red-500 text-white border-red-500 shadow-md"
                  : "bg-brand-bg text-brand-text/70 border-brand-border"
              }`}
            >
              🔴 Conta a Pagar (Saída)
            </button>
            <button
              type="button"
              onClick={() => setTipo("receber")}
              className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all cursor-pointer ${
                tipo === "receber"
                  ? "bg-emerald-500 text-white border-emerald-500 shadow-md"
                  : "bg-brand-bg text-brand-text/70 border-brand-border"
              }`}
            >
              🟢 Conta a Receber (Entrada)
            </button>
          </div>

          {/* Quick Category Pills */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold uppercase text-brand-text/60">Atalho Rápido de Categoria</span>
            <div className="flex flex-wrap gap-1.5">
              {quickPills.map((pill) => (
                <button
                  key={pill.codigo}
                  type="button"
                  onClick={() => setPlanoCodigo(pill.codigo)}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                    planoCodigo === pill.codigo
                      ? "bg-brand-primary text-white border-brand-primary"
                      : "bg-brand-bg text-brand-text/80 border-brand-border/60 hover:border-brand-primary/40"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description & Value */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 flex flex-col gap-1">
              <label className="text-[9px] font-bold uppercase text-brand-text/70">Descrição da Despesa</label>
              <input
                type="text"
                required
                placeholder="Ex: Troca de óleo, Uber cartório..."
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="bg-brand-bg border border-brand-border rounded-xl px-3.5 h-11 text-xs text-brand-text outline-none focus:border-brand-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold uppercase text-brand-text/70">Valor (R$)</label>
              <input
                type="text"
                required
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="bg-brand-bg border border-brand-border rounded-xl px-3.5 h-11 text-xs text-brand-text font-mono font-bold outline-none focus:border-brand-primary text-right"
              />
            </div>
          </div>

          {/* Date, Partner & Vehicle Placa */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold uppercase text-brand-text/70">Vencimento</label>
              <input
                type="date"
                required
                value={dataVencimento}
                onChange={(e) => setDataVencimento(e.target.value)}
                className="bg-brand-bg border border-brand-border rounded-xl px-3 h-10 text-xs text-brand-text outline-none focus:border-brand-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold uppercase text-brand-text/70">Fornecedor / Local</label>
              <input
                type="text"
                placeholder="Ex: Posto Shell, AutoPeças"
                value={fornecedorCliente}
                onChange={(e) => setFornecedorCliente(e.target.value)}
                className="bg-brand-bg border border-brand-border rounded-xl px-3 h-10 text-xs text-brand-text outline-none focus:border-brand-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold uppercase text-brand-text/70">Placa Veículo (Opcional)</label>
              <input
                type="text"
                placeholder="Ex: ABC-1234"
                value={veiculoPlaca}
                onChange={(e) => setVeiculoPlaca(e.target.value)}
                className="bg-brand-bg border border-brand-border rounded-xl px-3 h-10 text-xs text-brand-text uppercase font-mono outline-none focus:border-brand-primary"
              />
            </div>
          </div>

          {/* Plano de contas selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold uppercase text-brand-text/70">Plano de Contas Oficial de Revenda</label>
            <select
              value={planoCodigo}
              onChange={(e) => setPlanoCodigo(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-xl px-3 h-10 text-xs text-brand-text outline-none focus:border-brand-primary font-mono cursor-pointer"
            >
              {PLANO_DE_CONTAS_REVENDA.filter(c => c.permiteLancamento).map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.codigo} - {c.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-brand-border/40 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-brand-bg border border-brand-border text-brand-text/70 text-xs font-bold uppercase rounded-xl hover:bg-brand-primary/10 transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2.5 bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? "Salvando..." : "⚡ Confirmar Lançamento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
