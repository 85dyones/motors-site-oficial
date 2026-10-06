/**
 * A rede e o banco do mercado por modelo — só servidor.
 *
 * A porta é a mesma da consulta de placa (`autorizarConsultaDePlaca`):
 * Administrador, Gestor e Comercial. A aba não custa dinheiro, mas gasta o
 * teto diário do token da FIPE, que é da loja e é o mesmo da `/avaliacao`
 * pública. Por isso ela não é aberta a toda a equipe, e por isso tudo que é
 * lido fica guardado.
 *
 * A ordem de `consultarMercado`:
 *   1. as referências da FIPE (os meses de tabela), guardadas em memória;
 *   2. o que `fipe_historico` já tem deste modelo;
 *   3. só o que falta, em poucas chamadas simultâneas;
 *   4. gravar o que veio (inclusive "a FIPE não tinha este carro neste mês",
 *      para não perguntar de novo);
 *   5. montar o retrato.
 *
 * Tabela ausente não derruba a aba: ela funciona sem guardar, e a resposta
 * avisa. O que derruba é não conseguir o valor do mês corrente.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ehTabelaAusente } from "./consultaDePlaca-servidor";
import { ESPERA_MAXIMA_MS, urlNaV2, type BuscarNaFipe } from "./fipeNoServidor";
import {
  MESES_DE_HISTORICO,
  chaveDaReferencia,
  lerReferencias,
  lerValorDaFipe,
  montarMercado,
  planoDeBusca,
  type Busca,
  type LinhaDoHistorico,
  type MercadoDoModelo,
  type PedidoDeModelo,
  type ReferenciaDaFipe,
} from "./mercadoPorModelo";
import { FIPE_V2 } from "./fipeNoServidor";

export const MIGRACAO_DO_HISTORICO_DA_FIPE = "20261006190000_fipe_historico";

/** Quantas chamadas à FIPE correm ao mesmo tempo. */
const CHAMADAS_SIMULTANEAS = 5;

/** Por quanto tempo a lista de meses de referência vale em memória. */
const VALIDADE_DAS_REFERENCIAS_MS = 6 * 60 * 60 * 1000;

let referenciasEmMemoria: { em: number; lista: ReferenciaDaFipe[] } | null = null;

/** Só para os testes: cada um começa sem a lista em memória. */
export function esquecerReferencias(): void {
  referenciasEmMemoria = null;
}

function cabecalhos(token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token?.trim()) headers["X-Subscription-Token"] = token.trim();
  return headers;
}

export async function referenciasDaFipe(buscar: BuscarNaFipe, token: string | undefined, agora = Date.now()): Promise<ReferenciaDaFipe[]> {
  if (referenciasEmMemoria && agora - referenciasEmMemoria.em < VALIDADE_DAS_REFERENCIAS_MS) return referenciasEmMemoria.lista;
  const r = await buscar(`${FIPE_V2}/references`, { headers: cabecalhos(token), signal: AbortSignal.timeout(ESPERA_MAXIMA_MS) });
  if (!r.ok) throw new Error(`a FIPE respondeu ${r.status} à lista de meses`);
  const lista = lerReferencias(await r.json());
  if (lista.length === 0) throw new Error("a FIPE devolveu a lista de meses vazia");
  // Só a lista boa fica em memória: falha não pode valer por seis horas.
  referenciasEmMemoria = { em: agora, lista };
  return lista;
}

type Leitura =
  | { tipo: "valor"; busca: Busca; linha: LinhaDoHistorico }
  | { tipo: "limite" }
  | { tipo: "falha" };

async function lerUmMes(pedido: PedidoDeModelo, busca: Busca, buscar: BuscarNaFipe, token: string | undefined): Promise<Leitura> {
  const url = `${urlNaV2({ nivel: "valor", tipo: pedido.tipo, marca: pedido.marca, modelo: pedido.modelo, ano: busca.ano })}?reference=${busca.referencia.codigo}`;
  const vazia = (valor: number | null, v?: ReturnType<typeof lerValorDaFipe>): LinhaDoHistorico => ({
    ano: busca.ano,
    referencia: chaveDaReferencia(busca.referencia),
    valor,
    marca: v?.marca ?? null,
    modelo: v?.modelo ?? null,
    combustivel: v?.combustivel ?? null,
    codigoFipe: v?.codigoFipe ?? null,
  });
  try {
    const r = await buscar(url, { headers: cabecalhos(token), signal: AbortSignal.timeout(ESPERA_MAXIMA_MS) });
    if (r.status === 429) return { tipo: "limite" };
    // 404: naquele mês a FIPE ainda não tinha este ano-modelo. É resposta, e
    // fica guardada como "sem valor" para não ser perguntada de novo.
    if (r.status === 404) return { tipo: "valor", busca, linha: vazia(null) };
    if (!r.ok) return { tipo: "falha" };
    const v = lerValorDaFipe(await r.json());
    return v ? { tipo: "valor", busca, linha: vazia(v.valor, v) } : { tipo: "falha" };
  } catch {
    return { tipo: "falha" };
  }
}

export interface BancoDoHistorico {
  ler: (pedido: PedidoDeModelo, desde: string) => Promise<{ ok: true; linhas: LinhaDoHistorico[] } | { ok: false; faltaMigracao: boolean; motivo: string }>;
  gravar: (pedido: PedidoDeModelo, linhas: LinhaDoHistorico[]) => Promise<{ ok: boolean; motivo?: string }>;
}

export type ResultadoDoMercado =
  | { ok: true; mercado: MercadoDoModelo; chamadas: number; avisos: string[] }
  | { ok: false; status: 502 | 429; motivo: string };

export async function consultarMercado(
  pedido: PedidoDeModelo,
  deps: { buscar: BuscarNaFipe; token: string | undefined; banco: BancoDoHistorico },
): Promise<ResultadoDoMercado> {
  let referencias: ReferenciaDaFipe[];
  try {
    referencias = await referenciasDaFipe(deps.buscar, deps.token);
  } catch (erro) {
    return { ok: false, status: 502, motivo: `Não deu para ler os meses da tabela FIPE: ${(erro as Error).message}.` };
  }

  const avisos: string[] = [];
  const recorte = referencias.slice(0, MESES_DE_HISTORICO + 1);
  const guardado = await deps.banco.ler(pedido, chaveDaReferencia(recorte[recorte.length - 1]));
  if (!guardado.ok) {
    avisos.push(
      guardado.faltaMigracao
        ? `A tabela do histórico ainda não existe (migração ${MIGRACAO_DO_HISTORICO_DA_FIPE}): a consulta funciona, mas nada fica guardado e cada abertura gasta o teto diário da FIPE de novo.`
        : "Não deu para ler o histórico guardado; os meses foram buscados de novo na FIPE.",
    );
  }
  const linhas: LinhaDoHistorico[] = guardado.ok ? [...guardado.linhas] : [];

  // Só o que falta, em poucas chamadas por vez. Um 429 para a fila: insistir
  // contra o limite só queima o teto de amanhã.
  const fila = planoDeBusca(pedido, referencias, linhas);
  const novas: LinhaDoHistorico[] = [];
  let chamadas = 0;
  let falhas = 0;
  let limite = false;
  let proxima = 0;
  const trabalhar = async () => {
    while (!limite && proxima < fila.length) {
      const busca = fila[proxima++];
      chamadas++;
      const leitura = await lerUmMes(pedido, busca, deps.buscar, deps.token);
      if (leitura.tipo === "limite") limite = true;
      else if (leitura.tipo === "falha") falhas++;
      else novas.push(leitura.linha);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CHAMADAS_SIMULTANEAS, fila.length) }, trabalhar));

  if (novas.length > 0 && guardado.ok) {
    const gravacao = await deps.banco.gravar(pedido, novas);
    if (!gravacao.ok) avisos.push("Os meses lidos agora não puderam ser guardados; a próxima abertura vai buscá-los de novo.");
  }
  linhas.push(...novas);

  const mercado = montarMercado(pedido, referencias, linhas);
  if (!mercado) {
    return limite
      ? { ok: false, status: 429, motivo: "A FIPE atingiu o limite de consultas de hoje. Os modelos já consultados continuam abrindo; os novos, amanhã." }
      : { ok: false, status: 502, motivo: "A FIPE não devolveu o valor deste mês para o modelo escolhido." };
  }
  if (limite) avisos.push("A FIPE atingiu o limite de consultas de hoje no meio da leitura: o histórico está incompleto e se completa na próxima abertura.");
  else if (falhas > 0) avisos.push(`${falhas} ${falhas === 1 ? "mês não veio" : "meses não vieram"} da FIPE agora; a próxima abertura tenta de novo.`);

  return { ok: true, mercado, chamadas, avisos };
}

// ─────────────────────────────────────────────────────────────────────────────
// O banco — `fipe_historico`, com o cliente de sessão
// ─────────────────────────────────────────────────────────────────────────────

const COLUNAS = "ano, referencia, valor, marca, modelo, combustivel, codigo_fipe";

function linhaDoBanco(l: Record<string, unknown>): LinhaDoHistorico | null {
  if (typeof l.ano !== "string" || typeof l.referencia !== "string") return null;
  const valor = l.valor === null || l.valor === undefined ? null : Number(l.valor);
  if (valor !== null && !Number.isFinite(valor)) return null;
  const texto = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    ano: l.ano,
    referencia: l.referencia.slice(0, 10),
    valor,
    marca: texto(l.marca),
    modelo: texto(l.modelo),
    combustivel: texto(l.combustivel),
    codigoFipe: texto(l.codigo_fipe),
  };
}

export function bancoDoHistorico(supabase: SupabaseClient): BancoDoHistorico {
  return {
    async ler(pedido, desde) {
      const { data, error } = await supabase
        .from("fipe_historico")
        .select(COLUNAS)
        .eq("tipo", pedido.tipo)
        .eq("marca_codigo", pedido.marca)
        .eq("modelo_codigo", pedido.modelo)
        .in("ano", [pedido.ano, ...pedido.outrosAnos])
        .gte("referencia", desde);
      if (error) return { ok: false, faltaMigracao: ehTabelaAusente(error), motivo: error.message };
      return { ok: true, linhas: (data ?? []).flatMap((l) => linhaDoBanco(l as Record<string, unknown>) ?? []) };
    },
    async gravar(pedido, linhas) {
      const { error } = await supabase.from("fipe_historico").upsert(
        linhas.map((l) => ({
          tipo: pedido.tipo,
          marca_codigo: pedido.marca,
          modelo_codigo: pedido.modelo,
          ano: l.ano,
          referencia: l.referencia,
          valor: l.valor,
          marca: l.marca,
          modelo: l.modelo,
          combustivel: l.combustivel,
          codigo_fipe: l.codigoFipe,
        })),
        // Outra pessoa pode ter lido o mesmo mês ao mesmo tempo: o valor é o
        // mesmo, e a linha que já está lá fica.
        { onConflict: "org_id,tipo,marca_codigo,modelo_codigo,ano,referencia", ignoreDuplicates: true },
      );
      return error ? { ok: false, motivo: error.message } : { ok: true };
    },
  };
}

/** Um modelo já consultado, para reabrir sem digitar de novo. */
export interface ModeloRecente {
  tipo: string;
  marcaCodigo: string;
  modeloCodigo: string;
  ano: string;
  rotulo: string;
}

export type LeituraDosModelos =
  | { ok: true; modelos: ModeloRecente[] }
  | { ok: false; faltaMigracao: boolean; motivo: string };

/** Os últimos modelos consultados, um por (modelo, ano), pelo mês de histórico (quem tem vários meses foi o escolhido). */
export async function lerModelosRecentes(supabase: SupabaseClient, limite = 12): Promise<LeituraDosModelos> {
  const { data, error } = await supabase
    .from("fipe_historico")
    .select("tipo, marca_codigo, modelo_codigo, ano, marca, modelo, referencia, criado_em")
    .not("valor", "is", null)
    .order("criado_em", { ascending: false })
    .limit(600);
  if (error) return { ok: false, faltaMigracao: ehTabelaAusente(error), motivo: error.message };

  // O ano ESCOLHIDO tem vários meses guardados; os da comparação, um só.
  const meses = new Map<string, number>();
  for (const l of data ?? []) {
    const chave = `${l.tipo}|${l.marca_codigo}|${l.modelo_codigo}|${l.ano}`;
    meses.set(chave, (meses.get(chave) ?? 0) + 1);
  }
  const vistos = new Set<string>();
  const modelos: ModeloRecente[] = [];
  for (const l of data ?? []) {
    const chave = `${l.tipo}|${l.marca_codigo}|${l.modelo_codigo}|${l.ano}`;
    if (vistos.has(chave) || (meses.get(chave) ?? 0) < 2) continue;
    vistos.add(chave);
    modelos.push({
      tipo: String(l.tipo),
      marcaCodigo: String(l.marca_codigo),
      modeloCodigo: String(l.modelo_codigo),
      ano: String(l.ano),
      rotulo: `${[l.marca, l.modelo].filter(Boolean).join(" ")} ${String(l.ano).slice(0, 4)}`.trim(),
    });
    if (modelos.length === limite) break;
  }
  return { ok: true, modelos };
}
