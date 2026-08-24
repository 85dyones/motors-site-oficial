/**
 * O dia da operação financeira — a resposta a "o que precisa ser pago hoje?".
 *
 * Pedido da adm/financeira no briefing de 2026-08-21: o RevendaMais não tem
 * ferramenta facilitada para ver o que vence no dia, e os relatórios de lá
 * param no DRE mensal — "seria interessante termos uma ferramenta para
 * verificarmos os relatórios diários". Esta lib é a régua pura dessa tela:
 * recebe contas e movimentações, devolve o recorte de UMA data.
 *
 * Pura de propósito, como `estatisticasEstoque`: a rota busca, a lib decide,
 * o teste prova. Datas são comparadas como texto `YYYY-MM-DD` — o formato em
 * que `contas.data_vencimento` e `movimentacoes.data_movimentacao` chegam do
 * PostgREST — porque criar `Date` aqui reintroduziria o fuso que esse formato
 * existe para evitar.
 */

/** O recorte de `contas` que o resumo lê. `valor` chega string do PostgREST. */
export interface ContaResumivel {
  id: string;
  tipo: "pagar" | "receber";
  descricao: string;
  valor: number | string;
  data_vencimento: string;
  data_pagamento?: string | null;
  status: string;
  fornecedor?: string | null;
  cliente?: string | null;
  [extra: string]: unknown;
}

export interface MovimentacaoResumivel {
  tipo: "entrada" | "saida";
  valor: number | string;
  data_movimentacao: string;
  [extra: string]: unknown;
}

export interface TotaisDoDia {
  pagarHoje: number;
  pagarVencidas: number;
  receberHoje: number;
  pagoNoDia: number;
  recebidoNoDia: number;
  entradasNoDia: number;
  saidasNoDia: number;
  saldoDoDia: number;
}

export interface ResumoDoDia {
  data: string;
  pagarHoje: ContaResumivel[];
  pagarVencidas: ContaResumivel[];
  receberHoje: ContaResumivel[];
  liquidadasNoDia: ContaResumivel[];
  totais: TotaisDoDia;
}

/**
 * `valor` numérico venha como vier. PostgREST entrega NUMERIC como string;
 * o código do módulo já faz `parseFloat` em todo lugar — aqui centralizado
 * para o resumo nunca somar `NaN` (uma conta corrompida não pode zerar o
 * painel do dia inteiro).
 */
function valorDe(v: number | string): number {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Conta que ainda espera dinheiro. `parcial` conta como aberta — o que falta
 * pagar segue devido; `cancelado` e `pago` saem do radar do dia.
 */
function aberta(c: ContaResumivel): boolean {
  return c.status === "pendente" || c.status === "vencido" || c.status === "parcial";
}

/**
 * Data de referência no fuso da loja (Curitiba), como `YYYY-MM-DD`.
 *
 * `toISOString().split("T")[0]` — o idioma do resto do módulo — vira o dia
 * seguinte às 21h de Curitiba, e é exatamente à noite que a Sinthia fecha o
 * caixa. `en-CA` porque é o locale que formata como ISO.
 */
export function dataDeHoje(agora: Date = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * O recorte do dia. Ordenações são parte do contrato:
 *  - vencidas do mais antigo para o mais novo — a mais atrasada primeiro;
 *  - as do dia por valor decrescente — o pagamento grande não pode passar
 *    despercebido no fim da lista.
 */
export function resumoDoDia(
  contas: ContaResumivel[],
  movimentacoes: MovimentacaoResumivel[],
  data: string,
): ResumoDoDia {
  const porValorDesc = (a: ContaResumivel, b: ContaResumivel) =>
    valorDe(b.valor) - valorDe(a.valor);

  const pagarHoje = (contas ?? [])
    .filter((c) => c.tipo === "pagar" && aberta(c) && c.data_vencimento === data)
    .sort(porValorDesc);

  const pagarVencidas = (contas ?? [])
    .filter((c) => c.tipo === "pagar" && aberta(c) && c.data_vencimento < data)
    .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));

  const receberHoje = (contas ?? [])
    .filter((c) => c.tipo === "receber" && aberta(c) && c.data_vencimento === data)
    .sort(porValorDesc);

  const liquidadasNoDia = (contas ?? [])
    .filter((c) => c.status === "pago" && c.data_pagamento === data)
    .sort(porValorDesc);

  const soma = (lista: ContaResumivel[]) =>
    lista.reduce((acc, c) => acc + valorDe(c.valor), 0);

  const movsDoDia = (movimentacoes ?? []).filter((m) => m.data_movimentacao === data);
  const entradasNoDia = movsDoDia
    .filter((m) => m.tipo === "entrada")
    .reduce((acc, m) => acc + valorDe(m.valor), 0);
  const saidasNoDia = movsDoDia
    .filter((m) => m.tipo === "saida")
    .reduce((acc, m) => acc + valorDe(m.valor), 0);

  return {
    data,
    pagarHoje,
    pagarVencidas,
    receberHoje,
    liquidadasNoDia,
    totais: {
      pagarHoje: soma(pagarHoje),
      pagarVencidas: soma(pagarVencidas),
      receberHoje: soma(receberHoje),
      pagoNoDia: soma(liquidadasNoDia.filter((c) => c.tipo === "pagar")),
      recebidoNoDia: soma(liquidadasNoDia.filter((c) => c.tipo === "receber")),
      entradasNoDia,
      saidasNoDia,
      saldoDoDia: entradasNoDia - saidasNoDia,
    },
  };
}
