import { NextResponse } from "next/server";
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
 *   · Leitura que falhou: lista vazia e a frase em `avisos`.
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
    return { veiculos_disponivel: true, veiculos: [], pendencias_de_veiculo: [], avisos };
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

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; resposta: NextResponse };

const falha = (resposta: NextResponse): { ok: false; resposta: NextResponse } => ({ ok: false, resposta });

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
 *     o lead ainda não tem principal;
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
  const semPrincipal = lead.veiculo_id === null || lead.veiculo_id === undefined;

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
      return falha(principalNaoAtualizado(existente ? "O carro já era uma opção" : "O carro foi adicionado", feito.erro));
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
    if (!feito.ok) return falha(principalNaoAtualizado("A opção foi gravada", feito.erro));
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// O fechamento como ganho
// ---------------------------------------------------------------------------

/**
 * Depois de um lead ser fechado (`PATCH /api/leads/gerenciar`): se foi GANHO e
 * o lead tem exatamente uma opção, ainda em avaliação, ela vira a escolhida.
 * Devolve também o que ficou por resolver, para a tela oferecer o lote.
 *
 * Nunca lança e nunca recusa: o desfecho já foi gravado, e os veículos não o
 * bloqueiam nesta versão. Tabela ausente, leitura que falha ou gravação que
 * falha viram "nada escolhido", com a razão no log.
 */
export async function veiculosDepoisDoDesfecho(
  supabase: ClienteDaSessao,
  visao: VisaoDeLeads,
  leadId: string,
  desfecho: string,
): Promise<{ veiculo_escolhido: string | null; pendencias_de_veiculo: PendenciaDeVeiculo[] }> {
  const nada = { veiculo_escolhido: null, pendencias_de_veiculo: [] };
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
    const sozinha = desfecho === "ganho" ? opcaoQueOGanhoEscolhe(linhas) : null;
    if (sozinha) {
      const { data: lead } = await supabase.from("leads").select("veiculo_id").eq("id", leadId).maybeSingle();
      const plano = planejarResolucoes(linhas, (lead as { veiculo_id?: number | null } | null)?.veiculo_id, [
        { opcao: sozinha, campos: { situacao: "escolhido", motivo_descarte: null } },
      ]);
      if (plano.ok) {
        const feito = await executarPlano(supabase, visao, leadId, plano);
        if (feito.ok) {
          escolhida = sozinha;
          linhas = linhas.map((l) => (l.id === sozinha ? { ...l, situacao: "escolhido" } : l));
        } else {
          console.warn("[Veículos do lead] O ganho não escolheu o carro único do lead", leadId);
        }
      }
    }
    const { pendentes } = pendenciasAoFechar(veiculosDoLeadNaTela(linhas, null, null), desfecho);
    return { veiculo_escolhido: escolhida, pendencias_de_veiculo: pendentes };
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
 * sessão o gatilho não carimba autor (`adicionado_por` nulo = sistema) e
 * aceita carro que já saiu do estoque, desde que o rótulo venha. Por isso a
 * segunda tentativa, com o rótulo de reserva, quando a primeira esbarra no
 * `not null` (23502): a mesma queda da carga inicial da migração.
 *
 * NUNCA lança e nunca bloqueia: a captura não pode perder um lead por causa
 * disto. Tabela ausente (antes da migração) é silêncio; o resto vai ao log.
 */
export async function registrarInteresseDaCaptura(
  cliente: Pick<ClienteDaSessao, "from">,
  leadId: string | null | undefined,
  veiculoId: unknown,
  interesse?: string | null,
): Promise<void> {
  try {
    const id = typeof veiculoId === "number" ? veiculoId : Number(veiculoId);
    if (!leadId || !Number.isSafeInteger(id) || id <= 0) return;
    let { error } = await cliente.from("leads_veiculos").insert({ lead_id: leadId, veiculo_id: id });
    if (error?.code === "23502") {
      const reserva = (typeof interesse === "string" ? interesse.trim().slice(0, 200) : "") || `Veículo nº ${id}`;
      ({ error } = await cliente.from("leads_veiculos").insert({ lead_id: leadId, veiculo_id: id, veiculo_rotulo: reserva }));
    }
    if (error && !ehVeiculosIndisponivel(error)) {
      console.warn("[Leads API] Veículo de interesse não registrado (não bloqueante):", error.message);
    }
  } catch (erro) {
    console.warn("[Leads API] Veículo de interesse não registrado (não bloqueante):", (erro as Error)?.message);
  }
}
