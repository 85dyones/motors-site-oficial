import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";

/**
 * Cada página com o seu `<title>` — e nada reescrevendo isso depois.
 *
 * A auditoria de 24/08/2026 (§0.5.2 do plano de aquisição) reportou o site
 * inteiro devolvendo `Motors Store | Fora da Curva` e chamou isso de "o defeito
 * de maior impacto do plano inteiro". O HTML servido, porém, estava correto
 * desde o P3 da `docs/RECOMENDACAO_SEO.md` — quem lê só o HTML não vê o
 * problema.
 *
 * A causa estava no cliente: `ThemeContext` tinha um efeito global que fazia
 * `document.title = tabTitle` assim que as configurações chegavam do
 * `/api/settings`. O Google renderiza a página antes de indexar, então via o
 * título reescrito. Cinquenta páginas com um título só, no campo de maior peso
 * de relevância on-page.
 *
 * Estes testes leem o fonte porque o efeito era invisível em qualquer teste de
 * HTML: só existe depois da hidratação.
 */

const CONTEXTO = "src/app/ThemeContext.tsx";
const LAYOUT = "src/app/layout.tsx";
const HOME = "src/app/page.tsx";

describe("nada reescreve `document.title` em tempo de execução", () => {
  it("o ThemeContext não atribui `document.title`", () => {
    const fonte = lerCodigo(CONTEXTO);
    // Recriar o efeito volta a achatar o título de todas as páginas — e o
    // sintoma leva semanas para aparecer, porque só o rastreador o enxerga.
    expect(fonte).not.toMatch(/document\.title\s*=/);
  });

  it("nenhum componente do site público atribui `document.title`", () => {
    for (const arquivo of [LAYOUT, HOME, "src/components/IntegrationsTracker.tsx"]) {
      expect(lerCodigo(arquivo)).not.toMatch(/document\.title\s*=/);
    }
  });
});

describe("as páginas públicas declaram título próprio", () => {
  it("a home tem título de busca, não a frase de marca", () => {
    const fonte = ler(HOME);

    // Era a única página sem título próprio: herdava o `tabTitle` do layout.
    expect(fonte).toMatch(/title:\s*"[^"]*Curitiba[^"]*"/);
    expect(fonte).toMatch(/Seminovos/);
  });

  it("o `tabTitle` do painel continua valendo como título herdado", () => {
    // A funcionalidade não foi removida — mudou de lugar. Quem não declara
    // título (as rotas privadas) segue recebendo o do painel.
    expect(ler(LAYOUT)).toMatch(/title:\s*tabTitle/);
  });
});

describe("o catálogo e os hubs dizem o que vendem e onde", () => {
  it.each([
    // O título do catálogo agora tem duas formas — com e sem a contagem —
    // porque "— 0 Ofertas" é o mesmo defeito do "0" no `<h1>` das faixas.
    ["src/app/estoque/page.tsx", /`Carros Seminovos em Curitiba — \$\{total\} Ofertas/],
    ["src/app/estoque/page.tsx", /"Carros Seminovos em Curitiba \| Motors Store"/],
    // Os três hubs não trazem mais "Seminovo" cravado: a palavra concorda com
    // o gênero do que a página vende — "Saveiro Seminova", "SUVs Seminovos".
    // O que o teste prende é que "em Curitiba" continua no título e que a
    // forma vem do helper, não de uma string fixa.
    ["src/app/[categoria]/[marca]/page.tsx", /\$\{Novo\} em Curitiba/],
    ["src/app/[categoria]/[marca]/[modelo]/page.tsx", /\$\{Novo\} em Curitiba/],
    ["src/app/estoque/[recorte]/page.tsx", /\$\{Novas\} em Curitiba/],
    ["src/app/estoque/[recorte]/page.tsx", /Seminovos \$\{faixa\.nome\} em Curitiba/],
    ["src/app/financiamento/page.tsx", /Financiamento de Carro Seminovo em Curitiba/],
    ["src/app/garantia/page.tsx", /Garantia do Seminovo em Curitiba/],
  ])("%s", (arquivo, esperado) => {
    expect(ler(arquivo)).toMatch(esperado);
  });
});

describe("o `<h1>` da ficha não é mais só marca e modelo", () => {
  it("carrega versão, ano e cidade", () => {
    const fonte = ler("src/components/PDPClientWrapper.tsx");

    // §0.5.5 item 1: o H1 era `Jeep Renegade`, com a versão num <p> fora dele.
    expect(fonte).toMatch(/complementoDoTitulo/);
    expect(fonte).toMatch(/veiculo\.ano \? String\(veiculo\.ano\) : ""/);
    expect(fonte).toMatch(/"Curitiba",/);
  });
});
