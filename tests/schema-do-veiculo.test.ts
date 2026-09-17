import { describe, it, expect } from "vitest";
import type { CompanySettings, Veiculo } from "../src/types";
import { nomeComAno, nomeDoVeiculo } from "../src/lib/nomeDoVeiculo";
import { precoValidoAte, schemaDoVeiculo, transmissaoDoSchema } from "../src/lib/schemaVeiculo";
import {
  ID_DA_LOJA,
  PERFIL_NO_GOOGLE,
  PLACE_ID_NO_GOOGLE,
  faixaDePreco,
  schemaDaLoja,
} from "../src/lib/schemaLoja";
import { colunasDoRodape } from "../src/lib/colunasDoRodape";
import { urlDaRota } from "../src/lib/rotaAteALoja";
import { lerCodigo } from "./fonte";

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

  /**
   * O ano é o mesmo caso da versão, e passou batido quando a deduplicação
   * nasceu.
   *
   * O RevendaMais embute o ano no `modelo` em parte do cadastro, do mesmo jeito
   * que embute a versão. Medido no estoque em 2026-09-07: o Nissan March
   * `8203724` tem `modelo = "March 1.6 Rio 2016"` e `ano = 2016`, e a ficha dele
   * publica hoje, no `Car.name` do JSON-LD:
   *
   *   Nissan March 1.6 Rio 2016 2016
   *
   * Não é hipótese sobre um feed novo — está no ar. Um de 36 publicáveis hoje
   * (2 de 110 linhas da tabela, contando o vendido); nada garante que continue
   * sendo um.
   *
   * A `description` do schema chama a mesma função, mas no terceiro degrau de
   * `descricao_seo || descricao || fallback` — só 2 linhas chegam lá, e nenhuma
   * é um March. O caso da descrição abaixo é guarda, não defeito visto.
   */
  const MARCH = {
    marca: "Nissan",
    modelo: "March 1.6 Rio 2016",
    versao: "1.6 Rio 2016",
    ano: 2016,
  };

  it("não repete o ano que já está no nome", () => {
    expect(nomeComAno(MARCH)).toBe("Nissan March 1.6 Rio 2016");
  });

  it("o ano repetido não vaza para o `Car.name` nem para a descrição", () => {
    const schema = schemaDoVeiculo({ ...RENEGADE, ...MARCH } as Veiculo, {
      caminho: CAMINHO,
      indisponivel: false,
    });

    expect(schema.name).not.toMatch(/2016\s+2016/);
    expect(String(schema.description)).not.toMatch(/2016\s+2016/);
  });

  it("continua acrescentando o ano quando ele NÃO está no nome", () => {
    // A guarda não pode virar "nunca põe o ano": o ano é o que separa dois
    // carros de mesmo modelo, e some do título de quase todo o pátio se a
    // condição for escrita ao contrário.
    expect(nomeComAno({ marca: "Jeep", modelo: "Compass", versao: "Longitude 1.3", ano: 2022 }))
      .toBe("Jeep Compass Longitude 1.3 2022");
  });

  it("veículo sem ano não ganha espaço sobrando no fim", () => {
    // Sem a guarda de `ano` vazio, o retorno vira "Jeep Compass " — e
    // `"".split(/\s+/)` é `[""]`, que não casa com `""` pelo `includes`. Ramo
    // inalcançável hoje (o mapper coage `ano` a número), e por isso mesmo o
    // tipo de coisa que ninguém veria quebrar.
    expect(nomeComAno({ marca: "Jeep", modelo: "Compass", ano: null })).toBe("Jeep Compass");
  });

  it("não confunde ano com um número parecido no meio do nome", () => {
    // "2016" dentro de "T2016" ou de uma cilindrada não é o ano do carro. A
    // comparação tem de ser por palavra inteira, senão o ano some de um carro
    // que precisava dele — falha silenciosa e na direção errada.
    expect(nomeComAno({ marca: "Fiat", modelo: "Ducato", versao: "Maxicargo 2016V", ano: 2016 }))
      .toBe("Fiat Ducato Maxicargo 2016V 2016");
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

describe("o elo com o Perfil da Empresa no Google", () => {
  it("o perfil entra no `sameAs`, ao lado dos portais", () => {
    // Sem citação nenhuma, o buscador não tem por onde juntar o site com a
    // ficha que carrega as avaliações. Até 2026-09-04 o `AutoDealer` da
    // produção não tinha um único link do Google — medido, não suposto.
    expect(schemaDaLoja(EMPRESA).sameAs).toContain(PERFIL_NO_GOOGLE);
  });

  it("o perfil é o mapa do lugar", () => {
    expect(schemaDaLoja(EMPRESA).hasMap).toBe(PERFIL_NO_GOOGLE);
  });

  it("`hasMap` não depende de `geo`, e `geo` não depende dele", () => {
    // São independentes de propósito: `hasMap` aponta para o pin oficial do
    // Google, `geo` afirma um par de números nosso. Um `geo` que diverge do
    // pin é pior que `geo` ausente — a regra já estava no arquivo e continua.
    const semCoordenada = schemaDaLoja(EMPRESA);
    expect(semCoordenada.geo).toBeUndefined();
    expect(semCoordenada.hasMap).toBe(PERFIL_NO_GOOGLE);
  });

  it("é a URL canônica da ficha, não o encurtador nem uma busca", () => {
    // O dono mandou um `share.google/…`, que redireciona para uma URL de
    // BUSCA com `kgmid`. Encurtador some sem aviso e busca não é a página da
    // entidade; `?cid=` é o endereço estável da ficha.
    //
    // `www.google.com/maps?cid=` e não `maps.google.com/?cid=`: o segundo
    // responde 200 depois de um salto de redirecionamento, e declarar o atalho
    // em vez do endereço envelhece mal. Medido em 2026-09-04.
    expect(PERFIL_NO_GOOGLE).toBe("https://www.google.com/maps?cid=6312740048961397930");
    expect(PERFIL_NO_GOOGLE).not.toMatch(/share\.google|\/search\?|kgmid/);
  });

  it("o `place_id` é o mesmo lugar do CID, por construção", () => {
    // Não é um segundo identificador copiado de algum lugar: decodificado em
    // base64url, ele contém as duas metades do `ftid`
    // `0x94dce75dbdaa40bf:0x579b5ba0d1b9e4aa` em little-endian. Se alguém
    // trocar um dos dois sem o outro, este teste fica vermelho.
    const bytes = Buffer.from(
      PLACE_ID_NO_GOOGLE.replace(/-/g, "+").replace(/_/g, "/") + "=",
      "base64",
    ).toString("hex");
    const invertido = (h: string) => h.match(/../g)!.reverse().join("");

    expect(bytes).toContain(invertido("94dce75dbdaa40bf"));
    expect(bytes).toContain(invertido("579b5ba0d1b9e4aa"));
    // A segunda metade do ftid, em decimal, é o CID que a URL usa.
    expect(BigInt("0x579b5ba0d1b9e4aa").toString(10)).toBe("6312740048961397930");
    expect(PERFIL_NO_GOOGLE).toContain("6312740048961397930");
  });

  it("o endereço do rodapé aponta para o perfil — comparado por VALOR", () => {
    // A primeira versão disto lia a fonte do `Footer` e afirmava que o
    // IDENTIFICADOR `PERFIL_NO_GOOGLE` aparecia ao lado do endereço. Um
    // `import { ID_DA_LOJA as PERFIL_NO_GOOGLE }` passava: o endereço do
    // rodapé apontava para `motorsstore.com.br/#dealer` — âncora inexistente,
    // em toda página do site — com `tsc` limpo e os 1862 testes verdes.
    // Achado na revisão de 2026-09-04.
    //
    // Por isso as colunas viraram função pura: apelido de import não engana
    // comparação de string.
    const localizacao = colunasDoRodape(EMPRESA).find((c) => c.titulo === "LOCALIZAÇÃO");
    const endereco = localizacao?.itens.find((i) => i.rotulo === EMPRESA.address);

    expect(endereco?.href).toBe(PERFIL_NO_GOOGLE);
    expect(endereco?.href).toBe("https://www.google.com/maps?cid=6312740048961397930");
  });

  it("o link do endereço diz para onde vai, fora do contexto visual", () => {
    // "LOCALIZAÇÃO" é `<div>` estilizado, sem heading e sem associação
    // programática com a lista: para quem navega por links, o endereço cru não
    // informa que ali se abre um mapa.
    const endereco = colunasDoRodape(EMPRESA)
      .find((c) => c.titulo === "LOCALIZAÇÃO")
      ?.itens.find((i) => i.href === PERFIL_NO_GOOGLE);

    expect(endereco?.rotuloAcessivel).toContain(EMPRESA.address);
    expect(endereco?.rotuloAcessivel).toMatch(/Google Maps/i);
  });

  it("o `href` de cada item chega ao `<a>` — não a um `#`", () => {
    // A guarda acima cobre o dado; esta cobre a fiação. Trocar `href={item.href}`
    // por `href="#"` matava telefone, WhatsApp e o endereço de uma vez, e
    // nenhum teste via — buraco anterior a esta entrega.
    const fonte = lerCodigo("src/components/Footer.tsx");
    expect(fonte).toMatch(/<Link[\s\S]{0,120}href=\{item\.href\}/);
    expect(fonte).toContain("aria-label={item.rotuloAcessivel}");
  });

  it("mudar o endereço da loja obriga a reconferir o lugar", () => {
    // O rótulo sai do painel e o `href` é um CID cravado no código. Hoje
    // concordam. Nada os amarra: se a loja mudar de endereço, o rótulo
    // acompanha e o link segue apontando para a entidade antiga — em silêncio,
    // que é o molde do defeito que `nap-unico.test.ts` existe para pegar.
    //
    // `paginasGeo.ts` carrega o endereço da loja em código. Se ele mudar, isto
    // fica vermelho e obriga quem mexeu a reconferir o CID e o `place_id`.
    expect(lerCodigo("src/lib/paginasGeo.ts")).toContain('"Rua Ernesto Piazzetta, 98"');
    expect(EMPRESA.address).toContain("Rua Ernesto Piazzetta, 98");
  });

  it("a rota do `COMO CHEGAR` é fixada pelo mesmo lugar, não pelo texto", () => {
    // Comparação de VALOR, e não `toContain("…${PLACE_ID_NO_GOOGLE}")` na
    // fonte, que foi como esta guarda nasceu. Aquilo afirmava que o NOME do
    // identificador aparecia no template literal, e um
    // `import { PERFIL_NO_GOOGLE as PLACE_ID_NO_GOOGLE }` passava: a rota
    // montava `destination_place_id=https://www.google.com/maps?cid=…`, cujo
    // `?` corta a query. O parâmetro sumia e a rota voltava a depender do
    // geocode do texto. `tsc` limpo, 1867 verdes.
    //
    // Eu tinha escrito, dois arquivos antes e no mesmo commit, que essa forma
    // de guarda estava aposentada — e replantei aqui.
    expect(urlDaRota(EMPRESA.address)).toBe(
      "https://www.google.com/maps/dir/?api=1" +
        `&destination=${encodeURIComponent(EMPRESA.address)}` +
        "&destination_place_id=ChIJv0CqvV3n3JQRquS50aBbm1c",
    );
  });

  it("a rota carrega os DOIS parâmetros, e o `place_id` sem query dentro", () => {
    const url = new URL(urlDaRota(EMPRESA.address));
    expect(url.searchParams.get("destination")).toBe(EMPRESA.address);
    expect(url.searchParams.get("destination_place_id")).toBe(PLACE_ID_NO_GOOGLE);
    // O que a mutação do apelido produzia: um valor com `?` dentro, que o
    // parser de query descarta ao meio.
    expect(PLACE_ID_NO_GOOGLE).not.toMatch(/[?&/:]/);
  });

  it("sem endereço não monta rota — o botão some em vez de levar a lugar nenhum", () => {
    expect(urlDaRota("")).toBe("");
    expect(urlDaRota("   ")).toBe("");
  });
});
