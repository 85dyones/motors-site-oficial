/* eslint-disable @typescript-eslint/no-explicit-any -- dublê do supabase-js: imita uma API encadeável sem tipos gerados */
/**
 * Um banco em memória para o atendimento por IA (2026-10-20) — o pedaço do
 * supabase-js que `lib/atendimento-servidor.ts` encadeia, filtrando linhas de
 * verdade em vez de devolver respostas escritas à mão.
 *
 * O dublê de `supabaseDaConsultaDeDocumento.ts` registra a cadeia e deixa o
 * teste responder; aqui a orquestração inteira (achar o lead, travar a
 * mensagem, mudar o dono, gravar a conversa) precisa ver o efeito das escritas
 * anteriores, então o banco guarda as tabelas e aplica os filtros.
 *
 * Suporta: select (as colunas são ignoradas, volta a linha inteira), insert,
 * update, os filtros eq, neq, in, is, gte, lte, lt, gt, not(col, "is", null),
 * order (uma ou mais, na ordem em que foram pedidas), limit, single/maybeSingle
 * e o `await` direto; `rpc` por função registrada. O índice único de
 * `atendimento_mensagens (wa_id)` é simulado, com o código 23505 que o
 * Postgres devolve.
 *
 * Duas funções do banco vêm de fábrica (o teste pode trocar): `org_padrao`
 * devolve `LOJA_DE_TESTE`, e `achar_ou_criar_lead_do_whatsapp` repete a da
 * migração — o lead aberto por qualquer forma do telefone, ou um novo; o
 * atendimento sem Chatwoot, ou um novo herdando as etiquetas. Como o
 * JavaScript não se intercala dentro de uma chamada síncrona, ela já é
 * "atômica" como a trava por telefone do Postgres.
 */

export const LOJA_DE_TESTE = "00000000-0000-4000-8000-0000000000aa";

type Linha = Record<string, any>;
type Filtro = (l: Linha) => boolean;

export interface BancoDeTeste {
  tabelas: Record<string, Linha[]>;
  cliente: any;
  rpcs: { nome: string; args: any }[];
}

let sequencia = 0;
const novoId = () => {
  sequencia += 1;
  return `00000000-0000-4000-8000-${String(sequencia).padStart(12, "0")}`;
};

/**
 * Os `default` do banco. O carimbo vem do relógio do teste, e cada inserção
 * anda um milissegundo: a ordem da conversa é a ordem em que as linhas
 * entraram, como num banco de verdade.
 */
function padroes(carimbo: () => string): Record<string, () => Linha> {
  return {
    leads: () => ({ created_at: carimbo(), desfecho: null, responsavel: null, cadencia_passo: 0, alertas: 0 }),
    atendimento_mensagens: () => ({ criado_em: carimbo(), respondida_em: null, wa_id: null, erro: null, gatilho: null }),
    atendimento_qualificacoes: () => ({ criado_em: carimbo() }),
    atendimentos: () => ({ created_at: carimbo(), humano_assumiu_em: null, chatwoot_conversation_id: null }),
    leads_eventos: () => ({ criado_em: carimbo() }),
  };
}

function comparar(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return String(a) < String(b) ? -1 : 1;
}

export function bancoDeTeste(
  inicial: Record<string, Linha[]> = {},
  rpcs: Record<string, (args: any, tabelas: Record<string, Linha[]>) => any> = {},
  relogio: () => Date = () => new Date(),
): BancoDeTeste {
  let passo = 0;
  const PADROES = padroes(() => new Date(relogio().getTime() + passo++).toISOString());
  const tabelas: Record<string, Linha[]> = {};
  for (const [nome, linhas] of Object.entries(inicial)) tabelas[nome] = linhas.map((l) => ({ ...l }));
  const chamadasRpc: { nome: string; args: any }[] = [];

  const cadeia = (tabela: string) => {
    let operacao: "select" | "insert" | "update" = "select";
    let valores: any = null;
    let devolver = false;
    let fim: "single" | "maybeSingle" | null = null;
    const filtros: Filtro[] = [];
    const ordens: { coluna: string; asc: boolean }[] = [];
    let limite: number | null = null;

    const executar = () => {
      tabelas[tabela] ??= [];
      const linhas = tabelas[tabela];
      let afetadas: Linha[];
      if (operacao === "insert") {
        const lista = Array.isArray(valores) ? valores : [valores];
        afetadas = [];
        for (const v of lista) {
          const linha = { ...(PADROES[tabela]?.() ?? {}), id: novoId(), ...v };
          if (tabela === "atendimento_mensagens" && linha.wa_id && linhas.some((l) => l.wa_id === linha.wa_id)) {
            return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
          }
          linhas.push(linha);
          afetadas.push(linha);
        }
      } else {
        afetadas = linhas.filter((l) => filtros.every((f) => f(l)));
        if (operacao === "update") for (const l of afetadas) Object.assign(l, valores);
      }
      let saida = [...afetadas];
      if (ordens.length > 0) {
        saida.sort((a, b) => {
          for (const { coluna, asc } of ordens) {
            const c = asc ? comparar(a[coluna], b[coluna]) : comparar(b[coluna], a[coluna]);
            if (c !== 0) return c;
          }
          return 0;
        });
      }
      if (limite !== null) saida = saida.slice(0, limite);
      const copia = saida.map((l) => ({ ...l }));
      if (operacao !== "select" && !devolver) return { data: null, error: null };
      if (fim === "single") return copia.length === 1 ? { data: copia[0], error: null } : { data: null, error: { message: `esperava 1 linha, veio ${copia.length}`, code: "PGRST116" } };
      if (fim === "maybeSingle") return { data: copia[0] ?? null, error: null };
      return { data: copia, error: null };
    };

    const api: any = {
      select() {
        if (operacao !== "select") devolver = true;
        return api;
      },
      insert(v: any) {
        operacao = "insert";
        valores = v;
        return api;
      },
      update(v: any) {
        operacao = "update";
        valores = v;
        return api;
      },
      eq: (c: string, v: unknown) => (filtros.push((l) => l[c] === v), api),
      neq: (c: string, v: unknown) => (filtros.push((l) => l[c] !== v), api),
      in: (c: string, v: unknown[]) => (filtros.push((l) => v.includes(l[c])), api),
      is: (c: string, v: unknown) => (filtros.push((l) => (v === null ? l[c] === null || l[c] === undefined : l[c] === v)), api),
      gte: (c: string, v: unknown) => (filtros.push((l) => l[c] !== null && l[c] !== undefined && String(l[c]) >= String(v)), api),
      lte: (c: string, v: unknown) => (filtros.push((l) => l[c] !== null && l[c] !== undefined && String(l[c]) <= String(v)), api),
      gt: (c: string, v: unknown) => (filtros.push((l) => l[c] !== null && l[c] !== undefined && String(l[c]) > String(v)), api),
      lt: (c: string, v: unknown) => (filtros.push((l) => l[c] !== null && l[c] !== undefined && String(l[c]) < String(v)), api),
      not: (c: string, op: string, v: unknown) => {
        if (op !== "is" || v !== null) throw new Error(`not(${op}) não suportado no dublê`);
        filtros.push((l) => l[c] !== null && l[c] !== undefined);
        return api;
      },
      order: (c: string, o?: { ascending?: boolean }) => (ordens.push({ coluna: c, asc: o?.ascending !== false }), api),
      limit: (n: number) => ((limite = n), api),
      single: () => ((fim = "single"), Promise.resolve(executar())),
      maybeSingle: () => ((fim = "maybeSingle"), Promise.resolve(executar())),
      then: (ok: any, falha: any) => Promise.resolve(executar()).then(ok, falha),
    };
    return api;
  };

  const maisRecente = (a: Linha, b: Linha) =>
    comparar(b.iniciado_em ?? b.created_at, a.iniciado_em ?? a.created_at) || comparar(b.created_at, a.created_at);
  const deFabrica: Record<string, (args: any, t: Record<string, Linha[]>) => any> = {
    org_padrao: () => LOJA_DE_TESTE,
    achar_ou_criar_lead_do_whatsapp: (args, t) => {
      const leads = (t.leads ??= []);
      let lead = leads
        .filter((l) => args.p_formas.includes(l.telefone) && !l.desfecho)
        .sort((a, b) => comparar(b.created_at, a.created_at))[0];
      let criado = false;
      if (!lead) {
        lead = {
          ...PADROES.leads(),
          id: novoId(),
          nome: String(args.p_nome ?? "").trim() || `WhatsApp ${String(args.p_telefone).slice(-4)}`,
          telefone: args.p_telefone,
          canal: "WhatsApp",
          situacao: "novo",
          origem_conversa: args.p_origem ?? null,
          assistente_fase: args.p_assistente_fase ?? null,
        };
        leads.push(lead);
        criado = true;
      }
      const atendimentos = (t.atendimentos ??= []);
      const doLead = atendimentos.filter((a) => a.lead_id === lead.id).sort(maisRecente);
      let atendimento = doLead.find((a) => a.chatwoot_conversation_id === null || a.chatwoot_conversation_id === undefined);
      if (!atendimento) {
        atendimento = {
          ...PADROES.atendimentos(),
          id: novoId(),
          lead_id: lead.id,
          iniciado_em: relogio().toISOString(),
          com_assistente: false,
          status_conversa: "open",
          tags: doLead[0]?.tags ?? null,
        };
        atendimentos.push(atendimento);
      }
      return [{ lead_id: lead.id, atendimento_id: atendimento.id, criado }];
    },
  };

  const cliente = {
    from: (t: string) => cadeia(t),
    rpc: async (nome: string, args: any) => {
      chamadasRpc.push({ nome, args });
      const f = rpcs[nome] ?? deFabrica[nome];
      if (!f) return { data: null, error: null };
      return { data: f(args, tabelas), error: null };
    },
  };
  return { tabelas, cliente, rpcs: chamadasRpc };
}

/**
 * Uma Evolution e uma DeepSeek de mentira, no mesmo `fetch`.
 *
 * `envioRecusado` faz a Evolution recusar (500) o envio de número n (a partir
 * de 1); `antesDoModelo` roda antes de cada resposta do modelo — é onde o
 * teste faz o cliente escrever DURANTE a resposta.
 */
export function transporteDeTeste(
  respostasDoModelo: (string | { erro: string })[] = [],
  opcoes: { envioRecusado?: (n: number) => boolean; antesDoModelo?: (n: number) => Promise<void> } = {},
) {
  const enviados: { numero: string; texto: string }[] = [];
  const recusados: { numero: string; texto: string }[] = [];
  const pedidosAoModelo: any[] = [];
  let i = 0;
  let tentativas = 0;
  const transporte = async (url: string, init?: RequestInit) => {
    const corpo = init?.body ? JSON.parse(String(init.body)) : null;
    if (url.includes("/message/sendText/")) {
      tentativas += 1;
      if (opcoes.envioRecusado?.(tentativas)) {
        recusados.push({ numero: corpo.number, texto: corpo.text });
        return new Response(JSON.stringify({ message: "instance not connected" }), { status: 500 });
      }
      enviados.push({ numero: corpo.number, texto: corpo.text });
      return new Response(JSON.stringify({ key: { id: `WA-SAIDA-${enviados.length}` } }), { status: 201 });
    }
    if (url.endsWith("/chat/completions")) {
      pedidosAoModelo.push(corpo);
      await opcoes.antesDoModelo?.(pedidosAoModelo.length);
      const r = respostasDoModelo[Math.min(i, respostasDoModelo.length - 1)];
      i += 1;
      if (!r || typeof r !== "string") return new Response(JSON.stringify({ error: { message: (r as { erro: string })?.erro ?? "sem resposta" } }), { status: 500 });
      return new Response(
        JSON.stringify({ choices: [{ message: { content: r } }], usage: { prompt_tokens: 1000, prompt_cache_hit_tokens: 800, completion_tokens: 100 } }),
        { status: 200 },
      );
    }
    throw new Error(`URL inesperada no dublê: ${url}`);
  };
  return { transporte: transporte as unknown as typeof fetch, enviados, recusados, pedidosAoModelo };
}
