/**
 * O aquecimento do lead: quanto ele está perto de comprar, e POR QUÊ.
 *
 * ---------------------------------------------------------------------------
 * De onde veio (2026-10-19)
 * ---------------------------------------------------------------------------
 * Pedido do dono: *"os leads só são passados para o vendedor quando estão
 * quentes na qualificação"*, a partir do manobrAI. Lá cada conversa ganha
 * fria, morna ou quente e um **Motivo** que explica a temperatura ("ofereceu
 * carro na troca"). Concorrentes (AutoSDR) usam um número de 0 a 100. Aqui
 * são as duas coisas: o número decide, a temperatura resume e os motivos
 * explicam — a régua do CLAUDE.md, *"o número precisa se explicar"*.
 *
 * ---------------------------------------------------------------------------
 * Quem decide o número é ESTE arquivo, não o modelo
 * ---------------------------------------------------------------------------
 * O modelo de linguagem lê a conversa e preenche a FICHA (carro, pagamento,
 * entrada, troca, prazo, visita) e os SINAIS (pediu humano, quer visitar,
 * desinteresse). Ele nunca devolve a nota. Pedir "dê uma nota de 0 a 100" a um
 * modelo produz um número que muda de humor entre duas chamadas iguais e que
 * ninguém consegue auditar; somar pesos fixos sobre fatos extraídos produz o
 * mesmo número para a mesma ficha, e cada ponto tem nome.
 *
 * Os pesos são DADO (`atendimento_config.pesos`), com os de fábrica abaixo
 * como semente e como rede quando a linha não é legível — o mesmo desenho de
 * `PARAMETROS_DE_FABRICA` no financiamento. Regra é dado, não código.
 */

export type Temperatura = "frio" | "morno" | "quente";

export const TEMPERATURAS: readonly Temperatura[] = ["frio", "morno", "quente"];

export const ROTULO_DA_TEMPERATURA: Record<Temperatura, string> = {
  frio: "Frio",
  morno: "Morno",
  quente: "Quente",
};

/** Os mesmos cortes de `leads.pagamento_pretendido` (CHECK do banco). */
export type PagamentoDaFicha = "a_vista" | "financiado" | "com_troca" | "consorcio";
export const PAGAMENTOS_DA_FICHA: readonly PagamentoDaFicha[] = ["a_vista", "financiado", "com_troca", "consorcio"];

/**
 * Quando o cliente pretende comprar. Quatro degraus, e não uma data: o
 * cliente diz "esse mês", "logo", "estou só olhando", e é isso que se anota.
 */
export type PrazoDaFicha = "imediato" | "este_mes" | "proximos_meses" | "sem_pressa";
export const PRAZOS_DA_FICHA: readonly PrazoDaFicha[] = ["imediato", "este_mes", "proximos_meses", "sem_pressa"];

export const ROTULO_DO_PRAZO: Record<PrazoDaFicha, string> = {
  imediato: "Imediato (até 15 dias)",
  este_mes: "Este mês",
  proximos_meses: "Nos próximos meses",
  sem_pressa: "Sem pressa / pesquisando",
};

export const ROTULO_DO_PAGAMENTO: Record<PagamentoDaFicha, string> = {
  a_vista: "À vista",
  financiado: "Financiado",
  com_troca: "Com troca",
  consorcio: "Consórcio",
};

/**
 * O que o cliente DISSE. Nada aqui é dedução: campo que o cliente não falou
 * fica nulo, e o prompt do agente manda registrar só o que foi dito — a mesma
 * régua do manobrAI ("registrar só o que o cliente disse").
 *
 * Os campos seguem o método de qualificação da loja (`metodoDeQualificacao.ts`,
 * 2026-10-20): Produto, Pagamento, Pessoa, Prazo e Passo.
 */
export interface FichaDoLead {
  /** Como o cliente disse que se chama (o nome do WhatsApp nem sempre é o dele). */
  nome: string | null;
  /** O carro, modelo ou categoria que ele procura, nas palavras dele. */
  interesse: string | null;
  /** O interesse é um carro identificado (do estoque, ou modelo + ano)? */
  interesse_especifico: boolean;
  /** Para que vai usar o carro ("família", "trabalho de aplicativo"). */
  uso: string | null;
  orcamento: string | null;
  pagamento: PagamentoDaFicha | null;
  /** "15 mil", ou "sem entrada" — a resposta conta, mesmo negativa. */
  entrada: string | null;
  /** A parcela que cabe ou em quantas vezes ("até 1.500", "48x"). */
  parcela: string | null;
  /** O carro que ele quer dar na troca, como descreveu — ou "sem troca". */
  troca: string | null;
  prazo: PrazoDaFicha | null;
  /** Quem decide junto, ou em nome de quem fica o carro ("com a esposa", "no nome do pai"). */
  decisor: string | null;
  /**
   * O que o cliente já mandou para a simulação, SEM os números ("CPF e data
   * de nascimento enviados") — o dado em si fica só na conversa (2026-10-20).
   */
  dados_da_simulacao: string | null;
  cidade: string | null;
  /** Quando combinou de vir à loja, como foi dito ("sábado de manhã"). */
  visita: string | null;
  /** A visita com dia marcado, "AAAA-MM-DD" — só quando o cliente confirmou o dia. */
  visita_data: string | null;
  /** A hora marcada, "HH:MM" — só quando o cliente confirmou a hora. */
  visita_hora: string | null;
}

/** O que a conversa mostra, além da ficha. Estado ATUAL, não histórico. */
export interface SinaisDaConversa {
  /** Pediu para falar com uma pessoa. Entrega na hora, com qualquer nota. */
  pediu_humano: boolean;
  /** Pediu ou aceitou visitar a loja ou fazer test-drive. */
  quer_visitar: boolean;
  /**
   * Pediu o que só o consultor resolve: desconto, valor final, avaliação da
   * troca, simulação ou aprovação de financiamento. O assistente não decide
   * nada disso (regra do dono em 05/09: "não vai discutir valores").
   */
  pediu_condicao: boolean;
  so_pesquisando: boolean;
  desinteresse: boolean;
  /** Pediu para não receber mais mensagens. Para tudo, e não volta sozinho. */
  optout: boolean;
  /**
   * Na última mensagem o cliente pediu algo que o assistente ainda está
   * atendendo — outro carro, fotos, uma dúvida (2026-10-20). Com ele ligado, a
   * entrega do lead PRONTO espera a conversa assentar: no teste do branch,
   * "13h. Me fala do hb20" marcou a visita e o lead foi passado no meio do
   * pedido do HB20.
   */
  assunto_em_aberto?: boolean;
  /**
   * Reclamação ou pós-venda (2026-10-21): o cliente reclama do atendimento,
   * de um carro, de alguém, ou já comprou e fala de documento, garantia,
   * defeito, parcela. O assistente faz a triagem em tom sério e marca quando
   * tem o essencial — ou quando o cliente se irrita. Entrega na hora, fora do
   * rodízio (*"assuma uma postura séria, receba o atendimento e transfira
   * direto pro atendente pós triagem"*, o dono).
   */
  pos_venda?: boolean;
}

export const FICHA_VAZIA: FichaDoLead = {
  nome: null,
  interesse: null,
  interesse_especifico: false,
  uso: null,
  orcamento: null,
  pagamento: null,
  entrada: null,
  parcela: null,
  troca: null,
  prazo: null,
  decisor: null,
  dados_da_simulacao: null,
  cidade: null,
  visita: null,
  visita_data: null,
  visita_hora: null,
};

/** "sem troca", "não tenho", "nenhum": o cliente respondeu que NÃO tem carro na troca. */
export function semCarroNaTroca(troca: string | null | undefined): boolean {
  return /^\s*(sem|n[aã]o|nenhum|nada)\b/i.test(troca ?? "");
}

export const SINAIS_NEUTROS: SinaisDaConversa = {
  pediu_humano: false,
  quer_visitar: false,
  pediu_condicao: false,
  so_pesquisando: false,
  desinteresse: false,
  optout: false,
  assunto_em_aberto: false,
  pos_venda: false,
};

/** Cada peso tem nome: é a chave que vira motivo na tela. */
export interface PesosDoAquecimento {
  interesse_especifico: number;
  interesse_generico: number;
  orcamento: number;
  pagamento: number;
  entrada: number;
  troca: number;
  prazo_imediato: number;
  prazo_este_mes: number;
  prazo_proximos_meses: number;
  prazo_sem_pressa: number;
  quer_visitar: number;
  visita_combinada: number;
  /** Dia E hora marcados (2026-10-20): o passo que o método persegue. */
  visita_agendada: number;
  parcela: number;
  decisor: number;
  pediu_condicao: number;
  engajamento: number;
  so_pesquisando: number;
  desinteresse: number;
}

/**
 * Os pesos de fábrica — ponto de partida DECLARADO, como os prazos do funil
 * em `docs/FUNIL_DE_VENDAS.md` §3. O dono ajusta na tela do assistente
 * depois de ver o primeiro mês de dados.
 *
 * A conta que eles fazem, para conferir de cabeça (limiares 35 e 65):
 *
 *   - "quero o Onix 2020" ............................................. 20 → frio
 *   - + "financiado, dou 15 mil de entrada" ........................... 35 → morno
 *   - + "tenho um Uno 2014 pra troca" + "quero resolver esse mês" ..... 60 → morno
 *   - + "posso passar aí sábado" ...................................... 85 → quente
 *   - + "sábado às 10h então" (dia e hora marcados) .................. 100 → quente
 *
 * Visita pesa mais que tudo porque é o sinal que o funil já trata como
 * compromisso (etapa protegida: avisa, nunca transfere). Troca pesa 10 porque
 * é o "Motivo" que o próprio manobrAI usa de exemplo: quem oferece o carro
 * dele está montando o negócio, não pesquisando.
 */
export const PESOS_DE_FABRICA: PesosDoAquecimento = {
  interesse_especifico: 20,
  interesse_generico: 10,
  orcamento: 10,
  pagamento: 10,
  entrada: 5,
  troca: 10,
  prazo_imediato: 25,
  prazo_este_mes: 15,
  prazo_proximos_meses: 5,
  prazo_sem_pressa: -10,
  quer_visitar: 25,
  visita_combinada: 10,
  visita_agendada: 15,
  parcela: 5,
  decisor: 5,
  pediu_condicao: 10,
  engajamento: 5,
  so_pesquisando: -15,
  desinteresse: -30,
};

export interface LimiaresDoAquecimento {
  /** A partir daqui o lead é morno. */
  morno: number;
  /** A partir daqui o lead é quente. */
  quente: number;
}

export const LIMIARES_DE_FABRICA: LimiaresDoAquecimento = { morno: 35, quente: 65 };

/** Mensagens do cliente a partir das quais a conversa conta como engajada. */
export const MENSAGENS_PARA_ENGAJAMENTO = 3;

export interface MotivoDoAquecimento {
  chave: keyof PesosDoAquecimento;
  pontos: number;
  texto: string;
}

export interface Aquecimento {
  /** 0 a 100. */
  pontos: number;
  temperatura: Temperatura;
  /** Do que mais somou para o que mais tirou. Zeros ficam de fora. */
  motivos: MotivoDoAquecimento[];
}

function aparar(texto: string | null, max = 60): string {
  const t = (texto ?? "").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Mistura os pesos lidos do banco sobre os de fábrica.
 *
 * Linha antiga sem um peso novo herda o de fábrica; valor que não é número
 * finito também (um `"20"` digitado vira 20, um `"abc"` não vira zero calado).
 */
export function pesosValidos(lidos: unknown): PesosDoAquecimento {
  const base: PesosDoAquecimento = { ...PESOS_DE_FABRICA };
  if (!lidos || typeof lidos !== "object") return base;
  for (const chave of Object.keys(base) as (keyof PesosDoAquecimento)[]) {
    const bruto = (lidos as Record<string, unknown>)[chave];
    if (bruto === null || bruto === undefined || bruto === "") continue;
    const v = Number(bruto);
    if (Number.isFinite(v)) base[chave] = Math.max(-100, Math.min(100, Math.round(v)));
  }
  return base;
}

/**
 * Limiares coerentes: 1 ≤ morno < quente ≤ 100. Fora disso, os de fábrica —
 * um "quente a partir de 0" entregaria todo lead na primeira mensagem, e um
 * morno acima do quente faria o morno não existir.
 */
export function limiaresValidos(morno: unknown, quente: unknown): LimiaresDoAquecimento {
  const m = Number(morno);
  const q = Number(quente);
  if (!Number.isInteger(m) || !Number.isInteger(q)) return { ...LIMIARES_DE_FABRICA };
  if (m < 1 || q > 100 || m >= q) return { ...LIMIARES_DE_FABRICA };
  return { morno: m, quente: q };
}

export function temperaturaDe(pontos: number, limiares: LimiaresDoAquecimento = LIMIARES_DE_FABRICA): Temperatura {
  if (pontos >= limiares.quente) return "quente";
  if (pontos >= limiares.morno) return "morno";
  return "frio";
}

/** A ordem das temperaturas, para comparar "a partir de morno". */
export function temperaturaAlcanca(atual: Temperatura, minima: Temperatura): boolean {
  return TEMPERATURAS.indexOf(atual) >= TEMPERATURAS.indexOf(minima);
}

/**
 * A nota, a temperatura e os motivos.
 *
 * Opt-out zera: quem pediu para parar não está "frio", está fora — e a nota
 * zero tira o lead de qualquer entrega ou cadência que leia só o número.
 */
export function calcularAquecimento(
  ficha: FichaDoLead,
  sinais: SinaisDaConversa,
  opcoes: {
    pesos?: PesosDoAquecimento;
    limiares?: LimiaresDoAquecimento;
    /** Quantas mensagens o cliente já mandou nesta conversa. */
    mensagensDoCliente?: number;
  } = {},
): Aquecimento {
  const pesos = opcoes.pesos ?? PESOS_DE_FABRICA;
  const limiares = opcoes.limiares ?? LIMIARES_DE_FABRICA;

  if (sinais.optout) {
    return { pontos: 0, temperatura: "frio", motivos: [] };
  }

  const motivos: MotivoDoAquecimento[] = [];
  const somar = (chave: keyof PesosDoAquecimento, texto: string) => {
    if (pesos[chave] !== 0) motivos.push({ chave, pontos: pesos[chave], texto });
  };

  if (ficha.interesse) {
    if (ficha.interesse_especifico) somar("interesse_especifico", `Carro definido: ${aparar(ficha.interesse)}`);
    else somar("interesse_generico", `Procura: ${aparar(ficha.interesse)}`);
  }
  if (ficha.orcamento) somar("orcamento", `Disse quanto quer gastar: ${aparar(ficha.orcamento, 40)}`);
  if (ficha.pagamento) somar("pagamento", `Forma de pagamento: ${ROTULO_DO_PAGAMENTO[ficha.pagamento]}`);
  if (ficha.entrada) somar("entrada", `Disse a entrada: ${aparar(ficha.entrada, 40)}`);
  if (ficha.parcela) somar("parcela", `Disse a parcela ou o prazo: ${aparar(ficha.parcela, 40)}`);
  // "Sem troca" é resposta, não oferta: não soma.
  if (ficha.troca && !semCarroNaTroca(ficha.troca)) somar("troca", `Ofereceu carro na troca: ${aparar(ficha.troca)}`);
  if (ficha.prazo) {
    const chave = `prazo_${ficha.prazo}` as keyof PesosDoAquecimento;
    somar(chave, `Prazo: ${ROTULO_DO_PRAZO[ficha.prazo]}`);
  }
  if (sinais.quer_visitar) somar("quer_visitar", "Quer visitar a loja ou fazer test-drive");
  if (ficha.visita) somar("visita_combinada", `Combinou a visita: ${aparar(ficha.visita, 40)}`);
  if (ficha.visita_data && ficha.visita_hora) {
    somar("visita_agendada", `Visita marcada: ${ficha.visita_data.slice(8, 10)}/${ficha.visita_data.slice(5, 7)} às ${ficha.visita_hora}`);
  }
  if (ficha.decisor) somar("decisor", `Disse quem decide: ${aparar(ficha.decisor, 40)}`);
  if (sinais.pediu_condicao) somar("pediu_condicao", "Pediu condição, desconto ou avaliação");
  if ((opcoes.mensagensDoCliente ?? 0) >= MENSAGENS_PARA_ENGAJAMENTO) {
    somar("engajamento", "Está conversando (3 mensagens ou mais)");
  }
  if (sinais.so_pesquisando) somar("so_pesquisando", "Disse que só está pesquisando");
  if (sinais.desinteresse) somar("desinteresse", "Mostrou desinteresse");

  const bruto = motivos.reduce((soma, m) => soma + m.pontos, 0);
  const pontos = Math.max(0, Math.min(100, bruto));
  motivos.sort((a, b) => b.pontos - a.pontos);
  return { pontos, temperatura: temperaturaDe(pontos, limiares), motivos };
}

/** O motivo que vai no card e no aviso: o que mais somou. */
export function motivoPrincipal(aquecimento: Pick<Aquecimento, "motivos">): string | null {
  const positivo = aquecimento.motivos.find((m) => m.pontos > 0);
  return positivo?.texto ?? null;
}

// ----------------------------------------------------------------------------
// A ficha que acumula
// ----------------------------------------------------------------------------

/**
 * A ficha nova por cima da anterior, campo a campo, e nunca apagando.
 *
 * O modelo recebe a ficha anterior e devolve a inteira, mas um modelo que
 * esquece um campo numa volta não pode apagar o que o cliente disse três
 * mensagens antes. Valor novo substitui (o cliente mudou de ideia: "na verdade
 * quero à vista"); nulo mantém o que havia.
 */
export function mesclarFicha(anterior: FichaDoLead, nova: Partial<FichaDoLead>): FichaDoLead {
  const resultado: FichaDoLead = { ...anterior };
  for (const chave of Object.keys(FICHA_VAZIA) as (keyof FichaDoLead)[]) {
    const v = nova[chave];
    if (chave === "interesse_especifico") {
      // Só vale junto com o interesse que o acompanha: um interesse novo traz o
      // próprio booleano; sem interesse novo, fica o que havia.
      if (typeof nova.interesse === "string" && nova.interesse.trim()) {
        resultado.interesse_especifico = nova.interesse_especifico === true;
      }
      continue;
    }
    if (v !== null && v !== undefined && !(typeof v === "string" && !v.trim())) {
      (resultado as unknown as Record<string, unknown>)[chave] = typeof v === "string" ? v.trim() : v;
    }
  }
  return resultado;
}

/**
 * Os sinais novos, com o opt-out grudado: quem pediu para parar uma vez não é
 * "desparado" porque a próxima volta do modelo deixou o campo falso. Só uma
 * pessoa da equipe retoma (botão no painel).
 */
export function mesclarSinais(anteriores: SinaisDaConversa, novos: SinaisDaConversa): SinaisDaConversa {
  return { ...novos, optout: anteriores.optout || novos.optout };
}

/**
 * CPF escrito na ficha vira "[CPF]": o número fica só na conversa, e a ficha
 * vai ao resumo, ao card e ao WhatsApp do vendedor (2026-10-20).
 */
export function semCpf(texto: string): string {
  return texto.replace(/\b\d{3}\.?\d{3}\.?\d{3}[-.\s]?\d{2}\b/g, "[CPF]");
}

function textoOuNulo(v: unknown, max = 160): string | null {
  if (typeof v !== "string") return null;
  const t = semCpf(v.trim().replace(/\s+/g, " "));
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

/**
 * A ficha lida de qualquer lugar — o JSON do modelo, a coluna `qualificacao`
 * do banco —, com cada campo no vocabulário fechado ou nulo.
 */
export function fichaValida(bruto: unknown): FichaDoLead {
  if (!bruto || typeof bruto !== "object") return { ...FICHA_VAZIA };
  const b = bruto as Record<string, unknown>;
  const pagamento = PAGAMENTOS_DA_FICHA.includes(b.pagamento as PagamentoDaFicha)
    ? (b.pagamento as PagamentoDaFicha)
    : null;
  const prazo = PRAZOS_DA_FICHA.includes(b.prazo as PrazoDaFicha) ? (b.prazo as PrazoDaFicha) : null;
  const interesse = textoOuNulo(b.interesse, 120);
  return {
    nome: textoOuNulo(b.nome, 60),
    interesse,
    interesse_especifico: Boolean(interesse) && b.interesse_especifico === true,
    uso: textoOuNulo(b.uso, 80),
    orcamento: textoOuNulo(b.orcamento, 80),
    pagamento,
    entrada: textoOuNulo(b.entrada, 80),
    parcela: textoOuNulo(b.parcela, 80),
    troca: textoOuNulo(b.troca, 120),
    prazo,
    decisor: textoOuNulo(b.decisor, 80),
    dados_da_simulacao: textoOuNulo(b.dados_da_simulacao, 80),
    cidade: textoOuNulo(b.cidade, 60),
    visita: textoOuNulo(b.visita, 80),
    visita_data: dataValida(b.visita_data),
    visita_hora: horaValida(b.visita_hora),
  };
}

/** "AAAA-MM-DD" de um dia que existe ("2026-02-30" não passa), ou nulo. */
function dataValida(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return null;
  const t = v.trim();
  const d = new Date(`${t}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t ? t : null;
}

/** "HH:MM" de 00:00 a 23:59 ("9:30" vira "09:30"), ou nulo. */
function horaValida(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(v.trim());
  if (!m || Number(m[1]) > 23) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export function sinaisValidos(bruto: unknown): SinaisDaConversa {
  if (!bruto || typeof bruto !== "object") return { ...SINAIS_NEUTROS };
  const b = bruto as Record<string, unknown>;
  return {
    pediu_humano: b.pediu_humano === true,
    quer_visitar: b.quer_visitar === true,
    pediu_condicao: b.pediu_condicao === true,
    so_pesquisando: b.so_pesquisando === true,
    desinteresse: b.desinteresse === true,
    optout: b.optout === true,
    assunto_em_aberto: b.assunto_em_aberto === true,
    pos_venda: b.pos_venda === true,
  };
}

// ----------------------------------------------------------------------------
// A entrega ao vendedor
// ----------------------------------------------------------------------------

/**
 * Por que o lead foi ao vendedor. `agendou` e `simulacao` (2026-10-20) são os
 * dois finais que o método de qualificação persegue: a visita com dia e hora,
 * ou os dados prontos para o consultor simular o financiamento.
 */
export type MotivoDaEntrega = "agendou" | "simulacao" | "quente" | "pediu_humano" | "pediu_condicao" | "pos_venda";

export const ROTULO_DO_MOTIVO_DA_ENTREGA: Record<MotivoDaEntrega, string> = {
  agendou: "Visita marcada com dia e hora",
  simulacao: "Pronto para simular o financiamento",
  quente: "Lead quente",
  pediu_humano: "Pediu para falar com um consultor",
  pediu_condicao: "Pediu o que só o consultor resolve",
  pos_venda: "Reclamação ou pós-venda",
};

export type DecisaoDeEntrega = { entregar: true; motivo: MotivoDaEntrega } | { entregar: false; motivo: null };

/**
 * Passa para o vendedor agora?
 *
 *   - **pediu humano**: sempre, com qualquer nota. Segurar quem pediu gente é
 *     o atendimento automático no seu pior.
 *   - **pediu condição** (desconto, valor final, avaliação da troca,
 *     aprovação de financiamento): sempre. O assistente não decide nada disso,
 *     e enrolar quem quer negociar esfria o lead mais quente.
 *   - **pronto** (2026-10-20): a visita marcada com dia e hora, ou os dados
 *     da simulação completos — o lead pronto para o comercial, com qualquer
 *     nota. Quem decide se está pronto é `prontidao` (`metodoDeQualificacao.ts`).
 *   - **temperatura**: a partir da mínima configurada (`avisar_a_partir`:
 *     quente por padrão; a loja pode escolher morno, como no manobrAI) —
 *     MENOS enquanto o assistente conduz (`conduzindo`, 2026-10-20). No teste
 *     do branch, o cliente disse "sábado", o assistente perguntou a hora, e a
 *     nota cruzou o quente na mesma volta: a entrega saiu antes da resposta
 *     (*"ele está acelerando etapas"*, o dono). Com o cliente respondendo, o
 *     assistente segue até a visita com hora ou a simulação; o lead quente
 *     que PARA de responder vai ao vendedor pela rodada (`ESPERA_DO_QUENTE_MS`).
 *
 *   - **pós-venda ou reclamação** (2026-10-21): sempre, antes de tudo — a
 *     triagem já foi feita na conversa, e quem reclama não pode esperar o
 *     roteiro de vendas.
 *
 * Opt-out nunca entrega: o cliente pediu para pararmos de escrever.
 */
export function decidirEntrega(
  aquecimento: Pick<Aquecimento, "temperatura">,
  sinais: SinaisDaConversa,
  avisarAPartir: Temperatura = "quente",
  pronto: "agendou" | "simulacao" | null = null,
  opcoes: { conduzindo?: boolean } = {},
): DecisaoDeEntrega {
  if (sinais.optout) return { entregar: false, motivo: null };
  if (sinais.pos_venda) return { entregar: true, motivo: "pos_venda" };
  if (sinais.pediu_humano) return { entregar: true, motivo: "pediu_humano" };
  // Pronto, mas com um pedido do cliente em andamento: o assistente termina o
  // assunto, e a entrega sai quando a conversa assentar (a rodada, depois de
  // ESPERA_DO_QUENTE_MS sem resposta).
  if (pronto && opcoes.conduzindo && sinais.assunto_em_aberto) return { entregar: false, motivo: null };
  if (pronto) return { entregar: true, motivo: pronto };
  if (sinais.pediu_condicao) return { entregar: true, motivo: "pediu_condicao" };
  if (!opcoes.conduzindo && temperaturaAlcanca(aquecimento.temperatura, avisarAPartir)) return { entregar: true, motivo: "quente" };
  return { entregar: false, motivo: null };
}
