/**
 * O perfil do Garagem Match Profiler guardado no próprio lead — coluna
 * `leads.perfil` (migração 20260925200000).
 *
 * ---------------------------------------------------------------------------
 * Por que existe
 * ---------------------------------------------------------------------------
 * O Profiler (`components/CarMatch.tsx`) manda em `intencao_busca` o que o
 * consultor precisa para abrir a conversa sem refazer o questionário: o
 * orçamento, o que o cliente respondeu (quem vai no carro, o jeito, o câmbio,
 * o que não pode faltar), os filtros que ele aceitou tirar e os carros que o
 * site mostrou, cada um com o porquê. Até 25/09/2026 isso só chegava ao n8n:
 * `/api/leads` gravava do Profiler apenas o `interesse` — a mensagem do
 * WhatsApp —, e o card do kanban não tinha o resto. O consultor perguntava de
 * novo o que o cliente tinha acabado de responder ao site.
 *
 * É o mesmo buraco que a avaliação tinha até 24/09, e este arquivo segue o
 * molde de `lib/avaliacaoDoLead.ts`: `montarPerfilDoLead` na gravação
 * (servidor) e `lerPerfilDoLead` na leitura (painel).
 *
 * ---------------------------------------------------------------------------
 * Uma normalização só, nas duas pontas
 * ---------------------------------------------------------------------------
 * Na gravação, o corpo vem de formulário PÚBLICO: `canal` e `intencao_busca`
 * são o que o navegador — ou quem chama a rota à mão — quis escrever. Na
 * leitura, a coluna é jsonb que o staff pode escrever pelo PostgREST, e um
 * `versao: 2` futuro pode mudar a forma. A lição da avaliação vale inteira:
 * a primeira versão de `lerAvaliacaoDoLead` conferia três campos e devolvia o
 * resto como veio, e um retrato torto derrubava `/admin/leads` inteira.
 *
 * Por isso as duas pontas passam pela MESMA função, campo a campo: texto
 * aparado e com teto, lista com teto de itens, número finito e dentro do
 * teto, e enum só se estiver na lista — conferido com `Object.hasOwn`, nunca
 * com `in`, pelo mesmo "constructor" que já passou por estado de conservação
 * (revisão de 24/09). Nada passa "como veio".
 *
 * Os nomes dos campos são os de `intencao_busca`, de propósito: o consultor
 * que lê o card, o n8n que recebe o corpo e quem consulta a coluna leem a
 * mesma coisa pelo mesmo nome — inclusive o `perfil` aninhado, que são as
 * respostas do questionário.
 *
 * O cliente nunca vê nada disto: é insumo do consultor.
 */

/** O que o cliente quis ao deixar o contato. */
export type ModoDoPerfil = "carros" | "aviso" | "ajuda";

/** A aba de orçamento que ele usou: faixas prontas, valor exato ou "descrever". */
export type AbaDoOrcamento = "presets" | "custom" | "porMes" | "ai";

/**
 * Onde o carro apareceu na tela do resultado: os três cartões e a carta "Já
 * pensou neste?".
 */
export type LugarDoCarro = "principal" | "tambem" | "outro-caminho" | "abaixo-da-faixa" | "ja-pensou";

/** O filtro que o cliente tirou no "e se". */
export type FiltroAfrouxado = "portas" | "automatico" | "carroceria" | "ano" | "km" | "diesel";

/** As respostas do questionário, com os rótulos exatamente como o cliente tocou. */
export interface RespostasDoPerfil {
  /** "Eu e mais um", "Família, criança na cadeirinha"… — "" quando pulou. */
  leva: string;
  /** `[]` é "tanto faz" OU pergunta pulada — o card não adivinha qual. */
  jeitos: string[];
  cambio: string;
  nao_pode_faltar: string[];
}

export interface CarroDoPerfil {
  /** O id do anúncio, em texto. `null` quando não veio legível. */
  id: string | null;
  nome: string;
  /** O preço da tela do cliente no envio. `null` quando ilegível. */
  preco: number | null;
  /** `null` quando o lugar gravado não é um dos conhecidos. */
  lugar: LugarDoCarro | null;
  manchete: string;
  pesa_contra: string | null;
  /** POR MÊS: a parcela estimada que a tela mostrou; `null` fora dele. */
  parcela: number | null;
}

/**
 * A aba POR MÊS, como o cliente a respondeu. A entrada é a ESTIMATIVA dele —
 * o dinheiro e o que espera da troca —, e não avaliação da loja.
 */
export interface PorMesDoPerfil {
  parcela: number | null;
  entrada: number | null;
  prazo: number | null;
  ocupacao: string;
  troca: boolean;
}

export interface PerfilDoLead {
  versao: 1;
  /** O texto livre da aba DESCREVER — "" quando não usou. */
  aiQuery: string;
  budgetTab: AbaDoOrcamento | null;
  modo: ModoDoPerfil | null;
  orcamento: string;
  filtros: string[];
  afrouxados: FiltroAfrouxado[];
  prazo: string;
  perfil: RespostasDoPerfil;
  /** Quantos carros passavam em tudo na faixa; `null` quando a busca falhou. */
  na_faixa: number | null;
  carros: CarroDoPerfil[];
  /** `null` quando a pessoa respondeu o orçamento em preço, e nos leads de antes do POR MÊS. */
  por_mes: PorMesDoPerfil | null;
}

/** O canal que o Profiler escreve no corpo — é o que separa esta forma das outras. */
export const CANAL_DO_PROFILER = "Garagem Match Profiler";

// ---------------------------------------------------------------------------
// Rótulos — para o card, e também as listas de valores aceitos
// ---------------------------------------------------------------------------
//
// Cada registro abaixo é a lista de valores aceitos do seu enum: o que não é
// chave PRÓPRIA dele não passa. As listas são escritas aqui, e não importadas
// do motor (`lib/motorDoMatch.ts`), porque descrevem o que pode estar GRAVADO,
// e não o que o motor emite hoje: um filtro que o motor deixar de ter continua
// nos leads antigos, e o card desses leads precisa continuar sabendo nomeá-lo.

export const ROTULO_DO_MODO: Record<ModoDoPerfil, string> = {
  carros: "Quer ver estes carros",
  aviso: "Pediu aviso quando chegar",
  ajuda: "A busca falhou — pediu ajuda",
};

export const ROTULO_DO_LUGAR: Record<LugarDoCarro, string> = {
  principal: "O mais perto do que pediu",
  tambem: "Também atende",
  "outro-caminho": "Outro caminho",
  "abaixo-da-faixa": "Abaixo da faixa",
  "ja-pensou": "Já pensou neste?",
};

/**
 * O filtro tirado, dito como o consultor o leria em "Aceitou tirar: …".
 *
 * Ano e km vão pelo nome do filtro, sem o número: o número é do questionário
 * ("2020 ou mais novo", "até 80 mil km") e pode mudar; o rótulo aqui vale para
 * os leads de antes e de depois.
 */
export const ROTULO_DO_AFROUXADO: Record<FiltroAfrouxado, string> = {
  portas: "4 portas",
  automatico: "câmbio automático",
  carroceria: "tipo de carroceria",
  ano: "ano mínimo",
  km: "limite de km",
  diesel: "diesel",
};

/** A aba não aparece no card; a lista só diz quais valores gravar. */
const ABAS_DO_ORCAMENTO: readonly string[] = ["presets", "custom", "porMes", "ai"] satisfies AbaDoOrcamento[];

// ---------------------------------------------------------------------------
// Tetos
// ---------------------------------------------------------------------------

/**
 * Tetos de texto e de lista. São escolhas, não medições: folga sobre o que o
 * Profiler manda de verdade, e corte para o que só pode ser erro ou abuso.
 *   - rótulo (orçamento, prazo, filtro, resposta, nome do carro): folga larga
 *     sobre os rótulos do questionário e o nome curto do carro;
 *   - frase (manchete, "pesa contra"): uma linha de explicação do motor;
 *   - texto livre: o campo da aba DESCREVER.
 * Os tetos de lista seguem o questionário: 4 jeitos de carro existem, "não
 * pode faltar" aceita até 3, e o resultado mostra 3 cartões mais a carta "Já
 * pensou neste?". Filtros ativos o motor escreve no máximo 7 hoje
 * (`filtrosLegiveis`): faixa, portas, câmbio, carroceria, ano, km e diesel.
 */
const TETOS = {
  rotulo: 120,
  frase: 300,
  texto_livre: 500,
  id: 60,
  filtros: 12,
  jeitos: 4,
  nao_pode_faltar: 3,
  carros: 4,
} as const;

/**
 * Acima disto não é preço de carro nem contagem de pátio: é dedo pesado ou
 * número forjado. O mesmo teto do valor da avaliação.
 */
export const TETO_DOS_NUMEROS_DO_PERFIL = 100_000_000;

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

/**
 * Objeto de verdade: nem lista, nem `null`, nem instância de classe. O que vem
 * de `JSON.parse` e do PostgREST sempre passa; `Date`, `Map` e afins, não.
 */
function ehObjetoSimples(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const prototipo = Object.getPrototypeOf(v);
  return prototipo === Object.prototype || prototipo === null;
}

/**
 * O campo, só se for do PRÓPRIO objeto. Um campo herdado do protótipo não é
 * dado que alguém mandou — e com protótipo poluído, seria dado que ninguém
 * mandou.
 */
function campo(obj: Record<string, unknown>, chave: string): unknown {
  return Object.hasOwn(obj, chave) ? obj[chave] : undefined;
}

/** Texto aparado e com teto. O que não é string vira "" — número não é rótulo. */
function texto(v: unknown, teto: number): string {
  return typeof v === "string" ? v.trim().slice(0, teto).trim() : "";
}

/**
 * Lista de rótulos: só os de texto, sem vazio nem repetido, até `tetoDeItens`.
 * O laço para ao encher, então uma lista forjada de um milhão de itens custa o
 * mesmo que uma de verdade até ali.
 */
function listaDeTextos(v: unknown, tetoDeItens: number, tetoDoTexto: number): string[] {
  if (!Array.isArray(v)) return [];
  const saida: string[] = [];
  for (const item of v) {
    if (saida.length >= tetoDeItens) break;
    const t = texto(item, tetoDoTexto);
    if (t && !saida.includes(t)) saida.push(t);
  }
  return saida;
}

/** Número finito, de 0 até abaixo do teto — ou `null`. Texto não vale. */
function numero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v < TETO_DOS_NUMEROS_DO_PERFIL ? v : null;
}

function ehModo(v: unknown): v is ModoDoPerfil {
  return typeof v === "string" && Object.hasOwn(ROTULO_DO_MODO, v);
}

function ehAba(v: unknown): v is AbaDoOrcamento {
  // `includes` compara valor, e não procura chave: "constructor" não passa.
  return typeof v === "string" && ABAS_DO_ORCAMENTO.includes(v);
}

function ehLugar(v: unknown): v is LugarDoCarro {
  return typeof v === "string" && Object.hasOwn(ROTULO_DO_LUGAR, v);
}

function ehAfrouxado(v: unknown): v is FiltroAfrouxado {
  return typeof v === "string" && Object.hasOwn(ROTULO_DO_AFROUXADO, v);
}

function afrouxados(v: unknown): FiltroAfrouxado[] {
  if (!Array.isArray(v)) return [];
  const saida: FiltroAfrouxado[] = [];
  const total = Object.keys(ROTULO_DO_AFROUXADO).length;
  for (const item of v) {
    if (saida.length >= total) break;
    if (ehAfrouxado(item) && !saida.includes(item)) saida.push(item);
  }
  return saida;
}

/** O id do anúncio: texto, ou número inteiro (o RevendaMais numera). */
function idDoCarro(v: unknown): string | null {
  if (typeof v === "number") return Number.isSafeInteger(v) && v >= 0 ? String(v) : null;
  return texto(v, TETOS.id) || null;
}

/** Os carros da tela: só os que têm nome, até o teto, cada campo conferido. */
function carros(v: unknown): CarroDoPerfil[] {
  if (!Array.isArray(v)) return [];
  const saida: CarroDoPerfil[] = [];
  for (const bruto of v) {
    if (saida.length >= TETOS.carros) break;
    if (!ehObjetoSimples(bruto)) continue;
    const nome = texto(campo(bruto, "nome"), TETOS.rotulo);
    // Carro sem nome não tem o que o card mostrar.
    if (!nome) continue;
    const lugar = campo(bruto, "lugar");
    saida.push({
      id: idDoCarro(campo(bruto, "id")),
      nome,
      preco: numero(campo(bruto, "preco")),
      lugar: ehLugar(lugar) ? lugar : null,
      manchete: texto(campo(bruto, "manchete"), TETOS.frase),
      pesa_contra: texto(campo(bruto, "pesa_contra"), TETOS.frase) || null,
      parcela: numero(campo(bruto, "parcela")),
    });
  }
  return saida;
}

/**
 * A normalização única, das duas pontas. Campo ausente vira vazio: é assim que
 * o lead da fase 1 (antes de 25/09, sem `perfil` nem `na_faixa`) continua
 * legível, e é assim que um campo forjado deixa de existir.
 */
function normalizar(bruto: Record<string, unknown>): PerfilDoLead {
  const r = campo(bruto, "perfil");
  const respostas: Record<string, unknown> = ehObjetoSimples(r) ? r : {};
  const modo = campo(bruto, "modo");
  const aba = campo(bruto, "budgetTab");
  const naFaixa = numero(campo(bruto, "na_faixa"));

  return {
    versao: 1,
    aiQuery: texto(campo(bruto, "aiQuery"), TETOS.texto_livre),
    budgetTab: ehAba(aba) ? aba : null,
    modo: ehModo(modo) ? modo : null,
    orcamento: texto(campo(bruto, "orcamento"), TETOS.rotulo),
    filtros: listaDeTextos(campo(bruto, "filtros"), TETOS.filtros, TETOS.rotulo),
    afrouxados: afrouxados(campo(bruto, "afrouxados")),
    prazo: texto(campo(bruto, "prazo"), TETOS.rotulo),
    perfil: {
      leva: texto(campo(respostas, "leva"), TETOS.rotulo),
      jeitos: listaDeTextos(campo(respostas, "jeitos"), TETOS.jeitos, TETOS.rotulo),
      cambio: texto(campo(respostas, "cambio"), TETOS.rotulo),
      nao_pode_faltar: listaDeTextos(campo(respostas, "nao_pode_faltar"), TETOS.nao_pode_faltar, TETOS.rotulo),
    },
    // Contagem é inteira: "2,5 carros na faixa" só pode ser número forjado.
    na_faixa: naFaixa !== null && Number.isInteger(naFaixa) ? naFaixa : null,
    carros: carros(campo(bruto, "carros")),
    por_mes: porMes(campo(bruto, "por_mes")),
  };
}

/** A aba POR MÊS: só com parcela legível; o resto, campo a campo. */
function porMes(v: unknown): PorMesDoPerfil | null {
  if (!ehObjetoSimples(v)) return null;
  const parcela = numero(campo(v, "parcela"));
  if (parcela === null || parcela === 0) return null;
  const prazo = numero(campo(v, "prazo"));
  return {
    parcela,
    entrada: numero(campo(v, "entrada")),
    // Prazo é contagem de meses: inteiro, e nada acima de 10 anos.
    prazo: prazo !== null && Number.isInteger(prazo) && prazo <= 120 ? prazo : null,
    ocupacao: texto(campo(v, "ocupacao"), TETOS.rotulo),
    troca: campo(v, "troca") === true,
  };
}

/**
 * Sobrou alguma coisa para o consultor ler? A aba de orçamento sozinha não
 * conta: ela diz COMO o cliente respondeu, não O QUÊ.
 */
function temConteudo(p: PerfilDoLead): boolean {
  return Boolean(
    p.modo ||
      p.orcamento ||
      p.aiQuery ||
      p.prazo ||
      p.filtros.length ||
      p.afrouxados.length ||
      p.carros.length ||
      p.na_faixa !== null ||
      p.perfil.leva ||
      p.perfil.cambio ||
      p.perfil.jeitos.length ||
      p.perfil.nao_pode_faltar.length ||
      p.por_mes !== null,
  );
}

/**
 * O perfil que vai para `leads.perfil`, montado a partir do corpo do POST de
 * `/api/leads` — ou `null`, que é "este lead não tem perfil".
 *
 * `null` para todo canal que não é o Profiler: os outros formulários também
 * mandam `intencao_busca`, mas `{}` ou `{ popup_campaign }`, e um perfil vazio
 * gravado neles faria o card mostrar um bloco oco. E `null` quando
 * `intencao_busca` não é objeto, ou quando nada dela sobra depois da
 * normalização.
 *
 * O canal NÃO é prova de origem — vem do corpo, e qualquer um o escreve. Ele
 * só diz qual forma esperar; quem segura o forjado é a normalização.
 */
export function montarPerfilDoLead(corpo: Record<string, unknown>): PerfilDoLead | null {
  if (!ehObjetoSimples(corpo) || campo(corpo, "canal") !== CANAL_DO_PROFILER) return null;
  const intencao = campo(corpo, "intencao_busca");
  if (!ehObjetoSimples(intencao)) return null;
  const perfil = normalizar(intencao);
  return temConteudo(perfil) ? perfil : null;
}

/**
 * O perfil lido do banco, ou `null` quando não há (lead de outro canal, ou
 * anterior a 25/09), quando não é `versao: 1`, ou quando nada legível sobra.
 *
 * Cada campo que o card lê sai daqui conferido e normalizado — ver o
 * cabeçalho. Um jsonb torto vira perfil menor ou `null`, nunca um card que
 * lança e derruba o kanban.
 */
export function lerPerfilDoLead(valor: unknown): PerfilDoLead | null {
  if (!ehObjetoSimples(valor) || campo(valor, "versao") !== 1) return null;
  const perfil = normalizar(valor);
  return temConteudo(perfil) ? perfil : null;
}

/**
 * O PostgREST respondeu que a coluna `perfil` não existe: a migração
 * 20260925200000 ainda não foi aplicada. Mesmos códigos de
 * `colunaDaAvaliacaoAusente` — `PGRST204` na escrita, `42703` do Postgres —,
 * e a mensagem precisa nomear a coluna com a palavra inteira: `perfil_curadoria`
 * ausente não é esta coluna, e outro erro não pode virar um segundo insert.
 */
export function colunaDoPerfilAusente(erro: unknown): boolean {
  const e = erro as { code?: unknown; message?: unknown } | null;
  if (!e || typeof e !== "object") return false;
  const mensagem = typeof e.message === "string" ? e.message : "";
  return (e.code === "PGRST204" || e.code === "42703") && /\bperfil\b/.test(mensagem);
}
