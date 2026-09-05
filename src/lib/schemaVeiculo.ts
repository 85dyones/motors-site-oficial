import type { Veiculo } from "../types";
import { nomeComAno } from "./nomeDoVeiculo";
import { REFERENCIA_DA_LOJA } from "./schemaLoja";
import { SITE_URL } from "./site";

/**
 * O `Car` da ficha do veículo — completo, e com o nome que o cliente lê.
 *
 * O site já publicava `Car` desde o começo; o problema eram os campos. A
 * auditoria de 24/08/2026 (§0.5.5 itens 2, 3 e 4) achou três defeitos:
 *
 *   1. `name` com a versão repetida — "Jeep Renegade S T270 1.3 Tb 4x4 Flex Aut
 *      s t270 1.3 tb 4x4 flex aut". A deduplicação existia no `<title>` desde
 *      o P3 da `docs/RECOMENDACAO_SEO.md` e nunca chegou ao JSON-LD;
 *   2. sem `sku`, `bodyType`, `itemCondition` na raiz nem `numberOfPreviousOwners`;
 *   3. `Offer` sem `seller` nem `availableAtOrFrom` — o veículo não dizia quem
 *      o vende, então o Google não ligava a oferta à loja física, que é o
 *      sinal que sustenta o resultado local.
 *
 * O que NÃO está aqui é tão deliberado quanto o que está: `numberOfDoors` e
 * `vehicleSeatingCapacity` não existem em `estoque_motors`. Deduzi-los da
 * carroceria daria certo na maioria e erraria no Kombi, na picape cabine
 * simples e no cupê — e schema errado é pior que campo ausente, porque é
 * afirmação. Quando as colunas existirem, entram aqui.
 */

/**
 * `vehicleTransmission` no vocabulário do schema.org.
 *
 * O feed manda texto livre ("Automático", "Automatizado", "Manual"). O
 * schema.org aceita texto, mas os consumidores (Google incluído) reconhecem os
 * três termos canônicos — e só eles casam entre um anúncio e outro. Câmbio que
 * não casa com nenhum passa adiante como veio: melhor o dado real do que um
 * enum chutado.
 */
export function transmissaoDoSchema(cambio: string | null | undefined): string | undefined {
  const bruto = (cambio ?? "").trim();
  if (!bruto) return undefined;

  const normal = bruto.toLowerCase();
  if (/autom/.test(normal)) return "AutomaticTransmission";
  if (/manual/.test(normal)) return "ManualTransmission";
  if (/cvt|dsg|dct|tiptronic/.test(normal)) return "AutomaticTransmission";
  return bruto;
}

/**
 * Até quando o preço vale.
 *
 * O Google marca oferta sem `priceValidUntil` como incompleta e oferta com data
 * vencida como expirada — o pior dos dois mundos seria uma data fixa no código,
 * que envelhece em silêncio. Trinta dias à frente, recalculados a cada
 * revalidação da ficha (de hora em hora), é a janela que corresponde ao ritmo
 * real de reprecificação de um estoque de seminovos.
 */
export function precoValidoAte(base = new Date()): string {
  const data = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
  return data.toISOString().slice(0, 10);
}

/**
 * Quantas fotos entram no `image` do `Car`.
 *
 * O schema.org aceita uma ou muitas, e o Google recomenda várias — mas a régua
 * aqui não é "quanto mais, melhor". O estoque tem fichas com trinta e poucas
 * fotos, e despejar todas num nó que já carrega preço, oferta e loja infla o
 * JSON-LD de cada uma das ~40 fichas sem acrescentar informação: as primeiras
 * são as que o cadastro ordena para vender, e da décima em diante são detalhe
 * de porta-malas e pneu.
 *
 * Dez é o que o Google usa como teto prático em galeria de produto, e mantém a
 * primeira posição — que é a imagem principal — intocada.
 */
export const MAXIMO_DE_IMAGENS = 10;

/**
 * As fotos do veículo, na ordem do cadastro.
 *
 * Até 2026-09-05 o `Car` publicava **uma**: `web_full_images[0]`. A ficha
 * mostra a galeria inteira, e o schema dizia que existia uma foto — quem lê o
 * dado estruturado (Google Imagens, painel de conhecimento, assistente) via um
 * carro com uma foto só.
 *
 * `web_full_images` primeiro porque é a versão de site; as do WhatsApp são o
 * fallback de quem ainda não tem o conjunto completo, e são as mesmas fotos em
 * outra resolução. Concatenar os dois duplicaria a mesma imagem em duas URLs —
 * por isso é `||`, e não `[...a, ...b]`.
 *
 * Filtra vazio e duplicata: URL repetida no array é a mesma foto declarada duas
 * vezes, e alguns validadores reclamam.
 */
export function galeriaDoSchema(
  veiculo: Pick<Veiculo, "web_full_images" | "whatsapp_images">,
): string[] {
  const fonte = veiculo.web_full_images?.length
    ? veiculo.web_full_images
    : veiculo.whatsapp_images ?? [];

  const limpas = (fonte ?? [])
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(Boolean);

  return [...new Set(limpas)].slice(0, MAXIMO_DE_IMAGENS);
}

export interface OpcoesDoSchemaDoVeiculo {
  /** Caminho da ficha, como `getVeiculoPdpUrl` devolve. */
  caminho: string;
  /** Veio de `decidirPublicacao`: fora do feed conta como fora de estoque. */
  indisponivel: boolean;
}

export function schemaDoVeiculo(veiculo: Veiculo, opcoes: OpcoesDoSchemaDoVeiculo) {
  const url = `${SITE_URL}${opcoes.caminho}`;
  const temDesconto =
    veiculo.preco_promocional > 0 && veiculo.preco_promocional < veiculo.preco_original;
  const preco = temDesconto ? veiculo.preco_promocional : veiculo.preco_original;
  const imagens = galeriaDoSchema(veiculo);
  const motor = (veiculo.motor ?? "").trim();
  const donos = Number(veiculo.donos_anteriores);

  return {
    "@context": "https://schema.org",
    "@type": "Car",
    // O `#car` separa o nó do veículo da página que o hospeda — é o que permite
    // a outro nó (uma listagem, uma oferta) apontar para o carro e não para a URL.
    "@id": `${url}#car`,
    name: nomeComAno(veiculo),
    url,
    image: imagens.length > 0 ? imagens : undefined,
    description:
      veiculo.descricao_seo ||
      veiculo.descricao ||
      `${nomeComAno(veiculo)} em Curitiba, com perícia cautelar independente.`,
    brand: { "@type": "Brand", name: veiculo.marca },
    model: veiculo.modelo,
    vehicleConfiguration: (veiculo.versao ?? "").trim() || undefined,
    // O ID do estoque é o mesmo que fecha a URL da ficha e que o feed XML
    // publica. Manter os três iguais é o que faz remarketing dinâmico casar
    // anúncio com veículo — divergência aqui é anúncio em branco.
    sku: String(veiculo.id),
    mpn: String(veiculo.id),
    vehicleModelDate: veiculo.ano,
    modelDate: veiculo.ano ? String(veiculo.ano) : undefined,
    color: (veiculo.cor ?? "").trim() || undefined,
    bodyType: (veiculo.tipo ?? "").trim() || undefined,
    vehicleTransmission: transmissaoDoSchema(veiculo.cambio),
    fuelType: (veiculo.combustivel ?? "").trim() || undefined,
    vehicleEngine: motor
      ? { "@type": "EngineSpecification", engineType: motor, fuelType: veiculo.combustivel || undefined }
      : undefined,
    mileageFromOdometer: {
      "@type": "QuantitativeValue",
      value: veiculo.quilometragem,
      unitCode: "KMT",
    },
    // Só quando a ficha do painel sabe. `0` é informação legítima ("nunca
    // transferido") e precisa passar; `undefined` e `NaN`, não.
    numberOfPreviousOwners: Number.isFinite(donos) ? donos : undefined,
    itemCondition: "https://schema.org/UsedCondition",
    offers: {
      "@type": "Offer",
      // String com duas casas: `105900` é lido como número e alguns validadores
      // reclamam da ausência de centavos numa moeda que os tem.
      price: preco.toFixed(2),
      priceCurrency: "BRL",
      // Fora do feed conta como fora de estoque. Antes daqui, o carro que saiu
      // do feed continuava com `vendido = false` no banco e a PDP declarava
      // `InStock` com preço — o Google mostrava a oferta como válida.
      availability: opcoes.indisponivel
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock",
      itemCondition: "https://schema.org/UsedCondition",
      url,
      priceValidUntil: precoValidoAte(),
      // Quem vende e onde se retira — as duas pontas que ligam a oferta à loja
      // física. É por elas que o `AutoDealer` da home deixa de ser um bloco
      // solto e passa a ser o vendedor de 39 ofertas.
      seller: REFERENCIA_DA_LOJA,
      availableAtOrFrom: REFERENCIA_DA_LOJA,
    },
  };
}

