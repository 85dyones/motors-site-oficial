import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A porta do gerador.
 *
 * A rota é NOVA e a régua de permissão é COMPARTILHADA com o PATCH que já
 * existe. Cobertura por vizinhança não é cobertura: o que este arquivo guarda
 * é que a rota nova de fato passa pela régua, não que exista uma segunda.
 */

const CLIENTE = { auth: { getUser: vi.fn() }, from: vi.fn() };
vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => CLIENTE }));

const gerarTexto = vi.fn();
vi.mock("../src/lib/descritivo/gerar", () => ({ gerarTexto: (...a: any[]) => gerarTexto(...a) }));

const { POST } = await import("../src/app/api/estoque/[id]/descritivo/route");

/**
 * Espiões de escrita, PRESENTES em toda chamada de `.from(...)` — não ausentes
 * como antes. Um stub que nunca define `update`/`insert`/`upsert` faz a rota
 * estourar `TypeError` se algum dia chamar um deles; o erro cai no catch da
 * rota (vira 500) e o teste antigo, que só olhava as chaves do valor de
 * retorno de `.from()`, nunca via a escrita. Com os três presentes como
 * `vi.fn()`, uma chamada real fica registrada e verificável por
 * `toHaveBeenCalled()`, em vez de invisível atrás de um crash engolido.
 */
const respostaDeEscrita = () => ({ eq: () => Promise.resolve({ error: null, data: null }) });
const ESCRITAS = {
  update: vi.fn(respostaDeEscrita),
  insert: vi.fn(respostaDeEscrita),
  upsert: vi.fn(respostaDeEscrita),
};

const VEICULO = {
  id: 7803195, marca: "bmw", modelo: "x1", ano: 2022, preco: "179900.00",
  quilometragem: 70700, cambio: "automatico", cor: "cinza", tipo: "SUV",
  pericia: "Em análise", laudo_pericia: "Laudo completo", opcionais: null,
};

function comPerfil(papeis: string[] | null, opts: { erroVeiculo?: { message: string } } = {}) {
  CLIENTE.auth.getUser.mockResolvedValue(
    papeis === null ? { data: { user: null } } : { data: { user: { id: "u1", email: "a@b.c" } } },
  );
  CLIENTE.from.mockImplementation((tabela: string) => {
    if (tabela === "profiles") {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { role: papeis?.[0] ?? null, papeis, full_name: "Teste" } }) }) }),
        ...ESCRITAS,
      };
    }
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            opts.erroVeiculo ? { data: null, error: opts.erroVeiculo } : { data: VEICULO, error: null },
        }),
      }),
      ...ESCRITAS,
    };
  });
}

const chamar = (corpo: any = { campo: "descricao_seo" }) =>
  POST(new Request("http://x/api/estoque/7803195/descritivo", {
    method: "POST", body: JSON.stringify(corpo), headers: { "content-type": "application/json" },
  }) as any, { params: Promise.resolve({ id: "7803195" }) });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "sk-teste";
  gerarTexto.mockResolvedValue({ ok: true, texto: "Texto limpo do anúncio.", entrada: 2200, saida: 80 });
});

describe("POST /api/estoque/[id]/descritivo", () => {
  it("recusa quem não tem sessão", async () => {
    comPerfil(null);
    expect((await chamar()).status).toBe(401);
  });

  it("recusa cliente da Garagem, que é authenticated sem ser staff", async () => {
    comPerfil(["cliente"]);
    const r = await chamar();
    expect(r.status).toBe(403);
    // Asserta o CORPO, não só o status: o gate de campo (perfil sem a linha
    // da matriz) também devolve 403, e o status sozinho não distingue as duas
    // portas — apagar o gate `ehStaff` deixava a suíte inteira verde porque
    // `perfisDe(["cliente"])` é `[]`, e o gate de campo barra do mesmo jeito.
    expect((await r.json()).error).toBe("Acesso restrito à equipe");
  });

  it("recusa o perfil que não edita o campo", async () => {
    comPerfil(["gestor"]);
    expect((await chamar()).status).toBe(403);
  });

  it("aceita marketing, que edita o campo", async () => {
    comPerfil(["marketing"]);
    expect((await chamar()).status).toBe(200);
  });

  it("recusa campo que não é de texto", async () => {
    comPerfil(["admin"]);
    expect((await chamar({ campo: "preco" })).status).toBe(400);
  });

  it("devolve 503 com o motivo quando falta a chave", async () => {
    comPerfil(["admin"]);
    gerarTexto.mockResolvedValue({ ok: false, status: 503, motivo: "falta OPENAI_API_KEY" });
    const r = await chamar();
    expect(r.status).toBe(503);
    expect((await r.json()).error).toContain("OPENAI_API_KEY");
  });

  it("devolve 422 com os motivos quando o texto reprova", async () => {
    comPerfil(["admin"]);
    gerarTexto.mockResolvedValue({ ok: true, texto: "SUV premium com garantia de motor e câmbio.", entrada: 1, saida: 1 });
    const r = await chamar();
    expect(r.status).toBe(422);
    const j = await r.json();
    expect(j.motivos.map((m: any) => m.regra)).toContain("vocabulário");
  });

  it("devolve o texto e a contagem quando passa", async () => {
    comPerfil(["admin"]);
    const j = await (await chamar()).json();
    expect(j.texto).toBe("Texto limpo do anúncio.");
    expect(j.caracteres).toBe("Texto limpo do anúncio.".length);
  });

  /**
   * Trocar o nome da env (`OPENAI_API_KEY` por outro) deixava tudo verde e
   * devolvia 503 em produção — a pendência de operação que a spec registra
   * (§11). Sem pinar QUAL chave chega ao gerador, nenhum teste acusa a troca.
   */
  it("repassa a env OPENAI_API_KEY para o gerador", async () => {
    comPerfil(["admin"]);
    await chamar();
    expect(gerarTexto.mock.calls[0][0].chave).toBe("sk-teste");
  });

  /** A régua da perícia tem que sair do BANCO, não do corpo da requisição. */
  it("não deixa o corpo da requisição decidir a perícia", async () => {
    comPerfil(["admin"]);
    await chamar({ campo: "descricao_seo", pericia: "Aprovado" });
    expect(gerarTexto.mock.calls[0][0].dossie.periciaAprovada).toBe(false);
  });

  it("nunca grava no banco", async () => {
    comPerfil(["admin"]);
    await chamar();
    // update/insert/upsert existem no stub (são vi.fn() chamáveis); a prova
    // de que a rota não escreve é que nenhum deles foi de fato invocado — não
    // que o valor de retorno de .from() careça dessas chaves.
    expect(ESCRITAS.update).not.toHaveBeenCalled();
    expect(ESCRITAS.insert).not.toHaveBeenCalled();
    expect(ESCRITAS.upsert).not.toHaveBeenCalled();
  });

  /**
   * A leitura de `estoque_motors` descartava `error` e caía direto no `if
   * (!veiculo)` — falha de banco, de rede ou bloqueio de RLS virava 404
   * ("Veículo não encontrado") para um carro que a pessoa está editando
   * naquele instante. A rota irmã (GET de api/estoque/[id]/route.ts) checa
   * `error` antes de checar ausência; esta rota alinha com ela.
   */
  it("responde 500 quando a leitura do veículo falha — nunca 404 para um carro que existe", async () => {
    comPerfil(["admin"], { erroVeiculo: { message: "o banco recusou a consulta" } });
    const r = await chamar();
    expect(r.status).toBe(500);
    expect((await r.json()).error).toBe("o banco recusou a consulta");
  });
});
