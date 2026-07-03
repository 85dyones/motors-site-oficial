"use client";

import { useEffect, useState } from "react";

interface Category {
  id: string;
  nome: string;
  tipo: string;
  icone: string;
}

interface Vehicle {
  id: string;
  marca: string;
  modelo: string;
  versao: string;
  ano: number;
}

interface ContaFormProps {
  contaId?: string; // If set, we are in EDIT mode
  tipoDefault?: "pagar" | "receber";
  onClose: () => void;
  onSuccess: () => void;
}

export default function ContaForm({ contaId, tipoDefault = "pagar", onClose, onSuccess }: ContaFormProps) {
  const [tipo, setTipo] = useState<"pagar" | "receber">(tipoDefault);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [dataVencimento, setDataVencimento] = useState("");
  const [status, setStatus] = useState("pendente");
  const [categoriaId, setCategoriaId] = useState("");
  const [veiculoId, setVeiculoId] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [cliente, setCliente] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [totalParcelas, setTotalParcelas] = useState("1");
  const [observacoes, setObservacoes] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Fetch categories and vehicles on mount
    const loadFormData = async () => {
      try {
        const [catRes, vehRes] = await Promise.all([
          fetch("/api/financeiro/categorias"),
          fetch("/api/estoque"),
        ]);
        
        if (catRes.ok) {
          const catData = await catRes.json();
          setCategories(catData.categories || []);
        }
        if (vehRes.ok) {
          const vehData = await vehRes.json();
          setVehicles(vehData.veiculos || []);
        }
      } catch (err) {
        console.error("Failed to load form fields options:", err);
      }
    };

    loadFormData();
  }, []);

  useEffect(() => {
    // If in EDIT mode, fetch existing account details
    if (contaId) {
      const loadContaDetails = async () => {
        setIsLoading(true);
        try {
          const res = await fetch(`/api/financeiro/contas/${contaId}`);
          if (res.ok) {
            const data = await res.json();
            const c = data.conta;
            setTipo(c.tipo);
            setDescricao(c.descricao);
            setValor(c.valor.toString());
            setDataVencimento(c.data_vencimento);
            setStatus(c.status);
            setCategoriaId(c.categoria_id || "");
            setVeiculoId(c.veiculo_id || "");
            setFornecedor(c.fornecedor || "");
            setCliente(c.cliente || "");
            setFormaPagamento(c.forma_pagamento || "");
            setTotalParcelas(c.total_parcelas?.toString() || "1");
            setObservacoes(c.observacoes || "");
          }
        } catch (err) {
          setError("Falha ao carregar detalhes da conta.");
        } finally {
          setIsLoading(false);
        }
      };
      loadContaDetails();
    }
  }, [contaId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const payload = {
      tipo,
      descricao,
      valor: parseFloat(valor),
      data_vencimento: dataVencimento,
      status,
      categoria_id: categoriaId || null,
      veiculo_id: veiculoId || null,
      fornecedor: tipo === "pagar" ? fornecedor : null,
      cliente: tipo === "receber" ? cliente : null,
      forma_pagamento: formaPagamento || null,
      total_parcelas: parseInt(totalParcelas) || 1,
      observacoes: observacoes || null,
    };

    try {
      const url = contaId ? `/api/financeiro/contas/${contaId}` : "/api/financeiro/contas";
      const method = contaId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        setError(data.error || "Erro ao salvar conta.");
      }
    } catch (err) {
      setError("Erro ao se conectar com o servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredCategories = categories.filter((c) => c.tipo === tipo);

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs px-4 py-2.5 rounded-xl">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Toggle Pagar/Receber (Only when creating) */}
        {!contaId && (
          <div className="flex items-center gap-2 border border-brand-border/40 rounded-xl p-1 bg-brand-bg/30 w-fit select-none">
            <button
              type="button"
              onClick={() => setTipo("pagar")}
              className={`px-4 py-1.5 text-[10px] font-bold uppercase rounded-lg transition-all cursor-pointer ${
                tipo === "pagar"
                  ? "bg-red-600 text-white shadow-md"
                  : "text-brand-text/50 hover:text-brand-text"
              }`}
            >
              A Pagar
            </button>
            <button
              type="button"
              onClick={() => setTipo("receber")}
              className={`px-4 py-1.5 text-[10px] font-bold uppercase rounded-lg transition-all cursor-pointer ${
                tipo === "receber"
                  ? "bg-emerald-600 text-white shadow-md"
                  : "text-brand-text/50 hover:text-brand-text"
              }`}
            >
              A Receber
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Descrição */}
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Descrição</label>
            <input
              type="text"
              required
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Aluguel do Showroom, Compra de Peças, Venda de Fox"
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
            />
          </div>

          {/* Valor */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Valor (R$)</label>
            <input
              type="number"
              step="0.01"
              required
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
            />
          </div>

          {/* Vencimento */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Vencimento</label>
            <input
              type="date"
              required
              value={dataVencimento}
              onChange={(e) => setDataVencimento(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
            />
          </div>

          {/* Categoria */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Categoria</label>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              required
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
            >
              <option value="">Selecione...</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icone} {c.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Parcelamento (Only when creating) */}
          {!contaId ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Parcelas</label>
              <select
                value={totalParcelas}
                onChange={(e) => setTotalParcelas(e.target.value)}
                className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
              >
                <option value="1">1x (À vista)</option>
                <option value="2">2x</option>
                <option value="3">3x</option>
                <option value="4">4x</option>
                <option value="5">5x</option>
                <option value="6">6x</option>
                <option value="10">10x</option>
                <option value="12">12x</option>
                <option value="24">24x</option>
                <option value="36">36x</option>
              </select>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
              >
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          )}

          {/* Fornecedor / Cliente (Conditional) */}
          {tipo === "pagar" ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Fornecedor</label>
              <input
                type="text"
                value={fornecedor}
                onChange={(e) => setFornecedor(e.target.value)}
                placeholder="Nome do fornecedor"
                className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Cliente</label>
              <input
                type="text"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                placeholder="Nome do cliente"
                className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
              />
            </div>
          )}

          {/* Forma de Pagamento */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Forma de Pagamento</label>
            <select
              value={formaPagamento}
              onChange={(e) => setFormaPagamento(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
            >
              <option value="">Selecione...</option>
              <option value="pix">PIX</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="boleto">Boleto Bancário</option>
              <option value="transferencia">Ted / Doc</option>
              <option value="cartao_credito">Cartão de Crédito</option>
              <option value="cartao_debito">Cartão de Débito</option>
              <option value="financiamento">Financiamento</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>

          {/* Vinculo de Veículo */}
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Vincular a Veículo (Opcional)</label>
            <select
              value={veiculoId}
              onChange={(e) => setVeiculoId(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
            >
              <option value="">Não vincular</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.marca} {v.modelo} - {v.ano} ({v.versao})
                </option>
              ))}
            </select>
          </div>

          {/* Observações */}
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Observações</label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Detalhes adicionais..."
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text p-4 h-24 w-full focus:outline-none focus:border-brand-primary resize-none"
            />
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center gap-2.5 mt-2 border-t border-brand-border/40 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 bg-transparent hover:bg-brand-card/50 text-brand-text/70 hover:text-brand-text border border-brand-border text-[11px] font-bold uppercase tracking-wider rounded-xl cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 h-11 bg-brand-primary text-white text-[11px] font-bold uppercase tracking-wider rounded-xl cursor-pointer disabled:opacity-50"
          >
            {isLoading ? "Salvando..." : contaId ? "Salvar Alterações" : "Lançar Conta"}
          </button>
        </div>
      </form>
    </div>
  );
}
