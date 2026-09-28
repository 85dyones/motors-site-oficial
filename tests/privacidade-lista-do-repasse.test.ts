import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";

/**
 * As quatro inserções da spec §7.4, APROVADAS pelo dono em 24/09, na
 * `/privacidade` — no mesmo PR que liga o formulário da lista (a régua do
 * registro de erros de 11/09: a finalidade é declarada antes de a coleta
 * começar). O texto é conferido como a pessoa o lê: sem comentário, sem tag,
 * com o espaço colapsado.
 */
const POLITICA = "src/app/privacidade/page.tsx";
const codigo = lerCodigo(POLITICA);
const naTela = (fonte: string) =>
  fonte
    .replace(/\{"\s*"\}/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();

function secao(id: string, proxima: string): string {
  const inicio = codigo.indexOf(`<Secao id="${id}"`);
  const fim = codigo.indexOf(`<Secao id="${proxima}"`, inicio);
  expect(inicio, `seção ${id}`).toBeGreaterThan(-1);
  expect(fim, `seção ${proxima}`).toBeGreaterThan(inicio);
  return naTela(codigo.slice(inicio, fim));
}

describe("a /privacidade declara a lista do repasse (§7.4)", () => {
  it("em Quais dados coletamos, depois do parágrafo dos formulários", () => {
    const dados = secao("dados", "finalidades");
    const frase =
      "Quando você entra na lista do repasse. Pedimos nome e WhatsApp, a faixa de preço e os tipos de carro que você procura. Se você é lojista, pedimos também o CNPJ, o nome da loja e a cidade.";
    expect(dados).toContain(frase);
    expect(dados.indexOf(frase)).toBeGreaterThan(dados.indexOf("Quando você preenche um formulário."));
    expect(dados.indexOf(frase)).toBeLessThan(dados.indexOf("Enquanto você navega."));
  });

  it("em Para que usamos, o item novo", () => {
    expect(secao("finalidades", "bases-legais")).toContain(
      "Avisar sobre carros de repasse. Quem está na lista recebe pelo WhatsApp os carros de repasse que combinam com a faixa e os tipos informados. Lojistas cadastrados recebem o aviso antes de o carro abrir para todos. Quem envia é uma pessoa da nossa equipe, não um disparo automático.",
    );
  });

  it("em Bases legais, o Consentimento volta — para a lista", () => {
    expect(secao("bases-legais", "cookies")).toContain(
      "Consentimento — para a lista do repasse. Você escolhe entrar e pode sair quando quiser, pedindo pelo WhatsApp ou pelos canais da seção Como falar conosco.",
    );
    // O comentário que dizia que o item saiu em 31/08 passa a dizer que ele voltou, e por quê.
    expect(ler(POLITICA)).toContain('o item "Consentimento" volta, com outra finalidade');
  });

  it("em Por quanto tempo guardamos, depois do parágrafo dos dados de contato", () => {
    const retencao = secao("retencao", "direitos");
    const frase =
      "Os dados da lista do repasse ficam guardados enquanto você estiver na lista. Quando você sai, apagamos a faixa de preço, os tipos de carro e, no caso de lojistas, o CNPJ e os dados da loja. O registro de contato segue a regra do parágrafo acima.";
    expect(retencao).toContain(frase);
    expect(retencao.indexOf(frase)).toBeGreaterThan(retencao.indexOf("Esses dados de contato"));
    expect(retencao.indexOf(frase)).toBeLessThan(retencao.indexOf("Dados de navegação e publicidade"));
  });

  it("nenhuma inserção fala em aceite (a trava B.6 vale para a página inteira)", () => {
    for (const [id, proxima] of [
      ["dados", "finalidades"],
      ["finalidades", "bases-legais"],
      ["bases-legais", "cookies"],
      ["retencao", "direitos"],
    ]) {
      expect(secao(id, proxima)).not.toMatch(/aceit/i);
    }
  });
});
