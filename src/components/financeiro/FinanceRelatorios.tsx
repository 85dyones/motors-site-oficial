"use client";

import { useEffect, useState } from "react";

interface ReportItem {
  categoria_nome: string;
  categoria_icone: string;
  tipo: "receita" | "despesa";
  valor_total: number;
}

export default function FinanceRelatorios() {
  const [data, setData] = useState<ReportItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear().toString());
  const [month, setMonth] = useState((now.getMonth() + 1).toString());

  const fetchReport = async () => {
    setIsLoading(true);
    setError("");
    try {
      const start = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString().split("T")[0];
      const end = new Date(parseInt(year), parseInt(month), 0).toISOString().split("T")[0];

      // Fetch all accounts due/paid in this month
      const res = await fetch(`/api/financeiro/contas?start_date=${start}&end_date=${end}`);
      if (res.ok) {
        const resData = await res.json();
        const contas = resData.contas || [];

        // Aggregate by category
        const agg: Record<string, { nome: string; icone: string; tipo: "receita" | "despesa"; total: number }> = {};
        
        contas.forEach((c: any) => {
          if (c.status === "cancelado") return;
          const catId = c.categoria_id || "outros";
          const catName = c.categoria?.nome || "Outros";
          const catIcon = c.categoria?.icone || "📁";
          
          if (!agg[catId]) {
            agg[catId] = {
              nome: catName,
              icone: catIcon,
              tipo: c.tipo === "pagar" ? "despesa" : "receita",
              total: 0,
            };
          }
          agg[catId].total += parseFloat(c.valor);
        });

        const items: ReportItem[] = Object.values(agg).map((a) => ({
          categoria_nome: a.nome,
          categoria_icone: a.icone,
          tipo: a.tipo,
          valor_total: a.total,
        }));

        setData(items.sort((x, y) => y.valor_total - x.valor_total));
      } else {
        setError("Erro ao processar relatórios.");
      }
    } catch (err) {
      setError("Erro ao se conectar com o servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [year, month]);

  const formatPrice = (value: number) => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const totalReceitas = data.filter((d) => d.tipo === "receita").reduce((acc, curr) => acc + curr.valor_total, 0);
  const totalDespesas = data.filter((d) => d.tipo === "despesa").reduce((acc, curr) => acc + curr.valor_total, 0);

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl">
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3 bg-brand-card/10 border border-brand-border/20 rounded-2xl p-4 select-none">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-brand-text/50 uppercase">Mês:</span>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-3 h-8 cursor-pointer"
          >
            <option value="1">Janeiro</option>
            <option value="2">Fevereiro</option>
            <option value="3">Março</option>
            <option value="4">Abril</option>
            <option value="5">Maio</option>
            <option value="6">Junho</option>
            <option value="7">Julho</option>
            <option value="8">Agosto</option>
            <option value="9">Setembro</option>
            <option value="10">Outubro</option>
            <option value="11">Novembro</option>
            <option value="12">Dezembro</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-brand-text/50 uppercase">Ano:</span>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-3 h-8 cursor-pointer"
          >
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs px-4 py-3 rounded-xl select-none">
          {error}
        </div>
      )}

      {/* Main breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Aggregated categories table */}
        <div className="lg:col-span-2 bg-brand-card/30 border border-brand-border/40 rounded-3xl p-6 backdrop-blur-md">
          <h3 className="text-xs font-extrabold uppercase text-brand-text tracking-wider border-b border-brand-border/30 pb-3 mb-4 select-none">
            Fechamento por Categoria
          </h3>
          {isLoading ? (
            <div className="py-12 text-center text-xs text-brand-text/50">Carregando relatório...</div>
          ) : data.length === 0 ? (
            <div className="py-12 text-center text-xs text-brand-text/50">Sem lançamentos para o período filtrado.</div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-brand-border/40 text-brand-text/40 font-bold uppercase tracking-wider">
                    <th className="pb-3 pl-2">Categoria</th>
                    <th className="pb-3">Tipo</th>
                    <th className="pb-3 pr-2 text-right">Total Acumulado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/20">
                  {data.map((d, index) => (
                    <tr key={index} className="hover:bg-brand-card/10 transition-colors">
                      <td className="py-4 pl-2 font-bold text-brand-text">
                        {d.categoria_icone} {d.categoria_nome}
                      </td>
                      <td className="py-4">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                          d.tipo === "receita"
                            ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-500"
                            : "bg-red-500/10 border border-red-500/20 text-red-500"
                        }`}>
                          {d.tipo === "receita" ? "Receita" : "Despesa"}
                        </span>
                      </td>
                      <td className="py-4 pr-2 text-right font-black text-brand-text">
                        {formatPrice(d.valor_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Closing summary panel */}
        <div className="lg:col-span-1 bg-brand-card/30 border border-brand-border/40 rounded-3xl p-6 backdrop-blur-md flex flex-col gap-4 select-none">
          <h3 className="text-xs font-extrabold uppercase text-brand-text tracking-wider border-b border-brand-border/30 pb-3">
            Balanço Mensal
          </h3>

          <div className="flex flex-col gap-3 py-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-brand-text/60">Total Receitas:</span>
              <span className="font-bold text-emerald-500">{formatPrice(totalReceitas)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-brand-text/60">Total Despesas:</span>
              <span className="font-bold text-red-500">{formatPrice(totalDespesas)}</span>
            </div>
            <div className="h-[1px] bg-brand-border/30 w-full my-1" />
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold text-brand-text">Resultado:</span>
              <span className={`font-black tracking-tight ${totalReceitas - totalDespesas >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {formatPrice(totalReceitas - totalDespesas)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
