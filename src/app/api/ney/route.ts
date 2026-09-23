import { unstable_cache } from "next/cache";
import { recortesDoEstoque } from "../../../lib/hubsDeEstoque";
import { montarFichas } from "../../../lib/fichasParaOAssistente";

/**
 * A ficha técnica do pátio, escrita para o assistente do WhatsApp ler.
 *
 * ---------------------------------------------------------------------------
 * Por que esta rota existe, e por que ela não é o `llms-full.txt`
 * ---------------------------------------------------------------------------
 * Pedido do dono em 05/09/2026: o Ney precisa saber o mínimo sobre o carro
 * antes de abrir o atendimento — "não vai discutir valores, mas pode sanar
 * dúvidas do anúncio, aquecer o lead antes do consultor".
 *
 * O Captain do Chatwoot **não tem chamada de função** (`/captain/assistants/1/
 * tools` devolve 404, medido em 05/09). A única forma de ele conhecer o pátio
 * é DOCUMENTO INGERIDO, que é uma fotografia: o que entrar aqui fica congelado
 * até a próxima ingestão.
 *
 * Isso decide o conteúdo. Dado que ENVELHECE MAL e cujo erro é caro fica de
 * fora; dado que envelhece bem entra:
 *
 *   - **Preço: FORA.** Muda sem aviso, e um preço velho repetido no privado é
 *     a pior forma de errar. O `llms-full.txt` publica preço de propósito — ele
 *     serve a buscadores, que recarregam. Este arquivo serve a um assistente,
 *     que decora. São públicos diferentes com necessidades opostas, e é por
 *     isso que são duas rotas e não uma.
 *   - **Disponibilidade: FORA.** Nenhuma linha aqui diz "está disponível". A
 *     lista é dos veículos à venda no momento em que ela foi gerada, e o
 *     cabeçalho diz isso ao assistente com todas as letras.
 *   - **Ficha técnica: DENTRO.** Ano, km, câmbio, combustível, cor, carroceria,
 *     motor, opcionais e o estado da perícia mudam pouco ou nunca enquanto o
 *     carro está no pátio.
 *
 * ---------------------------------------------------------------------------
 * Um bloco por carro, cada um se bastando
 * ---------------------------------------------------------------------------
 * O Captain fatia o documento em pedaços e recupera o pedaço mais parecido com
 * a pergunta. Um bloco que dependa do cabeçalho para se identificar chega ao
 * modelo sem saber de que carro fala — por isso marca, modelo e ano se repetem
 * em toda linha de título, mesmo custando bytes.
 */

/**
 * Uma hora de cache, igual ao `llms-full.txt`.
 *
 * O sincronizador do RevendaMais roda de 6 em 6 horas, então uma hora aqui não
 * atrasa nada — e a fotografia que o Captain guarda é muito mais velha que
 * isso de qualquer jeito.
 */
const fichasDoPatio = unstable_cache(
  async (): Promise<string> => {
    const { disponiveis } = await recortesDoEstoque();
    return montarFichas(
      disponiveis,
      new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    );
  },
  ["fichas-para-o-assistente"],
  { tags: ["inventory"], revalidate: 3600 },
);

export async function GET() {
  return new Response(await fichasDoPatio(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
