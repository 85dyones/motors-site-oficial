/**
 * O endereço público do site, num lugar só.
 *
 * Até 2026-08-14 este valor estava escrito à mão em 15 pontos — canonical,
 * sitemap, robots, JSON-LD de quatro páginas, breadcrumb da ficha do veículo e
 * `metadataBase`. Trocar de domínio significaria caçar todos, e esquecer um
 * produz o pior tipo de erro de SEO: a página responde 200 e aponta o
 * canonical para um endereço que não é mais o do site.
 *
 * O domínio da loja será **motorsstore.com.br** (confirmado pelo dono em
 * 2026-08-14). Enquanto ele não entra no ar, o padrão continua sendo o
 * endereço da Vercel — e a virada é uma variável, não um commit.
 *
 * ⚠️ `NEXT_PUBLIC_*` é embutido no bundle em tempo de BUILD. Mudar a variável
 * na Vercel só vale para o próximo deploy; não basta salvar e recarregar.
 *
 * Atenção a uma confusão fácil: o e-mail da loja é `@motorsstoreoficial.com.br`
 * (com "oficial"), e é o que aparece no fallback de papel em `papelPadrao.ts`.
 * O site é `motorsstore.com.br`, sem "oficial". São endereços diferentes.
 */

const PADRAO = "https://motors-site-oficial.vercel.app";

/** Aceita com ou sem protocolo, com ou sem barra no fim. */
function normalizar(valor: string | undefined): string {
  const limpo = (valor ?? "").trim().replace(/\/+$/, "");
  if (!limpo) return PADRAO;
  return /^https?:\/\//i.test(limpo) ? limpo : `https://${limpo}`;
}

export const SITE_URL = normalizar(process.env.NEXT_PUBLIC_SITE_URL);

/** `urlDoSite("/estoque")` → `https://dominio/estoque`. Sem barra dupla. */
export function urlDoSite(caminho: string = ""): string {
  if (!caminho) return SITE_URL;
  return `${SITE_URL}${caminho.startsWith("/") ? caminho : `/${caminho}`}`;
}

/** Só o host, para quando o contexto pede o domínio sem esquema. */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//i, "");
