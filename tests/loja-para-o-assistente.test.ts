import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";
import type { CompanySettings } from "../src/types";
import { montarLoja } from "../src/app/api/ney/loja/route";
import {
  GARANTIA_MESES,
  PERGUNTAS_DE_FINANCIAMENTO,
  PERGUNTAS_DE_GARANTIA,
} from "../src/lib/paginasInstitucionais";

/**
 * O institucional que o assistente do WhatsApp lê.
 *
 * ---------------------------------------------------------------------------
 * Por que existe uma rota em vez de ingerir `/garantia`
 * ---------------------------------------------------------------------------
 * O Captain **rastreia os links da página que recebe**. Medido em 05/09/2026:
 * ingerir três URLs produziu **48 documentos** — o rodapé do `/garantia`
 * arrastou treze hubs de marca, sete faixas de preço, dez âncoras da própria
 * política de privacidade, o `wa.me` e o site da ANPD.
 *
 * Vinte e seis deles carregavam preço de carro congelado, que é justamente o
 * que o assistente está proibido de dizer. E apagá-los à mão não resolve:
 * reingerir a mesma página os traz de volta.
 *
 * `text/plain` não tem `<a>`, então não há o que seguir. É a defesa inteira.
 */

const ROTA = "src/app/api/ney/loja/route.ts";
const fonte = lerCodigo(ROTA);

const EMPRESA = {
  name: "Motors Store",
  address: "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350",
  hours: "Seg a Sex das 08h30 às 18h30\nSáb das 08h30 às 15h",
  whatsapp: "41 99737-2165",
  whatsappRaw: "5541997372165",
} as CompanySettings;

const texto = montarLoja(EMPRESA, "05/09/2026, 12:00:00");

describe("o arquivo não pode ser rastreável", () => {
  it("é servido como texto puro, não como HTML", () => {
    // É o que impede o Captain de seguir link e reingerir meio site.
    expect(fonte).toMatch(/"Content-Type": "text\/plain; charset=utf-8"/);
  });

  it("e o motivo está escrito, para ninguém 'melhorar' isto depois", () => {
    // `ler` e não `lerCodigo`: a razão vive num comentário de bloco, e é
    // exatamente ela que impede a próxima pessoa de trocar isto por uma
    // ingestão da página HTML "que dá na mesma".
    const comComentarios = ler(ROTA);

    expect(comComentarios).toMatch(/rastreia os links da página que recebe/);
    expect(comComentarios).toMatch(/48 documentos/);
  });

  it("o conteúdo não tem marcação de link", () => {
    // Markdown `[texto](url)` também é link para um rastreador que o entenda.
    // As URLs entram cruas, para o assistente citar, não para ser seguidas.
    expect(texto).not.toMatch(/\]\(https?:/);
    expect(texto).not.toMatch(/<a\s/i);
  });
});

describe("o institucional não carrega preço", () => {
  it("nem símbolo, nem parcela, nem taxa", () => {
    expect(texto).not.toMatch(/R\$/);
    expect(texto).not.toMatch(/\d+[,.]\d+\s*%/);
  });

  it("e avisa o assistente de que a ausência é deliberada", () => {
    expect(texto).toMatch(/Não há preço aqui, nem de carro nem de parcela/);
    expect(texto).toMatch(/Nunca estime e nunca diga que não tem acesso/);
  });

  it("repete as proibições de crédito no lugar onde elas importam", () => {
    // A diretriz do assistente já diz isso. Repetir DENTRO da seção de
    // financiamento é o que garante que a regra venha junto quando o Captain
    // recupera só aquele pedaço.
    expect(texto).toMatch(/Nunca diga taxa, parcela ou valor/);
    expect(texto).toMatch(/aprovação é garantida/);
    expect(texto).toMatch(/Não peça CPF, RG, comprovante de renda/);
  });
});

describe("a fonte é a mesma que o site publica", () => {
  it("garantia, financiamento e FAQ vêm dos módulos, não copiados", () => {
    // Texto copiado envelhece em silêncio, e o assistente passa a afirmar no
    // privado uma versão que o site já corrigiu.
    expect(fonte).toMatch(/TEXTO_DE_GARANTIA/);
    expect(fonte).toMatch(/TEXTO_DE_FINANCIAMENTO/);
    expect(fonte).toMatch(/PERGUNTAS_DE_GARANTIA/);
    expect(fonte).toMatch(/PERGUNTAS_DE_FINANCIAMENTO/);
  });

  it("todas as perguntas do site entram, nenhuma fica de fora", () => {
    for (const item of [...PERGUNTAS_DE_GARANTIA, ...PERGUNTAS_DE_FINANCIAMENTO]) {
      expect(texto, item.pergunta).toContain(item.pergunta);
      expect(texto, item.pergunta).toContain(item.resposta.slice(0, 40));
    }
  });

  it("o prazo da garantia vem da constante", () => {
    expect(texto).toContain(`Prazo: ${GARANTIA_MESES} meses de motor e câmbio`);
    expect(fonte).not.toMatch(/Prazo: 3 meses/);
  });

  it("endereço, horário e telefone saem das configurações", () => {
    expect(texto).toContain("Rua Ernesto Piazzetta, 98");
    expect(texto).toContain("08h30");
    // `telefoneVisivel` é o formatador único do projeto — o rótulo e o link do
    // site saem dele, e o assistente precisa dizer o mesmo número.
    expect(texto).toContain("(41) 99737-2165");
    expect(fonte).toMatch(/telefoneVisivel\(empresa\)/);
  });
});

describe("o alcance e a entrega dizem o que o site diz", () => {
  it("uma unidade, entrega para todo o Brasil", () => {
    expect(texto).toMatch(/Uma unidade só/);
    expect(texto).toMatch(/entrega para todo o Brasil/);
  });

  it("e nenhum prazo de frete é prometido", () => {
    expect(texto).toMatch(/combinados caso a caso com o consultor/);
    expect(texto).toMatch(/Nunca prometa prazo, valor de frete nem frete grátis/);
    expect(texto).not.toMatch(/em at[ée] \d+ dias?/i);
  });
});

describe("cabe no teto do Captain", () => {
  it("o arquivo de hoje cabe com folga", () => {
    // O Captain corta em 15000 bytes e não avisa — foi assim que o documento
    // de fichas perdeu 15 dos 36 carros.
    expect(texto.length).toBeLessThanOrEqual(14000);
  });

  it("e se um dia não couber, ele DIZ, em vez de encolher calado", () => {
    // Cortar aqui perderia uma seção inteira — a de LGPD é a última, e é a que
    // sumiria primeiro. O aviso é para quem mexeu no texto, não para o cliente.
    expect(fonte).toMatch(/Este arquivo passou do limite que o Chatwoot guarda/);
    expect(fonte).toMatch(/precisa encurtá-lo ou dividi-lo em dois documentos/);
  });

  it("as cinco seções estão todas presentes", () => {
    for (const secao of [
      "Onde fica e quando abre",
      "Garantia",
      "Financiamento",
      "O que a loja tem no site",
      "Dados do cliente (LGPD)",
    ]) {
      expect(texto, secao).toContain(`## ${secao}`);
    }
  });
});

describe("os dois documentos do assistente não se sobrepõem", () => {
  it("o institucional não tem ficha de carro, e vice-versa", () => {
    // Cada um responde uma pergunta diferente. Repetir conteúdo entre os dois
    // gasta o teto de 15000 duas vezes e faz a recuperação escolher errado.
    expect(texto).not.toMatch(/- Ficha no site: /);
    expect(texto).toMatch(/A ficha técnica de cada carro está no outro/);
  });
});
