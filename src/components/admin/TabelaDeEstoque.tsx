"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CARROCERIAS } from "../../lib/classificacaoVeiculo";
import { PERFIS_DE_USO } from "../../lib/perfisDeUso";
import { MINIMO_DE_FOTOS } from "../../lib/coerenciaDoCadastro";
import {
  contarPorEstado,
  filtrarLinhas,
  reclassificarLinha,
  ROTULO_DO_ESTADO,
  type EstadoDoVeiculo,
  type FiltroDeEstado,
  type LinhaDeEstoque,
} from "../../lib/estoqueTabela";
import type { StockOverrides } from "../../types";

/**
 * Tela A6 do design doc — a tabela de estoque.
 *
 * Três diferenças deliberadas em relação ao desenho:
 *
 * 1. **Estados reais.** O doc filtra por PUBLICADOS / RASCUNHOS / RESERVADOS.
 *    Rascunho e reservado dependem do fluxo de revisão (A16), que não existe.
 *    Aqui os estados são os que o banco sustenta: publicado, fora da vitrine,
 *    vendido e fora do feed. "Fora da vitrine" é o carro cadastrado que o site
 *    não mostra — quem decide é `bloqueiosDePublicacao`, a mesma função que
 *    corta o `getEstoque`, e o motivo dela vai escrito na linha.
 * 2. **Sem coluna FIPE.** `fipe` não existe no banco — sairia vazia em toda
 *    linha.
 * 3. **Classificar é ação de lote**, não select por linha. Era select por
 *    linha na aba de cards; numa tabela densa, aplicar a 12 carros de uma vez
 *    é menos clique e menos erro que 12 selects.
 *
 * Toda escrita passa por rota autenticada (`/api/estoque/lote`), nunca pelo
 * cliente com a anon key como fazia a tela antiga — `AUDITORIA.md §3.4`.
 */

interface TabelaDeEstoqueProps {
  linhas: LinhaDeEstoque[];
  quickTagsDisponiveis: Array<{ id: string; nome: string }>;
  destacadosIniciais: string[];
  overridesIniciais: StockOverrides;
  /** `false` = GA4 sem credencial; a coluna de visitas mostra "—". */
  visitasDisponiveis: boolean;
  /**
   * Este perfil cadastra veículo? Resolvido no servidor pela linha
   * "Publicar ou despublicar veículo" da A17 — Admin e Comercial.
   *
   * Governa se o botão "+ Novo veículo" EXISTE, não se ele fica cinza: "tudo
   * que for negado some da interface" é a regra do doc, e a rota devolve 403
   * de qualquer jeito para quem tentar pela URL.
   */
  podeCriar: boolean;
}

const FILTROS: Array<{ id: FiltroDeEstado; rotulo: string }> = [
  { id: "todos", rotulo: "Todos" },
  { id: "publicado", rotulo: "Publicados" },
  // Ao lado de "Publicados" de propósito: os dois números juntos respondem
  // "quantos carros o site está mostrando, e quantos deveriam estar mostrando".
  // É a pergunta que trouxe esta tela ao ar, e a lista de quem falta.
  { id: "fora_da_vitrine", rotulo: "Fora da vitrine" },
  { id: "vendido", rotulo: "Vendidos" },
  { id: "fora_do_feed", rotulo: "Fora do feed" },
];

/**
 * A etiqueta de estado. Mapa em vez de ternário encadeado: com quatro estados,
 * a cadeia deixa de caber numa linha e passa a esconder qual cor é de qual.
 *
 * "Fora da vitrine" usa o fundo de alerta cheio — é o único estado desta lista
 * que alguém resolve hoje, sem esperar sync nem cliente.
 */
const CLASSE_DO_ESTADO: Record<EstadoDoVeiculo, string> = {
  publicado: "border-mt-regua text-mt-neutral-800",
  fora_da_vitrine: "border-mt-accent bg-mt-accent-100 text-mt-accent-800",
  vendido: "border-mt-ink bg-mt-ink text-mt-bg",
  fora_do_feed: "border-mt-accent-300 text-mt-accent-800",
};

const PASSO_DA_PAGINA = 20;

function dinheiro(valor: number | null): string {
  if (valor === null || valor === 0) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function quilometragem(km: number | null): string {
  if (km === null || km === undefined) return "—";
  return `${km.toLocaleString("pt-BR")} km`;
}

export default function TabelaDeEstoque({
  linhas: linhasIniciais,
  quickTagsDisponiveis,
  destacadosIniciais,
  overridesIniciais,
  visitasDisponiveis,
  podeCriar,
}: TabelaDeEstoqueProps) {
  const [linhas, setLinhas] = useState<LinhaDeEstoque[]>(linhasIniciais);
  const [overrides, setOverrides] = useState<StockOverrides>(overridesIniciais);
  const [destacados, setDestacados] = useState<string[]>(destacadosIniciais);

  const [filtro, setFiltro] = useState<FiltroDeEstado>("todos");
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [visiveis, setVisiveis] = useState(PASSO_DA_PAGINA);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const contagem = useMemo(() => contarPorEstado(linhas), [linhas]);
  const filtradas = useMemo(() => filtrarLinhas(linhas, { estado: filtro, busca }), [linhas, filtro, busca]);
  const naTela = filtradas.slice(0, visiveis);

  const selecionadosVisiveis = selecionados.filter((id) => filtradas.some((l) => l.id === id));
  const todasSelecionadas = naTela.length > 0 && naTela.every((l) => selecionados.includes(l.id));

  const alternarSelecao = (id: string) => {
    setSelecionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const alternarTodas = () => {
    setSelecionados((prev) =>
      todasSelecionadas
        ? prev.filter((id) => !naTela.some((l) => l.id === id))
        : [...new Set([...prev, ...naTela.map((l) => l.id)])],
    );
  };

  const limpar = () => {
    setErro("");
    setAviso("");
  };

  /** Campos que vivem em coluna do banco: passam pela rota de lote. */
  const aplicarNoBanco = async (
    campos: Record<string, unknown>,
    descricao: string,
    aplicarNaLinha: (l: LinhaDeEstoque) => LinhaDeEstoque,
  ) => {
    if (selecionadosVisiveis.length === 0) return;
    limpar();
    setSalvando(true);
    try {
      const res = await fetch("/api/estoque/lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selecionadosVisiveis, campos }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Falha ao salvar");

      setLinhas((prev) =>
        prev.map((l) => (selecionadosVisiveis.includes(l.id) ? aplicarNaLinha(l) : l)),
      );
      setAviso(`${descricao} · ${selecionadosVisiveis.length} veículo(s)`);
      setSelecionados([]);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  /** Campos que vivem no JSON de settings: destaque na home e destaque rápido. */
  const salvarSettings = async (corpo: Record<string, unknown>, descricao: string) => {
    limpar();
    setSalvando(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Falha ao salvar");
      }
      setAviso(descricao);
      setSelecionados([]);
      return true;
    } catch (e: any) {
      setErro(e.message);
      return false;
    } finally {
      setSalvando(false);
    }
  };

  const alternarDestaqueNaHome = async (marcar: boolean) => {
    if (selecionadosVisiveis.length === 0) return;
    const proximos = marcar
      ? [...new Set([...destacados, ...selecionadosVisiveis])]
      : destacados.filter((id) => !selecionadosVisiveis.includes(id));

    const anterior = destacados;
    setDestacados(proximos);
    setLinhas((prev) => prev.map((l) => ({ ...l, destacado: proximos.includes(l.id) })));

    const ok = await salvarSettings(
      { carouselVehicleIds: proximos },
      marcar ? "Destacados no carrossel da home" : "Retirados do carrossel da home",
    );
    if (!ok) {
      setDestacados(anterior);
      setLinhas((prev) => prev.map((l) => ({ ...l, destacado: anterior.includes(l.id) })));
    }
  };

  const alternarQuickTag = async (tagId: string, adicionar: boolean) => {
    if (!tagId || selecionadosVisiveis.length === 0) return;
    const proximos: StockOverrides = { ...overrides };
    for (const id of selecionadosVisiveis) {
      const atual = proximos[id]?.quick_tags ?? [];
      const novo = adicionar
        ? [...new Set([...atual, tagId])]
        : atual.filter((t) => t !== tagId);
      proximos[id] = { ...(proximos[id] ?? {}), quick_tags: novo };
    }

    const anterior = overrides;
    setOverrides(proximos);
    setLinhas((prev) =>
      prev.map((l) =>
        selecionadosVisiveis.includes(l.id) ? { ...l, quickTags: proximos[l.id]?.quick_tags ?? [] } : l,
      ),
    );

    const nome = quickTagsDisponiveis.find((t) => t.id === tagId)?.nome ?? tagId;
    const ok = await salvarSettings(
      { stockOverrides: { overrides: proximos } },
      adicionar ? `Adicionados ao destaque “${nome}”` : `Removidos do destaque “${nome}”`,
    );
    if (!ok) {
      setOverrides(anterior);
      setLinhas((prev) =>
        prev.map((l) => ({ ...l, quickTags: anterior[l.id]?.quick_tags ?? [] })),
      );
    }
  };

  /**
   * Acrescenta ou tira um perfil dos selecionados, preservando os demais.
   *
   * A ordem gravada segue `PERFIS_DE_USO`, não a ordem dos cliques: sem isso,
   * dois carros com os mesmos perfis gravariam arrays diferentes e o histórico
   * registraria mudança onde não houve.
   */
  const alternarPerfil = async (slug: string, adicionar: boolean) => {
    if (!slug || selecionadosVisiveis.length === 0) return;
    const nome = PERFIS_DE_USO.find((p) => p.slug === slug)?.nome ?? slug;

    // Um POST por conjunto de perfis resultante — a rota em lote aplica UMA
    // atualização a vários ids, e os selecionados podem ter perfis diferentes.
    const porResultado = new Map<string, string[]>();
    for (const l of linhas) {
      if (!selecionadosVisiveis.includes(l.id)) continue;
      const atuais = l.perfisUso ?? [];
      const proximos = PERFIS_DE_USO.filter((p) =>
        p.slug === slug ? adicionar : atuais.includes(p.slug),
      ).map((p) => p.slug);
      const chave = proximos.join(",");
      porResultado.set(chave, [...(porResultado.get(chave) ?? []), l.id]);
    }

    for (const [chave, ids] of porResultado) {
      const perfis = chave ? chave.split(",") : [];
      await aplicarNoBanco(
        { perfis_uso: perfis },
        adicionar ? `Marcados como “${nome}”` : `“${nome}” removido`,
        (l) => (ids.includes(l.id) ? { ...l, perfisUso: perfis } : l),
      );
    }
  };

  const semSelecao = selecionadosVisiveis.length === 0 || salvando;

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-regua pb-5">
        <div className="flex flex-col gap-1.5">
          <div className="mt-rotulo mt-rotulo-accent">Estoque</div>
          <h1 className="mt-titulo text-3xl md:text-4xl">{contagem.todos} veículos</h1>
          <p className="mt-1 max-w-[620px] text-sm text-mt-neutral-800">
            A maior parte do estoque entra pelo sync do RevendaMais; o que não veio de lá se
            cadastra aqui. Nesta tela se decide o que a vitrine mostra, como o carro é
            classificado e o que vai ao carrossel da home.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Some para quem não publica veículo (A17) — a régua do doc é
              esconder, não desabilitar. A rota recusa igual, pela URL. */}
          {podeCriar && (
            <Link
              href="/admin/estoque/novo"
              className="mt-btn mt-btn-primario mt-foco px-4 py-2.5 text-[11px] no-underline"
            >
              + Novo veículo
            </Link>
          )}
          <Link
            href="/estoque"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-btn mt-btn-contorno mt-foco px-4 py-2.5 text-[11px] no-underline"
          >
            Ver no site
          </Link>
        </div>
      </div>

      {erro && (
        <div className="border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800">
          {erro}
        </div>
      )}
      {aviso && !erro && (
        <div className="border-l-[3px] border-mt-ink bg-mt-surface px-4 py-3 text-xs text-mt-neutral-800">
          {aviso}
        </div>
      )}

      {/* Régua de estados + busca */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-3 border-b border-mt-regua-fina pb-3">
        {FILTROS.map((f) => {
          const ativo = filtro === f.id;
          return (
            <button
              key={f.id}
              onClick={() => {
                setFiltro(f.id);
                setVisiveis(PASSO_DA_PAGINA);
              }}
              aria-pressed={ativo}
              className={`mt-foco cursor-pointer border px-3 py-2 text-[11px] font-extrabold uppercase tracking-[.1em] transition-colors ${
                ativo
                  ? "border-mt-ink bg-mt-ink text-mt-bg"
                  : "border-mt-regua-fina text-mt-neutral-700 hover:border-mt-accent hover:text-mt-ink"
              }`}
            >
              {f.rotulo}
              <span className="ml-2 tabular-nums opacity-70">{contagem[f.id]}</span>
            </button>
          );
        })}

        <div className="relative ml-auto w-full sm:w-[280px]">
          <input
            type="text"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setVisiveis(PASSO_DA_PAGINA);
            }}
            placeholder="Marca, modelo, código ou placa"
            className="mt-campo-caixa mt-foco pr-8"
          />
          {busca && (
            <button
              onClick={() => setBusca("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-xs text-mt-neutral-600 hover:text-mt-ink"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Barra de ação em lote */}
      {selecionadosVisiveis.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-l-[3px] border-mt-accent bg-mt-surface px-4 py-3">
          <span className="text-[11px] font-extrabold uppercase tracking-[.1em] text-mt-ink">
            {selecionadosVisiveis.length} selecionado(s)
          </span>

          {/* Os dois botões abaixo pedem o estado a `reclassificarLinha` em vez
              de escrevê-lo à mão: a tela atualiza a linha sem recarregar, e o
              `"publicado"` que ficava digitado aqui era como um carro sem fotos
              — ou fora do feed — voltava a aparecer no ar com um clique em
              "devolver a disponível". */}
          <button
            disabled={semSelecao}
            onClick={() =>
              aplicarNoBanco({ vendido: true }, "Marcados como vendidos", (l) => ({
                ...l,
                estado: reclassificarLinha(l, true),
                divergente: false,
              }))
            }
            className="mt-foco cursor-pointer border border-mt-regua px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] text-mt-neutral-800 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Marcar como vendido
          </button>

          <button
            disabled={semSelecao}
            onClick={() =>
              aplicarNoBanco({ vendido: false }, "Devolvidos a disponível", (l) => ({
                ...l,
                estado: reclassificarLinha(l, false),
                divergente: false,
              }))
            }
            className="mt-foco cursor-pointer border border-mt-regua px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] text-mt-neutral-800 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Devolver a disponível
          </button>

          <button
            disabled={semSelecao}
            onClick={() => alternarDestaqueNaHome(true)}
            className="mt-foco cursor-pointer border border-mt-regua px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] text-mt-neutral-800 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Destacar na home
          </button>
          <button
            disabled={semSelecao}
            onClick={() => alternarDestaqueNaHome(false)}
            className="mt-foco cursor-pointer border border-mt-regua px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] text-mt-neutral-800 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Tirar da home
          </button>

          <select
            disabled={semSelecao}
            defaultValue=""
            onChange={(e) => {
              const valor = e.target.value;
              e.target.value = "";
              if (valor === "") return;
              aplicarNoBanco({ tipo: valor }, `Carroceria definida como ${valor}`, (l) => ({
                ...l,
                tipo: valor,
              }));
            }}
            aria-label="Definir carroceria dos selecionados"
            className="mt-foco cursor-pointer border border-mt-regua-fina bg-mt-bg px-3 py-2 text-[11px] text-mt-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <option value="">Definir carroceria…</option>
            {CARROCERIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Adicionar/remover, e não "definir": desde 20260826230000 o perfil
              é uma LISTA, e um carro serve para mais de uma coisa. Mesmo
              formato que os destaques já usam logo ao lado — foi o padrão
              pedido. */}
          <select
            disabled={semSelecao}
            defaultValue=""
            onChange={(e) => {
              const valor = e.target.value;
              e.target.value = "";
              if (valor === "") return;
              const [acao, slug] = valor.split(":");
              alternarPerfil(slug, acao === "add");
            }}
            aria-label="Adicionar ou remover perfil de uso dos selecionados"
            className="mt-foco cursor-pointer border border-mt-regua-fina bg-mt-bg px-3 py-2 text-[11px] text-mt-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <option value="">Para que serve…</option>
            {PERFIS_DE_USO.map((p) => (
              <option key={`add:${p.slug}`} value={`add:${p.slug}`}>
                + {p.nome}
              </option>
            ))}
            {PERFIS_DE_USO.map((p) => (
              <option key={`del:${p.slug}`} value={`del:${p.slug}`}>
                − {p.nome}
              </option>
            ))}
          </select>

          {quickTagsDisponiveis.length > 0 && (
            <select
              disabled={semSelecao}
              defaultValue=""
              onChange={(e) => {
                const valor = e.target.value;
                e.target.value = "";
                if (!valor) return;
                const [acao, tagId] = valor.split(":");
                alternarQuickTag(tagId, acao === "add");
              }}
              aria-label="Destaque rápido dos selecionados"
              className="mt-foco cursor-pointer border border-mt-regua-fina bg-mt-bg px-3 py-2 text-[11px] text-mt-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <option value="">Destaque rápido…</option>
              {quickTagsDisponiveis.map((t) => (
                <option key={`add:${t.id}`} value={`add:${t.id}`}>
                  Adicionar a {t.nome}
                </option>
              ))}
              {quickTagsDisponiveis.map((t) => (
                <option key={`rem:${t.id}`} value={`rem:${t.id}`}>
                  Remover de {t.nome}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => setSelecionados([])}
            className="mt-foco ml-auto cursor-pointer text-[10px] font-bold uppercase tracking-[.1em] text-mt-neutral-700 hover:text-mt-ink"
          >
            Limpar seleção
          </button>
        </div>
      )}

      {/* A tabela */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-left">
          <thead>
            <tr className="border-b-2 border-mt-regua">
              <th className="w-8 py-2.5 pr-2">
                <input
                  type="checkbox"
                  checked={todasSelecionadas}
                  onChange={alternarTodas}
                  aria-label="Selecionar os veículos visíveis"
                  className="mt-foco h-3.5 w-3.5 cursor-pointer accent-[var(--mt-accent)]"
                />
              </th>
              {["Veículo", "Código", "Ano · KM", "Preço", "Fotos", "Visitas · leads", "No pátio", "Estado", ""].map(
                (h) => (
                  <th
                    key={h}
                    className="py-2.5 pr-3 text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {naTela.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-xs text-mt-neutral-700">
                  Nenhum veículo para este filtro.
                </td>
              </tr>
            ) : (
              naTela.map((l) => (
                <tr key={l.id} className="border-b border-mt-regua-fina align-middle">
                  <td className="py-2.5 pr-2">
                    <input
                      type="checkbox"
                      checked={selecionados.includes(l.id)}
                      onChange={() => alternarSelecao(l.id)}
                      aria-label={`Selecionar ${l.marca} ${l.modelo}`}
                      className="mt-foco h-3.5 w-3.5 cursor-pointer accent-[var(--mt-accent)]"
                    />
                  </td>

                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-10 w-14 flex-none overflow-hidden border border-mt-regua-fina bg-mt-bg">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={l.foto || "/logo.png"}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-extrabold tracking-[-.01em] text-mt-ink">
                          {l.marca} {l.modelo}
                        </div>
                        {/* Só aparece quando acrescenta: no feed o modelo já
                            costuma trazer a versão embutida. */}
                        {l.versao && (
                          <div className="truncate text-[11px] text-mt-neutral-700">{l.versao}</div>
                        )}
                        <div className="mt-0.5 flex flex-wrap gap-1.5 text-[9px] uppercase tracking-[.08em] text-mt-neutral-600">
                          {l.tipo && <span>{l.tipo}</span>}
                          {(l.perfisUso ?? []).length > 0 && (
                            <span>
                              ·{" "}
                              {(l.perfisUso ?? [])
                                .map((s) => PERFIS_DE_USO.find((p) => p.slug === s)?.nome ?? s)
                                .join(", ")}
                            </span>
                          )}
                          {l.destacado && <span className="text-mt-accent">· na home</span>}
                          {l.quickTags.length > 0 && <span>· {l.quickTags.length} destaque(s)</span>}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-2.5 pr-3 text-[11px] tabular-nums text-mt-neutral-800">{l.id}</td>

                  <td className="py-2.5 pr-3 text-[11px] tabular-nums text-mt-neutral-800">
                    {l.ano ?? "—"}
                    <span className="block text-mt-neutral-600">{quilometragem(l.quilometragem)}</span>
                  </td>

                  <td className="py-2.5 pr-3 text-[13px] font-extrabold tabular-nums text-mt-ink">
                    {dinheiro(l.preco)}
                  </td>

                  {/* O mínimo vem de `MINIMO_DE_FOTOS`, não do "8" digitado
                      aqui, que era o que estava. O número tem nome justamente
                      porque pode baixar — e no dia em que baixar, esta coluna
                      não pode continuar cobrando oito. */}
                  <td className="py-2.5 pr-3 text-[11px] tabular-nums">
                    <span
                      className={
                        l.fotos >= MINIMO_DE_FOTOS ? "text-mt-neutral-800" : "text-mt-accent-800"
                      }
                    >
                      {l.fotos}
                    </span>
                    {l.fotos < MINIMO_DE_FOTOS && (
                      <span className="text-mt-neutral-600">/{MINIMO_DE_FOTOS}</span>
                    )}
                  </td>

                  <td className="py-2.5 pr-3 text-[11px] tabular-nums text-mt-neutral-800">
                    {l.visitas === null ? "—" : l.visitas}
                    <span className="text-mt-neutral-600"> · {l.leads}</span>
                  </td>

                  {/* "—" é idade desconhecida (linha anterior à migração
                      `first_seen_at`), não zero. Acima de 60 dias a cor sobe:
                      é o dobro do giro de ~45 dias que o plano usa como régua,
                      e é este número que decide realocação de verba. */}
                  <td className="py-2.5 pr-3 text-[11px] tabular-nums">
                    {l.diasEmEstoque === null ? (
                      <span className="text-mt-neutral-600">—</span>
                    ) : (
                      <span
                        className={
                          l.diasEmEstoque >= 60
                            ? "font-bold text-mt-accent"
                            : "text-mt-neutral-800"
                        }
                      >
                        {l.diasEmEstoque} {l.diasEmEstoque === 1 ? "dia" : "dias"}
                      </span>
                    )}
                  </td>

                  <td className="py-2.5 pr-3">
                    <span
                      className={`inline-block border px-2 py-1 text-[9px] font-bold uppercase tracking-[.1em] ${CLASSE_DO_ESTADO[l.estado]}`}
                    >
                      {ROTULO_DO_ESTADO[l.estado]}
                    </span>
                    {/* O motivo, com o texto que `bloqueiosDePublicacao` já
                        escreve ("2 de 8 fotos — as fotos vêm do RevendaMais").
                        Etiqueta sem motivo mandaria o operador abrir o editor
                        de cada carro para descobrir o que falta.

                        Só neste estado: em "vendido" e "fora do feed" a
                        pendência de fotos existe, mas não é o que tirou o carro
                        do ar, e repeti-la ali afogaria o motivo verdadeiro. É a
                        mesma escolha do editor A15, que filtra por `bloqueia`
                        antes de dizer "Fora da vitrine". */}
                    {l.estado === "fora_da_vitrine" && (
                      <ul className="m-0 mt-1 max-w-[200px] list-none p-0 text-[9px] leading-snug text-mt-accent-800">
                        {l.bloqueios
                          .filter((b) => b.bloqueia)
                          .map((b) => (
                            <li key={b.id}>{b.texto}</li>
                          ))}
                      </ul>
                    )}
                    {l.divergente && (
                      <span
                        className="mt-1 block text-[9px] font-bold uppercase tracking-[.08em] text-mt-accent"
                        title="Marcado como vendido no painel antigo, mas a coluna do banco segue disponível — o site continua anunciando."
                      >
                        divergente
                      </span>
                    )}
                  </td>

                  <td className="py-2.5 text-right">
                    <Link
                      href={`/admin/estoque/${l.id}`}
                      className="mt-foco whitespace-nowrap border border-mt-regua px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-mt-neutral-700 no-underline hover:border-mt-accent hover:text-mt-ink"
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <span className="text-[11px] text-mt-neutral-700">
          Mostrando {naTela.length} de {filtradas.length} · ordenado por data de entrada
        </span>
        {visiveis < filtradas.length && (
          <button
            onClick={() => setVisiveis((v) => v + PASSO_DA_PAGINA)}
            className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[11px]"
          >
            Carregar mais {Math.min(PASSO_DA_PAGINA, filtradas.length - visiveis)}
          </button>
        )}
      </div>

      {/* O que o doc desenha e o backend não sustenta — nomeado, não simulado. */}
      <div className="border-l-[3px] border-mt-regua bg-mt-surface px-4 py-3.5">
        <div className="mt-rotulo mb-2">Ainda fora desta tela</div>
        <p className="text-xs leading-relaxed text-mt-neutral-800">
          A coluna <strong>FIPE</strong> do desenho não existe como dado no banco.{" "}
          <strong>Rascunho</strong> e <strong>reservado</strong> dependem do fluxo de revisão, que
          ainda não foi construído. <strong>Importar planilha</strong> e{" "}
          <strong>novo veículo</strong> pressupõem cadastro fora do feed do RevendaMais.
          {!visitasDisponiveis && (
            <>
              {" "}
              A coluna de <strong>visitas</strong> aparece como “—” porque o GA4 está sem
              credencial de leitura neste ambiente; os leads por veículo são dado real.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
