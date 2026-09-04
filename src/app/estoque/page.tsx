import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import Catalogo from "../../components/modernist/Catalogo";
import GradeDeVeiculos from "../../components/modernist/GradeDeVeiculos";
import { getEstoque } from "../../lib/supabase";
import { getCachedSettings, recortePublicoDeSettings } from "../../lib/settings";
import { montarCompartilhamento } from "../../lib/compartilhamento";
import {
  DESTAQUES_PADRAO,
  normalizarQuickTags,
  normalizarStockOverrides,
} from "../../lib/destaquesRapidos";
import { hubsDeCarroceria, hubsDeMarca, recortesDoEstoque } from "../../lib/hubsDeEstoque";
import ContagemDeEstoque from "../../components/ContagemDeEstoque";
import {
  blocoJsonLd,
  schemaDeListagem,
  schemaDePerguntas,
  schemaDeTrilha,
} from "../../lib/schemaListagem";
import { perguntasDeCategoria } from "../../lib/textoDosHubs";
import { schemaDaLoja } from "../../lib/schemaLoja";
import { indiceDaVitrine } from "../../lib/vitrine";

export const revalidate = 60;

/**
 * Quantos veículos a grade do servidor entrega antes do JavaScript.
 *
 * Igual ao `PAGINA` do `Catalogo` (9): o fallback e a primeira tela do catálogo
 * mostram exatamente a mesma coisa, então a troca na hidratação não move nada
 * na tela. As demais URLs de ficha chegam ao rastreador pelo `ItemList` logo
 * abaixo, que lista o estoque inteiro.
 */
const PRIMEIRA_LEVA = 9;

export async function generateMetadata(): Promise<Metadata> {
  const [estoque, { companySettings }] = await Promise.all([
    getEstoque(),
    getCachedSettings(),
  ]);
  const total = estoque.filter((v) => !v.vendido).length;

  // A contagem entra no título só quando existe. Com o estoque zerado — sync
  // fora do ar, banco inacessível — o título anunciava "— 0 Ofertas", que é o
  // mesmo defeito do "0" pendurado no `<h1>` das faixas: número honesto no
  // lugar errado. Medido no build de 2026-08-25.
  return {
    title: total > 0
      ? `Carros Seminovos em Curitiba — ${total} Ofertas | Motors Store`
      : "Carros Seminovos em Curitiba | Motors Store",
    description:
      (total > 0 ? `${total} veículos` : "Veículos") +
      " com perícia cautelar independente: de cada dez avaliados, três entram. " +
      "Filtre por marca, carroceria, câmbio e faixa de preço. Loja no Bacacheri, Curitiba.",
    alternates: { canonical: "/estoque" },
    // O card contava o estoque no título e não tinha imagem — herdava o logo
    // esticado do layout. A contagem fica: é o que dá vontade de abrir.
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "estoque",
      tituloPadrao: total > 0 ? `${total} carros seminovos em Curitiba` : "Carros seminovos em Curitiba",
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

  const fichas = indiceDaVitrine(disponiveis);

  const perguntas = perguntasDeCategoria("carros seminovos");

  const jsonLd = blocoJsonLd([
    schemaDeTrilha([
      { nome: "Home", caminho: "/" },
      { nome: "Estoque", caminho: "/estoque" },
    ]),
    schemaDeListagem("Carros seminovos em Curitiba", disponiveis),
    schemaDePerguntas(perguntas),
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
      <ContagemDeEstoque total={disponiveis.length} />

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
          Todo veículo passa por perícia cautelar independente antes de entrar na vitrine: de cada dez avaliados, três
          entram. O laudo fica na ficha do carro assim que aprovado, e o preço está no anúncio.
          Showroom no Bacacheri, em Curitiba.
        </p>
      </div>

      {/* O fallback é a grade de verdade, não um retângulo vazio.
          `Catalogo` usa `useSearchParams()`: dentro de um <Suspense>, o que o
          servidor renderiza é o FALLBACK — a árvore do cliente só aparece
          depois do JavaScript. Era assim que /estoque saía sem um único link de
          veículo no HTML. Colocando a grade aqui, quem lê sem executar JS vê a
          vitrine, e quem executa vê o Catálogo assumir com filtro e ordenação.
          Os dois veem a mesma grade, com o mesmo card. */}
      <Suspense
        fallback={
          /* A moldura repete a do `Catalogo` — barra de ordenação em cima e a
             coluna de 290px do filtro à esquerda — porque o fallback vira o
             conteúdo real do HTML e some na hidratação. Sem reservar a coluna,
             a grade nasceria em largura cheia e pularia para dentro quando o
             filtro aparecesse, na tela mais usada do site. */
          <>
            <div className="border-b-2 border-mt-regua px-[18px] pb-5 pt-6 lg:px-10 lg:pt-7">
              <div className="flex items-baseline gap-2">
                <span className="mt-titulo text-[26px] lg:text-[32px]">{disponiveis.length}</span>
                <span className="text-[11px] font-semibold tracking-[.14em] text-mt-neutral-600">
                  {disponiveis.length === 1 ? "VEÍCULO NA SELEÇÃO" : "VEÍCULOS NA SELEÇÃO"}
                </span>
              </div>

              {/* O lugar do botão de filtro do celular, ocupado por algo que
                  FUNCIONA sem JavaScript. Mesma caixa, mesma altura: quando o
                  `Catalogo` assume, o botão "FILTROS" entra aqui e a grade não
                  se move. Um placeholder morto ocuparia o mesmo espaço e não
                  levaria ninguém a lugar nenhum — quem lê sem JS não tem
                  filtro, mas tem o índice completo no rodapé. */}
              <a
                href="#todos-os-veiculos"
                className="mt-foco mt-4 flex w-full items-center justify-between border-2 border-mt-regua px-4 py-2.5 text-[11px] font-extrabold tracking-[.16em] text-mt-ink no-underline lg:hidden"
              >
                VER TODO O ESTOQUE
                <span className="text-mt-accent">{disponiveis.length}</span>
              </a>
            </div>
            <div className="flex flex-col lg:flex-row lg:items-stretch">
              <div
                aria-hidden="true"
                className="hidden shrink-0 lg:block lg:w-[290px] lg:border-r-2 lg:border-mt-regua"
              />
              <div className="min-w-0 flex-1 px-[18px] py-8 lg:px-7">
                <GradeDeVeiculos veiculos={disponiveis.slice(0, PRIMEIRA_LEVA)} />
              </div>
            </div>
          </>
        }
      >
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
        {/* Toda ficha à venda, como link.
            A grade servida mostra a primeira leva — 9 cards; o resto só
            aparece depois do "carregar mais", que é JavaScript. Medido na
            produção em 2026-09-04: 9 links de ficha no HTML contra 34 URLs no
            `ItemList`. `ItemList` informa o rastreador, mas não é caminho de
            navegação e não passa autoridade; para quem lê a página sem
            executar JS as outras 25 simplesmente não existiam.

            Este índice fecha os dois buracos de uma vez, e é barato: texto,
            sem imagem. O `id` existe porque o fallback do <Suspense> aponta
            para cá, e o `scroll-mt-24` porque o header é `sticky top-0`: sem a
            folga, a âncora deixa o título embaixo dele. Mesma régua que
            `/privacidade` já usa. */}
        {fichas.length > 0 && (
          <section id="todos-os-veiculos" className="mb-8 scroll-mt-24">
            <h2 className="mt-titulo m-0 text-[20px] lg:text-[24px]">
              Todos os veículos à venda{" "}
              <span className="text-mt-accent">{fichas.length}</span>
            </h2>
            <ul className="m-0 mt-4 list-none columns-1 gap-x-8 p-0 sm:columns-2 lg:columns-3">
              {fichas.map((ficha) => (
                <li key={ficha.id} className="mb-1.5 break-inside-avoid">
                  <Link
                    href={ficha.href}
                    className="mt-foco text-[13px] text-mt-neutral-800 no-underline hover:text-mt-accent hover:underline"
                  >
                    {ficha.rotulo}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

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

      {/* Fora do <nav>: pergunta frequente não é navegação, e landmark com
          conteúdo que não é link atrapalha quem navega por leitor de tela.

          As perguntas precisam existir na PÁGINA, não só no JSON-LD: markup de
          `FAQPage` que não bate com o conteúdo visível é o caminho curto para
          uma ação manual no Search Console. */}
      <div className="border-t-2 border-mt-regua px-[18px] py-8 lg:px-10">
        <section>
          <h2 className="mt-titulo m-0 text-[20px] lg:text-[24px]">Perguntas frequentes</h2>
          <dl className="m-0 mt-4 max-w-[720px]">
            {perguntas.map((item) => (
              <div key={item.pergunta} className="border-b border-mt-regua-fina py-4">
                <dt className="text-[14px] font-extrabold text-mt-ink">{item.pergunta}</dt>
                <dd className="m-0 mt-1.5 text-[13px] leading-relaxed text-mt-neutral-800">
                  {item.resposta}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
