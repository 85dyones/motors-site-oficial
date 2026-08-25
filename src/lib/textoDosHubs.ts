import type { Veiculo } from "../types";
import { formatarPreco } from "../components/modernist/primitivos";
import type { PerguntaFrequente } from "../components/modernist/PaginaDeEstoque";

/**
 * O texto das páginas perenes — escrito a partir do estoque, não de molde.
 *
 * O plano de aquisição pede "150–250 palavras sobre a marca no contexto de
 * seminovos em Curitiba" em cada hub. O caminho fácil seria um parágrafo com
 * `{marca}` interpolado — e seria exatamente a página doorway que o §2.3.3 do
 * mesmo plano manda não criar: trinta páginas idênticas trocando uma palavra.
 *
 * Aqui o texto sai de dado real: quantas unidades, de que anos, em que faixa,
 * quais versões, o que a perícia olha naquela carroceria. Duas marcas nunca
 * geram o mesmo parágrafo porque não têm o mesmo estoque, e o texto envelhece
 * junto com a vitrine em vez de mentir depois do primeiro giro.
 *
 * ---------------------------------------------------------------------------
 * Vocabulário
 * ---------------------------------------------------------------------------
 * `conteudo-seo/POSICIONAMENTO.md` (decidido com o dono em 2026-08-17) é lei
 * aqui: **"seleção", nunca "premium"**; "perícia cautelar independente", nunca
 * "vistoriado"; e o diferencial é o que a loja RECUSA — *de cada dez avaliados,
 * três entram* —, porque garantia e laudo todo concorrente do Bacacheri
 * também alega. Nada neste arquivo pode prometer o que a loja não cumpre.
 */

/** Âncora geográfica que toda página perene repete. Fonte: POSICIONAMENTO §Geografia. */
export const BAIRRO_DA_LOJA = "Bacacheri";
export const CIDADE_DA_LOJA = "Curitiba";

interface ResumoDeTexto {
  total: number;
  anoMin: number | null;
  anoMax: number | null;
  precoMin: number | null;
  precoMax: number | null;
  automaticos: number;
}

function resumir(veiculos: Veiculo[]): ResumoDeTexto {
  const anos = veiculos.map((v) => v.ano).filter((a) => a > 0);
  const precos = veiculos
    .map((v) =>
      v.preco_promocional > 0 && v.preco_promocional < v.preco_original
        ? v.preco_promocional
        : v.preco_original,
    )
    .filter((p) => p > 0);

  return {
    total: veiculos.length,
    anoMin: anos.length ? Math.min(...anos) : null,
    anoMax: anos.length ? Math.max(...anos) : null,
    precoMin: precos.length ? Math.min(...precos) : null,
    precoMax: precos.length ? Math.max(...precos) : null,
    automaticos: veiculos.filter((v) => /autom/i.test(v.cambio ?? "")).length,
  };
}

/** "de 2019 a 2023", "de 2021" — ou "" quando o estoque não sabe o ano. */
function trechoDeAnos(r: ResumoDeTexto): string {
  if (r.anoMin === null || r.anoMax === null) return "";
  return r.anoMin === r.anoMax ? `de ${r.anoMin}` : `de ${r.anoMin} a ${r.anoMax}`;
}

/** "a partir de R$ 62.900" ou "entre R$ 62.900 e R$ 189.900". */
function trechoDePrecos(r: ResumoDeTexto): string {
  if (r.precoMin === null || r.precoMax === null) return "";
  return r.precoMin === r.precoMax
    ? `por ${formatarPreco(r.precoMin)}`
    : `entre ${formatarPreco(r.precoMin)} e ${formatarPreco(r.precoMax)}`;
}

/** Lista em português: "A, B e C". */
function enumerar(itens: string[]): string {
  const limpos = itens.filter(Boolean);
  if (limpos.length === 0) return "";
  if (limpos.length === 1) return limpos[0];
  return `${limpos.slice(0, -1).join(", ")} e ${limpos[limpos.length - 1]}`;
}

/** O parágrafo que toda página perene fecha — a única afirmação que ninguém copia. */
function paragrafoDaSelecao(): string {
  return (
    "Todo veículo que entra passa por perícia cautelar independente antes de ir para a " +
    "vitrine: de cada dez avaliados, três entram. O laudo fica na ficha do carro, o preço " +
    `está no anúncio e o showroom fica no ${BAIRRO_DA_LOJA}, em ${CIDADE_DA_LOJA} — dá para ` +
    "ver o carro, dirigir e conferir a documentação no mesmo dia."
  );
}

/** Texto do hub de marca. */
export function textoDeMarca(marca: string, veiculos: Veiculo[], modelos: string[]): string[] {
  const r = resumir(veiculos);
  const paragrafos: string[] = [];

  if (r.total === 0) {
    paragrafos.push(
      `A Motors Store já vendeu ${marca} e volta a receber. Esta página fica no ar mesmo sem ` +
        `unidade disponível: quando um ${marca} entrar no estoque, é aqui que ele aparece primeiro.`,
    );
  } else {
    const anos = trechoDeAnos(r);
    const precos = trechoDePrecos(r);
    paragrafos.push(
      `São ${r.total} ${r.total === 1 ? "unidade" : "unidades"} ${marca} em estoque hoje ` +
        `${anos ? `${anos}, ` : ""}${precos ? `${precos}, ` : ""}` +
        `à venda no showroom do ${BAIRRO_DA_LOJA}, em ${CIDADE_DA_LOJA}.` +
        (r.automaticos > 0
          ? ` ${r.automaticos === r.total ? "Todas" : `${r.automaticos} delas`} com câmbio automático.`
          : ""),
    );
  }

  if (modelos.length > 0) {
    paragrafos.push(
      `Modelos ${marca} que já passaram pela seleção: ${enumerar(modelos.slice(0, 8))}. ` +
        "Cada um tem página própria com as versões, os anos e a faixa de preço praticada aqui.",
    );
  }

  paragrafos.push(paragrafoDaSelecao());
  return paragrafos;
}

/** Texto do hub de modelo. */
export function textoDeModelo(marca: string, modelo: string, veiculos: Veiculo[]): string[] {
  const r = resumir(veiculos);
  const nome = `${marca} ${modelo}`.trim();
  const paragrafos: string[] = [];

  if (r.total === 0) {
    paragrafos.push(
      `Sem ${nome} disponível neste momento. A página continua no ar porque o modelo faz parte ` +
        "do que a Motors Store compra: assim que um passar na perícia, entra aqui.",
    );
  } else {
    const anos = trechoDeAnos(r);
    const precos = trechoDePrecos(r);
    const versoes = enumerar(
      [...new Set(veiculos.map((v) => (v.versao ?? "").trim()).filter(Boolean))].slice(0, 6),
    );
    paragrafos.push(
      `${r.total} ${nome} ${r.total === 1 ? "disponível" : "disponíveis"} em ${CIDADE_DA_LOJA} ` +
        `${anos ? `${anos}, ` : ""}${precos ? `${precos}. ` : ". "}` +
        (versoes ? `Versões em estoque: ${versoes}.` : ""),
    );
  }

  paragrafos.push(
    `No ${nome} usado, o que a perícia cautelar olha primeiro é o histórico: sinistro, leilão, ` +
      "chassi, quilometragem coerente com o ano e restrição de documento. O laudo de cada " +
      "unidade fica na ficha do veículo — é o mesmo exame para o carro de entrada e para o mais caro da vitrine.",
  );

  paragrafos.push(paragrafoDaSelecao());
  return paragrafos;
}

/** Texto do hub de carroceria. */
export function textoDeCarroceria(carroceria: string, veiculos: Veiculo[]): string[] {
  const r = resumir(veiculos);
  const plural = `${carroceria.toLowerCase()}s`;
  const paragrafos: string[] = [];

  if (r.total === 0) {
    paragrafos.push(
      `Sem ${plural} em estoque neste momento. O giro é semanal — vale conferir o catálogo ` +
        "completo ou falar com um consultor para ser avisado quando entrar.",
    );
  } else {
    const anos = trechoDeAnos(r);
    const precos = trechoDePrecos(r);
    const marcas = enumerar([...new Set(veiculos.map((v) => v.marca))].slice(0, 6));
    paragrafos.push(
      `${r.total} ${r.total === 1 ? carroceria.toLowerCase() : plural} ${anos ? `${anos} ` : ""}` +
        `${precos ? `${precos}, ` : ""}em ${CIDADE_DA_LOJA}.` +
        (marcas ? ` Marcas em estoque: ${marcas}.` : ""),
    );
  }

  paragrafos.push(paragrafoDaSelecao());
  return paragrafos;
}

/**
 * Perguntas de página de categoria.
 *
 * São as mesmas que a loja responde no balcão — e precisam continuar
 * verdadeiras depois do próximo giro de estoque, porque `FAQPage` que não bate
 * com a página vira ação manual no Search Console.
 */
export function perguntasDeCategoria(rotulo: string): PerguntaFrequente[] {
  return [
    {
      pergunta: `Os ${rotulo} da Motors Store têm laudo cautelar?`,
      resposta:
        "Sim. Todo veículo passa por perícia cautelar independente antes de entrar na vitrine, " +
        "e o laudo fica disponível na ficha do carro. É o mesmo exame para qualquer faixa de preço.",
    },
    {
      pergunta: "Vocês aceitam meu carro usado na troca?",
      resposta:
        "Aceitamos. A avaliação é feita no showroom em cerca de 10 minutos, com base na Tabela " +
        "FIPE e no giro do nosso estoque, e vale como entrada. Dá para começar pela Avaliação Express, online.",
    },
    {
      pergunta: "Tem financiamento? Em quantas vezes?",
      resposta:
        "Sim, com aprovação em múltiplos bancos e simulação na própria ficha do veículo. " +
        "As condições dependem de análise de crédito — a simulação do site é estimativa, não proposta.",
    },
    {
      pergunta: `Onde vejo os ${rotulo} pessoalmente?`,
      resposta:
        `No showroom da Motors Store, na Rua Ernesto Piazzetta, 98 — ${BAIRRO_DA_LOJA}, ` +
        `${CIDADE_DA_LOJA}. De segunda a sexta das 8h30 às 18h30 e aos sábados das 8h30 às 15h.`,
    },
  ];
}
