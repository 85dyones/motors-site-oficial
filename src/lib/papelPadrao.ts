/**
 * Papel assumido quando `profiles` não tem linha para o usuário — ou quando a
 * leitura falha. A regra vive num módulo só: o proxy e o layout do admin
 * carregavam duas cópias idênticas dela, e cópias divergem em silêncio.
 *
 * Desde a role `cliente` (2026-08-13, Garagem Motors), o padrão para quem não é
 * fundador é **cliente**, não mais "comercial": usuário sem perfil legível não
 * é tratado como staff (fail-closed). Staff de verdade sempre tem linha em
 * `profiles` — o trigger `handle_new_user` a cria no cadastro.
 */
export function papelPadraoPorEmail(email: string | null | undefined): "admin" | "cliente" {
  if (!email) return "cliente";
  const normalizado = email.toLowerCase();
  return normalizado === "motors@motorsstoreoficial.com.br" ||
    normalizado === "dyones@gmail.com"
    ? "admin"
    : "cliente";
}
