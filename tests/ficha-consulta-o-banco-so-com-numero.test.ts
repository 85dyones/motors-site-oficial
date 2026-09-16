import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings } from "../src/types";

/**
 * A ficha só pergunta ao banco por um id que a coluna aceita.
 *
 * ---------------------------------------------------------------------------
 * O defeito, no log do Postgres de 2026-09-12
 * ---------------------------------------------------------------------------
 * A ficha resolve o carro em duas tentativas: primeiro com o slug inteiro
 * (`drive-1-0-flex-8009174`), depois com o número do fim. `estoque_motors.id` é
 * INTEGER, então a primeira o Postgres recusava com `22P02 invalid input syntax
 * for type integer`; o PostgREST respondia 400, `getVeiculoById` ignorava o
 * `error`, e só a segunda acertava. Toda renderização de ficha — página e
 * `generateMetadata` — gastava uma ida ao banco que falhava por construção:
 * dezenas de linhas ERROR entre 19:24:33Z e 19:25:09Z, 26 slugs distintos em
 * 4 s, vários de carros que já não estão no estoque.
 *
 * ---------------------------------------------------------------------------
 * Por que o dublê é a rede, e não o módulo do Supabase
 * ---------------------------------------------------------------------------
 * `ficha-publica-o-grafo` troca `getVeiculoById` inteiro, e por isso não enxerga
 * este defeito: ele mora na consulta que a função monta. Aqui `lib/supabase.ts`
 * e o supabase-js rodam de verdade e só o `fetch` é trocado, por um PostgREST que
 * julga `id=eq.<valor>` como o de produção — 400 e `22P02` para texto na coluna
 * inteira.
 *
 * Filtro em QUALQUER outro formato o dublê não aceita às cegas: registra, e o
 * teste reprova. A primeira versão respondia 200 com lista vazia a tudo que não
 * fosse `id=eq.`, e a revisão provou o custo — guarda removida e filtro
 * reescrito com `.or()`, o defeito de volta e os cinco casos verdes.
 */

const EMPRESA: CompanySettings = {
  name: "Motors Store",
  phone: "41 99737-2165",
  whatsapp: "41 99737-2165",
  whatsappRaw: "5541997372165",
  address: "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350",
  hours: "Seg a sex 8h30-18h30",
  instagram: "https://instagram.com/motorsstore.oficial",
  facebook: "https://facebook.com/motorsstore.oficial",
  cnpj: "",
};

/** A linha como o PostgREST a devolve: `id` é número, como na coluna. */
const LINHA = {
  id: 8009174,
  marca: "VOLKSWAGEN",
  modelo: "UP",
  versao: "DRIVE 1.0 FLEX",
  ano: 2019,
  quilometragem: 52000,
  cor: "BRANCO",
  tipo: "Hatch",
  preco: 54900,
  preco_original: 54900,
  preco_promocional: 0,
  whatsapp_images: ["https://x/1-zap.jpg"],
  web_full_images: ["https://x/1.webp"],
  vendido: false,
};

/** Todo valor de `id=eq.` que chegou ao servidor. */
const consultados: string[] = [];
/** Os que ele recusou — cada um é uma linha ERROR no log de produção. */
const recusados: string[] = [];
/** Consultas a `estoque_motors` com filtro num formato que este dublê não julga. */
const naoReconhecidas: string[] = [];

/**
 * O que a entrada de `integer` aceita, no que interessa aqui: dígitos, com sinal
 * e espaço opcionais. A faixa (`22003`) não é julgada: nenhum caso usa id acima
 * do int4.
 */
const CABE_EM_INTEIRO = /^\s*[+-]?\d+\s*$/;

/** Parâmetros que escolhem colunas, ordenam ou paginam — não filtram. */
const MODIFICADORES = new Set(["select", "order", "limit", "offset"]);

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** O PostgREST de mentira, com a mesma recusa do de verdade. */
function postgrest(endereco: string): Response {
  const url = new URL(endereco);
  if (!url.pathname.endsWith("/rest/v1/estoque_motors")) return resposta([]);

  const filtros = [...url.searchParams.keys()].filter((chave) => !MODIFICADORES.has(chave));
  // `getSinaisDeEstoque` lê a tabela sem filtro; lista vazia é "nada sabido".
  if (filtros.length === 0) return resposta([]);

  // Só `id=eq.<valor>` é julgado. `or=(id.eq.…)`, `id=in.(…)` ou filtro em outra
  // coluna iriam ao mesmo Postgres, e responder 200 a eles às cegas deixaria o
  // defeito voltar por baixo.
  const filtro = url.searchParams.get("id");
  if (filtros.length !== 1 || filtro === null || !filtro.startsWith("eq.")) {
    naoReconhecidas.push(decodeURIComponent(url.search));
    return resposta([]);
  }

  const valor = filtro.slice("eq.".length);
  consultados.push(valor);
  if (!CABE_EM_INTEIRO.test(valor)) {
    recusados.push(valor);
    return resposta(
      {
        code: "22P02",
        details: null,
        hint: null,
        message: `invalid input syntax for type integer: "${valor}"`,
      },
      400,
    );
  }
  return resposta(Number(valor) === LINHA.id ? [LINHA] : []);
}

/** O carro que chegou ao corpo da ficha. */
const montado = vi.hoisted(() => ({ veiculo: null as { id: string } | null }));

vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ companySettings: EMPRESA, procedencia: null }),
}));

vi.mock("../src/lib/hubsDeEstoque", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  recortesDoEstoque: async () => ({ historico: [], disponiveis: [] }),
}));

vi.mock("../src/lib/publicacao", () => ({
  getDatasDeVenda: async () => ({}),
  decidirPublicacao: () => ({ indisponivel: false, rotulo: null, noindex: false, arquivar: false }),
}));

// O corpo da página não é o assunto: basta saber QUAL carro chegou a ele.
vi.mock("../src/components/PDPClientWrapper", () => ({
  default: ({ veiculo }: { veiculo: { id: string } }) => {
    montado.veiculo = veiculo;
    return null;
  },
}));
vi.mock("../src/components/modernist/FaixaProcedencia", () => ({ default: () => null }));

/**
 * A rota num registro de módulos limpo. `lib/supabase.ts` decide se há banco
 * no IMPORT, lendo a env — trocar a env depois não muda nada.
 */
async function rotaDaFicha(banco: "configurado" | "ausente") {
  vi.resetModules();
  if (banco === "configurado") {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://dubledeteste.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-de-teste";
  } else {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
  return import("../src/app/[categoria]/[marca]/[modelo]/[ficha]/page");
}

function naFicha(ficha: string, marca = "volkswagen", modelo = "up") {
  return { params: Promise.resolve({ categoria: "carros", marca, modelo, ficha }) };
}

function espiarRede() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (entrada) =>
    postgrest(entrada instanceof Request ? entrada.url : String(entrada)),
  );
}

/** Nenhuma ida que a produção recusaria — nem uma que o dublê não saiba julgar. */
function semIdaRecusada() {
  expect(
    naoReconhecidas,
    "filtro em estoque_motors num formato que o dublê não julga — ensine a ele o que o servidor responderia",
  ).toEqual([]);
  expect(recusados, "consulta com id que a coluna INTEGER recusa (22P02)").toEqual([]);
}

/** `notFound()` lança com este digest; qualquer outra exceção sai como 500. */
const NAO_ENCONTRADO = "NEXT_HTTP_ERROR_FALLBACK;404";

/** O que a página lançou — `null` quando renderizou. */
function lancado(render: Promise<unknown>): Promise<{ digest?: string } | null> {
  return render.then(
    () => null,
    (e: unknown) => e as { digest?: string },
  );
}

const envAnterior = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

let rede: ReturnType<typeof espiarRede>;

beforeEach(() => {
  consultados.length = 0;
  recusados.length = 0;
  naoReconhecidas.length = 0;
  montado.veiculo = null;
  rede = espiarRede();
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [nome, valor] of Object.entries(envAnterior)) {
    if (valor === undefined) delete process.env[nome];
    else process.env[nome] = valor;
  }
});

describe("com o banco configurado, a ficha só consulta id numérico", () => {
  /* Dois slugs porque a guarda tem duas pontas. `drive-…` termina em dígito e
     denuncia a guarda ancorada só no fim; `1-0-flex-…` COMEÇA em dígito e
     denuncia a ancorada só no começo — que é o formato de toda versão "1.0". */
  it.each(["drive-1-0-flex-8009174", "1-0-flex-8009174"])(
    "a página abre %s pelo número do fim, sem ida que o banco recusa",
    async (ficha) => {
      const { default: CarDetailsPage } = await rotaDaFicha("configurado");
      renderToStaticMarkup(await CarDetailsPage(naFicha(ficha)));

      expect(montado.veiculo?.id, "o carro do banco tem de chegar à página").toBe("8009174");
      semIdaRecusada();
    },
  );

  it("o generateMetadata também", async () => {
    const { generateMetadata } = await rotaDaFicha("configurado");
    const meta = await generateMetadata(naFicha("drive-1-0-flex-8009174"));

    // A canônica termina no id: prova que o metadata achou ESTE carro.
    expect(String(meta.alternates?.canonical)).toMatch(/-8009174$/);
    semIdaRecusada();
  });

  /* O caso da rajada do log: slug de carro que não está no banco. É também o
     caso que separa a guarda certa de só inverter a ordem nas chamadas —
     procurar primeiro pelo número e depois pelo slug ainda manda o slug ao
     banco sempre que o número não acha nada. */
  it("carro que não existe continua 404, e não 500 — também sem ida recusada", async () => {
    const { default: CarDetailsPage, generateMetadata } = await rotaDaFicha("configurado");

    const erro = await lancado(CarDetailsPage(naFicha("drive-1-0-flex-6170299")));
    expect(erro?.digest, "tem de ser o notFound() — qualquer outra exceção sai como 500").toBe(
      NAO_ENCONTRADO,
    );

    const meta = await generateMetadata(naFicha("drive-1-0-flex-6170299"));
    expect(meta.title).toBe("Veículo não encontrado | Motors Store");

    // 404 por não achar, e não por deixar de procurar.
    expect(consultados).toContain("6170299");
    semIdaRecusada();
  });

  /* Link colado pela metade, cortado no último hífen: o "número do fim" vira
     texto vazio, e `integer` recusa o vazio do mesmo jeito. Uma guarda com
     dígitos opcionais (`\d*`) passaria em todos os outros casos. */
  it("URL cortada antes do id é 404 sem ir ao banco", async () => {
    const { default: CarDetailsPage } = await rotaDaFicha("configurado");

    const erro = await lancado(CarDetailsPage(naFicha("drive-1-0-flex-")));
    expect(erro?.digest).toBe(NAO_ENCONTRADO);
    semIdaRecusada();
  });

  /* A guarda pula SÓ o banco: o id de texto segue até `estoqueDeContingencia()`,
     que é quem abre os mocks fora de produção. Devolver `null` logo ao entrar no
     ramo do banco passaria em todos os outros casos — o caso sem banco, abaixo,
     nem chega a esse ramo. */
  it("o id de texto dos mocks ainda cai na contingência, sem passar pelo banco", async () => {
    const { default: CarDetailsPage } = await rotaDaFicha("configurado");
    renderToStaticMarkup(
      await CarDetailsPage(naFicha("porsche-911-carrera-s-2023", "porsche", "911-carrera-s")),
    );

    expect(montado.veiculo?.id).toBe("porsche-911-carrera-s-2023");
    semIdaRecusada();
  });
});

describe("sem banco configurado (dev)", () => {
  it("o id de texto dos mocks continua abrindo a ficha", async () => {
    const { default: CarDetailsPage } = await rotaDaFicha("ausente");
    renderToStaticMarkup(
      await CarDetailsPage(naFicha("porsche-911-carrera-s-2023", "porsche", "911-carrera-s")),
    );

    expect(montado.veiculo?.id).toBe("porsche-911-carrera-s-2023");
    // Prova de que o cenário é mesmo "sem banco": configurado, `getSinaisDeEstoque`
    // iria à rede de qualquer jeito.
    expect(rede, "sem Supabase a rota não fala com a rede").not.toHaveBeenCalled();
  });
});
