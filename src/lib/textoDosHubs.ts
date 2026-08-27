import type { Veiculo } from "../types";
import { formatarPreco } from "../components/modernist/primitivos";
import type { PerguntaFrequente } from "../components/modernist/PaginaDeEstoque";
import type { PerfilDeUso } from "./perfisDeUso";
import {
  avaliados,
  concordar,
  No,
  O,
  um,
  usado,
  type Genero,
} from "./generoDoVeiculo";

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
 *
 * ---------------------------------------------------------------------------
 * Concordância
 * ---------------------------------------------------------------------------
 * Nenhuma função aqui crava "seminovo", "usado" ou "os". Até 2026-08-25 elas
 * cravavam o masculino, e o dono apontou o resultado: *"a Volkswagen Saveiro",
 * não "o Volkswagen Saveiro"*. O gênero chega por parâmetro, vindo de
 * `lib/generoDoVeiculo.ts`, e quem monta o hub o calcula a partir do histórico.
 *
 * ⚠️ Ao escrever frase nova aqui, **não** volte a cravar a forma masculina
 * porque "a maioria é masculina". Um quarto das páginas perenes não é.
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
function paragrafoDaSelecao(genero: Genero = "m"): string {
  return (
    "Todo veículo que entra passa por perícia cautelar independente antes de ir para a " +
    `vitrine: de cada dez ${avaliados(genero)}, três entram. O laudo fica na ficha do carro, o preço ` +
    `está no anúncio e o showroom fica no ${BAIRRO_DA_LOJA}, em ${CIDADE_DA_LOJA} — dá para ` +
    "ver o carro, dirigir e conferir a documentação no mesmo dia."
  );
}

/**
 * Texto do hub de marca.
 *
 * O gênero aqui é o do **segmento**, não o de um modelo: "Volkswagen" cobre a
 * Saveiro e o Polo ao mesmo tempo, e o que a página fala é "carros Volkswagen"
 * ou "motos Honda". Quem chama passa `generoDoSegmento(hub.segmento)`.
 */
export function textoDeMarca(
  marca: string,
  veiculos: Veiculo[],
  modelos: string[],
  genero: Genero = "m",
): string[] {
  const r = resumir(veiculos);
  const paragrafos: string[] = [];

  if (r.total === 0) {
    paragrafos.push(
      `A Motors Store já vendeu ${marca} e volta a receber. Esta página fica no ar mesmo sem ` +
        `unidade disponível: quando ${um(genero)} ${marca} entrar no estoque, é aqui que ` +
        `${concordar(genero, "ele", "ela")} aparece primeiro.`,
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

  paragrafos.push(paragrafoDaSelecao(genero));
  return paragrafos;
}

/** Texto do hub de modelo. */
export function textoDeModelo(
  marca: string,
  modelo: string,
  veiculos: Veiculo[],
  genero: Genero = "m",
): string[] {
  const r = resumir(veiculos);
  const nome = `${marca} ${modelo}`.trim();
  const paragrafos: string[] = [];

  if (r.total === 0) {
    paragrafos.push(
      `Sem ${nome} disponível neste momento. A página continua no ar porque o modelo faz parte ` +
        `do que a Motors Store compra: assim que ${um(genero)} passar na perícia, entra aqui.`,
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
    `${No(genero)} ${nome} ${usado(genero)}, o que a perícia cautelar olha primeiro é o histórico: sinistro, leilão, ` +
      "chassi, quilometragem coerente com o ano e restrição de documento. O laudo de cada " +
      "unidade fica na ficha do veículo — é o mesmo exame para o carro de entrada e para o mais caro da vitrine.",
  );

  paragrafos.push(paragrafoDaSelecao(genero));
  return paragrafos;
}

/**
 * Texto do hub de carroceria.
 *
 * `plural` e `genero` vêm prontos do hub (`HubDeCarroceria`), não são montados
 * aqui: o que havia era `` `${nome.toLowerCase()}s` ``, que escrevia
 * "Conversívels", "Hatchs" e — pior — "suvs", comendo a sigla no meio do `<h1>`.
 */
export function textoDeCarroceria(
  carroceria: string,
  veiculos: Veiculo[],
  plural: string,
  genero: Genero = "m",
): string[] {
  const r = resumir(veiculos);
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
      `${r.total} ${r.total === 1 ? carroceria : plural} ${anos ? `${anos} ` : ""}` +
        `${precos ? `${precos}, ` : ""}em ${CIDADE_DA_LOJA}.` +
        (marcas ? ` Marcas em estoque: ${marcas}.` : ""),
    );
  }

  paragrafos.push(paragrafoDaSelecao(genero));
  return paragrafos;
}

/** Texto do hub de faixa de preço. */
export function textoDeFaixaDePreco(faixa: string, veiculos: Veiculo[]): string[] {
  const r = resumir(veiculos);
  const paragrafos: string[] = [];

  if (r.total === 0) {
    paragrafos.push(
      `Sem veículos ${faixa} em estoque neste momento. Esta faixa faz parte do que a loja ` +
        "compra e volta a encher — o giro é semanal.",
    );
  } else {
    const anos = trechoDeAnos(r);
    const marcas = enumerar([...new Set(veiculos.map((v) => v.marca))].slice(0, 6));
    const carrocerias = enumerar(
      [...new Set(veiculos.map((v) => (v.tipo ?? "").trim()).filter(Boolean))].slice(0, 4),
    );
    paragrafos.push(
      `${r.total} ${r.total === 1 ? "veículo" : "veículos"} ${faixa} em ${CIDADE_DA_LOJA}` +
        `${anos ? `, ${anos}` : ""}.` +
        (marcas ? ` Marcas nesta faixa: ${marcas}.` : "") +
        (carrocerias ? ` Carrocerias: ${carrocerias}.` : ""),
    );
  }

  // Masculino porque o substantivo desta página é "veículos" em qualquer
  // faixa — mas passando pelo helper, para que a frase da casa tenha uma
  // origem só e o teste de fonte possa cobrar isso do arquivo inteiro.
  paragrafos.push(
    "A faixa de preço é o recorte, não o critério de entrada: o carro de R$ 30 mil passa pela " +
      "mesma perícia cautelar independente que o mais caro da vitrine. É o que permite " +
      `escalar para baixo sem baixar o crivo — de cada dez ${avaliados("m")}, três entram, em qualquer faixa.`,
  );

  paragrafos.push(paragrafoDaSelecao());
  return paragrafos;
}

/**
 * Texto do hub de perfil de uso.
 *
 * O argumento aqui é diferente do da carroceria e do da faixa. Carroceria é o
 * que o carro É, faixa é quanto custa — perfil é **para que serve**, e é a
 * única das três que a loja atribui à mão. Então o texto fala de recorte
 * curado, não de inventário.
 *
 * `frase` entra no meio da sentença ("quem procura espaço para a família") e
 * vem escrita de `lib/perfisDeUso.ts`, junto com o título. Montar a partir do
 * nome produziria "quem procura primeiro carro" em umas e "quem procura
 * performance" em outras — o mesmo erro dos plurais de carroceria.
 */
export function textoDePerfil(perfil: PerfilDeUso, veiculos: Veiculo[]): string[] {
  const r = resumir(veiculos);
  const paragrafos: string[] = [];

  if (r.total === 0) {
    paragrafos.push(
      `Nenhum veículo marcado para ${perfil.frase} neste momento. O recorte existe e volta a ` +
        "encher — o giro é semanal.",
    );
  } else {
    const anos = trechoDeAnos(r);
    const marcas = enumerar([...new Set(veiculos.map((v) => v.marca))].slice(0, 6));
    const carrocerias = enumerar(
      [...new Set(veiculos.map((v) => (v.tipo ?? "").trim()).filter(Boolean))].slice(0, 4),
    );
    paragrafos.push(
      `${r.total} ${r.total === 1 ? "veículo" : "veículos"} em ${CIDADE_DA_LOJA} para quem procura ` +
        `${perfil.frase}${anos ? `, ${anos}` : ""}.` +
        (carrocerias ? ` Carrocerias: ${carrocerias}.` : "") +
        (marcas ? ` Marcas: ${marcas}.` : ""),
    );
  }

  paragrafos.push(
    // Sem repetir "de cada dez, três entram": `paragrafoDaSelecao()` logo
    // abaixo já traz a estatística, e dizê-la duas vezes no mesmo texto
    // enfraquece as duas.
    "Este recorte é escolhido a dedo, não calculado: quem atende marca o que cada carro " +
      "resolve na prática, e o mesmo veículo aparece em mais de um uso quando serve para " +
      "mais de um. O que não muda é o crivo de entrada, igual para toda a vitrine.",
  );

  paragrafos.push(paragrafoDaSelecao());
  return paragrafos;
}

/**
 * Perguntas de página de categoria.
 *
 * São as mesmas que a loja responde no balcão — e precisam continuar
 * verdadeiras depois do próximo giro de estoque, porque `FAQPage` que não bate
 * com a página vira ação manual no Search Console.
 *
 * O artigo concorda com `rotulo`: "**As** picapes", "**A** Volkswagen Saveiro",
 * "**Os** SUVs". Estava cravado em "Os", e ia para o JSON-LD assim.
 */
export function perguntasDeCategoria(rotulo: string, genero: Genero = "m"): PerguntaFrequente[] {
  return [
    {
      pergunta: `${O(genero, true)} ${rotulo} da Motors Store têm laudo cautelar?`,
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
      pergunta: `Onde vejo ${O(genero, true).toLowerCase()} ${rotulo} pessoalmente?`,
      resposta:
        `No showroom da Motors Store, na Rua Ernesto Piazzetta, 98 — ${BAIRRO_DA_LOJA}, ` +
        `${CIDADE_DA_LOJA}. De segunda a sexta das 8h30 às 18h30 e aos sábados das 8h30 às 15h.`,
    },
  ];
}
