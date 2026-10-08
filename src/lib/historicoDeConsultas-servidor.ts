/**
 * O histórico de consultas — leitura e registro, só servidor. A parte pura e
 * o porquê estão em `historicoDeConsultas.ts`.
 *
 * Tudo com o cliente de SESSÃO: a RLS de `consultas_de_modelo`,
 * `consultas_de_placa` e `fipe_historico` é a mesma (Administrador, Gestor e
 * Comercial). Tabela ausente não derruba a tela: sem `consultas_de_modelo`
 * (migração `20261008120000_consultas_de_modelo`), os modelos vêm do que está
 * guardado em `fipe_historico`, sem quem nem custo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ehTabelaAusente } from "./consultaDePlaca-servidor";
import {
  ITENS_DO_HISTORICO,
  juntarHistorico,
  mesDaReferencia,
  type FiltroDoHistorico,
  type ItemDoHistorico,
  type LeituraDoHistorico,
} from "./historicoDeConsultas";
import type { MercadoDoModelo, PedidoDeModelo } from "./mercadoPorModelo";


const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const numero = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/**
 * Registra uma análise de modelo que deu certo. Melhor esforço: falhar aqui
 * (tabela ausente, rede) não estraga a análise que a pessoa já tem na tela.
 * Quem e quando são carimbados pelo banco.
 */
export async function registrarConsultaDeModelo(
  supabase: SupabaseClient,
  dados: { pedido: PedidoDeModelo; mercado: MercadoDoModelo; modo: "pontual" | "completa"; chamadasPagas: number; custo: number | null; homologacao: boolean },
): Promise<void> {
  const { pedido, mercado } = dados;
  const rotulo = `${[mercado.marca, mercado.modelo].filter(Boolean).join(" ") || "Modelo"} ${mercado.anoModelo}`.slice(0, 200);
  const { error } = await supabase.from("consultas_de_modelo").insert({
    tipo: pedido.tipo,
    marca_codigo: pedido.marca,
    modelo_codigo: pedido.modelo,
    ano: pedido.ano,
    rotulo,
    codigo_fipe: mercado.codigoFipe,
    modo: dados.modo,
    referencia: `${mercado.referencia}-01`,
    fipe_atual: mercado.fipeAtual,
    meses_na_serie: mercado.historico.length,
    chamadas_pagas: dados.chamadasPagas,
    custo: dados.custo,
    homologacao: dados.homologacao,
  });
  if (error && !ehTabelaAusente(error)) console.warn("[Histórico] a consulta de modelo não foi registrada:", error.code, error.message);
}

function itemDeModelo(l: Record<string, unknown>): ItemDoHistorico | null {
  const modo = l.modo === "completa" ? "completa" : l.modo === "pontual" ? "pontual" : null;
  const marca = texto(l.marca_codigo);
  const modelo = texto(l.modelo_codigo);
  const ano = texto(l.ano);
  const quando = texto(l.criado_em);
  if (!modo || !marca || !modelo || !ano || !quando) return null;
  const fipe = numero(l.fipe_atual);
  const meses = numero(l.meses_na_serie) ?? 0;
  const referencia = texto(l.referencia);
  const chamadas = numero(l.chamadas_pagas) ?? 0;
  const homologacao = l.homologacao === true;
  return {
    chave: `m:${String(l.id)}`,
    tipo: modo === "pontual" ? "fipe" : "modelo",
    quando,
    quem: texto(l.criado_por_nome),
    titulo: texto(l.rotulo) ?? `${marca}/${modelo} ${ano.slice(0, 4)}`,
    detalhe: [fipe !== null ? `FIPE ${reais(fipe)}` : null, referencia ? mesDaReferencia(referencia) : null, modo === "completa" ? `${meses} meses` : null]
      .filter(Boolean)
      .join(" · "),
    custo: homologacao || chamadas === 0 ? 0 : numero(l.custo),
    homologacao,
    abrir: { tipo: "modelo", modo, marca, modelo, ano },
  };
}

function itemDePlaca(l: Record<string, unknown>): ItemDoHistorico | null {
  const placa = texto(l.placa);
  const quando = texto(l.criado_em);
  if (!placa || !quando) return null;
  const homologacao = l.homologacao === true;
  return {
    chave: `p:${String(l.id)}`,
    tipo: "placa",
    quando,
    quem: texto(l.consultado_por_nome),
    titulo: placa,
    detalhe: texto(l.descricao),
    custo: homologacao ? 0 : numero(l.custo),
    homologacao,
    abrir: { tipo: "placa", placa },
  };
}

const COLUNAS_DE_MODELO =
  "id, tipo, marca_codigo, modelo_codigo, ano, rotulo, modo, referencia, fipe_atual, meses_na_serie, chamadas_pagas, custo, homologacao, criado_por_nome, criado_em";
// Só a descrição do carro sai do retrato: nada do resto (nem peso, nem dado que a lista não usa).
const COLUNAS_DE_PLACA = "id, placa, descricao:retrato->veiculo->>descricao, custo, homologacao, criado_em, consultado_por_nome";

async function lerModelos(
  supabase: SupabaseClient,
  termo: string | null,
  filtro: FiltroDoHistorico,
  limite: number,
): Promise<{ ok: true; itens: ItemDoHistorico[]; semRegistro: boolean } | { ok: false; motivo: string }> {
  let q = supabase.from("consultas_de_modelo").select(COLUNAS_DE_MODELO).order("criado_em", { ascending: false }).limit(limite);
  if (filtro === "fipe") q = q.eq("modo", "pontual");
  if (filtro === "modelo") q = q.eq("modo", "completa");
  if (termo) q = q.ilike("rotulo", `%${termo}%`);
  const { data, error } = await q;
  if (!error) return { ok: true, itens: (data ?? []).flatMap((l) => itemDeModelo(l as Record<string, unknown>) ?? []), semRegistro: false };
  if (!ehTabelaAusente(error)) return { ok: false, motivo: error.message };
  const guardados = await modelosGuardados(supabase, termo, filtro, limite);
  return guardados.ok ? { ...guardados, semRegistro: true } : guardados;
}

/**
 * Sem o registro (migração não aplicada): os modelos que têm mês guardado em
 * `fipe_historico`, um por modelo e ano. Sem quem nem custo; "completa" é quem
 * tem mais de um mês do ano escolhido.
 */
async function modelosGuardados(
  supabase: SupabaseClient,
  termo: string | null,
  filtro: FiltroDoHistorico,
  limite: number,
): Promise<{ ok: true; itens: ItemDoHistorico[] } | { ok: false; motivo: string }> {
  const { data, error } = await supabase
    .from("fipe_historico")
    .select("tipo, marca_codigo, modelo_codigo, ano, marca, modelo, referencia, valor, criado_em")
    .not("valor", "is", null)
    .order("criado_em", { ascending: false })
    .limit(2000);
  if (error) return ehTabelaAusente(error) ? { ok: true, itens: [] } : { ok: false, motivo: error.message };
  const grupos = new Map<string, { linhas: Array<Record<string, unknown>> }>();
  for (const l of (data ?? []) as Array<Record<string, unknown>>) {
    const chave = `${l.tipo}|${l.marca_codigo}|${l.modelo_codigo}|${l.ano}`;
    const g = grupos.get(chave) ?? { linhas: [] };
    g.linhas.push(l);
    grupos.set(chave, g);
  }
  const itens: ItemDoHistorico[] = [];
  const procura = termo?.toLocaleLowerCase("pt-BR") ?? null;
  for (const [chave, g] of grupos) {
    const maisNova = [...g.linhas].sort((a, b) => String(b.referencia).localeCompare(String(a.referencia)))[0];
    const modo = g.linhas.length > 1 ? "completa" : "pontual";
    if ((filtro === "fipe" && modo !== "pontual") || (filtro === "modelo" && modo !== "completa")) continue;
    const titulo = `${[texto(maisNova.marca), texto(maisNova.modelo)].filter(Boolean).join(" ") || "Modelo"} ${String(maisNova.ano).slice(0, 4)}`;
    if (procura && !titulo.toLocaleLowerCase("pt-BR").includes(procura)) continue;
    const quando = g.linhas.map((l) => String(l.criado_em)).sort().reverse()[0];
    const fipe = numero(maisNova.valor);
    itens.push({
      chave: `g:${chave}`,
      tipo: modo === "pontual" ? "fipe" : "modelo",
      quando,
      quem: null,
      titulo,
      detalhe: [fipe !== null ? `FIPE ${reais(fipe)}` : null, mesDaReferencia(String(maisNova.referencia)), modo === "completa" ? `${g.linhas.length} meses` : null]
        .filter(Boolean)
        .join(" · "),
      custo: null,
      homologacao: false,
      abrir: { tipo: "modelo", modo, marca: String(maisNova.marca_codigo), modelo: String(maisNova.modelo_codigo), ano: String(maisNova.ano) },
    });
  }
  return { ok: true, itens: itens.sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, limite) };
}

async function lerPlacas(
  supabase: SupabaseClient,
  termo: string | null,
  limite: number,
): Promise<{ ok: true; itens: ItemDoHistorico[] } | { ok: false; motivo: string }> {
  // Duas perguntas em vez de um `or`: o termo pode ter ponto ("1.4"), que o `or` do PostgREST lê como sintaxe.
  const base = () => supabase.from("consultas_de_placa").select(COLUNAS_DE_PLACA).order("criado_em", { ascending: false }).limit(limite);
  const perguntas = termo
    ? [base().ilike("placa", `%${termo.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || termo}%`), base().ilike("retrato->veiculo->>descricao", `%${termo}%`)]
    : [base()];
  const respostas = await Promise.all(perguntas);
  const erro = respostas.find((r) => r.error)?.error;
  if (erro) return ehTabelaAusente(erro) ? { ok: true, itens: [] } : { ok: false, motivo: erro.message };
  const vistas = new Set<string>();
  const itens: ItemDoHistorico[] = [];
  for (const r of respostas) {
    for (const l of (r.data ?? []) as Array<Record<string, unknown>>) {
      const item = itemDePlaca(l);
      if (!item || vistas.has(item.chave)) continue;
      vistas.add(item.chave);
      itens.push(item);
    }
  }
  return { ok: true, itens };
}

export async function lerHistoricoDeConsultas(
  supabase: SupabaseClient,
  pedido: { termo: string | null; filtro: FiltroDoHistorico; limite?: number },
): Promise<LeituraDoHistorico> {
  const limite = pedido.limite ?? ITENS_DO_HISTORICO;
  const [modelos, placas] = await Promise.all([
    pedido.filtro === "placa" ? Promise.resolve({ ok: true as const, itens: [], semRegistro: false }) : lerModelos(supabase, pedido.termo, pedido.filtro, limite),
    pedido.filtro === "fipe" || pedido.filtro === "modelo" ? Promise.resolve({ ok: true as const, itens: [] }) : lerPlacas(supabase, pedido.termo, limite),
  ]);
  if (!modelos.ok) return { ok: false, motivo: `Não deu para ler as consultas de modelo: ${modelos.motivo}` };
  if (!placas.ok) return { ok: false, motivo: `Não deu para ler as consultas de placa: ${placas.motivo}` };
  return { ok: true, itens: juntarHistorico([modelos.itens, placas.itens], limite), semRegistroDeModelo: modelos.semRegistro };
}
