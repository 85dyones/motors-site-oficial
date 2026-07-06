"use client";

import { useEffect, useState } from "react";

interface Categoria {
  id: string;
  nome: string;
  tipo: "receita" | "despesa";
  cor: string;
  icone: string;
  ativa: boolean;
}

interface Parceiro {
  id: string;
  nome: string;
  tipo: "fornecedor" | "cliente" | "ambos";
  documento?: string;
  telefone?: string;
  email?: string;
}

export default function FinanceCadastros() {
  const [activeTab, setActiveTab] = useState<"categorias" | "parceiros">("categorias");
  
  // Categorias states
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [isLoadingCats, setIsLoadingCats] = useState(true);
  const [isCatFormOpen, setIsCatFormOpen] = useState(false);
  const [selectedCat, setSelectedCat] = useState<Categoria | null>(null);
  
  // Cat form fields
  const [catNome, setCatNome] = useState("");
  const [catTipo, setCatTipo] = useState<"receita" | "despesa">("despesa");
  const [catCor, setCatCor] = useState("#6B7280");
  const [catIcone, setCatIcone] = useState("📁");
  
  // Parceiros states
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [isLoadingParceiros, setIsLoadingParceiros] = useState(true);
  const [isParceiroFormOpen, setIsParceiroFormOpen] = useState(false);
  const [selectedParceiro, setSelectedParceiro] = useState<Parceiro | null>(null);
  
  // Partner form fields
  const [partNome, setPartNome] = useState("");
  const [partTipo, setPartTipo] = useState<"fornecedor" | "cliente" | "ambos">("fornecedor");
  const [partDoc, setPartDoc] = useState("");
  const [partTel, setPartTel] = useState("");
  const [partEmail, setPartEmail] = useState("");

  // Notification states
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchCategorias = async () => {
    setIsLoadingCats(true);
    try {
      const res = await fetch("/api/financeiro/categorias");
      if (res.ok) {
        const data = await res.json();
        setCategorias(data.categories || []);
      }
    } catch (err) {
      console.error("Erro ao buscar categorias:", err);
    } finally {
      setIsLoadingCats(false);
    }
  };

  const fetchParceiros = async () => {
    setIsLoadingParceiros(true);
    try {
      const res = await fetch("/api/financeiro/parceiros");
      if (res.ok) {
        const data = await res.json();
        setParceiros(data.partners || []);
      }
    } catch (err) {
      console.error("Erro ao buscar parceiros:", err);
    } finally {
      setIsLoadingParceiros(false);
    }
  };

  useEffect(() => {
    fetchCategorias();
    fetchParceiros();
  }, []);

  const handleOpenCatForm = (cat?: Categoria) => {
    setError("");
    setSuccess("");
    if (cat) {
      setSelectedCat(cat);
      setCatNome(cat.nome);
      setCatTipo(cat.tipo);
      setCatCor(cat.cor);
      setCatIcone(cat.icone);
    } else {
      setSelectedCat(null);
      setCatNome("");
      setCatTipo("despesa");
      setCatCor("#6B7280");
      setCatIcone("📁");
    }
    setIsCatFormOpen(true);
  };

  const handleOpenParceiroForm = (part?: Parceiro) => {
    setError("");
    setSuccess("");
    if (part) {
      setSelectedParceiro(part);
      setPartNome(part.nome);
      setPartTipo(part.tipo);
      setPartDoc(part.documento || "");
      setPartTel(part.telefone || "");
      setPartEmail(part.email || "");
    } else {
      setSelectedParceiro(null);
      setPartNome("");
      setPartTipo("fornecedor");
      setPartDoc("");
      setPartTel("");
      setPartEmail("");
    }
    setIsParceiroFormOpen(true);
  };

  const handleSaveCat = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    
    if (!catNome) {
      setError("Nome da categoria é obrigatório.");
      return;
    }

    try {
      const url = selectedCat ? `/api/financeiro/categorias/${selectedCat.id}` : "/api/financeiro/categorias";
      const method = selectedCat ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: catNome, tipo: catTipo, cor: catCor, icone: catIcone })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(selectedCat ? "Categoria atualizada com sucesso!" : "Categoria criada com sucesso!");
        setIsCatFormOpen(false);
        fetchCategorias();
      } else {
        setError(data.error || "Erro ao salvar categoria.");
      }
    } catch (err) {
      setError("Erro ao se conectar com o servidor.");
    }
  };

  const handleDeactivateCat = async (id: string) => {
    if (!confirm("Deseja realmente inativar esta categoria?")) return;
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/financeiro/categorias/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSuccess("Categoria inativada!");
        fetchCategorias();
      } else {
        const data = await res.json();
        setError(data.error || "Falha ao inativar.");
      }
    } catch (err) {
      setError("Erro de rede.");
    }
  };

  const handleSaveParceiro = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!partNome) {
      setError("Nome do parceiro é obrigatório.");
      return;
    }

    try {
      const url = selectedParceiro ? `/api/financeiro/parceiros/${selectedParceiro.id}` : "/api/financeiro/parceiros";
      const method = selectedParceiro ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: partNome, tipo: partTipo, documento: partDoc, telefone: partTel, email: partEmail })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(selectedParceiro ? "Parceiro atualizado com sucesso!" : "Parceiro cadastrado com sucesso!");
        setIsParceiroFormOpen(false);
        fetchParceiros();
      } else {
        setError(data.error || "Erro ao salvar parceiro.");
      }
    } catch (err) {
      setError("Erro ao se conectar.");
    }
  };

  const handleDeleteParceiro = async (id: string) => {
    if (!confirm("Tem certeza de que deseja excluir este parceiro?")) return;
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/financeiro/parceiros/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSuccess("Parceiro excluído com sucesso!");
        fetchParceiros();
      } else {
        const data = await res.json();
        setError(data.error || "Erro ao excluir parceiro.");
      }
    } catch (err) {
      setError("Erro de rede.");
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl">
      {/* Tab Switcher and Actions Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-brand-border/40 pb-4 select-none">
        {/* Navigation Tabs */}
        <div className="flex bg-brand-card/20 p-1 rounded-2xl border border-brand-border/40 w-fit">
          <button
            onClick={() => {
              setActiveTab("categorias");
              setError("");
              setSuccess("");
            }}
            className={`px-4 py-2 text-[11px] font-extrabold uppercase tracking-wider rounded-xl transition-all duration-200 cursor-pointer ${
              activeTab === "categorias"
                ? "bg-brand-primary text-white shadow-md shadow-brand-primary/10"
                : "text-brand-text/50 hover:text-brand-text hover:bg-brand-card/25"
            }`}
          >
            Categorias Financeiras
          </button>
          <button
            onClick={() => {
              setActiveTab("parceiros");
              setError("");
              setSuccess("");
            }}
            className={`px-4 py-2 text-[11px] font-extrabold uppercase tracking-wider rounded-xl transition-all duration-200 cursor-pointer ${
              activeTab === "parceiros"
                ? "bg-brand-primary text-white shadow-md shadow-brand-primary/10"
                : "text-brand-text/50 hover:text-brand-text hover:bg-brand-card/25"
            }`}
          >
            Fornecedores & Clientes
          </button>
        </div>

        {/* Action button */}
        {activeTab === "categorias" ? (
          <button
            onClick={() => handleOpenCatForm()}
            className={`h-10 bg-brand-primary hover:bg-brand-primary/95 text-white text-[11px] font-bold uppercase tracking-wider px-4 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer shadow-md ${
              isCatFormOpen ? "hidden lg:flex" : "flex"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            Nova Categoria
          </button>
        ) : (
          <button
            onClick={() => handleOpenParceiroForm()}
            className={`h-10 bg-brand-primary hover:bg-brand-primary/95 text-white text-[11px] font-bold uppercase tracking-wider px-4 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer shadow-md ${
              isParceiroFormOpen ? "hidden lg:flex" : "flex"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            Novo Parceiro
          </button>
        )}
      </div>

      {/* Notifications */}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs px-4 py-3 rounded-xl flex items-center gap-2 select-none animate-fadeIn">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
            <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
          </svg>
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs px-4 py-3 rounded-xl flex items-center gap-2 select-none animate-fadeIn">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
            <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Grid Layout: Lists vs Forms */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* ==================== TAB 1: CATEGORIAS ==================== */}
        {activeTab === "categorias" && (
          <>
            {/* List Column */}
            <div className={`lg:col-span-2 bg-brand-card/30 border border-brand-border/40 rounded-3xl p-6 backdrop-blur-md ${isCatFormOpen ? "hidden lg:block" : "block"}`}>
              <h3 className="text-xs font-extrabold uppercase text-brand-text tracking-wider border-b border-brand-border/30 pb-3 mb-4 select-none">
                Categorias Cadastradas
              </h3>

              {isLoadingCats ? (
                <div className="py-12 text-center text-xs text-brand-text/50">Carregando categorias...</div>
              ) : categorias.length === 0 ? (
                <div className="py-12 text-center text-xs text-brand-text/50">Nenhuma categoria cadastrada.</div>
              ) : (
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-brand-border/40 text-brand-text/40 font-bold uppercase tracking-wider">
                        <th className="pb-3 pl-2">Ícone / Nome</th>
                        <th className="pb-3">Tipo</th>
                        <th className="pb-3">Cor</th>
                        <th className="pb-3 pr-2 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border/20">
                      {categorias.map((cat) => (
                        <tr key={cat.id} className="hover:bg-brand-card/10 transition-colors">
                          <td className="py-4 pl-2 font-bold text-brand-text flex items-center gap-2">
                            <span className="text-sm">{cat.icone}</span>
                            <span>{cat.nome}</span>
                            {!cat.ativa && (
                              <span className="bg-red-500/10 border border-red-500/20 text-red-500 text-[8px] font-bold uppercase px-1.5 py-0.2 rounded">
                                Inativa
                              </span>
                            )}
                          </td>
                          <td className="py-4">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                              cat.tipo === "receita"
                                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-500"
                                : "bg-red-500/10 border border-red-500/20 text-red-500"
                            }`}>
                              {cat.tipo === "receita" ? "Receita" : "Despesa"}
                            </span>
                          </td>
                          <td className="py-4 font-mono text-[10px] text-brand-text/70 flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full border border-brand-border/40" style={{ backgroundColor: cat.cor }} />
                            {cat.cor}
                          </td>
                          <td className="py-4 pr-2 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenCatForm(cat)}
                                className="p-1.5 text-brand-text/40 hover:text-brand-gold hover:bg-brand-card/50 rounded-lg transition-all cursor-pointer"
                                title="Editar"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                  <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.287.287-.63.502-1.01.633l-3.156 1.262a.75.75 0 0 1-.98-.98Z" />
                                </svg>
                              </button>
                              {cat.ativa && (
                                <button
                                  onClick={() => handleDeactivateCat(cat.id)}
                                  className="p-1.5 text-brand-text/40 hover:text-red-500 hover:bg-red-500/5 rounded-lg transition-all cursor-pointer"
                                  title="Inativar"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L9.44 10.5l-2.22 2.22a.75.75 0 1 0 1.06 1.06L10.5 11.56l2.22 2.22a.75.75 0 1 0 1.06-1.06L11.56 10.5l2.22-2.22a.75.75 0 0 0-1.06-1.06L10.5 9.44 8.28 7.22Z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Form Column */}
            <div className={`lg:col-span-1 ${isCatFormOpen ? "block" : "hidden lg:block"}`}>
              {isCatFormOpen ? (
                <div className="bg-brand-card/30 border border-brand-border/40 rounded-3xl p-6 backdrop-blur-md flex flex-col gap-4 animate-slideUpPopup">
                  <h3 className="text-sm font-extrabold uppercase text-brand-text border-b border-brand-border/30 pb-3 select-none">
                    {selectedCat ? "Editar Categoria" : "Nova Categoria"}
                  </h3>

                  <form onSubmit={handleSaveCat} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Nome da Categoria</label>
                      <input
                        type="text"
                        required
                        value={catNome}
                        onChange={(e) => setCatNome(e.target.value)}
                        placeholder="Ex: Marketing Digital, Comissão..."
                        className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Tipo</label>
                      <select
                        value={catTipo}
                        onChange={(e) => setCatTipo(e.target.value as "receita" | "despesa")}
                        className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
                      >
                        <option value="despesa">Despesa (Saída)</option>
                        <option value="receita">Receita (Entrada)</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Emoji / Ícone</label>
                        <input
                          type="text"
                          required
                          maxLength={2}
                          value={catIcone}
                          onChange={(e) => setCatIcone(e.target.value)}
                          className="bg-brand-bg border border-brand-border rounded-xl text-center text-sm text-brand-text px-2 h-11 w-full focus:outline-none focus:border-brand-primary"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Cor</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={catCor}
                            onChange={(e) => setCatCor(e.target.value)}
                            className="bg-transparent border-0 w-11 h-11 p-0 rounded-xl cursor-pointer"
                          />
                          <input
                            type="text"
                            required
                            value={catCor}
                            onChange={(e) => setCatCor(e.target.value)}
                            className="bg-brand-bg border border-brand-border rounded-xl text-center text-[10px] text-brand-text px-2 h-11 flex-grow focus:outline-none focus:border-brand-primary"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-4 border-t border-brand-border/30 pt-4">
                      <button
                        type="button"
                        onClick={() => setIsCatFormOpen(false)}
                        className="flex-1 h-11 bg-transparent hover:bg-brand-card/50 text-brand-text/70 hover:text-brand-text border border-brand-border text-[11px] font-bold uppercase tracking-wider rounded-xl cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="flex-1 h-11 bg-brand-primary text-white text-[11px] font-bold uppercase tracking-wider rounded-xl cursor-pointer"
                      >
                        Salvar
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="bg-brand-card/10 border border-dashed border-brand-border/40 rounded-3xl p-8 text-center text-xs text-brand-text/40 select-none">
                  Selecione uma categoria para editar ou clique em "Nova Categoria" para criar novos fluxos de receitas/despesas.
                </div>
              )}
            </div>
          </>
        )}

        {/* ==================== TAB 2: PARCEIROS ==================== */}
        {activeTab === "parceiros" && (
          <>
            {/* List Column */}
            <div className={`lg:col-span-2 bg-brand-card/30 border border-brand-border/40 rounded-3xl p-6 backdrop-blur-md ${isParceiroFormOpen ? "hidden lg:block" : "block"}`}>
              <h3 className="text-xs font-extrabold uppercase text-brand-text tracking-wider border-b border-brand-border/30 pb-3 mb-4 select-none">
                Fornecedores e Clientes Cadastrados
              </h3>

              {isLoadingParceiros ? (
                <div className="py-12 text-center text-xs text-brand-text/50">Carregando contatos...</div>
              ) : parceiros.length === 0 ? (
                <div className="py-12 text-center text-xs text-brand-text/50">Nenhum contato cadastrado.</div>
              ) : (
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-brand-border/40 text-brand-text/40 font-bold uppercase tracking-wider">
                        <th className="pb-3 pl-2">Nome / Documento</th>
                        <th className="pb-3">Tipo</th>
                        <th className="pb-3">Telefone / E-mail</th>
                        <th className="pb-3 pr-2 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border/20">
                      {parceiros.map((part) => (
                        <tr key={part.id} className="hover:bg-brand-card/10 transition-colors">
                          <td className="py-4 pl-2 font-bold text-brand-text">
                            <div className="flex flex-col gap-0.5">
                              <span>{part.nome}</span>
                              {part.documento && (
                                <span className="text-[10px] text-brand-text/40 font-normal">
                                  📄 {part.documento}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-4">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                              part.tipo === "fornecedor"
                                ? "bg-amber-500/10 border border-amber-500/20 text-amber-500"
                                : part.tipo === "cliente"
                                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-500"
                                : "bg-brand-gold/10 border border-brand-gold/20 text-brand-gold"
                            }`}>
                              {part.tipo === "fornecedor"
                                ? "Fornecedor"
                                : part.tipo === "cliente"
                                ? "Cliente"
                                : "Ambos"}
                            </span>
                          </td>
                          <td className="py-4 text-brand-text/70">
                            <div className="flex flex-col gap-0.5">
                              <span>{part.telefone || "-"}</span>
                              <span className="text-[10px] text-brand-text/40 lowercase">{part.email || ""}</span>
                            </div>
                          </td>
                          <td className="py-4 pr-2 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenParceiroForm(part)}
                                className="p-1.5 text-brand-text/40 hover:text-brand-gold hover:bg-brand-card/50 rounded-lg transition-all cursor-pointer"
                                title="Editar"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                  <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.287.287-.63.502-1.01.633l-3.156 1.262a.75.75 0 0 1-.98-.98Z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeleteParceiro(part.id)}
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

            {/* Form Column */}
            <div className={`lg:col-span-1 ${isParceiroFormOpen ? "block" : "hidden lg:block"}`}>
              {isParceiroFormOpen ? (
                <div className="bg-brand-card/30 border border-brand-border/40 rounded-3xl p-6 backdrop-blur-md flex flex-col gap-4 animate-slideUpPopup">
                  <h3 className="text-sm font-extrabold uppercase text-brand-text border-b border-brand-border/30 pb-3 select-none">
                    {selectedParceiro ? "Editar Parceiro" : "Novo Parceiro"}
                  </h3>

                  <form onSubmit={handleSaveParceiro} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Razão Social / Nome</label>
                      <input
                        type="text"
                        required
                        value={partNome}
                        onChange={(e) => setPartNome(e.target.value)}
                        placeholder="Ex: Auto Peças Paraná, João Silva..."
                        className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Tipo de Contato</label>
                      <select
                        value={partTipo}
                        onChange={(e) => setPartTipo(e.target.value as "fornecedor" | "cliente" | "ambos")}
                        className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
                      >
                        <option value="fornecedor">Fornecedor</option>
                        <option value="cliente">Cliente</option>
                        <option value="ambos">Ambos (Fornecedor e Cliente)</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">CPF / CNPJ</label>
                      <input
                        type="text"
                        value={partDoc}
                        onChange={(e) => setPartDoc(e.target.value)}
                        placeholder="Ex: 00.000.000/0001-00"
                        className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Telefone de Contato</label>
                      <input
                        type="tel"
                        value={partTel}
                        onChange={(e) => setPartTel(e.target.value)}
                        placeholder="Ex: (41) 98888-7777"
                        className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">E-mail</label>
                      <input
                        type="email"
                        value={partEmail}
                        onChange={(e) => setPartEmail(e.target.value)}
                        placeholder="Ex: contato@fornecedor.com"
                        className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
                      />
                    </div>

                    <div className="flex items-center gap-2 mt-4 border-t border-brand-border/30 pt-4">
                      <button
                        type="button"
                        onClick={() => setIsParceiroFormOpen(false)}
                        className="flex-1 h-11 bg-transparent hover:bg-brand-card/50 text-brand-text/70 hover:text-brand-text border border-brand-border text-[11px] font-bold uppercase tracking-wider rounded-xl cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="flex-1 h-11 bg-brand-primary text-white text-[11px] font-bold uppercase tracking-wider rounded-xl cursor-pointer"
                      >
                        Salvar
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="bg-brand-card/10 border border-dashed border-brand-border/40 rounded-3xl p-8 text-center text-xs text-brand-text/40 select-none">
                  Selecione um contato para detalhar ou clique em "Novo Parceiro" para registrar novos fornecedores ou clientes.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
