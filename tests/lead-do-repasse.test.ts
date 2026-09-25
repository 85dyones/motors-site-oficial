import { describe, it, expect } from "vitest";
import { cnpjValido, formatarCnpj } from "../src/lib/cnpj";
import { termosProibidosEm } from "../src/lib/checklistDoRepasse";
import {
  CANAL_DA_LISTA,
  CANAL_DA_LISTA_LOJISTA,
  CANAL_DO_EXAME,
  MENSAGEM_DA_INSCRICAO,
  decidirInscricao,
  decidirLeadDoRepasse,
  ehCanalDoRepasse,
  mensagemDeErroDaRota,
  mensagemDoExame,
  montarLeadDaLista,
  montarLeadDoExame,
  type InscricaoNaLista,
} from "../src/lib/leadDoRepasse";
import { ERROS_DO_REPASSE } from "../src/lib/paginaDoRepasse";
import type { UtmParameters } from "../src/lib/telemetry";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * O lead do repasse sem rota e sem DOM (spec §8): o corpo que os formulários
 * montam, a régua que a rota aplica antes de gravar, e o que vira linha em
 * `repasse_inscritos`. Molde de `tests/encomenda-grava-e-dispara.test.ts`.
 */
const QUARTA_MEIO_DIA = new Date("2026-09-23T15:00:00Z");
const SEM_UTM: UtmParameters = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  utm_term: null,
  gclid: null,
  gbraid: null,
  wbraid: null,
  fbclid: null,
};
const EXTRAS = {
  agUid: "ag-1",
  eventId: "evt-1",
  turnstileToken: "tok",
  utm: SEM_UTM,
  eventSourceUrl: "https://exemplo.test/repasse",
  fbp: null,
  fbc: null,
};
const CARRO = repasseDeTeste({ situacao: "publicado", lojistas_desde: "2026-09-22T12:00:00Z" });

const lista = (parcial: Partial<Parameters<typeof montarLeadDaLista>[0]> = {}) =>
  montarLeadDaLista(
    {
      trilha: "consumidor",
      nome: " Ana Souza ",
      whatsapp: "(41) 99737-2165",
      faixa: "30-50",
      carrocerias: ["hatch"],
      cnpj: "",
      lojaCidade: "",
      caminho: "/repasse",
      ...parcial,
    },
    EXTRAS,
  );
const lojista = (cnpj = "11.222.333/0001-81") =>
  lista({ trilha: "lojista", faixa: null, carrocerias: [], cnpj, lojaCidade: "Loja Exemplo, Curitiba" });
const exame = (parcial: Partial<Parameters<typeof montarLeadDoExame>[1]> = {}) =>
  montarLeadDoExame(
    CARRO,
    { nome: "Ana Souza", whatsapp: "(41) 99737-2165", dia: "2026-09-26", turno: "tarde", levaMecanico: true, ...parcial },
    EXTRAS,
  );
const comRepasse = (corpo: ReturnType<typeof lista>, repasse: Record<string, unknown>) => ({
  ...corpo,
  intencao_busca: { repasse: { ...corpo.intencao_busca.repasse, ...repasse } },
});

describe("CNPJ", () => {
  it("confere os dígitos verificadores", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
    expect(cnpjValido("1122233300018")).toBe(false);
  });

  it("todos iguais não é CNPJ, mesmo quando o verificador fecha", () => {
    // 00000000000000 fecha no módulo 11 — é o caso que só a regra explícita pega.
    expect(cnpjValido("00.000.000/0000-00")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
  });

  it("aceita o alfanumérico (Receita, julho de 2026)", () => {
    expect(cnpjValido("12.ABC.345/01DE-35")).toBe(true);
    expect(cnpjValido("12.abc.345/01de-35")).toBe(true);
    expect(cnpjValido("12.ABC.345/01DE-36")).toBe(false);
  });

  it("formata e não inventa formato para o que não tem 14 posições", () => {
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarCnpj(" 12abc34501de35 ")).toBe("12.ABC.345/01DE-35");
    expect(formatarCnpj("123")).toBe("123");
  });
});

describe("o corpo que o formulário monta", () => {
  it("lista para usar: canal, formulário e intenção estruturada", () => {
    const corpo = lista();
    expect(corpo.canal).toBe(CANAL_DA_LISTA);
    expect(corpo.tipo).toBe("lead_repasse");
    expect(corpo.cliente).toEqual({ nome: "Ana Souza", whatsapp: "(41) 99737-2165" });
    expect(corpo.intencao_busca.repasse).toEqual({
      tipo: "lista",
      trilha: "consumidor",
      faixa: "30-50",
      carrocerias: ["hatch"],
      caminho: "/repasse",
    });
    expect(corpo.turnstileToken).toBe("tok");
  });

  it("a mensagem do lead não leva CNPJ, faixa nem tipo de carro", () => {
    // `leads` é lida por toda a equipe; o perfil da lista fica só em
    // `repasse_inscritos`, que só quem valida lê.
    for (const corpo of [lista(), lojista()]) {
      expect(corpo.mensagem).not.toMatch(/11\.222|R\$|hatch|Loja Exemplo/i);
    }
    expect(lista().mensagem).toBe(MENSAGEM_DA_INSCRICAO.consumidor);
    expect(lojista().mensagem).toBe(MENSAGEM_DA_INSCRICAO.lojista);
  });

  it("o exame não manda `veiculo`: o id do repasse não pode virar content_id nem veiculo_id", () => {
    const corpo = exame();
    expect(corpo).not.toHaveProperty("veiculo");
    expect(corpo.canal).toBe(CANAL_DO_EXAME);
    expect(corpo.intencao_busca.repasse).toEqual({
      tipo: "exame",
      repasse_id: CARRO.id,
      slug: CARRO.slug,
      dia: "2026-09-26",
      turno: "tarde",
      leva_mecanico: true,
    });
    expect(corpo.contentName).toBe("Renault Kwid");
  });

  it("a mensagem do exame diz o carro, o dia, o turno e o mecânico", () => {
    expect(mensagemDoExame(CARRO, { dia: "2026-09-26", turno: "tarde", levaMecanico: true })).toBe(
      "Quero marcar o exame no pátio do Renault Kwid Zen 1.0 2021: Sáb 26/09, tarde. Vou levar o meu mecânico.",
    );
    expect(mensagemDoExame(CARRO, { dia: "2026-09-24", turno: "manha", levaMecanico: false })).toBe(
      "Quero marcar o exame no pátio do Renault Kwid Zen 1.0 2021: Qui 24/09, manhã.",
    );
  });

  it("nenhuma mensagem usa termo que o repasse não usa", () => {
    const mensagens = [
      ...Object.values(MENSAGEM_DA_INSCRICAO),
      mensagemDoExame(CARRO, { dia: "2026-09-26", turno: "tarde", levaMecanico: true }),
    ];
    for (const m of mensagens) expect(termosProibidosEm(m), m).toEqual([]);
  });
});

describe("a régua da rota", () => {
  it("o canal do repasse é o que começa com repasse", () => {
    expect(ehCanalDoRepasse("repasse")).toBe(true);
    expect(ehCanalDoRepasse("repasse-exame")).toBe(true);
    expect(ehCanalDoRepasse("Encomenda")).toBe(false);
    expect(ehCanalDoRepasse(undefined)).toBe(false);
  });

  it("o que o formulário monta, a rota aceita — nas três formas", () => {
    const consumidor = decidirLeadDoRepasse(lista(), QUARTA_MEIO_DIA);
    expect(consumidor).toEqual({
      ok: true,
      pedido: {
        tipo: "lista",
        inscricao: {
          trilha: "consumidor",
          nome: "Ana Souza",
          whatsapp: "5541997372165",
          faixa: "30-50",
          carrocerias: ["hatch"],
          cnpj: null,
          loja_cidade: null,
        },
      },
    });
    const loja = decidirLeadDoRepasse(lojista("11222333000181"), QUARTA_MEIO_DIA);
    expect(loja).toMatchObject({
      ok: true,
      pedido: { tipo: "lista", inscricao: { trilha: "lojista", cnpj: "11.222.333/0001-81", loja_cidade: "Loja Exemplo, Curitiba", faixa: null, carrocerias: [] } },
    });
    expect(decidirLeadDoRepasse(exame(), QUARTA_MEIO_DIA)).toEqual({
      ok: true,
      pedido: { tipo: "exame", exame: { repasseId: CARRO.id, dia: "2026-09-26", turno: "tarde", levaMecanico: true } },
    });
  });

  it("carroceria repetida entra uma vez; tanto faz é lista vazia", () => {
    const d = decidirLeadDoRepasse(lista({ carrocerias: ["hatch", "suv", "hatch"] }), QUARTA_MEIO_DIA);
    expect(d.ok && d.pedido.tipo === "lista" && d.pedido.inscricao.carrocerias).toEqual(["hatch", "suv"]);
    const tantoFaz = decidirLeadDoRepasse(lista({ carrocerias: [] }), QUARTA_MEIO_DIA);
    expect(tantoFaz.ok && tantoFaz.pedido.tipo === "lista" && tantoFaz.pedido.inscricao.carrocerias).toEqual([]);
  });

  it.each([
    ["canal desconhecido", { ...lista(), canal: "repasse-xyz" }, ERROS_DO_REPASSE.canal],
    ["sem nome", { ...lista(), cliente: { nome: "  ", whatsapp: "(41) 99737-2165" } }, ERROS_DO_REPASSE.nome],
    ["WhatsApp sem DDD", { ...lista(), cliente: { nome: "Ana", whatsapp: "99737-2165" } }, ERROS_DO_REPASSE.whatsapp],
    ["faixa fora da lista", comRepasse(lista(), { faixa: "ate-100" }), ERROS_DO_REPASSE.faixa],
    ["carroceria fora da lista", comRepasse(lista(), { carrocerias: ["hatch", "conversivel"] }), ERROS_DO_REPASSE.carroceria],
    ["carrocerias que não são lista", comRepasse(lista(), { carrocerias: "hatch" }), ERROS_DO_REPASSE.carroceria],
    ["trilha trocada no canal", comRepasse(lista(), { trilha: "lojista" }), ERROS_DO_REPASSE.canal],
    ["CNPJ que não fecha", lojista("11.222.333/0001-82"), ERROS_DO_REPASSE.cnpj],
    ["lojista sem loja", comRepasse(lojista(), { loja_cidade: " " }), ERROS_DO_REPASSE.loja],
  ])("lista: %s → recusa com a mensagem certa", (_caso, corpo, erro) => {
    expect(decidirLeadDoRepasse(corpo, QUARTA_MEIO_DIA)).toEqual({ ok: false, erro });
  });

  it.each([
    ["id que não é uuid", { repasse_id: "123" }, ERROS_DO_REPASSE.carro],
    ["domingo", { dia: "2026-09-27" }, ERROS_DO_REPASSE.dia],
    ["depois da janela", { dia: "2026-09-28" }, ERROS_DO_REPASSE.dia],
    ["turno que não existe", { turno: "noite" }, ERROS_DO_REPASSE.turno],
  ])("exame: %s → recusa com a mensagem certa", (_caso, repasse, erro) => {
    const corpo = exame();
    const torto = { ...corpo, intencao_busca: { repasse: { ...corpo.intencao_busca.repasse, ...repasse } } };
    expect(decidirLeadDoRepasse(torto, QUARTA_MEIO_DIA)).toEqual({ ok: false, erro });
  });

  it("corpo que não é objeto não quebra", () => {
    for (const corpo of [null, undefined, "x", 42, []]) {
      expect(decidirLeadDoRepasse(corpo, QUARTA_MEIO_DIA)).toEqual({ ok: false, erro: ERROS_DO_REPASSE.canal });
    }
  });
});

describe("a inscrição: insere ou atualiza", () => {
  const NOVA: InscricaoNaLista = {
    trilha: "lojista",
    nome: "Auto Bom",
    whatsapp: "5541999990000",
    faixa: null,
    carrocerias: [],
    cnpj: "11.222.333/0001-81",
    loja_cidade: "Auto Bom, Curitiba",
  };

  it("sem linha: insere tudo, com o elo do lead", () => {
    expect(decidirInscricao(null, NOVA, "lead-1")).toEqual({ operacao: "insert", linha: { ...NOVA, lead_id: "lead-1" } });
  });

  it("mesmo CNPJ, com ou sem máscara: atualiza e a conferência fica", () => {
    const escrita = decidirInscricao({ id: "i-1", cnpj: "11222333000181" }, NOVA, "lead-2");
    expect(escrita).toEqual({
      operacao: "update",
      id: "i-1",
      colunas: {
        nome: "Auto Bom",
        faixa: null,
        carrocerias: [],
        cnpj: "11.222.333/0001-81",
        loja_cidade: "Auto Bom, Curitiba",
        lead_id: "lead-2",
      },
    });
  });

  it("CNPJ trocado: a conferência volta a zero", () => {
    const escrita = decidirInscricao({ id: "i-1", cnpj: "12.ABC.345/01DE-35" }, NOVA, "lead-2");
    expect(escrita.operacao === "update" && escrita.colunas).toMatchObject({
      cnpj_conferido_em: null,
      cnpj_conferido_por: null,
    });
  });

  it("lead que não gravou não apaga o elo antigo", () => {
    const escrita = decidirInscricao({ id: "i-1", cnpj: "11.222.333/0001-81" }, NOVA, null);
    expect(escrita.operacao === "update" && escrita.colunas).not.toHaveProperty("lead_id");
  });
});

describe("o erro que o formulário mostra", () => {
  it("só texto nosso; o resto vira a mensagem genérica", () => {
    expect(mensagemDeErroDaRota({ error: ERROS_DO_REPASSE.cnpj })).toBe(ERROS_DO_REPASSE.cnpj);
    expect(mensagemDeErroDaRota({ error: ERROS_DO_REPASSE.lista })).toBe(ERROS_DO_REPASSE.lista);
    expect(mensagemDeErroDaRota({ error: "Erro interno no servidor ao processar o lead." })).toBe(
      ERROS_DO_REPASSE.generico,
    );
    expect(mensagemDeErroDaRota(null)).toBe(ERROS_DO_REPASSE.generico);
  });
});
