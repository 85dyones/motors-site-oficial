import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bancoDeTeste, sessaoDeTeste, type Banco } from "./bancoDoRepasseDeTeste";
import { fotoDeTeste, linhaDoBancoDeTeste, repasseDeTeste } from "./repasseDeTeste";

/**
 * "Importar fotos do feed" no carro de repasse (dono, 06/10: "na interface do
 * repasse, o enviar fotos precisa ter um botão de puxar fotos do revenda, como
 * no estoque já existe").
 *
 * O que este arquivo trava:
 *   (a) quem pode é quem envia foto pela galeria, e ninguém mais;
 *   (b) o navegador só diz QUAL carro: nenhum endereço vem do corpo, e o
 *       servidor só pede a pasta da loja no carro57;
 *   (c) a foto termina no NOSSO bucket, em `repasse/<id>/`: é o endereço nosso
 *       que entra na lista, nunca o do carro57;
 *   (d) soma à galeria, sem repetir a foto que já veio, e respeita o teto;
 *   (e) as fotos de defeito da ficha de estado não são tocadas.
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

const { carroDoRepasseNaBusca, decidirImportacaoDoFeed, marcasDoFeedNoRepasse, planejarImportacaoDoFeed, resumoDaImportacao } = await import(
  "../src/lib/feedParaORepasse"
);
const { LIMITE_DE_FOTOS_DO_REPASSE } = await import("../src/lib/edicaoDoRepasse");
const rota = await import("../src/app/api/repasses/[id]/fotos-do-feed/route");
const { POST } = rota;

const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";
const FEED = "https://feed.revendamais.test/motors.xml";
const PUBLICA = "https://x.supabase.co/storage/v1/object/public/veiculos/";
/** Foto na pasta da loja no carro57, como o feed a publica (O = original, W = web). */
const DA_LOJA = (n: number, v: "web" | "zap") => `https://s3.carro57.com.br/FC/9037/81522${n}_0_${v === "web" ? "W" : "O"}_6943a8e1c8.jpeg`;
const foto = (n: number) => ({ web: DA_LOJA(n, "web"), zap: DA_LOJA(n, "zap") });
const corpoDe = (url: string) => new TextEncoder().encode(`foto:${url}`);
const lerCorpo = (corpo: unknown) => new TextDecoder().decode(corpo as Uint8Array).replace(/^foto:/, "");

/** O feed como o RevendaMais o publica: um bloco `<AD>` por anúncio. */
function xmlDoFeed(anuncios: Array<{ id: number; fotos: Array<{ web: string; zap: string }> }>): string {
  const blocos = anuncios.map(
    (a) =>
      `<AD><ID>${a.id}</ID><IMAGES>${a.fotos.map((f) => `<IMAGE_URL>${f.zap}</IMAGE_URL>`).join("")}</IMAGES>` +
      `<IMAGES_LARGE>${a.fotos.map((f) => `<IMAGE_URL_LARGE>${f.web}</IMAGE_URL_LARGE>`).join("")}</IMAGES_LARGE></AD>`,
  );
  return `<?xml version="1.0"?><ADS>${blocos.join("")}</ADS>`;
}

/** O Storage da chave de serviço: registra o que a rota pede ao balde. */
function armazenamentoDeTeste() {
  const chamadas: Array<{ op: string; bucket: string; args: unknown[] }> = [];
  let falhar: (de: string) => string | null = () => null;
  const cliente = {
    from: (bucket: string) => ({
      copy: async (...args: unknown[]) => {
        chamadas.push({ op: "copy", bucket, args });
        return { data: null, error: null };
      },
      getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${bucket}/${caminho}` } }),
      remove: async (...args: unknown[]) => {
        chamadas.push({ op: "remove", bucket, args });
        return { data: null, error: null };
      },
      upload: async (para: string, corpo: unknown, opcoes: unknown) => {
        chamadas.push({ op: "upload", bucket, args: [para, corpo, opcoes] });
        const erro = falhar(lerCorpo(corpo));
        return erro ? { data: null, error: { message: erro } } : { data: { path: para }, error: null };
      },
    }),
  };
  return {
    cliente,
    chamadas,
    falharQuando(fn: (de: string) => string | null) {
      falhar = fn;
    },
    subidas: () => chamadas.filter((c) => c.op === "upload").map((c) => ({ para: String(c.args[0]), de: lerCorpo(c.args[1]), opcoes: c.args[2] })),
    removidos: () => chamadas.filter((c) => c.op === "remove").flatMap((c) => c.args[0] as string[]),
  };
}

/** A internet do servidor, de mentira: todo pedido fica registrado, e o que não foi ensinado responde 404. */
function internetDeTeste() {
  const pedidos: Array<{ url: string; init: RequestInit | undefined }> = [];
  const rotas = new Map<string, () => Response>();
  const fetchFalso = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = entrada instanceof Request ? entrada.url : String(entrada);
    pedidos.push({ url, init });
    const fazer = rotas.get(url);
    return fazer ? fazer() : new Response("não achei", { status: 404 });
  });
  return {
    fetch: fetchFalso,
    pedidos,
    /** Os pedidos que não são a leitura do feed. */
    fotosPedidas: () => pedidos.map((p) => p.url).filter((u) => u !== FEED),
    responder(url: string, fazer: () => Response) {
      rotas.set(url, fazer);
    },
    servir(...urls: string[]) {
      for (const url of urls) {
        rotas.set(url, () => new Response(corpoDe(url), { status: 200, headers: { "content-type": "image/jpeg" } }));
      }
    },
    /** O feed com estes anúncios, e as fotos da loja de cada um servidas. */
    publicar(anuncios: Array<{ id: number; fotos: Array<{ web: string; zap: string }> }>) {
      rotas.set(FEED, () => new Response(xmlDoFeed(anuncios), { status: 200 }));
      for (const f of anuncios.flatMap((a) => a.fotos)) this.servir(f.web, f.zap);
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
}
beforeEach(() => {
  vi.stubEnv("REVENDAMAIS_FEED_URL", FEED);
  entrarComo(["marketing"]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const pedido = (corpo: unknown) =>
  new Request(`http://localhost/api/repasses/${ID}/fotos-do-feed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
const comId = (id = ID) => ({ params: Promise.resolve({ id }) });
const SEM_FOTOS = { web_full_images: [] as string[], whatsapp_images: [] as string[] };
const noBanco = (parcial: Parameters<typeof linhaDoBancoDeTeste>[0] = {}) => {
  banco.leituras.repasses = { data: linhaDoBancoDeTeste(parcial), error: null };
};
type Gravado = { web_full_images: string[]; whatsapp_images: string[] };
const gravado = () => banco.escritasEm("repasses")[0].valores as Gravado;
const destinoDa = (url: string) => balde.subidas().find((s) => s.de === url)?.para;

describe("o plano da importação do feed", () => {
  /** Uma marca por endereço, no formato que o lote aceita (letras minúsculas e números). */
  const marcaDe = (url: string) => `origem${url.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(-24)}`;
  let n = 0;
  const novoLote = () => `lote-${(n += 1)}`;
  const planejar = (fotos: Array<{ web: string; zap: string }>, jaNoRepasse: string[] = []) =>
    planejarImportacaoDoFeed({ repasseId: ID, fotos, jaNoRepasse, marcaDe, novoLote });

  it("cada foto do anúncio vira um par a baixar, em ordem, na pasta do repasse e com a marca da origem no nome", () => {
    const plano = planejar([foto(1), foto(2)]);
    expect(plano).toMatchObject({ jaEstavam: 0, ficaramDeFora: 0, acimaDoLimite: 0 });
    expect(plano.pares.map((p) => p.origem)).toEqual([
      { web: { de: "carro57", url: DA_LOJA(1, "web") }, zap: { de: "carro57", url: DA_LOJA(1, "zap") } },
      { web: { de: "carro57", url: DA_LOJA(2, "web") }, zap: { de: "carro57", url: DA_LOJA(2, "zap") } },
    ]);
    const [primeiro] = plano.pares;
    expect(primeiro.destino.web).toMatch(new RegExp(`^repasse/${ID}/rm-${marcaDe(DA_LOJA(1, "zap"))}-lote-\\d+-web\\.webp$`));
    expect(primeiro.destino.zap).toBe(primeiro.destino.web.replace("-web.webp", "-zap.jpg"));
  });

  it("a foto que já veio do feed não entra de novo: reconhecida pelo endereço gravado", () => {
    const primeira = planejar([foto(1), foto(2)]);
    const jaNoRepasse = [fotoDeTeste("enviada-a-mao"), `${PUBLICA}${primeira.pares[0].destino.web}`];
    const segunda = planejar([foto(1), foto(2), foto(3)], jaNoRepasse);
    expect(segunda.jaEstavam).toBe(1);
    expect(segunda.pares.map((p) => p.origem.zap)).toEqual([
      { de: "carro57", url: DA_LOJA(2, "zap") },
      { de: "carro57", url: DA_LOJA(3, "zap") },
    ]);
  });

  it("a marca só vale na pasta DESTE repasse", () => {
    const outro = "11111111-2222-4333-8444-555555555555";
    const url = `${PUBLICA}repasse/${outro}/rm-abcdef0123456789-x-web.webp`;
    expect(marcasDoFeedNoRepasse(ID, [url]).size).toBe(0);
    expect([...marcasDoFeedNoRepasse(outro, [url])]).toEqual(["abcdef0123456789"]);
  });

  it("a mesma foto duas vezes no anúncio entra uma vez", () => {
    expect(planejar([foto(1), foto(1)]).pares).toHaveLength(1);
  });

  it("endereço fora da pasta da loja fica de fora e não vira par", () => {
    const plano = planejar([
      foto(1),
      { web: "https://s3.carro57.com.br/FC/1234/x_W.jpeg", zap: "https://s3.carro57.com.br/FC/1234/x_O.jpeg" },
      { web: DA_LOJA(3, "web"), zap: "http://169.254.169.254/latest/meta-data" },
    ]);
    expect(plano.pares).toHaveLength(1);
    expect(plano.ficaramDeFora).toBe(2);
  });

  it("o teto conta o que o repasse já tem: o que passa dele não é baixado", () => {
    const jaNoRepasse = Array.from({ length: LIMITE_DE_FOTOS_DO_REPASSE - 2 }, (_, i) => fotoDeTeste(`tem-${i}`));
    const plano = planejar([foto(1), foto(2), foto(3), foto(4), foto(5)], jaNoRepasse);
    expect(plano.pares).toHaveLength(2);
    expect(plano.acimaDoLimite).toBe(3);
  });
});

describe("o portão da importação do feed", () => {
  const agora = new Date("2026-10-06T12:00:00Z");
  const decidir = (parcial: Parameters<typeof repasseDeTeste>[0], perfis: string[], corpo: unknown = { estoqueId: 4321 }) =>
    decidirImportacaoDoFeed({ repasse: repasseDeTeste(parcial), perfis: perfis as never, corpo, agora });

  it("no rascunho, quem cadastra; fora dele, só quem valida; vendido e arquivado, ninguém", () => {
    expect(decidir({}, ["marketing"])).toEqual({ ok: true, estoqueId: 4321 });
    expect(decidir({ situacao: "publicado", lojistas_desde: "2026-09-24T12:00:00Z" }, ["marketing"])).toMatchObject({ ok: false, status: 403 });
    expect(decidir({ situacao: "publicado", lojistas_desde: "2026-09-24T12:00:00Z" }, ["admin"])).toEqual({ ok: true, estoqueId: 4321 });
    expect(decidir({ situacao: "vendido" }, ["admin"])).toMatchObject({ ok: false, status: 409 });
    expect(decidir({ situacao: "arquivado" }, ["admin"])).toMatchObject({ ok: false, status: 409 });
  });

  it("o corpo diz só qual carro: sem id inteiro e positivo, 400", () => {
    for (const corpo of [null, {}, { estoqueId: "4321" }, { estoqueId: 0 }, { estoqueId: -3 }, { estoqueId: 1.5 }, { url: DA_LOJA(1, "web") }]) {
      expect(decidir({}, ["admin"], corpo), JSON.stringify(corpo)).toMatchObject({ ok: false, status: 400 });
    }
  });

  it("galeria cheia: 409, antes de qualquer pedido", () => {
    const cheia = Array.from({ length: LIMITE_DE_FOTOS_DO_REPASSE }, (_, i) => fotoDeTeste(`f-${i}`));
    const r = decidir({ web_full_images: cheia, whatsapp_images: cheia.map((u) => u.replace("-web.webp", "-zap.jpg")) }, ["admin"]);
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(r.ok === false && r.erro).toContain(`${LIMITE_DE_FOTOS_DO_REPASSE} fotos`);
  });
});

describe("o que a tela diz depois da importação", () => {
  const zero = { vieram: 0, jaEstavam: 0, ficaramDeFora: 0, acimaDoLimite: 0, falharam: 0 };

  it("singular e plural de verdade", () => {
    expect(resumoDaImportacao({ ...zero, vieram: 1 })).toEqual({ tipo: "ok", texto: "1 foto veio do RevendaMais." });
    expect(resumoDaImportacao({ ...zero, vieram: 12 })).toEqual({ tipo: "ok", texto: "12 fotos vieram do RevendaMais." });
    expect(resumoDaImportacao({ ...zero, vieram: 3, jaEstavam: 1 }).texto).toBe("3 fotos vieram do RevendaMais. 1 já estava na galeria.");
    expect(resumoDaImportacao({ ...zero, vieram: 3, jaEstavam: 2 }).texto).toBe("3 fotos vieram do RevendaMais. 2 já estavam na galeria.");
  });

  it("nada a trazer não é erro", () => {
    expect(resumoDaImportacao({ ...zero, jaEstavam: 1 })).toEqual({ tipo: "ok", texto: "Nenhuma foto nova: a foto do anúncio já está na galeria." });
    expect(resumoDaImportacao({ ...zero, jaEstavam: 9 })).toEqual({
      tipo: "ok",
      texto: "Nenhuma foto nova: as 9 fotos do anúncio já estão na galeria.",
    });
  });

  it("o que não veio é dito; nenhuma vindo, é erro", () => {
    expect(resumoDaImportacao({ ...zero, vieram: 2, falharam: 1 })).toEqual({
      tipo: "ok",
      texto: "2 fotos vieram do RevendaMais. 1 não veio. Importe de novo para tentar as que faltam.",
    });
    expect(resumoDaImportacao({ ...zero, falharam: 4 })).toEqual({
      tipo: "erro",
      texto: "Nenhuma foto veio do RevendaMais. 4 não vieram. Importe de novo para tentar as que faltam.",
    });
    expect(resumoDaImportacao({ ...zero, vieram: 2, acimaDoLimite: 1 }).texto).toContain("1 passa do limite de 40 fotos do repasse.");
    expect(resumoDaImportacao({ ...zero, ficaramDeFora: 2 })).toEqual({
      tipo: "erro",
      texto: "Nenhuma foto veio do RevendaMais. 2 ficaram de fora, por não estar no endereço da loja.",
    });
  });

  it("sem travessão, sem '(s)' e sem 'Recarregue'", () => {
    for (const r of [zero, { ...zero, vieram: 1, jaEstavam: 1, ficaramDeFora: 1, acimaDoLimite: 1, falharam: 1 }, { ...zero, jaEstavam: 2 }]) {
      const { texto } = resumoDaImportacao(r);
      expect(texto).not.toMatch(/[—–]|\(s\)|recarregue/i);
    }
  });
});

describe("o carro da busca do repasse, como o seletor o desenha", () => {
  it("nome com ano, quilometragem e a situação", () => {
    const base = {
      id: 4321,
      marca: "Volkswagen",
      modelo: "Gol",
      versao: "Trendline",
      ano: 2019,
      ano_fabricacao: 2018,
      quilometragem: 64000,
      cambio: null,
      combustivel: null,
      cor: null,
      tipo: null,
      carroceria: null,
      codigo_fipe: null,
      foto: null,
      fotosCopiaveis: 0,
      fotosDeFora: 0,
    };
    expect(carroDoRepasseNaBusca({ ...base, situacao: "vendido" })).toEqual({
      id: 4321,
      rotulo: "Volkswagen Gol Trendline 2019",
      ano: 2019,
      km: 64000,
      vendido: true,
      publicado: false,
    });
    expect(carroDoRepasseNaBusca({ ...base, situacao: "publicado" })).toMatchObject({ vendido: false, publicado: true });
  });
});

describe("POST /api/repasses/[id]/fotos-do-feed — quem pode", () => {
  beforeEach(() => {
    noBanco(SEM_FOTOS);
    internet.publicar([{ id: 4321, fotos: [foto(1)] }]);
  });
  const nadaAconteceu = () => {
    expect(internet.pedidos).toEqual([]);
    expect(balde.chamadas).toEqual([]);
    expect(banco.escritas).toEqual([]);
  };

  it("sem login: 401, sem ler o feed, sem baixar e sem gravar", async () => {
    entrarComo(["marketing"], null);
    expect((await POST(pedido({ estoqueId: 4321 }), comId())).status).toBe(401);
    nadaAconteceu();
  });

  it("quem não é da equipe: 403", async () => {
    entrarComo(["cliente"]);
    noBanco(SEM_FOTOS);
    expect((await POST(pedido({ estoqueId: 4321 }), comId())).status).toBe(403);
    nadaAconteceu();
  });

  it("rascunho: quem cadastra importa (marketing inclusive)", async () => {
    expect((await POST(pedido({ estoqueId: 4321 }), comId())).status).toBe(200);
    expect(banco.escritasEm("repasses")).toHaveLength(1);
  });

  it("fora do rascunho, quem não valida: 403 com a frase da edição, e nada é pedido", async () => {
    noBanco({ situacao: "publicado", lojistas_desde: "2026-09-24T12:00:00Z" });
    const res = await POST(pedido({ estoqueId: 4321 }), comId());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("só quem valida edita");
    nadaAconteceu();
  });

  it("vendido ou arquivado: 409, e nada é pedido", async () => {
    entrarComo(["admin"]);
    noBanco({ situacao: "arquivado" });
    expect((await POST(pedido({ estoqueId: 4321 }), comId())).status).toBe(409);
    nadaAconteceu();
  });

  it("id que não é uuid ou repasse que não existe: 404", async () => {
    expect((await POST(pedido({ estoqueId: 4321 }), comId("../x"))).status).toBe(404);
    banco.leituras.repasses = { data: null, error: null };
    expect((await POST(pedido({ estoqueId: 4321 }), comId())).status).toBe(404);
    nadaAconteceu();
  });
});

describe("POST /api/repasses/[id]/fotos-do-feed — o que o servidor pede", () => {
  beforeEach(() => noBanco(SEM_FOTOS));

  it("o corpo não escolhe endereço: sem estoqueId válido é 400, e url no corpo nunca é pedida", async () => {
    const intrusa = "http://169.254.169.254/latest/meta-data";
    internet.publicar([{ id: 4321, fotos: [foto(1)] }]);
    expect((await POST(pedido({ url: intrusa, fotos: [intrusa] }), comId())).status).toBe(400);
    expect(internet.pedidos).toEqual([]);

    expect((await POST(pedido({ estoqueId: 4321, url: intrusa, fotos: [{ web: intrusa, zap: intrusa }] }), comId())).status).toBe(200);
    expect(internet.pedidos.map((p) => p.url)).not.toContain(intrusa);
    expect(internet.fotosPedidas().sort()).toEqual([DA_LOJA(1, "web"), DA_LOJA(1, "zap")].sort());
  });

  it("só a pasta da loja no carro57 é pedida, mesmo que o feed traga outro endereço", async () => {
    const proibidas = [
      { web: "https://evil.example/FC/9037/a_W.jpeg", zap: "https://evil.example/FC/9037/a_O.jpeg" },
      { web: "https://s3.carro57.com.br/FC/1111/b_W.jpeg", zap: "https://s3.carro57.com.br/FC/1111/b_O.jpeg" },
      { web: "http://s3.carro57.com.br/FC/9037/c_W.jpeg", zap: "http://s3.carro57.com.br/FC/9037/c_O.jpeg" },
      { web: "https://s3.carro57.com.br.evil.example/FC/9037/d_W.jpeg", zap: DA_LOJA(7, "zap") },
    ];
    internet.publicar([{ id: 4321, fotos: [...proibidas, foto(1)] }]);
    const res = await POST(pedido({ estoqueId: 4321 }), comId());
    expect(await res.json()).toMatchObject({ vieram: 1, ficaramDeFora: 4, falharam: 0 });
    expect(internet.fotosPedidas().sort()).toEqual([DA_LOJA(1, "web"), DA_LOJA(1, "zap")].sort());
    for (const p of internet.pedidos.filter((x) => x.url !== FEED)) expect(p.init?.redirect).toBe("manual");
  });

  it("redirecionamento não é seguido: a foto falha e o destino nunca é pedido", async () => {
    const destino = "http://10.0.0.1/interno";
    internet.publicar([{ id: 4321, fotos: [foto(1), foto(2)] }]);
    internet.responder(DA_LOJA(1, "web"), () => new Response(null, { status: 302, headers: { location: destino } }));
    const res = await POST(pedido({ estoqueId: 4321 }), comId());
    expect(await res.json()).toMatchObject({ vieram: 1, falharam: 1 });
    expect(internet.pedidos.map((p) => p.url)).not.toContain(destino);
    expect(falhas).toHaveBeenCalledTimes(1);
  });

  it("o que não é imagem não sobe", async () => {
    internet.publicar([{ id: 4321, fotos: [foto(1)] }]);
    internet.responder(DA_LOJA(1, "zap"), () => new Response("<html>erro</html>", { status: 200, headers: { "content-type": "text/html" } }));
    const res = await POST(pedido({ estoqueId: 4321 }), comId());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ vieram: 0, falharam: 1 });
    expect(balde.subidas()).toEqual([]);
    expect(banco.escritasEm("repasses")).toEqual([]);
  });

  it("lê o anúncio do carro escolhido, e não o do vizinho", async () => {
    internet.publicar([
      { id: 1111, fotos: [foto(8), foto(9)] },
      { id: 4321, fotos: [foto(1)] },
    ]);
    await POST(pedido({ estoqueId: 4321 }), comId());
    expect(internet.fotosPedidas().sort()).toEqual([DA_LOJA(1, "web"), DA_LOJA(1, "zap")].sort());
  });
});

describe("POST /api/repasses/[id]/fotos-do-feed — onde a foto termina", () => {
  it("no nosso bucket, em repasse/<id>/, par no mesmo lote, com o carimbo de 1 ano; a lista leva só endereço nosso", async () => {
    noBanco(SEM_FOTOS);
    internet.publicar([{ id: 4321, fotos: [foto(1), foto(2)] }]);
    const res = await POST(pedido({ estoqueId: 4321 }), comId());
    expect(res.status).toBe(200);

    const subidas = balde.subidas();
    expect(subidas).toHaveLength(4);
    for (const s of subidas) {
      expect(s.para.startsWith(`repasse/${ID}/rm-`)).toBe(true);
      expect(s.opcoes).toEqual({ contentType: "image/jpeg", upsert: false, cacheControl: "31536000" });
    }
    expect(balde.chamadas.every((c) => c.bucket === "veiculos" && c.op === "upload")).toBe(true);
    expect(destinoDa(DA_LOJA(1, "web"))).toMatch(/-web\.webp$/);
    expect(destinoDa(DA_LOJA(1, "zap"))).toBe(destinoDa(DA_LOJA(1, "web"))!.replace("-web.webp", "-zap.jpg"));

    // Na ordem do anúncio: a primeira de lá é a capa da galeria que estava vazia.
    expect(gravado().web_full_images).toEqual([1, 2].map((n) => `${PUBLICA}${destinoDa(DA_LOJA(n, "web"))}`));
    expect(gravado().whatsapp_images).toEqual([1, 2].map((n) => `${PUBLICA}${destinoDa(DA_LOJA(n, "zap"))}`));
    expect(JSON.stringify(gravado())).not.toContain("carro57");
    // Só as duas listas: a ficha de estado não entra na gravação.
    expect(Object.keys(gravado()).sort()).toEqual(["web_full_images", "whatsapp_images"]);

    const corpo = await res.json();
    expect(corpo).toMatchObject({ vieram: 2, jaEstavam: 0, ficaramDeFora: 0, acimaDoLimite: 0, falharam: 0 });
    expect(corpo.web_full_images).toEqual(gravado().web_full_images);
    expect(banco.auditoria()[0].acao).toBe("repasse.fotos-do-feed");
  });

  it("soma depois das fotos que já estão: a capa não muda, e a gravação fica presa ao carro lido", async () => {
    noBanco();
    const antes = repasseDeTeste();
    internet.publicar([{ id: 4321, fotos: [foto(1)] }]);
    expect((await POST(pedido({ estoqueId: 4321 }), comId())).status).toBe(200);
    expect(gravado().web_full_images.slice(0, 4)).toEqual(antes.web_full_images);
    expect(gravado().whatsapp_images.slice(0, 4)).toEqual(antes.whatsapp_images);
    expect(gravado().web_full_images).toHaveLength(5);
    expect(banco.escritasEm("repasses")[0].filtros).toEqual([
      ["id", ID],
      ["situacao", "rascunho"],
      ["updated_at", "2026-09-24T12:00:00Z"],
    ]);
  });

  it("o carro mudou no meio: 409, e o que subiu sai do bucket", async () => {
    noBanco(SEM_FOTOS);
    internet.publicar([{ id: 4321, fotos: [foto(1)] }]);
    banco.responderEscrita(() => ({ data: null, error: null }));
    expect((await POST(pedido({ estoqueId: 4321 }), comId())).status).toBe(409);
    expect(balde.removidos().sort()).toEqual(balde.subidas().map((s) => s.para).sort());
    expect(banco.auditoria()).toEqual([]);
  });
});

describe("POST /api/repasses/[id]/fotos-do-feed — repetição, teto e nada a trazer", () => {
  it("importar duas vezes não duplica: a segunda não baixa nem grava", async () => {
    noBanco(SEM_FOTOS);
    internet.publicar([{ id: 4321, fotos: [foto(1), foto(2)] }]);
    expect((await POST(pedido({ estoqueId: 4321 }), comId())).status).toBe(200);
    const fotosDaPrimeira = internet.fotosPedidas().length;
    const primeira = gravado();
    banco.leituras.repasses = { data: { ...linhaDoBancoDeTeste(SEM_FOTOS), ...primeira }, error: null };

    const segunda = await POST(pedido({ estoqueId: 4321 }), comId());
    expect(segunda.status).toBe(200);
    expect(await segunda.json()).toEqual({
      vieram: 0,
      jaEstavam: 2,
      ficaramDeFora: 0,
      acimaDoLimite: 0,
      falharam: 0,
      web_full_images: primeira.web_full_images,
      whatsapp_images: primeira.whatsapp_images,
    });
    expect(internet.fotosPedidas()).toHaveLength(fotosDaPrimeira);
    expect(banco.escritasEm("repasses")).toHaveLength(1);
  });

  it("o anúncio ganhou uma foto: só a nova vem, depois das que já estavam", async () => {
    noBanco(SEM_FOTOS);
    internet.publicar([{ id: 4321, fotos: [foto(1)] }]);
    await POST(pedido({ estoqueId: 4321 }), comId());
    const primeira = gravado();
    banco.leituras.repasses = { data: { ...linhaDoBancoDeTeste(SEM_FOTOS), ...primeira }, error: null };
    internet.publicar([{ id: 4321, fotos: [foto(1), foto(2)] }]);

    const res = await POST(pedido({ estoqueId: 4321 }), comId());
    expect(await res.json()).toMatchObject({ vieram: 1, jaEstavam: 1 });
    const segunda = banco.escritasEm("repasses")[1].valores as Gravado;
    expect(segunda.web_full_images).toEqual([primeira.web_full_images[0], `${PUBLICA}${destinoDa(DA_LOJA(2, "web"))}`]);
  });

  it("teto de 40: só o que cabe é baixado, e o resto é contado", async () => {
    const tem = Array.from({ length: LIMITE_DE_FOTOS_DO_REPASSE - 1 }, (_, i) => `t${i}`);
    noBanco({ web_full_images: tem.map((l) => fotoDeTeste(l)), whatsapp_images: tem.map((l) => fotoDeTeste(l, "zap")) });
    internet.publicar([{ id: 4321, fotos: [foto(1), foto(2), foto(3)] }]);
    const res = await POST(pedido({ estoqueId: 4321 }), comId());
    expect(await res.json()).toMatchObject({ vieram: 1, acimaDoLimite: 2 });
    expect(internet.fotosPedidas().sort()).toEqual([DA_LOJA(1, "web"), DA_LOJA(1, "zap")].sort());
    expect(gravado().web_full_images).toHaveLength(LIMITE_DE_FOTOS_DO_REPASSE);
  });

  it("galeria cheia: 409, sem ler o feed", async () => {
    const tem = Array.from({ length: LIMITE_DE_FOTOS_DO_REPASSE }, (_, i) => `t${i}`);
    noBanco({ web_full_images: tem.map((l) => fotoDeTeste(l)), whatsapp_images: tem.map((l) => fotoDeTeste(l, "zap")) });
    internet.publicar([{ id: 4321, fotos: [foto(1)] }]);
    expect((await POST(pedido({ estoqueId: 4321 }), comId())).status).toBe(409);
    expect(internet.pedidos).toEqual([]);
  });

  it("carro que não está no feed: 404, nada muda", async () => {
    noBanco(SEM_FOTOS);
    internet.publicar([{ id: 1111, fotos: [foto(1)] }]);
    const res = await POST(pedido({ estoqueId: 4321 }), comId());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("não está no feed do RevendaMais");
    expect(internet.fotosPedidas()).toEqual([]);
    expect(banco.escritas).toEqual([]);
  });

  it("anúncio sem foto no feed: 422, nada muda", async () => {
    noBanco(SEM_FOTOS);
    internet.publicar([{ id: 4321, fotos: [] }]);
    const res = await POST(pedido({ estoqueId: 4321 }), comId());
    expect(res.status).toBe(422);
    expect(banco.escritas).toEqual([]);
  });

  it("feed fora do ar ou sem endereço configurado: 502 com o motivo, nada muda", async () => {
    noBanco(SEM_FOTOS);
    internet.responder(FEED, () => new Response("fora", { status: 503 }));
    const fora = await POST(pedido({ estoqueId: 4321 }), comId());
    expect(fora.status).toBe(502);
    expect((await fora.json()).error).toContain("503");

    vi.stubEnv("REVENDAMAIS_FEED_URL", "");
    const semEndereco = await POST(pedido({ estoqueId: 4321 }), comId());
    expect(semEndereco.status).toBe(502);
    expect((await semEndereco.json()).error).toContain("REVENDAMAIS_FEED_URL");
    expect(banco.escritas).toEqual([]);
    expect(balde.chamadas).toEqual([]);
  });

  it("as fotos de defeito da ficha de estado ficam como estão", async () => {
    noBanco();
    internet.publicar([{ id: 4321, fotos: [foto(1)] }]);
    await POST(pedido({ estoqueId: 4321 }), comId());
    expect(gravado()).not.toHaveProperty("itens_de_estado");
    expect(balde.removidos()).toEqual([]);
  });

  it("a rota tem 60 s, como a cópia do estoque", () => {
    expect(rota.maxDuration).toBe(60);
  });
});
