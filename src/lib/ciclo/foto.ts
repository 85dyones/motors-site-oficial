/**
 * A foto da etiqueta — preparo e endereço.
 *
 * A Emenda 01 fez da foto da etiqueta de troca de óleo a prova do carimbo
 * (§5.7). Este módulo cuida das duas coisas que precisam valer igual no
 * cliente e na loja: onde o arquivo mora e em que estado ele sobe.
 *
 * **Por que reduzir antes de enviar.** Quem fotografa a etiqueta está de pé
 * ao lado do carro, no 4G, com um celular que gera JPEG de 4 a 12 MB. Subir o
 * original é o caminho mais curto para um upload que trava na metade e um
 * cliente que desiste — e o KM da etiqueta é legível com folga em 1600px.
 * Reduzir no navegador troca "12 MB e talvez" por "600 KB e pronto".
 *
 * O envio é DIRETO do navegador para o Storage, sob RLS. Não passa pela rota:
 * função serverless da Vercel recusa corpo acima de ~4,5 MB, e o limite
 * apareceria justamente na foto grande — a que mais importa não perder.
 */

export const BUCKET_DO_DIARIO = "diario-de-bordo";

/** Lado maior da imagem depois do preparo. Etiqueta fica legível bem antes disto. */
export const LADO_MAXIMO = 1600;

/** Teto do bucket (15 MB). Acima disso o Storage recusa, então nem tentamos. */
export const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;

export const TIPOS_ACEITOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/**
 * O caminho do arquivo. O PRIMEIRO segmento é o veículo, e não é decoração:
 * é o que a RLS de `storage.objects` lê para decidir de quem é a pasta.
 * Mudar este formato sem mudar a policy abre ou tranca o acesso de todo mundo.
 */
export function caminhoDaFoto(
  veiculoVendidoId: string,
  qual: "atual" | "anterior" | "nota",
  nomeOriginal: string,
): string {
  const extensao = (nomeOriginal.split(".").pop() ?? "jpg").toLowerCase().slice(0, 5);
  const seguro = /^[a-z0-9]+$/.test(extensao) ? extensao : "jpg";
  const carimbo = Date.now();
  const sorteio = Math.random().toString(36).slice(2, 8);
  return `${veiculoVendidoId}/${qual}-${carimbo}-${sorteio}.${seguro}`;
}

export interface ProblemaDaFoto {
  mensagem: string;
}

/** O que impede esta foto de ser enviada. Vazio = pode subir. */
export function validarFoto(arquivo: { type: string; size: number }): ProblemaDaFoto | null {
  if (!arquivo.type.startsWith("image/")) {
    return { mensagem: "Envie uma foto (JPG, PNG ou HEIC) — não um documento." };
  }
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    return { mensagem: "Essa foto passa de 15 MB. Tente tirar outra com menos zoom." };
  }
  return null;
}

/**
 * Reduz a imagem para no máximo `LADO_MAXIMO` no lado maior e devolve JPEG.
 *
 * `createImageBitmap` com `imageOrientation: "from-image"` resolve o problema
 * clássico da foto de celular: o EXIF diz "girada 90°", o canvas ignora, e a
 * etiqueta chega deitada para quem vai conferir o KM.
 *
 * Se qualquer passo falhar — navegador antigo, HEIC que o canvas não decodifica
 * — devolve o arquivo ORIGINAL. Foto grande que sobe é melhor que foto
 * perfeita que não existe.
 */
export async function prepararFoto(arquivo: File): Promise<File> {
  if (typeof window === "undefined" || typeof createImageBitmap !== "function") {
    return arquivo;
  }

  try {
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    const maior = Math.max(bitmap.width, bitmap.height);

    if (maior <= LADO_MAXIMO && arquivo.size <= 1_500_000) {
      bitmap.close?.();
      return arquivo;
    }

    const escala = Math.min(1, LADO_MAXIMO / maior);
    const largura = Math.round(bitmap.width * escala);
    const altura = Math.round(bitmap.height * escala);

    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return arquivo;
    }
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob || blob.size === 0) return arquivo;

    // Se o "preparo" engordou o arquivo (PNG pequeno vira JPEG maior), fica o
    // original: o objetivo é subir menos, não subir diferente.
    if (blob.size >= arquivo.size) return arquivo;

    const nome = arquivo.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nome, { type: "image/jpeg" });
  } catch {
    return arquivo;
  }
}

/**
 * O endereço para EXIBIR a foto.
 *
 * Duas origens convivem na mesma coluna, e a diferença é o prefixo:
 *   • `http…`  — URL externa colada à mão pela equipe (o jeito antigo, de
 *     quando a foto vinha por WhatsApp). Continua valendo.
 *   • qualquer outra coisa — caminho dentro do bucket privado, que só abre
 *     por URL assinada; quem assina é `/api/ciclo/foto`, sob RLS.
 */
export function urlDaFoto(valor: string | null | undefined): string | null {
  const limpo = (valor ?? "").trim();
  if (!limpo) return null;
  if (/^https?:\/\//i.test(limpo)) return limpo;
  return `/api/ciclo/foto?caminho=${encodeURIComponent(limpo)}`;
}

/** É arquivo nosso, no bucket privado? (o contrário de URL externa) */
export function ehCaminhoDoBucket(valor: string | null | undefined): boolean {
  const limpo = (valor ?? "").trim();
  return limpo !== "" && !/^https?:\/\//i.test(limpo);
}
