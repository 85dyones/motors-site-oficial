/**
 * CPF: conferência dos dígitos verificadores e o formato "000.000.000-00"
 * (consulta de CPF, 18/10/2026). O par de `cnpj.ts`.
 *
 * Todos os dígitos iguais ("11111111111") fecham no módulo 11 e não são CPF:
 * a regra explícita existe para eles, como no CNPJ.
 */

/** Só os dígitos: "123.456.789-09" → "12345678909". */
export function soDigitosDoCpf(valor: string): string {
  return valor.replace(/\D/g, "");
}

function verificador(base: string): number {
  const pesoInicial = base.length + 1;
  const soma = [...base].reduce((total, d, i) => total + Number(d) * (pesoInicial - i), 0);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

export function cpfValido(valor: string): boolean {
  const cpf = soDigitosDoCpf(valor);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const primeiro = verificador(cpf.slice(0, 9));
  const segundo = verificador(`${cpf.slice(0, 9)}${primeiro}`);
  return cpf.slice(9) === `${primeiro}${segundo}`;
}

/** "000.000.000-00". O que não tem 11 dígitos volta como veio, aparado. */
export function formatarCpf(valor: string): string {
  const cpf = soDigitosDoCpf(valor);
  if (cpf.length !== 11) return valor.trim();
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

/** "***.456.789-**": para listas e para quem não precisa do número inteiro. */
export function mascararCpf(valor: string): string {
  const cpf = soDigitosDoCpf(valor);
  if (cpf.length !== 11) return "***";
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
}
