/**
 * Campanhas de SMS por veículo — a parte pura (pedido do dono em 07/10/2026).
 *
 * "Vamos criar uma interface de criação de campanhas e envio, bem como
 * monitoramento individualizado de cada uma das campanhas (…) por interesse e
 * por veículo, filtrar pessoas com base no carro que já demonstraram
 * interesse."
 *
 * O NOME: "campanhas" já tem dois donos no repo (`lib/campanhas.ts`, os
 * feirões; `midia_campanhas`, a mídia paga). Aqui tudo leva `sms` no nome.
 *
 * O que mora aqui, sem rede e sem banco:
 *   - o tamanho da mensagem (um SMS com acento custa mais que o dobro);
 *   - o molde da mensagem e as variáveis;
 *   - QUEM entra no público, a partir dos interesses já registrados;
 *   - a leitura do retorno do fornecedor (entrega, resposta, pedido de saída);
 *   - o resumo que a tela de monitoramento mostra.
 *
 * ---------------------------------------------------------------------------
 * Dado pessoal
 * ---------------------------------------------------------------------------
 * O papel Marketing não lê contato de lead (matriz: "Ver e mover leads no
 * kanban" é `nao_ve`). A campanha não muda isso: o público é montado no
 * servidor, e o que desce para a tela é contagem, primeiro nome e telefone
 * mascarado (`EnvioNaTela`). Nenhum tipo daqui que vai para o navegador
 * carrega telefone inteiro.
 *
 * ---------------------------------------------------------------------------
 * A saída é de quem recebe
 * ---------------------------------------------------------------------------
 * A base legal que o dono adotou é o legítimo interesse (LGPD, art. 7º, IX).
 * Ela vem junto com o direito de oposição (art. 18, § 2º): toda mensagem leva
 * o rodapé de saída, e quem responde SAIR não recebe mais. O rodapé não é
 * opção de quem escreve a campanha — `montarMensagem` o põe sempre.
 */

export const ACAO_CAMPANHAS_DE_SMS = "Criar e enviar campanhas de SMS";

/** Quem cria e envia: os mesmos donos da mídia paga. */
export const PAPEIS_DAS_CAMPANHAS_DE_SMS = ["admin", "marketing"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// O tamanho da mensagem
// ─────────────────────────────────────────────────────────────────────────────

/** Um SMS no alfabeto padrão (GSM-7): 160 caracteres; em várias partes, 153 cada. */
export const CARACTERES_POR_SMS = 160;
export const CARACTERES_POR_PARTE = 153;
/** Com um caractere fora do alfabeto (acento raro, emoji), vira UCS-2: 70, ou 67 por parte. */
export const CARACTERES_POR_SMS_UNICODE = 70;
export const CARACTERES_POR_PARTE_UNICODE = 67;

const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
/** Estes existem no GSM-7, mas ocupam dois lugares. */
const GSM7_DUPLOS = "^{}\\[~]|€";

/** Tira acento e cedilha. "Promoção" → "Promocao". */
export function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** O que se cola de um editor de texto e o NFD não desfaz, com o equivalente que cabe no SMS. */
const TROCAS_PARA_O_ALFABETO: Array<[RegExp, string]> = [
  [/[\u201c\u201d\u201e\u00ab\u00bb]/g, '"'],
  [/[\u2018\u2019\u201a\u0060\u00b4]/g, "'"],
  [/[\u2013\u2014\u2212]/g, "-"],
  [/\u2026/g, "..."],
  [/[\u00a0\u2007\u202f\u2009]/g, " "],
  [/\u00ba/g, "o"],
  [/\u00aa/g, "a"],
  [/\u2022/g, "-"],
];

/**
 * O texto só com o que cabe no alfabeto padrão do SMS: sem acento, com aspas,
 * travessão e reticências de editor trocados, e o que sobrar de fora (emoji,
 * símbolo) removido. É o que garante 160 caracteres por parte, e não 70.
 */
export function paraOAlfabetoDoSms(texto: string): string {
  let t = semAcento(texto);
  for (const [de, para] of TROCAS_PARA_O_ALFABETO) t = t.replace(de, para);
  return [...t].filter((c) => GSM7.includes(c) || GSM7_DUPLOS.includes(c)).join("");
}

export interface TamanhoDoSms {
  caracteres: number;
  /** Quantos SMS o fornecedor cobra por esta mensagem. */
  partes: number;
  /** A mensagem saiu do alfabeto padrão, e cada parte cabe menos da metade. */
  unicode: boolean;
}

export function tamanhoDoSms(texto: string): TamanhoDoSms {
  let lugares = 0;
  let unicode = false;
  for (const c of texto) {
    if (GSM7.includes(c)) lugares += 1;
    else if (GSM7_DUPLOS.includes(c)) lugares += 2;
    else {
      unicode = true;
      break;
    }
  }
  if (unicode) {
    const caracteres = texto.length; // em UCS-2 conta a unidade UTF-16
    return {
      caracteres,
      partes: caracteres <= CARACTERES_POR_SMS_UNICODE ? 1 : Math.ceil(caracteres / CARACTERES_POR_PARTE_UNICODE),
      unicode: true,
    };
  }
  return {
    caracteres: lugares,
    partes: lugares === 0 ? 0 : lugares <= CARACTERES_POR_SMS ? 1 : Math.ceil(lugares / CARACTERES_POR_PARTE),
    unicode: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A mensagem
// ─────────────────────────────────────────────────────────────────────────────

/** O rodapé que toda mensagem leva. Sem acento: é ele que não pode custar parte a mais. */
export const RODAPE_DE_SAIDA = "Sair: responda SAIR";

export const VARIAVEIS_DA_MENSAGEM = ["{nome}", "{carro}", "{preco}", "{link}"] as const;

/** Curta de propósito: com nome de carro comprido, cada caractere a menos é o que segura a mensagem em um SMS. */
export const MENSAGEM_PADRAO = "{nome}, o {carro} que voce viu na Motors Store esta por {preco}: {link}";

/** "MARIA DA SILVA" → "Maria". Vazio quando não há nome que sirva. */
export const TAMANHO_MAXIMO_DO_PRIMEIRO_NOME = 20;

export function primeiroNome(nome: string | null | undefined): string {
  const primeiro = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  // Só letras (e hífen ou apóstrofo de nome composto), de 2 a 20: "maria.silva",
  // e-mail, telefone, emoji e nome-lixo comprido não viram saudação.
  if (!/^[\p{L}][\p{L}'-]{1,19}$/u.test(primeiro)) return "";
  return primeiro.charAt(0).toLocaleUpperCase("pt-BR") + primeiro.slice(1).toLocaleLowerCase("pt-BR");
}

export interface ValoresDaMensagem {
  nome: string | null;
  carro: string;
  /** Já formatado: "R$ 89.900". */
  preco: string;
  link: string;
}

/**
 * O molde com as variáveis trocadas, sem acento e com o rodapé de saída.
 *
 * Sem nome, "{nome}, " some junto com a vírgula: "Maria, o carro…" vira
 * "O carro…", e não ", o carro…".
 */
export function montarMensagem(molde: string, valores: ValoresDaMensagem): string {
  const nome = primeiroNome(valores.nome);
  let texto = molde;
  if (nome === "") texto = texto.replace(/\{nome\}\s*[,:!]?\s*/g, "");
  texto = texto
    .replace(/\{nome\}/g, nome)
    .replace(/\{carro\}/g, valores.carro)
    .replace(/\{preco\}/g, valores.preco)
    .replace(/\{link\}/g, valores.link);
  texto = paraOAlfabetoDoSms(texto).replace(/[ \t]+/g, " ").trim();
  if (texto !== "") texto = texto.charAt(0).toUpperCase() + texto.slice(1);
  // O rodapé só é dispensado quando a INSTRUÇÃO já está escrita. A palavra
  // solta não basta: "não deixe o carro SAIR do estoque" não ensina ninguém a sair.
  return /responda\s+sair/i.test(texto) ? texto : `${texto} ${RODAPE_DE_SAIDA}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// O pedido de campanha
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quem recebe, em relação ao carro da campanha:
 *   mesmo_veiculo .... quem demonstrou interesse NESTE carro
 *   mesmo_modelo ..... neste modelo (qualquer unidade, inclusive já vendida)
 *   mesma_marca ...... nesta marca
 *   faixa_de_preco ... em carro de preço parecido (a mesma banda dos "parecidos" da ficha)
 */
export const CRITERIOS_DE_PUBLICO = ["mesmo_veiculo", "mesmo_modelo", "mesma_marca", "faixa_de_preco"] as const;
export type CriterioDePublico = (typeof CRITERIOS_DE_PUBLICO)[number];

export const ROTULO_DO_CRITERIO: Record<CriterioDePublico, string> = {
  mesmo_veiculo: "Este carro",
  mesmo_modelo: "Este modelo",
  mesma_marca: "Esta marca",
  faixa_de_preco: "Preço parecido",
};

/** Há quanto tempo o interesse aconteceu. `null` é sem limite. Recorte de tela. */
export const JANELAS_DE_INTERESSE = [30, 90, 180, 365, null] as const;
export type JanelaDeInteresse = (typeof JANELAS_DE_INTERESSE)[number];

export interface PedidoDeCampanha {
  nome: string;
  veiculoId: number;
  criterio: CriterioDePublico;
  janelaDias: JanelaDeInteresse;
  mensagem: string;
}

export const TAMANHO_MAXIMO_DO_NOME = 80;
/** Três partes: acima disso a mensagem não é mais um SMS, e o custo triplica sem ninguém ver. */
export const PARTES_MAXIMAS = 3;

export function lerPedidoDeCampanha(corpo: unknown): { ok: true; pedido: PedidoDeCampanha } | { ok: false; motivo: string } {
  if (!corpo || typeof corpo !== "object") return { ok: false, motivo: "Pedido vazio." };
  const c = corpo as Record<string, unknown>;
  const nome = typeof c.nome === "string" ? c.nome.trim() : "";
  if (nome === "" || nome.length > TAMANHO_MAXIMO_DO_NOME) return { ok: false, motivo: "Dê um nome à campanha (até 80 caracteres)." };
  const veiculoId = Number(c.veiculoId);
  if (!Number.isInteger(veiculoId) || veiculoId <= 0) return { ok: false, motivo: "Escolha o carro da campanha." };
  const criterio = CRITERIOS_DE_PUBLICO.find((x) => x === c.criterio);
  if (!criterio) return { ok: false, motivo: "Escolha quem recebe." };
  const janela = c.janelaDias === null || c.janelaDias === undefined ? null : Number(c.janelaDias);
  if (!JANELAS_DE_INTERESSE.some((j) => j === janela)) return { ok: false, motivo: "Período de interesse inválido." };
  const mensagem = typeof c.mensagem === "string" ? c.mensagem.trim() : "";
  if (mensagem === "") return { ok: false, motivo: "Escreva a mensagem." };
  if (!mensagem.includes("{link}")) return { ok: false, motivo: "A mensagem precisa do {link}: sem ele não há como medir quem abriu." };
  return { ok: true, pedido: { nome, veiculoId, criterio, janelaDias: janela as JanelaDeInteresse, mensagem } };
}

// ─────────────────────────────────────────────────────────────────────────────
// O telefone
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O número como o fornecedor de SMS pede: só dígitos, com 55 e DDD
 * ("5541999990000"). `null` quando não é celular brasileiro: fixo não recebe
 * SMS, e mandar para ele é pagar por nada.
 */
export function telefoneParaSms(bruto: string | null | undefined): string | null {
  let d = (bruto ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || d[2] !== "9") return null;
  return `55${d}`;
}

/** "5541999990000" → "(41) 9••••-0000". O que a tela mostra. */
export function mascararTelefoneDoSms(telefone: string): string {
  const d = telefone.replace(/\D/g, "").replace(/^55/, "");
  if (d.length < 10) return "••••";
  return `(${d.slice(0, 2)}) ${d[2]}••••-${d.slice(-4)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// O público
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A banda de "preço parecido" é a dos parecidos da ficha (`lib/similares.ts`).
 * Escrita aqui, e não importada, porque este arquivo vai para o navegador e
 * `similares` arrasta o repasse; `tests/campanhas-de-sms.test.ts` trava os
 * dois pares como iguais.
 */
export const PISO_DO_PRECO_PARECIDO = 0.7;
export const TETO_DO_PRECO_PARECIDO = 1.4;

/** O carro, como o público precisa dele. */
export interface CarroDoPublico {
  id: number;
  marca: string;
  modelo: string;
  preco: number | null;
}

/** Uma linha de `leads_veiculos`. */
export interface InteresseRegistrado {
  leadId: string;
  veiculoId: number;
  /** Retrato do nome do carro quando o interesse foi registrado. Sobrevive à venda. */
  rotulo: string | null;
  preco: number | null;
  motivoDescarte: string | null;
  criadoEm: string;
}

/** Um lead, só com o que o público usa. */
export interface LeadDoPublico {
  id: string;
  nome: string | null;
  telefone: string | null;
  /** O carro principal do lead (`leads.veiculo_id`), quando há. */
  veiculoId: number | null;
  desfecho: string | null;
  criadoEm: string;
}

/** Interesse encerrado por estes motivos não é convite para mensagem. */
export const DESCARTES_QUE_TIRAM_DO_PUBLICO = ["comprou_fora", "desistiu"];
/** Este tira a PESSOA, e não só aquele interesse: quem comprou fora já tem carro. */
export const DESCARTE_DE_QUEM_COMPROU = "comprou_fora";
/** Lead que a equipe descartou (spam, teste, engano) não é público de nada. */
export const DESFECHO_DESCARTADO = "descartado";

export interface Destinatario {
  leadId: string;
  nome: string | null;
  /** Só dígitos, com 55. NUNCA vai para o navegador. */
  telefone: string;
}

export interface PublicoMontado {
  destinatarios: Destinatario[];
  /** Quem casou com o critério e ficou de fora, e por quê. */
  fora: {
    semCelular: number;
    saiuDaLista: number;
    jaComprou: number;
    desistiu: number;
    /** Leads que a equipe descartou (spam, teste). */
    descartado: number;
    repetido: number;
  };
}

const normal = (s: string | null | undefined) => semAcento(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const contemPalavras = (texto: string, parte: string) => parte !== "" && ` ${texto} `.includes(` ${parte} `);

/**
 * Quem entra no público da campanha.
 *
 * As fontes são duas: `leads_veiculos` (cada carro que o lead olhou) e
 * `leads.veiculo_id` (o carro com que ele chegou). O carro do interesse pode
 * já ter saído do estoque: aí marca e modelo são lidos do rótulo guardado.
 *
 * Fica de fora, nesta ordem: lead descartado pela equipe, quem já comprou,
 * quem desistiu NAQUELE interesse, quem não tem celular, quem pediu para sair,
 * e o mesmo número pela segunda vez.
 *
 * "Já comprou" é da PESSOA, e pessoa aqui é o telefone: se o número tem um
 * lead ganho ou um interesse fechado como "comprou fora" em QUALQUER lead e
 * em qualquer carro, nenhum outro lead daquele número recebe. Sem isso, quem
 * comprou o Corolla receberia a oferta do Civic pelo cadastro antigo.
 *
 * Lead PERDIDO entra: perdeu-se aquela negociação, e a pessoa pode voltar por
 * outro carro ou por outro preço.
 */
export function montarPublico(entrada: {
  alvo: CarroDoPublico;
  criterio: CriterioDePublico;
  janelaDias: JanelaDeInteresse;
  agora: Date;
  interesses: InteresseRegistrado[];
  leads: LeadDoPublico[];
  /** Todo carro que a loja conhece, à venda ou não: é de onde sai a marca do interesse. */
  carros: CarroDoPublico[];
  /** Telefones (dígitos com 55) que pediram para sair. */
  saiuDaLista: ReadonlySet<string>;
}): PublicoMontado {
  const { alvo, criterio, janelaDias, agora } = entrada;
  const carroPorId = new Map(entrada.carros.map((c) => [c.id, c]));
  const leadPorId = new Map(entrada.leads.map((l) => [l.id, l]));
  const desde = janelaDias === null ? null : agora.getTime() - janelaDias * 24 * 60 * 60 * 1000;
  const marcaAlvo = normal(alvo.marca);
  const modeloAlvo = normal(alvo.modelo);

  const casa = (i: { veiculoId: number; rotulo: string | null; preco: number | null }): boolean => {
    if (criterio === "mesmo_veiculo") return i.veiculoId === alvo.id;
    const carro = carroPorId.get(i.veiculoId);
    if (criterio === "faixa_de_preco") {
      const preco = i.preco ?? carro?.preco ?? null;
      if (preco === null || alvo.preco === null || preco <= 0) return i.veiculoId === alvo.id;
      return alvo.preco >= preco * PISO_DO_PRECO_PARECIDO && alvo.preco <= preco * TETO_DO_PRECO_PARECIDO;
    }
    // O ano no fim do rótulo não é modelo: "Peugeot 208 Griffe 2008" não é um 2008.
    const rotulo = normal(i.rotulo).replace(/ (19|20)\d{2}$/, "");
    const mesmaMarca = carro ? normal(carro.marca) === marcaAlvo : contemPalavras(rotulo, marcaAlvo);
    if (criterio === "mesma_marca") return mesmaMarca;
    const mesmoModelo = carro ? normal(carro.modelo) === modeloAlvo : contemPalavras(rotulo, modeloAlvo);
    return mesmaMarca && mesmoModelo;
  };
  const naJanela = (quando: string) => desde === null || new Date(quando).getTime() >= desde;

  // Quem já comprou, por telefone, olhando TODOS os leads e interesses (casem ou não).
  const jaComprou = new Set<string>();
  for (const l of entrada.leads) {
    const t = l.desfecho === "ganho" ? telefoneParaSms(l.telefone) : null;
    if (t) jaComprou.add(t);
  }
  for (const i of entrada.interesses) {
    if (i.motivoDescarte !== DESCARTE_DE_QUEM_COMPROU) continue;
    const t = telefoneParaSms(leadPorId.get(i.leadId)?.telefone);
    if (t) jaComprou.add(t);
  }

  // lead → o interesse mais recente que casa, e se algum que casa está vivo.
  const candidatos = new Map<string, { quando: number; vivo: boolean }>();
  const anotar = (leadId: string, quando: string, vivo: boolean) => {
    const t = new Date(quando).getTime();
    const atual = candidatos.get(leadId);
    candidatos.set(leadId, { quando: Math.max(atual?.quando ?? 0, t), vivo: (atual?.vivo ?? false) || vivo });
  };
  for (const i of entrada.interesses) {
    if (!naJanela(i.criadoEm) || !casa(i)) continue;
    anotar(i.leadId, i.criadoEm, !DESCARTES_QUE_TIRAM_DO_PUBLICO.includes(i.motivoDescarte ?? ""));
  }
  const comLinha = new Set(entrada.interesses.map((i) => `${i.leadId}|${i.veiculoId}`));
  for (const l of entrada.leads) {
    // O carro principal só conta quando não virou linha de interesse (lead antigo).
    if (l.veiculoId === null || comLinha.has(`${l.id}|${l.veiculoId}`) || !naJanela(l.criadoEm)) continue;
    if (casa({ veiculoId: l.veiculoId, rotulo: null, preco: null })) anotar(l.id, l.criadoEm, true);
  }

  const fora = { semCelular: 0, saiuDaLista: 0, jaComprou: 0, desistiu: 0, descartado: 0, repetido: 0 };
  const destinatarios: Destinatario[] = [];
  const vistos = new Set<string>();
  // Do interesse mais recente para o mais antigo: se o número repete, fica o lead mais novo.
  const ordenados = [...candidatos].sort((a, b) => b[1].quando - a[1].quando || a[0].localeCompare(b[0]));
  for (const [leadId, candidato] of ordenados) {
    const lead = leadPorId.get(leadId);
    if (!lead) continue;
    if (lead.desfecho === DESFECHO_DESCARTADO) {
      fora.descartado++;
      continue;
    }
    const telefone = telefoneParaSms(lead.telefone);
    if (lead.desfecho === "ganho" || (telefone !== null && jaComprou.has(telefone))) {
      fora.jaComprou++;
      continue;
    }
    if (!candidato.vivo) {
      fora.desistiu++;
      continue;
    }
    if (!telefone) {
      fora.semCelular++;
      continue;
    }
    if (entrada.saiuDaLista.has(telefone)) {
      fora.saiuDaLista++;
      continue;
    }
    if (vistos.has(telefone)) {
      fora.repetido++;
      continue;
    }
    vistos.add(telefone);
    destinatarios.push({ leadId, nome: lead.nome, telefone });
  }
  return { destinatarios, fora };
}

// ─────────────────────────────────────────────────────────────────────────────
// O link curto
// ─────────────────────────────────────────────────────────────────────────────

/** Sem 0/O e 1/l/I: o código pode ser lido em voz alta ou redigitado. */
export const ALFABETO_DO_CODIGO = "23456789abcdefghjkmnpqrstuvwxyz";
export const TAMANHO_DO_CODIGO = 7;

export function ehCodigoDeSms(texto: string): boolean {
  return texto.length === TAMANHO_DO_CODIGO && [...texto].every((c) => ALFABETO_DO_CODIGO.includes(c));
}

/** O caminho do link de um destinatário: `/s/<código>`. */
export const caminhoDoLinkCurto = (codigo: string) => `/s/${codigo}`;

/** O `utm_campaign` com que o clique chega à ficha, e com que o lead novo é atribuído. */
export const utmDaCampanhaDeSms = (codigoDaCampanha: string) => `sms-${codigoDaCampanha}`;

/** A ficha com as marcas da campanha. `caminho` é o da ficha, sem domínio. */
export function destinoDoClique(caminho: string, codigoDaCampanha: string): string {
  const sep = caminho.includes("?") ? "&" : "?";
  return `${caminho}${sep}utm_source=sms&utm_medium=sms&utm_campaign=${utmDaCampanhaDeSms(codigoDaCampanha)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// O retorno do fornecedor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Os avisos que a APIBrasil manda ao `webhook_url` de cada SMS (guia do
 * fornecedor, conferido em 07/10/2026): o corpo é uma LISTA de avisos, e os
 * status vêm em sequência.
 */
export type StatusDoRetorno = "inserted_for_processing" | "valid" | "sent_to_carrier" | "reply" | "outro";

export interface AvisoDoFornecedor {
  /** O id que o fornecedor deu ao SMS quando o aceitou. */
  id: string;
  status: StatusDoRetorno;
  /** O status como veio, para o que não se conhece ainda. */
  statusBruto: string;
  /** O texto da resposta, quando `status` é `reply`. */
  texto: string | null;
}

const STATUS_CONHECIDOS: StatusDoRetorno[] = ["inserted_for_processing", "valid", "sent_to_carrier", "reply"];

/** Lê o corpo do webhook. Aceita a lista ou um aviso solto; item sem id ou sem status fica de fora. */
export function lerRetornoDoSms(corpo: unknown): AvisoDoFornecedor[] {
  const itens = Array.isArray(corpo) ? corpo : corpo && typeof corpo === "object" ? [corpo] : [];
  const avisos: AvisoDoFornecedor[] = [];
  for (const item of itens) {
    if (!item || typeof item !== "object") continue;
    const i = item as Record<string, unknown>;
    const id = i.id ?? i.message_id ?? i.sms_id;
    const statusBruto = typeof i.status === "string" ? i.status.trim() : "";
    if ((typeof id !== "string" && typeof id !== "number") || String(id) === "" || statusBruto === "") continue;
    const status = STATUS_CONHECIDOS.find((s) => s === statusBruto.toLowerCase()) ?? "outro";
    const texto = [i.reply, i.text, i.message, i.body, i.content].find((t) => typeof t === "string" && t.trim() !== "") as string | undefined;
    avisos.push({ id: String(id), status, statusBruto, texto: status === "reply" ? (texto?.trim().slice(0, 500) ?? null) : null });
  }
  return avisos;
}

/**
 * A pessoa pediu para não receber mais.
 *
 * Larga de propósito: tirar da lista alguém que não pediu custa um SMS que
 * não vai; deixar na lista alguém que pediu custa uma reclamação. A resposta
 * fica guardada e visível no monitor de qualquer jeito.
 *
 * A exceção é a pergunta ("posso sair hoje pra ver?"): com interrogação, só a
 * palavra sozinha vale.
 */
export function ehPedidoDeSaida(texto: string | null | undefined): boolean {
  const t = normal(texto);
  if (t === "") return false;
  if (/^(sair|sai|saia|pare|parar|para|stop|chega|cancelar|cancela|remover|remove|remova|descadastrar)$/.test(t)) return true;
  if ((texto ?? "").includes("?")) return false;
  const palavras = t.split(" ").length;
  return (
    /\b(stop|descadastr\w*|remov\w*|cancel\w*)\b/.test(t) ||
    /\bsair\b/.test(t) && (palavras <= 4 || /\blista\b/.test(t)) ||
    /\b(sai|saia|pare|parar|para|chega)\b/.test(t) && palavras <= 2 ||
    /\bpar[ae]r? de (me )?(mandar|enviar|encher)/.test(t) ||
    /\bme tir[ae]\b/.test(t) ||
    /\bnao (me )?(quero|envie|mande|enviar|mandar|perturbe)\b/.test(t)
  );
}

/** Número comprido dentro de texto livre (telefone, CPF) vira "••••": texto de terceiro não carrega contato para a tela. */
export function semNumeroLongo(texto: string | null): string | null {
  return texto === null ? null : texto.replace(/\d[\d\s().-]{6,}\d/g, "••••");
}

// ─────────────────────────────────────────────────────────────────────────────
// O que a tela mostra
// ─────────────────────────────────────────────────────────────────────────────

export const SITUACOES_DA_CAMPANHA = ["rascunho", "enviando", "enviada", "interrompida"] as const;
export type SituacaoDaCampanha = (typeof SITUACOES_DA_CAMPANHA)[number];

export const ROTULO_DA_SITUACAO: Record<SituacaoDaCampanha, string> = {
  rascunho: "Rascunho",
  enviando: "Enviando",
  enviada: "Enviada",
  interrompida: "Interrompida",
};

/** A situação de UM envio: na fila, reservado para envio, aceito pelo fornecedor, ou recusado. */
export const SITUACOES_DO_ENVIO = ["na_fila", "enviando", "enviado", "falhou"] as const;
export type SituacaoDoEnvio = (typeof SITUACOES_DO_ENVIO)[number];

/** Um envio, como o resumo precisa dele. */
export interface EnvioParaResumo {
  situacao: SituacaoDoEnvio;
  naOperadoraEm: string | null;
  cliques: number;
  respondeuEm: string | null;
  saiuEm: string | null;
  custo: number | null;
  partes: number;
}

export interface ResumoDaCampanha {
  publico: number;
  naFila: number;
  enviados: number;
  falhas: number;
  /** A operadora recebeu. É o mais perto de "entregue" que o fornecedor informa. */
  naOperadora: number;
  /** Pessoas que abriram o link (não o total de cliques). */
  clicaram: number;
  cliques: number;
  responderam: number;
  sairam: number;
  /** O que o fornecedor disse ter cobrado, somado. */
  custo: number;
  /** SMS cobrados: uma mensagem longa conta mais de um. */
  partes: number;
}

export function resumoDaCampanha(envios: EnvioParaResumo[]): ResumoDaCampanha {
  const r: ResumoDaCampanha = { publico: envios.length, naFila: 0, enviados: 0, falhas: 0, naOperadora: 0, clicaram: 0, cliques: 0, responderam: 0, sairam: 0, custo: 0, partes: 0 };
  for (const e of envios) {
    if (e.situacao === "na_fila" || e.situacao === "enviando") r.naFila++;
    else if (e.situacao === "falhou") r.falhas++;
    else {
      r.enviados++;
      r.partes += e.partes;
      r.custo += e.custo ?? 0;
    }
    if (e.naOperadoraEm) r.naOperadora++;
    if (e.cliques > 0) r.clicaram++;
    r.cliques += e.cliques;
    if (e.respondeuEm) r.responderam++;
    if (e.saiuEm) r.sairam++;
  }
  r.custo = Math.round(r.custo * 100) / 100;
  return r;
}

/** "12 de 80" como percentual inteiro; 0 quando não há base. */
export const taxa = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : 0);

/** Uma campanha na lista. */
export interface CampanhaDeSmsNaLista {
  id: string;
  nome: string;
  situacao: SituacaoDaCampanha;
  veiculoId: number;
  veiculoRotulo: string;
  criterio: CriterioDePublico;
  criadoEm: string;
  criadoPorNome: string | null;
  enviadaEm: string | null;
  resumo: ResumoDaCampanha;
}

/** Um destinatário na tela de monitoramento. SEM telefone inteiro e sem sobrenome. */
export interface EnvioNaTela {
  id: string;
  primeiroNome: string;
  telefoneMascarado: string;
  situacao: SituacaoDoEnvio;
  enviadoEm: string | null;
  naOperadoraEm: string | null;
  cliques: number;
  clicouEm: string | null;
  respondeuEm: string | null;
  resposta: string | null;
  saiuEm: string | null;
  erro: string | null;
  /** O lead, para quem pode abrir a ficha dele. */
  leadId: string | null;
}

export interface CampanhaDeSmsDetalhada extends CampanhaDeSmsNaLista {
  janelaDias: JanelaDeInteresse;
  /** O molde, com as variáveis. */
  mensagem: string;
  /** Como a mensagem fica para um destinatário, e quanto ela mede. */
  exemplo: string;
  tamanho: TamanhoDoSms;
  /** O `utm_campaign` com que os cliques chegam. */
  utm: string;
  /** Leads novos que entraram no site com esse `utm_campaign`. */
  leadsNovos: number;
  envios: EnvioNaTela[];
  homologacao: boolean;
}

/** A prévia antes de criar: quantos recebem, quem ficou de fora, quanto custa. */
export interface PreviaDaCampanha {
  veiculoRotulo: string;
  destinatarios: number;
  fora: PublicoMontado["fora"];
  exemplo: string;
  tamanho: TamanhoDoSms;
  /** O preço por parte configurado (`SMS_PRECO_POR_PARTE`), ou `null` se ninguém disse. */
  precoPorParte: number | null;
  custoEstimado: number | null;
}

/** Um carro à venda, para escolher no formulário. */
export interface CarroDaCampanha {
  id: number;
  rotulo: string;
  preco: number | null;
}

/** O que a rota de envio devolve a cada lote. A tela chama de novo enquanto `restam > 0`. */
export interface RespostaDoLote {
  situacao: SituacaoDaCampanha;
  resumo: ResumoDaCampanha;
  restam: number;
  /** Por que o lote parou antes do fim (sem saldo, token recusado…). */
  aviso: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// A tela de monitoramento: o estágio de cada destinatário
// ─────────────────────────────────────────────────────────────────────────────

/** Até onde UM destinatário chegou. A tela mostra o mais avançado. */
export const ESTAGIOS_DO_ENVIO = ["na_fila", "enviado", "na_operadora", "clicou", "respondeu", "saiu", "falhou"] as const;
export type EstagioDoEnvio = (typeof ESTAGIOS_DO_ENVIO)[number];

export const ROTULO_DO_ESTAGIO: Record<EstagioDoEnvio, string> = {
  na_fila: "Na fila",
  enviado: "Enviado",
  na_operadora: "Na operadora",
  clicou: "Clicou",
  respondeu: "Respondeu",
  saiu: "Saiu",
  falhou: "Falhou",
};

type EnvioComEstagio = Pick<EnvioNaTela, "situacao" | "enviadoEm" | "naOperadoraEm" | "cliques" | "clicouEm" | "respondeuEm" | "saiuEm">;

/**
 * O estágio mais avançado de um envio. Pedir para sair vence responder (a
 * saída É uma resposta), e responder vence clicar: é a ordem de quanto a
 * pessoa se manifestou, e não a do relógio.
 */
export function estagioDoEnvio(e: EnvioComEstagio): EstagioDoEnvio {
  if (e.saiuEm) return "saiu";
  if (e.respondeuEm) return "respondeu";
  if (e.cliques > 0) return "clicou";
  if (e.situacao === "falhou") return "falhou";
  if (e.naOperadoraEm) return "na_operadora";
  if (e.situacao === "enviado") return "enviado";
  return "na_fila";
}

/** A hora do estágio que a tela mostra; `null` para quem ainda está na fila. */
export function quandoDoEstagio(e: EnvioComEstagio): string | null {
  const estagio = estagioDoEnvio(e);
  if (estagio === "saiu") return e.saiuEm;
  if (estagio === "respondeu") return e.respondeuEm;
  if (estagio === "clicou") return e.clicouEm ?? e.enviadoEm;
  if (estagio === "na_operadora") return e.naOperadoraEm;
  if (estagio === "na_fila") return null;
  return e.enviadoEm;
}

/** Os recortes da tabela de destinatários. */
export const FILTROS_DE_DESTINATARIO = ["todos", "clicaram", "responderam", "falharam", "sairam"] as const;
export type FiltroDeDestinatario = (typeof FILTROS_DE_DESTINATARIO)[number];

export const ROTULO_DO_FILTRO: Record<FiltroDeDestinatario, string> = {
  todos: "Todos",
  clicaram: "Clicaram",
  responderam: "Responderam",
  falharam: "Falharam",
  sairam: "Saíram",
};

/**
 * O recorte é pelo FATO, e não pelo estágio mostrado: quem clicou e depois
 * respondeu aparece em "Clicaram" e em "Responderam", como no resumo.
 */
export function passaNoFiltro(e: EnvioComEstagio, filtro: FiltroDeDestinatario): boolean {
  if (filtro === "clicaram") return e.cliques > 0;
  if (filtro === "responderam") return e.respondeuEm !== null;
  if (filtro === "falharam") return e.situacao === "falhou";
  if (filtro === "sairam") return e.saiuEm !== null;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// A prévia ao vivo do formulário
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O preço como entra na mensagem: "R$ 89.900", com espaço comum. O
 * `toLocaleString` de moeda põe um espaço inseparável depois do "R$", que está
 * fora do alfabeto do SMS e derruba a mensagem para 70 caracteres por parte.
 */
export function precoNoSms(preco: number | null): string {
  if (preco === null || !(preco > 0)) return "sob consulta";
  return `R$ ${Math.round(preco).toLocaleString("pt-BR")}`.replace(/\s/g, " ");
}

/** Um código com a cara dos de verdade, para a prévia medir o link no tamanho certo. */
export const CODIGO_DE_EXEMPLO = "abc2345";
