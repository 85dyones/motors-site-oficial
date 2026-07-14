"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { getEstoque, Veiculo, getVeiculoPdpUrl } from "../lib/supabase";
import { logFlowInitiated, getActiveAgUid, getUtmParameters, trackCarMatch } from "../lib/telemetry";
import LeadCaptureModal from "./LeadCaptureModal";
import { useTheme } from "../app/ThemeContext";

interface AnswerState {
  budgetMin: number;
  budgetMax: number;
  use: "family" | "commute" | "performance" | "";
  category: "suv" | "ev" | "performance" | "";
}

export default function CarMatch() {
  const { companySettings, webhooks } = useTheme();
  const [gameState, setGameState] = useState<"intro" | "q1" | "q2" | "q3" | "loading" | "results">("intro");
  const [answers, setAnswers] = useState<AnswerState>({ budgetMin: 0, budgetMax: 0, use: "", category: "" });
  const [estoque, setEstoque] = useState<Veiculo[]>([]);
  const [recommendations, setRecommendations] = useState<(Veiculo & { score: number })[]>([]);
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
  const [activeVehicle, setActiveVehicle] = useState<(Veiculo & { score?: number }) | null>(null);
  const [activeMessage, setActiveMessage] = useState("");

  // Fetch tracking ID and Supabase inventory
  useEffect(() => {
    const uid = getActiveAgUid();
    setAgUid(uid);
    logFlowInitiated("Car Match", uid);

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

    // Round to nice intervals based on the price range
    const roundTo = max > 500000 ? 50000 : max > 200000 ? 25000 : 10000;
    const roundDown = (n: number) => Math.floor(n / roundTo) * roundTo;
    const roundUp = (n: number) => Math.ceil(n / roundTo) * roundTo;

    const floorMin = roundDown(min);
    const ceilMax = roundUp(max);

    // Create 5 smart brackets
    const brackets: [number, number][] = [];
    const spread = ceilMax - floorMin;

    if (spread <= roundTo * 3) {
      // Very narrow range — just 2 brackets
      const mid = roundDown(floorMin + spread / 2);
      brackets.push([floorMin, mid]);
      brackets.push([mid, ceilMax]);
    } else {
      // 5 brackets: progressive widths (smaller at low end, wider at high end)
      const cutpoints = [
        floorMin,
        roundUp(floorMin + spread * 0.15),
        roundUp(floorMin + spread * 0.35),
        roundUp(floorMin + spread * 0.60),
        roundUp(floorMin + spread * 0.80),
        ceilMax,
      ];
      // Deduplicate and ensure ascending
      const unique = [...new Set(cutpoints)].sort((a, b) => a - b);
      for (let i = 0; i < unique.length - 1; i++) {
        brackets.push([unique[i], unique[i + 1]]);
      }
    }

    const formatShort = (v: number) => {
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
          ? `Até R$ ${formatShort(hi)}`
          : isLast
            ? `Acima de R$ ${formatShort(lo)}`
            : `R$ ${formatShort(lo)} a R$ ${formatShort(hi)}`,
        count,
        desc: count === 1 ? "1 veículo disponível" : `${count} veículos disponíveis`,
      };
    });

    // Filter out empty ranges — only show brackets with actual vehicles
    const nonEmpty = ranges.filter((r) => r.count > 0);
    setBudgetRanges(nonEmpty.length > 0 ? nonEmpty : ranges);

    // Dynamic ceiling default based on median stock price
    if (prices.length > 0) {
      const middlePrice = prices[Math.floor(prices.length / 2)];
      setCustomMaxBudget(Math.round(middlePrice / 10000) * 10000);
    }
  }, [estoque]);

  const getCustomMatchCount = (maxLimit: number) => {
    if (estoque.length === 0) return 0;
    return estoque.filter((v) => {
      const price = (v.preco_promocional > 0 && v.preco_promocional < v.preco_original)
        ? v.preco_promocional
        : v.preco_original;
      const limit = allowUpsell ? maxLimit * 1.15 : maxLimit;
      return price <= limit;
    }).length;
  };

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

  const handleWhatsappMatchClick = (veiculo: Veiculo & { score?: number }, matchMsg: string) => {
    setActiveVehicle(veiculo);
    setActiveMessage(matchMsg);
    setIsLeadModalOpen(true);
  };

  const handleLeadSubmit = async (leadData: { nome: string; email: string; whatsapp: string; turnstileToken?: string }) => {
    if (!activeVehicle) return;

    const utmParams = getUtmParameters();
    const tipoBadge = activeVehicle.baixa_km ? "BAIXA KM" : (activeVehicle.unico_dono ? "ÚNICO DONO" : (activeVehicle.cautelar_100 ? "CAUTELAR 100%" : "BAIXA KM"));
    const perfilUso = activeVehicle.perfil_uso || "URBANO & EFICIENTE";

    const cleanPhone = leadData.whatsapp;
    const formattedPhone = cleanPhone.length === 10 || cleanPhone.length === 11 ? "55" + cleanPhone : cleanPhone;
    const remoteJid = formattedPhone ? `${formattedPhone}@s.whatsapp.net` : "";

    const payload = {
      remoteJid,
      telefone: formattedPhone,
      tipo: "lead_whatsapp",
      canal: "CarMatch Recommendations",
      mensagem: activeMessage,
      veiculo: {
        id: activeVehicle.id,
        marca: activeVehicle.marca,
        modelo: activeVehicle.modelo,
        versao: activeVehicle.versao,
        ano: activeVehicle.ano,
        preco: activeVehicle.preco_promocional > 0 ? activeVehicle.preco_promocional : activeVehicle.preco_original,
        score: activeVehicle.score,
        veiculo_contexto: {
          perfil_uso: perfilUso,
          tipo_badge: tipoBadge
        }
      },
      cliente: {
        nome: leadData.nome,
        email: leadData.email,
        whatsapp: leadData.whatsapp
      },
      utm: {
        utm_source: utmParams.utm_source,
        utm_medium: utmParams.utm_medium,
        utm_campaign: utmParams.utm_campaign,
        utm_content: utmParams.utm_content
      },
      intencao_busca: {
        aiQuery: aiQuery || "",
        budgetTab: budgetTab
      },
      agUid: agUid
    };

    // Dispatch lead via secure server proxy api
    // Wrapped: API failures must NEVER block the client from reaching WhatsApp
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

    // Save lead to history to persist/pre-populate
    try {
      const rawHistory = localStorage.getItem("ag_leads_history");
      const history = rawHistory ? JSON.parse(rawHistory) : [];
      history.push({
        agUid,
        timestamp: new Date().toISOString(),
        tipoLead: "lead_whatsapp_match",
        cliente: {
          nome: leadData.nome,
          email: leadData.email,
          whatsapp: leadData.whatsapp
        },
        veiculo: {
          id: activeVehicle.id,
          marca: activeVehicle.marca,
          modelo: activeVehicle.modelo
        }
      });
      localStorage.setItem("ag_leads_history", JSON.stringify(history));
    } catch (e) {
      console.warn("[Telemetry] Failed to save lead payload to history:", e);
    }

    // Redirect to WhatsApp - ALWAYS executes regardless of API outcome
    const whatsappUrl = `https://wa.me/${companySettings.whatsappRaw}?text=${encodeURIComponent(activeMessage)}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  const parseFreeTextQuery = (text: string) => {
    const lower = text.toLowerCase();
    
    // 1. Parse budget ceiling
    let parsedBudget = 0;
    // Look for numbers like "300 mil", "300mil", "300k", "300.000", "300000"
    const milMatch = lower.match(/(\d+)\s*(?:mil|k)/);
    const rawNumberMatch = lower.match(/(?:r\$)?\s*(\d{2,3})(?:\.\d{3})*(?:,00)?/);
    
    if (milMatch) {
      parsedBudget = parseInt(milMatch[1]) * 1000;
    } else if (rawNumberMatch) {
      const num = parseInt(rawNumberMatch[1].replace(/\./g, ""));
      if (num > 1000) parsedBudget = num;
      else if (num > 0) parsedBudget = num * 1000; // e.g. "300" -> 300000
    }
    
    // Fallback if no budget parsed, default to max
    if (parsedBudget === 0) parsedBudget = 1000000;

    // 2. Parse lifestyle tags
    let use: AnswerState["use"] = "";
    if (lower.includes("família") || lower.includes("familia") || lower.includes("viagem") || lower.includes("viajar") || lower.includes("filho") || lower.includes("filhas") || lower.includes("espaço")) {
      use = "family";
    } else if (lower.includes("esporte") || lower.includes("esportivo") || lower.includes("performance") || lower.includes("velocidade") || lower.includes("correr") || lower.includes("pista") || lower.includes("acelera")) {
      use = "performance";
    } else if (lower.includes("cidade") || lower.includes("trabalho") || lower.includes("diário") || lower.includes("diario") || lower.includes("dia a dia") || lower.includes("economia") || lower.includes("econômico")) {
      use = "commute";
    }

    // 3. Parse category tags
    let category: AnswerState["category"] = "";
    if (lower.includes("suv") || lower.includes("4x4") || lower.includes("utilitário") || lower.includes("jeep") || lower.includes("jipe")) {
      category = "suv";
    } else if (lower.includes("esportivo") || lower.includes("porsche") || lower.includes("coupé") || lower.includes("conversível") || lower.includes("supercarro")) {
      category = "performance";
    } else if (lower.includes("elétrico") || lower.includes("eletrico") || lower.includes("híbrido") || lower.includes("hibrido") || lower.includes("ev") || lower.includes("sedã") || lower.includes("seda")) {
      category = "ev";
    }

    return {
      budgetMax: parsedBudget,
      use,
      category
    };
  };

  const confirmAiCuratorQuery = () => {
    if (!aiQuery.trim()) return;
    
    const parsed = parseFreeTextQuery(aiQuery);
    
    // Inject parsed state into answers
    setAnswers((prev) => ({
      ...prev,
      budgetMin: 0,
      budgetMax: parsed.budgetMax,
      use: parsed.use || "commute", // Fallback to commute
      category: parsed.category || "ev"  // Fallback to ev
    }));
    
    setIsAiCuratorActive(true);
    
    setTimeout(() => {
      // Proceed directly to the loading state bypassing Q2 and Q3!
      setGameState("loading");
    }, 200);
  };

  const getAiCuratorJustification = (veiculo: Veiculo, queryText: string): string => {
    const lowerQuery = queryText.toLowerCase();
    const carName = `${veiculo.marca} ${veiculo.modelo}`;
    
    let reason = "";
    if (lowerQuery.includes("família") || lowerQuery.includes("familia") || lowerQuery.includes("viagem") || lowerQuery.includes("viajar") || lowerQuery.includes("espaço")) {
      reason = `O ${carName} é ideal para suas viagens. Ele oferece excelente espaço de cabine, porta-malas generoso e suspensão calibrada para o conforto da sua família em trajetos rodoviários.`;
    } else if (lowerQuery.includes("esporte") || lowerQuery.includes("esportivo") || lowerQuery.includes("performance") || lowerQuery.includes("pista") || lowerQuery.includes("acelera") || lowerQuery.includes("porsche")) {
      reason = `Selecionei o ${carName} por sua engenharia de pista. O acerto de chassis, a potência vigorosa e a transmissão ágil entregam a esportividade emocionante que você está buscando.`;
    } else if (lowerQuery.includes("cidade") || lowerQuery.includes("trabalho") || lowerQuery.includes("diário") || lowerQuery.includes("diario") || lowerQuery.includes("dia a dia") || lowerQuery.includes("economia") || lowerQuery.includes("trânsito")) {
      reason = `O ${carName} atende perfeitamente à sua rotina urbana. Sua economia de combustível excepcional e agilidade no trânsito urbano garantem um rodar prático e sustentável no dia a dia.`;
    } else {
      // General match justification based on vehicle attributes
      if (veiculo.perfil_uso === "LINHAGEM ESPORTIVA") {
        reason = `O ${carName} se destaca por sua engenharia de alta performance e design imponente, ideal para quem valoriza exclusividade e dinâmica afiada ao dirigir.`;
      } else if (veiculo.combustivel.toLowerCase().includes("elétrico") || veiculo.combustivel.toLowerCase().includes("híbrido")) {
        reason = `O ${carName} representa o topo da tecnologia sustentável, com silêncio a bordo, torque instantâneo e excelente economia de energia para seus trajetos.`;
      } else {
        reason = `O ${carName} oferece um equilíbrio perfeito de sofisticação, custo-benefício e confiabilidade mecânica, encaixando-se muito bem no perfil de investimento indicado.`;
      }
    }
    
    return reason;
  };

  const getGlobalAiCuratorAdvice = (queryText: string, recs: Veiculo[]): string => {
    if (recs.length === 0) return "Não encontrei opções disponíveis no estoque no momento.";
    
    const firstCar = `${recs[0].marca} ${recs[0].modelo}`;
    const secondCar = recs[1] ? `${recs[1].marca} ${recs[1].modelo}` : "";
    
    let advice = `Olá! Analisei sua solicitação: "${queryText}". Identifiquei excelentes opções premium em nosso estoque que se alinham perfeitamente ao seu perfil de uso. Recomendo o ${firstCar} como sua principal escolha devido à sua afinidade excepcional de perfil.`;
    
    if (secondCar) {
      advice += ` Como uma excelente alternativa, o ${secondCar} também se destaca, oferecendo uma dinâmica complementar muito rica.`;
    }
    
    return advice;
  };

  const selectBudget = (range: BudgetRange) => {
    setAnswers((prev) => ({ ...prev, budgetMin: range.min, budgetMax: range.max }));
    setTimeout(() => {
      setGameState("q2");
    }, 200);
  };

  const selectUse = (use: AnswerState["use"]) => {
    setAnswers((prev) => ({ ...prev, use }));
    setTimeout(() => {
      setGameState("q3");
    }, 200);
  };

  const selectCategory = (category: AnswerState["category"]) => {
    setAnswers((prev) => ({ ...prev, category }));
    setGameState("loading");
  };

  // Perform dynamic matching when we reach the loading state
  useEffect(() => {
    if (gameState === "loading") {
      // 1. Calculate matches using scoring algorithm
      const scoredCars = estoque.map((car) => {
        let score = 50; // Base score

        // A. Budget Match — Proximity-based scoring with Upsell flexibility
        const price = car.preco_promocional > 0 && car.preco_promocional < car.preco_original 
          ? car.preco_promocional 
          : car.preco_original;

        if (answers.budgetMin > 0 || answers.budgetMax > 0) {
          const minLimit = answers.budgetMin;
          const maxLimit = answers.budgetMax;

          const isWithinStandard = minLimit === 0 
            ? price <= maxLimit 
            : (price >= minLimit && price <= maxLimit);

          if (isWithinStandard) {
            // Perfect match — within selected range
            score += 30;
          } else if (allowUpsell && price > maxLimit && price <= maxLimit * 1.15) {
            // Upsell opportunity — slightly above range
            // High affinity score because it matches lifestyle preference, but budget penalty is soft (+20 instead of +30)
            score += 20;
          } else {
            // Proximity scoring — how far outside the range
            const rangeCenter = minLimit === 0 ? maxLimit / 2 : (minLimit + maxLimit) / 2;
            const rangeSpan = minLimit === 0 ? maxLimit : maxLimit - minLimit;
            const distance = Math.abs(price - rangeCenter);
            const proximity = Math.max(0, 1 - (distance / (rangeSpan * 1.5)));
            score += Math.round(proximity * 20) - 5;
          }
        }

        // B. Primary Use Match
        const comb = car.combustivel.toLowerCase();
        const mod = car.modelo.toLowerCase();
        const brand = car.marca.toLowerCase();
        const desc = (car.descricao || "").toLowerCase();
        const versao = car.versao.toLowerCase();

        const perfil = (car.perfil_uso || "").toUpperCase();
        const tipoCarro = (car.tipo || "").toLowerCase();

        if (answers.use === "family") {
          if (perfil === "CURADORIA EXCLUSIVA" || perfil === "FORÇA & OFF-ROAD" || mod.includes("defender") || mod.includes("x5") || mod.includes("suv") || mod.includes("corolla cross") || mod.includes("tiguan")) {
            score += 25;
          } else if (versao.includes("luxury") || versao.includes("hse") || versao.includes("comfort")) {
            score += 15;
          }
        } else if (answers.use === "commute") {
          if (perfil === "URBANO & EFICIENTE" || comb.includes("elétrico") || comb.includes("híbrido")) {
            score += 25;
          } else if (comb.includes("flex") || price < 300000) {
            score += 15;
          }
        } else if (answers.use === "performance") {
          if (perfil === "LINHAGEM ESPORTIVA" || brand.includes("porsche") || mod.includes("m sport") || mod.includes("carrera") || car.cambio.toLowerCase().includes("pdk") || desc.includes("turbo") || versao.includes("m sport")) {
            score += 25;
          }
        }

        // C. Category Match
        if (answers.category === "suv") {
          if (tipoCarro === "suv" || mod.includes("defender") || mod.includes("x5") || mod.includes("x4") || mod.includes("x1") || mod.includes("corolla cross") || car.opcionais.toLowerCase().includes("suspensão pneumática")) {
            score += 20;
          }
        } else if (answers.category === "ev") {
          if (tipoCarro === "elétrico" || comb.includes("elétrico")) {
            score += 20;
          } else if (comb.includes("híbrido")) {
            score += 10;
          }
        } else if (answers.category === "performance") {
          if (tipoCarro === "esportivo" || perfil === "LINHAGEM ESPORTIVA" || brand.includes("porsche") || mod.includes("m sport") || car.opcionais.toLowerCase().includes("esportivo") || versao.includes("m sport")) {
            score += 20;
          }
        }

        // Add small random offset to keep ordering dynamic if equal
        const finalScore = Math.min(100, Math.max(0, score + Math.floor(Math.random() * 5)));

        return {
          ...car,
          score: finalScore,
        };
      });

      // Sort by score descending and take top 3
      const sorted = scoredCars.sort((a, b) => b.score - a.score);
      const top3 = sorted.slice(0, 3);

      setRecommendations(top3);

      // Dispara telemetria de quiz de recomendação (Search) no GA4/Pixel
      const tags = [answers.use, answers.category].filter(Boolean);
      trackCarMatch(tags, top3.length);

      // Trigger Telemetry logs for coordination
      if (typeof window !== "undefined") {
        const activeUid = getActiveAgUid();
        const telemetryPayload = {
          agUid: activeUid,
          timestamp: new Date().toISOString(),
          tipoLead: "car_match_questionario",
          respostas: answers,
          veiculosRecomendados: top3.map((car) => ({
            id: car.id,
            marca: car.marca,
            modelo: car.modelo,
            score: car.score,
          })),
        };

        console.log("📈 [Antigravity Telemetry] CarMatch Finalizado:", telemetryPayload);
        (window as any).ag_last_carmatch = telemetryPayload;

        // Trigger a background POST call to /api/match for backend telemetry logging
        fetch("/api/match", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tags: [answers.use, answers.category].filter(Boolean),
            budget: answers.budgetMax || undefined,
            ag_uid: activeUid,
          }),
        }).catch((err) => console.error("Failed to sync match with backend API:", err));
      }

      // Simulate the 1.2s loading state
      const timer = setTimeout(() => {
        setGameState("results");
      }, 1200);

      return () => clearTimeout(timer);
    }
  }, [gameState, answers, estoque, agUid]);

  const handleReset = () => {
    setAnswers({ budgetMin: 0, budgetMax: 0, use: "", category: "" });
    setBudgetTab("presets");
    setAllowUpsell(true);
    setAiQuery("");
    setIsAiCuratorActive(false);
    setGameState("intro");
  };

  // Render Formatter Helpers
  const formatPrice = (value: number): string => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0
    });
  };

  return (
    <section id="match-garagem" aria-label="Match de Garagem" className="flex flex-col gap-4 w-full">
      <div className="text-center flex flex-col gap-1.5 px-4 sm:px-6">
        <span className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">
          Curadoria Personalizada
        </span>
        <h2 className="text-2xl font-black text-brand-text tracking-tight">
          {companySettings?.carMatchTitle || "Match de Garagem"}
        </h2>
        <p className="text-xs text-brand-text/50 max-w-xs mx-auto">
          Responda a 3 perguntas e nosso algoritmo recomendará os carros mais alinhados em nosso estoque.
        </p>
      </div>
      <div className="w-full bg-brand-card border border-brand-card-border rounded-3xl p-5 md:p-8 shadow-[0_8px_30px_var(--brand-shadow)] relative overflow-hidden transition-all duration-300">
      {/* Visual Gold glow background */}
      <div className="absolute -left-16 -top-16 h-36 w-36 rounded-full bg-brand-primary/5 blur-[50px] pointer-events-none" />
      <div className="absolute -right-16 -bottom-16 h-36 w-36 rounded-full bg-brand-primary/5 blur-[50px] pointer-events-none" />


      {/* INTRO SCREEN */}
      {gameState === "intro" && (
        <div className="flex flex-col items-center text-center py-6 px-2 animate-fadeIn">
          {/* Animated pulsing golden wheel/car logo */}
          <div className="h-16 w-16 bg-brand-primary/10 border border-brand-primary/30 rounded-full flex items-center justify-center mb-5 text-brand-gold shadow-[0_0_20px_rgba(197,168,128,0.15)] relative">
            <span className="absolute animate-ping h-8 w-8 rounded-full bg-brand-primary/5 opacity-75" />
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 21m0 0-.813-5.096M9 21h3m-3.43-15.43H9m4.43 15.43h.813L15 15.904M15 21h-3m3.43-15.43H15M9 3h6m-6 3h6m-9 6h12m-13.5 3h15M3 9a9 9 0 1 1 18 0v0a9 9 0 0 1-18 0Z" />
            </svg>
          </div>

          <p className="text-xs text-brand-text/50 leading-relaxed mb-6 max-w-sm">
            Nossos consultores criaram uma curadoria inteligente. Diga-nos suas preferências e filtraremos nossa coleção premium para seu perfil de uso e investimento.
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

      {/* QUESTION 1: Dynamic Budget Ranges */}
      {gameState === "q1" && (
        <div className="flex flex-col gap-5 animate-fadeIn">
          <div className="flex justify-between items-center px-1">
            <span className="text-brand-text/50 font-thin uppercase text-xs tracking-wider">Pergunta 1 de 3</span>
            <span className="bg-brand-card-border text-brand-gold px-2.5 py-0.5 rounded-full font-thin uppercase text-[10px] md:text-xs tracking-wider">Orçamento</span>
          </div>

          <h3 className="text-base font-extrabold text-brand-text text-center md:text-left leading-tight">
            Qual faixa de investimento você planeja para sua nova máquina?
          </h3>

          {/* Tab Switcher */}
          <div className="flex bg-brand-bg p-1 rounded-xl border border-brand-card-border gap-1">
            <button
              type="button"
              onClick={() => setBudgetTab("presets")}
              className={`flex-1 py-2.5 text-center rounded-lg uppercase text-xs tracking-wider transition-all duration-200 font-bold ${
                budgetTab === "presets"
                  ? "bg-brand-primary text-white shadow-md border border-brand-primary"
                  : "text-brand-text/50 hover:bg-brand-card/50 hover:text-brand-text"
              }`}
            >
              OPÇÕES RÁPIDAS
            </button>
            <button
              type="button"
              onClick={() => setBudgetTab("custom")}
              className={`flex-1 py-2.5 text-center rounded-lg uppercase text-xs tracking-wider transition-all duration-200 font-bold ${
                budgetTab === "custom"
                  ? "bg-brand-primary text-white shadow-md border border-brand-primary"
                  : "text-brand-text/50 hover:bg-brand-card/50 hover:text-brand-text"
              }`}
            >
              TETO DE PREÇO
            </button>
            <button
              type="button"
              onClick={() => setBudgetTab("ai")}
              className={`flex-1 py-2.5 text-center rounded-lg uppercase text-xs tracking-wider transition-all duration-200 font-bold ${
                budgetTab === "ai"
                  ? "bg-brand-primary text-white shadow-md border border-brand-primary"
                  : "text-brand-text/50 hover:bg-brand-card/50 hover:text-brand-text"
              }`}
            >
              🤖 ASSISTENTE DE IA
            </button>
          </div>

          {budgetTab === "presets" && (
            <div className="grid grid-cols-1 gap-3 animate-fadeIn">
              {budgetRanges.length > 0 ? (
                budgetRanges.map((range) => {
                  const isSelected = answers.budgetMin === range.min && answers.budgetMax === range.max;
                  return (
                    <button
                      key={range.id}
                      type="button"
                      onClick={() => selectBudget(range)}
                      className={`w-full min-h-[56px] py-3.5 px-4 text-left rounded-xl bg-brand-card transition-all duration-200 flex items-center justify-between gap-3 shadow-sm border ${
                        isSelected
                          ? "border-2 border-brand-primary bg-brand-primary/5"
                          : "border-brand-border hover:bg-brand-bg hover:border-brand-primary active:scale-[0.98]"
                      }`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-extrabold text-brand-text">{range.title}</span>
                        <span className="text-[10px] text-brand-text/40 leading-tight">{range.desc}</span>
                      </div>
                      <span className="text-[9px] font-black text-brand-gold bg-brand-primary/10 border border-brand-primary/20 rounded-lg px-2.5 py-1 shrink-0">
                        {range.count}
                      </span>
                    </button>
                  );
                })
              ) : (
                // Fallback skeleton while inventory loads
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="w-full h-[56px] bg-brand-bg border border-brand-card-border rounded-xl animate-pulse" />
                ))
              )}
            </div>
          )}

          {budgetTab === "custom" && (
            <div className="flex flex-col gap-4 p-4 bg-brand-bg/30 border border-brand-card-border rounded-2xl animate-fadeIn">
              <div className="text-center py-2 flex flex-col gap-1">
                <span className="text-brand-text/40 font-thin uppercase text-xs tracking-wider">Limite de Investimento</span>
                <span className="text-2xl md:text-3xl font-black text-brand-gold">
                  {formatPrice(customMaxBudget)}
                </span>
                <span className="text-brand-text/60 font-thin uppercase text-xs tracking-wider">
                  {getCustomMatchCount(customMaxBudget)} {getCustomMatchCount(customMaxBudget) === 1 ? "CARRO ENCONTRADO" : "CARROS ENCONTRADOS"} NO ESTOQUE
                </span>
              </div>

              <div className="px-2 flex flex-col gap-2">
                <input
                  type="range"
                  min={100000}
                  max={1000000}
                  step={20000}
                  value={customMaxBudget}
                  onChange={(e) => setCustomMaxBudget(Number(e.target.value))}
                  className="w-full h-2 bg-brand-bg rounded-lg appearance-none cursor-pointer accent-brand-primary border border-brand-card-border"
                />
                <div className="flex justify-between text-[9px] font-bold text-brand-text/40 px-1">
                  <span>R$ 100 mil</span>
                  <span>R$ 550 mil</span>
                  <span>R$ 1.0M+</span>
                </div>
              </div>

              <button
                type="button"
                onClick={confirmCustomBudget}
                className="w-full h-11 bg-gradient-to-r from-brand-primary to-brand-primary-hover text-white font-extrabold text-[11px] uppercase tracking-wider rounded-xl shadow-md hover:opacity-95 active:scale-95 transition-all duration-200 mt-2"
              >
                Confirmar Orçamento
              </button>
            </div>
          )}

          {budgetTab === "ai" && (
            <div className="flex flex-col gap-4 p-4 bg-brand-bg/30 border border-brand-card-border rounded-2xl animate-fadeIn">
              <div className="flex flex-col gap-2">
                <span className="text-brand-text/40 font-thin uppercase text-xs tracking-wider">DESCREVA SEU CARRO IDEAL</span>
                <textarea
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  placeholder="EX: QUERO UM SUV DE LUXO PARA VIAJAR COM A FAMÍLIA, BEM SEGURO E CONFORTÁVEL, COM ORÇAMENTO DE ATÉ R$ 600 MIL..."
                  rows={3}
                  className="w-full p-3 bg-brand-card text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl focus:border-brand-primary text-xs focus:ring-1 focus:ring-brand-primary outline-none resize-none transition-all duration-200 font-thin uppercase tracking-wider"
                />
              </div>

              {/* Quick suggestions presets */}
              <div className="flex flex-col gap-1.5">
                <span className="text-brand-text/30 font-thin uppercase text-xs tracking-wider">SUGESTÕES RÁPIDAS:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "SUV FAMILIAR ATÉ R$ 600 MIL",
                    "CARRO ELÉTRICO ATÉ R$ 200K",
                    "ESPORTIVO PORSCHE CARRERA",
                  ].map((sug, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setAiQuery(sug)}
                      className="px-2.5 py-1.5 bg-brand-bg hover:bg-brand-card-border border border-brand-card-border rounded-lg text-brand-text/60 hover:text-brand-gold font-thin uppercase text-[10px] tracking-wider transition-all duration-200 active:scale-95 text-center"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={confirmAiCuratorQuery}
                disabled={!aiQuery.trim()}
                className={`w-full h-11 bg-gradient-to-r from-brand-primary to-brand-primary-hover text-white font-thin uppercase text-xs tracking-wider rounded-xl shadow-md hover:opacity-95 active:scale-95 transition-all duration-200 mt-1 flex items-center justify-center gap-1.5 ${
                  !aiQuery.trim() ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4.13-5.69Z" clipRule="evenodd" />
                </svg>
                CONSULTAR IA CURADORA
              </button>
            </div>
          )}

          {/* Flexible Budget Upsell Switch */}
          <label className="flex items-start gap-3 p-3.5 bg-brand-bg/50 border border-brand-card-border rounded-2xl cursor-pointer hover:bg-brand-bg transition-all duration-200 select-none group mt-1">
            <div className="flex items-center h-5">
              <input
                type="checkbox"
                checked={allowUpsell}
                onChange={(e) => setAllowUpsell(e.target.checked)}
                className="h-4 w-4 rounded border-brand-card-border text-brand-primary focus:ring-brand-primary bg-brand-card cursor-pointer"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-extrabold text-brand-text flex items-center gap-1.5 transition-colors group-hover:text-brand-gold">
                🔑 Ativar Upgrades Inteligentes (Recomendado)
              </span>
              <span className="text-[9px] text-brand-text/40 leading-relaxed">
                Mostra também veículos de categorias premium que estejam até 15% acima da faixa selecionada se a afinidade de perfil for excelente.
              </span>
            </div>
          </label>

          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-brand-text/40 hover:text-gray-700 transition-colors duration-200 self-center font-bold mt-2 py-1 underline"
          >
            Cancelar Curadoria
          </button>
        </div>
      )}

      {/* QUESTION 2: Primary Use */}
      {gameState === "q2" && (
        <div className="flex flex-col gap-5 animate-fadeIn">
          <div className="flex justify-between items-center px-1">
            <span className="text-brand-text/50 font-thin uppercase text-xs tracking-wider">Pergunta 2 de 3</span>
            <span className="bg-brand-card-border text-brand-gold px-2.5 py-0.5 rounded-full font-thin uppercase text-[10px] md:text-xs tracking-wider">Uso Principal</span>
          </div>

          <h3 className="text-base font-extrabold text-brand-text text-center md:text-left leading-tight">
            Qual será a utilização primordial deste veículo no seu dia a dia?
          </h3>

          <div className="grid grid-cols-1 gap-3">
            {[
              { id: "family", title: "Família, Viagens & Conforto", desc: "Amplo espaço de bagagem, segurança reforçada e conforto na rodovia" },
              { id: "commute", title: "Uso Diário & Eficiência Urbana", desc: "Baixo consumo de combustível, manobrabilidade e agilidade no trânsito" },
              { id: "performance", title: "Esportividade & Emoção de Fim de Semana", desc: "Aceleração vigorosa, ronco esportivo e dirigibilidade afiada" },
            ].map((opt) => {
              const isSelected = answers.use === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => selectUse(opt.id as AnswerState["use"])}
                  className={`w-full min-h-[56px] py-3.5 px-4 text-left rounded-xl bg-brand-card transition-all duration-200 flex flex-col justify-center gap-0.5 shadow-sm border ${
                    isSelected
                      ? "border-2 border-brand-primary bg-brand-primary/5"
                      : "border-brand-border hover:bg-brand-bg hover:border-brand-primary active:scale-[0.98]"
                  }`}
                >
                  <span className="text-xs font-extrabold text-brand-text">{opt.title}</span>
                  <span className="text-[10px] text-brand-text/40 leading-tight">{opt.desc}</span>
                </button>
              );
            })}
          </div>

          <div className="flex justify-between items-center mt-2 px-1">
            <button
              type="button"
              onClick={() => setGameState("q1")}
              className="text-xs text-brand-text/40 hover:text-gray-700 font-bold underline transition-colors"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-brand-text/40 hover:text-gray-700 font-bold underline transition-colors"
            >
              Recomeçar
            </button>
          </div>
        </div>
      )}

      {/* QUESTION 3: Category */}
      {gameState === "q3" && (
        <div className="flex flex-col gap-5 animate-fadeIn">
          <div className="flex justify-between items-center px-1">
            <span className="text-brand-text/50 font-thin uppercase text-xs tracking-wider">Pergunta 3 de 3</span>
            <span className="bg-brand-card-border text-brand-gold px-2.5 py-0.5 rounded-full font-thin uppercase text-[10px] md:text-xs tracking-wider">Carroceria</span>
          </div>

          <h3 className="text-base font-extrabold text-brand-text text-center md:text-left leading-tight">
            Qual estilo de carroceria mais atrai você visualmente?
          </h3>

          <div className="grid grid-cols-1 gap-3">
            {[
              { id: "suv", title: "SUVs Premium & 4x4", desc: "Posição de dirigir elevada, robustez off-road e imponência" },
              { id: "ev", title: "Eletrificados Urbanos & Sedãs", desc: "Silêncio ao rodar, zero emissões locais e tecnologia embarcada de ponta" },
              { id: "performance", title: "Coupés Esportivos & Supercarros", desc: "Linhas fluidas, aerodinâmica refinada e centro de gravidade baixo" },
            ].map((opt) => {
              const isSelected = answers.category === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => selectCategory(opt.id as AnswerState["category"])}
                  className={`w-full min-h-[56px] py-3.5 px-4 text-left rounded-xl bg-brand-card transition-all duration-200 flex flex-col justify-center gap-0.5 shadow-sm border ${
                    isSelected
                      ? "border-2 border-brand-primary bg-brand-primary/5"
                      : "border-brand-border hover:bg-brand-bg hover:border-brand-primary active:scale-[0.98]"
                  }`}
                >
                  <span className="text-xs font-extrabold text-brand-text">{opt.title}</span>
                  <span className="text-[10px] text-brand-text/40 leading-tight">{opt.desc}</span>
                </button>
              );
            })}
          </div>

          <div className="flex justify-between items-center mt-2 px-1">
            <button
              type="button"
              onClick={() => setGameState("q2")}
              className="text-xs text-brand-text/40 hover:text-gray-700 font-bold underline transition-colors"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-brand-text/40 hover:text-gray-700 font-bold underline transition-colors"
            >
              Recomeçar
            </button>
          </div>
        </div>
      )}

      {/* 1.2s SKELETON LOADING STATE */}
      {gameState === "loading" && (
        <div className="flex flex-col gap-5 animate-fadeIn">
          <div className="flex flex-col items-center gap-2 py-4">
            {/* Spinning gold dial */}
            <div className="h-10 w-10 border-4 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
            <span className="text-xs font-bold text-gray-700 tracking-wide mt-2">
              Cruzando preferências com estoque...
            </span>
            <p className="text-[10px] text-brand-text/40 text-center animate-pulse">
              Filtro ativo: {answers.budgetMin === 0 ? `Até ${formatPrice(answers.budgetMax)}` : `${formatPrice(answers.budgetMin)}–${formatPrice(answers.budgetMax)}`}{allowUpsell && " (+15% flex)"} • {answers.use} • {answers.category}
            </p>
          </div>

          {/* 3 pulsing skeletons in responsive grid */}
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="w-full bg-brand-bg border border-brand-card-border rounded-2xl p-4 flex gap-4 animate-pulse"
              >
                <div className="h-20 w-28 bg-brand-border rounded-xl flex-shrink-0" />
                <div className="flex flex-col justify-between w-full py-0.5">
                  <div className="flex flex-col gap-2">
                    <div className="h-3 w-1/3 bg-brand-border rounded" />
                    <div className="h-4 w-2/3 bg-brand-border rounded" />
                  </div>
                  <div className="h-3.5 w-1/4 bg-brand-border rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MATCH RECOMMENDATION RESULTS */}
      {gameState === "results" && (
        <div className="flex flex-col gap-6 animate-scaleUp">
          <div className="flex flex-col items-center text-center gap-1.5 pb-2 border-b border-brand-card-border">
            <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest">
              Curadoria Concluída
            </span>
            <h3 className="text-lg font-extrabold text-brand-text">
              Suas Recomendações Exclusivas
            </h3>
            <p className="text-[10px] text-brand-text/50 max-w-sm">
              Encontramos 3 veículos em estoque alinhados com seu perfil de investimento e uso.
            </p>
          </div>

          {/* AI Curator Global Parecer */}
          {isAiCuratorActive && (
            <div className="bg-brand-bg/40 border border-brand-border/40 rounded-2xl p-4 flex gap-3.5 animate-fadeIn relative overflow-hidden backdrop-blur-md shadow-sm">
              <div className="absolute top-0 right-0 h-24 w-24 bg-brand-primary/5 rounded-full blur-xl pointer-events-none" />
              <div className="h-10 w-10 bg-brand-primary/10 border border-brand-primary/30 rounded-xl flex items-center justify-center shrink-0 text-brand-gold">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M10 2a6 6 0 0 0-6 6v3.586l-.707.707A1 1 0 0 0 4 14h12a1 1 0 0 0 .707-1.707L16 11.586V8a6 6 0 0 0-6-6ZM10 18a3 3 0 0 1-3-3h6a3 3 0 0 1-3 3Z" />
                </svg>
              </div>
              <div className="flex flex-col gap-1 w-full text-left">
                <span className="text-brand-gold font-thin uppercase text-xs tracking-wider flex items-center gap-1.5">
                  🤖 PARECER DO CURADOR DE IA
                </span>
                <p className="text-[11px] text-brand-text/75 leading-relaxed italic">
                  "{getGlobalAiCuratorAdvice(aiQuery, recommendations)}"
                </p>
              </div>
            </div>
          )}

          {/* 3 Custom Match Vehicle Cards */}
          <div className="flex flex-col gap-4">
            {recommendations.length > 0 ? (
              recommendations.map((veiculo, idx) => {
                const pdpUrl = getVeiculoPdpUrl(veiculo);

                const hasDiscount =
                  veiculo.preco_promocional > 0 &&
                  veiculo.preco_promocional < veiculo.preco_original;

                // Create lead msg with reference
                const whatsappNumber = companySettings.whatsappRaw;
                const isUpsell = answers.budgetMax > 0 && (hasDiscount ? veiculo.preco_promocional : veiculo.preco_original) > answers.budgetMax;
                const matchMsg = isUpsell
                  ? `Olá! Realizei o Match de Garagem no site e fiquei muito interessado na recomendação de upgrade do ${veiculo.marca} ${veiculo.modelo} ${veiculo.ano} (${formatPrice(hasDiscount ? veiculo.preco_promocional : veiculo.preco_original)}), que tem ${veiculo.score}% de afinidade comigo. Gostaria de receber mais informações! (Ref: ${agUid})`
                  : `Olá! Realizei o Match de Garagem no site e tive ${veiculo.score}% de afinidade com o ${veiculo.marca} ${veiculo.modelo} ${veiculo.ano} (${formatPrice(hasDiscount ? veiculo.preco_promocional : veiculo.preco_original)}). Gostaria de agendar uma visita! (Ref: ${agUid})`;
                const waMatchUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(matchMsg)}`;

                return (
                  <div
                    key={veiculo.id}
                    className="w-full bg-brand-card hover:bg-brand-bg/50 border border-brand-card-border hover:border-brand-border rounded-2xl flex flex-col sm:flex-row gap-4 transition-all duration-300 relative group overflow-hidden shadow-sm p-0"
                  >
                    {/* Top match percentage banner */}
                    <div className="absolute top-0 right-0 flex items-center z-10 shadow-md rounded-bl-xl overflow-hidden">
                      {isUpsell && (
                        <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white font-thin uppercase text-xs tracking-wider px-3 py-1.5 flex items-center gap-0.5 border-r border-white/10">
                          <span>✨ UPGRADE RECOMENDADO (+{Math.round((((hasDiscount ? veiculo.preco_promocional : veiculo.preco_original) - answers.budgetMax) / answers.budgetMax) * 100)}%)</span>
                        </div>
                      )}
                      <div className="bg-gradient-to-l from-brand-primary to-brand-primary-hover text-white font-thin uppercase text-xs tracking-wider px-3 py-1.5 flex items-center gap-1">
                        <span>{veiculo.score}% MATCH</span>
                      </div>
                    </div>

                    {/* Image block (Full-bleed click-active PDP link) */}
                    <Link
                      href={pdpUrl}
                      className="relative h-44 sm:h-auto w-full sm:w-36 overflow-hidden bg-brand-bg flex-shrink-0 block cursor-pointer select-none"
                    >
                      <Image
                        src={veiculo.whatsapp_images[0] || "/logo.png"}
                        alt={`${veiculo.marca} ${veiculo.modelo}`}
                        fill
                        sizes="(max-w-768px) 100vw, 144px"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </Link>

                    {/* Description and Action button inside card */}
                    <div className="flex flex-col justify-between w-full gap-2 p-4 sm:py-3 sm:pr-4 sm:pl-0">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-bold text-brand-gold uppercase tracking-wider">
                          {veiculo.marca}
                        </span>
                        <h4 className="text-sm font-extrabold text-brand-text leading-tight">
                          {veiculo.modelo}
                        </h4>
                        <p className="text-[10px] text-brand-text/40 line-clamp-1">
                          {veiculo.versao}
                        </p>
                      </div>

                      {/* Specs badges */}
                      <div className="flex gap-2 text-[9px] text-brand-text/50">
                        <span className="bg-brand-bg px-2 py-0.5 rounded-md border border-brand-card-border">{veiculo.ano}</span>
                        <span className="bg-brand-bg px-2 py-0.5 rounded-md border border-brand-card-border">{veiculo.combustivel.split(" ")[0]}</span>
                        <span className="bg-brand-bg px-2 py-0.5 rounded-md border border-brand-card-border truncate max-w-[80px]">{veiculo.cor}</span>
                      </div>

                      {/* AI Curator Individual Parecer */}
                      {isAiCuratorActive && (
                        <div className="bg-brand-bg p-2.5 border border-brand-border/40 rounded-xl flex flex-col gap-1 text-left animate-fadeIn">
                          <span className="text-brand-gold font-thin uppercase text-[10px] md:text-xs tracking-wider">💬 PARECER DO AGENTE DE IA:</span>
                          <p className="text-[10px] text-brand-text/70 leading-relaxed">
                            {getAiCuratorJustification(veiculo, aiQuery)}
                          </p>
                        </div>
                      )}

                      {/* Price and Action Buttons row */}
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <div>
                          {hasDiscount ? (
                            <div className="flex flex-col">
                              <span className="text-[8px] text-brand-text/40 line-through">De {formatPrice(veiculo.preco_original)}</span>
                              <span className="text-xs font-black text-brand-gold">{formatPrice(veiculo.preco_promocional)}</span>
                            </div>
                          ) : (
                            <span className="text-xs font-black text-brand-gold">{formatPrice(veiculo.preco_original)}</span>
                          )}
                        </div>

                        {/* Interactive action buttons */}
                        <div className="flex gap-1.5 items-center">
                          <Link
                            href={pdpUrl}
                            className="h-9 px-3 bg-brand-card hover:bg-brand-bg active:scale-95 rounded-lg border border-brand-border text-[10px] font-bold text-brand-text/50 flex items-center justify-center transition-all duration-200"
                          >
                            Detalhes
                          </Link>
                          <button
                            onClick={() => handleWhatsappMatchClick(veiculo, matchMsg)}
                            className="h-9 px-3 bg-green-600 hover:bg-green-500 active:scale-95 rounded-lg text-white text-[10px] font-extrabold uppercase tracking-wide flex items-center justify-center gap-1 transition-all duration-200 shadow-md shadow-green-900/10 cursor-pointer"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" className="w-3 h-3">
                              <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
                            </svg>
                            Fazer Proposta
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-xs text-brand-text/40">
                Nenhum veículo disponível no estoque no momento.
              </div>
            )}
          </div>

          {/* Reset button */}
          <button
            type="button"
            onClick={handleReset}
            className="w-full h-12 bg-brand-bg hover:bg-brand-card-border active:scale-95 border border-brand-border rounded-xl font-bold uppercase tracking-wider text-xs text-brand-text/50 transition-all duration-300 shadow-sm"
          >
            Refazer Questionário
          </button>
        </div>
      )}

      {/* Positive Friction Lead Capture Modal */}
      <LeadCaptureModal
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        onSubmit={handleLeadSubmit}
        vehicleInfo={activeVehicle ? {
          marca: activeVehicle.marca,
          modelo: activeVehicle.modelo,
          ano: activeVehicle.ano
        } : undefined}
      />
      </div>
    </section>
  );
}
