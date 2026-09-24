import { describe, it, expect } from "vitest";
import {
  decidirAviso,
  decidirMarcacaoDeInscrito,
  inscritoDaLinha,
  inscritosQueCombinam,
  mensagemDeAvisoDoRepasse,
  type InscritoDoRepasse,
} from "../src/lib/avisosDoRepasse";
import { termosProibidosEm } from "../src/lib/checklistDoRepasse";
import { repasseDeTeste } from "./repasseDeTeste";

const ISO = "2026-09-24T12:00:00.000Z";

function inscrito(parcial: Partial<InscritoDoRepasse>): InscritoDoRepasse {
  return {
    id: "i-1",
    trilha: "consumidor",
    nome: "Ana Souza",
    whatsapp: "41999990000",
    faixa: "30-50",
    carrocerias: [],
    cnpj: null,
    loja_cidade: null,
    cnpj_conferido_em: null,
    created_at: "2026-09-20T12:00:00Z",
    ...parcial,
  };
}

const LOJISTA_CONFERIDO = inscrito({ id: "l-1", trilha: "lojista", nome: "Auto Bom", faixa: null, cnpj: "12345678000190", loja_cidade: "Auto Bom, Curitiba", cnpj_conferido_em: ISO });
const LOJISTA_SEM_CONFERIR = inscrito({ id: "l-2", trilha: "lojista", nome: "Carros Já", faixa: null, cnpj: "98765432000110" });
const NA_FAIXA = inscrito({ id: "c-1", faixa: "30-50", carrocerias: ["hatch"] });
const FORA_DA_FAIXA = inscrito({ id: "c-2", faixa: "acima-80" });
const OUTRA_CARROCERIA = inscrito({ id: "c-3", faixa: "30-50", carrocerias: ["suv"] });
const SEM_PREFERENCIA = inscrito({ id: "c-4", faixa: null, carrocerias: [] });
const TODOS = [LOJISTA_CONFERIDO, LOJISTA_SEM_CONFERIR, NA_FAIXA, FORA_DA_FAIXA, OUTRA_CARROCERIA, SEM_PREFERENCIA];

// O Kwid de teste: R$ 36.900, hatch.
const SO_LOJISTAS = repasseDeTeste({ situacao: "publicado", lojistas_desde: ISO });
const ABERTO = repasseDeTeste({ situacao: "publicado", lojistas_desde: ISO, aberto_ao_publico_em: ISO });
const ids = (r: typeof SO_LOJISTAS, avisados: string[] = []) =>
  inscritosQueCombinam(r, TODOS, new Set(avisados)).combinam.map((c) => c.inscrito.id);

describe("quem combina", () => {
  it("só lojistas: só o lojista com CNPJ conferido", () => {
    expect(ids(SO_LOJISTAS)).toEqual(["l-1"]);
    expect(inscritosQueCombinam(SO_LOJISTAS, TODOS, new Set()).lojistasSemConferencia).toBe(1);
  });

  it("aberto a todos: o lojista conferido e quem casa faixa e carroceria", () => {
    expect(ids(ABERTO)).toEqual(["l-1", "c-1", "c-4"]);
  });

  it("quem já foi avisado vai para o fim, marcado", () => {
    const { combinam } = inscritosQueCombinam(ABERTO, TODOS, new Set(["l-1"]));
    expect(combinam.map((c) => [c.inscrito.id, c.avisado])).toEqual([
      ["c-1", false],
      ["c-4", false],
      ["l-1", true],
    ]);
  });

  it("carro que não está publicado não tem quem avisar", () => {
    expect(ids(repasseDeTeste({ situacao: "reservado", lojistas_desde: ISO, reservado_em: ISO }))).toEqual([]);
    expect(ids(repasseDeTeste({ situacao: "rascunho" }))).toEqual([]);
  });
});

describe("a mensagem", () => {
  const url = "https://motorsstore.com.br/repasse/renault-kwid-zen-1-0-2021-3f9a1c";

  it("não usa termo que o repasse não usa, nas duas trilhas e nos três laudos", () => {
    for (const laudo of ["aprovado", "aprovado_com_apontamento", "nao_feito"] as const) {
      for (const trilha of ["consumidor", "lojista"] as const) {
        const r = repasseDeTeste({ laudo, laudo_apontamento: laudo === "aprovado_com_apontamento" ? "Folga na suspensão" : null });
        const texto = mensagemDeAvisoDoRepasse(r, { nome: "Ana Souza", trilha }, url);
        expect(termosProibidosEm(texto), `${trilha}/${laudo}`).toEqual([]);
      }
    }
  });

  it("traz o carro, a conta, a ficha e as condições", () => {
    const texto = mensagemDeAvisoDoRepasse(repasseDeTeste(), { nome: "Ana Souza", trilha: "consumidor" }, url);
    expect(texto).toContain("Olá, Ana!");
    expect(texto).toContain("Renault Kwid Zen 1.0 2021");
    expect(texto).toContain("71.200 km");
    expect(texto).toContain("36.900");
    expect(texto).toContain("2.020"); // reparo orçado: 1.400 + 620
    expect(texto).toContain("38.920"); // você gasta
    expect(texto).toContain(url);
    expect(texto).toContain("só à vista");
  });

  it("laudo feito sai a pedido", () => {
    const texto = mensagemDeAvisoDoRepasse(repasseDeTeste({ laudo: "aprovado" }), { nome: "Ana", trilha: "consumidor" }, url);
    expect(texto).toContain("O laudo cautelar sai a pedido");
    const semLaudo = mensagemDeAvisoDoRepasse(repasseDeTeste({ laudo: "nao_feito" }), { nome: "Ana", trilha: "consumidor" }, url);
    expect(semLaudo).not.toContain("laudo cautelar sai");
  });

  it("lojista recebe o aviso de antes do site", () => {
    const texto = mensagemDeAvisoDoRepasse(repasseDeTeste(), { nome: "Auto Bom", trilha: "lojista" }, url);
    expect(texto).toContain("antes do site");
  });

  it("acima da FIPE, a mensagem não fala em diferença", () => {
    const caro = repasseDeTeste({ preco: 45000 });
    expect(mensagemDeAvisoDoRepasse(caro, { nome: "Ana", trilha: "consumidor" }, url)).not.toContain("abaixo");
  });
});

describe("inscritoDaLinha", () => {
  it("lê a linha do banco e recusa a malformada", () => {
    expect(inscritoDaLinha({ ...NA_FAIXA })).toEqual(NA_FAIXA);
    expect(inscritoDaLinha({ ...NA_FAIXA, trilha: "outra" })).toBeNull();
    expect(inscritoDaLinha({ ...NA_FAIXA, nome: "" })).toBeNull();
  });
});

describe("portões da lista", () => {
  it("só quem valida marca aviso, e só de carro publicado", () => {
    expect(decidirAviso({ repasse: ABERTO, inscrito: NA_FAIXA, perfis: ["marketing"] })).toMatchObject({ ok: false, status: 403 });
    expect(decidirAviso({ repasse: repasseDeTeste(), inscrito: NA_FAIXA, perfis: ["comercial"] })).toMatchObject({ ok: false, status: 409 });
    expect(decidirAviso({ repasse: ABERTO, inscrito: null, perfis: ["comercial"] })).toMatchObject({ ok: false, status: 404 });
    expect(decidirAviso({ repasse: ABERTO, inscrito: NA_FAIXA, perfis: ["comercial"] })).toEqual({ ok: true });
  });

  it("CNPJ conferido: só lojista, só quem valida, e desmarca", () => {
    const agora = new Date(ISO);
    const marcar = (i: InscritoDoRepasse, corpo: unknown, perfis: ["comercial"] | ["marketing"] = ["comercial"]) =>
      decidirMarcacaoDeInscrito({ inscrito: i, corpo, perfis, autorId: "u-1", agora });
    expect(marcar(LOJISTA_SEM_CONFERIR, { cnpj_conferido: true })).toEqual({
      ok: true,
      colunas: { cnpj_conferido_em: ISO, cnpj_conferido_por: "u-1" },
    });
    expect(marcar(LOJISTA_CONFERIDO, { cnpj_conferido: false })).toEqual({
      ok: true,
      colunas: { cnpj_conferido_em: null, cnpj_conferido_por: null },
    });
    expect(marcar(NA_FAIXA, { cnpj_conferido: true })).toMatchObject({ ok: false, status: 409 });
    expect(marcar(LOJISTA_SEM_CONFERIR, { cnpj_conferido: "sim" })).toMatchObject({ ok: false, status: 400 });
    expect(marcar(LOJISTA_SEM_CONFERIR, { cnpj_conferido: true }, ["marketing"])).toMatchObject({ ok: false, status: 403 });
  });
});
