import type { QuickTag, StockOverrides, Veiculo } from "../types";

/**
 * Regras de leitura do estoque.
 *
 * Estavam dentro de `HeroSection.tsx` ("use client"). O redesign precisa
 * delas no servidor — home, catálogo e landings de destaque renderizam a
 * grade no servidor por SEO — então a regra mudou de lugar, não de
 * comportamento. `HeroSection` reexporta para não quebrar quem já importava.
 */

export function resolveTipoCombustivel(car: Veiculo): string {
  const c = (car.combustivel || "").toLowerCase();
  if (c.includes("flex")) return "Flex";
  if (c.includes("álcool") || c.includes("alcool")) return "Álcool";
  if (c.includes("elétrico") || c.includes("eletrico") || c.includes("ev")) return "Elétrico";
  if (c.includes("híbrido") || c.includes("hibrido") || c.includes("mhev")) return "Híbrido";
  if (c.includes("diesel")) return "Diesel";
  if (c.includes("gasolina")) return "Gasolina";
  return car.combustivel || "Flex";
}

/**
 * Preço vigente: promocional quando existe e é menor que o original.
 *
 * O parâmetro é o recorte de dois campos, e não `Veiculo` inteiro, porque desde
 * 2026-08-25 o `priceRange` do `AutoDealer` e as faixas de preço chamam daqui —
 * e o que eles têm em mãos nem sempre é a linha completa do estoque. Nenhum
 * chamador existente muda: `Veiculo` satisfaz o recorte.
 */
export function precoVigente(car: Pick<Veiculo, "preco_original" | "preco_promocional">): number {
  return car.preco_promocional > 0 && car.preco_promocional < car.preco_original
    ? car.preco_promocional
    : car.preco_original;
}

export function checkTagMatchesVehicle(
  tag: QuickTag,
  car: Veiculo,
  stockOverrides: StockOverrides,
): boolean {
  // Associação manual feita no painel vence a regra automática
  const manualTags = stockOverrides?.[car.id]?.quick_tags || [];
  if (manualTags.includes(tag.id)) {
    return true;
  }

  if (tag.field === "manual" || tag.operator === "none") {
    return false;
  }

  // Fallback histórico da tag "economicos": além do teto de preço, elétrico
  // e híbrido entram na categoria.
  if (tag.id === "economicos" && tag.field === "preco" && tag.operator === "less" && tag.value === "180000") {
    const p = precoVigente(car);
    const combustivel = resolveTipoCombustivel(car);
    return p < 180000 || combustivel === "Elétrico" || combustivel === "Híbrido";
  }

  let fieldValue: string | number;
  if (tag.field === "preco") {
    fieldValue = precoVigente(car);
  } else if (tag.field === "quilometragem") {
    fieldValue = car.quilometragem;
  } else if (tag.field === "combustivel") {
    fieldValue = resolveTipoCombustivel(car);
  } else if (tag.field === "perfil_uso") {
    fieldValue = car.perfil_uso || "";
  } else if (tag.field === "tipo") {
    fieldValue = car.tipo || "";
  } else if (tag.field === "marca") {
    fieldValue = car.marca || "";
  } else {
    // `tag.field` é aberto no schema: uma categoria criada no painel pode
    // apontar para qualquer coluna do veículo.
    const bruto = (car as unknown as Record<string, unknown>)[tag.field];
    fieldValue = typeof bruto === "number" ? bruto : String(bruto ?? "");
  }

  const strFieldValue = String(fieldValue).toLowerCase().trim();
  const ruleValue = tag.value.toLowerCase().trim();

  switch (tag.operator) {
    case "equals":
      return strFieldValue === ruleValue;
    case "contains":
      return strFieldValue.includes(ruleValue);
    case "less":
      return Number(fieldValue) < Number(tag.value);
    case "greater":
      return Number(fieldValue) > Number(tag.value);
    default:
      return false;
  }
}
