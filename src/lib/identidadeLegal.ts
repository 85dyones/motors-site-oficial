import type { CompanySettings } from "../types";

/**
 * A identidade legal da loja — razão social e CNPJ — num lugar só.
 *
 * ---------------------------------------------------------------------------
 * Por que existe (2026-09-21)
 * ---------------------------------------------------------------------------
 * O rodapé publicava "© 2026 MOTORS STORE · CNPJ …": marca e número, sem o
 * nome empresarial a que o número pertence. Quem confere a loja — comprador
 * cauteloso, banco do financiamento, revisor de anúncio — procura o CNPJ na
 * Receita e encontra um nome que o site não mostra em lugar nenhum. O dono
 * pediu o campo; ele vem do painel (`razaoSocial` em `CompanySettings`).
 *
 * Quatro lugares mostram a identidade legal: rodapé, política de privacidade,
 * rodapé da ficha impressa e o `AutoDealer` (`legalName`/`taxID`). Esta
 * função decide, para os três que são TEXTO, se a razão social acrescenta
 * alguma coisa — e é por isso que existe em vez de um `?.trim()` em cada um.
 */

function comparavel(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * A razão social, quando ela diz algo que o nome fantasia não diz.
 *
 * Em branco → "". Igual ao nome fantasia (ignorando caixa, acento e espaço)
 * → "": "MOTORS STORE · MOTORS STORE · CNPJ" é ruído, não informação.
 */
export function razaoSocialAparte(empresa: Partial<CompanySettings> | null | undefined): string {
  const razao = (empresa?.razaoSocial ?? "").replace(/\s+/g, " ").trim();
  if (!razao) return "";
  const nome = empresa?.name ?? "";
  return comparavel(razao) === comparavel(nome) ? "" : razao;
}
