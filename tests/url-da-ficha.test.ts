import { describe, it, expect } from "vitest";
import { slugDeVersao, slugificar } from "../src/lib/veiculoUrl";
import { getVeiculoPdpUrl } from "../src/lib/supabase";

/**
 * O endereço da ficha — quatro segmentos, sem repetição (2026-08-31).
 *
 * Até esta data a URL era:
 *
 *   /carros/fiat/titano/volcano-22-16v-4x4-tb-die-aut
 *          /fiat-titano-volcano-22-16v-4x4-tb-die-aut-8171616
 *
 * O dono olhou e perguntou: *"esta url faz sentido? informações truncadas e
 * repetidas, pode ser mais clean e entregar dados relevantes para os
 * indexadores"*. Eram três defeitos somados, e este arquivo trava os três.
 *
 * A janela foi escolhida: *"o site não anuncia nada ainda, não indexou quase
 * nada, se existe um momento para alinhar e mudar, é este"*. Medido contra a
 * produção antes de mexer — 104 veículos, 67 hubs de modelo, e só **4**
 * endereços de hub mudam, todos os quatro fora do sitemap servido por já
 * serem os hubs "sujos" que canonicalizam para o irmão limpo.
 */

const veiculo = (over: Record<string, unknown> = {}) =>
  ({ id: "1", marca: "Fiat", modelo: "Titano", versao: "Volcano 2.2 16V 4x4 Tb Die. Aut.", tipo: "Picape", ...over }) as never;

describe("1 · o ponto é separador, não lixo", () => {
  it("2.2 vira 2-2, e não 22", () => {
    // Não é feiúra: `22` é um motor 2.2 anunciado como "vinte e dois". Quem lê
    // o endereço lê outro carro.
    expect(slugificar("Volcano 2.2 16V")).toBe("volcano-2-2-16v");
    expect(slugificar("1.0 Flex")).toBe("1-0-flex");
  });

  it("não deixa hífen dobrado nem sobrando na ponta", () => {
    // "2.2 " produz ponto→hífen e espaço→hífen colados; "Aut." termina em
    // hífen. Sem a limpeza a URL sai com `2-2--16v` e `-aut-`.
    expect(slugificar("2.2 16V")).toBe("2-2-16v");
    expect(slugificar("Flex Aut.")).toBe("flex-aut");
    expect(slugificar("  1.6 / 2.0  ")).toBe("1-6-2-0");
  });
});

describe("2 · as abreviações do feed abrem por extenso", () => {
  it("tb, die e aut viram turbo, diesel e automatico", () => {
    expect(slugDeVersao("Volcano 2.2 16V 4x4 Tb Die. Aut.")).toBe(
      "volcano-2-2-16v-4x4-turbo-diesel-automatico",
    );
  });

  it("expande por TOKEN INTEIRO — não come o miolo de outras palavras", () => {
    // Um `replace` solto em "aut" estragaria "autocross"; em "cd", "cdi".
    // Esta é a razão de a tabela ser aplicada token a token.
    expect(slugDeVersao("Autocross 1.8")).toBe("autocross-1-8");
    expect(slugDeVersao("C 180 CDI Classic")).toBe("c-180-cdi-classic");
    expect(slugDeVersao("Tblazer")).toBe("tblazer");
  });

  it("o que não está na tabela passa intacto", () => {
    // Na dúvida, deixa como está: URL feia é melhor que URL errada.
    expect(slugDeVersao("Msi Robust 8v Flex 2p Manual")).toBe("msi-robust-8v-flex-2p-manual");
  });

  it("`slugificar` NÃO expande — só o segmento de versão", () => {
    // Marca e modelo passam por `slugificar`. Se ele expandisse, um modelo
    // chamado "Aut" viraria "Automatico" e o hub mudaria de endereço.
    expect(slugificar("Tb Die Aut")).toBe("tb-die-aut");
  });
});

describe("3 · quatro segmentos, e o id no fim", () => {
  it("o quinto segmento redundante não existe mais", () => {
    const url = getVeiculoPdpUrl(veiculo({ id: "8171616" }));
    expect(url).toBe("/carros/fiat/titano/volcano-2-2-16v-4x4-turbo-diesel-automatico-8171616");
    expect(url.split("/").filter(Boolean)).toHaveLength(4);
  });

  it("o id é o ÚLTIMO trecho — a ficha resolve o veículo por ele", () => {
    // A rota faz `slug.split("-").pop()`. Qualquer mudança que tire o id do
    // fim serve 404 para carro que existe, e em silêncio.
    const url = getVeiculoPdpUrl(veiculo({ id: "8171616" }));
    expect(url.split("-").pop()).toBe("8171616");
  });

  it("marca e modelo não se repetem na cauda", () => {
    // O que motivou a mudança: `${marca}-${modelo}-${versao}-${id}` repetia,
    // por construção, os três segmentos anteriores.
    const url = getVeiculoPdpUrl(veiculo({ id: "9", marca: "Fiat", modelo: "Titano" }));
    const cauda = url.split("/").pop()!;
    expect(cauda.startsWith("fiat-titano")).toBe(false);
  });

  it("moto continua em /motos, e com a mesma forma", () => {
    const url = getVeiculoPdpUrl(
      veiculo({ id: "6170299", marca: "Honda", modelo: "ADV", versao: "150", tipo: "Motocicleta" }),
    );
    expect(url.startsWith("/motos/honda/adv/")).toBe(true);
    expect(url.split("/").filter(Boolean)).toHaveLength(4);
  });
});
