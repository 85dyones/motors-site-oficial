import type { Metadata } from "next";
import Link from "next/link";
import { listarGuiasPublicados } from "../../lib/guiasDoBanco";
import { getCachedSettings } from "../../lib/settings";
import { montarCompartilhamento } from "../../lib/compartilhamento";
import { blocoJsonLd } from "../../lib/schemaListagem";
import { grafoDoIndiceDeGuias } from "../../lib/schemaGuia";

const CAMINHO = "/guias";

const DESCRICAO =
  "O que a perícia cautelar encontra, o que ela não encontra, e o que isso muda na hora de " +
  "comprar um seminovo. Escrito por quem paga o exame em todo o estoque.";

/**
 * 3600, e nao 86400 -- pelo mesmo motivo que a rota do guia ja documentava.
 *
 * `getCachedSettings` e `unstable_cache` com 3600, e o revalidate efetivo e o
 * MENOR da cadeia: a tabela do build mostrava `/guias  1h` com o 86400
 * declarado. O irmao `[slug]/page.tsx` foi corrigido em `c69dd8c`; este ficou
 * para tras no mesmo commit, e a revisao pegou.
 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const { companySettings } = await getCachedSettings();

  return {
    title: "Guias sobre procedência de seminovos | Motors Store",
    description: DESCRICAO,
    alternates: { canonical: CAMINHO },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "guias",
      tituloPadrao: "Guias sobre procedência de seminovos",
      descricaoPadrao: DESCRICAO,
      caminho: CAMINHO,
    }),
  };
}

/**
 * O índice do cluster.
 *
 * Existe desde o primeiro guia, e não a partir do terceiro: sem ele, cada guia
 * nasceria acessível só pelo sitemap — o mesmo defeito que a F1 corrigiu na
 * `/avaliacao`, que era a única página comercial sem link de entrada
 * contextual.
 *
 * A lista é curta e vai continuar curta por um tempo. A régua de entrada está
 * no docblock de `lib/guias.ts`: assunto que a loja pratica, escrito do lado de
 * quem recusa o carro, e com uma saída comercial. Os dois tópicos de maior
 * valor do plano ainda estão fora porque dependem de dado que só a operação
 * tem — e inventar número é o que a regra do `CLAUDE.md` proíbe.
 */
export default async function GuiasPage() {
  const [{ companySettings }, guias] = await Promise.all([
    getCachedSettings(),
    listarGuiasPublicados(),
  ]);
  const grafo = grafoDoIndiceDeGuias({ guias, empresa: companySettings });

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
          <span className="uppercase text-mt-ink">Guias</span>
        </nav>

        <h1 className="mt-titulo m-0 mt-3 text-[36px] lg:text-[56px]">
          Guias de procedência
        </h1>
        <p className="m-0 mt-4 max-w-[680px] text-[14px] leading-relaxed text-mt-neutral-800 lg:text-[15px]">
          {DESCRICAO}
        </p>
      </div>

      <section className="border-t-2 border-mt-regua px-[18px] py-8 lg:px-10">
        <div className="grid gap-4 md:grid-cols-2">
          {guias.map((guia) => (
            <Link
              key={guia.slug}
              href={`/guias/${guia.slug}`}
              className="mt-foco flex flex-col gap-2 border border-mt-regua p-5 no-underline hover:border-mt-accent"
            >
              <span className="mt-titulo text-[18px] text-mt-ink lg:text-[20px]">
                {guia.titulo}
              </span>
              <span className="text-[13px] leading-relaxed text-mt-neutral-800">
                {guia.descricao}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t-2 border-mt-regua px-[18px] py-8 lg:px-10">
        <h2 className="mt-titulo m-0 text-[20px] lg:text-[24px]">Depois de ler</h2>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {[
            { rotulo: "Ver o estoque", href: "/estoque" },
            { rotulo: "Garantia", href: "/garantia" },
            { rotulo: "Avaliação Express", href: "/avaliacao" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="mt-foco border border-mt-regua px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[.06em] text-mt-ink no-underline hover:border-mt-accent"
            >
              {link.rotulo}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
