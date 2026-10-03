import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { definicaoViva } from "./migracaoViva";

/**
 * A chave de desligar do `pedido_de_avaliacao` — revisão do PR #233, B3.
 *
 * O orquestrador do n8n pede a fila com `{"reservar": true}`, sem filtro. Sem
 * a chave, aplicar a migração do gatilho bastaria para o pedido de avaliação
 * sair sozinho, antes de o dono aprovar a mensagem e a base legal.
 *
 * O que se trava aqui, com a rota EXECUTADA contra um banco dublê:
 *   1. a chave nasce desligada e só o valor exato `ligado` liga;
 *   2. desligada, a rota manda ao banco a lista EXPLÍCITA dos quatro gatilhos
 *      antigos, e nunca `null` (`p_gatilhos` nulo = todos, no SQL);
 *   3. o SQL aplica esse filtro antes da colisão de prioridade e da reserva,
 *      que é o que faz a chave proteger também o lembrete de revisão.
 */

const ENV = "CICLO_PEDIDO_DE_AVALIACAO";
const TOKEN = "token-de-teste-do-motor";
const OS_QUATRO_ANTIGOS = [
  "elegibilidade_em_risco",
  "boas_vindas",
  "revisao_verificada",
  "revisao_programada",
];

const rpc = vi.fn();
vi.mock("../src/lib/supabase-server", () => ({
  createAdminSupabaseClient: () => ({ rpc }),
}));

const { POST } = await import("../src/app/api/ciclo/motor/fila/route");
const { gatilhosAtivos, pedidoDeAvaliacaoLigado, GATILHOS_CONHECIDOS } = await import(
  "../src/lib/ciclo/motor"
);

function pedir(corpo: unknown) {
  return POST(
    new Request("https://motorsstore.com.br/api/ciclo/motor/fila", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }),
  );
}

/** O que a rota passou à função SQL na única chamada da fila. */
function pedidoAoBanco() {
  const chamadas = rpc.mock.calls.filter(([nome]) => nome === "montar_fila_de_gatilhos");
  expect(chamadas).toHaveLength(1);
  return chamadas[0][1] as { p_reservar: boolean; p_gatilhos: string[] | null };
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [], error: null });
  vi.stubEnv("CICLO_MOTOR_TOKEN", TOKEN);
  // Parte de "ausente" em todo teste, qualquer que seja o ambiente de quem roda.
  vi.stubEnv(ENV, undefined as unknown as string);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a chave CICLO_PEDIDO_DE_AVALIACAO", () => {
  it("nasce desligada: com a env ausente o gatilho não está entre os ativos", () => {
    expect(process.env[ENV]).toBeUndefined();
    expect(pedidoDeAvaliacaoLigado()).toBe(false);
    expect(gatilhosAtivos()).not.toContain("pedido_de_avaliacao");
    expect([...gatilhosAtivos()].sort()).toEqual([...OS_QUATRO_ANTIGOS].sort());
    // Desligado não é desconhecido: o texto e a prioridade seguem no código.
    expect(GATILHOS_CONHECIDOS).toContain("pedido_de_avaliacao");
  });

  it("só o valor exato `ligado` liga", () => {
    vi.stubEnv(ENV, "ligado");
    expect(pedidoDeAvaliacaoLigado()).toBe(true);
    expect(gatilhosAtivos()).toContain("pedido_de_avaliacao");
    expect([...gatilhosAtivos()].sort()).toEqual([...GATILHOS_CONHECIDOS].sort());
  });

  it.each([
    ["vazia", ""],
    ["true", "true"],
    ["1", "1"],
    ["maiúsculas com espaço", "LIGADO "],
    ["maiúsculas", "LIGADO"],
    ["espaço no fim", "ligado "],
    ["espaço no começo", " ligado"],
    ["inicial maiúscula", "Ligado"],
    ["on", "on"],
    ["sim", "sim"],
    ["desligado", "desligado"],
  ])("não liga por aproximação: %s", (_rotulo, valor) => {
    vi.stubEnv(ENV, valor);
    expect(pedidoDeAvaliacaoLigado()).toBe(false);
    expect(gatilhosAtivos()).not.toContain("pedido_de_avaliacao");
  });

  it("a env é lida a cada chamada, não na carga do módulo", () => {
    expect(gatilhosAtivos()).not.toContain("pedido_de_avaliacao");
    vi.stubEnv(ENV, "ligado");
    expect(gatilhosAtivos()).toContain("pedido_de_avaliacao");
    vi.stubEnv(ENV, "");
    expect(gatilhosAtivos()).not.toContain("pedido_de_avaliacao");
  });
});

describe("a rota da fila, com a chave desligada", () => {
  it("sem filtro no corpo (o que o n8n manda), pede ao banco só os quatro antigos", async () => {
    const resposta = await pedir({ reservar: true });
    expect(resposta.status).toBe(200);

    const pedido = pedidoAoBanco();
    expect(pedido.p_reservar).toBe(true);
    // Lista explícita. `null` aqui seria "todos" para o SQL, pedido incluso.
    expect(pedido.p_gatilhos).not.toBeNull();
    expect([...(pedido.p_gatilhos ?? [])].sort()).toEqual([...OS_QUATRO_ANTIGOS].sort());
    expect(pedido.p_gatilhos).not.toContain("pedido_de_avaliacao");
  });

  it.each([["true"], ["1"], ["LIGADO "]])(
    "com a env em %j a rota continua pedindo só os quatro antigos",
    async (valor) => {
      vi.stubEnv(ENV, valor);
      await pedir({ reservar: true });
      expect([...(pedidoAoBanco().p_gatilhos ?? [])].sort()).toEqual(
        [...OS_QUATRO_ANTIGOS].sort(),
      );
    },
  );

  it("filtro com um gatilho ligado passa como veio", async () => {
    const resposta = await pedir({ reservar: false, gatilhos: ["revisao_programada"] });
    expect(resposta.status).toBe(200);
    expect(pedidoAoBanco()).toEqual({ p_reservar: false, p_gatilhos: ["revisao_programada"] });
  });

  it("BLOQUEIO: filtro pedindo o gatilho desligado leva 422 e não chega ao banco", async () => {
    const resposta = await pedir({ reservar: true, gatilhos: ["pedido_de_avaliacao"] });
    expect(resposta.status).toBe(422);

    const corpo = await resposta.json();
    expect(corpo.error).toBe("Gatilho desligado: pedido_de_avaliacao.");
    expect(corpo.gatilhos_validos).not.toContain("pedido_de_avaliacao");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("BLOQUEIO: misturado com gatilhos ligados, o pedido derruba a chamada inteira", async () => {
    const resposta = await pedir({
      reservar: true,
      gatilhos: ["boas_vindas", "pedido_de_avaliacao"],
    });
    expect(resposta.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("nome desconhecido segue sendo 422, e a lista de válidos não anuncia o desligado", async () => {
    const resposta = await pedir({ reservar: true, gatilhos: ["pedido_de_avaliasao"] });
    expect(resposta.status).toBe(422);

    const corpo = await resposta.json();
    expect(corpo.error).toBe("Gatilho desconhecido: pedido_de_avaliasao.");
    expect([...corpo.gatilhos_validos].sort()).toEqual([...OS_QUATRO_ANTIGOS].sort());
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("a rota da fila, com a chave ligada", () => {
  beforeEach(() => {
    vi.stubEnv(ENV, "ligado");
  });

  it("sem filtro no corpo, pede ao banco os cinco — e ainda em lista explícita", async () => {
    const resposta = await pedir({ reservar: true });
    expect(resposta.status).toBe(200);

    const pedido = pedidoAoBanco();
    expect(pedido.p_gatilhos).not.toBeNull();
    expect(pedido.p_gatilhos).toContain("pedido_de_avaliacao");
    expect([...(pedido.p_gatilhos ?? [])].sort()).toEqual([...GATILHOS_CONHECIDOS].sort());
  });

  it("aceita o gatilho no filtro do corpo", async () => {
    const resposta = await pedir({ reservar: false, gatilhos: ["pedido_de_avaliacao"] });
    expect(resposta.status).toBe(200);
    expect(pedidoAoBanco().p_gatilhos).toEqual(["pedido_de_avaliacao"]);
  });
});

describe("o filtro p_gatilhos no SQL vem antes de tudo que a chave precisa proteger", () => {
  // Se o filtro viesse DEPOIS da colisão de prioridade, o pedido (40)
  // desligado ainda tomaria a vez do lembrete de revisão (60) e os dois
  // sumiriam da fila. A chave só protege o lembrete porque `filtrados` é a
  // fonte de `com_canal`, e tudo o mais desce dali.
  const corpo = definicaoViva("montar_fila_de_gatilhos");
  const posicao = (trecho: string) => {
    const i = corpo.indexOf(trecho);
    expect(i, `não achei "${trecho}" na função viva`).toBeGreaterThan(-1);
    return i;
  };

  it("a função viva é a que conhece o pedido de avaliação", () => {
    expect(corpo).toContain("union all select * from g_avaliacao");
  });

  it("filtra logo depois de unir os gatilhos, e o resto lê do filtrado", () => {
    expect(corpo).toMatch(
      /filtrados as \(\s+select \* from unidos u\s+where p_gatilhos is null or u\.gatilho = any\(p_gatilhos\)\s+\)/,
    );
    expect(corpo).toMatch(/com_canal as \([\s\S]*?from filtrados f\s/);
    expect(corpo).toMatch(/classificado as \([\s\S]*?from com_canal c\s/);
    expect(corpo).toMatch(/ordenado as \([\s\S]*?from classificado cl\s/);
    expect(corpo).toMatch(/marcado as \([\s\S]*?from ordenado o\s/);
    // `unidos` (a lista sem filtro) não alimenta mais nada além de `filtrados`.
    expect(corpo.match(/\bfrom unidos\b/g) ?? []).toHaveLength(1);
  });

  it("a ordem: filtro → canal → janela → colisão → reserva", () => {
    const filtro = posicao("filtrados as (");
    const canal = posicao("com_canal as (");
    const janela = posicao("classificado as (");
    const colisao = posicao("ordenado as (");
    const reserva = posicao("reservado as (");
    expect(filtro).toBeLessThan(canal);
    expect(canal).toBeLessThan(janela);
    expect(janela).toBeLessThan(colisao);
    expect(colisao).toBeLessThan(reserva);
  });
});
