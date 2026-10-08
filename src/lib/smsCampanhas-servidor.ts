/**
 * Campanhas de SMS — a porta, o banco e o envio. Só servidor.
 *
 * Quem entra: Administrador e Marketing (matriz: "Criar e enviar campanhas de
 * SMS"). O Marketing não lê contato de lead, e por isso NADA aqui usa o
 * cliente de sessão para ler pessoa: público, envios e descadastros são lidos
 * e gravados com a chave de serviço, depois de a porta conferir a matriz, e o
 * que sai para a tela é contagem, primeiro nome e telefone mascarado.
 *
 * O caminho do dinheiro, em ordem:
 *   1. `previaDaCampanha` — monta o público e diz quanto custa. Não grava.
 *   2. `criarCampanha` — congela o público em `sms_envios` (um por telefone,
 *      com o texto final e o código do link). A campanha nasce `rascunho`.
 *   3. `enviarLote` — reserva um lote no banco (`sms_reservar_envios`, que não
 *      entrega a mesma linha a duas chamadas) e manda. A tela chama de novo
 *      até a fila acabar. Nada é reenviado sozinho: o que pode ter saído e não
 *      teve resposta vira `falhou` com o motivo escrito.
 *   4. `registrarRetorno` — o fornecedor avisa operadora, resposta e saída.
 *   5. `registrarClique` — o link curto `/s/<código>`.
 */
import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarSms, TIPO_DE_SMS_PADRAO, type BuscarNoSms, type DitoDoFornecedor } from "./apiBrasilSms";
import { ehTabelaAusente } from "./consultaDePlaca-servidor";
import { nomeComAno } from "./nomeDoVeiculo";
import { ehStaff, perfisDe, podeFazer } from "./permissoes";
import { disponiveisDe, precoVigente } from "./regrasEstoque";
import { SITE_HOST, urlDoSite } from "./site";
import {
  ACAO_CAMPANHAS_DE_SMS,
  ALFABETO_DO_CODIGO,
  PREFIXO_DO_CONTATO,
  CODIGO_DE_EXEMPLO,
  DATA_DESCONHECIDA,
  CRITERIOS_DE_CARRO,
  DESTINOS_SEM_CARRO,
  PESSOAS_NA_AMOSTRA,
  PARTES_MAXIMAS,
  TAMANHO_DO_CODIGO,
  caminhoDoLinkCurto,
  destinoDoClique,
  ehPedidoDeSaida,
  mascararTelefoneDoSms,
  montarMensagem,
  montarPublico,
  precoNoSms,
  primeiroNome,
  resumoDaCampanha,
  semNumeroLongo,
  tamanhoDoSms,
  telefoneParaSms,
  utmDaCampanhaDeSms,
  type AvisoDoFornecedor,
  type CampanhaDeSmsDetalhada,
  type CampanhaDeSmsNaLista,
  type CarroDaCampanha,
  type CarroDoPublico,
  type CriterioDePublico,
  type Destinatario,
  type DestinoSemCarro,
  type EnvioNaTela,
  type EnvioParaResumo,
  type InteresseRegistrado,
  type JanelaDeInteresse,
  type LeadDoPublico,
  type PedidoDeCampanha,
  type PreviaDaCampanha,
  type RespostaDoLote,
  type SituacaoDaCampanha,
  type SituacaoDoEnvio,
} from "./smsCampanhas";
import { getEstoque, getVeiculoPdpUrl } from "./supabase";
import { createAdminSupabaseClient, createServerSupabaseClient } from "./supabase-server";
import type { Veiculo } from "../types";

export const MIGRACAO_DAS_CAMPANHAS_DE_SMS = "20261007120000_sms_campanhas";

/** Quantos SMS uma chamada da rota manda. Com a espera de cada um, cabe na função. */
export const TAMANHO_DO_LOTE = 20;
/** Quantos SMS vão ao fornecedor ao mesmo tempo. */
const ENVIOS_SIMULTANEOS = 5;
/** Depois disto o lote não começa SMS novo: o que sobrou volta para a fila. */
const PRAZO_DO_LOTE_MS = 40000;
/** O banco devolve no máximo mil linhas por leitura; lê-se em páginas. */
const PAGINA = 1000;

// ─────────────────────────────────────────────────────────────────────────────
// A porta e a configuração
// ─────────────────────────────────────────────────────────────────────────────

export type PortaDasCampanhasDeSms =
  | { ok: true; supabase: SupabaseClient; admin: SupabaseClient; usuarioId: string; nome: string | null }
  | { ok: false; status: 401 | 403 | 503; motivo: string };

export async function autorizarCampanhasDeSms(): Promise<PortaDasCampanhasDeSms> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, motivo: "Não autenticado." };

  const { data: profile } = await supabase.from("profiles").select("role, papeis, is_active, full_name").eq("id", user.id).single();
  if (!ehStaff(profile) || profile?.is_active !== true || podeFazer(perfisDe(profile), ACAO_CAMPANHAS_DE_SMS) !== "faz") {
    return { ok: false, status: 403, motivo: "Campanha de SMS é do Administrador e do Marketing." };
  }
  let admin: SupabaseClient;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    return { ok: false, status: 503, motivo: "Falta SUPABASE_SERVICE_ROLE_KEY no servidor: sem ela a campanha não lê o público." };
  }
  return { ok: true, supabase, admin, usuarioId: user.id, nome: typeof profile?.full_name === "string" ? profile.full_name : null };
}

export interface ConfiguracaoDoSms {
  temToken: boolean;
  homologacao: boolean;
  precoPorParte: number | null;
  temRetorno: boolean;
}

/** O que a tela pode saber da configuração: nenhum segredo. */
export function configuracaoDoSms(env: NodeJS.ProcessEnv = process.env): ConfiguracaoDoSms {
  const preco = Number((env.SMS_PRECO_POR_PARTE ?? "").replace(",", "."));
  return {
    temToken: !!env.APIBRASIL_TOKEN?.trim(),
    homologacao: env.APIBRASIL_HOMOLOGACAO?.trim() === "1",
    precoPorParte: Number.isFinite(preco) && preco > 0 ? preco : null,
    temRetorno: !!env.SMS_WEBHOOK_TOKEN?.trim(),
  };
}

/** Os segredos, para quem envia. Nunca vira resposta de rota. */
export function segredosDoSms(env: NodeJS.ProcessEnv = process.env) {
  const retorno = env.SMS_WEBHOOK_TOKEN?.trim() || null;
  return {
    token: env.APIBRASIL_TOKEN?.trim() || null,
    tipo: env.APIBRASIL_SMS_TIPO?.trim() || TIPO_DE_SMS_PADRAO,
    homologacao: env.APIBRASIL_HOMOLOGACAO?.trim() === "1",
    tokenDoRetorno: retorno,
    /** Para onde o fornecedor avisa. O token vai na URL porque é o único lugar que ele aceita. */
    urlDoRetorno: retorno ? `${urlDoSite("/api/marketing/sms/retorno")}?token=${encodeURIComponent(retorno)}` : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Leituras de base
// ─────────────────────────────────────────────────────────────────────────────

/** Lê uma tabela inteira, em páginas. `montar` recebe o intervalo e devolve a consulta. */
async function lerTudo<T>(montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await montar(de, de + PAGINA - 1);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    const pagina = (data ?? []) as T[];
    linhas.push(...pagina);
    if (pagina.length < PAGINA) return linhas;
  }
}

const carroDoPublico = (v: Veiculo): CarroDoPublico => ({ id: Number(v.id), marca: v.marca, modelo: v.modelo, preco: precoVigente(v) || null });

/** Os carros à venda E publicados: a mensagem leva à ficha, e ela precisa existir. */
export async function lerCarrosParaCampanha(admin: SupabaseClient): Promise<CarroDaCampanha[]> {
  const estoque = disponiveisDe(await getEstoque({ cliente: admin }));
  return estoque
    .map((v) => ({ id: Number(v.id), rotulo: nomeComAno(v), preco: precoVigente(v) || null }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

interface BaseDoPublico {
  /** `null` em campanha por perfil sem carro. */
  alvo: Veiculo | null;
  carros: CarroDoPublico[];
  leads: LeadDoPublico[];
  interesses: InteresseRegistrado[];
  saiuDaLista: Set<string>;
  recebeuHaPouco: Set<string>;
}

/**
 * Tudo de que o público precisa, das DUAS fontes: os leads do site (com
 * `leads_veiculos`) e a base importada (`marketing_contatos` e
 * `marketing_interesses`). O contato da base entra em `leads` com o id
 * prefixado, e `montarPublico` junta as duas origens pelo telefone.
 */
async function lerBaseDoPublico(admin: SupabaseClient, pedido: Pick<PedidoDeCampanha, "veiculoId" | "descansoDias">, agora: Date): Promise<BaseDoPublico | { erro: string }> {
  const [avenda, todos] = await Promise.all([
    getEstoque({ cliente: admin }),
    // Vendidos e fora do feed também: é deles que sai a marca de um interesse antigo.
    getEstoque({ cliente: admin, incluirForaDoFeed: true, incluirNaoPublicaveis: true }),
  ]);
  const alvo = pedido.veiculoId === null ? null : (disponiveisDe(avenda).find((v) => Number(v.id) === pedido.veiculoId) ?? null);
  if (pedido.veiculoId !== null && !alvo) return { erro: "Este carro não está à venda no site. Escolha um carro publicado." };

  const desde = new Date(agora.getTime() - pedido.descansoDias * 24 * 60 * 60 * 1000).toISOString();
  const [leads, interesses, descadastros, contatos, registros, recentes, naFila, campanhas] = await Promise.all([
    lerTudo<{ id: string; nome: string | null; telefone: string | null; veiculo_id: number | null; desfecho: string | null; desfecho_em: string | null; canal: string | null; created_at: string }>((de, ate) =>
      admin.from("leads").select("id, nome, telefone, veiculo_id, desfecho, desfecho_em, canal, created_at").order("created_at", { ascending: false }).order("id").range(de, ate),
    ),
    lerTudo<{ lead_id: string; veiculo_id: number; veiculo_rotulo: string | null; veiculo_preco: number | string | null; motivo_descarte: string | null; criado_em: string }>((de, ate) =>
      admin.from("leads_veiculos").select("lead_id, veiculo_id, veiculo_rotulo, veiculo_preco, motivo_descarte, criado_em").order("criado_em", { ascending: false }).order("id").range(de, ate),
    ),
    lerTudo<{ telefone: string }>((de, ate) => admin.from("sms_descadastros").select("telefone").order("telefone").range(de, ate)),
    lerTudo<{ id: string; nome: string | null; telefone: string; cliente: boolean; comprou_em: string | null; sem_interesse: boolean; canais: string[] | null; primeiro_contato_em: string | null; ultimo_contato_em: string | null; criado_em: string }>((de, ate) =>
      admin.from("marketing_contatos").select("id, nome, telefone, cliente, comprou_em, sem_interesse, canais, primeiro_contato_em, ultimo_contato_em, criado_em").order("id").range(de, ate),
    ),
    lerTudo<{ contato_id: string; tipo: "interesse" | "compra"; veiculo_id: number | null; marca: string | null; modelo: string | null; ocorreu_em: string }>((de, ate) =>
      admin.from("marketing_interesses").select("contato_id, tipo, veiculo_id, marca, modelo, ocorreu_em").order("id").range(de, ate),
    ),
    // Descanso zero é "desligado": nem se lê. Com ele ligado, contam o que SAIU dentro do
    // intervalo e o que está na fila de outra campanha ainda por sair.
    pedido.descansoDias > 0
      ? lerTudo<{ telefone: string; campanha_id: string; situacao: string }>((de, ate) =>
          admin.from("sms_envios").select("telefone, campanha_id, situacao").eq("situacao", "enviado").gte("enviado_em", desde).order("id").range(de, ate),
        )
      : Promise.resolve([] as Array<{ telefone: string; campanha_id: string; situacao: string }>),
    pedido.descansoDias > 0
      ? lerTudo<{ telefone: string; campanha_id: string; situacao: string }>((de, ate) =>
          admin.from("sms_envios").select("telefone, campanha_id, situacao").in("situacao", ["na_fila", "enviando"]).order("id").range(de, ate),
        )
      : Promise.resolve([] as Array<{ telefone: string; campanha_id: string; situacao: string }>),
    lerTudo<{ id: string; homologacao: boolean; situacao: string }>((de, ate) => admin.from("sms_campanhas").select("id, homologacao, situacao").order("id").range(de, ate)),
  ]);
  // Campanha de teste não põe ninguém em descanso (e, no ambiente de teste, só as de teste contam);
  // fila de campanha interrompida não vai sair, e também não conta.
  const { homologacao } = segredosDoSms();
  const campanhaPorId = new Map(campanhas.map((c) => [c.id, c]));
  const contaNoDescanso = (e: { campanha_id: string; situacao: string }) => {
    const c = campanhaPorId.get(e.campanha_id);
    if (!c || c.homologacao !== homologacao) return false;
    return e.situacao === "enviado" || c.situacao === "rascunho" || c.situacao === "enviando";
  };

  return {
    alvo,
    carros: todos.map(carroDoPublico),
    leads: [
      ...leads.map((l): LeadDoPublico => ({
        id: l.id,
        origem: "lead",
        nome: l.nome,
        telefone: l.telefone,
        veiculoId: l.veiculo_id === null ? null : Number(l.veiculo_id),
        desfecho: l.desfecho,
        // No site, a data da compra é a do ganho.
        comprouEm: l.desfecho === "ganho" ? l.desfecho_em : null,
        canais: l.canal ? [l.canal] : [],
        criadoEm: l.created_at,
      })),
      ...contatos.map((c): LeadDoPublico => ({
        id: `${PREFIXO_DO_CONTATO}${c.id}`,
        origem: "base",
        nome: c.nome,
        telefone: c.telefone,
        veiculoId: null,
        desfecho: null,
        cliente: c.cliente,
        comprouEm: c.comprou_em,
        semInteresse: c.sem_interesse,
        canais: c.canais ?? [],
        // A data de quando a PESSOA apareceu, e nunca a da importação: um cadastro de
        // 2019 importado hoje não é contato de hoje. Sem data nenhuma, só entra em "sempre".
        criadoEm: c.primeiro_contato_em ?? c.comprou_em ?? DATA_DESCONHECIDA,
        ultimoContatoEm: c.ultimo_contato_em,
      })),
    ],
    interesses: [
      ...interesses.map((i): InteresseRegistrado => ({
        leadId: i.lead_id,
        veiculoId: Number(i.veiculo_id),
        rotulo: i.veiculo_rotulo,
        preco: i.veiculo_preco === null ? null : Number(i.veiculo_preco),
        motivoDescarte: i.motivo_descarte,
        criadoEm: i.criado_em,
      })),
      ...registros.map((r): InteresseRegistrado => ({
        leadId: `${PREFIXO_DO_CONTATO}${r.contato_id}`,
        veiculoId: r.veiculo_id === null ? null : Number(r.veiculo_id),
        rotulo: null,
        marca: r.marca,
        modelo: r.modelo,
        preco: null,
        motivoDescarte: null,
        tipo: r.tipo,
        criadoEm: r.ocorreu_em,
      })),
    ],
    saiuDaLista: new Set(descadastros.map((d) => d.telefone)),
    recebeuHaPouco: new Set([...recentes, ...naFila].filter(contaNoDescanso).map((r) => r.telefone)),
  };
}

/** O texto que UM destinatário recebe. `codigo` é o do link dele. Sem carro, as variáveis de carro nem existem no molde. */
function textoPara(pedido: Pick<PedidoDeCampanha, "mensagem">, alvo: Veiculo | null, nome: string | null, codigo: string): string {
  return montarMensagem(pedido.mensagem, {
    nome,
    carro: alvo ? nomeComAno(alvo) : "",
    preco: alvo ? precoNoSms(precoVigente(alvo) || null) : "",
    // Sem "https://": são oito caracteres, e o aparelho reconhece o endereço mesmo assim.
    link: `${SITE_HOST}${caminhoDoLinkCurto(codigo)}`,
  });
}


function novoCodigo(): string {
  let codigo = "";
  for (let i = 0; i < TAMANHO_DO_CODIGO; i++) codigo += ALFABETO_DO_CODIGO[randomInt(ALFABETO_DO_CODIGO.length)];
  return codigo;
}

// ─────────────────────────────────────────────────────────────────────────────
// A prévia e a criação
// ─────────────────────────────────────────────────────────────────────────────

type Montagem =
  | { ok: true; alvo: Veiculo | null; destinatarios: Destinatario[]; partesNoTotal: number; previa: PreviaDaCampanha }
  | { ok: false; status: 400 | 502 | 503; motivo: string };

async function montarCampanha(admin: SupabaseClient, pedido: PedidoDeCampanha, agora: Date): Promise<Montagem> {
  let base: BaseDoPublico | { erro: string };
  try {
    base = await lerBaseDoPublico(admin, pedido, agora);
  } catch (erro) {
    const e = erro as { code?: string; message: string };
    return ehTabelaAusente(e)
      ? { ok: false, status: 503, motivo: `As tabelas das campanhas ainda não existem no banco (migração ${MIGRACAO_DAS_CAMPANHAS_DE_SMS}).` }
      : { ok: false, status: 502, motivo: "Não deu para ler o público no banco." };
  }
  if ("erro" in base) return { ok: false, status: 400, motivo: base.erro };

  const comum = {
    alvo: base.alvo ? carroDoPublico(base.alvo) : null,
    janelaDias: pedido.janelaDias,
    canais: pedido.canais,
    recebeuHaPouco: base.recebeuHaPouco,
    compraHaMeses: pedido.compraHaMeses,
    agora,
    interesses: base.interesses,
    leads: base.leads,
    carros: base.carros,
    saiuDaLista: base.saiuDaLista,
  };
  const publico = montarPublico({ ...comum, criterio: pedido.criterio });
  // Com carro, a prévia mostra o alcance de CADA critério de carro, com o mesmo
  // período, canais e descanso: é como se escolhe entre "este carro" e "parecido".
  const camadas = base.alvo
    ? CRITERIOS_DE_CARRO.map((criterio) => ({
        criterio,
        pessoas: criterio === pedido.criterio ? publico.destinatarios.length : montarPublico({ ...comum, criterio, compraHaMeses: null }).destinatarios.length,
      }))
    : [];
  const porMatch = new Map<number, number>();
  for (const d of publico.destinatarios) if (d.match !== null) porMatch.set(d.match, (porMatch.get(d.match) ?? 0) + 1);
  const faixasDeMatch = [...porMatch].sort((x, y) => y[0] - x[0]).map(([match, pessoas]) => ({ match, pessoas }));
  // A amostra é o começo da fila de envio. Daqui só saem primeiro nome e telefone mascarado.
  const amostra = publico.destinatarios.slice(0, PESSOAS_NA_AMOSTRA).map((d) => ({
    primeiroNome: primeiroNome(d.nome) || "Sem nome",
    telefoneMascarado: mascararTelefoneDoSms(d.telefone),
    match: d.match,
    olhou: d.olhou,
    quando: d.quando,
  }));

  // Mede-se a mensagem de CADA pessoa: o nome muda o tamanho, e é a mais
  // comprida que decide se a campanha cabe. O código do link tem tamanho fixo.
  let maiorPartes = 0;
  let partesNoTotal = 0;
  for (const d of publico.destinatarios) {
    const partes = tamanhoDoSms(textoPara(pedido, base.alvo, d.nome, CODIGO_DE_EXEMPLO)).partes;
    maiorPartes = Math.max(maiorPartes, partes);
    partesNoTotal += partes;
  }
  // O exemplo que vai para a tela leva um nome genérico: nem o primeiro nome de um lead sai daqui.
  const exemplo = textoPara(pedido, base.alvo, "Maria", CODIGO_DE_EXEMPLO);
  const tamanhoDoExemplo = tamanhoDoSms(exemplo);
  const tamanho = maiorPartes > tamanhoDoExemplo.partes ? { ...tamanhoDoExemplo, partes: maiorPartes } : tamanhoDoExemplo;
  if (tamanho.partes > PARTES_MAXIMAS) {
    return { ok: false, status: 400, motivo: `A mensagem ficou com ${tamanho.partes} SMS por pessoa. Encurte para no máximo ${PARTES_MAXIMAS}.` };
  }
  const { precoPorParte } = configuracaoDoSms();
  return {
    ok: true,
    alvo: base.alvo,
    destinatarios: publico.destinatarios,
    partesNoTotal,
    previa: {
      veiculoRotulo: base.alvo ? nomeComAno(base.alvo) : null,
      camadas,
      faixasDeMatch,
      amostra,
      destinatarios: publico.destinatarios.length,
      fora: publico.fora,
      exemplo,
      tamanho,
      precoPorParte,
      // A soma das partes de cada pessoa, e não "a maior vezes todos".
      custoEstimado: precoPorParte === null ? null : Math.round(precoPorParte * partesNoTotal * 100) / 100,
    },
  };
}

export async function previaDaCampanha(admin: SupabaseClient, pedido: PedidoDeCampanha, agora = new Date()) {
  const m = await montarCampanha(admin, pedido, agora);
  return m.ok ? { ok: true as const, previa: m.previa } : m;
}

/**
 * Cria a campanha como rascunho, com o público CONGELADO: quem entra é quem
 * casava no momento da criação, e é isso que a pessoa viu na prévia e aprovou.
 */
export async function criarCampanha(
  admin: SupabaseClient,
  pedido: PedidoDeCampanha,
  autor: { id: string; nome: string | null },
  agora = new Date(),
): Promise<{ ok: true; id: string } | { ok: false; status: 400 | 502 | 503; motivo: string }> {
  const m = await montarCampanha(admin, pedido, agora);
  if (!m.ok) return m;
  if (m.destinatarios.length === 0) return { ok: false, status: 400, motivo: "Ninguém casa com esse público. Mude o critério ou o período." };

  const codigo = novoCodigo();
  const { homologacao } = segredosDoSms();
  const { data: campanha, error } = await admin
    .from("sms_campanhas")
    .insert({
      nome: pedido.nome,
      codigo,
      veiculo_id: pedido.veiculoId,
      veiculo_rotulo: m.previa.veiculoRotulo,
      destino: m.alvo ? getVeiculoPdpUrl(m.alvo) : DESTINOS_SEM_CARRO[pedido.destino],
      criterio: pedido.criterio,
      janela_dias: pedido.janelaDias,
      canais: pedido.canais,
      descanso_dias: pedido.descansoDias,
      compra_ha_meses: pedido.compraHaMeses,
      mensagem: pedido.mensagem,
      homologacao,
      criado_por: autor.id,
      criado_por_nome: autor.nome,
    })
    .select("id")
    .single();
  if (error || !campanha) return { ok: false, status: 502, motivo: "Não deu para gravar a campanha." };

  const usados = new Set<string>();
  const linhas = m.destinatarios.map((d) => {
    let c = novoCodigo();
    while (usados.has(c)) c = novoCodigo();
    usados.add(c);
    const texto = textoPara(pedido, m.alvo, d.nome, c);
    // Sem teto aqui: `montarCampanha` já recusou a campanha em que alguém passa do máximo,
    // e o que se grava é o que o fornecedor cobra.
    return { campanha_id: campanha.id, lead_id: d.leadId, contato_id: d.contatoId, telefone: d.telefone, nome: d.nome, codigo: c, texto, partes: Math.max(1, tamanhoDoSms(texto).partes) };
  });
  for (let i = 0; i < linhas.length; i += 500) {
    const { error: erroDosEnvios } = await admin.from("sms_envios").insert(linhas.slice(i, i + 500));
    if (erroDosEnvios) {
      // Campanha pela metade não fica: a exclusão leva os envios junto.
      await admin.from("sms_campanhas").delete().eq("id", campanha.id);
      return { ok: false, status: 502, motivo: "Não deu para gravar os destinatários; a campanha não foi criada." };
    }
  }
  return { ok: true, id: campanha.id as string };
}

// ─────────────────────────────────────────────────────────────────────────────
// O envio
// ─────────────────────────────────────────────────────────────────────────────

const COLUNAS_DO_RESUMO = "campanha_id, situacao, na_operadora_em, cliques, respondeu_em, saiu_em, custo, partes";

interface LinhaDoResumo {
  campanha_id: string;
  situacao: SituacaoDoEnvio;
  na_operadora_em: string | null;
  cliques: number;
  respondeu_em: string | null;
  saiu_em: string | null;
  custo: number | string | null;
  partes: number;
}

const paraResumo = (l: LinhaDoResumo): EnvioParaResumo => ({
  situacao: l.situacao,
  naOperadoraEm: l.na_operadora_em,
  cliques: l.cliques,
  respondeuEm: l.respondeu_em,
  saiuEm: l.saiu_em,
  custo: l.custo === null ? null : Number(l.custo),
  partes: l.partes,
});

async function lerResumos(admin: SupabaseClient, ids: string[]) {
  const porCampanha = new Map<string, EnvioParaResumo[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return porCampanha;
  const linhas = await lerTudo<LinhaDoResumo>((de, ate) => admin.from("sms_envios").select(COLUNAS_DO_RESUMO).in("campanha_id", ids).order("id").range(de, ate));
  for (const l of linhas) porCampanha.get(l.campanha_id)?.push(paraResumo(l));
  return porCampanha;
}

const ehUuid = (texto: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(texto);

export const MOTIVO_SAIU_DA_LISTA = "A pessoa pediu para sair da lista.";

/** A partir de quantas recusas iguais, sem nenhum aceite, o lote acusa a configuração. */
const RECUSAS_QUE_ACUSAM_A_CONFIGURACAO = 3;

/**
 * Por que um rascunho não pode mais ser enviado como está, ou `null`. A
 * mensagem de cada pessoa foi escrita na criação: se o carro saiu do site ou
 * o preço mudou, o que sairia hoje é a oferta de outro dia.
 */
async function rascunhoEnvelheceu(admin: SupabaseClient, campanha: { id: string; veiculo_id: number | null; mensagem: string }): Promise<string | null> {
  if (campanha.veiculo_id === null) return null;
  const alvo = disponiveisDe(await getEstoque({ cliente: admin })).find((v) => Number(v.id) === Number(campanha.veiculo_id));
  if (!alvo) return "O carro desta campanha não está mais à venda no site. Interrompa esta e crie outra.";
  if (!campanha.mensagem.includes("{preco}")) return null;
  const { data } = await admin.from("sms_envios").select("texto").eq("campanha_id", campanha.id).limit(1);
  const texto = (data as Array<{ texto: string }> | null)?.[0]?.texto;
  return texto && !texto.includes(precoNoSms(precoVigente(alvo) || null))
    ? "O preço do carro mudou desde que a campanha foi criada. Interrompa esta e crie outra, com o preço de hoje."
    : null;
}

type FalhaDoLote = { ok: false; status: 404 | 409 | 502 | 503; motivo: string };

/**
 * Manda UM lote. Devolve o resumo e quantos faltam; a tela chama de novo.
 *
 * A reserva é do banco, e por isso dois cliques (ou duas abas) não mandam o
 * mesmo SMS. O que o fornecedor não respondeu vira `falhou` com "pode ter
 * saído": mandar de novo sozinho seria arriscar SMS em dobro.
 */
export async function enviarLote(
  admin: SupabaseClient,
  id: string,
  deps: { buscar?: BuscarNoSms; agora?: () => number } = {},
): Promise<({ ok: true } & RespostaDoLote) | FalhaDoLote> {
  const agora = deps.agora ?? Date.now;
  const inicio = agora();
  const segredos = segredosDoSms();
  if (!ehUuid(id)) return { ok: false, status: 404, motivo: "Campanha não encontrada." };
  if (!segredos.token) return { ok: false, status: 503, motivo: "Falta APIBRASIL_TOKEN neste ambiente: sem ele nenhum SMS sai." };
  // Toda mensagem promete "responda SAIR". Sem o endereço de retorno a resposta
  // não chega aqui, e a promessa seria falsa: campanha de verdade não sai assim.
  if (!segredos.tokenDoRetorno && !segredos.homologacao) {
    return { ok: false, status: 503, motivo: "Falta SMS_WEBHOOK_TOKEN neste ambiente. Sem ele a resposta SAIR não chega, e a campanha não pode ser enviada." };
  }

  const { data: campanha, error } = await admin.from("sms_campanhas").select("id, situacao, homologacao, veiculo_id, mensagem").eq("id", id).maybeSingle();
  if (error) return { ok: false, status: 502, motivo: "Não deu para ler a campanha." };
  if (!campanha) return { ok: false, status: 404, motivo: "Campanha não encontrada." };
  if (campanha.situacao === "enviada" || campanha.situacao === "interrompida") {
    return { ok: false, status: 409, motivo: campanha.situacao === "enviada" ? "Esta campanha já foi enviada." : "Esta campanha foi interrompida." };
  }
  if (campanha.homologacao !== segredos.homologacao) {
    return {
      ok: false,
      status: 409,
      motivo: campanha.homologacao
        ? "Esta campanha foi criada em modo de teste e este ambiente envia de verdade. Crie a campanha de novo aqui."
        : "Esta campanha é de verdade e este ambiente está em modo de teste (APIBRASIL_HOMOLOGACAO). Nada foi enviado.",
    };
  }
  if (campanha.situacao === "rascunho") {
    // O rascunho pode ter ficado dias parado: o carro pode ter sido vendido, e o preço, mudado.
    const velho = await rascunhoEnvelheceu(admin, campanha as { id: string; veiculo_id: number | null; mensagem: string });
    if (velho) return { ok: false, status: 409, motivo: velho };
    const { error: erroDeInicio } = await admin.from("sms_campanhas").update({ situacao: "enviando" }).eq("id", id).eq("situacao", "rascunho");
    if (erroDeInicio) return { ok: false, status: 502, motivo: "Não deu para começar o envio." };
  }

  // O que uma chamada anterior deixou no meio não volta para a fila.
  await admin.rpc("sms_devolver_presos", { p_campanha: id });

  const { data: reservados, error: erroDeReserva } = await admin.rpc("sms_reservar_envios", { p_campanha: id, p_limite: TAMANHO_DO_LOTE });
  if (erroDeReserva) return { ok: false, status: 502, motivo: "Não deu para reservar o lote." };
  const fila = (reservados ?? []) as Array<{ id: string; telefone: string; texto: string }>;

  let aviso: string | null = null;

  // O público foi congelado na criação. Quem pediu para sair DEPOIS disso não
  // recebe: confere-se na hora de mandar, e não só quando o SAIR chegou.
  const telefones = fila.map((e) => e.telefone);
  const { data: sairam, error: erroDosDescadastros } = telefones.length > 0 ? await admin.from("sms_descadastros").select("telefone").in("telefone", telefones) : { data: [], error: null };
  if (erroDosDescadastros) {
    await admin.from("sms_envios").update({ situacao: "na_fila", tentado_em: null }).in("id", fila.map((e) => e.id)).eq("situacao", "enviando");
    return { ok: false, status: 502, motivo: "Não deu para conferir quem pediu para sair; nada foi enviado neste lote." };
  }
  const saiu = new Set(((sairam ?? []) as Array<{ telefone: string }>).map((d) => d.telefone));
  const barrados = fila.filter((e) => saiu.has(e.telefone));
  if (barrados.length > 0) {
    await admin.from("sms_envios").update({ situacao: "falhou", erro: MOTIVO_SAIU_DA_LISTA }).in("id", barrados.map((e) => e.id));
  }
  const aEnviar = fila.filter((e) => !saiu.has(e.telefone));

  let proximo = 0;
  let aceitos = 0;
  const naoTentados: string[] = [];
  /** Recusas do fornecedor que certamente não saíram. Só viram `falhou` no fim do lote. */
  const recusas: Array<{ id: string; motivo: string }> = [];
  const trabalhar = async () => {
    while (proximo < aEnviar.length) {
      const envio = aEnviar[proximo++];
      // Problema da conta ou prazo estourado: o resto do lote nem tenta, e volta para a fila.
      if (aviso !== null || agora() - inicio > PRAZO_DO_LOTE_MS) {
        naoTentados.push(envio.id);
        continue;
      }
      const r = await enviarSms({
        numero: envio.telefone,
        mensagem: envio.texto,
        token: segredos.token!,
        tipo: segredos.tipo,
        homologacao: segredos.homologacao,
        retorno: segredos.urlDoRetorno,
        buscar: deps.buscar,
      });
      const quando = new Date(agora()).toISOString();
      if (r.ok) {
        aceitos++;
        const aceite = { situacao: "enviado", fornecedor_id: r.id, custo: r.custo, enviado_em: quando, erro: null };
        let { error: erroDoAceite } = await admin.from("sms_envios").update(aceite).eq("id", envio.id);
        if (erroDoAceite) ({ error: erroDoAceite } = await admin.from("sms_envios").update(aceite).eq("id", envio.id));
        // O SMS saiu e o banco não soube: seguir mandando empilharia envios sem registro.
        if (erroDoAceite) aviso = "Um SMS saiu e não pôde ser registrado no banco. O envio parou; confira a campanha antes de continuar.";
        continue;
      }
      if (r.paraOLote) aviso = r.motivo;
      if (r.paraOLote && !r.podeTerSaido) {
        // Saldo, token ou limite: certamente não saiu. Volta para a fila e espera o conserto.
        naoTentados.push(envio.id);
      } else if (!r.podeTerSaido) {
        recusas.push({ id: envio.id, motivo: r.motivo });
      } else {
        await admin.from("sms_envios").update({ situacao: "falhou", erro: r.motivo }).eq("id", envio.id);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(ENVIOS_SIMULTANEOS, aEnviar.length) }, trabalhar));

  // Ninguém aceito e todos recusados pelo MESMO motivo não é número ruim: é a
  // configuração (o `tipo` do produto, por exemplo). Marcar a fila inteira como
  // falha seria queimar a campanha por um erro de variável; ela volta e espera.
  const mesmoMotivo = recusas.length >= RECUSAS_QUE_ACUSAM_A_CONFIGURACAO && recusas.every((r) => r.motivo === recusas[0].motivo);
  if (aceitos === 0 && mesmoMotivo && aviso === null) {
    aviso = `A APIBrasil recusou todos os envios deste lote: "${recusas[0].motivo}". Ninguém foi marcado como falha; confira a configuração (APIBRASIL_SMS_TIPO) e continue o envio.`;
    naoTentados.push(...recusas.map((r) => r.id));
  } else {
    for (const r of recusas) await admin.from("sms_envios").update({ situacao: "falhou", erro: semNumeroLongo(r.motivo) }).eq("id", r.id);
  }
  if (naoTentados.length > 0) {
    await admin.from("sms_envios").update({ situacao: "na_fila", tentado_em: null }).in("id", naoTentados).eq("situacao", "enviando");
  }

  const envios = (await lerResumos(admin, [id])).get(id) ?? [];
  const resumo = resumoDaCampanha(envios);
  const restam = envios.filter((e) => e.situacao === "na_fila").length;

  // A interrupção pode ter chegado durante o lote: a situação é relida, e não presumida.
  const { data: depois } = await admin.from("sms_campanhas").select("situacao").eq("id", id).maybeSingle();
  let situacao = (depois?.situacao ?? "enviando") as SituacaoDaCampanha;
  if (situacao === "enviando" && restam === 0 && resumo.naFila === 0) {
    const { error: erroDoFim } = await admin.from("sms_campanhas").update({ situacao: "enviada", enviada_em: new Date(agora()).toISOString() }).eq("id", id).eq("situacao", "enviando");
    if (!erroDoFim) situacao = "enviada";
  }
  return { ok: true, situacao, resumo, restam, aviso };
}

export async function interromperCampanha(admin: SupabaseClient, id: string): Promise<{ ok: true; situacao: SituacaoDaCampanha } | { ok: false; status: 404 | 409 | 502; motivo: string }> {
  if (!ehUuid(id)) return { ok: false, status: 404, motivo: "Campanha não encontrada." };
  const { data, error } = await admin
    .from("sms_campanhas")
    .update({ situacao: "interrompida", interrompida_em: new Date().toISOString() })
    .eq("id", id)
    .in("situacao", ["rascunho", "enviando"])
    .select("situacao");
  if (error) return { ok: false, status: 502, motivo: "Não deu para interromper a campanha." };
  if (!data || data.length === 0) {
    const { data: existe } = await admin.from("sms_campanhas").select("situacao").eq("id", id).maybeSingle();
    return existe ? { ok: false, status: 409, motivo: "Esta campanha já terminou." } : { ok: false, status: 404, motivo: "Campanha não encontrada." };
  }
  return { ok: true, situacao: "interrompida" };
}

/** Um SMS para o número de quem está montando a campanha, para ver como chega. Não grava nada. */
export async function enviarTeste(
  admin: SupabaseClient,
  pedido: { telefone: string; veiculoId: number | null; mensagem: string; destino?: DestinoSemCarro },
  deps: { buscar?: BuscarNoSms } = {},
): Promise<{ ok: true; texto: string; fornecedor: DitoDoFornecedor; custo: number | null } | { ok: false; status: 400 | 402 | 502 | 503; motivo: string }> {
  const segredos = segredosDoSms();
  if (!segredos.token) return { ok: false, status: 503, motivo: "Falta APIBRASIL_TOKEN neste ambiente: sem ele nenhum SMS sai." };
  const numero = telefoneParaSms(pedido.telefone);
  if (!numero) return { ok: false, status: 400, motivo: "Digite um celular com DDD." };
  if (!pedido.mensagem.includes("{link}")) return { ok: false, status: 400, motivo: "A mensagem precisa do {link}." };
  const alvo = pedido.veiculoId === null ? null : (disponiveisDe(await getEstoque({ cliente: admin })).find((v) => Number(v.id) === pedido.veiculoId) ?? null);
  if (pedido.veiculoId !== null && !alvo) return { ok: false, status: 400, motivo: "Este carro não está à venda no site." };
  if (!alvo && /\{(carro|preco)\}/.test(pedido.mensagem)) return { ok: false, status: 400, motivo: "Sem carro escolhido, a mensagem não pode usar {carro} nem {preco}." };

  // O link do teste é o da ficha, por extenso: não há envio gravado para um código apontar.
  const texto = montarMensagem(pedido.mensagem, {
    nome: "Teste",
    carro: alvo ? nomeComAno(alvo) : "",
    preco: alvo ? precoNoSms(precoVigente(alvo) || null) : "",
    link: `${SITE_HOST}${alvo ? getVeiculoPdpUrl(alvo) : DESTINOS_SEM_CARRO[pedido.destino ?? "estoque"]}`,
  });
  if (tamanhoDoSms(texto).partes > PARTES_MAXIMAS) return { ok: false, status: 400, motivo: `A mensagem passa de ${PARTES_MAXIMAS} SMS. Encurte antes de testar.` };
  // O teste também é um SMS: quem pediu para sair não recebe nem esse.
  const { data: saiu } = await admin.from("sms_descadastros").select("telefone").eq("telefone", numero).limit(1);
  if (((saiu ?? []) as unknown[]).length > 0) return { ok: false, status: 400, motivo: "Este número pediu para sair da lista de SMS." };
  // Com o endereço do retorno: o teste não tem envio gravado, mas os avisos (aceito, na operadora) ficam no log.
  const r = await enviarSms({ numero, mensagem: texto, token: segredos.token, tipo: segredos.tipo, homologacao: segredos.homologacao, retorno: segredos.urlDoRetorno, buscar: deps.buscar });
  if (!r.ok) {
    console.warn("[SMS teste] a APIBrasil recusou", { motivo: r.motivo, tipo: segredos.tipo, homologacao: segredos.homologacao });
    return { ok: false, status: /saldo/.test(r.motivo) ? 402 : 502, motivo: r.motivo };
  }
  // Sem o número: só o que a conta precisa para entender "disse que foi e não chegou".
  console.info("[SMS teste] resposta da APIBrasil", { id: r.id, custo: r.custo, tipo: segredos.tipo, homologacaoPedida: segredos.homologacao, ...r.fornecedor });
  return { ok: true, texto, fornecedor: r.fornecedor, custo: r.custo };
}

// ─────────────────────────────────────────────────────────────────────────────
// O retorno e o clique
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aplica os avisos do fornecedor. Cada passo só grava a PRIMEIRA vez (a chave
 * de idempotência do fornecedor é id + status): aviso repetido não muda nada.
 * Devolve quantos avisos acharam o envio.
 */
export async function registrarRetorno(admin: SupabaseClient, avisos: AvisoDoFornecedor[], agora = new Date()): Promise<number> {
  const quando = agora.toISOString();
  let achados = 0;
  for (const aviso of avisos) {
    // `limit(1)`, e não `maybeSingle`: em modo de teste o fornecedor repete ids, e duas linhas fariam a leitura falhar calada.
    const { data: achadosDoAviso } = await admin
      .from("sms_envios")
      .select("id, campanha_id, telefone, aceito_em, na_operadora_em, respondeu_em, saiu_em")
      .eq("fornecedor_id", aviso.id)
      .order("criado_em", { ascending: false })
      .limit(1);
    const envio = (achadosDoAviso as Array<{ id: string; campanha_id: string; telefone: string; aceito_em: string | null; na_operadora_em: string | null; respondeu_em: string | null; saiu_em: string | null }> | null)?.[0];
    if (!envio) continue;
    achados++;
    const mudanca: Record<string, unknown> = {};
    if ((aviso.status === "valid" || aviso.status === "sent_to_carrier") && !envio.aceito_em) mudanca.aceito_em = quando;
    if (aviso.status === "sent_to_carrier" && !envio.na_operadora_em) mudanca.na_operadora_em = quando;
    if (aviso.status === "reply") {
      if (!envio.respondeu_em) {
        mudanca.respondeu_em = quando;
        mudanca.resposta = aviso.texto;
      }
      if (ehPedidoDeSaida(aviso.texto)) {
        if (!envio.saiu_em) mudanca.saiu_em = quando;
        await admin.from("sms_descadastros").upsert({ telefone: envio.telefone, origem: "resposta", campanha_id: envio.campanha_id }, { onConflict: "org_id,telefone", ignoreDuplicates: true });
        // Quem pediu para sair não recebe o que ainda está na fila, desta ou de outra campanha.
        // (Se esta limpeza falhar, o lote confere o descadastro de novo antes de mandar.)
        await admin.from("sms_envios").update({ situacao: "falhou", erro: MOTIVO_SAIU_DA_LISTA }).eq("telefone", envio.telefone).eq("situacao", "na_fila");
      }
    }
    if (Object.keys(mudanca).length > 0) await admin.from("sms_envios").update(mudanca).eq("id", envio.id);
  }
  return achados;
}

/** Conta o clique e devolve para onde levar a pessoa. `null`: código que não existe. */
export async function registrarClique(admin: SupabaseClient, codigo: string): Promise<string | null> {
  const { data, error } = await admin.rpc("sms_registrar_clique", { p_codigo: codigo });
  const linha = (Array.isArray(data) ? data[0] : data) as { destino?: string; campanha_codigo?: string } | null | undefined;
  if (error || !linha?.destino || !linha.campanha_codigo) return null;
  return destinoDoClique(linha.destino, linha.campanha_codigo);
}

// ─────────────────────────────────────────────────────────────────────────────
// As leituras da tela
// ─────────────────────────────────────────────────────────────────────────────

const COLUNAS_DA_CAMPANHA = "id, nome, codigo, situacao, veiculo_id, veiculo_rotulo, destino, criterio, janela_dias, canais, descanso_dias, compra_ha_meses, mensagem, homologacao, criado_em, criado_por_nome, enviada_em";

interface LinhaDaCampanha {
  id: string;
  nome: string;
  codigo: string;
  situacao: SituacaoDaCampanha;
  veiculo_id: number | null;
  veiculo_rotulo: string | null;
  criterio: CriterioDePublico;
  janela_dias: number | null;
  canais: string[] | null;
  descanso_dias: number | null;
  compra_ha_meses: number | null;
  destino: string;
  mensagem: string;
  homologacao: boolean;
  criado_em: string;
  criado_por_nome: string | null;
  enviada_em: string | null;
}

const naLista = (c: LinhaDaCampanha, envios: EnvioParaResumo[]): CampanhaDeSmsNaLista => ({
  id: c.id,
  nome: c.nome,
  situacao: c.situacao,
  veiculoId: c.veiculo_id === null ? null : Number(c.veiculo_id),
  veiculoRotulo: c.veiculo_rotulo,
  criterio: c.criterio,
  criadoEm: c.criado_em,
  criadoPorNome: c.criado_por_nome,
  enviadaEm: c.enviada_em,
  resumo: resumoDaCampanha(envios),
});

export type LeituraDasCampanhas =
  | { ok: true; campanhas: CampanhaDeSmsNaLista[] }
  | { ok: false; faltaMigracao: boolean; motivo: string };

export async function lerCampanhasDeSms(admin: SupabaseClient, limite = 50): Promise<LeituraDasCampanhas> {
  const { data, error } = await admin.from("sms_campanhas").select(COLUNAS_DA_CAMPANHA).order("criado_em", { ascending: false }).limit(limite);
  if (error) return { ok: false, faltaMigracao: ehTabelaAusente(error), motivo: error.message };
  const campanhas = (data ?? []) as LinhaDaCampanha[];
  try {
    const resumos = await lerResumos(admin, campanhas.map((c) => c.id));
    return { ok: true, campanhas: campanhas.map((c) => naLista(c, resumos.get(c.id) ?? [])) };
  } catch (erro) {
    return { ok: false, faltaMigracao: false, motivo: (erro as Error).message };
  }
}

interface LinhaDoEnvio extends LinhaDoResumo {
  id: string;
  lead_id: string | null;
  telefone: string;
  nome: string | null;
  texto: string;
  enviado_em: string | null;
  clicou_em: string | null;
  resposta: string | null;
  erro: string | null;
}

export async function lerCampanhaDeSms(admin: SupabaseClient, id: string): Promise<CampanhaDeSmsDetalhada | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await admin.from("sms_campanhas").select(COLUNAS_DA_CAMPANHA).eq("id", id).maybeSingle();
  if (error || !data) return null;
  const c = data as LinhaDaCampanha;

  const linhas = await lerTudo<LinhaDoEnvio>((de, ate) =>
    admin
      .from("sms_envios")
      .select(`id, lead_id, telefone, nome, texto, enviado_em, clicou_em, resposta, erro, ${COLUNAS_DO_RESUMO}`)
      .eq("campanha_id", id)
      .order("criado_em")
      .order("id")
      .range(de, ate),
  );
  const utm = utmDaCampanhaDeSms(c.codigo);
  // `utm_campaign` é coluna que a produção tem e as migrações não: se faltar, o número é zero, e não erro.
  const { count } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("utm_campaign", utm);

  // O telefone e o sobrenome param aqui: a tela recebe a máscara e o primeiro nome.
  const envios: EnvioNaTela[] = linhas.map((l) => ({
    id: l.id,
    primeiroNome: primeiroNome(l.nome) || "Sem nome",
    telefoneMascarado: mascararTelefoneDoSms(l.telefone),
    situacao: l.situacao,
    enviadoEm: l.enviado_em,
    naOperadoraEm: l.na_operadora_em,
    cliques: l.cliques,
    clicouEm: l.clicou_em,
    respondeuEm: l.respondeu_em,
    // Texto de terceiro: a resposta do lead e o erro do fornecedor podem trazer um telefone por extenso.
    resposta: semNumeroLongo(l.resposta),
    saiuEm: l.saiu_em,
    erro: semNumeroLongo(l.erro),
    leadId: l.lead_id,
  }));
  // O exemplo é um texto real da campanha, com o nome e o código trocados por genéricos.
  const exemplo = linhas[0]
    ? linhas[0].texto.replace(primeiroNome(linhas[0].nome) || "\u0000", "Maria").replace(/\/s\/[0-9a-z]{7}\b/, `/s/${CODIGO_DE_EXEMPLO}`)
    : c.mensagem;

  return {
    ...naLista(c, linhas.map(paraResumo)),
    janelaDias: c.janela_dias as JanelaDeInteresse,
    canais: c.canais ?? [],
    descansoDias: c.descanso_dias ?? 0,
    compraHaMeses: c.compra_ha_meses ?? null,
    destino: c.destino,
    mensagem: c.mensagem,
    exemplo,
    tamanho: tamanhoDoSms(exemplo),
    utm,
    leadsNovos: count ?? 0,
    envios,
    homologacao: c.homologacao,
  };
}
