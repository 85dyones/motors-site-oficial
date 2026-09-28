import { unstable_cache } from "next/cache";
import { getCachedSettings } from "../../../../lib/settings";
import { montarLoja } from "../../../../lib/lojaParaOAssistente";
import { parametrosDoFinanciamento } from "../../../../lib/parametrosDoFinanciamento-servidor";

/**
 * O que a loja é, escrito para o assistente do WhatsApp ler.
 *
 * ---------------------------------------------------------------------------
 * Por que uma rota, e não ingerir as páginas
 * ---------------------------------------------------------------------------
 * O Captain **rastreia os links da página que recebe**. Medido em 05/09/2026:
 * ingerir três URLs (`/api/ney`, `/garantia`, `/privacidade`) produziu
 * **48 documentos** — o rodapé do `/garantia` arrastou os treze hubs de marca,
 * as sete faixas de preço, dez âncoras da própria política de privacidade, o
 * `wa.me` e até o site da ANPD.
 *
 * Vinte e seis desses documentos carregavam preço de carro congelado, que é
 * exatamente o que o assistente está proibido de dizer. Apagá-los à mão e
 * reingerir a mesma página os traz de volta.
 *
 * `/api/ney` escapou porque é `text/plain`: sem `<a>`, não há o que seguir.
 * Esta rota é o mesmo truque aplicado ao institucional — o conteúdo das
 * páginas, sem a navegação que as acompanha.
 *
 * ---------------------------------------------------------------------------
 * A fonte é a mesma que o site publica
 * ---------------------------------------------------------------------------
 * Nada aqui é reescrito à mão. Garantia, financiamento, endereço e horário
 * saem de `paginasInstitucionais.ts` e das configurações — os mesmos módulos
 * que alimentam `/garantia`, `/financiamento` e o rodapé. Texto copiado
 * envelheceria em silêncio, e o assistente afirmaria no privado uma versão que
 * o site já corrigiu.
 */


const loja = unstable_cache(
  async (): Promise<string> => {
    const [{ companySettings }, financiamento] = await Promise.all([
      getCachedSettings(),
      // O ano mais antigo financiado e os bancos parceiros da vigência — os
      // mesmos que /financiamento publica.
      parametrosDoFinanciamento(),
    ]);
    return montarLoja(
      companySettings,
      new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      financiamento,
    );
  },
  ["institucional-para-o-assistente"],
  { revalidate: 3600 },
);

export async function GET() {
  return new Response(await loja(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
