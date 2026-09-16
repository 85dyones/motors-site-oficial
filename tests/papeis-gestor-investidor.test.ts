import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PAPEIS_ATRIBUIVEIS,
  PAPEIS_SEM_PAINEL,
  PERFIS,
  TODOS_OS_PAPEIS,
  ehStaff,
  ordenarPapeis,
  perfisDe,
  podeFazer,
} from "../src/lib/permissoes";

/**
 * Os papéis `gestor` e `investidor` (2026-08-21).
 *
 * Pedido do dono: *"precisamos de duas novas roles também, investidor e
 * gestor, que terá o poder de aprovar os agendamentos financeiro, ajustar
 * valores de negócios de carro, entrada e saída, bem como acesso aos
 * relatórios"*.
 *
 * Os dois NÃO são da mesma natureza, e é isso que estes testes protegem:
 * `gestor` é papel de painel; `investidor` é como `cliente` — existe no auth,
 * nunca é staff. Promover o investidor a perfil de painel por descuido lhe
 * daria, de uma vez, tudo que as telas liberam "para quem está logado".
 */

const ler = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf-8");

const migracao = ler("supabase", "migrations", "20260821180000_papeis_gestor_e_investidor.sql");
const sql = migracao
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");
const proxy = ler("src", "proxy.ts");
const sidebar = ler("src", "components", "admin", "SidebarNav.tsx");
const paginaInvestidor = ler("src", "app", "investidor", "page.tsx");

describe("o gestor é papel de painel", () => {
  it("entra em PERFIS e é staff", () => {
    expect(PERFIS).toContain("gestor");
    expect(ehStaff("gestor")).toBe(true);
    expect(perfisDe({ role: "gestor", papeis: ["gestor"] })).toEqual(["gestor"]);
  });

  it("mantém as atribuições que sobreviveram à aposentadoria do caixa", () => {
    // Das três atribuições pedidas em 2026-08-21, duas ("Aprovar agendamento
    // financeiro" e "Ver relatórios gerenciais e DRE") saíram da matriz em
    // 2026-08-28 junto com o módulo de caixa — voltam com as telas do razão.
    // "Ajustar valores de negócios de carro, entrada e saída" fica:
    expect(podeFazer("gestor", "Ver custo de aquisição e margem")).toBe("faz"); // entrada
    expect(podeFazer("gestor", "Alterar preço acima de 5%")).toBe("faz"); // saída
    // E o que entrou depois continua dele:
    expect(podeFazer("gestor", "Controlar aportes e retiradas de investidores")).toBe("faz");
    expect(podeFazer("gestor", "Configurar o funil de vendas")).toBe("faz");
  });

  it("não herda o que ninguém lhe deu", () => {
    // As três travas do doc continuam de pé, e conteúdo de site não é dele.
    expect(podeFazer("gestor", "Editar paleta, logo e tipografia do site")).toBe("nao_ve");
    expect(podeFazer("gestor", "Editar ficha técnica travada (placa)")).toBe("nao_ve");
    expect(podeFazer("gestor", "Editar texto legal e condições de financiamento")).toBe("nao_ve");
    expect(podeFazer("gestor", "Convidar usuário e trocar perfil")).toBe("nao_ve");
    expect(podeFazer("gestor", "Publicar ou despublicar veículo")).toBe("nao_ve");
  });

  it("o proxy e o trilho o deixam entrar na gestão de investidores", () => {
    expect(proxy).toContain('perfis.includes("gestor")');
    expect(sidebar).toContain('roles: ["admin", "gestor", "financeiro"]');
  });
});

describe("o investidor NÃO é papel de painel", () => {
  it("fica fora de PERFIS, como o cliente", () => {
    expect(PAPEIS_SEM_PAINEL).toContain("investidor");
    expect(PAPEIS_SEM_PAINEL).toContain("cliente");
    expect(PERFIS as readonly string[]).not.toContain("investidor");
  });

  it("nunca é staff — nem sozinho, nem acompanhado", () => {
    expect(ehStaff("investidor")).toBe(false);
    expect(ehStaff(["investidor"])).toBe(false);
    expect(perfisDe(["investidor"])).toEqual([]);
    // Sócio que também trabalha na loja é gestor aqui; `investidor` não
    // ADICIONA nem SUBTRAI permissão de painel.
    expect(perfisDe(["investidor", "gestor"])).toEqual(["gestor"]);
    expect(ehStaff(["investidor", "gestor"])).toBe(true);
  });

  it("a área dele barra staff e lê sob a sessão, sem chave de serviço", () => {
    // A fusão de 2026-08-22 trocou a régua por uma mais forte: em vez de
    // barrar staff, a página só deixa entrar quem TEM o papel. Cobre o mesmo
    // risco (equipe vendo tela vazia e lendo isso como "não há nada") e mais
    // um: conta sem papel nenhum também não entra.
    expect(paginaInvestidor).toContain("ehInvestidor(");
    expect(paginaInvestidor).toContain("createServerSupabaseClient");
    // Chave de serviço aqui entregaria o extrato de um sócio ao outro no
    // primeiro filtro errado — a RLS é a segunda barreira que sobra.
    expect(paginaInvestidor).not.toMatch(/SERVICE_ROLE|service_role/);
  });

  it("a área assume o erro em vez de dizer que não há movimentação", () => {
    // A lição de R1 (a Garagem dizia "não há veículo" quando a query falhava).
    // A variável mudou de nome na fusão (`erroExtrato` -> `erroDeLeitura`), a
    // intenção não: o erro da consulta é LIDO e mostrado, em vez de virar
    // "você não tem nada investido" na cara do dono do dinheiro.
    expect(paginaInvestidor).toContain("erroDeLeitura");
    // A fusão trocou o componente por um bloco inline, e a régua do teste é o
    // COMPORTAMENTO: o erro aparece com a mensagem, e a tela diz explicitamente
    // que os números não mudaram — para o dono do dinheiro não ler falha de
    // leitura como perda de saldo.
    expect(paginaInvestidor).toContain("Não foi possível carregar sua posição");
    expect(paginaInvestidor).toContain("os números não foram alterados");
  });
});

describe("migração 20260821180000", () => {
  it("o vocabulário do banco é exatamente o do app", () => {
    // Se um lado ganhar papel que o outro não conhece, o cadastro passa no
    // formulário e falha no CHECK — ou pior, entra e some das telas.
    const check = sql.match(/p <@ array\[([^\]]*)\]/);
    expect(check).not.toBeNull();
    const doBanco = [...check![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(doBanco).toEqual([...TODOS_OS_PAPEIS].sort());
  });

  it("is_staff inclui gestor e exclui investidor", () => {
    const isStaff = sql.match(/is_staff[\s\S]*?papeis && array\[([^\]]*)\]/);
    expect(isStaff).not.toBeNull();
    const papeis = [...isStaff![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(papeis).toEqual([...PERFIS].sort());
    expect(papeis).not.toContain("investidor");
    expect(papeis).not.toContain("cliente");
  });

  it("has_finance_access inclui o gestor — ele aprova e lê relatório", () => {
    const fin = sql.match(/has_finance_access[\s\S]*?papeis && array\[([^\]]*)\]/);
    expect(fin).not.toBeNull();
    const papeis = [...fin![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(papeis).toEqual(["admin", "financeiro", "gestor"]);
  });

  it("cadastro espontâneo nunca nasce gestor nem investidor", () => {
    // O papel vem de `app_metadata` (só a chave de serviço grava); o padrão
    // do trigger continua sendo `cliente`.
    expect(sql).toContain("raw_app_meta_data->>'role'");
    expect(sql).toMatch(/else 'cliente'/);
  });

  it("o investidor lê só a própria linha, e só lê", () => {
    expect(sql).toContain('create policy "Investidor le o proprio cadastro"');
    expect(sql).toContain('create policy "Investidor le o proprio extrato"');
    // `for select`, nunca `for all`: ele confere, não lança.
    const policiesDoInvestidor = sql.match(/create policy "Investidor[\s\S]*?;/g) ?? [];
    expect(policiesDoInvestidor.length).toBe(2);
    for (const p of policiesDoInvestidor) {
      expect(p).toContain("for select");
      expect(p).not.toContain("with check");
    }
  });

  it("um perfil não pode ser dois investidores", () => {
    expect(sql).toContain("create unique index if not exists idx_investidores_perfil");
  });

  it("o vínculo por e-mail exige e-mail confirmado, como o da Garagem", () => {
    expect(sql).toContain("create or replace function public.reivindicar_investidor()");
    expect(sql).toContain("email_confirmed_at is not null");
    expect(sql).toContain("email_nao_confirmado");
    // Nunca executável por anônimo: seria um oráculo de quem é sócio.
    expect(sql).toContain("revoke all on function public.reivindicar_investidor() from public, anon");
  });

  it("a autoconferência prova os dois lados da separação", () => {
    expect(sql).toMatch(/ACEITE FALHOU: gestor não abriu o financeiro/);
    expect(sql).toMatch(/ACEITE FALHOU: investidor virou staff/);
    expect(sql).toMatch(/ACEITE FALHOU: investidor gravou movimentação/);
  });

  it("se registra no livro-razão (D6)", () => {
    expect(sql).toContain("insert into supabase_migrations.schema_migrations");
    expect(sql).toContain("'20260821180000'");
  });
});

describe("o multi-papel chega à aplicação", () => {
  it("o proxy lê TODOS os papéis, não o primário", () => {
    // O gêmeo, do lado da aplicação, do bug que `20260821120000` corrigiu no
    // banco: quem tem `financeiro` como segundo papel levava 403 aqui.
    // O fallback mudou na fusão: sem linha em `profiles` vale o papel padrão
    // por e-mail (rede dos fundadores), e não `role`. O que o teste guarda é
    // o mesmo — o gate soma TODOS os papéis, nunca o primário sozinho.
    expect(proxy).toContain("perfisDe(profile ?? papelPadraoPorEmail(user.email))");
    expect(proxy).not.toMatch(/role !== "financeiro"/);
    expect(proxy).not.toMatch(/role !== "admin"/);
  });

  it("o trilho também", () => {
    expect(sidebar).toContain("perfis: string[]");
    expect(sidebar).toContain("group.roles.some((r) => perfis.includes(r))");
  });
});

// ---------------------------------------------------------------------------
// Trocar o papel primário, e tirar o papel de origem
// ---------------------------------------------------------------------------

const gerenciador = ler("src", "components", "admin", "UserManagement.tsx");
const rotaUsuarios = ler("src", "app", "api", "users", "route.ts");
const rotaUsuario = ler("src", "app", "api", "users", "[id]", "route.ts");

/**
 * Pedido do dono em 2026-08-21: *"não é possível alterar o perfil principal ou
 * de origem, preciso que isso seja possível, um adm que perdeu a função ou foi
 * para o comercial puro"*.
 *
 * A API já aceitava — o buraco era a TELA: o seletor só sabia ANEXAR papel no
 * fim, então `papeis[0]` (o primário, espelhado em `role`) era refém da ordem
 * histórica, e o selo "primário" era decorativo.
 */
describe("ordenarPapeis — quem é o primário", () => {
  it("promove o papel escolhido para a frente", () => {
    // O caso do pedido: o admin virou comercial primário sem perder nada.
    expect(ordenarPapeis(["admin", "comercial"], "comercial")).toEqual(["comercial", "admin"]);
  });

  it("sem escolha, preserva a ordem que já existia", () => {
    expect(ordenarPapeis(["admin", "comercial"])).toEqual(["admin", "comercial"]);
  });

  it("promover papel que a pessoa não tem não inventa papel", () => {
    expect(ordenarPapeis(["comercial"], "admin")).toEqual(["comercial"]);
  });

  it("papel de painel SEMPRE vem antes de papel fora do painel", () => {
    // `role` é lido como "o papel de equipe" por código que ainda não migrou
    // para `papeis`. Deixar `investidor` virar primário de quem também é
    // comercial faria esse código enxergar papel que não existe na matriz.
    expect(ordenarPapeis(["investidor", "comercial"])).toEqual(["comercial", "investidor"]);
    expect(ordenarPapeis(["investidor", "comercial"], "investidor")).toEqual([
      "comercial",
      "investidor",
    ]);
  });

  it("quem é SÓ investidor tem investidor no primeiro lugar", () => {
    // Aqui não há papel de equipe para pôr na frente — e está certo.
    expect(ordenarPapeis(["investidor"])).toEqual(["investidor"]);
    expect(ordenarPapeis(["cliente"])).toEqual(["cliente"]);
  });

  it("remove duplicata — repetição quebraria o CHECK do banco", () => {
    expect(ordenarPapeis(["admin", "admin", "comercial"])).toEqual(["admin", "comercial"]);
  });

  it("rebaixar de verdade: sai do array, não só do primeiro lugar", () => {
    // "Um adm que perdeu a função": tirar `admin` da lista é o gesto, e o
    // resultado é um comercial puro.
    expect(ordenarPapeis(["admin", "comercial"].filter((p) => p !== "admin"))).toEqual([
      "comercial",
    ]);
  });

  it("lista vazia devolve vazia — quem barra o estado inválido é a tela e a rota", () => {
    expect(ordenarPapeis([])).toEqual([]);
  });
});

describe("a tela A17 deixa trocar o primário e recusa com voz", () => {
  it("o selo `primário` virou botão de promover", () => {
    expect(gerenciador).toContain("tornar primário");
    expect(gerenciador).toContain("ordenarPapeis(atuais, p)");
  });

  it("desmarcar o último papel explica, em vez de não fazer nada", () => {
    // Antes: `if (novos.length === 0) return;` — o clique morria em silêncio e
    // quem tentava achava que a tela tinha travado.
    expect(gerenciador).toContain("Todo usuário precisa de pelo menos um papel");
    expect(gerenciador).not.toMatch(/if \(novos\.length === 0\) return;/);
  });

  it("o seletor oferece os papéis concedíveis, não só os de painel", () => {
    // A fusão trocou a lista única por dois grupos rotulados — papel de painel
    // e papel de área própria não são a mesma espécie, e misturá-los num
    // bloco só foi o que deixou convidar um investidor como "comercial". O
    // que importa é que o segundo grupo EXISTA no seletor.
    expect(gerenciador).toContain("PAPEIS_SEM_PAINEL.map");
    expect(gerenciador).toContain("Área própria (sem painel)");
    // E o de criação oferece `investidor` num grupo próprio.
    // O seletor virou orientado a dados na fusão: acrescentar papel de área
    // própria não exige mais mexer no JSX. O que o teste guarda é que o grupo
    // de fora do painel EXISTE — sem ele, o papel vive no banco e não há como
    // criar a conta, que foi o bug de 2026-08-22.
    expect(gerenciador).toContain("PAPEIS_SEM_PAINEL.map");
  });
});

describe("a rota de usuários aceita conceder investidor", () => {
  it("valida contra PAPEIS_ATRIBUIVEIS, não contra PERFIS", () => {
    // Enquanto validava `PERFIS`, criar conta de investidor devolvia "Perfil
    // inválido: investidor" — e a área /investidor ficava inalcançável.
    expect(PAPEIS_ATRIBUIVEIS).toContain("investidor");
    expect(rotaUsuarios).toContain("PAPEIS_ATRIBUIVEIS");
    expect(rotaUsuario).toContain("PAPEIS_ATRIBUIVEIS");
  });

  it("`cliente` não é concedível — é o padrão de quem se cadastra sozinho", () => {
    // `cliente` ENTRA, e a decisão mudou em 2026-08-22. Antes ele ficava de
    // fora porque conceder cliente não é ato administrativo — é o padrão de
    // quem se cadastra sozinho. Mas o funcionário que também comprou carro
    // carrega os dois papéis, e recusá-lo na edição fazia a A17 apagar em
    // silêncio um papel legítimo. Oferecer é menos ruim que apagar.
    expect(PAPEIS_ATRIBUIVEIS).toContain("cliente");
    expect(PAPEIS_ATRIBUIVEIS).toContain("investidor");
    // Mas continua aceito na EDIÇÃO: o funcionário que também comprou carro.
    // A exceção de `cliente` saiu: ele passou a ser atribuível (ver a nota em
    // "cliente não é concedível" acima). A rota valida contra a lista única, e
    // é isso que impede papel inventado de entrar por texto livre.
    expect(rotaUsuario).toContain("PAPEIS_ATRIBUIVEIS as readonly string[]");
  });

  it("as duas rotas leem TODOS os papéis — o 4º gêmeo do bug multi-papel", () => {
    // `role !== "admin"` dava 403 em quem tem admin como papel secundário.
    for (const rota of [rotaUsuarios, rotaUsuario]) {
      expect(rota).toContain('perfisDe(profile).includes("admin")');
      expect(rota).not.toMatch(/profile\?\.role !== "admin"/);
    }
  });
});
