import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PaginaDeEstoque from "../src/components/modernist/PaginaDeEstoque";
import { lerCodigo } from "./fonte";
import { ACOES, ACOES_DE_LEADS } from "../src/lib/turnstile";
import type { Veiculo } from "../src/types";

/**
 * O formulário de encomenda aparece onde a grade está vazia — e só ali.
 *
 * A guarda é a MESMA que já governa o bloco de saída do hub (`veiculos.length
 * > 0 ? grade : saída`), e mora em `PaginaDeEstoque`. Deixá-la na rota faria
 * cada hub decidir por conta própria, e o hub de modelo esqueceria dela no
 * primeiro refactor — sem nada quebrar na tela, porque um formulário a mais
 * numa página com estoque não parece defeito, parece escolha.
 *
 * Renderizado de verdade, sem Supabase: `PaginaDeEstoque` é o componente que
 * as duas rotas montam, e é a saída dele que o rastreador e o cliente veem.
 */

function veiculo(id: string): Veiculo {
  return {
    id,
    marca: "Toyota",
    modelo: "Corolla",
    versao: "XEi 2.0",
    ano: 2022,
    preco_original: 120000,
    preco_promocional: 0,
    quilometragem: 30000,
    tipo: "Sedan",
    vendido: false,
    whatsapp_images: [],
    web_full_images: [],
  } as unknown as Veiculo;
}

/** Um dublê: o formulário real é client component com Turnstile e fetch. */
const FORMULARIO = createElement("div", { "data-teste": "encomenda" }, "Encomende seu carro");

function pagina(veiculos: Veiculo[]) {
  return renderToStaticMarkup(
    createElement(PaginaDeEstoque, {
      trilha: [{ rotulo: "Home", href: "/" }],
      titulo: "Toyota Corolla seminovo em Curitiba",
      veiculos,
      caminho: "/carros/toyota/corolla",
      encomenda: FORMULARIO,
    }),
  );
}

describe("o formulário segue a mesma guarda da grade vazia", () => {
  it("hub SEM estoque renderiza o formulário", () => {
    expect(pagina([])).toContain('data-teste="encomenda"');
  });

  it("hub COM estoque não renderiza", () => {
    // Quem tem carro na grade não precisa encomendar — o formulário ali
    // competiria com o card do veículo que a pessoa veio ver.
    expect(pagina([veiculo("1")])).not.toContain('data-teste="encomenda"');
  });

  it("a saída para o estoque inteiro continua no hub vazio", () => {
    // Regra 6: a vitrine ordena, nunca esconde. "Ver todo o estoque" não pode
    // sumir por causa do formulário novo.
    expect(pagina([])).toMatch(/href="\/estoque"/);
  });
});

describe("as duas rotas de hub montam o formulário no lugar do wa.me", () => {
  it.each([
    ["src/app/[categoria]/[marca]/page.tsx", "hub de marca"],
    ["src/app/[categoria]/[marca]/[modelo]/page.tsx", "hub de modelo"],
  ])("%s (%s)", (caminho) => {
    const fonte = lerCodigo(caminho);

    expect(fonte).toMatch(/<EncomendaDeCarro\b/);
    // O `avisarHref` sai DESTAS duas rotas: o formulário ocupa o lugar dele.
    expect(fonte, "o wa.me continua como CTA principal do hub").not.toMatch(/avisarHref/);
  });

  it("o recorte de /estoque continua com o botão de WhatsApp", () => {
    // O handoff troca o CTA nos dois hubs de marca/modelo. Os recortes
    // (carroceria, faixa, perfil) ficam como estão — o formulário pede marca e
    // modelo, e ali não há nem um nem outro.
    expect(lerCodigo("src/app/estoque/[recorte]/page.tsx")).toMatch(/avisarHref/);
  });
});

describe("a ação do captcha existe dos dois lados", () => {
  it("`encomenda` está em ACOES e é aceita por /api/leads", () => {
    /*
     * Esquecer a segunda metade não dá erro de compilação e não quebra a tela:
     * o widget resolve o desafio, o token viaja, e o `siteverify` recusa pela
     * action — o visitante leva 403 num formulário que parece funcionar.
     */
    expect(ACOES.encomenda).toBe("encomenda");
    expect([...ACOES_DE_LEADS]).toContain(ACOES.encomenda);
  });

  it("o formulário declara essa ação, e não outra", () => {
    expect(lerCodigo("src/components/EncomendaDeCarro.tsx")).toMatch(/action=\{ACOES\.encomenda\}/);
  });
});
