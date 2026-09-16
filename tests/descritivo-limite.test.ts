import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";

/**
 * O limite de geração da rota do descritivo (endurecimento de 16/09/2026,
 * achado #3 da revisão final do #76: a rota estava no ar desde 15/09 sem
 * nenhum teto de cliques por usuário nem por veículo).
 *
 * ---------------------------------------------------------------------------
 * Por que leitura de fonte, e não simular o 429 de verdade
 * ---------------------------------------------------------------------------
 * `Ratelimit.slidingWindow` fala o protocolo REST do Upstash por dentro do
 * `@upstash/redis` — várias chamadas, com um script Lua para a janela
 * deslizante. Fingir esse protocolo com um `fetch` de mentira testaria o
 * dublê, não a rota. `tests/erros-rota.test.ts` — o único outro limitador
 * deste repositório fora do `src/proxy.ts`, e o mesmo que este arquivo imita
 * — já fez essa escolha: trava a CONFIGURAÇÃO por leitura de fonte
 * (`Ratelimit.slidingWindow(`, o prefixo) e só testa o comportamento de
 * verdade no caminho SEM Redis (bypass), que é o único que corre nesta
 * suíte — ver `tests/descritivo-rota.test.ts`, describe "limite de geração —
 * sem Redis configurado".
 *
 * Este arquivo segue a mesma régua.
 */

const ARQUIVO = "src/app/api/estoque/[id]/descritivo/route.ts";

describe("limite de geração — configuração", () => {
  it("usa Ratelimit.slidingWindow com o teto sugerido: 10 por hora", () => {
    const rota = lerCodigo(ARQUIVO);
    expect(rota).toContain('Ratelimit.slidingWindow(10, "1 h")');
  });

  it("tem prefixo próprio no Redis, como os limitadores de proxy.ts e erros/route.ts", () => {
    const rota = lerCodigo(ARQUIVO);
    expect(rota).toContain('prefix: "@upstash/ratelimit/descritivo"');
  });

  it("a chave do limite junta usuário e veículo — não é só um dos dois", () => {
    const rota = lerCodigo(ARQUIVO);
    expect(rota).toContain("${user.id}:${id}");
  });

  it("quem estoura recebe 429 com mensagem em português", () => {
    const rota = lerCodigo(ARQUIVO);
    expect(rota).toContain("status: 429");
    expect(rota).toContain("Muitas gerações para este veículo");
  });

  it("quem estoura fica registrado no log [descritivo]", () => {
    const rota = lerCodigo(ARQUIVO);
    expect(rota).toContain('motivo: "Limite de 10 gerações por veículo nesta hora excedido."');
  });

  it("o limite roda ANTES da leitura do veículo e da chamada à OpenAI", () => {
    // Ordem no arquivo é ordem de execução: barrar cedo poupa o banco e a
    // OpenAI de quem já estourou o teto. Busca o SITE DE CHAMADA (dentro do
    // POST), não a declaração da função — que fica antes de tudo por ser de
    // módulo, e não provaria a ordem de execução sozinha.
    const rota = lerCodigo(ARQUIVO);
    const idxLimite = rota.indexOf("const limite = limitadorDeGeracao();");
    const idxVeiculo = rota.indexOf('.from("estoque_motors")');
    const idxGeracao = rota.indexOf("gerarTexto({");
    expect(idxLimite).toBeGreaterThan(-1);
    expect(idxVeiculo).toBeGreaterThan(-1);
    expect(idxGeracao).toBeGreaterThan(-1);
    expect(idxLimite).toBeLessThan(idxVeiculo);
    expect(idxVeiculo).toBeLessThan(idxGeracao);
  });

  it("Redis fora do ar é bypass, não 500 — mesma régua de src/proxy.ts", () => {
    const rota = lerCodigo(ARQUIVO);
    expect(rota).toContain("Seguindo sem limite");
  });

  it("o limitador mora na própria rota, não em src/proxy.ts — o matcher do proxy não muda", () => {
    const proxy = lerCodigo("src/proxy.ts");
    expect(proxy).not.toContain("/api/estoque");
    expect(proxy).not.toContain("descritivo");
  });
});

describe("maxDuration — compatível com a latência medida", () => {
  it("declara maxDuration = 30, cobrindo o TIMEOUT_MS de gerar.ts (também 30s)", () => {
    const rota = lerCodigo(ARQUIVO);
    expect(rota).toContain("export const maxDuration = 30");
    const gerar = lerCodigo("src/lib/descritivo/gerar.ts");
    expect(gerar).toContain("const TIMEOUT_MS = 30_000");
  });
});
