import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MolduraDoSite, { AvisoLegalDoSite } from "../src/components/MolduraDoSite";
import {
  CAMPANHAS,
  campanhaPorSlug,
  campanhaEstaViva,
  campanhasVivas,
  campanhaAcabou,
  caminhoDaCampanha,
  ehRotaDeCampanha,
  type Campanha,
} from "../src/lib/campanhas";
import { lerCodigo } from "./fonte";

function campanha(parcial: Partial<Campanha> = {}): Campanha {
  return {
    slug: "teste-2026",
    nome: "Teste",
    inicio: "2026-09-12",
    fim: "2026-09-20",
    destinoAposFim: "/estoque",
    descricao: "Uma campanha de teste.",
    fraseDoCliente: "Olá, vi sobre o Teste e quero saber as condições",
    ...parcial,
  };
}

describe("a vigência respeita o fuso de Curitiba", () => {
  /*
   * `new Date("2026-09-20")` é MEIA-NOITE UTC — 21h do dia 19 em Curitiba.
   * Comparar assim mataria a campanha 27 horas antes da hora, no meio do
   * último dia de feirão. O último dia é inclusive, e termina 23:59:59 em -03.
   */
  it("está viva na manhã do primeiro dia", () => {
    expect(campanhaEstaViva(campanha(), new Date("2026-09-12T09:00:00-03:00"))).toBe(true);
  });

  it("está viva às 23h do ÚLTIMO dia", () => {
    expect(campanhaEstaViva(campanha(), new Date("2026-09-20T23:00:00-03:00"))).toBe(true);
  });

  it("morreu na madrugada seguinte ao último dia", () => {
    expect(campanhaEstaViva(campanha(), new Date("2026-09-21T00:30:00-03:00"))).toBe(false);
  });

  it("ainda não vive na véspera", () => {
    expect(campanhaEstaViva(campanha(), new Date("2026-09-11T23:00:00-03:00"))).toBe(false);
  });
});

describe("antes do início NÃO é a mesma coisa que depois do fim", () => {
  /*
   * O defeito que motivou `campanhaAcabou`, pego no navegador em 08/09: a
   * página usava `!campanhaEstaViva` e respondia 308 PERMANENTE também antes
   * do início. 308 o navegador guarda para sempre — quem abrisse o link na
   * véspera ficaria com o redirect gravado e não veria a LP nem durante o
   * feirão. A função estava certa; o uso é que estava errado.
   */
  it("não acabou na véspera, ainda que também não esteja viva", () => {
    const vespera = new Date("2026-09-11T10:00:00-03:00");
    expect(campanhaEstaViva(campanha(), vespera)).toBe(false);
    expect(campanhaAcabou(campanha(), vespera)).toBe(false);
  });

  it("não acabou às 23h do último dia", () => {
    expect(campanhaAcabou(campanha(), new Date("2026-09-20T23:00:00-03:00"))).toBe(false);
  });

  it("acabou na madrugada seguinte", () => {
    expect(campanhaAcabou(campanha(), new Date("2026-09-21T00:30:00-03:00"))).toBe(true);
  });

  it("a página só chama permanentRedirect no caso de ter ACABADO", () => {
    const pagina = lerCodigo("src/app/(campanha)/pole-position-2026/page.tsx");
    expect(pagina).toMatch(/campanhaAcabou\(/);
    expect(pagina).not.toMatch(/!campanhaEstaViva/);
  });
});

describe("o caminho e a resolução", () => {
  it("o caminho é a raiz mais o slug — sem prefixo de pasta", () => {
    expect(caminhoDaCampanha(campanha({ slug: "pole-position-2026" }))).toBe("/pole-position-2026");
  });

  it("reconhece rota de campanha pelo pathname", () => {
    for (const c of CAMPANHAS) {
      expect(ehRotaDeCampanha(caminhoDaCampanha(c))).toBe(true);
    }
    expect(ehRotaDeCampanha("/estoque")).toBe(false);
    expect(ehRotaDeCampanha("/")).toBe(false);
    expect(ehRotaDeCampanha(null)).toBe(false);
  });

  it("campanhasVivas devolve só as vigentes na data dada", () => {
    const instante = new Date("2026-09-15T12:00:00-03:00");
    const vivas = campanhasVivas(instante);
    /*
     * A guarda de não-vacuidade. Sem ela, `campanhasVivas` devolvendo SEMPRE
     * vazio deixa este laço verde — e a campanha some do `sitemap.ts`, que
     * lê exatamente esta função, sem ninguém saber. Provado por mutação.
     */
    expect(vivas.map((c) => c.slug)).toContain("pole-position-2026");
    for (const c of vivas) {
      expect(campanhaEstaViva(c, instante)).toBe(true);
    }
  });

  it("campanhasVivas fica vazia depois do fim de todas", () => {
    expect(campanhasVivas(new Date("2027-01-01T12:00:00-03:00"))).toEqual([]);
  });
});

describe("o registro se mantém honesto", () => {
  it("todo campo obrigatório está preenchido, e fim vem depois de inicio", () => {
    for (const c of CAMPANHAS) {
      expect(c.slug.trim()).not.toBe("");
      expect(c.nome.trim()).not.toBe("");
      expect(c.descricao.trim()).not.toBe("");
      expect(c.fraseDoCliente.trim()).not.toBe("");
      expect(c.destinoAposFim.startsWith("/")).toBe(true);
      expect(new Date(c.fim).getTime()).toBeGreaterThanOrEqual(new Date(c.inicio).getTime());
    }
  });

  it("nenhum slug se repete — o 308 fica em cache eterno no navegador", () => {
    const slugs = CAMPANHAS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("o slug carrega o ano, e por isso nunca se reusa", () => {
    for (const c of CAMPANHAS) {
      expect(c.slug).toMatch(/-20\d{2}$/);
    }
  });

  /*
   * A AMARRA. Pasta em (campanha)/ que não estiver no registro nasce sem
   * sitemap, sem card de compartilhamento e sem plano de morte — e nada disso
   * quebra a tela, então só um teste pega.
   *
   * Caminhos montados com path.join: comparar com endsWith("/algo") falha no
   * Windows e deixa a asserção verde sem nunca casar.
   */
  it("toda pasta em (campanha)/ está no registro", () => {
    const raiz = path.join(process.cwd(), "src", "app", "(campanha)");
    if (!fs.existsSync(raiz)) return;
    const pastas = fs
      .readdirSync(raiz, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    for (const pasta of pastas) {
      expect(campanhaPorSlug(pasta), `a pasta ${pasta} não está em CAMPANHAS`).toBeDefined();
    }
  });

  it("toda campanha do registro tem pasta", () => {
    const raiz = path.join(process.cwd(), "src", "app", "(campanha)");
    for (const c of CAMPANHAS) {
      expect(fs.existsSync(path.join(raiz, c.slug)), `falta a pasta de ${c.slug}`).toBe(true);
    }
  });
});

/*
 * A moldura, testada pelo COMPORTAMENTO e não pela fonte.
 *
 * A primeira versão destes testes fazia `toMatch(/ehRotaDeCampanha/)` sobre o
 * arquivo — e casava com a linha do `import`. Provado por mutação: apagar o
 * `if (ehRotaDeCampanha(pathname)) return null;` deixava a suíte inteira verde,
 * com o cabeçalho e o pop-up de lead voltando para a LP sem nenhum sinal.
 *
 * `usePathname` é mockado porque os dois componentes são client components que
 * decidem SÓ com base na rota: dado o pathname, a saída é determinística.
 */
const rotaAtual = { valor: "/" };
vi.mock("next/navigation", () => ({
  usePathname: () => rotaAtual.valor,
}));

function renderizar(Componente: (p: { children: ReactNode }) => ReactNode, rota: string) {
  rotaAtual.valor = rota;
  return renderToStaticMarkup(
    createElement(Componente as never, { children: createElement("i", null, "MARCA") }),
  );
}

describe("a moldura de navegação some na campanha e fica na loja", () => {
  it("some na rota de campanha — senão o pop-up compete com o CTA do anúncio", () => {
    for (const c of CAMPANHAS) {
      expect(renderizar(MolduraDoSite, caminhoDaCampanha(c))).not.toContain("MARCA");
    }
  });

  it("some fora da loja, como antes", () => {
    expect(renderizar(MolduraDoSite, "/admin/estoque")).not.toContain("MARCA");
    expect(renderizar(MolduraDoSite, "/vitrine")).not.toContain("MARCA");
  });

  it("FICA nas rotas da loja", () => {
    for (const rota of ["/", "/estoque", "/garantia", "/login"]) {
      expect(renderizar(MolduraDoSite, rota), rota).toContain("MARCA");
    }
  });
});

describe("o aviso legal segue outra régua", () => {
  /*
   * A regressão que este bloco existe para pegar: acrescentar a guarda de
   * campanha ao `AvisoLegalDoSite` faria a LP perder o banner de cookies.
   * Largar o cabeçalho é design; largar o aviso seria conformidade.
   */
  it("FICA na landing page de campanha", () => {
    for (const c of CAMPANHAS) {
      expect(renderizar(AvisoLegalDoSite, caminhoDaCampanha(c))).toContain("MARCA");
    }
  });

  it("continua fora de /vitrine e /admin — são aparelhos da loja, não do cliente", () => {
    expect(renderizar(AvisoLegalDoSite, "/vitrine")).not.toContain("MARCA");
    expect(renderizar(AvisoLegalDoSite, "/admin")).not.toContain("MARCA");
  });

  it("fica nas rotas da loja", () => {
    expect(renderizar(AvisoLegalDoSite, "/estoque")).toContain("MARCA");
  });

  it("o layout raiz monta o banner dentro do wrapper legal, e não da navegação", () => {
    const layout = lerCodigo("src/app/layout.tsx");
    expect(layout).toMatch(
      /<AvisoLegalDoSite>[\s\S]*?<CookieConsentBanner \/>[\s\S]*?<\/AvisoLegalDoSite>/,
    );
    // E NÃO sobrou uma segunda montagem dentro da moldura de navegação.
    const dentroDaMoldura = layout.match(/<MolduraDoSite>[\s\S]*?<\/MolduraDoSite>/g) ?? [];
    for (const bloco of dentroDaMoldura) {
      expect(bloco).not.toMatch(/CookieConsentBanner/);
    }
  });
});
