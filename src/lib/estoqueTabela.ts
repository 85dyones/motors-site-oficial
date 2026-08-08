/**
 * Regras da tabela de estoque — tela A6 do design doc.
 *
 * O doc desenha os filtros como TODOS / PUBLICADOS / RASCUNHOS / RESERVADOS.
 * Rascunho e reservado são estados do fluxo de publicação (tela A16), que não
 * existe: no banco há `vendido` e `last_seen_at`, e nada mais. Os três estados
 * abaixo são os que se pode afirmar a partir do dado real — inventar "rascunho"
 * seria pintar de estado o que hoje é ausência de informação.
 *
 * Tudo aqui é função pura: a tela monta, esta camada decide.
 */

export type EstadoDoVeiculo = "publicado" | "vendido" | "fora_do_feed";

export const ROTULO_DO_ESTADO: Record<EstadoDoVeiculo, string> = {
  publicado: "Publicado",
  vendido: "Vendido",
  fora_do_feed: "Fora do feed",
};

/** Filtro da régua superior: os três estados mais "todos". */
export type FiltroDeEstado = EstadoDoVeiculo | "todos";

export interface LinhaDeEstoque {
  id: string;
  marca: string;
  modelo: string;
  versao: string;
  ano: number | null;
  quilometragem: number | null;
  preco: number | null;
  foto: string | null;
  fotos: number;
  estado: EstadoDoVeiculo;
  tipo: string;
  perfilUso: string;
  placa: string;
  destacado: boolean;
  /** `null` = GA4 sem credencial de leitura. Nunca 0 por engano. */
  visitas: number | null;
  leads: number;
  /** Marcado como vendido no JSON de overrides, mas disponível na coluna do
   *  banco — o site continua anunciando. Ver `painel-grava-json-e-coluna`. */
  divergente: boolean;
  /** Destaques rápidos associados à mão (vivem no JSON, não em coluna). */
  quickTags: string[];
}

/**
 * Estado de um veículo.
 *
 * `vendido` vence "fora do feed": um carro vendido some do feed no ciclo
 * seguinte, e mostrá-lo como "fora do feed" esconderia o motivo real.
 */
export function classificarEstado(
  veiculo: { vendido?: boolean | null },
  noUltimoSync: boolean,
): EstadoDoVeiculo {
  if (veiculo.vendido) return "vendido";
  if (!noUltimoSync) return "fora_do_feed";
  return "publicado";
}

export function contarPorEstado(
  linhas: Array<{ estado: EstadoDoVeiculo }>,
): Record<FiltroDeEstado, number> {
  const contagem: Record<FiltroDeEstado, number> = {
    todos: linhas.length,
    publicado: 0,
    vendido: 0,
    fora_do_feed: 0,
  };
  for (const l of linhas) contagem[l.estado] += 1;
  return contagem;
}

/**
 * Busca por marca, modelo, versão, código ou placa.
 *
 * Sem acento e sem caixa: quem digita "evoque" tem que achar "EVOQUE", e quem
 * digita "citroen" tem que achar "Citroën".
 */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function filtrarLinhas(
  linhas: LinhaDeEstoque[],
  opcoes: { estado?: FiltroDeEstado; busca?: string } = {},
): LinhaDeEstoque[] {
  const estado = opcoes.estado ?? "todos";
  const busca = normalizarBusca(opcoes.busca ?? "");

  return linhas.filter((l) => {
    if (estado !== "todos" && l.estado !== estado) return false;
    if (!busca) return true;
    const alvo = normalizarBusca(
      [l.marca, l.modelo, l.versao, l.id, l.placa].filter(Boolean).join(" "),
    );
    return alvo.includes(busca);
  });
}

/**
 * A versão a exibir sob o modelo, ou vazio quando ela não acrescenta nada.
 *
 * O feed do RevendaMais grava o modelo já com a versão embutida ("camaro ss
 * 6.2 v-8 2p") e repete o trecho na coluna `versao` ("ss 6.2 v-8 2p"). O
 * mapper capitaliza o modelo e deixa a versão crua, então a linha de baixo
 * saía como um eco em caixa baixa do que estava logo acima.
 */
export function versaoParaExibir(modelo: string, versao: string): string {
  const v = (versao ?? "").trim();
  if (!v) return "";
  const m = normalizarBusca(modelo ?? "");
  return m.includes(normalizarBusca(v)) ? "" : v;
}

/**
 * O id do veículo dentro do caminho da PDP.
 *
 * `getVeiculoPdpUrl` monta `/carros/<marca>/<modelo>/<versao>/<slug>-<id>`, e o
 * GA4 devolve exatamente esse caminho. O id é o último grupo de dígitos do
 * último segmento — não o primeiro que aparecer, senão um modelo com número no
 * nome ("208", "500") sequestraria a leitura.
 */
export function idDoCaminhoDaPagina(caminho: string): string | null {
  if (!caminho) return null;
  const semQuery = caminho.split("?")[0].replace(/\/+$/, "");
  const ultimo = semQuery.split("/").pop() ?? "";
  const casamento = ultimo.match(/-(\d+)$/);
  return casamento ? casamento[1] : null;
}

/** Caminhos do GA4 → visitas por veículo. Soma quando o mesmo id repete. */
export function mapaDeVisitas(
  paginas: Array<{ caminho: string; visitas: number }> | null,
): Record<string, number> | null {
  if (paginas === null) return null;
  const mapa: Record<string, number> = {};
  for (const p of paginas) {
    const id = idDoCaminhoDaPagina(p.caminho);
    if (!id) continue;
    mapa[id] = (mapa[id] ?? 0) + p.visitas;
  }
  return mapa;
}

/** Leads da tabela → contagem por veículo. Lead sem veículo não conta. */
export function contarLeadsPorVeiculo(
  leads: Array<{ veiculo_id?: number | string | null }>,
): Record<string, number> {
  const mapa: Record<string, number> = {};
  for (const l of leads) {
    if (l.veiculo_id === null || l.veiculo_id === undefined || l.veiculo_id === "") continue;
    const id = String(l.veiculo_id);
    mapa[id] = (mapa[id] ?? 0) + 1;
  }
  return mapa;
}
