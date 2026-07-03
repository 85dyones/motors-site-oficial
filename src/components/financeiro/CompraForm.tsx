"use client";

import { useEffect, useState } from "react";

interface Vehicle {
  id: string;
  marca: string;
  modelo: string;
  versao: string;
  ano: number;
}

interface CompraFormProps {
  compraId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CompraForm({ compraId, onClose, onSuccess }: CompraFormProps) {
  const [descricao, setDescricao] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [valorUnitario, setValorUnitario] = useState("");
  const [dataCompra, setDataCompra] = useState(new Date().toISOString().split("T")[0]);
  const [categoria, setCategoria] = useState("peca_reposicao");
  const [veiculoId, setVeiculoId] = useState("");
  const [notaFiscal, setNotaFiscal] = useState("");
  const [status, setStatus] = useState("recebido");
  const [formaPagamento, setFormaPagamento] = useState("pix");

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadVehicles = async () => {
      try {
        const res = await fetch("/api/estoque");
        if (res.ok) {
          const data = await res.json();
          setVehicles(data.veiculos || []);
        }
      } catch (err) {
        console.error("Failed to load vehicles list:", err);
      }
    };
    loadVehicles();
  }, []);

  useEffect(() => {
    if (compraId) {
      const loadDetails = async () => {
        setIsLoading(true);
        try {
          const res = await fetch("/api/financeiro/compras");
          if (res.ok) {
            const data = await res.json();
            const item = data.compras?.find((c: any) => c.id === compraId);
            if (item) {
              setDescricao(item.descricao);
              setFornecedor(item.fornecedor);
              setValorTotal(item.valor_total.toString());
              setQuantidade(item.quantidade.toString());
              setValorUnitario(item.valor_unitario?.toString() || "");
              setDataCompra(item.data_compra);
              setCategoria(item.categoria);
              setVeiculoId(item.veiculo_id || "");
              setNotaFiscal(item.nota_fiscal || "");
              setStatus(item.status);
            }
          }
        } catch (err) {
          setError("Erro ao carregar detalhes.");
        } finally {
          setIsLoading(false);
        }
      };
      loadDetails();
    }
  }, [compraId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const payload = {
      descricao,
      fornecedor,
      valor_total: parseFloat(valorTotal),
      quantidade: parseInt(quantidade),
      valor_unitario: valorUnitario ? parseFloat(valorUnitario) : parseFloat(valorTotal) / parseInt(quantidade),
      data_compra: dataCompra,
      categoria,
      veiculo_id: veiculoId || null,
      nota_fiscal: notaFiscal || null,
      status,
      forma_pagamento: formaPagamento,
    };

    try {
      const url = compraId ? `/api/financeiro/compras/${compraId}` : "/api/financeiro/compras";
      const method = compraId ? "PUT" : "POST";

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
        setError(data.error || "Erro ao salvar compra.");
      }
    } catch (err) {
      setError("Erro ao conectar com o servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs px-4 py-2.5 rounded-xl">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Item / Descrição da Compra</label>
          <input
            type="text"
            required
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: 4 Pneus Aro 17, Pastilhas de Freio"
            className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Fornecedor</label>
            <input
              type="text"
              required
              value={fornecedor}
              onChange={(e) => setFornecedor(e.target.value)}
              placeholder="Nome do Fornecedor"
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Data da Compra</label>
            <input
              type="date"
              required
              value={dataCompra}
              onChange={(e) => setDataCompra(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Valor Total (R$)</label>
            <input
              type="number"
              step="0.01"
              required
              value={valorTotal}
              onChange={(e) => setValorTotal(e.target.value)}
              placeholder="0,00"
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Quantidade</label>
            <input
              type="number"
              required
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              placeholder="1"
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Valor Unitário (R$)</label>
            <input
              type="number"
              step="0.01"
              value={valorUnitario}
              onChange={(e) => setValorUnitario(e.target.value)}
              placeholder="Opcional (calculado auto)"
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Categoria do Produto</label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
            >
              <option value="peca_reposicao">Peças de Reposição</option>
              <option value="acessorio">Acessórios</option>
              <option value="ferramenta">Ferramentas</option>
              <option value="combustivel">Combustível</option>
              <option value="material_escritorio">Escritório</option>
              <option value="material_limpeza">Limpeza</option>
              <option value="outro">Outros</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Forma de Pagamento Prevista</label>
            <select
              value={formaPagamento}
              onChange={(e) => setFormaPagamento(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
            >
              <option value="pix">PIX</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="boleto">Boleto Bancário</option>
              <option value="transferencia">Ted / Doc</option>
              <option value="cartao_credito">Cartão de Crédito</option>
              <option value="cartao_debito">Cartão de Débito</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Nota Fiscal</label>
            <input
              type="text"
              value={notaFiscal}
              onChange={(e) => setNotaFiscal(e.target.value)}
              placeholder="Número / Série"
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Status da Compra</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
            >
              <option value="recebido">Recebido</option>
              <option value="encomendado">Encomendado</option>
              <option value="pendente">Pendente / Aguardando</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>

          {/* Bind to vehicle */}
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Vincular Custo ao Veículo</label>
            <select
              value={veiculoId}
              onChange={(e) => setVeiculoId(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
            >
              <option value="">Não vincular (Custo Geral)</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.marca} {v.modelo} - {v.ano} ({v.versao})
                </option>
              ))}
            </select>
          </div>
        </div>

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
            {isLoading ? "Salvando..." : compraId ? "Salvar Compra" : "Registrar Compra"}
          </button>
        </div>
      </form>
    </div>
  );
}
