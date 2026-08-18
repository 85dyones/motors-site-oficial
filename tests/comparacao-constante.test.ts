import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tokenConfere } from "../src/lib/comparacaoConstante";

/**
 * Achado #9 da revisão, corrigido em 2026-08-18.
 *
 * Três pernas: comparação de segredo em tempo constante (`!==` de string
 * desiste no primeiro caractere diferente e vira oráculo de timing), token
 * do motor separado do de margens (coberto em `ciclo-motor.test.ts`) e as
 * rotas do motor dentro do matcher do proxy, com rate limit.
 */

const raiz = join(__dirname, "..");
const rotaMargens = readFileSync(
  join(raiz, "src", "app", "api", "financeiro", "margens", "consulta", "route.ts"),
  "utf-8",
);
const proxy = readFileSync(join(raiz, "src", "proxy.ts"), "utf-8");

describe("tokenConfere — comparação em tempo constante", () => {
  it("aceita o segredo exato e recusa o diferente", () => {
    expect(tokenConfere("Bearer abc123", "Bearer abc123")).toBe(true);
    expect(tokenConfere("Bearer abc124", "Bearer abc123")).toBe(false);
  });

  it("comprimentos diferentes recusam sem estourar", () => {
    // `timingSafeEqual` puro EXIGE buffers do mesmo tamanho e lança se não
    // forem — o hash prévio é o que torna qualquer palpite comparável.
    expect(tokenConfere("curto", "um segredo bem mais comprido")).toBe(false);
    expect(tokenConfere("um segredo bem mais comprido", "curto")).toBe(false);
  });

  it("vazio de qualquer lado recusa — nunca 'vazio confere com vazio'", () => {
    // A lição de 2026-08-12: token vazio dos dois lados não pode autorizar.
    expect(tokenConfere("", "")).toBe(false);
    expect(tokenConfere(null, "segredo")).toBe(false);
    expect(tokenConfere(undefined, "segredo")).toBe(false);
    expect(tokenConfere("segredo", "")).toBe(false);
  });
});

describe("quem compara segredo usa o comparador", () => {
  it("a consulta de margens não compara Bearer com !==", () => {
    expect(rotaMargens).toContain("tokenConfere");
    expect(rotaMargens).not.toContain("!== `Bearer");
  });
});

describe("o motor está atrás do rate limit do proxy", () => {
  it("o matcher cobre /api/ciclo/motor", () => {
    expect(proxy).toContain('"/api/ciclo/motor/:path*"');
  });

  it("há um limitador próprio, e a recusa é barulhenta", () => {
    expect(proxy).toContain("motorRatelimit");
    // 429 com corpo de erro, nunca 204 silencioso: o modo de falha conhecido
    // do orquestrador é terminar verde sem enviar nada.
    expect(proxy).toMatch(/api\/ciclo\/motor[\s\S]*?status: 429/);
  });

  it("o ramo do motor retorna explícito, sem cair nos gates de sessão", () => {
    // O n8n chama sem cookie; se o request escorresse para o gate de
    // /api/financeiro ele levaria 401 de sessão em vez do 401 de token.
    expect(proxy).toMatch(/startsWith\("\/api\/ciclo\/motor"\)[\s\S]*?return NextResponse\.next\(\);/);
  });
});
