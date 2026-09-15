import type { ContextoDaEncomenda } from "./encomenda";
import type { HubDeMarca } from "./hubsDeEstoque";
import type { Veiculo } from "../types";
import { precoVigente } from "./regrasEstoque";
import { ehSegmentoDePdp, type SegmentoDePdp } from "./veiculoUrl";

/**
 * O que sobra quando a ficha do veículo não existe.
 *
 * ---------------------------------------------------------------------------
 * Por que o caminho, e não os params
 * ---------------------------------------------------------------------------
 * `not-found.tsx` não recebe `params`. O contexto do visitante ("eu queria um
 * Nivus") só existe na URL, e quem lê a URL nessa posição é `usePathname`, no
 * cliente.
 *
 * Daí a divisão deste módulo: aqui mora a parte PURA — texto entra, contexto
 * sai —, e ela é o que o teste cobre. O componente só amarra `usePathname` a
 * esta função.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ Nada aqui pode arrastar o Supabase para o bundle
 * ---------------------------------------------------------------------------
 * Este arquivo é lido por um client component. `lib/hubsDeEstoque` importa o
 * cliente do Supabase, então ele entra aqui SÓ como tipo (apagado na
 * compilação) — mesma nota de `lib/coerenciaDoCadastro.ts` e
 * `lib/faixasDePreco.ts`.
 *
 * Os dois imports de VALOR são `lib/veiculoUrl` e `lib/regrasEstoque`, e os
 * dois são limpos: `veiculoUrl` já roda no navegador via `lib/dataLayer.ts`, e
 * `regrasEstoque` tem uma linha de import, `import type`. Quem mexer aqui
 * confere o grafo, não a lista — esta frase já esteve errada uma vez, dizendo
 * "sem imports além de tipos e de `veiculoUrl`" enquanto `precoVigente` entrava
 * logo abaixo.
 */

/** Uma marca do estoque, magra o bastante para atravessar a fronteira. */
export interface MarcaConhecida {
  slug: string;
  nome: string;
  segmento: SegmentoDePdp;
  /** Quantos à venda agora, nesta marca. */
  total: number;
  modelos: { slug: string; nome: string; total: number }[];
}

/** O hub que atende quem procurava isto — só quando ele tem carro. */
export interface HubComEstoque {
  rotulo: string;
  href: string;
  total: number;
}

export interface FichaPerdida {
  /** O que o formulário recebe. `marca` vazia quando não há nada a afirmar. */
  encomenda: ContextoDaEncomenda;
  hubComEstoque: HubComEstoque | null;
}

/**
 * O recorte público das marcas — `slug`, `nome` e a contagem.
 *
 * O corte acontece AQUI, na fronteira, e não no componente que consome. Prop
 * de client component é payload público: foi assim que `preco_compra` saiu no
 * HTML do `/estoque`. `HubDeMarca` carrega `Veiculo[]` inteiro em dois níveis,
 * e nada disso precisa chegar ao navegador para escrever "Volkswagen Nivus".
 */
export function indiceDeMarcas(hubs: HubDeMarca[]): MarcaConhecida[] {
  return hubs.map((hub) => ({
    slug: hub.slug,
    nome: hub.nome,
    segmento: hub.segmento,
    total: hub.veiculos.length,
    modelos: hub.modelos.map((modelo) => ({
      slug: modelo.slug,
      nome: modelo.nome,
      total: modelo.veiculos.length,
    })),
  }));
}

/**
 * A marca e o modelo que o caminho da ficha prometia.
 *
 * ---------------------------------------------------------------------------
 * Nunca humanizar o slug
 * ---------------------------------------------------------------------------
 * `ContextoDaEncomenda.marca` diz *"vem do hub, não digitado"*. Slug que não
 * casa com marca conhecida sai com `marca: ""` — e não com um `Foo`
 * capitalizado que viraria pedido de encomenda gravado no banco.
 *
 * ---------------------------------------------------------------------------
 * O formulário só afirma o que a página sustenta
 * ---------------------------------------------------------------------------
 * `mensagemDaEncomenda` escreve, na voz do cliente: *"Vi que não tem no
 * estoque agora — me avisem quando entrar"*. Nos hubs isso é verdade porque o
 * formulário só aparece com a grade vazia; aqui a grade é vazia por
 * construção, então a guarda não vale.
 *
 * A regra: **o contexto só vai ao formulário quando o hub correspondente está
 * zerado.** Com carro no hub, o contexto vira LINK (R6 — página sem estoque
 * linka para onde há estoque) e o formulário fica genérico. Sem isso a página
 * dizia "quando entrar Volkswagen Nivus, um consultor avisa" com um Nivus
 * visível na mesma tela — e gravava a mentira no `interesse` do lead.
 *
 * O que isso resolve, e o que NÃO resolve: tira o SUJEITO da afirmação, não a
 * afirmação. Sem contexto, `mensagemDaEncomenda` ainda grava "Procuro carro
 * (…). Vi que não tem no estoque agora" numa página que mostra seis carros. A
 * frase é de `lib/encomenda.ts`, compartilhada com 37 hubs, e trocá-la por uma
 * variante sem essa oração é escopo de outro PR — não deste, que já mexeu no
 * que podia mexer sozinho.
 *
 * O `caminho` é sempre o que a pessoa abriu, e não o hub: é ele que conta ao
 * consultor que o clique veio de um endereço morto.
 */
export function contextoDaFichaPerdida(
  caminho: string,
  marcas: MarcaConhecida[],
): FichaPerdida {
  const partes = caminho.toLowerCase().split("/").filter(Boolean);
  const [primeiro, slugMarca, slugModelo] = partes;

  const segmento: SegmentoDePdp =
    primeiro && ehSegmentoDePdp(primeiro) ? primeiro : "carros";
  const vazio: FichaPerdida = {
    encomenda: { marca: "", modelo: null, caminho, segmento },
    hubComEstoque: null,
  };

  // Quatro segmentos é a forma da ficha: `/carros/{marca}/{modelo}/{ficha}`.
  // Menos que isso é hub, e hub tem página própria — não cai aqui.
  if (partes.length < 4) return vazio;
  if (!primeiro || !ehSegmentoDePdp(primeiro)) return vazio;

  const marca = marcas.find((m) => m.slug === slugMarca && m.segmento === segmento);
  if (!marca) return vazio;

  const modelo = marca.modelos.find((m) => m.slug === slugModelo);
  const caminhoDaMarca = `/${segmento}/${marca.slug}`;

  if (modelo && modelo.total > 0) {
    return {
      encomenda: { marca: "", modelo: null, caminho, segmento },
      hubComEstoque: {
        rotulo: `${marca.nome} ${modelo.nome}`,
        href: `${caminhoDaMarca}/${modelo.slug}`,
        total: modelo.total,
      },
    };
  }

  if (!modelo && marca.total > 0) {
    return {
      encomenda: { marca: "", modelo: null, caminho, segmento },
      hubComEstoque: { rotulo: marca.nome, href: caminhoDaMarca, total: marca.total },
    };
  }

  return {
    encomenda: { marca: marca.nome, modelo: modelo?.nome ?? null, caminho, segmento },
    // Modelo zerado numa marca com estoque: a encomenda do modelo é honesta
    // (não temos ESTE), e o link da marca resolve quem aceita o vizinho.
    hubComEstoque:
      marca.total > 0
        ? { rotulo: marca.nome, href: caminhoDaMarca, total: marca.total }
        : null,
  };
}

/**
 * Os `limite` carros que a 404 mostra — uma amostra do pátio, não um topo.
 *
 * ---------------------------------------------------------------------------
 * Por que não é `disponiveis.slice(0, 6)`
 * ---------------------------------------------------------------------------
 * Porque `getEstoque` ordena por `preco desc` e `disponiveisDe` preserva a
 * ordem. Medido contra o pátio real de 11/09, a primeira versão desta página
 * abria com X4 de R$ 318.900, Camaro SS de R$ 229.900 e X1 de R$ 179.900 —
 * numa loja de mediana R$ 61.900 e piso R$ 13.900, cujo `POSICIONAMENTO.md`
 * manda **evitar** "premium, luxo, exclusivo". Quem clicou num anúncio de um
 * hatch de R$ 40 mil recebia uma parede de carro caro.
 *
 * ---------------------------------------------------------------------------
 * Por que também não é "os que entraram por último"
 * ---------------------------------------------------------------------------
 * Foi a primeira correção tentada, e o dado a derrubou: **13 dos 88** veículos
 * com `vendido = false` têm `first_seen_at` (medido em produção em 11/09).
 * Ordenar por chegada congelaria a seção em treze carros para sempre, e os
 * outros 75 nunca apareceriam — bias pior que o do preço, porque invisível.
 * `created_at` está nas 88 linhas, mas não é mapeado para `Veiculo`, e
 * mapeá-lo para resolver isto seria mexer no contrato de leitura por causa de
 * uma seção.
 *
 * ---------------------------------------------------------------------------
 * A régua que ficou
 * ---------------------------------------------------------------------------
 * Amostra igualmente espaçada ao longo do preço vigente, extremos inclusos.
 * Não é número de negócio (nada aqui vem do manual) — é regra de apresentação,
 * da mesma natureza da banda de `lib/similares.ts`, e serve a uma coisa só:
 * nenhuma faixa monopoliza a página. Quem cai aqui veio de um carro que não
 * existe mais, e a loja não sabe quanto ele queria gastar.
 *
 * `precoVigente` e não `preco_original`: o preço da vitrine vive em três
 * colunas, e ordenar pela errada põe um promocional de R$ 15 mil no lugar de um
 * carro de R$ 200 mil. Desempate por id, estável, pela mesma razão de
 * `similares.ts`: a página é ISR, e ordem que muda entre builds troca os cards
 * sem razão visível.
 */
export function patioEmDestaque(disponiveis: Veiculo[], limite: number): Veiculo[] {
  const porPreco = [...disponiveis].sort((a, b) => {
    const diferenca = precoVigente(a) - precoVigente(b);
    return diferenca !== 0 ? diferenca : a.id.localeCompare(b.id);
  });

  if (limite < 2 || porPreco.length <= limite) return porPreco.slice(0, Math.max(limite, 0));

  const ultimo = porPreco.length - 1;
  return Array.from(
    { length: limite },
    (_, i) => porPreco[Math.round((i * ultimo) / (limite - 1))]!,
  );
}
