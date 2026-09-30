import { publicavel } from "./coerenciaDoCadastro";
import { getSinaisDeEstoque } from "./supabase";
import { decidirPublicacao, getDatasDeVenda } from "./publicacao";

/**
 * Como este veículo se apresenta: disponível, vendido ou indisponível, e se
 * continua no índice de busca. A regra vive em `lib/publicacao.ts`; aqui só se
 * junta o que o banco sabe.
 *
 * Chamada duas vezes por render — uma no `generateMetadata`, outra na página.
 * As duas consultas são leves (`getDatasDeVenda` é cacheada, e a de estoque lê
 * só id e carimbo), e a PDP renderiza no máximo uma vez por hora sob o ISR.
 */
export async function publicacaoDoVeiculo(veiculo: {
  id: string;
  vendido?: boolean;
  laudo_pericia?: string | null;
  whatsapp_images?: unknown;
}) {
  const [sinais, datasDeVenda] = await Promise.all([
    getSinaisDeEstoque(veiculo.id),
    getDatasDeVenda(),
  ]);

  return decidirPublicacao({
    vendido: veiculo.vendido,
    foraDoFeed: sinais.foraDoFeed,
    ultimaPresenca: sinais.ultimaPresenca,
    dataVenda: datasDeVenda[String(veiculo.id)],
    // A ficha continua respondendo 200 — `getVeiculoById` não filtra —, mas
    // sai do índice. Sem isto, o carro sairia da vitrine e seguiria ranqueando:
    // meia-medida, e a pior metade.
    bloqueadoParaPublicacao: !publicavel(veiculo),
  });
}
