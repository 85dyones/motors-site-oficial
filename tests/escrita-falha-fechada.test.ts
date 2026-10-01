import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { aplicarNosVeiculos } from "../src/lib/estoqueEscrita";

/**
 * Sem o "antes", a escrita não grava — achado de 2026-10-01, na PR #208.
 *
 * `aplicarNosVeiculos` lê o estado anterior antes de gravar, e é sobre ele que
 * correm o piso de custo (`recusaPorPisoDeCusto`) e o histórico. Quando essa
 * leitura falhava por um motivo que não é "coluna ausente" — permissão
 * (42501), rede, timeout —, o `antes` ficava nulo e a gravação SEGUIA: o piso
 * era pulado, porque só julga com a linha em mãos, e o histórico ficava vazio.
 * Publicar e promoção já falhavam fechados; `preco`, `preco_original` e
 * `preco_compra` não.
 *
 * Na #208 a consequência apareceu na prática: com a tabela fechada para a
 * leitura do custo e o código ainda lendo por ela, um PATCH que baixava o
 * preço do carro nativo para baixo da compra respondeu 200 em vez de 422.
 */

const AUTOR = { id: "u-1", nome: "Quem salvou" };

/** O carro nativo da #208: preço no ar acima da compra. */
const NATIVO = {
  id: 900000123,
  marca: "VOLKSWAGEN",
  modelo: "UP",
  versao: "DRIVE 1.0 FLEX",
  ano: 2019,
  preco: 54900,
  preco_original: 54900,
  preco_promocional: 0,
  preco_compra: 50000,
  origem: "painel",
  estado_cadastro: "publicado",
  vendido: false,
  descricao: "texto velho",
  placa: "QWE9R87",
  whatsapp_images: Array.from({ length: 8 }, (_, i) => `https://x/${i}.jpg`),
};

/** As três formas de a leitura do "antes" falhar sem ser coluna ausente. */
const FALHAS = [
  ["permissão", { code: "42501", message: "permission denied for table estoque_motors" }],
  ["rede", { code: "", message: "TypeError: fetch failed" }],
  ["timeout", { code: "57014", message: "canceling statement due to statement timeout" }],
] as const;

/**
 * O mínimo que `aplicarNosVeiculos` usa, no molde de
 * `tests/em-preparacao-escrita.test.ts`. Com `falha`, toda leitura de
 * `estoque_motors` volta com esse erro; `escondidas` some com linhas da
 * resposta sem erro nenhum, como a RLS faz.
 */
function bancoFalso(
  linhas: Array<Record<string, unknown>>,
  opts: { falha?: { code: string; message: string }; escondidas?: Array<string | number> } = {},
) {
  const leituras: string[] = [];
  const gravou: Array<{ patch: Record<string, unknown>; ids: unknown[] }> = [];
  const historico: Array<Record<string, unknown>> = [];
  const supabase = {
    from(tabela: string) {
      if (tabela === "historico_veiculo") {
        return {
          insert: async (novas: Array<Record<string, unknown>>) => {
            historico.push(...novas);
            return { error: null };
          },
        };
      }
      return {
        select: (colunas: string) => ({
          in: async (_col: string, ids: Array<string | number>) => {
            leituras.push(colunas);
            if (opts.falha) return { data: null, error: opts.falha };
            const escondidas = (opts.escondidas ?? []).map(String);
            return {
              data: linhas.filter(
                (l) => ids.map(String).includes(String(l.id)) && !escondidas.includes(String(l.id)),
              ),
              error: null,
            };
          },
        }),
        update: (patch: Record<string, unknown>) => ({
          in: async (_col: string, ids: Array<string | number>) => {
            gravou.push({ patch, ids });
            return { error: null };
          },
        }),
      };
    },
  };
  return { supabase, leituras, gravou, historico };
}

// ===========================================================================
// Escrita que mexe em preço ou em custo
// ===========================================================================

describe("escrita de preço ou de custo com o 'antes' ilegível: recusa, nada gravado", () => {
  // Valores que o piso RECUSARIA se tivesse a linha: é o bug real — a trava
  // de dinheiro pulada em silêncio, e não um preço qualquer que passaria.
  const ESCRITAS_DE_PRECO = [
    ["preco", { preco: 40000 }],
    ["preco_original", { preco_original: 40000 }],
    ["custo lançado acima do preço no ar", { preco_compra: 60000 }],
    ["promoção", { preco_promocional: 45000 }],
  ] as const;

  for (const [rotulo, escrita] of ESCRITAS_DE_PRECO) {
    for (const [motivo, falha] of FALHAS) {
      it(`${rotulo}, leitura falhou por ${motivo}`, async () => {
        const { supabase, gravou, historico } = bancoFalso([NATIVO], { falha });
        const r = await aplicarNosVeiculos(supabase, [NATIVO.id], { ...escrita }, AUTOR, {
          podeVerCusto: true,
        });

        expect(r.status).toBe(500);
        expect(r.erro).toMatch(/^Não foi possível ler/);
        expect(r.erro).toMatch(/Nada foi alterado\.$/);
        // O motivo do banco viaja, para quem for diagnosticar.
        expect(r.erro).toContain(falha.message);
        expect(r.camposSalvos).toEqual([]);
        expect(gravou).toEqual([]);
        expect(historico).toEqual([]);
      });
    }
  }

  it("a recusa por leitura NÃO é a do piso — nada de 422, nada de valor de custo", async () => {
    // O piso não chegou a julgar: dizer "abaixo do preço de compra" seria
    // afirmar o que ninguém conferiu, e citar o custo, vazá-lo sem tê-lo lido.
    const { supabase } = bancoFalso([NATIVO], { falha: FALHAS[0][1] });
    const r = await aplicarNosVeiculos(supabase, [NATIVO.id], { preco_original: 40000 }, AUTOR, {
      podeVerCusto: false,
    });
    expect(r.status).not.toBe(422);
    expect(r.erro).not.toMatch(/abaixo do/);
    expect(r.erro).not.toMatch(/50\.000/);
  });

  it("controle: com a linha lida, o mesmo preço é recusado pelo piso (422)", async () => {
    const { supabase, gravou } = bancoFalso([NATIVO]);
    const r = await aplicarNosVeiculos(supabase, [NATIVO.id], { preco_original: 40000 }, AUTOR, {
      podeVerCusto: true,
    });
    expect(r.status).toBe(422);
    expect(r.erro).toMatch(/abaixo do preço de compra/);
    expect(gravou).toEqual([]);
  });

  it("controle: com a linha lida, preço acima do custo grava e entra no histórico", async () => {
    const { supabase, gravou, historico } = bancoFalso([NATIVO]);
    const r = await aplicarNosVeiculos(supabase, [NATIVO.id], { preco_original: 52000 }, AUTOR);
    expect(r.erro).toBeUndefined();
    expect(gravou).toHaveLength(1);
    expect(historico).toEqual([expect.objectContaining({ campo: "preco_original", valor_novo: "52000" })]);
  });
});

describe("escrita de preço sem a linha do veículo na leitura: recusa", () => {
  // A leitura voltou SEM erro, mas sem a linha — é o que a RLS faz com linha
  // que não deixa ver. O piso percorria as linhas lidas, e zero linhas é zero
  // julgamento: passava.
  it("um veículo, linha ausente", async () => {
    const { supabase, gravou } = bancoFalso([NATIVO], { escondidas: [NATIVO.id] });
    const r = await aplicarNosVeiculos(supabase, [NATIVO.id], { preco_original: 40000 }, AUTOR);
    expect(r.status).toBe(500);
    expect(r.erro).toMatch(/^Não foi possível ler o preço e o custo atuais deste veículo/);
    expect(gravou).toEqual([]);
  });

  it("dois veículos, só um lido: o lote inteiro para", async () => {
    // O custo novo passa no piso do carro lido (54.900 no ar) e reprovaria no
    // escondido (45.000) — só a leitura dele pegaria a recusa.
    const outro = { ...NATIVO, id: 900000124, preco: 45000, preco_original: 45000 };
    const { supabase, gravou } = bancoFalso([NATIVO, outro], { escondidas: [outro.id] });
    const r = await aplicarNosVeiculos(supabase, [NATIVO.id, outro.id], { preco_compra: 52000 }, AUTOR);
    expect(r.status).toBe(500);
    expect(r.erro).toMatch(/destes veículos/);
    expect(gravou).toEqual([]);
  });
});

// ===========================================================================
// As outras escritas
// ===========================================================================

describe("escrita que não mexe em preço, com o 'antes' ilegível: recusa também", () => {
  // Decisão de 01/10. Sem o "antes" não há histórico — e o histórico é a
  // única resposta para "quem tirou do ar", "quem marcou vendido", "quem
  // trocou a placa". A falha que importa (42501) é PERMANENTE e não derruba o
  // `update`: aberta, ela apagava a trilha de toda gravação, em silêncio, até
  // alguém notar. Fechada, aparece no primeiro salvamento. Nada foi gravado,
  // então recusar não deixa nada pela metade; o custo é tentar de novo.
  const OUTRAS_ESCRITAS = [
    ["descrição", { descricao: "texto novo" }],
    ["placa", { placa: "ABC1D23" }],
    ["vendido", { vendido: true }],
    ["tirar do ar", { estado_cadastro: "arquivado" }],
    ["fotos", { whatsapp_images: ["https://x/a.jpg"], web_full_images: ["https://x/a.jpg"], url_imagem: "https://x/a.jpg" }],
  ] as const;

  for (const [rotulo, escrita] of OUTRAS_ESCRITAS) {
    for (const [motivo, falha] of FALHAS) {
      it(`${rotulo}, leitura falhou por ${motivo}`, async () => {
        const { supabase, gravou, historico } = bancoFalso([NATIVO], { falha });
        const r = await aplicarNosVeiculos(supabase, [NATIVO.id], { ...escrita }, AUTOR);

        expect(r.status).toBe(500);
        expect(r.erro).toMatch(/^Não foi possível ler o estado atual deste veículo para registrar a alteração no histórico/);
        expect(r.erro).toMatch(/Nada foi alterado\.$/);
        expect(r.erro).toContain(falha.message);
        expect(gravou).toEqual([]);
        expect(historico).toEqual([]);
      });
    }
  }

  it("no lote, nenhum dos selecionados é gravado", async () => {
    const outro = { ...NATIVO, id: 900000124 };
    const { supabase, gravou } = bancoFalso([NATIVO, outro], { falha: FALHAS[0][1] });
    const r = await aplicarNosVeiculos(supabase, [NATIVO.id, outro.id], { vendido: true }, AUTOR);
    expect(r.status).toBe(500);
    expect(r.erro).toMatch(/destes veículos/);
    expect(gravou).toEqual([]);
  });

  it("controle: com a leitura de pé, a mesma escrita grava e registra", async () => {
    const { supabase, gravou, historico } = bancoFalso([NATIVO]);
    const r = await aplicarNosVeiculos(supabase, [NATIVO.id], { descricao: "texto novo" }, AUTOR);
    expect(r.erro).toBeUndefined();
    expect(gravou).toHaveLength(1);
    expect(historico).toEqual([expect.objectContaining({ campo: "descricao", valor_anterior: "texto velho" })]);
  });
});

describe("coluna ausente que a releitura não resolve", () => {
  // A rede de 28/09 relê SEM as duas colunas do carro em preparação. Se o que
  // falta é outra coluna, a releitura falha igual — e a escrita seguia sem
  // histórico (e sem piso, se fosse de preço). Recusa com a frase da migração,
  // que é a saída de quem lê.
  const OUTRA_COLUNA = { code: "42703", message: "column estoque_motors.descricao_seo does not exist" };

  it("relê uma vez, e recusa com a migração; nada gravado", async () => {
    const { supabase, leituras, gravou } = bancoFalso([NATIVO], { falha: OUTRA_COLUNA });
    const r = await aplicarNosVeiculos(supabase, [NATIVO.id], { descricao: "texto novo" }, AUTOR);
    expect(leituras).toHaveLength(2);
    expect(r.status).toBe(500);
    expect(r.erro).toMatch(/Aplique as migrações/);
    expect(gravou).toEqual([]);
  });

  it("idem para escrita de preço", async () => {
    const { supabase, gravou } = bancoFalso([NATIVO], { falha: OUTRA_COLUNA });
    const r = await aplicarNosVeiculos(supabase, [NATIVO.id], { preco_original: 40000 }, AUTOR);
    expect(r.status).toBe(500);
    expect(r.erro).toMatch(/Aplique as migrações/);
    expect(gravou).toEqual([]);
  });
});

// ===========================================================================
// Na prática: a rota PATCH, o supabase-js de verdade e um PostgREST de mentira
// ===========================================================================

/**
 * O dublê de PostgREST de `tests/documento-e-custo-so-para-a-equipe.test.ts`
 * (PR #208), reduzido ao que o PATCH usa. Em vez de reproduzir o mapa de
 * privilégios daquela migração, ele recusa A LEITURA DO ESTADO ANTERIOR — a
 * única do PATCH que pede `preco_compra` —, venha ela da tabela ou da view
 * `estoque_motors_equipe` que a #208 introduz. Assim o teste vale antes e
 * depois daquela PR: o que se prova é "o 'antes' falhou", não por qual porta.
 */
const BASE = "https://dubledeteste.supabase.co";

const estado = vi.hoisted(() => ({
  papeis: null as string[] | null,
  cliente: null as unknown,
  /** Como a leitura do "antes" falha; nula, ela passa. */
  falhaNoAntes: null as null | "permissão" | "rede",
}));

vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => estado.cliente }));

const escritas: Array<{ recurso: string; metodo: string; corpo: unknown }> = [];

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
  if (!id) return [NATIVO];
  const eq = id.match(/^eq\.(\d+)$/);
  if (eq) return [NATIVO].filter((l) => String(l.id) === eq[1]);
  const lista = id.match(/^in\.\(([^)]*)\)$/);
  if (lista) return [NATIVO].filter((l) => lista[1].split(",").includes(String(l.id)));
  return [NATIVO];
}

async function postgrest(entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(entrada as RequestInfo, init);
  const url = new URL(req.url);
  const recurso = url.pathname.replace(/^\/rest\/v1\//, "");
  const select = url.searchParams.get("select") ?? "*";

  if (recurso === "profiles") {
    const perfil = { role: estado.papeis?.[0] ?? null, papeis: estado.papeis, full_name: "Teste" };
    const objeto = (req.headers.get("accept") ?? "").includes("vnd.pgrst.object");
    return resposta(objeto ? perfil : [perfil]);
  }

  if (recurso === "estoque_motors" || recurso === "estoque_motors_equipe") {
    if (req.method !== "GET" && req.method !== "HEAD") {
      escritas.push({ recurso, metodo: req.method, corpo: await req.text() });
      return resposta(undefined, 204);
    }
    const lendoOAntes = select.split(",").map(nomeDaColuna).includes("preco_compra");
    if (lendoOAntes && estado.falhaNoAntes === "rede") throw new TypeError("fetch failed");
    if (lendoOAntes && estado.falhaNoAntes === "permissão") {
      return resposta(
        { code: "42501", details: null, hint: null, message: `permission denied for table ${recurso}` },
        403,
      );
    }
    return resposta(filtrar(url).map((l) => projetar(l, select)));
  }

  if (req.method === "GET" || req.method === "HEAD") return resposta([]);
  escritas.push({ recurso, metodo: req.method, corpo: await req.text() });
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
}

async function patch(corpo: Record<string, unknown>) {
  const { PATCH } = await import("../src/app/api/estoque/[id]/route");
  return PATCH(
    new Request(`${BASE}/x`, {
      method: "PATCH",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }) as never,
    { params: Promise.resolve({ id: String(NATIVO.id) }) },
  );
}

const gravacoesNoEstoque = () => escritas.filter((e) => e.recurso === "estoque_motors");

describe("PATCH /api/estoque/[id] com a leitura do 'antes' recusada", () => {
  beforeEach(() => {
    escritas.length = 0;
    estado.falhaNoAntes = null;
    sessao(["admin"]);
  });

  it("controle: com a leitura de pé, baixar o preço do nativo abaixo da compra dá 422", async () => {
    const r = await patch({ preco_original: 40000 });
    expect(r.status).toBe(422);
    expect(gravacoesNoEstoque()).toEqual([]);
  });

  it("leitura recusada por permissão (42501): o mesmo PATCH não passa com 200, e nada é gravado", async () => {
    estado.falhaNoAntes = "permissão";
    const r = await patch({ preco_original: 40000 });
    // O status primeiro: na #208 era 200, com o preço abaixo da compra no ar.
    expect(r.status).toBe(500);
    const { error } = await r.json();
    expect(error).toMatch(/^Não foi possível ler/);
    expect(error).toMatch(/Nada foi alterado\.$/);
    expect(gravacoesNoEstoque()).toEqual([]);
    expect(escritas).toEqual([]);
  });

  it("leitura que caiu na rede: idem", async () => {
    estado.falhaNoAntes = "rede";
    // GET que cai na rede o postgrest-js tenta de novo três vezes, a 1, 2 e 4
    // segundos — em produção a recusa chega depois de ~7 s. O relógio falso só
    // poupa a espera; as quatro idas acontecem.
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    let r: Response;
    try {
      const pendente = patch({ preco_original: 40000 });
      await vi.runAllTimersAsync();
      r = await pendente;
    } finally {
      vi.useRealTimers();
    }
    expect(r.status).toBe(500);
    expect((await r.json()).error).toMatch(/fetch failed/);
    expect(escritas).toEqual([]);
  });

  it("escrita sem preço, leitura recusada: também não grava", async () => {
    estado.falhaNoAntes = "permissão";
    const r = await patch({ descricao: "texto novo" });
    expect(r.status).toBe(500);
    expect((await r.json()).error).toMatch(/histórico/);
    expect(escritas).toEqual([]);
  });

  it("controle: com a leitura de pé, preço acima da compra grava e registra o histórico", async () => {
    const r = await patch({ preco_original: 52000 });
    expect(r.status).toBe(200);
    expect(gravacoesNoEstoque()).toHaveLength(1);
    expect(escritas.filter((e) => e.recurso === "historico_veiculo")).toHaveLength(1);
  });
});
