"use client";

import { useEffect, useState } from "react";

interface VehicleSummary {
  veiculo_id: string;
  marca: string;
  modelo: string;
  versao: string;
  ano: number;
  receitas: number;
  despesas: number;
  lucro: number;
  margem: number;
  transacoesCount: number;
  preco_venda_estimado?: number;
  is_vendido?: boolean;
  margem_incompleta?: boolean;
}

interface VeiculoDetails {
  id: string;
  marca: string;
  modelo: string;
  versao: string;
  ano: number;
  preco: number;
  cor?: string;
  quilometragem?: number;
  preco_compra?: number;
}

interface ContaItem {
  id: string;
  tipo: "pagar" | "receber";
  descricao: string;
  valor: number;
  data_vencimento: string;
  status: string;
  categoria?: {
    nome: string;
    icone: string;
    cor: string;
  };
}

interface CompraItem {
  id: string;
  descricao: string;
  fornecedor: string;
  valor_total: number;
  data_compra: string;
  categoria: string;
  conta_id?: string;
}

export default function FinanceMargens() {
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  
  // Selection states
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [veiculoDetails, setVeiculoDetails] = useState<VeiculoDetails | null>(null);
  const [contas, setContas] = useState<ContaItem[]>([]);
  const [compras, setCompras] = useState<CompraItem[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Search dropdown of all inventory
  const [inventoryList, setInventoryList] = useState<VeiculoDetails[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const fetchVehicleList = async () => {
    setIsLoadingList(true);
    try {
      const res = await fetch("/api/financeiro/margens");
      if (res.ok) {
        const data = await res.json();
        setVehicles(data.vehicles || []);
      }
    } catch (err) {
      console.error("Erro ao carregar lista de margens:", err);
    } finally {
      setIsLoadingList(false);
    }
  };

  const fetchInventory = async () => {
    try {
      const res = await fetch("/api/estoque");
      if (res.ok) {
        const data = await res.json();
        setInventoryList(data.veiculos || []);
      }
    } catch (err) {
      console.error("Erro ao carregar inventário:", err);
    }
  };

  const fetchVehicleDetails = async (id: string) => {
    setIsLoadingDetails(true);
    try {
      const res = await fetch(`/api/financeiro/margens?veiculo_id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setVeiculoDetails(data.veiculo);
        setContas(data.contas || []);
        setCompras(data.compras || []);
      }
    } catch (err) {
      console.error("Erro ao carregar detalhes do veículo:", err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  useEffect(() => {
    fetchVehicleList();
    fetchInventory();
  }, []);

  useEffect(() => {
    if (selectedVehicleId) {
      fetchVehicleDetails(selectedVehicleId);
    } else {
      setVeiculoDetails(null);
      setContas([]);
      setCompras([]);
    }
  }, [selectedVehicleId]);

  useEffect(() => {
    const handleOutsideClick = () => {
      setShowDropdown(false);
    };
    document.addEventListener("click", handleOutsideClick);
    return () => {
      document.removeEventListener("click", handleOutsideClick);
    };
  }, []);

  const formatPrice = (value: number) => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Calculations for specific vehicle sheet
  const saleRevenue = contas.filter(c => c.tipo === "receber" && c.status === "pago").reduce((acc, c) => acc + parseFloat(c.valor.toString()), 0);
  const salePending = contas.filter(c => c.tipo === "receber" && c.status !== "pago").reduce((acc, c) => acc + parseFloat(c.valor.toString()), 0);
  
  // despesas count (avoiding double counting)
  const contasIds = new Set(contas.map(c => c.id));
  const despesaContas = contas.filter(c => c.tipo === "pagar").reduce((acc, c) => acc + parseFloat(c.valor.toString()), 0);
  const despesaComprasSemConta = compras.filter(cp => !cp.conta_id || !contasIds.has(cp.conta_id)).reduce((acc, cp) => acc + parseFloat(cp.valor_total.toString()), 0);
  
  // Isolate purchase transactions
  const purchaseContas = contas.filter(c => 
    c.tipo === "pagar" && 
    (c.categoria?.nome === "Compra de Veículo (Estoque)" || c.categoria?.icone === "🔑")
  );
  const purchaseCompras = compras.filter(cp => 
    !cp.conta_id || !contasIds.has(cp.conta_id)
  ).filter(cp => 
    cp.categoria === "compra_veiculo" || 
    cp.descricao?.toLowerCase().includes("compra de veiculo") ||
    cp.descricao?.toLowerCase().includes("compra de veículo")
  );

  const sumPurchaseContas = purchaseContas.reduce((sum, c) => sum + parseFloat(c.valor.toString()), 0);
  const sumPurchaseCompras = purchaseCompras.reduce((sum, cp) => sum + parseFloat(cp.valor_total.toString()), 0);
  const transPurchasePrice = sumPurchaseContas + sumPurchaseCompras;

  // Manual override price
  const manualPurchasePrice = veiculoDetails?.preco_compra ? Number(veiculoDetails.preco_compra) : 0;

  const rawDespesas = despesaContas + despesaComprasSemConta;
  
  let totalDespesas = rawDespesas;
  if (manualPurchasePrice > 0) {
    const prepDespesas = Math.max(0, rawDespesas - transPurchasePrice);
    totalDespesas = manualPurchasePrice + prepDespesas;
  }

  const totalReceitas = saleRevenue + salePending;
  const isVendido = totalReceitas > 0 || !!veiculoDetails?.preco; // treated as sold if we have transactions or list price
  const precoVendaConsiderado = totalReceitas > 0 ? totalReceitas : (veiculoDetails?.preco || 0);
  const netProfit = precoVendaConsiderado - totalDespesas;
  const profitMargin = precoVendaConsiderado > 0 ? (netProfit / precoVendaConsiderado) * 100 : 0;

  // Filter inventory list for search dropdown
  const filteredInventory = inventoryList.filter(v => 
    `${v.marca} ${v.modelo} ${v.versao}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl">
      {/* Header action bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-mt-regua-fina pb-4 select-none">
        <div className="flex items-center gap-3">
          {selectedVehicleId && (
            <button
              onClick={() => {
                setSelectedVehicleId(null);
                fetchVehicleList();
              }}
              className="h-10 border border-mt-regua-fina hover:border-mt-accent text-[11px] font-bold uppercase tracking-wider px-3.5 transition-all cursor-pointer bg-mt-bg hover:bg-mt-accent-100 flex items-center justify-center gap-1.5 "
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Voltar à Lista
            </button>
          )}
          <h2 className="text-[15px] font-extrabold tracking-[-.01em] text-mt-ink">
            {selectedVehicleId ? "Ficha Financeira do Veículo" : "Margem de Lucro por Veículo"}
          </h2>
        </div>

        {/* Search Autocomplete dropdown */}
        <div className="relative w-full sm:max-w-xs" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            placeholder="BUSCAR VEÍCULO DO ESTOQUE..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            className="w-full pl-3 pr-8 py-2 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs uppercase font-semibold outline-none focus:border-mt-accent transition-all h-10"
          />
          <button className="absolute right-3 top-1/2 -translate-y-1/2 text-mt-neutral-500 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
          </button>

          {showDropdown && searchQuery && (
            <div className="absolute right-0 top-11 bg-mt-surface border border-mt-regua-fina w-full max-h-60 overflow-y-auto z-40">
              {filteredInventory.length === 0 ? (
                <div className="p-3 text-[10px] text-mt-neutral-600 text-center">Nenhum veículo encontrado</div>
              ) : (
                filteredInventory.map(v => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setSelectedVehicleId(v.id);
                      setSearchQuery("");
                      setShowDropdown(false);
                    }}
                    className="w-full p-2.5 text-left text-[10px] font-bold text-mt-ink hover:bg-mt-accent-hover hover:text-white border-b border-mt-regua-fina last:border-b-0 transition-colors block cursor-pointer"
                  >
                    <span>{v.marca} {v.modelo} - {v.ano}</span>
                    <span className="text-[9px] block opacity-60 font-normal truncate">{v.versao}</span>
                  </button>
                ))
              )}
            </div>
          )}
          {showDropdown && !searchQuery && (
            <div className="absolute right-0 top-11 bg-mt-surface border border-mt-regua-fina w-full max-h-60 overflow-y-auto z-40">
              <div className="p-2.5 text-[9px] text-mt-neutral-600 font-bold uppercase tracking-wider text-center border-b border-mt-regua-fina select-none">
                Veículos em Estoque
              </div>
              {inventoryList.slice(0, 10).map(v => (
                <button
                  key={v.id}
                  onClick={() => {
                    setSelectedVehicleId(v.id);
                    setSearchQuery("");
                    setShowDropdown(false);
                  }}
                  className="w-full p-2.5 text-left text-[10px] font-bold text-mt-ink hover:bg-mt-accent-hover hover:text-white border-b border-mt-regua-fina last:border-b-0 transition-colors block cursor-pointer"
                >
                  <span>{v.marca} {v.modelo} - {v.ano}</span>
                  <span className="text-[9px] block opacity-60 font-normal truncate">{v.versao}</span>
                </button>
              ))}
              <div className="p-2.5 text-[8px] text-mt-neutral-500 text-center select-none">
                Digite para filtrar todo o estoque...
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main content body */}
      {!selectedVehicleId ? (
        /* ==================== 1. VEHICLES LIST OVERVIEW ==================== */
        <div className="bg-mt-surface border border-mt-regua-fina p-6">
          <h3 className="text-xs font-extrabold uppercase text-mt-ink tracking-wider border-b border-mt-regua-fina pb-3 mb-4 select-none">
            Fechamento de Margens por Veículo
          </h3>

          {isLoadingList ? (
            <div className="py-12 text-center text-xs text-mt-neutral-700">Carregando demonstrativo de margens...</div>
          ) : vehicles.length === 0 ? (
            <div className="py-12 text-center text-xs text-mt-neutral-700 select-none">
              Nenhuma movimentação financeira vinculada a veículos cadastrada.
              <br />
              <span className="text-[10px] text-mt-neutral-600 font-normal mt-1 block">
                Use a busca no topo direito para pesquisar e detalhar qualquer carro do pátio.
              </span>
            </div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-mt-regua-fina text-mt-neutral-600 font-bold uppercase tracking-wider select-none">
                    <th className="pb-3 pl-2">Veículo</th>
                    <th className="pb-3">Custo Acumulado</th>
                    <th className="pb-3">Valor de Venda</th>
                    <th className="pb-3">Lucro Líquido</th>
                    <th className="pb-3">Margem (%)</th>
                    <th className="pb-3 pr-2 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mt-regua-fina">
                  {vehicles.map((v) => (
                    <tr key={v.veiculo_id} className="hover:bg-mt-surface transition-colors">
                      <td className="py-4 pl-2 font-bold text-mt-ink">
                        <div className="flex flex-col gap-0.5">
                          <span>{v.marca} {v.modelo}</span>
                          <span className="text-[10px] text-mt-neutral-600 font-normal">
                            Ano {v.ano} {v.versao ? `• ${v.versao}` : ""}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 font-bold text-mt-accent">{formatPrice(v.despesas)}</td>
                      <td className="py-4 font-bold text-mt-accent-800">
                        <div className="flex flex-col gap-0.5">
                          <span>{formatPrice(v.is_vendido ? v.receitas : (v.preco_venda_estimado || 0))}</span>
                          <span className="text-[8px] text-mt-neutral-500 font-bold uppercase select-none">
                            {v.is_vendido ? "Realizado" : "Pátio"}
                          </span>
                        </div>
                      </td>
                      <td className="py-4">
                        {v.margem_incompleta ? (
                          <span className="text-[10px] text-mt-accent-800 font-semibold bg-mt-accent-100 border border-mt-accent-300 px-2 py-0.5 select-none">
                            Ajustar Entrada
                          </span>
                        ) : (
                          <span className={`font-extrabold ${v.lucro >= 0 ? "text-mt-accent-800" : "text-mt-accent"}`}>
                            {v.lucro >= 0 ? "+" : ""} {formatPrice(v.lucro)}
                          </span>
                        )}
                      </td>
                      <td className="py-4">
                        {v.margem_incompleta ? (
                          <div className="flex flex-col gap-1 items-start select-none">
                            <span className="px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wider bg-mt-accent-100 border border-mt-accent-300 text-mt-accent-800">
                              Pendente
                            </span>
                            <span className="text-[8px] text-mt-neutral-500 font-semibold uppercase tracking-wider pl-1">
                              Sem Custo Compra
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1 items-start">
                            <span className={`px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${
                              v.lucro >= 0
                                ? "bg-mt-surface border border-mt-regua-fina text-mt-accent-800"
                                : "bg-mt-accent-100 border border-mt-accent-300 text-mt-accent"
                            }`}>
                              {v.margem.toFixed(1)}%
                            </span>
                            <span className="text-[8px] text-mt-neutral-500 font-semibold uppercase tracking-wider select-none pl-1">
                              {v.is_vendido ? "Real" : "Estimada"}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-4 pr-2 text-right">
                        <button
                          onClick={() => setSelectedVehicleId(v.veiculo_id)}
                          className="h-8 px-3 border border-mt-regua-fina hover:border-mt-accent text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer bg-mt-bg hover:bg-mt-accent-100 flex items-center justify-center gap-1 ml-auto"
                        >
                          Detalhar Custos
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* ==================== 2. DETAILED VEHICLE FINANCIAL SHEET ==================== */
        <div className="flex flex-col gap-6 w-full">
          {isLoadingDetails ? (
            <div className="bg-mt-surface border border-mt-regua-fina p-12 text-center text-xs text-mt-neutral-700">
              Buscando lançamentos consolidados do veículo...
            </div>
          ) : (
            <>
              {/* Vehicle specs and banner */}
              <div className="bg-mt-surface border border-mt-regua-fina p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 select-none">
                <div className="flex flex-col gap-1">
                  <span className="mt-rotulo mt-rotulo-accent">Ficha de Pátio</span>
                  <h1 className="text-xl font-extrabold text-mt-ink tracking-tight uppercase leading-tight">
                    {veiculoDetails?.marca} {veiculoDetails?.modelo} - {veiculoDetails?.ano}
                  </h1>
                  <p className="text-xs text-mt-neutral-700 leading-relaxed font-normal">
                    {veiculoDetails?.versao} {veiculoDetails?.cor ? `• Cor: ${veiculoDetails.cor}` : ""} {veiculoDetails?.quilometragem ? `• KM: ${veiculoDetails.quilometragem.toLocaleString("pt-BR")}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[9px] font-bold text-mt-neutral-600 uppercase">Preço FIPE/Sugestão</span>
                  <span className="text-base font-extrabold text-mt-ink">{veiculoDetails?.preco ? formatPrice(veiculoDetails.preco) : "-"}</span>
                </div>
              </div>

              {manualPurchasePrice === 0 && transPurchasePrice === 0 && (
                <div className="bg-mt-accent-100 border border-mt-accent-300 p-5 text-xs text-mt-accent-800 flex items-center gap-3.5 select-none">
                  <span className="text-xl">⚠️</span>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold uppercase tracking-wider text-[10px]">Margem Comercial Incompleta</span>
                    <span className="text-[11px] opacity-75 font-normal leading-relaxed">
                      Este veículo não possui preço de compra/entrada cadastrado. Acesse o menu <strong>Configurações</strong> para ajustar o valor de entrada e obter o cálculo correto de margem.
                    </span>
                  </div>
                </div>
              )}

              {/* KPI Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Custos */}
                <div className="bg-mt-surface border border-mt-regua-fina p-5 flex flex-col gap-1 select-none">
                  <span className="text-[9px] font-bold text-mt-neutral-600 uppercase tracking-wider">Custo Total (Entrada + Prep.)</span>
                  <span className="text-base font-extrabold text-mt-accent tracking-tight">{formatPrice(totalDespesas)}</span>
                  {manualPurchasePrice > 0 && (
                    <span className="text-[9px] text-mt-neutral-600 font-normal">
                      Compra: {formatPrice(manualPurchasePrice)} • Prep: {formatPrice(Math.max(0, totalDespesas - manualPurchasePrice))}
                    </span>
                  )}
                </div>

                {/* Valor de Venda */}
                <div className="bg-mt-surface border border-mt-regua-fina p-5 flex flex-col gap-1 select-none">
                  <span className="text-[9px] font-bold text-mt-neutral-600 uppercase tracking-wider">
                    {totalReceitas > 0 ? "Receita de Venda (Realizada)" : "Preço de Venda (Pátio)"}
                  </span>
                  <span className="text-base font-extrabold text-mt-accent-800 tracking-tight">{formatPrice(precoVendaConsiderado)}</span>
                </div>
 
                {/* Lucro Líquido */}
                <div className="bg-mt-surface border border-mt-regua-fina p-5 flex flex-col gap-1 select-none">
                  <span className="text-[9px] font-bold text-mt-neutral-600 uppercase tracking-wider">
                    {totalReceitas > 0 ? "Retorno Líquido (Realizado)" : "Retorno Líquido (Projetado)"}
                  </span>
                  <span className={`text-base font-extrabold tracking-tight ${netProfit >= 0 ? "text-mt-accent-800" : "text-mt-accent"}`}>
                    {netProfit >= 0 ? "+" : ""} {formatPrice(netProfit)}
                  </span>
                </div>
 
                {/* Margem */}
                <div className="bg-mt-surface border border-mt-regua-fina p-5 flex flex-col gap-1 select-none">
                  <span className="text-[9px] font-bold text-mt-neutral-600 uppercase tracking-wider">
                    {totalReceitas > 0 ? "Margem de Lucro Real (%)" : "Margem de Lucro Projetada (%)"}
                  </span>
                  <div className="flex items-center justify-between">
                    <span className={`text-base font-extrabold tracking-tight ${netProfit >= 0 ? "text-mt-accent-800" : "text-mt-accent"}`}>
                      {profitMargin.toFixed(1)}%
                    </span>
                    <span className={`text-[8px] font-extrabold uppercase tracking-widest px-2 py-0.5 border ${
                      netProfit >= 0 
                        ? "bg-mt-surface border-mt-regua-fina text-mt-accent-800" 
                        : "bg-mt-accent-100 border-mt-accent-300 text-mt-accent animate-pulse"
                    }`}>
                      {netProfit >= 10000 ? "Excelente" : netProfit >= 0 ? "Viável" : "Margem Negativa"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Transactions list */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Despesas Column */}
                <div className="bg-mt-surface border border-mt-regua-fina p-6 flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-mt-regua-fina pb-3 select-none">
                    <h3 className="text-xs font-extrabold uppercase text-mt-ink tracking-wider text-mt-accent">Custos & Preparação de Pátio</h3>
                    <span className="text-[10px] font-bold text-mt-neutral-600 uppercase">Total Despesas</span>
                  </div>

                  {contas.filter(c => c.tipo === "pagar").length === 0 && compras.length === 0 ? (
                    <div className="py-12 text-center text-xs text-mt-neutral-500">Nenhum custo registrado para este carro.</div>
                  ) : (
                    <div className="flex flex-col divide-y divide-mt-regua-fina max-h-[350px] overflow-y-auto scrollbar-thin">
                      {/* Compra / Insumos de compras_produtos */}
                      {compras.map((cp) => (
                        <div key={cp.id} className="py-3 flex items-center justify-between hover:bg-mt-surface transition-colors px-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-bold text-mt-ink leading-tight">{cp.descricao}</span>
                            <span className="text-[9px] text-mt-neutral-600">
                              📦 Compra de Produto • Forn: {cp.fornecedor} • {formatDate(cp.data_compra)}
                            </span>
                          </div>
                          <span className="text-xs font-extrabold text-mt-accent">{formatPrice(cp.valor_total)}</span>
                        </div>
                      ))}

                      {/* Contas a Pagar linked directly */}
                      {contas.filter(c => c.tipo === "pagar").map((c) => (
                        <div key={c.id} className="py-3 flex items-center justify-between hover:bg-mt-surface transition-colors px-2">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-mt-ink leading-tight">{c.descricao}</span>
                              <span className={`text-[8px] font-bold uppercase px-1 ${
                                c.status === "pago"
                                  ? "bg-mt-surface text-mt-accent-800 border border-mt-regua-fina"
                                  : "bg-mt-accent-100 text-mt-accent-800 border border-mt-accent-300"
                              }`}>
                                {c.status}
                              </span>
                            </div>
                            <span className="text-[9px] text-mt-neutral-600">
                              💸 {c.categoria?.icone || "📁"} {c.categoria?.nome || "Outros"} • Vence em {formatDate(c.data_vencimento)}
                            </span>
                          </div>
                          <span className="text-xs font-extrabold text-mt-accent">{formatPrice(c.valor)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Receitas Column */}
                <div className="bg-mt-surface border border-mt-regua-fina p-6 flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-mt-regua-fina pb-3 select-none">
                    <h3 className="text-xs font-extrabold uppercase text-mt-ink tracking-wider text-mt-accent-800">Receitas de Vendas</h3>
                    <span className="text-[10px] font-bold text-mt-neutral-600 uppercase">Total Recebido/Pendente</span>
                  </div>

                  {contas.filter(c => c.tipo === "receber").length === 0 ? (
                    <div className="py-12 text-center text-xs text-mt-neutral-500">Carro ainda não foi vendido ou sinalizado.</div>
                  ) : (
                    <div className="flex flex-col divide-y divide-mt-regua-fina max-h-[350px] overflow-y-auto scrollbar-thin">
                      {contas.filter(c => c.tipo === "receber").map((c) => (
                        <div key={c.id} className="py-3.5 flex items-center justify-between hover:bg-mt-surface transition-colors px-2">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-mt-ink leading-tight">{c.descricao}</span>
                              <span className={`text-[8px] font-bold uppercase px-1 ${
                                c.status === "pago"
                                  ? "bg-mt-surface text-mt-accent-800 border border-mt-regua-fina"
                                  : "bg-mt-accent-100 text-mt-accent-800 border border-mt-accent-300"
                              }`}>
                                {c.status}
                              </span>
                            </div>
                            <span className="text-[9px] text-mt-neutral-600">
                              💰 {c.categoria?.icone || "📁"} {c.categoria?.nome || "Venda"} • Recebimento: {formatDate(c.data_vencimento)}
                            </span>
                          </div>
                          <span className="text-xs font-extrabold text-mt-accent-800">{formatPrice(c.valor)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
