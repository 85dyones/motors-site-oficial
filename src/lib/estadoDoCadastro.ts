/**
 * O estado do cadastro de um veículo — `rascunho`, `publicado`, `arquivado`.
 *
 * ---------------------------------------------------------------------------
 * Por que este vocabulário existe
 * ---------------------------------------------------------------------------
 * Decisão do dono em 2026-08-30: *"para o sync cron, deixa apenas a opção de
 * importação com acionamento manual, sem override, criamos rascunhos dos carros
 * para serem finalizados antes de serem publicados"*. O RevendaMais deixou de
 * ser dono do dado — ele IMPORTA; quem decide o que vai ao ar é a loja.
 *
 * A coluna está no banco desde a migração
 * `20260830120000_f0q_estado_do_cadastro_e_fim_do_override`, com CHECK nos três
 * valores e um trigger que força `rascunho` em todo INSERT — importado ou
 * cadastrado no painel, mandar outra coisa no payload não adianta.
 *
 * ---------------------------------------------------------------------------
 * Dois conceitos que a tela não pode confundir
 * ---------------------------------------------------------------------------
 * - **Estado do cadastro** é DECISÃO DA LOJA. Rascunho e arquivado são atos (ou
 *   a ausência deles): alguém precisa olhar o carro e liberar, e alguém precisa
 *   tirá-lo do ar. Nada resolve isso sozinho.
 * - **Bloqueio de publicação** (`bloqueiosDePublicacao`) é PENDÊNCIA DE
 *   MATERIAL: faltam fotos. Resolve-se subindo as fotos, e o carro volta à
 *   vitrine sem ninguém clicar em nada.
 *
 * Misturar os dois faria a tela mandar o operador para a tarefa errada — pedir
 * foto de um carro que a loja arquivou de propósito, ou dizer "sem foto" sobre
 * um rascunho que ninguém revisou ainda. Por isso este arquivo não reescreve a
 * régua de fotos: ele a CONSULTA, na única casa que ela tem.
 *
 * ---------------------------------------------------------------------------
 * Sem import além de `coerenciaDoCadastro`
 * ---------------------------------------------------------------------------
 * Este módulo viaja para o cliente (tabela A6 e editor A15 são componentes de
 * cliente). `coerenciaDoCadastro` é seguro de importar porque ele mesmo não
 * importa ninguém — a mesma nota que `estoqueTabela.ts` já carrega. Um import
 * de `./supabase` aqui arrastaria o cliente do banco para o bundle do
 * navegador.
 */

import { bloqueiosDePublicacao, type MotivoDeBloqueio } from "./coerenciaDoCadastro";

/**
 * Os três valores que o banco aceita — a transcrição do CHECK
 * `estoque_motors_estado_valido`. Um teste trava esta lista contra o SQL.
 */
export const ESTADOS_DO_CADASTRO = ["rascunho", "publicado", "arquivado"] as const;
export type EstadoCadastro = (typeof ESTADOS_DO_CADASTRO)[number];

/** A coluna. Nomeada uma vez, para o gate e a escrita citarem a mesma. */
export const CAMPO_DO_ESTADO = "estado_cadastro";

export const ROTULO_DO_ESTADO_CADASTRO: Record<EstadoCadastro, string> = {
  rascunho: "Rascunho",
  publicado: "Publicado",
  arquivado: "Arquivado",
};

/** O que cada estado significa para quem lê a tela, em uma frase. */
export const EXPLICACAO_DO_ESTADO_CADASTRO: Record<EstadoCadastro, string> = {
  rascunho: "importado ou cadastrado, ainda não revisado — só o painel enxerga",
  publicado: "a loja liberou; é o que a vitrine mostra",
  arquivado: "saiu do estoque — não volta sozinho",
};

export function ehEstadoDoCadastro(valor: unknown): valor is EstadoCadastro {
  return typeof valor === "string" && (ESTADOS_DO_CADASTRO as readonly string[]).includes(valor);
}

/**
 * O estado de uma linha do banco, com `rascunho` como piso.
 *
 * Valor desconhecido, nulo ou ausente vira `rascunho` de propósito: é o único
 * dos três que não afirma nada sobre o site. Cair em `publicado` por falta de
 * dado seria o painel dizer que um carro está no ar sem ter como saber — a
 * mesma mentira que `classificarEstado` foi corrigido para não contar.
 *
 * A coluna ausente (banco sem a migração) cai aqui e pinta o estoque inteiro de
 * rascunho. É barulhento por escolha: a tela A6 detecta o caso e explica, em
 * vez de mostrar um número errado em silêncio.
 */
export function normalizarEstadoCadastro(valor: unknown): EstadoCadastro {
  return ehEstadoDoCadastro(valor) ? valor : "rascunho";
}

/** As duas transições que a A17 governa na linha "Publicar ou despublicar". */
export type AcaoDePublicacao = "publicar" | "arquivar";

export const ROTULO_DA_ACAO: Record<AcaoDePublicacao, string> = {
  publicar: "Publicar",
  arquivar: "Arquivar",
};

/** O estado em que cada ação deixa o veículo. */
export const ESTADO_APOS_ACAO: Record<AcaoDePublicacao, EstadoCadastro> = {
  publicar: "publicado",
  arquivar: "arquivado",
};

/**
 * O que faz sentido oferecer sobre um veículo neste estado.
 *
 * O arquivado NÃO ganha "arquivar" de novo, e o publicado não ganha
 * "publicar" — botão que não muda nada é ruído numa barra de ação em lote.
 *
 * O arquivado ganha "publicar", e isso é o oposto de "voltar sozinho": é
 * preciso alguém com a linha da matriz clicar. A regra que a migração escreve
 * — *"saiu do estoque. Não volta sozinho"* — é sobre não haver caminho
 * automático, e não há: nem o sync (o trigger devolve o UPDATE intacto), nem a
 * régua de fotos, nem marcar/desmarcar vendido.
 */
export function acoesDoEstado(estado: EstadoCadastro): AcaoDePublicacao[] {
  if (estado === "publicado") return ["arquivar"];
  if (estado === "arquivado") return ["publicar"];
  return ["publicar", "arquivar"];
}

/** Um veículo recusado na publicação, com o motivo já escrito. */
export interface RecusaDePublicacao {
  id: string;
  motivos: MotivoDeBloqueio[];
}

/**
 * Quais destes veículos NÃO podem ser publicados, e por quê.
 *
 * A régua é `bloqueiosDePublicacao` — a mesma que corta o `getEstoque`, que o
 * editor A15 desenha e que a tabela A6 usa na etiqueta. Escrever aqui um "se
 * tem 8 fotos" próprio criaria uma segunda régua, e o dia em que o mínimo
 * baixasse ela ficaria para trás cobrando o número velho.
 *
 * `filter(bloqueia)` porque a lista traz também a pendência que ainda não tira
 * do ar (o laudo): recusar publicação por ela hoje travaria o estoque inteiro —
 * 38 das 39 fichas de 27/08 estão com o campo vazio.
 */
export function recusasParaPublicar(
  veiculos: Array<{
    id: string | number;
    laudo_pericia?: string | null;
    whatsapp_images?: unknown;
    origem?: string | null;
  }>,
): RecusaDePublicacao[] {
  const recusas: RecusaDePublicacao[] = [];
  for (const v of veiculos) {
    const motivos = bloqueiosDePublicacao(v).filter((m) => m.bloqueia);
    if (motivos.length > 0) recusas.push({ id: String(v.id), motivos });
  }
  return recusas;
}

/**
 * A frase que a rota devolve e a tela mostra — uma redação só.
 *
 * Nomeia o carro E o motivo. "Não foi possível publicar" sem os dois manda o
 * operador abrir o editor de cada um dos selecionados para descobrir qual
 * travou; com um lote de 20, é a diferença entre resolver e desistir.
 *
 * `limite` corta a lista porque `MAXIMO_POR_LOTE` é 200: uma mensagem com
 * duzentos códigos não cabe na faixa de erro nem ajuda ninguém.
 */
export function textoDaRecusaDePublicacao(
  recusas: RecusaDePublicacao[],
  limite = 4,
): string {
  const listadas = recusas.slice(0, limite);
  const detalhe = listadas
    .map((r) => `${r.id} (${r.motivos.map((m) => m.texto).join("; ")})`)
    .join(" · ");
  const resto = recusas.length - listadas.length;
  const cauda = resto > 0 ? ` e mais ${resto}` : "";
  const sujeito =
    recusas.length === 1 ? "1 veículo ainda não pode ir ao ar" : `${recusas.length} veículos ainda não podem ir ao ar`;
  return `${sujeito}: ${detalhe}${cauda}.`;
}
