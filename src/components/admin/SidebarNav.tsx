"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarNavProps {
  role: string;
}

export default function SidebarNav({ role }: SidebarNavProps) {
  const pathname = usePathname();

  const menuItems = [
    {
      name: "Configurações",
      href: "/admin/configuracoes",
      roles: ["admin", "comercial"],
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M11.828 2.25c-.18.002-.35.074-.467.2l-1.393 1.5a.75.75 0 1 1-1.106-1.012l1.393-1.5a2.25 2.25 0 0 1 3.292-.047l.03.03a2.25 2.25 0 0 1-.047 3.292l-1.5 1.393a.75.75 0 1 1-1.012-1.106l1.5-1.393a.75.75 0 0 0 .016-1.097l-.03-.03a.75.75 0 0 0-.537-.229ZM5.25 7.5A2.25 2.25 0 0 0 3 9.75v5.5A2.25 2.25 0 0 0 5.25 17.5h5.5a2.25 2.25 0 0 0 2.25-2.25v-5.5A2.25 2.25 0 0 0 10.75 7.5h-5.5Zm0 1.5h5.5a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-.75.75h-5.5a.75.75 0 0 1-.75-.75v-5.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
        </svg>
      ),
    },
    {
      name: "Usuários",
      href: "/admin/usuarios",
      roles: ["admin"],
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-7 9a7 7 0 1 1 14 0H3Z" />
        </svg>
      ),
    },
    {
      name: "Financeiro",
      href: "/admin/financeiro",
      roles: ["admin", "financeiro"],
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M2.5 12a.75.75 0 0 1 .75-.75h13.5a.75.75 0 0 1 0 1.5H3.25A.75.75 0 0 1 2.5 12Zm0-4a.75.75 0 0 1 .75-.75h13.5a.75.75 0 0 1 0 1.5H3.25A.75.75 0 0 1 2.5 8Zm0-4a.75.75 0 0 1 .75-.75h13.5a.75.75 0 0 1 0 1.5H3.25A.75.75 0 0 1 2.5 4Zm0 12a.75.75 0 0 1 .75-.75h13.5a.75.75 0 0 1 0 1.5H3.25a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
        </svg>
      ),
    },
  ];

  const allowedItems = menuItems.filter((item) => item.roles.includes(role));

  return (
    <nav className="flex flex-col gap-1.5 w-full">
      {allowedItems.map((item) => {
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 select-none cursor-pointer ${
              isActive
                ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/20"
                : "text-brand-text/60 hover:text-brand-text hover:bg-brand-card/50"
            }`}
          >
            {item.icon}
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}
