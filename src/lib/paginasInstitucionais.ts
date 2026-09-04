import type { PerguntaFrequente } from "../components/modernist/PaginaDeEstoque";

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
 * - "troca como entrada, avaliação em ~10 minutos pela FIPE" → a régua da home
 *   e a Avaliação Express, que já operam assim;
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
  "Seu carro atual entra como entrada. A Avaliação Express dá uma proposta em cerca de dez " +
    "minutos, com base na Tabela FIPE e no giro do nosso estoque — e nem todo carro avaliado " +
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
      "Pode. A avaliação leva cerca de dez minutos, é feita com base na Tabela FIPE e no giro do " +
      "nosso estoque, e o valor aprovado entra como entrada no financiamento do próximo carro.",
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
 * - "perícia cautelar independente em 100% do estoque, laudo na ficha" →
 *   `aboutSettings.value1`;
 * - "crivo técnico de mais de 120 pontos antes da entrega" →
 *   `aboutSettings.value2`;
 * - "de cada dez avaliados, três entram" → `aboutSettings.historyP1`;
 * - "transferência acompanhada" → `PROCEDENCIA_PADRAO`;
 * - **três meses de cobertura** → decisão do dono em 2026-08-25.
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
 */
export const GARANTIA_MESES = 3;

export const TEXTO_DE_GARANTIA: string[] = [
  "Todo carro vendido pela Motors Store sai com garantia de motor e câmbio por três meses, " +
    "contratada na entrega, sem carência e sem franquia. Sem carência significa que ela vale " +
    "desde o dia em que você pega a chave; sem franquia, que não há valor a pagar para acionar.",
  "Essa cobertura contratada soma-se aos seus direitos de consumidor — não os substitui. A lei " +
    "já garante prazo para reclamar de vício em produto durável comprado de pessoa jurídica, e " +
    "nada aqui reduz isso. O escopo do que a garantia de motor e câmbio cobre e o que fica de " +
    "fora está no termo que acompanha a venda: leia antes de assinar, e pergunte o que não " +
    "estiver claro. Se um vendedor não deixa você ler o termo com calma, o problema não é o termo.",
  "O que faz diferença de verdade, porém, acontece antes da garantia. Todo veículo passa por " +
    "perícia cautelar independente antes de entrar na vitrine — estrutura, chassi e histórico de sinistro auditados por " +
    "laboratório credenciado — e o laudo fica publicado na ficha do carro assim que é aprovado, " +
    "não guardado numa gaveta para mostrar depois da proposta. De cada dez veículos avaliados, " +
    "três entram no estoque. Os outros sete vão para repasse.",
  "Antes da entrega, o carro ainda passa pelo crivo técnico de showroom: mais de 120 pontos " +
    "mecânicos e eletrônicos conferidos. Garantia é a rede embaixo do trapézio — ela existe para " +
    "o caso raro. O trabalho de verdade é fazer com que ela quase nunca precise ser usada.",
];

export const PERGUNTAS_DE_GARANTIA: PerguntaFrequente[] = [
  {
    pergunta: "Qual o prazo da garantia?",
    resposta:
      "Três meses de garantia de motor e câmbio, contados da entrega do veículo. É cobertura " +
      "contratada, sem carência e sem franquia, e ela se soma aos seus direitos de consumidor.",
  },
  {
    pergunta: "O que exatamente a garantia cobre?",
    resposta:
      "Motor e câmbio. O detalhamento do que está coberto e do que fica de fora é o do termo " +
      "entregue junto com a venda — peça para ler antes de assinar. Nossa equipe explica cada " +
      "item na entrega, sem pressa.",
  },
  {
    pergunta: "Preciso pagar algo para acionar?",
    resposta:
      "Não há franquia. Se algo dentro da cobertura acontecer no período, fale com a loja pelo " +
      "WhatsApp com o carro e a nota em mãos que orientamos o passo seguinte.",
  },
  {
    pergunta: "Todos os carros passam por perícia cautelar?",
    /* Ver o comentário gêmeo em `textoDosHubs.ts`: a ficha só publica o laudo
       com a perícia APROVADA, e parte da vitrine está em análise a qualquer
       momento. "Assim que a perícia é aprovada" descreve o que o site faz. */
    resposta:
      "Todos, sem exceção, e antes de entrar na vitrine. A perícia é feita por empresa independente e o laudo fica na ficha " +
      "do veículo, no site, assim que é aprovada — dá para ler antes de vir à loja.",
  },
  {
    pergunta: "A garantia vale se eu comprar de outra cidade?",
    resposta:
      "Vale. Atendemos Curitiba, a Região Metropolitana e compradores de fora do estado, e a " +
      "cobertura é a mesma. O que muda é a logística de entrega, combinada caso a caso.",
  },
  {
    pergunta: "E a documentação da transferência?",
    resposta:
      "Cuidamos da documentação e da vistoria de transferência. Custos e prazos são informados " +
      "durante a negociação, antes de fechar — nunca depois.",
  },
];
