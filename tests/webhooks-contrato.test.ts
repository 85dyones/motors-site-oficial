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
const rotaVencidas = readFileSync(
  join(raiz, "src", "app", "api", "financeiro", "notificacoes", "processar", "route.ts"),
  "utf-8"
);

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

/**
 * O Formato C tem duas origens, e só uma passava por aqui.
 *
 * `conta_vencida` não sai do dispatcher: quem monta o envelope é a rota de
 * processamento, à mão. Foi exatamente essa a brecha — enquanto o teste olhava
 * só para o dispatcher, a rota derivou para uma forma própria sem `event` nem
 * `data`, e o único consumidor rejeitou calado por meses.
 */
describe("Formato C — conta_vencida, a origem que não é o dispatcher", () => {
  /**
   * Só o corpo do POST. `mensagem` segue existindo na rota — vai para o insert
   * em `notificacoes_financeiras`, que é registro interno. O que não pode
   * voltar é ela no payload: quem formata WhatsApp é o n8n.
   */
  const corpoDoWebhook = (() => {
    const inicio = rotaVencidas.indexOf("const webhookRes = await fetch(webhookUrl");
    const fim = rotaVencidas.indexOf("if (!webhookRes.ok)");
    expect(inicio, "chamada do webhook não encontrada").toBeGreaterThan(-1);
    expect(fim, "checagem de resposta não encontrada").toBeGreaterThan(inicio);
    return rotaVencidas.slice(inicio, fim);
  })();

  it("usa o envelope do Formato C, não a forma antiga", () => {
    expect(rotaVencidas).toContain('event: "conta_vencida"');
    expect(rotaVencidas).toContain("timestamp: new Date().toISOString(),");
    expect(rotaVencidas).toContain('"X-Admin-Event": "conta_vencida"');

    // A forma antiga: sem `event`, sem `data`. O nó de tratamento do n8n
    // rejeita com "Payload inválido".
    expect(corpoDoWebhook).not.toContain('tipo: "notificacao_financeira"');
    expect(corpoDoWebhook).not.toContain("mensagem:");
  });

  it("manda os três campos de vencimento, e o documento os descreve", () => {
    for (const campo of ["subtipo", "dias_atraso", "dias_para_vencer"]) {
      expect(corpoDoWebhook, `campo "${campo}" sumiu do payload`).toContain(`${campo}:`);
      expect(doc, `campo "${campo}" fora de WEBHOOKS_N8N.md`).toContain(`\`${campo}\``);
    }
  });

  it("resolve o token como o dispatcher e nunca manda Bearer vazio", () => {
    // `Bearer ` com token vazio é pior que header nenhum: com autenticação
    // ligada no n8n vira 403, e esta rota engole o erro.
    expect(rotaVencidas).toContain("webhookSettings?.data?.apiSecretToken || process.env.N8N_SECRET_TOKEN");
    expect(rotaVencidas).toContain("...(secretToken ? {");
    expect(rotaVencidas).not.toMatch(/Bearer \$\{process\.env\.N8N_SECRET_TOKEN \|\| ""\}/);
  });

  it("reclama alto quando o webhook recusa", () => {
    // O registro em `notificacoes_financeiras` só é gravado quando responde ok.
    // Sem o aviso, uma recusa persistente é invisível: a rota devolve success
    // com notifiedCount 0 e reprocessa as mesmas contas para sempre.
    expect(rotaVencidas).toContain("if (!webhookRes.ok)");
    expect(rotaVencidas).toContain("console.warn(");
  });
});
