import { describe, expect, it } from "vitest";
import { FICHA_VAZIA } from "../src/lib/aquecimento";
import {
  mensagemDeEntrega,
  mensagemDePassagemAoCliente,
  mensagemRepassadaAoVendedor,
  origemLegivel,
} from "../src/lib/resumoParaOVendedor";

/**
 * O resumo que vai ao WhatsApp do vendedor e a frase que o cliente lê na
 * passagem (2026-10-20).
 */

const base = {
  motivo: "quente" as const,
  lead: { nome: "Rafael Lima", telefone: "5541999990000" },
  ficha: { ...FICHA_VAZIA, interesse: "Onix LT 2020", pagamento: "financiado" as const, entrada: "R$ 15 mil", troca: "Uno 2014, 92 mil km", prazo: "este_mes" as const },
  aquecimento: { pontos: 82, temperatura: "quente" as const, motivos: [{ chave: "quer_visitar" as const, pontos: 25, texto: "Quer visitar a loja ou fazer test-drive" }] },
  resumo: "Quer o Onix, financiado, com o Uno na troca.",
  origem: "Anúncio: SUVs",
  linkDoLead: "https://loja.exemplo/admin/leads/abc",
};

describe("o resumo ao vendedor", () => {
  it("o esqueleto do manobrAI, com o que o painel tem a mais", () => {
    const m = mensagemDeEntrega({ ...base, para: "vendedor" });
    expect(m.split("\n")[0]).toBe("🔥 LEAD QUENTE — Rafael Lima");
    expect(m).toContain("📱 (41) 99999-0000 · https://wa.me/5541999990000");
    expect(m).toContain("Procura: Onix LT 2020");
    expect(m).toContain("Pagamento: Financiado · entrada R$ 15 mil");
    expect(m).toContain("Troca: Uno 2014, 92 mil km");
    expect(m).toContain("Prazo: Este mês");
    expect(m).toContain("Aquecimento: 82/100 (Quer visitar a loja ou fazer test-drive)");
    expect(m).toContain("Origem: Anúncio: SUVs");
    expect(m).toContain("Resumo da conversa: Quer o Onix");
    expect(m).toContain("Abrir no painel: https://loja.exemplo/admin/leads/abc");
  });

  it("campo que o cliente não disse não aparece", () => {
    const m = mensagemDeEntrega({ ...base, ficha: { ...FICHA_VAZIA, interesse: "SUV" }, para: "vendedor" });
    expect(m).not.toContain("Pagamento:");
    expect(m).not.toContain("Troca:");
    expect(m).not.toContain("Visita:");
  });

  it("sem dono: vai a quem distribui, pedindo para escolher", () => {
    const m = mensagemDeEntrega({ ...base, motivo: "pediu_humano", para: "distribuir" });
    expect(m.split("\n")[0]).toBe("🙋 PEDIU UM CONSULTOR — Rafael Lima");
    expect(m).toContain("Definir o responsável: https://loja.exemplo/admin/leads/abc");
  });

  it("entregue pelo painel tem cabeçalho próprio", () => {
    expect(mensagemDeEntrega({ ...base, motivo: "painel", para: "vendedor" }).split("\n")[0]).toBe("📋 LEAD ENTREGUE PELO PAINEL — Rafael Lima");
  });
});

describe("a passagem ao cliente", () => {
  it("nomeia quem vai atender e de que número, sem supor gênero", () => {
    const m = mensagemDePassagemAoCliente({ nomeDoCliente: "rafael", vendedor: { nome: "Carla Souza", whatsapp: "5541988887777" }, equipeDisponivel: true });
    expect(m).toBe("Perfeito, Rafael! Vou te passar para Carla, da nossa equipe de consultores, que já vai te chamar pelo WhatsApp (41) 98888-7777.");
    expect(m).not.toMatch(/\b(dele|dela|o consultor|a consultora)\b/);
  });

  it("fora do horário, promete a abertura", () => {
    const m = mensagemDePassagemAoCliente({ nomeDoCliente: null, vendedor: null, equipeDisponivel: false });
    expect(m).toBe("Perfeito! Vou passar seu atendimento para a nossa equipe de consultores, que te chama assim que a loja abrir.");
  });
});

describe("o repasse e a origem", () => {
  it("a mensagem do cliente depois da entrega vai ao vendedor, curta", () => {
    expect(mensagemRepassadaAoVendedor({ nome: "Rafael", texto: "ainda tá disponível?", linkDoLead: null })).toBe(
      '💬 Rafael escreveu no WhatsApp da loja:\n"ainda tá disponível?"',
    );
  });

  it("anúncio de clique para o WhatsApp tem prioridade sobre o canal", () => {
    expect(origemLegivel({ canal: "WhatsApp", origem_conversa: { tipo: "ad", titulo: "SUVs" } })).toBe("Anúncio: SUVs");
    expect(origemLegivel({ canal: "WhatsApp Proposta", utm_source: "google", utm_campaign: "suv" })).toBe("WhatsApp Proposta · google · suv");
    expect(origemLegivel({})).toBeNull();
  });
});
