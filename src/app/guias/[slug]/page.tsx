import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { acharGuia, GUIAS } from "../../../lib/guias";
import { getCachedSettings } from "../../../lib/settings";
import { montarCompartilhamento } from "../../../lib/compartilhamento";
import { blocoJsonLd } from "../../../lib/schemaListagem";
import { grafoDoGuia } from "../../../lib/schemaGuia";
import { criarLinkador } from "../../../lib/linksNoTexto";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Uma hora, e não um dia — porque um dia não teria efeito.
 *
 * A primeira versão declarava `86400` com um comentário dizendo que conteúdo
 * editorial não gira com o estoque e que isso mantinha a página "fora do
 * caminho de qualquer leitura de banco". As duas metades eram falsas, e a
 * revisão mediu na tabela do build: a rota saía com **Revalidate 1h**.
 *
 * O motivo é que `getCachedSettings` é `unstable_cache` com `revalidate: 3600`
 * (`lib/settings.ts`), e o revalidate efetivo é o MENOR da cadeia. E a página
 * chama `getCachedSettings()` duas vezes — no metadata e no render —, então a
 * exposição a uma falha de leitura é a mesma de `/garantia`.
 *
 * Declarar o número real é melhor que declarar um teto decorativo: quem ler
 * daqui a seis meses precisa saber o que a rota faz, não o que se desejou.
 */
export const revalidate = 3600;
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
 * O texto passa pelo linkador da F1: "perícia cautelar" e "Avaliação Express"
 * viram link para as páginas que respondem por elas. Sem `caminhoAtual` —
 * nenhum guia é destino de termo —, e a string nunca é alterada, porque as
 * respostas do FAQ vão inteiras para o `FAQPage` do JSON-LD.
 *
 * ⚠️ Use `criarLinkador()`, e não `segmentarComLinks` direto. A primeira
 * versão desta rota chamou a segunda por parágrafo, e o comentário dizia "uma
 * vez por página" — falso: seis âncoras para `/garantia` no corpo do guia, sete
 * com o rodapé. O limite de `segmentarComLinks` é por STRING; num texto longo,
 * que é o que um guia é, a régua por página é a única que vale.
 */
export default async function GuiaPage({ params }: PageProps) {
  const { slug } = await params;
  const guia = acharGuia(slug);
  if (!guia) notFound();

  const { companySettings } = await getCachedSettings();
  const grafo = grafoDoGuia({ guia, empresa: companySettings });

  // Um linkador para a PAGINA inteira, nao um por paragrafo.
  //
  // A primeira versao chamava `segmentarComLinks` direto em cada bloco, e o
  // docblock acima dizia "uma vez por pagina". Era falso: a revisao mediu SEIS
  // ancoras para `/garantia` no corpo, sete com o rodape. E o defeito exato que
  // `criarLinkador` existe para fechar -- o limite de `segmentarComLinks` e por
  // STRING, e a regua certa e por pagina.
  const linkar = criarLinkador();

  const comLinks = (texto: string, chave: string) =>
    linkar(texto).map((parte, i) =>
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
