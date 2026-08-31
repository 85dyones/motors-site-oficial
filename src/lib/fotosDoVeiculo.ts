/**
 * As fotos do anúncio — endereço, pareamento e leitura.
 *
 * ---------------------------------------------------------------------------
 * O que este módulo NÃO é
 * ---------------------------------------------------------------------------
 * Não é o diário de bordo. Lá (`lib/ciclo/foto.ts`) a foto é PROVA: bucket
 * privado, URL assinada de 5 minutos, `protect_delete` impedindo que alguém
 * apague o carimbo. Aqui a foto é o PRODUTO: ela aparece na vitrine, no card do
 * WhatsApp e no feed dos portais, e por isso o bucket `veiculos` é público na
 * leitura — link de anúncio que expira é pior que foto sem tratamento (é o
 * §1 da migração `20260829180000_f0p_storage_das_fotos_do_veiculo.sql`).
 *
 * Trocar fotografia tremida é trabalho normal de marketing, então DELETE
 * existe. O que continua igual ao diário é o desenho do caminho — a pasta é o
 * veículo — e o envio direto do navegador para o Storage.
 *
 * ---------------------------------------------------------------------------
 * Sem imports de servidor
 * ---------------------------------------------------------------------------
 * O editor A15 é componente de cliente e o card público também. Um import de
 * `./supabase` aqui arrastaria o cliente do banco para o bundle do navegador —
 * mesma nota de `lib/coerenciaDoCadastro.ts` e `lib/perfisDeUso.ts`.
 */

/** O bucket da migração F0-p. Um nome só, e ele vem daqui. */
export const BUCKET_DE_FOTOS = "veiculos";

/**
 * Teto do bucket (15 MB). Acima disso o Storage recusa, então nem tentamos —
 * e o operador lê o motivo em vez de um erro de rede.
 */
export const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;

/**
 * O que o bucket aceita GRAVAR (`allowed_mime_types` da F0-p).
 *
 * Não é a lista do que o operador pode ESCOLHER: o arquivo sempre passa pelo
 * canvas antes de subir, então o que chega ao Storage é sempre JPEG ou WebP.
 * A lista existe para o caso em que o tratamento falha e o original é a única
 * coisa que temos — aí, se o formato não estiver aqui, o Storage recusaria e é
 * melhor dizer isso antes.
 */
export const MIMES_DO_BUCKET = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * As duas versões de cada foto, e a coluna de cada uma.
 *
 * O nome das colunas veio do RevendaMais e engana: quem lê `whatsapp_images`
 * pensa em compartilhamento, mas o site usa essa coluna como **galeria
 * principal**. Medido nos consumidores em 2026-08-30:
 *
 *   • `whatsapp_images[0]` → `og:image` da ficha (card do WhatsApp) e
 *     `<g:image_link>` do feed do Google Merchant / catálogo Meta;
 *   • `whatsapp_images[*]` → carrossel, miniaturas e lightbox da PDP;
 *   • `web_full_images[0]` → foto do card do catálogo, do hero da home, da
 *     vitrine de balcão/TV e da imagem do JSON-LD.
 *
 * Daí a divisão de formato, que não é estética:
 *
 *   • **`zap` é JPEG** porque quem consome é scraper de fora — WhatsApp,
 *     Facebook e portal. O comentário de `imageProcessor.ts` já registrava que
 *     o WhatsApp não renderiza WebP em prévia de link; um anúncio sem imagem no
 *     WhatsApp é o pior lugar possível para descobrir isso.
 *   • **`web` é WebP** porque quem consome é navegador nosso, e ali o WebP
 *     custa ~30% menos byte pelo mesmo olho.
 *
 * Os dois arrays andam pareados por ÍNDICE: `whatsapp_images[3]` e
 * `web_full_images[3]` são a mesma fotografia. É isso que faz "a primeira é a
 * capa" valer nas duas colunas ao mesmo tempo.
 */
export type VarianteDaFoto = "web" | "zap";

export const EXTENSAO_DA_VARIANTE: Record<VarianteDaFoto, string> = {
  web: "webp",
  zap: "jpg",
};

/**
 * O caminho do arquivo. O PRIMEIRO segmento é o veículo, como no diário — e
 * também não é decoração: é o desenho que a migração F0-p fixou (`§3`), o
 * mesmo que dispensa tabela intermediária para saber de quem é a pasta.
 *
 * `estoque_motors.id` é **integer** (o id do anúncio no RevendaMais, não uuid
 * — ver `docs/levantamento-atual.md` §2.1), então a pasta é uma sequência de
 * dígitos. Recusar qualquer outra coisa é o que impede um id vindo da URL de
 * virar `../` dentro do bucket.
 */
export function caminhoDaFoto(
  estoqueId: string | number,
  lote: string,
  variante: VarianteDaFoto,
): string {
  const pasta = String(estoqueId).trim();
  if (!/^\d+$/.test(pasta)) {
    throw new Error("Id de veículo inválido para o caminho da foto.");
  }
  if (!/^[a-z0-9-]+$/.test(lote)) {
    throw new Error("Lote inválido para o caminho da foto.");
  }
  return `${pasta}/${lote}-${variante}.${EXTENSAO_DA_VARIANTE[variante]}`;
}

/**
 * O identificador que amarra as duas versões da MESMA foto.
 *
 * Sem ele, apagar uma foto exigiria adivinhar qual arquivo `web` corresponde a
 * qual `zap`. Com ele, os dois caminhos só diferem no sufixo — e a faxina
 * remove o par.
 */
export function novoLote(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** O prefixo da URL pública do bucket. É o que identifica foto NOSSA. */
export const PREFIXO_PUBLICO = `/storage/v1/object/public/${BUCKET_DE_FOTOS}/`;

/**
 * O caminho dentro do bucket, a partir da URL guardada na coluna.
 *
 * A coluna guarda URL, não caminho — porque a URL é o anúncio e precisa
 * funcionar em scraper de fora, sem SDK e sem sessão. Para APAGAR, porém, o
 * Storage quer o caminho; esta função faz o caminho de volta.
 *
 * `null` para tudo que não é nosso: URL do carro57 não se apaga daqui.
 */
export function caminhoDaUrlPublica(url: string | null | undefined): string | null {
  const limpo = (url ?? "").trim();
  const i = limpo.indexOf(PREFIXO_PUBLICO);
  if (i < 0) return null;
  const bruto = limpo.slice(i + PREFIXO_PUBLICO.length).split("?")[0];
  if (!bruto) return null;
  try {
    return decodeURIComponent(bruto);
  } catch {
    return bruto;
  }
}

/**
 * A foto é do NOSSO storage?
 *
 * Quem pergunta é o card público, para decidir se passa pelo otimizador da
 * Vercel — ver o comentário em `components/modernist/primitivos.tsx`. A régua
 * é o caminho do bucket, e não o host: `*.supabase.co` sozinho casaria com
 * qualquer outro bucket do projeto (o diário, por exemplo), que nunca aparece
 * em vitrine.
 */
export function ehFotoPropria(url: string | null | undefined): boolean {
  return caminhoDaUrlPublica(url) !== null;
}

/** Uma fotografia do anúncio, nas suas duas versões. */
export interface FotoDoVeiculo {
  /** Para `whatsapp_images` — JPEG. Galeria da ficha, og:image e feed. */
  zap: string;
  /** Para `web_full_images` — WebP. Card, hero e vitrine. */
  web: string;
}

/** Só strings não vazias, na ordem em que estão. Coluna jsonb chega como any. */
function listaDeUrls(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((u): u is string => typeof u === "string" && u.trim() !== "");
}

/**
 * As duas colunas viram uma lista de fotos pareadas.
 *
 * Os arrays podem ter tamanhos diferentes — no feed do RevendaMais isso é
 * comum, e há linha com um array vazio e outro cheio. Quando falta o par, a
 * versão que existe serve às duas pontas: melhor uma foto exibida duas vezes
 * do que uma foto perdida no meio da galeria.
 */
export function fotosDoVeiculo(whatsapp: unknown, webFull: unknown): FotoDoVeiculo[] {
  const zaps = listaDeUrls(whatsapp);
  const webs = listaDeUrls(webFull);
  const total = Math.max(zaps.length, webs.length);

  const fotos: FotoDoVeiculo[] = [];
  for (let i = 0; i < total; i += 1) {
    const zap = zaps[i] ?? webs[i];
    const web = webs[i] ?? zaps[i];
    if (zap && web) fotos.push({ zap, web });
  }
  return fotos;
}

/**
 * A lista de fotos vira as três colunas que o site já lê.
 *
 * `url_imagem` entra junto porque é o degrau de queda do mapper
 * (`lib/supabase.ts` ~229): com os dois arrays vazios ele vira a foto única do
 * veículo. Gravar só os arrays deixaria a capa antiga viva nesse degrau, e um
 * carro trocaria de foto ao perder o array — foi assim que o override que só
 * vivia no JSON deixou "vendido" sem efeito no servidor.
 */
export function colunasDasFotos(fotos: FotoDoVeiculo[]): {
  whatsapp_images: string[];
  web_full_images: string[];
  url_imagem: string | null;
} {
  return {
    whatsapp_images: fotos.map((f) => f.zap),
    web_full_images: fotos.map((f) => f.web),
    // A capa é a primeira, e é o JPEG: este campo também alimenta og:image
    // quando os arrays estão vazios.
    url_imagem: fotos[0]?.zap ?? null,
  };
}

/**
 * Move a foto de uma posição para outra, devolvendo lista nova.
 *
 * Reordenar é a operação de maior consequência desta tela: a primeira posição é
 * a capa do card, do card do WhatsApp e do anúncio no portal. Índice fora da
 * lista devolve a lista intacta em vez de estourar — clique duplo no fim da
 * fila não pode derrubar a galeria inteira.
 */
export function moverFoto(
  fotos: readonly FotoDoVeiculo[],
  de: number,
  para: number,
): FotoDoVeiculo[] {
  const lista = [...fotos];
  if (de < 0 || de >= lista.length || para < 0 || para >= lista.length || de === para) {
    return lista;
  }
  const [movida] = lista.splice(de, 1);
  lista.splice(para, 0, movida);
  return lista;
}

export interface ProblemaDaFoto {
  mensagem: string;
}

/**
 * O que impede este arquivo de virar foto de anúncio. `null` = pode subir.
 *
 * Aceita QUALQUER `image/*` na entrada, HEIC de iPhone incluído: o tratamento
 * transcodifica para JPEG e WebP antes do envio, então o que o bucket recebe
 * está sempre dentro de `MIMES_DO_BUCKET`. Barrar HEIC aqui recusaria o
 * arquivo que a sessão de fotos mais produz.
 */
export function validarFoto(arquivo: { type: string; size: number; name?: string }): ProblemaDaFoto | null {
  const ehImagem =
    arquivo.type.startsWith("image/") ||
    // Alguns navegadores entregam HEIC com `type` vazio. O nome resolve.
    (arquivo.type === "" && /\.(jpe?g|png|webp|heic|heif|avif)$/i.test(arquivo.name ?? ""));

  if (!ehImagem) {
    return { mensagem: "Envie uma imagem (JPG, PNG, WebP ou HEIC) — não um documento." };
  }
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    return {
      mensagem: `"${arquivo.name ?? "arquivo"}" passa de 15 MB, o teto do armazenamento. Exporte a foto em qualidade menor.`,
    };
  }
  return null;
}
