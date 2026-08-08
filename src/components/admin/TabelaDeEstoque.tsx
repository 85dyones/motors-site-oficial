"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CARROCERIAS, PERFIS_DE_USO } from "../../lib/classificacaoVeiculo";
import {
  contarPorEstado,
  filtrarLinhas,
  ROTULO_DO_ESTADO,
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
 *    Aqui os estados são os que o banco sustenta: publicado, vendido e fora do
 *    feed.
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
}

const FILTROS: Array<{ id: FiltroDeEstado; rotulo: string }> = [
  { id: "todos", rotulo: "Todos" },
  { id: "publicado", rotulo: "Publicados" },
  { id: "vendido", rotulo: "Vendidos" },
  { id: "fora_do_feed", rotulo: "Fora do feed" },
];

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

  const semSelecao = selecionadosVisiveis.length === 0 || salvando;

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-regua pb-5">
        <div className="flex flex-col gap-1.5">
          <div className="mt-rotulo mt-rotulo-accent">Estoque</div>
          <h1 className="mt-titulo text-3xl md:text-4xl">{contagem.todos} veículos</h1>
          <p className="mt-1 max-w-[620px] text-sm text-mt-neutral-800">
            O estoque entra pelo sync do RevendaMais. Aqui se decide o que a vitrine mostra,
            como o carro é classificado e o que vai ao carrossel da home.
          </p>
        </div>
        <Link
          href="/estoque"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-btn mt-btn-contorno mt-foco px-4 py-2.5 text-[11px] no-underline"
        >
          Ver no site
        </Link>
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

          <button
            disabled={semSelecao}
            onClick={() =>
              aplicarNoBanco({ vendido: true }, "Marcados como vendidos", (l) => ({
                ...l,
                estado: "vendido",
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
                estado: "publicado",
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

          <select
            disabled={semSelecao}
            defaultValue=""
            onChange={(e) => {
              const valor = e.target.value;
              e.target.value = "";
              if (valor === "") return;
              aplicarNoBanco({ perfil_uso: valor }, `Perfil definido como ${valor}`, (l) => ({
                ...l,
                perfilUso: valor,
              }));
            }}
            aria-label="Definir perfil de uso dos selecionados"
            className="mt-foco cursor-pointer border border-mt-regua-fina bg-mt-bg px-3 py-2 text-[11px] text-mt-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <option value="">Definir perfil de uso…</option>
            {PERFIS_DE_USO.map((p) => (
              <option key={p} value={p}>
                {p}
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
              {["Veículo", "Código", "Ano · KM", "Preço", "Fotos", "Visitas · leads", "Estado", ""].map(
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
                <td colSpan={9} className="py-12 text-center text-xs text-mt-neutral-700">
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
                          {l.perfilUso && <span>· {l.perfilUso}</span>}
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

                  <td className="py-2.5 pr-3 text-[11px] tabular-nums">
                    <span className={l.fotos >= 8 ? "text-mt-neutral-800" : "text-mt-accent-800"}>
                      {l.fotos}
                    </span>
                    {l.fotos < 8 && <span className="text-mt-neutral-600">/8</span>}
                  </td>

                  <td className="py-2.5 pr-3 text-[11px] tabular-nums text-mt-neutral-800">
                    {l.visitas === null ? "—" : l.visitas}
                    <span className="text-mt-neutral-600"> · {l.leads}</span>
                  </td>

                  <td className="py-2.5 pr-3">
                    <span
                      className={`inline-block border px-2 py-1 text-[9px] font-bold uppercase tracking-[.1em] ${
                        l.estado === "publicado"
                          ? "border-mt-regua text-mt-neutral-800"
                          : l.estado === "vendido"
                            ? "border-mt-ink bg-mt-ink text-mt-bg"
                            : "border-mt-accent-300 text-mt-accent-800"
                      }`}
                    >
                      {ROTULO_DO_ESTADO[l.estado]}
                    </span>
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
