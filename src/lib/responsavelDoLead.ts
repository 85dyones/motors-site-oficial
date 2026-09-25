import { recebeLead } from "./permissoes";

/**
 * Quem pode ser dono de lead — a régua de `recebeLead` aplicada à lista de
 * perfis (2026-09-23).
 *
 * Uma função só para a lista do card e para a recusa do PATCH de
 * `/api/leads/gerenciar`: se as duas divergirem, a tela oferece quem a rota
 * recusa, ou o contrário. O rodízio do banco aplica a mesma régua em
 * `montar_fila_do_funil` (migração `20260923130100`).
 *
 * `responsavel` é TEXTO (`full_name`), não FK — ver migração 20260807210000.
 */
export type PerfilDoFluxo = {
  full_name: string | null;
  role?: string | null;
  papeis?: string[] | null;
  is_active?: boolean | null;
};

export function atendentesDoFluxo(perfis: PerfilDoFluxo[]): { nome: string }[] {
  return perfis
    .filter(recebeLead)
    .map((p) => ({ nome: (p.full_name || "").trim() }))
    .filter((p) => p.nome)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * `null` = aceito. Sem responsável é sempre aceito: tirar o dono não põe
 * ninguém de fora no fluxo. Nome que não é de ninguém do Comercial ativo é
 * recusado — inclusive o nome antigo gravado no lead, que pode FICAR, mas não
 * pode ser escolhido de novo.
 */
export function recusaDeResponsavel(
  nome: string | null,
  perfis: PerfilDoFluxo[],
): string | null {
  if (nome === null || nome.trim() === "") return null;
  const alvo = nome.trim();
  const ok = atendentesDoFluxo(perfis).some((a) => a.nome === alvo);
  return ok ? null : `"${alvo}" não é do Comercial ativo — só o Comercial recebe lead.`;
}
