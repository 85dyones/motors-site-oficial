import { describe, it, expect } from "vitest";
import {
  SEM_PROMOCAO,
  colunasDaPromocao,
  descontoPct,
  precoEfetivo,
  recusaDaPromocao,
  temPromocao,
} from "../src/lib/precoPromocional";
import {
  CAMPO_DA_PROMOCAO,
  aplicarNosVeiculos,
  camposGravaveis,
  extrairCamposNossos,
} from "../src/lib/estoqueEscrita";
import { normalizarCadastro, validarCadastroDeVeiculo } from "../src/lib/cadastroDeVeiculo";
import { ACAO_DO_CAMPO_DE_VEICULO, podeGravarCampo } from "../src/lib/permissoes";

/**
 * Preço promocional — o "por" do de/por, definido pela loja.
 *
 * O dado já existia e o site já o mostrava; o que faltava era a loja poder
 * defini-lo. Quando isto foi escrito (2026-08-31), 16 dos 38 veículos ativos
 * estavam em promoção e TODOS os 104 da base eram `origem = 'sync'` — daí o
 * teste mais importante deste arquivo ser o de que a promoção vale no veículo
 * importado. Restringi-la ao nativo entregaria um campo para zero carros.
 */

const AUTOR = { id: "u-1", nome: "Quem promoveu" };

/** O mesmo Supabase de mentira de `rascunho-e-publicacao`, pelo mesmo motivo:
 *  a régua tem de ser EXECUTADA, não lida no arquivo. */
function bancoFalso(linhas: Array<Record<string, unknown>>) {
  const gravou: Array<{ patch: Record<string, unknown>; ids: unknown[] }> = [];
  const historico: Array<Record<string, unknown>> = [];
  const supabase = {
    from(tabela: string) {
      if (tabela === "historico_veiculo") {
        return {
          insert: async (novas: Array<Record<string, unknown>>) => {
            historico.push(...novas);
            return { error: null };
          },
        };
      }
      return {
        select: (_c: string) => ({
          in: async (_col: string, ids: Array<string | number>) => ({
            data: linhas.filter((l) => ids.map(String).includes(String(l.id))),
            error: null,
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          in: async (_col: string, ids: Array<string | number>) => {
            gravou.push({ patch, ids });
            return { error: null };
          },
        }),
      };
    },
  };
  return { supabase, gravou, historico };
}

/** A Saveiro real da produção, que motivou o pedido. */
const SAVEIRO = {
  id: 8335204,
  origem: "sync",
  preco_original: 68900,
  whatsapp_images: [],
};

describe("a régua do que é uma promoção", () => {
  it("promoção é MENOR que o anunciado — igual ou maior não é promoção", () => {
    expect(temPromocao(65900, 68900)).toBe(true);
    expect(temPromocao(68900, 68900)).toBe(false);
    expect(temPromocao(70000, 68900)).toBe(false);
  });

  it("zero e nulo significam sem promoção, e não promoção de R$ 0", () => {
    expect(SEM_PROMOCAO).toBe(0);
    expect(temPromocao(0, 68900)).toBe(false);
    expect(temPromocao(null, 68900)).toBe(false);
    expect(temPromocao(undefined, 68900)).toBe(false);
    // Sem base não há desconto que se possa medir.
    expect(temPromocao(65900, 0)).toBe(false);
    expect(temPromocao(65900, null)).toBe(false);
  });

  it("a régua é a MESMA que a PDP usa — de/por só quando os dois existem", () => {
    // `PDPClientWrapper` monta o de/por com
    // `preco_promocional > 0 && preco_promocional < preco_original`.
    // Se esta função divergisse, o painel prometeria tarja que a ficha não dá.
    const casos: Array<[number | null, number | null]> = [
      [65900, 68900],
      [0, 68900],
      [68900, 68900],
      [null, 68900],
      [65900, null],
    ];
    for (const [promo, orig] of casos) {
      const comoAFicha = Number(promo ?? 0) > 0 && Number(promo ?? 0) < Number(orig ?? 0);
      expect(temPromocao(promo, orig), `divergiu em ${promo}/${orig}`).toBe(comoAFicha);
    }
  });

  it("o desconto sai em porcentagem, e só quando há promoção", () => {
    expect(descontoPct(65900, 68900)).toBeCloseTo(4.35, 1);
    expect(descontoPct(69900, 85000)).toBeCloseTo(17.76, 1);
    expect(descontoPct(0, 68900)).toBeNull();
    expect(descontoPct(70000, 68900)).toBeNull();
  });
});

describe("as três colunas de preço andam juntas", () => {
  it("gravar promoção muda o preço EFETIVO, não só a coluna da promoção", () => {
    // Este é o bug que a função existe para impedir: `preco` é o que a
    // ordenação da vitrine lê. Promoção sem `preco` deixaria o carro ordenando
    // pelo valor velho.
    expect(colunasDaPromocao(65900, 68900)).toEqual({
      preco_promocional: 65900,
      preco: 65900,
    });
  });

  it("tirar a promoção devolve o preço de tabela ao efetivo", () => {
    expect(colunasDaPromocao(null, 68900)).toEqual({ preco_promocional: 0, preco: 68900 });
    expect(colunasDaPromocao(0, 68900)).toEqual({ preco_promocional: 0, preco: 68900 });
  });

  it("promoção inválida nunca vira preço efetivo", () => {
    // Rede de segurança: `recusaDaPromocao` barra antes. Se um dia alguém
    // chamar direto, o efetivo cai no original em vez de subir o preço.
    expect(precoEfetivo(70000, 68900)).toBe(68900);
    expect(colunasDaPromocao(70000, 68900).preco).toBe(68900);
  });

  it("`preco_original` nunca é devolvido — ele é a base, não o efeito", () => {
    expect(Object.keys(colunasDaPromocao(65900, 68900)).sort()).toEqual(["preco", "preco_promocional"]);
  });
});

describe("o que é recusado, e com que texto", () => {
  it("vazio é o estado normal, não um erro", () => {
    expect(recusaDaPromocao(null, 68900)).toBeNull();
    expect(recusaDaPromocao(undefined, 68900)).toBeNull();
    expect(recusaDaPromocao(0, 68900)).toBeNull();
  });

  it("promoção maior ou igual ao anunciado é recusada, e o texto ensina a sair", () => {
    const recusa = recusaDaPromocao(70000, 68900);
    expect(recusa).toBeTruthy();
    expect(recusa).toMatch(/MENOR/);
    // O texto precisa dizer COMO tirar a promoção: em branco. Sem isso o
    // operador tenta zero, ou desiste e deixa um valor errado.
    expect(recusa).toMatch(/em branco/i);
    expect(recusaDaPromocao(68900, 68900)).toBeTruthy();
  });

  it("promoção sem preço anunciado é recusada — não há contra o que medir", () => {
    expect(recusaDaPromocao(65900, null)).toMatch(/preço anunciado/i);
    expect(recusaDaPromocao(65900, 0)).toMatch(/preço anunciado/i);
  });

  it("negativo e não-número são recusados", () => {
    expect(recusaDaPromocao(-1, 68900)).toMatch(/negativ/i);
    expect(recusaDaPromocao(Number("abc"), 68900)).toMatch(/número/i);
  });
});

describe("quem pode gravar promoção", () => {
  it("a promoção vale em veículo de QUALQUER origem", () => {
    // O teste que mais importa: em 31/08 os 104 veículos eram do sync. Uma
    // promoção só do nativo não serviria a carro nenhum.
    expect(camposGravaveis("sync")).toContain(CAMPO_DA_PROMOCAO);
    expect(camposGravaveis("painel")).toContain(CAMPO_DA_PROMOCAO);
    expect(camposGravaveis(null)).toContain(CAMPO_DA_PROMOCAO);
  });

  it("mas o preço de TABELA continua só do nativo", () => {
    // A promoção abriu; o preço de tabela não. Quem manda nele é o
    // RevendaMais enquanto o carro for dele.
    expect(camposGravaveis("sync")).not.toContain("preco_original");
    expect(camposGravaveis("sync")).not.toContain("preco");
  });

  it("passa por `extrairCamposNossos` no veículo importado", () => {
    const corpo = { preco_promocional: 65900, preco_original: 999, descricao: "ok" };
    expect(extrairCamposNossos(corpo, "sync")).toEqual({
      preco_promocional: 65900,
      descricao: "ok",
    });
  });

  it("está na matriz A17, na mesma linha do preço", () => {
    expect(ACAO_DO_CAMPO_DE_VEICULO.preco_promocional).toBe("Alterar preço acima de 5%");
    expect(ACAO_DO_CAMPO_DE_VEICULO.preco_promocional).toBe(ACAO_DO_CAMPO_DE_VEICULO.preco);
    // Quem não altera preço não define promoção — é a mesma decisão comercial.
    expect(podeGravarCampo(["marketing"], "preco_promocional")).toBe(false);
    expect(podeGravarCampo(["admin"], "preco_promocional")).toBe(true);
  });
});

describe("a escrita, executada de ponta a ponta", () => {
  it("grava promoção E preço efetivo num veículo do SYNC", async () => {
    const { supabase, gravou } = bancoFalso([SAVEIRO]);
    const r = await aplicarNosVeiculos(supabase, [8335204], { preco_promocional: 65900 }, AUTOR);

    expect(r.erro).toBeUndefined();
    expect(gravou[0].patch).toEqual({ preco_promocional: 65900, preco: 65900 });
    // `preco_original` intocado: o "de" continua sendo o do RevendaMais.
    expect(gravou[0].patch).not.toHaveProperty("preco_original");
  });

  it("a base vem do BANCO, não do corpo da requisição", async () => {
    // Sem isto, `{preco_original: 999999, preco_promocional: 1}` fabricaria um
    // desconto de 99,9% contra uma base que não existe. Como `preco_original`
    // não passa em veículo do sync, o que resta é a base real — e 999999 é
    // maior que 68900, então a promoção de 1 seria "válida" contra a falsa.
    const { supabase, gravou } = bancoFalso([SAVEIRO]);
    const corpo = extrairCamposNossos(
      { preco_original: 999999, preco_promocional: 70000 },
      "sync",
    );
    const r = await aplicarNosVeiculos(supabase, [8335204], corpo, AUTOR);

    // 70.000 é maior que a base REAL (68.900) — recusado.
    expect(r.status).toBe(422);
    expect(r.erro).toMatch(/MENOR/);
    expect(gravou).toHaveLength(0);
  });

  it("no veículo nativo, promoção e preço novo na mesma chamada são julgados juntos", async () => {
    // Conferir só contra o banco recusaria uma promoção válida contra o preço
    // que a própria chamada está definindo.
    const nativo = { id: 900000001, origem: "painel", preco_original: 50000, whatsapp_images: [] };
    const { supabase, gravou } = bancoFalso([nativo]);
    const r = await aplicarNosVeiculos(
      supabase,
      [900000001],
      { preco: 90000, preco_original: 90000, preco_promocional: 85000 },
      AUTOR,
    );

    expect(r.erro).toBeUndefined();
    // 85.000 é válido contra os 90.000 NOVOS, embora fosse inválido contra os
    // 50.000 antigos. E o efetivo é a promoção, não o preço novo.
    expect(gravou[0].patch).toMatchObject({
      preco_original: 90000,
      preco_promocional: 85000,
      preco: 85000,
    });
  });

  it("recusa promoção em lote — o desconto é medido contra o preço de cada carro", async () => {
    const { supabase, gravou } = bancoFalso([SAVEIRO, { ...SAVEIRO, id: 8358193, preco_original: 55900 }]);
    const r = await aplicarNosVeiculos(
      supabase,
      [8335204, 8358193],
      { preco_promocional: 65900 },
      AUTOR,
    );

    expect(r.status).toBe(400);
    expect(r.erro).toMatch(/um veículo por vez/i);
    expect(gravou).toHaveLength(0);
    // 65.900 num carro de 55.900 seria um AUMENTO disfarçado de promoção.
  });

  it("o preço derivado entra no histórico — quem mexeu no preço aparece", async () => {
    const { supabase, historico } = bancoFalso([{ ...SAVEIRO, preco: 68900, preco_promocional: 0 }]);
    await aplicarNosVeiculos(supabase, [8335204], { preco_promocional: 65900 }, AUTOR);

    const campos = historico.map((h) => h.campo).sort();
    expect(campos).toEqual(["preco", "preco_promocional"]);
    const doPreco = historico.find((h) => h.campo === "preco");
    expect(doPreco).toMatchObject({ valor_anterior: "68900", valor_novo: "65900" });
  });

  it("salvar a MESMA promoção não registra mudança nenhuma", async () => {
    // Encontrado em produção em 2026-08-31, com o campo já no ar: um PATCH que
    // repetia os 65.900 que já estavam lá gravou "preco_promocional: null →
    // 65900" e "preco: null → 65900". Duas causas somadas:
    //
    //   1. as colunas de preço não estavam no `select` do estado anterior, então
    //      o valor "antes" chegava `undefined` e tudo parecia novo;
    //   2. o Postgres devolve `numeric` como STRING — "65900.00" contra o
    //      número 65900 diferem no `String()`.
    //
    // A promessa que abre `aplicarNosVeiculos` é que salvar sem alterar nada não
    // polui a trilha. Sem este teste ela era falsa exatamente na pergunta que a
    // trilha existe para responder.
    const { supabase, historico, gravou } = bancoFalso([
      // Como o PostgREST devolve de fato: numeric em string, com casas.
      { ...SAVEIRO, preco: "65900.00", preco_promocional: "65900.00" },
    ]);
    const r = await aplicarNosVeiculos(supabase, [8335204], { preco_promocional: 65900 }, AUTOR);

    expect(r.erro).toBeUndefined();
    expect(gravou).toHaveLength(1); // gravou, sim — mas nada MUDOU
    expect(r.mudancasRegistradas).toBe(0);
    expect(historico).toHaveLength(0);
  });

  it("o mesmo vale para as outras colunas numéricas", async () => {
    // `preco_compra` e `donos_anteriores` sempre tiveram o problema — só nunca
    // haviam sido medidos. A régua é por lista, e não global, porque em campo
    // de texto ela tornaria "007" igual a "7".
    const { supabase, historico } = bancoFalso([
      { ...SAVEIRO, preco_compra: "102000.00", donos_anteriores: 2, placa: "007" },
    ]);
    const r = await aplicarNosVeiculos(
      supabase,
      [8335204],
      { preco_compra: 102000, donos_anteriores: 2 },
      AUTOR,
    );
    expect(r.mudancasRegistradas).toBe(0);

    // Texto continua textual: "007" e "7" são placas diferentes.
    const outro = bancoFalso([{ ...SAVEIRO, placa: "007" }]);
    const r2 = await aplicarNosVeiculos(outro.supabase, [8335204], { placa: "7" }, AUTOR);
    expect(r2.mudancasRegistradas).toBe(1);
    expect(historico).toHaveLength(0);
  });

  it("mas uma mudança de verdade continua sendo registrada", async () => {
    const { supabase, historico } = bancoFalso([
      { ...SAVEIRO, preco: "68900.00", preco_promocional: "0.00" },
    ]);
    const r = await aplicarNosVeiculos(supabase, [8335204], { preco_promocional: 65900 }, AUTOR);

    expect(r.mudancasRegistradas).toBe(2);
    expect(historico.find((h) => h.campo === "preco_promocional")).toMatchObject({
      valor_anterior: "0.00",
      valor_novo: "65900",
    });
  });

  it("tirar a promoção devolve o preço de tabela, e isso também é gravado", async () => {
    const { supabase, gravou } = bancoFalso([
      { ...SAVEIRO, preco: 65900, preco_promocional: 65900 },
    ]);
    const r = await aplicarNosVeiculos(supabase, [8335204], { preco_promocional: 0 }, AUTOR);

    expect(r.erro).toBeUndefined();
    expect(gravou[0].patch).toEqual({ preco_promocional: 0, preco: 68900 });
  });
});

describe("no cadastro de veículo novo", () => {
  const base = {
    marca: "Volkswagen",
    modelo: "Saveiro",
    ano: "2022",
    quilometragem: "40000",
    chassi: "9BWZZZ377VT004251",
    preco: "68900",
  };

  it("é opcional — carro entra sem promoção e isso não é erro", () => {
    expect(validarCadastroDeVeiculo(base)).toEqual([]);
    expect(validarCadastroDeVeiculo({ ...base, preco_promocional: "" })).toEqual([]);
  });

  it("promoção válida grava as três colunas coerentes", () => {
    const linha = normalizarCadastro({ ...base, preco_promocional: "65900" });
    expect(linha.preco_original).toBe(68900); // o "de"
    expect(linha.preco_promocional).toBe(65900); // o "por"
    expect(linha.preco).toBe(65900); // o efetivo, que a vitrine ordena
  });

  it("sem promoção, o efetivo é o anunciado e a coluna fica 0 — não NULL", () => {
    const linha = normalizarCadastro({ ...base, preco_promocional: "" });
    expect(linha.preco).toBe(68900);
    expect(linha.preco_original).toBe(68900);
    // Zero, e não null: é o vocabulário dos 104 veículos que o sync trouxe.
    expect(linha.preco_promocional).toBe(0);
  });

  it("promoção maior que o anunciado é recusada no cadastro também", () => {
    const problemas = validarCadastroDeVeiculo({ ...base, preco_promocional: "70000" });
    expect(problemas.map((p) => p.campo)).toContain("preco_promocional");
    expect(problemas.find((p) => p.campo === "preco_promocional")?.mensagem).toMatch(/MENOR/);
  });

  it("a régua do cadastro é a MESMA do editor", () => {
    // Uma função só para as três bocas de escrita. Se divergirem, um carro
    // cadastrado com promoção inválida passaria e o mesmo valor seria recusado
    // ao ser editado depois.
    for (const [promo, preco] of [
      ["70000", "68900"],
      ["68900", "68900"],
      ["65900", "68900"],
    ] as const) {
      const doCadastro = validarCadastroDeVeiculo({ ...base, preco: preco, preco_promocional: promo })
        .some((p) => p.campo === "preco_promocional");
      const daRegra = recusaDaPromocao(Number(promo), Number(preco)) !== null;
      expect(doCadastro, `divergiu em ${promo}/${preco}`).toBe(daRegra);
    }
  });
});
