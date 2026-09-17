import { describe, it, expect } from "vitest";
import {
  escaparXml,
  truncarEmPalavra,
  imagensDoAnuncio,
  LIMITE_DO_TITULO,
  MAXIMO_DE_IMAGENS,
  CATEGORIA_GOOGLE_POR_SEGMENTO,
  TIPO_DE_VEICULO_POR_SEGMENTO,
} from "../src/lib/feedDeCatalogo";

/**
 * As peças puras do feed de catálogo.
 *
 * O feed é a única saída XML do projeto, e até 2026-09-06 o escape dele era
 * inline, duplicado em três linhas e AUSENTE nas duas que mais importam:
 * `<g:link>` e `<g:image_link>`. Um `&` numa URL — query string de CDN, por
 * exemplo — quebra o documento inteiro, e o Meta reporta isso como
 * `xml_wrong_tags`: um erro de arquivo, não de item, que derruba a carga toda.
 *
 * As asserções aqui afirmam a CONDIÇÃO (nenhum `&` fora de entidade), não uma
 * grafia de implementação. Teste que proíbe `.replace(/&/g, ...)` reprovaria
 * uma correção legítima e aprovaria uma quebrada.
 */

describe("escaparXml", () => {
  it("escapa os cinco caracteres do XML", () => {
    expect(escaparXml(`a & b < c > d " e ' f`)).toBe(
      "a &amp; b &lt; c &gt; d &quot; e &apos; f",
    );
  });

  it("cada caractere é escapado UMA vez — nenhuma entidade nasce dupla", () => {
    // A armadilha da cadeia de `.replace()`: tratando `<` antes de `&`, o `&`
    // recém-nascido em `&lt;` é escapado por cima e sai `&amp;lt;`. O documento
    // continua válido e nada acusa — só o texto do anúncio fica errado.
    //
    // ⚠️ A implementação de hoje é um laço com um ramo por caractere, e nela
    // essa inversão é impossível por construção: este teste NÃO pode falhar
    // enquanto ela for assim. Ele existe para o dia em que alguém voltar à
    // cadeia de `.replace()`, onde a ordem volta a ser carga viva.
    expect(escaparXml("a < b")).toBe("a &lt; b");
    expect(escaparXml("a > b")).toBe("a &gt; b");
    expect(escaparXml(`x " y ' z`)).toBe("x &quot; y &apos; z");
    for (const entrada of ["a < b", "a > b", `a " b`, "a ' b", "a & b"]) {
      expect(escaparXml(entrada), entrada).not.toMatch(/&amp;(lt|gt|quot|apos);/);
    }
  });

  it("não deixa nenhum & fora de entidade", () => {
    // A condição inteira, e não uma grafia: qualquer `&` que sobre sem virar
    // entidade é documento malformado, venha de onde vier.
    const entrada = `Mercedes-Benz & Cia — "aspas" & <tag> & 'plica'`;
    expect(escaparXml(entrada)).not.toMatch(/&(?!(amp|lt|gt|quot|apos);)/);
  });

  it("escapa & que já parece entidade, sem tentar adivinhar", () => {
    // `&amp;` no dado de entrada é texto literal, não marcação. Preservá-lo
    // seria adivinhar a intenção do cadastro — e adivinhar errado uma vez
    // basta para quebrar o arquivo.
    expect(escaparXml("A&amp;B")).toBe("A&amp;amp;B");
  });

  it("descarta caractere de controle proibido em XML 1.0", () => {
    // \x0B e \x08 passam por tsc, eslint e vitest, e não têm entidade: o
    // parser do Meta recusa o documento inteiro. Vêm de texto colado no painel.
    const saida = escaparXml("antes\x0Bmeio\x08depois");
    expect(saida).toBe("antesmeiodepois");
  });

  it("preserva tabulação, quebra de linha e retorno", () => {
    expect(escaparXml("a\tb\nc\rd")).toBe("a\tb\nc\rd");
  });

  it("descarta U+FFFE e U+FFFF, que sobrevivem a qualquer escape", () => {
    // Não são `Char` válidos em XML 1.0 e chegam de UTF-16 lido com a ordem de
    // bytes trocada — o primo do BOM que este projeto já viu. Saem como bytes
    // literais e derrubam o documento inteiro, a mesma classe do \x0B.
    expect(escaparXml("antes￾meio￿depois")).toBe("antesmeiodepois");
    // E o vizinho legítimo continua passando: U+FFFD é caractere válido.
    expect(escaparXml("a�b")).toBe("a�b");
  });

  it("nulo e indefinido viram string vazia, não 'null'", () => {
    // `${null}` dentro do template do feed escreveria a palavra "null" no
    // anúncio. Já aconteceu com `placa: ""` em 65 itens de /estoque.
    expect(escaparXml(null)).toBe("");
    expect(escaparXml(undefined)).toBe("");
  });
});

describe("truncarEmPalavra", () => {
  it("texto dentro do limite passa intacto", () => {
    expect(truncarEmPalavra("BMW X4 M40i", LIMITE_DO_TITULO)).toBe("BMW X4 M40i");
  });

  it("texto no limite exato passa intacto", () => {
    const exato = "a".repeat(LIMITE_DO_TITULO);
    expect(truncarEmPalavra(exato, LIMITE_DO_TITULO)).toHaveLength(LIMITE_DO_TITULO);
  });

  it("corta em limite de palavra, sem partir a última", () => {
    expect(truncarEmPalavra("abcde fghij klmno", 13)).toBe("abcde fghij");
  });

  it("aproveita a palavra que termina EXATAMENTE no limite", () => {
    // O off-by-one: sem olhar o caractere na posição `maximo`, o
    // `lastIndexOf` acha o espaço ANTERIOR e joga fora uma palavra inteira que
    // cabia. Num título de anúncio isso custa o modelo ou o ano.
    const texto = `Motors ${"X".repeat(LIMITE_DO_TITULO - 7)} extra`;
    expect(texto[LIMITE_DO_TITULO]).toBe(" "); // a montagem do caso está certa

    const saida = truncarEmPalavra(texto, LIMITE_DO_TITULO);
    expect(saida).toHaveLength(LIMITE_DO_TITULO);
    expect(saida).toBe(`Motors ${"X".repeat(LIMITE_DO_TITULO - 7)}`);
  });

  it("palavra única maior que o limite vira corte duro, não string vazia", () => {
    // Título em branco é item reprovado; título cortado é item entregue.
    const saida = truncarEmPalavra("A".repeat(LIMITE_DO_TITULO + 20), LIMITE_DO_TITULO);
    expect(saida).toHaveLength(LIMITE_DO_TITULO);
  });

  it("nunca acrescenta reticências", () => {
    const saida = truncarEmPalavra("uma frase bem longa ".repeat(10), LIMITE_DO_TITULO);
    expect(saida).not.toMatch(/\.\.\.$/);
    expect(saida).not.toMatch(/…$/);
    expect(saida.length).toBeLessThanOrEqual(LIMITE_DO_TITULO);
  });

  it("não devolve espaço sobrando na ponta", () => {
    const saida = truncarEmPalavra("abcde fghij klmno", 12);
    expect(saida).toBe(saida.trimEnd());
  });
});

describe("imagensDoAnuncio", () => {
  const url = (n: number) => `https://cdn.exemplo/foto-${n}.jpg`;

  it("devolve a galeria na ordem da ficha", () => {
    const fotos = [url(1), url(2), url(3)];
    // `toEqual` da lista inteira: prende ordem E conteúdo. `toContain` deixaria
    // a capa trocar de lugar sem ninguém perceber.
    expect(imagensDoAnuncio(fotos, [])).toEqual(fotos);
  });

  it("respeita o teto do Meta", () => {
    // O valor exato, e não só a coerência consigo mesmo: com a constante usada
    // dos dois lados, trocar 11 por 40 passava verde. Onze = 1 capa + 10
    // adicionais, o teto do Google Merchant, que é o menor dos dois
    // consumidores deste mesmo XML (o Meta aceita 21).
    expect(MAXIMO_DE_IMAGENS).toBe(11);

    const muitas = Array.from({ length: MAXIMO_DE_IMAGENS + 5 }, (_, i) => url(i));
    expect(imagensDoAnuncio(muitas, [])).toHaveLength(MAXIMO_DE_IMAGENS);
  });

  it("descarta URL relativa", () => {
    // `/logo.png` é o degrau final do mapper. Caminho relativo em feed é item
    // sem foto para o Meta — e item sem foto é item reprovado.
    expect(imagensDoAnuncio(["/logo.png", url(1)], [])).toEqual([url(1)]);
  });

  it("descarta data: e qualquer coisa que não seja http(s)", () => {
    expect(imagensDoAnuncio(["data:image/png;base64,AAAA", "ftp://x/y.jpg", url(1)], [])).toEqual([
      url(1),
    ]);
  });

  it("pula o buraco no início do array em vez de emitir capa vazia", () => {
    // O gate de publicação conta `filter(Boolean).length >= 4` sobre a linha
    // crua, então um array com buracos passa. A rota antiga indexava [0] sem
    // checar e emitia <g:image_link></g:image_link>.
    expect(imagensDoAnuncio(["", "", url(3), url(4)], [])).toEqual([url(3), url(4)]);
  });

  it("deduplica: URL repetida não queima uma das vagas", () => {
    expect(imagensDoAnuncio([url(1), url(1), url(2)], [])).toEqual([url(1), url(2)]);
  });

  it("cai para web_full_images quando não há whatsapp_images", () => {
    const webp = ["https://cdn.exemplo/foto-1.webp"];
    expect(imagensDoAnuncio([], webp)).toEqual(webp);
  });

  it("coluna que não é array devolve lista vazia", () => {
    expect(imagensDoAnuncio(null, undefined)).toEqual([]);
    expect(imagensDoAnuncio("uma string", 42)).toEqual([]);
  });
});

describe("as tabelas por segmento", () => {
  it("cobrem carro e moto", () => {
    expect(Object.keys(CATEGORIA_GOOGLE_POR_SEGMENTO).sort()).toEqual(["carros", "motos"]);
    expect(Object.keys(TIPO_DE_VEICULO_POR_SEGMENTO).sort()).toEqual(["carros", "motos"]);
  });

  it("a categoria é texto CRU — quem escapa é a emissão", () => {
    // Guardar `&amp;` aqui produziria `&amp;amp;` no XML, que é exatamente o
    // `invalid_facebook_product_category` que se está corrigindo.
    for (const categoria of Object.values(CATEGORIA_GOOGLE_POR_SEGMENTO)) {
      expect(categoria).toContain(" & ");
      expect(categoria).not.toContain("&amp;");
    }
  });

  it("carro e moto não caem na mesma categoria nem no mesmo tipo", () => {
    expect(CATEGORIA_GOOGLE_POR_SEGMENTO.carros).not.toBe(CATEGORIA_GOOGLE_POR_SEGMENTO.motos);
    expect(TIPO_DE_VEICULO_POR_SEGMENTO.carros).not.toBe(TIPO_DE_VEICULO_POR_SEGMENTO.motos);
  });
});
