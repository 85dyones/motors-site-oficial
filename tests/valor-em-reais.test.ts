import { describe, it, expect } from "vitest";
import { lerReais, reaisOuNulo, reaisParaCampo } from "../src/lib/valorEmReais";
import { FRACAO_MINIMA_DO_CUSTO, recusaPorCustoImplausivel } from "../src/lib/pisoDePreco";
import { aplicarNosVeiculos } from "../src/lib/estoqueEscrita";
import { normalizarCadastro, validarCadastroDeVeiculo } from "../src/lib/cadastroDeVeiculo";

/**
 * Dinheiro digitado no costume brasileiro — o achado de 01/10/2026.
 *
 * Em produção, dois carros ficaram com custo absurdo: o Captur 8506096
 * (anunciado a R$ 92.900) com `preco_compra` 75,15, e o City 8517481 (R$
 * 119.900) com 113. O histórico do Captur guarda o valor como chegou,
 * "75.1544". A visão do veículo passou a mostrar "Margem R$ 92.825 (99,9%)", e
 * o piso de custo — que existe para nenhum carro sair por menos do que entrou —
 * ficou desarmado nos dois: qualquer preço acima de R$ 113 passa.
 *
 * A causa foi medida no navegador embutido (Chrome 152, pt-BR), num campo
 * idêntico ao do editor (`type="number"` + `Number(e.target.value)`):
 *
 *   - "75.154,40" → o Chrome DESCARTA a vírgula, que seria o segundo separador,
 *     e o campo fica "75.15440" → 75,1544. É o valor do histórico.
 *   - "113.000"   → o campo aceita e entrega "113.000" → 113.
 *
 * Nenhum dos dois chega ao código como texto pt-BR: o campo numérico já
 * destruiu a informação antes do `onChange`. Por isso o conserto é duplo — o
 * campo de dinheiro passa a ser texto (e esta leitura entende o que se digita
 * aqui), e o custo implausível é recusado antes de gravar.
 */

describe("a leitura do que se digita em reais", () => {
  it.each([
    ["75.154,40", 75154.4],
    ["75.154", 75154],
    ["113.000", 113000],
    ["75154,40", 75154.4],
    ["1.234.567,89", 1234567.89],
    ["92900", 92900],
    ["0", 0],
  ])("%s vira %d", (digitado, esperado) => {
    expect(lerReais(digitado)).toEqual({ valor: esperado, erro: null });
  });

  it("aceita a forma canônica de ponto decimal com até dois dígitos", () => {
    // É o que vem de planilha exportada e de API — e o que o próprio
    // `cadastro-nativo.test.ts` exige de `normalizarCadastro` desde 29/08.
    expect(lerReais("118900.50").valor).toBe(118900.5);
    expect(lerReais("118900.5").valor).toBe(118900.5);
  });

  it("aceita o que se copia de uma tela formatada (R$ e espaço não separável)", () => {
    expect(lerReais("R$ 75.154,40").valor).toBe(75154.4);
    expect(lerReais(`R$${String.fromCharCode(160)}92.900`).valor).toBe(92900);
  });

  it("vazio é ausência, não erro", () => {
    for (const vazio of ["", "   ", null, undefined]) {
      expect(lerReais(vazio)).toEqual({ valor: null, erro: null });
    }
  });

  it("número já número passa como está — o corpo do PATCH chega assim", () => {
    expect(lerReais(75154.4)).toEqual({ valor: 75154.4, erro: null });
    expect(lerReais(Number.NaN).erro).toBeTruthy();
  });

  it.each([
    // O que o Chrome produziu de "75.154,40" — nunca mais vira dinheiro.
    "75.15440",
    "75.1544",
    // Três casas depois da vírgula não é centavo: é quem digitou milhar com
    // vírgula. Ler 75,154 reais seria o mesmo erro com outra cara.
    "75,154",
    "1,234.56",
    "75.154.4",
    "75.154,",
    "abc",
    "-500",
  ])("%s é recusado em vez de adivinhado", (digitado) => {
    const lido = lerReais(digitado);
    expect(lido.valor).toBeNull();
    expect(lido.erro).toMatch(/75\.154,40/); // a recusa ensina a forma certa
  });

  it("reaisOuNulo é a leitura sem a mensagem", () => {
    expect(reaisOuNulo("113.000")).toBe(113000);
    expect(reaisOuNulo("75.15440")).toBeNull();
    expect(reaisOuNulo("")).toBeNull();
  });
});

describe("o valor do banco de volta no campo", () => {
  it.each([
    [75154.4, "75.154,40"],
    [113000, "113.000"],
    [92900, "92.900"],
    // O PostgREST devolve `numeric` como texto.
    ["65900.00", "65.900"],
    ["75.15", "75,15"],
    [null, ""],
    [undefined, ""],
  ])("%s aparece como %s", (valor, esperado) => {
    expect(reaisParaCampo(valor)).toBe(esperado);
  });

  it("o que o campo mostra é lido de volta como o mesmo valor", () => {
    for (const v of [75154.4, 113000, 0.5, 1234567.89, 75.15]) {
      expect(lerReais(reaisParaCampo(v)).valor).toBe(v);
    }
  });
});

describe("custo implausível: menos de 10% do anunciado", () => {
  it("a régua é 10%", () => {
    expect(FRACAO_MINIMA_DO_CUSTO).toBe(0.1);
  });

  it("recusa os dois carros de 01/10 e diz o valor lido", () => {
    const captur = recusaPorCustoImplausivel(75.1544, 92900);
    expect(captur).toMatch(/10%/);
    expect(captur).toMatch(/R\$\s75,15/);
    expect(captur).toMatch(/R\$\s92\.900/);
    expect(recusaPorCustoImplausivel(113, 119900)).toMatch(/10%/);
  });

  it("aceita o custo real e a borda exata", () => {
    expect(recusaPorCustoImplausivel(75154.4, 92900)).toBeNull();
    expect(recusaPorCustoImplausivel(113000, 119900)).toBeNull();
    expect(recusaPorCustoImplausivel(9290, 92900)).toBeNull();
    expect(recusaPorCustoImplausivel(9289.99, 92900)).toMatch(/10%/);
  });

  it("sem custo ou sem anúncio não há o que comparar", () => {
    // Zero é "não lançado", o mesmo vocabulário do piso.
    for (const custo of [null, undefined, 0]) {
      expect(recusaPorCustoImplausivel(custo, 92900)).toBeNull();
    }
    for (const anunciado of [null, undefined, 0]) {
      expect(recusaPorCustoImplausivel(75.15, anunciado)).toBeNull();
    }
  });

  it("lê o custo que o PostgREST devolve como texto", () => {
    expect(recusaPorCustoImplausivel("75.15", "92900.00")).toMatch(/10%/);
  });
});

// ---------------------------------------------------------------------------
// A escrita no servidor — `aplicarNosVeiculos`, o caminho único
// ---------------------------------------------------------------------------

const AUTOR = { id: "u-1", nome: "Quem lançou o custo" };

/** O Supabase de mentira de `preco-promocional.test.ts`: a régua EXECUTADA. */
function bancoFalso(linhas: Array<Record<string, unknown>>) {
  const gravou: Array<{ patch: Record<string, unknown>; ids: unknown[] }> = [];
  const supabase = {
    from(tabela: string) {
      if (tabela === "historico_veiculo") {
        return { insert: async () => ({ error: null }) };
      }
      return {
        select: () => ({
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
  return { supabase, gravou };
}

const CAPTUR = {
  id: 8506096,
  origem: "sync",
  preco: 92900,
  preco_original: 92900,
  preco_promocional: 0,
  preco_compra: null as unknown,
  whatsapp_images: [],
};
const CITY = { ...CAPTUR, id: 8517481, preco: 119900, preco_original: 119900 };

describe("o servidor recusa o custo implausível antes de gravar", () => {
  it("o 75,1544 do Captur volta 422 e nada é gravado", async () => {
    const { supabase, gravou } = bancoFalso([CAPTUR]);
    const r = await aplicarNosVeiculos(supabase, [8506096], { preco_compra: 75.1544 }, AUTOR, {
      podeVerCusto: true,
    });
    expect(r.status).toBe(422);
    expect(r.erro).toMatch(/10%/);
    expect(gravou).toHaveLength(0);
  });

  it("o 113 do City também", async () => {
    const { supabase, gravou } = bancoFalso([CITY]);
    const r = await aplicarNosVeiculos(supabase, [8517481], { preco_compra: 113 }, AUTOR, {
      podeVerCusto: true,
    });
    expect(r.status).toBe(422);
    expect(gravou).toHaveLength(0);
  });

  it("o custo de verdade grava", async () => {
    const { supabase, gravou } = bancoFalso([CAPTUR]);
    const r = await aplicarNosVeiculos(supabase, [8506096], { preco_compra: 75154.4 }, AUTOR, {
      podeVerCusto: true,
    });
    expect(r.erro).toBeUndefined();
    expect(gravou[0].patch).toEqual({ preco_compra: 75154.4 });
  });

  it("o custo ERRADO que já está no banco não trava o resto do salvamento", async () => {
    // O editor reenvia `preco_compra` em todo Salvar. Se o reenvio do mesmo
    // valor fosse recusado, os dois carros de 01/10 ficariam sem poder salvar
    // nem a etiqueta até o dono decidir o custo certo — e quem edita a etiqueta
    // não sabe o custo. A recusa é para o valor NOVO; o velho, a tela avisa.
    const { supabase, gravou } = bancoFalso([{ ...CAPTUR, preco_compra: "75.15" }]);
    const r = await aplicarNosVeiculos(
      supabase,
      [8506096],
      { preco_compra: 75.15, status_tag: "Oferta" },
      AUTOR,
      { podeVerCusto: true },
    );
    expect(r.erro).toBeUndefined();
    expect(gravou).toHaveLength(1);
  });

  it("trocar um custo errado por OUTRO errado continua recusado", async () => {
    const { supabase, gravou } = bancoFalso([{ ...CAPTUR, preco_compra: "75.15" }]);
    const r = await aplicarNosVeiculos(supabase, [8506096], { preco_compra: 75.154 }, AUTOR, {
      podeVerCusto: true,
    });
    expect(r.status).toBe(422);
    expect(gravou).toHaveLength(0);
  });
});

describe("no cadastro de veículo novo", () => {
  const base = {
    marca: "Renault",
    modelo: "Captur",
    ano: "2022",
    quilometragem: "40000",
    chassi: "9BWZZZ377VT004251",
    preco: "92.900",
  };

  it("o preço anunciado com ponto de milhar é lido inteiro", () => {
    expect(normalizarCadastro(base).preco).toBe(92900);
    expect(normalizarCadastro(base).preco_original).toBe(92900);
    expect(normalizarCadastro({ ...base, preco_promocional: "89.900" }).preco).toBe(89900);
  });

  it("custo digitado como na nota passa", () => {
    expect(validarCadastroDeVeiculo({ ...base, preco_compra: "75.154,40" })).toEqual([]);
  });

  it("custo implausível vira problema no campo do custo", () => {
    const problemas = validarCadastroDeVeiculo({ ...base, preco_compra: "75,15" });
    expect(problemas.find((p) => p.campo === "preco_compra")?.mensagem).toMatch(/10%/);
  });

  it("custo que não dá para ler vira problema, em vez de virar 75,15", () => {
    const problemas = validarCadastroDeVeiculo({ ...base, preco_compra: "75.15440" });
    expect(problemas.find((p) => p.campo === "preco_compra")?.mensagem).toMatch(/75\.154,40/);
  });

  it("preço que não dá para ler também", () => {
    const problemas = validarCadastroDeVeiculo({ ...base, preco: "92.9000" });
    expect(problemas.some((p) => p.campo === "preco")).toBe(true);
  });
});
