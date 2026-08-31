"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Texto das páginas de hub.
 *
 * ---------------------------------------------------------------------------
 * A tela começa do que está no ar, e essa é a decisão de desenho
 * ---------------------------------------------------------------------------
 * São 103 hubs. Uma tela com campo em branco obrigaria a escrever do zero, e
 * ninguém escreveria — a tela viraria enfeite e as páginas ficariam com o
 * texto automático de sempre. Aqui o campo já vem preenchido com o que o site
 * gera hoje: o trabalho é CORRIGIR uma frase, não redigir uma página.
 *
 * Por isso também o botão "Voltar ao automático", que apaga a linha em vez de
 * gravar vazio: a página volta a acompanhar o estoque sozinha, que é o certo
 * para 98 dos 103.
 *
 * Parágrafos separados por linha em branco, e não um campo por parágrafo: é
 * como as pessoas já escrevem, e o número de parágrafos passa a ser escolha de
 * quem escreve em vez de decisão da tela.
 */

interface HubDaLista {
  caminho: string;
  rotulo: string;
  tipo: string;
  veiculos: number;
  proprio: boolean;
}

interface DetalheDoHub {
  hub: {
    caminho: string;
    rotulo: string;
    tipo: string;
    veiculos: number;
    tituloGerado: string;
    paragrafosGerados: string[];
  };
  editado: { titulo: string | null; paragrafos: string[] } | null;
}

const ROTULO_DO_TIPO: Record<string, string> = {
  marca: "Marca",
  modelo: "Modelo",
  carroceria: "Carroceria",
  perfil: "Perfil de uso",
  faixa: "Faixa de preço",
};

const rotuloCampo = "text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700";

export default function TextosDosHubs() {
  const [hubs, setHubs] = useState<HubDaLista[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [soProprios, setSoProprios] = useState(false);

  const [aberto, setAberto] = useState<DetalheDoHub | null>(null);
  const [titulo, setTitulo] = useState("");
  const [corpo, setCorpo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");

  const carregarLista = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await fetch("/api/hubs/textos");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao carregar as páginas");
      setHubs(d.hubs ?? []);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarLista();
  }, [carregarLista]);

  const abrir = async (caminho: string) => {
    setAviso("");
    setErro("");
    try {
      const r = await fetch(`/api/hubs/textos?caminho=${encodeURIComponent(caminho)}`);
      const d: DetalheDoHub & { error?: string } = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao abrir");
      setAberto(d);
      // O campo nasce com o que ESTÁ no ar: o editado quando existe, senão o
      // gerado. Nunca em branco — ver a nota do topo.
      setTitulo(d.editado?.titulo ?? d.hub.tituloGerado);
      setCorpo((d.editado?.paragrafos?.length ? d.editado.paragrafos : d.hub.paragrafosGerados).join("\n\n"));
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const salvar = async (voltarAoAutomatico = false) => {
    if (!aberto) return;
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      const r = await fetch("/api/hubs/textos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caminho: aberto.hub.caminho,
          titulo: voltarAoAutomatico ? "" : titulo,
          paragrafos: voltarAoAutomatico
            ? []
            : corpo.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao salvar");
      setAviso(
        d.voltouAoAutomatico
          ? "Voltou ao texto automático — a página acompanha o estoque de novo."
          : "Salvo. A página passa a mostrar este texto.",
      );
      if (voltarAoAutomatico) {
        setTitulo(aberto.hub.tituloGerado);
        setCorpo(aberto.hub.paragrafosGerados.join("\n\n"));
      }
      carregarLista();
      setTimeout(() => setAviso(""), 5000);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return hubs.filter(
      (h) =>
        (!soProprios || h.proprio) &&
        (!q || h.rotulo.toLowerCase().includes(q) || h.caminho.toLowerCase().includes(q)),
    );
  }, [hubs, busca, soProprios]);

  const comTextoProprio = hubs.filter((h) => h.proprio).length;

  return (
    <div className="flex w-full flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-[-.03em]">Texto das páginas</h1>
        <p className="mt-1 text-xs text-mt-neutral-800">
          Marca, modelo, carroceria, perfil e faixa de preço. Sem texto próprio, a página
          escreve sozinha a partir do estoque — o que vale para a maioria.{" "}
          <strong className="tabular-nums">{comTextoProprio}</strong> de{" "}
          <strong className="tabular-nums">{hubs.length}</strong> têm texto escrito à mão.
        </p>
      </div>

      {erro && (
        <div className="border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800">
          {erro}
        </div>
      )}
      {aviso && (
        <div className="border-l-[3px] border-mt-ink bg-mt-surface px-4 py-3 text-xs text-mt-neutral-800">
          {aviso}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Filtrar por nome ou endereço"
          className="mt-campo-caixa mt-foco flex-1 min-w-[220px]"
        />
        <label className="flex items-center gap-2 text-[11px] text-mt-neutral-800">
          <input
            type="checkbox"
            checked={soProprios}
            onChange={(e) => setSoProprios(e.target.checked)}
          />
          Só as que têm texto próprio
        </label>
      </div>

      {carregando ? (
        <p className="text-xs text-mt-neutral-700">Carregando as páginas…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="max-h-[560px] overflow-y-auto border border-mt-regua-fina">
            {visiveis.map((h) => (
              <button
                key={h.caminho}
                onClick={() => abrir(h.caminho)}
                className={`mt-foco flex w-full flex-col items-start gap-0.5 border-b border-mt-regua-fina px-3 py-2 text-left hover:bg-mt-surface ${
                  aberto?.hub.caminho === h.caminho ? "bg-mt-surface" : ""
                }`}
              >
                <span className="flex w-full items-baseline gap-2">
                  <span className="text-[12px] font-semibold">{h.rotulo}</span>
                  {h.proprio && (
                    <span className="text-[9px] font-bold uppercase tracking-[.1em] text-mt-accent">
                      próprio
                    </span>
                  )}
                  <span className="ml-auto text-[10px] tabular-nums text-mt-neutral-700">
                    {h.veiculos}
                  </span>
                </span>
                <span className="text-[10px] text-mt-neutral-700">
                  {ROTULO_DO_TIPO[h.tipo] ?? h.tipo} · {h.caminho}
                </span>
              </button>
            ))}
            {visiveis.length === 0 && (
              <p className="px-3 py-4 text-[11px] text-mt-neutral-700">
                Nenhuma página com esse filtro.
              </p>
            )}
          </div>

          {aberto ? (
            <div className="flex flex-col gap-4 border border-mt-regua-fina p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-lg font-extrabold tracking-[-.02em]">{aberto.hub.rotulo}</h2>
                <a
                  href={aberto.hub.caminho}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-foco text-[11px] text-mt-accent underline"
                >
                  ver no site ↗
                </a>
                <span className="ml-auto text-[11px] tabular-nums text-mt-neutral-700">
                  {aberto.hub.veiculos} veículo(s) hoje
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={rotuloCampo} htmlFor="h-titulo">
                  Título da página (o H1)
                </label>
                <input
                  id="h-titulo"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  className="mt-campo-caixa mt-foco font-semibold"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={rotuloCampo} htmlFor="h-corpo">
                  Texto — uma linha em branco separa os parágrafos
                </label>
                <textarea
                  id="h-corpo"
                  value={corpo}
                  onChange={(e) => setCorpo(e.target.value)}
                  rows={14}
                  className="mt-campo-caixa mt-foco text-[13px] leading-relaxed"
                />
                <span className="text-[11px] text-mt-neutral-700">
                  {corpo.split(/\n\s*\n/).filter((p) => p.trim()).length} parágrafo(s).
                  {aberto.editado
                    ? " Esta página já tem texto próprio."
                    : " Começando do texto que o site gera hoje."}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-mt-regua pt-3">
                <button
                  onClick={() => salvar(false)}
                  disabled={salvando}
                  className="mt-btn mt-btn-primario mt-foco cursor-pointer px-5 py-2.5 text-[11px] disabled:opacity-45"
                >
                  {salvando ? "Salvando…" : "Salvar"}
                </button>
                {/* Apaga a linha em vez de gravar vazio: a página volta a
                    acompanhar o estoque, que é o comportamento certo para a
                    esmagadora maioria dos hubs. */}
                <button
                  onClick={() => salvar(true)}
                  disabled={salvando || !aberto.editado}
                  title={
                    aberto.editado
                      ? "Apaga o texto próprio; a página volta a se escrever sozinha"
                      : "Esta página já usa o texto automático"
                  }
                  className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[11px] disabled:opacity-45"
                >
                  Voltar ao automático
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center border border-dashed border-mt-regua-fina p-8 text-center text-[12px] text-mt-neutral-700">
              Escolha uma página à esquerda para ver e corrigir o texto dela.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
