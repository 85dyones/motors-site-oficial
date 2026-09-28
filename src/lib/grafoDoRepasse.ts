/**
 * Os nós de JSON-LD da seção de repasse (spec §7.1 e §7.2, decisão 17 do
 * PR 3) — montados aqui, e não no JSX, pelo motivo de `grafoDaFicha.ts`: array
 * de nós escrito no `<script>` é montagem sem teste. Quem guarda o que as
 * rotas SERVEM são `tests/pagina-do-repasse-no-ar.test.ts` e
 * `tests/ficha-do-repasse-no-ar.test.ts`, que renderizam e contam.
 *
 * O `Car` do repasse NÃO tem `sku`/`mpn`: o id do repasse não existe no
 * catálogo da Meta nem no feed, e o remarketing casaria anúncio com nada
 * (spec §8).
 */
import type { CompanySettings, Veiculo } from "../types";
import { nomeComAno } from "./nomeDoVeiculo";
import { CAMINHO_DO_REPASSE, TITULO_DO_REPASSE } from "./paginaDoRepasse";
import { estadoDoRepasse, type Repasse } from "./repasse";
import { REFERENCIA_DA_LOJA, schemaDaLoja, schemaDoSite } from "./schemaLoja";
import { schemaDePerguntas, schemaDeTrilha, type DegrauDaTrilha, type PerguntaDeSchema } from "./schemaListagem";
import { galeriaDoSchema, precoValidoAte, transmissaoDoSchema } from "./schemaVeiculo";
import { TIPO_NO_FEED } from "./similares";
import { SITE_URL } from "./site";

/**
 * Aberto a todos: `InStock`. Vendido: `SoldOut`. Reservado e só-lojistas:
 * `LimitedAvailability` — o carro existe e tem preço, mas o público não fecha
 * hoje (decisão 21 do plano).
 */
export function disponibilidadeDoRepasse(r: Pick<Repasse, "situacao" | "aberto_ao_publico_em">): string {
  const estado = estadoDoRepasse(r);
  if (estado === "aberto") return "https://schema.org/InStock";
  if (estado === "vendido") return "https://schema.org/SoldOut";
  return "https://schema.org/LimitedAvailability";
}

export function schemaDoRepasse(r: Repasse, caminho: string) {
  const url = `${SITE_URL}${caminho}`;
  const imagens = galeriaDoSchema(r);
  return {
    "@context": "https://schema.org",
    "@type": "Car",
    "@id": `${url}#car`,
    name: nomeComAno({ marca: r.marca, modelo: r.modelo, versao: r.versao, ano: r.ano_modelo }),
    url,
    image: imagens.length > 0 ? imagens : undefined,
    description: r.resumo ?? undefined,
    brand: { "@type": "Brand", name: r.marca },
    model: r.modelo,
    vehicleConfiguration: (r.versao ?? "").trim() || undefined,
    vehicleModelDate: r.ano_modelo,
    modelDate: String(r.ano_modelo),
    productionDate: r.ano_fabricacao ? String(r.ano_fabricacao) : undefined,
    color: (r.cor ?? "").trim() || undefined,
    bodyType: (r.carroceria ? TIPO_NO_FEED[r.carroceria] : "") || undefined,
    vehicleTransmission: transmissaoDoSchema(r.cambio),
    fuelType: (r.combustivel ?? "").trim() || undefined,
    mileageFromOdometer: { "@type": "QuantitativeValue", value: r.quilometragem, unitCode: "KMT" },
    itemCondition: "https://schema.org/UsedCondition",
    offers: {
      "@type": "Offer",
      price: r.preco.toFixed(2),
      priceCurrency: "BRL",
      availability: disponibilidadeDoRepasse(r),
      itemCondition: "https://schema.org/UsedCondition",
      url,
      priceValidUntil: precoValidoAte(),
      seller: REFERENCIA_DA_LOJA,
      availableAtOrFrom: REFERENCIA_DA_LOJA,
    },
  };
}

/** A ficha: `Car` (com a `Offer`), `BreadcrumbList`, `AutoDealer` e `WebSite`. */
export function grafoDoRepasse(opcoes: {
  repasse: Repasse;
  caminho: string;
  trilha: DegrauDaTrilha[];
  empresa: CompanySettings;
  /** Só para a faixa de preço do `AutoDealer`. */
  disponiveis: Veiculo[];
}): unknown[] {
  return [
    schemaDoRepasse(opcoes.repasse, opcoes.caminho),
    schemaDeTrilha(opcoes.trilha),
    schemaDaLoja(opcoes.empresa, { disponiveis: opcoes.disponiveis }),
    schemaDoSite(opcoes.empresa),
  ];
}

/** `ItemList` dos carros ABERTOS A TODOS; null quando não há nenhum. */
export function schemaDosRepassesAbertos(repasses: Repasse[]) {
  const abertos = repasses.filter((r) => estadoDoRepasse(r) === "aberto");
  if (abertos.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: TITULO_DO_REPASSE,
    numberOfItems: abertos.length,
    itemListElement: abertos.map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}${CAMINHO_DO_REPASSE}/${r.slug}`,
    })),
  };
}

/** A página: `BreadcrumbList`, `ItemList` (se houver aberto), `FAQPage`, `AutoDealer`, `WebSite`. */
export function grafoDaPaginaDoRepasse(opcoes: {
  repasses: Repasse[];
  perguntas: PerguntaDeSchema[];
  trilha: DegrauDaTrilha[];
  empresa: CompanySettings;
  disponiveis: Veiculo[];
}): unknown[] {
  const lista = schemaDosRepassesAbertos(opcoes.repasses);
  return [
    schemaDeTrilha(opcoes.trilha),
    ...(lista ? [lista] : []),
    ...(opcoes.perguntas.length > 0 ? [schemaDePerguntas(opcoes.perguntas)] : []),
    schemaDaLoja(opcoes.empresa, { disponiveis: opcoes.disponiveis }),
    schemaDoSite(opcoes.empresa),
  ];
}
