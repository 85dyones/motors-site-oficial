import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

/**
 * Como cada veículo se apresenta ao visitante e aos buscadores.
 *
 * Três estados, decididos aqui e em nenhum outro lugar:
 *
 *   à venda ........ página normal, indexável
 *   vendido ........ selo "VENDIDO", `OutOfStock`, indexável por um tempo
 *   fora do feed ... selo "INDISPONÍVEL", `OutOfStock`, fora do índice
 *
 * O módulo é server-only (usa `unstable_cache` e a chave de serviço). A decisão
 * vira prop de Server Component; nenhum client component importa daqui.
 */

/**
 * Quanto tempo a PDP de um carro vendido continua no índice de busca.
 *
 * Os dois extremos são ruins por motivos opostos. Tirar do índice na hora joga
 * fora a melhor parte do tráfego: quem procura "BMW X1 2019 usado" na semana
 * seguinte à venda é comprador daquele perfil, e a página já oferece OutOfStock
 * mais a lista de similares — é lead, não decepção. Manter para sempre é o
 * outro extremo: a loja vende continuamente, então em doze meses o índice
 * descreveria centenas de carros mortos contra as ~41 vagas vivas.
 *
 * Noventa dias captura a demanda enquanto ela é quente e limpa quando esfria.
 * Decisão do dono em 2026-08-17.
 */
export const CARENCIA_VENDIDO_DIAS = 90;

/**
 * ⚠️ O bloqueio de publicação **não mora aqui** — vive em
 * `lib/coerenciaDoCadastro.ts` (`bloqueiosDePublicacao`, `MINIMO_DE_FOTOS`).
 *
 * Este módulo é server-only: usa `unstable_cache` e a chave de serviço. O
 * editor do painel é componente de cliente e precisa desenhar o estado de
 * bloqueio, então a regra tem de viver num módulo sem imports — mesma razão
 * de `lib/perfisDeUso.ts` e `lib/faixasDePreco.ts`.
 *
 * Aqui ficam os três estados de APRESENTAÇÃO (à venda, vendido, fora do feed);
 * lá fica a decisão de o carro poder ir à vitrine.
 */


/** Sinais brutos do banco. Quem os lê é o servidor; quem os julga é a função abaixo. */
export type SinaisDoVeiculo = {
  /**
   * Opcional porque `Veiculo.vendido` é opcional no tipo do projeto — a coluna
   * tem default `false`, mas nada garante isso a quem chama. Ausente é tratado
   * como "não vendido", que é o default do banco.
   */
  vendido?: boolean | null;
  /** Ficou de fora do ciclo de sync mais recente. */
  foraDoFeed: boolean;
  /**
   * Faltam fotos — ver `bloqueiosDePublicacao` em `lib/coerenciaDoCadastro.ts`,
   * que é onde a regra mora (aquele módulo não tem imports e por isso serve
   * também ao painel, que é cliente).
   *
   * A falta de laudo cautelar está listada lá como pendência e **não** entra
   * aqui hoje: 38 das 39 fichas servidas em 27/08 estão com o campo vazio.
   *
   * Opcional: chamador que não sabe do bloqueio se comporta como antes.
   */
  bloqueadoParaPublicacao?: boolean;
  /**
   * `estoque_motors.last_seen_at` — última vez que o feed do RevendaMais
   * anunciou este carro. Serve de PROXY da data de saída quando a venda não
   * passou pelo fechamento do Ciclo (ver `dataVenda`).
   */
  ultimaPresenca?: string | null;
  /**
   * `veiculos_vendidos.data_venda`. Só existe para venda fechada pela tela do
   * Ciclo, que é de 2026-08-14 — carro marcado `vendido` direto no painel não
   * tem essa data, e é por isso que existe o proxy acima.
   */
  dataVenda?: string | null;
};

export type Publicacao = {
  /** A página se apresenta como não disponível: selo, foto em cinza, CTA de similares. */
  indisponivel: boolean;
  /** O que o selo escreve. `null` quando o carro está à venda. */
  rotulo: "VENDIDO" | "INDISPONÍVEL" | null;
  /** Sai do índice de busca e do sitemap. */
  noindex: boolean;
  /**
   * A URL cumpriu o ciclo e deve redirecionar para o hub do modelo (301).
   *
   * **Só para veículo VENDIDO com a carência vencida** — e a distinção não é
   * detalhe. "Fora do feed" também sai do índice, mas na hora e sem saber o
   * motivo: pode ser repasse, reserva ou anúncio expirado, e o carro pode
   * voltar. Redirecionar essa URL apagaria uma página que talvez volte a valer.
   * Venda é fato consumado; passados os 90 dias, o que sobra ali é sinal a ser
   * reciclado, não oferta a ser mantida.
   */
  arquivar: boolean;
};

const DIA_MS = 24 * 60 * 60 * 1000;

/** Dias inteiros entre um carimbo e agora. `null` quando a data não é utilizável. */
export function diasDesde(quando: string | null | undefined, agora: Date): number | null {
  if (!quando) return null;
  const t = new Date(quando).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((agora.getTime() - t) / DIA_MS);
}

/**
 * A decisão. Pura de propósito: é a regra que define o que o Google vê, e
 * regra dessas tem de ser testável sem banco.
 */
export function decidirPublicacao(sinais: SinaisDoVeiculo, agora: Date = new Date()): Publicacao {
  // Vendido vence "fora do feed" no rótulo, e a ordem importa: quando o carro
  // é vendido E sai do feed — o caso comum — sabemos o motivo da saída, então
  // dizer "VENDIDO" é afirmar um fato, não um palpite.
  if (sinais.vendido) {
    // `data_venda` primeiro; `last_seen_at` como proxy. Erra deliberadamente
    // para o lado de MANTER indexado: sem nenhuma referência de data, a
    // carência nunca vence.
    const referencia = sinais.dataVenda ?? sinais.ultimaPresenca;
    const dias = diasDesde(referencia, agora);

    const carenciaVenceu = dias !== null && dias > CARENCIA_VENDIDO_DIAS;

    return {
      indisponivel: true,
      rotulo: "VENDIDO",
      noindex: carenciaVenceu,
      // Mesmo momento: enquanto a página vale a pena no índice, ela fica de pé
      // com os similares. Quando não vale mais, o sinal vai para o hub.
      arquivar: carenciaVenceu,
    };
  }

  if (sinais.foraDoFeed) {
    // Sem carência aqui: o motivo da saída é desconhecido (repasse, reserva,
    // anúncio expirado) e a página não pode sustentar uma oferta que ninguém
    // confirmou. Sai do índice de imediato; a página segue viva com similares.
    return { indisponivel: true, rotulo: "INDISPONÍVEL", noindex: true, arquivar: false };
  }

  // Bloqueado para publicação sai do índice, mas a página fica de pé.
  //
  // Tirar da vitrine sem tirar da busca seria meia-medida: a URL indexada
  // continuaria levando gente a um anúncio que a loja decidiu não publicar —
  // hoje, um anúncio de uma foto. `follow: true` continua valendo pela regra
  // acima: a ficha vira porta de entrada para os similares em vez de beco sem
  // saída.
  //
  // 404 seria pior: quebra link externo já compartilhado, e o bloqueio é
  // reversível — subir as fotos que faltam devolve o carro ao índice no ciclo
  // seguinte.
  if (sinais.bloqueadoParaPublicacao) {
    return { indisponivel: false, rotulo: null, noindex: true, arquivar: false };
  }

  return { indisponivel: false, rotulo: null, noindex: false, arquivar: false };
}

/**
 * `estoque_id -> data_venda` das vendas fechadas pelo Ciclo.
 *
 * Lê com a chave de SERVIÇO por necessidade, não por conveniência:
 * `veiculos_vendidos` tem RLS `for select to authenticated` restrita ao próprio
 * cliente (migração 20260813150000). Com a anon key o retorno é uma lista
 * vazia e `error` nulo — RLS não devolve erro, devolve vazio —, e a carência
 * cairia silenciosamente no proxy para todo mundo, para sempre.
 *
 * Só `estoque_id` e `data_venda` saem da tabela. O resto dela é PII de cliente
 * e contrato, e isto aqui roda no caminho de renderização de página pública.
 */
export const getDatasDeVenda = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const chave = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    if (!url || !chave) {
      // Sem a chave de serviço a carência simplesmente não vence — todo carro
      // vendido continua indexado. Falha para o lado de manter, como o resto
      // do módulo.
      console.warn(
        "[Publicação] SUPABASE_SERVICE_ROLE_KEY ausente — a carência do vendido " +
          "vai depender só de last_seen_at."
      );
      return {};
    }

    try {
      const client = createClient(url, chave, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client
        .from("veiculos_vendidos")
        .select("estoque_id, data_venda");

      if (error || !data) {
        console.warn("[Publicação] Falha ao ler datas de venda:", error?.message);
        return {};
      }

      const mapa: Record<string, string> = {};
      for (const linha of data) {
        if (linha.estoque_id == null || !linha.data_venda) continue;
        const id = String(linha.estoque_id);
        // Um veículo pode ter mais de uma venda no histórico (recompra). A mais
        // recente é a que define a carência.
        if (!mapa[id] || linha.data_venda > mapa[id]) mapa[id] = linha.data_venda;
      }
      return mapa;
    } catch (err) {
      console.warn("[Publicação] Erro inesperado ao ler datas de venda:", err);
      return {};
    }
  },
  ["datas-de-venda"],
  { revalidate: 3600, tags: ["datas-de-venda"] }
);
