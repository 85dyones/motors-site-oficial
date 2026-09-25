/**
 * Imagem de prévia com o tamanho declarado no cabeçalho.
 *
 * Achado de 25/09: no WhatsApp de PC a prévia saía sem imagem em TODA página —
 * a home (card de `/og`) e a ficha (foto de `/og/foto`), mesmo com o arquivo
 * já em 1200×630 e bem abaixo de 300 KB. O que as duas rotas tinham em comum
 * era sair em `Transfer-Encoding: chunked`, sem `Content-Length`: o
 * `ImageResponse` é um stream, e um `Response` com corpo em bytes também saía
 * fatiado da Vercel. A foto original do Supabase, que declara o tamanho, era a
 * única imagem do site com `Content-Length`.
 *
 * O WhatsApp de PC impõe teto de tamanho à imagem da prévia, e o jeito de ele
 * saber o tamanho antes de baixar é esse cabeçalho. Sem ele, a imagem é
 * descartada em silêncio — e o celular, que monta a prévia no aparelho, segue
 * mostrando, o que esconde o defeito de quem testa pelo telefone.
 */
export function respostaDeImagem(
  bytes: ArrayBuffer | Uint8Array,
  tipo: string,
  cacheControl: string,
): Response {
  // Cópia em `ArrayBuffer` próprio: o `Buffer` do sharp aponta para um pool
  // compartilhado, que o tipo de `BodyInit` não aceita.
  const corpo = new Uint8Array(bytes);
  return new Response(corpo, {
    headers: {
      "Content-Type": tipo,
      "Content-Length": String(corpo.byteLength),
      "Cache-Control": cacheControl,
    },
  });
}
