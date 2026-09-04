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
    `vitrine: de cada dez ${avaliados(genero)}, três entram. O laudo fica na ficha do carro assim ` +
    "que a perícia é aprovada, o preço " +
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

  // ---------------------------------------------------------------------------
  // UM parágrafo sobre perícia, não dois
  // ---------------------------------------------------------------------------
  // Medido em `/carros/volkswagen/saveiro` em 2026-08-31, a pedido do dono
  // ("é repetitivo e redundante"): a página afirmava a perícia cautelar
  // QUATRO vezes — este parágrafo, o `paragrafoDaSelecao` logo abaixo, o
  // selo "TODOS PASSAM PELA PERÍCIA CAUTELAR" e ainda a primeira pergunta da
  // FAQ. Duas delas vinham daqui.
  //
  // O que este parágrafo tem de próprio é a LISTA — sinistro, leilão, chassi,
  // km coerente, restrição —, que é informação específica e não se repete em
  // lugar nenhum. O que ele tinha de redundante era a moldura em volta: o
  // laudo estar na ficha, e o exame valer para toda faixa de preço. As duas
  // coisas o `paragrafoDaSelecao` já diz, com as mesmas palavras.
  //
  // Some a moldura, fica a lista. Vale para os 103 hubs de uma vez, que é o
  // que a edição manual não alcançaria: ninguém escreve cópia para 103
  // páginas.
  paragrafos.push(
    `${No(genero)} ${nome} ${usado(genero)}, a perícia olha primeiro o histórico: sinistro, leilão, ` +
      "chassi, quilometragem coerente com o ano e restrição de documento.",
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
 * A pergunta que só ESTA página responde.
 *
 * Achado do relatório "Textos dos Hubs" (31/08): *"as quatro perguntas são
 * iguais em todos os hubs. Se o de picape perguntasse 'qual a capacidade de
 * carga?' e o de primeiro carro 'aceita CNH provisória?', o mesmo espaço vira
 * FAQPage com chance de aparecer direto na busca — e responde a objeção que
 * trava a conversa"*.
 *
 * Chaveado pelo CAMINHO, a mesma chave de `textos_de_hub`: quem editar o texto
 * de uma página no painel encontra a pergunta dela no mesmo endereço.
 *
 * Duas regras que valem para toda entrada nova aqui:
 *
 *   1. **Nenhuma resposta inventa número.** Capacidade de carga, consumo e
 *      parcela variam por unidade e por análise — quem responde com número
 *      fixo está mentindo em algum dos casos, e `FAQPage` que não bate com a
 *      página vira ação manual no Search Console.
 *   2. **Verdadeira com zero carros.** Ela fala da categoria e do critério da
 *      loja, nunca do que está no pátio hoje.
 */
export const PERGUNTAS_POR_CAMINHO: Record<string, PerguntaFrequente[]> = {
  // ---- carroceria ----------------------------------------------------------
  "/estoque/picape": [
    {
      pergunta: "Qual a capacidade de carga das picapes?",
      resposta:
        "Depende da versão: cabine simples carrega mais que cabine dupla no mesmo modelo, e a " +
        "diferença entre uma picape compacta e uma média é grande. A capacidade oficial de cada " +
        "unidade fica na ficha do veículo — e, se a carga for o motivo da compra, vale dizer o que " +
        "você transporta para conferirmos junto antes de você vir.",
    },
  ],
  "/estoque/suv": [
    {
      pergunta: "Qual a diferença de custo entre um SUV compacto e um médio?",
      resposta:
        "Ela aparece menos na compra e mais no ano: pneu maior, seguro mais caro e revisão de " +
        "componentes maiores. Se o uso é escola, trabalho e uma viagem no feriado, o compacto " +
        "costuma resolver por bem menos. Um consultor faz essa conta com você usando os dois " +
        "modelos que estiver considerando.",
    },
  ],
  "/estoque/hatch": [
    {
      pergunta: "Hatch cabe em vaga de prédio antigo?",
      resposta:
        "Na maioria dos casos sim — é a categoria com as menores dimensões externas do mercado. " +
        "Ainda assim, vaga apertada é questão de centímetros: traga a medida da sua e a gente " +
        "confere na ficha antes do test drive, em vez de você descobrir na garagem.",
    },
  ],
  "/estoque/sedan": [
    {
      pergunta: "Sedã cabe mala de viagem sem rebater o banco?",
      resposta:
        "É justamente o que ele resolve melhor que o hatch: porta-malas fechado, separado da " +
        "cabine, que leva malas grandes em pé. O volume exato varia por modelo e está na ficha. " +
        "Se quiser certeza, traga a mala que você usa e ponha dentro no showroom.",
    },
  ],
  "/estoque/perua": [
    {
      pergunta: "Perua serve para quem precisa de espaço mas não quer um SUV?",
      resposta:
        "Serve, e é o argumento dela: porta-malas de utilitário com altura e comportamento de " +
        "carro baixo, o que significa dirigir melhor, gastar menos e caber em garagem de prédio " +
        "antigo. Quem enfrenta estrada de terra com frequência é que vai sentir falta do vão livre.",
    },
  ],
  "/estoque/van": [
    {
      pergunta: "Como sei se a minha carga cabe?",
      resposta:
        "As medidas que decidem são altura interna, largura entre as caixas de roda e altura da " +
        "soleira. Elas variam muito entre modelos e ficam na ficha de cada veículo. Mande as " +
        "medidas da sua carga pelo WhatsApp: a gente confere antes e diz se cabe de pé, deitada, " +
        "ou se não cabe.",
    },
  ],
  "/estoque/utilitario": [
    {
      pergunta: "Utilitário usado de frota vale a pena?",
      resposta:
        "Pode valer, desde que o histórico acompanhe. Veículo de frota costuma ter manutenção " +
        "registrada e rodar mais quilômetro por ano que o de pessoa física — o que importa é se as " +
        "revisões seguiram a quilometragem. Todo veículo aqui passa por perícia cautelar " +
        "independente antes de ser anunciado, e o laudo fica na ficha assim que aprovado.",
    },
  ],

  // ---- perfil de uso -------------------------------------------------------
  "/estoque/primeiro-carro": [
    {
      pergunta: "Quem tem CNH provisória pode comprar e financiar?",
      resposta:
        "Comprar e dirigir, sim — a permissão provisória vale como habilitação. O financiamento é " +
        "outra conversa: cada banco tem a própria política para condutor recém-habilitado, e a " +
        "aprovação depende de análise de crédito, não da carteira. Traga a sua situação para um " +
        "consultor simular com os bancos com quem trabalhamos.",
    },
  ],
  "/estoque/urbano": [
    {
      pergunta: "Câmbio automático vale a pena para quem só roda na cidade?",
      resposta:
        "No trânsito parado, quase sempre — é onde ele mais compensa em conforto. A ressalva é o " +
        "tipo de câmbio: automatizado de marcha única costuma cansar em rampa, e o automático " +
        "convencional cobra mais na manutenção. Vale dirigir os dois no mesmo dia antes de decidir.",
    },
  ],
  "/estoque/economico": [
    {
      pergunta: "O carro mais econômico é sempre o mais barato de manter?",
      resposta:
        "Não. Consumo é a parte visível; seguro, IPVA, pneu, revisão e preço de peça são a conta " +
        "que aparece depois. Um modelo que faz um quilômetro por litro a mais e tem peça cara " +
        "costuma perder no primeiro conserto. Diga quantos quilômetros você roda por mês e a gente " +
        "compara pela conta do ano.",
    },
  ],
  "/estoque/familia": [
    {
      pergunta: "Como sei se a cadeirinha instala bem no carro?",
      resposta:
        "O que decide é a presença de pontos Isofix, a largura do banco traseiro e o quanto a porta " +
        "de trás abre. Isso não se resolve por ficha técnica: traga a cadeirinha que você usa e " +
        "instale no showroom. Leva cinco minutos e responde de uma vez.",
    },
  ],
  "/estoque/estrada": [
    {
      pergunta: "Quilometragem alta é problema em carro de estrada?",
      resposta:
        "Menos do que parece — estrada é o uso menos agressivo que existe para um motor. O que " +
        "importa é o histórico de manutenção e o estado de suspensão, freio e pneus. Carro parado " +
        "por muito tempo costuma dar mais dor de cabeça que carro rodado com revisão em dia.",
    },
  ],
  "/estoque/trabalho": [
    {
      pergunta: "Dá para usar como pessoa jurídica e abater na declaração?",
      resposta:
        "A venda pode ser faturada para CNPJ, e muitos clientes compram assim. O que a loja não faz " +
        "é orientação contábil: se o abatimento se aplica ao seu caso, quem responde é a sua " +
        "contabilidade. Avise antes de fechar para emitirmos a documentação no nome certo.",
    },
  ],
  "/estoque/performance": [
    {
      pergunta: "Como saber se o carro foi preparado ou remapeado?",
      resposta:
        "É a pergunta certa, e nem sempre o vendedor anterior conta. Os sinais são chicote com " +
        "emenda, central com módulo adicional e escapamento fora do original. Todo veículo aqui " +
        "passa por perícia cautelar independente antes de ser anunciado, e o que ela encontrar fica " +
        "escrito na ficha.",
    },
  ],

  // ---- faixa de preço ------------------------------------------------------
  "/estoque/ate-60-mil": [
    {
      pergunta: "Nessa faixa, o que mais reprova um carro na avaliação?",
      resposta:
        "Sinistro de médio porte, passagem por leilão e divergência de numeração. São exatamente as " +
        "coisas que fazem um veículo custar menos do que deveria — e o motivo de a perícia cautelar " +
        "vir antes do anúncio. De cada dez que avaliamos, três entram no showroom.",
    },
  ],
  "/estoque/60-a-100-mil": [
    {
      pergunta: "Vale mais um hatch completo ou um SUV de entrada?",
      resposta:
        "Depende do que você faz com o carro, não do que ele parece. O hatch completo entrega mais " +
        "conforto e itens pelo mesmo dinheiro; o SUV de entrega entrega posição de dirigir e altura, " +
        "e cobra em consumo e manutenção. Venha ver os dois no mesmo dia — vinte minutos de volante " +
        "resolvem melhor que qualquer comparativo.",
    },
  ],
  "/estoque/acima-100-mil": [
    {
      pergunta: "Vocês aceitam mais de um carro na troca?",
      resposta:
        "Avaliamos mais de um veículo na entrada, sim, e é comum nessa faixa. Cada um passa pela " +
        "mesma avaliação, com base na Tabela FIPE e no giro do nosso estoque. Comece pela Avaliação " +
        "Express online e um consultor fecha os detalhes no showroom.",
    },
  ],
};

/**
 * Perguntas de página de categoria.
 *
 * São as mesmas que a loja responde no balcão — e precisam continuar
 * verdadeiras depois do próximo giro de estoque, porque `FAQPage` que não bate
 * com a página vira ação manual no Search Console.
 *
 * O artigo concorda com `rotulo`: "**As** picapes", "**A** Volkswagen Saveiro",
 * "**Os** SUVs". Estava cravado em "Os", e ia para o JSON-LD assim.
 *
 * `caminho` traz a pergunta específica da página para a FRENTE das quatro
 * gerais (2026-09-01). Vem primeiro de propósito: é a que diferencia este hub
 * dos outros 102, e é a que tem chance de virar resposta direta na busca. Sem
 * `caminho`, ou sem entrada em `PERGUNTAS_POR_CAMINHO`, a página fica só com as
 * quatro — que continuam sendo um FAQ honesto, não um placeholder.
 */
export function perguntasDeCategoria(
  rotulo: string,
  genero: Genero = "m",
  caminho?: string,
): PerguntaFrequente[] {
  const especificas = caminho ? (PERGUNTAS_POR_CAMINHO[caminho] ?? []) : [];
  return [
    ...especificas,
    {
      pergunta: `${O(genero, true)} ${rotulo} da Motors Store têm laudo cautelar?`,
      /* "assim que a perícia é aprovada", e não "na ficha" seco: a ficha só
         abre o bloco do laudo com a perícia APROVADA
         (`PDPClientWrapper.tsx`), e em 2026-09-03 dezessete dos trinta e seis
         veículos publicados estavam "EM ANÁLISE". A resposta antiga prometia,
         para metade da vitrine, uma coisa que a ficha não entregava — e é a
         resposta que um assistente de IA cita como se fosse a loja falando. */
      resposta:
        "Sim. Todo veículo passa por perícia cautelar independente antes de entrar na vitrine, e o laudo fica disponível " +
        "na ficha do carro assim que a perícia é aprovada. É o mesmo exame para qualquer faixa de preço.",
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
