import { describe, it, expect } from "vitest";
import { ler, lerCodigo, semComentarios } from "./fonte";
import {
  GARANTIA_MESES,
  PERGUNTAS_DE_FINANCIAMENTO,
  PERGUNTAS_DE_GARANTIA,
  SECOES_DE_GARANTIA,
  TEXTO_DE_FINANCIAMENTO,
  TEXTO_DE_GARANTIA,
} from "../src/lib/paginasInstitucionais";
import { PROCEDENCIA_PADRAO } from "../src/lib/procedencia";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Todo .ts/.tsx servido ao visitante, já sem comentários. */
function arquivosPublicos(): { caminho: string; codigo: string }[] {
  const raiz = join(__dirname, "..", "src");
  const saida: { caminho: string; codigo: string }[] = [];
  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) {
        if (nome === "test") continue;
        varrer(caminho);
      } else if (/\.tsx?$/.test(nome)) {
        saida.push({
          caminho: caminho.replace(/\\/g, "/"),
          codigo: semComentarios(readFileSync(caminho, "utf-8")),
        });
      }
    }
  };
  varrer(raiz);
  return saida;
}

/**
 * `/financiamento` e `/garantia` — as duas páginas em que cada frase é uma
 * promessa pública da loja.
 *
 * Este arquivo não testa comportamento: testa **o que o site tem permissão de
 * afirmar**. É o tipo de coisa que se degrada por acréscimo — alguém acrescenta
 * "taxa a partir de 0,99%" numa terça-feira e ninguém percebe até virar
 * reclamação. Os limites aqui saem de `conteudo-seo/POSICIONAMENTO.md`, da
 * regulação de publicidade de crédito e do CDC.
 */

/**
 * A prosa inteira da `/garantia` — a abertura E as seções.
 *
 * Desde 2026-09-13 a página tem dois arrays de texto: `TEXTO_DE_GARANTIA`, sob
 * o `<h1>`, e `SECOES_DE_GARANTIA`, com os `<h2>` da proposta do pacote. Trava
 * de permissão que olhasse só o primeiro deixaria passar exclusão,
 * superioridade ou "premium" escritos numa seção — o texto novo moraria
 * exatamente onde a régua não mede.
 */
const TEXTO_DA_GARANTIA = [
  ...TEXTO_DE_GARANTIA,
  ...SECOES_DE_GARANTIA.flatMap((s) => [s.titulo, ...s.paragrafos]),
].join(" ");

const TEXTO_INTEIRO = [
  ...TEXTO_DE_FINANCIAMENTO,
  TEXTO_DA_GARANTIA,
  ...PERGUNTAS_DE_FINANCIAMENTO.flatMap((p) => [p.pergunta, p.resposta]),
  ...PERGUNTAS_DE_GARANTIA.flatMap((p) => [p.pergunta, p.resposta]),
].join(" ");

describe("financiamento não promete o que depende do banco", () => {
  it("nenhuma taxa, percentual ou parcela fechada no texto", () => {
    // Página com valor de parcela exige CET, quantidade e valor total pela
    // regulação de publicidade de crédito (§1.4b). Quem entrega os três, com o
    // aviso de que a taxa varia, é o simulador — não a prosa em volta dele.
    const financiamento = [
      ...TEXTO_DE_FINANCIAMENTO,
      ...PERGUNTAS_DE_FINANCIAMENTO.flatMap((p) => [p.pergunta, p.resposta]),
    ].join(" ");

    expect(financiamento).not.toMatch(/\d+[,.]\d+\s*%/);
    expect(financiamento).not.toMatch(/a partir de\s*R\$/i);
    expect(financiamento).not.toMatch(/\bR\$\s*\d/);
  });

  it("não promete aprovação", () => {
    expect(TEXTO_INTEIRO).not.toMatch(/aprova(ção|do)\s+(garantid|cert|imediat)/i);
    expect(TEXTO_INTEIRO).not.toMatch(/todos\s+(são\s+)?aprovad/i);
    expect(TEXTO_INTEIRO).not.toMatch(/nome sujo|negativad/i);
  });

  it("diz explicitamente que a simulação é estimativa", () => {
    const financiamento = [
      ...TEXTO_DE_FINANCIAMENTO,
      ...PERGUNTAS_DE_FINANCIAMENTO.map((p) => p.resposta),
    ].join(" ");

    expect(financiamento).toMatch(/estimativa/i);
    expect(financiamento).toMatch(/análise de crédito/i);
  });

  it("o simulador da página é o mesmo da ficha, com o mesmo aviso", () => {
    // Duas calculadoras significariam duas tabelas de taxa envelhecendo em
    // ritmos diferentes na mesma loja.
    expect(lerCodigo("src/components/SimuladorDeFinanciamento.tsx")).toMatch(
      /import\("\.\/CalculadoraFinanciamento"\)/,
    );
    expect(ler("src/components/CalculadoraFinanciamento.tsx")).toMatch(/TAC e IOF/);
  });

  it("«o simulador abaixo» é verdade — ele vem antes da grade", () => {
    /**
     * Achado pelo dono na produção em 05/09/2026. O texto de abertura promete
     * "o simulador **abaixo** responde a primeira pergunta"; medido na página,
     * a frase estava a 267px do topo e o primeiro campo do simulador a
     * **1702px**, com a grade de nove cards entre os dois. "Abaixo" quer dizer
     * o próximo bloco, não o que vem depois de rolar a vitrine inteira.
     *
     * O teste prende os DOIS lados: se alguém trocar a palavra, ou mover o
     * simulador de volta para depois da grade, uma das duas asserções cai. Não
     * adianta guardar só a posição — a promessa mora no texto.
     */
    expect(TEXTO_DE_FINANCIAMENTO.join(" ")).toMatch(/simulador abaixo/i);
    expect(lerCodigo("src/app/financiamento/page.tsx")).toMatch(
      /posicaoDoConteudo="antes-da-grade"/,
    );
  });

  it("e o aviso de estoque vazio aponta para o lado certo", () => {
    // Ele é renderizado no lugar da GRADE, que agora vem depois do simulador:
    // dizer "o simulador abaixo" ali manda o cliente para o rodapé.
    const fonte = lerCodigo("src/app/financiamento/page.tsx");

    expect(fonte).toMatch(/textoSemEstoque="[^"]*simulador acima/);
    expect(fonte).not.toMatch(/textoSemEstoque="[^"]*simulador abaixo/);
  });

  it("o bloco livre tem UM lugar por página, não dois", () => {
    // `conteudo` renderizado nos dois pontos duplicaria o simulador na tela e
    // no HTML — dois formulários com os mesmos `id`, que é erro de
    // acessibilidade antes de ser erro visual.
    const layout = lerCodigo("src/components/modernist/PaginaDeEstoque.tsx");
    const usos = [...layout.matchAll(/posicaoDoConteudo === "(antes|depois)-da-grade" && blocoLivre/g)];

    expect(usos).toHaveLength(2);
    expect(usos.map((u) => u[1])).toEqual(["antes", "depois"]);
    // E o padrão continua sendo depois: `/garantia` não foi tocada.
    expect(layout).toMatch(/posicaoDoConteudo = "depois-da-grade"/);
    expect(lerCodigo("src/app/garantia/page.tsx")).not.toMatch(/posicaoDoConteudo/);
  });
});

describe("garantia afirma o prazo sem vendê-lo como vantagem", () => {
  it("declara os três meses", () => {
    expect(GARANTIA_MESES).toBe(3);
    expect(TEXTO_DE_GARANTIA.join(" ")).toMatch(/três meses/i);
  });

  it("o site inteiro diz o MESMO prazo — nenhuma tela escreve o número à mão", () => {
    /* Em 2026-09-01 o dono encontrou "6 MESES · GARANTIA MOTOR E CÂMBIO" na
       régua de `/sobre`, enquanto `/garantia` — a página que responde pelo
       compromisso — dizia "três meses" desde 25/08. Duas afirmações
       CONTRATUAIS diferentes no mesmo site, e a errada aparecia primeiro para
       quem chega pelo "Sobre".

       A constante já existia e ninguém a usava. É a mesma armadilha do
       telefone da loja: número escrito à mão numa tela e fonte canônica
       parada — enquanto as duas concordam ninguém percebe, e quando divergem
       o cliente lê uma promessa que a loja não assinou.

       A varredura é sobre CÓDIGO, não sobre prosa: comentário que conta esta
       história cita o "6 MESES" de propósito, e trava tem de medir o que vai
       à tela. Ficam de fora `/admin` (é a tela que edita) e `/garagem`, onde
       `garantia_meses` é o prazo REAL daquele contrato, lido do banco. */
    const publicas = arquivosPublicos().filter(
      ({ caminho }) => !/\/(admin|garagem)\//.test(caminho),
    );
    expect(publicas.length).toBeGreaterThan(50);

    for (const { caminho, codigo } of publicas) {
      /* Duração escrita à mão PERTO da palavra garantia. A primeira versão
         caçava qualquer "N meses" e reprovou `avaliacoesGoogle.ts`, que diz
         "há 1 mês" — data relativa de avaliação, não promessa. Régua larga
         demais é régua que alguém desliga na primeira sexta-feira. */
      const suspeitos: string[] = [];
      const re = /\b\d+\s+(MESES|meses|mês)\b/g;
      let achado: RegExpExecArray | null;
      while ((achado = re.exec(codigo)) !== null) {
        const janela = codigo.slice(Math.max(0, achado.index - 120), achado.index + 120);
        if (/garantia/i.test(janela)) suspeitos.push(achado[0]);
      }
      expect(suspeitos, `${caminho}: ${suspeitos.join(" | ")}`).toEqual([]);
    }
  });

  it("a régua de /sobre lê a constante, e é a mesma de /garantia", () => {
    const sobre = lerCodigo("src/components/SobreClientWrapper.tsx");
    expect(sobre).toContain("GARANTIA_MESES");
    expect(sobre).toContain("${GARANTIA_MESES} MESES");
    // E o rótulo continua dizendo o escopo — prazo sem escopo é promessa solta.
    expect(sobre).toContain("GARANTIA MOTOR E CÂMBIO");
  });

  it("diz que a cobertura SOMA aos direitos do consumidor", () => {
    // 90 dias é o mínimo legal para venda por pessoa jurídica. Apresentar a
    // garantia como se substituísse o CDC seria errado — e apresentá-la como
    // grande diferencial soa ingênuo para quem pesquisou
    // (`conteudo-seo/POSICIONAMENTO.md`).
    const garantia = TEXTO_DE_GARANTIA.join(" ");

    expect(garantia).toMatch(/soma-se aos seus direitos/i);
    // A negativa precisa estar escrita: "soma-se" sozinho é ambíguo para quem
    // lê rápido, e a frase que resolve a ambiguidade é justamente a que um
    // revisor apressado corta por achar redundante.
    expect(garantia).toMatch(/não os substitui/i);
  });

  it("não usa os três meses como argumento de superioridade", () => {
    expect(TEXTO_DA_GARANTIA).not.toMatch(
      /maior garantia|melhor garantia|garantia estendida|exclusiv/i,
    );
  });

  it("NÃO lista exclusões", () => {
    // Afirmar condição contratual que este arquivo não tem como confirmar é
    // passivo nos dois sentidos: prometer o que a loja não cumpre, ou negar o
    // que ela cobre. A página delimita o escopo e remete ao termo da venda.
    const garantia = [
      TEXTO_DA_GARANTIA,
      ...PERGUNTAS_DE_GARANTIA.map((p) => p.resposta),
    ].join(" ");

    // "não coberto" entrou em 13/09: a proposta do pacote traz a tabela com a
    // coluna "Não coberto", e /não cobre/ não casa com "coberto". Proibir só a
    // grafia antiga deixaria passar a variante exata que estava na mesa.
    expect(garantia).not.toMatch(/não cobre|não coberto|excluí|exceto|salvo/i);
    expect(garantia).toMatch(/termo/i);
  });

  it("o escopo é o mesmo que a ficha do veículo já anuncia", () => {
    // A faixa de procedência da PDP diz "Garantia de motor e câmbio". Duas
    // versões da mesma promessa no mesmo site é como o cliente descobre no
    // balcão que uma delas não vale.
    const daFicha = PROCEDENCIA_PADRAO.find((i) => i.id === "garantia");

    expect(daFicha?.titulo).toMatch(/motor e câmbio/i);
    expect(TEXTO_DE_GARANTIA.join(" ")).toMatch(/motor e câmbio/i);
    expect(TEXTO_DE_GARANTIA.join(" ")).toMatch(/sem carência e sem franquia/i);
  });

  it("a página reaproveita a faixa de procedência em vez de reescrevê-la", () => {
    expect(lerCodigo("src/app/garantia/page.tsx")).toMatch(/normalizarProcedencia\(settings\.procedencia\)/);
  });
});

describe("vocabulário da casa", () => {
  it('nenhuma das duas páginas usa "premium"', () => {
    // Decisão de 2026-08-17: a mediana do estoque é R$ 65.900 e "premium"
    // aplicado a um carro de R$ 27 mil é mentira pequena que o comprador
    // percebe na primeira linha.
    expect(TEXTO_INTEIRO).not.toMatch(/premium/i);
  });

  it("o diferencial afirmado é a seleção, não o mínimo legal", () => {
    expect(TEXTO_DE_GARANTIA.join(" ")).toMatch(/três entram/i);
    expect(TEXTO_DE_GARANTIA.join(" ")).toMatch(/perícia cautelar independente/i);
  });
});

/**
 * A `/garantia` revista em 2026-09-13, alinhada às peças da Onda 1.
 *
 * Pedido: *"precisamos rever este texto do /garantia, alinhar com o restante
 * das peças conforme o proposto"*. A proposta é
 * `conteudo-seo/pacote/paginas/garantia.md`, versão 3, camada 1 — os blocos
 * `[C2]` de garantia estendida ficam fora até a parceria existir.
 *
 * Duas coisas da proposta NÃO entraram, e este bloco deixa a recusa à vista:
 *
 *   · **a tabela "o que está coberto e o que não está"** — conflita com a
 *     decisão escrita em `paginasInstitucionais.ts` e travada acima em "NÃO
 *     lista exclusões". Fica para decisão do dono;
 *   · **o "Nunca pedimos" absoluto sobre termo de isenção** — a peça 07 aponta
 *     que o repasse entre lojistas pode usar esse termo. A frase fica restrita
 *     à venda ao consumidor, que é a saída que a própria peça propôs.
 */
describe("a /garantia alinhada às peças", () => {
  it("tem as três seções da proposta, na ordem, nenhuma vazia", () => {
    expect(SECOES_DE_GARANTIA.map((s) => s.titulo)).toEqual([
      "A garantia da Motors Store",
      "O que fazer se algo falhar",
      "Por que a perícia vem antes da garantia",
    ]);
    for (const secao of SECOES_DE_GARANTIA) {
      expect(secao.paragrafos.length, secao.titulo).toBeGreaterThan(0);
    }
  });

  it("a página desenha as seções", () => {
    expect(lerCodigo("src/app/garantia/page.tsx")).toMatch(/secoes=\{SECOES_DE_GARANTIA\}/);
  });

  it("não ensina garantia legal — só diz que a cobertura soma (T8)", () => {
    // O pacote tirou a camada legal por decisão editorial: a página descreve o
    // que a loja entrega. O que fica é a frase que impede a garantia de parecer
    // a única cobertura existente, e ela tem trava própria acima.
    expect(TEXTO_DA_GARANTIA).not.toMatch(
      /a lei já garante|vício|produto durável|pessoa jurídica|código de defesa/i,
    );
    expect(TEXTO_DA_GARANTIA).toMatch(/soma-se aos seus direitos/i);
  });

  it("descreve quem faz a perícia pela redação canônica de 09/09", () => {
    expect(TEXTO_DA_GARANTIA).toMatch(/empresa independente, credenciada junto ao Detran/);
    expect(TEXTO_DA_GARANTIA).not.toMatch(/laboratório credenciado/i);
  });

  it("o termo de isenção fica restrito à venda ao consumidor (T3 com a peça 07)", () => {
    expect(TEXTO_DA_GARANTIA).toMatch(/venda ao consumidor[^.]*termo de isenção/i);
    expect(TEXTO_DA_GARANTIA).not.toMatch(/nunca pedimos/i);
  });

  it("mantém o crivo técnico de showroom, que /sobre também publica", () => {
    // A proposta do pacote omite o crivo. `tabela-de-guias.test.ts` já tratou
    // essa omissão como defeito: duas superfícies respondendo diferente sobre a
    // metade mecânica. Procedência: `aboutSettings.value2`.
    expect(TEXTO_DA_GARANTIA).toMatch(/crivo técnico de showroom/);
    expect(TEXTO_DA_GARANTIA).toMatch(/120 pontos/);
  });
});
