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

import { familiaDoModelo, familiasNoTexto, marcaCanonica } from "./familiaDoModelo";

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
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
 * Quem recebe. A campanha escolhe o público de dois jeitos (pedido do dono em
 * 07/10/2026: "segmentações dos leads e escolher por carro ou perfil, de
 * acordo com a intenção da campanha").
 *
 * POR CARRO — em relação ao carro da campanha:
 *   mesmo_veiculo .... quem demonstrou interesse NESTE carro
 *   mesmo_modelo ..... neste modelo (a família: qualquer versão, inclusive já vendida)
 *   mesma_marca ...... nesta marca
 *   faixa_de_preco ... em carro de preço parecido (a mesma banda dos "parecidos" da ficha)
 *
 * POR PERFIL — sem olhar que carro a pessoa viu:
 *   interessados ..... quem procurou a loja e ainda não comprou (com ou sem carro identificado)
 *   clientes ......... quem já comprou na loja (pós-venda, recompra)
 *   todos ............ os dois
 */
export const CRITERIOS_DE_CARRO = ["mesmo_veiculo", "mesmo_modelo", "mesma_marca", "faixa_de_preco"] as const;
export const CRITERIOS_DE_PERFIL = ["interessados", "clientes", "todos"] as const;
export const CRITERIOS_DE_PUBLICO = [...CRITERIOS_DE_CARRO, ...CRITERIOS_DE_PERFIL] as const;
export type CriterioDePublico = (typeof CRITERIOS_DE_PUBLICO)[number];

export const ehCriterioDeCarro = (c: CriterioDePublico): boolean => (CRITERIOS_DE_CARRO as readonly string[]).includes(c);

export const ROTULO_DO_CRITERIO: Record<CriterioDePublico, string> = {
  mesmo_veiculo: "Este carro",
  mesmo_modelo: "Este modelo",
  mesma_marca: "Esta marca",
  faixa_de_preco: "Preço parecido",
  interessados: "Interessados",
  clientes: "Clientes",
  todos: "Todos",
};

/** Há quanto tempo foi o interesse (ou, por perfil, o último contato). `null` é sem limite. Recorte de tela. */
export const JANELAS_DE_INTERESSE = [30, 90, 180, 365, null] as const;
export type JanelaDeInteresse = (typeof JANELAS_DE_INTERESSE)[number];

/**
 * O descanso: quem recebeu QUALQUER campanha há menos de tantos dias fica de
 * fora desta. Zero desliga. É escolha de quem monta a campanha, e o padrão é
 * uma semana: três SMS da mesma loja em três dias é o que faz a pessoa sair.
 */
export const DESCANSOS_EM_DIAS = [0, 7, 15, 30] as const;
export type DescansoEmDias = (typeof DESCANSOS_EM_DIAS)[number];
export const DESCANSO_PADRAO: DescansoEmDias = 7;

/** Há quanto tempo a pessoa comprou, no mínimo. Recorte de tela para a campanha de troca. */
export const TEMPOS_DESDE_A_COMPRA = [null, 12, 18, 24, 36] as const;
export type TempoDesdeACompra = (typeof TEMPOS_DESDE_A_COMPRA)[number];

/** Aonde o link de uma campanha sem carro pode levar. Caminhos do site, e só estes. */
export const DESTINOS_SEM_CARRO = { estoque: "/estoque", avaliacao: "/avaliacao" } as const;
export type DestinoSemCarro = keyof typeof DESTINOS_SEM_CARRO;
export const ROTULO_DO_DESTINO: Record<DestinoSemCarro, string> = { estoque: "O estoque", avaliacao: "A avaliação do usado" };

export interface PedidoDeCampanha {
  nome: string;
  /** O carro da campanha. Obrigatório por carro; por perfil é opcional, e sem ele o link leva ao estoque. */
  veiculoId: number | null;
  criterio: CriterioDePublico;
  janelaDias: JanelaDeInteresse;
  /** Só quem chegou por estes canais. Vazio é todos. */
  canais: string[];
  descansoDias: DescansoEmDias;
  /**
   * Só quem comprou há pelo menos tantos meses ("hora de trocar seu carro").
   * Vale para "clientes" e "todos"; `null` não filtra. Quem não tem data de
   * compra conhecida fica de fora quando o filtro está ligado.
   */
  compraHaMeses: TempoDesdeACompra;
  /** Para onde leva o link de uma campanha SEM carro. Com carro, é sempre a ficha dele. */
  destino: DestinoSemCarro;
  mensagem: string;
}

export const TAMANHO_MAXIMO_DO_NOME = 80;
/** Três partes: acima disso a mensagem não é mais um SMS, e o custo triplica sem ninguém ver. */
export const PARTES_MAXIMAS = 3;

/** A mensagem de campanha sem carro: nada de {carro} nem {preco}. */
export const MENSAGEM_PADRAO_SEM_CARRO = "{nome}, chegaram novidades no estoque da Motors Store. Veja: {link}";
/** A mensagem da campanha de troca, para quem já comprou: leva à avaliação do usado. */
export const MENSAGEM_PADRAO_DE_TROCA = "{nome}, que tal trocar de carro? A Motors Store avalia o seu usado na troca: {link}";

export function lerPedidoDeCampanha(corpo: unknown): { ok: true; pedido: PedidoDeCampanha } | { ok: false; motivo: string } {
  if (!corpo || typeof corpo !== "object") return { ok: false, motivo: "Pedido vazio." };
  const c = corpo as Record<string, unknown>;
  const nome = typeof c.nome === "string" ? c.nome.trim() : "";
  if (nome === "" || nome.length > TAMANHO_MAXIMO_DO_NOME) return { ok: false, motivo: "Dê um nome à campanha (até 80 caracteres)." };
  const criterio = CRITERIOS_DE_PUBLICO.find((x) => x === c.criterio);
  if (!criterio) return { ok: false, motivo: "Escolha quem recebe." };
  const semCarro = c.veiculoId === null || c.veiculoId === undefined || c.veiculoId === "";
  const veiculoId = semCarro ? null : Number(c.veiculoId);
  if (veiculoId !== null && (!Number.isInteger(veiculoId) || veiculoId <= 0)) return { ok: false, motivo: "Carro inválido." };
  if (veiculoId === null && ehCriterioDeCarro(criterio)) return { ok: false, motivo: "Escolha o carro da campanha." };
  const janela = c.janelaDias === null || c.janelaDias === undefined ? null : Number(c.janelaDias);
  if (!JANELAS_DE_INTERESSE.some((j) => j === janela)) return { ok: false, motivo: "Período inválido." };
  const descanso = c.descansoDias === undefined ? DESCANSO_PADRAO : Number(c.descansoDias);
  if (!DESCANSOS_EM_DIAS.some((d) => d === descanso)) return { ok: false, motivo: "Descanso inválido." };
  const canais = Array.isArray(c.canais) ? [...new Set(c.canais.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim().slice(0, 60)))].slice(0, 40) : [];
  const compra = c.compraHaMeses === null || c.compraHaMeses === undefined ? null : Number(c.compraHaMeses);
  if (!TEMPOS_DESDE_A_COMPRA.some((t) => t === compra)) return { ok: false, motivo: "Tempo desde a compra inválido." };
  if (compra !== null && criterio !== "clientes" && criterio !== "todos") return { ok: false, motivo: "O filtro por data de compra só vale para Clientes e Todos." };
  const destino = c.destino === undefined || c.destino === null ? "estoque" : (Object.keys(DESTINOS_SEM_CARRO) as DestinoSemCarro[]).find((d) => d === c.destino);
  if (!destino) return { ok: false, motivo: "Destino do link inválido." };
  const mensagem = typeof c.mensagem === "string" ? c.mensagem.trim() : "";
  if (mensagem === "") return { ok: false, motivo: "Escreva a mensagem." };
  if (!mensagem.includes("{link}")) return { ok: false, motivo: "A mensagem precisa do {link}: sem ele não há como medir quem abriu." };
  if (veiculoId === null && /\{(carro|preco)\}/.test(mensagem)) return { ok: false, motivo: "Sem carro escolhido, a mensagem não pode usar {carro} nem {preco}." };
  return { ok: true, pedido: { nome, veiculoId, criterio, janelaDias: janela as JanelaDeInteresse, canais, descansoDias: descanso as DescansoEmDias, compraHaMeses: compra as TempoDesdeACompra, destino, mensagem } };
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

/**
 * Um carro que a pessoa olhou, ou comprou. Vem de `leads_veiculos` (site) ou
 * de `marketing_interesses` (base importada).
 */
export interface InteresseRegistrado {
  /** O id da pessoa em `LeadDoPublico.id`. */
  leadId: string;
  /** O carro no estoque do site, quando se sabe qual é. */
  veiculoId: number | null;
  /** Retrato do nome do carro quando o interesse foi registrado. Sobrevive à venda. */
  rotulo: string | null;
  /** Marca e modelo em campos próprios, quando a origem os tem (a base importada). */
  marca?: string | null;
  modelo?: string | null;
  preco: number | null;
  motivoDescarte: string | null;
  /** "compra" é o carro que a pessoa COMPROU: faz dela cliente, e não conta como interesse. */
  tipo?: "interesse" | "compra";
  criadoEm: string;
}

/** Uma pessoa, só com o que o público usa. Lead do site ou contato da base importada. */
export interface LeadDoPublico {
  /** Único entre as duas origens: o servidor prefixa o contato da base. */
  id: string;
  origem?: "lead" | "base";
  nome: string | null;
  telefone: string | null;
  /** O carro principal do lead (`leads.veiculo_id`), quando há. */
  veiculoId: number | null;
  desfecho: string | null;
  /** Já comprou na loja (a base importada diz; no site é o lead ganho). */
  cliente?: boolean;
  /** Quando comprou, se a origem sabe (a base importada; no site, a data do ganho). */
  comprouEm?: string | null;
  /** Marcado na origem como "não tem interesse": não entra em público nenhum. */
  semInteresse?: boolean;
  canais?: string[];
  criadoEm: string;
  ultimoContatoEm?: string | null;
}

/** Interesse encerrado por estes motivos não é convite para mensagem. */
export const DESCARTES_QUE_TIRAM_DO_PUBLICO = ["comprou_fora", "desistiu"];
/** Este tira a PESSOA das ofertas, e não só aquele interesse: quem comprou fora já tem carro. */
export const DESCARTE_DE_QUEM_COMPROU = "comprou_fora";
/** Lead que a equipe descartou (spam, teste, engano) não é público de nada. */
export const DESFECHO_DESCARTADO = "descartado";

export interface Destinatario {
  /** O lead do site, quando a pessoa é um. */
  leadId: string | null;
  /** O contato da base importada, quando a pessoa é um. */
  contatoId: string | null;
  nome: string | null;
  /** Só dígitos, com 55. NUNCA vai para o navegador. */
  telefone: string;
  /** A afinidade com o carro da campanha, de 0 a 100. `null` em campanha por perfil. */
  match: number | null;
  /** O carro que a pessoa olhou e que mais se parece com o da campanha. */
  olhou: string | null;
  /** Quando foi o contato que a pôs no público (ISO). `null`: a origem não diz. */
  quando: string | null;
}

/**
 * A AFINIDADE ("percentual de match", pedido do dono em 07/10/2026).
 *
 * São cinco sinais, e cada um vale um quinto. Não há peso escolhido: o número
 * diz QUANTOS dos cinco a pessoa tem, olhando o interesse dela que mais se
 * parece com o carro da campanha.
 *
 *   mesma marca · mesmo modelo (a família) · este carro exato ·
 *   preço parecido (a banda dos parecidos da ficha) · interesse recente
 *
 * Quem olhou ESTE carro tem os quatro primeiros de saída (80%) e chega a 100%
 * se foi há pouco. Quem olhou outro carro da marca, de preço distante, há um
 * ano, fica em 20%.
 */
export const SINAIS_DE_AFINIDADE = ["mesma_marca", "mesmo_modelo", "este_carro", "preco_parecido", "recente"] as const;
export type SinalDeAfinidade = (typeof SINAIS_DE_AFINIDADE)[number];
export const ROTULO_DO_SINAL: Record<SinalDeAfinidade, string> = {
  mesma_marca: "mesma marca",
  mesmo_modelo: "mesmo modelo",
  este_carro: "este carro",
  preco_parecido: "preço parecido",
  recente: "interesse recente",
};
/** "Recente" é a janela do meio da tela: o interesse dos últimos 90 dias. */
export const DIAS_DO_INTERESSE_RECENTE = 90;

/** Os sinais que um interesse tem em relação ao carro da campanha. */
export function sinaisDeAfinidade(
  interesse: Pick<InteresseRegistrado, "veiculoId" | "rotulo" | "marca" | "modelo" | "preco" | "criadoEm">,
  alvo: CarroDoPublico,
  carroDoInteresse: CarroDoPublico | undefined,
  agora: Date,
): SinalDeAfinidade[] {
  const sinais: SinalDeAfinidade[] = [];
  const esteCarro = interesse.veiculoId === alvo.id;
  const marca = carroDoInteresse?.marca ?? interesse.marca ?? null;
  const modelo = carroDoInteresse?.modelo ?? interesse.modelo ?? null;
  const noRotulo = familiasNoTexto(interesse.rotulo);
  const marcaAlvo = marcaCanonica(alvo.marca);
  const familiaAlvo = familiaDoModelo(alvo.modelo);
  const mesmaMarca = esteCarro || (marcaAlvo !== "" && (marca ? marcaCanonica(marca) === marcaAlvo : noRotulo.has(marcaAlvo)));
  if (mesmaMarca) sinais.push("mesma_marca");
  const marcaDesconhecida = !marca && !!modelo;
  if (esteCarro || ((mesmaMarca || marcaDesconhecida) && familiaAlvo !== "" && (modelo ? familiaDoModelo(modelo) === familiaAlvo : noRotulo.has(familiaAlvo)))) sinais.push("mesmo_modelo");
  if (esteCarro) sinais.push("este_carro");
  const preco = interesse.preco ?? carroDoInteresse?.preco ?? null;
  if (esteCarro || (preco !== null && preco > 0 && alvo.preco !== null && alvo.preco >= preco * PISO_DO_PRECO_PARECIDO && alvo.preco <= preco * TETO_DO_PRECO_PARECIDO)) sinais.push("preco_parecido");
  // Interesse sem data conhecida não é recente (a data desconhecida é 1970, e cai fora sozinha).
  if (agora.getTime() - new Date(interesse.criadoEm).getTime() <= DIAS_DO_INTERESSE_RECENTE * 24 * 60 * 60 * 1000) sinais.push("recente");
  return sinais;
}

export const percentualDeMatch = (sinais: readonly SinalDeAfinidade[]) => Math.round((sinais.length / SINAIS_DE_AFINIDADE.length) * 100);

/** "t cross highline 250 tsi aut" + "volkswagen" → "Volkswagen T Cross Highline 250 Tsi Aut". */
function nomeDoCarroOlhado(marca: string | null | undefined, modelo: string | null | undefined, rotulo: string | null | undefined): string | null {
  const texto = [marca, modelo].filter(Boolean).join(" ").trim() || (rotulo ?? "").trim();
  if (texto === "") return null;
  return texto.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, antes: string, letra: string) => antes + letra.toUpperCase()).slice(0, 60);
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
    /** Marcados "não tem interesse" na origem. */
    semInteresse: number;
    /** Receberam outra campanha há menos dias que o descanso pedido. */
    descanso: number;
    repetido: number;
  };
}

const normal = (s: string | null | undefined) => semAcento(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * A marca de "data desconhecida". Um contato ou registro que a origem não
 * datou leva esta data: fica fora de qualquer período, não ganha o sinal de
 * interesse recente, não vale como data de compra, e só entra quando o
 * período é "sempre". A alternativa (a hora da importação) faria de um
 * cadastro de 2019 um contato de hoje.
 */
export const DATA_DESCONHECIDA = "1970-01-01T00:00:00.000Z";
const temData = (quando: string | null | undefined): quando is string => !!quando && new Date(quando).getTime() > 0;

/** O id do contato da base dentro de `LeadDoPublico.id`. */
export const PREFIXO_DO_CONTATO = "c:";

/**
 * Quem entra no público da campanha.
 *
 * A PESSOA É O TELEFONE. Um mesmo celular pode ser dois leads do site e um
 * contato da base importada: aqui eles viram uma pessoa só, que recebe uma
 * vez, e o que se sabe de um vale para todos ("já comprou", "pediu para não
 * ser procurada").
 *
 * POR CARRO: casa quem tem um interesse que bate com o carro da campanha,
 * dentro do período. Marca e modelo são comparados pela marca canônica e pela
 * família do modelo (`lib/familiaDoModelo.ts`); o carro que já saiu do
 * estoque é lido dos campos da base ou do rótulo guardado.
 *
 * POR PERFIL: casa quem teve qualquer contato dentro do período.
 *
 * Fica de fora, nesta ordem:
 *   - lead descartado pela equipe, e quem está marcado "não tem interesse";
 *   - nas ofertas (por carro, e "interessados"): quem já comprou, aqui OU fora;
 *   - por carro: quem desistiu de todos os interesses que casam;
 *   - quem não tem celular; quem pediu para sair; quem está no descanso.
 *
 * Lead PERDIDO entra: perdeu-se aquela negociação, e a pessoa pode voltar.
 */
export function montarPublico(entrada: {
  /** `null` só em campanha por perfil sem carro. */
  alvo: CarroDoPublico | null;
  criterio: CriterioDePublico;
  janelaDias: JanelaDeInteresse;
  /** Só quem chegou por estes canais. Vazio ou ausente é todos. */
  canais?: string[];
  agora: Date;
  interesses: InteresseRegistrado[];
  leads: LeadDoPublico[];
  /** Todo carro que a loja conhece, à venda ou não: é de onde sai a marca do interesse. */
  carros: CarroDoPublico[];
  /** Telefones (dígitos com 55) que pediram para sair. */
  saiuDaLista: ReadonlySet<string>;
  /** Telefones que receberam campanha dentro do descanso pedido. */
  recebeuHaPouco?: ReadonlySet<string>;
  /** Só quem comprou há pelo menos tantos meses. `null` ou ausente não filtra. */
  compraHaMeses?: TempoDesdeACompra;
}): PublicoMontado {
  const { alvo, criterio, janelaDias, agora } = entrada;
  const porCarro = ehCriterioDeCarro(criterio);
  const carroPorId = new Map(entrada.carros.map((c) => [c.id, c]));
  const leadPorId = new Map(entrada.leads.map((l) => [l.id, l]));
  const desde = janelaDias === null ? null : agora.getTime() - janelaDias * 24 * 60 * 60 * 1000;
  // Sem data conhecida, só entra quando o período é "sempre".
  const naJanela = (quando: string | null | undefined) => (desde === null ? quando !== null && quando !== undefined : temData(quando) && new Date(quando).getTime() >= desde);
  const marcaAlvo = marcaCanonica(alvo?.marca);
  const familiaAlvo = familiaDoModelo(alvo?.modelo);
  const canais = new Set((entrada.canais ?? []).map((c) => normal(c)));

  const casaComOCarro = (i: Pick<InteresseRegistrado, "veiculoId" | "rotulo" | "marca" | "modelo" | "preco">): boolean => {
    if (!alvo) return false;
    if (criterio === "mesmo_veiculo") return i.veiculoId === alvo.id;
    const carro = i.veiculoId === null ? undefined : carroPorId.get(i.veiculoId);
    if (criterio === "faixa_de_preco") {
      const preco = i.preco ?? carro?.preco ?? null;
      if (preco === null || alvo.preco === null || preco <= 0) return i.veiculoId === alvo.id;
      return alvo.preco >= preco * PISO_DO_PRECO_PARECIDO && alvo.preco <= preco * TETO_DO_PRECO_PARECIDO;
    }
    // Do mais certo para o menos: o carro do estoque, os campos da base, o rótulo.
    const marca = carro?.marca ?? i.marca ?? null;
    const modelo = carro?.modelo ?? i.modelo ?? null;
    const noRotulo = familiasNoTexto(i.rotulo);
    const mesmaMarca = marca ? marcaCanonica(marca) === marcaAlvo : noRotulo.has(marcaAlvo);
    if (criterio === "mesma_marca") return mesmaMarca && marcaAlvo !== "";
    const mesmaFamilia = modelo ? familiaDoModelo(modelo) === familiaAlvo : noRotulo.has(familiaAlvo);
    // Planilha comum só com "Veículo: T-Cross Highline": não há marca, e o modelo decide sozinho.
    const marcaDesconhecida = !marca && !!modelo;
    return (mesmaMarca || marcaDesconhecida) && mesmaFamilia && familiaAlvo !== "";
  };

  interface Pessoa {
    telefone: string;
    /** O registro que representa a pessoa: o do contato mais recente que casa. */
    lead: LeadDoPublico | null;
    contato: LeadDoPublico | null;
    cliente: boolean;
    /** A compra mais recente que se conhece (ms), ou 0. */
    comprouEm: number;
    comprouFora: boolean;
    semInteresse: boolean;
    match: number | null;
    olhou: string | null;
    /** Pelo menos um registro da pessoa não foi descartado pela equipe. */
    temRegistroBom: boolean;
    canais: Set<string>;
    casa: boolean;
    /** Um registro descartado casaria com o critério. Só conta em "fora" se nenhum outro casar. */
    soDescartadoCasa: boolean;
    vivo: boolean;
    quando: number;
    registrosQueCasam: Set<string>;
  }
  const pessoas = new Map<string, Pessoa>();
  const telefoneDe = new Map<string, string | null>();
  /** Registros que casam e não têm celular: é o "sem celular" da prévia. */
  const semCelular = new Set<string>();

  for (const l of entrada.leads) {
    const telefone = telefoneParaSms(l.telefone);
    telefoneDe.set(l.id, telefone);
    if (!telefone) continue;
    let p = pessoas.get(telefone);
    if (!p) {
      p = { telefone, lead: null, contato: null, cliente: false, comprouEm: 0, match: null, olhou: null, comprouFora: false, semInteresse: false, temRegistroBom: false, canais: new Set(), casa: false, soDescartadoCasa: false, vivo: false, quando: 0, registrosQueCasam: new Set() };
      pessoas.set(telefone, p);
    }
    if (l.desfecho === "ganho" || l.cliente) p.cliente = true;
    if (temData(l.comprouEm)) p.comprouEm = Math.max(p.comprouEm, new Date(l.comprouEm).getTime());
    if (l.semInteresse) p.semInteresse = true;
    if (l.desfecho !== DESFECHO_DESCARTADO) p.temRegistroBom = true;
    for (const c of l.canais ?? []) p.canais.add(normal(c));
  }

  const anotar = (leadId: string, quando: string, vivo: boolean, interesse?: Pick<InteresseRegistrado, "veiculoId" | "rotulo" | "marca" | "modelo" | "preco" | "criadoEm">) => {
    const lead = leadPorId.get(leadId);
    if (!lead) return;
    const telefone = telefoneDe.get(leadId);
    if (!telefone) {
      semCelular.add(leadId);
      return;
    }
    const p = pessoas.get(telefone)!;
    // O interesse de um lead que a equipe descartou (spam, teste) não põe ninguém no
    // público, nem quando o mesmo telefone tem outro cadastro bom.
    if (lead.desfecho === DESFECHO_DESCARTADO) {
      p.soDescartadoCasa = true;
      return;
    }
    const t = new Date(quando).getTime();
    p.casa = true;
    p.vivo ||= vivo;
    p.registrosQueCasam.add(leadId);
    const ehBase = lead.origem === "base";
    // Representa a pessoa o registro mais recente de cada origem.
    if (ehBase ? !p.contato || t >= p.quando : !p.lead || t >= p.quando) {
      if (ehBase) p.contato = lead;
      else p.lead = lead;
    }
    p.quando = Math.max(p.quando, t);
    if (alvo && interesse) {
      const carro = interesse.veiculoId === null ? undefined : carroPorId.get(interesse.veiculoId);
      const match = percentualDeMatch(sinaisDeAfinidade(interesse, alvo, carro, agora));
      if (p.match === null || match > p.match) {
        p.match = match;
        p.olhou = nomeDoCarroOlhado(carro?.marca ?? interesse.marca, carro?.modelo ?? interesse.modelo, interesse.rotulo);
      }
    }
  };

  for (const i of entrada.interesses) {
    const telefone = telefoneDe.get(i.leadId);
    const p = telefone ? pessoas.get(telefone) : undefined;
    if (p && i.tipo === "compra") {
      p.cliente = true;
      if (temData(i.criadoEm)) p.comprouEm = Math.max(p.comprouEm, new Date(i.criadoEm).getTime());
    }
    if (p && i.motivoDescarte === DESCARTE_DE_QUEM_COMPROU) p.comprouFora = true;
    if (!naJanela(i.criadoEm)) continue;
    if (porCarro) {
      if (i.tipo !== "compra" && casaComOCarro(i)) anotar(i.leadId, i.criadoEm, !DESCARTES_QUE_TIRAM_DO_PUBLICO.includes(i.motivoDescarte ?? ""), i);
    } else {
      anotar(i.leadId, i.criadoEm, true);
    }
  }
  const comLinha = new Set(entrada.interesses.map((i) => `${i.leadId}|${i.veiculoId}`));
  for (const l of entrada.leads) {
    if (porCarro) {
      // O carro principal só conta quando não virou linha de interesse (lead antigo).
      if (l.veiculoId === null || comLinha.has(`${l.id}|${l.veiculoId}`) || !naJanela(l.criadoEm)) continue;
      const principal = { veiculoId: l.veiculoId, rotulo: null, preco: null, criadoEm: l.criadoEm };
      if (casaComOCarro(principal)) anotar(l.id, l.criadoEm, true, principal);
    } else {
      const quando = [l.ultimoContatoEm, l.criadoEm].find((q) => naJanela(q));
      if (quando) anotar(l.id, quando, true);
    }
  }

  const meses = entrada.compraHaMeses ?? null;
  const compraAntesDe = meses === null ? null : new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - meses, agora.getUTCDate())).getTime();
  const fora = { semCelular: semCelular.size, saiuDaLista: 0, jaComprou: 0, desistiu: 0, descartado: 0, semInteresse: 0, descanso: 0, repetido: 0 };
  for (const p of pessoas.values()) if (!p.casa && p.soDescartadoCasa) fora.descartado++;
  const destinatarios: Destinatario[] = [];
  // Por carro, quem mais se parece vem primeiro; no empate (e por perfil), o contato mais recente.
  const ordenadas = [...pessoas.values()].filter((p) => p.casa).sort((a, b) => (b.match ?? 0) - (a.match ?? 0) || b.quando - a.quando || a.telefone.localeCompare(b.telefone));
  for (const p of ordenadas) {
    // O filtro de canal e o de "clientes" definem o público; quem não passa não é "fora", só não é dele.
    if (canais.size > 0 && ![...p.canais].some((c) => canais.has(c))) continue;
    if (criterio === "clientes" && !p.cliente) continue;
    // "Hora de trocar": só quem comprou há tempo bastante, e com data conhecida.
    if (compraAntesDe !== null && (!p.cliente || p.comprouEm === 0 || p.comprouEm > compraAntesDe)) continue;
    if (!p.temRegistroBom) {
      fora.descartado++;
      continue;
    }
    if (p.semInteresse) {
      fora.semInteresse++;
      continue;
    }
    if ((porCarro || criterio === "interessados") && (p.cliente || p.comprouFora)) {
      fora.jaComprou++;
      continue;
    }
    if (porCarro && !p.vivo) {
      fora.desistiu++;
      continue;
    }
    if (entrada.saiuDaLista.has(p.telefone)) {
      fora.saiuDaLista++;
      continue;
    }
    if (entrada.recebeuHaPouco?.has(p.telefone)) {
      fora.descanso++;
      continue;
    }
    fora.repetido += p.registrosQueCasam.size - 1;
    const nome = p.lead?.nome ?? p.contato?.nome ?? null;
    destinatarios.push({
      leadId: p.lead?.id ?? null,
      contatoId: p.contato ? p.contato.id.slice(PREFIXO_DO_CONTATO.length) : null,
      nome,
      telefone: p.telefone,
      match: porCarro ? p.match : null,
      olhou: porCarro ? p.olhou : null,
      quando: p.quando > 0 ? new Date(p.quando).toISOString() : null,
    });
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
  /** `null` em campanha por perfil sem carro. */
  veiculoId: number | null;
  veiculoRotulo: string | null;
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
  /** O lead, para quem pode abrir a ficha dele. `null` quando a pessoa veio da base importada. */
  leadId: string | null;
}

export interface CampanhaDeSmsDetalhada extends CampanhaDeSmsNaLista {
  janelaDias: JanelaDeInteresse;
  canais: string[];
  descansoDias: number;
  compraHaMeses: number | null;
  /** O caminho para onde o link leva (a ficha, o estoque ou a avaliação). */
  destino: string;
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
/** Uma pessoa na amostra da prévia. SEM telefone inteiro e sem sobrenome. */
export interface PessoaNaPrevia {
  primeiroNome: string;
  telefoneMascarado: string;
  /** De 0 a 100; `null` em campanha por perfil. */
  match: number | null;
  olhou: string | null;
  quando: string | null;
}

/** Quantas pessoas cada critério de carro alcança, para o MESMO carro, período, canais e descanso. */
export interface CamadaDoPublico {
  criterio: CriterioDePublico;
  pessoas: number;
}

/** Quantos do público estão em cada faixa de match. */
export interface FaixaDeMatch {
  /** O percentual: 100, 80, 60, 40, 20. */
  match: number;
  pessoas: number;
}

/** Quantas pessoas a amostra da prévia mostra. */
export const PESSOAS_NA_AMOSTRA = 40;

export interface PreviaDaCampanha {
  veiculoRotulo: string | null;
  /** Só em campanha com carro: o alcance de cada critério, do mais estreito ao mais largo. */
  camadas: CamadaDoPublico[];
  /** Só por carro: a distribuição do público escolhido por percentual de match. */
  faixasDeMatch: FaixaDeMatch[];
  /** As primeiras pessoas do público (as de maior match, depois as mais recentes). */
  amostra: PessoaNaPrevia[];
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
