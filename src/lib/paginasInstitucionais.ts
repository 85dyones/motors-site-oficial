import type { PerguntaFrequente, SecaoDeTexto } from "../components/modernist/PaginaDeEstoque";
import { ANO_MAIS_ANTIGO_FINANCIADO } from "./finance-calculator";

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
  "Quase todo seminovo em Curitiba sai financiado, e a compra costuma se decidir menos pelo " +
    "preço à vista do que por duas perguntas: quanto fica a parcela e quanto vale o seu carro " +
    "na troca. O simulador abaixo responde a primeira com o estoque real da loja. Você escolhe " +
    "o veículo, a entrada e o prazo e vê a parcela na hora.",
  "A simulação e a pré-aprovação são feitas pela nossa equipe direto no WhatsApp, com os " +
    "principais bancos parceiros. Trabalhar com mais de um banco importa porque cada um lê " +
    "perfil de crédito de um jeito: a mesma pessoa recebe respostas diferentes, e quem manda " +
    "a proposta para um só nunca descobre isso.",
  "Seu carro atual vale como entrada. A Avaliação Express devolve uma proposta pelo " +
    "WhatsApp, com base na Tabela FIPE e no giro do nosso estoque. Nem todo carro avaliado " +
    "vira estoque nosso, e quando não vira a gente diz por quê.",
  "A simulação não promete aprovação. Taxa, prazo e valor final dependem de análise de " +
    "crédito, e o número que aparece aqui é uma estimativa com IOF incluído, não uma " +
    "proposta. Quem fecha a condição é o banco, com o seu CPF na frente.",
];

/**
 * O FAQ de `/financiamento`, com o ano mais antigo que os bancos parceiros
 * financiam — decisão do dono de 28/09/2026, e dado da vigência de
 * `parametros_financiamento`. A página e o assistente passam o ano da
 * vigência; `PERGUNTAS_DE_FINANCIAMENTO`, abaixo, é o mesmo FAQ com o ano de
 * fábrica.
 *
 * A última resposta dizia "Sim" a "financiam qualquer carro?", e que carro
 * fora do seletor "já foi vendido". Com o seletor mostrando só os carros que
 * os bancos financiam, as duas frases ficaram falsas no mesmo dia.
 */
export function perguntasDeFinanciamento(anoMaisAntigo: number): PerguntaFrequente[] {
  return [
    {
      pergunta: "Dá para financiar sem entrada?",
      resposta:
        "Em muitos casos, sim, e o simulador tem essa opção. Financiamento sem entrada costuma ter " +
        "parcela mais alta e análise mais exigente, então vale simular as duas formas antes de decidir.",
    },
    {
      pergunta: "Posso usar meu carro como entrada?",
      resposta:
        "Pode. A avaliação é feita com base na Tabela FIPE e no giro do nosso estoque, e um " +
        "consultor devolve a proposta pelo WhatsApp. O valor aprovado entra como entrada no " +
        "financiamento do próximo carro.",
    },
    {
      pergunta: "Em quantas vezes consigo parcelar?",
      resposta:
        "O simulador vai até 60 parcelas. O prazo efetivamente aprovado depende do banco, do " +
        "perfil de crédito e do ano do veículo, e carro mais antigo costuma ter prazo menor.",
    },
    {
      pergunta: "A taxa que aparece no simulador é a taxa final?",
      resposta:
        "Não. É uma estimativa, já com IOF, para você ter ordem de grandeza da parcela. A " +
        "taxa final sai da análise de crédito de cada banco e pode ficar acima ou abaixo dela.",
    },
    {
      pergunta: "Preciso ir à loja para simular?",
      resposta:
        "Não. A simulação é aqui e a pré-aprovação sai pelo WhatsApp. A visita fica para ver o " +
        "carro, no showroom da Rua Ernesto Piazzetta, 98, no Bacacheri.",
    },
    {
      pergunta: "Vocês financiam qualquer carro do estoque?",
      resposta:
        `Os bancos parceiros financiam carros de ${anoMaisAntigo} em diante, e o seletor do ` +
        "simulador mostra só esses, entre os disponíveis agora. Para um carro mais antigo a ficha " +
        "não traz estimativa de parcela, e um consultor mostra as outras formas de pagamento.",
    },
  ];
}

/** O FAQ com o ano de fábrica — para quem não tem a vigência à mão. */
export const PERGUNTAS_DE_FINANCIAMENTO: PerguntaFrequente[] = perguntasDeFinanciamento(ANO_MAIS_ANTIGO_FINANCIADO);

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
 * - **o alcance da entrega** → `ALCANCE_DA_ENTREGA`, logo abaixo. Em
 *   2026-09-04 o dono ditou "todo o Brasil", e o argumento era que o regional
 *   é a MÍDIA, não o serviço; em 2026-09-17, com as 36 fichas novas já
 *   publicadas dizendo Paraná e Santa Catarina, ele decidiu o contrário, e a
 *   frase pública passou a ser a mesma das fichas. A decisão nova vale porque
 *   é a nova — e porque promessa que muda de superfície para superfície é a
 *   que o cliente descobre no balcão;
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

/**
 * O limite de quilometragem da garantia da loja, informado pelo dono em
 * 18/09/2026: "5.000 km de média nos 3 meses". Vale o que vier primeiro — o
 * prazo ou a quilometragem, contados da entrega.
 *
 * ⚠️ **O contrato padrão de venda não traz este limite.** A cláusula quarta
 * fala em prazo e só. Até 17/09 o site não citava quilometragem nenhuma por
 * isso: sem o número, a frase mandaria o comprador procurar no contrato uma
 * linha que não existe. Com o número confirmado pelo dono, o site passa a
 * dizê-lo — e a proposta de redação para o contrato foi levada a ele, porque
 * limite que só o site publica é limite difícil de sustentar numa recusa.
 */
export const GARANTIA_KM = 5000;

/**
 * "5.000", com o ponto de milhar — montado da constante, nunca digitado. Sem
 * `toLocaleString`: o módulo também vai para o bundle do cliente, e o ponto de
 * milhar não pode depender do ICU de quem executa.
 */
export const GARANTIA_KM_TEXTO = String(GARANTIA_KM).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/**
 * O prazo inteiro, numa expressão só, para toda frase que diz quanto a
 * garantia dura: "três meses ou 5.000 quilômetros, o que vier primeiro".
 * "três" por extenso, como a página sempre escreveu; o número de meses que
 * vai para máquina (Ney, fichas) sai de `GARANTIA_MESES`.
 */
export const PRAZO_DA_GARANTIA = `três meses ou ${GARANTIA_KM_TEXTO} quilômetros, o que vier primeiro`;

/**
 * Onde a loja entrega, em UMA frase, para todas as superfícies públicas.
 *
 * Esta promessa já mudou duas vezes, e nas duas ela estava escrita à mão em
 * quatro lugares: FAQ da garantia, FAQ das páginas geo, briefing do Ney e o
 * fallback de `/sobre`. Decisão do dono em 17/09/2026: **Paraná e Santa
 * Catarina até Balneário Camboriú** — as MESMAS palavras que
 * `descritivo/briefing.ts` manda usar no fecho das fichas, de propósito. Uma
 * promessa, uma frase, um lugar para mudar.
 *
 * `aboutSettings.json` repete estas palavras à mão porque é JSON e não
 * importa daqui; `promessa-publica.test.ts` compara os dois.
 */
export const ALCANCE_DA_ENTREGA =
  "entregamos em todo o Paraná e no litoral catarinense até Balneário Camboriú";

/**
 * Os prazos vendidos do plano estendido da Gestauto (dono, 17/09/2026).
 *
 * Constante pelo mesmo motivo que `GARANTIA_MESES`: prazo digitado no meio da
 * prosa é o que `paginas-institucionais.test.ts` caça desde 13/09. Estes NÃO
 * são o prazo da loja — são os do plano contratado à parte —, e quem lê o
 * código precisa ver a diferença sem depender da memória de quem escreveu.
 */
export const PLANOS_ESTENDIDOS_MESES = [6, 12, 24] as const;

/** "6, 12 ou 24 meses", montado a partir da constante — nunca digitado. */
export const PRAZOS_ESTENDIDOS = `${PLANOS_ESTENDIDOS_MESES.slice(0, -1).join(", ")} ou ${
  PLANOS_ESTENDIDOS_MESES[PLANOS_ESTENDIDOS_MESES.length - 1]
} meses`;

/**
 * O resumo do topo de `/garantia` (tarefa 4.8 da revisão de UI de 30/09):
 * para responder "está coberto?" sem rolar. Nenhuma afirmação nova: cada item
 * está nas seções abaixo, com as mesmas palavras do termo ("pastilha e disco",
 * "embreagem em uso normal"), e o prazo sai de `PRAZO_DA_GARANTIA`.
 *
 * "Não cobre" traz a ressalva da correia (resposta do dono, 18/09): quem para
 * no resumo não pode ler "não" onde o termo diz "entra". E o quarto item põe
 * a perícia ao lado do prazo, porque o diferencial da loja é a seleção, não os
 * três meses (ver o docblock de `garantia/page.tsx`). Revisão do qa-guardian.
 */
export const RESUMO_DA_GARANTIA: { rotulo: string; texto: string }[] = [
  {
    rotulo: "Prazo",
    texto:
      `${PRAZO_DA_GARANTIA.charAt(0).toUpperCase()}${PRAZO_DA_GARANTIA.slice(1)}, contados da ` +
      "entrega. Sem carência e sem franquia.",
  },
  {
    rotulo: "Cobre",
    texto:
      "Falha interna de motor (com o turbo original de fábrica), câmbio e diferencial. O conserto " +
      "é em oficina parceira, com a mão de obra inclusa.",
  },
  {
    rotulo: "Não cobre",
    texto:
      "Manutenção e desgaste de uso (óleo, filtros, pastilha e disco de freio, pneu, bateria, " +
      "embreagem em uso normal), peça fora de especificação, evento externo como colisão e " +
      "enchente, e custos fora do conserto, como guincho e transporte. Se um item de manutenção " +
      "falhar dentro do prazo e o dano atingir o motor ou o câmbio, esse dano entra.",
  },
  {
    rotulo: "Antes da garantia",
    texto:
      "Todo carro passa por perícia cautelar independente antes da vitrine. De cada dez " +
      "avaliados, três entram.",
  },
];

/** A abertura, sob o `<h1>`. */
export const TEXTO_DE_GARANTIA: string[] = [
  "Todo carro do estoque da Motors Store sai com garantia de motor e câmbio, e também do " +
    "diferencial, como está no contrato de venda. O prazo é de " +
    `${PRAZO_DA_GARANTIA}, contados da entrega, sem carência e sem franquia. Se um desses ` +
    "conjuntos tiver falha interna dentro do prazo, a gente resolve, com a mão de obra inclusa.",
  "Essa cobertura soma-se aos seus direitos de consumidor e não os substitui. O que ela cobre, " +
    "item por item, está no termo que acompanha a venda: leia antes de assinar e pergunte o " +
    "que não estiver claro.",
  "Antes da garantia vem a seleção. Todo veículo do estoque passa por perícia cautelar independente e só " +
    "entra na vitrine se passar: de cada dez avaliados, três entram. O laudo está disponível " +
    "para consulta, e é só pedir ao vendedor.",
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
      `${PRAZO_DA_GARANTIA.charAt(0).toUpperCase()}${PRAZO_DA_GARANTIA.slice(1)}, contados ` +
        "da entrega, para falha interna de motor, câmbio e diferencial. Não há carência: a " +
        "garantia vale desde o primeiro dia. Também não há franquia, então você não paga parte " +
        "do conserto nem taxa para acionar. A mão de obra está inclusa.",
      "Na venda ao consumidor, não pedimos assinatura de termo de isenção nem de qualquer " +
        "papel que reduza aquilo a que você tem direito.",
      "O conserto é feito em oficina parceira credenciada, indicada pela loja. São mais de " +
        "quinze parceiras, separadas por especialidade, e por isso pedimos que você fale com a " +
        "gente antes de levar o carro a qualquer lugar.",
    ],
  },
  {
    titulo: "O que está coberto e o que não está",
    paragrafos: [
      // Turbo: resposta do dono em 18/09/2026 — "se for de fábrica, sim". O
      // turbo original é componente do motor; o que não é original cai na
      // exclusão de peça fora de especificação, logo abaixo.
      // Em lista desde 30/09/2026: o dono pediu texto escaneável, e as duas
      // enumerações eram os blocos mais longos da página. As marcas são as de
      // `lib/blocosDoGuia.ts` ("- " vira item), que `PaginaDeEstoque` desenha.
      "Coberto: a falha interna, dentro do prazo, destas partes:\n" +
        "- componente de motor, incluído o turbocompressor, quando é o original de fábrica;\n" +
        "- câmbio;\n" +
        "- diferencial.",
      "Fora da cobertura, por serem manutenção ou desgaste de uso:\n" +
        "- óleo, filtros, velas e correias no intervalo;\n" +
        "- pastilha, disco, pneu, palheta e bateria;\n" +
        "- embreagem em uso normal;\n" +
        "- bombas, fluidos e óleos em geral.",
      // Resposta do dono em 18/09/2026 à pergunta que a peça da correia banhada
      // deixou aberta: "entra, se estiver no prazo e tiver ligação com o centro
      // maior, motor e caixa".
      "Com uma ressalva: quando um item de manutenção falha dentro do prazo e o dano atinge o " +
        "motor ou o câmbio (uma correia que se rompe e leva junto os internos do motor, por " +
        "exemplo), o conserto desse dano entra na cobertura.",
      "Também ficam fora:\n" +
        "- peça fora de especificação (um turbo que não é o original de fábrica entra aqui), " +
        "remap e alteração de característica do veículo;\n" +
        "- evento externo, como colisão, enchente, granizo e vandalismo, que é assunto de " +
        "seguro, não de garantia;\n" +
        "- os custos que não são do conserto em si: transporte, guincho, alimentação e " +
        "hospedagem.",
    ],
  },
  {
    titulo: `Estender por ${PRAZOS_ESTENDIDOS}`,
    /* Enxugada em 18/09/2026, por ordem do dono: "não vamos falar de detalhes
       tanto assim da garantia estendida, é um serviço que vendemos e o
       terceiro especifica". Até ali a seção reproduzia o manual — coberturas,
       exclusões, elegibilidade, manutenção obrigatória, teto de reparo,
       transferência. Quem define essas condições é a administradora, e ela
       pode mudá-las sem que esta página saiba; o que a loja afirma é o que é
       dela: o plano existe, é opcional, é à parte, e o manual vem antes da
       assinatura. */
    paragrafos: [
      "Quem quiser ir além dos três meses pode contratar, no ato da compra, um plano de " +
        "garantia mecânica de motor e câmbio, administrado por empresa especializada. É " +
        "contratado à parte e opcional: o preço vem destacado na proposta, não muda o valor do " +
        "carro, e recusar não muda a negociação.",
      // "Mesmo manual" — resposta do dono em 18/09/2026 sobre os três prazos.
      "Cobertura, exclusões, manutenção exigida e a forma de acionar são definidas pela " +
        "administradora no manual do plano, que é o mesmo para os três prazos. O consultor " +
        "apresenta o manual antes de você decidir.",
    ],
  },
  {
    titulo: "O que fazer se algo falhar",
    paragrafos: [
      "- Avise antes de mexer. Reparo feito por conta própria, sem falar com a gente antes, " +
        "dificulta a análise e pode agravar o problema.\n" +
        "- A gente avalia e conserta na oficina parceira da especialidade, dentro do prazo e do " +
        "escopo do termo, sem franquia e com a mão de obra inclusa.\n" +
        "- Guarde tudo: nota, contrato, laudo da perícia, ordem de serviço e a conversa por " +
        "escrito.",
      "Se você contratou o plano estendido, o acionamento segue as regras da administradora, " +
        "descritas no manual, e começa antes de qualquer reparo. A gente acompanha o processo " +
        "com você.",
    ],
  },
  {
    titulo: "Por que a perícia vem antes da garantia",
    paragrafos: [
      "A garantia entra quando algo dá errado. A perícia cautelar vem antes, para evitar que dê.",
      "Todo veículo do estoque passa pela perícia antes de entrar na vitrine: identificação, estrutura e " +
        "histórico auditados por empresa independente, credenciada junto ao Detran, num crivo " +
        "de mais de 120 pontos. O laudo está disponível para consulta, e é só pedir ao " +
        "vendedor.",
      "Os sete de cada dez que não entram são recusados por um destes motivos:\n" +
        "- sinistro estrutural;\n" +
        "- passagem por leilão;\n" +
        "- adulteração de numeração;\n" +
        "- desgaste crônico grave.",
      "Nenhuma perícia prevê tudo. Ela verifica estrutura, identificação e histórico, mas não " +
        "abre motor, não mede compressão de cilindro nem avalia bomba de alta pressão.",
      "Quando a avaliação levanta suspeita (vazamento, fumaça, solavanco no câmbio, " +
        "temperatura instável), o carro vai para uma das oficinas parceiras antes de entrar, " +
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
      "Falha interna de motor (incluído o turbo original de fábrica), câmbio e diferencial, " +
      `por ${PRAZO_DA_GARANTIA}, contados da entrega, sem carência, sem franquia e com a mão ` +
      "de obra inclusa. O conserto é feito em oficina parceira credenciada indicada pela loja. " +
      "O detalhamento item por item está no termo entregue junto com a venda: peça para ler " +
      "antes de assinar.",
  },
  {
    pergunta: "Preciso pagar algo para acionar?",
    resposta:
      "Não há franquia. Se algo dentro da cobertura acontecer no período, fale com a loja pelo " +
      "WhatsApp antes de levar o carro a outra oficina. Com o carro e a nota em mãos, " +
      "orientamos o passo seguinte.",
  },
  {
    pergunta: "Todos os carros do estoque passam por perícia cautelar?",
    /* Ver o comentário gêmeo em `textoDosHubs.ts`: a ficha só publica o laudo
       com a perícia APROVADA, e parte da vitrine está em análise a qualquer
       momento — "assim que a perícia é aprovada" descrevia o que o site faz,
       mas ainda prometia publicação automática que a ficha não cobre sozinha
       (falta também o texto do laudo). Decisão do dono em 16/09/2026: o
       caminho passou a ser um só em todo o site, aprovada ou não — o laudo
       fica com o vendedor, e quem confirma é ele. */
    resposta:
      "Todos, sem exceção, e antes de entrar na vitrine. A perícia é feita por empresa independente, credenciada junto ao Detran, e o laudo está disponível " +
      "para consulta: é só pedir ao vendedor, a qualquer tempo.",
  },
  {
    pergunta: "A garantia vale se eu comprar de outra cidade?",
    resposta:
      "Vale. A cobertura é a mesma em Curitiba, na Região Metropolitana e para quem compra de " +
      `fora: ${ALCANCE_DA_ENTREGA}. Muda só a logística de entrega, combinada caso a ` +
      "caso.",
  },
  {
    pergunta: "Dá para estender a garantia?",
    /* Resposta curta desde 18/09/2026, pela mesma ordem do dono que enxugou a
       seção: as condições são da administradora e ficam no manual dela. Duas
       coisas continuam valendo: o plano não é chamado de seguro, e a
       contratação é opcional — nada de condicionar preço, desconto ou entrega
       do carro a ela. */
    resposta:
      `Dá, no ato da compra, por ${PRAZOS_ESTENDIDOS}: um plano de garantia mecânica de motor ` +
      "e câmbio, contratado à parte e administrado por empresa especializada. A contratação é " +
      "opcional e o preço vem destacado na proposta. Cobertura e condições são as do manual do " +
      "plano, que o consultor apresenta antes de você decidir.",
  },
  {
    pergunta: "E a documentação da transferência?",
    resposta:
      "Cuidamos da documentação e da vistoria de transferência. Custos e prazos são informados " +
      "durante a negociação, antes de fechar.",
  },
];
