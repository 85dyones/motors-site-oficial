/**
 * A consulta de placa por nível — a rede, o banco e o aprofundar. Só
 * servidor. O catálogo e os leitores estão em `niveisDaPlaca.ts`.
 *
 * Mesmas regras do Veículos Total (`apiBrasil.ts`): erro chega com HTTP 200,
 * NÃO há nova tentativa (repetir cobra de novo), 402 é falta de saldo,
 * `homolog: true` só no modo de teste. Os produtos do nível vão ao mesmo
 * tempo.
 *
 * Aprofundar: a partir de uma consulta guardada da mesma placa (no mesmo modo
 * do fornecedor e com até `dias_para_aprofundar` de idade), os fragmentos já
 * comprados são reaproveitados e só os produtos que faltam são pagos.
 *
 * A gravação é a de sempre (cliente de sessão, RLS de inclusão dos três
 * papéis), agora com o nível, os produtos, os fragmentos (sem dado pessoal) e
 * as tentativas.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ESPERA_DA_APIBRASIL_MS, APIBRASIL_CONSULTA_DE_VEICULOS, consultarVeiculosTotal, type BuscarNaApiBrasil } from "./apiBrasil";
import { lerRespostaDaApiBrasil, mesclarGratuito, numeroDoFornecedor, type RetratoDaConsulta } from "./consultaDePlaca";
import { ehTabelaAusente, linhaParaConsulta, type ConsultaGuardada } from "./consultaDePlaca-servidor";
import { consultarGratuito } from "./consultaGratuita";
import {
  LEITORES_DA_PLACA,
  NIVEIS_DA_PLACA,
  PRODUTOS_DA_PLACA,
  lerChamadaDaPlaca,
  montarRetratoPorNivel,
  nivelDaPlaca,
  ordemDoNivel,
  precoDosProdutos,
  produtosQueFaltam,
  type ChamadaDaPlaca,
  type FragmentosDaPlaca,
  type NivelDaPlaca,
  type PrecosDaPlaca,
  type ProdutoDeVeiculo,
} from "./niveisDaPlaca";

export const MIGRACAO_DOS_NIVEIS_DA_PLACA = "20261019120000_niveis_da_consulta_de_placa";
/** O valor de `consultas_de_placa.produto` nas consultas por nível (o completo continua 'veiculos-total'). */
export const PRODUTO_DAS_CONSULTAS_POR_NIVEL = "niveis";

const DIA_MS = 86_400_000;
/**
 * A idade da guardada é conferida antes de pagar, e o gatilho do banco a
 * confere de novo na gravação, até a espera do fornecedor depois. A folga
 * evita pagar e ter a gravação recusada na borda do prazo.
 */
const FOLGA_DO_PRAZO_MS = ESPERA_DA_APIBRASIL_MS + 5 * 60_000;
const dentroDoPrazo = (criadoEm: string, dias: number, agora: Date) => agora.getTime() - new Date(criadoEm).getTime() + FOLGA_DO_PRAZO_MS <= dias * DIA_MS;

// ─────────────────────────────────────────────────────────────────────────────
// Os parâmetros
// ─────────────────────────────────────────────────────────────────────────────

export interface ParametrosDaPlaca {
  precos: PrecosDaPlaca;
  tabelaDePrecosEm: string;
  diasParaAprofundar: number;
  minutosContraRepeticao: number;
}

export type LeituraDosParametrosDaPlaca = { ok: true; parametros: ParametrosDaPlaca } | { ok: false; faltaMigracao: boolean; motivo: string };

export async function lerParametrosDaPlaca(supabase: SupabaseClient): Promise<LeituraDosParametrosDaPlaca> {
  const { data, error } = await supabase
    .from("parametros_consulta_veiculo")
    .select("precos_de_referencia, tabela_de_precos_em, dias_para_aprofundar, minutos_contra_repeticao")
    .is("vigencia_ate", null)
    .maybeSingle();
  if (error) return { ok: false, faltaMigracao: ehTabelaAusente(error), motivo: "Não deu para ler os parâmetros da consulta de veículos." };
  if (!data) return { ok: false, faltaMigracao: false, motivo: "Não há parâmetros vigentes da consulta de veículos (parametros_consulta_veiculo)." };
  const l = data as Record<string, unknown>;
  const precos: PrecosDaPlaca = {};
  const brutos = l.precos_de_referencia && typeof l.precos_de_referencia === "object" ? (l.precos_de_referencia as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(brutos)) {
    const n = numeroDoFornecedor(v);
    if (n !== null && Object.prototype.hasOwnProperty.call(PRODUTOS_DA_PLACA, k)) precos[k as ProdutoDeVeiculo] = n;
  }
  return {
    ok: true,
    parametros: {
      precos,
      tabelaDePrecosEm: String(l.tabela_de_precos_em),
      diasParaAprofundar: Number(l.dias_para_aprofundar),
      minutosContraRepeticao: Number(l.minutos_contra_repeticao),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// O que a tela mostra antes de cobrar
// ─────────────────────────────────────────────────────────────────────────────

export interface NivelComPrecoDaPlaca {
  id: NivelDaPlaca;
  rotulo: string;
  traz: string;
  deixaDeFora: string | null;
  nomesDosProdutos: string[];
  preco: number | null;
}

export interface AprofundarDaPlaca {
  nivel: NivelDaPlaca;
  /** O id da guardada a reaproveitar; `null` quando ela não serve (velha, ou de outro modo do fornecedor) e subir é o nível inteiro. */
  aprofundarDe: string | null;
  rotulo: string;
  /** Os produtos que serão pagos agora. */
  nomesDosProdutos: string[];
  preco: number | null;
  /** Quantos produtos da consulta guardada são reaproveitados. */
  reaproveitados: number;
}

export function niveisComPreco(precos: PrecosDaPlaca): NivelComPrecoDaPlaca[] {
  return NIVEIS_DA_PLACA.map((n) => ({
    id: n.id,
    rotulo: n.rotulo,
    traz: n.traz,
    deixaDeFora: n.deixaDeFora,
    nomesDosProdutos: n.produtos.map((p) => PRODUTOS_DA_PLACA[p].nome),
    preco: precoDosProdutos(n.produtos, precos),
  }));
}

/** O nível e os produtos de uma consulta guardada; as antigas (sem nível) são Veículos Total. */
export function nivelDaGuardada(c: ConsultaGuardada): { nivel: NivelDaPlaca; produtos: ProdutoDeVeiculo[] } {
  return { nivel: c.nivel ?? c.retrato.nivel ?? "completo", produtos: c.produtos ?? ["veiculos-total"] };
}

/**
 * Para onde a consulta guardada pode subir, e quanto custa cada degrau. Só
 * reaproveita a consulta do mesmo modo do fornecedor e dentro da idade dos
 * parâmetros; fora disso, subir é consultar o nível inteiro de novo.
 */
export function opcoesDeAprofundar(c: ConsultaGuardada, parametros: ParametrosDaPlaca, homologacaoAtual: boolean, agora = new Date()): AprofundarDaPlaca[] {
  const { nivel, produtos } = nivelDaGuardada(c);
  const reaproveita = c.id !== null && c.homologacao === homologacaoAtual && dentroDoPrazo(c.criadoEm, parametros.diasParaAprofundar, agora) && Boolean(c.fragmentos);
  const jaTem = reaproveita ? produtos.filter((p) => p === "veiculos-total" || (c.fragmentos as Record<string, unknown>)[p] !== undefined) : [];
  return NIVEIS_DA_PLACA.filter((n) => ordemDoNivel(n.id) > ordemDoNivel(nivel)).map((n) => {
    const faltam = produtosQueFaltam(n.id, jaTem);
    const reaproveitados = n.produtos.length - faltam.length;
    return {
      nivel: n.id,
      aprofundarDe: reaproveitados > 0 ? c.id : null,
      rotulo: n.rotulo,
      nomesDosProdutos: faltam.map((p) => PRODUTOS_DA_PLACA[p].nome),
      preco: precoDosProdutos(faltam, parametros.precos),
      reaproveitados,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// A rede: um produto, uma chamada
// ─────────────────────────────────────────────────────────────────────────────

export async function consultarProdutoDaPlaca(
  produto: Exclude<ProdutoDeVeiculo, "veiculos-total">,
  placa: string,
  opcoes: { token: string; homologacao: boolean; buscar?: BuscarNaApiBrasil },
): Promise<ChamadaDaPlaca> {
  const buscar: BuscarNaApiBrasil = opcoes.buscar ?? ((url, init) => fetch(url, { ...init, cache: "no-store" }));
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), ESPERA_DA_APIBRASIL_MS);
  try {
    const r = await buscar(APIBRASIL_CONSULTA_DE_VEICULOS, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opcoes.token}` },
      // A doc pede para tirar `homolog` em produção: só vai no teste.
      body: JSON.stringify({ tipo: produto, placa, ...(opcoes.homologacao ? { homolog: true } : {}) }),
      signal: controle.signal,
    });
    return lerChamadaDaPlaca(r.status, await r.json().catch(() => null), produto);
  } catch (erro) {
    const estourou = (erro as Error)?.name === "AbortError";
    return {
      ok: false,
      status: null,
      motivo: estourou ? "a APIBrasil não respondeu a tempo; a consulta PODE ter sido cobrada" : "não deu para falar com a APIBrasil; a consulta PODE ter sido cobrada",
      daConta: false,
      podeTerCobrado: true,
      custo: null,
    };
  } finally {
    clearTimeout(relogio);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A consulta inteira
// ─────────────────────────────────────────────────────────────────────────────

export interface TentativaDaPlaca {
  produto: ProdutoDeVeiculo;
  ok: boolean;
  status: number | null;
  motivo: string | null;
  pode_ter_cobrado: boolean;
  custo: number | null;
  reaproveitado: boolean;
}

export type ResultadoDaPlaca =
  | { ok: true; consulta: ConsultaGuardada; /** Ficou no banco. */ gravada: boolean; avisos: string[]; saldo: number | null }
  | { ok: false; status: 400 | 402 | 404 | 502 | 503 | 504; motivo: string; podeTerCobrado: boolean }
  | { ok: false; status: 409; motivo: string; repeticao: ConsultaGuardada };

const COLUNAS = "id, placa, nivel, produtos, fragmentos, retrato, custo, homologacao, criado_em, consultado_por_nome";

/** O custo do que foi pago agora. Em teste é zero; produto que pode ter cobrado sem dizer quanto deixa a soma desconhecida. */
export function custoDasTentativas(tentativas: TentativaDaPlaca[], homologacao: boolean): number | null {
  if (homologacao) return 0;
  let soma = 0;
  for (const t of tentativas) {
    if (t.reaproveitado) continue;
    if (t.custo !== null) soma += t.custo;
    else if (t.ok || t.pode_ter_cobrado) return null;
  }
  return Math.round(soma * 100) / 100;
}

/**
 * Consulta uma placa num nível. Com `aprofundarDe`, reaproveita os fragmentos
 * daquela consulta e paga só o que falta. Antes de pagar, recusa (409) o mesmo
 * nível da mesma placa consultado há pouco, a menos que venha `repetir`.
 */
export async function consultarPlacaPorNivel(
  supabase: SupabaseClient,
  pedido: { placa: string; nivel: NivelDaPlaca; aprofundarDe?: string | null; repetir?: boolean },
  deps: { token: string; homologacao: boolean; parametros: ParametrosDaPlaca; buscar?: BuscarNaApiBrasil; agora?: () => Date },
): Promise<ResultadoDaPlaca> {
  const nivel = nivelDaPlaca(pedido.nivel);
  if (!nivel) return { ok: false, status: 400, motivo: "Escolha o nível da consulta.", podeTerCobrado: false };
  const agora = deps.agora?.() ?? new Date();

  // ── A trava contra repetição (fecha no erro) ──
  if (!pedido.repetir && deps.parametros.minutosContraRepeticao > 0) {
    const desde = new Date(agora.getTime() - deps.parametros.minutosContraRepeticao * 60000).toISOString();
    const { data, error } = await supabase
      .from("consultas_de_placa")
      .select(COLUNAS)
      .eq("placa", pedido.placa)
      .eq("nivel", nivel.id)
      .eq("homologacao", deps.homologacao)
      .gte("criado_em", desde)
      .order("criado_em", { ascending: false })
      .limit(1);
    if (error) return { ok: false, status: 503, motivo: "Não deu para conferir se esta placa foi consultada há pouco; nada foi cobrado. Tente de novo em instantes.", podeTerCobrado: false };
    const anterior = linhaParaConsulta(data?.[0]);
    if (anterior) {
      return {
        ok: false,
        status: 409,
        motivo: `${pedido.placa} foi consultada no nível ${nivel.rotulo} há menos de ${deps.parametros.minutosContraRepeticao} minutos. Abra a guardada, ou confirme para pagar de novo.`,
        repeticao: anterior,
      };
    }
  }

  // ── O completo: o Veículos Total, como sempre ──
  if (nivel.id === "completo") return consultarCompleto(supabase, pedido.placa, deps);

  // ── O que já foi comprado ──
  let base: ConsultaGuardada | null = null;
  if (pedido.aprofundarDe) {
    if (!/^[0-9a-f-]{36}$/i.test(pedido.aprofundarDe)) return { ok: false, status: 404, motivo: "A consulta a aprofundar não foi encontrada.", podeTerCobrado: false };
    const { data, error } = await supabase.from("consultas_de_placa").select(COLUNAS).eq("id", pedido.aprofundarDe).maybeSingle();
    if (error) return { ok: false, status: 503, motivo: "Não deu para ler a consulta a aprofundar; nada foi cobrado.", podeTerCobrado: false };
    base = linhaParaConsulta(data);
    if (!base || base.placa !== pedido.placa) return { ok: false, status: 404, motivo: "A consulta a aprofundar não é desta placa.", podeTerCobrado: false };
    if (base.homologacao !== deps.homologacao || !dentroDoPrazo(base.criadoEm, deps.parametros.diasParaAprofundar, agora)) {
      return {
        ok: false,
        status: 400,
        motivo: `A consulta guardada tem mais de ${deps.parametros.diasParaAprofundar} dias (ou é de outro modo do fornecedor): os dados dela não servem para aprofundar. Consulte o nível inteiro.`,
        podeTerCobrado: false,
      };
    }
  }
  const herdados: FragmentosDaPlaca = {};
  const reaproveitados: ProdutoDeVeiculo[] = [];
  for (const p of nivel.produtos) {
    const f = (base?.fragmentos as Record<string, unknown> | undefined)?.[p];
    if (f && typeof f === "object") {
      (herdados as Record<string, unknown>)[p] = f;
      reaproveitados.push(p);
    }
  }
  const comprar = nivel.produtos.filter((p) => !reaproveitados.includes(p)) as Array<Exclude<ProdutoDeVeiculo, "veiculos-total">>;
  // Nada a comprar é reabrir, não consultar (o banco também recusa uma linha sem chamada ao fornecedor).
  if (comprar.length === 0) return { ok: false, status: 400, motivo: "A consulta guardada já tem tudo deste nível: abra a guardada.", podeTerCobrado: false };

  // ── Os produtos que faltam, todos de uma vez ──
  const chamadas = await Promise.all(comprar.map(async (produto) => ({ produto, chamada: await consultarProdutoDaPlaca(produto, pedido.placa, deps) })));
  const fragmentos: FragmentosDaPlaca = { ...herdados };
  const falharam: ProdutoDeVeiculo[] = [];
  const tentativas: TentativaDaPlaca[] = reaproveitados.map((p) => ({ produto: p, ok: true, status: null, motivo: null, pode_ter_cobrado: false, custo: null, reaproveitado: true }));
  const avisos: string[] = [];
  for (const { produto, chamada } of chamadas) {
    let motivo: string | null = chamada.ok ? null : chamada.motivo;
    if (chamada.ok) {
      const leitura = LEITORES_DA_PLACA[produto](chamada.dados);
      // A Base Estadual diz a placa: fora do teste, resposta de outra placa não entra.
      const placaDaResposta = produto === "estadual" ? String((chamada.dados as { bin_estadual?: { placa?: unknown } } | null)?.bin_estadual?.placa ?? "").toUpperCase() : "";
      // Resposta de teste com o painel em produção: o carro de exemplo nunca entra numa placa real.
      if (chamada.homologacao && !deps.homologacao) motivo = "respondeu em modo de teste (dados de exemplo)";
      else if (!leitura) motivo = "respondeu sem os dados esperados";
      else if (produto === "estadual" && !deps.homologacao && !chamada.homologacao && placaDaResposta && placaDaResposta !== pedido.placa) motivo = `respondeu sobre outra placa (${placaDaResposta})`;
      else (fragmentos as Record<string, unknown>)[produto] = leitura;
    }
    const ok = motivo === null;
    if (!ok) falharam.push(produto);
    const podeTerCobrado = chamada.ok ? true : chamada.podeTerCobrado;
    tentativas.push({ produto, ok, status: chamada.ok ? 200 : chamada.status, motivo, pode_ter_cobrado: podeTerCobrado, custo: chamada.custo, reaproveitado: false });
    if (!ok) avisos.push(`${PRODUTOS_DA_PLACA[produto].nome}: ${motivo}.${podeTerCobrado && !deps.homologacao ? " Pode ter sido cobrado: confira o saldo no painel da APIBrasil antes de consultar de novo." : ""}`);
  }

  const algumVeio = Object.keys(fragmentos).length > 0;
  if (!algumVeio) {
    const semSaldo = chamadas.some(({ chamada }) => !chamada.ok && chamada.daConta && /saldo/.test(chamada.motivo));
    // Mesmo sem saldo, outro produto chamado junto pode ter estourado o tempo e cobrado.
    const podeTerCobrado = !deps.homologacao && tentativas.some((t) => !t.reaproveitado && t.pode_ter_cobrado);
    return semSaldo
      ? {
          ok: false,
          status: 402,
          motivo: `A conta da APIBrasil está sem saldo. Ponha crédito no painel deles e consulte de novo.${podeTerCobrado ? " Algum produto pode ter sido cobrado antes: confira o saldo." : ""}`,
          podeTerCobrado,
        }
      : { ok: false, status: 502, motivo: `A consulta não voltou. ${avisos.join(" ")}`, podeTerCobrado };
  }

  const montado = montarRetratoPorNivel(pedido.placa, nivel.id, fragmentos, falharam);
  const gratuito = await consultarGratuito({ cnpj: montado.primeiroFaturamento.cnpj, codigoFipe: montado.fipe?.codigo ?? null, anoModelo: montado.veiculo.anoModelo });
  const retrato = mesclarGratuito(montado, gratuito);
  const custo = custoDasTentativas(tentativas, deps.homologacao);
  const produtos = nivel.produtos.filter((p) => (fragmentos as Record<string, unknown>)[p] !== undefined);

  return gravar(supabase, {
    placa: pedido.placa,
    produto: PRODUTO_DAS_CONSULTAS_POR_NIVEL,
    nivel: nivel.id,
    produtos,
    fragmentos,
    tentativas,
    retrato,
    custo,
    homologacao: deps.homologacao,
    aproveitouDe: reaproveitados.length > 0 ? (base?.id ?? null) : null,
    avisos,
    saldo: null,
  });
}

async function consultarCompleto(supabase: SupabaseClient, placa: string, deps: { token: string; homologacao: boolean; buscar?: BuscarNaApiBrasil }): Promise<ResultadoDaPlaca> {
  const rede = await consultarVeiculosTotal(placa, deps);
  if (!rede.ok) return { ok: false, status: rede.status, motivo: rede.motivo, podeTerCobrado: rede.podeTerCobrado };
  const leitura = lerRespostaDaApiBrasil(rede.corpo, placa);
  if (!leitura.ok) return { ok: false, status: 502, motivo: leitura.motivo, podeTerCobrado: false };
  const gratuito = await consultarGratuito({ cnpj: leitura.retrato.primeiroFaturamento.cnpj, codigoFipe: leitura.retrato.fipe?.codigo ?? null, anoModelo: leitura.retrato.veiculo.anoModelo });
  const retrato = mesclarGratuito({ ...leitura.retrato, nivel: "completo" }, gratuito);
  return gravar(supabase, {
    placa,
    produto: "veiculos-total",
    nivel: "completo",
    produtos: ["veiculos-total"],
    fragmentos: {},
    tentativas: [{ produto: "veiculos-total", ok: true, status: 200, motivo: null, pode_ter_cobrado: true, custo: leitura.custo, reaproveitado: false }],
    retrato,
    custo: leitura.homologacao ? 0 : leitura.custo,
    homologacao: leitura.homologacao,
    aproveitouDe: null,
    avisos: [],
    saldo: leitura.saldo,
  });
}

/** Grava. Se a gravação falhar, o retrato volta assim mesmo: a consulta já foi paga. */
async function gravar(
  supabase: SupabaseClient,
  d: {
    placa: string;
    produto: string;
    nivel: NivelDaPlaca;
    produtos: ProdutoDeVeiculo[];
    fragmentos: FragmentosDaPlaca;
    tentativas: TentativaDaPlaca[];
    retrato: RetratoDaConsulta;
    custo: number | null;
    homologacao: boolean;
    aproveitouDe: string | null;
    avisos: string[];
    saldo: number | null;
  },
): Promise<ResultadoDaPlaca> {
  const { data, error } = await supabase
    .from("consultas_de_placa")
    .insert({
      placa: d.placa,
      produto: d.produto,
      nivel: d.nivel,
      produtos: d.produtos,
      fragmentos: d.fragmentos,
      tentativas: d.tentativas,
      retrato: d.retrato,
      custo: d.custo,
      homologacao: d.homologacao,
      aproveitou_de: d.aproveitouDe,
    })
    .select(COLUNAS)
    .single();
  const consulta = error ? null : linhaParaConsulta(data);
  if (!consulta) {
    console.error("[Consulta de placa] a consulta foi paga e não foi gravada:", error?.code, error?.message);
    return {
      ok: true,
      gravada: false,
      saldo: d.saldo,
      avisos: [
        ...d.avisos,
        error && ehTabelaAusente(error)
          ? `A consulta foi feita, mas não ficou guardada: falta a migração ${MIGRACAO_DOS_NIVEIS_DA_PLACA}. Não feche esta tela: abrir a placa de novo vai cobrar outra vez.`
          : "A consulta foi feita e cobrada, mas NÃO foi guardada. Não feche esta tela: abrir a placa de novo vai cobrar outra vez.",
      ],
      consulta: {
        id: null,
        placa: d.placa,
        nivel: d.nivel,
        produtos: d.produtos,
        fragmentos: {},
        retrato: d.retrato,
        custo: d.custo,
        homologacao: d.homologacao,
        criadoEm: new Date().toISOString(),
        consultadoPor: null,
      },
    };
  }
  return { ok: true, consulta, gravada: true, avisos: d.avisos, saldo: d.saldo };
}
