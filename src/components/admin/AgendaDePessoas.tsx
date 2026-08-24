"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useConfirm } from "./ConfirmDialog";
import {
  ORIGENS,
  ROTULO_DO_PAPEL,
  CAMPOS_EDITAVEIS,
  chaveDaPessoa,
  type GrupoDuplicado,
  type OrigemDaAgenda,
  type PapelNaAgenda,
  type PessoaDaAgenda,
} from "@/lib/agenda";

/**
 * Clientes e fornecedores num lugar só.
 *
 * 2026-08-24, pedido do dono: *"precisamos ter uma aba clientes, hoje temos os
 * cadastros auxiliares, mas não tá legal, o revenda tem uma área de clientes
 * sejam internos ou externos, fornecedores... pra organizar tudo e termos como
 * gerenciar"*.
 *
 * O que havia antes era a aba "Parceiros" dos cadastros auxiliares: ela via um
 * dos quatro cadastros da casa e se chamava "auxiliar" — o nome já entregava o
 * problema. Esta tela lê a view `agenda_de_pessoas`, que une os quatro
 * (financeiro, Ciclo, rede de serviço e investidores) respeitando a RLS de
 * cada um.
 *
 * Três decisões de desenho que valem ser ditas:
 *
 * 1. **A origem aparece em cada linha.** Não como enfeite: ela é o que
 *    explica por que uns campos abrem para edição e outros não. Uma tela que
 *    mistura quatro cadastros e finge que são um só devolve erro na hora de
 *    salvar, sem ter avisado.
 * 2. **Desativar vem antes de excluir.** Fornecedor com conta paga no passado
 *    não pode sumir do histórico. O lixo só aparece onde apagar é seguro.
 * 3. **O aviso de duplicata é carregado à parte.** Duplicata é propriedade do
 *    CONJUNTO — procurá-la dentro de uma página seria procurar pares numa
 *    fatia e concluir que não há.
 */

const POR_PAGINA = 50;

const FILTROS_DE_PAPEL: { valor: string; rotulo: string }[] = [
  { valor: "", rotulo: "Todos" },
  { valor: "cliente", rotulo: "Clientes" },
  { valor: "fornecedor", rotulo: "Fornecedores" },
  { valor: "prestador", rotulo: "Prestadores" },
  { valor: "investidor", rotulo: "Investidores" },
];

interface Rascunho {
  origem: OrigemDaAgenda;
  id: string | null;
  nome: string;
  papel: PapelNaAgenda;
  documento: string;
  telefone: string;
  email: string;
  cidade: string;
  observacoes: string;
  ativo: boolean;
}

const RASCUNHO_VAZIO: Rascunho = {
  origem: "financeiro",
  id: null,
  nome: "",
  papel: "fornecedor",
  documento: "",
  telefone: "",
  email: "",
  cidade: "",
  observacoes: "",
  ativo: true,
};

export default function AgendaDePessoas() {
  const { confirm } = useConfirm();

  const [pessoas, setPessoas] = useState<PessoaDaAgenda[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);

  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [papel, setPapel] = useState("");
  const [origem, setOrigem] = useState("");
  const [ativo, setAtivo] = useState("sim");

  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [duplicatas, setDuplicatas] = useState<GrupoDuplicado[] | null>(null);
  const [duplicatasCompletas, setDuplicatasCompletas] = useState(true);
  const [conferindo, setConferindo] = useState(false);

  // A busca só vai ao servidor quando a digitação para. Sem isto, "Auto Center"
  // dispara onze consultas e a última a chegar nem sempre é a última pedida.
  useEffect(() => {
    const t = setTimeout(() => {
      setBuscaAplicada(busca);
      setPagina(1);
    }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  const buscarPessoas = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const params = new URLSearchParams();
      if (buscaAplicada.trim()) params.append("busca", buscaAplicada.trim());
      if (papel) params.append("papel", papel);
      if (origem) params.append("origem", origem);
      params.append("ativo", ativo);
      params.append("pagina", String(pagina));
      params.append("limite", String(POR_PAGINA));

      const res = await fetch(`/api/pessoas?${params.toString()}`);
      const dados = await res.json();
      if (!res.ok) {
        setErro(dados.error || "Não foi possível carregar a agenda.");
        setPessoas([]);
        setTotal(0);
        return;
      }
      setPessoas(dados.pessoas ?? []);
      setTotal(dados.total ?? 0);
    } catch (e: any) {
      setErro(`Erro de rede: ${e.message}`);
    } finally {
      setCarregando(false);
    }
  }, [buscaAplicada, papel, origem, ativo, pagina]);

  useEffect(() => {
    buscarPessoas();
  }, [buscarPessoas]);

  const conferirDuplicatas = async () => {
    setConferindo(true);
    setErro("");
    try {
      const res = await fetch("/api/pessoas/duplicatas");
      const dados = await res.json();
      if (!res.ok) {
        setErro(dados.error || "Não foi possível conferir duplicatas.");
        return;
      }
      setDuplicatas(dados.grupos ?? []);
      setDuplicatasCompletas(dados.completo !== false);
    } catch (e: any) {
      setErro(`Erro de rede: ${e.message}`);
    } finally {
      setConferindo(false);
    }
  };

  const abrirNovo = () => {
    setErro("");
    setAviso("");
    setRascunho({ ...RASCUNHO_VAZIO });
  };

  const abrirEdicao = (p: PessoaDaAgenda) => {
    setErro("");
    setAviso("");
    setRascunho({
      origem: p.origem,
      id: p.id,
      nome: p.nome ?? "",
      papel: p.papel,
      documento: p.documento ?? "",
      telefone: p.telefone ?? "",
      email: p.email ?? "",
      cidade: p.cidade ?? "",
      observacoes: p.observacoes ?? "",
      ativo: p.ativo,
    });
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rascunho) return;
    if (!rascunho.nome.trim()) {
      setErro("O nome é obrigatório.");
      return;
    }

    setSalvando(true);
    setErro("");
    try {
      let res: Response;
      if (rascunho.id === null) {
        res = await fetch("/api/pessoas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: rascunho.nome,
            papel: rascunho.papel,
            documento: rascunho.documento,
            telefone: rascunho.telefone,
            email: rascunho.email,
            cidade: rascunho.cidade,
            observacoes: rascunho.observacoes,
          }),
        });
      } else {
        // Só os campos que ESTA origem aceita. Mandar o resto faria a rota
        // recusar o lote inteiro — ela recusa em vez de ignorar em silêncio,
        // de propósito.
        const permitidos = CAMPOS_EDITAVEIS[rascunho.origem];
        const corpo: Record<string, unknown> = { origem: rascunho.origem };
        if (permitidos.nome) corpo.nome = rascunho.nome.trim();
        if (permitidos.papel) corpo.papel = rascunho.papel;
        if (permitidos.documento) corpo.documento = rascunho.documento.trim() || null;
        if (permitidos.telefone) corpo.telefone = rascunho.telefone.trim() || null;
        if (permitidos.email) corpo.email = rascunho.email.trim() || null;
        if (permitidos.cidade) corpo.cidade = rascunho.cidade.trim() || null;
        if (permitidos.observacoes) corpo.observacoes = rascunho.observacoes.trim() || null;
        if (permitidos.ativo) corpo.ativo = rascunho.ativo;

        res = await fetch(`/api/pessoas/${rascunho.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        });
      }

      const dados = await res.json();
      if (!res.ok) {
        setErro(dados.error || "Não foi possível salvar.");
        return;
      }

      setAviso(rascunho.id === null ? "Cadastrado." : "Atualizado.");
      setRascunho(null);
      setDuplicatas(null); // a conferência anterior envelheceu
      buscarPessoas();
      setTimeout(() => setAviso(""), 4000);
    } catch (e: any) {
      setErro(`Erro de rede: ${e.message}`);
    } finally {
      setSalvando(false);
    }
  };

  const alternarAtivo = async (p: PessoaDaAgenda) => {
    if (!CAMPOS_EDITAVEIS[p.origem].ativo) return;
    setErro("");
    try {
      const res = await fetch(`/api/pessoas/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origem: p.origem, ativo: !p.ativo }),
      });
      const dados = await res.json();
      if (!res.ok) {
        setErro(dados.error || "Não foi possível mudar o estado.");
        return;
      }
      setAviso(p.ativo ? "Desativado — some das listas, fica no histórico." : "Reativado.");
      buscarPessoas();
      setTimeout(() => setAviso(""), 4000);
    } catch (e: any) {
      setErro(`Erro de rede: ${e.message}`);
    }
  };

  const excluir = async (p: PessoaDaAgenda) => {
    const ok = await confirm({
      title: "Excluir cadastro",
      message:
        `Excluir "${p.nome}" em definitivo? Se ele já apareceu em algum ` +
        "lançamento, prefira DESATIVAR — o histórico continua legível.",
      confirmLabel: "Sim, excluir",
      cancelLabel: "Cancelar",
      type: "danger",
    });
    if (!ok) return;

    setErro("");
    try {
      const res = await fetch(`/api/pessoas/${p.id}?origem=${p.origem}`, {
        method: "DELETE",
      });
      const dados = await res.json();
      if (!res.ok) {
        setErro(dados.error || "Não foi possível excluir.");
        return;
      }
      setAviso("Excluído.");
      setDuplicatas(null);
      buscarPessoas();
      setTimeout(() => setAviso(""), 4000);
    } catch (e: any) {
      setErro(`Erro de rede: ${e.message}`);
    }
  };

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-1.5 border-b-2 border-mt-regua pb-5 select-none">
        <div className="mt-rotulo mt-rotulo-accent">Relacionamento</div>
        <h1 className="mt-titulo text-3xl md:text-4xl">Clientes e fornecedores</h1>
        <p className="mt-1 max-w-[640px] text-sm text-mt-neutral-800">
          Quem compra, quem fornece, quem presta serviço e quem investe — os quatro
          cadastros da casa numa lista só. A coluna <em>Cadastro</em> diz de onde cada
          um vem, porque é ela que decide o que dá para editar por aqui.
        </p>
      </div>

      {erro && (
        <div className="border border-mt-accent-300 bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent select-none">
          {erro}
        </div>
      )}
      {aviso && (
        <div className="border border-mt-regua-fina bg-mt-surface px-4 py-3 text-xs font-bold text-mt-accent-800 select-none">
          {aviso}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col gap-4 border border-mt-regua-fina bg-mt-surface p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[220px] flex-1 flex-col gap-1">
            <label className="text-[9px] font-bold uppercase tracking-wider text-mt-neutral-700">
              Buscar por nome, documento, e-mail ou telefone
            </label>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Ex: AutoPeças, 12.345.678/0001-90, (41) 9…"
              className="h-10 border border-mt-regua-fina bg-mt-bg px-3.5 text-xs text-mt-ink outline-none focus:border-mt-accent"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold uppercase tracking-wider text-mt-neutral-700">
              Papel
            </label>
            <select
              value={papel}
              onChange={(e) => {
                setPapel(e.target.value);
                setPagina(1);
              }}
              className="h-10 cursor-pointer border border-mt-regua-fina bg-mt-bg px-3 text-xs text-mt-ink outline-none focus:border-mt-accent"
            >
              {FILTROS_DE_PAPEL.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold uppercase tracking-wider text-mt-neutral-700">
              Cadastro
            </label>
            <select
              value={origem}
              onChange={(e) => {
                setOrigem(e.target.value);
                setPagina(1);
              }}
              className="h-10 cursor-pointer border border-mt-regua-fina bg-mt-bg px-3 text-xs text-mt-ink outline-none focus:border-mt-accent"
            >
              <option value="">Todos</option>
              {(Object.keys(ORIGENS) as OrigemDaAgenda[]).map((o) => (
                <option key={o} value={o}>
                  {ORIGENS[o].rotulo}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold uppercase tracking-wider text-mt-neutral-700">
              Situação
            </label>
            <select
              value={ativo}
              onChange={(e) => {
                setAtivo(e.target.value);
                setPagina(1);
              }}
              className="h-10 cursor-pointer border border-mt-regua-fina bg-mt-bg px-3 text-xs text-mt-ink outline-none focus:border-mt-accent"
            >
              <option value="sim">Ativos</option>
              <option value="nao">Inativos</option>
              <option value="todos">Todos</option>
            </select>
          </div>

          <button
            type="button"
            onClick={abrirNovo}
            className="mt-foco h-10 cursor-pointer bg-mt-accent px-4 text-xs font-extrabold uppercase tracking-wider text-mt-inverso transition-all hover:bg-mt-accent-hover"
          >
            + Novo cadastro
          </button>
        </div>

        {/* Conferência de duplicatas */}
        <div className="flex flex-wrap items-center gap-3 border-t border-mt-regua-fina pt-3">
          <button
            type="button"
            onClick={conferirDuplicatas}
            disabled={conferindo}
            className="mt-foco border border-mt-regua-fina px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-mt-neutral-700 enabled:cursor-pointer enabled:hover:border-mt-accent enabled:hover:text-mt-accent disabled:opacity-40"
          >
            {conferindo ? "Conferindo…" : "Procurar cadastros repetidos"}
          </button>
          <span className="text-[10px] text-mt-neutral-600">
            Varre os quatro cadastros de uma vez — o mesmo CNPJ pode estar como
            fornecedor aqui e como oficina na rede.
          </span>
        </div>

        {duplicatas !== null && (
          <div className="flex flex-col gap-2 border border-mt-regua-fina bg-mt-bg p-4">
            {duplicatas.length === 0 ? (
              <span className="text-[11px] text-mt-neutral-700">
                Nenhum cadastro repetido encontrado
                {duplicatasCompletas ? "." : " nas linhas analisadas."}
              </span>
            ) : (
              <>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-mt-ink">
                  {duplicatas.length} possível(is) repetição(ões)
                </span>
                {!duplicatasCompletas && (
                  <span className="text-[10px] text-mt-accent">
                    A base é maior que o limite da varredura — esta análise é parcial.
                  </span>
                )}
                {duplicatas.map((g) => (
                  <div
                    key={`${g.motivo}:${g.chave}`}
                    className="flex flex-col gap-1 border-l-2 border-mt-accent-300 pl-3 py-1"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-mt-neutral-700">
                      {g.motivo === "documento"
                        ? `Mesmo documento (${g.chave})`
                        : `Mesmo nome — confira se é a mesma pessoa`}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {g.pessoas.map((p) => (
                        <span
                          key={chaveDaPessoa(p)}
                          className="border border-mt-regua-fina bg-mt-surface px-2 py-0.5 text-[10px] text-mt-ink"
                        >
                          {p.nome}{" "}
                          <em className="text-mt-neutral-600">
                            · {ORIGENS[p.origem].rotulo}
                          </em>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Lista */}
      <div className="border border-mt-regua-fina bg-mt-surface p-6">
        {carregando ? (
          <div className="py-12 text-center text-xs text-mt-neutral-700">Carregando…</div>
        ) : pessoas.length === 0 ? (
          <div className="py-12 text-center text-xs text-mt-neutral-700">
            Nenhum cadastro para estes filtros.
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-mt-regua-fina font-bold uppercase tracking-wider text-mt-neutral-700">
                  <th className="pb-3 pl-2">Nome</th>
                  <th className="pb-3">Papel</th>
                  <th className="pb-3">Cadastro</th>
                  <th className="pb-3">CPF / CNPJ</th>
                  <th className="pb-3">Contato</th>
                  <th className="pb-3 pr-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mt-regua-fina">
                {pessoas.map((p) => {
                  const editavel = Object.keys(CAMPOS_EDITAVEIS[p.origem]).length > 0;
                  const podeApagar = p.origem === "financeiro" || p.origem === "rede";
                  return (
                    <tr
                      key={chaveDaPessoa(p)}
                      className={`transition-colors hover:bg-mt-accent-100 ${p.ativo ? "" : "opacity-55"}`}
                    >
                      <td className="py-3 pl-2 font-bold text-mt-ink">
                        {p.nome}
                        {p.especialidade && (
                          <span className="ml-2 font-normal text-[10px] text-mt-neutral-600">
                            {p.especialidade}
                          </span>
                        )}
                        {!p.ativo && (
                          <span className="ml-2 border border-mt-regua-fina px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-mt-neutral-600">
                            inativo
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        <span className="border border-mt-regua-fina bg-mt-bg px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-mt-neutral-800">
                          {ROTULO_DO_PAPEL[p.papel] ?? p.papel}
                        </span>
                      </td>
                      <td className="py-3 text-[11px] text-mt-neutral-700">
                        {ORIGENS[p.origem].rotulo}
                      </td>
                      <td className="py-3 font-mono text-mt-neutral-700">
                        {p.documento || "—"}
                      </td>
                      <td className="py-3 text-mt-neutral-700">
                        <div className="flex flex-col leading-tight">
                          <span>{p.telefone || "—"}</span>
                          {p.email && (
                            <span className="text-[10px] text-mt-neutral-600">{p.email}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-2 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {editavel && (
                            <button
                              onClick={() => abrirEdicao(p)}
                              className="cursor-pointer text-xs font-bold text-mt-accent hover:underline"
                            >
                              Editar
                            </button>
                          )}
                          {CAMPOS_EDITAVEIS[p.origem].ativo && (
                            <button
                              onClick={() => alternarAtivo(p)}
                              className="cursor-pointer text-xs font-bold text-mt-neutral-700 hover:text-mt-accent hover:underline"
                              title={
                                p.ativo
                                  ? "Some das listas de escolha, permanece no histórico"
                                  : "Volta a aparecer nas listas"
                              }
                            >
                              {p.ativo ? "Desativar" : "Reativar"}
                            </button>
                          )}
                          {podeApagar && (
                            <button
                              onClick={() => excluir(p)}
                              className="cursor-pointer text-xs font-bold text-mt-accent-800 hover:text-mt-accent hover:underline"
                            >
                              Excluir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* O rodapé existe menos para navegar e mais para DIZER que há mais:
            lista cortada sem aviso é indistinguível de lista completa. */}
        {!carregando && total > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-mt-regua-fina pt-3">
            <span className="text-[10px] text-mt-neutral-600">
              Mostrando{" "}
              <strong className="font-bold text-mt-neutral-700">
                {(pagina - 1) * POR_PAGINA + 1}–{Math.min(pagina * POR_PAGINA, total)}
              </strong>{" "}
              de <strong className="font-bold text-mt-neutral-700">{total}</strong>
              {ativo === "sim" && " ativos"} · em ordem alfabética
            </span>
            {total > POR_PAGINA && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={pagina <= 1}
                  className="mt-foco border border-mt-regua-fina px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-mt-neutral-700 disabled:opacity-40 enabled:cursor-pointer enabled:hover:border-mt-accent enabled:hover:text-mt-accent"
                >
                  Anterior
                </button>
                <span className="text-[10px] tabular-nums text-mt-neutral-600">
                  {pagina} / {totalPaginas}
                </span>
                <button
                  type="button"
                  onClick={() => setPagina((p) => p + 1)}
                  disabled={pagina >= totalPaginas}
                  className="mt-foco border border-mt-regua-fina px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-mt-neutral-700 disabled:opacity-40 enabled:cursor-pointer enabled:hover:border-mt-accent enabled:hover:text-mt-accent"
                >
                  Próxima
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Formulário */}
      {rascunho && (
        <FormularioDaPessoa
          rascunho={rascunho}
          setRascunho={setRascunho}
          salvar={salvar}
          salvando={salvando}
          fechar={() => setRascunho(null)}
        />
      )}
    </div>
  );
}

/**
 * O formulário mostra apenas o que a origem daquela linha aceita.
 *
 * Um campo aberto que a rota vai recusar é uma promessa quebrada na hora de
 * salvar. `CAMPOS_EDITAVEIS` é a mesma fonte que a rota consulta — as duas
 * pontas concordam por construção, não por coincidência.
 */
function FormularioDaPessoa({
  rascunho,
  setRascunho,
  salvar,
  salvando,
  fechar,
}: {
  rascunho: Rascunho;
  setRascunho: (r: Rascunho) => void;
  salvar: (e: React.FormEvent) => void;
  salvando: boolean;
  fechar: () => void;
}) {
  const novo = rascunho.id === null;
  const permitidos = CAMPOS_EDITAVEIS[rascunho.origem];
  const casa = ORIGENS[rascunho.origem].casa;
  const campo =
    "h-10 border border-mt-regua-fina bg-mt-bg px-3 text-xs text-mt-ink outline-none focus:border-mt-accent";
  const rotulo = "text-[9px] font-bold uppercase tracking-wider text-mt-neutral-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-mt-inverso-fundo/80 p-4 select-none">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto border border-mt-regua-fina bg-mt-surface p-6">
        <div className="flex items-center justify-between border-b border-mt-regua-fina pb-3">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-mt-ink">
            {novo ? "Novo cadastro" : `Editar — ${ORIGENS[rascunho.origem].rotulo}`}
          </h3>
          <button onClick={fechar} className="cursor-pointer font-bold text-mt-neutral-700 hover:text-mt-ink">
            ✕
          </button>
        </div>

        {!novo && casa && (
          <p className="border border-mt-regua-fina bg-mt-bg px-3 py-2 text-[10px] text-mt-neutral-700">
            Aqui dá para acertar o contato. O resto do cadastro vive em{" "}
            <Link href={casa} className="font-bold text-mt-accent hover:underline">
              {ORIGENS[rascunho.origem].rotulo}
            </Link>
            , onde ele nasce.
          </p>
        )}

        <form onSubmit={salvar} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className={rotulo}>Nome / razão social</label>
            <input
              type="text"
              required
              value={rascunho.nome}
              onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
              placeholder="Ex: AutoPeças Curitiba Ltda"
              className={campo}
              disabled={!permitidos.nome}
            />
          </div>

          {permitidos.papel && (
            <div className="flex flex-col gap-1">
              <label className={rotulo}>É o quê para a loja</label>
              <select
                value={rascunho.papel}
                onChange={(e) =>
                  setRascunho({ ...rascunho, papel: e.target.value as PapelNaAgenda })
                }
                className={`${campo} cursor-pointer`}
              >
                <option value="fornecedor">Fornecedor</option>
                <option value="cliente">Cliente</option>
                <option value="ambos">Cliente e fornecedor</option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {permitidos.documento && (
              <div className="flex flex-col gap-1">
                <label className={rotulo}>CPF / CNPJ</label>
                <input
                  type="text"
                  value={rascunho.documento}
                  onChange={(e) => setRascunho({ ...rascunho, documento: e.target.value })}
                  placeholder="00.000.000/0000-00"
                  className={`${campo} font-mono`}
                />
              </div>
            )}
            {permitidos.telefone && (
              <div className="flex flex-col gap-1">
                <label className={rotulo}>Telefone / WhatsApp</label>
                <input
                  type="text"
                  value={rascunho.telefone}
                  onChange={(e) => setRascunho({ ...rascunho, telefone: e.target.value })}
                  placeholder="(41) 99999-9999"
                  className={campo}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {permitidos.email && (
              <div className="flex flex-col gap-1">
                <label className={rotulo}>E-mail</label>
                <input
                  type="email"
                  value={rascunho.email}
                  onChange={(e) => setRascunho({ ...rascunho, email: e.target.value })}
                  placeholder="contato@empresa.com"
                  className={campo}
                />
              </div>
            )}
            {permitidos.cidade && (
              <div className="flex flex-col gap-1">
                <label className={rotulo}>Cidade</label>
                <input
                  type="text"
                  value={rascunho.cidade}
                  onChange={(e) => setRascunho({ ...rascunho, cidade: e.target.value })}
                  placeholder="Curitiba"
                  className={campo}
                />
              </div>
            )}
          </div>

          {permitidos.observacoes && (
            <div className="flex flex-col gap-1">
              <label className={rotulo}>Observações</label>
              <textarea
                value={rascunho.observacoes}
                onChange={(e) => setRascunho({ ...rascunho, observacoes: e.target.value })}
                rows={2}
                className="border border-mt-regua-fina bg-mt-bg px-3 py-2 text-xs text-mt-ink outline-none focus:border-mt-accent"
              />
            </div>
          )}

          <div className="mt-1 flex items-center justify-end gap-2 border-t border-mt-regua-fina pt-3">
            <button
              type="button"
              onClick={fechar}
              className="cursor-pointer border border-mt-regua-fina bg-mt-bg px-4 py-2 text-xs font-bold uppercase text-mt-neutral-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="bg-mt-accent px-6 py-2 text-xs font-extrabold uppercase tracking-wider text-mt-inverso disabled:opacity-50 enabled:cursor-pointer"
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
