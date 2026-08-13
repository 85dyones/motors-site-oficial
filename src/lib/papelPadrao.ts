/**
 * Papel assumido quando `profiles` não tem linha para o usuário — ou quando a
 * leitura falha. A regra vive num módulo só: o proxy e o layout do admin
 * carregavam duas cópias idênticas dela, e cópias divergem em silêncio.
 *
 * Admin de fábrica só para os dois e-mails fundadores; qualquer outro usuário
 * autenticado cai em "comercial", o perfil de menor privilégio do painel.
 */
export function papelPadraoPorEmail(email: string | null | undefined): "admin" | "comercial" {
  if (!email) return "comercial";
  const normalizado = email.toLowerCase();
  return normalizado === "motors@motorsstoreoficial.com.br" ||
    normalizado === "dyones@gmail.com"
    ? "admin"
    : "comercial";
}
