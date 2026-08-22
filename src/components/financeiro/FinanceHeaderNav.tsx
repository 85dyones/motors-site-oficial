"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navegação horizontal do módulo financeiro, no desenho de controle
 * segmentado do design system (`.seg`): moldura de 1px, opções separadas por
 * régua fina, ativa em fundo de tinta. Os ícones-emoji do desenho anterior
 * saíram — no Modernist quem organiza é o alinhamento, não o pictograma.
 *
 * Ela repete os itens do trilho lateral de propósito: no mobile o trilho vira
 * gaveta, e esta régua é o caminho de um clique entre as telas do módulo.
 */
export default function FinanceHeaderNav() {
  const pathname = usePathname();

  const tabs = [
    { name: "Visão Geral", href: "/admin/financeiro" },
    { name: "Importar RevendaMais", href: "/admin/financeiro/importar" },
    { name: "Contas a Pagar", href: "/admin/financeiro/contas-pagar" },
    { name: "Contas a Receber", href: "/admin/financeiro/contas-receber" },
    { name: "Despesas Recorrentes", href: "/admin/financeiro/recorrentes" },
    { name: "Compras de Insumos", href: "/admin/financeiro/compras" },
    { name: "Relatórios & Balanço", href: "/admin/financeiro/relatorios" },
    { name: "Cadastros Auxiliares", href: "/admin/financeiro/cadastros" },
    { name: "Margem por Veículo", href: "/admin/financeiro/margens" },
    { name: "Investidores", href: "/admin/financeiro/investidores" },
  ];

  return (
    <nav className="scrollbar-none mb-6 w-full select-none overflow-x-auto">
      <div className="inline-flex min-w-max border border-mt-regua">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/admin/financeiro"
              ? pathname === "/admin/financeiro"
              : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={`mt-foco whitespace-nowrap border-r border-mt-regua-fina px-3.5 py-2.5 text-[11px] font-semibold tracking-[.08em] uppercase transition-colors last:border-r-0 ${
                isActive
                  ? "bg-mt-ink text-mt-bg"
                  : "text-mt-neutral-700 hover:bg-mt-accent-100 hover:text-mt-ink"
              }`}
            >
              {tab.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
