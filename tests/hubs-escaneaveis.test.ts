import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import PaginaDeEstoque from "../src/components/modernist/PaginaDeEstoque";
import { blocosDoParagrafo } from "../src/lib/blocosDoGuia";
import {
  SUBTITULO_DA_LEITURA,
  textoDeCarroceria,
  textoDeFaixaDePreco,
  textoDeMarca,
  textoDeModelo,
  textoDePerfil,
} from "../src/lib/textoDosHubs";
import { PERFIS_DE_USO } from "../src/lib/perfisDeUso";
import { marcasFortes } from "./marcasDeIA";

/**
 * O texto do hub em duas partes (30/09/2026).
 *
 * O dono: os blocos de texto são "escaneáveis pelos LLMs e buscadores, mas
 * maçantes para os leitores". Nos hubs, quatro parágrafos corridos ficavam
 * entre o `<h1>` e o primeiro carro.
 *
 * O que este arquivo trava:
 *
 *   1. **A abertura fica em cima, a leitura desce.** O que vem antes do
 *      primeiro parágrafo "### Título" fica junto do título; dele em diante,
 *      a página desenha DEPOIS da grade, com o "###" como `<h2>`.
 *   2. **Texto sem "###" sai como sempre saiu** (/garantia, /financiamento).
 *   3. **Nenhuma marca vaza para o HTML**: nem "###", nem "- " no começo.
 *   4. **Os 31 textos da loja e os gerados seguem a forma**: chamada curta,
 *      abertura curta, "###" no terceiro parágrafo, ao menos uma lista, e
 *      nenhum bloco corrido longo.
 */

const renderizar = (introducao: string[]) =>
  renderToStaticMarkup(
    createElement(PaginaDeEstoque, {
      trilha: [{ rotulo: "Home", href: "/" }],
      titulo: "Onix Seminovo em Curitiba",
      veiculos: [],
      introducao,
    }),
  );

const palavras = (t: string) => t.split(/\s+/).filter(Boolean).length;

describe("PaginaDeEstoque: abertura em cima, leitura depois dos carros", () => {
  const html = renderizar([
    "Chamada do hub",
    "Abertura curta do hub.",
    "### Como escolher",
    "Na visita, confira:\n- primeiro item\n- segundo item",
    "Fechamento do texto.",
  ]);

  it("a abertura vem antes da grade, e a leitura depois", () => {
    const abertura = html.indexOf("Abertura curta do hub.");
    const subtitulo = html.indexOf(">Como escolher</h2>");
    const h1 = html.indexOf("<h1");
    expect(h1).toBeGreaterThan(-1);
    expect(abertura).toBeGreaterThan(h1);
    expect(subtitulo).toBeGreaterThan(abertura);
    // Entre a abertura e o subtítulo está o miolo da página (grade ou a
    // saída do hub vazio), e não só um parágrafo.
    expect(html.slice(abertura, subtitulo).length).toBeGreaterThan(500);
    expect(html.indexOf("Fechamento do texto.")).toBeGreaterThan(subtitulo);
  });

  it("a lista vira `<ul role=list>` e as marcas não vazam", () => {
    expect(html).toMatch(/<ul[^>]*role="list"[^>]*>[\s\S]*primeiro item[\s\S]*segundo item[\s\S]*<\/ul>/);
    expect(html).not.toContain("###");
    expect(html).not.toMatch(/>\s*- /);
  });

  it("texto sem ### fica inteiro em cima, sem seção de leitura", () => {
    const sem = renderizar(["Primeiro parágrafo.", "Segundo parágrafo."]);
    const i1 = sem.indexOf("Primeiro parágrafo.");
    const i2 = sem.indexOf("Segundo parágrafo.");
    expect(i1).toBeGreaterThan(sem.indexOf("<h1"));
    // Os dois parágrafos vizinhos, no cabeçalho: nada entre eles além da
    // troca de `<p>`.
    expect(sem.slice(i1, i2)).toMatch(/^Primeiro parágrafo\.<\/span><\/p><p[^>]*><span>$/);
  });
});

type Texto = { caminho: string; titulo: string | null; paragrafos: string[] };
const { textos } = JSON.parse(
  readFileSync(join(__dirname, "..", "conteudo-seo", "textos-de-hub-humanizados.json"), "utf8"),
) as { textos: Texto[] };

describe("os 31 textos da loja na forma escaneável", () => {
  it("são os 31 caminhos", () => {
    expect(textos).toHaveLength(31);
  });

  for (const { caminho, paragrafos: p } of textos) {
    it(caminho, () => {
      expect(p.length).toBeGreaterThanOrEqual(4);
      expect(p[0].startsWith("###"), "p[0] é a chamada").toBe(false);
      expect(p[1].startsWith("###"), "p[1] é a abertura").toBe(false);
      expect(p[2], "p[2] abre a leitura").toMatch(/^### \S/);
      expect(p[2]).not.toContain("\n");
      expect(palavras(p[0]), "chamada curta").toBeLessThanOrEqual(14);
      expect(palavras(p[1]), "abertura curta").toBeLessThanOrEqual(55);
      const blocos = p.flatMap(blocosDoParagrafo);
      expect(blocos.some((b) => b.tipo === "lista"), "a leitura tem lista").toBe(true);
      for (const b of blocos) {
        if (b.tipo === "paragrafo") expect(palavras(b.texto), b.texto.slice(0, 60)).toBeLessThanOrEqual(60);
      }
      const texto = p.join("\n");
      expect(marcasFortes(texto).map((m) => `${m.regra}: ${m.trecho}`)).toEqual([]);
      expect(texto).not.toMatch(/[—–“”]/);
    });
  }
});

describe("o texto gerado também abre a leitura", () => {
  it("marca, modelo, carroceria, faixa e perfil levam o subtítulo, depois da abertura", () => {
    for (const p of [
      textoDeMarca("Chevrolet", [], ["Onix"]),
      textoDeModelo("Chevrolet", "Onix", []),
      textoDeCarroceria("SUV", [], "SUVs"),
      textoDeFaixaDePreco("de R$ 60 a 100 mil", []),
      ...PERFIS_DE_USO.map((perfil) => textoDePerfil(perfil, [])),
    ]) {
      const i = p.indexOf(SUBTITULO_DA_LEITURA);
      expect(i).toBeGreaterThanOrEqual(1);
      expect(p.slice(i + 1).length).toBeGreaterThan(0);
    }
  });
});
