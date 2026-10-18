import { abrirConsultaDeDocumento, autorizarConsultaDeDocumento } from "../../../../../lib/consultaDeDocumento-servidor";
import { CABECALHOS_DO_RELATORIO, escapar, relatorioEmHtml } from "../../../../../lib/relatorioDeDocumento";

export const dynamic = "force-dynamic";

const pagina = (status: number, texto: string) =>
  new Response(`<!doctype html><meta charset="utf-8"><title>Relatório</title><p style="font:16px sans-serif;padding:24px">${escapar(texto)}</p>`, { status, headers: CABECALHOS_DO_RELATORIO });

/**
 * `GET /api/consulta-documento/[id]/relatorio` — o relatório como página
 * inteira, para a tela (iframe) e para imprimir em PDF. Só para quem consulta.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const porta = await autorizarConsultaDeDocumento();
  if (!porta.ok) return pagina(porta.status, porta.motivo);
  const { id } = await params;
  const aberta = await abrirConsultaDeDocumento(porta.supabase, id);
  if (!aberta) return pagina(404, "Consulta não encontrada.");
  const rodape = `Documento confidencial da Motors Store, consultado por ${aberta.item.quem ?? "—"} para ${aberta.item.finalidade.toLowerCase()}. Dados pessoais protegidos pela LGPD: use só para esta finalidade e não compartilhe além do necessário.`;
  return new Response(relatorioEmHtml(aberta.relatorio, { rodape, imprimir: true }), { status: 200, headers: CABECALHOS_DO_RELATORIO });
}
