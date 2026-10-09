/**
 * Gestão do lead — as regras que não dependem de React nem de banco.
 *
 * Especificação em `docs/design/gestao_do_lead/README.md`; contrato das rotas
 * em `docs/GESTAO_DO_LEAD.md`. O banco já existe (migração
 * `20260923150000_gestao_do_lead.sql`): `leads_interacoes`, o próximo passo em
 * `leads` e a função `registrar_interacao_do_lead`.
 *
 * O que mora aqui é o que a rota e a tela precisam responder IGUAL: se um
 * registro vale, quando um passo está atrasado, em que grupo da Lista do dia o
 * lead cai, e como uma linha do rastro se lê em português. A rota valida com
 * estas funções antes de chamar o banco; a tela usa as mesmas para habilitar o
 * botão. Duas réguas seriam a tela oferecendo o que o servidor recusa.
 *
 * Sem I/O e sem relógio escondido: todo "agora" entra por parâmetro, em
 * milissegundos (como em `lib/funil`), e todo dia e hora é contado no fuso da
 * loja, `America/Sao_Paulo`. O servidor roda em UTC: "hoje" calculado no fuso
 * da máquina viraria amanhã às 21h.
 */
import { ehTipoDeDesfecho, formatarPrazo, ROTULO_DO_DESFECHO } from "./funil";
import { normalizarRef } from "./leadsKanban";

// ---------------------------------------------------------------------------
// O vocabulário — as mesmas listas dos CHECKs do banco
// ---------------------------------------------------------------------------

/** `leads_interacoes_tipo_valido`. */
export const TIPOS_DE_INTERACAO = ["nota", "ligacao", "whatsapp", "visita"] as const;
export type TipoDeInteracao = (typeof TIPOS_DE_INTERACAO)[number];

/** `leads_interacoes_resultado_valido`. Só vale em ligação. */
export const RESULTADOS_DA_LIGACAO = ["atendeu", "nao_atendeu", "caixa_postal"] as const;
export type ResultadoDaLigacao = (typeof RESULTADOS_DA_LIGACAO)[number];

export const ROTULO_DA_INTERACAO: Record<TipoDeInteracao, string> = {
  nota: "Anotação",
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
  visita: "Visita à loja",
};

export const ROTULO_DO_RESULTADO: Record<ResultadoDaLigacao, string> = {
  atendeu: "Atendeu",
  nao_atendeu: "Não atendeu",
  caixa_postal: "Caixa postal",
};

/** `leads_faixa_entrada_valida`: o valor gravado e o que a tela mostra. */
export const FAIXAS_DE_ENTRADA = [
  { valor: "sem_entrada", rotulo: "Sem entrada" },
  { valor: "ate_5k", rotulo: "Até R$ 5 mil" },
  { valor: "de_5k_a_10k", rotulo: "R$ 5 a 10 mil" },
  { valor: "de_10k_a_20k", rotulo: "R$ 10 a 20 mil" },
  { valor: "acima_20k", rotulo: "Acima de R$ 20 mil" },
] as const;
export type FaixaDeEntrada = (typeof FAIXAS_DE_ENTRADA)[number]["valor"];

/**
 * `leads_pagamento_pretendido_valido`. As MESMAS chaves dos motivos de ganho,
 * para a caixa de ganho abrir com o motivo que casa já escolhido.
 */
export const PAGAMENTOS_PRETENDIDOS = [
  { valor: "a_vista", rotulo: "À vista" },
  { valor: "financiado", rotulo: "Financiado" },
  { valor: "com_troca", rotulo: "Com troca" },
  { valor: "consorcio", rotulo: "Consórcio" },
] as const;
export type PagamentoPretendido = (typeof PAGAMENTOS_PRETENDIDOS)[number]["valor"];

/**
 * A etapa de visita em `funil_etapas` (a "Visita agendada" do desenho). É a
 * chave que o banco semeou e que `ETAPAS_PADRAO` repete; o rótulo é do dono.
 */
export const ETAPA_DE_VISITA = "visita";

/** O que "Chegou na loja" grava. */
export const PASSO_DE_QUEM_CHEGOU = "Atender na loja";
export const TEXTO_DE_QUEM_CHEGOU = "Chegou na loja.";

const naLista = <T extends string>(lista: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (lista as readonly string[]).includes(v);

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

// ---------------------------------------------------------------------------
// O relógio da loja
// ---------------------------------------------------------------------------

export const FUSO_DA_LOJA = "America/Sao_Paulo";

const MINUTO = 60_000;
const DIA = 86_400_000;

const PARTES = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_DA_LOJA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** O dia e a hora que o relógio da parede da loja marca num instante. */
interface RelogioDaLoja {
  /** Dias corridos desde 1970-01-01, no calendário da loja. */
  dia: number;
  hora: number;
  minuto: number;
  /** A mesma leitura como se fosse UTC: serve para medir o deslocamento. */
  comoUtc: number;
}

function relogioDaLoja(ms: number): RelogioDaLoja {
  const p: Record<string, number> = {};
  for (const parte of PARTES.formatToParts(new Date(ms))) {
    if (parte.type !== "literal") p[parte.type] = Number(parte.value);
  }
  const meiaNoite = Date.UTC(p.year, p.month - 1, p.day);
  return {
    dia: Math.round(meiaNoite / DIA),
    hora: p.hour,
    minuto: p.minute,
    comoUtc: meiaNoite + p.hour * 3_600_000 + p.minute * MINUTO + p.second * 1000,
  };
}

/**
 * O instante em que o relógio da loja marca `hora:minuto` no dia `dia`.
 *
 * Duas passadas: o deslocamento do fuso é lido no palpite e conferido no
 * resultado. Hoje São Paulo é UTC-3 fixo, mas o horário de verão já foi e
 * voltou, e a conta não pode depender de ele continuar suspenso.
 */
function instanteNaLoja(dia: number, hora: number, minuto: number): number {
  const parede = dia * DIA + hora * 3_600_000 + minuto * MINUTO;
  const deslocamento = (ms: number) => relogioDaLoja(ms).comoUtc - Math.floor(ms / 1000) * 1000;
  const primeiro = parede - deslocamento(parede);
  return parede - deslocamento(primeiro);
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");
const horaDe = (r: RelogioDaLoja) => `${doisDigitos(r.hora)}:${doisDigitos(r.minuto)}`;

const DIAS_DA_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
/** 1970-01-01 foi quinta-feira. */
const diaDaSemana = (dia: number) => DIAS_DA_SEMANA[(((dia + 4) % 7) + 7) % 7];

function diaEMes(dia: number): string {
  const d = new Date(dia * DIA);
  return `${doisDigitos(d.getUTCDate())}/${doisDigitos(d.getUTCMonth() + 1)}`;
}

function lerInstante(v: string | null | undefined): number | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * O dia da loja, `AAAA-MM-DD`, a `deslocamento` dias de hoje. É o que os chips
 * "Hoje | Amanhã | Em 3 dias | Próx. semana" da tela produzem.
 */
export function diaNaLoja(agora: number, deslocamento = 0): string {
  return new Date((relogioDaLoja(agora).dia + deslocamento) * DIA).toISOString().slice(0, 10);
}

/**
 * `AAAA-MM-DD` + `HH:MM` no relógio da loja → o instante em ISO (UTC), pronto
 * para `proximo_passo_vence_em`. `null` quando dia ou hora não se leem.
 *
 * Existe para a tela não montar a data com o fuso do aparelho: o vendedor que
 * abre o painel num celular com o relógio em outro fuso marcaria "10:00" e
 * gravaria outra hora.
 */
export function instanteNoFusoDaLoja(dia: string, hora: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia ?? "");
  const h = /^(\d{1,2}):(\d{2})$/.exec(hora ?? "");
  if (!d || !h) return null;
  const meiaNoite = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]));
  const [horas, minutos] = [Number(h[1]), Number(h[2])];
  // `Date.UTC` aceita 31/02 e devolve março: a volta confere o que foi pedido.
  if (new Date(meiaNoite).toISOString().slice(0, 10) !== dia || horas > 23 || minutos > 59) return null;
  return new Date(instanteNaLoja(Math.round(meiaNoite / DIA), horas, minutos)).toISOString();
}

// ---------------------------------------------------------------------------
// O registro: vale ou não vale
// ---------------------------------------------------------------------------

/**
 * O lead está aberto? Fechado é o que tem desfecho (ganho, perdido ou
 * descartado): o gatilho do banco carimba `desfecho` quando a etapa é terminal.
 */
export function leadEstaAberto(lead: { desfecho?: string | null }): boolean {
  return !ehTipoDeDesfecho(lead.desfecho);
}

export type CodigoDaInteracao =
  | "tipo_invalido"
  | "resultado_invalido"
  | "interacao_vazia"
  | "proximo_passo_incompleto"
  | "data_invalida";

/** Os argumentos de `registrar_interacao_do_lead`, menos o `p_lead`. */
export interface ArgsDaInteracao {
  p_tipo: TipoDeInteracao;
  p_resultado: ResultadoDaLigacao | null;
  p_texto: string | null;
  p_passo: string | null;
  p_vence_em: string | null;
  /**
   * Só presente, e só `true`, no CONCLUIR sem passo novo: a função limpa o
   * passo do lead (20261009120000). Ausente nos outros casos de propósito, para
   * a chamada de seis argumentos continuar valendo antes daquela migração.
   */
  p_concluir_passo?: true;
}

export type DecisaoDeInteracao =
  | { ok: true; args: ArgsDaInteracao }
  | { ok: false; status: 400; codigo: CodigoDaInteracao; erro: string };

/** O corpo do POST de interação. Tudo `unknown`: vem de fora. */
export interface CorpoDaInteracao {
  tipo?: unknown;
  resultado?: unknown;
  texto?: unknown;
  proximo_passo?: unknown;
  proximo_passo_vence_em?: unknown;
  /** `true` quando o registro conclui o passo atual (o botão CONCLUIR). */
  concluir_passo?: unknown;
}

/** ISO com fuso explícito (`Z` ou `-03:00`). Sem fuso, o servidor leria em UTC. */
const ISO_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Este registro pode ir para `registrar_interacao_do_lead`?
 *
 * As regras são as do banco, na mesma ordem em que ele recusaria, para a rota
 * nunca mandar o que a função devolveria como erro cru:
 *
 *  1. tipo da lista (`leads_interacoes_tipo_valido`);
 *  2. resultado da lista, e só em ligação (`..._resultado_valido`,
 *     `..._resultado_so_em_ligacao`). Resultado em outro tipo é RECUSADO, e
 *     não descartado: descartar gravaria um registro diferente do pedido;
 *  3. o registro diz alguma coisa: texto, ou ligação com resultado
 *     (`..._diz_alguma_coisa`);
 *  4. próximo passo com texto E data, juntos (a função recusa meio passo).
 *
 * O próximo passo é OPCIONAL, com o lead aberto ou fechado (decisão do dono em
 * 2026-10-09). Até então, enquanto o lead estava aberto, todo registro tinha de
 * definir o próximo passo, e o comercial não conseguia anotar um atendimento
 * sem ter um passo combinado: *"nem sempre teremos o próximo passo, isso pode
 * inibir o comercial de usar o sistema"*. Sem passo, a função grava o registro,
 * reinicia o relógio da estagnação e mantém o passo que o lead já tinha —
 * menos no CONCLUIR (`concluir_passo: true`), em que o passo feito sai do lead.
 */
export function decidirInteracao(corpo: CorpoDaInteracao | null | undefined): DecisaoDeInteracao {
  const recusa = (codigo: CodigoDaInteracao, erro: string): DecisaoDeInteracao => ({
    ok: false,
    status: 400,
    codigo,
    erro,
  });
  const c = corpo ?? {};

  if (!naLista(TIPOS_DE_INTERACAO, c.tipo)) {
    return recusa("tipo_invalido", "Tipo de registro inválido. Use nota, ligacao, whatsapp ou visita.");
  }
  const tipo = c.tipo;

  const semResultado = c.resultado === undefined || c.resultado === null || c.resultado === "";
  if (!semResultado && !naLista(RESULTADOS_DA_LIGACAO, c.resultado)) {
    return recusa("resultado_invalido", "Resultado inválido. Use atendeu, nao_atendeu ou caixa_postal.");
  }
  if (!semResultado && tipo !== "ligacao") {
    return recusa("resultado_invalido", "Só a ligação tem resultado (atendeu, não atendeu, caixa postal).");
  }
  const resultado = semResultado ? null : (c.resultado as ResultadoDaLigacao);

  const oQueHouve = texto(c.texto);
  if (!oQueHouve && !(tipo === "ligacao" && resultado)) {
    return recusa(
      "interacao_vazia",
      tipo === "ligacao" ? "Marque se atendeu ou escreva o que aconteceu." : "Escreva o que aconteceu.",
    );
  }

  const passo = texto(c.proximo_passo);
  const semData =
    c.proximo_passo_vence_em === undefined || c.proximo_passo_vence_em === null || c.proximo_passo_vence_em === "";
  if (Boolean(passo) === semData) {
    return recusa("proximo_passo_incompleto", "O próximo passo precisa de texto e de data, juntos.");
  }

  let venceEm: string | null = null;
  if (!semData) {
    const bruto = c.proximo_passo_vence_em;
    const ms = typeof bruto === "string" && ISO_COM_FUSO.test(bruto.trim()) ? new Date(bruto.trim()).getTime() : NaN;
    if (!Number.isFinite(ms)) {
      return recusa(
        "data_invalida",
        "A data do próximo passo precisa vir em ISO com fuso, como 2026-10-04T10:00:00-03:00.",
      );
    }
    venceEm = new Date(ms).toISOString();
  }

  return {
    ok: true,
    args: {
      p_tipo: tipo,
      p_resultado: resultado,
      p_texto: oQueHouve || null,
      p_passo: passo || null,
      p_vence_em: venceEm,
      // Com passo novo, ele já substitui o concluído: o sinal não muda nada.
      ...(c.concluir_passo === true && !passo ? { p_concluir_passo: true as const } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// As sugestões de próximo passo, por etapa
// ---------------------------------------------------------------------------

/** Quando a sugestão vence: daqui a N minutos, ou numa hora cheia de hoje ou de amanhã. */
type PrazoDaSugestao = { daqui: number } | { dia: "hoje" | "amanha"; hora: number };

/**
 * As duas sugestões de cada etapa, como o desenho as escreveu. A chave é a de
 * `funil_etapas`; "Visita agendada" do desenho é a etapa `visita`.
 *
 * Etapa que o dono criou depois (o funil é editável) não tem sugestão: a caixa
 * do próximo passo abre vazia, e o vendedor escreve.
 */
const SUGESTOES_POR_ETAPA: Record<string, ReadonlyArray<{ texto: string; prazo: PrazoDaSugestao }>> = {
  novo: [
    { texto: "Primeiro contato pelo WhatsApp", prazo: { daqui: 15 } },
    { texto: "Ligar para qualificar", prazo: { daqui: 60 } },
  ],
  em_contato: [
    { texto: "Enviar proposta", prazo: { dia: "amanha", hora: 10 } },
    { texto: "Convidar para visita", prazo: { dia: "amanha", hora: 10 } },
  ],
  proposta: [
    { texto: "Cobrar retorno da proposta", prazo: { dia: "amanha", hora: 10 } },
    { texto: "Enviar simulação de financiamento", prazo: { dia: "hoje", hora: 17 } },
  ],
  visita: [
    { texto: "Confirmar visita", prazo: { dia: "amanha", hora: 9 } },
    { texto: "Avaliar carro na troca", prazo: { dia: "hoje", hora: 16 } },
  ],
  negociacao: [
    { texto: "Levar contraproposta ao gerente", prazo: { dia: "hoje", hora: 16 } },
    { texto: "Fechar pedido", prazo: { dia: "amanha", hora: 10 } },
  ],
};

/** As etapas que têm sugestão, para o documento e o teste conferirem o mapa. */
export const ETAPAS_COM_SUGESTAO = Object.keys(SUGESTOES_POR_ETAPA);

export interface SugestaoDePasso {
  texto: string;
  /** Como o botão escreve o prazo: "hoje +15 min", "amanhã 10:00". */
  quando: string;
  /** O instante, em ISO (UTC). É o que vai em `proximo_passo_vence_em`. */
  vence_em: string;
}

/**
 * As sugestões da etapa, com a data já calculada no relógio da loja.
 *
 * "hoje 17:00" pedido depois das 17h viraria um passo que já nasce atrasado.
 * Nesse caso a sugestão passa para o dia seguinte, na mesma hora, e o rótulo
 * diz "amanhã": o botão nunca promete um horário que já passou.
 */
export function sugestoesDeProximoPasso(etapa: string | null | undefined, agora: number = Date.now()): SugestaoDePasso[] {
  const modelos = SUGESTOES_POR_ETAPA[etapa ?? ""] ?? [];
  const hoje = relogioDaLoja(agora).dia;

  return modelos.map(({ texto: oQueFazer, prazo }) => {
    if ("daqui" in prazo) {
      return {
        texto: oQueFazer,
        quando: `hoje +${formatarPrazo(prazo.daqui)}`,
        vence_em: new Date(agora + prazo.daqui * MINUTO).toISOString(),
      };
    }
    let amanha = prazo.dia === "amanha";
    let vence = instanteNaLoja(hoje + (amanha ? 1 : 0), prazo.hora, 0);
    if (!amanha && vence <= agora) {
      amanha = true;
      vence = instanteNaLoja(hoje + 1, prazo.hora, 0);
    }
    return {
      texto: oQueFazer,
      quando: `${amanha ? "amanhã" : "hoje"} ${doisDigitos(prazo.hora)}:00`,
      vence_em: new Date(vence).toISOString(),
    };
  });
}

// ---------------------------------------------------------------------------
// O próximo passo no relógio: atrasado, hoje, próximo
// ---------------------------------------------------------------------------

export type SituacaoDoPasso = "atrasado" | "hoje" | "proximo";

/**
 * Por quanto tempo o passo que acabou de vencer ainda se lê como "Agora".
 *
 * "Chegou na loja" grava o passo "Atender na loja" vencendo no instante do
 * clique. Sem folga, um segundo depois ele já seria "atrasado" e o rótulo
 * "Agora" do desenho nunca apareceria. Dentro da folga o passo conta como de
 * hoje; depois dela, é atraso como qualquer outro.
 */
export const FOLGA_DO_AGORA_MS = 15 * MINUTO;

const noAgora = (vence: number, agora: number) => vence <= agora && agora - vence <= FOLGA_DO_AGORA_MS;

/**
 * Onde o passo está em relação a agora, no calendário da loja.
 *
 *   atrasado .. já venceu (passada a folga do "Agora")
 *   hoje ...... vence ainda hoje, ou acabou de vencer
 *   proximo ... vence de amanhã em diante
 *   null ...... não há data (ou ela não se lê)
 */
export function situacaoDoPasso(venceEm: string | null | undefined, agora: number = Date.now()): SituacaoDoPasso | null {
  const vence = lerInstante(venceEm);
  if (vence === null) return null;
  if (noAgora(vence, agora)) return "hoje";
  if (vence < agora) return "atrasado";
  return relogioDaLoja(vence).dia === relogioDaLoja(agora).dia ? "hoje" : "proximo";
}

/** Onde o rótulo aparece: no card do quadro ou na coluna de hora da Lista do dia. */
export type FormatoDoRotulo = "card" | "lista";

/**
 * O rótulo do passo, como o desenho escreve.
 *
 *   card ... "AGORA", "HOJE · 16:30", "ATRASADO · 5 D" (ou "3 H", "20 MIN"),
 *            "AMANHÃ · 09:00", "SÁB · 10:00", "12/10 · 10:00"
 *   lista .. "Agora", "16:30", "ontem 17:00", "5 d", "Amanhã 09:00",
 *            "Sáb 10:00", "12/10 10:00"
 *
 * Os dias de atraso são de CALENDÁRIO, no fuso da loja: o que venceu ontem às
 * 23h50 está "ontem", e não "20 min", dez minutos depois da meia-noite. Dia da
 * semana só até seis dias à frente; daí em diante, a data.
 */
export function rotuloDoPasso(
  venceEm: string | null | undefined,
  agora: number = Date.now(),
  formato: FormatoDoRotulo = "card",
): string | null {
  const vence = lerInstante(venceEm);
  if (vence === null) return null;
  const quando = relogioDaLoja(vence);
  const dias = quando.dia - relogioDaLoja(agora).dia;
  const hora = horaDe(quando);
  const noCard = formato === "card";

  if (noAgora(vence, agora)) return noCard ? "AGORA" : "Agora";

  if (vence < agora) {
    if (dias === 0) {
      if (!noCard) return hora;
      const minutos = Math.floor((agora - vence) / MINUTO);
      return minutos < 60 ? `ATRASADO · ${minutos} MIN` : `ATRASADO · ${Math.floor(minutos / 60)} H`;
    }
    if (noCard) return `ATRASADO · ${-dias} D`;
    return dias === -1 ? `ontem ${hora}` : `${-dias} d`;
  }

  if (dias === 0) return noCard ? `HOJE · ${hora}` : hora;
  const dia = dias === 1 ? "Amanhã" : dias <= 6 ? diaDaSemana(quando.dia) : diaEMes(quando.dia);
  return noCard ? `${dia.toUpperCase()} · ${hora}` : `${dia} ${hora}`;
}

// ---------------------------------------------------------------------------
// A Lista do dia
// ---------------------------------------------------------------------------

/** O mínimo que a Lista do dia precisa saber de um lead. */
export interface LeadDaLista {
  id?: string;
  proximo_passo?: string | null;
  proximo_passo_vence_em?: string | null;
  desfecho?: string | null;
}

export interface ListaDoDia<T> {
  atrasados: T[];
  hoje: T[];
  proximos: T[];
  /**
   * Quantos leads ABERTOS ficaram de fora por não terem próximo passo. A tela
   * pode dizer "N sem próximo passo": lead que some da lista sem aviso é o
   * lead que ninguém atende.
   */
  semPasso: number;
}

/**
 * Agrupa em Atrasados / Hoje / Próximos, cada grupo por data e hora de
 * vencimento, do mais antigo para o mais novo: o atraso maior no topo.
 *
 * Lead fechado não entra (nem na contagem de `semPasso`): negócio encerrado
 * não tem fila. Lead aberto sem passo, ou com passo sem data, fica fora dos
 * grupos e é contado.
 */
export function ordenarListaDoDia<T extends LeadDaLista>(leads: readonly T[], agora: number = Date.now()): ListaDoDia<T> {
  const lista: ListaDoDia<T> = { atrasados: [], hoje: [], proximos: [], semPasso: 0 };
  const grupo: Record<SituacaoDoPasso, T[]> = {
    atrasado: lista.atrasados,
    hoje: lista.hoje,
    proximo: lista.proximos,
  };

  for (const lead of leads) {
    if (!leadEstaAberto(lead)) continue;
    const situacao = texto(lead.proximo_passo) ? situacaoDoPasso(lead.proximo_passo_vence_em, agora) : null;
    if (situacao === null) lista.semPasso += 1;
    else grupo[situacao].push(lead);
  }

  const vence = (l: T) => lerInstante(l.proximo_passo_vence_em) ?? 0;
  const porVencimento = (a: T, b: T) => vence(a) - vence(b) || String(a.id ?? "").localeCompare(String(b.id ?? ""));
  lista.atrasados.sort(porVencimento);
  lista.hoje.sort(porVencimento);
  lista.proximos.sort(porVencimento);
  return lista;
}

// ---------------------------------------------------------------------------
// A última interação de cada lead (o card e a Lista do dia)
// ---------------------------------------------------------------------------

/** Uma linha de `leads_interacoes`. */
export interface InteracaoDoLead {
  id: string;
  lead_id?: string | null;
  tipo: string;
  resultado?: string | null;
  texto?: string | null;
  autor?: string | null;
  passo_texto?: string | null;
  passo_vence_em?: string | null;
  importada?: boolean | null;
  criado_em: string;
}

export interface UltimaInteracao {
  tipo: string;
  quando: string;
  /** O texto do registro; na ligação sem texto, o resultado por extenso. */
  texto: string | null;
  autor: string | null;
}

/** O texto que representa o registro: o escrito, ou o resultado da ligação. */
function textoDaInteracao(i: Pick<InteracaoDoLead, "texto" | "resultado">): string | null {
  const escrito = texto(i.texto);
  if (escrito) return escrito;
  return naLista(RESULTADOS_DA_LIGACAO, i.resultado) ? ROTULO_DO_RESULTADO[i.resultado] : null;
}

/**
 * A interação mais recente de cada lead, a partir de UMA leitura de
 * `leads_interacoes` para todos os leads da resposta.
 */
export function ultimaInteracaoPorLead(interacoes: readonly InteracaoDoLead[]): Map<string, UltimaInteracao> {
  const porLead = new Map<string, UltimaInteracao>();
  for (const i of interacoes) {
    if (!i.lead_id) continue;
    const atual = porLead.get(i.lead_id);
    if (atual && (lerInstante(atual.quando) ?? 0) >= (lerInstante(i.criado_em) ?? 0)) continue;
    porLead.set(i.lead_id, {
      tipo: i.tipo,
      quando: i.criado_em,
      texto: textoDaInteracao(i),
      autor: texto(i.autor) || null,
    });
  }
  return porLead;
}

// ---------------------------------------------------------------------------
// O histórico: os registros do vendedor e o rastro do sistema, numa linha só
// ---------------------------------------------------------------------------

/** Uma linha de `leads_eventos`. */
export interface EventoDoLead {
  id: string;
  tipo: string;
  de?: string | null;
  para?: string | null;
  autor?: string | null;
  automatico?: boolean | null;
  detalhe?: unknown;
  criado_em: string;
}

export interface ItemDoHistorico {
  /** `interacao:<uuid>` ou `evento:<uuid>`: único entre as duas tabelas. */
  id: string;
  /** `humana`: registro do vendedor. `sistema`: linha do rastro. */
  origem: "humana" | "sistema";
  /** O tipo gravado: da interação (`nota`...) ou do evento (`etapa`...). */
  tipo: string;
  /** O tipo por extenso, para o cabeçalho do item. */
  rotulo: string;
  /** Quem fez. "Sistema" quando foi o motor; `null` quando o banco não sabe. */
  autor: string | null;
  /** ISO, como o banco gravou. */
  quando: string;
  /** A frase do item, pronta para a tela. Nunca vazia. */
  texto: string;
  resultado?: ResultadoDaLigacao;
  proximoPasso?: { texto: string; vence_em: string | null };
  /** Registro trazido da anotação antiga (`leads.observacoes`). */
  importada?: true;
}

/** O que as frases precisam para trocar chave por nome. */
export interface ContextoDoHistorico {
  etapas?: ReadonlyArray<{ chave: string; rotulo: string }>;
  motivos?: ReadonlyArray<{ chave: string; rotulo: string }>;
}

const ROTULO_DO_EVENTO: Record<string, string> = {
  entrada: "Entrada",
  etapa: "Etapa",
  responsavel: "Responsável",
  transferencia: "Transferência automática",
  contato: "Contato",
  desfecho: "Desfecho",
  alerta: "Aviso",
  nota: "Anotação",
  etiqueta: "Etiquetas",
};

const ROTULO_DO_CANAL: Record<string, string> = {
  whatsapp: "WhatsApp",
  chatwoot: "Chatwoot",
  telefone: "telefone",
  ligacao: "telefone",
};

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
/** "R$ 55.000,00", com espaço comum no lugar do não separável. */
const emReais = (n: number) => reais.format(n).replace(/\s/g, " ");

const campos = (detalhe: unknown): Record<string, unknown> =>
  detalhe && typeof detalhe === "object" && !Array.isArray(detalhe) ? (detalhe as Record<string, unknown>) : {};

const textos = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];

/** "a", "a e b", "a, b e c". */
function enumerar(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/**
 * Uma linha do rastro, em português.
 *
 * Cada tipo do `leads_eventos_tipo_check` tem a sua frase, escrita a partir do
 * que QUEM GRAVA põe na linha (os gatilhos da 20260828120000, as funções
 * `registrar_contato_do_lead` e `registrar_etiquetas_do_lead`, o gatilho da
 * passagem do SDR, `montar_fila_do_funil` e o webhook do Chatwoot). Tipo que o
 * banco venha a aceitar depois cai na frase genérica do fim, nunca num JSON.
 *
 * A frase só afirma o que a linha prova. O `alerta` é gravado quando a fila é
 * RESERVADA, antes de o n8n entregar: a frase diz que o aviso foi gerado, e
 * não que a pessoa leu.
 */
function fraseDoEvento(e: EventoDoLead, contexto: ContextoDoHistorico): string {
  const d = campos(e.detalhe);
  const de = texto(e.de);
  const para = texto(e.para);
  const etapa = (chave: string) =>
    contexto.etapas?.find((x) => x.chave === chave)?.rotulo?.trim() || chave.replace(/_/g, " ");

  switch (e.tipo) {
    case "entrada": {
      const canal = texto(d.canal);
      const interesse = texto(d.interesse);
      const onde = para ? ` na etapa ${etapa(para)}` : "";
      const porOnde = canal ? `, pelo canal ${canal}` : "";
      return `Lead recebido${onde}${porOnde}.${interesse ? ` Interesse: ${interesse}.` : ""}`;
    }

    case "etapa":
      if (de && para) return `Movido de ${etapa(de)} para ${etapa(para)}.`;
      return para ? `Movido para ${etapa(para)}.` : "Etapa alterada.";

    case "responsavel": {
      const peloChatwoot = texto(d.origem) === "chatwoot" ? " Atribuição feita no Chatwoot." : "";
      if (!para) return `Ficou sem responsável${de ? ` (estava com ${de})` : ""}.${peloChatwoot}`;
      if (!de) return `Atribuído a ${para}.${peloChatwoot}`;
      return `Responsável trocado de ${de} para ${para}.${peloChatwoot}`;
    }

    case "transferencia":
      if (!para) return `Ficou sem responsável, por ação automática${de ? ` (estava com ${de})` : ""}.`;
      if (!de) return `Atribuído automaticamente a ${para}.`;
      return `Transferido automaticamente de ${de} para ${para}.`;

    case "contato": {
      const canal = texto(d.canal) || para;
      if (canal === "chatwoot") return "Respondeu ao cliente pelo Chatwoot.";
      const nome = ROTULO_DO_CANAL[canal] ?? canal;
      return nome ? `Contato com o cliente registrado pelo ${nome}.` : "Contato com o cliente registrado.";
    }

    case "desfecho": {
      if (!ehTipoDeDesfecho(para)) {
        const antes = ehTipoDeDesfecho(de) ? ` (estava como ${ROTULO_DO_DESFECHO[de]})` : "";
        return `Negócio reaberto${antes}.`;
      }
      const chave = texto(d.motivo);
      const motivo = chave ? contexto.motivos?.find((m) => m.chave === chave)?.rotulo?.trim() || chave.replace(/_/g, " ") : "";
      const valor = Number(d.valor);
      const nota = texto(d.nota);
      const partes = [
        `Fechado como ${ROTULO_DO_DESFECHO[para]}`,
        motivo ? `Motivo: ${motivo}` : "Sem motivo informado",
        ...(Number.isFinite(valor) && valor > 0 ? [`Valor: ${emReais(valor)}`] : []),
        ...(nota ? [`Observação: “${nota}”`] : []),
      ];
      return `${partes.join(". ")}.`;
    }

    case "alerta": {
      const aviso = texto(d.aviso);
      const minutos = Number(d.minutos_parado);
      const parado = Number.isFinite(minutos) && minutos > 0 ? formatarPrazo(minutos) : "";
      const onde = texto(d.etapa) ? ` em ${etapa(texto(d.etapa))}` : "";
      if (aviso === "transferencia") {
        const quem = para ? ` para ${para}` : "";
        const antes = de && de !== para ? ` (estava com ${de})` : "";
        return `Aviso de transferência gerado${quem}${antes}${parado ? `: ${parado} sem atendimento${onde}` : ""}.`;
      }
      if (aviso === "atribuicao") {
        return `Aviso de atribuição gerado${para ? ` para ${para}` : ""}${parado ? `: ${parado} sem responsável${onde}` : ""}.`;
      }
      return `Aviso de lead parado gerado${para ? ` para ${para}` : ""}${parado ? `: ${parado} sem atendimento${onde}` : ""}.`;
    }

    case "etiqueta": {
      if (texto(d.origem) === "passagem_do_sdr") {
        const motivos = textos(d.motivos).map((m) => (m === "parado" ? "lead parado" : m === "reaberto" ? "lead reaberto" : m));
        const origem = texto(d.responsavel_de);
        const destino = texto(d.responsavel_para);
        const passagem = destino ? ` ${origem ? `De ${origem} para` : "Para"} ${destino}.` : "";
        return `Passagem do SDR creditada como resgate${motivos.length ? ` (${enumerar(motivos)})` : ""}.${passagem}`;
      }
      const incluidas = textos(d.incluidas);
      const retiradas = textos(d.retiradas);
      const partes = [
        ...(incluidas.length ? [`incluiu ${enumerar(incluidas)}`] : []),
        ...(retiradas.length ? [`retirou ${enumerar(retiradas)}`] : []),
      ];
      if (partes.length) return `Etiquetas da conversa: ${partes.join("; ")}.`;
      return para ? `Etiquetas da conversa: ${para}.` : "Etiquetas da conversa alteradas.";
    }

    case "nota": {
      const escrito = texto(d.texto) || texto(d.nota) || para;
      return escrito || "Anotação do sistema.";
    }

    default: {
      const troca = de && para ? `: de ${de} para ${para}` : para ? `: ${para}` : "";
      return `Registro do tipo ${e.tipo || "desconhecido"}${troca}.`;
    }
  }
}

/** Um registro do vendedor como item do histórico. */
export function itemDaInteracao(i: InteracaoDoLead): ItemDoHistorico {
  const resultado = naLista(RESULTADOS_DA_LIGACAO, i.resultado) ? i.resultado : undefined;
  const passo = texto(i.passo_texto);
  const tipo = naLista(TIPOS_DE_INTERACAO, i.tipo) ? i.tipo : null;
  return {
    id: `interacao:${i.id}`,
    origem: "humana",
    tipo: i.tipo,
    rotulo: tipo ? ROTULO_DA_INTERACAO[tipo] : i.tipo,
    autor: texto(i.autor) || null,
    quando: i.criado_em,
    texto: textoDaInteracao(i) ?? "Registro sem texto.",
    ...(resultado ? { resultado } : {}),
    ...(passo ? { proximoPasso: { texto: passo, vence_em: i.passo_vence_em ?? null } } : {}),
    ...(i.importada === true ? { importada: true as const } : {}),
  };
}

/**
 * O histórico unificado, do mais novo para o mais antigo.
 *
 * Junta `leads_interacoes` (o que o vendedor registrou) com `leads_eventos`
 * (o que o sistema viu acontecer). Tudo o que vem do rastro é `sistema`, mesmo
 * quando um humano moveu o card: é o filtro "Interações | Sistema" da tela, e
 * ele separa o que alguém ESCREVEU do que o painel anotou sozinho.
 *
 * No empate de data, o registro do vendedor vem antes: é ele que explica o
 * movimento que o sistema anotou no mesmo instante.
 */
export function montarHistorico(
  interacoes: readonly InteracaoDoLead[] | null | undefined,
  eventos: readonly EventoDoLead[] | null | undefined,
  contexto: ContextoDoHistorico = {},
): ItemDoHistorico[] {
  const itens: ItemDoHistorico[] = (interacoes ?? []).map(itemDaInteracao);

  for (const e of eventos ?? []) {
    itens.push({
      id: `evento:${e.id}`,
      origem: "sistema",
      tipo: e.tipo,
      rotulo: ROTULO_DO_EVENTO[e.tipo] ?? "Sistema",
      autor: texto(e.autor) || (e.automatico ? "Sistema" : null),
      quando: e.criado_em,
      texto: fraseDoEvento(e, contexto),
    });
  }

  const instante = (i: ItemDoHistorico) => lerInstante(i.quando) ?? 0;
  return itens.sort(
    (a, b) =>
      instante(b) - instante(a) ||
      (a.origem === b.origem ? a.id.localeCompare(b.id) : a.origem === "humana" ? -1 : 1),
  );
}

// ---------------------------------------------------------------------------
// A busca única: nome, telefone ou referência
// ---------------------------------------------------------------------------

export type FiltroDaBusca =
  | { tipo: "ref"; ref: string }
  /**
   * Só dígitos: telefone. `refAlternativa` vem quando são exatamente oito
   * dígitos, que também formam uma referência válida ("41999990" tanto pode
   * ser o fim de um telefone quanto o começo de um `ag_uid`): a busca
   * procura pelos dois, em vez de escolher um e não achar.
   */
  | { tipo: "telefone"; digitos: string; refAlternativa?: string }
  /** `padrao` já vem pronto para `ilike`, com `%`, `_` e `*` do termo escapados. */
  | { tipo: "nome"; termo: string; padrao: string };

export const AVISO_DE_BUSCA_INVALIDA =
  "Busque por nome (ao menos 2 letras), telefone (ao menos 4 dígitos) ou referência de 8 caracteres.";

const SO_TELEFONE = /^[\d\s()+.-]+$/;

/**
 * O que foi digitado na busca única → o filtro, ou `null` se não dá para buscar.
 *
 *   1. Referência, quando `normalizarRef` a reconhece (o código solto, o
 *      "(Ref: 0DCB1CDC)", a mensagem inteira do cliente, o `ag_uid`).
 *   2. Telefone, quando só há dígitos e pontuação de telefone: os dígitos
 *      CONTIDOS no número gravado. O "55" da frente sai, porque há lead antigo
 *      gravado sem ele e os dígitos restantes estão contidos nas duas formas.
 *   3. Nome, no resto: contém, sem distinguir caixa.
 *
 * Termo curto demais devolve `null`: dois dígitos casariam com a loja inteira.
 */
export function filtroDaBusca(termo: string | null | undefined): FiltroDaBusca | null {
  const limpo = (termo ?? "").trim().replace(/\s+/g, " ");
  if (!limpo) return null;

  const ref = normalizarRef(limpo);

  if (SO_TELEFONE.test(limpo)) {
    let digitos = limpo.replace(/\D/g, "");
    if (digitos.startsWith("55") && digitos.length >= 12) digitos = digitos.slice(2);
    if (digitos.length < 4) return null;
    return ref && digitos.length === 8 ? { tipo: "telefone", digitos, refAlternativa: ref } : { tipo: "telefone", digitos };
  }

  if (ref) return { tipo: "ref", ref };
  if (limpo.length < 2) return null;
  // `*` entra na lista: o PostgREST o lê como apelido de `%` no `ilike`. Com a
  // barra ele deixa de ser curinga (vira um `%` literal no padrão): quem busca
  // "Jo*" não lista a loja inteira.
  return { tipo: "nome", termo: limpo, padrao: `%${limpo.replace(/[\\%_*]/g, "\\$&")}%` };
}

/**
 * A referência curta de um lead: os 8 primeiros do `ag_uid`, em caixa alta, ou
 * `null`. A mesma regra de `refCurta` (`lib/telemetry`), que é módulo de
 * navegador: só há referência quando o `ag_uid` começa com 8 hexadecimais e um
 * hífen.
 */
export function refDoLead(agUid: string | null | undefined): string | null {
  return typeof agUid === "string" && /^[0-9a-f]{8}-/i.test(agUid) ? agUid.slice(0, 8).toUpperCase() : null;
}

// ---------------------------------------------------------------------------
// Os dados do negócio
// ---------------------------------------------------------------------------

/** A lista FECHADA do que o PATCH de dados grava. Fora dela, recusa. */
export const CAMPOS_DOS_DADOS = [
  "carro_na_troca",
  "faixa_entrada",
  "pagamento_pretendido",
  "email",
  "veiculo_id",
] as const;
export type CampoDosDados = (typeof CAMPOS_DOS_DADOS)[number];

export type CodigoDosDados =
  | "sem_campos"
  | "campo_desconhecido"
  | "carro_na_troca_invalido"
  | "faixa_entrada_invalida"
  | "pagamento_pretendido_invalido"
  | "email_invalido"
  | "veiculo_invalido";

export type DecisaoDosDados =
  | { ok: true; campos: Partial<Record<CampoDosDados, string | number | null>> }
  | { ok: false; status: 400; codigo: CodigoDosDados; erro: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * O corpo do PATCH de dados → os campos a gravar.
 *
 * Só entra o que está em `CAMPOS_DOS_DADOS`; campo de fora é RECUSADO, e não
 * ignorado: a tela que mandasse `responsavel` por aqui receberia "ok" e
 * acharia que gravou. `null` e texto vazio limpam o campo.
 */
export function decidirDados(corpo: unknown): DecisaoDosDados {
  const recusa = (codigo: CodigoDosDados, erro: string): DecisaoDosDados => ({ ok: false, status: 400, codigo, erro });
  const c = campos(corpo);
  const pedidos = Object.keys(c).filter((k) => c[k] !== undefined);

  const estranhos = pedidos.filter((k) => !(CAMPOS_DOS_DADOS as readonly string[]).includes(k));
  if (estranhos.length > 0) {
    return recusa("campo_desconhecido", `Campo fora dos dados do negócio: ${estranhos.join(", ")}.`);
  }
  if (pedidos.length === 0) return recusa("sem_campos", "Nenhum dado para gravar.");

  const vazio = (v: unknown) => v === null || (typeof v === "string" && v.trim() === "");
  const gravar: Partial<Record<CampoDosDados, string | number | null>> = {};

  if (c.carro_na_troca !== undefined) {
    if (!vazio(c.carro_na_troca) && typeof c.carro_na_troca !== "string") {
      return recusa("carro_na_troca_invalido", "O carro na troca é um texto.");
    }
    gravar.carro_na_troca = texto(c.carro_na_troca) || null;
  }

  if (c.faixa_entrada !== undefined) {
    if (!vazio(c.faixa_entrada) && !FAIXAS_DE_ENTRADA.some((f) => f.valor === c.faixa_entrada)) {
      return recusa(
        "faixa_entrada_invalida",
        `Faixa de entrada inválida. Use ${FAIXAS_DE_ENTRADA.map((f) => f.valor).join(", ")}.`,
      );
    }
    gravar.faixa_entrada = vazio(c.faixa_entrada) ? null : (c.faixa_entrada as string);
  }

  if (c.pagamento_pretendido !== undefined) {
    if (!vazio(c.pagamento_pretendido) && !PAGAMENTOS_PRETENDIDOS.some((p) => p.valor === c.pagamento_pretendido)) {
      return recusa(
        "pagamento_pretendido_invalido",
        `Forma de pagamento inválida. Use ${PAGAMENTOS_PRETENDIDOS.map((p) => p.valor).join(", ")}.`,
      );
    }
    gravar.pagamento_pretendido = vazio(c.pagamento_pretendido) ? null : (c.pagamento_pretendido as string);
  }

  if (c.email !== undefined) {
    const email = texto(c.email);
    if (!vazio(c.email) && !EMAIL.test(email)) return recusa("email_invalido", "E-mail inválido.");
    gravar.email = email || null;
  }

  if (c.veiculo_id !== undefined) {
    if (vazio(c.veiculo_id)) {
      gravar.veiculo_id = null;
    } else {
      const id = typeof c.veiculo_id === "number" ? c.veiculo_id : typeof c.veiculo_id === "string" ? Number(c.veiculo_id.trim()) : NaN;
      if (!Number.isSafeInteger(id) || id <= 0) {
        return recusa("veiculo_invalido", "O veículo de interesse é o id de um carro do estoque.");
      }
      gravar.veiculo_id = id;
    }
  }

  return { ok: true, campos: gravar };
}
