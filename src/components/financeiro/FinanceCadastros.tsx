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
        nome: partNome.trim(),
        tipo: partTipo,
        documento: partDoc.trim() || undefined,
        telefone: partTel.trim() || undefined,
        email: partEmail.trim() || undefined,
      };

      // Edição vive em /parceiros/[id]; a coleção só aceita GET e POST.
      const res = await fetch(
        selectedParceiro ? `/api/financeiro/parceiros/${selectedParceiro.id}` : "/api/financeiro/parceiros",
        {
          method: selectedParceiro ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

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
      const res = await fetch(`/api/financeiro/parceiros/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSuccess("Parceiro removido com sucesso!");
        fetchParceiros();
        setTimeout(() => setSuccess(""), 4000);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || "Erro ao excluir parceiro.");
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
      <div className="bg-mt-surface border border-mt-regua-fina p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 select-none">
        <div>
          <h1 className="text-[17px] font-extrabold tracking-[-.015em] text-mt-ink">
            Cadastros auxiliares & plano de contas
          </h1>
          <p className="text-xs text-mt-neutral-800 mt-1">
            Gestão de Parceiros (Clientes e Fornecedores) e consulta da estrutura oficial do **Plano de Contas de Revenda**.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-2 bg-mt-bg p-1 border border-mt-regua-fina">
          <button
            onClick={() => setActiveTab("parceiros")}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "parceiros"
                ? "bg-mt-accent text-mt-inverso"
                : "text-mt-neutral-700 hover:text-mt-ink"
            }`}
          >
            🏢 Parceiros ({parceiros.length})
          </button>
          <button
            onClick={() => setActiveTab("plano")}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "plano"
                ? "bg-mt-accent text-mt-inverso"
                : "text-mt-neutral-700 hover:text-mt-ink"
            }`}
          >
            🌳 Árvore do Plano de Contas ({PLANO_DE_CONTAS_REVENDA.length})
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-mt-accent-100 border border-mt-accent-300 text-mt-accent text-xs px-4 py-3 select-none">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-mt-surface border border-mt-regua-fina text-mt-accent-800 text-xs px-4 py-3 select-none font-bold">
          {success}
        </div>
      )}

      {/* PARCEIROS TAB */}
      {activeTab === "parceiros" && (
        <div className="bg-mt-surface border border-mt-regua-fina p-6 flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-mt-regua-fina pb-4">
            <div>
              <h3 className="text-xs font-extrabold uppercase text-mt-ink tracking-wider">
                Cadastro de Clientes & Fornecedores
              </h3>
              <p className="text-[10px] text-mt-neutral-700 mt-0.5">Parceiros comerciais vinculados aos lançamentos de contas.</p>
            </div>
            <button
              onClick={() => handleOpenParceiroForm()}
              className="px-4 py-2.5 bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer "
            >
              + Novo Parceiro
            </button>
          </div>

          {isLoadingParceiros ? (
            <div className="py-12 text-center text-xs text-mt-neutral-700">Carregando parceiros...</div>
          ) : parceiros.length === 0 ? (
            <div className="py-12 text-center text-xs text-mt-neutral-700">Nenhum parceiro cadastrado ainda.</div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-mt-regua-fina text-mt-neutral-700 font-bold uppercase tracking-wider">
                    <th className="pb-3 pl-2">Nome</th>
                    <th className="pb-3">Tipo</th>
                    <th className="pb-3">CPF / CNPJ</th>
                    <th className="pb-3">Telefone</th>
                    <th className="pb-3 pr-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mt-regua-fina">
                  {parceiros.map((p) => (
                    <tr key={p.id} className="hover:bg-mt-accent-100 transition-colors">
                      <td className="py-3 pl-2 font-bold text-mt-ink">{p.nome}</td>
                      <td className="py-3">
                        <span
                          className={`text-[9px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 border ${
                            p.tipo === "fornecedor"
                              ? "bg-mt-accent-100 text-mt-accent-800 border-mt-accent-300"
                              : p.tipo === "cliente"
                              ? "bg-mt-surface text-mt-accent-800 border-mt-regua-fina"
                              : "bg-mt-surface text-mt-neutral-700 border-mt-regua-fina"
                          }`}
                        >
                          {p.tipo}
                        </span>
                      </td>
                      <td className="py-3 text-mt-neutral-700 font-mono">{p.documento || "—"}</td>
                      <td className="py-3 text-mt-neutral-700">{p.telefone || "—"}</td>
                      <td className="py-3 pr-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenParceiroForm(p)}
                            className="text-xs text-mt-accent font-bold hover:underline"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteParceiro(p.id, p.nome)}
                            className="text-xs text-mt-accent-800 font-bold hover:text-mt-accent hover:underline"
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
        <div className="bg-mt-surface border border-mt-regua-fina p-6 flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-mt-regua-fina pb-4 gap-3">
            <div>
              <h3 className="text-xs font-extrabold uppercase text-mt-ink tracking-wider">
                Estrutura do Plano de Contas de Revenda
              </h3>
              <p className="text-[10px] text-mt-neutral-700 mt-0.5">Hierarquia oficial utilizada em todos os lançamentos e relatórios DRE.</p>
            </div>

            <input
              type="text"
              placeholder="Buscar código ou nome (ex: 003.005.006)..."
              value={planoSearch}
              onChange={(e) => setPlanoSearch(e.target.value)}
              className="bg-mt-bg border border-mt-regua-fina px-3.5 h-10 text-xs text-mt-ink outline-none focus:border-mt-accent max-w-xs font-mono"
            />
          </div>

          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="border-b border-mt-regua-fina text-mt-neutral-700 font-bold uppercase tracking-wider">
                  <th className="pb-3 pl-2">Código</th>
                  <th className="pb-3">Nome da Conta / Grupo</th>
                  <th className="pb-3">Nível</th>
                  <th className="pb-3">Tipo</th>
                  <th className="pb-3 pr-2 text-right">Lançamento?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mt-regua-fina">
                {filteredPlano.map((c) => (
                  <tr key={c.codigo} className={`hover:bg-mt-accent-100 transition-colors ${c.nivel === 1 ? "bg-mt-accent-100 font-bold" : ""}`}>
                    <td className="py-2.5 pl-2 font-bold text-mt-accent">{c.codigo}</td>
                    <td className="py-2.5 text-mt-ink" style={{ paddingLeft: `${(c.nivel - 1) * 16 + 8}px` }}>
                      {c.nivel === 1 ? <strong>{c.nome}</strong> : c.nome}
                    </td>
                    <td className="py-2.5 text-mt-neutral-700">Nível {c.nivel}</td>
                    <td className="py-2.5">
                      <span className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 border bg-mt-bg text-mt-neutral-800 border-mt-regua-fina">
                        {c.tipo}
                      </span>
                    </td>
                    <td className="py-2.5 pr-2 text-right">
                      <span
                        className={`text-[9px] font-extrabold uppercase px-2 py-0.5 ${
                          c.permiteLancamento
                            ? "bg-mt-surface text-mt-accent-800 border border-mt-regua-fina"
                            : "bg-mt-bg text-mt-neutral-600 border border-mt-regua-fina"
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
        <div className="fixed inset-0 z-50 bg-mt-inverso-fundo/80 flex items-center justify-center p-4 select-none">
          <div className="bg-mt-surface border border-mt-regua-fina max-w-md w-full p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-mt-regua-fina pb-3">
              <h3 className="text-xs font-extrabold uppercase text-mt-ink tracking-wider">
                {selectedParceiro ? "Editar Parceiro" : "Novo Parceiro Commercial"}
              </h3>
              <button onClick={() => setIsParceiroFormOpen(false)} className="text-mt-neutral-700 hover:text-mt-ink font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveParceiro} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold uppercase text-mt-neutral-700">Nome Razão Social / Fantasia</label>
                <input
                  type="text"
                  required
                  value={partNome}
                  onChange={(e) => setPartNome(e.target.value)}
                  placeholder="Ex: AutoPeças Curitiba Ltda"
                  className="bg-mt-bg border border-mt-regua-fina px-3.5 h-10 text-xs text-mt-ink outline-none focus:border-mt-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold uppercase text-mt-neutral-700">Tipo de Parceiro</label>
                  <select
                    value={partTipo}
                    onChange={(e: any) => setPartTipo(e.target.value)}
                    className="bg-mt-bg border border-mt-regua-fina px-3 h-10 text-xs text-mt-ink outline-none focus:border-mt-accent cursor-pointer"
                  >
                    <option value="fornecedor">Fornecedor</option>
                    <option value="cliente">Cliente</option>
                    <option value="ambos">Ambos</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold uppercase text-mt-neutral-700">CPF / CNPJ</label>
                  <input
                    type="text"
                    value={partDoc}
                    onChange={(e) => setPartDoc(e.target.value)}
                    placeholder="00.000.000/0000-00"
                    className="bg-mt-bg border border-mt-regua-fina px-3 h-10 text-xs text-mt-ink font-mono outline-none focus:border-mt-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold uppercase text-mt-neutral-700">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    value={partTel}
                    onChange={(e) => setPartTel(e.target.value)}
                    placeholder="(41) 99999-9999"
                    className="bg-mt-bg border border-mt-regua-fina px-3 h-10 text-xs text-mt-ink outline-none focus:border-mt-accent"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold uppercase text-mt-neutral-700">E-mail</label>
                  <input
                    type="email"
                    value={partEmail}
                    onChange={(e) => setPartEmail(e.target.value)}
                    placeholder="contato@empresa.com"
                    className="bg-mt-bg border border-mt-regua-fina px-3 h-10 text-xs text-mt-ink outline-none focus:border-mt-accent"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-mt-regua-fina mt-1">
                <button
                  type="button"
                  onClick={() => setIsParceiroFormOpen(false)}
                  className="px-4 py-2 bg-mt-bg border border-mt-regua-fina text-mt-neutral-700 text-xs font-bold uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-mt-accent text-mt-inverso text-xs font-extrabold uppercase tracking-wider"
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
