/**
 * O link que o consultor manda com o relatório de CPF ou CNPJ (18/10/2026).
 *
 * O token tem 32 bytes aleatórios (256 bits) e só existe na URL entregue ao
 * consultor: o banco guarda o sha256 dele (`relatorios_compartilhados.
 * token_hash`). Quem lê o banco não abre o link; quem tem o link abre até
 * vencer ou ser revogado, e cada abertura é contada.
 *
 * Só servidor (usa `crypto` do Node).
 */
import { createHash, randomBytes } from "crypto";

/** Quantos dias o link vale. O banco aceita até 30; a loja usa 7. */
export const DIAS_DO_LINK = 7;

export const CAMINHO_DO_LINK = "/relatorio";

export function gerarTokenDoLink(): string {
  return randomBytes(32).toString("base64url");
}

export function hashDoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** O token tem a forma de um token nosso: 43 caracteres base64url. Outra coisa nem chega ao banco. */
export function tokenTemForma(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
