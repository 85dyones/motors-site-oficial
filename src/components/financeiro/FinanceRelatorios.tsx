"use client";

import { useEffect, useState } from "react";
import { PLANO_DE_CONTAS_REVENDA } from "@/lib/planoContasData";

interface ReportItem {
  categoria_nome: string;
  categoria_icone: string;
  tipo: "receita" | "despesa";
  valor_total: number;
  plano_codigo?: string;
}

interface DREGroup {
  codigo: string;
  nome: string;
  total: number;
  subgrupos: {
    codigo: string;
    nome: string;
    total: number;
    itens: { codigo: string; nome: string; total: number }[];
  }[];
}

export default function FinanceRelatorios() {
  const [data, setData] = useState<ReportItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"dre" | "categorias">("dre");

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear().toString());
  const [month, setMonth] = useState((now.getMonth() + 1).toString());

  // DRE calculated metrics
  const [receitasOperacionais, setReceitasOperacionais] = useState<DREGroup | null>(null);
  const [custosCMV, setCustosCMV] = useState<DREGroup | null>(null);
  const [custosComissoes, setCustosComissoes] = useState<DREGroup | null>(null);
  const [despesasOperacionais, setDespesasOperacionais] = useState<DREGroup | null>(null);
  const [despesasFinanceiras, setDespesasFinanceiras] = useState<DREGroup | null>(null);

  const fetchReport = async () => {
    setIsLoading(true);
    setError("");
    try {
      const start = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString().split("T")[0];
      const end = new Date(parseInt(year), parseInt(month), 0).toISOString().split("T")[0];

      const res = await fetch(`/api/financeiro/contas?start_date=${start}&end_date=${end}`);
      if (res.ok) {
        const resData = await res.json();
        const contas = resData.contas || [];

        const agg: Record<string, { nome: string; icone: string; tipo: "receita" | "despesa"; total: number; plano_codigo?: string }> = {};
        
        // Maps for DRE calculation
        let recOperacionalTotal = 0;
        let cmvTotal = 0;
        let comissaoTotal = 0;
        let despOperacionalTotal = 0;
        let despFinanceiraTotal = 0;

        contas.forEach((c: any) => {
          if (c.status === "cancelado") return;
          const catId = c.categoria_id || "outros";
          const catName = c.categoria?.nome || "Outros Lançamentos";
          const catIcon = c.categoria?.icone || "📁";
          const val = parseFloat(c.valor) || 0;

          if (!agg[catId]) {
            agg[catId] = {
              nome: catName,
              icone: catIcon,
              tipo: c.tipo === "pagar" ? "despesa" : "receita",
              total: 0,
            };
          }
          agg[catId].total += val;

          // Categorize into DRE Structure
          if (c.tipo === "receber" || c.tipo === "receita") {
            recOperacionalTotal += val;
          } else {
            const catNameLower = catName.toLowerCase();
            if (catNameLower.includes("compra") || catNameLower.includes("estoque") || catNameLower.includes("preparação")) {
              cmvTotal += val;
            } else if (catNameLower.includes("comissão") || catNameLower.includes("comissao")) {
              comissaoTotal += val;
            } else if (catNameLower.includes("pró-labore") || catNameLower.includes("investidor") || catNameLower.includes("financiamento")) {
              despFinanceiraTotal += val;
            } else {
              despOperacionalTotal += val;
            }
          }
        });

        const items: ReportItem[] = Object.values(agg).map((a) => ({
          categoria_nome: a.nome,
          categoria_icone: a.icone,
          tipo: a.tipo,
          valor_total: a.total,
        }));

        setData(items.sort((x, y) => y.valor_total - x.valor_total));

        // Set DRE Totals
        setReceitasOperacionais({ codigo: "003.001", nome: "RECEITAS OPERACIONAIS", total: recOperacionalTotal, subgrupos: [] });
        setCustosCMV({ codigo: "003.003", nome: "CUSTOS DOS VEÍCULOS E SERVIÇOS (CMV/CSV)", total: cmvTotal, subgrupos: [] });
        setCustosComissoes({ codigo: "003.004", nome: "CUSTOS DE VENDAS E COMISSÕES", total: comissaoTotal, subgrupos: [] });
        setDespesasOperacionais({ codigo: "003.005", nome: "DESPESAS OPERACIONAIS E ADMINISTRATIVAS", total: despOperacionalTotal, subgrupos: [] });
        setDespesasFinanceiras({ codigo: "003.006", nome: "DESPESAS FINANCEIRAS E DIVERSAS / PRÓ-LABORE", total: despFinanceiraTotal, subgrupos: [] });
      } else {
        setError("Erro ao carregar relatórios.");
      }
    } catch (err) {
      setError("Erro ao conectar com o servidor.");
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
  const lucroBruto = (receitasOperacionais?.total || 0) - (custosCMV?.total || 0);
  const ebitda = lucroBruto - (custosComissoes?.total || 0) - (despesasOperacionais?.total || 0);
  const resultadoLiquido = ebitda - (despesasFinanceiras?.total || 0);

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl">
      {/* Top Filter and Tab Selection */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-mt-surface border border-mt-regua-fina p-4 select-none">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("dre")}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
              activeTab === "dre"
                ? "bg-mt-accent text-mt-inverso"
                : "bg-mt-bg text-mt-neutral-700 hover:bg-mt-accent-100 hover:text-mt-accent border border-mt-regua-fina"
            }`}
          >
            📊 DRE Gerencial Revenda
          </button>
          <button
            onClick={() => setActiveTab("categorias")}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
              activeTab === "categorias"
                ? "bg-mt-accent text-mt-inverso"
                : "bg-mt-bg text-mt-neutral-700 hover:bg-mt-accent-100 hover:text-mt-accent border border-mt-regua-fina"
            }`}
          >
            📁 Fechamento por Categoria
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-mt-neutral-700 uppercase">Mês:</span>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-3 h-9 cursor-pointer outline-none focus:border-mt-accent"
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
            <span className="text-[10px] font-bold text-mt-neutral-700 uppercase">Ano:</span>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-3 h-9 cursor-pointer outline-none focus:border-mt-accent"
            >
              <option value="2025">2025</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-mt-accent-100 border border-mt-accent-300 text-mt-accent text-xs px-4 py-3 select-none">
          {error}
        </div>
      )}

      {/* DRE GERENCIAL VIEW */}
      {activeTab === "dre" && (
        <div className="bg-mt-surface border border-mt-regua-fina p-6 flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-mt-regua-fina pb-4">
            <div>
              <h3 className="text-[15px] font-extrabold tracking-[-.01em] text-mt-ink tracking-wider">
                DRE — Demonstração do Resultado do Exercício
              </h3>
              <p className="text-[11px] text-mt-neutral-700 mt-1">
                Estruturado rigorosamente conforme o <strong className="text-mt-accent">Plano de Contas Oficial de Revenda de Veículos</strong>.
              </p>
            </div>
            <button
              onClick={() => window.print()}
              className="px-3.5 py-2 bg-mt-bg border border-mt-regua-fina hover:border-mt-accent text-mt-ink text-[10px] font-bold uppercase tracking-wider transition-all"
            >
              🖨️ Imprimir DRE
            </button>
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-xs text-mt-neutral-700">Calculando DRE do período...</div>
          ) : (
            <div className="flex flex-col divide-y divide-mt-regua-fina font-mono text-xs">
              {/* 003.001 - RECEITAS OPERACIONAIS */}
              <div className="flex items-center justify-between py-3.5 pl-2 font-bold text-mt-accent-800 bg-mt-surface px-3">
                <span>(+) 003.001 - RECEITAS OPERACIONAIS (Venda Veículos, F&I, Seguros)</span>
                <span>{formatPrice(receitasOperacionais?.total || 0)}</span>
              </div>

              {/* 003.003 - CMV / CSV */}
              <div className="flex items-center justify-between py-3.5 pl-6 text-mt-accent">
                <span>(-) 003.003 - CUSTOS DOS VEÍCULOS E SERVIÇOS (CMV/CSV)</span>
                <span>{formatPrice(custosCMV?.total || 0)}</span>
              </div>

              {/* LUCRO BRUTO OPERACIONAL */}
              <div className="flex items-center justify-between py-3.5 pl-2 font-extrabold text-mt-ink bg-mt-accent-100 border-t border-b border-mt-accent-300 px-3">
                <span className="uppercase text-[11px]">(=) LUCRO BRUTO OPERACIONAL</span>
                <span className={lucroBruto >= 0 ? "text-mt-accent-800" : "text-mt-accent"}>{formatPrice(lucroBruto)}</span>
              </div>

              {/* 003.004 - COMISSÕES E VENDAS */}
              <div className="flex items-center justify-between py-3.5 pl-6 text-mt-accent">
                <span>(-) 003.004 - CUSTOS DE VENDAS E COMISSÕES</span>
                <span>{formatPrice(custosComissoes?.total || 0)}</span>
              </div>

              {/* 003.005 - DESPESAS OPERACIONAIS */}
              <div className="flex items-center justify-between py-3.5 pl-6 text-mt-accent">
                <span>(-) 003.005 - DESPESAS OPERACIONAIS (Admin, Pessoal, Mkt, Veículos)</span>
                <span>{formatPrice(despesasOperacionais?.total || 0)}</span>
              </div>

              {/* EBITDA / RESULTADO OPERACIONAL */}
              <div className="flex items-center justify-between py-3.5 pl-2 font-extrabold text-mt-ink bg-mt-bg border-t border-b border-mt-regua-fina px-3">
                <span className="uppercase text-[11px]">(=) RESULTADO OPERACIONAL LÍQUIDO (EBITDA)</span>
                <span className={ebitda >= 0 ? "text-mt-accent-800" : "text-mt-accent"}>{formatPrice(ebitda)}</span>
              </div>

              {/* 003.006 - DESPESAS FINANCEIRAS E DIVERSAS */}
              <div className="flex items-center justify-between py-3.5 pl-6 text-mt-accent">
                <span>(-) 003.006 - MOVIMENTAÇÕES DIVERSAS E PRÓ-LABORE</span>
                <span>{formatPrice(despesasFinanceiras?.total || 0)}</span>
              </div>

              {/* RESULTADO LÍQUIDO FINAL */}
              <div className="flex items-center justify-between py-4 pl-2 font-extrabold text-sm text-mt-inverso bg-mt-accent px-4 mt-2">
                <span className="uppercase tracking-wider">(=) RESULTADO LÍQUIDO DO EXERCÍCIO</span>
                <span>{formatPrice(resultadoLiquido)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CATEGORIES BREAKDOWN VIEW */}
      {activeTab === "categorias" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 bg-mt-surface border border-mt-regua-fina p-6">
            <h3 className="text-xs font-extrabold uppercase text-mt-ink tracking-wider border-b border-mt-regua-fina pb-3 mb-4 select-none">
              Fechamento por Categoria
            </h3>
            {isLoading ? (
              <div className="py-12 text-center text-xs text-mt-neutral-700">Carregando relatório...</div>
            ) : data.length === 0 ? (
              <div className="py-12 text-center text-xs text-mt-neutral-700">Sem lançamentos para o período filtrado.</div>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-mt-regua-fina text-mt-neutral-700 font-bold uppercase tracking-wider">
                      <th className="pb-3 pl-2">Categoria</th>
                      <th className="pb-3">Tipo</th>
                      <th className="pb-3 pr-2 text-right">Total Acumulado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mt-regua-fina">
                    {data.map((item, idx) => (
                      <tr key={idx} className="hover:bg-mt-accent-100 transition-colors">
                        <td className="py-3 pl-2 font-medium flex items-center gap-2">
                          <span>{item.categoria_icone}</span>
                          <span className="text-mt-ink font-semibold">{item.categoria_nome}</span>
                        </td>
                        <td className="py-3">
                          <span
                            className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 border ${
                              item.tipo === "receita"
                                ? "bg-mt-surface text-mt-accent-800 border-mt-regua-fina"
                                : "bg-mt-accent-100 text-mt-accent border-mt-accent-300"
                            }`}
                          >
                            {item.tipo}
                          </span>
                        </td>
                        <td
                          className={`py-3 pr-2 text-right font-extrabold font-mono ${
                            item.tipo === "receita" ? "text-mt-accent-800" : "text-mt-accent"
                          }`}
                        >
                          {formatPrice(item.valor_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right Summary Card */}
          <div className="bg-mt-surface border border-mt-regua-fina p-6 flex flex-col gap-4">
            <h3 className="text-xs font-extrabold uppercase text-mt-ink tracking-wider border-b border-mt-regua-fina pb-3 select-none">
              Resumo do Período
            </h3>
            <div className="flex justify-between items-center text-xs">
              <span className="text-mt-neutral-700 font-medium uppercase">Entradas / Receitas:</span>
              <span className="font-extrabold font-mono text-mt-accent-800">{formatPrice(totalReceitas)}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-mt-neutral-700 font-medium uppercase">Saídas / Despesas:</span>
              <span className="font-extrabold font-mono text-mt-accent">{formatPrice(totalDespesas)}</span>
            </div>
            <div className="border-t border-mt-regua-fina pt-3 flex justify-between items-center text-xs">
              <span className="text-mt-ink font-bold uppercase">Resultado do Mês:</span>
              <span
                className={`font-extrabold font-mono text-sm ${
                  totalReceitas - totalDespesas >= 0 ? "text-mt-accent-800" : "text-mt-accent"
                }`}
              >
                {formatPrice(totalReceitas - totalDespesas)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
