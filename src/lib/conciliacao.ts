/**
 * O motor da conciliação bancária — casa extrato do banco × caixa do sistema.
 *
 * Pedido P4 do briefing de 2026-08-21. O que ela faz hoje no RevendaMais é
 * exatamente isto: pegar o extrato, achar cada lançamento no sistema, e ver o
 * que sobra dos dois lados.
 *
 * ---------------------------------------------------------------------------
 * A decisão que atravessa o arquivo: sobrar é o resultado, não a falha
 * ---------------------------------------------------------------------------
 * A tentação num motor de conciliação é maximizar o casamento — quanto mais
 * linhas casadas, melhor parece. É o oposto do que serve a operação. O valor
 * está justamente no que NÃO casa:
 *
 *   - linha no banco sem contraparte = dinheiro que saiu ou entrou e ninguém
 *     lançou (tarifa, juros, débito automático esquecido, PIX recebido);
 *   - lançamento no sistema sem linha no banco = pagamento registrado que
 *     nunca compensou, ou registrado na conta bancária errada.
 *
 * Casar por aproximação para "limpar a tela" esconde as duas coisas. Por isso
 * este motor casa só o que é **inequívoco**, e tudo que tem mais de um
 * candidato vira SUGESTÃO para uma pessoa confirmar — nunca casamento
 * automático.
 *
 * ---------------------------------------------------------------------------
 * As regras
 * ---------------------------------------------------------------------------
 * 1. **Valor exato**, em centavos. Conciliação com tolerância de valor não é
 *    conciliação — R$ 1.234,56 e R$ 1.234,65 são coisas diferentes, e um
 *    motor que os junta transforma erro de digitação em conta fechada.
 * 2. **Mesmo lado** (entrada com entrada, saída com saída).
 * 3. **Data com tolerância**, por padrão ±3 dias: o pagamento registrado na
 *    sexta compensa na segunda. É onde a folga é legítima, porque a data do
 *    sistema é a do ATO e a do banco é a da COMPENSAÇÃO.
 * 4. **Um para um.** Uma movimentação casa com no máximo uma linha do banco.
 * 5. Empate não é escolha: dois candidatos igualmente bons viram sugestão,
 *    ordenados pela distância de data.
 */

/** Uma linha do extrato, já lida do OFX e (talvez) já gravada. */
export interface LinhaDoBanco {
  /**
   * O FITID é único dentro do extrato de UMA conta. Dois bancos numeram cada
   * um a partir do seu próprio zero e colidem à vontade — por isso a conta
   * entra na identidade da linha, e não é opcional na prática: o índice único
   * da tabela é `(conta, fitid)` desde a migração `20260822130000`.
   */
  conta?: string;
  fitid: string;
  data: string;
  valor: number;
  tipo: "entrada" | "saida";
  descricao: string;
  [extra: string]: unknown;
}

/** Uma movimentação do caixa do sistema. */
export interface MovimentacaoDoCaixa {
  id: string;
  data_movimentacao: string;
  valor: number | string;
  tipo: "entrada" | "saida";
  descricao: string;
  [extra: string]: unknown;
}

export interface Casamento {
  /** Junto com o fitid, identifica a linha: é o par que o banco garante. */
  conta?: string;
  fitid: string;
  movimentacaoId: string;
  /** Distância em dias entre a data do banco e a do sistema. */
  distanciaEmDias: number;
}

export interface Sugestao {
  /** Junto com o fitid, identifica a linha: é o par que o banco garante. */
  conta?: string;
  fitid: string;
  /** Do mais provável (menor distância de data) para o menos. */
  candidatos: { movimentacaoId: string; distanciaEmDias: number }[];
}

export interface ResultadoDaConciliacao {
  /** Casados sem ambiguidade — candidato único dos dois lados. */
  casados: Casamento[];
  /** Mais de um candidato: quem decide é uma pessoa. */
  sugestoes: Sugestao[];
  /** No banco e não no sistema — tarifa, juros, débito que ninguém lançou. */
  soNoBanco: LinhaDoBanco[];
  /** No sistema e não no banco — registrado e não compensado. */
  soNoSistema: MovimentacaoDoCaixa[];
}

/** Centavos: comparar reais em float é como somar dinheiro em float. */
function cents(v: number | string): number {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/**
 * A identidade de uma linha do extrato — `(conta, fitid)`, nunca o fitid só.
 *
 * O FITID é único dentro do extrato de uma conta, não entre contas: dois
 * bancos numeram cada um a partir do seu zero, e `001` no Itaú e `001` no
 * Bradesco são transações diferentes. A migração `20260822130000` fez desse
 * par o índice único da tabela pela mesma razão. Chavear o motor pelo fitid
 * sozinho faz a linha de uma conta ser casada contra a movimentação de outra
 * e some com a segunda do relatório de "só no banco" — que é a razão de a
 * ferramenta existir.
 *
 * O separador é `\u0000` porque não ocorre em número de conta nem em FITID:
 * um separador que aparece no dado é um separador que se pode forjar.
 */
export function chaveDaLinha(linha: { conta?: unknown; fitid: string }): string {
  const conta = typeof linha.conta === "string" ? linha.conta : "";
  return `${conta}\u0000${linha.fitid}`;
}

/**
 * Distância em dias entre duas datas `YYYY-MM-DD`.
 *
 * Usa UTC de propósito: as duas datas são texto puro, sem hora, e construir
 * `Date` local traria horário de verão para dentro de uma conta que é só
 * diferença de calendário.
 */
export function distanciaEmDias(a: string, b: string): number {
  const dia = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const da = dia(a);
  const db = dia(b);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.round((da - db) / 86_400_000));
}

export interface OpcoesDaConciliacao {
  /**
   * Folga de data, em dias. Três por padrão: cobre o fim de semana, que é a
   * causa mais comum da diferença entre o dia do ato e o da compensação.
   * Zero é válido e significa "só no mesmo dia".
   */
  toleranciaEmDias?: number;
}

/**
 * Casa as duas listas.
 *
 * Determinística: a mesma entrada dá a mesma saída, sempre. Isso importa
 * porque a conciliação é reexecutada a cada importação, e um motor que muda de
 * ideia entre duas execuções destrói a confiança de quem fecha o mês.
 */
export function conciliar(
  linhas: LinhaDoBanco[],
  movimentacoes: MovimentacaoDoCaixa[],
  opcoes: OpcoesDaConciliacao = {},
): ResultadoDaConciliacao {
  const tolerancia = opcoes.toleranciaEmDias ?? 3;

  // Candidatos de cada linha: mesmo valor, mesmo lado, dentro da janela.
  const candidatosPorLinha = new Map<string, { movimentacaoId: string; distanciaEmDias: number }[]>();
  // E o espelho, para saber quantas linhas disputam a mesma movimentação.
  const linhasPorMovimentacao = new Map<string, string[]>();

  for (const linha of linhas) {
    const alvo = cents(linha.valor);
    const candidatos = movimentacoes
      .filter(
        (m) =>
          m.tipo === linha.tipo &&
          cents(m.valor) === alvo &&
          Number.isFinite(cents(m.valor)) &&
          distanciaEmDias(linha.data, m.data_movimentacao) <= tolerancia,
      )
      .map((m) => ({
        movimentacaoId: m.id,
        distanciaEmDias: distanciaEmDias(linha.data, m.data_movimentacao),
      }))
      // Mais perto primeiro; empate desempatado pelo id, para a saída ser
      // estável entre execuções.
      .sort(
        (a, b) =>
          a.distanciaEmDias - b.distanciaEmDias ||
          a.movimentacaoId.localeCompare(b.movimentacaoId),
      );

    candidatosPorLinha.set(chaveDaLinha(linha), candidatos);
    for (const c of candidatos) {
      const lista = linhasPorMovimentacao.get(c.movimentacaoId) ?? [];
      lista.push(chaveDaLinha(linha));
      linhasPorMovimentacao.set(c.movimentacaoId, lista);
    }
  }

  const casados: Casamento[] = [];
  const sugestoes: Sugestao[] = [];
  const movimentacaoUsada = new Set<string>();
  const linhaResolvida = new Set<string>();

  // Passo 1 — o par inequívoco: a linha tem UM candidato e esse candidato não
  // é disputado por nenhuma outra linha. Só aqui há casamento automático.
  for (const linha of linhas) {
    const candidatos = candidatosPorLinha.get(chaveDaLinha(linha)) ?? [];
    if (candidatos.length !== 1) continue;
    const unico = candidatos[0];
    if ((linhasPorMovimentacao.get(unico.movimentacaoId) ?? []).length !== 1) continue;

    casados.push({
      conta: linha.conta,
      fitid: linha.fitid,
      movimentacaoId: unico.movimentacaoId,
      distanciaEmDias: unico.distanciaEmDias,
    });
    movimentacaoUsada.add(unico.movimentacaoId);
    linhaResolvida.add(chaveDaLinha(linha));
  }

  // Passo 2 — o que sobrou com candidato vira SUGESTÃO. Deliberadamente não há
  // "melhor esforço" automático aqui: escolher sozinho entre dois pagamentos
  // do mesmo valor é onde um motor de conciliação erra caro e em silêncio.
  for (const linha of linhas) {
    if (linhaResolvida.has(chaveDaLinha(linha))) continue;
    const candidatos = (candidatosPorLinha.get(chaveDaLinha(linha)) ?? []).filter(
      (c) => !movimentacaoUsada.has(c.movimentacaoId),
    );
    if (candidatos.length === 0) continue;

    sugestoes.push({ conta: linha.conta, fitid: linha.fitid, candidatos });
    linhaResolvida.add(chaveDaLinha(linha));
  }

  const emSugestao = new Set(sugestoes.flatMap((s) => s.candidatos.map((c) => c.movimentacaoId)));

  return {
    casados,
    sugestoes,
    soNoBanco: linhas.filter((l) => !linhaResolvida.has(chaveDaLinha(l))),
    soNoSistema: movimentacoes.filter(
      (m) => !movimentacaoUsada.has(m.id) && !emSugestao.has(m.id),
    ),
  };
}

export interface ResumoDaConciliacao {
  linhasDoBanco: number;
  conciliadas: number;
  aConfirmar: number;
  soNoBanco: number;
  soNoSistema: number;
  /** Quanto de dinheiro está em linha do banco sem contraparte no sistema. */
  valorSoNoBanco: number;
  /** E o contrário — registrado aqui e ainda não visto pelo banco. */
  valorSoNoSistema: number;
}

/**
 * Os números do cabeçalho da tela. `valorSoNoBanco` é o mais importante da
 * lista: é o dinheiro que se moveu na conta e não existe no caixa do sistema.
 */
export function resumirConciliacao(r: ResultadoDaConciliacao): ResumoDaConciliacao {
  const soma = (vs: (number | string)[]) =>
    vs.reduce<number>((acc, v) => acc + (Number.isFinite(cents(v)) ? cents(v) : 0), 0) / 100;

  return {
    linhasDoBanco: r.casados.length + r.sugestoes.length + r.soNoBanco.length,
    conciliadas: r.casados.length,
    aConfirmar: r.sugestoes.length,
    soNoBanco: r.soNoBanco.length,
    soNoSistema: r.soNoSistema.length,
    valorSoNoBanco: soma(r.soNoBanco.map((l) => l.valor)),
    valorSoNoSistema: soma(r.soNoSistema.map((m) => m.valor)),
  };
}
