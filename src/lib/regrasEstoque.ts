import type { CondicaoDeTag, QuickTag, StockOverrides, Veiculo } from "../types";

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

/**
 * As condições da regra, nas duas formas em que ela existe.
 *
 * ---------------------------------------------------------------------------
 * Por que duas formas, e por que isso não vira migração
 * ---------------------------------------------------------------------------
 * A curadoria nasceu com UMA condição por categoria — um campo, um operador,
 * um valor. Depois que `perfis_uso` virou múltipla escolha e as carrocerias
 * ganharam `Perua`, `Van` e `Utilitário`, o que passou a fazer falta foi
 * justamente a combinação: "SUV para família", "automático com baixa km".
 * Nenhuma delas cabe numa condição só.
 *
 * As tags gravadas em produção estão na forma antiga. Traduzir aqui, na
 * leitura, é o que dispensa mexer no banco: `baixa_km` e a campanha do mês
 * continuam funcionando sem ninguém tocar nelas, e o painel passa a gravar
 * `condicoes` para as novas.
 */
export function condicoesDaTag(tag: QuickTag): CondicaoDeTag[] {
  if (Array.isArray(tag.condicoes) && tag.condicoes.length > 0) return tag.condicoes;
  if (!tag.field) return [];
  return [
    {
      field: tag.field,
      operator: tag.operator ?? "equals",
      value: tag.value ?? "",
    },
  ];
}

/** Uma condição contra um veículo. O corpo é o que a regra sempre fez. */
function condicaoCasa(cond: CondicaoDeTag, car: Veiculo): boolean {
  if (cond.field === "manual" || cond.operator === "none") return false;

  let fieldValue: string | number;
  if (cond.field === "preco") {
    fieldValue = precoVigente(car);
  } else if (cond.field === "quilometragem") {
    fieldValue = car.quilometragem;
  } else if (cond.field === "combustivel") {
    fieldValue = resolveTipoCombustivel(car);
  } else if (cond.field === "perfil_uso") {
    // Desde 20260826230000 o perfil é uma LISTA. Uma categoria criada no painel
    // sobre "Estilo de Vida" tem de casar se QUALQUER perfil do carro bater —
    // com `equals` contra o campo antigo, todo carro de dois perfis deixaria de
    // casar no dia da migração, e nada acusaria.
    const perfis = car.perfis_uso ?? [];
    if (perfis.length > 0) {
      const alvo = cond.value.toLowerCase().trim();
      const casa = perfis.some((p) => {
        const atual = p.toLowerCase().trim();
        return cond.operator === "contains" ? atual.includes(alvo) : atual === alvo;
      });
      if (cond.operator === "equals" || cond.operator === "contains") return casa;
    }
    fieldValue = car.perfil_uso || "";
  } else if (cond.field === "tipo") {
    fieldValue = car.tipo || "";
  } else if (cond.field === "marca") {
    fieldValue = car.marca || "";
  } else {
    // `field` é aberto na leitura: uma categoria pode apontar para qualquer
    // coluna do veículo. É por aqui que `cambio` e `ano` funcionam sem caso
    // próprio.
    const bruto = (car as unknown as Record<string, unknown>)[cond.field];
    fieldValue = typeof bruto === "number" ? bruto : String(bruto ?? "");
  }

  const strFieldValue = String(fieldValue).toLowerCase().trim();
  const ruleValue = cond.value.toLowerCase().trim();

  switch (cond.operator) {
    case "equals":
      return strFieldValue === ruleValue;
    case "contains":
      return strFieldValue.includes(ruleValue);
    case "less":
      return Number(fieldValue) < Number(cond.value);
    case "greater":
      return Number(fieldValue) > Number(cond.value);
    default:
      return false;
  }
}

/**
 * O veículo entra nesta categoria da curadoria?
 *
 * Associação manual feita no painel vence qualquer regra — é como a campanha
 * do mês monta a vitrine, escolhendo carro a carro.
 *
 * Fora dela, **todas** as condições precisam casar. É E, e não OU, porque o
 * que se pede a uma curadoria é estreitar: "SUV" e "família" juntos devolvem
 * menos carros que qualquer um dos dois, e é isso que a torna útil ao lado de
 * `/estoque/{recorte}`, que já corta por um eixo só.
 *
 * Sem condição avaliável (categoria manual, ou lista vazia), a resposta é
 * `false`: só entra quem foi escolhido à mão.
 */
export function checkTagMatchesVehicle(
  tag: QuickTag,
  car: Veiculo,
  stockOverrides: StockOverrides,
): boolean {
  const manualTags = stockOverrides?.[car.id]?.quick_tags || [];
  if (manualTags.includes(tag.id)) {
    return true;
  }

  const condicoes = condicoesDaTag(tag).filter(
    (c) => c.field !== "manual" && c.operator !== "none",
  );
  if (condicoes.length === 0) return false;

  return condicoes.every((c) => condicaoCasa(c, car));
}

