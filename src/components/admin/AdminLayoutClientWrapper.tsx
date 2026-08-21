"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import LogoutButton from "./LogoutButton";
import { useTheme } from "../../app/ThemeContext";
import { ConfirmProvider } from "./ConfirmDialog";

interface AdminLayoutClientWrapperProps {
  role: string;
  fullName: string;
  roleLabel: string;
  sidebarNav: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Trilha da barra de topo — `PAINEL / SITE / APARÊNCIA E CORES`.
 *
 * O design doc põe essa linha em todas as doze telas do painel. Ela é
 * derivada da rota em vez de recebida por prop porque a casca é um layout do
 * App Router: as páginas abaixo dela são componentes de servidor e não têm
 * como empurrar estado para cima sem um contexto novo só para isso.
 */
function trilhaDaRota(pathname: string, aba: string | null): string {
  const partes: string[] = ["PAINEL"];

  if (pathname.startsWith("/admin/marketing/midia-paga")) {
    partes.push("MARKETING", "MÍDIA PAGA");
    // A rota da campanha tem um segmento a mais (o id); o nome dela vive no
    // conteúdo da página, não na trilha.
    if (pathname.replace("/admin/marketing/midia-paga", "").replace("/", "")) {
      partes.push("CAMPANHA");
    }
  } else if (pathname.startsWith("/admin/financeiro")) {
    partes.push("FINANCEIRO");
    const folha = pathname.replace("/admin/financeiro", "").replace("/", "");
    const nomes: Record<string, string> = {
      dia: "PAGAMENTOS DO DIA",
      "contas-pagar": "CONTAS A PAGAR",
      "contas-receber": "CONTAS A RECEBER",
      recorrentes: "DESPESAS RECORRENTES",
      compras: "COMPRAS DE INSUMOS",
      importar: "IMPORTAR REVENDAMAIS",
      relatorios: "RELATÓRIOS E BALANÇO",
      cadastros: "CADASTROS AUXILIARES",
      margens: "MARGEM POR VEÍCULO",
      investidores: "INVESTIDORES",
    };
    partes.push(folha ? nomes[folha] ?? folha.toUpperCase() : "VISÃO GERAL");
  } else if (pathname === "/admin") {
    partes.push("VISÃO GERAL");
  } else if (pathname.startsWith("/admin/leads")) {
    partes.push("GERAL", "LEADS");
  } else if (pathname.startsWith("/admin/estoque/")) {
    partes.push("ESTOQUE", "VEÍCULOS", `CÓD. ${pathname.split("/")[3] ?? ""}`);
  } else if (pathname.startsWith("/admin/site/areas")) {
    partes.push("SITE", "ÁREAS E CONTEÚDO");
  } else if (pathname.startsWith("/admin/usuarios")) {
    partes.push("SISTEMA", "USUÁRIOS E PERMISSÕES");
  } else if (pathname.startsWith("/admin/configuracoes")) {
    const nomes: Record<string, [string, string]> = {
      estoque: ["SITE", "CATEGORIZAÇÃO DE ESTOQUE"],
      destaques: ["SITE", "DESTAQUES RÁPIDOS"],
      sobre: ["SITE", "PÁGINA QUEM SOMOS"],
      aparencia: ["SITE", "APARÊNCIA E CORES"],
      integracao: ["SISTEMA", "INTEGRAÇÕES E WEBHOOKS"],
      popups: ["SISTEMA", "POP-UPS DE LEAD"],
      empresa: ["SISTEMA", "DADOS DA CONCESSIONÁRIA"],
    };
    partes.push(...(nomes[aba ?? "estoque"] ?? ["SITE", "CONFIGURAÇÕES"]));
  }

  return partes.join(" / ");
}

/**
 * `useSearchParams` obriga a uma fronteira de Suspense acima de quem o chama —
 * sem ela o build do App Router falha na página inteira. Por isso a trilha é
 * um componente próprio: o Suspense fica em volta só desta linha, e não em
 * volta da casca toda.
 */
function TrilhaDoTopo() {
  const pathname = usePathname();
  const aba = useSearchParams().get("tab");

  return (
    <div className="mr-auto truncate text-[11px] font-semibold tracking-[.14em] text-mt-neutral-700">
      {trilhaDaRota(pathname, aba)}
    </div>
  );
}

export default function AdminLayoutClientWrapper({
  role,
  fullName,
  roleLabel,
  sidebarNav,
  children,
}: AdminLayoutClientWrapperProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { companySettings } = useTheme();

  return (
    <ConfirmProvider>
      <div className="relative flex min-h-screen bg-mt-bg font-modernist text-mt-ink">
        {/* Véu do menu no mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-35 bg-mt-inverso-fundo/70 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ─── Trilho ───
            248px fixos e fundo de tinta, como nas doze telas do doc. A largura
            não é responsiva: o trilho some por inteiro abaixo de `md` e volta
            como gaveta. */}
        <aside
          className={`fixed left-0 top-0 z-40 flex h-screen w-[248px] flex-none flex-col bg-mt-inverso-fundo text-mt-inverso transition-transform duration-200 md:sticky md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* Marca */}
          <div className="flex items-center gap-2.5 border-b border-mt-inverso-regua-fina px-5 py-5">
            <span className="h-[22px] w-[7px] shrink-0 bg-mt-accent" aria-hidden="true" />
            {companySettings?.logoUrl ? (
              <img
                src={companySettings.logoUrl}
                alt={companySettings.name || "Motors"}
                className="h-6 w-auto max-w-[150px] object-contain"
              />
            ) : (
              <span className="text-sm font-extrabold tracking-[.04em]">
                MOTORS
                <span className="font-normal text-mt-inverso-suave"> ADMIN</span>
              </span>
            )}
            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="Fechar menu"
              className="mt-foco ml-auto cursor-pointer p-1 text-mt-inverso-suave hover:text-mt-inverso md:hidden"
            >
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navegação */}
          <div className="min-h-0 flex-1 overflow-y-auto" onClick={() => setSidebarOpen(false)}>
            {sidebarNav}
          </div>

          {/* Quem está logado — rodapé do trilho, como no doc */}
          <div className="mt-auto border-t border-mt-inverso-regua-fina px-5 py-4">
            <div className="truncate text-xs font-extrabold">{fullName}</div>
            <div className="mt-0.5 text-[11px] text-mt-inverso-suave">
              {roleLabel} · {role}
            </div>
            <div className="mt-3">
              <LogoutButton />
            </div>
          </div>
        </aside>

        {/* ─── Conteúdo ─── */}
        <div className="flex min-h-screen w-full min-w-0 flex-grow flex-col">
          {/* Barra de topo: 64px e régua de 2px, fixas pelo doc */}
          <header className="flex h-16 shrink-0 items-center gap-4 border-b-2 border-mt-regua bg-mt-bg px-4 md:px-7">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
              className="mt-foco cursor-pointer text-mt-ink md:hidden"
            >
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>

            <Suspense fallback={<div className="mr-auto" />}>
              <TrilhaDoTopo />
            </Suspense>

            <Link
              href="/"
              target="_blank"
              className="mt-btn mt-btn-contorno mt-foco px-4 py-2.5 text-[11px]"
            >
              VER O SITE
            </Link>
          </header>

          <main className="min-w-0 flex-grow p-4 md:p-7">{children}</main>
        </div>
      </div>
    </ConfirmProvider>
  );
}
