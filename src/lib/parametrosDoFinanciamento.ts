/**
 * As condições do simulador como DADO — a linha vigente de
 * `parametros_financiamento` (migração 20260928120000), e a régua do
 * formulário que abre uma vigência nova no painel (/admin/financiamento).
 *
 * Pedido do dono em 28/09/2026: "sim, gostaria muito de ter isso disponível"
 * — as taxas saem do código para uma tabela com vigência. Junto vieram o ano
 * mais antigo que os bancos parceiros financiam (2009) e a lista desses
 * bancos, que o texto de crédito nomeia.
 *
 * Este arquivo é puro — sem banco, sem Next — porque três lados o usam: o
 * servidor que lê a linha (`parametrosDoFinanciamento-servidor.ts`), a rota
 * que grava a vigência nova e o formulário do painel, que valida antes de
 * mandar. As regras aqui são as MESMAS dos CHECKs da migração: o formulário
 * recusa com texto legível o que o banco recusaria com código de erro.
 */
import type { ParametrosDoFinanciamento } from "./finance-calculator";
import { perfisDe, podeFazer } from "./permissoes";

/**
 * A linha da matriz A17 que governa esta tela: Administrador e Financeiro
 * fazem, o resto não vê ("Trava de conformidade"). A função do banco
 * (`financiamento_nova_vigencia`) cobra a mesma régua pelo papel.
 */
export const ACAO_DO_FINANCIAMENTO = "Editar texto legal e condições de financiamento";

/** Quem abre /admin/financiamento e grava vigência nova. */
export function podeEditarFinanciamento(
  origem: Parameters<typeof perfisDe>[0],
): boolean {
  const perfis = perfisDe(origem);
  return perfis.length > 0 && podeFazer(perfis, ACAO_DO_FINANCIAMENTO) === "faz";
}

/** Os limites dos CHECKs de `parametros_financiamento` — um lugar só para tela e rota. */
export const LIMITES_DO_FINANCIAMENTO = {
  /** % ao mês: acima de zero e até 10. */
  taxaMaxima: 10,
  anoDeReferenciaMin: 2020,
  anoDeReferenciaMax: 2100,
  anoMaisAntigoMin: 1950,
  bancosMax: 30,
  fonteMax: 200,
  descricaoMax: 1000,
} as const;

/** Algarismos, com vírgula ou ponto decimal — nada de "0x1", "1e0" nem sinal. */
const DECIMAL = /^\s*\d+(?:[.,]\d+)?\s*$/;

/** Número, de número ou de texto — "1,95" e "1.95" valem o mesmo: o formulário é em português. */
const numero = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && DECIMAL.test(v)) return Number(v.trim().replace(",", "."));
  return null;
};

/** Trim, sem vazio e sem repetido, na ordem em que vieram. */
export function normalizarBancos(bancos: readonly unknown[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const b of bancos) {
    if (typeof b !== "string") continue;
    const nome = b.trim().replace(/\s+/g, " ");
    if (!nome || vistos.has(nome.toLocaleLowerCase("pt-BR"))) continue;
    vistos.add(nome.toLocaleLowerCase("pt-BR"));
    saida.push(nome);
  }
  return saida;
}

/** O que o formulário do painel manda — as taxas em % ao mês, como a tela mostra. */
export interface VigenciaNova {
  taxaExcelenteAm: number;
  taxaRegularAm: number;
  taxaRiscoAm: number;
  anoDeReferencia: number;
  anoMaisAntigo: number;
  bancosParceiros: string[];
  fonteDasTaxas: string;
  descricao: string | null;
}

export type ResultadoDaValidacao =
  | { ok: true; valores: VigenciaNova }
  | { ok: false; erros: string[] };

/**
 * Confere uma vigência nova antes de gravar. Devolve TODOS os erros de uma
 * vez: quem preenche o formulário corrige tudo num passo só.
 */
export function validarVigenciaNova(corpo: unknown): ResultadoDaValidacao {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  const erros: string[] = [];
  const L = LIMITES_DO_FINANCIAMENTO;

  const taxa = (chave: string, rotulo: string): number => {
    const n = numero(c[chave]);
    // O banco guarda com duas casas (numeric(5,2)). Arredonda ANTES de
    // conferir: "0,004" passava no "> 0" e virava taxa zero no banco — que o
    // CHECK recusa, com a mensagem crua dele (revisão de 28/09).
    const r = n === null ? Number.NaN : Math.round(n * 100) / 100;
    if (!(r > 0) || r > L.taxaMaxima) {
      erros.push(`${rotulo}: informe um número de 0,01 a ${L.taxaMaxima}% ao mês.`);
      return Number.NaN;
    }
    return r;
  };
  const taxaExcelenteAm = taxa("taxaExcelenteAm", "Taxa do perfil bom");
  const taxaRegularAm = taxa("taxaRegularAm", "Taxa do perfil regular");
  const taxaRiscoAm = taxa("taxaRiscoAm", "Taxa do perfil de risco");
  if (
    [taxaExcelenteAm, taxaRegularAm, taxaRiscoAm].every(Number.isFinite) &&
    !(taxaExcelenteAm <= taxaRegularAm && taxaRegularAm <= taxaRiscoAm)
  ) {
    erros.push("As taxas vão em ordem: perfil bom ≤ regular ≤ de risco.");
  }

  const anoDeReferencia = numero(c.anoDeReferencia);
  const refOk =
    anoDeReferencia !== null &&
    Number.isInteger(anoDeReferencia) &&
    anoDeReferencia >= L.anoDeReferenciaMin &&
    anoDeReferencia <= L.anoDeReferenciaMax;
  if (!refOk) {
    erros.push(`Ano de referência: um ano entre ${L.anoDeReferenciaMin} e ${L.anoDeReferenciaMax}.`);
  }

  const anoMaisAntigo = numero(c.anoMaisAntigo);
  const antigoOk =
    anoMaisAntigo !== null &&
    Number.isInteger(anoMaisAntigo) &&
    anoMaisAntigo >= L.anoMaisAntigoMin &&
    (!refOk || anoMaisAntigo <= (anoDeReferencia as number));
  if (!antigoOk) {
    erros.push(
      `Ano mais antigo financiado: um ano a partir de ${L.anoMaisAntigoMin} e não depois do ano de referência.`,
    );
  }

  const bancosBrutos = Array.isArray(c.bancosParceiros)
    ? c.bancosParceiros
    : typeof c.bancosParceiros === "string"
      ? c.bancosParceiros.split(/[\n,;]/)
      : [];
  const bancosParceiros = normalizarBancos(bancosBrutos);
  if (bancosParceiros.length === 0 || bancosParceiros.length > L.bancosMax) {
    erros.push(`Bancos parceiros: de 1 a ${L.bancosMax} nomes — o aviso de crédito nomeia com quem a loja trabalha.`);
  }

  const fonteDasTaxas = typeof c.fonteDasTaxas === "string" ? c.fonteDasTaxas.trim().replace(/\s+/g, " ") : "";
  if (fonteDasTaxas.length === 0 || fonteDasTaxas.length > L.fonteMax) {
    erros.push(`Fonte das taxas: de 1 a ${L.fonteMax} caracteres — é o que a tela mostra ao lado da parcela.`);
  }

  const descricaoBruta = typeof c.descricao === "string" ? c.descricao.trim() : "";
  if (descricaoBruta.length > L.descricaoMax) {
    erros.push(`Nota da mudança: até ${L.descricaoMax} caracteres.`);
  }

  if (erros.length > 0) return { ok: false, erros };
  return {
    ok: true,
    valores: {
      taxaExcelenteAm,
      taxaRegularAm,
      taxaRiscoAm,
      anoDeReferencia: anoDeReferencia as number,
      anoMaisAntigo: anoMaisAntigo as number,
      bancosParceiros,
      fonteDasTaxas,
      descricao: descricaoBruta || null,
    },
  };
}

/**
 * Uma linha de `parametros_financiamento` em forma de parâmetro do simulador,
 * ou `null` se qualquer campo vier torto. Mesma régua da gravação: uma linha
 * que o formulário não aceitaria também não vira taxa no site.
 */
export function lerLinhaDoFinanciamento(linha: unknown): ParametrosDoFinanciamento | null {
  if (!linha || typeof linha !== "object") return null;
  const l = linha as Record<string, unknown>;
  const r = validarVigenciaNova({
    taxaExcelenteAm: l.taxa_excelente_am,
    taxaRegularAm: l.taxa_regular_am,
    taxaRiscoAm: l.taxa_risco_am,
    anoDeReferencia: l.ano_de_referencia,
    anoMaisAntigo: l.ano_mais_antigo,
    bancosParceiros: Array.isArray(l.bancos_parceiros) ? l.bancos_parceiros : null,
    fonteDasTaxas: l.fonte_das_taxas,
  });
  if (!r.ok) return null;
  const v = r.valores;
  return {
    id: typeof l.id === "string" ? l.id : null,
    vigenciaDesde: typeof l.vigencia_desde === "string" ? l.vigencia_desde : null,
    taxas: { excelente: v.taxaExcelenteAm / 100, regular: v.taxaRegularAm / 100, risco: v.taxaRiscoAm / 100 },
    anoDeReferencia: v.anoDeReferencia,
    anoMaisAntigo: v.anoMaisAntigo,
    bancosParceiros: v.bancosParceiros,
    fonteDasTaxas: v.fonteDasTaxas,
  };
}

/** O formulário parte dos parâmetros vigentes — as taxas voltam para %. */
export function vigenciaDosParametros(p: ParametrosDoFinanciamento): VigenciaNova {
  const pct = (f: number) => Math.round(f * 10000) / 100;
  return {
    taxaExcelenteAm: pct(p.taxas.excelente),
    taxaRegularAm: pct(p.taxas.regular),
    taxaRiscoAm: pct(p.taxas.risco),
    anoDeReferencia: p.anoDeReferencia,
    anoMaisAntigo: p.anoMaisAntigo,
    bancosParceiros: [...p.bancosParceiros],
    fonteDasTaxas: p.fonteDasTaxas,
    descricao: null,
  };
}

/** A vigência nova em forma de parâmetro — para o exemplo ao vivo do formulário. */
export function parametrosDaVigencia(v: VigenciaNova): ParametrosDoFinanciamento {
  return {
    id: null,
    vigenciaDesde: null,
    taxas: { excelente: v.taxaExcelenteAm / 100, regular: v.taxaRegularAm / 100, risco: v.taxaRiscoAm / 100 },
    anoDeReferencia: v.anoDeReferencia,
    anoMaisAntigo: v.anoMaisAntigo,
    bancosParceiros: v.bancosParceiros,
    fonteDasTaxas: v.fonteDasTaxas,
  };
}
