import { createHash, timingSafeEqual } from "crypto";

/**
 * Compara um segredo recebido com o esperado em tempo constante.
 *
 * `a !== b` em string desiste no primeiro caractere diferente: medindo o
 * tempo de resposta dá para adivinhar o token um caractere por vez (achado
 * #9 da revisão de 2026-08-12). O hash iguala os comprimentos — exigência do
 * `timingSafeEqual`, que estoura com buffers de tamanhos diferentes — e a
 * comparação passa a custar o mesmo para acerto e erro.
 *
 * Serve para segredo de integração (Bearer de rota), não para senha de
 * usuário — senha é do Supabase Auth, com hash de verdade.
 */
export function tokenConfere(
  recebido: string | null | undefined,
  esperado: string | null | undefined,
): boolean {
  if (!recebido || !esperado) return false;
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}
