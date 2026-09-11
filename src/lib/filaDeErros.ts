import { perfisDe } from "./permissoes";

/**
 * A fila de triagem de exceções — o que a tela `/admin/erros` calcula.
 *
 * ---------------------------------------------------------------------------
 * Este arquivo não fala com o banco
 * ---------------------------------------------------------------------------
 * Aqui só entram constantes, tipos e função pura. As consultas e a porta de
 * permissão vivem em `filaDeErros-servidor.ts`, e a divisão não é estética: o
 * `SidebarNav` é componente de CLIENTE e precisa de `PERFIS_QUE_TRIAM_ERROS`
 * para desenhar o item do trilho. Se a constante morasse ao lado de
 * `createServerSupabaseClient`, o import arrastaria `next/headers` para dentro
 * do pacote do navegador — e o trilho pararia de compilar por causa de uma
 * lista de papéis.
 *
 * ---------------------------------------------------------------------------
 * Quem abre, quando, e que decisão sai
 * ---------------------------------------------------------------------------
 * Quem abre: o **dono**. Quando: depois de o WhatsApp avisar de uma falha, ou
 * na volta de olhar o dia. Decisão que sai: **corrigir agora** (abrir o grupo,
 * ler o stack, achar o commit pelo `release`) ou **marcar como resolvido**
 * (tirar da fila para o de amanhã aparecer sozinho).
 *
 * ---------------------------------------------------------------------------
 * A régua que o BANCO impõe, e que manda no desenho
 * ---------------------------------------------------------------------------
 * `public.erros` (migração `20260910120000_erros_do_site.sql`, que chega no PR
 * da coleta) dá a `authenticated`:
 *
 *     grant select, update (resolvido_em, resolvido_por) on public.erros
 *
 * **UPDATE por COLUNA.** Não há policy de INSERT nem de DELETE — quem grava é a
 * chave de serviço. Isto não é detalhe de infraestrutura: é o que garante que a
 * tela que EXIBE a prova do defeito não consegue reescrevê-la. Por isso nada
 * aqui monta carga de escrita à mão; `cargaDeResolucao()` é a única, e ela
 * devolve exatamente as duas colunas permitidas.
 *
 * Ler é com o cliente de SESSÃO (`createServerSupabaseClient`). A chave de
 * serviço passaria por cima da RLS e faria a tela mostrar erro de outra org no
 * dia em que houver a segunda — a RLS é a régua, não um obstáculo a contornar.
 *
 * ---------------------------------------------------------------------------
 * Por que a lista é agrupada, e por que a janela é limitada
 * ---------------------------------------------------------------------------
 * Uma exceção em página quente grava uma linha por requisição (com carência de
 * 10 s por hash — o resto viaja em `suprimidas`). Linha a linha, a fila vira
 * uma lista de mil cópias do mesmo defeito. O que se tria é o GRUPO, e o grupo
 * é o `hash_agrupamento`.
 *
 * O agrupamento acontece AQUI, em memória, sobre uma janela das ocorrências
 * mais recentes — e não num `group by` do banco — porque um `group by` exigiria
 * uma função nova em migração, e a tabela já está em produção. O custo dessa
 * escolha está escrito na tela: o rodapé diz sobre quantas ocorrências o
 * agrupamento foi feito e quantas existem no recorte. Lista cortada sem aviso é
 * indistinguível de lista completa.
 *
 * **`stack` fica FORA da projeção da lista.** É a coluna cara: o teto dela é
 * 8000 caracteres contra 2000 da `mensagem`. Uma janela de 200 ocorrências com
 * stack custaria até 1,6 MB por abertura da tela, num projeto que já bateu na
 * cota de egress do plano Free. O stack só é lido no detalhe de um grupo, onde
 * quem abriu pediu por ele.
 */

/* ────────────────────────────────────────────────────────────────────────
   Vocabulário e réguas
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Quem enxerga a fila.
 *
 * O banco libera a leitura para **todo** o staff (`is_staff(auth.uid())`), e a
 * tela é mais estreita que ele de propósito — três razões:
 *
 * 1. A decisão que sai daqui ("corrigir agora") é de quem mexe no código.
 * 2. `mensagem` e `stack` podem carregar PII por acidente: o próprio
 *    `comment on table` avisa que um erro do PostgREST cita valores
 *    (`Key (telefone)=(5541…) already exists`). A A17 já mantém Marketing longe
 *    do contato individual do lead — uma stack seria a porta lateral.
 * 3. "O que for negado some da interface, não fica cinza" (A17): o trilho e a
 *    página usam ESTA constante, então as duas camadas não têm como divergir.
 *
 * Não há linha na `MATRIZ_DE_PERMISSOES` para "triar erro do site", e não fui
 * eu que vou inventá-la: cada acréscimo àquela matriz carrega um pedido datado
 * do dono. Enquanto ele não existir, a régua é esta lista — conservadora, no
 * sentido que o cabeçalho de `permissoes.ts` manda (errar para baixo).
 */
export const PERFIS_QUE_TRIAM_ERROS = ["admin"] as const;

/** Quantas ocorrências a lista lê de uma vez. A janela é o botão de custo. */
export const JANELA_PADRAO = 200;
export const JANELAS = [200, 500, 1000] as const;

/** Ocorrências por página no detalhe de um grupo — aqui o `stack` vem junto. */
export const POR_PAGINA_NO_DETALHE = 20;

/** O recorte com que a tela abre: o que está aberto, no ar, hoje. */
export const AMBIENTE_PADRAO = "production";

/**
 * O vocabulário de `ambiente` que o gravador usa (`VERCEL_ENV`), mais o default
 * da coluna. A coluna não tem CHECK — o vocabulário é do fornecedor, e recusar
 * um valor novo dele perderia o erro —, então o seletor da tela soma a esta
 * lista o que de fato apareceu na janela lida. Assim nenhum ambiente fica
 * inalcançável só porque a Vercel inventou um nome.
 */
export const AMBIENTES_CONHECIDOS = [
  "production",
  "preview",
  "development",
  "desconhecido",
] as const;

/** O CHECK `erros_origem_valida` do banco, em TypeScript. */
export const ORIGENS_DE_ERRO = ["navegador", "servidor"] as const;

export const ROTULO_DA_ORIGEM: Record<string, string> = {
  navegador: "Navegador",
  servidor: "Servidor",
};

export const ROTULO_DA_NATUREZA: Record<string, string> = {
  quebra: "Quebra",
  // `ambos` é a quebra que também foi para o WhatsApp. Quem abre a fila
  // precisa saber que este já acordou alguém.
  ambos: "Quebra + aviso",
};

/**
 * A FORMA do hash, igual à do CHECK `erros_hash_em_hex`.
 *
 * Vale para a rota de resolver: o `[hash]` da URL entra num `.eq()`, e aceitar
 * qualquer string ali seria deixar a tela mandar lixo para o PostgREST.
 */
const FORMA_DO_HASH = /^[0-9a-f]{8,64}$/;

export function ehHashDeAgrupamento(valor: unknown): valor is string {
  return typeof valor === "string" && FORMA_DO_HASH.test(valor);
}

/* ────────────────────────────────────────────────────────────────────────
   Projeções — a lista sem `stack`, o detalhe com ele
   ──────────────────────────────────────────────────────────────────────── */

/**
 * As colunas da LISTA. `stack` não está aqui, e é a linha mais importante
 * deste arquivo — ver o cabeçalho, seção de egress.
 */
export const CAMPOS_DA_LISTA = [
  "id",
  "criado_em",
  "origem",
  "natureza",
  "assunto",
  "mensagem",
  "rota",
  "ambiente",
  "digest",
  "hash_agrupamento",
  "suprimidas",
  "resolvido_em",
] as const;

export const SELECT_DA_LISTA = CAMPOS_DA_LISTA.join(",");

/** As colunas do DETALHE — aqui o `stack` entra, porque foi pedido. */
export const CAMPOS_DO_DETALHE = [
  ...CAMPOS_DA_LISTA,
  "stack",
  "metodo",
  "url",
  "navegador",
  "release",
  "ag_uid",
  "resolvido_por",
] as const;

export const SELECT_DO_DETALHE = CAMPOS_DO_DETALHE.join(",");

export interface OcorrenciaDaLista {
  id: string;
  criado_em: string;
  origem: string;
  natureza: string;
  assunto: string;
  mensagem: string;
  rota: string | null;
  ambiente: string;
  digest: string | null;
  hash_agrupamento: string;
  suprimidas: number;
  resolvido_em: string | null;
}

export interface OcorrenciaDoDetalhe extends OcorrenciaDaLista {
  stack: string | null;
  metodo: string | null;
  url: string | null;
  navegador: string | null;
  release: string | null;
  ag_uid: string | null;
  resolvido_por: string | null;
}

/* ────────────────────────────────────────────────────────────────────────
   Agrupamento — a peça pura
   ──────────────────────────────────────────────────────────────────────── */

export interface GrupoDeErros {
  hash: string;
  /** Do exemplar mais RECENTE: é o que descreve o defeito de hoje. */
  assunto: string;
  mensagem: string;
  rota: string | null;
  origens: string[];
  ambientes: string[];
  /**
   * `quebra` e/ou `ambos`. `ambos` significa que este erro TAMBÉM foi para o
   * WhatsApp — quem abre a fila precisa saber quais já acordaram alguém, e
   * quais estão aqui esperando alguém notar.
   */
  naturezas: string[];
  /**
   * Os `digest` distintos vistos dentro do grupo.
   *
   * Mais de um aqui significa **defeitos diferentes na mesma linha da lista**.
   * Acontece de propósito no `navegador:boundary`: em produção a mensagem do
   * React é fixa e o stack tem uma linha só, então todo erro de servidor visto
   * pelo navegador colapsa num hash só. O `digest` é o que os separa, e é por
   * isso que ele aparece na lista e vira filtro no detalhe.
   */
  digests: string[];
  /** Linhas do grupo DENTRO da janela lida. */
  ocorrencias: number;
  /** Soma de `suprimidas` — o que a carência de 10 s engoliu. */
  suprimidas: number;
  /** `ocorrencias + suprimidas`: quantas vezes o defeito aconteceu de fato. */
  vezes: number;
  abertas: number;
  resolvidas: number;
  primeira: string;
  ultima: string;
  /** Sem nenhuma ocorrência aberta na janela. */
  resolvido: boolean;
}

/** ISO → milissegundos, com a data inválida caindo para o começo dos tempos. */
function emMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Junta as ocorrências por `hash_agrupamento`.
 *
 * Ordem de saída: **abertos primeiro**, depois pela última ocorrência (mais
 * recente antes). A primeira metade é a que faz a tela ser uma fila de
 * trabalho: um grupo resolvido que voltou a acontecer sobe sozinho, porque a
 * linha nova nasce com `resolvido_em` nulo.
 */
export function agruparErros(ocorrencias: OcorrenciaDaLista[]): GrupoDeErros[] {
  const porHash = new Map<string, GrupoDeErros>();
  // O exemplar mais recente de cada grupo decide assunto, mensagem e rota. Sem
  // guardar o instante dele, uma janela que chegasse fora de ordem deixaria a
  // amostra ser a primeira linha lida, não a última acontecida.
  const instanteDaAmostra = new Map<string, number>();

  for (const o of ocorrencias) {
    const quando = emMs(o.criado_em);
    const atual = porHash.get(o.hash_agrupamento);

    if (!atual) {
      porHash.set(o.hash_agrupamento, {
        hash: o.hash_agrupamento,
        assunto: o.assunto,
        mensagem: o.mensagem,
        rota: o.rota,
        origens: [o.origem],
        ambientes: [o.ambiente],
        naturezas: [o.natureza],
        digests: o.digest ? [o.digest] : [],
        ocorrencias: 1,
        suprimidas: o.suprimidas ?? 0,
        vezes: 1 + (o.suprimidas ?? 0),
        abertas: o.resolvido_em ? 0 : 1,
        resolvidas: o.resolvido_em ? 1 : 0,
        primeira: o.criado_em,
        ultima: o.criado_em,
        resolvido: Boolean(o.resolvido_em),
      });
      instanteDaAmostra.set(o.hash_agrupamento, quando);
      continue;
    }

    atual.ocorrencias += 1;
    atual.suprimidas += o.suprimidas ?? 0;
    atual.vezes += 1 + (o.suprimidas ?? 0);
    if (o.resolvido_em) atual.resolvidas += 1;
    else atual.abertas += 1;
    atual.resolvido = atual.abertas === 0;

    if (!atual.origens.includes(o.origem)) atual.origens.push(o.origem);
    if (!atual.ambientes.includes(o.ambiente)) atual.ambientes.push(o.ambiente);
    if (!atual.naturezas.includes(o.natureza)) atual.naturezas.push(o.natureza);
    if (o.digest && !atual.digests.includes(o.digest)) atual.digests.push(o.digest);

    if (quando < emMs(atual.primeira)) atual.primeira = o.criado_em;
    if (quando > emMs(atual.ultima)) atual.ultima = o.criado_em;

    if (quando >= (instanteDaAmostra.get(o.hash_agrupamento) ?? 0)) {
      instanteDaAmostra.set(o.hash_agrupamento, quando);
      atual.assunto = o.assunto;
      atual.mensagem = o.mensagem;
      atual.rota = o.rota;
    }
  }

  return [...porHash.values()].sort((a, b) => {
    if (a.resolvido !== b.resolvido) return a.resolvido ? 1 : -1;
    return emMs(b.ultima) - emMs(a.ultima);
  });
}

/* ────────────────────────────────────────────────────────────────────────
   Formatação — números em tabular-nums na tela, texto daqui
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Data e hora **no relógio da loja**.
 *
 * O fuso explícito não é preciosismo: o servidor da Vercel roda em UTC, e sem
 * ele a fila diria 17:03 para um erro das 14:03. "Quando aconteceu" é metade da
 * pergunta desta tela.
 */
export function formatarMomento(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Quanto tempo faz — "agora", "12 min", "3 h", "2 dias". */
export function desdeQuando(iso: string | null | undefined, agora = new Date()): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";

  const minutos = Math.floor((agora.getTime() - t) / 60000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas} h`;

  const dias = Math.floor(horas / 24);
  return `${dias} ${dias === 1 ? "dia" : "dias"}`;
}

export function formatarContagem(n: number): string {
  return n.toLocaleString("pt-BR");
}

/* ────────────────────────────────────────────────────────────────────────
   O vazio — e por que ele precisa de três textos
   ──────────────────────────────────────────────────────────────────────── */

export interface LeituraDoVazio {
  titulo: string;
  detalhe: string;
  /** Vermelho só onde há decisão: aqui, "ninguém está olhando". */
  alerta: boolean;
}

/**
 * O que uma lista vazia significa.
 *
 * "Nenhum erro registrado" e "a coleta está desligada" são frases MUITO
 * diferentes, e confundi-las é como o motor do Ciclo passou semanas
 * respondendo 401 sem ninguém perceber: ausência é o defeito que não grita.
 *
 * O que dá para saber com certeza, do lado do servidor, é o interruptor —
 * `OBSERVABILIDADE` (sem `NEXT_PUBLIC_`), a mesma env que o gravador consulta
 * antes de cada INSERT. O que NÃO dá para saber é se o gravador está no ar e
 * funcionando: a tela lê a tabela, não o processo que escreve nela. Por isso o
 * terceiro texto declara a ambiguidade em vez de escolher um lado.
 */
export function explicarVazio(estado: {
  coletaLigada: boolean;
  comRecorte: boolean;
  totalSemRecorte: number | null;
}): LeituraDoVazio {
  if (!estado.coletaLigada) {
    return {
      titulo: "A coleta está desligada.",
      detalhe:
        "Nada é gravado enquanto a variável OBSERVABILIDADE não valer 1 no ambiente. " +
        "Esta lista vazia não diz que o site está sem erro — diz que ninguém está olhando.",
      alerta: true,
    };
  }

  if (estado.comRecorte && (estado.totalSemRecorte ?? 0) > 0) {
    return {
      titulo: "Nenhum erro neste recorte.",
      detalhe:
        `Há ${formatarContagem(estado.totalSemRecorte ?? 0)} ocorrência(s) registrada(s) ` +
        "fora dele — troque o filtro ou veja tudo.",
      alerta: false,
    };
  }

  return {
    titulo: "Nenhum erro registrado.",
    detalhe:
      "A coleta está ligada e a tabela está vazia. Isso tem duas leituras, e esta tela " +
      "não distingue as duas: ou nada quebrou dentro da janela de retenção (90 dias), " +
      "ou o gravador não está chegando ao banco. Para separá-las, force um erro numa " +
      "rota de teste e volte aqui.",
    alerta: false,
  };
}

/**
 * O interruptor da coleta, lido do servidor.
 *
 * É a MESMA condição que o gravador aplica (`process.env.OBSERVABILIDADE !==
 * "1"` → não grava). Está repetida aqui, e não importada, porque o gravador
 * chega noutro PR — quando ele entrar, esta função é o ponto único para passar
 * a perguntar a ele.
 */
export function coletaDeErrosLigada(): boolean {
  return process.env.OBSERVABILIDADE === "1";
}

/* ────────────────────────────────────────────────────────────────────────
   A escrita — duas colunas, e só
   ──────────────────────────────────────────────────────────────────────── */

export interface CargaDeResolucao {
  resolvido_em: string | null;
  resolvido_por: string | null;
}

/**
 * O corpo do UPDATE. Exatamente as duas colunas que o GRANT permite.
 *
 * `resolvido_por` vem de `auth.uid()` do lado do servidor e NUNCA do corpo da
 * requisição — o `comment on column` da migração é explícito: nada no banco
 * amarra esse valor ao autor, então quem amarra é esta camada. Aceitá-lo do
 * cliente deixaria qualquer staff atribuir a resolução a um colega.
 *
 * Reabrir zera os dois. Não é "desfazer com histórico": a linha de erro é a
 * prova do defeito e ela não se reescreve — o que se reabre é a TRIAGEM, e o
 * registro de quem tinha fechado antes some junto, porque um resolvedor gravado
 * num erro que voltou a estar aberto seria mentira.
 */
export function cargaDeResolucao(
  resolver: boolean,
  uid: string,
  agora: Date = new Date(),
): CargaDeResolucao {
  return resolver
    ? { resolvido_em: agora.toISOString(), resolvido_por: uid }
    : { resolvido_em: null, resolvido_por: null };
}

/* ────────────────────────────────────────────────────────────────────────
   A régua de quem tria — a mesma para o trilho, a página e a rota
   ──────────────────────────────────────────────────────────────────────── */

/** Este conjunto de papéis tria erro? */
export function podeTriarErros(
  origem: string | string[] | { role?: string | null; papeis?: string[] | null } | null | undefined,
): boolean {
  const perfis = perfisDe(origem);
  return perfis.some((p) => (PERFIS_QUE_TRIAM_ERROS as readonly string[]).includes(p));
}

/* ────────────────────────────────────────────────────────────────────────
   O recorte da lista
   ──────────────────────────────────────────────────────────────────────── */

export interface FiltrosDaFila {
  /** "" = as duas origens. */
  origem: string;
  /** "" = todos os ambientes. */
  ambiente: string;
  estado: "abertos" | "todos";
  janela: number;
  /** Recorte por `digest` — o que separa defeitos dentro de um grupo gordo. */
  digest?: string;
}

/**
 * O recorte é mais estreito que "tudo o que existe"?
 *
 * Serve a UMA pergunta: o vazio da tela é culpa do filtro? Note que o padrão
 * (abertos, em produção) JÁ é um recorte — quem chega na tela e não vê nada
 * está vendo o resultado de um filtro que não escolheu, e o texto do vazio
 * precisa dizer isso.
 */
export function temRecorte(f: FiltrosDaFila): boolean {
  return Boolean(f.origem) || Boolean(f.ambiente) || Boolean(f.digest) || f.estado === "abertos";
}

/**
 * Lê os parâmetros da URL com o vocabulário fechado.
 *
 * Filtro vive na URL, e não em estado de componente, por dois motivos: a
 * leitura é do servidor (não há o que sincronizar), e o endereço da tela passa
 * a ser compartilhável — "olha esse erro aqui" vira um link com o recorte
 * dentro.
 */
export function filtrosDaBusca(busca: Record<string, string | string[] | undefined>): FiltrosDaFila {
  const um = (chave: string): string => {
    const v = busca[chave];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };

  const origem = um("origem");
  const ambiente = um("ambiente");
  const estado = um("estado");
  const janela = Number(um("janela"));
  const digest = um("digest");

  return {
    origem: (ORIGENS_DE_ERRO as readonly string[]).includes(origem) ? origem : "",
    // `ambiente=todos` é como a URL diz "sem recorte de ambiente" — string
    // vazia na query seria indistinguível de parâmetro ausente, que é o padrão
    // (produção).
    ambiente: ambiente === "todos" ? "" : ambiente || AMBIENTE_PADRAO,
    estado: estado === "todos" ? "todos" : "abertos",
    janela: (JANELAS as readonly number[]).includes(janela) ? janela : JANELA_PADRAO,
    digest: ehHashDeAgrupamento(digest) ? digest : undefined,
  };
}

export type ResultadoDaFila =
  | {
      ok: true;
      grupos: GrupoDeErros[];
      /** Linhas que entraram no agrupamento. */
      lidas: number;
      /** Quantas existem no recorte — do `count` do PostgREST, não estimado. */
      totalNoRecorte: number | null;
      /** Só consultado quando o recorte veio vazio: o total sem filtro nenhum. */
      totalSemRecorte: number | null;
      /** Os ambientes que de fato apareceram — alimenta o seletor. */
      ambientesVistos: string[];
    }
  | { ok: false; motivo: string };

export type ResultadoDoGrupo =
  | {
      ok: true;
      ocorrencias: OcorrenciaDoDetalhe[];
      total: number | null;
      pagina: number;
      /**
       * Ocorrências AINDA ABERTAS no grupo inteiro — não só nesta página.
       *
       * É o que decide se o botão oferece "marcar resolvido" ou "reabrir".
       * Deduzi-lo da página seria errar sempre que o grupo não couber nela: um
       * grupo com 300 linhas resolvidas e uma aberta na página 15 apareceria
       * como resolvido, e o clique seguinte reabriria o que ninguém fechou.
       */
      abertas: number | null;
      /** Os digests distintos do grupo, dentro desta página. */
      digestsNaPagina: string[];
    }
  | { ok: false; motivo: string };
