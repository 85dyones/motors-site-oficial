import { supabase } from "../../../lib/supabase";
import { abrirLinkPublico } from "../../../lib/consultaDeDocumento-servidor";
import { tokenTemForma } from "../../../lib/linkDoRelatorio";
import { CABECALHOS_DO_RELATORIO, relatorioEmHtml } from "../../../lib/relatorioDeDocumento";

export const dynamic = "force-dynamic";

const indisponivel = () =>
  new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Relatório indisponível — Motors Store</title></head><body style="font:16px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;color:#16161a"><h1 style="font-size:20px">Relatório indisponível</h1><p>Este link venceu, foi revogado ou não existe. Peça um novo link à Motors Store.</p></body></html>`,
    { status: 404, headers: CABECALHOS_DO_RELATORIO },
  );

/**
 * `GET /relatorio/[token]` — o relatório que o consultor enviou. Uma resposta
 * de rota, e não uma página do site, de propósito: o layout do site carrega
 * GTM, Pixel e o aviso de cookies, e nada disso pode ver um relatório de CPF.
 * Quem decide se abre é a função `abrir_relatorio_compartilhado` (validade,
 * revogação, contagem de acessos).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!tokenTemForma(token) || !supabase) return indisponivel();
  const aberto = await abrirLinkPublico(supabase, token);
  if (!aberto) return indisponivel();
  const vence = new Date(aberto.expiraEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const rodape = `Documento confidencial enviado pela Motors Store. Dados pessoais protegidos pela LGPD: use só para a finalidade com que foi enviado e não repasse. Este link vale até ${vence}.`;
  return new Response(relatorioEmHtml(aberto.relatorio, { rodape, imprimir: true }), { status: 200, headers: CABECALHOS_DO_RELATORIO });
}
