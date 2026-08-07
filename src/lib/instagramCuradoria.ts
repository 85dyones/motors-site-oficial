/**
 * Faixa do Instagram — curadoria, não espelho da API.
 *
 * A alternativa era a Instagram Graph API: token de longa duração que expira em
 * 60 dias, `media_url` de CDN assinada que expira sozinha, e um cron só para
 * renovar credencial. Tudo isso para publicar as mesmas fotos que alguém da
 * loja escolheria melhor — a foto que vende carro raramente é a última postada,
 * e um feed automático mostra tanto a entrega de sexta quanto o meme de
 * segunda.
 *
 * Aqui a loja escolhe de 3 a 12 publicações no painel: imagem, link do post e
 * legenda curta. Zero credencial, zero expiração, e a faixa só muda quando
 * alguém decide que ela muda.
 *
 * O dado mora em `site_settings` (linha `instagram_curadoria`), junto com
 * popups e tags rápidas — é configuração editada pelo painel, mesma natureza,
 * mesmo caminho de escrita e de invalidação de cache.
 */

export type PublicacaoInstagram = {
  /** Estável entre salvamentos: é a chave de lista do React e do editor. */
  id: string;
  /** Imagem servida pelo Storage do projeto, não pelo CDN do Instagram. */
  imagemUrl: string;
  /** Link do post. Opcional — sem ele o quadro não é clicável. */
  permalink: string | null;
  /** Texto curto sob a foto. Não é a legenda do post, é a da vitrine. */
  legenda: string | null;
};

/**
 * Teto da faixa. Doze é o que cabe em duas fileiras de seis no desktop; acima
 * disso a home vira álbum e a seção seguinte some abaixo da dobra.
 */
export const MAX_PUBLICACOES = 12;

function texto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo.length > 0 ? limpo : null;
}

/**
 * Converte o blob cru de `site_settings` na lista que a home renderiza.
 *
 * Tolerante de propósito. O blob é JSON livre gravado por um painel que evolui,
 * e pode chegar como `{ publicacoes: [...] }`, como array pelado, com campo
 * faltando ou com sobra de um formato antigo. Nenhuma dessas formas pode
 * derrubar a home: o pior caso aceitável é a faixa não aparecer.
 *
 * A única exigência real é `imagemUrl` — quadro sem imagem não é publicação,
 * é buraco na grade.
 */
export function normalizarCuradoria(bruto: unknown): PublicacaoInstagram[] {
  const lista = Array.isArray(bruto)
    ? bruto
    : Array.isArray((bruto as { publicacoes?: unknown } | null)?.publicacoes)
      ? ((bruto as { publicacoes: unknown[] }).publicacoes)
      : [];

  const vistos = new Set<string>();
  const publicacoes: PublicacaoInstagram[] = [];

  for (const item of lista) {
    if (!item || typeof item !== "object") continue;
    const cru = item as Record<string, unknown>;

    const imagemUrl = texto(cru.imagemUrl);
    if (!imagemUrl) continue;

    // A imagem identifica a publicação melhor que qualquer id: duas entradas
    // com a mesma foto são a mesma publicação salva duas vezes, independente
    // do id que o editor tenha gerado para cada uma.
    if (vistos.has(imagemUrl)) continue;
    vistos.add(imagemUrl);

    publicacoes.push({
      id: texto(cru.id) ?? imagemUrl,
      imagemUrl,
      permalink: texto(cru.permalink),
      legenda: texto(cru.legenda),
    });

    if (publicacoes.length >= MAX_PUBLICACOES) break;
  }

  return publicacoes;
}
