import type { PerguntaFrequente } from "../components/modernist/PaginaDeEstoque";

/**
 * Os guias — o único conteúdo editorial do site, e por que ele existe.
 *
 * `docs/RECOMENDACAO_SEO.md` diz, na seção "O que NÃO fazer": *"não criar blog
 * genérico ('como financiar', 'melhor SUV de 2026') antes de o Search Console
 * medir. Conteúdo genérico disputa com portais gigantes; o diferencial real da
 * Motors é o texto por veículo e a única afirmação que nenhum concorrente pode
 * copiar: 3 de cada 10 entram."*
 *
 * Estes guias **não são o blog genérico que aquela linha proíbe** — são o
 * contrário dele, e a distinção é a régua de entrada aqui:
 *
 *  · assunto único, o mesmo que a loja pratica em 100% do estoque;
 *  · escritos do lado de quem PAGA a perícia e recusa o carro, não de quem
 *    vende o exame (as empresas de vistoria) nem de quem vende litígio (os
 *    escritórios de advocacia) — as duas cadeiras já ocupadas na busca;
 *  · cada um com uma saída comercial definida: nenhum termina sem destino.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ O que NÃO entra, e por quê
 * ---------------------------------------------------------------------------
 * Dois dos tópicos mais valiosos do plano dependem de dado que o repositório
 * não tem, e a regra do `CLAUDE.md` é explícita — *"não invente número; se
 * faltar, pare e pergunte, não estime"*:
 *
 *  · **"Os N apontamentos que mais reprovam"** exige a distribuição real das
 *    reprovações da loja, por motivo. É a peça que nenhum concorrente pode
 *    copiar, justamente porque o dado é da operação. Sem ele o texto vira
 *    lista genérica — que é o blog que a recomendação proíbe.
 *  · **"Perícia cautelar em Curitiba: onde, quanto custa, quanto demora"**
 *    exige faixa de preço e prazo de empresas REAIS (IBPA, DEKRA, Super
 *    Visão). Publicar preço errado sobre terceiro é pior do que não publicar.
 *
 * Os dois entram quando o dono trouxer os números. Até lá, ficam fora.
 */

export interface SecaoDoGuia {
  /** Vira `<h2>`. */
  titulo: string;
  paragrafos: string[];
}

export interface Guia {
  slug: string;
  /** O `<h1>` e o `headline` do `Article`. */
  titulo: string;
  /** `<title>` da aba — pode divergir do `<h1>` quando o SERP pede. */
  tituloSeo: string;
  descricao: string;
  /** ISO com fuso de Curitiba. `Article` exige data, e data ausente vale menos. */
  publicadoEm: string;
  atualizadoEm: string;
  corpo: SecaoDoGuia[];
  faq: PerguntaFrequente[];
  /**
   * A saída comercial. Guia sem destino é conteúdo que não devolve nada — a
   * régua do plano é que cada peça tenha exatamente uma.
   */
  saida: { rotulo: string; href: string; apoio: string };
  /** Os assuntos do `about` do `Article`. */
  sobre: string[];
}

/**
 * O pilar do cluster: o que a perícia cautelar NÃO faz.
 *
 * O ângulo é o limite da ferramenta, e é escolha deliberada. Toda empresa de
 * vistoria publica o que o exame checa; ninguém publica o que ele deixa passar,
 * porque estão vendendo o exame. Vindo de quem paga a perícia em todo o
 * estoque, admitir o limite é mais crível do que vendê-la como garantia total —
 * e prepara o terreno para `/garantia`, que cobre exatamente o que a perícia
 * não vê.
 *
 * Nada aqui afirma número que o repositório não sustente. As únicas
 * afirmações da casa são "de cada dez avaliados, três entram"
 * (`conteudo-seo/POSICIONAMENTO.md`) e a perícia em 100% do estoque, que o dono
 * confirmou em 2026-08-17 — a mesma nota que autoriza afirmar que todo veículo
 * PASSA pelo exame, mantendo condicional só o laudo publicado.
 */
const PERICIA_O_QUE_NAO_VERIFICA: Guia = {
  slug: "o-que-a-pericia-cautelar-nao-verifica",
  titulo: "O que a perícia cautelar não verifica",
  tituloSeo: "O que a perícia cautelar NÃO verifica | Motors Store",
  descricao:
    "A perícia cautelar conta o passado do carro: sinistro, leilão, numeração, documentação. " +
    "O que ela não conta é o estado mecânico de hoje. Escrito por quem paga o exame em todo o estoque.",
  publicadoEm: "2026-09-05T09:00:00-03:00",
  atualizadoEm: "2026-09-05T09:00:00-03:00",
  sobre: ["Perícia cautelar veicular", "Laudo cautelar", "Compra de carro seminovo"],
  corpo: [
    {
      titulo: "O exame responde uma pergunta, e ela é sobre o passado",
      paragrafos: [
        "A perícia cautelar existe para responder se o carro é o que o documento diz que ele é. " +
          "Ela confere a numeração do chassi e do motor contra o que está registrado, procura sinal " +
          "de remarcação e de reparo estrutural, e consulta o histórico do veículo — sinistro, " +
          "passagem por leilão, restrição, débito, registro de roubo e furto.",
        "É um exame de procedência. A pergunta que ele responde é sobre o que já aconteceu com " +
          "aquele carro, e é a pergunta certa: é onde mora o prejuízo que o comprador não enxerga " +
          "sozinho, nem com um mecânico de confiança do lado.",
      ],
    },
    {
      titulo: "O que fica de fora",
      paragrafos: [
        "A perícia cautelar não é avaliação mecânica. Ela não abre o motor, não mede compressão, " +
          "não avalia a saúde do câmbio, não diz quanto resta da embreagem nem se a corrente de " +
          "comando está no fim. Um carro pode passar na cautelar com folga e precisar de reparo " +
          "caro no mês seguinte — as duas coisas não se contradizem, porque medem coisas diferentes.",
        "Ela também não conta a manutenção. Revisão atrasada, óleo vencido, filtro que ninguém " +
          "trocou: nada disso aparece num laudo de procedência. E não avalia desgaste de uso — " +
          "pneu, pastilha, suspensão, ar-condicionado.",
        "Quem trata o laudo aprovado como certificado de que o carro está bom está juntando duas " +
          "perguntas diferentes. Se o carro tem passado limpo e se ele está mecanicamente bem são " +
          "exames distintos, feitos por gente distinta.",
      ],
    },
    {
      titulo: "Por que aqui o exame vem antes do anúncio",
      paragrafos: [
        "Na maioria das lojas o laudo é etapa de negociação: o cliente pede, alguém providencia, e " +
          "o resultado aparece perto de fechar. Aqui o exame vem antes do anúncio, em todo o " +
          "estoque, por um motivo simples — se o resultado importa, ele precisa poder mudar a " +
          "decisão de comprar o carro. Depois que a unidade está no pátio, ninguém quer ouvir que " +
          "ela não deveria ter entrado.",
        "É daí que sai a conta de que, de cada dez veículos avaliados, três entram. Os outros sete " +
          "não são necessariamente carros ruins — vários são carros que alguém compra e revende sem " +
          "problema nenhum. Eles só não passam no filtro que a gente escolheu aplicar antes de pôr " +
          "o nome na frente.",
        "O laudo fica na ficha do carro assim que a perícia é aprovada, junto do preço. Não é " +
          "documento que se pede: está publicado.",
      ],
    },
    {
      titulo: "O que responde pela outra metade",
      paragrafos: [
        "Como o exame de procedência não fala do estado mecânico, a resposta para essa metade não é " +
          "um laudo — é garantia. É ela que responde por motor e câmbio depois que o carro sai da " +
          "loja, e é a peça que faz sentido ler junto com o laudo, não no lugar dele.",
        "O comprador que entende a diferença faz as duas perguntas certas na hora certa: pede o " +
          "laudo para saber de onde o carro vem, e lê a garantia para saber quem responde pelo que " +
          "vier depois.",
      ],
    },
  ],
  faq: [
    {
      pergunta: "Laudo cautelar aprovado significa que o carro está em bom estado?",
      resposta:
        "Não. O laudo cautelar responde sobre a procedência do veículo — sinistro, leilão, " +
        "numeração e documentação. Ele não avalia motor, câmbio, embreagem nem desgaste de uso. " +
        "Um carro pode ter laudo aprovado e precisar de manutenção; são exames diferentes.",
    },
    {
      pergunta: "A perícia cautelar detecta problema de motor?",
      resposta:
        "Não detecta. A perícia cautelar é exame de identificação, estrutura e histórico, não " +
        "avaliação mecânica. Para o estado do motor e do câmbio, quem responde é a garantia do " +
        "veículo e uma avaliação mecânica específica.",
    },
    {
      pergunta: "Todos os carros da Motors Store passam por perícia cautelar?",
      resposta:
        "Passam, sem exceção, e antes de entrar na vitrine — não durante a negociação. O laudo " +
        "fica na ficha do carro assim que a perícia é aprovada.",
    },
    {
      pergunta: "Por que sete de cada dez carros avaliados não entram no estoque?",
      resposta:
        "Porque o filtro é aplicado antes da compra, e não depois. Os motivos mais comuns são de " +
        "procedência — passagem por leilão, sinistro de médio porte, divergência de numeração — e " +
        "são exatamente o que a perícia cautelar existe para encontrar.",
    },
  ],
  saida: {
    rotulo: "Ver a garantia",
    href: "/garantia",
    apoio: "O que responde por motor e câmbio — a metade que a perícia não examina.",
  },
};

/** Os guias publicados, na ordem em que o índice os mostra. */
export const GUIAS: Guia[] = [PERICIA_O_QUE_NAO_VERIFICA];

export function acharGuia(slug: string): Guia | null {
  return GUIAS.find((g) => g.slug === slug) ?? null;
}

/** O carimbo mais recente entre os guias — alimenta o `lastModified` do índice. */
export function guiasAtualizadosEm(): string | undefined {
  return [...GUIAS].map((g) => g.atualizadoEm).sort().at(-1);
}
