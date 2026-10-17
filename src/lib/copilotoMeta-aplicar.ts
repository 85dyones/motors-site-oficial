import type { SupabaseClient } from "@supabase/supabase-js";
import { TETO_DO_PEDIDO_DE_VERBA, type ResultadoDaAcao, type TipoDeAcao } from "./copilotoDeMidia";
import { registrarResultados, type ContagemDosResultados } from "./copilotoDeMidia-servidor";

/**
 * O executor do Copiloto do Meta (17/10/2026) — o papel que o script da conta
 * faz no Google.
 *
 * No Google, quem aplica é o script colado na conta, sem token. No Meta não há
 * script: quem aplica é a rodada agendada da sincronização do Meta, com o
 * token de um usuário do sistema que tem `ads_management` na conta
 * (`META_ADS_MANAGEMENT_TOKEN`, só em Production). Sem o token, nada é
 * reservado: o aprovado espera, e a tela diz por quê.
 *
 * Para cada ação reservada (`midia_copiloto_reservar_acoes_meta`):
 *   1. lê o objeto na conta e confere que é DESTA conta (o token pode ver
 *      outras) e que o estado é o que a proposta esperava;
 *   2. já está como a proposta quer ⇒ `sem_efeito`, sem mexer;
 *   3. pausa só se sobrar outro conjunto (ou anúncio) ativo ao lado;
 *   4. aplica (status, ou `daily_budget` da campanha em centavos);
 *   5. lê de volta e só chama de `aplicada` o que a conta confirma.
 * Só os cinco verbos do Meta; nada é criado nem apagado. O resultado vai para
 * `midia_copiloto_registrar_resultado`, que grava a trilha.
 */

export interface ConfigDaAplicacaoMeta {
  token: string;
  versao: string;
  /** Só os dígitos, sem `act_`. */
  conta: string;
}

/** Conta "motorsstore" (a mesma da leitura, `midiaMeta.ts`). Não é segredo. */
const CONTA_PADRAO = "802008949148808";
const TEMPO_LIMITE_MS = 15000;
/** Ações por rodada: a rota tem 60 s e cada ação faz até quatro chamadas. */
export const ACOES_POR_RODADA = 10;

/** Lê o ambiente. Devolve `{ erro }` com o motivo quando falta algo. */
export function configDaAplicacaoMeta(): ConfigDaAplicacaoMeta | { erro: string } {
  const token = process.env.META_ADS_MANAGEMENT_TOKEN?.trim();
  const versao = process.env.META_GRAPH_API_VERSION?.trim();
  const conta = (process.env.META_AD_ACCOUNT_ID?.trim() || CONTA_PADRAO).replace(/^act_/, "");
  if (!token) return { erro: "falta o token de gestão do Meta (META_ADS_MANAGEMENT_TOKEN)" };
  if (!versao || !/^v\d+\.\d+$/.test(versao)) return { erro: "META_GRAPH_API_VERSION ausente ou fora da forma vNN.N" };
  return { token, versao, conta };
}

/** O que o executor recebe da reserva — uma linha de `midia_copiloto_acoes`. */
export interface AcaoDoMeta {
  id: string;
  tipo: TipoDeAcao;
  campanhaId: string;
  conjuntoId: string | null;
  anuncioId: string | null;
  verbaAtual: number | null;
  verbaNova: number | null;
}

export function linhaParaAcaoDoMeta(l: Record<string, unknown>): AcaoDoMeta {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: String(l.id),
    tipo: l.tipo as TipoDeAcao,
    campanhaId: String(l.campanha_id_externo),
    conjuntoId: (l.grupo_id_externo as string | null) ?? null,
    anuncioId: (l.anuncio_id_externo as string | null) ?? null,
    verbaAtual: n(l.verba_atual),
    verbaNova: n(l.verba_nova),
  };
}

type Buscar = typeof fetch;

interface ErroDoGraph {
  code?: number;
  error_subcode?: number;
  message?: string;
  error_user_msg?: string;
}

/** A frase do erro do Graph, sem o token. */
export function mensagemDoErroDeGestao(erro: ErroDoGraph | undefined, conta: string): string {
  const code = erro?.code;
  if (code === 190) return "token de gestão do Meta inválido ou expirado — gere outro no usuário do sistema";
  if (code === 10 || code === 200 || (code !== undefined && code > 200 && code < 300)) {
    return `o token de gestão não tem permissão ads_management na conta act_${conta}`;
  }
  if (code === 4 || code === 17 || code === 613 || code === 80004) return "limite de chamadas do Meta atingido — a próxima rodada tenta de novo";
  const texto = erro?.error_user_msg || erro?.message || "erro sem mensagem";
  return `Meta respondeu: ${texto}`.slice(0, 400);
}

class ErroDeGestao extends Error {}

async function graph(
  cfg: ConfigDaAplicacaoMeta,
  buscar: Buscar,
  caminho: string,
  campos?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = `https://graph.facebook.com/${cfg.versao}/${caminho}`;
  const res = await buscar(url, {
    method: campos ? "POST" : "GET",
    // O token vai no cabeçalho, nunca na URL nem no corpo (corpo e URL aparecem em log).
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      ...(campos ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: campos ? new URLSearchParams(campos).toString() : undefined,
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    cache: "no-store",
  });
  const corpo = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: ErroDoGraph };
  if (!res.ok || corpo.error) throw new ErroDeGestao(mensagemDoErroDeGestao(corpo.error ?? { message: `HTTP ${res.status}` }, cfg.conta));
  return corpo;
}

const centavosParaReais = (v: unknown) => Math.round(Number(v)) / 100;
const mesmoValor = (a: number, b: number) => Math.abs(a - b) < 0.005;
const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** O alvo de cada verbo: a campanha (verba), o conjunto ou o anúncio. */
function alvo(a: AcaoDoMeta): { id: string | null; campos: string } {
  switch (a.tipo) {
    case "mudar_verba":
      return { id: a.campanhaId, campos: "account_id,status,daily_budget" };
    case "pausar_conjunto":
    case "reativar_conjunto":
      return { id: a.conjuntoId, campos: "account_id,status,campaign_id" };
    case "pausar_anuncio":
    case "reativar_anuncio":
      return { id: a.anuncioId, campos: "account_id,status,campaign_id" };
    default:
      return { id: null, campos: "" };
  }
}

/** Aplica UMA ação. Nunca lança: todo desfecho vira um resultado para o banco. */
export async function aplicarAcaoNoMeta(a: AcaoDoMeta, cfg: ConfigDaAplicacaoMeta, buscar: Buscar = fetch): Promise<ResultadoDaAcao> {
  const falhou = (erro: string, lido: Record<string, unknown> = {}): ResultadoDaAcao => ({ id: a.id, situacao: "falhou", lido, erro });
  const { id, campos } = alvo(a);
  if (!id) return falhou(`O executor do Meta não sabe aplicar "${a.tipo}".`);

  try {
    const antes = await graph(cfg, buscar, `${id}?fields=${campos}`);
    if (String(antes.account_id ?? "") !== cfg.conta) {
      return falhou(`O objeto ${id} não é da conta act_${cfg.conta}. Nada foi mudado.`);
    }
    if (a.tipo !== "mudar_verba" && antes.campaign_id !== undefined && String(antes.campaign_id) !== a.campanhaId) {
      return falhou(`O objeto ${id} não é da campanha ${a.campanhaId}. Nada foi mudado.`);
    }
    const status = String(antes.status ?? "");
    if (status === "DELETED" || status === "ARCHIVED") {
      return falhou(`O objeto ${id} está ${status === "DELETED" ? "apagado" : "arquivado"} na conta. Nada foi mudado.`, { status });
    }

    if (a.tipo === "mudar_verba") {
      if (a.verbaAtual === null || a.verbaNova === null) return falhou("A mudança de verba veio sem os valores.");
      if (antes.daily_budget === undefined || antes.daily_budget === null || antes.daily_budget === "") {
        return falhou("A verba desta campanha fica nos conjuntos de anúncios: o copiloto só muda a verba da campanha. Nada foi mudado.");
      }
      const atual = centavosParaReais(antes.daily_budget);
      if (mesmoValor(atual, a.verbaNova)) return { id: a.id, situacao: "sem_efeito", lido: { verba: atual }, erro: null };
      if (!mesmoValor(atual, a.verbaAtual)) {
        return falhou(
          `A verba da campanha mudou desde a proposta: era ${reais(a.verbaAtual)}, agora é ${reais(atual)}. Nada foi mudado.`,
          { verba: atual },
        );
      }
      // O mesmo teto do script do Google e do pedido de verba no banco.
      if (a.verbaNova > a.verbaAtual * TETO_DO_PEDIDO_DE_VERBA) {
        return falhou(`A verba nova passa de ${TETO_DO_PEDIDO_DE_VERBA}× a de agora. Nada foi mudado.`, { verba: atual });
      }
      await graph(cfg, buscar, id, { daily_budget: String(Math.round(a.verbaNova * 100)) });
      const depois = await graph(cfg, buscar, `${id}?fields=daily_budget`);
      const lida = centavosParaReais(depois.daily_budget);
      if (!mesmoValor(lida, a.verbaNova)) {
        return falhou(`O Meta aceitou a mudança, mas a verba lida de volta é ${reais(lida)}.`, { verba: lida });
      }
      return { id: a.id, situacao: "aplicada", lido: { verba: lida }, erro: null };
    }

    const querido = a.tipo.startsWith("pausar_") ? "PAUSED" : "ACTIVE";
    if (status === querido) return { id: a.id, situacao: "sem_efeito", lido: { status }, erro: null };
    if (querido === "PAUSED") {
      // O diagnóstico só propõe pausa com outro no ar; a conta pode ter mudado
      // desde então (alguém pausou o outro no Gerenciador). Pausar o último
      // pararia a campanha ou o conjunto inteiro.
      const conjunto = a.tipo === "pausar_conjunto";
      const pai = conjunto ? `${a.campanhaId}/adsets` : `${a.conjuntoId ?? a.campanhaId}/ads`;
      const irmaos = await graph(cfg, buscar, `${pai}?fields=id,effective_status&limit=200`);
      const ativos = ((irmaos.data ?? []) as Array<{ id?: unknown; effective_status?: unknown }>).filter(
        (x) => String(x.id) !== id && x.effective_status === "ACTIVE",
      );
      if (ativos.length === 0) {
        return falhou(
          conjunto
            ? "É o último conjunto ativo da campanha: pausar pararia a campanha. Nada foi mudado."
            : "É o último anúncio ativo do conjunto: pausar pararia o conjunto. Nada foi mudado.",
          { status },
        );
      }
    }
    await graph(cfg, buscar, id, { status: querido });
    const depois = await graph(cfg, buscar, `${id}?fields=status,effective_status`);
    const lido = { status: String(depois.status ?? ""), situacaoEfetiva: String(depois.effective_status ?? "") };
    if (lido.status !== querido) return falhou(`O Meta aceitou a mudança, mas o status lido de volta é ${lido.status || "vazio"}.`, lido);
    return { id: a.id, situacao: "aplicada", lido, erro: null };
  } catch (e) {
    return falhou(e instanceof ErroDeGestao ? e.message : `Falha ao falar com o Meta: ${e instanceof Error ? e.message : String(e)}`.slice(0, 400));
  }
}

export type RodadaDaAplicacaoMeta =
  | { feito: false; motivo: string }
  | ({ feito: true; reservadas: number } & ContagemDosResultados);

/**
 * A rodada: reserva o aprovado do Meta e aplica um por um. Sem configuração,
 * não reserva nada (a ação reservada sem executor viraria falha em 3 rodadas).
 */
export async function aplicarAprovadasNoMeta(admin: SupabaseClient, buscar: Buscar = fetch): Promise<RodadaDaAplicacaoMeta> {
  const cfg = configDaAplicacaoMeta();
  if ("erro" in cfg) return { feito: false, motivo: cfg.erro };

  const { data, error } = await admin.rpc("midia_copiloto_reservar_acoes_meta", { p_limite: ACOES_POR_RODADA });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  const acoes = ((data ?? []) as Array<Record<string, unknown>>).map(linhaParaAcaoDoMeta);
  if (acoes.length === 0) return { feito: true, reservadas: 0, aplicadas: 0, semEfeito: 0, falhas: 0, ignoradas: 0 };

  const resultados: ResultadoDaAcao[] = [];
  // Uma por vez: duas ações na mesma campanha não correm uma contra a outra.
  for (const a of acoes) resultados.push(await aplicarAcaoNoMeta(a, cfg, buscar));
  const conta = await registrarResultados(admin, resultados);
  return { feito: true, reservadas: acoes.length, ...conta };
}
