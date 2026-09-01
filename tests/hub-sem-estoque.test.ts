import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PaginaDeEstoque from "../src/components/modernist/PaginaDeEstoque";
import { PERGUNTAS_POR_CAMINHO, perguntasDeCategoria } from "../src/lib/textoDosHubs";
import { ler } from "./fonte";
import type { Veiculo } from "../src/types";

/**
 * O hub sem carro deixa de ser beco, e o FAQ deixa de ser o mesmo em 103
 * páginas.
 *
 * Os dois vêm do relatório "Textos dos Hubs" (31/08), seção "três ajustes que
 * valem mais que o texto":
 *
 *   *"Hoje um hub sem carro é um beco. Quem busca um modelo específico e não
 *   acha é o lead mais qualificado que chega no site — e hoje ele volta para o
 *   Google."*
 *
 *   *"As quatro perguntas são iguais em todos os hubs. Se o de picape
 *   perguntasse 'qual a capacidade de carga?' (…) o mesmo espaço vira FAQPage
 *   com chance de aparecer direto na busca."*
 *
 * O que este arquivo trava, e por quê:
 *
 *   1. **A saída só aparece quando a grade está VAZIA.** Desenhar alternativa
 *      embaixo de uma grade cheia empurraria os carros da página para baixo —
 *      o hub existe para levar ao carro que ele promete.
 *   2. **Link vazio não vira botão.** `linkWhatsApp` devolve "" sem número
 *      configurado, e `wa.me/` sem número abre o WhatsApp numa tela de erro.
 *   3. **A pergunta específica vem PRIMEIRO**, e é ela que diferencia este hub
 *      dos outros 102.
 *   4. **Nenhuma resposta crava número.** Capacidade, consumo e parcela variam
 *      por unidade e por análise de crédito: `FAQPage` que não bate com a
 *      página vira ação manual no Search Console.
 */

const carro = (id: string, modelo: string): Veiculo =>
  ({
    id,
    marca: "Volkswagen",
    modelo,
    versao: "",
    ano: 2022,
    quilometragem: 30000,
    cambio: "Manual",
    combustivel: "Flex",
    cor: "Prata",
    fipe: "",
    preco_original: 80000,
    preco_promocional: 0,
    pericia: "",
    whatsapp_images: [],
    web_full_images: [],
    opcionais: "",
    laudo_pericia: "",
  }) as unknown as Veiculo;

const desenhar = (props: Partial<Parameters<typeof PaginaDeEstoque>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(PaginaDeEstoque, {
      trilha: [{ rotulo: "Home", href: "/" }],
      titulo: "Saveiro Seminova em Curitiba",
      veiculos: [],
      ...props,
    }),
  );

const semTag = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// ---------------------------------------------------------------------------

describe("a saída do hub sem carro", () => {
  it("grade vazia oferece avisar, alternativas e o catálogo", () => {
    const html = desenhar({
      alternativos: [carro("1", "Gol"), carro("2", "Polo")],
      rotuloAlternativos: "Enquanto isso, outros Volkswagen",
      avisarHref: "https://wa.me/5541999999999?text=oi",
    });
    const texto = semTag(html);
    expect(texto).toContain("AVISE-ME QUANDO ENTRAR");
    expect(texto).toContain("Enquanto isso, outros Volkswagen");
    expect(texto).toContain("VER TODO O ESTOQUE");
    // A alternativa é card de verdade, com link para a ficha — não um texto.
    expect(html).toContain("wa.me/5541999999999");
  });

  it("grade CHEIA não desenha saída nenhuma", () => {
    // Empurrar alternativa para baixo de uma grade cheia tiraria da dobra o
    // carro que a pessoa veio ver, que é a razão de a página existir.
    const html = desenhar({
      veiculos: [carro("1", "Saveiro")],
      alternativos: [carro("2", "Gol")],
      rotuloAlternativos: "Enquanto isso, outros Volkswagen",
      avisarHref: "https://wa.me/5541999999999?text=oi",
    });
    const texto = semTag(html);
    expect(texto).not.toContain("AVISE-ME QUANDO ENTRAR");
    expect(texto).not.toContain("Enquanto isso, outros Volkswagen");
  });

  it("sem número configurado, o botão some em vez de virar link quebrado", () => {
    const html = desenhar({ avisarHref: "", alternativos: [carro("1", "Gol")] });
    expect(semTag(html)).not.toContain("AVISE-ME QUANDO ENTRAR");
    // E o resto da saída continua de pé — a falta de número degrada, não mata.
    expect(semTag(html)).toContain("VER TODO O ESTOQUE");
  });

  it("sem alternativa, não desenha cabeçalho de seção vazia", () => {
    // Mesma regra que os blocos de links já aplicam: título seguido de nada é
    // ruído para quem lê e landmark vazio para leitor de tela.
    const html = desenhar({ alternativos: [], rotuloAlternativos: "Enquanto isso" });
    expect(semTag(html)).not.toContain("Enquanto isso");
  });

  it("o botão passa pelo componente com telemetria, não por um `<a>` solto", () => {
    // Regra 7 do CLAUDE.md: evento existente não some. CTA de WhatsApp novo
    // que não passe por `BotaoWhatsApp` nasce sem disparar `Contact`.
    const fonte = ler("src/components/modernist/PaginaDeEstoque.tsx");
    const i = fonte.indexOf("avisarHref &&");
    expect(i).toBeGreaterThan(-1);
    expect(fonte.slice(i, i + 400)).toContain("BotaoWhatsApp");
    expect(fonte.slice(i, i + 400)).toContain("origem=");
  });
});

describe("o FAQ deixa de ser o mesmo em todos os hubs", () => {
  it("sem caminho, continuam as quatro gerais", () => {
    const perguntas = perguntasDeCategoria("picapes", "f");
    expect(perguntas).toHaveLength(4);
    expect(perguntas[0].pergunta).toContain("laudo cautelar");
  });

  it("com caminho conhecido, a específica entra NA FRENTE", () => {
    const perguntas = perguntasDeCategoria("picapes", "f", "/estoque/picape");
    expect(perguntas).toHaveLength(5);
    expect(perguntas[0].pergunta).toBe("Qual a capacidade de carga das picapes?");
    // E as quatro gerais continuam, na mesma ordem, atrás dela.
    expect(perguntas[1].pergunta).toContain("laudo cautelar");
  });

  it("caminho sem entrada não quebra nem inventa pergunta", () => {
    const perguntas = perguntasDeCategoria("Jeep Renegade", "m", "/carros/jeep/renegade");
    expect(perguntas).toHaveLength(4);
  });

  it("toda pergunta específica é única — duas páginas iguais não somam nada", () => {
    const textos = Object.values(PERGUNTAS_POR_CAMINHO).flat().map((p) => p.pergunta);
    expect(new Set(textos).size).toBe(textos.length);
  });

  it("nenhuma resposta crava número que o estoque desminta", () => {
    // Capacidade, consumo e parcela variam por unidade e por análise. Resposta
    // com número fixo está errada em algum dos casos, e `FAQPage` que não bate
    // com a página vira ação manual no Search Console.
    const proibido = /(\d+\s?(kg|litros|km\/l|meses|vezes|x de)|R\$\s?\d)/i;
    for (const [caminho, perguntas] of Object.entries(PERGUNTAS_POR_CAMINHO)) {
      for (const p of perguntas) {
        expect(p.resposta, `${caminho}: ${p.pergunta}`).not.toMatch(proibido);
      }
    }
  });

  it("toda entrada aponta para um caminho de hub que existe", () => {
    // Chave errada é falha muda: a pergunta simplesmente nunca aparece, e
    // ninguém descobre porque a página segue respondendo 200.
    for (const caminho of Object.keys(PERGUNTAS_POR_CAMINHO)) {
      expect(caminho, caminho).toMatch(/^\/(estoque|carros|motos)\/[a-z0-9-]+(\/[a-z0-9-]+)?$/);
    }
  });

  it("as três rotas de hub passam o caminho — senão a específica nunca aparece", () => {
    for (const rota of [
      "src/app/estoque/[recorte]/page.tsx",
      "src/app/[categoria]/[marca]/page.tsx",
      "src/app/[categoria]/[marca]/[modelo]/page.tsx",
    ]) {
      const fonte = ler(rota);
      const i = fonte.indexOf("perguntasDeCategoria(");
      expect(i, rota).toBeGreaterThan(-1);
      // A chamada tem de terminar em `caminho)` — a mesma chave de textos_de_hub.
      expect(fonte.slice(i, i + 200), rota).toMatch(/perguntasDeCategoria\([^)]*caminho\)/);
    }
  });
});
