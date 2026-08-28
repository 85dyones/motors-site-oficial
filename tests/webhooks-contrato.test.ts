import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O contrato que o site emite para o n8n não muda em silêncio.
 *
 * Os workflows do n8n vivem fora deste repositório: ninguém que mexa aqui vê
 * quebrar do outro lado, e o site nunca falha quando o webhook falha (ver
 * "Modos de falha" em WEBHOOKS_N8N.md). O resultado é que renomear um campo
 * de payload passa em build, lint e teste, e o único sintoma é o consultor
 * parando de receber lead — dias depois, sem erro em lugar nenhum.
 *
 * Estes testes existem para transformar essa mudança silenciosa em falha
 * ruidosa: mexeu no payload, atualiza o documento.
 */

const raiz = join(__dirname, "..");
const doc = readFileSync(join(raiz, "WEBHOOKS_N8N.md"), "utf-8");
const rotaLeads = readFileSync(join(raiz, "src", "app", "api", "leads", "route.ts"), "utf-8");
const rotaAvaliacao = readFileSync(join(raiz, "src", "app", "api", "avaliacao", "route.ts"), "utf-8");
const dispatcher = readFileSync(join(raiz, "src", "lib", "webhook-dispatcher.ts"), "utf-8");

/**
 * Os campos de topo de um literal `const n8nPayload = { ... }`.
 *
 * Aceita as duas formas que o código usa: `telefone: formattedPhone` e a
 * abreviada `remoteJid,`. Só conta o que está na profundidade 1, para não
 * confundir chave de objeto aninhado (`cliente.nome`) com campo de topo.
 */
function camposDoPayload(fonte: string): string[] {
  const inicio = fonte.indexOf("const n8nPayload = {");
  expect(inicio, "literal n8nPayload não encontrado").toBeGreaterThan(-1);

  const linhas = fonte.slice(inicio).split("\n");
  const campos: string[] = [];
  let profundidade = 0;

  for (const linha of linhas) {
    const anterior = profundidade;
    profundidade += (linha.match(/[{[]/g) || []).length;
    profundidade -= (linha.match(/[}\]]/g) || []).length;

    if (anterior === 1) {
      const chave = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*[:,]/);
      if (chave) campos.push(chave[1]);
    }
    if (profundidade === 0 && campos.length > 0) break;
  }
  return campos;
}

describe("Formato A — lead de atendimento", () => {
  const campos = camposDoPayload(rotaLeads);

  it("manda os campos que o documento promete", () => {
    expect(campos).toEqual([
      "remoteJid",
      "telefone",
      "canal",
      "mensagem",
      "tipo",
      "cliente",
      "veiculo",
      "utm",
      "intencao_busca",
      "ag_uid",
      "created_at",
    ]);
  });

  it("todo campo está documentado", () => {
    for (const campo of campos) {
      expect(doc, `campo "${campo}" fora de WEBHOOKS_N8N.md`).toContain(campo);
    }
  });

  it("os três canais de lead saem do mesmo lugar", () => {
    // Se algum dia deixarem de compartilhar o fallback, o documento mente.
    expect(rotaLeads).toContain("webhooks.webhookPropostaUrl?.trim() || webhooks.webhookUrl?.trim()");
    expect(rotaLeads).toContain("webhooks.webhookDuvidasUrl?.trim() || webhooks.webhookUrl?.trim()");
  });

  it("o disparo continua não bloqueando o visitante", () => {
    // A regra que mais importa do lado do n8n: falha de webhook nunca segura
    // o cliente a caminho do WhatsApp. Se isto virar `await` sem try/catch,
    // uma indisponibilidade do n8n vira indisponibilidade da loja.
    const trecho = rotaLeads.slice(
      rotaLeads.indexOf("let webhookStatus = 0;"),
      rotaLeads.indexOf("5.2 Persistência")
    );
    expect(trecho).toContain("try {");
    expect(trecho).toContain("catch (webhookError");
  });
});

describe("Formato B — avaliação", () => {
  const campos = camposDoPayload(rotaAvaliacao);

  it("manda os campos que o documento promete", () => {
    for (const esperado of [
      "remoteJid", "telefone", "marca", "modelo", "ano",
      "estado_mecanico", "estado_conservacao", "quilometragem",
      "nome", "tipo_veiculo", "fipe_valor", "recomendacao", "ag_uid",
    ]) {
      expect(campos, `campo "${esperado}" sumiu do payload`).toContain(esperado);
    }
  });

  it("mantém o UTM plano no topo, como documentado", () => {
    // Diverge do Formato A de propósito — está em produção assim.
    expect(campos).toContain("utm_source");
    expect(doc).toContain("planos no topo");
  });

  it("recalcula a recomendação no servidor", () => {
    // O cliente é público: se a recomendação vier do corpo da requisição,
    // qualquer um dita o preço que o consultor lê.
    expect(rotaAvaliacao).toContain("const recomendacao = recomendarAvaliacao({");
    expect(rotaAvaliacao).not.toMatch(/recomendacao:\s*requestBody\./);
  });
});

describe("Formato C — evento administrativo", () => {
  it("mantém o envelope e o header documentados", () => {
    expect(dispatcher).toContain('"X-Admin-Event": event');
    expect(dispatcher).toContain("event,");
    expect(dispatcher).toContain("timestamp: new Date().toISOString(),");
    expect(dispatcher).toContain("data: enrichedData");
  });

  it("documenta todo prefixo de evento que o dispatcher enriquece", () => {
    const prefixos = [...dispatcher.matchAll(/event\.startsWith\("([a-z_]+)"\)/g)].map((m) => m[1]);
    expect(prefixos.length).toBeGreaterThan(0);
    for (const p of prefixos) {
      expect(doc, `prefixo "${p}" fora de WEBHOOKS_N8N.md`).toContain(`\`${p}\``);
    }
  });

  it("continua sem destino padrão — e o documento avisa", () => {
    // Esta é a armadilha: vazio significa que todo evento administrativo
    // morre num console.info. O teste não conserta, mas impede que o aviso
    // saia do documento sem que alguém perceba.
    expect(dispatcher).toContain("webhooks.webhookNotificacoesUrl || process.env.N8N_ADMIN_WEBHOOK_URL");
    expect(doc).toContain("não tem padrão de código");
  });
});

// O "Formato C — conta_vencida" tinha suíte própria aqui: a rota de
// processamento montava o envelope à mão, fora do dispatcher, e já tinha
// derivado para uma forma própria sem ninguém ver. A rota — e o evento —
// foram aposentados em 2026-08-28 com o módulo de caixa (decisão do dono).
// A lição fica: quando o razão emitir eventos por fora do dispatcher, cada
// origem nova ganha suíte própria aqui.
