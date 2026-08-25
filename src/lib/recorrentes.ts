/**
 * O calendário das despesas recorrentes.
 *
 * ---------------------------------------------------------------------------
 * Por que isto virou lib
 * ---------------------------------------------------------------------------
 * `despesas_recorrentes.proxima_geracao` é a única coisa que faz uma despesa
 * fixa existir na prática: `/recorrentes/gerar` busca por
 * `.lte('proxima_geracao', hoje)`, e a coluna é `DATE` sem default. Uma linha
 * que nasce com `proxima_geracao` nulo fica `ativa = true`,
 * `aprovacao_status = 'aprovada'`, aparece na tela de recorrentes — e mês após
 * mês gera zero contas, porque **NULL nunca satisfaz `lte`**. Sem erro, sem
 * aviso, sem linha em lugar nenhum. É o pior formato de defeito que este
 * módulo pode ter: a tela diz que está tudo certo.
 *
 * Era o que acontecia com toda recorrente criada pelo check "Repete — é
 * despesa fixa" da `ContaForm`, que desde que `/admin/financeiro/recorrentes`
 * virou redirect é o único caminho para criar uma.
 *
 * O cálculo morava dentro do POST de `/api/financeiro/recorrentes`, e o
 * avanço de período dentro de `/recorrentes/gerar` — duas escadas de
 * frequência em dois arquivos, com um terceiro chamador que não tinha
 * nenhuma. Aqui é uma só, e é pura: dá para provar em teste, que é o que
 * faltava.
 *
 * ---------------------------------------------------------------------------
 * A decisão de fuso
 * ---------------------------------------------------------------------------
 * Datas aqui são texto `YYYY-MM-DD`, e as contas são feitas ao meio-dia UTC
 * de propósito — a mesma escolha que o resto do financeiro já faz ao ler
 * `data_vencimento`. Meia-noite local atravessa horário de verão e vira o dia
 * anterior; meio-dia não chega perto de nenhuma borda.
 */

/** As frequências que `despesas_recorrentes.frequencia` aceita. */
export const FREQUENCIAS = [
  "semanal",
  "quinzenal",
  "mensal",
  "bimestral",
  "trimestral",
  "semestral",
  "anual",
] as const;

export type Frequencia = (typeof FREQUENCIAS)[number];

/** Quantos dias/meses/anos cada frequência anda. */
const PASSO: Record<Frequencia, { dias?: number; meses?: number; anos?: number }> = {
  semanal: { dias: 7 },
  quinzenal: { dias: 15 },
  mensal: { meses: 1 },
  bimestral: { meses: 2 },
  trimestral: { meses: 3 },
  semestral: { meses: 6 },
  anual: { anos: 1 },
};

/** `YYYY-MM-DD` de um `Date`, pela leitura UTC — o par de `aoMeioDia`. */
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` → `Date` ao meio-dia UTC. */
function aoMeioDia(data: string): Date {
  return new Date(`${data}T12:00:00Z`);
}

/**
 * A data seguinte, andando um período da frequência.
 *
 * Frequência desconhecida cai em mensal: a coluna tem CHECK no banco, então
 * chegar aqui com outra coisa já é um estado que não deveria existir — e
 * mensal é a única resposta que mantém a despesa gerando enquanto alguém
 * descobre o porquê. Devolver a mesma data faria o gerador criar a mesma conta
 * todo dia; devolver nulo a congelaria de novo.
 */
export function avancarPeriodo(data: string, frequencia: string): string {
  const d = aoMeioDia(data);
  if (!Number.isFinite(d.getTime())) return data;

  const passo = PASSO[frequencia as Frequencia] ?? PASSO.mensal;

  if (passo.dias) d.setUTCDate(d.getUTCDate() + passo.dias);
  if (passo.meses) d.setUTCMonth(d.getUTCMonth() + passo.meses);
  if (passo.anos) d.setUTCFullYear(d.getUTCFullYear() + passo.anos);

  return iso(d);
}

/**
 * A primeira geração de uma recorrente cadastrada direto, sem parcela nenhuma
 * criada junto — o caso de `/api/financeiro/recorrentes`.
 *
 * É o dia do vencimento neste mês, ou no mês seguinte se ele já passou. O dia
 * já vencido pertence ao mês que acabou: gerar para trás criaria uma conta
 * nascida vencida, e ninguém pediu uma dívida retroativa ao marcar "repete".
 *
 * `hoje` entra por parâmetro para o teste poder fixar o calendário.
 */
export function primeiraGeracao(diaDoVencimento: number, hoje: Date = new Date()): string {
  const dia = Math.min(Math.max(Math.trunc(diaDoVencimento) || 1, 1), 31);
  const ano = hoje.getUTCFullYear();
  const mes = hoje.getUTCMonth();

  // `Date.UTC(ano, mes, 31)` em fevereiro escorrega para março — o que é o
  // comportamento certo aqui: dia 31 numa recorrente mensal significa "o
  // último dia possível", e o banco guarda `dia_vencimento` intacto de todo
  // jeito. O que não pode é a data sair inválida.
  const candidata = new Date(Date.UTC(ano, mes, dia, 12, 0, 0));
  const hojeUtc = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate(), 12, 0, 0));

  if (candidata.getTime() >= hojeUtc.getTime()) return iso(candidata);
  return iso(new Date(Date.UTC(ano, mes + 1, dia, 12, 0, 0)));
}

/**
 * A próxima geração de uma recorrente cujo primeiro vencimento JÁ virou conta
 * — o caso do check "Repete" da `ContaForm`, em `/api/financeiro/contas`.
 *
 * Ali a primeira parcela é criada como conta na mesma requisição. Se
 * `proxima_geracao` apontasse para essa mesma data, o gerador criaria uma
 * segunda conta idêntica no primeiro dia em que rodasse — a despesa cobrada
 * em dobro. A próxima é a do período SEGUINTE.
 */
export function geracaoAposParcela(dataDaParcela: string, frequencia: string): string {
  return avancarPeriodo(dataDaParcela, frequencia);
}
