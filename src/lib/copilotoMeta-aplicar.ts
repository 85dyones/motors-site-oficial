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
 * reservado: o aprovado espera, e a tela diz por quê. A conta e a versão do
 * Graph são as da sincronização (`configMeta`): o executor muda a mesma conta
 * de onde vieram os IDs.
 *
 * Para cada ação reservada (`midia_copiloto_reservar_acoes_meta`, uma de cada
 * vez):
 *   1. lê o objeto na conta e confere que é DESTA conta (o token pode ver
 *      outras), da campanha (e do conjunto) da proposta, e que não acabou;
 *   2. já está como a proposta quer ⇒ `sem_efeito`, sem mexer;
 *   3. pausa só se sobrar outro anúncio ativo ao lado (no conjunto, ou em
 *      outro conjunto da campanha);
 *   4. aplica (status, ou `daily_budget` da campanha em centavos);
 *   5. lê de volta e só chama de `aplicada` o que a conta confirma.
 * O resultado vai para o banco LOGO depois de cada ação: a rota tem 60 s, e o
 * que já mexeu na conta não pode ficar sem registro se ela for interrompida.
 * Erro passageiro antes de mexer (limite de chamadas, rede, Meta fora) não
 * vira falha: a ação fica reservada e volta na reentrega do banco (90 min, até
 * 3 vezes), e a rodada para ali. Só os cinco verbos do Meta; nada é criado nem
 * apagado.
 */

export interface ConfigDaAplicacaoMeta {
  token: string;
  versao: string;
  /** Só os dígitos, sem `act_`. */
  conta: string;
}

/** Por chamada ao Graph. Uma ação faz até quatro: ~24 s no pior caso. */
const TEMPO_LIMITE_MS = 6000;
/** Nenhuma ação nova começa depois disto: a sincronização ainda roda depois, nos 60 s da rota. */
export const PRAZO_DA_APLICACAO_MS = 20000;
/** Ações por rodada, no máximo. */
export const ACOES_POR_RODADA = 10;
/** Anúncios lidos para achar um ativo ao lado; a conta tem dezenas. */
const ANUNCIOS_LIDOS = 500;

/**
 * O token de gestão. A versão e a conta vêm da configuração da sincronização,
 * que a rota já leu. Devolve `{ erro }` com o motivo quando falta o token.
 */
export function configDaAplicacaoMeta(base: { versao: string; conta: string }): ConfigDaAplicacaoMeta | { erro: string } {
  const token = process.env.META_ADS_MANAGEMENT_TOKEN?.trim();
  if (!token) return { erro: "falta o token de gestão do Meta (META_ADS_MANAGEMENT_TOKEN)" };
  return { token, versao: base.versao, conta: base.conta.replace(/^act_/, "") };
}

/** O que o executor recebe da reserva — uma linha de `midia_copiloto_acoes`. */
export interface AcaoDoMeta {
  id: string;
  /** A plataforma da linha: o executor só aplica `meta`. */
  plataforma: string;
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
    plataforma: String(l.plataforma ?? ""),
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
  is_transient?: boolean;
}

/** Limite de chamadas e "tente de novo" do Graph. */
const CODIGOS_PASSAGEIROS = new Set([1, 2, 4, 17, 32, 341, 613, 80004]);

const semToken = (t: string, token: string) => (token ? t.replaceAll(token, "***") : t);

/** A frase do erro do Graph, sem o token. */
export function mensagemDoErroDeGestao(erro: ErroDoGraph | undefined, conta: string, token = ""): string {
  const code = erro?.code;
  if (code === 190) return "token de gestão do Meta inválido ou expirado — gere outro no usuário do sistema";
  if (code === 10 || code === 200 || (code !== undefined && code > 200 && code < 300)) {
    return `o token de gestão não tem permissão ads_management na conta act_${conta}`;
  }
  if (code === 4 || code === 17 || code === 613 || code === 80004) return "limite de chamadas do Meta atingido — a próxima rodada tenta de novo";
  const texto = erro?.error_user_msg || erro?.message || "erro sem mensagem";
  return semToken(`Meta respondeu: ${texto}`, token).slice(0, 400);
}

class ErroDeGestao extends Error {
  constructor(
    mensagem: string,
    /** Vale tentar de novo depois: limite, Meta fora, rede. */
    readonly passageiro: boolean,
  ) {
    super(mensagem);
  }
}

async function graph(
  cfg: ConfigDaAplicacaoMeta,
  buscar: Buscar,
  caminho: string,
  campos?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = `https://graph.facebook.com/${cfg.versao}/${caminho}`;
  let res: Response;
  try {
    res = await buscar(url, {
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
  } catch (e) {
    // Rede caída ou tempo esgotado: não se sabe se o Meta recebeu.
    const motivo = semToken(`Falha ao falar com o Meta: ${e instanceof Error ? e.message : String(e)}`, cfg.token);
    throw new ErroDeGestao(motivo.slice(0, 400), true);
  }
  const corpo = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: ErroDoGraph };
  if (!res.ok || corpo.error) {
    const erro = corpo.error ?? { message: `HTTP ${res.status}` };
    const passageiro = res.status >= 500 || erro.is_transient === true || (erro.code !== undefined && CODIGOS_PASSAGEIROS.has(erro.code));
    throw new ErroDeGestao(mensagemDoErroDeGestao(erro, cfg.conta, cfg.token), passageiro);
  }
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
      return { id: a.anuncioId, campos: "account_id,status,campaign_id,adset_id" };
    default:
      return { id: null, campos: "" };
  }
}

/** A ação não foi tocada e volta na reentrega: o erro foi passageiro, antes de qualquer mudança. */
export interface AdiadaNoMeta {
  id: string;
  adiada: true;
  motivo: string;
}

/** Como conferir a leitura de volta: pronto, ainda como antes, ou outra coisa. */
type Conferencia = { pronto: boolean | null; lido: Record<string, unknown>; frase?: string };

/**
 * Aplica UMA ação. Nunca lança: todo desfecho vira um resultado para o banco,
 * ou o adiamento, quando o Meta não respondeu antes de qualquer mudança.
 */
export async function aplicarAcaoNoMeta(
  a: AcaoDoMeta,
  cfg: ConfigDaAplicacaoMeta,
  buscar: Buscar = fetch,
): Promise<ResultadoDaAcao | AdiadaNoMeta> {
  const falhou = (erro: string, lido: Record<string, unknown> = {}): ResultadoDaAcao => ({ id: a.id, situacao: "falhou", lido, erro });
  if (a.plataforma !== "meta") return falhou(`A ação é da plataforma "${a.plataforma}", não do Meta. Nada foi mudado.`);
  const { id, campos } = alvo(a);
  if (!id) return falhou(`O executor do Meta não sabe aplicar "${a.tipo}".`);
  const querido = a.tipo === "mudar_verba" ? null : a.tipo.startsWith("pausar_") ? "PAUSED" : "ACTIVE";

  // ── Antes de mexer: erro passageiro adia, o resto falha ────────────────
  let antes: Record<string, unknown>;
  let vizinhos: Array<{ id?: unknown; adset_id?: unknown; effective_status?: unknown }> = [];
  try {
    antes = await graph(cfg, buscar, `${id}?fields=${campos}`);
    if (String(antes.account_id ?? "") !== cfg.conta) {
      return falhou(`O objeto ${id} não é da conta act_${cfg.conta}. Nada foi mudado.`);
    }
    if (a.tipo !== "mudar_verba" && String(antes.campaign_id ?? "") !== a.campanhaId) {
      return falhou(`O objeto ${id} não é da campanha ${a.campanhaId}. Nada foi mudado.`);
    }
    if ((a.tipo === "pausar_anuncio" || a.tipo === "reativar_anuncio") && a.conjuntoId && String(antes.adset_id ?? "") !== a.conjuntoId) {
      return falhou(`O anúncio ${id} não é do conjunto ${a.conjuntoId}. Nada foi mudado.`);
    }
    const status = String(antes.status ?? "");
    if (status === "DELETED" || status === "ARCHIVED") {
      return falhou(`O objeto ${id} está ${status === "DELETED" ? "apagado" : "arquivado"} na conta. Nada foi mudado.`, { status });
    }
    if (querido === "PAUSED" && status !== "PAUSED") {
      // O diagnóstico só propõe pausa com outro entregando; a conta pode ter
      // mudado desde então. Um ANÚNCIO ativo ao lado (no Meta, anúncio ativo é
      // anúncio com conjunto e campanha ativos) segura a campanha ou o conjunto.
      const pai = a.tipo === "pausar_conjunto" ? a.campanhaId : (a.conjuntoId ?? a.campanhaId);
      const r = await graph(cfg, buscar, `${pai}/ads?fields=id,adset_id,effective_status&limit=${ANUNCIOS_LIDOS}`);
      vizinhos = (r.data ?? []) as typeof vizinhos;
    }
  } catch (e) {
    if (e instanceof ErroDeGestao && e.passageiro) return { id: a.id, adiada: true, motivo: e.message };
    return falhou(semToken(e instanceof Error ? e.message : String(e), cfg.token).slice(0, 400));
  }
  const status = String(antes.status ?? "");

  if (a.tipo === "mudar_verba") {
    if (a.verbaAtual === null || a.verbaNova === null) return falhou("A mudança de verba veio sem os valores.");
    if (antes.daily_budget === undefined || antes.daily_budget === null || antes.daily_budget === "") {
      return falhou("A verba desta campanha fica nos conjuntos de anúncios: o copiloto só muda a verba da campanha. Nada foi mudado.");
    }
    const atual = centavosParaReais(antes.daily_budget);
    const nova = a.verbaNova;
    if (mesmoValor(atual, nova)) return { id: a.id, situacao: "sem_efeito", lido: { verba: atual }, erro: null };
    if (!mesmoValor(atual, a.verbaAtual)) {
      return falhou(`A verba da campanha mudou desde a proposta: era ${reais(a.verbaAtual)}, agora é ${reais(atual)}. Nada foi mudado.`, {
        verba: atual,
      });
    }
    // O mesmo teto do script do Google e do pedido de verba no banco.
    if (nova > a.verbaAtual * TETO_DO_PEDIDO_DE_VERBA) {
      return falhou(`A verba nova passa de ${TETO_DO_PEDIDO_DE_VERBA}× a de agora. Nada foi mudado.`, { verba: atual });
    }
    return mudarELerDeVolta(a.id, cfg, buscar, id, { daily_budget: String(Math.round(nova * 100)) }, "daily_budget", (d) => {
      const lida = centavosParaReais(d.daily_budget);
      if (mesmoValor(lida, nova)) return { pronto: true, lido: { verba: lida } };
      if (mesmoValor(lida, atual)) return { pronto: false, lido: { verba: lida } };
      return { pronto: null, lido: { verba: lida }, frase: `a verba lida de volta é ${reais(lida)}` };
    });
  }

  if (status === querido) return { id: a.id, situacao: "sem_efeito", lido: { status }, erro: null };
  if (querido === "PAUSED") {
    const ativos = vizinhos.filter(
      (x) => x.effective_status === "ACTIVE" && (a.tipo === "pausar_conjunto" ? String(x.adset_id ?? "") !== id : String(x.id) !== id),
    );
    if (ativos.length === 0) {
      return falhou(
        a.tipo === "pausar_conjunto"
          ? "Nenhum outro conjunto da campanha tem anúncio ativo: pausar este pararia a campanha. Nada foi mudado."
          : "É o último anúncio ativo do conjunto: pausar pararia o conjunto. Nada foi mudado.",
        { status },
      );
    }
  }
  return mudarELerDeVolta(a.id, cfg, buscar, id, { status: querido as string }, "status,effective_status", (d) => {
    const lido = { status: String(d.status ?? ""), situacaoEfetiva: String(d.effective_status ?? "") };
    if (lido.status === querido) return { pronto: true, lido };
    if (lido.status === status) return { pronto: false, lido };
    return { pronto: null, lido, frase: `o status lido de volta é ${lido.status || "vazio"}` };
  });
}

/**
 * Aplica e lê de volta. Se o POST falhar, lê a conta antes de concluir: um
 * POST que estourou o tempo pode ter sido aplicado.
 */
async function mudarELerDeVolta(
  acaoId: string,
  cfg: ConfigDaAplicacaoMeta,
  buscar: Buscar,
  id: string,
  mudanca: Record<string, string>,
  camposDeVolta: string,
  conferir: (d: Record<string, unknown>) => Conferencia,
): Promise<ResultadoDaAcao> {
  let erroDoPost: string | null = null;
  try {
    await graph(cfg, buscar, id, mudanca);
  } catch (e) {
    erroDoPost = e instanceof Error ? e.message : String(e);
  }

  let depois: Record<string, unknown>;
  try {
    depois = await graph(cfg, buscar, `${id}?fields=${camposDeVolta}`);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    const erro = erroDoPost
      ? `O Meta não confirmou a mudança (${erroDoPost}) e a conta não pôde ser lida de volta (${motivo}). Ela pode ter sido aplicada: confira no Gerenciador de Anúncios.`
      : `O Meta aceitou a mudança, mas a conta não pôde ser lida de volta (${motivo}). Confira no Gerenciador de Anúncios.`;
    return { id: acaoId, situacao: "falhou", lido: {}, erro: erro.slice(0, 400) };
  }

  const c = conferir(depois);
  if (c.pronto === true) return { id: acaoId, situacao: "aplicada", lido: c.lido, erro: null };
  const erro =
    erroDoPost && c.pronto === false
      ? `${erroDoPost}. Nada foi mudado.`
      : erroDoPost
        ? `${erroDoPost}; ${c.frase ?? "a conta não mudou"}.`
        : `O Meta aceitou a mudança, mas ${c.frase ?? "a conta não mudou"}.`;
  return { id: acaoId, situacao: "falhou", lido: c.lido, erro: erro.slice(0, 400) };
}

export type RodadaDaAplicacaoMeta =
  | { feito: false; motivo: string }
  | ({ feito: true; reservadas: number; adiadas: number; motivoDoAdiamento?: string } & ContagemDosResultados);

/**
 * A rodada: reserva o aprovado do Meta UMA ação por vez, aplica e registra
 * antes de pegar a próxima. Para no prazo, no teto da rodada ou no primeiro
 * adiamento (o Meta não está respondendo: insistir só gasta o limite de
 * chamadas). Sem o token, não reserva nada (a ação reservada sem executor
 * viraria falha em 3 rodadas).
 */
export async function aplicarAprovadasNoMeta(
  admin: SupabaseClient,
  base: { versao: string; conta: string },
  buscar: Buscar = fetch,
  relogio: () => number = Date.now,
): Promise<RodadaDaAplicacaoMeta> {
  const cfg = configDaAplicacaoMeta(base);
  if ("erro" in cfg) return { feito: false, motivo: cfg.erro };

  const inicio = relogio();
  const rodada = { reservadas: 0, adiadas: 0, aplicadas: 0, semEfeito: 0, falhas: 0, ignoradas: 0 };
  let motivoDoAdiamento: string | undefined;
  while (rodada.reservadas < ACOES_POR_RODADA && relogio() - inicio < PRAZO_DA_APLICACAO_MS) {
    const { data, error } = await admin.rpc("midia_copiloto_reservar_acoes_meta", { p_limite: 1 });
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    const linha = ((data ?? []) as Array<Record<string, unknown>>)[0];
    if (!linha) break;
    rodada.reservadas++;

    const r = await aplicarAcaoNoMeta(linhaParaAcaoDoMeta(linha), cfg, buscar);
    if ("adiada" in r) {
      rodada.adiadas++;
      motivoDoAdiamento = r.motivo;
      break;
    }
    const c = await registrarResultados(admin, [r]);
    rodada.aplicadas += c.aplicadas;
    rodada.semEfeito += c.semEfeito;
    rodada.falhas += c.falhas;
    rodada.ignoradas += c.ignoradas;
  }
  return { feito: true, ...rodada, ...(motivoDoAdiamento ? { motivoDoAdiamento } : {}) };
}
