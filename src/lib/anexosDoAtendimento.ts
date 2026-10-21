import type { ConteudoDaMensagem } from "./evolutionEventos";

/**
 * Os anexos da conversa (2026-10-20) — regras puras, sem rede nem segredo:
 * o servidor e a tela importam daqui.
 *
 * Pedido do dono: *"uma funcionalidade que precisamos no chat e não foi
 * testada, envio de anexos, fotos, vídeos e documentos"*. Nos dois sentidos:
 *   - o que o CLIENTE manda (foto, vídeo, áudio, documento) é baixado da
 *     Evolution e guardado no bucket privado `atendimento-midia`, e o painel
 *     mostra o arquivo em vez do rótulo "[Foto]";
 *   - o VENDEDOR anexa pelo painel: o navegador sobe o arquivo direto para o
 *     bucket (URL assinada de upload — a função da Vercel recusa corpo acima
 *     de ~4,5 MB) e o servidor manda a Evolution buscá-lo por uma URL assinada
 *     de vida curta.
 *
 * Caminho no bucket: `{lead}/{arquivo}`. A pasta é o lead: a eliminação do
 * titular (LGPD) apaga a pasta, e a regra do banco
 * (`atendimento_mensagens_midia_caminho_valido`) recusa caminho que sobe de
 * pasta ou que não é do lead.
 */

export const BUCKET_DOS_ANEXOS = "atendimento-midia";

/** O teto do bucket (50 MB): o arquivo maior fica no celular da loja. */
export const TETO_DO_BUCKET = 50 * 1024 * 1024;

const MB = 1024 * 1024;

export type ConteudoDoAnexo = Extract<ConteudoDaMensagem, "imagem" | "video" | "audio" | "documento">;

/** Os conteúdos cujo arquivo a conversa guarda. Figurinha, localização e contato ficam só no rótulo. */
export const CONTEUDOS_COM_ARQUIVO: readonly ConteudoDoAnexo[] = ["imagem", "video", "audio", "documento"];

export function temArquivo(conteudo: string | null | undefined): conteudo is ConteudoDoAnexo {
  return (CONTEUDOS_COM_ARQUIVO as readonly string[]).includes(conteudo ?? "");
}

/**
 * O que o PAINEL aceita enviar, por mimetype, e como cada um sai.
 *
 * O WhatsApp mostra como foto só JPEG e PNG; como vídeo, só MP4 (o .mov do
 * iPhone e o WebP saem como documento, que o cliente abre igual). O teto de
 * cada um é o do WhatsApp — passar dele é a Evolution recusar depois de o
 * arquivo já ter subido.
 */
const DO_PAINEL: ReadonlyArray<{ tipos: readonly string[]; conteudo: ConteudoDoAnexo; teto: number }> = [
  { tipos: ["image/jpeg", "image/png"], conteudo: "imagem", teto: 10 * MB },
  { tipos: ["video/mp4", "video/3gpp"], conteudo: "video", teto: 16 * MB },
  { tipos: ["audio/mpeg", "audio/mp4", "audio/ogg", "audio/aac", "audio/x-m4a", "audio/wav", "audio/webm"], conteudo: "audio", teto: 16 * MB },
  {
    tipos: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.oasis.opendocument.text",
      "application/vnd.oasis.opendocument.spreadsheet",
      "text/plain",
      "text/csv",
      "image/webp",
      "image/heic",
      "image/gif",
      "video/quicktime",
    ],
    conteudo: "documento",
    teto: TETO_DO_BUCKET,
  },
];

/** O `accept` do campo de arquivo: o mesmo que o servidor aceita. */
export const ACEITOS_NO_PAINEL = DO_PAINEL.flatMap((g) => g.tipos).join(",");

/** O mimetype sem parâmetros e em minúsculas: "audio/ogg; codecs=opus" → "audio/ogg". */
export function tipoBase(mimetype: string | null | undefined): string {
  return (mimetype ?? "").split(";")[0].trim().toLowerCase();
}

export type AnexoRecusado = { ok: false; erro: string };
export type AnexoAceito = { ok: true; conteudo: ConteudoDoAnexo; tipo: string; teto: number };

/** Se o painel pode mandar este arquivo, e como ele sai. */
export function anexoDoPainel(arquivo: { tipo: string | null | undefined; bytes: number | null | undefined }): AnexoAceito | AnexoRecusado {
  const tipo = tipoBase(arquivo.tipo);
  const grupo = DO_PAINEL.find((g) => g.tipos.includes(tipo));
  if (!grupo) {
    return { ok: false, erro: "Esse tipo de arquivo não vai pelo WhatsApp do painel. Mande foto (JPG/PNG), vídeo MP4, áudio ou documento (PDF, Word, Excel)." };
  }
  const bytes = Number(arquivo.bytes);
  if (!Number.isFinite(bytes) || bytes <= 0) return { ok: false, erro: "O arquivo está vazio." };
  if (bytes > grupo.teto) {
    const rotulo = { imagem: "A foto", video: "O vídeo", audio: "O áudio", documento: "O documento" }[grupo.conteudo];
    return { ok: false, erro: `${rotulo} passa de ${tamanhoLegivel(grupo.teto)} (${tamanhoLegivel(bytes)}): o WhatsApp não aceita. Mande um menor.` };
  }
  return { ok: true, conteudo: grupo.conteudo, tipo, teto: grupo.teto };
}

const EXTENSAO_DO_TIPO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "video/quicktime": "mov",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "text/plain": "txt",
  "text/csv": "csv",
};

/** A extensão do arquivo: pelo tipo, senão pelo nome, senão "bin". Só letras e números. */
export function extensaoDoArquivo(tipo: string | null | undefined, nome?: string | null): string {
  const doTipo = EXTENSAO_DO_TIPO[tipoBase(tipo)];
  if (doTipo) return doTipo;
  const doNome = /\.([A-Za-z0-9]{1,8})$/.exec((nome ?? "").trim())?.[1]?.toLowerCase();
  return doNome ?? "bin";
}

/** O nome que o cliente vê no documento: sem pasta, sem controle, até 120 caracteres. */
export function nomeDoArquivo(nome: string | null | undefined): string | null {
  const limpo = (nome ?? "")
    .split(/[\\/]/)
    .pop()!
    // Tira caractere de controle do nome que veio do aparelho.
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  if (!limpo) return null;
  return limpo.length > 120 ? `${limpo.slice(0, 110)}…${limpo.slice(-9)}` : limpo;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** `{lead}/{prefixo}{id}.{ext}` — o formato que a regra do banco aceita. */
export function caminhoDoAnexo(leadId: string, id: string, extensao: string, prefixo: "" | "painel-" = ""): string {
  const ext = /^[a-z0-9]{1,8}$/.test(extensao) ? extensao : "bin";
  const arquivo = `${prefixo}${id}`.replace(/[^A-Za-z0-9_-]/g, "");
  return `${leadId}/${arquivo}.${ext}`;
}

/**
 * O caminho é um anexo que o PAINEL subiu para este lead? É o que o servidor
 * confere antes de mandar a Evolution buscar o arquivo: o navegador diz o
 * caminho, e um caminho de outro lead mandaria o documento de um cliente para
 * outro.
 */
export function caminhoDoPainelNoLead(caminho: unknown, leadId: string): caminho is string {
  if (typeof caminho !== "string" || !UUID.test(leadId)) return false;
  const [pasta, arquivo, ...resto] = caminho.split("/");
  return resto.length === 0 && pasta === leadId && /^painel-[A-Za-z0-9_-]{8,80}\.[a-z0-9]{1,8}$/.test(arquivo ?? "");
}

/** "830 KB", "1,2 MB". */
export function tamanhoLegivel(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "";
  const b = Number(bytes);
  if (!Number.isFinite(b) || b < 0) return "";
  if (b < 1024) return `${b} B`;
  if (b < MB) return `${Math.round(b / 1024)} KB`;
  const mb = b / MB;
  return `${mb < 10 ? mb.toFixed(1).replace(".", ",") : Math.round(mb)} MB`;
}
