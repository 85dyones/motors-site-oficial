import type { PerguntaFrequente, SecaoDeTexto } from "../components/modernist/PaginaDeEstoque";

/**
 * O texto das páginas institucionais — `/financiamento` e `/garantia`.
 *
 * Fora do componente por dois motivos. O primeiro é prático: quem edita texto
 * não precisa abrir JSX. O segundo é o que importa — **cada afirmação aqui é
 * uma promessa pública da loja**, e promessa precisa ter procedência. Nenhuma
 * frase deste arquivo foi inventada: cada uma sai de algo que o site já afirma
 * (`lib/procedencia.ts`, `lib/aboutSettings.json`,
 * `conteudo-seo/POSICIONAMENTO.md`) ou de decisão datada do dono.
 *
 * A regra ao mexer aqui: se você não consegue apontar de onde a frase vem, ela
 * não entra. Texto de confiança que o cliente descobre ser falso no balcão
 * custa mais caro que texto ausente — é a mesma nota que abre
 * `lib/procedencia.ts`, e vale em dobro numa página que fala de garantia.
 */

// ---------------------------------------------------------------------------
// /financiamento
// ---------------------------------------------------------------------------

/**
 * Fonte de cada afirmação:
 * - "simulação e pré-aprovação pelo WhatsApp com os principais bancos" →
 *   `aboutSettings.card2Desc`, publicado em /sobre;
 * - "troca como entrada, avaliação pela FIPE" → a Avaliação Express, que já
 *   opera assim. O "~10 minutos" que esta linha citava saiu em 04/09/2026,
 *   junto com a régua da home que o sustentava: o prazo não era medido em
 *   lugar nenhum e ninguém tinha sido combinado para cumpri-lo;
 * - "de cada dez avaliados, três entram" → `aboutSettings.historyP1`.
 *
 * O que NÃO está aqui, e não pode entrar: taxa, parcela fechada, prazo máximo
 * como promessa e qualquer forma de "aprovação garantida". Anúncio ou página
 * com valor de parcela exige CET, quantidade e valor total pela regulação de
 * publicidade de crédito (§1.4b do plano de aquisição) — quem entrega os três,
 * com o aviso de que a taxa depende de análise, é o simulador.
 */
export const TEXTO_DE_FINANCIAMENTO: string[] = [
  "Quase todo seminovo em Curitiba sai financiado, e a pergunta que decide a compra " +
    "raramente é o preço à vista: é quanto fica a parcela e quanto vale o seu carro na troca. " +
    "O simulador abaixo responde a primeira com o estoque real da loja — você escolhe o " +
    "veículo, a entrada e o prazo, e vê a parcela na hora.",
  "A simulação e a pré-aprovação são feitas pela nossa equipe direto no WhatsApp, com os " +
    "principais bancos parceiros. Trabalhar com mais de um banco importa porque cada um lê " +
    "perfil de crédito de um jeito: a mesma pessoa recebe respostas diferentes, e quem manda " +
    "a proposta para um só nunca descobre isso.",
  "Seu carro atual entra como entrada. A Avaliação Express devolve uma proposta pelo " +
    "WhatsApp, com base na Tabela FIPE e no giro do nosso estoque — e nem todo carro avaliado " +
    "vira estoque nosso: quando não vira, a gente diz por quê.",
  "O que a simulação não faz é prometer aprovação. Taxa, prazo e valor final dependem de " +
    "análise de crédito, e o número que aparece aqui é estimativa com TAC e IOF incluídos, " +
    "não proposta. Quem fecha condição é o banco, com o seu CPF na frente.",
];

export const PERGUNTAS_DE_FINANCIAMENTO: PerguntaFrequente[] = [
  {
    pergunta: "Dá para financiar sem entrada?",
    resposta:
      "Em muitos casos sim, e o simulador tem a opção. Financiamento sem entrada costuma ter " +
      "parcela mais alta e análise mais exigente — vale simular as duas formas antes de decidir.",
  },
  {
    pergunta: "Posso usar meu carro como entrada?",
    resposta:
      "Pode. A avaliação é feita com base na Tabela FIPE e no giro do nosso estoque, e um " +
      "consultor devolve a proposta pelo WhatsApp — o valor aprovado entra como entrada no " +
      "financiamento do próximo carro.",
  },
  {
    pergunta: "Em quantas vezes consigo parcelar?",
    resposta:
      "O simulador vai até 60 parcelas. O prazo efetivamente aprovado depende do banco, do " +
      "perfil de crédito e do ano do veículo — carro mais antigo costuma ter prazo menor.",
  },
  {
    pergunta: "A taxa que aparece no simulador é a taxa final?",
    resposta:
      "Não. É uma estimativa, já com TAC e IOF, para você ter ordem de grandeza da parcela. A " +
      "taxa final sai da análise de crédito de cada banco e pode ficar acima ou abaixo dela.",
  },
  {
    pergunta: "Preciso ir à loja para simular?",
    resposta:
      "Não. A simulação é aqui e a pré-aprovação sai pelo WhatsApp. A visita fica para ver o " +
      "carro — o showroom é na Rua Ernesto Piazzetta, 98, no Bacacheri.",
  },
  {
    pergunta: "Vocês financiam qualquer carro do estoque?",
    resposta:
      "Sim. O seletor do simulador mostra o que está disponível agora, e a lista muda com o giro " +
      "do estoque. Se o carro que você quer não estiver ali, ele já foi vendido.",
  },
];

// ---------------------------------------------------------------------------
// /garantia
// ---------------------------------------------------------------------------

/**
 * Fonte de cada afirmação:
 * - "garantia de motor e câmbio, contratada na entrega, sem carência e sem
 *   franquia" → `PROCEDENCIA_PADRAO`, faixa que a ficha do veículo já exibe;
 * - "perícia cautelar independente em 100% do estoque, laudo sai a pedido" →
 *   `aboutSettings.value1`;
 * - "crivo técnico de mais de 120 pontos antes da entrega" →
 *   `aboutSettings.value2`;
 * - "de cada dez avaliados, três entram" → `aboutSettings.historyP1`;
 * - "transferência acompanhada" → `PROCEDENCIA_PADRAO`;
 * - **três meses de cobertura** → decisão do dono em 2026-08-25;
 * - **entrega para todo o Brasil** → decisão do dono em 2026-09-04. O que é
 *   regional é a MÍDIA — os anúncios rodam em Paraná e litoral de Santa
 *   Catarina —, não o serviço.
 *
 *   `CIDADES_ATENDIDAS` em `schemaLoja.ts` NÃO tem nada a ver com isso e não
 *   mudou: são as seis cidades da Região Metropolitana (Curitiba, Pinhais,
 *   Colombo, São José dos Pinhais, Almirante Tamandaré, Araucária), e o
 *   `areaServed` do schema significa raio de COMPETIÇÃO, como o comentário de
 *   lá explica. Três alcances diferentes convivem de propósito: onde a loja
 *   compete, onde a mídia roda, e para onde a loja entrega.
 *
 * ---------------------------------------------------------------------------
 * Duas decisões de redação que não são estilo
 * ---------------------------------------------------------------------------
 * **Os três meses não são vendidos como vantagem.** O
 * `conteudo-seo/POSICIONAMENTO.md` registra que os 90 dias do CDC são
 * obrigatórios em qualquer venda por pessoa jurídica — "anunciar isso como
 * vantagem é anunciar o mínimo legal, e o comprador que pesquisou já sabe
 * disso". A página afirma o prazo com clareza, diz que a cobertura contratada
 * **soma-se** aos direitos do CDC em vez de substituí-los (que é o correto), e
 * deixa o diferencial onde ele de fato está: a perícia antes da vitrine e o
 * três-em-dez.
 *
 * **Nenhuma exclusão é listada.** A página delimita o escopo — motor e câmbio —
 * e remete ao termo entregue na compra. Inventar uma lista de peças não
 * cobertas seria afirmar condição contratual que este arquivo não tem como
 * confirmar, e errar para qualquer um dos dois lados é passivo: prometer o que
 * a loja não cumpre, ou negar o que ela cobre.
 *
 * ---------------------------------------------------------------------------
 * A revisão de 2026-09-13 — alinhada às peças da Onda 1
 * ---------------------------------------------------------------------------
 * Pedido: *"precisamos rever este texto do /garantia, alinhar com o restante
 * das peças conforme o proposto"*. A proposta é
 * `conteudo-seo/pacote/paginas/garantia.md`, versão 3, camada 1. Fonte do que
 * mudou:
 *
 * - **as três seções** (a garantia · o que fazer se algo falhar · por que a
 *   perícia vem antes) → estrutura da proposta;
 * - **"na venda ao consumidor, não pedimos termo de isenção"** → proposta,
 *   RESTRITA à venda ao consumidor pela pendência de T3 da peça 07: o repasse
 *   entre lojistas pode usar esse termo, e o "Nunca pedimos" absoluto da
 *   proposta afirmaria o contrário;
 * - **"avise antes de mexer" e "guarde tudo"** → proposta; são orientação ao
 *   cliente, não condição contratual;
 * - **"empresa independente, credenciada junto ao Detran"** → redação fixada
 *   pelo dono em 09/09 (`LAUDO_APROVADO_PADRAO`), no lugar de "laboratório
 *   credenciado";
 * - **"antes disso, é só pedir"**, colado na promessa do laudo → PR #64
 *   (`24ab279`, no main desde 16/09), trazido no merge com o main: a ficha
 *   manda pedir o laudo que ainda não consta aprovado, e esta página não pode
 *   dizer outra coisa. Fica na MESMA frase da promessa, como o #64 a escreveu;
 * - **sai a explicação da lei** ("a lei já garante prazo para reclamar de
 *   vício…") → decisão editorial T8 do pacote: a página descreve o que a loja
 *   entrega, não ensina garantia legal. FICA o "soma-se aos seus direitos — não
 *   os substitui", que é o que impede a garantia de parecer a única cobertura.
 *
 * O que a proposta tem e NÃO entrou, de propósito:
 *
 * - **a tabela "o que está coberto e o que não está"** — é exatamente a lista
 *   de exclusões que a decisão acima proíbe. Fica para decisão do dono;
 * - **"sem custo de mão de obra"** — condição contratual nova, sem procedência
 *   neste arquivo além da proposta. Mesma régua da tabela;
 * - **a FAQ "loja é obrigada a dar garantia em carro usado?"** — a própria
 *   proposta a marca "para sua decisão";
 * - **os blocos `[C2]`** de garantia estendida — dependem de parceria que não
 *   existe;
 * - **o crivo técnico de showroom** a proposta omite, e aqui ele FICA:
 *   `/sobre` publica o mesmo crivo, e `tabela-de-guias.test.ts` já tratou a
 *   omissão dele como defeito de coerência.
 */
export const GARANTIA_MESES = 3;

/** A abertura, sob o `<h1>`. */
export const TEXTO_DE_GARANTIA: string[] = [
  "Todo carro vendido pela Motors Store sai com três meses de garantia de motor, câmbio e " +
    "diferencial, contados da entrega, sem carência e sem franquia. Falha interna nesses " +
    "conjuntos dentro do prazo, a gente resolve — com a mão de obra inclusa.",
  "Essa cobertura soma-se aos seus direitos de consumidor: não os substitui. O que ela cobre, " +
    "item por item, está no termo que acompanha a venda — leia antes de assinar e pergunte o " +
    "que não estiver claro.",
  "Antes dela vem a seleção. Todo veículo passa por perícia cautelar independente, e só entra " +
    "na vitrine porque passou: de cada dez avaliados, três entram. O laudo está disponível " +
    "para consulta, é só pedir ao vendedor. A garantia existe para o que a perícia não tem " +
    "como enxergar.",
];

/**
 * O corpo, em `<h2>`.
 *
 * Revisto em 17/09/2026 com o contrato de venda e o manual do plano estendido
 * na mão, e com as respostas do dono. Quatro correções que valem registro:
 *
 *   · o contrato cobre motor, câmbio E DIFERENCIAL — a página prometia menos
 *     do que a loja entrega;
 *   · as exclusões ganharam o que o contrato lista e a página não dizia:
 *     bombas, fluidos e óleos, e os custos que não são do conserto (transporte,
 *     guincho, alimentação, hospedagem);
 *   · o "crivo de mais de 120 pontos" é da perícia CAUTELAR, não de uma etapa
 *     mecânica separada. A etapa mecânica existe, mas é sob demanda: entra
 *     quando a avaliação levanta suspeita;
 *   · o plano estendido NÃO é seguro vendido ao cliente. É serviço de
 *     certificação com garantia, administrado pela Gestauto, em acréscimo à
 *     garantia legal — o número SUSEP que aparece no manual é de um seguro que
 *     cobre a Gestauto, não uma apólice do comprador. Dizer "seguro registrado
 *     na SUSEP" venderia proteção que o produto não tem no nome dele.
 */
export const SECOES_DE_GARANTIA: SecaoDeTexto[] = [
  {
    titulo: "A garantia da Motors Store",
    paragrafos: [
      "Três meses, contados da entrega, para falha interna de motor, câmbio e diferencial. " +
        "Sem carência: vale desde o primeiro dia, sem período de espera. Sem franquia: você " +
        "não paga parte do conserto, nem taxa para acionar. A mão de obra está inclusa.",
      "Na venda ao consumidor, não pedimos assinatura de termo de isenção — nenhum papel que " +
        "reduza aquilo a que você tem direito.",
      "O conserto é feito em oficina parceira credenciada, indicada pela loja. São mais de " +
        "quinze parceiras, separadas por especialidade, e é por isso que a gente pede para " +
        "você falar com a gente antes de levar o carro a qualquer lugar.",
    ],
  },
  {
    titulo: "O que está coberto e o que não está",
    paragrafos: [
      "Coberto: falha interna de componente de motor, de câmbio e de diferencial, dentro dos " +
        "três meses.",
      "Fora da cobertura, por serem manutenção ou desgaste de uso: óleo, filtros, velas e " +
        "correias no intervalo; pastilha, disco, pneu, palheta e bateria; embreagem em uso " +
        "normal; bombas, fluidos e óleos em geral.",
      "Fora também: peça fora de especificação, remap e alteração de característica do " +
        "veículo; e evento externo — colisão, enchente, granizo, vandalismo —, que é assunto " +
        "de seguro, não de garantia.",
      "E os custos que não são do conserto em si: transporte, guincho, alimentação e " +
        "hospedagem não entram. Dizer isso antes é parte do serviço; descobrir depois é o que " +
        "estraga a relação.",
    ],
  },
  {
    titulo: "Estender por 6, 12 ou 24 meses",
    paragrafos: [
      "Quem quiser ir além dos três meses pode contratar, no ato da compra, o plano de motor " +
        "e câmbio administrado pela Gestauto. É garantia mecânica contratada à parte, em " +
        "acréscimo à garantia legal e à da loja — não é seguro, e a contratação é opcional. " +
        "O preço vem destacado na proposta, não muda o valor do carro e recusar não muda a " +
        "negociação.",
      "O plano depende de aprovação do veículo: na data do checklist, ele precisa ter menos " +
        "de 180 mil quilômetros rodados e menos de oito anos de ano-modelo.",
      "Cobre componentes internos do motor e do câmbio, pelo tipo de câmbio do carro, e o " +
        "sistema de arrefecimento, com mão de obra nas oficinas credenciadas. Não cobre " +
        "turbocompressor, vazamento e aumento gradual de consumo de óleo, kit de embreagem, " +
        "elétrica em geral, ar-condicionado, freios, direção nem diferencial. A lista completa " +
        "está no manual, que o consultor mostra antes de você decidir.",
      "Duas obrigações que valem a cobertura inteira: a revisão de óleo e filtro a cada 7 mil " +
        "quilômetros ou 6 meses, o que vier primeiro, guardando a nota fiscal com a " +
        "quilometragem e a placa; e o teto de reparo escrito no termo de ativação, que vai " +
        "sendo consumido a cada acionamento. Perder a revisão é a causa número um de recusa " +
        "no país inteiro.",
      "O plano vale em todo o território nacional e pode ser transferido a quem comprar o " +
        "carro depois, mediante taxa.",
    ],
  },
  {
    titulo: "O que fazer se algo falhar",
    paragrafos: [
      "Avise antes de mexer. Fale com a gente antes de levar o carro a uma oficina por conta " +
        "própria: reparo feito sem comunicação prévia dificulta a análise e pode agravar o " +
        "problema.",
      "A gente avalia e conserta na oficina parceira da especialidade, dentro do prazo e do " +
        "escopo do termo, sem franquia e com a mão de obra inclusa.",
      "Guarde tudo: nota, contrato, laudo da perícia, ordem de serviço e a conversa por escrito.",
      "Se você contratou o plano estendido, o caminho é outro e tem prazo: pare o veículo, " +
        "acione a Gestauto em até três dias úteis, envie os documentos em até 72 horas e leve " +
        "o carro à oficina que ela indicar. Nenhum reparo pode começar antes da autorização " +
        "dela. A gente acompanha o processo com você.",
    ],
  },
  {
    titulo: "Por que a perícia vem antes da garantia",
    paragrafos: [
      "Garantia é o que a gente faz quando algo dá errado. Perícia cautelar é o que a gente " +
        "faz para que não dê.",
      "Todo veículo passa pela perícia antes de entrar na vitrine — identificação, estrutura e " +
        "histórico auditados por empresa independente, credenciada junto ao Detran, num crivo " +
        "de mais de 120 pontos — e o laudo está disponível para consulta, é só pedir ao " +
        "vendedor. Os sete de cada dez que não entram são recusados por sinistro estrutural, " +
        "passagem por leilão, adulteração de numeração ou desgaste crônico grave.",
      "Nenhuma perícia prevê tudo. Ela verifica estrutura, identificação e histórico — não " +
        "abre motor, não mede compressão de cilindro, não avalia bomba de alta pressão.",
      "Quando a avaliação levanta suspeita — vazamento, fumaça, solavanco no câmbio, " +
        "temperatura instável —, o carro vai para uma das oficinas parceiras antes de entrar, " +
        "e aí sim é examinado por dentro. Todo carro que entra recebe troca de óleo e filtros. " +
        "A garantia responde pelo que nem esse caminho inteiro tem como enxergar.",
    ],
  },
];

export const PERGUNTAS_DE_GARANTIA: PerguntaFrequente[] = [
  {
    /* A primeira pergunta é a específica da página, e as outras vêm depois —
       a régua do pacote (§2.5) para o FAQ que se repete entre páginas. */
    pergunta: "O que a garantia cobre, exatamente?",
    resposta:
      "Falha interna de motor, câmbio e diferencial, por três meses contados da entrega, sem " +
      "carência, sem franquia e com a mão de obra inclusa. O conserto é feito em oficina " +
      "parceira credenciada indicada pela loja. O detalhamento item por item está no termo " +
      "entregue junto com a venda — peça para ler antes de assinar.",
  },
  {
    pergunta: "Preciso pagar algo para acionar?",
    resposta:
      "Não há franquia. Se algo dentro da cobertura acontecer no período, fale com a loja pelo " +
      "WhatsApp antes de levar o carro a outra oficina — com o carro e a nota em mãos, " +
      "orientamos o passo seguinte.",
  },
  {
    pergunta: "Todos os carros passam por perícia cautelar?",
    /* Ver o comentário gêmeo em `textoDosHubs.ts`: a ficha só publica o laudo
       com a perícia APROVADA, e parte da vitrine está em análise a qualquer
       momento — "assim que a perícia é aprovada" descrevia o que o site faz,
       mas ainda prometia publicação automática que a ficha não cobre sozinha
       (falta também o texto do laudo). Decisão do dono em 16/09/2026: o
       caminho passou a ser um só em todo o site, aprovada ou não — o laudo
       fica com o vendedor, e quem confirma é ele. */
    resposta:
      "Todos, sem exceção, e antes de entrar na vitrine. A perícia é feita por empresa independente, credenciada junto ao Detran, e o laudo está disponível " +
      "para consulta, é só pedir ao vendedor a qualquer tempo.",
  },
  {
    pergunta: "A garantia vale se eu comprar de outra cidade?",
    resposta:
      "Vale. A cobertura é a mesma em Curitiba, na Região Metropolitana e para quem compra de " +
      "fora — entregamos no Paraná e em Santa Catarina até Balneário Camboriú. O que muda é a " +
      "logística de entrega, combinada caso a caso.",
  },
  {
    pergunta: "Dá para estender a garantia?",
    /* O plano é o da Gestauto, e a redação segue o manual dele por ordem do
       dono (17/09/2026). Duas coisas que a página NÃO pode dizer: que é seguro
       (é serviço de certificação com garantia, contratado à parte) e que o
       registro SUSEP do manual protege o comprador — ele cobre a própria
       Gestauto. E a contratação é opcional por norma: nada de condicionar
       preço, desconto ou entrega do carro a ela. */
    resposta:
      "Dá, no ato da compra, por 6, 12 ou 24 meses, com aprovação do veículo — ele precisa " +
      "ter menos de 180 mil quilômetros e menos de oito anos de ano-modelo. É garantia " +
      "mecânica administrada pela Gestauto, contratada à parte e em acréscimo à garantia da " +
      "loja; a contratação é opcional e o preço vem destacado na proposta. O plano exige " +
      "revisão de óleo e filtro a cada 7 mil quilômetros ou 6 meses, com nota fiscal, e tem " +
      "teto de reparo no termo de ativação.",
  },
  {
    pergunta: "E a documentação da transferência?",
    resposta:
      "Cuidamos da documentação e da vistoria de transferência. Custos e prazos são informados " +
      "durante a negociação, antes de fechar — nunca depois.",
  },
];
