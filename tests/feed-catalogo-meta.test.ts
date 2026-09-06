import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Veiculo } from "../src/types";
import { LIMITE_DO_TITULO, MAXIMO_DE_IMAGENS } from "../src/lib/feedDeCatalogo";
import { CARENCIA_VENDIDO_NO_FEED_DIAS } from "../src/lib/publicacao";

/**
 * O que o feed de catálogo declara sobre cada carro.
 *
 * Diagnóstico do catálogo `617519794775501` em 2026-09-06, com a carga do dia
 * bem-sucedida (36 detectados, 36 gravados, 0 inválidos):
 *
 *   not_enough_images ............ 36 itens — TODOS. Uma foto por anúncio,
 *                                  numa galeria com média de 15.
 *
 * E dois defeitos que o diagnóstico não vê porque só aparecem quando o dado
 * certo chega: `<g:link>` e `<g:image_link>` saíam sem escape nenhum — um `&`
 * numa query string derruba o documento inteiro, e o Meta reporta isso como
 * `xml_wrong_tags`, erro de ARQUIVO, que reprova a carga toda —, e
 * `<g:condition>` dizia `new` para todo carro sem quilometragem cadastrada,
 * porque o mapper transforma ausente em zero.
 *
 * Este teste EXERCITA o handler. A suíte já tinha asserções por texto sobre
 * este mesmo feed e nenhuma delas teria pego nada disto: o código "certo" pelo
 * texto era exatamente o que produzia o XML errado.
 */

const carro = (over: Partial<Veiculo> = {}): Veiculo =>
  ({
    id: "8335204",
    marca: "volkswagen",
    modelo: "saveiro 1.6 msi robust cs 8v flex 2p manual",
    versao: "",
    ano: 2022,
    quilometragem: 40000,
    cambio: "Manual",
    combustivel: "Flex",
    cor: "Branco",
    fipe: "",
    preco_original: 68900,
    preco_promocional: 65900,
    pericia: "",
    tipo: "Picape",
    whatsapp_images: ["https://cdn.exemplo/foto-1.jpg"],
    web_full_images: ["https://cdn.exemplo/foto-1.webp"],
    opcionais: "",
    laudo_pericia: "",
    descricao: "Um carro.",
    vendido: false,
    ...over,
  }) as Veiculo;

let estoque: Veiculo[] = [];
let datasDeVenda: Record<string, string> = {};

vi.mock("../src/lib/supabase", async (original) => {
  const real = await original<typeof import("../src/lib/supabase")>();
  return { ...real, getEstoque: async () => estoque };
});

/* Só `getDatasDeVenda` é substituída: `decidirNoFeed` continua a real, senão o
   teste provaria o mock em vez da régua. A função verdadeira é
   `unstable_cache`, que estoura fora do contexto de requisição do Next. */
vi.mock("../src/lib/publicacao", async (original) => {
  const real = await original<typeof import("../src/lib/publicacao")>();
  return { ...real, getDatasDeVenda: async () => datasDeVenda };
});

async function gerarFeed(veiculos: Veiculo[]): Promise<string> {
  estoque = veiculos;
  const { GET } = await import("../src/app/api/feed/xml/route");
  const res = await GET(new Request("https://motorsstore.com.br/api/feed/xml"));
  return await res.text();
}

/**
 * O bloco `<item>` de um veículo. ESTOURA quando o item não existe, em vez de
 * devolver string vazia: `expect("").not.toContain(x)` passa sem ler nada, e um
 * teste desses fica verde justamente no caso que ele existe para gritar.
 */
function itemDe(xml: string, id: string): string {
  const marca = `<g:id>${id}</g:id>`;
  const i = xml.indexOf(marca);
  if (i === -1) throw new Error(`O item ${id} não está no feed.`);
  const inicio = xml.lastIndexOf("<item>", i);
  return xml.slice(inicio, xml.indexOf("</item>", i));
}

/** Todos os blocos `<item>`, para varrer o feed inteiro. */
function itensDoFeed(xml: string): string[] {
  return xml
    .split("<item>")
    .slice(1)
    .map((bloco) => bloco.slice(0, bloco.indexOf("</item>")));
}

/** O conteúdo de uma tag dentro de um bloco. `null` quando a tag não existe. */
function tag(bloco: string, nome: string): string | null {
  const abre = `<g:${nome}>`;
  const i = bloco.indexOf(abre);
  if (i === -1) return null;
  return bloco.slice(i + abre.length, bloco.indexOf(`</g:${nome}>`, i));
}

/** Todas as ocorrências de uma tag, na ordem. */
function todasAsTags(bloco: string, nome: string): string[] {
  return [...bloco.matchAll(new RegExp(`<g:${nome}>([^<]*)</g:${nome}>`, "g"))].map((m) => m[1]);
}

const DIA = 24 * 60 * 60 * 1000;
const haDias = (n: number) => new Date(Date.now() - n * DIA).toISOString();

beforeEach(() => {
  estoque = [];
  datasDeVenda = {};
});

describe("o documento é bem formado", () => {
  it("nenhum & sobra fora de entidade — nem em texto, nem em URL", async () => {
    // A regressão exata que existia: `<g:link>` e `<g:image_link>` iam para o
    // XML sem passar por escape. Uma URL de CDN com query string
    // (`?w=1600&q=84`) bastava para invalidar o arquivo inteiro.
    const xml = await gerarFeed([
      carro({
        marca: "Mercedes & Benz",
        whatsapp_images: ["https://cdn.exemplo/foto.jpg?w=1600&q=84"],
        web_full_images: [],
        descricao: "Ar & som, bancos <b>em couro</b>",
      }),
    ]);

    expect(xml).not.toMatch(/&(?!(amp|lt|gt|quot|apos);)/);
  });

  it("nenhum < ou > sobra no texto entre as tags", async () => {
    const xml = await gerarFeed([carro({ marca: "A<B>C", descricao: "1 < 2 e 3 > 2" })]);

    // Tirando toda a marcação, o que resta é texto: se ainda houver um sinal de
    // maior ou menor ali, ele veio de dado não escapado.
    const soTexto = xml.replace(/<[^>]*>/g, "");
    expect(soTexto).not.toContain("<");
    expect(soTexto).not.toContain(">");
  });

  it("a URL da ficha e a da foto chegam escapadas e íntegras", async () => {
    const item = itemDe(
      await gerarFeed([
        carro({
          whatsapp_images: ["https://cdn.exemplo/foto.jpg?w=1600&q=84"],
          web_full_images: [],
        }),
      ]),
      "8335204",
    );

    expect(tag(item, "image_link")).toBe("https://cdn.exemplo/foto.jpg?w=1600&amp;q=84");
    expect(tag(item, "link")).toContain("https://motorsstore.com.br/carros/");
  });
});

describe("o título", () => {
  it("nunca passa do limite e nunca ganha reticências", async () => {
    const xml = await gerarFeed([
      carro({ id: "1", marca: "Volkswagen", modelo: "Saveiro", versao: "" }),
      carro({
        id: "2",
        marca: "Chevrolet",
        modelo: "Spin Premier 1.8 AT 2024 Sete Lugares Completa Impecável Revisada",
        versao: "Topo de linha com teto solar panorâmico e bancos em couro",
      }),
    ]);

    for (const item of itensDoFeed(xml)) {
      const titulo = tag(item, "title") ?? "";
      expect(titulo.length).toBeLessThanOrEqual(LIMITE_DO_TITULO);
      expect(titulo).not.toMatch(/\.\.\.$/);
      expect(titulo).not.toBe("");
    }
  });

  it("o corte não parte uma entidade ao meio", async () => {
    // Truncar DEPOIS de escapar produziria `&am` no fim do título — um `&`
    // solto, que é documento inválido. A ordem certa é truncar cru.
    const xml = await gerarFeed([
      carro({
        marca: "Aaaa & Bbbb",
        modelo: "Cccc Dddd Eeee Ffff Gggg Hhhh Iiii Jjjj Kkkk Llll Mmmm Nnnn",
        versao: "",
      }),
    ]);

    expect(xml).not.toMatch(/&(?!(amp|lt|gt|quot|apos);)/);
    expect(tag(itemDe(xml, "8335204"), "title")).not.toMatch(/&[a-z]*$/);
  });
});

describe("as fotos", () => {
  const galeria = (n: number) =>
    Array.from({ length: n }, (_, i) => `https://cdn.exemplo/foto-${i}.jpg`);

  it("a capa é a primeira e as demais entram como adicionais, na ordem", async () => {
    const fotos = galeria(4);
    const item = itemDe(
      await gerarFeed([carro({ whatsapp_images: fotos, web_full_images: [] })]),
      "8335204",
    );

    expect(tag(item, "image_link")).toBe(fotos[0]);
    expect(todasAsTags(item, "additional_image_link")).toEqual(fotos.slice(1));
  });

  it("respeita o teto do Meta somando capa e adicionais", async () => {
    const item = itemDe(
      await gerarFeed([
        carro({ whatsapp_images: galeria(MAXIMO_DE_IMAGENS + 5), web_full_images: [] }),
      ]),
      "8335204",
    );

    const total = todasAsTags(item, "image_link").length + todasAsTags(item, "additional_image_link").length;
    expect(total).toBe(MAXIMO_DE_IMAGENS);
  });

  it("buraco no início do array não vira capa vazia", async () => {
    // O gate de publicação conta 4 fotos truthy sobre a linha crua, então um
    // array com buracos passa. A rota antiga indexava [0] sem checar.
    const item = itemDe(
      await gerarFeed([
        carro({
          whatsapp_images: ["", "", "https://cdn.exemplo/foto-3.jpg"],
          web_full_images: [],
        }),
      ]),
      "8335204",
    );

    expect(tag(item, "image_link")).toBe("https://cdn.exemplo/foto-3.jpg");
  });

  it("carro só com foto relativa fica FORA do catálogo", async () => {
    // `/logo.png` é o último degrau do mapper. Item com caminho relativo é item
    // sem foto para o portal — melhor faltar do que entrar reprovado.
    const xml = await gerarFeed([carro({ whatsapp_images: ["/logo.png"], web_full_images: [] })]);

    expect(xml).not.toContain("<g:id>8335204</g:id>");
    expect(xml).not.toContain("/logo.png");
  });
});

describe("carroceria, categoria e tipo", () => {
  it("carro e moto não caem na mesma categoria nem no mesmo tipo", async () => {
    // Os dois travados no MESMO teste de propósito: separados, um poderia andar
    // sem o outro e o anúncio sairia com tipo de carro e categoria de moto.
    const xml = await gerarFeed([
      carro({ id: "100", tipo: "Picape" }),
      carro({ id: "200", tipo: "Motocicleta" }),
    ]);

    const oCarro = itemDe(xml, "100");
    const aMoto = itemDe(xml, "200");

    expect(tag(oCarro, "vehicle_type")).toBe("car");
    expect(tag(oCarro, "google_product_category")).toContain("Cars, Trucks &amp; Vans");

    expect(tag(aMoto, "vehicle_type")).toBe("motorcycle");
    expect(tag(aMoto, "google_product_category")).toContain("Motorcycles &amp; Scooters");
  });

  it("a categoria é escapada UMA vez", async () => {
    // `&amp;amp;` é o que sai quando a constante já vem escapada da origem — e
    // é literalmente o valor inválido que se está corrigindo.
    const item = itemDe(await gerarFeed([carro()]), "8335204");
    const categoria = tag(item, "google_product_category") ?? "";

    expect(categoria).toContain("&amp;");
    expect(categoria).not.toContain("&amp;amp;");
  });
});

describe("a condição do veículo", () => {
  it("condition e state_of_vehicle nunca discordam", async () => {
    // A condição inteira, e não a proibição da palavra `new`: se um dia entrar
    // um 0 km de verdade, o teste continua correto — o que ele proíbe é o feed
    // afirmar duas coisas diferentes sobre o mesmo carro.
    const xml = await gerarFeed([
      carro({ id: "1", quilometragem: 40000 }),
      carro({ id: "2", quilometragem: 0 }),
      carro({ id: "3", quilometragem: 210000 }),
    ]);

    const itens = itensDoFeed(xml);
    expect(itens).toHaveLength(3);
    for (const item of itens) {
      expect(tag(item, "condition")).toBe(tag(item, "state_of_vehicle"));
    }
  });

  it("quilometragem zero é dado FALTANDO, não carro zero km", async () => {
    // `mapVeiculoDbToVeiculo` faz `Number(quilometragem) || 0`: km ausente ou
    // ilegível vira zero. O feed declarava `new` para esses — numa revenda de
    // seminovos, é afirmação falsa sobre o produto.
    const item = itemDe(await gerarFeed([carro({ quilometragem: 0 })]), "8335204");

    expect(tag(item, "condition")).toBe("used");
    expect(tag(item, "state_of_vehicle")).toBe("used");
  });
});

describe("os rótulos de segmentação", () => {
  it("custom_label_0 é a faixa do preço EFETIVO, não a do de tabela", async () => {
    // O carro de tabela 108.900 com promoção de 95.000 é anunciado a 95.000 e
    // é assim que `lib/dataLayer.ts` monta o público de remarketing. Rotular
    // pela tabela poria o público e o catálogo em faixas diferentes.
    const item = itemDe(
      await gerarFeed([carro({ preco_original: 108900, preco_promocional: 95000 })]),
      "8335204",
    );

    expect(tag(item, "custom_label_0")).toBe("60-a-100-mil");
  });

  it("custom_label_1 é a carroceria, e some quando ela não existe", async () => {
    // Tag vazia é pior que tag ausente — a mesma régua já registrada para
    // `sale_price`.
    const comTipo = itemDe(await gerarFeed([carro({ tipo: "Picape" })]), "8335204");
    expect(tag(comTipo, "custom_label_1")).toBe("Picape");

    const semTipo = itemDe(await gerarFeed([carro({ tipo: "" })]), "8335204");
    expect(semTipo).not.toContain("custom_label_1");
  });
});

describe("o carro vendido", () => {
  const vendido = (over: Partial<Veiculo> = {}) => carro({ vendido: true, ...over });

  it("vendido há poucos dias CONTINUA no catálogo, marcado indisponível", async () => {
    // Sumir de uma carga para a outra faz o Meta tratar o item como deletado,
    // o que quebra anúncio dinâmico ativo e público montado por `content_ids`.
    datasDeVenda = { "8335204": haDias(2) };
    const item = itemDe(await gerarFeed([vendido()]), "8335204");

    expect(tag(item, "availability")).toBe("out_of_stock");
    // O anúncio continua completo: o portal precisa reconhecer o mesmo item.
    expect(tag(item, "link")).toContain("/carros/");
    expect(tag(item, "image_link")).toContain("https://");
  });

  it("passada a janela, sai do catálogo", async () => {
    datasDeVenda = { "8335204": haDias(CARENCIA_VENDIDO_NO_FEED_DIAS + 1) };
    const xml = await gerarFeed([vendido()]);

    expect(xml).not.toContain("<g:id>8335204</g:id>");
  });

  it("vendido SEM data de venda sai na hora — como antes", async () => {
    // É o caso de 23 dos 24 vendidos de hoje: marcados por caminhos que não
    // passaram pelo histórico do painel. A janela vale para quem tem carimbo e
    // para tudo o que for marcado daqui para a frente.
    datasDeVenda = {};
    const xml = await gerarFeed([vendido()]);

    expect(xml).not.toContain("<g:id>8335204</g:id>");
  });

  it("carro à venda entra disponível", async () => {
    const item = itemDe(await gerarFeed([carro()]), "8335204");
    expect(tag(item, "availability")).toBe("in_stock");
  });
});
