import type { SupabaseClient } from "@supabase/supabase-js";
import { completarEmJson, type ConfigDoModelo, type Transporte } from "./deepseek";
import {
  FOTOS_POR_PEDIDO_AO_MODELO,
  lerClassificacao,
  montarPedidoDeClassificacao,
  type AnguloDaFoto,
  type CamadaClassificada,
  type FotoClassificada,
} from "./fotosDoAtendimento";

/**
 * A classificação das fotos do estoque, do lado do servidor (2026-10-20):
 * ler o que já foi classificado e classificar o que falta.
 *
 * Quem chama: a rodada das fotos (`/api/atendimento/fotos`, pelo n8n), que
 * adianta a fila do estoque inteiro; o atendimento, que classifica na hora o
 * carro que o cliente pediu e ainda não foi visto; e a base do agente, que lê
 * o resumo das camadas para o catálogo. Sempre com a chave de serviço, e por
 * isso sempre filtrando pela loja.
 */

type Banco = SupabaseClient;

export interface CarroComFotos {
  id: string;
  nome: string;
  /** A galeria atual do carro, já filtrada por `fotosDoCarro`. */
  urls: string[];
}

interface LinhaDaFoto {
  veiculo_id: number | string;
  url: string;
  posicao: number | null;
  camada: CamadaClassificada;
  angulo: AnguloDaFoto | null;
  descricao: string | null;
  aproveitavel: boolean | null;
}

const PAGINA = 1000;
const IDS_POR_LEITURA = 100;
/** Dois pedidos de classificação ao mesmo tempo: um carro de 24 fotos em uma ida. */
const PEDIDOS_EM_PARALELO = 2;

/**
 * As fotos já classificadas destes carros, por carro. Em páginas: o PostgREST
 * devolve no máximo mil linhas por leitura, e o estoque inteiro passa disso.
 * Leitura que falha (inclusive antes da migração) volta vazia — o atendimento
 * cai na galeria em ordem, e a base do agente, no catálogo sem as camadas.
 */
export async function lerFotosClassificadas(
  supabase: Banco,
  loja: string | null,
  ids: readonly string[],
): Promise<Map<string, FotoClassificada[]>> {
  const porCarro = new Map<string, FotoClassificada[]>();
  // `veiculo_id` é `bigint` — o id do anúncio no RevendaMais —, e o estoque o
  // entrega em texto: a leitura e a gravação usam o número.
  const numericos = ids.filter((id) => /^\d{1,15}$/.test(id));
  for (let i = 0; i < numericos.length; i += IDS_POR_LEITURA) {
    const fatia = numericos.slice(i, i + IDS_POR_LEITURA);
    for (let desde = 0; ; desde += PAGINA) {
      let consulta = supabase
        .from("atendimento_fotos")
        .select("veiculo_id, url, posicao, camada, angulo, descricao, aproveitavel")
        .in("veiculo_id", fatia.map(Number));
      if (loja) consulta = consulta.eq("org_id", loja);
      const { data, error } = await consulta.order("id", { ascending: true }).range(desde, desde + PAGINA - 1);
      if (error) {
        console.warn("[Atendimento] Fotos classificadas ilegíveis:", error.message);
        return porCarro;
      }
      const linhas = (data ?? []) as LinhaDaFoto[];
      for (const l of linhas) {
        const id = String(l.veiculo_id);
        const lista = porCarro.get(id) ?? [];
        lista.push({
          url: l.url,
          posicao: Number(l.posicao ?? 0),
          camada: l.camada,
          angulo: l.angulo ?? null,
          descricao: l.descricao ?? null,
          aproveitavel: l.aproveitavel !== false,
        });
        porCarro.set(id, lista);
      }
      if (linhas.length < PAGINA) break;
    }
  }
  return porCarro;
}

export interface ClassificacaoDoCarro {
  /** Todas as fotos classificadas do carro: as que já estavam e as novas. */
  fotos: FotoClassificada[];
  novas: number;
  falhas: number;
  motivo?: string;
}

/**
 * Classifica as fotos do carro que ainda não foram vistas, em pedidos de até
 * doze, dois de cada vez. Pedido que falha deixa as fotos dele na fila (a
 * próxima rodada tenta de novo); o que deu certo é gravado na hora.
 *
 * Grava com `ignoreDuplicates`: a rodada e o atendimento podem classificar o
 * mesmo carro ao mesmo tempo, e a segunda gravação não é erro. O custo do
 * pedido é dividido pelas fotos dele, para o relatório somar certo.
 */
export async function classificarCarro(
  supabase: Banco,
  carro: CarroComFotos,
  jaClassificadas: readonly FotoClassificada[],
  opcoes: { modelo: ConfigDoModelo; loja: string | null; transporte?: Transporte; timeoutMs?: number },
): Promise<ClassificacaoDoCarro> {
  const vistas = new Set(jaClassificadas.map((f) => f.url));
  const pendentes = carro.urls.map((url, posicao) => ({ url, posicao })).filter((f) => !vistas.has(f.url));
  const fotos = [...jaClassificadas];
  if (pendentes.length === 0) return { fotos, novas: 0, falhas: 0 };

  const lotes: { url: string; posicao: number }[][] = [];
  for (let i = 0; i < pendentes.length; i += FOTOS_POR_PEDIDO_AO_MODELO) lotes.push(pendentes.slice(i, i + FOTOS_POR_PEDIDO_AO_MODELO));

  let novas = 0;
  let falhas = 0;
  let motivo: string | undefined;
  for (let i = 0; i < lotes.length; i += PEDIDOS_EM_PARALELO) {
    const resultados = await Promise.all(
      lotes.slice(i, i + PEDIDOS_EM_PARALELO).map(async (lote) => {
        const chamada = await completarEmJson({
          cfg: opcoes.modelo,
          mensagens: montarPedidoDeClassificacao(carro, lote),
          maxTokens: 1500,
          temperatura: 0.1,
          modoJson: false,
          transporte: opcoes.transporte,
          timeoutMs: opcoes.timeoutMs ?? 50_000,
        });
        if (!chamada.ok) return { ok: false as const, motivo: chamada.motivo };
        const lidas = lerClassificacao(chamada.conteudo, lote);
        if (!lidas) return { ok: false as const, motivo: "o modelo de visão respondeu fora do formato" };
        const porFoto = { entrada: Math.round(chamada.uso.entrada / lote.length), saida: Math.round(chamada.uso.saida / lote.length) };
        const { error } = await supabase.from("atendimento_fotos").upsert(
          lidas.map((f) => ({
            ...(opcoes.loja ? { org_id: opcoes.loja } : {}),
            veiculo_id: Number(carro.id),
            url: f.url,
            posicao: f.posicao,
            camada: f.camada,
            angulo: f.angulo,
            descricao: f.descricao,
            aproveitavel: f.aproveitavel,
            modelo: opcoes.modelo.modelo,
            tokens_entrada: porFoto.entrada,
            tokens_saida: porFoto.saida,
          })),
          { onConflict: "org_id,veiculo_id,url", ignoreDuplicates: true },
        );
        if (error) return { ok: false as const, motivo: `classificação não gravada: ${error.message}` };
        return { ok: true as const, lidas };
      }),
    );
    for (const r of resultados) {
      if (r.ok) {
        fotos.push(...r.lidas);
        novas += r.lidas.length;
      } else {
        falhas += 1;
        motivo = r.motivo;
      }
    }
  }
  return { fotos, novas, falhas, ...(motivo ? { motivo } : {}) };
}

export interface ResultadoDaClassificacao {
  ok: boolean;
  motivo?: string;
  /** Carros do estoque com foto ainda não classificada, antes desta rodada. */
  carros_na_fila: number;
  carros_classificados: number;
  fotos_classificadas: number;
  /** Pedidos ao modelo que falharam (as fotos deles continuam na fila). */
  falhas: number;
  /** Carros que não couberam no tempo desta rodada. */
  restantes: number;
}

/**
 * A fila do estoque: os carros com foto ainda não classificada, primeiro os
 * que não têm NENHUMA (o atendimento não sabe nem o que oferecer deles), até
 * o fim do orçamento de tempo. O que não coube fica para a próxima rodada.
 */
export async function classificarFotosPendentes(
  supabase: Banco,
  carros: readonly CarroComFotos[],
  opcoes: {
    modelo: ConfigDoModelo;
    loja: string | null;
    transporte?: Transporte;
    relogio?: () => number;
    orcamentoMs: number;
  },
): Promise<ResultadoDaClassificacao> {
  const relogio = opcoes.relogio ?? Date.now;
  const inicio = relogio();
  const classificadas = await lerFotosClassificadas(
    supabase,
    opcoes.loja,
    carros.map((c) => c.id),
  );
  const fila = carros
    .map((c) => {
      const ja = classificadas.get(c.id) ?? [];
      const vistas = new Set(ja.map((f) => f.url));
      return { carro: c, ja, pendentes: c.urls.filter((u) => !vistas.has(u)).length };
    })
    .filter((x) => x.pendentes > 0)
    .sort((a, b) => a.ja.length - b.ja.length || b.pendentes - a.pendentes);

  const resultado: ResultadoDaClassificacao = {
    ok: true,
    carros_na_fila: fila.length,
    carros_classificados: 0,
    fotos_classificadas: 0,
    falhas: 0,
    restantes: fila.length,
  };
  for (const item of fila) {
    if (relogio() - inicio > opcoes.orcamentoMs) break;
    const r = await classificarCarro(supabase, item.carro, item.ja, opcoes);
    resultado.restantes -= 1;
    resultado.fotos_classificadas += r.novas;
    resultado.falhas += r.falhas;
    if (r.novas > 0) resultado.carros_classificados += 1;
    if (r.motivo) resultado.motivo = r.motivo;
  }
  return resultado;
}
