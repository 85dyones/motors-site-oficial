import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STATUS_DA_LISTA_EM_ABERTO, STATUS_EM_ABERTO } from "../src/lib/alcada";

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
    expect(lista).toContain("<option value={EM_ABERTO}>Em aberto</option>");
  });

  it("'em aberto' inclui conta paga pela metade", () => {
    // O dinheiro que falta continua devido. Este é o filtro que ABRE a tela:
    // omitir `parcial` aqui era sepultar em silêncio exatamente o tipo de
    // pendência que a lista existe para mostrar — o mesmo defeito da posição
    // 709, com outra roupa.
    expect(STATUS_DA_LISTA_EM_ABERTO).toContain("parcial");
  });

  it("a lista da tela não é escrita à mão — deriva de lib/alcada", () => {
    // Duas listas é como uma delas fica para trás, e foi o que aconteceu:
    // `ehAgendamento`, `financeiroDia.aberta` e `podeDarBaixa` incluíam
    // `parcial`; só a constante desta tela não incluía.
    expect(lista).toContain("STATUS_DA_LISTA_EM_ABERTO");
    expect(lista).toContain("const EM_ABERTO = STATUS_DA_LISTA_EM_ABERTO.join(\",\")");
    expect(lista).not.toMatch(/const EM_ABERTO = ["\']/);
  });

  it("a fila de aprovação entra na lista da tela, mas não no compromisso", () => {
    // São perguntas diferentes: a tela mostra "o que pede ação hoje", e um
    // pedido parado na fila pede ação de alguém. `ehAgendamento` pergunta se
    // o pagamento já foi decidido — e um pedido na fila ainda não foi.
    expect(STATUS_DA_LISTA_EM_ABERTO).toContain("aguardando_aprovacao");
    expect(STATUS_EM_ABERTO as readonly string[]).not.toContain("aguardando_aprovacao");
    // Nada se perde na travessia de uma lista para a outra.
    for (const s of STATUS_EM_ABERTO) {
      expect(STATUS_DA_LISTA_EM_ABERTO as readonly string[]).toContain(s);
    }
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

/**
 * O que o teste do dono revelou em 2026-08-24, depois do módulo no ar.
 *
 * *"continua não aparecendo na lista de aprovações o pagamento, quando
 * lançamos uma compra ou pagamento, ele precisa ser aprovado pelo perfil
 * gestor. não aparece meu teste. Precisamos ajustar esta questão do
 * fornecedor também"*.
 *
 * Dois defeitos independentes, e o primeiro é o mais grave que apareceu neste
 * módulo: a régua de aprovação estava **invertida em relação à própria
 * documentação dela**.
 */
const rapido = ler("src", "components", "financeiro", "LancamentoRapidoModal.tsx");
const alcada = ler("src", "lib", "alcada.ts");
const matriz = ler("src", "lib", "permissoes.ts");

describe("lançar e aprovar viraram dois atos, sempre", () => {
  it("a implementação parou de contradizer a matriz", () => {
    // A matriz sempre disse "Quem agenda não aprova: o Financeiro lança, o
    // Gestor libera". `precisaDeAprovacao` fazia o oposto — quem PODE aprovar
    // pulava a fila — e o efeito só aparecia para quem tinha os dois poderes.
    // O dono é admin, admin aprova, então nenhum lançamento dele passou pela
    // fila desde que ela existe.
    expect(matriz).toContain("Quem agenda não aprova");
    expect(alcada).toContain("return ehAgendamento(l.tipo, l.status);");
    // A negação sumiu: era ela que anulava a régua.
    expect(alcada).not.toContain("return !podeDecidirAprovacao(l.perfis);");
  });

  it("a auto-aprovação é possível e RECONHECÍVEL", () => {
    // Exigir sempre um segundo par de olhos travaria todo pagamento enquanto
    // não houver conta de Gestor — régua contábil impecável que impede a luz
    // de ser paga na segunda. O desenho deixa o gesto possível, separado do
    // lançamento, e visível na trilha.
    expect(alcada).toContain("aprovacaoEhDoProprioAutor");
  });
});

describe("o fornecedor sai do cadastro, não do teclado", () => {
  it("o lançamento rápido virou seleção, com cadastrar como ato deliberado", () => {
    expect(rapido).toContain("/api/financeiro/parceiros");
    expect(rapido).toContain('value="__novo__"');
    expect(rapido).toContain("cadastrandoParceiro");
  });

  it('parou de inventar "Fornecedor Local" quando o campo vem vazio', () => {
    // O fallback antigo gravava um fornecedor fantasma que nunca existiu, e
    // ele somava no DRE como se fosse alguém. Vazio agora é `null` — a
    // ausência registrada como ausência.
    expect(rapido).not.toContain('|| "Fornecedor Local"');
    expect(rapido).not.toContain('|| "Cliente Local"');
    expect(rapido).toContain("(fornecedorCliente || null)");
  });

  it("filtra por tipo: fornecedor em conta a pagar, cliente em conta a receber", () => {
    // P2 do briefing — "separar fornecedor de cliente". O cadastro já
    // separava; faltava a tela respeitar a separação.
    expect(rapido).toContain('p.tipo === "fornecedor" || p.tipo === "ambos"');
    expect(rapido).toContain('p.tipo === "cliente" || p.tipo === "ambos"');
  });
});

describe("o diagnóstico temporário saiu de produção", () => {
  it("o formulário não mostra mais contagem de categorias na tela", () => {
    // Estava marcado "remover após resolver" e foi para produção assim. Sem a
    // tela que o exibia, o estado também sai: código morto faz o próximo
    // leitor procurar onde aparece.
    expect(form).not.toContain("debugInfo");
    expect(form).not.toContain("Diagnóstico temporário");
  });
});
