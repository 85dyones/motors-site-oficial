import { describe, it, expect } from "vitest";
import { montarInventario } from "../src/app/api/llms-full.txt/route";
import { getVeiculoPdpUrl, mapVeiculoDbToVeiculo } from "../src/lib/supabase";
import { schemaDoVeiculo } from "../src/lib/schemaVeiculo";
import { lerCodigo } from "./fonte";

/**
 * O nome do carro no `llms-full.txt`.
 *
 * Medido em produção em 2026-09-17, em `/api/llms-full.txt`:
 *
 *   ### BMW X4 M40i 3.0 M Sport Edit V6 Turbo Aut m40i 3.0 m sport edit v6 turbo aut (2020)
 *   ### NISSAN March 1.6 Rio 2016 1.6 rio 2016 (2016)
 *
 * O título era montado cru, e o RevendaMais embute a versão dentro do modelo.
 * É o defeito que `schema-do-veiculo.test.ts` guarda no JSON-LD e no feed de
 * anúncios, e `fichas-para-o-assistente.test.ts` no `/api/ney` — o
 * `llms-full.txt` tinha ficado de fora.
 *
 * ---------------------------------------------------------------------------
 * Por que medir o texto, e não a fonte
 * ---------------------------------------------------------------------------
 * Procurar `nomeComAno` na fonte não basta: um título que chame a função e
 * volte a pendurar o ano entre parênteses passa. Por isso o teste monta o
 * arquivo com `montarInventario` e compara cada título por VALOR com o
 * `Car.name` que `schemaDoVeiculo` publica na ficha.
 *
 * As linhas entram pelo MESMO mapper que `getEstoque()` usa, porque é nele que
 * o override do painel vence o feed. Marca, modelo, versão e ano do BMW e do
 * March são os da medição; quilometragem e preço são enchimento para a ficha
 * montar.
 */

const ORIGEM = "https://www.motorsstore.com.br";

/** O feed com a versão dentro do modelo — a forma que produzia a repetição. */
const BMW = {
  id: 1,
  marca: "BMW",
  modelo: "X4 M40i 3.0 M Sport Edit V6 Turbo Aut",
  versao: "m40i 3.0 m sport edit v6 turbo aut",
  ano: 2020,
  quilometragem: 40000,
  preco: 300000,
};

/** O mesmo caso, com o ANO também dentro do modelo. */
const MARCH = {
  id: 2,
  marca: "NISSAN",
  modelo: "March 1.6 Rio 2016",
  versao: "1.6 rio 2016",
  ano: 2016,
  quilometragem: 90000,
  preco: 40000,
};

/**
 * Um carro corrigido no painel. Sintético: nenhum HR-V foi medido aqui.
 *
 * O mapper passa o `modelo` do feed por `capitalizeWords`, que grafa "HR-V"
 * como "Hr-v" — e grafar o nome como ele é é justamente o ponto do override
 * (nota em `mapVeiculoDbToVeiculo`).
 */
const HRV = {
  id: 3,
  marca: "honda",
  modelo: "HR-V EXL 1.8 Flex Aut",
  versao: "exl 1.8 flex aut",
  modelo_override: "HR-V",
  versao_override: "EXL 1.8 Flex Aut",
  ano: 2019,
  quilometragem: 60000,
  preco: 100000,
};

const ATUALIZADO_EM = "17/09/2026, 12:00:00";
const estoque = [BMW, MARCH, HRV].map((linha) => mapVeiculoDbToVeiculo(linha));
const texto = montarInventario(estoque, ORIGEM, ATUALIZADO_EM);
const titulos = texto.match(/^### .*$/gm) ?? [];

describe("o título do carro no `llms-full.txt`", () => {
  it("não repete a versão que o feed embute no modelo", () => {
    expect(titulos[0]).toBe("### BMW X4 M40i 3.0 M Sport Edit V6 Turbo Aut 2020");

    // A régua vale para os três: a versão aparece UMA vez. Quantas vezes o ano
    // aparece no March é decisão de `nomeComAno`, e o teste seguinte cobre.
    estoque.forEach((veiculo, i) => {
      const vezes = titulos[i].toLowerCase().split(veiculo.versao.toLowerCase()).length - 1;
      expect(vezes, titulos[i]).toBe(1);
    });
  });

  it("é o `Car.name` da ficha, comparado por valor", () => {
    // A igualdade é a decisão inteira: o formato antigo, com o ano entre
    // parênteses e a marca em caixa alta, não existe no `Car.name` — e um
    // agente que cruza este arquivo com a ficha acha o carro pelo nome exato.
    expect(titulos).toEqual(
      estoque.map(
        (veiculo) =>
          `### ${schemaDoVeiculo(veiculo, { caminho: getVeiculoPdpUrl(veiculo), indisponivel: false }).name}`,
      ),
    );
  });

  it("o override do painel chega ao título", () => {
    expect(titulos[2]).toBe("### Honda HR-V EXL 1.8 Flex Aut 2019");

    // A contraprova: sem o override, o mesmo carro sai com a grafia do feed.
    // Sem ela, o teste passaria também num mapper que não moesse "HR-V", e não
    // provaria que foi o override que acertou o nome.
    const semOverride = montarInventario(
      [mapVeiculoDbToVeiculo({ ...HRV, modelo_override: null, versao_override: null })],
      ORIGEM,
      ATUALIZADO_EM,
    );
    expect(semOverride).toContain("### Honda Hr-v Exl 1.8 Flex Aut 2019\n");
  });
});

describe("a rota serve o texto que este teste mede", () => {
  it("o cache monta o arquivo com `montarInventario`", () => {
    // Sem esta trava, a rota podia voltar a montar o Markdown por conta
    // própria, e os testes acima seguiriam verdes medindo uma função que
    // ninguém chama. De onde vem a lista de carros é a trava de
    // `llms-full-mesmo-patio-da-vitrine.test.ts`.
    expect(lerCodigo("src/app/api/llms-full.txt/route.ts")).toMatch(/return montarInventario\(/);
  });
});
