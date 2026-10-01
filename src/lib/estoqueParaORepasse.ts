/**
 * O carro do estoque como ponto de partida de um carro de repasse — pedido do
 * dono de 28/09, decidido em 01/10: "se o carro já estiver cadastrado no
 * site, precisamos poder reaproveitar os dados do cadastro".
 *
 * As quatro decisões do dono que moram aqui:
 *   (a) as fotos são COPIADAS para a pasta do repasse (`repasse/<id>/`).
 *       Referenciar o arquivo do estoque seria perigoso: a galeria apaga o
 *       arquivo por caminho ao remover uma foto (`GaleriaDeFotos.gravar`), sem
 *       olhar de quem é a pasta — tirar a foto do repasse apagaria a do carro
 *       à venda;
 *   (b) a busca lista o estoque INTEIRO — publicado, vendido, arquivado e
 *       rascunho —, com a situação à vista;
 *   (c) só copia, sem ligação: nenhuma coluna guarda o carro de origem;
 *   (d) o preço NÃO vem (o do repasse é outro), nem o valor e o mês da FIPE,
 *       que se consultam no editor como sempre. O código FIPE vem, quando o
 *       estoque o tem.
 *
 * Lê a linha CRUA de `estoque_motors`, e não `mapVeiculoDbToVeiculo`: o mapper
 * do site inventa o que falta ("Padrão" na versão, o ano corrente, a foto
 * `/logo.png`), e no cadastro do repasse um valor inventado vira dado gravado.
 *
 * Módulo puro: a rota usa as funções de leitura e de plano; o formulário
 * (cliente) usa o tipo, `avisoDasFotos` e os rótulos.
 */
import { cadastraRepasse, LIMITE_DE_FOTOS_DO_REPASSE, type RecusaDoPainel } from "./edicaoDoRepasse";
import { normalizarEstadoCadastro } from "./estadoDoCadastro";
import { normalizarBusca } from "./estoqueTabela";
import { caminhoDaFotoDoRepasse, caminhoDaUrlPublica } from "./fotosDoVeiculo";
import { grafiaDaMarca, grafiaDaVersao, grafiaDoModelo } from "./grafiaCanonica";
import type { Perfil } from "./permissoes";
import { CARROCERIAS_DO_REPASSE, type CarroceriaDoRepasse, type Repasse } from "./repasse";
import { TIPO_NO_FEED } from "./similares";

export const SITUACOES_NO_ESTOQUE = ["publicado", "vendido", "arquivado", "rascunho"] as const;
export type SituacaoNoEstoque = (typeof SITUACOES_NO_ESTOQUE)[number];

export const NOME_DA_SITUACAO_NO_ESTOQUE: Record<SituacaoNoEstoque, string> = {
  publicado: "Publicado",
  vendido: "Vendido",
  arquivado: "Arquivado",
  rascunho: "Rascunho",
};

/** O mínimo de letras para a busca ir ao banco — o mesmo do fechamento de venda. */
export const MINIMO_DA_BUSCA = 2;
/** Quantos carros a lista mostra — o mesmo do fechamento de venda. */
export const LIMITE_DA_BUSCA = 8;

/**
 * O que o seletor recebe de cada carro. Sem placa, chassi, renavam, custo,
 * valor FIPE e preço — ver a rota `GET /api/repasses/estoque`.
 */
export interface CarroDoEstoqueParaORepasse {
  id: number;
  marca: string | null;
  modelo: string | null;
  versao: string | null;
  ano: number | null;
  ano_fabricacao: number | null;
  quilometragem: number | null;
  cambio: string | null;
  combustivel: string | null;
  cor: string | null;
  tipo: string | null;
  carroceria: CarroceriaDoRepasse | null;
  codigo_fipe: string | null;
  situacao: SituacaoNoEstoque;
  /** A miniatura da lista: a primeira foto, como veio. */
  foto: string | null;
  /** Pares com as duas versões no NOSSO armazenamento — os que a cópia leva. */
  fotosCopiaveis: number;
  /** Pares com alguma versão fora dele (o carro57 dos vendidos antigos) ou sem par. */
  fotosDeFora: number;
}

const texto = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};

function inteiro(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isInteger(n) ? n : null;
}

/** O que o site faz (`mapVeiculoDbToVeiculo`): override escrito vence; senão, o feed na grafia da casa. */
function comOverride(override: unknown, doFeed: unknown, grafia: (v: string) => string): string | null {
  return texto(override) ?? texto(grafia(texto(doFeed) ?? ""));
}

/**
 * Hatch → hatch, Sedan → seda, SUV → suv, Picape → picape (o vocabulário de
 * `TIPO_NO_FEED`, lido ao contrário). Outro tipo escrito (Motocicleta, Van)
 * vira "outro"; tipo em branco fica nulo — sem dado, a pessoa escolhe.
 */
export function carroceriaDoTipo(tipo: unknown): CarroceriaDoRepasse | null {
  const t = texto(tipo)?.toLowerCase();
  if (!t) return null;
  const achada = CARROCERIAS_DO_REPASSE.find((c) => TIPO_NO_FEED[c] !== "" && TIPO_NO_FEED[c].toLowerCase() === t);
  return achada ?? "outro";
}

/** A mesma precedência da tabela do estoque (`decidirEstado`): arquivado, vendido, e o estado da loja. */
export function situacaoNoEstoque(linha: Record<string, unknown>): SituacaoNoEstoque {
  const estado = normalizarEstadoCadastro(linha.estado_cadastro);
  if (estado === "arquivado") return "arquivado";
  if (linha.vendido === true) return "vendido";
  return estado;
}

const listaDeUrls = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((u): u is string => typeof u === "string" && u.trim() !== "").map((u) => u.trim()) : [];

/**
 * Os pares de foto do estoque, por índice — `web_full_images[i]` e
 * `whatsapp_images[i]` são a mesma fotografia (`fotosDoVeiculo.ts`).
 *
 * Diferente de `fotosDoVeiculo`, aqui a versão que falta NÃO é suprida pela
 * outra: a cópia gravaria um WebP no lugar do JPEG do WhatsApp. Par sem as
 * duas versões, ou com alguma fora do nosso bucket, fica de fora.
 */
export function paresDoEstoque(web: unknown, zap: unknown): { copiaveis: Array<{ web: string; zap: string }>; deFora: number } {
  const webs = listaDeUrls(web);
  const zaps = listaDeUrls(zap);
  const copiaveis: Array<{ web: string; zap: string }> = [];
  let deFora = 0;
  for (let i = 0; i < Math.max(webs.length, zaps.length); i += 1) {
    const w = webs[i];
    const z = zaps[i];
    if (w && z && caminhoDaUrlPublica(w) !== null && caminhoDaUrlPublica(z) !== null) copiaveis.push({ web: w, zap: z });
    else deFora += 1;
  }
  return { copiaveis, deFora };
}

export function carroDoEstoqueParaORepasse(linha: Record<string, unknown>): CarroDoEstoqueParaORepasse | null {
  const id = inteiro(linha.id);
  if (id === null || id <= 0) return null;
  const { copiaveis, deFora } = paresDoEstoque(linha.web_full_images, linha.whatsapp_images);
  return {
    id,
    marca: texto(grafiaDaMarca(texto(linha.marca))),
    modelo: comOverride(linha.modelo_override, linha.modelo, grafiaDoModelo),
    versao: comOverride(linha.versao_override, linha.versao, grafiaDaVersao),
    ano: inteiro(linha.ano),
    ano_fabricacao: inteiro(linha.ano_fabricacao),
    quilometragem: inteiro(linha.quilometragem),
    cambio: texto(linha.cambio),
    combustivel: texto(linha.combustivel),
    cor: texto(linha.cor),
    tipo: texto(linha.tipo),
    carroceria: carroceriaDoTipo(linha.tipo),
    codigo_fipe: texto(linha.codigo_fipe),
    situacao: situacaoNoEstoque(linha),
    foto: listaDeUrls(linha.web_full_images)[0] ?? listaDeUrls(linha.whatsapp_images)[0] ?? null,
    fotosCopiaveis: copiaveis.length,
    fotosDeFora: deFora,
  };
}

const placaNormalizada = (v: unknown): string => (typeof v === "string" ? v.toUpperCase().replace(/[^A-Z0-9]/g, "") : "");

/**
 * A busca do seletor, no servidor: cada palavra do termo precisa aparecer em
 * marca, modelo, versão (do feed ou do override), cor, ano ou código.
 *
 * A placa casa só INTEIRA (7 caracteres, sem hífen nem caixa) e nunca sai na
 * resposta. Inteira de propósito: quem cadastra repasse inclui perfis que a
 * matriz não deixa ver placa (linha "Preencher documentação": Gestor,
 * Financeiro e SDR não veem), e casar pedaço de placa faria da busca um
 * oráculo — letra a letra, a placa sairia. Inteira, a busca só confirma o que
 * a pessoa já tem na mão (o documento do carro).
 */
export function buscarNoEstoque(linhas: Array<Record<string, unknown>>, termo: string, limite = LIMITE_DA_BUSCA): CarroDoEstoqueParaORepasse[] {
  const limpo = normalizarBusca(termo);
  if (limpo.length < MINIMO_DA_BUSCA) return [];
  const palavras = limpo.split(/\s+/).filter(Boolean);
  const placa = placaNormalizada(termo);
  const achados: CarroDoEstoqueParaORepasse[] = [];
  for (const linha of linhas) {
    const textoDaLinha = normalizarBusca(
      [linha.marca, linha.modelo, linha.versao, linha.modelo_override, linha.versao_override, linha.cor, linha.ano, linha.id]
        .filter((v) => typeof v === "string" || typeof v === "number")
        .join(" "),
    );
    const casaPlaca = placa.length === 7 && placaNormalizada(linha.placa) === placa;
    if (!casaPlaca && !palavras.every((p) => textoDaLinha.includes(p))) continue;
    const carro = carroDoEstoqueParaORepasse(linha);
    if (carro) achados.push(carro);
    if (achados.length >= limite) break;
  }
  return achados;
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/** "N fotos serão copiadas; M ficam de fora (fora do nosso armazenamento)." */
export function avisoDasFotos(c: Pick<CarroDoEstoqueParaORepasse, "fotosCopiaveis" | "fotosDeFora">): string {
  if (c.fotosCopiaveis === 0 && c.fotosDeFora === 0) return "O carro não tem fotos para copiar.";
  const vem = Math.min(c.fotosCopiaveis, LIMITE_DE_FOTOS_DO_REPASSE);
  const acima = c.fotosCopiaveis - vem;
  const frase =
    `${vem} ${plural(vem, "foto será copiada", "fotos serão copiadas")}; ` +
    `${c.fotosDeFora} ${plural(c.fotosDeFora, "fica", "ficam")} de fora (fora do nosso armazenamento).`;
  return acima > 0 ? `${frase} Outras ${acima} passam do limite de ${LIMITE_DE_FOTOS_DO_REPASSE} do repasse.` : frase;
}

/** Um par a copiar: os caminhos no bucket, de onde e para onde. */
export interface ParDaCopia {
  origem: { web: string; zap: string };
  destino: { web: string; zap: string };
}

/**
 * O que a rota copia: os pares nossos, em ordem, cada um com um lote novo na
 * pasta do repasse (`caminhoDaFotoDoRepasse`) — as duas versões no mesmo lote,
 * que é como a galeria apaga o par. O teto de 40 conta o que o repasse já tem;
 * o que passa dele não é copiado, para não deixar arquivo sem dono no bucket.
 */
export function planejarCopiaDasFotos(args: {
  repasseId: string;
  web: unknown;
  zap: unknown;
  jaTem: number;
  novoLote: () => string;
}): { pares: ParDaCopia[]; ficaramDeFora: number; acimaDoLimite: number } {
  const { copiaveis, deFora } = paresDoEstoque(args.web, args.zap);
  const vagas = Math.max(0, LIMITE_DE_FOTOS_DO_REPASSE - args.jaTem);
  const pares: ParDaCopia[] = copiaveis.slice(0, vagas).map((par) => {
    const lote = args.novoLote();
    return {
      origem: { web: caminhoDaUrlPublica(par.web) as string, zap: caminhoDaUrlPublica(par.zap) as string },
      destino: {
        web: caminhoDaFotoDoRepasse(args.repasseId, lote, "web"),
        zap: caminhoDaFotoDoRepasse(args.repasseId, lote, "zap"),
      },
    };
  });
  return { pares, ficaramDeFora: deFora, acimaDoLimite: copiaveis.length - pares.length };
}

/**
 * O portão da cópia: o mesmo de editar o rascunho (quem cadastra), e SÓ o
 * rascunho — a cópia é o passo seguinte ao "Criar rascunho". Fora dele, as
 * fotos se mexem pela galeria do editor, com o portão de quem valida.
 *
 * E só o rascunho SEM foto nenhuma, o que acabou de nascer (revisão de 01/10).
 * É o que faz a cópia rodar uma vez: a segunda chamada duplicaria as fotos até
 * o teto, e depois que o editor mexeu na galeria a cópia gravaria por cima.
 * Foto de estoque em rascunho que já tem fotos se envia pela galeria.
 */
export function decidirCopiaDoEstoque(args: {
  repasse: Pick<Repasse, "situacao" | "web_full_images" | "whatsapp_images">;
  perfis: Perfil[];
  corpo: unknown;
}): { ok: true; estoqueId: number } | RecusaDoPainel {
  if (args.repasse.situacao !== "rascunho") {
    return { ok: false, status: 409, erro: "Só o rascunho recebe as fotos do estoque." };
  }
  if (!cadastraRepasse(args.perfis)) {
    return { ok: false, status: 403, erro: "Seu perfil não cadastra carro de repasse." };
  }
  if (args.repasse.web_full_images.length > 0 || args.repasse.whatsapp_images.length > 0) {
    return { ok: false, status: 409, erro: "Este rascunho já tem fotos. Envie as do estoque pela galeria." };
  }
  const bruto = typeof args.corpo === "object" && args.corpo !== null ? (args.corpo as { estoqueId?: unknown }).estoqueId : undefined;
  const estoqueId = typeof bruto === "number" ? bruto : Number.NaN;
  if (!Number.isInteger(estoqueId) || estoqueId <= 0) {
    return { ok: false, status: 400, erro: "Escolha um carro do estoque." };
  }
  return { ok: true, estoqueId };
}
