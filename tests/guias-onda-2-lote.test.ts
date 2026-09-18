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
 * O lote da Onda 2 — cinco peças de mecânica, antes de irem para a tabela.
 *
 * ---------------------------------------------------------------------------
 * Por que um teste, se o conteúdo mora no banco
 * ---------------------------------------------------------------------------
 * O irmão mais velho (`guias-onda-1-lote.test.ts`) já explicou: depois de
 * gravado, o texto sai do alcance de qualquer trava deste repositório. O JSON
 * é a única janela em que estas peças passam por dentro do código, e é aqui
 * que dá para prendê-las.
 *
 * O que muda da Onda 1 para cá é o ASSUNTO, e com ele o risco. A Onda 1 fala
 * de procedência — laudo, leilão, chassi —, terreno em que a loja tem
 * documento. A Onda 2 fala de motor, câmbio e do defeito que aparece depois da
 * compra, onde a tentação é outra: prometer exame que a loja não faz, publicar
 * número que ninguém mediu e vender o plano estendido como se fosse seguro.
 * As travas abaixo são desses três erros.
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo trava
 * ---------------------------------------------------------------------------
 *  1. o que a Onda 1 já travava: a promessa do laudo (com o vendedor, a
 *     pedido), a sobrevivência à porta do painel e a régua do aplicador;
 *  2. a perícia mecânica descrita como ela é — sob demanda, para o carro que
 *     levanta suspeita —, porque dizer que todo carro passa é prometer
 *     processo que a loja não executa (resposta do dono em 17/09/2026);
 *  3. os 120 pontos com dono: são da CAUTELAR. A mesma trava existe em
 *     `paginas-institucionais.test.ts` para a página `/garantia`, e o guia que
 *     dissesse o contrário recriaria a contradição do outro lado do site;
 *  4. nenhum número sem medição: preço e percentual não entram enquanto não
 *     houver levantamento com amostra, período e método declarados — item 4 da
 *     `REGUA_DO_GUIA`. A quilometragem da garantia da loja entrou em 18/09/2026,
 *     com o número do dono, e só pela expressão de `PRAZO_DA_GARANTIA`;
 *  5. o plano estendido nunca chamado de seguro: ele é serviço de certificação
 *     com garantia, administrado pela Gestauto, e o registro SUSEP do manual
 *     cobre a própria Gestauto, não o comprador.
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
  readFileSync(join(__dirname, "..", "conteudo-seo", "guias-onda-2.json"), "utf8"),
) as { guias: GuiaJson[] };

const AS_CINCO = [
  "motores-turbo-usados-o-que-checar",
  "correia-dentada-banhada-em-oleo",
  "carbonizacao-valvulas-injecao-direta",
  "cambio-dupla-embreagem-usado",
  "vicio-oculto-carro-usado",
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

const textoInteiro = (guia: GuiaJson) =>
  tudoQueOLeitorVe(guia)
    .map((b) => b.texto)
    .join(" ");

/** As frases, para medir atribuição dentro da frase e não na página toda. */
const frases = (guia: GuiaJson) => textoInteiro(guia).split(/(?<=[.!?])\s+/);

describe("o lote da Onda 2 é o que se espera dele", () => {
  it("são as cinco peças, todas publicadas", () => {
    expect(lote.guias.map((g) => g.slug)).toEqual(AS_CINCO);
    expect(lote.guias.every((g) => g.estado === "publicado")).toBe(true);
  });

  it("não encosta no guia que já está no banco nem nas peças da Onda 1", () => {
    const daOnda1 = JSON.parse(
      readFileSync(join(__dirname, "..", "conteudo-seo", "guias-onda-1.json"), "utf8"),
    ) as { guias: { slug: string }[] };

    // O upsert é por slug e não pergunta antes de sobrescrever.
    for (const guia of lote.guias) {
      expect(guia.slug).not.toBe("o-que-a-pericia-cautelar-nao-verifica");
      expect(daOnda1.guias.map((g) => g.slug)).not.toContain(guia.slug);
    }
  });

  it("não traz publicado_em nem atualizado_por — quem grava define", () => {
    for (const guia of lote.guias) {
      expect(Object.keys(guia)).not.toContain("publicado_em");
      expect(Object.keys(guia)).not.toContain("atualizado_por");
    }
  });

  it("toda peça sai por /garantia — é a saída da onda", () => {
    // A Onda 1 termina em /estoque; esta termina na página que responde pelo
    // que a mecânica não deixa ver. Uma saída por peça, e a mesma nas cinco.
    for (const guia of lote.guias) expect(guia.saida.href).toBe("/garantia");
  });
});

describe("nenhuma peça promete o laudo na ficha", () => {
  /** As mesmas varreduras da Onda 1, sem a absolvição do "aprovad" por perto. */
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

  it("as cinco dizem onde o laudo está", () => {
    for (const guia of lote.guias) {
      expect(textoInteiro(guia), `${guia.slug} não diz onde o laudo está`).toMatch(
        /laudo[^.]{0,120}\b(?:vendedor|consulta)\b/i,
      );
    }
  });
});

describe("a operação aparece como ela é", () => {
  it("quem fala de perícia mecânica diz que ela é sob demanda", () => {
    /* Resposta 2.2 do dono: a perícia mecânica NÃO é etapa de todo carro — ela
       entra quando a avaliação levanta suspeita. Uma peça de mecânica que
       citasse o exame sem essa condição estaria vendendo processo que a loja
       não executa em toda unidade, que é o mesmo defeito do laudo que
       `coerencia-da-pericia` fechou. A régua é por PEÇA, não por frase: o
       leitor lê a página inteira, e repetir a ressalva em toda menção deixaria
       o texto impraticável. */
    for (const guia of lote.guias) {
      const tudo = textoInteiro(guia);
      if (!/per[ií]cia mec[âa]nica/i.test(tudo)) continue;
      expect(tudo, `${guia.slug} cita perícia mecânica sem dizer que é sob demanda`).toMatch(
        /levanta(?:m)? suspeita|sob demanda/i,
      );
      expect(tudo, `${guia.slug} promete perícia mecânica em todo carro`).not.toMatch(
        /per[ií]cia mec[âa]nica[^.]{0,30}\bem (?:todo|todos)\b|todo (?:carro|veículo)[^.]{0,40}per[ií]cia mec[âa]nica/i,
      );
    }
  });

  it("os 120 pontos, quando citados, são da cautelar", () => {
    // A mesma trava de `/garantia`, do outro lado do site: o número é do exame
    // de procedência, e atribuí-lo a uma etapa de showroom venderia inspeção
    // mecânica de 120 pontos que não existe.
    for (const guia of lote.guias) {
      for (const frase of frases(guia).filter((f) => /120 pontos/.test(f))) {
        expect(frase, `${guia.slug}: 120 pontos sem dono`).toMatch(/cautelar|per[ií]cia/i);
      }
      expect(textoInteiro(guia)).not.toMatch(/crivo técnico de showroom/i);
    }
  });
});

describe("nenhum número que a casa não mediu", () => {
  it("sem preço e sem percentual", () => {
    /* Item 4 da `REGUA_DO_GUIA`: número sem levantamento não entra. A peça da
       carbonização chega perto — fala de custo — e resolve por ordem de
       grandeza, declarada no texto como estimativa de mercado. */
    for (const guia of lote.guias) {
      const tudo = textoInteiro(guia);
      expect(tudo, `${guia.slug}: preço em reais`).not.toMatch(/R\$/);
      expect(tudo, `${guia.slug}: percentual`).not.toMatch(/\d+\s?%/);
    }
  });

  it("a quilometragem da garantia da loja é a da constante, e nenhuma outra fica sem dono", () => {
    /* Até 17/09/2026 esta trava proibia citar limite de quilometragem: o dono
       tinha confirmado que ele existe, sem dizer o valor, e o contrato padrão
       de venda não o traz. Em 18/09 veio o número — 5.000 km, o que vier
       primeiro com os três meses — e a régua virou do avesso: agora toda
       frase que diz o prazo da loja diz também o limite, e o limite é o de
       `PRAZO_DA_GARANTIA`, sem digitação no caminho.

       O resto da quilometragem das peças é do PLANO da Gestauto (7.000 km de
       revisão, 180 mil de elegibilidade), e a frase dele sempre nomeia o
       plano, o manual ou a revisão. */
    for (const guia of lote.guias) {
      const tudo = textoInteiro(guia);
      expect(tudo, `${guia.slug}`).not.toMatch(/limite de quilometragem/i);

      // O prazo antigo, sem o limite, não sobrou em lugar nenhum.
      expect(tudo, `${guia.slug}: prazo da loja sem o limite`).not.toMatch(
        /três meses (?:contados|a partir) da entrega|três meses para falha/i,
      );

      for (const frase of frases(guia).filter((f) => /\d[\d.]*\s*(?:mil\s+)?(?:km|quil[ôo]metros)/i.test(f))) {
        const daLoja = frase.includes(PRAZO_DA_GARANTIA);
        const doPlano = /plano|estendid|Gestauto|manual|intervalo|revisão|troca de óleo/i.test(frase);
        expect(daLoja || doPlano, `${guia.slug}: quilometragem sem dizer de quem é -> ${frase}`).toBe(true);
      }

      // Quem cita "três meses ou N quilômetros" cita o N da constante.
      for (const achado of tudo.matchAll(/três meses ou ([\d.]+) quilômetros/g)) {
        expect(achado[1], `${guia.slug}`).toBe(GARANTIA_KM_TEXTO);
      }
    }
  });
});

describe("o plano estendido entra pelo que ele é", () => {
  it("nenhuma peça chama o plano de seguro", () => {
    /* O manual traz um registro SUSEP, e ele é de um seguro de garantia
       financeira que cobre a própria Gestauto — não uma apólice do comprador.
       Chamar o plano de seguro venderia proteção que ele não tem no nome. */
    for (const guia of lote.guias) {
      for (const frase of frases(guia).filter((f) => /\bseguro\b/i.test(f))) {
        expect(frase, `${guia.slug}: "seguro" na mesma frase do plano`).not.toMatch(
          /plano|estendid|Gestauto/i,
        );
      }
      expect(textoInteiro(guia)).not.toMatch(/SUSEP/i);
    }
  });

  it("e diz que contratar é opcional onde fala dele", () => {
    // Venda casada é o risco óbvio de citar plano pago numa peça de conteúdo.
    for (const guia of lote.guias) {
      const tudo = textoInteiro(guia);
      if (!/garantia estendida|plano estendido/i.test(tudo)) continue;
      expect(tudo, `${guia.slug} fala do plano sem dizer que é opcional`).toMatch(/opcional/i);
    }
  });
});

describe("o lote passa pela porta do painel sem ser cortado", () => {
  it.each(AS_CINCO)("%s", (slug) => {
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
  it("`node conteudo-seo/aplicar-guias.mjs --json=…onda-2.json` não acha erro", () => {
    const { erros } = conferir(lote);
    expect(erros, `o script reprovaria o lote:\n${erros.join("\n")}`).toEqual([]);
  });
});
