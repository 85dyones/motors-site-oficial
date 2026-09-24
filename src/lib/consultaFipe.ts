/**
 * Consulta à tabela FIPE — a cascata marcas → modelos → anos → valor.
 *
 * Nasceu em 24/09/2026 tirando a cascata de dentro de `AutoAvaliacao.tsx`, com
 * a interface que o plano do Repasse (Task 5 de
 * `docs/superpowers/plans/2026-09-24-repasse-pr1-dados.md`) já tinha desenhado
 * para `src/lib/consultaFipe.ts`: o editor do repasse chama as mesmas funções.
 *
 * ---------------------------------------------------------------------------
 * Por que saiu do componente: a FIPE derrubava a /avaliacao
 * ---------------------------------------------------------------------------
 * A API pública (parallelum, sem token) tem teto de 500 consultas por dia POR
 * IP. Estourado, ela responde 429 com `{"error": "limite de taxa excedido…"}`.
 * O componente não olhava `res.ok` na lista de marcas: guardava o objeto de
 * erro no lugar da lista, o `.map` da renderização lançava e a página inteira
 * caía em "Esta página não carregou". Reproduzido em 24/09/2026 com a resposta
 * exata da API. Operadora de celular põe muita gente atrás do mesmo IP, então
 * o teto não é problema só de quem consulta muito.
 *
 * Duas defesas moram aqui:
 *
 * - **Toda resposta é conferida.** Erro HTTP lança (`lerJson`); formato
 *   inesperado vira lista vazia ou `null` (`comoOpcoes`, `consultarValor`) —
 *   nunca um objeto no lugar de uma lista. Quem chama decide o que fazer com a
 *   falha; a `/avaliacao` passa o cliente para o preenchimento à mão.
 * - **A busca padrão tem reserva.** Primeiro a nossa rota (`/api/fipe/…`),
 *   que consulta a FIPE do servidor com o token da loja e deixa a resposta em
 *   cache na borda; se ela falhar, a API pública direto do navegador, como era
 *   antes. As funções continuam recebendo a URL pública — a troca de porta é
 *   da busca, não da cascata, e por isso `buscar` segue injetável no teste.
 */
export const FIPE_BASE = "https://parallelum.com.br/fipe/api/v1";

/**
 * A mesma árvore de caminhos da `FIPE_BASE`, servida por
 * `src/app/api/fipe/[...caminho]/route.ts`.
 */
export const FIPE_NA_LOJA = "/api/fipe";

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

/**
 * Busca pela rota da loja e, se ela não servir, pela API pública.
 *
 * "Não servir" é qualquer coisa que não seja 2xx: 429 do limite da própria
 * rota, 502 da FIPE fora, 404 num ambiente sem a rota. A exceção de rede
 * também cai na reserva. URL que não é da `FIPE_BASE` vai direto, sem desvio.
 */
export function criarBuscaComReserva(rede: Buscar): Buscar {
  return async (url) => {
    if (url.startsWith(`${FIPE_BASE}/`)) {
      try {
        const pelaLoja = await rede(FIPE_NA_LOJA + url.slice(FIPE_BASE.length));
        if (pelaLoja.ok) return pelaLoja;
      } catch {
        // cai na API pública
      }
    }
    return rede(url);
  };
}

const buscarPadrao: Buscar = criarBuscaComReserva((url) => fetch(url));

/** "R$ 42.100,00" → 42100. Zero, vazio ou lixo → null. */
export function valorFipeEmNumero(bruto: unknown): number | null {
  if (typeof bruto !== "string") return null;
  const limpo = bruto.replace(/[^\d,]/g, "").replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 42100 → "R$ 42.100,00", o texto que a API devolve.
 *
 * A `/avaliacao` mostra e envia o valor nesse formato desde sempre — o n8n e
 * `fipeParaNumero` leem assim. Espaço comum depois do "R$", e não o não
 * separável que o `style: "currency"` do `Intl` põe: é o que a API manda.
 */
export function formatarValorFipe(valor: number): string {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
