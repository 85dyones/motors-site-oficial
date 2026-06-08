import { getEstoque, Veiculo } from "./supabase";

export interface MatchOptions {
  tags?: string[];
  budget?: number;
}

/**
 * Maps vehicle characteristics to a list of matching tags dynamically.
 * Enables high-fidelity semantic filtering of both live and mock catalog records.
 */
export function getVehicleTags(veiculo: Veiculo): string[] {
  const tags: string[] = [];
  const marca = veiculo.marca.toLowerCase();
  const modelo = veiculo.modelo.toLowerCase();
  const versao = veiculo.versao.toLowerCase();
  const opcionais = veiculo.opcionais.toLowerCase();
  const combustivel = veiculo.combustivel.toLowerCase();
  const preco = veiculo.preco_promocional > 0 ? veiculo.preco_promocional : veiculo.preco_original;
  
  // Safe extraction of dynamic columns from live db mapping
  const tipo = veiculo.tipo?.toLowerCase() || "";
  const perfilUso = veiculo.perfil_uso?.toLowerCase() || "";

  // SUV / Offroad tags
  if (
    tipo.includes("suv") ||
    modelo.includes("suv") || 
    modelo.includes("defender") || 
    modelo.includes("x5") || 
    modelo.includes("renegade") ||
    modelo.includes("duster") ||
    modelo.includes("taos") ||
    modelo.includes("cross") ||
    modelo.includes("ecosport") ||
    opcionais.includes("suspensão pneumática") ||
    opcionais.includes("reboque")
  ) {
    tags.push("suv", "suvs", "offroad");
  }

  // Luxury / Premium tags
  if (
    preco > 100000 || 
    perfilUso.includes("premium") ||
    perfilUso.includes("performance") ||
    marca.includes("porsche") || 
    marca.includes("land rover") || 
    marca.includes("bmw") || 
    marca.includes("mercedes") || 
    versao.includes("luxury") || 
    versao.includes("hse") ||
    versao.includes("griffe") ||
    versao.includes("highline") ||
    opcionais.includes("burmester") || 
    opcionais.includes("meridian") || 
    opcionais.includes("harman kardon") ||
    opcionais.includes("laserlight")
  ) {
    tags.push("luxury", "luxo", "premium");
  }

  // Sport / Esportivo tags
  if (
    marca.includes("porsche") || 
    marca.includes("harley") ||
    modelo.includes("911") || 
    modelo.includes("twister") ||
    versao.includes("m sport") || 
    versao.includes("r-line") ||
    perfilUso.includes("performance") ||
    opcionais.includes("esportivo") || 
    opcionais.includes("pdk")
  ) {
    tags.push("sport", "esportivo");
  }

  // Economic / Economico tags
  if (
    preco < 80000 || 
    perfilUso.includes("econ") || 
    perfilUso.includes("diário") ||
    perfilUso.includes("diario") ||
    tipo.includes("motocicleta") ||
    modelo.includes("dolphin") || 
    combustivel.includes("elétrico")
  ) {
    tags.push("economic", "economico", "popular");
  }

  // Electric tags
  if (combustivel.includes("elétrico") || combustivel.includes("ev") || combustivel.includes("eletrico")) {
    tags.push("electric", "eletrico", "ev");
  }

  // Hybrid tags
  if (combustivel.includes("híbrido") || combustivel.includes("hibrido") || combustivel.includes("mhev")) {
    tags.push("hybrid", "hibrido");
  }

  return tags;
}

/**
 * Core query helper to retrieve, filter, and prioritize premium recommendations.
 */
export async function matchVehicles(options: MatchOptions): Promise<Veiculo[]> {
  const { tags = [], budget } = options;
  const estoque = await getEstoque();

  const filtered = estoque.filter((veiculo) => {
    // 1. Budget Filter (filters based on the active/discounted price)
    const precoEfetivo = veiculo.preco_promocional > 0 ? veiculo.preco_promocional : veiculo.preco_original;
    if (budget !== undefined && precoEfetivo > budget) {
      return false;
    }

    // 2. Tags Filter (if tag constraints are passed)
    if (tags.length > 0) {
      const vehicleTags = getVehicleTags(veiculo);
      const normalizedQueryTags = tags.map(t => t.toLowerCase().trim());
      // Match at least one of the tags
      return normalizedQueryTags.some(tag => vehicleTags.includes(tag));
    }

    return true;
  });

  // Sort matched vehicles
  // Priority:
  // 1. Number of matching tags (descending) - higher relevance first
  // 2. Price (descending) - premium vehicles first
  return filtered.sort((a, b) => {
    const precoA = a.preco_promocional > 0 ? a.preco_promocional : a.preco_original;
    const precoB = b.preco_promocional > 0 ? b.preco_promocional : b.preco_original;

    if (tags.length > 0) {
      const tagsA = getVehicleTags(a);
      const tagsB = getVehicleTags(b);
      const queryTags = tags.map(t => t.toLowerCase().trim());

      const countA = queryTags.filter(t => tagsA.includes(t)).length;
      const countB = queryTags.filter(t => tagsB.includes(t)).length;

      if (countA !== countB) {
        return countB - countA; // More matching tags come first
      }
    }

    // Secondary sorting: highest price first (Premium preference)
    return precoB - precoA;
  });
}
