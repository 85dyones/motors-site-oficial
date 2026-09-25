import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { matchVehicles, calculateMatchScore } from "../../../lib/car-match";
import { logCarMatchQueried, logApiTelemetry } from "../../../lib/telemetry";
import { getEstoque } from "../../../lib/supabase";
import { disponiveisDe } from "../../../lib/regrasEstoque";
import {
  criteriosDasRespostas,
  criteriosDoPerfil,
  ITENS_QUE_NAO_PODEM_FALTAR,
  MAXIMO_DO_QUE_NAO_PODE_FALTAR,
  nomeCurto,
  recomendar,
  semFiltro,
  type ChaveDeFiltro,
  type Criterios,
  type ItemQueNaoPodeFaltar,
  type Jeito,
  type Leva,
  type PreferenciaDeCambio,
} from "../../../lib/motorDoMatch";

export const dynamic = "force-dynamic";

/**
 * GET Handler for Car Matching
 * Processes matching queries from incoming URL search parameters (tags and budget).
 * Targets the live `estoque_motors` database table (mapped to the frontend schema).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const searchParamsObj = Object.fromEntries(request.nextUrl.searchParams.entries());

  const sendResponse = (res: NextResponse, errorDetails?: any): NextResponse => {
    const durationMs = Date.now() - startTime;
    logApiTelemetry("GET", "/api/match", durationMs, res.status, searchParamsObj, errorDetails);
    return res;
  };

  try {
    const { searchParams } = request.nextUrl;
    
    // 1. Parse category tags from comma-separated list
    const tagsParam = searchParams.get("tags");
    const tags = tagsParam
      ? tagsParam.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
      
    // 2. Parse maximum budget parameter
    const budgetParam = searchParams.get("budget");
    const budget = budgetParam ? parseFloat(budgetParam) : undefined;
    
    // 3. Query inventory (from live 'estoque_motors' table mapped in supabase.ts)
    const matched = await matchVehicles({ tags, budget });
    
    // 4. Return top 6 premium recommendations
    const top6 = matched.slice(0, 6);
    const matchedVehicles = top6.map(v => ({
      ...v,
      matchScore: calculateMatchScore(v, tags)
    }));
    
    // 5. Extract agUid from cookies or query parameters
    const cookieStore = await cookies();
    const agUid = request.nextUrl.searchParams.get("ag_uid") || cookieStore.get("ag_uid")?.value || "ag_ref_nao_localizado";

    // 6. Invoke Telemetry Hook
    logCarMatchQueried({
      tags,
      maxBudget: budget,
      resultsCount: top6.length,
      matchedVehicles: top6.map((v) => `${v.marca} ${v.modelo} (ID: ${v.id})`),
      agUid,
    });
    
    return sendResponse(
      NextResponse.json({
        success: true,
        filters: { tags, budget },
        count: top6.length,
        matchedVehicles,
      })
    );
  } catch (error: any) {
    console.error("[API Match GET] Unhandled error captured:", error);
    return sendResponse(
      NextResponse.json(
        { error: "Erro interno no servidor ao processar o matching de carros." },
        { status: 500 }
      ),
      error?.message || error
    );
  }
}

/**
 * POST Handler for Car Matching
 * Processes matching queries from a JSON payload containing tags and budget.
 * Targets the live `estoque_motors` database table (mapped to the frontend schema).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  let requestBody: any = null;

  const sendResponse = (res: NextResponse, errorDetails?: any): NextResponse => {
    const durationMs = Date.now() - startTime;
    logApiTelemetry("POST", "/api/match", durationMs, res.status, requestBody, errorDetails);
    return res;
  };

  try {
    // 1. Safe parsing of incoming payload
    requestBody = await request.json().catch(() => ({}));

    // O Garagem Profiler a partir de 25/09: manda as RESPOSTAS, e o motor de
    // fatos (`lib/motorDoMatch.ts`) decide. Desde a fase 2 elas chegam como
    // `perfil` (as perguntas-fato); `respostas` é o formato da fase 1, que
    // continua valendo para uma aba aberta antes do deploy. O formato antigo,
    // `{tags, budget}`, continua aceito logo abaixo para quem ainda o use.
    const temPerfil = requestBody && typeof requestBody.perfil === "object" && requestBody.perfil !== null;
    const temRespostas = requestBody && typeof requestBody.respostas === "object" && requestBody.respostas !== null;
    if (temPerfil || temRespostas) {
      const criterios = criteriosDoCorpo(requestBody);
      const recomendacao = recomendar(disponiveisDe(await getEstoque()), criterios);

      // Só o id que o próprio corpo trouxe. Sem cair no cookie `ag_uid`: o
      // CarMatch deixa de mandá-lo quando a pessoa recusou o rastreamento, e
      // ler o cookie aqui desfaria a recusa em silêncio.
      const agUid = typeof requestBody.ag_uid === "string" && requestBody.ag_uid ? requestBody.ag_uid : undefined;
      logCarMatchQueried({
        tags: recomendacao.filtros,
        maxBudget: criterios.teto ?? undefined,
        resultsCount: recomendacao.cartoes.length,
        matchedVehicles: recomendacao.cartoes.map((c) => `${nomeCurto(c.veiculo)} (ID: ${c.veiculo.id})`),
        agUid,
      });

      return sendResponse(
        NextResponse.json({
          success: true,
          count: recomendacao.cartoes.length,
          recomendacao,
        }),
      );
    }
    
    // 2. Extract and format query filters
    const tags = Array.isArray(requestBody.tags)
      ? requestBody.tags.map((t: any) => String(t).trim()).filter(Boolean)
      : [];
      
    const budget = typeof requestBody.budget === "number" || typeof requestBody.budget === "string"
      ? parseFloat(requestBody.budget as string)
      : undefined;
      
    // 3. Query inventory (from live 'estoque_motors' table mapped in supabase.ts)
    const matched = await matchVehicles({ tags, budget });
    
    // 4. Return top 6 premium recommendations
    const top6 = matched.slice(0, 6);
    const matchedVehicles = top6.map(v => ({
      ...v,
      matchScore: calculateMatchScore(v, tags)
    }));
    
    // 5. Extract agUid from cookies or request body
    const cookieStore = await cookies();
    const agUid = requestBody.ag_uid || requestBody.agUid || cookieStore.get("ag_uid")?.value || "ag_ref_nao_localizado";

    // 6. Invoke Telemetry Hook
    logCarMatchQueried({
      tags,
      maxBudget: budget,
      resultsCount: top6.length,
      matchedVehicles: top6.map((v) => `${v.marca} ${v.modelo} (ID: ${v.id})`),
      agUid,
    });
    
    return sendResponse(
      NextResponse.json({
        success: true,
        filters: { tags, budget },
        count: top6.length,
        matchedVehicles,
      })
    );
  } catch (error: any) {
    console.error("[API Match POST] Unhandled error captured:", error);
    return sendResponse(
      NextResponse.json(
        { error: "Erro interno no servidor ao processar o matching de carros." },
        { status: 500 }
      ),
      error?.message || error
    );
  }
}


const FILTROS_AFROUXAVEIS: readonly ChaveDeFiltro[] = ["portas", "automatico", "carroceria", "ano", "km", "diesel"];

const LEVAS: readonly Leva[] = ["eu", "familia", "carga"];
const JEITOS: readonly Jeito[] = ["Hatch", "Sedan", "SUV", "Perua"];
const CAMBIOS: readonly PreferenciaDeCambio[] = ["so_automatico", "prefiro_automatico", "tanto_faz", "prefiro_manual"];
const ITENS: readonly ItemQueNaoPodeFaltar[] = ITENS_QUE_NAO_PODEM_FALTAR.map((i) => i.id);

/** O valor, se estiver na lista; senão `null`. `includes`, e nunca `in`. */
function daLista<T extends string>(lista: readonly T[], bruto: unknown): T | null {
  return typeof bruto === "string" && (lista as readonly string[]).includes(bruto) ? (bruto as T) : null;
}

/** Só os valores da lista, sem repetir, até `maximo`. */
function listaDaLista<T extends string>(lista: readonly T[], bruto: unknown, maximo: number): T[] {
  if (!Array.isArray(bruto)) return [];
  return [...new Set(bruto.map((x) => daLista(lista, x)).filter((x): x is T => x !== null))].slice(0, maximo);
}

/** Número finito e não negativo, ou `null`. O corpo vem do navegador. */
function valor(bruto: unknown): number | null {
  const n = typeof bruto === "number" ? bruto : typeof bruto === "string" ? Number(bruto) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Os critérios a partir do corpo, sem confiar nele: resposta fora da lista é
 * ignorada (pelo `switch` de `criteriosDasRespostas` na fase 1, por
 * `daLista` no `perfil` da fase 2), número inválido vira ausência, e só os
 * filtros conhecidos podem ser afrouxados (o "e se"). O teto nunca é
 * afrouxado — decisão do dono em 25/09.
 */
function criteriosDoCorpo(corpo: Record<string, unknown>): Criterios {
  const objeto = (x: unknown): Record<string, unknown> =>
    typeof x === "object" && x !== null ? (x as Record<string, unknown>) : {};
  const r = objeto(corpo.respostas);
  const texto = (x: unknown) => (typeof x === "string" ? x : undefined);
  const orcamento = objeto(corpo.orcamento);
  const max = valor(orcamento.max);
  const teto = max && max > 0 ? max : null;
  // Piso acima do teto só vem de corpo forjado; vira "sem piso", e não uma
  // faixa impossível escrita na tela ("de R$ 100 mil a R$ 50 mil").
  const min = valor(orcamento.min) ?? 0;

  const faixa = { min: teto !== null && min > teto ? 0 : min, max: teto };

  let criterios: Criterios;
  if (typeof corpo.perfil === "object" && corpo.perfil !== null) {
    const p = objeto(corpo.perfil);
    criterios = criteriosDoPerfil({
      orcamento: faixa,
      leva: daLista(LEVAS, p.leva),
      jeitos: listaDaLista(JEITOS, p.jeitos, JEITOS.length),
      cambio: daLista(CAMBIOS, p.cambio),
      naoPodeFaltar: listaDaLista(ITENS, p.naoPodeFaltar, MAXIMO_DO_QUE_NAO_PODE_FALTAR),
    });
  } else {
    criterios = criteriosDasRespostas({
      orcamento: faixa,
      objetivo: texto(r.objetivo),
      experiencia: texto(r.experiencia),
      estilo: texto(r.estilo),
    });
  }

  const afrouxar = Array.isArray(corpo.afrouxar) ? corpo.afrouxar : [];
  for (const chave of FILTROS_AFROUXAVEIS) {
    if (afrouxar.includes(chave)) criterios = semFiltro(criterios, chave);
  }
  return criterios;
}
