/**
 * CNPJ: conferência dos dígitos verificadores e o formato "00.000.000/0000-00".
 *
 * Não havia validador no repositório; a lista do repasse é o primeiro lugar do
 * site que recebe CNPJ digitado por visitante (spec §8, trilha lojista).
 *
 * Aceita o CNPJ ALFANUMÉRICO (IN RFB 2.229/2024, emitido desde julho de
 * 2026): as doze primeiras posições podem ser letra ou número, os dois
 * verificadores são sempre número, e o valor de cada posição é o código ASCII
 * menos 48 — o que, para os números, é o próprio dígito. O algoritmo é o mesmo
 * módulo 11 de sempre, então o CNPJ numérico de hoje passa igual.
 *
 * Todos os caracteres iguais ("00000000000000") fecham no módulo 11 e não são
 * CNPJ: a regra explícita existe para eles.
 */
const PESOS_DO_PRIMEIRO = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DO_SEGUNDO = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Só letras e números, em maiúscula: "12.abc.345/01de-35" → "12ABC34501DE35". */
export function soCaracteresDoCnpj(valor: string): string {
  return valor.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function verificador(base: string, pesos: number[]): number {
  const soma = pesos.reduce((total, peso, i) => total + (base.charCodeAt(i) - 48) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(valor: string): boolean {
  const cnpj = soCaracteresDoCnpj(valor);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return false;
  if (/^(.)\1+$/.test(cnpj)) return false;
  const primeiro = verificador(cnpj.slice(0, 12), PESOS_DO_PRIMEIRO);
  const segundo = verificador(`${cnpj.slice(0, 12)}${primeiro}`, PESOS_DO_SEGUNDO);
  return cnpj.slice(12) === `${primeiro}${segundo}`;
}

/** "00.000.000/0000-00". O que não tem 14 posições volta como veio, aparado. */
export function formatarCnpj(valor: string): string {
  const cnpj = soCaracteresDoCnpj(valor);
  if (cnpj.length !== 14) return valor.trim();
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}
