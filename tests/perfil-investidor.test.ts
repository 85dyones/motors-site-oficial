import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PAPEIS_ATRIBUIVEIS,
  PAPEIS_SEM_PAINEL,
  PERFIS,
  ehInvestidor,
  ehStaff,
  papeisBrutos,
  perfisDe,
  podeFazer,
} from "../src/lib/permissoes";

/**
 * O perfil Investidor — 2026-08-22.
 *
 * Quem entra com dinheiro na compra dos carros passa a acompanhar a própria
 * posição: os carros em que entrou, o aporte total, o retirado e o saldo.
 *
 * O risco desta funcionalidade não é a tela — é o PAPEL. Investidor é gente de
 * fora da operação, e a tentação de tratá-lo como um quinto perfil de painel
 * teria lhe dado, de graça, o payload completo de `/api/settings` (token de
 * API, saldos bancários, `preco_compra` de todo o estoque), a escrita de
 * estoque e os leads — tudo o que `ehStaff`/`is_staff` liberam.
 *
 * É isso que este arquivo tranca, nos dois lados: no app e no banco.
 */

const raiz = join(__dirname, "..");
const ler = (...p: string[]) => readFileSync(join(raiz, ...p), "utf-8");

/** O banimento é sobre o que o código FAZ — mesma régua de garagem.test.ts. */
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const migracao = ler("supabase", "migrations", "20260822120000_perfil_investidor.sql");
const proxy = ler("src", "proxy.ts");
const telaInvestidor = ler("src", "app", "investidor", "page.tsx");
// A rota mudou de endereço na fusão de 2026-08-22: dois trabalhos paralelos
// entregaram módulo de investidor no mesmo caminho, e a participação por
// veículo — que é o que este teste guarda — foi para `participacoes/`. O
// cadastro e o razão ficaram na raiz da coleção. Em 2026-08-28, com a
// aposentadoria do módulo de caixa, tudo mudou de /api/financeiro/investidores
// para /api/investidores (e os componentes para components/investidores/).
const rotaGestao = ler(
  "src", "app", "api", "investidores", "participacoes", "route.ts",
);
const telaGestao = ler("src", "components", "investidores", "InvestidoresGestao.tsx");
const garagem = ler("src", "app", "garagem", "page.tsx");
const definirSenha = ler("src", "app", "definir-senha", "page.tsx");
const confirm = ler("src", "app", "api", "auth", "confirm", "route.ts");
const rotaUsuarios = ler("src", "app", "api", "users", "route.ts");

describe("investidor NÃO é staff", () => {
  it("fica fora de PERFIS — a matriz do painel não o conhece", () => {
    expect(PERFIS as readonly string[]).not.toContain("investidor");
    expect(PAPEIS_SEM_PAINEL as readonly string[]).toContain("investidor");
  });

  it("ehStaff nega, sozinho ou acompanhado de cliente", () => {
    // Se isto virar `true`, o investidor ganha o payload completo de settings.
    expect(ehStaff(["investidor"])).toBe(false);
    expect(ehStaff(["cliente", "investidor"])).toBe(false);
    expect(ehStaff({ role: "investidor", papeis: ["investidor"] })).toBe(false);
  });

  it("perfisDe o descarta — nenhum acesso de painel vaza por ele", () => {
    expect(perfisDe(["investidor"])).toEqual([]);
    expect(perfisDe(["investidor", "comercial"])).toEqual(["comercial"]);
  });

  it("a matriz não lhe dá nenhuma ação", () => {
    // `podeFazer` só entende Perfil; passar investidor cai no caminho de
    // lista vazia, que nega. A garantia é a de cima (fora de PERFIS), esta é
    // a leitura de quem chamar mesmo assim.
    expect(podeFazer(perfisDe(["investidor"]), "Ver custo de aquisição e margem")).toBe("nao_ve");
    expect(podeFazer(perfisDe(["investidor"]), "Convidar usuário e trocar perfil")).toBe("nao_ve");
  });

  it("mas é reconhecível como investidor", () => {
    expect(ehInvestidor(["investidor"])).toBe(true);
    expect(ehInvestidor({ papeis: ["cliente", "investidor"] })).toBe(true);
    expect(ehInvestidor(["comercial"])).toBe(false);
    expect(ehInvestidor(null)).toBe(false);
    // O sócio que também trabalha na loja é as duas coisas.
    expect(ehInvestidor(["admin", "investidor"])).toBe(true);
    expect(ehStaff(["admin", "investidor"])).toBe(true);
  });

  it("papeisBrutos enxerga o que perfisDe esconde", () => {
    expect(papeisBrutos({ papeis: ["cliente", "investidor"] })).toEqual(["cliente", "investidor"]);
    expect(papeisBrutos({ role: "investidor" })).toEqual(["investidor"]);
    expect(papeisBrutos(null)).toEqual([]);
  });

  it("é atribuível na A17 — foi a falta disso que criou o caso de 2026-08-22", () => {
    expect(PAPEIS_ATRIBUIVEIS as readonly string[]).toContain("investidor");
    expect(rotaUsuarios).toContain("PAPEIS_ATRIBUIVEIS");
  });
});

describe("o banco, no mesmo assunto", () => {
  it("o vocabulário aceita investidor nos três lugares", () => {
    // CHECK de `role`, régua de `papeis` e o trigger de cadastro. Faltar em
    // qualquer um faz o convidado nascer `cliente` — o bug original.
    expect(migracao).toContain("check (role in ('admin', 'comercial', 'financeiro', 'marketing', 'cliente', 'investidor'))");
    expect(migracao).toContain("p <@ array['admin', 'comercial', 'financeiro', 'marketing', 'cliente', 'investidor']");
    expect(migracao).toContain("in ('admin', 'comercial', 'financeiro', 'marketing', 'cliente', 'investidor')");
  });

  it("is_staff NÃO é redefinida — o investidor não entra na régua de staff", () => {
    // A migração CHAMA `is_staff` (na autoconferência) e nunca a reescreve:
    // redefini-la aqui seria a única forma de o investidor virar staff sem
    // ninguém notar. Se um dia alguém tentar, este teste cai antes do deploy.
    const executavel = migracao
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(executavel).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\.is_staff/i);
    expect(executavel).toContain("public.is_staff(v_uid)");
  });

  it("a autoconferência prova contra o banco que ele não é staff", () => {
    expect(migracao).toContain("ACEITE FALHOU: investidor virou staff");
    expect(migracao).toContain("ACEITE FALHOU: investidor entrou no financeiro");
  });

  it("a RLS filtra pelo próprio dono, e não por parâmetro", () => {
    expect(migracao).toContain('create policy "Investidor le os proprios veiculos"');
    expect(migracao).toContain('create policy "Investidor le os proprios movimentos"');
    const ocorrencias = migracao.match(/for select using \( investidor_id = auth\.uid\(\) \)/g);
    expect(ocorrencias, "as duas tabelas precisam do mesmo filtro").toHaveLength(2);
  });

  it("o investidor não escreve: só o financeiro tem policy de escrita", () => {
    expect(migracao).toContain('create policy "Financeiro gerencia participacoes"');
    expect(migracao).toContain('create policy "Financeiro gerencia movimentos"');
    expect(migracao).toContain("for all using ( public.has_finance_access(auth.uid()) )");
  });

  it("a view da posição respeita a RLS de quem consulta", () => {
    // Sem `security_invoker`, a view roda com os privilégios do dono e
    // qualquer investidor leria a posição de todos.
    expect(migracao).toContain("with (security_invoker = true)");
    expect(migracao).toContain("create or replace view public.investidor_posicao");
  });

  it("has_finance_access passa a somar os papéis", () => {
    // Mesma família do multi-papel: quem é {comercial, financeiro} era barrado
    // do próprio módulo porque a função lia o papel primário.
    expect(migracao).toContain("papeis && array['admin', 'financeiro']");
  });

  it("valor é sempre positivo — o sinal mora em `tipo`", () => {
    expect(migracao).toContain("check (valor > 0)");
    expect(migracao).toContain("ACEITE FALHOU: movimento negativo foi aceito");
  });

  it("um investidor entra uma vez em cada carro", () => {
    expect(migracao).toContain("unique (investidor_id, veiculo_id)");
    expect(migracao).toContain("ACEITE FALHOU: participação duplicada no mesmo carro foi aceita");
  });

  it("se registra no livro-razão (D6)", () => {
    expect(migracao).toContain("insert into supabase_migrations.schema_migrations");
    expect(migracao).toContain("'20260822120000'");
  });
});

describe("as portas", () => {
  it("o proxy tem porteiro próprio para a área do investidor", () => {
    expect(proxy).toContain("isInvestidorPath");
    expect(proxy).toContain('path === "/investidor"');
    expect(proxy).toContain("if (!investidor)");
    // E a rota está no matcher — sem isso o middleware nem roda nela.
    expect(proxy).toContain('"/investidor",');
    expect(proxy).toContain('"/investidor/:path*",');
  });

  it("cada público cai na porta dele depois do login", () => {
    expect(definirSenha).toContain('ehInvestidor(profile)');
    expect(definirSenha).toContain('"/investidor"');
    expect(confirm).toContain("ehInvestidor(profile)");
    // E a Garagem não o prende numa tela de cliente que não existe para ele.
    expect(garagem).toContain('redirect("/investidor")');
  });
});

describe("a tela do investidor", () => {
  it("não expõe custo da loja", () => {
    // Ele vê o dinheiro DELE. `preco_compra` e margem são outra conversa — e
    // não é a RLS que deveria estar segurando isso sozinha.
    expect(semComentarios(telaInvestidor)).not.toContain("preco_compra");
    expect(semComentarios(telaInvestidor)).not.toContain("margem");
  });

  it("não aceita investidor por parâmetro — o recorte é da RLS", () => {
    const codigo = semComentarios(telaInvestidor);
    expect(codigo).not.toContain("investidor_id");
    expect(codigo).toContain("investidor_posicao");
  });

  it("mostra os quatro números que o dono pediu", () => {
    expect(telaInvestidor).toContain("aporte_total");
    expect(telaInvestidor).toContain("retirado_total");
    expect(telaInvestidor).toContain("saldo_investido");
    expect(telaInvestidor).toContain("investidor_veiculos");
  });

  it("barra quem não é investidor", () => {
    expect(telaInvestidor).toContain("if (!ehInvestidor(profile))");
  });
});

describe("a gestão, do lado do financeiro", () => {
  it("exige papel de financeiro ou admin", () => {
    expect(rotaGestao).toContain('perfis.includes("admin")');
    expect(rotaGestao).toContain('perfis.includes("financeiro")');
  });

  it("recusa lançar para quem não é investidor", () => {
    // Sem isto o lançamento cairia no id de um cliente ou vendedor: as tabelas
    // só exigem que o id exista em `profiles`, e o dinheiro sumiria de vista.
    expect(rotaGestao).toContain("!ehInvestidor(alvo)");
  });

  it("normaliza o valor para positivo em vez de estourar o CHECK", () => {
    expect(rotaGestao).toContain("Math.abs(valorBruto)");
  });
});

describe("o seletor de veículo", () => {
  it("o estoque chega com o mesmo recorte que o financeiro já enxerga", () => {
    // Igual ao da tela de margens. Escolher um carro numa lista não é motivo
    // para alargar o que o perfil vê: placa e chassi são documentação
    // interna, e `preco_compra` tem gate próprio na matriz.
    expect(rotaGestao).toContain('.select("id, marca, modelo, versao, ano, preco, vendido")');
    const codigo = semComentarios(rotaGestao);
    expect(codigo).not.toContain("placa");
    expect(codigo).not.toContain("chassi");
    expect(codigo).not.toContain("preco_compra");
  });

  it("estoque fora do ar não derruba a tela inteira", () => {
    // O extrato e a posição são o essencial; a lista de carros é acessório.
    expect(rotaGestao).toContain("[Financeiro/Investidores] Estoque indisponível");
    expect(rotaGestao).toContain("veiculos: veiculosRes.data ?? []");
  });

  it("é busca de verdade, não um campo de id cru", () => {
    expect(telaGestao).toContain("busca-veiculo-investidor");
    expect(telaGestao).toContain("const encontrados = useMemo(");
    // A régua é a mesma do fechamento de venda (A19).
    expect(telaGestao).toContain("[v.marca, v.modelo, v.versao, v.ano, v.id]");
    expect(telaGestao).toContain(".slice(0, 8)");
  });

  it("aceita carro que ainda não entrou no sync", () => {
    // Carro recém-comprado não está no feed — e é exatamente quando o aporte
    // acontece. Travar o lançamento até o anúncio existir seria travar o
    // registro do dinheiro por causa da vitrine.
    expect(telaGestao).toContain("const idSolto = useMemo(");
    expect(telaGestao).toContain("Usar o número {idSolto} mesmo assim");
  });

  it("tem atalho para o estoque, sem perder o formulário", () => {
    expect(telaGestao).toContain('href="/admin/estoque"');
    expect(telaGestao).toContain('target="_blank"');
    expect(telaGestao).toContain('rel="noopener noreferrer"');
  });

  it("não envia participação sem veículo escolhido", () => {
    // O `required` morava no input de id, que deixou de existir.
    expect(telaGestao).toContain('setErro("Escolha o veículo.")');
  });
});
