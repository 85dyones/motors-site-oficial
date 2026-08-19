import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import nextConfig from "../next.config";

/**
 * P4 da `docs/RECOMENDACAO_SEO.md` — o alias da Vercel manda as páginas para
 * o domínio, e só as páginas.
 *
 * Este teste existe por um motivo específico: a diferença entre o redirect
 * certo e um que derruba a operação é um `(?!api/)`. Quatro workflows do n8n
 * chamam o site pelo alias — os três nós HTTP do orquestrador, confirmados em
 * 2026-08-18 —, e um 301 abrangente os deixaria em silêncio, porque cliente
 * HTTP costuma descartar o `Authorization` ao trocar de host.
 *
 * Por isso a checagem é de COMPORTAMENTO, não de texto: casar a string do
 * padrão passaria mesmo se ele parasse de excluir a API.
 */

// O mesmo compilador de rota que o Next usa internamente — testar com outro
// seria testar outra coisa.
const require_ = createRequire(import.meta.url);
const ptr = require_("next/dist/compiled/path-to-regexp");
const pathToRegexp = ptr.pathToRegexp ?? ptr.default?.pathToRegexp;

async function regraDoAlias() {
  const regras = await nextConfig.redirects!();
  const r = regras.find((x) =>
    (x.has ?? []).some((h) => h.type === "host" && String(h.value).includes("vercel.app")),
  );
  if (!r) throw new Error("Nenhuma regra de redirect por host do alias encontrada");
  return r;
}

describe("o 301 do alias da Vercel", () => {
  it("existe, é permanente e só vale para o host do alias", () => {
    return regraDoAlias().then((r) => {
      expect(r.permanent).toBe(true);
      // Sem a condição de host, a regra redirecionaria o domínio para ele
      // mesmo — laço infinito no site inteiro.
      expect(r.has?.[0]?.type).toBe("host");
      expect(r.destination).toContain("motorsstore.com.br");
    });
  });

  it("manda as páginas, preservando o caminho", async () => {
    const r = await regraDoAlias();
    const re = pathToRegexp(r.source);
    for (const caminho of [
      "/",
      "/estoque",
      "/sobre",
      "/contato",
      "/carros/bmw/x4/m40i/bmw-x4-m40i-7947766",
      "/destaques/suvs",
    ]) {
      expect(re.exec(caminho), `${caminho} deveria redirecionar`).not.toBeNull();
    }
  });

  it("NÃO toca em /api — é por onde o n8n entra", async () => {
    const r = await regraDoAlias();
    const re = pathToRegexp(r.source);
    for (const caminho of [
      "/api/ciclo/motor/fila",
      "/api/ciclo/motor/desfecho",
      "/api/ciclo/vendas-incompletas",
      "/api/feed/xml",
      "/api/leads",
    ]) {
      expect(re.exec(caminho), `${caminho} NÃO pode redirecionar`).toBeNull();
    }
  });

  it("a exceção é do prefixo /api/, não de palavras que começam com api", async () => {
    // `(?!api)` sem a barra excluiria uma futura página /apice ou /apitude.
    const r = await regraDoAlias();
    const re = pathToRegexp(r.source);
    expect(re.exec("/apitude")).not.toBeNull();
  });
});
