import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A porta de escrita do cabeçalho da seção.
 *
 * Existe porque a rota é NOVA e a régua de permissão dela é compartilhada:
 * `lib/portaDeGuias.ts` serve `/api/guias` e `/api/guias/secao`. O teste da
 * porta dos guias já cobre a primeira, e cobertura por vizinhança não é
 * cobertura — o docblock daquele arquivo chama isso de "sorte documentada",
 * depois de a revisão apagar o 401 e o 403 e a suíte inteira ficar verde.
 *
 * Aqui a régua é a MESMA de propósito: quem escreve cópia de site escreve nas
 * duas rotas. O que este arquivo guarda é que a rota nova de fato passa por
 * ela, e não que exista uma segunda régua.
 */

const CLIENTE = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => CLIENTE,
}));

/**
 * `revalidatePath` é ESPIONADO, e não silenciado.
 *
 * A primeira versão deste arquivo mockava com `() => {}` "porque fora de uma
 * requisição do Next isso estoura". Verdade — e a revisão mostrou o preço:
 * esvaziando o corpo de `revalidarCluster` a suíte inteira (2229 testes)
 * ficava verde, e a função serve DUAS rotas desde a extração. Um no-op sem
 * cobertura silenciava as duas pontas de uma vez.
 *
 * O custo está escrito no docblock de `portaDeGuias.ts`: guia recém-publicado
 * espera até uma hora no sitemap, e quem acabou de salvar vê a página velha e
 * conclui que não salvou.
 */
const revalidados: string[] = [];
vi.mock("next/cache", () => ({
  revalidatePath: (caminho: string) => {
    revalidados.push(caminho);
  },
}));

function semSessao() {
  CLIENTE.auth.getUser.mockResolvedValue({ data: { user: null } });
}

/** Uma sessão autenticada SEM papel de staff — o cliente da Garagem. */
function comoVisitante() {
  CLIENTE.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  CLIENTE.from.mockReturnValue({
    select: () => ({
      eq: () => ({ single: async () => ({ data: { role: "cliente", papeis: [] } }) }),
    }),
  });
}

/**
 * O banco de mentira, com ESTADO — a linha existe ou não.
 *
 * Precisa de estado porque a rota deixou de substituir a linha inteira: ela
 * faz UPDATE do que veio e, só se não houver linha, INSERT. Um dublê sem
 * memória não distingue os dois caminhos, e é justamente essa distinção que
 * torna o apagamento acidental inexpressável.
 */
let linhaNoBanco: { titulo_seo: string | null; resumo: string | null } | null = null;
/** O que a rota MANDOU escrever nesta chamada — só as colunas alteradas. */
let gravado: Record<string, unknown> | null = null;
/**
 * As COLUNAS que a rota pede de volta ao gravar.
 *
 * Guardadas só para uma asserção de sanidade: quem faz o trabalho é
 * `lerColunas`, que monta a resposta com as CHAVES que aquele `select`
 * produziria. A versão anterior deste comentário previa o sintoma errado: um
 * alias não faz a tela "exigir recarga" — `dados.cabecalho` continua sendo
 * objeto, a guarda do 200-ilegível não dispara, e o operador vê os dois campos
 * em branco com um "Salvo. A seção está no texto padrão" em verde, com o texto
 * dele no ar.
 */
let colunasPedidas: string | null = null;

/**
 * As colunas que a tabela TEM. Pedir outra é `42703`, não `undefined`.
 *
 * A lista vem da migração `20260907120000_cabecalho_dos_guias.sql`, e é a
 * mesma nos dois dublês desta feature (aqui e em
 * `cabecalho-da-secao.test.ts`). Se a migração ganhar coluna, as
 * duas mudam juntas.
 */
const COLUNAS_DA_TABELA = [
  "secao",
  "titulo_seo",
  "resumo",
  "atualizado_por",
  "atualizado_em",
  "criado_em",
];

/**
 * O que o PostgREST DEVOLVERIA para este `select` — chaves e erro inclusive.
 *
 * A sétima revisão mostrou por que a trava anterior não servia: ela proibia
 * `resumo as texto`, e essa grafia não existe no PostgREST — o parser do
 * `select` recusaria com 400. Alias ali é `apelido:coluna`, e a chave que
 * chega ao código é o APELIDO. Um dublê que devolve sempre `titulo_seo`,
 * qualquer que seja o `select`, é mais generoso que o servidor, e foi assim
 * que o alias de verdade sobreviveu a duas rodadas.
 *
 * A oitava cobrou a outra metade: coluna que não existe. O dublê devolvia a
 * chave `undefined`, o `JSON.stringify` a comia, e o mutante sobrevivia — em
 * produção o PostgREST responde `42703`. Na LEITURA isso é pior que parece:
 * `42703` está dentro de `ehTabelaOuColunaAusente`, então uma coluna
 * renomeada vira `lido: true` com o cabeçalho VAZIO — `/guias` volta ao texto
 * do código, o painel mostra campos em branco SEM o aviso, e ninguém percebe.
 *
 * Projetar em vez de vigiar também tira a sobre-especificação: `select("*")`
 * passa, porque em produção passaria.
 *
 * (`resumo::text` e recurso embutido — `autor:profiles(nome)` — dariam
 * falso-vermelho aqui. Nenhum dos dois é usado nesta feature.)
 */
function lerColunas(
  linha: Record<string, unknown> | null,
  colunas: string,
): { data: Record<string, unknown> | null; error: { code: string; message: string } | null } {
  const pedidas =
    colunas.trim() === "*"
      ? COLUNAS_DA_TABELA
      : colunas
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean);

  for (const campo of pedidas) {
    const coluna = campo.includes(":") ? campo.split(":")[1].trim() : campo;
    if (!COLUNAS_DA_TABELA.includes(coluna)) {
      return {
        data: null,
        error: { code: "42703", message: `column cabecalho_dos_guias.${coluna} does not exist` },
      };
    }
  }

  if (!linha) return { data: null, error: null };

  const saida: Record<string, unknown> = {};
  for (const campo of pedidas) {
    const [apelido, coluna] = campo.includes(":") ? campo.split(":") : [campo, campo];
    saida[apelido.trim()] = linha[coluna.trim()] ?? null;
  }
  return { data: saida, error: null };
}

/**
 * Quantas vezes a rota TENTOU inserir.
 *
 * É o que denuncia o filtro errado no UPDATE sem depender do desfecho: com a
 * linha já no banco, um INSERT é sempre uma tentativa que o Postgres vai
 * recusar. O retry de 23505 esconde o sintoma de quem olha só o status.
 */
let tentativasDeInsert = 0;
/**
 * A corrida: a linha NASCE entre o UPDATE e o INSERT desta requisição.
 *
 * É o único jeito de exercitar o retry de 23505 — sem isto, o UPDATE encontra
 * a linha e o INSERT nunca acontece, e o teste da corrida seria enfeite.
 */
let corridaArmada = false;
/**
 * O erro que o PostgREST devolve quando a tabela não existe.
 *
 * `PGRST205`, e não `42P01` — o código do Postgres nunca chega ao cliente
 * (caderno do projeto). É o estado do ambiente ENQUANTO a migração não for
 * aplicada, então hoje este é o desfecho de todo clique em Salvar.
 */
let erroDoBanco: { code: string; message: string } | null = null;
/**
 * Erro SÓ no INSERT, com o UPDATE passando.
 *
 * Precisa ser separado de `erroDoBanco`: com os dois statements falhando, o
 * `if (error)` do UPDATE devolve antes e o ramo do INSERT nunca é alcançado —
 * foi assim que o meu primeiro teste do B13 ficou verde com o mutante vivo.
 * O estado que ele modela é real: a tabela existe, o UPDATE não acha linha, e
 * o INSERT é recusado (RLS que mudou, timeout, deadlock).
 */
let erroNoInsert: { code: string; message: string } | null = null;

function comoEditor() {
  CLIENTE.auth.getUser.mockResolvedValue({ data: { user: { id: "staff-1" } } });
  CLIENTE.from.mockImplementation((tabela: string) => {
    if (tabela === "profiles") {
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { role: "admin", papeis: ["admin"] } }) }),
        }),
      };
    }
    // O FILTRO é respeitado. Ignorá-lo deixava passar `.eq("secao","guia")` na
    // rota: todo save cairia no INSERT e, do segundo em diante, 23505 — com a
    // suíte verde. E no DELETE, apagar nada e responder "pronto".
    const filtroCerto = (coluna: string, valor: string) =>
      tabela === "cabecalho_dos_guias" && coluna === "secao" && valor === "guias";
    const devolver = (colunas: string) => {
      colunasPedidas = colunas;
      return { maybeSingle: async () => lerColunas(linhaNoBanco, colunas) };
    };
    return {
      update: (troca: Record<string, unknown>) => ({
        eq: (coluna: string, valor: string) => {
          if (erroDoBanco) {
            return {
              select: () => ({ maybeSingle: async () => ({ data: null, error: erroDoBanco }) }),
            };
          }
          if (filtroCerto(coluna, valor)) {
            if (corridaArmada) {
              // A outra gravação ainda não chegou: este UPDATE não acha nada.
              // Ela chega logo em seguida, e a linha passa a existir.
              corridaArmada = false;
              linhaNoBanco = { titulo_seo: null, resumo: "Quem chegou primeiro" };
              return {
                select: (colunas: string) => {
                  colunasPedidas = colunas;
                  return { maybeSingle: async () => ({ data: null, error: null }) };
                },
              };
            }
            gravado = troca;
            // Sem linha, o UPDATE não afeta nada — é o que faz a rota cair no
            // INSERT.
            if (linhaNoBanco) {
              linhaNoBanco = {
                titulo_seo:
                  "titulo_seo" in troca
                    ? ((troca.titulo_seo as string) || null)
                    : linhaNoBanco.titulo_seo,
                resumo:
                  "resumo" in troca ? ((troca.resumo as string) || null) : linhaNoBanco.resumo,
              };
            }
            return { select: devolver };
          }
          // Filtro errado: zero linha afetada, e SEM erro — é o que o
          // PostgREST faz, e é o que torna o defeito silencioso.
          return {
            select: (colunas: string) => {
              colunasPedidas = colunas;
              return { maybeSingle: async () => ({ data: null, error: null }) };
            },
          };
        },
      }),
      insert: (linha: Record<string, unknown>) => {
        tentativasDeInsert += 1;
        const erro = erroDoBanco ?? erroNoInsert;
        if (erro) {
          return {
            select: () => ({ maybeSingle: async () => ({ data: null, error: erro }) }),
          };
        }
        // A chave primária é REAL no dublê. Sem ela, inserir por cima da linha
        // existente parecia funcionar aqui e devolvia 23505 em produção — que
        // é o desfecho de `.eq()` com o valor errado no UPDATE.
        if (linhaNoBanco) {
          return {
            select: (colunas: string) => {
              colunasPedidas = colunas;
              return {
                maybeSingle: async () => ({
                  data: null,
                  error: {
                    code: "23505",
                    message:
                      'duplicate key value violates unique constraint "cabecalho_dos_guias_pkey"',
                  },
                }),
              };
            },
          };
        }
        gravado = linha;
        linhaNoBanco = {
          titulo_seo: (linha.titulo_seo as string) || null,
          resumo: (linha.resumo as string) || null,
        };
        return { select: devolver };
      },
      delete: () => ({
        eq: (coluna: string, valor: string) => ({
          select: async (colunas: string) => {
            colunasPedidas = colunas;
            if (erroDoBanco) return { data: null, error: erroDoBanco };
            if (!filtroCerto(coluna, valor) || !linhaNoBanco) {
              return { data: [], error: null };
            }
            linhaNoBanco = null;
            return { data: [{ secao: "guias" }], error: null };
          },
        }),
      }),
    };
  });
}

function pedido(corpo: unknown) {
  return new Request("http://localhost/api/guias/secao", {
    method: "PUT",
    body: JSON.stringify(corpo),
  }) as never;
}

async function put(corpo: unknown) {
  const { PUT } = await import("../src/app/api/guias/secao/route");
  return PUT(pedido(corpo));
}

async function apagar() {
  const { DELETE } = await import("../src/app/api/guias/secao/route");
  return DELETE();
}

beforeEach(() => {
  vi.clearAllMocks();
  gravado = null;
  colunasPedidas = null;
  linhaNoBanco = null;
  tentativasDeInsert = 0;
  corridaArmada = false;
  erroDoBanco = null;
  erroNoInsert = null;
  revalidados.length = 0;
});

describe("a rota do cabeçalho não escreve sem autorização", () => {
  it("sem sessão devolve 401", async () => {
    semSessao();
    expect((await put({ resumo: "invadido" })).status).toBe(401);
    expect(gravado, "nada pode ter sido gravado").toBeNull();
  });

  it("autenticado sem papel de staff devolve 403", async () => {
    // Cliente da Garagem autentica no MESMO pool `auth.users` do painel. A
    // régua é `ehStaff()` antes de `normalizarPerfil`, que promoveria um
    // cliente a "comercial" — CLAUDE.md.
    comoVisitante();
    expect((await put({ resumo: "invadido" })).status).toBe(403);
    expect(gravado, "nada pode ter sido gravado").toBeNull();
  });

  /**
   * Staff DE VERDADE, mas sem a linha da A17 que governa cópia de site.
   *
   * Sem este caso, metade da régua não tem mutante: reduzir a condição a
   * `if (!ehStaff(profile))` deixava a suíte inteira verde e abria a escrita
   * para GESTOR e FINANCEIRO, nas duas rotas. Os dois casos acima não pegam
   * porque em ambos `perfisDe` devolve `[]` — `podeFazer` já responderia
   * `nao_ve` sozinho, e a segunda metade nunca é exercitada.
   */
  it.each([["gestor"], ["financeiro"]])(
    "%s é staff, mas não escreve cópia de site",
    async (papel) => {
      CLIENTE.auth.getUser.mockResolvedValue({ data: { user: { id: "u2" } } });
      CLIENTE.from.mockReturnValue({
        select: () => ({
          eq: () => ({ single: async () => ({ data: { role: papel, papeis: [papel] } }) }),
        }),
      });

      expect((await put({ resumo: "fora da alçada" })).status).toBe(403);
      expect(gravado, "nada pode ter sido gravado").toBeNull();
    },
  );
});

describe("o editor grava, e limpar volta ao automático", () => {
  it("o texto chega ao banco com o autor junto", async () => {
    comoEditor();
    const r = await put({ tituloSeo: "Guias de compra", resumo: "Um resumo novo." });

    expect(r.status).toBe(200);
    expect(gravado).toMatchObject({
      secao: "guias",
      titulo_seo: "Guias de compra",
      resumo: "Um resumo novo.",
      atualizado_por: "staff-1",
    });
  });

  it("campo vazio é ACEITO — é como o painel devolve a seção ao padrão", async () => {
    // O publicador de guia recusa descrição vazia; esta rota não pode. Lá o
    // banco é fonte e vazio significa página pela metade; aqui é override e
    // vazio significa "use o texto do código".
    comoEditor();
    const r = await put({ tituloSeo: "", resumo: "" });

    expect(r.status).toBe(200);
    expect(gravado).toMatchObject({ titulo_seo: "", resumo: "" });
  });

  it("corta no teto do banco em vez de deixar o Postgres recusar", async () => {
    comoEditor();
    await put({ resumo: "x".repeat(500) });

    expect(String(gravado?.resumo)).toHaveLength(300);
  });

  it("avisa quando o resumo passa da régua da busca, sem recusar", async () => {
    comoEditor();
    const longo = "x".repeat(200);
    const r = await put({ resumo: longo });
    const dados = await r.json();

    // Aviso, não trava: quem decide o texto é quem escreve. Recusar por três
    // caracteres seria pior que uma description cortada no SERP.
    expect(r.status).toBe(200);
    expect(dados.avisos?.join(" ")).toContain("155");
  });

  it("resumo dentro da régua não gera aviso nenhum", async () => {
    comoEditor();
    const r = await put({ resumo: "Curto e dentro do limite." });
    const dados = await r.json();

    expect(dados.avisos ?? []).toHaveLength(0);
  });
});

describe("a rota grava SÓ o que veio no corpo", () => {
  /**
   * O desenho que substituiu cinco travas de interface, em 07/09.
   *
   * Antes, o corpo trazia sempre os dois campos e vazio significava "volte ao
   * padrão" — então "apague o meu texto" e "não sei o que tem lá" eram a mesma
   * requisição. A segunda acontecia toda vez que a tela não conseguia ler, e
   * cada caminho até ela exigia uma trava nova.
   *
   * Agora chave ausente significa "não mexa nesta coluna", e o estado ruim
   * deixou de ser expressável.
   */
  it("campo que não veio não é escrito", async () => {
    comoEditor();
    linhaNoBanco = { titulo_seo: "Título que estava no ar", resumo: "Resumo antigo" };

    await put({ resumo: "Resumo novo" });

    expect(gravado, "só a coluna enviada").not.toHaveProperty("titulo_seo");
    expect(linhaNoBanco).toEqual({
      titulo_seo: "Título que estava no ar",
      resumo: "Resumo novo",
    });
  });

  it("corpo vazio não grava nada, e diz isso", async () => {
    // É o formulário em branco por falha de leitura chegando ao servidor. Ele
    // não pode virar uma gravação, e a tela não pode ouvir "salvo".
    comoEditor();
    linhaNoBanco = { titulo_seo: "Intacto", resumo: "Intacto" };

    const r = await put({});

    expect(r.status).toBe(400);
    expect(gravado, "nada pode ter sido escrito").toBeNull();
    expect(linhaNoBanco).toEqual({ titulo_seo: "Intacto", resumo: "Intacto" });
  });

  it("string vazia É uma alteração — limpar um campo lido continua valendo", async () => {
    // A diferença entre "apaguei de propósito" e "nunca soube o que tinha" é a
    // CHAVE estar presente. Presente com `""` é edição de verdade.
    comoEditor();
    linhaNoBanco = { titulo_seo: "Tinha título", resumo: "Tinha resumo" };

    await put({ tituloSeo: "" });

    expect(linhaNoBanco).toEqual({ titulo_seo: null, resumo: "Tinha resumo" });
  });

  it("sem linha no banco, a primeira gravação insere", async () => {
    // A migração entrega a tabela vazia de propósito. O UPDATE não afeta nada,
    // e a rota cai no INSERT sem a tela precisar saber a diferença.
    comoEditor();
    linhaNoBanco = null;

    const r = await put({ resumo: "Primeiro texto" });

    expect(r.status).toBe(200);
    expect(gravado).toMatchObject({ secao: "guias", resumo: "Primeiro texto" });
    expect(linhaNoBanco).toEqual({ titulo_seo: null, resumo: "Primeiro texto" });
  });
});

describe("apagar é um verbo separado", () => {
  it("o DELETE remove o override", async () => {
    comoEditor();
    linhaNoBanco = { titulo_seo: "Escrito no painel", resumo: "Também escrito" };

    const { DELETE } = await import("../src/app/api/guias/secao/route");
    const r = await DELETE();

    expect(r.status).toBe(200);
    expect(linhaNoBanco, "a linha tem de sair do banco").toBeNull();
    // E o índice sai do cache, senão /guias segue mostrando o texto apagado.
    expect(revalidados).toContain("/guias");
  });

  it("e ninguém apaga sem passar pela porta", async () => {
    semSessao();
    linhaNoBanco = { titulo_seo: "Escrito no painel", resumo: "" };

    expect((await apagar()).status).toBe(401);
    expect(linhaNoBanco, "nada pode ter sido apagado").not.toBeNull();
  });

  it("a resposta diz se APAGOU alguma coisa, e não só que rodou", async () => {
    // Pelo caderno do projeto, RLS não devolve erro — devolve VAZIO. Um DELETE
    // que olha só o `error` responde 200 depois de não apagar nada, e a tela
    // anuncia "voltou ao texto padrão" com o texto ainda no ar.
    comoEditor();
    linhaNoBanco = { titulo_seo: "No ar", resumo: "No ar" };

    const corpo = await (await apagar()).json();

    expect(corpo.apagou).toBe(true);
  });

  it("sem override, apaga nada — e diz isso, sem descartar cache", async () => {
    // Desfecho legítimo: a seção já estava no automático. Mas é diferente de
    // "apaguei", e revalidar aqui seria jogar fora o cache de /guias por uma
    // ação que não mudou uma vírgula.
    comoEditor();
    linhaNoBanco = null;

    const resposta = await apagar();
    const corpo = await resposta.json();

    expect(resposta.status).toBe(200);
    expect(corpo.apagou).toBe(false);
    expect(revalidados, "nada mudou, nada sai do cache").toEqual([]);
  });
});

describe("antes da migração, a rota diz o que está acontecendo", () => {
  /**
   * O estado do ambiente ENQUANTO a tabela não existir — que é agora.
   *
   * A sétima revisão apontou que este ramo não tinha testemunha, e ele importa
   * mais que o normal justamente por isso: entre o deploy e a migração, ESTE é
   * o desfecho de todo clique em Salvar. Sem ele, o operador leria a mensagem
   * crua do PostgREST ("Could not find the table 'public.cabecalho_dos_guias'")
   * e abriria chamado.
   *
   * 503 e não 500: o servidor está bem, falta uma peça do ambiente — e a
   * diferença é o que diz a quem opera se adianta tentar de novo.
   */
  const AUSENTE = {
    code: "PGRST205",
    message: "Could not find the table 'public.cabecalho_dos_guias' in the schema cache",
  };

  it("salvar responde 503 com frase, não a mensagem crua do banco", async () => {
    comoEditor();
    erroDoBanco = AUSENTE;

    const r = await put({ resumo: "Texto novo" });
    const corpo = await r.json();

    expect(r.status).toBe(503);
    expect(corpo.error).toContain("ainda não existe neste ambiente");
    expect(corpo.error, "a mensagem do PostgREST não vai para a tela").not.toContain(
      "schema cache",
    );
  });

  it("apagar responde igual — a régua é a mesma nos dois verbos", async () => {
    comoEditor();
    erroDoBanco = AUSENTE;

    const r = await apagar();

    expect(r.status).toBe(503);
    expect((await r.json()).error).toContain("ainda não existe neste ambiente");
  });

  it("erro no INSERT também chega inteiro — e o cache NÃO é descartado", async () => {
    // O terceiro ponto de chamada do `falha()`, o único que estava sem
    // testemunha. Sem ele, um erro que não seja 23505 no INSERT — RLS negando,
    // timeout, o retry estourando de novo — vira 200 com `cabecalho: null` E
    // um `revalidarCluster()`: o cache de /guias e do sitemap vai fora por uma
    // gravação que não aconteceu, e a tela diz "o servidor aceitou, mas não
    // consegui confirmar o que ficou gravado". O servidor não aceitou.
    comoEditor();
    linhaNoBanco = null;
    erroNoInsert = { code: "57014", message: "canceling statement due to statement timeout" };

    const r = await put({ resumo: "Texto novo" });

    expect(tentativasDeInsert, "o teste precisa CHEGAR ao INSERT").toBe(1);
    expect(r.status).toBe(500);
    expect((await r.json()).error).toContain("timeout");
    expect(revalidados, "nada foi gravado: nada sai do cache").toEqual([]);
  });

  it("e erro DE VERDADE continua sendo 500, com o motivo", async () => {
    // O que discrimina: sem esta metade, devolver 503 para tudo passaria — e o
    // 503 diz "falta uma peça do ambiente", que é mentira num timeout.
    comoEditor();
    erroDoBanco = { code: "57014", message: "canceling statement due to statement timeout" };

    const r = await put({ resumo: "Texto novo" });

    expect(r.status).toBe(500);
    expect((await r.json()).error).toContain("timeout");
  });
});

describe("o filtro da linha é o que faz a rota achar o que já existe", () => {
  /**
   * O mutante que a suíte deixava passar até 08/09.
   *
   * Trocar `.eq("secao", "guias")` por `"guia"` no UPDATE não quebra a
   * PRIMEIRA gravação: sem linha, o caminho é o INSERT de qualquer jeito. Da
   * SEGUNDA em diante o UPDATE não acha nada, a rota tenta inserir por cima da
   * chave primária, o Postgres devolve 23505 — e o retry logo abaixo salva a
   * resposta. Ou seja: em produção o sintoma NÃO é falhar, é gastar três
   * statements e uma violação de PK por gravação, em silêncio.
   *
   * Por isso o desfecho não é a trava deste bloco. Quem mata o mutante é o
   * `tentativasDeInsert` do teste seguinte, que olha o que a rota FEZ e não o
   * que ela respondeu. Este aqui guarda o desfecho: seja qual for o caminho, a
   * segunda gravação não pode falhar nem duplicar linha.
   */
  it("a segunda gravação atualiza a linha, em vez de tentar criar outra", async () => {
    comoEditor();
    linhaNoBanco = null;

    expect((await put({ resumo: "Primeiro texto" })).status).toBe(200);
    const segunda = await put({ resumo: "Segundo texto" });

    expect(segunda.status, "a segunda gravação não pode falhar").toBe(200);
    expect(linhaNoBanco).toEqual({ titulo_seo: null, resumo: "Segundo texto" });
  });

  it("e o DELETE apaga a linha DESTA seção, não uma que não existe", async () => {
    comoEditor();
    linhaNoBanco = { titulo_seo: "No ar", resumo: "No ar" };

    await apagar();

    expect(linhaNoBanco).toBeNull();
  });

  it("gravar sobre linha existente NÃO tenta inserir", async () => {
    // O que denuncia o filtro errado sem depender do desfecho. Com `"guia"` no
    // lugar de `"guias"`, o UPDATE não acha a linha que está ali e a rota vai
    // ao INSERT — três statements por gravação, um deles condenado a 23505.
    // O retry conserta a resposta, então o status não conta essa história.
    comoEditor();
    linhaNoBanco = { titulo_seo: "No ar", resumo: "No ar" };

    await put({ resumo: "Editado" });

    expect(tentativasDeInsert, "a linha já existe: era para o UPDATE achá-la").toBe(0);
  });

  it("corrida de duas gravações na tabela vazia não estoura na cara de ninguém", async () => {
    // A linha NASCE entre o UPDATE e o INSERT: as duas gravações viram a
    // tabela vazia e as duas tentam inserir. A perdedora recebe 23505 e refaz
    // o UPDATE, que agora encontra a linha. Sem o retry, o operador leria
    // "duplicate key value violates unique constraint" depois de escrever um
    // parágrafo.
    comoEditor();
    linhaNoBanco = null;
    corridaArmada = true;

    const resposta = await put({ resumo: "Quem chegou depois" });
    const corpo = await resposta.json();

    expect(resposta.status, "23505 não pode chegar à tela").toBe(200);
    expect(tentativasDeInsert, "o INSERT tem de ter acontecido e falhado").toBe(1);
    expect(linhaNoBanco).toEqual({ titulo_seo: null, resumo: "Quem chegou depois" });
    // E o corpo continua legível pelo cliente — senão a tela exige recarga.
    expect(corpo.cabecalho).toEqual({ titulo_seo: null, resumo: "Quem chegou depois" });
  });
});

describe("a rota e o cliente falam a mesma língua", () => {
  /**
   * O contrato ficou NU justamente quando passou a importar.
   *
   * O conserto do 200-ilegível (B13) tornou `dados.cabecalho` obrigatório no
   * corpo da resposta — sem ele, `salvarCabecalho` devolve `exigeRecarga` e a
   * tela trava. Mas nada guardava quem PRODUZ esse campo, e os dois defeitos
   * possíveis têm sintomas DIFERENTES:
   *
   *   · renomear a chave `cabecalho` na resposta → `exigeRecarga`: a tela
   *     trava e pede recarga a cada gravação, com o texto já no banco;
   *   · trocar o `select` (alias, coluna a menos) → a chave continua lá, a
   *     guarda do 200-ilegível NÃO dispara, e a tela mostra os dois campos em
   *     branco anunciando "Salvo. A seção está no texto padrão" em verde, com
   *     o texto do operador gravado e no ar.
   *
   * O segundo é o pior dos dois, e é o que a revisão de 08/09 mediu. A versão
   * anterior deste bloco previa `exigeRecarga` para os dois — e foi essa
   * previsão que fez a trava do alias olhar a coisa errada por duas rodadas.
   *
   * Os dois lados tinham teste e nenhum olhava o outro: a porta afirmava
   * `status` e o que foi gravado; o cliente afirmava contra um dublê escrito
   * por mim, que só provava que eu sou consistente comigo mesmo.
   *
   * Aqui a resposta REAL da rota alimenta o cliente REAL.
   */
  it("o corpo que a rota devolve é o que o cliente sabe ler", async () => {
    comoEditor();
    const resposta = await put({ tituloSeo: "Título gravado", resumo: "Resumo gravado." });
    const corpo = await resposta.json();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: true, json: async () => corpo })) as never;
    try {
      const { salvarCabecalho } = await import("../src/lib/salvarCabecalho");
      const r = await salvarCabecalho({ tituloSeo: "Título gravado", resumo: "Resumo gravado." });

      // Renomear a chave `cabecalho` derruba a linha de baixo (`r.ok` vira
      // `false`, com `exigeRecarga`); um alias no `select` derruba a de cima —
      // `r.ok` continua `true` e o que cai é o CONTEÚDO, com os dois campos em
      // branco. São sintomas diferentes, e a asserção precisa das duas.
      expect(r.ok, "o cliente precisa entender o corpo da rota").toBe(true);
      expect(r.ok && r.cabecalho).toEqual({
        tituloSeo: "Título gravado",
        resumo: "Resumo gravado.",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("o corpo do DELETE também: o cliente só diz \"pronto\" se a rota disser que apagou", async () => {
    // O outro lado do `.select()` da rota. Sem `apagou` no corpo — ou com ele
    // em `false` porque a RLS recusou em silêncio —, o cliente não pode
    // anunciar que a seção voltou ao padrão. Aqui a resposta REAL da rota
    // alimenta o cliente REAL, nos dois desfechos.
    comoEditor();
    linhaNoBanco = { titulo_seo: "No ar", resumo: "No ar" };
    const apagou = await (await apagar()).json();

    // Segunda chamada: já não há linha, e a rota diz isso.
    const semNada = await (await apagar()).json();

    const originalFetch = globalThis.fetch;
    try {
      const { voltarAoPadrao } = await import("../src/lib/salvarCabecalho");

      globalThis.fetch = (async () => ({ ok: true, json: async () => apagou })) as never;
      const primeiro = await voltarAoPadrao();
      expect(primeiro.ok, "apagou de verdade").toBe(true);
      expect(primeiro.ok && primeiro.texto).toContain("voltou ao texto padrão");

      globalThis.fetch = (async () => ({ ok: true, json: async () => semNada })) as never;
      const segundo = await voltarAoPadrao();
      expect(segundo.ok, "não apagou nada: não pode dizer que apagou").toBe(false);
      expect(segundo.texto).toContain("Não apaguei nada");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("a rota pede de volta as colunas que o cliente sabe ler", async () => {
    comoEditor();
    await put({ tituloSeo: "x", resumo: "y" });

    // O CONJUNTO INTEIRO de chaves do corpo, e não uma substring proibida: o
    // cliente lê `titulo_seo` e `resumo`, e um alias no `select` (`x:resumo`,
    // que é a sintaxe do PostgREST) troca o nome da chave sem tirar nenhuma
    // das duas palavras da string do `select`. Foi assim que a trava anterior
    // deixou o alias passar. Ver `projetar`.
    const corpo = await (await put({ tituloSeo: "a", resumo: "b" })).json();
    expect(Object.keys(corpo.cabecalho).sort()).toEqual(["resumo", "titulo_seo"]);
    expect(colunasPedidas, "e a rota precisa ter pedido alguma coisa").not.toBeNull();
  });

  it("e o caminho de limpar também: nulo no banco vira vazio na tela", async () => {
    comoEditor();
    const resposta = await put({ tituloSeo: "", resumo: "" });
    const corpo = await resposta.json();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: true, json: async () => corpo })) as never;
    try {
      const { salvarCabecalho } = await import("../src/lib/salvarCabecalho");
      const r = await salvarCabecalho({ tituloSeo: "", resumo: "" });

      expect(r.ok).toBe(true);
      expect(r.ok && r.cabecalho).toEqual({ tituloSeo: "", resumo: "" });
      // A frase distingue os desfechos sem prometer o que não aconteceu:
      // esvaziar os dois campos deixa a seção NO padrão, mas quem apaga o
      // override é o DELETE, que tem botão próprio.
      expect(r.ok && r.texto).toContain("no texto padrão");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("gravar tira o índice do cache", () => {
  it("o índice e o sitemap saem, e a ficha de guia não é tocada", async () => {
    comoEditor();
    await put({ resumo: "Texto novo." });

    // `/guias` porque é onde o texto aparece; `/sitemap.xml` porque ele declara
    // `revalidate = 3600` e é a única rota do repositório que precisa disso.
    // A ficha de um guia NÃO entra: o cabeçalho da seção não muda o conteúdo
    // de guia nenhum, e revalidar 1..N fichas por uma edição de cabeçalho seria
    // descartar cache que ninguém pediu.
    expect(revalidados).toEqual(["/guias", "/sitemap.xml"]);
  });

  it("quem não passou pela porta não descarta cache nenhum", async () => {
    semSessao();
    await put({ resumo: "invadido" });

    expect(revalidados).toEqual([]);
  });
});
