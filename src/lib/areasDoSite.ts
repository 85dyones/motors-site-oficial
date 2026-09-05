/**
 * Áreas da home — tela A3 do design doc.
 *
 * O doc descreve a tela assim: "cada seção da home como uma linha: ordem,
 * visibilidade e conteúdo no mesmo lugar", e a regra que a acompanha é
 * "desligar uma seção a remove do site sem apagar o conteúdo".
 *
 * Este arquivo é o CATÁLOGO das seções que a home sabe renderizar. Ele não
 * guarda conteúdo — o conteúdo continua onde já estava (`about`,
 * `procedencia`, `instagram_curadoria`, `quick_tags`…). O que nasce aqui é a
 * camada que faltava: ordem e visibilidade, que até 2026-08-07 estavam
 * fixas no JSX de `src/app/page.tsx`.
 *
 * Por que o catálogo é código e não banco: cada seção corresponde a um bloco
 * de JSX que precisa existir para ser renderizado. Uma seção "cadastrável"
 * pelo painel não teria como se desenhar sozinha — seria uma linha órfã
 * prometendo algo que a home não sabe mostrar.
 */

/** Vocabulário de tipo do doc — vira a etiqueta na linha da seção. */
export type TipoDeArea =
  | "DINÂMICO"
  | "SISTEMA"
  | "ESTOQUE"
  | "FERRAMENTA"
  | "CURADO"
  | "WIDGET";

export interface DefinicaoDeArea {
  /** Slug estável: é o que fica gravado. Renomear quebra a config salva. */
  id: string;
  nome: string;
  descricao: string;
  tipo: TipoDeArea;
  /**
   * Onde se edita o CONTEÚDO desta seção. É o link "EDITAR" da linha — e o
   * que permite as abas soltas do painel serem alcançadas por aqui, em vez
   * de cada uma ocupar um item próprio no trilho lateral.
   * `null` = seção sem conteúdo editável (monta-se sozinha do estoque).
   */
  editarEm: string | null;
  /**
   * Seção que não pode ser desligada. O doc mostra interruptor em todas,
   * mas duas sustentam a navegação do site: sem busca e sem catálogo o
   * visitante não chega a veículo nenhum, e a home vira uma landing sem
   * saída. Desligá-las seria um tiro no pé silencioso.
   */
  fixa?: boolean;
}

/**
 * As seções que `src/app/page.tsx` renderiza, na ordem em que aparecem hoje.
 * Essa ordem é o padrão de fábrica: sem nada salvo, o site continua
 * exatamente como está.
 */
export const AREAS_DA_HOME: DefinicaoDeArea[] = [
  {
    id: "hero",
    nome: "Hero — banner dinâmico",
    descricao: "Carrossel de veículos curados, com contador de estoque e marcas.",
    tipo: "DINÂMICO",
    editarEm: "/admin/configuracoes?tab=destaques",
    fixa: true,
  },
  {
    id: "busca",
    nome: "Busca em régua",
    descricao: "Filtros de marca, modelo e faixa de preço sobre o estoque.",
    tipo: "SISTEMA",
    editarEm: null,
    fixa: true,
  },
  {
    id: "destaques_rapidos",
    nome: "Destaques rápidos",
    descricao: "Trilho de categorias; cada uma é uma landing indexável.",
    tipo: "ESTOQUE",
    editarEm: "/admin/configuracoes?tab=destaques",
  },
  {
    id: "estoque_selecionado",
    nome: "Estoque selecionado",
    descricao: "Grade com os veículos em destaque da semana.",
    tipo: "ESTOQUE",
    editarEm: "/admin/estoque",
  },
  // As faixas de preço entraram em 2026-09-05. `/estoque/ate-60-mil` e as duas
  // irmãs recebiam link só das carrocerias, de `/financiamento` e de
  // `/garantia` — nunca da home, que é a página de maior autoridade do site.
  // `normalizarAreas` põe seção nova no fim da ordem salva, então ela nasce
  // visível; o lugar dela na home é decisão do dono, na tela A3.
  {
    id: "faixas_de_preco",
    nome: "Por faixa de preço",
    descricao: "Três links para os hubs de faixa, com a contagem de cada um.",
    tipo: "ESTOQUE",
    editarEm: null,
  },
  {
    id: "consultoria",
    nome: "Garagem Profiler",
    descricao: "Chamada da consultoria em três passos.",
    tipo: "FERRAMENTA",
    editarEm: null,
  },
  {
    id: "venda_troca",
    nome: "Avaliação Express",
    descricao: "Chamada de venda ou troca do veículo do visitante.",
    tipo: "FERRAMENTA",
    editarEm: null,
  },
  // A faixa de procedência NÃO entra aqui: verificado em 2026-08-07, ela é
  // renderizada na PDP (`/carros/…`), não na home. O doc prevê abas Home /
  // Catálogo / PDP / Sobre nesta tela — ela pertence à aba PDP, quando as
  // outras páginas entrarem.
  {
    id: "reputacao",
    nome: "O que dizem os clientes",
    descricao: "Nota e avaliações verificadas do Google.",
    tipo: "CURADO",
    editarEm: null,
  },
  {
    id: "instagram",
    nome: "Feed do Instagram",
    descricao: "Publicações curadas no painel, com legenda e link.",
    tipo: "WIDGET",
    editarEm: "/admin/configuracoes?tab=instagram",
  },
  {
    id: "contato",
    nome: "Faixa de contato",
    descricao: "Bloco final em vermelho com o CTA de WhatsApp.",
    tipo: "SISTEMA",
    editarEm: "/admin/configuracoes?tab=empresa",
  },
];

/** Config salva: ordem das seções e quais estão desligadas. */
export interface ConfigDasAreas {
  /** Ids na ordem de exibição. Ids desconhecidos são ignorados na leitura. */
  ordem: string[];
  /** Ids desligados. Seção fixa nunca entra aqui. */
  ocultas: string[];
}

export const CONFIG_PADRAO: ConfigDasAreas = {
  ordem: AREAS_DA_HOME.map((a) => a.id),
  ocultas: [],
};

/**
 * Normaliza o que veio do banco.
 *
 * Regras, todas pela mesma razão — config salva não pode derrubar seção do
 * site por descuido:
 *
 * - id desconhecido na ordem é descartado (seção removida do código);
 * - seção do catálogo ausente da ordem entra no fim (seção nova entra
 *   visível, em vez de sumir até alguém salvar de novo);
 * - seção `fixa` nunca fica oculta, mesmo que o JSON diga o contrário.
 */
export function normalizarAreas(bruto: unknown): ConfigDasAreas {
  const dado = (bruto ?? {}) as Partial<ConfigDasAreas>;
  const conhecidos = new Set(AREAS_DA_HOME.map((a) => a.id));

  const ordemBruta = Array.isArray(dado.ordem) ? dado.ordem : [];
  const ordem = ordemBruta.filter(
    (id, i) => typeof id === "string" && conhecidos.has(id) && ordemBruta.indexOf(id) === i,
  );
  for (const a of AREAS_DA_HOME) {
    if (!ordem.includes(a.id)) ordem.push(a.id);
  }

  const fixas = new Set(AREAS_DA_HOME.filter((a) => a.fixa).map((a) => a.id));
  const ocultasBrutas = Array.isArray(dado.ocultas) ? dado.ocultas : [];
  const ocultas = ocultasBrutas.filter(
    (id, i) =>
      typeof id === "string" &&
      conhecidos.has(id) &&
      !fixas.has(id) &&
      ocultasBrutas.indexOf(id) === i,
  );

  return { ordem, ocultas };
}

/** As seções visíveis, já na ordem — o que a home percorre para renderizar. */
export function areasVisiveis(config: ConfigDasAreas): DefinicaoDeArea[] {
  const porId = new Map(AREAS_DA_HOME.map((a) => [a.id, a]));
  return config.ordem
    .filter((id) => !config.ocultas.includes(id))
    .map((id) => porId.get(id))
    .filter((a): a is DefinicaoDeArea => Boolean(a));
}

/** Move uma seção uma posição para cima ou para baixo. */
export function moverArea(
  config: ConfigDasAreas,
  id: string,
  direcao: "cima" | "baixo",
): ConfigDasAreas {
  const ordem = [...config.ordem];
  const i = ordem.indexOf(id);
  if (i < 0) return config;
  const j = direcao === "cima" ? i - 1 : i + 1;
  if (j < 0 || j >= ordem.length) return config;
  [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  return { ...config, ordem };
}

/** Liga/desliga uma seção. Seção fixa é ignorada. */
export function alternarArea(config: ConfigDasAreas, id: string): ConfigDasAreas {
  const def = AREAS_DA_HOME.find((a) => a.id === id);
  if (!def || def.fixa) return config;
  const ocultas = config.ocultas.includes(id)
    ? config.ocultas.filter((o) => o !== id)
    : [...config.ocultas, id];
  return { ...config, ocultas };
}
