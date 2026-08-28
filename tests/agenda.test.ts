import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ORIGENS,
  CAMPOS_EDITAVEIS,
  ROTULO_DO_PAPEL,
  acharDuplicatas,
  chaveDaPessoa,
  contarPorPapel,
  filtroDeBusca,
  normalizarDocumento,
  normalizarNome,
  papeisQueContam,
  rotearEdicao,
  termoDeBusca,
  type OrigemDaAgenda,
  type PessoaDaAgenda,
} from "../src/lib/agenda";
import { MATRIZ_DE_PERMISSOES, podeFazer } from "../src/lib/permissoes";

/**
 * A agenda de pessoas — clientes, fornecedores, prestadores e investidores.
 *
 * Pedido do dono em 2026-08-24: *"precisamos ter uma aba clientes, hoje temos
 * os cadastros auxiliares, mas não tá legal, o revenda tem uma área de
 * clientes sejam internos ou externos, fornecedores... pra organizar tudo e
 * termos como gerenciar"*.
 *
 * A view `agenda_de_pessoas` une os quatro cadastros no banco e é testada
 * contra Postgres de verdade em `migracoes-executam.test.ts`. Aqui ficam as
 * regras que rodam fora do banco — e três invariantes de fronteira, porque é
 * na costura entre camadas que este módulo vem sangrando: uma tela que
 * oferece campo que a rota recusa, uma rota que lê coluna que a view não tem,
 * um menu que abre porta que o proxy não guarda.
 */

// ---------------------------------------------------------------------------
// Filtro por papel
// ---------------------------------------------------------------------------

describe("papeisQueContam", () => {
  it("quem filtra por cliente também vê quem é cliente E fornecedor", () => {
    // O `ambos` é o parceiro mais usado da base — a oficina que presta serviço
    // e compra carro. Deixá-lo de fora do filtro seria esconder justamente
    // ele, sem erro nenhum na tela: ausência silenciosa, o modo de falha que
    // este módulo colecionou o mês inteiro.
    expect(papeisQueContam("cliente")).toEqual(["cliente", "ambos"]);
    expect(papeisQueContam("fornecedor")).toEqual(["fornecedor", "ambos"]);
  });

  it("papel desconhecido devolve lista vazia, não lista cheia", () => {
    // A rota transforma isso em 400. O contrário — cair no "sem filtro" —
    // faria um filtro errado devolver a base inteira parecendo certo.
    expect(papeisQueContam("gerente")).toEqual([]);
    expect(papeisQueContam("")).toEqual([]);
  });

  it("prestador e investidor não arrastam ninguém junto", () => {
    expect(papeisQueContam("prestador")).toEqual(["prestador"]);
    expect(papeisQueContam("investidor")).toEqual(["investidor"]);
  });
});

describe("contarPorPapel", () => {
  it("o `ambos` soma nos dois lados, igual ao filtro", () => {
    // Contador que discorda do filtro faz duvidar dos dois: a tela diria
    // "3 fornecedores" e a lista mostraria 4.
    const conta = contarPorPapel([
      { origem: "financeiro", id: "1", nome: "A", papel: "ambos", ativo: true },
      { origem: "financeiro", id: "2", nome: "B", papel: "fornecedor", ativo: true },
    ]);
    expect(conta.fornecedor).toBe(2);
    expect(conta.cliente).toBe(1);
    expect(conta.ambos).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Roteamento da edição
// ---------------------------------------------------------------------------

describe("rotearEdicao", () => {
  it("traduz o campo genérico para a coluna da tabela certa", () => {
    // O telefone do cliente do Ciclo se chama `telefone_e164`. Sem a tradução
    // o UPDATE iria para uma coluna que não existe.
    expect(rotearEdicao("ciclo", { telefone: "+5541999990000" })).toEqual({
      tabela: "clientes",
      valores: { telefone_e164: "+5541999990000" },
    });
    expect(rotearEdicao("financeiro", { papel: "ambos" })).toEqual({
      tabela: "parceiros",
      valores: { tipo: "ambos" },
    });
  });

  it("RECUSA campo não editável em vez de ignorar em silêncio", () => {
    // `cpf_cnpj` é UNIQUE e é a identidade de quem tem contrato de 36 meses.
    // A alternativa cômoda — descartar o campo e devolver 200 — é o defeito
    // que já mordeu este módulo três vezes (o DELETE recusado pela RLS que
    // respondia sucesso, o rollback que era no-op, a lista que mostrava uma
    // fatia como se fosse tudo).
    expect(() => rotearEdicao("ciclo", { documento: "123" })).toThrow(/não editável/i);
    expect(() => rotearEdicao("rede", { email: "a@b.c" })).toThrow(/não editável/i);
  });

  it("origem desconhecida e patch vazio param antes do banco", () => {
    expect(() => rotearEdicao("inventada", { nome: "X" })).toThrow(/desconhecida/i);
    expect(() => rotearEdicao("financeiro", {})).toThrow(/nenhum campo/i);
    // `origem` e `id` endereçam a linha; não são valores para gravar. Se
    // passassem, o UPDATE tentaria escrever numa coluna `origem` que a tabela
    // não tem.
    expect(() => rotearEdicao("financeiro", { origem: "financeiro", id: "x" })).toThrow(
      /nenhum campo/i,
    );
  });

  it("investidor edita contato, mas a tabela do dinheiro não é esta", () => {
    expect(rotearEdicao("investidores", { telefone: "41999" })).toEqual({
      tabela: "investidores",
      valores: { telefone: "41999" },
    });
    // Aporte e retirada vivem em `movimentacoes_investidor` e continuam na
    // tela de investidores: dinheiro de sócio não se edita de passagem numa
    // lista de contatos.
    expect(() => rotearEdicao("investidores", { valor: 1000 })).toThrow(/não editável/i);
  });
});

// ---------------------------------------------------------------------------
// Busca
// ---------------------------------------------------------------------------

describe("termoDeBusca", () => {
  it("tira o que quebra a gramática do PostgREST", () => {
    // Vírgula separa os ramos de um `or=(...)`; parêntese delimita o grupo.
    // Um nome digitado como "Silva, João" não daria erro: partiria o filtro
    // ao meio e o servidor obedeceria a um filtro que ninguém escreveu.
    expect(termoDeBusca("Silva, João")).toBe("Silva João");
    expect(termoDeBusca('Auto (Center) "Norte"')).toBe("Auto Center Norte");
    expect(termoDeBusca("barra\\invertida")).toBe("barra invertida");
  });

  it("preserva o ponto e o traço, que são o CNPJ digitado", () => {
    expect(termoDeBusca("12.345.678/0001-90")).toBe("12.345.678/0001-90");
  });

  it("termo vazio vira null — 'traga tudo', nunca 'traga nada'", () => {
    expect(termoDeBusca("   ")).toBeNull();
    expect(termoDeBusca(null)).toBeNull();
    expect(termoDeBusca(",,,")).toBeNull();
  });

  it("o filtro montado varre as quatro colunas", () => {
    const f = filtroDeBusca("acme");
    for (const coluna of ["nome", "documento", "email", "telefone"]) {
      expect(f).toContain(`${coluna}.ilike.*acme*`);
    }
  });
});

// ---------------------------------------------------------------------------
// Duplicatas
// ---------------------------------------------------------------------------

const pessoa = (p: Partial<PessoaDaAgenda>): PessoaDaAgenda => ({
  origem: "financeiro",
  id: Math.random().toString(36).slice(2),
  nome: "Sem nome",
  papel: "fornecedor",
  ativo: true,
  ...p,
});

describe("acharDuplicatas", () => {
  it("acha o mesmo documento em cadastros diferentes", () => {
    // É o caso que motivou o pedido: a mesma oficina cadastrada como
    // fornecedor no financeiro e como prestador na rede do Ciclo, com duas
    // grafias — e nenhuma tela que olhasse os dois juntos.
    const grupos = acharDuplicatas([
      pessoa({ nome: "Auto Center Norte", documento: "12.345.678/0001-90" }),
      pessoa({ nome: "AUTOCENTER NORTE LTDA", documento: "12345678000190", origem: "rede", papel: "prestador" }),
      pessoa({ nome: "Outro", documento: "99999999000199" }),
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].motivo).toBe("documento");
    expect(grupos[0].pessoas).toHaveLength(2);
  });

  it("nome igual é suspeita, e vem marcado como tal", () => {
    // Existem dois "João da Silva". A tela oferece "unificar" para prova e
    // apenas "olhe isto" para suspeita — um alerta que erra vira alerta
    // ignorado.
    const grupos = acharDuplicatas([
      pessoa({ nome: "João da Silva" }),
      pessoa({ nome: "joão  DA silva", origem: "ciclo", papel: "cliente" }),
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].motivo).toBe("nome");
  });

  it("quem já foi pego pela prova não volta como suspeita", () => {
    // Repetir a mesma dupla em dois avisos faz o segundo parecer um caso novo,
    // e o contador da tela dobrar sem que nada tenha dobrado.
    const grupos = acharDuplicatas([
      pessoa({ nome: "ACME", documento: "11111111000111" }),
      pessoa({ nome: "ACME", documento: "111.111.110-00111", origem: "rede", papel: "prestador" }),
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].motivo).toBe("documento");
  });

  it("documento curto demais não agrupa estranhos com cara de prova", () => {
    const grupos = acharDuplicatas([
      pessoa({ nome: "Um", documento: "0" }),
      pessoa({ nome: "Dois", documento: "-" }),
    ]);
    expect(grupos).toHaveLength(0);
  });

  it("a ordem é estável: prova antes de suspeita", () => {
    // Sem ordenação explícita a mesma base renderiza diferente a cada leitura,
    // e o operador acha que algo mudou.
    const grupos = acharDuplicatas([
      pessoa({ nome: "Zeta" }),
      pessoa({ nome: "zeta" }),
      pessoa({ nome: "Alfa", documento: "22222222000122" }),
      pessoa({ nome: "Alpha", documento: "22222222000122", origem: "ciclo", papel: "cliente" }),
    ]);
    expect(grupos.map((g) => g.motivo)).toEqual(["documento", "nome"]);
  });

  it("base sem repetição não inventa aviso", () => {
    expect(acharDuplicatas([pessoa({ nome: "Único", documento: "33333333000133" })])).toEqual([]);
    expect(acharDuplicatas([])).toEqual([]);
  });
});

describe("normalização", () => {
  it("documento é o mesmo número com ou sem pontuação", () => {
    expect(normalizarDocumento("12.345.678/0001-90")).toBe("12345678000190");
    expect(normalizarDocumento(null)).toBe("");
  });

  it("nome perde acento, caixa e espaço dobrado", () => {
    expect(normalizarNome("  José   DA Silva ")).toBe("jose da silva");
  });

  it("a chave de uma linha carrega a origem, não só o id", () => {
    // São quatro tabelas. Ainda que uuid não colida na prática, a chave
    // composta é a que diz a verdade sobre o que a linha é.
    expect(chaveDaPessoa({ origem: "ciclo", id: "abc" })).toBe("ciclo:abc");
  });
});

// ---------------------------------------------------------------------------
// Invariantes de fronteira
// ---------------------------------------------------------------------------

const RAIZ = join(__dirname, "..");
const ler = (...partes: string[]) => readFileSync(join(RAIZ, ...partes), "utf-8");

describe("as bordas da agenda concordam entre si", () => {
  it("toda origem tem rótulo, tabela e lista de campos editáveis", () => {
    for (const origem of Object.keys(ORIGENS) as OrigemDaAgenda[]) {
      expect(ORIGENS[origem].tabela).toBeTruthy();
      expect(ORIGENS[origem].rotulo).toBeTruthy();
      expect(CAMPOS_EDITAVEIS[origem]).toBeDefined();
    }
    // E nada sobrando do outro lado: um mapa de campos para uma origem que a
    // view não produz é código que nunca roda e engana quem lê.
    expect(Object.keys(CAMPOS_EDITAVEIS).sort()).toEqual(Object.keys(ORIGENS).sort());
  });

  it("todo papel que a view produz tem rótulo na tela", () => {
    // Papel sem rótulo apareceria cru ("ambos") no meio de rótulos escritos.
    //
    // Os papéis chegam à view por dois caminhos, e o teste cobre os dois:
    // três são literais escritos na própria migração; `fornecedor`, `cliente`
    // e `ambos` do ramo do financeiro vêm da COLUNA `parceiros.tipo`, cujo
    // CHECK mora no bootstrap. Por isso o `p.tipo as papel` é verificado como
    // caminho, e o vocabulário inteiro é verificado como rótulo.
    const sql = ler("supabase", "migrations", "20260824190000_agenda_de_pessoas.sql");
    for (const literal of ["cliente", "prestador", "investidor"]) {
      expect(sql).toContain(`'${literal}'::text`);
    }
    expect(sql).toMatch(/p\.tipo\s+as papel/);

    for (const papel of Object.keys(ROTULO_DO_PAPEL)) {
      expect(ROTULO_DO_PAPEL[papel as keyof typeof ROTULO_DO_PAPEL]).toBeTruthy();
    }
    // `lead` entra em 2026-08-28 pela migração do funil, que acrescenta um
    // quinto ramo à mesma view. O literal é verificado lá, não aqui.
    const sqlFunil = ler("supabase", "migrations", "20260828120000_funil_de_vendas.sql");
    expect(sqlFunil).toContain("'lead'::text");

    // O vocabulário completo, para que um papel novo na view force a passagem
    // por aqui em vez de aparecer cru na tela.
    expect(Object.keys(ROTULO_DO_PAPEL).sort()).toEqual(
      ["ambos", "cliente", "fornecedor", "investidor", "lead", "prestador"],
    );
  });

  it("o lead entra na agenda sem virar mais um lugar para editá-lo", () => {
    // O pedido do dono foi *"todo lead precisa ir para a aba de clientes e
    // fornecedores também"*, e não "editável de lá". Toda gravação em `leads`
    // passa pelo gatilho que reinicia o relógio da estagnação e escreve no
    // rastro: corrigir um telefone numa lista de contatos apagaria a cobrança
    // de um lead que ninguém atendeu, e o rastro registraria "atendimento"
    // onde houve digitação.
    expect(CAMPOS_EDITAVEIS.lead).toEqual({});
    expect(() => rotearEdicao("lead", { telefone: "41999999999" })).toThrow();

    // E a agenda diz onde ele se gerencia de verdade.
    expect(ORIGENS.lead.casa).toBe("/admin/leads");
    expect(ORIGENS.lead.tabela).toBe("leads");
  });

  it("as colunas que a rota pede são as que a view entrega", () => {
    // O defeito que este teste evita: renomear uma coluna na migração e
    // deixar o `select` da rota pedindo a antiga. O PostgREST devolveria erro
    // 400 só em runtime, e só na tela de quem abrisse a agenda.
    const rota = ler("src", "app", "api", "pessoas", "route.ts");
    const sql = ler("supabase", "migrations", "20260824190000_agenda_de_pessoas.sql");

    const declaradas = rota.match(/const COLUNAS = "([^"]+)"/);
    expect(declaradas).not.toBeNull();

    const semComentario = sql
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");

    for (const coluna of declaradas![1].split(",").map((c) => c.trim())) {
      // Cada coluna aparece como apelido no primeiro ramo do union.
      expect(semComentario).toMatch(new RegExp(`as\\s+${coluna}\\b`));
    }
  });

  it("a view é security_invoker — e a migração quebra se não for", () => {
    // Sem a opção, a view roda com os privilégios de quem a criou (o dono do
    // banco, que ignora RLS) e vira um cano que despeja a base inteira de CPFs
    // para qualquer `authenticated` — inclusive o cliente da Garagem.
    const sql = ler("supabase", "migrations", "20260824190000_agenda_de_pessoas.sql");
    expect(sql).toContain("security_invoker = true");
    expect(sql).toContain("ACEITE FALHOU");
    // E a autoconferência não se contenta com ler o reloption: ela veste a
    // pele de um não-staff e tenta ler.
    expect(sql).toContain("set local role authenticated");
  });

  it("o proxy guarda a porta que o menu abre", () => {
    // O menu ganhou "Clientes e fornecedores". Se o gate do proxy não ganhar
    // a rota junto, o item some para o Marketing no trilho e continua
    // alcançável por URL — o "negado some da interface" viraria "negado fica
    // escondido".
    //
    // A asserção olha a CONDIÇÃO, não o arquivo. A primeira versão deste teste
    // só procurava a string "/api/pessoas" em `proxy.ts` — e ela também
    // aparece no `matcher`, então o teste continuava verde com o gate
    // arrancado. Foi a falsificação que mostrou isso; o teste que não
    // falsifica é decoração.
    const proxy = ler("src", "proxy.ts");
    expect(proxy).toMatch(/path\.startsWith\("\/admin\/clientes"\)/);
    expect(proxy).toMatch(/path\.startsWith\("\/api\/pessoas"\)/);
    // E o matcher precisa alcançar a rota, senão o gate nunca é consultado.
    expect(proxy).toMatch(/"\/api\/pessoas"/);

    const trilho = ler("src", "components", "admin", "SidebarNav.tsx");
    expect(trilho).toContain('href: "/admin/clientes"');
  });

  it("a matriz A17 tem a linha, e o Marketing não vê contato individual", () => {
    const acoes = MATRIZ_DE_PERMISSOES.map((l) => l.acao);
    expect(acoes).toContain("Gerenciar clientes e fornecedores");

    // A régua vem da linha vizinha: "Marketing vê só o volume agregado" de
    // leads. Uma agenda de CPF e telefone não pode ser a porta lateral que
    // devolve o que o kanban nega.
    expect(podeFazer("marketing", "Gerenciar clientes e fornecedores")).toBe("nao_ve");
    for (const p of ["admin", "gestor", "comercial", "financeiro"] as const) {
      expect(podeFazer(p, "Gerenciar clientes e fornecedores")).toBe("faz");
    }
  });
});
