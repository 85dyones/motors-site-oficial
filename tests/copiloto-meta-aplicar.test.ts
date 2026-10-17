import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACOES_POR_RODADA,
  PRAZO_DA_APLICACAO_MS,
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
 * aplica pelo Graph, lê de volta, nunca põe o token na URL nem no corpo, e
 * registra cada ação assim que ela termina. Erro passageiro antes de mexer
 * adia; depois de mexer, a conta é lida antes de concluir.
 */

const CFG: ConfigDaAplicacaoMeta = { token: "TOKEN-SECRETO", versao: "v21.0", conta: "802008949148808" };
const BASE = { versao: "v21.0", conta: "802008949148808" };

type Chamada = { url: string; metodo: string; corpo: string | null; auth: string | null };
type Resposta = { status: number; corpo: unknown } | "rede";

/**
 * Um Graph de mentira: um estado por objeto ("S1") e listas prontas
 * ("C1/ads"). GET devolve os campos pedidos, POST muda. `roteiro` troca a
 * resposta de uma chamada (pela ordem: 0 é a primeira).
 */
function graphFalso(
  objetos: Record<string, Record<string, unknown>>,
  opcoes: { ignorarPost?: boolean; roteiro?: Record<number, Resposta>; postAplicaEFalha?: boolean } = {},
) {
  const chamadas: Chamada[] = [];
  const buscar = vi.fn(async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = String(entrada);
    const metodo = init?.method ?? "GET";
    const corpo = typeof init?.body === "string" ? init.body : null;
    const auth = new Headers(init?.headers).get("authorization");
    const n = chamadas.push({ url, metodo, corpo, auth }) - 1;
    const caminho = new URL(url).pathname.replace(/^\/v[\d.]+\//, "");
    const obj = objetos[caminho];
    if (metodo === "POST" && opcoes.postAplicaEFalha && obj) {
      for (const [k, v] of new URLSearchParams(corpo ?? "")) obj[k] = v;
      throw new Error("The operation was aborted due to timeout");
    }
    const roteiro = opcoes.roteiro?.[n];
    if (roteiro === "rede") throw new Error("fetch failed");
    if (roteiro) return new Response(JSON.stringify(roteiro.corpo), { status: roteiro.status });
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

/** Os vizinhos na conta: a campanha C1 tem anúncio ativo em S1 e em S2; o conjunto S1, dois anúncios ativos. */
const VIZINHOS = {
  "C1/ads": {
    data: [
      { id: "A1", adset_id: "S1", effective_status: "ACTIVE" },
      { id: "B1", adset_id: "S2", effective_status: "ACTIVE" },
    ],
  },
  "S1/ads": {
    data: [
      { id: "A1", adset_id: "S1", effective_status: "ACTIVE" },
      { id: "A2", adset_id: "S1", effective_status: "ACTIVE" },
    ],
  },
};
const CONTA = "802008949148808";

const pausarConjunto: AcaoDoMeta = {
  id: "acao-1",
  plataforma: "meta",
  tipo: "pausar_conjunto",
  campanhaId: "C1",
  conjuntoId: "S1",
  anuncioId: null,
  verbaAtual: null,
  verbaNova: null,
};
const pausarAnuncio: AcaoDoMeta = { ...pausarConjunto, id: "acao-2", tipo: "pausar_anuncio", anuncioId: "A1" };
const cortarVerba: AcaoDoMeta = { ...pausarConjunto, id: "acao-3", tipo: "mudar_verba", conjuntoId: null, verbaAtual: 100, verbaNova: 80 };

const conjunto = (extra: Record<string, unknown> = {}) => ({ account_id: CONTA, campaign_id: "C1", status: "ACTIVE", effective_status: "ACTIVE", ...extra });
const anuncio = (extra: Record<string, unknown> = {}) => ({ account_id: CONTA, campaign_id: "C1", adset_id: "S1", status: "ACTIVE", ...extra });
const erroDe = (r: unknown) => (r as { erro: string }).erro;

describe("aplicarAcaoNoMeta — pausar e reativar", () => {
  it("pausa o conjunto: confere os vizinhos, aplica, lê de volta e chama de aplicada", async () => {
    const { buscar, chamadas } = graphFalso({ ...VIZINHOS, S1: conjunto() });
    const r = await aplicarAcaoNoMeta(pausarConjunto, CFG, buscar);
    expect(r).toEqual({ id: "acao-1", situacao: "aplicada", lido: { status: "PAUSED", situacaoEfetiva: "ACTIVE" }, erro: null });
    expect(chamadas.map((c) => c.metodo)).toEqual(["GET", "GET", "POST", "GET"]);
    expect(chamadas[1].url).toBe("https://graph.facebook.com/v21.0/C1/ads?fields=id,adset_id,effective_status&limit=500");
    expect(chamadas[2]).toMatchObject({ url: "https://graph.facebook.com/v21.0/S1", corpo: "status=PAUSED" });
  });

  it("o token vai só no cabeçalho", async () => {
    const { buscar, chamadas } = graphFalso({ ...VIZINHOS, A1: anuncio() });
    await aplicarAcaoNoMeta(pausarAnuncio, CFG, buscar);
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(true);
    for (const c of chamadas) {
      expect(c.auth).toBe("Bearer TOKEN-SECRETO");
      expect(c.url).not.toContain("TOKEN-SECRETO");
      expect(c.corpo ?? "").not.toContain("TOKEN-SECRETO");
    }
  });

  it("já pausado: sem efeito, sem POST e sem olhar os vizinhos", async () => {
    const { buscar, chamadas } = graphFalso({ A1: anuncio({ status: "PAUSED" }) });
    const r = await aplicarAcaoNoMeta(pausarAnuncio, CFG, buscar);
    expect(r).toMatchObject({ situacao: "sem_efeito", lido: { status: "PAUSED" } });
    expect(chamadas).toHaveLength(1);
  });

  it("reativar manda ACTIVE, sem olhar os vizinhos", async () => {
    const { buscar, chamadas } = graphFalso({ S1: conjunto({ status: "PAUSED" }) });
    const r = await aplicarAcaoNoMeta({ ...pausarConjunto, tipo: "reativar_conjunto" }, CFG, buscar);
    expect(r).toMatchObject({ situacao: "aplicada" });
    expect(chamadas.map((c) => c.metodo)).toEqual(["GET", "POST", "GET"]);
    expect(chamadas[1].corpo).toBe("status=ACTIVE");
  });

  it("nenhum outro conjunto com anúncio ativo: não pausa", async () => {
    const { buscar, chamadas } = graphFalso({
      // S2 pode estar "ativo", mas o único anúncio dele está pausado.
      "C1/ads": {
        data: [
          { id: "A1", adset_id: "S1", effective_status: "ACTIVE" },
          { id: "B1", adset_id: "S2", effective_status: "PAUSED" },
        ],
      },
      S1: conjunto(),
    });
    const r = await aplicarAcaoNoMeta(pausarConjunto, CFG, buscar);
    expect(r).toMatchObject({
      situacao: "falhou",
      erro: "Nenhum outro conjunto da campanha tem anúncio ativo: pausar este pararia a campanha. Nada foi mudado.",
    });
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false);
  });

  it("o último anúncio ativo do conjunto não é pausado", async () => {
    const { buscar, chamadas } = graphFalso({ "S1/ads": { data: [{ id: "A1", adset_id: "S1", effective_status: "ACTIVE" }] }, A1: anuncio() });
    const r = await aplicarAcaoNoMeta(pausarAnuncio, CFG, buscar);
    expect(r).toMatchObject({ situacao: "falhou", erro: "É o último anúncio ativo do conjunto: pausar pararia o conjunto. Nada foi mudado." });
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false);
  });

  it.each([
    ["de outra conta", { S1: conjunto({ account_id: "999" }) }, pausarConjunto, "não é da conta act_802008949148808"],
    ["de outra campanha", { S1: conjunto({ campaign_id: "C9" }) }, pausarConjunto, "não é da campanha C1"],
    ["sem campanha na resposta", { S1: conjunto({ campaign_id: undefined }) }, pausarConjunto, "não é da campanha C1"],
    ["anúncio de outro conjunto", { A1: anuncio({ adset_id: "S7" }) }, pausarAnuncio, "não é do conjunto S1"],
    ["arquivado", { S1: conjunto({ status: "ARCHIVED" }) }, { ...pausarConjunto, tipo: "reativar_conjunto" as const }, "arquivado"],
  ])("objeto %s: falha sem mexer", async (_nome, objetos, acao, erro) => {
    const { buscar, chamadas } = graphFalso({ ...VIZINHOS, ...objetos });
    const r = await aplicarAcaoNoMeta(acao, CFG, buscar);
    expect(r).toMatchObject({ situacao: "falhou" });
    expect(erroDe(r)).toContain(erro);
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false);
  });

  it("o Meta aceita mas não muda: falha com o que leu", async () => {
    const { buscar } = graphFalso({ ...VIZINHOS, S1: conjunto() }, { ignorarPost: true });
    const r = await aplicarAcaoNoMeta(pausarConjunto, CFG, buscar);
    expect(r).toMatchObject({ situacao: "falhou", lido: { status: "ACTIVE" }, erro: "O Meta aceitou a mudança, mas a conta não mudou." });
  });

  it("ação de outra plataforma, sem alvo ou com verbo do Google: falha sem chamar o Meta", async () => {
    const { buscar, chamadas } = graphFalso({});
    expect(await aplicarAcaoNoMeta({ ...pausarConjunto, plataforma: "google" }, CFG, buscar)).toMatchObject({ situacao: "falhou" });
    expect(await aplicarAcaoNoMeta({ ...pausarAnuncio, anuncioId: null }, CFG, buscar)).toMatchObject({ situacao: "falhou" });
    expect(erroDe(await aplicarAcaoNoMeta({ ...pausarConjunto, tipo: "negativar" }, CFG, buscar))).toContain('não sabe aplicar "negativar"');
    expect(chamadas).toHaveLength(0);
  });
});

describe("aplicarAcaoNoMeta — verba", () => {
  it("muda a verba em centavos e lê de volta", async () => {
    const { buscar, chamadas } = graphFalso({ C1: { account_id: CONTA, status: "ACTIVE", daily_budget: "10000" } });
    const r = await aplicarAcaoNoMeta(cortarVerba, CFG, buscar);
    expect(r).toEqual({ id: "acao-3", situacao: "aplicada", lido: { verba: 80 }, erro: null });
    expect(chamadas[1]).toMatchObject({ metodo: "POST", corpo: "daily_budget=8000" });
  });

  it("a verba já é a nova: sem efeito", async () => {
    const { buscar, chamadas } = graphFalso({ C1: { account_id: CONTA, status: "ACTIVE", daily_budget: "8000" } });
    expect(await aplicarAcaoNoMeta(cortarVerba, CFG, buscar)).toMatchObject({ situacao: "sem_efeito", lido: { verba: 80 } });
    expect(chamadas).toHaveLength(1);
  });

  it.each([
    ["mudou desde a proposta", { daily_budget: "15000" }, cortarVerba, "mudou desde a proposta"],
    ["fica nos conjuntos", {}, cortarVerba, "fica nos conjuntos"],
    ["acima de 10×", { daily_budget: "1000" }, { ...cortarVerba, verbaAtual: 10, verbaNova: 200 }, "10×"],
  ])("verba %s: falha sem mexer", async (_nome, campos, acao, erro) => {
    const { buscar, chamadas } = graphFalso({ C1: { account_id: CONTA, status: "ACTIVE", ...campos } });
    expect(erroDe(await aplicarAcaoNoMeta(acao, CFG, buscar))).toContain(erro);
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false);
  });
});

describe("aplicarAcaoNoMeta — quando o Meta não responde", () => {
  it.each([
    ["limite de chamadas", { status: 400, corpo: { error: { code: 17, message: "User request limit reached" } } }],
    ["Meta fora", { status: 503, corpo: {} }],
    ["erro passageiro", { status: 400, corpo: { error: { code: 100, is_transient: true, message: "tente de novo" } } }],
    ["rede", "rede" as const],
  ])("%s antes de mexer: adia (a ação volta na reentrega)", async (_nome, resposta) => {
    const { buscar, chamadas } = graphFalso({ ...VIZINHOS, S1: conjunto() }, { roteiro: { 0: resposta } });
    expect(await aplicarAcaoNoMeta(pausarConjunto, CFG, buscar)).toMatchObject({ id: "acao-1", adiada: true });
    expect(chamadas).toHaveLength(1);
  });

  it("limite de chamadas ao ler os vizinhos também adia", async () => {
    const { buscar, chamadas } = graphFalso({ ...VIZINHOS, S1: conjunto() }, { roteiro: { 1: { status: 400, corpo: { error: { code: 613 } } } } });
    expect(await aplicarAcaoNoMeta(pausarConjunto, CFG, buscar)).toMatchObject({ adiada: true });
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false);
  });

  it("erro definitivo antes de mexer (permissão) falha", async () => {
    const { buscar } = graphFalso({ S1: conjunto() }, { roteiro: { 0: { status: 403, corpo: { error: { code: 200 } } } } });
    expect(await aplicarAcaoNoMeta(pausarConjunto, CFG, buscar)).toMatchObject({
      situacao: "falhou",
      erro: "o token de gestão não tem permissão ads_management na conta act_802008949148808",
    });
  });

  it("o POST estoura o tempo mas a mudança entrou: a leitura de volta prova, e é aplicada", async () => {
    const { buscar } = graphFalso({ ...VIZINHOS, S1: conjunto() }, { postAplicaEFalha: true });
    expect(await aplicarAcaoNoMeta(pausarConjunto, CFG, buscar)).toMatchObject({ situacao: "aplicada", lido: { status: "PAUSED" } });
  });

  it("o POST é recusado e a conta segue como antes: falha dizendo que nada mudou", async () => {
    const { buscar } = graphFalso(
      { C1: { account_id: CONTA, status: "ACTIVE", daily_budget: "10000" } },
      { roteiro: { 1: { status: 400, corpo: { error: { code: 100, error_user_msg: "Orçamento abaixo do mínimo" } } } } },
    );
    expect(await aplicarAcaoNoMeta(cortarVerba, CFG, buscar)).toMatchObject({
      situacao: "falhou",
      lido: { verba: 100 },
      erro: "Meta respondeu: Orçamento abaixo do mínimo. Nada foi mudado.",
    });
  });

  it("o POST falha e a conta não pode ser lida: falha avisando que pode ter sido aplicada", async () => {
    // POST e as duas leituras de volta caem.
    const { buscar } = graphFalso({ ...VIZINHOS, S1: conjunto() }, { roteiro: { 2: "rede", 3: "rede", 4: "rede" } });
    const r = await aplicarAcaoNoMeta(pausarConjunto, CFG, buscar);
    expect(r).toMatchObject({ situacao: "falhou" });
    expect(erroDe(r)).toContain("pode ter sido aplicada: confira no Gerenciador de Anúncios");
  });
});

describe("aplicarAcaoNoMeta — o POST que esbarra no limite", () => {
  it("limite de chamadas no POST e a conta como antes: adia, não falha", async () => {
    const { buscar } = graphFalso({ ...VIZINHOS, S1: conjunto() }, { roteiro: { 2: { status: 400, corpo: { error: { code: 17 } } } } });
    expect(await aplicarAcaoNoMeta(pausarConjunto, CFG, buscar)).toMatchObject({ id: "acao-1", adiada: true });
  });

  it("a primeira leitura de volta cai e a segunda confirma: aplicada", async () => {
    const { buscar } = graphFalso({ ...VIZINHOS, S1: conjunto() }, { roteiro: { 3: "rede" } });
    expect(await aplicarAcaoNoMeta(pausarConjunto, CFG, buscar)).toMatchObject({ situacao: "aplicada", lido: { status: "PAUSED" } });
  });
});

describe("os erros do Graph", () => {
  it("viram frase sem o token", async () => {
    const { buscar } = graphFalso({}, { roteiro: { 0: { status: 400, corpo: { error: { code: 190, message: "Error validating access token: TOKEN-SECRETO" } } } } });
    expect(await aplicarAcaoNoMeta(pausarConjunto, CFG, buscar)).toMatchObject({
      situacao: "falhou",
      erro: "token de gestão do Meta inválido ou expirado — gere outro no usuário do sistema",
    });
  });

  it("a mensagem livre do Meta também sai sem o token", async () => {
    const { buscar } = graphFalso({}, { roteiro: { 0: { status: 400, corpo: { error: { code: 100, message: "Bad token TOKEN-SECRETO here" } } } } });
    expect(erroDe(await aplicarAcaoNoMeta(pausarConjunto, CFG, buscar))).toBe("Meta respondeu: Bad token *** here");
  });

  it("permissão, limite e o resto", () => {
    expect(mensagemDoErroDeGestao({ code: 200 }, "1")).toContain("ads_management na conta act_1");
    expect(mensagemDoErroDeGestao({ code: 17 }, "1")).toContain("limite de chamadas");
    expect(mensagemDoErroDeGestao({ code: 100, error_user_msg: "Orçamento abaixo do mínimo" }, "1")).toBe("Meta respondeu: Orçamento abaixo do mínimo");
  });
});

describe("configDaAplicacaoMeta", () => {
  const antes = { ...process.env };
  afterEach(() => {
    process.env = { ...antes };
  });

  it("sem o token de gestão, diz qual variável falta", () => {
    delete process.env.META_ADS_MANAGEMENT_TOKEN;
    expect(configDaAplicacaoMeta(BASE)).toEqual({ erro: "falta o token de gestão do Meta (META_ADS_MANAGEMENT_TOKEN)" });
  });

  it("a conta e a versão são as da sincronização (sem conta escrita no executor)", () => {
    process.env.META_ADS_MANAGEMENT_TOKEN = " t ";
    process.env.META_AD_ACCOUNT_ID = "act_999";
    expect(configDaAplicacaoMeta({ versao: "v22.0", conta: "act_123" })).toEqual({ token: "t", versao: "v22.0", conta: "123" });
  });
});

describe("linhaParaAcaoDoMeta", () => {
  it("lê a linha da reserva, com a plataforma", () => {
    expect(
      linhaParaAcaoDoMeta({
        id: "x",
        plataforma: "meta",
        tipo: "mudar_verba",
        campanha_id_externo: "C1",
        grupo_id_externo: null,
        anuncio_id_externo: null,
        verba_atual: "100.00",
        verba_nova: "80",
      }),
    ).toEqual({ id: "x", plataforma: "meta", tipo: "mudar_verba", campanhaId: "C1", conjuntoId: null, anuncioId: null, verbaAtual: 100, verbaNova: 80 });
  });
});

describe("aplicarAprovadasNoMeta — a rodada", () => {
  const antes = { ...process.env };
  beforeEach(() => {
    process.env.META_ADS_MANAGEMENT_TOKEN = "TOKEN-SECRETO";
  });
  afterEach(() => {
    process.env = { ...antes };
  });

  const linha = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    plataforma: "meta",
    tipo: "pausar_conjunto",
    campanha_id_externo: "C1",
    grupo_id_externo: "S1",
    anuncio_id_externo: null,
    verba_atual: null,
    verba_nova: null,
    ...extra,
  });

  /** A fila do banco: cada reserva entrega a próxima; o registro devolve a situação gravada. */
  function adminFalso(fila: Array<Record<string, unknown>>) {
    const ordem: string[] = [];
    const rpc = vi.fn(async (nome: string, args: Record<string, unknown>) => {
      if (nome === "midia_copiloto_reservar_acoes_meta") {
        const proxima = fila.shift();
        ordem.push(`reservar:${String(proxima?.id ?? "nada")}`);
        return { data: proxima ? [proxima] : [], error: null };
      }
      if (nome === "midia_copiloto_registrar_resultado") {
        ordem.push(`registrar:${String(args.p_acao)}:${String(args.p_situacao)}`);
        return { data: args.p_situacao, error: null };
      }
      return { data: null, error: { message: `rpc inesperada ${nome}` } };
    });
    return { admin: { rpc } as never, rpc, ordem };
  }

  it("sem o token não reserva nada", async () => {
    delete process.env.META_ADS_MANAGEMENT_TOKEN;
    const { admin, rpc } = adminFalso([linha("a")]);
    expect(await aplicarAprovadasNoMeta(admin, BASE)).toMatchObject({ feito: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reserva uma por vez e registra cada uma antes da próxima", async () => {
    const { admin, rpc, ordem } = adminFalso([linha("a"), linha("b")]);
    const { buscar } = graphFalso({ ...VIZINHOS, S1: conjunto() });
    const r = await aplicarAprovadasNoMeta(admin, BASE, buscar);
    expect(rpc.mock.calls[0]).toEqual(["midia_copiloto_reservar_acoes_meta", { p_limite: 1 }]);
    // A segunda pausa do mesmo conjunto já o encontra pausado.
    expect(ordem).toEqual(["reservar:a", "registrar:a:aplicada", "reservar:b", "registrar:b:sem_efeito", "reservar:nada"]);
    expect(r).toEqual({ feito: true, reservadas: 2, adiadas: 0, aplicadas: 1, semEfeito: 1, falhas: 0, ignoradas: 0 });
    expect(rpc.mock.calls.find((c) => c[0] === "midia_copiloto_registrar_resultado")![1]).toEqual({
      p_acao: "a",
      p_situacao: "aplicada",
      p_lido: { status: "PAUSED", situacaoEfetiva: "ACTIVE" },
      p_erro: null,
    });
  });

  it("o Meta não responde: a ação fica reservada (sem registro) e a rodada para", async () => {
    const { admin, ordem } = adminFalso([linha("a"), linha("b")]);
    const { buscar } = graphFalso({ ...VIZINHOS, S1: conjunto() }, { roteiro: { 0: { status: 400, corpo: { error: { code: 4 } } } } });
    const r = await aplicarAprovadasNoMeta(admin, BASE, buscar);
    expect(ordem).toEqual(["reservar:a"]);
    expect(r).toMatchObject({
      feito: true,
      reservadas: 1,
      adiadas: 1,
      aplicadas: 0,
      motivoDoAdiamento: "limite de chamadas do Meta atingido — a próxima rodada tenta de novo",
    });
  });

  it("passado o prazo, nenhuma ação nova começa", async () => {
    const { admin, ordem } = adminFalso([linha("a"), linha("b")]);
    const { buscar } = graphFalso({ ...VIZINHOS, S1: conjunto() });
    // 0 no início e na primeira volta; depois, já passou do prazo.
    const leituras = [0, 0, PRAZO_DA_APLICACAO_MS];
    const relogio = () => leituras.shift() ?? PRAZO_DA_APLICACAO_MS;
    const r = await aplicarAprovadasNoMeta(admin, BASE, buscar, relogio);
    expect(ordem).toEqual(["reservar:a", "registrar:a:aplicada"]);
    expect(r).toMatchObject({ reservadas: 1 });
  });

  it("no máximo ACOES_POR_RODADA por rodada", async () => {
    const fila = Array.from({ length: ACOES_POR_RODADA + 3 }, (_, i) => linha(`x${i}`, { tipo: "reativar_conjunto" }));
    const { admin } = adminFalso(fila);
    const { buscar } = graphFalso({ S1: conjunto() });
    const r = await aplicarAprovadasNoMeta(admin, BASE, buscar);
    expect(r).toMatchObject({ reservadas: ACOES_POR_RODADA, semEfeito: ACOES_POR_RODADA });
    expect(fila).toHaveLength(3);
  });
});
