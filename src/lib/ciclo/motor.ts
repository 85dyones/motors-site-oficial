import { classificarJanela } from "./janela";

/**
 * O motor de gatilhos, do lado do texto — manual v1.1 §4, §7.2 e §7.3.
 *
 * A régua de QUEM recebe vive no banco (`montar_fila_de_gatilhos`), porque o
 * Pacote 3 exige que a frequência do §4.3 não dependa de workflow. O que vive
 * aqui é o OUTRO lado: o que a mensagem diz.
 *
 * Por que o texto nasce no site e não no nó do n8n — que é como os onze
 * eventos administrativos do `WEBHOOKS_N8N.md` funcionam:
 *
 *   1. O §7.2 manda cada mensagem carregar dado específico ("seu Onix branco,
 *      placa ABC-1234, está em 47 mil km"). Esse dado é o modelo de dados
 *      daqui — montar a frase onde ele mora evita um segundo lugar que precisa
 *      conhecer `plano_revisoes` e `leituras_odometro`.
 *   2. O vocabulário da marca é testável só aqui. "Caderneta" foi aposentado
 *      em 2026-08-14; num Code node do n8n ninguém o pegaria de volta.
 *   3. Recompra está bloqueada (regra 5). Uma frase que a mencione tem que
 *      falhar num teste, não numa revisão de código de outra ferramenta.
 *
 * Os três princípios do §7.2, que os testes cobram: dado específico, uma ação
 * por mensagem, e saída explícita em toda mensagem de rotina.
 */

/** Os gatilhos que o motor dispara hoje. Prioridade menor = atende primeiro. */
export const GATILHOS = {
  /** §4.2 nº 7. O mais importante operacionalmente — mantém a conformidade viva. */
  elegibilidade_em_risco: {
    prioridade: 10,
    rotulo: "Elegibilidade em risco",
    passos: 3,
    /** §4.3: o gatilho 7 é isento da janela de 21 dias, por texto do manual. */
    isentoDaJanela: true,
  },
  /** Transacional: a entrada no programa. Uma vez por veículo. */
  boas_vindas: {
    prioridade: 15,
    rotulo: "Boas-vindas pós-venda",
    passos: 1,
    isentoDaJanela: true,
  },
  /** Transacional: o carimbo virou procedência. Uma vez por revisão. */
  revisao_verificada: {
    prioridade: 25,
    rotulo: "Revisão verificada",
    passos: 1,
    isentoDaJanela: true,
  },
  /** §4.2 nº 1, cadência D−15 · D−3 · D+7 do §7.3. */
  revisao_programada: {
    prioridade: 60,
    rotulo: "Lembrete de revisão",
    passos: 3,
    isentoDaJanela: false,
  },
} as const;

export type Gatilho = keyof typeof GATILHOS;

export const GATILHOS_ATIVOS = Object.keys(GATILHOS) as Gatilho[];

/** Motivos de supressão que a fila devolve. Espelham o CASE da função SQL. */
export const MOTIVOS_DE_SUPRESSAO = [
  "domingo",
  "fora_do_horario",
  "sem_canal_consentido",
  "quarentena",
  "janela_de_21_dias",
  "colisao_prioridade",
] as const;

export type MotivoDeSupressao = (typeof MOTIVOS_DE_SUPRESSAO)[number];

export interface LinhaDaFila {
  evento_id: string | null;
  veiculo_vendido_id: string;
  cliente_id: string;
  nome: string;
  telefone_e164: string | null;
  email: string | null;
  placa: string;
  marca: string;
  modelo: string;
  ano_modelo: number | null;
  gatilho: Gatilho;
  prioridade: number;
  passo: number;
  canal: "whatsapp" | "email" | null;
  contexto: Record<string, any>;
  suprimido_por: MotivoDeSupressao | null;
}

// ---------------------------------------------------------------------------
// Formatação — pt-BR, sem depender de Intl com fuso (o servidor roda em UTC)
// ---------------------------------------------------------------------------

/** "2027-08-14" → "14/08". O ano só aparece quando não é o corrente. */
export function dataCurta(iso: string | null | undefined, hoje = new Date()): string {
  if (!iso) return "";
  const [ano, mes, dia] = String(iso).slice(0, 10).split("-");
  if (!ano || !mes || !dia) return "";
  return Number(ano) === hoje.getUTCFullYear() ? `${dia}/${mes}` : `${dia}/${mes}/${ano}`;
}

/** 47000 → "47.000 km". Nulo vira string vazia, nunca "null km". */
export function km(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return "";
  return `${Math.round(Number(valor)).toLocaleString("pt-BR")} km`;
}

/** "José Carlos da Silva" → "José". Vazio devolve "", nunca "undefined". */
export function primeiroNome(nome: string | null | undefined): string {
  return String(nome ?? "").trim().split(/\s+/)[0] ?? "";
}

/** "Chevrolet Onix 2021, placa ABC1D23" — o dado específico do §7.2. */
export function identificacaoDoVeiculo(l: LinhaDaFila): string {
  const partes = [l.marca, l.modelo].filter(Boolean).join(" ").trim();
  const ano = l.ano_modelo ? ` ${l.ano_modelo}` : "";
  return `${partes}${ano} (placa ${l.placa})`;
}

/**
 * A saída explícita do §7.2.
 *
 * ⚠️ Não existe palavra-chave automática. Quem desliga o canal é a equipe, no
 * painel, depois de ler a resposta — e é por isso que o texto promete
 * exatamente isso e nada mais. Prometer "responda SAIR" antes de existir quem
 * processe SAIR seria uma promessa que o sistema não cumpre.
 */
const SAIDA = "Se preferir não receber estes avisos, é só responder por aqui que a gente desliga.";

const juntar = (linhas: (string | null | undefined)[]) =>
  linhas.filter((l) => l !== null && l !== undefined && l !== "").join("\n\n");

// ---------------------------------------------------------------------------
// As mensagens
// ---------------------------------------------------------------------------

function boasVindas(l: LinhaDaFila): string {
  const c = l.contexto ?? {};
  const primeira = c.primeira_revisao ?? null;
  const garantia = c.garantia_meses
    ? `, com ${c.garantia_meses} meses de garantia estendida e revisões na nossa rede parceira`
    : "";

  return juntar([
    `Oi, ${primeiroNome(l.nome)}! Aqui é a Motors Store.`,
    `Seu ${identificacaoDoVeiculo(l)} entrou no *Motors Ciclo*${garantia}.`,
    c.km_na_venda
      ? `Já anotamos o KM de saída: *${km(c.km_na_venda)}*. É a primeira linha do diário de bordo do carro — o histórico que fica com ele e vira procedência na hora de trocar.`
      : null,
    primeira
      ? `A ${primeira.numero}ª revisão tem janela de ${dataCurta(primeira.janela_inicio)} a ${dataCurta(primeira.janela_fim)}${primeira.km_previsto ? `, por volta dos ${km(primeira.km_previsto)}` : ""}. A gente te avisa antes — você não precisa controlar isso.`
      : null,
    SAIDA,
  ]);
}

function revisaoProgramada(l: LinhaDaFila): string {
  const c = l.contexto ?? {};
  const n = c.numero_revisao ? `${c.numero_revisao}ª ` : "";
  const veiculo = identificacaoDoVeiculo(l);
  const fim = dataCurta(c.janela_fim);
  const dias = Number(c.dias_para_o_fim ?? 0);

  // Passo 3 (D+7): a janela já passou da data ideal e caminha para o fim.
  if (l.passo >= 3) {
    return juntar([
      `${primeiroNome(l.nome)}, a ${n}revisão do seu ${veiculo} ainda não entrou no diário de bordo.`,
      `A janela fecha em ${fim}${dias > 0 ? ` — faltam ${dias} dias` : ""}. Depois disso o período fica sem procedência registrada, e o histórico do carro perde esse trecho.`,
      "Quer que eu veja um horário na rede parceira?",
      SAIDA,
    ]);
  }

  // Passo 2 (D−3): uma frase, uma pergunta.
  if (l.passo === 2) {
    return juntar([
      `${primeiroNome(l.nome)}, a janela da ${n}revisão do seu ${veiculo} fecha em ${fim}${dias > 0 ? ` — faltam ${dias} dias` : ""}.`,
      "Quer que eu veja um horário na rede parceira?",
      SAIDA,
    ]);
  }

  // Passo 1 (D−15, ou antecipado pelo odômetro).
  const porKm =
    c.antecipado_por_km && c.km_estimado
      ? `Pelo seu ritmo de rodagem, o carro deve estar chegando nos ${km(c.km_previsto)} — hoje a estimativa é ${km(c.km_estimado)}.`
      : null;

  return juntar([
    `Oi, ${primeiroNome(l.nome)}! A ${n}revisão do seu ${veiculo} está chegando.`,
    `A janela vai de ${dataCurta(c.janela_inicio)} a ${fim}${c.km_previsto ? `, por volta dos ${km(c.km_previsto)}` : ""}.`,
    porKm,
    "Fazer dentro da janela é o que mantém o diário de bordo em dia — e é ele que sustenta a procedência do carro na hora de trocar.",
    "Quer que eu veja um horário na rede parceira?",
    SAIDA,
  ]);
}

function elegibilidadeEmRisco(l: LinhaDaFila): string {
  const c = l.contexto ?? {};
  const n = c.numero_revisao ? `${c.numero_revisao}ª ` : "";
  const veiculo = identificacaoDoVeiculo(l);
  const atraso = Number(c.dias_de_atraso ?? 0);

  // Passo 3 (D+21): o programa marca a elegibilidade como em risco (§7.3).
  if (l.passo >= 3) {
    return juntar([
      `${primeiroNome(l.nome)}, sem o registro da ${n}revisão a gente precisa marcar o seu ${veiculo} como *elegibilidade em risco* no Motors Ciclo — é o que o programa prevê quando a revisão passa da janela.`,
      "Isso não cancela nada e tem volta: assim que a revisão for verificada e entrar no diário de bordo, o status volta ao normal.",
      "Quer que eu veja um horário na rede parceira?",
      SAIDA,
    ]);
  }

  // Passo 2 (D+7): a ação é agendar.
  if (l.passo === 2) {
    return juntar([
      `${primeiroNome(l.nome)}, a ${n}revisão do seu ${veiculo} segue sem registro no diário de bordo — ${atraso} dias depois do fim da janela.`,
      "Quer que eu veja um horário na rede parceira para resolver esta semana?",
      SAIDA,
    ]);
  }

  // Passo 1 (imediato): a ação é mandar a foto, porque a revisão pode já ter
  // sido feita fora da rede — e nesse caso não há nada a agendar.
  return juntar([
    `${primeiroNome(l.nome)}, a janela da ${n}revisão do seu ${veiculo} fechou em ${dataCurta(c.janela_fim)}${atraso > 0 ? `, faz ${atraso} dias` : ""}, e o registro não chegou.`,
    "Enquanto ele não chega, esse período fica sem procedência no diário de bordo do carro — e é o diário que sustenta o valor dele na hora de trocar.",
    "Se você já fez a revisão, mande por aqui a foto da etiqueta de troca de óleo, com o KM legível, que a gente registra.",
    SAIDA,
  ]);
}

function revisaoVerificada(l: LinhaDaFila): string {
  const c = l.contexto ?? {};
  const n = c.numero_revisao ? `${c.numero_revisao}ª ` : "";
  const estadoDaJanela = classificarJanela(c.dentro_da_janela);

  return juntar([
    `Conferido, ${primeiroNome(l.nome)}!`,
    `A ${n}revisão do seu ${identificacaoDoVeiculo(l)}, feita em ${dataCurta(c.data_servico)}${c.km_registrado ? ` com ${km(c.km_registrado)}` : ""}, foi verificada pela nossa equipe e entrou no diário de bordo.`,
    estadoDaJanela === "fora"
      ? "Ela ficou fora da janela contratada, mas está registrada do mesmo jeito: o histórico do carro fica completo."
      : estadoDaJanela === "sem"
        ? "Não havia janela programada para casar com ela, e está registrada do mesmo jeito: o histórico do carro fica completo."
        : "Dentro da janela do programa.",
    "É procedência registrada — histórico que fica com o veículo e vale na hora de trocar.",
    SAIDA,
  ]);
}

/**
 * O texto que vai para o cliente, pronto para o Evolution.
 *
 * Recebe a linha como o banco devolveu. Se o gatilho for desconhecido — porque
 * alguém adicionou um no SQL e esqueceu daqui — estoura, em vez de mandar uma
 * mensagem vazia para um cliente real.
 */
export function mensagemDoGatilho(l: LinhaDaFila): string {
  switch (l.gatilho) {
    case "boas_vindas":
      return boasVindas(l);
    case "revisao_programada":
      return revisaoProgramada(l);
    case "elegibilidade_em_risco":
      return elegibilidadeEmRisco(l);
    case "revisao_verificada":
      return revisaoVerificada(l);
    default:
      throw new Error(`Gatilho sem mensagem definida: ${(l as LinhaDaFila).gatilho}`);
  }
}

// ---------------------------------------------------------------------------
// O outro lado do aviso de verificação: a fila da loja
// ---------------------------------------------------------------------------

export interface PendenteDeVerificacao {
  id: string;
  placa: string;
  cliente: string;
  data_servico: string;
  km_registrado: number | null;
  origem_registro: string;
  tem_etiqueta: boolean;
  dias_na_fila: number;
}

/**
 * O aviso interno. Lançamento sem carimbo não conta para a conformidade do
 * §1.4 — uma fila parada é o indicador do §5.7 travando em silêncio.
 *
 * Sem pendência, devolve `null`: bot que manda "nada a fazer" todo dia é bot
 * que a equipe silencia, e aí o dia em que importa também passa batido.
 */
export function mensagemDaFilaDeVerificacao(
  pendentes: PendenteDeVerificacao[],
  urlDaFila: string,
): string | null {
  if (pendentes.length === 0) return null;

  const maisAntiga = pendentes.reduce((a, b) => (a.dias_na_fila >= b.dias_na_fila ? a : b));
  const semEtiqueta = pendentes.filter((p) => !p.tem_etiqueta).length;

  return juntar([
    "🔧 *Fila de verificação — Motors Ciclo*",
    `${pendentes.length} ${pendentes.length === 1 ? "lançamento aguardando" : "lançamentos aguardando"} verificação no diário de bordo.`,
    `A mais antiga está há ${maisAntiga.dias_na_fila} ${maisAntiga.dias_na_fila === 1 ? "dia" : "dias"}: ${maisAntiga.placa} — ${maisAntiga.cliente}.`,
    semEtiqueta > 0
      ? `${semEtiqueta} ${semEtiqueta === 1 ? "está" : "estão"} sem a foto da etiqueta: precisa pedir ao cliente antes de carimbar.`
      : null,
    "Enquanto não é verificada, a revisão não conta para a conformidade do programa.",
    `Abrir a fila: ${urlDaFila}`,
  ]);
}
