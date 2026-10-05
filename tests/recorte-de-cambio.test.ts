import { describe, it, expect } from "vitest";
import type { Veiculo } from "../src/types";
import {
  acharHubDeCambio,
  caminhosDosHubs,
  CARROCERIAS_COM_HUB,
  FAIXAS_DE_PRECO,
  hubsDeCambio,
  RECORTES_APOSENTADOS,
} from "../src/lib/hubsDeEstoque";
import { ehSlugDeCambio, RECORTES_DE_CAMBIO } from "../src/lib/recortesDeCambio";
import { CARROCERIAS } from "../src/lib/classificacaoVeiculo";
import { PERFIS_DE_USO } from "../src/lib/perfisDeUso";
import { ehAutomatico } from "../src/lib/fichaDoMotor";
import { mapVeiculoDbToVeiculo } from "../src/lib/supabase";
import { slugificar } from "../src/lib/veiculoUrl";
import { fonteDoTipoDePagina, tipoDaPagina } from "../src/lib/dataLayer";
import { SUBTITULO_DA_LEITURA, textoDeCambio } from "../src/lib/textoDosHubs";
import { lerCodigo } from "./fonte";

/**
 * `/estoque/automatico`, a quarta família de `/estoque/[recorte]` (05/10/2026).
 *
 * O Planejador de Palavras-chave (`conteudo-seo/palavras-chave.md`) mostrou
 * procura por carro automático usado em Curitiba, e o site só tinha o filtro
 * `?cambio=`, que é `noindex`. A página nasce como as faixas de preço: lista
 * fechada, existe sempre, entra no sitemap mesmo vazia.
 *
 * O que estes testes prendem é o que quebraria em silêncio: carro manual na
 * página de automático, a página sumindo com o último automático do pátio, o
 * slug colidindo com outro recorte, e o relatório contando a página como
 * carroceria.
 */

function veiculo(id: string, cambio: string): Veiculo {
  return {
    id,
    marca: "Marca",
    modelo: "Modelo",
    versao: "",
    ano: 2022,
    quilometragem: 0,
    cambio,
    combustivel: "",
    cor: "",
    fipe: "",
    tipo: "Hatch",
    preco_original: 80000,
    preco_promocional: 0,
    pericia: "",
    whatsapp_images: [],
    web_full_images: [],
    opcionais: "",
    laudo_pericia: "",
  } as unknown as Veiculo;
}

/** O câmbio como o mapper o entrega a partir do valor cru do banco. */
function doBanco(id: number, cambio: string | null): Veiculo {
  return mapVeiculoDbToVeiculo({
    id,
    marca: "fiat",
    modelo: "argo",
    versao: "1.0",
    tipo: "Hatch",
    preco: 70000,
    ano: 2022,
    quilometragem: 30000,
    cambio,
  } as never);
}

describe("o que conta como automático", () => {
  it.each([
    ["Automático", true],
    ["Automático CVT", true],
    ["CVT", true],
    ["Automático DSG", true],
    ["Automático PDK", true],
    ["Automatizado", true],
    ["automatico", true],
    ["Manual", false],
    ["manual", false],
    ["", false],
    ["Não informado", false],
  ])('câmbio "%s" entra? %s', (cambio, entra) => {
    const hub = acharHubDeCambio([veiculo("1", cambio)], "automatico");
    expect(hub?.veiculos.length === 1).toBe(entra);
  });

  // Revisão de 05/10/2026: a página é de CARROS. Um scooter CVT passa em
  // `ehAutomatico` e entrava na grade, na contagem do chip e no JSON-LD.
  it.each(["Motocicleta", "Moto", "Scooter"])("%s automática fica de fora", (tipo) => {
    const moto = { ...veiculo("m", "Automático CVT"), tipo } as Veiculo;
    const hub = acharHubDeCambio([moto, veiculo("c", "Automático")], "automatico");
    expect(hub?.veiculos.map((v) => v.id)).toEqual(["c"]);
  });

  it("os valores crus do banco passam pelo mapper e caem do lado certo", () => {
    // No banco hoje só existem "automatico" e "manual"; o `null` é o carro que
    // chegou do feed sem o campo. O mapper não inventa câmbio para o vazio, e
    // carro sem câmbio cadastrado não entra numa página que afirma o câmbio.
    const patio = [doBanco(1, "automatico"), doBanco(2, "manual"), doBanco(3, null), doBanco(4, "cvt")];
    const hub = acharHubDeCambio(patio, "automatico");

    expect(hub?.veiculos.map((v) => String(v.id))).toEqual(["1", "4"]);
  });

  it("a régua é a do Garagem Profiler, e não uma segunda", () => {
    // Duas réguas fariam o quiz dizer "só automático" com uma conta e esta
    // vitrine listar com outra. A lista de câmbio não tem import nenhum, então
    // a regra só pode estar em `hubsDeEstoque`, e tem de ser `ehAutomatico`.
    const hubs = lerCodigo("src/lib/hubsDeEstoque.ts");
    expect(hubs).toMatch(/import \{ ehAutomatico, ehMoto \} from "\.\/fichaDoMotor"/);
    expect(hubs).toMatch(/disponiveis\.filter\(\(v\) => !ehMoto\(v\) && ehAutomatico\(v\) === true\)/);

    const patio = ["Automático", "Manual", "", "CVT", "Automatizado"].map((c, i) => veiculo(String(i), c));
    expect(hubsDeCambio(patio)[0].veiculos).toEqual(patio.filter((v) => ehAutomatico(v) === true));
  });
});

describe("a página existe sempre, como as faixas", () => {
  it("lista fechada, de uma entrada só", () => {
    // A rota e o painel têm título escrito só para `automatico`. Uma segunda
    // entrada precisa de texto próprio nos dois; este caso é o lembrete.
    expect(RECORTES_DE_CAMBIO.map((c) => c.slug)).toEqual(["automatico"]);
    expect(RECORTES_DE_CAMBIO[0].nome).toBe("Automático");
    expect(ehSlugDeCambio("automatico")).toBe(true);
    expect(ehSlugDeCambio("manual")).toBe(false);
  });

  it("com o pátio vazio o hub continua existindo, com a grade vazia", () => {
    const hub = acharHubDeCambio([], "automatico");
    expect(hub).not.toBeNull();
    expect(hub!.veiculos).toEqual([]);
  });

  it("só com manuais no pátio, também", () => {
    expect(acharHubDeCambio([veiculo("1", "Manual")], "automatico")?.veiculos).toEqual([]);
  });

  it("slug fora da lista é 404, não página vazia", () => {
    expect(acharHubDeCambio([veiculo("1", "Manual")], "manual")).toBeNull();
    expect(acharHubDeCambio([veiculo("1", "Automático")], "automatica")).toBeNull();
  });

  it("entra no sitemap com ou sem estoque", () => {
    expect(caminhosDosHubs([], [])).toContain("/estoque/automatico");
    expect(caminhosDosHubs([], [veiculo("1", "Manual")])).toContain("/estoque/automatico");
  });

  it("a rota resolve o câmbio, com os textos aprovados para o rascunho", () => {
    const rota = lerCodigo("src/app/estoque/[recorte]/page.tsx");
    expect(rota).toMatch(/acharHubDeCambio\(disponiveis, slug\)/);
    expect(rota).toContain('titulo: "Carros automáticos usados e seminovos em Curitiba"');
    expect(rota).toContain('tituloSeo: "Carros Automáticos Usados em Curitiba | Motors Store"');
    expect(rota).toContain('rotuloNasPerguntas: "carros automáticos"');
    // Pré-renderizada junto com as faixas: a lista não depende do banco.
    expect(rota).toMatch(/\[\.\.\.FAIXAS_DE_PRECO, \.\.\.RECORTES_DE_CAMBIO\]\.map/);
  });

  it("o painel lista a página, senão o texto próprio não teria como ser salvo", () => {
    // O `PUT` de `/api/hubs/textos` recusa caminho fora do catálogo.
    const api = lerCodigo("src/app/api/hubs/textos/route.ts");
    expect(api).toMatch(/hubsDeCambio\(disponiveis\)/);
    expect(api).toContain('tipo: "cambio"');
  });
});

describe("o texto gerado", () => {
  const COM = [veiculo("1", "Automático"), veiculo("2", "Automático CVT")];

  it("abre com a contagem quando há carro, e concorda no singular", () => {
    expect(textoDeCambio("automático", "automáticos", COM)[0]).toMatch(/^2 veículos automáticos em Curitiba/);
    expect(textoDeCambio("automático", "automáticos", COM.slice(0, 1))[0]).toMatch(
      /^1 veículo automático em Curitiba/,
    );
  });

  it("vazio, diz que está vazio em vez de contar zero", () => {
    const p = textoDeCambio("automático", "automáticos", []);
    expect(p[0]).toMatch(/^Sem veículos automáticos em estoque/);
    expect(p[0]).not.toMatch(/\b0\b/);
  });

  it("leva o subtítulo da leitura e o parágrafo da seleção, sem a frase de preço da faixa", () => {
    for (const p of [textoDeCambio("automático", "automáticos", COM), textoDeCambio("automático", "automáticos", [])]) {
      expect(p).toHaveLength(3);
      expect(p[1]).toBe(SUBTITULO_DA_LEITURA);
      expect(p[2]).toMatch(/perícia cautelar independente/);
      expect(p.join(" ")).not.toMatch(/R\$ 30 mil/);
    }
  });
});

describe("o slug não colide com nada em /estoque/{slug}", () => {
  it("não é carroceria, perfil, faixa nem recorte aposentado", () => {
    // Uma colisão não daria erro: serviria uma vitrine no lugar da outra.
    const ocupados = new Set([
      ...CARROCERIAS.map((c) => slugificar(c)),
      ...CARROCERIAS_COM_HUB.map((c) => slugificar(c)),
      ...PERFIS_DE_USO.map((p) => p.slug),
      ...FAIXAS_DE_PRECO.map((f) => f.slug),
      ...Object.keys(RECORTES_APOSENTADOS),
      ...Object.values(RECORTES_APOSENTADOS),
    ]);
    for (const { slug } of RECORTES_DE_CAMBIO) {
      expect(ocupados.has(slug), `${slug} já é outro recorte`).toBe(false);
    }
  });
});

describe("a camada de dados classifica a página", () => {
  it("/estoque/automatico é `transmission`, e os vizinhos seguem como eram", () => {
    expect(tipoDaPagina("/estoque/automatico")).toBe("transmission");
    expect(tipoDaPagina("/estoque/automatico/")).toBe("transmission");
    expect(tipoDaPagina("/estoque/ate-60-mil")).toBe("pricerange");
    expect(tipoDaPagina("/estoque/suv")).toBe("bodytype");
    expect(tipoDaPagina("/estoque/familia")).toBe("bodytype");
    expect(tipoDaPagina("/estoque")).toBe("inventory");
  });

  it("o script do <head> concorda", () => {
    const noNavegador = new Function(`return (${fonteDoTipoDePagina()})`)() as (c: string) => string;
    for (const caminho of ["/estoque/automatico", "/estoque/ate-60-mil", "/estoque/suv", "/estoque"]) {
      expect(noNavegador(caminho), caminho).toBe(tipoDaPagina(caminho));
    }
  });
});

describe("a página não fica órfã", () => {
  it("os outros recortes linkam para ela num bloco próprio", () => {
    const rota = lerCodigo("src/app/estoque/[recorte]/page.tsx");
    expect(rota).toMatch(/titulo: "Por câmbio",\s*links: hubsDeCambio\(disponiveis\)/);
  });

  it("a home e /estoque linkam pelo bloco de faixas", () => {
    // O chip em si é renderizado em `faixas-de-preco-na-navegacao.test.ts`.
    const bloco = lerCodigo("src/components/modernist/FaixasDePreco.tsx");
    expect(bloco).toMatch(/hubsDeCambio\(disponiveis\)\.map/);
    // Em linha própria e com rótulo próprio: "Automáticos" não é faixa de preço.
    expect(bloco.indexOf("Por câmbio")).toBeGreaterThan(bloco.indexOf("hubsDeFaixa(disponiveis).map"));
    expect(bloco.indexOf("Por câmbio")).toBeLessThan(bloco.indexOf("hubsDeCambio(disponiveis).map"));
  });
});
