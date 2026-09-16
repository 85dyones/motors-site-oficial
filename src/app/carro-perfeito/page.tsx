import type { Metadata } from "next";
import CarMatch from "../../components/CarMatch";
import { getCachedSettings } from "../../lib/settings";
import { montarCompartilhamento } from "../../lib/compartilhamento";
import { blocoJsonLd, schemaDeTrilha } from "../../lib/schemaListagem";
import { schemaDaLoja, schemaDoSite } from "../../lib/schemaLoja";

const DESCRICAO =
  "Cinco perguntas, trinta segundos. Traçamos seu perfil de uso e um consultor envia três sugestões reais do estoque no WhatsApp.";

// Mesma correção da /avaliacao: sem card próprio, o quiz era compartilhado com
// o texto da home.
export async function generateMetadata(): Promise<Metadata> {
  const { companySettings } = await getCachedSettings();

  return {
    title: "Garagem Profiler — encontre o carro certo | Motors Store",
    description: DESCRICAO,
    alternates: { canonical: "/carro-perfeito" },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "carroPerfeito",
      caminho: "/carro-perfeito",
    }),
  };
}

/**
 * Tela 04 — Garagem Profiler.
 *
 * A rota não põe moldura nenhuma: no design doc a tela 04 é o próprio fluxo
 * ocupando a largura toda, com a barra "GARAGEM PROFILER · SAIR" no alto e o
 * perfil se formando ao lado. Quem desenha isso é o `CarMatch` — inclusive o
 * `<h1>`, que vive na abertura do quiz.
 *
 * O quiz em si (perguntas, pontuação, envio do lead e tracking) continua
 * sendo o `CarMatch` de produção; o header e o rodapé apontam para cá em vez
 * do antigo âncora `/#match-garagem`.
 */
export default async function CarroPerfeitoPage() {
  const { companySettings } = await getCachedSettings();

  /**
   * Dado estruturado entrou em 2026-09-05, e esta era a página pública com
   * MENOS schema do site: prioridade 0.7 no sitemap — a mesma de `/avaliacao` e
   * `/garantia` — e nenhum nó, nem trilha.
   *
   * A F2 foi buscar `/sobre`, `/contato` e as landings de destaque com o
   * argumento de serem páginas públicas de entidade, e passou por cima
   * justamente desta. Foi a revisão que apontou: a frase que eu tinha escrito
   * ("as 9 de fora são erro, área logada ou bloqueadas no robots") era falsa
   * para ela e para `/privacidade`, que estão no sitemap e permitidas no
   * `robots.ts`.
   *
   * Sem `disponiveis`: o quiz não lista estoque, e ler o banco aqui
   * acrescentaria dependência a uma rota de captação que não precisa dela —
   * mesmo critério de `/avaliacao` e `/contato`.
   */
  const grafo = blocoJsonLd([
    schemaDeTrilha([
      { nome: "Home", caminho: "/" },
      { nome: "Garagem Profiler", caminho: "/carro-perfeito" },
    ]),
    schemaDaLoja(companySettings),
    schemaDoSite(companySettings),
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: grafo }} />
      <CarMatch />
    </>
  );
}
