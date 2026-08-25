import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import Catalogo from "../../components/modernist/Catalogo";
import { getEstoque } from "../../lib/supabase";
import { getCachedSettings, recortePublicoDeSettings } from "../../lib/settings";
import { montarCompartilhamento } from "../../lib/compartilhamento";
import {
  DESTAQUES_PADRAO,
  normalizarQuickTags,
  normalizarStockOverrides,
} from "../../lib/destaquesRapidos";
import { hubsDeCarroceria, hubsDeMarca, recortesDoEstoque } from "../../lib/hubsDeEstoque";
import { blocoJsonLd, schemaDeListagem, schemaDeTrilha } from "../../lib/schemaListagem";
import { schemaDaLoja } from "../../lib/schemaLoja";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const [estoque, { companySettings }] = await Promise.all([
    getEstoque(),
    getCachedSettings(),
  ]);
  const total = estoque.filter((v) => !v.vendido).length;

  return {
    title: `Carros Seminovos em Curitiba — ${total} Ofertas | Motors Store`,
    description:
      `${total} veículos com perícia cautelar independente: de cada dez avaliados, três entram. ` +
      "Filtre por marca, carroceria, câmbio e faixa de preço. Loja no Bacacheri, Curitiba.",
    alternates: { canonical: "/estoque" },
    // O card contava o estoque no título e não tinha imagem — herdava o logo
    // esticado do layout. A contagem fica: é o que dá vontade de abrir.
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "estoque",
      tituloPadrao: `${total} carros seminovos em Curitiba`,
      caminho: "/estoque",
    }),
  };
}

export default async function EstoquePage() {
  const [{ historico, disponiveis }, settings] = await Promise.all([
    recortesDoEstoque(),
    getCachedSettings(),
  ]);

  const quickTags = normalizarQuickTags(settings.quickTags);
  // `Catalogo` é client component: esta prop inteira vira payload público da
  // página. As settings daqui vêm da chave de serviço, então o blob de
  // overrides carrega `preco_compra` — o recorte público (o mesmo que o GET
  // /api/settings aplica) fica entre os dois. Foi por faltar esta linha que o
  // custo de aquisição de um veículo apareceu no HTML de /estoque (2026-08-16).
  const stockOverrides = normalizarStockOverrides(
    recortePublicoDeSettings(settings).stockOverrides,
  );

  const marcas = hubsDeMarca(historico, disponiveis, "carros").filter((m) => m.veiculos.length > 0);
  const carrocerias = hubsDeCarroceria(historico, disponiveis).filter((c) => c.veiculos.length > 0);

  const jsonLd = blocoJsonLd([
    schemaDeTrilha([
      { nome: "Home", caminho: "/" },
      { nome: "Estoque", caminho: "/estoque" },
    ]),
    schemaDeListagem("Carros seminovos em Curitiba", disponiveis),
    schemaDaLoja(settings.companySettings, { disponiveis }),
  ]);

  return (
    // `<div>`, não `<main>`: o layout raiz já abre um `<main>`.
    <div className="flex flex-col bg-mt-bg text-mt-ink">
      {/**
       * Tudo daqui até o <Suspense> é renderizado no SERVIDOR, e é de propósito.
       *
       * `Catalogo` usa `useSearchParams()`; dentro de um <Suspense> isso faz o
       * Next entregar só o fallback no HTML. Medido em produção em 2026-08-25:
       * /estoque respondia 178 KB com ZERO link de veículo e nenhum <h1>. A
       * página de maior prioridade do sitemap depois da home não passava
       * autoridade nenhuma para as 39 fichas sem uma segunda passada de
       * renderização do Google.
       *
       * O `ItemList` resolve a metade que interessa ao rastreador (as URLs
       * estão no HTML), e o título e a trilha voltam a existir para quem lê a
       * página sem executar JavaScript. O filtro continua no cliente, onde é o
       * lugar dele.
       */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      <div className="px-[18px] pt-8 lg:px-10 lg:pt-11">
        <nav
          aria-label="Trilha"
          className="text-[11px] font-semibold tracking-[.16em] text-mt-neutral-600"
        >
          <Link href="/" className="mt-foco text-mt-neutral-600 no-underline hover:text-mt-ink">
            HOME
          </Link>{" "}
          / <span className="text-mt-ink">ESTOQUE</span>
        </nav>
        <h1 className="mt-titulo m-0 mt-3 text-[36px] lg:text-[56px]">
          Carros seminovos em Curitiba{" "}
          <span className="text-mt-accent">{disponiveis.length}</span>
        </h1>
        <p className="m-0 mt-4 max-w-[620px] text-[14px] leading-relaxed text-mt-neutral-800 lg:text-[15px]">
          Todo veículo passa por perícia cautelar independente antes de entrar na vitrine: de cada
          dez avaliados, três entram. O laudo fica na ficha do carro e o preço está no anúncio.
          Showroom no Bacacheri, em Curitiba.
        </p>
      </div>

      <Suspense fallback={<div className="min-h-[60vh]" />}>
        <Catalogo
          estoque={disponiveis}
          quickTags={quickTags.length > 0 ? quickTags : DESTAQUES_PADRAO}
          stockOverrides={stockOverrides}
        />
      </Suspense>

      {/* Índice do estoque — link interno de verdade, no HTML servido.
          É o que liga /estoque aos hubs perenes e, por eles, às fichas. Sem
          este bloco os hubs nasceriam órfãos: existiriam no sitemap e em
          nenhuma navegação. */}
      <nav
        aria-label="Índice do estoque"
        className="border-t-2 border-mt-regua px-[18px] py-8 lg:px-10"
      >
        {marcas.length > 0 && (
          <section>
            <h2 className="mt-titulo m-0 text-[20px] lg:text-[24px]">Seminovos por marca</h2>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {marcas.map((m) => (
                <Link
                  key={m.slug}
                  href={`/carros/${m.slug}`}
                  className="mt-foco flex items-baseline gap-1.5 border border-mt-regua px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[.06em] text-mt-ink no-underline hover:border-mt-accent"
                >
                  {m.nome}
                  <span className="text-[10px] font-semibold text-mt-accent">
                    {m.veiculos.length}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {carrocerias.length > 0 && (
          <section className="mt-8">
            <h2 className="mt-titulo m-0 text-[20px] lg:text-[24px]">Seminovos por carroceria</h2>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {carrocerias.map((c) => (
                <Link
                  key={c.slug}
                  href={`/estoque/${c.slug}`}
                  className="mt-foco flex items-baseline gap-1.5 border border-mt-regua px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[.06em] text-mt-ink no-underline hover:border-mt-accent"
                >
                  {c.nome}
                  <span className="text-[10px] font-semibold text-mt-accent">
                    {c.veiculos.length}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </nav>
    </div>
  );
}
