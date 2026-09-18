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
import { GARANTIA_KM_TEXTO, PRAZO_DA_GARANTIA } from "../src/lib/paginasInstitucionais";

/**
 * As duas peças de garantia da Onda 2 — a que explica o que a loja cobre e a
 * que responde se o plano estendido vale a pena.
 *
 * ---------------------------------------------------------------------------
 * Por que elas têm trava própria
 * ---------------------------------------------------------------------------
 * As cinco peças de mecânica arriscam prometer exame que a loja não faz. Estas
 * duas arriscam outra coisa, e pior: falar pelo que não é da loja.
 *
 * O contrato de venda foi revisado pelo time legal do dono e fica como está —
 * a decisão dele, em 17/09/2026, foi manter a postura e descrever no site o
 * que a LOJA entrega. Então nenhuma das duas descreve o alcance da garantia
 * legal, nenhuma cita artigo, prazo de lei ou o Código, e a dúvida de direito
 * vai para quem responde por ela: Procon ou advogado. Texto de loja que ensina
 * o comprador sobre os direitos dele contra a própria loja é conflito de
 * interesse escrito em voz alta.
 *
 * O segundo risco é o plano estendido. Ele é serviço de certificação com
 * garantia, administrado pela Gestauto, em acréscimo à garantia legal; o
 * registro SUSEP que aparece no manual é de um seguro que cobre a própria
 * Gestauto, e não uma apólice do comprador. Chamar o plano de seguro venderia
 * uma proteção que ele não tem no nome — e a peça 15 existe, entre outras
 * coisas, para dizer isso ao leitor.
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

const lote = { guias: lerLote("guias-onda-2-garantia.json") };

const AS_DUAS = ["garantia-carro-usado-loja", "garantia-estendida-vale-a-pena"];

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

describe("o lote de garantia é o que se espera dele", () => {
  it("são as duas peças, publicadas, saindo por /garantia", () => {
    expect(lote.guias.map((g) => g.slug)).toEqual(AS_DUAS);
    expect(lote.guias.every((g) => g.estado === "publicado")).toBe(true);
    expect(lote.guias.every((g) => g.saida.href === "/garantia")).toBe(true);
  });

  it("não colide com nenhum lote já publicado", () => {
    // O upsert é por slug e não pergunta antes de sobrescrever.
    const jaPublicados = [...lerLote("guias-onda-1.json"), ...lerLote("guias-onda-2.json")].map(
      (g) => g.slug,
    );
    for (const guia of lote.guias) {
      expect(jaPublicados).not.toContain(guia.slug);
      expect(guia.slug).not.toBe("o-que-a-pericia-cautelar-nao-verifica");
      expect(Object.keys(guia)).not.toContain("publicado_em");
      expect(Object.keys(guia)).not.toContain("atualizado_por");
    }
  });
});

describe("a loja descreve o que ela entrega, e não os direitos de quem compra dela", () => {
  it("nenhuma cita artigo, Código ou prazo de lei", () => {
    for (const guia of lote.guias) {
      expect(textoInteiro(guia), `${guia.slug}`).not.toMatch(
        /art\.\s*\d|artigo \d|C[óo]digo de Defesa|\bCDC\b|\b90 dias\b/i,
      );
    }
  });

  it("quem fala de direito manda a dúvida para quem responde por ela", () => {
    for (const guia of lote.guias) {
      const tudo = textoInteiro(guia);
      if (!/\bdireitos?\b/i.test(tudo)) continue;
      expect(tudo, `${guia.slug} fala de direito sem apontar Procon ou advogado`).toMatch(
        /Procon|advogado/i,
      );
    }
  });
});

describe("o plano estendido entra pelo que ele é", () => {
  it("nenhuma frase afirma que o plano é seguro", () => {
    /* A peça 15 usa a palavra "seguro" de propósito, para DESFAZER a confusão
       — "não é seguro", "seguro é produto regulado", "se alguém disser que é
       seguro registrado na SUSEP, peça para ver em nome de quem está a
       apólice". A trava mede a afirmação, não a palavra: frase que diga que o
       plano é seguro, sem negar e sem ser pergunta, reprova. */
    for (const guia of lote.guias) {
      const afirmacoes = frases(guia).filter(
        (f) =>
          /\b(?:é|são) (?:um |uma )?seguros?\b/i.test(f) &&
          !/\bn[ãa]o\b/i.test(f) &&
          !f.trim().endsWith("?"),
      );
      expect(afirmacoes, `${guia.slug}: o plano apareceu como seguro`).toEqual([]);
    }
  });

  it("e a peça que fala dele diz que contratar é opcional", () => {
    // Venda casada é o risco óbvio de citar produto pago em peça de conteúdo.
    for (const guia of lote.guias) {
      const tudo = textoInteiro(guia);
      if (!/garantia estendida|plano estendido|plano de garantia/i.test(tudo)) continue;
      expect(tudo, `${guia.slug} fala do plano sem dizer que é opcional`).toMatch(/opcional/i);
    }
  });
});

describe("nenhum número que a casa não mediu", () => {
  it("sem preço e sem percentual", () => {
    for (const guia of lote.guias) {
      const tudo = textoInteiro(guia);
      expect(tudo, `${guia.slug}: preço em reais`).not.toMatch(/R\$/);
      expect(tudo, `${guia.slug}: percentual`).not.toMatch(/\d+\s?%/);
    }
  });

  it("nenhuma quilometragem solta, e a da garantia da loja é a da constante", () => {
    /* Duas fontes de quilometragem nestas peças, e cada frase diz de qual é:
       o manual do plano (7.000 km de revisão, 180 mil de elegibilidade) e o
       limite da garantia da loja, que o dono informou em 18/09/2026 — 5.000
       km, o que vier primeiro com os três meses — e que entra sempre pela
       expressão inteira de `PRAZO_DA_GARANTIA`. O contrato padrão de venda
       ainda não traz esse limite; a redação para a cláusula foi levada ao
       dono. */
    for (const guia of lote.guias) {
      const tudo = textoInteiro(guia);
      expect(tudo, `${guia.slug}`).not.toMatch(/limite de quilometragem/i);
      expect(tudo, `${guia.slug}: prazo da loja sem o limite`).not.toMatch(
        /três meses (?:contados|a partir) da entrega|três meses para falha/i,
      );
      for (const frase of frases(guia).filter((f) =>
        /\d[\d.]*\s*(?:mil\s+)?(?:km|quil[ôo]metros)/i.test(f),
      )) {
        const daLoja = frase.includes(PRAZO_DA_GARANTIA);
        const doPlano = /plano|estendid|Gestauto|manual|intervalo|revisão|troca de óleo/i.test(frase);
        expect(daLoja || doPlano, `${guia.slug}: quilometragem sem dizer de quem é -> ${frase}`).toBe(true);
      }
      for (const achado of tudo.matchAll(/três meses ou ([\d.]+) quilômetros/g)) {
        expect(achado[1], `${guia.slug}`).toBe(GARANTIA_KM_TEXTO);
      }
    }
  });

  it("o turbo aparece com a condição de fábrica, nas duas peças", () => {
    // "Se for de fábrica, sim" — resposta do dono em 18/09/2026. A peça da
    // loja diz a cobertura; a do plano diz o contraste, que é onde o comprador
    // de turbo decide se o plano acrescenta alguma coisa.
    for (const guia of lote.guias) {
      const tudo = textoInteiro(guia);
      if (!/turbo/i.test(tudo)) continue;
      expect(tudo, `${guia.slug}`).toMatch(/turbo(?:compressor)?[^.]{0,60}original de fábrica/i);
    }
  });
});

describe("o laudo continua com o vendedor", () => {
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

  it("quem cita o laudo diz onde ele está", () => {
    // A peça do plano estendido não fala de laudo, e não precisa: a régua vale
    // para quem toca no assunto.
    for (const guia of lote.guias) {
      const tudo = textoInteiro(guia);
      if (!/\blaudo\b/i.test(tudo)) continue;
      expect(tudo, `${guia.slug} cita o laudo sem dizer onde ele está`).toMatch(
        /laudo[^.]{0,120}\b(?:vendedor|consulta)\b/i,
      );
    }
  });
});

describe("o lote passa pela porta do painel sem ser cortado", () => {
  it.each(AS_DUAS)("%s", (slug) => {
    const guia = lote.guias.find((g) => g.slug === slug)!;

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
  it("`node conteudo-seo/aplicar-guias.mjs --json=…garantia.json` não acha erro", () => {
    const { erros } = conferir(lote);
    expect(erros, `o script reprovaria o lote:\n${erros.join("\n")}`).toEqual([]);
  });
});
