import { describe, it, expect, vi, beforeEach } from "vitest";
import { bancoDeTeste, sessaoDeTeste, type Banco } from "./bancoDoRepasseDeTeste";
import { fotoDeTeste, linhaDoBancoDeTeste } from "./repasseDeTeste";

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
const { falhas } = vi.hoisted(() => ({ falhas: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}) }));

let banco: Banco;
let sessao: ReturnType<typeof sessaoDeTeste>;
let balde: ReturnType<typeof armazenamentoDeTeste>;
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => sessao,
  createAdminSupabaseClient: () => ({ ...banco.cliente, storage: balde.cliente }),
}));
vi.mock("../src/lib/observabilidade", async (original) => ({
  ...(await original<typeof import("../src/lib/observabilidade")>()),
  registrarFalha: (...args: unknown[]) => falhas(...args),
}));

const {
  avisoDasFotos,
  buscarNoEstoque,
  carroDoEstoqueParaORepasse,
  planejarCopiaDasFotos,
} = await import("../src/lib/estoqueParaORepasse");
const { GET } = await import("../src/app/api/repasses/estoque/route");
const { POST } = await import("../src/app/api/repasses/[id]/fotos-do-estoque/route");

const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";
const BALDE = "https://x.supabase.co/storage/v1/object/public/veiculos";
const doEstoque = (lote: string, v: "web" | "zap", pasta = "4321") =>
  `${BALDE}/${pasta}/${lote}-${v}.${v === "web" ? "webp" : "jpg"}`;
const CARRO57 = (v: "web" | "zap") => `https://s3.carro57.com.br/anuncios/4321/9-${v}.jpg`;

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
      upload: registrar("upload", bucket),
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
  };
}

function entrarComo(papeis: string[] | null, usuario?: { id: string; email: string } | null) {
  banco = bancoDeTeste();
  sessao = sessaoDeTeste(banco, papeis, usuario);
  balde = armazenamentoDeTeste();
  falhas.mockClear();
}
beforeEach(() => entrarComo(["comercial"]));

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

  it("conta os pares copiáveis e os de fora do nosso armazenamento", () => {
    expect(carroDoEstoqueParaORepasse(linhaDoEstoque())).toMatchObject({ fotosCopiaveis: 2, fotosDeFora: 1 });
    // Par misto (uma versão nossa, a outra no carro57) não se copia inteiro: fica de fora.
    const misto = linhaDoEstoque({
      web_full_images: [doEstoque("a", "web"), doEstoque("b", "web")],
      whatsapp_images: [doEstoque("a", "zap"), CARRO57("zap")],
    });
    expect(carroDoEstoqueParaORepasse(misto)).toMatchObject({ fotosCopiaveis: 1, fotosDeFora: 1 });
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

  it("termo curto não busca; o resultado para em 8", () => {
    expect(buscarNoEstoque(linhas, "f")).toEqual([]);
    const muitas = Array.from({ length: 12 }, (_, i) => linhaDoEstoque({ id: i + 1 }));
    expect(buscarNoEstoque(muitas, "gol")).toHaveLength(8);
  });
});

describe("o aviso das fotos no formulário", () => {
  it("diz quantas vêm e quantas ficam de fora", () => {
    expect(avisoDasFotos({ fotosCopiaveis: 2, fotosDeFora: 3 })).toBe(
      "2 fotos serão copiadas; 3 ficam de fora (fora do nosso armazenamento).",
    );
    expect(avisoDasFotos({ fotosCopiaveis: 1, fotosDeFora: 1 })).toBe(
      "1 foto será copiada; 1 fica de fora (fora do nosso armazenamento).",
    );
    expect(avisoDasFotos({ fotosCopiaveis: 0, fotosDeFora: 0 })).toBe("O carro não tem fotos para copiar.");
  });

  it("acima de 40, diz que o resto passa do limite", () => {
    expect(avisoDasFotos({ fotosCopiaveis: 43, fotosDeFora: 0 })).toBe(
      "40 fotos serão copiadas; 0 ficam de fora (fora do nosso armazenamento). Outras 3 passam do limite de 40 do repasse.",
    );
  });
});

describe("o plano da cópia das fotos", () => {
  let n = 0;
  const lote = () => `l${(n += 1)}`;
  beforeEach(() => {
    n = 0;
  });

  it("só os pares nossos, em ordem, de pasta do estoque para a pasta do repasse", () => {
    const plano = planejarCopiaDasFotos({
      repasseId: ID,
      web: linhaDoEstoque().web_full_images,
      zap: linhaDoEstoque().whatsapp_images,
      jaTem: 0,
      novoLote: lote,
    });
    expect(plano.pares).toEqual([
      {
        origem: { web: "4321/a-web.webp", zap: "4321/a-zap.jpg" },
        destino: { web: `repasse/${ID}/l1-web.webp`, zap: `repasse/${ID}/l1-zap.jpg` },
      },
      {
        origem: { web: "4321/b-web.webp", zap: "4321/b-zap.jpg" },
        destino: { web: `repasse/${ID}/l2-web.webp`, zap: `repasse/${ID}/l2-zap.jpg` },
      },
    ]);
    expect(plano).toMatchObject({ ficaramDeFora: 1, acimaDoLimite: 0 });
  });

  it("respeita o teto de 40 contando o que o repasse já tem", () => {
    const web = ["a", "b", "c"].map((l) => doEstoque(l, "web"));
    const zap = ["a", "b", "c"].map((l) => doEstoque(l, "zap"));
    const plano = planejarCopiaDasFotos({ repasseId: ID, web, zap, jaTem: 39, novoLote: lote });
    expect(plano.pares.map((p) => p.origem.web)).toEqual(["4321/a-web.webp"]);
    expect(plano).toMatchObject({ ficaramDeFora: 0, acimaDoLimite: 2 });
  });
});

const pedidoDaBusca = (q?: string) =>
  new Request(`http://teste/api/repasses/estoque${q === undefined ? "" : `?q=${encodeURIComponent(q)}`}`);

describe("GET /api/repasses/estoque", () => {
  beforeEach(() => {
    banco.leituras.estoque_motors = { data: [linhaDoEstoque()], error: null };
  });

  it("sem login: 401 e o estoque nem é lido", async () => {
    entrarComo(["comercial"], null);
    banco.leituras.estoque_motors = { data: [linhaDoEstoque()], error: null };
    expect((await GET(pedidoDaBusca("gol"))).status).toBe(401);
    expect(banco.lidas).not.toContain("estoque_motors");
  });

  it("quem não é da equipe: 403", async () => {
    entrarComo(["cliente"]);
    expect((await GET(pedidoDaBusca("gol"))).status).toBe(403);
    expect(banco.lidas).not.toContain("estoque_motors");
  });

  it("quem foi desativado: 403", async () => {
    banco.leituras.profiles = { data: { role: "comercial", papeis: ["comercial"], full_name: "X", is_active: false }, error: null };
    expect((await GET(pedidoDaBusca("gol"))).status).toBe(403);
    expect(banco.lidas).not.toContain("estoque_motors");
  });

  it.each(["admin", "gestor", "marketing", "comercial", "financeiro", "sdr"])("%s cadastra repasse e busca no estoque", async (papel) => {
    entrarComo([papel]);
    banco.leituras.estoque_motors = { data: [linhaDoEstoque()], error: null };
    const res = await GET(pedidoDaBusca("gol"));
    expect(res.status).toBe(200);
    expect((await res.json()).veiculos.map((c: { id: number }) => c.id)).toEqual([4321]);
  });

  it("o select nunca pede chassi, renavam, custo nem valor FIPE, e a resposta não leva placa", async () => {
    const res = await GET(pedidoDaBusca("QXR-7E19"));
    const corpo = await res.json();
    expect(corpo.veiculos.map((c: { id: number }) => c.id)).toEqual([4321]);
    const [consulta] = banco.consultas.filter((c) => c.tabela === "estoque_motors");
    const colunas = String(consulta.colunas)
      .split(",")
      .map((c) => c.trim());
    for (const proibida of ["chassi", "renavam", "preco_compra", "valor_fipe"]) expect(colunas).not.toContain(proibida);
    const json = JSON.stringify(corpo);
    for (const campo of PROIBIDOS) expect(json).not.toContain(`"${campo}"`);
    for (const valor of VALORES_PROIBIDOS) expect(json).not.toContain(valor);
  });

  it("termo curto: lista vazia, sem ir ao banco", async () => {
    const res = await GET(pedidoDaBusca("g"));
    expect((await res.json()).veiculos).toEqual([]);
    expect(banco.lidas).not.toContain("estoque_motors");
  });

  it("falha na leitura do estoque: 502", async () => {
    banco.leituras.estoque_motors = { data: null, error: { message: "fora do ar", code: "XX000" } };
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

describe("POST /api/repasses/[id]/fotos-do-estoque", () => {
  beforeEach(() => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste(), error: null };
    banco.leituras.estoque_motors = { data: linhaDoEstoque(), error: null };
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
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ situacao: situacao as "publicado", lojistas_desde: "2026-09-24T12:00:00Z" }), error: null };
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

  it("copia só os pares nossos, para repasse/<id>/, e anexa em ordem às fotos do repasse", async () => {
    const res = await POST(pedidoDaCopia({ estoqueId: 4321 }), comId());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ copiadas: 2, ficaramDeFora: 1, acimaDoLimite: 0, falharam: 0 });

    // Os pares copiam em paralelo: a ordem que vale é a da lista gravada, abaixo.
    const destinoDe = new Map(balde.copias());
    expect([...destinoDe.keys()].sort()).toEqual(["4321/a-web.webp", "4321/a-zap.jpg", "4321/b-web.webp", "4321/b-zap.jpg"]);
    for (const para of destinoDe.values()) expect(para.startsWith(`repasse/${ID}/`)).toBe(true);
    // O par fica no mesmo lote: a galeria apaga as duas versões juntas.
    const loteDe = (de: string) => destinoDe.get(de)!.replace(/-(web\.webp|zap\.jpg)$/, "");
    expect(loteDe("4321/a-web.webp")).toBe(loteDe("4321/a-zap.jpg"));
    expect(loteDe("4321/a-web.webp")).not.toBe(loteDe("4321/b-web.webp"));
    expect(balde.chamadas.every((c) => c.bucket === "veiculos")).toBe(true);
    // Nada sai do carro57.
    expect([...destinoDe.keys()].some((de) => de.includes("carro57"))).toBe(false);

    const [update] = banco.escritasEm("repasses");
    const valores = update.valores as { web_full_images: string[]; whatsapp_images: string[] };
    const existentes = linhaDoBancoDeTeste();
    const publica = (de: string) => `${BALDE}/${destinoDe.get(de)}`;
    expect(valores.web_full_images).toEqual([...(existentes.web_full_images as string[]), publica("4321/a-web.webp"), publica("4321/b-web.webp")]);
    expect(valores.whatsapp_images).toEqual([...(existentes.whatsapp_images as string[]), publica("4321/a-zap.jpg"), publica("4321/b-zap.jpg")]);
    // Nenhuma URL do estoque entra no repasse: tudo é cópia na pasta dele.
    for (const url of [...valores.web_full_images, ...valores.whatsapp_images]) {
      expect(url.startsWith(`${BALDE}/repasse/${ID}/`)).toBe(true);
    }
    expect(update.filtros).toEqual([
      ["id", ID],
      ["situacao", "rascunho"],
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
    expect(await res.json()).toEqual({ copiadas: 1, ficaramDeFora: 1, acimaDoLimite: 0, falharam: 1 });
    const valores = banco.escritasEm("repasses")[0].valores as { web_full_images: string[]; whatsapp_images: string[] };
    expect(valores.web_full_images).toHaveLength(5);
    expect(valores.whatsapp_images).toHaveLength(5);
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
    expect(await res.json()).toEqual({ copiadas: 0, ficaramDeFora: 1, acimaDoLimite: 0, falharam: 2 });
    expect(banco.escritasEm("repasses")).toEqual([]);
  });

  it("teto de 40: o repasse com 39 fotos recebe só mais uma", async () => {
    const web = Array.from({ length: 39 }, (_, i) => fotoDeTeste(`p${i}`));
    const zap = Array.from({ length: 39 }, (_, i) => fotoDeTeste(`p${i}`, "zap"));
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ web_full_images: web, whatsapp_images: zap }), error: null };
    const res = await POST(pedidoDaCopia({ estoqueId: 4321 }), comId());
    expect(await res.json()).toEqual({ copiadas: 1, ficaramDeFora: 1, acimaDoLimite: 1, falharam: 0 });
    expect(balde.copias()).toHaveLength(2);
    const valores = banco.escritasEm("repasses")[0].valores as { web_full_images: string[]; whatsapp_images: string[] };
    expect(valores.web_full_images).toHaveLength(40);
    expect(valores.whatsapp_images).toHaveLength(40);
  });

  it("carro sem foto nossa: 200, sem cópia e sem escrita", async () => {
    banco.leituras.estoque_motors = { data: linhaDoEstoque({ web_full_images: [CARRO57("web")], whatsapp_images: [CARRO57("zap")] }), error: null };
    const res = await POST(pedidoDaCopia({ estoqueId: 4321 }), comId());
    expect(await res.json()).toEqual({ copiadas: 0, ficaramDeFora: 1, acimaDoLimite: 0, falharam: 0 });
    expect(balde.chamadas).toEqual([]);
    expect(banco.escritasEm("repasses")).toEqual([]);
  });

  it("a leitura do estoque pede só o id e as fotos", async () => {
    await POST(pedidoDaCopia({ estoqueId: 4321 }), comId());
    const [consulta] = banco.consultas.filter((c) => c.tabela === "estoque_motors");
    expect(consulta.filtros).toEqual([["id", 4321]]);
    expect(String(consulta.colunas).replace(/\s/g, "")).toBe("id,web_full_images,whatsapp_images");
  });
});
