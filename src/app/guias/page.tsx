import type { Metadata } from "next";
import Link from "next/link";
import { listarGuiasPublicados } from "../../lib/guiasDoBanco";
import { getCachedSettings } from "../../lib/settings";
import { montarCompartilhamento } from "../../lib/compartilhamento";
import { blocoJsonLd } from "../../lib/schemaListagem";
import { grafoDoIndiceDeGuias } from "../../lib/schemaGuia";
import { NOME_DA_SECAO } from "../../lib/guias";
import { cabecalhoDosGuias } from "../../lib/secaoDeGuias";
import { GUIA_DE_ENTRADA, agruparGuias } from "../../lib/guiasNoSite";
import { apoioDaBusca } from "../../lib/buscaDeGuias";
import GuiasComBusca from "../../components/guias/GuiasComBusca";

const CAMINHO = "/guias";

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
  const [{ companySettings }, cabecalho] = await Promise.all([
    getCachedSettings(),
    cabecalhoDosGuias(),
  ]);

  return {
    // O sufixo " | Motors Store" é da PÁGINA, e não do campo: o painel edita o
    // assunto, não a assinatura. Assim ninguém precisa lembrar de repetir o
    // nome da loja, e ninguém consegue removê-lo sem querer.
    //
    // A aba não repete o `<h1>`, e é de propósito — ver `TITULO_SEO_DA_SECAO`.
    title: `${cabecalho.tituloSeo} | Motors Store`,
    description: cabecalho.resumo,
    alternates: { canonical: CAMINHO },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "guias",
      tituloPadrao: cabecalho.tituloSeo,
      descricaoPadrao: cabecalho.resumo,
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
  const [{ companySettings }, guias, cabecalho] = await Promise.all([
    getCachedSettings(),
    listarGuiasPublicados(),
    cabecalhoDosGuias(),
  ]);
  /* Por assunto desde 29/09/2026. Até ali a lista vinha na ordem de
     publicação, e a procedência, que é o que só esta loja escreve, já estava
     no fim e descia a cada guia novo. O `ItemList` segue a mesma ordem da tela. */
  const grupos = agruparGuias(guias);
  const gruposNaBusca = grupos.map((grupo) => ({
    titulo: grupo.titulo,
    resumo: grupo.resumo,
    guias: grupo.guias.map((guia) => ({
      slug: guia.slug,
      titulo: guia.titulo,
      descricao: guia.descricao,
      apoio: apoioDaBusca(guia),
    })),
  }));
  const grafo = grafoDoIndiceDeGuias({ guias: grupos.flatMap((g) => g.guias), empresa: companySettings });

  return (
    <div className="flex flex-col bg-mt-bg font-modernist text-mt-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: blocoJsonLd(grafo) }} />

      {/* A lista com busca por tema e por dúvida digitada (02/10). O índice de
          busca é montado aqui, no servidor; o corpo dos guias não vai junto.
          A trilha, o `<h1>` e o resumo entram prontos, como `abertura`: o
          componente é de cliente, e este trecho não precisa ser. */}
      <GuiasComBusca
        grupos={gruposNaBusca}
        entrada={gruposNaBusca.flatMap((g) => g.guias).find((g) => g.slug === GUIA_DE_ENTRADA)}
        abertura={
          <>
            <nav
              aria-label="Trilha"
              className="mt-trilha text-[11px] font-semibold tracking-[.16em] text-mt-inverso-suave"
            >
              <Link href="/" className="mt-foco text-mt-inverso-suave no-underline hover:text-mt-inverso">
                HOME
              </Link>
              {" / "}
              <span className="uppercase text-mt-inverso">{NOME_DA_SECAO}</span>
            </nav>

            <h1 className="mt-display m-0 mt-4 text-[44px] lg:text-[88px]">{NOME_DA_SECAO}</h1>
            <p className="m-0 mt-5 max-w-[620px] text-[15px] leading-relaxed text-mt-inverso lg:text-[18px]">
              {cabecalho.resumo}
            </p>
          </>
        }
      />

      <section className="bg-mt-inverso-fundo px-[18px] py-10 text-mt-inverso lg:flex lg:items-center lg:justify-between lg:gap-10 lg:px-10 lg:py-14">
        <h2 className="mt-titulo m-0 text-[28px] lg:text-[40px]">Depois de ler</h2>
        <div className="mt-5 flex flex-wrap gap-2 lg:mt-0">
          {[
            { rotulo: "Ver o estoque", href: "/estoque", principal: true },
            { rotulo: "Garantia", href: "/garantia", principal: false },
            { rotulo: "Avaliação Express", href: "/avaliacao", principal: false },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`mt-foco mt-btn uppercase ${
                link.principal
                  ? "mt-btn-primario"
                  : "bg-transparent text-mt-inverso shadow-[inset_0_0_0_2px_var(--mt-inverso-regua)] hover:shadow-[inset_0_0_0_2px_var(--mt-inverso-texto)]"
              }`}
            >
              {link.rotulo}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
