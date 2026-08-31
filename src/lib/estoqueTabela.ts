/**
 * Regras da tabela de estoque — tela A6 do design doc.
 *
 * O doc desenha os filtros como TODOS / PUBLICADOS / RASCUNHOS / RESERVADOS.
 * **Rascunho passou a existir de verdade em 2026-08-30** (coluna
 * `estado_cadastro`, migração F0-q): com a importação manual, todo carro nasce
 * rascunho e só sai por ato de quem publica. `reservado` continua fora — não há
 * dado que o sustente, e inventá-lo seria pintar de estado o que hoje é
 * ausência de informação.
 *
 * Tudo aqui é função pura: a tela monta, esta camada decide.
 *
 * ---------------------------------------------------------------------------
 * A direção da dependência
 * ---------------------------------------------------------------------------
 * Este módulo importa `coerenciaDoCadastro` e `estadoDoCadastro`; o contrário
 * nunca. Aquele primeiro arquivo não tem import nenhum de propósito — ele é
 * desenhado por componente de cliente, e um import de `./supabase` lá
 * arrastaria o cliente do banco para o bundle do navegador. Como ele não
 * importa ninguém, importá-lo daqui é seguro: esta camada também viaja para o
 * cliente, via `TabelaDeEstoque`.
 */

import { publicavel, type MotivoDeBloqueio } from "./coerenciaDoCadastro";
import { normalizarEstadoCadastro, type EstadoCadastro } from "./estadoDoCadastro";

/**
 * O que a etiqueta da linha diz. Cinco valores, de duas naturezas diferentes:
 *
 * - `rascunho`, `publicado` e `arquivado` são a DECISÃO DA LOJA, lida de
 *   `estado_cadastro`.
 * - `vendido` e `fora_da_vitrine` são o que se sobrepõe a essa decisão: o
 *   primeiro é fato consumado, o segundo é PENDÊNCIA DE MATERIAL — o carro que
 *   a loja publicou e a régua de fotos segura.
 *
 * `fora_do_feed` saiu em 2026-08-30, e não por simplificação. Ele era derivado
 * de `apenasDoUltimoSync`: ficava fora quem não veio no ciclo mais recente do
 * robô. Com a importação MANUAL, essa janela apodrece — importar um carro só
 * faria dele "o ciclo mais recente" e mandaria o estoque inteiro para
 * "fora do feed", com o site continuando a mostrar todo mundo. Seria o painel
 * mentindo sobre a vitrine outra vez, que é exatamente o defeito que a rodada
 * anterior desta tela consertou. Quem saiu do estoque agora tem nome próprio e
 * dono: `arquivado`, decidido por gente.
 */
export type EstadoDoVeiculo =
  | "rascunho"
  | "publicado"
  | "fora_da_vitrine"
  | "vendido"
  | "arquivado";

export const ROTULO_DO_ESTADO: Record<EstadoDoVeiculo, string> = {
  rascunho: "Rascunho",
  publicado: "Publicado",
  fora_da_vitrine: "Fora da vitrine",
  vendido: "Vendido",
  arquivado: "Arquivado",
};

/** Filtro da régua superior: os cinco estados mais "todos". */
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
   * A decisão da loja, crua — `rascunho`, `publicado` ou `arquivado`.
   *
   * Fica na linha, ao lado de `estado`, porque os dois respondem perguntas
   * diferentes: `estado` é a etiqueta (onde `vendido` e a falta de foto podem
   * se sobrepor), este é o que está gravado na coluna e o que as ações de
   * publicar/arquivar alteram. Sem ele, a tela não saberia qual botão oferecer
   * — nem recalcular a linha depois do clique sem recarregar a página.
   */
  estadoCadastro: EstadoCadastro;
  /**
   * Marcado como vendido na COLUNA do banco.
   *
   * Também vinha implícito em `estado`, e implícito não serve para recalcular:
   * publicar um carro sem saber se ele está vendido faria a linha voltar a
   * "publicado" sobre uma venda já registrada.
   */
  vendido: boolean;
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
 *
 * ---------------------------------------------------------------------------
 * Por que esta ordem, depois da F0-q
 * ---------------------------------------------------------------------------
 * 1. `arquivado` vence tudo, inclusive a venda. É a decisão terminal da loja, e
 *    é o que o site lê: desde 2026-08-30 `getSinaisDeEstoque` responde "saiu do
 *    estoque" para qualquer coisa que não seja `publicado`. Deixar a etiqueta
 *    "Vendido" por cima de um carro arquivado faria o painel dizer que ele está
 *    no ar com o selo VENDIDO quando ele não está em lugar nenhum — e essa é
 *    justamente a divergência painel × site que esta tela existe para não ter.
 *
 *    É a inversão consciente da regra antiga "vendido vence fora do feed".
 *    Aquela valia porque `fora_do_feed` era EFEITO da venda (o robô parava de
 *    anunciar sozinho), e efeito não pode esconder causa. `arquivado` é ATO —
 *    alguém clicou —, e ato não se esconde atrás de flag.
 *
 * 2. `vendido` vem antes de `rascunho`, e isso é operação: um repasse vendido
 *    antes de o anúncio subir não pode ficar na fila de "falta finalizar" para
 *    sempre. A venda encerra o trabalho de preparação.
 *
 * 3. `rascunho` vem antes do bloqueio de fotos porque as duas coisas não são a
 *    mesma tarefa. Rascunho é "ninguém revisou ainda"; fora da vitrine é "a
 *    loja publicou e falta material". Chamar todo rascunho de "fora da vitrine"
 *    apagaria a decisão pendente — e a lista de trabalho de quem importou
 *    viraria a lista de quem tira foto.
 *
 * 4. `fora_da_vitrine` sobra para o que interessa: publicado, no pátio, e ainda
 *    assim fora do ar. É o único estado que se resolve subindo foto.
 */
function decidirEstado(
  estadoCadastro: EstadoCadastro,
  vendido: boolean,
  bloqueado: boolean,
): EstadoDoVeiculo {
  if (estadoCadastro === "arquivado") return "arquivado";
  if (vendido) return "vendido";
  if (estadoCadastro === "rascunho") return "rascunho";
  if (bloqueado) return "fora_da_vitrine";
  return "publicado";
}

/**
 * Estado de um veículo — a resposta a "este carro está no ar agora?".
 *
 * ---------------------------------------------------------------------------
 * A fonte primária é a decisão da loja
 * ---------------------------------------------------------------------------
 * `estado_cadastro` (migração F0-q) manda. Antes dela esta função inferia tudo
 * do relógio do robô e da régua de fotos, e a inferência tinha dois defeitos
 * que a importação manual tornaria diários: nenhum rascunho tinha como se
 * anunciar como tal, e um ciclo parcial de sync mandava o estoque inteiro para
 * "fora do feed".
 *
 * A régua de fotos **não é reescrita aqui**: é a mesma `bloqueiosDePublicacao`
 * que corta o `getEstoque`, que o editor A15 desenha e que a tela de cadastro
 * mostra. O número de fotos tem uma casa só, e não é esta.
 *
 * Objeto sem `whatsapp_images` conta como zero foto, e portanto bloqueado — é
 * exatamente o que `getEstoque` faz com essa linha. Cair para "publicado" por
 * falta de dado recriaria a mentira que esta função existe para tirar.
 */
export function classificarEstado(veiculo: {
  estado_cadastro?: string | null;
  vendido?: boolean | null;
  laudo_pericia?: string | null;
  whatsapp_images?: unknown;
  origem?: string | null;
}): EstadoDoVeiculo {
  return decidirEstado(
    normalizarEstadoCadastro(veiculo.estado_cadastro),
    Boolean(veiculo.vendido),
    // A régua de material, consultada — nunca reescrita.
    !publicavel(veiculo),
  );
}

/**
 * O estado da linha depois de uma ação da tela — vender, devolver a disponível,
 * publicar, arquivar.
 *
 * A tabela atualiza a linha na hora, sem recarregar a página. Ela escrevia
 * `"publicado"` à mão ao devolver um carro a disponível — e devolvia junto a
 * mentira: um carro com três fotos voltava a aparecer no ar. Recebe a MUDANÇA
 * em vez da linha já alterada de propósito: quem chama não precisa lembrar de
 * atualizar o campo antes de reclassificar, que é o esquecimento fácil.
 */
export function reclassificarLinha(
  linha: Pick<LinhaDeEstoque, "estadoCadastro" | "vendido" | "bloqueios">,
  mudanca: Partial<Pick<LinhaDeEstoque, "estadoCadastro" | "vendido">> = {},
): EstadoDoVeiculo {
  return decidirEstado(
    mudanca.estadoCadastro ?? linha.estadoCadastro,
    mudanca.vendido ?? linha.vendido,
    linha.bloqueios.some((b) => b.bloqueia),
  );
}

export function contarPorEstado(
  linhas: Array<{ estado: EstadoDoVeiculo }>,
): Record<FiltroDeEstado, number> {
  const contagem: Record<FiltroDeEstado, number> = {
    todos: linhas.length,
    rascunho: 0,
    publicado: 0,
    fora_da_vitrine: 0,
    vendido: 0,
    arquivado: 0,
  };
  for (const l of linhas) contagem[l.estado] += 1;
  return contagem;
}

/**
 * Esta linha tem o material para ir ao ar?
 *
 * O pré-teste que a tela faz ANTES de chamar a rota, com a lista de bloqueios
 * que ela já recebeu montada. A rota refaz a verificação contra o banco — esta
 * aqui existe para não gastar uma ida ao servidor e para o botão saber quantos
 * dos selecionados estão prontos.
 */
export function prontoParaPublicar(linha: Pick<LinhaDeEstoque, "bloqueios">): boolean {
  return !linha.bloqueios.some((b) => b.bloqueia);
}

export interface FilaDeRascunhos {
  /** Quantos rascunhos há — o mesmo número do contador do filtro. */
  total: number;
  /** Quantos já podem ser publicados agora, sem mais nenhuma foto. */
  prontos: number;
  /** Quantos ainda dependem de material. */
  bloqueados: number;
}

/**
 * A fila de trabalho de quem importou: o que falta finalizar.
 *
 * O contador do filtro responde "quantos rascunhos"; esta função responde a
 * pergunta seguinte, que é a que decide o que fazer agora — *"destes, quantos
 * eu publico com um clique e quantos dependem de alguém subir foto?"*. Sem a
 * separação, a fila é um número só e o operador abre carro por carro para
 * descobrir.
 *
 * Conta sobre `estado`, e não sobre `estadoCadastro`, para não discordar do
 * chip que fica ao lado: um rascunho vendido aparece em "Vendidos" e não é
 * trabalho de ninguém.
 */
export function resumoDaFilaDeRascunhos(
  linhas: Array<Pick<LinhaDeEstoque, "estado" | "bloqueios">>,
): FilaDeRascunhos {
  const rascunhos = linhas.filter((l) => l.estado === "rascunho");
  const prontos = rascunhos.filter((l) => prontoParaPublicar(l)).length;
  return { total: rascunhos.length, prontos, bloqueados: rascunhos.length - prontos };
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
