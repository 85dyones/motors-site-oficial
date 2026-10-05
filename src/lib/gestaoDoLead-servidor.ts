import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "./supabase-server";
import { ehStaff, perfisDe, podeFazer } from "./permissoes";
import { comEscopoDeLeads, leadNoEscopo, visaoDeLeads, type VisaoDeLeads } from "./escopoDeLeads";
import { ehTabelaOuColunaAusente, mensagemDeMigracaoPendente } from "./erroDeSchema";
import { itemDaInteracao, ultimaInteracaoPorLead, type InteracaoDoLead, type ItemDoHistorico, type UltimaInteracao } from "./gestaoDoLead";

/**
 * A porta das rotas de `/api/leads/[id]` (gestão do lead, 03/10/2026).
 *
 * Módulo de servidor: lê a sessão. Nunca num client component.
 *
 * ---------------------------------------------------------------------------
 * Por que a porta é da ROTA, e não só do banco
 * ---------------------------------------------------------------------------
 * `leads_interacoes` e `leads_eventos` são lidas por qualquer pessoa da equipe
 * (RLS `is_staff`), e `registrar_interacao_do_lead` alcança qualquer lead pelo
 * id. A migração `20261003130000_leads_rls_por_escopo.sql` fecha só `leads`, e
 * pode ainda não estar aplicada. Então toda rota daqui lê o LEAD primeiro, com
 * a sessão, confere o escopo (`lib/escopoDeLeads`) e só depois toca no
 * histórico ou chama a função. Com a RLS fechada o lead fora do escopo volta
 * nulo; com ela aberta, volta e `leadNoEscopo` recusa. Nos dois casos, 404.
 *
 * ---------------------------------------------------------------------------
 * Cliente da sessão, sempre
 * ---------------------------------------------------------------------------
 * Nenhuma leitura daqui usa a chave de serviço, como no `gerenciar`: a chave
 * ignora a RLS, e o que se lê é dado de pessoa. E a função só aceita sessão
 * (`is_staff(auth.uid())`): com a chave de serviço ela recusa na primeira
 * linha. A chave de serviço segue restrita aos agregados (`leadsDaLoja.ts`).
 */

export type ClienteDaSessao = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export const MIGRACAO_DA_GESTAO = "20260923150000_gestao_do_lead.sql";

interface SessaoAceita {
  supabase: ClienteDaSessao;
  visao: VisaoDeLeads;
  perfis: string[];
  recusa: null;
}
interface SessaoRecusada {
  supabase: ClienteDaSessao;
  visao: VisaoDeLeads;
  perfis: string[];
  recusa: NextResponse;
}

/**
 * Quem está pedindo, e o que enxerga.
 *
 *   401 .. sem sessão
 *   403 .. não é da equipe, perfil desativado, ou perfil que não vê lead
 *          (Marketing, Financeiro). A recusa sai antes de qualquer leitura de
 *          lead: nem nome, nem telefone, nem texto de registro.
 *
 * `is_active` precisa ser `true`: a sessão de quem saiu da loja pode seguir
 * viva, e `ehStaff` não olha o campo. Coluna ausente conta como desativado, o
 * lado seguro do esquecimento (a mesma régua de `passeDaEquipe`).
 */
export async function sessaoDeLeads(): Promise<SessaoAceita | SessaoRecusada> {
  const supabase = await createServerSupabaseClient();
  const semVisao: VisaoDeLeads = { escopo: "nenhum", meuNome: null };
  const recusar = (error: string, status: number): SessaoRecusada => ({
    supabase,
    visao: semVisao,
    perfis: [],
    recusa: NextResponse.json({ error }, { status }),
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return recusar("Não autorizado", 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, papeis, full_name, is_active")
    .eq("id", user.id)
    .single();
  if (!ehStaff(profile) || profile?.is_active !== true) return recusar("Acesso restrito à equipe", 403);

  const perfis = perfisDe(profile);
  const visao = visaoDeLeads(perfis, profile?.full_name);
  if (podeFazer(perfis, "Ver e mover leads no kanban") !== "faz" || visao.escopo === "nenhum") {
    return recusar("Seu perfil não vê leads", 403);
  }
  return { supabase, visao, perfis, recusa: null };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const naoEncontrado = () => NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });

type Linha = Record<string, unknown>;

/**
 * Quais destes leads quem pergunta enxerga. É a porta para os OUTROS módulos
 * (a agenda de pessoas, 05/10/2026): eles não leem `leads`, perguntam aqui.
 *
 * Escopo "nenhum" e lista vazia respondem sem ir ao banco. Leitura que falhou
 * devolve conjunto vazio: quem chama usa a resposta para decidir o que
 * MOSTRAR do lead, e na dúvida não mostra.
 */
export async function leadsAVistaDe(
  supabase: ClienteDaSessao,
  visao: VisaoDeLeads,
  ids: readonly string[],
): Promise<Set<string>> {
  const validos = [...new Set(ids.filter((id) => UUID.test(id)))];
  if (visao.escopo === "nenhum" || validos.length === 0) return new Set();

  const { data, error } = await comEscopoDeLeads(
    supabase.from("leads").select("id, responsavel").in("id", validos),
    visao,
  );
  if (error || !data) return new Set();
  return new Set(
    (data as { id: string; responsavel: string | null }[])
      .filter((l) => leadNoEscopo(visao, l.responsavel))
      .map((l) => l.id),
  );
}

/**
 * O lead, se quem pede o enxerga. É a guarda que vem ANTES do histórico e da
 * função.
 *
 * 404 "Lead não encontrado" para o que não existe, para o que está fora do
 * escopo e para id que nem UUID é: para quem não vê o lead, ele não existe, e
 * a resposta não confirma o contrário. Leitura que falhou é 500, e não 404: a
 * tela diria que o lead sumiu quando foi o banco que não respondeu.
 */
export async function lerLeadNoEscopo(
  supabase: ClienteDaSessao,
  visao: VisaoDeLeads,
  id: string,
  colunas: string,
): Promise<{ lead: Linha; recusa: null } | { lead: null; recusa: NextResponse }> {
  if (!UUID.test(id ?? "")) return { lead: null, recusa: naoEncontrado() };
  const { data, error } = await supabase.from("leads").select(colunas).eq("id", id).maybeSingle();
  if (error) {
    const mensagem = ehTabelaOuColunaAusente(error) ? mensagemDeMigracaoPendente(MIGRACAO_DA_GESTAO) : error.message;
    return { lead: null, recusa: NextResponse.json({ error: mensagem }, { status: 500 }) };
  }
  const lead = data as Linha | null;
  if (!lead || !leadNoEscopo(visao, lead.responsavel as string | null)) {
    return { lead: null, recusa: naoEncontrado() };
  }
  return { lead, recusa: null };
}

/**
 * O erro de `registrar_interacao_do_lead` como resposta.
 *
 * A rota valida antes (`decidirInteracao`), então o que chega aqui é o que só
 * o banco sabe: o lead apagado entre a guarda e a chamada, a função ainda não
 * criada, a sessão que deixou de ser da equipe.
 */
export function respostaDoErroDaFuncao(erro: { code?: string; message: string }): NextResponse {
  if (erro.code === "PGRST202" || ehTabelaOuColunaAusente(erro)) {
    return NextResponse.json({ error: mensagemDeMigracaoPendente(MIGRACAO_DA_GESTAO) }, { status: 503 });
  }
  if (erro.code === "P0002") return naoEncontrado();
  if (erro.code === "42501") return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
  if (erro.code === "23514") return NextResponse.json({ error: erro.message }, { status: 400 });
  return NextResponse.json({ error: erro.message }, { status: 500 });
}

/** O que o card e a Lista do dia precisam do lead depois de uma escrita. */
export const COLUNAS_DO_RESUMO =
  "id, situacao, responsavel, desfecho, proximo_passo, proximo_passo_vence_em, " +
  "proximo_passo_definido_em, proximo_passo_definido_por, ultimo_contato_em, ultimo_movimento_em";

export interface ResumoDoLead extends Linha {
  ultima_interacao: UltimaInteracao | null;
}

/**
 * O lead e o item novo do histórico, relidos depois de a função gravar.
 *
 * A gravação já aconteceu: se a releitura falhar, a resposta diz que gravou e
 * avisa que não deu para reler, em vez de devolver erro por uma escrita que
 * valeu. `lead` e `item` vêm nulos, e a tela busca o detalhe de novo. (A frase
 * não manda recarregar a página: recarregar o painel leva à Visão geral,
 * `tests/recarga-do-painel`.)
 */
export async function relerDepoisDeRegistrar(
  supabase: ClienteDaSessao,
  leadId: string,
  interacaoId: string,
): Promise<{ lead: ResumoDoLead | null; item: ItemDoHistorico | null; aviso?: string }> {
  const [leitura, registro] = await Promise.all([
    supabase.from("leads").select(COLUNAS_DO_RESUMO).eq("id", leadId).maybeSingle(),
    supabase
      .from("leads_interacoes")
      .select("id, lead_id, tipo, resultado, texto, autor, passo_texto, passo_vence_em, importada, criado_em")
      .eq("id", interacaoId)
      .maybeSingle(),
  ]);
  const interacao = (registro.data as InteracaoDoLead | null) ?? null;
  const lead = (leitura.data as Linha | null) ?? null;
  if (leitura.error || registro.error || !lead || !interacao) {
    console.warn("[Leads] Registro gravado, releitura falhou:", leitura.error?.message ?? registro.error?.message);
    return {
      lead: null,
      item: null,
      aviso: "O registro foi gravado, mas não deu para reler o lead. Abra o lead de novo para ver como ficou.",
    };
  }
  return {
    lead: { ...lead, ultima_interacao: ultimaInteracaoPorLead([interacao]).get(leadId) ?? null },
    item: itemDaInteracao(interacao),
  };
}
