import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { matchVehicles } from "../../../lib/car-match";
import { logCarMatchQueried, logApiTelemetry } from "../../../lib/telemetry";

export const dynamic = "force-dynamic";

/**
 * GET Handler for Car Matching
 * Processes matching queries from incoming URL search parameters (tags and budget).
 * Targets the live `veiculos` database table (mapped to the frontend schema).
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
    
    // 3. Query inventory (from live 'veiculos' table mapped in supabase.ts)
    const matched = await matchVehicles({ tags, budget });
    
    // 4. Return top 3 premium recommendations
    const top3 = matched.slice(0, 3);
    
    // 5. Extract agUid from cookies or query parameters
    const cookieStore = await cookies();
    const agUid = request.nextUrl.searchParams.get("ag_uid") || cookieStore.get("ag_uid")?.value || "ag_ref_nao_localizado";

    // 6. Invoke Telemetry Hook
    logCarMatchQueried({
      tags,
      maxBudget: budget,
      resultsCount: top3.length,
      matchedVehicles: top3.map((v) => `${v.marca} ${v.modelo} (ID: ${v.id})`),
      agUid,
    });
    
    return sendResponse(
      NextResponse.json({
        success: true,
        filters: { tags, budget },
        count: top3.length,
        recommendations: top3,
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
 * Targets the live `veiculos` database table (mapped to the frontend schema).
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
    
    // 2. Extract and format query filters
    const tags = Array.isArray(requestBody.tags)
      ? requestBody.tags.map((t: any) => String(t).trim()).filter(Boolean)
      : [];
      
    const budget = typeof requestBody.budget === "number" || typeof requestBody.budget === "string"
      ? parseFloat(requestBody.budget as string)
      : undefined;
      
    // 3. Query inventory (from live 'veiculos' table mapped in supabase.ts)
    const matched = await matchVehicles({ tags, budget });
    
    // 4. Return top 3 premium recommendations
    const top3 = matched.slice(0, 3);
    
    // 5. Extract agUid from cookies or request body
    const cookieStore = await cookies();
    const agUid = requestBody.ag_uid || requestBody.agUid || cookieStore.get("ag_uid")?.value || "ag_ref_nao_localizado";

    // 6. Invoke Telemetry Hook
    logCarMatchQueried({
      tags,
      maxBudget: budget,
      resultsCount: top3.length,
      matchedVehicles: top3.map((v) => `${v.marca} ${v.modelo} (ID: ${v.id})`),
      agUid,
    });
    
    return sendResponse(
      NextResponse.json({
        success: true,
        filters: { tags, budget },
        count: top3.length,
        recommendations: top3,
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

