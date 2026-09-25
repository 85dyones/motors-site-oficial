import { describe, it, expect } from "vitest";
import {
  alteracoes,
  cadastraRepasse,
  decidirCriacao,
  decidirEdicao,
  formularioDe,
  podeEditarORepasse,
  validaRepasse,
} from "../src/lib/edicaoDoRepasse";
import type { Perfil } from "../src/lib/permissoes";
import { fotoDeTeste, repasseDeTeste } from "./repasseDeTeste";

const AGORA = new Date("2026-09-24T12:00:00Z");
const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";
const MINIMO = { marca: "Renault", modelo: "Kwid", versao: "Zen 1.0", ano_modelo: 2021, quilometragem: 71200, preco: 36900 };

const criar = (corpo: unknown, perfis: Perfil[] = ["marketing"]) =>
  decidirCriacao({ corpo, perfis, id: ID, autorId: "u-1", agora: AGORA });
const editar = (corpo: unknown, perfis: Perfil[], parcial: Parameters<typeof repasseDeTeste>[0] = {}) =>
  decidirEdicao({ repasse: repasseDeTeste(parcial), corpo, perfis, agora: AGORA });

describe("criar o rascunho", () => {
  it("qualquer perfil da equipe cria, e a linha nasce rascunho, com dono e slug", () => {
    const d = criar(MINIMO, ["financeiro"]);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.linha).toMatchObject({ id: ID, situacao: "rascunho", criado_por: "u-1", preco: 36900 });
    expect(d.linha.slug).toBe("renault-kwid-zen-1-0-2021-3f9a1c");
  });

  it("sem perfil de painel, não cria", () => {
    expect(criar(MINIMO, [])).toMatchObject({ ok: false, status: 403 });
  });

  it("os cinco obrigatórios do banco", () => {
    const semPreco: Partial<typeof MINIMO> = { ...MINIMO };
    delete semPreco.preco;
    expect(criar(semPreco)).toMatchObject({ ok: false, status: 400, erro: "Informe o preço à vista." });
  });

  it("ano fora da régua não entra", () => {
    expect(criar({ ...MINIMO, ano_modelo: 2062 })).toMatchObject({ ok: false, status: 400, erro: "Ano do modelo entre 1950 e 2027." });
  });

  it("a situação não entra pela criação", () => {
    expect(criar({ ...MINIMO, situacao: "publicado" })).toMatchObject({
      ok: false,
      status: 400,
      erro: "O painel não grava o campo situacao.",
    });
  });
});

describe("quem edita o quê", () => {
  it("rascunho é de quem cadastra; em validação, publicado e reservado, de quem valida", () => {
    expect(podeEditarORepasse({ situacao: "rascunho" }, ["marketing"])).toBe(true);
    expect(podeEditarORepasse({ situacao: "em_validacao" }, ["marketing"])).toBe(false);
    expect(podeEditarORepasse({ situacao: "publicado" }, ["comercial"])).toBe(true);
    expect(podeEditarORepasse({ situacao: "reservado" }, ["gestor"])).toBe(true);
    expect(podeEditarORepasse({ situacao: "vendido" }, ["admin"])).toBe(false);
    expect(podeEditarORepasse({ situacao: "arquivado" }, ["admin"])).toBe(false);
  });

  it("o SDR cadastra e não valida (dono, 24/09; 6ª coluna da matriz)", () => {
    expect(cadastraRepasse(["sdr"])).toBe(true);
    expect(validaRepasse(["sdr"])).toBe(false);
    expect(criar(MINIMO, ["sdr"]).ok).toBe(true);
    expect(podeEditarORepasse({ situacao: "rascunho" }, ["sdr"])).toBe(true);
    expect(podeEditarORepasse({ situacao: "em_validacao" }, ["sdr"])).toBe(false);
  });

  it("marketing edita o rascunho", () => {
    expect(editar({ preco: 35000 }, ["marketing"])).toEqual({ ok: true, colunas: { preco: 35000 } });
  });

  it("marketing não edita o carro em validação", () => {
    const d = editar({ preco: 35000 }, ["marketing"], { situacao: "em_validacao" });
    expect(d).toMatchObject({ ok: false, status: 403 });
    if (!d.ok) expect(d.erro).toContain("Peça a um validador");
  });

  it("vendido e arquivado não se editam", () => {
    expect(editar({ preco: 35000 }, ["admin"], { situacao: "vendido", lojistas_desde: "x", vendido_em: "x" })).toMatchObject({ ok: false, status: 409 });
    expect(editar({ preco: 35000 }, ["admin"], { situacao: "arquivado", arquivado_em: "x" })).toMatchObject({ ok: false, status: 409 });
  });

  it("fora do rascunho, a edição não pode deixar o carro incompleto", () => {
    const d = editar({ resumo: "" }, ["comercial"], { situacao: "publicado", lojistas_desde: "2026-09-24T12:00:00Z" });
    expect(d).toMatchObject({ ok: false, status: 422 });
    if (!d.ok) expect(d.problemas).toContain("Escreva a linha do card.");
  });

  it("fora do rascunho, uma edição completa passa", () => {
    const d = editar({ resumo: "Embreagem patinando; o resto em ordem." }, ["comercial"], {
      situacao: "publicado",
      lojistas_desde: "2026-09-24T12:00:00Z",
    });
    expect(d).toEqual({ ok: true, colunas: { resumo: "Embreagem patinando; o resto em ordem." } });
  });
});

describe("o slug", () => {
  it("muda com a identidade no rascunho", () => {
    const d = editar({ modelo: "Kwid Outsider" }, ["marketing"]);
    expect(d.ok && d.colunas.slug).toBe("renault-kwid-outsider-zen-1-0-2021-3f9a1c");
  });

  it("não muda com o preço", () => {
    const d = editar({ preco: 35000 }, ["marketing"]);
    expect(d.ok && "slug" in d.colunas).toBe(false);
  });

  it("não muda fora do rascunho: a URL publicada fica estável", () => {
    const d = editar({ versao: "Zen 1.0 SCe" }, ["comercial"], { situacao: "publicado", lojistas_desde: "2026-09-24T12:00:00Z" });
    expect(d.ok && "slug" in d.colunas).toBe(false);
  });
});

describe("a lista fechada de campos", () => {
  for (const campo of [
    "situacao",
    "lojistas_desde",
    "aberto_ao_publico_em",
    "reservado_em",
    "vendido_em",
    "arquivado_em",
    "validado_por",
    "validado_em",
    "criado_por",
    "enviado_em",
    "devolvido_com",
    "slug",
    "id",
    "org_id",
    "created_at",
  ]) {
    it(`recusa ${campo}`, () => {
      expect(editar({ [campo]: "x" }, ["admin"])).toMatchObject({ ok: false, status: 400, erro: `O painel não grava o campo ${campo}.` });
    });
  }

  it("descarta url_imagem, que a galeria do estoque manda junto", () => {
    const web = ["a", "b", "c", "d"].map((l) => fotoDeTeste(l));
    const zap = ["a", "b", "c", "d"].map((l) => fotoDeTeste(l, "zap"));
    const d = editar({ web_full_images: web, whatsapp_images: zap, url_imagem: zap[0] }, ["marketing"]);
    expect(d).toEqual({ ok: true, colunas: { web_full_images: web, whatsapp_images: zap } });
  });
});

describe("normalização", () => {
  it("fotos vão em par", () => {
    const d = editar({ web_full_images: [fotoDeTeste("a")] }, ["marketing"]);
    expect(d).toMatchObject({ ok: false, status: 400, erro: "As fotos vão em par: as duas listas juntas." });
  });

  it("foto de fora do bucket não entra", () => {
    const d = editar({ web_full_images: ["https://carro57.com.br/1.jpg"], whatsapp_images: [fotoDeTeste("a", "zap")] }, ["marketing"]);
    expect(d).toMatchObject({ ok: false, status: 400 });
  });

  it("item sem descrição não se salva", () => {
    const d = editar({ itens_de_estado: [{ descricao: "\u200B", local: "", foto: null, orcamento: null, estetico: false }] }, ["marketing"]);
    expect(d).toMatchObject({ ok: false, status: 400, erro: "Linha 1 da ficha: descreva o defeito antes de salvar." });
  });

  it("foto de defeito de fora do bucket não entra", () => {
    const d = editar(
      { itens_de_estado: [{ descricao: "Risco", local: "Porta", foto: "https://imgur.com/x.jpg", orcamento: null, estetico: true }] },
      ["marketing"],
    );
    expect(d).toMatchObject({ ok: false, status: 400, erro: "Linha 1 da ficha: a foto precisa ser enviada pelo painel." });
  });

  it("marca só com espaço invisível é vazia", () => {
    expect(editar({ marca: "\u200B " }, ["marketing"])).toMatchObject({ ok: false, status: 400, erro: "Informe a marca." });
  });

  it("texto opcional vazio vira null", () => {
    expect(editar({ versao: "  " }, ["marketing"])).toEqual({ ok: true, colunas: { versao: null, slug: "renault-kwid-2021-3f9a1c" } });
  });

  it("data que não existe não entra", () => {
    expect(editar({ orcamento_em: "2026-02-31" }, ["marketing"])).toMatchObject({ ok: false, status: 400 });
    expect(editar({ orcamento_em: "2026-02-28" }, ["marketing"])).toEqual({ ok: true, colunas: { orcamento_em: "2026-02-28" } });
  });

  it("carroceria e laudo só da lista", () => {
    expect(editar({ carroceria: "conversivel" }, ["marketing"])).toMatchObject({ ok: false, status: 400 });
    expect(editar({ laudo: "reprovado" }, ["marketing"])).toMatchObject({ ok: false, status: 400 });
  });

  it("corpo que não é objeto", () => {
    expect(editar([1, 2], ["marketing"])).toMatchObject({ ok: false, status: 400, erro: "Corpo inválido." });
  });
});

describe("o apontamento do laudo, que o CHECK do banco cobra já no rascunho", () => {
  const SEM_APONTAMENTO = { ok: false, status: 400, erro: "Escreva o apontamento do laudo." };

  it("a criação com apontamento e sem texto não passa", () => {
    expect(criar({ ...MINIMO, laudo: "aprovado_com_apontamento" })).toMatchObject(SEM_APONTAMENTO);
  });

  it("o rascunho não troca o laudo para apontamento sem o texto", () => {
    expect(editar({ laudo: "aprovado_com_apontamento" }, ["marketing"])).toMatchObject(SEM_APONTAMENTO);
  });

  it("com o texto junto, passa", () => {
    expect(editar({ laudo: "aprovado_com_apontamento", laudo_apontamento: "Folga na suspensão" }, ["marketing"])).toEqual({
      ok: true,
      colunas: { laudo: "aprovado_com_apontamento", laudo_apontamento: "Folga na suspensão" },
    });
  });

  it("o rascunho não apaga o texto de um laudo com apontamento, nem com espaço invisível", () => {
    const d = editar({ laudo_apontamento: "\u200B" }, ["marketing"], { laudo: "aprovado_com_apontamento", laudo_apontamento: "Folga" });
    expect(d).toMatchObject(SEM_APONTAMENTO);
  });
});

describe("o texto que a tela esconde não fica gravado", () => {
  it("leilão que deixa de constar apaga o detalhe", () => {
    const d = editar({ leilao_consta: false }, ["marketing"], { leilao_consta: true, leilao_detalhe: "Leilão 2019" });
    expect(d).toEqual({ ok: true, colunas: { leilao_consta: false, leilao_detalhe: null } });
  });

  it("laudo que deixa de ter apontamento apaga o apontamento", () => {
    const d = editar({ laudo: "aprovado" }, ["marketing"], { laudo: "aprovado_com_apontamento", laudo_apontamento: "Folga" });
    expect(d).toEqual({ ok: true, colunas: { laudo: "aprovado", laudo_apontamento: null } });
  });

  it("a criação não grava apontamento de laudo sem apontamento", () => {
    const d = criar({ ...MINIMO, laudo: "aprovado", laudo_apontamento: "x" });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.linha.laudo_apontamento).toBeNull();
  });

  it("o texto escondido não barra o checklist fora do rascunho", () => {
    const d = editar({ sinistro_consta: false, sinistro_detalhe: "Batida leve, garantia legal" }, ["comercial"], {
      situacao: "publicado",
      lojistas_desde: "2026-09-24T12:00:00Z",
    });
    expect(d).toEqual({ ok: true, colunas: { sinistro_consta: false, sinistro_detalhe: null } });
  });
});

describe("o formulário do editor", () => {
  it("alteracoes devolve só o que mudou, comparando por valor", () => {
    const salvo = formularioDe(repasseDeTeste());
    const itens = [...salvo.itens_de_estado, { descricao: "Farol", local: "Frente", foto: null, orcamento: null, estetico: true }];
    const atual = { ...salvo, preco: 35000, itens_de_estado: itens, web_full_images: [...salvo.web_full_images] };
    expect(alteracoes(atual, salvo)).toEqual({ preco: 35000, itens_de_estado: itens });
  });
});
