"use client";

import { useEffect, useState } from "react";

interface Category {
  id: string;
  nome: string;
  tipo: string;
  icone: string;
}

interface RecorrenteFormProps {
  recorrenteId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RecorrenteForm({ recorrenteId, onClose, onSuccess }: RecorrenteFormProps) {
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [frequencia, setFrequencia] = useState("mensal");
  const [diaVencimento, setDiaVencimento] = useState("5");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [ativa, setAtiva] = useState(true);
  const [observacoes, setObservacoes] = useState("");

  const [partners, setPartners] = useState<{ id: string; nome: string; tipo: string }[]>([]);
  const [customFornecedor, setCustomFornecedor] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadFormData = async () => {
      try {
        const [catRes, partRes] = await Promise.all([
          fetch("/api/financeiro/categorias"),
          fetch("/api/financeiro/parceiros"),
        ]);
        if (catRes.ok) {
          const catData = await catRes.json();
          setCategories(catData.categories?.filter((c: any) => c.tipo === "despesa") || []);
        }
        if (partRes.ok) {
          const partData = await partRes.json();
          setPartners(partData.partners || []);
        }
      } catch (err) {
        console.error("Failed to load categories and partners:", err);
      }
    };
    loadFormData();
  }, []);

  useEffect(() => {
    if (fornecedor && partners.length > 0 && !partners.some(p => (p.tipo === "fornecedor" || p.tipo === "ambos") && p.nome === fornecedor)) {
      setCustomFornecedor(true);
    }
  }, [fornecedor, partners]);

  useEffect(() => {
    if (recorrenteId) {
      const loadDetails = async () => {
        setIsLoading(true);
        try {
          const res = await fetch("/api/financeiro/recorrentes");
          if (res.ok) {
            const data = await res.json();
            const item = data.recurring?.find((r: any) => r.id === recorrenteId);
            if (item) {
              setDescricao(item.descricao);
              setValor(item.valor.toString());
              setCategoriaId(item.categoria_id || "");
              setFornecedor(item.fornecedor || "");
              setFrequencia(item.frequencia);
              setDiaVencimento(item.dia_vencimento.toString());
              setFormaPagamento(item.forma_pagamento || "");
              setAtiva(item.ativa);
              setObservacoes(item.observacoes || "");
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
  }, [recorrenteId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const payload = {
      descricao,
      valor: parseFloat(valor),
      categoria_id: categoriaId || null,
      fornecedor: fornecedor || null,
      frequencia,
      dia_vencimento: parseInt(diaVencimento),
      forma_pagamento: formaPagamento || null,
      ativa,
      observacoes: observacoes || null,
    };

    try {
      const url = recorrenteId ? `/api/financeiro/recorrentes/${recorrenteId}` : "/api/financeiro/recorrentes";
      const method = recorrenteId ? "PUT" : "POST";

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
        setError(data.error || "Erro ao salvar recorrência.");
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
          <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Descrição do Lançamento</label>
          <input
            type="text"
            required
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: Assinatura Software, Conta de Luz"
            className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Valor Estimado (R$)</label>
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

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Dia do Vencimento</label>
            <input
              type="number"
              min="1"
              max="31"
              required
              value={diaVencimento}
              onChange={(e) => setDiaVencimento(e.target.value)}
              placeholder="1 a 31"
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Frequência</label>
            <select
              value={frequencia}
              onChange={(e) => setFrequencia(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
            >
              <option value="semanal">Semanal</option>
              <option value="quinzenal">Quinzenal</option>
              <option value="mensal">Mensal (Padrão)</option>
              <option value="bimestral">Bimestral</option>
              <option value="trimestral">Trimestral</option>
              <option value="semestral">Semestral</option>
              <option value="anual">Anual</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Categoria de Despesa</label>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              required
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
            >
              <option value="">Selecione...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icone} {c.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between pl-1">
              <label className="text-[10px] font-bold uppercase text-brand-text/50">Fornecedor</label>
              {partners.some(p => p.tipo === "fornecedor" || p.tipo === "ambos") && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomFornecedor(!customFornecedor);
                    setFornecedor("");
                  }}
                  className="text-[9px] font-extrabold text-brand-primary uppercase hover:underline cursor-pointer"
                >
                  {customFornecedor ? "Selecionar Cadastrado" : "Digitar Manual"}
                </button>
              )}
            </div>
            
            {customFornecedor || !partners.some(p => p.tipo === "fornecedor" || p.tipo === "ambos") ? (
              <input
                type="text"
                value={fornecedor}
                onChange={(e) => setFornecedor(e.target.value)}
                placeholder="Nome do fornecedor"
                className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
              />
            ) : (
              <select
                value={fornecedor}
                onChange={(e) => {
                  if (e.target.value === "__manual__") {
                    setCustomFornecedor(true);
                    setFornecedor("");
                  } else {
                    setFornecedor(e.target.value);
                  }
                }}
                className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
              >
                <option value="">Selecione um fornecedor...</option>
                {partners.filter(p => p.tipo === "fornecedor" || p.tipo === "ambos").map(p => (
                  <option key={p.id} value={p.nome}>{p.nome}</option>
                ))}
                <option value="__manual__">➕ Digitar Manualmente...</option>
              </select>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Forma de Pagamento Prevista</label>
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
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 py-1">
          <span className="text-[10px] font-bold text-brand-text/50 uppercase pl-1">Status da Recorrência:</span>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={ativa}
              onChange={(e) => setAtiva(e.target.checked)}
              className="rounded border-brand-border text-brand-primary focus:ring-brand-primary/20 w-4 h-4 cursor-pointer"
            />
            <span className="text-xs text-brand-text font-semibold">Ativa (Gerar automaticamente)</span>
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Observações</label>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Detalhes adicionais..."
            className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text p-4 h-20 w-full focus:outline-none focus:border-brand-primary resize-none"
          />
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
            {isLoading ? "Salvando..." : recorrenteId ? "Salvar Lançamento" : "Registrar Recorrência"}
          </button>
        </div>
      </form>
    </div>
  );
}
