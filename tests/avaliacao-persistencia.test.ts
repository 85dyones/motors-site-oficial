import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pedido de avaliação também precisa sobreviver ao n8n.
 *
 * `/api/leads` grava o lead no Supabase desde 2026-08-07 e é por isso que o
 * kanban tem dados. `/api/avaliacao` nunca gravou: o pedido vivia só no
 * webhook, que aponta para um workflow parado. Todo pedido de avaliação
 * estava sendo perdido — mesma classe do bug do `event_id`, achado depois.
 *
 * E o disparo do webhook aqui não estava protegido, ao contrário do de
 * leads: n8n fora do ar derrubava o formulário de avaliação para o cliente.
 */

const rota = readFileSync(
  join(__dirname, "..", "src", "app", "api", "avaliacao", "route.ts"),
  "utf-8"
);
const rotaLeads = readFileSync(
  join(__dirname, "..", "src", "app", "api", "leads", "route.ts"),
  "utf-8"
);

describe("gravação do pedido de avaliação", () => {
  it("grava na tabela leads", () => {
    expect(rota).toContain('from("leads").insert(');
  });

  it("usa a chave de serviço, como a rota de leads", () => {
    // Não há policy de INSERT para anônimo, de propósito.
    expect(rota).toContain("createAdminSupabaseClient()");
  });

  it("marca o canal como Avaliação", () => {
    // É o que distingue no kanban quem quer VENDER de quem quer comprar.
    expect(rota).toContain('canal: "Avaliação"');
  });

  it("preenche event_id, que é not null herdado da tabela antiga", () => {
    // Ver a migração 20260811130000: a coluna deixou de travar o insert, mas
    // preenchê-la permite cruzar o lead com as colunas capi_meta_*.
    expect(rota).toContain("event_id: requestBody.eventId || null");
  });

  it("não bloqueia o cliente se a gravação falhar", () => {
    const bloco = rota.slice(rota.indexOf("6.5 Persistência"), rota.indexOf("7. Load webhook"));
    expect(bloco).toContain("try {");
    expect(bloco).toContain("catch");
    expect(bloco).toContain("não bloqueante");
  });
});

describe("disparo do webhook de avaliação", () => {
  it("está protegido por try/catch", () => {
    // Sem isto, n8n fora do ar vira erro no formulário do cliente. A rota de
    // leads sempre teve essa proteção; esta não tinha.
    const bloco = rota.slice(rota.indexOf("8. Send POST request"), rota.indexOf("9. Invoke Telemetry"));
    expect(bloco).toContain("try {");
    expect(bloco).toContain("catch");
  });

  it("a telemetria aguenta o webhook não ter respondido", () => {
    expect(rota).toContain("response?.status ?? 0");
  });

  it("segue a mesma regra da rota de leads", () => {
    // As duas rotas capturam lead; divergir na regra de bloqueio é como uma
    // delas volta a derrubar o formulário sem ninguém notar.
    const leads = rotaLeads.slice(rotaLeads.indexOf("let webhookStatus = 0;"), rotaLeads.indexOf("5.2 Persistência"));
    expect(leads).toContain("catch (webhookError");
    expect(rota).toContain("catch (erroWebhook");
  });
});
