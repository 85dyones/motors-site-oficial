/**
 * Controle de investidores — aportes e retiradas com o saldo "bem certinho".
 *
 * Briefing de 2026-08-21, pedido da adm/financeira: "controlar melhor o que
 * eles investem e o que fazem retirada... independente se a retirada é um
 * carro de repasse... precisa estar bem certinho os valores de entrada e
 * saída". As tabelas vivem em `20260821120000_financeiro_operacional.sql`;
 * aqui mora a régua pura que a rota e a tela consultam.
 *
 * A decisão que atravessa tudo: `valor` é sempre POSITIVO e o lado mora em
 * `tipo` ('aporte' | 'retirada') — o mesmo desenho dos contadores de
 * `conta_vencida` (WEBHOOKS_N8N.md). Saldo é derivado, nunca gravado:
 * número guardado dessincroniza; número calculado da lista, não.
 */

export const TIPOS_DE_MOVIMENTACAO = ["aporte", "retirada"] as const;
export type TipoDeMovimentacao = (typeof TIPOS_DE_MOVIMENTACAO)[number];

/** Espelho do CHECK do banco — os de `contas`, mais `veiculo` (repasse). */
export const FORMAS_DE_MOVIMENTACAO = [
  "dinheiro",
  "pix",
  "cartao_credito",
  "cartao_debito",
  "boleto",
  "transferencia",
  "cheque",
  "financiamento",
  "veiculo",
] as const;
export type FormaDeMovimentacao = (typeof FORMAS_DE_MOVIMENTACAO)[number];

export interface MovimentacaoValida {
  investidor_id: string;
  tipo: TipoDeMovimentacao;
  valor: number;
  descricao: string;
  data: string | null;
  forma_pagamento: FormaDeMovimentacao | null;
  veiculo_id: string | null;
  observacoes: string | null;
}

export type ResultadoDaValidacao =
  | { ok: true; movimentacao: MovimentacaoValida }
  | { ok: false; erro: string };

/**
 * Valida o corpo de um lançamento ANTES do banco — o CHECK de lá é a última
 * linha de defesa; esta é a que devolve erro legível para a tela.
 *
 * A regra que só existe aqui (o SQL não tem como): retirada ou aporte na
 * forma `veiculo` EXIGE `veiculo_id`. "A retirada é um carro de repasse" só
 * está "bem certinho" se disser QUAL carro — sem o código, a movimentação
 * não amarra no custo do veículo e o controle volta a ser a bagunça que o
 * briefing descreve.
 */
export function validarMovimentacao(bruto: {
  investidor_id?: unknown;
  tipo?: unknown;
  valor?: unknown;
  descricao?: unknown;
  data?: unknown;
  forma_pagamento?: unknown;
  veiculo_id?: unknown;
  observacoes?: unknown;
}): ResultadoDaValidacao {
  const investidorId = typeof bruto.investidor_id === "string" ? bruto.investidor_id.trim() : "";
  if (!investidorId) return { ok: false, erro: "Investidor é obrigatório" };

  const tipo = bruto.tipo;
  if (typeof tipo !== "string" || !(TIPOS_DE_MOVIMENTACAO as readonly string[]).includes(tipo)) {
    return { ok: false, erro: "Tipo deve ser 'aporte' ou 'retirada'" };
  }

  const valor =
    typeof bruto.valor === "number" ? bruto.valor : parseFloat(String(bruto.valor ?? ""));
  if (!Number.isFinite(valor) || valor <= 0) {
    return { ok: false, erro: "Valor deve ser um número maior que zero" };
  }

  const descricao = typeof bruto.descricao === "string" ? bruto.descricao.trim() : "";
  if (!descricao) return { ok: false, erro: "Descrição é obrigatória" };

  const forma = typeof bruto.forma_pagamento === "string" && bruto.forma_pagamento
    ? bruto.forma_pagamento
    : null;
  if (forma && !(FORMAS_DE_MOVIMENTACAO as readonly string[]).includes(forma)) {
    return { ok: false, erro: `Forma de pagamento desconhecida: ${forma}` };
  }

  const veiculoId = typeof bruto.veiculo_id === "string" && bruto.veiculo_id.trim()
    ? bruto.veiculo_id.trim()
    : null;
  if (forma === "veiculo" && !veiculoId) {
    return { ok: false, erro: "Movimentação em veículo exige informar qual veículo" };
  }

  const data = typeof bruto.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(bruto.data)
    ? bruto.data
    : null;

  return {
    ok: true,
    movimentacao: {
      investidor_id: investidorId,
      tipo: tipo as TipoDeMovimentacao,
      // Duas casas, como o NUMERIC(12,2) do banco — arredondar aqui evita
      // que a tela some 1000.005 e o banco guarde 1000.01.
      valor: Math.round(valor * 100) / 100,
      descricao,
      data,
      forma_pagamento: forma as FormaDeMovimentacao | null,
      veiculo_id: veiculoId,
      observacoes:
        typeof bruto.observacoes === "string" && bruto.observacoes.trim()
          ? bruto.observacoes.trim()
          : null,
    },
  };
}

/**
 * O mínimo que uma movimentação precisa ter para SOMAR. `investidor_id` não
 * entra: `saldoDasMovimentacoes` não agrupa nada, e exigi-lo obrigava a área
 * do investidor a selecionar uma coluna que a RLS já torna redundante (ali
 * toda linha é dele).
 */
export interface MovimentacaoSomavel {
  tipo: string;
  valor: number | string;
  [extra: string]: unknown;
}

/** O que `resumoDeInvestidores` precisa a mais: de quem é a movimentação. */
export interface MovimentacaoAgrupavel extends MovimentacaoSomavel {
  investidor_id: string;
}

export interface SaldoDoInvestidor {
  aportado: number;
  retirado: number;
  saldo: number;
  movimentacoes: number;
}

function valorDe(v: number | string): number {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Saldo em centavos por baixo: somar floats acumula 0.1 + 0.2 = 0.300000004,
 * e "bem certinho" foi o pedido literal — num extrato de investidor, um
 * centavo fantasma custa a confiança do painel inteiro.
 */
export function saldoDasMovimentacoes(movs: MovimentacaoSomavel[]): SaldoDoInvestidor {
  let aportadoCents = 0;
  let retiradoCents = 0;
  let total = 0;
  for (const m of movs ?? []) {
    const cents = Math.round(valorDe(m.valor) * 100);
    if (m.tipo === "aporte") aportadoCents += cents;
    else if (m.tipo === "retirada") retiradoCents += cents;
    else continue;
    total += 1;
  }
  return {
    aportado: aportadoCents / 100,
    retirado: retiradoCents / 100,
    saldo: (aportadoCents - retiradoCents) / 100,
    movimentacoes: total,
  };
}

export interface InvestidorResumivel {
  id: string;
  nome: string;
  ativo?: boolean;
  [extra: string]: unknown;
}

export type ResumoDeInvestidor = InvestidorResumivel & SaldoDoInvestidor;

/**
 * Um resumo por investidor + o consolidado. Investidor sem movimentação
 * aparece zerado — cadastrado é visível, senão o painel esconderia exatamente
 * o registro recém-criado que a pessoa procura.
 */
export function resumoDeInvestidores(
  investidores: InvestidorResumivel[],
  movs: MovimentacaoAgrupavel[],
): { investidores: ResumoDeInvestidor[]; consolidado: SaldoDoInvestidor } {
  const porInvestidor = new Map<string, MovimentacaoAgrupavel[]>();
  for (const m of movs ?? []) {
    const lista = porInvestidor.get(m.investidor_id) ?? [];
    lista.push(m);
    porInvestidor.set(m.investidor_id, lista);
  }

  const resumos = (investidores ?? []).map((inv) => ({
    ...inv,
    ...saldoDasMovimentacoes(porInvestidor.get(inv.id) ?? []),
  }));

  return {
    investidores: resumos,
    consolidado: saldoDasMovimentacoes(movs ?? []),
  };
}

/**
 * Em que pé está o acesso do investidor à área `/investidor`.
 *
 * O vínculo conta↔investidor não é feito à mão: `reivindicar_investidor()`
 * (20260821180000) casa os dois pelo e-mail no primeiro acesso, e só com
 * e-mail confirmado. Isso é ótimo para quem cadastra — ninguém digita UUID —
 * e péssimo para quem acompanha, porque o processo inteiro acontece longe da
 * tela: o financeiro cadastra, o admin cria a conta, e ninguém fica sabendo
 * se funcionou até o investidor reclamar que não entra.
 *
 * Daí os três estados. O que justifica a função é o terceiro:
 *
 *   `sem_email` — cadastro sem e-mail NUNCA vai vincular. Não é "ainda não
 *   entrou", é impossível: a reivindicação casa por e-mail, e não há por onde
 *   casar. Sem isto na tela, o cadastro fica parecendo pendente para sempre e
 *   a loja procura o defeito no lugar errado (na conta do Auth, no papel, na
 *   confirmação) em vez de no campo vazio que ela mesma deixou.
 *
 *   `aguardando` — e-mail preenchido, vínculo não feito. Falta a conta com
 *   papel `investidor` (A17) ou falta o primeiro login dela. As duas coisas
 *   são de outra pessoa, então a tela aponta o caminho e para por aí.
 *
 *   `com_acesso` — `perfil_id` preenchido: entrou, e vê o próprio extrato.
 *
 * Conceder a conta continua sendo poder do admin — a matriz de permissões
 * não muda por causa desta função. Ela só torna visível o que já era verdade.
 */
export type EstadoDeAcesso = "com_acesso" | "aguardando" | "sem_email";

export function estadoDeAcessoDoInvestidor(inv: {
  perfil_id?: unknown;
  email?: unknown;
  // O índice existe para o TypeScript aceitar um `ResumoDeInvestidor` inteiro
  // aqui: sem ele, um tipo só de campos opcionais vira "weak type" e a tela
  // teria que desmontar o objeto antes de perguntar.
  [extra: string]: unknown;
}): EstadoDeAcesso {
  if (typeof inv?.perfil_id === "string" && inv.perfil_id.trim()) return "com_acesso";
  if (typeof inv?.email === "string" && inv.email.trim()) return "aguardando";
  return "sem_email";
}

/** O rótulo curto que cabe no card, junto do porquê para o `title`. */
export const ACESSO_DO_INVESTIDOR: Record<EstadoDeAcesso, { rotulo: string; explicacao: string }> = {
  com_acesso: {
    rotulo: "acessa o painel",
    explicacao:
      "Já entrou pelo menos uma vez e vê o próprio extrato em /investidor. "
      + "A RLS garante que ele veja só as movimentações dele.",
  },
  aguardando: {
    rotulo: "aguardando acesso",
    explicacao:
      "O e-mail está no cadastro, mas o vínculo ainda não se fez. Falta o Admin criar a conta "
      + "com o papel 'investidor' (Usuários) usando ESTE mesmo e-mail — o vínculo acontece "
      + "sozinho no primeiro acesso, depois que ele confirmar o e-mail.",
  },
  sem_email: {
    rotulo: "sem e-mail — não vincula",
    explicacao:
      "Sem e-mail no cadastro não há como ligar a conta ao investidor: a vinculação casa os dois "
      + "pelo e-mail. Edite o cadastro e preencha o campo antes de pedir a conta ao Admin.",
  },
};
