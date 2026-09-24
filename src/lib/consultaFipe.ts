/**
 * Consulta à tabela FIPE pela API pública parallelum — a mesma que a
 * `/avaliacao` usa em `AutoAvaliacao.tsx`, agora como lib reusável.
 *
 * Roda no NAVEGADOR, como lá: não há cliente de FIPE no servidor, e a API não
 * pede chave. `buscar` é injetável para o teste não depender da rede.
 *
 * `AutoAvaliacao.tsx` continua com a cópia dele por enquanto: o funil
 * `/avaliacao` não pode quebrar em fase nenhuma (CLAUDE.md), e trocá-lo não é
 * assunto do repasse.
 */
export const FIPE_BASE = "https://parallelum.com.br/fipe/api/v1";

export type TipoFipe = "carros" | "motos" | "caminhoes";

export interface OpcaoFipe {
  codigo: string;
  nome: string;
}

export interface ValorFipe {
  valor: number;
  codigo: string;
  mesReferencia: string;
}

export type Buscar = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

const buscarPadrao: Buscar = (url) => fetch(url);

/** "R$ 42.100,00" → 42100. Zero, vazio ou lixo → null. */
export function valorFipeEmNumero(bruto: unknown): number | null {
  if (typeof bruto !== "string") return null;
  const limpo = bruto.replace(/[^\d,]/g, "").replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function comoOpcoes(lista: unknown): OpcaoFipe[] {
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const { codigo, nome } = x as { codigo?: unknown; nome?: unknown };
    if (codigo === undefined || codigo === null || typeof nome !== "string") return [];
    return [{ codigo: String(codigo), nome }];
  });
}

async function lerJson(buscar: Buscar, url: string): Promise<unknown> {
  const resposta = await buscar(url);
  if (!resposta.ok) throw new Error(`A FIPE não respondeu: ${url}`);
  return resposta.json();
}

const trecho = (codigo: string) => encodeURIComponent(codigo);

export async function listarMarcas(tipo: TipoFipe, buscar: Buscar = buscarPadrao): Promise<OpcaoFipe[]> {
  return comoOpcoes(await lerJson(buscar, `${FIPE_BASE}/${tipo}/marcas`));
}

export async function listarModelos(tipo: TipoFipe, marca: string, buscar: Buscar = buscarPadrao): Promise<OpcaoFipe[]> {
  const dados = await lerJson(buscar, `${FIPE_BASE}/${tipo}/marcas/${trecho(marca)}/modelos`);
  const modelos = dados && typeof dados === "object" ? (dados as { modelos?: unknown }).modelos : undefined;
  return comoOpcoes(modelos);
}

export async function listarAnos(
  tipo: TipoFipe,
  marca: string,
  modelo: string,
  buscar: Buscar = buscarPadrao,
): Promise<OpcaoFipe[]> {
  return comoOpcoes(await lerJson(buscar, `${FIPE_BASE}/${tipo}/marcas/${trecho(marca)}/modelos/${trecho(modelo)}/anos`));
}

export async function consultarValor(
  tipo: TipoFipe,
  marca: string,
  modelo: string,
  ano: string,
  buscar: Buscar = buscarPadrao,
): Promise<ValorFipe | null> {
  const dados = await lerJson(
    buscar,
    `${FIPE_BASE}/${tipo}/marcas/${trecho(marca)}/modelos/${trecho(modelo)}/anos/${trecho(ano)}`,
  );
  if (!dados || typeof dados !== "object") return null;
  const { Valor, CodigoFipe, MesReferencia } = dados as { Valor?: unknown; CodigoFipe?: unknown; MesReferencia?: unknown };
  const valor = valorFipeEmNumero(Valor);
  if (valor === null) return null;
  return {
    valor,
    codigo: typeof CodigoFipe === "string" ? CodigoFipe : "",
    mesReferencia: typeof MesReferencia === "string" ? MesReferencia.trim() : "",
  };
}
