"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "../admin/ConfirmDialog";
import { dataDeHoje } from "../../lib/financeiroDia";
import { ACESSO_DO_INVESTIDOR, estadoDeAcessoDoInvestidor } from "../../lib/investidores";
import type { ResumoDeInvestidor, SaldoDoInvestidor } from "../../lib/investidores";

/**
 * Painel de investidores — aportes, retiradas e o saldo de cada um.
 *
 * Briefing 2026-08-21, adm/financeira: "controlar melhor o que eles investem
 * e o que fazem retirada... independente se a retirada é um carro de
 * repasse... hoje esse controle está um pouco bagunçado". E o dono: "um
 * painel que mostrasse isso pra eles também".
 *
 * O saldo de cada card é DERIVADO do extrato pela lib (`resumoDeInvestidores`)
 * — nunca gravado, então nunca dessincroniza. A retirada em carro entra com
 * a forma "veiculo" e exige escolher qual carro: sem o código, o repasse não
 * amarra na margem do veículo (tela A11) e a bagunça volta.
 */

interface Movimentacao {
  id: string;
  investidor_id: string;
  tipo: "aporte" | "retirada";
  valor: number | string;
  data: string;
  descricao: string;
  forma_pagamento?: string | null;
  veiculo_id?: string | null;
  observacoes?: string | null;
  investidor?: { nome: string } | null;
}

interface VeiculoOpcao {
  id: string;
  marca: string;
  modelo: string;
  ano: string | number;
  versao?: string;
}

const formatPrice = (value: number | string) => {
  const n = typeof value === "number" ? value : parseFloat(value);
  return (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

const formatDate = (dateStr: string) => {
  const parts = dateStr.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
};

const ROTULO_DA_FORMA: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_credito: "Cartão de Crédito",
  cartao_debito: "Cartão de Débito",
  boleto: "Boleto",
  transferencia: "Ted / Doc",
  cheque: "Cheque",
  financiamento: "Financiamento",
  veiculo: "Veículo (repasse)",
};

/**
 * `podeExcluir`: extrato de investidor é registro de capital de sócio — só o
 * Admin apaga (A17, "Excluir lançamento financeiro", 2026-08-21). Aqui não há
 * "cancelar": lançamento errado é corrigido pelo Admin, e é de propósito que
 * um extrato de sócio não tenha desfazer de rotina.
 */
export default function InvestidoresPainel({ podeExcluir = false }: { podeExcluir?: boolean }) {
  const { confirm } = useConfirm();
  const [investidores, setInvestidores] = useState<ResumoDeInvestidor[]>([]);
  const [consolidado, setConsolidado] = useState<SaldoDoInvestidor | null>(null);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [veiculos, setVeiculos] = useState<VeiculoOpcao[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Filtro do extrato: clicar num card foca a pessoa.
  const [filtroInvestidor, setFiltroInvestidor] = useState("");

  // Painel da direita: cadastro OU lançamento — um por vez, como no ContasList.
  const [painel, setPainel] = useState<"nenhum" | "investidor" | "movimentacao">("nenhum");

  // Quantos ativos ainda não entraram. Inativo não conta: acesso pendente de
  // quem saiu não é pendência (mesma razão pela qual o selo some no card).
  const pendentesDeAcesso = investidores.filter(
    (i) => i.ativo !== false && estadoDeAcessoDoInvestidor(i) !== "com_acesso",
  ).length;

  // Form de investidor
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [telefone, setTelefone] = useState("");
  const [emailInv, setEmailInv] = useState("");
  const [ativo, setAtivo] = useState(true);

  // Form de movimentação
  const [movInvestidorId, setMovInvestidorId] = useState("");
  const [movTipo, setMovTipo] = useState<"aporte" | "retirada">("aporte");
  const [movValor, setMovValor] = useState("");
  const [movData, setMovData] = useState(() => dataDeHoje());
  const [movDescricao, setMovDescricao] = useState("");
  const [movForma, setMovForma] = useState("pix");
  const [movVeiculoId, setMovVeiculoId] = useState("");
  const [movObs, setMovObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  const fetchDados = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/investidores");
      const body = await res.json();
      if (res.ok) {
        setInvestidores(body.investidores || []);
        setConsolidado(body.consolidado || null);
        setMovimentacoes(body.movimentacoes || []);
      } else {
        setError(body.error || "Falha ao carregar investidores.");
      }
    } catch {
      setError("Erro ao se conectar com o servidor.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDados();
    // Veículos para o repasse — opcional, como no ContaForm.
    (async () => {
      try {
        const res = await fetch("/api/estoque", { cache: "no-store" });
        if (res.ok) {
          const body = await res.json();
          setVeiculos(body.veiculos || []);
        }
      } catch {
        // Sem estoque, o select de veículo fica vazio — o lançamento em
        // dinheiro segue funcionando.
      }
    })();
  }, [fetchDados]);

  const abrirCadastro = (inv?: ResumoDeInvestidor) => {
    setPainel("investidor");
    setEditandoId(inv?.id ?? null);
    setNome(inv?.nome ?? "");
    setDocumento((inv?.documento as string) ?? "");
    setTelefone((inv?.telefone as string) ?? "");
    setEmailInv((inv?.email as string) ?? "");
    setAtivo(inv?.ativo !== false);
    setError("");
    setSuccessMsg("");
  };

  const abrirLancamento = (investidorId?: string) => {
    setPainel("movimentacao");
    setMovInvestidorId(investidorId ?? "");
    setMovTipo("aporte");
    setMovValor("");
    setMovData(dataDeHoje());
    setMovDescricao("");
    setMovForma("pix");
    setMovVeiculoId("");
    setMovObs("");
    setError("");
    setSuccessMsg("");
  };

  const handleInvestidorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setError("");
    try {
      const url = editandoId
        ? `/api/investidores/${editandoId}`
        : "/api/investidores";
      const res = await fetch(url, {
        method: editandoId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, documento, telefone, email: emailInv, ativo }),
      });
      const body = await res.json();
      if (res.ok) {
        setSuccessMsg(editandoId ? "Investidor atualizado." : "Investidor cadastrado.");
        setPainel("nenhum");
        fetchDados();
      } else {
        setError(body.error || "Falha ao salvar investidor.");
      }
    } catch {
      setError("Erro ao se conectar com o servidor.");
    } finally {
      setSalvando(false);
    }
  };

  const handleMovimentacaoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setError("");
    try {
      const res = await fetch("/api/investidores/movimentacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investidor_id: movInvestidorId,
          tipo: movTipo,
          valor: parseFloat(movValor),
          data: movData,
          descricao: movDescricao,
          forma_pagamento: movForma || null,
          veiculo_id: movForma === "veiculo" ? movVeiculoId : null,
          observacoes: movObs || null,
        }),
      });
      const body = await res.json();
      if (res.ok) {
        setSuccessMsg(movTipo === "aporte" ? "Aporte registrado." : "Retirada registrada.");
        setPainel("nenhum");
        fetchDados();
      } else {
        setError(body.error || "Falha ao registrar movimentação.");
      }
    } catch {
      setError("Erro ao se conectar com o servidor.");
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluirMovimentacao = async (m: Movimentacao) => {
    const ok = await confirm({
      title: "Excluir Movimentação",
      message: `Excluir ${m.tipo} de ${formatPrice(m.valor)} (${m.descricao})? O saldo do investidor é recalculado na hora.`,
      type: "danger",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/investidores/movimentacoes/${m.id}`, {
        method: "DELETE",
      });
      const body = await res.json();
      if (res.ok) {
        setSuccessMsg("Movimentação excluída — saldo recalculado.");
        fetchDados();
      } else {
        setError(body.error || "Falha ao excluir movimentação.");
      }
    } catch {
      setError("Erro de rede.");
    }
  };

  const extrato = filtroInvestidor
    ? movimentacoes.filter((m) => m.investidor_id === filtroInvestidor)
    : movimentacoes;

  const nomeDoVeiculo = (id?: string | null) => {
    if (!id) return null;
    const v = veiculos.find((v) => String(v.id) === String(id));
    return v ? `${v.marca} ${v.modelo} (${v.ano})` : `Cód. ${id}`;
  };

  const painelAberto = painel !== "nenhum";

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl">
      {/* Ações */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 select-none">
        <span className="text-[11px] text-mt-neutral-700 max-w-[480px]">
          Aportes e retiradas por investidor, com o saldo derivado do extrato —
          retirada em carro de repasse entra vinculada ao veículo.
        </span>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => abrirCadastro()}
            className="h-10 flex-1 sm:flex-none bg-mt-surface hover:bg-mt-accent-100 text-mt-ink border border-mt-regua-fina text-[11px] font-bold uppercase tracking-wider px-4 cursor-pointer"
          >
            Novo Investidor
          </button>
          <button
            onClick={() => abrirLancamento()}
            className="h-10 flex-1 sm:flex-none bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-[11px] font-bold uppercase tracking-wider px-4 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            Lançar Movimentação
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="bg-mt-surface border border-mt-regua-fina text-mt-accent-800 text-xs px-4 py-3 select-none">
          {successMsg}
        </div>
      )}
      {error && (
        <div className="bg-mt-accent-100 border border-mt-accent-300 text-mt-accent text-xs px-4 py-3 select-none">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="py-16 text-center text-xs text-mt-neutral-700">Carregando investidores...</div>
      ) : (
        <>
          {/* Consolidado — a régua de KPIs da anatomia A10. */}
          {consolidado && (
            <div className="grid select-none grid-cols-1 border-t-2 border-mt-regua sm:grid-cols-2 lg:grid-cols-4">
              {[
                { rotulo: "Capital aportado", valor: formatPrice(consolidado.aportado), cor: "text-mt-accent-800" },
                { rotulo: "Total retirado", valor: formatPrice(consolidado.retirado), cor: "text-mt-accent" },
                {
                  rotulo: "Saldo na operação",
                  valor: formatPrice(consolidado.saldo),
                  cor: consolidado.saldo >= 0 ? "text-mt-ink" : "text-mt-accent",
                },
                {
                  rotulo: "Investidores ativos",
                  valor: String(investidores.filter((i) => i.ativo !== false).length),
                  cor: "text-mt-ink",
                },
              ].map((kpi) => (
                <div
                  key={kpi.rotulo}
                  className="flex flex-col gap-2 border-b border-mt-regua-fina py-4 pr-5 lg:border-b-0 lg:border-r lg:pl-5 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0"
                >
                  <span className="mt-rotulo">{kpi.rotulo}</span>
                  <span className={`text-2xl font-extrabold tracking-[-.03em] tabular-nums ${kpi.cor}`}>
                    {kpi.valor}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className={`lg:col-span-2 flex flex-col gap-6 ${painelAberto ? "hidden lg:flex" : "flex"}`}>
              {/* Um card por investidor. Clicar filtra o extrato. */}
              {investidores.length === 0 ? (
                <div className="bg-mt-surface border border-dashed border-mt-regua-fina p-10 text-center text-xs text-mt-neutral-600 select-none">
                  Nenhum investidor cadastrado ainda. Comece por “Novo Investidor”.
                </div>
              ) : (
                <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {investidores.map((inv) => {
                    const selecionado = filtroInvestidor === inv.id;
                    // O dono pediu "um painel que mostrasse isso pra eles
                    // também" — mas o vínculo se faz sozinho, longe desta
                    // tela, e até aqui ninguém sabia se tinha funcionado.
                    const acesso = estadoDeAcessoDoInvestidor(inv);
                    const textoDoAcesso = ACESSO_DO_INVESTIDOR[acesso];
                    return (
                      <button
                        key={inv.id}
                        onClick={() => setFiltroInvestidor(selecionado ? "" : inv.id)}
                        className={`text-left bg-mt-surface border p-5 flex flex-col gap-3 cursor-pointer transition-colors ${
                          selecionado ? "border-mt-accent" : "border-mt-regua-fina hover:border-mt-regua"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[15px] font-extrabold tracking-[-.01em] text-mt-ink">
                              {inv.nome}
                            </span>
                            <span className="text-[10px] text-mt-neutral-600">
                              {inv.movimentacoes} movimentaç{inv.movimentacoes === 1 ? "ão" : "ões"}
                              {inv.ativo === false && " · inativo"}
                            </span>
                            {/* `sem_email` é o único vermelho: não é espera,
                                é impossibilidade — e a única que a própria
                                pessoa desta tela pode resolver, editando o
                                cadastro. Em investidor inativo o selo some:
                                acesso pendente de quem saiu não é pendência,
                                e um alerta que ninguém vai resolver ensina a
                                ignorar os outros. */}
                            {inv.ativo !== false && (
                            <span
                              title={textoDoAcesso.explicacao}
                              className={`mt-1 inline-flex items-center gap-1 self-start text-[9px] font-bold uppercase tracking-wider ${
                                acesso === "com_acesso"
                                  ? "text-mt-accent-800"
                                  : acesso === "sem_email"
                                    ? "text-mt-accent"
                                    : "text-mt-neutral-600"
                              }`}
                            >
                              <span
                                aria-hidden
                                className={`w-1.5 h-1.5 rounded-full ${
                                  acesso === "com_acesso"
                                    ? "bg-mt-accent-800"
                                    : acesso === "sem_email"
                                      ? "bg-mt-accent"
                                      : "bg-mt-neutral-400"
                                }`}
                              />
                              {textoDoAcesso.rotulo}
                            </span>
                            )}
                          </div>
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              abrirCadastro(inv);
                            }}
                            className="p-1.5 text-mt-neutral-600 hover:text-mt-accent"
                            title="Editar cadastro"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                              <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.287.287-.63.502-1.01.633l-3.156 1.262a.75.75 0 0 1-.98-.98Z" />
                            </svg>
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 border-t border-mt-regua-fina pt-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-mt-neutral-600">Aportou</span>
                            <span className="text-xs font-extrabold tabular-nums text-mt-accent-800">
                              {formatPrice(inv.aportado)}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-mt-neutral-600">Retirou</span>
                            <span className="text-xs font-extrabold tabular-nums text-mt-accent">
                              {formatPrice(inv.retirado)}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-mt-neutral-600">Saldo</span>
                            <span className="text-xs font-extrabold tabular-nums text-mt-ink">
                              {formatPrice(inv.saldo)}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {/* O caminho escrito, e só quando há quem percorrer.
                    O selo do card tem a explicação no `title`, que no celular
                    não existe — e é no celular que a adm/financeira usa isto.
                    Some sozinho quando todo mundo já entrou. */}
                {pendentesDeAcesso > 0 && (
                  <p className="text-[10px] leading-relaxed text-mt-neutral-600 -mt-2">
                    {pendentesDeAcesso === 1
                      ? "1 investidor ativo ainda não acessa o painel dele."
                      : `${pendentesDeAcesso} investidores ativos ainda não acessam o painel deles.`}{" "}
                    O acesso se abre em <strong className="font-bold text-mt-neutral-700">Usuários</strong>:
                    o Admin cria a conta com o papel <strong className="font-bold text-mt-neutral-700">investidor</strong>{" "}
                    usando o mesmo e-mail do cadastro daqui — o vínculo se faz sozinho no primeiro
                    acesso, depois que ele confirmar o e-mail. Cadastro sem e-mail não vincula:
                    preencha o campo antes de pedir a conta.
                  </p>
                )}
                </>
              )}

              {/* Extrato */}
              <div className="bg-mt-surface border border-mt-regua-fina p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-mt-regua-fina pb-3 select-none">
                  <h3 className="text-[15px] font-extrabold tracking-[-.01em] text-mt-ink">
                    Extrato
                    {filtroInvestidor && (
                      <span className="font-normal text-mt-neutral-700 text-xs">
                        {" "}· {investidores.find((i) => i.id === filtroInvestidor)?.nome}
                      </span>
                    )}
                  </h3>
                  {filtroInvestidor && (
                    <button
                      onClick={() => setFiltroInvestidor("")}
                      className="text-[10px] font-bold uppercase tracking-wider text-mt-neutral-600 hover:text-mt-ink cursor-pointer"
                    >
                      Ver todos
                    </button>
                  )}
                </div>
                {extrato.length === 0 ? (
                  <div className="py-6 text-center text-xs text-mt-neutral-600">
                    Nenhuma movimentação registrada.
                  </div>
                ) : (
                  <div className="overflow-x-auto w-full">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-mt-regua-fina text-mt-neutral-600 font-bold uppercase tracking-wider">
                          <th className="pb-3 pl-1">Data</th>
                          <th className="pb-3">Investidor</th>
                          <th className="pb-3">Movimentação</th>
                          <th className="pb-3 text-right">Valor</th>
                          <th className="pb-3 pr-1 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-mt-regua-fina">
                        {extrato.map((m) => (
                          <tr key={m.id}>
                            <td className="py-3 pl-1 text-mt-neutral-700 whitespace-nowrap">{formatDate(m.data)}</td>
                            <td className="py-3 font-bold text-mt-ink">
                              {m.investidor?.nome ||
                                investidores.find((i) => i.id === m.investidor_id)?.nome ||
                                "—"}
                            </td>
                            <td className="py-3">
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                                      m.tipo === "aporte"
                                        ? "bg-mt-surface border border-mt-regua-fina text-mt-accent-800"
                                        : "bg-mt-accent-100 border border-mt-accent-300 text-mt-accent"
                                    }`}
                                  >
                                    {m.tipo}
                                  </span>
                                  <span className="text-mt-neutral-700">{m.descricao}</span>
                                </div>
                                <span className="text-[10px] text-mt-neutral-600">
                                  {m.forma_pagamento ? ROTULO_DA_FORMA[m.forma_pagamento] ?? m.forma_pagamento : ""}
                                  {m.veiculo_id && ` · ${nomeDoVeiculo(m.veiculo_id)}`}
                                </span>
                              </div>
                            </td>
                            <td
                              className={`py-3 text-right font-extrabold tabular-nums whitespace-nowrap ${
                                m.tipo === "aporte" ? "text-mt-accent-800" : "text-mt-accent"
                              }`}
                            >
                              {m.tipo === "aporte" ? "+" : "−"} {formatPrice(m.valor)}
                            </td>
                            <td className="py-3 pr-1 text-right">
                              {podeExcluir && (
                              <button
                                onClick={() => handleExcluirMovimentacao(m)}
                                className="p-1.5 text-mt-neutral-600 hover:text-mt-accent hover:bg-mt-accent-100 transition-all cursor-pointer"
                                title="Excluir (o saldo é recalculado)"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75V4H3.75a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5H14v-.25A2.75 2.75 0 0 0 11.25 1h-2.5ZM8 3.75A1.25 1.25 0 0 1 9.25 2.5h2.5A1.25 1.25 0 0 1 13 3.75V4H8v-.25ZM3.5 7.5a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 .75.75v7.75A2.75 2.75 0 0 1 13.75 18H6.25A2.75 2.75 0 0 1 3.5 15.25V7.5Zm3.5 2a.75.75 0 0 0-1.5 0v4.5a.75.75 0 0 0 1.5 0v-4.5ZM11 9.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
                                </svg>
                              </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Painel da direita */}
            <div className={`lg:col-span-1 ${painelAberto ? "block" : "hidden lg:block"}`}>
              {painel === "investidor" && (
                <div className="bg-mt-surface border border-mt-regua-fina p-6 flex flex-col gap-4 animate-slideUpPopup">
                  <div className="flex items-center justify-between border-b border-mt-regua-fina pb-3 select-none">
                    <h3 className="text-[15px] font-extrabold tracking-[-.01em] text-mt-ink">
                      {editandoId ? "Editar Investidor" : "Novo Investidor"}
                    </h3>
                  </div>
                  <form onSubmit={handleInvestidorSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Nome *</label>
                      <input
                        type="text"
                        required
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        placeholder="Ex: Fabiano"
                        className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">CPF / CNPJ</label>
                      <input
                        type="text"
                        value={documento}
                        onChange={(e) => setDocumento(e.target.value)}
                        className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Telefone</label>
                      <input
                        type="text"
                        value={telefone}
                        onChange={(e) => setTelefone(e.target.value)}
                        className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">E-mail</label>
                      <input
                        type="email"
                        value={emailInv}
                        onChange={(e) => setEmailInv(e.target.value)}
                        className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent"
                      />
                    </div>
                    {editandoId && (
                      <label className="flex items-center gap-2 text-xs text-mt-ink cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={ativo}
                          onChange={(e) => setAtivo(e.target.checked)}
                          className="cursor-pointer"
                        />
                        Ativo (aparece nos lançamentos)
                      </label>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => setPainel("nenhum")}
                        className="flex-1 h-11 bg-transparent hover:bg-mt-surface text-mt-neutral-700 hover:text-mt-ink border border-mt-regua-fina text-[11px] font-bold uppercase tracking-wider cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={salvando}
                        className="flex-1 h-11 bg-mt-ink hover:bg-mt-neutral-800 text-mt-inverso text-[11px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-60"
                      >
                        {salvando ? "Salvando..." : "Salvar"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {painel === "movimentacao" && (
                <div className="bg-mt-surface border border-mt-regua-fina p-6 flex flex-col gap-4 animate-slideUpPopup">
                  <div className="flex items-center justify-between border-b border-mt-regua-fina pb-3 select-none">
                    <h3 className="text-[15px] font-extrabold tracking-[-.01em] text-mt-ink">Lançar Movimentação</h3>
                  </div>
                  <form onSubmit={handleMovimentacaoSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Investidor *</label>
                      <select
                        required
                        value={movInvestidorId}
                        onChange={(e) => setMovInvestidorId(e.target.value)}
                        className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent cursor-pointer"
                      >
                        <option value="">Selecione...</option>
                        {investidores
                          .filter((i) => i.ativo !== false)
                          .map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.nome}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Aporte ou retirada — o lado mora aqui, o valor é sempre positivo. */}
                    <div className="flex flex-col gap-1.5 select-none">
                      <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Tipo *</label>
                      <div className="grid grid-cols-2 border border-mt-regua-fina">
                        {(["aporte", "retirada"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setMovTipo(t)}
                            className={`h-10 text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                              movTipo === t
                                ? "bg-mt-ink text-mt-inverso"
                                : "bg-mt-bg text-mt-neutral-700 hover:bg-mt-accent-100"
                            } ${t === "retirada" ? "border-l border-mt-regua-fina" : ""}`}
                          >
                            {t === "aporte" ? "Aporte (entra)" : "Retirada (sai)"}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Valor (R$) *</label>
                        <input
                          type="number"
                          required
                          min="0.01"
                          step="0.01"
                          value={movValor}
                          onChange={(e) => setMovValor(e.target.value)}
                          placeholder="0,00"
                          className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Data *</label>
                        <input
                          type="date"
                          required
                          value={movData}
                          onChange={(e) => setMovData(e.target.value)}
                          className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Descrição *</label>
                      <input
                        type="text"
                        required
                        value={movDescricao}
                        onChange={(e) => setMovDescricao(e.target.value)}
                        placeholder={movTipo === "aporte" ? "Ex: Aporte para compra de estoque" : "Ex: Retirada de lucro / carro de repasse"}
                        className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Forma</label>
                      <select
                        value={movForma}
                        onChange={(e) => setMovForma(e.target.value)}
                        className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent cursor-pointer"
                      >
                        {Object.entries(ROTULO_DA_FORMA).map(([valor, rotulo]) => (
                          <option key={valor} value={valor}>
                            {rotulo}
                          </option>
                        ))}
                      </select>
                    </div>

                    {movForma === "veiculo" && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Qual veículo? *</label>
                        <select
                          required
                          value={movVeiculoId}
                          onChange={(e) => setMovVeiculoId(e.target.value)}
                          className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent cursor-pointer"
                        >
                          <option value="">Selecione o veículo...</option>
                          {veiculos.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.marca} {v.modelo} - {v.ano} {v.versao ? `(${v.versao})` : ""}
                            </option>
                          ))}
                        </select>
                        <span className="text-[10px] text-mt-neutral-600 pl-1">
                          O vínculo amarra a movimentação na margem do veículo (A11).
                        </span>
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase text-mt-neutral-700 pl-1">Observações</label>
                      <textarea
                        value={movObs}
                        onChange={(e) => setMovObs(e.target.value)}
                        rows={2}
                        className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 py-3 w-full focus:outline-none focus:border-mt-accent resize-none"
                      />
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => setPainel("nenhum")}
                        className="flex-1 h-11 bg-transparent hover:bg-mt-surface text-mt-neutral-700 hover:text-mt-ink border border-mt-regua-fina text-[11px] font-bold uppercase tracking-wider cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={salvando}
                        className="flex-1 h-11 bg-mt-ink hover:bg-mt-neutral-800 text-mt-inverso text-[11px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-60"
                      >
                        {salvando ? "Registrando..." : "Registrar"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {painel === "nenhum" && (
                <div className="bg-mt-surface border border-dashed border-mt-regua-fina p-8 text-center text-xs text-mt-neutral-600 select-none">
                  Cadastre um investidor e lance aportes e retiradas — o saldo de
                  cada um é calculado do extrato, na hora.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
