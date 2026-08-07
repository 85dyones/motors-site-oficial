/**
 * Mídia paga — métricas derivadas, faixas saudáveis e diagnóstico por regra.
 * Telas A13 (consolidado) e A14 (leitura da campanha) do design doc.
 *
 * Tudo aqui deriva de UMA leitura digitada (investido, impressões, alcance,
 * cliques, conversas). Nenhum número nasce neste arquivo: as faixas e os
 * portões vêm escritos no design doc de 2026-08-07, calibrados pelo dono
 * para revenda local — a fonte de cada constante está anotada ao lado.
 *
 * O exemplo de referência do doc fecha com estas fórmulas:
 *   R$ 6,21 · 417 impressões · alcance 277 · 20 cliques · 2 conversas
 *   → CPM R$ 14,89 · CTR 4,80% · CPC R$ 0,31 · R$ 3,11/conversa
 *   → clique→conversa 10,0% · frequência 1,51
 * Os testes usam exatamente esses vetores.
 */

export interface LeituraTotais {
  investido: number;
  impressoes: number;
  alcance: number;
  cliques: number;
  conversas: number;
}

export interface MetricasDerivadas {
  /** Custo por mil impressões. `null` sem impressão. */
  cpm: number | null;
  /** Cliques / impressões, em fração (0.048 = 4,8%). `null` sem impressão. */
  ctr: number | null;
  /** Custo por clique. `null` sem clique. */
  cpc: number | null;
  /** Custo por conversa iniciada. `null` sem conversa. */
  custoPorConversa: number | null;
  /** Conversas / cliques, em fração. `null` sem clique. */
  cliqueParaConversa: number | null;
  /** Impressões / alcance. `null` sem alcance. */
  frequencia: number | null;
}

/**
 * Consolida a leitura atual de uma campanha: investido, impressões, cliques
 * e conversas SOMAM dos anúncios; alcance NÃO soma (a mesma pessoa vê dois
 * anúncios) e vem da linha da campanha. Sem linhas por anúncio, a linha da
 * campanha responde por tudo — é o caso de quem digita só o total.
 */
export function consolidarTotais(
  leiturasAnuncios: Array<LeituraTotais | null | undefined>,
  leituraCampanha: LeituraTotais | null | undefined,
): LeituraTotais {
  const validas = leiturasAnuncios.filter((l): l is LeituraTotais => !!l);
  if (validas.length === 0) {
    return (
      leituraCampanha ?? { investido: 0, impressoes: 0, alcance: 0, cliques: 0, conversas: 0 }
    );
  }
  const soma = validas.reduce(
    (acc, l) => ({
      investido: acc.investido + Number(l.investido || 0),
      impressoes: acc.impressoes + Number(l.impressoes || 0),
      alcance: 0,
      cliques: acc.cliques + Number(l.cliques || 0),
      conversas: acc.conversas + Number(l.conversas || 0),
    }),
    { investido: 0, impressoes: 0, alcance: 0, cliques: 0, conversas: 0 },
  );
  soma.alcance = Number(leituraCampanha?.alcance || 0);
  return soma;
}

export function derivarMetricas(t: LeituraTotais): MetricasDerivadas {
  return {
    cpm: t.impressoes > 0 ? (t.investido / t.impressoes) * 1000 : null,
    ctr: t.impressoes > 0 ? t.cliques / t.impressoes : null,
    cpc: t.cliques > 0 ? t.investido / t.cliques : null,
    custoPorConversa: t.conversas > 0 ? t.investido / t.conversas : null,
    cliqueParaConversa: t.cliques > 0 ? t.conversas / t.cliques : null,
    frequencia: t.alcance > 0 ? t.impressoes / t.alcance : null,
  };
}

/**
 * Faixas saudáveis dos instrumentos da tela A14, "calibradas para revenda
 * local" — valores escritos no design doc, não estimados aqui.
 */
export const FAIXAS_SAUDAVEIS = {
  /** "Saudável até R$ 18" */
  cpmMax: 18,
  /** "Saudável acima de 2%" (fração) */
  ctrMin: 0.02,
  /** "Saudável até R$ 0,80" */
  cpcMax: 0.8,
  /** "Saudável até R$ 15" */
  custoPorConversaMax: 15,
  /** "Saudável acima de 8%" (fração) */
  cliqueParaConversaMin: 0.08,
  /** "Saudável até 1,8" */
  frequenciaMax: 1.8,
  /** A13: "custo por lead · faixa saudável: até R$ 180" (consolidado) */
  custoPorLeadMax: 180,
} as const;

export type EstadoInstrumento = "saudavel" | "fora" | "sem_leitura";

export interface Instrumento {
  chave: keyof MetricasDerivadas;
  rotulo: string;
  valor: number | null;
  estado: EstadoInstrumento;
  referencia: string;
}

/** Os seis instrumentos do A14, com estado contra a faixa. */
export function avaliarInstrumentos(m: MetricasDerivadas): Instrumento[] {
  const aval = (
    chave: keyof MetricasDerivadas,
    rotulo: string,
    referencia: string,
    fora: (v: number) => boolean,
  ): Instrumento => {
    const valor = m[chave];
    return {
      chave,
      rotulo,
      valor,
      referencia,
      estado: valor === null ? "sem_leitura" : fora(valor) ? "fora" : "saudavel",
    };
  };

  return [
    aval("cpm", "CPM", "Saudável até R$ 18", (v) => v > FAIXAS_SAUDAVEIS.cpmMax),
    aval("ctr", "CTR", "Saudável acima de 2%", (v) => v < FAIXAS_SAUDAVEIS.ctrMin),
    aval("cpc", "CPC", "Saudável até R$ 0,80", (v) => v > FAIXAS_SAUDAVEIS.cpcMax),
    aval(
      "custoPorConversa",
      "R$ por conversa",
      "Saudável até R$ 15",
      (v) => v > FAIXAS_SAUDAVEIS.custoPorConversaMax,
    ),
    aval(
      "cliqueParaConversa",
      "Clique → conversa",
      "Saudável acima de 8%",
      (v) => v < FAIXAS_SAUDAVEIS.cliqueParaConversaMin,
    ),
    aval(
      "frequencia",
      "Frequência",
      "Saudável até 1,8",
      (v) => v > FAIXAS_SAUDAVEIS.frequenciaMax,
    ),
  ];
}

/**
 * Portões de aprendizagem do A14. Os três limites são do doc:
 * ~50 conversas por conjunto, 72 h no ar e investimento de 5× o orçamento
 * diário — antes disso a leitura é imatura e mexer reinicia a aprendizagem.
 */
export const PORTOES = {
  conversasMin: 50,
  horasNoArMin: 72,
  multiploOrcamento: 5,
} as const;

export interface PortaoAprendizagem {
  rotulo: string;
  atual: number;
  alvo: number;
  fracao: number;
  descricao: string;
}

export function portoesAprendizagem(
  totais: LeituraTotais,
  horasNoAr: number | null,
  orcamentoDiario: number | null,
): PortaoAprendizagem[] {
  const portoes: PortaoAprendizagem[] = [
    {
      rotulo: "Conversas iniciadas",
      atual: totais.conversas,
      alvo: PORTOES.conversasMin,
      fracao: Math.min(1, totais.conversas / PORTOES.conversasMin),
      descricao:
        "O Meta precisa de ~50 eventos por conjunto para sair da aprendizagem.",
    },
  ];

  if (horasNoAr !== null) {
    portoes.push({
      rotulo: "Tempo no ar",
      atual: horasNoAr,
      alvo: PORTOES.horasNoArMin,
      fracao: Math.min(1, horasNoAr / PORTOES.horasNoArMin),
      descricao: "Antes de 3 dias a entrega ainda oscila muito.",
    });
  }

  if (orcamentoDiario !== null && orcamentoDiario > 0) {
    const alvo = orcamentoDiario * PORTOES.multiploOrcamento;
    portoes.push({
      rotulo: "Investimento",
      atual: totais.investido,
      alvo,
      fracao: Math.min(1, totais.investido / alvo),
      descricao:
        "5× o orçamento diário dá base mínima para comparar criativos.",
    });
  }

  return portoes;
}

export function leituraImatura(portoes: PortaoAprendizagem[]): boolean {
  return portoes.some((p) => p.fracao < 1);
}

// ────────────────────────────────────────────────────────────────────────────
// Diagnóstico por regra — os quatro cartões do A14, derivados dos dados em
// vez de escritos à mão. Cada regra espelha um cartão do doc; o texto cita
// os números reais da campanha em vez dos do exemplo.
// ────────────────────────────────────────────────────────────────────────────

export type NivelDiagnostico = "ESPERAR" | "ATENÇÃO" | "BOM" | "CONFIG";

export interface Diagnostico {
  nivel: NivelDiagnostico;
  titulo: string;
  problema: string;
  ajuste: string;
}

export interface AnuncioComTotais {
  nome: string;
  totais: LeituraTotais;
}

/** Abaixo disso um anúncio "não tem leitura" (cartão cinza do doc). */
export const IMPRESSOES_MINIMAS_LEITURA = 100;
/** O doc manda não pausar criativo antes de 1.000 impressões. */
export const IMPRESSOES_MINIMAS_PAUSA = 1000;
/** Heurística do doc: ~R$ 15/dia por criativo para todos terem entrega. */
export const DIARIO_POR_CRIATIVO = 15;

const brl = (v: number) =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function diagnosticar(
  anuncios: AnuncioComTotais[],
  totais: LeituraTotais,
  metricas: MetricasDerivadas,
  portoes: PortaoAprendizagem[],
  horasNoAr: number | null,
  orcamentoDiario: number | null,
): Diagnostico[] {
  const out: Diagnostico[] = [];

  // 1 · Leitura imatura → não mexa em nada (o doc põe este primeiro).
  if (leituraImatura(portoes)) {
    const faltaHoras =
      horasNoAr !== null ? Math.max(0, PORTOES.horasNoArMin - horasNoAr) : null;
    out.push({
      nivel: "ESPERAR",
      titulo: "Não mexa em nada ainda",
      problema: `Com ${totais.conversas} conversa(s) e ${
        horasNoAr !== null ? Math.round(horasNoAr) + " h no ar" : "pouco tempo no ar"
      }, diferença entre criativos ainda é ruído. CPM e CTR já dão para ler; custo por conversa e taxa de conversão, não.`,
      ajuste:
        faltaHoras !== null && faltaHoras > 0
          ? `Revisar em ${Math.ceil(faltaHoras)} h. Até lá, só intervenha se algum anúncio for reprovado na entrega ou se o CTR cair abaixo de 1%.`
          : "Aguarde os portões fecharem. Só intervenha se algum anúncio for reprovado na entrega ou se o CTR cair abaixo de 1%.",
    });
  }

  const comLeitura = anuncios.filter((a) => a.totais.impressoes > 0);

  // 2 · Concentração de orçamento num criativo só.
  if (totais.investido > 0 && anuncios.length >= 3) {
    const lider = [...comLeitura].sort(
      (a, b) => b.totais.investido - a.totais.investido,
    )[0];
    if (lider) {
      const fatia = lider.totais.investido / totais.investido;
      if (fatia >= 0.6) {
        out.push({
          nivel: "ATENÇÃO",
          titulo: `"${lider.nome}" está levando ${Math.round(fatia * 100)}% do orçamento`,
          problema: `Com ${anuncios.length} anúncios no mesmo conjunto, o algoritmo concentra entrega no que responde melhor — mas isso trava a leitura dos outros ${anuncios.length - 1}. É comportamento esperado, não defeito.`,
          ajuste:
            "Se o objetivo é testar veículos, separe em conjuntos por faixa de preço. Se é volume de conversas, mantenha e deixe o algoritmo escolher.",
        });
      }
    }
  }

  // 3 · Anúncios sem entrega (menos de 100 impressões cada).
  const frios = anuncios.filter(
    (a) => a.totais.impressoes < IMPRESSOES_MINIMAS_LEITURA,
  );
  if (anuncios.length >= 3 && frios.length >= Math.ceil(anuncios.length / 2)) {
    const diarioSugerido = DIARIO_POR_CRIATIVO * anuncios.length;
    out.push({
      nivel: "ATENÇÃO",
      titulo: `${frios.length} anúncio(s) praticamente sem entrega`,
      problema: `Cada um soma menos de ${IMPRESSOES_MINIMAS_LEITURA} impressões. Não é criativo: ${
        orcamentoDiario ? brl(orcamentoDiario) + "/dia" : "o orçamento diário"
      } divididos por ${anuncios.length} anúncios só dão margem para um ou dois vencerem o leilão.`,
      ajuste: `Reduza para 3–4 criativos, ou suba o diário para ~${brl(diarioSugerido)} se quiser leitura de todos. Não pause os fracos antes de ${IMPRESSOES_MINIMAS_PAUSA.toLocaleString("pt-BR")} impressões.`,
    });
  }

  // 4 · CTR acima da faixa → criativo casando com o público.
  if (metricas.ctr !== null && metricas.ctr >= FAIXAS_SAUDAVEIS.ctrMin) {
    out.push({
      nivel: "BOM",
      titulo: `CTR de ${(metricas.ctr * 100).toFixed(2).replace(".", ",")}% — criativo alinhado ao público`,
      problema: `Acima da faixa típica de revenda local (1,5%–2,5%).${
        metricas.cpm !== null ? ` Com CPM de ${brl(metricas.cpm)}, oferta e recorte estão casando.` : ""
      }`,
      ajuste:
        "Reaproveite o ângulo do criativo campeão nos demais anúncios antes de produzir peças novas.",
    });
  }

  return out;
}
