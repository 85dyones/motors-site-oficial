import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { decidirCadastro } from "../src/lib/cadastroDeVeiculo";
import {
  CAMPOS_NOSSOS,
  CAMPO_DOS_OPCIONAIS,
  camposGravaveis,
  extrairCamposNossos,
} from "../src/lib/estoqueEscrita";
import { ACAO_DO_CAMPO_DE_VEICULO } from "../src/lib/permissoes";

/**
 * Opcionais do carro do feed: só leitura no painel (decisão do dono, 16/09).
 *
 * Desde a migração `20260908160000_opcionais_vem_do_feed` o sync do RevendaMais
 * escreve `opcionais`, e sobrescreve a cada ciclo. O painel continuava gravando
 * o campo em carro de qualquer origem: a edição saía como salva, entrava no
 * histórico, e o ciclo seguinte a desfazia sem erro em lugar nenhum. É o
 * defeito que tirou o preço do painel nesse mesmo carro, e a régua passa a ser
 * a mesma: gravável só no veículo nativo, onde o sync não passa.
 *
 * As quatro pontas andam juntas, e cada bloco abaixo trava uma: a escrita, o
 * cadastro nativo, a tela e a trava do banco que justifica as outras três.
 */

describe("a escrita: opcionais só no veículo nativo", () => {
  it("o carro do feed não expõe opcionais à escrita; o nativo expõe", () => {
    expect(CAMPO_DOS_OPCIONAIS).toBe("opcionais");
    expect(camposGravaveis("sync")).not.toContain("opcionais");
    // Origem ausente ou desconhecida fica no mais restrito, como o preço.
    expect(camposGravaveis(null)).not.toContain("opcionais");
    expect(camposGravaveis(undefined)).not.toContain("opcionais");
    expect(camposGravaveis("qualquer_coisa")).not.toContain("opcionais");
    expect(camposGravaveis("painel")).toContain("opcionais");
  });

  it("saiu de CAMPOS_NOSSOS, a lista que promete que o sync não conhece campo nenhum dela", () => {
    expect(CAMPOS_NOSSOS as readonly string[]).not.toContain("opcionais");
  });

  it("o PATCH descarta opcionais no carro do feed e grava no nativo", () => {
    const corpo = { opcionais: "Teto solar, Câmera de ré", descricao: "ok" };
    expect(extrairCamposNossos(corpo, "sync")).toEqual({ descricao: "ok" });
    // Sem origem é a rota de lote, que escreve em origens misturadas.
    expect(extrairCamposNossos(corpo)).toEqual({ descricao: "ok" });
    expect(extrairCamposNossos(corpo, "painel")).toEqual({
      opcionais: "Teto solar, Câmera de ré",
      descricao: "ok",
    });
  });

  it("todo campo gravável no nativo tem linha declarada na matriz A17", () => {
    // `permissoes.test.ts` confere isto só para `CAMPOS_NOSSOS`. Com os
    // opcionais fora dela, a contraprova precisa olhar a lista do painel
    // inteira: campo sem linha é negado, e o editor tomaria 403 sem explicação.
    const semLinha = camposGravaveis("painel").filter((c) => !ACAO_DO_CAMPO_DE_VEICULO[c]);
    expect(semLinha, "Campo gravável sem linha na A17: " + semLinha.join(", ")).toEqual([]);
  });
});

describe("o cadastro nativo continua gravando opcionais", () => {
  const corpo: Record<string, unknown> = {
    marca: "VW",
    modelo: "Nivus",
    ano: 2023,
    preco: 118900,
    quilometragem: 38400,
    chassi: "9BWZZZ377VT004251",
    opcionais: "Teto solar, Bancos de couro",
  };

  it("o carro que nasce no painel leva os opcionais para o INSERT", () => {
    // Dois mutantes morrem aqui. O óbvio: tirar o campo de `CAMPOS_NOSSOS` e
    // esquecer o cadastro, que chama `extrairCamposNossos` sem origem. E o
    // atalho: resolver com `extrairCamposNossos(corpo, "painel")`, que traz o
    // `preco` do corpo junto. O Comercial é de propósito: ele cadastra, mas não
    // tem a linha de preço da A17, e o atalho faria este cadastro tomar 403.
    const d = decidirCadastro(corpo, { papeis: ["comercial"] });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.linha.opcionais).toBe("Teto solar, Bancos de couro");
  });

  it("sem opcionais no corpo, a linha não ganha a chave", () => {
    const semOpcionais = { ...corpo };
    delete semOpcionais.opcionais;
    const d = decidirCadastro(semOpcionais, { papeis: ["comercial"] });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.linha).not.toHaveProperty("opcionais");
  });
});

describe("a tela: o editor mostra os opcionais do feed, e não os edita", () => {
  const editor = lerCodigo("src/components/admin/EditorDeVeiculo.tsx");

  it("o campo de texto dos opcionais só existe no ramo do nativo", () => {
    expect(editor.split('set("opcionais"').length - 1, "mais de um lugar grava opcionais").toBe(1);
    expect(editor).toMatch(
      /\{v\.origem === "painel" \? \(\s*<textarea\s[\s\S]{0,400}?set\("opcionais"/,
    );
  });

  it("o carro do feed lê de onde vêm os opcionais", () => {
    expect(editor).toContain("Opcionais e equipamentos · do feed");
    expect(editor).toContain("Os opcionais deste carro são os do RevendaMais");
    expect(editor).toContain("O RevendaMais não mandou opcionais para este carro");
  });

  it("o Salvar só manda opcionais no nativo", () => {
    const inicio = editor.indexOf("const salvar = async");
    const fim = editor.indexOf("Object.fromEntries", inicio);
    expect(inicio, "o Salvar sumiu").toBeGreaterThan(-1);
    expect(fim, "não achei o fim do corpo do Salvar").toBeGreaterThan(inicio);
    const corpoDoSalvar = editor.slice(inicio, fim);
    expect(corpoDoSalvar.split("opcionais: v.opcionais").length - 1).toBe(1);
    expect(corpoDoSalvar).toMatch(
      /v\.origem === "painel"\s*\?\s*\{[^}]*opcionais: v\.opcionais[^}]*\}\s*:\s*\{\}/,
    );
  });
});

describe("a trava do banco: é ela que torna o painel só leitura", () => {
  it("a definição vigente da trava do sync deixa `opcionais` passar", () => {
    // Se um dia a trava voltar a descartar os opcionais do sync, este teste
    // quebra, e a aba do carro do feed pode voltar a ser editável. Uma sem a
    // outra é campo que o painel não deixa mexer e que ninguém mais preenche.
    const pasta = "supabase/migrations";
    const definicoes = readdirSync(join(__dirname, "..", pasta))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) =>
        /create\s+or\s+replace\s+function\s+public\.estoque_motors_trava_do_sync/i.test(
          ler(`${pasta}/${f}`),
        ),
      );
    expect(definicoes.length, "nenhuma migração define a trava do sync").toBeGreaterThan(0);
    const vigente = definicoes[definicoes.length - 1];
    expect(ler(`${pasta}/${vigente}`), vigente).toMatch(/old\.opcionais\s*:=\s*new\.opcionais/);
  });
});
