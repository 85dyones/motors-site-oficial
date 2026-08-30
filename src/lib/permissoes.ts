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

export const PERFIS = ["admin", "gestor", "marketing", "comercial", "financeiro"] as const;
export type Perfil = (typeof PERFIS)[number];

/**
/**
 * Papéis que existem no vocabulário do banco mas NÃO são de painel.
 *
 * `cliente` (2026-08-13, Garagem Motors) e `investidor` (2026-08-22) têm área
 * própria — `/garagem` e `/investidor` — e nenhum acesso ao painel. Eles ficam
 * FORA de `PERFIS` de propósito: `ehStaff` é a régua de "é gente da loja", e
 * quem passa por ela recebe o payload completo de `/api/settings` (token de
 * API, saldos, `preco_compra` de todo o estoque), a escrita de estoque e os
 * leads. Promover investidor a perfil de painel seria dar tudo isso a quem só
 * precisa ver a própria posição.
 *
 * Não há lista de exclusão em lugar nenhum: `perfisDe` descarta o que não
 * está em `PERFIS`, então `ehStaff` responde `false` sozinho.
 */
export const PAPEIS_SEM_PAINEL = ["cliente", "investidor"] as const;
export type PapelSemPainel = (typeof PAPEIS_SEM_PAINEL)[number];

/**
 * O que a A17 pode atribuir a alguém — painel e não-painel.
 *
 * `investidor` PRECISA estar aqui: sem ele, `/api/users` recusa o papel e a
 * área `/investidor` fica inalcançável — ninguém consegue criar a conta que
 * ela pressupõe. Foi exatamente o que aconteceu entre a criação do papel e
 * esta constante.
 */
export const PAPEIS_ATRIBUIVEIS = [...PERFIS, ...PAPEIS_SEM_PAINEL] as const;
export type PapelAtribuivel = (typeof PAPEIS_ATRIBUIVEIS)[number];

/**
 * Todo papel que o banco aceita — a régua de `papeis_validos()`.
 *
 * Hoje coincide com `PAPEIS_ATRIBUIVEIS`, e os dois nomes ficam porque
 * significam coisas diferentes: este é o que o BANCO aceita, aquele é o que a
 * TELA oferece. No dia em que existir papel que o banco aceita mas o admin
 * não concede (ou o contrário), eles se separam sem ninguém ter que caçar
 * chamadas. Um teste trava este contra o CHECK do SQL.
 */
export const TODOS_OS_PAPEIS = [...PERFIS, ...PAPEIS_SEM_PAINEL] as const;

/** Rótulo de exibição de QUALQUER papel conhecido. */
export const ROTULO_DO_PAPEL: Record<string, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  marketing: "Marketing",
  comercial: "Comercial",
  financeiro: "Financeiro",
  cliente: "Cliente",
  investidor: "Investidor",
};

/** Este papel é de painel? Falso para `investidor` e `cliente`. */
export function ehPapelDePainel(papel: string): boolean {
  return (PERFIS as readonly string[]).includes(papel);
}

/**
 * Põe os papéis na ordem em que o banco vai guardá-los — `papeis[0]` é o
 * PRIMÁRIO, e é ele que o trigger espelha em `role`.
 *
 * Existe porque trocar o primário era impossível pela tela (2026-08-21): o
 * seletor só sabia ANEXAR papel no fim, então quem virou admin primeiro
 * continuava admin primário para sempre. O pedido do dono foi direto — *"um
 * adm que perdeu a função ou foi para o comercial puro"*.
 *
 * Duas garantias, nesta ordem:
 *
 * 1. **O primário escolhido vem primeiro** — é o gesto que faltava.
 * 2. **Papel de painel sempre precede papel de fora do painel.** `role` é
 *    lido como "o papel de equipe" por código antigo que ainda não migrou
 *    para `papeis`; deixar `investidor` virar primário de alguém que também é
 *    comercial faria esse código enxergar um papel que não existe na matriz.
 *    Quem é SÓ investidor tem `investidor` no primeiro lugar, e está certo:
 *    aí não há papel de equipe para pôr na frente.
 */
export function ordenarPapeis(papeis: string[], primario?: string): string[] {
  const unicos = [...new Set(papeis.filter(Boolean))];
  const dePainel = unicos.filter(ehPapelDePainel);
  const foraDoPainel = unicos.filter((p) => !ehPapelDePainel(p));

  const promovido =
    primario && dePainel.includes(primario)
      ? [primario, ...dePainel.filter((p) => p !== primario)]
      : dePainel;

  return [...promovido, ...foraDoPainel];
}

/**
 * Papel de painel? As roles de `PAPEIS_SEM_PAINEL` — `cliente` (2026-08-13,
 * Garagem Motors) e `investidor` (2026-08-22) — são `authenticated` no
 * Supabase mas NUNCA entram na matriz: cada uma pertence à própria área.
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
 * `cliente` e `investidor` NÃO entram na lista: nenhum dos dois é papel de
 * painel. Um funcionário que também comprou carro tem `{cliente, comercial}` e
 * é comercial aqui; um sócio que também trabalha na loja tem
 * `{investidor, gestor}` e é gestor aqui. O que esses papéis nunca fazem é
 * ADICIONAR permissão de painel.
 */
export function perfisDe(
  origem: string | string[] | { role?: string | null; papeis?: string[] | null } | null | undefined,
): Perfil[] {
  const bruto = papeisBrutos(origem);
  return (PERFIS as readonly string[]).filter((p) => bruto.includes(p)) as Perfil[];
}

/**
 * Os papéis de alguém SEM filtrar pelo painel — inclui `cliente` e
 * `investidor`.
 *
 * `perfisDe` descarta o que não é papel de painel, e é isso que o torna
 * seguro para gates. Quem precisa saber que a pessoa é investidora não pode
 * usá-lo: para ela `perfisDe` devolve lista vazia, que é o correto para
 * "não é da equipe" e inútil para "que área é a dela".
 */
export function papeisBrutos(
  origem: string | string[] | { role?: string | null; papeis?: string[] | null } | null | undefined,
): string[] {
  if (!origem) return [];

  return typeof origem === "string"
    ? [origem]
    : Array.isArray(origem)
      ? origem
      : (origem.papeis && origem.papeis.length > 0
          ? origem.papeis
          : origem.role
            ? [origem.role]
            : []);
}

/**
 * É investidor? Papel de área própria (`/investidor`), nunca de painel.
 *
 * Independente de `ehStaff`: alguém pode ser as duas coisas (o sócio que
 * também trabalha na loja), e nesse caso as duas áreas valem.
 */
export function ehInvestidor(
  origem: string | string[] | { role?: string | null; papeis?: string[] | null } | null | undefined,
): boolean {
  return papeisBrutos(origem).includes("investidor");
}

export type Permissao = "faz" | "revisao" | "nao_ve";

export const ROTULO_DO_PERFIL: Record<Perfil, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  marketing: "Marketing",
  comercial: "Comercial",
  financeiro: "Financeiro",
};

/**
 * Alçadas por perfil, como o A17 descreve.
 *
 * A do Financeiro deixou de ser um VALOR em 2026-08-21. O doc dizia
 * "R$ 1.500", e o dono desfez a régua: *"essa regra de 1.500 reais não faz
 * sentido no financeiro"*. Limite em reais não descreve o risco de uma
 * revenda — R$ 1.200 de despesa nova recorrente compromete mais que
 * R$ 40.000 de um carro já negociado —, e obrigava a arbitrar um número que
 * ninguém sabia defender. O que passa a valer é o ATO: agendar pagamento é
 * decisão de gasto e vai ao Gestor; registrar o que já foi pago é
 * escrituração e não vai a ninguém. Ver `src/lib/alcada.ts`.
 */
export const ALCADA_DO_PERFIL: Record<Perfil, string> = {
  admin: "Sem limite",
  gestor: "Sem limite no preço",
  marketing: "—",
  comercial: "5% no preço",
  financeiro: "Sem limite no preço",
};

/** Descrição de cada perfil (cards do topo da A17). */
export const DESCRICAO_DO_PERFIL: Record<Perfil, { descricao: string; chave: string }> = {
  admin: {
    descricao:
      "Enxerga tudo e é o único que mexe em paleta, permissões e campos travados de ficha técnica.",
    chave: "Único que altera permissões",
  },
  gestor: {
    descricao:
      "Ajusta os valores de entrada e saída dos negócios de carro, configura o funil de vendas e acompanha investidores e a conformidade do Ciclo.",
    chave: "Ajusta valores do negócio",
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
      "Custo por veículo, investidores e o texto legal do simulador — o caixa renasce sobre o razão do novo financeiro.",
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
  [admin, gestor, marketing, comercial, financeiro]: [
    Permissao,
    Permissao,
    Permissao,
    Permissao,
    Permissao,
  ],
  observacao = "",
): LinhaDaMatriz => ({
  acao,
  permissoes: { admin, gestor, marketing, comercial, financeiro },
  observacao,
});

/** A matriz do A17, na ordem do doc. */
export const MATRIZ_DE_PERMISSOES: LinhaDaMatriz[] = [
  linha(
    "Alterar preço até 5%",
    ["faz", "faz", "nao_ve", "faz", "faz"],
    "Registro com autor e horário",
  ),
  // O Gestor entra sem revisão (2026-08-21): "ajustar valores de negócios de
  // carro, entrada e saída" é a razão de o papel existir — mandá-lo a
  // revisão seria negar a própria alçada. O Comercial segue em revisão.
  linha(
    "Alterar preço acima de 5%",
    ["faz", "faz", "nao_ve", "revisao", "faz"],
    "Revisão de Admin — o Gestor decide dentro da alçada dele",
  ),
  linha(
    "Editar texto legal e condições de financiamento",
    ["faz", "nao_ve", "nao_ve", "nao_ve", "faz"],
    "Trava de conformidade — some do editor de veículo",
  ),
  linha(
    "Editar paleta, logo e tipografia do site",
    ["faz", "nao_ve", "nao_ve", "nao_ve", "nao_ve"],
    "Muda a marca inteira de uma vez",
  ),
  linha(
    "Publicar ou despublicar veículo",
    ["faz", "nao_ve", "revisao", "faz", "nao_ve"],
    "Exige checklist completo",
  ),
  linha(
    "Adicionar e reordenar fotos",
    ["faz", "nao_ve", "faz", "faz", "nao_ve"],
    "Marketing é o dono natural",
  ),
  linha(
    "Editar ficha técnica travada (placa)",
    ["faz", "nao_ve", "nao_ve", "nao_ve", "nao_ve"],
    "Reescreve o histórico do veículo",
  ),
  linha("Editar opcionais e destaques rápidos", ["faz", "nao_ve", "faz", "faz", "nao_ve"]),
  // Linha ACRESCENTADA ao doc, por decisão do dono em 2026-08-08: "a placa é
  // informação interna, precisamos ter todos os campos da documentação padrão
  // — placa, renavam, carroceria". Preencher documento é trabalho de operação,
  // não de administrador; a linha acima ("ficha técnica travada") continua
  // valendo para o que vem da consulta de placa e ninguém edita: marca,
  // modelo, ano e versão.
  linha(
    "Preencher documentação do veículo (placa, renavam)",
    ["faz", "nao_ve", "faz", "faz", "nao_ve"],
    "Dado interno — nunca aparece no site",
  ),
  linha(
    "Ver e mover leads no kanban",
    ["faz", "nao_ve", "nao_ve", "faz", "nao_ve"],
    "Marketing vê só o volume agregado",
  ),
  linha(
    "Ver custo de aquisição e margem",
    ["faz", "faz", "nao_ve", "nao_ve", "faz"],
    "O custo é a ENTRADA do negócio — Comercial vê preço e desconto, não custo",
  ),
  // As linhas do módulo de caixa — "Lançar e aprovar contas a pagar",
  // "Aprovar agendamento financeiro" (2026-08-21) e "Ver relatórios
  // gerenciais e DRE" — saíram em 2026-08-28 com a aposentadoria do módulo,
  // por decisão do dono: o financeiro renasce do zero sobre o razão do
  // handoff (spec 30), e as linhas voltam com os nomes das telas novas.
  //
  // Separação de funções, decidida em 2026-08-21 junto com "quem aprova
  // pagamento no dia a dia é o Gestor": quem libera um agendamento não pode
  // apagar a conta, a movimentação de caixa que a baixa gerou e a trilha da
  // própria decisão — some tudo junto e sem log. Gestor e Financeiro
  // CANCELAM (status 'cancelado' preserva a linha); apagar é do Admin.
  linha(
    "Excluir lançamento financeiro",
    ["faz", "nao_ve", "nao_ve", "nao_ve", "nao_ve"],
    "Quem aprova não apaga a prova — os demais cancelam",
  ),
  // Linha ACRESCENTADA em 2026-08-21, briefing do dono com a adm/financeira:
  // controle de aportes e retiradas dos investidores. Capital de investidor é
  // assunto de quem fecha o caixa e de quem responde pelo negócio — Comercial
  // e Marketing nem veem o grupo.
  linha(
    "Controlar aportes e retiradas de investidores",
    ["faz", "faz", "nao_ve", "nao_ve", "faz"],
    "Saldo derivado do extrato, nunca digitado",
  ),
  // Linha ACRESCENTADA em 2026-08-24, pedido do dono: *"precisamos ter uma aba
  // clientes... o revenda tem uma área de clientes sejam internos ou externos,
  // fornecedores... pra organizar tudo e termos como gerenciar"*.
  //
  // Marketing fica de fora e a razão está uma linha acima, em "Ver e mover
  // leads no kanban": o perfil vê VOLUME, não contato. A agenda é uma lista de
  // CPF, telefone e e-mail — dar aqui o que o kanban nega seria furar a régua
  // por uma porta lateral. O Comercial entra porque é quem atende, e o
  // Financeiro porque metade da agenda é fornecedor dele.
  linha(
    "Gerenciar clientes e fornecedores",
    ["faz", "faz", "nao_ve", "faz", "faz"],
    "Cadastro único — Marketing vê volume de lead, não contato",
  ),
  // Linha ACRESCENTADA em 2026-08-28, pedido do dono: *"temos que ser capazes
  // de editar o funil de vendas de acordo com a necessidade"*.
  //
  // Ela NÃO é "usar o funil" — mover lead continua na linha "Ver e mover leads
  // no kanban", que é do Comercial. Esta é a régua: quantos minutos um lead
  // pode ficar parado, quando ele troca de dono e quais motivos de perda
  // existem. Muda o dia a dia da equipe inteira e responde por metas, então é
  // de quem responde pela operação — Admin e Gestor. O Comercial LÊ a
  // configuração (o kanban precisa das etapas para desenhar as colunas), mas
  // não a altera: quem é cobrado pelo prazo não deveria ser quem o define.
  linha(
    "Configurar o funil de vendas",
    ["faz", "faz", "nao_ve", "nao_ve", "nao_ve"],
    "A régua vale para a equipe — quem é cobrado pelo prazo não o define",
  ),
  linha(
    "Gerenciar campanhas de mídia paga",
    ["faz", "nao_ve", "faz", "nao_ve", "nao_ve"],
    "Financeiro vê o total investido",
  ),
  linha(
    "Convidar usuário e trocar perfil",
    ["faz", "nao_ve", "nao_ve", "nao_ve", "nao_ve"],
    "Somente Admin",
  ),
  // Linhas do Motors Ciclo, acrescentadas em 2026-08-14 (Pacote 2). O A17 é de
  // antes do programa existir; quem fecha venda e quem verifica revisão foi
  // decidido pelo dono em 2026-08-13 — ver EMENDA_01_MANUAL_CICLO.md, E7.
  linha(
    "Fechar venda do Ciclo",
    ["faz", "nao_ve", "nao_ve", "faz", "nao_ve"],
    "Registro do par cliente-veículo — sem ele não há programa",
  ),
  linha(
    "Verificar revisão do diário de bordo",
    ["faz", "nao_ve", "nao_ve", "faz", "nao_ve"],
    "O Comercial é dono da fila; o Admin revisa recusa",
  ),
  linha(
    "Acompanhar a conformidade do Ciclo",
    ["faz", "faz", "nao_ve", "faz", "nao_ve"],
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
  // `chassi` existe no banco desde o feed (20260817140000) e nunca teve campo
  // de tela: o RevendaMais o traz sozinho. Ganhou um no cadastro nativo
  // (2026-08-29), porque o carro que não vem do feed não tem quem o traga — e
  // sem chassi não há NF-e, RENAVE nem fechamento de venda do Ciclo. Mesma
  // linha da placa, pelo mesmo motivo do dono em 2026-08-08: preencher
  // documento é trabalho de operação, e o dado nunca aparece no site.
  chassi: "Preencher documentação do veículo (placa, renavam)",
  // O renavam que dá nome à linha finalmente ganhou coluna: migração
  // 20260829170000, junto com a guarda de duplicidade que o dono pediu
  // (placa, renavam e chassi — as três chaves do mesmo carro).
  renavam: "Preencher documentação do veículo (placa, renavam)",
  motor: "Preencher documentação do veículo (placa, renavam)",
  cor_interna: "Preencher documentação do veículo (placa, renavam)",
  donos_anteriores: "Preencher documentação do veículo (placa, renavam)",
  garantia_fabrica: "Preencher documentação do veículo (placa, renavam)",
  preco_compra: "Ver custo de aquisição e margem",
  // Preço de anúncio: só existe como campo gravável no veículo NATIVO
  // (migração 20260829130000) — no do RevendaMais o sync o reescreveria, e por
  // isso `extrairCamposNossos` nem o deixa passar. Vai na linha "acima de 5%",
  // a mais restritiva das duas de preço: Admin, Gestor e Financeiro fazem;
  // o Comercial está em `revisao` e, enquanto o fluxo de revisão (A16) não
  // existe, `campoNegadoAoPerfil` o trata como negado. É errar para baixo,
  // como o cabeçalho deste arquivo manda.
  preco: "Alterar preço acima de 5%",
  preco_original: "Alterar preço acima de 5%",
  vendido: "Publicar ou despublicar veículo",
  // A linha da matriz que dá nome ao ato, finalmente com o campo que o executa
  // (migração 20260830120000). Até 2026-08-30 "publicar" era uma consequência —
  // o carro entrava no feed e aparecia — e a única coisa desta linha que existia
  // como campo era `vendido`. Agora é decisão explícita: Admin e Comercial
  // FAZEM, Marketing está em `revisao` e, enquanto o fluxo de revisão (A16) não
  // existir, `campoNegadoAoPerfil` o trata como negado; Gestor e Financeiro não
  // veem. Arquivar é a mesma linha — despublicar é o que ela sempre disse.
  estado_cadastro: "Publicar ou despublicar veículo",
  // As três colunas de foto, na linha que o A17 já tinha para elas —
  // "Marketing é o dono natural", diz a observação, e Marketing entra como
  // `faz`. Gestor e Financeiro ficam de fora: nenhum dos dois abre o editor
  // para trabalhar imagem.
  //
  // São graváveis só no veículo nativo (`camposGravaveis` em
  // `lib/estoqueEscrita.ts`): no carro do RevendaMais o sync as reescreve a
  // cada 6 h. A régua de PAPEL e a régua de ORIGEM são independentes, e as
  // duas precisam passar.
  whatsapp_images: "Adicionar e reordenar fotos",
  web_full_images: "Adicionar e reordenar fotos",
  url_imagem: "Adicionar e reordenar fotos",
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
  // Migração 20260826150000. Mesma ação da carroceria, e pelo mesmo motivo:
  // os três dizem O QUE o veículo é, e é a mesma pessoa que corrige quando o
  // feed erra. A diferença é o alcance — estes dois mudam a URL da ficha e o
  // hub de modelo, e por isso o editor avisa na tela antes de deixar salvar.
  modelo_override: "Editar opcionais e destaques rápidos",
  versao_override: "Editar opcionais e destaques rápidos",
  // Mesma ação de `perfil_uso`, que ele substitui: quem classifica carroceria
  // classifica para que o carro serve.
  perfis_uso: "Editar opcionais e destaques rápidos",
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
