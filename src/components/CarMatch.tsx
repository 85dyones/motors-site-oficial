"use client";

import { useState, useEffect } from "react";
import { getEstoque, Veiculo } from "../lib/supabase";
import { logFlowInitiated, getActiveAgUid, getUtmParameters, trackCarMatch, trackLeadSubmission, trackContactClick } from "../lib/telemetry";
import { getMatchParams } from "../lib/tracking-identity";
import LeadCaptureModal from "./LeadCaptureModal";
import { useTheme } from "../app/ThemeContext";

interface AnswerState {
  budgetMin: number;
  budgetMax: number;
  objective: "status" | "family" | "efficiency" | "offroad" | "";
  experience: "performance" | "comfort" | "tech" | "economy" | "";
  style: "suv" | "sedan" | "sport" | "pickup" | "open" | "";
  timeline: "immediate" | "researching" | "future" | "";
}

const getVeiculoPdpUrl = (car: any) => {
  const slug = `${car.marca}-${car.modelo}-${car.versao}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `/veiculo/${slug}-${car.id}`;
};

export default function CarMatch() {
  const { companySettings } = useTheme();
  const [gameState, setGameState] = useState<"intro" | "q1" | "q2" | "q3" | "q4" | "q5" | "loading" | "results">("intro");
  const [answers, setAnswers] = useState<AnswerState>({ budgetMin: 0, budgetMax: 0, objective: "", experience: "", style: "", timeline: "" });
  const [estoque, setEstoque] = useState<Veiculo[]>([]);
  const [agUid, setAgUid] = useState("ag_ref_nao_localizado");

  // New States
  const [matchedVehicles, setMatchedVehicles] = useState<any[]>([]);
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

    const prices = estoque
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
      case "pickup": return "Picapes Premium";
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
    const defaultMsg = `Olá! Vi que você montou seu perfil no nosso Match de Garagem buscando um veículo (foco em ${formatObjective(answers.objective)} e ${formatExperience(answers.experience)}) até R$ ${formatShort(answers.budgetMax)}. Gostaria de conhecer as opções disponíveis?`;
    setActiveMessage(defaultMsg);
    setIsLeadModalOpen(true);
  };

  const handleLeadSubmit = async (leadData: { nome: string; email: string; whatsapp: string; turnstileToken?: string }) => {
    const utmParams = getUtmParameters();
    const cleanPhone = leadData.whatsapp;
    const formattedPhone = cleanPhone.length === 10 || cleanPhone.length === 11 ? "55" + cleanPhone : cleanPhone;
    const remoteJid = formattedPhone ? `${formattedPhone}@s.whatsapp.net` : "";

    const finalMsg = `Olá! Vi que você montou seu perfil no nosso Match de Garagem buscando um veículo focado em ${formatObjective(answers.objective)} até R$ ${formatShort(answers.budgetMax)}. Separei excelentes opções para o seu perfil. Podemos conversar?`;

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
        phoneE164
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

    const whatsappUrl = `https://wa.me/${companySettings?.whatsappRaw || ""}?text=${encodeURIComponent(finalMsg)}`;
    trackContactClick("whatsapp", "CarMatch - Conversão WhatsApp");
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
      trackCarMatch(tags, 0);
      
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
            }
          })
          .catch((err) => console.error("Failed to sync match with backend API:", err))
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

  const renderProgressBar = () => {
    if (["intro", "loading", "results"].includes(gameState)) return null;

    const steps = [
      { id: "q1", label: "💰 Orçamento" },
      { id: "q2", label: "🎯 Motivação" },
      { id: "q3", label: "🏎️ Experiência" },
      { id: "q4", label: "🎨 Estilo" },
      { id: "q5", label: "⏰ Momento" }
    ];

    const currentIndex = steps.findIndex(s => s.id === gameState);

    return (
      <div className="flex flex-col mb-6">
        <div className="flex items-center justify-between relative px-2">
          <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-brand-card-border -z-10" />
          {steps.map((step, index) => {
            const isCompleted = index < currentIndex;
            const isCurrent = index === currentIndex;
            return (
              <div key={step.id} className="flex flex-col items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs border-2 transition-colors ${
                  isCompleted ? "bg-brand-primary border-brand-primary text-white" :
                  isCurrent ? "bg-brand-primary border-brand-primary text-white scale-110" :
                  "bg-brand-card border-brand-card-border text-brand-text/30"
                }`}>
                  {isCompleted ? "✓" : index + 1}
                </div>
                <span className={`hidden md:block text-[10px] uppercase font-bold tracking-wider mt-1 ${isCurrent ? "text-brand-primary" : "text-brand-text/40"}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const getLoadingText = () => {
    switch (loadingPhase) {
      case 0: return `Analisando ${estoque.length} veículos do estoque...`;
      case 1: return `Filtrando por orçamento até R$ ${formatShort(answers.budgetMax)}...`;
      case 2: return "Calculando compatibilidade de perfil...";
      case 3: return "Curadoria finalizada!";
      default: return "Processando...";
    }
  };

  return (
    <section id="match-garagem" aria-label="Match de Garagem" className="flex flex-col gap-4 w-full">
      <div className="text-center flex flex-col gap-1.5 px-4 sm:px-6">
        <span className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">
          Consultoria Especializada
        </span>
        <h2 className="text-2xl font-black text-brand-text tracking-tight">
          {companySettings?.carMatchTitle || "Garagem Profiler"}
        </h2>
        <p className="text-xs text-brand-text/50 max-w-xs mx-auto">
          Traçaremos seu perfil ideal para que nossos consultores apresentem apenas as opções mais exclusivas.
        </p>
      </div>
      <div className="w-full bg-brand-card border border-brand-card-border rounded-3xl p-5 md:p-8 shadow-[0_8px_30px_var(--brand-shadow)] relative overflow-hidden transition-all duration-300">
        <div className="absolute -left-16 -top-16 h-36 w-36 rounded-full bg-brand-primary/5 blur-[50px] pointer-events-none" />
        <div className="absolute -right-16 -bottom-16 h-36 w-36 rounded-full bg-brand-primary/5 blur-[50px] pointer-events-none" />

        {renderProgressBar()}

        {/* INTRO */}
        {gameState === "intro" && (
          <div className="flex flex-col items-center text-center py-4 px-2 animate-fadeIn">
            <div className="h-12 w-12 bg-brand-primary/10 border border-brand-primary/30 rounded-full flex items-center justify-center mb-4 text-brand-gold shadow-[0_0_20px_rgba(197,168,128,0.15)] relative">
              <span className="absolute animate-ping h-8 w-8 rounded-full bg-brand-primary/5 opacity-75" />
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            </div>
            
            <div className="flex gap-2 items-center justify-center text-[10px] text-brand-text/60 font-bold uppercase tracking-wider mb-6 flex-wrap">
              <span className="bg-brand-bg px-2 py-1 rounded-md border border-brand-card-border">⚡ 5 perguntas</span>
              <span className="bg-brand-bg px-2 py-1 rounded-md border border-brand-card-border">⏱️ 30 segundos</span>
              <span className="bg-brand-bg px-2 py-1 rounded-md border border-brand-card-border">🚗 Resultados reais</span>
            </div>

            <p className="text-xs text-brand-text/50 leading-relaxed mb-6 max-w-sm">
              Nossa inteligência analisa suas respostas para gerar um perfil de curadoria detalhado. Nossos especialistas usarão esse perfil para enviar as melhores sugestões diretamente no seu WhatsApp.
            </p>
            <button
              type="button"
              onClick={() => setGameState("q1")}
              className="w-full max-w-xs h-12 bg-gradient-to-r from-brand-primary to-brand-primary-hover text-white font-extrabold text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-[#c5a880]/15 hover:opacity-95 active:scale-95 transition-all duration-300 flex items-center justify-center gap-2"
            >
              Iniciar Curadoria
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.22 5.03a.75.75 0 1 1 1.06-1.06l5.5 5.5a.75.75 0 0 1 0 1.06l-5.5 5.5a.75.75 0 1 1-1.06-1.06l4.168-4.17H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}

        {/* QUESTION 1: Budget */}
        {gameState === "q1" && (
          <div className="flex flex-col gap-5 animate-fadeIn">
            <h3 className="text-base font-extrabold text-brand-text text-center md:text-left leading-tight">
              Qual a faixa de investimento desejada para sua nova máquina?
            </h3>

            <div className="flex bg-brand-bg p-1 rounded-xl border border-brand-card-border gap-1">
              <button type="button" onClick={() => setBudgetTab("presets")} className={`flex-1 py-2.5 text-center rounded-lg uppercase text-xs tracking-wider transition-all duration-200 font-bold ${budgetTab === "presets" ? "bg-brand-primary text-white shadow-md border border-brand-primary" : "text-brand-text/50 hover:bg-brand-card/50"}`}>
                Rápido
              </button>
              <button type="button" onClick={() => setBudgetTab("custom")} className={`flex-1 py-2.5 text-center rounded-lg uppercase text-xs tracking-wider transition-all duration-200 font-bold ${budgetTab === "custom" ? "bg-brand-primary text-white shadow-md border border-brand-primary" : "text-brand-text/50 hover:bg-brand-card/50"}`}>
                Exato
              </button>
              <button type="button" onClick={() => setBudgetTab("ai")} className={`flex-1 py-2.5 text-center rounded-lg uppercase text-xs tracking-wider transition-all duration-200 font-bold ${budgetTab === "ai" ? "bg-brand-primary text-white shadow-md border border-brand-primary" : "text-brand-text/50 hover:bg-brand-card/50"}`}>
                IA
              </button>
            </div>

            {budgetTab === "presets" && (
              <div className="grid grid-cols-1 gap-3 animate-fadeIn">
                {budgetRanges.length > 0 ? (
                  budgetRanges.map((range) => (
                    <button key={range.id} type="button" onClick={() => selectBudget(range)} className="w-full min-h-[56px] py-3.5 px-4 text-left rounded-xl bg-brand-card border border-brand-border hover:bg-brand-bg hover:border-brand-primary transition-all duration-200 flex items-center justify-between shadow-sm">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-extrabold text-brand-text">{range.title}</span>
                        <span className="text-[10px] text-brand-text/40">{range.desc}</span>
                      </div>
                    </button>
                  ))
                ) : (
                  Array.from({ length: 3 }).map((_, i) => <div key={i} className="w-full h-[56px] bg-brand-bg border border-brand-card-border rounded-xl animate-pulse" />)
                )}
              </div>
            )}

            {budgetTab === "custom" && (
              <div className="flex flex-col gap-4 p-4 bg-brand-bg/30 border border-brand-card-border rounded-2xl animate-fadeIn">
                <div className="text-center py-2 flex flex-col gap-1">
                  <span className="text-brand-text/40 font-thin uppercase text-xs tracking-wider">Limite de Investimento</span>
                  <span className="text-2xl md:text-3xl font-black text-brand-gold">{formatPrice(customMaxBudget)}</span>
                </div>
                <div className="px-2 flex flex-col gap-2">
                  <input type="range" min={100000} max={1000000} step={20000} value={customMaxBudget} onChange={(e) => setCustomMaxBudget(Number(e.target.value))} className="w-full h-2 bg-brand-bg rounded-lg appearance-none cursor-pointer accent-brand-primary border border-brand-card-border" />
                </div>
                <button type="button" onClick={confirmCustomBudget} className="w-full h-11 bg-gradient-to-r from-brand-primary to-brand-primary-hover text-white font-extrabold text-[11px] uppercase tracking-wider rounded-xl shadow-md transition-all mt-2">
                  Confirmar
                </button>
              </div>
            )}

            {budgetTab === "ai" && (
              <div className="flex flex-col gap-4 p-4 bg-brand-bg/30 border border-brand-card-border rounded-2xl animate-fadeIn">
                <textarea value={aiQuery} onChange={(e) => setAiQuery(e.target.value)} placeholder="EX: QUERO UM SUV PARA A FAMÍLIA ATÉ R$ 600 MIL..." rows={3} className="w-full p-3 bg-brand-card text-brand-text border border-brand-card-border rounded-xl focus:border-brand-primary text-xs outline-none resize-none font-thin uppercase" />
                <button type="button" onClick={confirmAiCuratorQuery} disabled={!aiQuery.trim()} className={`w-full h-11 bg-gradient-to-r from-brand-primary to-brand-primary-hover text-white font-thin uppercase text-xs rounded-xl shadow-md ${!aiQuery.trim() ? "opacity-50" : "cursor-pointer"}`}>
                  CONSULTAR IA
                </button>
              </div>
            )}

            <button type="button" onClick={handleReset} className="text-xs text-brand-text/40 hover:text-gray-700 transition-colors self-center font-bold mt-2 py-1 underline">
              Cancelar
            </button>
          </div>
        )}

        {/* QUESTION 2: Objective */}
        {gameState === "q2" && (
          <div className="flex flex-col gap-5 animate-fadeIn">
            <h3 className="text-base font-extrabold text-brand-text text-center md:text-left leading-tight">
              Qual o principal objetivo na sua próxima compra?
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {[
                { id: "family", emoji: "👨‍👩‍👧‍👦", title: "Conforto, Segurança & Família", desc: "Viagens seguras e bastante espaço." },
                { id: "status", emoji: "💎", title: "Status, Exclusividade & Design", desc: "Design imponente e presença única." },
                { id: "efficiency", emoji: "⚡", title: "Tecnologia, Inovação & Eficiência", desc: "Uso urbano inteligente." },
                { id: "offroad", emoji: "🏔️", title: "Força, Aventura & Capacidade", desc: "Capacidade offroad ou para trabalho pesado." }
              ].map((opt) => (
                <button key={opt.id} type="button" onClick={() => selectObjective(opt.id as any)} className="flex items-center w-full text-left p-4 rounded-xl bg-brand-card border border-brand-border hover:bg-brand-bg hover:border-brand-primary transition-all duration-200">
                  <span className="text-xl mr-3">{opt.emoji}</span>
                  <div>
                    <div className="text-xs font-extrabold text-brand-text mb-1">{opt.title}</div>
                    <div className="text-[10px] text-brand-text/40 leading-relaxed">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* QUESTION 3: Experience */}
        {gameState === "q3" && (
          <div className="flex flex-col gap-5 animate-fadeIn">
            <h3 className="text-base font-extrabold text-brand-text text-center md:text-left leading-tight">
              O que você mais valoriza ao dirigir?
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {[
                { id: "performance", emoji: "🏎️", title: "Performance & Potência", desc: "Aceleração rápida e dinâmica afiada." },
                { id: "comfort", emoji: "🛋️", title: "Conforto Máximo & Silêncio", desc: "Isolamento acústico e rodar suave." },
                { id: "tech", emoji: "📱", title: "Tecnologia & Conectividade", desc: "Telas avançadas e sistemas de assistência." },
                { id: "economy", emoji: "💰", title: "Custo-Benefício & Manutenção", desc: "Economia no dia a dia e liquidez." }
              ].map((opt) => (
                <button key={opt.id} type="button" onClick={() => selectExperience(opt.id as any)} className="flex items-center w-full text-left p-4 rounded-xl bg-brand-card border border-brand-border hover:bg-brand-bg hover:border-brand-primary transition-all duration-200">
                  <span className="text-xl mr-3">{opt.emoji}</span>
                  <div>
                    <div className="text-xs font-extrabold text-brand-text mb-1">{opt.title}</div>
                    <div className="text-[10px] text-brand-text/40 leading-relaxed">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* QUESTION 4: Style */}
        {gameState === "q4" && (
          <div className="flex flex-col gap-5 animate-fadeIn">
            <h3 className="text-base font-extrabold text-brand-text text-center md:text-left leading-tight">
              Qual o estilo de carroceria que mais atrai você hoje?
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { id: "suv", emoji: "🚙", title: "SUVs Imponentes" },
                { id: "sedan", emoji: "🚗", title: "Sedans Elegantes" },
                { id: "sport", emoji: "🏁", title: "Esportivos / Coupés" },
                { id: "pickup", emoji: "🛻", title: "Picapes Premium" },
                { id: "open", emoji: "🎲", title: "Aberto a Sugestões" }
              ].map((opt) => (
                <button key={opt.id} type="button" onClick={() => selectStyle(opt.id as any)} className="flex items-center w-full text-left p-4 rounded-xl bg-brand-card border border-brand-border hover:bg-brand-bg hover:border-brand-primary transition-all duration-200">
                  <span className="text-xl mr-3">{opt.emoji}</span>
                  <div className="text-xs font-extrabold text-brand-text">{opt.title}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* QUESTION 5: Timeline */}
        {gameState === "q5" && (
          <div className="flex flex-col gap-5 animate-fadeIn">
            <h3 className="text-base font-extrabold text-brand-text text-center md:text-left leading-tight">
              Qual o seu prazo ideal para fechar o negócio?
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {[
                { id: "immediate", emoji: "🔥", title: "Imediato", desc: "Pronto para fechar negócio nas próximas semanas." },
                { id: "researching", emoji: "🔍", title: "Pesquisando", desc: "Mapeando opções para compra no próximo mês." },
                { id: "future", emoji: "☕", title: "Apenas Sondando", desc: "Acompanhando o mercado sem pressa." }
              ].map((opt) => (
                <button key={opt.id} type="button" onClick={() => selectTimeline(opt.id as any)} className="flex items-center w-full text-left p-4 rounded-xl bg-brand-card border border-brand-border hover:bg-brand-bg hover:border-brand-primary transition-all duration-200">
                  <span className="text-xl mr-3">{opt.emoji}</span>
                  <div>
                    <div className="text-xs font-extrabold text-brand-text mb-1">{opt.title}</div>
                    <div className="text-[10px] text-brand-text/40 leading-relaxed">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* LOADING */}
        {gameState === "loading" && (
          <div className="flex flex-col items-center justify-center py-16 animate-pulse">
            <div className="relative h-16 w-16 mb-6">
              <div className="absolute inset-0 border-t-2 border-brand-primary rounded-full animate-spin"></div>
              <div className="absolute inset-2 border-r-2 border-brand-gold rounded-full animate-spin direction-reverse"></div>
            </div>
            <span className="text-sm font-extrabold text-brand-text mb-2 tracking-widest uppercase text-center">
              {getLoadingText()}
            </span>
            
            <div className="w-full max-w-xs bg-brand-bg rounded-full h-1.5 mt-4 overflow-hidden border border-brand-card-border">
              <div 
                className="bg-brand-primary h-1.5 rounded-full transition-all duration-800 ease-linear"
                style={{ width: `${(loadingPhase / 3) * 100}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* RESULTS */}
        {gameState === "results" && (
          <div className="flex flex-col py-2 px-1 animate-fadeIn w-full">
            <div className="flex items-center justify-center mb-6">
              <h3 className="text-lg md:text-xl font-black text-brand-text text-center">
                ✅ Curadoria Completa
                <span className="block text-xs font-normal text-brand-text/60 mt-1">
                  {matchedVehicles.length} {matchedVehicles.length === 1 ? "veículo compatível encontrado" : "veículos compatíveis encontrados"}
                </span>
              </h3>
            </div>

            {matchedVehicles.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {matchedVehicles.map((car: any) => (
                  <a key={car.id} href={getVeiculoPdpUrl(car)} className="group bg-brand-bg rounded-xl border border-brand-card-border overflow-hidden hover:border-brand-primary transition-colors flex flex-col relative">
                    <div className="relative h-36 w-full overflow-hidden bg-brand-card">
                      <img 
                        src={car.whatsapp_images?.[0] || car.web_full_images?.[0] || "/placeholder-car.jpg"} 
                        alt={`${car.marca} ${car.modelo}`} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      {car.matchScore && (
                        <div className="absolute top-2 right-2 bg-gradient-to-br from-green-500 to-green-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg border border-green-400/30">
                          {car.matchScore}% Match
                        </div>
                      )}
                    </div>
                    <div className="p-3 flex flex-col flex-1">
                      <span className="text-[10px] text-brand-text/50 uppercase tracking-widest font-bold mb-0.5">
                        {car.marca} • {car.ano_fabricacao}/{car.ano_modelo}
                      </span>
                      <h4 className="text-sm font-black text-brand-text leading-tight mb-1">
                        {car.modelo}
                      </h4>
                      <p className="text-[10px] text-brand-text/60 line-clamp-1 mb-2">
                        {car.versao}
                      </p>
                      <div className="mt-auto pt-2 border-t border-brand-card-border/50">
                        <span className="text-sm font-black text-brand-primary">
                          {formatPrice(car.preco_promocional > 0 ? car.preco_promocional : car.preco_original)}
                        </span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-center bg-brand-bg p-6 rounded-xl border border-brand-card-border mb-8">
                <span className="text-3xl mb-3 block">👀</span>
                <p className="text-sm text-brand-text font-bold mb-2">
                  Não encontramos veículos exatos para esse perfil no momento.
                </p>
                <p className="text-xs text-brand-text/60 max-w-md mx-auto">
                  Mas nossos especialistas podem localizar opções exclusivas para você em nossa rede de parceiros premium.
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-lg mx-auto">
              <button
                onClick={handleShowResults}
                className="flex-1 h-12 bg-gradient-to-r from-brand-primary to-brand-primary-hover text-white font-extrabold text-xs uppercase tracking-widest rounded-xl shadow-lg hover:opacity-95 active:scale-95 transition-all duration-300 flex items-center justify-center gap-2"
              >
                🟢 Falar com Especialista
              </button>
              
              <button 
                type="button" 
                onClick={handleReset} 
                className="flex-1 h-12 bg-brand-bg text-brand-text border border-brand-card-border font-extrabold text-xs uppercase tracking-widest rounded-xl hover:bg-brand-card transition-all duration-300 flex items-center justify-center gap-2"
              >
                ↩️ Refazer Curadoria
              </button>
            </div>
          </div>
        )}

      </div>
      
      {/* Lead Capture Modal */}
      <LeadCaptureModal
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        onSubmit={handleLeadSubmit}
      />
    </section>
  );
}
