import { anexoDoPainel, extensaoDoArquivo, tipoBase } from "./anexosDoAtendimento";

/**
 * O áudio gravado no painel (2026-10-21). Pedido do dono: *"é possível
 * inserir a funcionalidade de gravar áudio no painel?"*.
 *
 * A gravação é do navegador (`MediaRecorder`); o resto já existia: o arquivo
 * gravado entra na caixa como um anexo de áudio, sobe direto para o bucket e
 * sai pelo `sendWhatsAppAudio`, que a Evolution converte e entrega como nota
 * de voz (`enviarAnexo` em `lib/evolution.ts`).
 *
 * Cada navegador grava num formato: Chrome e Edge em WebM, o Firefox em Ogg,
 * o Safari em MP4. Os três estão entre os áudios que o painel aceita
 * (`anexoDoPainel`). Puro: quem fala com o microfone é `GravadorDeAudio`.
 */

/** Cinco minutos: nota de voz mais longa que isso vira ligação. Em Opus, bem abaixo dos 16 MB do WhatsApp. */
export const TETO_DA_GRAVACAO_S = 5 * 60;

/** Na ordem de preferência: Ogg/Opus é o formato da nota de voz do próprio WhatsApp. */
const FORMATOS_DA_GRAVACAO = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"] as const;

/**
 * O formato em que este navegador grava, dos que o painel aceita enviar.
 * `null` quando nenhum serve — e aí o botão de gravar nem aparece.
 */
export function formatoDaGravacao(suporta: (tipo: string) => boolean): string | null {
  for (const formato of FORMATOS_DA_GRAVACAO) {
    try {
      if (suporta(formato)) return formato;
    } catch {
      // Navegador que lança em vez de responder não grava neste formato.
    }
  }
  return null;
}

/** "1:05" — o cronômetro da gravação. */
export function duracaoDaGravacao(segundos: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(segundos) ? segundos : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * O que foi gravado, como arquivo pronto para a caixa de resposta: o tipo
 * sem os parâmetros do codec ("audio/webm;codecs=opus" → "audio/webm", o que
 * o painel confere) e o nome com a hora ("audio-2026-10-21-0935.webm").
 */
export function arquivoDaGravacao(
  pedacos: readonly Blob[],
  formato: string,
  agora: Date,
): { ok: true; arquivo: File } | { ok: false; erro: string } {
  const tipo = tipoBase(pedacos.find((p) => p.type)?.type || formato);
  const bytes = pedacos.reduce((soma, p) => soma + p.size, 0);
  if (bytes === 0) return { ok: false, erro: "A gravação ficou vazia. Confira o microfone e grave de novo." };
  const aceito = anexoDoPainel({ tipo, bytes });
  if (!aceito.ok) return aceito;
  const dois = (n: number) => String(n).padStart(2, "0");
  const carimbo = `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}-${dois(agora.getHours())}${dois(agora.getMinutes())}`;
  return { ok: true, arquivo: new File([...pedacos], `audio-${carimbo}.${extensaoDoArquivo(tipo)}`, { type: tipo }) };
}

/** O que dizer quando o microfone não abre — pelo nome do erro do navegador. */
export function erroDoMicrofone(erro: unknown): string {
  const nome = erro && typeof erro === "object" && "name" in erro ? String((erro as { name: unknown }).name) : "";
  if (nome === "NotAllowedError" || nome === "SecurityError") {
    return "O navegador não liberou o microfone. Libere o microfone para este site (no cadeado da barra de endereço) e grave de novo.";
  }
  if (nome === "NotFoundError" || nome === "OverconstrainedError") return "Nenhum microfone encontrado neste computador.";
  if (nome === "NotReadableError") return "O microfone está em uso por outro programa. Feche-o e grave de novo.";
  return "Não deu para gravar o áudio neste navegador.";
}
