/**
 * As abas de configuração que são CONTEÚDO do site (03/10/2026).
 *
 * No trilho do painel eram seis itens separados no grupo "Site"; viraram uma
 * entrada só, "Configurações do site", e a troca entre elas acontece dentro da
 * tela. A lista mora aqui porque dois lugares a leem e não podem divergir: o
 * trilho (para acender a entrada em qualquer uma) e a tela (para desenhar as
 * abas).
 *
 * As outras três abas da mesma tela (integrações, pop-ups e dados da
 * concessionária) são do grupo "Sistema" e seguem como itens próprios.
 */
export const ABAS_DO_SITE = [
  { id: "destaques", rotulo: "Destaques rápidos" },
  { id: "aparencia", rotulo: "Aparência e cores" },
  { id: "sobre", rotulo: "Quem somos" },
  { id: "compartilhamento", rotulo: "Compartilhamento" },
  { id: "procedencia", rotulo: "Faixa de procedência" },
  { id: "instagram", rotulo: "Faixa do Instagram" },
] as const;

export type AbaDoSite = (typeof ABAS_DO_SITE)[number]["id"];

export function ehAbaDoSite(aba: string | null | undefined): aba is AbaDoSite {
  return ABAS_DO_SITE.some((a) => a.id === aba);
}
