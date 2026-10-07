/**
 * Mercado por modelo — a primeira análise de compra, sem custo nenhum.
 *
 * Pedido do dono em 06/10/2026, depois da consulta por placa: "algo que seja
 * 100% grátis para uma primeira análise, apenas pra compra, tendência de
 * modelo por conta de valor de mercado". Escolhe-se marca, modelo e ano, e a
 * tela responde para onde o preço daquele modelo está indo, antes de alguém
 * gastar uma consulta paga com uma placa.
 *
 * Nada aqui fala do CARRO: leilão, sinistro, gravame e débito continuam na
 * aba da placa. Aqui é só a tabela FIPE, lida da API pública que o site já usa
 * (`fipeNoServidor.ts`), mês a mês.
 *
 * ---------------------------------------------------------------------------
 * De onde sai o histórico, de graça
 * ---------------------------------------------------------------------------
 * A API pública tem um endpoint de histórico pronto, mas ele é do plano pago.
 * No plano gratuito cada consulta de valor aceita o MÊS DE REFERÊNCIA
 * (`?reference=`), então o histórico se monta pedindo um mês por chamada.
 * Mês passado não muda nunca: cada valor lido é guardado em `fipe_historico`
 * e não é pedido de novo. A primeira consulta de um modelo custa umas trinta
 * chamadas do teto diário do token; as seguintes, nenhuma, até virar o mês.
 *
 * Este arquivo é a parte PURA: ler as respostas da FIPE, decidir o que falta
 * buscar e tirar da série o que a tela mostra. A rede e o banco moram em
 * `mercadoPorModelo-servidor.ts`.
 *
 * ---------------------------------------------------------------------------
 * Os alertas não têm régua inventada
 * ---------------------------------------------------------------------------
 * "Caiu muito" seria um número de negócio escrito em código. Os alertas daqui
 * são todos COMPARAÇÕES que a própria série ou o próprio modelo dão: o sinal
 * da variação, os últimos seis meses contra os seis anteriores, a queda de um
 * ano contra a diferença de preço para o ano-modelo anterior (o que um ano de
 * idade custa naquele modelo), e quantos meses seguidos a tabela caiu.
 */
import { MESES_DO_RITMO, tendenciaDaFipe, type PontoDaFipe, type TendenciaDaFipe } from "./consultaDePlaca";
import type { TipoFipe } from "./consultaFipe";

/** Quantos meses de série a aba monta. Recorte de tela, e teto do custo em chamadas. */
export const MESES_DE_HISTORICO = 24;

/** Quantos anos-modelo entram na comparação lado a lado. */
export const ANOS_NA_COMPARACAO = 8;

/** Quantos meses o gráfico de variação mês a mês mostra. */
export const MESES_DA_VARIACAO = 12;

// ─────────────────────────────────────────────────────────────────────────────
// O pedido
// ─────────────────────────────────────────────────────────────────────────────

export interface PedidoDeModelo {
  tipo: TipoFipe;
  /** Códigos da FIPE, como a cascata da `/avaliacao` os devolve. */
  marca: string;
  modelo: string;
  /** "2022-1": ano-modelo e combustível. */
  ano: string;
  /** Os outros anos do modelo, para a comparação. Sem o zero-km e sem repetir `ano`. */
  outrosAnos: string[];
}

const CODIGO = /^\d{1,6}$/;
const ANO = /^\d{4}-\d{1,2}$/;
const TIPOS: readonly string[] = ["carros", "motos", "caminhoes"];

/**
 * O corpo da rota, conferido. Os códigos viram pedaço de URL da FIPE, então só
 * passa o que tem a forma exata de código; o zero-km ("32000-1") fica fora por
 * não ser ano. Os outros anos são cortados nos mais próximos do escolhido.
 */
export function lerPedidoDeModelo(corpo: unknown): PedidoDeModelo | null {
  if (!corpo || typeof corpo !== "object") return null;
  const c = corpo as Record<string, unknown>;
  const tipo = typeof c.tipo === "string" && TIPOS.includes(c.tipo) ? (c.tipo as TipoFipe) : null;
  const marca = String(c.marca ?? "");
  const modelo = String(c.modelo ?? "");
  const ano = String(c.ano ?? "");
  if (!tipo || !CODIGO.test(marca) || !CODIGO.test(modelo) || !ANO.test(ano)) return null;

  const anoModelo = Number(ano.slice(0, 4));
  const combustivel = ano.slice(5);
  const candidatos = Array.isArray(c.anos) ? c.anos : [];
  const outrosAnos = [...new Set(candidatos.filter((a): a is string => typeof a === "string" && ANO.test(a)))]
    // Mesmo combustível: comparar o flex de um ano com o diesel de outro não diz nada.
    .filter((a) => a !== ano && a.slice(5) === combustivel)
    .sort((a, b) => Math.abs(Number(a.slice(0, 4)) - anoModelo) - Math.abs(Number(b.slice(0, 4)) - anoModelo) || b.localeCompare(a))
    .slice(0, ANOS_NA_COMPARACAO - 1);

  return { tipo, marca, modelo, ano, outrosAnos };
}

// ─────────────────────────────────────────────────────────────────────────────
// As respostas da FIPE
// ─────────────────────────────────────────────────────────────────────────────

export interface ReferenciaDaFipe {
  /** O código que vai em `?reference=`. */
  codigo: number;
  ano: number;
  mes: number;
}

const MESES_POR_EXTENSO = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/**
 * "outubro/2026" → { ano, mes }. É assim que a v2 devolve (conferido na API em
 * 07/10/2026); a v1 e o site da FIPE escrevem "outubro de 2026", às vezes com
 * espaço sobrando ou "marco" sem cedilha, e os dois formatos passam.
 */
export function mesDeReferencia(texto: unknown): { ano: number; mes: number } | null {
  if (typeof texto !== "string") return null;
  const m = texto.trim().toLowerCase().match(/^([a-zçã]+)\s*(?:\/|\sde\s)\s*(\d{4})$/);
  if (!m) return null;
  const mes = MESES_POR_EXTENSO.indexOf(m[1] === "marco" ? "março" : m[1]) + 1;
  return mes > 0 ? { ano: Number(m[2]), mes } : null;
}

/** A lista de `/references`, do mês mais novo para o mais antigo. Item torto fica de fora. */
export function lerReferencias(corpo: unknown): ReferenciaDaFipe[] {
  if (!Array.isArray(corpo)) return [];
  const lidas: ReferenciaDaFipe[] = [];
  for (const item of corpo) {
    if (!item || typeof item !== "object") continue;
    const { code, month } = item as { code?: unknown; month?: unknown };
    const codigo = Number(code);
    const quando = mesDeReferencia(month);
    if (!Number.isInteger(codigo) || codigo <= 0 || !quando) continue;
    lidas.push({ codigo, ...quando });
  }
  return lidas.sort((a, b) => b.ano - a.ano || b.mes - a.mes);
}

export interface ValorDaFipe {
  valor: number;
  marca: string | null;
  modelo: string | null;
  anoModelo: number | null;
  combustivel: string | null;
  codigoFipe: string | null;
}

/** O valor de um mês: `{ price: "R$ 128.430,00", brand, model, modelYear, fuel, codeFipe }`. */
export function lerValorDaFipe(corpo: unknown): ValorDaFipe | null {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return null;
  const c = corpo as Record<string, unknown>;
  if (typeof c.price !== "string") return null;
  const digitos = c.price.replace(/[^\d]/g, "");
  const valor = digitos ? Number(digitos) / 100 : NaN;
  if (!Number.isFinite(valor) || valor <= 0) return null;
  const texto = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
  const anoModelo = Number(c.modelYear);
  return {
    valor,
    marca: texto(c.brand),
    modelo: texto(c.model),
    anoModelo: Number.isInteger(anoModelo) && anoModelo > 1900 ? anoModelo : null,
    combustivel: texto(c.fuel),
    codigoFipe: texto(c.codeFipe),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// O que já está guardado, e o que falta buscar
// ─────────────────────────────────────────────────────────────────────────────

/** Uma linha de `fipe_historico`. `valor: null` é "a FIPE não tinha este carro neste mês". */
export interface LinhaDoHistorico {
  ano: string;
  /** AAAA-MM-01. */
  referencia: string;
  valor: number | null;
  marca: string | null;
  modelo: string | null;
  combustivel: string | null;
  codigoFipe: string | null;
}

export const chaveDaReferencia = (r: { ano: number; mes: number }) => `${r.ano}-${String(r.mes).padStart(2, "0")}-01`;

export interface Busca {
  ano: string;
  referencia: ReferenciaDaFipe;
}

/**
 * As chamadas que faltam: os últimos `MESES_DE_HISTORICO` meses do ano
 * escolhido e o mês corrente de cada ano da comparação, menos o que o banco
 * já tem. O mês corrente do ano escolhido vem primeiro: sem ele não há tela.
 */
export function planoDeBusca(pedido: PedidoDeModelo, referencias: ReferenciaDaFipe[], guardadas: LinhaDoHistorico[]): Busca[] {
  const tem = new Set(guardadas.map((l) => `${l.ano}|${l.referencia}`));
  const falta = (ano: string, r: ReferenciaDaFipe) => !tem.has(`${ano}|${chaveDaReferencia(r)}`);
  const [atual, ...anteriores] = referencias.slice(0, MESES_DE_HISTORICO + 1);
  if (!atual) return [];

  const plano: Busca[] = [];
  if (falta(pedido.ano, atual)) plano.push({ ano: pedido.ano, referencia: atual });
  for (const ano of pedido.outrosAnos) if (falta(ano, atual)) plano.push({ ano, referencia: atual });
  for (const r of anteriores) if (falta(pedido.ano, r)) plano.push({ ano: pedido.ano, referencia: r });
  return plano;
}

// ─────────────────────────────────────────────────────────────────────────────
// O retrato do mercado
// ─────────────────────────────────────────────────────────────────────────────

export interface AnoDoModelo {
  ano: string;
  anoModelo: number;
  valor: number;
  /** É o ano que a pessoa escolheu. */
  escolhido: boolean;
  /** Quanto este ano vale a menos que o ano-modelo seguinte, em %; `null` no mais novo ou sem vizinho. */
  abaixoDoSeguintePct: number | null;
}

export interface MercadoDoModelo {
  tipo: TipoFipe;
  marcaCodigo: string;
  modeloCodigo: string;
  ano: string;
  marca: string | null;
  modelo: string | null;
  anoModelo: number;
  combustivel: string | null;
  codigoFipe: string | null;
  /** O mês da tabela vigente, "AAAA-MM". */
  referencia: string;
  fipeAtual: number;
  /** Do mês mais antigo para o mais novo, só os meses em que a FIPE tinha o carro. */
  historico: PontoDaFipe[];
  /** Do ano-modelo mais novo para o mais antigo. */
  porAno: AnoDoModelo[];
  /** Quantos meses do recorte ficaram sem leitura (rede, limite da FIPE). */
  mesesQueFaltaram: number;
}

const pct1 = (de: number, ate: number) => Math.round(((ate - de) / de) * 1000) / 10;

/**
 * Monta o retrato a partir das linhas (guardadas e recém-lidas). `null` quando
 * o mês corrente do ano escolhido não veio: sem a FIPE de hoje não há análise.
 */
export function montarMercado(pedido: PedidoDeModelo, referencias: ReferenciaDaFipe[], linhas: LinhaDoHistorico[]): MercadoDoModelo | null {
  const recorte = referencias.slice(0, MESES_DE_HISTORICO + 1);
  const atual = recorte[0];
  if (!atual) return null;
  const porChave = new Map(linhas.map((l) => [`${l.ano}|${l.referencia}`, l]));
  const linhaAtual = porChave.get(`${pedido.ano}|${chaveDaReferencia(atual)}`);
  if (!linhaAtual || linhaAtual.valor === null) return null;

  const historico: PontoDaFipe[] = [];
  let mesesQueFaltaram = 0;
  for (const r of recorte) {
    const l = porChave.get(`${pedido.ano}|${chaveDaReferencia(r)}`);
    if (!l) mesesQueFaltaram++;
    else if (l.valor !== null) historico.push({ ano: r.ano, mes: r.mes, valor: l.valor });
  }
  historico.sort((a, b) => a.ano - b.ano || a.mes - b.mes);

  const anos = [pedido.ano, ...pedido.outrosAnos]
    .map((ano) => ({ ano, linha: porChave.get(`${ano}|${chaveDaReferencia(atual)}`) }))
    .filter((x): x is { ano: string; linha: LinhaDoHistorico & { valor: number } } => !!x.linha && x.linha.valor !== null)
    .map((x) => ({ ano: x.ano, anoModelo: Number(x.ano.slice(0, 4)), valor: x.linha.valor }))
    .sort((a, b) => b.anoModelo - a.anoModelo);
  const porAno: AnoDoModelo[] = anos.map((a, i) => {
    const seguinte = anos[i - 1];
    return {
      ...a,
      escolhido: a.ano === pedido.ano,
      // Só entre anos vizinhos: pular um ano mediria dois anos de idade.
      abaixoDoSeguintePct: seguinte && seguinte.anoModelo === a.anoModelo + 1 ? pct1(seguinte.valor, a.valor) : null,
    };
  });

  return {
    tipo: pedido.tipo,
    marcaCodigo: pedido.marca,
    modeloCodigo: pedido.modelo,
    ano: pedido.ano,
    marca: linhaAtual.marca,
    modelo: linhaAtual.modelo,
    anoModelo: Number(pedido.ano.slice(0, 4)),
    combustivel: linhaAtual.combustivel,
    codigoFipe: linhaAtual.codigoFipe,
    referencia: `${atual.ano}-${String(atual.mes).padStart(2, "0")}`,
    fipeAtual: linhaAtual.valor,
    historico,
    porAno,
    mesesQueFaltaram,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A leitura da série
// ─────────────────────────────────────────────────────────────────────────────

export interface VariacaoMensal {
  ano: number;
  mes: number;
  /** Contra o mês anterior, em %. */
  pct: number;
  /** Contra o mês anterior, em reais. */
  reais: number;
}

/** A variação de cada mês contra o anterior, só entre meses vizinhos de calendário. */
export function variacaoMesAMes(historico: PontoDaFipe[], meses = MESES_DA_VARIACAO): VariacaoMensal[] {
  const serie = [...historico].sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  const indice = (p: PontoDaFipe) => p.ano * 12 + p.mes;
  const variacoes: VariacaoMensal[] = [];
  for (let i = 1; i < serie.length; i++) {
    if (indice(serie[i]) !== indice(serie[i - 1]) + 1) continue;
    variacoes.push({
      ano: serie[i].ano,
      mes: serie[i].mes,
      pct: Math.round(((serie[i].valor - serie[i - 1].valor) / serie[i - 1].valor) * 1000) / 10,
      reais: Math.round(serie[i].valor - serie[i - 1].valor),
    });
  }
  return variacoes.slice(-meses);
}

/** Quantos meses seguidos a tabela caiu, contando do mês atual para trás. */
export function mesesSeguidosDeQueda(historico: PontoDaFipe[]): number {
  const variacoes = variacaoMesAMes(historico, historico.length);
  let seguidos = 0;
  for (let i = variacoes.length - 1; i >= 0 && variacoes[i].reais < 0; i--) seguidos++;
  return seguidos;
}

/**
 * Quanto a tabela andou por mês, em reais, na média dos últimos
 * `MESES_DO_RITMO` meses (negativo quando caiu). `null` sem a série inteira.
 */
export function ritmoMensalEmReais(historico: PontoDaFipe[]): number | null {
  const serie = [...historico].sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  const ultimo = serie[serie.length - 1];
  if (!ultimo) return null;
  const indice = (p: PontoDaFipe) => p.ano * 12 + p.mes;
  const base = serie.find((p) => indice(p) === indice(ultimo) - MESES_DO_RITMO);
  return base ? Math.round((ultimo.valor - base.valor) / MESES_DO_RITMO) : null;
}

/**
 * O estado da tendência, que a tela desenha com forma e cor:
 *   estavel ..... a tabela não caiu em seis meses (ou subiu)
 *   caindo ...... caiu, no mesmo ritmo ou mais devagar que antes
 *   acelerando .. caiu, e os últimos seis meses caíram mais que os seis anteriores
 *   sem_serie ... não há seis meses de tabela para dizer
 */
export type EstadoDaTendencia = "estavel" | "caindo" | "acelerando" | "sem_serie";

export interface AlertaDeMercado {
  estado: EstadoDaTendencia;
  titulo: string;
  /** O que sustenta o título, uma frase por linha, da mais forte para a mais fraca. */
  linhas: string[];
}

const reais = (n: number) => Math.abs(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pctTexto = (n: number) => `${Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/**
 * O alerta de desvalorização. Todas as frases são comparações que a série ou
 * o modelo dão; nenhuma depende de um percentual escolhido por quem programou.
 */
export function alertaDeMercado(mercado: MercadoDoModelo, tendencia: TendenciaDaFipe | null = tendenciaDaFipe(mercado.historico)): AlertaDeMercado {
  const seis = tendencia?.variacoes.find((v) => v.meses === 6) ?? null;
  const doze = tendencia?.variacoes.find((v) => v.meses === 12) ?? null;
  if (!tendencia || !seis) {
    return {
      estado: "sem_serie",
      titulo: "Sem série para dizer a tendência",
      linhas: ["A FIPE tem menos de seis meses de tabela para este ano-modelo, ou os meses não vieram."],
    };
  }

  const linhas: string[] = [];
  const seguidos = mesesSeguidosDeQueda(mercado.historico);
  const ritmo = ritmoMensalEmReais(mercado.historico);
  const estado: EstadoDaTendencia = seis.pct >= 0 ? "estavel" : tendencia.ritmo === "acelerando" ? "acelerando" : "caindo";

  if (estado === "estavel") {
    linhas.push(
      seis.pct === 0
        ? "A tabela não se mexeu em seis meses."
        : `A tabela subiu ${pctTexto(seis.pct)} em seis meses.`,
    );
  } else {
    linhas.push(`A tabela caiu ${pctTexto(seis.pct)} em seis meses${doze ? ` e ${doze.pct < 0 ? "" : "subiu "}${pctTexto(doze.pct)} em doze` : ""}.`);
    if (tendencia.ritmo === "acelerando") {
      linhas.push("Os últimos seis meses caíram mais que os seis anteriores: a queda está ganhando velocidade.");
    } else if (tendencia.ritmo === "desacelerando") {
      linhas.push("Os últimos seis meses caíram menos que os seis anteriores: a queda está perdendo força.");
    }
  }

  if (seguidos >= 2) linhas.push(`São ${seguidos} meses seguidos de queda.`);
  if (ritmo !== null && ritmo < 0) {
    linhas.push(`Cada mês de pátio custa cerca de ${reais(ritmo)} de tabela, pela média dos últimos seis meses.`);
  }

  // A queda de um ano contra o que um ano de idade custa neste modelo.
  const escolhido = mercado.porAno.find((a) => a.escolhido);
  if (doze && doze.pct < 0 && escolhido && escolhido.abaixoDoSeguintePct !== null && escolhido.abaixoDoSeguintePct < 0) {
    const degrau = escolhido.abaixoDoSeguintePct;
    linhas.push(
      doze.pct < degrau
        ? `Em doze meses caiu ${pctTexto(doze.pct)}, mais do que a diferença de ${pctTexto(degrau)} para o ano-modelo seguinte: perdeu mais que um ano de idade.`
        : `Em doze meses caiu ${pctTexto(doze.pct)}, dentro da diferença de ${pctTexto(degrau)} para o ano-modelo seguinte: é a perda de um ano de idade.`,
    );
  }

  if (tendencia.pico.pct < 0 && tendencia.valorAtual === Math.min(...mercado.historico.map((p) => p.valor))) {
    linhas.push(`Está no menor valor do período, ${pctTexto(tendencia.pico.pct)} abaixo do pico.`);
  }

  return {
    estado,
    titulo:
      estado === "estavel"
        ? "Preço estável"
        : estado === "acelerando"
          ? "Desvalorizando cada vez mais rápido"
          : "Desvalorizando",
    linhas,
  };
}
