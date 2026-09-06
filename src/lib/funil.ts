// Único import deste módulo, e ele respeita a regra que o mantém puro: monta
// endereço a partir de env, não conhece o banco nem o número DA LOJA. A trava
// de `whatsapp-numero-unico` continua valendo — `linkDeConversa` fala com o
// número do CLIENTE, e `chatwoot.ts` não sabe quem é a Motors.
import { linkDaConversa } from "./chatwoot";

/**
 * O funil de vendas — as regras que não dependem de React nem de banco.
 *
 * 2026-08-28, pedido do dono. Cinco coisas de uma vez: lead na agenda de
 * pessoas, desfecho com motivo, funil editável, alerta de estagnação no
 * WhatsApp do vendedor e transferência automática *"salvo os que já estão em
 * negociação ou com visita agendada"*.
 *
 * O que mora aqui é o que precisa dar a MESMA resposta em três lugares
 * diferentes: no card do kanban (que pinta o lead parado), na rota que monta
 * a mensagem para o n8n, e no relatório. Se cada um calculasse o seu, a tela
 * mostraria "2 dias parado" enquanto o motor achava que era 1 — e a discussão
 * seria sobre quem está certo, não sobre o lead.
 *
 * A régua de tempo do banco (`montar_fila_do_funil`) e a daqui precisam
 * concordar. Elas concordam por construção: as duas leem os mesmos dois
 * campos (`ultimo_movimento_em`, `ultimo_contato_em`) e o mesmo par de prazos
 * da etapa. `tests/funil.test.ts` trava isso.
 */

// ---------------------------------------------------------------------------
// O vocabulário
// ---------------------------------------------------------------------------

export type TipoDeEtapa = "aberta" | "ganho" | "perdido" | "descartado";

/**
 * Como um negócio termina. Três, e não dois — 2026-08-28, pedido do dono:
 * *"precisamos ter a opção de encerrar como 'não é uma oportunidade de
 * negócio', para os casos de spam, testes, contato equivocado"*.
 *
 * `descartado` não é um sabor de `perdido`, e a diferença não é semântica: a
 * taxa de conversão é `ganhos / (ganhos + perdidos)`. Enquanto spam entrava
 * como perda, cada robô que preenchia o formulário baixava o número da loja —
 * e a decisão que sai de um número desses é sobre a equipe comercial, quando
 * o problema era o captcha. O terceiro tipo existe para SAIR da conta.
 */
export type TipoDeDesfecho = "ganho" | "perdido" | "descartado";

/**
 * Os vocabulários, como LISTA — e é a lista que as rotas normalizam contra.
 *
 * Existem porque a alternativa já produziu um defeito neste arquivo: o PUT do
 * funil normalizava com `m.tipo === "ganho" ? "ganho" : "perdido"`, um ternário
 * que estava certo enquanto havia dois desfechos e que, no dia em que entrou o
 * terceiro, passaria a converter TODO motivo de descarte em motivo de perda —
 * sem erro, sem aviso, e desfazendo em silêncio a separação que o descarte
 * existe para criar. O mesmo ternário na etapa transformaria a etapa de
 * descarte em `aberta`, e ela viraria coluna do quadro.
 *
 * Uma lista não tem "else": valor fora dela é recusado, não convertido.
 */
export const TIPOS_DE_ETAPA: readonly TipoDeEtapa[] = [
  "aberta",
  "ganho",
  "perdido",
  "descartado",
];

export const TIPOS_DE_DESFECHO: readonly TipoDeDesfecho[] = [
  "ganho",
  "perdido",
  "descartado",
];

export function ehTipoDeEtapa(v: unknown): v is TipoDeEtapa {
  return typeof v === "string" && (TIPOS_DE_ETAPA as readonly string[]).includes(v);
}

export function ehTipoDeDesfecho(v: unknown): v is TipoDeDesfecho {
  return typeof v === "string" && (TIPOS_DE_DESFECHO as readonly string[]).includes(v);
}

/** Como cada desfecho se lê na tela. */
export const ROTULO_DO_DESFECHO: Record<TipoDeDesfecho, string> = {
  ganho: "Ganho",
  perdido: "Perdido",
  descartado: "Descartado",
};

/**
 * O mesmo desfecho no meio da frase: "nenhum motivo de PERDA está ativo".
 *
 * Existe separado de `ROTULO_DO_DESFECHO` porque o rótulo qualifica o NEGÓCIO
 * ("Perdido") e este qualifica o MOTIVO ("de perda") — trocar um pelo outro
 * dá "nenhum motivo de Perdido". E mora aqui, e não na caixa de desfecho,
 * porque a validação do funil precisa da mesma palavra: duas cópias do mesmo
 * vocabulário é como `descartado` foi esquecido da primeira vez.
 */
export const MOTIVO_DO_DESFECHO: Record<TipoDeDesfecho, string> = {
  ganho: "ganho",
  perdido: "perda",
  descartado: "descarte",
};

/**
 * O negócio que nunca existiu — e que por isso não entra em conta nenhuma.
 *
 * Predicado e não comparação solta porque ele é consultado em cinco telas: se
 * uma delas esquecer, o spam volta a aparecer numa estatística.
 */
export function ehDescarte(tipo?: TipoDeEtapa | TipoDeDesfecho | null): boolean {
  return tipo === "descartado";
}

/**
 * A etapa em que o lead nasce — o `default` de `leads.situacao` no banco
 * (migração 20260807210000).
 *
 * Está aqui porque o funil editável pode desfazê-la sem saber o que quebrou.
 * Nenhuma das duas rotas públicas do site manda `situacao` (`/api/leads` e
 * `/api/avaliacao` gravam só nome, telefone, interesse e canal): quem decide
 * onde o lead cai é o default da coluna. Se esta etapa deixar de existir, for
 * desativada ou virar terminal, a captura do site quebra — e quebra CALADA,
 * porque as duas rotas tratam a falha de gravação como não bloqueante para
 * não travar o visitante.
 *
 * Se um dia o default da coluna mudar, muda aqui junto. São os dois lados da
 * mesma decisão, e o aceite da migração 20260906150000 lê o default de verdade
 * para que os dois não possam divergir em silêncio.
 */
export const ETAPA_DE_ENTRADA = "novo";

/**
 * Este motivo chega até a pessoa que precisa escolher?
 *
 * Três condições, e nenhuma é decorativa. `ativo` porque a caixa e o GET
 * filtram por ele. `rotulo` porque é o texto do botão — e porque a rota
 * DESCARTA motivo sem rótulo antes de gravar, então contá-lo aqui fazia a tela
 * e o servidor discordarem: o dono via o erro sumir ao clicar "+ motivo" e
 * levava 422 com a mesma frase ao salvar. `chave` porque é o que `leads`
 * grava; `chaveDaEtapa("???")` devolve string vazia, e um motivo assim vira
 * botão que estoura na hora de fechar.
 */
export function motivoUtilizavel(m: MotivoDoFunil): boolean {
  return Boolean(m.ativo && m.chave?.trim() && m.rotulo?.trim());
}

/** Uma etapa do funil, do jeito que `funil_etapas` guarda. */
export interface EtapaDoFunil {
  chave: string;
  rotulo: string;
  ordem: number;
  tipo: TipoDeEtapa;
  /** Minutos parado até o vendedor ser cutucado. `null` = esta etapa não cobra. */
  estagnacao_minutos: number | null;
  /** Minutos parado até trocar de dono. `null` = nunca transfere sozinho. */
  transferencia_minutos: number | null;
  /** Avisa, mas nunca transfere. É a exceção que o dono nomeou. */
  protegida: boolean;
  ativa: boolean;
  cor?: string | null;
}

export interface MotivoDoFunil {
  chave: string;
  rotulo: string;
  tipo: TipoDeDesfecho;
  ordem: number;
  ativo: boolean;
}

/** O mínimo que as regras precisam saber de um lead. */
export interface LeadDoFunil {
  id: string;
  nome: string;
  telefone?: string | null;
  interesse?: string | null;
  situacao: string;
  responsavel?: string | null;
  created_at: string;
  ultimo_movimento_em?: string | null;
  ultimo_contato_em?: string | null;
  desfecho?: TipoDeDesfecho | null;
  desfecho_motivo?: string | null;
  desfecho_valor?: number | string | null;
  desfecho_nota?: string | null;
  desfecho_em?: string | null;
  /** Quantas vezes o motor já passou este lead adiante. Ver `seloDeRodizio`. */
  transferencias?: number | null;
  /**
   * A conversa do Chatwoot, quando já existe (2026-08-31).
   *
   * Não é coluna de `leads`: vive em `atendimentos`, escrita pelo n8n a partir
   * do webhook, e `/api/leads/gerenciar` a anexa à resposta. Ausente ou nula é
   * o caso normal do lead que preencheu o formulário e ainda não escreveu —
   * `linkDeConversa` cai no `wa.me`.
   */
  chatwoot_conversation_id?: number | string | null;
}

/**
 * O funil de antes de ele ser editável — a rede de segurança da tela.
 *
 * Enquanto a migração 20260828120000 não roda, `funil_etapas` não existe e a
 * rota devolve `funilPendente`. Sem esta lista o kanban abriria sem coluna
 * nenhuma e os leads sumiriam da tela — a ausência silenciosa de sempre. São
 * exatamente as sete chaves do `check` antigo, com os mesmos rótulos daquela
 * versão da tela: quem estiver com o banco atrasado vê o que sempre viu.
 *
 * Prazos ficam nulos de propósito: sem a tabela não há como o dono ter
 * ajustado nada, e inventar um prazo aqui pintaria cards de vermelho por uma
 * régua que ninguém combinou.
 */
export const ETAPAS_PADRAO: EtapaDoFunil[] = [
  { chave: "novo", rotulo: "Novo", ordem: 1, tipo: "aberta", estagnacao_minutos: null, transferencia_minutos: null, protegida: false, ativa: true },
  { chave: "em_contato", rotulo: "Em contato", ordem: 2, tipo: "aberta", estagnacao_minutos: null, transferencia_minutos: null, protegida: false, ativa: true },
  { chave: "proposta", rotulo: "Proposta", ordem: 3, tipo: "aberta", estagnacao_minutos: null, transferencia_minutos: null, protegida: false, ativa: true },
  { chave: "visita", rotulo: "Visita", ordem: 4, tipo: "aberta", estagnacao_minutos: null, transferencia_minutos: null, protegida: true, ativa: true },
  { chave: "negociacao", rotulo: "Negociação", ordem: 5, tipo: "aberta", estagnacao_minutos: null, transferencia_minutos: null, protegida: true, ativa: true },
  { chave: "fechado", rotulo: "Ganho", ordem: 6, tipo: "ganho", estagnacao_minutos: null, transferencia_minutos: null, protegida: true, ativa: true },
  { chave: "perdido", rotulo: "Perdido", ordem: 7, tipo: "perdido", estagnacao_minutos: null, transferencia_minutos: null, protegida: true, ativa: true },
  { chave: "descartado", rotulo: "Não é oportunidade", ordem: 8, tipo: "descartado", estagnacao_minutos: null, transferencia_minutos: null, protegida: true, ativa: true },
];

// ---------------------------------------------------------------------------
// O relógio da estagnação
// ---------------------------------------------------------------------------

/**
 * Desde quando este lead está parado.
 *
 * O mais recente entre a última mudança de etapa e o último toque humano —
 * não `atualizado_em`, que se move a cada gravação, inclusive as do próprio
 * motor. Um relógio que o motor reinicia ao tocar nunca dispara duas vezes.
 *
 * `created_at` é a última rede: lead de antes desta migração pode não ter
 * `ultimo_movimento_em` na resposta de uma rota antiga, e devolver `NaN`
 * pintaria o card de vermelho por engano.
 */
export function paradoDesde(lead: LeadDoFunil): number {
  const candidatos = [lead.ultimo_contato_em, lead.ultimo_movimento_em, lead.created_at]
    .map((v) => (v ? new Date(v).getTime() : NaN))
    .filter((n) => Number.isFinite(n));
  return candidatos.length > 0 ? Math.max(...candidatos) : Date.now();
}

/** Há quantos minutos este lead está parado. Nunca negativo. */
export function minutosParado(lead: LeadDoFunil, agora: number = Date.now()): number {
  return Math.max(0, Math.floor((agora - paradoDesde(lead)) / 60000));
}

/**
 * Quão preocupante é a parada deste lead.
 *
 *   ok .......... dentro do prazo, ou negócio já encerrado
 *   atencao ..... passou de 60% do prazo — a hora de agir é ANTES do alerta,
 *                 e uma tela que só avisa depois do estouro chega tarde
 *   estagnado ... estourou o prazo da etapa; o vendedor foi (ou será) cutucado
 *   transferir .. estourou o segundo prazo e a etapa não é protegida
 *
 * Etapa terminal e lead com desfecho nunca apodrecem: negócio fechado não tem
 * prazo, e pintar de vermelho o que já acabou treina a equipe a ignorar cor.
 */
export type NivelDeEstagnacao = "ok" | "atencao" | "estagnado" | "transferir";

export function nivelDeEstagnacao(
  lead: LeadDoFunil,
  etapa: EtapaDoFunil | undefined,
  agora: number = Date.now(),
): NivelDeEstagnacao {
  if (!etapa || etapa.tipo !== "aberta" || lead.desfecho) return "ok";
  const minutos = minutosParado(lead, agora);

  const transferir = etapa.transferencia_minutos;
  if (!etapa.protegida && transferir !== null && minutos >= transferir) return "transferir";

  const alerta = etapa.estagnacao_minutos;
  if (alerta === null || alerta <= 0) return "ok";
  if (minutos >= alerta) return "estagnado";
  if (minutos >= alerta * 0.6) return "atencao";
  return "ok";
}

// ---------------------------------------------------------------------------
// Prazos escritos como gente escreve
// ---------------------------------------------------------------------------

/**
 * Minutos → texto curto: "15 min", "4 h", "3 dias".
 *
 * O banco guarda minutos porque 15 minutos (o prazo do lead novo) não cabe em
 * horas e 5 dias não cabe confortavelmente em minutos. Guardar na unidade
 * menor e apresentar na maior é o arranjo que não perde precisão nem obriga
 * ninguém a ler "7200".
 */
export function formatarPrazo(minutos: number | null | undefined): string {
  if (minutos === null || minutos === undefined) return "—";
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 1440) {
    const h = minutos / 60;
    return `${Number.isInteger(h) ? h : h.toFixed(1).replace(".", ",")} h`;
  }
  const d = minutos / 1440;
  const texto = Number.isInteger(d) ? `${d}` : d.toFixed(1).replace(".", ",");
  return `${texto} ${d === 1 ? "dia" : "dias"}`;
}

export type UnidadeDePrazo = "minutos" | "horas" | "dias";

const POR_UNIDADE: Record<UnidadeDePrazo, number> = { minutos: 1, horas: 60, dias: 1440 };

/** O que o formulário mostra: o mesmo prazo na maior unidade que couber inteira. */
export function separarPrazo(
  minutos: number | null | undefined,
): { valor: number | null; unidade: UnidadeDePrazo } {
  if (minutos === null || minutos === undefined) return { valor: null, unidade: "horas" };
  if (minutos % 1440 === 0) return { valor: minutos / 1440, unidade: "dias" };
  if (minutos % 60 === 0) return { valor: minutos / 60, unidade: "horas" };
  return { valor: minutos, unidade: "minutos" };
}

/** O caminho de volta: o que o formulário devolve vira minutos. */
export function emMinutos(
  valor: number | string | null | undefined,
  unidade: UnidadeDePrazo,
): number | null {
  const n = typeof valor === "string" ? parseFloat(valor.replace(",", ".")) : valor;
  if (n === null || n === undefined || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * POR_UNIDADE[unidade]);
}

/** Espera desde a entrada, em texto curto — o que o card mostra no rodapé. */
export function espera(iso: string, agora: number = Date.now()): string {
  const min = Math.floor((agora - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

// ---------------------------------------------------------------------------
// Editar o funil sem quebrá-lo
// ---------------------------------------------------------------------------

/**
 * O rótulo digitado vira a chave estável que `leads.situacao` grava.
 *
 * Sem acento, sem espaço, sem maiúscula — é chave de banco, não texto de tela.
 * "Test drive" → `test_drive`. Rótulo pode ser reescrito quantas vezes o dono
 * quiser; a chave, uma vez em uso por um lead, não muda mais.
 */
export function chaveDaEtapa(rotulo: string): string {
  return rotulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/**
 * O que impede o funil salvo de ser um funil quebrado.
 *
 * Devolve a lista de problemas em português, para a tela mostrar ANTES de
 * gravar. As três primeiras regras são estruturais; a quarta é a que salva o
 * dono de si mesmo: prazo de transferência menor que o de alerta transferiria
 * o lead antes de avisar o vendedor de que ele estava parado, o que é a
 * ordem errada de acontecer as coisas.
 */
export function validarFunil(
  etapas: EtapaDoFunil[],
  /**
   * `null` = não deu para saber quais motivos existem.
   *
   * Não é o mesmo que lista vazia. A RLS deste projeto não devolve erro quando
   * bloqueia: devolve `200`, `[]` e `error` nulo. Tratar isso como "não há
   * motivo nenhum" acusaria o dono de deixar o funil sem saída num PUT em que
   * ele só mexeu num prazo — e a acusação viria com três erros e um botão
   * desabilitado, por uma leitura que não aconteceu.
   */
  motivos: MotivoDoFunil[] | null,
): string[] {
  const erros: string[] = [];
  const ativas = etapas.filter((e) => e.ativa);

  if (ativas.length === 0) erros.push("O funil precisa de pelo menos uma etapa ativa.");

  // A entrada do funil. Vem antes de ganho e perdido porque perder a saída
  // estraga o relatório, e perder a ENTRADA estraga a captura: o lead do site
  // nem chega a existir, e as duas rotas engolem a falha para não travar o
  // visitante. Ver `ETAPA_DE_ENTRADA`.
  const entrada = etapas.find((e) => e.chave === ETAPA_DE_ENTRADA);
  if (!entrada || !entrada.ativa) {
    erros.push(
      `A etapa "${ETAPA_DE_ENTRADA}" precisa existir e estar ativa — é nela que todo lead ` +
        `do site nasce, e sem ela a captura para de gravar sem avisar ninguém.`,
    );
  } else if (entrada.tipo !== "aberta") {
    erros.push(
      `A etapa "${ETAPA_DE_ENTRADA}" ("${entrada.rotulo}") não pode ser um desfecho: é nela que ` +
        `todo lead do site nasce. Como desfecho, ela passaria a exigir motivo na entrada, ` +
        `e o formulário do site deixaria de gravar em silêncio.`,
    );
  }
  if (!ativas.some((e) => e.tipo === "aberta")) {
    erros.push("Falta uma etapa EM ANDAMENTO ativa — sem ela o quadro não tem coluna nenhuma.");
  }
  if (!ativas.some((e) => e.tipo === "ganho")) {
    erros.push("Falta uma etapa de GANHO ativa — sem ela não há onde registrar venda fechada.");
  }
  if (!ativas.some((e) => e.tipo === "perdido")) {
    erros.push(
      "Falta uma etapa de PERDIDO ativa — sem ela o motivo da perda deixa de ser coletado.",
    );
  }

  // Daqui para baixo, tudo depende de conhecer os motivos.
  if (motivos === null) return erros;

  // Etapa terminal ATIVA cujo tipo não tem NENHUM motivo ativo é um beco sem
  // saída, e é um beco que só existe desde 2026-09-05: até então o descarte
  // gravava sem motivo, e agora a caixa (e o banco) exigem um. O card entra
  // pelo botão de destino e não tem como sair.
  //
  // A cobrança é AQUI, na configuração, porque é o único lugar onde quem pode
  // consertar está presente. Quem encontra o beco é o Comercial, no card — e
  // `podeFazer(comercial, "Configurar o funil de vendas")` é `nao_ve`.
  //
  // Só as ATIVAS: uma etapa terminal desativada não vira botão
  // (`destinosDoNegocio` filtra por `ativa`), então não há beco, e cobrar
  // obrigaria o dono a manter motivo vivo para um destino que ele desligou.
  //
  // E só motivo ATIVO conta: a caixa filtra por `m.ativo` e o GET da rota
  // também, então um motivo desativado é invisível para quem precisa escolher.
  for (const e of ativas) {
    const tipo = e.tipo;
    if (!ehTipoDeDesfecho(tipo)) continue;
    if (motivos.some((m) => motivoUtilizavel(m) && m.tipo === tipo)) continue;
    erros.push(
      `"${e.rotulo}": nenhum motivo de ${MOTIVO_DO_DESFECHO[tipo]} está ativo. A etapa ` +
        `aparece como botão no card e a caixa não fecha sem motivo — o lead entraria ` +
        `num beco sem saída.`,
    );
  }

  const vistas = new Set<string>();
  for (const e of etapas) {
    if (!e.rotulo.trim()) erros.push("Há etapa sem nome.");
    if (vistas.has(e.chave)) erros.push(`Duas etapas com a mesma chave: "${e.chave}".`);
    vistas.add(e.chave);

    if (
      e.transferencia_minutos !== null &&
      e.estagnacao_minutos !== null &&
      e.transferencia_minutos < e.estagnacao_minutos
    ) {
      erros.push(
        `"${e.rotulo}": o prazo de transferência (${formatarPrazo(e.transferencia_minutos)}) ` +
          `é menor que o de alerta (${formatarPrazo(e.estagnacao_minutos)}) — o lead trocaria ` +
          `de dono antes de o vendedor ser avisado.`,
      );
    }
    if (e.transferencia_minutos !== null && e.estagnacao_minutos === null) {
      erros.push(
        `"${e.rotulo}": transfere sem nunca avisar. Defina o prazo de alerta primeiro.`,
      );
    }
  }

  // Chave repetida entre MOTIVOS, pela mesma razão que entre etapas — mas o
  // sintoma era pior: a gravação usa `upsert(..., { onConflict: "chave" })`, e
  // duas linhas da mesma chave devolvem `21000 ON CONFLICT DO UPDATE command
  // cannot affect row a second time`. O dono lia isso, em inglês, num 500.
  const chavesDeMotivo = new Set<string>();
  for (const m of motivos) {
    const chave = m.chave?.trim();
    if (!chave) continue;
    if (chavesDeMotivo.has(chave)) {
      erros.push(`Dois motivos com a mesma chave: "${chave}".`);
    }
    chavesDeMotivo.add(chave);
  }

  return erros;
}

/** O que a decisão do desfecho precisa saber da etapa de destino. */
export interface EtapaDoDesfecho {
  chave: string;
  rotulo: string;
  tipo: TipoDeEtapa;
}

/** O veredito: ou os campos a gravar, ou a recusa já escrita em português. */
export type DecisaoDeDesfecho =
  | { ok: true; campos: Record<string, unknown> }
  | { ok: false; erro: string; motivoObrigatorio: boolean; tipo?: TipoDeEtapa };

/**
 * Valor do negócio ganho. Vazio é nulo — zero seria uma venda de R$ 0.
 *
 * Aceita a vírgula decimal e o ponto de milhar que se digitam em português.
 */
export function valorDoDesfecho(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n =
    typeof v === "string" ? Number(v.replace(/\./g, "").replace(",", ".")) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Mover para esta etapa exige motivo? E o motivo oferecido serve?
 *
 * ---------------------------------------------------------------------------
 * Por que a decisão inteira, e não pedaços dela na rota
 * ---------------------------------------------------------------------------
 * Esta regra é a metade servidora da trava do desfecho — a que continua
 * valendo "no dia em que alguém chamar a rota de outro lugar". Ela morava
 * espalhada dentro do PATCH, e a única prova que existia dela era textual:
 * um teste lia a condição do `if` no fonte.
 *
 * A revisão de 06/09 furou isso inserindo um desvio DEPOIS do trecho que o
 * teste lia — descarte gravava direto, a condição afirmada continuava
 * idêntica, e a suíte inteira ficava verde. Junta aqui, a regra é executável:
 * o teste chama `decidirDesfecho` com uma etapa de cada tipo e um
 * `buscarMotivo` de mentira, e qualquer desvio novo roda.
 *
 * A busca do motivo entra como parâmetro em vez de import: é a única parte
 * que fala com o banco, e mantê-la fora deixa este módulo puro — a mesma
 * regra que o cabeçalho do arquivo já segue.
 */
export async function decidirDesfecho(
  etapa: EtapaDoDesfecho | null,
  corpo: { desfecho_motivo?: unknown; desfecho_valor?: unknown; desfecho_nota?: unknown },
  buscarMotivo: (chave: string) => Promise<{ chave: string; tipo: string } | null>,
): Promise<DecisaoDeDesfecho> {
  // Etapa desconhecida (migração pendente) ou etapa aberta: nada a cobrar.
  if (!etapa || !ehTipoDeDesfecho(etapa.tipo)) return { ok: true, campos: {} };

  const motivo =
    typeof corpo.desfecho_motivo === "string" ? corpo.desfecho_motivo.trim() : "";
  if (!motivo) {
    return {
      ok: false,
      motivoObrigatorio: true,
      tipo: etapa.tipo,
      erro:
        `Para mover para "${etapa.rotulo}" é preciso escolher o motivo — ` +
        `é ele que a tela "Ganhos e perdas" agrupa.`,
    };
  }

  const noBanco = await buscarMotivo(motivo);
  if (!noBanco) {
    return { ok: false, motivoObrigatorio: false, erro: `Motivo desconhecido: "${motivo}".` };
  }

  // Motivo de ganho num negócio perdido faria o relatório somar peras com
  // maçãs — e o erro só apareceria no gráfico, meses depois.
  if (noBanco.tipo !== etapa.tipo) {
    return {
      ok: false,
      motivoObrigatorio: false,
      erro:
        `O motivo "${motivo}" é de ${noBanco.tipo}, e a etapa ` +
        `"${etapa.rotulo}" é de ${etapa.tipo}.`,
    };
  }

  const nota =
    typeof corpo.desfecho_nota === "string" && corpo.desfecho_nota.trim()
      ? corpo.desfecho_nota.trim()
      : null;

  return {
    ok: true,
    campos: {
      desfecho_motivo: motivo,
      desfecho_valor: valorDoDesfecho(corpo.desfecho_valor),
      desfecho_nota: nota,
    },
  };
}

/**
 * Como os motivos ficam DEPOIS de gravar — o estado que a validação precisa ver.
 *
 * Existe por causa de duas regras da rota de configuração que, juntas, fazem a
 * lista recebida no corpo NÃO ser o que vai valer:
 *
 *  1. Corpo sem motivo nenhum significa *não toque nos motivos* — o upsert e a
 *     desativação estão os dois atrás de `motivos.length > 0`. Validar contra a
 *     lista vazia recusaria, alegando funil sem saída, um PUT que só mexeu nas
 *     etapas e nunca encostou num motivo.
 *  2. "O que sumiu da tela é DESATIVADO, nunca apagado". Quem some do corpo
 *     continua na tabela, inativo — e é assim que o dono deixa um funil sem
 *     saída sem apagar nada. A validação só enxerga isso se olhar o resultado.
 *
 * Não grava: devolve a projeção. Quem grava é a rota, logo depois de validar.
 */
export function motivosDepoisDeGravar(
  atuais: MotivoDoFunil[],
  recebidos: MotivoDoFunil[],
): MotivoDoFunil[] {
  if (recebidos.length === 0) return atuais;
  const noCorpo = new Set(recebidos.map((m) => m.chave));
  return [
    ...recebidos,
    ...atuais.filter((m) => !noCorpo.has(m.chave)).map((m) => ({ ...m, ativo: false })),
  ];
}

/** Da esquerda para a direita, como o kanban desenha. */
export function ordenarEtapas(etapas: EtapaDoFunil[]): EtapaDoFunil[] {
  return [...etapas].sort((a, b) => a.ordem - b.ordem || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/**
 * As colunas que o kanban desenha.
 *
 * As ativas, MAIS as inativas que ainda têm lead dentro. A segunda parte é o
 * ponto: desativar uma etapa que ainda guarda cards faria os cards sumirem da
 * tela sem erro nenhum — a ausência silenciosa que este projeto vem
 * perseguindo. A coluna fica, marcada como arquivada, até o último lead sair.
 */
export function etapasVisiveis(
  etapas: EtapaDoFunil[],
  leads: Pick<LeadDoFunil, "situacao">[],
): EtapaDoFunil[] {
  const ocupadas = new Set(leads.map((l) => l.situacao));
  return ordenarEtapas(etapas.filter((e) => e.ativa || ocupadas.has(e.chave)));
}

/**
 * As colunas do quadro: só as etapas ABERTAS.
 *
 * 2026-08-28, segunda rodada com o dono: *"não precisa de uma aba de ganho ou
 * perdido, só um botão para destinar"*. Ele está certo, e é a mesma conclusão a
 * que quem opera funil há anos chega por outro caminho — *"nunca crie etapas
 * Fechado"*: a coluna terminal é onde o card vai morar para sempre, e um quadro
 * com duas colunas que só crescem deixa de ser um quadro de trabalho.
 *
 * As etapas de ganho e perdido continuam existindo em `funil_etapas` — elas são
 * o que `leads.situacao` grava, e a chave estrangeira exige que existam. O que
 * muda é que ninguém as desenha: elas viraram os dois botões do card.
 */
export function etapasDoQuadro(
  etapas: EtapaDoFunil[],
  leads: Pick<LeadDoFunil, "situacao">[],
): EtapaDoFunil[] {
  return etapasVisiveis(etapas, leads).filter((e) => e.tipo === "aberta");
}

/**
 * Os destinos do negócio — o que os botões do card oferecem.
 *
 * Ativos só: uma etapa terminal desativada some do botão, e os leads que já
 * estão nela continuam alcançáveis pela lista de fechados. Diferente das
 * colunas, aqui manter a opção viva não custa nada e mantê-la escondida
 * custaria um card preso.
 */
export function destinosDoNegocio(etapas: EtapaDoFunil[]): EtapaDoFunil[] {
  return ordenarEtapas(etapas.filter((e) => e.ativa && e.tipo !== "aberta"));
}

/** Índice da etapa na fila visível — o que as setas do card usam. */
export function indiceDaEtapa(etapas: EtapaDoFunil[], chave: string): number {
  return etapas.findIndex((e) => e.chave === chave);
}

// ---------------------------------------------------------------------------
// Falar com o cliente
// ---------------------------------------------------------------------------

/** Só os dígitos, com o 55 na frente — o que o `wa.me` espera. */
export function numeroDiscavel(telefone: string | null | undefined): string {
  const d = (telefone ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

/** Primeiro nome, capitalizado. "joão da silva" → "João". */
export function primeiroNome(nome: string): string {
  const p = nome.trim().split(/\s+/)[0] ?? "";
  return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : "";
}

/**
 * A mensagem que o botão do card já deixa escrita.
 *
 * Rascunho, não envio: o `wa.me` abre o WhatsApp com o texto no campo, e quem
 * aperta enviar é o vendedor. É de propósito — mensagem automática para
 * cliente é o caminho mais curto para a loja ser bloqueada, e o dono pediu um
 * *"atalho para falar com o cliente"*, não um robô falando por ele.
 *
 * O texto cita o carro quando existe interesse registrado: é a diferença
 * entre "oi, tudo bem?" e uma retomada que o cliente reconhece.
 */
export function mensagemParaCliente(
  lead: Pick<LeadDoFunil, "nome" | "interesse">,
  opcoes: { loja?: string | null; vendedor?: string | null } = {},
): string {
  const nome = primeiroNome(lead.nome);
  const quem = opcoes.vendedor?.trim() ? primeiroNome(opcoes.vendedor) : "";
  const loja = opcoes.loja?.trim() ?? "";
  const carro = lead.interesse?.trim();

  const abertura = nome ? `Olá, ${nome}! ` : "Olá! ";
  const identidade =
    quem && loja
      ? `Aqui é ${quem}, da ${loja}.`
      : quem
        ? `Aqui é ${quem}.`
        : loja
          ? `Aqui é da ${loja}.`
          : "Aqui é da loja.";
  const assunto = carro
    ? ` Vi que você se interessou por ${carro}.`
    : " Vi seu contato pelo nosso site.";

  return `${abertura}${identidade}${assunto} Posso te ajudar?`;
}

/**
 * Link de conversa com o cliente. `""` quando não há por onde falar.
 *
 * Devolver string vazia (em vez de `wa.me/`) é deliberado: um `wa.me` sem
 * número abre o WhatsApp numa tela de erro, e o vendedor conclui que o
 * sistema está quebrado. Quem chama esconde o botão — é a mesma regra que
 * `lib/whatsapp.ts` já usa para o número da loja.
 *
 * ---------------------------------------------------------------------------
 * Desde 2026-08-31: o Chatwoot vem primeiro, quando existe
 * ---------------------------------------------------------------------------
 * Decisão do dono. Abrir `wa.me` fazia o consultor responder pelo WhatsApp
 * pessoal, e a conversa não ficava registrada em lugar nenhum.
 *
 * O degrau existe porque conversa de WhatsApp no Chatwoot só nasce quando o
 * CLIENTE escreve: o lead que acabou de preencher o formulário — justamente o
 * que alguém precisa abordar primeiro — ainda não tem conversa. Sem o degrau,
 * o caso mais comum ficaria sem botão.
 *
 * A mensagem pré-escrita viaja SÓ no `wa.me`. O Chatwoot não aceita texto na
 * URL: lá o consultor cai dentro da conversa e digita. `mensagemNoLink` diz
 * qual dos dois aconteceu, para a tela não prometer o que não vai entregar.
 */
export function linkDeConversa(
  telefone: string | null | undefined,
  mensagem?: string,
  /** Id da conversa no Chatwoot, quando o atendimento já existe. */
  conversaChatwoot?: number | string | null,
): string {
  const noChatwoot = linkDaConversa(conversaChatwoot);
  if (noChatwoot) return noChatwoot;

  const numero = numeroDiscavel(telefone);
  if (!numero) return "";
  const texto = mensagem?.trim() ? `?text=${encodeURIComponent(mensagem)}` : "";
  return `https://wa.me/${numero}${texto}`;
}

/** Para onde o botão de conversa leva — a tela precisa dizer a verdade. */
export type DestinoDaConversa = "chatwoot" | "whatsapp" | "nenhum";

/**
 * Onde este link vai abrir.
 *
 * Existe porque os dois destinos se comportam diferente e o vendedor precisa
 * saber ANTES de clicar: no `wa.me` a mensagem já vai escrita; no Chatwoot,
 * não. Rotular os dois de "WhatsApp" faria a pessoa colar um texto que ela
 * achava que já estava lá.
 */
export function destinoDaConversa(
  telefone: string | null | undefined,
  conversaChatwoot?: number | string | null,
): DestinoDaConversa {
  if (linkDaConversa(conversaChatwoot)) return "chatwoot";
  return numeroDiscavel(telefone) ? "whatsapp" : "nenhum";
}

// ---------------------------------------------------------------------------
// A mensagem que vai para o vendedor
// ---------------------------------------------------------------------------

export type AvisoDoFunil = "atribuicao" | "estagnacao" | "transferencia";

/** Uma linha da fila do funil, como `montar_fila_do_funil` devolve. */
export interface LinhaDaFilaDoFunil {
  lead_id: string;
  nome: string;
  telefone: string | null;
  interesse: string | null;
  canal: string | null;
  situacao: string;
  etapa: string;
  minutos_parado: number;
  aviso: AvisoDoFunil;
  responsavel: string | null;
  responsavel_whatsapp: string | null;
  novo_responsavel: string | null;
  novo_whatsapp: string | null;
  suprimido_por: string | null;
}

/**
 * O texto do aviso no WhatsApp do vendedor.
 *
 * Três regras aprendidas de alerta que ninguém lê:
 *
 *  1. **Diz o que fazer, não o que aconteceu.** "Lead parado há 3 dias" é um
 *     relatório; "fale com a Ana hoje" é um alerta.
 *  2. **Traz o link junto.** Um aviso que obriga a abrir o painel para achar o
 *     telefone é um aviso que espera o vendedor chegar na loja.
 *  3. **Nunca cita valor nem CPF.** A mensagem trafega por WhatsApp; o mínimo
 *     necessário é nome, carro e link.
 */
export function mensagemDeAlerta(
  linha: LinhaDaFilaDoFunil,
  opcoes: { loja?: string | null } = {},
): string {
  const carro = linha.interesse?.trim() ? ` — ${linha.interesse.trim()}` : "";
  const parado = formatarPrazo(linha.minutos_parado);
  const link = linkDeConversa(linha.telefone);
  const rodape = link ? `\n\nFalar agora: ${link}` : "";
  const loja = opcoes.loja?.trim() ? `[${opcoes.loja.trim()}] ` : "";

  if (linha.aviso === "atribuicao") {
    return (
      `${loja}Lead sem atendimento há ${parado}.\n\n` +
      `${linha.nome}${carro}\nEtapa: ${linha.etapa}\n\n` +
      `Ele é seu agora. Fale com ele hoje.${rodape}`
    );
  }

  if (linha.aviso === "transferencia") {
    const antes = linha.responsavel?.trim() ? ` (estava com ${linha.responsavel.trim()})` : "";
    return (
      `${loja}Lead transferido para você${antes}.\n\n` +
      `${linha.nome}${carro}\nEtapa: ${linha.etapa} — parado há ${parado}\n\n` +
      `Assuma o atendimento hoje.${rodape}`
    );
  }

  return (
    `${loja}Seu lead está parado há ${parado}.\n\n` +
    `${linha.nome}${carro}\nEtapa: ${linha.etapa}\n\n` +
    `Dê um retorno ou mova o card — se ficar parado, ele passa para outro ` +
    `vendedor.${rodape}`
  );
}

/** Para quem esta linha da fila deve ser entregue. */
export function destinatarioDoAviso(linha: LinhaDaFilaDoFunil): string | null {
  const numero =
    linha.aviso === "estagnacao" ? linha.responsavel_whatsapp : linha.novo_whatsapp;
  return numeroDiscavel(numero) || null;
}

/** O que aconteceu com a linha suprimida, escrito para gente ler. */
export const MOTIVO_DA_SUPRESSAO: Record<string, string> = {
  fora_do_horario: "Fora do horário de atendimento (8h–20h, sem domingo)",
  vendedor_sem_whatsapp: "O responsável não tem WhatsApp cadastrado",
  alerta_recente: "Já foi avisado nas últimas 20 horas",
  sem_vendedor_disponivel: "Nenhum vendedor ativo com WhatsApp para receber",
};

// ---------------------------------------------------------------------------
// O relatório: por que a gente ganha e por que a gente perde
// ---------------------------------------------------------------------------

export interface LinhaDoRelatorio {
  chave: string;
  rotulo: string;
  quantidade: number;
  valor: number;
  percentual: number;
}

/**
 * Agrupa os desfechos por motivo.
 *
 * O `sem_motivo` no fim não é enfeite: é a medida de quanto do funil está
 * sendo fechado sem ninguém dizer por quê. Se ele for a maior fatia, o
 * relatório inteiro não vale nada — e é melhor que isso apareça no gráfico do
 * que apareça na reunião.
 */
export function agruparPorMotivo(
  leads: Pick<LeadDoFunil, "desfecho" | "desfecho_motivo" | "desfecho_valor">[],
  motivos: MotivoDoFunil[],
  tipo: TipoDeDesfecho,
): LinhaDoRelatorio[] {
  const doTipo = leads.filter((l) => l.desfecho === tipo);
  const rotulos = new Map(motivos.filter((m) => m.tipo === tipo).map((m) => [m.chave, m.rotulo]));
  const conta = new Map<string, { quantidade: number; valor: number }>();

  for (const l of doTipo) {
    const chave = l.desfecho_motivo || "sem_motivo";
    const atual = conta.get(chave) ?? { quantidade: 0, valor: 0 };
    atual.quantidade += 1;
    atual.valor += Number(l.desfecho_valor ?? 0) || 0;
    conta.set(chave, atual);
  }

  const total = doTipo.length;
  return [...conta.entries()]
    .map(([chave, v]) => ({
      chave,
      rotulo: chave === "sem_motivo" ? "Sem motivo informado" : rotulos.get(chave) ?? chave,
      quantidade: v.quantidade,
      valor: v.valor,
      percentual: total > 0 ? (v.quantidade / total) * 100 : 0,
    }))
    .sort((a, b) => b.quantidade - a.quantidade || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/**
 * Taxa de conversão: ganhos sobre negócios ENCERRADOS.
 *
 * Sobre encerrados, e não sobre o total: incluir no denominador os leads que
 * ainda estão em negociação faz a taxa parecer pior no começo do mês e
 * melhorar sozinha no fim, sem ninguém ter vendido nada a mais.
 *
 * E DESCARTADO não entra em lado nenhum — é a razão de o terceiro tipo
 * existir. A assinatura recebe dois números de propósito: quem chamar com o
 * total de encerrados no lugar de `perdidos` está somando spam à conta, e o
 * tipo não deixa isso passar despercebido.
 */
export function taxaDeConversao(ganhos: number, perdidos: number): number {
  const fechados = ganhos + perdidos;
  return fechados > 0 ? (ganhos / fechados) * 100 : 0;
}

/**
 * "3ª transferência" — o aviso que substituiu o teto de rodízio.
 *
 * A primeira versão travava o lead na terceira troca. Decisão do dono em
 * 2026-08-28: *"quantas se fizerem necessárias até o atendimento"*. Travar
 * escondia o problema; contar o expõe. Um lead na quinta transferência não é
 * um lead defeituoso — são cinco pessoas que não o atenderam, e é isso que o
 * número diz a quem olha o quadro.
 *
 * Devolve `null` até a segunda: a primeira troca é o rodízio funcionando, não
 * uma anomalia, e marcar tudo é o mesmo que não marcar nada.
 */
export function seloDeRodizio(transferencias?: number | null): string | null {
  const n = transferencias ?? 0;
  return n >= 2 ? `${n}ª transferência` : null;
}

/** Contagem por etapa, para o cabeçalho das colunas e o modo agregado. */
export function contarPorEtapa(leads: Pick<LeadDoFunil, "situacao">[]): Record<string, number> {
  const conta: Record<string, number> = {};
  for (const l of leads) conta[l.situacao] = (conta[l.situacao] ?? 0) + 1;
  return conta;
}
