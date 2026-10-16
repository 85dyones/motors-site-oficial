// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";

/**
 * Navegação: o que a medição de 16/10/2026 achou e o que mudou.
 *
 * 1. /estoque → "CARREGAR MAIS" ×2 → 20º carro → voltar: a vitrine voltava
 *    com 9 cards e a rolagem caía no fim de uma página mais curta.
 * 2. A ficha no celular: preço e CTA só na segunda tela.
 */

describe("a vitrine volta com os cards que estavam abertos", () => {
  const fonte = lerCodigo("src/components/modernist/Catalogo.tsx");

  it("guarda a contagem no sessionStorage, por URL com a query", () => {
    expect(fonte).toMatch(/chaveDaVitrine = \(\) => `mt-vitrine:\$\{window\.location\.pathname\}\$\{window\.location\.search\}`/);
    expect(fonte).toContain("sessionStorage.setItem(chave, String(proximo))");
  });

  it("lê pelo useSyncExternalStore: o servidor vê a primeira leva, o navegador vê o que guardou", () => {
    expect(fonte).toContain("useSyncExternalStore(assinarVitrine, lerVisiveis, lerVisiveisNoServidor)");
    expect(fonte).toMatch(/const lerVisiveisNoServidor = \(\) => PAGINA;/);
    expect(fonte).toMatch(/return salvo > PAGINA \? salvo : PAGINA;/);
  });

  it("todo filtro zera a contagem, e a chave vai junto", () => {
    expect(fonte).toContain("else sessionStorage.removeItem(chave)");
    expect((fonte.match(/setVisiveis\(PAGINA\)/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("não vai para a URL: `?mostrar=` viraria endereço indexável da mesma página", () => {
    expect(fonte).not.toMatch(/mostrar=/);
  });

  it("armazenamento bloqueado não derruba a vitrine", () => {
    expect(fonte).toMatch(/sessionStorage\.getItem\(chaveDaVitrine\(\)\)[\s\S]{0,120}\} catch \{/);
  });
});

describe("a ficha no celular mostra preço e CTA na primeira tela", () => {
  // `ler`, e não `lerCodigo`: aqui se olha marcação, não lógica.
  const fonte = ler("src/components/PDPClientWrapper.tsx");

  it("o bloco existe, só abaixo de lg, logo depois do selo da perícia", () => {
    const iSelo = fonte.indexOf("{veiculo.pericia}");
    const iBloco = fonte.indexOf("gap-y-3 border-t-2 border-mt-regua pt-3 lg:hidden");
    const iSpecs = fonte.indexOf("Especificações rápidas em régua");
    expect(iSelo).toBeGreaterThan(0);
    expect(iBloco).toBeGreaterThan(iSelo);
    expect(iSpecs).toBeGreaterThan(iBloco);
  });

  it("é o mesmo preço e o MESMO manipulador do bloco de ações — um caminho só de conversão", () => {
    const bloco = fonte.slice(fonte.indexOf("lg:hidden\">"), fonte.indexOf("Especificações rápidas em régua"));
    expect(bloco).toContain("{precoAVista}");
    expect(bloco).toContain("onClick={handleWhatsappPDPClick}");
    expect(bloco).toContain('{indisponivel ? "CONSULTAR SIMILARES" : "FALAR COM O CONSULTOR"}');
    // Três usos: o bloco novo, o bloco de ações e a barra fixa do pé.
    expect((fonte.match(/onClick=\{handleWhatsappPDPClick\}/g) ?? []).length).toBe(3);
  });
});
