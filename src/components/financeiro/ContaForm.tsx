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

  // Compra de insumo (2026-08-24): era tela própria, virou três campos aqui.
  // Ficam num bloco que só abre quando a pessoa diz que é compra de item —
  // aluguel e energia não têm unidade, e três campos vazios em toda conta
  // seriam ruído que faz duvidar do resto do formulário.
  const [ehCompraDeItem, setEhCompraDeItem] = useState(false);
  const [quantidade, setQuantidade] = useState("");
  const [valorUnitario, setValorUnitario] = useState("");
  const [notaFiscal, setNotaFiscal] = useState("");

  // Recorrência (2026-08-24): "recorrência é um tipo de vencimento, pode ser
  // um check no cadastro". O check fica aqui; a REGRA continua em
  // `despesas_recorrentes`, porque regra não é dívida — uma recorrente não
  // tem vencimento, tem frequência, e virar linha em `contas` a faria entrar
  // em toda soma do DRE.
  const [ehRecorrente, setEhRecorrente] = useState(false);
  const [frequencia, setFrequencia] = useState("mensal");

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
      // 1. Fetch categories (with cache bypass)
      try {
        const catRes = await fetch("/api/financeiro/categorias", { cache: "no-store" });
        if (catRes.ok) {
          const catData = await catRes.json();
          const cats = catData.categories || [];
          setCategories(cats);
        } else {
          const errBody = await catRes.text().catch(() => "");
        }
      } catch (err: any) {
      }

      // 2. Fetch partners
      try {
        const partRes = await fetch("/api/financeiro/parceiros", { cache: "no-store" });
        if (partRes.ok) {
          const partData = await partRes.json();
          setPartners(partData.partners || []);
        } else {
          console.error("[ContaForm] Failed to fetch partners: status", partRes.status);
        }
      } catch (err) {
        console.error("[ContaForm] Error fetching partners:", err);
      }

      // 3. Fetch vehicles (optional, may 404)
      try {
        const vehRes = await fetch("/api/estoque", { cache: "no-store" });
        if (vehRes.ok) {
          const vehData = await vehRes.json();
          setVehicles(vehData.veiculos || []);
        }
      } catch (err) {
        // Silently ignore - vehicles are optional
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
            setQuantidade(c.quantidade?.toString() || "");
            setValorUnitario(c.valor_unitario?.toString() || "");
            setNotaFiscal(c.nota_fiscal || "");
            setEhCompraDeItem(Boolean(c.quantidade || c.valor_unitario || c.nota_fiscal));
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
        // Só vão quando o bloco está aberto: fechar o bloco e salvar LIMPA os
        // campos, que é o que a pessoa espera de um check desmarcado.
        quantidade: ehCompraDeItem && quantidade ? parseInt(quantidade) : null,
        valor_unitario: ehCompraDeItem && valorUnitario ? parseFloat(valorUnitario) : null,
        nota_fiscal: ehCompraDeItem && notaFiscal ? notaFiscal : null,
        // A recorrente é criada pela rota, não aqui: ela precisa passar pela
        // fila de aprovação do Gestor, e essa régua mora no servidor.
        recorrencia: ehRecorrente ? { frequencia } : null,
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
        <div className="bg-mt-accent-100 border border-mt-accent-300 text-mt-accent text-xs px-4 py-2.5">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Toggle Pagar/Receber (Only when creating) */}
        {!contaId && (
          <div className="flex items-center gap-2 border border-mt-regua-fina p-1 bg-mt-bg w-fit select-none">
            <button
              type="button"
              onClick={() => setTipo("pagar")}
              className={`px-4 py-1.5 text-[10px] font-bold uppercase transition-all cursor-pointer ${
                tipo === "pagar"
                  ? "bg-mt-accent text-mt-inverso"
                  : "text-mt-neutral-700 hover:text-mt-ink"
              }`}
            >
              A Pagar
            </button>
            <button
              type="button"
              onClick={() => setTipo("receber")}
              className={`px-4 py-1.5 text-[10px] font-bold uppercase transition-all cursor-pointer ${
                tipo === "receber"
                  ? "bg-mt-ink text-mt-inverso"
                  : "text-mt-neutral-700 hover:text-mt-ink"
              }`}
            >
              A Receber
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Descrição */}
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Descrição</label>
            <input
              type="text"
              required
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Aluguel do Showroom, Compra de Peças, Venda de Fox"
              className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent"
            />
          </div>

          {/* Valor */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Valor (R$)</label>
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

          {/* Vencimento */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Vencimento</label>
            <input
              type="date"
              required
              value={dataVencimento}
              onChange={(e) => setDataVencimento(e.target.value)}
              className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent cursor-pointer"
            />
          </div>

          {/* Categoria */}
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Categoria</label>
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
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icone} {c.nome}
                </option>
              ))}
              <option value="__new_category__">Cadastrar nova categoria…</option>
            </select>

            {showNewCategoryForm && (
              <div className="flex flex-col gap-3.5 p-4.5 bg-mt-bg border border-mt-regua-fina mt-1 select-none">
                <span className="mt-rotulo mt-rotulo-accent block">
                  Nova Categoria de {tipo === "pagar" ? "Despesa" : "Receita"}
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="text-[9px] font-bold uppercase text-mt-neutral-700 pl-0.5">Nome da Categoria</label>
                    <input
                      type="text"
                      required
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Ex: Marketing, Manutenção"
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

          {/* Compra de item e recorrência — os dois menus que viraram check.
              Só aparecem em conta a pagar e só na criação: transformar uma
              conta existente em recorrente exigiria decidir o que fazer com
              as parcelas já lançadas, e essa pergunta não tem resposta boa
              dentro de um formulário. */}
          {!contaId && tipo === "pagar" && (
            <div className="flex flex-col gap-3 border border-mt-regua-fina bg-mt-bg p-3">
              <label className="flex cursor-pointer select-none items-center gap-2">
                <input
                  type="checkbox"
                  checked={ehCompraDeItem}
                  onChange={(e) => setEhCompraDeItem(e.target.checked)}
                  className="h-4 w-4 cursor-pointer border-mt-regua-fina text-mt-accent focus:ring-mt-accent"
                />
                <span className="text-xs font-semibold text-mt-ink">É compra de item (insumo, peça)</span>
              </label>

              {ehCompraDeItem && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="pl-1 text-[10px] font-bold uppercase text-mt-neutral-700">Quantidade</label>
                    <input
                      type="number" min="1" value={quantidade}
                      onChange={(e) => setQuantidade(e.target.value)}
                      className="h-11 w-full border border-mt-regua-fina bg-mt-surface px-4 text-xs text-mt-ink focus:border-mt-accent focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="pl-1 text-[10px] font-bold uppercase text-mt-neutral-700">Valor unitário</label>
                    <input
                      type="number" step="0.01" min="0.01" value={valorUnitario}
                      onChange={(e) => setValorUnitario(e.target.value)}
                      className="h-11 w-full border border-mt-regua-fina bg-mt-surface px-4 text-xs text-mt-ink focus:border-mt-accent focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="pl-1 text-[10px] font-bold uppercase text-mt-neutral-700">Nota fiscal</label>
                    <input
                      type="text" value={notaFiscal}
                      onChange={(e) => setNotaFiscal(e.target.value)}
                      className="h-11 w-full border border-mt-regua-fina bg-mt-surface px-4 text-xs text-mt-ink focus:border-mt-accent focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <label className="flex cursor-pointer select-none items-center gap-2 border-t border-mt-regua-fina pt-3">
                <input
                  type="checkbox"
                  checked={ehRecorrente}
                  onChange={(e) => setEhRecorrente(e.target.checked)}
                  className="h-4 w-4 cursor-pointer border-mt-regua-fina text-mt-accent focus:ring-mt-accent"
                />
                <span className="text-xs font-semibold text-mt-ink">Repete — é despesa fixa</span>
              </label>

              {ehRecorrente && (
                <div className="flex flex-col gap-1.5">
                  <label className="pl-1 text-[10px] font-bold uppercase text-mt-neutral-700">A cada</label>
                  <select
                    value={frequencia}
                    onChange={(e) => setFrequencia(e.target.value)}
                    className="h-11 w-full cursor-pointer border border-mt-regua-fina bg-mt-surface px-4 text-xs text-mt-ink focus:border-mt-accent focus:outline-none"
                  >
                    <option value="semanal">Semana</option>
                    <option value="quinzenal">Quinzena</option>
                    <option value="mensal">Mês</option>
                    <option value="bimestral">2 meses</option>
                    <option value="trimestral">3 meses</option>
                    <option value="semestral">6 meses</option>
                    <option value="anual">Ano</option>
                  </select>
                  <span className="pl-1 text-[10px] leading-relaxed text-mt-neutral-600">
                    O dia do vencimento acima vira o dia de todo mês. A recorrência vai ao
                    Gestor para liberação — assinar uma despesa fixa compromete o ano inteiro,
                    e é por isso que ela não entra sozinha.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Parcelamento (Only when creating) */}
          {!contaId ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Parcelas</label>
              <select
                value={totalParcelas}
                onChange={(e) => setTotalParcelas(e.target.value)}
                className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent cursor-pointer"
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
              <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent cursor-pointer"
              >
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          )}
          {tipo === "pagar" ? (
            <div className="flex flex-col gap-1.5">
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
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Cliente</label>
              {showNewPartnerForm ? (
                <div className="flex items-center justify-between bg-mt-bg border border-mt-regua-fina px-3 py-2 text-xs text-mt-neutral-700">
                  <span>Cadastrando Novo Cliente...</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewPartnerForm(false);
                      setCliente("");
                    }}
                    className="text-[9px] font-bold text-mt-neutral-600 uppercase hover:text-mt-ink cursor-pointer"
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
                  className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent cursor-pointer"
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
            <div className="flex flex-col gap-3.5 p-4.5 bg-mt-bg border border-mt-regua-fina md:col-span-2 select-none">
              <span className="mt-rotulo mt-rotulo-accent block">
                Novo Cadastro de Parceiro ({tipo === "pagar" ? "Fornecedor" : "Cliente"})
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-[9px] font-bold uppercase text-mt-neutral-700 pl-0.5">Nome do Parceiro</label>
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
                    placeholder="contato@empresa.com.br"
                    className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-3 h-10 w-full focus:outline-none focus:border-mt-accent"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Forma de Pagamento */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Forma de Pagamento</label>
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
              <option value="financiamento">Financiamento</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>

          {/* Vinculo de Veículo */}
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Vincular a Veículo (Opcional)</label>
            <select
              value={veiculoId}
              onChange={(e) => setVeiculoId(e.target.value)}
              className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent cursor-pointer"
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
            <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Observações</label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Detalhes adicionais..."
              className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink p-4 h-24 w-full focus:outline-none focus:border-mt-accent resize-none"
            />
          </div>
        </div>

        {/* Submit Actions */}
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
            {isLoading ? "Salvando..." : contaId ? "Salvar Alterações" : "Lançar Conta"}
          </button>
        </div>
      </form>
    </div>
  );
}
