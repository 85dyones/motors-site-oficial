import { supabase } from "../../../lib/supabase";
import { abrirLinkPublico } from "../../../lib/consultaDeDocumento-servidor";
import { tokenTemForma } from "../../../lib/linkDoRelatorio";
import { CABECALHOS_DO_LINK, relatorioEmHtml } from "../../../lib/relatorioDeDocumento";

export const dynamic = "force-dynamic";

const ESTILO = "font:16px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;color:#16161a";
const cabeca = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow, noarchive"><meta name="referrer" content="no-referrer"><title>Relatório confidencial — Motors Store</title>`;

const indisponivel = () =>
  new Response(
    `<!doctype html><html lang="pt-BR"><head>${cabeca}</head><body style="${ESTILO}"><h1 style="font-size:20px">Relatório indisponível</h1><p>Este link venceu, foi revogado ou não existe. Peça um novo link à Motors Store.</p></body></html>`,
    { status: 404, headers: CABECALHOS_DO_LINK },
  );

/**
 * A porta do link, sem nenhum dado: título genérico e um botão. Os robôs de
 * pré-visualização (WhatsApp, Telegram, Slack, Gmail, o antivírus de e-mail
 * do banco) fazem GET no servidor deles; se o GET entregasse o relatório,
 * eles o baixariam inteiro, o CPF iria para o cartão da conversa e cada
 * busca contaria um acesso que ninguém fez (revisão de 18/10/2026). Só o
 * POST do botão — uma pessoa — abre e conta.
 */
const porta = () =>
  new Response(
    `<!doctype html><html lang="pt-BR"><head>${cabeca}</head><body style="${ESTILO}"><div style="font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:12px">Motors Store</div><h1 style="font-size:20px;margin:6px 0 8px">Relatório confidencial</h1><p>A Motors Store enviou um relatório de consulta cadastral. Ele contém dados pessoais protegidos pela LGPD: abra só se ele foi enviado a você.</p><form method="post"><button type="submit" style="margin-top:8px;padding:12px 20px;font:700 13px/1 inherit;letter-spacing:.06em;text-transform:uppercase;background:#16161a;color:#fff;border:0;cursor:pointer">Abrir relatório</button></form></body></html>`,
    { status: 200, headers: CABECALHOS_DO_LINK },
  );

/**
 * `/relatorio/[token]` — o relatório que o consultor enviou. Uma resposta de
 * rota, e não uma página do site, de propósito: o layout do site carrega GTM,
 * Pixel e o aviso de cookies, e nada disso pode ver um relatório de CPF.
 *
 * GET: a porta, sem dados e sem tocar o banco. POST: quem decide se abre é a
 * função `abrir_relatorio_compartilhado`, que recebe o token (o hash é
 * calculado lá dentro), confere validade e revogação e conta o acesso.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return tokenTemForma(token) ? porta() : indisponivel();
}

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!tokenTemForma(token) || !supabase) return indisponivel();
  const aberto = await abrirLinkPublico(supabase, token);
  if (!aberto) return indisponivel();
  const vence = new Date(aberto.expiraEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const rodape = `Documento confidencial enviado pela Motors Store. Dados pessoais protegidos pela LGPD: use só para a finalidade com que foi enviado e não repasse. Este link vale até ${vence}.`;
  return new Response(relatorioEmHtml(aberto.relatorio, { rodape, imprimir: true }), { status: 200, headers: CABECALHOS_DO_LINK });
}
