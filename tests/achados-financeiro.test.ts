import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ORIGENS,
  origemConhecida,
  rotearEdicao,
} from "../src/lib/agenda";
import {
  precisaDeAprovacao,
  recorrenteNovaPrecisaDeAprovacao,
} from "../src/lib/alcada";
import {
  avancarPeriodo,
  geracaoAposParcela,
  primeiraGeracao,
} from "../src/lib/recorrentes";

/**
 * Os treze achados de `docs/ACHADOS_FINANCEIRO.md`, corrigidos.
 *
 * A revisão de 2026-08-25 varreu financeiro, investidores e agenda antes de
 * abrir o PR do trabalho de SEO, e achou treze defeitos que **passavam na
 * suíte**. Não eram regressões — eram lacunas: nenhum teste fazia a pergunta
 * que os teria pego. A decisão do dono na época foi registrar e corrigir
 * depois, com teste próprio. Este arquivo é esse teste.
 *
 * O padrão que atravessa quase todos é o mesmo que o módulo já documenta em
 * três lugares: **falha por omissão**. Uma escrita que reporta sucesso sem
 * escrever, um filtro que esconde dinheiro devido, uma recorrente que nunca
 * gera, um total somado sobre a primeira página. Em nenhum deles há erro na
 * tela — é por isso que nenhum tinha sido notado.
 *
 * Dois deles (conciliação e razão do investidor) corrompem dado em produção
 * sem emitir erro; os testes do motor de conciliação moram em
 * `conciliacao.test.ts`, junto do resto do motor.
 */

const raiz = join(__dirname, "..");
const ler = (...p: string[]) => readFileSync(join(raiz, ...p), "utf-8");

const participacoes = ler(
  "src", "app", "api", "financeiro", "investidores", "participacoes", "route.ts",
);
const contas = ler("src", "app", "api", "financeiro", "contas", "route.ts");
const contaPorId = ler("src", "app", "api", "financeiro", "contas", "[id]", "route.ts");
const aprovarRecorrente = ler(
  "src", "app", "api", "financeiro", "recorrentes", "[id]", "aprovar", "route.ts",
);
const dia = ler("src", "app", "api", "financeiro", "dia", "route.ts");
const proxy = ler("src", "proxy.ts");
const usuarios = ler("src", "components", "admin", "UserManagement.tsx");

/** O banimento é sobre o que o código FAZ — mesma régua de garagem.test.ts. */
const semComentarios = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ---------------------------------------------------------------------------
// 2 · O aporte do investidor vai para o razão ÚNICO
// ---------------------------------------------------------------------------

describe("2 · aporte de investidor não volta ao razão aposentado", () => {
  const codigo = semComentarios(participacoes);

  it("nem escreve, nem lê, nem apaga em investidor_movimentos", () => {
    // A migração 20260822210000 elegeu `movimentacoes_investidor` como livro
    // único e reconstruiu `investidor_posicao` para somar dele, porque *"duas
    // verdades sobre o dinheiro do sócio é o pior resultado possível desta
    // fusão"*. Esta rota continuava no livro antigo: o aporte aparecia no
    // painel de gestão, não aparecia no painel logo acima na MESMA tela, e o
    // saldo de `/investidor` ficava menor do que o sócio pôs.
    expect(codigo).not.toContain("investidor_movimentos");
  });

  it("os três verbos apontam para movimentacoes_investidor", () => {
    expect(codigo).toContain('.from("movimentacoes_investidor")');
    expect(codigo).toContain('"movimentacoes_investidor"');
  });

  it("atravessa de profiles.id para a ficha antes de gravar", () => {
    // O razão único é chaveado pela FICHA (`investidores.id`), não pelo perfil
    // de acesso — o sócio pode aportar sem nunca abrir o sistema. Gravar o
    // `profiles.id` direto violaria a FK, e a linha não entraria.
    expect(codigo).toContain("fichaDoPerfil");
    expect(codigo).toContain("investidor_id: ficha.id");
  });

  it("cria a ficha de quem ainda não tem, em vez de recusar o aporte", () => {
    // A fusão só criou ficha para quem já tinha lançamento no razão antigo.
    // Um investidor marcado depois não tem nenhuma, e recusar por isso
    // empurraria para a tela um passo que ela não sabe executar.
    expect(codigo).toContain('.from("investidores")');
    expect(codigo).toContain("perfil_id: perfil.id");
    // A corrida de duas abas termina em unique violation, e aí a ficha que a
    // outra criou é a resposta — não um 500.
    expect(codigo).toContain('erroDeCriacao.code === "23505"');
  });

  it("devolve investidor_id em profiles.id — a tela agrupa por perfil", () => {
    // `InvestidoresGestao` filtra `movimentos.filter(m => m.investidor_id ===
    // selecionado)`, e `selecionado` é um id de `profiles`. Devolver o id da
    // ficha faria todo movimento sumir da tela sem erro nenhum.
    expect(codigo).toContain("perfilDaFicha");
    expect(codigo).toContain("investidor_id }");
  });
});

// ---------------------------------------------------------------------------
// 11 · O recorte dos investidores é do banco
// ---------------------------------------------------------------------------

describe("11 · investidores são filtrados no banco, não em JavaScript", () => {
  it("a consulta a profiles leva filtro", () => {
    // Sem ele, todo cliente da Garagem e todo membro da equipe era
    // serializado do Postgres e trafegado a cada carga da tela, para dois
    // nomes sobrarem.
    expect(participacoes).toContain('.or("papeis.cs.{investidor},role.eq.investidor")');
  });

  it("o `or` cobre as duas formas que ehInvestidor cobre", () => {
    // `papeis` é a régua desde 2026-08-19; `role` é o espelho que linha antiga
    // ainda pode ter sozinha. Filtrar só por `papeis` sumiria com ela.
    expect(participacoes).toContain("papeis.cs.{investidor}");
    expect(participacoes).toContain("role.eq.investidor");
  });

  it("o filtro em JS fica como última palavra", () => {
    // Assim as duas definições de "é investidor" não têm como divergir.
    expect(participacoes).toContain("ehInvestidor(p)");
  });
});

// ---------------------------------------------------------------------------
// 3 · A recorrente nasce com proxima_geracao
// ---------------------------------------------------------------------------

describe("3 · recorrente criada pelo check gera conta de verdade", () => {
  it("o insert do check preenche proxima_geracao", () => {
    // `despesas_recorrentes.proxima_geracao` é DATE sem default, e
    // `/recorrentes/gerar` filtra por `.lte('proxima_geracao', hoje)`. NULL
    // nunca satisfaz `lte`: a linha ficava ativa, aprovada, visível na tela —
    // e mês após mês zero contas, sem erro em lugar nenhum.
    expect(contas).toContain("proxima_geracao: geracaoAposParcela(");
  });

  it("aponta para o período SEGUINTE, não para a parcela recém-criada", () => {
    // A primeira parcela vira conta na mesma requisição. Apontar para a mesma
    // data faria o gerador criar uma segunda conta idêntica no primeiro dia em
    // que rodasse — a despesa cobrada em dobro.
    expect(geracaoAposParcela("2026-09-10", "mensal")).toBe("2026-10-10");
    expect(geracaoAposParcela("2026-09-10", "semanal")).toBe("2026-09-17");
  });

  it("a escada de frequência é uma só, e o gerador usa a mesma", () => {
    // Eram duas cópias em dois arquivos, e um terceiro chamador sem nenhuma.
    // É assim que um deles fica para trás.
    const gerar = ler(
      "src", "app", "api", "financeiro", "recorrentes", "gerar", "route.ts",
    );
    expect(gerar).toContain("avancarPeriodo(item.proxima_geracao, item.frequencia)");
    expect(semComentarios(gerar)).not.toContain('case "quinzenal"');
  });

  it("avancarPeriodo anda o período de cada frequência", () => {
    expect(avancarPeriodo("2026-08-25", "semanal")).toBe("2026-09-01");
    expect(avancarPeriodo("2026-08-25", "quinzenal")).toBe("2026-09-09");
    expect(avancarPeriodo("2026-08-25", "mensal")).toBe("2026-09-25");
    expect(avancarPeriodo("2026-08-25", "bimestral")).toBe("2026-10-25");
    expect(avancarPeriodo("2026-08-25", "trimestral")).toBe("2026-11-25");
    expect(avancarPeriodo("2026-08-25", "semestral")).toBe("2027-02-25");
    expect(avancarPeriodo("2026-08-25", "anual")).toBe("2027-08-25");
  });

  it("frequência desconhecida cai em mensal — nunca devolve a mesma data", () => {
    // Devolver a mesma data faria o gerador criar a mesma conta todo dia;
    // devolver nulo congelaria a recorrente de novo, que é o defeito original.
    const seguinte = avancarPeriodo("2026-08-25", "inventada");
    expect(seguinte).toBe("2026-09-25");
    expect(seguinte).not.toBe("2026-08-25");
  });

  it("a primeira geração não nasce vencida", () => {
    // O dia já vencido pertence ao mês que acabou: gerar para trás criaria uma
    // conta nascida vencida, e ninguém pediu dívida retroativa ao marcar
    // "repete".
    const hoje = new Date("2026-08-25T12:00:00Z");
    expect(primeiraGeracao(28, hoje)).toBe("2026-08-28");
    expect(primeiraGeracao(10, hoje)).toBe("2026-09-10");
    // O próprio dia ainda conta como hoje.
    expect(primeiraGeracao(25, hoje)).toBe("2026-08-25");
  });

  it("a virada de ano não perde o mês", () => {
    const dezembro = new Date("2026-12-20T12:00:00Z");
    expect(primeiraGeracao(5, dezembro)).toBe("2027-01-05");
    expect(avancarPeriodo("2026-12-31", "mensal")).toBe("2027-01-31");
  });
});

// ---------------------------------------------------------------------------
// 6 · A recorrente do dono passa pela fila
// ---------------------------------------------------------------------------

describe("6 · recorrente não pula a fila por quem a lançou", () => {
  it("sobe para aprovação, seja quem for", () => {
    // O corpo era `!podeDecidirAprovacao(perfis)` — a régua que
    // `precisaDeAprovacao` abandonou em 2026-08-24 porque anulava a fila: *"o
    // dono é admin, admin aprova, então TODO lançamento dele pulava"*. A
    // recorrente ficou para trás na mesma mudança.
    expect(recorrenteNovaPrecisaDeAprovacao()).toBe(true);
  });

  it("não pergunta mais quem está lançando", () => {
    // A pergunta era o defeito. Enquanto a função a aceitasse, alguém a
    // responderia de novo.
    expect(recorrenteNovaPrecisaDeAprovacao.length).toBe(0);
    expect(contas).toContain("recorrenteNovaPrecisaDeAprovacao()");
  });

  it("um pagar avulso do mesmo usuário tem a mesma régua", () => {
    // Era a incoerência que o achado descreve: o dono marcava "Repete" numa
    // despesa de R$ 1.200/mês e a linha nascia `aprovada`, sem
    // `aprovacao_decidida_por`, sem aparecer em Aprovações — enquanto um
    // `pagar` avulso idêntico, do mesmo usuário, era obrigado a passar.
    for (const perfis of [["admin"], ["gestor"], ["financeiro"], ["admin", "gestor"]]) {
      const avulso = precisaDeAprovacao({ tipo: "pagar", status: "pendente", perfis });
      expect(avulso).toBe(true);
      // A recorrente é o compromisso MAIS pesado dos dois; não pode ter a
      // régua mais frouxa.
      expect(recorrenteNovaPrecisaDeAprovacao()).toBe(avulso);
    }

    const alcada = ler("src", "lib", "alcada.ts");
    expect(semComentarios(alcada)).not.toContain(
      "return !podeDecidirAprovacao(perfis);",
    );
  });
});

// ---------------------------------------------------------------------------
// 4 e 7 · O PUT de conta
// ---------------------------------------------------------------------------

describe("4 · cancelar conta em aprovação escreve ou explica", () => {
  const codigo = semComentarios(contaPorId);

  it("não descarta mais o status em silêncio", () => {
    // `delete updateData.status` fazia o UPDATE gravar só o `updated_at`:
    // voltava 200, a tela dizia "Lançamento cancelado — o registro fica no
    // histórico", e o refresh mostrava a conta ainda aguardando aprovação.
    expect(codigo).not.toContain("delete updateData.status");
  });

  it("cancelar é permitido a partir da fila — é o botão que a tela oferece", () => {
    // `ContasList` esconde Cancelar só quando a conta está paga ou já
    // cancelada; para uma na fila, o botão está lá.
    expect(codigo).toContain('novoStatus !== "cancelado"');
  });

  it("o que não é cancelar recebe 409, não um 200 que mente", () => {
    expect(codigo).toMatch(/status:\s*409/);
    expect(contaPorId).toContain("o status é decidido em Aprovações");
  });
});

/**
 * Aspas viram espaço do mesmo comprimento: contar chaves precisa ignorar as
 * que moram dentro de texto (o `select` desta rota é template literal), e
 * preservar os índices para casarem com a busca feita no original.
 */
const semTexto = (codigo: string) =>
  codigo.replace(
    /`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,
    (m) => " ".repeat(m.length),
  );

/** O índice do `}` que fecha o bloco cuja `{` está em `abre`. */
function fimDoBloco(codigo: string, abre: number): number {
  let profundidade = 0;
  for (let i = abre; i < codigo.length; i++) {
    if (codigo[i] === "{") profundidade++;
    else if (codigo[i] === "}") {
      profundidade--;
      if (profundidade === 0) return i;
    }
  }
  return -1;
}

describe("7 · o PUT não converte pago em agendado sem trilha", () => {
  const codigo = semComentarios(contaPorId);
  const put = codigo.slice(
    codigo.indexOf("export async function PUT"),
    codigo.indexOf("export async function DELETE"),
  );
  const semAspas = semTexto(put);

  // Onde a régua de papel abre o seu bloco, e onde ela o fecha.
  const guarda = put.indexOf("podeDecidirAprovacao");
  const abreGuarda = semAspas.indexOf("{", guarda);
  const fechaGuarda = fimDoBloco(semAspas, abreGuarda);
  const reenfileira = put.indexOf('updateData.status = "aguardando_aprovacao"');

  it("o re-enfileiramento fica FORA do bloco da régua de papel", () => {
    // Este é o achado, e é uma questão de aninhamento, não de texto: o bloco
    // inteiro morava dentro de `if (!podeDecidirAprovacao(...))`. Admin lançava
    // `pago` (escrituração, passa direto) e depois fazia PUT
    // `{status:'pendente'}`; como ele PODE decidir, o bloco era pulado e a
    // conta virava pagamento agendado ATIVO com `aprovacao_decidida_por` e
    // `aprovacao_decidida_em` nulos — indistinguível, no razão, de um que
    // ninguém revisou.
    expect(guarda).toBeGreaterThan(-1);
    expect(reenfileira).toBeGreaterThan(-1);
    expect(fechaGuarda).toBeGreaterThan(-1);
    // O bloco da régua FECHA antes de o re-enfileiramento começar.
    expect(fechaGuarda).toBeLessThan(reenfileira);
  });

  it("o estado atual é lido antes da régua, e serve às duas regras", () => {
    // A leitura morava dentro do mesmo bloco; fora dele, as duas regras a
    // enxergam e não há duas idas ao banco.
    const leitura = put.indexOf('.select("status, tipo")');
    expect(leitura).toBeGreaterThan(-1);
    expect(leitura).toBeLessThan(abreGuarda);
    expect(put.match(/\.select\("status, tipo"\)/g) ?? []).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 8 · O 409 alcançável
// ---------------------------------------------------------------------------

describe("8 · decidir recorrente já decidida devolve 409, não 500", () => {
  it("PGRST116 é tratado antes do erro genérico", () => {
    // `.single()` sobre zero linhas devolve ERRO `PGRST116`, não `data: null`.
    // O `if (error)` genérico disparava primeiro e a segunda pessoa via um 500
    // com a mensagem crua do PostgREST, onde a resposta certa era "alguém já
    // decidiu esta".
    const codigo = semComentarios(aprovarRecorrente);
    expect(codigo).toContain('error?.code === "PGRST116"');

    const pgrst = codigo.indexOf("PGRST116");
    const genericoDepois = codigo.indexOf("if (error && !naoEstavaAguardando)");
    expect(pgrst).toBeGreaterThan(-1);
    expect(genericoDepois).toBeGreaterThan(pgrst);
  });

  it("as linhas do 409 deixaram de ser inalcançáveis", () => {
    expect(aprovarRecorrente).toContain("naoEstavaAguardando || !recorrente");
    expect(aprovarRecorrente).toContain("status: 409");
  });
});

// ---------------------------------------------------------------------------
// 9 · O total da manhã
// ---------------------------------------------------------------------------

describe("9 · o resumo do dia soma o dia inteiro", () => {
  const codigo = semComentarios(dia);

  it("varre em páginas — o PostgREST corta em mil linhas", () => {
    // A loja chegou a 709 contas em aberto em agosto. Passando de mil, os
    // totais em dinheiro da tela que abre toda manhã eram a soma da PRIMEIRA
    // PÁGINA, apresentada como o total.
    expect(codigo).toContain("const POR_LOTE = 1000");
    expect(codigo).toContain(".range(inicio, fim)");
    expect(codigo).toContain("recebidas.length < POR_LOTE");
  });

  it("a varredura tem ordem estável, senão a página repete e pula", () => {
    expect(codigo).toContain('.order("id", { ascending: true })');
    // As três consultas, não só a das contas em aberto.
    expect((codigo.match(/\.order\("id", \{ ascending: true \}\)/g) ?? []).length).toBe(3);
  });

  it("declara quando o resumo é parcial", () => {
    // Um total truncado que não se declara é indistinguível de um exato — é o
    // defeito da posição 709 com outra roupa.
    expect(codigo).toContain("completo:");
    const tela = ler("src", "components", "financeiro", "DiaOperacional.tsx");
    expect(tela).toContain("resumo?.completo === false");
  });

  it("a lista de status em aberto vem de lib/alcada", () => {
    expect(codigo).toContain("STATUS_EM_ABERTO");
    expect(codigo).not.toContain('"pendente", "vencido", "parcial"');
  });
});

// ---------------------------------------------------------------------------
// 10 · O investidor não vê JSON cru
// ---------------------------------------------------------------------------

describe("10 · falha de leitura de perfil manda o investidor para /login", () => {
  it("o catch cobre as duas áreas, não só o painel", () => {
    // `isInvestidorPath` entrou no portão externo e no redirect de não
    // autenticado quando a área nasceu, e ficou de fora do catch. Se o select
    // em `profiles` falhasse, o investidor logado recebia
    // `{"error":"Erro na verificação de autorização"}` como CORPO DA PÁGINA,
    // com 403 — um blob de JSON onde `/admin` recebe redirect.
    const catchDoPapel = proxy.slice(proxy.indexOf("Role verification failed"));
    expect(catchDoPapel).toContain("if (isAdminPath || isInvestidorPath)");
  });

  it("continua falhando FECHADO — o que mudou foi a forma", () => {
    const catchDoPapel = proxy.slice(proxy.indexOf("Role verification failed"));
    expect(catchDoPapel).toContain('url.pathname = "/login"');
    // A API segue recebendo JSON, que é a resposta certa para uma API.
    expect(catchDoPapel).toContain("status: 403");
  });
});

// ---------------------------------------------------------------------------
// 12 · Um helper só
// ---------------------------------------------------------------------------

describe("12 · a tela de usuários usa o helper compartilhado", () => {
  it("não há cópia local de ehPapelDePainel", () => {
    // A cópia sombreava o import e deixava as quatro chamadas resolvendo para
    // ela. `PERFIS` ganhando um papel — como `gestor` acabou de ganhar —
    // passaria a ter de ser pensado em dois lugares, e a mudança no helper não
    // chegaria justamente à tela cujo trabalho é exibir essa distinção.
    expect(semComentarios(usuarios)).not.toMatch(
      /const ehPapelDePainel\s*=/,
    );
  });

  it("o import deixou de ser morto", () => {
    expect(usuarios).toContain("ehPapelDePainel,");
    expect(usuarios).toContain("ehPapelDePainel(");
  });
});

// ---------------------------------------------------------------------------
// 13 · A whitelist não aceita chave herdada
// ---------------------------------------------------------------------------

describe("13 · whitelist em objeto literal recusa chave de Object.prototype", () => {
  it("um campo herdado é RECUSADO, não roteado", () => {
    // `JSON.parse` cria propriedade PRÓPRIA para qualquer chave, então
    // `{"toString":"x"}` fazia `mapa["toString"]` devolver a função nativa —
    // truthy. O campo não entrava em `recusados` e o UPDATE chegava ao
    // PostgREST com uma função onde deveria haver nome de coluna: 500 cru, em
    // vez do 400 deliberado "Campo não editável".
    expect(() =>
      rotearEdicao("financeiro", { origem: "financeiro", toString: "x" }),
    ).toThrow(/Campo não editável/);

    expect(() =>
      rotearEdicao("financeiro", { origem: "financeiro", constructor: "x" }),
    ).toThrow(/Campo não editável/);

    expect(() =>
      rotearEdicao("financeiro", { origem: "financeiro", hasOwnProperty: "x" }),
    ).toThrow(/Campo não editável/);
  });

  it("uma origem herdada não existe", () => {
    // `ORIGENS["constructor"]` devolvia a função nativa e passava por
    // `!ORIGENS[origem]`, produzindo "Registro de undefined não se apaga".
    expect(origemConhecida("constructor")).toBe(false);
    expect(origemConhecida("toString")).toBe(false);
    expect(origemConhecida("__proto__")).toBe(false);
    expect(origemConhecida(null)).toBe(false);
    expect(origemConhecida(undefined)).toBe(false);

    expect(() => rotearEdicao("constructor", { nome: "x" })).toThrow(
      /Origem desconhecida/,
    );
  });

  it("as origens de verdade continuam passando", () => {
    for (const origem of Object.keys(ORIGENS)) {
      expect(origemConhecida(origem)).toBe(true);
    }
    expect(rotearEdicao("financeiro", { nome: "Maria" })).toEqual({
      tabela: ORIGENS.financeiro.tabela,
      valores: { nome: "Maria" },
    });
  });

  it("a rota do DELETE pergunta pela mesma função", () => {
    const rota = ler("src", "app", "api", "pessoas", "[id]", "route.ts");
    expect(rota).toContain("origemConhecida(origem)");
    expect(semComentarios(rota)).not.toContain("!ORIGENS[origem]");
  });
});
