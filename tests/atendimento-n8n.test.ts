import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O contrato entre os workflows versionados do atendimento e as rotas do site
 * (2026-10-20). A cópia versionada de workflow já divergiu do que roda ao
 * vivo neste projeto (`supabase/README.md`); este teste cobre a metade que o
 * repositório controla: os endereços, as credenciais, os campos que o n8n lê
 * da resposta e o "importado desligado".
 */

const RAIZ = join(__dirname, "..");
/** Um nó de workflow do n8n, só no que o teste lê. */
interface No {
  name: string;
  type: string;
  parameters: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- parâmetros do n8n variam por tipo de nó
  credentials?: Record<string, { name: string }>;
}
interface Workflow {
  active: boolean;
  nodes: No[];
  connections: Record<string, { main: { node: string }[][] }>;
}
const ler = (nome: string): Workflow => JSON.parse(readFileSync(join(RAIZ, nome), "utf-8"));
const entrada = ler("Motors Atendimento — Entrada (Evolution).json");
const rodada = ler("Motors Atendimento — Rodada.json");
const no = (wf: Workflow, nome: string) => wf.nodes.find((n) => n.name === nome)!;
const rota = (caminho: string) => readFileSync(join(RAIZ, "src/app/api/atendimento", caminho, "route.ts"), "utf-8");
const servidor = readFileSync(join(RAIZ, "src/lib/atendimento-servidor.ts"), "utf-8");

describe("os dois workflows", () => {
  it("são importados DESLIGADOS: a primeira rodada manda mensagem de verdade", () => {
    expect(entrada.active).toBe(false);
    expect(rodada.active).toBe(false);
  });

  it("toda chamada ao site usa a credencial própria, ATENDIMENTO_MOTOR_TOKEN", () => {
    const chamadas = [...entrada.nodes, ...rodada.nodes].filter((n) => n.type === "n8n-nodes-base.httpRequest");
    expect(chamadas.length).toBe(3);
    for (const n of chamadas) {
      expect(n.parameters.genericAuthType).toBe("httpHeaderAuth");
      expect(n.credentials!.httpHeaderAuth.name).toBe("ATENDIMENTO_MOTOR_TOKEN");
      // Erro HTTP não derruba a execução no meio: quem decide é o fim do fluxo.
      expect(n.parameters.options.response.response.neverError).toBe(true);
    }
  });

  it("o webhook da Evolution exige cabeçalho: sem ele, qualquer um faria o site mandar WhatsApp", () => {
    const webhook = no(entrada, "Webhook da Evolution");
    expect(webhook.parameters.authentication).toBe("headerAuth");
    expect(webhook.parameters.responseMode).toBe("onReceived");
  });
});

describe("a entrada", () => {
  it("repassa o corpo da Evolution inteiro para /api/atendimento/evolution", () => {
    const n = no(entrada, "Repassar ao site");
    expect(n.parameters.url).toMatch(/\/api\/atendimento\/evolution$/);
    expect(n.parameters.jsonBody).toBe("={{ $json.body }}");
  });

  it("lê da resposta exatamente os campos que a rota devolve: responder, aguardar_ms, lead e mensagem", () => {
    const texto = JSON.stringify(entrada);
    for (const campo of ["body.responder", "body.aguardar_ms", "body.lead", "body.mensagem"]) expect(texto).toContain(campo);
    // E a rota (pelo servidor) devolve esses nomes.
    for (const campo of ["responder", "aguardar_ms", "lead:", "mensagem:"]) expect(servidor).toContain(campo);
  });

  it("espera a rajada antes de pedir a resposta, e pede com lead_id e mensagem_id", () => {
    expect(entrada.connections["O assistente responde?"].main[0][0].node).toBe("Esperar a rajada");
    expect(entrada.connections["Esperar a rajada"].main[0][0].node).toBe("Pedir a resposta");
    const pedir = no(entrada, "Pedir a resposta");
    expect(pedir.parameters.url).toMatch(/\/api\/atendimento\/responder$/);
    expect(pedir.parameters.jsonBody).toContain('"lead_id"');
    expect(pedir.parameters.jsonBody).toContain('"mensagem_id"');
    expect(rota("responder")).toContain("corpo?.lead_id");
    expect(rota("responder")).toContain("corpo?.mensagem_id");
  });
});

describe("a rodada", () => {
  it("chama /api/atendimento/rodada com reservar: true, a cada 15 minutos", () => {
    const n = no(rodada, "Pedir a rodada");
    expect(n.parameters.url).toMatch(/\/api\/atendimento\/rodada$/);
    expect(n.parameters.jsonBody).toContain('"reservar": true');
    expect(no(rodada, "A cada 15 minutos").parameters.rule.interval[0].expression).toBe("*/15 * * * *");
  });

  it("termina vermelha quando algo não saiu — lendo os campos que a rota devolve", () => {
    const codigo = no(rodada, "Conferir").parameters.jsCode as string;
    for (const campo of ["statusCode", "falhas", "toques", "entregas", "enviado", "avisado", "sem_destinatario", "throw new Error"]) {
      expect(codigo).toContain(campo);
    }
    for (const campo of ["falhas", "toques", "entregas", "avisado", "sem_destinatario"]) expect(servidor).toContain(campo);
  });

  it("a rota começa em prévia: mandar mensagem a cliente exige pedir com todas as letras", () => {
    expect(rota("rodada")).toContain("corpo?.reservar === true");
  });
});
