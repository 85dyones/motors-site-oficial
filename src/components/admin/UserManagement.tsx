"use client";

import { useEffect, useMemo, useState } from "react";
import { useConfirm } from "./ConfirmDialog";
import {
  ALCADA_DO_PERFIL,
  DESCRICAO_DO_PERFIL,
  MATRIZ_DE_PERMISSOES,
  PAPEIS_ATRIBUIVEIS,
  PAPEIS_SEM_PAINEL,
  PERFIS,
  ROTULO_DO_PAPEL,
  ROTULO_DO_PERFIL,
  ehPapelDePainel,
  ordenarPapeis,
  type PapelAtribuivel,
  type Perfil,
  type Permissao,
} from "../../lib/permissoes";

/**
 * Rótulo de qualquer papel concedível — `ROTULO_DO_PERFIL` só conhece os de
 * painel, e `investidor` precisa de nome na tela como os outros.
 */

/**
 * Tela A17 do design doc — usuários e permissões.
 *
 * Três abas, como o doc desenha: Permissões (os quatro perfis e a matriz),
 * Pessoas (a tabela real de `profiles`, com convite e edição) e Registro
 * (a trilha de `auditoria_admin`). A matriz vem de `lib/permissoes.ts` — é
 * especificação transcrita do doc, e os pontos de alçada fina passam a
 * consultá-la conforme as telas que dependem dela (editor de veículo,
 * publicação) forem entrando.
 */

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  /** Papel primário — espelho de `papeis[1]`, mantido pelo banco. */
  role: string;
  /** Todos os papéis (2026-08-19). Pode vir ausente de resposta antiga. */
  papeis?: string[] | null;
  /** WhatsApp da equipe, em E.164. É por aqui que a rotina noturna avisa. */
  telefone_e164?: string | null;
  is_active: boolean;
  created_at: string;
}

/**
 * A alçada de quem tem vários papéis.
 *
 * "Sem limite" (Admin) domina qualquer limite específico, então quem é admin
 * mostra isso e pronto. Fora daí não existe ordem entre "5% no preço" e
 * "Agendamento vai ao Gestor" — são grandezas diferentes —, então as duas
 * aparecem em vez de eu inventar qual vence. Perfil sem alçada declarada
 * ("—") não entra.
 *
 * ⚠️ Alçada é ESPECIFICAÇÃO da A17, não regra aplicada: nada no código a
 * consulta hoje. Ela informa quem lê a tela; não bloqueia nada.
 */
const alcadaDe = (u: { role: string; papeis?: string[] | null }): string => {
  const papeis = papeisDe(u).filter((x): x is Perfil => (PERFIS as readonly string[]).includes(x));
  if (papeis.includes("admin")) return ALCADA_DO_PERFIL.admin;
  const limites = papeis.map((x) => ALCADA_DO_PERFIL[x]).filter((a) => a && a !== "—");
  return limites.length > 0 ? Array.from(new Set(limites)).join(" · ") : "—";
};

/** Os papéis de alguém, tolerando resposta que ainda não traz o array. */
const papeisDe = (u: { role: string; papeis?: string[] | null }): string[] =>
  u.papeis && u.papeis.length > 0 ? u.papeis : [u.role];

interface RegistroAuditoria {
  id: string;
  acao: string;
  detalhe: string | null;
  autor_nome: string | null;
  registrado_em: string;
}

const ROTULO_ACAO: Record<string, string> = {
  paleta_alterada: "Paleta do site alterada",
  usuario_criado: "Usuário criado",
  perfil_alterado: "Perfil alterado",
  usuario_excluido: "Usuário excluído",
  texto_legal_alterado: "Texto legal alterado",
};

const CELULA_DA_MATRIZ: Record<Permissao, { texto: string; caixa: string; cor: string }> = {
  faz: { texto: "FAZ", caixa: "bg-mt-ink border-mt-ink", cor: "text-mt-ink" },
  revisao: { texto: "REVISÃO", caixa: "bg-mt-accent border-mt-accent", cor: "text-mt-accent-800" },
  nao_ve: { texto: "NÃO VÊ", caixa: "bg-transparent border-mt-neutral-400", cor: "text-mt-neutral-600" },
};

const dataCurta = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

type Aba = "permissoes" | "pessoas" | "registro";

export default function UserManagement() {
  const { confirm } = useConfirm();
  const [aba, setAba] = useState<Aba>("permissoes");
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [registroCarregado, setRegistroCarregado] = useState(false);

  // Create User Form State
  const [isCreating, setIsCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<PapelAtribuivel>("comercial");
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

  // O registro só é buscado quando a aba abre — e uma vez.
  useEffect(() => {
    if (aba !== "registro" || registroCarregado) return;
    (async () => {
      try {
        const res = await fetch("/api/auditoria");
        const data = await res.json();
        if (res.ok) {
          setRegistros(data.registros || []);
          setRegistroCarregado(true);
        } else {
          setError(data.error || "Falha ao carregar o registro.");
        }
      } catch {
        setError("Erro ao conectar com o servidor.");
      }
    })();
  }, [aba, registroCarregado]);

  const contagemPorPerfil = useMemo(() => {
    const c = Object.fromEntries(PERFIS.map((p) => [p, 0])) as Record<Perfil, number>;
    for (const u of users) {
      for (const papel of papeisDe(u)) {
        if (papel in c) c[papel as Perfil] += 1;
      }
    }
    return c;
  }, [users]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, full_name: fullName, role }),
      });
      const data = await res.json();

      if (res.ok) {
        setSuccessMsg(`Convite enviado para ${email} — a senha é escolhida por quem recebe.`);
        setIsCreating(false);
        setEmail("");
        setFullName("");
        setRole("comercial");
        setRegistroCarregado(false);
      } else {
        setError(data.error || "Falha ao convidar usuário.");
      }
    } catch (err) {
      setError("Erro ao convidar usuário.");
    } finally {
      // Fora do ramo de sucesso de propósito: o convite pode sair e o papel
      // falhar depois (a rota devolve isso como erro). Nesse caso o convidado
      // JÁ existe, e precisa aparecer na lista para o papel ser corrigido.
      fetchUsers();
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
          papeis: papeisDe(editingUser),
          telefone_e164: (editingUser.telefone_e164 ?? "").trim() || null,
          is_active: editingUser.is_active,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setSuccessMsg("Usuário atualizado com sucesso!");
        setEditingUser(null);
        setRegistroCarregado(false);
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
        setRegistroCarregado(false);
        fetchUsers();
      } else {
        setError(data.error || "Falha ao excluir usuário.");
      }
    } catch (err) {
      setError("Erro ao conectar com o servidor.");
    }
  };

  /**
   * Etiquetas na linguagem de tag do doc: acento para Admin, contorno para o
   * resto — e papel FORA do painel (cliente, ou algo que o vocabulário não
   * conhece) aparece como é: tracejado, sem cor de equipe.
   *
   * Até 2026-08-22 tudo passava por `normalizarPerfil` antes de virar badge,
   * e `normalizarPerfil` devolve "comercial" para qualquer papel desconhecido.
   * Resultado real: um convidado que nasceu `cliente` (convite feito fora da
   * A17, papel que o trigger não reconheceu) aparecia na lista como
   * "COMERCIAL" — a tela mentia exatamente para quem precisa corrigir o papel.
   */
  const ehPapelDePainel = (r: string) => (PERFIS as readonly string[]).includes(r);
  const rotuloDoPapel = (r: string) => ROTULO_DO_PAPEL[r] ?? r;
  const getRoleBadgeClass = (r: string) => {
    if (!ehPapelDePainel(r)) return "border border-dashed border-mt-regua text-mt-neutral-600";
    switch (r as Perfil) {
      case "admin": return "bg-mt-accent-100 border border-mt-accent-300 text-mt-accent-800";
      case "financeiro": return "border border-mt-regua text-mt-neutral-800";
      case "marketing": return "border border-mt-regua text-mt-neutral-800";
      default: return "border border-mt-regua-fina text-mt-neutral-700";
    }
  };

  const rotuloCampo = "text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700 pl-1";
  const campoCaixa =
    "bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent";

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      {/* Cabeçalho na anatomia A17 */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-regua pb-5">
        <div className="flex flex-col gap-1.5">
          <div className="mt-rotulo mt-rotulo-accent">Sistema</div>
          <h1 className="mt-titulo text-3xl md:text-4xl">Usuários e permissões</h1>
          <p className="mt-1 max-w-[640px] text-sm text-mt-neutral-800">
            Quatro perfis, uma regra por linha. Preço, texto legal e paleta são os pontos onde
            um erro custa caro — cada um tem dono explícito, e o que for negado some da
            interface, não fica cinza.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="mt-seg">
            {(
              [
                ["permissoes", "Permissões"],
                ["pessoas", "Pessoas"],
                ["registro", "Registro"],
              ] as const
            ).map(([valor, rotulo]) => (
              <label key={valor} className="mt-seg-opt">
                <input type="radio" name="aba-usuarios" checked={aba === valor} onChange={() => setAba(valor)} />
                <span>{rotulo}</span>
              </label>
            ))}
          </div>
          <button
            onClick={() => {
              setAba("pessoas");
              setIsCreating(true);
              setEditingUser(null);
              setError("");
              setSuccessMsg("");
            }}
            className="mt-btn mt-btn-primario mt-foco cursor-pointer px-4 py-2.5 text-[11px]"
          >
            Convidar usuário
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="flex items-center gap-2 border-l-[3px] border-mt-ink bg-mt-surface px-4 py-3 text-xs text-mt-accent-800">
          {successMsg}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800">
          {error}
        </div>
      )}

      {aba === "permissoes" && (
        <>
          {/* Os quatro perfis */}
          <div className="grid grid-cols-1 gap-6 border-t-2 border-mt-regua pt-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {PERFIS.map((p) => (
              <div key={p} className="xl:border-r xl:border-mt-regua-fina xl:pr-5 xl:last:border-r-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[15px] font-extrabold tracking-[-.01em]">{ROTULO_DO_PERFIL[p]}</span>
                  <span className="ml-auto text-[11px] text-mt-neutral-700">
                    {contagemPorPerfil[p]} pessoa(s)
                  </span>
                </div>
                <div className={`mt-2.5 h-[3px] ${p === "admin" ? "bg-mt-accent" : "bg-mt-ink"}`} />
                <p className="mt-2.5 text-xs leading-relaxed text-mt-neutral-800">
                  {DESCRICAO_DO_PERFIL[p].descricao}
                </p>
                <div className="mt-2 text-[11px] font-semibold text-mt-accent-800">
                  {DESCRICAO_DO_PERFIL[p].chave}
                </div>
              </div>
            ))}
          </div>

          {/* Matriz */}
          <div>
            <div className="mb-3 flex flex-wrap items-baseline gap-3">
              <div className="mt-rotulo">Matriz de permissões</div>
              <div className="ml-auto flex gap-4 text-[11px] text-mt-neutral-700">
                <span className="flex items-center gap-1.5"><span className="h-[11px] w-[11px] bg-mt-ink" />Faz</span>
                <span className="flex items-center gap-1.5"><span className="h-[11px] w-[11px] bg-mt-accent" />Faz, mas passa por revisão</span>
                <span className="flex items-center gap-1.5"><span className="h-[11px] w-[11px] border border-mt-neutral-400" />Não vê</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="mt-tabela">
                <thead>
                  <tr>
                    <th>O que pode ser feito</th>
                    {PERFIS.map((p) => (
                      <th key={p} className="w-[110px]">{ROTULO_DO_PERFIL[p]}</th>
                    ))}
                    <th>Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {MATRIZ_DE_PERMISSOES.map((l) => (
                    <tr key={l.acao}>
                      <td className="font-extrabold">{l.acao}</td>
                      {PERFIS.map((p) => {
                        const cel = CELULA_DA_MATRIZ[l.permissoes[p]];
                        return (
                          <td key={p}>
                            <span className={`inline-flex items-center gap-2 text-[11px] font-semibold tracking-[.06em] ${cel.cor}`}>
                              <span className={`h-3 w-3 flex-none border ${cel.caixa}`} />
                              {cel.texto}
                            </span>
                          </td>
                        );
                      })}
                      <td className="text-mt-neutral-700">{l.observacao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quem NÃO está na matriz — e por quê */}
          <div className="max-w-[720px] border-l-[3px] border-mt-regua bg-mt-surface px-4 py-3.5">
            <div className="text-sm font-extrabold tracking-[-.01em]">
              Fora do painel: Cliente e Investidor
            </div>
            <p className="mt-1 text-xs leading-relaxed text-mt-neutral-800">
              Os dois têm área própria — <strong>/garagem</strong> e{" "}
              <strong>/investidor</strong> — e não aparecem nesta matriz porque não
              executam nenhuma ação do painel. O investidor enxerga só os carros em que
              entrou na compra e a própria posição (aporte, retiradas e saldo); quem lança
              esses valores é o Financeiro.
            </p>
            <div className="mt-2 text-[10px] font-extrabold tracking-[.12em] text-mt-accent-800">
              SEM ACESSO AO PAINEL · ENXERGAM SÓ O PRÓPRIO
            </div>
          </div>

          {/* As três travas */}
          <div className="max-w-[720px]">
            <div className="mt-rotulo mt-rotulo-accent mb-3">Três travas que não caem</div>
            {[
              {
                t: "Preço",
                d: "Comercial mexe até 5%; acima disso a mudança para na fila de revisão até Admin ou Financeiro liberar.",
                quem: "COMERCIAL COM ALÇADA · ADMIN SEM LIMITE",
              },
              {
                t: "Texto legal",
                d: "CET, condições de financiamento e avisos obrigatórios vivem no módulo financeiro — ninguém reescreve sem querer.",
                quem: "SOMENTE FINANCEIRO E ADMIN",
              },
              {
                t: "Paleta e identidade",
                d: "Cores, logo e tipografia mudam o site inteiro. Fica fora da visão de Marketing para evitar ajuste de campanha virando rebranding.",
                quem: "SOMENTE ADMIN",
              },
            ].map((trava) => (
              <div key={trava.t} className="mb-3 border-l-[3px] border-mt-accent bg-mt-surface px-4 py-3.5">
                <div className="text-sm font-extrabold tracking-[-.01em]">{trava.t}</div>
                <p className="mt-1 text-xs leading-relaxed text-mt-neutral-800">{trava.d}</p>
                <div className="mt-2 text-[10px] font-extrabold tracking-[.12em] text-mt-accent-800">{trava.quem}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {aba === "pessoas" && (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          {/* Users Table / List */}
          <div className="border border-mt-regua-fina bg-mt-surface p-6 lg:col-span-2">
            {isLoading ? (
              <div className="py-12 text-center text-xs text-mt-neutral-700">Carregando usuários...</div>
            ) : users.length === 0 ? (
              <div className="py-12 text-center text-xs text-mt-neutral-700">Nenhum usuário cadastrado.</div>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="mt-tabela">
                  <thead>
                    <tr>
                      <th>Pessoa</th>
                      <th>Perfis</th>
                      {/* Alçada é referência de combinado, não trava: nada no
                          código a consulta. Quem lê a tabela precisa saber
                          disso, senão confia num limite que não existe. */}
                      <th title="Quanto a pessoa decide sozinha, pelo combinado da loja. É referência — o sistema não bloqueia por este valor.">
                        Alçada combinada
                      </th>
                      <th>Status</th>
                      <th className="text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div className="font-extrabold tracking-[-.01em] text-mt-ink">{u.full_name}</div>
                          <div className="mt-0.5 text-[11px] text-mt-neutral-700">{u.email}</div>
                        </td>
                        <td>
                          {/* Todos os papéis, não só o primário: mostrar um só
                              faria a lista mentir sobre o que a pessoa acessa. */}
                          <div className="flex flex-wrap gap-1">
                            {papeisDe(u).map((papel) => (
                              <span
                                key={papel}
                                title={
                                  ehPapelDePainel(papel)
                                    ? undefined
                                    : "Papel sem acesso ao painel — edite a pessoa para atribuir um perfil da equipe."
                                }
                                className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${getRoleBadgeClass(papel)}`}
                              >
                                {rotuloDoPapel(papel)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="mt-num text-mt-neutral-700">{alcadaDe(u)}</td>
                        <td>
                          <span className={`mr-1.5 inline-block h-2 w-2 ${u.is_active ? "bg-mt-ink" : "bg-mt-neutral-500"}`} />
                          <span className="text-mt-neutral-700">{u.is_active ? "Ativo" : "Inativo"}</span>
                        </td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setEditingUser({ ...u });
                                setIsCreating(false);
                                setError("");
                                setSuccessMsg("");
                              }}
                              className="mt-foco cursor-pointer p-1.5 text-mt-neutral-700 hover:bg-mt-surface hover:text-mt-accent"
                              title="Editar usuário"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.287.287-.63.502-1.01.633l-3.156 1.262a.75.75 0 0 1-.98-.98Z" />
                                <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              className="mt-foco cursor-pointer p-1.5 text-mt-neutral-700 hover:bg-mt-accent-100 hover:text-mt-accent"
                              title="Excluir usuário"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
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
              <div className="flex flex-col gap-4 border border-mt-regua-fina bg-mt-surface p-6">
                <h3 className="text-[15px] font-extrabold tracking-[-.01em] text-mt-ink select-none">Convidar usuário</h3>
                {/* Sem campo de senha desde 2026-08-21: o convite chega por
                    e-mail e a senha é escolhida por quem vai usá-la, em
                    /definir-senha. Quem cuida do painel não conhece senha de
                    ninguém — antes conhecia a de todo mundo. */}
                <p className="m-0 text-[11px] leading-relaxed text-mt-neutral-700">
                  A pessoa recebe um convite por e-mail e escolhe a própria senha.
                </p>
                <form onSubmit={handleCreateUser} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className={rotuloCampo}>Nome Completo</label>
                    <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="João da Silva" className={campoCaixa} />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className={rotuloCampo}>E-mail</label>
                    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="joao@motors.com.br" className={campoCaixa} />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className={rotuloCampo}>Perfil</label>
                    {/* Dois grupos porque são duas naturezas: papel de painel
                        opera a loja; os de área própria são authenticated e
                        NUNCA entram no /admin. Sem o segundo grupo aqui o
                        papel existia no banco e não havia como criar a conta —
                        foi assim que um investidor acabou convidado como
                        "comercial" em 2026-08-22. */}
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as PapelAtribuivel)}
                      className={`${campoCaixa} cursor-pointer`}
                    >
                      <optgroup label="Equipe (entra no painel)">
                        {PERFIS.map((p) => (
                          <option key={p} value={p}>{ROTULO_DO_PERFIL[p]}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Área própria (sem painel)">
                        {PAPEIS_SEM_PAINEL.map((p) => (
                          <option key={p} value={p}>{ROTULO_DO_PAPEL[p]}</option>
                        ))}
                      </optgroup>
                    </select>
                    <span className="pl-1 text-[10px] leading-relaxed text-mt-neutral-700">
                      {ehPapelDePainel(role)
                        ? `Alçada: ${ALCADA_DO_PERFIL[role as Perfil]}`
                        : role === "investidor"
                          ? "Sem painel — enxerga a própria posição em /investidor. O vínculo com o cadastro do investidor se faz sozinho no primeiro acesso, pelo e-mail."
                          : "Sem painel — área do cliente em /garagem."}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <button type="button" onClick={() => setIsCreating(false)} className="mt-foco h-11 flex-1 cursor-pointer border border-mt-regua-fina bg-transparent text-[11px] font-bold uppercase tracking-wider text-mt-neutral-700 hover:bg-mt-surface hover:text-mt-ink">
                      Cancelar
                    </button>
                    <button type="submit" disabled={isSaving} className="mt-foco h-11 flex-1 cursor-pointer bg-mt-accent text-[11px] font-bold uppercase tracking-wider text-mt-inverso hover:bg-mt-accent-hover disabled:opacity-50">
                      {isSaving ? "Enviando..." : "Enviar convite"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {editingUser && (
              <div className="flex flex-col gap-4 border border-mt-regua-fina bg-mt-surface p-6">
                <h3 className="text-[15px] font-extrabold tracking-[-.01em] text-mt-ink select-none">Editar usuário</h3>
                <form onSubmit={handleUpdateUser} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className={rotuloCampo}>Nome Completo</label>
                    <input
                      type="text"
                      required
                      value={editingUser.full_name}
                      onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
                      className={campoCaixa}
                    />
                  </div>

                  {/* Multi-papel (2026-08-19): a mesma pessoa vende e cuida do
                      financeiro. O primeiro marcado é o PRIMÁRIO — é o que
                      aparece na lista quando só cabe um nome, e o que o código
                      que ainda lê `role` enxerga.

                      Dois grupos: papel de painel e papel de área própria
                      (cliente, investidor) não são a mesma espécie. Misturá-los
                      num bloco só foi o que permitiu convidar um investidor
                      como "comercial" — o papel dele não existia em lugar
                      nenhum desta tela.

                      E o primário deixou de ser refém da ordem em que os
                      papéis foram marcados: o seletor só sabia ANEXAR no fim,
                      então quem virou admin primeiro seguia admin primário
                      para sempre. `ordenarPapeis` e o botão "tornar primário"
                      resolvem isso — o pedido foi literal, *"um adm que perdeu
                      a função ou foi para o comercial puro"*. */}
                  <div className="flex flex-col gap-1">
                    <label className={rotuloCampo}>Papéis</label>
                    <div className="flex flex-col gap-3 border border-mt-regua-fina bg-mt-bg p-3">
                      {(
                        [
                          ["Equipe (painel)", PERFIS as readonly string[]],
                          ["Área própria (sem painel)", PAPEIS_SEM_PAINEL as readonly string[]],
                        ] as const
                      ).map(([titulo, papeis]) => (
                        <div key={titulo} className="flex flex-col gap-1.5">
                          <span className="text-[9px] font-semibold uppercase tracking-[.14em] text-mt-neutral-600">
                            {titulo}
                          </span>
                          {papeis.map((p) => {
                            const atuais = papeisDe(editingUser);
                            const marcado = atuais.includes(p);
                            const primario = atuais[0] === p;
                            const trocar = (novos: string[]) =>
                              setEditingUser({ ...editingUser, papeis: novos, role: novos[0] });

                            return (
                              <div key={p} className="flex select-none items-center gap-2">
                                <label className="flex flex-1 cursor-pointer items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={marcado}
                                    onChange={(e) => {
                                      if (!e.target.checked && atuais.length === 1) {
                                        // Recusa EXPLÍCITA, e no cliente. Antes
                                        // o clique não fazia nada e não dizia
                                        // por quê — quem tentava tirar o último
                                        // papel achava que a tela travou.
                                        // Descobrir isso só ao salvar perderia o
                                        // resto do formulário. A régua é "pelo
                                        // menos um", não "pelo menos um de
                                        // painel": investidor puro é gente de
                                        // verdade.
                                        setError(
                                          "Todo usuário precisa de pelo menos um papel. Marque o novo antes de tirar o atual — ou desative a conta, se a pessoa saiu.",
                                        );
                                        return;
                                      }
                                      const novosBrutos = e.target.checked
                                        ? [...atuais, p]
                                        : atuais.filter((x) => x !== p);
                                      // Papel de painel sempre na frente:
                                      // marcar `comercial` em quem já tinha
                                      // `cliente` deixava `cliente` como
                                      // primário — e a pessoa, staff no papel,
                                      // continuava barrada do painel inteiro.
                                      trocar(ordenarPapeis(novosBrutos, primario ? undefined : atuais[0]));
                                    }}
                                    className="h-4 w-4 cursor-pointer border-mt-regua-fina text-mt-accent focus:ring-mt-accent"
                                  />
                                  <span className="text-xs font-semibold text-mt-ink">
                                    {ROTULO_DO_PAPEL[p] ?? p}
                                  </span>
                                </label>

                                {/* O selo era decorativo: dava para ver qual
                                    era o primário e não para escolher. Agora
                                    ele é o botão que promove. Só papel de
                                    painel promove — `role` é lido como "o papel
                                    de equipe" por código que ainda não migrou
                                    para `papeis`. */}
                                {primario ? (
                                  <span className="border border-mt-regua px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                                    primário
                                  </span>
                                ) : (
                                  marcado &&
                                  ehPapelDePainel(p) && (
                                    <button
                                      type="button"
                                      onClick={() => trocar(ordenarPapeis(atuais, p))}
                                      className="mt-foco cursor-pointer border border-dashed border-mt-regua-fina px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[.12em] text-mt-neutral-600 hover:border-mt-accent hover:text-mt-accent"
                                      title="Tornar este o papel primário"
                                    >
                                      tornar primário
                                    </button>
                                  )
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                    <span className="pl-1 text-[10px] leading-relaxed text-mt-neutral-700">
                      Quem tem mais de um papel de painel faz o que qualquer um deles faz.
                      Papel de área própria não dá acesso ao painel. O{" "}
                      <strong>primário</strong> é o que aparece na lista quando só cabe um
                      nome — mudá-lo não tira nem dá acesso.
                    </span>
                    {papeisDe(editingUser).includes("investidor") && (
                      <span className="pl-1 text-[10px] text-mt-neutral-700">
                        Acompanha a própria posição em <strong>/investidor</strong>. Os carros,
                        aportes e retiradas são lançados em Financeiro → Investidores.
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className={rotuloCampo}>WhatsApp</label>
                    <input
                      type="tel"
                      inputMode="tel"
                      placeholder="+5541999998888"
                      value={editingUser.telefone_e164 ?? ""}
                      onChange={(e) =>
                        setEditingUser({ ...editingUser, telefone_e164: e.target.value })
                      }
                      className={campoCaixa}
                    />
                    <span className="pl-1 text-[10px] text-mt-neutral-700">
                      Com DDI, no formato +55… — é por aqui que a rotina noturna avisa sobre
                      registro de venda incompleto. Sem telefone, o vendedor não é avisado.
                    </span>
                  </div>

                  <div className="flex items-center gap-3 py-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700 pl-1">Status da Conta:</span>
                    <label className="flex cursor-pointer select-none items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={editingUser.is_active}
                        onChange={(e) => setEditingUser({ ...editingUser, is_active: e.target.checked })}
                        className="h-4 w-4 cursor-pointer border-mt-regua-fina text-mt-accent focus:ring-mt-accent"
                      />
                      <span className="text-xs font-semibold text-mt-ink">Conta Ativa</span>
                    </label>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <button type="button" onClick={() => setEditingUser(null)} className="mt-foco h-11 flex-1 cursor-pointer border border-mt-regua-fina bg-transparent text-[11px] font-bold uppercase tracking-wider text-mt-neutral-700 hover:bg-mt-surface hover:text-mt-ink">
                      Cancelar
                    </button>
                    <button type="submit" disabled={isSaving} className="mt-foco h-11 flex-1 cursor-pointer bg-mt-accent text-[11px] font-bold uppercase tracking-wider text-mt-inverso hover:bg-mt-accent-hover disabled:opacity-50">
                      {isSaving ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {!isCreating && !editingUser && (
              <div className="select-none border border-dashed border-mt-regua-fina bg-mt-surface p-8 text-center text-xs text-mt-neutral-600">
                Selecione um usuário para editar ou clique em "Convidar usuário" para começar.
              </div>
            )}
          </div>
        </div>
      )}

      {aba === "registro" && (
        <div className="max-w-[720px]">
          <div className="mb-3 flex items-baseline gap-3">
            <div className="mt-rotulo">Últimas ações sensíveis</div>
            <span className="ml-auto text-[11px] text-mt-neutral-700">
              Registro permanente — não dá para apagar nem editar depois
            </span>
          </div>
          {!registroCarregado ? (
            <div className="py-10 text-center text-xs text-mt-neutral-700">Carregando registro…</div>
          ) : registros.length === 0 ? (
            <div className="border border-dashed border-mt-regua-fina bg-mt-surface p-8 text-center text-xs text-mt-neutral-600">
              Nenhuma ação sensível registrada ainda. Trocas de paleta, convites e mudanças de
              perfil passam a aparecer aqui.
            </div>
          ) : (
            registros.map((r) => (
              <div key={r.id} className="flex gap-3 border-b border-mt-regua-fina py-2.5 text-[13px]">
                <span className="min-w-0 flex-1 leading-snug">
                  <span className="font-semibold">{ROTULO_ACAO[r.acao] ?? r.acao}</span>
                  {r.detalhe && <span className="text-mt-neutral-800"> — {r.detalhe}</span>}
                  {r.autor_nome && <span className="text-mt-neutral-700"> · {r.autor_nome}</span>}
                </span>
                <span className="flex-none text-[11px] text-mt-neutral-700 tabular-nums">{dataCurta(r.registrado_em)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
