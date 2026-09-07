import type { Metadata } from "next";
import Link from "next/link";
import { listarGuiasPublicados } from "../../lib/guiasDoBanco";
import { getCachedSettings } from "../../lib/settings";
import { montarCompartilhamento } from "../../lib/compartilhamento";
import { blocoJsonLd } from "../../lib/schemaListagem";
import { grafoDoIndiceDeGuias } from "../../lib/schemaGuia";

const CAMINHO = "/guias";

/**
 * O escopo da seção, e por que ele é largo.
 *
 * Até 07/09 este parágrafo era só sobre perícia cautelar — e ele aparece em
 * TRÊS lugares (sob o `<h1>`, na meta description e no card de
 * compartilhamento), então era ele, mais do que o título, que prendia a seção a
 * um assunto. Decisão do dono no mesmo dia: `/guias` é o conteúdo editorial da
 * loja inteira — mercado, veículos, procedência, financiamento, tendências.
 *
 * O que NÃO se alargou foi o ângulo. `REGUA_DO_GUIA` continua exigindo assunto
 * que a loja pratica, e a segunda frase daqui é o contrato disso: o assunto é
 * amplo, o ponto de vista é o de quem paga o exame e recusa o carro. Sem isso a
 * seção vira conteúdo genérico disputando com portal, onde a Motors perde por
 * autoridade de domínio.
 */
const DESCRICAO =
  "Procedência, mercado e financiamento na hora de comprar ou vender um seminovo. " +
  "Escrito por quem paga o exame em todo o estoque e recusa o carro que não passa.";

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
    // A aba NÃO repete o `<h1>`, e é de propósito. "Guias Motors" é o nome da
    // seção — bom no rodapé e na trilha, e com demanda de busca zero: ninguém
    // digita isso. O `<title>` é o sinal mais forte de tema da página, então
    // aqui vão os termos que alguém procura. Decisão do dono em 07/09.
    title: "Guias sobre seminovos, mercado e procedência | Motors Store",
    description: DESCRICAO,
    alternates: { canonical: CAMINHO },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "guias",
      tituloPadrao: "Guias sobre seminovos, mercado e procedência",
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
          <span className="uppercase text-mt-ink">Guias Motors</span>
        </nav>

        <h1 className="mt-titulo m-0 mt-3 text-[36px] lg:text-[56px]">
          Guias Motors
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
