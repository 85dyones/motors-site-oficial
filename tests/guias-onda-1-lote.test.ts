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

/**
 * O lote da Onda 1 — o texto que vai para a tabela `guias`, antes de ir.
 *
 * ---------------------------------------------------------------------------
 * Por que um teste, se o conteúdo mora no banco
 * ---------------------------------------------------------------------------
 * Justamente por isso. Depois de gravado, o texto sai do alcance de qualquer
 * trava deste repositório — `tests/coerencia-da-pericia.test.ts` varre `src/`,
 * e o docblock dele já registra o buraco com todas as letras: *"trava de
 * arquivo não vê texto que mora em tabela"*. Em 05/09/2026 a linha `about` do
 * banco publicava "Laudo Cautelar 100% Aprovado" com 35 aprovados de 83, fora
 * do alcance de todo teste.
 *
 * `conteudo-seo/guias-onda-1.json` é a única janela em que essas oito peças
 * passam por dentro do repositório. É aqui, e só aqui, que dá para prendê-las.
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo trava
 * ---------------------------------------------------------------------------
 *  1. a promessa do laudo — decisão do dono em 16/09/2026: o laudo fica com o
 *     vendedor e sai a pedido, e nenhuma peça pode dizer que ele está na ficha,
 *     publicado, aberto no anúncio ou entregue sem pedir;
 *  2. o lote sobrevive inteiro à validação da ROTA do painel — pelas funções
 *     de verdade, não por uma cópia delas. A rota corta em silêncio (2000
 *     caracteres num parágrafo, seção sem texto); texto que só entra cortado
 *     não é o texto que o dono aprovou;
 *  3. a régua do aplicador (`conteudo-seo/aplicar-guias.mjs`) passa — o script
 *     é ESM puro e copia as funções de `guiaValidacao` para rodar sem
 *     `node_modules`; importar as duas pontas aqui é o que impede a cópia de
 *     envelhecer sozinha.
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

const lote = JSON.parse(
  readFileSync(join(__dirname, "..", "conteudo-seo", "guias-onda-1.json"), "utf8"),
) as { guias: GuiaJson[] };

const AS_OITO = [
  "laudo-cautelar-carro-usado",
  "resultados-laudo-cautelar",
  "pericia-cautelar-curitiba",
  "consultar-carro-leilao-sinistro",
  "chassi-remarcado",
  "cautelar-x-vistoria-transferencia",
  "carro-reprovado-cautelar-como-vender",
  "o-que-reprova-pericia-cautelar",
];

/** Tudo o que um leitor vê da peça, campo a campo. */
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

describe("o lote da Onda 1 é o que se espera dele", () => {
  it("são as oito peças, todas publicadas", () => {
    expect(lote.guias.map((g) => g.slug)).toEqual(AS_OITO);
    expect(lote.guias.every((g) => g.estado === "publicado")).toBe(true);
  });

  it("não encosta no guia que já está no banco", () => {
    // Ele está em rascunho, é do dono decidir o que fazer com ele, e o upsert
    // por slug não pergunta antes de sobrescrever.
    expect(lote.guias.map((g) => g.slug)).not.toContain("o-que-a-pericia-cautelar-nao-verifica");
  });

  it("não traz publicado_em nem atualizado_por — quem grava define", () => {
    for (const guia of lote.guias) {
      expect(Object.keys(guia)).not.toContain("publicado_em");
      expect(Object.keys(guia)).not.toContain("atualizado_por");
    }
  });
});

describe("nenhuma peça promete o laudo na ficha", () => {
  /**
   * As duas primeiras varreduras são as de `tests/coerencia-da-pericia.test.ts`
   * — e aqui SEM a absolvição do "aprovad" por perto. Lá ela existe porque
   * "assim que a perícia é aprovada" descrevia o comportamento da ficha; desde
   * 16/09/2026 o caminho é um só, aprovada ou não, e é justamente essa frase
   * que não pode voltar.
   */
  const PADROES: [string, RegExp][] = [
    ["laudo prometido na ficha", /laudo[^.]{0,90}?(?:na ficha|ficha do|ficha de|de cada)[^.]{0,120}/i],
    ["publicação automática", /assim que (?:for |é )?aprovad|laudo (?:publicado|na ficha)|publicado na ficha/i],
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

  it("a frase nova aparece em todas as oito", () => {
    // Guarda positiva do par: tirar a promessa antiga sem pôr a nova deixaria
    // o leitor sem saber onde o laudo está, que é o silêncio que a decisão de
    // 16/09 veio quebrar. A régua é a ideia — laudo, e a quem pedir —, não a
    // grafia de uma frase.
    for (const guia of lote.guias) {
      const tudo = tudoQueOLeitorVe(guia)
        .map((b) => b.texto)
        .join(" ");
      expect(tudo, `${guia.slug} não diz onde o laudo está`).toMatch(
        /laudo[^.]{0,120}\b(?:vendedor|consulta)\b/i,
      );
    }
  });
});

describe("o lote passa pela porta do painel sem ser cortado", () => {
  it.each(AS_OITO)("%s", (slug) => {
    const guia = lote.guias.find((g) => g.slug === slug)!;

    expect(normalizarSlug(guia.slug)).toBe(guia.slug);
    expect(guia.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);

    // Os limites da rota são de CORTE, não de recusa: o que passa de 2000 num
    // parágrafo entra pela metade e ninguém avisa. Comparar com o normalizado
    // é como se pergunta "o texto entra inteiro?".
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
  it("`node conteudo-seo/aplicar-guias.mjs` não acha erro", () => {
    const { erros } = conferir(lote);
    expect(erros, `o script reprovaria o lote:\n${erros.join("\n")}`).toEqual([]);
  });
});
