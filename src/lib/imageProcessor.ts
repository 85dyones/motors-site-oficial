/**
 * Utilitários para processamento de imagem no lado do cliente (Client-Side).
 * Usamos a API HTML5 Canvas nativa para evitar dependências pesadas como sharp,
 * economizando banda e tempo de upload, e garantindo que o arquivo enviado 
 * esteja num tamanho otimizado para web.
 */

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
