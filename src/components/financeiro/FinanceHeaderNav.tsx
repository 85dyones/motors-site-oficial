"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function FinanceHeaderNav() {
  const pathname = usePathname();

  const tabs = [
    { name: "Resumo", href: "/admin/financeiro" },
    { name: "Contas a Pagar", href: "/admin/financeiro/contas-pagar" },
    { name: "Contas a Receber", href: "/admin/financeiro/contas-receber" },
    { name: "Recorrências", href: "/admin/financeiro/recorrentes" },
    { name: "Compras", href: "/admin/financeiro/compras" },
  ];

  return (
    <div className="flex border-b border-brand-border/40 w-full mb-6 select-none overflow-x-auto scrollbar-thin">
      {tabs.map((tab) => {
        const isActive =
          tab.href === "/admin/financeiro"
            ? pathname === "/admin/financeiro"
            : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all duration-200 whitespace-nowrap cursor-pointer ${
              isActive
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-brand-text/50 hover:text-brand-text hover:border-brand-border/40"
            }`}
          >
            {tab.name}
          </Link>
        );
      })}
    </div>
  );
}
