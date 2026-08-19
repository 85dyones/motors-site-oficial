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

/**
 * Papel de painel? A role `cliente` (2026-08-13, Garagem Motors) é `authenticated`
 * no Supabase mas NUNCA entra na matriz: cliente pertence à área do cliente.
 * Todo gate de painel ou de API interna pergunta aqui ANTES de
 * `normalizarPerfil` — normalizar um papel que não é de staff o promoveria a
 * "comercial".
 */
export function ehStaff(
  origem: string | string[] | { role?: string | null; papeis?: string[] | null } | null | undefined,
): boolean {
  return perfisDe(origem).length > 0;
}

/**
 * Todos os papéis de painel de alguém — a leitura multi-papel (2026-08-19).
 *
 * Aceita a linha inteira de `profiles`, o array `papeis` ou o `role` singular,
 * porque as três formas convivem: o banco mantém `role` como espelho de
 * `papeis[1]` para o código que ainda lê a coluna antiga.
 *
 * `cliente` NÃO entra na lista: ele não é papel de painel. Um funcionário que
 * também comprou carro tem `{cliente, comercial}` e é comercial aqui — o que
 * `cliente` nunca faz é ADICIONAR permissão de painel.
 */
export function perfisDe(
  origem: string | string[] | { role?: string | null; papeis?: string[] | null } | null | undefined,
): Perfil[] {
  if (!origem) return [];

  const bruto: string[] =
    typeof origem === "string"
      ? [origem]
      : Array.isArray(origem)
        ? origem
        : (origem.papeis && origem.papeis.length > 0
            ? origem.papeis
            : origem.role
              ? [origem.role]
              : []);

  return (PERFIS as readonly string[]).filter((p) => bruto.includes(p)) as Perfil[];
}

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
  // Linha ACRESCENTADA ao doc, por decisão do dono em 2026-08-08: "a placa é
  // informação interna, precisamos ter todos os campos da documentação padrão
  // — placa, renavam, carroceria". Preencher documento é trabalho de operação,
  // não de administrador; a linha acima ("ficha técnica travada") continua
  // valendo para o que vem da consulta de placa e ninguém edita: marca,
  // modelo, ano e versão.
  linha(
    "Preencher documentação do veículo (placa, renavam)",
    ["faz", "faz", "faz", "nao_ve"],
    "Dado interno — nunca aparece no site",
  ),
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
  // Linhas do Motors Ciclo, acrescentadas em 2026-08-14 (Pacote 2). O A17 é de
  // antes do programa existir; quem fecha venda e quem verifica revisão foi
  // decidido pelo dono em 2026-08-13 — ver EMENDA_01_MANUAL_CICLO.md, E7.
  linha(
    "Fechar venda do Ciclo",
    ["faz", "nao_ve", "faz", "nao_ve"],
    "Registro do par cliente-veículo — sem ele não há programa",
  ),
  linha(
    "Verificar revisão do diário de bordo",
    ["faz", "nao_ve", "faz", "nao_ve"],
    "O Comercial é dono da fila; o Admin revisa recusa",
  ),
  linha(
    "Acompanhar a conformidade do Ciclo",
    ["faz", "nao_ve", "faz", "nao_ve"],
    "O indicador que destrava a recompra — a diretoria acompanha",
  ),
];

/** Do mais permissivo para o menos — a ordem que resolve o empate multi-papel. */
const FORCA: Record<Permissao, number> = { faz: 2, revisao: 1, nao_ve: 0 };

/**
 * Consulta pontual da matriz; ação desconhecida nega por padrão.
 *
 * Com vários papéis, vence o MAIS permissivo: quem é comercial e financeiro
 * faz o que qualquer um dos dois faz. É a única leitura que não torna o
 * multi-papel um castigo — a alternativa (interseção) daria a essa pessoa
 * menos acesso do que ela teria com um papel só, que é o oposto do pedido.
 *
 * Lista vazia nega: não é "sem restrição", é "não é da equipe".
 */
export function podeFazer(perfil: Perfil | Perfil[], acao: string): Permissao {
  const l = MATRIZ_DE_PERMISSOES.find((m) => m.acao === acao);
  if (!l) return "nao_ve";
  const perfis = Array.isArray(perfil) ? perfil : [perfil];
  return perfis.reduce<Permissao>(
    (melhor, p) => (FORCA[l.permissoes[p]] > FORCA[melhor] ? l.permissoes[p] : melhor),
    "nao_ve",
  );
}

/**
 * Cada campo gravável do veículo, na linha da matriz que o governa.
 *
 * Sem este mapa, cada rota inventava o próprio recorte: a do editor checava só
 * `preco_compra` e a de lote só `vendido` e a classificação, então `placa`,
 * `descricao` e a ficha própria passavam por qualquer perfil autenticado, em
 * lote inclusive.
 *
 * `placa` fica na linha de documentação (Admin, Marketing e Comercial), e não
 * na de ficha travada: decisão do dono em 2026-08-08 — preencher documento é
 * trabalho de operação. O renavam, quando entrar, vem para esta mesma linha.
 */
export const ACAO_DO_CAMPO_DE_VEICULO: Record<string, string> = {
  placa: "Preencher documentação do veículo (placa, renavam)",
  motor: "Preencher documentação do veículo (placa, renavam)",
  cor_interna: "Preencher documentação do veículo (placa, renavam)",
  donos_anteriores: "Preencher documentação do veículo (placa, renavam)",
  garantia_fabrica: "Preencher documentação do veículo (placa, renavam)",
  preco_compra: "Ver custo de aquisição e margem",
  vendido: "Publicar ou despublicar veículo",
  tipo: "Editar opcionais e destaques rápidos",
  perfil_uso: "Editar opcionais e destaques rápidos",
  status_tag: "Editar opcionais e destaques rápidos",
  status_tag_color: "Editar opcionais e destaques rápidos",
  descricao: "Editar opcionais e destaques rápidos",
  // Mesma linha da descrição editorial: as duas são texto de anúncio, e quem
  // escreve uma escreve a outra. `descricao_seo` entrou em 20260817130000 —
  // é o texto que vai para os portais e para a busca.
  descricao_seo: "Editar opcionais e destaques rápidos",
  laudo_pericia: "Editar opcionais e destaques rápidos",
  opcionais: "Editar opcionais e destaques rápidos",
};

/**
 * O primeiro campo que este perfil NÃO pode gravar, ou `null` se pode todos.
 *
 * Campo sem linha declarada é negado: acrescentar campo gravável passa a
 * exigir decidir de quem ele é.
 */
export function campoNegadoAoPerfil(
  perfil: Perfil | Perfil[],
  campos: string[],
): { campo: string; acao: string } | null {
  for (const campo of campos) {
    const acao = ACAO_DO_CAMPO_DE_VEICULO[campo];
    if (!acao) return { campo, acao: "(campo sem linha na matriz)" };
    if (podeFazer(perfil, acao) !== "faz") return { campo, acao };
  }
  return null;
}

/**
 * Este perfil grava este campo?
 *
 * A forma de consulta que a interface usa: o doc manda esconder o que for
 * negado ("some da interface, não fica cinza"), então cada campo do editor
 * pergunta antes de se desenhar — e a mesma resposta filtra o corpo do PATCH,
 * senão salvar um texto levaria junto um campo proibido e o salvamento inteiro
 * voltaria 403.
 */
export function podeGravarCampo(perfil: Perfil | Perfil[], campo: string): boolean {
  return campoNegadoAoPerfil(perfil, [campo]) === null;
}

/**
 * Papel legado → perfil. `role` em `profiles` é texto livre validado no app;
 * qualquer valor fora do vocabulário cai em `comercial`, o perfil de menor
 * alcance financeiro — errar para baixo, nunca para cima.
 *
 * Pressupõe staff: chame `ehStaff` ANTES. Para "cliente" não existe "para
 * baixo" dentro do painel — qualquer normalização seria promoção.
 */
export function normalizarPerfil(role: string | null | undefined): Perfil {
  return (PERFIS as readonly string[]).includes(role ?? "")
    ? (role as Perfil)
    : "comercial";
}
