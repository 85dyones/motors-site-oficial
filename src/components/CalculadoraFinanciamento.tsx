"use client";

import { useState, useEffect } from "react";
import { calculateFinancing, SimulationResult } from "../lib/finance-calculator";

interface CalculadoraProps {
  vehiclePrice: number;
  vehicleYear: number;
  vehicleName: string;
  onSimulateClick: (message: string) => void;
}

export default function CalculadoraFinanciamento({
  vehiclePrice,
  vehicleYear,
  vehicleName,
  onSimulateClick,
}: CalculadoraProps) {
  const [downPaymentPercent, setDownPaymentPercent] = useState<number>(30);
  const [installments, setInstallments] = useState<number>(48);
  const [result, setResult] = useState<SimulationResult | null>(null);
  
  useEffect(() => {
    const res = calculateFinancing({
      vehiclePrice,
      vehicleYear,
      downPaymentPercent,
      installments
    });
    setResult(res);
  }, [vehiclePrice, vehicleYear, downPaymentPercent, installments]);

  const handleSimulateAction = () => {
    if (!result) return;
    const msg = `Olá! Tenho interesse no ${vehicleName} e gostaria de ver se aprova um financiamento.
Fiz uma simulação no site com R$ ${result.downPaymentValue.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2})} de entrada e saldo em ${installments}x de R$ ${result.monthlyInstallment.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2})}. Podem me ajudar?`;
    onSimulateClick(msg);
  };

  const formatCurrency = (val: number) => {
    return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  if (!result) return null;

  return (
    <div className="bg-brand-bg/50 border border-brand-border/40 rounded-2xl p-5 shadow-sm mt-6">
      <h3 className="text-sm font-extrabold text-brand-primary uppercase tracking-wider mb-4 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Simulador de Financiamento
      </h3>
      
      {/* Entrada Slider */}
      <div className="mb-6">
        <div className="flex justify-between items-end mb-2">
          <label className="text-[11px] font-bold text-brand-text/60 uppercase tracking-wide">
            Sua Entrada ({downPaymentPercent}%)
          </label>
          <span className="text-sm font-extrabold text-brand-text">
            {formatCurrency(result.downPaymentValue)}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="90"
          step="10"
          value={downPaymentPercent}
          onChange={(e) => setDownPaymentPercent(Number(e.target.value))}
          className="w-full h-2 bg-brand-border rounded-lg appearance-none cursor-pointer accent-brand-primary"
        />
        <div className="flex justify-between text-[10px] text-brand-text/40 font-medium mt-1">
          <span>R$ 0</span>
          <span>90%</span>
        </div>
      </div>

      {/* Parcelas Selector */}
      <div className="mb-6">
        <label className="text-[11px] font-bold text-brand-text/60 uppercase tracking-wide mb-2 block">
          Prazo (Meses)
        </label>
        <div className="grid grid-cols-4 gap-2">
          {[24, 36, 48, 60].map((prazo) => (
            <button
              key={prazo}
              onClick={() => setInstallments(prazo)}
              className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                installments === prazo
                  ? "bg-brand-primary border-brand-primary text-white shadow-sm"
                  : "bg-white border-brand-border/60 text-brand-text hover:border-brand-primary/50"
              }`}
            >
              {prazo}x
            </button>
          ))}
        </div>
      </div>

      {/* Resultado Visor */}
      <div className="bg-white border border-brand-border/60 rounded-xl p-4 flex flex-col items-center justify-center text-center relative overflow-hidden">
        <span className="text-[10px] font-bold text-brand-text/50 uppercase tracking-wider mb-1">
          Parcela Estimada
        </span>
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-bold text-brand-text/70">{installments}x de</span>
          <span className="text-3xl font-black text-brand-primary tracking-tight">
            R$ {result.monthlyInstallment.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </span>
        </div>
        <p className="text-[9px] text-brand-text/40 uppercase mt-2 font-medium">
          Taxas referenciais a partir de {result.interestRateApplied.toFixed(2)}% a.m. <br/>
          Sujeito à análise de crédito do seu banco.
        </p>
      </div>

      <button
        onClick={handleSimulateAction}
        className="mt-4 w-full bg-[#25D366] hover:bg-[#1EBE5D] text-white py-3.5 rounded-xl font-bold uppercase text-xs tracking-wider transition-all duration-300 active:scale-95 shadow-sm shadow-[#25D366]/20 flex items-center justify-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 0 0 6.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5Z" clipRule="evenodd" />
        </svg>
        Analisar Crédito Rápido
      </button>
    </div>
  );
}
