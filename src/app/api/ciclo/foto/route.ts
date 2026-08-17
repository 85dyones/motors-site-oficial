import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { BUCKET_DO_DIARIO } from "../../../../lib/ciclo/foto";

export const dynamic = "force-dynamic";

/**
 * A porta de leitura da foto da etiqueta — para o cliente e para a equipe.
 *
 * O bucket é privado, então não existe URL direta: o acesso é por URL
 * assinada, de vida curta. Esta rota assina **com o cliente da sessão**, o que
 * faz da RLS de `storage.objects` a autoridade — e não de um `if` daqui:
 *
 *   • cliente  → policy `diario_cliente_le`, que compara a pasta com os
 *     veículos dele;
 *   • equipe   → policy `diario_staff_le`, com `is_staff`.
 *
 * Quem não tem direito recebe erro do próprio Storage e leva 404 daqui — a
 * mesma resposta de arquivo inexistente, de propósito: distinguir "não é seu"
 * de "não existe" contaria a um estranho que aquele veículo tem foto.
 *
 * Sem chave de serviço, pelo mesmo motivo do resto da Garagem: se a policy não
 * deixa, a rota não mostra.
 */
export async function GET(request: NextRequest) {
  const caminho = request.nextUrl.searchParams.get("caminho");

  if (!caminho) {
    return NextResponse.json({ error: "Caminho não informado." }, { status: 400 });
  }
  // O caminho vem de dado nosso, mas chega pela URL: nada de subir de pasta,
  // nada de barra inicial, nada de URL absoluta disfarçada.
  if (caminho.includes("..") || caminho.startsWith("/") || /^https?:/i.test(caminho)) {
    return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { data, error } = await supabase.storage
    .from(BUCKET_DO_DIARIO)
    .createSignedUrl(caminho, 300); // 5 minutos: tempo de olhar, não de guardar

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });
  }

  // 307 para a URL assinada: o navegador carrega a imagem direto do Storage,
  // sem o arquivo passar por aqui. `no-store` para o link curto não ficar em
  // cache de proxy depois de expirar.
  return NextResponse.redirect(data.signedUrl, {
    status: 307,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
