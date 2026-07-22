"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import LancamentoRapidoModal from "./LancamentoRapidoModal";
import ImportadorRevendaMais from "./ImportadorRevendaMais";

interface KPIState {
  aPagarMes: number;
  aReceberMes: number;
  saldoProjetado: number;
  overdueCount: number;
  custoFixoMensal: number;
  saldoCaixaAcumulado?: number;
  entradaCaixaMes?: number;
  saldoPorBanco?: Record<string, number>;
}

interface BillItem {
  id: string;
  tipo: "pagar" | "receber";
  descricao: string;
  valor: number;
  data_vencimento: string;
  status: string;
  fornecedor?: string;
  cliente?: string;
  categoria?: {
    nome: string;
    cor: string;
    icone: string;
  };
}

interface ChartItem {
  label: string;
  entradas: number;
  saidas: number;
}

export default function DashboardFinanceiro() {
  const [isLancamentoRapidoOpen, setIsLancamentoRapidoOpen] = useState(false);
  const [isImportadorOpen, setIsImportadorOpen] = useState(false);
  const [isNotifyingWhatsapp, setIsNotifyingWhatsapp] = useState(false);

  const [kpis, setKpis] = useState<KPIState>({
    aPagarMes: 0,
    aReceberMes: 0,
    saldoProjetado: 0,
    overdueCount: 0,
    custoFixoMensal: 0,
    saldoCaixaAcumulado: 0,
    entradaCaixaMes: 0,
    saldoPorBanco: {},
  });
  const [upcomingBills, setUpcomingBills] = useState<BillItem[]>([]);
  const [overdueBills, setOverdueBills] = useState<BillItem[]>([]);
  const [chartData, setChartData] = useState<ChartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [notification, setNotification] = useState("");

  // States for manual bank balances override
  const [isEditingSaldos, setIsEditingSaldos] = useState(false);
  const [editSaldoCaixa, setEditSaldoCaixa] = useState("");
  const [editSaldosBancos, setEditSaldosBancos] = useState<Record<string, string>>({});

  const handleSaveSaldos = async () => {
    setIsLoading(true);
    setNotification("");
    try {
      const browserClient = createBrowserSupabaseClient();
      const sessionRes = await browserClient.auth.getSession();
      const token = sessionRes.data?.session?.access_token;
      
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const saldosBancosFormatted: Record<string, number> = {};
      Object.entries(editSaldosBancos).forEach(([k, v]) => {
        saldosBancosFormatted[k] = parseFloat(v) || 0;
      });

      const payload = {
        bankBalances: {
          saldoCaixaManual: parseFloat(editSaldoCaixa) || 0,
          saldosBancos: saldosBancosFormatted
        }
      };

      const res = await fetch("/api/settings", {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setIsEditingSaldos(false);
        setNotification("Saldos ajustados manualmente com sucesso!");
        fetchDashboardData();
        setTimeout(() => setNotification(""), 4000);
      } else {
        const errData = await res.json().catch(() => ({}));
        setNotification(`Erro ao salvar: ${errData.error || "Erro desconhecido"}`);
      }
    } catch (err: any) {
      setNotification(`Erro de conexão: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/financeiro/dashboard");
      if (res.ok) {
        const data = await res.json();
        setKpis(data.kpis);
        setUpcomingBills(data.upcomingBills);
        setOverdueBills(data.overdueBills);
        setChartData(data.chartData);
      }
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleGenerateRecurring = async () => {
    setIsGenerating(true);
    setNotification("");
    try {
      const res = await fetch("/api/financeiro/recorrentes/gerar", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setNotification(`Geração concluída! ${data.generatedCount} novas contas geradas.`);
        fetchDashboardData();
        setTimeout(() => setNotification(""), 4000);
      } else {
        setNotification(`Erro ao gerar: ${data.error}`);
      }
    } catch (err) {
      setNotification("Erro de conexão ao gerar recorrências.");
    } finally {
      setIsGenerating(false);
    }
  const handleTriggerWhatsappNotif = async () => {
    setIsNotifyingWhatsapp(true);
    setNotification("");
    try {
      const res = await fetch("/api/financeiro/notificacoes/processar", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setNotification(`Notificações enviadas ao WhatsApp! ${data.notifiedCount || 0} avisos disparados.`);
      } else {
        setNotification(`Erro ao enviar: ${data.error || "Verifique as configurações."}`);
      }
    } catch (err: any) {
      setNotification(`Erro ao se comunicar com o webhook: ${err.message}`);
    } finally {
      setIsNotifyingWhatsapp(false);
      setTimeout(() => setNotification(""), 4000);
    }
  };

  const formatPrice = (value: number) => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 2,
    });
  };

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Find max value in chart to scale graph appropriately
  const maxVal = Math.max(...chartData.map((d) => Math.max(d.entradas, d.saidas, 1000)));

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl">
      {/* Toast Notice */}
      {notification && (
        <div className="bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-xs px-4 py-3 rounded-xl flex items-center gap-2 animate-bounce">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
            <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h1a.75.75 0 0 0 0-1.5H9Z" clipRule="evenodd" />
          </svg>
          <span>{notification}</span>
        </div>
      )}

      {/* Top Quick Actions Bar (Despesas Corriqueiras & RevendaMais Integration) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-card/30 border border-brand-border/40 p-4 rounded-2xl backdrop-blur-sm select-none">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsLancamentoRapidoOpen(true)}
            className="px-4 py-2.5 bg-brand-primary hover:bg-brand-primary-hover text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-2"
          >
            <span>⚡</span>
            <span>Lançamento Rápido (10s)</span>
          </button>

          <button
            onClick={() => setIsImportadorOpen(true)}
            className="px-4 py-2.5 bg-brand-card border border-brand-border hover:border-brand-primary text-brand-text font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-2"
          >
            <span>📥</span>
            <span>Importar do RevendaMais</span>
          </button>
        </div>

        <button
          onClick={handleTriggerWhatsappNotif}
          disabled={isNotifyingWhatsapp}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-2"
        >
          <span>📲</span>
          <span>{isNotifyingWhatsapp ? "Enviando..." : "Enviar Avisos no WhatsApp"}</span>
        </button>
      </div>

      {isLoading ? (
        <div className="py-24 text-center text-xs text-brand-text/50">Carregando dados financeiros...</div>
      ) : (
        <>
          {/* Smart Alerts Section (Avisos Inteligentes do Dia) */}
          <div className="bg-brand-card/40 border border-brand-border/50 rounded-3xl p-5 backdrop-blur-md flex flex-col gap-3 shadow-lg select-none">
            <div className="flex items-center justify-between border-b border-brand-border/40 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                </span>
                <h3 className="text-xs font-black uppercase text-brand-text tracking-wider">
                  Central de Avisos Inteligentes & Gestão de Risco
                </h3>
              </div>
              <span className="text-[10px] font-bold uppercase text-brand-gold bg-brand-gold/10 px-2.5 py-1 rounded-lg border border-brand-gold/20">
                Plano de Contas Revenda Conectado
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Alert 1: Vencimentos Críticos */}
              <div className={`p-3.5 rounded-2xl border flex flex-col gap-1.5 transition-all ${
                overdueBills.length > 0
                  ? "bg-red-500/10 border-red-500/30 text-red-500"
                  : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600"
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    {overdueBills.length > 0 ? "⚠️ Contas Vencidas Exigindo Baixa" : "✅ Nenhuma Conta Vencida"}
                  </span>
                  <span className="text-[9px] font-black">{overdueBills.length} pendentes</span>
                </div>
                <p className="text-[11px] font-medium leading-tight">
                  {overdueBills.length > 0
                    ? `Atenção: Existem ${overdueBills.length} título(s) pendentes vencidos totalizando ${formatPrice(overdueBills.reduce((a, b) => a + b.valor, 0))}.`
                    : "Fluxo em dia: Todos os compromissos financeiros anteriores foram baixados."}
                </p>
                {overdueBills.length > 0 && (
                  <Link
                    href="/admin/financeiro/contas-pagar"
                    className="text-[10px] font-extrabold uppercase underline tracking-wider mt-1 hover:opacity-80"
                  >
                    Liquidar Títulos Agora →
                  </Link>
                )}
              </div>

              {/* Alert 2: Próximos Vencimentos */}
              <div className="p-3.5 rounded-2xl border bg-brand-bg/60 border-brand-border/50 text-brand-text flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-gold">
                    📅 Vencimentos da Semana
                  </span>
                  <span className="text-[9px] font-bold text-brand-text/60">{upcomingBills.length} contas</span>
                </div>
                <p className="text-[11px] text-brand-text/80 font-medium leading-tight">
                  Projeção de desembolso para os próximos dias: <strong className="font-mono text-brand-primary">{formatPrice(upcomingBills.reduce((a, b) => a + b.valor, 0))}</strong>.
                </p>
                <Link
                  href="/admin/financeiro/contas-pagar"
                  className="text-[10px] font-bold uppercase text-brand-primary tracking-wider mt-1 hover:underline"
                >
                  Ver Cronograma →
                </Link>
              </div>

              {/* Alert 3: Previsão de DRE & Margem por Veículo */}
              <div className="p-3.5 rounded-2xl border bg-brand-primary/5 border-brand-primary/20 text-brand-text flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-primary">
                    🚗 Custo de Preparação & Margem
                  </span>
                  <span className="text-[9px] font-black text-brand-primary uppercase">DRE 003.005.006</span>
                </div>
                <p className="text-[11px] text-brand-text/80 font-medium leading-tight">
                  Despesas de manutenção/peças são atribuídas diretamente à placa do veículo para cálculo de margem líquida real.
                </p>
                <Link
                  href="/admin/financeiro/relatorios"
                  className="text-[10px] font-bold uppercase text-brand-primary tracking-wider mt-1 hover:underline"
                >
                  Abrir DRE Gerencial →
                </Link>
              </div>
            </div>
          </div>

          {/* KPI Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* KPI: A Pagar */}
            <div className="bg-brand-card/30 border border-brand-border/40 rounded-2xl p-5 flex flex-col gap-1 backdrop-blur-sm select-none">
              <span className="text-[9px] font-bold text-brand-text/40 uppercase tracking-wider">A Pagar (Mês)</span>
              <span className="text-base font-black text-red-500 tracking-tight">{formatPrice(kpis.aPagarMes)}</span>
            </div>

            {/* KPI: A Receber */}
            <div className="bg-brand-card/30 border border-brand-border/40 rounded-2xl p-5 flex flex-col gap-1 backdrop-blur-sm select-none">
              <span className="text-[9px] font-bold text-brand-text/40 uppercase tracking-wider">A Receber (Mês)</span>
              <span className="text-base font-black text-emerald-500 tracking-tight">{formatPrice(kpis.aReceberMes)}</span>
            </div>

            {/* KPI: Saldo Projetado */}
            <div className="bg-brand-card/30 border border-brand-border/40 rounded-2xl p-5 flex flex-col gap-1 backdrop-blur-sm select-none">
              <span className="text-[9px] font-bold text-brand-text/40 uppercase tracking-wider">Saldo Projetado</span>
              <span className={`text-base font-black tracking-tight ${kpis.saldoProjetado >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {formatPrice(kpis.saldoProjetado)}
              </span>
            </div>

            {/* KPI: Vencidos */}
            <div className={`bg-brand-card/30 border rounded-2xl p-5 flex flex-col gap-1 backdrop-blur-sm select-none ${kpis.overdueCount > 0 ? "border-red-500/30" : "border-brand-border/40"}`}>
              <span className="text-[9px] font-bold text-brand-text/40 uppercase tracking-wider">Contas Vencidas</span>
              <div className="flex items-center justify-between">
                <span className={`text-base font-black tracking-tight ${kpis.overdueCount > 0 ? "text-red-500" : "text-brand-text"}`}>
                  {kpis.overdueCount}
                </span>
                {kpis.overdueCount > 0 && (
                  <span className="bg-red-500/10 text-red-500 text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-red-500/20 animate-pulse">
                    Ação Urgente
                  </span>
                )}
              </div>
            </div>

            {/* KPI: Custo Fixo */}
            <div className="bg-brand-card/30 border border-brand-border/40 rounded-2xl p-5 flex flex-col gap-1 backdrop-blur-sm select-none">
              <span className="text-[9px] font-bold text-brand-text/40 uppercase tracking-wider">Custo Fixo Mensal</span>
              <span className="text-base font-black text-brand-gold tracking-tight">{formatPrice(kpis.custoFixoMensal)}</span>
            </div>
          </div>

          {/* Graph and Bank Balances Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Graph Card */}
            <div className="lg:col-span-2 bg-brand-card/30 border border-brand-border/40 rounded-3xl p-6 backdrop-blur-md flex flex-col gap-6">
              <div className="flex items-center justify-between select-none">
                <div>
                  <h3 className="text-xs font-extrabold uppercase text-brand-text tracking-wider">Fluxo de Caixa Mensal</h3>
                  <p className="text-[10px] text-brand-text/40 mt-0.5">Visão geral comparativa de entradas e saídas.</p>
                </div>

                <button
                  onClick={handleGenerateRecurring}
                  disabled={isGenerating}
                  className="h-9 px-3 border border-brand-border hover:border-brand-primary/50 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all duration-200 cursor-pointer select-none bg-brand-bg/50 hover:bg-brand-primary/5 disabled:opacity-50"
                >
                  {isGenerating ? "Gerando..." : "Gerar Recorrências"}
                </button>
              </div>

              {/* Visual SVG/CSS bar chart */}
              <div className="flex flex-col gap-3 pt-4 select-none">
                <div className="flex items-end justify-between h-48 w-full px-2 border-b border-brand-border/30 pb-2">
                  {chartData.map((d, index) => {
                    const entHeight = `${(d.entradas / maxVal) * 100}%`;
                    const saiHeight = `${(d.saidas / maxVal) * 100}%`;
                    return (
                      <div key={index} className="flex flex-col items-center gap-2 flex-grow max-w-[120px]">
                        {/* Side-by-side vertical bar containers */}
                        <div className="flex items-end gap-1.5 h-36 w-full justify-center">
                          {/* Entrada Bar */}
                          <div
                            className="w-4.5 bg-gradient-to-t from-emerald-600 to-emerald-500 rounded-t-md relative group cursor-pointer transition-all duration-300 hover:scale-x-110"
                            style={{ height: entHeight }}
                          >
                            {/* Tooltip on hover */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-zinc-950 border border-brand-border text-white text-[9px] font-bold rounded px-1.5 py-0.5 shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 z-30 whitespace-nowrap">
                              Entrada: {formatPrice(d.entradas)}
                            </div>
                          </div>

                          {/* Saida Bar */}
                          <div
                            className="w-4.5 bg-gradient-to-t from-red-600 to-red-500 rounded-t-md relative group cursor-pointer transition-all duration-300 hover:scale-x-110"
                            style={{ height: saiHeight }}
                          >
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-zinc-950 border border-brand-border text-white text-[9px] font-bold rounded px-1.5 py-0.5 shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 z-30 whitespace-nowrap">
                              Saída: {formatPrice(d.saidas)}
                            </div>
                          </div>
                        </div>
                        <span className="text-[9px] font-bold text-brand-text/50 uppercase tracking-wider">{d.label}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Chart Legend */}
                <div className="flex items-center gap-4 justify-end text-[9px] font-bold uppercase tracking-wider text-brand-text/50 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                    <span>Entradas (Receitas)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                    <span>Saídas (Despesas)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bank Balances Card */}
            <div className="bg-brand-card/30 border border-brand-border/40 rounded-3xl p-6 backdrop-blur-md flex flex-col gap-4">
              {isEditingSaldos ? (
                <div className="flex items-center justify-between border-b border-brand-border/20 pb-3">
                  <div className="flex flex-col select-none">
                    <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest">Ajuste de Saldos</span>
                    <h3 className="text-xs font-extrabold uppercase text-brand-text tracking-wider mt-0.5">Modo de Edição</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsEditingSaldos(false)}
                      className="text-[9px] font-bold text-brand-text/50 uppercase hover:underline cursor-pointer select-none"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveSaldos}
                      className="text-[9px] font-bold text-emerald-500 uppercase hover:underline cursor-pointer select-none"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between border-b border-brand-border/20 pb-3">
                  <div className="flex flex-col select-none">
                    <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest">Disponibilidade</span>
                    <h3 className="text-xs font-extrabold uppercase text-brand-text tracking-wider mt-0.5">Saldos Bancários</h3>
                  </div>
                  <button
                    onClick={() => {
                      setIsEditingSaldos(true);
                      setEditSaldoCaixa((kpis.saldoCaixaAcumulado || 0).toString());
                      const initialBancos: Record<string, string> = {};
                      Object.entries(kpis.saldoPorBanco || {}).forEach(([k, v]) => {
                        initialBancos[k] = v.toString();
                      });
                      setEditSaldosBancos(initialBancos);
                    }}
                    className="text-[9px] font-bold text-brand-primary uppercase hover:underline cursor-pointer select-none"
                  >
                    Editar Saldos
                  </button>
                </div>
              )}

              {/* Balances List */}
              <div className="flex flex-col gap-3 mt-2 flex-grow justify-center">
                {isEditingSaldos ? (
                  <div className="flex flex-col gap-3.5">
                    {Object.keys(editSaldosBancos).map((banco) => (
                      <div key={banco} className="flex flex-col gap-1 border-b border-brand-border/10 pb-2.5 last:border-0 last:pb-0">
                        <label className="text-[9px] font-bold text-brand-text/40 uppercase pl-0.5">{banco}</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editSaldosBancos[banco] || ""}
                          onChange={(e) => setEditSaldosBancos({ ...editSaldosBancos, [banco]: e.target.value })}
                          className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-3 py-2 w-full focus:outline-none focus:border-brand-primary font-mono"
                        />
                      </div>
                    ))}
                  </div>
                ) : kpis.saldoPorBanco && Object.entries(kpis.saldoPorBanco).length > 0 ? (
                  Object.entries(kpis.saldoPorBanco).map(([banco, saldo]) => (
                    <div key={banco} className="flex items-center justify-between border-b border-brand-border/10 pb-3 last:border-0 last:pb-0">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-bold text-brand-text/80">{banco}</span>
                        <span className="text-[8px] font-bold text-brand-text/30 uppercase tracking-wider">Conta Corrente Ativa</span>
                      </div>
                      <span className={`text-xs font-black tracking-tight ${saldo >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {formatPrice(saldo)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-xs text-brand-text/30">Nenhum saldo bancário disponível.</div>
                )}
              </div>

              {/* Total Box */}
              <div className="bg-brand-bg/50 border border-brand-border/20 rounded-2xl p-4 flex items-center justify-between mt-auto">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-brand-text/40 uppercase tracking-wider">Saldo Geral Disponível</span>
                  <span className="text-[8px] text-brand-text/30 uppercase tracking-widest mt-0.5">Caixa Consolidado</span>
                </div>
                {isEditingSaldos ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editSaldoCaixa}
                    onChange={(e) => setEditSaldoCaixa(e.target.value)}
                    className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-3 py-2 w-32 focus:outline-none focus:border-brand-primary text-right font-black font-mono"
                  />
                ) : (
                  <span className={`text-sm font-black tracking-tight ${kpis.saldoCaixaAcumulado && kpis.saldoCaixaAcumulado >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {formatPrice(kpis.saldoCaixaAcumulado || 0)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Lists Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Próximos Vencimentos (7 dias) */}
            <div className="bg-brand-card/30 border border-brand-border/40 rounded-3xl p-6 backdrop-blur-md flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-brand-border/30 pb-3 select-none">
                <h3 className="text-xs font-extrabold uppercase text-brand-text tracking-wider">Próximos Vencimentos</h3>
                <span className="text-[9px] font-bold text-brand-text/40 uppercase">Próximos 7 dias</span>
              </div>

              {upcomingBills.length === 0 ? (
                <div className="py-12 text-center text-xs text-brand-text/30">Nenhuma conta com vencimento próximo.</div>
              ) : (
                <div className="flex flex-col divide-y divide-brand-border/20">
                  {upcomingBills.map((b) => (
                    <div key={b.id} className="py-3.5 flex items-center justify-between hover:bg-brand-card/5 transition-colors rounded-xl px-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-brand-text leading-tight">{b.descricao}</span>
                          <span
                            className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider text-white"
                            style={{ backgroundColor: b.categoria?.cor || "#6B7280" }}
                          >
                            {b.categoria?.nome || "Outros"}
                          </span>
                        </div>
                        <span className="text-[10px] text-brand-text/50">
                          {b.tipo === "pagar" ? `Para: ${b.fornecedor || "Geral"}` : `De: ${b.cliente || "Geral"}`} • Vence em {formatDate(b.data_vencimento)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`text-xs font-black tracking-tight ${b.tipo === "pagar" ? "text-red-500" : "text-emerald-500"}`}>
                          {b.tipo === "pagar" ? "-" : "+"} {formatPrice(b.valor)}
                        </span>
                        <Link
                          href={b.tipo === "pagar" ? "/admin/financeiro/contas-pagar" : "/admin/financeiro/contas-receber"}
                          className="h-7 w-7 rounded-full border border-brand-border hover:border-brand-primary/50 flex items-center justify-center text-brand-text/50 hover:text-brand-primary hover:bg-brand-primary/5 transition-all cursor-pointer"
                          title="Gerenciar conta"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                            <path fillRule="evenodd" d="M.664 9.571a1.008 1.008 0 0 0 0 1.157C1.956 12.566 5.56 16 10 16c4.44 0 8.044-3.434 9.336-5.272a1.008 1.008 0 0 0 0-1.157C18.044 7.434 14.44 4 10 4 5.56 4 1.956 7.434.664 9.571ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
                          </svg>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contas Vencidas */}
            <div className="bg-brand-card/30 border border-brand-border/40 rounded-3xl p-6 backdrop-blur-md flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-brand-border/30 pb-3 select-none">
                <h3 className="text-xs font-extrabold uppercase text-brand-text tracking-wider text-red-500">Contas Pendentes Vencidas</h3>
                <span className="bg-red-500/10 text-red-500 text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-red-500/20">
                  Total: {overdueBills.length}
                </span>
              </div>

              {overdueBills.length === 0 ? (
                <div className="py-12 text-center text-xs text-brand-text/30">Nenhuma conta em atraso. Parabéns!</div>
              ) : (
                <div className="flex flex-col divide-y divide-brand-border/20 max-h-[300px] overflow-y-auto scrollbar-thin">
                  {overdueBills.map((b) => (
                    <div key={b.id} className="py-3.5 flex items-center justify-between hover:bg-brand-card/5 transition-colors rounded-xl px-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-brand-text leading-tight">{b.descricao}</span>
                          <span className="bg-red-500/10 border border-red-500/20 text-red-500 text-[8px] font-bold uppercase px-1.5 py-0.2 rounded">
                            Atrasada
                          </span>
                        </div>
                        <span className="text-[10px] text-brand-text/50">
                          Venceu em: {formatDate(b.data_vencimento)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-black tracking-tight text-red-500">
                          {formatPrice(b.valor)}
                        </span>
                        <Link
                          href={b.tipo === "pagar" ? "/admin/financeiro/contas-pagar" : "/admin/financeiro/contas-receber"}
                          className="h-7 w-7 rounded-full border border-brand-border hover:border-brand-primary/50 flex items-center justify-center text-brand-text/50 hover:text-brand-primary hover:bg-brand-primary/5 transition-all cursor-pointer"
                          title="Pagar / Gerenciar"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.732 6.232a.75.75 0 0 1 1.017-.07l.08.07 3.5 3.5a.75.75 0 0 1 .07 1.017l-.07.08-3.5 3.5a.75.75 0 0 1-1.137-.965l.07-.096 2.22-2.22H6.75a.75.75 0 0 1-.743-.648L6 10.5a.75.75 0 0 1 .648-.743L6.75 9.75h6.182L10.71 7.53a.75.75 0 0 1-.07-1.017l.07-.08-2.22 2.22a.75.75 0 1 1-1.06-1.06l3.5-3.5Z" clipRule="evenodd" />
                          </svg>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Fast Expense Modal */}
      <LancamentoRapidoModal
        isOpen={isLancamentoRapidoOpen}
        onClose={() => setIsLancamentoRapidoOpen(false)}
        onSuccess={() => {
          setNotification("Lançamento rápido cadastrado com sucesso!");
          fetchDashboardData();
          setTimeout(() => setNotification(""), 4000);
        }}
      />

      {/* RevendaMais Batch Importer Modal */}
      <ImportadorRevendaMais
        isOpen={isImportadorOpen}
        onClose={() => setIsImportadorOpen(false)}
        onSuccess={() => {
          setNotification("Lote de contas importado do RevendaMais com sucesso!");
          fetchDashboardData();
          setTimeout(() => setNotification(""), 4000);
        }}
      />
    </div>
  );
}
