import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ehAgendamento,
  podeAjustarValoresDoNegocio,
  podeDecidirAprovacao,
  podeExcluirLancamento,
  podeVerRelatorios,
  precisaDeAprovacao,
} from "../src/lib/alcada";
import { ALCADA_DO_PERFIL, MATRIZ_DE_PERMISSOES } from "../src/lib/permissoes";

/**
 * Aprovação de agendamento financeiro.
 *
 * ⚠️ Esta suíte já travou uma régua DIFERENTE. Entre 2026-08-07 e 2026-08-21 a
 * matriz A17 dizia "alçada de R$ 1.500 no gerente", e no dia 21 o dono
 * desfez: *"essa regra de 1.500 reais não faz sentido no financeiro"*. O que
 * decide agora é o ATO — agendar pagamento vai ao Gestor, registrar pagamento
 * já feito não vai a ninguém.
 *
 * O que está travado aqui, porque errar é caro dos dois lados (régua frouxa
 * deixa comprometer caixa sem revisor; régua apertada trava o fluxo diário da
 * adm/financeira e sabota a adoção):
 *
 *  1. nenhum limiar em reais sobrou no código — valor não decide mais nada;
 *  2. agendamento sobe, registro retroativo passa, a receber nunca sobe;
 *  3. quem pode aprovar não gera pendência para si mesmo;
 *  4. quem decide sai da MATRIZ, não de uma lista de papéis embutida.
 */

describe("a régua não é mais um valor", () => {
  it("a alçada do Financeiro deixou de ser um número", () => {
    // A trava contra reintroduzir o limiar por descuido: se alguém voltar a
    // escrever "R$ 1.500" (ou qualquer valor) na matriz, este teste cai.
    expect(ALCADA_DO_PERFIL.financeiro).toBe("Agendamento vai ao Gestor");
    expect(ALCADA_DO_PERFIL.financeiro).not.toMatch(/\d/);
  });

  it("nenhuma observação da matriz promete um limite em reais", () => {
    for (const l of MATRIZ_DE_PERMISSOES) {
      expect(l.observacao, `linha "${l.acao}" ainda cita um valor`).not.toMatch(/R\$\s*\d/);
    }
  });
});

describe("ehAgendamento — o que é decisão de gasto", () => {
  it("a pagar em aberto é agendamento", () => {
    for (const status of ["pendente", "vencido", "parcial", undefined]) {
      expect(ehAgendamento("pagar", status), `status ${status}`).toBe(true);
    }
  });

  it("a pagar já liquidada ou cancelada é registro, não agendamento", () => {
    expect(ehAgendamento("pagar", "pago")).toBe(false);
    expect(ehAgendamento("pagar", "cancelado")).toBe(false);
  });

  it("a receber nunca é agendamento — alçada é sobre gasto", () => {
    expect(ehAgendamento("receber", "pendente")).toBe(false);
  });
});

describe("precisaDeAprovacao", () => {
  const financeiro = { perfis: ["financeiro"] as string[] };

  it("o Financeiro agenda e sobe para o Gestor", () => {
    expect(precisaDeAprovacao({ tipo: "pagar", status: "pendente", ...financeiro })).toBe(true);
    // Sem status: o padrão do formulário é pendente.
    expect(precisaDeAprovacao({ tipo: "pagar", ...financeiro })).toBe(true);
  });

  it("registro retroativo passa direto — é o fluxo diário da operação", () => {
    // "Faço os lançamentos após os pagamentos serem realizados" (briefing
    // 2026-08-21). O dinheiro já saiu: travar o registro só esconde o rastro.
    expect(precisaDeAprovacao({ tipo: "pagar", status: "pago", ...financeiro })).toBe(false);
    expect(precisaDeAprovacao({ tipo: "pagar", status: "cancelado", ...financeiro })).toBe(false);
  });

  it("a receber não sobe", () => {
    expect(precisaDeAprovacao({ tipo: "receber", status: "pendente", ...financeiro })).toBe(false);
  });

  it("quem aprova não gera pendência para si mesmo", () => {
    // Pedir que o Gestor aprove o próprio agendamento é burocracia sem
    // revisor — e deixaria a fila cheia de itens que ninguém precisa olhar.
    for (const perfis of [["admin"], ["gestor"], ["gestor", "financeiro"]]) {
      expect(precisaDeAprovacao({ tipo: "pagar", status: "pendente", perfis })).toBe(false);
    }
  });

  it("papel nenhum não vira licença para agendar", () => {
    // Lista vazia é "não é da equipe" — a mesma leitura de `podeFazer`.
    expect(precisaDeAprovacao({ tipo: "pagar", status: "pendente", perfis: [] })).toBe(true);
  });
});

describe("quem decide, quem lê, quem ajusta o negócio", () => {
  it("aprova agendamento: Admin e Gestor; o Financeiro não aprova o próprio", () => {
    expect(podeDecidirAprovacao(["admin"])).toBe(true);
    expect(podeDecidirAprovacao(["gestor"])).toBe(true);
    expect(podeDecidirAprovacao(["financeiro"])).toBe(false);
    expect(podeDecidirAprovacao(["comercial"])).toBe(false);
    expect(podeDecidirAprovacao(["marketing"])).toBe(false);
    expect(podeDecidirAprovacao([])).toBe(false);
    // Multi-papel soma: quem é financeiro E gestor decide.
    expect(podeDecidirAprovacao(["financeiro", "gestor"])).toBe(true);
  });

  it("relatórios: Admin, Gestor e Financeiro — o pedido do dono ao Gestor", () => {
    expect(podeVerRelatorios(["gestor"])).toBe(true);
    expect(podeVerRelatorios(["financeiro"])).toBe(true);
    expect(podeVerRelatorios(["admin"])).toBe(true);
    expect(podeVerRelatorios(["comercial"])).toBe(false);
    expect(podeVerRelatorios(["marketing"])).toBe(false);
  });

  it("valores do negócio (entrada e saída): Admin, Gestor e Financeiro", () => {
    // "Ajustar valores de negócios de carro, entrada e saída" — entrada é o
    // custo de aquisição, saída é o preço. O Comercial mexe no preço só
    // dentro dos 5%, então não ajusta o negócio: a função exige as duas.
    expect(podeAjustarValoresDoNegocio(["gestor"])).toBe(true);
    expect(podeAjustarValoresDoNegocio(["admin"])).toBe(true);
    expect(podeAjustarValoresDoNegocio(["financeiro"])).toBe(true);
    expect(podeAjustarValoresDoNegocio(["comercial"])).toBe(false);
    expect(podeAjustarValoresDoNegocio(["marketing"])).toBe(false);
  });

  it("apagar lançamento é só do Admin — quem aprova não apaga a prova", () => {
    // Decisão de 2026-08-21, junto com "quem aprova pagamento no dia a dia é
    // o Gestor": hoje a mesma pessoa que libera um agendamento poderia, em
    // seguida, apagar a conta, a movimentação de caixa que a baixa gerou e a
    // trilha da própria decisão — some tudo junto e sem log.
    expect(podeExcluirLancamento(["admin"])).toBe(true);
    expect(podeExcluirLancamento(["gestor"])).toBe(false);
    expect(podeExcluirLancamento(["financeiro"])).toBe(false);
    expect(podeExcluirLancamento(["gestor", "financeiro"])).toBe(false);
    expect(podeExcluirLancamento([])).toBe(false);
    // Admin como papel secundário continua sendo admin — multi-papel soma.
    expect(podeExcluirLancamento(["comercial", "admin"])).toBe(true);
  });

  it("a resposta sai da matriz, não de uma lista embutida na lib", () => {
    // Se a linha da matriz sumir, `podeFazer` devolve "nao_ve" para todo
    // mundo e NINGUÉM decide — a fila trava, em vez de abrir para todos.
    const acoes = MATRIZ_DE_PERMISSOES.map((l) => l.acao);
    expect(acoes).toContain("Aprovar agendamento financeiro");
    expect(acoes).toContain("Ver relatórios gerenciais e DRE");
    expect(acoes).toContain("Excluir lançamento financeiro");
  });
});

// ---------------------------------------------------------------------------
// A migração do estado — o banco guarda a trilha, não a régua
// ---------------------------------------------------------------------------

const sql = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "20260821150000_alcada_de_aprovacao.sql"),
  "utf-8",
)
  .split("\n")
  .filter((linha) => !linha.trimStart().startsWith("--"))
  .join("\n");

describe("migração 20260821150000 — o estado da aprovação", () => {
  it("o CHECK de status conhece aguardando_aprovacao", () => {
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

  it("o carimbo do instante é trigger, não confiança na rota", () => {
    expect(sql).toContain("create trigger trg_carimbar_decisao_de_alcada");
    expect(sql).toMatch(/old\.status = 'aguardando_aprovacao'/);
  });

  it("a autoconferência prova que aguardando não vira vencido", () => {
    // Agendamento parado não é dívida reconhecida — é pedido em análise.
    expect(sql).toContain("perform public.atualizar_contas_vencidas()");
    expect(sql).toMatch(/if v_status <> 'aguardando_aprovacao' then/);
  });

  it("o banco NÃO guarda limiar de valor — a régua é de aplicação", () => {
    // Se um limiar voltar, ele tem que voltar em `lib/alcada.ts`, à vista da
    // matriz — nunca embutido numa constraint que ninguém lê. `\b` protege o
    // teste do carimbo da própria migração (20260821150000 contém "1500").
    expect(sql).not.toMatch(/\b1500\b|alcada_valor|valor_limite|limite_de_alcada/);
  });

  it("se registra no livro-razão (D6)", () => {
    expect(sql).toContain("insert into supabase_migrations.schema_migrations");
    expect(sql).toContain("'20260821150000'");
  });
});

// ---------------------------------------------------------------------------
// A migração da exclusão — a régua também mora na RLS
// ---------------------------------------------------------------------------

const sqlExclusao = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "20260821210000_exclusao_financeira_so_admin.sql"),
  "utf-8",
)
  .split("\n")
  .filter((linha) => !linha.trimStart().startsWith("--"))
  .join("\n");

describe("migração 20260821210000 — só o admin apaga", () => {
  it("is_admin passa a olhar `papeis`", () => {
    // O terceiro gêmeo do bug multi-papel: `role = 'admin'` negava quem tem
    // admin como papel secundário — e é dele que as policies novas dependem.
    expect(sqlExclusao).toContain("create or replace function public.is_admin");
    expect(sqlExclusao).toMatch(/'admin' = any\(papeis\)/);
    expect(sqlExclusao).not.toMatch(/role = 'admin'/);
  });

  it("as quatro tabelas de lançamento são fechadas — e só elas", () => {
    const alvo = sqlExclusao.match(/array\[([^\]]*)\]\s*\n?\s*loop/);
    expect(alvo).not.toBeNull();
    const tabelas = [...alvo![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(tabelas).toEqual(
      ["compras_produtos", "contas", "movimentacoes", "movimentacoes_investidor"].sort(),
    );
    // Cadastro não é lançamento: apagar um parceiro ou uma categoria não
    // apaga dinheiro nenhum, e travar isso só criaria atrito.
    expect(tabelas).not.toContain("parceiros");
    expect(tabelas).not.toContain("categorias_financeiras");
    expect(tabelas).not.toContain("despesas_recorrentes");
  });

  it("DELETE exige is_admin; ler, lançar e corrigir seguem no financeiro", () => {
    expect(sqlExclusao).toMatch(/for delete using \(public\.is_admin\(auth\.uid\(\)\)\)/);
    for (const comando of ["for select", "for insert", "for update"]) {
      expect(sqlExclusao).toContain(comando);
    }
  });

  it("a leitura própria do investidor é recriada, não perdida no caminho", () => {
    // A varredura derruba TODA policy das tabelas alvo — inclusive a que
    // `20260821180000` criou para o investidor ver o próprio extrato. Sem
    // recriar aqui, a área dele ficaria vazia sem erro nenhum.
    expect(sqlExclusao).toContain('create policy "Investidor le o proprio extrato"');
    expect(sqlExclusao).toContain("i.perfil_id = auth.uid()");
  });

  it("a autoconferência prova os três lados com sessão assumida", () => {
    expect(sqlExclusao).toMatch(/ACEITE FALHOU: o financeiro apagou lançamento/);
    expect(sqlExclusao).toMatch(/ACEITE FALHOU: o gestor apagou o lançamento que ele mesmo aprova/);
    expect(sqlExclusao).toMatch(/ACEITE FALHOU: o admin não conseguiu apagar/);
    // E que cancelar continua aberto — senão a alternativa que a decisão
    // pressupõe não existiria.
    expect(sqlExclusao).toMatch(/ACEITE FALHOU: o financeiro não conseguiu CANCELAR/);
  });

  it("se registra no livro-razão (D6)", () => {
    expect(sqlExclusao).toContain("insert into supabase_migrations.schema_migrations");
    expect(sqlExclusao).toContain("'20260821210000'");
  });
});
