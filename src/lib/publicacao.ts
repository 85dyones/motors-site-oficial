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
   * O laudo NÃO entra aqui, e nunca deveria ter entrado: 100% do pátio é
   * periciado, e `laudo_pericia` guarda apontamentos pontuais — vazio é o
   * melhor caso. Corrigido em 29/08, pelo dono.
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
   * Quando a loja disse que este carro saiu.
   *
   * Duas origens, resolvidas em `getDatasDeVenda`: `veiculos_vendidos.data_venda`
   * (venda fechada pela tela do Ciclo, de 2026-08-14) e, desde 2026-09-04, o
   * carimbo do `historico_veiculo` quando alguém marca `vendido` no painel.
   *
   * Antes só a primeira existia, e ela cobria quase nada — a tabela do Ciclo
   * tinha zero linhas. Toda a carência dependia do proxy acima, que o sync
   * reinicia a cada seis horas para o carro que segue no feed.
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
 * A fusão das duas fontes de data de venda — pura, e por isso testável.
 *
 * Estava embutida em `getDatasDeVenda`, que é cacheada e fala com o Supabase:
 * o único teste possível era procurar strings no arquivo, e um teste desses
 * não percebe quando a REGRA muda. Foi assim que a precedência errada
 * (Ciclo > painel) passou pela primeira revisão.
 *
 * Duas decisões vivem aqui:
 *
 * 1. **A mais recente vence**, venha de que fonte vier. Já foi "o Ciclo vence
 *    o painel", e o contraexemplo é o Bloco B do próprio programa: carro
 *    vendido pelo Ciclo em janeiro, RECOMPRADO, de volta à vitrine, revendido
 *    pelo painel em setembro. Com precedência por fonte, janeiro venceria — e
 *    a ficha nasceria com a carência vencida, virando 308 no mesmo dia da
 *    segunda venda. Hoje `veiculos_vendidos` está vazia e isso não morde;
 *    morde quando o Ciclo entrar em operação.
 *
 * 2. **Do histórico, só quem terminou marcado.** Interessa a ÚLTIMA mudança da
 *    chave, não a última vez que ela foi ligada: o carro marcado vendido e
 *    depois DESMARCADO está à venda de novo, e a data antiga não pode
 *    sobreviver a isso. Se ela sobrevivesse e já passasse dos 90 dias, a ficha
 *    viva responderia 308 para o hub no instante da remarcação.
 *
 * O `"true"` é contrato de formato com `estoqueEscrita.ts`, que serializa com
 * `String(novo)`. Acoplamento por string entre módulos — travado em
 * `tests/ficha-vendida.test.ts`, que é o que faz o rompimento aparecer no CI
 * em vez de aparecer no índice do Google três meses depois.
 */
export function resolverDatasDeVenda(
  vendasDoCiclo: Array<{ estoque_id?: unknown; data_venda?: unknown }>,
  mudancasNoPainel: Array<{ veiculo_id?: unknown; valor_novo?: unknown; registrado_em?: unknown }>
): Record<string, string> {
  const maisRecente: Record<string, string> = {};
  const considerar = (id: unknown, data: unknown) => {
    if (id == null || typeof data !== "string" || !data) return;
    const chave = String(id);
    if (!maisRecente[chave] || data > maisRecente[chave]) maisRecente[chave] = data;
  };

  const ultimaMudanca: Record<string, { data: string; valor: string }> = {};
  for (const linha of mudancasNoPainel) {
    const id = linha.veiculo_id;
    const data = linha.registrado_em;
    if (id == null || typeof data !== "string" || !data) continue;
    const chave = String(id);
    if (!ultimaMudanca[chave] || data > ultimaMudanca[chave].data) {
      ultimaMudanca[chave] = { data, valor: String(linha.valor_novo) };
    }
  }
  for (const [id, ultima] of Object.entries(ultimaMudanca)) {
    if (ultima.valor === "true") considerar(id, ultima.data);
  }

  for (const linha of vendasDoCiclo) {
    considerar(linha.estoque_id, linha.data_venda);
  }

  return maisRecente;
}

/**
 * `estoque_id -> data da venda`, de DUAS fontes.
 *
 * ---------------------------------------------------------------------------
 * Por que duas
 * ---------------------------------------------------------------------------
 * `veiculos_vendidos` é o registro de venda do CICLO: exige `cliente_id`,
 * `chassi`, `placa`, `km_na_venda` e `valor_venda`. É a venda formalizada, com
 * gente e contrato. O painel, quando alguém marca "vendido" na tela de
 * estoque, não tem nada disso — e por isso nunca escreveu ali. Em 2026-09-03 a
 * tabela tinha zero linhas, e a carência do vendido dependia inteiramente do
 * proxy `last_seen_at`.
 *
 * O proxy funciona para quem SAI do feed: o carimbo congela e o relógio corre.
 * Mas o carro vendido na loja que segue anunciado no RevendaMais é
 * re-carimbado a cada ciclo do sync, quatro vezes por dia — e para ele a
 * carência nunca começa. Caso real: o Chevrolet Spin `8100626`, marcado
 * vendido no site e presente no feed de 03/09.
 *
 * A segunda fonte existe para isso, sem tabela nova e sem coluna nova: o
 * painel JÁ registra toda mudança de campo em `historico_veiculo`
 * (`estoqueEscrita.ts`), então a virada de `vendido` para `true` deixa data e
 * hora. Era um dado que existia e ninguém lia.
 *
 * ⚠️ O QUE ELA NÃO RESOLVE, e é preciso dizer com todas as letras: ela vale da
 * data em que passou a ser lida para a frente. Em 2026-09-04 o histórico tinha
 * DUAS linhas de `vendido`, cobrindo 1 dos 24 vendidos publicados — e nenhuma
 * delas é a do Spin, que não tem linha nenhuma em campo nenhum. Os outros 23
 * foram marcados por caminhos que não passaram por `aplicarNosVeiculos`
 * (reconciliação por SQL, sync antigo), e para eles continua valendo só o
 * `last_seen_at`. Dar data ao passado é backfill, e backfill é decisão do
 * dono, não efeito colateral desta função.
 *
 * A ocorrência MAIS RECENTE vence, venha de onde vier — ver o comentário no
 * corpo, e o contraexemplo de recompra que derrubou a precedência por fonte.
 *
 * ---------------------------------------------------------------------------
 * Por que a chave de serviço
 * ---------------------------------------------------------------------------
 * `veiculos_vendidos` tem RLS `for select to authenticated` restrita ao próprio
 * cliente (migração 20260813150000). Com a anon key o retorno é uma lista
 * vazia e `error` nulo — RLS não devolve erro, devolve vazio —, e a carência
 * cairia silenciosamente no proxy para todo mundo, para sempre.
 *
 * Só `estoque_id` e `data_venda` saem de `veiculos_vendidos`, e só
 * `veiculo_id` e `registrado_em` do histórico. O resto das duas é PII de
 * cliente, contrato e autoria, e isto roda no caminho de renderização de
 * página pública.
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
      /* As duas leituras são independentes: vão juntas, e uma que falhe não
         leva a outra. Perder o histórico e ficar só com o Ciclo é pior do que
         hoje, mas não é o fim — o `last_seen_at` continua atrás das duas. */
      const [vendasDoCiclo, mudancasNoPainel] = await Promise.all([
        client.from("veiculos_vendidos").select("estoque_id, data_venda"),
        /* Sem filtrar por `valor_novo`: é preciso ver a ÚLTIMA mudança da
           chave, não a última vez que ela foi ligada. Filtrando só as
           `"true"`, um carro marcado vendido e depois DESMARCADO — voltou à
           vitrine — guardaria a data antiga; se ela já passasse dos 90 dias,
           a ficha viva responderia 308 para o hub no instante da remarcação. */
        client
          .from("historico_veiculo")
          .select("veiculo_id, valor_novo, registrado_em")
          .eq("campo", "vendido"),
      ]);

      if (vendasDoCiclo.error && mudancasNoPainel.error) {
        console.warn(
          "[Publicação] Falha ao ler datas de venda nas duas fontes:",
          vendasDoCiclo.error?.message,
          mudancasNoPainel.error?.message
        );
        return {};
      }

      if (mudancasNoPainel.error) {
        console.warn(
          "[Publicação] Sem o histórico do painel (%s) — a carência de quem " +
            "segue no feed vai depender só de last_seen_at.",
          mudancasNoPainel.error.message
        );
      }
      if (vendasDoCiclo.error) {
        console.warn("[Publicação] Sem as vendas do Ciclo:", vendasDoCiclo.error.message);
      }

      return resolverDatasDeVenda(vendasDoCiclo.data ?? [], mudancasNoPainel.data ?? []);
    } catch (err) {
      console.warn("[Publicação] Erro inesperado ao ler datas de venda:", err);
      return {};
    }
  },
  ["datas-de-venda"],
  { revalidate: 3600, tags: ["datas-de-venda"] }
);
