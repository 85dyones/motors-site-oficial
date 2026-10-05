/**
 * Os veículos de interesse do lead (pedido do dono, 05/10/2026): vários carros
 * por lead, cada um resolvido no fim do atendimento (um escolhido, os outros
 * descartados com motivo), e o relatório por veículo que sai disso.
 *
 * Puro, sem I/O: serve servidor e cliente. O banco é a migração
 * `20261005120000_veiculos_de_interesse.sql` (tabela `leads_veiculos`, funções
 * `resumo_de_interesse_do_veiculo` e `interesse_por_veiculo`); o contrato das
 * rotas está em `docs/GESTAO_DO_LEAD.md`, seção "Veículos de interesse".
 *
 * As regras daqui repetem as CONSTRAINTS da tabela, com o mesmo nome no
 * comentário de cada uma: a rota recusa com a frase certa antes de o banco
 * recusar com a dele. Mudou lá, muda aqui
 * (`tests/migracao-dos-veiculos-de-interesse.test.ts` lê os motivos deste
 * arquivo e compara com o CHECK e com o comentário da coluna).
 */
import { grafiaDoModelo } from "./grafiaCanonica";

// ---------------------------------------------------------------------------
// Os motivos e as situações
// ---------------------------------------------------------------------------

/** As chaves de `leads_veiculos_motivo_valido`, na ordem em que o dono as listou. */
export const MOTIVOS_DE_DESCARTE = [
  "preco",
  "parcela",
  "km",
  "ano_versao",
  "cor",
  "estado",
  "opcionais",
  "troca",
  "outro_da_loja",
  "comprou_fora",
  "desistiu",
  "vendido",
  "outro",
] as const;
export type MotivoDeDescarte = (typeof MOTIVOS_DE_DESCARTE)[number];

/** O rótulo de cada motivo: o mesmo texto do comentário da coluna no banco. */
export const ROTULO_DO_MOTIVO_DE_DESCARTE: Record<MotivoDeDescarte, string> = {
  preco: "Preço acima do que queria",
  parcela: "Parcela ou financiamento não fechou",
  km: "Quilometragem",
  ano_versao: "Ano ou versão",
  cor: "Cor",
  estado: "Estado de conservação",
  opcionais: "Faltou opcional",
  troca: "Avaliação da troca não fechou",
  outro_da_loja: "Preferiu outro carro da loja",
  comprou_fora: "Comprou em outro lugar",
  desistiu: "Desistiu da compra",
  vendido: "O carro foi vendido antes",
  outro: "Outro",
};

/** `leads_veiculos_outro_pede_nota`: este motivo só vale com a nota escrita. */
export const MOTIVO_QUE_PEDE_NOTA: MotivoDeDescarte = "outro";

export const SITUACOES_DA_OPCAO = ["em_avaliacao", "escolhido", "descartado"] as const;
export type SituacaoDaOpcao = (typeof SITUACOES_DA_OPCAO)[number];

export const ROTULO_DA_SITUACAO_DA_OPCAO: Record<SituacaoDaOpcao, string> = {
  em_avaliacao: "Em avaliação",
  escolhido: "Escolhido",
  descartado: "Descartado",
};

/** `leads_veiculos_nota_cabe`: o tamanho que a coluna aceita. */
export const LIMITE_DA_NOTA = 2000;

/** Quantas opções um lote resolve de uma vez. Limite do pedido, não do negócio. */
export const LIMITE_DO_LOTE = 50;

export function ehMotivoDeDescarte(valor: unknown): valor is MotivoDeDescarte {
  return typeof valor === "string" && (MOTIVOS_DE_DESCARTE as readonly string[]).includes(valor);
}

export function ehSituacaoDaOpcao(valor: unknown): valor is SituacaoDaOpcao {
  return typeof valor === "string" && (SITUACOES_DA_OPCAO as readonly string[]).includes(valor);
}

/**
 * O rótulo de um motivo, ou `null` para o que não é motivo. Chave que o painel
 * ainda não conhece (um motivo novo no banco) sai como veio: melhor a chave
 * crua no relatório do que o descarte sumir dele.
 */
export function rotuloDoMotivo(chave: string | null | undefined): string | null {
  if (typeof chave !== "string" || chave.trim() === "") return null;
  return ehMotivoDeDescarte(chave) ? ROTULO_DO_MOTIVO_DE_DESCARTE[chave] : chave;
}

/**
 * O retrato do carro (`veiculo_rotulo`) na grafia da tela.
 *
 * O banco guarda o nome na caixa do estoque ("fiat uno mille fire economy
 * 2013"); quem capitaliza é o painel. A régua é a do modelo na vitrine
 * (`grafiaDoModelo`): "HB20", "BMW", "1.0", "T-Cross", e não "Hb20".
 */
export function rotuloDoVeiculoNaTela(rotulo: string | null | undefined): string {
  return grafiaDoModelo(rotulo);
}

// ---------------------------------------------------------------------------
// A estrutura que ainda não existe
// ---------------------------------------------------------------------------

/** O `codigo` com que as rotas de escrita respondem 503 antes da migração. */
export const CODIGO_DE_VEICULOS_INDISPONIVEL = "veiculos_indisponivel";

export const AVISO_DE_VEICULOS_INDISPONIVEL =
  "A lista de veículos de interesse ainda não está ativa. Por enquanto, o lead segue com um carro só.";

/**
 * A tabela `leads_veiculos` ou uma das duas funções ainda não existe?
 *
 * O código vai ao ar ANTES da migração `20261005120000`. Até ela ser aplicada:
 *
 *   PGRST205 .. o PostgREST não acha a TABELA no cache de schema
 *   PGRST202 .. o PostgREST não acha a FUNÇÃO no cache de schema
 *   42P01 ..... o Postgres não acha a relação (a consulta chegou a rodar)
 *   42883 ..... o Postgres não acha a função
 *
 * Sem código (um proxy que só repassa o texto), vale a frase do PostgREST.
 * Coluna ausente (`42703`) e permissão negada (`42501`) NÃO entram: são
 * defeito, e têm de aparecer como erro.
 */
export function ehVeiculosIndisponivel(erro: unknown): boolean {
  if (!erro || typeof erro !== "object") return false;
  const { code, message } = erro as { code?: unknown; message?: unknown };
  if (code === "PGRST205" || code === "PGRST202" || code === "42P01" || code === "42883") return true;
  if (typeof code === "string" && code !== "") return false;
  return typeof message === "string" && /could not find the (table|function) .* in the schema cache/i.test(message);
}

// ---------------------------------------------------------------------------
// O erro do banco, na frase da tela
// ---------------------------------------------------------------------------

export type CodigoDeVeiculos =
  | typeof CODIGO_DE_VEICULOS_INDISPONIVEL
  | "veiculo_repetido"
  | "ja_ha_escolhido"
  | "veiculo_desconhecido"
  | "lead_nao_encontrado"
  | "situacao_invalida"
  | "motivo_invalido"
  | "motivo_de_descarte_obrigatorio"
  | "motivo_so_no_descarte"
  | "nota_obrigatoria"
  | "nota_longa"
  | "par_imutavel"
  | "regra_do_banco"
  | "sem_permissao"
  | "erro_do_banco";

export interface ErroDeVeiculosNaTela {
  status: number;
  codigo: CodigoDeVeiculos;
  erro: string;
}

/** Cada constraint de `leads_veiculos`, pelo nome, e o que a tela diz. */
const POR_CONSTRAINT: Record<string, ErroDeVeiculosNaTela> = {
  leads_veiculos_lead_veiculo_unico: {
    status: 409,
    codigo: "veiculo_repetido",
    erro: "Este carro já está entre as opções do lead.",
  },
  leads_veiculos_um_escolhido_por_lead: {
    status: 409,
    codigo: "ja_ha_escolhido",
    erro: "O lead já tem um carro escolhido. Reabra o escolhido antes de escolher outro.",
  },
  leads_veiculos_veiculo_no_estoque: {
    status: 422,
    codigo: "veiculo_desconhecido",
    erro: "Este carro não está no estoque.",
  },
  leads_veiculos_lead_id_fkey: { status: 404, codigo: "lead_nao_encontrado", erro: "Lead não encontrado" },
  leads_veiculos_situacao_valida: {
    status: 400,
    codigo: "situacao_invalida",
    erro: `Situação inválida. Use ${SITUACOES_DA_OPCAO.join(", ")}.`,
  },
  leads_veiculos_motivo_valido: { status: 400, codigo: "motivo_invalido", erro: "Motivo de descarte desconhecido." },
  leads_veiculos_motivo_so_no_descarte: {
    status: 400,
    codigo: "motivo_de_descarte_obrigatorio",
    erro: "Descartar um carro pede o motivo, e o motivo só existe no descarte.",
  },
  leads_veiculos_outro_pede_nota: {
    status: 400,
    codigo: "nota_obrigatoria",
    erro: 'O motivo "Outro" pede uma nota dizendo qual foi.',
  },
  leads_veiculos_nota_cabe: {
    status: 400,
    codigo: "nota_longa",
    erro: `A nota passa de ${LIMITE_DA_NOTA} caracteres.`,
  },
  leads_veiculos_par_imutavel: {
    status: 400,
    codigo: "par_imutavel",
    erro: "A opção não troca de lead nem de carro: adicione o outro carro e descarte este.",
  },
};

/**
 * O erro de uma leitura ou gravação em `leads_veiculos` → status, código e
 * frase. As rotas validam antes; o que chega aqui é o que só o banco sabe (a
 * corrida entre dois cliques, o carro que saiu do estoque, a migração que
 * ainda não foi aplicada).
 *
 * O nome da constraint vem no TEXTO do erro do Postgres para CHECK, UNIQUE e
 * FK. As duas regras do gatilho (`…_veiculo_no_estoque`, `…_par_imutavel`)
 * trazem frase própria e o nome só no campo `constraint`, que o PostgREST não
 * repassa: essas são reconhecidas pelo SQLSTATE.
 */
export function erroDeVeiculosNaTela(erro: unknown): ErroDeVeiculosNaTela {
  if (ehVeiculosIndisponivel(erro)) {
    return { status: 503, codigo: CODIGO_DE_VEICULOS_INDISPONIVEL, erro: AVISO_DE_VEICULOS_INDISPONIVEL };
  }
  const e = (erro ?? {}) as { code?: unknown; message?: unknown; details?: unknown; constraint?: unknown };
  const codigo = typeof e.code === "string" ? e.code : "";
  const texto = [e.constraint, e.message, e.details].filter((t): t is string => typeof t === "string").join(" ");

  const achada = Object.keys(POR_CONSTRAINT).find((nome) => texto.includes(nome));
  if (achada) return POR_CONSTRAINT[achada];

  if (codigo === "23503") return POR_CONSTRAINT.leads_veiculos_veiculo_no_estoque;
  if (codigo === "23505") return POR_CONSTRAINT.leads_veiculos_lead_veiculo_unico;
  if (codigo === "23514") {
    return {
      status: 400,
      codigo: "regra_do_banco",
      erro: typeof e.message === "string" && e.message.trim() ? e.message : "O banco recusou a gravação.",
    };
  }
  if (codigo === "42501") {
    return { status: 403, codigo: "sem_permissao", erro: "Seu perfil não pode fazer isto neste lead." };
  }
  return {
    status: 500,
    codigo: "erro_do_banco",
    erro: typeof e.message === "string" && e.message.trim() ? e.message : "Erro ao gravar os veículos do lead.",
  };
}

// ---------------------------------------------------------------------------
// Validação: adicionar e resolver
// ---------------------------------------------------------------------------

export type CodigoDaResolucao =
  | "corpo_invalido"
  | "campo_desconhecido"
  | "sem_campos"
  | "veiculo_invalido"
  | "situacao_invalida"
  | "motivo_de_descarte_obrigatorio"
  | "motivo_invalido"
  | "motivo_so_no_descarte"
  | "nota_invalida"
  | "nota_longa"
  | "nota_obrigatoria"
  | "principal_invalido"
  | "principal_descartado";

interface Recusa<C extends string = CodigoDaResolucao> {
  ok: false;
  status: 400 | 404 | 409;
  codigo: C;
  erro: string;
}

const recusar = <C extends string>(codigo: C, erro: string, status: 400 | 404 | 409 = 400): Recusa<C> => ({
  ok: false,
  status,
  codigo,
  erro,
});

const objeto = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const vazio = (v: unknown): boolean => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** O id de um carro do estoque: inteiro positivo, em número ou em texto. */
export function idDeVeiculo(valor: unknown): number | null {
  const n =
    typeof valor === "number"
      ? valor
      : typeof valor === "string" && /^\d+$/.test(valor.trim())
        ? Number(valor.trim())
        : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export type DecisaoDeInclusao = { ok: true; veiculo_id: number; principal: boolean } | Recusa;

/**
 * O corpo do `POST /api/leads/[id]/veiculos`: `{ veiculo_id, principal? }`.
 * Campo de fora é recusado, e não ignorado, como em `decidirDados`.
 */
export function decidirInclusao(corpo: unknown): DecisaoDeInclusao {
  const c = objeto(corpo);
  if (!c) return recusar("corpo_invalido", "Envie o carro a adicionar: { veiculo_id }.");
  const estranhos = Object.keys(c).filter((k) => k !== "veiculo_id" && k !== "principal");
  if (estranhos.length > 0) return recusar("campo_desconhecido", `Campo desconhecido: ${estranhos.join(", ")}.`);
  const id = idDeVeiculo(c.veiculo_id);
  if (id === null) return recusar("veiculo_invalido", "O veículo de interesse é o id de um carro do estoque.");
  if (c.principal !== undefined && typeof c.principal !== "boolean") {
    return recusar("principal_invalido", "`principal` é verdadeiro ou falso.");
  }
  return { ok: true, veiculo_id: id, principal: c.principal === true };
}

/** O que a decisão manda gravar na linha. Só as chaves presentes são gravadas. */
export interface CamposDaResolucao {
  situacao?: SituacaoDaOpcao;
  motivo_descarte?: MotivoDeDescarte | null;
  nota?: string | null;
}

export type DecisaoDeResolucao = { ok: true; campos: CamposDaResolucao; principal: boolean } | Recusa;

/** O que a opção É hoje, para decidir o que o pedido muda nela. */
export interface OpcaoAtual {
  situacao?: string | null;
  motivo_descarte?: string | null;
  nota?: string | null;
}

const CAMPOS_DA_RESOLUCAO = ["situacao", "motivo_descarte", "nota", "principal"];

/**
 * O corpo do PATCH de uma opção → o que gravar.
 *
 *   `{ situacao: "descartado", motivo_descarte, nota? }` .. descartar
 *   `{ situacao: "escolhido" }` ........................... escolher
 *   `{ situacao: "em_avaliacao" }` ........................ reabrir
 *   `{ nota }` ............................................ só anotar
 *   `{ principal: true }` ................................. tornar o principal
 *
 * As regras, e a constraint de cada uma:
 *   · descartar pede motivo da lista (`…_motivo_so_no_descarte`, `…_motivo_valido`);
 *   · motivo "outro" pede nota (`…_outro_pede_nota`): a do pedido ou, sem nota
 *     no pedido, a que a opção já tem;
 *   · escolher e reabrir LIMPAM o motivo. Motivo junto com situação que não é
 *     descarte é contradição do pedido, e é recusada em vez de consertada;
 *   · a nota sobrevive à reabertura e à escolha, a menos que o pedido a troque;
 *   · `principal` só aceita `true` (tira-se o principal tornando outro o
 *     principal), e carro descartado não é o principal.
 *
 * `atual` é a linha no banco. Sem ela (a função usada na tela, antes de ler),
 * a regra olha só o pedido.
 */
export function decidirResolucao(corpo: unknown, atual: OpcaoAtual = {}): DecisaoDeResolucao {
  const c = objeto(corpo);
  if (!c) return recusar("corpo_invalido", "Envie o que muda na opção: { situacao, motivo_descarte, nota }.");
  const pedidos = Object.keys(c).filter((k) => c[k] !== undefined);
  const estranhos = pedidos.filter((k) => !CAMPOS_DA_RESOLUCAO.includes(k));
  if (estranhos.length > 0) return recusar("campo_desconhecido", `Campo desconhecido: ${estranhos.join(", ")}.`);
  if (pedidos.length === 0) return recusar("sem_campos", "Nada para gravar nesta opção.");

  if (c.principal !== undefined && c.principal !== true) {
    return recusar(
      "principal_invalido",
      "`principal` só aceita true. Para trocar o carro principal, torne outro o principal.",
    );
  }
  const principal = c.principal === true;

  if (c.situacao !== undefined && !ehSituacaoDaOpcao(c.situacao)) {
    return recusar("situacao_invalida", `Situação inválida. Use ${SITUACOES_DA_OPCAO.join(", ")}.`);
  }
  const situacaoPedida = c.situacao as SituacaoDaOpcao | undefined;
  const situacao = situacaoPedida ?? (ehSituacaoDaOpcao(atual.situacao) ? atual.situacao : undefined);

  const campos: CamposDaResolucao = {};

  if (c.nota !== undefined) {
    if (!vazio(c.nota) && typeof c.nota !== "string") return recusar("nota_invalida", "A nota é um texto.");
    const nota = typeof c.nota === "string" ? c.nota.trim() : "";
    if (nota.length > LIMITE_DA_NOTA) return recusar("nota_longa", `A nota passa de ${LIMITE_DA_NOTA} caracteres.`);
    campos.nota = nota || null;
  }
  const notaFinal = campos.nota !== undefined ? campos.nota : typeof atual.nota === "string" ? atual.nota.trim() || null : null;

  const motivoVeio = c.motivo_descarte !== undefined;
  const motivoPedido = vazio(c.motivo_descarte) ? null : c.motivo_descarte;

  if (situacao === "descartado") {
    const motivo = motivoVeio ? motivoPedido : (atual.motivo_descarte ?? null);
    if (motivo === null) {
      return recusar("motivo_de_descarte_obrigatorio", "Para descartar um carro, escolha o motivo: é ele que o relatório do veículo conta.");
    }
    if (!ehMotivoDeDescarte(motivo)) {
      return recusar("motivo_invalido", `Motivo de descarte desconhecido. Use ${MOTIVOS_DE_DESCARTE.join(", ")}.`);
    }
    if (motivo === MOTIVO_QUE_PEDE_NOTA && !notaFinal) {
      return recusar("nota_obrigatoria", 'O motivo "Outro" pede uma nota dizendo qual foi.');
    }
    if (situacaoPedida) campos.situacao = "descartado";
    if (motivoVeio || situacaoPedida) campos.motivo_descarte = motivo;
  } else {
    if (motivoPedido !== null) {
      return recusar(
        "motivo_so_no_descarte",
        "O motivo só existe no descarte. Para escolher ou reabrir o carro, não envie motivo.",
      );
    }
    if (situacaoPedida) {
      campos.situacao = situacaoPedida;
      // Escolher e reabrir limpam o motivo (`…_motivo_so_no_descarte`).
      campos.motivo_descarte = null;
    } else if (motivoVeio && situacao !== undefined) {
      campos.motivo_descarte = null;
    }
  }

  if (principal && situacao === "descartado") {
    return recusar("principal_descartado", "Carro descartado não é o principal. Reabra a opção antes.");
  }
  if (Object.keys(campos).length === 0 && !principal) return recusar("sem_campos", "Nada para gravar nesta opção.");
  return { ok: true, campos, principal };
}

// ---------------------------------------------------------------------------
// O plano: o que gravar, em que ordem, e quem fica sendo o principal
// ---------------------------------------------------------------------------

/** A linha de `leads_veiculos`, como a rota a lê. */
export interface LinhaDaOpcao {
  id: string;
  lead_id?: string;
  veiculo_id: number | string;
  veiculo_rotulo: string | null;
  veiculo_preco: number | string | null;
  situacao: string;
  motivo_descarte: string | null;
  nota: string | null;
  adicionado_por: string | null;
  resolvido_por: string | null;
  criado_em: string;
  resolvido_em: string | null;
}

export interface PedidoDeResolucao {
  opcao: string;
  campos: CamposDaResolucao;
  principal?: boolean;
}

export interface PassoDoPlano {
  opcao: string;
  campos: CamposDaResolucao;
  /** A rota não pediu este passo: é a reabertura do escolhido anterior. */
  implicito: boolean;
}

export type CodigoDoPlano = "opcao_nao_encontrada" | "varios_escolhidos" | "principal_ja_escolhido" | "opcao_repetida";

export type PlanoDeResolucao =
  | {
      ok: true;
      passos: PassoDoPlano[];
      /** O novo `leads.veiculo_id`, ou `undefined` quando o principal não muda. */
      principal: number | null | undefined;
    }
  | (Recusa<CodigoDoPlano> & { opcao?: string });

const mesmoCarro = (a: unknown, b: unknown): boolean =>
  a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

const maisAntigaPrimeiro = (a: LinhaDaOpcao, b: LinhaDaOpcao): number =>
  a.criado_em < b.criado_em ? -1 : a.criado_em > b.criado_em ? 1 : a.id < b.id ? -1 : 1;

/**
 * O carro que fica sendo o principal quando o de hoje deixa de servir: o
 * escolhido, senão a opção em avaliação mais antiga, senão `null` (não há
 * para onde ir).
 */
export function sucessorDoPrincipal(opcoes: readonly LinhaDaOpcao[]): number | null {
  const escolhido = opcoes.find((o) => o.situacao === "escolhido");
  const proximo = escolhido ?? [...opcoes].filter((o) => o.situacao === "em_avaliacao").sort(maisAntigaPrimeiro)[0];
  return proximo ? Number(proximo.veiculo_id) : null;
}

/**
 * Uma ou várias resoluções → os passos, na ordem que o banco aceita, e o
 * veículo principal que resulta.
 *
 * `leads.veiculo_id` é o veículo PRINCIPAL e nenhum gatilho o reescreve
 * (cabeçalho da migração): quem o mantém é esta função, pelas rotas.
 *
 *   · escolher um carro o torna o principal;
 *   · escolher um carro com OUTRO já escolhido reabre o anterior antes
 *     (passo `implicito`): o índice único parcial
 *     `leads_veiculos_um_escolhido_por_lead` recusaria os dois de uma vez, e
 *     por isso quem deixa de ser o escolhido é gravado primeiro e o escolhido
 *     novo por último;
 *   · descartar o principal passa o principal para a opção em avaliação mais
 *     antiga, se houver; sem nenhuma, o principal fica onde está;
 *   · `principal: true` numa opção a torna o principal, desde que não haja
 *     outro carro escolhido (o escolhido é sempre o principal).
 */
export function planejarResolucoes(
  opcoes: readonly LinhaDaOpcao[],
  principalAtual: number | string | null | undefined,
  pedidos: readonly PedidoDeResolucao[],
): PlanoDeResolucao {
  const porId = new Map(opcoes.map((o) => [o.id, o]));
  const vistos = new Set<string>();
  for (const p of pedidos) {
    if (!porId.has(p.opcao)) {
      return { ...recusar("opcao_nao_encontrada", "Opção não encontrada neste lead.", 404), opcao: p.opcao };
    }
    if (vistos.has(p.opcao)) {
      return { ...recusar("opcao_repetida", "A mesma opção veio duas vezes no pedido."), opcao: p.opcao };
    }
    vistos.add(p.opcao);
  }

  // Como cada opção fica depois dos pedidos.
  const depois = new Map(opcoes.map((o) => [o.id, { ...o }]));
  for (const p of pedidos) Object.assign(depois.get(p.opcao)!, p.campos);

  const escolhem = pedidos.filter((p) => p.campos.situacao === "escolhido");
  if (escolhem.length > 1) {
    return recusar("varios_escolhidos", "Só um carro pode ser o escolhido. O pedido escolhe mais de um.");
  }

  const passos: PassoDoPlano[] = pedidos
    .filter((p) => Object.keys(p.campos).length > 0)
    .map((p) => ({ opcao: p.opcao, campos: p.campos, implicito: false }));

  const novoEscolhido = escolhem[0]?.opcao;
  if (novoEscolhido) {
    for (const o of depois.values()) {
      if (o.id !== novoEscolhido && o.situacao === "escolhido") {
        o.situacao = "em_avaliacao";
        o.motivo_descarte = null;
        const reabrir: CamposDaResolucao = { situacao: "em_avaliacao", motivo_descarte: null };
        const doPedido = passos.find((p) => p.opcao === o.id);
        if (doPedido) doPedido.campos = { ...doPedido.campos, ...reabrir };
        else passos.push({ opcao: o.id, campos: reabrir, implicito: true });
      }
    }
  }
  // O escolhido novo por último: antes dele, o anterior já saiu do índice único.
  passos.sort((a, b) => Number(a.opcao === novoEscolhido) - Number(b.opcao === novoEscolhido));

  const finais = [...depois.values()];
  const escolhidoFinal = finais.find((o) => o.situacao === "escolhido");
  const pedeSerPrincipal = pedidos.filter((p) => p.principal === true);
  if (pedeSerPrincipal.length > 1) {
    return recusar("varios_escolhidos", "Só um carro é o principal. O pedido aponta mais de um.");
  }
  const alvo = pedeSerPrincipal[0] ? depois.get(pedeSerPrincipal[0].opcao)! : null;

  let principal: number | null | undefined;
  if (alvo && escolhidoFinal && escolhidoFinal.id !== alvo.id) {
    return {
      ...recusar(
        "principal_ja_escolhido",
        "O principal é o carro escolhido. Para trocar, escolha o outro carro.",
        409,
      ),
      opcao: alvo.id,
    };
  }
  if (novoEscolhido) {
    principal = Number(depois.get(novoEscolhido)!.veiculo_id);
  } else if (alvo) {
    principal = Number(alvo.veiculo_id);
  } else {
    const descartouOPrincipal = pedidos.some((p) => {
      const o = porId.get(p.opcao)!;
      return p.campos.situacao === "descartado" && o.situacao !== "descartado" && mesmoCarro(o.veiculo_id, principalAtual);
    });
    if (descartouOPrincipal) principal = sucessorDoPrincipal(finais) ?? undefined;
  }
  if (principal !== undefined && mesmoCarro(principal, principalAtual)) principal = undefined;

  return { ok: true, passos, principal };
}

export interface ItemDoLote {
  opcao: string;
  corpo: Record<string, unknown>;
}

export type DecisaoDeLote =
  | { ok: true; itens: ItemDoLote[] }
  | Recusa<"lote_invalido" | "lote_vazio" | "lote_grande" | "opcao_invalida" | "opcao_repetida" | "situacao_invalida">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehIdDeOpcao(valor: unknown): valor is string {
  return typeof valor === "string" && UUID.test(valor);
}

/**
 * O corpo do `POST …/veiculos/resolver`: uma LISTA
 * `[{ opcao, situacao, motivo_descarte?, nota? }]`. Aqui só a forma; a regra de
 * cada item é a de `decidirResolucao`, contra a linha do banco, na rota.
 * No lote a `situacao` é obrigatória: ele existe para resolver.
 */
export function decidirLote(corpo: unknown): DecisaoDeLote {
  if (!Array.isArray(corpo)) {
    return recusar("lote_invalido", "Envie a lista de resoluções: [{ opcao, situacao, motivo_descarte, nota }].");
  }
  if (corpo.length === 0) return recusar("lote_vazio", "Nenhuma opção para resolver.");
  if (corpo.length > LIMITE_DO_LOTE) return recusar("lote_grande", `Um pedido resolve até ${LIMITE_DO_LOTE} opções.`);
  const itens: ItemDoLote[] = [];
  const vistos = new Set<string>();
  for (const bruto of corpo) {
    const item = objeto(bruto);
    if (!item || !ehIdDeOpcao(item.opcao)) return recusar("opcao_invalida", "Cada item traz `opcao`: o id da opção.");
    const opcao = item.opcao.toLowerCase();
    if (vistos.has(opcao)) return recusar("opcao_repetida", "A mesma opção veio duas vezes no pedido.");
    vistos.add(opcao);
    if (!ehSituacaoDaOpcao(item.situacao)) {
      return recusar("situacao_invalida", `Cada item traz \`situacao\`: ${SITUACOES_DA_OPCAO.join(", ")}.`);
    }
    const { opcao: _fora, ...resto } = item;
    void _fora;
    itens.push({ opcao: item.opcao, corpo: resto });
  }
  return { ok: true, itens };
}

// ---------------------------------------------------------------------------
// As opções, na forma da tela
// ---------------------------------------------------------------------------

/** O que a rota lê de `estoque_motors` para cada opção. Só colunas públicas. */
export interface CarroDaOpcao {
  id: number | string;
  quilometragem?: number | string | null;
  preco?: number | string | null;
  vendido?: boolean | null;
}

export interface VeiculoDeInteresse {
  /** O id da opção. `null`: o principal do lead ainda não tem linha em `leads_veiculos`. */
  id: string | null;
  veiculo_id: number;
  rotulo: string;
  preco_na_epoca: number | null;
  preco_atual: number | null;
  km: number | null;
  /** `null` quando o estoque não pôde ser lido. */
  no_estoque: boolean | null;
  vendido: boolean | null;
  situacao: SituacaoDaOpcao;
  motivo_descarte: string | null;
  motivo_rotulo: string | null;
  nota: string | null;
  adicionado_por: string | null;
  criado_em: string | null;
  resolvido_por: string | null;
  resolvido_em: string | null;
  principal: boolean;
}

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** `carros`: o que veio do estoque, ou `null` se a leitura falhou. */
function doEstoque(carros: readonly CarroDaOpcao[] | null, veiculoId: number | string) {
  if (carros === null) return { preco_atual: null, km: null, no_estoque: null, vendido: null };
  const carro = carros.find((c) => mesmoCarro(c.id, veiculoId));
  if (!carro) return { preco_atual: null, km: null, no_estoque: false, vendido: null };
  return {
    preco_atual: numero(carro.preco),
    km: numero(carro.quilometragem),
    no_estoque: true,
    vendido: carro.vendido === true,
  };
}

/**
 * As linhas de `leads_veiculos` de um lead → `veiculos` da resposta. O
 * principal primeiro, depois na ordem em que os carros entraram.
 */
export function veiculosDoLeadNaTela(
  linhas: readonly LinhaDaOpcao[],
  carros: readonly CarroDaOpcao[] | null,
  principal: number | string | null | undefined,
): VeiculoDeInteresse[] {
  return [...linhas]
    .sort((a, b) => Number(mesmoCarro(b.veiculo_id, principal)) - Number(mesmoCarro(a.veiculo_id, principal)) || maisAntigaPrimeiro(a, b))
    .map((l) => ({
      id: l.id,
      veiculo_id: Number(l.veiculo_id),
      rotulo: rotuloDoVeiculoNaTela(l.veiculo_rotulo) || `Veículo nº ${l.veiculo_id}`,
      preco_na_epoca: numero(l.veiculo_preco),
      ...doEstoque(carros, l.veiculo_id),
      situacao: ehSituacaoDaOpcao(l.situacao) ? l.situacao : "em_avaliacao",
      motivo_descarte: l.motivo_descarte ?? null,
      motivo_rotulo: rotuloDoMotivo(l.motivo_descarte),
      nota: l.nota ?? null,
      adicionado_por: l.adicionado_por ?? null,
      criado_em: l.criado_em ?? null,
      resolvido_por: l.resolvido_por ?? null,
      resolvido_em: l.resolvido_em ?? null,
      principal: mesmoCarro(l.veiculo_id, principal),
    }));
}

/**
 * O veículo principal do lead como UMA opção, sem linha em `leads_veiculos`.
 *
 * Serve a dois casos: a tabela ainda não existe (a resposta é a de sempre, com
 * o carro único), e a tabela existe mas o principal não tem linha (o registro
 * da captura falhou). `id` vem `null`: não há o que resolver até a opção ser
 * criada com `POST …/veiculos`.
 */
export function principalComoOpcao(
  lead: { veiculo_id?: number | string | null; interesse?: string | null; created_at?: string | null },
  carro: (CarroDaOpcao & { nome?: string | null }) | null,
  carros: readonly CarroDaOpcao[] | null = carro ? [carro] : [],
): VeiculoDeInteresse | null {
  const id = idDeVeiculo(typeof lead.veiculo_id === "number" ? lead.veiculo_id : String(lead.veiculo_id ?? ""));
  if (id === null) return null;
  const interesse = typeof lead.interesse === "string" ? lead.interesse.trim() : "";
  return {
    id: null,
    veiculo_id: id,
    rotulo: carro?.nome?.trim() || interesse || `Veículo nº ${id}`,
    preco_na_epoca: null,
    ...doEstoque(carros, id),
    situacao: "em_avaliacao",
    motivo_descarte: null,
    motivo_rotulo: null,
    nota: null,
    adicionado_por: null,
    criado_em: lead.created_at ?? null,
    resolvido_por: null,
    resolvido_em: null,
    principal: true,
  };
}

// ---------------------------------------------------------------------------
// Ao fechar o lead
// ---------------------------------------------------------------------------

export interface PendenciaDeVeiculo {
  opcao: string;
  veiculo_id: number;
  rotulo: string;
}

export interface PendenciasAoFechar {
  /** As opções que ainda pedem resolução (seguem em avaliação). */
  pendentes: PendenciaDeVeiculo[];
  /**
   * A opção que o fechamento como ganho escolhe sozinho: a única do lead,
   * ainda em avaliação. Não entra em `pendentes`.
   */
  escolha_automatica: string | null;
  /** Fechado como ganho e nenhum carro escolhido (nem por escolher sozinho). */
  falta_escolhido: boolean;
}

type OpcaoResumida = Pick<VeiculoDeInteresse, "id" | "veiculo_id" | "rotulo" | "situacao">;

/**
 * O que falta resolver nos carros de um lead que está sendo (ou foi) fechado.
 *
 * `desfecho` é o do fechamento: `ganho`, `perdido`, `descartado`, ou `null`
 * para o lead ainda aberto (aí toda opção em avaliação é pendência futura).
 * Esta versão NÃO bloqueia o desfecho: a tela usa a resposta para oferecer a
 * resolução em lote logo antes ou logo depois de fechar.
 *
 * A opção sem linha (`id: null`) não entra: não há o que resolver nela.
 */
export function pendenciasAoFechar(
  opcoes: readonly OpcaoResumida[],
  desfecho: string | null | undefined,
): PendenciasAoFechar {
  const comLinha = opcoes.filter((o): o is OpcaoResumida & { id: string } => typeof o.id === "string");
  const ganho = desfecho === "ganho";
  const temEscolhido = comLinha.some((o) => o.situacao === "escolhido");
  const sozinha = ganho && comLinha.length === 1 && comLinha[0].situacao === "em_avaliacao" ? comLinha[0].id : null;
  return {
    pendentes: comLinha
      .filter((o) => o.situacao === "em_avaliacao" && o.id !== sozinha)
      .map((o) => ({ opcao: o.id, veiculo_id: o.veiculo_id, rotulo: o.rotulo })),
    escolha_automatica: sozinha,
    falta_escolhido: ganho && !temEscolhido && sozinha === null,
  };
}

/**
 * A opção que o fechamento como ganho escolhe sozinho, lida das LINHAS: existe
 * exatamente uma, e ela segue em avaliação. Uma opção já descartada não é
 * escolhida por cima: alguém disse por que o cliente não quis aquele carro.
 */
export function opcaoQueOGanhoEscolhe(linhas: readonly Pick<LinhaDaOpcao, "id" | "situacao">[]): string | null {
  return linhas.length === 1 && linhas[0].situacao === "em_avaliacao" ? linhas[0].id : null;
}

// ---------------------------------------------------------------------------
// O relatório por veículo
// ---------------------------------------------------------------------------

export interface MotivoNoRelatorio {
  motivo: string;
  rotulo: string;
  total: number;
  /** Do total de DESCARTES deste carro, de 0 a 100, com uma casa. */
  percentual: number;
}

export interface NotaNoRelatorio {
  texto: string;
  motivo: string | null;
  motivo_rotulo: string | null;
  em: string | null;
}

export interface RelatorioDoVeiculo {
  veiculo_id: number | null;
  total: number;
  em_avaliacao: number;
  sem_resolucao: number;
  escolhido: number;
  descartado: number;
  /** Cada contagem sobre o `total` de leads que consideraram o carro, de 0 a 100. */
  percentuais: { em_avaliacao: number; sem_resolucao: number; escolhido: number; descartado: number };
  motivo_principal: MotivoNoRelatorio | null;
  motivos: MotivoNoRelatorio[];
  notas: NotaNoRelatorio[];
  primeiro_interesse_em: string | null;
  ultimo_interesse_em: string | null;
}

const inteiro = (v: unknown): number => {
  const n = numero(v);
  return n === null || n < 0 ? 0 : Math.trunc(n);
};

/** A parte no todo, de 0 a 100, com uma casa. Todo zero dá zero, e não NaN. */
export function percentual(parte: number, todo: number): number {
  return todo > 0 ? Math.round((parte / todo) * 1000) / 10 : 0;
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

function motivosDoRelatorio(bruto: unknown, descartados: number): MotivoNoRelatorio[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .flatMap((m) => {
      const o = objeto(m);
      const chave = texto(o?.motivo);
      const total = inteiro(o?.total);
      return chave && total > 0 ? [{ chave, total }] : [];
    })
    .sort((a, b) => b.total - a.total || (a.chave < b.chave ? -1 : 1))
    .map(({ chave, total }) => ({
      motivo: chave,
      rotulo: rotuloDoMotivo(chave) ?? chave,
      total,
      percentual: percentual(total, descartados),
    }));
}

/**
 * A linha de `resumo_de_interesse_do_veiculo` → o relatório do carro.
 *
 * A saída é montada campo a campo, e não copiada: o que a função do banco
 * vier a devolver a mais NÃO passa. O relatório é da loja inteira e vai ao
 * dono do carro consignado: contagens, motivos e notas, sem lead, nome,
 * telefone nem autor (`tests/veiculos-de-interesse.test.ts` trava).
 *
 * `rpc` aceita a linha ou a lista de uma linha, como o PostgREST devolve
 * função `returns table`. Sem linha, o relatório é o de quem ninguém
 * considerou: zeros.
 */
export function montarRelatorioDoVeiculo(rpc: unknown): RelatorioDoVeiculo {
  const linha = objeto(Array.isArray(rpc) ? rpc[0] : rpc) ?? {};
  const total = inteiro(linha.total);
  const descartado = inteiro(linha.descartado);
  const contagens = {
    em_avaliacao: inteiro(linha.em_avaliacao),
    sem_resolucao: inteiro(linha.sem_resolucao),
    escolhido: inteiro(linha.escolhido),
    descartado,
  };
  const motivos = motivosDoRelatorio(linha.motivos, descartado);
  const notas: NotaNoRelatorio[] = (Array.isArray(linha.notas) ? linha.notas : []).flatMap((n) => {
    const o = objeto(n);
    const nota = texto(o?.nota);
    if (!nota) return [];
    const motivo = texto(o?.motivo);
    return [{ texto: nota.trim(), motivo, motivo_rotulo: rotuloDoMotivo(motivo), em: texto(o?.em) }];
  });
  return {
    veiculo_id: numero(linha.veiculo_id),
    total,
    ...contagens,
    percentuais: {
      em_avaliacao: percentual(contagens.em_avaliacao, total),
      sem_resolucao: percentual(contagens.sem_resolucao, total),
      escolhido: percentual(contagens.escolhido, total),
      descartado: percentual(descartado, total),
    },
    motivo_principal: motivos[0] ?? null,
    motivos,
    notas,
    primeiro_interesse_em: texto(linha.primeiro_interesse_em),
    ultimo_interesse_em: texto(linha.ultimo_interesse_em),
  };
}

export interface LinhaDoRanking {
  veiculo_id: number | null;
  rotulo: string;
  no_estoque: boolean;
  vendido: boolean | null;
  preco_atual: number | null;
  total: number;
  em_avaliacao: number;
  sem_resolucao: number;
  escolhido: number;
  descartado: number;
  motivo_principal: string | null;
  motivo_principal_rotulo: string | null;
  motivos: MotivoNoRelatorio[];
  ultimo_interesse_em: string | null;
}

/** As linhas de `interesse_por_veiculo()` → o ranking, na ordem em que vieram. */
export function montarRankingDeInteresse(rpc: unknown): LinhaDoRanking[] {
  if (!Array.isArray(rpc)) return [];
  return rpc.flatMap((bruta) => {
    const linha = objeto(bruta);
    if (!linha) return [];
    const descartado = inteiro(linha.descartado);
    const motivos = motivosDoRelatorio(linha.motivos, descartado);
    const principal = texto(linha.motivo_principal) ?? motivos[0]?.motivo ?? null;
    const id = numero(linha.veiculo_id);
    return [
      {
        veiculo_id: id,
        rotulo: rotuloDoVeiculoNaTela(texto(linha.veiculo_rotulo)) || `Veículo nº ${id ?? "?"}`,
        no_estoque: linha.no_estoque === true,
        vendido: typeof linha.vendido === "boolean" ? linha.vendido : null,
        preco_atual: numero(linha.preco_atual),
        total: inteiro(linha.total),
        em_avaliacao: inteiro(linha.em_avaliacao),
        sem_resolucao: inteiro(linha.sem_resolucao),
        escolhido: inteiro(linha.escolhido),
        descartado,
        motivo_principal: principal,
        motivo_principal_rotulo: rotuloDoMotivo(principal),
        motivos,
        ultimo_interesse_em: texto(linha.ultimo_interesse_em),
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// A busca do carro
// ---------------------------------------------------------------------------

/** O mínimo de caracteres para buscar, e quantos carros a busca devolve. */
export const MINIMO_DA_BUSCA_DE_CARRO = 2;
export const LIMITE_DA_BUSCA_DE_CARRO = 12;

/** As colunas de texto em que cada palavra da busca é procurada. */
export const COLUNAS_DA_BUSCA_DE_CARRO = ["marca", "modelo", "versao"] as const;

export interface FiltroDaBuscaDeCarro {
  /** As palavras, já limpas: o que foi de fato procurado. */
  termos: string[];
  /**
   * Um filtro `or` do PostgREST POR PALAVRA; a rota encadeia todos, e o carro
   * tem de casar com todas as palavras (cada uma em qualquer coluna).
   */
  ramos: string[];
}

/**
 * O que foi digitado no seletor de carro → os filtros da consulta, ou `null`
 * quando não dá para buscar (menos de dois caracteres úteis).
 *
 * Cada palavra é procurada em marca, modelo e versão (contém, sem distinguir
 * caixa). Palavra só de dígitos vale também como ano e como código do carro
 * (`id`, igualdade). Com `comPlaca`, palavra com cara de placa é procurada
 * também na placa.
 *
 * ---------------------------------------------------------------------------
 * Curingas e a gramática do `or`
 * ---------------------------------------------------------------------------
 * O termo entra na STRING do filtro, e ela é uma fronteira. Saem dele, antes:
 * `%` e `_` (curingas do `ilike`), `*` (que o PostgREST lê como `%`), a barra
 * invertida (o escape dos dois), e vírgula, parênteses e aspas (que partiriam
 * o `or` ao meio, como em `termoDeBusca` de `lib/agenda`). Viram espaço:
 * nenhum deles faz parte do nome de um carro, e "100%" não pode listar o
 * estoque inteiro. O ponto e o hífen ficam ("1.0", "t-cross").
 *
 * A busca DISTINGUE acento: não há coluna normalizada nem `unaccent` no banco,
 * a mesma falta que `docs/GESTAO_DO_LEAD.md` §4 registra para o nome do lead.
 */
export function filtroDaBuscaDeCarro(
  bruto: string | null | undefined,
  opcoes: { comPlaca?: boolean } = {},
): FiltroDaBuscaDeCarro | null {
  const limpo = (bruto ?? "")
    .replace(/[%_*\\,()"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (limpo.length < MINIMO_DA_BUSCA_DE_CARRO) return null;
  const termos = limpo.split(" ").slice(0, 6);
  const ramos = termos.map((termo) => {
    const ramo = COLUNAS_DA_BUSCA_DE_CARRO.map((c) => `${c}.ilike.*${termo}*`);
    if (/^\d+$/.test(termo) && Number.isSafeInteger(Number(termo))) {
      if (termo.length === 4) ramo.push(`ano.eq.${termo}`);
      ramo.push(`id.eq.${Number(termo)}`);
    }
    if (opcoes.comPlaca && /^[a-z0-9-]{3,8}$/i.test(termo)) {
      ramo.push(`placa.ilike.*${termo}*`);
      const semHifen = termo.replace(/-/g, "");
      if (semHifen !== termo && semHifen.length >= 3) ramo.push(`placa.ilike.*${semHifen}*`);
    }
    return ramo.join(",");
  });
  return { termos, ramos };
}

/** Os quatro últimos caracteres da placa, sem hífen nem espaço, ou `null`. */
export function finalDaPlaca(placa: unknown): string | null {
  if (typeof placa !== "string") return null;
  const limpa = placa.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return limpa.length >= 4 ? limpa.slice(-4) : null;
}
