import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Veiculo } from "../src/types";
import type { MarcaConhecida } from "../src/lib/fichaPerdida";
import { EstoqueIndisponivelError } from "../src/lib/supabase";

/**
 * O corpo que as três páginas de não encontrado compartilham.
 *
 * `not-found.tsx` não recebe params, então cada página só sabe a própria copy.
 * O resto — a leitura com cache, a pane, a amostra e os blocos — mora num lugar
 * só. O que este arquivo trava é o contrato entre os dois lados:
 *
 *   1. título, texto e trilha chegam como a página mandou;
 *   2. a segunda frase (`textoDaAmostra`) só sai quando a amostra sai;
 *   3. o bloco de encomenda é MONTADO, e com o índice do recorte — ele chega
 *      como função porque o índice nasce dentro da leitura com cache;
 *   4. na pane, nem amostra, nem blocos, nem formulário; outra falha sobe.
 *
 * O componente é assíncrono e se testa chamando-o direto:
 * `renderToStaticMarkup` não desenha componente assíncrono dentro da árvore.
 */

const leituras = vi.hoisted(() => ({ falha: null as Error | null }));

const veiculo = (id: string, marca: string, modelo: string, tipo: string, preco: number): Veiculo => ({
  id,
  marca,
  modelo,
  versao: "",
  ano: 2022,
  quilometragem: 30000,
  cambio: "Manual",
  combustivel: "Flex",
  cor: "Prata",
  fipe: "",
  tipo,
  preco_original: preco,
  preco_promocional: 0,
  pericia: "",
  opcionais: "",
  laudo_pericia: "",
  whatsapp_images: [],
  web_full_images: [],
});

const DISPONIVEIS = [
  veiculo("101", "Volkswagen", "Nivus", "SUV", 120000),
  veiculo("102", "Honda", "City", "Sedan", 100000),
];

/* Dublê que roda a regra de verdade e devolve o que o cache de dados devolve
   num acerto: o recorte depois da ida e volta por JSON. */
vi.mock("../src/lib/hubsDeEstoque", async (original) => {
  const real = await original<typeof import("../src/lib/hubsDeEstoque")>();
  return {
    ...real,
    recorteDoNaoEncontrado: async () => {
      if (leituras.falha) throw leituras.falha;
      return JSON.parse(JSON.stringify(real.montarRecorteDoNaoEncontrado(DISPONIVEIS, DISPONIVEIS)));
    },
  };
});

const TRILHA = [
  { rotulo: "Home", href: "/" },
  { rotulo: "Estoque", href: "/estoque" },
];

const formulario = () => createElement("form", { "data-encomenda": "1" }, "Encomende seu carro");

async function desenhar(opcoes: {
  textoDaAmostra?: string;
  encomenda?: (marcas: MarcaConhecida[]) => ReactNode;
}): Promise<string> {
  const { default: NaoEncontradoNoEstoque } = await import(
    "../src/components/NaoEncontradoNoEstoque"
  );
  return renderToStaticMarkup(
    await NaoEncontradoNoEstoque({
      titulo: "Título de teste",
      texto: "Primeira frase de teste.",
      textoDaAmostra: opcoes.textoDaAmostra,
      trilha: TRILHA,
      encomenda: opcoes.encomenda ?? formulario,
    }),
  );
}

beforeEach(() => {
  leituras.falha = null;
});

describe("o corpo compartilhado do não encontrado", () => {
  it("título, texto e trilha saem como a página mandou", async () => {
    const html = await desenhar({});

    expect(html).toContain("Título de teste");
    expect(html).toContain("Primeira frase de teste.");
    expect(html).toContain('href="/estoque"');
  });

  it("sem segunda frase, o texto sai sozinho", async () => {
    expect(await desenhar({})).toContain(">Primeira frase de teste.</p>");
  });

  it("com a amostra, as duas frases saem juntas, separadas por um espaço", async () => {
    const html = await desenhar({ textoDaAmostra: "Segunda frase de teste." });

    expect(html).toContain(">Primeira frase de teste. Segunda frase de teste.</p>");
  });

  it("o bloco de encomenda é montado, e recebe o índice do recorte", async () => {
    const recebidos: MarcaConhecida[][] = [];
    const html = await desenhar({
      encomenda: (marcas) => {
        recebidos.push(marcas);
        return formulario();
      },
    });

    expect(recebidos).toHaveLength(1);
    expect(recebidos[0]!.map((m) => m.slug).sort()).toEqual(["honda", "volkswagen"]);
    expect(html).toContain('data-encomenda="1"');
  });

  it("mostra a amostra e os três blocos", async () => {
    const html = await desenhar({ textoDaAmostra: "Segunda frase de teste." });

    expect(html).toContain("Do pátio de hoje, em todas as faixas");
    expect(html).toContain("Por faixa de preço");
    expect(html).toContain("Por carroceria");
    expect(html).toContain("Marcas em estoque");
  });

  it("na pane: título, primeira frase e catálogo — sem amostra, sem blocos, sem formulário", async () => {
    leituras.falha = new EstoqueIndisponivelError("o banco recusou a consulta — teste");
    let chamadas = 0;
    const html = await desenhar({
      textoDaAmostra: "Segunda frase de teste.",
      encomenda: () => {
        chamadas += 1;
        return formulario();
      },
    });

    expect(html).toContain("Título de teste");
    expect(html).toContain(">Primeira frase de teste.</p>");
    expect(html).toContain("VER TODO O ESTOQUE");
    expect(html).not.toContain("Segunda frase de teste.");
    expect(html).not.toContain("Do pátio de hoje, em todas as faixas");
    expect(html).not.toContain("Por faixa de preço");
    expect(chamadas).toBe(0);
    expect(html).not.toContain('data-encomenda="1"');
  });

  it("outra falha sobe", async () => {
    leituras.falha = new Error("defeito de programação");

    await expect(desenhar({})).rejects.toThrow("defeito de programação");
  });
});
