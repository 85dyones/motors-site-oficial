/**
 * Fechamento de venda do Motors Ciclo — tela A19, manual v1.1 §3.
 *
 * O §0 do manual é categórico: "nenhuma venda é dada como concluída sem o
 * registro completo do par cliente-veículo. Um campo não preenchido hoje é um
 * gatilho perdido em 2029." E o §3.2 manda que a validação seja **bloqueante,
 * não aviso**.
 *
 * Este módulo é a régua, e vive num lugar só porque ela é aplicada em três:
 * no formulário (para o botão não habilitar), na rota (para requisição fora do
 * formulário não passar) e no banco, pela função `fechar_venda_ciclo` — que é
 * a autoridade final, porque é a única que roda em transação.
 *
 * As três precisam concordar. Os testes comparam esta lista com a da função
 * SQL justamente para que não derivem.
 */

/** Campos que o §3.1 lista como "venda não fecha sem". */
export const CAMPOS_OBRIGATORIOS_DA_VENDA = [
  "cpf_cnpj",
  "nome",
  "telefone_e164",
  // v1.1 §3.1: entrou porque é por ele que o cliente recebe o link mágico da
  // Caderneta. Sem e-mail, não há área do cliente — e a caderneta é a fonte
  // do dado de conformidade do §1.4.
  "email",
  "chassi",
  "placa",
  "marca",
  "modelo",
  "ano_fabricacao",
  "ano_modelo",
  "data_venda",
  "km_na_venda",
  "valor_venda",
  "consentimento_lgpd",
] as const;

/**
 * Campos do financiamento. Só exigidos quando há financiamento — mas então
 * todos, sem meio-termo.
 *
 * `taxa_mensal` é o que o §3.1 chama de "o campo que mais será omitido e o
 * mais valioso": sem ele não existe cálculo de saldo devedor (§5.1) e o equity
 * mining (§5.4) não sai do papel.
 */
export const CAMPOS_OBRIGATORIOS_DO_FINANCIAMENTO = [
  "instituicao",
  "valor_financiado",
  "taxa_mensal",
  "prazo_meses",
  "valor_parcela",
  "data_primeira_parcela",
] as const;

export type CampoDaVenda = (typeof CAMPOS_OBRIGATORIOS_DA_VENDA)[number];

export interface DadosDaVenda {
  cpf_cnpj?: string | null;
  nome?: string | null;
  telefone_e164?: string | null;
  email?: string | null;
  chassi?: string | null;
  placa?: string | null;
  marca?: string | null;
  modelo?: string | null;
  versao?: string | null;
  ano_fabricacao?: number | string | null;
  ano_modelo?: number | string | null;
  data_venda?: string | null;
  km_na_venda?: number | string | null;
  valor_venda?: number | string | null;
  custo_aquisicao?: number | string | null;
  vendedor?: string | null;
  estoque_id?: number | string | null;
  consentimento_lgpd?: boolean | null;
  consentimento_canais?: { whatsapp?: boolean; email?: boolean; sms?: boolean } | null;
  aderiu_ciclo?: boolean | null;
  financiamento?: {
    instituicao?: string | null;
    valor_financiado?: number | string | null;
    valor_entrada?: number | string | null;
    taxa_mensal?: number | string | null;
    prazo_meses?: number | string | null;
    valor_parcela?: number | string | null;
    data_primeira_parcela?: string | null;
  } | null;
}

export interface Problema {
  campo: string;
  mensagem: string;
}

/** Rótulo de cada campo, para a mensagem falar a língua de quem preenche. */
const ROTULO: Record<string, string> = {
  cpf_cnpj: "CPF ou CNPJ",
  nome: "Nome do cliente",
  telefone_e164: "Telefone",
  email: "E-mail",
  chassi: "Chassi",
  placa: "Placa",
  marca: "Marca",
  modelo: "Modelo",
  ano_fabricacao: "Ano de fabricação",
  ano_modelo: "Ano do modelo",
  data_venda: "Data da venda",
  km_na_venda: "KM de saída",
  valor_venda: "Valor da venda",
  consentimento_lgpd: "Consentimento LGPD",
  instituicao: "Banco ou financeira",
  valor_financiado: "Valor financiado",
  taxa_mensal: "Taxa mensal",
  prazo_meses: "Prazo em meses",
  valor_parcela: "Valor da parcela",
  data_primeira_parcela: "Data da primeira parcela",
};

const vazio = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Só os dígitos — CPF/CNPJ chega com ponto e traço do formulário. */
export function apenasDigitos(valor: string): string {
  return (valor ?? "").replace(/\D/g, "");
}

/**
 * O documento tem tamanho de CPF ou de CNPJ?
 *
 * Deliberadamente NÃO validamos dígito verificador: a loja fecha venda com o
 * documento que está no contrato, e recusar um documento válido por causa de
 * uma regra de formatação trava a venda no balcão — que é justamente o que o
 * §3.2 quer evitar ao pedir validação bloqueante só do que é essencial.
 */
export function documentoTemTamanhoValido(valor: string): boolean {
  const d = apenasDigitos(valor);
  return d.length === 11 || d.length === 14;
}

/** Telefone no formato que o WhatsApp e a Evolution esperam. */
export function telefoneEhE164(valor: string): boolean {
  return /^\+\d{12,15}$/.test((valor ?? "").trim());
}

export function emailEhPlausivel(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((valor ?? "").trim());
}

const numero = (v: unknown): number | null => {
  if (vazio(v)) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/**
 * Tudo que impede esta venda de ser fechada. Lista vazia = pode gravar.
 *
 * Devolve TODOS os problemas de uma vez, não o primeiro: quem está com o
 * cliente na frente precisa saber o que falta inteiro, não descobrir campo a
 * campo a cada tentativa.
 */
export function validarFechamentoDeVenda(dados: DadosDaVenda): Problema[] {
  const problemas: Problema[] = [];
  const falta = (campo: string, mensagem?: string) =>
    problemas.push({ campo, mensagem: mensagem ?? `${ROTULO[campo] ?? campo} é obrigatório.` });

  for (const campo of CAMPOS_OBRIGATORIOS_DA_VENDA) {
    const valor = (dados as Record<string, unknown>)[campo];
    if (campo === "consentimento_lgpd") {
      // Consentimento não é campo que se "preenche": ou foi dado, ou não foi.
      if (valor !== true) {
        falta(campo, "O consentimento LGPD precisa ser registrado no ato da venda.");
      }
      continue;
    }
    if (vazio(valor)) falta(campo);
  }

  if (!vazio(dados.cpf_cnpj) && !documentoTemTamanhoValido(String(dados.cpf_cnpj))) {
    falta("cpf_cnpj", "CPF precisa de 11 dígitos e CNPJ de 14.");
  }
  if (!vazio(dados.telefone_e164) && !telefoneEhE164(String(dados.telefone_e164))) {
    falta("telefone_e164", "Telefone no formato internacional, com o +55 na frente.");
  }
  if (!vazio(dados.email) && !emailEhPlausivel(String(dados.email))) {
    falta("email", "E-mail inválido — é por ele que o cliente entra na caderneta.");
  }

  const km = numero(dados.km_na_venda);
  if (km !== null && km < 0) {
    falta("km_na_venda", "KM de saída não pode ser negativo.");
  }
  const valor = numero(dados.valor_venda);
  if (valor !== null && valor <= 0) {
    falta("valor_venda", "Valor da venda precisa ser maior que zero.");
  }

  const fab = numero(dados.ano_fabricacao);
  const mod = numero(dados.ano_modelo);
  if (fab !== null && mod !== null && mod < fab) {
    falta("ano_modelo", "Ano do modelo não pode ser anterior ao de fabricação.");
  }

  // ---- financiamento: nenhum ou todos ----
  const f = dados.financiamento;
  const financiamentoIniciado =
    !!f && CAMPOS_OBRIGATORIOS_DO_FINANCIAMENTO.some((c) => !vazio((f as Record<string, unknown>)[c]));

  if (financiamentoIniciado) {
    for (const campo of CAMPOS_OBRIGATORIOS_DO_FINANCIAMENTO) {
      if (vazio((f as Record<string, unknown>)[campo])) {
        falta(
          campo,
          campo === "taxa_mensal"
            ? "Taxa mensal é obrigatória: sem ela não há cálculo de saldo devedor."
            : `${ROTULO[campo] ?? campo} é obrigatório quando há financiamento.`,
        );
      }
    }
    const taxa = numero(f?.taxa_mensal);
    if (taxa !== null && (taxa <= 0 || taxa >= 1)) {
      // 0.0175 = 1,75% a.m. Quem digita "1.75" quer dizer 175% ao mês.
      falta("taxa_mensal", "Taxa em decimal: 0,0175 para 1,75% ao mês.");
    }
    const prazo = numero(f?.prazo_meses);
    if (prazo !== null && prazo <= 0) {
      falta("prazo_meses", "Prazo precisa ser maior que zero.");
    }
  }

  return problemas;
}

export function vendaPodeSerFechada(dados: DadosDaVenda): boolean {
  return validarFechamentoDeVenda(dados).length === 0;
}

// ==========================================================
// Plano de revisões — manual v1.1 §1.5
// ==========================================================

/** 10.000 km ou 12 meses, o que ocorrer primeiro. */
export const INTERVALO_KM = 10000;
export const INTERVALO_MESES = 12;
/** Tolerância aplicada à régua que venceu. */
export const TOLERANCIA_DIAS = 30;
export const TOLERANCIA_KM = 1000;
/** O contrato do Ciclo é de 36 meses (§0) — três revisões por calendário. */
export const REVISOES_NO_CONTRATO = 3;

export interface RevisaoPrevista {
  numero_revisao: number;
  km_previsto: number;
  janela_inicio: string; // ISO date
  janela_fim: string;
}

function somarMeses(iso: string, meses: number): Date {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d;
}

function somarDias(data: Date, dias: number): Date {
  const d = new Date(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * O plano inteiro, gerado no fechamento da venda.
 *
 * O marco zero é a entrega, não a fabricação: `km_na_venda` é o KM de saída na
 * compra (v1.1 §5.2), e é ele o ponto de referência da primeira revisão — a
 * única que não tem etiqueta de óleo anterior contra a qual conferir.
 *
 * A data prevista aqui é a régua do calendário. Quem roda muito atinge o KM
 * antes, e o gatilho 1 (§4.2) dispara pelo que vier primeiro; a data é
 * reprojetada a cada revisão confirmada.
 */
export function planoDeRevisoes(
  dataVenda: string,
  kmNaVenda: number,
  quantidade: number = REVISOES_NO_CONTRATO,
): RevisaoPrevista[] {
  const plano: RevisaoPrevista[] = [];
  for (let n = 1; n <= quantidade; n++) {
    const prevista = somarMeses(dataVenda, n * INTERVALO_MESES);
    plano.push({
      numero_revisao: n,
      km_previsto: kmNaVenda + n * INTERVALO_KM,
      janela_inicio: iso(somarDias(prevista, -TOLERANCIA_DIAS)),
      janela_fim: iso(somarDias(prevista, TOLERANCIA_DIAS)),
    });
  }
  return plano;
}
