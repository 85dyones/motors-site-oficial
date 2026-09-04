"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { QuickTag, StockOverrides, Veiculo } from "../../types";
import { getVeiculoPdpUrl } from "../../lib/supabase";
import {
  checkTagMatchesVehicle,
  precoVigente,
  resolveTipoCombustivel,
} from "../../lib/regrasEstoque";
import { slugifyTag } from "../../lib/tagUtils";
import { mostrarLimparTudo, painelDeFiltro, rotuloDosResultados } from "../../lib/vitrine";
import { CardVeiculo, formatarPreco } from "./primitivos";

/**
 * Catálogo — tela 02 do design doc.
 *
 * Coluna de filtros em régua, densidade alta, sem cartão flutuante. Filtrar
 * aqui é ordenar o que já está à vista: o rótulo com a contagem total e o
 * botão de limpar ficam sempre visíveis, e nenhum filtro remove o caminho de
 * volta para o estoque inteiro.
 *
 * No celular a coluna vira um bloco empilhado ACIMA do primeiro carro — o
 * cliente rolava a lista de filtros inteira antes de ver a vitrine. Desde
 * 2026-09-04 ela nasce recolhida atrás de um botão, e só abaixo do `lg`: no
 * desktop o filtro continua sendo a coluna da esquerda, sem botão nenhum. A
 * regra desse par vive em `lib/vitrine.ts`, com teste de comportamento.
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
  // Recolhido é o estado inicial, e é o mesmo nos dois lados da hidratação:
  // nada aqui mede a janela. Quem está no desktop nunca vê diferença — lá o
  // painel não obedece a este estado.
  const [filtroAberto, setFiltroAberto] = useState(false);
  const botaoDoFiltro = useRef<HTMLButtonElement>(null);
  const regiaoDeResultados = useRef<HTMLDivElement>(null);

  /**
   * Fecha o painel e devolve o foco ao alternador.
   *
   * O botão de fechar vive DENTRO do `<aside>` que ele faz virar
   * `display:none`. Sem esta linha, quem chega nele por teclado ou leitor de
   * tela some com o próprio elemento focado: o foco cai no `<body>` e o Tab
   * seguinte recomeça do topo do documento (WCAG 2.4.3). Achado na revisão de
   * 2026-09-04.
   *
   * O `Header` não sofre disso porque lá quem fecha é o próprio alternador,
   * que continua montado. Aqui são dois elementos, e um deles desaparece.
   */
  const fecharFiltro = () => {
    setFiltroAberto(false);
    botaoDoFiltro.current?.focus();
  };

  /**
   * Limpa os filtros a partir da régua de chips, sem largar o foco.
   *
   * Mesmo motivo do `fecharFiltro`, e aqui é por construção: a função deste
   * botão é tornar falsa a própria precondição — sem chip ativo a régua inteira
   * desmonta e ele vai junto. O alternador do filtro é o vizinho que sobrevive.
   */
  const limparTudoSemPerderOFoco = () => {
    limparTudo();
    botaoDoFiltro.current?.focus();
  };

  /**
   * Zera os filtros e leva o foco para a região de resultados.
   *
   * Terceiro caso do mesmo defeito, e o primeiro que não podia copiar o
   * remédio dos outros dois. O `LIMPAR (N)` do topo do painel e o `VER TODO O
   * ESTOQUE` do estado vazio também tornam falsa a própria condição de
   * renderização e saem do DOM — mas, ao contrário de `fecharFiltro` e de
   * `limparTudoSemPerderOFoco`, esses dois aparecem NAS DUAS LARGURAS.
   *
   * Por isso `botaoDoFiltro` não serve de destino aqui: ele é o "FILTROS", que
   * tem `lg:hidden`. No desktop é `display:none`, e `.focus()` em elemento
   * escondido não faz nada e não devolve erro — o foco seguiria caindo no
   * `<body>` (WCAG 2.4.3) exatamente onde ninguém olhou, com o celular
   * consertado escondendo a outra metade.
   *
   * O destino é a grade, que existe nas duas larguras e é o que acabou de
   * mudar: nomeada como região, ela também anuncia o estoque de volta para
   * quem usa leitor de tela, em vez de só não perder o foco.
   *
   * `flushSync` e não `limparTudo()` solto. O React agenda o estado e devolve o
   * controle ANTES de repintar, então o `.focus()` da linha seguinte
   * aconteceria com a região ainda carregando o nome velho — e o nome é lido no
   * instante do foco, não depois. Sem o despacho, quem limpa a partir do estado
   * vazio ouve "Resultados: 0 veículos" no exato momento em que os 36 voltaram
   * para a tela. É o único lugar do arquivo que precisa da pintura síncrona, e
   * é porque aqui o foco e o texto têm que chegar juntos.
   */
  const limparTudoComFocoNosResultados = () => {
    flushSync(() => limparTudo());
    regiaoDeResultados.current?.focus();
  };

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
  const filtro = painelDeFiltro(filtroAberto);

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

        {/* Botão de filtro — só abaixo do `lg`.
            Ocupa o mesmo lugar e a mesma altura do "VER TODO O ESTOQUE" que o
            fallback do <Suspense> serve no HTML: os dois se trocam na
            hidratação sem empurrar a grade para baixo. A contagem de filtros
            ativos vem junto porque painel recolhido não pode esconder que a
            vitrine está filtrada. */}
        <button
          ref={botaoDoFiltro}
          type="button"
          onClick={() => setFiltroAberto((aberto) => !aberto)}
          aria-expanded={filtroAberto}
          aria-controls="painel-de-filtros"
          className={`mt-foco mt-4 flex w-full items-center justify-between border-2 border-mt-regua px-4 py-2.5 text-[11px] font-extrabold tracking-[.16em] ${filtro.classeDoBotao}`}
        >
          <span className="flex items-center gap-2">
            {filtro.rotulo}
            {chipsAtivos.length > 0 && (
              <span className="text-mt-accent">({chipsAtivos.length})</span>
            )}
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-3 w-3 text-mt-accent transition-transform ${
              filtroAberto ? "rotate-180" : ""
            }`}
          >
            <path d="M5 8l7 7 7-7" />
          </svg>
        </button>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-stretch">
        {/* Coluna de filtros.
            `filtro.classe` esconde no celular e mantém no desktop. O elemento
            NÃO sai da árvore: decidir isso em JavaScript exigiria medir a
            janela no cliente — divergência de hidratação e piscar de campos na
            primeira pintura, a armadilha que `BuscaRegua.tsx` documenta no
            `soDesktop`. Escondido por CSS, o que o cliente marcou continua no
            estado e volta intacto quando ele reabre. */}
        <aside
          id="painel-de-filtros"
          className={`${filtro.classe} shrink-0 px-[18px] pb-8 lg:w-[290px] lg:border-r-2 lg:border-mt-regua lg:py-0 lg:pl-10 lg:pr-7`}
        >
          <div className="flex items-baseline justify-between border-b-2 border-mt-regua pb-3.5 pt-5">
            <span className="text-[11px] font-extrabold tracking-[.16em]">FILTROS</span>
            {chipsAtivos.length > 0 && (
              <button
                type="button"
                onClick={limparTudoComFocoNosResultados}
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

          {/* A saída do painel no celular, com o resultado já contado.
              Sem ela o cliente que abriu o filtro precisa rolar de volta até o
              topo para achar o botão que fecha — e a contagem, que é a
              resposta ao que ele acabou de marcar, fica fora da tela.

              `fecharFiltro` e não `setFiltroAberto(false)`: este botão some
              junto com o painel, e o foco precisa ir para algum lugar. */}
          <button
            type="button"
            onClick={fecharFiltro}
            className="mt-btn mt-btn-tinta mt-foco w-full lg:hidden"
          >
            VER {totalFiltrado} {totalFiltrado === 1 ? "VEÍCULO" : "VEÍCULOS"}
          </button>
        </aside>

        {/* Grade — e o alvo de foco de quem limpa os filtros.
            `tabIndex={-1}` põe o `<div>` ao alcance de `.focus()` sem colocar a
            grade inteira na ordem de Tab; `role` e `aria-label` existem para o
            foco chegar num elemento que sabe se anunciar, e não num contêiner
            mudo. Nada aqui pode recolher por largura: é o único destino que
            serve ao desktop e ao celular ao mesmo tempo — ver
            `limparTudoComFocoNosResultados`. */}
        <div
          ref={regiaoDeResultados}
          tabIndex={-1}
          role="region"
          aria-label={rotuloDosResultados(totalFiltrado)}
          className="mt-foco min-w-0 flex-1 px-[18px] pb-16 pt-6 lg:px-10 lg:pb-[70px]"
        >
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

              {/* O "LIMPAR (N)" do painel nasce escondido no celular junto com
                  o painel — desfazer tudo custaria um toque a mais, ou um chip
                  de cada vez. Aqui ele volta, fora do painel.

                  `mostrarLimparTudo` decide, e inclui o estado do painel: com
                  ele ABERTO no celular os dois botões de limpar estariam na
                  mesma tela. A primeira versão disto dizia em comentário que
                  aparecia "só onde some", e não era verdade — a revisão de
                  04/09 pegou.

                  `limparTudo` sozinho no `onClick` seria o mesmo defeito de
                  foco que o `fecharFiltro` corrigiu, e pior: aqui é por
                  construção. Zerar os filtros torna falsa a condição da régua
                  de chips logo acima, o botão sai do DOM, e o foco de quem
                  acabou de acioná-lo cai no `<body>` (WCAG 2.4.3). */}
              {mostrarLimparTudo(chipsAtivos.length, filtroAberto) && (
                <button
                  type="button"
                  onClick={limparTudoSemPerderOFoco}
                  className={`mt-foco border border-mt-accent px-3 py-1.5 text-xs font-semibold text-mt-accent ${filtro.classeDoBotao}`}
                >
                  LIMPAR TUDO
                </button>
              )}
            </div>
          )}

          {totalFiltrado === 0 ? (
            <div className="border-t-2 border-mt-regua py-16 text-center">
              <p className="m-0 text-[17px] font-extrabold">
                Nenhum veículo com essa combinação de filtros.
              </p>
              <button
                type="button"
                onClick={limparTudoComFocoNosResultados}
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
