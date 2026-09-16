import type { Metadata } from "next";
import SobreClientWrapper from "../../components/SobreClientWrapper";
import { getEstoque } from "../../lib/supabase";
import { getCachedSettings } from "../../lib/settings";
import { blocoJsonLd } from "../../lib/schemaListagem";
import { schemaDaLoja, schemaDoSite } from "../../lib/schemaLoja";
import { montarCompartilhamento } from "../../lib/compartilhamento";
import { SITE_URL } from "../../lib/site";

export const revalidate = 60;

const DESCRICAO =
  "Conheça a história da Motors Store: um showroom tradicional em Curitiba que virou curadoria com IA e aceita três de cada dez carros avaliados.";

export async function generateMetadata(): Promise<Metadata> {
  const { companySettings } = await getCachedSettings();

  return {
    title: "Quem Somos | Motors Store — a seleção que sustenta a vitrine",
    description: DESCRICAO,
    alternates: {
      canonical: "/sobre",
    },
    // Texto de fábrica do card vem do catálogo em `lib/compartilhamento.ts`,
    // que é a mesma fonte que o preview do painel lê.
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "sobre",
      caminho: "/sobre",
    }),
  };
}

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": `${SITE_URL}/`
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Quem Somos",
      "item": `${SITE_URL}/sobre`
    }
  ]
};

export default async function SobrePage() {
  // O manifesto cita o tamanho do estoque como argumento ("N unidades e não
  // 300"). O número vem do banco, não do texto — ver `comTotal` no wrapper.
  const [estoque, { companySettings }] = await Promise.all([
    getEstoque(),
    getCachedSettings(),
  ]);
  const disponiveis = estoque.filter((v) => !v.vendido);
  const totalEstoque = disponiveis.length;

  /**
   * A loja e o site entram aqui em 2026-09-05.
   *
   * `/sobre` é a página de ENTIDADE do site — quem é a empresa, desde quando, o
   * que ela recusa — e publicava apenas a trilha. É a URL que um assistente lê
   * para responder "quem é a Motors Store", e é onde o relatório de
   * visibilidade em IA apontou que a marca se descreve sem que ninguém possa
   * citá-la. Sem o `AutoDealer` aqui, o texto institucional não estava ligado a
   * endereço, horário nem perfis em dado estruturado — o `WebSite` fecha
   * dizendo de quem é o domínio.
   */
  const grafo = blocoJsonLd([
    breadcrumbSchema,
    schemaDaLoja(companySettings, { disponiveis }),
    schemaDoSite(companySettings),
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: grafo }}
      />
      <SobreClientWrapper totalEstoque={totalEstoque} />
    </>
  );
}
