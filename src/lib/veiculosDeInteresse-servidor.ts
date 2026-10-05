import { after, NextResponse } from "next/server";
import { comEscopoDeLeads, type VisaoDeLeads } from "./escopoDeLeads";
import type { ClienteDaSessao } from "./gestaoDoLead-servidor";
import { ehStaff } from "./permissoes";
import { createServerSupabaseClient } from "./supabase-server";
import {
  AVISO_DE_VEICULOS_INDISPONIVEL,
  CODIGO_DE_VEICULOS_INDISPONIVEL,
  ehVeiculosIndisponivel,
  erroDeVeiculosNaTela,
  opcaoQueOGanhoEscolhe,
  pendenciasAoFechar,
  planejarResolucoes,
  principalComoOpcao,
  semPrincipalValido,
  veiculosDoLeadNaTela,
  type CarroDaOpcao,
  type LinhaDaOpcao,
  type PassoDoPlano,
  type PendenciaDeVeiculo,
  type VeiculoDeInteresse,
} from "./veiculosDeInteresse";

/**
 * A metade de servidor dos veículos de interesse (05/10/2026): as leituras e
 * gravações em `leads_veiculos` que as rotas compartilham. As regras são de
 * `lib/veiculosDeInteresse` (puro); aqui fica o transporte.
 *
 * ---------------------------------------------------------------------------
 * Antes da migração
 * ---------------------------------------------------------------------------
 * Este código vai ao ar antes de `20261005120000_veiculos_de_interesse.sql`.
 * Toda leitura daqui distingue "a tabela ainda não existe"
 * (`ehVeiculosIndisponivel`) de erro: no primeiro caso o lead segue com o
 * carro único de sempre e a resposta leva `veiculos_disponivel: false`; as
 * escritas respondem 503 `veiculos_indisponivel`.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ O que NÃO é atômico
 * ---------------------------------------------------------------------------
 * Escolher um carro são até três gravações (reabrir o escolhido anterior,
 * escolher o novo, apontar `leads.veiculo_id`), e o lote é uma por opção.
 * Vão uma a uma pelo PostgREST: não há função no banco que as junte numa
 * transação. A ordem é a que falha do lado seguro (quem deixa de ser o
 * escolhido primeiro), a reabertura implícita é desfeita se a escolha falhar,
 * e toda resposta de erro diz o que ficou gravado. A saída de verdade é uma
 * função Postgres (`resolver_veiculos_do_lead`); fica pedida ao banco.
 *
 * ---------------------------------------------------------------------------
 * Cliente da sessão
 * ---------------------------------------------------------------------------
 * Como no resto da gestão do lead: a RLS de `leads_veiculos` acompanha a de
 * `leads`, o gatilho carimba o autor pela sessão, e as funções de relatório
 * recusam a chave de serviço. A única escrita sem sessão é a da captura do
 * site (`registrarInteresseDaCaptura`), que recebe o cliente de quem chama.
 */

export const MIGRACAO_DOS_VEICULOS = "20261005120000_veiculos_de_interesse.sql";

export const COLUNAS_DA_OPCAO =
  "id, lead_id, veiculo_id, veiculo_rotulo, veiculo_preco, situacao, motivo_descarte, nota, " +
  "adicionado_por, resolvido_por, criado_em, resolvido_em";

interface ErroDoBanco {
  code?: string;
  message: string;
}

/** O erro do banco como resposta: status, `codigo` e a frase da tela. */
export function respostaDoErroDeVeiculos(erro: unknown, extra: Record<string, unknown> = {}): NextResponse {
  const { status, codigo, erro: frase } = erroDeVeiculosNaTela(erro);
  return NextResponse.json({ error: frase, codigo, ...extra }, { status });
}

export function respostaDeVeiculosIndisponivel(): NextResponse {
  return NextResponse.json(
    { error: AVISO_DE_VEICULOS_INDISPONIVEL, codigo: CODIGO_DE_VEICULOS_INDISPONIVEL },
    { status: 503 },
  );
}

// ---------------------------------------------------------------------------
// Quem pede o relatório
// ---------------------------------------------------------------------------

/**
 * A porta dos relatórios por veículo: equipe ATIVA, qualquer perfil. O
 * relatório é da loja inteira (decisão do dono na migração) e só traz
 * agregados; quem decide de novo é a função no banco (`is_staff(auth.uid())`).
 */
export async function sessaoDaEquipe(): Promise<
  { supabase: ClienteDaSessao; recusa: null } | { supabase: ClienteDaSessao; recusa: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, recusa: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role, papeis, is_active").eq("id", user.id).single();
  if (!ehStaff(profile) || profile?.is_active !== true) {
    return { supabase, recusa: NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 }) };
  }
  return { supabase, recusa: null };
}

// ---------------------------------------------------------------------------
// Ler
// ---------------------------------------------------------------------------

export type LeituraDasOpcoes =
  | { disponivel: true; linhas: LinhaDaOpcao[]; erro: null }
  | { disponivel: false; linhas: null; erro: null }
  | { disponivel: true; linhas: null; erro: ErroDoBanco };

/**
 * As opções de UM lead. Quem chama já conferiu o escopo do lead
 * (`lerLeadNoEscopo`): com a RLS de `leads` ainda aberta à equipe, esta
 * leitura alcançaria as opções de qualquer lead.
 */
export async function lerOpcoesDoLead(supabase: ClienteDaSessao, leadId: string): Promise<LeituraDasOpcoes> {
  const { data, error } = await supabase
    .from("leads_veiculos")
    .select(COLUNAS_DA_OPCAO)
    .eq("lead_id", leadId)
    .order("criado_em", { ascending: true });
  if (error) {
    if (ehVeiculosIndisponivel(error)) return { disponivel: false, linhas: null, erro: null };
    return { disponivel: true, linhas: null, erro: error };
  }
  return { disponivel: true, linhas: (data ?? []) as unknown as LinhaDaOpcao[], erro: null };
}

interface LeadDosVeiculos {
  id?: unknown;
  veiculo_id?: number | string | null;
  interesse?: string | null;
  created_at?: string | null;
  desfecho?: string | null;
}

export interface VeiculosDoLead {
  veiculos_disponivel: boolean;
  veiculos: VeiculoDeInteresse[];
  pendencias_de_veiculo: PendenciaDeVeiculo[];
  avisos: string[];
}

/**
 * `veiculos`, `veiculos_disponivel` e `pendencias_de_veiculo` da resposta, a
 * partir das opções já lidas.
 *
 * `carroPrincipal` é o carro do `leads.veiculo_id`, como o detalhe já o lê
 * (`{ id, nome, km, preco, vendido }`); `null` se ele não está no estoque e
 * `undefined` se não foi lido.
 *
 *   · Tabela ausente: o carro único de sempre como UMA opção (`id: null`), e
 *     `veiculos_disponivel: false`.
 *   · Tabela presente e o principal sem linha: as opções, mais o principal
 *     como opção `id: null` na frente (o carro não some da tela).
 *   · Leitura que falhou de verdade: o principal como opção `id: null` (o
 *     carro do lead não some da tela por causa de um erro) e a frase em
 *     `avisos`. Lista vazia calada diria "este lead não tem carro".
 */
export async function montarVeiculosDoLead(
  supabase: ClienteDaSessao,
  lead: LeadDosVeiculos,
  leitura: LeituraDasOpcoes,
  carroPrincipal: { id?: unknown; nome?: unknown; km?: unknown; preco?: unknown; vendido?: unknown } | null | undefined,
): Promise<VeiculosDoLead> {
  const avisos: string[] = [];
  const principalLido: (CarroDaOpcao & { nome?: string | null }) | null = carroPrincipal
    ? {
        id: carroPrincipal.id as number | string,
        nome: typeof carroPrincipal.nome === "string" ? carroPrincipal.nome : null,
        quilometragem: carroPrincipal.km as number | null,
        preco: carroPrincipal.preco as number | null,
        vendido: carroPrincipal.vendido === true,
      }
    : null;
  // `undefined`: o carro não foi lido, e a opção não afirma se está no estoque.
  const comoOpcao = () =>
    principalComoOpcao(lead, principalLido, carroPrincipal === undefined ? null : principalLido ? [principalLido] : []);

  if (!leitura.disponivel) {
    const unica = comoOpcao();
    return { veiculos_disponivel: false, veiculos: unica ? [unica] : [], pendencias_de_veiculo: [], avisos };
  }
  if (leitura.erro) {
    avisos.push(`Não deu para ler os veículos de interesse: ${leitura.erro.message}`);
    const unica = comoOpcao();
    return { veiculos_disponivel: true, veiculos: unica ? [unica] : [], pendencias_de_veiculo: [], avisos };
  }

  const linhas = leitura.linhas;
  let carros: CarroDaOpcao[] | null = [];
  const ids = [...new Set(linhas.map((l) => Number(l.veiculo_id)))].filter((n) => Number.isSafeInteger(n));
  if (ids.length > 0) {
    // Só coluna pública, e escrita aqui mesmo: a varredura de
    // `tests/documento-e-custo-so-para-a-equipe` confere o literal.
    const lidos = await supabase.from("estoque_motors").select("id, quilometragem, preco, vendido").in("id", ids);
    if (lidos.error) {
      avisos.push(`Não deu para ler os carros das opções no estoque: ${lidos.error.message}`);
      carros = null;
    } else {
      carros = (lidos.data ?? []) as unknown as CarroDaOpcao[];
    }
  }

  const veiculos = veiculosDoLeadNaTela(linhas, carros, lead.veiculo_id);
  if (!veiculos.some((v) => v.principal)) {
    const semLinha = comoOpcao();
    if (semLinha) veiculos.unshift(semLinha);
  }
  return {
    veiculos_disponivel: true,
    veiculos,
    pendencias_de_veiculo: pendenciasAoFechar(veiculos, lead.desfecho).pendentes,
    avisos,
  };
}

const AVISO_DE_RELEITURA =
  "A alteração foi gravada, mas não deu para reler os veículos do lead. Abra o lead de novo para ver como ficou.";

/**
 * Depois de gravar: as opções relidas, na forma da tela. A gravação já valeu;
 * se a releitura falhar, a resposta diz que gravou e avisa (como
 * `relerDepoisDeRegistrar`).
 */
export async function relerVeiculosDoLead(
  supabase: ClienteDaSessao,
  leadId: string,
): Promise<{ veiculos: VeiculoDeInteresse[] | null; principal_veiculo_id: number | null; pendencias_de_veiculo: PendenciaDeVeiculo[]; aviso?: string }> {
  const [lido, leitura] = await Promise.all([
    supabase.from("leads").select("id, veiculo_id, interesse, created_at, desfecho").eq("id", leadId).maybeSingle(),
    lerOpcoesDoLead(supabase, leadId),
  ]);
  const lead = lido.data as LeadDosVeiculos | null;
  if (lido.error || !lead || !leitura.disponivel || leitura.erro) {
    console.warn("[Veículos do lead] Gravado, releitura falhou:", lido.error?.message ?? leitura.erro?.message);
    return { veiculos: null, principal_veiculo_id: null, pendencias_de_veiculo: [], aviso: AVISO_DE_RELEITURA };
  }
  const montado = await montarVeiculosDoLead(supabase, lead, leitura, undefined);
  const principal = lead.veiculo_id === null || lead.veiculo_id === undefined ? null : Number(lead.veiculo_id);
  return {
    veiculos: montado.veiculos,
    principal_veiculo_id: principal,
    pendencias_de_veiculo: montado.pendencias_de_veiculo,
    ...(montado.avisos.length > 0 ? { aviso: montado.avisos.join(" ") } : {}),
  };
}

// ---------------------------------------------------------------------------
// Gravar
// ---------------------------------------------------------------------------

/** `etapa`: onde parou. `principal` = as opções foram gravadas e `leads.veiculo_id` não. */
type Falha = { ok: false; resposta: NextResponse; etapa: "opcao" | "principal" };
type Resultado<T = object> = ({ ok: true } & T) | Falha;

const falha = (resposta: NextResponse, etapa: Falha["etapa"] = "opcao"): Falha => ({ ok: false, resposta, etapa });

/**
 * Aponta `leads.veiculo_id` (o veículo PRINCIPAL) para um carro, ou para
 * nenhum. Com o escopo na escrita, como toda gravação em `leads`: se o lead
 * mudou de dono desde a guarda, não alcança linha nenhuma.
 */
export async function definirPrincipal(
  supabase: ClienteDaSessao,
  visao: VisaoDeLeads,
  leadId: string,
  veiculoId: number | null,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { data, error } = await comEscopoDeLeads(
    supabase.from("leads").update({ veiculo_id: veiculoId }).eq("id", leadId),
    visao,
  ).select("id, veiculo_id");
  if (error) return { ok: false, erro: error.message };
  if ((data ?? []).length === 0) return { ok: false, erro: "o lead não foi alcançado" };
  return { ok: true };
}

const principalNaoAtualizado = (oQueFicou: string, detalhe: string): NextResponse => {
  console.warn("[Veículos do lead] Principal não atualizado:", detalhe);
  return NextResponse.json(
    {
      error: `${oQueFicou}, mas não deu para atualizar o carro principal do lead. Tente de novo.`,
      codigo: "principal_nao_atualizado",
    },
    { status: 500 },
  );
};

/**
 * Adiciona um carro às opções do lead e, se for o caso, o torna o principal.
 * É o caminho do `POST …/veiculos` e do `veiculo_id` no `PATCH …/dados`.
 *
 *   · o carro vira o principal quando o pedido manda (`principal`) ou quando
 *     o lead não tem principal válido: sem `veiculo_id`, ou com o principal
 *     num carro já descartado (`semPrincipalValido`);
 *   · carro que já é opção: com `principal`, só troca o principal; sem, 409
 *     `veiculo_repetido`;
 *   · com outro carro ESCOLHIDO, o principal não muda por aqui (o escolhido é
 *     o principal): 409 `principal_ja_escolhido` se foi pedido.
 *
 * Quem valida que o carro existe é o gatilho da tabela, na inclusão.
 */
export async function adicionarVeiculoAoLead(
  supabase: ClienteDaSessao,
  visao: VisaoDeLeads,
  lead: { id: string; veiculo_id?: number | string | null },
  pedido: { veiculo_id: number; principal: boolean },
  linhas: readonly LinhaDaOpcao[],
  /** `apontarPrincipal: false`: quem chama grava `leads.veiculo_id` no próprio `update`. */
  opcoes: { apontarPrincipal?: boolean } = {},
): Promise<Resultado<{ criada: boolean; opcao: string }>> {
  const igual = (l: LinhaDaOpcao) => String(l.veiculo_id) === String(pedido.veiculo_id);
  const existente = linhas.find(igual) ?? null;
  const outroEscolhido = linhas.some((l) => l.situacao === "escolhido" && !igual(l));
  const semPrincipal = semPrincipalValido(linhas, lead.veiculo_id);

  if (existente && !pedido.principal) {
    return falha(
      NextResponse.json(
        { error: "Este carro já está entre as opções do lead.", codigo: "veiculo_repetido", opcao: existente.id },
        { status: 409 },
      ),
    );
  }
  if (pedido.principal && outroEscolhido) {
    return falha(
      NextResponse.json(
        { error: "O principal é o carro escolhido. Para trocar, escolha o outro carro.", codigo: "principal_ja_escolhido" },
        { status: 409 },
      ),
    );
  }
  if (pedido.principal && existente?.situacao === "descartado") {
    return falha(
      NextResponse.json(
        { error: "Carro descartado não é o principal. Reabra a opção antes.", codigo: "principal_descartado" },
        { status: 400 },
      ),
    );
  }

  let opcao = existente?.id ?? null;
  if (!existente) {
    // `veiculo_rotulo` e `veiculo_preco` não vão: o gatilho copia do estoque.
    const { data, error } = await supabase
      .from("leads_veiculos")
      .insert({ lead_id: lead.id, veiculo_id: pedido.veiculo_id })
      .select(COLUNAS_DA_OPCAO)
      .single();
    if (error) return falha(respostaDoErroDeVeiculos(error));
    opcao = (data as unknown as LinhaDaOpcao | null)?.id ?? null;
  }

  const tornarPrincipal = pedido.principal || (semPrincipal && !outroEscolhido);
  if (
    opcoes.apontarPrincipal !== false &&
    tornarPrincipal &&
    String(lead.veiculo_id ?? "") !== String(pedido.veiculo_id)
  ) {
    const feito = await definirPrincipal(supabase, visao, lead.id, pedido.veiculo_id);
    if (!feito.ok) {
      return falha(
        principalNaoAtualizado(existente ? "O carro já era uma opção" : "O carro foi adicionado", feito.erro),
        "principal",
      );
    }
  }
  return { ok: true, criada: !existente, opcao: opcao ?? "" };
}

/**
 * Grava os passos de um plano (`planejarResolucoes`), na ordem, e depois o
 * principal. Cada `update` leva o `lead_id` além do id da opção: o id de uma
 * opção de OUTRO lead não alcança linha nenhuma, mesmo com a RLS aberta.
 *
 * Passo que falha interrompe: a resposta leva `gravadas` (as opções que já
 * mudaram) e, se a reabertura implícita do escolhido anterior tinha sido
 * feita, ela é desfeita antes de responder.
 */
export async function executarPlano(
  supabase: ClienteDaSessao,
  visao: VisaoDeLeads,
  leadId: string,
  plano: { passos: readonly PassoDoPlano[]; principal: number | null | undefined },
): Promise<Resultado> {
  const gravadas: string[] = [];
  const reabertas: string[] = [];

  const desfazerReaberturas = async () => {
    for (const opcao of reabertas) {
      const { error } = await supabase
        .from("leads_veiculos")
        .update({ situacao: "escolhido", motivo_descarte: null })
        .eq("id", opcao)
        .eq("lead_id", leadId);
      if (error) console.warn("[Veículos do lead] Reabertura não desfeita:", error.message);
      else gravadas.splice(gravadas.indexOf(opcao), 1);
    }
  };

  for (const passo of plano.passos) {
    const { data, error } = await supabase
      .from("leads_veiculos")
      .update(passo.campos)
      .eq("id", passo.opcao)
      .eq("lead_id", leadId)
      .select("id");
    if (error || (data ?? []).length === 0) {
      await desfazerReaberturas();
      if (error) return falha(respostaDoErroDeVeiculos(error, { opcao: passo.opcao, gravadas }));
      return falha(
        NextResponse.json(
          { error: "Opção não encontrada neste lead.", codigo: "opcao_nao_encontrada", opcao: passo.opcao, gravadas },
          { status: 404 },
        ),
      );
    }
    gravadas.push(passo.opcao);
    if (passo.implicito) reabertas.push(passo.opcao);
  }

  if (plano.principal !== undefined) {
    const feito = await definirPrincipal(supabase, visao, leadId, plano.principal);
    if (!feito.ok) return falha(principalNaoAtualizado("A opção foi gravada", feito.erro), "principal");
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// O fechamento como ganho
// ---------------------------------------------------------------------------

export const AVISO_DE_ESCOLHA_NAO_FEITA =
  "O negócio foi fechado, mas não deu para marcar o carro do lead como escolhido. Abra o lead e marque o carro escolhido.";
export const AVISO_DE_PRINCIPAL_NAO_ATUALIZADO =
  "O carro foi marcado como escolhido, mas não deu para atualizar o carro principal do lead. Abra o lead e confira o carro principal.";

export interface VeiculosDepoisDoDesfecho {
  veiculo_escolhido: string | null;
  pendencias_de_veiculo: PendenciaDeVeiculo[];
  /** A escolha automática cabia e não foi feita (ou ficou pela metade). */
  aviso?: string;
}

/**
 * Depois de um lead ser fechado (`PATCH /api/leads/gerenciar`): se foi GANHO e
 * o lead tem UM carro ao todo, ainda em avaliação, ele vira o escolhido.
 * Devolve também o que ficou por resolver, para a tela oferecer o lote.
 *
 * "Um carro ao todo" conta o que a tela mostra: as linhas de `leads_veiculos`
 * mais o principal sem linha (`opcaoQueOGanhoEscolhe`). Com dois carros, quem
 * diz qual foi comprado é o vendedor.
 *
 * Nunca lança e nunca recusa: o desfecho já foi gravado, e os veículos não o
 * bloqueiam nesta versão. Tabela ausente é silêncio. Mas a escolha que CABIA e
 * falhou não fica só no log: volta em `aviso`, e a opção segue como pendência,
 * para o vendedor saber que o carro escolhido não foi marcado.
 */
export async function veiculosDepoisDoDesfecho(
  supabase: ClienteDaSessao,
  visao: VisaoDeLeads,
  leadId: string,
  desfecho: string,
): Promise<VeiculosDepoisDoDesfecho> {
  const nada: VeiculosDepoisDoDesfecho = { veiculo_escolhido: null, pendencias_de_veiculo: [] };
  try {
    const leitura = await lerOpcoesDoLead(supabase, leadId);
    if (!leitura.disponivel) return nada;
    if (leitura.erro) {
      console.warn("[Veículos do lead] Opções ilegíveis depois do desfecho:", leitura.erro.message);
      return nada;
    }
    let linhas = leitura.linhas;
    if (!Array.isArray(linhas) || linhas.length === 0) return nada;

    let escolhida: string | null = null;
    let aviso: string | undefined;
    // O principal só importa para o ganho de um lead com UMA linha em
    // avaliação: é quando falta saber se há um segundo carro, sem linha.
    const candidata = desfecho === "ganho" && opcaoQueOGanhoEscolhe(linhas, null) !== null;
    let principal: number | string | null | undefined;
    if (candidata) {
      const lido = await supabase.from("leads").select("veiculo_id").eq("id", leadId).maybeSingle();
      if (lido.error || !lido.data) {
        console.warn("[Veículos do lead] Lead ilegível depois do desfecho:", lido.error?.message);
        aviso = AVISO_DE_ESCOLHA_NAO_FEITA;
      } else {
        principal = (lido.data as { veiculo_id?: number | string | null }).veiculo_id ?? null;
        const sozinha = opcaoQueOGanhoEscolhe(linhas, principal);
        const plano = sozinha
          ? planejarResolucoes(linhas, principal, [{ opcao: sozinha, campos: { situacao: "escolhido", motivo_descarte: null } }])
          : null;
        if (sozinha && plano?.ok) {
          const feito = await executarPlano(supabase, visao, leadId, plano);
          if (feito.ok || feito.etapa === "principal") {
            escolhida = sozinha;
            linhas = linhas.map((l) => (l.id === sozinha ? { ...l, situacao: "escolhido" } : l));
          }
          if (!feito.ok) {
            console.warn("[Veículos do lead] O ganho não escolheu por inteiro o carro único do lead", leadId, feito.etapa);
            aviso = feito.etapa === "principal" ? AVISO_DE_PRINCIPAL_NAO_ATUALIZADO : AVISO_DE_ESCOLHA_NAO_FEITA;
          }
        } else if (sozinha) {
          aviso = AVISO_DE_ESCOLHA_NAO_FEITA;
        }
      }
    }

    // O que a tela mostra: as linhas e, se houver, o principal sem linha.
    const opcoes = veiculosDoLeadNaTela(linhas, null, principal);
    if (principal !== null && principal !== undefined && !opcoes.some((o) => o.principal)) {
      const semLinha = principalComoOpcao({ veiculo_id: principal }, null, null);
      if (semLinha) opcoes.unshift(semLinha);
    }
    // Com a escolha frustrada, a opção volta a ser pendência como outra qualquer.
    const { pendentes } = pendenciasAoFechar(opcoes, aviso && !escolhida ? null : desfecho);
    return { veiculo_escolhido: escolhida, pendencias_de_veiculo: pendentes, ...(aviso ? { aviso } : {}) };
  } catch (erro) {
    console.warn("[Veículos do lead] Falha depois do desfecho:", (erro as Error)?.message);
    return nada;
  }
}

// ---------------------------------------------------------------------------
// A captura do site
// ---------------------------------------------------------------------------

/**
 * O lead que nasce no site com um carro (`leads.veiculo_id`) ganha a primeira
 * opção em `leads_veiculos`: sem ela, o relatório por veículo só contaria os
 * leads em que alguém da equipe mexeu nos carros.
 *
 * Vai com o cliente de quem chama (a captura usa a chave de serviço): sem
 * sessão o gatilho não carimba autor (`adicionado_por` nulo = sistema).
 *
 * Só `lead_id` e `veiculo_id` são gravados. O RÓTULO NUNCA vem do pedido: é
 * texto de visitante anônimo, e iria parar no relatório que se mostra ao dono
 * do carro. Quem escreve o retrato é o gatilho, do estoque. Se o carro não
 * está no estoque o gatilho não tem o que copiar, o `not null` do rótulo
 * recusa (23502) e a opção simplesmente não nasce: o lead segue com o
 * `veiculo_id` dele, e o detalhe o mostra como principal sem linha.
 *
 * NUNCA lança: tabela ausente (antes da migração) e carro fora do estoque são
 * silêncio; o resto vai ao log. Quem chama NÃO espera por ela
 * (`agendarInteresseDaCaptura`).
 */
export async function registrarInteresseDaCaptura(
  cliente: Pick<ClienteDaSessao, "from">,
  leadId: string | null | undefined,
  veiculoId: unknown,
): Promise<void> {
  try {
    const id = typeof veiculoId === "number" ? veiculoId : Number(veiculoId);
    if (!leadId || !Number.isSafeInteger(id) || id <= 0) return;
    const { error } = await cliente.from("leads_veiculos").insert({ lead_id: leadId, veiculo_id: id });
    if (error && error.code !== "23502" && !ehVeiculosIndisponivel(error)) {
      console.warn("[Leads API] Veículo de interesse não registrado (não bloqueante):", error.message);
    }
  } catch (erro) {
    console.warn("[Leads API] Veículo de interesse não registrado (não bloqueante):", (erro as Error)?.message);
  }
}

/**
 * Agenda `registrarInteresseDaCaptura` para DEPOIS da resposta (`after()` do
 * Next, como em `/api/capi`): o visitante está a caminho do WhatsApp, e a
 * captura não espera um insert que só serve ao relatório.
 *
 * `after()` estoura fora de um escopo de requisição (teste, script, chamada
 * direta do handler). Aí a gravação é disparada solta, sem `await`: a resposta
 * continua não dependendo dela. Nada daqui lança.
 */
export function agendarInteresseDaCaptura(
  cliente: Pick<ClienteDaSessao, "from">,
  leadId: string | null | undefined,
  veiculoId: unknown,
): void {
  const gravar = () => registrarInteresseDaCaptura(cliente, leadId, veiculoId).catch(() => {});
  try {
    after(gravar);
  } catch {
    void gravar();
  }
}
