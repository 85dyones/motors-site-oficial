import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { acharGuia, GUIAS } from "../../../lib/guias";
import { getCachedSettings } from "../../../lib/settings";
import { montarCompartilhamento } from "../../../lib/compartilhamento";
import { blocoJsonLd } from "../../../lib/schemaListagem";
import { grafoDoGuia } from "../../../lib/schemaGuia";
import { segmentarComLinks } from "../../../lib/linksNoTexto";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Conteúdo editorial não gira com o estoque: um dia é folgado, e mantém a
// página fora do caminho de qualquer leitura de banco que possa falhar.
export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIAS.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guia = acharGuia(slug);
  if (!guia) return { title: "Guia não encontrado | Motors Store" };

  const { companySettings } = await getCachedSettings();

  return {
    title: guia.tituloSeo,
    description: guia.descricao,
    alternates: { canonical: `/guias/${guia.slug}` },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "guias",
      tituloPadrao: guia.titulo,
      descricaoPadrao: guia.descricao,
      caminho: `/guias/${guia.slug}`,
    }),
  };
}

/**
 * Um guia do cluster de procedência.
 *
 * A rota é fina de propósito: todo o conteúdo mora em `lib/guias.ts` e todo o
 * grafo em `lib/schemaGuia.ts`. O que sobra aqui é layout — e é o que permite
 * ao teste renderizar a página inteira com um mock só.
 *
 * O texto passa por `segmentarComLinks`, o mesmo da F1: "perícia cautelar" e
 * "Avaliação Express" viram link para as páginas que respondem por elas, uma
 * vez por página. Sem `caminhoAtual` — nenhum guia é destino de termo —, e a
 * string nunca é alterada, porque as respostas do FAQ vão inteiras para o
 * `FAQPage` do JSON-LD.
 */
export default async function GuiaPage({ params }: PageProps) {
  const { slug } = await params;
  const guia = acharGuia(slug);
  if (!guia) notFound();

  const { companySettings } = await getCachedSettings();
  const grafo = grafoDoGuia({ guia, empresa: companySettings });

  const comLinks = (texto: string, chave: string) =>
    segmentarComLinks(texto).map((parte, i) =>
      parte.href ? (
        <Link
          key={`${chave}-${i}`}
          href={parte.href}
          className="mt-foco text-mt-ink underline decoration-mt-accent underline-offset-2 hover:text-mt-accent"
        >
          {parte.texto}
        </Link>
      ) : (
        <span key={`${chave}-${i}`}>{parte.texto}</span>
      ),
    );

  return (
    <div className="flex flex-col bg-mt-bg font-modernist text-mt-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: blocoJsonLd(grafo) }} />

      <div className="px-[18px] pt-8 lg:px-10 lg:pt-11">
        <nav
          aria-label="Trilha"
          className="text-[11px] font-semibold tracking-[.16em] text-mt-neutral-600"
        >
          <Link href="/" className="mt-foco text-mt-neutral-600 no-underline hover:text-mt-ink">
            HOME
          </Link>
          {" / "}
          <Link
            href="/guias"
            className="mt-foco text-mt-neutral-600 no-underline hover:text-mt-ink"
          >
            GUIAS
          </Link>
          {" / "}
          <span className="uppercase text-mt-ink">{guia.titulo}</span>
        </nav>

        <h1 className="mt-titulo m-0 mt-3 max-w-[900px] text-[32px] lg:text-[52px] lg:leading-[1.05]">
          {guia.titulo}
        </h1>
        <p className="m-0 mt-4 max-w-[680px] text-[15px] leading-relaxed text-mt-neutral-800 lg:text-[16px]">
          {guia.descricao}
        </p>
      </div>

      <article className="border-t-2 border-mt-regua px-[18px] py-8 lg:px-10">
        {guia.corpo.map((secao) => (
          <section key={secao.titulo} className="max-w-[680px] pb-8 last:pb-0">
            <h2 className="mt-titulo m-0 text-[20px] lg:text-[26px]">{secao.titulo}</h2>
            {secao.paragrafos.map((paragrafo, i) => (
              <p
                key={i}
                className="m-0 mt-4 text-[14px] leading-relaxed text-mt-neutral-800 lg:text-[15px]"
              >
                {comLinks(paragrafo, `${secao.titulo}-${i}`)}
              </p>
            ))}
          </section>
        ))}
      </article>

      <section className="border-t-2 border-mt-regua px-[18px] py-8 lg:px-10">
        <h2 className="mt-titulo m-0 text-[20px] lg:text-[24px]">Perguntas frequentes</h2>
        {/* As MESMAS strings que o `FAQPage` publica. O link entra no render,
            nunca na string — texto marcado tem que bater com o visível. */}
        <dl className="m-0 mt-4 max-w-[720px]">
          {guia.faq.map((item) => (
            <div key={item.pergunta} className="border-b border-mt-regua-fina py-4">
              <dt className="text-[14px] font-extrabold text-mt-ink">{item.pergunta}</dt>
              <dd className="m-0 mt-1.5 text-[13px] leading-relaxed text-mt-neutral-800">
                {comLinks(item.resposta, item.pergunta)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* A saída comercial. Guia sem destino é conteúdo que não devolve nada. */}
      <section className="border-t-2 border-mt-regua px-[18px] py-8 lg:px-10">
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={guia.saida.href}
            className="mt-foco flex max-w-[420px] flex-col gap-2 border border-mt-regua p-4 no-underline hover:border-mt-accent"
          >
            <span className="text-[12px] font-extrabold uppercase tracking-[.06em] text-mt-ink">
              {guia.saida.rotulo}
            </span>
            <span className="text-[12px] leading-relaxed text-mt-neutral-800">
              {guia.saida.apoio}
            </span>
          </Link>
          <Link
            href="/estoque"
            className="mt-foco flex max-w-[420px] flex-col gap-2 border border-mt-regua p-4 no-underline hover:border-mt-accent"
          >
            <span className="text-[12px] font-extrabold uppercase tracking-[.06em] text-mt-ink">
              Ver o estoque
            </span>
            <span className="text-[12px] leading-relaxed text-mt-neutral-800">
              O que entrou depois da perícia, com o laudo na ficha assim que aprovado.
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}
