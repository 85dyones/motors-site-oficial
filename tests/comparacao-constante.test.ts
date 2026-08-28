import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tokenConfere } from "../src/lib/comparacaoConstante";

/**
 * Achado #9 da revisão, corrigido em 2026-08-18.
 *
 * Duas pernas: comparação de segredo em tempo constante (`!==` de string
 * desiste no primeiro caractere diferente e vira oráculo de timing) e as
 * rotas do motor dentro do matcher do proxy, com rate limit. A terceira
 * perna original — a consulta de margens — foi aposentada em 2026-08-28 com
 * o módulo financeiro; o consumidor vivo de `tokenConfere` é o motor do
 * Ciclo (`ciclo-motor.test.ts` cobre o token dele).
 */

const raiz = join(__dirname, "..");
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
    // O n8n chama sem cookie; se o request escorresse para os gates de
    // sessão ele levaria 401 de sessão em vez do 401 de token.
    expect(proxy).toMatch(/startsWith\("\/api\/ciclo\/motor"\)[\s\S]*?return NextResponse\.next\(\);/);
  });
});
