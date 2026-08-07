/**
 * Reputação no Google — lida direto da API, no servidor, uma vez por dia.
 *
 * A primeira versão disto tinha duas tabelas no Supabase, RLS, migração e um
 * workflow do n8n sincronizando. Fazia sentido para a Business Profile API, que
 * traz o acervo inteiro mas exige aprovação do Google e OAuth. Para o que a
 * home mostra — a nota e um punhado de avaliações — era infraestrutura demais
 * para o problema.
 *
 * Aqui o servidor chama o Places API e o cache do próprio Next segura o
 * resultado por 24 horas. Sem tabela, sem migração, sem workflow, sem chave de
 * escrita circulando. O visitante continua sem falar com o Google: quem chama é
 * o servidor, na renderização.
 *
 * O que se perde em relação ao caminho anterior, e é bom saber:
 *
 *  · o Places API devolve **no máximo 5 avaliações**, e não dá para escolher
 *    quais;
 *  · resposta do dono não vem — só a Business Profile API tem esse campo.
 *
 * Se um dia isso apertar, o caminho é a Business Profile API. `PainelReputacao`
 * é a fronteira: trocar a origem não mexe no componente.
 *
 * Regras de exibição que este módulo carrega:
 *
 *  · A média é a que a API devolve, nunca a média das avaliações que couberam
 *    na resposta — são 5 de dezenas, e calcular sobre elas publicaria um número
 *    que não bate com o perfil que o cliente vai conferir.
 *  · A ordenação é por data, sem filtro por nota. Mostrar só as cinco estrelas
 *    é proibido pelas regras do Google e é a mesma mentira que a regra 6 do
 *    CLAUDE.md proíbe na vitrine: ordenar é curadoria, esconder é fraude.
 *  · Sem dado, a home não renderiza seção nenhuma. Nunca nota fabricada.
 */

export type AvaliacaoGoogle = {
  id: string;
  autorNome: string;
  autorFotoUrl: string | null;
  nota: number;
  comentario: string | null;
  publicadaEm: string;
  /**
   * Sempre `null` no Places API — o campo existe porque o componente já sabe
   * exibi-lo e porque é o que a Business Profile API traria, se um dia a
   * origem mudar.
   */
  respostaTexto: string | null;
  respondidaEm: string | null;
};

export type ReputacaoGoogle = {
  notaMedia: number;
  totalAvaliacoes: number;
  urlPerfil: string | null;
};

export type PainelReputacao = {
  reputacao: ReputacaoGoogle;
  avaliacoes: AvaliacaoGoogle[];
};

/** Quantas avaliações a home mostra. O Places API já devolve no máximo 5. */
export const MAX_AVALIACOES_NA_HOME = 6;

/**
 * Uma leitura por dia. Avaliação não chega de minuto em minuto, e é isto que
 * mantém a conta em torno de 30 chamadas por mês — dentro da franquia gratuita
 * com folga, em vez de uma chamada por visitante.
 */
const VALIDADE_DO_CACHE_S = 86_400;

const CAMPOS = [
  "rating",
  "userRatingCount",
  "googleMapsUri",
  "reviews.name",
  "reviews.rating",
  "reviews.text",
  "reviews.publishTime",
  "reviews.authorAttribution",
].join(",");

/** O formato do Places API (New), só o que este módulo consome. */
type RespostaPlaces = {
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  reviews?: Array<{
    name?: string;
    rating?: number;
    text?: { text?: string };
    publishTime?: string;
    authorAttribution?: { displayName?: string; photoUri?: string };
  }>;
};

function mapAvaliacao(cru: NonNullable<RespostaPlaces["reviews"]>[number]): AvaliacaoGoogle | null {
  // `name` é o identificador do recurso, e serve de chave de lista. Sem ele a
  // avaliação não é endereçável — descarta em vez de inventar um índice, que
  // reordenaria a grade a cada revalidação.
  if (!cru.name || !cru.publishTime) return null;

  const autorNome = cru.authorAttribution?.displayName?.trim();
  // As regras de exibição do Google exigem identificar o autor. Avaliação sem
  // nome não pode ser publicada como avaliação do Google.
  if (!autorNome) return null;

  const comentario = cru.text?.text?.trim();

  return {
    id: cru.name,
    autorNome,
    autorFotoUrl: cru.authorAttribution?.photoUri ?? null,
    nota: typeof cru.rating === "number" ? cru.rating : 0,
    comentario: comentario && comentario.length > 0 ? comentario : null,
    publicadaEm: cru.publishTime,
    respostaTexto: null,
    respondidaEm: null,
  };
}

/**
 * Converte a resposta crua da API no painel que a home renderiza.
 *
 * Separada do `fetch` para ser testável sem rede — é aqui que mora o formato da
 * API, que é a parte que muda sem avisar.
 */
export function montarPainel(bruto: unknown): PainelReputacao | null {
  const resposta = (bruto ?? {}) as RespostaPlaces;

  // Sem nota ou sem total não há cabeçalho, e o cabeçalho é a seção. Uma lista
  // de comentários sem a nota ao lado é depoimento solto, não reputação.
  if (typeof resposta.rating !== "number" || typeof resposta.userRatingCount !== "number") {
    return null;
  }

  const avaliacoes = (resposta.reviews ?? [])
    .map(mapAvaliacao)
    .filter((a): a is AvaliacaoGoogle => a !== null);

  return {
    reputacao: {
      notaMedia: resposta.rating,
      totalAvaliacoes: resposta.userRatingCount,
      urlPerfil: resposta.googleMapsUri ?? null,
    },
    avaliacoes,
  };
}

/**
 * O que entra na home, na ordem em que entra.
 *
 *  1. descarta avaliação sem texto — não é card, é uma estrela solta; ela
 *     continua contando na média, que vem da API e não daqui;
 *  2. ordena da mais recente para a mais antiga;
 *  3. corta em `limite`.
 *
 * NÃO filtra por nota. Uma avaliação de uma estrela publicada ontem aparece na
 * frente de um elogio de janeiro, e é para aparecer: a nota média ao lado já
 * diz que ela é exceção, e uma seção onde nenhuma crítica nunca aparece é lida
 * como maquiada — o oposto do que a seção existe para fazer.
 */
export function selecionarParaVitrine(
  avaliacoes: AvaliacaoGoogle[],
  limite: number = MAX_AVALIACOES_NA_HOME
): AvaliacaoGoogle[] {
  return avaliacoes
    .filter((a) => !!a.comentario && a.comentario.trim().length > 0)
    .sort((a, b) => new Date(b.publicadaEm).getTime() - new Date(a.publicadaEm).getTime())
    .slice(0, Math.max(0, limite));
}

/**
 * Busca a reputação. `null` quando não há o que exibir.
 *
 * `null` é caminho normal, não excepcional: sem as variáveis de ambiente (dev
 * local), com a API fora do ar, ou com a chave sem permissão. Quem chama omite
 * a seção inteira. Não existe versão de contingência com número inventado — o
 * equivalente ao `MOCK_ESTOQUE` aqui seria publicar uma nota que a loja não
 * tem, e isso não existe nem em desenvolvimento.
 */
export async function getReputacaoGoogle(): Promise<PainelReputacao | null> {
  const chave = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!chave || !placeId) {
    console.info("[Reputação] GOOGLE_PLACES_API_KEY/GOOGLE_PLACE_ID ausentes — seção omitida.");
    return null;
  }

  try {
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=pt-BR`;

    const res = await fetch(url, {
      headers: {
        // Na chave e na máscara de campos por header, não na query string: a
        // URL vai para log de servidor e de proxy, e a chave junto.
        "X-Goog-Api-Key": chave,
        // Obrigatória no Places API (New). Sem ela a chamada é recusada; com
        // ela pedimos só o que a home usa, que é o que é cobrado.
        "X-Goog-FieldMask": CAMPOS,
      },
      // É este `revalidate` que substitui o workflow do n8n inteiro.
      next: { revalidate: VALIDADE_DO_CACHE_S, tags: ["reputacao_google"] },
    });

    if (!res.ok) {
      // Corpo junto: o Places API explica no texto o que faltou — chave sem a
      // API habilitada, billing desligado, place_id errado. Sem isso o
      // diagnóstico vira adivinhação sobre um 403.
      console.warn(`[Reputação] Places API respondeu ${res.status}:`, await res.text());
      return null;
    }

    return montarPainel(await res.json());
  } catch (err) {
    console.warn("[Reputação] Falha ao consultar o Places API:", err);
    return null;
  }
}

/** "4.9" → "4,9". A vírgula é a separação decimal que o cliente lê. */
export function formatarNota(nota: number): string {
  return nota.toFixed(1).replace(".", ",");
}

/**
 * "há 3 meses" — data relativa, porque a absoluta não diz nada sobre
 * reputação: o que importa é se a loja é boa AGORA, não em que dia de março.
 */
export function tempoRelativo(iso: string, agora: Date = new Date()): string {
  const dias = Math.floor((agora.getTime() - new Date(iso).getTime()) / 86_400_000);

  if (!Number.isFinite(dias) || dias < 0) return "";
  if (dias < 1) return "hoje";
  if (dias < 2) return "ontem";
  if (dias < 30) return `há ${dias} dias`;

  const meses = Math.floor(dias / 30);
  if (meses < 12) return meses === 1 ? "há 1 mês" : `há ${meses} meses`;

  const anos = Math.floor(meses / 12);
  return anos === 1 ? "há 1 ano" : `há ${anos} anos`;
}
