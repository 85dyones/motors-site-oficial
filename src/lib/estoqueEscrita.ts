import { ehTabelaOuColunaAusente } from "./erroDeSchema";
import {
  CAMPO_DO_ESTADO,
  ehEstadoDoCadastro,
  ESTADOS_DO_CADASTRO,
  recusasParaPublicar,
  textoDaRecusaDePublicacao,
  type RecusaDePublicacao,
} from "./estadoDoCadastro";

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
  // Migração 20260830120000 (F0-q). O estado do cadastro é NOSSO no sentido
  // mais forte da palavra: o RevendaMais não o conhece, e o trigger de INSERT
  // sobrescreve para `rascunho` qualquer valor que venha no payload da
  // importação. Publicar é ato do painel, e é por isso que ele entra aqui, e
  // não em `camposGravaveis(origem)`: aquela lista só alarga para o veículo
  // NATIVO, porque `preco` e as fotos SÃO colunas do feed e o sync as
  // reescreveria. `estado_cadastro` não é do feed — vale para todo veículo,
  // venha ele de onde vier. Se ficasse do lado de lá, os 62 carros importados
  // não teriam como ser publicados nem arquivados pelo painel.
  CAMPO_DO_ESTADO,
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
 * Fotos: graváveis só no veículo que nasceu no painel — pelo mesmo motivo do
 * preço, e com a mesma consequência se alguém afrouxar.
 *
 * ---------------------------------------------------------------------------
 * Por que não vale para o carro do feed
 * ---------------------------------------------------------------------------
 * As três colunas SÃO do RevendaMais: o sincronizador as reescreve a cada 6 h
 * (`docs/levantamento-atual.md` §2.4, "o sync continua intocado até a F2").
 * Deixar o painel subir foto num veículo `origem = 'sync'` produziria o pior
 * defeito possível: o carro chega a oito fotos, sai da lista de bloqueados,
 * entra na vitrine — e no ciclo seguinte volta a seis fotos e some, sem erro
 * em lugar nenhum. Ninguém liga o sumiço ao envio de três horas antes.
 *
 * No veículo nativo (migração 20260829130000) esse motivo não existe: a trava
 * garante que o sync nunca toca em linha de `origem = 'painel'`. E é
 * exatamente para ele que o bucket foi criado — a migração F0-p abre dizendo
 * que "sem ele o cadastro nativo cria carro que nunca chega à vitrine, porque
 * a régua de publicação exige 8 fotos e não há de onde tirá-las".
 *
 * ---------------------------------------------------------------------------
 * As três andam juntas
 * ---------------------------------------------------------------------------
 * `whatsapp_images` é a galeria da ficha, o `og:image` e o feed dos portais;
 * `web_full_images` é o card, o hero e a vitrine; `url_imagem` é o degrau de
 * queda do mapper quando os dois arrays estão vazios. Gravar um subconjunto
 * faria as superfícies discordarem sobre qual é a capa — é a mesma razão pela
 * qual `preco` e `preco_original` viajam em par.
 */
export const CAMPOS_DE_FOTO = ["whatsapp_images", "web_full_images", "url_imagem"] as const;

/**
 * Colunas que a escrita LÊ para decidir, e nunca grava.
 *
 * `bloqueiosDePublicacao` precisa das fotos e da origem; `laudo_pericia` já vem
 * em `CAMPOS_NOSSOS`. Sem elas no `select` do estado anterior, a verificação de
 * publicação rodaria sobre um objeto sem `whatsapp_images` — que a régua conta
 * como zero foto e recusaria TODO mundo, inclusive o carro com doze fotos.
 * Errar assim é silencioso: o operador só veria "0 de 8 fotos" sobre uma
 * galeria cheia e concluiria que o painel está quebrado.
 */
export const COLUNAS_LIDAS_PARA_DECIDIR = ["whatsapp_images", "origem"] as const;

/**
 * Os campos graváveis para ESTE veículo — a lista fixa, mais o preço e as
 * fotos quando a linha é do painel.
 *
 * Recebe a origem em vez de consultá-la: quem chama já leu a linha, e uma
 * segunda consulta aqui abriria janela entre a leitura e a escrita.
 */
export function camposGravaveis(origem?: string | null): readonly string[] {
  return origem === "painel"
    ? [...CAMPOS_NOSSOS, ...CAMPOS_DE_PRECO_DO_NATIVO, ...CAMPOS_DE_FOTO]
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
  /**
   * Quem barrou a publicação, quando ela foi barrada — código e motivos.
   *
   * A mensagem de `erro` já nomeia os primeiros; esta lista viaja inteira para
   * a tela poder marcar as linhas exatas. Ausente em toda escrita que não é
   * publicação.
   */
  recusas?: RecusaDePublicacao[];
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

  // Estado fora do vocabulário nunca chega ao banco. O CHECK do Postgres o
  // recusaria de qualquer forma, mas com uma mensagem que ninguém na loja lê —
  // e a rota devolveria 500 sobre o que é erro de 400.
  const estadoPedido = atualizacao[CAMPO_DO_ESTADO];
  if (estadoPedido !== undefined && !ehEstadoDoCadastro(estadoPedido)) {
    return {
      erro: `Estado inválido: "${String(estadoPedido)}". Os válidos são ${ESTADOS_DO_CADASTRO.join(", ")}.`,
      status: 400,
      camposSalvos: [],
      mudancasRegistradas: 0,
    };
  }

  const alvos = ids.map(normalizarId);

  // Estado anterior, lido ANTES do update: é o "NO AR HOJE" que a tela A16
  // compara com o proposto. Reconstruir isso depois exigiria refazer a cadeia
  // inteira de trás para frente. Desde a F0-q ele serve a um segundo uso: é
  // sobre esta leitura que a régua de publicação é conferida.
  const { data: antes, error: erroAntes } = await supabase
    .from("estoque_motors")
    .select(["id", ...CAMPOS_NOSSOS, ...COLUNAS_LIDAS_PARA_DECIDIR].join(","))
    .in("id", alvos);

  // -------------------------------------------------------------------------
  // Publicar exige a régua de fotos cumprida — e a verificação é DAQUI
  // -------------------------------------------------------------------------
  // Este módulo é "o caminho único por onde o painel altera veículo", e as duas
  // rotas (`/api/estoque/[id]` e `/api/estoque/lote`) passam por ele. Pôr o
  // gate numa delas deixaria a outra aberta; pôr nas duas criaria duas réguas
  // que um dia divergem. A checagem da tela é conveniência — esta é a que vale.
  //
  // O lote é ATÔMICO: se um dos selecionados não pode ir ao ar, nenhum vai, e a
  // mensagem diz quais e por quê. Publicar 9 de 12 em silêncio deixaria três
  // carros parados sem ninguém saber, que é pior que o clique recusado.
  if (estadoPedido === "publicado") {
    if (erroAntes || !antes) {
      return {
        erro:
          "Não foi possível conferir a régua de publicação destes veículos" +
          (erroAntes?.message ? `: ${erroAntes.message}` : "") +
          ". Nada foi publicado.",
        status: 500,
        camposSalvos: [],
        mudancasRegistradas: 0,
      };
    }

    // A atualização entra na conta: quem salva o laudo e publica no mesmo PATCH
    // tem de ser julgado pelo valor NOVO. Conferir só o `antes` recusaria uma
    // pendência que a própria chamada estava resolvendo.
    const recusas = recusasParaPublicar(
      (antes as Array<Record<string, unknown>>).map((linha) => ({
        ...linha,
        ...atualizacao,
        id: linha.id as string | number,
      })),
    );
    if (recusas.length > 0) {
      return {
        erro: textoDaRecusaDePublicacao(recusas),
        status: 422,
        camposSalvos: [],
        mudancasRegistradas: 0,
        recusas,
      };
    }
  }

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
