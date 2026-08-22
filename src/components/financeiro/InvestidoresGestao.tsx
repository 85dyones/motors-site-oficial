"use client";

import { useEffect, useMemo, useState } from "react";
import { useConfirm } from "../admin/ConfirmDialog";
import { formatarPreco } from "../modernist/primitivos";

/**
 * Gestão de investidores — o lado de quem lança (2026-08-22).
 *
 * A tela `/investidor` é de leitura: quem coloca dinheiro não lança o próprio
 * aporte. É aqui que a participação num carro e os movimentos entram, e é
 * daqui que sai o que o investidor vê.
 *
 * A lista de investidores vem de `profiles` — inclusive quem ainda não tem
 * lançamento nenhum. Mostrar só quem já tem movimento esconderia justamente o
 * recém-cadastrado, que é de quem se precisa lançar o primeiro aporte.
 */

interface Investidor {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
}

interface Posicao {
  investidor_id: string;
  aporte_total: number;
  retirado_total: number;
  saldo_investido: number;
}

interface Participacao {
  id: string;
  investidor_id: string;
  veiculo_id: number;
  valor_investido: number;
  data_entrada: string;
  observacao: string | null;
}

interface VeiculoDoEstoque {
  id: number;
  marca: string | null;
  modelo: string | null;
  versao: string | null;
  ano: number | null;
  preco: number | null;
  vendido: boolean | null;
}

interface Movimento {
  id: string;
  investidor_id: string;
  tipo: "aporte" | "retirada";
  valor: number;
  data: string;
  descricao: string | null;
  veiculo_id: number | null;
}

const dataCurta = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

export default function InvestidoresGestao() {
  const { confirm } = useConfirm();

  const [investidores, setInvestidores] = useState<Investidor[]>([]);
  const [posicoes, setPosicoes] = useState<Posicao[]>([]);
  const [participacoes, setParticipacoes] = useState<Participacao[]>([]);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [veiculos, setVeiculos] = useState<VeiculoDoEstoque[]>([]);

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [selecionado, setSelecionado] = useState<string>("");

  // Formulário de participação. `buscaVeiculo` é o que se digita;
  // `veiculoId` é o que será enviado — os dois existem porque o carro pode
  // ser escolhido na lista OU digitado direto por id (ver o comentário do
  // seletor, abaixo).
  const [buscaVeiculo, setBuscaVeiculo] = useState("");
  const [veiculoId, setVeiculoId] = useState("");
  const [valorParticipacao, setValorParticipacao] = useState("");
  const [observacao, setObservacao] = useState("");

  // Formulário de movimento
  const [tipo, setTipo] = useState<"aporte" | "retirada">("aporte");
  const [valorMovimento, setValorMovimento] = useState("");
  const [descricao, setDescricao] = useState("");

  const carregar = async () => {
    // Sem `setCarregando(true)` aqui: o estado já NASCE carregando, e ligá-lo
    // de novo tornaria esta função um setState síncrono dentro do efeito de
    // montagem (o que o react-hooks/set-state-in-effect proíbe, com razão —
    // é render em cascata). Nas recargas depois de um lançamento a tabela
    // continua visível, que é melhor do que piscar para "Carregando…".
    try {
      const res = await fetch("/api/financeiro/investidores");
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error || "Falha ao carregar investidores.");
        return;
      }
      setInvestidores(data.investidores ?? []);
      setPosicoes(data.posicoes ?? []);
      setParticipacoes(data.participacoes ?? []);
      setMovimentos(data.movimentos ?? []);
      setVeiculos(data.veiculos ?? []);
      setSelecionado((atual) => atual || data.investidores?.[0]?.id || "");
    } catch {
      setErro("Erro ao conectar com o servidor.");
    } finally {
      setCarregando(false);
    }
  };

  // A IIFE assíncrona é o padrão do repositório para carga inicial (ver o
  // efeito do Registro na A17): o setState acontece depois do await, e não no
  // corpo do efeito — que é o que dispara render em cascata.
  useEffect(() => {
    (async () => {
      await carregar();
    })();
  }, []);

  const posicaoDe = (id: string) =>
    posicoes.find((p) => p.investidor_id === id) ?? {
      investidor_id: id,
      aporte_total: 0,
      retirado_total: 0,
      saldo_investido: 0,
    };

  const doSelecionado = useMemo(
    () => ({
      participacoes: participacoes.filter((p) => p.investidor_id === selecionado),
      movimentos: movimentos.filter((m) => m.investidor_id === selecionado),
    }),
    [participacoes, movimentos, selecionado],
  );

  /** Como o carro aparece escrito, na lista e depois de escolhido. */
  const nomeDoVeiculo = (v: VeiculoDoEstoque) =>
    [v.marca, v.modelo, v.versao].filter(Boolean).join(" ").trim() || `Veículo ${v.id}`;

  /**
   * A busca do seletor — mesma régua do fechamento de venda (A19): casa
   * qualquer pedaço de marca, modelo, versão, ano ou id, e mostra no máximo 8.
   * Filtro no cliente porque a lista inteira já veio junto do payload da tela;
   * um round-trip por tecla seria pior em todo sentido.
   */
  const encontrados = useMemo(() => {
    const termo = buscaVeiculo.trim().toLowerCase();
    if (termo.length < 2) return [];
    return veiculos
      .filter((v) =>
        [v.marca, v.modelo, v.versao, v.ano, v.id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(termo),
      )
      .slice(0, 8);
  }, [buscaVeiculo, veiculos]);

  const veiculoEscolhido = useMemo(
    () => veiculos.find((v) => String(v.id) === veiculoId) ?? null,
    [veiculos, veiculoId],
  );

  /**
   * O id digitado que NÃO está no estoque.
   *
   * Carro recém-comprado ainda não veio no sync do RevendaMais, e é
   * exatamente nessa hora que o aporte do investidor acontece. Travar o
   * lançamento até o carro aparecer no feed seria travar o registro do
   * dinheiro por causa do anúncio. A tabela não tem FK para `estoque_motors`
   * justamente para permitir isto (ver a migração 20260822120000), e a tela
   * do investidor sabe exibir participação sem carro correspondente.
   */
  const idSolto = useMemo(() => {
    const termo = buscaVeiculo.trim();
    if (!/^\d+$/.test(termo)) return null;
    if (veiculos.some((v) => String(v.id) === termo)) return null;
    return termo;
  }, [buscaVeiculo, veiculos]);

  const lancar = async (corpo: Record<string, unknown>, ondeLimpar: () => void) => {
    setSalvando(true);
    setErro("");
    setSucesso("");
    try {
      const res = await fetch("/api/financeiro/investidores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...corpo, investidor_id: selecionado }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error || "Falha ao lançar.");
        return;
      }
      setSucesso("Lançamento registrado.");
      ondeLimpar();
      await carregar();
    } catch {
      setErro("Erro ao conectar com o servidor.");
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (recurso: "participacao" | "movimento", id: string) => {
    const ok = await confirm({
      title: "Remover lançamento",
      message:
        "O investidor deixa de ver esta linha e os totais mudam na hora. Confirma?",
      type: "danger",
      confirmLabel: "Remover",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;

    setErro("");
    setSucesso("");
    try {
      const res = await fetch(
        `/api/financeiro/investidores?recurso=${recurso}&id=${id}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error || "Falha ao remover.");
        return;
      }
      setSucesso("Lançamento removido.");
      await carregar();
    } catch {
      setErro("Erro ao conectar com o servidor.");
    }
  };

  const rotuloCampo =
    "text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700 pl-1";
  const campoCaixa =
    "bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-4 h-11 w-full focus:outline-none focus:border-mt-accent";

  const investidorAtual = investidores.find((i) => i.id === selecionado);
  const posicao = posicaoDe(selecionado);

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-regua pb-5">
        <div className="flex flex-col gap-1.5">
          <div className="mt-rotulo mt-rotulo-accent">Financeiro</div>
          <h1 className="mt-titulo text-3xl md:text-4xl">Investidores</h1>
          <p className="mt-1 max-w-[640px] text-sm text-mt-neutral-800">
            Em que carros cada investidor entrou, quanto aportou e quanto já retirou.
            É daqui que sai a tela que ele vê — e ela é só de leitura.
          </p>
        </div>
      </div>

      {sucesso && (
        <div className="border-l-[3px] border-mt-ink bg-mt-surface px-4 py-3 text-xs text-mt-accent-800">
          {sucesso}
        </div>
      )}
      {erro && (
        <div className="border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800">
          {erro}
        </div>
      )}

      {carregando ? (
        <div className="py-12 text-center text-xs text-mt-neutral-700">Carregando…</div>
      ) : investidores.length === 0 ? (
        <div className="border border-dashed border-mt-regua-fina bg-mt-surface p-8 text-center text-xs text-mt-neutral-600">
          Nenhum investidor cadastrado. Convide a pessoa em Sistema → Usuários e
          permissões, com o papel <strong>Investidor</strong>.
        </div>
      ) : (
        <>
          {/* Quem */}
          <div className="flex flex-col gap-1 sm:max-w-sm">
            <label className={rotuloCampo}>Investidor</label>
            <select
              value={selecionado}
              onChange={(e) => setSelecionado(e.target.value)}
              className={`${campoCaixa} cursor-pointer`}
            >
              {investidores.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.full_name} {i.is_active ? "" : "(inativo)"}
                </option>
              ))}
            </select>
            {investidorAtual && (
              <span className="pl-1 text-[10px] text-mt-neutral-700">{investidorAtual.email}</span>
            )}
          </div>

          {/* A posição dele, igual à que ele enxerga */}
          <div className="grid grid-cols-1 gap-6 border-t-2 border-mt-regua pt-5 sm:grid-cols-3">
            {[
              { r: "Aporte total", v: posicao.aporte_total, cor: "text-mt-ink" },
              { r: "Já retirado", v: posicao.retirado_total, cor: "text-mt-neutral-700" },
              { r: "Saldo investido", v: posicao.saldo_investido, cor: "text-mt-accent" },
            ].map((n) => (
              <div key={n.r} className="border-r border-mt-regua-fina pr-5 last:border-r-0">
                <div className="mt-rotulo">{n.r}</div>
                <div className={`mt-2 text-[26px] font-extrabold leading-none tracking-[-.03em] tabular-nums ${n.cor}`}>
                  {formatarPreco(Number(n.v))}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            {/* Participação em veículo */}
            <form
              className="flex flex-col gap-4 border border-mt-regua-fina bg-mt-surface p-6"
              onSubmit={(e) => {
                e.preventDefault();
                // O `required` morava no input de id, que virou seletor. Sem
                // esta guarda o formulário enviaria veículo vazio e só o
                // servidor recusaria — depois de perder o resto do que foi
                // digitado.
                if (!veiculoId) {
                  setErro("Escolha o veículo.");
                  return;
                }
                lancar(
                  {
                    recurso: "participacao",
                    veiculo_id: veiculoId,
                    valor_investido: valorParticipacao,
                    observacao,
                  },
                  () => {
                    setVeiculoId("");
                    setBuscaVeiculo("");
                    setValorParticipacao("");
                    setObservacao("");
                  },
                );
              }}
            >
              <h3 className="text-[15px] font-extrabold tracking-[-.01em] text-mt-ink">
                Incluir em um veículo
              </h3>
              {/* Seletor pesquisável. O campo era um ID cru — o número do
                  anúncio no RevendaMais —, o que obrigava a abrir outra aba,
                  achar o carro e copiar o número na mão. Agora se digita o
                  carro; o id continua sendo o que vai para o banco. */}
              <div className="flex flex-col gap-1">
                <label className={rotuloCampo} htmlFor="busca-veiculo-investidor">
                  Veículo
                </label>

                {veiculoEscolhido ? (
                  <div className="flex items-center gap-3 border border-mt-regua bg-mt-bg px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-extrabold text-mt-ink">
                        {nomeDoVeiculo(veiculoEscolhido)}
                      </div>
                      <div className="mt-0.5 text-[10px] text-mt-neutral-700">
                        #{veiculoEscolhido.id}
                        {veiculoEscolhido.ano ? ` · ${veiculoEscolhido.ano}` : ""}
                        {veiculoEscolhido.vendido ? " · vendido" : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setVeiculoId("");
                        setBuscaVeiculo("");
                      }}
                      className="mt-foco shrink-0 cursor-pointer text-[10px] font-bold uppercase tracking-wider text-mt-neutral-700 hover:text-mt-accent"
                    >
                      Trocar
                    </button>
                  </div>
                ) : veiculoId ? (
                  /* Id lançado à mão: o carro não está no estoque (ainda). */
                  <div className="flex items-center gap-3 border border-dashed border-mt-regua bg-mt-bg px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-extrabold text-mt-ink">
                        Veículo #{veiculoId}
                      </div>
                      <div className="mt-0.5 text-[10px] text-mt-neutral-700">
                        Fora do estoque publicado — será reconhecido quando entrar no sync.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setVeiculoId("");
                        setBuscaVeiculo("");
                      }}
                      className="mt-foco shrink-0 cursor-pointer text-[10px] font-bold uppercase tracking-wider text-mt-neutral-700 hover:text-mt-accent"
                    >
                      Trocar
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      id="busca-veiculo-investidor"
                      autoComplete="off"
                      value={buscaVeiculo}
                      onChange={(e) => setBuscaVeiculo(e.target.value)}
                      placeholder="Marca, modelo, ano ou número do anúncio…"
                      className={campoCaixa}
                    />

                    {encontrados.length > 0 && (
                      <ul className="absolute z-20 mt-1 max-h-64 w-full list-none overflow-y-auto border border-mt-regua bg-mt-bg p-0 shadow-[var(--mt-shadow-lg)]">
                        {encontrados.map((v) => (
                          <li key={v.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setVeiculoId(String(v.id));
                                setBuscaVeiculo("");
                              }}
                              className="mt-foco flex w-full cursor-pointer flex-col items-start gap-0.5 border-b border-mt-regua-fina px-4 py-2.5 text-left last:border-b-0 hover:bg-mt-surface"
                            >
                              <span className="text-xs font-extrabold text-mt-ink">
                                {nomeDoVeiculo(v)}
                              </span>
                              <span className="text-[10px] text-mt-neutral-700">
                                #{v.id}
                                {v.ano ? ` · ${v.ano}` : ""}
                                {v.vendido ? " · vendido" : ""}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Carro recém-comprado ainda não veio no sync — e é
                        justamente quando o aporte acontece. */}
                    {idSolto && (
                      <ul className="absolute z-20 mt-1 w-full list-none border border-dashed border-mt-regua bg-mt-bg p-0 shadow-[var(--mt-shadow-lg)]">
                        <li>
                          <button
                            type="button"
                            onClick={() => setVeiculoId(idSolto)}
                            className="mt-foco flex w-full cursor-pointer flex-col items-start gap-0.5 px-4 py-2.5 text-left hover:bg-mt-surface"
                          >
                            <span className="text-xs font-extrabold text-mt-ink">
                              Usar o número {idSolto} mesmo assim
                            </span>
                            <span className="text-[10px] text-mt-neutral-700">
                              Para carro que ainda não entrou no estoque publicado.
                            </span>
                          </button>
                        </li>
                      </ul>
                    )}

                    {buscaVeiculo.trim().length >= 2 && encontrados.length === 0 && !idSolto && (
                      <span className="mt-1 block pl-1 text-[10px] text-mt-neutral-700">
                        Nenhum carro encontrado. Digite o número do anúncio para lançar
                        assim mesmo, ou cadastre o veículo no estoque.
                      </span>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 pl-1">
                  <span className="text-[10px] text-mt-neutral-700">
                    {veiculos.length > 0
                      ? `${veiculos.length} veículo(s) no estoque`
                      : "Estoque indisponível — lance pelo número do anúncio."}
                  </span>
                  {/* Atalho para o cadastro: o veículo nasce no RevendaMais e
                      chega aqui pelo sync, então o destino é a tabela de
                      estoque — de onde se confere se ele já entrou e se abre a
                      ficha dele. Nova aba para não perder o que já foi
                      digitado no formulário. */}
                  <a
                    href="/admin/estoque"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-foco text-[10px] font-bold uppercase tracking-wider text-mt-accent hover:text-mt-accent-hover"
                  >
                    Cadastrar / abrir estoque ↗
                  </a>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className={rotuloCampo}>Quanto ele entrou (R$)</label>
                <input
                  required
                  inputMode="decimal"
                  value={valorParticipacao}
                  onChange={(e) => setValorParticipacao(e.target.value)}
                  placeholder="50000"
                  className={campoCaixa}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={rotuloCampo}>Observação</label>
                <input
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="opcional"
                  className={campoCaixa}
                />
              </div>
              <button
                type="submit"
                disabled={salvando}
                className="mt-btn mt-btn-primario mt-foco cursor-pointer text-[11px] uppercase disabled:opacity-50"
              >
                {salvando ? "Lançando…" : "Incluir na compra"}
              </button>
            </form>

            {/* Movimento */}
            <form
              className="flex flex-col gap-4 border border-mt-regua-fina bg-mt-surface p-6"
              onSubmit={(e) => {
                e.preventDefault();
                lancar(
                  { recurso: "movimento", tipo, valor: valorMovimento, descricao },
                  () => {
                    setValorMovimento("");
                    setDescricao("");
                  },
                );
              }}
            >
              <h3 className="text-[15px] font-extrabold tracking-[-.01em] text-mt-ink">
                Aporte ou retirada
              </h3>
              <div className="flex flex-col gap-1">
                <label className={rotuloCampo}>Movimento</label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as "aporte" | "retirada")}
                  className={`${campoCaixa} cursor-pointer`}
                >
                  <option value="aporte">Aporte — dinheiro entrando</option>
                  <option value="retirada">Retirada — dinheiro saindo</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={rotuloCampo}>Valor (R$)</label>
                <input
                  required
                  inputMode="decimal"
                  value={valorMovimento}
                  onChange={(e) => setValorMovimento(e.target.value)}
                  placeholder="100000"
                  className={campoCaixa}
                />
                <span className="pl-1 text-[10px] text-mt-neutral-700">
                  Sempre positivo: quem decide o sinal é o tipo do movimento.
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <label className={rotuloCampo}>Descrição</label>
                <input
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="opcional"
                  className={campoCaixa}
                />
              </div>
              <button
                type="submit"
                disabled={salvando}
                className="mt-btn mt-btn-primario mt-foco cursor-pointer text-[11px] uppercase disabled:opacity-50"
              >
                {salvando ? "Lançando…" : "Registrar movimento"}
              </button>
            </form>
          </div>

          {/* O que já está lançado */}
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <div>
              <div className="mt-rotulo mb-3">Carros deste investidor</div>
              {doSelecionado.participacoes.length === 0 ? (
                <div className="border border-dashed border-mt-regua-fina bg-mt-surface p-6 text-center text-xs text-mt-neutral-600">
                  Nenhuma participação lançada.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="mt-tabela">
                    <thead>
                      <tr>
                        <th>Veículo</th>
                        <th>Entrada</th>
                        <th>Desde</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {doSelecionado.participacoes.map((p) => (
                        <tr key={p.id}>
                          <td className="font-extrabold text-mt-ink">#{p.veiculo_id}</td>
                          <td className="mt-num">{formatarPreco(Number(p.valor_investido))}</td>
                          <td className="mt-num text-mt-neutral-700">{dataCurta(p.data_entrada)}</td>
                          <td className="text-right">
                            <button
                              onClick={() => remover("participacao", p.id)}
                              className="mt-foco cursor-pointer text-[10px] font-bold uppercase tracking-wider text-mt-neutral-700 hover:text-mt-accent"
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <div className="mt-rotulo mb-3">Extrato</div>
              {doSelecionado.movimentos.length === 0 ? (
                <div className="border border-dashed border-mt-regua-fina bg-mt-surface p-6 text-center text-xs text-mt-neutral-600">
                  Nenhum movimento lançado.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="mt-tabela">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Tipo</th>
                        <th>Valor</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {doSelecionado.movimentos.map((m) => (
                        <tr key={m.id}>
                          <td className="mt-num text-mt-neutral-700">{dataCurta(m.data)}</td>
                          <td>
                            <span
                              className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                                m.tipo === "aporte"
                                  ? "border border-mt-regua text-mt-neutral-800"
                                  : "bg-mt-accent-100 border border-mt-accent-300 text-mt-accent-800"
                              }`}
                            >
                              {m.tipo}
                            </span>
                          </td>
                          <td className="mt-num font-semibold">
                            {m.tipo === "retirada" ? "− " : "+ "}
                            {formatarPreco(Number(m.valor))}
                          </td>
                          <td className="text-right">
                            <button
                              onClick={() => remover("movimento", m.id)}
                              className="mt-foco cursor-pointer text-[10px] font-bold uppercase tracking-wider text-mt-neutral-700 hover:text-mt-accent"
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
