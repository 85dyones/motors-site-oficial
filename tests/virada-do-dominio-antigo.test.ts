import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import nextConfig from "../next.config";

/**
 * A virada de `motorsstoreoficial.com.br` — o site que o RevendaMais hospedava
 * — para `motorsstore.com.br`.
 *
 * ---------------------------------------------------------------------------
 * O que foi medido em 2026-09-20, antes de escrever a regra
 * ---------------------------------------------------------------------------
 * As 57 URLs do sitemap do site antigo, pedidas no domínio novo, seguindo
 * redirect até o fim:
 *
 *   43 respondiam 200 — inclusive as 39 fichas de carro, que ninguém tinha
 *      mapeado: a URL do RevendaMais tem os mesmos CINCO segmentos que a rota
 *      `[legado]` espera e termina no mesmo id do anúncio, então ela já
 *      resolvia o 308 sozinha.
 *   14 davam 404 — `/multipla` e os 13 `/multipla/marca/<marca>`.
 *
 * Fora do sitemap, mais duas: `/politica-de-privacidade` (página real, com
 * LGPD no texto) e `/carros`, que lá era 302 para `/busca/`.
 *
 * ---------------------------------------------------------------------------
 * Por que o teste é de COMPORTAMENTO, e resolve a lista inteira
 * ---------------------------------------------------------------------------
 * O risco desta mudança não está em nenhuma regra isolada: está na ORDEM
 * delas. `/multipla/:resto*` casa com `/multipla/marca/fiat` também — se
 * alguém trocar as duas de lugar, as 13 marcas param de ir para o hub e caem
 * todas na vitrine, sem nada quebrar visivelmente. Por isso o teste resolve o
 * caminho pela lista inteira, na ordem real, como o Next faz.
 *
 * E a trava que mais importa é a do `/carros`: ele precisa ser EXATO. No dia
 * em que virar `/carros/:resto*`, as 39 fichas — o que o site tem de mais
 * indexado — passam a ser engolidas antes de chegar na rota `[legado]`.
 */

const require_ = createRequire(import.meta.url);
const ptr = require_("next/dist/compiled/path-to-regexp");
const match = ptr.match ?? ptr.default?.match;
const compile = ptr.compile ?? ptr.default?.compile;

type Regra = Awaited<ReturnType<NonNullable<typeof nextConfig.redirects>>>[number];

async function regras(): Promise<Regra[]> {
  return nextConfig.redirects!();
}

/**
 * Resolve um caminho pela lista, na ordem — a primeira regra que casa vence,
 * que é exatamente o critério do Next. `host` só é considerado nas regras que
 * pedem host; uma regra sem `has` vale para qualquer um.
 */
async function resolver(caminho: string, host?: string) {
  for (const r of await regras()) {
    const exigeHost = (r.has ?? []).filter((h) => h.type === "host");
    if (exigeHost.length > 0) {
      if (!host || !exigeHost.some((h) => String(h.value) === host)) continue;
    }
    const casou = match(r.source, { decode: decodeURIComponent })(caminho);
    if (!casou) continue;
    // Destino absoluto tem origem + caminho; só o caminho passa pelo compile.
    // Sem isto o teste compararia o MODELO (`.../:caminho`) e passaria mesmo
    // se a regra parasse de carregar o caminho para o domínio novo.
    const partes = r.destination.match(/^(https?:\/\/[^/]+)(\/.*)?$/);
    const modelo = partes ? (partes[2] ?? "/") : r.destination;
    const origem = partes ? partes[1] : "";
    const destino = origem + compile(modelo, { encode: (x: string) => x })(casou.params);
    return { destino, permanent: r.permanent, source: r.source };
  }
  return null;
}

const MARCAS_DO_SITE_ANTIGO = [
  "bmw",
  "chevrolet",
  "fiat",
  "ford",
  "honda",
  "hyundai",
  "kia",
  "mitsubishi",
  "nissan",
  "peugeot",
  "renault",
  "toyota",
  "volkswagen",
];

describe("a virada do domínio antigo", () => {
  it("manda cada uma das 13 marcas do catálogo velho para o hub da marca", async () => {
    for (const marca of MARCAS_DO_SITE_ANTIGO) {
      const r = await resolver(`/multipla/marca/${marca}`);
      expect(r, `/multipla/marca/${marca} precisa redirecionar`).not.toBeNull();
      expect(r!.destino, `a marca ${marca} não pode cair na vitrine genérica`).toBe(
        `/carros/${marca}`,
      );
      expect(r!.permanent).toBe(true);
    }
  });

  it("a regra da marca vence a genérica de /multipla — é uma questão de ordem", async () => {
    // Se as duas trocarem de lugar este teste cai, e é o único jeito de notar:
    // os dois destinos respondem 200, o visitante só chega no lugar errado.
    expect((await resolver("/multipla/marca/fiat"))!.destino).toBe("/carros/fiat");
    expect((await resolver("/multipla"))!.destino).toBe("/estoque");
    expect((await resolver("/multipla/modelo/onix"))!.destino).toBe("/estoque");
    expect((await resolver("/multipla/preco/ate-50-mil"))!.destino).toBe("/estoque");
  });

  it("/carros é EXATO — as fichas do site antigo precisam passar direto", async () => {
    expect((await resolver("/carros"))!.destino).toBe("/estoque");

    // As cinco fichas abaixo são URLs reais do sitemap do site antigo. Elas NÃO
    // podem casar com nenhum redirect: quem resolve é a rota `[legado]`, que lê
    // o id do fim do slug e devolve 308 para a ficha nova. Um redirect aqui
    // engoliria as 39 antes disso.
    const fichas = [
      "/carros/Chevrolet/Onix/Hatch-10-12v-Flex-5p-Mec/Chevrolet-Onix-Hatch-10-12v-Flex-5p-Mec-2025-Curitiba-Parana-8299212.html",
      "/carros/Kia/Soul/Ex2-16-Ff-At/Kia-Soul-Ex2-16-Ff-At-2016-Curitiba-Parana-8449096.html",
      "/carros/Fiat/Titano/Volcano-22-16v-4x4-Tb-Die-Aut/Fiat-Titano-Volcano-22-16v-4x4-Tb-Die-Aut-2025-Curitiba-Parana-8171616.html",
      "/carros/Renault/Kwid/Zen-2/Renault-Kwid-Zen-2-2025-Curitiba-Parana-8443691.html",
      "/carros/Volkswagen/Parati/Cl-16-Mi-4p/Volkswagen-Parati-Cl-16-Mi-4p-1999-Curitiba-Parana-8152210.html",
    ];
    for (const f of fichas) {
      expect(await resolver(f), `${f} tem que chegar na rota [legado]`).toBeNull();
    }

    // E os hubs de marca do site NOVO seguem sendo páginas, não redirects.
    for (const marca of MARCAS_DO_SITE_ANTIGO) {
      expect(await resolver(`/carros/${marca}`), `/carros/${marca} é página`).toBeNull();
    }
  });

  it("a política de privacidade do site antigo não perde o endereço", async () => {
    const r = await resolver("/politica-de-privacidade");
    expect(r).not.toBeNull();
    expect(r!.destino).toBe("/privacidade");
    expect(r!.permanent).toBe(true);
  });

  it("a página institucional do site antigo vai para /sobre, pelos dois caminhos da virada", async () => {
    const r = await resolver("/empresa");
    expect(r).not.toBeNull();
    expect(r!.destino).toBe("/sobre");
    expect(r!.permanent).toBe(true);

    // Chegando pelo domínio velho, a regra de caminho vem antes da de host.
    for (const host of ["motorsstoreoficial.com.br", "www.motorsstoreoficial.com.br"]) {
      expect((await resolver("/empresa", host))!.destino).toBe("/sobre");
    }
  });

  it("a busca velha cai na vitrine", async () => {
    expect((await resolver("/busca"))!.destino).toBe("/estoque");
    expect((await resolver("/busca/chevrolet-onix"))!.destino).toBe("/estoque");
  });

  it("o domínio velho inteiro aponta para o canônico, com e sem www", async () => {
    for (const host of ["motorsstoreoficial.com.br", "www.motorsstoreoficial.com.br"]) {
      const r = await resolver("/estoque", host);
      expect(r, `${host} precisa de regra`).not.toBeNull();
      expect(r!.destino).toBe("https://motorsstore.com.br/estoque");
      expect(r!.permanent).toBe(true);
    }
  });

  it("NÃO toca em /api do domínio velho — a mesma razão do alias da Vercel", async () => {
    // Cliente HTTP costuma descartar `Authorization` ao trocar de host, e há
    // quem chame a API por host alternativo. A exceção é de prefixo, não de
    // palavra: uma futura /apitude continua redirecionando.
    for (const host of ["motorsstoreoficial.com.br", "www.motorsstoreoficial.com.br"]) {
      expect(await resolver("/api/leads", host)).toBeNull();
      expect(await resolver("/api/ciclo/motor/fila", host)).toBeNull();
      expect((await resolver("/apitude", host))!.destino).toContain("motorsstore.com.br");
    }
  });

  it("nenhuma regra manda um caminho para ele mesmo", async () => {
    // Laço infinito é o modo de falhar mais caro desta lista: derruba a página
    // em vez de servir a errada.
    for (const r of await regras()) {
      if (r.destination.startsWith("http")) continue;
      expect(r.destination, `${r.source} aponta para si mesmo`).not.toBe(r.source);
    }
  });

  it("as páginas que o site antigo e o novo têm em comum continuam de pé", async () => {
    // `/`, `/contato`, `/avaliacao` e `/financiamento` existem nos dois com o
    // mesmo endereço: redirecionar qualquer uma seria inventar trabalho.
    for (const caminho of ["/", "/contato", "/avaliacao", "/financiamento", "/estoque"]) {
      expect(await resolver(caminho), `${caminho} não deve redirecionar`).toBeNull();
    }
  });
});
