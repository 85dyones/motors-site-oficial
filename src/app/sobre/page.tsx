import type { Metadata } from "next";
import SobreClientWrapper from "../../components/SobreClientWrapper";
import { getEstoque } from "../../lib/supabase";
import { disponiveisDe } from "../../lib/regrasEstoque";
import { getCachedSettings } from "../../lib/settings";
import { blocoJsonLd } from "../../lib/schemaListagem";
import { schemaDaLoja, schemaDoSite } from "../../lib/schemaLoja";
import { montarCompartilhamento } from "../../lib/compartilhamento";
import { SITE_URL } from "../../lib/site";
import GuiasRelacionados from "../../components/modernist/GuiasRelacionados";
import { GUIAS_DA_PAGINA } from "../../lib/guiasNoSite";
import { NOME_DA_SECAO } from "../../lib/guias";
import { AUTOR_DOS_GUIAS } from "../../lib/assinaturaDoGuia";
import { schemaDoAutorDosGuias } from "../../lib/schemaGuia";
import { getReputacaoGoogle } from "../../lib/avaliacoesGoogle";
import GoogleReviewsFeed from "../../components/GoogleReviewsFeed";

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
  const [estoque, { companySettings }, painelDoGoogle] = await Promise.all([
    getEstoque(),
    getCachedSettings(),
    // A mesma leitura da home, com o mesmo cache de 24 h: as duas páginas
    // dividem a chamada ao Places API.
    getReputacaoGoogle(),
  ]);
  const disponiveis = disponiveisDe(estoque);
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
    // A pessoa que assina os guias, com o mesmo `@id` que o `Article` de cada
    // guia cita. O `url` dela aponta para o bloco `#autor` logo abaixo.
    { "@context": "https://schema.org", ...schemaDoAutorDosGuias() },
  ]);

  const loja = companySettings?.name?.trim() || "Motors Store";

  /* Quem escreve os guias, e a prova da seleção (auditoria de 29/09).
     Montado aqui, e não no painel, porque é o destino do `url` do autor no
     schema: texto e dado estruturado precisam dizer a mesma coisa. */
  const autor = (
    <section id="autor" className="px-[18px] pt-12 lg:px-10 lg:pt-16">
      <h2 className="mt-titulo m-0 text-[26px] lg:text-[34px]">Quem escreve os {NOME_DA_SECAO}</h2>
      <p className="m-0 mt-4 max-w-[680px] text-[15px] leading-relaxed text-mt-neutral-800 lg:text-base">
        Os {NOME_DA_SECAO} são escritos por {AUTOR_DOS_GUIAS.nome}, {AUTOR_DOS_GUIAS.apresentacao}.
        Tratam do que a {loja} faz todo dia: a perícia antes da compra, a avaliação do usado, a troca e
        a venda.
      </p>
      <GuiasRelacionados
        titulo="A seleção por dentro"
        guias={GUIAS_DA_PAGINA["/sobre"]}
        className="mt-8"
      />
    </section>
  );

  /* A nota do Google ao vivo e três avaliações (pedido do dono em 30/09).
     Sem as variáveis do Places API, ou com a API fora do ar, não há seção:
     nunca um título "O que dizem os clientes" em cima de caixa vazia. */
  const reputacao = painelDoGoogle && (
    <section id="avaliacoes" className="px-[18px] pt-12 lg:px-10 lg:pt-16">
      <h2 className="mt-titulo m-0 text-[26px] lg:text-[34px]">O que dizem os clientes</h2>
      <GoogleReviewsFeed painel={painelDoGoogle} limite={3} />
    </section>
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: grafo }}
      />
      <SobreClientWrapper totalEstoque={totalEstoque} autor={autor} reputacao={reputacao} />
    </>
  );
}
