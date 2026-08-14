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
/**
 * E-mails fundadores. `motors@motorsstore.com.br` é o endereço novo (a loja
 * passa a usar o mesmo domínio do site, decisão de 2026-08-14); o
 * `@motorsstoreoficial.com.br` fica durante a transição, para não trancar do
 * lado de fora a conta que ainda existe no Supabase Auth com o nome antigo.
 *
 * ⚠️ Remover o antigo só DEPOIS de migrar a conta no Supabase — e conferindo
 * que o usuário tem linha em `profiles` com `role = 'admin'`, que é o que de
 * fato manda. Esta lista é rede de segurança, não o mecanismo.
 */
const EMAILS_FUNDADORES = [
  "motors@motorsstore.com.br",
  "motors@motorsstoreoficial.com.br",
  "dyones@gmail.com",
];

export function papelPadraoPorEmail(email: string | null | undefined): "admin" | "cliente" {
  if (!email) return "cliente";
  return EMAILS_FUNDADORES.includes(email.toLowerCase()) ? "admin" : "cliente";
}
