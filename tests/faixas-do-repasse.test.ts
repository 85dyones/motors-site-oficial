import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CARD_DO_REPASSE,
  PORTAS_DO_REPASSE,
  abaixoDaFipeNaBarra,
  abertosHoje,
  verOsCarros,
} from "../src/lib/paginaDoRepasse";
import { emReais } from "../src/lib/repasse";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * As duas faixas das portas e o card simplificado (prancha "Portas de
 * entrada", seções 2 e 3; decisão 4 do plano do PR 4), renderizados, com
 * qualquer número de carros abertos (ordem do dono de 28/09, "faça aparecer
 * independente do número"). O HTML NÃO é normalizado com `\s+`: o `emReais`
 * usa espaço inseparável, que o `\s` do JavaScript também casa.
 */
// A regra (`portasDoRepasse`) importa a leitura do banco; aqui só se usa
// `faixaNaHome`, que não lê nada.
vi.mock("../src/lib/leituraDosRepasses", () => ({ lerRepassesPublicos: async () => [] }));
vi.mock("../src/lib/observabilidade", () => ({ registrarFalha: async () => {} }));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _fill, sizes: _sizes, priority: _priority, unoptimized: _uo, ...resto } = props;
    return createElement("img", resto as never);
  },
}));
vi.mock("next/link", () => ({
  // O card desenha `SinalDeAbertura`, que lê o estado do link.
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

const { default: FaixaDoRepasseNoEstoque } = await import("../src/components/repasse/FaixaDoRepasseNoEstoque");
const { default: FaixaDoRepasseNaHome } = await import("../src/components/repasse/FaixaDoRepasseNaHome");
const { faixaNaHome } = await import("../src/lib/portasDoRepasse");

const aberto = {
  situacao: "publicado" as const,
  lojistas_desde: "2026-09-20T12:00:00Z",
  aberto_ao_publico_em: "2026-09-24T12:00:00Z",
};
// O Kwid do ajudante: R$ 36.900 à vista, FIPE R$ 42.100, reparo de R$ 2.020 →
// R$ 3.180 abaixo da FIPE, o exemplo da prancha.
const COM_REPARO = repasseDeTeste({ ...aberto });
const COM_LAUDO = repasseDeTeste({
  ...aberto,
  id: "e1000000-0000-4000-8000-000000000001",
  slug: "fiat-argo-drive-1-0-2019-e10000",
  marca: "Fiat",
  modelo: "Argo",
  versao: "Drive 1.0",
  ano_modelo: 2019,
  preco: 52900,
  fipe_valor: 58400,
  itens_de_estado: [],
  sem_defeitos_conhecidos: true,
});
const SEM_LAUDO_SEM_FIPE = repasseDeTeste({
  ...aberto,
  id: "e2000000-0000-4000-8000-000000000002",
  slug: "toyota-corolla-xei-2012-e20000",
  marca: "Toyota",
  modelo: "Corolla",
  versao: "XEi 2.0",
  ano_modelo: 2012,
  preco: 44900,
  fipe_valor: null,
  laudo: "nao_feito",
  itens_de_estado: [],
  sem_defeitos_conhecidos: true,
});
const ACIMA_DA_FIPE = repasseDeTeste({
  ...aberto,
  id: "e3000000-0000-4000-8000-000000000003",
  slug: "vw-gol-1-0-2015-e30000",
  marca: "VW",
  modelo: "Gol",
  versao: "1.0",
  ano_modelo: 2015,
  preco: 50000,
  fipe_valor: 42100,
  itens_de_estado: [],
  sem_defeitos_conhecidos: true,
});

const html = (elemento: ReactElement) => renderToStaticMarkup(elemento);
/**
 * O HTML de cada card, na ordem: cada um mora num `<li>`. Corte em `"<li>"`
 * completo, não em `"<li"`: o React 19 hoisteia um `<link rel="preload"
 * as="image">` para a primeira ocorrência de cada foto (`ReactDOM.preload`
 * automático em SSR), e "<link" começa com o mesmo prefixo "<li" — cortar em
 * "<li" sozinho contaria esse `<link>` como se fosse mais um card.
 */
const cards = (h: string) => h.split("<li>").slice(1);

describe("a faixa do /estoque", () => {
  it("o texto da prancha, com a contagem dos abertos", () => {
    const h = html(createElement(FaixaDoRepasseNoEstoque, { faixa: { abertos: 4 } }));
    expect(h).toContain(PORTAS_DO_REPASSE.rotulo);
    expect(h).toContain(PORTAS_DO_REPASSE.estoque.titulo);
    expect(h).toContain(`${PORTAS_DO_REPASSE.estoque.texto} ${abertosHoje(4)}`);
  });

  it("o botão leva ao /repasse, e o singular aparece com um carro", () => {
    const h = html(createElement(FaixaDoRepasseNoEstoque, { faixa: { abertos: 1 } }));
    expect(h).toMatch(new RegExp(`<a[^>]*href="/repasse"[^>]*>${PORTAS_DO_REPASSE.estoque.botao}<svg`));
    expect(h).toContain(abertosHoje(1));
  });

  it("sem carro aberto, o mesmo texto sem a frase da contagem, e o botão continua", () => {
    const h = html(createElement(FaixaDoRepasseNoEstoque, { faixa: { abertos: 0 } }));
    expect(h).toContain(PORTAS_DO_REPASSE.rotulo);
    expect(h).toContain(PORTAS_DO_REPASSE.estoque.titulo);
    // O parágrafo termina no texto: sem espaço sobrando nem contagem emendada.
    expect(h).toContain(`${PORTAS_DO_REPASSE.estoque.texto}</p>`);
    expect(h).not.toMatch(/Hoje (são|há)/);
    expect(h).toMatch(new RegExp(`<a[^>]*href="/repasse"[^>]*>${PORTAS_DO_REPASSE.estoque.botao}<svg`));
  });
});

describe("a faixa da home", () => {
  const faixa = { carros: [COM_REPARO, COM_LAUDO, SEM_LAUDO_SEM_FIPE], totalNoLote: 6 };

  it("o texto da prancha e o CTA com o lote inteiro", () => {
    const h = html(createElement(FaixaDoRepasseNaHome, { faixa }));
    expect(h).toContain(PORTAS_DO_REPASSE.rotulo);
    expect(h).toContain(PORTAS_DO_REPASSE.home.titulo);
    expect(h).toContain(PORTAS_DO_REPASSE.home.texto);
    expect(h).toMatch(new RegExp(`<a[^>]*href="/repasse"[^>]*>${verOsCarros(6)}<`));
  });

  it("três cards, na ordem recebida, cada um um link para a ficha", () => {
    const lista = cards(html(createElement(FaixaDoRepasseNaHome, { faixa })));
    expect(lista).toHaveLength(3);
    faixa.carros.forEach((r, i) => expect(lista[i]).toContain(`href="/repasse/${r.slug}"`));
  });

  it("o card da prancha: etiqueta, carro e ano, preço e quanto fica abaixo da FIPE", () => {
    const [reparo, laudo, semLaudo] = cards(html(createElement(FaixaDoRepasseNaHome, { faixa })));
    expect(reparo).toContain("REPARO ORÇADO");
    expect(reparo).toContain(">Renault Kwid 2021<");
    expect(reparo).toContain(emReais(36900));
    expect(reparo).toContain(abaixoDaFipeNaBarra(emReais(3180)));
    expect(laudo).toContain("COM LAUDO");
    expect(laudo).toContain(">Fiat Argo 2019<");
    expect(laudo).toContain(abaixoDaFipeNaBarra(emReais(5500)));
    expect(semLaudo).toContain("SEM LAUDO");
  });

  // Pedido do dono em 29/09: o card das faixas nomeia o carro como a ficha e
  // o card do lote, na grafia da casa (`grafiaDoCarro`), e não em maiúsculas.
  it("cadastro em maiúsculas: o título sai na caixa normal, e sigla fica inteira", () => {
    const PALIO = { ...COM_REPARO, id: "f1000000-0000-4000-8000-000000000001", marca: "FIAT", modelo: "PALIO", versao: "1.0 ECONOMY FIRE FLEX 8V 4P", ano_modelo: 2010 };
    const HB20 = { ...COM_REPARO, id: "f2000000-0000-4000-8000-000000000002", marca: "HYUNDAI", modelo: "HB20", versao: "1.0 COMFORT PLUS", ano_modelo: 2019 };
    const [palio, hb20] = cards(html(createElement(FaixaDoRepasseNaHome, { faixa: { carros: [PALIO, HB20, COM_REPARO], totalNoLote: 3 } })));
    expect(palio).toContain(">Fiat Palio 2010<");
    expect(palio).not.toContain("PALIO");
    expect(hb20).toContain(">Hyundai HB20 2019<");
  });

  it("o título não leva a versão, como a prancha", () => {
    const [reparo, laudo] = cards(html(createElement(FaixaDoRepasseNaHome, { faixa })));
    expect(reparo).not.toContain("Zen 1.0");
    expect(laudo).not.toContain("Drive 1.0");
  });

  it("sem FIPE, ou acima dela, a linha da diferença some", () => {
    const [semFipe, acima] = cards(
      html(
        createElement(FaixaDoRepasseNaHome, {
          faixa: { carros: [SEM_LAUDO_SEM_FIPE, ACIMA_DA_FIPE, COM_REPARO], totalNoLote: 3 },
        }),
      ),
    );
    expect(semFipe).not.toContain("abaixo da FIPE");
    expect(acima).not.toContain("abaixo da FIPE");
  });

  it("sem WhatsApp e sem a conta inteira: isso fica no card do lote e na ficha", () => {
    const h = html(createElement(FaixaDoRepasseNaHome, { faixa }));
    expect(h).not.toContain("wa.me");
    expect(h).not.toContain(CARD_DO_REPASSE.quero);
    expect(h).not.toContain(CARD_DO_REPASSE.verFicha);
  });

  describe("com qualquer número de carros abertos", () => {
    const SEM_CARRO = { carros: [], totalNoLote: 0 };

    it("sem carro nenhum: o texto e o CTA do estoque, e nenhuma grade, nem vazia nem com marcador", () => {
      const h = html(createElement(FaixaDoRepasseNaHome, { faixa: SEM_CARRO }));
      expect(h).toContain(PORTAS_DO_REPASSE.rotulo);
      expect(h).toContain(PORTAS_DO_REPASSE.home.titulo);
      expect(h).toContain(PORTAS_DO_REPASSE.home.texto);
      expect(h).toMatch(new RegExp(`<a[^>]*href="/repasse"[^>]*>${PORTAS_DO_REPASSE.estoque.botao}<`));
      expect(h).not.toContain("<ul");
      expect(h).not.toContain("<li>");
      expect(h).not.toContain("VER OS ");
      expect(h).not.toContain("VER O CARRO");
    });

    it("sem carro aberto mas com lote (só-lojistas, reservado): o CTA continua o do estoque, não o do lote", () => {
      // 2 no lote, 0 abertos: "VER OS 2 CARROS" levaria a um lote que a faixa não mostra.
      const h = html(createElement(FaixaDoRepasseNaHome, { faixa: { carros: [], totalNoLote: 2 } }));
      expect(h).toMatch(new RegExp(`<a[^>]*href="/repasse"[^>]*>${PORTAS_DO_REPASSE.estoque.botao}<`));
      expect(h).not.toContain(verOsCarros(2));
      expect(h).not.toContain("<ul");
    });

    it("um carro: só ele, o CTA no singular, e texto e carro dividem a faixa ao meio (revisão de UI de 29/09)", () => {
      const h = html(createElement(FaixaDoRepasseNaHome, { faixa: { carros: [COM_REPARO], totalNoLote: 1 } }));
      const lista = cards(h);
      expect(lista).toHaveLength(1);
      expect(lista[0]).toContain(`href="/repasse/${COM_REPARO.slug}"`);
      expect(h).toMatch(new RegExp(`<a[^>]*href="/repasse"[^>]*>${verOsCarros(1)}<`));
      // Era três colunas com um card só: sobravam dois terços em branco.
      expect(h).not.toMatch(/<ul[^>]*grid-cols-3/);
      expect(h).toMatch(/<div[^>]*lg:grid-cols-2/);
    });

    it("dois carros: só os dois, na ordem, com o lote inteiro no CTA e a grade de duas colunas", () => {
      const h = html(
        createElement(FaixaDoRepasseNaHome, { faixa: { carros: [COM_REPARO, COM_LAUDO], totalNoLote: 5 } }),
      );
      const lista = cards(h);
      expect(lista).toHaveLength(2);
      expect(lista[0]).toContain(`href="/repasse/${COM_REPARO.slug}"`);
      expect(lista[1]).toContain(`href="/repasse/${COM_LAUDO.slug}"`);
      expect(h).toMatch(new RegExp(`<a[^>]*href="/repasse"[^>]*>${verOsCarros(5)}<`));
      expect(h).toMatch(/<ul[^>]*sm:grid-cols-2/);
    });

    it("quatro abertos, pela regra: a faixa renderiza três cards, os três mais recentes", () => {
      const abertos = [1, 2, 3, 4].map((n) =>
        repasseDeTeste({
          ...aberto,
          id: `f${n}000000-0000-4000-8000-00000000000${n}`,
          slug: `aberto-${n}-f${n}0000`,
          aberto_ao_publico_em: `2026-09-2${5 - n}T12:00:00Z`,
        }),
      );
      const faixaDaRegra = faixaNaHome(abertos, new Date("2026-09-25T15:00:00Z"));
      const lista = cards(html(createElement(FaixaDoRepasseNaHome, { faixa: faixaDaRegra })));
      expect(lista).toHaveLength(3);
      [abertos[0], abertos[1], abertos[2]].forEach((r, i) => expect(lista[i]).toContain(`href="/repasse/${r.slug}"`));
    });
  });
});
