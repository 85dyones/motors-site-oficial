import type { PerguntaFrequente } from "../components/modernist/PaginaDeEstoque";

/**
 * As duas páginas de bairro/cidade — e por que são só duas.
 *
 * O plano de aquisição (§2.2.2) pede páginas geográficas como P0: o comprador
 * de Curitiba pesquisa por bairro e por eixo viário, não por cidade, e o site
 * não tinha onde ranquear para `seminovos bacacheri` ou `seminovos curitiba`.
 * A `docs/RECOMENDACAO_SEO.md`, escrita antes, dizia o contrário — "não criar
 * páginas-cidade com o mesmo estoque de 41 carros".
 *
 * As duas estão certas sobre coisas diferentes, e o dono decidiu em 2026-08-25:
 * **duas páginas, com conteúdo real**. O que a recomendação antiga condenava
 * era a página doorway — trinta URLs iguais trocando o nome do bairro, que é
 * exatamente o que o §2.3.3 do plano novo também proíbe. Duas páginas que
 * dizem coisas diferentes não são isso: uma fala de quem já está no bairro e
 * pode vir a pé, a outra de quem atravessa a cidade e quer saber como chegar.
 *
 * ⚠️ **Não transformar isto num gerador de bairros.** Se um dia entrar uma
 * terceira, ela precisa de rota de acesso, referências e perguntas próprias —
 * escritas, não interpoladas. O limite prático é seis (§2.2.2), e cada uma
 * custa texto de verdade.
 *
 * O texto não cita número de veículos: a grade abaixo dele já mostra o estoque
 * do momento, e frase com contagem congelada envelhece em uma semana.
 */

export interface PaginaGeo {
  /** Segmento único da URL — a pasta em `src/app` tem o mesmo nome. */
  slug: "seminovos-curitiba" | "seminovos-bacacheri";
  /** Como aparece no `<h1>` e na trilha. */
  nome: string;
  tituloSeo: string;
  descricao: string;
  /** O `<h1>`. */
  titulo: string;
  paragrafos: string[];
  faq: PerguntaFrequente[];
}

const ENDERECO = "Rua Ernesto Piazzetta, 98";
const HORARIO = "de segunda a sexta das 8h30 às 18h30 e aos sábados das 8h30 às 15h";

export const PAGINAS_GEO: PaginaGeo[] = [
  {
    slug: "seminovos-curitiba",
    nome: "Curitiba",
    titulo: "Seminovos em Curitiba",
    tituloSeo: "Seminovos em Curitiba | Motors Store Bacacheri",
    descricao:
      "Loja de carros seminovos em Curitiba com perícia cautelar independente em todo o " +
      `estoque. ${ENDERECO}, Bacacheri. Avaliação do seu usado e financiamento.`,
    paragrafos: [
      "A Motors Store atende Curitiba inteira a partir do showroom no Bacacheri. O que muda de " +
        "uma revenda para outra nesta cidade não é o estoque — é o filtro: de cada dez veículos " +
        "avaliados, três entram. Os outros sete vão para repasse antes de chegar à vitrine.",
      "Curitiba tem um dos ecossistemas de perícia cautelar mais maduros do país, e o comprador " +
        "daqui costuma chegar à loja já sabendo o que é laudo e o que ele mostra. Por isso a " +
        "perícia é feita antes, por empresa independente, e o laudo fica publicado na ficha de " +
        "cada carro — não é algo que se combina depois de fechar o negócio.",
      // O parágrafo "o que olhar" (2026-09-01, fórmula do relatório dos hubs).
      // Faltava nas duas páginas geo: elas explicavam o critério da loja e o
      // caminho até ela, sem nunca dizer o que só quem mexe com carro sabe. É
      // o que o documento chama de autoridade — e aqui é ancorado no que é
      // específico de Curitiba, não em conselho genérico de compra.
      "Duas conferências valem mais nesta cidade do que na média do país. A primeira é por " +
        "baixo: muito carro daqui passa temporada no litoral, e maresia ataca assoalho, molas e " +
        "parafusos antes de aparecer na pintura. A segunda é a partida em manhã fria — motor que " +
        "custa a pegar a cinco graus não demonstra isso às três da tarde, com o carro já quente.",
      "Quem vem do Centro, do Batel, do Água Verde ou do Alto da XV chega pela Avenida Paraná ou " +
        "pela Linha Verde; de Santa Felicidade e do Portão, o caminho natural é a Marechal " +
        "Floriano seguida da Linha Verde. Há estacionamento na porta, e dá para ver o carro, " +
        "fazer o test drive e conferir a documentação na mesma visita.",
      "O atendimento cobre também a Região Metropolitana: Pinhais, Colombo, São José dos " +
        "Pinhais, Almirante Tamandaré e Araucária estão a poucos minutos do Bacacheri pela " +
        "Linha Verde e pelo Contorno Norte.",
    ],
    faq: [
      {
        pergunta: "Onde fica a loja de seminovos da Motors Store em Curitiba?",
        resposta:
          `Na ${ENDERECO}, no Bacacheri, zona norte de Curitiba. Abrimos ${HORARIO}.`,
      },
      {
        pergunta: "Todos os carros têm laudo de perícia cautelar?",
        resposta:
          "Sim. A perícia é independente e acontece antes do veículo entrar na vitrine. O laudo " +
          "de cada unidade fica disponível na ficha do carro, no site.",
      },
      {
        pergunta: "Atendem quem mora fora de Curitiba?",
        resposta:
          "Atendemos toda a Região Metropolitana — Pinhais, Colombo, São José dos Pinhais, " +
          "Almirante Tamandaré, Araucária e vizinhas. Para veículos de ticket mais alto, " +
          "recebemos compradores de outras praças do Paraná e de Santa Catarina.",
      },
      {
        pergunta: "Como sei se o carro passou temporada no litoral?",
        resposta:
          "Maresia aparece por baixo antes de aparecer na pintura: assoalho, molas, parafusos " +
          "dos bancos e a borda interna da tampa traseira contam a história. É um dos pontos " +
          "que a perícia cautelar independente verifica antes de o veículo entrar na vitrine, e " +
          "o laudo fica na ficha do carro.",
      },
      {
        pergunta: "Aceitam meu carro na troca?",
        resposta:
          "Sim. A Avaliação Express dá uma proposta em cerca de 10 minutos, com base na Tabela " +
          "FIPE e no giro do nosso estoque, e o valor entra como entrada.",
      },
      {
        pergunta: "Dá para financiar?",
        resposta:
          "Dá. Trabalhamos com múltiplos bancos e a simulação está na própria ficha do veículo. " +
          "As condições finais dependem de análise de crédito.",
      },
    ],
  },
  {
    slug: "seminovos-bacacheri",
    nome: "Bacacheri",
    titulo: "Seminovos no Bacacheri",
    tituloSeo: "Seminovos no Bacacheri, Curitiba | Motors Store",
    descricao:
      `Loja de carros seminovos no Bacacheri, em Curitiba: ${ENDERECO}. Perícia cautelar ` +
      "independente em todo o estoque, avaliação do seu usado e financiamento.",
    paragrafos: [
      `A loja fica no próprio bairro: ${ENDERECO}, Bacacheri. Quem mora aqui não precisa ` +
        "atravessar a cidade para ver carro — dá para passar no fim da tarde, olhar o veículo com " +
        "calma e voltar no dia seguinte com quem vai dirigir junto.",
      "O Bacacheri é território de concessionária de marca e de seminovo de grupo, e a diferença " +
        "de uma multimarcas que mora no bairro é o tempo que ela pode dedicar a cada venda. " +
        "Aqui o vendedor não trabalha por fila de senha: de cada dez veículos avaliados, três " +
        "entram no estoque, e é sobre esses três que a conversa acontece.",
      // O "o que olhar" desta página é o que a PROXIMIDADE permite verificar —
      // não conselho de compra genérico. É o argumento da página de bairro
      // dito em termos mecânicos, e não se repete na página de Curitiba.
      "Comprar perto de casa muda o que dá para verificar, e quase ninguém aproveita. Dá para " +
        "voltar de manhã cedo e dar a partida com o motor frio, que é o teste mais revelador de " +
        "um usado e o único que uma visita única à tarde nunca faz. Dá para trazer o seu " +
        "mecânico, ou o amigo que entende de carro, sem marcar o dia com uma semana de " +
        "antecedência. E dá para ver o mesmo veículo duas vezes antes de decidir.",
      "A referência mais fácil para quem vem de fora do bairro é a Linha Verde; de dentro, a " +
        "Avenida Erasto Gaertner e a Avenida Paraná chegam em poucos minutos. Boa Vista, Atuba, " +
        "Cabral, Tarumã, Santa Cândida e Bairro Alto ficam todos a uma distância de bairro — " +
        "menos de dez minutos de carro na maior parte do dia.",
      // Este parágrafo falava de perícia, e dizia quase palavra por palavra o
      // que a página de Curitiba já diz — `tests/paginas-geo.test.ts` mediu a
      // sobreposição e reprovou. Duas páginas geo que repetem o mesmo bloco
      // são o começo da doorway que o comentário no topo deste arquivo proíbe;
      // a saída certa foi dar a esta o ângulo que só ela tem, não afrouxar a
      // régua. A prática de perícia continua contada na outra, e no FAQ daqui.
      "Comprar de uma loja do próprio bairro tem um efeito que só aparece depois. Quando surge " +
        "dúvida de documentação, de garantia ou da primeira revisão, resolver é passar aqui numa " +
        "tarde — não abrir chamado e esperar retorno. É a parte do negócio que ninguém avalia na " +
        "hora de escolher, e que decide como a compra vai ser lembrada dois anos depois.",
    ],
    faq: [
      {
        pergunta: "Qual o endereço da Motors Store no Bacacheri?",
        resposta: `${ENDERECO}, Bacacheri, Curitiba — PR, CEP 82510-350. Abrimos ${HORARIO}.`,
      },
      {
        pergunta: "Como chego de outros bairros da zona norte?",
        resposta:
          "De Boa Vista, Atuba, Cabral, Tarumã, Santa Cândida ou Bairro Alto, o caminho mais " +
          "direto é pela Avenida Erasto Gaertner ou pela Avenida Paraná. Quem vem de mais longe " +
          "costuma pegar a Linha Verde.",
      },
      {
        pergunta: "Tem estacionamento na loja?",
        resposta: "Tem. Há vaga na porta, e o test drive sai do próprio showroom.",
      },
      {
        pergunta: "Posso trazer meu mecânico para ver o carro?",
        resposta:
          "Pode, e a gente prefere. Quem mora perto consegue ainda voltar de manhã cedo para dar " +
          "a partida com o motor frio — é o teste mais revelador de um usado, e o que uma visita " +
          "única à tarde nunca faz. Avise pelo WhatsApp que o veículo fica separado.",
      },
      {
        pergunta: "Preciso agendar para ver um carro?",
        resposta:
          "Não é obrigatório, mas ajuda: avisando pelo WhatsApp, o veículo já fica separado e " +
          "com a documentação em mãos quando você chegar.",
      },
      {
        pergunta: "Vocês compram carro usado aqui no bairro?",
        resposta:
          "Compramos. A Avaliação Express dá uma proposta em cerca de 10 minutos e vale tanto " +
          "para troca quanto para venda direta — nem todo carro avaliado entra no estoque, e " +
          "quando não entra a gente diz por quê.",
      },
    ],
  },
];

export function acharPaginaGeo(slug: string): PaginaGeo | null {
  return PAGINAS_GEO.find((p) => p.slug === slug) ?? null;
}

/** Os caminhos que o sitemap precisa anunciar. */
export const CAMINHOS_GEO = PAGINAS_GEO.map((p) => `/${p.slug}`);
