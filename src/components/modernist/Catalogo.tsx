"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { QuickTag, StockOverrides, Veiculo } from "../../types";
import { getVeiculoPdpUrl } from "../../lib/supabase";
import {
  checkTagMatchesVehicle,
  precoVigente,
  resolveTipoCombustivel,
} from "../../lib/regrasEstoque";
import { slugifyTag } from "../../lib/tagUtils";
import { CardVeiculo, formatarPreco } from "./primitivos";

/**
 * Catálogo — tela 02 do design doc.
 *
 * Coluna de filtros em régua, densidade alta, sem cartão flutuante. Filtrar
 * aqui é ordenar o que já está à vista: o rótulo com a contagem total e o
 * botão de limpar ficam sempre visíveis, e nenhum filtro remove o caminho de
 * volta para o estoque inteiro.
 */

const PAGINA = 9;

type Ordenacao = "recentes" | "menor-preco" | "menor-km";

const ORDENACOES: { id: Ordenacao; rotulo: string }[] = [
  { id: "recentes", rotulo: "MAIS RECENTES" },
  { id: "menor-preco", rotulo: "MENOR PREÇO" },
  { id: "menor-km", rotulo: "MENOR KM" },
];

interface GrupoFiltro {
  chave: string;
  titulo: string;
  opcoes: { valor: string; rotulo: string; total: number }[];
}

export default function Catalogo({
  estoque,
  quickTags,
  stockOverrides,
}: {
  estoque: Veiculo[];
  quickTags: QuickTag[];
  stockOverrides: StockOverrides;
}) {
  const searchParams = useSearchParams();

  // Filtros vindos da busca da home entram como estado inicial
  const [selecionados, setSelecionados] = useState<Record<string, string[]>>(() => {
    const inicial: Record<string, string[]> = {};
    for (const chave of ["marca", "modelo", "ano", "cambio", "carroceria", "combustivel", "destaque"]) {
      const valor = searchParams.get(chave);
      if (valor) inicial[chave] = [valor];
    }
    return inicial;
  });
  const [precoMax, setPrecoMax] = useState<number | null>(() => {
    const v = searchParams.get("precoMax");
    return v ? Number(v) : null;
  });
  const [ordem, setOrdem] = useState<Ordenacao>("recentes");
  const [visiveis, setVisiveis] = useState(PAGINA);

  const alternar = (chave: string, valor: string) => {
    setSelecionados((prev) => {
      const atuais = prev[chave] ?? [];
      const proximos = atuais.includes(valor)
        ? atuais.filter((v) => v !== valor)
        : [...atuais, valor];
      const copia = { ...prev };
      if (proximos.length === 0) delete copia[chave];
      else copia[chave] = proximos;
      return copia;
    });
    setVisiveis(PAGINA);
  };

  const limparTudo = () => {
    setSelecionados({});
    setPrecoMax(null);
    setVisiveis(PAGINA);
  };

  const valorDoCampo = (v: Veiculo, chave: string): string => {
    switch (chave) {
      case "marca":
        return v.marca ?? "";
      case "modelo":
        return v.modelo ?? "";
      case "ano":
        return String(v.ano ?? "");
      case "cambio":
        return v.cambio ?? "";
      case "carroceria":
        return v.tipo ?? "";
      case "combustivel":
        return resolveTipoCombustivel(v);
      default:
        return "";
    }
  };

  const passaNosFiltros = (v: Veiculo, ignorar?: string): boolean => {
    for (const [chave, valores] of Object.entries(selecionados)) {
      if (chave === ignorar || valores.length === 0) continue;
      if (chave === "destaque") {
        const casa = valores.some((slug) => {
          const tag = quickTags.find((t) => (slugifyTag(t.name) || t.id) === slug);
          return tag ? checkTagMatchesVehicle(tag, v, stockOverrides) : false;
        });
        if (!casa) return false;
      } else if (!valores.includes(valorDoCampo(v, chave))) {
        return false;
      }
    }
    if (ignorar !== "preco" && precoMax !== null && precoVigente(v) > precoMax) {
      return false;
    }
    return true;
  };

  /** Contagem por opção calculada ignorando o próprio grupo, para o número
      ao lado do rótulo não zerar assim que o usuário marca uma caixa. */
  const grupos = useMemo<GrupoFiltro[]>(() => {
    const contar = (chave: string) => {
      const base = estoque.filter((v) => passaNosFiltros(v, chave));
      const mapa = new Map<string, number>();
      for (const v of base) {
        const valor = valorDoCampo(v, chave);
        if (!valor) continue;
        mapa.set(valor, (mapa.get(valor) ?? 0) + 1);
      }
      return [...mapa.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([valor, total]) => ({ valor, rotulo: valor, total }));
    };

    const destaques = quickTags
      .map((tag) => {
        const slug = slugifyTag(tag.name) || tag.id;
        const total = estoque.filter(
          (v) =>
            passaNosFiltros(v, "destaque") &&
            checkTagMatchesVehicle(tag, v, stockOverrides),
        ).length;
        // Caixa alta como os outros grupos do filtro, que vêm de campo do
        // banco já normalizado. O nome do destaque é digitado no painel.
        return { valor: slug, rotulo: tag.name.toUpperCase(), total };
      })
      .filter((o) => o.total > 0);

    return [
      { chave: "destaque", titulo: "DESTAQUES RÁPIDOS", opcoes: destaques },
      { chave: "carroceria", titulo: "CARROCERIA", opcoes: contar("carroceria") },
      { chave: "marca", titulo: "MARCA", opcoes: contar("marca") },
      { chave: "cambio", titulo: "CÂMBIO", opcoes: contar("cambio") },
      { chave: "combustivel", titulo: "COMBUSTÍVEL", opcoes: contar("combustivel") },
    ].filter((g) => g.opcoes.length > 0);
  }, [estoque, selecionados, precoMax, quickTags, stockOverrides]);

  const filtrados = useMemo(() => {
    const lista = estoque.filter((v) => passaNosFiltros(v));
    switch (ordem) {
      case "menor-preco":
        return [...lista].sort((a, b) => precoVigente(a) - precoVigente(b));
      case "menor-km":
        return [...lista].sort((a, b) => a.quilometragem - b.quilometragem);
      default:
        return lista;
    }
  }, [estoque, selecionados, precoMax, ordem]);

  const chipsAtivos = [
    ...Object.entries(selecionados).flatMap(([chave, valores]) =>
      valores.map((valor) => {
        const grupo = grupos.find((g) => g.chave === chave);
        const opcao = grupo?.opcoes.find((o) => o.valor === valor);
        return { chave, valor, rotulo: (opcao?.rotulo ?? valor).toUpperCase() };
      }),
    ),
    ...(precoMax !== null
      ? [{ chave: "preco", valor: "", rotulo: `ATÉ ${formatarPreco(precoMax)}` }]
      : []),
  ];

  const totalFiltrado = filtrados.length;
  const mostrando = Math.min(visiveis, totalFiltrado);

  return (
    <div className="font-modernist">
      {/* Barra de controle.
          A trilha e o <h1> saíram daqui em 2026-08-25 e passaram para
          `src/app/estoque/page.tsx`, que é server component. Este arquivo usa
          `useSearchParams()` dentro de um <Suspense>: o servidor entrega só o
          fallback, e o HTML de /estoque saía sem <h1> e sem um único link de
          veículo — medido em produção. Título e trilha são conteúdo, não
          interação; não podiam depender do JavaScript rodar.

          O que ficou aqui é o que de fato reage ao usuário: a contagem
          FILTRADA (que muda a cada caixa marcada, e por isso nunca poderia ser
          o <h1>) e a ordenação. */}
      <div className="border-b-2 border-mt-regua px-[18px] pb-5 pt-6 lg:px-10 lg:pb-5 lg:pt-7">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex items-baseline gap-2">
            <span className="mt-titulo text-[26px] lg:text-[32px]">{totalFiltrado}</span>
            <span className="text-[11px] font-semibold tracking-[.14em] text-mt-neutral-600">
              {totalFiltrado === 1 ? "VEÍCULO NA SELEÇÃO" : "VEÍCULOS NA SELEÇÃO"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold tracking-[.1em]">
            <span className="text-mt-neutral-600">ORDENAR:</span>
            {ORDENACOES.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setOrdem(o.id)}
                aria-pressed={ordem === o.id}
                className={`mt-foco border-b-2 pb-[3px] ${
                  ordem === o.id
                    ? "border-mt-accent text-mt-ink"
                    : "border-transparent text-mt-neutral-600 hover:text-mt-ink"
                }`}
              >
                {o.rotulo}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-stretch">
        {/* Coluna de filtros */}
        <aside className="shrink-0 px-[18px] pb-8 lg:w-[290px] lg:border-r-2 lg:border-mt-regua lg:py-0 lg:pl-10 lg:pr-7">
          <div className="flex items-baseline justify-between border-b-2 border-mt-regua pb-3.5 pt-5">
            <span className="text-[11px] font-extrabold tracking-[.16em]">FILTROS</span>
            {chipsAtivos.length > 0 && (
              <button
                type="button"
                onClick={limparTudo}
                className="mt-foco text-[11px] font-semibold text-mt-accent"
              >
                LIMPAR ({chipsAtivos.length})
              </button>
            )}
          </div>

          {grupos.map((grupo) => (
            <fieldset key={grupo.chave} className="border-b border-mt-regua-fina pb-4 pt-5">
              <legend className="mb-3 text-[10px] font-semibold tracking-[.16em] text-mt-neutral-600">
                {grupo.titulo}
              </legend>
              <div className="flex flex-col gap-2.5">
                {grupo.opcoes.slice(0, 8).map((opcao) => {
                  const marcado = (selecionados[grupo.chave] ?? []).includes(opcao.valor);
                  return (
                    <label
                      key={opcao.valor}
                      className="flex cursor-pointer items-center gap-2.5 text-[13px]"
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => alternar(grupo.chave, opcao.valor)}
                        className="peer sr-only"
                      />
                      {/* O input real é sr-only: o anel de foco tem que vir do
                          `peer`, senão o teclado percorre os filtros às cegas. */}
                      <span
                        aria-hidden="true"
                        className={`h-3.5 w-3.5 shrink-0 border-[1.5px] outline-mt-accent peer-focus-visible:outline-2 peer-focus-visible:outline-solid peer-focus-visible:outline-offset-2 ${
                          marcado
                            ? "border-mt-accent bg-mt-accent"
                            : "border-mt-regua bg-mt-bg"
                        }`}
                      />
                      <span className="mr-auto">{opcao.rotulo}</span>
                      <span className="text-[11px] text-mt-neutral-500">{opcao.total}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <div className="py-5">
            <label
              htmlFor="faixa-preco"
              className="mb-3.5 block text-[10px] font-semibold tracking-[.16em] text-mt-neutral-600"
            >
              PREÇO MÁXIMO
            </label>
            <input
              id="faixa-preco"
              type="range"
              min={50000}
              max={1000000}
              step={10000}
              value={precoMax ?? 1000000}
              onChange={(e) => {
                const v = Number(e.target.value);
                setPrecoMax(v >= 1000000 ? null : v);
                setVisiveis(PAGINA);
              }}
              className="mt-range mt-foco"
            />
            <div className="mt-3 flex justify-between text-xs font-semibold">
              <span>R$ 50 mil</span>
              <span>{precoMax === null ? "Sem teto" : formatarPreco(precoMax)}</span>
            </div>
          </div>
        </aside>

        {/* Grade */}
        <div className="min-w-0 flex-1 px-[18px] pb-16 pt-6 lg:px-10 lg:pb-[70px]">
          {chipsAtivos.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {chipsAtivos.map((chip) => (
                <button
                  key={`${chip.chave}-${chip.valor}`}
                  type="button"
                  onClick={() =>
                    chip.chave === "preco"
                      ? setPrecoMax(null)
                      : alternar(chip.chave, chip.valor)
                  }
                  aria-label={`Remover filtro ${chip.rotulo}`}
                  className="mt-foco flex items-center gap-2 border border-mt-regua px-3 py-1.5 text-xs font-semibold"
                >
                  {chip.rotulo}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    className="h-3 w-3 text-mt-accent"
                  >
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {totalFiltrado === 0 ? (
            <div className="border-t-2 border-mt-regua py-16 text-center">
              <p className="m-0 text-[17px] font-extrabold">
                Nenhum veículo com essa combinação de filtros.
              </p>
              <button
                type="button"
                onClick={limparTudo}
                className="mt-btn mt-btn-contorno mt-foco mt-6"
              >
                VER TODO O ESTOQUE
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-x-7 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-y-11">
                {filtrados.slice(0, visiveis).map((v, i) => (
                  <CardVeiculo
                    key={v.id}
                    veiculo={v}
                    href={getVeiculoPdpUrl(v)}
                    etiqueta={v.status_tag || undefined}
                    contagemFotos={
                      v.web_full_images?.length
                        ? `${v.web_full_images.length} fotos`
                        : undefined
                    }
                    prioridade={i < 3}
                  />
                ))}
              </div>

              <div className="mt-12 flex flex-wrap items-center gap-4 border-t-2 border-mt-regua pt-5">
                {mostrando < totalFiltrado && (
                  <button
                    type="button"
                    onClick={() => setVisiveis((n) => n + PAGINA)}
                    className="mt-btn mt-btn-tinta mt-foco"
                  >
                    CARREGAR MAIS {Math.min(PAGINA, totalFiltrado - mostrando)}
                  </button>
                )}
                <span className="text-xs text-mt-neutral-600">
                  Mostrando {mostrando} de {totalFiltrado}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
