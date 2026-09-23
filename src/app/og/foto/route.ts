import sharp from "sharp";
import {
  ALTURA_CARD,
  LARGURA_CARD,
  fotoPodeVirarPrevia,
} from "../../../lib/compartilhamento";

/**
 * A foto do veículo no tamanho que o WhatsApp de PC e tablet aceita.
 *
 * O porquê está em `previaDaFotoDoVeiculo` (`lib/compartilhamento.ts`): o
 * servidor do WhatsApp Web/Desktop desiste de `og:image` acima de ~300 KB, e a
 * foto original do estoque passa disso. Aqui ela sai JPEG 1200×630, recortada
 * ao centro, que é o card grande sem faixa e sem esticar.
 *
 * JPEG e não WebP: o WhatsApp não renderiza WebP em prévia. A capa que chega
 * em WebP (`web_full_images`) também sai JPEG daqui.
 *
 * Mora em `/og/`, não em `/api/`, pelo mesmo motivo do card gerado: o
 * `robots.ts` bloqueia `/api/` e o crawler do Facebook obedece.
 */
export const runtime = "nodejs";

export async function GET(request: Request) {
  const foto = new URL(request.url).searchParams.get("u") || "";

  // Qualquer falha cai no card gerado: prévia genérica é melhor que nenhuma.
  const cardGerado = () => Response.redirect(new URL("/og", request.url), 302);

  if (!fotoPodeVirarPrevia(foto)) return cardGerado();

  try {
    const resposta = await fetch(foto, { signal: AbortSignal.timeout(8000) });
    if (!resposta.ok) return cardGerado();
    const original = Buffer.from(await resposta.arrayBuffer());

    const jpeg = await sharp(original)
      .rotate()
      .resize(LARGURA_CARD, ALTURA_CARD, { fit: "cover", position: "centre" })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();

    return new Response(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        // A URL carrega a foto: foto nova é URL nova. Pode ficar na borda.
        "Cache-Control": "public, max-age=604800, s-maxage=2592000, immutable",
      },
    });
  } catch (err) {
    console.warn("[OG] foto do veículo não virou prévia:", err);
    return cardGerado();
  }
}
