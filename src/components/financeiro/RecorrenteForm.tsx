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

  // Inline category creation states
  const [showNewCategoryForm, setShowNewCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("📁");
  const [newCategoryColor, setNewCategoryColor] = useState("#6B7280");

  // Inline partner creation states
  const [showNewPartnerForm, setShowNewPartnerForm] = useState(false);
  const [newPartnerName, setNewPartnerName] = useState("");
  const [newPartnerDoc, setNewPartnerDoc] = useState("");
  const [newPartnerPhone, setNewPartnerPhone] = useState("");
  const [newPartnerEmail, setNewPartnerEmail] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadFormData = async () => {
      // 1. Fetch categories
      try {
        const catRes = await fetch("/api/financeiro/categorias", { cache: "no-store" });
        if (catRes.ok) {
          const catData = await catRes.json();
          setCategories(catData.categories?.filter((c: any) => (c.tipo || "").toLowerCase() === "despesa") || []);
        } else {
          console.error("[RecorrenteForm] Failed to fetch categories: status", catRes.status);
        }
      } catch (err) {
        console.error("[RecorrenteForm] Error fetching categories:", err);
      }

      // 2. Fetch partners
      try {
        const partRes = await fetch("/api/financeiro/parceiros", { cache: "no-store" });
        if (partRes.ok) {
          const partData = await partRes.json();
          setPartners(partData.partners || []);
        } else {
          console.error("[RecorrenteForm] Failed to fetch partners: status", partRes.status);
        }
      } catch (err) {
        console.error("[RecorrenteForm] Error fetching partners:", err);
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

  useEffect(() => {
    if (categories.length > 0) {
      const isCurrentValid = categories.some((c) => c.id === categoriaId);
      if (!isCurrentValid) {
        setCategoriaId(categories[0].id);
      }
    }
  }, [categories, categoriaId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      let finalCategoriaId = categoriaId;
      let finalFornecedor = fornecedor;

      // 1. Cadastra nova categoria inline
      if (showNewCategoryForm) {
        if (!newCategoryName.trim()) {
          throw new Error("O nome da nova categoria é obrigatório.");
        }
        const catRes = await fetch("/api/financeiro/categorias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: newCategoryName.trim(),
            tipo: "despesa",
            cor: newCategoryColor,
            icone: newCategoryIcon
          })
        });
        if (!catRes.ok) {
          const errData = await catRes.json().catch(() => ({}));
          throw new Error(`Falha ao cadastrar nova categoria: ${errData.error || "Erro desconhecido"}`);
        }
        const catData = await catRes.json();
        finalCategoriaId = catData.category.id;
      }

      // 2. Cadastra novo fornecedor inline
      if (showNewPartnerForm) {
        if (!newPartnerName.trim()) {
          throw new Error("O nome do novo fornecedor é obrigatório.");
        }
        const partnerRes = await fetch("/api/financeiro/parceiros", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: newPartnerName.trim(),
            tipo: "fornecedor",
            documento: newPartnerDoc.trim() || null,
            telefone: newPartnerPhone.trim() || null,
            email: newPartnerEmail.trim() || null
          })
        });
        if (!partnerRes.ok) {
          const errData = await partnerRes.json().catch(() => ({}));
          throw new Error(`Falha ao cadastrar novo parceiro: ${errData.error || "Erro desconhecido"}`);
        }
        const partnerData = await partnerRes.json();
        finalFornecedor = partnerData.partner.nome;
      }

      const payload = {
        descricao,
        valor: parseFloat(valor),
        categoria_id: finalCategoriaId || null,
        fornecedor: finalFornecedor || null,
        frequencia,
        dia_vencimento: parseInt(diaVencimento),
        forma_pagamento: formaPagamento || null,
        ativa,
        observacoes: observacoes || null,
      };

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
        <div className="bg-mt-accent-100 border border-mt-accent-300 text-mt-accent text-xs px-4 py-2.5">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Descrição do Lançamento</label>
          <input
            type="text"
            required
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: Assinatura Software, Conta de Luz"
            className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Valor Estimado (R$)</label>
            <input
              type="number"
              step="0.01"
              required
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Dia do Vencimento</label>
            <input
              type="number"
              min="1"
              max="31"
              required
              value={diaVencimento}
              onChange={(e) => setDiaVencimento(e.target.value)}
              placeholder="1 a 31"
              className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Frequência</label>
            <select
              value={frequencia}
              onChange={(e) => setFrequencia(e.target.value)}
              className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent cursor-pointer"
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

          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Categoria de Despesa</label>
            <select
              value={showNewCategoryForm ? "__new_category__" : categoriaId}
              onChange={(e) => {
                if (e.target.value === "__new_category__") {
                  setShowNewCategoryForm(true);
                  setCategoriaId("");
                } else {
                  setShowNewCategoryForm(false);
                  setCategoriaId(e.target.value);
                }
              }}
              required={!showNewCategoryForm}
              className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent cursor-pointer"
            >
              <option value="">Selecione...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icone} {c.nome}
                </option>
              ))}
              <option value="__new_category__">➕ Cadastrar Nova Categoria...</option>
            </select>

            {showNewCategoryForm && (
              <div className="flex flex-col gap-3.5 p-4.5 bg-mt-bg border border-mt-regua-fina mt-1 select-none">
                <span className="mt-rotulo mt-rotulo-accent block">
                  Nova Categoria de Despesa
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="text-[9px] font-bold uppercase text-mt-neutral-700 pl-0.5">Nome da Categoria</label>
                    <input
                      type="text"
                      required
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Ex: Assinaturas, Concessionárias"
                      className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-3 h-10 w-full focus:outline-none focus:border-mt-accent"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-bold uppercase text-mt-neutral-700 pl-0.5">Ícone (Emoji)</label>
                    <select
                      value={newCategoryIcon}
                      onChange={(e) => setNewCategoryIcon(e.target.value)}
                      className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-3 h-10 w-full focus:outline-none focus:border-mt-accent cursor-pointer"
                    >
                      <option value="📁">📁 Pasta</option>
                      <option value="💸">💸 Dinheiro</option>
                      <option value="⚡">⚡ Utilidades</option>
                      <option value="🏢">🏢 Escritório</option>
                      <option value="🔧">🔧 Manutenção</option>
                      <option value="📢">📢 Marketing</option>
                      <option value="🚗">🚗 Veículo</option>
                      <option value="💼">💼 Serviços</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Fornecedor</label>
            {showNewPartnerForm ? (
              <div className="flex items-center justify-between bg-mt-bg border border-mt-regua-fina px-3 py-2 text-xs text-mt-neutral-700">
                <span>Cadastrando Novo Fornecedor...</span>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewPartnerForm(false);
                    setFornecedor("");
                  }}
                  className="text-[9px] font-bold text-mt-neutral-600 uppercase hover:text-mt-ink cursor-pointer"
                >
                  Voltar
                </button>
              </div>
            ) : (
              <select
                value={fornecedor}
                required
                onChange={(e) => {
                  if (e.target.value === "__new_partner__") {
                    setShowNewPartnerForm(true);
                    setNewPartnerName("");
                    setFornecedor("");
                  } else {
                    setFornecedor(e.target.value);
                  }
                }}
                className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent cursor-pointer"
              >
                <option value="">Selecione um fornecedor...</option>
                {partners.filter(p => p.tipo === "fornecedor" || p.tipo === "ambos").map(p => (
                  <option key={p.id} value={p.nome}>{p.nome}</option>
                ))}
                <option value="__new_partner__">➕ Cadastrar Novo Fornecedor...</option>
              </select>
            )}

            {showNewPartnerForm && (
              <div className="flex flex-col gap-3.5 p-4.5 bg-mt-bg border border-mt-regua-fina mt-1 select-none">
                <span className="mt-rotulo mt-rotulo-accent block">
                  Novo Cadastro de Fornecedor
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="text-[9px] font-bold uppercase text-mt-neutral-700 pl-0.5">Nome do Fornecedor</label>
                    <input
                      type="text"
                      required
                      value={newPartnerName}
                      onChange={(e) => {
                        setNewPartnerName(e.target.value);
                        setFornecedor(e.target.value);
                      }}
                      placeholder="Ex: Copel Distribuidora S.A."
                      className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-3 h-10 w-full focus:outline-none focus:border-mt-accent"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-bold uppercase text-mt-neutral-700 pl-0.5">Documento (CPF / CNPJ)</label>
                    <input
                      type="text"
                      value={newPartnerDoc}
                      onChange={(e) => setNewPartnerDoc(e.target.value)}
                      placeholder="00.000.000/0001-00"
                      className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-3 h-10 w-full focus:outline-none focus:border-mt-accent"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-bold uppercase text-mt-neutral-700 pl-0.5">Telefone</label>
                    <input
                      type="text"
                      value={newPartnerPhone}
                      onChange={(e) => setNewPartnerPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-3 h-10 w-full focus:outline-none focus:border-mt-accent"
                    />
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="text-[9px] font-bold uppercase text-mt-neutral-700 pl-0.5">E-mail</label>
                    <input
                      type="email"
                      value={newPartnerEmail}
                      onChange={(e) => setNewPartnerEmail(e.target.value)}
                      placeholder="financeiro@empresa.com.br"
                      className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-3 h-10 w-full focus:outline-none focus:border-mt-accent"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Forma de Pagamento Prevista</label>
            <select
              value={formaPagamento}
              onChange={(e) => setFormaPagamento(e.target.value)}
              className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent cursor-pointer"
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
          <span className="text-[10px] font-bold text-mt-neutral-700 uppercase pl-1">Status da Recorrência:</span>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={ativa}
              onChange={(e) => setAtiva(e.target.checked)}
              className="border-mt-regua-fina text-mt-accent focus:ring-mt-accent w-4 h-4 cursor-pointer"
            />
            <span className="text-xs text-mt-ink font-semibold">Ativa (Gerar automaticamente)</span>
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Observações</label>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Detalhes adicionais..."
            className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink p-4 h-20 w-full focus:outline-none focus:border-mt-accent resize-none"
          />
        </div>

        <div className="flex items-center gap-2.5 mt-2 border-t border-mt-regua-fina pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 bg-transparent hover:bg-mt-surface text-mt-neutral-700 hover:text-mt-ink border border-mt-regua-fina text-[11px] font-bold uppercase tracking-wider cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 h-11 bg-mt-accent text-mt-inverso text-[11px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
          >
            {isLoading ? "Salvando..." : recorrenteId ? "Salvar Lançamento" : "Registrar Recorrência"}
          </button>
        </div>
      </form>
    </div>
  );
}
