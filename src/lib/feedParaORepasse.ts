/**
 * As fotos do anúncio no RevendaMais como fotos de um carro de repasse: pedido
 * do dono de 06/10 ("na interface do repasse, o enviar fotos precisa ter um
 * botão de puxar fotos do revenda, como no estoque já existe").
 *
 * No estoque, "Importar fotos do feed" grava o ENDEREÇO do carro57 na coluna.
 * No repasse isso não serve: a lista só aceita foto do nosso armazenamento
 * (`listaDeFotos` em `edicaoDoRepasse.ts`) e o site só publica foto nossa.
 * Aqui cada foto do anúncio é BAIXADA pelo servidor e sobe em `repasse/<id>/`,
 * pelo mesmo caminho da cópia do estoque (`trazerFotosParaORepasse.ts`).
 *
 * Qual anúncio: nada liga o repasse ao carro do estoque (decisão do dono de
 * 01/10, "só copia, sem ligação") e o repasse não tem placa. Quem escolhe é a
 * pessoa, na busca do estoque do repasse; o id escolhido é o id do anúncio.
 *
 * As fotos SOMAM à galeria, depois das que já estão: a capa continua sendo a
 * primeira. A mesma foto do anúncio não entra duas vezes: o nome do arquivo
 * leva a marca do endereço de origem (`rm-<marca>-…`), e é por ela que a
 * segunda importação reconhece o que já veio. Só reconhece o que veio POR
 * AQUI: a foto enviada à mão ou copiada do estoque não tem a marca.
 *
 * Módulo puro: a rota usa o portão e o plano; a galeria (cliente) usa o tipo
 * da resposta e as frases.
 */
import { decidirEdicao, LIMITE_DE_FOTOS_DO_REPASSE, type RecusaDoPainel } from "./edicaoDoRepasse";
import { urlDaLojaNoCarro57, type CarroDoEstoqueParaORepasse, type ParDaCopia } from "./estoqueParaORepasse";
import type { CarroDaBusca } from "./carrosDeInteresseNaTela";
import type { FotoDoFeed } from "./feedRevendaMais";
import { caminhoDaFotoDoRepasse, caminhoDaUrlPublica, PASTA_DO_REPASSE } from "./fotosDoVeiculo";
import type { Perfil } from "./permissoes";
import type { Repasse } from "./repasse";

/** O começo do lote de toda foto que veio do feed. */
export const PREFIXO_DO_LOTE_DO_FEED = "rm-";

const MARCA = /^[a-z0-9]{8,64}$/;

/** O lote de uma foto do feed: a marca da origem e um final novo a cada vez. */
export function loteDoFeed(marca: string, novoLote: () => string): string {
  if (!MARCA.test(marca)) throw new Error("Marca de origem inválida para o lote da foto.");
  return `${PREFIXO_DO_LOTE_DO_FEED}${marca}-${novoLote()}`;
}

/** As marcas de origem das fotos do feed que este repasse já tem, lidas dos endereços. */
export function marcasDoFeedNoRepasse(repasseId: string, urls: readonly string[]): Set<string> {
  const pasta = `${PASTA_DO_REPASSE}/${repasseId.toLowerCase()}/${PREFIXO_DO_LOTE_DO_FEED}`;
  const marcas = new Set<string>();
  for (const url of urls) {
    const caminho = caminhoDaUrlPublica(url);
    if (!caminho || !caminho.startsWith(pasta)) continue;
    const marca = caminho.slice(pasta.length).split("-")[0];
    if (MARCA.test(marca)) marcas.add(marca);
  }
  return marcas;
}

/**
 * O portão da importação: o MESMO de enviar foto pela galeria. A galeria grava
 * pelo PATCH, que passa por `decidirEdicao`; aqui a mesma função roda com as
 * listas que o carro já tem, ANTES de qualquer pedido à rede. Sai dela quem
 * pode (rascunho: quem cadastra; fora dele: quem valida; vendido e arquivado:
 * ninguém) e se o carro, fora do rascunho, está em condição de ser gravado.
 */
export function decidirImportacaoDoFeed(args: {
  repasse: Repasse;
  perfis: Perfil[];
  corpo: unknown;
  agora: Date;
}): { ok: true; estoqueId: number } | RecusaDoPainel {
  const { repasse } = args;
  const portao = decidirEdicao({
    repasse,
    corpo: { web_full_images: repasse.web_full_images, whatsapp_images: repasse.whatsapp_images },
    perfis: args.perfis,
    agora: args.agora,
  });
  if (!portao.ok) return portao;
  const bruto = typeof args.corpo === "object" && args.corpo !== null ? (args.corpo as { estoqueId?: unknown }).estoqueId : undefined;
  const estoqueId = typeof bruto === "number" ? bruto : Number.NaN;
  if (!Number.isSafeInteger(estoqueId) || estoqueId <= 0) {
    return { ok: false, status: 400, erro: "Escolha um carro do estoque." };
  }
  if (repasse.web_full_images.length >= LIMITE_DE_FOTOS_DO_REPASSE) {
    return {
      ok: false,
      status: 409,
      erro: `Este carro já tem ${LIMITE_DE_FOTOS_DO_REPASSE} fotos, o limite do repasse. Remova alguma antes de importar.`,
    };
  }
  return { ok: true, estoqueId };
}

/**
 * O que a rota baixa: as fotos do anúncio que ainda não estão no repasse, na
 * ordem do anúncio, cada uma com um lote novo na pasta do repasse.
 *
 * Só entra a foto com as duas versões na pasta da LOJA no carro57
 * (`urlDaLojaNoCarro57`, a trava contra pedido a endereço qualquer); o resto
 * fica de fora e nunca é pedido. O teto de 40 conta o que o repasse já tem: o
 * que passa dele não é baixado, para não deixar arquivo sem dono no bucket.
 */
export function planejarImportacaoDoFeed(args: {
  repasseId: string;
  fotos: readonly FotoDoFeed[];
  /** Os endereços que o repasse já tem (uma das listas basta: o par divide o lote). */
  jaNoRepasse: readonly string[];
  /** A marca de um endereço de origem: letras minúsculas e números, estável. */
  marcaDe: (url: string) => string;
  novoLote: () => string;
}): { pares: ParDaCopia[]; jaEstavam: number; ficaramDeFora: number; acimaDoLimite: number } {
  const presentes = marcasDoFeedNoRepasse(args.repasseId, args.jaNoRepasse);
  let vagas = Math.max(0, LIMITE_DE_FOTOS_DO_REPASSE - args.jaNoRepasse.length);
  const pares: ParDaCopia[] = [];
  let jaEstavam = 0;
  let ficaramDeFora = 0;
  let acimaDoLimite = 0;
  for (const foto of args.fotos) {
    const web = urlDaLojaNoCarro57(foto.web);
    const zap = urlDaLojaNoCarro57(foto.zap);
    if (web === null || zap === null) {
      ficaramDeFora += 1;
      continue;
    }
    const marca = args.marcaDe(zap);
    if (presentes.has(marca)) {
      jaEstavam += 1;
      continue;
    }
    if (vagas === 0) {
      acimaDoLimite += 1;
      continue;
    }
    // A mesma foto repetida dentro do anúncio também entra uma vez só.
    presentes.add(marca);
    vagas -= 1;
    const lote = loteDoFeed(marca, args.novoLote);
    pares.push({
      origem: { web: { de: "carro57", url: web }, zap: { de: "carro57", url: zap } },
      destino: {
        web: caminhoDaFotoDoRepasse(args.repasseId, lote, "web"),
        zap: caminhoDaFotoDoRepasse(args.repasseId, lote, "zap"),
      },
    });
  }
  return { pares, jaEstavam, ficaramDeFora, acimaDoLimite };
}

/** O que `POST /api/repasses/[id]/fotos-do-feed` responde. */
export interface RespostaDoFeed {
  /** Fotos que entraram agora na galeria. */
  vieram: number;
  /** Fotos do anúncio que já tinham vindo numa importação anterior. */
  jaEstavam: number;
  /** Fotos do anúncio fora do endereço da loja: nunca pedidas. */
  ficaramDeFora: number;
  acimaDoLimite: number;
  falharam: number;
  /** As duas listas como ficaram gravadas. */
  web_full_images: string[];
  whatsapp_images: string[];
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * O que a tela diz depois da importação. "ok" quando alguma foto entrou ou
 * quando não havia o que trazer; "erro" quando havia e nenhuma veio.
 */
export function resumoDaImportacao(
  r: Pick<RespostaDoFeed, "vieram" | "jaEstavam" | "ficaramDeFora" | "acimaDoLimite" | "falharam">,
): { tipo: "ok" | "erro"; texto: string } {
  const frases: string[] = [];
  if (r.vieram > 0) {
    frases.push(`${plural(r.vieram, "foto veio", "fotos vieram")} do RevendaMais.`);
    if (r.jaEstavam > 0) frases.push(`${plural(r.jaEstavam, "já estava", "já estavam")} na galeria.`);
  } else if (r.jaEstavam > 0) {
    frases.push(
      r.jaEstavam === 1
        ? "Nenhuma foto nova: a foto do anúncio já está na galeria."
        : `Nenhuma foto nova: as ${r.jaEstavam} fotos do anúncio já estão na galeria.`,
    );
  } else {
    frases.push("Nenhuma foto veio do RevendaMais.");
  }
  if (r.falharam > 0) frases.push(`${plural(r.falharam, "não veio", "não vieram")}. Importe de novo para tentar as que faltam.`);
  if (r.acimaDoLimite > 0) {
    frases.push(`${plural(r.acimaDoLimite, "passa", "passam")} do limite de ${LIMITE_DE_FOTOS_DO_REPASSE} fotos do repasse.`);
  }
  if (r.ficaramDeFora > 0) {
    frases.push(`${plural(r.ficaramDeFora, "ficou", "ficaram")} de fora, por não estar no endereço da loja.`);
  }
  const nadaATrazer = r.vieram === 0 && r.falharam === 0 && r.acimaDoLimite === 0 && r.ficaramDeFora === 0;
  return { tipo: r.vieram > 0 || nadaATrazer ? "ok" : "erro", texto: frases.join(" ") };
}

/** O carro da busca do estoque do repasse, no formato que o seletor de carro desenha. */
export function carroDoRepasseNaBusca(c: CarroDoEstoqueParaORepasse): CarroDaBusca {
  const nome = [c.marca, c.modelo, c.versao].filter(Boolean).join(" ");
  return {
    id: c.id,
    rotulo: [nome || `Carro ${c.id}`, c.ano].filter((v) => v !== null && v !== "").join(" "),
    ano: c.ano,
    km: c.quilometragem,
    ...(c.foto ? { foto: c.foto } : {}),
    vendido: c.situacao === "vendido",
    publicado: c.situacao === "publicado",
  };
}
