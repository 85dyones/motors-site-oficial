import { describe, it, expect } from "vitest";
import type { Veiculo } from "../src/types";
import { ler, lerCodigo } from "./fonte";
import { montarNavegacaoDoRodape } from "../src/lib/navegacaoDoRodape";

/**
 * Dois defeitos que a rodada anterior deixou passar, e que se somavam.
 *
 * O rodapé lista marcas e modelos em TODA página do site — é o link interno
 * mais repetido que existe aqui. Até 2026-08-25 ele apontava para
 * `/estoque?marca=X`, uma URL de filtro que, desde a criação dos hubs, COMPETE
 * com `/carros/{marca}` em vez de alimentá-lo. E o bloco inteiro era montado no
 * cliente: medido na produção, **zero** desses links apareciam no HTML servido.
 *
 * No mesmo lote, `CardVeiculo` servia a foto num `<img>` cru — sem WebP, sem
 * `srcset`, sem `sizes` — em todas as listagens do site.
 */

function veiculo(parcial: Partial<Veiculo> & Pick<Veiculo, "id" | "marca" | "modelo">): Veiculo {
  return {
    versao: "",
    ano: 2022,
    quilometragem: 0,
    cambio: "",
    combustivel: "",
    cor: "",
    fipe: "",
    preco_original: 100000,
    preco_promocional: 0,
    pericia: "",
    whatsapp_images: [],
    web_full_images: [],
    opcionais: "",
    laudo_pericia: "",
    ...parcial,
  } as Veiculo;
}

describe("o rodapé aponta para as páginas perenes", () => {
  const estoque = [
    veiculo({ id: "1", marca: "Jeep", modelo: "Renegade S T270", versao: "S T270" }),
    veiculo({ id: "2", marca: "Jeep", modelo: "Renegade Longitude", versao: "Longitude" }),
    veiculo({ id: "3", marca: "Chevrolet", modelo: "Chevrolet Onix LT", versao: "LT" }),
  ];

  it("marca leva ao hub da marca, não ao filtro do catálogo", () => {
    const { marcas } = montarNavegacaoDoRodape(estoque, estoque);

    expect(marcas.map((m) => m.href)).toContain("/carros/jeep");
    expect(marcas.every((m) => !m.href.includes("?"))).toBe(true);
  });

  it("modelo leva ao hub do modelo, não à ficha de um carro", () => {
    // A ficha morre quando o carro é vendido; o rodapé apontava para ela em
    // toda página do site. O comentário do código explicava o porquê — "o feed
    // não tem nome de modelo limpo" — que é o que `slugDeModelo` resolveu.
    const { modelos } = montarNavegacaoDoRodape(estoque, estoque);

    expect(modelos.map((m) => m.href)).toContain("/carros/jeep/renegade");
    expect(modelos.every((m) => m.href.split("/").length === 4)).toBe(true);
  });

  it("não lista hub sem estoque — o rodapé é vitrine, não índice", () => {
    const vendido = veiculo({ id: "4", marca: "Fiat", modelo: "Uno", vendido: true });
    const { marcas } = montarNavegacaoDoRodape([...estoque, vendido], estoque);

    expect(marcas.map((m) => m.rotulo)).not.toContain("Fiat");
  });

  it("nada mais no site aponta para `/estoque?marca=`", () => {
    for (const arquivo of [
      "src/components/Footer.tsx",
      "src/app/[categoria]/[marca]/[modelo]/[ficha]/page.tsx",
    ]) {
      expect(lerCodigo(arquivo)).not.toMatch(/\/estoque\?marca=/);
    }
  });
});

describe("os links do rodapé existem no HTML servido", () => {
  it("o rodapé recebe a lista pronta, não a busca no navegador", () => {
    const fonte = lerCodigo("src/components/Footer.tsx");

    // `useVitrineDestaque` fazia `getEstoque()` num `useEffect`: o bloco nascia
    // vazio no servidor e só existia depois do JavaScript.
    expect(fonte).not.toMatch(/useVitrineDestaque|useEffect/);
    expect(fonte).toMatch(/navegacao\?:\s*NavegacaoDoRodape/);
  });

  it("o layout resolve no servidor e passa por prop", () => {
    const fonte = lerCodigo("src/app/layout.tsx");

    expect(fonte).toMatch(/await getNavegacaoDoRodape\(\)/);
    expect(fonte).toMatch(/<Footer navegacao=\{navegacaoDoRodape\}/);
  });

  it("a leitura passa por cache — o layout roda em toda rota", () => {
    // Sem isso, cada visita a uma tela do painel pagaria duas consultas ao
    // Supabase para montar um bloco que aquela tela nem mostra.
    expect(ler("src/lib/navegacaoDoRodape.ts")).toMatch(/unstable_cache\(/);
  });
});

describe("as fotos dos cards passam pelo otimizador", () => {
  const fonte = ler("src/components/modernist/primitivos.tsx");

  it("`CardVeiculo` usa `next/image`", () => {
    expect(fonte).toMatch(/import Image from "next\/image"/);
    expect(lerCodigo("src/components/modernist/primitivos.tsx")).not.toMatch(
      /@next\/next\/no-img-element/,
    );
  });

  it("declara `sizes` — sem ele o ganho é zero", () => {
    // Sem `sizes`, o Next serve o maior candidato do srcset em qualquer
    // viewport: o celular baixa a foto de desktop e a otimização não existe.
    expect(fonte).toMatch(/sizes="\(max-width: 640px\) 100vw/);
  });

  it("só o card acima da dobra tem prioridade", () => {
    // `priority` em toda a grade transformaria doze fotos em concorrentes do
    // LCP, que é o oposto do que se quer.
    expect(fonte).toMatch(/priority=\{prioridade\}/);
    expect(fonte).toMatch(/fetchPriority=\{prioridade \? "high" : "auto"\}/);
  });
});

describe("a grade de /estoque chega no HTML servido", () => {
  it("a grade é o fallback do Suspense, não um retângulo vazio", () => {
    // É o único ponto dentro daquele boundary que o servidor de fato renderiza:
    // `Catalogo` usa `useSearchParams()` e bail para o cliente.
    const fonte = lerCodigo("src/app/estoque/page.tsx");

    // A grade tem de estar DENTRO do `fallback`, entre ele e o `<Catalogo>` —
    // é a posição que decide se ela existe no HTML ou só depois do JavaScript.
    const inicioDoFallback = fonte.indexOf("fallback={");
    const grade = fonte.indexOf("<GradeDeVeiculos");
    const catalogo = fonte.indexOf("<Catalogo");

    expect(inicioDoFallback).toBeGreaterThan(-1);
    expect(grade).toBeGreaterThan(inicioDoFallback);
    expect(grade).toBeLessThan(catalogo);
    expect(fonte).not.toMatch(/fallback=\{<div className="min-h-\[60vh\]" \/>\}/);
  });

  it("a grade compartilhada é server component", () => {
    const fonte = ler("src/components/modernist/GradeDeVeiculos.tsx");
    expect(fonte.trimStart().startsWith('"use client"')).toBe(false);
  });
});
