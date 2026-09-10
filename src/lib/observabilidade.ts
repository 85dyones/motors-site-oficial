import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { alertarFalha } from "./alertaDeFalha";

/**
 * A costura da observabilidade — a função que obriga a escolher o destino.
 *
 * ---------------------------------------------------------------------------
 * Duas naturezas de falha, e elas pedem coisas opostas
 * ---------------------------------------------------------------------------
 * **parada** — nada lançou, a operação deixou de acontecer. A CAPI em 401, o
 * motor do Ciclo sem rodar, o estoque indisponível. Ninguém descobre isso
 * lendo painel: precisa procurar a pessoa, no WhatsApp. É o que
 * `alertaDeFalha.ts` já fazia, e continua fazendo — este arquivo não muda uma
 * linha de lá.
 *
 * **quebra** — alguma coisa lançou. Tem stack, tem rota, tem volume. Mandar
 * cada uma ao WhatsApp seria a enxurrada que faz a pessoa silenciar o alerta,
 * e alerta silenciado é pior que alerta nenhum. Vai para a fila de triagem, na
 * tabela `erros`.
 *
 * **ambos** — a quebra que a loja precisa saber antes da triagem. O caso
 * canônico é o lead que não gravou: cada minuto ali é dinheiro.
 *
 * `natureza` é o PRIMEIRO parâmetro e não tem default de propósito. A escolha
 * é de negócio, não de forma; sem obrigá-la no ponto de chamada, o julgamento
 * apodrece e tudo vira "o que estava lá antes".
 *
 * ---------------------------------------------------------------------------
 * ⚠️ Este arquivo VAI para o bundle do navegador
 * ---------------------------------------------------------------------------
 * `src/lib/supabase.ts` é importado por nove client components, e importa esta
 * biblioteca. Logo, ela chega ao cliente de carona — e por isso:
 *
 *   • nada de `server-only` (que nem está instalado aqui), `next/headers`,
 *     `./supabase-server` ou `crypto` — qualquer um quebra o build do cliente;
 *   • o hash é FNV-1a escrito à mão, em vez de `createHash`;
 *   • o cliente de serviço nasce LAZY, na primeira gravação, e a chave vem de
 *     `SUPABASE_SERVICE_ROLE_KEY` — sem `NEXT_PUBLIC_`, logo `undefined` no
 *     navegador;
 *   • há guarda explícita de `typeof window` no caminho de gravação.
 *
 * O certo mesmo seria `supabase.ts` não estar em client component nenhum. São
 * nove arquivos e é outro PR; até lá, o isomorfismo aqui é o que segura.
 *
 * ---------------------------------------------------------------------------
 * Por que há teto, disjuntor e carência
 * ---------------------------------------------------------------------------
 * O Next **await-a** o `onRequestError` (`next/dist/server/base-server.js:450`),
 * então tudo que a gravação demorar entra no tempo da resposta de erro.
 *
 *   • **Teto** de 2 s por gravação, com `AbortSignal.timeout` — que cancela o
 *     fetch de verdade. `Promise.race` deixaria a promessa pendurada, e em
 *     serverless promessa pendurada congela com a instância e acorda na
 *     invocação seguinte.
 *   • **Disjuntor** de 60 s: quando a gravação falha, a instância para de
 *     tentar o banco por um minuto. Sem ele, com o Supabase fora, CADA
 *     requisição da vitrine pagaria o teto de novo — e o Supabase fora é
 *     exatamente quando mais chega erro aqui.
 *   • **Carência** de 10 s por grupo: uma exceção em página quente sob
 *     campanha é uma gravação por requisição. O que foi engolido viaja
 *     contado na linha seguinte, como em `alertaDeFalha.ts`.
 *
 * E quando a gravação falha, o aviso sai pelo OUTRO caminho, o webhook, com
 * assunto próprio. É o defeito que `alertaDeFalha.ts` foi escrito para
 * resolver — o vigia dormindo junto com o vigiado — e que voltaria se o banco
 * fosse o único destino.
 */

export type Natureza = "quebra" | "parada" | "ambos";

export type Contexto = {
  /** O padrão da rota, como o Next o conhece: `/carros/[categoria]/…`. */
  rota?: string;
  /** Sem query string — é lá que moram utm, telefone e token. */
  url?: string;
  metodo?: string;
  /** Nulo na v1: o `insert` das rotas de lead não tem `.select()`. */
  lead_id?: string;
  /** O elo entre quem navegou e quem virou lead. Vem do cookie. */
  ag_uid?: string | null;
  origem?: "servidor" | "navegador";
  // `null` é admitido junto com `undefined` porque quem preenche estes campos
  // lê cabeçalho e cookie, e "não veio" ali é `null`. Obrigar `?? undefined`
  // em cada ponto de chamada seria ruído sem ganho.
  navegador?: string | null;
  release?: string | null;
  /** O `digest` do Next liga a linha do navegador à do servidor. */
  digest?: string | null;
  stack?: string | null;
  extra?: Record<string, unknown>;
};

/** Teto de uma gravação. Curto porque o Next espera por ela. */
const TETO_INSERT_MS = 2000;

/** Quanto tempo a instância para de tentar o banco depois de uma falha. */
const DISJUNTOR_MS = 60_000;

/** Janela em que o mesmo grupo de erro grava uma linha só. */
const CARENCIA_POR_HASH_MS = 10_000;

/** Tetos por campo — casam com os CHECK da tabela `erros`. */
const TETO_ASSUNTO = 80;
const TETO_MENSAGEM = 2000;
const TETO_STACK = 8000;
/** `extra` é jsonb livre: sem teto, um `catch` distraído infla o INSERT. */
const TETO_EXTRA = 2000;

let bancoIndisponivelAte = 0;
/** Quantos erros o disjuntor engoliu desde o último aviso. Ver `gravar`. */
let perdidosPeloDisjuntor = 0;
const ultimaGravacao = new Map<string, { em: number; suprimidas: number }>();
let clienteDeServico: SupabaseClient | null = null;

/** Zera disjuntor, carência e o cliente. Existe para o teste. */
export function esquecerEstado(): void {
  bancoIndisponivelAte = 0;
  perdidosPeloDisjuntor = 0;
  ultimaGravacao.clear();
  clienteDeServico = null;
}

/**
 * Tira o que o Postgres RECUSA dentro de uma string JSON.
 *
 * Dois casos, e os dois chegam da porta pública:
 *
 *  - **o byte zero (NUL, 0x00)** — o Postgres devolve `22P05` ("unsupported Unicode escape
 *    sequence"). Nenhum texto legítimo o carrega.
 *  - **substituto UTF-16 solto** — `22P02` ("invalid input syntax for json").
 *    É o que sobra quando um emoji é cortado ao meio pelo teto por campo:
 *    `"a".repeat(499) + "🚗"` cortado em 500 deixa metade do par, e o
 *    `JSON.stringify` a emite como `\ud83d`.
 *
 * Por que isto importa muito mais do que parece: sem saneamento, uma
 * requisição por minuto — de qualquer pessoa, sem autenticação — fazia o
 * INSERT ser recusado, o disjuntor abrir e a fila de triagem morrer, com o
 * dono recebendo no WhatsApp que o banco tinha caído. Alerta que mente e não
 * se desliga é a doença que este pacote existe para curar.
 *
 * Escrito com varredura explícita, e não regex: `\uD800` numa expressão
 * regular já foi comido por camada de shell neste repositório, e o resultado
 * foi uma regex verde casando com nada.
 */
function sanearParaJson(texto: string): string {
  let saida = "";
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);

    // Controle, menos tab, quebra de linha e retorno — que são legítimos num
    // stack trace.
    if ((c < 0x20 && c !== 9 && c !== 10 && c !== 13) || c === 0x7f) {
      saida += " ";
      continue;
    }

    // Substituto ALTO: só passa se o par estiver completo.
    if (c >= 0xd800 && c <= 0xdbff) {
      const proximo = texto.charCodeAt(i + 1);
      if (proximo >= 0xdc00 && proximo <= 0xdfff) {
        saida += texto[i] + texto[i + 1];
        i += 1;
        continue;
      }
      saida += "�";
      continue;
    }

    // Substituto BAIXO sem alto antes: órfão.
    if (c >= 0xdc00 && c <= 0xdfff) {
      saida += "�";
      continue;
    }

    saida += texto[i];
  }
  return saida;
}

/**
 * O tratamento completo de todo texto que vai para a tabela: mascara o que não
 * devia ter sido escrito e tira o que o banco recusa.
 *
 * Uma função só, e chamada num lugar só por campo, porque a versão anterior
 * aplicava `higienizar` em UM dos dois ramos — e o ramo esquecido era
 * justamente o do navegador, o único que um estranho controla.
 */
function limpar(texto: string): string {
  return sanearParaJson(higienizar(texto));
}

/**
 * Máscara para o que não devia ter sido escrito.
 *
 * O erro do PostgREST cita valores — `Key (telefone)=(5541999998888)` é uma
 * mensagem de erro legítima e é PII que ninguém decidiu guardar. A garantia
 * não é do banco: é aqui, antes de gravar.
 *
 * Sequência de 8 dígitos ou mais cobre telefone, CPF e CNPJ; abaixo disso
 * ficam ano, quilometragem e código de status, que são o que se quer ler.
 */
export function higienizar(texto: string): string {
  return texto
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<email>")
    .replace(/\d[\d\s().-]{6,}\d/g, (trecho) =>
      // O trecho casa por FORMA (dígitos com separadores), mas o que decide é a
      // quantidade de dígitos de verdade: `(41) 99999-8888` tem 11, enquanto
      // `2019-01-02` tem 8 e também é mascarado — data em mensagem de erro não
      // vale o risco de deixar telefone passar por um separador a mais.
      trecho.replace(/\D/g, "").length >= 8 ? "<numero>" : trecho,
    );
}

/**
 * A chave do grupo.
 *
 * Normaliza antes de somar: número vira `#` e uuid vira `<uuid>`, senão "lead
 * 123 não encontrado" e "lead 987 não encontrado" viram dois grupos e a tela
 * de triagem mostra mil defeitos onde há um.
 *
 * FNV-1a, e não `createHash`, porque este arquivo vai ao navegador. Não é
 * hash criptográfico e não precisa ser: só distingue grupos.
 */
export function hashDeAgrupamento(partes: string[]): string {
  const texto = partes
    .join(" ")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\d+/g, "#");

  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // 16 hex: dois passes com semente diferente, para caber no CHECK e não
  // colidir à toa entre assuntos parecidos.
  let g = 0x9e3779b9;
  for (let i = texto.length - 1; i >= 0; i--) {
    g ^= texto.charCodeAt(i);
    g = Math.imul(g, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0") + g.toString(16).padStart(8, "0");
}

/** O texto que representa o que foi passado como `detalhe`. */
function descrever(detalhe: unknown): { mensagem: string; stack: string | null } {
  if (detalhe instanceof Error) {
    return { mensagem: `${detalhe.name}: ${detalhe.message}`, stack: detalhe.stack ?? null };
  }
  if (typeof detalhe === "string") return { mensagem: detalhe, stack: null };
  try {
    return { mensagem: JSON.stringify(detalhe) ?? String(detalhe), stack: null };
  } catch {
    return { mensagem: String(detalhe), stack: null };
  }
}

/**
 * `extra` mascarado e com teto.
 *
 * Serializa uma vez, trata como texto (é assim que o PII entra: pelo VALOR,
 * não pela chave) e devolve ao formato. Se não couber no teto, vira um
 * marcador em vez de um objeto pela metade — jsonb truncado não é jsonb.
 */
function extraSeguro(extra: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!extra) return {};
  try {
    const texto = limpar(JSON.stringify(extra));
    if (texto.length > TETO_EXTRA) {
      return { truncado: true, tamanho: texto.length };
    }
    return JSON.parse(texto) as Record<string, unknown>;
  } catch {
    // Referência circular, `BigInt`, getter que lança — nada disso pode
    // derrubar o registro de um erro que já aconteceu.
    return { ilegivel: true };
  }
}

/** Corta a query — é onde moram utm, telefone e token. */
function urlSemQuery(url: string | undefined): string | null {
  if (!url) return null;
  const corte = url.search(/[?#]/);
  return corte === -1 ? url : url.slice(0, corte);
}

function clienteParaGravar(): SupabaseClient | null {
  if (clienteDeServico) return clienteDeServico;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !chave) return null;

  clienteDeServico = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
    // O supabase-js CAPTURA a referência de `fetch` na construção. Sem este
    // repasse, um dublê instalado depois nunca é visto — e o teste passaria
    // sem provar nada.
    global: { fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) },
  });
  return clienteDeServico;
}

/**
 * Grava na fila de triagem. Devolve `true` se a linha foi gravada.
 *
 * Nunca lança: quem chama já está tratando uma falha.
 */
async function gravar(
  // Só estas duas chegam aqui — `parada` não grava, e o tipo estreito é o que
  // impede alguém de "consertar" isso com um ramo que não devia existir.
  natureza: Exclude<Natureza, "parada">,
  assunto: string,
  mensagem: string,
  stack: string | null,
  contexto: Contexto,
): Promise<{ ok: boolean; motivo?: string }> {
  // A chave de serviço não mora no navegador, e a gravação também não.
  if (typeof window !== "undefined") return { ok: false };

  // Interruptor. Desligar a triagem NÃO desliga o aviso de parada.
  if (process.env.OBSERVABILIDADE !== "1") return { ok: false };

  const cliente = clienteParaGravar();
  if (!cliente) return { ok: false };

  const agora = Date.now();
  if (agora < bancoIndisponivelAte) {
    /* Conta o que se perde. Sem isto, 200 erros somem enquanto o disjuntor
       está aberto e a próxima linha gravada não diz nada sobre eles — é a
       diferença entre "olho isso amanhã" e "paro tudo agora", que é o mesmo
       argumento que `alertaDeFalha.ts` já usa para as suprimidas dele.

       Sem `motivo`: o aviso já saiu quando o disjuntor abriu, e repeti-lo a
       cada erro é a enxurrada que se está tentando evitar. O número viaja no
       PRÓXIMO aviso. */
    perdidosPeloDisjuntor += 1;
    return { ok: false };
  }

  const hash = hashDeAgrupamento([assunto, mensagem]);
  const anterior = ultimaGravacao.get(hash);
  if (anterior && agora - anterior.em < CARENCIA_POR_HASH_MS) {
    anterior.suprimidas += 1;
    return { ok: true };
  }

  const suprimidas = anterior?.suprimidas ?? 0;
  // Marca ANTES de gravar: se a gravação demorar, a exceção seguinte não
  // dispara uma segunda linha concorrente.
  ultimaGravacao.set(hash, { em: agora, suprimidas: 0 });

  try {
    const { error } = await cliente
      .from("erros")
      .insert({
        origem: contexto.origem ?? "servidor",
        natureza,
        assunto: assunto.slice(0, TETO_ASSUNTO),
        mensagem: mensagem.slice(0, TETO_MENSAGEM),
        stack: stack ? stack.slice(0, TETO_STACK) : null,
        rota: contexto.rota ?? null,
        metodo: contexto.metodo ?? null,
        // Higienizada também no CAMINHO, não só cortada na query: PII cabe em
        // segmento de rota (`/lead/5541999998888/ficha`).
        url: contexto.url ? limpar(urlSemQuery(contexto.url) ?? "") : null,
        navegador: contexto.navegador ?? null,
        release: contexto.release ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        ambiente: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "desconhecido",
        digest: contexto.digest ?? null,
        ag_uid: contexto.ag_uid ?? null,
        lead_id: contexto.lead_id ?? null,
        hash_agrupamento: hash,
        suprimidas,
        // `extra` é jsonb livre. Hoje só o hook o preenche, com dado
        // inofensivo — mas o PR 3 vai pôr 43 `catch` jogando contexto de
        // requisição aqui, e aí ele precisa das mesmas duas garantias que os
        // campos de texto já têm: mascarado e com teto.
        extra: extraSeguro(contexto.extra),
      })
      .abortSignal(AbortSignal.timeout(TETO_INSERT_MS));

    if (error) {
      /* O banco RESPONDEU, e com código — `22P05`, `PGRST205`, o que for.
         Isso NÃO é banco fora: é dado que ele recusou, ou schema que falta.
         Abrir o disjuntor aqui deixaria qualquer visitante calar a fila de
         triagem por 60 s com um corpo malformado, e ainda fazer o dono
         receber que o banco caiu. Disjuntor é para transporte. */
      const bancoRespondeu = typeof error.code === "string" && error.code !== "";
      if (!bancoRespondeu) bancoIndisponivelAte = Date.now() + DISJUNTOR_MS;
      return { ok: false, motivo: error.message };
    }
    return { ok: true };
  } catch (erro) {
    // Aqui é transporte de verdade: `fetch` estourou, ou o teto abortou.
    bancoIndisponivelAte = Date.now() + DISJUNTOR_MS;
    return { ok: false, motivo: erro instanceof Error ? erro.message : String(erro) };
  }
}

/**
 * Registra uma falha no destino que a natureza dela pede.
 *
 * Nunca lança, nunca bloqueia quem chamou.
 *
 * @param natureza `quebra` (fila de triagem), `parada` (WhatsApp) ou `ambos`.
 *                 Sem default: a escolha é obrigatória no ponto de chamada.
 * @param assunto  Chave curta e ESTÁVEL — é por ela que a carência agrupa e
 *                 por ela que a triagem soma. Não inclua status nem id: um
 *                 token expirado alternando 400/401 furaria a contenção.
 * @param detalhe  O erro, ou um texto. Sendo `Error`, o stack vai junto.
 */
export async function registrarFalha(
  natureza: Natureza,
  assunto: string,
  detalhe: unknown,
  contexto: Contexto = {},
): Promise<void> {
  try {
    const bruto = descrever(detalhe);
    const mensagem = limpar(bruto.mensagem);

    /* ⚠️ O stack tem DUAS origens, e a versão anterior tratava só uma.
       `bruto.stack` é o do servidor, quando `detalhe` é um `Error`.
       `contexto.stack` é o do NAVEGADOR: a porta pública manda `detalhe` como
       string, então `bruto.stack` vem nulo e tudo entra por aqui.

       O ramo esquecido era justamente o único que um estranho controla, numa
       rota sem autenticação e com 90 dias de retenção. Por isso `limpar` é
       aplicado ao RESULTADO da escolha, e não dentro de um dos ramos: não há
       caminho que escape. */
    const stackBruto = bruto.stack ?? contexto.stack ?? null;
    const stack = stackBruto ? limpar(stackBruto) : null;

    const tarefas: Promise<unknown>[] = [];

    if (natureza === "parada" || natureza === "ambos") {
      tarefas.push(alertarFalha(assunto, mensagem));
    }

    if (natureza === "quebra" || natureza === "ambos") {
      tarefas.push(
        gravar(natureza, assunto, mensagem, stack, contexto).then(async (r) => {
          /* A gravação falhou. O aviso sai pelo outro caminho — e com assunto
             próprio, para ter carência independente e não se confundir com o
             erro original.

             O número de perdidos vai junto: uma mensagem dizendo "e mais 200
             não gravados" informa mais, e incomoda menos, que 200 mensagens.
             É a mesma régua de `alertaDeFalha.ts`. */
          if (!r.ok && r.motivo) {
            const perdidos = perdidosPeloDisjuntor;
            perdidosPeloDisjuntor = 0;
            const cauda = perdidos > 0 ? ` — e ${perdidos} não gravado(s) desde o último aviso` : "";
            await alertarFalha("erros-indisponivel", `${assunto}: ${r.motivo}${cauda}`);
          }
        }),
      );
    }

    // `allSettled`, e não `all`: um destino fora não pode cancelar o outro, e
    // os tempos não se somam.
    await Promise.allSettled(tarefas);
  } catch (erro) {
    // Não há a quem avisar sobre isto — só o log, que é exatamente o que não
    // bastava. Fica para quem for investigar por que o registro não chegou.
    console.error("[Observabilidade] o próprio registro falhou:", assunto, erro);
  }
}
