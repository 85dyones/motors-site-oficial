import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";

/**
 * O caminho do dinheiro das campanhas de SMS (07/10/2026): o lote, o retorno
 * do fornecedor e o link curto, contra um banco de mentira em memória.
 *
 * O que estes testes seguram: um SMS não sai duas vezes; quando a conta fica
 * sem saldo ninguém é marcado como falho (a fila espera); resposta que não
 * chegou não vira nova tentativa; "SAIR" tira a pessoa da lista e da fila; e
 * as duas rotas sem sessão (retorno e link curto) não aceitam qualquer um.
 */

const CARRO = { id: "101", marca: "Volkswagen", modelo: "T-Cross", versao: "Highline 1.4 TSI", ano: 2022, preco_original: 122180, preco_promocional: 0, vendido: false, tipo: "SUV" };
let estoque: Array<typeof CARRO> = [CARRO];
vi.mock("../src/lib/supabase", () => ({ getEstoque: async () => estoque, getVeiculoPdpUrl: () => "/carros/volkswagen/t-cross/highline-101" }));
let adminDaRota: unknown;
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => ({}),
  createAdminSupabaseClient: () => {
    if (!adminDaRota) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not defined");
    return adminDaRota;
  },
}));

const { enviarLote, interromperCampanha, registrarRetorno, registrarClique, criarCampanha, previaDaCampanha, lerCampanhaDeSms, enviarTeste, TAMANHO_DO_LOTE, MOTIVO_SAIU_DA_LISTA, configuracaoDoSms, segredosDoSms } =
  await import("../src/lib/smsCampanhas-servidor");
const { MENSAGEM_PADRAO, MENSAGEM_PADRAO_SEM_CARRO, tamanhoDoSms, PARTES_MAXIMAS } = await import("../src/lib/smsCampanhas");
type CriterioDePublico = import("../src/lib/smsCampanhas").CriterioDePublico;

type Linha = Record<string, unknown>;

/** Um Supabase mínimo: filtros `eq`/`in`, `update`, `upsert`, `range`, e as três funções da migração. */
function bancoDeMentira(estado: Record<string, Linha[]>) {
  const from = (tabela: string) => {
    const filtros: Array<(l: Linha) => boolean> = [];
    let mudanca: Linha | null = null;
    const linhas = () => (estado[tabela] ??= []).filter((l) => filtros.every((f) => f(l)));
    const executar = (de = 0, ate = Infinity) => {
      const achadas = linhas();
      if (mudanca) for (const l of achadas) Object.assign(l, mudanca);
      return { data: achadas.slice(de, ate + 1).map((l) => ({ ...l })), error: null, count: achadas.length };
    };
    let serial = 0;
    const api: Record<string, unknown> = {
      insert: (v: Linha | Linha[]) => {
        const novas = (Array.isArray(v) ? v : [v]).map((l) => ({ id: `${tabela}-${(estado[tabela] ??= []).length + ++serial}`, cliques: 0, situacao: tabela === "sms_envios" ? "na_fila" : "rascunho", ...l }));
        (estado[tabela] ??= []).push(...novas);
        const feito: Record<string, unknown> = {
          select: () => feito,
          single: () => Promise.resolve({ data: novas[0], error: null }),
          then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: novas, error: null }).then(ok),
        };
        return feito;
      },
      delete: () => api,
      select: () => api,
      order: () => api,
      limit: () => api,
      update: (v: Linha) => ((mudanca = v), api),
      upsert: (v: Linha) => {
        const lista = (estado[tabela] ??= []);
        if (!lista.some((l) => l.telefone === v.telefone)) lista.push({ ...v });
        return Promise.resolve({ error: null });
      },
      eq: (c: string, v: unknown) => (filtros.push((l) => l[c] === v), api),
      gte: (c: string, v: string) => (filtros.push((l) => String(l[c] ?? "") >= v), api),
      not: () => api,
      in: (c: string, vs: unknown[]) => (filtros.push((l) => vs.includes(l[c])), api),
      range: (de: number, ate: number) => Promise.resolve(executar(de, ate)),
      maybeSingle: () => Promise.resolve({ data: executar().data[0] ?? null, error: null }),
      then: (ok: (r: unknown) => unknown) => Promise.resolve(executar()).then(ok),
    };
    return api;
  };
  const rpc = async (nome: string, args: Record<string, unknown>) => {
    if (nome === "sms_devolver_presos") return { data: 0, error: null };
    if (nome === "sms_reservar_envios") {
      const campanha = estado.sms_campanhas.find((c) => c.id === args.p_campanha);
      if (campanha?.situacao !== "enviando") return { data: [], error: null };
      const lote = estado.sms_envios.filter((e) => e.campanha_id === args.p_campanha && e.situacao === "na_fila").slice(0, Number(args.p_limite));
      for (const e of lote) e.situacao = "enviando";
      return { data: lote.map((e) => ({ ...e })), error: null };
    }
    if (nome === "sms_registrar_clique") {
      const envio = estado.sms_envios.find((e) => e.codigo === args.p_codigo);
      if (!envio) return { data: [], error: null };
      envio.cliques = Number(envio.cliques ?? 0) + 1;
      envio.clicou_em ??= "agora";
      const campanha = estado.sms_campanhas.find((c) => c.id === envio.campanha_id)!;
      return { data: [{ destino: campanha.destino, campanha_codigo: campanha.codigo }], error: null };
    }
    return { data: null, error: { message: "função desconhecida" } };
  };
  return { from, rpc } as never;
}

const C = "11111111-1111-4111-8111-111111111111";
const envio = (n: number, extra: Linha = {}): Linha => ({
  id: `e${String(n).padStart(2, "0")}`,
  campanha_id: C,
  telefone: `55419999900${String(n).padStart(2, "0")}`,
  texto: `Oi ${n}`,
  codigo: `abc23${String(n).padStart(2, "2")}`,
  situacao: "na_fila",
  fornecedor_id: null,
  na_operadora_em: null,
  aceito_em: null,
  cliques: 0,
  respondeu_em: null,
  saiu_em: null,
  custo: null,
  partes: 1,
  ...extra,
});
const estadoCom = (quantos: number, situacao = "rascunho") => ({
  sms_campanhas: [{ id: C, situacao, codigo: "xyz2345", destino: "/carros/vw/t-cross/highline-1", homologacao: false, veiculo_id: 101, mensagem: "{carro}: {link}" }] as Linha[],
  sms_envios: Array.from({ length: quantos }, (_, i) => envio(i + 1)),
  sms_descadastros: [] as Linha[],
});

const ACEITO = (n: number) => ({ status: 200, json: async () => ({ error: false, response: { id: `sms_${n}` }, tax: "0,10" }) });

const ambiente = { ...process.env };
beforeEach(() => {
  process.env.APIBRASIL_TOKEN = "tok";
  process.env.SMS_WEBHOOK_TOKEN = "segredo-do-retorno";
  delete process.env.APIBRASIL_HOMOLOGACAO;
  delete process.env.APIBRASIL_SMS_TIPO;
  delete process.env.SMS_PRECO_POR_PARTE;
  adminDaRota = undefined;
  estoque = [CARRO];
});
afterAll(() => {
  process.env = ambiente;
});

describe("o lote", () => {
  it("manda a fila, guarda id e custo de cada um e fecha a campanha", async () => {
    const estado = estadoCom(3);
    const corpos: Array<Record<string, unknown>> = [];
    let n = 0;
    const r = await enviarLote(bancoDeMentira(estado), C, {
      buscar: async (_url, init) => {
        corpos.push(JSON.parse(init.body));
        return ACEITO(++n);
      },
    });
    expect(r).toMatchObject({ ok: true, situacao: "enviada", restam: 0, aviso: null, resumo: { publico: 3, enviados: 3, falhas: 0, custo: 0.3 } });
    expect(estado.sms_envios.every((e) => e.situacao === "enviado" && String(e.fornecedor_id).startsWith("sms_"))).toBe(true);
    expect(estado.sms_campanhas[0]).toMatchObject({ situacao: "enviada" });
    expect(corpos.map((c) => c.number).sort()).toEqual(["5541999990001", "5541999990002", "5541999990003"]);
    expect(corpos[0]).toMatchObject({ tipo: "sms-marketing", user_reply: true, homolog: false });
    expect(String(corpos[0].webhook_url)).toMatch(/\/api\/marketing\/sms\/retorno\?token=segredo-do-retorno$/);
  });

  it("fila maior que o lote: a campanha segue 'enviando', e a segunda chamada não repete ninguém", async () => {
    const estado = estadoCom(TAMANHO_DO_LOTE + 5);
    const numeros: string[] = [];
    const buscar = async (_url: string, init: { body: string }) => {
      numeros.push(JSON.parse(init.body).number);
      return ACEITO(numeros.length);
    };
    const primeiro = await enviarLote(bancoDeMentira(estado), C, { buscar: buscar as never });
    expect(primeiro).toMatchObject({ ok: true, situacao: "enviando", restam: 5 });
    const segundo = await enviarLote(bancoDeMentira(estado), C, { buscar: buscar as never });
    expect(segundo).toMatchObject({ ok: true, situacao: "enviada", restam: 0 });
    expect(numeros).toHaveLength(TAMANHO_DO_LOTE + 5);
    expect(new Set(numeros).size).toBe(numeros.length);
  });

  it("sem saldo: o lote para, ninguém vira falha e a fila espera o crédito", async () => {
    const estado = estadoCom(8);
    let chamadas = 0;
    const r = await enviarLote(bancoDeMentira(estado), C, { buscar: async () => (chamadas++, { status: 402, json: async () => ({}) }) });
    expect(r.ok && r.aviso).toContain("sem saldo");
    expect(r).toMatchObject({ ok: true, situacao: "enviando", restam: 8, resumo: { enviados: 0, falhas: 0 } });
    expect(estado.sms_envios.every((e) => e.situacao === "na_fila")).toBe(true);
    // Os que já estavam em voo quando o primeiro 402 chegou, e nenhum a mais.
    expect(chamadas).toBeLessThanOrEqual(5);
  });

  it("número recusado é falha só daquele envio, com o texto do fornecedor", async () => {
    const estado = estadoCom(3);
    const r = await enviarLote(bancoDeMentira(estado), C, {
      buscar: async (_url, init) =>
        JSON.parse(init.body).number === "5541999990002" ? { status: 200, json: async () => ({ error: true, message: "Número inválido" }) } : ACEITO(1),
    });
    expect(r).toMatchObject({ ok: true, situacao: "enviada", resumo: { enviados: 2, falhas: 1 }, aviso: null });
    expect(estado.sms_envios[1]).toMatchObject({ situacao: "falhou", erro: "Número inválido" });
  });

  it("resposta que não chegou: falha com 'pode ter saído', e NÃO volta para a fila", async () => {
    const estado = estadoCom(2);
    let chamadas = 0;
    const lento = () => new Promise<never>((_, recusar) => setTimeout(() => recusar(Object.assign(new Error("abort"), { name: "AbortError" })), 5));
    const r = await enviarLote(bancoDeMentira(estado), C, { buscar: async () => (chamadas++, lento()) });
    expect(chamadas).toBe(2);
    expect(r).toMatchObject({ ok: true, restam: 0, resumo: { falhas: 2 } });
    expect(estado.sms_envios.every((e) => e.situacao === "falhou" && /pode ter saído/.test(String(e.erro)))).toBe(true);
    // Chamar de novo não manda nada: não há fila.
    await enviarLote(bancoDeMentira(estado), C, { buscar: async () => (chamadas++, ACEITO(9)) });
    expect(chamadas).toBe(2);
  });

  it("campanha terminada ou interrompida não envia; sem token, nem tenta", async () => {
    const buscar = vi.fn();
    expect(await enviarLote(bancoDeMentira(estadoCom(2, "enviada")), C, { buscar })).toMatchObject({ ok: false, status: 409 });
    expect(await enviarLote(bancoDeMentira(estadoCom(2, "interrompida")), C, { buscar })).toMatchObject({ ok: false, status: 409 });
    expect(await enviarLote(bancoDeMentira(estadoCom(2)), "22222222-2222-4222-8222-222222222222", { buscar })).toMatchObject({ ok: false, status: 404 });
    expect(await enviarLote(bancoDeMentira(estadoCom(2)), "nao-e-uuid", { buscar })).toMatchObject({ ok: false, status: 404 });
    delete process.env.APIBRASIL_TOKEN;
    expect(await enviarLote(bancoDeMentira(estadoCom(2)), C, { buscar })).toMatchObject({ ok: false, status: 503 });
    expect(buscar).not.toHaveBeenCalled();
  });

  it("interromper fecha o rascunho e o envio em curso, e não reabre o que terminou", async () => {
    const estado = estadoCom(2, "enviando");
    expect(await interromperCampanha(bancoDeMentira(estado), C)).toEqual({ ok: true, situacao: "interrompida" });
    expect(await interromperCampanha(bancoDeMentira(estado), C)).toMatchObject({ ok: false, status: 409 });
    const buscar = vi.fn();
    expect(await enviarLote(bancoDeMentira(estado), C, { buscar })).toMatchObject({ ok: false, status: 409 });
    expect(buscar).not.toHaveBeenCalled();
  });
});

describe("o que impede o lote de sair", () => {
  it("sem o endereço de retorno, campanha de verdade não sai: 'responda SAIR' seria promessa falsa", async () => {
    delete process.env.SMS_WEBHOOK_TOKEN;
    const buscar = vi.fn();
    const estado = estadoCom(2);
    const r = await enviarLote(bancoDeMentira(estado), C, { buscar });
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(!r.ok && r.motivo).toContain("SMS_WEBHOOK_TOKEN");
    expect(buscar).not.toHaveBeenCalled();
    expect(estado.sms_campanhas[0].situacao).toBe("rascunho");
  });

  it("em modo de teste o retorno não é exigido, mas a campanha tem de ser de teste também", async () => {
    delete process.env.SMS_WEBHOOK_TOKEN;
    process.env.APIBRASIL_HOMOLOGACAO = "1";
    const deVerdade = estadoCom(1);
    expect(await enviarLote(bancoDeMentira(deVerdade), C, { buscar: vi.fn() })).toMatchObject({ ok: false, status: 409 });
    const deTeste = estadoCom(1);
    deTeste.sms_campanhas[0].homologacao = true;
    expect(await enviarLote(bancoDeMentira(deTeste), C, { buscar: async () => ACEITO(1) })).toMatchObject({ ok: true, situacao: "enviada" });
  });

  it("campanha de teste não sai num ambiente que envia de verdade", async () => {
    const estado = estadoCom(1);
    estado.sms_campanhas[0].homologacao = true;
    const buscar = vi.fn();
    expect(await enviarLote(bancoDeMentira(estado), C, { buscar })).toMatchObject({ ok: false, status: 409 });
    expect(buscar).not.toHaveBeenCalled();
  });

  it("rascunho velho: carro vendido ou preço mudado não saem com a oferta de outro dia", async () => {
    const buscar = vi.fn();
    estoque = [];
    const vendido = await enviarLote(bancoDeMentira(estadoCom(1)), C, { buscar });
    expect(!vendido.ok && vendido.motivo).toContain("não está mais à venda");

    estoque = [{ ...CARRO, preco_original: 118000 }];
    const estado = estadoCom(1);
    estado.sms_campanhas[0].mensagem = "{carro} por {preco}: {link}";
    estado.sms_envios[0].texto = "T-Cross por R$ 122.180: x.com/s/abc2345 Sair: responda SAIR";
    const mudou = await enviarLote(bancoDeMentira(estado), C, { buscar });
    expect(mudou).toMatchObject({ ok: false, status: 409 });
    expect(!mudou.ok && mudou.motivo).toContain("preço do carro mudou");
    expect(buscar).not.toHaveBeenCalled();

    // Com o preço de hoje no texto, sai.
    estado.sms_envios[0].texto = "T-Cross por R$ 118.000: x.com/s/abc2345 Sair: responda SAIR";
    expect(await enviarLote(bancoDeMentira(estado), C, { buscar: async () => ACEITO(1) })).toMatchObject({ ok: true });
  });

  it("quem pediu para sair DEPOIS de a campanha ser criada não recebe", async () => {
    const estado = estadoCom(3);
    estado.sms_descadastros.push({ telefone: "5541999990002", origem: "painel" });
    const numeros: string[] = [];
    const r = await enviarLote(bancoDeMentira(estado), C, { buscar: async (_u, init) => (numeros.push(JSON.parse(init.body).number), ACEITO(numeros.length)) });
    expect(numeros.sort()).toEqual(["5541999990001", "5541999990003"]);
    expect(estado.sms_envios[1]).toMatchObject({ situacao: "falhou", erro: MOTIVO_SAIU_DA_LISTA });
    expect(r).toMatchObject({ ok: true, situacao: "enviada", resumo: { enviados: 2, falhas: 1 } });
  });

  it("todos recusados pelo mesmo motivo é configuração: a fila volta inteira, com aviso", async () => {
    const estado = estadoCom(6);
    const r = await enviarLote(bancoDeMentira(estado), C, { buscar: async () => ({ status: 422, json: async () => ({ message: "tipo desconhecido" }) }) });
    expect(r).toMatchObject({ ok: true, situacao: "enviando", restam: 6, resumo: { falhas: 0, enviados: 0 } });
    expect(r.ok && r.aviso).toContain("tipo desconhecido");
    expect(r.ok && r.aviso).toContain("APIBRASIL_SMS_TIPO");
    expect(estado.sms_envios.every((e) => e.situacao === "na_fila")).toBe(true);
  });

  it("limite de chamadas (429) para o lote e não marca ninguém", async () => {
    const estado = estadoCom(4);
    const r = await enviarLote(bancoDeMentira(estado), C, { buscar: async () => ({ status: 429, json: async () => ({}) }) });
    expect(r).toMatchObject({ ok: true, restam: 4, resumo: { falhas: 0 } });
    expect(r.ok && r.aviso).toContain("mais devagar");
  });
});

describe("criar a campanha: o público congelado, sem pessoa na resposta", () => {
  const PEDIDO = { nome: "T-Cross", veiculoId: 101 as number | null, criterio: "mesmo_veiculo" as CriterioDePublico, janelaDias: null, canais: [] as string[], descansoDias: 7 as const, compraHaMeses: null as null | 12 | 24, destino: "estoque" as "estoque" | "avaliacao", mensagem: MENSAGEM_PADRAO };
  const base = () => ({
    sms_campanhas: [] as Linha[],
    sms_envios: [] as Linha[],
    sms_descadastros: [{ telefone: "5541999990003" }] as Linha[],
    leads: [
      { id: "l1", nome: "Fulano Sobrenome", telefone: "5541999990001", veiculo_id: null, desfecho: null, created_at: "2026-10-01T10:00:00Z" },
      { id: "l2", nome: "Lu🌸 Souza", telefone: "(41) 99999-0002", veiculo_id: null, desfecho: null, created_at: "2026-10-01T10:00:00Z" },
      { id: "l3", nome: "Saiu Da Lista", telefone: "5541999990003", veiculo_id: null, desfecho: null, created_at: "2026-10-01T10:00:00Z" },
      { id: "l4", nome: "Comprou", telefone: "5541999990004", veiculo_id: null, desfecho: "ganho", created_at: "2026-10-01T10:00:00Z" },
    ] as Linha[],
    leads_veiculos: ["l1", "l2", "l3", "l4"].map((lead_id) => ({ lead_id, veiculo_id: 101, veiculo_rotulo: null, veiculo_preco: 122180, motivo_descarte: null, criado_em: "2026-10-02T10:00:00Z" })) as Linha[],
  });

  it("a prévia devolve contagem, exemplo genérico e amostra mascarada: nem sobrenome nem telefone de lead", async () => {
    process.env.SMS_PRECO_POR_PARTE = "0.10";
    const r = await previaDaCampanha(bancoDeMentira(base()), { ...PEDIDO, mensagem: "{nome}, o {carro} baixou: {link}" }, new Date("2026-10-07T12:00:00Z"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.previa).toMatchObject({ destinatarios: 2, fora: { saiuDaLista: 1, jaComprou: 1 }, custoEstimado: 0.2 });
    const texto = JSON.stringify(r);
    // A amostra mostra primeiro nome e máscara, a pedido do dono; sobrenome, emoji de nome e telefone inteiro não saem.
    expect(texto).not.toMatch(/Sobrenome|Souza|Lu|\d{8,}/);
    expect(r.previa.exemplo).toMatch(/^Maria, o Volkswagen T-Cross/);
    expect(r.previa.tamanho.partes).toBe(1);
  });

  it("cria rascunho com um envio por pessoa: texto final no alfabeto do SMS, código próprio, nada enviado", async () => {
    const estado = base();
    const r = await criarCampanha(bancoDeMentira(estado), PEDIDO, { id: "u1", nome: "Dyones" }, new Date("2026-10-07T12:00:00Z"));
    expect(r.ok).toBe(true);
    expect(estado.sms_campanhas).toHaveLength(1);
    expect(estado.sms_campanhas[0]).toMatchObject({ nome: "T-Cross", veiculo_id: 101, criterio: "mesmo_veiculo", destino: "/carros/volkswagen/t-cross/highline-101", homologacao: false, criado_por_nome: "Dyones" });
    expect(estado.sms_envios.map((e) => e.telefone).sort()).toEqual(["5541999990001", "5541999990002"]);
    for (const e of estado.sms_envios) {
      const t = tamanhoDoSms(String(e.texto));
      expect(t.unicode, String(e.texto)).toBe(false);
      expect(e.partes).toBe(t.partes);
      expect(String(e.texto)).toContain(`/s/${e.codigo}`);
      expect(String(e.texto)).toMatch(/Sair: responda SAIR$/);
    }
    // O nome com emoji não vira saudação; o outro vira só o primeiro nome.
    expect(estado.sms_envios.map((e) => String(e.texto).slice(0, 12)).sort()).toEqual(["Fulano, o Vo", "O Volkswagen"]);
    expect(new Set(estado.sms_envios.map((e) => e.codigo)).size).toBe(2);
  });

  it("público vazio, carro fora do site e mensagem que estoura o máximo não criam nada", async () => {
    const vazio = base();
    vazio.leads_veiculos = [];
    expect(await criarCampanha(bancoDeMentira(vazio), PEDIDO, { id: "u", nome: null })).toMatchObject({ ok: false, status: 400 });
    expect(vazio.sms_campanhas).toEqual([]);

    expect(await criarCampanha(bancoDeMentira(base()), { ...PEDIDO, veiculoId: 999 }, { id: "u", nome: null })).toMatchObject({ ok: false, status: 400 });

    const longo = base();
    const r = await criarCampanha(bancoDeMentira(longo), { ...PEDIDO, mensagem: `${"x".repeat(153 * PARTES_MAXIMAS)} {link}` }, { id: "u", nome: null });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(longo.sms_campanhas).toEqual([]);
  });

  it("o monitor entrega máscara e primeiro nome: nem telefone, nem sobrenome, nem número dentro da resposta", async () => {
    const estado = base();
    const criada = await criarCampanha(bancoDeMentira(estado), PEDIDO, { id: "u1", nome: "Dyones" });
    if (!criada.ok) throw new Error(criada.motivo);
    const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    estado.sms_campanhas[0].id = id;
    for (const e of estado.sms_envios) e.campanha_id = id;
    Object.assign(estado.sms_envios[0], { resposta: "me liga no 41 98888-7777", respondeu_em: "x", erro: "Número 5541999990001 inválido", na_operadora_em: null, saiu_em: null, custo: null });
    Object.assign(estado.sms_envios[1], { resposta: null, respondeu_em: null, erro: null, na_operadora_em: null, saiu_em: null, custo: null });
    const campanha = await lerCampanhaDeSms(bancoDeMentira(estado), id);
    expect(campanha?.envios).toHaveLength(2);
    const texto = JSON.stringify(campanha);
    expect(texto).not.toMatch(/\d{8,}/);
    expect(texto).not.toMatch(/Sobrenome|Souza|98888|7777/);
    expect(campanha?.envios[0]).toMatchObject({ primeiroNome: "Fulano", telefoneMascarado: "(41) 9••••-0001", resposta: "me liga no ••••" });
    expect(await lerCampanhaDeSms(bancoDeMentira(estado), "nao-e-uuid")).toBeNull();
  });

  it("as duas fontes viram um público só: lead do site e contato da base, pelo telefone", async () => {
    const estado = base();
    Object.assign(estado, {
      marketing_contatos: [
        // Já está no site como l1: não recebe duas vezes.
        { id: "k1", nome: "Fulano Da Base", telefone: "5541999990001", cliente: false, sem_interesse: false, canais: ["OLX"], primeiro_contato_em: "2025-01-01T10:00:00Z", ultimo_contato_em: "2025-06-01T10:00:00Z", criado_em: "2026-10-07T10:00:00Z" },
        // Só na base, olhou um T-Cross em 2025.
        { id: "k2", nome: "Beltrana Souza", telefone: "5541999990020", cliente: false, sem_interesse: false, canais: ["WebMotors"], primeiro_contato_em: "2025-03-01T10:00:00Z", ultimo_contato_em: "2025-03-01T10:00:00Z", criado_em: "2026-10-07T10:00:00Z" },
        // Só na base, cliente.
        { id: "k3", nome: "Ciclano", telefone: "5541999990030", cliente: true, comprou_em: null, sem_interesse: false, canais: [], primeiro_contato_em: "2024-03-01T10:00:00Z", ultimo_contato_em: "2024-03-01T10:00:00Z", criado_em: "2026-10-07T10:00:00Z" },
      ],
      marketing_interesses: [{ contato_id: "k2", tipo: "interesse", veiculo_id: null, marca: "VOLKSWAGEN", modelo: "T CROSS COMFORTLINE 200 TSI", ocorreu_em: "2025-03-01T10:00:00Z" }],
    });
    const porModelo = await criarCampanha(bancoDeMentira(estado), { ...PEDIDO, criterio: "mesmo_modelo" }, { id: "u", nome: null }, new Date("2026-10-07T12:00:00Z"));
    expect(porModelo.ok).toBe(true);
    expect(estado.sms_envios.map((e) => [e.telefone, e.lead_id, e.contato_id]).sort()).toEqual([
      // O contato k1 não tem interesse no modelo: quem casa é o lead do site, e é ele que fica ligado ao envio.
      ["5541999990001", "l1", null],
      ["5541999990002", "l2", null],
      ["5541999990020", null, "k2"],
    ]);

    // Por perfil, sem carro: só os clientes, e o link leva ao estoque.
    const clientes = base();
    Object.assign(clientes, { marketing_contatos: (estado as unknown as { marketing_contatos: Linha[] }).marketing_contatos, marketing_interesses: [] });
    const r = await criarCampanha(bancoDeMentira(clientes), { ...PEDIDO, veiculoId: null, criterio: "clientes", mensagem: MENSAGEM_PADRAO_SEM_CARRO }, { id: "u", nome: null }, new Date("2026-10-07T12:00:00Z"));
    expect(r.ok).toBe(true);
    expect(clientes.sms_campanhas[0]).toMatchObject({ veiculo_id: null, veiculo_rotulo: null, destino: "/estoque", criterio: "clientes", canais: [], descanso_dias: 7 });
    expect(clientes.sms_envios.map((e) => e.telefone).sort()).toEqual(["5541999990004", "5541999990030"]);
    expect(String(clientes.sms_envios[0].texto)).toMatch(/novidades no estoque/);
  });

  it("a prévia de leads: camadas por critério, faixas de match e amostra sem contato", async () => {
    const estado = base();
    Object.assign(estado, {
      marketing_contatos: [
        { id: "k2", nome: "Beltrana Souza", telefone: "5541999990020", cliente: false, comprou_em: null, sem_interesse: false, canais: ["WebMotors"], primeiro_contato_em: "2025-03-01T10:00:00Z", ultimo_contato_em: "2025-03-01T10:00:00Z", criado_em: "2026-10-07T10:00:00Z" },
        { id: "k5", nome: "Marcos Lima", telefone: "5541999990050", cliente: false, comprou_em: null, sem_interesse: false, canais: ["OLX"], primeiro_contato_em: "2026-09-20T10:00:00Z", ultimo_contato_em: "2026-09-20T10:00:00Z", criado_em: "2026-10-07T10:00:00Z" },
      ],
      marketing_interesses: [
        { contato_id: "k2", tipo: "interesse", veiculo_id: null, marca: "VOLKSWAGEN", modelo: "T CROSS COMFORTLINE 200 TSI", ocorreu_em: "2025-03-01T10:00:00Z" },
        { contato_id: "k5", tipo: "interesse", veiculo_id: null, marca: "VOLKSWAGEN", modelo: "GOL 1.0", ocorreu_em: "2026-09-20T10:00:00Z" },
      ],
    });
    const r = await previaDaCampanha(bancoDeMentira(estado), { ...PEDIDO, criterio: "mesma_marca", descansoDias: 0, mensagem: "{carro}: {link}" }, new Date("2026-10-07T12:00:00Z"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Este carro: os dois leads do site. Modelo: mais quem olhou outro T-Cross. Marca: mais o do Gol.
    expect(r.previa.camadas).toEqual([
      { criterio: "mesmo_veiculo", pessoas: 2 },
      { criterio: "mesmo_modelo", pessoas: 3 },
      { criterio: "mesma_marca", pessoas: 4 },
      { criterio: "faixa_de_preco", pessoas: 2 },
    ]);
    expect(r.previa.destinatarios).toBe(4);
    // Este carro há cinco dias: os cinco sinais. T-Cross de 2025: marca e modelo. Gol recente: marca e recência.
    expect(r.previa.faixasDeMatch).toEqual([{ match: 100, pessoas: 2 }, { match: 40, pessoas: 2 }]);
    expect(r.previa.amostra.map((p) => [p.primeiroNome, p.match])).toEqual([["Fulano", 100], ["Sem nome", 100], ["Marcos", 40], ["Beltrana", 40]]);
    expect(r.previa.amostra[3]).toMatchObject({ telefoneMascarado: "(41) 9••••-0020", olhou: "Volkswagen T Cross Comfortline 200 Tsi" });
    expect(JSON.stringify(r.previa)).not.toMatch(/\d{8,}|Sobrenome|Souza|Lima/);
  });

  it("hora de trocar: só clientes com compra antiga o bastante, e o link leva à avaliação", async () => {
    const estado = base();
    estado.leads[3].desfecho_em = "2025-12-01T12:00:00Z"; // l4, ganho há dez meses
    Object.assign(estado, {
      marketing_contatos: [
        { id: "k3", nome: "Ciclano", telefone: "5541999990030", cliente: true, comprou_em: "2024-03-01T12:00:00Z", sem_interesse: false, canais: [], primeiro_contato_em: null, ultimo_contato_em: "2024-03-01T12:00:00Z", criado_em: "2026-10-07T10:00:00Z" },
        { id: "k6", nome: "Sem Data", telefone: "5541999990060", cliente: true, comprou_em: null, sem_interesse: false, canais: [], primeiro_contato_em: null, ultimo_contato_em: "2024-01-01T12:00:00Z", criado_em: "2026-10-07T10:00:00Z" },
        // Cliente sem data NENHUMA, importado hoje: não é contato de hoje.
        { id: "k7", nome: "Sem Nada", telefone: "5541999990070", cliente: true, comprou_em: null, sem_interesse: false, canais: [], primeiro_contato_em: null, ultimo_contato_em: null, criado_em: "2026-10-07T10:00:00Z" },
      ],
      marketing_interesses: [],
    });
    const troca = { ...PEDIDO, veiculoId: null, criterio: "clientes" as const, compraHaMeses: 24 as const, destino: "avaliacao" as const, mensagem: MENSAGEM_PADRAO_SEM_CARRO };
    const r = await criarCampanha(bancoDeMentira(estado), troca, { id: "u", nome: null }, new Date("2026-10-07T12:00:00Z"));
    expect(r.ok).toBe(true);
    // Só quem comprou há mais de dois anos. O de dez meses e o sem data ficam.
    expect(estado.sms_envios.map((e) => e.telefone)).toEqual(["5541999990030"]);
    expect(estado.sms_campanhas[0]).toMatchObject({ destino: "/avaliacao", compra_ha_meses: 24, veiculo_id: null });
    // Com um ano, o do site (ganho em dez/2025) ainda não entra; sem filtro, entram os três.
    const umAno = await previaDaCampanha(bancoDeMentira(estado), { ...troca, compraHaMeses: 12, descansoDias: 0 }, new Date("2026-10-07T12:00:00Z"));
    expect(umAno.ok && umAno.previa.destinatarios).toBe(1);
    const semFiltro = await previaDaCampanha(bancoDeMentira(estado), { ...troca, compraHaMeses: null, descansoDias: 0 }, new Date("2026-10-07T12:00:00Z"));
    expect(semFiltro.ok && semFiltro.previa).toMatchObject({ destinatarios: 4, camadas: [], faixasDeMatch: [] });
    // Com período, o cliente sem data nenhuma fica de fora, mesmo importado hoje; e a amostra não inventa data para ele.
    const recentes = await previaDaCampanha(bancoDeMentira(estado), { ...troca, compraHaMeses: null, descansoDias: 0, janelaDias: 30 }, new Date("2026-10-07T12:00:00Z"));
    // Sobra só o lead do site, criado na semana: nenhum dos contatos da base.
    expect(recentes.ok && recentes.previa.amostra.map((p) => p.primeiroNome)).toEqual(["Comprou"]);
    expect(semFiltro.ok && semFiltro.previa.amostra.find((p) => p.telefoneMascarado.endsWith("0070"))).toMatchObject({ quando: null });
  });

  it("o descanso tira quem recebeu campanha há pouco, e zero desliga", async () => {
    const estado = base();
    estado.sms_campanhas.push({ id: "outra", homologacao: false, situacao: "enviada" });
    estado.sms_envios.push({ id: "antigo", campanha_id: "outra", telefone: "5541999990001", situacao: "enviado", enviado_em: "2026-10-05T12:00:00.000Z" });
    const agora = new Date("2026-10-07T12:00:00Z");
    const comDescanso = await previaDaCampanha(bancoDeMentira(estado), { ...PEDIDO, mensagem: "{carro}: {link}" }, agora);
    expect(comDescanso.ok && comDescanso.previa).toMatchObject({ destinatarios: 1, fora: { descanso: 1 } });
    const semDescanso = await previaDaCampanha(bancoDeMentira(estado), { ...PEDIDO, descansoDias: 0, mensagem: "{carro}: {link}" }, agora);
    expect(semDescanso.ok && semDescanso.previa.destinatarios).toBe(2);
    // Envio de campanha de TESTE não põe ninguém em descanso.
    estado.sms_campanhas[0].homologacao = true;
    const deTeste = await previaDaCampanha(bancoDeMentira(estado), { ...PEDIDO, mensagem: "{carro}: {link}" }, agora);
    expect(deTeste.ok && deTeste.previa.destinatarios).toBe(2);
    estado.sms_campanhas[0].homologacao = false;
    // Envio de mais de sete dias atrás não segura ninguém.
    estado.sms_envios[0].enviado_em = "2026-09-20T12:00:00.000Z";
    const depois = await previaDaCampanha(bancoDeMentira(estado), { ...PEDIDO, mensagem: "{carro}: {link}" }, agora);
    expect(depois.ok && depois.previa.destinatarios).toBe(2);
    // Quem está na fila de OUTRO rascunho também descansa: dois rascunhos no mesmo dia não saem os dois.
    estado.sms_campanhas[0].situacao = "rascunho";
    Object.assign(estado.sms_envios[0], { situacao: "na_fila", enviado_em: null });
    const naFila = await previaDaCampanha(bancoDeMentira(estado), { ...PEDIDO, mensagem: "{carro}: {link}" }, agora);
    expect(naFila.ok && naFila.previa).toMatchObject({ destinatarios: 1, fora: { descanso: 1 } });
    // Mas a fila de uma campanha interrompida não vai sair, e não conta.
    estado.sms_campanhas[0].situacao = "interrompida";
    const interrompida = await previaDaCampanha(bancoDeMentira(estado), { ...PEDIDO, mensagem: "{carro}: {link}" }, agora);
    expect(interrompida.ok && interrompida.previa.destinatarios).toBe(2);
  });

  it("o SMS de teste respeita quem saiu e o tamanho máximo, e leva o link da ficha", async () => {
    const estado = base();
    const buscar = vi.fn(async () => ACEITO(1));
    expect(await enviarTeste(bancoDeMentira(estado), { telefone: "41 99999-0003", veiculoId: 101, mensagem: MENSAGEM_PADRAO }, { buscar })).toMatchObject({ ok: false, status: 400 });
    expect(await enviarTeste(bancoDeMentira(estado), { telefone: "4133330000", veiculoId: 101, mensagem: MENSAGEM_PADRAO }, { buscar })).toMatchObject({ ok: false, status: 400 });
    expect(buscar).not.toHaveBeenCalled();
    const ok = await enviarTeste(bancoDeMentira(estado), { telefone: "41 99999-0009", veiculoId: 101, mensagem: MENSAGEM_PADRAO }, { buscar });
    expect(ok.ok && ok.texto).toContain("/carros/volkswagen/t-cross/highline-101");
    expect(buscar).toHaveBeenCalledTimes(1);
    // Sem carro, o teste leva ao estoque e recusa variável de carro.
    const semCarro = await enviarTeste(bancoDeMentira(estado), { telefone: "41 99999-0009", veiculoId: null, mensagem: MENSAGEM_PADRAO_SEM_CARRO }, { buscar });
    expect(semCarro.ok && semCarro.texto).toMatch(/\/estoque Sair: responda SAIR$/);
    expect(await enviarTeste(bancoDeMentira(estado), { telefone: "41 99999-0009", veiculoId: null, mensagem: MENSAGEM_PADRAO }, { buscar })).toMatchObject({ ok: false, status: 400 });
  });
});

describe("o retorno do fornecedor", () => {
  const enviado = (n: number, extra: Linha = {}) => envio(n, { situacao: "enviado", fornecedor_id: `sms_${n}`, ...extra });

  it("cada aviso marca a etapa, e aviso repetido não muda a hora", async () => {
    const estado = { ...estadoCom(0, "enviada"), sms_envios: [enviado(1)] };
    const admin = bancoDeMentira(estado);
    await registrarRetorno(admin, [{ id: "sms_1", status: "valid", statusBruto: "valid", texto: null }], new Date("2026-10-07T12:00:00Z"));
    expect(estado.sms_envios[0]).toMatchObject({ aceito_em: "2026-10-07T12:00:00.000Z", na_operadora_em: null });
    await registrarRetorno(admin, [{ id: "sms_1", status: "sent_to_carrier", statusBruto: "sent_to_carrier", texto: null }], new Date("2026-10-07T12:01:00Z"));
    await registrarRetorno(admin, [{ id: "sms_1", status: "sent_to_carrier", statusBruto: "sent_to_carrier", texto: null }], new Date("2026-10-07T13:00:00Z"));
    expect(estado.sms_envios[0]).toMatchObject({ aceito_em: "2026-10-07T12:00:00.000Z", na_operadora_em: "2026-10-07T12:01:00.000Z" });
  });

  it("número recusado depois de aceito (invalid) vira falha com o motivo; entregue marca a operadora", async () => {
    // O primeiro teste real (08/10/2026): inserted_for_processing e, em seguida, invalid.
    const estado = { ...estadoCom(0, "enviada"), sms_envios: [enviado(1), enviado(2)] };
    const admin = bancoDeMentira(estado);
    await registrarRetorno(admin, [{ id: "sms_1", status: "invalid", statusBruto: "invalid", texto: null }], new Date("2026-10-08T17:56:45Z"));
    expect(estado.sms_envios[0]).toMatchObject({ situacao: "falhou" });
    expect(String(estado.sms_envios[0].erro)).toContain("recusou o número");
    await registrarRetorno(admin, [{ id: "sms_2", status: "delivered_to_device", statusBruto: "delivered_to_device", texto: null }], new Date("2026-10-08T18:00:00Z"));
    expect(estado.sms_envios[1]).toMatchObject({ situacao: "enviado", aceito_em: "2026-10-08T18:00:00.000Z", na_operadora_em: "2026-10-08T18:00:00.000Z" });
  });

  it("resposta comum fica guardada e não tira ninguém da lista", async () => {
    const estado = { ...estadoCom(0, "enviada"), sms_envios: [enviado(1)] };
    const achados = await registrarRetorno(bancoDeMentira(estado), [{ id: "sms_1", status: "reply", statusBruto: "reply", texto: "Quero ver o carro" }]);
    expect(achados).toBe(1);
    expect(estado.sms_envios[0]).toMatchObject({ resposta: "Quero ver o carro", saiu_em: null });
    expect(estado.sms_descadastros).toEqual([]);
  });

  it("SAIR: marca a saída, guarda o descadastro e tira o número da fila de outras campanhas", async () => {
    const outra = envio(9, { id: "outra", campanha_id: "outra-campanha", telefone: "5541999990001" });
    const estado = { ...estadoCom(0, "enviada"), sms_envios: [enviado(1), outra, envio(2)] };
    await registrarRetorno(bancoDeMentira(estado), [{ id: "sms_1", status: "reply", statusBruto: "reply", texto: "sair" }]);
    expect(estado.sms_envios[0].saiu_em).toBeTruthy();
    expect(estado.sms_descadastros).toEqual([{ telefone: "5541999990001", origem: "resposta", campanha_id: C }]);
    expect(estado.sms_envios[1]).toMatchObject({ situacao: "falhou", erro: MOTIVO_SAIU_DA_LISTA });
    // Outro número, na fila, não é tocado.
    expect(estado.sms_envios[2].situacao).toBe("na_fila");
  });

  it("aviso de SMS que não é de campanha (o teste) não acha nada e não quebra", async () => {
    const estado = estadoCom(1);
    expect(await registrarRetorno(bancoDeMentira(estado), [{ id: "desconhecido", status: "reply", statusBruto: "reply", texto: "SAIR" }])).toBe(0);
    expect(estado.sms_descadastros).toEqual([]);
  });
});

describe("a rota do retorno", () => {
  const chamar = async (url: string, corpo: unknown, cabecalhos: Record<string, string> = {}) => {
    const { POST } = await import("../src/app/api/marketing/sms/retorno/route");
    const r = await POST(new NextRequest(url, { method: "POST", headers: { "content-type": "application/json", ...cabecalhos }, body: JSON.stringify(corpo) }));
    return { status: r.status, json: await r.json() };
  };
  const URL_DA_ROTA = "http://localhost/api/marketing/sms/retorno";

  it("sem a variável é 503; token errado ou ausente é 401, e nada é gravado", async () => {
    const estado = { ...estadoCom(0), sms_envios: [envio(1, { situacao: "enviado", fornecedor_id: "sms_1" })] };
    adminDaRota = bancoDeMentira(estado);
    const aviso = [{ id: "sms_1", status: "reply", message: "SAIR" }];
    expect((await chamar(URL_DA_ROTA, aviso)).status).toBe(401);
    expect((await chamar(`${URL_DA_ROTA}?token=errado`, aviso)).status).toBe(401);
    delete process.env.SMS_WEBHOOK_TOKEN;
    expect((await chamar(`${URL_DA_ROTA}?token=segredo-do-retorno`, aviso)).status).toBe(503);
    expect(estado.sms_descadastros).toEqual([]);
  });

  it("com o token na URL ou no cabeçalho, aplica os avisos", async () => {
    const estado = { ...estadoCom(0), sms_envios: [envio(1, { situacao: "enviado", fornecedor_id: "sms_1" })] };
    adminDaRota = bancoDeMentira(estado);
    expect(await chamar(`${URL_DA_ROTA}?token=segredo-do-retorno`, [{ id: "sms_1", status: "sent_to_carrier" }])).toEqual({ status: 200, json: { recebidos: 1, achados: 1 } });
    expect(await chamar(URL_DA_ROTA, [{ id: "sms_1", status: "reply", message: "PARE" }], { authorization: "Bearer segredo-do-retorno" })).toMatchObject({ status: 200 });
    expect(estado.sms_envios[0].na_operadora_em).toBeTruthy();
    expect(estado.sms_descadastros).toHaveLength(1);
  });

  it("corpo que não é aviso responde 200 e não chega ao banco", async () => {
    expect(await chamar(`${URL_DA_ROTA}?token=segredo-do-retorno`, { qualquer: "coisa" })).toEqual({ status: 200, json: { recebidos: 0, achados: 0 } });
  });
});

describe("o link curto", () => {
  const abrir = async (codigo: string) => {
    const { GET } = await import("../src/app/s/[codigo]/route");
    return GET(new NextRequest(`http://localhost/s/${codigo}`), { params: Promise.resolve({ codigo }) });
  };

  it("conta o clique e leva à ficha com a marca da campanha", async () => {
    const estado = estadoCom(1, "enviada");
    estado.sms_envios[0].codigo = "abc2345";
    adminDaRota = bancoDeMentira(estado);
    const r = await abrir("abc2345");
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toMatch(/\/carros\/vw\/t-cross\/highline-1\?utm_source=sms&utm_medium=sms&utm_campaign=sms-xyz2345$/);
    expect(r.headers.get("x-robots-tag")).toContain("noindex");
    await abrir("abc2345");
    expect(estado.sms_envios[0]).toMatchObject({ cliques: 2, clicou_em: "agora" });
    expect(await registrarClique(adminDaRota as never, "zzz2345")).toBeNull();
  });

  it("código desconhecido, torto, ou banco fora: vai para o estoque, nunca erro", async () => {
    adminDaRota = bancoDeMentira(estadoCom(1));
    for (const codigo of ["zzz2345", "x", "abc234O"]) {
      const r = await abrir(codigo);
      expect(r.status, codigo).toBe(302);
      expect(r.headers.get("location"), codigo).toMatch(/\/estoque$/);
    }
    adminDaRota = undefined;
    expect((await abrir("abc2345")).headers.get("location")).toMatch(/\/estoque$/);
  });
});

describe("a configuração", () => {
  it("a tela sabe o que está ligado, e nunca recebe segredo", () => {
    const c = configuracaoDoSms({ APIBRASIL_TOKEN: "tok", APIBRASIL_HOMOLOGACAO: "1", SMS_PRECO_POR_PARTE: "0,10", SMS_WEBHOOK_TOKEN: "s" } as never);
    expect(c).toEqual({ temToken: true, homologacao: true, precoPorParte: 0.1, temRetorno: true });
    expect(JSON.stringify(c)).not.toContain("tok");
    expect(configuracaoDoSms({} as never)).toEqual({ temToken: false, homologacao: false, precoPorParte: null, temRetorno: false });
  });

  it("sem o segredo do retorno, o SMS sai sem endereço de aviso", () => {
    expect(segredosDoSms({ APIBRASIL_TOKEN: "t" } as never)).toMatchObject({ urlDoRetorno: null, tipo: "sms-marketing" });
    expect(segredosDoSms({ APIBRASIL_SMS_TIPO: "sms-mkt" } as never).tipo).toBe("sms-mkt");
  });
});
