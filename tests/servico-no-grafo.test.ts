import { describe, it, expect } from "vitest";
import { schemaDeServico } from "../src/lib/schemaLoja";
import { ID_DA_LOJA, CIDADES_ATENDIDAS } from "../src/lib/schemaLoja";
import { ler, lerCodigo } from "./fonte";

/**
 * `/financiamento` e `/avaliacao` declaram o SERVIÇO que oferecem.
 *
 * As duas páginas já publicam trilha, FAQ, a loja e o site — e nenhum nó que
 * diga o que elas fazem. Para o grafo, `/avaliacao` é uma página da Motors com
 * uma pergunta frequente; não é "avaliação de veículo para troca, prestada
 * pela Motors Store, em Curitiba e região".
 *
 * O nó certo é `Service`, com `provider` apontando por `@id` para o `#dealer`
 * que a loja já emite — não um bloco novo de loja, que criaria uma segunda
 * unidade no grafo. `areaServed` reaproveita as mesmas cidades.
 *
 * O que NÃO entra, e é a parte que precisa de trava e não de código:
 * `aggregateRating`. Marcação de avaliação auto-declarada em negócio local é
 * motivo de ação manual no Search Console — a média do Perfil da Empresa
 * trabalha no Perfil da Empresa. E nada de `offers`/preço: financiamento e
 * avaliação não têm preço, e inventar um é declarar oferta falsa.
 */

describe("o nó de serviço", () => {
  const servico = schemaDeServico({
    tipo: "Financiamento de veículos",
    nome: "Financiamento de seminovos",
    descricao: "Simulação e aprovação de crédito para a compra de um seminovo.",
  }) as Record<string, unknown>;

  it("é um Service, e o prestador é a loja por referência", () => {
    expect(servico["@type"]).toBe("Service");
    // Por `@id`, nunca repetindo o bloco: duas descrições da loja no mesmo
    // grafo são duas lojas para quem lê.
    expect(servico.provider).toEqual({ "@id": ID_DA_LOJA });
  });

  it("atende as mesmas cidades que a loja declara", () => {
    const cidades = (servico.areaServed as { name: string }[]).map((c) => c.name);

    expect(cidades).toEqual([...CIDADES_ATENDIDAS]);
  });

  it("o tipo de serviço é o que foi pedido", () => {
    expect(servico.serviceType).toBe("Financiamento de veículos");
  });

  it("não declara preço nem oferta", () => {
    // Serviço sem preço é honesto; serviço com preço inventado é oferta falsa.
    expect(servico).not.toHaveProperty("offers");
    expect(servico).not.toHaveProperty("price");
  });

  it("não declara nota de avaliação — em lugar nenhum do nó", () => {
    // A regra que mais custa se for quebrada: `aggregateRating` auto-declarado
    // em negócio local é motivo de ação manual.
    expect(JSON.stringify(servico)).not.toMatch(/aggregateRating|ratingValue|reviewCount/i);
  });
});

describe("as duas páginas publicam o serviço", () => {
  it.each([
    ["src/app/financiamento/page.tsx", "Financiamento de veículos"],
    ["src/app/avaliacao/page.tsx", "Avaliação de veículo para troca"],
  ])("%s declara %s", (caminho, tipo) => {
    const fonte = ler(caminho);

    expect(fonte).toMatch(/schemaDeServico\(/);
    expect(fonte).toContain(tipo);
  });

  it("nenhuma página do site declara nota de avaliação no JSON-LD", () => {
    /*
     * Vale para as duas que este pacote toca e para os módulos de schema: é a
     * varredura que impede alguém de "melhorar o rich result" num sprint
     * futuro sem saber por que ninguém fez isso antes.
     *
     * Lido SEM comentários, e não é detalhe: a nota que explica a proibição
     * precisa poder escrever `aggregateRating` por extenso, senão o arquivo
     * perde justamente a memória do motivo. Ler o fonte cru faria a explicação
     * ser acusada como a reincidência — é a armadilha que `tests/fonte.ts`
     * documenta, e a primeira versão desta trava caiu nela.
     */
    for (const caminho of [
      "src/app/financiamento/page.tsx",
      "src/app/avaliacao/page.tsx",
      "src/lib/schemaLoja.ts",
      "src/lib/schemaListagem.ts",
    ]) {
      expect(lerCodigo(caminho), `${caminho} declara aggregateRating`).not.toMatch(
        /aggregateRating/,
      );
    }
  });
});
