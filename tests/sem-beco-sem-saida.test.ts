import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import nextConfig from "../next.config";

/**
 * "Sem 404 nunca, sempre temos que ter algo" — ordem do dono em 2026-09-20.
 *
 * ---------------------------------------------------------------------------
 * O que a regra quer dizer, e o que ela NÃO quer dizer
 * ---------------------------------------------------------------------------
 * Ela é sobre o que a pessoa VÊ, não sobre o código HTTP. O endereço que não
 * existe continua respondendo 404 — responder 200 seria *soft 404*, e o
 * buscador passaria a indexar endereço inventado, diluindo o sinal das páginas
 * boas. A mesma decisão já estava escrita em `[marca]/not-found.tsx`: "status
 * e metadata não mudam".
 *
 * O que não pode é o CORPO ser um beco. A saída da casa tem título em
 * português, amostra do pátio, blocos de recorte, "VER TODO O ESTOQUE" e o
 * formulário de encomenda que transforma o endereço morto em lead — e leva
 * junto de qual endereço morto ele veio.
 *
 * ---------------------------------------------------------------------------
 * Por que um teste de ARQUIVO, e não de render
 * ---------------------------------------------------------------------------
 * Em Next, `not-found.tsx` vale só para a subárvore onde está. Foi exatamente
 * assim que o buraco nasceu: existiam três (marca, modelo, ficha) e nenhum na
 * raiz, então tudo fora da subárvore de `[categoria]` — `/pagina-inventada`,
 * `/guias/slug-errado` — caía no "This page could not be found" de fábrica.
 *
 * Nada falha quando alguém apaga um desses arquivos. O site volta ao 404 do
 * Next, em inglês, sem link, e continua respondendo 404 — nenhum teste de
 * status percebe. Só a presença do arquivo, e o fato de ele montar o corpo da
 * casa, prende a regra.
 */

const require_ = createRequire(import.meta.url);
const ptr = require_("next/dist/compiled/path-to-regexp");
const match = ptr.match ?? ptr.default?.match;
const compile = ptr.compile ?? ptr.default?.compile;

const raizDoApp = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "app");

async function resolver(caminho: string) {
  for (const r of await nextConfig.redirects!()) {
    if ((r.has ?? []).some((h) => h.type === "host")) continue;
    const casou = match(r.source, { decode: decodeURIComponent })(caminho);
    if (!casou) continue;
    return compile(r.destination, { encode: (x: string) => x })(casou.params);
  }
  return null;
}

/**
 * Cada rota que pode não encontrar nada, e o arquivo que a segura.
 * A raiz é a que cobre todo o resto do site.
 */
const SAIDAS = [
  { rota: "a raiz (todo endereço que nenhuma rota casa)", arquivo: "not-found.tsx" },
  { rota: "a guia que não existe", arquivo: join("guias", "[slug]", "not-found.tsx") },
  { rota: "o recorte de vitrine que não existe", arquivo: join("estoque", "[recorte]", "not-found.tsx") },
  { rota: "o destaque que saiu do ar", arquivo: join("destaques", "[tag]", "not-found.tsx") },
  { rota: "a marca que não existe", arquivo: join("[categoria]", "[marca]", "not-found.tsx") },
  { rota: "o modelo que não existe", arquivo: join("[categoria]", "[marca]", "[modelo]", "not-found.tsx") },
  { rota: "a ficha que não existe", arquivo: join("[categoria]", "[marca]", "[modelo]", "[ficha]", "not-found.tsx") },
];

describe("sem beco sem saída", () => {
  it.each(SAIDAS)("$rota tem saída própria", ({ arquivo }) => {
    const caminho = join(raizDoApp, arquivo);
    expect(existsSync(caminho), `falta src/app/${arquivo}`).toBe(true);
  });

  it.each(SAIDAS)("$rota monta o corpo da casa, não uma mensagem seca", ({ arquivo }) => {
    const fonte = readFileSync(join(raizDoApp, arquivo), "utf8");

    // A vitrine, os blocos de recorte e o "VER TODO O ESTOQUE" vêm daqui.
    expect(fonte, `${arquivo} precisa montar NaoEncontradoNoEstoque`).toContain(
      "NaoEncontradoNoEstoque",
    );
    // E o formulário, que é o que faz o endereço morto virar lead em vez de
    // virar nada. Sem ele a página é bonita e não serve para o negócio.
    expect(fonte, `${arquivo} precisa oferecer a encomenda`).toContain(
      "EncomendaDaFichaPerdida",
    );
  });

  it("a raiz existe — é ela que cobre o site inteiro", () => {
    // Repetido de propósito: as outras seis são melhorias de contexto; esta é
    // a que decide se `/qualquer-coisa` tem saída. Se um dia sobrar só um
    // teste aqui, que seja este.
    expect(existsSync(join(raizDoApp, "not-found.tsx"))).toBe(true);
  });

  it("as raízes de seção sem página levam para a vitrine, não para o 404", async () => {
    for (const raiz of ["/carros", "/motos", "/destaques"]) {
      expect(await resolver(raiz), `${raiz} não pode morrer`).toBe("/estoque");
    }
  });

  it("e os filhos dessas raízes continuam sendo páginas de verdade", async () => {
    // O curinga é o erro fácil aqui: `/carros/:resto*` engoliria as 39 fichas
    // do site antigo, `/motos/:resto*` os 13 endereços de moto do sitemap e
    // `/destaques/:resto*` as duas campanhas. Todos respondem 200 hoje.
    for (const filho of [
      "/carros/bmw",
      "/carros/volkswagen/saveiro",
      "/motos/honda",
      "/motos/honda/cb/250f-twister-abs-7987637",
      "/destaques/baixa-quilometragem",
      "/destaques/feirao-pole-position-motors",
    ]) {
      expect(await resolver(filho), `${filho} é página, não redirect`).toBeNull();
    }
  });
});
