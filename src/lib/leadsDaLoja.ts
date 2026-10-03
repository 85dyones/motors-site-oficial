import { createAdminSupabaseClient } from "./supabase-server";
import { ehStaff } from "./permissoes";

/**
 * Os números da LOJA sobre `leads`, lidos com a chave de serviço.
 *
 * A migração `20261003130000_leads_rls_por_escopo.sql` fecha a RLS de `leads`
 * pelo escopo de quem pergunta (`escopoDeLeads.ts`): o vendedor só lê os dele,
 * o Marketing e o Financeiro não leem nenhum. Só que várias telas do painel
 * mostram AGREGADOS da loja (o relatório do funil, leads por campanha, leads
 * por veículo, a contagem que o Marketing vê no kanban), e liam `leads` com a
 * sessão de quem abriu a tela. Com a RLS fechada, esses números encolheriam
 * para o escopo de cada um, ou zerariam, sem erro nenhum.
 *
 * Eles saem daqui. Três travas, porque a chave de serviço ignora a RLS:
 *
 *   1. **Só colunas sem pessoa.** `COLUNAS_DE_AGREGADO` é a lista inteira do
 *      que esta leitura pode pedir: etapa, datas, desfecho, campanha, veículo.
 *      Nome, telefone, e-mail, mensagem, nota do desfecho e até o `id` e o
 *      `responsavel` ficam de fora, e pedir um deles lança erro. O que é POR
 *      LEAD continua na leitura com a sessão, pelo escopo (`comEscopoDeLeads`).
 *   2. **Só para a equipe.** A leitura pede um `PasseDaEquipe`, que só sai de
 *      `passeDaEquipe(perfil)` com o perfil lido pela SESSÃO de quem chama.
 *      Cliente da Garagem e investidor são `authenticated` sem ser equipe, e
 *      sem passe não há leitura. Perfil DESATIVADO também não tem passe: a
 *      sessão de quem saiu da loja pode seguir viva, e `ehStaff` não olha
 *      `is_active`. No banco, `is_staff()` olha, e a RLS já dava zero a ele.
 *   3. **A porta de cada rota não muda.** O 401, o 403 e a matriz A17 seguem
 *      sendo decididos com o cliente da sessão, antes de chegar aqui.
 *
 * Módulo de servidor: importa a chave de serviço. Nunca num client component.
 */

export const COLUNAS_DE_AGREGADO = [
  "situacao",
  "created_at",
  "desfecho",
  "desfecho_motivo",
  "desfecho_valor",
  "desfecho_em",
  "utm_campaign",
  "veiculo_id",
] as const;

export type ColunaDeAgregado = (typeof COLUNAS_DE_AGREGADO)[number];

declare const marcaDoPasse: unique symbol;
/** A prova de que a sessão de quem chama é da equipe. Ver `passeDaEquipe`. */
export interface PasseDaEquipe {
  readonly [marcaDoPasse]: true;
}

const PASSE = Object.freeze({}) as PasseDaEquipe;

/**
 * O passe para os agregados da loja, ou `null` para quem não é da equipe ou
 * está desativado. `perfil` é a linha de `profiles` lida com a sessão de quem
 * chama, e precisa trazer `is_active`: só `true` vale. Coluna ausente do
 * `select` conta como desativado, que é o lado seguro do esquecimento.
 */
export function passeDaEquipe(
  perfil: { role?: string | null; papeis?: string[] | null; is_active?: boolean | null } | null | undefined,
): PasseDaEquipe | null {
  return perfil && perfil.is_active === true && ehStaff(perfil) ? PASSE : null;
}

function consultaBase(colunas: string) {
  return createAdminSupabaseClient().from("leads").select(colunas);
}

export type ConsultaDeLeadsDaLoja = ReturnType<typeof consultaBase>;

export interface ErroDeLeitura {
  message: string;
  code?: string;
}

export interface LeituraDaLoja<T> {
  data: T[] | null;
  error: ErroDeLeitura | null;
}

/**
 * Lê `leads` da loja inteira, só nas colunas de agregado. `filtrar` recebe a
 * consulta já com o `select` e devolve a mesma, com os filtros da tela.
 *
 * Nunca lança: chave de serviço ausente ou banco fora do ar voltam em `error`,
 * como numa leitura comum, e cada tela decide se mostra "—" ou recusa.
 */
export async function lerLeadsDaLoja<T extends Partial<Record<ColunaDeAgregado, unknown>>>(
  passe: PasseDaEquipe,
  colunas: readonly ColunaDeAgregado[],
  filtrar: (consulta: ConsultaDeLeadsDaLoja) => PromiseLike<{ data: unknown; error: ErroDeLeitura | null }> = (c) => c,
): Promise<LeituraDaLoja<T>> {
  try {
    if (passe !== PASSE) throw new Error("Agregado de leads pedido sem o passe da equipe.");
    const foraDaLista = colunas.filter((c) => !(COLUNAS_DE_AGREGADO as readonly string[]).includes(c));
    if (colunas.length === 0 || foraDaLista.length > 0) {
      throw new Error(`Coluna fora dos agregados de leads: ${foraDaLista.join(", ") || "(nenhuma pedida)"}`);
    }
    const { data, error } = await filtrar(consultaBase(colunas.join(", ")));
    if (error) return { data: null, error };
    return { data: (data ?? []) as T[], error: null };
  } catch (erro) {
    return { data: null, error: { message: erro instanceof Error ? erro.message : String(erro) } };
  }
}
