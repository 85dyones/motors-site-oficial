import type { Veiculo } from "../types";
import { SITE_URL } from "./site";
import { getVeiculoPdpUrl } from "./supabase";

/**
 * Os três nós que faltavam nas páginas de listagem: `ItemList`,
 * `BreadcrumbList` e `FAQPage`.
 *
 * Até 2026-08-25 o site tinha `Car` e `BreadcrumbList` na ficha e `AutoDealer`
 * na home — e **nada** em `/estoque`, que é a página de maior prioridade do
 * sitemap depois da home (§0.5.5 itens 5 e 10 do plano de aquisição).
 *
 * O `ItemList` faz um trabalho concreto além de enfeitar o resultado de busca:
 * ele põe a URL de cada veículo no HTML servido. Numa página cuja grade é
 * renderizada no cliente, é a única coisa que informa ao rastreador o que
 * existe ali sem esperar a segunda passada de renderização.
 */

/**
 * Lista de URLs de veículo.
 *
 * Só `url` por item, sem repetir preço e foto: esses dados já estão no `Car` da
 * ficha, e duplicá-los aqui cria duas fontes que envelhecem em ritmos
 * diferentes — a listagem revalida a cada 60s, a ficha a cada hora.
 */
export function schemaDeListagem(nome: string, veiculos: Veiculo[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: nome,
    numberOfItems: veiculos.length,
    itemListElement: veiculos.map((v, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}${getVeiculoPdpUrl(v)}`,
    })),
  };
}

export interface DegrauDaTrilha {
  nome: string;
  /** Caminho relativo — a função prefixa o domínio. */
  caminho: string;
}

/**
 * Trilha de navegação.
 *
 * O breadcrumb rico do Google sai daqui, não da URL: é o que permite exibir
 * `Seminovos › Curitiba › Jeep › Renegade` no resultado sem tocar em nenhuma
 * URL de ficha (§2.2.2b, motivo 7). Todo degrau precisa responder 200 — o
 * caso anterior apontava para uma rota de marca que não existia, e markup que
 * aponta para 404 é markup desperdiçado que ainda vira erro no Search Console.
 */
export function schemaDeTrilha(degraus: DegrauDaTrilha[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: degraus.map((degrau, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: degrau.nome,
      item: `${SITE_URL}${degrau.caminho}`,
    })),
  };
}

export interface PerguntaDeSchema {
  pergunta: string;
  resposta: string;
}

/**
 * Perguntas frequentes.
 *
 * Só em página de categoria, bairro e institucional. **Nunca na ficha do
 * veículo**: o estoque gira a cada 45 dias e a resposta que valia para um carro
 * não vale para o próximo — inconsistência entre markup e página é o caminho
 * mais curto para uma ação manual no Search Console.
 *
 * As perguntas precisam existir de verdade na página; é a exigência do Google
 * para `FAQPage`, e é por isso que `PaginaDeEstoque` renderiza a mesma lista.
 */
export function schemaDePerguntas(perguntas: PerguntaDeSchema[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: perguntas.map((p) => ({
      "@type": "Question",
      name: p.pergunta,
      acceptedAnswer: { "@type": "Answer", text: p.resposta },
    })),
  };
}

/**
 * Emite os nós num `<script>` só.
 *
 * Um array de nós no mesmo bloco é JSON-LD válido e evita quatro `<script>`
 * seguidos no HTML de cada hub. `JSON.stringify` descarta `undefined`, então
 * campo ausente continua ausente.
 */
export function blocoJsonLd(nos: unknown[]): string {
  return JSON.stringify(nos.filter(Boolean));
}
