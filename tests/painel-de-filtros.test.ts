import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";

/**
 * Os chips de estado ficam onde estão — são a pergunta mais frequente da tela.
 * O que entra é um segundo nível, recolhível, com o que faltava.
 */
describe("o painel de filtros", () => {
  const tabela = lerCodigo("src/components/admin/TabelaDeEstoque.tsx");

  it("filtra por destaque", () => {
    expect(tabela).toMatch(/destaque:/);
  });

  it("filtra por faixa de preço", () => {
    expect(tabela).toMatch(/precoMin/);
    expect(tabela).toMatch(/precoMax/);
  });

  it("filtra por marca e por carroceria", () => {
    expect(tabela).toMatch(/marca:/);
    expect(tabela).toMatch(/tipo:/);
  });

  it("filtra por tempo parado e por desempenho", () => {
    expect(tabela).toMatch(/paradoHaDias/);
    expect(tabela).toMatch(/semLead/);
    expect(tabela).toMatch(/semVisita/);
  });

  it("as marcas saem do estoque carregado, não de uma constante", () => {
    // Lista fixa ofereceria marca que a loja não tem e esconderia a que ela tem.
    expect(tabela).toMatch(/new Set\(linhas\.map\(\(l\) => l\.marca\)/);
  });

  it("o controle de visitas some quando o GA4 está mudo", () => {
    // Ancorado ao rótulo, e não solto: `visitasDisponiveis &&` sem âncora casa
    // com QUALQUER ocorrência da substring no arquivo — inclusive o
    // `!visitasDisponiveis &&` de "Ainda fora desta tela", de outra seção — e
    // não vigia nada: quem apagar o guard do painel novo passaria com o mesmo
    // verde. A distância cobre o `<label>` inteiro do "Sem visita" (o
    // `onChange` no meio tem duas chamadas desde a Rodada 1); se o guard e o
    // rótulo se afastarem além disto, é sinal de que o controle saiu do lugar.
    expect(tabela).toMatch(/visitasDisponiveis &&[\s\S]{0,500}Sem visita/);
  });

  it("um botão limpa o recorte inteiro", () => {
    expect(tabela).toMatch(/Limpar filtros/);
  });
});
