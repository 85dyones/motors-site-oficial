/**
 * Baixa uma foto do carro57 da LOJA para o servidor — o passo que faltava para
 * o repasse a partir do estoque servir aos carros que moram 100% no CDN do
 * RevendaMais (dono, 01/10). Quem chama é `POST /api/repasses/[id]/fotos-do-estoque`,
 * que sobe os bytes na pasta do repasse.
 *
 * O pedido sai do NOSSO servidor para uma URL que veio do banco, então tudo
 * aqui é trava:
 *   • só a pasta da loja no carro57 (`urlDaLojaNoCarro57`), conferida de novo
 *     aqui, para valer também para quem chamar direto — e o que se pede é a
 *     URL normalizada que foi conferida;
 *   • sem seguir redirecionamento (`redirect: "manual"`): um 3xx é falha, e o
 *     destino dele nunca é pedido;
 *   • 15 s por foto, e o prazo total de quem chama (`prazo`), que corta o
 *     pedido em voo;
 *   • até 15 MB, o teto do bucket: pelo `content-length` antes de ler e pela
 *     contagem durante a leitura, quando o tamanho não vem ou mente;
 *   • só o que o bucket aceita gravar (`MIMES_DO_BUCKET`, todos `image/*`):
 *     página de erro servida com 200, SVG e resposta sem tipo ficam de fora.
 *
 * Nunca lança: a falha volta como resultado, com o motivo.
 */
import { urlDaLojaNoCarro57 } from "./estoqueParaORepasse";
import { MIMES_DO_BUCKET, TAMANHO_MAXIMO_BYTES } from "./fotosDoVeiculo";

/** Quanto uma foto pode demorar, do pedido ao último byte. */
export const TEMPO_POR_FOTO_MS = 15_000;

export type FotoBaixada = { ok: true; bytes: Uint8Array; tipo: string } | { ok: false; erro: string };

const MB = 1024 * 1024;

/** "image/jpeg; charset=binary" → "image/jpeg"; fora da lista do bucket, `null`. */
function tipoAceito(bruto: string | null): string | null {
  const tipo = (bruto ?? "").split(";")[0].trim().toLowerCase();
  return (MIMES_DO_BUCKET as readonly string[]).includes(tipo) ? tipo : null;
}

/** Lê o corpo contando os bytes; passou do teto, cancela a leitura e devolve `null`. */
async function lerAteOTeto(corpo: ReadableStream<Uint8Array> | null, teto: number): Promise<Uint8Array | null> {
  if (!corpo) return new Uint8Array(0);
  const leitor = corpo.getReader();
  const pedacos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > teto) {
      await leitor.cancel().catch(() => undefined);
      return null;
    }
    pedacos.push(value);
  }
  const bytes = new Uint8Array(total);
  let posicao = 0;
  for (const pedaco of pedacos) {
    bytes.set(pedaco, posicao);
    posicao += pedaco.byteLength;
  }
  return bytes;
}

export async function baixarDoCarro57(
  url: string,
  opcoes: { tempoMs?: number; prazo?: AbortSignal } = {},
): Promise<FotoBaixada> {
  const alvo = urlDaLojaNoCarro57(url);
  if (alvo === null) return { ok: false, erro: "endereço fora da pasta da loja no carro57" };
  const { prazo } = opcoes;
  if (prazo?.aborted) return { ok: false, erro: "prazo da cópia esgotado" };

  const tempoMs = opcoes.tempoMs ?? TEMPO_POR_FOTO_MS;
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), tempoMs);
  const aoEsgotarOPrazo = () => controle.abort();
  prazo?.addEventListener("abort", aoEsgotarOPrazo, { once: true });
  // Corpo de resposta recusada: descartado, para não segurar a conexão.
  const descartar = (res: Response) => res.body?.cancel().catch(() => undefined);
  try {
    const res = await fetch(alvo, { redirect: "manual", signal: controle.signal, cache: "no-store" });
    if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
      await descartar(res);
      return { ok: false, erro: `redirecionamento recusado (HTTP ${res.status})` };
    }
    if (!res.ok) {
      await descartar(res);
      return { ok: false, erro: `HTTP ${res.status}` };
    }
    const tipo = tipoAceito(res.headers.get("content-type"));
    if (tipo === null) {
      await descartar(res);
      return { ok: false, erro: `não é foto que o bucket aceite (${res.headers.get("content-type") ?? "sem tipo"})` };
    }
    const declarado = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declarado) && declarado > TAMANHO_MAXIMO_BYTES) {
      await descartar(res);
      return { ok: false, erro: `passa de ${TAMANHO_MAXIMO_BYTES / MB} MB (${declarado} bytes declarados)` };
    }
    const bytes = await lerAteOTeto(res.body, TAMANHO_MAXIMO_BYTES);
    if (bytes === null) return { ok: false, erro: `passa de ${TAMANHO_MAXIMO_BYTES / MB} MB` };
    if (bytes.byteLength === 0) return { ok: false, erro: "corpo vazio" };
    return { ok: true, bytes, tipo };
  } catch (e: unknown) {
    if (prazo?.aborted) return { ok: false, erro: "prazo da cópia esgotado" };
    if (controle.signal.aborted) return { ok: false, erro: `tempo esgotado (${tempoMs / 1000} s)` };
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(relogio);
    prazo?.removeEventListener("abort", aoEsgotarOPrazo);
  }
}
