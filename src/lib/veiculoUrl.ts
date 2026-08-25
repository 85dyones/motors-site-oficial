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

/**
 * A slugificação dos segmentos de URL de veículo, num lugar só.
 *
 * Nasceu dentro de `getVeiculoPdpUrl` (`lib/supabase.ts`) e vive aqui desde
 * que os hubs de marca e modelo passaram a existir: `/carros/jeep/renegade`
 * precisa gerar exatamente o mesmo segmento que a ficha usa, senão o hub não
 * casa com a URL do veículo que ele deveria listar — e o link interno cai num
 * 404 sem ninguém perceber.
 *
 * Comportamento preservado do original, defeitos incluídos: caractere
 * acentuado é REMOVIDO, não transliterado ("citroën" → "citron"). Corrigir
 * isso agora renomearia URLs de ficha já indexadas, que é exatamente o que a
 * §2.2.2b do plano manda não fazer. Quem quiser transliterar, faça numa
 * migração própria, com 301.
 */
export function slugificar(bruto: string): string {
  return bruto
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
}

/**
 * O segmento de marca da URL — `jeep` em `/carros/jeep/renegade`.
 *
 * Sem fallback silencioso: marca vazia devolve "", e quem chama decide. O
 * `getVeiculoPdpUrl` mantém o dele ("veiculo"), que é comportamento antigo e
 * está gravado em URL indexada.
 */
export function slugDeMarca(marca: string): string {
  return slugificar(marca);
}

/**
 * O segmento de modelo — `renegade` em `/carros/jeep/renegade`.
 *
 * O RevendaMais manda o modelo com a marca na frente ("Chevrolet Cruze") e às
 * vezes com a versão no fim ("Cruze LTZ 1.4 Turbo"). As duas limpezas são as
 * mesmas que a ficha aplica; repeti-las aqui é o que garante que hub e ficha
 * cheguem ao mesmo texto.
 */
export function limparModelo(marca: string, modelo: string, versao: string): string {
  const marcaLower = marca.toLowerCase().trim();
  const versaoLower = versao.toLowerCase().trim();
  let limpo = modelo.toLowerCase().trim();

  if (marcaLower && limpo.startsWith(marcaLower)) {
    limpo = limpo.slice(marcaLower.length).trim();
  }
  if (versaoLower && limpo.endsWith(versaoLower)) {
    limpo = limpo.slice(0, limpo.length - versaoLower.length).trim();
  }

  return limpo;
}

/** O mesmo texto de `limparModelo`, já em forma de segmento de URL. */
export function slugDeModelo(marca: string, modelo: string, versao: string): string {
  return slugificar(limparModelo(marca, modelo, versao) || modelo);
}
