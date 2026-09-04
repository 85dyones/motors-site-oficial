import { describe, it, expect } from "vitest";
import type { CompanySettings, Veiculo } from "../src/types";
import { nomeComAno, nomeDoVeiculo } from "../src/lib/nomeDoVeiculo";
import { precoValidoAte, schemaDoVeiculo, transmissaoDoSchema } from "../src/lib/schemaVeiculo";
import { ID_DA_LOJA, faixaDePreco, schemaDaLoja } from "../src/lib/schemaLoja";

/**
 * O JSON-LD do veículo e da loja.
 *
 * A auditoria de 24/08/2026 achou aqui quatro defeitos que não aparecem na
 * tela — e é por não aparecerem que precisam de teste: um schema errado só se
 * manifesta semanas depois, num relatório do Search Console.
 */

const EMPRESA: CompanySettings = {
  name: "Motors Store",
  phone: "41 99737-2165",
  whatsapp: "41 99737-2165",
  whatsappRaw: "5541997372165",
  address: "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350",
  hours: "",
  instagram: "https://instagram.com/motorsstore.oficial",
  facebook: "https://facebook.com/motorsstore.oficial",
  cnpj: "",
};

const RENEGADE = {
  id: "7977579",
  marca: "Jeep",
  // O feed embute a versão no modelo — é daqui que vinha a duplicação.
  modelo: "Renegade S T270 1.3 Tb 4x4 Flex Aut",
  versao: "S T270 1.3 Tb 4x4 Flex Aut",
  ano: 2022,
  quilometragem: 79745,
  cambio: "Automático",
  combustivel: "Flex",
  cor: "Cinza",
  fipe: "",
  preco_original: 105900,
  preco_promocional: 0,
  pericia: "PERÍCIA APROVADA",
  whatsapp_images: [],
  web_full_images: ["https://exemplo/foto.jpg"],
  opcionais: "",
  laudo_pericia: "",
  tipo: "SUV",
  motor: "1.3 Turbo",
  donos_anteriores: 1,
} as Veiculo;

const CAMINHO = "/carros/jeep/renegade/s-t270-13-tb-4x4-flex-aut/jeep-renegade-s-t270-13-tb-4x4-flex-aut-7977579";

describe("o nome não repete a versão", () => {
  /**
   * Medido em produção em 2026-08-10, no carro mais caro da vitrine:
   *
   *   "BMW X4 M40i 3.0 M Sport Edit V6 Turbo Aut m40i 3.0 m sport edit v6 turbo aut"
   *
   * O `<title>` foi corrigido no P3 da RECOMENDACAO_SEO; o JSON-LD ficou para
   * trás e seguiu publicando a versão em dobro até 2026-08-25.
   */
  it("não concatena a versão que já está no modelo", () => {
    expect(nomeDoVeiculo(RENEGADE)).toBe("Jeep Renegade S T270 1.3 Tb 4x4 Flex Aut");
  });

  it("concatena quando a versão de fato falta no modelo", () => {
    expect(nomeDoVeiculo({ marca: "Jeep", modelo: "Compass", versao: "Longitude 1.3" })).toBe(
      "Jeep Compass Longitude 1.3",
    );
  });

  it("o feed de anúncios usa o mesmo nome", async () => {
    // Medido no feed em produção em 2026-08-25, no carro mais caro da vitrine:
    //   "BMW X4 M40i 3.0 M Sport Edit V6 Turbo Aut m40i 3.0 m sport edit v6 turbo aut"
    // Título de anúncio é cortado por volta de 65 caracteres em qualquer
    // portal: o que sobrava era só a repetição.
    const { ler } = await import("./fonte");
    const feed = ler("src/app/api/feed/xml/route.ts");

    expect(feed).toMatch(/const title = nomeDoVeiculo\(car\)/);
    expect(feed).not.toMatch(/\$\{car\.marca\} \$\{car\.modelo\} \$\{car\.versao\}/);
  });

  it("é o mesmo nome que vai para o `Car.name`, com o ano", () => {
    expect(schemaDoVeiculo(RENEGADE, { caminho: CAMINHO, indisponivel: false }).name).toBe(
      nomeComAno(RENEGADE),
    );
    expect(nomeComAno(RENEGADE)).toMatch(/2022$/);
  });
});

describe("o `Car` traz os campos que faltavam", () => {
  const schema = schemaDoVeiculo(RENEGADE, { caminho: CAMINHO, indisponivel: false });

  it("tem identidade própria e o ID do estoque como sku", () => {
    // `sku`, ID no fim da URL e `item_id` do feed precisam ser o mesmo número:
    // divergência aqui é anúncio de remarketing dinâmico em branco.
    expect(schema["@id"]).toContain("#car");
    expect(schema.sku).toBe("7977579");
    expect(schema.mpn).toBe("7977579");
    expect(CAMINHO.endsWith(String(schema.sku))).toBe(true);
  });

  it("declara carroceria, condição na raiz, motor e dono anterior", () => {
    expect(schema.bodyType).toBe("SUV");
    expect(schema.itemCondition).toBe("https://schema.org/UsedCondition");
    expect(schema.numberOfPreviousOwners).toBe(1);
    expect(schema.vehicleEngine).toMatchObject({ engineType: "1.3 Turbo" });
  });

  it("declara portas quando SABE, e continua sem inventar lugares", () => {
    // Metade deste teste virou do avesso em 2026-09-04. `numberOfDoors` não
    // existia porque não havia coluna; a migração `20260904120000` a criou, do
    // `<DOORS>` que o feed já mandava em 39 de 39 e o sync descartava.
    //
    // A régua que ele guardava continua de pé, e ficou mais forte: schema é
    // afirmação, não palpite. A prova de que a dedução seria palpite está no
    // próprio feed — duas Kombis com contagens DIFERENTES entre si (4 e 3).
    //
    // `vehicleSeatingCapacity` segue fora pela razão original: não há coluna e
    // o feed não manda. Ver `tests/portas-do-veiculo.test.ts`.
    // A asserção é sobre o JSON SERIALIZADO, não sobre a chave do objeto.
    // `numberOfDoors: undefined` existe como chave — igual a `bodyType`,
    // `color` e todo campo opcional daqui —, e é o `JSON.stringify` que a
    // omite. É o texto emitido que o Google lê, então é ele que o teste mede.
    expect(RENEGADE.portas).toBeUndefined();
    expect(schema.numberOfDoors).toBeUndefined();
    expect(JSON.stringify(schema)).not.toContain("numberOfDoors");
    expect(JSON.stringify(schema)).not.toContain("vehicleSeatingCapacity");

    const comPortas = schemaDoVeiculo({ ...RENEGADE, portas: 5 }, { caminho: CAMINHO, indisponivel: false });
    expect(comPortas.numberOfDoors).toBe(5);
    expect(JSON.stringify(comPortas)).toContain('"numberOfDoors":5');
    expect(JSON.stringify(comPortas)).not.toContain("vehicleSeatingCapacity");
  });

  it("usa o vocabulário do schema.org para o câmbio", () => {
    expect(transmissaoDoSchema("Automático")).toBe("AutomaticTransmission");
    expect(transmissaoDoSchema("Manual")).toBe("ManualTransmission");
    expect(transmissaoDoSchema("CVT")).toBe("AutomaticTransmission");
    // "Automatizado" (AMT) também cai em automático — do ponto de vista de quem
    // dirige, é o que é, e o schema.org não tem termo para caixa automatizada.
    expect(transmissaoDoSchema("Automatizado")).toBe("AutomaticTransmission");
    // Câmbio que não casa com nenhum passa como veio: dado real vale mais que
    // enum chutado, e o campo aceita texto.
    expect(transmissaoDoSchema("Sequencial 6 marchas")).toBe("Sequencial 6 marchas");
    expect(transmissaoDoSchema("")).toBeUndefined();
  });
});

describe("a oferta diz quem vende e de onde se retira", () => {
  const schema = schemaDoVeiculo(RENEGADE, { caminho: CAMINHO, indisponivel: false });
  const oferta = schema.offers;

  it("aponta para o `@id` da loja", () => {
    // Sem isto o `AutoDealer` da home é um bloco solto: nada liga as fichas à
    // loja física, que é o sinal que sustenta o resultado local.
    expect(oferta.seller).toEqual({ "@id": ID_DA_LOJA });
    expect(oferta.availableAtOrFrom).toEqual({ "@id": ID_DA_LOJA });
  });

  it("publica preço em string com centavos e validade à frente", () => {
    expect(oferta.price).toBe("105900.00");
    expect(oferta.priceValidUntil > new Date().toISOString().slice(0, 10)).toBe(true);
  });

  it("data de validade acompanha o relógio, não fica escrita no código", () => {
    // Data fixa envelhece em silêncio, e oferta vencida é pior que oferta
    // incompleta. A janela é recalculada a cada revalidação da ficha.
    const base = new Date("2026-01-01T00:00:00Z");
    expect(precoValidoAte(base)).toBe("2026-01-31");
  });

  it("fora do feed é fora de estoque", () => {
    const indisponivel = schemaDoVeiculo(RENEGADE, { caminho: CAMINHO, indisponivel: true });
    expect(indisponivel.offers.availability).toBe("https://schema.org/OutOfStock");
  });
});

describe("o `AutoDealer` é único e não publica coordenada que não tem", () => {
  it("carrega o `@id` que as ofertas referenciam", () => {
    expect(schemaDaLoja(EMPRESA)["@id"]).toBe(ID_DA_LOJA);
  });

  it("omite `geo` enquanto o painel não tiver as coordenadas reais", () => {
    // Divergência entre `geo`, o pin do Perfil da Empresa e o endereço textual
    // conta CONTRA o ranqueamento local — pior que campo ausente.
    expect(schemaDaLoja(EMPRESA).geo).toBeUndefined();
    expect(schemaDaLoja({ ...EMPRESA, latitude: "0", longitude: "0" }).geo).toBeUndefined();
    expect(schemaDaLoja({ ...EMPRESA, latitude: "-25.39", longitude: "-49.22" }).geo).toMatchObject({
      latitude: -25.39,
      longitude: -49.22,
    });
  });

  it("a faixa de preço é medida no estoque, não uma fileira de cifrões", () => {
    expect(faixaDePreco([])).toBeUndefined();
    expect(
      faixaDePreco([
        { preco_original: 23900, preco_promocional: 0 },
        { preco_original: 318900, preco_promocional: 0 },
      ]),
    ).toMatch(/23\.900.*318\.900/);
  });

  it("o telefone do schema sai do mesmo campo que o botão de WhatsApp", () => {
    expect(schemaDaLoja(EMPRESA).telephone).toBe("+5541997372165");
  });
});
