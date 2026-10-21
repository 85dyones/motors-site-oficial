import { describe, expect, it } from "vitest";
import {
  CADENCIAS_DE_FABRICA,
  MAXIMO_DE_PASSOS,
  cadenciaDoSilencio,
  decidirToque,
  dentroDoExpediente,
  entraNaBase,
  interesseDaCadencia,
  nomeParaTratar,
  podeAvisarAEquipe,
  preencherModelo,
  reguaValida,
  vencimentoDoPasso,
  type LeadNaCadencia,
} from "../src/lib/cadencias";
import { semDisposicao } from "../src/lib/agenteDeAtendimento";

/**
 * As cadências de reaquecimento (2026-10-20): até três toques, no horário da
 * loja, só para quem já falou com a loja, e paradas quando o cliente responde.
 */

// Terça, 20/10/2026, 10h em Curitiba (13h UTC): loja aberta, janela de aviso aberta.
const TERCA_10H = new Date("2026-10-20T13:00:00Z");
// Terça, 19h em Curitiba: loja fechada (fecha 18h30), mas a janela de aviso (até 20h) aberta.
const TERCA_19H = new Date("2026-10-20T22:00:00Z");
// Sábado, 14h: aberta (fecha 15h). Sábado, 16h: fechada.
const SABADO_14H = new Date("2026-10-24T17:00:00Z");
const SABADO_16H = new Date("2026-10-24T19:00:00Z");
// Domingo, 11h: tudo fechado.
const DOMINGO_11H = new Date("2026-10-25T14:00:00Z");

const lead = (parcial: Partial<LeadNaCadencia>): LeadNaCadencia => ({
  cadencia: "follow_up",
  cadencia_passo: 0,
  cadencia_proximo_em: "2026-10-20T12:00:00Z",
  desfecho: null,
  optout_em: null,
  assistente_fase: "qualificando",
  ...parcial,
});

describe("o relógio", () => {
  it("o toque ao cliente segue o horário da loja", () => {
    expect(dentroDoExpediente(TERCA_10H)).toBe(true);
    expect(dentroDoExpediente(TERCA_19H)).toBe(false);
    expect(dentroDoExpediente(SABADO_14H)).toBe(true);
    expect(dentroDoExpediente(SABADO_16H)).toBe(false);
    expect(dentroDoExpediente(DOMINGO_11H)).toBe(false);
  });

  it("o aviso à equipe segue a janela do funil: 8h às 20h, nada aos domingos", () => {
    expect(podeAvisarAEquipe(TERCA_19H)).toBe(true);
    expect(podeAvisarAEquipe(new Date("2026-10-20T23:30:00Z"))).toBe(false); // 20h30
    expect(podeAvisarAEquipe(new Date("2026-10-20T10:30:00Z"))).toBe(false); // 7h30
    expect(podeAvisarAEquipe(DOMINGO_11H)).toBe(false);
  });
});

describe("quem recebe um toque agora", () => {
  it("o toque vencido, no horário, sai com a definição do passo", () => {
    const d = decidirToque(lead({}), TERCA_10H, CADENCIAS_DE_FABRICA);
    expect(d).toEqual({ tocar: true, cadencia: "follow_up", passo: 0, definicao: CADENCIAS_DE_FABRICA.follow_up.passos[0] });
  });

  it.each([
    ["sem cadência", { cadencia: null }, "sem_cadencia"],
    ["encerrado", { desfecho: "ganho" }, "encerrado"],
    ["opt-out", { optout_em: "2026-10-19T10:00:00Z" }, "optout"],
    ["com o vendedor", { assistente_fase: "entregue" }, "com_o_vendedor"],
    ["pausado", { assistente_fase: "pausado" }, "pausado"],
    ["concluída", { cadencia_passo: 3 }, "cadencia_concluida"],
    ["ainda não venceu", { cadencia_proximo_em: "2026-10-21T12:00:00Z" }, "ainda_nao"],
  ] as const)("%s não toca", (_r, parcial, motivo) => {
    expect(decidirToque(lead(parcial as Partial<LeadNaCadencia>), TERCA_10H, CADENCIAS_DE_FABRICA)).toEqual({ tocar: false, motivo });
  });

  it("fora do horário espera — e o motivo diz que é horário, não fim", () => {
    expect(decidirToque(lead({}), DOMINGO_11H, CADENCIAS_DE_FABRICA)).toEqual({ tocar: false, motivo: "fora_do_expediente" });
  });

  it("cadência desligada na configuração não toca", () => {
    const regua = reguaValida({ follow_up: { ativa: false } });
    expect(decidirToque(lead({}), TERCA_10H, regua)).toEqual({ tocar: false, motivo: "cadencia_desligada" });
  });

  it("o engajamento do lead devolvido toca na fase 'reaquecendo'", () => {
    const d = decidirToque(lead({ cadencia: "engajamento", assistente_fase: "reaquecendo" }), TERCA_10H, CADENCIAS_DE_FABRICA);
    expect(d.tocar).toBe(true);
  });
});

describe("o calendário dos passos", () => {
  it("cada passo vence a partir do anterior; depois do último, nada", () => {
    expect(vencimentoDoPasso(CADENCIAS_DE_FABRICA, "follow_up", 0, TERCA_10H)).toBe("2026-10-21T09:00:00.000Z");
    expect(vencimentoDoPasso(CADENCIAS_DE_FABRICA, "follow_up", 3, TERCA_10H)).toBeNull();
  });

  it("silêncio com carro de interesse é follow-up; sem, reativação", () => {
    expect(cadenciaDoSilencio(true)).toBe("follow_up");
    expect(cadenciaDoSilencio(false)).toBe("reativacao");
  });

  it("o carro da cadência: o da conversa, ou o do formulário — nunca a inscrição do repasse", () => {
    expect(interesseDaCadencia({ canal: "WhatsApp", interesse: "Onix LT 2020" }, "Titano Volcano")).toBe("Titano Volcano");
    expect(interesseDaCadencia({ canal: "WhatsApp Proposta", interesse: " Onix LT 2020 " }, null)).toBe("Onix LT 2020");
    expect(interesseDaCadencia({ canal: "repasse-lojista", interesse: "Entrou na lista do repasse (lojista)." }, null)).toBeNull();
    expect(interesseDaCadencia({ canal: "WhatsApp", interesse: "  " }, "")).toBeNull();
  });

  it("a base parada: as etapas de antes da visita (Novo, 1º Contato, Recontato), e nunca o repasse", () => {
    expect(entraNaBase({ canal: "WhatsApp", situacao: "novo" })).toBe(true);
    expect(entraNaBase({ canal: null, situacao: "em_contato" })).toBe(true);
    // "Recontato" na tela da loja é a chave `proposta`.
    expect(entraNaBase({ canal: "WhatsApp Proposta", situacao: "proposta" })).toBe(true);
    // Visita agendada, negociação, o pós-venda que a loja criou.
    for (const situacao of ["visita", "negociacao", "nova_etapa_n9vi", null]) expect(entraNaBase({ canal: "WhatsApp", situacao }), String(situacao)).toBe(false);
    for (const canal of ["repasse", "repasse-lojista", "repasse-exame", "repasse-whatsapp"]) expect(entraNaBase({ canal, situacao: "novo" }), canal).toBe(false);
  });

  it("de fábrica, todas têm no máximo três toques (a régua do manobrAI)", () => {
    for (const c of Object.values(CADENCIAS_DE_FABRICA)) expect(c.passos.length).toBeLessThanOrEqual(MAXIMO_DE_PASSOS);
  });
});

describe("a régua lida do banco", () => {
  it("passo inválido sai; cadência sem passo válido fica com os de fábrica; nunca mais de três", () => {
    const r = reguaValida({
      follow_up: { passos: [{ apos_horas: 0, modelo: "x" }, { apos_horas: 5, modelo: "oi {nome}" }] },
      reativacao: { passos: [{ apos_horas: 2 }] },
      engajamento: { passos: Array.from({ length: 6 }, () => ({ apos_horas: 10, modelo: "a" })) },
    });
    expect(r.follow_up.passos).toEqual([{ apos_horas: 5, objetivo: "", modelo: "oi {nome}" }]);
    expect(r.reativacao.passos).toEqual(CADENCIAS_DE_FABRICA.reativacao.passos);
    expect(r.engajamento.passos).toHaveLength(3);
  });

  it("sem linha, a de fábrica — e uma cópia, não a referência", () => {
    const r = reguaValida(null);
    r.follow_up.ativa = false;
    expect(CADENCIAS_DE_FABRICA.follow_up.ativa).toBe(true);
  });
});

describe("o texto do toque", () => {
  it("preenche nome e interesse", () => {
    expect(preencherModelo("Oi, {nome}! Ainda quer o {interesse}?", { nome: "maria souza", interesse: "Onix 2020" })).toBe(
      "Oi, Maria! Ainda quer o Onix 2020?",
    );
  });

  it("sem nome que pareça nome, a vírgula sai junto", () => {
    expect(preencherModelo("Oi, {nome}! Tudo bem?", { nome: "WhatsApp 1234" })).toBe("Oi! Tudo bem?");
    expect(preencherModelo("{nome}, posso ajudar?", { nome: "🚗🚗" })).toBe("Posso ajudar?");
  });

  it("sem interesse, uma frase que ainda faz sentido", () => {
    expect(preencherModelo("Ainda quer o {interesse}?", {})).toBe("Ainda quer o carro que você procurava?");
  });

  // O dono, no primeiro teste em produção (21/10/2026): "a Titano, a Saveiro, o Onix".
  it("o artigo colado no interesse concorda com o carro", () => {
    expect(preencherModelo("Ainda tem interesse no {interesse}?", { interesse: "Titano Volcano 2025" })).toBe(
      "Ainda tem interesse na Titano Volcano 2025?",
    );
    expect(preencherModelo("O {interesse} ainda faz sentido?", { interesse: "Fiat Strada 2023" })).toBe("A Fiat Strada 2023 ainda faz sentido?");
    expect(preencherModelo("Parecido com o {interesse}, e voltando ao {interesse}", { interesse: "Saveiro Cross" })).toBe(
      "Parecido com a Saveiro Cross, e voltando à Saveiro Cross",
    );
    expect(preencherModelo("Ainda tem interesse no {interesse}?", { interesse: "Onix Hatch 2025; também a Spin" })).toBe(
      "Ainda tem interesse no Onix Hatch 2025; também a Spin?",
    );
    // Só o artigo solto muda: "Bom" termina em "om", não é "um".
    expect(preencherModelo("Bom {interesse}!", { interesse: "Toro" })).toBe("Bom Toro!");
  });

  it("nenhum texto de fábrica larga a conversa (\"fico à disposição\", \"é só chamar\") — o dono vetou", () => {
    for (const [nome, cadencia] of Object.entries(CADENCIAS_DE_FABRICA)) {
      for (const passo of cadencia.passos) {
        const texto = preencherModelo(passo.modelo, { nome: "Maria", interesse: "Onix 2020" });
        expect(semDisposicao(texto), `${nome}: ${passo.modelo}`).toBe(texto);
      }
      expect(cadencia.passos.at(-1)!.modelo.trim().endsWith("?"), `${nome} termina numa pergunta`).toBe(true);
    }
  });

  it("nome para tratar: apelido estranho e o rótulo do lead sem nome ficam de fora", () => {
    expect(nomeParaTratar("joão pedro")).toBe("João");
    expect(nomeParaTratar("WhatsApp 0000")).toBe("");
    expect(nomeParaTratar("Loja123")).toBe("");
  });
});
