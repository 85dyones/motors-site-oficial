/**
 * Quem enxerga quais leads (regra do dono, 03/10/2026).
 *
 *   · Administrador: todos, inclusive os novos sem responsável. É ele quem
 *     distribui.
 *   · Gestor e SDR: todos os que já têm responsável. Os novos, sem
 *     responsável, não.
 *   · Comercial (vendedor): só os dele.
 *   · A busca por referência obedece à mesma regra.
 *
 * Até aqui Admin, Comercial e SDR recebiam a fila inteira: o vendedor via os
 * leads dos colegas. A regra vale no SERVIDOR (a rota filtra a consulta e
 * recusa a escrita fora do escopo), e não só na tela.
 *
 * Multi-papel soma acesso, como no resto da matriz: quem é Comercial e SDR vê
 * os designados; quem também é Admin vê todos.
 *
 * `responsavel` em `leads` é TEXTO com o nome de quem atende (migração
 * 20260807210000), e não chave para `profiles`. O "meu" é, portanto, o lead
 * cujo `responsavel` é igual ao `full_name` de quem está logado.
 *
 * ⚠️ O que isto NÃO fecha: a RLS de `leads` continua dando a tabela a toda a
 * equipe. Quem tem sessão de painel e sabe montar a chamada lê direto no
 * PostgREST, sem passar por estas rotas. Fechar isso é migração, e migração
 * em produção pede a aprovação do dono.
 */

export type EscopoDeLeads = "todos" | "designados" | "meus" | "nenhum";

export interface VisaoDeLeads {
  escopo: EscopoDeLeads;
  /** O `full_name` de quem está logado. Só importa no escopo "meus". */
  meuNome: string | null;
}

export function escopoDeLeads(perfis: readonly string[]): EscopoDeLeads {
  if (perfis.includes("admin")) return "todos";
  if (perfis.includes("gestor") || perfis.includes("sdr")) return "designados";
  if (perfis.includes("comercial")) return "meus";
  return "nenhum";
}

/**
 * A visão de quem está logado, a partir do perfil. O nome vai APARADO: o
 * rodízio grava `trim(full_name)` em `responsavel`, e um espaço sobrando no
 * perfil faria o vendedor não achar nenhum lead dele.
 */
export function visaoDeLeads(perfis: readonly string[], fullName: string | null | undefined): VisaoDeLeads {
  const nome = typeof fullName === "string" ? fullName.trim() : "";
  return { escopo: escopoDeLeads(perfis), meuNome: nome || null };
}

const temTexto = (v: string | null | undefined): v is string => typeof v === "string" && v.trim() !== "";

/** O lead está à vista desta pessoa? */
export function leadNoEscopo(visao: VisaoDeLeads, responsavel: string | null | undefined): boolean {
  switch (visao.escopo) {
    case "todos":
      return true;
    case "designados":
      return temTexto(responsavel);
    case "meus":
      return temTexto(visao.meuNome) && responsavel === visao.meuNome;
    default:
      return false;
  }
}

/** Um valor que nenhum `responsavel` tem: a rota só aceita nome de perfil. */
const NINGUEM = "__fora_do_escopo__";

interface Filtravel<T> {
  eq(coluna: string, valor: string): T;
  neq(coluna: string, valor: string): T;
  not(coluna: string, operador: string, valor: null): T;
}

/**
 * Aplica o escopo a uma consulta em `leads`. O filtro vai para o BANCO: a fila
 * para em 500 linhas, e filtrar depois de ler cortaria os leads do vendedor
 * que ficaram atrás dos 500 mais novos da loja.
 *
 * O banco não sabe que um `responsavel` só com espaços é "sem responsável";
 * `leadNoEscopo` sabe. Quem lista passa o resultado por `leadNoEscopo` também,
 * para a fila e a escrita nunca discordarem sobre o mesmo lead.
 */
export function comEscopoDeLeads<T>(consulta: T, visao: VisaoDeLeads): T {
  const q = consulta as unknown as Filtravel<T>;
  switch (visao.escopo) {
    case "todos":
      return consulta;
    case "designados":
      return (q.not("responsavel", "is", null) as unknown as Filtravel<T>).neq("responsavel", "");
    case "meus":
      return q.eq("responsavel", temTexto(visao.meuNome) ? visao.meuNome : NINGUEM);
    default:
      return q.eq("responsavel", NINGUEM);
  }
}
