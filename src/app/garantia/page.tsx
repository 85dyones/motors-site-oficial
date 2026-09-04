import type { Metadata } from "next";
import PaginaDeEstoque from "../../components/modernist/PaginaDeEstoque";
import FaixaProcedencia from "../../components/modernist/FaixaProcedencia";
import { getCachedSettings } from "../../lib/settings";
import { montarCompartilhamento } from "../../lib/compartilhamento";
import { normalizarProcedencia } from "../../lib/procedencia";
import { FAIXAS_DE_PRECO, hubsDeCarroceria, recortesDoEstoque } from "../../lib/hubsDeEstoque";
import { blocoJsonLd, schemaDePerguntas, schemaDeTrilha } from "../../lib/schemaListagem";
import { schemaDaLoja } from "../../lib/schemaLoja";
import { PERGUNTAS_DE_GARANTIA, TEXTO_DE_GARANTIA } from "../../lib/paginasInstitucionais";

/**
 * `/garantia` — destino de sitelink e resposta à objeção mais comum do balcão.
 *
 * O texto vive em `lib/paginasInstitucionais.ts`, com a procedência de cada
 * afirmação anotada lá. Duas coisas que esta página faz de propósito, e que
 * não são estilo:
 *
 * 1. **Não vende os três meses como vantagem.** O `POSICIONAMENTO.md` é
 *    explícito: 90 dias é o mínimo legal para venda por pessoa jurídica, e
 *    anunciá-lo como diferencial soa ingênuo para quem pesquisou. O prazo é
 *    afirmado com clareza; o diferencial fica na perícia e no três-em-dez.
 * 2. **Reaproveita a faixa de procedência da ficha** em vez de reescrever as
 *    mesmas quatro promessas. Ela é editável no painel — se a loja mudar o que
 *    promete, muda num lugar só e as duas páginas acompanham.
 *
 * Sem grade de veículos: aqui o estoque não é o argumento.
 */

export const revalidate = 3600;

const CAMINHO = "/garantia";

export async function generateMetadata(): Promise<Metadata> {
  const { companySettings } = await getCachedSettings();

  return {
    title: "Garantia do Seminovo em Curitiba | Motors Store",
    description:
      "Três meses de garantia de motor e câmbio, sem carência e sem franquia, em todo carro " +
      "vendido. Perícia cautelar independente e laudo na ficha do veículo assim que aprovado.",
    alternates: { canonical: CAMINHO },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "sobre",
      rotulo: "Garantia",
      tituloPadrao: "Garantia do seminovo — Motors Store",
      descricaoPadrao:
        "Três meses de motor e câmbio, sem carência e sem franquia. E a perícia que vem antes.",
      caminho: CAMINHO,
    }),
  };
}

export default async function GarantiaPage() {
  const [{ historico, disponiveis }, settings] = await Promise.all([
    recortesDoEstoque(),
    getCachedSettings(),
  ]);

  const jsonLd = blocoJsonLd([
    schemaDeTrilha([
      { nome: "Home", caminho: "/" },
      { nome: "Garantia", caminho: CAMINHO },
    ]),
    schemaDePerguntas(PERGUNTAS_DE_GARANTIA),
    schemaDaLoja(settings.companySettings, { disponiveis }),
  ]);

  return (
    <div className="flex flex-col bg-mt-bg text-mt-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <PaginaDeEstoque
        trilha={[{ rotulo: "Home", href: "/" }]}
        titulo="Garantia do seminovo"
        introducao={TEXTO_DE_GARANTIA}
        contagem={false}
        veiculos={[]}
        textoSemEstoque="Veja o estoque disponível; o laudo de perícia fica na ficha assim que aprovado."
        conteudo={<FaixaProcedencia itens={normalizarProcedencia(settings.procedencia)} />}
        blocos={[
          {
            titulo: "Por faixa de preço",
            links: FAIXAS_DE_PRECO.map((f) => ({ rotulo: f.nome, href: `/estoque/${f.slug}` })),
          },
          {
            titulo: "Por carroceria",
            links: hubsDeCarroceria(historico, disponiveis)
              .filter((c) => c.veiculos.length > 0)
              .map((c) => ({ rotulo: c.nome, href: `/estoque/${c.slug}`, total: c.veiculos.length })),
          },
        ]}
        faq={PERGUNTAS_DE_GARANTIA}
      />
    </div>
  );
}
