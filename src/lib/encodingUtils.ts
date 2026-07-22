/**
 * Reads a File or Blob with automatic encoding detection (UTF-8 vs ISO-8859-1/Windows-1252)
 * Ensures perfect reading of accents (Í, Ç, Ê, Ã, É, Ó) from RevendaMais / Excel CSVs.
 */
export function readFileWithEncodingAutoDetect(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (!buffer) {
        resolve("");
        return;
      }

      try {
        // Attempt strict UTF-8 decoding
        const decoderUtf8 = new TextDecoder("utf-8", { fatal: true });
        const textUtf8 = decoderUtf8.decode(buffer);

        // If UTF-8 succeeded and contains no replacement characters, return it
        if (!textUtf8.includes("\uFFFD")) {
          resolve(textUtf8);
          return;
        }
      } catch (err) {
        // UTF-8 decoding failed due to invalid byte sequences (ANSI/ISO-8859-1)
      }

      // Fallback to ISO-8859-1 (Latin-1 / Windows-1252)
      try {
        const decoderIso = new TextDecoder("iso-8859-1");
        const textIso = decoderIso.decode(buffer);
        resolve(textIso);
      } catch (errIso) {
        // Final fallback to default readAsText
        const fallbackReader = new FileReader();
        fallbackReader.onload = (ev) => resolve((ev.target?.result as string) || "");
        fallbackReader.readAsText(file);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Sanitizes and repairs common character corruptions caused by mis-encoded imports
 */
export function sanitizeTextEncoding(str: string | null | undefined): string {
  if (!str) return "";

  return str
    .replace(/VE[\uFFFD\?]+CULOS/gi, "VEÍCULOS")
    .replace(/PE[\uFFFD\?]+AS/gi, "PEÇAS")
    .replace(/TRANSFER[\uFFFD\?]+NCIA/gi, "TRANSFERÊNCIA")
    .replace(/MOVIMENTA[\uFFFD\?]+O/gi, "MOVIMENTAÇÃO")
    .replace(/PREPARA[\uFFFD\?]+O/gi, "PREPARAÇÃO")
    .replace(/MANUTE[\uFFFD\?]+O/gi, "MANUTENÇÃO")
    .replace(/COMISS[\uFFFD\?]+ES/gi, "COMISSÕES")
    .replace(/PRODUTO[\uFFFD\?]+/gi, "PRODUTOS")
    .replace(/D[\uFFFD\?]+BITOS/gi, "DÉBITOS")
    .replace(/CR[\uFFFD\?]+DITO/gi, "CRÉDITO")
    .replace(/SA[\uFFFD\?]+DAS/gi, "SAÍDAS")
    .replace(/ILUMINA[\uFFFD\?]+O/gi, "ILUMINAÇÃO")
    .replace(/INSTALA[\uFFFD\?]+O/gi, "INSTALAÇÃO")
    .replace(/PROJE[\uFFFD\?]+O/gi, "PROJEÇÃO")
    .replace(/OBRIG[\uFFFD\?]+/gi, "OBRIGAÇÕES")
    .replace(/REFEI[\uFFFD\?]+O/gi, "REFEIÇÃO")
    .replace(/ALIMENTA[\uFFFD\?]+O/gi, "ALIMENTAÇÃO")
    .replace(/[\uFFFD]/g, "") // remove orphan replacement character
    .trim();
}
