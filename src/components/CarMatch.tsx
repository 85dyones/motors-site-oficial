"use client";

import { useState, useEffect } from "react";
import { getEstoque, Veiculo } from "../lib/supabase";
import { logFlowInitiated, getActiveAgUid, getUtmParameters, trackCarMatch } from "../lib/telemetry";
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

export default function CarMatch() {
  const { companySettings } = useTheme();
  const [gameState, setGameState] = useState<"intro" | "q1" | "q2" | "q3" | "q4" | "q5" | "loading" | "results">("intro");
  const [answers, setAnswers] = useState<AnswerState>({ budgetMin: 0, budgetMax: 0, objective: "", experience: "", style: "", timeline: "" });
  const [estoque, setEstoque] = useState<Veiculo[]>([]);
  const [agUid, setAgUid] = useState("ag_ref_nao_localizado");

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
      agUid: agUid
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
      timeline: "researching" // default for AI query
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

      if (typeof window !== "undefined") {
        const activeUid = getActiveAgUid();
        const telemetryPayload = {
          agUid: activeUid,
          timestamp: new Date().toISOString(),
          tipoLead: "curation_profiler",
          respostas: answers,
        };

        console.log("📈 [Antigravity Telemetry] Profiler Finalizado:", telemetryPayload);
        (window as any).ag_last_carmatch = telemetryPayload;

        fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tags,
            budget: answers.budgetMax || undefined,
            ag_uid: activeUid,
          }),
        }).catch((err) => console.error("Failed to sync match with backend API:", err));
      }

      const timer = setTimeout(() => {
        setGameState("results");
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [gameState, answers, agUid]);

  const handleReset = () => {
    setAnswers({ budgetMin: 0, budgetMax: 0, objective: "", experience: "", style: "", timeline: "" });
    setBudgetTab("presets");
    setAllowUpsell(true);
    setAiQuery("");
    setIsAiCuratorActive(false);
    setGameState("intro");
  };

  const formatPrice = (value: number): string => {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
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

      {/* INTRO */}
      {gameState === "intro" && (
        <div className="flex flex-col items-center text-center py-6 px-2 animate-fadeIn">
          <div className="h-16 w-16 bg-brand-primary/10 border border-brand-primary/30 rounded-full flex items-center justify-center mb-5 text-brand-gold shadow-[0_0_20px_rgba(197,168,128,0.15)] relative">
            <span className="absolute animate-ping h-8 w-8 rounded-full bg-brand-primary/5 opacity-75" />
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>
          <p className="text-xs text-brand-text/50 leading-relaxed mb-6 max-w-sm">
            Nossa inteligência analisa suas respostas para gerar um perfil de curadoria detalhado. Nossos especialistas usarão esse perfil para enviar as melhores sugestões diretamente no seu WhatsApp.
          </p>
          <button
            type="button"
            onClick={() => setGameState("q1")}
            className="w-full max-w-xs h-12 bg-gradient-to-r from-brand-primary to-brand-primary-hover text-white font-extrabold text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-[#c5a880]/15 hover:opacity-95 active:scale-95 transition-all duration-300 flex items-center justify-center gap-2"
          >
            Criar meu Perfil
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.22 5.03a.75.75 0 1 1 1.06-1.06l5.5 5.5a.75.75 0 0 1 0 1.06l-5.5 5.5a.75.75 0 1 1-1.06-1.06l4.168-4.17H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* QUESTION 1: Budget */}
      {gameState === "q1" && (
        <div className="flex flex-col gap-5 animate-fadeIn">
          <div className="flex justify-between items-center px-1">
            <span className="text-brand-text/50 font-thin uppercase text-xs tracking-wider">Pergunta 1 de 5</span>
            <span className="bg-brand-card-border text-brand-gold px-2.5 py-0.5 rounded-full font-thin uppercase text-[10px] md:text-xs tracking-wider">Orçamento</span>
          </div>
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
          <div className="flex justify-between items-center px-1">
            <span className="text-brand-text/50 font-thin uppercase text-xs tracking-wider">Pergunta 2 de 5</span>
            <span className="bg-brand-card-border text-brand-gold px-2.5 py-0.5 rounded-full font-thin uppercase text-[10px] md:text-xs tracking-wider">Motivação</span>
          </div>
          <h3 className="text-base font-extrabold text-brand-text text-center md:text-left leading-tight">
            Qual o principal objetivo na sua próxima compra?
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {[
              { id: "family", title: "Conforto, Segurança & Família", desc: "Viagens seguras e bastante espaço." },
              { id: "status", title: "Status, Exclusividade & Design", desc: "Design imponente e presença única." },
              { id: "efficiency", title: "Tecnologia, Inovação & Eficiência", desc: "Uso urbano inteligente." },
              { id: "offroad", title: "Força, Aventura & Capacidade", desc: "Capacidade offroad ou para trabalho pesado." }
            ].map((opt) => (
              <button key={opt.id} type="button" onClick={() => selectObjective(opt.id as any)} className="w-full text-left p-4 rounded-xl bg-brand-card border border-brand-border hover:bg-brand-bg hover:border-brand-primary transition-all duration-200">
                <div className="text-xs font-extrabold text-brand-text mb-1">{opt.title}</div>
                <div className="text-[10px] text-brand-text/40 leading-relaxed">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* QUESTION 3: Experience */}
      {gameState === "q3" && (
        <div className="flex flex-col gap-5 animate-fadeIn">
          <div className="flex justify-between items-center px-1">
            <span className="text-brand-text/50 font-thin uppercase text-xs tracking-wider">Pergunta 3 de 5</span>
            <span className="bg-brand-card-border text-brand-gold px-2.5 py-0.5 rounded-full font-thin uppercase text-[10px] md:text-xs tracking-wider">Experiência</span>
          </div>
          <h3 className="text-base font-extrabold text-brand-text text-center md:text-left leading-tight">
            O que você mais valoriza ao dirigir?
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {[
              { id: "performance", title: "Performance & Potência", desc: "Aceleração rápida e dinâmica afiada." },
              { id: "comfort", title: "Conforto Máximo & Silêncio", desc: "Isolamento acústico e rodar suave." },
              { id: "tech", title: "Tecnologia & Conectividade", desc: "Telas avançadas e sistemas de assistência." },
              { id: "economy", title: "Custo-Benefício & Manutenção", desc: "Economia no dia a dia e liquidez." }
            ].map((opt) => (
              <button key={opt.id} type="button" onClick={() => selectExperience(opt.id as any)} className="w-full text-left p-4 rounded-xl bg-brand-card border border-brand-border hover:bg-brand-bg hover:border-brand-primary transition-all duration-200">
                <div className="text-xs font-extrabold text-brand-text mb-1">{opt.title}</div>
                <div className="text-[10px] text-brand-text/40 leading-relaxed">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* QUESTION 4: Style */}
      {gameState === "q4" && (
        <div className="flex flex-col gap-5 animate-fadeIn">
          <div className="flex justify-between items-center px-1">
            <span className="text-brand-text/50 font-thin uppercase text-xs tracking-wider">Pergunta 4 de 5</span>
            <span className="bg-brand-card-border text-brand-gold px-2.5 py-0.5 rounded-full font-thin uppercase text-[10px] md:text-xs tracking-wider">Estilo</span>
          </div>
          <h3 className="text-base font-extrabold text-brand-text text-center md:text-left leading-tight">
            Qual o estilo de carroceria que mais atrai você hoje?
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { id: "suv", title: "SUVs Imponentes" },
              { id: "sedan", title: "Sedans Elegantes" },
              { id: "sport", title: "Esportivos / Coupés" },
              { id: "pickup", title: "Picapes Premium" },
              { id: "open", title: "Aberto a Sugestões" }
            ].map((opt) => (
              <button key={opt.id} type="button" onClick={() => selectStyle(opt.id as any)} className="w-full text-left p-4 rounded-xl bg-brand-card border border-brand-border hover:bg-brand-bg hover:border-brand-primary transition-all duration-200">
                <div className="text-xs font-extrabold text-brand-text">{opt.title}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* QUESTION 5: Timeline */}
      {gameState === "q5" && (
        <div className="flex flex-col gap-5 animate-fadeIn">
          <div className="flex justify-between items-center px-1">
            <span className="text-brand-text/50 font-thin uppercase text-xs tracking-wider">Pergunta 5 de 5</span>
            <span className="bg-brand-card-border text-brand-gold px-2.5 py-0.5 rounded-full font-thin uppercase text-[10px] md:text-xs tracking-wider">Momento</span>
          </div>
          <h3 className="text-base font-extrabold text-brand-text text-center md:text-left leading-tight">
            Qual o seu prazo ideal para fechar o negócio?
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {[
              { id: "immediate", title: "Imediato", desc: "Pronto para fechar negócio nas próximas semanas." },
              { id: "researching", title: "Pesquisando", desc: "Mapeando opções para compra no próximo mês." },
              { id: "future", title: "Apenas Sondando", desc: "Acompanhando o mercado sem pressa." }
            ].map((opt) => (
              <button key={opt.id} type="button" onClick={() => selectTimeline(opt.id as any)} className="w-full text-left p-4 rounded-xl bg-brand-card border border-brand-border hover:bg-brand-bg hover:border-brand-primary transition-all duration-200">
                <div className="text-xs font-extrabold text-brand-text mb-1">{opt.title}</div>
                <div className="text-[10px] text-brand-text/40 leading-relaxed">{opt.desc}</div>
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
          <span className="text-sm font-extrabold text-brand-text mb-2 tracking-widest uppercase">Traçando seu Perfil...</span>
          <span className="text-[10px] text-brand-text/40 max-w-[200px] text-center font-light leading-relaxed">
            Nossos consultores usarão este perfil para trazer as máquinas mais exclusivas do mercado.
          </span>
        </div>
      )}

      {/* RESULTS */}
      {gameState === "results" && (
        <div className="flex flex-col items-center text-center py-6 px-2 animate-fadeIn">
          <div className="h-16 w-16 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mb-5 text-green-500 shadow-[0_0_20px_rgba(34,197,94,0.15)]">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h3 className="text-xl font-black text-brand-text mb-3">Perfil Traçado com Sucesso!</h3>
          <p className="text-xs text-brand-text/60 leading-relaxed mb-6 max-w-sm">
            Identificamos suas preferências. Temos opções altamente exclusivas que se alinham ao seu perfil focado em <strong>{formatExperience(answers.experience)}</strong>, algumas recém-chegadas e ainda não publicadas.
          </p>
          <button
            onClick={handleShowResults}
            className="w-full max-w-sm h-12 bg-gradient-to-r from-brand-primary to-brand-primary-hover text-white font-extrabold text-xs uppercase tracking-widest rounded-xl shadow-lg hover:opacity-95 active:scale-95 transition-all duration-300 flex items-center justify-center gap-2"
          >
            Falar com Especialista
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4.13-5.69Z" clipRule="evenodd" />
            </svg>
          </button>
          
          <button type="button" onClick={handleReset} className="text-[10px] text-brand-text/30 hover:text-brand-text transition-colors mt-6 underline">
            Refazer Profiler
          </button>
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
