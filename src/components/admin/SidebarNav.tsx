"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { PERFIS_QUE_TRIAM_ERROS } from "../../lib/filaDeErros";
import { ABAS_DO_SITE } from "../../lib/abasDeConfiguracao";
import { PERFIS } from "../../lib/permissoes";

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
/**
 * Quem vê a Visão geral, Leads e Ganhos e perdas. Era a lista de papéis do
 * grupo Geral até 05/10/2026, quando o SDR entrou no grupo só para alcançar a
 * agenda de pessoas: o nome separa "vê o grupo" de "vê estes itens".
 */
const QUEM_VE_O_GERAL = ["admin", "gestor", "comercial", "marketing", "financeiro"] as const;

/** Onde o navegador guarda os grupos que a pessoa abriu ou fechou. */
const CHAVE_DOS_GRUPOS = "mt_painel_grupos";
const EVENTO_DOS_GRUPOS = "mt-painel-grupos";

/* A escolha mora no navegador, e o React a lê como fonte externa: sem estado
   copiado num efeito, e duas abas do painel abertas ficam iguais. */
function assinarGrupos(avisar: () => void) {
  window.addEventListener("storage", avisar);
  window.addEventListener(EVENTO_DOS_GRUPOS, avisar);
  return () => {
    window.removeEventListener("storage", avisar);
    window.removeEventListener(EVENTO_DOS_GRUPOS, avisar);
  };
}
function lerGrupos(): string {
  try {
    return localStorage.getItem(CHAVE_DOS_GRUPOS) ?? "{}";
  } catch {
    return "{}";
  }
}

export default function SidebarNav({ perfis }: SidebarNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab");

  const menuGroups = [
    {
      // Grupo GERAL do doc. Marketing entra porque a matriz A17 lhe dá o
      // volume agregado de leads — a rota devolve contagem sem nome nem
      // telefone para esse perfil.
      //
      // O SDR entrou no grupo em 05/10/2026 por causa da agenda, e só por
      // ela: os outros itens e a Visão geral seguem com `QUEM_VE_O_GERAL`,
      // que é quem os via até então.
      title: "Geral",
      roles: [...QUEM_VE_O_GERAL, "sdr"],
      items: [
        // A Visão geral saiu da lista do grupo em 03/10/2026: ela é a porta
        // do painel e fica fixa no topo do trilho, fora dos grupos que abrem e
        // fecham. Quem a vê é `QUEM_VE_O_GERAL`.
        { name: "Leads", href: "/admin/leads", roles: [...QUEM_VE_O_GERAL] },
        // A agenda de pessoas (2026-08-24). Ela mora em GERAL, e não dentro
        // de Financeiro, porque o dono a pediu como área própria: *"o revenda
        // tem uma área de clientes sejam internos ou externos,
        // fornecedores"*. Quem vende usa a mesma lista que quem paga.
        //
        // De toda a equipe desde 05/10/2026 (decisão do dono: *"A agenda
        // precisa ser vista por todos, o lead não"*): `PERFIS` inteiro, a
        // linha "Ver clientes e fornecedores" da matriz. Marketing e SDR
        // leem; quem cadastra e edita continua sendo quem era. O proxy repete
        // a mesma régua; as duas camadas precisam concordar.
        {
          name: "Clientes e fornecedores",
          href: "/admin/clientes",
          roles: [...PERFIS],
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
        { name: "Ganhos e perdas", href: "/admin/leads/relatorio", roles: [...QUEM_VE_O_GERAL] },
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
      items: [
        { name: "Veículos", href: "/admin/estoque" },
        // A consulta de placa (2026-10-06): o retrato do carro oferecido à
        // loja, antes de ele ser estoque. Mora aqui porque é a porta de
        // ENTRADA do estoque. `roles` estreita o grupo: Marketing não avalia
        // compra, e a consulta é paga — a linha "Consultar placa de veículo
        // (consulta paga)" da matriz, a mesma que a página, a rota e a RLS
        // cobram.
        { name: "Consulta de placa", href: "/admin/consulta-placa", roles: ["admin", "gestor", "comercial"] },
      ],
    },
    {
      // Repasse Motors (2026-09-24): carros vendidos no estado, sem a
      // garantia da loja. Todo perfil cadastra (dono, 24/09); a lista de
      // inscritos — WhatsApp e CNPJ — é só de quem valida (Administrador,
      // Gestor, Comercial), como a RLS e a página. O SDR (papel do #147)
      // cadastra e não valida: entra em `roles` do grupo e fica fora do item
      // da lista.
      title: "Repasse",
      roles: ["admin", "gestor", "comercial", "marketing", "financeiro", "sdr"],
      items: [
        { name: "Carros de repasse", href: "/admin/repasse" },
        { name: "Lista do repasse", href: "/admin/repasse/inscritos", roles: ["admin", "gestor", "comercial"] },
      ],
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
      // As condições do simulador (2026-09-28): taxas, ano mais antigo
      // financiado e bancos parceiros, com vigência. A linha da A17 é
      // "Editar texto legal e condições de financiamento" — Administrador e
      // Financeiro —, a mesma que a página e a rota cobram.
      title: "Financiamento",
      roles: ["admin", "financeiro"],
      items: [{ name: "Condições do simulador", href: "/admin/financiamento" }],
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
        { name: "Destaques", href: "/admin/site/destaques" },
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
        // Guias é vizinho de "Texto das páginas" e mesma régua de papel, mas a
        // diferença importa para quem procura: lá se CORRIGE o texto de uma
        // página que já existe; aqui se CRIA a página.
        { name: "Guias", href: "/admin/guias" },
        // Seis telas de configuração viraram UMA entrada (03/10/2026): o grupo
        // tinha dez itens, e seis eram abas da mesma tela. As abas agora
        // aparecem dentro dela (`ABAS_DO_SITE` em `lib/abasDeConfiguracao.ts`),
        // e este item fica aceso em qualquer uma.
        { name: "Configurações do site", href: "/admin/configuracoes?tab=destaques", abas: ABAS_DO_SITE.map((a) => a.id) },
      ],
    },
    {
      title: "Sistema",
      roles: ["admin", "comercial"],
      items: [
        // A fila de triagem de erro do site (2026-09-11). Mora em SISTEMA, e não
        // em Geral: a pergunta que ela responde é "o site está inteiro?", a mesma
        // de "Integrações e webhooks", que é a vizinha de linha. Erro do site é
        // OPERAÇÃO — nada nele é financeiro, e nenhum número dele é dinheiro.
        //
        // `roles` no item estreita o grupo para Admin. A decisão que sai da tela
        // — "corrigir agora" — é de quem mexe no código, e é o dono quem abre. E
        // `mensagem`/`stack` podem carregar PII por acidente: o `comment on
        // table` de `erros` avisa que um erro do PostgREST cita valores
        // (`Key (telefone)=(5541…)`).
        //
        // ATENÇÃO: isto esconde o ITEM, não fecha o DADO. A RLS de `erros`
        // libera leitura para todo `is_staff` — 7 pessoas ativas contra as 2
        // desta lista, medido em 2026-09-12 —, e quem tem sessão de painel lê a
        // tabela direto no PostgREST sem passar por aqui. O porquê, os números e
        // o que faltaria para fechar de verdade estão no cabeçalho de
        // `PERFIS_QUE_TRIAM_ERROS` (`src/lib/filaDeErros.ts`); esta lista é a
        // mesma que a página aplica, então trilho e página não divergem.
        {
          name: "Erros do site",
          href: "/admin/erros",
          roles: [...PERFIS_QUE_TRIAM_ERROS],
        },
        { name: "Integrações e webhooks", href: "/admin/configuracoes?tab=integracao" },
        { name: "Pop-ups de lead", href: "/admin/configuracoes?tab=popups" },
        { name: "Dados da concessionária", href: "/admin/configuracoes?tab=empresa" },
        // Era um grupo "Administrativo" de um item só. Mora em Sistema desde
        // 03/10/2026, e continua só de Admin.
        { name: "Usuários e permissões", href: "/admin/usuarios", roles: ["admin"] },
      ],
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

  const isItemActive = (href: string, abas?: readonly string[]) => {
    // A entrada que reúne várias abas fica acesa em qualquer uma delas, e na
    // tela sem `?tab=`, que abre a primeira.
    if (abas) {
      if (pathname !== "/admin/configuracoes") return false;
      return !activeTab || abas.includes(activeTab);
    }
    if (href.startsWith("/admin/configuracoes")) {
      const url = new URL(href, "http://localhost");
      const tabPart = url.searchParams.get("tab");
      if (pathname !== "/admin/configuracoes") return false;
      if (tabPart) return activeTab === tabPart;
      return false;
    }

    // A visão e o editor de um veículo (/admin/estoque/[id] e /editar)
    // continuam dentro de "Veículos" no trilho — é de lá que se chega neles.
    if (href === "/admin/estoque") {
      return pathname.startsWith("/admin/estoque");
    }

    // O carro de repasse (/admin/repasse/novo, /[id], /[id]/editar) continua
    // dentro de "Carros de repasse". A lista de inscritos é item próprio.
    if (href === "/admin/repasse") {
      return pathname.startsWith("/admin/repasse") && !pathname.startsWith("/admin/repasse/inscritos");
    }

    // A leitura de campanha (/admin/marketing/midia-paga/[id]) continua
    // dentro de "Mídia paga" no trilho.
    if (href === "/admin/marketing/midia-paga") {
      return pathname.startsWith("/admin/marketing/midia-paga");
    }

    // O detalhe de um grupo (/admin/erros/[hash]) continua dentro de "Erros do
    // site": é de lá que se chega nele, e é para lá que se volta.
    if (href === "/admin/erros") {
      return pathname.startsWith("/admin/erros");
    }

    return pathname === href;
  };

  const abasDe = (item: { href: string }) => ("abas" in item ? (item as { abas?: readonly string[] }).abas : undefined);
  const grupoTemAtivo = (group: (typeof allowedGroups)[number]) =>
    group.items.some((item) => isItemActive(item.href, abasDe(item)));

  // O que a pessoa abriu ou fechou à mão, lembrado no navegador. Sem escolha
  // guardada, só o grupo da tela atual fica aberto: é o que o servidor também
  // desenha, então nada pisca na primeira pintura.
  const textoDasEscolhas = useSyncExternalStore(assinarGrupos, lerGrupos, () => "{}");
  const escolhas = useMemo<Record<string, boolean>>(() => {
    try {
      const salvo: unknown = JSON.parse(textoDasEscolhas);
      return salvo && typeof salvo === "object" ? (salvo as Record<string, boolean>) : {};
    } catch {
      return {}; // valor estragado: fica o padrão
    }
  }, [textoDasEscolhas]);
  const alternar = (titulo: string, abertoAgora: boolean) => {
    try {
      localStorage.setItem(CHAVE_DOS_GRUPOS, JSON.stringify({ ...escolhas, [titulo]: !abertoAgora }));
      window.dispatchEvent(new Event(EVENTO_DOS_GRUPOS));
    } catch {
      /* armazenamento bloqueado: o menu fica no padrão, com o grupo da tela aberto */
    }
  };

  // Por uma lista com nome, e não pela posição nem pelos papéis do grupo:
  // reordenar os grupos, ou abrir o Geral a mais alguém por causa de um item,
  // não pode mudar quem vê a porta do painel.
  const veAVisaoGeral = QUEM_VE_O_GERAL.some((r) => perfis.includes(r));
  const classeDoItem = (active: boolean) =>
    /* A marca do item ativo é uma régua de 3px encostada na borda do trilho. */
    `mt-foco flex min-h-11 items-center border-l-[3px] pl-[17px] pr-5 text-[13px] no-underline transition-colors ${
      active
        ? "border-mt-accent font-extrabold text-mt-inverso"
        : "border-transparent font-normal text-mt-inverso-suave hover:text-mt-inverso"
    }`;

  return (
    <nav aria-label="Painel" className="flex flex-col pb-4 pt-2">
      {veAVisaoGeral && (
        <Link
          href="/admin"
          aria-current={pathname === "/admin" ? "page" : undefined}
          className={`${classeDoItem(pathname === "/admin")} text-[14px]`}
        >
          Visão geral
        </Link>
      )}

      {allowedGroups.map((group) => {
        const temAtivo = grupoTemAtivo(group);
        // O grupo da tela atual fica sempre aberto: fechado, ele esconderia o
        // item em que a pessoa está. Os outros seguem a escolha guardada.
        const aberto = temAtivo || (escolhas[group.title] ?? false);
        const idDaLista = `grupo-${group.title.toLowerCase()}`;
        return (
          <div key={group.title} className="border-t border-mt-inverso-regua-fina">
            <button
              type="button"
              aria-expanded={aberto}
              aria-controls={idDaLista}
              onClick={(e) => {
                // No celular o trilho mora numa gaveta que fecha a qualquer
                // clique dentro dela (`AdminLayoutClientWrapper`). Abrir um
                // grupo não é navegar: o clique para aqui.
                e.stopPropagation();
                alternar(group.title, aberto);
              }}
              className={`mt-foco flex min-h-11 w-full cursor-pointer items-center justify-between border-0 bg-transparent px-5 text-left text-[10px] font-extrabold uppercase tracking-[.16em] hover:text-mt-inverso ${
                aberto || temAtivo ? "text-mt-inverso" : "text-mt-inverso-suave"
              }`}
            >
              <span>{group.title}</span>
              <span aria-hidden="true" className="text-[14px] font-normal tracking-normal text-mt-cobre-marca">
                {aberto ? "–" : "+"}
              </span>
            </button>
            {/* Fechado, o grupo continua no HTML (`hidden`): o leitor de tela e
                o Tab pulam os itens, e nada precisa ser buscado ao abrir. */}
            <div id={idDaLista} hidden={!aberto} className="flex flex-col pb-2">
              {group.items.map((item) => {
                const active = isItemActive(item.href, abasDe(item));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={classeDoItem(active)}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
