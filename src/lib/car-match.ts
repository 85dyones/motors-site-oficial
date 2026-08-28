import { getEstoque, Veiculo } from "./supabase";
import { slugificar } from "./veiculoUrl";

/**
 * O casamento entre o que o visitante responde e o que o carro é.
 *
 * ---------------------------------------------------------------------------
 * Três vocabulários que não se falavam
 * ---------------------------------------------------------------------------
 * Até 2026-08-28 este arquivo adivinhava a "cara" do veículo por pedaço de
 * nome — `defender`, `x5`, `911`, `dolphin`, `renegade` — e produzia etiquetas
 * de um vocabulário próprio (`luxury`, `premium`, `popular`). O quiz, do outro
 * lado, mandava os IDS das respostas (`family`, `comfort`, `tech`,
 * `immediate`). E o cadastro real do carro passou a ter um terceiro: os oito
 * `perfis_uso` e as doze carrocerias.
 *
 * Medido contra os 35 veículos servidos:
 *
 *   OBJETIVO      1 de 4 respostas alcançava alguma etiqueta
 *   ESTILO        2 de 5
 *   EXPERIÊNCIA   0 de 4
 *   PRAZO         0 de 3
 *
 *   → **108 das 240 combinações de respostas devolviam ZERO carro.**
 *
 * Os nomes cravados eram do catálogo fictício (`MOCK_ESTOQUE`), não do pátio.
 * Agora as etiquetas saem dos campos que alguém de fato preencheu: `perfis_uso`
 * e `tipo`, os mesmos que alimentam `/estoque/{recorte}`. O que a vitrine e o
 * quiz dizem sobre um carro passa a ser a mesma coisa.
 */

/**
 * O que cada resposta do quiz quer dizer no cadastro.
 *
 * Lista vazia significa "não restringe": `open` ("aberto a sugestões") e as
 * três de PRAZO. **PRAZO nunca foi critério de carro** — é qualificação de
 * lead para o consultor, e entrava no filtro só porque a chamada juntava as
 * quatro respostas num array só. Uma pessoa com pressa não quer outro carro;
 * quer o mesmo carro mais rápido.
 */
export const TAGS_DA_RESPOSTA: Record<string, readonly string[]> = {
  // 02 · objetivo — por que está comprando
  family: ["familia"],
  status: ["performance"],
  efficiency: ["urbano", "economico"],
  offroad: ["off-road", "trabalho"],

  // 03 · experiência — o que valoriza ao dirigir
  performance: ["performance"],
  comfort: ["familia", "estrada"],
  tech: ["urbano"],
  economy: ["economico"],

  // 04 · estilo — carroceria, no vocabulário de `CARROCERIAS`
  suv: ["suv"],
  sedan: ["sedan"],
  sport: ["esportivo", "coupe"],
  pickup: ["picape", "utilitario"],
  open: [],

  // 05 · prazo — de propósito sem efeito no filtro
  immediate: [],
  researching: [],
  future: [],
};

/**
 * Traduz respostas do quiz para etiquetas de veículo.
 *
 * O que não estiver na tabela passa direto: `/api/match?tags=suv` é chamada
 * pública e continua funcionando com o nome da etiqueta em si.
 */
export function tagsDeConsulta(respostas: string[]): string[] {
  const saida: string[] = [];
  for (const bruta of respostas) {
    const chave = bruta.toLowerCase().trim();
    if (!chave) continue;
    const traduzida = TAGS_DA_RESPOSTA[chave];
    if (traduzida) saida.push(...traduzida);
    else saida.push(chave);
  }
  return [...new Set(saida)];
}

export function calculateMatchScore(veiculo: Veiculo, queryTags: string[]): number {
  const alvo = tagsDeConsulta(queryTags);
  // Sem nada que restrinja (só orçamento, ou só PRAZO), todo carro do pátio
  // serve igualmente — 100, e não uma nota inventada.
  if (alvo.length === 0) return 100;
  const vehicleTags = getVehicleTags(veiculo);
  const matchCount = alvo.filter((t) => vehicleTags.includes(t)).length;
  return Math.min(100, Math.round((matchCount / alvo.length) * 70 + 30));
}

export interface MatchOptions {
  tags?: string[];
  budget?: number;
}

/**
 * As etiquetas de um veículo — tiradas do cadastro, não do nome.
 *
 * `perfis_uso` é a lista que o painel marca (um carro pode ser urbano E
 * econômico E primeiro carro); `tipo` é a carroceria da lista fechada. Os dois
 * são os mesmos campos de `/estoque/{recorte}`, e `slugificar` é a mesma
 * função que monta aquelas URLs — é o que garante que "SUV" no quiz e
 * `/estoque/suv` queiram dizer a mesma coisa.
 *
 * Câmbio e combustível entram porque são fato objetivo do carro e aparecem em
 * pergunta de gente de verdade. `perfil_uso` (singular, legado) continua sendo
 * lido para a linha que ainda não passou pelo backfill.
 */
export function getVehicleTags(veiculo: Veiculo): string[] {
  const tags = new Set<string>();

  const perfis = veiculo.perfis_uso ?? [];
  for (const perfil of perfis) {
    const slug = slugificar(perfil);
    if (slug) tags.add(slug);
  }
  // O campo antigo entra SÓ como rede, quando a lista nova está vazia.
  // Somar os dois sempre enchia o conjunto de lixo: "Família / Conforto"
  // slugifica para `familia--conforto`, que nenhuma resposta alcança e que
  // ainda por cima passaria a parecer uma etiqueta válida para quem lesse a
  // saída. Medido em 28/08: os 35 veículos servidos têm `perfis_uso`.
  if (perfis.length === 0) {
    const legado = slugificar(veiculo.perfil_uso ?? "");
    if (legado) tags.add(legado);
  }

  const carroceria = slugificar(veiculo.tipo ?? "");
  if (carroceria) tags.add(carroceria);

  const cambio = (veiculo.cambio ?? "").toLowerCase();
  if (cambio.includes("autom")) tags.add("automatico");
  else if (cambio.includes("manual")) tags.add("manual");

  const combustivel = (veiculo.combustivel ?? "").toLowerCase();
  if (combustivel.includes("elétrico") || combustivel.includes("eletrico")) tags.add("eletrico");
  else if (combustivel.includes("híbrido") || combustivel.includes("hibrido") || combustivel.includes("mhev")) tags.add("hibrido");
  else if (combustivel.includes("diesel")) tags.add("diesel");
  else if (combustivel.includes("flex")) tags.add("flex");

  return [...tags];
}

/**
 * Os que casam com as etiquetas — ou todos, quando nenhum casa.
 *
 * Separado de `matchVehicles` para ser testável sem banco: é ESTA a garantia
 * que a rodada de 28/08 comprou, e uma asserção sobre o texto do código não a
 * prova. Cinco perguntas respondidas e "nenhum carro" era o desfecho de 108
 * das 240 combinações; deixar isso preso dentro de uma função que abre conexão
 * é deixar a garantia sem trava.
 */
export function comEtiquetasOuTodos<T extends Veiculo>(carros: T[], alvo: string[]): T[] {
  if (alvo.length === 0) return carros;
  const casando = carros.filter((veiculo) => {
    const doVeiculo = getVehicleTags(veiculo);
    return alvo.some((tag) => doVeiculo.includes(tag));
  });
  return casando.length > 0 ? casando : carros;
}

/**
 * Os veículos recomendados, do mais aderente ao menos.
 *
 * ⚠️ **Nunca devolve lista vazia por causa das etiquetas.** Quando nada casa,
 * cai para o que cabe no orçamento em vez de encerrar o quiz sem sugestão —
 * cinco perguntas respondidas e "nenhum carro" é o pior desfecho possível, e
 * era o que 108 das 240 combinações produziam. O orçamento continua sendo
 * filtro de verdade: sugerir carro fora do que a pessoa disse poder pagar
 * seria pior que não sugerir.
 */
export async function matchVehicles(options: MatchOptions): Promise<(Veiculo & { score?: number })[]> {
  const { tags = [], budget } = options;
  const alvo = tagsDeConsulta(tags);
  const estoque = await getEstoque();

  const noOrcamento = estoque.filter((veiculo) => {
    // Veículo vendido não entra na curadoria. `getEstoque` devolve o estoque
    // inteiro, vendidos inclusive — quem exibe é que filtra. Aqui não fazia: o
    // Profiler chegava a sugerir carro que já saiu do pátio, e o consultor
    // recebia o lead com uma recomendação impossível.
    if (veiculo.vendido) return false;

    const precoEfetivo = veiculo.preco_promocional > 0 ? veiculo.preco_promocional : veiculo.preco_original;
    if (budget !== undefined && precoEfetivo > budget) return false;

    return true;
  });

  const filtered = comEtiquetasOuTodos(noOrcamento, alvo);

  return filtered
    .sort((a, b) => {
      const precoA = a.preco_promocional > 0 ? a.preco_promocional : a.preco_original;
      const precoB = b.preco_promocional > 0 ? b.preco_promocional : b.preco_original;

      if (alvo.length > 0) {
        const tagsA = getVehicleTags(a);
        const tagsB = getVehicleTags(b);
        const countA = alvo.filter((t) => tagsA.includes(t)).length;
        const countB = alvo.filter((t) => tagsB.includes(t)).length;
        if (countA !== countB) return countB - countA;
      }

      // Desempate pelo maior preço: dentro da mesma aderência, o carro melhor
      // equipado tende a ser o que a pessoa quer ver primeiro.
      return precoB - precoA;
    })
    .map((veiculo) => ({ ...veiculo, score: calculateMatchScore(veiculo, tags) }));
}
