import { unstable_cache } from "next/cache";
import { montarRepasse } from "../../../../lib/repasseParaOAssistente";

/**
 * O Repasse Motors, escrito para o assistente do WhatsApp ler.
 *
 * `text/plain` pelo mesmo motivo de `/api/ney/loja`: o Captain rastreia os
 * links da página que recebe, e ingerir `/repasse` traria junto os carros do
 * lote, com preço congelado, e o resto do site pelo rodapé. Texto puro não tem
 * `<a>`, então não há o que seguir. A montagem e o porquê de ser um documento
 * separado estão em `repasseParaOAssistente.ts`.
 */

const repasse = unstable_cache(
  async (): Promise<string> =>
    montarRepasse(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })),
  ["repasse-para-o-assistente"],
  { revalidate: 3600 },
);

export async function GET() {
  return new Response(await repasse(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
