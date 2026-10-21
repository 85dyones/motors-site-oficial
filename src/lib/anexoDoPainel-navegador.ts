import { BUCKET_DOS_ANEXOS } from "./anexosDoAtendimento";
import { createBrowserSupabaseClient } from "./supabase-browser";

/**
 * Sobe o anexo do painel direto para o bucket, pela URL assinada de upload
 * que `/api/leads/[id]/conversa/anexo` devolveu (2026-10-20). Direto, e não
 * pela rota: a função da Vercel recusa corpo acima de ~4,5 MB, e vídeo de
 * celular passa disso. Módulo à parte para a tela ser testada sem o Storage.
 */
export async function subirAnexo(caminho: string, token: string, arquivo: File): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { error } = await createBrowserSupabaseClient()
    .storage.from(BUCKET_DOS_ANEXOS)
    .uploadToSignedUrl(caminho, token, arquivo, { contentType: arquivo.type });
  return error ? { ok: false, erro: error.message } : { ok: true };
}
