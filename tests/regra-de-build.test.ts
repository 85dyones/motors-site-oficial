import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A regra de builds da Vercel (2026-10-21): "precisamos desta regra, já temos
 * uma cobrança absurda extra este mês". O script decide pelo código de saída,
 * na convenção do `ignoreCommand`: 0 PULA o build, 1 CONSTRÓI. O CI roda o
 * mesmo arquivo para não esperar um deploy que não vem.
 */

const SCRIPT = join(__dirname, "..", "scripts", "vercel-regra-de-build.sh");

function decide(env: Record<string, string>): "constroi" | "pula" {
  // Só o PATH do ambiente de fora: o resultado não pode depender das variáveis da Vercel de quem roda.
  const ambiente = { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv;
  const r = spawnSync("bash", [SCRIPT], { env: ambiente, encoding: "utf-8" });
  if (r.status === 0) return "pula";
  if (r.status === 1) return "constroi";
  throw new Error(`saída inesperada ${r.status}: ${r.stderr}`);
}

describe("a regra de builds", () => {
  it("a main (o site no ar) sempre constrói, na Vercel e no CI", () => {
    expect(decide({ VERCEL_GIT_COMMIT_REF: "main", VERCEL_GIT_COMMIT_MESSAGE: "docs: ajuste" })).toBe("constroi");
    expect(decide({ BRANCH: "main", MENSAGEM: "qualquer coisa" })).toBe("constroi");
  });

  it("branch de trabalho só constrói com [preview] na mensagem", () => {
    expect(decide({ VERCEL_GIT_COMMIT_REF: "claude/x", VERCEL_GIT_COMMIT_MESSAGE: "feat: tela nova" })).toBe("pula");
    expect(decide({ VERCEL_GIT_COMMIT_REF: "claude/x", VERCEL_GIT_COMMIT_MESSAGE: "feat: tela nova [preview]" })).toBe("constroi");
    expect(decide({ BRANCH: "feat/y", MENSAGEM: "fix: algo\n\n[prévia] para o dono testar" })).toBe("constroi");
    expect(decide({ BRANCH: "feat/y", MENSAGEM: "fix: algo" })).toBe("pula");
  });

  it("deploy sem branch (CLI ou manual) constrói", () => {
    expect(decide({})).toBe("constroi");
  });

  it("o vercel.json aponta para o script", () => {
    const config = JSON.parse(readFileSync(join(__dirname, "..", "vercel.json"), "utf-8"));
    expect(config.ignoreCommand).toBe("bash scripts/vercel-regra-de-build.sh");
    // As crons continuam.
    expect(config.crons).toEqual([{ path: "/api/indexnow", schedule: "20 10 * * *" }]);
  });

  it("o job deploy-vercel do CI decide pelo mesmo script antes de esperar", () => {
    const workflow = readFileSync(join(__dirname, "..", ".github", "workflows", "testes.yml"), "utf-8");
    const job = workflow.slice(workflow.indexOf("  deploy-vercel:"));
    expect(job).toContain("bash scripts/vercel-regra-de-build.sh");
    expect(job).toContain("if: steps.regra.outputs.pular != 'true'");
    expect(job).toContain("contents: read");
  });
});
