import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TERMOS_COM_DESTINO, criarLinkador, segmentarComLinks } from "../src/lib/linksNoTexto";
import BlocoLaudoPendente from "../src/components/BlocoLaudoPendente";
import { perguntasDeCategoria } from "../src/lib/textoDosHubs";
import { TEXTO_PONTE_DO_GUIA } from "../src/lib/textoDoLaudo";

/**
 * As peças da Onda 1 se citam — e, desde 17/09/2026, a citação vira link.
 *
 * ---------------------------------------------------------------------------
 * O que estava acontecendo
 * ---------------------------------------------------------------------------
 * O corpo do guia é TEXTO PURO: `src/app/guias/[slug]/page.tsx` não lê markdown
 * e link escrito no texto não existe. Quem decide onde há link é
 * `TERMOS_COM_DESTINO`. Publicada a Onda 1, as oito peças passaram a se citar
 * pelo título — 13 citações medidas no banco em 17/09 — e nenhuma linkava.
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo trava
 * ---------------------------------------------------------------------------
 * 1. toda peça publicada é destino de algum termo, e todo destino `/guias/…`
 *    existe no lote — link para peça de onda futura é link quebrado, e o
 *    pacote proíbe;
 * 2. o termo casa de verdade: `segmentarComLinks` usa `\b…\b`, então termo que
 *    comece ou termine em pontuação nunca dispara. Foi o caso do título "Meu
 *    carro reprovou no laudo cautelar. E agora?", que entrou cortado no ponto;
 * 3. a página não linka para ela mesma, que é o defeito que o `caminhoAtual`
 *    fecha — e a rota do guia passava sem ele até 17/09;
 * 4. o ganho não sumiu: as oito páginas continuam linkando para alguma
 *    vizinha. Se alguém reescrever uma peça e apagar a citação, isto cai.
 */

interface PecaDoLote {
  slug: string;
  titulo: string;
  descricao: string;
  corpo: { titulo: string; paragrafos: string[] }[];
  faq: { pergunta: string; resposta: string }[];
  saida: { rotulo: string; href: string; apoio: string };
}

const lote = JSON.parse(
  readFileSync(join(__dirname, "..", "conteudo-seo", "guias-onda-1.json"), "utf8"),
) as { guias: PecaDoLote[] };

/** Tudo o que o leitor vê da peça, na ordem em que a página renderiza. */
function textosDaPeca(peca: PecaDoLote): string[] {
  return [
    peca.titulo,
    peca.descricao,
    ...peca.corpo.flatMap((secao) => [secao.titulo, ...secao.paragrafos]),
    ...peca.faq.flatMap((item) => [item.pergunta, item.resposta]),
    peca.saida.apoio,
  ];
}

/** Os links que a PÁGINA da peça produz, com a régua de uma por destino. */
function linksDaPagina(peca: PecaDoLote): string[] {
  const linkar = criarLinkador(`/guias/${peca.slug}`);
  const achados: string[] = [];
  for (const texto of textosDaPeca(peca)) {
    for (const parte of linkar(texto)) {
      if (parte.href) achados.push(parte.href);
    }
  }
  return achados;
}

const SLUGS = lote.guias.map((g) => g.slug);
const DESTINOS_DE_GUIA = TERMOS_COM_DESTINO.filter((d) => d.href.startsWith("/guias/"));

describe("a lista de termos aponta para peças que existem", () => {
  it("toda peça publicada é destino de pelo menos um termo", () => {
    for (const slug of SLUGS) {
      const termos = DESTINOS_DE_GUIA.filter((d) => d.href === `/guias/${slug}`);
      expect(termos.length, `nenhum termo leva a /guias/${slug}`).toBeGreaterThan(0);
    }
  });

  it("nenhum termo leva a peça que ainda não existe", () => {
    const fora = DESTINOS_DE_GUIA.filter((d) => !SLUGS.includes(d.href.replace("/guias/", "")));
    expect(fora.map((d) => d.href), "destino sem peça publicada").toEqual([]);
  });
});

describe("cada termo casa no texto", () => {
  it.each(TERMOS_COM_DESTINO.map((d) => d.termo))("%s casa com \\b…\\b", (termo) => {
    // A mesma montagem de `segmentarComLinks`. Termo com pontuação na ponta
    // passa silenciosamente pelo compilador e nunca vira link.
    const padrao = new RegExp(`\\b${termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    expect(padrao.test(termo), `"${termo}" não casa nem com ele mesmo`).toBe(true);
  });

  it("nenhum termo de guia é curto a ponto de virar link onde ninguém pediu", () => {
    // A régua do arquivo: o termo é a expressão da peça, não uma palavra
    // solta. "leilão" e "garantia" sozinhas linkariam meia vitrine.
    const curtos = DESTINOS_DE_GUIA.filter((d) => d.termo.length < 16);
    expect(curtos.map((d) => d.termo), "termo curto demais para ser âncora").toEqual([]);
  });

  it("todo termo de guia aparece no texto de alguma peça — termo que não casa é link morto", () => {
    const tudo = lote.guias.flatMap(textosDaPeca).join("\n");
    const mortos = DESTINOS_DE_GUIA.filter((d) => !new RegExp(`\\b${d.termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(tudo));
    expect(mortos.map((d) => d.termo), "termo que não aparece em peça nenhuma").toEqual([]);
  });
});

describe("a página do guia linka as vizinhas, e nunca ela mesma", () => {
  it.each(SLUGS)("%s", (slug) => {
    const peca = lote.guias.find((g) => g.slug === slug)!;
    const links = linksDaPagina(peca);
    expect(links, "a peça linkou para ela mesma").not.toContain(`/guias/${slug}`);
    expect(
      links.filter((h) => h.startsWith("/guias/")).length,
      `${slug} não linka para nenhuma outra peça`,
    ).toBeGreaterThan(0);
  });

  it("o conjunto rende os links medidos em 17/09 — 20 entre peças", () => {
    // Número medido, não estimado: se uma reescrita derrubar citações, este
    // teste mostra o tamanho da perda em vez de deixar passar em silêncio.
    const total = lote.guias.reduce(
      (soma, peca) => soma + linksDaPagina(peca).filter((h) => h.startsWith("/guias/")).length,
      0,
    );
    expect(total).toBeGreaterThanOrEqual(20);
  });

  it("o link comercial não foi expulso pelos novos", () => {
    // O limite é por DESTINO, não por página: a peça que fala de perícia
    // continua levando a `/garantia`.
    const comGarantia = lote.guias.filter((peca) => linksDaPagina(peca).includes("/garantia"));
    expect(comGarantia.length).toBe(lote.guias.length);
  });
});

/**
 * As duas superfícies que levam o site inteiro à peça pilar.
 *
 * Medido no sitemap de 17/09/2026: o bloco de perguntas frequentes é servido em
 * 107 hubs (20 de marca, 71 de modelo, 16 recortes), e o bloco do laudo, nas 70
 * fichas. Antes desta ponte, nenhuma das duas linkava para guia nenhum — a Onda
 * 1 ficava ilhada, com link só de `/guias` e do sitemap.
 *
 * O que estes testes prendem é a FIAÇÃO, que é onde isso se perde: a frase pode
 * continuar no texto e o componente parar de renderizá-la com link, e a página
 * fica igual na leitura e muda no que importa.
 */
describe("a ficha e o FAQ levam à peça pilar", () => {
  it("o bloco do laudo pendente sai com âncora para o guia", () => {
    const html = renderToStaticMarkup(createElement(BlocoLaudoPendente));
    expect(html).toContain('href="/guias/laudo-cautelar-carro-usado"');
  });

  it("o bloco do laudo APROVADO monta a mesma ponte", () => {
    // Fonte, e não render: a PDP inteira pede veículo, sessão e mais meia
    // dúzia de props. O que se mede aqui é que o componente está montado no
    // ramo do laudo aprovado — 33 das 44 fichas à venda em 17/09.
    const pdp = readFileSync(join(__dirname, "..", "src", "components", "PDPClientWrapper.tsx"), "utf8");
    expect(pdp, "a ficha aprovada parou de montar a ponte").toContain("<PonteDoGuiaDoLaudo");
  });

  it("a resposta comum do FAQ cita a peça, e a citação vira link", () => {
    const perguntas = perguntasDeCategoria("carros seminovos");
    const sobreLaudo = perguntas.find((p) => /laudo cautelar\?/i.test(p.pergunta));
    expect(sobreLaudo, "sumiu a pergunta sobre laudo cautelar").toBeDefined();
    expect(sobreLaudo!.resposta).toContain(TEXTO_PONTE_DO_GUIA);

    const destinos = segmentarComLinks(sobreLaudo!.resposta)
      .filter((s) => s.href)
      .map((s) => s.href);
    expect(destinos).toContain("/guias/laudo-cautelar-carro-usado");
    // E a resposta segue levando para a página comercial, que é o outro papel
    // dela: um link por destino, dois destinos.
    expect(destinos).toContain("/garantia");
  });

  it("a ponte não afirma resultado nem promete publicação", () => {
    // A mesma régua do bloco do laudo (`coerencia-da-pericia`): a frase aponta
    // para o texto que explica o exame, e não diz que o carro passou.
    expect(TEXTO_PONTE_DO_GUIA).not.toMatch(/aprovad[oa]s?\b|sem apontamento|livre de sinistro/i);
    expect(TEXTO_PONTE_DO_GUIA).not.toMatch(/na ficha|assim que/i);
  });
});
