import type { PerguntaFrequente } from "../components/modernist/PaginaDeEstoque";
import { ALCANCE_DA_ENTREGA } from "./paginasInstitucionais";

/**
 * As páginas de bairro/cidade — e por que são poucas (três desde 02/10/2026).
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
  slug: "seminovos-curitiba" | "seminovos-bacacheri" | "seminovos-boa-vista";
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
      // Até 25/09 terminava em "Os outros sete vão para repasse antes de chegar
      // à vitrine.", que fazia o leitor supor que o carro de repasse é o
      // recusado na perícia (spec 2026-09-24 §10). A oração saiu; a trava está
      // em `tests/paginas-geo.test.ts`.
      "A Motors Store atende Curitiba inteira a partir do showroom no Bacacheri e se diferencia " +
        "das outras revendas da cidade pelo filtro: de cada dez veículos avaliados, três entram.",
      // Forma escaneável desde 30/09/2026 (o dono: "blocos imensos de texto
      // (...) maçantes para os leitores"). Só o parágrafo acima fica sobre a
      // grade; do "###" em diante a `PaginaDeEstoque` desenha depois dos
      // carros, com "- " como lista (ver `lib/blocosDoGuia.ts`).
      "### O que conferir num carro de Curitiba",
      // O "o que olhar" (2026-09-01, fórmula do relatório dos hubs), ancorado
      // no que é específico de Curitiba, não em conselho genérico de compra.
      "Duas conferências pesam mais aqui do que na média do país:\n" +
        "- Por baixo do carro. Muito carro daqui passa temporada no litoral, e a maresia ataca " +
        "assoalho, molas e parafusos antes de aparecer na pintura.\n" +
        "- A partida numa manhã fria. Motor que custa a pegar a cinco graus não mostra isso às " +
        "três da tarde, com o carro já quente.",
      "Curitiba tem um dos mercados de perícia cautelar mais maduros do país, e o comprador " +
        "daqui costuma chegar à loja já sabendo o que é laudo e o que ele mostra. Por isso a " +
        "perícia é feita antes, por empresa independente, e o laudo está disponível para consulta " +
        "com o vendedor antes de você fechar o negócio.",
      "### Como chegar ao showroom",
      "- Do Centro, do Batel, do Água Verde ou do Alto da XV: pela Avenida Paraná ou pela " +
        "Linha Verde.\n" +
        "- De Santa Felicidade e do Portão: pela Marechal Floriano e depois pela Linha Verde.\n" +
        "- Da Região Metropolitana, que a loja também atende: Pinhais, Colombo, São José dos " +
        "Pinhais, Almirante Tamandaré e Araucária ficam a poucos minutos do Bacacheri pela Linha " +
        "Verde e pelo Contorno Norte.",
      "Há estacionamento na porta, e dá para ver o carro, fazer o test drive e conferir a " +
        "documentação na mesma visita.",
    ],
    faq: [
      {
        pergunta: "Onde fica a loja de seminovos da Motors Store em Curitiba?",
        resposta:
          `Na ${ENDERECO}, no Bacacheri, zona norte de Curitiba. Abrimos ${HORARIO}.`,
      },
      {
        pergunta: "Todos os carros do estoque têm laudo de perícia cautelar?",
        resposta:
          "Sim. A perícia é independente e acontece antes do veículo entrar na vitrine. Cada unidade tem laudo " +
          "disponível para consulta com o vendedor, a qualquer tempo.",
      },
      {
        pergunta: "Atendem quem mora fora de Curitiba?",
        resposta:
          // Esta pergunta é a MESMA de `PERGUNTAS_DE_GARANTIA` ("A garantia vale
          // se eu comprar de outra cidade?"). Até 04/09/2026 as duas respostas
          // discordavam: aqui o alcance era Região Metropolitana, com Paraná e
          // Santa Catarina só "para veículos de ticket mais alto"; lá era "fora
          // do estado". Duas respostas públicas para a mesma pergunta é como o
          // cliente descobre no balcão que uma delas não vale.
          "Atendemos toda a Região Metropolitana (Pinhais, Colombo, São José dos Pinhais, " +
          `Almirante Tamandaré, Araucária e vizinhas) e ${ALCANCE_DA_ENTREGA}. ` +
          "A logística de entrega é combinada caso a caso com o consultor.",
      },
      {
        pergunta: "Como sei se o carro passou temporada no litoral?",
        resposta:
          "Maresia aparece por baixo antes de aparecer na pintura. Os lugares para olhar são " +
          "assoalho, molas, parafusos dos bancos e a borda interna da tampa traseira. É um dos pontos " +
          "que a perícia cautelar independente verifica antes de o veículo entrar na vitrine, e " +
          "o laudo está disponível para consulta com o vendedor.",
      },
      {
        pergunta: "Aceitam meu carro na troca?",
        resposta:
          "Sim. A Avaliação Express devolve uma proposta pelo WhatsApp, com base na Tabela " +
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
        "atravessar a cidade para ver carro: dá para passar no fim da tarde, olhar o veículo com " +
        "calma e voltar no dia seguinte com quem vai dirigir junto.",
      // Forma escaneável desde 30/09/2026, como a página de Curitiba.
      "### O que muda comprando no próprio bairro",
      // O "o que olhar" desta página é o que a PROXIMIDADE permite verificar,
      // e não se repete na página de Curitiba.
      "Comprar perto de casa muda o que dá para verificar. Você pode:\n" +
        "- voltar de manhã cedo e dar a partida com o motor frio, o teste mais revelador de um " +
        "usado e o único que uma visita única à tarde nunca faz;\n" +
        "- trazer o seu mecânico, ou o amigo que entende de carro, sem marcar o dia com uma " +
        "semana de antecedência;\n" +
        "- ver o mesmo veículo duas vezes antes de decidir.",
      // Este parágrafo falava de perícia, e dizia quase palavra por palavra o
      // que a página de Curitiba já diz: `tests/paginas-geo.test.ts` mediu a
      // sobreposição e reprovou. A saída certa foi dar a esta o ângulo que só
      // ela tem, não afrouxar a régua. A prática de perícia fica contada na
      // página de Curitiba. Até 30/09 terminava em "Pouca gente pesa isso na
      // hora de escolher.", fecho que só repetia o argumento (humanizer).
      "Depois da compra, a proximidade também ajuda. Dúvida de documentação, de garantia ou da " +
        "primeira revisão se resolve passando aqui numa tarde, sem abrir chamado e esperar retorno.",
      "O Bacacheri tem concessionárias de marca e seminovos de grupo, e uma multimarcas que " +
        "mora no bairro se distingue pelo tempo que pode dedicar a cada venda. Aqui o vendedor " +
        "não trabalha por fila de senha: de cada dez veículos avaliados, três entram no " +
        "estoque, e a conversa é sobre esses três.",
      "### Chegando à loja",
      "- De fora do bairro, a referência mais fácil é a Linha Verde.\n" +
        "- De dentro, a Avenida Erasto Gaertner e a Avenida Paraná chegam em poucos minutos.\n" +
        "- Boa Vista, Atuba, Cabral, Tarumã, Santa Cândida e Bairro Alto ficam a menos de dez " +
        "minutos de carro na maior parte do dia.",
    ],
    faq: [
      {
        pergunta: "Qual o endereço da Motors Store no Bacacheri?",
        resposta: `${ENDERECO}, Bacacheri, Curitiba (PR), CEP 82510-350. Abrimos ${HORARIO}.`,
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
          "Pode, e a gente prefere. Quem mora perto ainda consegue voltar de manhã cedo para dar " +
          "a partida com o motor frio, o teste mais revelador de um usado e o que uma visita " +
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
          "Compramos. A Avaliação Express devolve uma proposta pelo WhatsApp e vale tanto " +
          "para troca quanto para venda direta. Nem todo carro avaliado entra no estoque, e " +
          "quando não entra a gente diz por quê.",
      },
    ],
  },
  {
    /**
     * A terceira (02/10/2026): Boa Vista e Cabral, os dois bairros colados no
     * Bacacheri pela Avenida Paraná. Escolha do dono em 02/10, entre Colombo,
     * Pinhais, São José dos Pinhais e esta.
     *
     * O risco declarado era repetir a página do Bacacheri. O que esta tem de
     * próprio, e as outras duas não dizem:
     *   · o caminho pela Avenida Paraná, sem citar ônibus nem terminal. O dono
     *     pediu (02/10): transporte data o texto, porque o estoque e o público
     *     mudam. A página fala da facilidade do acesso, e só;
     *   · o "o que olhar" é o do carro que rodou pouco, que é o uso de quem
     *     mora e trabalha nesses bairros (Curitiba fala de maresia e partida
     *     fria; o Bacacheri, do que a proximidade deixa conferir). Diz o que
     *     conferir sem listar desgaste: o dono pediu que o texto informe sem
     *     argumentar contra o carro (02/10);
     *   · a garagem de prédio: rampa e vaga se testam no próprio test drive.
     *     O dono confirmou em 02/10 que a loja faz isso nessa região.
     *
     * Uma página para os dois bairros, e não duas: o caminho e o argumento são
     * os mesmos, e duas páginas com o nome trocado seriam a doorway que o
     * comentário do topo proíbe.
     */
    slug: "seminovos-boa-vista",
    nome: "Boa Vista e Cabral",
    titulo: "Seminovos no Boa Vista e no Cabral",
    tituloSeo: "Seminovos no Boa Vista e no Cabral, Curitiba | Motors Store",
    descricao:
      `Loja de carros seminovos ao lado do Boa Vista, em Curitiba: ${ENDERECO}. Perícia ` +
      "cautelar independente em todo o estoque, avaliação do seu usado e financiamento.",
    paragrafos: [
      `A Motors Store fica na ${ENDERECO}, perto da Avenida Paraná e ao lado do Boa Vista. ` +
        "Para quem mora no Boa Vista ou no Cabral, dá para ver o carro depois do trabalho e " +
        "voltar no sábado com a família.",
      "### O que olhar num carro que só rodou no bairro",
      "Carro de quem mora e trabalha perto roda pouco, e quilometragem baixa é boa notícia " +
        "quando a manutenção acompanhou o tempo. Confira:\n" +
        "- A data da última troca de óleo. Em carro que roda pouco, a troca se faz pelo " +
        "calendário, não pela quilometragem.\n" +
        "- Bateria e partida, com o motor frio.\n" +
        "- Embreagem e freios, que trabalham mais na cidade do que em estrada.\n" +
        "- Pneus, pela data de fabricação além do desgaste.",
      "### A rampa e a vaga do seu prédio",
      "Se o seu prédio tem rampa íngreme ou vaga apertada, a proximidade resolve a dúvida " +
        "antes da compra. Combine com o vendedor para o test drive passar pela sua garagem: dá " +
        "para ver se o carro entra, se raspa na rampa e se a porta abre dentro da vaga.",
      "### Como chegar do Cabral e do Boa Vista",
      "- Do Cabral: siga pela Avenida Paraná no sentido Boa Vista. São poucos " +
        "quilômetros.\n" +
        "- Do Boa Vista: a loja fica no bairro ao lado, o Bacacheri, perto da Avenida Paraná.\n" +
        `- No mapa: procure por Motors Store ou pelo endereço, ${ENDERECO}.`,
    ],
    faq: [
      {
        pergunta: "A Motors Store fica no Boa Vista ou no Bacacheri?",
        resposta:
          `No Bacacheri, na ${ENDERECO}, perto da Avenida Paraná e ao lado do Boa Vista.`,
      },
      {
        pergunta: "A loja fica longe do Cabral?",
        resposta:
          "Não. Pela Avenida Paraná são poucos quilômetros, sem passar pelo Centro.",
      },
      {
        pergunta: "Posso passar pela minha garagem no test drive?",
        resposta:
          "Pode, combinando antes com o vendedor. Para quem mora no Boa Vista ou no Cabral o " +
          "desvio é curto, e é o jeito de saber se o carro passa na rampa e cabe na vaga.",
      },
      {
        pergunta: "Carro com pouca quilometragem, usado só no bairro, é melhor compra?",
        resposta:
          "É, quando a manutenção acompanhou o tempo. Peça a data das trocas de óleo junto " +
          "com a quilometragem: em carro que roda pouco, a troca se faz pelo calendário.",
      },
      {
        pergunta: "Dá para ver o carro no sábado?",
        resposta:
          `Dá. A loja abre ${HORARIO}. Avisando antes pelo WhatsApp, o veículo já fica ` +
          "separado para o test drive.",
      },
    ],
  },
];

/**
 * Os links de uma página de região para as outras (02/10/2026).
 *
 * O rótulo é o título da página ("Seminovos em Curitiba"), e não o nome solto
 * do lugar: é a âncora que diz para onde o link leva, e são os únicos links
 * que essas páginas trocam entre si.
 */
export function outrasRegioes(slug: PaginaGeo["slug"]): { rotulo: string; href: string }[] {
  return PAGINAS_GEO.filter((p) => p.slug !== slug).map((p) => ({
    rotulo: p.titulo,
    href: `/${p.slug}`,
  }));
}

export function acharPaginaGeo(slug: string): PaginaGeo | null {
  return PAGINAS_GEO.find((p) => p.slug === slug) ?? null;
}

/** Os caminhos que o sitemap precisa anunciar. */
export const CAMINHOS_GEO = PAGINAS_GEO.map((p) => `/${p.slug}`);
