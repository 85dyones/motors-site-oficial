import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  aplicarAcaoNoMeta,
  aplicarAprovadasNoMeta,
  configDaAplicacaoMeta,
  linhaParaAcaoDoMeta,
  mensagemDoErroDeGestao,
  type AcaoDoMeta,
  type ConfigDaAplicacaoMeta,
} from "../src/lib/copilotoMeta-aplicar";

/**
 * O executor do Copiloto do Meta: confere a conta e o estado antes de mexer,
 * aplica pelo Graph, lê de volta, e nunca põe o token na URL nem no corpo.
 */

const CFG: ConfigDaAplicacaoMeta = { token: "TOKEN-SECRETO", versao: "v21.0", conta: "802008949148808" };

type Chamada = { url: string; metodo: string; corpo: string | null; auth: string | null };

/** Um Graph de mentira: um estado por objeto, GET devolve os campos, POST muda. */
function graphFalso(objetos: Record<string, Record<string, unknown>>, opcoes: { ignorarPost?: boolean; erro?: { code: number; message: string } } = {}) {
  const chamadas: Chamada[] = [];
  const buscar = vi.fn(async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = String(entrada);
    const metodo = init?.method ?? "GET";
    const corpo = typeof init?.body === "string" ? init.body : null;
    const auth = new Headers(init?.headers).get("authorization");
    chamadas.push({ url, metodo, corpo, auth });
    if (opcoes.erro) return new Response(JSON.stringify({ error: opcoes.erro }), { status: 400 });
    // "S1" (o objeto) ou "C1/adsets" (a lista dos filhos, devolvida como está).
    const caminho = new URL(url).pathname.replace(/^\/v[\d.]+\//, "");
    const obj = objetos[caminho];
    if (!obj) return new Response(JSON.stringify({ error: { code: 100, message: "Unsupported get request" } }), { status: 400 });
    if (metodo === "POST") {
      if (!opcoes.ignorarPost) for (const [k, v] of new URLSearchParams(corpo ?? "")) obj[k] = v;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (caminho.includes("/")) return new Response(JSON.stringify(obj), { status: 200 });
    const campos = new URL(url).searchParams.get("fields")?.split(",") ?? [];
    return new Response(JSON.stringify(Object.fromEntries(campos.map((c) => [c, obj[c]]).filter(([, v]) => v !== undefined))), { status: 200 });
  });
  return { buscar: buscar as unknown as typeof fetch, chamadas };
}

/** Os irmãos na conta: a campanha C1 tem dois conjuntos ativos, e o conjunto S1 dois anúncios ativos. */
const IRMAOS = {
  "C1/adsets": { data: [{ id: "S1", effective_status: "ACTIVE" }, { id: "S2", effective_status: "ACTIVE" }] },
  "S1/ads": { data: [{ id: "A1", effective_status: "ACTIVE" }, { id: "A2", effective_status: "ACTIVE" }] },
};

const pausarConjunto: AcaoDoMeta = { id: "acao-1", tipo: "pausar_conjunto", campanhaId: "C1", conjuntoId: "S1", anuncioId: null, verbaAtual: null, verbaNova: null };
const pausarAnuncio: AcaoDoMeta = { id: "acao-2", tipo: "pausar_anuncio", campanhaId: "C1", conjuntoId: "S1", anuncioId: "A1", verbaAtual: null, verbaNova: null };
const cortarVerba: AcaoDoMeta = { id: "acao-3", tipo: "mudar_verba", campanhaId: "C1", conjuntoId: null, anuncioId: null, verbaAtual: 100, verbaNova: 80 };

describe("aplicarAcaoNoMeta — pausar e reativar", () => {
  it("pausa o conjunto, lê de volta e chama de aplicada", async () => {
    const objetos = { ...IRMAOS, S1: { account_id: "802008949148808", campaign_id: "C1", status: "ACTIVE", effective_status: "ACTIVE" } };
    const { buscar, chamadas } = graphFalso(objetos);
    const r = await aplicarAcaoNoMeta(pausarConjunto, CFG, buscar);
    expect(r).toEqual({ id: "acao-1", situacao: "aplicada", lido: { status: "PAUSED", situacaoEfetiva: "ACTIVE" }, erro: null });
    expect(chamadas.map((c) => c.metodo)).toEqual(["GET", "GET", "POST", "GET"]);
    expect(chamadas[1].url).toBe("https://graph.facebook.com/v21.0/C1/adsets?fields=id,effective_status&limit=200");
    expect(chamadas[2]).toMatchObject({ url: "https://graph.facebook.com/v21.0/S1", corpo: "status=PAUSED" });
  });

  it("o último conjunto ativo da campanha não é pausado", async () => {
    const { buscar, chamadas } = graphFalso({
      "C1/adsets": { data: [{ id: "S1", effective_status: "ACTIVE" }, { id: "S2", effective_status: "PAUSED" }] },
      S1: { account_id: "802008949148808", campaign_id: "C1", status: "ACTIVE" },
    });
    const r = await aplicarAcaoNoMeta(pausarConjunto, CFG, buscar);
    expect(r).toMatchObject({ situacao: "falhou", erro: "É o último conjunto ativo da campanha: pausar pararia a campanha. Nada foi mudado." });
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false);
  });

  it("o último anúncio ativo do conjunto não é pausado", async () => {
    const { buscar, chamadas } = graphFalso({
      "S1/ads": { data: [{ id: "A1", effective_status: "ACTIVE" }] },
      A1: { account_id: "802008949148808", campaign_id: "C1", status: "ACTIVE" },
    });
    const r = await aplicarAcaoNoMeta(pausarAnuncio, CFG, buscar);
    expect(r.erro).toBe("É o último anúncio ativo do conjunto: pausar pararia o conjunto. Nada foi mudado.");
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false);
  });

  it("o token vai só no cabeçalho", async () => {
    const { buscar, chamadas } = graphFalso({ ...IRMAOS, A1: { account_id: "802008949148808", campaign_id: "C1", status: "ACTIVE" } });
    await aplicarAcaoNoMeta(pausarAnuncio, CFG, buscar);
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(true);
    for (const c of chamadas) {
      expect(c.auth).toBe("Bearer TOKEN-SECRETO");
      expect(c.url).not.toContain("TOKEN-SECRETO");
      expect(c.corpo ?? "").not.toContain("TOKEN-SECRETO");
    }
  });

  it("já pausado: sem efeito, sem POST", async () => {
    const { buscar, chamadas } = graphFalso({ A1: { account_id: "802008949148808", campaign_id: "C1", status: "PAUSED" } });
    const r = await aplicarAcaoNoMeta(pausarAnuncio, CFG, buscar);
    expect(r).toMatchObject({ situacao: "sem_efeito", lido: { status: "PAUSED" } });
    expect(chamadas.every((c) => c.metodo === "GET")).toBe(true);
  });

  it("reativar manda ACTIVE", async () => {
    const { buscar, chamadas } = graphFalso({ S1: { account_id: "802008949148808", campaign_id: "C1", status: "PAUSED" } });
    const r = await aplicarAcaoNoMeta({ ...pausarConjunto, tipo: "reativar_conjunto" }, CFG, buscar);
    expect(r.situacao).toBe("aplicada");
    expect(chamadas[1].corpo).toBe("status=ACTIVE");
  });

  it("objeto de outra conta: falha sem mexer", async () => {
    const { buscar, chamadas } = graphFalso({ S1: { account_id: "999", campaign_id: "C1", status: "ACTIVE" } });
    const r = await aplicarAcaoNoMeta(pausarConjunto, CFG, buscar);
    expect(r).toMatchObject({ situacao: "falhou" });
    expect(r.erro).toContain("não é da conta act_802008949148808");
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false);
  });

  it("objeto de outra campanha: falha sem mexer", async () => {
    const { buscar, chamadas } = graphFalso({ S1: { account_id: "802008949148808", campaign_id: "C9", status: "ACTIVE" } });
    const r = await aplicarAcaoNoMeta(pausarConjunto, CFG, buscar);
    expect(r.erro).toContain("não é da campanha C1");
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false);
  });

  it("apagado ou arquivado: falha sem mexer", async () => {
    const { buscar, chamadas } = graphFalso({ S1: { account_id: "802008949148808", campaign_id: "C1", status: "ARCHIVED" } });
    const r = await aplicarAcaoNoMeta({ ...pausarConjunto, tipo: "reativar_conjunto" }, CFG, buscar);
    expect(r.erro).toContain("arquivado");
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false);
  });

  it("o Meta aceita mas não muda: falha com o que leu", async () => {
    const { buscar } = graphFalso({ ...IRMAOS, S1: { account_id: "802008949148808", campaign_id: "C1", status: "ACTIVE" } }, { ignorarPost: true });
    const r = await aplicarAcaoNoMeta(pausarConjunto, CFG, buscar);
    expect(r).toMatchObject({ situacao: "falhou", lido: { status: "ACTIVE" } });
    expect(r.erro).toContain("lido de volta é ACTIVE");
  });

  it("ação sem o alvo: falha sem chamar o Meta", async () => {
    const { buscar, chamadas } = graphFalso({});
    const r = await aplicarAcaoNoMeta({ ...pausarAnuncio, anuncioId: null }, CFG, buscar);
    expect(r.situacao).toBe("falhou");
    expect(chamadas).toHaveLength(0);
  });

  it("verbo do Google: falha sem chamar o Meta", async () => {
    const { buscar, chamadas } = graphFalso({});
    const r = await aplicarAcaoNoMeta({ ...pausarConjunto, tipo: "negativar" }, CFG, buscar);
    expect(r.erro).toContain('não sabe aplicar "negativar"');
    expect(chamadas).toHaveLength(0);
  });
});

describe("aplicarAcaoNoMeta — verba", () => {
  it("muda a verba em centavos e lê de volta", async () => {
    const objetos = { C1: { account_id: "802008949148808", status: "ACTIVE", daily_budget: "10000" } };
    const { buscar, chamadas } = graphFalso(objetos);
    const r = await aplicarAcaoNoMeta(cortarVerba, CFG, buscar);
    expect(r).toEqual({ id: "acao-3", situacao: "aplicada", lido: { verba: 80 }, erro: null });
    expect(chamadas[1]).toMatchObject({ metodo: "POST", corpo: "daily_budget=8000" });
  });

  it("a verba já é a nova: sem efeito", async () => {
    const { buscar, chamadas } = graphFalso({ C1: { account_id: "802008949148808", status: "ACTIVE", daily_budget: "8000" } });
    const r = await aplicarAcaoNoMeta(cortarVerba, CFG, buscar);
    expect(r).toMatchObject({ situacao: "sem_efeito", lido: { verba: 80 } });
    expect(chamadas).toHaveLength(1);
  });

  it("a verba mudou desde a proposta: falha sem mexer", async () => {
    const { buscar, chamadas } = graphFalso({ C1: { account_id: "802008949148808", status: "ACTIVE", daily_budget: "15000" } });
    const r = await aplicarAcaoNoMeta(cortarVerba, CFG, buscar);
    expect(r).toMatchObject({ situacao: "falhou", lido: { verba: 150 } });
    expect(r.erro).toContain("mudou desde a proposta");
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false);
  });

  it("verba nos conjuntos (sem daily_budget na campanha): falha sem mexer", async () => {
    const { buscar, chamadas } = graphFalso({ C1: { account_id: "802008949148808", status: "ACTIVE" } });
    const r = await aplicarAcaoNoMeta(cortarVerba, CFG, buscar);
    expect(r.erro).toContain("fica nos conjuntos");
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false);
  });

  it("acima de 10× a verba de agora: falha sem mexer", async () => {
    const { buscar, chamadas } = graphFalso({ C1: { account_id: "802008949148808", status: "ACTIVE", daily_budget: "1000" } });
    const r = await aplicarAcaoNoMeta({ ...cortarVerba, verbaAtual: 10, verbaNova: 200 }, CFG, buscar);
    expect(r.erro).toContain("10×");
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false);
  });
});

describe("os erros do Graph", () => {
  it("viram frase sem o token", async () => {
    const { buscar } = graphFalso({}, { erro: { code: 190, message: "Error validating access token: TOKEN-SECRETO" } });
    const r = await aplicarAcaoNoMeta(pausarConjunto, CFG, buscar);
    expect(r.situacao).toBe("falhou");
    expect(r.erro).toBe("token de gestão do Meta inválido ou expirado — gere outro no usuário do sistema");
  });

  it("permissão, limite e o resto", () => {
    expect(mensagemDoErroDeGestao({ code: 200 }, "1")).toContain("ads_management na conta act_1");
    expect(mensagemDoErroDeGestao({ code: 17 }, "1")).toContain("limite de chamadas");
    expect(mensagemDoErroDeGestao({ code: 100, error_user_msg: "Orçamento abaixo do mínimo" }, "1")).toBe("Meta respondeu: Orçamento abaixo do mínimo");
  });

  it("a rede caindo vira falha, não exceção", async () => {
    const buscar = vi.fn(async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch;
    const r = await aplicarAcaoNoMeta(pausarConjunto, CFG, buscar);
    expect(r).toMatchObject({ situacao: "falhou", erro: "Falha ao falar com o Meta: fetch failed" });
  });
});

describe("configDaAplicacaoMeta", () => {
  const antes = { ...process.env };
  afterEach(() => {
    process.env = { ...antes };
  });

  it("sem o token, diz qual variável falta", () => {
    delete process.env.META_ADS_MANAGEMENT_TOKEN;
    process.env.META_GRAPH_API_VERSION = "v21.0";
    expect(configDaAplicacaoMeta()).toEqual({ erro: "falta o token de gestão do Meta (META_ADS_MANAGEMENT_TOKEN)" });
  });

  it("tira o act_ da conta e usa a da loja por padrão", () => {
    process.env.META_ADS_MANAGEMENT_TOKEN = " t ";
    process.env.META_GRAPH_API_VERSION = "v21.0";
    process.env.META_AD_ACCOUNT_ID = "act_123";
    expect(configDaAplicacaoMeta()).toEqual({ token: "t", versao: "v21.0", conta: "123" });
    delete process.env.META_AD_ACCOUNT_ID;
    expect(configDaAplicacaoMeta()).toMatchObject({ conta: "802008949148808" });
  });

  it("versão fora da forma vNN.N", () => {
    process.env.META_ADS_MANAGEMENT_TOKEN = "t";
    process.env.META_GRAPH_API_VERSION = "21";
    expect(configDaAplicacaoMeta()).toHaveProperty("erro");
  });
});

describe("linhaParaAcaoDoMeta", () => {
  it("lê a linha da reserva", () => {
    expect(
      linhaParaAcaoDoMeta({
        id: "x",
        tipo: "mudar_verba",
        campanha_id_externo: "C1",
        grupo_id_externo: null,
        anuncio_id_externo: null,
        verba_atual: "100.00",
        verba_nova: "80",
      }),
    ).toEqual({ id: "x", tipo: "mudar_verba", campanhaId: "C1", conjuntoId: null, anuncioId: null, verbaAtual: 100, verbaNova: 80 });
  });
});

describe("aplicarAprovadasNoMeta — a rodada", () => {
  const antes = { ...process.env };
  beforeEach(() => {
    process.env.META_ADS_MANAGEMENT_TOKEN = "TOKEN-SECRETO";
    process.env.META_GRAPH_API_VERSION = "v21.0";
    delete process.env.META_AD_ACCOUNT_ID;
  });
  afterEach(() => {
    process.env = { ...antes };
  });

  function adminFalso(reservadas: Array<Record<string, unknown>>) {
    const rpc = vi.fn(async (nome: string, args: Record<string, unknown>) => {
      if (nome === "midia_copiloto_reservar_acoes_meta") return { data: reservadas, error: null };
      // O banco devolve a situação gravada.
      if (nome === "midia_copiloto_registrar_resultado") return { data: args.p_situacao, error: null };
      return { data: null, error: { message: `rpc inesperada ${nome}` } };
    });
    return { admin: { rpc } as never, rpc };
  }

  it("sem o token não reserva nada", async () => {
    delete process.env.META_ADS_MANAGEMENT_TOKEN;
    const { admin, rpc } = adminFalso([]);
    const r = await aplicarAprovadasNoMeta(admin);
    expect(r).toMatchObject({ feito: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reserva até 10, aplica uma por uma e registra", async () => {
    const { admin, rpc } = adminFalso([
      { id: "acao-1", tipo: "pausar_conjunto", campanha_id_externo: "C1", grupo_id_externo: "S1", anuncio_id_externo: null, verba_atual: null, verba_nova: null },
    ]);
    const { buscar } = graphFalso({ ...IRMAOS, S1: { account_id: "802008949148808", campaign_id: "C1", status: "ACTIVE" } });
    const r = await aplicarAprovadasNoMeta(admin, buscar);
    expect(rpc.mock.calls[0]).toEqual(["midia_copiloto_reservar_acoes_meta", { p_limite: 10 }]);
    expect(rpc.mock.calls[1]).toEqual([
      "midia_copiloto_registrar_resultado",
      { p_acao: "acao-1", p_situacao: "aplicada", p_lido: { status: "PAUSED", situacaoEfetiva: "" }, p_erro: null },
    ]);
    expect(r).toEqual({ feito: true, reservadas: 1, aplicadas: 1, semEfeito: 0, falhas: 0, ignoradas: 0 });
  });

  it("nada reservado: não registra", async () => {
    const { admin, rpc } = adminFalso([]);
    const r = await aplicarAprovadasNoMeta(admin, graphFalso({}).buscar);
    expect(r).toEqual({ feito: true, reservadas: 0, aplicadas: 0, semEfeito: 0, falhas: 0, ignoradas: 0 });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
