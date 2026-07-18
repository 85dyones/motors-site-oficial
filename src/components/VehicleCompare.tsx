"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useTheme } from "../app/ThemeContext";
import { getEstoque, Veiculo } from "../lib/supabase";

interface VehicleCompareProps {
  onClose?: () => void;
}

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  });
}

function formatKm(value: number): string {
  if (value === 0) return "Sem Uso (0 km)";
  return `${value.toLocaleString("pt-BR")} km`;
}

function resolveMotorizacao(v: Veiculo): string {
  const brand = (v.marca || "").toLowerCase().trim();
  const model = (v.modelo || "").toLowerCase().trim();
  const version = (v.versao || "").toLowerCase().trim();
  const desc = (v.opcionais || v.laudo_pericia || v.descricao || "").toLowerCase().trim();
  const fuel = (v.combustivel || "").toLowerCase().trim();

  // 1. Check if motorcycle / moto
  const isMoto = 
    brand.includes("harley") || 
    (brand.includes("honda") && (model.includes("cb ") || model.includes("twister") || model.includes("adv"))) ||
    model.includes("cb 250") || model.includes("cb 300") || model.includes("adv 150");

  if (isMoto) {
    if (model.includes("250") || version.includes("250")) return "250cc Monocilíndrico SOHC";
    if (model.includes("300") || version.includes("300")) return "300cc Monocilíndrico Flex";
    if (model.includes("150") || version.includes("150")) return "150cc Monocilíndrico OHC";
    if (brand.includes("harley") || model.includes("dyna") || model.includes("glide")) return "1600cc V-Twin (Twin Cam)";
    return "Motor de Motocicleta";
  }

  // 2. Check if Electric or Hybrid
  const isEV = fuel.includes("elétrico") || fuel.includes("eletrico") || fuel.includes("ev") || model.includes(" ev") || version.includes(" ev");
  const isHybrid = fuel.includes("híbrido") || fuel.includes("hibrido") || fuel.includes("mhev") || model.includes("mhev") || version.includes("mhev");

  let typeSuffix = "Flex";
  if (fuel.includes("gasolina")) typeSuffix = "Gasolina";
  else if (fuel.includes("diesel")) typeSuffix = "Diesel";
  else if (isEV) typeSuffix = "100% Elétrico";
  else if (isHybrid) typeSuffix = "Híbrido";

  // 3. Extract capacity from version / model
  let displacement = "";
  // Check common patterns in model/version
  const dispMatch = (model + " " + version).match(/\b\d\.\d/);
  if (dispMatch) {
    displacement = dispMatch[0];
  } else {
    // Check non-dotted patterns or specific models
    if ((model + " " + version).includes("250 tsi") || (model + " " + version).includes("250tsi")) {
      displacement = "1.4";
    } else if ((model + " " + version).includes("350 tsi") || (model + " " + version).includes("350tsi")) {
      displacement = "2.0";
    } else if ((model + " " + version).includes("t270")) {
      displacement = "1.3";
    } else if (model.includes("mille") || model.includes("uno mile")) {
      displacement = "1.0";
    } else if (model.includes("livina xgear 18") || version.includes("18sl")) {
      displacement = "1.8";
    } else if (model.includes("c-180") || model.includes("c180")) {
      displacement = "1.8";
    } else {
      displacement = "2.0"; // fallback default
    }
  }

  // 4. Check if Turbo
  const isTurbo = 
    model.includes("turbo") || version.includes("turbo") || desc.includes("turbo") ||
    model.includes("tb") || version.includes("tb") ||
    model.includes("tsi") || version.includes("tsi") ||
    model.includes("t270") || version.includes("t270") ||
    model.includes("cgi") || version.includes("cgi") ||
    model.includes("m40i") || version.includes("m40i") ||
    model.includes("twinpower") || version.includes("twinpower") ||
    model.includes("d-4d") || version.includes("d-4d") ||
    model.includes("d300") || version.includes("d300") ||
    model.includes("pdk") || version.includes("pdk");

  let turboText = isTurbo ? "Turbo" : "Aspirado";
  if (displacement === "1.0" && model.includes("up!") && model.includes("tsi")) {
    turboText = "TSI Turbo";
  } else if (isTurbo && brand.includes("bmw")) {
    turboText = "TwinPower Turbo";
  } else if (isTurbo && (model.includes("tsi") || version.includes("tsi"))) {
    turboText = "TSI Turbo";
  } else if (isTurbo && brand.includes("porsche") && model.includes("911")) {
    turboText = "Twin-Turbo";
  }

  if (isEV) {
    return `Propulsão Elétrica (100% EV)`;
  }
  if (isHybrid) {
    return `${displacement} Litros ${turboText} Híbrido`;
  }

  return `${displacement} Litros ${turboText} ${typeSuffix}`;
}

export default function VehicleCompare({ onClose }: VehicleCompareProps) {
  const { compareIds, addToCompare, removeFromCompare, clearCompare, setCompareList } = useTheme();
  const [vehicles, setVehicles] = useState<Veiculo[]>([]);
  const [fullStock, setFullStock] = useState<Veiculo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search input and focus states for empty slots
  const [searchQueries, setSearchQueries] = useState<Record<number, string>>({});
  const [focusedSlot, setFocusedSlot] = useState<number | null>(null);

  // Accordion open/close states
  const [basicasOpen, setBasicasOpen] = useState(true);
  const [mecanicaOpen, setMecanicaOpen] = useState(true);
  const [historicoOpen, setHistoricoOpen] = useState(true);

  // Load selected vehicles and full inventory on mount
  useEffect(() => {
    async function fetchCompareVehicles() {
      setIsLoading(true);
      const estoque = await getEstoque();
      setFullStock(estoque);
      const filtered = estoque.filter((v) => compareIds.includes(v.id));
      setVehicles(filtered);
      setIsLoading(false);
      
      // Telemetry log for opening comparison matrix
      console.log(`[Antigravity UI] Janela de comparação expandida em tela cheia com ${filtered.length} modelos`);
    }
    fetchCompareVehicles();
  }, [compareIds]);

  const handleSearchChange = (slotIdx: number, val: string) => {
    setSearchQueries(prev => ({ ...prev, [slotIdx]: val }));
  };

  const getFilteredOptions = (slotIdx: number) => {
    const query = (searchQueries[slotIdx] || "").toLowerCase().trim();
    // Exclude cars already selected in comparison
    const available = fullStock.filter(car => !compareIds.includes(car.id) && !car.vendido);
    
    if (!query) return available;
    
    return available.filter(car => 
      (car.marca || "").toLowerCase().includes(query) ||
      (car.modelo || "").toLowerCase().includes(query) ||
      (car.versao || "").toLowerCase().includes(query)
    );
  };

  // Dynamic Preset Generation
  const getPresets = () => {
    const presets: { id: string; name: string; icon: string; cars: Veiculo[] }[] = [];

    const getDistinct = (cars: Veiculo[], limit: number) => {
      const distinct: Veiculo[] = [];
      const seen = new Set<string>();
      for (const c of cars) {
        const key = (c.marca + " " + c.modelo).toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          distinct.push(c);
          if (distinct.length === limit) break;
        }
      }
      if (distinct.length < limit) {
        for (const c of cars) {
          if (!distinct.find(d => d.id === c.id)) {
            distinct.push(c);
            if (distinct.length === limit) break;
          }
        }
      }
      return distinct;
    };

    // 1. SUVs de Luxo
    const suvs = fullStock.filter(v => v.tipo === "SUV" && !v.vendido);
    if (suvs.length >= 2) {
      presets.push({
        id: "suvs_luxo",
        name: "SUVs Premium",
        icon: "SUV",
        cars: getDistinct(suvs, 3)
      });
    }

    // 2. Híbridos & EVs
    const hibridosEvs = fullStock.filter(v => 
      (v.combustivel === "Elétrico" || v.combustivel === "Híbrido") && !v.vendido
    );
    if (hibridosEvs.length >= 2) {
      presets.push({
        id: "hibridos_evs",
        name: "Híbridos & EVs",
        icon: "EV",
        cars: getDistinct(hibridosEvs, 3)
      });
    }

    // 3. Linhagem Esportiva (Usando potência ou marca se perfil_uso não existe mais)
    const esportivos = fullStock.filter(v => 
      ((v.marca || "").toLowerCase() === "porsche" || (v.marca || "").toLowerCase() === "bmw" || (v.versao || "").toLowerCase().includes("amg") || (v.versao || "").toLowerCase().includes("m sport")) && !v.vendido
    );
    if (esportivos.length >= 2) {
      presets.push({
        id: "esportivos",
        name: "Performance & Pista",
        icon: "Sport",
        cars: getDistinct(esportivos, 3)
      });
    }

    // 4. Melhor Custo-Benefício
    const custoBeneficio = fullStock.filter(v => v.preco_original > 0 && v.preco_original < 200000 && !v.vendido);
    if (custoBeneficio.length >= 2) {
      presets.push({
        id: "custo_beneficio",
        name: "Melhor Custo-Benefício",
        icon: "Fipe",
        cars: getDistinct(custoBeneficio, 3)
      });
    }

    return presets;
  };

  if (compareIds.length === 0) {
    return (
      <div className="fixed inset-0 w-screen h-screen z-50 overflow-y-auto bg-brand-bg p-4 mobile:p-2 flex flex-col items-center justify-center animate-fadeIn">
        <div className="w-full max-w-md py-16 px-6 text-center bg-brand-card border border-brand-card-border rounded-3xl shadow-lg flex flex-col items-center gap-4 animate-scaleUp">
          <div className="h-16 w-16 bg-brand-primary/10 rounded-full flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="h-8 w-8 text-brand-primary">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h7.5m3 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-6-12h3M4.5 15.75H19.5v-3.75L17.25 9H6.75L4.5 12v3.75Z" />
            </svg>
          </div>
          <h4 className="text-lg font-black text-brand-text">Comparador Vazio</h4>
          <p className="text-xs text-brand-text/50 max-w-xs leading-relaxed">
            Nenhum veículo selecionado para comparação. Adicione até 3 veículos na listagem para ver a matriz técnica completa.
          </p>
          {onClose && (
            <button
              onClick={onClose}
              className="mt-2 px-5 py-2.5 bg-brand-primary text-white font-extrabold text-xs uppercase tracking-widest rounded-xl hover:bg-brand-primary-hover active:scale-95 transition-all duration-300"
            >
              Voltar ao Estoque
            </button>
          )}
        </div>
      </div>
    );
  }

  // Columns layout depends on compare count (+1 for the labels column)
  const colsCount = vehicles.length + 1;

  return (
    <div className="fixed inset-0 w-screen h-screen z-50 overflow-y-auto bg-brand-bg p-4 mobile:p-2 animate-fadeIn flex flex-col gap-6">
      
      {/* Header bar controls — premium floating sticky console */}
      <div className="sticky top-0 z-20 flex items-center justify-between bg-brand-card/95 backdrop-blur-md border border-brand-border/60 p-4 max-sm:p-3 rounded-2xl shadow-lg mb-4 animate-scaleUp">
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] font-bold uppercase text-brand-primary tracking-widest">
            Comparar Modelos
          </span>
          <h3 className="text-base md:text-lg font-bold text-brand-text leading-none">
            Matriz Comparativa
          </h3>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Limpar Seleção Button */}
          <button
            onClick={clearCompare}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider bg-red-600 hover:bg-red-700 text-white px-3.5 h-10 rounded-xl transition-all duration-300 active:scale-95 shadow-md shadow-red-950/20 border border-red-700/35"
            title="Limpar seleção de veículos"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            <span>Limpar Seleção</span>
          </button>
          
          {onClose && (
            /* Fechar Matriz Button */
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider bg-brand-primary hover:bg-brand-primary-hover text-white px-4 h-10 rounded-xl transition-all duration-300 active:scale-95 shadow-md shadow-brand-primary/25 border border-brand-primary-hover"
              title="Fechar matriz de comparação"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5 flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Fechar Matriz</span>
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="w-full h-64 bg-brand-bg rounded-2xl animate-pulse flex items-center justify-center text-xs text-brand-text/40">
          Carregando matriz comparativa...
        </div>
      ) : (
        <div className="w-full overflow-x-auto scrollbar-thin">
          <div className="min-w-[700px] flex flex-col gap-4">
            
            {/* 1. VEHICLE CARDS HEADER ROW */}
            <div className="grid grid-cols-4 gap-3 items-start pb-3 border-b border-brand-border">
              {/* Labels column slot */}
              <div className="flex flex-col justify-center h-full p-3">
                <span className="text-[10px] font-semibold text-brand-primary uppercase tracking-widest">
                  Modelos Selecionados
                </span>
                <p className="text-[9px] text-brand-text/35 leading-snug mt-0.5">
                  Lado a lado para auditoria.
                </p>
              </div>

              {/* Dynamic Vehicle Columns */}
              {vehicles.map((car) => {
                const hasDiscount = car.preco_promocional > 0 && car.preco_promocional < car.preco_original;
                const activePrice = hasDiscount ? car.preco_promocional : car.preco_original;

                return (
                  <div key={car.id} className="relative flex flex-col gap-2 p-2 bg-brand-bg rounded-xl border border-brand-border/60 hover:border-brand-primary/20 transition-all duration-300 group">
                    {/* Remove button */}
                    <button
                      onClick={() => removeFromCompare(car.id)}
                      className="absolute top-2 right-2 z-10 h-7 w-7 bg-red-600 hover:bg-red-500 text-white font-extrabold text-[10px] rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 shadow-sm"
                      title="Remover veículo"
                    >
                      ✕
                    </button>

                    {/* Vehicle cover Image */}
                    <div className="relative aspect-[16/10] overflow-hidden bg-brand-bg w-full border-none p-0 m-0 rounded-lg">
                      <Image
                        src={car.whatsapp_images[0] || "/logo.png"}
                        alt={`${car.marca} ${car.modelo}`}
                        fill
                        className="w-full border-none p-0 m-0 object-cover transition-transform duration-500 group-hover:scale-103"
                        sizes="200px"
                      />
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-[8px] font-semibold uppercase text-brand-primary tracking-widest">{car.marca}</span>
                      <h4 className="text-sm font-bold text-brand-text leading-tight truncate">{car.modelo}</h4>
                      <p className="text-[9px] text-brand-text/40 truncate leading-none mt-0.5">{car.versao}</p>
                    </div>

                    <div className="flex flex-col bg-brand-card border border-brand-card-border p-2 rounded-xl text-center">
                      <span className="text-[8px] font-bold text-brand-text/40 uppercase tracking-widest mb-0.5">Valor</span>
                      <span className="text-sm font-bold text-brand-primary">{formatPrice(activePrice)}</span>
                    </div>
                  </div>
                );
              })}

              {/* Fill remaining column slots with search search box */}
              {Array.from({ length: 3 - vehicles.length }).map((_, index) => {
                const slotIndex = vehicles.length + index;
                return (
                  <div key={slotIndex} className="relative border border-dashed border-brand-border/80 rounded-xl p-3 h-full flex flex-col justify-start gap-2 min-h-[160px] bg-brand-card/20 select-none animate-fadeIn">
                    <div className="flex items-center gap-1.5 text-[10px] text-brand-text/40 font-bold uppercase tracking-widest">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="h-3.5 w-3.5 text-brand-primary">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      <span>Adicionar Carro</span>
                    </div>
                    
                    <div className="relative w-full">
                      <input
                        type="text"
                        placeholder="Buscar marca ou modelo..."
                        value={searchQueries[slotIndex] || ""}
                        onChange={(e) => handleSearchChange(slotIndex, e.target.value)}
                        onFocus={() => setFocusedSlot(slotIndex)}
                        onBlur={() => setTimeout(() => setFocusedSlot(null), 200)}
                        className="w-full bg-brand-bg text-brand-text text-xs border border-brand-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand-primary transition-all placeholder:text-brand-text/30"
                      />
                      
                      {/* Dropdown list */}
                      {focusedSlot === slotIndex && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 z-30 max-h-48 overflow-y-auto bg-brand-card border border-brand-border rounded-lg shadow-xl divide-y divide-brand-border/40 scrollbar-thin">
                          {getFilteredOptions(slotIndex).length > 0 ? (
                            getFilteredOptions(slotIndex).map((car) => (
                              <button
                                key={car.id}
                                onClick={() => {
                                  addToCompare(car.id);
                                  handleSearchChange(slotIndex, "");
                                  setFocusedSlot(null);
                                }}
                                className="w-full text-left px-3 py-2 text-[11px] hover:bg-brand-primary/10 hover:text-brand-primary transition-colors flex flex-col gap-0.5"
                              >
                                <span className="font-extrabold uppercase text-[9px] text-brand-text/40">{car.marca}</span>
                                <span className="font-bold text-brand-text">{car.modelo}</span>
                                <span className="text-[9px] text-brand-text/50 truncate">{car.versao} • {car.ano}</span>
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-2.5 text-center text-[10px] text-brand-text/40">
                              Nenhum veículo disponível
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 2. SPECIFICATION ACCORDIONS & PERFECTLY ALIGNED ROWS */}
            <div className="flex flex-col gap-3">
              
              {/* Accordion: Informações Básicas */}
              <div className="bg-brand-card border border-brand-card-border rounded-2xl overflow-hidden shadow-sm">
                <button
                  onClick={() => setBasicasOpen(!basicasOpen)}
                  className="w-full flex items-center justify-between p-4 text-left font-black text-xs text-brand-text bg-brand-bg border-b border-brand-border/60 hover:text-brand-primary transition-colors duration-200"
                >
                  <span className="uppercase tracking-widest flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4 text-brand-primary">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                    </svg>
                    INFORMAÇÕES BÁSICAS
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="3"
                    stroke="currentColor"
                    className={`w-3.5 h-3.5 text-brand-primary transition-transform duration-300 ${basicasOpen ? "rotate-180" : ""}`}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                <div className={`transition-all duration-300 overflow-hidden ${basicasOpen ? "max-h-[500px]" : "max-h-0"}`}>
                  <div className="flex flex-col divide-y divide-brand-border/50">
                    {/* Row Marca / Modelo */}
                    <div className="grid grid-cols-4 gap-4 px-4 py-3 text-xs items-center">
                      <span className="text-brand-gold font-bold uppercase text-[9px] tracking-wider">MARCA / MODELO</span>
                      {vehicles.map((car) => (
                        <span key={car.id} className="text-brand-text font-extrabold">{car.marca} {car.modelo}</span>
                      ))}
                      {Array.from({ length: 3 - vehicles.length }).map((_, i) => (
                        <span key={i} className="text-brand-text/20">—</span>
                      ))}
                    </div>
                    {/* Row Ano */}
                    <div className="grid grid-cols-4 gap-4 px-4 py-3 text-xs items-center bg-brand-bg/10">
                      <span className="text-brand-gold font-bold uppercase text-[9px] tracking-wider">ANO FABRICAÇÃO</span>
                      {vehicles.map((car) => (
                        <span key={car.id} className="text-brand-text font-extrabold">{car.ano}</span>
                      ))}
                      {Array.from({ length: 3 - vehicles.length }).map((_, i) => (
                        <span key={i} className="text-brand-text/20">—</span>
                      ))}
                    </div>
                    {/* Row Quilometragem */}
                    <div className="grid grid-cols-4 gap-4 px-4 py-3 text-xs items-center">
                      <span className="text-brand-gold font-bold uppercase text-[9px] tracking-wider">QUILOMETRAGEM</span>
                      {vehicles.map((car) => (
                        <span key={car.id} className="text-brand-text font-extrabold">{formatKm(car.quilometragem)}</span>
                      ))}
                      {Array.from({ length: 3 - vehicles.length }).map((_, i) => (
                        <span key={i} className="text-brand-text/20">—</span>
                      ))}
                    </div>
                    {/* Row Carroceria */}
                    <div className="grid grid-cols-4 gap-4 px-4 py-3 text-xs items-center bg-brand-bg/10">
                      <span className="text-brand-gold font-bold uppercase text-[9px] tracking-wider">TIPO CARROCERIA</span>
                      {vehicles.map((car) => (
                        <span key={car.id} className="text-brand-text font-extrabold">{car.tipo || "Premium"}</span>
                      ))}
                      {Array.from({ length: 3 - vehicles.length }).map((_, i) => (
                        <span key={i} className="text-brand-text/20">—</span>
                      ))}
                    </div>
                    {/* Row Cor */}
                    <div className="grid grid-cols-4 gap-4 px-4 py-3 text-xs items-center">
                      <span className="text-brand-gold font-bold uppercase text-[9px] tracking-wider">COR EXTERNA</span>
                      {vehicles.map((car) => (
                        <span key={car.id} className="text-brand-text font-extrabold">{car.cor}</span>
                      ))}
                      {Array.from({ length: 3 - vehicles.length }).map((_, i) => (
                        <span key={i} className="text-brand-text/20">—</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Accordion: Mecânica e Performance */}
              <div className="bg-brand-card border border-brand-card-border rounded-2xl overflow-hidden shadow-sm">
                <button
                  onClick={() => setMecanicaOpen(!mecanicaOpen)}
                  className="w-full flex items-center justify-between p-4 text-left font-black text-xs text-brand-text bg-brand-bg border-b border-brand-border/60 hover:text-brand-primary transition-colors duration-200"
                >
                  <span className="uppercase tracking-widest flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4 text-brand-primary">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A1.5 1.5 0 0 0 19.5 21l2-2a1.5 1.5 0 0 0 0-2.25l-5.83-5.83m-4.25 4.25a2.25 2.25 0 1 1-3.07-3.07m3.07 3.07a2.25 2.25 0 0 0-.17-2.37l5.39-5.39a2.25 2.25 0 0 1 2.37.17M15 9l-1.42-1.42a1.5 1.5 0 0 0-2.25 0l-2 2a1.5 1.5 0 0 0 0 2.25L10.75 13" />
                    </svg>
                    MECÂNICA E PERFORMANCE
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="3"
                    stroke="currentColor"
                    className={`w-3.5 h-3.5 text-brand-primary transition-transform duration-300 ${mecanicaOpen ? "rotate-180" : ""}`}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                <div className={`transition-all duration-300 overflow-hidden ${mecanicaOpen ? "max-h-[500px]" : "max-h-0"}`}>
                  <div className="flex flex-col divide-y divide-brand-border/50">
                    {/* Row Câmbio */}
                    <div className="grid grid-cols-4 gap-4 px-4 py-3 text-xs items-center">
                      <span className="text-brand-gold font-bold uppercase text-[9px] tracking-wider">CÂMBIO / TRANSMISSÃO</span>
                      {vehicles.map((car) => (
                        <span key={car.id} className="text-brand-text font-extrabold truncate">{car.cambio}</span>
                      ))}
                      {Array.from({ length: 3 - vehicles.length }).map((_, i) => (
                        <span key={i} className="text-brand-text/20">—</span>
                      ))}
                    </div>
                    {/* Row Motorização */}
                    <div className="grid grid-cols-4 gap-4 px-4 py-3 text-xs items-center bg-brand-bg/10">
                      <span className="text-brand-gold font-bold uppercase text-[9px] tracking-wider">MOTORIZAÇÃO</span>
                      {vehicles.map((car) => (
                        <span key={car.id} className="text-brand-text font-extrabold truncate">{resolveMotorizacao(car)}</span>
                      ))}
                      {Array.from({ length: 3 - vehicles.length }).map((_, i) => (
                        <span key={i} className="text-brand-text/20">—</span>
                      ))}
                    </div>
                    {/* Row Combustível */}
                    <div className="grid grid-cols-4 gap-4 px-4 py-3 text-xs items-center">
                      <span className="text-brand-gold font-bold uppercase text-[9px] tracking-wider">COMBUSTÍVEL</span>
                      {vehicles.map((car) => (
                        <span key={car.id} className="text-brand-text font-extrabold truncate">{car.combustivel}</span>
                      ))}
                      {Array.from({ length: 3 - vehicles.length }).map((_, i) => (
                        <span key={i} className="text-brand-text/20">—</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Accordion: Histórico e Vistoria */}
              <div className="bg-brand-card border border-brand-card-border rounded-2xl overflow-hidden shadow-sm">
                <button
                  onClick={() => setHistoricoOpen(!historicoOpen)}
                  className="w-full flex items-center justify-between p-4 text-left font-black text-xs text-brand-text bg-brand-bg border-b border-brand-border/60 hover:text-brand-primary transition-colors duration-200"
                >
                  <span className="uppercase tracking-widest flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4 text-brand-primary">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" />
                    </svg>
                    HISTÓRICO E VISTORIA
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="3"
                    stroke="currentColor"
                    className={`w-3.5 h-3.5 text-brand-primary transition-transform duration-300 ${historicoOpen ? "rotate-180" : ""}`}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                <div className={`transition-all duration-300 overflow-hidden ${historicoOpen ? "max-h-[300px]" : "max-h-0"}`}>
                  <div className="flex flex-col divide-y divide-brand-border/50">
                    {/* Row Perícia */}
                    <div className="grid grid-cols-4 gap-4 px-4 py-4 text-xs items-center">
                      <span className="text-brand-gold font-bold uppercase text-[9px] tracking-wider">PERÍCIA CAUTELAR</span>
                      {vehicles.map((car) => {
                        const periciaSafe = car.pericia || "";
                        const isAprovado = periciaSafe.toLowerCase().includes("aprovad");
                        const isAnalise = periciaSafe.toLowerCase().includes("analis") || periciaSafe.toLowerCase().includes("análise");
                        
                        return (
                          <div key={car.id} className="flex flex-col gap-1">
                            {isAprovado ? (
                              <span className="text-green-600 font-extrabold text-[11px] uppercase">✓ Aprovado</span>
                            ) : isAnalise ? (
                              <span className="text-amber-500 font-extrabold text-[11px] uppercase">⚡ Em Análise</span>
                            ) : (
                              <span className="text-brand-gold font-extrabold text-[11px] uppercase">{periciaSafe || "Não Informado"}</span>
                            )}
                            <span className="text-[10px] text-brand-text/50 font-medium leading-tight line-clamp-2">
                              {car.laudo_pericia || periciaSafe}
                            </span>
                          </div>
                        );
                      })}
                      {Array.from({ length: 3 - vehicles.length }).map((_, i) => (
                        <span key={i} className="text-brand-text/20">—</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* 3. SUGGESTED COMPARISON PRESETS (Tudocelular look) */}
      {!isLoading && getPresets().length > 0 && (
        <div className="mt-8 border-t border-brand-border/60 pt-6 pb-4">
          <h4 className="text-brand-text font-semibold text-xs uppercase tracking-widest mb-1 pl-1">
            Comparativos Recomendados
          </h4>
          <p className="text-[10px] text-brand-text/40 pl-1 mb-4">
            Selecione grupos pré-ajustados de veículos similares ativos no showroom.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {getPresets().map((preset) => (
              <button
                key={preset.id}
                onClick={() => {
                  const ids = preset.cars.map(c => c.id);
                  setCompareList(ids);
                }}
                className="flex flex-col text-left p-4 bg-brand-card hover:bg-brand-primary/5 border border-brand-card-border hover:border-brand-primary/35 rounded-2xl transition-all duration-300 group cursor-pointer shadow-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-brand-text group-hover:text-brand-primary transition-colors">
                    {preset.name}
                  </span>
                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-brand-primary/10 text-brand-primary">
                    {preset.icon}
                  </span>
                </div>
                <div className="flex flex-col gap-1 text-[10px] text-brand-text/50">
                  {preset.cars.map((car, idx) => (
                    <div key={car.id} className="truncate">
                      {idx + 1}. <span className="font-semibold text-brand-text/75">{car.marca}</span> {car.modelo}
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-[9px] font-extrabold text-brand-primary uppercase tracking-wider flex items-center gap-1 group-hover:underline">
                  Comparar Agora
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3 h-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      
    </div>
  );
}
