import { describe, expect, it } from "vitest";
import {
  avaliados,
  CARROCERIAS_COM_PLURAL,
  concordar,
  generoDeCarroceria,
  generoDeModelo,
  generoDoSegmento,
  No,
  O,
  pluralDeCarroceria,
  seminovo,
  seu,
  um,
  usado,
} from "../src/lib/generoDoVeiculo";
import { CARROCERIAS } from "../src/lib/classificacaoVeiculo";
import { hubsDeCarroceria, hubsDeModelo, ehRotuloSujo, rotuloLimpo } from "../src/lib/hubsDeEstoque";
import { perguntasDeCategoria, textoDeCarroceria, textoDeModelo } from "../src/lib/textoDosHubs";
import { lerCodigo } from "./fonte";
import type { Veiculo } from "../src/types";

/**
 * A concordância de gênero do texto perene.
 *
 * O dono apontou em 2026-08-25: **"a Volkswagen Saveiro", não "o Volkswagen
 * Saveiro"**. O que estes testes prendem não é a gramática de um caso — é que
 * a decisão saiu do código escrito à mão e passou a vir do dado.
 */

function veiculo(parcial: Partial<Veiculo> & Pick<Veiculo, "id" | "marca" | "modelo">): Veiculo {
  return {
    versao: "",
    ano: 2022,
    quilometragem: 40000,
    cambio: "Automático",
    combustivel: "Flex",
    cor: "Prata",
    tipo: "Hatch",
    fipe: "",
    preco_original: 100000,
    preco_promocional: 0,
    pericia: "",
    whatsapp_images: [],
    web_full_images: [],
    opcionais: "",
    laudo_pericia: "",
    ...parcial,
  } as Veiculo;
}

describe("o gênero de um modelo sai do dado antes de sair da tabela", () => {
  it("moto é feminina pelo segmento, sem entrar em lista nenhuma", () => {
    // "a CB", "a Dyna", "a ADV" — os quatro hubs de moto do estoque real.
    for (const modelo of ["CB", "Dyna", "ADV", "Chopper"]) {
      expect(generoDeModelo(modelo, { segmento: "motos" })).toBe("f");
    }
  });

  it("picape é feminina pela carroceria — inclusive uma que ninguém previu", () => {
    // O ponto da regra: um modelo fora de qualquer tabela acerta sozinho.
    expect(generoDeModelo("Modelo Que Ninguem Previu", { tipo: "Picape" })).toBe("f");
    expect(generoDeModelo("Saveiro", { tipo: "Picape", segmento: "carros" })).toBe("f");
  });

  it("a tabela cobre o que nem o segmento nem a carroceria denunciam", () => {
    // Perua e van chegam do feed como Hatch ou SUV. Só o nome resolve.
    expect(generoDeModelo("Kombi", { tipo: "Hatch" })).toBe("f");
    expect(generoDeModelo("Parati", { tipo: "Hatch" })).toBe("f");
    expect(generoDeModelo("Spin", { tipo: "SUV" })).toBe("f");
  });

  it("a picape ainda acerta quando o painel deixou a carroceria em branco", () => {
    // `tipo` é campo editado à mão. Saveiro e Strada estão na tabela de
    // propósito, redundantes com a regra da carroceria, por causa disto.
    expect(generoDeModelo("Saveiro", { tipo: "" })).toBe("f");
    expect(generoDeModelo("Strada", { tipo: null })).toBe("f");
  });

  it("a lista masculina derrota a regra da picape onde ela erraria", () => {
    // O feed classifica o Kia Bongo como picape, mas ninguém diz "a Bongo" —
    // é caminhão leve. Apareceu na leitura da saída real, não numa asserção.
    expect(generoDeModelo("Bongo", { tipo: "Picape" })).toBe("m");
  });

  it("o masculino continua sendo o default — nada regride", () => {
    for (const modelo of ["Onix", "Polo", "Renegade", "Argo", "HB20", "Virtus", "Fusca"]) {
      expect(generoDeModelo(modelo, { tipo: "Hatch", segmento: "carros" })).toBe("m");
    }
  });

  it("tolera caixa e acento, porque o feed manda das duas formas", () => {
    expect(generoDeModelo("SAVEIRO")).toBe("f");
    expect(generoDeModelo("  kombi  ")).toBe("f");
    expect(generoDeModelo("Brasília")).toBe("f");
  });

  it("não adivinha por terminação", () => {
    // "Saveiro" é feminina; "Cruzeiro" terminaria igual e não é. Regra de
    // sufixo erraria com cara de acerto, que é o pior erro num `<title>`.
    expect(generoDeModelo("Cruzeiro")).toBe("m");
  });
});

describe("carroceria: gênero e plural", () => {
  it("picape é a única feminina entre as carrocerias do vocabulário", () => {
    expect(generoDeCarroceria("Picape")).toBe("f");
    for (const nome of ["SUV", "Sedan", "Hatch", "Esportivo", "Coupe", "Conversível"]) {
      expect(generoDeCarroceria(nome)).toBe("m");
    }
  });

  it("o plural é escrito, não montado com + \"s\"", () => {
    expect(pluralDeCarroceria("Conversível")).toBe("Conversíveis");
    expect(pluralDeCarroceria("Hatch")).toBe("Hatches");
    expect(pluralDeCarroceria("Coupe")).toBe("Coupés");
  });

  it("a sigla sobrevive — era \"suvs\" no `<h1>` e no `<title>`", () => {
    expect(pluralDeCarroceria("SUV")).toBe("SUVs");
    expect(pluralDeCarroceria("SUV")).not.toBe("suvs");
  });

  it("toda carroceria do vocabulário está na tabela de plurais", () => {
    // Prende as duas listas juntas: `generoDoVeiculo` não importa
    // `CARROCERIAS` (ver a nota sobre imports lá), então nada além deste teste
    // impede que um rótulo novo entre e caia no `+ "s"` do fallback em
    // silêncio — que é exatamente como "Conversívels" chegou ao `<h1>`.
    for (const nome of CARROCERIAS) {
      expect(CARROCERIAS_COM_PLURAL, `plural de ${nome}`).toContain(nome);
    }
  });
});

describe("os helpers de concordância", () => {
  it("escolhem a forma certa", () => {
    expect(seminovo("f")).toBe("seminova");
    expect(seminovo("m", true)).toBe("seminovos");
    expect(seminovo("f", true)).toBe("seminovas");
    expect(usado("f")).toBe("usada");
    expect(avaliados("f")).toBe("avaliadas");
    expect(um("f")).toBe("uma");
    expect(seu("f")).toBe("sua");
    expect(O("f", true)).toBe("As");
    expect(No("f")).toBe("Na");
    expect(concordar("m", "ele", "ela")).toBe("ele");
  });

  it("o segmento decide o texto do hub de marca", () => {
    // Uma marca não tem gênero: "Volkswagen" cobre a Saveiro e o Polo.
    expect(generoDoSegmento("motos")).toBe("f");
    expect(generoDoSegmento("carros")).toBe("m");
  });
});

describe("o hub calcula o gênero a partir do histórico", () => {
  const historico = [
    veiculo({ id: "1", marca: "Volkswagen", modelo: "Saveiro", tipo: "Picape" }),
    veiculo({ id: "2", marca: "Volkswagen", modelo: "Polo", tipo: "Hatch" }),
  ];

  it("um hub perene SEM nenhuma unidade à venda ainda concorda certo", () => {
    // É o caso que motiva a regra: `hub.veiculos` está vazio justamente na
    // página que mais precisa do gênero. Se saísse de lá, cairia no masculino.
    const hubs = hubsDeModelo(historico, [], "carros", "volkswagen");
    const saveiro = hubs.find((h) => h.slug === "saveiro");

    expect(saveiro?.veiculos).toHaveLength(0);
    expect(saveiro?.genero).toBe("f");
  });

  it("e o modelo masculino da mesma marca continua masculino", () => {
    const hubs = hubsDeModelo(historico, [], "carros", "volkswagen");
    expect(hubs.find((h) => h.slug === "polo")?.genero).toBe("m");
  });

  it("o hub de carroceria carrega o gênero e o plural prontos", () => {
    const hubs = hubsDeCarroceria(
      [veiculo({ id: "3", marca: "Fiat", modelo: "Strada", tipo: "Picape" })],
      [],
    );
    expect(hubs[0]).toMatchObject({ nome: "Picape", genero: "f", plural: "Picapes" });
  });
});

describe("o rótulo que veio com a versão colada aponta para o limpo", () => {
  it("reconhece a sujeira que o feed manda", () => {
    // Os dois casos reais, medidos no sitemap de produção em 2026-08-25.
    expect(ehRotuloSujo("Ka Sedan 1.0 Se Flex 4p")).toBe(true);
    expect(ehRotuloSujo("Hr-v Ex 1.8 Flexone 16v 5p Aut")).toBe(true);
  });

  it("não acusa nome de modelo legítimo", () => {
    for (const nome of ["Ka", "HR-V", "Saveiro", "Onix", "320i", "i30", "208", "S10", "T-Cross", "Up"]) {
      expect(ehRotuloSujo(nome), nome).toBe(false);
    }
  });

  it("o rótulo exibido perde a versão, mas o slug não muda", () => {
    // O `<h1>` dizia "Ford Ka Sedan 1.0 Se Flex 4p". O corte é no primeiro
    // pedaço com dígito, que é onde a versão começa.
    expect(rotuloLimpo("Ka Sedan 1.0 Se Flex 4p")).toBe("Ka Sedan");
    expect(rotuloLimpo("Hr-v Ex 1.8 Flexone 16v 5p Aut")).toBe("Hr-v Ex");
  });

  it("o rótulo limpo é ponto fixo — não corta o que já está limpo", () => {
    for (const nome of ["Saveiro", "320i", "Ka", "T-Cross", "Ka Sedan"]) {
      expect(rotuloLimpo(nome), nome).toBe(nome);
    }
  });

  it("o hub sujo declara canonical para o irmão limpo", () => {
    const historico = [
      veiculo({ id: "1", marca: "Ford", modelo: "Ka" }),
      veiculo({ id: "2", marca: "Ford", modelo: "Ka Sedan 1.0 Se Flex 4p" }),
    ];
    const hubs = hubsDeModelo(historico, [], "carros", "ford");

    expect(hubs.find((h) => h.slug === "ka")?.canonicalDe).toBeNull();
    expect(hubs.find((h) => h.slug === "ka-sedan-1-0-se-flex-4p")?.canonicalDe).toBe("ka");
  });

  it("sem irmão limpo, o hub sujo continua canônico de si mesmo", () => {
    // Honda HR-V só existe na forma suja no estoque real. Apontar para um hub
    // que não existe seria pior que não apontar.
    const historico = [veiculo({ id: "1", marca: "Honda", modelo: "Hr-v Ex 1.8 Flexone 16v 5p Aut" })];
    const hubs = hubsDeModelo(historico, [], "carros", "honda");
    expect(hubs[0].canonicalDe).toBeNull();
  });
});

describe("o texto gerado concorda de ponta a ponta", () => {
  const saveiros = [
    veiculo({ id: "1", marca: "Volkswagen", modelo: "Saveiro", tipo: "Picape", ano: 2021 }),
  ];

  it("o hub de modelo feminino não diz \"No … usado\"", () => {
    const texto = textoDeModelo("Volkswagen", "Saveiro", saveiros, "f").join(" ");
    expect(texto).toContain("Na Volkswagen Saveiro usada");
    expect(texto).not.toContain("No Volkswagen Saveiro usado");
  });

  it("o hub vazio diz \"assim que uma passar\"", () => {
    const texto = textoDeModelo("Volkswagen", "Saveiro", [], "f").join(" ");
    expect(texto).toContain("assim que uma passar");
  });

  it("o parágrafo da seleção concorda: \"de cada dez avaliadas\"", () => {
    expect(textoDeModelo("Fiat", "Strada", saveiros, "f").join(" ")).toContain(
      "de cada dez avaliadas",
    );
    expect(textoDeModelo("Chevrolet", "Onix", saveiros, "m").join(" ")).toContain(
      "de cada dez avaliados",
    );
  });

  it("o texto de carroceria usa o plural que recebeu, com a sigla inteira", () => {
    const texto = textoDeCarroceria("SUV", [], "SUVs", "m").join(" ");
    expect(texto).toContain("SUVs");
    expect(texto).not.toContain("suvs");
  });

  it("as perguntas do FAQ concordam com o rótulo", () => {
    expect(perguntasDeCategoria("picapes", "f")[0].pergunta).toMatch(/^As picapes/);
    expect(perguntasDeCategoria("SUVs", "m")[0].pergunta).toMatch(/^Os SUVs/);
    expect(perguntasDeCategoria("picapes", "f")[3].pergunta).toContain("Onde vejo as picapes");
  });
});

describe("nenhuma página perene volta a cravar a forma masculina", () => {
  const paginas = [
    "src/app/[categoria]/[marca]/page.tsx",
    "src/app/[categoria]/[marca]/[modelo]/page.tsx",
    "src/app/estoque/[recorte]/page.tsx",
    "src/lib/textoDosHubs.ts",
  ];

  it.each(paginas)("%s não tem \"seminovo\"/\"seminovas\" literal", (arquivo) => {
    // `lerCodigo` desconta os comentários: a nota que explica a correção cita
    // a string corrigida, e sem isso o teste acusaria a própria explicação.
    const codigo = lerCodigo(arquivo);
    expect(codigo).not.toMatch(/["'`]\s*[Ss]eminov[oa]s?\s+em Curitiba/);
    expect(codigo).not.toMatch(/de cada dez avaliad[oa]s/);
  });
});

describe("o vocabulário do POSICIONAMENTO vale para o texto público", () => {
  const publicos = [
    "src/lib/compartilhamento.ts",
    "src/app/layout.tsx",
    "src/app/page.tsx",
    "src/app/sobre/page.tsx",
    "src/app/contato/page.tsx",
    "src/app/destaques/[tag]/page.tsx",
    "src/components/Footer.tsx",
    "src/components/modernist/HeroHome.tsx",
    "src/app/api/feed/xml/route.ts",
    // Entraram em 04/09/2026, com a rodada que tirou "alto padrão" e as
    // promessas de prazo. Todos conferidos limpos antes de entrar: o único
    // "premium" que restava estava num comentário, e `lerCodigo` desconta
    // comentários.
    "src/app/avaliacao/page.tsx",
    "src/app/financiamento/page.tsx",
    "src/components/AutoAvaliacao.tsx",
    "src/components/SobreClientWrapper.tsx",
    "src/lib/paginasInstitucionais.ts",
  ];

  it.each(publicos)("%s não usa a coluna \"Evitar\"", (arquivo) => {
    const codigo = lerCodigo(arquivo);
    expect(codigo).not.toMatch(/premium/i);
    // A meta de /sobre vendeu "veículos de alto padrão" até 04/09/2026. É a
    // mesma promessa que "premium" com outras palavras: fala de faixa de preço
    // onde o posicionamento fala de SELEÇÃO — e a vitrine vai de R$ 23.900 a
    // R$ 318.900, o que desmente a frase na própria página.
    expect(codigo).not.toMatch(/alto[- ]padrão/i);
    expect(codigo).not.toMatch(/procedência garantida/i);
    expect(codigo).not.toMatch(/melhores condições/i);
    expect(codigo).not.toMatch(/oferta exclusiva/i);
  });
});

describe("nenhuma superfície pública promete prazo que ninguém mede", () => {
  /**
   * Auditoria de 04/09/2026, feita antes de ingerir as páginas no assistente
   * do WhatsApp. A promessa não era falsa por si: era **afirmada sem medição**
   * — "proposta em menos de 10 minutos" aparecia na home, na meta de
   * /avaliacao, no card de compartilhamento e na própria tela, e ainda uma
   * quinta vez como estatística ("10 min · RESPOSTA"). Nada no sistema mede
   * esse tempo, e ninguém foi combinado para cumpri-lo.
   *
   * Um texto de página tem contexto ao redor que relativiza. O assistente
   * repete a frase sozinha, no privado, para quem já mandou o carro — que é
   * exatamente quando ela vira compromisso cobrável.
   *
   * A correção não foi trocar por outro número: foi dizer o que de fato
   * acontece — um consultor retorna no WhatsApp.
   */
  const superficies = [
    "src/app/page.tsx",
    "src/app/avaliacao/page.tsx",
    "src/app/financiamento/page.tsx",
    "src/components/AutoAvaliacao.tsx",
    "src/lib/compartilhamento.ts",
  ];

  it.each(superficies)("%s não crava prazo de resposta", (arquivo) => {
    const codigo = lerCodigo(arquivo);
    expect(codigo).not.toMatch(/em menos de \d+ ?min/i);
    // A mesma promessa em forma de estatística — foi por onde ela sobreviveu à
    // primeira leitura, porque não é uma frase. Casa o número RENDERIZADO
    // (`>10 min<`) e o número em string: `\b\d+ ?min\b` casaria também com
    // "py-10 min-h-[...]" de qualquer classe do Tailwind, e o teste morreria
    // de causa alheia na primeira vez que alguém encostasse no layout.
    expect(codigo).not.toMatch(/>\s*\d+\s*min/i);
    expect(codigo).not.toMatch(/["'`]\s*\d+ ?min(utos)?/i);
    expect(codigo).not.toMatch(/no mesmo dia/i);
  });

  it("a home continua dizendo por onde a resposta chega", () => {
    // Guarda positiva: apagar a promessa e não pôr nada no lugar deixaria a
    // seção sem próximo passo, e o negativo acima passaria igual.
    const home = lerCodigo("src/app/page.tsx");
    expect(home).toMatch(/consultor retorna no WhatsApp/);
    expect(home).toMatch(/POR ONDE RESPONDEMOS/);
  });

  it("a garantia vale para quem compra de fora, e o texto diz até onde", () => {
    // A resposta dizia "Atendemos Curitiba, a Região Metropolitana e
    // compradores de fora do estado" — verdadeiro e menor que a operação. O
    // dono confirmou em 04/09/2026 que a loja entrega no Brasil todo; o que é
    // regional é a MÍDIA, não o serviço. `areaServed` do schema continua sendo
    // o raio de competição, e é outra coisa (ver `schemaLoja.ts`).
    const faq = lerCodigo("src/lib/paginasInstitucionais.ts");
    expect(faq).toMatch(/entregamos para todo o Brasil/i);
    expect(faq).not.toMatch(/Atendemos Curitiba, a Região Metropolitana/);
  });
});
