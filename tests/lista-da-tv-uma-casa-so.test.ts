import { describe, it, expect } from "vitest";
import { idsDaTvComHeranca, voltaCompletaEmSegundos } from "../src/lib/destaquesDoPainel";
import { INTERVALO_MS } from "../src/lib/ritmoDaVitrine";
import { lerCodigo } from "./fonte";

/**
 * A TV do showroom tem UMA casa para a lista que mostra e UMA casa para o ritmo
 * em que troca de carro. Este arquivo tranca as duas.
 *
 * ---------------------------------------------------------------------------
 * O defeito que pagou por ele (22/09/2026)
 * ---------------------------------------------------------------------------
 * A herança de `carousel_vehicles` para a TV estava escrita em `/vitrine` e só
 * lá. O painel lia `settings.vitrineTv` cru: mostrava a seção da TV VAZIA,
 * afirmava em texto que a TV estava paginando o estoque — e a TV estava
 * mostrando 4 carros curados. Bastava o dono mexer no banner e publicar: o POST
 * levava `vitrineTv: []`, a linha nascia vazia, e na revalidação seguinte a TV
 * trocava os 4 curados pelos 6 primeiros do estoque. Sem erro, sem aviso, sem
 * ninguém ter pedido.
 *
 * Testar só a função não teria pego isso: a função de `/vitrine` estava certa.
 * O que estava errado era haver TRÊS leituras e só uma delas herdar. Por isso o
 * último bloco daqui é de COSTURA e lê os arquivos-fonte.
 */
describe("idsDaTvComHeranca — a régua da herança", () => {
  it("sem a linha `vitrine_tv`, herda os ids do banner", () => {
    // O estado real de produção medido em 21/09: 9 ids em `carousel_vehicles`,
    // nenhuma linha `vitrine_tv`. É o que mantém a TV no ar hoje.
    expect(idsDaTvComHeranca({ carouselVehicleIds: ["a", "b", "c"] })).toEqual(["a", "b", "c"]);
  });

  it("com a linha própria VAZIA, devolve vazio — não herda", () => {
    // Lista própria vazia é decisão deliberada do operador ("a TV volta a
    // paginar o estoque"). Herdar por cima dela desfaria a decisão na cara de
    // quem a tomou. Esta é a asserção que separa "linha ausente" de "linha
    // vazia" — as duas são falsy num `if`, e é por isso que a régua é
    // `Array.isArray` e não truthiness.
    expect(idsDaTvComHeranca({ vitrineTv: [], carouselVehicleIds: ["a", "b"] })).toEqual([]);
  });

  it("com a linha própria preenchida, a dela manda", () => {
    expect(idsDaTvComHeranca({ vitrineTv: ["x"], carouselVehicleIds: ["a", "b"] })).toEqual(["x"]);
  });

  it("sem nenhuma das duas, devolve vazio em vez de estourar", () => {
    expect(idsDaTvComHeranca({})).toEqual([]);
  });

  it("normaliza para string — o id do banco chega número", () => {
    expect(idsDaTvComHeranca({ carouselVehicleIds: [7, 8] })).toEqual(["7", "8"]);
  });
});

/**
 * Os TRÊS consumidores da lista da TV, e a prova de que chamam a mesma função.
 *
 * `settings.vitrineTv` é proibido nestes arquivos: não existe motivo legítimo
 * para um consumidor tocar no campo cru — a única pergunta que ele faz é "o que
 * a TV mostra?", e a resposta tem dono. `carouselVehicleIds` continua liberado
 * nos dois arquivos do painel, porque lá ele responde outra pergunta (a lista
 * do banner da home) — o que se proíbe é usá-lo para montar a lista da TV, e é
 * exatamente isso que a ausência de `vitrineTv` ao lado dele garante.
 */
describe("os três consumidores usam a mesma casa", () => {
  const consumidores = [
    "src/app/vitrine/page.tsx",
    "src/app/admin/site/destaques/page.tsx",
    "src/app/admin/estoque/page.tsx",
  ];

  for (const caminho of consumidores) {
    it(`${caminho} chama idsDaTvComHeranca`, () => {
      expect(lerCodigo(caminho)).toMatch(/idsDaTvComHeranca\(/);
    });

    it(`${caminho} não lê o campo cru da TV`, () => {
      expect(lerCodigo(caminho)).not.toMatch(/settings\.vitrineTv/);
    });
  }

  it("a TV do site não conhece mais o campo do banner", () => {
    // `/vitrine` não tem banner: qualquer menção a `carouselVehicleIds` aqui só
    // pode ser a herança reescrita na mão — o defeito voltando.
    expect(lerCodigo("src/app/vitrine/page.tsx")).not.toMatch(/carouselVehicleIds/);
  });
});

/**
 * O ritmo da TV, derivado e não redigitado.
 *
 * O `8` vivia em dois arquivos, com um comentário admitindo o espelho. Subir
 * `INTERVALO_MS` para 10000 a pedido do dono deixaria a tela de curadoria
 * anunciando "volta completa: 48 segundos" para uma volta real de 60 — com a
 * suíte verde, porque nada ligava os dois números. Estas asserções são escritas
 * CONTRA `INTERVALO_MS`, e não contra o 8: trocar o intervalo move as duas
 * pontas junto, e re-redigitar o 8 aqui do lado quebra na hora.
 */
describe("a volta completa deriva do intervalo da TV", () => {
  it("um carro custa exatamente um INTERVALO_MS", () => {
    expect(voltaCompletaEmSegundos(1)).toBe(INTERVALO_MS / 1000);
  });

  it("seis carros custam seis intervalos", () => {
    expect(voltaCompletaEmSegundos(6)).toBe((INTERVALO_MS / 1000) * 6);
  });

  it("o módulo do painel importa a constante em vez de repetir o número", () => {
    const lib = lerCodigo("src/lib/destaquesDoPainel.ts");
    // A ORIGEM entrou na régua em 22/09, e não por capricho: a primeira versão
    // importava do componente da TV, que é `"use client"`. O Vitest resolve
    // módulo ES puro e devolvia 8000 aqui, verde; em componente de servidor —
    // e `src/app/page.tsx` importa este módulo — o que chega é a referência do
    // bundler, e a volta viraria `NaN`. Ver `fronteira-servidor-cliente`.
    expect(lib).toMatch(/import \{ INTERVALO_MS \} from "\.\/ritmoDaVitrine"/);
    // Um literal aqui seria o espelho de volta.
    expect(lib).not.toMatch(/SEGUNDOS_POR_CARRO_NA_TV = \d/);
  });

  it("a constante mora no módulo neutro", () => {
    expect(lerCodigo("src/lib/ritmoDaVitrine.ts")).toMatch(/export const INTERVALO_MS/);
  });

  it("o componente da TV não declara nenhum dos dois de novo", () => {
    // Redeclarar aqui não seria só duplicar: seria duplicar COM fronteira no
    // meio. O componente passaria a valer para quem é cliente e o módulo
    // neutro para quem é servidor, e as duas telas divergiriam sem que
    // nenhuma delas estivesse "errada" o bastante para estourar.
    expect(lerCodigo("src/components/modernist/VitrineTV.tsx")).not.toMatch(
      /const (INTERVALO_MS|POR_PAGINA) =/,
    );
  });
});
