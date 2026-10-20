import type { SupabaseClient } from "@supabase/supabase-js";
import { completarEmJson, type ConfigDoModelo, type Transporte } from "./deepseek";
import {
  FOTOS_POR_PEDIDO_AO_MODELO,
  fotoInacessivel,
  lerClassificacao,
  type CorrecaoDaFoto,
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
  corrigido_em?: string | null;
}

const PAGINA = 1000;
const IDS_POR_LEITURA = 100;
/** Dois pedidos de classificação ao mesmo tempo: um carro de 24 fotos em uma ida. */
const PEDIDOS_EM_PARALELO = 2;
/** A DeepSeek aceita até 32 MiB por foto; foto de anúncio passa longe disso, e mais que isto é arquivo errado. */
const TETO_DA_FOTO_EMBUTIDA = 8 * 1024 * 1024;
const TEMPO_PARA_BAIXAR_A_FOTO_MS = 10_000;

type FotoEmbutida = { url: string; posicao: number; conteudo: string };

/**
 * Baixa a foto e a devolve como data URL, para ir DENTRO do pedido ao modelo
 * (2026-10-20). No branch de teste, a DeepSeek recusou toda rodada com
 * "Failed to download image from https://s3.carro57.com.br/...": o servidor
 * dela não baixa do carro57, que abre normalmente para o site. Baixando aqui,
 * a classificação não depende do caminho entre os dois. Nunca lança.
 */
async function embutirFoto(
  url: string,
  transporte: Transporte,
  timeoutMs: number,
): Promise<{ ok: true; conteudo: string } | { ok: false; motivo: string }> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), timeoutMs);
  try {
    const resposta = await transporte(url, { signal: controle.signal });
    if (!resposta.ok) return { ok: false, motivo: `a foto não baixou (HTTP ${resposta.status}): ${url}` };
    const bytes = Buffer.from(await resposta.arrayBuffer());
    if (bytes.length === 0) return { ok: false, motivo: `a foto veio vazia: ${url}` };
    if (bytes.length > TETO_DA_FOTO_EMBUTIDA) return { ok: false, motivo: `a foto passa de 8 MB: ${url}` };
    // A DeepSeek reconhece o formato pelo conteúdo; o tipo declarado é só o rótulo.
    const tipo = (resposta.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    return { ok: true, conteudo: `data:${tipo.startsWith("image/") ? tipo : "image/jpeg"};base64,${bytes.toString("base64")}` };
  } catch (erro) {
    const abortou = erro instanceof Error && erro.name === "AbortError";
    return { ok: false, motivo: abortou ? `a foto não baixou a tempo: ${url}` : `a foto não baixou: ${url}` };
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * As fotos já classificadas destes carros, por carro. Em páginas: o PostgREST
 * devolve no máximo mil linhas por leitura, e o estoque inteiro passa disso.
 * Leitura que falha (inclusive antes da migração), ou sem a loja, volta
 * vazia — o atendimento classifica de novo (a gravação ignora o que já
 * existe) ou cai na galeria em ordem, e a base do agente, no catálogo sem as
 * camadas.
 */
export async function lerFotosClassificadas(
  supabase: Banco,
  loja: string | null,
  ids: readonly string[],
): Promise<Map<string, FotoClassificada[]>> {
  const porCarro = new Map<string, FotoClassificada[]>();
  // Sem a loja, nada: com a chave de serviço, ler sem o filtro seria ler a
  // classificação de todas as lojas.
  if (!loja) return porCarro;
  // `veiculo_id` é `bigint` — o id do anúncio no RevendaMais —, e o estoque o
  // entrega em texto: a leitura e a gravação usam o número.
  const numericos = ids.filter((id) => /^\d{1,15}$/.test(id));
  for (let i = 0; i < numericos.length; i += IDS_POR_LEITURA) {
    const fatia = numericos.slice(i, i + IDS_POR_LEITURA);
    for (let desde = 0; ; desde += PAGINA) {
      let consulta = supabase
        .from("atendimento_fotos")
        .select("veiculo_id, url, posicao, camada, angulo, descricao, aproveitavel, corrigido_em")
        .in("veiculo_id", fatia.map(Number));
      consulta = consulta.eq("org_id", loja);
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
          corrigida: Boolean(l.corrigido_em),
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

type Lote = { url: string; posicao: number }[];

/**
 * Recusa que é da FOTO, e não do pedido: 4xx, menos credencial (401), saldo
 * (402) e limite de uso (429). É o que a DeepSeek devolve quando não consegue
 * abrir uma das imagens (desde 2026-10-20 elas vão embutidas, então é arquivo
 * que ela não lê) — e aí o lote inteiro cai por causa de uma.
 */
function recusaDaFoto(status: number | undefined): boolean {
  return typeof status === "number" && status >= 400 && status < 500 && ![401, 402, 429].includes(status);
}

/**
 * Classifica as fotos do carro que ainda não foram vistas, em pedidos de até
 * doze, dois de cada vez. O que deu certo é gravado na hora; o pedido que
 * falha deixa as fotos dele na fila.
 *
 * Uma foto que o modelo não consegue abrir (URL quebrada) derrubaria o lote
 * inteiro a cada rodada, e o carro ficaria para sempre na frente da fila. Por
 * isso a recusa da foto parte o lote ao meio até achar a culpada, que é
 * gravada como não aproveitável — a Evolution também não a abriria. Só quando
 * ALGUM pedido do carro deu certo: se nenhum deu, o problema é o pedido, não
 * a foto, e nada é marcado.
 *
 * `prazo` (no relógio de `relogio`) limita cada chamada ao tempo que sobra:
 * a classificação não pode passar do tempo de quem chamou.
 *
 * Grava com `ignoreDuplicates`: a rodada e o atendimento podem classificar o
 * mesmo carro ao mesmo tempo, e a segunda gravação não é erro. O custo do
 * pedido é dividido pelas fotos dele, para o relatório somar certo.
 */
export async function classificarCarro(
  supabase: Banco,
  carro: CarroComFotos,
  jaClassificadas: readonly FotoClassificada[],
  opcoes: {
    modelo: ConfigDoModelo;
    loja: string | null;
    transporte?: Transporte;
    timeoutMs?: number;
    relogio?: () => number;
    prazo?: number;
    /**
     * "Refazer": as URLs que já têm linha do MODELO e devem ser trocadas pela
     * classificação nova — só depois de ela dar certo, e nunca uma linha
     * corrigida à mão (o update filtra `corrigido_em is null`).
     */
    substituir?: ReadonlySet<string>;
  },
): Promise<ClassificacaoDoCarro> {
  const vistas = new Set(jaClassificadas.map((f) => f.url));
  const pendentes = carro.urls.map((url, posicao) => ({ url, posicao })).filter((f) => !vistas.has(f.url));
  const fotos = [...jaClassificadas];
  if (pendentes.length === 0) return { fotos, novas: 0, falhas: 0 };
  // Sem a loja, não grava: com a chave de serviço, a linha iria para a loja
  // errada (o `default` do banco) e a leitura, que filtra, nem a veria.
  const loja = opcoes.loja;
  if (!loja) return { fotos, novas: 0, falhas: 1, motivo: "loja ilegível (org_padrao)" };
  const relogio = opcoes.relogio ?? Date.now;
  const teto = opcoes.timeoutMs ?? 50_000;

  let novas = 0;
  let falhas = 0;
  let sucessos = 0;
  let motivo: string | undefined;
  const suspeitas: Lote = [];
  /** O que a DeepSeek disse na última recusa — vai junto da falha, que sem isso não diz o porquê. */
  let recusa: string | undefined;
  /** A última foto que não baixou nem para o site, com o porquê. */
  let semDownload: string | undefined;

  const gravar = async (lidas: FotoClassificada[], uso: { entrada: number; saida: number }, modelo: string, contar = true) => {
    const linha = (f: FotoClassificada) => ({
      org_id: loja,
      veiculo_id: Number(carro.id),
      url: f.url,
      posicao: f.posicao,
      camada: f.camada,
      angulo: f.angulo,
      descricao: f.descricao,
      aproveitavel: f.aproveitavel,
      modelo,
      tokens_entrada: uso.entrada,
      tokens_saida: uso.saida,
    });
    const trocar = lidas.filter((f) => opcoes.substituir?.has(f.url));
    const novasLinhas = lidas.filter((f) => !opcoes.substituir?.has(f.url));
    for (const f of trocar) {
      // Troca a linha do modelo; a corrigida à mão (no meio tempo) não casa o filtro e fica.
      const { error } = await supabase
        .from("atendimento_fotos")
        .update({
          posicao: f.posicao,
          camada: f.camada,
          angulo: f.angulo,
          descricao: f.descricao,
          aproveitavel: f.aproveitavel,
          modelo,
          tokens_entrada: uso.entrada,
          tokens_saida: uso.saida,
          classificado_em: new Date().toISOString(),
        })
        .eq("org_id", loja)
        .eq("veiculo_id", Number(carro.id))
        .eq("url", f.url)
        .is("corrigido_em", null);
      if (error) {
        falhas += 1;
        motivo = `classificação não gravada: ${error.message}`;
        return;
      }
    }
    if (novasLinhas.length > 0) {
      const { error } = await supabase
        .from("atendimento_fotos")
        .upsert(novasLinhas.map(linha), { onConflict: "org_id,veiculo_id,url", ignoreDuplicates: true });
      if (error) {
        falhas += 1;
        motivo = `classificação não gravada: ${error.message}`;
        return;
      }
    }
    fotos.push(...lidas);
    if (contar) novas += lidas.length;
  };

  const transporte = opcoes.transporte ?? fetch;
  const pedido = (lote: readonly FotoEmbutida[]) =>
    montarPedidoDeClassificacao(
      carro,
      lote.map((f) => ({ url: f.conteudo, posicao: f.posicao })),
    );

  /**
   * Baixa as fotos do lote. A que não baixa nem aqui fica de fora do pedido e
   * vai para as suspeitas, como a que a DeepSeek recusa: só é marcada com a
   * prova de que o pedido funciona.
   */
  const embutir = async (lote: Lote): Promise<FotoEmbutida[]> => {
    const sobra = opcoes.prazo === undefined ? teto : Math.min(teto, opcoes.prazo - relogio());
    if (sobra < 5_000) {
      falhas += 1;
      motivo = "sem tempo para classificar";
      return [];
    }
    const baixadas = await Promise.all(
      lote.map(async (f) => ({ f, r: await embutirFoto(f.url, transporte, Math.min(TEMPO_PARA_BAIXAR_A_FOTO_MS, sobra)) })),
    );
    const prontas: FotoEmbutida[] = [];
    for (const { f, r } of baixadas) {
      if (r.ok) prontas.push({ ...f, conteudo: r.conteudo });
      else {
        suspeitas.push(f);
        semDownload = r.motivo;
      }
    }
    return prontas;
  };

  const classificarLote = async (lote: FotoEmbutida[]): Promise<void> => {
    const sobra = opcoes.prazo === undefined ? teto : Math.min(teto, opcoes.prazo - relogio());
    if (sobra < 5_000) {
      falhas += 1;
      motivo = "sem tempo para classificar";
      return;
    }
    const chamada = await completarEmJson({
      cfg: opcoes.modelo,
      mensagens: pedido(lote),
      maxTokens: 1500,
      temperatura: 0.1,
      modoJson: false,
      transporte: opcoes.transporte,
      timeoutMs: sobra,
    });
    if (!chamada.ok) {
      if (recusaDaFoto(chamada.status)) {
        if (lote.length === 1) {
          suspeitas.push({ url: lote[0].url, posicao: lote[0].posicao });
          recusa = chamada.motivo;
          return;
        }
        const meio = Math.ceil(lote.length / 2);
        await Promise.all([classificarLote(lote.slice(0, meio)), classificarLote(lote.slice(meio))]);
        return;
      }
      falhas += 1;
      motivo = chamada.motivo;
      return;
    }
    const lidas = lerClassificacao(chamada.conteudo, lote);
    if (!lidas) {
      falhas += 1;
      motivo = "o modelo de visão respondeu fora do formato";
      return;
    }
    sucessos += 1;
    await gravar(
      lidas,
      { entrada: Math.round(chamada.uso.entrada / lidas.length), saida: Math.round(chamada.uso.saida / lidas.length) },
      opcoes.modelo.modelo,
    );
  };

  const lotes: Lote[] = [];
  for (let i = 0; i < pendentes.length; i += FOTOS_POR_PEDIDO_AO_MODELO) lotes.push(pendentes.slice(i, i + FOTOS_POR_PEDIDO_AO_MODELO));
  for (let i = 0; i < lotes.length; i += PEDIDOS_EM_PARALELO) {
    await Promise.all(
      lotes.slice(i, i + PEDIDOS_EM_PARALELO).map(async (lote) => {
        const prontas = await embutir(lote);
        if (prontas.length > 0) await classificarLote(prontas);
      }),
    );
  }

  // Marca a foto que o modelo não abre só com prova de que o PEDIDO de agora
  // funciona: um pedido deste carro deu certo nesta chamada, ou — quando todas
  // as fotos pendentes caíram — um pedido de CONTROLE com uma foto que o
  // modelo já classificou (aproveitável, na galeria, não corrigida à mão) dá
  // certo. Classificação antiga sozinha não prova nada: se a DeepSeek passou a
  // recusar o pedido (modelo renomeado, parâmetro novo), marcar seria tirar do
  // cliente, em silêncio, todas as fotos novas do estoque.
  if (suspeitas.length > 0) {
    let provado = sucessos > 0;
    if (!provado) {
      const controle = jaClassificadas.find((f) => f.aproveitavel && !f.corrigida && carro.urls.includes(f.url));
      const sobra = opcoes.prazo === undefined ? teto : Math.min(teto, opcoes.prazo - relogio());
      const embutida = controle && sobra >= 5_000 ? await embutirFoto(controle.url, transporte, Math.min(TEMPO_PARA_BAIXAR_A_FOTO_MS, sobra)) : null;
      if (controle && embutida && !embutida.ok) semDownload = embutida.motivo;
      if (controle && embutida?.ok) {
        const chamada = await completarEmJson({
          cfg: opcoes.modelo,
          mensagens: pedido([{ url: controle.url, posicao: controle.posicao, conteudo: embutida.conteudo }]),
          maxTokens: 300,
          temperatura: 0.1,
          modoJson: false,
          transporte: opcoes.transporte,
          // O que sobrou depois de baixar a foto de controle.
          timeoutMs: Math.max(1_000, opcoes.prazo === undefined ? teto : Math.min(teto, opcoes.prazo - relogio())),
        });
        provado = chamada.ok && lerClassificacao(chamada.conteudo, [{ url: controle.url, posicao: controle.posicao }]) !== null;
        if (!chamada.ok) recusa = chamada.motivo;
      }
    }
    if (provado) {
      // Não conta como classificada: a foto não foi vista, só saiu do envio.
      await gravar(suspeitas.map(fotoInacessivel), { entrada: 0, saida: 0 }, "inacessivel", false);
    } else {
      falhas += 1;
      motivo = recusa
        ? `o modelo de visão recusou o pedido (${recusa})`
        : semDownload
          ? `foto sem classificar: ${semDownload}`
          : "o modelo de visão recusou o pedido";
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

  // Rodízio do começo da fila, primeiro entre os carros sem NENHUMA foto vista: um
  // carro cujo pedido sempre estoura o tempo não pode ficar na frente de todas
  // as rodadas e gastar o orçamento sozinho. A cada rodada (15 min), começa
  // num carro diferente.
  // O mesmo vale entre os que já têm foto vista (um carro de timeout sem
  // recusa não é partido): os dois grupos giram, cada um no seu tamanho.
  const rodada = Math.floor(relogio() / (15 * 60 * 1000));
  const girar = <T,>(lista: T[]) => (lista.length > 1 ? [...lista.slice(rodada % lista.length), ...lista.slice(0, rodada % lista.length)] : lista);
  const nunca = fila.filter((x) => x.ja.length === 0);
  const parciais = fila.filter((x) => x.ja.length > 0);
  const ordem = [...girar(nunca), ...girar(parciais)];

  const resultado: ResultadoDaClassificacao = {
    ok: true,
    carros_na_fila: fila.length,
    carros_classificados: 0,
    fotos_classificadas: 0,
    falhas: 0,
    restantes: fila.length,
  };
  // O orçamento é para COMEÇAR carro; o prazo é o fim de verdade, dentro dos
  // 60 s da função — cada chamada ao modelo só tem o tempo que sobra até ele.
  const prazo = inicio + opcoes.orcamentoMs + 15_000;
  for (const item of ordem) {
    if (relogio() - inicio > opcoes.orcamentoMs || prazo - relogio() < 20_000) break;
    const r = await classificarCarro(supabase, item.carro, item.ja, { ...opcoes, relogio, prazo });
    resultado.restantes -= 1;
    resultado.fotos_classificadas += r.novas;
    resultado.falhas += r.falhas;
    if (r.novas > 0) resultado.carros_classificados += 1;
    if (r.motivo) resultado.motivo = r.motivo;
  }
  return resultado;
}

/**
 * A correção à mão de uma foto (aba Fotos do Atendimento IA): grava a camada
 * e a legenda escolhidas, com quem e quando. Foto ainda na fila ganha a linha
 * aqui — e o modelo não a classifica mais. "Não mandar ao cliente" é `outra`.
 *
 * Um upsert só, que sobrescreve: a correção à mão vence a do modelo e a de
 * outra correção, sem a corrida entre um update e um insert. Sem a loja, não
 * grava — com a chave de serviço, seria escrever sem saber em que loja.
 */
export async function corrigirFoto(
  supabase: Banco,
  loja: string | null,
  correcao: Extract<CorrecaoDaFoto, { ok: true }> & { posicao: number },
  autor: string,
  agora: Date = new Date(),
): Promise<{ ok: true; descricao: string | null } | { ok: false; erro: string }> {
  if (!loja) return { ok: false, erro: "loja ilegível (org_padrao)" };
  const { error } = await supabase.from("atendimento_fotos").upsert(
    {
      org_id: loja,
      veiculo_id: Number(correcao.veiculo),
      url: correcao.url,
      posicao: correcao.posicao,
      camada: correcao.camada,
      // O ângulo era do modelo; na correção, só a camada importa para o envio.
      angulo: null,
      descricao: correcao.descricao,
      aproveitavel: correcao.camada !== "outra",
      modelo: "manual",
      corrigido_por: autor,
      corrigido_em: agora.toISOString(),
    },
    { onConflict: "org_id,veiculo_id,url" },
  );
  return error ? { ok: false, erro: error.message } : { ok: true, descricao: correcao.descricao };
}
