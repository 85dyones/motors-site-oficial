import { PLACE_ID_NO_GOOGLE } from "./schemaLoja";

/**
 * A URL de rota até a loja, no Google Maps.
 *
 * Estava montada dentro do JSX de `components/LinkComoChegar.tsx`, e a guarda
 * possível ali era ler a fonte e procurar o NOME `PLACE_ID_NO_GOOGLE` dentro do
 * template literal. Isso não guarda nada: um
 * `import { PERFIL_NO_GOOGLE as PLACE_ID_NO_GOOGLE }` deixava o texto do
 * arquivo idêntico, `tsc` limpo e os 1867 testes verdes — e a rota passava a
 * levar `destination_place_id=https://www.google.com/maps?cid=…`, cujo `?`
 * corta a query. O parâmetro deixava de existir e a rota voltava a depender do
 * geocode do texto, que é exatamente o defeito que ele foi acrescentado para
 * resolver.
 *
 * É a mesma lição que `lib/colunasDoRodape.ts` já registra, replantada dois
 * arquivos adiante no mesmo commit: eu apliquei onde a revisão apontou e não
 * onde ela valia. Aqui a URL é montada por função pura, e o teste compara a
 * string inteira com a URL de verdade — apelido de import não engana
 * comparação de string.
 *
 * ---------------------------------------------------------------------------
 * Por que os dois parâmetros
 * ---------------------------------------------------------------------------
 * `destination` é o que a pessoa lê na caixa de destino do Maps; sozinho, ele
 * é GEOCODIFICADO a cada clique, e endereço em texto tem homônimo, tem grafia
 * e é editável no painel. `destination_place_id` fixa o lugar por
 * identificador. O Google pede que venham juntos.
 *
 * O identificador é o mesmo que `lib/schemaLoja.ts` usa para declarar a ficha
 * em `sameAs`/`hasMap`. As duas URLs do Maps deste repositório continuam
 * diferentes de propósito — aqui é a ROTA até a loja, lá é o LUGAR — mas a
 * loja é identificada num lugar só.
 */
export function urlDaRota(endereco: string): string {
  const destino = (endereco || "").trim();
  if (!destino) return "";

  return (
    "https://www.google.com/maps/dir/?api=1" +
    `&destination=${encodeURIComponent(destino)}` +
    `&destination_place_id=${PLACE_ID_NO_GOOGLE}`
  );
}
