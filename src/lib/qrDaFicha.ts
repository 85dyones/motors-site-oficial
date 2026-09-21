/**
 * O QR da ficha impressa.
 *
 * A ficha sai do balcão em papel e precisa de um caminho de volta para o
 * anúncio — preço que mudou, fotos que o papel não cabe, o botão de WhatsApp.
 * O QR é esse caminho.
 *
 * Duas decisões que valem registro:
 *
 * 1. **Gerado no servidor, entregue como traçado.** A página da ficha é
 *    componente de servidor; ela chama `qrDaFicha` e manda para o
 *    `PDPClientWrapper` só `{ d, lado }`. A biblioteca nunca entra no pacote
 *    do navegador, e o componente desenha um `<svg>` de verdade em vez de
 *    `dangerouslySetInnerHTML`.
 *
 * 2. **Vetor, não imagem.** Um `<img>` apontando para um gerador externo
 *    depende de rede na hora de imprimir — e diálogo de impressão costuma
 *    sair sem as imagens remotas, o que daria uma folha com um buraco branco
 *    no lugar do QR. Vetor inline imprime na resolução da impressora.
 *
 * A `qrcode-generator` entrou por ser o encoder de referência em JS (Kazuhiko
 * Arase), com zero dependências e tipos próprios. A alternativa óbvia,
 * `qrcode`, arrasta `pngjs`, `yargs` e `dijkstrajs` para entregar uma CLI e um
 * PNG que esta folha não usa.
 */
import qrcode from "qrcode-generator";

/**
 * Nível de correção de erro.
 *
 * `M` recupera ~15% do código. A folha é manuseada no balcão, dobra e suja;
 * `L` (~7%) é magro demais para papel e `Q`/`H` engordam a matriz sem
 * necessidade para uma URL deste tamanho.
 */
const NIVEL_DE_CORRECAO = "M" as const;

/**
 * Zona de silêncio, em módulos. São 4 por especificação do QR — sem ela o
 * leitor não acha a borda do código. Entra no `viewBox` para que a margem
 * viaje junto com o desenho, e não dependa de CSS.
 */
const ZONA_DE_SILENCIO = 4;

export interface QrDaFicha {
  /** O traçado do `<path>`, em unidades de módulo. */
  d: string;
  /** Lado do `viewBox` — a matriz mais as duas zonas de silêncio. */
  lado: number;
}

/**
 * Converte uma URL absoluta no traçado do QR.
 *
 * Devolve `null` quando não há o que codificar, para a ficha simplesmente não
 * desenhar o bloco em vez de imprimir um quadrado quebrado.
 */
export function qrDaFicha(url: string): QrDaFicha | null {
  const texto = url.trim();
  if (!texto) return null;

  // `0` deixa a biblioteca escolher a menor versão que comporta o texto.
  const codigo = qrcode(0, NIVEL_DE_CORRECAO);
  codigo.addData(texto);
  codigo.make();

  const modulos = codigo.getModuleCount();
  const trechos: string[] = [];

  /**
   * Um comando por sequência horizontal de módulos escuros, não um por
   * módulo: a matriz de uma URL da ficha tem centenas de módulos acesos e a
   * fusão corta o traçado por volta de 60%, sem mudar um pixel do desenho.
   */
  for (let linha = 0; linha < modulos; linha++) {
    let coluna = 0;
    while (coluna < modulos) {
      if (!codigo.isDark(linha, coluna)) {
        coluna++;
        continue;
      }
      let fim = coluna;
      while (fim < modulos && codigo.isDark(linha, fim)) fim++;

      const largura = fim - coluna;
      const x = coluna + ZONA_DE_SILENCIO;
      const y = linha + ZONA_DE_SILENCIO;
      trechos.push(`M${x} ${y}h${largura}v1h-${largura}z`);

      coluna = fim;
    }
  }

  return {
    d: trechos.join(""),
    lado: modulos + ZONA_DE_SILENCIO * 2,
  };
}
