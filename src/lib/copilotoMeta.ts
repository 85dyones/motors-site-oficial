import {
  MAX_PROPOSTAS,
  descreverAcao,
  type Achado,
  type Gravidade,
  type ParametrosDoCopiloto,
  type Proposta,
} from "./copilotoDeMidia";
import type { Janela, Situacao } from "./midiaSync";
import { ETAPAS_QUALIFICADAS } from "./qualificacaoParaMeta";

/**
 * O Copiloto do Meta Ads (17/10/2026) — as regras puras.
 *
 * O do Google recebe o retrato do script da conta. No Meta não há script: o
 * retrato é montado no servidor com o que a sincronização de hora em hora já
 * grava (campanhas, anúncios com o conjunto e a situação, gasto por anúncio e
 * por dia) e com o que o CRM sabe de cada lead. A vantagem do Meta é esta
 * última parte: o anúncio leva `utm_campaign={{campaign.id}}` e
 * `utm_content={{ad.id}}`, e o lead chega ao CRM dizendo de que anúncio veio.
 * O copiloto julga pelo LEAD QUE CHEGOU, não pelo que o pixel contou.
 *
 * O que ele propõe (e só propõe — quem aprova é uma pessoa, pelo painel):
 *   - pausar o conjunto que gastou sem trazer lead, quando a campanha tem
 *     outro conjunto no ar, entregando e fora da lista (pausar o último
 *     pararia a campanha);
 *   - pausar o anúncio que gastou sem trazer lead, quando o conjunto tem
 *     outro anúncio no ar, entregando e fora da lista;
 *   - cortar a verba (no máximo 20% por vez) da campanha cujo custo por lead
 *     é o dobro do da conta, ou que gastou sem lead.
 * E aponta, sem propor nada: leads maduros sem nenhum qualificado, funil
 * parado, pixel e CRM contando coisas diferentes, verba sobrando.
 *
 * Por que 2,5× o custo por lead da conta antes de chamar de "sem lead": com
 * a conta trazendo leads a R$ 60, um conjunto que gastou R$ 60 sem lead está
 * dentro do azar (a chance de zero é ~37%). A 2,5×, a chance de zero num
 * conjunto que performa na média da conta cai para ~8% — e é proposta, não
 * ação: alguém ainda aprova.
 *
 * Por que no máximo 20% de corte por vez: no Meta, mudança grande de verba
 * devolve o conjunto à fase de aprendizado. O parâmetro da loja
 * (`reducaoVerbaPct`) vale até esse teto — uma trava, como o 10× do pedido.
 *
 * Os limiares de negócio são da loja (`midia_copiloto_parametros`, os `meta*`
 * de `ParametrosDoCopiloto`, com vigência e trilha). Aqui ficam só as janelas
 * do método e os pisos estatísticos dos achados que não propõem nada.
 */

/** A janela do retrato: 14 dias completos (até ontem). O volume do Meta pede mais que os 7 do Google. */
export const DIAS_DA_JANELA_META = 14;
/** A janela da qualidade: o lead leva dias para chegar à visita. */
export const DIAS_DA_QUALIDADE = 30;
/** Corte de verba máximo por proposta (fase de aprendizado do Meta): trava, não régua. */
export const CORTE_MAXIMO_META_PCT = 20;
/**
 * Pisos estatísticos dos achados que só apontam (não propõem): com menos de 5
 * leads de um lado, "metade" é ruído; o funil "parado" pede 5 leads e 40% dos
 * maduros.
 */
const LEADS_PARA_COMPARAR = 5;
const PARADOS_MINIMOS = 5;
const FRACAO_PARADA = 0.4;
/** O fuso da conta do Meta (o mesmo calendário do `midia_diario`). */
export const FUSO_DO_META = "America/Sao_Paulo";

// ─────────────────────────────────────────────────────────────────────────────
// O retrato
// ─────────────────────────────────────────────────────────────────────────────

export interface CampanhaDoMeta {
  id: string;
  nome: string;
  situacao: Situacao;
  /** Verba diária da CAMPANHA (orçamento de campanha). Nula quando a verba é dos conjuntos. */
  verba: number | null;
}

export interface AnuncioDoMeta {
  id: string;
  nome: string;
  campanhaId: string;
  conjuntoId: string | null;
  conjuntoNome: string | null;
  /** Nula enquanto a sincronização não trouxe a lista `/ads` (antes da migração). */
  situacao: Situacao | null;
  conjuntoSituacao: Situacao | null;
}

export interface DiaDoMeta {
  campanhaId: string;
  anuncioId: string | null;
  dia: string;
  gasto: number;
  impressoes: number;
  cliques: number;
  /** Leads que o PIXEL contou (o que o Meta reporta). */
  leads: number;
}

/** Um lead do CRM que veio do Meta. Nenhum dado de pessoa: só origem, data e etapa. */
export interface LeadDoMeta {
  campanhaId: string | null;
  anuncioId: string | null;
  /** YYYY-MM-DD no fuso da conta. */
  dia: string;
  /** Chegou a uma etapa qualificada (visita, negociação) ou fechou como ganho. */
  qualificado: boolean;
  /** Ainda sem desfecho e sem qualificar. */
  aberto: boolean;
}

export interface RetratoDoMeta {
  /** `act_<id>` da conta. */
  conta: string;
  /** Os 14 dias do retrato. */
  janela: Janela;
  /** Os 30 dias da qualidade (terminam no mesmo dia). */
  janelaQualidade: Janela;
  campanhas: CampanhaDoMeta[];
  anuncios: AnuncioDoMeta[];
  dias: DiaDoMeta[];
  /** Os leads da janela da qualidade (que contém a do retrato). */
  leads: LeadDoMeta[];
}

export interface ResumoDoMeta {
  plataforma: "meta";
  gasto: number;
  impressoes: number;
  cliques: number;
  leadsPixel: number;
  leadsCrm: number;
  /** Gasto ÷ leads do CRM na janela. Nulo sem lead. */
  custoPorLead: number | null;
  /** Os maduros (≥ 7 dias) dos 30 dias, e quantos deles qualificaram. */
  maduros: number;
  qualificados: number;
  /** Maduros ainda sem desfecho e sem qualificar. */
  abertosParados: number;
  achados: Record<Gravidade, number>;
  propostas: number;
}

export interface ResultadoDoMeta {
  resumo: ResumoDoMeta;
  achados: Achado[];
  propostas: Proposta[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Contas
// ─────────────────────────────────────────────────────────────────────────────

const arred = (n: number) => Math.round(n * 100) / 100;
const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Um dia depois/antes, em YYYY-MM-DD. */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const dentro = (dia: string, j: Janela) => dia >= j.de && dia <= j.ate;

/**
 * O lead do CRM qualificou? A régua é a da qualificação que vai ao Meta
 * (`qualificacaoParaMeta`): etapa qualificada ou ganho. A etapa de tipo
 * `ganho`, seja qual for a chave, grava `desfecho = 'ganho'` (gatilho do funil).
 * É a etapa de AGORA: lead que visitou e depois foi perdido não conta.
 */
export function leadQualificado(situacao: string | null | undefined, desfecho: string | null | undefined): boolean {
  if (desfecho === "ganho") return true;
  return typeof situacao === "string" && ETAPAS_QUALIFICADAS.includes(situacao);
}

interface Totais {
  gasto: number;
  gasto7: number;
  impressoes: number;
  cliques: number;
  leadsPixel: number;
  leadsCrm: number;
}

const zero = (): Totais => ({ gasto: 0, gasto7: 0, impressoes: 0, cliques: 0, leadsPixel: 0, leadsCrm: 0 });

// ─────────────────────────────────────────────────────────────────────────────
// O diagnóstico
// ─────────────────────────────────────────────────────────────────────────────

export function diagnosticarMeta(r: RetratoDoMeta, p: ParametrosDoCopiloto): ResultadoDoMeta {
  const achados: Achado[] = [];
  const propostas: Proposta[] = [];
  const inicio7 = somarDias(r.janela.ate, -6);

  const campanhas = new Map(r.campanhas.map((c) => [c.id, c]));
  const anuncios = new Map(r.anuncios.map((a) => [a.id, a]));

  // Gasto e pixel por anúncio e por campanha, na janela.
  const porAnuncio = new Map<string, Totais>();
  const porCampanha = new Map<string, Totais>();
  const somar = (m: Map<string, Totais>, k: string, d: DiaDoMeta) => {
    const t = m.get(k) ?? zero();
    t.gasto += d.gasto;
    if (d.dia >= inicio7) t.gasto7 += d.gasto;
    t.impressoes += d.impressoes;
    t.cliques += d.cliques;
    t.leadsPixel += d.leads;
    m.set(k, t);
  };
  for (const d of r.dias) {
    if (!dentro(d.dia, r.janela)) continue;
    somar(porCampanha, d.campanhaId, d);
    if (d.anuncioId) somar(porAnuncio, d.anuncioId, d);
  }

  // Os leads do CRM na janela: por campanha e por anúncio. Lead com campanha
  // mas sem anúncio conhecido não deixa julgar anúncio nem conjunto daquela
  // campanha (o "zero lead" poderia ser só o utm_content que faltou).
  const semAnuncio = new Map<string, number>();
  for (const l of r.leads) {
    if (!dentro(l.dia, r.janela) || !l.campanhaId || !campanhas.has(l.campanhaId)) continue;
    const c = porCampanha.get(l.campanhaId) ?? zero();
    c.leadsCrm++;
    porCampanha.set(l.campanhaId, c);
    const an = l.anuncioId ? anuncios.get(l.anuncioId) : undefined;
    if (an && an.campanhaId === l.campanhaId) {
      const t = porAnuncio.get(an.id) ?? zero();
      t.leadsCrm++;
      porAnuncio.set(an.id, t);
    } else {
      semAnuncio.set(l.campanhaId, (semAnuncio.get(l.campanhaId) ?? 0) + 1);
    }
  }

  const total = [...porCampanha.values()].reduce((s, t) => {
    s.gasto += t.gasto;
    s.impressoes += t.impressoes;
    s.cliques += t.cliques;
    s.leadsPixel += t.leadsPixel;
    s.leadsCrm += t.leadsCrm;
    return s;
  }, zero());
  const custoPorLead = total.leadsCrm > 0 ? total.gasto / total.leadsCrm : null;
  const limiarSemLead = custoPorLead === null ? Infinity : Math.max(p.metaGastoMinimoConjunto, p.metaVezesSemLead * custoPorLead);
  const corte = Math.min(p.reducaoVerbaPct, CORTE_MAXIMO_META_PCT);

  const evidenciaDaConta = {
    janela: r.janela,
    custoPorLeadDaConta: custoPorLead === null ? null : arred(custoPorLead),
    limiarSemLead: Number.isFinite(limiarSemLead) ? arred(limiarSemLead) : null,
  };
  const novoAchado = (a: Achado) => achados.push(a) - 1;

  // ── Medição da conta: gastou e nenhum lead do Meta chegou ao CRM ──────────
  if (total.leadsCrm === 0 && total.gasto >= p.metaGastoMinimoCampanha) {
    novoAchado({
      regra: "meta_medicao",
      grupo: null,
      gravidade: "alta",
      titulo: `${reais(total.gasto)} no Meta e nenhum lead do Meta no CRM`,
      detalhe:
        `Em ${DIAS_DA_JANELA_META} dias o Meta gastou ${reais(total.gasto)} e o pixel contou ${plural(total.leadsPixel, "lead", "leads")}, ` +
        "mas nenhum lead chegou ao CRM com a campanha do Meta (utm_campaign). Sem isso o copiloto não julga anúncio nem conjunto: " +
        "confira os parâmetros de URL dos anúncios ({{campaign.id}} e {{ad.id}}) e o formulário do site.",
      evidencias: { ...evidenciaDaConta, gasto: arred(total.gasto), leadsPixel: total.leadsPixel },
    });
  }

  const campanhasComGasto = r.campanhas.filter((c) => (porCampanha.get(c.id)?.gasto ?? 0) > 0);

  for (const c of r.campanhas) {
    const tc = porCampanha.get(c.id) ?? zero();
    const noAr = c.situacao === "no_ar";

    // ── Verba sobrando (também na campanha no ar que não gastou nada) ──────
    if (noAr && c.verba && c.verba > 0) {
      const ritmo = (tc.gasto7 / (c.verba * 7)) * 100;
      if (ritmo < p.ritmoBaixoPct) {
        novoAchado({
          regra: "ritmo_de_verba",
          grupo: null,
          gravidade: "baixa",
          titulo: `${c.nome}: gastou ${Math.round(ritmo)}% da verba nos últimos 7 dias`,
          detalhe:
            `Verba de ${reais(c.verba)} por dia e ${reais(tc.gasto7)} gastos em 7 dias. O Meta não está achando onde entregar: ` +
            "público pequeno, anúncio em análise ou lance limitado. Aumentar a verba aqui não traz lead.",
          evidencias: { ...evidenciaDaConta, campanhaId: c.id, verba: c.verba, gasto7: arred(tc.gasto7), ritmoPct: Math.round(ritmo) },
        });
      }
    }

    if (tc.gasto <= 0) continue;
    let mexeuNaCampanha = false;

    // ── Pixel × CRM, por campanha ──────────────────────────────────────────
    if (tc.leadsPixel >= LEADS_PARA_COMPARAR && tc.leadsCrm < tc.leadsPixel * 0.5) {
      novoAchado({
        regra: "meta_medicao",
        grupo: null,
        gravidade: "alta",
        titulo: `${c.nome}: o pixel contou ${tc.leadsPixel}, o CRM recebeu ${tc.leadsCrm}`,
        detalhe:
          "Mais da metade dos leads que o Meta conta não chega ao CRM com a campanha. Ou o formulário perde o lead, ou o anúncio " +
          "está sem os parâmetros de URL. Enquanto isso, o custo por lead desta campanha aqui está pior do que é.",
        evidencias: { ...evidenciaDaConta, campanhaId: c.id, leadsPixel: tc.leadsPixel, leadsCrm: tc.leadsCrm },
      });
    } else if (tc.leadsCrm >= LEADS_PARA_COMPARAR && tc.leadsPixel < tc.leadsCrm * 0.5) {
      novoAchado({
        regra: "meta_medicao",
        grupo: null,
        gravidade: "media",
        titulo: `${c.nome}: o CRM recebeu ${tc.leadsCrm}, o pixel contou ${tc.leadsPixel}`,
        detalhe:
          "O Meta está vendo menos da metade dos leads que a campanha traz. O algoritmo otimiza pelo que vê: confira o evento " +
          "Lead do pixel e da CAPI no Gerenciador de Eventos.",
        evidencias: { ...evidenciaDaConta, campanhaId: c.id, leadsPixel: tc.leadsPixel, leadsCrm: tc.leadsCrm },
      });
    }

    // ── Conjuntos e anúncios que gastaram sem lead ─────────────────────────
    const julgaAnuncios = noAr && (semAnuncio.get(c.id) ?? 0) === 0 && Number.isFinite(limiarSemLead);
    if (julgaAnuncios) {
      const daCampanha = r.anuncios.filter((a) => a.campanhaId === c.id && a.conjuntoId);
      const conjuntos = new Map<string, { nome: string; noAr: boolean; anuncios: AnuncioDoMeta[] }>();
      for (const a of daCampanha) {
        const k = a.conjuntoId as string;
        const cj = conjuntos.get(k) ?? { nome: a.conjuntoNome ?? k, noAr: false, anuncios: [] };
        cj.noAr ||= a.conjuntoSituacao === "no_ar";
        cj.anuncios.push(a);
        conjuntos.set(k, cj);
      }
      const conjuntosNoAr = [...conjuntos.entries()].filter(([, cj]) => cj.noAr);

      // "Entregando" é no ar E com gasto nos últimos 7 dias: anúncio em
      // análise, sem público ou arquivado com a situação velha não segura a
      // campanha no ar. Pausar só quando sobra um que continue entregando —
      // e o que sobra não pode estar na mesma lista de pausas.
      const entregando = (a: AnuncioDoMeta) => a.situacao === "no_ar" && (porAnuncio.get(a.id)?.gasto7 ?? 0) > 0;
      const totaisDoConjunto = new Map(
        conjuntosNoAr.map(([conjuntoId, cj]) => [
          conjuntoId,
          cj.anuncios.reduce((s, a) => {
            const ta = porAnuncio.get(a.id);
            if (ta) {
              s.gasto += ta.gasto;
              s.gasto7 += ta.gasto7;
              s.leadsPixel += ta.leadsPixel;
              s.leadsCrm += ta.leadsCrm;
            }
            return s;
          }, zero()),
        ]),
      );
      const conjuntoSemLead = (id: string) => {
        const t = totaisDoConjunto.get(id) as Totais;
        return t.leadsCrm === 0 && t.gasto >= limiarSemLead;
      };
      const conjuntosQueFicam = conjuntosNoAr.filter(([id, cj]) => !conjuntoSemLead(id) && cj.anuncios.some(entregando));

      for (const [conjuntoId, cj] of conjuntosNoAr) {
        const t = totaisDoConjunto.get(conjuntoId) as Totais;

        if (conjuntoSemLead(conjuntoId)) {
          const ultimo = conjuntosQueFicam.length === 0;
          const i = novoAchado({
            regra: "meta_sem_lead",
            grupo: null,
            gravidade: "alta",
            titulo: `Conjunto ${cj.nome}: ${reais(t.gasto)} sem nenhum lead no CRM`,
            detalhe:
              `Em ${DIAS_DA_JANELA_META} dias o conjunto gastou ${reais(t.gasto)} e nenhum lead chegou ao CRM` +
              (t.leadsPixel > 0 ? ` (o pixel contou ${plural(t.leadsPixel, "lead", "leads")})` : "") +
              `. O custo por lead da conta é ${reais(custoPorLead as number)}; a partir de ${reais(limiarSemLead)} sem lead deixa de ser azar.` +
              (ultimo
                ? " A campanha não tem outro conjunto no ar que continue entregando: pausar pararia a campanha, então não há proposta — veja a verba da campanha."
                : ""),
            evidencias: { ...evidenciaDaConta, campanhaId: c.id, conjuntoId, gasto: arred(t.gasto), leadsPixel: t.leadsPixel, leadsCrm: 0 },
          });
          if (!ultimo) {
            propostas.push({
              achado: i,
              chave: `meta:pausar_conjunto:${conjuntoId}`,
              tipo: "pausar_conjunto",
              campanhaId: c.id,
              campanhaNome: c.nome,
              grupoId: conjuntoId,
              grupoNome: cj.nome,
              anuncioId: null,
              anuncioNome: null,
              texto: null,
              correspondencia: null,
              verbaAtual: null,
              verbaNova: null,
              motivo:
                `Gastou ${reais(t.gasto)} em ${DIAS_DA_JANELA_META} dias sem nenhum lead no CRM (limite: ${reais(limiarSemLead)}). ` +
                (c.verba !== null
                  ? "Com a verba na campanha, o Meta passa o dinheiro para os outros conjuntos."
                  : "A verba deste conjunto fica nele: pausado, ela deixa de ser gasta."),
              economia7d: arred(t.gasto7),
              evidencias: { ...evidenciaDaConta, gasto: arred(t.gasto), leadsPixel: t.leadsPixel },
            });
            mexeuNaCampanha = true;
          }
          continue;
        }

        // O conjunto não está na lista: olhar os anúncios dele.
        const anunciosNoAr = cj.anuncios.filter((a) => a.situacao === "no_ar");
        const anuncioSemLead = (a: AnuncioDoMeta) => {
          const ta = porAnuncio.get(a.id) ?? zero();
          return ta.leadsCrm === 0 && ta.gasto >= limiarSemLead;
        };
        const anunciosQueFicam = anunciosNoAr.filter((a) => !anuncioSemLead(a) && entregando(a));
        for (const a of anunciosNoAr) {
          if (!anuncioSemLead(a)) continue;
          const ta = porAnuncio.get(a.id) ?? zero();
          const ultimo = anunciosQueFicam.length === 0;
          const i = novoAchado({
            regra: "meta_sem_lead",
            grupo: null,
            gravidade: "media",
            titulo: `Anúncio ${a.nome}: ${reais(ta.gasto)} sem nenhum lead no CRM`,
            detalhe:
              `No conjunto ${cj.nome}, o anúncio gastou ${reais(ta.gasto)} em ${DIAS_DA_JANELA_META} dias sem trazer lead` +
              (ta.leadsPixel > 0 ? ` (o pixel contou ${plural(ta.leadsPixel, "lead", "leads")})` : "") +
              (ultimo
                ? ". O conjunto não tem outro anúncio no ar que continue entregando: pausar pararia o conjunto, então não há proposta."
                : ", enquanto o conjunto continua entregando pelos outros anúncios."),
            evidencias: { ...evidenciaDaConta, campanhaId: c.id, conjuntoId, anuncioId: a.id, gasto: arred(ta.gasto), leadsPixel: ta.leadsPixel },
          });
          if (ultimo) continue;
          propostas.push({
            achado: i,
            chave: `meta:pausar_anuncio:${a.id}`,
            tipo: "pausar_anuncio",
            campanhaId: c.id,
            campanhaNome: c.nome,
            grupoId: conjuntoId,
            grupoNome: cj.nome,
            anuncioId: a.id,
            anuncioNome: a.nome,
            texto: null,
            correspondencia: null,
            verbaAtual: null,
            verbaNova: null,
            motivo:
              `Gastou ${reais(ta.gasto)} em ${DIAS_DA_JANELA_META} dias sem nenhum lead no CRM (limite: ${reais(limiarSemLead)}). ` +
              "O conjunto continua com os outros anúncios no ar.",
            economia7d: arred(ta.gasto7),
            evidencias: { ...evidenciaDaConta, gasto: arred(ta.gasto), leadsPixel: ta.leadsPixel },
          });
          mexeuNaCampanha = true;
        }
      }
    }

    // ── Custo por lead da campanha ─────────────────────────────────────────
    // Só com outra campanha gastando para comparar, e uma mudança por vez:
    // a campanha que já tem pausa proposta espera o efeito dela.
    if (noAr && custoPorLead !== null && campanhasComGasto.length >= 2 && !mexeuNaCampanha) {
      const cpl = tc.leadsCrm > 0 ? tc.gasto / tc.leadsCrm : null;
      const caro = cpl === null ? tc.gasto >= limiarSemLead : cpl >= p.metaVezesCustoCaro * custoPorLead;
      if (caro && tc.gasto >= Math.max(p.metaGastoMinimoCampanha, p.metaVezesSemLead * custoPorLead)) {
        const verbaNova = c.verba ? arred(Math.max(1, c.verba * (1 - corte / 100))) : null;
        const i = novoAchado({
          regra: "meta_custo_por_lead",
          grupo: null,
          gravidade: "alta",
          titulo:
            cpl === null
              ? `${c.nome}: ${reais(tc.gasto)} sem nenhum lead no CRM`
              : `${c.nome}: ${reais(cpl)} por lead, contra ${reais(custoPorLead)} da conta`,
          detalhe:
            (cpl === null
              ? `Em ${DIAS_DA_JANELA_META} dias a campanha gastou ${reais(tc.gasto)} e nenhum lead chegou ao CRM.`
              : `Em ${DIAS_DA_JANELA_META} dias a campanha trouxe ${plural(tc.leadsCrm, "lead", "leads")} a ${reais(cpl)} cada — ` +
                `${Math.round((cpl / custoPorLead) * 10) / 10}× o custo da conta.`) +
            (verbaNova === null
              ? " A verba desta campanha fica nos conjuntos: o corte é pelo Gerenciador de Anúncios."
              : ` A proposta corta ${corte}% da verba (no Meta, mais que 20% de uma vez volta a campanha para o aprendizado).`),
          evidencias: { ...evidenciaDaConta, campanhaId: c.id, gasto: arred(tc.gasto), leadsCrm: tc.leadsCrm, custoPorLead: cpl === null ? null : arred(cpl) },
        });
        if (c.verba && verbaNova !== null && verbaNova < c.verba) {
          propostas.push({
            achado: i,
            // A mesma chave do pedido de verba: um pedido aberto segura o corte.
            chave: `verba:${c.id}`,
            tipo: "mudar_verba",
            campanhaId: c.id,
            campanhaNome: c.nome,
            grupoId: null,
            grupoNome: null,
            anuncioId: null,
            anuncioNome: null,
            texto: null,
            correspondencia: null,
            verbaAtual: c.verba,
            verbaNova,
            motivo:
              (cpl === null
                ? `Gastou ${reais(tc.gasto)} em ${DIAS_DA_JANELA_META} dias sem lead no CRM.`
                : `Custo por lead de ${reais(cpl)}, ${Math.round((cpl / custoPorLead) * 10) / 10}× o da conta (${reais(custoPorLead)}).`) +
              ` Corte de ${corte}%.`,
            economia7d: arred((c.verba - verbaNova) * 7),
            evidencias: { ...evidenciaDaConta, gasto: arred(tc.gasto), leadsCrm: tc.leadsCrm },
          });
        }
      }
    }

  }

  // ── Qualidade: os leads maduros dos 30 dias ──────────────────────────────
  const diasParaAmadurecer = p.metaDiasParaAmadurecer;
  const limiteMaduro = somarDias(r.janelaQualidade.ate, -(diasParaAmadurecer - 1));
  const maduros = r.leads.filter(
    (l) => dentro(l.dia, r.janelaQualidade) && l.dia < limiteMaduro && l.campanhaId !== null && campanhas.has(l.campanhaId),
  );
  const qualificados = maduros.filter((l) => l.qualificado).length;
  const abertosParados = maduros.filter((l) => l.aberto).length;

  const maduroPorCampanha = new Map<string, { n: number; q: number }>();
  for (const l of maduros) {
    const m = maduroPorCampanha.get(l.campanhaId as string) ?? { n: 0, q: 0 };
    m.n++;
    if (l.qualificado) m.q++;
    maduroPorCampanha.set(l.campanhaId as string, m);
  }
  for (const [id, m] of maduroPorCampanha) {
    if (m.n < p.metaLeadsMadurosMinimos || m.q > 0) continue;
    const c = campanhas.get(id) as CampanhaDoMeta;
    novoAchado({
      regra: "meta_qualidade",
      grupo: null,
      gravidade: "media",
      titulo: `${c.nome}: ${m.n} leads em ${DIAS_DA_QUALIDADE} dias e nenhum em visita, negociação ou venda`,
      detalhe:
        `Dos leads com mais de ${diasParaAmadurecer} dias, nenhum está hoje em Visita agendada, Negociação ou Ganho. ` +
        "Ou o público não é de comprador, ou o funil não está sendo movido — confira antes de aumentar a verba.",
      evidencias: { janelaQualidade: r.janelaQualidade, campanhaId: id, maduros: m.n, qualificados: 0 },
    });
  }
  if (abertosParados >= PARADOS_MINIMOS && abertosParados >= FRACAO_PARADA * maduros.length) {
    novoAchado({
      regra: "meta_qualidade",
      grupo: null,
      gravidade: "baixa",
      titulo: `${abertosParados} leads do Meta parados no funil há mais de ${diasParaAmadurecer} dias`,
      detalhe:
        `De ${maduros.length} leads do Meta com mais de ${diasParaAmadurecer} dias, ${abertosParados} continuam sem desfecho e sem visita. ` +
        "Movê-los no quadro do funil (para Visita, Perdido ou Não é oportunidade) é o que deixa o copiloto julgar qualidade — " +
        "e o que manda o LeadQualificado de volta para o Meta.",
      evidencias: { janelaQualidade: r.janelaQualidade, maduros: maduros.length, abertosParados },
    });
  }

  // As de maior economia primeiro; o teto é o mesmo do Google.
  const escolhidas = propostas
    .map((pr, ordem) => ({ pr, ordem }))
    .sort((a, b) => (b.pr.economia7d ?? 0) - (a.pr.economia7d ?? 0) || a.ordem - b.ordem)
    .slice(0, MAX_PROPOSTAS)
    .map((x) => x.pr);

  const contagem: Record<Gravidade, number> = { alta: 0, media: 0, baixa: 0 };
  for (const a of achados) contagem[a.gravidade]++;

  return {
    resumo: {
      plataforma: "meta",
      gasto: arred(total.gasto),
      impressoes: total.impressoes,
      cliques: total.cliques,
      leadsPixel: total.leadsPixel,
      leadsCrm: total.leadsCrm,
      custoPorLead: custoPorLead === null ? null : arred(custoPorLead),
      maduros: maduros.length,
      qualificados,
      abertosParados,
      achados: contagem,
      propostas: escolhidas.length,
    },
    achados,
    propostas: escolhidas,
  };
}

/** O JSON que `public.midia_copiloto_gravar_diagnostico(jsonb)` lê, com `plataforma: 'meta'`. */
export function diagnosticoMetaParaBanco(r: RetratoDoMeta, res: ResultadoDoMeta) {
  return {
    plataforma: "meta",
    conta: r.conta,
    de: r.janela.de,
    ate: r.janela.ate,
    previa: false,
    // O retrato sem os leads: o banco guarda o que a conta mostrava; o CRM já é o CRM.
    dados: { janela: r.janela, janelaQualidade: r.janelaQualidade, campanhas: r.campanhas, anuncios: r.anuncios, dias: r.dias },
    resumo: res.resumo,
    erros: {},
    achados: res.achados.map((a) => ({
      regra: a.regra,
      grupo: a.grupo,
      gravidade: a.gravidade,
      titulo: a.titulo,
      detalhe: a.detalhe,
      evidencias: a.evidencias,
    })),
    propostas: res.propostas.map((pr) => ({
      achado: pr.achado,
      chave: pr.chave,
      tipo: pr.tipo,
      campanha_id_externo: pr.campanhaId,
      campanha_nome: pr.campanhaNome,
      grupo_id_externo: pr.grupoId,
      grupo_nome: pr.grupoNome,
      anuncio_id_externo: pr.anuncioId,
      anuncio_nome: pr.anuncioNome,
      texto: pr.texto,
      correspondencia: pr.correspondencia,
      verba_atual: pr.verbaAtual,
      verba_nova: pr.verbaNova,
      motivo: pr.motivo,
      economia_7d: pr.economia7d,
      evidencias: pr.evidencias,
    })),
  };
}

/** Para a tela e para o teste: a frase da proposta é a mesma do banco. */
export const fraseDaProposta = (pr: Proposta) =>
  descreverAcao({
    tipo: pr.tipo,
    campanhaNome: pr.campanhaNome,
    grupoNome: pr.grupoNome,
    anuncioNome: pr.anuncioNome,
    texto: pr.texto,
    correspondencia: pr.correspondencia,
    verbaAtual: pr.verbaAtual,
    verbaNova: pr.verbaNova,
  });
