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

  const [partners, setPartners] = useState<{ id: string; nome: string; tipo: string }[]>([]);
  const [customFornecedor, setCustomFornecedor] = useState(false);
  const [customCliente, setCustomCliente] = useState(false);

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
        const catRes = await fetch("/api/financeiro/categorias");
        if (catRes.ok) {
          const catData = await catRes.json();
          setCategories(catData.categories || []);
        } else {
          console.error("[ContaForm] Failed to fetch categories: status", catRes.status);
        }
      } catch (err) {
        console.error("[ContaForm] Error fetching categories:", err);
      }

      // 2. Fetch partners
      try {
        const partRes = await fetch("/api/financeiro/parceiros");
        if (partRes.ok) {
          const partData = await partRes.json();
          setPartners(partData.partners || []);
        } else {
          console.error("[ContaForm] Failed to fetch partners: status", partRes.status);
        }
      } catch (err) {
        console.error("[ContaForm] Error fetching partners:", err);
      }

      // 3. Fetch vehicles
      try {
        const vehRes = await fetch("/api/estoque");
        if (vehRes.ok) {
          const vehData = await vehRes.json();
          setVehicles(vehData.veiculos || []);
        } else {
          console.error("[ContaForm] Failed to fetch vehicles: status", vehRes.status);
        }
      } catch (err) {
        console.error("[ContaForm] Error fetching vehicles:", err);
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
    if (cliente && partners.length > 0 && !partners.some(p => (p.tipo === "cliente" || p.tipo === "ambos") && p.nome === cliente)) {
      setCustomCliente(true);
    }
  }, [cliente, partners]);

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

  useEffect(() => {
    const targetTipo = (tipo === "pagar" ? "despesa" : "receita").toLowerCase();
    let filtered = categories.filter((c) => {
      const catTipo = (c.tipo || "").toLowerCase();
      return catTipo === targetTipo || catTipo === tipo.toLowerCase();
    });
    if (filtered.length === 0) {
      filtered = categories;
    }
    if (filtered.length > 0) {
      const isCurrentValid = filtered.some((c) => c.id === categoriaId);
      if (!isCurrentValid) {
        setCategoriaId(filtered[0].id);
      }
    }
  }, [tipo, categories, categoriaId]);

  useEffect(() => {
    if (veiculoId) {
      if (tipo === "pagar") {
        const compCat = categories.find((c) => c.nome === "Compra de Veículo (Estoque)" && c.tipo === "despesa");
        if (compCat) {
          setCategoriaId(compCat.id);
        }
      } else {
        const vendCat = categories.find((c) => c.nome === "Venda de Veículo" && c.tipo === "receita");
        if (vendCat) {
          setCategoriaId(vendCat.id);
        }
      }
    }
  }, [veiculoId, tipo, categories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      let finalCategoriaId = categoriaId;
      let finalFornecedor = fornecedor;
      let finalCliente = cliente;

      // 1. Cadastra nova categoria inline
      if (showNewCategoryForm) {
        if (!newCategoryName.trim()) {
          throw new Error("O nome da nova categoria é obrigatório.");
        }
        const targetTipo = tipo === "pagar" ? "despesa" : "receita";
        const catRes = await fetch("/api/financeiro/categorias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: newCategoryName.trim(),
            tipo: targetTipo,
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

      // 2. Cadastra novo fornecedor/cliente inline
      if (showNewPartnerForm) {
        if (!newPartnerName.trim()) {
          throw new Error("O nome do novo parceiro é obrigatório.");
        }
        const partnerRes = await fetch("/api/financeiro/parceiros", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: newPartnerName.trim(),
            tipo: tipo === "pagar" ? "fornecedor" : "cliente",
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
        if (tipo === "pagar") {
          finalFornecedor = partnerData.partner.nome;
        } else {
          finalCliente = partnerData.partner.nome;
        }
      }

      const payload = {
        tipo,
        descricao,
        valor: parseFloat(valor),
        data_vencimento: dataVencimento,
        status,
        categoria_id: finalCategoriaId || null,
        veiculo_id: veiculoId || null,
        fornecedor: tipo === "pagar" ? finalFornecedor : null,
        cliente: tipo === "receber" ? finalCliente : null,
        forma_pagamento: formaPagamento || null,
        total_parcelas: totalParcelas ? parseInt(totalParcelas) : 1,
        observacoes: observacoes || null,
      };

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

  const targetTipo = (tipo === "pagar" ? "despesa" : "receita").toLowerCase();
  let filteredCategories = categories.filter((c) => {
    const catTipo = (c.tipo || "").toLowerCase();
    return catTipo === targetTipo || catTipo === tipo.toLowerCase();
  });
  if (filteredCategories.length === 0) {
    filteredCategories = categories;
  }

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
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Categoria</label>
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
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
            >
              <option value="">Selecione...</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icone} {c.nome}
                </option>
              ))}
              <option value="__new_category__">➕ Cadastrar Nova Categoria...</option>
            </select>

            {showNewCategoryForm && (
              <div className="flex flex-col gap-3.5 p-4.5 bg-brand-bg/50 border border-brand-border/40 rounded-2xl mt-1 select-none animate-fadeIn">
                <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest block">
                  Nova Categoria de {tipo === "pagar" ? "Despesa" : "Receita"}
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="text-[9px] font-bold uppercase text-brand-text/50 pl-0.5">Nome da Categoria</label>
                    <input
                      type="text"
                      required
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Ex: Marketing, Manutenção"
                      className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-3 h-10 w-full focus:outline-none focus:border-brand-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-bold uppercase text-brand-text/50 pl-0.5">Ícone (Emoji)</label>
                    <select
                      value={newCategoryIcon}
                      onChange={(e) => setNewCategoryIcon(e.target.value)}
                      className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-3 h-10 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
                    >
                      <option value="📁">📁 Pasta</option>
                      <option value="💸">💸 Dinheiro</option>
                      <option value="⚡">⚡ Utilidades</option>
                      <option value="🚗">🚗 Veículo</option>
                      <option value="🔧">🔧 Manutenção</option>
                      <option value="📢">📢 Marketing</option>
                      <option value="🏢">🏢 Escritório</option>
                      <option value="💼">💼 Serviços</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
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
          {tipo === "pagar" ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Fornecedor</label>
              {showNewPartnerForm ? (
                <div className="flex items-center justify-between bg-brand-bg/40 border border-brand-border/40 rounded-xl px-3 py-2 text-xs text-brand-text/60">
                  <span>Cadastrando Novo Fornecedor...</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewPartnerForm(false);
                      setFornecedor("");
                    }}
                    className="text-[9px] font-bold text-brand-text/40 uppercase hover:text-brand-text cursor-pointer"
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
                  className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
                >
                  <option value="">Selecione um fornecedor...</option>
                  {partners.filter(p => p.tipo === "fornecedor" || p.tipo === "ambos").map(p => (
                    <option key={p.id} value={p.nome}>{p.nome}</option>
                  ))}
                  <option value="__new_partner__">➕ Cadastrar Novo Fornecedor...</option>
                </select>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Cliente</label>
              {showNewPartnerForm ? (
                <div className="flex items-center justify-between bg-brand-bg/40 border border-brand-border/40 rounded-xl px-3 py-2 text-xs text-brand-text/60">
                  <span>Cadastrando Novo Cliente...</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewPartnerForm(false);
                      setCliente("");
                    }}
                    className="text-[9px] font-bold text-brand-text/40 uppercase hover:text-brand-text cursor-pointer"
                  >
                    Voltar
                  </button>
                </div>
              ) : (
                <select
                  value={cliente}
                  required
                  onChange={(e) => {
                    if (e.target.value === "__new_partner__") {
                      setShowNewPartnerForm(true);
                      setNewPartnerName("");
                      setCliente("");
                    } else {
                      setCliente(e.target.value);
                    }
                  }}
                  className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
                >
                  <option value="">Selecione um cliente...</option>
                  {partners.filter(p => p.tipo === "cliente" || p.tipo === "ambos").map(p => (
                    <option key={p.id} value={p.nome}>{p.nome}</option>
                  ))}
                  <option value="__new_partner__">➕ Cadastrar Novo Cliente...</option>
                </select>
              )}
            </div>
          )}

          {/* New Partner Inline Form */}
          {showNewPartnerForm && (
            <div className="flex flex-col gap-3.5 p-4.5 bg-brand-bg/50 border border-brand-border/40 rounded-2xl md:col-span-2 select-none animate-fadeIn">
              <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest block">
                Novo Cadastro de Parceiro ({tipo === "pagar" ? "Fornecedor" : "Cliente"})
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-[9px] font-bold uppercase text-brand-text/50 pl-0.5">Nome do Parceiro</label>
                  <input
                    type="text"
                    required
                    value={newPartnerName}
                    onChange={(e) => {
                      setNewPartnerName(e.target.value);
                      if (tipo === "pagar") setFornecedor(e.target.value);
                      else setCliente(e.target.value);
                    }}
                    placeholder="Ex: Auto Peças São Paulo, João Silva"
                    className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-3 h-10 w-full focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold uppercase text-brand-text/50 pl-0.5">Documento (CPF / CNPJ)</label>
                  <input
                    type="text"
                    value={newPartnerDoc}
                    onChange={(e) => setNewPartnerDoc(e.target.value)}
                    placeholder="00.000.000/0001-00"
                    className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-3 h-10 w-full focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold uppercase text-brand-text/50 pl-0.5">Telefone</label>
                  <input
                    type="text"
                    value={newPartnerPhone}
                    onChange={(e) => setNewPartnerPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-3 h-10 w-full focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-[9px] font-bold uppercase text-brand-text/50 pl-0.5">E-mail</label>
                  <input
                    type="email"
                    value={newPartnerEmail}
                    onChange={(e) => setNewPartnerEmail(e.target.value)}
                    placeholder="contato@empresa.com.br"
                    className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-3 h-10 w-full focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>
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
