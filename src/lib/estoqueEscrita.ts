import { ehTabelaOuColunaAusente } from "./erroDeSchema";

/**
 * Escrita no estoque — o caminho único por onde o painel altera veículo.
 *
 * Existia só dentro de `/api/estoque/[id]`, para o editor da tela A15. A
 * tabela A6 precisa da mesma operação em lote, e duplicar a rotina significaria
 * duas versões da regra de histórico: uma registrando quem mexeu no preço,
 * outra esquecendo. Está aqui para que haja uma só.
 *
 * A escrita é sempre por rota autenticada, nunca pelo cliente com a anon key
 * como faz o painel antigo (`AUDITORIA.md §3.4`).
 */

/** Campos que o painel controla. O sync do RevendaMais não conhece nenhum
 *  deles — é o contrato da migração 20260807160000. */
export const CAMPOS_NOSSOS = [
  "placa",
  "motor",
  "cor_interna",
  "donos_anteriores",
  "garantia_fabrica",
  "preco_compra",
  "descricao",
  // Migração 20260817130000. Campo do painel, como os de cima: o sync não o
  // conhece, então o texto escrito aqui sobrevive a todo ciclo do RevendaMais.
  "descricao_seo",
  "laudo_pericia",
  "opcionais",
  "status_tag",
  "status_tag_color",
  "vendido",
  "tipo",
  "perfil_uso",
  // Migração 20260826150000. `modelo` e `versao` SÃO colunas do feed — por
  // isso os overrides existem em vez de edição direta: corrigir a coluna
  // original seria desfeito no próximo ciclo do n8n, em silêncio. Estes dois
  // o sync não conhece, e é o que faz a correção durar.
  "modelo_override",
  "versao_override",
  // Migração 20260826230000. `perfil_uso` (singular) continua na lista para
  // não quebrar quem ainda escreve nele; o painel passou a escrever aqui.
  "perfis_uso",
] as const;

export type CampoNosso = (typeof CAMPOS_NOSSOS)[number];

/**
 * Preço: gravável só no veículo que nasceu no painel.
 *
 * `preco` e `preco_original` SÃO colunas do feed, e é por isso que ficam fora
 * de `CAMPOS_NOSSOS`: editá-las num veículo do RevendaMais seria desfeito no
 * ciclo seguinte, em silêncio — o mesmo motivo que criou `modelo_override` e
 * `versao_override` em vez de edição direta.
 *
 * **Esse motivo deixou de existir para o veículo nativo** (migração
 * 20260829130000): a trava do sync garante que o RevendaMais nunca toca em
 * linha de `origem = 'painel'`. Sem isto, a loja cadastra um carro no painel e
 * não consegue mais corrigir o preço — nem para promoção, nem para consertar
 * um dígito errado.
 *
 * As duas colunas andam juntas de propósito: o mapper público lê
 * `preco_original` e a ordenação da vitrine lê `preco`. Gravar uma só faria o
 * carro sair a R$ 0 em metade das superfícies.
 */
export const CAMPOS_DE_PRECO_DO_NATIVO = ["preco", "preco_original"] as const;

/**
 * Os campos graváveis para ESTE veículo — a lista fixa, mais o preço quando a
 * linha é do painel.
 *
 * Recebe a origem em vez de consultá-la: quem chama já leu a linha, e uma
 * segunda consulta aqui abriria janela entre a leitura e a escrita.
 */
export function camposGravaveis(origem?: string | null): readonly string[] {
  return origem === "painel"
    ? [...CAMPOS_NOSSOS, ...CAMPOS_DE_PRECO_DO_NATIVO]
    : CAMPOS_NOSSOS;
}

/**
 * Só o que o painel pode escrever passa; o resto do corpo é descartado.
 *
 * Corpo que não é objeto vira lista vazia em vez de exceção: `"campo" in
 * "texto"` é TypeError, e um POST com `campos: "vendido"` derrubava a rota com
 * 500 no lugar do 400 que a entrada malformada merece.
 */
export function extrairCamposNossos(
  corpo: unknown,
  /**
   * Origem da linha sendo escrita. Só `"painel"` alarga a lista (com o preço —
   * ver `CAMPOS_DE_PRECO_DO_NATIVO`); ausente ou qualquer outra coisa mantém o
   * comportamento de sempre. Opcional de propósito: a rota de lote escreve em
   * veículos de origens misturadas e não passa nada, então nenhum preço passa
   * por lá — que é o certo, porque lote não é lugar de reprecificar.
   */
  origem?: string | null,
): Record<string, unknown> {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return {};
  const fonte = corpo as Record<string, unknown>;
  const atualizacao: Record<string, unknown> = {};
  for (const campo of camposGravaveis(origem)) {
    if (campo in fonte) atualizacao[campo] = fonte[campo];
  }
  return atualizacao;
}

/** O id chega como string na URL e no JSON, mas é bigint no banco. */
export function normalizarId(id: string | number): string | number {
  const texto = String(id);
  return /^\d+$/.test(texto) ? Number(texto) : texto;
}

export interface ResultadoDaEscrita {
  erro?: string;
  status?: number;
  camposSalvos: string[];
  mudancasRegistradas: number;
}

/**
 * Aplica a mesma atualização a um ou mais veículos, registrando no histórico
 * apenas o que de fato mudou.
 *
 * Salvar sem alterar nada não pode poluir a trilha — senão "quem mexeu no
 * preço?" vira uma lista de cliques em Salvar.
 */
export async function aplicarNosVeiculos(
  supabase: any,
  ids: Array<string | number>,
  atualizacao: Record<string, unknown>,
  autor: { id: string; nome: string | null },
): Promise<ResultadoDaEscrita> {
  const campos = Object.keys(atualizacao);
  if (campos.length === 0) {
    return { erro: "Nada para atualizar", status: 400, camposSalvos: [], mudancasRegistradas: 0 };
  }
  if (ids.length === 0) {
    return { erro: "Nenhum veículo informado", status: 400, camposSalvos: [], mudancasRegistradas: 0 };
  }

  const alvos = ids.map(normalizarId);

  // Estado anterior, lido ANTES do update: é o "NO AR HOJE" que a tela A16
  // compara com o proposto. Reconstruir isso depois exigiria refazer a cadeia
  // inteira de trás para frente.
  const { data: antes } = await supabase
    .from("estoque_motors")
    .select(["id", ...CAMPOS_NOSSOS].join(","))
    .in("id", alvos);

  const { error } = await supabase.from("estoque_motors").update(atualizacao).in("id", alvos);

  if (error) {
    if (ehTabelaOuColunaAusente(error)) {
      return {
        // A mensagem não cita mais um arquivo só. Citava
        // `20260807160000_ficha_propria_do_painel.sql`, e desde que
        // `descricao_seo` entrou em CAMPOS_NOSSOS (20260817130000) esse nome
        // manda quem lê aplicar a migração errada — pior que não sugerir nada.
        erro:
          "Campo da ficha própria ainda não existe no banco. Aplique as migrações " +
          "pendentes de supabase/migrations e recarregue.",
        status: 500,
        camposSalvos: [],
        mudancasRegistradas: 0,
      };
    }
    return { erro: error.message, status: 500, camposSalvos: [], mudancasRegistradas: 0 };
  }

  // Comparação frouxa de propósito: o formulário devolve "" onde o banco tem
  // null, e number onde tem string numérica.
  const norm = (x: unknown) => (x === null || x === undefined || x === "" ? "" : String(x));

  const mudancas: Array<Record<string, unknown>> = [];
  for (const linha of (antes ?? []) as Array<Record<string, unknown>>) {
    for (const [campo, novo] of Object.entries(atualizacao)) {
      if (norm(linha[campo]) === norm(novo)) continue;
      mudancas.push({
        veiculo_id: Number(linha.id),
        campo,
        valor_anterior: linha[campo] === null || linha[campo] === undefined ? null : String(linha[campo]),
        valor_novo: novo === null || novo === undefined ? null : String(novo),
        autor_id: autor.id,
        autor_nome: autor.nome,
      });
    }
  }

  if (mudancas.length > 0) {
    // Nunca derruba o salvamento: a alteração já está no banco, e perder o
    // registro é menos grave que devolver erro para uma gravação que deu
    // certo. Mesma regra de `registrarAcaoSensivel`.
    const { error: erroHistorico } = await supabase.from("historico_veiculo").insert(mudancas);
    if (erroHistorico) {
      console.warn("[Estoque] Falha ao registrar histórico:", erroHistorico.message);
    }
  }

  return { camposSalvos: campos, mudancasRegistradas: mudancas.length };
}
