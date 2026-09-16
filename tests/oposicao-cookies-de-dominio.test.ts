// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.motorsstore.com.br/"}
import { describe, it, expect, afterEach } from "vitest";
import { descartarCookiesDeAnuncio, getMatchParamsRespeitandoRecusa } from "../src/lib/telemetry";
import { getMatchParams } from "../src/lib/tracking-identity";

/**
 * A oposição apaga os cookies de anúncio de verdade — inclusive a cópia que o
 * Meta Pixel grava com `domain=`.
 *
 * ---------------------------------------------------------------------------
 * O defeito
 * ---------------------------------------------------------------------------
 * Até 16/09/2026 o botão "Desligar o rastreamento neste navegador" apagava os
 * dois cookies com `document.cookie = "_fbc=; path=/; max-age=0"`. Cookie é
 * identificado por nome, domínio e caminho, e essa escrita só alcança a cópia
 * de HOST. O `fbevents.js` do Meta grava o `_fbp`, e às vezes o `_fbc`, com
 * `;domain=.<domínio registrável>` — e essa cópia ficava até 90 dias no
 * navegador, contra a /privacidade, que promete apagar "na hora".
 *
 * ---------------------------------------------------------------------------
 * Por que jsdom, e por que ESTA url
 * ---------------------------------------------------------------------------
 * Só um cookie de verdade separa as duas cópias, e o jsdom guarda cookie com as
 * regras de domínio (pelo `tough-cookie`). A url do ambiente, declarada na
 * segunda linha deste arquivo, decide se o teste mede alguma coisa. Medido em
 * 16/09/2026 com o jsdom 30.0.1 do lockfile, antes de escrever as travas:
 *
 *   · na url padrão do vitest, `http://localhost:3000`, o `domain=` é recusado
 *     em silêncio. O cookie de domínio nem nasce, e uma trava de "apagou"
 *     passaria sem ter o que apagar;
 *   · na raiz, `https://motorsstore.com.br/`, o `tough-cookie` guarda a cópia
 *     de host e a de domínio NO MESMO lugar — a chave dele é nome, domínio e
 *     caminho, sem distinguir as duas. A escrita sem `domain=` apaga ali a
 *     cópia do Pixel, e o controle (a) reprova. Chrome e Firefox mantêm as
 *     duas cópias separadas também na raiz, que é onde o site roda; é por isso
 *     que o defeito existia em produção e o jsdom não o mostra naquela url;
 *   · em `https://www.motorsstore.com.br/`, as duas cópias moram em lugares
 *     diferentes, como nos navegadores. É a url em que o ambiente reproduz o
 *     defeito, e o controle (a) prova que reproduz.
 *
 * Em produção, na raiz, a função escreve sem `domain=` e com
 * `domain=motorsstore.com.br` — a segunda é a que alcança a cópia do Pixel. O
 * que este arquivo prova é o mesmo mecanismo, num host em que o ambiente
 * consegue separar as duas cópias.
 */

/** Os valores de um cookie. Pode haver mais de um: uma cópia por domínio. */
function valores(nome: string): string[] {
  return document.cookie
    .split("; ")
    .filter((par) => par.startsWith(`${nome}=`))
    .map((par) => par.slice(nome.length + 1));
}

/**
 * A limpeza entre os testes é escrita à mão, e não com a função testada: se a
 * função quebrar, a limpeza não pode quebrar junto e deixar cookie para o teste
 * seguinte achar.
 */
afterEach(() => {
  for (const nome of ["_fbp", "_fbc", "preferencia"]) {
    for (const dominio of ["", "; domain=www.motorsstore.com.br", "; domain=motorsstore.com.br"]) {
      document.cookie = `${nome}=; path=/; max-age=0${dominio}`;
    }
  }
  localStorage.clear();
  history.replaceState(null, "", "/");
});

describe("o ambiente reproduz o defeito — sem isto, nada abaixo mede", () => {
  it("controle: a página está num subdomínio de motorsstore.com.br", () => {
    // Se a linha da url sumir do topo, o ambiente volta ao localhost e o
    // `domain=motorsstore.com.br` passa a ser recusado. Melhor reprovar aqui,
    // com o motivo escrito, do que ver (b) passar por não ter o que apagar.
    expect(location.hostname).toBe("www.motorsstore.com.br");
  });

  it("(a) o cookie gravado com `domain=` SOBREVIVE à escrita sem domínio que o botão fazia", () => {
    document.cookie = "_fbp=fb.1.1700000000000.PIXEL; domain=motorsstore.com.br; path=/; max-age=7776000";
    // O ambiente aceitou o `domain=`. Sem isto, a asserção final passaria vazia.
    expect(valores("_fbp")).toEqual(["fb.1.1700000000000.PIXEL"]);

    // A escrita que `ControleDeRastreamento` fazia até 16/09/2026.
    document.cookie = "_fbp=; path=/; max-age=0";

    expect(valores("_fbp"), "o ambiente não separa a cópia de host da de domínio").toEqual([
      "fb.1.1700000000000.PIXEL",
    ]);
  });
});

describe("(b) descartarCookiesDeAnuncio apaga as duas cópias", () => {
  it("de `_fbp` e de `_fbc`, e não mexe no resto", () => {
    // O navegador de quem chegou por anúncio: o tracker grava o `_fbc` de host
    // e o Pixel grava as cópias de domínio.
    document.cookie = "_fbp=HOST; path=/";
    document.cookie = "_fbp=PIXEL; domain=motorsstore.com.br; path=/";
    document.cookie = "_fbc=HOST; path=/";
    document.cookie = "_fbc=PIXEL; domain=motorsstore.com.br; path=/";
    document.cookie = "preferencia=fica; path=/";

    // Controle: as quatro cópias existem ao mesmo tempo.
    expect(valores("_fbp").sort()).toEqual(["HOST", "PIXEL"]);
    expect(valores("_fbc").sort()).toEqual(["HOST", "PIXEL"]);

    descartarCookiesDeAnuncio();

    expect(valores("_fbp"), "sobrou cópia do _fbp").toEqual([]);
    expect(valores("_fbc"), "sobrou cópia do _fbc").toEqual([]);
    // Não é um "apaga tudo": cookie que não é de anúncio fica.
    expect(valores("preferencia")).toEqual(["fica"]);
  });
});

/**
 * O outro lado da mesma promessa: o que sai do navegador junto do lead.
 *
 * Apagar o cookie no clique não basta, porque o `fbc` também nasce do `fbclid`
 * da URL, e um Pixel já carregado na aba pode regravar o `_fbp` depois. A
 * régua é a recusa gravada, e não a existência do cookie.
 */
describe("(c) getMatchParamsRespeitandoRecusa", () => {
  function cookiesDoMeta() {
    document.cookie = "_fbp=fb.1.1700000000000.111; path=/";
    document.cookie = "_fbc=fb.1.1700000000000.CLIQUE; path=/";
  }

  it("sem preferência gravada, devolve o que getMatchParams devolve hoje", () => {
    // O caso de quase todo visitante: ninguém responde nada.
    cookiesDoMeta();
    expect(getMatchParamsRespeitandoRecusa()).toEqual({
      fbp: "fb.1.1700000000000.111",
      fbc: "fb.1.1700000000000.CLIQUE",
    });
    expect(getMatchParamsRespeitandoRecusa()).toEqual(getMatchParams());
  });

  it("com uma preferência que não é a recusa, também", () => {
    cookiesDoMeta();
    localStorage.setItem("ag_cookie_consent", "accepted");
    expect(getMatchParamsRespeitandoRecusa()).toEqual({
      fbp: "fb.1.1700000000000.111",
      fbc: "fb.1.1700000000000.CLIQUE",
    });
  });

  it('com `ag_cookie_consent = "rejected"`, fbp e fbc saem nulos', () => {
    cookiesDoMeta();
    localStorage.setItem("ag_cookie_consent", "rejected");
    // Controle: os cookies continuam lá. O nulo vem da recusa, e não da falta
    // de cookie para ler.
    expect(getMatchParams()).toEqual({
      fbp: "fb.1.1700000000000.111",
      fbc: "fb.1.1700000000000.CLIQUE",
    });
    expect(getMatchParamsRespeitandoRecusa()).toEqual({ fbp: null, fbc: null });
  });

  it("com a recusa, nem o fbc remontado do `fbclid` da url escapa", () => {
    // Sem cookie `_fbc`, `getMatchParams` monta o valor a partir da URL.
    history.replaceState(null, "", "/?fbclid=DO_ANUNCIO");
    localStorage.setItem("ag_cookie_consent", "rejected");
    expect(getMatchParams().fbc, "controle: a url entrega um fbc").toMatch(/^fb\.1\.\d+\.DO_ANUNCIO$/);
    expect(getMatchParamsRespeitandoRecusa().fbc).toBeNull();
  });
});
