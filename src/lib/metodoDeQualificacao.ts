import { semCarroNaTroca, type FichaDoLead } from "./aquecimento";
import { dentroDoExpediente } from "./cadencias";
import { HORARIO_DA_LOJA, horaParaLer } from "./horarioDaLoja";

/**
 * O método de qualificação da loja: os 5P (2026-10-20).
 *
 * ---------------------------------------------------------------------------
 * De onde veio
 * ---------------------------------------------------------------------------
 * Pedido do dono no teste do atendimento 2.0: *"o Ney precisa ser mais
 * incisivo no objetivo, nada de dizer que fica à disposição, qualifique os
 * leads usando uma ou várias metodologias como BANT ou CHAMP ou desenvolva uma
 * própria nossa... a meta é entregar o lead pronto para o comercial, com data
 * de agendamento e horário ou com dados para simulação"*.
 *
 * BANT (Budget, Authority, Need, Timing) e CHAMP (Challenges, Authority,
 * Money, Prioritization) nasceram para venda entre empresas; numa loja de
 * seminovos os quatro eixos são os mesmos, com nomes de balcão, e falta o que
 * os dois deixam implícito — o compromisso de um próximo passo. Daí os 5P:
 *
 *   - **Produto** (Need / Challenges): qual carro, e para que vai usar.
 *   - **Pagamento** (Budget / Money): à vista, financiado ou consórcio;
 *     entrada; carro na troca; a parcela que cabe.
 *   - **Pessoa** (Authority): como ele se chama, e quem decide junto (ou em
 *     nome de quem fica o carro — no financiamento, é quem vai à ficha).
 *   - **Prazo** (Timing / Prioritization): quando pretende comprar.
 *   - **Passo**: o compromisso. A visita ou o test-drive com DIA e HORA — ou,
 *     no financiamento, os dados para o consultor simular.
 *
 * O lead está **pronto para o comercial** quando chega a um dos dois finais
 * do Passo: a visita marcada (dia e hora confirmados, dentro do horário da
 * loja, nos próximos 30 dias) ou a simulação pronta (carro definido,
 * financiado, entrada e parcela ditas). Pronto, ele vai ao vendedor com
 * qualquer nota (`decidirEntrega`).
 *
 * Tudo aqui é puro: lê a ficha (o que o cliente DISSE) e o relógio.
 */

export type Pilar = "produto" | "pagamento" | "pessoa" | "prazo" | "passo";

export const PILARES: readonly { chave: Pilar; rotulo: string; descricao: string }[] = [
  { chave: "produto", rotulo: "Produto", descricao: "qual carro (modelo e ano) e para que vai usar" },
  { chave: "pagamento", rotulo: "Pagamento", descricao: "à vista, financiado ou consórcio; a entrada; se tem carro na troca; a parcela que cabe" },
  { chave: "pessoa", rotulo: "Pessoa", descricao: "como ele se chama e quem decide junto (ou em nome de quem fica o carro)" },
  { chave: "prazo", rotulo: "Prazo", descricao: "quando pretende comprar" },
  { chave: "passo", rotulo: "Passo", descricao: "a visita ou o test-drive com dia e hora — ou, no financiamento, os dados para a simulação" },
];

/** Até quantos dias à frente uma visita marcada conta como compromisso. */
export const DIAS_PARA_A_VISITA = 30;

/** Curitiba não tem horário de verão desde 2019: a visita é sempre em -03:00. */
const FUSO_DA_LOJA = "-03:00";

/** O instante da visita marcada, ou nulo sem dia E hora. */
export function momentoDaVisita(ficha: Pick<FichaDoLead, "visita_data" | "visita_hora">): Date | null {
  if (!ficha.visita_data || !ficha.visita_hora) return null;
  const d = new Date(`${ficha.visita_data}T${ficha.visita_hora}:00${FUSO_DA_LOJA}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "sábado, 24/10, às 10h" — como o cliente e o vendedor leem. */
export function rotuloDaVisita(ficha: Pick<FichaDoLead, "visita_data" | "visita_hora">): string | null {
  const momento = momentoDaVisita(ficha);
  if (!momento) return null;
  const dia = momento.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" });
  return `${dia}, ${ficha.visita_data!.slice(8, 10)}/${ficha.visita_data!.slice(5, 7)}, às ${horaParaLer(ficha.visita_hora!)}`;
}

/** "seg a sex, 8h30 às 18h30; sáb, 8h30 às 15h" — o horário em que dá para marcar. */
export function horarioParaVisita(): string {
  const nomes = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  return HORARIO_DA_LOJA.map((e) => {
    const dias = e.dias.length > 1 ? `${nomes[e.dias[0]]} a ${nomes[e.dias[e.dias.length - 1]]}` : nomes[e.dias[0]];
    return `${dias}, ${horaParaLer(e.abre)} às ${horaParaLer(e.fecha)}`;
  }).join("; ");
}

/**
 * Os próximos dias com a data por extenso — "terça 21/10 = 2026-10-21". O
 * modelo erra o dia do mês de "sábado que vem" com frequência; com a tabela
 * na frente, ele copia em vez de calcular.
 */
export function proximosDias(agora: Date, quantos = 8): string[] {
  const dias: string[] = [];
  for (let i = 0; i < quantos; i += 1) {
    const d = new Date(agora.getTime() + i * 24 * 3600 * 1000);
    const iso = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const semana = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" });
    dias.push(`${i === 0 ? "hoje, " : i === 1 ? "amanhã, " : ""}${semana} ${iso.slice(8, 10)}/${iso.slice(5, 7)} = ${iso}`);
  }
  return dias;
}

export interface Prontidao {
  /** Um dos dois finais do Passo, ou nulo. */
  pronto: "agendou" | "simulacao" | null;
  /** A visita anotada com dia e hora que NÃO vale, e por quê. */
  problemaDaVisita: string | null;
  /** O que falta, na ordem do método. */
  faltam: { pilar: Pilar; item: string }[];
  /** O próximo movimento do assistente, numa frase. */
  proximoMovimento: string;
}

/**
 * O lead está pronto para o comercial? E, se não, o que falta e qual é o
 * próximo movimento — que vai ao modelo no estado de cada resposta, para ele
 * conduzir em vez de esperar.
 */
export function prontidao(ficha: FichaDoLead, agora: Date, opcoes: { nomeNoWhatsApp?: string | null } = {}): Prontidao {
  const momento = momentoDaVisita(ficha);
  let problemaDaVisita: string | null = null;
  let agendada = false;
  if (momento) {
    const rotulo = rotuloDaVisita(ficha);
    if (momento.getTime() <= agora.getTime()) problemaDaVisita = `a visita anotada (${rotulo}) já passou`;
    else if (momento.getTime() > agora.getTime() + DIAS_PARA_A_VISITA * 24 * 3600 * 1000) {
      problemaDaVisita = `a visita anotada (${rotulo}) está a mais de ${DIAS_PARA_A_VISITA} dias`;
    } else if (!dentroDoExpediente(momento)) problemaDaVisita = `a visita anotada (${rotulo}) está fora do horário da loja`;
    else agendada = true;
  }

  const financiado = ficha.pagamento === "financiado";
  const faltaNaSimulacao: string[] = [];
  if (financiado) {
    if (!ficha.interesse_especifico) faltaNaSimulacao.push("o carro exato (modelo e ano)");
    if (!ficha.entrada) faltaNaSimulacao.push("a entrada (ou se é sem entrada)");
    if (!ficha.parcela) faltaNaSimulacao.push("a parcela que cabe ou em quantas vezes");
  }
  const simulacao = financiado && faltaNaSimulacao.length === 0;

  const faltam: Prontidao["faltam"] = [];
  if (!ficha.interesse) faltam.push({ pilar: "produto", item: "qual carro ele procura" });
  else if (!ficha.interesse_especifico) faltam.push({ pilar: "produto", item: "qual carro exatamente (modelo e ano)" });
  if (!ficha.pagamento) faltam.push({ pilar: "pagamento", item: "se paga à vista, financiado ou no consórcio" });
  if (financiado && !ficha.entrada) faltam.push({ pilar: "pagamento", item: "a entrada (ou se é sem entrada)" });
  if (financiado && !ficha.parcela) faltam.push({ pilar: "pagamento", item: "a parcela que cabe ou em quantas vezes" });
  if (!ficha.troca) faltam.push({ pilar: "pagamento", item: "se tem carro na troca (modelo, ano e km)" });
  if (!ficha.prazo) faltam.push({ pilar: "prazo", item: "quando pretende comprar" });
  if (!ficha.nome && !(opcoes.nomeNoWhatsApp ?? "").trim()) faltam.push({ pilar: "pessoa", item: "como ele se chama" });
  if (!ficha.decisor) faltam.push({ pilar: "pessoa", item: "quem decide junto (ou em nome de quem fica o carro)" });
  if (!agendada) faltam.push({ pilar: "passo", item: "o dia e a hora da visita ou do test-drive" });
  if (!ficha.uso) faltam.push({ pilar: "produto", item: "para que vai usar o carro" });

  const pronto = agendada ? "agendou" : simulacao ? "simulacao" : null;
  let proximoMovimento: string;
  if (pronto === "agendou") proximoMovimento = "a visita está marcada: confirme o dia e a hora com o cliente, sem nova pergunta de agendamento";
  else if (pronto === "simulacao") proximoMovimento = "os dados da simulação estão completos: confirme com o cliente que o consultor chama com a simulação";
  else if (problemaDaVisita) proximoMovimento = `${problemaDaVisita}: proponha outro dia e hora dentro do horário da loja`;
  else if (!ficha.interesse) proximoMovimento = "descobrir qual carro ele procura — ofereça opções do catálogo";
  else if (financiado) proximoMovimento = `deixar a simulação pronta: falta ${faltaNaSimulacao.join(", ")}`;
  else proximoMovimento = "marcar a visita ou o test-drive com dia e hora — proponha duas opções concretas dentro do horário da loja";

  return { pronto, problemaDaVisita, faltam, proximoMovimento };
}

/** As linhas do método no estado que vai ao modelo a cada resposta. */
export function metodoNoEstado(p: Prontidao): string[] {
  return [
    `Próximo movimento: ${p.proximoMovimento}.`,
    p.faltam.length > 0
      ? `Ainda falta saber (na ordem do método 5P): ${p.faltam.map((f) => `${f.item} [${PILARES.find((x) => x.chave === f.pilar)!.rotulo}]`).join("; ")}.`
      : "Os 5P estão completos.",
  ];
}

/** "Sem troca", "não tem" → "não tem"; o resto como o cliente disse. */
export function trocaParaLer(troca: string | null): string | null {
  if (!troca) return null;
  return semCarroNaTroca(troca) ? "não tem" : troca;
}
