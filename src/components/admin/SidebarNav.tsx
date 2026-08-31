"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

interface SidebarNavProps {
  /**
   * TODOS os papéis de painel de quem está logado, não o primário — o trilho
   * mostra a UNIÃO dos grupos.
   *
   * Era `role: string` até 2026-08-21, e isso reproduzia no trilho o mesmo
   * bug que `has_finance_access` tinha no banco: quem tem `financeiro` como
   * SEGUNDO papel carrega `role = 'comercial'` (o espelho de `papeis[1]`) e
   * o grupo Financeiro sumia do menu — sem erro, sem log, só ausência.
   */
  perfis: string[];
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
export default function SidebarNav({ perfis }: SidebarNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab");

  const menuGroups = [
    {
      // Grupo GERAL do doc. Marketing entra porque a matriz A17 lhe dá o
      // volume agregado de leads — a rota devolve contagem sem nome nem
      // telefone para esse perfil.
      title: "Geral",
      roles: ["admin", "gestor", "comercial", "marketing", "financeiro"],
      items: [
        { name: "Visão geral", href: "/admin" },
        { name: "Leads", href: "/admin/leads" },
        // A agenda de pessoas (2026-08-24). Ela mora em GERAL, e não dentro
        // de Financeiro, porque o dono a pediu como área própria: *"o revenda
        // tem uma área de clientes sejam internos ou externos,
        // fornecedores"*. Quem vende usa a mesma lista que quem paga.
        //
        // `roles` no ITEM estreita o grupo: Marketing enxerga o grupo Geral
        // (a Visão geral e o volume de leads são dele), mas não esta lista —
        // ela é CPF, telefone e e-mail, e a linha "Ver e mover leads no
        // kanban" da A17 já lhe nega o contato individual. O proxy repete a
        // mesma régua; as duas camadas precisam concordar.
        {
          name: "Clientes e fornecedores",
          href: "/admin/clientes",
          roles: ["admin", "gestor", "comercial", "financeiro"],
        },
        // O funil de vendas (2026-08-28). Os dois itens vivem sob Leads e não
        // em Configurações: quem mexe na régua do funil é quem opera o funil,
        // e mandá-lo para o outro lado do menu é o caminho mais curto para a
        // régua nunca ser ajustada.
        //
        // O relatório abre para todo o grupo — ele é contagem por motivo, sem
        // nome nem telefone, e é a resposta para "por que a gente perde
        // venda". A rota omite o recorte por vendedor para quem a matriz A17
        // mantém longe do contato individual.
        { name: "Ganhos e perdas", href: "/admin/leads/relatorio" },
        // Configurar, não: a régua vale para a equipe inteira.
        {
          name: "Configurar funil",
          href: "/admin/leads/funil",
          roles: ["admin", "gestor"],
        },
      ],
    },
    {
      // Grupo ESTOQUE do doc — a trilha `PAINEL / ESTOQUE / VEÍCULOS`. A
      // tabela A6 é a porta; o editor de um carro (A15) abre a partir dela.
      // O Gestor entra em 2026-08-21: "ajustar valores de negócios de carro,
      // entrada e saída" (linhas de preço e de custo de aquisição na A17) só
      // acontece pelo editor do veículo, e é daqui que se chega nele.
      title: "Estoque",
      roles: ["admin", "gestor", "comercial", "marketing"],
      items: [{ name: "Veículos", href: "/admin/estoque" }],
    },
    {
      // Motors Ciclo. Só Admin e Comercial pela matriz A17 ("Fechar venda do
      // Ciclo"), acrescentada em 2026-08-14.
      title: "Ciclo",
      roles: ["admin", "comercial"],
      items: [
        { name: "Registrar venda", href: "/admin/ciclo/vendas/nova" },
        { name: "Fila de verificação", href: "/admin/ciclo/verificacao" },
        { name: "Completude", href: "/admin/ciclo/completude" },
        { name: "Conformidade", href: "/admin/ciclo/conformidade" },
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
      // O módulo de caixa (contas, dia, aprovações, conciliação, plano,
      // margens) foi APOSENTADO em 2026-08-28, por decisão do dono: nada ali
      // tinha dado real, e o financeiro renasce do zero sobre o razão de
      // partidas dobradas do handoff (spec 30). Sobrou o que fica: o controle
      // de investidores (briefing 2026-08-21), que mudou de endereço junto.
      title: "Investidores",
      roles: ["admin", "gestor", "financeiro"],
      items: [{ name: "Aportes e participações", href: "/admin/investidores" }],
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
        // Texto das páginas de marca, modelo, carroceria, perfil e faixa
        // (2026-08-31). Nasceu no grupo Estoque, com o argumento de que são
        // páginas que listam veículo — e o dono corrigiu: o que se edita ali é
        // TEXTO de página, não estoque. Quem abre é quem escreve o site, e é
        // aqui que essa pessoa procura.
        //
        // Sem `roles` próprio de propósito: os papéis deste grupo já são
        // exatamente Admin, Comercial e Marketing, que é a linha "Editar
        // opcionais e destaques rápidos" da A17 que a tela exige. Repetir a
        // lista criaria duas cópias da mesma régua para divergirem depois.
        { name: "Texto das páginas", href: "/admin/hubs" },
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

  // Basta UM papel autorizar: multi-papel soma acesso, nunca subtrai — a
  // mesma leitura de `podeFazer` na matriz. Quem vende E cuida do financeiro
  // enxerga os dois grupos; era o primário sozinho que escondia a segunda
  // metade do trabalho.
  const allowedGroups = menuGroups
    .filter((group) => group.roles.some((r) => perfis.includes(r)))
    // Um item pode ser mais restrito que o grupo. Sem `roles` próprio ele
    // herda o do grupo, que é como todos os itens sempre funcionaram.
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          !("roles" in item) ||
          (item as { roles?: string[] }).roles?.some((r) => perfis.includes(r)),
      ),
    }))
    // Grupo que ficou sem item nenhum não vira um título solto no trilho.
    .filter((group) => group.items.length > 0);

  const isItemActive = (href: string) => {
    if (href.startsWith("/admin/configuracoes")) {
      const url = new URL(href, "http://localhost");
      const tabPart = url.searchParams.get("tab");
      if (pathname !== "/admin/configuracoes") return false;
      if (tabPart) return activeTab === tabPart;
      return !activeTab || activeTab === "destaques"; // aba padrão quando a URL não diz
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
