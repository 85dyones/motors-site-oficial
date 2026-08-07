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
  const [categoria, setCategoria] = useState(""); // This will store the category_id (UUID)
  const [veiculoId, setVeiculoId] = useState("");
  const [notaFiscal, setNotaFiscal] = useState("");
  const [status, setStatus] = useState("recebido");
  const [formaPagamento, setFormaPagamento] = useState("pix");

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
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadFormData = async () => {
      // 1. Fetch categories
      try {
        const catRes = await fetch("/api/financeiro/categorias", { cache: "no-store" });
        if (catRes.ok) {
          const data = await catRes.json();
          setCategories(data.categories?.filter((c: any) => (c.tipo || "").toLowerCase() === "despesa") || []);
        } else {
          console.error("[CompraForm] Failed to fetch categories: status", catRes.status);
        }
      } catch (err) {
        console.error("[CompraForm] Error fetching categories:", err);
      }

      // 2. Fetch partners
      try {
        const partRes = await fetch("/api/financeiro/parceiros", { cache: "no-store" });
        if (partRes.ok) {
          const data = await partRes.json();
          setPartners(data.partners || []);
        } else {
          console.error("[CompraForm] Failed to fetch partners: status", partRes.status);
        }
      } catch (err) {
        console.error("[CompraForm] Error fetching partners:", err);
      }

      // 3. Fetch vehicles
      try {
        const vehRes = await fetch("/api/estoque", { cache: "no-store" });
        if (vehRes.ok) {
          const data = await vehRes.json();
          setVehicles(data.veiculos || []);
        } else {
          console.error("[CompraForm] Failed to fetch vehicles: status", vehRes.status);
        }
      } catch (err) {
        console.error("[CompraForm] Error fetching vehicles:", err);
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
    if (categories.length > 0) {
      const isCurrentValid = categories.some((c) => c.id === categoria);
      if (!isCurrentValid) {
        setCategoria(categories[0].id);
      }
    }
  }, [categories, categoria]);

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

    try {
      let finalCategoria = categoria;
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
        finalCategoria = catData.category.id;
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
        fornecedor: finalFornecedor || null,
        valor_total: parseFloat(valorTotal),
        quantidade: parseInt(quantidade),
        valor_unitario: valorUnitario ? parseFloat(valorUnitario) : parseFloat(valorTotal) / parseInt(quantidade),
        data_compra: dataCompra,
        categoria: finalCategoria || null,
        veiculo_id: veiculoId || null,
        nota_fiscal: notaFiscal || null,
        status,
        forma_pagamento: formaPagamento,
      };

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
        <div className="bg-mt-accent-100 border border-mt-accent-300 text-mt-accent text-xs px-4 py-2.5">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Item / Descrição da Compra</label>
          <input
            type="text"
            required
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: 4 Pneus Aro 17, Pastilhas de Freio"
            className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <option value="__new_partner__">Cadastrar novo fornecedor…</option>
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
                      placeholder="Ex: Auto Peças XYZ"
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
                      placeholder="vendas@xyz.com.br"
                      className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-3 h-10 w-full focus:outline-none focus:border-mt-accent"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Data da Compra</label>
            <input
              type="date"
              required
              value={dataCompra}
              onChange={(e) => setDataCompra(e.target.value)}
              className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Valor Total (R$)</label>
            <input
              type="number"
              step="0.01"
              required
              value={valorTotal}
              onChange={(e) => setValorTotal(e.target.value)}
              placeholder="0,00"
              className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Quantidade</label>
            <input
              type="number"
              required
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              placeholder="1"
              className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Valor Unitário (R$)</label>
            <input
              type="number"
              step="0.01"
              value={valorUnitario}
              onChange={(e) => setValorUnitario(e.target.value)}
              placeholder="Opcional (calculado auto)"
              className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent"
            />
          </div>

          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Categoria do Produto</label>
            <select
              value={showNewCategoryForm ? "__new_category__" : categoria}
              onChange={(e) => {
                if (e.target.value === "__new_category__") {
                  setShowNewCategoryForm(true);
                  setCategoria("");
                } else {
                  setShowNewCategoryForm(false);
                  setCategoria(e.target.value);
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
              <option value="__new_category__">Cadastrar nova categoria…</option>
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
                      placeholder="Ex: Peças, Pneus, Funilaria"
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

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Forma de Pagamento Prevista</label>
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
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Nota Fiscal</label>
            <input
              type="text"
              value={notaFiscal}
              onChange={(e) => setNotaFiscal(e.target.value)}
              placeholder="Número / Série"
              className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Status da Compra</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent cursor-pointer"
            >
              <option value="recebido">Recebido</option>
              <option value="encomendado">Encomendado</option>
              <option value="pendente">Pendente / Aguardando</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>

          {/* Bind to vehicle */}
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Vincular Custo ao Veículo</label>
            <select
              value={veiculoId}
              onChange={(e) => setVeiculoId(e.target.value)}
              className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent cursor-pointer"
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
            {isLoading ? "Salvando..." : compraId ? "Salvar Compra" : "Registrar Compra"}
          </button>
        </div>
      </form>
    </div>
  );
}
