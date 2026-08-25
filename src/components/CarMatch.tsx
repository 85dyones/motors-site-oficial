"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { getEstoque, getVeiculoPdpUrl, Veiculo } from "../lib/supabase";
import { precoVigente } from "../lib/regrasEstoque";
import { logFlowInitiated, getActiveAgUid, getUtmParameters, sufixoRef, trackCarMatch, trackLeadSubmission, trackContactClick } from "../lib/telemetry";
import { getMatchParams } from "../lib/tracking-identity";
import LeadCaptureModal from "./LeadCaptureModal";
import { useTheme } from "../app/ThemeContext";
import { CardVeiculo, Rotulo, Seta } from "./modernist/primitivos";
import { linkWhatsApp } from "../lib/whatsapp";

/**
 * Tela 04 — Garagem Profiler, na linguagem Modernist.
 *
 * O quiz ocupa a tela inteira em fundo escuro, com o perfil se formando na
 * coluna clara ao lado — comparativo tipo assistente de compra, como no
 * design doc. A régua de progresso substitui a trilha de bolinhas.
 *
 * O que NÃO mudou: perguntas, pontuação, faixas de orçamento derivadas do
 * estoque, curador por texto livre, chamadas de telemetria e o payload
 * enviado ao n8n. Isto aqui é troca de camada de apresentação; os textos
 * longos que vão no payload continuam saindo das funções `format*`.
 */

interface AnswerState {
  budgetMin: number;
  budgetMax: number;
  objective: "status" | "family" | "efficiency" | "offroad" | "";
  experience: "performance" | "comfort" | "tech" | "economy" | "";
  style: "suv" | "sedan" | "sport" | "pickup" | "open" | "";
  timeline: "immediate" | "researching" | "future" | "";
}

type EstadoQuiz = "intro" | "q1" | "q2" | "q3" | "q4" | "q5" | "loading" | "results";

/**
 * As cinco perguntas, na ordem. Alimenta a régua de progresso e a lista do
 * painel lateral — antes as duas coisas tinham cada uma a sua lista.
 */
const PERGUNTAS = [
  { id: "q1", numero: "01", rotulo: "ORÇAMENTO" },
  { id: "q2", numero: "02", rotulo: "OBJETIVO" },
  { id: "q3", numero: "03", rotulo: "EXPERIÊNCIA" },
  { id: "q4", numero: "04", rotulo: "ESTILO" },
  { id: "q5", numero: "05", rotulo: "PRAZO" },
] as const;

/** Segundos por pergunta usados no "faltam N · ~Ns" — o ritmo do design doc. */
const SEGUNDOS_POR_PERGUNTA = 6;

/**
 * Opções de cada pergunta.
 *
 * `resumo` é o rótulo curto do painel lateral. O texto que vai no payload
 * continua vindo de `formatObjective`/`formatExperience`/… — mexer nestes
 * títulos não muda o que o n8n recebe.
 */
const OPCOES_OBJETIVO = [
  { id: "family", letra: "A", titulo: "Conforto, Segurança & Família", desc: "Viagens seguras e bastante espaço.", resumo: "Família" },
  { id: "status", letra: "B", titulo: "Status, Exclusividade & Design", desc: "Design imponente e presença única.", resumo: "Status" },
  { id: "efficiency", letra: "C", titulo: "Tecnologia, Inovação & Eficiência", desc: "Uso urbano inteligente.", resumo: "Eficiência" },
  { id: "offroad", letra: "D", titulo: "Força, Aventura & Capacidade", desc: "Capacidade offroad ou para trabalho pesado.", resumo: "Aventura" },
] as const;

const OPCOES_EXPERIENCIA = [
  { id: "performance", letra: "A", titulo: "Performance & Potência", desc: "Aceleração rápida e dinâmica afiada.", resumo: "Performance" },
  { id: "comfort", letra: "B", titulo: "Conforto Máximo & Silêncio", desc: "Isolamento acústico e rodar suave.", resumo: "Conforto" },
  { id: "tech", letra: "C", titulo: "Tecnologia & Conectividade", desc: "Telas avançadas e sistemas de assistência.", resumo: "Tecnologia" },
  { id: "economy", letra: "D", titulo: "Custo-Benefício & Manutenção", desc: "Economia no dia a dia e liquidez.", resumo: "Custo-benefício" },
] as const;

const OPCOES_ESTILO = [
  { id: "suv", letra: "A", titulo: "SUVs Imponentes", desc: "", resumo: "SUV" },
  { id: "sedan", letra: "B", titulo: "Sedans Elegantes", desc: "", resumo: "Sedã" },
  { id: "sport", letra: "C", titulo: "Esportivos / Coupés", desc: "", resumo: "Esportivo" },
  { id: "pickup", letra: "D", titulo: "Picapes", desc: "", resumo: "Picape" },
  { id: "open", letra: "E", titulo: "Aberto a Sugestões", desc: "", resumo: "Sem preferência" },
] as const;

const OPCOES_PRAZO = [
  { id: "immediate", letra: "A", titulo: "Imediato", desc: "Pronto para fechar negócio nas próximas semanas.", resumo: "Imediato" },
  { id: "researching", letra: "B", titulo: "Pesquisando", desc: "Mapeando opções para compra no próximo mês.", resumo: "Pesquisando" },
  { id: "future", letra: "C", titulo: "Apenas Sondando", desc: "Acompanhando o mercado sem pressa.", resumo: "Sondando" },
] as const;

/* ────────────────────────────────────────────────────────────────────────
   Peças da tela
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Opção de resposta: letra em vermelho, título e descrição.
 * Sem raio, sem sombra — a borda de 2px é o que marca a seleção.
 */
function OpcaoQuiz({
  letra,
  titulo,
  desc,
  selecionada,
  onClick,
}: {
  letra: string;
  titulo: string;
  desc?: string;
  selecionada: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selecionada}
      className={`mt-foco flex w-full items-start gap-4 border-2 p-4 text-left transition-colors lg:gap-[18px] lg:px-6 lg:py-[22px] ${
        selecionada
          ? "border-mt-accent bg-[color-mix(in_srgb,var(--mt-accent)_14%,transparent)]"
          : "border-mt-inverso-regua-fina hover:border-mt-inverso-regua"
      }`}
    >
      <span className="mt-0.5 text-[11px] font-extrabold tracking-[.1em] text-mt-accent lg:mt-1 lg:text-xs">
        {letra}
      </span>
      <span className="min-w-0">
        <span className="block text-[17px] font-extrabold leading-tight tracking-[-.02em] lg:text-[21px]">
          {titulo}
        </span>
        {desc && (
          <span className="mt-1.5 block text-xs leading-snug text-mt-inverso-suave lg:text-[13px]">
            {desc}
          </span>
        )}
      </span>
    </button>
  );
}

/** Régua de progresso — "02 / 05 · USO PRINCIPAL" e a barra vermelha. */
function ReguaProgresso({ indice }: { indice: number }) {
  const pergunta = PERGUNTAS[indice];
  const percentual = ((indice + 1) / PERGUNTAS.length) * 100;

  return (
    <div className="mt-9 lg:mt-13">
      <div className="flex items-baseline gap-3 lg:gap-3.5">
        <span className="text-xs font-extrabold tracking-[.12em] text-mt-accent lg:text-[13px]">
          {pergunta.numero} / 0{PERGUNTAS.length}
        </span>
        <span className="text-[11px] tracking-[.08em] text-mt-inverso-suave lg:text-xs">
          {pergunta.rotulo}
        </span>
      </div>
      <div className="mt-3 h-0.5 bg-mt-inverso-regua-fina lg:mt-3.5">
        <div
          className="h-0.5 bg-mt-accent transition-[width] duration-300"
          style={{ width: `${percentual}%` }}
        />
      </div>
    </div>
  );
}

export default function CarMatch() {
  const { companySettings } = useTheme();
  const [gameState, setGameState] = useState<EstadoQuiz>("intro");
  const [answers, setAnswers] = useState<AnswerState>({ budgetMin: 0, budgetMax: 0, objective: "", experience: "", style: "", timeline: "" });
  const [estoque, setEstoque] = useState<Veiculo[]>([]);
  const [agUid, setAgUid] = useState("ag_ref_nao_localizado");

  // New States
  const [matchedVehicles, setMatchedVehicles] = useState<(Veiculo & { matchScore?: number })[]>([]);
  const [loadingPhase, setLoadingPhase] = useState<number>(0);
  const [resultsCount, setResultsCount] = useState<number>(0);

  // ─── Dynamic budget ranges computed from real inventory ───
  interface BudgetRange {
    id: string;
    min: number;
    max: number;
    title: string;
    count: number;
    desc: string;
  }
  const [budgetRanges, setBudgetRanges] = useState<BudgetRange[]>([]);

  // Custom budget and upsell settings
  const [budgetTab, setBudgetTab] = useState<"presets" | "custom" | "ai">("presets");
  const [customMaxBudget, setCustomMaxBudget] = useState<number>(300000);
  const [allowUpsell, setAllowUpsell] = useState<boolean>(true);

  // AI curator state variables
  const [aiQuery, setAiQuery] = useState<string>("");
  const [isAiCuratorActive, setIsAiCuratorActive] = useState<boolean>(false);

  // Lead modal states
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [activeMessage, setActiveMessage] = useState("");

  // Fetch tracking ID and Supabase inventory
  useEffect(() => {
    const uid = getActiveAgUid();
    setAgUid(uid);
    logFlowInitiated("Car Match Profiler", uid);

    async function loadInventory() {
      const data = await getEstoque();
      setEstoque(data);
    }
    loadInventory();
  }, []);

  // ─── Compute smart budget ranges when inventory loads ───
  useEffect(() => {
    if (estoque.length === 0) return;

    // Só veículo à venda entra na conta. O rótulo da faixa diz "N veículos
    // disponíveis"; contando vendidos, o número não batia com o painel ao
    // vivo nem com o que a curadoria devolve no fim.
    const prices = estoque
      .filter((v) => !v.vendido)
      .map((v) => (v.preco_promocional > 0 && v.preco_promocional < v.preco_original) ? v.preco_promocional : v.preco_original)
      .filter((p) => p > 0)
      .sort((a, b) => a - b);

    if (prices.length === 0) return;

    const min = prices[0];
    const max = prices[prices.length - 1];

    const roundTo = max > 500000 ? 50000 : max > 200000 ? 25000 : 10000;
    const roundDown = (n: number) => Math.floor(n / roundTo) * roundTo;
    const roundUp = (n: number) => Math.ceil(n / roundTo) * roundTo;

    const floorMin = roundDown(min);
    const ceilMax = roundUp(max);

    const brackets: [number, number][] = [];
    const spread = ceilMax - floorMin;

    if (spread <= roundTo * 3) {
      const mid = roundDown(floorMin + spread / 2);
      brackets.push([floorMin, mid]);
      brackets.push([mid, ceilMax]);
    } else {
      const cutpoints = [
        floorMin,
        roundUp(floorMin + spread * 0.15),
        roundUp(floorMin + spread * 0.35),
        roundUp(floorMin + spread * 0.60),
        roundUp(floorMin + spread * 0.80),
        ceilMax,
      ];
      const unique = [...new Set(cutpoints)].sort((a, b) => a - b);
      for (let i = 0; i < unique.length - 1; i++) {
        brackets.push([unique[i], unique[i + 1]]);
      }
    }

    const formatShortInternal = (v: number) => {
      if (v >= 1000000) return `${(v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1)}M`;
      if (v >= 1000) return `${(v / 1000).toFixed(0)}mil`;
      return v.toLocaleString("pt-BR");
    };

    const ranges: BudgetRange[] = brackets.map(([lo, hi], idx) => {
      const count = prices.filter((p) => p >= lo && (idx === brackets.length - 1 ? p <= hi : p < hi)).length;
      const isFirst = idx === 0;
      const isLast = idx === brackets.length - 1;
      return {
        id: `range-${idx}`,
        min: lo,
        max: hi,
        title: isFirst
          ? `Até R$ ${formatShortInternal(hi)}`
          : isLast
            ? `Acima de R$ ${formatShortInternal(lo)}`
            : `R$ ${formatShortInternal(lo)} a R$ ${formatShortInternal(hi)}`,
        count,
        desc: count === 1 ? "1 veículo disponível" : `${count} veículos disponíveis`,
      };
    });

    const nonEmpty = ranges.filter((r) => r.count > 0);
    setBudgetRanges(nonEmpty.length > 0 ? nonEmpty : ranges);

    if (prices.length > 0) {
      const middlePrice = prices[Math.floor(prices.length / 2)];
      setCustomMaxBudget(Math.round(middlePrice / 10000) * 10000);
    }
  }, [estoque]);

  const confirmCustomBudget = () => {
    setAnswers((prev) => ({
      ...prev,
      budgetMin: 0,
      budgetMax: customMaxBudget
    }));
    setTimeout(() => {
      setGameState("q2");
    }, 200);
  };

  const formatObjective = (obj: AnswerState["objective"]) => {
    switch(obj) {
      case "status": return "Status, Exclusividade & Design";
      case "family": return "Conforto, Segurança & Família";
      case "efficiency": return "Tecnologia, Inovação & Eficiência";
      case "offroad": return "Força, Aventura & Capacidade";
      default: return "Não definido";
    }
  };

  const formatExperience = (exp: AnswerState["experience"]) => {
    switch(exp) {
      case "performance": return "Performance & Potência";
      case "comfort": return "Conforto Máximo & Silêncio";
      case "tech": return "Tecnologia & Conectividade";
      case "economy": return "Custo-Benefício & Baixa Manutenção";
      default: return "Não definido";
    }
  };

  const formatStyle = (style: AnswerState["style"]) => {
    switch(style) {
      case "suv": return "SUVs Imponentes";
      case "sedan": return "Sedans Elegantes";
      case "sport": return "Esportivos / Coupés";
      case "pickup": return "Picapes";
      case "open": return "Sem preferência (Aberto a sugestões)";
      default: return "Não definido";
    }
  };

  const formatTimeline = (timeline: AnswerState["timeline"]) => {
    switch(timeline) {
      case "immediate": return "Pronto para fechar negócio";
      case "researching": return "Pesquisando para os próximos 30 dias";
      case "future": return "Apenas mapeando opções";
      default: return "Não definido";
    }
  };

  const formatShort = (v: number) => {
    if (v >= 1000000) return `${(v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1)}M`;
    if (v >= 1000) return `${(v / 1000).toFixed(0)} mil`;
    return v.toLocaleString("pt-BR");
  };

  const handleShowResults = () => {
    // Voz do CLIENTE: é ele quem envia esta mensagem para a loja. A versão
    // anterior ("Vi que você montou seu perfil... Separei excelentes opções")
    // era texto de vendedor saindo da boca do cliente.
    const defaultMsg = `Olá! Montei meu perfil no Match de Garagem do site: foco em ${formatObjective(answers.objective)} e ${formatExperience(answers.experience)}, até R$ ${formatShort(answers.budgetMax)}. Quero conhecer as opções disponíveis!`;
    setActiveMessage(defaultMsg);
    setIsLeadModalOpen(true);
  };

  const handleLeadSubmit = async (leadData: { nome: string; email: string; whatsapp: string; turnstileToken?: string }) => {
    const utmParams = getUtmParameters();
    const cleanPhone = leadData.whatsapp;
    const formattedPhone = cleanPhone.length === 10 || cleanPhone.length === 11 ? "55" + cleanPhone : cleanPhone;
    const remoteJid = formattedPhone ? `${formattedPhone}@s.whatsapp.net` : "";

    // Mesma regra do defaultMsg: voz do cliente, que é quem manda o texto.
    const finalMsg = `Olá! Montei meu perfil no Match de Garagem do site buscando um veículo focado em ${formatObjective(answers.objective)}, até R$ ${formatShort(answers.budgetMax)}. Podem me mostrar as opções que se encaixam?${sufixoRef()}`;

    // Dispara telemetria de conversão (Lead) no GA4/Meta Pixel ANTES do POST,
    // para reaproveitar o mesmo event_id na deduplicação do CAPI (servidor).
    // Sem veículo específico aqui (é uma curadoria), então não há content_ids.
    const phoneE164 = formattedPhone ? `+${formattedPhone}` : null;
    const eventId = trackLeadSubmission(
      { marca: "CarMatch", modelo: "Curadoria Especial", preco: answers.budgetMax },
      finalMsg,
      {
        googleAdsId: companySettings?.googleAdsId,
        googleAdsConversionLabel: companySettings?.googleAdsConversionLabel,
        email: leadData.email,
        phoneE164,
        tipoDeLead: "curadoria",
        formId: "form-garagem-profiler",
      }
    );
    const { fbp, fbc } = getMatchParams();

    const payload = {
      remoteJid,
      telefone: formattedPhone,
      tipo: "lead_curadoria_especial",
      canal: "Garagem Match Profiler",
      mensagem: finalMsg,
      perfil_curadoria: {
        orcamento_maximo: answers.budgetMax,
        orcamento_minimo: answers.budgetMin,
        objetivo_principal: formatObjective(answers.objective),
        experiencia_valorizada: formatExperience(answers.experience),
        estilo_preferido: formatStyle(answers.style),
        urgencia: formatTimeline(answers.timeline),
        resumo_ia: isAiCuratorActive
          ? `IA Request: ${aiQuery}. Cliente focado em ${formatObjective(answers.objective)} e ${formatExperience(answers.experience)} com urgência ${formatTimeline(answers.timeline)} e budget até R$ ${formatShort(answers.budgetMax)}.`
          : `Busca: ${formatStyle(answers.style)}, foco em ${formatObjective(answers.objective)} e ${formatExperience(answers.experience)}, budget R$ ${answers.budgetMax.toLocaleString('pt-BR')}. Prazo: ${formatTimeline(answers.timeline)}.`
      },
      intencao: {
        nivel: answers.timeline === "immediate" ? "ALTO" : answers.timeline === "researching" ? "MÉDIO" : "BAIXO",
        ticket: answers.budgetMax >= 200000 ? "PREMIUM" : "NORMAL"
      },
      cliente: {
        nome: leadData.nome,
        email: leadData.email,
        whatsapp: leadData.whatsapp
      },
      utm: utmParams,
      intencao_busca: {
        aiQuery: aiQuery || "",
        budgetTab: budgetTab
      },
      agUid: agUid,
      eventId,
      eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
      fbp,
      fbc
    };

    try {
      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          turnstileToken: leadData.turnstileToken
        })
      });
    } catch (fetchError: any) {
      console.warn("[Lead Submit CarMatch] Network error (non-blocking):", fetchError.message);
    }

    try {
      const rawHistory = localStorage.getItem("ag_leads_history");
      const history = rawHistory ? JSON.parse(rawHistory) : [];
      history.push({
        agUid,
        timestamp: new Date().toISOString(),
        tipoLead: "lead_curadoria_especial",
        cliente: {
          nome: leadData.nome,
          email: leadData.email,
          whatsapp: leadData.whatsapp
        },
        perfil: payload.perfil_curadoria
      });
      localStorage.setItem("ag_leads_history", JSON.stringify(history));
    } catch (e) {
      console.warn("[Telemetry] Failed to save lead payload to history:", e);
    }

    const whatsappUrl = linkWhatsApp(companySettings, finalMsg);
    // Consequência do lead recém-registrado — ver `pos_lead` em `lib/dataLayer.ts`.
    trackContactClick("whatsapp", "CarMatch - Conversão WhatsApp", { pos_lead: true });
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  const parseFreeTextQuery = (text: string) => {
    const lower = text.toLowerCase();

    let parsedBudget = 0;
    const milMatch = lower.match(/(\d+)\s*(?:mil|k)/);
    const rawNumberMatch = lower.match(/(?:r\$)?\s*(\d{2,3})(?:\.\d{3})*(?:,00)?/);

    if (milMatch) {
      parsedBudget = parseInt(milMatch[1]) * 1000;
    } else if (rawNumberMatch) {
      const num = parseInt(rawNumberMatch[1].replace(/\./g, ""));
      if (num > 1000) parsedBudget = num;
      else if (num > 0) parsedBudget = num * 1000;
    }

    if (parsedBudget === 0) parsedBudget = 1000000;

    let obj: AnswerState["objective"] = "status";
    if (lower.includes("família") || lower.includes("familia") || lower.includes("viagem") || lower.includes("viajar") || lower.includes("filho") || lower.includes("espaço")) {
      obj = "family";
    } else if (lower.includes("cidade") || lower.includes("trabalho") || lower.includes("diário") || lower.includes("diario") || lower.includes("economia")) {
      obj = "efficiency";
    } else if (lower.includes("trilha") || lower.includes("offroad") || lower.includes("terra") || lower.includes("sítio") || lower.includes("fazenda")) {
      obj = "offroad";
    }

    let style: AnswerState["style"] = "open";
    if (lower.includes("suv") || lower.includes("4x4") || lower.includes("jeep")) {
      style = "suv";
    } else if (lower.includes("sedã") || lower.includes("sedan")) {
      style = "sedan";
    } else if (lower.includes("esportivo") || lower.includes("porsche") || lower.includes("coupé")) {
      style = "sport";
    } else if (lower.includes("picape") || lower.includes("caminhonete") || lower.includes("ram") || lower.includes("hilux")) {
      style = "pickup";
    }

    return { budgetMax: parsedBudget, objective: obj, experience: "tech" as any, style: style };
  };

  const confirmAiCuratorQuery = () => {
    if (!aiQuery.trim()) return;

    const parsed = parseFreeTextQuery(aiQuery);

    setAnswers((prev) => ({
      ...prev,
      budgetMin: 0,
      budgetMax: parsed.budgetMax,
      objective: parsed.objective,
      experience: parsed.experience,
      style: parsed.style,
      timeline: "researching"
    }));

    setIsAiCuratorActive(true);

    setTimeout(() => {
      setGameState("loading");
    }, 200);
  };

  const selectBudget = (range: BudgetRange) => {
    setAnswers((prev) => ({ ...prev, budgetMin: range.min, budgetMax: range.max }));
    setTimeout(() => { setGameState("q2"); }, 200);
  };

  const selectObjective = (objective: AnswerState["objective"]) => {
    setAnswers((prev) => ({ ...prev, objective }));
    setTimeout(() => { setGameState("q3"); }, 200);
  };

  const selectExperience = (experience: AnswerState["experience"]) => {
    setAnswers((prev) => ({ ...prev, experience }));
    setTimeout(() => { setGameState("q4"); }, 200);
  };

  const selectStyle = (style: AnswerState["style"]) => {
    setAnswers((prev) => ({ ...prev, style }));
    setTimeout(() => { setGameState("q5"); }, 200);
  };

  const selectTimeline = (timeline: AnswerState["timeline"]) => {
    setAnswers((prev) => ({ ...prev, timeline }));
    setGameState("loading");
  };

  useEffect(() => {
    if (gameState === "loading") {
      const tags = [answers.objective, answers.style, answers.experience, answers.timeline].filter(Boolean);

      let fetchCompleted = false;
      let animCompleted = false;

      const finishLoading = () => {
        if (fetchCompleted && animCompleted) {
          setGameState("results");
        }
      };

      if (typeof window !== "undefined") {
        const activeUid = getActiveAgUid();
        const telemetryPayload = {
          agUid: activeUid,
          timestamp: new Date().toISOString(),
          tipoLead: "curation_profiler",
          respostas: answers,
        };

        (window as any).ag_last_carmatch = telemetryPayload;

        fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tags,
            budget: answers.budgetMax || undefined,
            ag_uid: activeUid,
          }),
        })
          .then(res => res.json())
          .then(data => {
            if (data && data.matchedVehicles) {
              setMatchedVehicles(data.matchedVehicles);
              setResultsCount(data.count || data.matchedVehicles.length);
              // O disparo vive aqui, não no início do loading: antes ele saía
              // com results_count fixo em 0 e o GA4 registrava toda busca como
              // busca sem resultado.
              trackCarMatch(tags, data.count || data.matchedVehicles.length);
            } else {
              trackCarMatch(tags, 0);
            }
          })
          .catch((err) => {
            console.error("Failed to sync match with backend API:", err);
            trackCarMatch(tags, 0);
          })
          .finally(() => {
            fetchCompleted = true;
            finishLoading();
          });
      } else {
        fetchCompleted = true;
      }

      setLoadingPhase(0);
      const phases = 4; // 0, 1, 2, 3
      let currentPhase = 0;

      const interval = setInterval(() => {
        currentPhase++;
        if (currentPhase < phases) {
          setLoadingPhase(currentPhase);
        } else {
          clearInterval(interval);
          animCompleted = true;
          finishLoading();
        }
      }, 800);

      return () => clearInterval(interval);
    }
  }, [gameState, answers, agUid]);

  const handleReset = () => {
    setAnswers({ budgetMin: 0, budgetMax: 0, objective: "", experience: "", style: "", timeline: "" });
    setBudgetTab("presets");
    setAllowUpsell(true);
    setAiQuery("");
    setIsAiCuratorActive(false);
    setMatchedVehicles([]);
    setLoadingPhase(0);
    setGameState("intro");
  };

  const formatPrice = (value: number): string => {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  };

  const getLoadingText = () => {
    switch (loadingPhase) {
      case 0: return `Analisando ${estoque.length} veículos do estoque`;
      case 1: return `Filtrando por orçamento até R$ ${formatShort(answers.budgetMax)}`;
      case 2: return "Calculando compatibilidade de perfil";
      case 3: return "Curadoria finalizada";
      default: return "Processando";
    }
  };

  /* ──────────────────────────────────────────────────────────────────────
     Painel "seu perfil, ao vivo"

     Tudo aqui sai do estoque que já está carregado no cliente. Nada de
     percentual de compatibilidade inventado: o que se mostra é o recorte
     real do estoque diante do orçamento respondido.
     ────────────────────────────────────────────────────────────────────── */

  const estoqueCompativel = useMemo(() => {
    const disponiveis = estoque.filter((v) => !v.vendido);
    if (!answers.budgetMax) return disponiveis;
    return disponiveis.filter((v) => precoVigente(v) <= answers.budgetMax);
  }, [estoque, answers.budgetMax]);

  /** Composição por carroceria do que cabe no orçamento — dado real, não score. */
  const composicaoEstoque = useMemo(() => {
    const total = estoqueCompativel.length;
    if (total === 0) return [];

    const contagem = new Map<string, number>();
    for (const v of estoqueCompativel) {
      const chave = (v.tipo || "").trim() || "Outros";
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    }

    return [...contagem.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([tipo, quantidade]) => ({
        tipo,
        quantidade,
        percentual: Math.round((quantidade / total) * 100),
      }));
  }, [estoqueCompativel]);

  const respostasDoPainel = useMemo(() => {
    const valor = (v: string | undefined) => v ?? "";
    return [
      {
        numero: "01",
        rotulo: "ORÇAMENTO",
        valor: answers.budgetMax ? `Até R$ ${formatShort(answers.budgetMax)}` : "",
      },
      { numero: "02", rotulo: "OBJETIVO", valor: valor(OPCOES_OBJETIVO.find((o) => o.id === answers.objective)?.resumo) },
      { numero: "03", rotulo: "EXPERIÊNCIA", valor: valor(OPCOES_EXPERIENCIA.find((o) => o.id === answers.experience)?.resumo) },
      { numero: "04", rotulo: "ESTILO", valor: valor(OPCOES_ESTILO.find((o) => o.id === answers.style)?.resumo) },
      { numero: "05", rotulo: "PRAZO", valor: valor(OPCOES_PRAZO.find((o) => o.id === answers.timeline)?.resumo) },
    ];
  }, [answers]);

  const indicePergunta = PERGUNTAS.findIndex((p) => p.id === gameState);
  const emPergunta = indicePergunta >= 0;
  const restantes = emPergunta ? PERGUNTAS.length - (indicePergunta + 1) : 0;
  const mostrarPainel = gameState === "intro" || emPergunta;

  /** Volta uma pergunta; da primeira, volta para a abertura. */
  const voltarPergunta = () => {
    if (indicePergunta <= 0) {
      setGameState("intro");
      return;
    }
    setGameState(PERGUNTAS[indicePergunta - 1].id as EstadoQuiz);
  };

  const tituloBarra = (companySettings?.carMatchTitle || "Garagem Profiler").toUpperCase();

  return (
    <section
      id="match-garagem"
      aria-label="Garagem Profiler"
      className="flex flex-col bg-mt-inverso-fundo font-modernist text-mt-inverso lg:min-h-[840px] lg:flex-row lg:items-stretch"
    >
      {/* ─────────── Coluna do fluxo ─────────── */}
      <div className="flex min-w-0 flex-1 flex-col px-[18px] py-8 lg:px-14 lg:py-11">
        <div className="flex items-center gap-3.5">
          <span className="h-6 w-2 shrink-0 bg-mt-accent" aria-hidden="true" />
          <span className="text-[13px] font-extrabold tracking-[.02em] lg:text-[15px]">
            {tituloBarra}
          </span>
          <Link
            href="/"
            className="mt-foco ml-auto text-[11px] tracking-[.1em] text-mt-inverso-suave no-underline transition-colors hover:text-mt-inverso lg:text-xs"
          >
            SAIR
          </Link>
        </div>

        {/* ─── Abertura ─── */}
        {gameState === "intro" && (
          <div className="mt-10 flex flex-1 flex-col lg:mt-12">
            <div className="max-w-[640px]">
              <Rotulo accent className="text-[11px] tracking-[.18em]">
                CONSULTORIA
              </Rotulo>
              <h1 className="mt-display m-0 mt-5 text-[38px] text-mt-inverso lg:text-[66px]">
                Cinco perguntas até o carro certo.
              </h1>
              <p className="m-0 mt-5 max-w-[520px] text-sm leading-relaxed text-mt-inverso-suave lg:text-base">
                Cruzamos suas respostas com o estoque e um consultor envia três
                sugestões reais no WhatsApp — com fotos, laudo e parcela.
              </p>
            </div>

            <div className="mt-9 flex border-t-2 border-mt-inverso-regua pt-4 lg:mt-11">
              {[
                { valor: "05", rotulo: "PERGUNTAS" },
                { valor: "30s", rotulo: "PARA RESPONDER" },
                { valor: estoque.length > 0 ? String(estoque.length) : "—", rotulo: "VEÍCULOS ANALISADOS" },
              ].map((item) => (
                <div key={item.rotulo} className="flex-1">
                  <div className="text-[28px] font-extrabold leading-none lg:text-[34px]">
                    {item.valor}
                  </div>
                  <div className="mt-1 text-[10px] font-semibold tracking-[.14em] text-mt-inverso-suave">
                    {item.rotulo}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-9 lg:mt-auto lg:pt-11">
              <button
                type="button"
                onClick={() => setGameState("q1")}
                className="mt-btn mt-btn-primario mt-foco"
              >
                INICIAR CURADORIA
                <Seta size={15} />
              </button>
            </div>
          </div>
        )}

        {/* ─── Perguntas ─── */}
        {emPergunta && (
          <>
            <ReguaProgresso indice={indicePergunta} />

            {/* 01 — Orçamento */}
            {gameState === "q1" && (
              <div className="flex flex-1 flex-col">
                <h2 className="mt-display m-0 mt-9 max-w-[640px] text-[30px] text-mt-inverso lg:mt-11 lg:text-[52px]">
                  Qual a faixa de investimento para a próxima garagem?
                </h2>

                {/* Modo de responder: faixa pronta, valor exato ou texto livre */}
                <div className="mt-8 flex w-max border-2 border-mt-inverso-regua">
                  {([
                    { id: "presets", rotulo: "FAIXA" },
                    { id: "custom", rotulo: "VALOR EXATO" },
                    { id: "ai", rotulo: "DESCREVER" },
                  ] as const).map((aba, i) => (
                    <button
                      key={aba.id}
                      type="button"
                      onClick={() => setBudgetTab(aba.id)}
                      className={`mt-foco px-5 py-3 text-[11px] font-extrabold tracking-[.08em] transition-colors lg:px-7 lg:text-[13px] ${
                        i > 0 ? "border-l-2 border-mt-inverso-regua" : ""
                      } ${
                        budgetTab === aba.id
                          ? "bg-mt-accent text-mt-inverso"
                          : "text-mt-inverso-suave hover:text-mt-inverso"
                      }`}
                    >
                      {aba.rotulo}
                    </button>
                  ))}
                </div>

                {budgetTab === "presets" && (
                  <div className="mt-6 grid gap-0.5 md:grid-cols-2">
                    {budgetRanges.length > 0
                      ? budgetRanges.map((range, i) => (
                          <OpcaoQuiz
                            key={range.id}
                            letra={String.fromCharCode(65 + i)}
                            titulo={range.title}
                            desc={range.desc}
                            selecionada={answers.budgetMax === range.max && answers.budgetMin === range.min}
                            onClick={() => selectBudget(range)}
                          />
                        ))
                      : Array.from({ length: 4 }).map((_, i) => (
                          <div
                            key={i}
                            className="h-[86px] border-2 border-mt-inverso-regua-fina"
                            aria-hidden="true"
                          />
                        ))}
                  </div>
                )}

                {budgetTab === "custom" && (
                  <div className="mt-6 max-w-[560px] border-2 border-mt-inverso-regua-fina p-6 lg:p-8">
                    <Rotulo className="text-[10px] tracking-[.16em] text-mt-inverso-suave">
                      LIMITE DE INVESTIMENTO
                    </Rotulo>
                    <div className="mt-2 text-[38px] font-extrabold tracking-[-.04em] lg:text-[46px]">
                      {formatPrice(customMaxBudget)}
                    </div>
                    <input
                      type="range"
                      min={100000}
                      max={1000000}
                      step={20000}
                      value={customMaxBudget}
                      onChange={(e) => setCustomMaxBudget(Number(e.target.value))}
                      aria-label="Limite de investimento"
                      className="mt-range mt-foco mt-6 [--mt-range-trilho:var(--mt-inverso-regua)]"
                    />
                    <button
                      type="button"
                      onClick={confirmCustomBudget}
                      className="mt-btn mt-btn-primario mt-foco mt-7"
                    >
                      CONFIRMAR
                      <Seta size={15} />
                    </button>
                  </div>
                )}

                {budgetTab === "ai" && (
                  <div className="mt-6 max-w-[560px] border-2 border-mt-inverso-regua-fina p-6 lg:p-8">
                    <Rotulo className="text-[10px] tracking-[.16em] text-mt-inverso-suave">
                      DESCREVA O QUE VOCÊ PROCURA
                    </Rotulo>
                    <textarea
                      value={aiQuery}
                      onChange={(e) => setAiQuery(e.target.value)}
                      placeholder="Ex.: um SUV para a família, até R$ 350 mil, para viagens de estrada"
                      rows={3}
                      aria-label="Descreva o que você procura"
                      className="mt-campo mt-foco mt-4 resize-none border-b-2 border-mt-inverso-regua bg-transparent pb-3 text-mt-inverso placeholder:text-mt-inverso-suave"
                    />
                    <button
                      type="button"
                      onClick={confirmAiCuratorQuery}
                      disabled={!aiQuery.trim()}
                      className="mt-btn mt-btn-primario mt-foco mt-6"
                    >
                      MONTAR PERFIL
                      <Seta size={15} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 02 — Objetivo */}
            {gameState === "q2" && (
              <BlocoPergunta
                titulo="Qual o principal objetivo na sua próxima compra?"
                opcoes={OPCOES_OBJETIVO}
                selecionado={answers.objective}
                onSelecionar={(id) => selectObjective(id as AnswerState["objective"])}
              />
            )}

            {/* 03 — Experiência */}
            {gameState === "q3" && (
              <BlocoPergunta
                titulo="O que você mais valoriza ao dirigir?"
                opcoes={OPCOES_EXPERIENCIA}
                selecionado={answers.experience}
                onSelecionar={(id) => selectExperience(id as AnswerState["experience"])}
              />
            )}

            {/* 04 — Estilo */}
            {gameState === "q4" && (
              <BlocoPergunta
                titulo="Qual carroceria mais atrai você hoje?"
                opcoes={OPCOES_ESTILO}
                selecionado={answers.style}
                onSelecionar={(id) => selectStyle(id as AnswerState["style"])}
              />
            )}

            {/* 05 — Prazo */}
            {gameState === "q5" && (
              <BlocoPergunta
                titulo="Qual o seu prazo ideal para fechar negócio?"
                opcoes={OPCOES_PRAZO}
                selecionado={answers.timeline}
                onSelecionar={(id) => selectTimeline(id as AnswerState["timeline"])}
              />
            )}

            {/* Navegação. Não há "PRÓXIMA": escolher uma opção já avança, que
                é como o fluxo sempre funcionou em produção. */}
            <div className="mt-8 flex flex-wrap items-center gap-5 lg:mt-9">
              <button
                type="button"
                onClick={voltarPergunta}
                className="mt-btn mt-foco border-2 border-mt-inverso-regua text-mt-neutral-300"
              >
                VOLTAR
              </button>
              {restantes > 0 && (
                <span className="text-xs text-mt-inverso-suave">
                  {restantes === 1 ? "Falta 1 pergunta" : `Faltam ${restantes} perguntas`} · ~
                  {restantes * SEGUNDOS_POR_PERGUNTA}s
                </span>
              )}
            </div>
          </>
        )}

        {/* ─── Processando ─── */}
        {gameState === "loading" && (
          <div className="flex flex-1 flex-col justify-center py-16 lg:py-24">
            <Rotulo accent className="text-[11px] tracking-[.18em]">
              CURADORIA EM ANDAMENTO
            </Rotulo>
            <p
              aria-live="polite"
              className="mt-display m-0 mt-5 max-w-[720px] text-[26px] text-mt-inverso lg:text-[44px]"
            >
              {getLoadingText()}
            </p>
            <div className="mt-9 h-0.5 max-w-[560px] bg-mt-inverso-regua-fina">
              <div
                className="h-0.5 bg-mt-accent transition-[width] duration-700 ease-linear"
                style={{ width: `${((loadingPhase + 1) / 4) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* ─── Resultado ─── */}
        {gameState === "results" && (
          <div className="mt-9 flex flex-1 flex-col lg:mt-11">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-inverso-regua pb-4">
              <div>
                <Rotulo accent className="text-[11px] tracking-[.18em]">
                  CURADORIA COMPLETA
                </Rotulo>
                <h2 className="mt-titulo m-0 mt-2.5 text-3xl text-mt-inverso lg:text-[46px]">
                  {matchedVehicles.length === 1
                    ? "1 veículo compatível"
                    : `${matchedVehicles.length} veículos compatíveis`}
                </h2>
              </div>
            </div>

            {matchedVehicles.length > 0 ? (
              <div className="mt-8 grid gap-x-7 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
                {matchedVehicles.map((car) => (
                  <div key={car.id} className="text-mt-inverso [&_.border-mt-regua]:border-mt-inverso-regua [&_.border-mt-regua-fina]:border-mt-inverso-regua-fina">
                    <CardVeiculo
                      veiculo={car}
                      href={getVeiculoPdpUrl(car)}
                      etiqueta={car.matchScore ? `${car.matchScore}% COMPATÍVEL` : undefined}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-8 max-w-[620px] border-2 border-mt-inverso-regua-fina p-6 lg:p-8">
                <p className="m-0 text-lg font-extrabold leading-tight lg:text-[22px]">
                  Nenhum veículo do estoque bate com esse perfil agora.
                </p>
                <p className="m-0 mt-3 text-[13px] leading-relaxed text-mt-inverso-suave">
                  O perfil vai para o consultor do mesmo jeito: a busca continua
                  na nossa rede de parceiros e você recebe as opções no WhatsApp.
                </p>
              </div>
            )}

            <div className="mt-10 flex flex-wrap gap-0.5 lg:mt-12">
              <button
                type="button"
                onClick={handleShowResults}
                className="mt-btn mt-btn-primario mt-foco"
              >
                FALAR COM UM CONSULTOR
                <Seta size={15} />
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="mt-btn mt-foco border-2 border-mt-inverso-regua text-mt-neutral-300"
              >
                REFAZER CURADORIA
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─────────── Painel: o perfil se formando ─────────── */}
      {mostrarPainel && (
        <aside
          aria-label="Seu perfil, ao vivo"
          className="flex shrink-0 flex-col bg-mt-bg px-[18px] py-8 text-mt-ink lg:w-[456px] lg:px-10 lg:py-11"
        >
          <Rotulo accent className="text-[11px] tracking-[.18em]">
            SEU PERFIL, AO VIVO
          </Rotulo>
          <h2 className="mt-titulo m-0 mt-3 text-[28px] lg:text-4xl">
            Curadoria em formação
          </h2>

          <div className="mt-6 border-t-2 border-mt-regua lg:mt-7">
            {respostasDoPainel.map((r) => (
              <div
                key={r.numero}
                className="flex items-center gap-3.5 border-b border-mt-regua-fina py-3.5"
              >
                <span className="w-5 text-[11px] font-extrabold tracking-[.1em] text-mt-neutral-600">
                  {r.numero}
                </span>
                <span className="w-[104px] shrink-0 text-[11px] tracking-[.06em] text-mt-neutral-600 lg:text-xs">
                  {r.rotulo}
                </span>
                <span
                  className={`ml-auto text-right text-sm font-extrabold ${
                    r.valor ? "text-mt-accent" : "text-mt-neutral-500"
                  }`}
                >
                  {r.valor || "a responder"}
                </span>
              </div>
            ))}
          </div>

          {composicaoEstoque.length > 0 && (
            <div className="mt-8">
              <Rotulo className="text-[11px] tracking-[.16em]">
                {answers.budgetMax
                  ? "O QUE CABE NO SEU ORÇAMENTO"
                  : "COMPOSIÇÃO DO ESTOQUE"}
              </Rotulo>
              <div className="mt-3.5 flex flex-col gap-3.5">
                {composicaoEstoque.map((linha) => (
                  <div key={linha.tipo}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="text-sm font-extrabold tracking-[-.01em]">
                        {linha.tipo}
                      </span>
                      <span className="text-[13px] font-extrabold text-mt-accent">
                        {linha.percentual}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-mt-neutral-300">
                      <div
                        className="h-1.5 bg-mt-accent transition-[width] duration-300"
                        style={{ width: `${linha.percentual}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="m-0 mt-3 text-[11px] leading-relaxed text-mt-neutral-600">
                Participação por carroceria entre os veículos disponíveis — não é
                nota de compatibilidade.
              </p>
            </div>
          )}

          <div className="mt-8 border-t-2 border-mt-regua pt-5 lg:mt-auto">
            <p className="m-0 text-[13px] leading-relaxed text-mt-neutral-800">
              Ao final, seu perfil vai para o consultor e você recebe{" "}
              <strong>3 sugestões reais do estoque</strong> no WhatsApp.
            </p>
            {estoqueCompativel.length > 0 && (
              <div className="mt-3.5 flex items-center gap-2.5">
                <span className="mt-pulso h-2 w-2 shrink-0 bg-mt-accent" aria-hidden="true" />
                <span className="text-[11px] tracking-[.1em] text-mt-neutral-600">
                  {estoqueCompativel.length}{" "}
                  {answers.budgetMax ? "VEÍCULOS COMPATÍVEIS AGORA" : "VEÍCULOS EM ESTOQUE"}
                </span>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Lead Capture Modal */}
      <LeadCaptureModal
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        onSubmit={handleLeadSubmit}
      />
    </section>
  );
}

/**
 * Perguntas 02 a 05: título grande e a grade de opções.
 * A 01 fica fora porque tem três modos de resposta.
 */
function BlocoPergunta({
  titulo,
  opcoes,
  selecionado,
  onSelecionar,
}: {
  titulo: string;
  opcoes: readonly { id: string; letra: string; titulo: string; desc: string }[];
  selecionado: string;
  onSelecionar: (id: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <h2 className="mt-display m-0 mt-9 max-w-[640px] text-[30px] text-mt-inverso lg:mt-11 lg:text-[52px]">
        {titulo}
      </h2>
      <div className="mt-8 grid gap-0.5 md:grid-cols-2 lg:mt-auto">
        {opcoes.map((opcao) => (
          <OpcaoQuiz
            key={opcao.id}
            letra={opcao.letra}
            titulo={opcao.titulo}
            desc={opcao.desc}
            selecionada={selecionado === opcao.id}
            onClick={() => onSelecionar(opcao.id)}
          />
        ))}
      </div>
    </div>
  );
}
