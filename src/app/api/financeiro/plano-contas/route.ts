import { NextResponse } from "next/server";
import { PLANO_DE_CONTAS_REVENDA } from "@/lib/planoContasData";

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      planoDeContas: PLANO_DE_CONTAS_REVENDA,
      total: PLANO_DE_CONTAS_REVENDA.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao carregar Plano de Contas" },
      { status: 500 }
    );
  }
}
