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
 * update, delete, upsert (com `ignoreDuplicates`, pula a linha que já existe
 * nas colunas de `onConflict`; sem ele, sobrescreve), range, os filtros eq, neq, in, is, gte, lte, lt,
 * gt, not(col, "is", null), or("col.is.null,col.lt.X"),
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
  /**
   * Faz falhar as leituras desta tabela cujas colunas pedidas contenham o
   * trecho — para provar o que acontece quando UMA leitura cai.
   */
  quebrarLeitura: (tabela: string, trechoDasColunas: string) => void;
  /**
   * Faz o update desta tabela que grave `valor` em `coluna` falhar como uma
   * restrição do banco (23514) — o banco sem a migração que aceita o valor.
   */
  recusarNoUpdate: (tabela: string, coluna: string, valor: unknown) => void;
  /**
   * O Storage em memória (os anexos, 2026-10-20): `bucket/caminho` → o
   * arquivo. `upload`, `list` (com `search`), `createSignedUrl`,
   * `createSignedUploadUrl` e `remove`. `quebrarStorage` faz a próxima
   * operação daquele nome falhar.
   */
  objetos: Map<string, { bytes: number; tipo: string }>;
  quebrarStorage: (operacao: "upload" | "list" | "createSignedUrl" | "createSignedUploadUrl" | "remove") => void;
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
    atendimento_fotos: () => ({ org_id: LOJA_DE_TESTE, classificado_em: carimbo(), aproveitavel: true, angulo: null, descricao: null }),
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
  const quebradas: { tabela: string; trecho: string }[] = [];
  const recusas: { tabela: string; coluna: string; valor: unknown }[] = [];

  const cadeia = (tabela: string) => {
    let operacao: "select" | "insert" | "update" | "delete" = "select";
    let conflito: string[] | null = null;
    let sobrescrever = false;
    let colunas = "";
    let faixa: [number, number] | null = null;
    let valores: any = null;
    let devolver = false;
    let fim: "single" | "maybeSingle" | null = null;
    const filtros: Filtro[] = [];
    const ordens: { coluna: string; asc: boolean }[] = [];
    let limite: number | null = null;

    const executar = () => {
      if (operacao === "select" && quebradas.some((q) => q.tabela === tabela && colunas.includes(q.trecho))) {
        return { data: null, error: { message: "falha simulada de leitura", code: "XX000" } };
      }
      tabelas[tabela] ??= [];
      const linhas = tabelas[tabela];
      let afetadas: Linha[];
      if (operacao === "insert") {
        const lista = Array.isArray(valores) ? valores : [valores];
        afetadas = [];
        for (const v of lista) {
          const linha = { ...(PADROES[tabela]?.() ?? {}), id: novoId(), ...v };
          const existente = conflito ? linhas.find((l) => conflito!.every((c) => l[c] === linha[c])) : undefined;
          if (existente) {
            // `ignoreDuplicates` pula; sem ele, o upsert sobrescreve as colunas enviadas.
            if (sobrescrever) {
              Object.assign(existente, v);
              afetadas.push(existente);
            }
            continue;
          }
          if (tabela === "atendimento_mensagens" && linha.wa_id && linhas.some((l) => l.wa_id === linha.wa_id)) {
            return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
          }
          linhas.push(linha);
          afetadas.push(linha);
        }
      } else {
        afetadas = linhas.filter((l) => filtros.every((f) => f(l)));
        if (operacao === "update" && recusas.some((r) => r.tabela === tabela && valores && valores[r.coluna] === r.valor)) {
          return { data: null, error: { message: "new row violates check constraint", code: "23514" } };
        }
        if (operacao === "update") for (const l of afetadas) Object.assign(l, valores);
        if (operacao === "delete") tabelas[tabela] = linhas.filter((l) => !afetadas.includes(l));
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
      if (faixa) saida = saida.slice(faixa[0], faixa[1] + 1);
      if (limite !== null) saida = saida.slice(0, limite);
      const copia = saida.map((l) => ({ ...l }));
      if (operacao !== "select" && !devolver) return { data: null, error: null };
      if (fim === "single") return copia.length === 1 ? { data: copia[0], error: null } : { data: null, error: { message: `esperava 1 linha, veio ${copia.length}`, code: "PGRST116" } };
      if (fim === "maybeSingle") return { data: copia[0] ?? null, error: null };
      return { data: copia, error: null };
    };

    const api: any = {
      select(c?: string) {
        if (operacao !== "select") devolver = true;
        else colunas = c ?? "*";
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
      delete() {
        operacao = "delete";
        return api;
      },
      upsert(v: any, o?: { onConflict?: string; ignoreDuplicates?: boolean }) {
        if (!o?.onConflict) throw new Error("upsert só com onConflict no dublê");
        operacao = "insert";
        valores = v;
        conflito = o.onConflict.split(",").map((c) => c.trim());
        sobrescrever = !o.ignoreDuplicates;
        return api;
      },
      range: (de: number, ate: number) => ((faixa = [de, ate]), api),
      eq: (c: string, v: unknown) => (filtros.push((l) => l[c] === v), api),
      neq: (c: string, v: unknown) => (filtros.push((l) => l[c] !== v), api),
      in: (c: string, v: unknown[]) => (filtros.push((l) => v.includes(l[c])), api),
      is: (c: string, v: unknown) => (filtros.push((l) => (v === null ? l[c] === null || l[c] === undefined : l[c] === v)), api),
      gte: (c: string, v: unknown) => (filtros.push((l) => l[c] !== null && l[c] !== undefined && String(l[c]) >= String(v)), api),
      lte: (c: string, v: unknown) => (filtros.push((l) => l[c] !== null && l[c] !== undefined && String(l[c]) <= String(v)), api),
      gt: (c: string, v: unknown) => (filtros.push((l) => l[c] !== null && l[c] !== undefined && String(l[c]) > String(v)), api),
      lt: (c: string, v: unknown) => (filtros.push((l) => l[c] !== null && l[c] !== undefined && String(l[c]) < String(v)), api),
      // Só o que o servidor usa: "col.is.null,col.lt.VALOR" (qualquer um dos termos vale).
      or: (expressao: string) => {
        const termos = expressao.split(",").map((t) => {
          const [c, op, ...resto] = t.split(".");
          const v = resto.join(".");
          if (op === "is" && v === "null") return (l: Linha) => l[c] === null || l[c] === undefined;
          if (op === "lt") return (l: Linha) => l[c] !== null && l[c] !== undefined && String(l[c]) < v;
          throw new Error(`or: o dublê não conhece "${t}"`);
        });
        filtros.push((l) => termos.some((f) => f(l)));
        return api;
      },
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

  const objetos = new Map<string, { bytes: number; tipo: string }>();
  const quebrasDoStorage = new Set<string>();
  const falhou = (operacao: string) => {
    if (!quebrasDoStorage.has(operacao)) return false;
    quebrasDoStorage.delete(operacao);
    return true;
  };
  const storage = {
    from: (bucket: string) => ({
      upload: async (caminho: string, corpo: any, opcoes: { contentType?: string } = {}) => {
        if (falhou("upload")) return { data: null, error: { message: "falha simulada do upload" } };
        const bytes = typeof corpo?.byteLength === "number" ? corpo.byteLength : typeof corpo?.size === "number" ? corpo.size : 0;
        objetos.set(`${bucket}/${caminho}`, { bytes, tipo: opcoes.contentType ?? "application/octet-stream" });
        return { data: { path: caminho }, error: null };
      },
      list: async (pasta: string, opcoes: { search?: string } = {}) => {
        if (falhou("list")) return { data: null, error: { message: "falha simulada da listagem" } };
        const prefixo = `${bucket}/${pasta}/`;
        const data = [...objetos.entries()]
          .filter(([k]) => k.startsWith(prefixo) && !k.slice(prefixo.length).includes("/"))
          .map(([k, v]) => ({ name: k.slice(prefixo.length), metadata: { size: v.bytes, mimetype: v.tipo } }))
          .filter((o) => !opcoes.search || o.name.includes(opcoes.search));
        return { data, error: null };
      },
      createSignedUrl: async (caminho: string, segundos: number, opcoes?: { download?: string | boolean }) => {
        if (falhou("createSignedUrl") || !objetos.has(`${bucket}/${caminho}`)) {
          return { data: null, error: { message: "Object not found" } };
        }
        const baixar = opcoes?.download ? `&download=${encodeURIComponent(String(opcoes.download))}` : "";
        return { data: { signedUrl: `https://storage.teste/${bucket}/${caminho}?token=assinado&ttl=${segundos}${baixar}` }, error: null };
      },
      createSignedUploadUrl: async (caminho: string) => {
        if (falhou("createSignedUploadUrl")) return { data: null, error: { message: "Bucket not found" } };
        return { data: { path: caminho, token: `tok-${caminho}`, signedUrl: `https://storage.teste/upload/${bucket}/${caminho}?token=tok` }, error: null };
      },
      remove: async (caminhos: string[]) => {
        if (falhou("remove")) return { data: null, error: { message: "falha simulada da remoção" } };
        for (const c of caminhos) objetos.delete(`${bucket}/${c}`);
        return { data: caminhos.map((name) => ({ name })), error: null };
      },
    }),
  };

  const cliente = {
    storage,
    from: (t: string) => cadeia(t),
    rpc: async (nome: string, args: any) => {
      chamadasRpc.push({ nome, args });
      const f = rpcs[nome] ?? deFabrica[nome];
      if (!f) return { data: null, error: null };
      return { data: f(args, tabelas), error: null };
    },
  };
  return {
    tabelas,
    cliente,
    rpcs: chamadasRpc,
    quebrarLeitura: (tabela, trecho) => quebradas.push({ tabela, trecho }),
    recusarNoUpdate: (tabela, coluna, valor) => recusas.push({ tabela, coluna, valor }),
    objetos,
    quebrarStorage: (operacao) => quebrasDoStorage.add(operacao),
  };
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
  opcoes: {
    envioRecusado?: (n: number) => boolean;
    antesDoModelo?: (n: number) => Promise<void>;
    /** O modelo de visão: recebe as URLs do pedido de classificação, na ordem, e devolve o conteúdo (ou a recusa, com o HTTP). */
    visao?: (urls: string[]) => string | { erro: string; status?: number };
    /** A Evolution recusa (500) o envio da foto de número n (a partir de 1). */
    fotoRecusada?: (n: number) => boolean;
    /** Chamado a cada foto enviada, antes de a Evolution responder — onde o teste olha o banco "no meio". */
    aoEnviarFoto?: (n: number) => void;
    /** A Evolution não responde a tempo no envio da foto de número n (o `fetch` aborta). */
    fotoSemResposta?: (n: number) => boolean;
    /** A foto do estoque que não baixa nem para o site (o classificador a baixa antes de mandar ao modelo). */
    fotoQueNaoBaixa?: (url: string) => boolean;
    /**
     * O arquivo de uma mensagem recebida (`getBase64FromMediaMessage`), pelo
     * id da mensagem e se pediu a conversão para MP4. Sem a opção, a
     * Evolution responde 400.
     */
    arquivoDaMensagem?: (waId: string, converterParaMp4: boolean) => { conteudo: string; mimetype?: string; fileName?: string } | { erro: string; status?: number };
    /** A Evolution recusa (500) o anexo de número n (a partir de 1). */
    anexoRecusado?: (n: number) => boolean;
  } = {},
) {
  const enviados: { numero: string; texto: string }[] = [];
  const recusados: { numero: string; texto: string }[] = [];
  const pedidosAoModelo: any[] = [];
  const pedidosDeVisao: string[][] = [];
  /** O `image_url.url` como saiu, sem decodificar: a foto vai embutida (data URL), não como link. */
  const imagensDaVisao: string[][] = [];
  /** As fotos que o classificador baixou, na ordem. */
  const fotosBaixadas: string[] = [];
  const modelosDaVisao: string[] = [];
  /** Tudo o que saiu pela Evolution, na ordem: texto, foto, anexo e áudio. */
  const saidas: (
    | { tipo: "texto"; numero: string; texto: string }
    | { tipo: "foto"; numero: string; url: string; legenda: string | null }
    | { tipo: "anexo"; numero: string; mediatype: string; mimetype: string; url: string; legenda: string | null; nome: string | null }
    | { tipo: "audio"; numero: string; url: string }
  )[] = [];
  /** Os pedidos de arquivo de mensagem recebida: id e conversão. */
  const arquivosPedidos: { waId: string; converterParaMp4: boolean }[] = [];
  let tentativasDeAnexo = 0;
  let i = 0;
  let tentativas = 0;
  let tentativasDeFoto = 0;
  const transporte = async (url: string, init?: RequestInit) => {
    const corpo = init?.body ? JSON.parse(String(init.body)) : null;
    if (url.includes("/chat/getBase64FromMediaMessage/")) {
      const waId = corpo?.message?.key?.id;
      arquivosPedidos.push({ waId, converterParaMp4: corpo?.convertToMp4 === true });
      const r = opcoes.arquivoDaMensagem?.(waId, corpo?.convertToMp4 === true) ?? { erro: "Message not found", status: 400 };
      if ("erro" in r) return new Response(JSON.stringify({ response: { message: [r.erro] } }), { status: r.status ?? 400 });
      return new Response(
        JSON.stringify({ base64: Buffer.from(r.conteudo).toString("base64"), mimetype: r.mimetype ?? null, fileName: r.fileName ?? null }),
        { status: 200 },
      );
    }
    if (url.includes("/message/sendWhatsAppAudio/") || (url.includes("/message/sendMedia/") && corpo?.mediatype !== "image")) {
      tentativasDeAnexo += 1;
      if (opcoes.anexoRecusado?.(tentativasDeAnexo)) {
        return new Response(JSON.stringify({ message: "media download failed" }), { status: 500 });
      }
      if (url.includes("/message/sendWhatsAppAudio/")) saidas.push({ tipo: "audio", numero: corpo.number, url: corpo.audio });
      else saidas.push({ tipo: "anexo", numero: corpo.number, mediatype: corpo.mediatype, mimetype: corpo.mimetype, url: corpo.media, legenda: corpo.caption ?? null, nome: corpo.fileName ?? null });
      return new Response(JSON.stringify({ key: { id: `WA-ANEXO-${saidas.length}` } }), { status: 201 });
    }
    if (url.includes("/message/sendMedia/") && corpo?.mimetype) {
      // A foto do PAINEL (com mimetype) é anexo; a do carro, do assistente, não leva mimetype.
      tentativasDeAnexo += 1;
      if (opcoes.anexoRecusado?.(tentativasDeAnexo)) {
        return new Response(JSON.stringify({ message: "media download failed" }), { status: 500 });
      }
      saidas.push({ tipo: "anexo", numero: corpo.number, mediatype: corpo.mediatype, mimetype: corpo.mimetype, url: corpo.media, legenda: corpo.caption ?? null, nome: corpo.fileName ?? null });
      return new Response(JSON.stringify({ key: { id: `WA-ANEXO-${saidas.length}` } }), { status: 201 });
    }
    if (url.includes("/message/sendMedia/")) {
      tentativasDeFoto += 1;
      opcoes.aoEnviarFoto?.(tentativasDeFoto);
      if (opcoes.fotoSemResposta?.(tentativasDeFoto)) {
        const abortado = new Error("This operation was aborted");
        abortado.name = "AbortError";
        throw abortado;
      }
      if (opcoes.fotoRecusada?.(tentativasDeFoto)) {
        return new Response(JSON.stringify({ message: "media download failed" }), { status: 500 });
      }
      saidas.push({ tipo: "foto", numero: corpo.number, url: corpo.media, legenda: corpo.caption ?? null });
      return new Response(JSON.stringify({ key: { id: `WA-FOTO-${saidas.length}` } }), { status: 201 });
    }
    if (url.endsWith("/chat/completions")) {
      const imagens = (corpo.messages as any[]).flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((p: any) => p.type === "image_url");
      if (imagens.length > 0) {
        const cruas: string[] = imagens.map((p: any) => p.image_url.url);
        imagensDaVisao.push(cruas);
        // A foto embutida traz no corpo a própria URL (ver o GET abaixo): o dublê lê de volta.
        const urls = cruas.map((u) => (u.startsWith("data:") ? Buffer.from(u.slice(u.indexOf(",") + 1), "base64").toString() : u));
        pedidosDeVisao.push(urls);
        modelosDaVisao.push(corpo.model);
        const r = opcoes.visao ? opcoes.visao(urls) : { erro: "sem visão no dublê" };
        if (typeof r !== "string") return new Response(JSON.stringify({ error: { message: r.erro } }), { status: r.status ?? 500 });
        return new Response(JSON.stringify({ choices: [{ message: { content: r } }], usage: { prompt_tokens: 300 * urls.length, completion_tokens: 40 * urls.length } }), { status: 200 });
      }
    }
    if (url.includes("/message/sendText/")) {
      tentativas += 1;
      if (opcoes.envioRecusado?.(tentativas)) {
        recusados.push({ numero: corpo.number, texto: corpo.text });
        return new Response(JSON.stringify({ message: "instance not connected" }), { status: 500 });
      }
      enviados.push({ numero: corpo.number, texto: corpo.text });
      saidas.push({ tipo: "texto", numero: corpo.number, texto: corpo.text });
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
    if (!init?.method || init.method === "GET") {
      // A foto do estoque, que o classificador baixa para embutir no pedido.
      // O corpo é a própria URL, para o dublê da visão saber qual foto é.
      fotosBaixadas.push(url);
      if (opcoes.fotoQueNaoBaixa?.(url)) return new Response("Not Found", { status: 404 });
      return new Response(url, { status: 200, headers: { "content-type": "image/jpeg" } });
    }
    throw new Error(`URL inesperada no dublê: ${url}`);
  };
  return {
    transporte: transporte as unknown as typeof fetch,
    enviados,
    recusados,
    pedidosAoModelo,
    pedidosDeVisao,
    imagensDaVisao,
    fotosBaixadas,
    modelosDaVisao,
    saidas,
    arquivosPedidos,
  };
}
