"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

interface SidebarNavProps {
  role: string;
}

export default function SidebarNav({ role }: SidebarNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab");

  const menuGroups = [
    {
      title: "Administrativo",
      roles: ["admin"],
      items: [
        {
          name: "Usuários",
          href: "/admin/usuarios",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-7 9a7 7 0 1 1 14 0H3Z" />
            </svg>
          ),
        },
      ],
    },
    {
      title: "Financeiro",
      roles: ["admin", "financeiro"],
      items: [
        {
          name: "Visão Geral",
          href: "/admin/financeiro",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M12 11.5a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1-.75-.75Zm0-3a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1-.75-.75Zm-.75-2.25a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75h6a.75.75 0 0 0 .75-.75v-6a.75.75 0 0 0-.75-.75h-6Z" />
              <path fillRule="evenodd" d="M13 2.5a.5.5 0 0 0-.5-.5h-8a2.5 2.5 0 0 0-2.5 2.5v12A2.5 2.5 0 0 0 4.5 19h11a2.5 2.5 0 0 0 2.5-2.5v-11A2.5 2.5 0 0 0 15.5 3h-2v-.5ZM4.5 4A1.5 1.5 0 0 0 3 5.5v11A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5v-8.5H13v-3.5H4.5Z" clipRule="evenodd" />
            </svg>
          ),
        },
        {
          name: "Contas a Pagar",
          href: "/admin/financeiro/contas-pagar",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L9.44 10.5l-2.22 2.22a.75.75 0 1 0 1.06 1.06L10.5 11.56l2.22 2.22a.75.75 0 1 0 1.06-1.06L11.56 10.5l2.22-2.22a.75.75 0 0 0-1.06-1.06L10.5 9.44 8.28 7.22Z" clipRule="evenodd" />
            </svg>
          ),
        },
        {
          name: "Contas a Receber",
          href: "/admin/financeiro/contas-receber",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm-.75-11.25a.75.75 0 0 0-1.5 0v2.5h-2.5a.75.75 0 0 0 0 1.5h2.5v2.5a.75.75 0 0 0 1.5 0v-2.5h2.5a.75.75 0 0 0 0-1.5h-2.5v-2.5Z" clipRule="evenodd" />
            </svg>
          ),
        },
        {
          name: "Despesas Recorrentes",
          href: "/admin/financeiro/recorrentes",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h1.701a.75.75 0 0 0 0-1.5H4.25a.75.75 0 0 0-.75.75v3.25a.75.75 0 0 0 1.5 0v-1.7l.31.309a7 7 0 0 0 11.753-3.14a.75.75 0 0 0-1.751-.424ZM4.688 8.576a5.5 5.5 0 0 1 9.201-2.466l.312.311h-1.701a.75.75 0 0 0 0 1.5H15.75a.75.75 0 0 0 .75-.75V3.92a.75.75 0 0 0-1.5 0v1.7l-.31-.309a7 7 0 0 0-11.753 3.14a.75.75 0 0 0 1.751.424Z" clipRule="evenodd" />
            </svg>
          ),
        },
        {
          name: "Compras de Insumos",
          href: "/admin/financeiro/compras",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M1 1.75A.75.75 0 0 1 1.75 1h1.62c.414 0 .75.336.75.75v.021l.666 4.996a1.25 1.25 0 0 0 1.238 1.083h8.318c.553 0 .963-.448 1.055-.992l.85-5.1a1.25 1.25 0 0 0-1.233-1.458H5.975a.75.75 0 0 1 0-1.5h8.243a2.75 2.75 0 0 1 2.713 3.208l-.85 5.1a2.75 2.75 0 0 1-2.721 2.384H6.026a2.75 2.75 0 0 1-2.724-2.384L2.6 2.5H1.75A.75.75 0 0 1 1 1.75ZM6 17.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm10.5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
            </svg>
          ),
        },
        {
          name: "Relatórios & Balanço",
          href: "/admin/financeiro/relatorios",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16.5 2h-1ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9A1.5 1.5 0 0 0 9.5 18h1a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 10.5 6h-1ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5A1.5 1.5 0 0 0 3.5 18h1a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 4.5 10h-1Z" clipRule="evenodd" />
            </svg>
          ),
        },
        {
          name: "Cadastros Auxiliares",
          href: "/admin/financeiro/cadastros",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M2 3a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3Zm3.75 3.25a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Zm0 3.5a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Zm0 3.5a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5h-5.5Z" />
            </svg>
          ),
        },
        {
          name: "Margem por Veículo",
          href: "/admin/financeiro/margens",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M1 4.75a2.75 2.75 0 0 1 2.75-2.75h12.5a2.75 2.75 0 0 1 2.75 2.75v10.5a2.75 2.75 0 0 1-2.75 2.75H3.75A2.75 2.75 0 0 1 1 15.25V4.75ZM3.75 3.5c-.69 0-1.25.56-1.25 1.25v10.5c0 .69.56 1.25 1.25 1.25h12.5c.69 0 1.25-.56 1.25-1.25V4.75c0-.69-.56-1.25-1.25-1.25H3.75Z" />
            </svg>
          ),
        },
      ],
    },
    {
      title: "Configurações do Site",
      roles: ["admin", "comercial"],
      items: [
        {
          name: "Categorização de Estoque",
          href: "/admin/configuracoes?tab=estoque",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M2 3.75A.75.75 0 0 1 2.75 3h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 3.75Zm0 4.5A.75.75 0 0 1 2.75 7.5h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8.25Zm0 4.5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Zm0 4.5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
            </svg>
          ),
        },
        {
          name: "Destaques Rápidos",
          href: "/admin/configuracoes?tab=destaques",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.6 3.1-.114 4.712c-.02.83.863 1.473 1.587 1.026L10 15.747l4.086 2.408c.724.447 1.607-.196 1.587-1.026l-.114-4.712 3.6-3.1c.635-.544.297-1.584-.536-1.651l-4.752-.381-1.83-4.401Z" clipRule="evenodd" />
            </svg>
          ),
        },
        {
          name: "Página Quem Somos",
          href: "/admin/configuracoes?tab=sobre",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-6-1.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM10 17a6.974 6.974 0 0 0 4.603-1.7a.75.75 0 0 0-.256-1.258C13.255 13.528 11.686 13 10 13c-1.686 0-3.255.528-4.347 1.042a.75.75 0 0 0-.256 1.258A6.974 6.974 0 0 0 10 17Z" clipRule="evenodd" />
            </svg>
          ),
        },
      ],
    },
    {
      title: "Configurações do Sistema",
      roles: ["admin", "comercial"],
      items: [
        {
          name: "Integrações & Webhooks",
          href: "/admin/configuracoes?tab=integracao",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10 2.5a.75.75 0 0 1 .75.75v1.258a6.51 6.51 0 0 1 4.242 4.242h1.258a.75.75 0 0 1 0 1.5h-1.258a6.51 6.51 0 0 1-4.242 4.242v1.258a.75.75 0 0 1-1.5 0v-1.258a6.51 6.51 0 0 1-4.242-4.242H3.25a.75.75 0 0 1 0-1.5h1.258a6.51 6.51 0 0 1 4.242-4.242V3.25A.75.75 0 0 1 10 2.5Zm0 5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
            </svg>
          ),
        },
        {
          name: "Pop-ups de Lead",
          href: "/admin/configuracoes?tab=popups",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M10 2a6 6 0 0 0-6 6v3.586l-.707.707A1 1 0 0 0 4 14h12a1 1 0 0 0 .707-1.707L16 8.586V8a6 6 0 0 0-6-6ZM10 18a3 3 0 0 1-3-3h6a3 3 0 0 1-3 3Z" clipRule="evenodd" />
            </svg>
          ),
        },
        {
          name: "Dados da Concessionária",
          href: "/admin/configuracoes?tab=empresa",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M4 16.5v-13h-.25a.75.75 0 0 1 0-1.5h12.5a.75.75 0 0 1 0 1.5H16v13h.25a.75.75 0 0 1 0 1.5h-12.5a.75.75 0 0 1 0-1.5H4Zm3-10.5a1 1 0 1 1 2 0v2a1 1 0 1 1-2 0v-2Zm1 5a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H8Zm3-5a1 1 0 1 1 2 0v2a1 1 0 1 1-2 0v-2Z" clipRule="evenodd" />
            </svg>
          ),
        },
      ],
    },
  ];

  const allowedGroups = menuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(() => group.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);

  const isItemActive = (href: string) => {
    if (href.startsWith("/admin/configuracoes")) {
      const url = new URL(href, "http://localhost");
      const tabPart = url.searchParams.get("tab");
      if (pathname !== "/admin/configuracoes") return false;
      if (tabPart) return activeTab === tabPart;
      return !activeTab || activeTab === "estoque"; // fallback to estoque if none specified
    }

    if (href === "/admin/financeiro") {
      return pathname === "/admin/financeiro";
    }

    return pathname === href;
  };

  return (
    <nav className="flex flex-col gap-6 w-full overflow-y-auto pr-1 max-h-[calc(100vh-220px)] scrollbar-thin">
      {allowedGroups.map((group) => (
        <div key={group.title} className="flex flex-col gap-2">
          {/* Header Label */}
          <span className="text-[9px] font-bold text-brand-gold uppercase tracking-[0.15em] opacity-80 pl-3 select-none">
            {group.title}
          </span>

          <div className="flex flex-col gap-1">
            {group.items.map((item) => {
              const active = isItemActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-all duration-200 select-none cursor-pointer ${
                    active
                      ? "bg-brand-primary text-white shadow-md shadow-brand-primary/20"
                      : "text-brand-text/60 hover:text-brand-text hover:bg-brand-card/30"
                  }`}
                >
                  <span className={`shrink-0 ${active ? "text-white" : "text-brand-text/40 group-hover:text-brand-text/60"}`}>
                    {item.icon}
                  </span>
                  <span className="truncate">{item.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
