/**
 * A FIPE consultada do servidor — o miolo de `/api/fipe/[...caminho]`.
 *
 * A rota fala a língua da API v1 (a que `consultaFipe.ts` e a `/avaliacao`
 * sempre usaram: `carros/marcas/21/modelos`, `{codigo, nome}`, `Valor`) e
 * consulta a **v2** por baixo, porque é na v2 que o token da loja vale
 * (`X-Subscription-Token`, documentado em deividfortuna.github.io/fipe/v2):
 * sem token o teto é de 500 consultas por dia por IP, com o token gratuito do
 * fipe.api.br é de 1.000. Os códigos de marca, modelo e ano são os mesmos nas
 * duas versões — conferido em 24/09/2026 com o Fiat 500 Abarth (marca 21,
 * modelo 7097, ano "2014-1") nas duas.
 *
 * Sem `FIPE_API_TOKEN`, a rota consulta a v2 sem token e ainda ganha com o
 * cache de borda: cada caminho sai da FIPE uma vez a cada 12 horas, e não uma
 * vez por visitante.
 *
 * Tudo aqui é puro ou recebe a `buscar` por parâmetro: a rota só junta com a
 * rede, o limite de taxa e os cabeçalhos.
 */
import type { TipoFipe } from "./consultaFipe";

export const FIPE_V2 = "https://fipe.parallelum.com.br/api/v2";

const TIPO_NA_V2: Record<TipoFipe, string> = {
  carros: "cars",
  motos: "motorcycles",
  caminhoes: "trucks",
};

export type PedidoFipe =
  | { nivel: "marcas"; tipo: TipoFipe }
  | { nivel: "modelos"; tipo: TipoFipe; marca: string }
  | { nivel: "anos"; tipo: TipoFipe; marca: string; modelo: string }
  | { nivel: "valor"; tipo: TipoFipe; marca: string; modelo: string; ano: string };

/** Código de marca e de modelo: só dígitos. */
const CODIGO = /^\d{1,6}$/;
/** Código de ano: "2014-1", e o "32000-1" do zero-km. */
const ANO = /^\d{4,5}-\d{1,2}$/;

function ehTipo(valor: string): valor is TipoFipe {
  // `hasOwn`, e não `in`: com `in`, "constructor" e "toString" passavam como
  // tipo — e a rota chamava a FIPE com o token em
  // "…/api/v2/function Object() { [native code] }/brands".
  return Object.hasOwn(TIPO_NA_V2, valor);
}

/**
 * O caminho pedido, se for um dos quatro que a cascata usa. Qualquer outra
 * coisa é `null` — a rota é pública e não pode virar um proxy genérico para a
 * FIPE, gastando o teto do token da loja com o que a `/avaliacao` não pede.
 */
export function lerPedidoFipe(segmentos: string[]): PedidoFipe | null {
  const [tipo, marcas, marca, modelos, modelo, anos, ano, ...resto] = segmentos;
  if (resto.length > 0 || !tipo || !ehTipo(tipo) || marcas !== "marcas") return null;
  if (marca === undefined) return { nivel: "marcas", tipo };
  if (!CODIGO.test(marca) || modelos !== "modelos") return null;
  if (modelo === undefined) return { nivel: "modelos", tipo, marca };
  if (!CODIGO.test(modelo) || anos !== "anos") return null;
  if (ano === undefined) return { nivel: "anos", tipo, marca, modelo };
  if (!ANO.test(ano)) return null;
  return { nivel: "valor", tipo, marca, modelo, ano };
}

export function urlNaV2(p: PedidoFipe): string {
  const base = `${FIPE_V2}/${TIPO_NA_V2[p.tipo]}/brands`;
  switch (p.nivel) {
    case "marcas":
      return base;
    case "modelos":
      return `${base}/${p.marca}/models`;
    case "anos":
      return `${base}/${p.marca}/models/${p.modelo}/years`;
    case "valor":
      return `${base}/${p.marca}/models/${p.modelo}/years/${p.ano}`;
  }
}

/** `[{code, name}]` da v2 → `[{codigo, nome}]` da v1. Item torto fica de fora. */
function opcoesDaV2(dados: unknown): { codigo: string; nome: string }[] | null {
  if (!Array.isArray(dados)) return null;
  return dados.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const { code, name } = x as { code?: unknown; name?: unknown };
    if ((typeof code !== "string" && typeof code !== "number") || typeof name !== "string") return [];
    return [{ codigo: String(code), nome: name }];
  });
}

/**
 * A resposta da v2 no formato da v1, ou `null` quando ela não tem a forma
 * esperada. `null` vira 502 na rota — e o navegador cai na API pública —, em
 * vez de a loja servir, com cache de 12 horas, uma lista vazia ou um objeto
 * de erro com status 200.
 */
export function paraFormatoV1(nivel: PedidoFipe["nivel"], dados: unknown): unknown | null {
  if (nivel === "valor") {
    if (!dados || typeof dados !== "object" || Array.isArray(dados)) return null;
    const d = dados as Record<string, unknown>;
    if (typeof d.price !== "string" || !/\d/.test(d.price)) return null;
    return {
      TipoVeiculo: d.vehicleType ?? null,
      Valor: d.price,
      Marca: d.brand ?? "",
      Modelo: d.model ?? "",
      AnoModelo: d.modelYear ?? null,
      Combustivel: d.fuel ?? "",
      CodigoFipe: typeof d.codeFipe === "string" ? d.codeFipe : "",
      MesReferencia: typeof d.referenceMonth === "string" ? d.referenceMonth : "",
      SiglaCombustivel: d.fuelAcronym ?? "",
    };
  }

  const opcoes = opcoesDaV2(dados);
  // Lista vazia de marcas é FIPE quebrada, não "nenhuma marca": não serve para
  // cache. Modelos e anos vazios podem ser verdade e passam.
  if (opcoes === null || (nivel === "marcas" && opcoes.length === 0)) return null;
  // A v1 devolve modelos dentro de `{modelos, anos}`, com o código em número.
  if (nivel === "modelos") {
    return { modelos: opcoes.map((o) => ({ codigo: Number(o.codigo), nome: o.nome })), anos: [] };
  }
  return opcoes;
}

export type BuscarNaFipe = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface RespostaDaFipe {
  status: number;
  corpo: unknown;
  /** Só resposta boa vai para o cache de borda. */
  guardar: boolean;
}

/** Quanto a rota espera a FIPE antes de desistir e deixar o navegador tentar. */
export const ESPERA_MAXIMA_MS = 8000;

export async function consultarFipeNoServidor(
  segmentos: string[],
  opcoes: { token?: string; buscar: BuscarNaFipe },
): Promise<RespostaDaFipe> {
  const pedido = lerPedidoFipe(segmentos);
  if (!pedido) return { status: 400, corpo: { error: "Caminho FIPE inválido." }, guardar: false };

  const headers: Record<string, string> = { Accept: "application/json" };
  const token = opcoes.token?.trim();
  if (token) headers["X-Subscription-Token"] = token;

  try {
    const resposta = await opcoes.buscar(urlNaV2(pedido), {
      headers,
      signal: AbortSignal.timeout(ESPERA_MAXIMA_MS),
    });
    if (!resposta.ok) {
      // O status da FIPE (429, 5xx) não vai para o cliente: para ele, a porta
      // da loja falhou e é hora da reserva. O motivo fica no log do servidor.
      console.warn(`[FIPE] ${pedido.nivel} respondeu ${resposta.status}`);
      return { status: 502, corpo: { error: "A FIPE não respondeu." }, guardar: false };
    }
    const corpo = paraFormatoV1(pedido.nivel, await resposta.json());
    if (corpo === null) {
      console.warn(`[FIPE] ${pedido.nivel} veio num formato inesperado`);
      return { status: 502, corpo: { error: "A FIPE respondeu num formato inesperado." }, guardar: false };
    }
    return { status: 200, corpo, guardar: true };
  } catch (erro) {
    console.warn(`[FIPE] ${pedido.nivel} falhou:`, (erro as Error)?.message);
    return { status: 502, corpo: { error: "A FIPE não respondeu." }, guardar: false };
  }
}
