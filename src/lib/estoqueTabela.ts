/**
 * Regras da tabela de estoque — tela A6 do design doc.
 *
 * O doc desenha os filtros como TODOS / PUBLICADOS / RASCUNHOS / RESERVADOS.
 * Rascunho e reservado são estados do fluxo de publicação (tela A16), que não
 * existe: inventá-los seria pintar de estado o que hoje é ausência de
 * informação. Os estados abaixo são os que se pode AFIRMAR a partir do dado
 * real — `vendido`, o carimbo de sync e a régua de publicação.
 *
 * Tudo aqui é função pura: a tela monta, esta camada decide.
 *
 * ---------------------------------------------------------------------------
 * A direção da dependência
 * ---------------------------------------------------------------------------
 * Este módulo importa `coerenciaDoCadastro`; o contrário nunca. Aquele arquivo
 * não tem import nenhum de propósito — ele é desenhado por componente de
 * cliente, e um import de `./supabase` lá arrastaria o cliente do banco para o
 * bundle do navegador. Como ele não importa ninguém, importá-lo daqui é seguro:
 * esta camada também viaja para o cliente, via `TabelaDeEstoque`.
 */

import { publicavel, type MotivoDeBloqueio } from "./coerenciaDoCadastro";

export type EstadoDoVeiculo = "publicado" | "fora_da_vitrine" | "vendido" | "fora_do_feed";

export const ROTULO_DO_ESTADO: Record<EstadoDoVeiculo, string> = {
  publicado: "Publicado",
  fora_da_vitrine: "Fora da vitrine",
  vendido: "Vendido",
  fora_do_feed: "Fora do feed",
};

/** Filtro da régua superior: os quatro estados mais "todos". */
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
  /**
   * Veio no ciclo de sync mais recente?
   *
   * Fica na linha porque a tela recalcula o estado sem recarregar a página (ver
   * `reclassificarLinha`). Sem este sinal, "devolver a disponível" não tinha o
   * que escrever além de `publicado` — e um carro fora do feed voltava a
   * aparecer no ar com um clique.
   *
   * Veículo cadastrado no painel nasce com `last_seen_at` nulo — ele nunca veio
   * em sync nenhum — e `apenasDoUltimoSync` o mantém. Para efeito desta coluna,
   * ele está no pátio.
   */
  noUltimoSync: boolean;
  /**
   * O que `bloqueiosDePublicacao` respondeu sobre esta linha: a lista inteira,
   * com o texto pronto, bloqueante ou não.
   *
   * A tela filtra por `bloqueia` na hora de desenhar, como o editor A15 faz. A
   * lista completa viaja para que a pendência que hoje não tira do ar (o laudo)
   * continue tendo onde aparecer no dia em que passar a tirar, sem uma segunda
   * régua para recalculá-la.
   */
  bloqueios: MotivoDeBloqueio[];
  tipo: string;
  perfisUso: string[];
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
  /**
   * Dias desde que o veículo apareceu no feed. `null` quando a data de chegada
   * não é conhecida — as linhas anteriores à migração `20260826030000`.
   *
   * É o número que o §1.2 do plano usa para alocar verba por encalhe. Zero
   * inventado aqui viraria "acabou de chegar" sobre carro parado há meses, na
   * mesma tela em que se decide quanto investir nele.
   */
  diasEmEstoque: number | null;
}

/**
 * A ordem dos sinais, escrita uma vez só.
 *
 * `classificarEstado` a aplica sobre a linha crua do banco; `reclassificarLinha`
 * sobre a linha que já está na tela. Duas portas, uma decisão.
 */
function decidirEstado(
  vendido: boolean,
  noUltimoSync: boolean,
  bloqueado: boolean,
): EstadoDoVeiculo {
  if (vendido) return "vendido";
  if (!noUltimoSync) return "fora_do_feed";
  if (bloqueado) return "fora_da_vitrine";
  return "publicado";
}

/**
 * Estado de um veículo — a resposta a "este carro está no ar agora?".
 *
 * ---------------------------------------------------------------------------
 * O que esta função passou a considerar, e por quê
 * ---------------------------------------------------------------------------
 * Ela olhava só `vendido` e o carimbo de sync. Um veículo cadastrado pelo
 * painel com zero fotos saía da tela de cadastro com "Ainda fora da vitrine"
 * escrito na cara — e aparecia como **Publicado** nesta tabela dois cliques
 * depois. Quem corta a vitrine é `publicavel` (`getEstoque`, 8 fotos), então o
 * painel estava discordando do site sobre o mesmo carro, na tela em que se
 * decide o que anunciar. Achado do `qa-guardian`; corrigido em 2026-08-30.
 *
 * A régua **não é reescrita aqui**: é a mesma `bloqueiosDePublicacao` que corta
 * o `getEstoque`, que o editor A15 desenha e que a tela de cadastro mostra. O
 * número de fotos tem uma casa só, e não é esta.
 *
 * ---------------------------------------------------------------------------
 * A ordem, e por que é essa
 * ---------------------------------------------------------------------------
 * A mesma de `decidirPublicacao` (`lib/publicacao.ts`), que decide o que o
 * visitante e o Google veem. As duas camadas leem os mesmos três sinais;
 * discordar da ordem seria a tabela discordar do site outra vez:
 *
 *   1. `vendido` — fato consumado. O carro vendido some do feed no ciclo
 *      seguinte, e chamá-lo de "fora do feed" esconderia o motivo real.
 *   2. `fora_do_feed` — o RevendaMais parou de anunciar. Subir foto não traz
 *      esse carro de volta, então dizer "fora da vitrine" mandaria quem lê para
 *      a tarefa errada.
 *   3. `fora_da_vitrine` — está no pátio, o painel mostra, o site não. É o
 *      único dos três que se resolve daqui: completar as fotos devolve o carro
 *      ao ar no carregamento seguinte.
 *
 * Objeto sem `whatsapp_images` conta como zero foto, e portanto bloqueado — é
 * exatamente o que `getEstoque` faz com essa linha. Cair para "publicado" por
 * falta de dado recriaria a mentira que esta função existe para tirar.
 */
export function classificarEstado(
  veiculo: {
    vendido?: boolean | null;
    laudo_pericia?: string | null;
    whatsapp_images?: unknown;
    origem?: string | null;
  },
  noUltimoSync: boolean,
): EstadoDoVeiculo {
  return decidirEstado(Boolean(veiculo.vendido), noUltimoSync, !publicavel(veiculo));
}

/**
 * O estado da linha depois que a tela muda `vendido` em lote.
 *
 * A tabela atualiza a linha na hora, sem recarregar a página. Ela escrevia
 * `"publicado"` à mão ao devolver um carro a disponível — e devolvia junto a
 * mentira: um carro com três fotos, ou fora do feed, voltava a aparecer no ar.
 * A linha já carrega os dois sinais que faltavam, e a régua é a de cima.
 */
export function reclassificarLinha(
  linha: Pick<LinhaDeEstoque, "noUltimoSync" | "bloqueios">,
  vendido: boolean,
): EstadoDoVeiculo {
  return decidirEstado(
    vendido,
    linha.noUltimoSync,
    linha.bloqueios.some((b) => b.bloqueia),
  );
}

export function contarPorEstado(
  linhas: Array<{ estado: EstadoDoVeiculo }>,
): Record<FiltroDeEstado, number> {
  const contagem: Record<FiltroDeEstado, number> = {
    todos: linhas.length,
    publicado: 0,
    fora_da_vitrine: 0,
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
 * Modelo e versão como o par título/linha de baixo das telas da loja.
 *
 * Mesmo dado de `versaoParaExibir`, outro sintoma: além do eco, o modelo do
 * feed carrega a versão inteira na cauda ("x4 m40i 3.0 m sport edit v6 turbo
 * aut") e o título da ficha saía com três linhas de versão. Quando a cauda do
 * modelo é exatamente a versão, ela migra do título para a linha de baixo;
 * nos demais casos vale a regra do eco.
 *
 * O corte é por token, não por índice de caractere: `normalizarBusca` remove
 * acento e muda o comprimento do texto — fatiar o texto cru por um índice
 * achado no normalizado cortaria no lugar errado.
 */
export function modeloEVersaoParaExibir(
  modelo: string,
  versao: string,
): { modelo: string; versao: string } {
  const m = (modelo ?? "").trim();
  const v = (versao ?? "").trim();
  if (!m || !v) return { modelo: m, versao: "" };

  const tokensM = m.split(/\s+/);
  const tokensV = v.split(/\s+/);

  if (tokensV.length < tokensM.length) {
    const cauda = tokensM.slice(tokensM.length - tokensV.length);
    const caudaEhVersao = cauda.every(
      (token, i) => normalizarBusca(token) === normalizarBusca(tokensV[i]),
    );
    if (caudaEhVersao) {
      return {
        modelo: tokensM.slice(0, tokensM.length - tokensV.length).join(" "),
        versao: v,
      };
    }
  }

  return { modelo: m, versao: versaoParaExibir(m, v) };
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
