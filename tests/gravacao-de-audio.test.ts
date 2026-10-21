import { describe, expect, it } from "vitest";
import { TETO_DA_GRAVACAO_S, arquivoDaGravacao, duracaoDaGravacao, erroDoMicrofone, formatoDaGravacao } from "../src/lib/gravacaoDeAudio";

/**
 * O áudio gravado no painel (2026-10-21): o formato de cada navegador, o
 * arquivo que entra na caixa e o que dizer quando o microfone não abre.
 */

describe("o formato da gravação", () => {
  it("prefere Ogg/Opus, a nota de voz do WhatsApp; senão WebM (Chrome) ou MP4 (Safari)", () => {
    expect(formatoDaGravacao(() => true)).toBe("audio/ogg;codecs=opus");
    expect(formatoDaGravacao((t) => t.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(formatoDaGravacao((t) => t === "audio/mp4")).toBe("audio/mp4");
  });

  it("navegador que não grava nada que o painel aceita (ou que lança): nenhum formato", () => {
    expect(formatoDaGravacao(() => false)).toBeNull();
    expect(
      formatoDaGravacao(() => {
        throw new Error("não sei");
      }),
    ).toBeNull();
  });
});

describe("o arquivo gravado", () => {
  const AGORA = new Date(2026, 9, 21, 9, 5);

  it("tipo sem o codec, nome com a hora, e a extensão do formato", () => {
    const r = arquivoDaGravacao([new Blob(["abc"], { type: "audio/webm;codecs=opus" }), new Blob(["de"])], "audio/webm;codecs=opus", AGORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.arquivo.type).toBe("audio/webm");
    expect(r.arquivo.name).toBe("audio-2026-10-21-0905.webm");
    expect(r.arquivo.size).toBe(5);
    // Pedaço sem tipo: vale o formato pedido ao gravador. O Safari grava em MP4.
    const safari = arquivoDaGravacao([new Blob(["x"])], "audio/mp4", AGORA);
    expect(safari.ok && safari.arquivo.name).toBe("audio-2026-10-21-0905.m4a");
  });

  it("gravação vazia ou grande demais para o WhatsApp não entra na caixa", () => {
    expect(arquivoDaGravacao([], "audio/ogg;codecs=opus", AGORA)).toEqual({ ok: false, erro: "A gravação ficou vazia. Confira o microfone e grave de novo." });
    const grande = arquivoDaGravacao([new Blob([new Uint8Array(17 * 1024 * 1024)], { type: "audio/ogg" })], "audio/ogg", AGORA);
    expect(grande.ok).toBe(false);
    expect(!grande.ok && grande.erro).toContain("O áudio passa de 16 MB");
  });

  it("o cronômetro, e o teto de cinco minutos", () => {
    expect(duracaoDaGravacao(0)).toBe("0:00");
    expect(duracaoDaGravacao(65.9)).toBe("1:05");
    expect(duracaoDaGravacao(Number.NaN)).toBe("0:00");
    expect(duracaoDaGravacao(TETO_DA_GRAVACAO_S)).toBe("5:00");
  });
});

describe("o microfone que não abre", () => {
  it("cada motivo do navegador vira uma frase que diz o que fazer", () => {
    expect(erroDoMicrofone({ name: "NotAllowedError" })).toContain("Libere o microfone para este site");
    expect(erroDoMicrofone({ name: "NotFoundError" })).toBe("Nenhum microfone encontrado neste computador.");
    expect(erroDoMicrofone({ name: "NotReadableError" })).toContain("em uso por outro programa");
    expect(erroDoMicrofone(new Error("?"))).toBe("Não deu para gravar o áudio neste navegador.");
  });
});
