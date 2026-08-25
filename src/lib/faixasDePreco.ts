/**
 * As faixas de preço que viram `/estoque/{faixa}`.
 *
 * ---------------------------------------------------------------------------
 * Por que estes cortes, e não os do plano
 * ---------------------------------------------------------------------------
 * O plano de aquisição sugere `até 100 mil`, `100 a 200 mil` e `acima de 200
 * mil`. Medido no feed de produção em 2026-08-25, sobre os 39 veículos (de
 * R$ 23.900 a R$ 318.900, mediana R$ 65.900), aqueles cortes jogariam **32 dos
 * 39** numa página só — um recorte que não recorta nada.
 *
 * Os cortes abaixo dividem o estoque real em três terços utilizáveis (17 / 15 /
 * 7) e batem com a mediana da casa. Se o mix subir de patamar, é aqui que se
 * mexe — e o `slug` faz parte da URL, então mudar um corte é renomear uma
 * página indexada: vale conferir a distribuição antes.
 *
 * Diferente de marca e modelo, a faixa **não depende do histórico**: a lista é
 * fechada e pequena, então a página existe sempre, mesmo com a grade vazia.
 * Não há espaço de URL infinito a proteger aqui.
 *
 * ---------------------------------------------------------------------------
 * Por que num módulo próprio, sem importar nada
 * ---------------------------------------------------------------------------
 * A lista nasceu dentro de `lib/hubsDeEstoque.ts`, que importa `./supabase`
 * para ler o estoque. Só que `lib/dataLayer.ts` também precisa dela — é ele
 * quem classifica `/estoque/ate-60-mil` como faixa de preço, e não como
 * carroceria —, e `dataLayer` é importado por client component. Ler de
 * `hubsDeEstoque` arrastaria o cliente do Supabase para o bundle do navegador.
 *
 * Daí um arquivo sem nenhum import, servindo os dois lados. É o mesmo motivo de
 * `lib/veiculoUrl.ts` existir separado, e a nota de lá vale aqui: **não
 * acrescente import neste arquivo** sem conferir quem o consome.
 *
 * A alternativa seria o `dataLayer` reconhecer a faixa por padrão de string
 * (`ate-`, `-a-`, `acima-`). Slug é URL indexada; regex adivinhando slug é a
 * próxima quebra silenciosa, do tipo que só aparece num relatório meses depois.
 */

export interface FaixaDePreco {
  slug: string;
  /** Como entra no meio da frase: "Seminovos {nome} em Curitiba". */
  nome: string;
  /** Inclusivo. */
  min: number;
  /** Exclusivo. `Infinity` no topo. */
  max: number;
}

export const FAIXAS_DE_PRECO: FaixaDePreco[] = [
  { slug: "ate-60-mil", nome: "até R$ 60 mil", min: 0, max: 60000 },
  { slug: "60-a-100-mil", nome: "de R$ 60 mil a R$ 100 mil", min: 60000, max: 100000 },
  { slug: "acima-100-mil", nome: "acima de R$ 100 mil", min: 100000, max: Infinity },
];

/**
 * Em que faixa este preço cai — o `price_range` da camada de dados.
 *
 * Pedido pelo §11.1 do plano de aquisição: sem ele, o remarketing não sabe
 * separar quem olhou carro de entrada de quem olhou o topo da vitrine, e é a
 * separação que mais muda o lance. Devolve o `slug`, não o `nome`, porque é o
 * `slug` que já é URL indexada e o que o GTM usa como chave de público — nome
 * com "R$" e espaço vira rótulo instável no painel do Ads.
 *
 * Preço inválido devolve `null`: faixa inventada é pior que campo ausente.
 */
export function faixaDoPreco(preco: number): string | null {
  if (!Number.isFinite(preco) || preco <= 0) return null;
  return FAIXAS_DE_PRECO.find((f) => preco >= f.min && preco < f.max)?.slug ?? null;
}

/** Este segmento de `/estoque/{x}` é uma faixa de preço? */
export function ehSlugDeFaixa(slug: string): boolean {
  return FAIXAS_DE_PRECO.some((f) => f.slug === slug);
}
