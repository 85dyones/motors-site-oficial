import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Veiculo } from "../src/types";

/**
 * A ficha que não existe deixa de ser beco — e deixa de ser em inglês.
 *
 * ---------------------------------------------------------------------------
 * O defeito, verificado em produção em 2026-09-11
 * ---------------------------------------------------------------------------
 *     curl -s https://motorsstore.com.br/carros/volkswagen/nivus/…-999999999
 *     → HTTP 404
 *     → "404: This page could not be found"   ← corpo nativo do Next
 *
 * O `<body>` era o 404 de fábrica, em system-ui e em inglês, emoldurado pelo
 * cabeçalho e pelo rodapé da marca. Não havia `not-found.tsx` em lugar nenhum
 * do repositório — conferido em TODOS os branches, não só no `main`.
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo trava
 * ---------------------------------------------------------------------------
 * 1. **Sai em português**, e sem pressupor que a loja teve o carro.
 * 2. **Tem saída** (R5 — *dead-end é bug*), e cada saída é cobrada separada:
 *    a primeira versão deste teste ficava verde com o botão do catálogo
 *    apagado, porque a trilha sozinha satisfazia a asserção.
 * 3. **A grade tem teto E ordem.** A ordem é metade do requisito: `getEstoque`
 *    devolve por `preco desc`, então `slice` cru abria a 404 com os seis carros
 *    mais caros do pátio.
 * 4. **A saída personalizada não promete o que a página desmente.**
 *
 * ---------------------------------------------------------------------------
 * ⚠️ O que o item 4 NÃO prova
 * ---------------------------------------------------------------------------
 * Aqui `usePathname` é dublado, então a árvore inteira renderiza em memória.
 * No build de produção esse bloco **não sai no HTML da primeira resposta**:
 * `usePathname` numa rota prerenderizada faz o Next adiar a subárvore para o
 * cliente. Conferido com `next build` + `curl` em 2026-09-11 — sem `<form>` no
 * HTML, com formulário na tela depois da hidratação.
 *
 * Então o item 4 mede FIAÇÃO, não HTML servido. Quem garante que a página tem
 * saída sem JavaScript são os itens 1 a 3, e esses o servidor entrega — a nota
 * longa está em `components/EncomendaDaFichaPerdida.tsx`.
 */

const caminho = vi.hoisted(() => ({ atual: "/carros/volkswagen/modelo3/vw-modelo3-999999999" }));

/**
 * Nove no pátio, com as três ordens candidatas em oposição de propósito:
 * `Modelo1` é o mais CARO e o mais ANTIGO, `Modelo9` o mais barato e o mais
 * recente. Assim nenhuma delas pode ser confundida com a outra por acaso:
 *
 *   · preço desc (o que `getEstoque` devolve) → Modelo1…Modelo6
 *   · chegada (a correção que o dado derrubou) → Modelo9…Modelo4
 *   · amostra por preço (a que ficou)         → 9, 7, 6, 4, 3, 1
 *
 * `first_seen_at` fica na fixture justamente porque ninguém deve lê-lo: é ele
 * que faz `Modelo8` denunciar uma volta à ordem por chegada.
 */
const carro = (n: number): Veiculo =>
  ({
    id: `${100 + n}`,
    marca: "Volkswagen",
    modelo: `Modelo${n}`,
    versao: "",
    ano: 2022,
    quilometragem: 40000,
    cambio: "Automático",
    combustivel: "Flex",
    cor: "Prata",
    fipe: "",
    tipo: "SUV",
    preco_original: 300000 - n * 10000,
    preco_promocional: 0,
    first_seen_at: `2026-0${n}-01T00:00:00Z`,
    pericia: "",
    opcionais: "",
    laudo_pericia: "",
    whatsapp_images: [],
    web_full_images: [],
  }) as unknown as Veiculo;

/**
 * Duas motos, e elas não são enfeite.
 *
 * Sem marca de moto COM estoque, três defeitos ficam verdes ao mesmo tempo: o
 * link do hub pode montar `/carros/honda/adv`, o plural da âncora nunca roda, e
 * apagar `hubsDeMarca(…, "motos")` da rota não quebra nada. É a mesma doença
 * que a guarda de segmento já teve — teste com nome de moto que não chega no
 * ramo de moto.
 *
 * São as mais baratas do pátio, e as mais antigas, para não desarrumar o que as
 * outras asserções medem.
 */
const moto = (modelo: string, preco: number): Veiculo =>
  ({
    ...carro(1),
    id: `m-${modelo}`,
    marca: "Honda",
    modelo,
    tipo: "Motocicleta",
    preco_original: preco,
    first_seen_at: "2026-01-01T00:00:00Z",
  }) as unknown as Veiculo;

const DISPONIVEIS = [
  ...Array.from({ length: 9 }, (_, i) => carro(i + 1)),
  moto("ADV", 30000),
  moto("CG 160", 40000),
];

/** Já teve, não tem: é ela que torna verdadeira a frase "avisamos quando entrar". */
const PICANTO = {
  ...carro(1),
  id: "900",
  marca: "Kia",
  modelo: "Picanto",
  tipo: "Hatch",
} as unknown as Veiculo;

vi.mock("../src/lib/hubsDeEstoque", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  recortesDoEstoque: async () => ({
    historico: [...DISPONIVEIS, PICANTO],
    disponiveis: DISPONIVEIS,
  }),
}));

/* O caminho é a única entrada de contexto que a `not-found.tsx` tem — ela não
   recebe `params`. Aqui ele é fixado por caso; quem o lê de verdade é
   `usePathname`. */
vi.mock("next/navigation", () => ({ usePathname: () => caminho.atual }));

/* Dublê que ECOA as props em vez de sumir com elas: o que está sob teste é a
   fiação — se o formulário recebe a marca e o modelo lidos do caminho. Dublê
   que renderiza `null` deixaria a fiação sem ninguém olhando. */
vi.mock("../src/components/EncomendaDeCarro", () => ({
  default: ({
    marca,
    modelo,
    caminho: onde,
  }: {
    marca: string;
    modelo?: string | null;
    caminho: string;
  }) =>
    createElement(
      "form",
      {
        "data-encomenda": "1",
        "data-marca": marca,
        "data-modelo": modelo ?? "",
        "data-caminho": onde,
      },
      "Encomende seu carro",
    ),
}));

async function paginaRenderizada(): Promise<string> {
  const { default: FichaNaoEncontrada } = await import(
    "../src/app/[categoria]/[marca]/[modelo]/[ficha]/not-found"
  );
  return renderToStaticMarkup(await FichaNaoEncontrada());
}

/**
 * As fichas linkadas na página — é o card, e só o card, que linka para uma.
 *
 * Casa os DOIS segmentos: contar só `/carros/` deixaria de fora as motos da
 * grade e o teto passaria a medir menos do que a tela mostra.
 */
function fichasLinkadas(html: string): string[] {
  return [...html.matchAll(/href="\/(?:carros|motos)\/[^/"]+\/([^/"]+)\/[^"]+"/g)].map(
    (m) => m[1]!,
  );
}

beforeEach(() => {
  caminho.atual = "/carros/volkswagen/modelo3/vw-modelo3-999999999";
});

describe("a ficha que não existe", () => {
  it("não serve o 404 nativo do Next", async () => {
    const html = await paginaRenderizada();

    expect(html).not.toContain("This page could not be found");
    expect(html).toContain("Não encontramos este veículo");
  });

  /**
   * A SENTENÇA INTEIRA, e não a primeira metade.
   *
   * A primeira versão desta trava ancorava só "Este endereço não abre nenhuma
   * ficha do nosso estoque" — e a metade seguinte, sem teste, passou a
   * prometer "o que entrou por último no pátio" enquanto a grade logo abaixo
   * mostrava uma amostra por preço. A frase falsa flutuou entre duas revisões
   * porque a asserção parava antes dela.
   */
  it("não afirma venda, posse, nem ordem que a grade não tem", async () => {
    const html = await paginaRenderizada();

    expect(html).toContain(
      "Este endereço não abre nenhuma ficha do nosso estoque — costuma ser link antigo ou endereço incompleto. Abaixo, uma amostra do pátio de hoje e as trilhas para o resto dele.",
    );
    expect(html).not.toMatch(/vendid|saiu da vitrine|não está mais no estoque|entrou por último/i);
  });

  it("dá saída pelo catálogo — e ela não pode ser a trilha (R5)", async () => {
    const html = await paginaRenderizada();
    const semTrilha = html.slice(html.indexOf("Este endereço não abre"));

    expect(semTrilha).toContain('href="/estoque"');
  });

  it("dá saída pela trilha, além do catálogo", async () => {
    const html = await paginaRenderizada();
    const trilha = html.slice(0, html.indexOf("Este endereço não abre"));

    expect(trilha).toContain('href="/estoque"');
  });

  it("oferece os recortes do estoque, com âncora que descreve o destino (R7)", async () => {
    const html = await paginaRenderizada();

    expect(html).toContain("Por faixa de preço");
    expect(html).toContain("Por carroceria");
    expect(html).toContain('href="/estoque/ate-60-mil"');
    expect(html).toContain("até R$ 60 mil");
  });

  it("mostra o pátio sem virar um segundo /estoque", async () => {
    expect(new Set(fichasLinkadas(await paginaRenderizada())).size).toBeLessThanOrEqual(6);
  });

  it("amostra o pátio de ponta a ponta, e não o topo do preço", async () => {
    const html = await paginaRenderizada();
    const fichas = fichasLinkadas(html);

    expect(html).toContain("Do pátio de hoje, em todas as faixas");
    // As duas pontas entram: `Modelo9` é o mais barato, `Modelo1` o mais caro.
    expect(fichas).toContain("modelo9");
    expect(fichas).toContain("modelo1");
    /* `Modelo2` separa amostra de TOPO: o `slice(0, 6)` sobre a ordem de
       `getEstoque` (preço desc) devolveria `Modelo1`…`Modelo6`, com o 2. */
    expect(fichas).not.toContain("modelo2");
    /* `Modelo8` separa amostra de CHEGADA: ordenar por `first_seen_at` desc
       devolveria `Modelo9`…`Modelo4`, com o 8 logo em segundo. */
    expect(fichas).not.toContain("modelo8");
  });
});

describe("a saída personalizada, lida do caminho", () => {
  it("com carro no hub, manda para o hub e não promete avisar", async () => {
    const html = await paginaRenderizada();

    expect(html).toContain('href="/carros/volkswagen/modelo3"');
    expect(html).toContain("Ver Volkswagen Modelo3 no estoque");
    expect(html).toContain('data-marca=""');
    expect(html).toContain('data-modelo=""');
  });

  it("com o hub zerado, o formulário recebe marca e modelo", async () => {
    caminho.atual = "/carros/kia/picanto/kia-picanto-ex3-999999999";
    const html = await paginaRenderizada();

    expect(html).toContain('data-marca="Kia"');
    expect(html).toContain('data-modelo="Picanto"');
    expect(html).not.toContain("no estoque</a>");
  });

  it("grava no lead o endereço morto que a pessoa abriu, não o hub", async () => {
    caminho.atual = "/carros/kia/picanto/kia-picanto-ex3-999999999";

    expect(await paginaRenderizada()).toContain(
      'data-caminho="/carros/kia/picanto/kia-picanto-ex3-999999999"',
    );
  });

  it("caminho torto não vira marca inventada, e a página segue com saída", async () => {
    caminho.atual = "/carros/foo/bar/algo-1";
    const html = await paginaRenderizada();

    expect(html).toContain('data-marca=""');
    expect(html).not.toContain("Foo");
    expect(html).toContain('href="/estoque"');
  });

  it("caminho de moto é atendido pelo mesmo boundary", async () => {
    caminho.atual = "/motos/honda/cg-160/honda-cg-160-999999999";
    const html = await paginaRenderizada();

    expect(html).toContain('data-encomenda="1"');
    expect(html).toContain("Não encontramos este veículo");
  });

  /**
   * O link de moto aponta para `/motos/…`, e não para `/carros/…`.
   *
   * Parece óbvio e não é: `caminhoDaMarca` monta com `segmento`, e trocar por
   * um `"carros"` fixo não quebra nenhum teste de carro. O índice de motos
   * também só existe na rota porque alguém o passa — apagar essa metade
   * deixaria a página inteira verde.
   */
  it("o hub de moto com carro leva para o segmento de moto", async () => {
    caminho.atual = "/motos/honda/adv/honda-adv-999999999";
    const html = await paginaRenderizada();

    expect(html).toContain('href="/motos/honda/adv"');
    expect(html).toContain("Ver Honda ADV no estoque");
    expect(html).not.toContain('href="/carros/honda/adv"');
  });

  it("a âncora conta no plural quando o hub tem mais de um", async () => {
    caminho.atual = "/motos/honda/modelo-que-nao-existe/x-999999999";
    const html = await paginaRenderizada();

    // Sem artigo: "os 2 Honda" erraria o gênero no segmento de moto.
    expect(html).toContain("Ver 2 Honda no estoque");
    expect(html).toContain('href="/motos/honda"');
  });
});
