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
  
  const totalDespesas = despesaContas + despesaComprasSemConta;
  const totalReceitas = saleRevenue + salePending;
  const netProfit = totalReceitas - totalDespesas;
  const profitMargin = totalReceitas > 0 ? (netProfit / totalReceitas) * 100 : 0;

  // Filter inventory list for search dropdown
  const filteredInventory = inventoryList.filter(v => 
    `${v.marca} ${v.modelo} ${v.versao}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl">
      {/* Header action bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-brand-border/40 pb-4 select-none">
        <div className="flex items-center gap-3">
          {selectedVehicleId && (
            <button
              onClick={() => {
                setSelectedVehicleId(null);
                fetchVehicleList();
              }}
              className="h-10 border border-brand-border hover:border-brand-primary/50 text-[11px] font-bold uppercase tracking-wider px-3.5 rounded-xl transition-all cursor-pointer bg-brand-bg/50 hover:bg-brand-primary/5 flex items-center justify-center gap-1.5 active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Voltar à Lista
            </button>
          )}
          <h2 className="text-sm font-extrabold uppercase text-brand-text">
            {selectedVehicleId ? "Ficha Financeira do Veículo" : "Margem de Lucro por Veículo"}
          </h2>
        </div>

        {/* Search Autocomplete dropdown */}
        <div className="relative w-full sm:max-w-xs">
          <input
            type="text"
            placeholder="BUSCAR VEÍCULO DO ESTOQUE..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            className="w-full pl-3 pr-8 py-2 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-border rounded-xl text-xs uppercase font-semibold outline-none focus:border-brand-primary transition-all h-10"
          />
          <button className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text/30 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
          </button>

          {showDropdown && searchQuery && (
            <div className="absolute right-0 top-11 bg-zinc-950 border border-brand-border/60 rounded-2xl w-full max-h-60 overflow-y-auto z-40 shadow-xl backdrop-blur-md">
              {filteredInventory.length === 0 ? (
                <div className="p-3 text-[10px] text-brand-text/40 text-center">Nenhum veículo encontrado</div>
              ) : (
                filteredInventory.map(v => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setSelectedVehicleId(v.id);
                      setSearchQuery("");
                      setShowDropdown(false);
                    }}
                    className="w-full p-2.5 text-left text-[10px] font-bold text-brand-text hover:bg-brand-primary hover:text-white border-b border-brand-border/20 last:border-b-0 transition-colors block cursor-pointer"
                  >
                    <span>{v.marca} {v.modelo} - {v.ano}</span>
                    <span className="text-[9px] block opacity-60 font-normal truncate">{v.versao}</span>
                  </button>
                ))
              )}
            </div>
          )}
          {showDropdown && !searchQuery && (
            <div className="absolute right-0 top-11 bg-zinc-950 border border-brand-border/60 rounded-2xl w-full max-h-60 overflow-y-auto z-40 shadow-xl backdrop-blur-md">
              <div className="p-2.5 text-[9px] text-brand-text/40 font-bold uppercase tracking-wider text-center border-b border-brand-border/10 select-none">
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
                  className="w-full p-2.5 text-left text-[10px] font-bold text-brand-text hover:bg-brand-primary hover:text-white border-b border-brand-border/20 last:border-b-0 transition-colors block cursor-pointer"
                >
                  <span>{v.marca} {v.modelo} - {v.ano}</span>
                  <span className="text-[9px] block opacity-60 font-normal truncate">{v.versao}</span>
                </button>
              ))}
              <div className="p-2.5 text-[8px] text-brand-text/30 text-center select-none">
                Digite para filtrar todo o estoque...
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main content body */}
      {!selectedVehicleId ? (
        /* ==================== 1. VEHICLES LIST OVERVIEW ==================== */
        <div className="bg-brand-card/30 border border-brand-border/40 rounded-3xl p-6 backdrop-blur-md">
          <h3 className="text-xs font-extrabold uppercase text-brand-text tracking-wider border-b border-brand-border/30 pb-3 mb-4 select-none">
            Fechamento de Margens por Veículo
          </h3>

          {isLoadingList ? (
            <div className="py-12 text-center text-xs text-brand-text/50">Carregando demonstrativo de margens...</div>
          ) : vehicles.length === 0 ? (
            <div className="py-12 text-center text-xs text-brand-text/50 select-none">
              Nenhuma movimentação financeira vinculada a veículos cadastrada.
              <br />
              <span className="text-[10px] text-brand-text/40 font-normal mt-1 block">
                Use a busca no topo direito para pesquisar e detalhar qualquer carro do pátio.
              </span>
            </div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-brand-border/40 text-brand-text/40 font-bold uppercase tracking-wider select-none">
                    <th className="pb-3 pl-2">Veículo</th>
                    <th className="pb-3">Custo Acumulado</th>
                    <th className="pb-3">Valor de Venda</th>
                    <th className="pb-3">Lucro Líquido</th>
                    <th className="pb-3">Margem (%)</th>
                    <th className="pb-3 pr-2 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/20">
                  {vehicles.map((v) => (
                    <tr key={v.veiculo_id} className="hover:bg-brand-card/10 transition-colors">
                      <td className="py-4 pl-2 font-bold text-brand-text">
                        <div className="flex flex-col gap-0.5">
                          <span>{v.marca} {v.modelo}</span>
                          <span className="text-[10px] text-brand-text/40 font-normal">
                            Ano {v.ano} {v.versao ? `• ${v.versao}` : ""}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 font-bold text-red-500">{formatPrice(v.despesas)}</td>
                      <td className="py-4 font-bold text-emerald-500">{formatPrice(v.receitas)}</td>
                      <td className={`py-4 font-black ${v.lucro >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {v.lucro >= 0 ? "+" : ""} {formatPrice(v.lucro)}
                      </td>
                      <td className="py-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          v.lucro >= 0
                            ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-500"
                            : "bg-red-500/10 border border-red-500/20 text-red-500"
                        }`}>
                          {v.margem.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-4 pr-2 text-right">
                        <button
                          onClick={() => setSelectedVehicleId(v.veiculo_id)}
                          className="h-8 px-3 border border-brand-border hover:border-brand-primary/50 text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer bg-brand-bg/50 hover:bg-brand-primary/5 flex items-center justify-center gap-1 ml-auto"
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
        <div className="flex flex-col gap-6 w-full animate-fadeIn">
          {isLoadingDetails ? (
            <div className="bg-brand-card/30 border border-brand-border/40 rounded-3xl p-12 text-center text-xs text-brand-text/50">
              Buscando lançamentos consolidados do veículo...
            </div>
          ) : (
            <>
              {/* Vehicle specs and banner */}
              <div className="bg-brand-card/20 border border-brand-border/40 rounded-3xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 select-none">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em]">Ficha de Pátio</span>
                  <h1 className="text-xl font-extrabold text-brand-text tracking-tight uppercase leading-tight">
                    {veiculoDetails?.marca} {veiculoDetails?.modelo} - {veiculoDetails?.ano}
                  </h1>
                  <p className="text-xs text-brand-text/50 leading-relaxed font-normal">
                    {veiculoDetails?.versao} {veiculoDetails?.cor ? `• Cor: ${veiculoDetails.cor}` : ""} {veiculoDetails?.quilometragem ? `• KM: ${veiculoDetails.quilometragem.toLocaleString("pt-BR")}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[9px] font-bold text-brand-text/40 uppercase">Preço FIPE/Sugestão</span>
                  <span className="text-base font-black text-brand-text">{veiculoDetails?.preco ? formatPrice(veiculoDetails.preco) : "-"}</span>
                </div>
              </div>

              {/* KPI Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Custos */}
                <div className="bg-brand-card/30 border border-brand-border/40 rounded-2xl p-5 flex flex-col gap-1 backdrop-blur-sm select-none">
                  <span className="text-[9px] font-bold text-brand-text/40 uppercase tracking-wider">Custo de Preparação + Compra</span>
                  <span className="text-base font-black text-red-500 tracking-tight">{formatPrice(totalDespesas)}</span>
                </div>

                {/* Valor de Venda */}
                <div className="bg-brand-card/30 border border-brand-border/40 rounded-2xl p-5 flex flex-col gap-1 backdrop-blur-sm select-none">
                  <span className="text-[9px] font-bold text-brand-text/40 uppercase tracking-wider">Receita de Venda</span>
                  <span className="text-base font-black text-emerald-500 tracking-tight">{formatPrice(totalReceitas)}</span>
                </div>

                {/* Lucro Líquido */}
                <div className="bg-brand-card/30 border border-brand-border/40 rounded-2xl p-5 flex flex-col gap-1 backdrop-blur-sm select-none">
                  <span className="text-[9px] font-bold text-brand-text/40 uppercase tracking-wider">Retorno Líquido</span>
                  <span className={`text-base font-black tracking-tight ${netProfit >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {netProfit >= 0 ? "+" : ""} {formatPrice(netProfit)}
                  </span>
                </div>

                {/* Margem */}
                <div className="bg-brand-card/30 border border-brand-border/40 rounded-2xl p-5 flex flex-col gap-1 backdrop-blur-sm select-none">
                  <span className="text-[9px] font-bold text-brand-text/40 uppercase tracking-wider">Margem de Lucro (%)</span>
                  <div className="flex items-center justify-between">
                    <span className={`text-base font-black tracking-tight ${netProfit >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {profitMargin.toFixed(1)}%
                    </span>
                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                      netProfit >= 0 
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" 
                        : "bg-red-500/10 border-red-500/20 text-red-500 animate-pulse"
                    }`}>
                      {netProfit >= 10000 ? "Excelente" : netProfit >= 0 ? "Viável" : "Margem Negativa"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Transactions list */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Despesas Column */}
                <div className="bg-brand-card/30 border border-brand-border/40 rounded-3xl p-6 backdrop-blur-md flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-brand-border/30 pb-3 select-none">
                    <h3 className="text-xs font-extrabold uppercase text-brand-text tracking-wider text-red-500">Custos & Preparação de Pátio</h3>
                    <span className="text-[10px] font-bold text-brand-text/40 uppercase">Total Despesas</span>
                  </div>

                  {contas.filter(c => c.tipo === "pagar").length === 0 && compras.length === 0 ? (
                    <div className="py-12 text-center text-xs text-brand-text/30">Nenhum custo registrado para este carro.</div>
                  ) : (
                    <div className="flex flex-col divide-y divide-brand-border/20 max-h-[350px] overflow-y-auto scrollbar-thin">
                      {/* Compra / Insumos de compras_produtos */}
                      {compras.map((cp) => (
                        <div key={cp.id} className="py-3 flex items-center justify-between hover:bg-brand-card/5 transition-colors rounded-xl px-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-bold text-brand-text leading-tight">{cp.descricao}</span>
                            <span className="text-[9px] text-brand-text/40">
                              📦 Compra de Produto • Forn: {cp.fornecedor} • {formatDate(cp.data_compra)}
                            </span>
                          </div>
                          <span className="text-xs font-black text-red-500">{formatPrice(cp.valor_total)}</span>
                        </div>
                      ))}

                      {/* Contas a Pagar linked directly */}
                      {contas.filter(c => c.tipo === "pagar").map((c) => (
                        <div key={c.id} className="py-3 flex items-center justify-between hover:bg-brand-card/5 transition-colors rounded-xl px-2">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-brand-text leading-tight">{c.descricao}</span>
                              <span className={`text-[8px] font-bold uppercase px-1 rounded ${
                                c.status === "pago"
                                  ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/10"
                                  : "bg-amber-500/10 text-amber-500 border border-amber-500/10"
                              }`}>
                                {c.status}
                              </span>
                            </div>
                            <span className="text-[9px] text-brand-text/40">
                              💸 {c.categoria?.icone || "📁"} {c.categoria?.nome || "Outros"} • Vence em {formatDate(c.data_vencimento)}
                            </span>
                          </div>
                          <span className="text-xs font-black text-red-500">{formatPrice(c.valor)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Receitas Column */}
                <div className="bg-brand-card/30 border border-brand-border/40 rounded-3xl p-6 backdrop-blur-md flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-brand-border/30 pb-3 select-none">
                    <h3 className="text-xs font-extrabold uppercase text-brand-text tracking-wider text-emerald-500">Receitas de Vendas</h3>
                    <span className="text-[10px] font-bold text-brand-text/40 uppercase">Total Recebido/Pendente</span>
                  </div>

                  {contas.filter(c => c.tipo === "receber").length === 0 ? (
                    <div className="py-12 text-center text-xs text-brand-text/30">Carro ainda não foi vendido ou sinalizado.</div>
                  ) : (
                    <div className="flex flex-col divide-y divide-brand-border/20 max-h-[350px] overflow-y-auto scrollbar-thin">
                      {contas.filter(c => c.tipo === "receber").map((c) => (
                        <div key={c.id} className="py-3.5 flex items-center justify-between hover:bg-brand-card/5 transition-colors rounded-xl px-2">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-brand-text leading-tight">{c.descricao}</span>
                              <span className={`text-[8px] font-bold uppercase px-1 rounded ${
                                c.status === "pago"
                                  ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/10"
                                  : "bg-amber-500/10 text-amber-500 border border-amber-500/10"
                              }`}>
                                {c.status}
                              </span>
                            </div>
                            <span className="text-[9px] text-brand-text/40">
                              💰 {c.categoria?.icone || "📁"} {c.categoria?.nome || "Venda"} • Recebimento: {formatDate(c.data_vencimento)}
                            </span>
                          </div>
                          <span className="text-xs font-black text-emerald-500">{formatPrice(c.valor)}</span>
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
