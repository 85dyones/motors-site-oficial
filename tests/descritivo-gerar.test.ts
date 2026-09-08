import { describe, it, expect } from "vitest";
import { montarEntrada, MODELO } from "../src/lib/descritivo/briefing";
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
  it("proíbe afirmar perícia quando o dossiê não autoriza", () => {
    expect(montarEntrada(SEM_NADA, "descricao_seo")).toContain("NÃO afirme aprovação");
  });
  it("libera a afirmação quando o dossiê autoriza", () => {
    expect(montarEntrada(COM_TUDO, "descricao_seo")).toContain("PODE afirmar");
  });
  it("não proíbe garantia quando o veículo tem", () => {
    expect(montarEntrada(COM_TUDO, "descricao_seo")).not.toContain("NÃO cite garantia");
  });
  it("manda o dossiê em linhas rotuladas", () => {
    expect(montarEntrada(SEM_NADA, "descricao_seo")).toContain("Cor da pintura: branca");
  });
  it("pede formato diferente para cada campo", () => {
    expect(montarEntrada(SEM_NADA, "descricao_seo")).toContain("155 caracteres");
    expect(montarEntrada(SEM_NADA, "descricao")).toContain("ABRE a página");
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
