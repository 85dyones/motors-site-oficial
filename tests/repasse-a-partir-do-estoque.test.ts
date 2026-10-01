import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bancoDeTeste, sessaoDeTeste, type Banco } from "./bancoDoRepasseDeTeste";
import { linhaDoBancoDeTeste } from "./repasseDeTeste";
import { ESTOQUE_DA_EQUIPE } from "../src/lib/colunasDoEstoque";

/**
 * Cadastrar o repasse a partir de um carro do estoque (pedido do dono de
 * 28/09 e 01/10: "se o carro já estiver cadastrado no site, precisamos poder
 * reaproveitar os dados do cadastro").
 *
 * As decisões do dono que este arquivo trava:
 *   (a) as fotos são COPIADAS para a pasta do repasse — remover uma foto do
 *       repasse nunca pode apagar o arquivo do carro do estoque;
 *   (b) a busca lista o estoque inteiro (publicado, vendido, arquivado,
 *       rascunho), com a situação de cada um;
 *   (c) só copia, sem ligação: nenhuma coluna guarda o carro de origem;
 *   (d) o preço não vem — o do repasse é outro —, nem o valor e o mês da FIPE.
 */
const { falhas, matriz } = vi.hoisted(() => ({
  falhas: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  /**
   * Hoje todo perfil de equipe cadastra repasse (`permissoes.ts`), então o 403
   * de "cliente" vem de `sessaoDoRepasse` e o portão `cadastraRepasse` nunca
   * reprovaria sozinho. Este interruptor simula a matriz mudando: um perfil de
   * equipe que deixou de cadastrar.
   */
  matriz: { semCadastro: false },
}));

let banco: Banco;
let sessao: ReturnType<typeof sessaoDeTeste>;
let balde: ReturnType<typeof armazenamentoDeTeste>;
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => sessao,
  createAdminSupabaseClient: () => ({ ...banco.cliente, storage: balde.cliente }),
}));
vi.mock("../src/lib/edicaoDoRepasse", async (original) => {
  const real = await original<typeof import("../src/lib/edicaoDoRepasse")>();
  return { ...real, cadastraRepasse: (perfis: Parameters<typeof real.cadastraRepasse>[0]) => !matriz.semCadastro && real.cadastraRepasse(perfis) };
});
vi.mock("../src/lib/observabilidade", async (original) => ({
  ...(await original<typeof import("../src/lib/observabilidade")>()),
  registrarFalha: (...args: unknown[]) => falhas(...args),
}));

const {
  avisoDasFotos,
  buscarNoEstoque,
  carroDoEstoqueParaORepasse,
  planejarCopiaDasFotos,
  resumoDaCopia,
} = await import("../src/lib/estoqueParaORepasse");
const { GET } = await import("../src/app/api/repasses/estoque/route");
const rotaDaCopia = await import("../src/app/api/repasses/[id]/fotos-do-estoque/route");
const { POST } = rotaDaCopia;

const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";
const BALDE = "https://x.supabase.co/storage/v1/object/public/veiculos";
const doEstoque = (lote: string, v: "web" | "zap", pasta = "4321") =>
  `${BALDE}/${pasta}/${lote}-${v}.${v === "web" ? "webp" : "jpg"}`;
/** No carro57, mas FORA da pasta da loja (`/FC/9037/`): nunca é pedida. */
const CARRO57 = (v: "web" | "zap") => `https://s3.carro57.com.br/anuncios/4321/9-${v}.jpg`;
/** Foto do carro57 NA pasta da loja, como o feed grava (W = web, O = original, que vai ao zap). */
const DA_LOJA = (n: number, v: "web" | "zap") => `https://s3.carro57.com.br/FC/9037/81522${n}_0_${v === "web" ? "W" : "O"}_6943a8e1c8.jpeg`;
/** Os bytes que cada URL serve: dá para saber qual foto subiu para qual caminho. */
const corpoDe = (url: string) => new TextEncoder().encode(`foto:${url}`);
const lerCorpo = (corpo: unknown) => new TextDecoder().decode(corpo as Uint8Array);
/** Uma foto servida com 200, o tipo e o tamanho declarados. */
const imagem =
  (url: string, tipo = "image/jpeg") =>
  () =>
    new Response(corpoDe(url), { status: 200, headers: { "content-type": tipo, "content-length": String(corpoDe(url).byteLength) } });

/** A linha CRUA de `estoque_motors` — com documento e custo, como o banco a tem. */
function linhaDoEstoque(parcial: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 4321,
    marca: "volkswagen",
    modelo: "gol",
    versao: "trendline",
    modelo_override: null,
    versao_override: null,
    ano: 2019,
    ano_fabricacao: 2018,
    quilometragem: 64000,
    cambio: "Manual",
    combustivel: "Flex",
    cor: "Branco",
    tipo: "Hatch",
    vendido: false,
    estado_cadastro: "publicado",
    web_full_images: [doEstoque("a", "web"), doEstoque("b", "web"), CARRO57("web")],
    whatsapp_images: [doEstoque("a", "zap"), doEstoque("b", "zap"), CARRO57("zap")],
    codigo_fipe: "005340-6",
    placa: "QXR7E19",
    chassi: "9BWZZZ377VT004251",
    renavam: "00987654321",
    preco_compra: 41777,
    valor_fipe: 52333,
    preco: 54999,
    ...parcial,
  };
}

const PROIBIDOS = ["placa", "chassi", "renavam", "preco_compra", "valor_fipe", "preco"];
const VALORES_PROIBIDOS = ["QXR7E19", "9BWZZZ377VT004251", "00987654321", "41777", "52333", "54999"];

/** O Storage da chave de serviço: registra tudo o que a rota pede ao balde. */
function armazenamentoDeTeste() {
  const chamadas: Array<{ op: string; bucket: string; args: unknown[] }> = [];
  let falhar: (de: string, para: string) => string | null = () => null;
  const registrar =
    (op: string, bucket: string) =>
    async (...args: unknown[]) => {
      chamadas.push({ op, bucket, args });
      return { data: null, error: null };
    };
  const cliente = {
    from: (bucket: string) => ({
      copy: async (de: string, para: string) => {
        chamadas.push({ op: "copy", bucket, args: [de, para] });
        const erro = falhar(de, para);
        return erro ? { data: null, error: { message: erro } } : { data: { path: `${bucket}/${para}` }, error: null };
      },
      getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${bucket}/${caminho}` } }),
      remove: registrar("remove", bucket),
      move: registrar("move", bucket),
      // O upload falha pela mesma regra da cópia; o "de" é o texto do corpo.
      upload: async (para: string, corpo: unknown, opcoes: unknown) => {
        chamadas.push({ op: "upload", bucket, args: [para, corpo, opcoes] });
        const erro = falhar(lerCorpo(corpo), para);
        return erro ? { data: null, error: { message: erro } } : { data: { path: para }, error: null };
      },
      update: registrar("update", bucket),
      download: registrar("download", bucket),
    }),
  };
  return {
    cliente,
    chamadas,
    falharQuando(fn: (de: string, para: string) => string | null) {
      falhar = fn;
    },
    copias: () => chamadas.filter((c) => c.op === "copy").map((c) => c.args as [string, string]),
    /** O que subiu: o caminho, a URL de origem (lida do corpo) e as opções. */
    subidas: () =>
      chamadas
        .filter((c) => c.op === "upload")
        .map((c) => ({ para: String(c.args[0]), de: lerCorpo(c.args[1]).replace(/^foto:/, ""), opcoes: c.args[2] })),
  };
}

/**
 * A internet do servidor, de mentira: cada URL responde o que o teste mandar
 * (404 se nada), e todo pedido fica registrado — é assim que se prova que um
 * endereço NUNCA foi pedido. Como o fetch de verdade, segue redirecionamento
 * sozinho, a menos que o pedido diga `redirect: "manual"`; `visitados` guarda
 * cada salto. "pendurada" só termina quando o sinal do pedido aborta.
 */
function internetDeTeste() {
  const pedidos: Array<{ url: string; init: RequestInit | undefined }> = [];
  const visitados: string[] = [];
  const rotas = new Map<string, () => Response | "pendurada">();
  let emVoo = 0;
  let pico = 0;

  async function atender(url: string, init: RequestInit | undefined): Promise<Response> {
    visitados.push(url);
    const fazer = rotas.get(url);
    const r = fazer ? fazer() : new Response("não achei", { status: 404 });
    if (r === "pendurada") {
      return new Promise<Response>((_, rejeitar) => {
        init?.signal?.addEventListener("abort", () => rejeitar(new DOMException("This operation was aborted", "AbortError")));
      });
    }
    const destino = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && destino && init?.redirect !== "manual") return atender(destino, init);
    return r;
  }

  const fetchFalso = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = entrada instanceof Request ? entrada.url : String(entrada);
    pedidos.push({ url, init });
    emVoo += 1;
    pico = Math.max(pico, emVoo);
    try {
      // Um respiro, para os pedidos simultâneos se sobreporem de fato — de
      // 1 a 5 ms, para a ordem de chegada não ser a de saída.
      await new Promise((resolver) => setTimeout(resolver, 1 + ((pedidos.length * 7) % 5)));
      return await atender(url, init);
    } finally {
      emVoo -= 1;
    }
  });

  return {
    fetch: fetchFalso,
    pedidos,
    visitados,
    pico: () => pico,
    responder(url: string, fazer: () => Response | "pendurada") {
      rotas.set(url, fazer);
    },
    servir(...urls: string[]) {
      for (const url of urls) rotas.set(url, imagem(url));
    },
  };
}
let internet: ReturnType<typeof internetDeTeste>;

function entrarComo(papeis: string[] | null, usuario?: { id: string; email: string } | null) {
  banco = bancoDeTeste();
  sessao = sessaoDeTeste(banco, papeis, usuario);
  balde = armazenamentoDeTeste();
  internet = internetDeTeste();
  vi.stubGlobal("fetch", internet.fetch);
  falhas.mockClear();
  matriz.semCadastro = false;
}
beforeEach(() => entrarComo(["comercial"]));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("o carro do estoque, como o seletor do repasse o recebe", () => {
  it("copia o cadastro na grafia do site", () => {
    const c = carroDoEstoqueParaORepasse(linhaDoEstoque())!;
    expect(c).toMatchObject({
      id: 4321,
      marca: "Volkswagen",
      modelo: "Gol",
      versao: "Trendline",
      ano: 2019,
      ano_fabricacao: 2018,
      quilometragem: 64000,
      cambio: "Manual",
      combustivel: "Flex",
      cor: "Branco",
      tipo: "Hatch",
      carroceria: "hatch",
      codigo_fipe: "005340-6",
    });
  });

  it("o override do painel vence o feed; override em branco não conta", () => {
    const comOverride = carroDoEstoqueParaORepasse(linhaDoEstoque({ modelo_override: "Gol G7", versao_override: "TrendLine MPI" }))!;
    expect(comOverride.modelo).toBe("Gol G7");
    expect(comOverride.versao).toBe("TrendLine MPI");
    const emBranco = carroDoEstoqueParaORepasse(linhaDoEstoque({ modelo_override: "  ", versao_override: "" }))!;
    expect(emBranco.modelo).toBe("Gol");
    expect(emBranco.versao).toBe("Trendline");
  });

  it("modelo com a versão embutida: a versão sai do modelo, como na ficha do site (casos vivos de 01/10)", () => {
    // O feed grava a versão dentro do `modelo`; sem o corte, o repasse nascia
    // com "Toro Volcano 1.3 T270 4x2 Flex Aut." no modelo e a versão repetida
    // logo depois. O corte é o da ficha (`modeloEVersaoParaExibir`).
    const de = (marca: string, modelo: string, versao: string) => {
      const c = carroDoEstoqueParaORepasse(linhaDoEstoque({ marca, modelo, versao }))!;
      return [c.marca, c.modelo, c.versao];
    };
    expect(de("Fiat", "Toro Volcano 1.3 T270 4x2 Flex Aut.", "Volcano 1.3 T270 4x2 Flex Aut.")).toEqual([
      "Fiat",
      "Toro",
      "Volcano 1.3 T270 4x2 Flex Aut.",
    ]);
    expect(de("BMW", "X1 X25i Active Flex", "X25i Active Flex")).toEqual(["BMW", "X1", "X25i Active Flex"]);
    expect(de("Renault", "Kwid Zen 2", "Zen 2")).toEqual(["Renault", "Kwid", "Zen 2"]);
    expect(de("Chevrolet", "Onix Plus Turbo LT Automatico", "Plus Turbo LT Automatico")).toEqual([
      "Chevrolet",
      "Onix",
      "Plus Turbo LT Automatico",
    ]);
  });

  it("o corte vem depois do override, como no site; sem modelo, a versão fica como está", () => {
    const override = carroDoEstoqueParaORepasse(linhaDoEstoque({ modelo_override: "Gol G7 Trendline", versao_override: "Trendline" }))!;
    expect([override.modelo, override.versao]).toEqual(["Gol G7", "Trendline"]);
    // A ficha nunca vê modelo vazio (o mapper inventa "Sem Modelo"); aqui o
    // corte com um lado vazio apagaria a versão que o cadastro tem.
    const semModelo = carroDoEstoqueParaORepasse(linhaDoEstoque({ modelo: null }))!;
    expect([semModelo.modelo, semModelo.versao]).toEqual([null, "Trendline"]);
    const semVersao = carroDoEstoqueParaORepasse(linhaDoEstoque({ versao: "" }))!;
    expect([semVersao.modelo, semVersao.versao]).toEqual(["Gol", null]);
  });

  it("o tipo do estoque vira a carroceria do repasse", () => {
    const de = (tipo: unknown) => carroDoEstoqueParaORepasse(linhaDoEstoque({ tipo }))!.carroceria;
    expect(de("Hatch")).toBe("hatch");
    expect(de("Sedan")).toBe("seda");
    expect(de("SUV")).toBe("suv");
    expect(de("suv")).toBe("suv");
    expect(de("Picape")).toBe("picape");
    expect(de("Motocicleta")).toBe("outro");
    expect(de("Van")).toBe("outro");
    // Sem tipo no cadastro, nada é inventado: a pessoa escolhe.
    expect(de(null)).toBeNull();
    expect(de("  ")).toBeNull();
  });

  it("a situação: arquivado > vendido > rascunho/publicado", () => {
    const de = (estado_cadastro: unknown, vendido: unknown) =>
      carroDoEstoqueParaORepasse(linhaDoEstoque({ estado_cadastro, vendido }))!.situacao;
    expect(de("publicado", false)).toBe("publicado");
    expect(de("publicado", true)).toBe("vendido");
    expect(de("rascunho", true)).toBe("vendido");
    expect(de("arquivado", true)).toBe("arquivado");
    expect(de("arquivado", false)).toBe("arquivado");
    expect(de("rascunho", false)).toBe("rascunho");
    // Sem a coluna, o piso é rascunho — o único que não afirma nada sobre o site.
    expect(de(null, false)).toBe("rascunho");
  });

  it("conta os pares que vêm (nossos e do carro57 da loja) e os de fora", () => {
    expect(carroDoEstoqueParaORepasse(linhaDoEstoque())).toMatchObject({ fotosCopiaveis: 2, fotosDeFora: 1 });
    // Par com uma versão fora da pasta da loja no carro57 não vem inteiro: fica de fora.
    const misto = linhaDoEstoque({
      web_full_images: [doEstoque("a", "web"), doEstoque("b", "web")],
      whatsapp_images: [doEstoque("a", "zap"), CARRO57("zap")],
    });
    expect(carroDoEstoqueParaORepasse(misto)).toMatchObject({ fotosCopiaveis: 1, fotosDeFora: 1 });
    // O carro 100% no carro57 da loja (dono, 01/10): tudo vem, baixado pelo servidor.
    const daLoja = linhaDoEstoque({
      web_full_images: [DA_LOJA(1, "web"), DA_LOJA(2, "web"), doEstoque("c", "web")],
      whatsapp_images: [DA_LOJA(1, "zap"), doEstoque("b", "zap"), DA_LOJA(3, "zap")],
    });
    expect(carroDoEstoqueParaORepasse(daLoja)).toMatchObject({ fotosCopiaveis: 3, fotosDeFora: 0 });
    // Outra loja no mesmo carro57, ou outro endereço qualquer: fica de fora.
    const deFora = linhaDoEstoque({
      web_full_images: ["https://s3.carro57.com.br/FC/1234/1_0_W_a.jpeg", "https://exemplo.test/FC/9037/1_0_W_a.jpeg", DA_LOJA(1, "web")],
      whatsapp_images: [DA_LOJA(1, "zap"), DA_LOJA(2, "zap"), DA_LOJA(1, "zap")],
    });
    expect(carroDoEstoqueParaORepasse(deFora)).toMatchObject({ fotosCopiaveis: 1, fotosDeFora: 2 });
    // Versão sem par também fica de fora; o `[""]` do sync não conta como foto.
    const torto = linhaDoEstoque({ web_full_images: [doEstoque("a", "web"), doEstoque("b", "web")], whatsapp_images: [doEstoque("a", "zap"), ""] });
    expect(carroDoEstoqueParaORepasse(torto)).toMatchObject({ fotosCopiaveis: 1, fotosDeFora: 1 });
    const vazio = linhaDoEstoque({ web_full_images: [""], whatsapp_images: null });
    expect(carroDoEstoqueParaORepasse(vazio)).toMatchObject({ fotosCopiaveis: 0, fotosDeFora: 0, foto: null });
  });

  it("a miniatura é a primeira foto", () => {
    expect(carroDoEstoqueParaORepasse(linhaDoEstoque())!.foto).toBe(doEstoque("a", "web"));
  });

  it("nunca devolve documento, custo, valor FIPE nem o preço do anúncio", () => {
    const c = carroDoEstoqueParaORepasse(linhaDoEstoque())!;
    for (const campo of PROIBIDOS) expect(Object.keys(c)).not.toContain(campo);
    const json = JSON.stringify(c);
    for (const valor of VALORES_PROIBIDOS) expect(json).not.toContain(valor);
  });

  it("número que não é número vira nulo, sem default inventado", () => {
    const c = carroDoEstoqueParaORepasse(linhaDoEstoque({ ano: null, ano_fabricacao: "2018", quilometragem: "abc", cor: "" }))!;
    expect(c.ano).toBeNull();
    expect(c.ano_fabricacao).toBe(2018);
    expect(c.quilometragem).toBeNull();
    expect(c.cor).toBeNull();
    expect(carroDoEstoqueParaORepasse(linhaDoEstoque({ id: "x" }))).toBeNull();
  });
});

describe("a busca no estoque", () => {
  const linhas = [
    linhaDoEstoque(),
    linhaDoEstoque({ id: 77, marca: "fiat", modelo: "argo", versao: "drive 1.0", cor: "Vermelho", placa: "BRA2E19", tipo: "Hatch" }),
    linhaDoEstoque({ id: 78, marca: "fiat", modelo: "cronos", versao: "drive", cor: "Prata", placa: null, tipo: "Sedan", estado_cadastro: "arquivado" }),
  ];

  it("casa marca, modelo, versão, cor e código, palavra por palavra e sem acento", () => {
    expect(buscarNoEstoque(linhas, "fiat").map((c) => c.id)).toEqual([77, 78]);
    expect(buscarNoEstoque(linhas, "fiat drive vermelho").map((c) => c.id)).toEqual([77]);
    expect(buscarNoEstoque(linhas, "4321").map((c) => c.id)).toEqual([4321]);
    expect(buscarNoEstoque(linhas, "VOLKS").map((c) => c.id)).toEqual([4321]);
  });

  it("lista o estoque inteiro, arquivado e vendido inclusive", () => {
    expect(buscarNoEstoque(linhas, "cronos")[0].situacao).toBe("arquivado");
  });

  it("a placa inteira acha o carro, pedaço de placa não, e a placa nunca sai", () => {
    expect(buscarNoEstoque(linhas, "bra-2e19").map((c) => c.id)).toEqual([77]);
    expect(buscarNoEstoque(linhas, "BRA2")).toEqual([]);
    expect(JSON.stringify(buscarNoEstoque(linhas, "bra2e19"))).not.toContain("BRA2E19");
  });

  it("nenhum pedaço da placa acha o carro — senão a busca a revelaria letra a letra", () => {
    // Prefixo de 5 e de 6, sufixo, miolo e a placa com um caractere a mais.
    for (const pedaco of ["BRA2E", "BRA2E1", "bra-2e1", "RA2E19", "A2E1", "BRA2E19X"]) {
      expect(buscarNoEstoque(linhas, pedaco), pedaco).toEqual([]);
    }
    expect(buscarNoEstoque(linhas, "BRA2E19").map((c) => c.id)).toEqual([77]);
  });

  it("termo curto não busca; o resultado para em 8", () => {
    expect(buscarNoEstoque(linhas, "f")).toEqual([]);
    const muitas = Array.from({ length: 12 }, (_, i) => linhaDoEstoque({ id: i + 1 }));
    expect(buscarNoEstoque(muitas, "gol")).toHaveLength(8);
  });
});

describe("o aviso das fotos no formulário", () => {
  it("diz quantas vêm e quantas ficam de fora — só as que não têm como vir", () => {
    expect(avisoDasFotos({ fotosCopiaveis: 2, fotosDeFora: 3 })).toBe(
      "2 fotos vêm para o repasse; 3 ficam de fora (sem as duas versões, ou fora do endereço da loja).",
    );
    expect(avisoDasFotos({ fotosCopiaveis: 1, fotosDeFora: 1 })).toBe(
      "1 foto vem para o repasse; 1 fica de fora (sem as duas versões, ou fora do endereço da loja).",
    );
    expect(avisoDasFotos({ fotosCopiaveis: 5, fotosDeFora: 0 })).toBe("5 fotos vêm para o repasse.");
    expect(avisoDasFotos({ fotosCopiaveis: 0, fotosDeFora: 2 })).toBe(
      "0 fotos vêm para o repasse; 2 ficam de fora (sem as duas versões, ou fora do endereço da loja).",
    );
    expect(avisoDasFotos({ fotosCopiaveis: 0, fotosDeFora: 0 })).toBe("O carro não tem fotos para copiar.");
  });

  it("acima de 40, diz que o resto passa do limite", () => {
    expect(avisoDasFotos({ fotosCopiaveis: 43, fotosDeFora: 0 })).toBe(
      "40 fotos vêm para o repasse. Outras 3 passam do limite de 40 do repasse.",
    );
  });
});

describe("o resumo depois da cópia", () => {
  it("soma as copiadas e as baixadas, e diz quantas não vieram", () => {
    expect(resumoDaCopia({ copiadas: 1, baixadas: 2, falharam: 1 })).toBe(
      "Rascunho criado. 3 fotos vieram para o repasse; 1 não veio. Envie as que faltam pelo editor.",
    );
    expect(resumoDaCopia({ copiadas: 0, baixadas: 1, falharam: 2 })).toBe(
      "Rascunho criado. 1 foto veio para o repasse; 2 não vieram. Envie as que faltam pelo editor.",
    );
    // A rota de antes do download não mandava `baixadas`.
    expect(resumoDaCopia({ copiadas: 2, falharam: 1 })).toBe(
      "Rascunho criado. 2 fotos vieram para o repasse; 1 não veio. Envie as que faltam pelo editor.",
    );
  });
});

describe("o plano da cópia das fotos", () => {
  let n = 0;
  const lote = () => `l${(n += 1)}`;
  beforeEach(() => {
    n = 0;
  });

  it("os pares nossos, em ordem, de pasta do estoque para a pasta do repasse; o carro57 de fora da loja fica de fora", () => {
    const plano = planejarCopiaDasFotos({
      repasseId: ID,
      web: linhaDoEstoque().web_full_images,
      zap: linhaDoEstoque().whatsapp_images,
      jaTem: 0,
      novoLote: lote,
    });
    const doBalde = (caminho: string) => ({ de: "bucket", caminho });
    expect(plano.pares).toEqual([
      {
        origem: { web: doBalde("4321/a-web.webp"), zap: doBalde("4321/a-zap.jpg") },
        destino: { web: `repasse/${ID}/l1-web.webp`, zap: `repasse/${ID}/l1-zap.jpg` },
      },
      {
        origem: { web: doBalde("4321/b-web.webp"), zap: doBalde("4321/b-zap.jpg") },
        destino: { web: `repasse/${ID}/l2-web.webp`, zap: `repasse/${ID}/l2-zap.jpg` },
      },
    ]);
    expect(plano).toMatchObject({ ficaramDeFora: 1, acimaDoLimite: 0 });
  });

  it("o carro57 da loja entra para BAIXAR; par misto, cada lado pelo seu caminho, no mesmo lote", () => {
    const plano = planejarCopiaDasFotos({
      repasseId: ID,
      web: [DA_LOJA(1, "web"), doEstoque("b", "web")],
      zap: [DA_LOJA(1, "zap"), DA_LOJA(2, "zap")],
      jaTem: 0,
      novoLote: lote,
    });
    expect(plano.pares).toEqual([
      {
        origem: { web: { de: "carro57", url: DA_LOJA(1, "web") }, zap: { de: "carro57", url: DA_LOJA(1, "zap") } },
        destino: { web: `repasse/${ID}/l1-web.webp`, zap: `repasse/${ID}/l1-zap.jpg` },
      },
      {
        origem: { web: { de: "bucket", caminho: "4321/b-web.webp" }, zap: { de: "carro57", url: DA_LOJA(2, "zap") } },
        destino: { web: `repasse/${ID}/l2-web.webp`, zap: `repasse/${ID}/l2-zap.jpg` },
      },
    ]);
    expect(plano).toMatchObject({ ficaramDeFora: 0, acimaDoLimite: 0 });
  });

  it("respeita o teto de 40 contando o que o repasse já tem", () => {
    const web = ["a", "b", "c"].map((l) => doEstoque(l, "web"));
    const zap = ["a", "b", "c"].map((l) => doEstoque(l, "zap"));
    const plano = planejarCopiaDasFotos({ repasseId: ID, web, zap, jaTem: 39, novoLote: lote });
    expect(plano.pares.map((p) => p.origem.web)).toEqual([{ de: "bucket", caminho: "4321/a-web.webp" }]);
    expect(plano).toMatchObject({ ficaramDeFora: 0, acimaDoLimite: 2 });
  });
});

/** A busca lê pela view da equipe desde 20261001150000; a tabela só se a view não existir. */
const leuOEstoque = () => banco.lidas.some((t) => t === "estoque_motors" || t === ESTOQUE_DA_EQUIPE);

const pedidoDaBusca = (q?: string) =>
  new Request(`http://teste/api/repasses/estoque${q === undefined ? "" : `?q=${encodeURIComponent(q)}`}`);

describe("GET /api/repasses/estoque", () => {
  beforeEach(() => {
    banco.leituras[ESTOQUE_DA_EQUIPE] = { data: [linhaDoEstoque()], error: null };
  });

  it("sem login: 401 e o estoque nem é lido", async () => {
    entrarComo(["comercial"], null);
    banco.leituras[ESTOQUE_DA_EQUIPE] = { data: [linhaDoEstoque()], error: null };
    expect((await GET(pedidoDaBusca("gol"))).status).toBe(401);
    expect(leuOEstoque()).toBe(false);
  });

  it("quem não é da equipe: 403", async () => {
    entrarComo(["cliente"]);
    expect((await GET(pedidoDaBusca("gol"))).status).toBe(403);
    expect(leuOEstoque()).toBe(false);
  });

  it("quem foi desativado: 403", async () => {
    banco.leituras.profiles = { data: { role: "comercial", papeis: ["comercial"], full_name: "X", is_active: false }, error: null };
    expect((await GET(pedidoDaBusca("gol"))).status).toBe(403);
    expect(leuOEstoque()).toBe(false);
  });

  it("perfil de equipe que não cadastra repasse: 403, sem ler o estoque", async () => {
    matriz.semCadastro = true;
    expect((await GET(pedidoDaBusca("gol"))).status).toBe(403);
    expect(leuOEstoque()).toBe(false);
  });

  it.each(["admin", "gestor", "marketing", "comercial", "financeiro", "sdr"])("%s cadastra repasse e busca no estoque", async (papel) => {
    entrarComo([papel]);
    banco.leituras[ESTOQUE_DA_EQUIPE] = { data: [linhaDoEstoque()], error: null };
    const res = await GET(pedidoDaBusca("gol"));
    expect(res.status).toBe(200);
    expect((await res.json()).veiculos.map((c: { id: number }) => c.id)).toEqual([4321]);
  });

  it("o select nunca pede chassi, renavam, custo nem valor FIPE, e a resposta não leva placa", async () => {
    const res = await GET(pedidoDaBusca("QXR-7E19"));
    const corpo = await res.json();
    expect(corpo.veiculos.map((c: { id: number }) => c.id)).toEqual([4321]);
    const [consulta] = banco.consultas.filter((c) => c.tabela === ESTOQUE_DA_EQUIPE);
    const colunas = String(consulta.colunas)
      .split(",")
      .map((c) => c.trim());
    for (const proibida of ["chassi", "renavam", "preco_compra", "valor_fipe"]) expect(colunas).not.toContain(proibida);
    const json = JSON.stringify(corpo);
    for (const campo of PROIBIDOS) expect(json).not.toContain(`"${campo}"`);
    for (const valor of VALORES_PROIBIDOS) expect(json).not.toContain(valor);
  });

  it("conta como vindo os pares do carro57 da loja; de fora, só o que não tem como vir — e a busca não pede nada à rede", async () => {
    banco.leituras[ESTOQUE_DA_EQUIPE] = {
      data: [
        linhaDoEstoque({
          web_full_images: [DA_LOJA(1, "web"), DA_LOJA(2, "web"), CARRO57("web")],
          whatsapp_images: [DA_LOJA(1, "zap"), doEstoque("b", "zap"), CARRO57("zap")],
        }),
      ],
      error: null,
    };
    const [carro] = (await (await GET(pedidoDaBusca("gol"))).json()).veiculos;
    expect(carro).toMatchObject({ fotosCopiaveis: 2, fotosDeFora: 1 });
    expect(internet.pedidos).toEqual([]);
  });

  it("termo curto: lista vazia, sem ir ao banco", async () => {
    const res = await GET(pedidoDaBusca("g"));
    expect((await res.json()).veiculos).toEqual([]);
    expect(leuOEstoque()).toBe(false);
  });

  it("falha na leitura do estoque: 502", async () => {
    banco.leituras[ESTOQUE_DA_EQUIPE] = { data: null, error: { message: "fora do ar", code: "XX000" } };
    expect((await GET(pedidoDaBusca("gol"))).status).toBe(502);
  });
});

const pedidoDaCopia = (corpo: unknown) =>
  new Request(`http://teste/api/repasses/${ID}/fotos-do-estoque`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
const comId = (id = ID) => ({ params: Promise.resolve({ id }) });
/** O rascunho que acabou de nascer em "Novo carro de repasse": sem foto nenhuma. */
const SEM_FOTOS = { web_full_images: [], whatsapp_images: [] };

describe("POST /api/repasses/[id]/fotos-do-estoque", () => {
  beforeEach(() => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste(SEM_FOTOS), error: null };
    banco.leituras.estoque_motors = { data: linhaDoEstoque(), error: null };
  });

  it("perfil de equipe que não cadastra repasse: 403, sem cópia e sem escrita", async () => {
    matriz.semCadastro = true;
    expect((await POST(pedidoDaCopia({ estoqueId: 4321 }), comId())).status).toBe(403);
    expect(balde.chamadas).toEqual([]);
    expect(banco.escritas).toEqual([]);
  });

  it("o rascunho que já tem fotos não recebe a cópia: 409, nada copiado", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste(), error: null };
    const res = await POST(pedidoDaCopia({ estoqueId: 4321 }), comId());
    expect(res.status).toBe(409);
    expect(balde.chamadas).toEqual([]);
    expect(banco.escritas).toEqual([]);
  });

  it("chamada em dobro: a segunda dá 409 e não copia de novo", async () => {
    expect((await POST(pedidoDaCopia({ estoqueId: 4321 }), comId())).status).toBe(200);
    const copiasDaPrimeira = balde.copias().length;
    // O banco agora tem o rascunho com as fotos que a primeira gravou.
    const [gravado] = banco.escritasEm("repasses");
    banco.leituras.repasses = { data: { ...linhaDoBancoDeTeste(SEM_FOTOS), ...(gravado.valores as object) }, error: null };
    const segunda = await POST(pedidoDaCopia({ estoqueId: 4321 }), comId());
    expect(segunda.status).toBe(409);
    expect(balde.copias()).toHaveLength(copiasDaPrimeira);
    expect(banco.escritasEm("repasses")).toHaveLength(1);
  });

  it("a gravação fica presa ao rascunho lido: mudou no meio (outra cópia, o editor), 409", async () => {
    banco.responderEscrita((e) => (e.tabela === "repasses" ? { data: null, error: null } : { data: null, error: null }));
    expect((await POST(pedidoDaCopia({ estoqueId: 4321 }), comId())).status).toBe(409);
    expect(banco.auditoria()).toEqual([]);
  });

  it("sem login: 401, sem cópia e sem escrita", async () => {
    entrarComo(["comercial"], null);
    expect((await POST(pedidoDaCopia({ estoqueId: 4321 }), comId())).status).toBe(401);
    expect(balde.chamadas).toEqual([]);
    expect(banco.escritas).toEqual([]);
  });

  it("quem não é da equipe: 403", async () => {
    entrarComo(["cliente"]);
    expect((await POST(pedidoDaCopia({ estoqueId: 4321 }), comId())).status).toBe(403);
    expect(balde.chamadas).toEqual([]);
  });

  it("id que não é uuid ou repasse que não existe: 404", async () => {
    expect((await POST(pedidoDaCopia({ estoqueId: 4321 }), comId("123"))).status).toBe(404);
    banco.leituras.repasses = { data: null, error: null };
    expect((await POST(pedidoDaCopia({ estoqueId: 4321 }), comId())).status).toBe(404);
    expect(balde.chamadas).toEqual([]);
  });

  it.each(["em_validacao", "publicado", "reservado", "vendido", "arquivado"])("só o rascunho recebe: %s dá 409", async (situacao) => {
    entrarComo(["admin"]);
    // Sem fotos: o 409 aqui tem de vir da situação, não da regra do rascunho novo.
    banco.leituras.repasses = {
      data: linhaDoBancoDeTeste({ ...SEM_FOTOS, situacao: situacao as "publicado", lojistas_desde: "2026-09-24T12:00:00Z" }),
      error: null,
    };
    banco.leituras.estoque_motors = { data: linhaDoEstoque(), error: null };
    expect((await POST(pedidoDaCopia({ estoqueId: 4321 }), comId())).status).toBe(409);
    expect(balde.chamadas).toEqual([]);
    expect(banco.escritas).toEqual([]);
  });

  it("estoqueId inválido: 400", async () => {
    for (const estoqueId of [undefined, "abc", 0, -3, 1.5, "../1"]) {
      expect((await POST(pedidoDaCopia({ estoqueId }), comId())).status).toBe(400);
    }
    expect(balde.chamadas).toEqual([]);
  });

  it("carro do estoque que não existe: 404", async () => {
    banco.leituras.estoque_motors = { data: null, error: null };
    expect((await POST(pedidoDaCopia({ estoqueId: 4321 }), comId())).status).toBe(404);
    expect(balde.chamadas).toEqual([]);
  });

  it("copia só os pares nossos, para repasse/<id>/, em ordem, no rascunho novo", async () => {
    const res = await POST(pedidoDaCopia({ estoqueId: 4321 }), comId());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ copiadas: 2, baixadas: 0, ficaramDeFora: 1, acimaDoLimite: 0, falharam: 0 });

    // Os pares copiam em paralelo: a ordem que vale é a da lista gravada, abaixo.
    const destinoDe = new Map(balde.copias());
    expect([...destinoDe.keys()].sort()).toEqual(["4321/a-web.webp", "4321/a-zap.jpg", "4321/b-web.webp", "4321/b-zap.jpg"]);
    for (const para of destinoDe.values()) expect(para.startsWith(`repasse/${ID}/`)).toBe(true);
    // O par fica no mesmo lote: a galeria apaga as duas versões juntas.
    const loteDe = (de: string) => destinoDe.get(de)!.replace(/-(web\.webp|zap\.jpg)$/, "");
    expect(loteDe("4321/a-web.webp")).toBe(loteDe("4321/a-zap.jpg"));
    expect(loteDe("4321/a-web.webp")).not.toBe(loteDe("4321/b-web.webp"));
    expect(balde.chamadas.every((c) => c.bucket === "veiculos")).toBe(true);
    // A foto do carro57 fora da pasta da loja não é copiada nem pedida.
    expect([...destinoDe.keys()].some((de) => de.includes("carro57"))).toBe(false);
    expect(internet.pedidos).toEqual([]);

    const [update] = banco.escritasEm("repasses");
    const valores = update.valores as { web_full_images: string[]; whatsapp_images: string[] };
    const publica = (de: string) => `${BALDE}/${destinoDe.get(de)}`;
    expect(valores.web_full_images).toEqual([publica("4321/a-web.webp"), publica("4321/b-web.webp")]);
    expect(valores.whatsapp_images).toEqual([publica("4321/a-zap.jpg"), publica("4321/b-zap.jpg")]);
    // Nenhuma URL do estoque entra no repasse: tudo é cópia na pasta dele.
    for (const url of [...valores.web_full_images, ...valores.whatsapp_images]) {
      expect(url.startsWith(`${BALDE}/repasse/${ID}/`)).toBe(true);
    }
    // Presa ao rascunho LIDO — situação e `updated_at` —, para não gravar por
    // cima de outra cópia nem de uma gravação do editor no meio do caminho.
    expect(update.filtros).toEqual([
      ["id", ID],
      ["situacao", "rascunho"],
      ["updated_at", "2026-09-24T12:00:00Z"],
    ]);
    expect(Object.keys(valores).sort()).toEqual(["web_full_images", "whatsapp_images"]);
    expect(banco.auditoria()[0].acao).toBe("repasse.fotos-do-estoque");
  });

  it("o arquivo do estoque fica intocado: nada se apaga, move ou regrava", async () => {
    await POST(pedidoDaCopia({ estoqueId: 4321 }), comId());
    expect(balde.chamadas.length).toBeGreaterThan(0);
    expect(balde.chamadas.filter((c) => c.op !== "copy")).toEqual([]);
    // E o estoque não recebe escrita nenhuma.
    expect(banco.escritasEm("estoque_motors")).toEqual([]);
  });

  it("falha num par não derruba os outros: o que copiou entra, a falha volta e é registrada", async () => {
    balde.falharQuando((de) => (de === "4321/b-zap.jpg" ? "Object not found" : null));
    const res = await POST(pedidoDaCopia({ estoqueId: 4321 }), comId());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ copiadas: 1, baixadas: 0, ficaramDeFora: 1, acimaDoLimite: 0, falharam: 1 });
    const valores = banco.escritasEm("repasses")[0].valores as { web_full_images: string[]; whatsapp_images: string[] };
    expect(valores.web_full_images).toHaveLength(1);
    expect(valores.whatsapp_images).toHaveLength(1);
    expect(falhas).toHaveBeenCalledTimes(1);
    expect(falhas.mock.calls[0][0]).toBe("quebra");
    expect(String(falhas.mock.calls[0][2])).toContain("Object not found");
  });

  it("o primeiro par falhando não corta os seguintes", async () => {
    balde.falharQuando((de) => (de === "4321/a-web.webp" ? "timeout" : null));
    const res = await POST(pedidoDaCopia({ estoqueId: 4321 }), comId());
    expect(await res.json()).toMatchObject({ copiadas: 1, falharam: 1 });
    expect(balde.copias().map(([de]) => de)).toContain("4321/b-zap.jpg");
  });

  it("todas falhando: nada a gravar, a resposta conta a falha", async () => {
    balde.falharQuando(() => "fora do ar");
    const res = await POST(pedidoDaCopia({ estoqueId: 4321 }), comId());
    expect(await res.json()).toEqual({ copiadas: 0, baixadas: 0, ficaramDeFora: 1, acimaDoLimite: 0, falharam: 2 });
    expect(banco.escritasEm("repasses")).toEqual([]);
  });

  it("teto de 40: carro com 42 fotos nossas leva 40, e as outras 2 nem são copiadas", async () => {
    const lotes = Array.from({ length: 42 }, (_, i) => `f${i}`);
    banco.leituras.estoque_motors = {
      data: linhaDoEstoque({ web_full_images: lotes.map((l) => doEstoque(l, "web")), whatsapp_images: lotes.map((l) => doEstoque(l, "zap")) }),
      error: null,
    };
    const res = await POST(pedidoDaCopia({ estoqueId: 4321 }), comId());
    expect(await res.json()).toEqual({ copiadas: 40, baixadas: 0, ficaramDeFora: 0, acimaDoLimite: 2, falharam: 0 });
    expect(balde.copias()).toHaveLength(80);
    expect(balde.copias().some(([de]) => de.startsWith("4321/f40-") || de.startsWith("4321/f41-"))).toBe(false);
    const valores = banco.escritasEm("repasses")[0].valores as { web_full_images: string[]; whatsapp_images: string[] };
    expect(valores.web_full_images).toHaveLength(40);
    expect(valores.whatsapp_images).toHaveLength(40);
  });

  it("carro só com fotos fora da pasta da loja: 200, sem cópia, sem pedido à rede e sem escrita", async () => {
    banco.leituras.estoque_motors = { data: linhaDoEstoque({ web_full_images: [CARRO57("web")], whatsapp_images: [CARRO57("zap")] }), error: null };
    const res = await POST(pedidoDaCopia({ estoqueId: 4321 }), comId());
    expect(await res.json()).toEqual({ copiadas: 0, baixadas: 0, ficaramDeFora: 1, acimaDoLimite: 0, falharam: 0 });
    expect(balde.chamadas).toEqual([]);
    expect(internet.pedidos).toEqual([]);
    expect(banco.escritasEm("repasses")).toEqual([]);
  });

  it("a rota tem 60 s: baixar do carro57 leva mais que copiar dentro do bucket", () => {
    expect(rotaDaCopia.maxDuration).toBe(60);
  });

  it("a leitura do estoque pede só o id e as fotos", async () => {
    await POST(pedidoDaCopia({ estoqueId: 4321 }), comId());
    const [consulta] = banco.consultas.filter((c) => c.tabela === "estoque_motors");
    expect(consulta.filtros).toEqual([["id", 4321]]);
    expect(String(consulta.colunas).replace(/\s/g, "")).toBe("id,web_full_images,whatsapp_images");
  });
});

/** O endereço público de cada caminho que a rota gravou no bucket. */
const publicaDe = (caminho: string) => `${BALDE}/${caminho}`;
/** "repasse/<id>/<lote>-web.webp" → "<lote>": o par anda no mesmo lote. */
const loteDoCaminho = (caminho: string) => caminho.replace(/^.*\//, "").replace(/-(web\.webp|zap\.jpg)$/, "");
type Gravado = { web_full_images: string[]; whatsapp_images: string[] };
/**
 * Deixa a rota andar o que der sem mexer no relógio falso (o `setImmediate`
 * não é falsificado): se a trava de tempo sumir, o teste reprova em vez de
 * pendurar.
 */
const escoar = async () => {
  for (let i = 0; i < 50; i += 1) await new Promise((resolver) => setImmediate(resolver));
};

describe("POST /api/repasses/[id]/fotos-do-estoque — as fotos do carro57 da loja (dono, 01/10)", () => {
  beforeEach(() => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste(SEM_FOTOS), error: null };
  });
  const comFotos = (web: string[], zap: string[]) => {
    banco.leituras.estoque_motors = { data: linhaDoEstoque({ web_full_images: web, whatsapp_images: zap }), error: null };
  };
  const copiar = async () => {
    const res = await POST(pedidoDaCopia({ estoqueId: 4321 }), comId());
    expect(res.status).toBe(200);
    return res.json();
  };
  const gravado = () => banco.escritasEm("repasses")[0].valores as Gravado;
  /** Para onde subiu a foto que veio de `url`. */
  const destinoDa = (url: string) => balde.subidas().find((s) => s.de === url)?.para;

  it("baixa e sobe em repasse/<id>/, par no mesmo lote, com o tipo servido e o carimbo de 1 ano", async () => {
    const web = [DA_LOJA(1, "web"), DA_LOJA(2, "web")];
    const zap = [DA_LOJA(1, "zap"), DA_LOJA(2, "zap")];
    comFotos(web, zap);
    internet.servir(...web, ...zap);

    expect(await copiar()).toEqual({ copiadas: 0, baixadas: 2, ficaramDeFora: 0, acimaDoLimite: 0, falharam: 0 });

    // Cada foto pedida uma vez, sem seguir redirecionamento e com prazo.
    expect(internet.pedidos.map((p) => p.url).sort()).toEqual([...web, ...zap].sort());
    for (const { init } of internet.pedidos) {
      expect(init?.redirect).toBe("manual");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    // Os bytes como vieram, com o tipo da resposta (o zap é JPEG; a web
    // também, neste carro — o arquivo .webp guarda o JPEG servido).
    const subidas = balde.subidas();
    expect(subidas).toHaveLength(4);
    for (const s of subidas) {
      expect(s.para.startsWith(`repasse/${ID}/`)).toBe(true);
      expect(s.opcoes).toEqual({ contentType: "image/jpeg", upsert: false, cacheControl: "31536000" });
    }
    expect(destinoDa(web[0])).toMatch(/-web\.webp$/);
    expect(destinoDa(zap[0])).toMatch(/-zap\.jpg$/);
    expect(loteDoCaminho(destinoDa(web[0])!)).toBe(loteDoCaminho(destinoDa(zap[0])!));
    expect(loteDoCaminho(destinoDa(web[0])!)).not.toBe(loteDoCaminho(destinoDa(web[1])!));

    // Na ordem do estoque, e só endereços do nosso bucket.
    expect(gravado().web_full_images).toEqual(web.map((u) => publicaDe(destinoDa(u)!)));
    expect(gravado().whatsapp_images).toEqual(zap.map((u) => publicaDe(destinoDa(u)!)));
    // Nada se copia, apaga, move ou regrava: só sobe, no bucket das fotos.
    expect(balde.chamadas.filter((c) => c.op !== "upload")).toEqual([]);
    expect(balde.chamadas.every((c) => c.bucket === "veiculos")).toBe(true);
    expect(banco.auditoria()[0].acao).toBe("repasse.fotos-do-estoque");
  });

  it("host que não é o carro57 nunca é pedido: fica de fora", async () => {
    const proibidas = [
      "https://exemplo.test/FC/9037/1_0_W_a.jpeg",
      "http://s3.carro57.com.br/FC/9037/1_0_W_a.jpeg",
      "https://s3.carro57.com.br.exemplo.test/FC/9037/1_0_W_a.jpeg",
      "https://s3.carro57.com.br@exemplo.test/FC/9037/1_0_W_a.jpeg",
      "https://usuario:senha@s3.carro57.com.br/FC/9037/1_0_W_a.jpeg",
      "https://s3.carro57.com.br:8443/FC/9037/1_0_W_a.jpeg",
      "https://169.254.169.254/FC/9037/1_0_W_a.jpeg",
      "https://127.0.0.1/FC/9037/1_0_W_a.jpeg",
      "https://localhost/FC/9037/1_0_W_a.jpeg",
      "ftp://s3.carro57.com.br/FC/9037/1_0_W_a.jpeg",
      "//s3.carro57.com.br/FC/9037/1_0_W_a.jpeg",
      "s3.carro57.com.br/FC/9037/1_0_W_a.jpeg",
    ];
    // O outro lado de cada par é da loja: só o host errado o derruba.
    comFotos(proibidas, proibidas.map((_, i) => DA_LOJA(i, "zap")));
    // Se alguém pedisse, a "foto" viria: a recusa tem de ser ANTES do pedido.
    internet.servir(...proibidas, ...proibidas.map((_, i) => DA_LOJA(i, "zap")));

    expect(await copiar()).toEqual({ copiadas: 0, baixadas: 0, ficaramDeFora: proibidas.length, acimaDoLimite: 0, falharam: 0 });
    expect(internet.pedidos).toEqual([]);
    expect(balde.chamadas).toEqual([]);
    expect(banco.escritasEm("repasses")).toEqual([]);
  });

  it("outra loja (ou outra pasta) no mesmo carro57 nunca é pedida: fica de fora", async () => {
    const outraLoja = [
      "https://s3.carro57.com.br/FC/1234/1_0_W_a.jpeg",
      "https://s3.carro57.com.br/FC/90370/1_0_W_a.jpeg",
      "https://s3.carro57.com.br/FC/9037/../1234/1_0_W_a.jpeg",
      "https://s3.carro57.com.br/FC/9037/%2e%2e/1234/1_0_W_a.jpeg",
      "https://s3.carro57.com.br/FC/9037/..%2F1234/1_0_W_a.jpeg",
      "https://s3.carro57.com.br/FC/9037/..%5C1234/1_0_W_a.jpeg",
      "https://s3.carro57.com.br/fc/9037/1_0_W_a.jpeg",
      "https://s3.carro57.com.br/FC9037/1_0_W_a.jpeg",
      "https://s3.carro57.com.br/anuncios/FC/9037/1_0_W_a.jpeg",
    ];
    comFotos(outraLoja.map((_, i) => DA_LOJA(i, "web")), outraLoja);
    internet.servir(...outraLoja, ...outraLoja.map((_, i) => DA_LOJA(i, "web")));

    expect(await copiar()).toEqual({ copiadas: 0, baixadas: 0, ficaramDeFora: outraLoja.length, acimaDoLimite: 0, falharam: 0 });
    expect(internet.pedidos).toEqual([]);
    expect(balde.chamadas).toEqual([]);
  });

  it("3xx é falha, mesmo para dentro da pasta da loja: o destino nunca é visitado e o par não sobe", async () => {
    const web = [DA_LOJA(1, "web"), DA_LOJA(2, "web"), DA_LOJA(3, "web")];
    const zap = [DA_LOJA(1, "zap"), DA_LOJA(2, "zap"), DA_LOJA(3, "zap")];
    comFotos(web, zap);
    internet.servir(...web, ...zap);
    // Se seguido, cada redirecionamento entregaria uma "foto" que funciona.
    const ARMADILHA = "http://169.254.169.254/latest/meta-data/";
    internet.servir(ARMADILHA);
    internet.responder(web[0], () => new Response(null, { status: 302, headers: { location: ARMADILHA } }));
    internet.responder(zap[1], () => new Response(null, { status: 301, headers: { location: DA_LOJA(9, "zap") } }));
    internet.servir(DA_LOJA(9, "zap"));

    expect(await copiar()).toEqual({ copiadas: 0, baixadas: 1, ficaramDeFora: 0, acimaDoLimite: 0, falharam: 2 });
    expect(internet.visitados).not.toContain(ARMADILHA);
    expect(internet.visitados).not.toContain(DA_LOJA(9, "zap"));
    // Só o par 3 sobe — a web do par 2 baixou bem, mas o par vai inteiro ou não vai.
    expect(balde.subidas().map((s) => s.de).sort()).toEqual([web[2], zap[2]].sort());
    expect(falhas).toHaveBeenCalledTimes(1);
    expect(String(falhas.mock.calls[0][2])).toContain("redirecionamento");
  });

  it("acima de 15 MB não sobe: pelo content-length, e pela leitura quando o tamanho não vem", async () => {
    const web = [DA_LOJA(1, "web"), DA_LOJA(2, "web"), DA_LOJA(3, "web")];
    const zap = [DA_LOJA(1, "zap"), DA_LOJA(2, "zap"), DA_LOJA(3, "zap")];
    comFotos(web, zap);
    internet.servir(...web, ...zap);
    const MB = 1024 * 1024;
    // Par 2: o cabeçalho diz 16 MB.
    internet.responder(web[1], () => new Response(corpoDe(web[1]), { headers: { "content-type": "image/jpeg", "content-length": String(16 * MB) } }));
    // Par 3: sem tamanho declarado, 16 pedaços de 1 MB.
    internet.responder(
      zap[2],
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              const pedaco = new Uint8Array(MB);
              for (let i = 0; i < 16; i += 1) c.enqueue(pedaco);
              c.close();
            },
          }),
          { headers: { "content-type": "image/jpeg" } },
        ),
    );

    expect(await copiar()).toEqual({ copiadas: 0, baixadas: 1, ficaramDeFora: 0, acimaDoLimite: 0, falharam: 2 });
    expect(balde.subidas().map((s) => s.de).sort()).toEqual([web[0], zap[0]].sort());
    expect(String(falhas.mock.calls[0][2])).toContain("15 MB");
  });

  it("o que não é imagem não sobe (página de erro com 200, SVG, sem tipo)", async () => {
    const web = [DA_LOJA(1, "web"), DA_LOJA(2, "web"), DA_LOJA(3, "web"), DA_LOJA(4, "web")];
    const zap = [DA_LOJA(1, "zap"), DA_LOJA(2, "zap"), DA_LOJA(3, "zap"), DA_LOJA(4, "zap")];
    comFotos(web, zap);
    internet.servir(...web, ...zap);
    internet.responder(web[0], () => new Response("<html>entre</html>", { headers: { "content-type": "text/html; charset=utf-8" } }));
    internet.responder(zap[1], imagem(zap[1], "image/svg+xml"));
    internet.responder(web[2], () => new Response(corpoDe(web[2])));

    expect(await copiar()).toEqual({ copiadas: 0, baixadas: 1, ficaramDeFora: 0, acimaDoLimite: 0, falharam: 3 });
    expect(balde.subidas().map((s) => s.de).sort()).toEqual([web[3], zap[3]].sort());
  });

  it("o tipo vai sem parâmetros: \"image/jpeg; charset=binary\" sobe como image/jpeg", async () => {
    comFotos([DA_LOJA(1, "web")], [DA_LOJA(1, "zap")]);
    internet.servir(DA_LOJA(1, "zap"));
    internet.responder(DA_LOJA(1, "web"), imagem(DA_LOJA(1, "web"), "Image/JPEG; charset=binary"));
    expect(await copiar()).toMatchObject({ baixadas: 1, falharam: 0 });
    expect(balde.subidas().map((s) => (s.opcoes as { contentType: string }).contentType)).toEqual(["image/jpeg", "image/jpeg"]);
  });

  it("foto que não responde: desiste em 15 s, o par falha e os outros entram", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const web = [DA_LOJA(1, "web"), DA_LOJA(2, "web")];
    const zap = [DA_LOJA(1, "zap"), DA_LOJA(2, "zap")];
    comFotos(web, zap);
    internet.servir(...web, ...zap);
    internet.responder(zap[0], () => "pendurada");

    let resposta: Response | undefined;
    void POST(pedidoDaCopia({ estoqueId: 4321 }), comId()).then((r) => (resposta = r));
    await vi.advanceTimersByTimeAsync(14_000);
    await escoar();
    expect(resposta).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2_000);
    await escoar();
    expect(resposta).toBeDefined();
    expect(await resposta!.json()).toEqual({ copiadas: 0, baixadas: 1, ficaramDeFora: 0, acimaDoLimite: 0, falharam: 1 });
    expect(balde.subidas().map((s) => s.de).sort()).toEqual([web[1], zap[1]].sort());
    expect(String(falhas.mock.calls[0][2])).toContain("tempo");
  });

  it("prazo total de 40 s para os downloads: o que passa dele falha, e a rota responde antes dos 60 s da função", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const n = Array.from({ length: 12 }, (_, i) => i + 1);
    const web = n.map((i) => DA_LOJA(i, "web"));
    const zap = n.map((i) => DA_LOJA(i, "zap"));
    comFotos(web, zap);
    for (const u of web) internet.responder(u, () => "pendurada");

    let resposta: Response | undefined;
    void POST(pedidoDaCopia({ estoqueId: 4321 }), comId()).then((r) => (resposta = r));
    // Três levas de 4; cada uma desiste em 15 s. A terceira começa aos 30 s e
    // só desistiria aos 45 — o prazo a corta aos 40.
    await vi.advanceTimersByTimeAsync(39_000);
    await escoar();
    expect(resposta).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2_000);
    await escoar();
    expect(resposta).toBeDefined();
    expect(await resposta!.json()).toEqual({ copiadas: 0, baixadas: 0, ficaramDeFora: 0, acimaDoLimite: 0, falharam: 12 });
    expect(banco.escritasEm("repasses")).toEqual([]);
  });

  it("um lado do par falha: o par inteiro fica de fora e é contado, e as listas seguem alinhadas", async () => {
    // Par 1: o zap dá 404 (a web baixaria bem). Par 2: inteiro. Par 3: a web dá 500.
    // Par 4: o Storage recusa o zap (a web já tinha subido).
    const web = [DA_LOJA(1, "web"), DA_LOJA(2, "web"), DA_LOJA(3, "web"), DA_LOJA(4, "web")];
    const zap = [DA_LOJA(1, "zap"), DA_LOJA(2, "zap"), DA_LOJA(3, "zap"), DA_LOJA(4, "zap")];
    comFotos(web, zap);
    internet.servir(web[0], web[1], zap[1], zap[2], web[3], zap[3]);
    internet.responder(web[2], () => new Response("erro", { status: 500 }));
    balde.falharQuando((de) => (de === `foto:${zap[3]}` ? "mime type not supported" : null));

    expect(await copiar()).toEqual({ copiadas: 0, baixadas: 1, ficaramDeFora: 0, acimaDoLimite: 0, falharam: 3 });
    // Só o par 2 entra — uma foto de cada lado, do mesmo lote, na mesma posição.
    expect(gravado().web_full_images).toEqual([publicaDe(destinoDa(web[1])!)]);
    expect(gravado().whatsapp_images).toEqual([publicaDe(destinoDa(zap[1])!)]);
    expect(loteDoCaminho(destinoDa(web[1])!)).toBe(loteDoCaminho(destinoDa(zap[1])!));
    // O download vem antes de qualquer gravação: o par 1 não deixa a web no bucket.
    expect(destinoDa(web[0])).toBeUndefined();
    expect(falhas).toHaveBeenCalledTimes(1);
    expect(String(falhas.mock.calls[0][2])).toContain("3 de 4");
  });

  it("par misto: o lado nosso é copiado e o do carro57 é baixado, cada um pelo seu caminho, no mesmo lote", async () => {
    const web = [doEstoque("a", "web"), DA_LOJA(2, "web"), doEstoque("c", "web")];
    const zap = [DA_LOJA(1, "zap"), doEstoque("b", "zap"), doEstoque("c", "zap")];
    comFotos(web, zap);
    internet.servir(zap[0], web[1]);

    expect(await copiar()).toEqual({ copiadas: 1, baixadas: 2, ficaramDeFora: 0, acimaDoLimite: 0, falharam: 0 });
    // Só os lados do carro57 vão à rede; os nossos, só ao `copy`.
    expect(internet.pedidos.map((p) => p.url).sort()).toEqual([zap[0], web[1]].sort());
    const copiaDe = new Map(balde.copias());
    expect([...copiaDe.keys()].sort()).toEqual(["4321/a-web.webp", "4321/b-zap.jpg", "4321/c-web.webp", "4321/c-zap.jpg"]);
    expect(balde.subidas().map((s) => s.de).sort()).toEqual([zap[0], web[1]].sort());

    const lote1 = loteDoCaminho(copiaDe.get("4321/a-web.webp")!);
    expect(loteDoCaminho(destinoDa(zap[0])!)).toBe(lote1);
    const lote2 = loteDoCaminho(destinoDa(web[1])!);
    expect(loteDoCaminho(copiaDe.get("4321/b-zap.jpg")!)).toBe(lote2);
    expect(lote1).not.toBe(lote2);
    expect(gravado().web_full_images).toEqual([
      publicaDe(copiaDe.get("4321/a-web.webp")!),
      publicaDe(destinoDa(web[1])!),
      publicaDe(copiaDe.get("4321/c-web.webp")!),
    ]);
    expect(gravado().whatsapp_images).toEqual([
      publicaDe(destinoDa(zap[0])!),
      publicaDe(copiaDe.get("4321/b-zap.jpg")!),
      publicaDe(copiaDe.get("4321/c-zap.jpg")!),
    ]);
    expect(balde.chamadas.filter((c) => c.op !== "copy" && c.op !== "upload")).toEqual([]);
  });

  it("no máximo 4 pedidos ao carro57 ao mesmo tempo, e a ordem gravada é a do estoque", async () => {
    const n = Array.from({ length: 12 }, (_, i) => i + 1);
    const web = n.map((i) => DA_LOJA(i, "web"));
    const zap = n.map((i) => DA_LOJA(i, "zap"));
    comFotos(web, zap);
    internet.servir(...web, ...zap);

    expect(await copiar()).toMatchObject({ baixadas: 12, falharam: 0 });
    expect(internet.pedidos).toHaveLength(24);
    expect(internet.pico()).toBeLessThanOrEqual(4);
    expect(gravado().web_full_images).toEqual(web.map((u) => publicaDe(destinoDa(u)!)));
    expect(gravado().whatsapp_images).toEqual(zap.map((u) => publicaDe(destinoDa(u)!)));
  });

  it("o teto de 40 vale para o que se baixa: as fotos acima nem são pedidas", async () => {
    const n = Array.from({ length: 42 }, (_, i) => i + 1);
    const web = n.map((i) => DA_LOJA(i, "web"));
    const zap = n.map((i) => DA_LOJA(i, "zap"));
    comFotos(web, zap);
    internet.servir(...web, ...zap);

    expect(await copiar()).toEqual({ copiadas: 0, baixadas: 40, ficaramDeFora: 0, acimaDoLimite: 2, falharam: 0 });
    expect(internet.pedidos.map((p) => p.url)).not.toContain(web[40]);
    expect(internet.pedidos.map((p) => p.url)).not.toContain(zap[41]);
    expect(gravado().web_full_images).toHaveLength(40);
  });

  it("o rascunho que já tem fotos: 409 e nada é pedido à rede", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste(), error: null };
    comFotos([DA_LOJA(1, "web")], [DA_LOJA(1, "zap")]);
    internet.servir(DA_LOJA(1, "web"), DA_LOJA(1, "zap"));
    expect((await POST(pedidoDaCopia({ estoqueId: 4321 }), comId())).status).toBe(409);
    expect(internet.pedidos).toEqual([]);
    expect(balde.chamadas).toEqual([]);
  });
});
