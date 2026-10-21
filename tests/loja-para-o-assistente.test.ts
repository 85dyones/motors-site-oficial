import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";
import type { CompanySettings } from "../src/types";
import { montarLoja } from "../src/lib/lojaParaOAssistente";
import {
  ALCANCE_DA_ENTREGA,
  GARANTIA_KM_TEXTO,
  GARANTIA_MESES,
  PERGUNTAS_DE_FINANCIAMENTO,
  PERGUNTAS_DE_GARANTIA,
  SECOES_DE_GARANTIA,
} from "../src/lib/paginasInstitucionais";

/**
 * O institucional que o assistente do WhatsApp lê (`montarLoja`).
 *
 * Nasceu como documento para o Captain do Chatwoot, servido em `/api/ney/loja`
 * como texto puro (o Captain rastreava os links da página que recebia). O
 * Chatwoot saiu dos processos da Motors em 21/10/2026, e a rota com ele; o
 * texto ficou, porque o Ney de hoje o lê no prompt de cada conversa
 * (`baseDoAtendimento-servidor.ts`).
 */

const MONTAGEM = "src/lib/lojaParaOAssistente.ts";
const fonte = lerCodigo(MONTAGEM);

const EMPRESA = {
  name: "Motors Store",
  address: "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350",
  hours: "Seg a Sex das 08h30 às 18h30\nSáb das 08h30 às 15h",
  whatsapp: "41 99737-2165",
  whatsappRaw: "5541997372165",
} as CompanySettings;

const texto = montarLoja(EMPRESA, "05/09/2026, 12:00:00");

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
    // O FAQ de financiamento é função do ano mais antigo da vigência (28/09/2026).
    expect(fonte).toMatch(/perguntasDeFinanciamento\(condicoes\.anoMaisAntigo\)/);
    expect(fonte).toMatch(/SECOES_DE_GARANTIA/);
  });

  it("as seções da /garantia entram, com título e texto", () => {
    // Desde 2026-09-13 a página tem seções com `<h2>` — o que fazer se algo
    // falhar, por que a perícia vem antes. Assistente que lesse só a abertura
    // responderia "como aciono a garantia?" sem o "avise antes de mexer", que é
    // o passo que evita o reparo feito por terceiro.
    expect(SECOES_DE_GARANTIA.length).toBeGreaterThan(0);
    for (const secao of SECOES_DE_GARANTIA) {
      expect(texto, secao.titulo).toContain(secao.titulo);
      for (const paragrafo of secao.paragrafos) {
        expect(texto, secao.titulo).toContain(paragrafo.slice(0, 40));
      }
    }
  });

  it("todas as perguntas do site entram, nenhuma fica de fora", () => {
    for (const item of [...PERGUNTAS_DE_GARANTIA, ...PERGUNTAS_DE_FINANCIAMENTO]) {
      expect(texto, item.pergunta).toContain(item.pergunta);
      // A de outra cidade entra com a resposta sem o alcance (ver o bloco do
      // alcance, abaixo); todas as outras, com a resposta do site.
      if (/outra cidade/i.test(item.pergunta)) continue;
      expect(texto, item.pergunta).toContain(item.resposta.slice(0, 40));
    }
  });

  it("o prazo da garantia vem da constante", () => {
    expect(texto).toContain(`Prazo: ${GARANTIA_MESES} meses de motor e câmbio`);
    expect(fonte).not.toMatch(/Prazo: 3 meses/);
  });

  it("e o limite de quilometragem vem junto, também da constante", () => {
    // 18/09/2026: o assistente respondia "três meses" a quem pergunta quanto
    // dura a garantia, sem o limite que a loja aplica.
    expect(texto).toContain(`ou ${GARANTIA_KM_TEXTO} km — o que vier primeiro —`);
    expect(fonte).not.toMatch(/5\.000 km/);
    expect(texto).toMatch(/Turbo original de fábrica entra como parte do motor/);
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

describe("o alcance da entrega é conversa do consultor", () => {
  it("o documento não diz até onde a loja entrega, nem por dentro do FAQ da garantia", () => {
    // Decisão do dono em 14/10/2026: "só transferir, deixe o consultor lidar
    // com a objeção de área na hora certa". Até 14/10 o assistente prometia
    // "todo o Brasil" (05/09) e depois teria lido Paraná e litoral
    // catarinense. Nenhuma das duas é dele dizer.
    expect(texto).toMatch(/Uma unidade só, no Bacacheri/);
    expect(texto).not.toMatch(new RegExp(ALCANCE_DA_ENTREGA, "i"));
    expect(texto).not.toMatch(/Balneário|litoral catarinense|todo o Brasil/i);
    expect(fonte).not.toMatch(/\$\{ALCANCE_DA_ENTREGA\}/);
  });

  it("e diz o que fazer no lugar: anotar a cidade e passar ao consultor", () => {
    expect(texto).toMatch(/não fale de alcance, região, frete nem prazo/);
    expect(texto).toMatch(/Anote a cidade e passe para o consultor/);
  });

  it("a pergunta de outra cidade continua, com a cobertura e sem a região", () => {
    const pergunta = PERGUNTAS_DE_GARANTIA.find((p) => /outra cidade/i.test(p.pergunta))!;
    const depois = texto.slice(texto.indexOf(pergunta.pergunta));
    const resposta = depois.split("\n")[1];

    expect(resposta).toMatch(/A cobertura é a mesma/);
    expect(resposta).toMatch(/o consultor combina caso a caso/);
  });

  it("e nenhum prazo de frete é prometido", () => {
    expect(texto).toMatch(/combinados caso a caso com o consultor/);
    expect(texto).toMatch(/Nunca prometa prazo, valor de frete nem frete grátis/);
    expect(texto).not.toMatch(/em at[ée] \d+ dias?/i);
  });
});

describe("cabe no teto do documento", () => {
  it("o arquivo de hoje cabe com folga", () => {
    // O teto veio do Captain do Chatwoot, que cortava em 15000 bytes sem
    // avisar; o Ney de hoje lê este texto em cada conversa.
    expect(texto.length).toBeLessThanOrEqual(14000);
  });

  it("e se um dia não couber, ele DIZ, em vez de encolher calado", () => {
    // Cortar aqui perderia uma seção inteira — a de LGPD é a última, e é a que
    // sumiria primeiro. O aviso é para quem mexeu no texto, não para o cliente.
    expect(fonte).toMatch(/Este arquivo passou do limite do documento da loja/);
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
