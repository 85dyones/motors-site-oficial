import { ehTabelaOuColunaAusente } from "./erroDeSchema";
import { colunasDaPromocao, recusaDaPromocao } from "./precoPromocional";
import { efetivoDepoisDaEscrita, recusaPorPisoDeCusto } from "./pisoDePreco";
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
 * Preço promocional — o único campo do FEED que o painel grava em veículo de
 * QUALQUER origem, inclusive nos importados do RevendaMais.
 *
 * Parece contradizer as duas listas acima, e não contradiz: elas restringem ao
 * nativo porque o sync reescreveria a coluna no ciclo seguinte. Esse risco
 * morreu por completo na trava total (`20260830120000_f0q`) — o RevendaMais não
 * atualiza mais linha nenhuma, de origem nenhuma. O que sobra é uma pergunta de
 * produto, não de segurança: quem manda no preço de tabela é o RevendaMais
 * (por isso `preco_original` segue só do nativo), mas **quem decide promoção é
 * a loja**.
 *
 * Por que não entrou em `CAMPOS_NOSSOS`: aquela lista promete que "o sync não
 * conhece nenhum deles", e o sync conhece esta coluna — ele a preenche a cada
 * importação. Enfiá-la lá tornaria o comentário mentira para quem ler depois.
 *
 * E por que isto não seria útil se valesse só para o nativo: em 2026-08-31 os
 * 104 veículos da base eram `origem = 'sync'`, os 38 ativos inclusive. Uma
 * promoção que só funcionasse no carro nativo não funcionaria em carro nenhum.
 *
 * **Não é operação de lote** — a mesma razão do `preco_compra`: o valor é de um
 * carro só, e o preço efetivo derivado depende do `preco_original` de cada
 * linha. As duas rotas barram, cada uma no seu lugar.
 */
export const CAMPO_DA_PROMOCAO = "preco_promocional";

/**
 * Fotos: graváveis em veículo de QUALQUER origem, desde 2026-09-01 (F0.5).
 *
 * ---------------------------------------------------------------------------
 * A condição que existia aqui, e por que ela caiu
 * ---------------------------------------------------------------------------
 * Até aqui estas três colunas só eram graváveis em `origem = 'painel'`. O
 * motivo escrito era: *"o sincronizador as reescreve a cada 6 h"* — e o defeito
 * temido era real e bem descrito: o carro chega a oito fotos, entra na vitrine,
 * e no ciclo seguinte volta a seis e some, sem erro em lugar nenhum.
 *
 * **Esse motivo deixou de existir, duas vezes.** A trava total do sync
 * (`20260829130000_f0k` + `20260830120000_f0q:115-120`) tirou do RevendaMais o
 * poder de atualizar qualquer coluna de qualquer linha — inclusive as que ele
 * mesmo importou. E em 31/08 as fotos dos ativos saíram do `s3.carro57.com.br`
 * para o nosso bucket: 37 dos 38 publicados à venda. A condição sobreviveu à
 * razão dela por dois dias, e o `docs/PLANO_F0.md` já tinha registrado a
 * conclusão sem que o código a seguisse — *"sem sobrescrita não há o que
 * blindar, e a galeria vale para todo o estoque sem migração de override
 * nenhuma"*.
 *
 * O custo de manter a condição não era teórico. Em 01/09, na vitrine REAL,
 * quatro carros estavam abaixo da porta de quatro fotos — Kombi Standard (0),
 * Parati CL (1), Sandero Expression (1) e Voyage 1.0 (1) — e outros três no ar
 * com ficha incompleta. Em todos, a pendência mandava o operador resolver no
 * RevendaMais, num painel que não podia recebê-la de volta.
 *
 * ⚠️ Para quem for conferir: `npm run auditoria:estoque` NÃO carrega
 * `.env.local`, e sem as variáveis `getEstoque()` cai no `MOCK_ESTOQUE` — os
 * cinco carros fictícios de `supabase.ts:22-90` (o Porsche de R$ 998.000 é um
 * deles). Rodar sem env produz um relatório convincente sobre um estoque que
 * não existe. Exportar as três variáveis antes.
 *
 * ---------------------------------------------------------------------------
 * O que continua sendo verdade
 * ---------------------------------------------------------------------------
 * Quem decide QUEM sobe foto continua sendo a matriz A17
 * (`ACAO_DO_CAMPO_DE_VEICULO`, linha "Adicionar e reordenar fotos") — a régua
 * de PAPEL nunca foi esta, e afrouxar a de COLUNA não a afrouxa.
 *
 * E misturar foto nossa com foto do carro57 no mesmo carro é seguro: a faxina
 * do bucket passa por `caminhoDaUrlPublica`, que devolve `null` para URL que
 * não é nossa. Removemos do Storage só o que subimos.
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
export const COLUNAS_LIDAS_PARA_DECIDIR = [
  "whatsapp_images",
  "origem",
  // `preco_original` entra pela promoção: o desconto é medido contra ele e o
  // preço efetivo é derivado dele. Ler do BANCO, e não do corpo da requisição,
  // é o que impede alguém de mandar `{preco_original: 999999, preco_promocional:
  // 1}` e fabricar um desconto de 99% contra uma base que não existe.
  "preco_original",
] as const;

/**
 * Os campos graváveis para ESTE veículo — a lista fixa e as fotos sempre, mais
 * o preço de tabela quando a linha é do painel.
 *
 * Recebe a origem em vez de consultá-la: quem chama já leu a linha, e uma
 * segunda consulta aqui abriria janela entre a leitura e a escrita.
 *
 * `origem` continua importando, e só por causa de `CAMPOS_DE_PRECO_DO_NATIVO`.
 * Não é limitação técnica — a trava impediria o sync de desfazer o preço do
 * mesmo jeito que impede o resto. É a decisão de produto do
 * `docs/PROPRIEDADE_DOS_CAMPOS.md`: enquanto o carro for do RevendaMais, quem
 * define o preço de LISTA é ele; quem define PROMOÇÃO é a loja, em qualquer
 * origem (`CAMPO_DA_PROMOCAO`). Rever isso é assunto do PR 5 da F0.5, e depende
 * de existir conferência que acuse divergência de preço — senão o painel vira
 * fonte única sem saber que virou.
 */
export function camposGravaveis(origem?: string | null): readonly string[] {
  const base = [...CAMPOS_NOSSOS, CAMPO_DA_PROMOCAO, ...CAMPOS_DE_FOTO];
  return origem === "painel" ? [...base, ...CAMPOS_DE_PRECO_DO_NATIVO] : base;
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
  /**
   * `podeVerCusto` decide se a recusa do piso NOMEIA o preço de compra.
   *
   * Booleano, e não o perfil, para este módulo não depender de `permissoes` —
   * quem chama já resolveu a matriz e sabe a resposta. O padrão é `false`
   * (mensagem genérica): errar para o lado de não vazar custo, como o
   * cabeçalho de `permissoes.ts` manda.
   */
  opcoes?: { podeVerCusto?: boolean },
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
  // Lê TUDO que a escrita pode tocar, e não só `CAMPOS_NOSSOS`.
  //
  // Enquanto o select conhecia só a ficha própria, salvar preço ou foto num
  // veículo nativo gravava no histórico uma mudança de `null` para o valor —
  // porque `linha[campo]` vinha `undefined` e a comparação com o valor novo
  // sempre diferia. Medido em produção em 2026-08-31: um PATCH que repetia o
  // preço promocional que já estava lá registrou "preco_promocional: null →
  // 65900" e "preco: null → 65900", duas mudanças que não aconteceram.
  //
  // Isso derrubava a promessa que abre esta função — "salvar sem alterar nada
  // não pode poluir a trilha" — justamente na pergunta que a trilha existe para
  // responder: quem mexeu no preço deste carro.
  const colunasDoAntes = Array.from(
    new Set([
      "id",
      ...CAMPOS_NOSSOS,
      CAMPO_DA_PROMOCAO,
      ...CAMPOS_DE_PRECO_DO_NATIVO,
      ...CAMPOS_DE_FOTO,
      ...COLUNAS_LIDAS_PARA_DECIDIR,
    ]),
  );
  const { data: antes, error: erroAntes } = await supabase
    .from("estoque_motors")
    .select(colunasDoAntes.join(","))
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

  // ---------------------------------------------------------------------------
  // Promoção: valida contra a base do BANCO e deriva o preço efetivo
  // ---------------------------------------------------------------------------
  // As três colunas de preço andam juntas (ver `lib/precoPromocional.ts`).
  // Gravar `preco_promocional` sozinha deixaria a vitrine ordenando pelo preço
  // velho e os "similares" comparando contra um valor que não está mais em
  // lugar nenhum — o tipo de erro que não aparece no painel, só no site.
  let paraGravar = atualizacao;
  if (CAMPO_DA_PROMOCAO in atualizacao) {
    // Um carro por vez. O preço efetivo derivado depende do `preco_original` de
    // CADA linha, e um único `update ... in (ids)` grava o mesmo valor em todas:
    // aplicar a mesma promoção a dez carros de preços diferentes produziria dez
    // descontos que ninguém escolheu. A rota de lote já barra antes; isto aqui
    // é a rede, porque esta função é o caminho único e um dia terá outra boca.
    if (alvos.length !== 1) {
      return {
        erro: "Preço promocional é de um veículo por vez — o desconto é medido contra o preço de cada carro.",
        status: 400,
        camposSalvos: [],
        mudancasRegistradas: 0,
      };
    }
    if (erroAntes || !antes || (antes as unknown[]).length === 0) {
      return {
        erro:
          "Não foi possível ler o preço anunciado deste veículo para conferir a promoção" +
          (erroAntes?.message ? `: ${erroAntes.message}` : "") +
          ". Nada foi alterado.",
        status: 500,
        camposSalvos: [],
        mudancasRegistradas: 0,
      };
    }

    const linha = (antes as Array<Record<string, unknown>>)[0];
    // A base é a do banco, salvo quando a MESMA chamada está mudando o preço
    // anunciado (veículo nativo, campo e promoção salvos juntos). Conferir só
    // contra o banco recusaria uma promoção válida contra o preço novo.
    const baseCrua =
      "preco_original" in atualizacao ? atualizacao.preco_original : linha.preco_original;
    const base = baseCrua === null || baseCrua === undefined ? null : Number(baseCrua);

    const recusa = recusaDaPromocao(atualizacao[CAMPO_DA_PROMOCAO] as number | null, base);
    if (recusa) {
      return { erro: recusa, status: 422, camposSalvos: [], mudancasRegistradas: 0 };
    }

    paraGravar = {
      ...atualizacao,
      ...colunasDaPromocao(atualizacao[CAMPO_DA_PROMOCAO] as number | null, base),
    };
  }

  // ---------------------------------------------------------------------------
  // O piso: nenhum carro sai por menos do que entrou
  // ---------------------------------------------------------------------------
  // Régua inteira de alçada de preço, por decisão do dono em 2026-08-31 — não há
  // banda percentual, só este chão. Ver `lib/pisoDePreco.ts`.
  //
  // Julga o preço EFETIVO depois da escrita, e não o de tabela: promoção que
  // afunda abaixo do custo é o caminho que o campo novo abriu, e comparar
  // contra `preco_original` a deixaria passar por baixo.
  //
  // Vale para QUALQUER escrita que mexa em preço — promoção, preço do nativo, ou
  // as duas juntas —, e também quando é o CUSTO que está sendo lançado sobre um
  // preço que já estava no ar.
  const mexeEmPreco =
    CAMPO_DA_PROMOCAO in paraGravar ||
    "preco" in paraGravar ||
    "preco_original" in paraGravar ||
    "preco_compra" in paraGravar;
  if (mexeEmPreco && antes && !erroAntes) {
    for (const linha of antes as Array<Record<string, unknown>>) {
      const custo = "preco_compra" in paraGravar ? paraGravar.preco_compra : linha.preco_compra;
      const recusa = recusaPorPisoDeCusto(
        efetivoDepoisDaEscrita(linha, paraGravar),
        custo as number | null,
        { podeVerCusto: opcoes?.podeVerCusto === true },
      );
      if (recusa) {
        return {
          erro: alvos.length > 1 ? `Veículo ${linha.id}: ${recusa}` : recusa,
          status: 422,
          camposSalvos: [],
          mudancasRegistradas: 0,
        };
      }
    }
  }

  const { error } = await supabase.from("estoque_motors").update(paraGravar).in("id", alvos);

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

  /**
   * Igualdade por campo — numérica nas colunas numéricas, textual no resto.
   *
   * O Postgres devolve `numeric` como STRING: a coluna que vale 65900 volta do
   * PostgREST como `"65900.00"`. Comparada com o `65900` que o formulário
   * manda, `String()` de um lado dá "65900.00" e do outro "65900" — diferentes,
   * e toda gravação de preço registrava uma mudança que não houve.
   *
   * A conversão é restrita a uma lista, e não aplicada a tudo: em campo de
   * texto ela tornaria "007" igual a "7", e a placa e o chassi passam por aqui.
   */
  const NUMERICAS = new Set([
    "preco",
    "preco_original",
    "preco_promocional",
    "preco_compra",
    "donos_anteriores",
  ]);
  const igual = (campo: string, antigo: unknown, novo: unknown) => {
    if (NUMERICAS.has(campo)) {
      const a = antigo === null || antigo === undefined || antigo === "" ? null : Number(antigo);
      const b = novo === null || novo === undefined || novo === "" ? null : Number(novo);
      // `NaN` não é comparável: cai na régua textual em vez de mentir "igual".
      if (!(a !== null && Number.isNaN(a)) && !(b !== null && Number.isNaN(b))) return a === b;
    }
    return norm(antigo) === norm(novo);
  };

  const mudancas: Array<Record<string, unknown>> = [];
  for (const linha of (antes ?? []) as Array<Record<string, unknown>>) {
    // `paraGravar`, e não `atualizacao`: o `preco` derivado da promoção é uma
    // alteração de preço como qualquer outra, e precisa aparecer para quem
    // depois perguntar "quem mexeu no preço deste carro?".
    for (const [campo, novo] of Object.entries(paraGravar)) {
      if (igual(campo, linha[campo], novo)) continue;
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

  return { camposSalvos: Object.keys(paraGravar), mudancasRegistradas: mudancas.length };
}
