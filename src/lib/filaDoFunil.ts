/**
 * A tela da gestão do lead: as regras que não dependem de React.
 *
 * Desenho em `docs/design/gestao_do_lead/README.md`; contrato do servidor em
 * `docs/GESTAO_DO_LEAD.md`. Data, rótulo de passo, grupos da Lista do dia e a
 * validação do registro vêm de `lib/gestaoDoLead`; aqui fica o que é só da
 * tela: o escopo e a vista padrão por papel, as contagens dos filtros, o
 * estado que mora na URL e a dica ao lado do botão REGISTRAR.
 *
 * Tudo puro: todo "agora" entra por parâmetro, em milissegundos.
 */
import { espera, type EtapaDoFunil, type LeadDoFunil, type MotivoDoFunil, type NivelDeEstagnacao } from "./funil";
import {
  FUSO_DA_LOJA,
  ROTULO_DA_INTERACAO,
  TIPOS_DE_INTERACAO,
  decidirInteracao,
  diaNaLoja,
  instanteNoFusoDaLoja,
  leadEstaAberto,
  rotuloDoPasso,
  situacaoDoPasso,
  type CorpoDaInteracao,
  type ItemDoHistorico,
  type ResultadoDaLigacao,
  type SugestaoDePasso,
  type TipoDeInteracao,
  type UltimaInteracao,
} from "./gestaoDoLead";

// ---------------------------------------------------------------------------
// O lead como a fila o entrega
// ---------------------------------------------------------------------------

/** Um lead de `GET /api/leads/gerenciar`. */
export interface LeadDaFila extends LeadDoFunil {
  telefone: string | null;
  interesse: string | null;
  canal: string | null;
  responsavel: string | null;
  observacoes: string | null;
  /** `created_at`, não `criado_em`: a tabela é preexistente (migração 20260807210000). */
  created_at: string;
  ag_uid?: string | null;
  /** O retrato da /avaliacao e os valores da vistoria. Quem lê é `BlocoDaAvaliacao`. */
  avaliacao?: unknown;
  avaliacao_valor_ofertado?: number | string | null;
  avaliacao_valor_pago?: number | string | null;
  /** O perfil do Profiler. Só leitura; quem lê é `BlocoDoPerfil`. */
  perfil?: unknown;
  /** As etiquetas da conversa do Chatwoot, como o n8n as espelhou. */
  etiquetas?: string[];
  proximo_passo?: string | null;
  proximo_passo_vence_em?: string | null;
  proximo_passo_definido_em?: string | null;
  proximo_passo_definido_por?: string | null;
  ultima_interacao?: UltimaInteracao | null;
}

/** O que o aviso de estagnação diz, por nível. `null`: não há aviso. */
export const AVISO_DE_ESTAGNACAO: Record<NivelDeEstagnacao, string | null> = {
  ok: null,
  atencao: "esfriando",
  estagnado: "parado",
  transferir: "vai passar para outro vendedor",
};

/** Telefone só com dígitos → (41) 99999-9999. */
export function formatarTelefone(t: string | null | undefined): string {
  if (!t) return "";
  const d = t.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

/** "1 lead", "3 leads": o plural escrito, e não "lead(s)". */
export function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

// ---------------------------------------------------------------------------
// Escopo e vista
// ---------------------------------------------------------------------------

export type EscopoDaFila = "minha" | "equipe";
export type VistaDoFunil = "lista" | "quadro";
export type ChipDoFunil = "atrasados" | "hoje";

export interface PadroesDoFunil {
  /** Há "Minha fila | Equipe" para escolher? */
  temEscopo: boolean;
  escopo: EscopoDaFila;
  vista: VistaDoFunil;
}

/**
 * O que a tela abre, por papel (regra de visibilidade de 03/10/2026).
 *
 * O Comercial puro só recebe os leads dele (`escopo: "meus"` na resposta da
 * fila): para ele não há o que alternar, e a vista padrão é a Lista do dia.
 * Administrador, Gestor e SDR veem a equipe: abrem no Quadro, em "Equipe", e
 * "Minha fila" são os leads cujo responsável é o nome de quem está logado.
 * Sem nome no perfil não há como dizer quais são "meus": o controle some.
 */
export function padroesDoFunil(
  escopoDoServidor: string | null | undefined,
  meuNome: string | null | undefined,
): PadroesDoFunil {
  if (escopoDoServidor === "meus") return { temEscopo: false, escopo: "minha", vista: "lista" };
  return { temEscopo: Boolean(meuNome && meuNome.trim()), escopo: "equipe", vista: "quadro" };
}

/** O lead é de quem está logado? `responsavel` é texto: compara com o nome do perfil. */
export function naMinhaFila(lead: { responsavel?: string | null }, meuNome: string | null | undefined): boolean {
  const nome = (meuNome ?? "").trim();
  return nome !== "" && lead.responsavel === nome;
}

/**
 * Aplica o escopo. Buscando, o escopo é ignorado: quem procura um lead quer
 * achá-lo onde ele estiver (dentro do que o servidor já deixou ver).
 */
export function filtrarPorEscopo<T extends { responsavel?: string | null }>(
  leads: readonly T[],
  opcoes: { temEscopo: boolean; escopo: EscopoDaFila; meuNome: string | null | undefined; buscando: boolean },
): T[] {
  if (!opcoes.temEscopo || opcoes.buscando || opcoes.escopo === "equipe") return [...leads];
  return leads.filter((l) => naMinhaFila(l, opcoes.meuNome));
}

/** As contagens do segmentado "Minha fila (n) | Equipe (n)", sobre os leads abertos da tela. */
export function contarEscopos<T extends { responsavel?: string | null; desfecho?: string | null }>(
  leads: readonly T[],
  meuNome: string | null | undefined,
): Record<EscopoDaFila, number> {
  const abertos = leads.filter(leadEstaAberto);
  return { minha: abertos.filter((l) => naMinhaFila(l, meuNome)).length, equipe: abertos.length };
}

interface LeadComPasso {
  proximo_passo?: string | null;
  proximo_passo_vence_em?: string | null;
  desfecho?: string | null;
}

/** A situação do passo de um lead ABERTO que tem passo escrito; `null` no resto. */
function situacaoDoLead(lead: LeadComPasso, agora: number) {
  if (!leadEstaAberto(lead) || !(lead.proximo_passo ?? "").trim()) return null;
  return situacaoDoPasso(lead.proximo_passo_vence_em, agora);
}

/**
 * As contagens dos chips "Atrasados (n)" e "Hoje (n)". Quem chama passa os
 * leads JÁ filtrados por escopo e busca: o chip conta o que a tela mostraria,
 * nunca o total da loja.
 */
export function contarChips(leads: readonly LeadComPasso[], agora: number): Record<ChipDoFunil, number> {
  const conta = { atrasados: 0, hoje: 0 };
  for (const l of leads) {
    const s = situacaoDoLead(l, agora);
    if (s === "atrasado") conta.atrasados += 1;
    else if (s === "hoje") conta.hoje += 1;
  }
  return conta;
}

export function filtrarPorChip<T extends LeadComPasso>(leads: readonly T[], chip: ChipDoFunil | null, agora: number): T[] {
  if (!chip) return [...leads];
  const alvo = chip === "atrasados" ? "atrasado" : "hoje";
  return leads.filter((l) => situacaoDoLead(l, agora) === alvo);
}

/** A linha embaixo da busca. "Na equipe inteira" só para quem vê a equipe. */
export function linhaDaBusca(total: number, veAEquipe: boolean): string {
  const achados = total === 0 ? "Nenhum encontrado" : plural(total, "encontrado", "encontrados");
  return veAEquipe ? `${achados} na equipe inteira` : achados;
}

/** A caixa tracejada da tela sem nada para mostrar. */
export function textoDoVazio(temEscopo: boolean): string {
  return temEscopo ? "Nada por aqui. Limpe a busca ou troque para Equipe." : "Nada por aqui. Limpe a busca.";
}

/** "3 leads sem próximo passo": a linha discreta embaixo da Lista do dia. */
export function linhaDosSemPasso(n: number): string {
  return `${plural(n, "lead", "leads")} sem próximo passo`;
}

// ---------------------------------------------------------------------------
// Os rótulos do card e do detalhe
// ---------------------------------------------------------------------------

/** "WHATSAPP · HÁ 6 D". O tipo por extenso vem de `ROTULO_DA_INTERACAO`. */
export function rotuloDaUltimaInteracao(ultima: Pick<UltimaInteracao, "tipo" | "quando">, agora: number): string {
  const tipo = (TIPOS_DE_INTERACAO as readonly string[]).includes(ultima.tipo)
    ? ROTULO_DA_INTERACAO[ultima.tipo as TipoDeInteracao]
    : ultima.tipo;
  const ha = espera(ultima.quando, agora);
  return `${tipo} · ${ha === "agora" ? "agora" : `há ${ha}`}`.toUpperCase();
}

/** "13ª transf.", a partir da segunda (a régua de `seloDeRodizio`). */
export function seloCurtoDeTransferencias(transferencias: number | null | undefined): string | null {
  const n = transferencias ?? 0;
  return n >= 2 ? `${n}ª transf.` : null;
}

const DATA_E_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_DA_LOJA,
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "03/10/26 14:32", no relógio da loja. `""` quando a data não se lê. */
export function dataDoHistorico(iso: string | null | undefined): string {
  const ms = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(ms) ? DATA_E_HORA.format(new Date(ms)).replace(",", "") : "";
}

// ---------------------------------------------------------------------------
// O estado que mora na URL: ?vista= ?escopo= ?lead=
// ---------------------------------------------------------------------------

export interface EstadoNaUrl {
  /** `null`: o padrão do papel. */
  vista: VistaDoFunil | null;
  escopo: EscopoDaFila | null;
  /** O lead aberto na gaveta. */
  lead: string | null;
}

const ID_DE_LEAD = /^[\w-]{1,64}$/;

/** Lê o estado de uma query (`vista=lista&lead=...`). Valor fora da lista é ignorado. */
export function lerEstadoDaUrl(query: string): EstadoNaUrl {
  const p = new URLSearchParams(query);
  const vista = p.get("vista");
  const escopo = p.get("escopo");
  const lead = p.get("lead");
  return {
    vista: vista === "lista" || vista === "quadro" ? vista : null,
    escopo: escopo === "minha" || escopo === "equipe" ? escopo : null,
    lead: lead && ID_DE_LEAD.test(lead) ? lead : null,
  };
}

/** O estado como query, sempre na mesma ordem. `""` quando tudo é padrão. */
export function queryDoEstado(estado: EstadoNaUrl): string {
  const p = new URLSearchParams();
  if (estado.vista) p.set("vista", estado.vista);
  if (estado.escopo) p.set("escopo", estado.escopo);
  if (estado.lead) p.set("lead", estado.lead);
  return p.toString();
}

export function urlDoFunil(estado: EstadoNaUrl, base = "/admin/leads"): string {
  const query = queryDoEstado(estado);
  return query ? `${base}?${query}` : base;
}

/** O endereço da página de um lead (o destino dos links e da tela estreita). */
export function urlDoLead(id: string): string {
  return `/admin/leads/${encodeURIComponent(id)}`;
}

/**
 * A tela e a URL, em sincronia.
 *
 * A tela reage no clique e pede à URL que a acompanhe (`router.replace`, que
 * chega depois). A URL também muda sozinha: o link de um alerta, o voltar do
 * navegador. `pedidas` guarda o que a tela pediu e ainda não viu chegar, para
 * distinguir os dois casos: a URL que chega e foi pedida é só o eco de um
 * clique (talvez já superado por outro), e não desfaz a tela; a que chega sem
 * ter sido pedida é navegação, e a tela a adota.
 */
export interface SincroniaComAUrl {
  estado: EstadoNaUrl;
  /** A última query lida da URL. */
  ultimaQuery: string;
  pedidas: string[];
}

export function iniciarSincronia(query: string): SincroniaComAUrl {
  return { estado: lerEstadoDaUrl(query), ultimaQuery: query, pedidas: [] };
}

/** A URL mudou: eco de um pedido da tela, ou navegação de fora. */
export function aoMudarAUrl(s: SincroniaComAUrl, query: string): SincroniaComAUrl {
  const canonica = queryDoEstado(lerEstadoDaUrl(query));
  const posicao = s.pedidas.indexOf(canonica);
  if (posicao >= 0) return { ...s, ultimaQuery: query, pedidas: s.pedidas.slice(posicao + 1) };
  if (canonica === queryDoEstado(s.estado)) return { ...s, ultimaQuery: query, pedidas: [] };
  return { estado: lerEstadoDaUrl(query), ultimaQuery: query, pedidas: [] };
}

/** A tela mudou: o estado novo, e a query a pedir à URL (anotada em `pedidas`). */
export function aoMudarOEstado(s: SincroniaComAUrl, parcial: Partial<EstadoNaUrl>): SincroniaComAUrl {
  const estado = { ...s.estado, ...parcial };
  const query = queryDoEstado(estado);
  if (query === queryDoEstado(s.estado)) return s;
  return { ...s, estado, pedidas: [...s.pedidas, query] };
}

// ---------------------------------------------------------------------------
// O registro de interação: o formulário, o corpo e a dica do botão
// ---------------------------------------------------------------------------

export interface FormDoRegistro {
  tipo: TipoDeInteracao;
  /** Só em ligação. */
  resultado: ResultadoDaLigacao | null;
  texto: string;
  passo: string;
  /** `AAAA-MM-DD`, no calendário da loja; `""` enquanto não escolhido. */
  dia: string;
  /** `HH:MM`, no relógio da loja. */
  hora: string;
}

export const FORM_DO_REGISTRO_VAZIO: FormDoRegistro = {
  tipo: "nota",
  resultado: null,
  texto: "",
  passo: "",
  dia: "",
  hora: "",
};

/** A hora que o campo assume quando se escolhe o dia antes dela. */
export const HORA_PADRAO_DO_PASSO = "10:00";

export const PLACEHOLDER_DO_REGISTRO: Record<TipoDeInteracao, string> = {
  nota: "O que foi combinado…",
  ligacao: "Opcional: o que ficou combinado?",
  whatsapp: "Resumo da conversa no WhatsApp…",
  visita: "Veio à loja? Viu qual carro? Fez test drive?",
};

const HORA_NA_LOJA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_DA_LOJA,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * Um instante (o `vence_em` de uma sugestão) → o dia e a hora que os campos do
 * formulário mostram, no relógio da loja. O caminho de volta é
 * `instanteNoFusoDaLoja`.
 */
export function diaEHoraNaLoja(iso: string): { dia: string; hora: string } | null {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return { dia: diaNaLoja(ms, 0), hora: HORA_NA_LOJA.format(new Date(ms)) };
}

/** O tipo mudou: o resultado só existe em ligação. */
export function comTipo(form: FormDoRegistro, tipo: TipoDeInteracao): FormDoRegistro {
  return { ...form, tipo, resultado: tipo === "ligacao" ? form.resultado : null };
}

/** O dia mudou: sem hora escolhida, vale a hora padrão. */
export function comDia(form: FormDoRegistro, dia: string): FormDoRegistro {
  return { ...form, dia, hora: form.hora || HORA_PADRAO_DO_PASSO };
}

/** Tocar numa sugestão preenche o passo, o dia e a hora de uma vez. */
export function comSugestao(form: FormDoRegistro, sugestao: { texto: string; vence_em: string }): FormDoRegistro {
  const quando = diaEHoraNaLoja(sugestao.vence_em);
  return { ...form, passo: sugestao.texto, dia: quando?.dia ?? "", hora: quando?.hora ?? "" };
}

/** CONCLUIR: o registro abre com "Feito: {passo}. " e o próximo passo vazio. */
export function formAoConcluir(passo: string): FormDoRegistro {
  return { ...FORM_DO_REGISTRO_VAZIO, texto: `Feito: ${passo.trim()}. ` };
}

/** Remarcar: "Remarcado: " e o mesmo passo, para trocar só a data. */
export function formAoRemarcar(passo: string): FormDoRegistro {
  return { ...FORM_DO_REGISTRO_VAZIO, texto: "Remarcado: ", passo: passo.trim() };
}

/** O corpo do POST de interação, como `decidirInteracao` e a rota o leem. */
export function corpoDoRegistro(form: FormDoRegistro): CorpoDaInteracao {
  const venceEm = form.dia && form.hora ? instanteNoFusoDaLoja(form.dia, form.hora) : null;
  return {
    tipo: form.tipo,
    ...(form.tipo === "ligacao" && form.resultado ? { resultado: form.resultado } : {}),
    texto: form.texto.trim(),
    proximo_passo: form.passo.trim(),
    ...(venceEm ? { proximo_passo_vence_em: venceEm } : {}),
  };
}

export interface EstadoDoRegistro {
  /** O botão REGISTRAR está habilitado. */
  pode: boolean;
  /** A frase ao lado do botão. */
  dica: string;
  corpo: CorpoDaInteracao;
}

/**
 * O botão REGISTRAR e a dica ao lado dele.
 *
 * Quem decide é `decidirInteracao`, a mesma função da rota: o botão só
 * habilita para o que o servidor aceita. A dica sai do código da recusa.
 */
export function estadoDoRegistro(form: FormDoRegistro, lead: { aberto: boolean }, agora: number): EstadoDoRegistro {
  const corpo = corpoDoRegistro(form);
  const decisao = decidirInteracao(corpo, lead);

  if (decisao.ok) {
    const { p_passo: passo, p_vence_em: vence } = decisao.args;
    const dica = passo
      ? `O card passa a mostrar “${passo}” · ${rotuloDoPasso(vence, agora, "lista") ?? ""}.`
      : "Pronto para registrar.";
    return { pode: true, dica, corpo };
  }

  let dica: string;
  switch (decisao.codigo) {
    case "interacao_vazia":
      dica = form.tipo === "ligacao" ? "Marque se atendeu." : "Escreva o que aconteceu.";
      break;
    case "proximo_passo_obrigatorio":
    case "proximo_passo_incompleto":
      dica = form.passo.trim()
        ? "Falta o dia e a hora do próximo passo."
        : lead.aberto
          ? "Falta o próximo passo: toque numa sugestão ou escreva."
          : "Falta escrever o próximo passo, ou tire a data.";
      break;
    case "data_invalida":
      dica = "Confira o dia e a hora do próximo passo.";
      break;
    default:
      dica = decisao.erro;
  }
  return { pode: false, dica, corpo };
}

// ---------------------------------------------------------------------------
// O detalhe, como `GET /api/leads/[id]` o entrega (docs/GESTAO_DO_LEAD.md §2.1)
// ---------------------------------------------------------------------------

/** O lead do detalhe: a linha inteira de `leads` mais os anexos da rota. */
export interface LeadDoDetalhe extends LeadDaFila {
  email?: string | null;
  carro_na_troca?: string | null;
  faixa_entrada?: string | null;
  pagamento_pretendido?: string | null;
  veiculo_id?: number | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  /** 8 caracteres em caixa alta, ou `null`. */
  ref?: string | null;
}

export interface VeiculoDoLead {
  id: number;
  nome: string;
  km: number | null;
  preco: number | null;
  vendido: boolean;
}

/** O resumo que as rotas de registro devolvem para o card (§2.2). */
export interface ResumoDoLead {
  id: string;
  situacao: string;
  responsavel: string | null;
  desfecho: string | null;
  proximo_passo: string | null;
  proximo_passo_vence_em: string | null;
  proximo_passo_definido_em: string | null;
  proximo_passo_definido_por: string | null;
  ultimo_contato_em: string | null;
  ultimo_movimento_em: string | null;
  ultima_interacao: UltimaInteracao | null;
}

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** "Estoque · 45.000 km · R$ 62.900": a linha embaixo do nome do carro de interesse. */
export function linhaDoVeiculo(v: Pick<VeiculoDoLead, "km" | "preco" | "vendido">): string {
  const partes = [v.vendido ? "Vendido" : "Estoque"];
  if (typeof v.km === "number") partes.push(`${v.km.toLocaleString("pt-BR")} km`);
  if (typeof v.preco === "number") partes.push(reais.format(v.preco).replace(/\s/g, " "));
  return partes.join(" · ");
}

/** "Meta Ads · seminovos-outubro": a origem e a campanha, só o que existe. */
export function origemDoLead(lead: Pick<LeadDoDetalhe, "canal" | "utm_source" | "utm_campaign">): string {
  const partes = [lead.canal, lead.utm_source, lead.utm_campaign].map((p) => (p ?? "").trim()).filter(Boolean);
  return [...new Set(partes)].join(" · ");
}

/** O que `GET /api/leads/[id]` devolve, no que a tela lê. */
export interface DetalheDaApi {
  lead: LeadDoDetalhe;
  veiculo: VeiculoDoLead | null;
  historico: ItemDoHistorico[];
  sugestoes: SugestaoDePasso[];
  vizinhos: { anterior: string | null; proximo: string | null };
  etapas: EtapaDoFunil[];
  motivos: MotivoDoFunil[];
  atendentes: { nome: string }[];
  escopo: string;
  podeRemoverResponsavel: boolean;
  etiquetasEditaveis: boolean;
  avisos: string[];
}

/**
 * O que "Chegou na loja" diz depois de gravar. A rota responde
 * `responsavel_avisado: false`: o aviso ao responsável ainda não existe, e a
 * frase não o promete.
 */
export function mensagemDeQuemChegou(resposta: { movido?: boolean }, rotuloDaEtapa: string): string {
  return resposta.movido
    ? `Chegada registrada. O lead foi para ${rotuloDaEtapa}, com o próximo passo "Atender na loja".`
    : 'Chegada registrada, com o próximo passo "Atender na loja". O lead já estava nessa etapa ou adiante e continua onde está.';
}

export const AVISO_DE_LEAD_FECHADO =
  "Este lead já foi fechado. Para registrar a chegada, reabra o lead numa etapa e toque de novo em Chegou na loja.";
