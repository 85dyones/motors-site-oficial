"use client";

import { useEffect, useState } from "react";
import { useConfirm } from "./ConfirmDialog";

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "comercial" | "financeiro";
  is_active: boolean;
  created_at: string;
}

export default function UserManagement() {
  const { confirm } = useConfirm();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Create User Form State
  const [isCreating, setIsCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"comercial" | "admin" | "financeiro">("comercial");
  const [isSaving, setIsSaving] = useState(false);

  // Edit User State
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users || []);
      } else {
        setError(data.error || "Falha ao carregar usuários.");
      }
    } catch (err) {
      setError("Erro ao conectar com o servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, full_name: fullName, role }),
      });
      const data = await res.json();

      if (res.ok) {
        setSuccessMsg("Usuário criado com sucesso!");
        setIsCreating(false);
        setEmail("");
        setPassword("");
        setFullName("");
        setRole("comercial");
        fetchUsers();
      } else {
        setError(data.error || "Falha ao criar usuário.");
      }
    } catch (err) {
      setError("Erro ao salvar usuário.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsSaving(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: editingUser.full_name,
          role: editingUser.role,
          is_active: editingUser.is_active,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setSuccessMsg("Usuário atualizado com sucesso!");
        setEditingUser(null);
        fetchUsers();
      } else {
        setError(data.error || "Falha ao atualizar usuário.");
      }
    } catch (err) {
      setError("Erro ao salvar alterações.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    const isConfirmed = await confirm({
      title: "Excluir Usuário",
      message: "Tem certeza que deseja excluir permanentemente este usuário?",
      type: "danger",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar"
    });
    if (!isConfirmed) return;
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      const data = await res.json();

      if (res.ok) {
        setSuccessMsg("Usuário excluído com sucesso!");
        fetchUsers();
      } else {
        setError(data.error || "Falha ao excluir usuário.");
      }
    } catch (err) {
      setError("Erro ao conectar com o servidor.");
    }
  };

  const getRoleBadgeClass = (r: string) => {
    switch (r) {
      case "admin": return "bg-brand-primary/10 border border-brand-primary/20 text-brand-primary";
      case "financeiro": return "bg-brand-gold/10 border border-brand-gold/20 text-brand-gold";
      case "comercial": default: return "bg-emerald-500/10 border border-emerald-500/20 text-emerald-500";
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl">
      {/* Page Header */}
      <div className="flex items-center justify-between pb-4 border-b border-brand-border/40">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight uppercase">
            Controle de Usuários
          </h1>
          <p className="text-xs text-brand-text/50">
            Gerencie os acessos administrativos, comerciais e financeiros do sistema.
          </p>
        </div>

        <button
          onClick={() => {
            setIsCreating(true);
            setEditingUser(null);
            setError("");
            setSuccessMsg("");
          }}
          className="h-10 bg-brand-primary hover:bg-brand-primary/95 text-white text-[11px] font-bold uppercase tracking-wider px-4 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer shadow-md select-none"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          Novo Usuário
        </button>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs px-4 py-3 rounded-xl flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
            <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
          </svg>
          <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs px-4 py-3 rounded-xl flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
            <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Users Table / List */}
        <div className="lg:col-span-2 bg-brand-card/30 border border-brand-border/40 rounded-3xl p-6 backdrop-blur-md">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-brand-text/50">Carregando usuários...</div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-xs text-brand-text/50">Nenhum usuário cadastrado.</div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-brand-border/40 text-brand-text/40 font-bold uppercase tracking-wider">
                    <th className="pb-3 pl-2">Nome</th>
                    <th className="pb-3">E-mail</th>
                    <th className="pb-3">Nível</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 pr-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/20">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-brand-card/10 transition-colors">
                      <td className="py-4 pl-2 font-bold text-brand-text">{u.full_name}</td>
                      <td className="py-4 text-brand-text/70">{u.email}</td>
                      <td className="py-4">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${getRoleBadgeClass(u.role)}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-4">
                        <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${u.is_active ? "bg-emerald-500" : "bg-zinc-500"}`} />
                        <span className="text-brand-text/60">{u.is_active ? "Ativo" : "Inativo"}</span>
                      </td>
                      <td className="py-4 pr-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditingUser({ ...u });
                              setIsCreating(false);
                              setError("");
                              setSuccessMsg("");
                            }}
                            className="p-1.5 text-brand-text/50 hover:text-brand-gold hover:bg-brand-card/50 rounded-lg transition-all cursor-pointer"
                            title="Editar usuário"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.287.287-.63.502-1.01.633l-3.156 1.262a.75.75 0 0 1-.98-.98Z" />
                              <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className="p-1.5 text-brand-text/50 hover:text-red-500 hover:bg-red-500/5 rounded-lg transition-all cursor-pointer"
                            title="Excluir usuário"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
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

        {/* Action Panel: Create or Edit */}
        <div className="lg:col-span-1">
          {isCreating && (
            <div className="bg-brand-card/30 border border-brand-border/40 rounded-3xl p-6 backdrop-blur-md flex flex-col gap-4 animate-slideUpPopup">
              <h3 className="text-sm font-extrabold uppercase text-brand-text select-none">Novo Usuário</h3>
              <form onSubmit={handleCreateUser} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-brand-text/50 uppercase pl-1">Nome Completo</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="João da Silva"
                    className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-brand-text/50 uppercase pl-1">E-mail</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="joao@motors.com.br"
                    className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-brand-text/50 uppercase pl-1">Senha Provisória</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 6 caracteres"
                    minLength={6}
                    className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-brand-text/50 uppercase pl-1">Nível de Permissão</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
                  >
                    <option value="comercial">Comercial</option>
                    <option value="financeiro">Financeiro</option>
                    <option value="admin">Administrador (Total)</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="flex-1 h-11 bg-transparent hover:bg-brand-card/50 text-brand-text/70 hover:text-brand-text border border-brand-border text-[11px] font-bold uppercase tracking-wider rounded-xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 h-11 bg-brand-primary text-white text-[11px] font-bold uppercase tracking-wider rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? "Salvando..." : "Criar"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {editingUser && (
            <div className="bg-brand-card/30 border border-brand-border/40 rounded-3xl p-6 backdrop-blur-md flex flex-col gap-4 animate-slideUpPopup">
              <h3 className="text-sm font-extrabold uppercase text-brand-text select-none">Editar Usuário</h3>
              <form onSubmit={handleUpdateUser} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-brand-text/50 uppercase pl-1">Nome Completo</label>
                  <input
                    type="text"
                    required
                    value={editingUser.full_name}
                    onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
                    className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-brand-text/50 uppercase pl-1">Nível de Permissão</label>
                  <select
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as any })}
                    className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-11 w-full focus:outline-none focus:border-brand-primary cursor-pointer"
                  >
                    <option value="comercial">Comercial</option>
                    <option value="financeiro">Financeiro</option>
                    <option value="admin">Administrador (Total)</option>
                  </select>
                </div>

                <div className="flex items-center gap-3 py-1">
                  <span className="text-[10px] font-bold text-brand-text/50 uppercase pl-1">Status da Conta:</span>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editingUser.is_active}
                      onChange={(e) => setEditingUser({ ...editingUser, is_active: e.target.checked })}
                      className="rounded border-brand-border text-brand-primary focus:ring-brand-primary/20 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-xs text-brand-text font-semibold">Conta Ativa</span>
                  </label>
                </div>

                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="flex-1 h-11 bg-transparent hover:bg-brand-card/50 text-brand-text/70 hover:text-brand-text border border-brand-border text-[11px] font-bold uppercase tracking-wider rounded-xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 h-11 bg-brand-primary text-white text-[11px] font-bold uppercase tracking-wider rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {!isCreating && !editingUser && (
            <div className="bg-brand-card/10 border border-dashed border-brand-border/40 rounded-3xl p-8 text-center text-xs text-brand-text/40 select-none">
              Selecione um usuário para editar ou clique em "Novo Usuário" para começar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
