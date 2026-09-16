/**
 * A agenda de pessoas — as regras puras.
 *
 * 2026-08-24, pedido do dono: *"precisamos ter uma aba clientes, hoje temos os
 * cadastros auxiliares, mas não tá legal, o revenda tem uma área de clientes
 * sejam internos ou externos, fornecedores... pra organizar tudo e termos como
 * gerenciar"*.
 *
 * O banco responde a metade disso: a view `agenda_de_pessoas` (migração
 * 20260824190000) une os quatro cadastros — `parceiros`, `clientes`,
 * `parceiros_ciclo` e `investidores` — num formato só, respeitando a RLS de
 * cada um. O que sobra é o que não cabe em SQL e não deve morar numa tela:
 *
 *  1. **para onde vai a edição.** A agenda é uma vitrine sobre quatro
 *     tabelas; um PATCH precisa saber em qual delas escrever, e QUE campo de
 *     lá corresponde ao campo genérico da vitrine (o telefone do cliente do
 *     Ciclo se chama `telefone_e164`, o documento dele se chama `cpf_cnpj`).
 *  2. **o que NÃO se edita de passagem.** Nem todo campo visível é editável:
 *     `cpf_cnpj` é a identidade de quem tem contrato de 36 meses e não se
 *     corrige numa lista de contatos.
 *  3. **quem é a mesma pessoa duas vezes.** Foi o que motivou o pedido: o
 *     mesmo CNPJ cadastrado como fornecedor no financeiro e como oficina na
 *     rede, com duas grafias. Achar isso é aritmética, não consulta.
 *
 * Tudo aqui é função pura: entra dado, sai dado. Nenhuma chamada de rede,
 * nenhum acesso a `supabase` — é o que permite testar a regra sem banco.
 */

/** De qual cadastro a linha veio. É a chave de tudo neste arquivo. */
export type OrigemDaAgenda = "financeiro" | "ciclo" | "rede" | "investidores" | "lead";

/** O que a pessoa é para a loja. `ambos` é do `parceiros.tipo` e vale por dois. */
export type PapelNaAgenda =
  | "cliente"
  | "fornecedor"
  | "ambos"
  | "prestador"
  | "investidor"
  /**
   * Quem pediu contato e ainda não comprou (2026-08-28, pedido do dono: *"todo
   * lead precisa ir para a aba de clientes e fornecedores também, para melhorar
   * gestão"*).
   *
   * Papel próprio, e não `cliente`: o lead não comprou nada, não tem CPF nem
   * consentimento de LGPD, e chamá-lo de cliente misturaria na mesma lista quem
   * tem contrato de 36 meses e quem mandou uma mensagem ontem. O que ele tem em
   * comum com os outros é ser gente com quem a loja se relaciona — que é
   * exatamente a pergunta que esta agenda responde.
   */
  | "lead";

/** Uma linha da view, do jeito que a API devolve. */
export interface PessoaDaAgenda {
  origem: OrigemDaAgenda;
  id: string;
  nome: string;
  papel: PapelNaAgenda;
  /** O que o prestador faz (oficina, seguradora…). Nulo nas outras origens. */
  especialidade?: string | null;
  documento?: string | null;
  telefone?: string | null;
  email?: string | null;
  cidade?: string | null;
  observacoes?: string | null;
  ativo: boolean;
  created_at?: string | null;
}

// ---------------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------------

export const ROTULO_DO_PAPEL: Record<PapelNaAgenda, string> = {
  cliente: "Cliente",
  fornecedor: "Fornecedor",
  ambos: "Cliente e fornecedor",
  prestador: "Prestador",
  investidor: "Investidor",
  lead: "Lead",
};

/**
 * De onde a linha vem e onde ela é realmente gerenciada.
 *
 * `casa` é a resposta honesta para "e o resto dos campos?": a agenda edita o
 * contato, mas quem cria um cliente é o fechamento de venda, e quem mexe em
 * aporte é a tela de investidores. Dizer isso na interface é melhor que
 * oferecer um campo que não faz o que parece.
 */
export const ORIGENS: Record<
  OrigemDaAgenda,
  { rotulo: string; tabela: string; casa: string | null }
> = {
  financeiro: {
    rotulo: "Financeiro",
    tabela: "parceiros",
    // Nasce e morre aqui: esta é a tela dele.
    casa: null,
  },
  ciclo: {
    rotulo: "Comprou na loja",
    tabela: "clientes",
    casa: "/admin/ciclo/vendas/nova",
  },
  rede: {
    rotulo: "Rede de serviço",
    tabela: "parceiros_ciclo",
    casa: null,
  },
  investidores: {
    rotulo: "Investidor",
    tabela: "investidores",
    casa: "/admin/investidores",
  },
  lead: {
    rotulo: "Lead do site",
    tabela: "leads",
    // A casa do lead é o kanban. A agenda mostra que ele existe e em que pé
    // está a conversa; mover de etapa, anotar e fechar o negócio acontece lá,
    // onde o motivo do desfecho é pedido e o rastro é escrito. Editar contato
    // de lead de passagem aqui criaria um segundo caminho para o mesmo dado.
    casa: "/admin/leads",
  },
};

// ---------------------------------------------------------------------------
// Filtro por papel
// ---------------------------------------------------------------------------

/**
 * Quais valores de `papel` atendem a um filtro.
 *
 * A sutileza mora no `ambos`: quem filtra por "fornecedor" quer ver também o
 * parceiro marcado como cliente E fornecedor. Deixar `ambos` de fora seria
 * esconder exatamente o parceiro mais usado da lista — o modo de falha que
 * este módulo vem colecionando: ausência sem erro.
 */
export function papeisQueContam(filtro: string): PapelNaAgenda[] {
  if (filtro === "cliente") return ["cliente", "ambos"];
  if (filtro === "fornecedor") return ["fornecedor", "ambos"];
  if (filtro === "prestador") return ["prestador"];
  if (filtro === "investidor") return ["investidor"];
  if (filtro === "lead") return ["lead"];
  if (filtro === "ambos") return ["ambos"];
  return [];
}

// ---------------------------------------------------------------------------
// Busca
// ---------------------------------------------------------------------------

/**
 * Limpa o termo digitado para caber num filtro `or=(...)` do PostgREST.
 *
 * A gramática do PostgREST separa os ramos de um `or` por VÍRGULA e delimita o
 * grupo por PARÊNTESES. Um termo com vírgula — *"Silva, João"*, que é
 * exatamente como um nome é digitado — não dá erro: ele parte o filtro ao
 * meio, e o servidor obedece a um filtro que ninguém escreveu. Aspas duplas
 * fazem o mesmo com os valores citados.
 *
 * Por isso estes quatro caracteres saem. O ponto e o traço FICAM: são o que
 * se digita num CNPJ (`12.345.678/0001-90`), e o parser do PostgREST só usa
 * os dois primeiros pontos de cada ramo (coluna.operador.valor) — o resto é
 * valor.
 *
 * Devolve `null` quando não sobra nada que valha uma consulta: termo vazio
 * vira "traga tudo", nunca "traga nada".
 */
export function termoDeBusca(bruto?: string | null): string | null {
  const limpo = (bruto ?? "")
    .replace(/[,()"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return limpo.length > 0 ? limpo : null;
}

/** As colunas que a busca varre, na ordem em que fazem sentido para quem procura. */
export const COLUNAS_DE_BUSCA = ["nome", "documento", "email", "telefone"] as const;

/** O filtro `or` do PostgREST para um termo já limpo por `termoDeBusca`. */
export function filtroDeBusca(termo: string): string {
  return COLUNAS_DE_BUSCA.map((c) => `${c}.ilike.*${termo}*`).join(",");
}

// ---------------------------------------------------------------------------
// Roteamento da edição
// ---------------------------------------------------------------------------

/**
 * Que campo genérico da agenda corresponde a que coluna de cada tabela.
 *
 * Campo ausente do mapa = campo NÃO editável por esta tela, e a ausência é
 * deliberada em cada caso:
 *
 *  - `clientes.cpf_cnpj` é UNIQUE e é a identidade de quem tem contrato. Uma
 *    correção de CPF é um evento, não uma edição de contato — passa pelo
 *    Ciclo, com quem sabe o que está corrigindo.
 *  - `clientes` não tem `ativo`: cliente não se desativa, ele tem ou não tem
 *    carro no programa. Inventar a coluna aqui seria inventar um estado.
 *  - `investidores` não recebe `cidade` porque a tabela não tem a coluna, e
 *    aporte/retirada não estão aqui de propósito (ver ORIGENS.casa).
 *  - `parceiros_ciclo.comissao_pct` fica fora: comissão é cláusula comercial,
 *    não dado cadastral.
 */
export const CAMPOS_EDITAVEIS: Record<
  OrigemDaAgenda,
  Partial<Record<keyof PessoaDaAgenda | "tipo", string>>
> = {
  financeiro: {
    nome: "nome",
    // Na tabela o papel se chama `tipo`; na agenda, `papel`. É a única origem
    // em que ele é editável, porque é a única em que ele é uma escolha.
    papel: "tipo",
    documento: "documento",
    telefone: "telefone",
    email: "email",
    cidade: "cidade",
    observacoes: "observacoes",
    ativo: "ativo",
  },
  ciclo: {
    nome: "nome",
    telefone: "telefone_e164",
    email: "email",
  },
  rede: {
    nome: "nome",
    cidade: "cidade",
    ativo: "ativo",
  },
  investidores: {
    nome: "nome",
    documento: "documento",
    telefone: "telefone",
    email: "email",
    observacoes: "observacoes",
    ativo: "ativo",
  },
  // O lead não se edita daqui. Mapa vazio é uma decisão, não um esquecimento:
  // `rotearEdicao` recusa qualquer campo que não esteja na lista, e a tela lê
  // o mesmo mapa para não oferecer um formulário que a rota vai negar.
  //
  // A razão é o relógio. Toda gravação em `leads` passa pelo gatilho que
  // reinicia a estagnação e escreve no rastro — corrigir um telefone numa
  // lista de contatos apagaria a cobrança de um lead que ninguém atendeu, e o
  // rastro registraria "atendimento" onde houve digitação. O kanban é onde
  // isso tem significado.
  lead: {},
};

export interface EdicaoRoteada {
  tabela: string;
  valores: Record<string, unknown>;
}

/**
 * Traduz um patch da agenda para um UPDATE numa tabela concreta.
 *
 * Lança se a origem for desconhecida, se nenhum campo aceito sobrar, ou se o
 * chamador tentar escrever num campo fora da lista. **Recusar é o ponto**: a
 * alternativa cômoda — ignorar em silêncio o campo não permitido — devolveria
 * 200 para uma edição que não aconteceu, que é o defeito que este módulo já
 * teve três vezes (o DELETE recusado pela RLS que respondia sucesso, o
 * rollback que era no-op, a lista que mostrava uma fatia como se fosse tudo).
 */
export function rotearEdicao(
  origem: string,
  patch: Record<string, unknown>,
): EdicaoRoteada {
  const mapa = CAMPOS_EDITAVEIS[origem as OrigemDaAgenda];
  if (!mapa) {
    throw new Error(`Origem desconhecida: "${origem}"`);
  }

  const valores: Record<string, unknown> = {};
  const recusados: string[] = [];

  for (const [campo, valor] of Object.entries(patch)) {
    // `origem` e `id` viajam no corpo para endereçar a linha, não para gravar.
    if (campo === "origem" || campo === "id") continue;
    const coluna = mapa[campo as keyof typeof mapa];
    if (!coluna) {
      recusados.push(campo);
      continue;
    }
    valores[coluna] = valor;
  }

  if (recusados.length > 0) {
    throw new Error(
      `Campo não editável em "${ORIGENS[origem as OrigemDaAgenda].rotulo}": ` +
        `${recusados.join(", ")}`,
    );
  }
  if (Object.keys(valores).length === 0) {
    throw new Error("Nenhum campo para atualizar");
  }

  return { tabela: ORIGENS[origem as OrigemDaAgenda].tabela, valores };
}

// ---------------------------------------------------------------------------
// Duplicatas prováveis
// ---------------------------------------------------------------------------

/** Só os dígitos. CPF/CNPJ é o mesmo número com ou sem ponto e traço. */
export function normalizarDocumento(doc?: string | null): string {
  return (doc ?? "").replace(/\D/g, "");
}

/** Minúsculas, sem acento, sem espaço dobrado — para comparar nome digitado. */
export function normalizarNome(nome?: string | null): string {
  return (nome ?? "")
    .normalize("NFD")
    // A faixa de marcas combinantes (U+0300–U+036F) escrita por escapes, e
    // não pelos caracteres em si: acento solto no meio de uma regex é a
    // primeira coisa que um editor distraído normaliza.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface GrupoDuplicado {
  /** O que uniu as linhas. Documento é prova; nome é suspeita. */
  motivo: "documento" | "nome";
  chave: string;
  pessoas: PessoaDaAgenda[];
}

/**
 * Acha quem provavelmente está cadastrado duas vezes.
 *
 * Duas réguas, de forças diferentes, e a diferença importa na tela:
 *
 *  - **documento igual** é prova. CNPJ não coincide por acaso.
 *  - **nome igual** é suspeita. Existem dois "João da Silva", e a loja de
 *    Curitiba pode ter dois "Auto Center Centro" de donos diferentes.
 *
 * Por isso o motivo viaja junto: a tela pode oferecer "unificar" para um e
 * apenas "olhe isto" para o outro. Um alerta que erra vira alerta ignorado.
 *
 * Documento com menos de 3 dígitos é descartado — é lixo de digitação, e
 * agrupar por ele juntaria estranhos com a autoridade de uma prova.
 */
export function acharDuplicatas(pessoas: PessoaDaAgenda[]): GrupoDuplicado[] {
  const porDocumento = new Map<string, PessoaDaAgenda[]>();
  for (const p of pessoas) {
    const doc = normalizarDocumento(p.documento);
    if (doc.length < 3) continue;
    porDocumento.set(doc, [...(porDocumento.get(doc) ?? []), p]);
  }

  const grupos: GrupoDuplicado[] = [];
  const jaAgrupados = new Set<string>();

  for (const [doc, lista] of porDocumento) {
    if (lista.length < 2) continue;
    grupos.push({ motivo: "documento", chave: doc, pessoas: lista });
    for (const p of lista) jaAgrupados.add(chaveDaPessoa(p));
  }

  const porNome = new Map<string, PessoaDaAgenda[]>();
  for (const p of pessoas) {
    // Quem já foi pego pela prova não volta como suspeita: repetir a mesma
    // dupla em dois avisos faz o segundo aviso parecer um caso novo.
    if (jaAgrupados.has(chaveDaPessoa(p))) continue;
    const nome = normalizarNome(p.nome);
    if (!nome) continue;
    porNome.set(nome, [...(porNome.get(nome) ?? []), p]);
  }

  for (const [nome, lista] of porNome) {
    if (lista.length < 2) continue;
    grupos.push({ motivo: "nome", chave: nome, pessoas: lista });
  }

  // Ordem estável: prova antes de suspeita, e alfabética dentro de cada uma.
  // Sem isto a mesma base renderiza em ordem diferente a cada leitura.
  return grupos.sort((a, b) => {
    if (a.motivo !== b.motivo) return a.motivo === "documento" ? -1 : 1;
    return a.chave.localeCompare(b.chave);
  });
}

/**
 * Identidade de uma linha da agenda.
 *
 * `id` sozinho não serve como chave de React: são quatro tabelas, e ainda que
 * uuid não colida na prática, a chave composta é a que diz a verdade sobre o
 * que a linha é.
 */
export function chaveDaPessoa(p: Pick<PessoaDaAgenda, "origem" | "id">): string {
  return `${p.origem}:${p.id}`;
}

/** Quantos de cada papel — o número que a tela mostra em cima de cada filtro. */
export function contarPorPapel(
  pessoas: PessoaDaAgenda[],
): Record<string, number> {
  const conta: Record<string, number> = {};
  for (const p of pessoas) {
    conta[p.papel] = (conta[p.papel] ?? 0) + 1;
    // `ambos` soma nos dois lados: é o que a pessoa É, e é como o filtro
    // `papeisQueContam` a trata. Contador que discorda do filtro faz duvidar
    // dos dois.
    if (p.papel === "ambos") {
      conta.cliente = (conta.cliente ?? 0) + 1;
      conta.fornecedor = (conta.fornecedor ?? 0) + 1;
    }
  }
  return conta;
}
