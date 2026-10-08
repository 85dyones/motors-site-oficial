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
  foraDoPlano,
  lerReferencias,
  lerValorDaFipe,
  montarMercado,
  planoDeBusca,
  type Busca,
  type LinhaDoHistorico,
  type MercadoDoModelo,
  type PedidoDeModelo,
  type ReferenciaDaFipe,
  type ValorDaFipe,
} from "./mercadoPorModelo";
import { FIPE_V2 } from "./fipeNoServidor";
import type { LeituraPaga } from "./apiBrasilFipe";

export const MIGRACAO_DO_HISTORICO_DA_FIPE = "20261006190000_fipe_historico";

/** Quantas chamadas à FIPE correm ao mesmo tempo. */
const CHAMADAS_SIMULTANEAS = 3;

/**
 * Depois de quantas falhas SEGUIDAS a fila para. A FIPE, quando corta, nem
 * sempre responde 429 (em 07/10/2026, sem token, quatro meses vieram e os 22
 * seguintes falharam): insistir só gasta o que resta do teto.
 */
const FALHAS_SEGUIDAS_QUE_PARAM = 4;

/** Por quanto tempo a lista de meses de referência vale em memória. */
const VALIDADE_DAS_REFERENCIAS_MS = 6 * 60 * 60 * 1000;

let referenciasEmMemoria: { em: number; lista: ReferenciaDaFipe[] } | null = null;

/**
 * O mês mais novo que a FIPE recusou com 402 (fora do plano). Fica em memória
 * pelo mesmo tempo que a lista de meses: depois disso, uma chamada confere de
 * novo, e assinar o plano pago passa a valer sem mexer em código.
 */
let corteEmMemoria: { em: number; chave: string } | null = null;

/** Só para os testes: cada um começa sem a lista e sem o corte em memória. */
export function esquecerReferencias(): void {
  referenciasEmMemoria = null;
  corteEmMemoria = null;
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
  | { tipo: "foraDoPlano"; busca: Busca }
  | { tipo: "falha"; porque: string };

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
    // 402: o mês existe, mas o plano da FIPE não libera. Não é falha de rede e
    // não passa insistindo: só o plano pago traz.
    if (r.status === 402) return { tipo: "foraDoPlano", busca };
    // 404: naquele mês a FIPE ainda não tinha este ano-modelo. É resposta, e
    // fica guardada como "sem valor" para não ser perguntada de novo.
    if (r.status === 404) return { tipo: "valor", busca, linha: vazia(null) };
    if (!r.ok) return { tipo: "falha", porque: `respondeu ${r.status}` };
    const v = lerValorDaFipe(await r.json());
    return v ? { tipo: "valor", busca, linha: vazia(v.valor, v) } : { tipo: "falha", porque: "veio num formato inesperado" };
  } catch (erro) {
    return { tipo: "falha", porque: (erro as Error)?.name === "TimeoutError" ? "não respondeu a tempo" : "não respondeu" };
  }
}

export interface BancoDoHistorico {
  ler: (pedido: PedidoDeModelo, desde: string) => Promise<{ ok: true; linhas: LinhaDoHistorico[] } | { ok: false; faltaMigracao: boolean; motivo: string }>;
  gravar: (pedido: PedidoDeModelo, linhas: LinhaDoHistorico[]) => Promise<{ ok: boolean; motivo?: string }>;
}

/**
 * Os dois modos da análise por modelo (dono, 08/10/2026):
 *  - `pontual`: grátis. Só o mês corrente do ano escolhido e dos vizinhos, na
 *    FIPE pública. Responde "quanto vale hoje" e "quanto custa um ano de idade".
 *  - `completa`: paga. A série de 24 meses. O que a FIPE pública entrega vem
 *    dela, de graça; os meses que o plano gratuito corta (402) vêm da Tabela
 *    FIPE da APIBrasil (`apiBrasilFipe.ts`), a R$ 0,06 por mês.
 */
export type ModoDaAnalise = "pontual" | "completa";

/** O leitor pago, montado pela rota. `null` quando o ambiente não tem APIBRASIL_TOKEN. */
export interface LeitorPago {
  ler: (busca: Busca) => Promise<LeituraPaga>;
  /** Homologação: o fornecedor devolve um carro de exemplo e não cobra. Nada disso é tabela. */
  homologacao: boolean;
}

/** Depois de quantas falhas pagas SEGUIDAS a fila paga para: cada uma pode ter sido cobrada. */
const FALHAS_PAGAS_QUE_PARAM = 3;

/**
 * Quanto tempo a leitura pode andar antes de parar de pedir meses. Bem abaixo
 * do `maxDuration` da rota (60 s): a função encerrada no meio perderia o que
 * já foi cobrado e não gravado, e a próxima análise cobraria de novo.
 */
const PRAZO_DA_LEITURA_MS = 40000;

/** De quantas em quantas linhas novas a leitura grava: o que foi pago fica guardado mesmo se ela parar. */
const GRAVAR_A_CADA = 6;

export type ResultadoDoMercado =
  | { ok: true; mercado: MercadoDoModelo; chamadas: number; chamadasPagas: number; mesesPagosGuardados: number; avisos: string[] }
  | { ok: false; status: 502 | 429; motivo: string };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeDoMes = (r: ReferenciaDaFipe) => `${MESES[r.mes - 1] ?? r.mes}/${r.ano}`;

export async function consultarMercado(
  pedido: PedidoDeModelo,
  deps: { buscar: BuscarNaFipe; token: string | undefined; banco: BancoDoHistorico; modo?: ModoDaAnalise; pago?: LeitorPago | null; prazoMs?: number },
): Promise<ResultadoDoMercado> {
  // Sem modo dito, a grátis: ninguém paga por omissão.
  const modo = deps.modo ?? "pontual";
  const inicio = Date.now();
  const noPrazo = () => Date.now() - inicio < (deps.prazoMs ?? PRAZO_DA_LEITURA_MS);
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
  // A paga só roda com o histórico lido e gravável: sem ele, cobraria de novo
  // meses já guardados, e o que viesse agora também não ficaria.
  const pago = modo === "completa" && guardado.ok ? (deps.pago ?? null) : null;
  if (modo === "completa" && deps.pago && !guardado.ok) {
    avisos.push(
      guardado.faltaMigracao
        ? `A consulta paga não roda sem a tabela do histórico (migração ${MIGRACAO_DO_HISTORICO_DA_FIPE}): o que ela trouxesse não ficaria guardado e seria cobrado de novo.`
        : "A consulta paga não rodou: sem o histórico guardado ela cobraria de novo meses já pagos. Analise de novo em instantes.",
    );
  }

  // Só o que falta, em poucas chamadas por vez. Um 429 para a fila: insistir
  // contra o limite só queima o teto de amanhã.
  const agora = Date.now();
  let corte = corteEmMemoria && agora - corteEmMemoria.em < VALIDADE_DAS_REFERENCIAS_MS ? corteEmMemoria.chave : null;
  // A fila inteira, sem o corte: quem pula é o trabalhador, olhando o corte da hora. Se o
  // mês corrente vier com valor, o corte cai e os meses anteriores entram nesta mesma leitura.
  const chaveAtual = referencias[0] ? chaveDaReferencia(referencias[0]) : null;
  const planoInteiro = planoDeBusca(pedido, referencias, linhas);
  // Pontual: só o mês corrente (o ano escolhido e os vizinhos). A série é da consulta completa.
  const fila = modo === "pontual" ? planoInteiro.filter((b) => chaveDaReferencia(b.referencia) === chaveAtual) : planoInteiro;
  const novas: LinhaDoHistorico[] = [];
  // Grava em lotes, durante a leitura: o que foi pago fica guardado mesmo que ela pare no meio.
  const pendentes: LinhaDoHistorico[] = [];
  const pagas = new Set<LinhaDoHistorico>();
  let mesesPagosGuardados = 0;
  let falhouAoGravar = false;
  const guardar = async (tudo: boolean) => {
    if (!guardado.ok || pendentes.length === 0 || (!tudo && pendentes.length < GRAVAR_A_CADA)) return;
    const lote = pendentes.splice(0);
    const gravacao = await deps.banco.gravar(pedido, lote);
    if (!gravacao.ok) {
      falhouAoGravar = true;
      // O que viesse depois também não ficaria: a paga para em vez de cobrar o que se perde.
      pagoParado ??= "A consulta paga parou: o banco não guardou os meses que chegaram, e os próximos seriam cobrados para nada.";
    }
    else mesesPagosGuardados += lote.filter((l) => pagas.has(l) && l.valor !== null).length;
  };
  const nova = async (l: LinhaDoHistorico, paga = false) => {
    novas.push(l);
    pendentes.push(l);
    if (paga) pagas.add(l);
    await guardar(false);
  };
  let estourouOPrazo = false;
  let chamadas = 0;
  let falhas = 0;
  let seguidas = 0;
  const motivos = new Map<string, number>();
  let limite = false;
  let proxima = 0;
  // A fila vai do mês mais novo para trás: o resto dela, depois de um 402, também está fora do plano.
  // O mês corrente nunca é pulado: custa uma chamada e é por ele que se percebe o plano de volta.
  const pulaPeloCorte = (b: Busca) => corte !== null && chaveDaReferencia(b.referencia) !== chaveAtual && foraDoPlano(b.referencia, corte);
  // O corte só é regravado (e o prazo de 6h só recomeça) quando um 402 ou um valor novo o muda NESTA leitura.
  let corteMudou = false;

  // A parte paga só começa com o valor de HOJE do ano escolhido em mãos: sem ele
  // não há análise, e meses pagos não serviriam para nada. Quem resolve é a
  // leitura do mês corrente (o primeiro da fila), ou o que já estava guardado.
  const guardadoHoje = linhas.find((l) => l.ano === pedido.ano && l.referencia === chaveAtual);
  let liberarAPaga: (ok: boolean) => void = () => {};
  const temValorDeHoje: Promise<boolean> = guardadoHoje
    ? Promise.resolve(guardadoHoje.valor !== null)
    : new Promise((resolver) => (liberarAPaga = resolver));
  const ehOMesDeHoje = (b: Busca) => b.ano === pedido.ano && chaveDaReferencia(b.referencia) === chaveAtual;
  // O código FIPE do carro de hoje: mês pago com outro código é outro carro (ou o de exemplo do fornecedor).
  let codigoDeHoje: string | null = guardadoHoje?.codigoFipe ?? null;

  // A parte paga: só meses que o plano gratuito corta, e só na consulta completa.
  let chamadasPagas = 0;
  let naoTinhaSeguidos = 0;
  let paradoPorNaoTinha = false;
  let pagosComValor = 0;
  let conferidosEmTeste = 0;
  let falhasPagas = 0;
  let seguidasPagas = 0;
  let pagoParado: string | null = null;
  const motivosPagos = new Map<string, number>();
  const semValorPago: LinhaDoHistorico[] = [];
  const lerPago = async (busca: Busca) => {
    if (!pago || pagoParado) return;
    if (!(await temValorDeHoje)) return;
    if (!noPrazo()) {
      estourouOPrazo = true;
      return;
    }
    const r = await pago.ler(busca);
    // Sem saldo e token recusado não são cobrados; o resto conta como chamada paga.
    if (r.tipo !== "sem_saldo" && r.tipo !== "sem_acesso") chamadasPagas++;
    const linha = (valor: number | null, v?: ValorDaFipe): LinhaDoHistorico => ({
      ano: busca.ano,
      referencia: chaveDaReferencia(busca.referencia),
      valor,
      marca: v?.marca ?? null,
      modelo: v?.modelo ?? null,
      combustivel: v?.combustivel ?? null,
      codigoFipe: v?.codigoFipe ?? null,
    });
    if (r.tipo === "valor" && !pago.homologacao && codigoDeHoje && r.valor.codigoFipe && r.valor.codigoFipe !== codigoDeHoje) {
      falhasPagas++;
      seguidasPagas++;
      const porque = `respondeu outro carro (FIPE ${r.valor.codigoFipe})`;
      motivosPagos.set(porque, (motivosPagos.get(porque) ?? 0) + 1);
      if (seguidasPagas >= FALHAS_PAGAS_QUE_PARAM) pagoParado = `A APIBrasil ${porque} em ${FALHAS_PAGAS_QUE_PARAM} meses seguidos, e a consulta paga parou para não cobrar à toa.`;
    } else if (r.tipo === "valor") {
      seguidasPagas = 0;
      naoTinhaSeguidos = 0;
      // Em homologação o valor é de exemplo: confere o contrato, e não vira tabela.
      if (pago.homologacao) conferidosEmTeste++;
      else {
        pagosComValor++;
        await nova(linha(r.valor.valor, r.valor), true);
      }
    } else if (r.tipo === "sem_valor") {
      seguidasPagas = 0;
      if (!pago.homologacao) semValorPago.push(linha(null));
      // "Não tinha" em série antes de qualquer valor: o suspeito é o pedido, e cada um foi cobrado.
      if (pagosComValor === 0 && ++naoTinhaSeguidos >= FALHAS_PAGAS_QUE_PARAM) {
        paradoPorNaoTinha = true;
        pagoParado = `A APIBrasil respondeu "não tinha este carro" nos ${FALHAS_PAGAS_QUE_PARAM} primeiros meses pagos. Pode ser o pedido, e não o carro: a consulta paga parou e nada disso foi guardado.`;
      }
    } else if (r.tipo === "sem_saldo" || r.tipo === "sem_acesso") {
      pagoParado = r.motivo;
    } else {
      falhasPagas++;
      seguidasPagas++;
      motivosPagos.set(r.porque, (motivosPagos.get(r.porque) ?? 0) + 1);
      if (seguidasPagas >= FALHAS_PAGAS_QUE_PARAM) pagoParado = `A APIBrasil ${r.porque} em ${FALHAS_PAGAS_QUE_PARAM} meses seguidos, e a consulta paga parou para não cobrar à toa.`;
    }
  };

  const trabalhar = async () => {
    while (!limite && seguidas < FALHAS_SEGUIDAS_QUE_PARAM && proxima < fila.length) {
      if (!noPrazo()) {
        estourouOPrazo = true;
        // Ninguém fica esperando o mês de hoje que não vai chegar.
        liberarAPaga(false);
        break;
      }
      const busca = fila[proxima++];
      if (pulaPeloCorte(busca)) {
        await lerPago(busca);
        continue;
      }
      chamadas++;
      const leitura = await lerUmMes(pedido, busca, deps.buscar, deps.token);
      if (ehOMesDeHoje(busca)) {
        if (leitura.tipo === "valor") codigoDeHoje = leitura.linha.codigoFipe;
        liberarAPaga(leitura.tipo === "valor" && leitura.linha.valor !== null);
      }
      if (leitura.tipo === "limite") limite = true;
      else if (leitura.tipo === "foraDoPlano") {
        const chave = chaveDaReferencia(leitura.busca.referencia);
        if (corte === null || chave > corte) {
          corte = chave;
          corteMudou = true;
        }
        // O mês corrente nunca vai para a paga: sem ele a análise não existe, e o
        // problema é o token da FIPE, que a mensagem de baixo explica.
        if (chave !== chaveAtual) await lerPago(busca);
      }
      else if (leitura.tipo === "falha") {
        falhas++;
        seguidas++;
        motivos.set(leitura.porque, (motivos.get(leitura.porque) ?? 0) + 1);
      } else {
        seguidas = 0;
        await nova(leitura.linha);
        // Veio valor de um mês que o corte dava como fora do plano: o plano mudou, o corte cai.
        if (corte !== null && chaveDaReferencia(leitura.busca.referencia) <= corte) {
          corte = null;
          corteMudou = true;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CHAMADAS_SIMULTANEAS, fila.length) }, trabalhar));
  liberarAPaga(false);

  // "Não tinha o carro neste mês" pago só fica guardado se a mesma leitura trouxe
  // algum valor pago: se TODAS dizem "não tinha", o suspeito é o pedido, e guardar
  // esconderia esses meses para sempre.
  // Parada por "não tinha" em série não guarda os "não tinha", mesmo que um valor atrasado tenha chegado depois.
  if (semValorPago.length > 0 && pagosComValor > 0 && !paradoPorNaoTinha) for (const l of semValorPago) await nova(l, true);
  else if (semValorPago.length > 0 && !pagoParado) {
    falhasPagas += semValorPago.length;
    motivosPagos.set("disse que não tinha o carro", semValorPago.length);
  }
  await guardar(true);
  if (falhouAoGravar) avisos.push("Parte dos meses lidos agora não pôde ser guardada; a próxima abertura vai buscá-los de novo.");
  linhas.push(...novas);

  if (corteMudou) corteEmMemoria = corte === null ? null : { em: agora, chave: corte };

  const mercado = montarMercado(pedido, referencias, linhas, corte);
  if (!mercado) {
    if (corte !== null && referencias[0] && foraDoPlano(referencias[0], corte)) {
      return { ok: false, status: 502, motivo: "A FIPE recusou o mês corrente por plano (402): o token da loja perdeu acesso à tabela. Confira a assinatura em fipe.api.br." };
    }
    return limite
      ? { ok: false, status: 429, motivo: "A FIPE atingiu o limite de consultas de hoje. Os modelos já consultados continuam abrindo; os novos, amanhã." }
      : { ok: false, status: 502, motivo: "A FIPE não devolveu o valor deste mês para o modelo escolhido." };
  }
  if (chamadasPagas > 0) {
    console.info(`[FIPE paga] mercado por modelo: ${chamadasPagas} consultas na APIBrasil`, {
      pedido: `${pedido.marca}/${pedido.modelo}/${pedido.ano}`,
      comValor: pagosComValor,
      guardados: mesesPagosGuardados,
      falhas: falhasPagas,
      homologacao: !!pago?.homologacao,
    });
  }
  if (estourouOPrazo) {
    avisos.push("A leitura parou no tempo para não perder o que já tinha vindo: o que chegou ficou guardado, e analisar de novo busca só o que falta.");
  }
  if (pago?.homologacao && chamadasPagas > 0) {
    avisos.push(
      `A APIBrasil está em modo de teste (APIBRASIL_HOMOLOGACAO): ${conferidosEmTeste} de ${chamadasPagas} meses responderam no formato certo, nada foi cobrado, e os valores de exemplo não entram no gráfico nem ficam guardados.`,
    );
  }
  if (pagoParado) avisos.push(pagoParado);
  else if (falhasPagas > 0) {
    const porque = [...motivosPagos].sort((a, b) => b[1] - a[1])[0][0];
    console.warn(`[FIPE paga] ${falhasPagas} de ${chamadasPagas} consultas pagas sem valor`, Object.fromEntries(motivosPagos));
    avisos.push(`A APIBrasil ${porque} em ${falhasPagas} ${falhasPagas === 1 ? "mês" : "meses"}; eles não foram guardados.`);
  }
  if (mercado.mesesForaDoPlano > 0 && modo === "completa") {
    const r = referencias.find((x) => foraDoPlano(x, corte));
    const desde = r ? nomeDoMes(r) : "um certo mês";
    avisos.push(
      !deps.pago
        ? `A FIPE gratuita só libera os meses mais recentes (de ${desde} para trás ela pede plano pago), e este ambiente está sem APIBRASIL_TOKEN para buscar o resto. O gráfico mostra ${mercado.historico.length} ${mercado.historico.length === 1 ? "mês" : "meses"}.`
        : `${mercado.mesesForaDoPlano} ${mercado.mesesForaDoPlano === 1 ? "mês ficou" : "meses ficaram"} sem valor: a FIPE gratuita não libera de ${desde} para trás e a consulta paga não completou. Analisar de novo paga só o que falta.`,
    );
  }
  if (limite) avisos.push("A FIPE atingiu o limite de consultas de hoje no meio da leitura: o histórico está incompleto e se completa na próxima abertura.");
  else if (falhas > 0) {
    const porque = [...motivos].sort((a, b) => b[1] - a[1])[0][0];
    const parou = seguidas >= FALHAS_SEGUIDAS_QUE_PARAM;
    // O motivo vai para a tela e para o log: sem ele, "não veio" não se conserta.
    console.warn(`[FIPE] mercado por modelo: ${falhas} de ${chamadas} chamadas falharam`, Object.fromEntries(motivos));
    avisos.push(
      `A FIPE ${porque} em ${falhas} ${falhas === 1 ? "chamada" : "chamadas"}${parou ? " seguidas, e a leitura parou para não gastar o limite" : ""}: o histórico está incompleto. Analisar de novo busca só o que falta.`,
    );
    if (!deps.token?.trim()) {
      avisos.push("Este ambiente está sem FIPE_API_TOKEN. Sem o token, a FIPE corta depois de poucas chamadas: ponha a variável na Vercel também em Preview e reimplante.");
    }
  }

  return { ok: true, mercado, chamadas, chamadasPagas, mesesPagosGuardados, avisos };
}

/**
 * Abre um modelo SÓ do que está guardado em `fipe_historico` (dono,
 * 08/10/2026: "ao acessar uma pesquisa antiga"). Nenhuma chamada: nem à FIPE
 * gratuita, nem à paga. O "hoje" do retrato é o mês mais novo guardado do ano
 * escolhido; os meses mais recentes vêm pelo "Atualizar dados", que é a
 * análise de sempre e busca só o que falta.
 *
 * `mesesNovos` diz quantos meses a FIPE já tem depois do guardado, quando a
 * lista de meses está em memória (de outra consulta recente); senão, `null`:
 * para saber, seria preciso perguntar à FIPE, e abrir o guardado não pergunta.
 */
export async function abrirGuardado(
  pedido: PedidoDeModelo,
  deps: { banco: BancoDoHistorico },
): Promise<{ ok: true; mercado: MercadoDoModelo; guardadoAte: string; mesesNovos: number | null } | { ok: false; status: 404 | 502; motivo: string }> {
  const guardado = await deps.banco.ler(pedido, "2000-01-01");
  if (!guardado.ok) {
    return {
      ok: false,
      status: 502,
      motivo: guardado.faltaMigracao ? `A tabela do histórico ainda não existe (migração ${MIGRACAO_DO_HISTORICO_DA_FIPE}).` : "Não deu para ler o histórico guardado.",
    };
  }
  const doAno = guardado.linhas.filter((l) => l.ano === pedido.ano && l.valor !== null).map((l) => l.referencia).sort();
  const ultima = doAno[doAno.length - 1];
  if (!ultima) return { ok: false, status: 404, motivo: "Este modelo e ano ainda não têm nada guardado." };
  const [anoUltimo, mesUltimo] = ultima.split("-").map(Number);
  // Os meses do recorte, do guardado mais novo para trás; o código do mês não importa para montar.
  const referencias: ReferenciaDaFipe[] = Array.from({ length: MESES_DE_HISTORICO + 1 }, (_, i) => {
    const indice = anoUltimo * 12 + (mesUltimo - 1) - i;
    return { codigo: 0, ano: Math.floor(indice / 12), mes: (indice % 12) + 1 };
  });
  const mercado = montarMercado(pedido, referencias, guardado.linhas);
  if (!mercado) return { ok: false, status: 404, motivo: "Este modelo e ano ainda não têm nada guardado." };
  const naMemoria = referenciasEmMemoria && Date.now() - referenciasEmMemoria.em < VALIDADE_DAS_REFERENCIAS_MS ? referenciasEmMemoria.lista : null;
  return {
    ok: true,
    mercado,
    guardadoAte: ultima.slice(0, 7),
    mesesNovos: naMemoria ? naMemoria.filter((r) => chaveDaReferencia(r) > ultima).length : null,
  };
}

/**
 * Quantos meses a consulta completa pode cobrar, antes de rodar: os meses da
 * série que não estão guardados. É um TETO: a FIPE gratuita entrega alguns de
 * graça, mas quais muda na virada do mês, e a tela promete "até N". Não chama
 * a FIPE além da lista de meses, que fica em memória.
 */
export async function estimarConsultaCompleta(
  pedido: PedidoDeModelo,
  deps: { buscar: BuscarNaFipe; token: string | undefined; banco: BancoDoHistorico },
): Promise<{ ok: true; mesesPagosNoMaximo: number } | { ok: false; status: 502; motivo: string }> {
  let referencias: ReferenciaDaFipe[];
  try {
    referencias = await referenciasDaFipe(deps.buscar, deps.token);
  } catch (erro) {
    return { ok: false, status: 502, motivo: `Não deu para ler os meses da tabela FIPE: ${(erro as Error).message}.` };
  }
  const recorte = referencias.slice(0, MESES_DE_HISTORICO + 1);
  const guardado = await deps.banco.ler(pedido, chaveDaReferencia(recorte[recorte.length - 1]));
  const linhas = guardado.ok ? guardado.linhas : [];
  const chaveAtual = referencias[0] ? chaveDaReferencia(referencias[0]) : null;
  const anteriores = planoDeBusca(pedido, referencias, linhas).filter((b) => chaveDaReferencia(b.referencia) !== chaveAtual);
  return { ok: true, mesesPagosNoMaximo: anteriores.length };
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
