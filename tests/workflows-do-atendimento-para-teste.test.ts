import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports -- o script é CommonJS, como os outros de scripts/
const script = require("../scripts/workflows-do-atendimento-para-teste.js");

/**
 * As cópias de teste dos workflows do atendimento (2026-10-20): o teste do
 * atendimento 2.0 é no preview do branch, antes do merge. O que este arquivo
 * segura: nenhuma chamada da cópia vai à produção, toda chamada leva o bypass
 * da Vercel e a credencial do motor, o webhook não colide com o de produção e
 * o segredo nunca entra no repositório.
 */

const RAIZ = join(__dirname, "..");
const PREVIEW = "https://motors-site-oficial-git-claude-9d2369-dyones-projects-a2f07575.vercel.app";
interface No {
  name: string;
  type: string;
  webhookId?: string;
  parameters: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- parâmetros do n8n variam por tipo de nó
  credentials?: Record<string, { name: string }>;
}
interface Workflow {
  name: string;
  active: boolean;
  nodes: No[];
}
const ler = (nome: string): Workflow => JSON.parse(readFileSync(join(RAIZ, nome), "utf-8"));
const [ENTRADA, RODADA] = (script.VERSIONADOS as string[]).map(ler);
const chamadas = (wf: Workflow) => wf.nodes.filter((n) => n.type === "n8n-nodes-base.httpRequest");

describe("as cópias de teste dos workflows do atendimento", () => {
  it("toda chamada vai ao preview, nenhuma à produção — e com a credencial do motor", () => {
    for (const original of [ENTRADA, RODADA]) {
      const copia: Workflow = script.paraTeste(original, { site: PREVIEW, bypass: "segredo" });
      expect(chamadas(copia).length).toBe(chamadas(original).length);
      for (const no of chamadas(copia)) {
        expect(no.parameters.url.startsWith(`${PREVIEW}/api/atendimento/`)).toBe(true);
        expect(no.credentials!.httpHeaderAuth.name).toBe("ATENDIMENTO_MOTOR_TOKEN");
      }
      expect(JSON.stringify(copia)).not.toContain("motorsstore.com.br");
    }
  });

  it("toda chamada leva o cabeçalho do bypass da Vercel", () => {
    const copia: Workflow = script.paraTeste(RODADA, { site: PREVIEW, bypass: "segredo" });
    for (const no of chamadas(copia)) {
      expect(no.parameters.sendHeaders).toBe(true);
      expect(no.parameters.headerParameters).toEqual({ parameters: [{ name: "x-vercel-protection-bypass", value: "segredo" }] });
    }
    const sem: Workflow = script.paraTeste(RODADA, { site: PREVIEW, bypass: null });
    expect(chamadas(sem).every((n) => !n.parameters.sendHeaders)).toBe(true);
  });

  it("nome com TESTE, desligado, e o webhook em outro caminho e outro id", () => {
    const copia: Workflow = script.paraTeste(ENTRADA, { site: PREVIEW, bypass: "segredo" });
    expect(copia.name).toBe("Motors Atendimento TESTE — Entrada (Evolution)");
    expect(copia.active).toBe(false);
    const gancho = copia.nodes.find((n) => n.type === "n8n-nodes-base.webhook")!;
    const original = ENTRADA.nodes.find((n) => n.type === "n8n-nodes-base.webhook")!;
    expect(gancho.parameters.path).toBe("atendimento-evolution-teste");
    expect(gancho.webhookId).not.toBe(original.webhookId);
    // O original não é tocado.
    expect(original.parameters.path).toBe("atendimento-evolution");
    expect(chamadas(ENTRADA)[0].parameters.url.startsWith("https://motorsstore.com.br/")).toBe(true);
  });

  it.each([
    ["o domínio de produção", "https://motorsstore.com.br"],
    ["o www de produção", "https://www.motorsstore.com.br"],
    ["o domínio antigo", "https://motorsstoreoficial.com.br"],
    ["http", "http://motors-site-oficial-git-x.vercel.app"],
    ["com caminho", `${PREVIEW}/api`],
    ["vazio", ""],
  ])("recusa %s como site", (_r, site) => {
    expect(() => script.paraTeste(RODADA, { site, bypass: "segredo" })).toThrow();
  });

  it("recusa o segredo vazio e o nó que chama endereço desconhecido", () => {
    expect(() => script.paraTeste(RODADA, { site: PREVIEW, bypass: "  " })).toThrow(/vazio/);
    const estranho = structuredClone(RODADA);
    chamadas(estranho)[0].parameters.url = "https://outro.site/api/x";
    expect(() => script.paraTeste(estranho, { site: PREVIEW, bypass: "segredo" })).toThrow(/não conhece/);
  });

  it("a saída com o segredo fica fora do repositório (que é público)", () => {
    expect(readFileSync(join(RAIZ, ".gitignore"), "utf-8")).toMatch(/^\/n8n-teste\/$/m);
    expect(script.PASTA_DE_SAIDA).toBe("n8n-teste");
  });
});
