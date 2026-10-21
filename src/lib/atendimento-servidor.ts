import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calcularAquecimento,
  decidirEntrega,
  fichaValida,
  mesclarFicha,
  mesclarSinais,
  semCarroNaTroca,
  semCpf,
  sinaisValidos,
  temperaturaAlcanca,
  ROTULO_DO_MOTIVO_DA_ENTREGA,
  type Aquecimento,
  type FichaDoLead,
  type MotivoDaEntrega,
  type SinaisDaConversa,
} from "./aquecimento";
import {
  baloesSemDisposicao,
  baloesSemPergunta,
  lerRespostaDoAgente,
  lerToque,
  montarInstrucoesFixas,
  montarMensagensDoAgente,
  montarMensagensDoToque,
  semDisposicao,
  semLinks,
  valoresDoCliente,
  valoresEmDinheiro,
  vigiarPreco,
  MENSAGENS_DO_HISTORICO,
  type MensagemDaConversa,
} from "./agenteDeAtendimento";
import type { BaseDaLoja } from "./baseDoAtendimento-servidor";
import {
  ROTULO_DA_CADENCIA,
  cadenciaDoSilencio,
  decidirToque,
  dentroDoExpediente,
  podeAvisarAEquipe,
  preencherModelo,
  vencimentoDoPasso,
  MOTIVO_SEM_TOQUE,
  type LeadNaCadencia,
  type MotivoSemToque,
  type NomeDaCadencia,
} from "./cadencias";
import { variantesDoTelefone } from "./chatwootEventos";
import { configValida, type ConfigDoAtendimento } from "./configDoAtendimento";
import { completarEmJson, configDoModelo, MODELO_DE_VISAO, type ConfigDoModelo, type UsoDoModelo } from "./deepseek";
import {
  atrasoDeDigitacao,
  baixarMidia,
  configDaEvolution,
  enviarAnexo,
  enviarImagem,
  enviarTexto,
  motivoSemEvolution,
  type ConfigDaEvolution,
  type Transporte,
} from "./evolution";
import { digitadaNoCelular, mensagemDaLojaAssume, type MensagemDaEvolution, type MidiaDaMensagem } from "./evolutionEventos";
import {
  BUCKET_DOS_ANEXOS,
  TETO_DO_BUCKET,
  anexoDoPainel,
  caminhoDoAnexo,
  caminhoDoPainelNoLead,
  extensaoDoArquivo,
  nomeDoArquivo,
  tamanhoLegivel,
  temArquivo,
  tipoBase,
  type ConteudoDoAnexo,
} from "./anexosDoAtendimento";
import { urlDoLead } from "./filaDoFunil";
import {
  escolherFotos,
  fotosDaGaleria,
  fotosAindaNaoSeparadas,
  fotosJaMostradas,
  FOTOS_FORA_DO_AR,
  legendaDaFoto,
  linhaDasFotosNoEstado,
  MAIS_FOTOS_DA_GALERIA,
  ofertaDepoisDasFotos,
  pedidoDeFotosLegivel,
  SEM_FOTO_DO_CARRO,
  semFotoDaCamada,
  type CamadaDaFoto,
  type FotoClassificada,
  type PedidoDeFotos,
} from "./fotosDoAtendimento";
import {
  classificarCarro,
  classificarFotosPendentes,
  lerFotosClassificadas,
  type ResultadoDaClassificacao,
} from "./fotosDoAtendimento-servidor";
import { numeroDiscavel } from "./funil";
import { etiquetasDaConversa, metodoNoEstado, momentoDaVisita, prontidao, proximosDias, rotuloDaVisita } from "./metodoDeQualificacao";
import { ETAPA_DE_VISITA } from "./gestaoDoLead";
import {
  mensagemDeEntrega,
  mensagemDePassagemAoCliente,
  mensagemRepassadaAoVendedor,
  origemLegivel,
} from "./resumoParaOVendedor";
import { urlDoSite } from "./site";
import { ehVeiculosIndisponivel } from "./veiculosDeInteresse";

/**
 * O atendimento por IA, do lado do servidor: o que cada porta faz com o banco.
 *
 * Quem chama: `/api/atendimento/evolution` (a mensagem chegou),
 * `/api/atendimento/responder` (o n8n esperou a rajada acabar),
 * `/api/atendimento/rodada` (o relógio das entregas e das cadências), a rota
 * de configuração e as rotas do painel em `/api/leads/[id]/`. Todas entram
 * aqui com a chave de serviço, depois de conferir quem bateu.
 *
 * O desenho está em `docs/ATENDIMENTO_IA.md`. As regras que atravessam o
 * arquivo inteiro:
 *
 *   1. **Robô não atende.** Mensagem do assistente nunca chama
 *      `registrar_contato_do_lead`, nunca reinicia relógio de vendedor. Quem
 *      pausa o SLA enquanto o assistente qualifica é
 *      `atendimentos.com_assistente`, como desde 05/09 — e só a PRIMEIRA saída
 *      do assistente carimba `humano_assumiu_em`; reavisar não mexe no relógio.
 *   2. **Na dúvida, devolve ao humano.** O assistente desligado, o modelo que
 *      cai ou responde lixo, a credencial que falta, a Evolution que recusa
 *      tudo, uma exceção no meio, a resposta que travou, a cadência que acabou
 *      sem resposta: em todos, o lead sai do assistente e o SLA volta a correr
 *      — o motor do funil avisa como sempre. Silêncio do robô com o relógio
 *      pausado seria o lead parado sem ninguém saber.
 *   3. **Nada sai sem ficar gravado, e nada sai duas vezes.** Toda mensagem ao
 *      cliente entra em `atendimento_mensagens` ANTES do envio; o resumo e o
 *      toque são RESERVADOS por um update condicional antes de sair; a resposta
 *      tem trava por lead.
 *   4. **Nada automático para quem nunca escreveu.** Cadência e passagem só
 *      saem para o telefone que já mandou mensagem à loja.
 */

type Banco = SupabaseClient;
// Linha do PostgREST sem tipos gerados (o repositório não os tem). Cada campo
// que decide alguma coisa é conferido onde é lido — `fichaValida`,
// `sinaisValidos`, `configValida`, os `=== "qualificando"`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;

export interface Dependencias {
  agora?: Date;
  /** O `fetch` da DeepSeek e da Evolution. A suíte injeta o dela. */
  transporte?: Transporte;
  /** `undefined` lê do ambiente; `null` simula a falta. */
  evolution?: ConfigDaEvolution | null;
  modelo?: ConfigDoModelo | null;
  baseDaLoja?: (comPreco: boolean) => Promise<BaseDaLoja>;
  linkDoLead?: (id: string) => string | null;
  alertar?: (assunto: string, detalhe: string) => Promise<void>;
  /** O relógio de parede, para os orçamentos de tempo. A suíte o fixa. */
  relogio?: () => number;
  /** A conversa classificou fotos novas: a rota revalida o catálogo do prompt. */
  aoClassificarFotos?: () => void;
  /**
   * Trabalho que pode correr depois da resposta (guardar o arquivo que o
   * cliente mandou). A rota passa o `after()` do Next; sem ele, roda na hora.
   */
  depois?: (tarefa: () => Promise<void>) => void | Promise<void>;
}

/** Quanto o n8n espera, depois da última mensagem, antes de pedir a resposta. */
export const ESPERA_DA_RAJADA_MS = 12_000;
/** Mensagem do cliente fora do assistente: repassa ao vendedor se a anterior foi há mais que isto. */
const INTERVALO_DO_REPASSE_MS = 10 * 60 * 1000;
/** O eco da mensagem que o site mandou chega em segundos; cinco minutos é folga. */
const JANELA_DO_ECO_MS = 5 * 60 * 1000;
/** O "ok" do vendedor confirma a entrega das últimas 6 h — e não um aviso velho qualquer. */
const JANELA_DA_CONFIRMACAO_MS = 6 * 60 * 60 * 1000;
/** Entrega mais velha que isto não procura mais o vendedor. */
const JANELA_DA_ENTREGA_PENDENTE_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * A trava da resposta vale isto; depois, a próxima execução assume. Mais que
 * os 120 s do `maxDuration` da rota: enquanto a função que a segura pode
 * estar viva, ninguém a toma.
 */
const VALIDADE_DA_TRAVA_MS = 130_000;
/** Até quando, contado do começo da resposta, as fotos podem sair — o resto do tempo é da entrega. */
const PRAZO_DAS_FOTOS_MS = 80_000;
/** Mensagem do cliente sem resposta há mais que isto, com o assistente no lead: travou. */
const RESPOSTA_ATRASADA_MS = 10 * 60 * 1000;
/** Depois do último toque, o cliente tem um dia para responder antes de o lead voltar à equipe. */
const FOLGA_DEPOIS_DO_ULTIMO_TOQUE_MS = 24 * 60 * 60 * 1000;
/**
 * Quanto o lead quente pode ficar sem responder antes de ir ao vendedor
 * (2026-10-20). Enquanto o cliente responde, o assistente conduz até a visita
 * com hora ou a simulação (`decidirEntrega`, `conduzindo`); parou, a rodada o
 * entrega — o lead quente não espera o toque de 20 horas da cadência.
 */
export const ESPERA_DO_QUENTE_MS = 30 * 60 * 1000;
/** A rodada para de começar toques aqui, para caber nos 60 s da função. */
const ORCAMENTO_DA_RODADA_MS = 40_000;
/** A resposta só refaz uma volta (mensagem que chegou durante) se ainda houver tempo. */
const ORCAMENTO_DA_SEGUNDA_VOLTA_MS = 30_000;
const TOQUES_POR_RODADA = 30;
/** A rodada das fotos para de começar carro aqui, para caber nos 60 s da função. */
const ORCAMENTO_DA_CLASSIFICACAO_MS = 40_000;
/** O carro que o cliente pediu e ainda não foi classificado: o tempo que a resposta espera a visão. */
const ESPERA_DA_CLASSIFICACAO_NA_CONVERSA_MS = 30_000;
/** A Evolution baixa a foto antes de responder; na conversa, cada foto tem este tempo. */
const ESPERA_DO_ENVIO_DA_FOTO_MS = 15_000;
/** Quanto se espera a Evolution entregar o arquivo de uma mensagem que chegou. */
const ESPERA_DO_ARQUIVO_MS = 25_000;
/** A URL assinada que a Evolution usa para buscar o anexo do painel. */
const VIDA_DA_URL_DO_ANEXO_S = 10 * 60;

export const PARA_QUEM_DISTRIBUI = "administrador";

const COLUNAS_DO_LEAD =
  "id, nome, telefone, canal, interesse, situacao, responsavel, desfecho, utm_source, utm_campaign, " +
  "aquecimento, temperatura, qualificacao, resumo_ia, assistente_fase, entregue_em, entregue_motivo, " +
  "aviso_de_entrega_em, aviso_de_entrega_para, cadencia, cadencia_passo, cadencia_proximo_em, optout_em, " +
  "origem_conversa, carro_na_troca, pagamento_pretendido, alertas, ultimo_contato_em, respondendo_desde, veiculo_id";

const FASES_COM_O_ASSISTENTE = ["qualificando", "reaquecendo"];

// ----------------------------------------------------------------------------
// A loja
// ----------------------------------------------------------------------------

/**
 * A loja das leituras com a chave de serviço, que ignora a RLS: `org_padrao()`,
 * a mesma que os `default` das tabelas novas gravam (o padrão de
 * `copilotoDeMidia-servidor.ts`). Uma ida ao banco por cliente — cada
 * requisição cria o seu.
 */
const lojaPorCliente = new WeakMap<object, Promise<string | null>>();
export function lojaDoAtendimento(supabase: Banco): Promise<string | null> {
  let loja = lojaPorCliente.get(supabase);
  if (!loja) {
    loja = Promise.resolve(supabase.rpc("org_padrao")).then(
      ({ data, error }) => (!error && typeof data === "string" ? data : null),
      () => null,
    );
    lojaPorCliente.set(supabase, loja);
  }
  return loja;
}

// ----------------------------------------------------------------------------
// Leituras
// ----------------------------------------------------------------------------

/**
 * A configuração da loja. Tabela ausente (migração não aplicada), loja
 * ilegível ou leitura que falhou = a de fábrica, que é DESLIGADA: o
 * assistente nunca liga por falta de dado.
 */
export async function lerConfigDoAtendimento(
  supabase: Banco,
): Promise<{ config: ConfigDoAtendimento; legivel: boolean }> {
  const loja = await lojaDoAtendimento(supabase);
  if (!loja) {
    console.warn("[Atendimento] Loja ilegível (org_padrao), assistente desligado.");
    return { config: configValida(null), legivel: false };
  }
  const { data, error } = await supabase.from("atendimento_config").select("*").eq("org_id", loja).maybeSingle();
  if (error) {
    console.warn("[Atendimento] Configuração ilegível, assistente desligado:", error.message);
    return { config: configValida(null), legivel: false };
  }
  return { config: configValida(data), legivel: true };
}

export interface PessoaDaEquipe {
  nome: string;
  whatsapp: string | null;
  papeis: string[];
}

/** A equipe ativa com nome, número e papéis — lida uma vez por chamada. */
async function lerEquipe(supabase: Banco): Promise<PessoaDaEquipe[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, telefone_e164, papeis, role, is_active")
    .eq("is_active", true);
  if (error) {
    console.warn("[Atendimento] Equipe ilegível:", error.message);
    return [];
  }
  return ((data ?? []) as Linha[])
    .filter((p) => p.role !== "cliente" && p.role !== "investidor")
    .map((p) => ({
      nome: String(p.full_name ?? "").trim(),
      whatsapp: numeroDiscavel(p.telefone_e164) || null,
      papeis: Array.isArray(p.papeis) ? p.papeis.map(String) : p.role ? [String(p.role)] : [],
    }))
    .filter((p) => p.nome);
}

function daEquipe(equipe: readonly PessoaDaEquipe[], telefone: string): PessoaDaEquipe | null {
  const formas = new Set(variantesDoTelefone(telefone));
  return equipe.find((p) => p.whatsapp && variantesDoTelefone(p.whatsapp).some((f) => formas.has(f))) ?? null;
}

/** O lead ABERTO desta pessoa — a régua de `acharLead` do Chatwoot. */
async function acharLeadAberto(supabase: Banco, telefone: string): Promise<Linha | null> {
  const formas = variantesDoTelefone(telefone);
  if (formas.length === 0) return null;
  const { data, error } = await supabase
    .from("leads")
    .select(COLUNAS_DO_LEAD)
    .in("telefone", formas)
    .is("desfecho", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.warn("[Atendimento] Busca de lead falhou:", error.message);
    return null;
  }
  return ((data ?? []) as Linha[])[0] ?? null;
}

async function lerLead(supabase: Banco, id: string): Promise<Linha | null> {
  const { data, error } = await supabase.from("leads").select(COLUNAS_DO_LEAD).eq("id", id).maybeSingle();
  if (error) throw new Error(`lead ilegível: ${error.message}`);
  return (data as Linha | null) ?? null;
}

/**
 * A conversa, da mais velha à mais nova. O padrão lê o dobro da janela do
 * histórico: as fotos em sequência viram uma linha só para o modelo
 * (`historicoParaOModelo`), e a janela tem de sobrar para a conversa.
 */
async function lerConversa(supabase: Banco, leadId: string, limite = MENSAGENS_DO_HISTORICO * 2): Promise<Linha[]> {
  const { data, error } = await supabase
    .from("atendimento_mensagens")
    .select("id, direcao, autor, autor_nome, conteudo, texto, situacao, wa_id, respondida_em, criado_em, telefone, midia_url, veiculo_id, camada")
    .eq("lead_id", leadId)
    .order("criado_em", { ascending: false })
    .order("id", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`conversa ilegível: ${error.message}`);
  return ((data ?? []) as Linha[]).reverse();
}

/**
 * O cliente já escreveu para a loja DESTE telefone? É a régua contra o
 * disparo frio: lead de formulário (telefone que qualquer um digita) não
 * recebe mensagem automática até a pessoa falar com a loja.
 */
async function clienteJaEscreveu(supabase: Banco, leadId: string, telefone: string | null): Promise<boolean> {
  const formas = variantesDoTelefone(telefone);
  if (formas.length === 0) return false;
  const { data } = await supabase
    .from("atendimento_mensagens")
    .select("id")
    .eq("lead_id", leadId)
    .eq("direcao", "entrada")
    .in("telefone", formas)
    .limit(1);
  if (((data ?? []) as Linha[]).length > 0) return true;
  // A conversa de antes, no Chatwoot, com o mesmo número da loja: também é
  // uma conversa que existiu (a base parada, 2026-10-20).
  const { data: doChatwoot } = await supabase
    .from("atendimentos")
    .select("id")
    .eq("lead_id", leadId)
    .not("chatwoot_conversation_id", "is", null)
    .limit(1);
  return ((doChatwoot ?? []) as Linha[]).length > 0;
}

function fichaDoLead(lead: Linha): FichaDoLead {
  return fichaValida(lead.qualificacao?.ficha);
}

function sinaisDoLead(lead: Linha): SinaisDaConversa {
  return sinaisValidos(lead.qualificacao?.sinais);
}

// ----------------------------------------------------------------------------
// O atendimento (a linha de `atendimentos` desta conversa)
// ----------------------------------------------------------------------------

/**
 * A linha de `atendimentos` da conversa pela Evolution: a mais recente do lead
 * sem id do Chatwoot, pela mesma régua de "mais recente" de
 * `montar_fila_do_funil`. Cria se não houver, herdando as etiquetas do
 * atendimento anterior (a `resgate` do SDR não se perde na troca de porta).
 */
async function garantirAtendimento(supabase: Banco, leadId: string, agora: Date): Promise<Linha | null> {
  const { data } = await supabase
    .from("atendimentos")
    .select("id, com_assistente, iniciado_em, created_at")
    .eq("lead_id", leadId)
    .is("chatwoot_conversation_id", null)
    .order("iniciado_em", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);
  const existente = ((data ?? []) as Linha[])[0];
  if (existente) return existente;
  const { data: anteriores } = await supabase
    .from("atendimentos")
    .select("tags, iniciado_em, created_at")
    .eq("lead_id", leadId)
    .order("iniciado_em", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);
  const tags = ((anteriores ?? []) as Linha[])[0]?.tags ?? null;
  const { data: criado, error } = await supabase
    .from("atendimentos")
    .insert({ lead_id: leadId, iniciado_em: agora.toISOString(), com_assistente: false, status_conversa: "open", tags })
    .select("id, com_assistente")
    .single();
  if (error) {
    console.error("[Atendimento] Atendimento não criado:", error.message);
    return null;
  }
  return (criado as Linha) ?? null;
}

/**
 * Liga ou desliga o assistente no SLA do funil.
 *
 * Desligar só carimba `humano_assumiu_em` quando o assistente ESTAVA ligado:
 * é a saída dele do circuito, e o relógio do vendedor começa ali. Reavisar um
 * lead que já saiu (o dono escolhido depois, o resumo da manhã) não pode
 * reiniciar o relógio — seria o robô atendendo.
 */
async function assistenteNoSla(supabase: Banco, leadId: string, ligado: boolean, agora: Date): Promise<void> {
  const atendimento = await garantirAtendimento(supabase, leadId, agora);
  if (!atendimento) return;
  if ((atendimento.com_assistente === true) === ligado) return;
  const patch: Linha = { com_assistente: ligado, updated_at: agora.toISOString() };
  if (!ligado) patch.humano_assumiu_em = agora.toISOString();
  const { error } = await supabase.from("atendimentos").update(patch).eq("id", atendimento.id);
  if (error) console.error("[Atendimento] SLA não atualizado:", error.message);
}

/** As fotos que o cliente pediu na mensagem que o entregou — só para ESTA entrega (`entregue_em`). */
function fotosPedidasDaEntrega(lead: Linha, entregueEm: string | null): string | null {
  const q = lead.qualificacao;
  if (!q || typeof q.fotos_pedidas !== "string" || !entregueEm) return null;
  return q.fotos_pedidas_em && new Date(q.fotos_pedidas_em).getTime() === new Date(entregueEm).getTime() ? q.fotos_pedidas : null;
}

async function anotarNoRastro(supabase: Banco, leadId: string, texto: string, detalhe: Linha, autor = "Assistente"): Promise<void> {
  const { error } = await supabase.from("leads_eventos").insert({
    lead_id: leadId,
    tipo: "nota",
    autor,
    automatico: autor === "Assistente",
    detalhe: { ...detalhe, origem: "assistente", texto },
  });
  if (error) console.warn("[Atendimento] Rastro não gravado:", error.message);
}

// ----------------------------------------------------------------------------
// O envio — uma porta só
// ----------------------------------------------------------------------------

export type GatilhoDoEnvio = "resposta" | "passagem" | "cadencia" | "painel" | "celular";

interface Envio {
  leadId: string;
  telefone: string;
  /** Com `midia`, é a legenda (pode ser vazia). */
  texto: string;
  gatilho: GatilhoDoEnvio;
  autor: "assistente" | "vendedor" | "sistema";
  autorNome?: string | null;
  atendimentoId?: string | null;
  /** Uma foto do carro, em vez de texto. */
  midia?: { url: string; veiculoId: string; camada: CamadaDaFoto | null };
  /** Um anexo do painel, já no bucket: `url` é a assinada que a Evolution baixa. */
  anexo?: { url: string; caminho: string; conteudo: ConteudoDoAnexo; tipo: string; nome: string | null; bytes: number };
}

/**
 * Grava pendente, envia, atualiza. Devolve o id da linha e se saiu.
 */
async function enviarAoCliente(
  supabase: Banco,
  envio: Envio,
  cfg: ConfigDaEvolution,
  deps: Dependencias,
  comAtraso = true,
): Promise<{ ok: boolean; id: string | null; motivo?: string; incerto?: boolean }> {
  const loja = await lojaDoAtendimento(supabase);
  const { data: linha, error } = await supabase
    .from("atendimento_mensagens")
    .insert({
      ...(loja ? { org_id: loja } : {}),
      lead_id: envio.leadId,
      atendimento_id: envio.atendimentoId ?? null,
      telefone: envio.telefone,
      direcao: "saida",
      autor: envio.autor,
      autor_nome: envio.autorNome ?? null,
      conteudo: envio.anexo ? envio.anexo.conteudo : envio.midia ? "imagem" : "texto",
      texto: envio.texto.trim() || null,
      gatilho: envio.gatilho,
      situacao: "pendente",
      ...(envio.midia
        ? { midia_url: envio.midia.url, veiculo_id: Number(envio.midia.veiculoId), camada: envio.midia.camada }
        : {}),
      ...(envio.anexo
        ? { midia_caminho: envio.anexo.caminho, midia_tipo: envio.anexo.tipo, midia_nome: envio.anexo.nome, midia_bytes: envio.anexo.bytes }
        : {}),
    })
    .select("id")
    .single();
  if (error || !linha) {
    // Sem a linha não há como reconhecer o eco: melhor não mandar do que
    // mandar e ver a própria mensagem voltar como "gente no celular da loja".
    return { ok: false, id: null, motivo: `mensagem não gravada: ${error?.message ?? "sem linha"}` };
  }
  const r = envio.anexo
    ? await enviarAnexo(
        envio.telefone,
        { url: envio.anexo.url, conteudo: envio.anexo.conteudo, tipo: envio.anexo.tipo, nome: envio.anexo.nome, legenda: envio.texto },
        cfg,
        { transporte: deps.transporte },
      )
    : envio.midia
    ? await enviarImagem(envio.telefone, { url: envio.midia.url, legenda: envio.texto }, cfg, { transporte: deps.transporte, timeoutMs: ESPERA_DO_ENVIO_DA_FOTO_MS })
    : await enviarTexto(envio.telefone, envio.texto, cfg, {
        atrasoMs: comAtraso ? atrasoDeDigitacao(envio.texto) : undefined,
        transporte: deps.transporte,
      });
  // Tempo esgotado não é falha certa (a Evolution pode ter mandado): a linha
  // fica pendente, com o motivo, e o eco do webhook a marca como enviada.
  await supabase
    .from("atendimento_mensagens")
    .update(r.ok ? { situacao: "enviada", wa_id: r.waId } : r.incerto ? { erro: r.motivo } : { situacao: "falhou", erro: r.motivo })
    .eq("id", linha.id);
  return r.ok
    ? { ok: true, id: String(linha.id) }
    : { ok: false, id: String(linha.id), motivo: r.motivo, ...(r.incerto ? { incerto: true } : {}) };
}

/** Mensagem para a EQUIPE: não é conversa do cliente, então fica só no rastro. */
async function avisarEquipe(numero: string, texto: string, cfg: ConfigDaEvolution, deps: Dependencias) {
  return enviarTexto(numero, texto, cfg, { transporte: deps.transporte });
}

function evolutionDe(deps: Dependencias): ConfigDaEvolution | null {
  return deps.evolution === undefined ? configDaEvolution() : deps.evolution;
}

function modeloDe(deps: Dependencias, config: ConfigDoAtendimento): ConfigDoModelo | null {
  return deps.modelo === undefined ? configDoModelo(config.modelo) : deps.modelo;
}

/** O modelo que lê as fotos: sempre o de visão (`MODELO_DE_VISAO`), com a mesma chave. */
function visaoDe(deps: Dependencias): ConfigDoModelo | null {
  return deps.modelo === undefined ? configDoModelo(MODELO_DE_VISAO) : deps.modelo;
}

async function alertar(deps: Dependencias, assunto: string, detalhe: string): Promise<void> {
  if (deps.alertar) return deps.alertar(assunto, detalhe);
  const { registrarFalha } = await import("./observabilidade");
  await registrarFalha("parada", assunto, detalhe, { rota: "/api/atendimento", metodo: "POST", origem: "servidor" });
}

async function carregarBase(deps: Dependencias, comPreco: boolean): Promise<BaseDaLoja> {
  if (deps.baseDaLoja) return deps.baseDaLoja(comPreco);
  const { baseDaLoja } = await import("./baseDoAtendimento-servidor");
  return baseDaLoja(comPreco);
}

function linkDe(deps: Dependencias, id: string): string | null {
  return deps.linkDoLead ? deps.linkDoLead(id) : urlDoSite(urlDoLead(id));
}

const relogioDe = (deps: Dependencias) => deps.relogio ?? Date.now;

// ----------------------------------------------------------------------------
// Devolver ao humano
// ----------------------------------------------------------------------------

/**
 * O assistente não pôde seguir: o lead volta para a equipe com o SLA
 * correndo. O motor do funil faz o resto (avisa o administrador do lead sem
 * dono, cobra o vendedor do lead com dono).
 */
async function devolverAoHumano(supabase: Banco, leadId: string, agora: Date, motivo: string): Promise<void> {
  await supabase
    .from("leads")
    .update({ assistente_fase: "pausado", cadencia: null, cadencia_passo: 0, cadencia_proximo_em: null })
    .eq("id", leadId);
  await assistenteNoSla(supabase, leadId, false, agora);
  await anotarNoRastro(supabase, leadId, `O lead voltou para a equipe: ${motivo}.`, { acao: "devolucao_automatica", motivo });
}

/**
 * O assistente foi desligado: TODO lead que estava com ele volta para a
 * equipe agora, de uma vez. Chamada pela rota de configuração quando o
 * assistente é desligado, e pela rodada enquanto ele estiver desligado (para
 * o caso de a linha ter sido mudada por fora). Sem isto, os leads que o
 * assistente qualificava ficariam com o SLA pausado para sempre.
 */
export async function liberarLeadsDoAssistente(supabase: Banco, deps: Dependencias = {}): Promise<number> {
  const agora = deps.agora ?? new Date();
  const { data: comEle } = await supabase
    .from("leads")
    .select("id, assistente_fase, aviso_de_entrega_para")
    .in("assistente_fase", [...FASES_COM_O_ASSISTENTE, "entregue"])
    .is("desfecho", null)
    .limit(500);
  let liberados = 0;
  for (const l of (comEle ?? []) as Linha[]) {
    if (FASES_COM_O_ASSISTENTE.includes(l.assistente_fase)) {
      await devolverAoHumano(supabase, String(l.id), agora, "o assistente foi desligado");
      liberados += 1;
    } else if (!l.aviso_de_entrega_para) {
      // Entregue de madrugada, com o resumo esperando a manhã: o relógio do
      // vendedor começa agora, e o funil avisa pelo caminho de sempre.
      await assistenteNoSla(supabase, String(l.id), false, agora);
      liberados += 1;
    }
  }
  return liberados;
}

// ----------------------------------------------------------------------------
// 1. A entrada — a Evolution contou que chegou (ou saiu) uma mensagem
// ----------------------------------------------------------------------------

export interface DesfechoDaEntrada {
  acao:
    | "repetida"
    | "eco"
    | "equipe"
    | "equipe_confirmou"
    | "saida_sem_lead"
    | "mensagem_da_loja"
    | "loja_assumiu"
    | "mensagem_registrada"
    | "lead_nao_criado"
    | "falhou";
  lead?: string | null;
  mensagem?: string | null;
  /** O n8n espera a rajada e pede a resposta. */
  responder?: boolean;
  aguardar_ms?: number;
  detalhe?: string;
}

// ----------------------------------------------------------------------------
// O arquivo da mensagem (2026-10-20, os anexos)
// ----------------------------------------------------------------------------

/**
 * Baixa da Evolution o arquivo de uma mensagem que já está gravada e o guarda
 * no bucket privado, na pasta do lead. Nunca lança e nunca desfaz a mensagem:
 * o que não der vira `midia_erro`, e o painel diz "veja no celular da loja".
 *
 * Corre DEPOIS de a mensagem estar gravada (e, com `deps.depois`, depois da
 * resposta ao n8n): a conversa não espera um vídeo descer para seguir.
 */
async function guardarArquivoDaMensagem(
  supabase: Banco,
  alvo: { mensagemId: string; leadId: string; waId: string; conteudo: ConteudoDoAnexo; midia: MidiaDaMensagem | null },
  deps: Dependencias,
): Promise<void> {
  const anotar = async (campos: Linha) => {
    const { error } = await supabase.from("atendimento_mensagens").update(campos).eq("id", alvo.mensagemId);
    if (error) console.warn("[Atendimento] Arquivo da mensagem não anotado:", error.message);
  };
  try {
    const declarados = alvo.midia?.bytes ?? null;
    if (declarados !== null && declarados > TETO_DO_BUCKET) {
      await anotar({ midia_erro: `arquivo de ${tamanhoLegivel(declarados)}, acima de ${tamanhoLegivel(TETO_DO_BUCKET)}: veja no celular da loja` });
      return;
    }
    const evolution = evolutionDe(deps);
    if (!evolution) {
      await anotar({ midia_erro: `o arquivo não foi guardado: ${motivoSemEvolution()}` });
      return;
    }
    let baixado = await baixarMidia(alvo.waId, evolution, {
      converterParaMp4: alvo.conteudo === "audio",
      transporte: deps.transporte,
      timeoutMs: ESPERA_DO_ARQUIVO_MS,
    });
    // A conversão do áudio depende do ffmpeg da Evolution: sem ele, o OGG
    // original ainda toca no Chrome e no Android.
    if (!baixado.ok && alvo.conteudo === "audio") {
      baixado = await baixarMidia(alvo.waId, evolution, { transporte: deps.transporte, timeoutMs: ESPERA_DO_ARQUIVO_MS });
    }
    if (!baixado.ok) {
      await anotar({ midia_erro: baixado.motivo.slice(0, 500) });
      return;
    }
    const arquivo = Buffer.from(baixado.base64, "base64");
    if (arquivo.byteLength === 0) {
      await anotar({ midia_erro: "a Evolution entregou um arquivo vazio" });
      return;
    }
    if (arquivo.byteLength > TETO_DO_BUCKET) {
      await anotar({ midia_erro: `arquivo de ${tamanhoLegivel(arquivo.byteLength)}, acima de ${tamanhoLegivel(TETO_DO_BUCKET)}: veja no celular da loja` });
      return;
    }
    const tipo = tipoBase(baixado.tipo ?? alvo.midia?.tipo) || "application/octet-stream";
    const nome = nomeDoArquivo(alvo.midia?.nome ?? baixado.nome);
    const caminho = caminhoDoAnexo(alvo.leadId, alvo.mensagemId, extensaoDoArquivo(tipo, nome));
    const { error } = await supabase.storage
      .from(BUCKET_DOS_ANEXOS)
      .upload(caminho, arquivo, { contentType: tipo, upsert: true });
    if (error) {
      await anotar({ midia_erro: `o arquivo não subiu para o bucket: ${error.message}`.slice(0, 500) });
      return;
    }
    await anotar({ midia_caminho: caminho, midia_tipo: tipo, midia_nome: nome, midia_bytes: arquivo.byteLength, midia_erro: null });
  } catch (erro) {
    await anotar({ midia_erro: `o arquivo não foi guardado: ${erro instanceof Error ? erro.message : String(erro)}`.slice(0, 500) });
  }
}

/** Guarda o arquivo depois da resposta, quando a rota deixa; senão, na hora. */
async function agendarArquivo(
  supabase: Banco,
  alvo: Parameters<typeof guardarArquivoDaMensagem>[1],
  deps: Dependencias,
): Promise<void> {
  const tarefa = () => guardarArquivoDaMensagem(supabase, alvo, deps);
  if (deps.depois) await deps.depois(tarefa);
  else await tarefa();
}

export async function registrarEntrada(
  supabase: Banco,
  evento: MensagemDaEvolution,
  deps: Dependencias = {},
): Promise<DesfechoDaEntrada> {
  const agora = deps.agora ?? new Date();
  const loja = await lojaDoAtendimento(supabase);

  // A mesma mensagem entregue duas vezes (o n8n repete; a Evolution também).
  let repetidas = supabase.from("atendimento_mensagens").select("id, lead_id, direcao, situacao").eq("wa_id", evento.waId);
  if (loja) repetidas = repetidas.eq("org_id", loja);
  const { data: repetida } = await repetidas.limit(1);
  const ja = ((repetida ?? []) as Linha[])[0];
  if (ja) {
    if (ja.direcao === "saida" && ja.situacao === "pendente") {
      await supabase.from("atendimento_mensagens").update({ situacao: "enviada" }).eq("id", ja.id);
    }
    return { acao: ja.direcao === "saida" ? "eco" : "repetida", lead: ja.lead_id ?? null, mensagem: ja.id };
  }

  const equipe = await lerEquipe(supabase);
  const pessoa = daEquipe(equipe, evento.telefone);

  if (evento.deMim) return registrarSaidaDaLoja(supabase, evento, pessoa, agora, loja, deps);
  if (pessoa) return registrarMensagemDaEquipe(supabase, pessoa, agora);

  const { config } = await lerConfigDoAtendimento(supabase);

  // Achar ou criar o lead sob trava por telefone: as mensagens de uma rajada
  // chegam em execuções paralelas do n8n, e sem a trava um número novo
  // ganharia dois leads (e duas respostas).
  const { data: achado, error: erroAchar } = await supabase.rpc("achar_ou_criar_lead_do_whatsapp", {
    p_formas: variantesDoTelefone(evento.telefone),
    p_telefone: evento.telefone,
    p_nome: evento.nome,
    p_origem: evento.origem,
    p_assistente_fase: config.ativo ? "qualificando" : null,
  });
  const linhaAchada = (Array.isArray(achado) ? achado[0] : achado) as Linha | null;
  if (erroAchar || !linhaAchada?.lead_id) {
    console.error("[Atendimento] Lead não achado nem criado:", erroAchar?.message);
    return { acao: "lead_nao_criado", detalhe: erroAchar?.message ?? "sem lead" };
  }
  const novo = linhaAchada.criado === true;
  const lead = await lerLead(supabase, String(linhaAchada.lead_id));
  if (!lead) return { acao: "lead_nao_criado", detalhe: "lead criado e ilegível" };
  const leadId = String(lead.id);

  // Em que fase o lead fica com esta mensagem:
  //   - assistente desligado e o lead estava com ele → volta para a equipe;
  //   - devolvido pelo vendedor e o cliente voltou a falar → o assistente
  //     qualifica de novo (e, se esquentar, entrega ao MESMO dono);
  //   - lead que o assistente nunca pegou → só pega se ninguém da equipe já
  //     falou com o cliente. Lead do formulário que o vendedor já atende não
  //     ganha um robô no meio da conversa;
  //   - o resto fica onde está (entregue, pausado).
  if (!config.ativo && FASES_COM_O_ASSISTENTE.includes(lead.assistente_fase)) {
    await devolverAoHumano(supabase, leadId, agora, "o assistente está desligado");
    lead.assistente_fase = "pausado";
  }
  const voltouDoReaquecimento = config.ativo && lead.assistente_fase === "reaquecendo";
  const humanoJaAtende = Boolean(lead.ultimo_contato_em) || (lead.situacao && lead.situacao !== "novo");
  let fase: string | null = lead.assistente_fase ?? null;
  if (voltouDoReaquecimento) fase = "qualificando";
  else if (!fase && config.ativo && (novo || !humanoJaAtende)) fase = "qualificando";
  const comAssistente = config.ativo && fase === "qualificando" && !lead.optout_em;

  const { data: gravada, error: erroGravar } = await supabase
    .from("atendimento_mensagens")
    .insert({
      ...(loja ? { org_id: loja } : {}),
      lead_id: leadId,
      atendimento_id: linhaAchada.atendimento_id ?? null,
      telefone: evento.telefone,
      direcao: "entrada",
      autor: "cliente",
      autor_nome: evento.nome,
      conteudo: evento.conteudo,
      texto: evento.texto,
      wa_id: evento.waId,
      situacao: "recebida",
      // `criado_em` é a hora de CHEGADA (o `default` do banco), e não a do
      // WhatsApp: a ordem da conversa e a régua de "já respondida" comparam
      // entradas com saídas, e as saídas são carimbadas pelo banco. Mensagem
      // que a Evolution entrega atrasada (reconexão) entra na vez dela.
    })
    .select("id")
    .single();
  if (erroGravar) {
    // 23505: a mesma mensagem chegou em duas entregas simultâneas.
    if (erroGravar.code === "23505") return { acao: "repetida", lead: leadId };
    return { acao: "falhou", lead: leadId, detalhe: erroGravar.message };
  }
  if (temArquivo(evento.conteudo)) {
    await agendarArquivo(supabase, { mensagemId: String(gravada!.id), leadId, waId: evento.waId, conteudo: evento.conteudo, midia: evento.midia }, deps);
  }

  // O cliente respondeu: a cadência para (a régua do manobrAI).
  const patch: Linha = {};
  if (lead.cadencia || lead.cadencia_proximo_em) {
    patch.cadencia = null;
    patch.cadencia_passo = 0;
    patch.cadencia_proximo_em = null;
  }
  if (fase !== (lead.assistente_fase ?? null)) patch.assistente_fase = fase;
  if (!lead.origem_conversa && evento.origem) patch.origem_conversa = evento.origem;
  if (Object.keys(patch).length > 0) {
    await supabase.from("leads").update(patch).eq("id", leadId);
  }
  // O assistente pegou (ou retomou) este lead: o SLA pausa enquanto ele qualifica.
  if (comAssistente) await assistenteNoSla(supabase, leadId, true, agora);

  // Fora do assistente (entregue, pausado, ou lead que a equipe já atendia),
  // ninguém responde automaticamente: com o assistente ligado, a mensagem vai
  // ao vendedor, que pode estar atendendo do PRÓPRIO número e não ver o da
  // loja. Desligado, a entrada só grava.
  if (config.ativo && fase !== "qualificando") {
    await repassarAoVendedor(supabase, lead, evento, equipe, agora, deps);
  }

  const responder = comAssistente && !lead.desfecho;
  return {
    acao: "mensagem_registrada",
    lead: leadId,
    mensagem: String(gravada!.id),
    responder,
    aguardar_ms: responder ? ESPERA_DA_RAJADA_MS : 0,
  };
}

/**
 * A mensagem que voltou pelo webhook é o eco desta que o site mandou?
 *
 * Pelo texto, porque o eco às vezes chega antes de a Evolution devolver o id.
 * No anexo, o tipo tem de bater, e o "texto" do eco é a legenda — ou, no
 * documento sem legenda, o nome do arquivo (`lerConteudo`).
 */
function ehOEco(m: Linha, evento: MensagemDaEvolution): boolean {
  const deLa = (evento.texto ?? "").trim();
  const daqui = (m.texto ?? "").trim();
  const conteudo = m.conteudo ?? "texto";
  if (conteudo !== "texto" && evento.conteudo !== "texto") {
    if (conteudo !== evento.conteudo) return false;
    return daqui === deLa || (!daqui && Boolean(m.midia_nome) && (m.midia_nome ?? "").trim() === deLa);
  }
  return daqui === deLa;
}

/**
 * Saiu do número da loja. Três casos: o eco do que o próprio site mandou
 * (reconhecido pelo texto, porque o eco às vezes chega antes da Evolution
 * responder o id); aviso para alguém da equipe; ou gente escrevendo no
 * celular da loja — que, se for texto ou vídeo, tira o assistente.
 */
async function registrarSaidaDaLoja(
  supabase: Banco,
  evento: MensagemDaEvolution,
  pessoa: PessoaDaEquipe | null,
  agora: Date,
  loja: string | null,
  deps: Dependencias,
): Promise<DesfechoDaEntrada> {
  if (pessoa) return { acao: "equipe", detalhe: "mensagem da loja para a equipe" };

  const desde = new Date(agora.getTime() - JANELA_DO_ECO_MS).toISOString();
  const { data: recentes } = await supabase
    .from("atendimento_mensagens")
    .select("id, lead_id, texto, wa_id, conteudo, midia_nome")
    .eq("direcao", "saida")
    .in("telefone", variantesDoTelefone(evento.telefone))
    .is("wa_id", null)
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(10);
  const eco = ((recentes ?? []) as Linha[]).find((m) => ehOEco(m, evento));
  if (eco) {
    await supabase.from("atendimento_mensagens").update({ wa_id: evento.waId, situacao: "enviada" }).eq("id", eco.id);
    return { acao: "eco", lead: eco.lead_id, mensagem: eco.id };
  }

  const lead = await acharLeadAberto(supabase, evento.telefone);
  if (!lead) return { acao: "saida_sem_lead", detalhe: "mensagem da loja para quem não tem lead aberto" };
  const leadId = String(lead.id);
  const atendimento = await garantirAtendimento(supabase, leadId, agora);

  const { data: doCelular } = await supabase
    .from("atendimento_mensagens")
    .insert({
      ...(loja ? { org_id: loja } : {}),
      lead_id: leadId,
      atendimento_id: atendimento?.id ?? null,
      telefone: evento.telefone,
      direcao: "saida",
      autor: "vendedor",
      autor_nome: "Celular da loja",
      gatilho: "celular",
      conteudo: evento.conteudo,
      texto: evento.texto,
      wa_id: evento.waId,
      situacao: "enviada",
    })
    .select("id")
    .single();
  // A foto ou o documento que alguém mandou do celular da loja aparece no
  // painel como o do cliente: o arquivo, e não o rótulo.
  if (doCelular?.id && temArquivo(evento.conteudo)) {
    await agendarArquivo(supabase, { mensagemId: String(doCelular.id), leadId, waId: evento.waId, conteudo: evento.conteudo, midia: evento.midia }, deps);
  }

  if (!mensagemDaLojaAssume(evento.conteudo)) {
    return { acao: "mensagem_da_loja", lead: leadId, detalhe: "foto, áudio ou documento não tiram o assistente" };
  }

  // Gente respondeu pelo celular da loja: o assistente sai da conversa até
  // alguém retomar no painel. Reiniciar o relógio, só com certeza de que foi
  // gente (`digitadaNoCelular`): envio pela API de outra automação chega
  // igual, e robô não atende.
  if (digitadaNoCelular(evento.aparelho)) {
    const { error } = await supabase.rpc("registrar_contato_do_lead", {
      p_lead: leadId,
      p_canal: "evolution",
      p_autor: "Celular da loja",
    });
    if (error) console.error("[Atendimento] Contato do celular da loja não registrado:", error.message);
  }
  if (FASES_COM_O_ASSISTENTE.includes(lead.assistente_fase)) {
    await supabase
      .from("leads")
      .update({ assistente_fase: "pausado", cadencia: null, cadencia_passo: 0, cadencia_proximo_em: null })
      .eq("id", leadId);
    await assistenteNoSla(supabase, leadId, false, agora);
    await anotarNoRastro(supabase, leadId, "Alguém respondeu pelo celular da loja: o assistente saiu da conversa.", {
      acao: "pausa",
      por: "celular_da_loja",
    });
  }
  return { acao: "loja_assumiu", lead: leadId };
}

/**
 * Alguém da equipe escreveu para o número da loja — quase sempre o "ok" ao
 * resumo da entrega. Não vira lead (a trava de 2026-10-10 do Chatwoot); vira
 * a confirmação de que o aviso chegou, que é métrica de equipe — só para a
 * entrega das últimas horas, e não para um aviso velho qualquer.
 */
async function registrarMensagemDaEquipe(supabase: Banco, pessoa: PessoaDaEquipe, agora: Date): Promise<DesfechoDaEntrada> {
  const desde = new Date(agora.getTime() - JANELA_DA_CONFIRMACAO_MS).toISOString();
  const destinos = [pessoa.nome, ...(pessoa.papeis.includes("admin") ? [PARA_QUEM_DISTRIBUI] : [])];
  const { data } = await supabase
    .from("leads")
    .select("id")
    .in("aviso_de_entrega_para", destinos)
    .is("entrega_confirmada_em", null)
    .gte("aviso_de_entrega_em", desde)
    .order("aviso_de_entrega_em", { ascending: false })
    .limit(1);
  const lead = ((data ?? []) as Linha[])[0];
  if (!lead) return { acao: "equipe", detalhe: "mensagem da equipe sem entrega a confirmar" };
  await supabase.from("leads").update({ entrega_confirmada_em: agora.toISOString() }).eq("id", lead.id);
  return { acao: "equipe_confirmou", lead: String(lead.id) };
}

async function repassarAoVendedor(
  supabase: Banco,
  lead: Linha,
  evento: MensagemDaEvolution,
  equipe: readonly PessoaDaEquipe[],
  agora: Date,
  deps: Dependencias,
): Promise<void> {
  const cfg = evolutionDe(deps);
  const dono = equipe.find((p) => p.nome === String(lead.responsavel ?? "").trim());
  if (!cfg || !dono?.whatsapp || !podeAvisarAEquipe(agora)) return;
  // Uma rajada, um repasse: se a mensagem anterior do cliente foi há pouco, o
  // vendedor já foi avisado desta conversa.
  const { data } = await supabase
    .from("atendimento_mensagens")
    .select("criado_em")
    .eq("lead_id", lead.id)
    .eq("direcao", "entrada")
    .neq("wa_id", evento.waId)
    .order("criado_em", { ascending: false })
    .limit(1);
  const anterior = ((data ?? []) as Linha[])[0];
  if (anterior && agora.getTime() - new Date(anterior.criado_em).getTime() < INTERVALO_DO_REPASSE_MS) return;
  const texto = evento.texto ?? `(${evento.conteudo})`;
  const r = await avisarEquipe(
    dono.whatsapp,
    mensagemRepassadaAoVendedor({ nome: lead.nome, texto, linkDoLead: linkDe(deps, String(lead.id)) }),
    cfg,
    deps,
  );
  if (!r.ok) console.warn("[Atendimento] Repasse ao vendedor não saiu:", r.motivo);
}

// ----------------------------------------------------------------------------
// 2. A resposta — o n8n esperou a rajada acabar
// ----------------------------------------------------------------------------

export interface DesfechoDaResposta {
  acao:
    | "assistente_desligado"
    | "lead_nao_encontrado"
    | "fora_do_assistente"
    | "aguardando_mais_novas"
    | "ocupado"
    | "ja_respondida"
    | "sem_credencial"
    | "modelo_falhou"
    | "envio_falhou"
    | "falhou"
    | "respondido";
  lead?: string;
  enviadas?: number;
  falhas?: number;
  aquecimento?: number;
  temperatura?: string;
  entregue?: boolean;
  /** Quantas voltas a resposta deu (mais de uma: chegou mensagem enquanto respondia). */
  voltas?: number;
  /** Fotos do carro que saíram nesta resposta. */
  fotos?: number;
  /** Com `ocupado`: quando a resposta em curso terá terminado — o workflow tenta de novo depois disso. */
  tentar_em_ms?: number;
  detalhe?: string;
}

/**
 * A trava da resposta, POR LEAD: dois updates condicionais, cada um atômico.
 * Livre, ou presa há mais que a validade (a função que segurava morreu).
 */
async function travarResposta(supabase: Banco, leadId: string, agora: Date): Promise<string | null> {
  const marca = agora.toISOString();
  const { data: livre } = await supabase
    .from("leads")
    .update({ respondendo_desde: marca })
    .eq("id", leadId)
    .is("respondendo_desde", null)
    .select("id");
  if (((livre ?? []) as Linha[]).length > 0) return marca;
  const vencida = new Date(agora.getTime() - VALIDADE_DA_TRAVA_MS).toISOString();
  const { data: presa } = await supabase
    .from("leads")
    .update({ respondendo_desde: marca })
    .eq("id", leadId)
    .lt("respondendo_desde", vencida)
    .select("id");
  return ((presa ?? []) as Linha[]).length > 0 ? marca : null;
}

/** Solta só a PRÓPRIA trava: se ela venceu e outra execução assumiu, a dela fica. */
async function soltarResposta(supabase: Banco, leadId: string, marca: string): Promise<void> {
  await supabase.from("leads").update({ respondendo_desde: null }).eq("id", leadId).eq("respondendo_desde", marca);
}

/** As mensagens do cliente que ainda ninguém respondeu. */
async function pendentesDoCliente(supabase: Banco, leadId: string): Promise<Linha[]> {
  const { data } = await supabase
    .from("atendimento_mensagens")
    .select("id")
    .eq("lead_id", leadId)
    .eq("direcao", "entrada")
    .is("respondida_em", null)
    .limit(50);
  return (data ?? []) as Linha[];
}

/** Devolve as mensagens à fila: quem retomar o assistente as responde. */
async function devolverPendentes(supabase: Banco, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await supabase.from("atendimento_mensagens").update({ respondida_em: null }).in("id", ids);
}

export async function responderAoLead(
  supabase: Banco,
  pedido: { leadId: string; mensagemId?: string | null },
  deps: Dependencias = {},
): Promise<DesfechoDaResposta> {
  const agora = deps.agora ?? new Date();
  const relogio = relogioDe(deps);
  const inicio = relogio();
  const { config } = await lerConfigDoAtendimento(supabase);

  const lead = await lerLead(supabase, pedido.leadId);
  if (!lead) return { acao: "lead_nao_encontrado" };
  const leadId = String(lead.id);
  if (!config.ativo) {
    if (FASES_COM_O_ASSISTENTE.includes(lead.assistente_fase)) {
      await devolverAoHumano(supabase, leadId, agora, "o assistente está desligado");
    }
    return { acao: "assistente_desligado", lead: leadId };
  }
  if (lead.desfecho || lead.optout_em || lead.assistente_fase !== "qualificando") {
    return { acao: "fora_do_assistente", lead: leadId, detalhe: lead.desfecho ? "lead encerrado" : lead.optout_em ? "opt-out" : `fase ${lead.assistente_fase ?? "nenhuma"}` };
  }

  // A rajada: só a execução da ÚLTIMA mensagem responde. As anteriores saem
  // aqui, e a resposta única cobre todas.
  if (pedido.mensagemId) {
    const conversa = await lerConversa(supabase, leadId, 10);
    const ultima = conversa.filter((m) => m.direcao === "entrada").at(-1);
    if (ultima && ultima.id !== pedido.mensagemId) return { acao: "aguardando_mais_novas", lead: leadId };
  }

  const marca = await travarResposta(supabase, leadId, agora);
  if (!marca) {
    // Quando tentar de novo (o workflow de entrada espera isto e pede uma vez
    // mais): depois de a resposta em curso ter terminado com certeza.
    const desde = lead.respondendo_desde ? new Date(lead.respondendo_desde).getTime() : agora.getTime();
    // Depois de a trava vencer (130 s): mesmo que a execução que a segura
    // tenha morrido no `maxDuration`, a nova tentativa a encontra livre.
    const tentarEm = Math.round(Math.min(VALIDADE_DA_TRAVA_MS + 10_000, Math.max(15_000, desde + VALIDADE_DA_TRAVA_MS + 5_000 - agora.getTime())));
    return { acao: "ocupado", lead: leadId, tentar_em_ms: tentarEm };
  }
  try {
    let voltas = 0;
    let resultado: DesfechoDaResposta;
    // Uma segunda volta só se chegou mensagem ENQUANTO respondia — a execução
    // dela achou a trava ocupada e saiu; quem responde é esta.
    for (;;) {
      voltas += 1;
      resultado = await responderUmaVez(supabase, leadId, config, deps, agora, inicio + PRAZO_DAS_FOTOS_MS);
      if (resultado.acao !== "respondido" || resultado.entregue) break;
      if (voltas >= 2 || relogio() - inicio > ORCAMENTO_DA_SEGUNDA_VOLTA_MS) break;
      if ((await pendentesDoCliente(supabase, leadId)).length === 0) break;
    }
    return { ...resultado, voltas };
  } catch (erro) {
    // Exceção no meio: o lead não pode ficar com o SLA pausado e sem resposta.
    const motivo = erro instanceof Error ? erro.message : String(erro);
    await devolverPendentes(supabase, (await pendentesDoClienteMarcadas(supabase, leadId, agora)).map((m) => String(m.id)));
    await devolverAoHumano(supabase, leadId, agora, `o assistente falhou ao responder (${motivo})`);
    await alertar(deps, "atendimento-erro", `Assistente de atendimento falhou: ${motivo}. O lead voltou para a equipe.`);
    return { acao: "falhou", lead: leadId, detalhe: motivo };
  } finally {
    await soltarResposta(supabase, leadId, marca);
  }
}

/** As entradas que ESTA execução marcou (para devolver numa exceção). */
async function pendentesDoClienteMarcadas(supabase: Banco, leadId: string, agora: Date): Promise<Linha[]> {
  const { data } = await supabase
    .from("atendimento_mensagens")
    .select("id")
    .eq("lead_id", leadId)
    .eq("direcao", "entrada")
    .eq("respondida_em", agora.toISOString())
    .limit(50);
  return (data ?? []) as Linha[];
}

/** Uma volta: responde a todas as mensagens pendentes do cliente, de uma vez. */
async function responderUmaVez(
  supabase: Banco,
  leadId: string,
  config: ConfigDoAtendimento,
  deps: Dependencias,
  agora: Date,
  /** No relógio de `relogioDe(deps)`: depois disto, nenhuma foto começa a sair. */
  prazoDasFotos: number,
): Promise<DesfechoDaResposta> {
  const lead = await lerLead(supabase, leadId);
  if (!lead || lead.desfecho || lead.optout_em || lead.assistente_fase !== "qualificando") {
    return { acao: "fora_do_assistente", lead: leadId };
  }
  const pendentes = await pendentesDoCliente(supabase, leadId);
  if (pendentes.length === 0) return { acao: "ja_respondida", lead: leadId };
  const ids = pendentes.map((m) => String(m.id));
  await supabase.from("atendimento_mensagens").update({ respondida_em: agora.toISOString() }).in("id", ids);

  const evolution = evolutionDe(deps);
  const modelo = modeloDe(deps, config);
  if (!evolution || !modelo) {
    const falta = !modelo ? "falta DEEPSEEK_API_KEY na Vercel" : motivoSemEvolution();
    await devolverPendentes(supabase, ids);
    await devolverAoHumano(supabase, leadId, agora, `o assistente não pôde responder: ${falta}`);
    await alertar(deps, "atendimento-sem-credencial", `Assistente de atendimento sem credencial (${falta}). Os leads voltam para a equipe.`);
    return { acao: "sem_credencial", lead: leadId, detalhe: falta };
  }

  const conversa = await lerConversa(supabase, leadId);
  const doCliente = conversa.filter((m) => m.direcao === "entrada");
  const base = await carregarBase(deps, config.informar_preco);
  const fichaAntes = fichaDoLead(lead);
  const sinaisAntes = sinaisDoLead(lead);
  const instrucoes = montarInstrucoesFixas({
    config,
    nomeDaLoja: base.nomeDaLoja,
    loja: base.loja,
    catalogo: base.catalogo,
    totalDoCatalogo: base.totalDoCatalogo,
    geradoEm: base.geradoEm,
  });
  const historico: MensagemDaConversa[] = conversa.map((m) => ({
    autor: m.autor,
    autor_nome: m.autor_nome,
    conteudo: m.conteudo,
    texto: m.texto,
    criado_em: m.criado_em,
    midia_url: m.midia_url,
    veiculo_id: m.veiculo_id,
    camada: m.camada,
  }));
  const fotosDoEstado = await fotosNoEstado(supabase, leadId, base, agora);
  const chamada = await completarEmJson({
    cfg: modelo,
    mensagens: montarMensagensDoAgente({
      instrucoes,
      historico,
      estado: {
        ficha: fichaAntes,
        sinais: sinaisAntes,
        nomeDoCliente: lead.nome,
        agora: agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
        lojaAberta: dentroDoExpediente(agora),
        origem: origemLegivel(lead),
        fotos: fotosDoEstado,
        calendario: proximosDias(agora),
        metodo: metodoNoEstado(prontidao(fichaAntes, agora, { nomeNoWhatsApp: lead.nome })),
      },
    }),
    // Mais baixa que o padrão (0,5): no teste do branch, o modelo saía do
    // roteiro — duas perguntas por resposta, a pergunta do cliente em branco.
    temperatura: 0.3,
    transporte: deps.transporte,
  });
  const resposta = chamada.ok ? lerRespostaDoAgente(chamada.conteudo) : null;
  if (!resposta) {
    const motivo = chamada.ok ? "o modelo respondeu fora do formato" : chamada.motivo;
    await devolverPendentes(supabase, ids);
    await devolverAoHumano(supabase, leadId, agora, `o assistente não conseguiu responder (${motivo})`);
    await alertar(deps, "atendimento-modelo", `Assistente de atendimento falhou: ${motivo}. O lead voltou para a equipe.`);
    return { acao: "modelo_falhou", lead: leadId, detalhe: motivo };
  }

  const ficha = mesclarFicha(fichaAntes, resposta.ficha);
  const sinais = mesclarSinais(sinaisAntes, resposta.sinais);
  const aquecimento = calcularAquecimento(ficha, sinais, {
    pesos: config.pesos,
    limiares: config.limiares,
    mensagensDoCliente: doCliente.length,
  });
  // Pronto para o comercial (visita marcada ou simulação completa) entrega
  // com qualquer nota: é o objetivo do método (`metodoDeQualificacao.ts`).
  const pronto = prontidao(ficha, agora, { nomeNoWhatsApp: lead.nome }).pronto;
  // O cliente acabou de escrever: o assistente CONDUZ, e a temperatura sozinha
  // não corta a conversa no meio (o "sábado" sem hora do teste do branch).
  const decisao = decidirEntrega(aquecimento, sinais, config.avisar_a_partir, pronto, { conduzindo: true });
  // Segurado: quente, ou pronto com um pedido do cliente em andamento. Se o
  // cliente parar de responder, a rodada entrega.
  const quenteSegurado = !decisao.entregar && !sinais.optout && (Boolean(pronto) || temperaturaAlcanca(aquecimento.temperatura, config.avisar_a_partir));
  // O que pode aparecer em reais é o orçamento e a entrada que o cliente
  // disse — nunca um preço que ele "viu" e pede para confirmar.
  const vigiados = vigiarPreco(
    resposta.mensagens,
    valoresDoCliente(ficha, doCliente.map((m) => m.texto)),
    config.informar_preco,
  ).mensagens;
  // E nada de "fico à disposição" (pedido do dono, 2026-10-20). Na entrega,
  // nenhuma pergunta: o assistente sai da conversa logo depois.
  const semDisposicaoNenhuma = baloesSemDisposicao(vigiados);
  const mensagens = decisao.entregar ? baloesSemPergunta(semDisposicaoNenhuma) : semDisposicaoNenhuma;

  const atendimento = await garantirAtendimento(supabase, leadId, agora);
  let enviadas = 0;
  let falhas = 0;
  let ultimoMotivo = "";
  for (const texto of mensagens) {
    const r = await enviarAoCliente(supabase, { leadId, telefone: lead.telefone, texto, gatilho: "resposta", autor: "assistente", autorNome: config.nome_do_assistente, atendimentoId: atendimento?.id ?? null }, evolution, deps);
    if (r.ok) enviadas += 1;
    else {
      falhas += 1;
      ultimoMotivo = r.motivo ?? "";
    }
  }

  await registrarRetrato(supabase, leadId, aquecimento, ficha, sinais, "conversa", modelo.modelo, chamada.ok ? chamada.uso : null);

  if (enviadas === 0) {
    // Nada saiu (WhatsApp desconectado, número recusado): o cliente está sem
    // resposta e o SLA, pausado. Volta para a equipe, com o motivo.
    await devolverPendentes(supabase, ids);
    await devolverAoHumano(supabase, leadId, agora, `a resposta do assistente não saiu pela Evolution (${ultimoMotivo})`);
    await alertar(deps, "atendimento-envio", `A resposta do assistente não saiu pela Evolution: ${ultimoMotivo}. O lead voltou para a equipe.`);
    return { acao: "envio_falhou", lead: leadId, enviadas, falhas, detalhe: ultimoMotivo };
  }

  // O resumo vai ao card e ao WhatsApp do vendedor: sem link e sem CPF.
  const resumo = resposta.resumo ? semCpf(semLinks(resposta.resumo)) : null;
  // Na entrega, o assistente não manda as fotos que o cliente acabou de
  // pedir: quem manda é o vendedor, e o resumo e a passagem dizem isso.
  const fotosPedidas =
    decisao.entregar && resposta.fotos && !sinais.optout ? pedidoDeFotosLegivel(resposta.fotos, base.fotos?.[resposta.fotos.veiculo]?.nome) : null;
  const patch: Linha = {
    aquecimento: aquecimento.pontos,
    temperatura: aquecimento.temperatura,
    // `fotos_pedidas_em` amarra o pedido a ESTA entrega (`entregue_em` é a
    // mesma hora): uma entrega pelo painel semanas depois não o repete.
    qualificacao: {
      ficha,
      sinais,
      motivos: aquecimento.motivos,
      ...(fotosPedidas ? { fotos_pedidas: fotosPedidas, fotos_pedidas_em: agora.toISOString() } : {}),
    },
    ...(resumo ? { resumo_ia: resumo, resumo_ia_em: agora.toISOString() } : {}),
    // O que o cliente disse preenche o VAZIO dos dados do negócio — nunca
    // sobrescreve o que o vendedor escreveu (a régua de "o feed preenche o
    // vazio", 2026-09-29).
    // "Sem troca" é a resposta do cliente, não um carro: não vai para o campo.
    ...(!lead.carro_na_troca && ficha.troca && !semCarroNaTroca(ficha.troca) ? { carro_na_troca: ficha.troca } : {}),
    ...(!lead.pagamento_pretendido && ficha.pagamento ? { pagamento_pretendido: ficha.pagamento } : {}),
    ...(!lead.interesse && ficha.interesse ? { interesse: ficha.interesse } : {}),
  };
  if (sinais.optout) {
    Object.assign(patch, { optout_em: agora.toISOString(), assistente_fase: "pausado", cadencia: null, cadencia_passo: 0, cadencia_proximo_em: null });
  } else if (quenteSegurado) {
    // Quente e conduzindo: se o cliente parar de responder, a rodada o
    // entrega ao vendedor daqui a meia hora, em vez do toque da cadência.
    Object.assign(patch, { cadencia: "follow_up", cadencia_passo: 0, cadencia_proximo_em: new Date(agora.getTime() + ESPERA_DO_QUENTE_MS).toISOString() });
  } else if (!decisao.entregar) {
    // Respondeu e ficou esperando o cliente: se ele sumir, a cadência começa.
    const cadencia = cadenciaDoSilencio(Boolean(ficha.interesse));
    const proximo = config.cadencias[cadencia].ativa ? vencimentoDoPasso(config.cadencias, cadencia, 0, agora) : null;
    Object.assign(patch, { cadencia: proximo ? cadencia : null, cadencia_passo: 0, cadencia_proximo_em: proximo });
  }
  const { error: erroLead } = await supabase.from("leads").update(patch).eq("id", leadId);
  if (erroLead) console.error("[Atendimento] Lead não atualizado:", erroLead.message);

  if (sinais.optout) {
    await assistenteNoSla(supabase, leadId, false, agora);
    await anotarNoRastro(supabase, leadId, "O cliente pediu para não receber mais mensagens.", { acao: "optout" });
  }

  // Os carros da conversa viram carros de interesse do lead — os que o modelo
  // apontou e o das fotos pedidas. Na reclamação e no pós-venda, nada disso:
  // o carro de que ele fala é o que já comprou, não um interesse de compra.
  if (!sinais.pos_venda) {
    await registrarCarrosDaConversa(
      supabase,
      lead,
      [...resposta.veiculos, ...(resposta.fotos ? [resposta.fotos.veiculo] : [])],
      base,
      config.nome_do_assistente,
    );

    // O que o cliente disse vira etiqueta de intenção (quer-comprar,
    // quer-financiar, quer-avaliar). "negociando" é da entrega.
    await etiquetarPeloAssistente(supabase, leadId, etiquetasDaConversa(ficha), config.nome_do_assistente);
  }

  // As fotos que o modelo pediu saem depois do texto — e depois de o lead
  // estar gravado: se a Evolution demorar baixando a mídia, a ficha, a nota e
  // a cadência já estão salvas. Com prazo, para a entrega caber no tempo da
  // função. Na entrega, nenhuma: o cliente vai ao vendedor, e uma oferta de
  // "quer ver o interior?" antes da passagem seria o assistente puxando
  // conversa que ele mesmo não vai continuar.
  let fotos = 0;
  if (resposta.fotos && !sinais.optout && !decisao.entregar) {
    const r = await mandarFotos(supabase, {
      leadId,
      telefone: lead.telefone,
      pedido: resposta.fotos,
      base,
      config,
      evolution,
      deps,
      atendimentoId: atendimento?.id ?? null,
      prazo: prazoDasFotos,
    });
    fotos = r.fotos;
    falhas += r.falhas;
  }

  let entregue = false;
  if (decisao.entregar && !sinais.optout) {
    await entregarAoVendedor(supabase, { ...lead, ...patch }, decisao.motivo, aquecimento, ficha, config, evolution, deps, agora, true);
    entregue = true;
  }

  return {
    acao: "respondido",
    lead: leadId,
    enviadas,
    falhas,
    aquecimento: aquecimento.pontos,
    temperatura: aquecimento.temperatura,
    entregue,
    ...(fotos > 0 ? { fotos } : {}),
  };
}

// ----------------------------------------------------------------------------
// Os carros da conversa, como carros de interesse
// ----------------------------------------------------------------------------

/**
 * Os carros de que o cliente falou entram nos carros de interesse do lead
 * (2026-10-20, pedido do dono: *"que ele já inserisse o carro da conversa ou
 * carros da conversa como carros de interesse"*).
 *
 * Só carro do catálogo à venda (a galeria da base), só o que ainda não está
 * no lead, em avaliação — quem escolhe ou descarta é a equipe. Grava quem
 * anotou (`adicionado_por`, o nome do assistente) e uma nota no rastro. Sem
 * carro principal, o primeiro vira principal (`leads.veiculo_id`, que o card
 * e o quadro leem). NUNCA lança nem segura a conversa: tabela ausente,
 * carro que saiu do estoque e leitura que falha só vão ao log.
 */
async function registrarCarrosDaConversa(
  supabase: Banco,
  lead: Linha,
  ids: readonly string[],
  base: BaseDaLoja,
  nomeDoAssistente: string,
): Promise<void> {
  try {
    const leadId = String(lead.id);
    const doCatalogo = [...new Set(ids)].filter((id) => !base.fotos || id in base.fotos);
    if (doCatalogo.length === 0) return;
    const { data: ja, error: erroDaLeitura } = await supabase.from("leads_veiculos").select("veiculo_id").eq("lead_id", leadId);
    if (erroDaLeitura) {
      if (!ehVeiculosIndisponivel(erroDaLeitura)) console.warn("[Atendimento] Carros de interesse ilegíveis:", erroDaLeitura.message);
      return;
    }
    const existentes = new Set(((ja ?? []) as Linha[]).map((l) => String(l.veiculo_id)));
    const novos = doCatalogo.filter((id) => !existentes.has(id));
    for (const id of novos) {
      const { error } = await supabase.from("leads_veiculos").insert({ lead_id: leadId, veiculo_id: Number(id), adicionado_por: nomeDoAssistente });
      if (error) {
        if (error.code !== "23502" && error.code !== "23505" && !ehVeiculosIndisponivel(error)) {
          console.warn("[Atendimento] Carro de interesse não registrado:", error.message);
        }
        continue;
      }
      const nome = base.fotos?.[id]?.nome ?? `o carro #${id}`;
      await anotarNoRastro(supabase, leadId, `${nomeDoAssistente} anotou o interesse em ${nome} (#${id}).`, { acao: "veiculo_de_interesse", veiculo_id: Number(id) });
      if (!lead.veiculo_id) {
        // Sem principal: o primeiro carro da conversa vira o principal.
        await supabase.from("leads").update({ veiculo_id: Number(id) }).eq("id", leadId).is("veiculo_id", null);
        lead.veiculo_id = Number(id);
      }
    }
  } catch (erro) {
    console.warn("[Atendimento] Carros de interesse não registrados:", erro instanceof Error ? erro.message : erro);
  }
}

// ----------------------------------------------------------------------------
// As fotos do carro, em camadas
// ----------------------------------------------------------------------------

interface FotoQueFoi {
  veiculo_id: string;
  camada: CamadaDaFoto | null;
  midia_url: string;
}

/**
 * As fotos de carro que já foram a este lead (as que falharam não contam), da
 * mais nova à mais velha. Nula quando a leitura falha: sem saber o que já
 * foi, quem chama não manda nada — mandar de novo seria a mesma foto duas
 * vezes no WhatsApp do cliente.
 */
async function fotosJaEnviadas(supabase: Banco, leadId: string, agora: Date): Promise<FotoQueFoi[] | null> {
  const { data, error } = await supabase
    .from("atendimento_mensagens")
    .select("veiculo_id, camada, midia_url, criado_em, situacao")
    .eq("lead_id", leadId)
    .not("veiculo_id", "is", null)
    .neq("situacao", "falhou")
    .order("criado_em", { ascending: false })
    .limit(200);
  if (error) {
    console.warn("[Atendimento] Fotos já enviadas ilegíveis:", error.message);
    return null;
  }
  // A foto que ficou pendente (a Evolution não confirmou a tempo) conta como
  // enviada só enquanto o eco ainda pode chegar; depois, sem eco, ela não
  // saiu — e não pode virar "essas fotos já estão aí em cima".
  const desde = agora.getTime() - JANELA_DO_ECO_MS;
  return ((data ?? []) as Linha[])
    .filter((m) => m.situacao !== "pendente" || new Date(m.criado_em).getTime() >= desde)
    .map((m) => ({
      veiculo_id: String(m.veiculo_id),
      camada: (m.camada ?? null) as CamadaDaFoto | null,
      midia_url: String(m.midia_url ?? ""),
    }));
}

function camadasMostradas(enviadas: readonly FotoQueFoi[], veiculo: string): Set<CamadaDaFoto> {
  return new Set(enviadas.filter((e) => e.veiculo_id === veiculo && e.camada).map((e) => e.camada as CamadaDaFoto));
}

/** O que o estado do prompt diz das fotos: os três carros mais recentes da conversa que ainda estão à venda. */
async function fotosNoEstado(supabase: Banco, leadId: string, base: BaseDaLoja, agora: Date): Promise<string[]> {
  const enviadas = await fotosJaEnviadas(supabase, leadId, agora);
  if (!enviadas || enviadas.length === 0) return [];
  const ids = [...new Set(enviadas.map((e) => e.veiculo_id))].filter((id) => base.fotos?.[id]).slice(0, 3);
  if (ids.length === 0) return [];
  const classificadas = await lerFotosClassificadas(supabase, await lojaDoAtendimento(supabase), ids);
  return ids.map((id) =>
    linhaDasFotosNoEstado({ id, nome: base.fotos![id].nome }, classificadas.get(id) ?? [], camadasMostradas(enviadas, id)),
  );
}

/**
 * A legenda que vai com a foto: a descrição da classificação, sem link e —
 * com o preço desligado — sem valor em dinheiro (o modelo de visão pode ter
 * lido a placa de preço no para-brisa).
 */
function legendaSegura(foto: FotoClassificada, informarPreco: boolean): string {
  const legenda = legendaDaFoto(foto);
  if (!legenda) return "";
  if (!informarPreco && valoresEmDinheiro(legenda, { numerosSoltos: true }).length > 0) return "";
  return semLinks(legenda);
}

/**
 * Manda as fotos que o modelo pediu, em camadas.
 *
 * Primeiro PLANEJA, depois envia — e sempre fecha: o modelo já escreveu
 * "Olha ele aqui 👇", e o cliente não pode ficar com a frase pendurada.
 *
 *   1. O carro precisa estar à venda (na base); senão, "a equipe manda".
 *   2. Sem saber o que já foi à conversa (a leitura falhou), nada sai.
 *   3. Foto ainda não classificada é classificada agora — se couber no prazo.
 *   4. As fotos da camada, sem repetir (`escolherFotos`). Faltando as de fora
 *      e havendo fotos ainda não separadas (o modelo de visão caiu, ou não
 *      terminou), vão essas, em ordem — nunca uma marcada "não mandar".
 *   5. Camada que já foi inteira: "essas já estão aí em cima" e o que sobrou.
 *      Camada que o carro não tem: "a equipe manda".
 *   6. A oferta da próxima camada só quando a camada saiu inteira agora.
 *
 * Nenhuma foto começa a sair depois do `prazo`: o resto do tempo da função é
 * da entrega e da gravação.
 */
async function mandarFotos(
  supabase: Banco,
  ctx: {
    leadId: string;
    telefone: string;
    pedido: PedidoDeFotos;
    base: BaseDaLoja;
    config: ConfigDoAtendimento;
    evolution: ConfigDaEvolution;
    deps: Dependencias;
    atendimentoId: string | null;
    prazo: number;
  },
): Promise<{ fotos: number; falhas: number }> {
  const { pedido, config, deps } = ctx;
  const relogio = relogioDe(deps);
  const veiculo = pedido.veiculo;
  const camada = pedido.camada;
  const enviar = (texto: string, midia?: Envio["midia"]) =>
    enviarAoCliente(
      supabase,
      { leadId: ctx.leadId, telefone: ctx.telefone, texto, gatilho: "resposta", autor: "assistente", autorNome: config.nome_do_assistente, atendimentoId: ctx.atendimentoId, midia },
      ctx.evolution,
      deps,
      !midia,
    );

  const carro = ctx.base.fotos?.[veiculo];
  if (!carro) {
    console.warn("[Atendimento] O modelo pediu fotos de um carro fora do estoque:", veiculo);
    await enviar(SEM_FOTO_DO_CARRO);
    await anotarNoRastro(supabase, ctx.leadId, `O cliente pediu fotos ${pedidoDeFotosLegivel(pedido, null)}, que não está à venda: a equipe pode mandar.`, {
      acao: "fotos_pedidas",
      veiculo,
      camada,
    });
    return { fotos: 0, falhas: 0 };
  }
  const enviadas = await fotosJaEnviadas(supabase, ctx.leadId, deps.agora ?? new Date());
  if (!enviadas) {
    await enviar(FOTOS_FORA_DO_AR);
    return { fotos: 0, falhas: 0 };
  }

  const loja = await lojaDoAtendimento(supabase);
  let classificadas = (await lerFotosClassificadas(supabase, loja, [veiculo])).get(veiculo) ?? [];
  const visao = visaoDe(deps);
  const sobra = ctx.prazo - relogio();
  if (visao && loja && sobra >= 45_000 && carro.urls.some((u) => !classificadas.some((f) => f.url === u))) {
    const r = await classificarCarro(supabase, { id: veiculo, ...carro }, classificadas, {
      modelo: visao,
      loja,
      transporte: deps.transporte,
      timeoutMs: ESPERA_DA_CLASSIFICACAO_NA_CONVERSA_MS,
      relogio,
      prazo: ctx.prazo - 15_000,
    });
    classificadas = r.fotos;
    if (r.novas > 0) deps.aoClassificarFotos?.();
    if (r.motivo) console.warn("[Atendimento] Classificação na conversa incompleta:", r.motivo);
  }

  const jaEnviadas = new Set(enviadas.map((e) => e.midia_url));
  const mostradas = camadasMostradas(enviadas, veiculo);
  const vistas = new Set(classificadas.map((f) => f.url));
  const naoSeparadas = carro.urls.filter((u) => !vistas.has(u) && !jaEnviadas.has(u));
  const temCamadas = classificadas.some((f) => f.aproveitavel);

  // O plano.
  let plano: { url: string; legenda: string; camada: CamadaDaFoto | null }[] = [];
  let fechamento: string | null = null;
  const escolhidas = escolherFotos(classificadas, camada, jaEnviadas);
  if (escolhidas.length > 0) {
    plano = escolhidas.map((f) => ({ url: f.url, legenda: legendaSegura(f, config.informar_preco), camada }));
  } else if (naoSeparadas.length > 0 && (camada === "externa" || !temCamadas)) {
    plano = fotosDaGaleria(naoSeparadas, new Set()).map((url) => ({ url, legenda: "", camada: null }));
  } else if (mostradas.has(camada)) {
    fechamento = fotosJaMostradas(ofertaDepoisDasFotos(classificadas, mostradas));
  } else if (naoSeparadas.length > 0) {
    // A foto pedida pode estar entre as que o modelo ainda não separou.
    fechamento = fotosAindaNaoSeparadas(camada);
  } else {
    fechamento = semFotoDaCamada(camada);
  }

  // O envio, dentro do prazo.
  let fotos = 0;
  let falhas = 0;
  let incertas = 0;
  for (const p of plano) {
    if (relogio() > ctx.prazo) break;
    const r = await enviar(p.legenda, { url: p.url, veiculoId: veiculo, camada: p.camada });
    if (r.ok) fotos += 1;
    else if (r.incerto) incertas += 1;
    else falhas += 1;
  }
  if (plano.length > 0) {
    if (incertas > 0) {
      // A Evolution demorou: as fotos podem estar chegando. Nem "não consegui"
      // nem oferta — o cliente vê o que chegou e pede o resto.
      fechamento = null;
    } else if (fotos === 0) {
      fechamento = FOTOS_FORA_DO_AR;
    } else if (fotos === plano.length) {
      if (plano[0].camada) {
        mostradas.add(camada);
        fechamento = ofertaDepoisDasFotos(classificadas, mostradas);
      } else {
        fechamento = naoSeparadas.length > plano.length ? MAIS_FOTOS_DA_GALERIA : null;
      }
    }
    // Saiu só parte (prazo ou Evolution): sem oferta — o resto vai no próximo pedido.
  }
  if (fechamento) await enviar(fechamento);
  // "A nossa equipe consegue te mandar" é promessa da equipe: fica no rastro
  // do lead, para quem abrir saber que o cliente está esperando foto.
  if (fechamento && [SEM_FOTO_DO_CARRO, FOTOS_FORA_DO_AR, semFotoDaCamada(camada), fotosAindaNaoSeparadas(camada)].includes(fechamento)) {
    await anotarNoRastro(
      supabase,
      ctx.leadId,
      `O cliente pediu fotos ${pedidoDeFotosLegivel(pedido, carro.nome)} e o assistente não conseguiu mandar: a equipe pode mandar.`,
      { acao: "fotos_pedidas", veiculo, camada },
    );
  }
  return { fotos, falhas };
}

/**
 * A rodada das fotos: classifica, até o fim do orçamento de tempo, as fotos
 * do estoque que ainda não foram vistas. Chamada pela rota
 * `/api/atendimento/fotos`, que o workflow da rodada do n8n aciona.
 */
export async function classificarFotosDoEstoque(supabase: Banco, deps: Dependencias = {}): Promise<ResultadoDaClassificacao> {
  const modelo = visaoDe(deps);
  const vazio = { carros_na_fila: 0, carros_classificados: 0, fotos_classificadas: 0, falhas: 0, restantes: 0 };
  if (!modelo) return { ok: false, motivo: "falta DEEPSEEK_API_KEY na Vercel", ...vazio };
  const loja = await lojaDoAtendimento(supabase);
  if (!loja) return { ok: false, motivo: "loja ilegível (org_padrao)", ...vazio };
  const base = await carregarBase(deps, false);
  const carros = Object.entries(base.fotos ?? {})
    .map(([id, c]) => ({ id, nome: c.nome, urls: c.urls }))
    .filter((c) => c.urls.length > 0);
  return classificarFotosPendentes(supabase, carros, {
    modelo,
    loja,
    transporte: deps.transporte,
    relogio: relogioDe(deps),
    orcamentoMs: ORCAMENTO_DA_CLASSIFICACAO_MS,
  });
}

async function registrarRetrato(
  supabase: Banco,
  leadId: string,
  aquecimento: Aquecimento,
  ficha: FichaDoLead,
  sinais: SinaisDaConversa,
  origem: "conversa" | "cadencia" | "painel",
  modelo: string | null,
  uso: UsoDoModelo | null,
): Promise<void> {
  const loja = await lojaDoAtendimento(supabase);
  const { error } = await supabase.from("atendimento_qualificacoes").insert({
    ...(loja ? { org_id: loja } : {}),
    lead_id: leadId,
    aquecimento: aquecimento.pontos,
    temperatura: aquecimento.temperatura,
    motivos: aquecimento.motivos,
    ficha,
    sinais,
    origem,
    modelo,
    tokens_entrada: uso?.entrada ?? 0,
    tokens_cache: Math.min(uso?.entradaEmCache ?? 0, uso?.entrada ?? 0),
    tokens_saida: uso?.saida ?? 0,
  });
  if (error) console.warn("[Atendimento] Retrato não gravado:", error.message);
}

// ----------------------------------------------------------------------------
// 3. A entrega ao vendedor
// ----------------------------------------------------------------------------

/** O vendedor do rodízio: Comercial ativo, com WhatsApp, menos leads abertos. */
async function vendedorDoRodizio(supabase: Banco, equipe: readonly PessoaDaEquipe[]): Promise<PessoaDaEquipe | null> {
  const candidatos = equipe.filter((p) => p.papeis.includes("comercial") && p.whatsapp);
  if (candidatos.length === 0) return null;
  const { data } = await supabase
    .from("leads")
    .select("responsavel")
    .in("responsavel", candidatos.map((c) => c.nome))
    .is("desfecho", null);
  const carga = new Map<string, number>();
  for (const l of (data ?? []) as Linha[]) {
    const nome = String(l.responsavel ?? "").trim();
    carga.set(nome, (carga.get(nome) ?? 0) + 1);
  }
  return [...candidatos].sort((a, b) => (carga.get(a.nome) ?? 0) - (carga.get(b.nome) ?? 0) || a.nome.localeCompare(b.nome, "pt-BR"))[0];
}

/**
 * As etiquetas que o assistente põe (só acrescenta), pela função do banco que
 * só a chave de serviço chama. Nunca lança nem segura a conversa: banco sem a
 * migração 20261025120000 só vai ao log.
 */
async function etiquetarPeloAssistente(supabase: Banco, leadId: string, etiquetas: string[], autor: string): Promise<void> {
  if (etiquetas.length === 0) return;
  try {
    const { error } = await supabase.rpc("etiquetar_lead_pelo_sistema", { p_lead: leadId, p_incluir: etiquetas, p_autor: autor });
    if (error) console.warn("[Atendimento] Etiquetas do assistente não gravadas:", error.message);
  } catch (erro) {
    console.warn("[Atendimento] Etiquetas do assistente não gravadas:", erro instanceof Error ? erro.message : String(erro));
  }
}

/**
 * Leva o lead para a etapa de visita — só para a frente, só lead aberto, só
 * se o funil tem a etapa ativa (o funil é editável). A mesma régua do
 * "Chegou na loja". A troca de etapa grava o rastro pelo gatilho do banco,
 * e é esse rastro que o envio ao Meta lê. Nunca lança.
 */
async function moverParaVisita(supabase: Banco, lead: Linha): Promise<boolean> {
  try {
    if (lead.desfecho) return false;
    const { data: etapas, error } = await supabase.from("funil_etapas").select("chave, tipo, ordem, ativa");
    if (error) return false;
    const lista = (etapas ?? []) as Linha[];
    const visita = lista.find((e) => e.chave === ETAPA_DE_VISITA);
    if (!visita || visita.ativa !== true || visita.tipo !== "aberta") return false;
    const atual = lista.find((e) => e.chave === lead.situacao);
    if (atual && (atual.tipo !== "aberta" || Number(atual.ordem) >= Number(visita.ordem))) return false;
    const { data: movidos, error: erroAoMover } = await supabase
      .from("leads")
      .update({ situacao: ETAPA_DE_VISITA })
      .eq("id", String(lead.id))
      .eq("situacao", lead.situacao)
      .is("desfecho", null)
      .select("id");
    if (erroAoMover) {
      console.error("[Atendimento] Lead não foi para a Visita:", erroAoMover.message);
      return false;
    }
    return ((movidos ?? []) as Linha[]).length > 0;
  } catch {
    return false;
  }
}

async function entregarAoVendedor(
  supabase: Banco,
  lead: Linha,
  motivo: MotivoDaEntrega | "painel",
  aquecimento: Aquecimento,
  ficha: FichaDoLead,
  config: ConfigDoAtendimento,
  evolution: ConfigDaEvolution,
  deps: Dependencias,
  agora: Date,
  /** A frase da passagem ao cliente. Só para quem já escreveu para a loja. */
  avisarCliente: boolean,
  /** O cliente parou de responder e a rodada o passa ("Oi", não "Perfeito"). */
  opcoes: { retomada?: boolean } = {},
): Promise<void> {
  const leadId = String(lead.id);
  const equipe = await lerEquipe(supabase);
  let responsavel = String(lead.responsavel ?? "").trim() || null;

  // Reclamação e pós-venda não entram no rodízio (2026-10-21): sem dono, o
  // caso vai a quem distribui e ao gestor, que escolhem quem cuida — e o
  // gestor fica sabendo da reclamação.
  if (!responsavel && config.distribuicao === "rodizio" && motivo !== "pos_venda") {
    const escolhido = await vendedorDoRodizio(supabase, equipe);
    if (escolhido) {
      const { data: gravado } = await supabase
        .from("leads")
        .update({ responsavel: escolhido.nome })
        .eq("id", leadId)
        .is("responsavel", null)
        .select("id");
      if (gravado && (gravado as Linha[]).length > 0) responsavel = escolhido.nome;
    }
  }

  const vendedor = responsavel ? equipe.find((p) => p.nome === responsavel) ?? null : null;
  const equipeDisponivel = podeAvisarAEquipe(agora);
  if (avisarCliente) {
    const passagem = mensagemDePassagemAoCliente({
      nomeDoCliente: lead.nome,
      vendedor: vendedor ? { nome: vendedor.nome, whatsapp: vendedor.whatsapp } : null,
      equipeDisponivel,
      comFotos: fotosPedidasDaEntrega(lead, agora.toISOString()) !== null,
      visita: motivo === "agendou" ? rotuloDaVisita(ficha) : null,
      simulacao: motivo === "simulacao",
      retomada: opcoes.retomada,
      posVenda: motivo === "pos_venda",
    });
    const atendimento = await garantirAtendimento(supabase, leadId, agora);
    await enviarAoCliente(supabase, { leadId, telefone: lead.telefone, texto: passagem, gatilho: "passagem", autor: "assistente", autorNome: config.nome_do_assistente, atendimentoId: atendimento?.id ?? null }, evolution, deps);
  }

  const marcarEntregue = (gravado: string) =>
    supabase
      .from("leads")
      .update({
        assistente_fase: "entregue",
        entregue_em: agora.toISOString(),
        entregue_motivo: gravado,
        // A entrega é nova: o aviso dela também.
        aviso_de_entrega_em: null,
        aviso_de_entrega_para: null,
        entrega_confirmada_em: null,
        cadencia: null,
        cadencia_passo: 0,
        cadencia_proximo_em: null,
      })
      .eq("id", leadId);
  let { error: erroDaEntrega } = await marcarEntregue(motivo);
  // Banco sem a 20261022120000 só conhece os motivos de antes: a entrega não
  // pode ficar pela metade (o cliente já leu a passagem) por causa disso.
  if (erroDaEntrega && (motivo === "agendou" || motivo === "simulacao")) ({ error: erroDaEntrega } = await marcarEntregue("quente"));
  // Sem a 20261027120000, o banco ainda não conhece `pos_venda`: grava como
  // "pediu um consultor", que é o mais perto — o cabeçalho e a etiqueta dizem o resto.
  if (erroDaEntrega && motivo === "pos_venda") ({ error: erroDaEntrega } = await marcarEntregue("pediu_humano"));
  if (erroDaEntrega) console.error("[Atendimento] Entrega não gravada:", erroDaEntrega.message);

  // A visita marcada vira o próximo passo do lead, com a hora — aparece no
  // card e na Lista do dia do vendedor. Só no lead sem passo: o que a equipe
  // combinou não é trocado pelo assistente.
  const momento = motivo === "agendou" ? momentoDaVisita(ficha) : null;
  if (momento) {
    const { error } = await supabase
      .from("leads")
      .update({
        proximo_passo: `Receber na loja: visita marcada pelo ${config.nome_do_assistente} para ${rotuloDaVisita(ficha)}`.slice(0, 160),
        proximo_passo_vence_em: momento.toISOString(),
        proximo_passo_definido_em: agora.toISOString(),
        proximo_passo_definido_por: config.nome_do_assistente,
      })
      .eq("id", leadId)
      .is("proximo_passo", null);
    if (error) console.error("[Atendimento] Próximo passo da visita não gravado:", error.message);
  }

  // Visita com dia e hora marcada pelo assistente: o lead vai para a etapa
  // Visita (decisão do dono, 20/10). É a etapa que conta como qualificado
  // para o Meta (`ETAPAS_QUALIFICADAS`): o envio de hora em hora a vê.
  const foiParaVisita = momento ? await moverParaVisita(supabase, lead) : false;

  // Pediu condição, fechou visita ou está pronto para simular: negociando.
  await etiquetarPeloAssistente(supabase, leadId, etiquetasDaConversa(ficha, motivo), config.nome_do_assistente);

  const rotulo = motivo === "painel" ? "Entregue pelo painel" : ROTULO_DO_MOTIVO_DA_ENTREGA[motivo];
  const peloRodizio = Boolean(responsavel) && !String(lead.responsavel ?? "").trim();
  await anotarNoRastro(
    supabase,
    leadId,
    `Assistente entregou o lead${responsavel ? ` a ${responsavel}${peloRodizio ? " (rodízio; o administrador pode trocar no quadro)" : ""}` : " (aguardando o responsável)"}: ${rotulo.toLowerCase()} (${aquecimento.pontos}/100).${foiParaVisita ? " O lead foi para a etapa Visita." : ""}`,
    { acao: "entrega", motivo, para: responsavel ?? PARA_QUEM_DISTRIBUI, aquecimento: aquecimento.pontos },
  );

  // O aviso ao vendedor sai agora, ou na abertura da janela pela rodada. Até
  // sair, o SLA segue pausado: o relógio do vendedor começa quando ele sabe.
  if (equipeDisponivel) {
    await avisarEntrega(
      supabase,
      { ...lead, responsavel, assistente_fase: "entregue", entregue_motivo: motivo, entregue_em: agora.toISOString(), aviso_de_entrega_para: null },
      aquecimento,
      ficha,
      equipe,
      evolution,
      deps,
      agora,
    );
  }
}

/**
 * Manda o resumo a quem deve recebê-lo agora: o dono, ou — sem dono — quem
 * distribui e o gestor.
 *
 * RESERVA antes de enviar: o update condicional só acerta se o aviso ainda
 * está como foi lido. O `PATCH` do quadro e a rodada (ou duas rodadas
 * sobrepostas) podem tentar o mesmo resumo; só um envia.
 *
 * Depois, desliga o assistente no SLA — o que só carimba o relógio se ele
 * ainda estava ligado (`assistenteNoSla`). E, no aviso a quem distribui,
 * marca o alerta do lead para o motor do funil não mandar o "lead novo" em
 * dobro na rodada seguinte.
 */
async function avisarEntrega(
  supabase: Banco,
  lead: Linha,
  aquecimento: Pick<Aquecimento, "pontos" | "temperatura" | "motivos">,
  ficha: FichaDoLead,
  equipe: readonly PessoaDaEquipe[],
  evolution: ConfigDaEvolution,
  deps: Dependencias,
  agora: Date,
): Promise<{ para: string; enviados: number; reservado: boolean }> {
  const leadId = String(lead.id);
  const responsavel = String(lead.responsavel ?? "").trim() || null;
  const para = responsavel ?? PARA_QUEM_DISTRIBUI;
  const lido = lead.aviso_de_entrega_para ?? null;

  const reserva = supabase
    .from("leads")
    .update({ aviso_de_entrega_em: agora.toISOString(), aviso_de_entrega_para: para, entrega_confirmada_em: null })
    .eq("id", leadId);
  const { data: reservado } = await (lido === null ? reserva.is("aviso_de_entrega_para", null) : reserva.eq("aviso_de_entrega_para", lido)).select("id");
  if (!reservado || (reservado as Linha[]).length === 0) return { para, enviados: 0, reservado: false };

  const motivo = (lead.entregue_motivo ?? "quente") as MotivoDaEntrega | "painel";
  const dados = {
    motivo,
    lead: { nome: lead.nome, telefone: lead.telefone, canal: lead.canal },
    ficha,
    aquecimento,
    resumo: lead.resumo_ia ? semLinks(lead.resumo_ia) : null,
    origem: origemLegivel(lead),
    linkDoLead: linkDe(deps, leadId),
    fotosPedidas: fotosPedidasDaEntrega(lead, lead.entregue_em ?? null),
  };

  let destinatarios: PessoaDaEquipe[];
  if (responsavel) {
    const dono = equipe.find((p) => p.nome === responsavel);
    destinatarios = dono?.whatsapp ? [dono] : [];
  } else {
    const distribuem = equipe.filter((p) => p.papeis.includes("admin") && p.papeis.includes("comercial") && p.whatsapp);
    const gestores = equipe.filter((p) => p.papeis.includes("gestor") && p.whatsapp && !distribuem.some((d) => d.whatsapp === p.whatsapp));
    destinatarios = [...distribuem, ...gestores];
  }

  let enviados = 0;
  const texto = mensagemDeEntrega({ ...dados, para: responsavel ? "vendedor" : "distribuir" });
  for (const pessoa of destinatarios) {
    const r = await avisarEquipe(pessoa.whatsapp!, texto, evolution, deps);
    if (r.ok) enviados += 1;
    else console.warn("[Atendimento] Resumo da entrega não saiu para", pessoa.nome, r.motivo);
  }

  if (enviados === 0) {
    await alertar(
      deps,
      "atendimento-entrega-sem-destinatario",
      `Lead entregue pelo assistente sem ninguém avisado (${responsavel ? `${responsavel} sem WhatsApp no cadastro, ou o envio falhou` : "sem administrador nem gestor com WhatsApp, ou o envio falhou"}). Abra o lead no painel.`,
    );
  } else if (!responsavel) {
    await supabase
      .from("leads")
      .update({ alertado_em: agora.toISOString(), alertas: Number(lead.alertas ?? 0) + 1 })
      .eq("id", leadId);
  }
  await assistenteNoSla(supabase, leadId, false, agora);
  return { para, enviados, reservado: true };
}

/**
 * O resumo que ainda não chegou a quem deve: o aviso que esperou o horário
 * (`aviso_de_entrega_para` nulo), ou o dono que o administrador escolheu
 * depois de o resumo ir a quem distribui. Chamado pela rodada e, para não
 * esperar por ela, pelo `PATCH /api/leads/gerenciar` quando o dono muda.
 *
 * Não reenvia depois de uma transferência do funil: o vendedor que recebeu o
 * resumo e foi trocado pelo motor tem o aviso de transferência dele, e o
 * relógio do novo dono é o do funil.
 */
export async function avisarEntregaPendente(
  supabase: Banco,
  leadId: string,
  deps: Dependencias = {},
  /**
   * `trocaManual`: o administrador trocou o dono no quadro (decisão do dono de
   * 20/10/2026: rodízio automático, com o administrador podendo mudar). O dono
   * novo recebe o resumo mesmo que o rodízio já tenha avisado outro vendedor —
   * desde que a entrega seja recente (7 dias).
   */
  opcoes: { trocaManual?: boolean } = {},
): Promise<{ avisado: boolean; motivo?: string }> {
  const agora = deps.agora ?? new Date();
  // Leitura que falha (inclusive antes da migração, sem as colunas) não é
  // erro de quem trocou o dono no quadro: não há resumo a mandar.
  const lead = await lerLead(supabase, leadId).catch(() => null);
  if (!lead || lead.assistente_fase !== "entregue" || lead.desfecho) return { avisado: false, motivo: "fora_da_entrega" };
  const devido = String(lead.responsavel ?? "").trim() || PARA_QUEM_DISTRIBUI;
  const avisado = lead.aviso_de_entrega_para ?? null;
  if (avisado === devido) return { avisado: false, motivo: "ja_avisado" };
  const recente = lead.entregue_em && agora.getTime() - new Date(lead.entregue_em).getTime() <= JANELA_DA_ENTREGA_PENDENTE_MS;
  const trocaDoAdministrador = opcoes.trocaManual === true && recente && String(lead.responsavel ?? "").trim() !== "";
  if (avisado !== null && avisado !== PARA_QUEM_DISTRIBUI && !trocaDoAdministrador) return { avisado: false, motivo: "ja_avisado" };
  if (!podeAvisarAEquipe(agora)) return { avisado: false, motivo: "fora_do_horario" };
  const evolution = evolutionDe(deps);
  if (!evolution) return { avisado: false, motivo: motivoSemEvolution() };
  const equipe = await lerEquipe(supabase);
  const ficha = fichaDoLead(lead);
  const r = await avisarEntrega(
    supabase,
    lead,
    {
      pontos: Number(lead.aquecimento ?? 0),
      temperatura: lead.temperatura ?? "frio",
      motivos: Array.isArray(lead.qualificacao?.motivos) ? lead.qualificacao.motivos : [],
    },
    ficha,
    equipe,
    evolution,
    deps,
    agora,
  );
  if (!r.reservado) return { avisado: false, motivo: "ja_avisado" };
  return r.enviados > 0 ? { avisado: true } : { avisado: false, motivo: "sem_destinatario" };
}

// ----------------------------------------------------------------------------
// 4. A rodada — entregas pendentes, respostas travadas e cadências
// ----------------------------------------------------------------------------

export interface ToqueDaRodada {
  lead_id: string;
  cadencia: NomeDaCadencia;
  passo: number;
  mensagem?: string;
  enviado?: boolean;
  motivo?: string;
}

export interface ResultadoDaRodada {
  ativo: boolean;
  reservado: boolean;
  entregas: { lead_id: string; avisado: boolean; motivo?: string }[];
  /** Leads devolvidos à equipe: resposta travada, cadência que acabou, assistente desligado. */
  devolvidos: { lead_id: string; motivo: string }[];
  toques: ToqueDaRodada[];
  suprimidos: { lead_id: string; motivo: MotivoSemToque | "sem_conversa" | "outra_rodada"; texto: string }[];
  /** Os leads da base parada que entraram na cadência nesta rodada (ou entrariam, na prévia). */
  base: { lead_id: string; cadencia: NomeDaCadencia }[];
  falhas: number;
}

export async function executarRodada(
  supabase: Banco,
  opcoes: { reservar: boolean },
  deps: Dependencias = {},
): Promise<ResultadoDaRodada> {
  const agora = deps.agora ?? new Date();
  const relogio = relogioDe(deps);
  const inicio = relogio();
  const resultado: ResultadoDaRodada = { ativo: false, reservado: opcoes.reservar, entregas: [], devolvidos: [], toques: [], suprimidos: [], base: [], falhas: 0 };
  const { config, legivel } = await lerConfigDoAtendimento(supabase);
  if (!config.ativo) {
    // Desligado por fora (ou a rota não conseguiu liberar): os leads que
    // estavam com o assistente voltam para a equipe. Só com a configuração
    // LIDA dizendo "desligado": uma leitura que falhou uma vez não solta todos
    // os leads que esperam a cadência — a mensagem que chegar neste meio-tempo
    // já devolve o lead dela.
    if (opcoes.reservar && legivel) {
      const n = await liberarLeadsDoAssistente(supabase, { ...deps, agora });
      if (n > 0) resultado.devolvidos.push({ lead_id: "*", motivo: `${n} lead(s) liberados: o assistente está desligado` });
    }
    return resultado;
  }
  resultado.ativo = true;

  // As entregas cujo aviso ainda não chegou a quem deve.
  const { data: entregues } = await supabase
    .from("leads")
    .select("id, responsavel, aviso_de_entrega_para")
    .eq("assistente_fase", "entregue")
    .is("desfecho", null)
    .gte("entregue_em", new Date(agora.getTime() - JANELA_DA_ENTREGA_PENDENTE_MS).toISOString())
    .limit(50);
  for (const l of (entregues ?? []) as Linha[]) {
    const devido = String(l.responsavel ?? "").trim() || PARA_QUEM_DISTRIBUI;
    const avisado = l.aviso_de_entrega_para ?? null;
    if (avisado === devido || (avisado !== null && avisado !== PARA_QUEM_DISTRIBUI)) continue;
    if (!opcoes.reservar) {
      resultado.entregas.push({ lead_id: String(l.id), avisado: false, motivo: "previa" });
      continue;
    }
    const r = await avisarEntregaPendente(supabase, String(l.id), { ...deps, agora });
    resultado.entregas.push({ lead_id: String(l.id), ...r });
    if (!r.avisado && r.motivo === "sem_destinatario") resultado.falhas += 1;
  }

  // Os leads com o assistente e sem toque marcado — os que a cadência não
  // cobre. Dois casos voltam para a equipe:
  //   - a resposta travou: mensagem do cliente sem resposta há mais de dez
  //     minutos (a função morreu no meio, o n8n não chamou);
  //   - a conversa parou e não há cadência para retomar (a cadência do
  //     silêncio está desligada): um dia depois da última mensagem.
  const { data: semToque } = await supabase
    .from("leads")
    .select("id, assistente_fase, respondendo_desde")
    .in("assistente_fase", FASES_COM_O_ASSISTENTE)
    .is("desfecho", null)
    .is("cadencia_proximo_em", null)
    .limit(100);
  for (const l of (semToque ?? []) as Linha[]) {
    if (relogio() - inicio > ORCAMENTO_DA_RODADA_MS) break;
    if (l.respondendo_desde && agora.getTime() - new Date(l.respondendo_desde).getTime() < VALIDADE_DA_TRAVA_MS) continue;
    const ultima = (await lerConversa(supabase, String(l.id), 1))[0];
    const idade = ultima ? agora.getTime() - new Date(ultima.criado_em).getTime() : Infinity;
    let motivo: string | null = null;
    if (l.assistente_fase === "qualificando" && ultima?.direcao === "entrada") {
      if (idade >= RESPOSTA_ATRASADA_MS) motivo = "resposta_travada";
    } else if (idade >= FOLGA_DEPOIS_DO_ULTIMO_TOQUE_MS) {
      motivo = "sem_cadencia";
    }
    if (!motivo) continue;
    resultado.devolvidos.push({ lead_id: String(l.id), motivo });
    if (!opcoes.reservar) continue;
    await devolverAoHumano(
      supabase,
      String(l.id),
      agora,
      motivo === "resposta_travada" ? "o assistente não respondeu a tempo" : "o cliente parou de responder e não há cadência para retomar",
    );
    if (motivo === "resposta_travada") resultado.falhas += 1;
  }

  // As cadências vencidas.
  const { data: vencidos } = await supabase
    .from("leads")
    .select(COLUNAS_DO_LEAD)
    .lte("cadencia_proximo_em", agora.toISOString())
    .is("desfecho", null)
    .order("cadencia_proximo_em", { ascending: true })
    .limit(TOQUES_POR_RODADA);
  const evolution = evolutionDe(deps);
  const modelo = modeloDe(deps, config);
  let base: BaseDaLoja | null = null;

  for (const lead of (vencidos ?? []) as Linha[]) {
    // O orçamento: a função tem 60 s, e cada toque pode levar dezenas. O que
    // não coube fica para a próxima rodada (o passo só anda quando reservado).
    if (relogio() - inicio > ORCAMENTO_DA_RODADA_MS) break;
    const leadId = String(lead.id);

    // O lead quente — ou pronto, segurado enquanto o cliente pedia mais — que
    // parou de responder vai ao vendedor, e não ganha toque. A passagem fala
    // com o cliente: só no horário da loja (fora dele, espera).
    const comOAssistente = lead.assistente_fase === "qualificando" && !lead.optout_em;
    const prontoSegurado = comOAssistente ? prontidao(fichaDoLead(lead), agora, { nomeNoWhatsApp: lead.nome }).pronto : null;
    const quente = comOAssistente && (Boolean(prontoSegurado) || (lead.temperatura && temperaturaAlcanca(lead.temperatura, config.avisar_a_partir)));
    if (quente) {
      if (!dentroDoExpediente(agora)) {
        resultado.suprimidos.push({ lead_id: leadId, motivo: "fora_do_expediente", texto: MOTIVO_SEM_TOQUE.fora_do_expediente });
        continue;
      }
      if (!opcoes.reservar) {
        resultado.entregas.push({ lead_id: leadId, avisado: false, motivo: "previa" });
        continue;
      }
      if (!evolution) {
        resultado.entregas.push({ lead_id: leadId, avisado: false, motivo: motivoSemEvolution() });
        resultado.falhas += 1;
        continue;
      }
      // A reserva: só quem acerta a linha como foi lida entrega.
      const { data: reservado } = await supabase
        .from("leads")
        .update({ cadencia: null, cadencia_passo: 0, cadencia_proximo_em: null })
        .eq("id", leadId)
        .eq("assistente_fase", "qualificando")
        .eq("cadencia_proximo_em", lead.cadencia_proximo_em)
        .select("id");
      if (!reservado || (reservado as Linha[]).length === 0) {
        resultado.suprimidos.push({ lead_id: leadId, motivo: "outra_rodada", texto: "Outra rodada já pegou este lead." });
        continue;
      }
      const aquecimento = { pontos: Number(lead.aquecimento ?? 0), temperatura: lead.temperatura, motivos: lead.qualificacao?.motivos ?? [] } as Aquecimento;
      const motivo = prontoSegurado ?? "quente";
      await entregarAoVendedor(supabase, lead, motivo, aquecimento, fichaDoLead(lead), config, evolution, deps, agora, true, { retomada: true });
      resultado.entregas.push({ lead_id: leadId, avisado: true, motivo: prontoSegurado ? `${prontoSegurado}_parou_de_responder` : "quente_parou_de_responder" });
      continue;
    }

    const decisao = decidirToque(lead as unknown as LeadNaCadencia, agora, config.cadencias);
    if (!decisao.tocar) {
      resultado.suprimidos.push({ lead_id: leadId, motivo: decisao.motivo, texto: MOTIVO_SEM_TOQUE[decisao.motivo] });
      if (!opcoes.reservar || ["fora_do_expediente", "ainda_nao"].includes(decisao.motivo)) continue;
      // A cadência acabou (ou foi desligada) sem o cliente responder: o lead
      // volta para a equipe — o assistente não fica com ele, e o SLA não fica
      // pausado, para sempre. Fora do assistente, só a cadência sai da fila.
      if (FASES_COM_O_ASSISTENTE.includes(lead.assistente_fase)) {
        const porque = decisao.motivo === "cadencia_desligada" ? "a cadência foi desligada" : "a cadência terminou sem resposta do cliente";
        await devolverAoHumano(supabase, leadId, agora, porque);
        resultado.devolvidos.push({ lead_id: leadId, motivo: decisao.motivo });
      } else {
        await supabase.from("leads").update({ cadencia: null, cadencia_passo: 0, cadencia_proximo_em: null }).eq("id", leadId);
      }
      continue;
    }
    // Nada automático para quem nunca escreveu deste telefone.
    if (!(await clienteJaEscreveu(supabase, leadId, lead.telefone))) {
      resultado.suprimidos.push({ lead_id: leadId, motivo: "sem_conversa", texto: "O cliente nunca escreveu para a loja deste telefone." });
      if (opcoes.reservar) await supabase.from("leads").update({ cadencia: null, cadencia_passo: 0, cadencia_proximo_em: null }).eq("id", leadId);
      continue;
    }

    const toque: ToqueDaRodada = { lead_id: leadId, cadencia: decisao.cadencia, passo: decisao.passo };
    const ficha = fichaDoLead(lead);
    let texto = preencherModelo(decisao.definicao.modelo, { nome: lead.nome, interesse: ficha.interesse ?? lead.interesse });

    if (!opcoes.reservar) {
      toque.mensagem = texto;
      resultado.toques.push(toque);
      continue;
    }
    if (!evolution) {
      toque.enviado = false;
      toque.motivo = motivoSemEvolution();
      resultado.toques.push(toque);
      resultado.falhas += 1;
      continue;
    }

    // A reserva: o passo anda ANTES do envio, e só se ainda for o lido. Outra
    // rodada que pegou o mesmo lead não acerta a linha e não manda de novo.
    // Depois do último toque, o cliente ainda tem um dia para responder.
    const proximoPasso = decisao.passo + 1;
    const proximoEm =
      vencimentoDoPasso(config.cadencias, decisao.cadencia, proximoPasso, agora) ??
      new Date(agora.getTime() + FOLGA_DEPOIS_DO_ULTIMO_TOQUE_MS).toISOString();
    const { data: reservado } = await supabase
      .from("leads")
      .update({ cadencia_passo: proximoPasso, cadencia_proximo_em: proximoEm })
      .eq("id", leadId)
      .eq("cadencia_passo", decisao.passo)
      .select("id");
    if (!reservado || (reservado as Linha[]).length === 0) {
      resultado.suprimidos.push({ lead_id: leadId, motivo: "outra_rodada", texto: "Outra rodada já pegou este toque." });
      continue;
    }

    let uso: UsoDoModelo | null = null;
    if (modelo) {
      base ??= await carregarBase(deps, config.informar_preco);
      const conversa = await lerConversa(supabase, leadId, 10);
      const chamada = await completarEmJson({
        cfg: modelo,
        mensagens: montarMensagensDoToque({
          instrucoes: montarInstrucoesFixas({ config, ...base }),
          historico: conversa.map((m) => ({
            autor: m.autor,
            autor_nome: m.autor_nome,
            conteudo: m.conteudo,
            texto: m.texto,
            midia_url: m.midia_url,
            veiculo_id: m.veiculo_id,
            camada: m.camada,
          })),
          ficha,
          nomeDoCliente: lead.nome,
          objetivo: decisao.definicao.objetivo,
          modelo: texto,
        }),
        maxTokens: 300,
        transporte: deps.transporte,
      });
      const lida = chamada.ok ? lerToque(chamada.conteudo) : null;
      // O toque também não larga a conversa: sem "fico à disposição".
      const escrita = lida ? semDisposicao(lida) || lida : null;
      if (escrita) {
        const ditos = conversa.filter((m) => m.direcao === "entrada").map((m) => m.texto);
        const vigiado = vigiarPreco([escrita], valoresDoCliente(ficha, ditos), config.informar_preco);
        // Barrado pela trava de preço, fica o modelo pronto (que não tem valor).
        if (vigiado.barrados === 0) texto = escrita;
      }
      uso = chamada.ok ? chamada.uso : null;
    }
    toque.mensagem = texto;

    const atendimento = await garantirAtendimento(supabase, leadId, agora);
    const envio = await enviarAoCliente(supabase, { leadId, telefone: lead.telefone, texto, gatilho: "cadencia", autor: "assistente", autorNome: config.nome_do_assistente, atendimentoId: atendimento?.id ?? null }, evolution, deps);
    toque.enviado = envio.ok;
    if (!envio.ok) {
      toque.motivo = envio.motivo;
      resultado.falhas += 1;
    }
    if (uso) {
      const aquecimento = { pontos: Number(lead.aquecimento ?? 0), temperatura: lead.temperatura ?? "frio", motivos: lead.qualificacao?.motivos ?? [] } as Aquecimento;
      await registrarRetrato(supabase, leadId, aquecimento, ficha, sinaisDoLead(lead), "cadencia", modelo?.modelo ?? null, uso);
    }
    resultado.toques.push(toque);
  }

  // A base parada, por último: os puxados agora recebem o primeiro toque na
  // próxima rodada, e o orçamento desta já foi das cadências em andamento.
  if (config.base.ativa && dentroDoExpediente(agora) && relogio() - inicio <= ORCAMENTO_DA_RODADA_MS) {
    resultado.base = await puxarABase(supabase, config, agora, opcoes.reservar && Boolean(evolution));
  }

  return resultado;
}

/** Quantos leads da base uma rodada puxa: o teto do dia se espalha pelo expediente. */
const BASE_POR_RODADA = 3;

/** Meia-noite de hoje no fuso da loja, em ISO. */
function inicioDoDiaNaLoja(agora: Date): string {
  const dia = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return new Date(`${dia}T00:00:00-03:00`).toISOString();
}

/**
 * A base parada entra na cadência (decisão do dono, 20/10): o lead aberto,
 * nunca pego pelo assistente, sem contato há `dias_parado` dias, que JÁ
 * CONVERSOU com o WhatsApp da loja (pelo Chatwoot ou pelo assistente) — até
 * `por_dia` por dia e `BASE_POR_RODADA` por rodada.
 *
 * Entra como o lead que o cliente deixou no silêncio: follow-up se tem carro
 * de interesse, reativação se não tem, com o primeiro toque já vencido. Se o
 * cliente responder, o assistente qualifica e entrega ao MESMO responsável;
 * se não, a cadência acaba e o lead volta para a equipe, como qualquer outro.
 *
 * Sem `reservar`, só diz quem entraria. Nunca lança.
 */
async function puxarABase(
  supabase: Banco,
  config: ConfigDoAtendimento,
  agora: Date,
  reservar: boolean,
): Promise<{ lead_id: string; cadencia: NomeDaCadencia }[]> {
  try {
    const puxados: { lead_id: string; cadencia: NomeDaCadencia }[] = [];
    const { data: eventosDeHoje } = await supabase
      .from("leads_eventos")
      .select("id, detalhe")
      .eq("tipo", "nota")
      .gte("criado_em", inicioDoDiaNaLoja(agora))
      .limit(1000);
    const jaHoje = ((eventosDeHoje ?? []) as Linha[]).filter((e) => e.detalhe?.acao === "base").length;
    const lote = Math.min(config.base.por_dia - jaHoje, BASE_POR_RODADA);
    if (lote <= 0) return puxados;

    const limite = new Date(agora.getTime() - config.base.dias_parado * 24 * 60 * 60 * 1000).toISOString();
    const { data: candidatos, error } = await supabase
      .from("leads")
      .select("id, nome, telefone, interesse, ultimo_contato_em, created_at")
      .is("desfecho", null)
      .is("optout_em", null)
      .is("assistente_fase", null)
      .is("cadencia", null)
      .not("telefone", "is", null)
      .lt("created_at", limite)
      .or(`ultimo_contato_em.is.null,ultimo_contato_em.lt.${limite}`)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error || !candidatos?.length) return puxados;
    const ids = (candidatos as Linha[]).map((l) => String(l.id));

    // A conversa: a última atividade dela também tem de ser antiga, e ela tem
    // de existir — do Chatwoot (o número da loja de antes) ou do assistente.
    const [doChatwoot, mensagens] = await Promise.all([
      supabase.from("atendimentos").select("lead_id, chatwoot_conversation_id, created_at, updated_at").in("lead_id", ids),
      supabase.from("atendimento_mensagens").select("lead_id, direcao, criado_em").in("lead_id", ids).order("criado_em", { ascending: false }).limit(500),
    ]);
    const conversou = new Set<string>();
    const ultimaAtividade = new Map<string, number>();
    const anotar = (leadId: string, quando: unknown) => {
      const t = typeof quando === "string" ? new Date(quando).getTime() : NaN;
      if (Number.isFinite(t)) ultimaAtividade.set(leadId, Math.max(ultimaAtividade.get(leadId) ?? 0, t));
    };
    for (const a of (doChatwoot.data ?? []) as Linha[]) {
      if (a.chatwoot_conversation_id) conversou.add(String(a.lead_id));
      anotar(String(a.lead_id), a.updated_at ?? a.created_at);
    }
    for (const m of (mensagens.data ?? []) as Linha[]) {
      if (m.direcao === "entrada") conversou.add(String(m.lead_id));
      anotar(String(m.lead_id), m.criado_em);
    }
    const limiteMs = new Date(limite).getTime();

    for (const lead of candidatos as Linha[]) {
      if (puxados.length >= lote) break;
      const leadId = String(lead.id);
      if (!conversou.has(leadId) || (ultimaAtividade.get(leadId) ?? 0) >= limiteMs) continue;
      const cadencia = cadenciaDoSilencio(Boolean(String(lead.interesse ?? "").trim()));
      if (!config.cadencias[cadencia].ativa) continue;
      if (!reservar) {
        puxados.push({ lead_id: leadId, cadencia });
        continue;
      }
      // Só quem acerta a linha como foi lida: outra rodada, ou o vendedor
      // atendendo neste meio-tempo, não ganha um robô por cima.
      const { data: reservado } = await supabase
        .from("leads")
        .update({ assistente_fase: "reaquecendo", cadencia, cadencia_passo: 0, cadencia_proximo_em: agora.toISOString() })
        .eq("id", leadId)
        .is("assistente_fase", null)
        .is("cadencia", null)
        .is("desfecho", null)
        .select("id");
      if (!reservado || (reservado as Linha[]).length === 0) continue;
      await assistenteNoSla(supabase, leadId, true, agora);
      const dias = Math.floor((agora.getTime() - (ultimaAtividade.get(leadId) ?? new Date(String(lead.created_at)).getTime())) / (24 * 60 * 60 * 1000));
      await anotarNoRastro(
        supabase,
        leadId,
        `${config.nome_do_assistente} puxou o lead da base parada (${dias} dias sem contato) para a cadência de ${ROTULO_DA_CADENCIA[cadencia].toLowerCase()}. Se o cliente responder, ele qualifica e devolve ao mesmo responsável.`,
        { acao: "base", cadencia, dias_parado: dias },
      );
      puxados.push({ lead_id: leadId, cadencia });
    }
    return puxados;
  } catch (erro) {
    console.warn("[Atendimento] Base parada não puxada:", erro instanceof Error ? erro.message : String(erro));
    return [];
  }
}

// ----------------------------------------------------------------------------
// 5. O painel
// ----------------------------------------------------------------------------

export type AcaoDoAssistente = "pausar" | "retomar" | "entregar" | "devolver";
export const ACOES_DO_ASSISTENTE: readonly AcaoDoAssistente[] = ["pausar", "retomar", "entregar", "devolver"];

export type ResultadoDoPainel = { ok: true; aviso?: string } | { ok: false; status: number; erro: string };

export type AnexoPreparado = { ok: true; caminho: string; token: string; url: string } | { ok: false; status: number; erro: string };

/**
 * O primeiro passo do anexo do painel (2026-10-20): confere o arquivo (tipo
 * e tamanho que o WhatsApp aceita) e devolve uma URL assinada de upload para
 * a pasta do lead. O navegador sobe o arquivo direto para o bucket — a função
 * da Vercel recusa corpo acima de ~4,5 MB — e depois pede o envio com o
 * caminho (`enviarDoPainel`). Quem chama já conferiu o escopo do lead.
 */
export async function prepararAnexoDoPainel(
  supabase: Banco,
  pedido: { leadId: string; nome: unknown; tipo: unknown; bytes: unknown },
): Promise<AnexoPreparado> {
  const aceito = anexoDoPainel({ tipo: typeof pedido.tipo === "string" ? pedido.tipo : null, bytes: Number(pedido.bytes) });
  if (!aceito.ok) return { ok: false, status: 422, erro: aceito.erro };
  const nome = typeof pedido.nome === "string" ? nomeDoArquivo(pedido.nome) : null;
  const caminho = caminhoDoAnexo(pedido.leadId, crypto.randomUUID(), extensaoDoArquivo(aceito.tipo, nome), "painel-");
  const { data, error } = await supabase.storage.from(BUCKET_DOS_ANEXOS).createSignedUploadUrl(caminho);
  if (error || !data?.token) {
    return { ok: false, status: 503, erro: `Não deu para preparar o anexo: ${error?.message ?? "o bucket não respondeu"}. A migração 20261024120000 já foi aplicada?` };
  }
  return { ok: true, caminho, token: data.token, url: data.signedUrl };
}

/** O que se sabe do anexo que o navegador subiu: o bucket diz, não o navegador. */
async function lerAnexoSubido(
  supabase: Banco,
  caminho: string,
): Promise<{ ok: true; tipo: string; bytes: number } | { ok: false; erro: string }> {
  const [pasta, arquivo] = caminho.split("/");
  const { data, error } = await supabase.storage.from(BUCKET_DOS_ANEXOS).list(pasta, { search: arquivo, limit: 5 });
  if (error) return { ok: false, erro: `o bucket não respondeu: ${error.message}` };
  const objeto = (data ?? []).find((o) => o.name === arquivo);
  if (!objeto) return { ok: false, erro: "o arquivo não chegou ao bucket — envie de novo" };
  const meta = (objeto.metadata ?? {}) as { size?: unknown; mimetype?: unknown };
  return { ok: true, tipo: tipoBase(typeof meta.mimetype === "string" ? meta.mimetype : null), bytes: Number(meta.size) };
}

/**
 * O vendedor escreveu no painel: sai pelo número da loja, conta como
 * atendimento (reinicia o relógio, tira de "Novo") e o assistente sai da
 * conversa até alguém retomar — a régua do manobrAI.
 *
 * Com `anexo` (o caminho que `prepararAnexoDoPainel` deu e o navegador
 * subiu), o texto vira a legenda. O áudio não tem legenda no WhatsApp: o
 * texto sai logo depois, como mensagem.
 */
export async function enviarDoPainel(
  supabase: Banco,
  pedido: { leadId: string; texto: string; autor: string; anexo?: { caminho: unknown; nome?: unknown } | null },
  deps: Dependencias = {},
): Promise<ResultadoDoPainel> {
  const agora = deps.agora ?? new Date();
  const texto = pedido.texto.trim();
  const comAnexo = Boolean(pedido.anexo);
  if (!texto && !comAnexo) return { ok: false, status: 400, erro: "Escreva a mensagem." };
  if (texto.length > 4000) return { ok: false, status: 400, erro: "A mensagem passa de 4000 caracteres." };
  if (comAnexo && texto.length > 1000) return { ok: false, status: 400, erro: "A legenda do anexo passa de 1000 caracteres." };
  if (pedido.anexo && !caminhoDoPainelNoLead(pedido.anexo.caminho, pedido.leadId)) {
    return { ok: false, status: 400, erro: "Anexo inválido para este lead." };
  }
  const evolution = evolutionDe(deps);
  if (!evolution) return { ok: false, status: 503, erro: `O WhatsApp da loja não está ligado ao painel: ${motivoSemEvolution()}.` };
  const lead = await lerLead(supabase, pedido.leadId);
  if (!lead) return { ok: false, status: 404, erro: "Lead não encontrado" };
  if (!lead.telefone) return { ok: false, status: 400, erro: "O lead não tem telefone." };

  let anexo: Envio["anexo"];
  if (pedido.anexo) {
    const caminho = pedido.anexo.caminho as string;
    const subido = await lerAnexoSubido(supabase, caminho);
    if (!subido.ok) return { ok: false, status: 409, erro: `O anexo não saiu: ${subido.erro}.` };
    // O tipo e o tamanho que valem são os do bucket: o navegador pode dizer outro.
    const aceito = anexoDoPainel({ tipo: subido.tipo, bytes: subido.bytes });
    if (!aceito.ok) return { ok: false, status: 422, erro: aceito.erro };
    const { data: assinada, error: erroDaAssinatura } = await supabase.storage
      .from(BUCKET_DOS_ANEXOS)
      .createSignedUrl(caminho, VIDA_DA_URL_DO_ANEXO_S);
    if (erroDaAssinatura || !assinada?.signedUrl) {
      return { ok: false, status: 502, erro: `O anexo não saiu: o bucket não assinou o arquivo (${erroDaAssinatura?.message ?? "sem URL"}).` };
    }
    anexo = {
      url: assinada.signedUrl,
      caminho,
      conteudo: aceito.conteudo,
      tipo: aceito.tipo,
      nome: typeof pedido.anexo.nome === "string" ? nomeDoArquivo(pedido.anexo.nome) : null,
      bytes: subido.bytes,
    };
  }

  const atendimento = await garantirAtendimento(supabase, String(lead.id), agora);
  const base = { leadId: String(lead.id), telefone: lead.telefone, gatilho: "painel" as const, autor: "vendedor" as const, autorNome: pedido.autor, atendimentoId: atendimento?.id ?? null };
  const legendaNoAnexo = anexo && anexo.conteudo !== "audio";
  const r = await enviarAoCliente(supabase, { ...base, texto: legendaNoAnexo ? texto : anexo ? "" : texto, ...(anexo ? { anexo } : {}) }, evolution, deps, false);
  if (!r.ok) return { ok: false, status: 502, erro: `${anexo ? "O anexo" : "A mensagem"} não saiu: ${r.motivo}.` };
  let aviso: string | undefined;
  if (anexo && !legendaNoAnexo && texto) {
    const t = await enviarAoCliente(supabase, { ...base, texto }, evolution, deps, false);
    if (!t.ok) aviso = `O áudio saiu, mas o texto não: ${t.motivo}.`;
  }

  const { error } = await supabase.rpc("registrar_contato_do_lead", { p_lead: lead.id, p_canal: "evolution", p_autor: pedido.autor });
  if (error) console.error("[Atendimento] Contato do painel não registrado:", error.message);
  if (FASES_COM_O_ASSISTENTE.includes(lead.assistente_fase)) {
    await supabase.from("leads").update({ assistente_fase: "pausado", cadencia: null, cadencia_passo: 0, cadencia_proximo_em: null }).eq("id", lead.id);
    await assistenteNoSla(supabase, String(lead.id), false, agora);
    await anotarNoRastro(supabase, String(lead.id), `${pedido.autor} respondeu pelo painel: o assistente saiu da conversa.`, { acao: "pausa", por: "painel" }, pedido.autor);
  }
  return aviso ? { ok: true, aviso } : { ok: true };
}

/**
 * As ações do assistente no painel. As que devolvem o lead ao assistente
 * (`retomar`, `devolver`) têm porteiro: o assistente ligado, as credenciais,
 * o cliente que já escreveu para a loja — senão seriam um jeito de tirar o
 * lead do prazo do funil sem ninguém atender.
 */
export async function mudarAssistente(
  supabase: Banco,
  pedido: { leadId: string; acao: AcaoDoAssistente; autor: string },
  deps: Dependencias = {},
): Promise<ResultadoDoPainel> {
  const agora = deps.agora ?? new Date();
  const lead = await lerLead(supabase, pedido.leadId);
  if (!lead) return { ok: false, status: 404, erro: "Lead não encontrado" };
  if (lead.desfecho) return { ok: false, status: 409, erro: "O lead está encerrado. Reabra antes de mexer no assistente." };
  const leadId = String(lead.id);
  const { config } = await lerConfigDoAtendimento(supabase);

  if (pedido.acao === "pausar") {
    await supabase.from("leads").update({ assistente_fase: "pausado", cadencia: null, cadencia_passo: 0, cadencia_proximo_em: null }).eq("id", leadId);
    await assistenteNoSla(supabase, leadId, false, agora);
    await anotarNoRastro(supabase, leadId, `${pedido.autor} pausou o assistente neste lead.`, { acao: "pausa", por: "painel" }, pedido.autor);
    return { ok: true };
  }

  const evolution = evolutionDe(deps);
  if (!evolution) return { ok: false, status: 503, erro: `O WhatsApp da loja não está ligado ao painel: ${motivoSemEvolution()}.` };
  const escreveu = await clienteJaEscreveu(supabase, leadId, lead.telefone);

  if (pedido.acao === "entregar") {
    const ficha = fichaDoLead(lead);
    const aquecimento = calcularAquecimento(ficha, sinaisDoLead(lead), { pesos: config.pesos, limiares: config.limiares });
    await entregarAoVendedor(supabase, lead, "painel", aquecimento, ficha, config, evolution, deps, agora, escreveu && !lead.optout_em);
    return podeAvisarAEquipe(agora) ? { ok: true } : { ok: true, aviso: "Fora do horário de aviso: o resumo vai ao vendedor na abertura." };
  }

  if (lead.optout_em) {
    return { ok: false, status: 409, erro: "O cliente pediu para não receber mensagens. O assistente não volta a escrever para ele." };
  }
  if (!config.ativo) return { ok: false, status: 409, erro: "O assistente está desligado na configuração." };
  if (!escreveu) {
    return { ok: false, status: 409, erro: "O cliente nunca escreveu para a loja deste telefone: o assistente não começa conversa." };
  }

  if (pedido.acao === "retomar") {
    if (lead.assistente_fase !== "pausado") {
      return { ok: false, status: 409, erro: "Só a conversa pausada volta ao assistente." };
    }
    if (!modeloDe(deps, config)) return { ok: false, status: 503, erro: "Falta DEEPSEEK_API_KEY na Vercel: o assistente não teria como responder." };
    await supabase.from("leads").update({ assistente_fase: "qualificando" }).eq("id", leadId);
    await assistenteNoSla(supabase, leadId, true, agora);
    await anotarNoRastro(supabase, leadId, `${pedido.autor} devolveu a conversa ao assistente.`, { acao: "retomada" }, pedido.autor);
    // A fala do cliente que ficou sem resposta (o modelo tinha caído, alguém
    // pausou no meio): o assistente responde agora, e não na próxima mensagem.
    if ((await pendentesDoCliente(supabase, leadId)).length > 0) {
      const r = await responderAoLead(supabase, { leadId }, deps);
      if (r.acao !== "respondido") return { ok: true, aviso: `O assistente voltou, mas não respondeu a mensagem pendente (${r.detalhe ?? r.acao}).` };
    }
    return { ok: true };
  }

  // devolver — o lead esfriou e o vendedor o passa ao assistente para reaquecer.
  if (!config.cadencias.engajamento.ativa) {
    return { ok: false, status: 409, erro: "A cadência de engajamento está desligada: sem ela o assistente não teria o que fazer com o lead." };
  }
  const proximo = vencimentoDoPasso(config.cadencias, "engajamento", 0, agora);
  await supabase
    .from("leads")
    .update({ assistente_fase: "reaquecendo", cadencia: "engajamento", cadencia_passo: 0, cadencia_proximo_em: proximo })
    .eq("id", leadId);
  await assistenteNoSla(supabase, leadId, true, agora);
  await anotarNoRastro(supabase, leadId, `${pedido.autor} devolveu o lead ao assistente para reaquecer.`, { acao: "devolucao" }, pedido.autor);
  return { ok: true };
}

/**
 * "Classificar o que falta" e "Refazer a classificação" de UM carro, pela aba
 * Fotos do Atendimento IA.
 *
 * Refazer classifica de novo as fotos que o MODELO tinha classificado e só
 * troca cada linha depois de a nova dar certo: com a DeepSeek fora do ar, a
 * classificação antiga fica (apagar antes deixaria o carro sem camadas, e o
 * laudo marcado "não mandar" voltaria à galeria em ordem). A correção à mão
 * nunca é tocada. Com prazo, para caber nos 60 s da rota.
 */
export async function classificarCarroDoEstoque(
  supabase: Banco,
  veiculo: string,
  opcoes: { refazer: boolean },
  deps: Dependencias = {},
): Promise<{ ok: boolean; motivo?: string; fotos_classificadas: number; falhas: number }> {
  const relogio = relogioDe(deps);
  const prazo = relogio() + 45_000;
  const modelo = visaoDe(deps);
  if (!modelo) return { ok: false, motivo: "falta DEEPSEEK_API_KEY na Vercel", fotos_classificadas: 0, falhas: 0 };
  const loja = await lojaDoAtendimento(supabase);
  if (!loja) return { ok: false, motivo: "loja ilegível (org_padrao)", fotos_classificadas: 0, falhas: 0 };
  const base = await carregarBase(deps, false);
  const carro = base.fotos?.[veiculo];
  if (!carro) return { ok: false, motivo: "o carro não está à venda", fotos_classificadas: 0, falhas: 0 };
  const ja = (await lerFotosClassificadas(supabase, loja, [veiculo])).get(veiculo) ?? [];
  const manter = opcoes.refazer ? ja.filter((f) => f.corrigida) : ja;
  const substituir = opcoes.refazer ? new Set(ja.filter((f) => !f.corrigida).map((f) => f.url)) : undefined;
  const r = await classificarCarro(supabase, { id: veiculo, ...carro }, manter, {
    modelo,
    loja,
    transporte: deps.transporte,
    relogio,
    prazo,
    substituir,
  });
  return { ok: true, fotos_classificadas: r.novas, falhas: r.falhas, ...(r.motivo ? { motivo: r.motivo } : {}) };
}
