"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

interface SidebarNavProps {
  role: string;
}

/**
 * Trilho de navegação do painel, na linguagem Modernist.
 *
 * Duas diferenças deliberadas em relação ao desenho do design doc:
 *
 * 1. **Sem ícone.** O trilho do doc é só rótulo — no sistema quem organiza é
 *    o alinhamento e a régua, não o desenho. Os ícones que existiam aqui
 *    saíram junto com o re-skin.
 * 2. **Sem contador ao lado do item.** O doc mostra `18`, `75`, `PENDENTE`
 *    nos itens. Nenhum desses números existe hoje: não há tabela de leads, e
 *    o estado das integrações não é apurado em lugar nenhum. Number inventado
 *    no painel vira decisão errada, então o contador só entra quando houver
 *    consulta real por trás.
 *
 * A lista de itens é a das páginas que existem — o rail do doc inclui telas
 * que ainda não foram construídas (leads, fotos e mídia, SEO), e link morto
 * no painel é pior que ausência.
 */
export default function SidebarNav({ role }: SidebarNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab");

  const menuGroups = [
    {
      // Grupo GERAL do doc. Marketing entra porque a matriz A17 lhe dá o
      // volume agregado de leads — a rota devolve contagem sem nome nem
      // telefone para esse perfil.
      title: "Geral",
      roles: ["admin", "comercial", "marketing", "financeiro"],
      items: [
        { name: "Visão geral", href: "/admin" },
        { name: "Leads", href: "/admin/leads" },
      ],
    },
    {
      // Grupo ESTOQUE do doc — a trilha `PAINEL / ESTOQUE / VEÍCULOS`. A
      // tabela A6 é a porta; o editor de um carro (A15) abre a partir dela.
      title: "Estoque",
      roles: ["admin", "comercial", "marketing"],
      items: [{ name: "Veículos", href: "/admin/estoque" }],
    },
    {
      // Motors Ciclo. Só Admin e Comercial pela matriz A17 ("Fechar venda do
      // Ciclo"), acrescentada em 2026-08-14. O grupo cresce conforme os
      // pacotes entram — fila de carimbos e conformidade vêm em seguida.
      title: "Ciclo",
      roles: ["admin", "comercial"],
      items: [
        { name: "Registrar venda", href: "/admin/ciclo/vendas/nova" },
        { name: "Fila de carimbos", href: "/admin/ciclo/carimbos" },
      ],
    },
    {
      // "Gerenciar campanhas de mídia paga": Admin e Marketing, pela matriz
      // A17 — Comercial e Financeiro nem veem o grupo ("o que for negado
      // some da interface, não fica cinza").
      title: "Marketing",
      roles: ["admin", "marketing"],
      items: [{ name: "Mídia paga", href: "/admin/marketing/midia-paga" }],
    },
    {
      title: "Financeiro",
      roles: ["admin", "financeiro"],
      items: [
        { name: "Visão geral", href: "/admin/financeiro" },
        { name: "Contas a pagar", href: "/admin/financeiro/contas-pagar" },
        { name: "Contas a receber", href: "/admin/financeiro/contas-receber" },
        { name: "Despesas recorrentes", href: "/admin/financeiro/recorrentes" },
        { name: "Compras de insumos", href: "/admin/financeiro/compras" },
        { name: "Importar RevendaMais", href: "/admin/financeiro/importar" },
        { name: "Relatórios e balanço", href: "/admin/financeiro/relatorios" },
        { name: "Cadastros auxiliares", href: "/admin/financeiro/cadastros" },
        { name: "Margem por veículo", href: "/admin/financeiro/margens" },
      ],
    },
    {
      // Marketing entra pela matriz A17: fotos, textos, SEO e destaques são
      // o domínio natural do perfil. A trava fina (aparência é só de Admin)
      // entra quando as abas ganharem gate próprio.
      title: "Site",
      roles: ["admin", "comercial", "marketing"],
      items: [
        // Tela A3: a porta de entrada do conteúdo do site. Vem primeiro
        // porque é dela que se alcança a edição de cada seção da home.
        { name: "Áreas e conteúdo", href: "/admin/site/areas" },
        { name: "Destaques rápidos", href: "/admin/configuracoes?tab=destaques" },
        { name: "Aparência e cores", href: "/admin/configuracoes?tab=aparencia" },
        { name: "Página quem somos", href: "/admin/configuracoes?tab=sobre" },
        // O card que aparece quando alguém cola um link do site no WhatsApp.
        // Fica em "Site" porque é conteúdo de página, não credencial.
        { name: "Compartilhamento", href: "/admin/configuracoes?tab=compartilhamento" },
        { name: "Faixa de procedência", href: "/admin/configuracoes?tab=procedencia" },
        { name: "Faixa do Instagram", href: "/admin/configuracoes?tab=instagram" },
      ],
    },
    {
      title: "Sistema",
      roles: ["admin", "comercial"],
      items: [
        { name: "Integrações e webhooks", href: "/admin/configuracoes?tab=integracao" },
        { name: "Pop-ups de lead", href: "/admin/configuracoes?tab=popups" },
        { name: "Dados da concessionária", href: "/admin/configuracoes?tab=empresa" },
      ],
    },
    {
      title: "Administrativo",
      roles: ["admin"],
      items: [{ name: "Usuários e permissões", href: "/admin/usuarios" }],
    },
  ];

  const allowedGroups = menuGroups.filter((group) => group.roles.includes(role));

  const isItemActive = (href: string) => {
    if (href.startsWith("/admin/configuracoes")) {
      const url = new URL(href, "http://localhost");
      const tabPart = url.searchParams.get("tab");
      if (pathname !== "/admin/configuracoes") return false;
      if (tabPart) return activeTab === tabPart;
      return !activeTab || activeTab === "destaques"; // aba padrão quando a URL não diz
    }

    if (href === "/admin/financeiro") {
      return pathname === "/admin/financeiro";
    }

    // O editor de um veículo (/admin/estoque/[id]) continua dentro de
    // "Veículos" no trilho — é de lá que se chega nele.
    if (href === "/admin/estoque") {
      return pathname.startsWith("/admin/estoque");
    }

    // A leitura de campanha (/admin/marketing/midia-paga/[id]) continua
    // dentro de "Mídia paga" no trilho.
    if (href === "/admin/marketing/midia-paga") {
      return pathname.startsWith("/admin/marketing/midia-paga");
    }

    return pathname === href;
  };

  return (
    <nav className="flex flex-col pb-4">
      {allowedGroups.map((group) => (
        <div key={group.title} className="px-5 pb-1.5 pt-4">
          <div className="mb-2 text-[9px] font-semibold uppercase tracking-[.18em] text-mt-inverso-suave">
            {group.title}
          </div>

          {group.items.map((item) => {
            const active = isItemActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                /* A marca do item ativo é uma régua de 3px encostada na
                   borda do trilho: daí o recuo negativo, que puxa a borda
                   para fora do respiro de 20px do grupo. */
                className={`mt-foco -ml-[13px] flex items-center border-l-[3px] py-2 pl-2.5 text-[13px] no-underline transition-colors ${
                  active
                    ? "border-mt-accent font-extrabold text-mt-inverso"
                    : "border-transparent font-normal text-mt-inverso-suave hover:text-mt-inverso"
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
