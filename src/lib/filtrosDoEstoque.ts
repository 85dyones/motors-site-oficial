import type { Veiculo } from "../types";
import { normalizarParaBusca } from "./vitrine";

/**
 * As regras do painel de filtro do `/estoque` que não cabem na marcação.
 *
 * Pedido do dono em 28/09/2026: digitar o mínimo e o máximo embaixo da régua de
 * preço, buscar pelos opcionais do carro sem transformar o menu num paredão de
 * caixas, e ano em lista. Na mesma conversa ele escolheu também a marca
 * completa, o filtro que sobrevive ao voltar da ficha e a régua de KM.
 *
 * Medido na vitrine no ar no mesmo dia: preços de R$ 26.900 a R$ 318.900 contra
 * uma régua fixa de R$ 50 mil a R$ 1 milhão — 70% do trilho sem carro nenhum, e
 * nenhum jeito de pedir "até R$ 30 mil" —, 81 opcionais distintos em 27 dos 36
 * carros, e 12 anos-modelo em caixas empilhadas.
 *
 * Função pura aqui, marcação no `Catalogo`: é o molde de `lib/vitrine.ts`, e o
 * motivo é o mesmo — regra testada por comportamento não vira o contrário dela
 * numa edição de JSX que parecia inofensiva.
 */

// ---------------------------------------------------------------------------
// Faixas: preço, quilometragem e ano
// ---------------------------------------------------------------------------

/** Uma faixa numérica. `null` numa ponta é "sem limite" daquele lado. */
export interface Faixa {
  min: number | null;
  max: number | null;
}

export const SEM_FAIXA: Faixa = { min: null, max: null };

/** As pontas de uma régua. */
export interface Limites {
  min: number;
  max: number;
}

/**
 * As pontas da régua, tiradas do estoque e arredondadas para FORA no passo.
 *
 * Para fora, e não para o mais perto: arredondar o mais barato para cima
 * deixaria o próprio carro fora do começo da régua.
 */
export function limitesDaRegua(valores: number[], passo: number): Limites | null {
  const validos = valores.filter((v) => Number.isFinite(v) && v >= 0);
  if (validos.length === 0) return null;
  const min = Math.floor(Math.min(...validos) / passo) * passo;
  const max = Math.ceil(Math.max(...validos) / passo) * passo;
  // Um carro só, ou todos no mesmo valor redondo: sem isto as duas pontas
  // coincidem e a régua vira um ponto que não se arrasta.
  return { min, max: max > min ? max : min + passo };
}

/**
 * O número que a pessoa digitou numa caixa de valor.
 *
 * Aceita a máscara que a própria caixa exibe ("R$ 45.000", "80.000 km") e o
 * jeito falado ("45 mil"). Vazio é `null` — "sem limite" —, nunca zero: zero no
 * máximo esvaziaria a vitrine inteira.
 */
export function lerValorDigitado(texto: string): number | null {
  const limpo = (texto ?? "").toLowerCase();
  const digitos = limpo.replace(/\D/g, "");
  if (!digitos) return null;
  const numero = Number(digitos);
  return /\bmil\b|\dmil\b/.test(limpo) ? numero * 1000 : numero;
}

/**
 * A faixa depois de digitar ou arrastar.
 *
 * - Pontas invertidas trocam de lugar. Zerar a vitrine porque alguém digitou o
 *   máximo na caixa do mínimo é punir quem só errou de caixa.
 * - Ponta que encosta na borda da régua (ou passa dela) vira `null`: o chip não
 *   anuncia um "ATÉ R$ 320.000" que não filtra nada.
 *
 * `limites` nulo é o caso do ano, que não tem régua: só a troca vale.
 */
export function ajustarFaixa(faixa: Faixa, limites: Limites | null): Faixa {
  let { min, max } = faixa;
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  if (limites) {
    if (min !== null && min <= limites.min) min = null;
    if (max !== null && max >= limites.max) max = null;
  }
  return { min, max };
}

/** Se um valor cabe na faixa. As pontas são inclusivas. */
export function dentroDaFaixa(valor: number, faixa: Faixa): boolean {
  if (faixa.min !== null && valor < faixa.min) return false;
  if (faixa.max !== null && valor > faixa.max) return false;
  return true;
}

/** Se a faixa filtra alguma coisa. */
export function faixaAtiva(faixa: Faixa): boolean {
  return faixa.min !== null || faixa.max !== null;
}

/**
 * O rótulo do chip da faixa, ou `null` quando ela não filtra.
 *
 * Pontas iguais viram um valor só: o `?ano=2021` da busca da home chega como
 * "de 2021 até 2021", e o chip continua dizendo "2021".
 */
export function rotuloDaFaixa(faixa: Faixa, formatar: (n: number) => string): string | null {
  const { min, max } = faixa;
  if (min === null && max === null) return null;
  if (min !== null && max !== null) {
    return min === max ? formatar(min) : `${formatar(min)} A ${formatar(max)}`;
  }
  if (max !== null) return `ATÉ ${formatar(max)}`;
  return `A PARTIR DE ${formatar(min as number)}`;
}

// ---------------------------------------------------------------------------
// Opcionais
// ---------------------------------------------------------------------------

/** A chave de comparação de um opcional: sem acento, minúscula, sem ponto final. */
export function chaveDoOpcional(item: string): string {
  return normalizarParaBusca(item).replace(/\.+$/, "").trim();
}

/**
 * O que já tem filtro próprio no painel não entra como opcional.
 *
 * "Câmbio automático" aparece na lista do feed, e como opcional ele repetiria o
 * grupo CÂMBIO com um dado diferente: o grupo lê a coluna `cambio`, preenchida
 * em todo carro; a lista de opcionais existe em 3 de cada 4. Os dois controles
 * lado a lado discordariam — o defeito que `VOCABULARIO_CANONICO`, em
 * `lib/vitrine.ts`, conta pela outra ponta.
 */
function temFiltroProprio(chave: string): boolean {
  return chave.startsWith("cambio ");
}

/**
 * Os opcionais de um carro, um por item, na ordem do cadastro.
 *
 * O feed grava lista separada por vírgula ("Freios ABS, Airbag, Alarme"). Ponto
 * e vírgula e quebra de linha também separam, porque a lista pode ser digitada
 * no painel. O mesmo item escrito duas vezes (caixa, acento) conta uma só.
 */
export function opcionaisDoVeiculo(veiculo: Pick<Veiculo, "opcionais">): string[] {
  const vistos = new Set<string>();
  const itens: string[] = [];
  for (const bruto of (veiculo.opcionais ?? "").split(/[,;\n]/)) {
    const rotulo = bruto.trim().replace(/\.+$/, "").trim();
    const chave = chaveDoOpcional(rotulo);
    if (!chave || vistos.has(chave) || temFiltroProprio(chave)) continue;
    vistos.add(chave);
    itens.push(rotulo);
  }
  return itens;
}

/** Um opcional no painel: a chave que filtra, o texto que aparece, e quantos carros. */
export interface OpcaoDeOpcional {
  chave: string;
  rotulo: string;
  total: number;
}

/**
 * Os opcionais de um conjunto de carros, do mais comum para o menos.
 *
 * O rótulo é o da primeira grafia encontrada — o feed usa uma só por item.
 */
export function catalogoDeOpcionais(veiculos: Veiculo[]): OpcaoDeOpcional[] {
  const porChave = new Map<string, OpcaoDeOpcional>();
  for (const veiculo of veiculos) {
    for (const rotulo of opcionaisDoVeiculo(veiculo)) {
      const chave = chaveDoOpcional(rotulo);
      const atual = porChave.get(chave);
      if (atual) atual.total += 1;
      else porChave.set(chave, { chave, rotulo, total: 1 });
    }
  }
  return [...porChave.values()].sort(
    (a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo, "pt-BR"),
  );
}

/** Quantas sugestões a lista mostra de uma vez. */
export const LIMITE_DE_SUGESTOES = 8;

/**
 * As sugestões para o que está digitado.
 *
 * Cada termo precisa ser o COMEÇO de uma palavra do opcional, e não um pedaço
 * solto dela: "ar" traz "Ar-condicionado" e "Ar quente", e não "Farol de
 * milha". Com 81 itens distintos, casar por substring enchia a lista de ruído a
 * cada tecla.
 *
 * Caixa vazia devolve os mais comuns — é o que mostra à pessoa o que existe
 * para buscar antes de ela adivinhar o nome.
 */
export function sugestoesDeOpcionais(
  catalogo: OpcaoDeOpcional[],
  digitado: string,
  escolhidos: string[],
  limite = LIMITE_DE_SUGESTOES,
): OpcaoDeOpcional[] {
  const termos = normalizarParaBusca(digitado).split(/[^a-z0-9]+/).filter(Boolean);
  return catalogo
    .filter((opcao) => !escolhidos.includes(opcao.chave))
    .filter((opcao) => {
      const palavras = opcao.chave.split(/[^a-z0-9]+/).filter(Boolean);
      return termos.every((termo) => palavras.some((palavra) => palavra.startsWith(termo)));
    })
    .slice(0, limite);
}

/**
 * Se o carro tem TODOS os opcionais escolhidos.
 *
 * Todos, e não qualquer um: quem escolhe "teto solar" e "câmera de ré" está
 * descrevendo um carro, não dois. Nada escolhido não reprova ninguém — nem o
 * carro sem lista cadastrada.
 */
export function temTodosOsOpcionais(veiculo: Veiculo, chaves: string[]): boolean {
  if (chaves.length === 0) return true;
  const doCarro = new Set(opcionaisDoVeiculo(veiculo).map(chaveDoOpcional));
  return chaves.every((chave) => doCarro.has(chave));
}

// ---------------------------------------------------------------------------
// O filtro no endereço
// ---------------------------------------------------------------------------

export type Ordenacao = "recentes" | "menor-preco" | "menor-km";

export const ORDEM_PADRAO: Ordenacao = "recentes";

const ORDENS: readonly Ordenacao[] = ["recentes", "menor-preco", "menor-km"];

/**
 * Os grupos de caixa que vão para o endereço.
 *
 * `modelo` não tem grupo no painel, mas a busca da home o manda e o chip o
 * mostra — sem ele aqui, voltar da ficha perderia o modelo que veio da home.
 */
export const GRUPOS_DA_URL = [
  "marca",
  "modelo",
  "carroceria",
  "cambio",
  "combustivel",
  "destaque",
] as const;

/** Tudo o que o painel filtra, num objeto só. */
export interface EstadoDoFiltro {
  selecionados: Record<string, string[]>;
  preco: Faixa;
  km: Faixa;
  ano: Faixa;
  /** Chaves de `chaveDoOpcional`, não rótulos. */
  opcionais: string[];
  busca: string;
  ordem: Ordenacao;
}

function numero(params: URLSearchParams, nome: string): number | null {
  const bruto = params.get(nome);
  if (bruto === null || bruto.trim() === "") return null;
  const valor = Number(bruto);
  return Number.isFinite(valor) ? valor : null;
}

/**
 * O filtro que o endereço descreve.
 *
 * É daqui que o `Catalogo` nasce: a busca da home, um link de campanha, e o
 * botão voltar do navegador depois de abrir uma ficha. Até 28/09 o filtro vivia
 * só no estado do componente — marcar VOLKSWAGEN, abrir um carro e voltar
 * devolvia o estoque inteiro, medido no site no ar.
 *
 * Os nomes antigos continuam valendo: `ano` (um só, que é o que a home manda)
 * vira a faixa de um ano, e `precoMax` é o mesmo de sempre.
 */
export function estadoDaUrl(params: URLSearchParams): EstadoDoFiltro {
  const selecionados: Record<string, string[]> = {};
  for (const grupo of GRUPOS_DA_URL) {
    const valores = params.getAll(grupo).filter((v) => v.trim() !== "");
    if (valores.length > 0) selecionados[grupo] = valores;
  }

  const anoUnico = numero(params, "ano");
  const ano: Faixa = {
    min: numero(params, "anoMin") ?? anoUnico,
    max: numero(params, "anoMax") ?? anoUnico,
  };

  const opcionais = [
    ...new Set(params.getAll("opcional").map(chaveDoOpcional).filter(Boolean)),
  ];

  const ordem = params.get("ordem");

  return {
    selecionados,
    preco: { min: numero(params, "precoMin"), max: numero(params, "precoMax") },
    km: { min: numero(params, "kmMin"), max: numero(params, "kmMax") },
    ano,
    opcionais,
    busca: params.get("q") ?? "",
    ordem: ORDENS.includes(ordem as Ordenacao) ? (ordem as Ordenacao) : ORDEM_PADRAO,
  };
}

/**
 * O endereço que descreve o filtro — sem o `?`, e vazio quando nada filtra.
 *
 * O inverso exato de `estadoDaUrl`: o teste de ida e volta é o que garante que
 * o botão voltar devolve o mesmo filtro que a pessoa deixou.
 */
export function urlDoEstado(estado: EstadoDoFiltro): string {
  const params = new URLSearchParams();
  if (estado.busca.trim()) params.set("q", estado.busca);
  for (const grupo of GRUPOS_DA_URL) {
    for (const valor of estado.selecionados[grupo] ?? []) params.append(grupo, valor);
  }
  const faixas: [string, Faixa][] = [
    ["ano", estado.ano],
    ["preco", estado.preco],
    ["km", estado.km],
  ];
  for (const [nome, faixa] of faixas) {
    if (faixa.min !== null) params.set(`${nome}Min`, String(faixa.min));
    if (faixa.max !== null) params.set(`${nome}Max`, String(faixa.max));
  }
  for (const chave of estado.opcionais) params.append("opcional", chave);
  if (estado.ordem !== ORDEM_PADRAO) params.set("ordem", estado.ordem);
  return params.toString();
}

/**
 * Os parâmetros que o painel escreve — e os ÚNICOS que ele pode apagar.
 *
 * `ano` entra aqui mesmo sem ser escrito: é o nome antigo que a busca da home
 * manda, e depois de lido ele vira `anoMin`/`anoMax`. Deixá-lo no endereço
 * faria o link copiado carregar os dois.
 */
const PARAMETROS_DO_PAINEL = new Set<string>([
  ...GRUPOS_DA_URL,
  "q",
  "ano",
  "anoMin",
  "anoMax",
  "precoMin",
  "precoMax",
  "kmMin",
  "kmMax",
  "opcional",
  "ordem",
]);

/**
 * O endereço novo, a partir do atual: troca o filtro e preserva o resto.
 *
 * A primeira versão escrevia só `urlDoEstado` e apagava tudo o que não era
 * filtro — achado na prévia da Vercel em 28/09, quando o `_vercel_share`
 * sumiu da barra. Na chegada por anúncio, os apagados seriam `utm_*`, `gclid`
 * e `fbclid`, que o `IntegrationsTracker` lê do `location.search` depois da
 * hidratação: a atribuição do anúncio ia embora no primeiro clique no painel.
 */
export function enderecoComFiltro(buscaAtual: string, estado: EstadoDoFiltro): string {
  const params = new URLSearchParams(buscaAtual);
  for (const nome of [...params.keys()]) {
    if (PARAMETROS_DO_PAINEL.has(nome)) params.delete(nome);
  }
  for (const [nome, valor] of new URLSearchParams(urlDoEstado(estado))) params.append(nome, valor);
  return params.toString();
}
