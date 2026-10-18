/**
 * O relatório de uma consulta de CPF ou CNPJ — o modelo e o HTML (dono,
 * 18/10/2026: "gere exportação em pdf dos dados ou via link html para o
 * consultor poder enviar").
 *
 * Um formato só para os três lugares: a tela do painel (dentro de um iframe),
 * a página que o consultor abre para imprimir em PDF e o link que ele manda.
 * O HTML é uma página inteira e fechada: sem script de terceiros, sem fonte
 * de fora, sem imagem remota. Assim o link não leva rastreador nenhum (o
 * layout do site, com GTM e Pixel, não envolve uma resposta de rota) e o PDF
 * sai igual em qualquer navegador.
 *
 * Tudo o que vem do fornecedor passa por `escapar`: o relatório é texto de
 * terceiros, e texto de terceiros em HTML é injeção se não for escapado.
 */

export type TipoDeDocumento = "cpf" | "cnpj";
export type EstadoDoItem = "ok" | "atencao" | "impeditivo" | "neutro";

export interface LinhaDoRelatorio {
  rotulo: string;
  valor: string | null;
  estado?: EstadoDoItem;
}

export interface TabelaDoRelatorio {
  titulo: string;
  colunas: string[];
  linhas: Array<Array<string | null>>;
}

export interface SecaoDoRelatorio {
  titulo: string;
  /** O produto da APIBrasil de onde veio (para quem quiser conferir). */
  origem: string;
  linhas: LinhaDoRelatorio[];
  tabelas: TabelaDoRelatorio[];
}

export interface RelatorioDeDocumento {
  tipo: TipoDeDocumento;
  /** Formatado: "000.000.000-00" ou "00.000.000/0000-00". */
  documento: string;
  /** Nome ou razão social, se veio. */
  titular: string | null;
  nivel: string;
  /** ISO. */
  geradoEm: string;
  homologacao: boolean;
  /** Os destaques do topo: situação, score, restrições. */
  resumo: LinhaDoRelatorio[];
  secoes: SecaoDoRelatorio[];
  /** Produtos que não responderam: o relatório diz o que falta, e não esconde. */
  faltou: Array<{ produto: string; motivo: string }>;
}

export function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

const COR: Record<EstadoDoItem, string> = { ok: "#0a7d0a", atencao: "#9a6700", impeditivo: "#c62828", neutro: "#3f3f46" };
const SINAL: Record<EstadoDoItem, string> = { ok: "✔", atencao: "▲", impeditivo: "✖", neutro: "•" };

const quando = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
};

const valor = (v: string | null) => (v === null || v.trim() === "" ? '<span class="vazio">não informado</span>' : escapar(v));

function linhaHtml(l: LinhaDoRelatorio): string {
  const estado = l.estado ?? "neutro";
  const marca = l.estado ? `<span class="sinal" style="color:${COR[estado]}" aria-hidden="true">${SINAL[estado]}</span> ` : "";
  return `<tr><th scope="row">${escapar(l.rotulo)}</th><td>${marca}${valor(l.valor)}</td></tr>`;
}

function tabelaHtml(t: TabelaDoRelatorio): string {
  if (t.linhas.length === 0) return `<p class="tabela-vazia"><strong>${escapar(t.titulo)}:</strong> nenhum registro.</p>`;
  return `<table class="lista"><caption>${escapar(t.titulo)}</caption><thead><tr>${t.colunas.map((c) => `<th scope="col">${escapar(c)}</th>`).join("")}</tr></thead><tbody>${t.linhas
    .map((l) => `<tr>${l.map((c) => `<td>${valor(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

/**
 * A página inteira. `opcoes.rodape` diz para quem é (o link enviado leva
 * "documento confidencial" e a validade); `opcoes.imprimir` põe o botão de
 * imprimir/salvar PDF (que não sai no papel).
 */
export function relatorioEmHtml(r: RelatorioDeDocumento, opcoes: { rodape: string; imprimir: boolean }): string {
  const titulo = `${r.tipo === "cpf" ? "Consulta de CPF" : "Consulta de CNPJ"} · ${r.documento}`;
  const resumo = r.resumo.length
    ? `<section class="resumo"><h2>Resumo</h2><table class="pares">${r.resumo.map(linhaHtml).join("")}</table></section>`
    : "";
  const secoes = r.secoes
    .map(
      (s) =>
        `<section><h2>${escapar(s.titulo)} <small>· ${escapar(s.origem)}</small></h2>${s.linhas.length ? `<table class="pares">${s.linhas.map(linhaHtml).join("")}</table>` : ""}${s.tabelas.map(tabelaHtml).join("")}</section>`,
    )
    .join("");
  const faltou = r.faltou.length
    ? `<section class="faltou"><h2>Não veio nesta consulta</h2><ul>${r.faltou.map((f) => `<li><strong>${escapar(f.produto)}</strong>: ${escapar(f.motivo)}</li>`).join("")}</ul></section>`
    : "";
  const teste = r.homologacao ? '<p class="teste">MODO DE TESTE DO FORNECEDOR: os dados abaixo são de exemplo e não servem para decidir nada.</p>' : "";
  const botao = opcoes.imprimir ? '<button type="button" class="imprimir" onclick="window.print()">Imprimir / salvar PDF</button>' : "";
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="referrer" content="no-referrer">
<title>${escapar(titulo)} — Motors Store</title>
<style>
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #f4f4f5; color: #16161a; font: 14px/1.45 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
main { max-width: 860px; margin: 0 auto; padding: 24px 16px 48px; background: #fff; }
header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 16px; border-bottom: 3px solid #16161a; padding-bottom: 12px; margin-bottom: 16px; }
.marca { font-weight: 800; letter-spacing: .08em; text-transform: uppercase; font-size: 12px; }
h1 { margin: 4px 0 0; font-size: 22px; }
.titular { margin: 2px 0 0; font-size: 16px; font-weight: 700; }
.meta { font-size: 12px; color: #52525b; text-align: right; }
h2 { font-size: 13px; letter-spacing: .06em; text-transform: uppercase; margin: 22px 0 8px; border-bottom: 1px solid #d4d4d8; padding-bottom: 4px; }
h2 small { font-weight: 400; letter-spacing: 0; text-transform: none; color: #71717a; }
table { width: 100%; border-collapse: collapse; }
table.pares th { width: 38%; text-align: left; font-weight: 600; color: #3f3f46; vertical-align: top; padding: 4px 8px 4px 0; }
table.pares td { padding: 4px 0; word-break: break-word; }
table.pares tr + tr th, table.pares tr + tr td { border-top: 1px solid #f0f0f2; }
table.lista { margin: 8px 0 4px; font-size: 12.5px; }
table.lista caption { text-align: left; font-weight: 700; padding: 4px 0; }
table.lista th { text-align: left; background: #f4f4f5; padding: 4px 6px; }
table.lista td { padding: 4px 6px; border-top: 1px solid #e4e4e7; vertical-align: top; word-break: break-word; }
.vazio { color: #a1a1aa; }
.tabela-vazia { margin: 6px 0; color: #52525b; font-size: 12.5px; }
.resumo { background: #fafafa; border: 1px solid #e4e4e7; padding: 4px 12px 10px; }
.faltou { border-left: 4px solid #9a6700; padding-left: 12px; }
.teste { background: #fff4d6; border: 1px solid #9a6700; padding: 8px 12px; font-weight: 700; }
footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #d4d4d8; font-size: 11.5px; color: #52525b; }
.imprimir { position: fixed; right: 16px; bottom: 16px; padding: 10px 16px; font: 700 12px/1 inherit; letter-spacing: .06em; text-transform: uppercase; background: #16161a; color: #fff; border: 0; cursor: pointer; }
@page { size: A4; margin: 12mm; }
@media print { body { background: #fff; } main { max-width: none; padding: 0; } .imprimir { display: none; } section { break-inside: avoid-page; } tr { break-inside: avoid; } }
</style>
</head>
<body>
<main>
<header>
<div><div class="marca">Motors Store · uso interno</div><h1>${escapar(titulo)}</h1>${r.titular ? `<p class="titular">${escapar(r.titular)}</p>` : ""}</div>
<div class="meta">Nível: ${escapar(r.nivel)}<br>Consultado em ${escapar(quando(r.geradoEm))}</div>
</header>
${teste}${resumo}${secoes}${faltou}
<footer>${escapar(opcoes.rodape)}</footer>
</main>
${botao}
</body>
</html>`;
}

/** Os cabeçalhos de toda resposta que entrega o relatório: nada de cache, índice, referência nem script de fora. */
export const CABECALHOS_DO_RELATORIO: Record<string, string> = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  // Só o próprio estilo e o botão de imprimir; nenhuma origem externa.
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
};
