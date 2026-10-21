import type { MensagemDoModelo, ParteDaMensagem } from "./deepseek";

/**
 * As fotos do carro na conversa, em camadas (2026-10-20).
 *
 * Pedido do dono: o assistente classifica as fotos de cada carro do estoque,
 * mostra primeiro as de fora, pergunta se o cliente quer ver o interior e
 * oferece os outros detalhes visuais — detalhes da versão, rodas, motor,
 * porta-malas — um de cada vez, "para não sobrecarregar o usuário".
 *
 * Puro: monta o pedido de classificação, lê a resposta, escolhe as fotos de
 * uma camada e escreve a oferta da próxima. Quem chama o modelo, grava e
 * envia é `fotosDoAtendimento-servidor.ts` / `atendimento-servidor.ts`.
 *
 * ---------------------------------------------------------------------------
 * A classificação é uma vez por foto, e não por conversa
 * ---------------------------------------------------------------------------
 * O modelo de visão olha cada foto UMA vez (a URL é a chave) e grava a camada,
 * o ângulo e uma descrição curta em `atendimento_fotos`. A conversa só lê o
 * que já está classificado: o prompt do atendimento leva, por carro, quantas
 * fotos há de cada camada (`resumoDasFotos`), e não as imagens — imagem no
 * prompt de toda mensagem custaria mais que a conversa inteira.
 *
 * ---------------------------------------------------------------------------
 * As camadas, e por que a oferta é do servidor
 * ---------------------------------------------------------------------------
 *   1. **De fora** — sempre a primeira vez que o carro aparece.
 *   2. **Interior** — só quando o cliente quer.
 *   3. **Detalhes**, um de cada vez: os da versão (emblema, faróis, teto,
 *      painel digital…), rodas, motor, porta-malas.
 *
 * A pergunta que vem DEPOIS das fotos ("Quer ver o interior também?") é
 * escrita aqui (`ofertaDepoisDasFotos`), a partir do que o carro tem e do que
 * já foi mostrado — e não pelo modelo. Assim ela nunca oferece foto que não
 * existe, nunca repete a camada que já foi, e chega depois das fotos, na
 * ordem certa, mesmo que o modelo tenha escrito a frase antes.
 */

export type CamadaDaFoto = "externa" | "interior" | "detalhes" | "rodas" | "motor" | "porta_malas";
/** `outra`: documento, laudo, banner, foto sem o carro — nunca vai ao cliente. */
export type CamadaClassificada = CamadaDaFoto | "outra";
export type AnguloDaFoto = "frente" | "traseira" | "lateral" | "tres_quartos_frente" | "tres_quartos_traseira";

/** A ordem das camadas: é a ordem em que se oferecem. */
export const CAMADAS_DA_FOTO: readonly CamadaDaFoto[] = ["externa", "interior", "detalhes", "rodas", "motor", "porta_malas"];
const CAMADAS_DE_DETALHE: readonly CamadaDaFoto[] = ["detalhes", "rodas", "motor", "porta_malas"];
const ANGULOS: readonly AnguloDaFoto[] = ["frente", "traseira", "lateral", "tres_quartos_frente", "tres_quartos_traseira"];

export const ROTULO_DA_CAMADA: Record<CamadaDaFoto, string> = {
  externa: "fora",
  interior: "interior",
  detalhes: "detalhes da versão",
  rodas: "rodas",
  motor: "motor",
  porta_malas: "porta-malas",
};

/** "Tenho também fotos do motor…" — a camada com o artigo, para a frase. */
const DA_CAMADA: Record<CamadaDaFoto, string> = {
  externa: "de fora",
  interior: "do interior",
  detalhes: "dos detalhes da versão",
  rodas: "das rodas",
  motor: "do motor",
  porta_malas: "do porta-malas",
};

/** Quantas fotos cada camada manda de uma vez. Quatro de fora viram um álbum no WhatsApp. */
export const FOTOS_POR_CAMADA: Record<CamadaDaFoto, number> = {
  externa: 4,
  interior: 4,
  detalhes: 3,
  rodas: 2,
  motor: 2,
  porta_malas: 2,
};

/** Sem classificação (o modelo de visão caiu), a galeria vai em ordem, de quatro em quatro. */
export const FOTOS_DA_GALERIA_POR_VEZ = 4;
/** Quantas fotos vão num pedido de classificação. */
export const FOTOS_POR_PEDIDO_AO_MODELO = 12;
/** As fotos depois desta posição não são classificadas nem enviadas: a galeria boa está no começo. */
export const TETO_DE_FOTOS_POR_CARRO = 24;
const TETO_DA_DESCRICAO = 60;

export interface FotoClassificada {
  url: string;
  posicao: number;
  camada: CamadaClassificada;
  angulo: AnguloDaFoto | null;
  descricao: string | null;
  aproveitavel: boolean;
  /** Corrigida à mão na aba Fotos: o modelo não a reclassifica. */
  corrigida?: boolean;
}

/** O pedido de fotos que o agente devolve no JSON da resposta. */
export interface PedidoDeFotos {
  veiculo: string;
  camada: CamadaDaFoto;
}

export function ehCamada(v: unknown): v is CamadaDaFoto {
  return typeof v === "string" && (CAMADAS_DA_FOTO as readonly string[]).includes(v);
}

/**
 * As fotos de um carro que podem ir ao modelo e ao cliente: endereço http(s),
 * sem repetir, até o teto. O `/logo.png` que o mapeador do estoque põe no
 * carro sem foto não é foto de carro.
 */
export function fotosDoCarro(urls: readonly unknown[] | null | undefined): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const u of urls ?? []) {
    if (typeof u !== "string") continue;
    const url = u.trim();
    if (!/^https?:\/\//i.test(url) || vistas.has(url)) continue;
    vistas.add(url);
    saida.push(url);
    if (saida.length >= TETO_DE_FOTOS_POR_CARRO) break;
  }
  return saida;
}

/** O pedido do agente, conferido: o id do carro só com dígitos e uma camada que existe. */
export function pedidoDeFotosValido(bruto: unknown): PedidoDeFotos | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  // O id do anúncio (bigint) cabe com folga em 15 dígitos — é o que o
  // `Number` grava sem perder precisão. Zero à esquerda não faz parte do id.
  const veiculo = String(b.veiculo ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!veiculo || veiculo === "0" || veiculo.length > 15) return null;
  const camada = b.camada === undefined || b.camada === null || b.camada === "" ? "externa" : b.camada;
  return ehCamada(camada) ? { veiculo, camada } : null;
}

// ----------------------------------------------------------------------------
// A classificação
// ----------------------------------------------------------------------------

const INSTRUCOES_DA_CLASSIFICACAO = [
  "Você classifica as fotos do anúncio de um carro seminovo, para o atendimento da loja no WhatsApp mostrar ao cliente em camadas.",
  "",
  "Para cada foto, na ordem em que vieram, diga:",
  '- "camada": uma de',
  '  "externa" (o carro inteiro ou quase, visto de fora),',
  '  "interior" (a cabine vista de dentro: painel, bancos, volante, console — foto de conjunto),',
  '  "detalhes" (close de um item da versão ou do acabamento: emblema, farol, lanterna, teto solar, painel de instrumentos, central multimídia, câmera, banco de couro em detalhe, chave),',
  '  "rodas" (roda e pneu em destaque),',
  '  "motor" (o cofre do motor aberto),',
  '  "porta_malas" (o porta-malas ou a caçamba),',
  '  "outra" (documento, laudo, placa em destaque, banner, logotipo, foto sem o carro, ou que não dá para saber).',
  '- "angulo": só para "externa" — "frente", "traseira", "lateral", "tres_quartos_frente" ou "tres_quartos_traseira". Nas outras, null.',
  '- "descricao": até 6 palavras, em português, dizendo o que um cliente quer saber da foto ("Painel digital", "Roda de liga leve", "Teto solar panorâmico", "Bancos em couro"). Nunca escreva preço, placa, telefone, endereço ou nome de loja.',
  '- "aproveitavel": false se a foto estiver tremida, escura, muito cortada ou não mostrar o carro; senão true.',
  "",
  "Responda só com JSON, uma entrada por foto, com o número dela:",
  '{"fotos": [{"n": 1, "camada": "externa", "angulo": "tres_quartos_frente", "descricao": "Frente", "aproveitavel": true}]}',
].join("\n");

/**
 * Um pedido de classificação: as instruções no `system` e as fotos numa
 * mensagem de usuário (a DeepSeek só aceita imagem em mensagem de usuário),
 * cada uma precedida do número dela — é o número que amarra a resposta à URL.
 * `detail: low` reduz a imagem a 512 px antes de o modelo ver: basta para
 * dizer o que a foto mostra, e é o que deixa a classificação em frações de
 * centavo por carro.
 */
export function montarPedidoDeClassificacao(
  carro: { nome: string },
  fotos: readonly { url: string; posicao: number }[],
): MensagemDoModelo[] {
  const partes: ParteDaMensagem[] = [
    { type: "text", text: `Carro: ${carro.nome}. ${fotos.length} foto(s), na ordem:` },
  ];
  fotos.forEach((f, i) => {
    partes.push({ type: "text", text: `Foto ${i + 1}:` });
    partes.push({ type: "image_url", image_url: { url: f.url, detail: "low" } });
  });
  return [
    { role: "system", content: INSTRUCOES_DA_CLASSIFICACAO },
    { role: "user", content: partes },
  ];
}

function extrairJson(conteudo: string): unknown {
  const limpo = conteudo.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(limpo);
  } catch {
    const inicio = limpo.indexOf("{");
    const fim = limpo.lastIndexOf("}");
    if (inicio < 0 || fim <= inicio) return null;
    try {
      return JSON.parse(limpo.slice(inicio, fim + 1));
    } catch {
      return null;
    }
  }
}

/**
 * A descrição tem dinheiro, placa, telefone, e-mail ou endereço de site? O
 * modelo de visão LÊ o que está escrito na foto — a etiqueta de preço no
 * vidro, o adesivo da loja —, e a descrição vira legenda, destaque da oferta
 * e linha do catálogo. Número de quatro dígitos ou mais conta, menos ano
 * (1950 a 2035) e quilometragem; "aro 17" e "1.0 turbo" passam.
 */
function temDinheiroOuContato(t: string): boolean {
  if (/r\$|\breais?\b|\d\s*mil\b(?!\s*km)|\d\s*k\b/i.test(t)) return true;
  // Falar de preço, mesmo por extenso ("preço oitenta e nove mil"), é preço.
  if (/\b(?:pre[çc]os?|valor(?:es)?|etiqueta|oferta|promo[çc][ãa]o|desconto|[àa] vista|parcelas?|financi)/i.test(t)) return true;
  // E-mail ou qualquer coisa com cara de endereço de site (loja.auto, t.co/abc).
  if (/@|\b[a-z0-9-]+\.[a-z]{2,}\b/i.test(t)) return true;
  // Placa: a Mercosul (ABC1D23) e a antiga (ABC-1234), com ou sem espaço.
  if (/\b[a-z]{3}[\s-]?\d[a-z0-9]\d{2}\b/i.test(t)) return true;
  // Milhar separado por espaço ("79 990") conta como um número só.
  t = t.replace(/(\d)\s(?=\d{3}\b)/g, "$1");
  for (const casado of t.matchAll(/\d[\d.,]*/g)) {
    const digitos = casado[0].replace(/[.,]\d{1,2}$/, "").replace(/\D/g, "");
    const n = Number(digitos);
    if (!Number.isFinite(n) || n < 1000) continue;
    if (digitos.length === 4 && n >= 1950 && n <= 2035) continue;
    if (/^\s*(?:km\b|quil)/i.test(t.slice((casado.index ?? 0) + casado[0].length))) continue;
    return true;
  }
  return false;
}

/**
 * A descrição vira legenda no WhatsApp, destaque da oferta e linha do
 * catálogo: uma linha, curta, sem link — e descartada inteira quando tem
 * dinheiro ou contato (`temDinheiroOuContato`). Descartar é melhor que
 * "limpar": meia frase sobre uma etiqueta de preço ainda fala de preço.
 */
export function descricaoValida(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || /\b(?:https?:\/\/|www\.)/i.test(t) || temDinheiroOuContato(t)) return null;
  const curta = t.length > TETO_DA_DESCRICAO ? t.slice(0, TETO_DA_DESCRICAO).replace(/\s+\S*$/, "") : t;
  return curta ? curta.charAt(0).toUpperCase() + curta.slice(1) : null;
}

/**
 * A resposta do modelo, conferida contra as fotos que foram no pedido.
 *
 *   - Nula quando não é JSON, ou não classifica NENHUMA das fotos: quem chama
 *     não grava nada, e o lote continua na fila.
 *   - A foto que o modelo pulou fica de fora da lista — e na fila, para um
 *     pedido menor na próxima vez. Marcá-la como "outra" tiraria do cliente
 *     uma foto boa por um tropeço do modelo.
 *   - Camada inventada vira `outra`, não aproveitável: o modelo viu a foto e
 *     não soube dizer o que era.
 *   - Numeração a partir de zero (acontece) é reconhecida e corrigida.
 */
export function lerClassificacao(
  conteudo: string,
  fotos: readonly { url: string; posicao: number }[],
): FotoClassificada[] | null {
  const bruto = extrairJson(conteudo);
  if (!bruto || typeof bruto !== "object") return null;
  const lista = (bruto as Record<string, unknown>).fotos;
  if (!Array.isArray(lista)) return null;
  const itens = lista.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object");
  const numeros = itens.map((r, i) => (Number.isInteger(Number(r.n)) && r.n !== null && r.n !== "" ? Number(r.n) : i + 1));
  const desdeZero = numeros.includes(0) && !numeros.includes(fotos.length);
  const porNumero = new Map<number, Record<string, unknown>>();
  itens.forEach((r, i) => {
    const n = numeros[i] + (desdeZero ? 1 : 0);
    if (n >= 1 && n <= fotos.length && !porNumero.has(n)) porNumero.set(n, r);
  });
  if (porNumero.size === 0) return null;
  return fotos.flatMap((f, i) => {
    const r = porNumero.get(i + 1);
    if (!r) return [];
    const camada: CamadaClassificada = ehCamada(r.camada) || r.camada === "outra" ? (r.camada as CamadaClassificada) : "outra";
    const angulo = camada === "externa" && (ANGULOS as readonly unknown[]).includes(r.angulo) ? (r.angulo as AnguloDaFoto) : null;
    return [
      {
        url: f.url,
        posicao: f.posicao,
        camada,
        angulo,
        descricao: descricaoValida(r.descricao),
        aproveitavel: camada !== "outra" && r.aproveitavel !== false,
      },
    ];
  });
}

/** Uma foto que o modelo de visão não consegue abrir: não vai ao cliente (a Evolution também não abriria). */
export function fotoInacessivel(f: { url: string; posicao: number }): FotoClassificada {
  return { url: f.url, posicao: f.posicao, camada: "outra", angulo: null, descricao: null, aproveitavel: false };
}

// ----------------------------------------------------------------------------
// O que vai ao prompt do atendimento
// ----------------------------------------------------------------------------

function utilizaveis(fotos: readonly FotoClassificada[], camada: CamadaDaFoto): FotoClassificada[] {
  return fotos.filter((f) => f.aproveitavel && f.camada === camada).sort((a, b) => a.posicao - b.posicao);
}

/** "teto solar panorâmico e faróis de LED" — o que os detalhes mostram, para a oferta. */
function destaques(fotos: readonly FotoClassificada[], camada: CamadaDaFoto, maximo = 2): string | null {
  if (camada !== "detalhes") return null;
  const vistos = new Set<string>();
  const nomes: string[] = [];
  for (const f of utilizaveis(fotos, camada)) {
    // A mesma régua da legenda, também na leitura: linha antiga, gravada
    // antes de uma regra nova, não escapa pela oferta nem pelo catálogo.
    const d = descricaoValida(f.descricao);
    if (!d) continue;
    const chave = d.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    nomes.push(d.charAt(0).toLowerCase() + d.slice(1));
    if (nomes.length >= maximo) break;
  }
  return nomes.length > 0 ? juntar(nomes) : null;
}

function juntar(itens: readonly string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`;
}

/**
 * Uma linha por carro no catálogo: quantas fotos de cada camada ele tem.
 * "fotos: fora 5 · interior 6 · detalhes da versão 3 (teto solar e faróis de LED) · rodas 2".
 * Carro com fotos ainda não classificadas diz isso — o atendimento classifica
 * na hora em que o cliente pedir.
 */
export function resumoDasFotos(fotos: readonly FotoClassificada[], totalNaGaleria: number): string | null {
  const partes = CAMADAS_DA_FOTO.map((c) => {
    const n = utilizaveis(fotos, c).length;
    if (n === 0) return null;
    const d = destaques(fotos, c);
    return `${ROTULO_DA_CAMADA[c]} ${n}${d ? ` (${d})` : ""}`;
  }).filter((p): p is string => p !== null);
  if (partes.length > 0) return `fotos: ${partes.join(" · ")}`;
  if (totalNaGaleria > 0) return `fotos: ${totalNaGaleria} (ainda não separadas por camada)`;
  return null;
}

// ----------------------------------------------------------------------------
// O envio
// ----------------------------------------------------------------------------

/** Preferência de ângulo para as fotos de fora: o três-quartos de frente é a foto que vende. */
const PREFERENCIA_DE_ANGULO: readonly AnguloDaFoto[] = ["tres_quartos_frente", "lateral", "tres_quartos_traseira", "traseira", "frente"];

/**
 * As fotos da camada pedida que ainda não foram à conversa.
 *
 * De fora, a escolha varia o ângulo (a capa, depois um de cada ângulo que
 * falta) antes de completar pela ordem da galeria — quatro fotos da frente
 * não mostram o carro. Saem na ordem da galeria.
 */
export function escolherFotos(
  fotos: readonly FotoClassificada[],
  camada: CamadaDaFoto,
  jaEnviadas: ReadonlySet<string>,
): FotoClassificada[] {
  const candidatas = utilizaveis(fotos, camada).filter((f) => !jaEnviadas.has(f.url));
  const quantas = FOTOS_POR_CAMADA[camada];
  if (camada !== "externa" || candidatas.length <= quantas) return candidatas.slice(0, quantas);
  const escolhidas: FotoClassificada[] = [candidatas[0]];
  const angulos = new Set(candidatas[0].angulo ? [candidatas[0].angulo] : []);
  for (const angulo of PREFERENCIA_DE_ANGULO) {
    if (escolhidas.length >= quantas) break;
    if (angulos.has(angulo)) continue;
    const f = candidatas.find((c) => c.angulo === angulo && !escolhidas.includes(c));
    if (f) {
      escolhidas.push(f);
      angulos.add(angulo);
    }
  }
  for (const f of candidatas) {
    if (escolhidas.length >= quantas) break;
    if (!escolhidas.includes(f)) escolhidas.push(f);
  }
  return escolhidas.sort((a, b) => a.posicao - b.posicao);
}

/** Sem classificação: as próximas fotos da galeria, em ordem. */
export function fotosDaGaleria(urls: readonly string[], jaEnviadas: ReadonlySet<string>): string[] {
  return urls.filter((u) => !jaEnviadas.has(u)).slice(0, FOTOS_DA_GALERIA_POR_VEZ);
}

/** A legenda da foto no WhatsApp: a descrição da classificação, se houver. */
export function legendaDaFoto(foto: Pick<FotoClassificada, "descricao">): string | null {
  return descricaoValida(foto.descricao);
}

/** As camadas que este carro tem e que ainda não foram à conversa, na ordem de oferta. */
export function camadasRestantes(fotos: readonly FotoClassificada[], mostradas: ReadonlySet<CamadaDaFoto>): CamadaDaFoto[] {
  return CAMADAS_DA_FOTO.filter((c) => !mostradas.has(c) && utilizaveis(fotos, c).length > 0);
}

function comDestaque(fotos: readonly FotoClassificada[], c: CamadaDaFoto): string {
  const d = destaques(fotos, c);
  return d ? `${DA_CAMADA[c]} (${d})` : DA_CAMADA[c];
}

/**
 * A pergunta que vem depois das fotos — uma camada de cada vez.
 *
 *   - Faltam as de fora (o cliente pediu o interior primeiro): oferece as de fora.
 *   - Foram as de fora: oferece o interior.
 *   - Depois do interior: lista os detalhes que o carro tem (até três).
 *   - Já mostrou algum detalhe: lembra o que sobrou, sem perguntar de novo.
 *   - Nada sobrou: nenhuma pergunta.
 */
export function ofertaDepoisDasFotos(fotos: readonly FotoClassificada[], mostradas: ReadonlySet<CamadaDaFoto>): string | null {
  const restantes = camadasRestantes(fotos, mostradas);
  if (restantes.includes("externa")) return "Quer ver as fotos de fora também?";
  if (restantes.includes("interior")) return "Quer ver o interior também?";
  const detalhes = restantes.filter((c) => CAMADAS_DE_DETALHE.includes(c)).slice(0, 3);
  if (detalhes.length === 0) return null;
  const lista = juntar(detalhes.map((c) => comDestaque(fotos, c)));
  const jaViuDetalhe = CAMADAS_DE_DETALHE.some((c) => mostradas.has(c));
  return jaViuDetalhe ? `Se quiser, tenho também fotos ${lista}.` : `Tenho também fotos ${lista}. Quer ver alguma?`;
}

/**
 * As frases que fecham o pedido de fotos quando nenhuma foto sai. O modelo já
 * escreveu "Olha ele aqui 👇" antes; sem uma destas, a frase ficaria
 * pendurada no WhatsApp do cliente.
 */
export const SEM_FOTO_DO_CARRO = "Não achei as fotos desse carro aqui, mas a nossa equipe consegue te mandar. 😉";
export const FOTOS_FORA_DO_AR = "Não consegui puxar as fotos agora, mas a nossa equipe consegue te mandar. 😉";
export const MAIS_FOTOS_DA_GALERIA = "Quer ver mais fotos?";

/** A camada pedida já foi inteira: lembra onde estão e oferece o que sobrou. */
export function fotosJaMostradas(oferta: string | null): string {
  return oferta ? `Essas fotos já estão aí em cima 🙂 ${oferta}` : "Essas são todas as fotos que tenho dele aqui 🙂";
}

/** A camada pedida pode estar entre as fotos que o modelo ainda não separou: não dá para dizer que não tem. */
export function fotosAindaNaoSeparadas(camada: CamadaDaFoto): string {
  return `Ainda não separei as fotos ${DA_CAMADA[camada]} desse carro, mas a nossa equipe consegue te mandar. 😉`;
}

/** "de fora do Onix LT 2020 (#7950008)" — o pedido, para o resumo ao vendedor e o rastro. */
export function pedidoDeFotosLegivel(pedido: PedidoDeFotos, nomeDoCarro: string | null | undefined): string {
  return `${DA_CAMADA[pedido.camada]} do ${nomeDoCarro?.trim() || "carro"} (#${pedido.veiculo})`;
}

/** Sem fotos daquela camada: o assistente não inventa, a equipe manda. */
export function semFotoDaCamada(camada: CamadaDaFoto): string {
  return camada === "externa"
    ? "Não tenho as fotos desse carro aqui agora, mas a nossa equipe consegue te mandar. 😉"
    : `Não tenho foto ${DA_CAMADA[camada]} desse carro aqui, mas a nossa equipe consegue te mandar. 😉`;
}

/**
 * A linha do estado do prompt para um carro que já teve foto na conversa: o
 * que foi mostrado e o que ainda dá para oferecer. É o que impede o modelo de
 * pedir a mesma camada de novo.
 */
export function linhaDasFotosNoEstado(
  carro: { id: string; nome: string },
  fotos: readonly FotoClassificada[],
  mostradas: ReadonlySet<CamadaDaFoto>,
): string {
  const ja = CAMADAS_DA_FOTO.filter((c) => mostradas.has(c)).map((c) => ROTULO_DA_CAMADA[c]);
  const restantes = camadasRestantes(fotos, mostradas).map((c) => {
    const d = destaques(fotos, c);
    return d ? `${ROTULO_DA_CAMADA[c]} (${d})` : ROTULO_DA_CAMADA[c];
  });
  return `- #${carro.id} ${carro.nome}: já enviou ${ja.length > 0 ? ja.join(", ") : "fotos da galeria"}; ainda pode oferecer: ${restantes.length > 0 ? restantes.join(", ") : "nada — já mostrou tudo"}.`;
}

/** O resumo de um grupo de fotos no histórico que o modelo relê. */
export function fotosNoHistorico(n: number, camada: CamadaDaFoto | null, veiculo: string | null): string {
  const qual = camada ? DA_CAMADA[camada] : "da galeria";
  return `(enviou ${n} foto${n === 1 ? "" : "s"} ${qual}${veiculo ? ` do carro #${veiculo}` : ""})`;
}

// ----------------------------------------------------------------------------
// A aba Fotos do Atendimento IA — ver e corrigir a classificação
// ----------------------------------------------------------------------------

/** O rótulo de cada escolha da tela, na ordem do seletor. `outra` é "não mandar". */
export const ROTULO_DA_ESCOLHA: Record<CamadaClassificada, string> = {
  externa: "Fora",
  interior: "Interior",
  detalhes: "Detalhes da versão",
  rodas: "Rodas",
  motor: "Motor",
  porta_malas: "Porta-malas",
  outra: "Não mandar ao cliente",
};
export const ESCOLHAS_DA_TELA: readonly CamadaClassificada[] = [...CAMADAS_DA_FOTO, "outra"];

/** Uma foto da galeria do carro, com o que a classificação disse dela (nada, se ainda está na fila). */
export interface FotoNaTela {
  url: string;
  posicao: number;
  camada: CamadaClassificada | null;
  descricao: string | null;
  aproveitavel: boolean;
  corrigida: boolean;
}

/**
 * A galeria ATUAL do carro, na ordem do anúncio, com a classificação de cada
 * foto. A linha de uma foto que saiu da galeria não aparece — e também não é
 * enviada, porque o envio parte da galeria.
 */
export function fotosNaTela(urls: readonly string[], classificadas: readonly FotoClassificada[]): FotoNaTela[] {
  const porUrl = new Map(classificadas.map((f) => [f.url, f]));
  return urls.map((url, posicao) => {
    const f = porUrl.get(url);
    return {
      url,
      posicao,
      camada: f?.camada ?? null,
      descricao: f?.descricao ?? null,
      aproveitavel: f ? f.aproveitavel : false,
      corrigida: f?.corrigida === true,
    };
  });
}

export interface SituacaoDasFotos {
  total: number;
  classificadas: number;
  /** Na fila: ainda não vistas pelo modelo. */
  pendentes: number;
  /** As que vão ao cliente, por camada. */
  porCamada: Partial<Record<CamadaDaFoto, number>>;
  /** Classificadas como "não mandar" ou não aproveitáveis. */
  foraDoEnvio: number;
  corrigidas: number;
}

export function situacaoDasFotos(urls: readonly string[], classificadas: readonly FotoClassificada[]): SituacaoDasFotos {
  const tela = fotosNaTela(urls, classificadas);
  const porCamada: Partial<Record<CamadaDaFoto, number>> = {};
  for (const f of tela) {
    if (f.camada && f.camada !== "outra" && f.aproveitavel) porCamada[f.camada] = (porCamada[f.camada] ?? 0) + 1;
  }
  return {
    total: tela.length,
    classificadas: tela.filter((f) => f.camada !== null).length,
    pendentes: tela.filter((f) => f.camada === null).length,
    porCamada,
    foraDoEnvio: tela.filter((f) => f.camada !== null && (f.camada === "outra" || !f.aproveitavel)).length,
    corrigidas: tela.filter((f) => f.corrigida).length,
  };
}

export type CorrecaoDaFoto =
  | { ok: true; veiculo: string; url: string; camada: CamadaClassificada; descricao: string | null }
  | { ok: false; erro: string };

/**
 * O que a tela manda gravar, conferido. "Não mandar ao cliente" é a camada
 * `outra`; a legenda passa pela mesma régua da classificação (uma linha,
 * curta, sem link).
 */
export function correcaoValida(corpo: unknown): CorrecaoDaFoto {
  if (!corpo || typeof corpo !== "object") return { ok: false, erro: "Corpo inválido." };
  const c = corpo as Record<string, unknown>;
  const veiculo = String(c.veiculo ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!veiculo || veiculo === "0" || veiculo.length > 15) return { ok: false, erro: "Diga de que carro é a foto." };
  const url = typeof c.url === "string" ? c.url.trim() : "";
  if (!/^https?:\/\//i.test(url)) return { ok: false, erro: "Foto sem endereço." };
  if (!(ESCOLHAS_DA_TELA as readonly unknown[]).includes(c.camada)) return { ok: false, erro: "Escolha a camada da foto." };
  return { ok: true, veiculo, url, camada: c.camada as CamadaClassificada, descricao: descricaoValida(c.descricao) };
}

/** "fora 5 · interior 4 · rodas 2" — o que o carro tem para mandar, na lista da aba. */
export function linhaDasCamadas(s: SituacaoDasFotos): string {
  const partes = CAMADAS_DA_FOTO.filter((c) => (s.porCamada[c] ?? 0) > 0).map((c) => `${ROTULO_DA_CAMADA[c]} ${s.porCamada[c]}`);
  return partes.length > 0 ? partes.join(" · ") : "nada separado ainda";
}

/** O que "classificar agora" devolve à tela. */
export interface ResultadoNaTela {
  ok: boolean;
  motivo?: string;
  fotos_classificadas: number;
  falhas: number;
  restantes?: number;
}

/** O resultado de "classificar agora", numa frase. */
export function fraseDoResultado(r: ResultadoNaTela): string {
  if (!r.ok) return `Não classificou: ${r.motivo ?? "erro sem motivo"}.`;
  const fotos = r.fotos_classificadas === 1 ? "1 foto classificada" : `${r.fotos_classificadas} fotos classificadas`;
  const resto = typeof r.restantes === "number" && r.restantes > 0 ? ` Ficaram ${r.restantes} carro(s) para a próxima rodada.` : "";
  const falhas = r.falhas > 0 ? ` ${r.falhas} pedido(s) ao modelo falharam e voltam à fila${r.motivo ? ` (${r.motivo})` : ""}.` : "";
  return `${fotos}.${resto}${falhas}`;
}
