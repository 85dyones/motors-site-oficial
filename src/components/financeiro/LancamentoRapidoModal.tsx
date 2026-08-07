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
    <div className="fixed inset-0 z-50 bg-mt-inverso-fundo/80 flex items-center justify-center p-4 select-none">
      <div className="bg-mt-surface border border-mt-regua-fina max-w-lg w-full p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between border-b border-mt-regua-fina pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <div>
              <h3 className="text-sm font-extrabold text-mt-ink uppercase tracking-wider">
                Lançamento Rápido de 10 Segundos
              </h3>
              <p className="text-[10px] text-mt-neutral-700 uppercase">Despesas Corriqueiras do Dia a Dia</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-mt-neutral-700 hover:text-mt-ink text-lg font-bold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="bg-mt-accent-100 border border-mt-accent-300 text-mt-accent text-xs px-4 py-2.5">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Tipo selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipo("pagar")}
              className={`py-2.5 text-xs font-extrabold uppercase tracking-wider border transition-all cursor-pointer ${
                tipo === "pagar"
                  ? "bg-mt-accent text-mt-inverso border-mt-accent"
                  : "bg-mt-bg text-mt-neutral-700 border-mt-regua-fina"
              }`}
            >
              🔴 Conta a Pagar (Saída)
            </button>
            <button
              type="button"
              onClick={() => setTipo("receber")}
              className={`py-2.5 text-xs font-extrabold uppercase tracking-wider border transition-all cursor-pointer ${
                tipo === "receber"
                  ? "bg-mt-ink text-mt-inverso border-mt-ink"
                  : "bg-mt-bg text-mt-neutral-700 border-mt-regua-fina"
              }`}
            >
              🟢 Conta a Receber (Entrada)
            </button>
          </div>

          {/* Quick Category Pills */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold uppercase text-mt-neutral-700">Atalho Rápido de Categoria</span>
            <div className="flex flex-wrap gap-1.5">
              {quickPills.map((pill) => (
                <button
                  key={pill.codigo}
                  type="button"
                  onClick={() => setPlanoCodigo(pill.codigo)}
                  className={`text-[10px] font-bold px-2.5 py-1 border transition-all cursor-pointer ${
                    planoCodigo === pill.codigo
                      ? "bg-mt-accent text-mt-inverso border-mt-accent"
                      : "bg-mt-bg text-mt-neutral-800 border-mt-regua-fina hover:border-mt-accent"
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
              <label className="text-[9px] font-bold uppercase text-mt-neutral-700">Descrição da Despesa</label>
              <input
                type="text"
                required
                placeholder="Ex: Troca de óleo, Uber cartório..."
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="bg-mt-bg border border-mt-regua-fina px-3.5 h-11 text-xs text-mt-ink outline-none focus:border-mt-accent"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold uppercase text-mt-neutral-700">Valor (R$)</label>
              <input
                type="text"
                required
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="bg-mt-bg border border-mt-regua-fina px-3.5 h-11 text-xs text-mt-ink font-mono font-bold outline-none focus:border-mt-accent text-right"
              />
            </div>
          </div>

          {/* Date, Partner & Vehicle Placa */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold uppercase text-mt-neutral-700">Vencimento</label>
              <input
                type="date"
                required
                value={dataVencimento}
                onChange={(e) => setDataVencimento(e.target.value)}
                className="bg-mt-bg border border-mt-regua-fina px-3 h-10 text-xs text-mt-ink outline-none focus:border-mt-accent"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold uppercase text-mt-neutral-700">Fornecedor / Local</label>
              <input
                type="text"
                placeholder="Ex: Posto Shell, AutoPeças"
                value={fornecedorCliente}
                onChange={(e) => setFornecedorCliente(e.target.value)}
                className="bg-mt-bg border border-mt-regua-fina px-3 h-10 text-xs text-mt-ink outline-none focus:border-mt-accent"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold uppercase text-mt-neutral-700">Placa Veículo (Opcional)</label>
              <input
                type="text"
                placeholder="Ex: ABC-1234"
                value={veiculoPlaca}
                onChange={(e) => setVeiculoPlaca(e.target.value)}
                className="bg-mt-bg border border-mt-regua-fina px-3 h-10 text-xs text-mt-ink uppercase font-mono outline-none focus:border-mt-accent"
              />
            </div>
          </div>

          {/* Plano de contas selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold uppercase text-mt-neutral-700">Plano de Contas Oficial de Revenda</label>
            <select
              value={planoCodigo}
              onChange={(e) => setPlanoCodigo(e.target.value)}
              className="bg-mt-bg border border-mt-regua-fina px-3 h-10 text-xs text-mt-ink outline-none focus:border-mt-accent font-mono cursor-pointer"
            >
              {PLANO_DE_CONTAS_REVENDA.filter(c => c.permiteLancamento).map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.codigo} - {c.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-mt-regua-fina mt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-mt-bg border border-mt-regua-fina text-mt-neutral-700 text-xs font-bold uppercase hover:bg-mt-accent-100 transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2.5 bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-xs font-extrabold uppercase tracking-wider transition-all  cursor-pointer disabled:opacity-50"
            >
              {isLoading ? "Salvando..." : "⚡ Confirmar Lançamento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
