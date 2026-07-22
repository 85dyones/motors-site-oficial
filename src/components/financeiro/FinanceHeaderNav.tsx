"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function FinanceHeaderNav() {
  const pathname = usePathname();

  const tabs = [
    { name: "Visão Geral", icon: "📄", href: "/admin/financeiro" },
    { name: "Importar RevendaMais", icon: "📥", href: "/admin/financeiro/importar" },
    { name: "Contas a Pagar", icon: "❌", href: "/admin/financeiro/contas-pagar" },
    { name: "Contas a Receber", icon: "➕", href: "/admin/financeiro/contas-receber" },
    { name: "Despesas Recorrentes", icon: "🔄", href: "/admin/financeiro/recorrentes" },
    { name: "Compras de Insumos", icon: "🛒", href: "/admin/financeiro/compras" },
    { name: "Relatórios & Balanço", icon: "📊", href: "/admin/financeiro/relatorios" },
    { name: "Cadastros Auxiliares", icon: "📝", href: "/admin/financeiro/cadastros" },
    { name: "Margem por Veículo", icon: "📦", href: "/admin/financeiro/margens" },
  ];

  return (
    <nav className="w-full mb-6 select-none bg-brand-card/40 border border-brand-border/50 rounded-2xl p-1.5 backdrop-blur-xl shadow-lg overflow-x-auto scrollbar-none">
      <div className="flex items-center gap-1 min-w-max">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/admin/financeiro"
              ? pathname === "/admin/financeiro"
              : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-[11px] font-extrabold uppercase tracking-wider transition-all duration-300 cursor-pointer whitespace-nowrap ${
                isActive
                  ? "bg-brand-primary text-white shadow-md shadow-brand-primary/20 scale-[1.02]"
                  : "text-brand-text/70 hover:text-brand-text hover:bg-brand-primary/10"
              }`}
            >
              <span className="text-xs">{tab.icon}</span>
              <span>{tab.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
