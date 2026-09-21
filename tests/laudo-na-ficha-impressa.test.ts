import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FichaImpressa from "../src/components/modernist/FichaImpressa";
import { TEXTO_LAUDO_PENDENTE } from "../src/lib/textoDoLaudo";
import { LAUDO_APROVADO_PADRAO } from "../src/lib/descritivo/laudoPadrao";
import { lerCodigo } from "./fonte";
import type { CompanySettings, Veiculo } from "../src/types";

/**
 * A folha impressa é entregue na mão do cliente, no balcão.
 *
 * Diferente da tela, ela não some quando o cadastro muda: o papel que sai
 * hoje continua afirmando amanhã. Em 21/09/2026, 33 dos 79 veículos não
 * vendidos liam "EM ANÁLISE" — uma afirmação de aprovação sem régua seriam
 * 33 folhas dizendo, com a marca da loja, que a perícia aprovou um carro
 * cuja perícia não aprovou.
 *
 * ---------------------------------------------------------------------------
 * Por que RENDERIZA, e não lê a fonte
 * ---------------------------------------------------------------------------
 * A primeira versão desta trava lia o arquivo como texto e conferia se a
 * afirmação aparecia depois de um `cautelar_100 ?` numa janela de 220
 * caracteres. Ela ficava VERDE com o ternário invertido —
 * `cautelar_100 ? "EM ANÁLISE" : "100% APROVADO"` — que é exatamente o bug
 * que ela existia para impedir: a janela acha a régua, mas não distingue o
 * lado verdadeiro do falso. Reproduzido antes de reescrever.
 *
 * É a quinta variante da mesma falha neste repositório. O docblock de
 * `src/components/BlocoLaudoPendente.tsx` conta as quatro anteriores, todas
 * por recortar fonte por texto, e todas verdes com a tela afirmando o que
 * não devia: "Recorte de fonte tem sempre uma borda a mais; saída
 * renderizada não tem." A solução lá foi renderizar; aqui também.
 */

/** O que o leitor vê: marcação fora, espaço normalizado. */
const texto = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&mdash;|&#x2014;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const VEICULO = {
  id: "aaaa-bbbb-8171616",
  marca: "Fiat",
  modelo: "Titano",
  versao: "Volcano 2.2 16V 4x4",
  ano: 2025,
  quilometragem: 42000,
  cambio: "Automático",
  combustivel: "Diesel",
  cor: "Vermelho",
  tipo: "Picape",
  fipe: "",
  preco_original: 184900,
  preco_promocional: 170900,
  pericia: "",
  whatsapp_images: [],
  web_full_images: [],
  opcionais: "",
  laudo_pericia: "",
  descricao_seo: "Picape média, topo de linha, praticamente nova.",
} as unknown as Veiculo;

const EMPRESA = {
  name: "Motors Store",
  phone: "(41) 99737-2165",
  whatsapp: "(41) 99737-2165",
  whatsappRaw: "5541997372165",
  address: "Rua Ernesto Piazzetta, 98 — Bacacheri, Curitiba/PR",
  hours: "Seg a Sex 08h30 às 18h30",
  instagram: "",
  facebook: "",
  cnpj: "51.007.666/0001-02",
} as unknown as CompanySettings;

/** A folha renderizada, em texto puro, para um veículo com ou sem cautelar. */
function folha(cautelar_100: boolean): string {
  return texto(
    renderToStaticMarkup(
      createElement(FichaImpressa, {
        veiculo: { ...VEICULO, cautelar_100 },
        empresa: EMPRESA,
        fotos: [],
        qr: null,
        modeloExibido: "Titano",
        versaoExibida: "Volcano 2.2 16V 4x4",
        codigo: "8171616",
      }),
    ),
  );
}

const APROVADA = ["100% APROVADO", "HISTÓRICO LIVRE DE SINISTRO E LEILÃO", LAUDO_APROVADO_PADRAO];

describe("a faixa do laudo na folha impressa", () => {
  it("a faixa sai nas duas — ela não deixa vão no leiaute", () => {
    expect(folha(true)).toContain("LAUDO CAUTELAR");
    expect(folha(false)).toContain("LAUDO CAUTELAR");
  });

  it("com a perícia aprovada, a folha afirma", () => {
    const saida = folha(true);
    for (const frase of APROVADA) expect(saida).toContain(frase);
  });

  it("SEM a perícia aprovada, nada na folha afirma aprovação", () => {
    // A trava central. Inverter o ternário faz este `it` reprovar — foi
    // conferido invertendo de verdade antes de mesclar.
    const saida = folha(false);
    for (const frase of APROVADA) {
      expect(saida, `a folha de um carro EM ANÁLISE afirmou: "${frase}"`).not.toContain(frase);
    }
  });

  it("o carro em análise recebe o texto pendente, não o silêncio", () => {
    const saida = folha(false);
    expect(saida).toContain("EM ANÁLISE");
    expect(saida).toContain("PERÍCIA CAUTELAR INDEPENDENTE");
    expect(saida).toContain(TEXTO_LAUDO_PENDENTE);
  });

  it("e a folha aprovada não carrega o texto pendente junto", () => {
    expect(folha(true)).not.toContain(TEXTO_LAUDO_PENDENTE);
  });

  it("as duas frases não estão copiadas dentro do componente", () => {
    // Uma verdade só: a redação aprovada foi fixada em 09/09 e o módulo
    // proíbe parafraseá-la. Cópia envelhece sozinha quando a constante muda.
    // (Esta é a única asserção de fonte que resta, e ela é negativa — não há
    // como satisfazê-la por acidente.)
    const fonte = lerCodigo("src/components/modernist/FichaImpressa.tsx");
    expect(fonte).not.toContain(LAUDO_APROVADO_PADRAO);
    expect(fonte).not.toContain(TEXTO_LAUDO_PENDENTE);
  });
});
