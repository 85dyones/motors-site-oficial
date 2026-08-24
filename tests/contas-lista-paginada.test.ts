import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A lista de contas não pode esconder lançamento por omissão.
 *
 * 2026-08-24, em produção: uma conta a pagar foi lançada, a tela não deu
 * erro, e o dono não a encontrou — nem em Contas a pagar, nem em Aprovações.
 * O diagnóstico contra o banco mostrou que ela EXISTIA, `pagar`/`pendente`,
 * na posição **709** de uma lista sem paginação ordenada do vencimento mais
 * ANTIGO para o mais novo. A tela abria em julho; o lançamento de hoje ficava
 * setecentas linhas abaixo, sem nenhuma pista de que houvesse mais.
 *
 * É o terceiro caso do mesmo padrão no módulo, e o padrão é o que estes
 * testes guardam: **falha por omissão**. O DELETE que a RLS recusava devolvia
 * sucesso; o rollback por `.delete()` não desfazia nada; e aqui a lista
 * mostrava um recorte como se fosse o todo. Em nenhum dos três havia erro na
 * tela — e é justamente por isso que nenhum foi notado.
 */

const raiz = join(__dirname, "..");
const ler = (...p: string[]) => readFileSync(join(raiz, ...p), "utf-8");

const rota = ler("src", "app", "api", "financeiro", "contas", "route.ts");
const lista = ler("src", "components", "financeiro", "ContasList.tsx");
const relatorios = ler("src", "components", "financeiro", "FinanceRelatorios.tsx");
const aprovacoes = ler("src", "components", "financeiro", "AprovacoesPendentes.tsx");

describe("a rota devolve o total, sempre", () => {
  it("conta as linhas com `count: exact`, não o tamanho da página", () => {
    // Sem isto, "50 de 709" seria "50 de 50" — e a tela mentiria com
    // convicção. O total tem que vir do banco, contando o que o FILTRO
    // encontra, e não do array devolvido.
    expect(rota).toContain('{ count: "exact" }');
    expect(rota).toContain("total: count");
  });

  it("a paginação é OPT-IN — sem `limite`, devolve tudo", () => {
    // Esta é a linha mais importante do arquivo. `FinanceRelatorios` chama
    // esta mesma rota para AGREGAR o balanço; um limite padrão faria o
    // relatório somar sobre um recorte e apresentar o número como total.
    // Seria criar, no lugar mais caro possível, o mesmo defeito que esta
    // mudança existe para eliminar.
    expect(rota).toContain("const limite = Number.isFinite(limiteBruto) && limiteBruto > 0");
    expect(rota).toContain("if (limite !== null) {");
  });

  it("o limite tem teto — `limite=999999` não derruba o banco", () => {
    expect(rota).toContain("Math.min(limiteBruto, 200)");
  });

  it("`status` aceita lista, para 'em aberto' ser uma consulta só", () => {
    expect(rota).toContain('status.split(",")');
    expect(rota).toContain('query.in("status", estados)');
  });
});

describe("a tela abre pela pergunta certa", () => {
  it("filtra 'em aberto' por padrão, e mostra que está filtrando", () => {
    // Filtrar por padrão só é honesto se o seletor exibir o filtro ativo —
    // senão é esconder por omissão de novo, com outra roupa.
    expect(lista).toContain("useState(EM_ABERTO)");
    expect(lista).toContain('const EM_ABERTO = "pendente,vencido,aguardando_aprovacao"');
    expect(lista).toContain("<option value={EM_ABERTO}>Em aberto</option>");
  });

  it("ordena pelo vencimento mais PRÓXIMO, não pelo mais antigo", () => {
    expect(lista).toContain('params.append("ordem", "desc")');
  });

  it("diz quantas existem — o rodapé é o aviso, não só a navegação", () => {
    expect(lista).toContain("setTotal(data.total");
    expect(lista).toContain("Mostrando");
    expect(lista).toContain("{total}");
  });

  it("volta para a página 1 quando o filtro muda", () => {
    // Sem isso, quem está na página 8 e troca o filtro cai num recorte que
    // pode não ter oito páginas — e vê uma lista vazia que parece "não há
    // nada", quando na verdade há.
    expect(lista).toContain("setPagina(1);");
  });
});

describe("os outros consumidores da rota continuam inteiros", () => {
  it("o RELATÓRIO não pede página — ele agrega e precisa de tudo", () => {
    const chamada = relatorios.slice(
      relatorios.indexOf("/api/financeiro/contas"),
      relatorios.indexOf("/api/financeiro/contas") + 200,
    );
    expect(chamada).not.toContain("limite");
    expect(chamada).not.toContain("pagina");
  });

  it("a fila de APROVAÇÕES não pede página", () => {
    const chamada = aprovacoes.slice(
      aprovacoes.indexOf("/api/financeiro/contas"),
      aprovacoes.indexOf("/api/financeiro/contas") + 200,
    );
    expect(chamada).not.toContain("limite");
  });
});

/**
 * A unificação de 2026-08-24: dois menus viraram campos e filtros.
 *
 * Pedido do dono: *"insumo é um tipo de compra, recorrência é um tipo de
 * vencimento, pode ser um check no cadastro da conta a pagar... o painel vai
 * filtrar isso em contas fixas, variáveis"*.
 *
 * O que estes testes guardam é a parte que dá errado silenciosamente numa
 * unificação: a tela some, e junto some um comportamento que ninguém lembrava
 * que dependia dela.
 */
const form = ler("src", "components", "financeiro", "ContaForm.tsx");
const trilho = ler("src", "components", "admin", "SidebarNav.tsx");
const margens = ler("src", "components", "financeiro", "FinanceMargens.tsx");

describe("insumo e recorrência viraram campo, não sumiram", () => {
  it("o formulário tem os três campos de compra de item", () => {
    expect(form).toContain("ehCompraDeItem");
    expect(form).toContain("quantidade");
    expect(form).toContain("valorUnitario");
    expect(form).toContain("notaFiscal");
  });

  it("o formulário tem o check de recorrência com frequência", () => {
    expect(form).toContain("ehRecorrente");
    expect(form).toContain("frequencia");
  });

  it("a recorrência é criada pela ROTA, e passa pela fila do Gestor", () => {
    // Se a tela criasse a recorrente direto, a régua de aprovação ficaria no
    // cliente — onde qualquer um a contorna. Assinar despesa fixa compromete
    // o ano, e é a razão de a fila existir.
    expect(rota).toContain("recorrenteNovaPrecisaDeAprovacao");
    expect(rota).toContain('aprovacao_status: sobeRecorrente ? "aguardando" : "aprovada"');
  });

  it("falhar ao criar a recorrência aborta o gesto inteiro", () => {
    // Criar só a primeira parcela entregaria metade do que foi pedido, em
    // silêncio — a pessoa marcou "repete" e ficaria com uma conta avulsa.
    expect(rota).toContain("Não foi possível criar a recorrência");
  });
});

describe("o filtro de natureza deriva, não etiqueta", () => {
  it("fixa e variável saem de `recorrencia_id`; insumo, de `quantidade`", () => {
    // Derivar de coluna que já existe impede o terceiro estado: a conta
    // marcada "fixa" sem recorrência nenhuma por trás.
    expect(rota).toContain('natureza === "fixa"');
    expect(rota).toContain('query.not("recorrencia_id", "is", null)');
    expect(rota).toContain('natureza === "insumo"');
    expect(rota).toContain('query.not("quantidade", "is", null)');
  });
});

describe("o que a unificação não pode ter quebrado", () => {
  it("o trilho perdeu as duas entradas, e só elas", () => {
    expect(trilho).not.toContain("/admin/financeiro/compras");
    expect(trilho).not.toContain("/admin/financeiro/recorrentes");
    // As que ficam:
    expect(trilho).toContain("/admin/financeiro/contas-pagar");
    expect(trilho).toContain("/admin/financeiro/conciliacao");
    expect(trilho).toContain("/admin/financeiro/investidores");
    expect(trilho).toContain("/admin/financeiro/aprovacoes");
  });

  it("a MARGEM continua somando compra antiga sem contar em dobro", () => {
    // `compras_produtos` para de receber linha nova, mas o histórico fica — e
    // cada compra antiga tem conta vinculada. Sem este filtro, a margem
    // contaria os dois e o custo do carro dobraria.
    expect(margens).toContain("cp.conta_id");
    expect(margens).toContain("contasIds.has(cp.conta_id)");
  });
});
