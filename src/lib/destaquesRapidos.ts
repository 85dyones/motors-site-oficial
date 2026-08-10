import type { QuickTag, StockOverrides, Veiculo } from "../types";
import { checkTagMatchesVehicle, precoVigente } from "./regrasEstoque";
import { slugifyTag } from "./tagUtils";

/**
 * Destaques rápidos — resolução no servidor.
 *
 * A tela 07 do design doc trata cada destaque como uma landing indexável
 * ("cada categoria vira uma landing: URL própria, título, texto editorial e
 * grade atualizada pela regra"). Home, catálogo e landing precisam todos da
 * mesma contagem, então ela vive aqui e não dentro de um componente.
 */

export const DESTAQUES_PADRAO: QuickTag[] = [
  { id: "curadoria", name: "CURADORIA EXCLUSIVA", field: "perfil_uso", operator: "equals", value: "CURADORIA EXCLUSIVA" },
  { id: "economicos", name: "ECONÔMICOS", field: "preco", operator: "less", value: "180000" },
  { id: "baixa_km", name: "BAIXA QUILOMETRAGEM", field: "quilometragem", operator: "less", value: "40000" },
  { id: "parcela_1k", name: "PARCELA 1K", field: "preco", operator: "less", value: "120000" },
];

/**
 * O row `quick_tags` já apareceu nas duas formas — array puro (como
 * `/destaques/[tag]` lê) e objeto `{ quickTags: [...] }` (como o
 * ThemeContext lê da API). Aceita as duas em vez de apostar numa.
 */
export function normalizarQuickTags(bruto: unknown): QuickTag[] {
  if (Array.isArray(bruto)) return bruto as QuickTag[];
  if (bruto && typeof bruto === "object") {
    const aninhado = (bruto as { quickTags?: unknown }).quickTags;
    if (Array.isArray(aninhado)) return aninhado as QuickTag[];
  }
  return [];
}

export function normalizarStockOverrides(bruto: unknown): StockOverrides {
  if (!bruto || typeof bruto !== "object") return {};
  const aninhado = (bruto as { overrides?: unknown }).overrides;
  if (aninhado && typeof aninhado === "object") {
    return aninhado as StockOverrides;
  }
  return bruto as StockOverrides;
}

/**
 * Resumo de uma seleção — números agregados dos veículos que estão na página.
 *
 * Substitui o box "REGRA DESTA PÁGINA", que expunha a operação da loja
 * ("Seleção manual feita no painel") numa tela pública que vai receber
 * tráfego pago. Cada campo aqui sai do estoque real da própria landing: não
 * há número estimado, e categoria sem o dado devolve `null` em vez de zero.
 */
export interface ResumoSelecao {
  precoMinimo: number | null;
  kmMinimo: number | null;
  anoMaisNovo: number | null;
  anoMaisAntigo: number | null;
  marcas: string[];
}

export function resumirSelecao(veiculos: Veiculo[]): ResumoSelecao {
  const precos = veiculos.map(precoVigente).filter((p) => p > 0);
  const kms = veiculos.map((v) => v.quilometragem).filter((k) => k > 0);
  const anos = veiculos.map((v) => v.ano).filter((a) => a > 0);

  // Ordenadas pelo peso que têm na seleção: a tela só mostra as primeiras, e
  // numa categoria de 56 carros a marca que aparece uma vez só não é o que
  // descreve a página. Empate mantém a ordem da grade (sort estável).
  const porMarca = new Map<string, number>();
  for (const v of veiculos) {
    if (!v.marca) continue;
    porMarca.set(v.marca, (porMarca.get(v.marca) ?? 0) + 1);
  }
  const marcas = [...porMarca.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);

  return {
    precoMinimo: precos.length > 0 ? Math.min(...precos) : null,
    kmMinimo: kms.length > 0 ? Math.min(...kms) : null,
    anoMaisNovo: anos.length > 0 ? Math.max(...anos) : null,
    anoMaisAntigo: anos.length > 0 ? Math.min(...anos) : null,
    marcas,
  };
}

export interface DestaqueResolvido {
  tag: QuickTag;
  slug: string;
  href: string;
  total: number;
  veiculos: Veiculo[];
}

/**
 * Casa cada destaque com o estoque e devolve só os que têm veículo.
 * Categoria vazia não vira chip nem landing — chip que leva a grade vazia
 * é pior do que chip que não existe.
 */
export function resolverDestaques(
  tags: QuickTag[],
  estoque: Veiculo[],
  stockOverrides: StockOverrides,
): DestaqueResolvido[] {
  return tags
    .map((tag) => {
      const veiculos = estoque.filter((v) =>
        checkTagMatchesVehicle(tag, v, stockOverrides),
      );
      const slug = slugifyTag(tag.name) || tag.id;
      return {
        tag,
        slug,
        href: `/destaques/${slug}`,
        total: veiculos.length,
        veiculos,
      };
    })
    .filter((d) => d.total > 0);
}
