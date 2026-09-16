/**
 * Utilitários para processamento de imagem no lado do cliente (Client-Side).
 * Usamos a API HTML5 Canvas nativa para evitar dependências pesadas como sharp,
 * economizando banda e tempo de upload, e garantindo que o arquivo enviado
 * esteja num tamanho otimizado para web.
 */

import {
  EXTENSAO_DA_VARIANTE,
  MIMES_DO_BUCKET,
  type VarianteDaFoto,
} from "./fotosDoVeiculo";

export const processImage = (
  file: File,
  type: 'logo' | 'favicon' | 'compartilhamento'
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    // 1. Ler o arquivo para um Data URL
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        
        if (!ctx) {
          return reject(new Error("Não foi possível iniciar o processador de imagem."));
        }

        if (type === 'compartilhamento') {
          // Card de prévia de link: 1200×630 exatos, sempre.
          //
          // Recorte central cobrindo a moldura inteira, em vez de encaixar a
          // imagem dentro dela. Deixar a arte "caber" com barras é o que
          // produz aquele card com faixas pretas em cima e embaixo no
          // WhatsApp; e esticar é o defeito que essa rodada veio corrigir.
          // Cortar é a única opção que não deforma nem sobra.
          const LARGURA = 1200;
          const ALTURA = 630;
          canvas.width = LARGURA;
          canvas.height = ALTURA;

          const escala = Math.max(LARGURA / img.width, ALTURA / img.height);
          const w = img.width * escala;
          const h = img.height * escala;

          // Fundo branco antes de desenhar: PNG com transparência vira preto
          // no JPEG, e logo transparente ficaria ilegível na prévia.
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, LARGURA, ALTURA);
          ctx.drawImage(img, (LARGURA - w) / 2, (ALTURA - h) / 2, w, h);

          // JPEG, não WebP: o WhatsApp não renderiza WebP em prévia de link.
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Falha ao exportar a imagem de compartilhamento."));
          }, 'image/jpeg', 0.88);
        } else if (type === 'favicon') {
          // Favicon: Enquadrar em quadrado (256x256), manter proporção
          const size = 256;
          canvas.width = size;
          canvas.height = size;
          
          const scale = Math.min(size / img.width, size / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          const x = (size - w) / 2;
          const y = (size - h) / 2;
          
          ctx.clearRect(0, 0, size, size);
          ctx.drawImage(img, x, y, w, h);
          
          // Exportar como PNG para suportar fundo transparente com qualidade nativa de favicon
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Falha ao exportar favicon."));
          }, 'image/png');
        } else {
          // Logo: Redimensionar para max-width 800px, conversão para webp
          const MAX_WIDTH = 800;
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;

          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          // Exportar como WebP otimizado, 90% qualidade
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Falha ao exportar logo."));
          }, 'image/webp', 0.90);
        }
      };
      // Usar resultado da leitura
      if (typeof e.target?.result === "string") {
        img.src = e.target.result;
      } else {
        reject(new Error("Falha ao ler o arquivo selecionado."));
      }
    };
    reader.readAsDataURL(file);
  });
};

// ---------------------------------------------------------------------------
// Fotos do anúncio — as duas versões que as colunas do site pedem
// ---------------------------------------------------------------------------

/**
 * Lado maior de cada versão, em pixels.
 *
 * Não são números redondos por acaso; cada um responde a uma superfície real:
 *
 * • **`web` 1280** — é o card do catálogo (`web_full_images[0]`). O card vive
 *   numa grade de 1 coluna no celular, 2 no tablet e 3 no desktop; a maior
 *   área que ele ocupa fica perto de 640 px CSS, e 1280 cobre isso com folga
 *   de tela retina. Subir para 1920 dobraria o byte de TODA visita à home e ao
 *   catálogo para ganhar nitidez que ninguém vê.
 *
 * • **`zap` 1600** — é a galeria da ficha, o lightbox, o `og:image` e o feed
 *   dos portais (`whatsapp_images`). Aqui a foto é ampliada até a tela cheia,
 *   e é a única superfície onde o pixel a mais aparece.
 *
 * Mexer nestes números não quebra nada retroativo: o que já subiu continua no
 * tamanho em que subiu. Só as fotos novas mudam.
 */
export const LADO_DA_VARIANTE: Record<VarianteDaFoto, number> = {
  web: 1280,
  zap: 1600,
};

/** Qualidade de compressão por versão. */
export const QUALIDADE_DA_VARIANTE: Record<VarianteDaFoto, number> = {
  // WebP aguenta 0,82 sem artefato visível em foto de carro (superfície lisa,
  // que é o pior caso do JPEG e o melhor do WebP).
  web: 0.82,
  // JPEG precisa de mais, porque quem recorta o card do WhatsApp recomprime
  // por cima do nosso arquivo.
  zap: 0.84,
};

export const MIME_DA_VARIANTE: Record<VarianteDaFoto, string> = {
  web: "image/webp",
  zap: "image/jpeg",
};

export interface VersoesDaFoto {
  web: File;
  zap: File;
}

/**
 * Carrega a imagem respeitando a orientação do EXIF.
 *
 * `createImageBitmap` com `imageOrientation: "from-image"` resolve o problema
 * clássico da foto de câmera e de celular: o EXIF diz "girada 90°", o canvas
 * ignora, e o carro chega deitado na vitrine. É o mesmo caminho de
 * `lib/ciclo/foto.ts`, já provado com foto de celular no pátio.
 *
 * O degrau de queda é o `<img>` + `FileReader` que `processImage` usa desde
 * sempre — navegador sem `createImageBitmap` continua conseguindo publicar.
 */
async function carregarParaDesenho(
  arquivo: File,
): Promise<{ fonte: CanvasImageSource; largura: number; altura: number; fechar: () => void }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    return {
      fonte: bitmap,
      largura: bitmap.width,
      altura: bitmap.height,
      fechar: () => bitmap.close?.(),
    };
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo selecionado."));
    reader.onload = (e) =>
      typeof e.target?.result === "string"
        ? resolve(e.target.result)
        : reject(new Error("Falha ao ler o arquivo selecionado."));
    reader.readAsDataURL(arquivo);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onerror = () => reject(new Error("Não foi possível decodificar esta imagem."));
    el.onload = () => resolve(el);
    el.src = dataUrl;
  });

  return {
    fonte: img,
    largura: img.naturalWidth,
    altura: img.naturalHeight,
    fechar: () => {},
  };
}

/**
 * Uma foto de entrada vira as DUAS versões que o anúncio precisa.
 *
 * ---------------------------------------------------------------------------
 * Por que aqui, e não na transformação do Supabase
 * ---------------------------------------------------------------------------
 * O Storage do Supabase sabe redimensionar por querystring, e seria menos
 * código. Ele cobra por "origin image", e o repositório já tinha este módulo:
 * tratar no navegador custa zero e guarda o resultado em vez de recalculá-lo a
 * cada visita. É a decisão escrita na migração F0-p, §"Por que Supabase
 * Storage".
 *
 * ---------------------------------------------------------------------------
 * Nunca amplia
 * ---------------------------------------------------------------------------
 * `Math.min(1, …)` na escala: foto que já chega menor que o alvo é
 * recomprimida, não esticada. Esticar inventaria pixel e engordaria o arquivo
 * ao mesmo tempo — o pior dos dois mundos.
 */
export async function processarFotoDeVeiculo(
  arquivo: File,
  lote: string,
): Promise<VersoesDaFoto> {
  if (typeof document === "undefined") {
    throw new Error("O tratamento de foto só roda no navegador.");
  }

  let carregada: Awaited<ReturnType<typeof carregarParaDesenho>>;
  try {
    carregada = await carregarParaDesenho(arquivo);
  } catch {
    // O canvas não decodificou (HEIC em navegador que não é o Safari é o caso
    // comum). Não dá para cair no original como a Garagem faz: o bucket só
    // aceita JPEG, PNG e WebP, e o Storage recusaria o envio com um erro que
    // não explica nada a quem está publicando.
    const aceito = (MIMES_DO_BUCKET as readonly string[]).includes(arquivo.type);
    throw new Error(
      aceito
        ? `Não foi possível abrir "${arquivo.name}". O arquivo pode estar corrompido.`
        : `"${arquivo.name}" está num formato que este navegador não abre (HEIC do iPhone é o caso comum). Exporte como JPG e envie de novo.`,
    );
  }

  try {
    const versoes = {} as Record<VarianteDaFoto, File>;

    for (const variante of ["web", "zap"] as const) {
      const maior = Math.max(carregada.largura, carregada.altura);
      const escala = Math.min(1, LADO_DA_VARIANTE[variante] / (maior || 1));
      const largura = Math.max(1, Math.round(carregada.largura * escala));
      const altura = Math.max(1, Math.round(carregada.altura * escala));

      const canvas = document.createElement("canvas");
      canvas.width = largura;
      canvas.height = altura;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Não foi possível iniciar o processador de imagem.");

      // Fundo branco antes de desenhar: PNG com transparência vira preto no
      // JPEG, e um carro recortado sairia sobre fundo preto no card do
      // WhatsApp. Mesma razão do card de compartilhamento acima.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, largura, altura);
      ctx.drawImage(carregada.fonte, 0, 0, largura, altura);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, MIME_DA_VARIANTE[variante], QUALIDADE_DA_VARIANTE[variante]),
      );
      if (!blob || blob.size === 0) {
        throw new Error(`Falha ao gerar a versão ${variante} de "${arquivo.name}".`);
      }

      // `toBlob` com um tipo que o navegador não codifica NÃO estoura: ele
      // devolve PNG em silêncio. Um PNG rotulado `image/webp` chegaria ao
      // Storage e o navegador do visitante não decodificaria — falha muda, no
      // anúncio, dias depois. Então o tipo real do blob é que vale; o nome do
      // arquivo é só nome, quem manda na entrega é o `contentType`.
      const tipoReal = blob.type || MIME_DA_VARIANTE[variante];
      if (!(MIMES_DO_BUCKET as readonly string[]).includes(tipoReal)) {
        throw new Error(
          `Este navegador gerou "${tipoReal}", que o armazenamento não aceita. Use outro navegador para publicar as fotos.`,
        );
      }

      versoes[variante] = new File(
        [blob],
        `${lote}-${variante}.${EXTENSAO_DA_VARIANTE[variante]}`,
        { type: tipoReal },
      );
    }

    return versoes;
  } finally {
    carregada.fechar();
  }
}
