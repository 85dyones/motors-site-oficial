"use client";

import { useState, useEffect } from "react";
import { calculateFinancing, SimulationResult } from "../lib/finance-calculator";

export interface SimulacaoData {
  valor_veiculo: number;
  valor_entrada: number;
  percentual_entrada: number;
  tipo_entrada: "dinheiro" | "veiculo_troca";
  parcelas: number;
  valor_parcela: number;
  ocupacao: string;
}

interface CalculadoraProps {
  vehiclePrice: number;
  vehicleYear: number;
  vehicleName: string;
  onSimulateClick: (message: string, simulacaoData?: SimulacaoData) => void;
}

type OcupacaoType = "publico" | "aposentado" | "clt" | "autonomo" | "outros";
type TipoEntradaType = "dinheiro" | "veiculo_troca" | "sem_entrada";

export default function CalculadoraFinanciamento({
  vehiclePrice,
  vehicleYear,
  vehicleName,
  onSimulateClick,
}: CalculadoraProps) {
  const [downPaymentPercent, setDownPaymentPercent] = useState<number>(30);
  const [installments, setInstallments] = useState<number>(48);
  const [occupation, setOccupation] = useState<OcupacaoType>("clt");
  const [tipoEntrada, setTipoEntrada] = useState<TipoEntradaType>("dinheiro");
  const [result, setResult] = useState<SimulationResult | null>(null);
  
  useEffect(() => {
    const downPaymentValue = vehiclePrice * (downPaymentPercent / 100);
    const res = calculateFinancing({
      vehiclePrice,
      vehicleYear,
      downPaymentValue,
      installments,
      occupation
    });
    setResult(res);
  }, [vehiclePrice, vehicleYear, downPaymentPercent, installments, occupation]);

  const handleSimulateAction = () => {
    if (!result) return;
    const downPaymentValue = vehiclePrice * (downPaymentPercent / 100);
    const entradaFormatada = downPaymentValue.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
    const parcelaFormatada = result.parcela_mensal.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
    const entradaTexto = tipoEntrada === "sem_entrada" ? "sem entrada" : (tipoEntrada === "dinheiro" ? "em dinheiro" : "como veículo na troca");
    
    const msg = `Olá! Tenho interesse no ${vehicleName} e gostaria de ver se aprova um financiamento.
Fiz uma simulação no site ${tipoEntrada === "sem_entrada" ? "sem entrada (100% financiado)" : `com R$ ${entradaFormatada} de entrada (${entradaTexto})`} e saldo em ${installments}x de R$ ${parcelaFormatada}. Podem me ajudar?`;

    const simulacaoData: SimulacaoData = {
      valor_veiculo: vehiclePrice,
      valor_entrada: downPaymentValue,
      percentual_entrada: downPaymentPercent,
      tipo_entrada: tipoEntrada,
      parcelas: installments,
      valor_parcela: result.parcela_mensal,
      ocupacao: occupation
    };

    onSimulateClick(msg, simulacaoData);
  };

  const formatCurrency = (val: number) => {
    return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  if (!result) return null;

  const entradaValue = vehiclePrice * (downPaymentPercent / 100);

  return (
    <div className="bg-brand-bg/50 border border-brand-border/40 rounded-2xl p-5 shadow-sm mt-6">
      <h3 className="text-sm font-extrabold text-brand-primary uppercase tracking-wider mb-4 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Simulador de Financiamento
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Ocupação Selector */}
        <div className="flex flex-col h-full justify-between">
          <label className="text-[11px] font-bold text-brand-text/60 uppercase tracking-wide mb-2 block">
            Seu Perfil Profissional
          </label>
          <select
            value={occupation}
            onChange={(e) => setOccupation(e.target.value as OcupacaoType)}
            className="w-full bg-white border border-brand-border/60 rounded-xl text-xs font-bold text-brand-text px-3 h-12 focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10 transition-all duration-300"
          >
            <option value="clt">Trabalhador CLT</option>
            <option value="publico">Funcionário Público</option>
            <option value="aposentado">Aposentado / Pensionista</option>
            <option value="autonomo">Profissional Autônomo / PJ</option>
            <option value="outros">Outros</option>
          </select>
        </div>

        {/* Tipo de Entrada Selector */}
        <div className="flex flex-col h-full justify-between">
          <label className="text-[11px] font-bold text-brand-text/60 uppercase tracking-wide mb-2 block">
            Forma de Entrada
          </label>
          <select
            value={tipoEntrada}
            onChange={(e) => {
              const val = e.target.value as TipoEntradaType;
              setTipoEntrada(val);
              if (val === "sem_entrada") setDownPaymentPercent(0);
            }}
            className="w-full bg-white border border-brand-border/60 rounded-xl text-xs font-bold text-brand-text px-3 h-12 focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10 transition-all duration-300"
          >
            <option value="dinheiro">Dinheiro (PIX/Transferência)</option>
            <option value="veiculo_troca">Veículo na Troca</option>
            <option value="sem_entrada">Sem entrada (100% Financiado)</option>
          </select>
        </div>
      </div>
      
      {/* Entrada Slider */}
      <div className={`mb-6 transition-opacity duration-300 ${tipoEntrada === "sem_entrada" ? "opacity-50 pointer-events-none" : ""}`}>
        <div className="flex justify-between items-end mb-2">
          <label className="text-[11px] font-bold text-brand-text/60 uppercase tracking-wide">
            Sua Entrada ({downPaymentPercent}%)
          </label>
          <span className="text-sm font-extrabold text-brand-text">
            {formatCurrency(entradaValue)}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="90"
          step="10"
          value={downPaymentPercent}
          onChange={(e) => setDownPaymentPercent(Number(e.target.value))}
          disabled={tipoEntrada === "sem_entrada"}
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
            R$ {result.parcela_mensal.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </span>
        </div>
        <div className="text-[9px] text-brand-text/50 mt-3 font-medium text-center leading-relaxed">
          <p className="mb-1 text-brand-text/70 font-semibold">
            CET a partir de {result.taxa_aplicada_mes_pct.toFixed(2)}% a.m. ({result.perfil_calculado})
          </p>
          <p>
            Esta simulação usa taxas que podem variar dependendo de análises das instituições bancárias referente ao crédito disponível e "score" de cada pessoa. Valores incluem TAC e IOF.
          </p>
        </div>
      </div>

      <button
        onClick={handleSimulateAction}
        className="mt-4 w-full bg-brand-primary hover:bg-brand-primary-hover text-white py-3.5 rounded-xl font-bold uppercase text-xs tracking-widest transition-all duration-300 active:scale-95 shadow-sm shadow-brand-primary/30 flex items-center justify-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        QUERO MAIS INFO SOBRE FINANCIAMENTO
      </button>
    </div>
  );
}
