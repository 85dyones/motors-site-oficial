/**
 * Perfis e matriz de permissões do painel — tela A17 do design doc
 * (2026-08-07).
 *
 * A matriz abaixo é a ESPECIFICAÇÃO, transcrita linha a linha do doc. Hoje o
 * painel aplica o gate por perfil na navegação (SidebarNav) e nas rotas de
 * usuário (/api/users exige admin); os pontos de alçada fina — preço até 5%,
 * revisão de publicação — dependem de telas que ainda não existem (editor de
 * veículo A15, fluxo de publicação A16) e passam a consultar esta tabela
 * quando entrarem. Centralizar aqui evita que cada tela invente a própria
 * régua.
 *
 * "Tudo que for negado some da interface do usuário, não fica cinza" — regra
 * do doc: quem consome `podeFazer()` esconde, não desabilita.
 */

export const PERFIS = ["admin", "marketing", "comercial", "financeiro"] as const;
export type Perfil = (typeof PERFIS)[number];

export type Permissao = "faz" | "revisao" | "nao_ve";

export const ROTULO_DO_PERFIL: Record<Perfil, string> = {
  admin: "Administrador",
  marketing: "Marketing",
  comercial: "Comercial",
  financeiro: "Financeiro",
};

/** Alçadas por perfil, como o A17 descreve. */
export const ALCADA_DO_PERFIL: Record<Perfil, string> = {
  admin: "Sem limite",
  marketing: "—",
  comercial: "5% no preço",
  financeiro: "R$ 1.500",
};

/** Descrição de cada perfil (cards do topo da A17). */
export const DESCRICAO_DO_PERFIL: Record<Perfil, { descricao: string; chave: string }> = {
  admin: {
    descricao:
      "Enxerga tudo e é o único que mexe em paleta, permissões e campos travados de ficha técnica.",
    chave: "Único que altera permissões",
  },
  marketing: {
    descricao:
      "Fotos, textos, SEO, destaques e campanhas de mídia paga. Vê preço, não altera.",
    chave: "Não altera preço",
  },
  comercial: {
    descricao:
      "Leads, reservas e preço dentro da alçada de 5%. Aprova o que Marketing envia.",
    chave: "Alçada de 5% no preço",
  },
  financeiro: {
    descricao:
      "Fluxo de caixa, contas, custo por veículo e o texto legal do simulador.",
    chave: "Dono do texto legal",
  },
};

export interface LinhaDaMatriz {
  acao: string;
  permissoes: Record<Perfil, Permissao>;
  observacao: string;
}

const linha = (
  acao: string,
  [admin, marketing, comercial, financeiro]: [Permissao, Permissao, Permissao, Permissao],
  observacao = "",
): LinhaDaMatriz => ({
  acao,
  permissoes: { admin, marketing, comercial, financeiro },
  observacao,
});

/** A matriz do A17, na ordem do doc. */
export const MATRIZ_DE_PERMISSOES: LinhaDaMatriz[] = [
  linha("Alterar preço até 5%", ["faz", "nao_ve", "faz", "faz"], "Registro com autor e horário"),
  linha("Alterar preço acima de 5%", ["faz", "nao_ve", "revisao", "faz"], "Revisão obrigatória de Admin"),
  linha(
    "Editar texto legal e condições de financiamento",
    ["faz", "nao_ve", "nao_ve", "faz"],
    "Trava de conformidade — some do editor de veículo",
  ),
  linha(
    "Editar paleta, logo e tipografia do site",
    ["faz", "nao_ve", "nao_ve", "nao_ve"],
    "Muda a marca inteira de uma vez",
  ),
  linha("Publicar ou despublicar veículo", ["faz", "revisao", "faz", "nao_ve"], "Exige checklist completo"),
  linha("Adicionar e reordenar fotos", ["faz", "faz", "faz", "nao_ve"], "Marketing é o dono natural"),
  linha(
    "Editar ficha técnica travada (placa)",
    ["faz", "nao_ve", "nao_ve", "nao_ve"],
    "Reescreve o histórico do veículo",
  ),
  linha("Editar opcionais e destaques rápidos", ["faz", "faz", "faz", "nao_ve"]),
  linha(
    "Ver e mover leads no kanban",
    ["faz", "nao_ve", "faz", "nao_ve"],
    "Marketing vê só o volume agregado",
  ),
  linha(
    "Ver custo de aquisição e margem",
    ["faz", "nao_ve", "nao_ve", "faz"],
    "Comercial vê preço e desconto, não custo",
  ),
  linha(
    "Lançar e aprovar contas a pagar",
    ["faz", "nao_ve", "nao_ve", "faz"],
    "Alçada de R$ 1.500 no gerente",
  ),
  linha(
    "Gerenciar campanhas de mídia paga",
    ["faz", "faz", "nao_ve", "nao_ve"],
    "Financeiro vê o total investido",
  ),
  linha("Convidar usuário e trocar perfil", ["faz", "nao_ve", "nao_ve", "nao_ve"], "Somente Admin"),
];

/** Consulta pontual da matriz; ação desconhecida nega por padrão. */
export function podeFazer(perfil: Perfil, acao: string): Permissao {
  const l = MATRIZ_DE_PERMISSOES.find((m) => m.acao === acao);
  return l ? l.permissoes[perfil] : "nao_ve";
}

/**
 * Papel legado → perfil. `role` em `profiles` é texto livre validado no app;
 * qualquer valor fora do vocabulário cai em `comercial`, o perfil de menor
 * alcance financeiro — errar para baixo, nunca para cima.
 */
export function normalizarPerfil(role: string | null | undefined): Perfil {
  return (PERFIS as readonly string[]).includes(role ?? "")
    ? (role as Perfil)
    : "comercial";
}
