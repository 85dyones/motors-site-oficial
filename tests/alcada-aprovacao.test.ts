import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALCADA_DO_FINANCEIRO,
  podeDecidirAprovacao,
  precisaDeAprovacao,
} from "../src/lib/alcada";
import { ALCADA_DO_PERFIL } from "../src/lib/permissoes";

/**
 * Alçada de aprovação (briefing 2026-08-21).
 *
 * A linha "alçada de R$ 1.500 no gerente" existe na matriz A17 desde o
 * design doc e nunca teve efeito. Agora tem — e errar aqui é dos dois lados
 * caro: régua frouxa deixa o gerente comprometer qualquer valor sozinho;
 * régua apertada trava o fluxo diário (o lançar-depois-de-pagar da
 * operação) e sabota a adoção que o briefing quer.
 *
 * O que está travado:
 *  1. o número vem do TEXTO da matriz — as duas fontes não podem divergir;
 *  2. exatamente na alçada passa, um centavo acima sobe;
 *  3. os isentos continuam isentos: admin, a receber, registro retroativo;
 *  4. quem decide é só o Admin — inclusive no multi-papel;
 *  5. a migração garante o vocabulário, a trilha e que aguardando não
 *     envelhece para vencido.
 */

describe("ALCADA_DO_FINANCEIRO — uma fonte só", () => {
  it("deriva do texto da matriz A17", () => {
    // Se alguém mudar a alçada na matriz ("R$ 2.000"), o número acompanha;
    // se mudar o formato para algo não parseável, o import da lib explode e
    // a suíte inteira acusa.
    expect(ALCADA_DO_PERFIL.financeiro).toBe("R$ 1.500");
    expect(ALCADA_DO_FINANCEIRO).toBe(1500);
  });
});

describe("precisaDeAprovacao — a régua", () => {
  const base = { tipo: "pagar", perfis: ["financeiro"] as string[] };

  it("na alçada passa; um centavo acima sobe", () => {
    // "Alçada de R$ 1.500" é o que o gerente PODE, inclusive.
    expect(precisaDeAprovacao({ ...base, valorTotal: 1500 })).toBe(false);
    expect(precisaDeAprovacao({ ...base, valorTotal: 1500.01 })).toBe(true);
    expect(precisaDeAprovacao({ ...base, valorTotal: 9000 })).toBe(true);
  });

  it("a régua olha o TOTAL do lançamento, não a parcela", () => {
    // 4x de R$ 1.499 = R$ 5.996 comprometidos — parcelar não pode ser a
    // porta de evasão. Quem chama passa o total; este teste documenta o
    // contrato do nome do campo.
    expect(precisaDeAprovacao({ ...base, valorTotal: 4 * 1499 })).toBe(true);
  });

  it("admin não tem limite — inclusive no multi-papel", () => {
    expect(precisaDeAprovacao({ ...base, perfis: ["admin"], valorTotal: 90000 })).toBe(false);
    expect(
      precisaDeAprovacao({ ...base, perfis: ["financeiro", "admin"], valorTotal: 90000 }),
    ).toBe(false);
  });

  it("a receber nunca sobe — alçada é sobre gasto", () => {
    expect(precisaDeAprovacao({ ...base, tipo: "receber", valorTotal: 90000 })).toBe(false);
  });

  it("registro retroativo (pago/cancelado) passa; em aberto sobe", () => {
    // O fluxo diário da operação é lançar DEPOIS de pagar: o dinheiro já
    // saiu, travar o registro só esconderia o rastro. `conta_criada` segue
    // avisando o admin de tudo.
    expect(precisaDeAprovacao({ ...base, valorTotal: 9000, status: "pago" })).toBe(false);
    expect(precisaDeAprovacao({ ...base, valorTotal: 9000, status: "cancelado" })).toBe(false);
    expect(precisaDeAprovacao({ ...base, valorTotal: 9000, status: "pendente" })).toBe(true);
    // Status ausente é pendente — o padrão do formulário.
    expect(precisaDeAprovacao({ ...base, valorTotal: 9000 })).toBe(true);
  });

  it("valor não numérico não sobe nem explode", () => {
    expect(precisaDeAprovacao({ ...base, valorTotal: NaN })).toBe(false);
  });
});

describe("podeDecidirAprovacao — só o Admin", () => {
  it("financeiro não aprova o que não podia lançar", () => {
    expect(podeDecidirAprovacao(["financeiro"])).toBe(false);
    expect(podeDecidirAprovacao(["comercial", "financeiro"])).toBe(false);
    expect(podeDecidirAprovacao(["admin"])).toBe(true);
    expect(podeDecidirAprovacao(["financeiro", "admin"])).toBe(true);
    expect(podeDecidirAprovacao([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A migração — vocabulário, trilha e o não-envelhecimento
// ---------------------------------------------------------------------------

const migracao = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "20260821150000_alcada_de_aprovacao.sql"),
  "utf-8",
);

/** Só o que o Postgres executa — o padrão de `migracoes.test.ts`. */
const sql = migracao
  .split("\n")
  .filter((linha) => !linha.trimStart().startsWith("--"))
  .join("\n");

describe("migração 20260821150000 — alçada de aprovação", () => {
  it("o CHECK de status ganha aguardando_aprovacao sem perder o vocabulário antigo", () => {
    const check = sql.match(/contas_status_check\s+check \(status in \(([^)]*)\)\)/);
    expect(check).not.toBeNull();
    const status = [...check![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(status).toEqual(
      ["aguardando_aprovacao", "cancelado", "pago", "parcial", "pendente", "vencido"].sort(),
    );
  });

  it("a trilha da decisão existe: quem, quando e por quê", () => {
    for (const coluna of ["aprovacao_decidida_por", "aprovacao_decidida_em", "aprovacao_motivo"]) {
      expect(sql).toContain(coluna);
    }
    expect(sql).toMatch(/aprovacao_decidida_por uuid references public\.profiles\(id\)/);
  });

  it("o carimbo do instante da decisão é trigger, não confiança na rota", () => {
    expect(sql).toContain("create trigger trg_carimbar_decisao_de_alcada");
    expect(sql).toMatch(/old\.status = 'aguardando_aprovacao'/);
  });

  it("a autoconferência prova que aguardando não vira vencido", () => {
    // `atualizar_contas_vencidas()` só toca `pendente`; aguardando aprovação
    // não é dívida reconhecida — é pedido em análise. A migração roda a
    // rotina contra uma conta aguardando vencida há 30 dias e exige que o
    // status fique de pé.
    expect(sql).toContain("perform public.atualizar_contas_vencidas()");
    expect(sql).toMatch(/if v_status <> 'aguardando_aprovacao' then/);
  });

  it("se registra no livro-razão (D6)", () => {
    expect(sql).toContain("insert into supabase_migrations.schema_migrations");
    expect(sql).toContain("'20260821150000'");
  });
});
