import { describe, it, expect } from "vitest";
import {
  ATOS_DO_REPASSE,
  REGRAS_DOS_ATOS,
  atosPossiveis,
  decidirTransicao,
} from "../src/lib/transicoesDoRepasse";
import { SITUACOES_DO_REPASSE, type Repasse } from "../src/lib/repasse";
import type { Perfil } from "../src/lib/permissoes";
import { repasseDeTeste } from "./repasseDeTeste";

const AGORA = new Date("2026-09-24T12:00:00Z");
const ISO = AGORA.toISOString();

/** O carro de teste já completo, na situação pedida, com as datas que o banco exige. */
function naSituacao(situacao: Repasse["situacao"], parcial: Partial<Repasse> = {}): Repasse {
  const datas: Partial<Repasse> =
    situacao === "publicado" || situacao === "reservado" || situacao === "vendido" ? { lojistas_desde: ISO } : {};
  if (situacao === "reservado") datas.reservado_em = ISO;
  if (situacao === "vendido") datas.vendido_em = ISO;
  if (situacao === "arquivado") datas.arquivado_em = ISO;
  return repasseDeTeste({ situacao, ...datas, ...parcial });
}

const decidir = (repasse: Repasse, ato: unknown, perfis: Perfil[], nota?: unknown) =>
  decidirTransicao({ repasse, ato, nota, perfis, autorId: "u-9", agora: AGORA });

describe("atos possíveis por situação e perfil", () => {
  it("rascunho: marketing só envia; quem valida também arquiva", () => {
    expect(atosPossiveis(naSituacao("rascunho"), ["marketing"])).toEqual(["enviar"]);
    expect(atosPossiveis(naSituacao("rascunho"), ["comercial"])).toEqual(["enviar", "arquivar"]);
  });

  it("em validação: só quem valida age", () => {
    expect(atosPossiveis(naSituacao("em_validacao"), ["marketing"])).toEqual([]);
    expect(atosPossiveis(naSituacao("em_validacao"), ["gestor"])).toEqual([
      "devolver",
      "publicar_lojistas",
      "publicar_todos",
      "arquivar",
    ]);
  });

  it("publicado só para lojistas tem o switch; aberto a todos, não", () => {
    expect(atosPossiveis(naSituacao("publicado"), ["admin"])).toEqual([
      "devolver",
      "abrir_para_todos",
      "reservar",
      "vender",
      "arquivar",
    ]);
    expect(atosPossiveis(naSituacao("publicado", { aberto_ao_publico_em: ISO }), ["admin"])).not.toContain("abrir_para_todos");
  });

  it("reservado, vendido, arquivado", () => {
    expect(atosPossiveis(naSituacao("reservado"), ["comercial"])).toEqual(["liberar_reserva", "vender", "arquivar"]);
    expect(atosPossiveis(naSituacao("vendido"), ["comercial"])).toEqual(["arquivar"]);
    expect(atosPossiveis(naSituacao("arquivado"), ["admin"])).toEqual([]);
  });
});

describe("decidirTransicao", () => {
  it("ato desconhecido", () => {
    expect(decidir(naSituacao("rascunho"), "publicar", ["admin"])).toMatchObject({ ok: false, status: 400 });
  });

  it("qualquer perfil envia o rascunho completo", () => {
    expect(decidir(naSituacao("rascunho"), "enviar", ["financeiro"])).toEqual({
      ok: true,
      ato: "enviar",
      colunas: { situacao: "em_validacao", enviado_em: ISO, devolvido_com: null },
    });
  });

  it("rascunho incompleto não vai à validação", () => {
    const d = decidir(naSituacao("rascunho", { resumo: null }), "enviar", ["financeiro"]);
    expect(d).toMatchObject({ ok: false, status: 422 });
    if (!d.ok) expect(d.problemas).toContain("Escreva a linha do card.");
  });

  it("marketing não publica", () => {
    expect(decidir(naSituacao("em_validacao"), "publicar_lojistas", ["marketing"])).toMatchObject({ ok: false, status: 403 });
  });

  it("não se publica o que não está em validação", () => {
    expect(decidir(naSituacao("rascunho"), "publicar_lojistas", ["comercial"])).toMatchObject({ ok: false, status: 409 });
  });

  it("publicar só para lojistas grava quem validou e a data dos lojistas", () => {
    expect(decidir(naSituacao("em_validacao"), "publicar_lojistas", ["comercial"])).toEqual({
      ok: true,
      ato: "publicar_lojistas",
      colunas: {
        situacao: "publicado",
        validado_por: "u-9",
        validado_em: ISO,
        lojistas_desde: ISO,
        aberto_ao_publico_em: null,
        devolvido_com: null,
      },
    });
  });

  it("publicar aberto a todos grava as duas datas", () => {
    const d = decidir(naSituacao("em_validacao"), "publicar_todos", ["gestor"]);
    expect(d.ok && d.colunas).toMatchObject({ lojistas_desde: ISO, aberto_ao_publico_em: ISO });
  });

  it("o switch abre uma vez e não volta", () => {
    expect(decidir(naSituacao("publicado"), "abrir_para_todos", ["admin"])).toEqual({
      ok: true,
      ato: "abrir_para_todos",
      colunas: { situacao: "publicado", aberto_ao_publico_em: ISO },
    });
    expect(decidir(naSituacao("publicado", { aberto_ao_publico_em: ISO }), "abrir_para_todos", ["admin"])).toMatchObject({
      ok: false,
      status: 409,
    });
  });

  it("devolver pede a nota, e o invisível não é nota", () => {
    expect(decidir(naSituacao("em_validacao"), "devolver", ["comercial"])).toMatchObject({ ok: false, status: 400 });
    expect(decidir(naSituacao("em_validacao"), "devolver", ["comercial"], "\u200B ")).toMatchObject({ ok: false, status: 400 });
    expect(decidir(naSituacao("em_validacao"), "devolver", ["comercial"], "x".repeat(501))).toMatchObject({ ok: false, status: 400 });
  });

  it("devolver um publicado zera a publicação", () => {
    const d = decidir(naSituacao("publicado", { aberto_ao_publico_em: ISO }), "devolver", ["comercial"], "Faltou a foto do farol");
    expect(d).toEqual({
      ok: true,
      ato: "devolver",
      colunas: {
        situacao: "rascunho",
        devolvido_com: "Faltou a foto do farol",
        validado_por: null,
        validado_em: null,
        lojistas_desde: null,
        aberto_ao_publico_em: null,
      },
    });
  });

  it("reservar, liberar, vender e arquivar gravam a data certa", () => {
    expect(decidir(naSituacao("publicado"), "reservar", ["comercial"])).toMatchObject({ ok: true, colunas: { situacao: "reservado", reservado_em: ISO } });
    expect(decidir(naSituacao("reservado"), "liberar_reserva", ["comercial"])).toMatchObject({ ok: true, colunas: { situacao: "publicado", reservado_em: null } });
    expect(decidir(naSituacao("reservado"), "vender", ["comercial"])).toMatchObject({ ok: true, colunas: { situacao: "vendido", vendido_em: ISO } });
    expect(decidir(naSituacao("vendido"), "arquivar", ["comercial"])).toMatchObject({ ok: true, colunas: { situacao: "arquivado", arquivado_em: ISO } });
  });

  it("a tabela de regras e a decisão concordam em todo par ato × situação", () => {
    // Admin, carro completo, switch desligado e nota escrita: a única razão
    // para recusar é a situação — e aí a recusa tem de ser 409.
    for (const ato of ATOS_DO_REPASSE) {
      for (const situacao of SITUACOES_DO_REPASSE) {
        const d = decidir(naSituacao(situacao), ato, ["admin"], "nota");
        if (REGRAS_DOS_ATOS[ato].de.includes(situacao)) {
          expect(d.ok, `${ato} em ${situacao}`).toBe(true);
        } else {
          expect(d, `${ato} em ${situacao}`).toMatchObject({ ok: false, status: 409 });
        }
      }
    }
  });
});
