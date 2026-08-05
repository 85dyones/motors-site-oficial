import type { QuickTag, StockOverrides, Veiculo } from "../types";
import { checkTagMatchesVehicle } from "./regrasEstoque";
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
  if (bruto && typeof bruto === "object" && Array.isArray((bruto as any).quickTags)) {
    return (bruto as any).quickTags as QuickTag[];
  }
  return [];
}

export function normalizarStockOverrides(bruto: unknown): StockOverrides {
  if (!bruto || typeof bruto !== "object") return {};
  const comChave = bruto as any;
  if (comChave.overrides && typeof comChave.overrides === "object") {
    return comChave.overrides as StockOverrides;
  }
  return bruto as StockOverrides;
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
