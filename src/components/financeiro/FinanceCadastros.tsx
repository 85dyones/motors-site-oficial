"use client";

import { useEffect, useState } from "react";
import { useConfirm } from "../admin/ConfirmDialog";
import { PLANO_DE_CONTAS_REVENDA, ContaPlano } from "@/lib/planoContasData";

interface Parceiro {
  id: string;
  nome: string;
  tipo: "fornecedor" | "cliente" | "ambos";
  documento?: string;
  telefone?: string;
  email?: string;
}

export default function FinanceCadastros() {
  const { confirm } = useConfirm();
  const [activeTab, setActiveTab] = useState<"parceiros" | "plano">("parceiros");

  // Search in Plano de contas
  const [planoSearch, setPlanoSearch] = useState("");

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
    fetchParceiros();
  }, []);

  const handleOpenParceiroForm = (p?: Parceiro) => {
    setError("");
    setSuccess("");
    if (p) {
      setSelectedParceiro(p);
      setPartNome(p.nome);
      setPartTipo(p.tipo);
      setPartDoc(p.documento || "");
      setPartTel(p.telefone || "");
      setPartEmail(p.email || "");
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

  const handleSaveParceiro = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!partNome.trim()) {
      setError("O nome do parceiro é obrigatório.");
      return;
    }

    try {
      const payload = {
        id: selectedParceiro ? selectedParceiro.id : undefined,
        nome: partNome.trim(),
        tipo: partTipo,
        documento: partDoc.trim() || undefined,
        telefone: partTel.trim() || undefined,
        email: partEmail.trim() || undefined,
      };

      const res = await fetch("/api/financeiro/parceiros", {
        method: selectedParceiro ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setSuccess(selectedParceiro ? "Parceiro atualizado com sucesso!" : "Parceiro cadastrado com sucesso!");
        setIsParceiroFormOpen(false);
        fetchParceiros();
        setTimeout(() => setSuccess(""), 4000);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || "Erro ao salvar parceiro.");
      }
    } catch (err: any) {
      setError(`Erro de rede: ${err.message}`);
    }
  };

  const handleDeleteParceiro = async (id: string, nome: string) => {
    const isConfirmed = await confirm({
      title: "Excluir Parceiro",
      message: `Tem certeza que deseja excluir o parceiro "${nome}"?`,
      confirmLabel: "Sim, Excluir",
      cancelLabel: "Cancelar",
      type: "danger",
    });

    if (!isConfirmed) return;

    try {
      const res = await fetch(`/api/financeiro/parceiros?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setSuccess("Parceiro removido com sucesso!");
        fetchParceiros();
        setTimeout(() => setSuccess(""), 4000);
      } else {
        setError("Erro ao excluir parceiro.");
      }
    } catch (err: any) {
      setError(`Erro de rede: ${err.message}`);
    }
  };

  const filteredPlano = PLANO_DE_CONTAS_REVENDA.filter((c) => {
    if (!planoSearch.trim()) return true;
    const q = planoSearch.toLowerCase().trim();
    return c.codigo.toLowerCase().includes(q) || c.nome.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl">
      {/* Top Banner */}
      <div className="bg-brand-card/40 border border-brand-border/50 rounded-3xl p-6 backdrop-blur-xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 select-none">
        <div>
          <h1 className="text-base font-black uppercase text-brand-text tracking-wider flex items-center gap-2">
            <span>📝</span> Cadastros Auxiliares & Plano de Contas
          </h1>
          <p className="text-xs text-brand-text/75 mt-1">
            Gestão de Parceiros (Clientes e Fornecedores) e consulta da estrutura oficial do **Plano de Contas de Revenda**.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-2 bg-brand-bg/60 p-1 rounded-xl border border-brand-border/50">
          <button
            onClick={() => setActiveTab("parceiros")}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "parceiros"
                ? "bg-brand-primary text-white shadow-md"
                : "text-brand-text/70 hover:text-brand-text"
            }`}
          >
            🏢 Parceiros ({parceiros.length})
          </button>
          <button
            onClick={() => setActiveTab("plano")}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "plano"
                ? "bg-brand-primary text-white shadow-md"
                : "text-brand-text/70 hover:text-brand-text"
            }`}
          >
            🌳 Árvore do Plano de Contas ({PLANO_DE_CONTAS_REVENDA.length})
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-500 text-xs px-4 py-3 rounded-xl select-none">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs px-4 py-3 rounded-xl select-none font-bold">
          {success}
        </div>
      )}

      {/* PARCEIROS TAB */}
      {activeTab === "parceiros" && (
        <div className="bg-brand-card/30 border border-brand-border/40 rounded-3xl p-6 backdrop-blur-md flex flex-col gap-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-brand-border/40 pb-4">
            <div>
              <h3 className="text-xs font-extrabold uppercase text-brand-text tracking-wider">
                Cadastro de Clientes & Fornecedores
              </h3>
              <p className="text-[10px] text-brand-text/60 mt-0.5">Parceiros comerciais vinculados aos lançamentos de contas.</p>
            </div>
            <button
              onClick={() => handleOpenParceiroForm()}
              className="px-4 py-2.5 bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer active:scale-95"
            >
              + Novo Parceiro
            </button>
          </div>

          {isLoadingParceiros ? (
            <div className="py-12 text-center text-xs text-brand-text/50">Carregando parceiros...</div>
          ) : parceiros.length === 0 ? (
            <div className="py-12 text-center text-xs text-brand-text/50">Nenhum parceiro cadastrado ainda.</div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-brand-border/40 text-brand-text/60 font-bold uppercase tracking-wider">
                    <th className="pb-3 pl-2">Nome</th>
                    <th className="pb-3">Tipo</th>
                    <th className="pb-3">CPF / CNPJ</th>
                    <th className="pb-3">Telefone</th>
                    <th className="pb-3 pr-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/30">
                  {parceiros.map((p) => (
                    <tr key={p.id} className="hover:bg-brand-primary/5 transition-colors">
                      <td className="py-3 pl-2 font-bold text-brand-text">{p.nome}</td>
                      <td className="py-3">
                        <span
                          className={`text-[9px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                            p.tipo === "fornecedor"
                              ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                              : p.tipo === "cliente"
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                              : "bg-purple-500/10 text-purple-500 border-purple-500/20"
                          }`}
                        >
                          {p.tipo}
                        </span>
                      </td>
                      <td className="py-3 text-brand-text/70 font-mono">{p.documento || "—"}</td>
                      <td className="py-3 text-brand-text/70">{p.telefone || "—"}</td>
                      <td className="py-3 pr-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenParceiroForm(p)}
                            className="text-xs text-brand-primary font-bold hover:underline"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteParceiro(p.id, p.nome)}
                            className="text-xs text-red-500/70 font-bold hover:text-red-500 hover:underline"
                          >
                            Excluir
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
      )}

      {/* PLANO DE CONTAS TAB */}
      {activeTab === "plano" && (
        <div className="bg-brand-card/30 border border-brand-border/40 rounded-3xl p-6 backdrop-blur-md flex flex-col gap-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-brand-border/40 pb-4 gap-3">
            <div>
              <h3 className="text-xs font-extrabold uppercase text-brand-text tracking-wider">
                Estrutura do Plano de Contas de Revenda
              </h3>
              <p className="text-[10px] text-brand-text/60 mt-0.5">Hierarquia oficial utilizada em todos os lançamentos e relatórios DRE.</p>
            </div>

            <input
              type="text"
              placeholder="Buscar código ou nome (ex: 003.005.006)..."
              value={planoSearch}
              onChange={(e) => setPlanoSearch(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-xl px-3.5 h-10 text-xs text-brand-text outline-none focus:border-brand-primary max-w-xs font-mono"
            />
          </div>

          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="border-b border-brand-border/40 text-brand-text/60 font-bold uppercase tracking-wider">
                  <th className="pb-3 pl-2">Código</th>
                  <th className="pb-3">Nome da Conta / Grupo</th>
                  <th className="pb-3">Nível</th>
                  <th className="pb-3">Tipo</th>
                  <th className="pb-3 pr-2 text-right">Lançamento?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/30">
                {filteredPlano.map((c) => (
                  <tr key={c.codigo} className={`hover:bg-brand-primary/5 transition-colors ${c.nivel === 1 ? "bg-brand-primary/10 font-bold" : ""}`}>
                    <td className="py-2.5 pl-2 font-bold text-brand-primary">{c.codigo}</td>
                    <td className="py-2.5 text-brand-text" style={{ paddingLeft: `${(c.nivel - 1) * 16 + 8}px` }}>
                      {c.nivel === 1 ? <strong>{c.nome}</strong> : c.nome}
                    </td>
                    <td className="py-2.5 text-brand-text/60">Nível {c.nivel}</td>
                    <td className="py-2.5">
                      <span className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-brand-bg text-brand-text/80 border-brand-border">
                        {c.tipo}
                      </span>
                    </td>
                    <td className="py-2.5 pr-2 text-right">
                      <span
                        className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                          c.permiteLancamento
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                            : "bg-brand-bg text-brand-text/40 border border-brand-border"
                        }`}
                      >
                        {c.permiteLancamento ? "SIM" : "NÃO"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Partner Form Modal */}
      {isParceiroFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
          <div className="bg-brand-card border border-brand-border/60 rounded-3xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-brand-border/40 pb-3">
              <h3 className="text-xs font-extrabold uppercase text-brand-text tracking-wider">
                {selectedParceiro ? "Editar Parceiro" : "Novo Parceiro Commercial"}
              </h3>
              <button onClick={() => setIsParceiroFormOpen(false)} className="text-brand-text/50 hover:text-brand-text font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveParceiro} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold uppercase text-brand-text/70">Nome Razão Social / Fantasia</label>
                <input
                  type="text"
                  required
                  value={partNome}
                  onChange={(e) => setPartNome(e.target.value)}
                  placeholder="Ex: AutoPeças Curitiba Ltda"
                  className="bg-brand-bg border border-brand-border rounded-xl px-3.5 h-10 text-xs text-brand-text outline-none focus:border-brand-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold uppercase text-brand-text/70">Tipo de Parceiro</label>
                  <select
                    value={partTipo}
                    onChange={(e: any) => setPartTipo(e.target.value)}
                    className="bg-brand-bg border border-brand-border rounded-xl px-3 h-10 text-xs text-brand-text outline-none focus:border-brand-primary cursor-pointer"
                  >
                    <option value="fornecedor">Fornecedor</option>
                    <option value="cliente">Cliente</option>
                    <option value="ambos">Ambos</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold uppercase text-brand-text/70">CPF / CNPJ</label>
                  <input
                    type="text"
                    value={partDoc}
                    onChange={(e) => setPartDoc(e.target.value)}
                    placeholder="00.000.000/0000-00"
                    className="bg-brand-bg border border-brand-border rounded-xl px-3 h-10 text-xs text-brand-text font-mono outline-none focus:border-brand-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold uppercase text-brand-text/70">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    value={partTel}
                    onChange={(e) => setPartTel(e.target.value)}
                    placeholder="(41) 99999-9999"
                    className="bg-brand-bg border border-brand-border rounded-xl px-3 h-10 text-xs text-brand-text outline-none focus:border-brand-primary"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold uppercase text-brand-text/70">E-mail</label>
                  <input
                    type="email"
                    value={partEmail}
                    onChange={(e) => setPartEmail(e.target.value)}
                    placeholder="contato@empresa.com"
                    className="bg-brand-bg border border-brand-border rounded-xl px-3 h-10 text-xs text-brand-text outline-none focus:border-brand-primary"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-brand-border/40 mt-1">
                <button
                  type="button"
                  onClick={() => setIsParceiroFormOpen(false)}
                  className="px-4 py-2 bg-brand-bg border border-brand-border text-brand-text/70 text-xs font-bold uppercase rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-brand-primary text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md"
                >
                  Salvar Parceiro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
