import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizarCorpo,
  normalizarFaq,
  normalizarSaida,
  normalizarSlug,
  normalizarSobre,
  problemasParaPublicar,
  texto,
} from "../src/lib/guiaValidacao";
import { conferir } from "../conteudo-seo/aplicar-guias.mjs";
import { PRAZO_DA_GARANTIA } from "../src/lib/paginasInstitucionais";

/**
 * O lote da Onda 3 — troca, venda e preço. Dez peças do lado de quem vende o
 * carro para a loja, troca ou consigna, e de quem compara preço.
 *
 * ---------------------------------------------------------------------------
 * O risco desta onda
 * ---------------------------------------------------------------------------
 * As ondas 1 e 2 falavam do carro. Esta fala do DINHEIRO do leitor — quanto o
 * carro dele vale, quando ele recebe, o que sai do valor. É o terreno em que um
 * texto de loja mais facilmente vira promessa ("pagamos a tabela"), ataque
 * ("o mercado te engana") ou parecer ("você tem direito a"). As travas abaixo
 * são o pacote (`conteudo-seo/pacote/00-guia-normativo.md`) virado teste:
 *
 *  T1  a lógica da avaliação se publica; o multiplicador, nunca;
 *  T2  "abaixo da FIPE" e "desconto" não existem no lado de quem vende;
 *  T4  concorrente não é nomeado — plataforma é pela categoria;
 *
 * mais os fatos que o dono confirmou em 18/09/2026 (`ONDA-3-FATOS.md`): a
 * quitação do financiado com o saldo virando entrada, os dois formatos de
 * consignação, a procuração da comunicação de venda e o prazo de até oito dias
 * para o vendedor receber — que não pode aparecer como exigência legal, porque
 * o dono não disse isso.
 */

interface SecaoJson {
  titulo: string;
  paragrafos: string[];
}

interface GuiaJson {
  slug: string;
  titulo: string;
  titulo_seo: string;
  descricao: string;
  corpo: SecaoJson[];
  faq: { pergunta: string; resposta: string }[];
  saida: { rotulo: string; href: string; apoio: string };
  sobre: string[];
  estado: string;
}

const lerLote = (arquivo: string) =>
  (JSON.parse(readFileSync(join(__dirname, "..", "conteudo-seo", arquivo), "utf8")) as {
    guias: GuiaJson[];
  }).guias;

const lote = { guias: lerLote("guias-onda-3.json") };

const AS_DEZ = [
  "quanto-vale-meu-carro-usado",
  "carro-na-troca",
  "vender-carro-financiado",
  "consignacao-de-carro",
  "o-que-a-loja-assume-na-compra",
  "vender-sozinho-ou-para-loja",
  "documentos-para-vender-carro",
  "vender-carro-curitiba",
  "tabela-fipe-nao-e-preco-de-venda",
  "carro-de-loja-ou-particular",
];

function tudoQueOLeitorVe(guia: GuiaJson): { onde: string; texto: string }[] {
  return [
    { onde: "titulo", texto: guia.titulo },
    { onde: "titulo_seo", texto: guia.titulo_seo },
    { onde: "descricao", texto: guia.descricao },
    ...guia.corpo.flatMap((secao) => [
      { onde: `${secao.titulo} (título)`, texto: secao.titulo },
      ...secao.paragrafos.map((p, i) => ({ onde: `${secao.titulo} [${i}]`, texto: p })),
    ]),
    ...guia.faq.flatMap((item) => [
      { onde: `FAQ ${item.pergunta}`, texto: item.pergunta },
      { onde: `FAQ ${item.pergunta} (resposta)`, texto: item.resposta },
    ]),
    { onde: "saida.rotulo", texto: guia.saida.rotulo },
    { onde: "saida.apoio", texto: guia.saida.apoio },
  ];
}

const textoInteiro = (guia: GuiaJson) =>
  tudoQueOLeitorVe(guia)
    .map((b) => b.texto)
    .join(" ");

const frases = (guia: GuiaJson) => textoInteiro(guia).split(/(?<=[.!?])\s+/);

const peca = (slug: string) => lote.guias.find((g) => g.slug === slug)!;

describe("o lote da Onda 3 é o que se espera dele", () => {
  it("são as dez peças, publicadas", () => {
    expect(lote.guias.map((g) => g.slug)).toEqual(AS_DEZ);
    expect(lote.guias.every((g) => g.estado === "publicado")).toBe(true);
  });

  it("nove saem por /avaliacao e a de loja ou particular sai pelo estoque", () => {
    for (const guia of lote.guias) {
      const esperada = guia.slug === "carro-de-loja-ou-particular" ? "/estoque" : "/avaliacao";
      expect(guia.saida.href, guia.slug).toBe(esperada);
    }
  });

  it("não colide com nenhum lote já publicado", () => {
    const jaPublicados = [
      ...lerLote("guias-onda-1.json"),
      ...lerLote("guias-onda-2.json"),
      ...lerLote("guias-onda-2-garantia.json"),
    ].map((g) => g.slug);
    for (const guia of lote.guias) {
      expect(jaPublicados).not.toContain(guia.slug);
      expect(guia.slug).not.toBe("o-que-a-pericia-cautelar-nao-verifica");
      expect(Object.keys(guia)).not.toContain("publicado_em");
      expect(Object.keys(guia)).not.toContain("atualizado_por");
    }
  });
});

describe("o pacote, virado teste", () => {
  it("T2 — nenhuma peça diz 'abaixo da FIPE' nem 'desconto'", () => {
    /* A `/avaliacao` proíbe as duas expressões, e a régua se estende a todo
       conteúdo do lado de quem vende que aponte para ela. A mecânica se
       descreve pelo que ela é — a avaliação parte da média e tira dela o que
       o carro vai custar e demorar para vender. */
    for (const guia of lote.guias) {
      expect(textoInteiro(guia), guia.slug).not.toMatch(/abaixo da (?:tabela )?fipe|descont/i);
    }
  });

  it("T1 — a lógica entra, o multiplicador não", () => {
    for (const guia of lote.guias) {
      const tudo = textoInteiro(guia);
      expect(tudo, `${guia.slug}: percentual`).not.toMatch(/\d+\s?%|por cento/i);
      expect(tudo, `${guia.slug}: preço em reais`).not.toMatch(/R\$/);
      expect(tudo, `${guia.slug}: fração da tabela`).not.toMatch(
        /\d+\s*(?:x|vezes)\s+a?\s*(?:fipe|tabela)|(?:metade|terço|quarto) da (?:fipe|tabela)/i,
      );
    }
  });

  it("T4 — concorrente não é nomeado", () => {
    for (const guia of lote.guias) {
      expect(textoInteiro(guia), guia.slug).not.toMatch(
        /webmotors|\bolx\b|kavak|icarros|mercado livre|localiza|movida|unidas|instacarro|mobiauto|carupi|facebook|marketplace/i,
      );
    }
  });

  it("nada de promessa de preço", () => {
    for (const guia of lote.guias) {
      expect(textoInteiro(guia), guia.slug).not.toMatch(
        /pagamos (?:mais|a tabela|a fipe|o melhor)|melhor avaliação|melhor preço|os melhores preços/i,
      );
    }
  });
});

describe("os fatos que o dono confirmou em 18/09", () => {
  it("financiado: a loja quita, e o saldo vira entrada", () => {
    const tudo = textoInteiro(peca("vender-carro-financiado"));
    expect(tudo).toMatch(/quita/i);
    expect(tudo).toMatch(/saldo[^.]{0,80}entrada/i);
  });

  it("consignação: dois formatos, contrato, custos de preparação, PIX", () => {
    const tudo = textoInteiro(peca("consignacao-de-carro"));
    expect(tudo).toMatch(/presencial/i);
    expect(tudo).toMatch(/digital/i);
    expect(tudo).toMatch(/contrato/i);
    expect(tudo).toMatch(/prepara/i);
    expect(tudo).toMatch(/\bpix\b/i);
  });

  it("o que a loja assume: transferência, débitos e a procuração", () => {
    const tudo = textoInteiro(peca("o-que-a-loja-assume-na-compra"));
    expect(tudo).toMatch(/transfer/i);
    expect(tudo).toMatch(/IPVA|multa/i);
    expect(tudo).toMatch(/procuraç/i);
  });

  it("o prazo de até oito dias, sem virar exigência legal", () => {
    /* "Todos os pagamentos são feitos em até 8 dias após o recebimento dos
       valores" — o dono. A explicação (compensação, conferência, registro)
       foi elaborada a pedido dele; lei ou norma, ele não citou. */
    for (const guia of lote.guias) {
      for (const frase of frases(guia).filter((f) => /\b(?:oito|8) dias\b/i.test(f))) {
        expect(frase, `${guia.slug}: prazo sem o "até"`).toMatch(/até (?:oito|8) dias/i);
        expect(frase, `${guia.slug}: prazo virou exigência legal`).not.toMatch(
          /\blei\b|exig[êe]ncia legal|obrigatório por|norma|resolução|Contran|Detran exige/i,
        );
      }
    }
  });
});

describe("as regras que valem para todo texto da casa", () => {
  const PADROES: [string, RegExp][] = [
    ["laudo prometido na ficha", /laudo[^.]{0,90}?(?:na ficha|ficha do|ficha de|de cada)[^.]{0,120}/i],
    [
      "publicação automática",
      /assim que (?:for |é )?aprovad|assim que a per[ií]cia (?:for|é) aprovad|laudo (?:publicado|na ficha)|laudo fica (?:aberto )?na ficha|publicado na ficha/i,
    ],
    ["resultado publicado", /\b(?:resultado|laudo)\b[^.]{0,40}\bpublicad|\bpublicamos\b[^.]{0,40}\b(?:resultado|laudo|perícia)\b/i],
    ["entregue sem pedir", /n[ãa]o precisa (?:nem )?pedir|sem precisar pedir|aberto no an[úu]ncio/i],
  ];

  it.each(PADROES)("%s", (nome, padrao) => {
    const infratores: string[] = [];
    for (const guia of lote.guias) {
      for (const bloco of tudoQueOLeitorVe(guia)) {
        const achado = padrao.exec(bloco.texto);
        if (achado) infratores.push(`${guia.slug} · ${bloco.onde}: ${achado[0].slice(0, 110)}`);
      }
    }
    expect(infratores, `${nome} no lote:\n${infratores.join("\n")}`).toEqual([]);
  });

  it("quem fala do laudo dos carros da loja diz onde ele está", () => {
    /* Nesta onda, "laudo" aparece em três sentidos: o dos carros da loja, que
       fica com o vendedor e sai a pedido (a regra); o que o próprio dono do
       carro pode ter e mostrar a quem compra; e dentro de título de guia
       citado ("Laudo cautelar: o que verifica e o que não verifica"). A régua
       vale para o primeiro — por isso os títulos entre aspas saem da conta, e
       a frase só conta quando fala da loja. */
    for (const guia of lote.guias) {
      const semTitulos = textoInteiro(guia).replace(/"[^"]*"/g, " ");
      const doLaudoDaLoja = semTitulos
        .split(/(?<=[.!?])\s+/)
        .filter((f) => /\blaudo\b/i.test(f) && /\bloja\b|Motors Store|vitrine|estoque/i.test(f));
      if (!doLaudoDaLoja.length) continue;
      expect(semTitulos, `${guia.slug} fala do laudo da loja sem dizer onde ele está`).toMatch(
        /laudo[^.]{0,120}\b(?:vendedor|consulta|pedido|pedir)\b/i,
      );
    }
  });

  it("a garantia da loja, quando aparece com prazo, é a expressão da casa", () => {
    for (const guia of lote.guias) {
      const tudo = textoInteiro(guia);
      expect(tudo, `${guia.slug}: prazo antigo`).not.toMatch(
        /três meses (?:contados|a partir) da entrega|três meses para falha/i,
      );
      for (const achado of tudo.matchAll(/três meses ou ([\d.]+) quilômetros[^.]*/g)) {
        expect(achado[0].startsWith(PRAZO_DA_GARANTIA), guia.slug).toBe(true);
      }
    }
  });

  it("o plano estendido, quando aparece, não é detalhado e é opcional", () => {
    for (const guia of lote.guias) {
      const tudo = textoInteiro(guia);
      expect(tudo, guia.slug).not.toMatch(
        /Gestauto|180 mil|oito anos de ano|7\.000 (?:quil|km)|7 mil quil|termo de ativação|três dias úteis|72 horas|SUSEP/i,
      );
      if (/garantia estendida|plano estendido|plano de garantia/i.test(tudo)) {
        expect(tudo, `${guia.slug} fala do plano sem dizer que é opcional`).toMatch(/opcional/i);
      }
    }
  });

  it("o alcance da entrega é o da casa", () => {
    // A régua é sobre ENTREGA. "Todo o território nacional" aparece na peça da
    // FIPE descrevendo o recorte da própria tabela, e isso está certo.
    for (const guia of lote.guias) {
      expect(textoInteiro(guia), guia.slug).not.toMatch(
        /entreg[^.]{0,80}(?:todo o Brasil|território nacional|qualquer região do Brasil)/i,
      );
    }
  });

  it("quem fala de perícia mecânica diz que ela é sob demanda", () => {
    for (const guia of lote.guias) {
      const tudo = textoInteiro(guia);
      if (!/per[ií]cia mec[âa]nica/i.test(tudo)) continue;
      expect(tudo, guia.slug).toMatch(/levanta(?:m)? suspeita|sob demanda/i);
    }
  });
});

describe("o lote passa pela porta do painel sem ser cortado", () => {
  it.each(AS_DEZ)("%s", (slug) => {
    const guia = peca(slug);

    expect(normalizarSlug(guia.slug)).toBe(guia.slug);
    expect(guia.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);

    expect(texto(guia.titulo, 200)).toBe(guia.titulo);
    expect(texto(guia.titulo_seo, 200)).toBe(guia.titulo_seo);
    expect(texto(guia.descricao, 400)).toBe(guia.descricao);
    expect(normalizarCorpo(guia.corpo)).toEqual(guia.corpo);
    expect(normalizarFaq(guia.faq)).toEqual(guia.faq);
    expect(normalizarSaida(guia.saida)).toEqual(guia.saida);
    expect(normalizarSobre(guia.sobre)).toEqual(guia.sobre);

    expect(
      problemasParaPublicar({
        titulo: guia.titulo,
        descricao: guia.descricao,
        corpo: normalizarCorpo(guia.corpo),
        saida: normalizarSaida(guia.saida),
      }),
    ).toEqual([]);
  });

  it("nenhuma seção e nenhuma pergunta se repete — são as chaves de React da página", () => {
    for (const guia of lote.guias) {
      const secoes = guia.corpo.map((s) => s.titulo);
      const perguntas = guia.faq.map((f) => f.pergunta);
      expect(new Set(secoes).size, `${guia.slug}: seção repetida`).toBe(secoes.length);
      expect(new Set(perguntas).size, `${guia.slug}: pergunta repetida`).toBe(perguntas.length);
    }
  });
});

describe("a régua do aplicador concorda com o lote", () => {
  it("`node conteudo-seo/aplicar-guias.mjs --json=…onda-3.json` não acha erro", () => {
    const { erros } = conferir(lote);
    expect(erros, `o script reprovaria o lote:\n${erros.join("\n")}`).toEqual([]);
  });
});
