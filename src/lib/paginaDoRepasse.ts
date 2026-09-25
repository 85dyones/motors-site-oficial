/**
 * Todo o texto fixo da seção de repasse (spec §7.3).
 *
 * Transcrito das pranchas da versão 5 do Design (`.superpowers/desenho-v5/
 * TEXTOS.md`, partes 1 a 3). A parte 4 das pranchas é dado de exemplo e NÃO
 * mora aqui: carro, preço, FIPE, data e o nome "Ana" saem do banco na hora de
 * desenhar — ou a peça some (decisão 19 do plano do PR 3).
 *
 * As regras do dono valem para cada linha, e `tests/pagina-do-repasse.test.ts`
 * as cobra sobre todo valor exportado daqui e sobre o texto que as funções
 * montam:
 *   - nunca dizer que um carro "não girou", nem os rótulos antigos ("fora do
 *     perfil", "veio em lote");
 *   - nada de CDC, direitos do consumidor, "%", "a partir de R$", "premium",
 *     "exclusivo", "melhor preço" ou "consulte";
 *   - laudo não é publicado: toda frase que diz que ele sai diz que sai a
 *     pedido.
 *
 * A garantia do estoque só entra por `PRAZO_DA_GARANTIA`: o prazo digitado à
 * mão é o que a loja já teve de corrigir em 01/09.
 *
 * Exceção às pranchas (spec §7.4): a linha de consentimento da lista é a
 * aprovada para a `/privacidade`, não o "Ao enviar, você concorda…".
 *
 * Sem travessão em nenhuma string: `tests/textos-sem-marcas-de-ia.test.ts`
 * lê este módulo inteiro. E sem string que só sirva de valor de banco
 * ("consumidor", "lojista"): a régua lê tudo o que é exportado, e a trilha é
 * chave de objeto aqui, nunca valor.
 */
import type { PerguntaFrequente } from "../components/modernist/PaginaDeEstoque";
import { concordar, o, um, type Genero } from "./generoDoVeiculo";
import { PRAZO_DA_GARANTIA } from "./paginasInstitucionais";
import {
  FAIXAS_DO_REPASSE,
  type CarroceriaDoRepasse,
  type FaixaDoRepasse,
  type FiltroDoRepasse,
  type LaudoDoRepasse,
} from "./repasse";

const PRAZO_COM_MAIUSCULA = `${PRAZO_DA_GARANTIA.charAt(0).toUpperCase()}${PRAZO_DA_GARANTIA.slice(1)}`;

const minuscula = (texto: string) => texto.charAt(0).toLowerCase() + texto.slice(1);
const semPontoFinal = (texto: string) => texto.trim().replace(/[.\s]+$/, "");

/** "a, b ou c" — a lista como se fala. */
function juntar(partes: string[], conector: string): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} ${conector} ${partes[partes.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Caminho e âncoras — os links entre as seções e entre as páginas
// ---------------------------------------------------------------------------

export const CAMINHO_DO_REPASSE = "/repasse";
export const ANCORA_DO_LOTE = "lote";
export const ANCORA_DA_LISTA = "lista";
/** Abrir `/repasse#lista-lojista` abre a lista já na trilha do lojista (decisão 5). */
export const ANCORA_DA_LISTA_LOJISTA = "lista-lojista";
export const ANCORA_DA_FICHA_DE_ESTADO = "ficha-de-estado";
export const ANCORA_DO_EXAME = "exame";
export const ANCORA_DO_ESTOQUE = "estoque";
export const ANCORA_DA_CONTA = "como-ler";

// ---------------------------------------------------------------------------
// Página /repasse — topo
// ---------------------------------------------------------------------------

export const TITULO_DO_REPASSE = "Carros de repasse em Curitiba";

export const DESCRICAO_DO_REPASSE =
  "Abaixo da FIPE e sem a garantia da loja. Cada anúncio diz se o carro tem laudo cautelar e mostra a conta, com o reparo orçado quando ele existe.";

export const TITULO_SEO_DO_REPASSE = `${TITULO_DO_REPASSE} | Motors Store`;

export const TRILHA_DO_REPASSE = { inicio: "Início", repasse: "Repasse" } as const;

export const HEROI_DO_REPASSE = {
  rotulo: "REPASSE MOTORS · REPASSE ÀS CLARAS",
  titulo: TITULO_DO_REPASSE,
  texto: DESCRICAO_DO_REPASSE,
  legenda: "Para que você compra",
  usar: {
    botao: "COMPRO PARA USAR",
    botaoCurto: "PARA USAR",
    texto:
      "Você paga à vista, examina o carro no pátio com o seu mecânico e sabe antes quanto vai gastar para deixá-lo em ordem.",
    receber: "RECEBER NO WHATSAPP",
  },
  revender: {
    botao: "COMPRO PARA REVENDER",
    botaoCurto: "PARA REVENDER",
    texto:
      "Com o CNPJ cadastrado, o carro chega no seu WhatsApp antes de entrar no site. Dá para negociar condição de lote, e a nota sai no CNPJ da sua loja.",
    cadastrar: "CADASTRAR MEU CNPJ",
    verAberto: "VER O QUE ESTÁ ABERTO",
  },
} as const;

export const COMO_LER_UM_REPASSE = {
  rotulo: "COMO LER UM REPASSE",
  nota: "O orçamento é da oficina que examinou o carro. O seu mecânico pode conferir no pátio antes de você fechar.",
} as const;

/** "A conta do Renault Kwid Zen 1.0 2021" — o carro de verdade, nunca o da prancha. */
export function tituloDaContaDoCarro(nome: string): string {
  return `A conta do ${nome}`;
}

/** "Reparo: embreagem patinando nas arrancadas e pneus dianteiros no fim da vida útil". */
export function linhaDoReparo(itens: string[]): string {
  return `Reparo: ${juntar(itens.map((item) => minuscula(item.trim())), "e")}`;
}

export const ROTULOS_DA_CONTA = {
  preco: "Preço à vista",
  reparo: "Reparo orçado",
  verFicha: "(ver ficha)",
  voceGasta: "Você gasta",
  abaixo: "Fica abaixo da FIPE",
  abaixoCurto: "Abaixo da FIPE",
  noEstado: "à vista, no estado",
} as const;

/**
 * "FIPE de setembro". A API devolve o mês por extenso com o ano ("setembro de
 * 2026"); a prancha escreve só o mês. Sem mês, o termo do glossário.
 */
export function rotuloDaFipe(mesDeReferencia: string | null): string {
  const mes = (mesDeReferencia ?? "").replace(/\s+de\s+\d{4}\s*$/i, "").trim();
  return mes ? `FIPE de ${mes}` : "FIPE do mês";
}

/** "FIPE de setembro, Kwid Zen 1.0 2021" — a ficha desktop diz de qual versão. */
export function rotuloDaFipeNaFicha(mesDeReferencia: string | null, carro: string): string {
  return `${rotuloDaFipe(mesDeReferencia)}, ${carro}`;
}

export const PROVAS_DO_REPASSE = {
  rotulo: "O que todo repasse traz",
  itens: [
    {
      numero: "01",
      titulo: "Com laudo ou sem laudo",
      texto:
        "Cada anúncio diz se o carro já tem laudo cautelar. Quando tem, o laudo sai a pedido, antes de qualquer sinal.",
    },
    {
      numero: "02",
      titulo: "A conta aberta",
      texto:
        "Preço à vista, FIPE do mês e o orçamento do reparo quando há. A diferença para a FIPE aparece em reais.",
    },
    {
      numero: "03",
      titulo: "A ficha de estado",
      texto: "Os defeitos que conhecemos, com foto. Você assina essa mesma lista junto com o contrato.",
    },
    {
      numero: "04",
      titulo: "Exame no pátio",
      texto: "Marque um horário e traga o seu mecânico. O carro fica no pátio do Bacacheri até a compra.",
    },
  ],
} as const;

// ---------------------------------------------------------------------------
// O lote
// ---------------------------------------------------------------------------

const FILTROS_DO_LOTE: Record<FiltroDoRepasse, string> = {
  todos: "TODOS",
  "com-laudo": "COM LAUDO",
  "sem-laudo": "SEM LAUDO",
  "reparo-orcado": "REPARO ORÇADO",
};

/** As chaves são as de `ORDENS_DO_LOTE` (`loteDoRepasse.ts`); o teste da Task 8 confere. */
const ORDENS_DO_LOTE_NA_TELA = {
  recentes: "Mais recentes",
  diferenca: "Maior diferença para a FIPE",
  preco: "Menor preço",
} as const;

export const LOTE_DO_REPASSE = {
  rotulo: "LOTE ABERTO",
  ordenarPor: "Ordenar por",
  filtros: FILTROS_DO_LOTE,
  ordens: ORDENS_DO_LOTE_NA_TELA,
} as const;

export function tituloDoLote(total: number): string {
  return `${total} ${total === 1 ? "carro" : "carros"} no repasse`;
}

export function verOsCarros(total: number): string {
  return total === 1 ? "VER O CARRO" : `VER OS ${total} CARROS`;
}

export function verOsOutros(total: number): string {
  return total === 1 ? "VER O OUTRO CARRO" : `VER OS OUTROS ${total} CARROS`;
}

/**
 * "Lote atualizado hoje, 24/09 · 6 carros abertos a todos · 1 só para
 * lojistas". "Hoje" só quando a publicação mais recente É de hoje em Curitiba
 * (decisão 3); quem calcula `hoje` e `dia` é `resumoDoLote` (Task 8).
 */
export function linhaDoLote(args: { hoje: boolean; dia: string; abertos: number; soLojistas: number }): string {
  const partes = [args.hoje ? `Lote atualizado hoje, ${args.dia}` : `Lote atualizado em ${args.dia}`];
  if (args.abertos > 0) {
    partes.push(`${args.abertos} ${args.abertos === 1 ? "carro aberto" : "carros abertos"} a todos`);
  }
  if (args.soLojistas > 0) partes.push(`${args.soLojistas} só para lojistas`);
  return partes.join(" · ");
}

export const CARD_DO_REPASSE = {
  quero: "QUERO ESTE REPASSE",
  verFicha: "VER A FICHA DE ESTADO",
  soLojistas: "SÓ PARA LOJISTAS",
  soLojistasTexto: "Por enquanto, só para lojistas cadastrados",
  cadastrarCnpj: "CADASTRAR MEU CNPJ",
  aviseQuandoAbrir: "AVISE QUANDO ABRIR PARA TODOS",
  reservado: "RESERVADO",
  aviseSeVoltar: "AVISE SE ELE VOLTAR",
  vendido: "VENDIDO",
  entrarNaLista: "ENTRAR NA LISTA DO REPASSE",
} as const;

export const LAUDO_NO_CARD: Record<LaudoDoRepasse, string> = {
  aprovado: "aprovado, sai a pedido",
  aprovado_com_apontamento: "aprovado com apontamento, sai a pedido",
  nao_feito: "não feito",
};

/**
 * Até quantos caracteres o detalhe de leilão ou de sinistro cabe no card. A
 * prancha escreve "consta, pequena monta (2021)"; detalhe mais longo que isto
 * vira só "consta" no card, e o texto inteiro fica na ficha
 * (`constaNoHistorico`).
 */
const DETALHE_NO_CARD_ATE = 60;

/** "Laudo: aprovado, sai a pedido · Leilão: não consta · Sinistro: consta, pequena monta em 2021". */
export function linhaDoHistoricoNoCard(r: {
  laudo: LaudoDoRepasse | null;
  leilao_consta: boolean | null;
  leilao_detalhe: string | null;
  sinistro_consta: boolean | null;
  sinistro_detalhe: string | null;
}): string {
  const laudo = LAUDO_NO_CARD[r.laudo ?? "nao_feito"];
  const consta = (valor: boolean | null, detalhe: string | null) => {
    if (!valor) return "não consta";
    const curto = semPontoFinal(detalhe ?? "");
    return curto && curto.length <= DETALHE_NO_CARD_ATE ? `consta, ${curto}` : "consta";
  };
  return `Laudo: ${laudo} · Leilão: ${consta(r.leilao_consta, r.leilao_detalhe)} · Sinistro: ${consta(r.sinistro_consta, r.sinistro_detalhe)}`;
}

/** "28 fotos · 4 de defeitos" (as de defeito contam no total). */
export function contagemDeFotos(total: number, defeitos: number): string {
  const fotos = `${total} ${total === 1 ? "foto" : "fotos"}`;
  return defeitos > 0 ? `${fotos} · ${defeitos} de defeitos` : fotos;
}

/** "2020/2021": fabricação/modelo, como a prancha escreve mesmo quando são iguais. */
export function anosDoCarro(r: { ano_modelo: number; ano_fabricacao: number | null }): string {
  return `${r.ano_fabricacao ?? r.ano_modelo}/${r.ano_modelo}`;
}

export const PRECISA_FINANCIAR = {
  texto: `Precisa financiar ou quer garantia? O estoque tem carros com garantia de ${PRAZO_DA_GARANTIA}.`,
  link: "VER O ESTOQUE COM GARANTIA",
} as const;

export const JA_SAIRAM = {
  rotulo: "JÁ SAÍRAM DO REPASSE",
  texto: "Quem está na lista recebe o aviso no WhatsApp.",
  textoNoVazio: "Quem estava na lista recebeu o aviso no WhatsApp.",
} as const;

// ---------------------------------------------------------------------------
// A explicação
// ---------------------------------------------------------------------------

export const CONTA_ABERTA = {
  rotulo: "A CONTA ABERTA",
  titulo: "Como ler o preço de um repasse",
  termos: [
    {
      termo: "Preço à vista",
      definicao: "O valor do carro no estado em que ele está. É o que você paga, por PIX ou TED.",
    },
    {
      termo: "Reparo orçado",
      definicao:
        "O orçamento da oficina para os itens da ficha de estado que têm conserto previsto. Item estético sem orçamento aparece na ficha e fica fora da conta.",
    },
    { termo: "Você gasta", definicao: "Preço mais reparo. Use este número para comparar com outros carros." },
    {
      termo: "FIPE do mês",
      definicao: "A tabela FIPE do mês em que o anúncio foi atualizado, para o mesmo ano e a mesma versão.",
    },
    { termo: "Abaixo da FIPE", definicao: "A diferença, em reais, entre a FIPE e o que você gasta." },
  ],
  nota: "O orçamento vem de uma oficina. O seu mecânico pode chegar a outro valor, e por isso você pode trazê-lo ao pátio antes de fechar.",
} as const;

/** "EXEMPLO · RENAULT KWID ZEN 1.0 2021" — o carro de verdade do lote. */
export function rotuloDoExemplo(nome: string): string {
  return `EXEMPLO · ${nome.toUpperCase()}`;
}

/** A nota do quadro de exemplo quando o carro tem sinistro declarado. */
export function notaDoSinistro(detalhe: string): string {
  return `Consta sinistro: ${semPontoFinal(detalhe)}. Ele está escrito no anúncio e na ficha de estado, e é parte do motivo do preço.`;
}

export const REPASSE_OU_ESTOQUE = {
  rotulo: "REPASSE OU ESTOQUE",
  titulo: "A diferença, lado a lado",
  colunaRepasse: "REPASSE",
  colunaEstoque: "ESTOQUE COM GARANTIA",
  linhas: [
    {
      tema: "Preço",
      repasse: "Abaixo da FIPE, com a diferença em reais no anúncio",
      estoque: "Preço de loja, escrito no anúncio",
    },
    { tema: "Garantia da loja", repasse: "Não tem", estoque: PRAZO_COM_MAIUSCULA },
    {
      tema: "Estado do carro",
      repasse: "No estado. O anúncio diz se tem laudo cautelar, e a ficha de estado lista os defeitos conhecidos",
      estoque: "Aprovado na perícia cautelar independente antes de entrar na vitrine",
    },
    {
      tema: "Pagamento",
      repasse: "À vista, por PIX ou TED",
      estoque: "À vista, financiado ou com o seu carro na troca",
    },
    {
      tema: "Transferência",
      repasse: "Por conta de quem compra, com o documento sem restrição e sem débito",
      estoque: "Acompanhada pela loja",
    },
    {
      tema: "Antes de comprar",
      repasse: "Exame no pátio com o seu mecânico, e o laudo a pedido quando houver",
      estoque: "Laudo da perícia a pedido e test-drive",
    },
  ],
  verRepasse: "VER O REPASSE",
  verEstoque: "VER O ESTOQUE COM GARANTIA",
} as const;

export const SERVE_PARA_VOCE = {
  rotulo: "ANTES DE ESCOLHER",
  titulo: "O repasse serve para você?",
  texto:
    "Ele é bom negócio para quem compra à vista e não se importa em passar pela oficina. Para os outros casos, o estoque com garantia resolve melhor.",
  serveRotulo: "SERVE SE VOCÊ",
  serve: [
    "vai pagar à vista;",
    "tem mecânico de confiança ou prefere cuidar do reparo do seu jeito;",
    "quer pagar menos que a FIPE e aceita o carro como ele está;",
    "é lojista e compra para revender.",
  ],
  naoServeRotulo: "NÃO SERVE SE VOCÊ",
  naoServe: [
    "precisa financiar ou quer dar o seu carro na troca;",
    "quer a garantia de motor e câmbio da loja;",
    "quer o carro pronto para rodar sem passar na oficina.",
  ],
  link: "NESSES CASOS, O ESTOQUE COM GARANTIA",
} as const;

export const COMO_COMPRAR = {
  rotulo: "COMO COMPRAR",
  passos: [
    {
      numero: "01",
      titulo: "Escolha",
      texto: "No site ou pela lista do WhatsApp. O anúncio já traz a conta e a ficha de estado.",
    },
    {
      numero: "02",
      titulo: "Pergunte",
      texto: "Peça fotos extras e o histórico do carro. Nos carros com laudo cautelar, ele sai a pedido.",
    },
    {
      numero: "03",
      titulo: "Examine no pátio",
      texto: "Marque um horário no Bacacheri e traga o seu mecânico. O carro não sai do pátio antes da compra.",
    },
    {
      numero: "04",
      titulo: "Pague e transfira",
      texto:
        "À vista, por PIX ou TED. Você assina o contrato com a ficha de estado, recebe o documento sem restrição e sem débito e faz a transferência.",
    },
  ],
} as const;

// ---------------------------------------------------------------------------
// A lista do repasse
// ---------------------------------------------------------------------------

export const LISTA_DO_REPASSE = {
  rotulo: "LISTA DO REPASSE",
  titulo: "O repasse gira rápido. Receba o próximo no WhatsApp.",
  textoUsar:
    "Você conta o que procura e avisamos quando entrar um carro no seu perfil. Só mandamos repasse, e você sai da lista quando quiser.",
  vantagensLojista: [
    "O carro chega para você antes de entrar no site.",
    "Quem leva mais de um carro negocia condição de lote.",
    "A nota sai no CNPJ da sua loja, com atendimento direto.",
  ],
  trilhaUsar: "COMPRO PARA USAR",
  trilhaUsarCurta: "PARA USAR",
  trilhaLojista: "SOU LOJISTA",
  nome: "NOME",
  nomeExemplo: "Como devemos chamar você",
  whatsapp: "WHATSAPP",
  whatsappExemplo: "(41) 90000-0000",
  faixa: "QUANTO QUER GASTAR",
  tipo: "TIPO DE CARRO",
  tantoFaz: "Tanto faz",
  cnpj: "CNPJ",
  cnpjExemplo: "00.000.000/0000-00",
  lojaCidade: "LOJA E CIDADE",
  lojaCidadeExemplo: "Nome da loja, cidade",
  botaoUsar: "QUERO RECEBER OS REPASSES",
  botaoProximo: "QUERO RECEBER O PRÓXIMO",
  botaoLojista: "CADASTRAR MINHA LOJA",
  enviando: "ENVIANDO...",
  // Spec §7.4, APROVADO pelo dono em 24/09 — substitui a linha das pranchas.
  consentimento: "Ao entrar na lista, você aceita receber avisos de repasse pelo WhatsApp e pode sair quando quiser.",
  politica: "Política de privacidade",
  confirmacaoLojistaTitulo: "Recebemos o cadastro da sua loja.",
  confirmacaoLojistaTexto:
    "Vamos conferir o CNPJ e avisar pelo WhatsApp quando o aviso antecipado estiver liberado.",
  verLote: "VER O LOTE DE HOJE",
  verEstoque: "VER O ESTOQUE COM GARANTIA",
  captcha: "Não conseguimos concluir a verificação de segurança.",
} as const;

/** Rótulo do formulário, nome na frase e gênero ("um hatch", "uma picape"). */
export const NOME_DA_CARROCERIA: Record<CarroceriaDoRepasse, { rotulo: string; nome: string; genero: Genero }> = {
  hatch: { rotulo: "Hatch", nome: "hatch", genero: "m" },
  seda: { rotulo: "Sedã", nome: "sedã", genero: "m" },
  suv: { rotulo: "SUV", nome: "SUV", genero: "m" },
  picape: { rotulo: "Picape", nome: "picape", genero: "f" },
  outro: { rotulo: "Outro", nome: "carro", genero: "m" },
};

/** "Pronto, Ana. Você está na lista do repasse." — o primeiro nome digitado. */
export function tituloDaConfirmacao(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  return primeiro ? `Pronto, ${primeiro}. Você está na lista do repasse.` : "Pronto. Você está na lista do repasse.";
}

/**
 * "Quando entrar um hatch de R$ 30 mil a R$ 50 mil, ele chega no seu
 * WhatsApp." — o perfil que a pessoa marcou, com artigo e pronome
 * concordando. `comLote` acrescenta a frase do lote de hoje só onde há lote
 * para ver (a página com carro aberto); no vazio, na ficha e no não
 * encontrado ela seria promessa sem objeto.
 */
export function textoDaConfirmacao(args: {
  faixa: FaixaDoRepasse | null;
  carrocerias: readonly CarroceriaDoRepasse[];
  comLote: boolean;
}): string {
  const tipos = args.carrocerias.map((c) => `${um(NOME_DA_CARROCERIA[c].genero)} ${NOME_DA_CARROCERIA[c].nome}`);
  const oQue = tipos.length > 0 ? juntar(tipos, "ou") : "um carro";
  const faixa = FAIXAS_DO_REPASSE.find((f) => f.id === args.faixa);
  const quanto = faixa ? ` ${minuscula(faixa.rotulo)}` : "";
  const unica = args.carrocerias.length === 1 ? args.carrocerias[0] : null;
  const pronome = unica && NOME_DA_CARROCERIA[unica].genero === "f" ? "ela" : "ele";
  const primeira = `Quando entrar ${oQue}${quanto}, ${pronome} chega no seu WhatsApp.`;
  return args.comLote ? `${primeira} Enquanto isso, dá para ver o que está aberto hoje.` : primeira;
}

export const PERGUNTAS_DO_REPASSE_CABECALHO = {
  rotulo: "PERGUNTAS",
  titulo: "O que perguntam sobre o repasse",
  texto: "Sua dúvida não está aqui? Pergunte no WhatsApp.",
  botao: "PERGUNTAR NO WHATSAPP",
} as const;

/** As dez perguntas, na ordem em que a prancha as mostra. Também vão para o `FAQPage`. */
export const PERGUNTAS_DO_REPASSE: PerguntaFrequente[] = [
  {
    pergunta: "O que é um carro de repasse?",
    resposta:
      "É o carro que a loja vende no estado, sem preparar e sem a garantia da loja, por um preço abaixo da FIPE. Cada anúncio diz se o carro tem laudo cautelar e, quando há reparo pendente, quanto ele custa.",
  },
  {
    pergunta: "O que muda entre um repasse com laudo e um sem laudo?",
    resposta:
      "O com laudo já passou pela perícia cautelar, e o laudo sai a pedido antes de qualquer sinal. O sem laudo ainda não foi periciado: você examina no pátio, com o seu mecânico, e decide com a ficha de estado na mão.",
  },
  {
    pergunta: "Por que o repasse custa menos?",
    resposta:
      "A loja não investe no preparo, não assume a garantia de motor e câmbio e precisa que o carro gire rápido. O que falta arrumar está na ficha de estado e, quando orçado, entra na conta do anúncio.",
  },
  {
    pergunta: "Carro de repasse tem garantia?",
    resposta: `Não tem a garantia da loja, a de ${PRAZO_DA_GARANTIA}, que vale para o estoque.`,
  },
  {
    pergunta: "O que é a ficha de estado?",
    resposta:
      "É a lista dos defeitos que conhecemos no carro, com foto e, quando existe, o orçamento. Ela fica publicada no anúncio e você a assina junto com o contrato.",
  },
  {
    pergunta: "Posso levar o carro ao meu mecânico?",
    resposta:
      "O exame é no nosso pátio, no Bacacheri. Marque um horário e traga o seu mecânico: ele pode olhar o carro com calma antes de você decidir.",
  },
  {
    pergunta: "Dá para financiar ou dar meu carro na troca?",
    resposta:
      "Não. O repasse é só à vista, por PIX ou TED. Se você precisa financiar ou quer dar o seu carro na troca, o estoque com garantia aceita as duas coisas.",
  },
  {
    pergunta: "Quem faz a transferência?",
    resposta: "Quem compra. Entregamos o documento sem restrição e sem débito, e a transferência fica por sua conta.",
  },
  {
    pergunta: "Tem carro de leilão ou com sinistro?",
    resposta:
      "Cada anúncio informa o histórico daquele carro. Se houver registro de leilão ou de sinistro, ele aparece escrito no anúncio e na ficha de estado.",
  },
  {
    pergunta: "Sou lojista. O que muda para mim?",
    resposta:
      "Com o CNPJ cadastrado, você recebe cada carro no WhatsApp antes de ele entrar no site, pode negociar condição para lote e compra com nota no CNPJ.",
  },
];

// ---------------------------------------------------------------------------
// A ficha do carro
// ---------------------------------------------------------------------------

export const FICHA_DO_REPASSE = {
  quero: "QUERO ESTE REPASSE",
  marcarExame: "MARCAR EXAME NO PÁTIO",
  semGarantia: "Sem a garantia da loja",
  aVista: "À vista, por PIX ou TED",
  transferencia: "Transferência por conta de quem compra",
  motivoRotulo: "POR QUE ESTÁ NO REPASSE",
  motivoComReparo: "Reparo pendente, orçado antes de anunciar",
  fichaRotulo: "FICHA DE ESTADO",
  fichaTitulo: "O que sabemos deste carro",
  fichaTexto: "Os defeitos que conhecemos, com foto. É esta lista que você assina junto com o contrato.",
  colunaFoto: "FOTO",
  colunaItem: "ITEM E ONDE ESTÁ",
  colunaOrcamento: "ORÇAMENTO",
  estetico: "Estético, sem orçamento",
  semOrcamento: "Sem orçamento",
  semDefeitos: "Nenhum defeito conhecido.",
  totalOrcado: "Total orçado",
  historicoRotulo: "HISTÓRICO E DOCUMENTOS",
  laudo: "Laudo cautelar",
  leilao: "Leilão",
  sinistro: "Sinistro",
  documento: "Documento",
  documentoValor: "Sem restrição e sem débito",
  transferenciaRotulo: "Transferência",
  transferenciaValor: "Por conta de quem compra",
  consulta: "Consulta do histórico",
  naoConsta: "Não consta",
  naoVemRotulo: "O QUE NÃO VEM COM ESTE CARRO",
  naoVem: [`A garantia da loja, de ${PRAZO_DA_GARANTIA}`, "Financiamento", "O seu carro na troca"],
  naoVemDestaque: "O preço já leva em conta o que não vem.",
  naoVemTexto: "Se você precisa de garantia, financiamento ou troca, o estoque com garantia tem as três coisas.",
  entenda: "ENTENDA O REPASSE",
  exameRotulo: "EXAME NO PÁTIO",
  exameTexto: "O carro fica no pátio do Bacacheri. Traga o seu mecânico, se quiser, e olhe com calma antes de decidir.",
  dia: "DIA",
  turno: "TURNO",
  levaMecanico: "Vou levar o meu mecânico",
  pedirHorario: "PEDIR HORÁRIO",
  confirmamos: "Confirmamos o horário pelo WhatsApp.",
  pedidoEnviado: "Pedido enviado.",
  parecidosRotulo: "NO ESTOQUE COM GARANTIA",
  verOEstoque: "VER O ESTOQUE",
  queroEste: "QUERO ESTE",
  aVistaCurto: "à vista",
  seloLojistas: "SÓ PARA LOJISTAS",
  seloReservado: "RESERVADO",
  seloVendido: "VENDIDO",
} as const;

export function seloDeAberto(dia: string): string {
  return `ABERTO A TODOS DESDE ${dia}`;
}

/** A primeira linha da lista rápida da ficha. */
export function laudoNaListaRapida(laudo: LaudoDoRepasse | null): string {
  if (laudo === "aprovado") return "Laudo cautelar aprovado, sai a pedido";
  if (laudo === "aprovado_com_apontamento") return "Laudo cautelar aprovado com apontamento, sai a pedido";
  return "Sem laudo cautelar";
}

/** O valor da linha "Laudo cautelar" em "Histórico e documentos" (spec §7.2). */
export function laudoNoHistorico(laudo: LaudoDoRepasse | null, apontamento: string | null): string {
  if (laudo === "aprovado") return "Aprovado, sai a pedido";
  if (laudo === "aprovado_com_apontamento") {
    return `Aprovado com apontamento: ${semPontoFinal(apontamento ?? "")}. Sai a pedido`;
  }
  return "Não feito";
}

/** Leilão e sinistro: "Não consta", ou "Consta: <o que a equipe escreveu>". */
export function constaNoHistorico(consta: boolean | null, detalhe: string | null): string {
  return consta ? `Consta: ${semPontoFinal(detalhe ?? "")}` : FICHA_DO_REPASSE.naoConsta;
}

export function consultaFeitaEm(dia: string): string {
  return `Feita em ${dia}`;
}

export function orcamentoDaOficina(oficina: string, dia: string): string {
  return `Orçamento da oficina ${oficina.trim()}, feito em ${dia}.`;
}

/** "Marque um horário para ver o Kwid" / "…ver a Strada". */
export function tituloDoExame(modelo: string, genero: Genero): string {
  return `Marque um horário para ver ${o(genero)} ${modelo}`;
}

/** "Prefere com garantia? Parecidos com este Kwid" / "…com esta Strada". */
export function tituloDosParecidos(modelo: string, genero: Genero): string {
  return `Prefere com garantia? Parecidos com ${concordar(genero, "este", "esta")} ${modelo}`;
}

/** Barra fixa do celular: "R$ 3.180 abaixo da FIPE". */
export function abaixoDaFipeNaBarra(valor: string): string {
  return `${valor} abaixo da FIPE`;
}

/** "1 / 28 · 4 fotos de defeitos" sobre a foto grande da galeria. */
export function contadorDaGaleria(atual: number, total: number, defeitos: number): string {
  const base = `${atual} / ${total}`;
  if (defeitos === 0) return base;
  return `${base} · ${defeitos} ${defeitos === 1 ? "foto de defeito" : "fotos de defeitos"}`;
}

export function rotuloDoDefeito(numero: number): string {
  return `DEFEITO ${numero}`;
}

export function textoAlternativoDaFoto(nome: string, numero: number): string {
  return `${nome}, foto ${numero}`;
}

export function tituloDaFichaNaBusca(nome: string): string {
  return `${nome} no repasse | Motors Store`;
}

// ---------------------------------------------------------------------------
// Sem carro aberto, e endereço que não abre carro
// ---------------------------------------------------------------------------

export const VAZIO_DO_REPASSE = {
  titulo: "Nenhum repasse aberto agora",
  lojista: "Se você é lojista, cadastre o CNPJ: o carro chega para você antes de entrar no site.",
  enquantoIsso: "ENQUANTO ISSO, O ESTOQUE COM GARANTIA",
  estoqueRotulo: "ENQUANTO ISSO",
  estoqueTitulo: "No estoque com garantia",
  verTodoOEstoque: "VER TODO O ESTOQUE",
} as const;

/** A data só entra quando houve venda na carência (decisão 8). */
export function textoDoVazio(ultimaSaida: string | null): string {
  return ultimaSaida
    ? `O repasse gira rápido, e o último carro saiu em ${ultimaSaida}. Entre na lista e receba o próximo no WhatsApp assim que ele abrir.`
    : "O repasse gira rápido. Entre na lista e receba o próximo no WhatsApp assim que ele abrir.";
}

export const NAO_ENCONTRADO_NO_REPASSE = {
  titulo: "Não encontramos este repasse",
  texto:
    "Este endereço não abre nenhum carro do repasse. Costuma ser link antigo, de um carro que já saiu, ou endereço incompleto.",
  textoDaAmostra: "Abaixo, uma amostra do estoque com garantia de hoje e a lista do repasse.",
  tituloNaBusca: "Repasse não encontrado | Motors Store",
  // Só o que a página mostra: a amostra do estoque e a lista. O lote pode
  // estar vazio, e "o que está aberto hoje" seria promessa sem objeto.
  descricaoNaBusca:
    "Este endereço não abre nenhum carro do repasse. Veja uma amostra do estoque com garantia e entre na lista para receber o próximo no WhatsApp.",
} as const;

// ---------------------------------------------------------------------------
// O que os formulários e a rota dizem quando algo não passa
// ---------------------------------------------------------------------------

/**
 * Toda mensagem de erro que a pessoa pode ler na lista e no exame. A rota de
 * leads devolve estas mesmas (Task 6), e o formulário só mostra texto que
 * esteja aqui (`mensagemDeErroDaRota`, Task 3): mensagem de servidor que não
 * é nossa vira a genérica.
 */
export const ERROS_DO_REPASSE = {
  canal: "Formulário do repasse desconhecido.",
  nome: "Escreva o seu nome.",
  whatsapp: "Informe um WhatsApp com DDD.",
  faixa: "Escolha quanto quer gastar.",
  carroceria: "Escolha os tipos de carro da lista.",
  cnpj: "Confira o CNPJ: os números não fecham.",
  loja: "Escreva o nome da loja e a cidade.",
  carro: "Não achamos este carro no repasse.",
  dia: "Escolha um dos dias oferecidos.",
  turno: "Escolha manhã ou tarde.",
  exameFechado: "Este carro não está aberto para exame agora.",
  conferencia: "Não deu para conferir o carro agora. Tente de novo em instantes.",
  lista: "Não deu para entrar na lista agora. Tente de novo em instantes.",
  generico: "Não conseguimos enviar agora. Tente de novo em instantes.",
} as const;
