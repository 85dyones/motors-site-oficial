import { describe, it, expect } from "vitest";
import { montarEntrada, montarInstrucoes, MODELO } from "../src/lib/descritivo/briefing";
import { gerarTexto, type Transporte } from "../src/lib/descritivo/gerar";
import { montarDossie } from "../src/lib/descritivo/dossie";

/**
 * NENHUMA chamada de rede. O transporte entra por injeção, e o dublê responde
 * a FORMA REAL da API — `output_text` e `usage.input_tokens`. Dublê mais
 * permissivo que o servidor deixa um teste verde sobre resposta que o servidor
 * nunca daria.
 */

const SEM_NADA = montarDossie({
  marca: "honda", modelo: "nxr 160", ano: 2022, preco: "18900.00",
  quilometragem: 29300, cambio: "manual", cor: "branca", tipo: "Motocicleta",
  pericia: "Em análise",
});
const COM_TUDO = montarDossie({
  marca: "fiat", modelo: "titano", ano: 2025, preco: "170900.00",
  quilometragem: 42000, cambio: "automatico", cor: "vermelha", tipo: "Picape",
  pericia: "Aprovado", opcionais: "couro, ar digital", garantia_fabrica: "até 2027",
  // Donos e motorização entraram em 08/09/2026: sem eles, as proibições
  // correspondentes não tinham como ser testadas no sentido "o dado existe,
  // some a proibição" — e eram as duas que nenhum teste do repositório citava.
  donos_anteriores: 1, motor: "2.2 turbodiesel",
});

const respostaOk = (texto: string): Transporte => async () =>
  new Response(
    JSON.stringify({ output_text: texto, usage: { input_tokens: 2200, output_tokens: 80 } }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("montarEntrada", () => {
  it("proíbe opcional quando o veículo não tem nenhum", () => {
    expect(montarEntrada(SEM_NADA, "descricao_seo")).toContain("NÃO cite nenhum opcional");
  });
  it("libera até 3 opcionais quando existem", () => {
    expect(montarEntrada(COM_TUDO, "descricao_seo")).toContain("no máximo 3 opcionais");
  });
  /**
   * Até 09/09/2026 este par era condicional ao dossiê — "PODE afirmar" com a
   * perícia aprovada, "NÃO afirme" sem ela. A validação parou de tentar
   * distinguir afirmação de MENÇÃO (MENCIONA_PERICIA, em validacao.ts), e a
   * proibição do prompt parou de distinguir também: mesma frase nos dois
   * estados.
   */
  it("proíbe menção a perícia com a perícia aprovada", () => {
    expect(montarEntrada(COM_TUDO, "descricao_seo")).toContain("NÃO mencione perícia");
  });
  it("proíbe menção a perícia sem a perícia aprovada", () => {
    expect(montarEntrada(SEM_NADA, "descricao_seo")).toContain("NÃO mencione perícia");
  });
  /**
   * As três proibições que nasciam da AUSÊNCIA de um rótulo, cada uma nos dois
   * sentidos.
   *
   * Até 08/09/2026 só a de garantia era citada, e por um `not.toContain`
   * sozinho — asserção vácua: `not.toContain` fica verde quando a string nunca
   * é emitida, então apagar o bloco inteiro em `briefing.ts` deixava a suíte
   * verde. Donos e motorização não eram citadas por teste NENHUM do
   * repositório. Sem o par (ausente → aparece / presente → some), o teste mede
   * a própria ausência.
   */
  const PROIBICOES = [
    ["garantia", "NÃO cite garantia de fábrica"],
    ["donos", "NÃO cite número de donos"],
    ["motorização", "NÃO descreva a motorização"],
  ] as const;

  it.each(PROIBICOES)("proíbe %s quando não há o dado", (_rotulo, frase) => {
    expect(montarEntrada(SEM_NADA, "descricao_seo")).toContain(frase);
  });
  it.each(PROIBICOES)("não proíbe %s quando o veículo tem o dado", (_rotulo, frase) => {
    expect(montarEntrada(COM_TUDO, "descricao_seo")).not.toContain(frase);
  });

  it("manda o dossiê em linhas rotuladas", () => {
    expect(montarEntrada(SEM_NADA, "descricao_seo")).toContain("Cor da pintura: branca");
  });
  it("pede formato diferente para cada campo", () => {
    expect(montarEntrada(SEM_NADA, "descricao_seo")).toContain("155 caracteres");
    expect(montarEntrada(SEM_NADA, "descricao")).toContain("ABRE a página");
  });
});

/**
 * O `instructions` (system) — e a contradição que ele CARREGAVA.
 *
 * Até 09/09/2026, a linha "Use: passou, aprovado, ..." ia igual para os 85
 * veículos, inclusive os 49 em análise, enquanto o prompt de USUÁRIO proibia
 * afirmar aprovação. Duas instruções opostas no mesmo pedido, e a que
 * empurrava para a violação estava no campo de mais peso — a poda era por
 * veículo. A correção de 09/09/2026 tira a contradição pela raiz: a função
 * não recebe mais o dossiê, porque a lista "Use" não muda mais com a perícia
 * (ver o docblock de PALAVRAS_DA_CASA em briefing.ts).
 */
describe("montarInstrucoes", () => {
  it("usa 'aprovado' entre as palavras da casa — não depende mais da perícia", () => {
    expect(montarInstrucoes()).toContain("Use: passou, aprovado, selecionado, procedência, preço no anúncio.");
  });

  it("não tem mais 'perícia cautelar independente' na lista Use — o assunto é proibido agora", () => {
    expect(montarInstrucoes()).not.toContain("perícia cautelar independente");
  });

  it("o posicionamento não muda — a função não recebe mais o dossiê", () => {
    expect(montarInstrucoes()).toContain("o carro que passou");
    expect(montarInstrucoes()).toContain("Nunca use: premium, luxo, exclusivo");
  });
});

describe("gerarTexto", () => {
  it("devolve 503 sem chave, com o motivo nomeado", async () => {
    const r = await gerarTexto({ dossie: SEM_NADA, campo: "descricao_seo", chave: "", transporte: respostaOk("x") });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(503);
      expect(r.motivo).toContain("OPENAI_API_KEY");
    }
  });

  it("devolve o texto e os tokens quando a API responde", async () => {
    const r = await gerarTexto({ dossie: SEM_NADA, campo: "descricao_seo", chave: "sk-teste", transporte: respostaOk("  Honda NXR 160.  ") });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.texto).toBe("Honda NXR 160.");
      expect(r.entrada).toBe(2200);
    }
  });

  it("manda o modelo escolhido e o endpoint de responses", async () => {
    let urlVista = "", corpoVisto: any = null;
    const espiao: Transporte = async (url, init) => {
      urlVista = url;
      corpoVisto = JSON.parse(String(init?.body));
      return respostaOk("ok")(url, init);
    };
    await gerarTexto({ dossie: SEM_NADA, campo: "descricao_seo", chave: "sk-teste", transporte: espiao });
    expect(urlVista).toBe("https://api.openai.com/v1/responses");
    expect(corpoVisto.model).toBe(MODELO);
    expect(corpoVisto.instructions).toContain("Motors Store");
  });

  it("devolve 502 com o motivo quando a API recusa", async () => {
    const recusa: Transporte = async () =>
      new Response(JSON.stringify({ error: { message: "modelo inexistente" } }), { status: 404 });
    const r = await gerarTexto({ dossie: SEM_NADA, campo: "descricao_seo", chave: "sk-teste", transporte: recusa });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(502);
      expect(r.motivo).toContain("modelo inexistente");
    }
  });

  it("devolve 502 quando o transporte estoura", async () => {
    const explode: Transporte = async () => { throw new Error("socket hang up"); };
    const r = await gerarTexto({ dossie: SEM_NADA, campo: "descricao_seo", chave: "sk-teste", transporte: explode });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("socket hang up");
  });

  /** Resposta 200 com corpo vazio existe, e virava string vazia no campo. */
  it("devolve 502 quando a API responde 200 sem texto", async () => {
    const vazio: Transporte = async () =>
      new Response(JSON.stringify({ usage: { input_tokens: 1, output_tokens: 0 } }), { status: 200 });
    const r = await gerarTexto({ dossie: SEM_NADA, campo: "descricao_seo", chave: "sk-teste", transporte: vazio });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(502);
  });
});
