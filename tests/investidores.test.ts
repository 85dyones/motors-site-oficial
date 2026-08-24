import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACESSO_DO_INVESTIDOR,
  FORMAS_DE_MOVIMENTACAO,
  TIPOS_DE_MOVIMENTACAO,
  estadoDeAcessoDoInvestidor,
  resumoDeInvestidores,
  saldoDasMovimentacoes,
  validarMovimentacao,
} from "../src/lib/investidores";

/**
 * Controle de investidores (briefing de 2026-08-21).
 *
 * "Precisa estar bem certinho os valores de entrada e saída" — pedido literal
 * da adm/financeira. Num extrato de investidor, um centavo fantasma custa a
 * confiança do painel inteiro; estes testes travam as regras onde errar é
 * dinheiro:
 *
 *  1. valor sempre positivo, o lado mora em `tipo` — o desenho dos contadores
 *     de `conta_vencida`;
 *  2. movimentação em veículo diz QUAL veículo, senão o repasse volta a ser
 *     a bagunça que o briefing descreve;
 *  3. saldo soma em centavos — floats acumulam 0.30000000000000004;
 *  4. os vocabulários da lib espelham os CHECKs da migração — se um lado
 *     mudar sozinho, o teste acusa antes do 500 em produção.
 */

describe("validarMovimentacao — a régua de entrada", () => {
  const valida = {
    investidor_id: "inv-1",
    tipo: "aporte",
    valor: 50000,
    descricao: "Aporte inicial",
  };

  it("aceita o lançamento completo e normaliza o que veio solto", () => {
    const r = validarMovimentacao({
      ...valida,
      valor: "1000.005",
      descricao: "  Aporte de agosto  ",
      data: "2026-08-21",
      forma_pagamento: "pix",
      observacoes: "  ",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Duas casas, como o NUMERIC(12,2) — a tela e o banco guardam o mesmo número.
    expect(r.movimentacao.valor).toBe(1000.01);
    expect(r.movimentacao.descricao).toBe("Aporte de agosto");
    expect(r.movimentacao.observacoes).toBeNull();
    expect(r.movimentacao.data).toBe("2026-08-21");
  });

  it("recusa valor zero, negativo e não numérico", () => {
    // O sinal mora em `tipo`; um valor negativo inverteria o lado em silêncio.
    for (const valor of [0, -100, "abc", undefined]) {
      const r = validarMovimentacao({ ...valida, valor });
      expect(r.ok, `valor ${String(valor)} deveria ser recusado`).toBe(false);
    }
  });

  it("recusa tipo fora do vocabulário e investidor ausente", () => {
    expect(validarMovimentacao({ ...valida, tipo: "emprestimo" }).ok).toBe(false);
    expect(validarMovimentacao({ ...valida, investidor_id: "  " }).ok).toBe(false);
    expect(validarMovimentacao({ ...valida, descricao: "" }).ok).toBe(false);
  });

  it("movimentação em veículo exige dizer qual veículo", () => {
    // "Independente se a retirada é um carro de repasse" — mas sem o código
    // do carro a movimentação não amarra no custo do veículo.
    const semCarro = validarMovimentacao({
      ...valida,
      tipo: "retirada",
      forma_pagamento: "veiculo",
    });
    expect(semCarro.ok).toBe(false);

    const comCarro = validarMovimentacao({
      ...valida,
      tipo: "retirada",
      forma_pagamento: "veiculo",
      veiculo_id: "123456",
    });
    expect(comCarro.ok).toBe(true);
    if (comCarro.ok) expect(comCarro.movimentacao.veiculo_id).toBe("123456");
  });

  it("forma de pagamento desconhecida é recusada; data fora do formato vira nula", () => {
    expect(validarMovimentacao({ ...valida, forma_pagamento: "criptomoeda" }).ok).toBe(false);
    const r = validarMovimentacao({ ...valida, data: "21/08/2026" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.movimentacao.data).toBeNull();
  });
});

describe("saldoDasMovimentacoes — bem certinho", () => {
  it("aportes somam, retiradas subtraem", () => {
    const r = saldoDasMovimentacoes([
      { investidor_id: "a", tipo: "aporte", valor: 50000 },
      { investidor_id: "a", tipo: "aporte", valor: "10000" },
      { investidor_id: "a", tipo: "retirada", valor: 15000 },
    ]);
    expect(r.aportado).toBe(60000);
    expect(r.retirado).toBe(15000);
    expect(r.saldo).toBe(45000);
    expect(r.movimentacoes).toBe(3);
  });

  it("soma em centavos: 0.10 + 0.20 − 0.30 é exatamente zero", () => {
    // Em float puro daria 5.5e-17 — e um saldo "R$ 0,00" exibido como
    // "R$ 0,0000000000000001" é o fim da confiança no painel.
    const r = saldoDasMovimentacoes([
      { investidor_id: "a", tipo: "aporte", valor: 0.1 },
      { investidor_id: "a", tipo: "aporte", valor: 0.2 },
      { investidor_id: "a", tipo: "retirada", valor: 0.3 },
    ]);
    expect(r.saldo).toBe(0);
  });

  it("tipo desconhecido não soma em lado nenhum nem conta", () => {
    const r = saldoDasMovimentacoes([
      { investidor_id: "a", tipo: "aporte", valor: 100 },
      { investidor_id: "a", tipo: "estorno", valor: 999 },
    ]);
    expect(r.saldo).toBe(100);
    expect(r.movimentacoes).toBe(1);
  });
});

describe("resumoDeInvestidores — um card por pessoa", () => {
  it("agrupa por investidor e consolida o total", () => {
    const { investidores, consolidado } = resumoDeInvestidores(
      [
        { id: "fabiano", nome: "Fabiano" },
        { id: "silvio", nome: "Sílvio" },
      ],
      [
        { investidor_id: "fabiano", tipo: "aporte", valor: 80000 },
        { investidor_id: "fabiano", tipo: "retirada", valor: 30000 },
        { investidor_id: "silvio", tipo: "aporte", valor: 45000 },
      ],
    );
    expect(investidores.find((i) => i.id === "fabiano")?.saldo).toBe(50000);
    expect(investidores.find((i) => i.id === "silvio")?.saldo).toBe(45000);
    expect(consolidado.aportado).toBe(125000);
    expect(consolidado.saldo).toBe(95000);
  });

  it("investidor recém-cadastrado aparece zerado, não some", () => {
    const { investidores } = resumoDeInvestidores([{ id: "novo", nome: "Novo" }], []);
    expect(investidores).toHaveLength(1);
    expect(investidores[0].saldo).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// A migração — o SQL afirma o mesmo que a lib
// ---------------------------------------------------------------------------

const migracao = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "20260821120000_financeiro_operacional.sql"),
  "utf-8",
);

/** Só o que o Postgres executa — o padrão de `migracoes.test.ts`. */
const sql = migracao
  .split("\n")
  .filter((linha) => !linha.trimStart().startsWith("--"))
  .join("\n");

describe("migração 20260821120000 — financeiro operacional", () => {
  it("has_finance_access passa a olhar `papeis`, não `role`", () => {
    // O bug: com papeis = {comercial, financeiro}, role espelha 'comercial'
    // e a função antiga negava — RLS fechava o módulo inteiro para quem tem
    // financeiro como segundo papel.
    expect(sql).toContain("create or replace function public.has_finance_access");
    expect(sql).toMatch(/papeis && array\['admin', 'financeiro'\]/);
    expect(sql).toContain("is_active = true");
  });

  it("as duas tabelas nascem com RLS ligada e a porta é has_finance_access", () => {
    for (const tabela of ["investidores", "movimentacoes_investidor"]) {
      expect(sql).toContain(`alter table public.${tabela} enable row level security`);
    }
    // A mesma régua do resto do módulo — nas duas policies, USING e CHECK.
    const policies = sql.match(/has_finance_access\(auth\.uid\(\)\)/g) ?? [];
    expect(policies.length).toBeGreaterThanOrEqual(4);
  });

  it("o CHECK de tipo e o de forma espelham os vocabulários da lib", () => {
    // Se um lado mudar sozinho, a tela passa a ofertar o que o banco recusa
    // (ou o contrário) — e o erro só apareceria como 500 em produção.
    for (const tipo of TIPOS_DE_MOVIMENTACAO) {
      expect(sql).toMatch(new RegExp(`tipo in \\([^)]*'${tipo}'`));
    }
    const checkForma = sql.match(/forma_pagamento in \(([^)]*)\)/);
    expect(checkForma).not.toBeNull();
    const formasDoSql = [...checkForma![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(formasDoSql).toEqual([...FORMAS_DE_MOVIMENTACAO].sort());
  });

  it("valor é positivo por CHECK e o investidor com movimentação é indelével", () => {
    expect(sql).toMatch(/check \(valor > 0\)/);
    // Sem ON DELETE na FK: apagar investidor com movimentação falha — o
    // rastro do dinheiro sobrevive ao cadastro.
    expect(sql).toMatch(/references public\.investidores\(id\)\s*,/);
    expect(sql).not.toMatch(/references public\.investidores\(id\)\s+on delete/);
  });

  it("se registra no livro-razão (D6)", () => {
    expect(sql).toContain("insert into supabase_migrations.schema_migrations");
    expect(sql).toContain("'20260821120000'");
  });
});

/**
 * Estado do acesso — o que o card do investidor mostra sobre `/investidor`.
 *
 * O caso que motiva a régua é `sem_email`: cadastro sem e-mail não vincula
 * NUNCA, porque `reivindicar_investidor()` casa conta e investidor pelo
 * e-mail. Se a tela chamasse isso de "aguardando", a loja esperaria para
 * sempre por um vínculo que não tem por onde acontecer.
 */
describe("estadoDeAcessoDoInvestidor", () => {
  it("com perfil_id preenchido, já acessa o painel", () => {
    expect(estadoDeAcessoDoInvestidor({ perfil_id: "uuid-do-fabiano", email: "f@x.com" })).toBe(
      "com_acesso",
    );
  });

  it("com e-mail e sem vínculo, está aguardando", () => {
    expect(estadoDeAcessoDoInvestidor({ perfil_id: null, email: "igor.pai@x.com" })).toBe(
      "aguardando",
    );
  });

  it("sem e-mail é um beco sem saída, não uma espera", () => {
    // A distinção existe para a loja procurar o defeito no campo vazio do
    // cadastro, e não na conta do Auth ou no papel do usuário.
    expect(estadoDeAcessoDoInvestidor({ perfil_id: null, email: null })).toBe("sem_email");
    expect(estadoDeAcessoDoInvestidor({})).toBe("sem_email");
  });

  it("string em branco não conta como preenchida", () => {
    // Formulário devolve "" quando a pessoa apaga o campo; o banco guarda o
    // vazio como está. Tratar "" como e-mail prometeria um vínculo impossível.
    expect(estadoDeAcessoDoInvestidor({ perfil_id: "   ", email: "  " })).toBe("sem_email");
    expect(estadoDeAcessoDoInvestidor({ perfil_id: "", email: "a@b.com" })).toBe("aguardando");
  });

  it("perfil_id vence o e-mail — quem entrou, entrou", () => {
    // Investidor vinculado que depois teve o e-mail limpo do cadastro
    // continua acessando: o vínculo já está gravado em perfil_id.
    expect(estadoDeAcessoDoInvestidor({ perfil_id: "uuid", email: null })).toBe("com_acesso");
  });

  it("todo estado tem rótulo e explicação para a tela", () => {
    for (const estado of ["com_acesso", "aguardando", "sem_email"] as const) {
      const texto = ACESSO_DO_INVESTIDOR[estado];
      expect(texto.rotulo.length).toBeGreaterThan(0);
      // A explicação é o que diz à pessoa o que FAZER — um rótulo sozinho
      // ("aguardando acesso") não ensina o próximo passo.
      expect(texto.explicacao.length).toBeGreaterThan(40);
    }
  });

  it("a explicação de 'aguardando' aponta o caminho: Admin, papel investidor, mesmo e-mail", () => {
    const t = ACESSO_DO_INVESTIDOR.aguardando.explicacao.toLowerCase();
    expect(t).toContain("admin");
    expect(t).toContain("investidor");
    expect(t).toContain("e-mail");
  });
});
