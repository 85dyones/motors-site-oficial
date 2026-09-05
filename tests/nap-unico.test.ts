import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";
import DEFAULT_COMPANY_SETTINGS from "../src/lib/companySettings.json";
import { linkWhatsApp, numeroDaLoja, telefoneVisivel } from "../src/lib/whatsapp";
import { enderecoDoSchema } from "../src/lib/schemaLoja";
import { colunasDoRodape } from "../src/lib/colunasDoRodape";

/**
 * Um número de telefone só, no site inteiro.
 *
 * O §0.5.6 do plano de aquisição encontrou dois telefones e dois endereços
 * para a Motors Store entre os canais, e chamou de "corrigir antes de qualquer
 * ação de SEO local". Metade do problema era interno: em 2026-08-25 o HTML
 * servido da home exibia "(41) 99842-6127" ao lado de um link `wa.me` para
 * 5541997372165 — número na tela diferente do número que o botão abre.
 *
 * A causa eram duas: o rodapé montava o RÓTULO a partir de
 * `companySettings.whatsapp` (texto digitado) e o HREF a partir de
 * `whatsappRaw`; e o padrão de `companySettings.json`, que é o que o servidor
 * usa antes de o cliente buscar `/api/settings`, tinha ficado para trás.
 *
 * O dono confirmou em 2026-08-25 que a operação é **uma loja só**, na Rua
 * Ernesto Piazzetta — a Rua Canadá é cadastro velho em portal.
 */

const NUMERO_CANONICO = "5541997372165";
const ENDERECO_CANONICO = "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350";

describe("o padrão de fábrica é o NAP em vigor", () => {
  /**
   * Não é preciosismo: o rodapé é client component e é renderizado no servidor
   * COM O PADRÃO, antes de `/api/settings` responder. Padrão desatualizado
   * aparece no HTML que o rastreador lê.
   */
  it("telefone", () => {
    expect(DEFAULT_COMPANY_SETTINGS.whatsappRaw).toBe(NUMERO_CANONICO);
    expect(numeroDaLoja(DEFAULT_COMPANY_SETTINGS)).toBe(NUMERO_CANONICO);
  });

  it("o campo de leitura concorda com o discável", () => {
    expect(telefoneVisivel(DEFAULT_COMPANY_SETTINGS)).toBe("(41) 99737-2165");
  });

  it("endereço", () => {
    expect(DEFAULT_COMPANY_SETTINGS.address).toBe(ENDERECO_CANONICO);
    expect(enderecoDoSchema(DEFAULT_COMPANY_SETTINGS.address)).toMatchObject({
      addressLocality: "Curitiba",
      addressRegion: "PR",
      postalCode: "82510-350",
    });
  });
});

describe("rótulo e link não podem discordar", () => {
  it("os dois saem do mesmo campo", () => {
    const empresa = { whatsappRaw: NUMERO_CANONICO, whatsapp: "(41) 99842-6127" };

    // O cenário exato do defeito: campo de leitura desatualizado no painel.
    // O rótulo passa a acompanhar o número que o link abre.
    expect(telefoneVisivel(empresa)).toBe("(41) 99737-2165");
    expect(linkWhatsApp(empresa)).toContain(NUMERO_CANONICO);
  });

  it("número em formato inesperado não vira apresentação inventada", () => {
    expect(telefoneVisivel({ whatsappRaw: "", whatsapp: "0800 000 0000" })).toBe("0800 000 0000");
  });

  it("o rodapé usa o formatador, não o campo de texto", () => {
    // Isto lia a FONTE do `Footer` e procurava `telefoneVisivel(...)`. Em
    // 2026-09-04 as colunas saíram do componente para `lib/colunasDoRodape.ts`
    // — o `Footer` é client component e não cabe em teste de renderização aqui
    // — e a guarda passou a vigiar o arquivo errado. Este teste avisou na hora,
    // que é o serviço dele.
    //
    // Aproveitado para virar comparação de VALOR, que é o que o `describe`
    // promete: o rótulo que a pessoa lê contra o número que o link abre. Bem
    // mais forte do que procurar o nome de uma função no texto do arquivo.
    const empresa = {
      ...DEFAULT_COMPANY_SETTINGS,
      whatsappRaw: NUMERO_CANONICO,
      // O cenário exato do defeito: campo de leitura desatualizado no painel.
      whatsapp: "(41) 99842-6127",
    };
    const zap = colunasDoRodape(empresa)
      .find((c) => c.titulo === "ATENDIMENTO")
      ?.itens.find((i) => i.contato === "whatsapp");

    expect(zap?.rotulo).toContain("(41) 99737-2165");
    expect(zap?.rotulo).not.toContain("99842-6127");
    expect(zap?.href).toContain(NUMERO_CANONICO);
  });

  it("a ficha do veículo também", () => {
    expect(lerCodigo("src/components/PDPClientWrapper.tsx")).toMatch(
      /telefoneVisivel\(companySettings\)/,
    );
  });
});

describe("uma loja, um `@id`", () => {
  it("não existe segunda unidade no código", () => {
    // Decisão do dono em 2026-08-25. O plano de aquisição previa matriz +
    // filial com `@id` por unidade e `store_id` nos eventos; a operação é uma
    // só. Se um dia houver filial de verdade, ela nasce com `@id` próprio — o
    // `#dealer` da matriz continua válido e nada do que está indexado muda.
    const schema = lerCodigo("src/lib/schemaLoja.ts");

    expect(schema).toMatch(/#dealer`/);
    expect(schema).not.toMatch(/dealer-canada|dealer-piazzetta/);
    expect(lerCodigo("src/lib/dataLayer.ts")).not.toMatch(/store_id/);
  });

  it("o padrão de fábrica não aponta para a Rua Canadá", () => {
    expect(ler("src/lib/companySettings.json")).not.toMatch(/Canad/i);
  });
});
