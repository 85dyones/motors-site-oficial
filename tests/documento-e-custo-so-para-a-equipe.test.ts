import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { ler, lerCodigo } from "./fonte";
import {
  COLUNAS_INTERNAS_DO_ESTOQUE,
  COLUNAS_PUBLICAS_DO_ESTOQUE,
  ESTOQUE_DA_EQUIPE,
} from "../src/lib/colunasDoEstoque";

/**
 * Placa, chassi, renavam e custo: só a equipe lê — 2026-10-01.
 *
 * A migração de 29/09 fechou essas colunas para o `anon` e deixou o
 * `authenticated` lendo a tabela inteira. Só que `authenticated` não é
 * "equipe": cliente da Garagem e investidor com login também são. Com a
 * própria sessão, qualquer um deles fazia
 *
 *   GET /rest/v1/estoque_motors?select=placa,chassi,renavam,preco_compra
 *
 * e recebia os documentos e o custo de todo o pátio.
 *
 * RLS não recorta coluna, e privilégio de coluna não distingue usuário — os
 * dois são `authenticated`. O conserto tem por isso duas metades, e cada bloco
 * abaixo trava uma:
 *
 *   - o banco (migração 20261001150000): o `authenticated` passa a ler da
 *     TABELA só a lista pública, como o `anon`; documento e custo saem por
 *     `estoque_motors_equipe`, uma view que roda como dona e corta por
 *     `is_staff(auth.uid())` — o molde de `vw_ciclo_estado_painel`;
 *   - o código: toda leitura do painel que precisa de documento ou custo vai
 *     pela view (`lerComoEquipe`), e nenhuma leitura de `estoque_motors` pede
 *     coluna interna. Uma que pedisse seria recusada INTEIRA pelo PostgREST
 *     depois da migração — e a do piso de custo falharia ABERTA: a gravação
 *     seguiria sem a trava de dinheiro.
 */

const MIGRACAO = "20261001150000_documento_e_custo_so_para_a_equipe.sql";
const PASTA = "supabase/migrations";
const REVERSAO = "supabase/manutencao/reversao/documento-e-custo-2026-10-01.sql";
const PUBLICAS = new Set<string>(COLUNAS_PUBLICAS_DO_ESTOQUE);
const INTERNAS = new Set<string>(COLUNAS_INTERNAS_DO_ESTOQUE);

const semComentario = (sql: string) =>
  sql
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

const migracoes = readdirSync(join(__dirname, "..", PASTA))
  .filter((f) => f.endsWith(".sql"))
  .sort();

const executavel = (arquivo: string) => semComentario(ler(`${PASTA}/${arquivo}`));

/** Arquivo ausente vira texto vazio: cada afirmação reprova pelo seu motivo. */
const sqlDaMigracao = () =>
  existsSync(join(__dirname, "..", PASTA, MIGRACAO)) ? executavel(MIGRACAO) : "";

const colunasDe = (lista: string) =>
  lista
    .split(",")
    .map((c) => c.trim().replace(/^'|'$/g, ""))
    .filter(Boolean);

// ===========================================================================
// O banco
// ===========================================================================

describe("a migração existe e é a que o código espera", () => {
  it("o arquivo está em supabase/migrations", () => {
    expect(existsSync(join(__dirname, "..", PASTA, MIGRACAO)), MIGRACAO).toBe(true);
  });

  it("o nome da view no código é o nome criado no banco", () => {
    expect(ESTOQUE_DA_EQUIPE).toBe("estoque_motors_equipe");
  });
});

describe("o authenticated lê da TABELA só a lista pública", () => {
  /**
   * Privilégio final do `authenticated` em `estoque_motors` depois de todas as
   * migrações, com a semântica do Postgres — mesma leitura que o teste da
   * leitura anônima faz para o `anon`. O SELECT de tabela que o Supabase dá
   * por padrão não aparece em migração nenhuma; o que importa é que a última
   * palavra sobre a tabela seja um revoke, seguido do grant por coluna.
   */
  function privilegioFinalDoAuthenticated() {
    const comando =
      /\b(grant|revoke)\s+(select|all(?:\s+privileges)?)\s*(?:\(([^)]*)\))?\s+on\s+(?:table\s+)?public\.estoque_motors\s+(to|from)\s+([^;]+);/gi;
    let tabela: boolean | null = null;
    const colunas = new Set<string>();
    const reabriuDepois: string[] = [];
    for (const arquivo of migracoes) {
      for (const m of executavel(arquivo).matchAll(comando)) {
        const papeis = m[5].toLowerCase().split(",").map((p) => p.trim());
        if (!papeis.includes("authenticated") && !papeis.includes("public")) continue;
        const concede = m[1].toLowerCase() === "grant";
        if (m[3] === undefined) {
          tabela = concede;
          if (!concede) colunas.clear();
          if (concede && arquivo >= MIGRACAO) reabriuDepois.push(arquivo);
        } else {
          for (const c of colunasDe(m[3])) {
            if (concede) colunas.add(c);
            else colunas.delete(c);
          }
        }
      }
    }
    return { tabela, colunas, reabriuDepois };
  }

  it("depois de todas as migrações: sem SELECT de tabela, e as colunas são a constante do código", () => {
    const { tabela, colunas } = privilegioFinalDoAuthenticated();
    expect(tabela, "o authenticated tem SELECT de tabela — placa e custo reabertos para cliente e investidor").toBe(false);
    expect([...colunas].sort()).toEqual([...COLUNAS_PUBLICAS_DO_ESTOQUE].sort());
  });

  it("nenhuma migração a partir desta devolve SELECT de tabela ao authenticated", () => {
    expect(privilegioFinalDoAuthenticated().reabriuDepois).toEqual([]);
    for (const arquivo of migracoes.filter((f) => f >= MIGRACAO)) {
      expect(executavel(arquivo), arquivo).not.toMatch(
        /grant\s+(select|all)[^;]*on\s+all\s+tables\s+in\s+schema\s+public\s+to\s+[^;]*\b(authenticated|public)\b/i,
      );
    }
  });

  it("revoga o SELECT de TABELA antes de conceder por coluna — e só o SELECT", () => {
    const sql = sqlDaMigracao();
    const revoga = sql.search(/revoke select on public\.estoque_motors from authenticated;/);
    const concede = sql.search(/grant select \([^)]*\) on public\.estoque_motors to authenticated;/);
    expect(revoga).toBeGreaterThan(-1);
    expect(concede).toBeGreaterThan(revoga);
    // INSERT e UPDATE ficam: o cadastro nativo grava placa, chassi, renavam e
    // custo, e o editor grava placa. Escrever não exige ler.
    expect(sql).not.toMatch(/revoke\s+(all|insert|update)[^;]*on\s+public\.estoque_motors\s+from/i);
  });
});

describe("a view da equipe", () => {
  const sql = sqlDaMigracao();

  it("corta por is_staff(auth.uid()), com security_barrier, e roda como dona", () => {
    const criacao = sql.match(/create or replace view public\.estoque_motors_equipe([\s\S]*?);/);
    expect(criacao, "a migração não cria a view").not.toBeNull();
    const corpo = criacao![1];
    expect(corpo).toMatch(/security_barrier\s*=\s*true/);
    // Como `vw_ciclo_estado_painel`: invoker leria a tabela na pele de quem
    // pergunta, e o authenticated não lê mais as colunas internas — a view
    // não serviria a ninguém. O corte é o WHERE.
    expect(corpo).not.toMatch(/security_invoker\s*=\s*true/);
    expect(corpo).toMatch(/select e\.\* from public\.estoque_motors e\s+where public\.is_staff\(auth\.uid\(\)\)\s*$/);
  });

  it("só se lê: ninguém além do service_role ganha outro privilégio nela, em migração nenhuma", () => {
    // Uma view simples é ATUALIZÁVEL no Postgres. Rodando como dona, um
    // UPDATE ou DELETE por ela passaria por cima da RLS de escrita da tabela.
    const revogaTudo = sql.search(
      /revoke all on public\.estoque_motors_equipe from public, anon, authenticated;/,
    );
    const concedeLeitura = sql.search(/grant select on public\.estoque_motors_equipe to authenticated;/);
    expect(revogaTudo).toBeGreaterThan(-1);
    expect(concedeLeitura).toBeGreaterThan(revogaTudo);

    const abriu: string[] = [];
    for (const arquivo of migracoes) {
      for (const m of executavel(arquivo).matchAll(
        /\bgrant\s+([^;]*?)\s+on\s+(?:table\s+)?public\.estoque_motors_equipe\s+to\s+([^;]+);/gi,
      )) {
        const privilegios = m[1].toLowerCase();
        const papeis = m[2].toLowerCase();
        if (/\b(anon|public)\b/.test(papeis)) abriu.push(`${arquivo}: ${m[0]}`);
        if (/\bauthenticated\b/.test(papeis) && privilegios.trim() !== "select") abriu.push(`${arquivo}: ${m[0]}`);
      }
    }
    expect(abriu).toEqual([]);
  });

  it("coluna nova em estoque_motors recria a view na MESMA migração", () => {
    // `e.*` se expande quando a view é criada. Coluna acrescentada depois não
    // aparece nela, e o painel — que lê por ela — perde o campo em silêncio.
    const esquecidas = migracoes
      .filter((f) => f > MIGRACAO)
      .filter((f) => /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?estoque_motors\s+add\s+column/i.test(executavel(f)))
      .filter((f) => !/create or replace view public\.estoque_motors_equipe/.test(executavel(f)));
    expect(esquecidas).toEqual([]);
  });
});

describe("a autoconferência prova a migração na prática", () => {
  const sql = sqlDaMigracao();

  it("as duas listas cobrem a tabela inteira, e são as do código", () => {
    const publicas = sql.match(/publicas text\[\] := array\[([\s\S]*?)\];/);
    const internas = sql.match(/internas text\[\] := array\[([\s\S]*?)\];/);
    const grant = sql.match(/grant select \(([^)]*)\) on public\.estoque_motors to authenticated;/);
    expect(publicas && colunasDe(publicas[1])).toEqual([...COLUNAS_PUBLICAS_DO_ESTOQUE]);
    expect(internas && colunasDe(internas[1])).toEqual([...COLUNAS_INTERNAS_DO_ESTOQUE]);
    expect(grant && colunasDe(grant[1]).sort()).toEqual([...COLUNAS_PUBLICAS_DO_ESTOQUE].sort());
    expect(sql).toMatch(/fora das duas listas/);
  });

  it("a view tem as colunas da tabela, na mesma ordem", () => {
    expect(sql).toMatch(/information_schema\.columns[\s\S]*estoque_motors_equipe/);
    expect(sql).toMatch(/a view não tem as colunas da tabela/);
  });

  it("na pele do authenticated: a lista pública passa; placa e select * são recusados", () => {
    expect(sql).toMatch(/set local role authenticated;/);
    expect(sql).toMatch(/perform placa from public\.estoque_motors limit 1;[\s\S]*?exception when insufficient_privilege/);
    expect(sql).toMatch(/perform \* from public\.estoque_motors limit 1;[\s\S]*?exception when insufficient_privilege/);
  });

  it("com a sessão de alguém da equipe a view entrega o pátio inteiro; sem, nada", () => {
    expect(sql).toMatch(/request\.jwt\.claims/);
    expect(sql).toMatch(/a equipe não lê o pátio inteiro pela view/);
    expect(sql).toMatch(/quem não é da equipe leu linha pela view/);
  });

  it("a escrita do painel pela sessão continua de pé", () => {
    // O editor grava placa pela sessão; o cadastro nativo, placa, chassi,
    // renavam e custo. Nenhum dos dois precisa LER a coluna.
    expect(sql).toMatch(/update public\.estoque_motors set placa = /);
    expect(sql).toMatch(/has_column_privilege\('authenticated', 'public\.estoque_motors', c, 'insert'\)/);
  });

  it("termina com o rodapé do livro-razão", () => {
    expect(sql).toMatch(
      /insert into supabase_migrations\.schema_migrations \(version, name\)\s+values \('20261001150000', 'documento_e_custo_so_para_a_equipe'\)\s+on conflict \(version\) do nothing;\s*$/,
    );
  });
});

describe("a reversão", () => {
  it("existe, devolve a tabela DEPOIS de tirar as colunas, e mantém a view", () => {
    expect(existsSync(join(__dirname, "..", REVERSAO)), REVERSAO).toBe(true);
    const reversao = semComentario(ler(REVERSAO));
    const tiraColunas = reversao.search(/revoke select \([\s\S]*?\) on public\.estoque_motors from authenticated;/);
    const devolveTabela = reversao.search(/grant select on public\.estoque_motors to authenticated;/);
    expect(tiraColunas).toBeGreaterThan(-1);
    expect(devolveTabela).toBeGreaterThan(tiraColunas);
    expect(reversao).toMatch(/delete from supabase_migrations\.schema_migrations where version = '20261001150000';/);
    // O código desta PR lê pela view: apagá-la derrubaria o painel.
    expect(reversao).not.toMatch(/drop view/i);
    expect(reversao).not.toMatch(/\b(begin|commit)\s*;/i);
  });
});

// ===========================================================================
// O código, rodando contra o PostgREST como ele fica depois da migração
// ===========================================================================

const BASE = "https://dubledeteste.supabase.co";

const estado = vi.hoisted(() => {
  const anterior = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    chave: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
  // `lib/supabase.ts` decide se há banco no IMPORT.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://dubledeteste.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-de-teste";
  return {
    anterior,
    papeis: null as string[] | null,
    /** Antes da migração: a view não existe e a tabela entrega tudo. */
    viewExiste: true,
    tabelaFechada: true,
    cliente: null as unknown,
  };
});

vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => estado.cliente }));
vi.mock("../src/lib/observabilidade", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  registrarFalha: vi.fn(async () => {}),
}));

const DA_EQUIPE = ["admin", "gestor", "comercial", "financeiro", "marketing", "sdr"];

const DO_FEED = {
  id: 8009174,
  marca: "VOLKSWAGEN",
  modelo: "UP",
  versao: "DRIVE 1.0 FLEX",
  ano: 2019,
  preco: 54900,
  preco_original: 54900,
  preco_promocional: 0,
  quilometragem: 52000,
  tipo: "Hatch",
  cor: "Branco",
  vendido: false,
  origem: "sync",
  estado_cadastro: "publicado",
  last_seen_at: new Date().toISOString(),
  conteudo_atualizado_em: new Date().toISOString(),
  whatsapp_images: Array.from({ length: 8 }, (_, i) => `https://x/${i}.jpg`),
  placa: "ABC1D23",
  chassi: "9BWAG45U0KT000001",
  renavam: "01234567890",
  preco_compra: 41000,
  valor_fipe: 58000,
  codigo_fipe: "005340-6",
};

const NATIVO = {
  ...DO_FEED,
  id: 900000123,
  origem: "painel",
  last_seen_at: null,
  placa: "QWE9R87",
  chassi: "9BWAG45U0KT000002",
  preco_compra: 50000,
};

const LINHAS = [DO_FEED, NATIVO];

/** O que chegou ao dublê — e o que ele recusou. */
const idas: string[] = [];
const recusas: string[] = [];
const escritas: Array<{ recurso: string; corpo: unknown }> = [];

function resposta(corpo: unknown, status = 200): Response {
  if (status === 204 || corpo === undefined) return new Response(null, { status });
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

const nomeDaColuna = (c: string) => c.split(":").pop()!.split("::")[0].trim();

function projetar(linha: Record<string, unknown>, select: string) {
  if (select === "*") return linha;
  return Object.fromEntries(select.split(",").map(nomeDaColuna).map((c) => [c, linha[c]]));
}

function filtrar(url: URL) {
  const id = url.searchParams.get("id");
  if (!id) return LINHAS;
  const eq = id.match(/^eq\.(\d+)$/);
  if (eq) return LINHAS.filter((l) => String(l.id) === eq[1]);
  const lista = id.match(/^in\.\(([^)]*)\)$/);
  if (lista) return LINHAS.filter((l) => lista[1].split(",").includes(String(l.id)));
  return LINHAS;
}

/**
 * O PostgREST como o `authenticated` o vê depois da migração. Na TABELA,
 * `select` ausente é `*`, e `*` ou qualquer coluna interna — inclusive num
 * filtro, que o WHERE também exige privilégio — é recusado INTEIRO (42501). A
 * VIEW devolve a linha toda a quem é da equipe e nada a quem não é. Escritas
 * na tabela passam: INSERT e UPDATE continuam concedidos.
 */
async function postgrest(entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(entrada as RequestInfo, init);
  const url = new URL(req.url);
  const recurso = url.pathname.replace(/^\/rest\/v1\//, "");
  const select = url.searchParams.get("select") ?? "*";
  idas.push(`${req.method} ${recurso} ${select}`);

  if (recurso === "profiles") {
    const perfil = { role: estado.papeis?.[0] ?? null, papeis: estado.papeis, full_name: "Teste" };
    const objeto = (req.headers.get("accept") ?? "").includes("vnd.pgrst.object");
    return resposta(objeto ? perfil : [perfil]);
  }

  if (recurso === "estoque_motors") {
    if (req.method !== "GET" && req.method !== "HEAD") {
      escritas.push({ recurso, corpo: await req.text() });
      return resposta(undefined, 204);
    }
    const pedidas = select === "*" ? ["*"] : select.split(",").map(nomeDaColuna);
    const filtradas = [...url.searchParams.keys()].filter((k) => !["select", "order", "limit", "offset", "or"].includes(k));
    const pedeInterna = pedidas.some((c) => c === "*" || INTERNAS.has(c)) || filtradas.some((c) => INTERNAS.has(c));
    if (estado.tabelaFechada && pedeInterna) {
      recusas.push(`${req.method} ${recurso} ${select}`);
      return resposta({ code: "42501", details: null, hint: null, message: "permission denied for table estoque_motors" }, 403);
    }
    return resposta(filtrar(url).map((l) => projetar(l, select)));
  }

  if (recurso === "estoque_motors_equipe") {
    if (!estado.viewExiste) {
      return resposta(
        { code: "PGRST205", details: null, hint: null, message: "Could not find the table 'public.estoque_motors_equipe' in the schema cache" },
        404,
      );
    }
    if (req.method !== "GET") {
      recusas.push(`${req.method} ${recurso}`);
      return resposta({ code: "42501", details: null, hint: null, message: "permission denied for view estoque_motors_equipe" }, 403);
    }
    const daEquipe = (estado.papeis ?? []).some((p) => DA_EQUIPE.includes(p));
    return resposta(daEquipe ? filtrar(url).map((l) => projetar(l, select)) : []);
  }

  if (req.method === "GET" || req.method === "HEAD") return resposta([]);
  escritas.push({ recurso, corpo: await req.text() });
  return resposta(undefined, 201);
}

function sessao(papeis: string[]) {
  estado.papeis = papeis;
  const cliente = createClient(BASE, "chave-de-teste", {
    global: { fetch: postgrest as typeof fetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  (cliente.auth as unknown as { getUser: () => Promise<unknown> }).getUser = async () => ({
    data: { user: { id: "u1", email: "equipe@motorsstore.com.br" } },
    error: null,
  });
  estado.cliente = cliente;
  return cliente;
}

const comId = (id: string | number) => ({ params: Promise.resolve({ id: String(id) }) });

describe("o painel, rodando contra os privilégios do authenticated depois da migração", () => {
  beforeEach(() => {
    idas.length = 0;
    recusas.length = 0;
    escritas.length = 0;
    estado.viewExiste = true;
    estado.tabelaFechada = true;
    // Rede nenhuma: o cliente anônimo de `lib/supabase.ts` também cai no dublê.
    vi.spyOn(globalThis, "fetch").mockImplementation(postgrest as typeof fetch);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(() => {
    if (estado.anterior.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = estado.anterior.url;
    if (estado.anterior.chave === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = estado.anterior.chave;
  });

  it("getEstoque com placa — a lista do painel — traz a placa sem ida recusada", async () => {
    const { getEstoque } = await import("../src/lib/supabase");
    const cliente = sessao(["comercial"]);
    const lista = await getEstoque({ incluirForaDoFeed: true, incluirPlaca: true, cliente, incluirNaoPublicaveis: true });
    expect(recusas).toEqual([]);
    expect(lista.find((v) => v.id === String(DO_FEED.id))?.placa).toBe(DO_FEED.placa);
  });

  it("GET /api/estoque entrega a placa à equipe", async () => {
    const { GET } = await import("../src/app/api/estoque/route");
    sessao(["financeiro"]);
    const r = await GET();
    expect(recusas).toEqual([]);
    expect(r.status).toBe(200);
    const { veiculos } = await r.json();
    expect(veiculos.find((v: { id: string }) => v.id === String(DO_FEED.id)).placa).toBe(DO_FEED.placa);
  });

  it("GET /api/estoque/[id] entrega a linha inteira à equipe", async () => {
    const { GET } = await import("../src/app/api/estoque/[id]/route");
    sessao(["admin"]);
    const r = await GET(new Request(`${BASE}/x`) as never, comId(DO_FEED.id));
    expect(recusas).toEqual([]);
    expect(r.status).toBe(200);
    const { veiculo } = await r.json();
    expect(veiculo).toMatchObject({ placa: DO_FEED.placa, chassi: DO_FEED.chassi, renavam: DO_FEED.renavam, preco_compra: DO_FEED.preco_compra });
  });

  it("a visão e o editor do veículo abrem com placa, chassi e renavam; o custo só a quem vê custo", async () => {
    const { abrirVeiculoNoPainel } = await import("../src/lib/veiculoNoPainel");
    sessao(["admin"]);
    const doAdmin = await abrirVeiculoNoPainel(String(NATIVO.id));
    expect(recusas).toEqual([]);
    expect(doAdmin.veiculo).toMatchObject({ placa: NATIVO.placa, chassi: NATIVO.chassi, renavam: NATIVO.renavam, preco_compra: NATIVO.preco_compra });

    sessao(["comercial"]);
    const doComercial = await abrirVeiculoNoPainel(String(NATIVO.id));
    expect(doComercial.veiculo.placa).toBe(NATIVO.placa);
    expect(doComercial.veiculo.preco_compra).toBeNull();
  });

  it("a busca do repasse a partir do estoque casa a placa inteira — sem devolvê-la", async () => {
    // Chegou com o #207: a busca lê `placa` (só para casar) e `codigo_fipe`.
    // Pedidas à tabela, a sessão é recusada e o seletor do repasse cai em 502.
    const { GET } = await import("../src/app/api/repasses/estoque/route");
    sessao(["admin"]);
    const r = await GET(new Request(`${BASE}/api/repasses/estoque?q=${DO_FEED.placa}`));
    expect(recusas).toEqual([]);
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.veiculos.map((v: { id: string | number }) => String(v.id))).toContain(String(DO_FEED.id));
    expect(JSON.stringify(corpo)).not.toContain(DO_FEED.placa);
  });

  it("o seletor da venda traz placa e chassi; o custo só a quem vê custo", async () => {
    const { GET } = await import("../src/app/api/ciclo/vendas/estoque/route");
    sessao(["admin"]);
    const doAdmin = await GET();
    expect(recusas).toEqual([]);
    expect(doAdmin.status).toBe(200);
    const carroDoAdmin = (await doAdmin.json()).veiculos.find((v: { id: number }) => v.id === DO_FEED.id);
    expect(carroDoAdmin).toMatchObject({ placa: DO_FEED.placa, chassi: DO_FEED.chassi, preco_compra: DO_FEED.preco_compra });

    sessao(["comercial"]);
    const doComercial = await GET();
    expect(doComercial.status).toBe(200);
    const carroDoComercial = (await doComercial.json()).veiculos.find((v: { id: number }) => v.id === DO_FEED.id);
    expect(carroDoComercial.placa).toBe(DO_FEED.placa);
    expect(carroDoComercial).not.toHaveProperty("preco_compra");
  });

  it("o piso de custo segue de pé: baixar o preço do nativo abaixo da compra é recusado", async () => {
    // O custo vem do BANCO, lido no "antes" da gravação. Se essa leitura
    // pedisse `preco_compra` à tabela, o PostgREST a recusaria, o "antes"
    // viria vazio — e a gravação seguiria SEM o piso. A trava de dinheiro
    // falharia aberta, sem erro nenhum na tela.
    const { PATCH } = await import("../src/app/api/estoque/[id]/route");
    sessao(["admin"]);
    const r = await PATCH(
      new Request(`${BASE}/x`, {
        method: "PATCH",
        body: JSON.stringify({ preco_original: 40000 }),
        headers: { "content-type": "application/json" },
      }) as never,
      comId(NATIVO.id),
    );
    // O status primeiro: é ele que diz se a trava de dinheiro segurou.
    expect(r.status).toBe(422);
    expect((await r.json()).error).toMatch(/abaixo do preço de compra/);
    expect(escritas.filter((e) => e.recurso === "estoque_motors")).toEqual([]);
    expect(recusas).toEqual([]);
  });

  it("e a gravação acima do custo passa, pela tabela", async () => {
    const { PATCH } = await import("../src/app/api/estoque/[id]/route");
    sessao(["admin"]);
    const r = await PATCH(
      new Request(`${BASE}/x`, {
        method: "PATCH",
        body: JSON.stringify({ preco_original: 52000 }),
        headers: { "content-type": "application/json" },
      }) as never,
      comId(NATIVO.id),
    );
    expect(recusas).toEqual([]);
    expect(r.status).toBe(200);
    expect(escritas.filter((e) => e.recurso === "estoque_motors")).toHaveLength(1);
  });

  it("antes da migração (sem a view), o painel segue lendo a tabela — o deploy pode vir primeiro", async () => {
    estado.viewExiste = false;
    estado.tabelaFechada = false;
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { GET } = await import("../src/app/api/estoque/[id]/route");
    sessao(["admin"]);
    const r = await GET(new Request(`${BASE}/x`) as never, comId(DO_FEED.id));
    expect(r.status).toBe(200);
    expect((await r.json()).veiculo.placa).toBe(DO_FEED.placa);
    expect(idas.some((i) => i.startsWith("GET estoque_motors_equipe"))).toBe(true);
    expect(aviso.mock.calls.flat().join(" ")).toMatch(/20261001150000/);
  });

  it("a recusa da view por outro motivo NÃO cai na tabela", async () => {
    // Só "a view não existe" volta para a tabela. Qualquer outro erro — de
    // permissão, de rede — fica como erro: cair na tabela seria pedir à porta
    // fechada o que a porta certa negou.
    const { lerComoEquipe } = await import("../src/lib/colunasDoEstoque");
    const origens: string[] = [];
    const r = await lerComoEquipe(async (origem) => {
      origens.push(origem);
      return { data: null, error: { code: "42501", message: "permission denied for view estoque_motors_equipe" } };
    });
    expect(origens).toEqual(["estoque_motors_equipe"]);
    expect(r.error?.code).toBe("42501");
  });
});

// ===========================================================================
// Toda leitura de estoque_motors, em qualquer arquivo, pede só coluna pública
// ===========================================================================

function arquivosDe(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivosDe(caminho);
    return /\.(ts|tsx)$/.test(nome) ? [caminho] : [];
  });
}

/** Colunas de um select literal do supabase-js; `null` se não for verificável. */
function colunasDoLiteral(argumento: string): string[] | null {
  const literal = argumento.match(/^(["'`])([^"'`$]*)\1$/);
  if (!literal) return null;
  return literal[2].split(",").map(nomeDaColuna);
}

describe("o código não pede documento nem custo à tabela", () => {
  it("toda leitura de estoque_motors — com a chave pública OU com a sessão — pede só coluna pública", () => {
    // A varredura da leitura anônima olha só quem usa a chave pública: até
    // aqui a sessão lia tudo. Depois desta migração não lê mais, e uma leitura
    // de painel que pedisse `*` ou `placa` à tabela seria recusada inteira.
    // Argumento que a varredura não sabe conferir é recusado: falha fechada.
    const raiz = join(__dirname, "..");
    const leituras: string[] = [];
    const recusadas: string[] = [];
    for (const absoluto of arquivosDe(join(raiz, "src"))) {
      const arquivo = relative(raiz, absoluto).split("\\").join("/");
      const codigo = lerCodigo(arquivo);
      for (const m of codigo.matchAll(/\.from\(\s*["'`]estoque_motors["'`]\s*\)\s*\.select\(\s*([^)]*?)\s*\)/g)) {
        const argumento = m[1];
        leituras.push(`${arquivo}: ${argumento}`);
        // `as "*"` é só o cast que o supabase-js pede para tipar a linha — a
        // lista que vai ao banco é a constante.
        if (/^SELECT_PUBLICO_DO_ESTOQUE(?:\s+as\s+"\*")?$/.test(argumento)) continue;
        const colunas = colunasDoLiteral(argumento);
        if (colunas === null) {
          recusadas.push(`${arquivo}: select(${argumento}) — argumento que a varredura não sabe conferir`);
          continue;
        }
        const fora = colunas.filter((c) => !PUBLICAS.has(c));
        if (fora.length > 0) recusadas.push(`${arquivo}: select(${argumento}) pede ${fora.join(", ")}`);
      }
    }
    expect(recusadas).toEqual([]);
    // Se a varredura parar de enxergar as leituras que existem, não protege.
    expect(leituras.length).toBeGreaterThanOrEqual(10);
  });
});
