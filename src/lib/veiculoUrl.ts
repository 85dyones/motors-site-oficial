/**
 * O primeiro segmento da URL de um veículo — `carros` ou `motos`.
 *
 * Criado em 2026-08-19 (P6 da `RECOMENDACAO_SEO.md`). Até aqui toda ficha
 * morava em `/carros/…`, inclusive as 4 motocicletas do estoque: a URL
 * anunciava carro para quem procurava moto, e quem chegava por busca via
 * "carros" no endereço de uma Harley.
 *
 * Feito agora porque são **4 veículos**. Cada moto vendida com a URL antiga
 * indexada encarece a troca, e o dono confirmou que motos deixam de ser
 * exceção no estoque.
 *
 * ---------------------------------------------------------------------------
 * Por que um módulo próprio, e não uma string em cada lugar
 * ---------------------------------------------------------------------------
 * O prefixo não é só endereço: `LeadPopup` decide se está numa ficha olhando
 * para ele, e `analytics` classifica a página do mesmo jeito. Espalhar
 * `"/carros/"` por esses arquivos fazia a moto nascer sem popup de lead e
 * classificada como "outra página" — falha silenciosa, do tipo que só aparece
 * num relatório meses depois.
 *
 * Este arquivo não importa nada: serve tanto ao servidor quanto ao cliente.
 */

/** Os segmentos que servem ficha de veículo. Ordem irrelevante. */
export const SEGMENTOS_DE_PDP = ["carros", "motos"] as const;
export type SegmentoDePdp = (typeof SEGMENTOS_DE_PDP)[number];

/**
 * A carroceria que o feed usa para moto.
 *
 * Vem do RevendaMais como "Motocicleta" e passa por `resolveTipo` antes de
 * chegar aqui. A comparação ignora caixa porque o feed já mandou
 * "MOTOCICLETA" e "motocicleta" no mesmo ciclo, e usa `startsWith` para
 * cobrir "Motoneta" e afins sem inventar uma lista.
 */
function ehMotocicleta(tipo: string | null | undefined): boolean {
  return (tipo ?? "").trim().toLowerCase().startsWith("moto");
}

/**
 * Onde a ficha deste veículo mora.
 *
 * Sem `tipo`, cai em `carros` — que é o comportamento anterior e o caso da
 * esmagadora maioria. Um veículo que chegue aqui sem a carroceria gera link
 * para o segmento errado, e é por isso que a ficha **redireciona** em vez de
 * servir os dois: o endereço errado existe, mas não indexa.
 */
export function segmentoDoVeiculo(veiculo: { tipo?: string | null }): SegmentoDePdp {
  return ehMotocicleta(veiculo.tipo) ? "motos" : "carros";
}

/** Este caminho é a ficha de um veículo? Usado por popup de lead e tracking. */
export function ehCaminhoDePdp(caminho: string): boolean {
  return SEGMENTOS_DE_PDP.some((s) => caminho.startsWith(`/${s}/`));
}

/** Este segmento de URL serve ficha? Qualquer outro é 404 na rota. */
export function ehSegmentoDePdp(valor: string): valor is SegmentoDePdp {
  return (SEGMENTOS_DE_PDP as readonly string[]).includes(valor);
}
